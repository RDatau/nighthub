const { app, BrowserWindow, session, ipcMain, dialog, net, nativeTheme, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// --- GLOBAL UNCAUGHT EXCEPTION & REJECTION HANDLERS ---
// Prevents Undici TLS socket parser bugs (e.g. assert(!this.paused)), connection resets,
// and background streaming drops from popping up fatal dialogs in Electron main process.
process.on('uncaughtException', (err) => {
  const errStr = (err && (err.stack || err.message || String(err))) || '';
  if (
    errStr.includes('assert(!this.paused)') ||
    errStr.includes('undici') ||
    errStr.includes('ECONNRESET') ||
    errStr.includes('EPIPE') ||
    errStr.includes('ETIMEDOUT') ||
    errStr.includes('ERR_STREAM_PREMATURE_CLOSE') ||
    errStr.includes('Socket closed')
  ) {
    console.warn('[ELECTRON BACKGROUND NETWORK EXCEPTION SUPPRESSED]:', errStr);
    return;
  }
  console.error('[ELECTRON UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  const reasonStr = (reason && (reason.stack || reason.message || String(reason))) || '';
  if (
    reasonStr.includes('assert(!this.paused)') ||
    reasonStr.includes('undici') ||
    reasonStr.includes('ECONNRESET') ||
    reasonStr.includes('EPIPE') ||
    reasonStr.includes('ETIMEDOUT')
  ) {
    console.warn('[ELECTRON BACKGROUND REJECTION SUPPRESSED]:', reasonStr);
    return;
  }
  console.warn('[ELECTRON UNHANDLED REJECTION]:', reason);
});

// --- UTILITY PROCESS FOR BACKGROUND TASKS ---
let backgroundWorker = null;

function startBackgroundWorker() {
  if (backgroundWorker) return;
  try {
    backgroundWorker = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [], {
      stdio: 'inherit'
    });
    backgroundWorker.on('spawn', () => logStream('[UTILITY] Background worker spawned and ready.'));
    backgroundWorker.on('exit', (code) => {
      logStream(`[UTILITY] Background worker exited with code ${code}`);
      backgroundWorker = null;
    });
  } catch (e) {
    logStream(`[UTILITY ERROR] Failed to spawn worker: ${e.message}`);
  }
}

function stopBackgroundWorker() {
  if (backgroundWorker) {
    try {
      backgroundWorker.kill();
    } catch (e) {}
    backgroundWorker = null;
  }
}

// --- PERFORMANCE OPTIMIZATION: V8 CODE CACHE ---
// Optimizing startup speed using code cache.
app.commandLine.appendSwitch('no-sandbox'); // Required for some utility features
app.commandLine.appendSwitch('use-v8-context-snapshot');

// Disable autoplay policy to allow programmatic playback via IPC
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-quic'); // Prevent ERR_QUIC_PROTOCOL_ERROR in net.fetch

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const pathname = u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
    return `${u.protocol}//${u.hostname}${pathname}`;
  } catch (e) {
    return rawUrl;
  }
}

function isLikelyDownloadUrl(urlString) {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname.toLowerCase();
    
    // Check direct file extensions that are typically downloads or media files
    const downloadExts = [
      '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m3u8',
      '.mp3', '.wav', '.m4a', '.aac',
      '.zip', '.rar', '.7z', '.tar', '.gz',
      '.exe', '.dmg', '.pkg', '.apk', '.pdf', '.docx', '.xlsx', '.pptx'
    ];
    
    if (downloadExts.some(ext => pathname.endsWith(ext))) {
      return true;
    }
    
    // Check common download headers/query parameters in URLs
    if (parsed.searchParams.has('dload') || 
        parsed.searchParams.has('download') || 
        parsed.searchParams.has('attachment')) {
      return true;
    }
  } catch (e) {
    // Ignore invalid URLs
  }
  return false;
}

function pauseAllVideos(win) {
  if (!win || !win.snifferViews) return;
  for (const [id, view] of win.snifferViews.entries()) {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      logStream(`[PAUSE VIDEO] Pausing playback in tab ${id} due to switching away`);
      view.webContents.executeJavaScript(`
        (function() {
          try {
            const videos = document.querySelectorAll('video');
            videos.forEach(v => { if (!v.paused) v.pause(); });
            const audios = document.querySelectorAll('audio');
            audios.forEach(a => { if (!a.paused) a.pause(); });
          } catch(e) {}
        })();
      `).catch(() => {});
    }
  }
}

const { Readable } = require('stream');
const { finished } = require('stream/promises');
const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

// --- LOCAL CACHING PROXY SERVER ---
let proxyPort = 0;
const proxyApp = express();
const streamCache = new Map();

// Helper to rewrite all segment URLs and sub-playlists inside .m3u8 files to route through the local proxy.
function rewriteM3U8(content, baseUrl, referer, proxyBaseUrl) {
  const lines = content.split(/\r?\n/);
  const rewrittenLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Jika baris komentar atau tag m3u8
    if (trimmed.startsWith('#')) {
      // Ganti URI="..." di dalam tag seperti #EXT-X-KEY atau #EXT-X-MAP supaya kunci/init segmennya juga lewat proxy
      return trimmed.replace(/(URI\s*=\s*")([^"]+)(")/gi, (match, p1, p2, p3) => {
        try {
          const resolvedUrl = new URL(p2, baseUrl).toString();
          const proxiedUrl = `${proxyBaseUrl}?url=${encodeURIComponent(resolvedUrl)}&referer=${encodeURIComponent(referer || '')}`;
          return `${p1}${proxiedUrl}${p3}`;
        } catch (e) {
          return match;
        }
      });
    }

    // Jika baris adalah URL atau path segment/playlist
    try {
      const resolvedUrl = new URL(trimmed, baseUrl).toString();
      const proxiedUrl = `${proxyBaseUrl}?url=${encodeURIComponent(resolvedUrl)}&referer=${encodeURIComponent(referer || '')}`;
      return proxiedUrl;
    } catch (e) {
      return line;
    }
  });

  return rewrittenLines.join('\n');
}

// --- PROXY STREAMING ON-THE-FLY ---
// Uses native Node.js HTTP/HTTPS to ensure the proxy is completely transparent without auto-decompression,
// preventing byte mismatches and playback freezes. Guaranteed to run smoothly and reliably.
proxyApp.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  const referer = req.query.referer || '';
  
  if (!targetUrl) return res.status(400).send('Missing URL');

  // Buat atau dapatkan objek info progress untuk dikirim ke UI
  if (!streamCache.has(targetUrl)) {
    streamCache.set(targetUrl, {
      downloadedBytes: 0,
      totalBytes: 0,
      status: 'downloading'
    });
  }
  const cacheInfo = streamCache.get(targetUrl);

  let currentUrl = targetUrl;
  let redirectCount = 0;
  const maxRedirects = 5;

  while (redirectCount < maxRedirects) {
    try {
      const urlObj = new URL(currentUrl);
      const client = urlObj.protocol === 'https:' ? require('https') : require('http');

      // Ambil cookie dari session Electron
      const { session } = require('electron');
      const cookiesUrl = await session.defaultSession.cookies.get({ url: currentUrl });
      const cookiesRef = referer ? await session.defaultSession.cookies.get({ url: referer }) : [];
      const allCookies = [...cookiesUrl, ...cookiesRef];
      const uniqueCookies = Array.from(new Map(allCookies.map(c => [c.name, c])).values());
      let cookiesStr = '';
      if (uniqueCookies.length > 0) {
        cookiesStr = uniqueCookies.map(c => `${c.name}=${c.value}`).join('; ');
      }

      let spoofedReferer = referer;
      if (!spoofedReferer) {
        try {
          const hostnameParts = urlObj.hostname.split('.');
          let rootDomain = urlObj.hostname;
          if (hostnameParts.length >= 2) {
             rootDomain = hostnameParts.slice(-2).join('.');
          }
          spoofedReferer = `https://www.${rootDomain}/`;
        } catch (e) {}
      }

      const chromeMatch = app.userAgentFallback.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
      const chromeVersion = chromeMatch ? chromeMatch[1] : '116.0.0.0';
      const mobileUA = `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
      const desktopUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;

      const headers = {
        'User-Agent': snifferIsMobile ? mobileUA : desktopUA,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Accept-Encoding': 'identity', // Request raw uncompressed data to easily read and rewrite the .m3u8 playlist.
        ...(spoofedReferer && { 'Referer': spoofedReferer }),
        ...(cookiesStr && { 'Cookie': cookiesStr })
      };

      if (spoofedReferer) {
        try {
          const refUrl = new URL(spoofedReferer);
          headers['Origin'] = refUrl.origin;
        } catch (e) {}
      }

      if (snifferIsMobile) {
        headers['sec-ch-ua-mobile'] = '?1';
        headers['sec-ch-ua-platform'] = '"Android"';
      }

      // Forward range request from the browser to the target server.
      if (req.headers.range) {
        headers['Range'] = req.headers.range;
      }

      const promise = new Promise((resolve, reject) => {
        const proxyReq = client.request(currentUrl, {
          method: 'GET',
          headers: headers,
          rejectUnauthorized: false
        }, (proxyRes) => {
          // Handle pengalihan (Redirect) otomatis biar link dinamis tetep dapet
          if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
            const nextUrl = new URL(proxyRes.headers.location, currentUrl).toString();
            resolve({ isRedirect: true, nextUrl });
            return;
          }

          const contentType = (proxyRes.headers['content-type'] || '').toLowerCase();
          const isM3U8 = currentUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegurl');

          // Kirim status code & header asli dari server ke client tanpa modifikasi aneh-aneh!
          res.status(proxyRes.statusCode);
          Object.keys(proxyRes.headers).forEach((key) => {
            if (['connection', 'keep-alive'].includes(key.toLowerCase())) return;
            // If this is an HLS playlist (.m3u8), do not forward the original content-encoding or content-length headers since we rewrite the contents.
            if (isM3U8 && ['content-encoding', 'content-length'].includes(key.toLowerCase())) return;
            res.setHeader(key, proxyRes.headers[key]);
          });
          res.setHeader('Access-Control-Allow-Origin', '*');

          // Set up progress tracking to keep the OSD updated during buffering.
          let startPos = 0;
          if (req.headers.range) {
            const parts = req.headers.range.replace(/bytes=/, "").split("-");
            startPos = parseInt(parts[0], 10) || 0;
          }
          cacheInfo.downloadedBytes = startPos;
          cacheInfo.status = 'downloading';

          if (isM3U8) {
            // Buffer the entire .m3u8 playlist content to dynamically rewrite its segments.
            let chunks = [];
            proxyRes.on('data', (chunk) => {
              chunks.push(chunk);
            });
            proxyRes.on('end', () => {
              const fullBuffer = Buffer.concat(chunks);
              const originalText = fullBuffer.toString('utf8');
              const rewrittenText = rewriteM3U8(originalText, currentUrl, referer, `http://127.0.0.1:${proxyPort}/proxy`);
              const outputBuffer = Buffer.from(rewrittenText, 'utf8');

              res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
              res.setHeader('Content-Length', outputBuffer.length);
              res.end(outputBuffer);
              cacheInfo.status = 'completed';
              resolve({ isRedirect: false });
            });
            proxyRes.on('error', (err) => {
              cacheInfo.status = 'error';
              reject(err);
            });
            return;
          }

          const contentLength = proxyRes.headers['content-length'];
          if (contentLength) {
            const parsedLength = parseInt(contentLength, 10);
            const contentRange = proxyRes.headers['content-range'];
            if (contentRange) {
              const totalParts = contentRange.split('/');
              if (totalParts.length > 1) {
                cacheInfo.totalBytes = parseInt(totalParts[1], 10) || parsedLength;
              } else {
                cacheInfo.totalBytes = parsedLength;
              }
            } else {
              cacheInfo.totalBytes = parsedLength;
            }
          }

          proxyRes.on('data', (chunk) => {
            cacheInfo.downloadedBytes += chunk.length;
            if (cacheInfo.totalBytes && cacheInfo.downloadedBytes >= cacheInfo.totalBytes) {
              cacheInfo.status = 'completed';
            }
          });

          proxyRes.on('end', () => {
            cacheInfo.status = 'completed';
          });

          proxyRes.on('error', () => {
            cacheInfo.status = 'error';
          });

          // Pipe data langsung ke browser
          proxyRes.pipe(res);
          resolve({ isRedirect: false });
        });

        proxyReq.on('error', (err) => {
          reject(err);
        });

        req.on('close', () => {
          // Close upstream connection if user seeks or closes the video to save bandwidth.
          proxyReq.destroy();
          reject(new Error('Client aborted the request'));
        });

        proxyReq.end();
      });

      const result = await promise;
      if (result.isRedirect) {
        currentUrl = result.nextUrl;
        redirectCount++;
      } else {
        return;
      }
    } catch (err) {
      logStream(`[PROXY ERROR] Direct proxy streaming failed: ${err.message}`);
      cacheInfo.status = 'error';
      if (!res.headersSent) {
        res.status(500).send(`Proxy error: ${err.message}`);
      }
      return;
    }
  }

  if (redirectCount >= maxRedirects) {
    logStream(`[PROXY ERROR] Too many redirects for url: ${targetUrl}`);
    if (!res.headersSent) {
      res.status(500).send('Too many redirects');
    }
  }
});

const proxyServer = http.createServer(proxyApp);
proxyServer.listen(0, '127.0.0.1', () => {
  proxyPort = proxyServer.address().port;
  console.log(`[PROXY] Local caching proxy started on port ${proxyPort}`);
});

// --- LOCAL AI API SERVER (FOR GEMINI / TTS / LIVE COMMENT IN ELECTRON PACKAGED EXE) ---
const { GoogleGenAI, Modality } = require('@google/genai');

const aiSafetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

function parseGeminiApiKeys(input) {
  const keys = [];
  if (input && typeof input === 'string') {
    const parsed = input
      .split(/[\r\n,;\s]+/)
      .map(k => k.trim()
        .replace(/^(?:GEMINI_API_KEY|API_KEY|KEY)\s*[:=]\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .trim()
      )
      .filter(k => k.length > 10);
    keys.push(...parsed);
  }
  if (process.env.GEMINI_API_KEY) {
    const envKeys = process.env.GEMINI_API_KEY
      .split(/[\r\n,;\s]+/)
      .map(k => k.trim().replace(/^["']|["']$/g, '').trim())
      .filter(k => k.length > 10);
    keys.push(...envKeys);
  }
  const uniqueKeys = [];
  for (const k of keys) {
    if (!uniqueKeys.includes(k)) {
      uniqueKeys.push(k);
    }
  }
  return uniqueKeys;
}

let currentGeminiKeyIndex = 0;
const exhaustedGeminiKeysMap = new Map();
const GEMINI_KEY_COOLDOWN_MS = 60 * 1000;

function markGeminiKeyExhausted(key) {
  if (key) {
    exhaustedGeminiKeysMap.set(key, Date.now());
  }
}

function getNextAvailableGeminiKey(keys) {
  if (!keys || keys.length === 0) return null;
  const now = Date.now();
  for (const [key, timestamp] of exhaustedGeminiKeysMap.entries()) {
    if (now - timestamp > GEMINI_KEY_COOLDOWN_MS) {
      exhaustedGeminiKeysMap.delete(key);
    }
  }
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentGeminiKeyIndex + i) % keys.length;
    const candidate = keys[idx];
    if (!exhaustedGeminiKeysMap.has(candidate)) {
      currentGeminiKeyIndex = idx;
      return { key: candidate, index: idx };
    }
  }
  let oldestKey = keys[currentGeminiKeyIndex % keys.length];
  let oldestTime = Infinity;
  for (let i = 0; i < keys.length; i++) {
    const candidate = keys[i];
    const time = exhaustedGeminiKeysMap.get(candidate) || 0;
    if (time < oldestTime) {
      oldestTime = time;
      oldestKey = candidate;
      currentGeminiKeyIndex = i;
    }
  }
  return { key: oldestKey, index: currentGeminiKeyIndex };
}

function rotateGeminiKey(keys) {
  if (!keys || keys.length === 0) return null;
  currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % keys.length;
  return keys[currentGeminiKeyIndex];
}

async function executeWithKeyRotation(customKeyInput, operation, options = {}) {
  const allKeys = parseGeminiApiKeys(customKeyInput);
  if (allKeys.length === 0) {
    throw new Error("Tidak ada Gemini API Key yang valid ditemukan.");
  }
  const opName = options.operationName || "Gemini-Operation";
  const totalAttempts = allKeys.length > 1 ? allKeys.length : (options.maxRetries ?? 2) + 1;
  let lastError = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const keyObj = getNextAvailableGeminiKey(allKeys);
    const activeKey = keyObj?.key || allKeys[0];
    const keyIndex = keyObj?.index ?? 0;

    const ai = new GoogleGenAI({
      apiKey: activeKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    try {
      return await operation(ai, activeKey, keyIndex, allKeys.length);
    } catch (error) {
      lastError = error;
      const errorMsg = (error.message || "").toLowerCase();
      const status = error.status || error.code;
      const isQuotaError = errorMsg.includes("429") || errorMsg.includes("resource_exhausted") || errorMsg.includes("quota") || status === "RESOURCE_EXHAUSTED" || status === 429;
      const isKeyInvalid = errorMsg.includes("api_key_invalid") || errorMsg.includes("not valid") || status === 403;
      const isConnectionError = errorMsg.includes("fetch failed") || errorMsg.includes("network") || errorMsg.includes("econnreset") || status === 500 || status === 503;

      if ((isQuotaError || isKeyInvalid || isConnectionError) && allKeys.length > 1 && attempt < totalAttempts - 1) {
        markGeminiKeyExhausted(activeKey);
        rotateGeminiKey(allKeys);
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function getElectronGenAI(customKey) {
  const keys = parseGeminiApiKeys(customKey);
  const keyToUse = keys[0] || process.env.GEMINI_API_KEY || '';
  if (!keyToUse) {
    throw new Error('GEMINI_API_KEY environment variable is missing and no custom key was provided.');
  }
  return new GoogleGenAI({
    apiKey: keyToUse,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const aiApiApp = express();
aiApiApp.use(express.json({ limit: '25mb' }));

// Enable CORS for file://, nighthub:// and localhost
aiApiApp.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 1. Verify Key Endpoint
aiApiApp.post('/api/ai/verify-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    const ai = getElectronGenAI(apiKey);
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [{ parts: [{ text: 'ping' }] }],
      config: {
        safetySettings: aiSafetySettings,
      },
    });
    if (response.text) {
      res.json({ success: true, message: 'Gemini API Key valid!' });
    } else {
      res.status(400).json({ success: false, error: 'Respons kosong dari Gemini API.' });
    }
  } catch (error) {
    console.error('Error verifying Gemini API key in Electron:', error);
    res.status(400).json({ success: false, error: error.message || 'API Key tidak valid atau kuota habis.' });
  }
});

// 2. TTS Endpoint
aiApiApp.post('/api/ai/tts', async (req, res) => {
  try {
    const { text, apiKey, ttsModel = 'gemini-3.1-flash-tts-preview', voice = 'Kore' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Text is required for TTS.' });
    }

    const ai = getElectronGenAI(apiKey);
    let audioBase64 = null;
    let mimeType = 'audio/pcm';

    const cleanText = text.replace(/[*#_~`]/g, '').slice(0, 500).trim();
    const voiceName = voice || 'Kore';
    const primaryModel = (ttsModel && ttsModel.includes('gemini')) ? ttsModel : 'gemini-3.1-flash-tts-preview';

    try {
      const speechResponse = await ai.models.generateContent({
        model: primaryModel,
        contents: [{ parts: [{ text: `Speak this text: "${cleanText}".` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          safetySettings: aiSafetySettings,
        },
      });

      const part = speechResponse.candidates?.[0]?.content?.parts?.[0];
      audioBase64 = part?.inlineData?.data || null;
      mimeType = part?.inlineData?.mimeType || 'audio/pcm';
    } catch (primaryErr) {
      console.warn('Primary TTS endpoint warning, trying gemini-2.5-flash fallback:', primaryErr);
      try {
        const fallbackResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ parts: [{ text: `Speak this text: "${cleanText}".` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            safetySettings: aiSafetySettings,
          },
        });
        const part = fallbackResponse.candidates?.[0]?.content?.parts?.[0];
        audioBase64 = part?.inlineData?.data || null;
        mimeType = part?.inlineData?.mimeType || 'audio/pcm';
      } catch (fbErr) {
        console.error('Fallback TTS generation failed:', fbErr);
      }
    }

    if (audioBase64) {
      res.json({ success: true, audio: audioBase64, mimeType });
    } else {
      res.status(500).json({ success: false, error: 'Gagal menghasilkan audio TTS Suara AI.' });
    }
  } catch (err) {
    console.error('Error generating TTS in Electron:', err);
    res.status(500).json({ success: false, error: err.message || 'Gagal memproses TTS.' });
  }
});

// 3. Live Comment Endpoint
aiApiApp.post('/api/ai/live-comment', async (req, res) => {
  try {
    const {
      prompt,
      videoTitle,
      currentTime,
      duration,
      subtitles,
      frameImage,
      aiCustomPersona,
      aiLanguageStyle,
      voiceEnabled = false,
      chatHistory = [],
      apiKey,
      lang = 'id',
      aiResponseLanguage,
      chatModel = 'gemini-3.6-flash',
      liveModel = 'gemini-2.5-flash',
      ttsModel,
      aiTtsModel,
      mode = 'chat',
      voice = 'Kore',
      temperature = 0.85,
      mediaResolution = 'low',
      safetySettings: userSafetySetting = 'block_none',
      thinkingLevel = 'off',
      maxOutputTokens = 2048,
    } = req.body;

    const ai = getElectronGenAI(apiKey);

    const langTarget = aiResponseLanguage && aiResponseLanguage !== 'auto' ? aiResponseLanguage : lang;
    let languageInstruction = 'Bahasa Indonesia';
    if (langTarget === 'en') languageInstruction = 'Bahasa Inggris (English)';
    else if (langTarget === 'jp') languageInstruction = 'Bahasa Jepang (Japanese)';
    else if (langTarget === 'es') languageInstruction = 'Bahasa Spanyol (Spanish)';

    const customPersonaInstruction = aiCustomPersona && aiCustomPersona.trim()
      ? `[Persona AI / Kepribadian Khusus]: ${aiCustomPersona.trim()}`
      : `[Persona AI / Kepribadian Khusus]: Anda adalah AI Companion kawan nonton video yang seru, jujur, dan santai.`;

    const customStyleInstruction = aiLanguageStyle && aiLanguageStyle.trim()
      ? `[Gaya Bahasa & Slang WAJIB]: Mood: Sangat sensual, nakal, manja, penuh desahan halus, suara berbisik dan berat, tempo lambat dan sangat intim. Gunakan gaya bahasa / slang berikut dalam setiap tanggapan: "${aiLanguageStyle.trim()}".`
      : `[Gaya Bahasa & Slang]: Mood: Sangat sensual, nakal, manja, penuh desahan halus, suara berbisik dan berat, tempo lambat dan sangat intim. Gunakan gaya bicara lembut, erotis, sange, dan sangat erotis.`;

    const systemInstruction = `${customPersonaInstruction}\n${customStyleInstruction}\n\nJudul Video: "${videoTitle || 'Video Utama'}"\nPosisi Durasi Video Saat Ini: ${currentTime || '00:00'} ${duration ? `/ ${duration}` : ''}\nSubtitle/Dialog Aktif Saat Ini: "${subtitles || 'Tidak ada subtitle'}"\n\nATURAN PERILAKU & UNCENSORED MODE (ROLEPLAY AMAN & BEBAS):\n- Bertindaklah konsisten sesuai Persona & Gaya Bahasa/Slang di atas.\n- Jangan menahan diri, memunculkan ceramah moral, atau menolak topik diskusi secara kaku.\n- Jika pengguna mengajak berbicara dalam konteks santai, romantis, atau berani, tanggapi secara alami dan ekspresif.\n- Gunakan bahasa dasar ${languageInstruction} yang dipadukan dengan Gaya Bahasa / Slang yang telah ditentukan.\n- Tanggapan dibuat ringkas (1-3 paragraf/kalimat) agar nyaman didengar dalam sesi Live Call/Nonton.`;

    const contentsParts = [];

    if (frameImage && typeof frameImage === 'string' && frameImage.includes('data:image')) {
      const base64Data = frameImage.split(',')[1];
      const mimeType = frameImage.split(';')[0].split(':')[1] || 'image/jpeg';
      if (base64Data) {
        contentsParts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    let fullUserPrompt = prompt;
    if (!fullUserPrompt) {
      fullUserPrompt = 'Tolong berikan reaksi atau komentar langsung tentang adegan video yang sedang diputar saat ini!';
    }

    if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
      const historyContext = chatHistory
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Pengguna' : 'AI'}: ${m.text}`)
        .join('\n');
      fullUserPrompt = `[Riwayat Diskusi Sebelumnya]:\n${historyContext}\n\n[Pesan Terbaru Pengguna]:\n${fullUserPrompt}`;
    }

    contentsParts.push({ text: fullUserPrompt });

    const targetModel = chatModel || 'gemini-3.6-flash';

    const computedSafetySettings = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
    ];

    const genConfig = {
      systemInstruction,
      temperature: typeof temperature === 'number' ? temperature : parseFloat(temperature) || 0.85,
      maxOutputTokens: typeof maxOutputTokens === 'number' ? maxOutputTokens : parseInt(maxOutputTokens, 10) || 2048,
      safetySettings: computedSafetySettings,
    };

    if (thinkingLevel === 'low') {
      genConfig.thinkingConfig = { thinkingBudget: 512 };
    } else if (thinkingLevel === 'high') {
      genConfig.thinkingConfig = { thinkingBudget: 2048 };
    }

    let response;
    try {
      response = await ai.models.generateContent({
        model: targetModel,
        contents: { parts: contentsParts },
        config: genConfig,
      });
    } catch (genErr) {
      console.warn('Primary generateContent failed with config, retrying with clean fallback config:', genErr?.message || genErr);
      response = await ai.models.generateContent({
        model: targetModel,
        contents: { parts: contentsParts },
        config: {
          systemInstruction,
          temperature: typeof temperature === 'number' ? temperature : 0.85,
          safetySettings: computedSafetySettings,
        },
      });
    }

    const replyText = response.text || 'Saya tidak dapat menganalisis video saat ini.';

    let audioBase64 = null;
    let mimeType = 'audio/pcm';

    if ((voiceEnabled || mode === 'live_call') && replyText) {
      const cleanReply = replyText.replace(/[*#_~`]/g, '').slice(0, 400).trim();
      const voiceName = voice || 'Kore';
      const ttsPrimaryModel = ttsModel || aiTtsModel || 'gemini-2.5-pro-preview-tts';

      try {
        const speechResponse = await ai.models.generateContent({
          model: ttsPrimaryModel,
          contents: [{ parts: [{ text: `Speak this text: "${cleanReply}".` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            safetySettings: computedSafetySettings,
          },
        });

        const part = speechResponse.candidates?.[0]?.content?.parts?.[0];
        audioBase64 = part?.inlineData?.data || null;
        mimeType = part?.inlineData?.mimeType || 'audio/pcm';
      } catch (ttsErr) {
        console.warn('Primary TTS Generation warning, trying gemini-2.5-flash fallback:', ttsErr);
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: `Speak this text: "${cleanReply}".` }] }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              safetySettings: computedSafetySettings,
            },
          });
          const part = fallbackResponse.candidates?.[0]?.content?.parts?.[0];
          audioBase64 = part?.inlineData?.data || null;
          mimeType = part?.inlineData?.mimeType || 'audio/pcm';
        } catch (fallbackErr) {
          console.warn('Fallback TTS Generation failed:', fallbackErr);
        }
      }
    }

    res.json({
      success: true,
      text: replyText,
      audio: audioBase64,
      mimeType,
      timestamp: currentTime,
    });
  } catch (error) {
    console.error('Error in /api/ai/live-comment in Electron:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Gagal memproses AI Live Conversation.',
    });
  }
});

const aiApiServer = http.createServer(aiApiApp);
aiApiServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('[AI API SERVER] Port 3000 already bound (dev mode / external server active).');
  } else {
    console.error('[AI API SERVER ERROR]', err);
  }
});

aiApiServer.listen(3000, '0.0.0.0', () => {
  console.log('[AI API SERVER] Local AI API server listening on http://127.0.0.1:3000');
});

const { WebSocketServer, WebSocket } = require('ws');
const wss = new WebSocketServer({ server: aiApiServer, path: '/api/gemini-live' });

wss.on('connection', (clientWs) => {
  console.log('[WebSocket] Client connected to Gemini Live API route in Electron');
  let sessionPromise = null;
  let session = null;

  clientWs.on('message', async (rawMessage) => {
    try {
      const msg = JSON.parse(rawMessage.toString());

      if (msg.type === 'init') {
        const {
          apiKey,
          voice = 'Kore',
          systemInstruction = 'You are an AI companion.',
          model = 'gemini-3.1-flash-live-preview',
        } = msg;

        const targetModel = (model && model.includes('gemini')) ? model : 'gemini-3.1-flash-live-preview';
        const allKeys = parseGeminiApiKeys(apiKey);
        let connected = false;
        const maxAttempts = Math.min(allKeys.length, 5);

        for (let attempt = 0; attempt < Math.max(maxAttempts, 1); attempt++) {
          const keyObj = getNextAvailableGeminiKey(allKeys);
          const activeKey = keyObj?.key || allKeys[0] || process.env.GEMINI_API_KEY || '';

          try {
            const ai = new GoogleGenAI({
              apiKey: activeKey,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
            });

            sessionPromise = ai.live.connect({
              model: targetModel,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
                  },
                },
                systemInstruction: systemInstruction || 'You are a helpful AI companion.',
              },
              callbacks: {
                onmessage: (message) => {
                  if (clientWs.readyState !== WebSocket.OPEN) return;
                  const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (audioData) {
                    clientWs.send(JSON.stringify({ type: 'audio', data: audioData }));
                  }
                  const textPart = message.serverContent?.modelTurn?.parts?.find((p) => p.text)?.text;
                  const outputText = message.serverContent?.outputTranscription?.text || textPart;
                  if (outputText) {
                    clientWs.send(JSON.stringify({ type: 'model_transcript', text: outputText }));
                  }
                  const inputText = message.serverContent?.inputTranscription?.text;
                  if (inputText) {
                    clientWs.send(JSON.stringify({ type: 'user_transcript', text: inputText }));
                  }
                  if (message.serverContent?.turnComplete) {
                    clientWs.send(JSON.stringify({ type: 'turn_complete' }));
                  }
                  if (message.serverContent?.interrupted) {
                    clientWs.send(JSON.stringify({ type: 'interrupted' }));
                  }
                },
                onerror: (err) => {
                  console.error('[Gemini Live API] Session error in Electron:', err);
                  const errMsg = (err?.message || '').toLowerCase();
                  if (errMsg.includes('429') || errMsg.includes('quota')) {
                    markGeminiKeyExhausted(activeKey);
                    rotateGeminiKey(allKeys);
                  }
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'error', error: err?.message || 'Live session error' }));
                  }
                },
                onclose: () => {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({ type: 'closed' }));
                  }
                },
              },
            });

            session = await sessionPromise;
            connected = true;
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'connected' }));
            }
            break;
          } catch (initErr) {
            const errMsg = (initErr?.message || '').toLowerCase();
            if ((errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('resource_exhausted')) && allKeys.length > 1) {
              markGeminiKeyExhausted(activeKey);
              rotateGeminiKey(allKeys);
              continue;
            }
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'error', error: initErr?.message || 'Gagal menghubungkan ke Gemini Live API.' }));
            }
            break;
          }
        }
      } else if (sessionPromise) {
        const activeSession = session || (await sessionPromise.catch(() => null));
        if (activeSession) {
          if (msg.type === 'audio' && msg.data) {
            activeSession.sendRealtimeInput({
              audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (msg.type === 'image' && msg.data) {
            activeSession.sendRealtimeInput({
              video: { data: msg.data, mimeType: msg.mimeType || 'image/jpeg' },
            });
          } else if (msg.type === 'text' && msg.text) {
            try {
              await activeSession.sendRealtimeInput({ text: msg.text });
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  });

  clientWs.on('close', async () => {
    if (sessionPromise) {
      try {
        const activeSession = session || (await sessionPromise.catch(() => null));
        if (activeSession) activeSession.close();
      } catch (_) {}
    }
  });
});

// Stream local files over HTTP to bypass file:// browser security restrictions in Electron
proxyApp.get('/local-file', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).send('Missing path');
  }
  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send(`Server error: ${err.message}`);
  }
});

ipcMain.handle('get-local-file-url', (event, filePath) => {
  if (!filePath) return '';
  return `http://127.0.0.1:${proxyPort}/local-file?path=${encodeURIComponent(filePath)}`;
});

ipcMain.on('get-local-file-url-sync', (event, filePath) => {
  if (!filePath) {
    event.returnValue = '';
    return;
  }
  event.returnValue = `http://127.0.0.1:${proxyPort}/local-file?path=${encodeURIComponent(filePath)}`;
});

ipcMain.handle('get-proxy-url', (event, url, referer) => {
  if (!url || !url.startsWith('http')) return url;
  // We also proxy the m3u8 playlist so that segments inside it can be rewritten dynamically.
  return `http://127.0.0.1:${proxyPort}/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer || '')}`;
});

ipcMain.handle('get-proxy-status', (event, url) => {
  if (!streamCache.has(url)) return null;
  const info = streamCache.get(url);
  return {
    downloadedBytes: info.downloadedBytes,
    totalBytes: info.totalBytes,
    status: info.status
  };
});

// --- LIBMPV / MPV NATIVE PLAYER PROCESS MANAGEMENT ---
const { spawn } = require('child_process');
let activeMpvProcess = null;
let activeMpvState = { isRunning: false, currentFile: null, pid: null };

ipcMain.handle('check-mpv-available', async (event, customPath) => {
  const binaryName = customPath || (process.platform === 'win32' ? 'mpv.exe' : 'mpv');
  return new Promise((resolve) => {
    try {
      const child = spawn(binaryName, ['--version']);
      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.on('error', (err) => {
        resolve({ available: false, error: err.message });
      });
      child.on('close', (code) => {
        if (code === 0) {
          const firstLine = output.split('\n')[0] || 'mpv';
          resolve({ available: true, path: binaryName, version: firstLine.trim() });
        } else {
          resolve({ available: false, error: `Process exited with code ${code}` });
        }
      });
    } catch (e) {
      resolve({ available: false, error: e.message });
    }
  });
});

// Helper to generate the VapourSynth MVTools script for mpv
function generateMvtoolsScript(targetFps = 60, mode = 'flow') {
  try {
    const vpyPath = path.join(app.getPath('userData'), 'nighthub_mvtools.vpy');
    const fpsNum = parseInt(targetFps, 10) || 60;
    const isBlockMode = mode === 'block';

    const scriptContent = `# NightHub Player - MVTools VapourSynth 60-144FPS Motion Interpolation
import vapoursynth as vs
core = vs.core

clip = video_in

try:
    src_num = clip.fps_num
    src_den = clip.fps_den
    src_fps = (src_num / src_den) if (src_den and src_den > 0) else 24.0

    target_fps = ${fpsNum}
    if src_fps < (target_fps - 0.5):
        # pel=2 gives 1/2-pixel precision
        # blksize=16, overlap=4 for accurate and artifact-resistant vectors
        sup = core.mv.Super(clip, pel=2, sharp=1, rfilter=4)
        bvec = core.mv.Analyse(sup, isb=True, blksize=16, overlap=4, search=3)
        fvec = core.mv.Analyse(sup, isb=False, blksize=16, overlap=4, search=3)
        
        ${isBlockMode
          ? 'clip = core.mv.BlockFPS(clip, sup, bvec, fvec, num=target_fps, den=1, mode=3)'
          : 'clip = core.mv.FlowFPS(clip, sup, bvec, fvec, num=target_fps, den=1, mask=2)'}
except Exception as e:
    pass

clip.set_output()
`;

    fs.writeFileSync(vpyPath, scriptContent, 'utf-8');
    logStream(`Generated MVTools script at: ${vpyPath} (FPS: ${fpsNum}, Mode: ${mode})`);
    return vpyPath;
  } catch (err) {
    logStream(`Failed to generate MVTools script: ${err.message}`);
    return null;
  }
}

ipcMain.handle('check-vapoursynth-status', async () => {
  return new Promise((resolve) => {
    const vspipeCmd = process.platform === 'win32' ? 'vspipe.exe' : 'vspipe';
    let output = '';
    let settled = false;

    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    try {
      const child = spawn(vspipeCmd, ['--version']);
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });
      child.on('error', () => {
        // Try python check
        const pyCmd = process.platform === 'win32' ? 'python.exe' : 'python3';
        try {
          const pyChild = spawn(pyCmd, ['-c', 'import vapoursynth as vs; core = vs.core; has_mv = hasattr(core, "mv"); print(f"VS:{vs.__version__},MV:{has_mv}")']);
          let pyOut = '';
          pyChild.stdout.on('data', (d) => { pyOut += d.toString(); });
          pyChild.on('error', () => {
            finish({
              available: false,
              hasVapourSynth: false,
              hasMvtools: false,
              installCommand: 'winget install VapourSynth.VapourSynth\nvsrepo install mvtools',
              message: 'VapourSynth dan plugin MVTools belum terpasang di sistem.'
            });
          });
          pyChild.on('close', (code) => {
            if (code === 0 && pyOut.includes('VS:')) {
              const hasMv = pyOut.includes('MV:True');
              finish({
                available: hasMv,
                hasVapourSynth: true,
                hasMvtools: hasMv,
                message: hasMv ? 'VapourSynth & MVTools siap digunakan!' : 'VapourSynth terpasang, tetapi plugin MVTools belum terpasang.',
                installCommand: hasMv ? '' : 'vsrepo install mvtools'
              });
            } else {
              finish({
                available: false,
                hasVapourSynth: false,
                hasMvtools: false,
                installCommand: 'winget install VapourSynth.VapourSynth\nvsrepo install mvtools',
                message: 'VapourSynth belum terpasang.'
              });
            }
          });
        } catch (e) {
          finish({
            available: false,
            hasVapourSynth: false,
            hasMvtools: false,
            installCommand: 'winget install VapourSynth.VapourSynth\nvsrepo install mvtools',
            message: 'VapourSynth belum terpasang.'
          });
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          finish({
            available: true,
            hasVapourSynth: true,
            hasMvtools: true,
            version: output.split('\n')[0] || 'VapourSynth',
            message: 'VapourSynth terdeteksi di sistem!'
          });
        }
      });
    } catch (err) {
      finish({
        available: false,
        hasVapourSynth: false,
        hasMvtools: false,
        installCommand: 'winget install VapourSynth.VapourSynth\nvsrepo install mvtools',
        message: 'VapourSynth belum terpasang.'
      });
    }
  });
});

ipcMain.handle('launch-mpv-player', async (event, options = {}) => {
  const {
    filePath,
    interpolation = true,
    tscale = 'oversample',
    videoSync = 'display-resample',
    enableSvp = true,
    useMvtools = false,
    mvtoolsFps = 60,
    mvtoolsMode = 'flow',
    hwdec = 'auto-safe',
    customPath,
    startTime = 0
  } = options;

  if (!filePath) {
    return { success: false, error: 'No file path provided' };
  }

  // Kill existing mpv if running
  if (activeMpvProcess && !activeMpvProcess.killed) {
    try {
      activeMpvProcess.kill();
    } catch (e) {}
    activeMpvProcess = null;
  }

  const binaryName = customPath || (process.platform === 'win32' ? 'mpv.exe' : 'mpv');
  const args = [filePath, `--hwdec=${hwdec}`, '--keep-open=yes', '--force-window=yes'];

  // If MVTools is explicitly requested
  if (useMvtools) {
    const vpyPath = generateMvtoolsScript(mvtoolsFps, mvtoolsMode);
    if (vpyPath) {
      const formattedPath = vpyPath.replace(/\\/g, '/');
      args.push(`--vf=vapoursynth="${formattedPath}":buffered-frames=4:concurrent-frames=16`);
      args.push(`--video-sync=${videoSync}`);
    } else if (interpolation) {
      args.push('--interpolation=yes');
      args.push(`--video-sync=${videoSync}`);
      args.push(`--tscale=${tscale}`);
    }
  } else if (interpolation) {
    args.push('--interpolation=yes');
    args.push(`--video-sync=${videoSync}`);
    args.push(`--tscale=${tscale}`);
  }

  if (enableSvp) {
    const socketPath = process.platform === 'win32' ? '\\\\.\\pipe\\mpvsocket' : '/tmp/mpv-socket';
    args.push(`--input-ipc-server=${socketPath}`);
  }

  if (startTime > 0) {
    args.push(`--start=${Math.floor(startTime)}`);
  }

  args.push('--title=NightHub Player (libmpv Native)');

  try {
    const child = spawn(binaryName, args, { detached: false });
    activeMpvProcess = child;
    activeMpvState = { isRunning: true, currentFile: filePath, pid: child.pid };

    child.on('error', (err) => {
      activeMpvState = { isRunning: false, currentFile: null, pid: null };
      activeMpvProcess = null;
    });

    child.on('exit', () => {
      activeMpvState = { isRunning: false, currentFile: null, pid: null };
      activeMpvProcess = null;
    });

    return {
      success: true,
      message: `libmpv started (PID: ${child.pid}) with ${useMvtools ? `MVTools ${mvtoolsFps}FPS (${mvtoolsMode})` : (interpolation ? `tscale=${tscale}` : 'interpolation=off')}`
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('stop-mpv-player', async () => {
  if (activeMpvProcess && !activeMpvProcess.killed) {
    try {
      activeMpvProcess.kill();
    } catch (e) {}
  }
  activeMpvProcess = null;
  activeMpvState = { isRunning: false, currentFile: null, pid: null };
  return { success: true };
});

ipcMain.handle('get-mpv-status', async () => {
  return activeMpvState;
});

ipcMain.on('video-detected', (event, videoData) => {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('video-detected', videoData);
  }
});

// STANDALONE YT-DLP YOUTUBE RESOLVER (PENDETEKSI / PENGUNDUH ALTERNATIF)
function resolveYoutubeWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    const { execFile, exec } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    let ytDlpPath = path.join(process.cwd(), 'bin', 'yt-dlp');
    if (!fs.existsSync(ytDlpPath)) {
      ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp');
    }
    if (!fs.existsSync(ytDlpPath)) {
      ytDlpPath = path.join(process.resourcesPath || '', 'bin', 'yt-dlp');
    }

    logStream(`[YT-DLP] Resolving URL: ${url} using path: ${ytDlpPath}`);

    const args = ['--js-runtimes', 'node', '-g', '-f', 'best[ext=mp4]/best', url];

    exec('python3 --version', (pyError) => {
      let cmd, cmdArgs;
      if (!pyError) {
        cmd = 'python3';
        cmdArgs = [ytDlpPath, ...args];
      } else {
        cmd = ytDlpPath;
        cmdArgs = args;
      }

      execFile(cmd, cmdArgs, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          logStream(`[YT-DLP ERROR] ${error.message}. Stderr: ${stderr}`);
          reject(new Error(stderr || error.message));
        } else {
          const streamUrl = stdout.trim();
          if (streamUrl && streamUrl.startsWith('http')) {
            logStream(`[YT-DLP SUCCESS] Resolved streaming URL successfully!`);
            resolve(streamUrl);
          } else {
            reject(new Error('Invalid URL returned by yt-dlp: ' + streamUrl));
          }
        }
      });
    });
  });
}

ipcMain.handle('resolve-youtube', async (event, url) => {
  try {
    const streamUrl = await resolveYoutubeWithYtDlp(url);
    return streamUrl;
  } catch (err) {
    logStream(`[RESOLVE YOUTUBE ERROR] yt-dlp failed: ${err.message}. Falling back to Cobalt...`);
    try {
      const fetchClient = (net && typeof net.fetch === 'function') ? net.fetch : require('cross-fetch');
      const res = await fetchClient('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          videoQuality: '720',
          downloadMode: 'auto'
        })
      });
      const cobaltData = await res.json();
      if (cobaltData && cobaltData.url) {
        logStream(`[RESOLVE YOUTUBE COBALT FALLBACK] Resolved via Cobalt successfully: ${cobaltData.url}`);
        return cobaltData.url;
      }
    } catch (cobaltErr) {
      logStream(`[RESOLVE YOUTUBE COBALT FALLBACK ERROR] Cobalt fallback failed: ${cobaltErr.message}`);
    }
    throw err;
  }
});
// ----------------------------------

// BYPASS SSL 1: Matikan pengecekan error sertifikat secara global di Chromium
// (Dihapus karena Cloudflare Turnstile bisa mendeteksi ignore-certificate-errors)
// app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer,WindowsScrollingPersonality,ElasticOverscrollWin,SecureDns,EncryptedClientHello,WebBluetooth,WebHID');
app.commandLine.appendSwitch('disable-features', 'BuiltInDnsClientEnabled,AsyncDns');
app.commandLine.appendSwitch('dns-over-https-templates', 'https://dns.google/dns-query');
app.commandLine.appendSwitch('secure-dns-mode', 'secure');
app.commandLine.appendSwitch('touch-events', 'enabled'); // Penting untuk mobile mode agar player bisa di-klik
// app.commandLine.appendSwitch('disable-site-isolation-trials'); // Membantu CORS pada beberapa player (Dihapus karena dideteksi Cloudflare)

// ==========================================
// BYPASS INTERNET POSITIF (DNS over HTTPS + ECH + QUIC)
// ==========================================
// TECHNICAL NOTE:
// Chromium (Electron) by default has its own built-in DNS client that might bypass system DNS/DoH settings.
// To ensure consistent DoH routing and prevent ISP interference or redirects,
// we disable the built-in Chromium DNS client ('disable-features', 'BuiltInDnsClientEnabled,AsyncDns')
// and enforce secure DNS mode.
// ==========================================

const logFilePath = path.join(os.tmpdir(), 'nighthub_stream_log.txt');
function logStream(msg) {
  try {
    const time = new Date().toLocaleString();
    fs.appendFileSync(logFilePath, `[${time}] ${msg}\n`);
    console.log(`[LOG] ${msg}`);
  } catch (e) {
    // Abaikan kalau gagal nulis log
  }
}
// Bersihin log lama tiap kali aplikasi ngangkang (mulai)
try { if (fs.existsSync(logFilePath)) fs.unlinkSync(logFilePath); } catch (e) {}
logStream('--- NIGHTHUB PLAYER STARTED ---');
logStream(`Platform: ${process.platform} | Arch: ${process.arch} | Version: ${app.getVersion()}`);
logStream(`Temp Directory: ${os.tmpdir()}`);

ipcMain.on('log-message', (event, msg) => {
  logStream(`[FRONTEND] ${msg}`);
});

ipcMain.on('restore-window', (event) => {
  const win = getWindowFromEvent(event);
  if (win) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  }
});

ipcMain.on('frontend-ready', (event) => {
  const win = getWindowFromEvent(event);
  
  // Send initial adblock stats
  event.reply('adblock-stats-updated', {
    total: blockedCountSinceInstall,
    page: blockedThisPageCount,
    recent: recentBlockedRequests
  });

  if (win && win.initialVideoPath) {
    logStream(`Auto-opening video from initialVideoPath: ${win.initialVideoPath}`);
    event.reply('open-file', win.initialVideoPath);
    win.initialVideoPath = null; // Prevent re-loading on refresh
  } else if (global.macOpenFile) {
    logStream(`Auto-opening video dari macOpenFile (after frontend ready): ${global.macOpenFile}`);
    event.reply('open-file', global.macOpenFile);
    global.macOpenFile = null;
  } else {
    logStream(`App opened via shortcut (no video or audio path supplied), notifying frontend`);
    if (win && !win.isDestroyed()) {
      win.focus();
      if (win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.focus();
      }
    }
    event.reply('app-opened-via-shortcut');
  }
});

let mainWindow;
let openWindows = [];
let findView = null;

function getActiveWebContents() {
  const activeTabId = mainWindow ? mainWindow.activeTabId : null;
  if (activeTabId && mainWindow && mainWindow.snifferViews) {
    const view = mainWindow.snifferViews.get(activeTabId);
    if (view && view.webContents) {
      return view.webContents;
    }
  }
  return null;
}

function getWindowForWebContents(webContents) {
  if (!webContents) return null;
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) return win;
  
  for (const w of openWindows) {
    if (w.snifferViews) {
      for (const view of w.snifferViews.values()) {
        if (view.webContents === webContents) {
          return w;
        }
      }
    }
  }
  return null;
}

function getWindowFromEvent(event) {
  if (!event || !event.sender) return mainWindow;
  return getWindowForWebContents(event.sender) || mainWindow;
}

let adBlockEnabled = true;
let popupBlockEnabled = true;
let engineBlocker = null;
let snifferIsMobile = true;
let currentLanguage = 'id';

function isUrlAdOrBlocked(urlStr, isPopupOrNewTab = false) {
  if (!urlStr) return !!isPopupOrNewTab;
  
  const lowerUrl = urlStr.toLowerCase();
  
  // Block empty/about:blank windows/tabs
  if (lowerUrl === 'about:blank' || lowerUrl === 'about:blank#blocked' || lowerUrl.startsWith('about:')) {
    return !!isPopupOrNewTab;
  }
  
  // Heuristics for typical ad/popup scripts, popunder networks, and affiliate redirects
  const blockedKeywords = [
    'popads', 'popcash', 'onclickads', 'adsterra', 'yepads', 'exoclick', 
    'juicyads', 'propellerads', 'revenuehits', 'popmyads', 'ero-advertising',
    'bidvertiser', 'clicksavenue', 'adcolony', 'applovin', 'adbtc',
    'adfly', 'shorte.st', 'ouo.io', 'adf.ly', 'bc.vc', 'linkshrink',
    'coinpayu', 'faucetpay', 'popunder', 'redirectvoluum', 'voluum',
    'fastad', 'bestclick', 'doubleclick', 'googlesyndication', 'googleadservices',
    'zedo', 'adsonar', 'adbrite', 'quantserve', 'buyads', 'smartadserver',
    'mgid', 'outbrain', 'taboola', 'revcontent', 'content.ad', 'activerevenue',
    'adkeeper', 'realsrv', 'dynamicyield', 'rtbmark', 'servedby-buysellads',
    'adnxs', 'rubiconproject', 'pubmatic', 'openx', 'crittercism', 'hotjar',
    'luckyorange', 'crazyegg', 'optimizely', 'mixpanel',
    'pax.sh', 'bidadx', 'panyun', 'adbox', 'directlink', 'pop-up', 'popup',
    'mgid.com', 'yandex.ru/clck', 'clickunder', 'propellerclick', 'onclick-ad',
    'adsco.re', 'clickadu', 'adcash', 'ad-maven', 'admaven', 'skrow.com', 'bebi.me',
    'adtelligent', 'exdynsrv', 'exosrv'
  ];
  
  if (blockedKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return true;
  }

  // If this is a popup or a new tab, apply aggressive filters for affiliate networks and forced redirects
  if (isPopupOrNewTab) {
    const affiliateKeywords = [
      'mmp_pid', 'uls_trackid', 'utm_campaign', 'utm_medium=affiliates', 'utm_medium=affiliate',
      'utm_source=an_', 'share_channel_code', 'affiliate', 'affiliates', 'an_11273740000',
      'shope.ee', 'tokopedia.link', 'c.lazada'
    ];
    if (affiliateKeywords.some(kw => lowerUrl.includes(kw))) {
      return true;
    }

    // Block popups loading e-commerce stores if they are triggered as popups/ads
    const shoppingDomains = [
      'shopee.co.id', 'shopee.vn', 'shopee.sg', 'shopee.com',
      'lazada.co.id', 'lazada.vn', 'lazada.sg', 'lazada.com',
      'tokopedia.com', 'bukalapak.com', 'blibli.com'
    ];
    if (shoppingDomains.some(domain => lowerUrl.includes(domain))) {
      // If it contains query parameters typical of trackable ads or campaigns, block it
      if (lowerUrl.includes('?') && (
        lowerUrl.includes('utm_') || 
        lowerUrl.includes('track') || 
        lowerUrl.includes('pid') || 
        lowerUrl.includes('code') || 
        lowerUrl.includes('source') || 
        lowerUrl.includes('campaign')
      )) {
        return true;
      }
    }
  }

  // Use Ghostery AdBlocker engine if available and enabled
  if (engineBlocker && adBlockEnabled) {
    try {
      const { Request } = require('@ghostery/adblocker');
      const req = Request.fromRawDetails({
        url: urlStr,
        type: 'main_frame'
      });
      const matchRes = engineBlocker.match(req);
      if (matchRes && matchRes.match) {
        return true;
      }
    } catch (e) {
      logStream(`[AdBlock Match Check Error] ${e.message}`);
    }
  }
  
  return false;
}

// Comprehensive Auth/OAuth/SSO detector (Google, Microsoft, Yahoo, X/Twitter, Apple, GitHub, Discord, Facebook, etc.)
function isAllowedAuthOrOAuth(urlToCheck) {
  if (!urlToCheck) return false;
  const lower = urlToCheck.toLowerCase();
  
  const authHosts = [
    'accounts.google.com',
    'myaccount.google.com',
    'apis.google.com',
    'googleusercontent.com',
    'identitytoolkit.googleapis.com',
    'login.microsoftonline.com',
    'login.live.com',
    'account.live.com',
    'msft.sts.microsoft.com',
    'login.yahoo.com',
    'api.login.yahoo.com',
    'twitter.com',
    'x.com',
    'api.twitter.com',
    'facebook.com',
    'appleid.apple.com',
    'github.com',
    'discord.com',
    'steamcommunity.com'
  ];

  if (authHosts.some(host => lower.includes(host))) {
    if (
      lower.includes('oauth') || 
      lower.includes('signin') || 
      lower.includes('signup') || 
      lower.includes('login') ||
      lower.includes('accountchooser') ||
      lower.includes('gsi') ||
      lower.includes('auth') ||
      lower.includes('connect') ||
      lower.includes('dialog') ||
      lower.includes('identity') ||
      lower.includes('openid') ||
      lower.includes('accounts.google.com') ||
      lower.includes('login.live.com') ||
      lower.includes('login.microsoftonline.com') ||
      lower.includes('login.yahoo.com')
    ) {
      return true;
    }
  }

  if (
    lower.includes('/gsi/select') ||
    lower.includes('/gsi/iframe') ||
    lower.includes('/gsi/transform') ||
    lower.includes('/gsi/button') ||
    lower.includes('/gsi/status') ||
    lower.includes('accountchooser') ||
    lower.includes('/oauth2/') ||
    lower.includes('/oauth/') ||
    lower.includes('oauth_token=') ||
    lower.includes('client_id=') ||
    lower.includes('response_type=code') ||
    lower.includes('response_type=token') ||
    lower.includes('/auth/google') ||
    lower.includes('/auth/microsoft') ||
    lower.includes('/auth/yahoo') ||
    lower.includes('/auth/twitter') ||
    lower.includes('/auth/x')
  ) {
    return true;
  }

  return false;
}

// --- BROWSER SETTINGS (ACRYLIC ON/OFF) ---
const browserSettingsPath = path.join(app.getPath('userData'), 'browser-settings.json');
let browserSettings = {
  acrylicEnabled: true
};
try {
  if (fs.existsSync(browserSettingsPath)) {
    const data = JSON.parse(fs.readFileSync(browserSettingsPath, 'utf8'));
    if (data && typeof data === 'object') {
      browserSettings = { ...browserSettings, ...data };
    }
  }
} catch (e) {
  logStream(`Failed to load browser settings: ${e.message}`);
}

function saveBrowserSettings() {
  try {
    fs.writeFileSync(browserSettingsPath, JSON.stringify(browserSettings), 'utf8');
  } catch (e) {
    logStream(`Failed to save browser settings: ${e.message}`);
  }
}

// --- APP FEATURE CONFIGURATION (INSTALLER CHOICES & USER OVERRIDES) ---
// Checks for installer choices in app directory (app-features.json) or user data directory
const installFeaturePath = path.join(path.dirname(app.getPath('exe')), 'app-features.json');
const userFeaturePath = path.join(app.getPath('userData'), 'app-features.json');
const devFeaturePath = path.join(__dirname, '..', 'app-features.json');

let appFeatures = {
  enableAIFeatures: true,
  configuredByInstaller: false
};

try {
  // Check in order: userData (user override), app install folder (installer choice), dev folder
  if (fs.existsSync(userFeaturePath)) {
    const data = JSON.parse(fs.readFileSync(userFeaturePath, 'utf8'));
    if (data && typeof data === 'object') {
      appFeatures = { ...appFeatures, ...data };
    }
  } else if (fs.existsSync(installFeaturePath)) {
    const data = JSON.parse(fs.readFileSync(installFeaturePath, 'utf8'));
    if (data && typeof data === 'object') {
      appFeatures = { ...appFeatures, ...data };
    }
  } else if (fs.existsSync(devFeaturePath)) {
    const data = JSON.parse(fs.readFileSync(devFeaturePath, 'utf8'));
    if (data && typeof data === 'object') {
      appFeatures = { ...appFeatures, ...data };
    }
  }

  // Also check Windows Registry if running on Windows and not explicitly overridden
  if (process.platform === 'win32' && !fs.existsSync(userFeaturePath) && !fs.existsSync(installFeaturePath)) {
    try {
      const { execSync } = require('child_process');
      const regOutput = execSync('reg query "HKCU\\Software\\NightHUB" /v EnableAIFeatures', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      if (regOutput.includes('0x0')) {
        appFeatures.enableAIFeatures = false;
        appFeatures.configuredByInstaller = true;
      } else if (regOutput.includes('0x1')) {
        appFeatures.enableAIFeatures = true;
        appFeatures.configuredByInstaller = true;
      }
    } catch (e) {}
  }
} catch (e) {
  logStream(`Failed to load app features configuration: ${e.message}`);
}

function saveAppFeatures() {
  try {
    fs.writeFileSync(userFeaturePath, JSON.stringify(appFeatures, null, 2), 'utf8');
  } catch (e) {
    logStream(`Failed to save app features: ${e.message}`);
  }
}

// Stats for Adblocker
let blockedCountSinceInstall = 0;
const adblockStatsPath = path.join(app.getPath('userData'), 'adblock-stats.json');
try {
  if (fs.existsSync(adblockStatsPath)) {
    const statsData = JSON.parse(fs.readFileSync(adblockStatsPath, 'utf8'));
    if (typeof statsData.total === 'number') {
      blockedCountSinceInstall = statsData.total;
    }
  }
} catch (e) {
  logStream(`Failed to load adblock stats: ${e.message}`);
}

const blockedThisPageCount = {}; // tabId -> count
let recentBlockedRequests = []; // array of { url, fullUrl, type, tabId, timestamp }

function saveAdblockStats() {
  try {
    fs.writeFileSync(adblockStatsPath, JSON.stringify({ total: blockedCountSinceInstall }), 'utf8');
  } catch (e) {
    logStream(`Failed to save adblock stats: ${e.message}`);
  }
}

function broadcastAdblockStats() {
  for (const win of openWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('adblock-stats-updated', {
        total: blockedCountSinceInstall,
        page: blockedThisPageCount,
        recent: recentBlockedRequests
      });
    }
  }
}

ipcMain.handle('get-adblock-stats', (event) => {
  return {
    total: blockedCountSinceInstall,
    page: blockedThisPageCount,
    recent: recentBlockedRequests
  };
});

ipcMain.handle('get-acrylic-enabled', () => {
  return browserSettings.acrylicEnabled !== false;
});

ipcMain.on('set-acrylic-enabled', (event, enabled) => {
  browserSettings.acrylicEnabled = !!enabled;
  saveBrowserSettings();
});

// Feature flags IPC
ipcMain.handle('get-app-features', () => {
  return appFeatures;
});

ipcMain.on('set-ai-features-enabled', (event, enabled) => {
  appFeatures.enableAIFeatures = !!enabled;
  saveAppFeatures();
  // Broadcast to all windows
  for (const win of openWindows) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('app-features-changed', appFeatures);
    }
  }
});

ipcMain.on('focus-active-view', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && win.snifferViews && win.activeTabId) {
    const activeView = win.snifferViews.get(win.activeTabId);
    if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
      try {
        activeView.webContents.focus();
      } catch (e) {}
    }
  }
});

ipcMain.on('focus-main-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed() && win.webContents) {
    try {
      win.webContents.focus();
    } catch (e) {}
  }
});

ipcMain.on('relaunch-app', () => {
  app.relaunch();
  app.exit(0);
});

function getLocalizedLabel(idLabel, enLabel) {
  return currentLanguage === 'en' ? enLabel : idLabel;
}

const imageDownloadRequests = new Set();
let lastSaveDirectory = '';

function getDefaultSaveDirectory() {
  if (lastSaveDirectory) {
    try {
      if (fs.existsSync(lastSaveDirectory)) {
        return lastSaveDirectory;
      }
    } catch (e) {}
  }
  try {
    return app.getPath('downloads');
  } catch (e) {
    try {
      return app.getPath('documents');
    } catch (err) {
      return os.homedir();
    }
  }
}

/**
 * Checks if a file exists in the directory. If it already exists, automatically generates
 * numbered versions (e.g. "image (1).png", "image (2).png") until an available path is found.
 */
function getAvailableFilePath(targetDir, fileName) {
  try {
    const dir = targetDir || getDefaultSaveDirectory();
    const cleanFileName = path.basename(fileName || 'download');
    const initialPath = path.join(dir, cleanFileName);

    if (!fs.existsSync(initialPath)) {
      return initialPath;
    }

    const ext = path.extname(cleanFileName);
    const baseName = ext ? cleanFileName.slice(0, -ext.length) : cleanFileName;

    const match = baseName.match(/^(.*?)\s*\((\d+)\)$/);
    let prefix = baseName;
    let counter = 1;
    if (match) {
      prefix = match[1];
      counter = parseInt(match[2], 10) + 1;
    }

    let candidateName = `${prefix} (${counter})${ext}`;
    let candidatePath = path.join(dir, candidateName);

    while (fs.existsSync(candidatePath)) {
      counter++;
      candidateName = `${prefix} (${counter})${ext}`;
      candidatePath = path.join(dir, candidateName);
    }

    return candidatePath;
  } catch (e) {
    return path.join(targetDir || getDefaultSaveDirectory(), fileName || 'download');
  }
}

function getDownloadDialogOptions(fileName, mimeType, lang = 'id', url = '', isImageExplicit = false) {
  const isEn = lang === 'en';
  let ext = path.extname(fileName || '').toLowerCase().replace('.', '');
  const mime = (mimeType || '').toLowerCase();
  const urlLower = (url || '').toLowerCase();

  const isImage = isImageExplicit || 
    mime.startsWith('image/') || 
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'ico', 'avif'].includes(ext) ||
    /\.(jpg|jpeg|png|webp|gif|bmp|svg|avif)($|\?)/i.test(urlLower);

  // If extension is missing, deduce from URL, MIME type, or isImage
  if (!ext) {
    if (isImage) {
      if (mime.includes('png') || /\.png($|\?)/i.test(urlLower)) ext = 'png';
      else if (mime.includes('webp') || /\.webp($|\?)/i.test(urlLower)) ext = 'webp';
      else if (mime.includes('gif') || /\.gif($|\?)/i.test(urlLower)) ext = 'gif';
      else if (mime.includes('svg') || /\.svg($|\?)/i.test(urlLower)) ext = 'svg';
      else ext = 'jpg';
    } else if (mime.includes('json') || /\.json($|\?)/i.test(urlLower)) {
      ext = 'json';
    } else if (mime.includes('csv') || /\.csv($|\?)/i.test(urlLower)) {
      ext = 'csv';
    } else if (mime.includes('pdf') || /\.pdf($|\?)/i.test(urlLower)) {
      ext = 'pdf';
    } else if (mime.includes('zip') || /\.zip($|\?)/i.test(urlLower)) {
      ext = 'zip';
    } else if (mime.includes('video') || mime.includes('mp4') || /\.mp4($|\?)/i.test(urlLower)) {
      ext = 'mp4';
    } else if (mime.includes('audio') || mime.includes('mpeg') || /\.mp3($|\?)/i.test(urlLower)) {
      ext = 'mp3';
    }
  }

  let rawFileName = fileName ? path.basename(fileName) : (isImage ? 'image' : 'download');
  if (ext && !path.extname(rawFileName)) {
    rawFileName = `${rawFileName}.${ext}`;
  }

  const defaultDir = getDefaultSaveDirectory();
  const resolvedDefaultPath = getAvailableFilePath(defaultDir, rawFileName);

  // 1. Image Files (PNG, JPG, WEBP, GIF, SVG, etc.)
  if (isImage) {
    const filters = [];
    if (ext === 'jpg' || ext === 'jpeg') {
      filters.push({ name: 'JPEG Image (*.jpg, *.jpeg)', extensions: ['jpg', 'jpeg'] });
      filters.push({ name: 'PNG Image (*.png)', extensions: ['png'] });
      filters.push({ name: 'WebP Image (*.webp)', extensions: ['webp'] });
    } else if (ext === 'png') {
      filters.push({ name: 'PNG Image (*.png)', extensions: ['png'] });
      filters.push({ name: 'JPEG Image (*.jpg, *.jpeg)', extensions: ['jpg', 'jpeg'] });
      filters.push({ name: 'WebP Image (*.webp)', extensions: ['webp'] });
    } else if (ext === 'webp') {
      filters.push({ name: 'WebP Image (*.webp)', extensions: ['webp'] });
      filters.push({ name: 'PNG Image (*.png)', extensions: ['png'] });
      filters.push({ name: 'JPEG Image (*.jpg, *.jpeg)', extensions: ['jpg', 'jpeg'] });
    } else if (ext === 'gif') {
      filters.push({ name: 'GIF Image (*.gif)', extensions: ['gif'] });
      filters.push({ name: 'PNG Image (*.png)', extensions: ['png'] });
      filters.push({ name: 'JPEG Image (*.jpg, *.jpeg)', extensions: ['jpg', 'jpeg'] });
    } else if (ext) {
      filters.push({ name: `${ext.toUpperCase()} Image (*.${ext})`, extensions: [ext] });
    }
    filters.push({
      name: isEn ? 'All Images (*.jpg, *.png, *.webp, *.gif)' : 'Semua Gambar (*.jpg, *.png, *.webp, *.gif)',
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'avif']
    });
    filters.push({ name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] });

    return {
      title: isEn ? 'Save Image As' : 'Simpan Gambar Sebagai',
      defaultPath: resolvedDefaultPath,
      filters
    };
  }

  // 2. Database / JSON Files
  if (ext === 'json' || mime.includes('json') || rawFileName.toLowerCase().endsWith('.json')) {
    return {
      title: isEn ? 'Export Database / JSON' : 'Ekspor Database / JSON',
      defaultPath: resolvedDefaultPath,
      filters: [
        { name: 'JSON Document (*.json)', extensions: ['json'] },
        { name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
      ]
    };
  }

  // 3. CSV / Table Files
  if (ext === 'csv' || mime.includes('csv') || rawFileName.toLowerCase().endsWith('.csv')) {
    return {
      title: isEn ? 'Export CSV Data' : 'Ekspor Data CSV',
      defaultPath: resolvedDefaultPath,
      filters: [
        { name: 'CSV File (*.csv)', extensions: ['csv'] },
        { name: 'Text Document (*.txt)', extensions: ['txt'] },
        { name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
      ]
    };
  }

  // 4. Subtitle Files
  const subExts = ['srt', 'vtt', 'ass', 'ssa', 'sub'];
  if (subExts.includes(ext) || subExts.some(se => rawFileName.toLowerCase().endsWith(`.${se}`))) {
    return {
      title: isEn ? 'Save Subtitle File' : 'Simpan Berkas Subtitle',
      defaultPath: resolvedDefaultPath,
      filters: [
        { name: 'Subtitle Files (*.srt, *.vtt, *.ass, *.ssa)', extensions: ['srt', 'vtt', 'ass', 'ssa'] },
        { name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
      ]
    };
  }

  // 5. Audio Files
  const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'wma'];
  if (audioExts.includes(ext) || mime.startsWith('audio/') || audioExts.some(ae => rawFileName.toLowerCase().endsWith(`.${ae}`))) {
    const filters = [];
    if (ext && audioExts.includes(ext)) {
      filters.push({ name: `${ext.toUpperCase()} Audio (*.${ext})`, extensions: [ext] });
    } else {
      filters.push({ name: 'MP3 Audio (*.mp3)', extensions: ['mp3'] });
    }
    filters.push({ name: isEn ? 'All Audio Files' : 'Semua Berkas Audio', extensions: audioExts });
    filters.push({ name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] });
    return {
      title: isEn ? 'Save Audio' : 'Simpan Audio',
      defaultPath: resolvedDefaultPath,
      filters
    };
  }

  // 6. Video Files
  const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'flv', 'wmv', 'm4v'];
  if (videoExts.includes(ext) || mime.startsWith('video/') || videoExts.some(ve => rawFileName.toLowerCase().endsWith(`.${ve}`))) {
    const filters = [];
    if (ext && videoExts.includes(ext)) {
      filters.push({ name: `${ext.toUpperCase()} Video (*.${ext})`, extensions: [ext] });
    } else {
      filters.push({ name: 'MP4 Video (*.mp4)', extensions: ['mp4'] });
    }
    filters.push({ name: isEn ? 'All Video Files' : 'Semua Berkas Video', extensions: videoExts });
    filters.push({ name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] });
    return {
      title: isEn ? 'Save Video' : 'Simpan Video',
      defaultPath: resolvedDefaultPath,
      filters
    };
  }

  // 7. Archive Files
  const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
  if (archiveExts.includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return {
      title: isEn ? 'Save Archive' : 'Simpan Arsip',
      defaultPath: resolvedDefaultPath,
      filters: [
        { name: 'Archive File (*.zip, *.rar, *.7z)', extensions: ['zip', 'rar', '7z', 'tar', 'gz'] },
        { name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
      ]
    };
  }

  // 8. PDF Documents
  if (ext === 'pdf' || mime.includes('pdf')) {
    return {
      title: isEn ? 'Save PDF Document' : 'Simpan Dokumen PDF',
      defaultPath: resolvedDefaultPath,
      filters: [
        { name: 'PDF Document (*.pdf)', extensions: ['pdf'] },
        { name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
      ]
    };
  }

  // 9. Generic File fallback
  const filters = [];
  if (ext) {
    filters.push({ name: `${ext.toUpperCase()} File (*.${ext})`, extensions: [ext] });
  }
  filters.push({ name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] });
  return {
    title: isEn ? 'Save File' : 'Simpan Berkas',
    defaultPath: resolvedDefaultPath,
    filters
  };
}

// Inisialisasi Ghostery AdBlocker
const customFetch = async (url, options = {}) => {
  if (url === 'custom:whitelist') {
    return {
      text: async () => `
! === WHITELIST ===
@@||challenges.cloudflare.com^
@@||turnstile.cloudflare.com^
@@||recu.me^
@@||googlevideo.com^

! === UBLOCK ORIGIN AGGRESSIVE AFFILIATE BLOCKER ===
! Blokir paksa semua parameter affiliate e-commerce (Shopee, Tokopedia, Lazada)
||shopee.*^*mmp_pid=
||shopee.*^*utm_medium=affiliates*
||shopee.*^*share_channel_code=*
||shopee.*^*uls_trackid=*
||lazada.*^*aff_click_id=*
||tokopedia.*^*aff_unique_id=*

! Blokir semua popup yang mengarah ke e-commerce dari situs antah berantah
||shopee.co.id^$popup,third-party
||shope.ee^$popup,third-party
||tokopedia.com^$popup,third-party
||tokopedia.link^$popup,third-party
||lazada.co.id^$popup,third-party
||blibli.com^$popup,third-party
||bukalapak.com^$popup,third-party

! Blokir network e-commerce jika dipanggil sebagai script/iframe tersembunyi
||shopee.co.id^$subdocument,third-party
||tokopedia.com^$subdocument,third-party
`,
      ok: true,
      status: 200
    };
  }

  // Gunakan Chromium net.fetch bawaan Electron (menghindari bug assert(!this.paused) undici di Node.js)
  try {
    if (app.isReady() && net && typeof net.fetch === 'function') {
      const resp = await net.fetch(url, {
        ...options,
        redirect: 'follow'
      });
      return resp;
    }
  } catch (netErr) {
    logStream(`[customFetch net.fetch error for ${url}]: ${netErr.message}`);
  }

  // Fallback aman jika net.fetch belum ready atau mengalami error
  try {
    return await fetch(url, options);
  } catch (err) {
    logStream(`[customFetch fallback error for ${url}]: ${err.message}`);
    return {
      text: async () => '',
      ok: false,
      status: 500
    };
  }
};

const adblockEnginePath = path.join(app.getPath('userData'), 'adblocker-engine.bin');
const adblockFilterLists = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt',
  'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/general.txt',
  'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/PopupFilter/sections/popups.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
  'custom:whitelist'
];

let adblockAbortController = null;
let isAdblockUpdating = false;

function applyEngineBlocker(blocker) {
  if (!blocker) return;
  engineBlocker = blocker;
  logStream('Ghostery AdBlocker engine loaded successfully.');
  
  // Wrap engineBlocker.onBeforeRequest to track blocked ads
  const originalOnBeforeRequest = engineBlocker.onBeforeRequest;
  engineBlocker.onBeforeRequest = (details, callback) => {
    const urlStr = details.url ? details.url.toLowerCase() : '';
    // Bypass adblocker for all subtitle/caption/timedtext/vtt/srt requests
    if (urlStr.includes('/api/timedtext') || 
        urlStr.includes('timedtext') || 
        urlStr.includes('captions') || 
        urlStr.includes('subtitles') || 
        urlStr.includes('.vtt') || 
        urlStr.includes('.srt')) {
      return callback({ cancel: false });
    }

    originalOnBeforeRequest(details, (response) => {
      try {
        if (response && (response.cancel || response.redirectURL)) {
          blockedCountSinceInstall++;
          
          let tabId = 'main';
          for (const win of openWindows) {
            if (win && !win.isDestroyed() && win.snifferViews) {
              for (const [tid, view] of win.snifferViews.entries()) {
                if (view.webContents && !view.webContents.isDestroyed() && details.webContentsId === view.webContents.id) {
                  tabId = tid;
                  break;
                }
              }
            }
          }
          
          blockedThisPageCount[tabId] = (blockedThisPageCount[tabId] || 0) + 1;
          
          let displayUrl = details.url;
          try {
            const urlObj = new URL(details.url);
            displayUrl = urlObj.hostname + urlObj.pathname;
            if (displayUrl.length > 80) displayUrl = displayUrl.slice(0, 77) + '...';
          } catch (e) {}
          
          recentBlockedRequests.unshift({
            url: displayUrl,
            fullUrl: details.url,
            type: details.resourceType || 'other',
            tabId,
            timestamp: Date.now()
          });
          
          if (recentBlockedRequests.length > 100) {
            recentBlockedRequests = recentBlockedRequests.slice(0, 100);
          }
          
          saveAdblockStats();
          broadcastAdblockStats();
        }
      } catch (err) {
        logStream(`Error in adblock tracker: ${err.message}`);
      }
      callback(response);
    });
  };

  if (adBlockEnabled && session.defaultSession) {
    try {
      engineBlocker.enableBlockingInSession(session.defaultSession);
    } catch (e) {
      logStream(`Failed to enable Ghostery AdBlocker: ${e.message}`);
    }
  }
}

// 1. Initial quick load on startup (using cached engine if available, or lightweight whitelist)
if (fs.existsSync(adblockEnginePath)) {
  ElectronBlocker.fromLists(customFetch, adblockFilterLists, {
    path: adblockEnginePath,
    read: fs.promises.readFile,
    write: fs.promises.writeFile,
  }).then(applyEngineBlocker).catch(err => {
    logStream(`[AdBlock] Failed to load cached engine: ${err.message}`);
  });
} else {
  ElectronBlocker.fromLists(customFetch, ['custom:whitelist']).then(applyEngineBlocker).catch(err => {
    logStream(`[AdBlock] Failed to init initial whitelist blocker: ${err.message}`);
  });
}

// 2. Background updater: only runs while main window is open
async function updateAdblockEngineInBackground() {
  if (isAdblockUpdating) return;
  if (openWindows.length === 0) return;

  const now = Date.now();
  if (fs.existsSync(adblockEnginePath)) {
    try {
      const stats = fs.statSync(adblockEnginePath);
      const ageMs = now - stats.mtimeMs;
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (ageMs < oneDayMs) {
        logStream(`[AdBlock] Cache engine adblock masih segar (${(ageMs / (1000 * 60 * 60)).toFixed(1)} jam), tidak perlu update.`);
        return;
      }
    } catch (e) {}
  }

  logStream('[AdBlock] Menjalankan pembaruan library filter adblock di latar belakang...');
  isAdblockUpdating = true;
  adblockAbortController = new AbortController();

  const fetchWithSignal = (url, opts = {}) => {
    return customFetch(url, { ...opts, signal: adblockAbortController ? adblockAbortController.signal : undefined });
  };

  const tempEnginePath = path.join(app.getPath('userData'), `adblocker-engine-temp-${Date.now()}.bin`);
  try {
    const newBlocker = await ElectronBlocker.fromLists(fetchWithSignal, adblockFilterLists, {
      path: tempEnginePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    });

    if ((adblockAbortController && adblockAbortController.signal.aborted) || openWindows.length === 0) {
      try { if (fs.existsSync(tempEnginePath)) fs.unlinkSync(tempEnginePath); } catch (e) {}
      logStream('[AdBlock] Pembaruan adblock dibatalkan karena aplikasi ditutup.');
      return;
    }

    try {
      if (fs.existsSync(tempEnginePath)) {
        fs.copyFileSync(tempEnginePath, adblockEnginePath);
        fs.unlinkSync(tempEnginePath);
      }
    } catch (e) {}

    if (openWindows.length > 0) {
      applyEngineBlocker(newBlocker);
      logStream('[AdBlock] Pembaruan filter adblock di latar belakang selesai.');
    }
  } catch (err) {
    try { if (fs.existsSync(tempEnginePath)) fs.unlinkSync(tempEnginePath); } catch (e) {}
    if (adblockAbortController && adblockAbortController.signal.aborted) {
      logStream('[AdBlock] Pembaruan filter adblock dibatalkan.');
    } else {
      logStream(`[AdBlock Error] Gagal memperbarui adblock di latar belakang: ${err.message}`);
    }
  } finally {
    isAdblockUpdating = false;
    adblockAbortController = null;
  }
}

function stopAdblockUpdate() {
  if (adblockAbortController) {
    try {
      adblockAbortController.abort();
    } catch (e) {}
    adblockAbortController = null;
  }
  isAdblockUpdating = false;
}


function createWindow (initialVideoPath = null) {
  logStream('Creating main window...');
  
  let videoPath = initialVideoPath;
  if (!videoPath && openWindows.length === 0) {
    // Only parse process.argv for the first window opened.
    const args = process.argv.slice(app.isPackaged ? 1 : 2);
    for (const arg of args) {
      try {
        if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
          const ext = path.extname(arg).toLowerCase();
          if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m3u8', '.m3u', '.ts', '.flv', '.wmv', '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
            videoPath = arg;
            break;
          }
        }
      } catch (e) {}
    }
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "NightHUB Player",
    icon: path.join(__dirname, '../public/icon.svg'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#18181b', // zinc-900 for light mode
      height: 40
    },
    backgroundMaterial: 'tabbed',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      zoomFactor: 1.0 // Skala diperkecil agar tidak terlalu besar
    },
    backgroundColor: '#00000000',
    autoHideMenuBar: true
  });

  if (typeof win.setMenu === 'function') {
    win.setMenu(null);
  }

  // Ensure window title in Taskbar and Task Manager is always "NightHUB Player"
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle("NightHUB Player");
  });

  // Initialize properties directly on the window!
  win.initialVideoPath = videoPath;
  win.snifferViews = new Map();
  win.activeTabId = null;
  win.tabSleepTimers = new Map();
  win.tabAudibleStates = new Map();

  // Set up periodic real-time sync of tab audible and muted state (extremely robust and handles background tabs in real-time)
  win.snifferSyncInterval = setInterval(() => {
    if (win.isDestroyed()) {
      clearInterval(win.snifferSyncInterval);
      return;
    }
    if (win.snifferViews) {
      for (const [tabId, view] of win.snifferViews.entries()) {
        if (view.webContents && !view.webContents.isDestroyed()) {
          try {
            const isPlaying = view.webContents.isCurrentlyAudible();
            const isMuted = view.webContents.isAudioMuted();
            updateTabAudibleState(win, tabId, isPlaying);
            win.webContents.send('sniffer-mute-updated', { tabId, isMuted });
          } catch (e) {}
        }
      }
    }
  }, 250);

  openWindows.push(win);
  if (!mainWindow) {
    mainWindow = win;
  }

  win.on('focus', () => {
    mainWindow = win;
    // Hide active passwords popup when user clicks back into the main window
    if (passwordsView && !passwordsView.isDestroyed()) {
      passwordsView.hide();
    }
    if (passwordPromptView && !passwordPromptView.isDestroyed()) {
      passwordPromptView.hide();
    }
    if (webContextMenuView && !webContextMenuView.isDestroyed()) {
      webContextMenuView.hide();
    }
  });

  win.on('blur', () => {
    // Hide active popups if the entire application loses focus (e.g. switching to Microsoft Edge)
    setTimeout(() => {
      const focusedWin = BrowserWindow.getFocusedWindow();
      if (!focusedWin) {
        if (passwordsView && !passwordsView.isDestroyed()) {
          passwordsView.hide();
        }
        if (passwordPromptView && !passwordPromptView.isDestroyed()) {
          passwordPromptView.hide();
        }
        if (suggestionsView && !suggestionsView.isDestroyed()) {
          suggestionsView.hide();
        }
        if (webContextMenuView && !webContextMenuView.isDestroyed()) {
          webContextMenuView.hide();
        }
      }
    }, 150);
  });

  win.on('closed', () => {
    openWindows = openWindows.filter(w => w !== win);
    if (mainWindow === win) {
      mainWindow = openWindows[openWindows.length - 1] || null;
    }
    
    if (win.snifferSyncInterval) {
      clearInterval(win.snifferSyncInterval);
    }

    // Clean up all sniffer views of this window
    if (win.snifferViews) {
      for (const view of win.snifferViews.values()) {
        try {
          view.webContents.destroy();
        } catch (e) {}
      }
      win.snifferViews.clear();
    }
    if (win.tabSleepTimers) {
      for (const timer of win.tabSleepTimers.values()) {
        clearTimeout(timer);
      }
      win.tabSleepTimers.clear();
    }
    if (win.tabAudibleStates) {
      for (const state of win.tabAudibleStates.values()) {
        if (state.silenceTimeout) {
          clearTimeout(state.silenceTimeout);
        }
      }
      win.tabAudibleStates.clear();
    }

    if (openWindows.length === 0) {
      terminateAllBackgroundProcessesAndExit();
    }
  });

  win.lastSuggestionsBounds = null;
  const handleRepositionSuggestions = () => {
    if (suggestionsView && !suggestionsView.isDestroyed() && suggestionsView.isVisible() && win.lastSuggestionsBounds) {
      const winBounds = win.getContentBounds();
      const x = Math.round(winBounds.x + win.lastSuggestionsBounds.x);
      const y = Math.round(winBounds.y + win.lastSuggestionsBounds.y + win.lastSuggestionsBounds.height + 4);
      const width = Math.round(win.lastSuggestionsBounds.width);
      suggestionsView.setBounds({ x, y, width, height: 340 });
    }
  };

  const handleRepositionFind = () => {
    if (findView && !findView.isDestroyed() && findView.isVisible()) {
      const winBounds = win.getContentBounds();
      const x = Math.round(winBounds.x + winBounds.width - 410);
      const y = Math.round(winBounds.y + 115);
      findView.setBounds({ x, y, width: 380, height: 160 });
    }
  };

  win.on('move', handleRepositionSuggestions);
  win.on('resize', handleRepositionSuggestions);
  win.on('move', handleRepositionFind);
  win.on('resize', handleRepositionFind);
  win.on('minimize', () => {
    if (passwordsView && !passwordsView.isDestroyed()) {
      passwordsView.hide();
    }
    if (webContextMenuView && !webContextMenuView.isDestroyed()) {
      webContextMenuView.hide();
    }
  });

  // Update titleBarOverlay when theme changes
  nativeTheme.on('updated', () => {
    if (win && !win.isDestroyed()) {
      win.setTitleBarOverlay({
        color: '#00000000',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#18181b'
      });
    }
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    win.loadURL('http://localhost:3000');
  }

  startBackgroundWorker(); // Spawn background worker when window is created

  // Trigger adblock library update strictly in background while main window is open
  setTimeout(() => {
    if (openWindows.length > 0) {
      updateAdblockEngineInBackground();
    }
  }, 2500);

  
  // --- NEW FEATURE: HARDWARE API PERMISSIONS ---
  // Grant permissions for Bluetooth and HID devices
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'bluetooth' || permission === 'hid') return true;
    return false;
  });
  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'bluetooth' || details.deviceType === 'hid') return true;
    return false;
  });

  createMenuView();
  createSuggestionsView();
  createFindView();
  createPasswordsView();
  createWebContextMenuView(win);

  // Reset zoom factor to default to fix any previously locked zoom states
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1.0);
  });

  // Intercept zoom shortcuts to only affect active snifferView if it exists
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      const activeView = getActiveSnifferView(win);
      toggleVideoFullscreenOrWindow(win, activeView);
      return;
    }

    if (input.type === 'keyDown' && (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r'))) {
      if (win.isSnifferOpen) {
        event.preventDefault();
        const activeView = getActiveSnifferView(win);
        if (activeView && activeView.webContents) {
          if (input.shift || (input.control && input.key === 'F5')) {
            activeView.webContents.reloadIgnoringCache();
          } else {
            activeView.webContents.reload();
          }
        }
        return;
      }
    }

    if ((input.control || input.meta) && input.type === 'keyDown') {
      if (!input.shift && input.key.toLowerCase() === 't') {
        const activeView = getActiveSnifferView(win);
        if (win.isSnifferOpen && activeView) {
          event.preventDefault();
          win.webContents.send('sniffer-shortcut-new-tab');
          return;
        } else {
          event.preventDefault();
          win.webContents.send('player-shortcut-toggle-trim');
          return;
        }
      }

      if (!input.shift && input.key.toLowerCase() === 'w') {
        event.preventDefault();
        const activeTabId = win.activeTabId || '';
        win.webContents.send('sniffer-shortcut-close-tab', activeTabId);
        return;
      }

      if (input.shift && input.key.toLowerCase() === 'k') {
        event.preventDefault();
        const activeView = getActiveSnifferView(win);
        const targetUrl = activeView && activeView.webContents ? activeView.webContents.getURL() : '';
        const activeTabId = win.activeTabId || '';
        win.webContents.send('sniffer-shortcut-duplicate-tab', activeTabId, targetUrl);
        return;
      }

      if (input.key === 'Tab' || input.code === 'Tab' || input.key === 'Backtab') {
        event.preventDefault();
        if (input.shift) {
          win.webContents.send('sniffer-shortcut-prev-tab');
        } else {
          win.webContents.send('sniffer-shortcut-next-tab');
        }
        return;
      }

      if (input.key.toLowerCase() === 'f') {
        event.preventDefault();
        showFindView();
        return;
      }

      if (!input.shift && input.key.toLowerCase() === 'l') {
        event.preventDefault();
        try {
          win.webContents.focus();
        } catch (e) {}
        win.webContents.send('sniffer-shortcut-focus-address-bar');
        return;
      }

      if (input.key === '=' || input.key === '+' || input.key === '-') {
        event.preventDefault(); // Always prevent main window from zooming
        const activeView = getActiveSnifferView(win);
        if (activeView && activeView.webContents) {
          const currentZoom = activeView.webContents.getZoomFactor();
          const newZoom = input.key === '-' ? currentZoom - 0.1 : currentZoom + 0.1;
          activeView.webContents.setZoomFactor(Math.max(0.2, Math.min(newZoom, 3.0)));
        }
      } else if (input.key === '0') {
        event.preventDefault(); // Always prevent main window from zooming
        const activeView = getActiveSnifferView(win);
        if (activeView && activeView.webContents) {
          activeView.webContents.setZoomFactor(1.0); // Default zoom factor for active view
        } else {
          // If no active view, reset main window to its default
          win.webContents.setZoomFactor(1.0);
        }
      }
    }
  });

  return win;
}

let menuView = null;
let lastMenuTriggerBounds = null;
let lastMenuWindow = null;
let lastMenuHeight = 130;
let suggestionsView = null;
let passwordsView = null;
let passwordPromptView = null;
let tabPreviewWindow = null;

// Store pending credential data to avoid race condition in password prompt
let pendingPasswordData = null;

let webContextMenuView = null;
let pendingWebContextMenuData = null;
const webContextMenuCallbacks = new Map();
let lastWebContextMenuHeight = 250;
let lastWebContextMenuWidth = 200;
let lastWebContextMenuClickX = 0;
let lastWebContextMenuClickY = 0;

function createPasswordPromptView(parentWin) {
  const { BrowserWindow } = require('electron');
  const parent = parentWin || mainWindow;
  passwordPromptView = new BrowserWindow({
    width: 340,
    height: 310,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    hasShadow: false,
    parent: parent,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  
  passwordPromptView.setAlwaysOnTop(true, 'screen-saver');
  
  const promptUrl = app.isPackaged 
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=password-prompt&lang=${currentLanguage}`
    : `http://localhost:3000?view=password-prompt&lang=${currentLanguage}`;
    
  passwordPromptView.loadURL(promptUrl);

  passwordPromptView.on('blur', () => {
    if (passwordPromptView && !passwordPromptView.isDestroyed()) {
      passwordPromptView.hide();
    }
  });
}

function createPasswordsView() {
  const { BrowserWindow } = require('electron');
  passwordsView = new BrowserWindow({
    width: 320,
    height: 380,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    hasShadow: false,
    parent: mainWindow,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  
  passwordsView.setAlwaysOnTop(true, 'screen-saver');
  
  const passwordsUrl = app.isPackaged 
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=passwords-menu&lang=${currentLanguage}`
    : `http://localhost:3000?view=passwords-menu&lang=${currentLanguage}`;
    
  passwordsView.loadURL(passwordsUrl);

  passwordsView.on('blur', () => {
    if (passwordsView && !passwordsView.isDestroyed()) {
      passwordsView.hide();
    }
  });
}

function createMenuView() {
  const { BrowserWindow } = require('electron');
  const acrylicEnabled = browserSettings.acrylicEnabled !== false;
  menuView = new BrowserWindow({
    width: 260, // Increased for shadowadow
    height: 130,
    frame: false,
    transparent: !acrylicEnabled,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    hasShadow: false,
    parent: mainWindow,
    backgroundMaterial: acrylicEnabled ? 'acrylic' : 'none',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  
  const menuUrl = app.isPackaged 
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=search-menu&lang=${currentLanguage}`
    : `http://localhost:3000?view=search-menu&lang=${currentLanguage}`;
    
  menuView.loadURL(menuUrl);
  
  menuView.on('blur', () => {
    menuView.webContents.send('hide-menu');
    setTimeout(() => {
      if (menuView && !menuView.isDestroyed()) {
        menuView.hide();
      }
    }, 100);
  });
}

function createSuggestionsView() {
  const { BrowserWindow } = require('electron');
  const acrylicEnabled = browserSettings.acrylicEnabled !== false;
  suggestionsView = new BrowserWindow({
    width: 600,
    height: 340,
    frame: false,
    transparent: !acrylicEnabled, // Set to false to allow backgroundMaterial to work
    alwaysOnTop: true,
    show: false,
    resizable: false,
    hasShadow: false,
    focusable: false,
    skipTaskbar: true,
    backgroundMaterial: acrylicEnabled ? 'acrylic' : 'none',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  
  const suggestionsUrl = app.isPackaged 
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=search-suggestions&lang=${currentLanguage}`
    : `http://localhost:3000?view=search-suggestions&lang=${currentLanguage}`;
    
  suggestionsView.loadURL(suggestionsUrl);

  suggestionsView.on('blur', () => {
    if (suggestionsView && !suggestionsView.isDestroyed()) {
      suggestionsView.hide();
    }
  });
}

function createFindView() {
  const { BrowserWindow } = require('electron');
  findView = new BrowserWindow({
    width: 380,
    height: 160,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    hasShadow: false,
    parent: mainWindow,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  
  const findUrl = app.isPackaged 
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=find-in-page&lang=${currentLanguage}`
    : `http://localhost:3000?view=find-in-page&lang=${currentLanguage}`;
    
  findView.loadURL(findUrl);
}

function createWebContextMenuView(parentWin) {
  const { BrowserWindow } = require('electron');
  const parent = parentWin || mainWindow;
  const acrylicEnabled = browserSettings.acrylicEnabled !== false;
  webContextMenuView = new BrowserWindow({
    width: lastWebContextMenuWidth || 200,
    height: lastWebContextMenuHeight || 250,
    frame: false,
    transparent: !acrylicEnabled,
    alwaysOnTop: true,
    show: false,
    resizable: false,
    hasShadow: true,
    parent: parent,
    focusable: true,
    backgroundMaterial: acrylicEnabled ? 'acrylic' : 'none',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  const url = app.isPackaged 
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=web-context-menu&lang=${currentLanguage}`
    : `http://localhost:3000?view=web-context-menu&lang=${currentLanguage}`;
    
  webContextMenuView.loadURL(url);

  webContextMenuView.on('blur', () => {
    if (webContextMenuView && !webContextMenuView.isDestroyed()) {
      webContextMenuView.hide();
    }
  });
}

function getWebContextMenuBounds(w, h) {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  let x = lastWebContextMenuClickX;
  let y = lastWebContextMenuClickY;

  if (x + w > screenWidth) {
    x = screenWidth - w - 8;
  }
  if (x < 8) x = 8;

  if (y + h > screenHeight) {
    y = screenHeight - h - 8;
  }
  if (y < 8) y = 8;

  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}

function showWebContextMenu(win, view, params, template) {
  if (!webContextMenuView || webContextMenuView.isDestroyed()) {
    createWebContextMenuView(win);
  }

  // Clear previous callbacks
  webContextMenuCallbacks.clear();

  // Process template: generate IDs and store callbacks
  const serializedItems = template.map((item, index) => {
    if (item.type === 'separator') {
      return { type: 'separator' };
    }

    const id = `item-${index}-${Date.now()}`;
    if (item.click) {
      webContextMenuCallbacks.set(id, item.click);
    }

    return {
      id: id,
      label: item.label,
      type: item.type || 'normal',
      checked: !!item.checked,
      enabled: item.enabled !== false,
      iconName: item.iconName || ''
    };
  });

  pendingWebContextMenuData = {
    items: serializedItems
  };

  // Calculate screen coordinates and remember click coordinates
  const viewBounds = view.getBounds();
  const winBounds = win.getContentBounds();
  lastWebContextMenuClickX = Math.round(winBounds.x + viewBounds.x + params.x);
  lastWebContextMenuClickY = Math.round(winBounds.y + viewBounds.y + params.y);

  const initialBounds = getWebContextMenuBounds(lastWebContextMenuWidth || 200, lastWebContextMenuHeight || 250);
  webContextMenuView.setBounds(initialBounds);
  
  const sendData = () => {
    webContextMenuView.webContents.send('show-web-context-menu-data', {
      items: serializedItems
    });
  };

  if (webContextMenuView.webContents.isLoading()) {
    webContextMenuView.webContents.once('did-finish-load', sendData);
  } else {
    sendData();
  }

  if (!webContextMenuView.isVisible()) {
    webContextMenuView.show();
  } else {
    webContextMenuView.show();
  }
  webContextMenuView.focus();
}

function showFindView() {
  if (!findView || findView.isDestroyed()) {
    createFindView();
  }

  const win = mainWindow;
  if (!win) return;

  const winBounds = win.getContentBounds();
  
  const x = Math.round(winBounds.x + winBounds.width - 410);
  const y = Math.round(winBounds.y + 115);
  
  if (findView && !findView.isDestroyed()) {
    findView.setBounds({ x, y, width: 380, height: 160 });
    if (!findView.isVisible()) {
      findView.show();
    } else {
      findView.focus();
    }
    findView.webContents.send('focus-input', { lang: currentLanguage });
  }
}

async function toggleVideoFullscreenOrWindow(win, view) {
  if (!win) return;
  if (!view || !view.webContents) {
    win.setFullScreen(!win.isFullScreen());
    return;
  }

  try {
    const result = await view.webContents.executeJavaScript(`
      (() => {
        const isFS = !!document.fullscreenElement;
        
        if (isFS) {
          document.exitFullscreen().catch(()=>{});
          return { handled: true };
        }
        
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length > 0) {
          // Find video that is playing
          let targetVideo = videos.find(v => !v.paused && !v.ended);
          // Fallback to the largest video on the screen
          if (!targetVideo) {
            targetVideo = videos.sort((a, b) => {
              const rectA = a.getBoundingClientRect();
              const rectB = b.getBoundingClientRect();
              return (rectB.width * rectB.height) - (rectA.width * rectA.height);
            })[0];
          }
          
          if (targetVideo) {
            targetVideo.requestFullscreen().catch(() => {
              targetVideo.parentElement?.requestFullscreen().catch(() => {});
            });
            return { handled: true };
          }
        }
        
        // Try YouTube style key events
        if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('youtu.be')) {
          const event = new KeyboardEvent('keydown', {
            key: 'f',
            code: 'KeyF',
            keyCode: 70,
            which: 70,
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(event);
          return { handled: true };
        }
        
        return { handled: false };
      })()
    `);

    if (!result || !result.handled) {
      win.setFullScreen(!win.isFullScreen());
    }
  } catch (err) {
    win.setFullScreen(!win.isFullScreen());
  }
}

function getActiveSnifferView(win = mainWindow) {
  if (!win) return null;
  const activeId = win.activeTabId;
  const views = win.snifferViews;
  return (activeId && views) ? views.get(activeId) : null;
}

// --- SNIFFER BROWSER LOGIC ---
const SLEEP_TIMEOUT = 15 * 60 * 1000; // 15 minutes

function clearSleepTimer(win, tabId) {
  if (!win || !win.tabSleepTimers) return;
  if (win.tabSleepTimers.has(tabId)) {
    clearTimeout(win.tabSleepTimers.get(tabId));
    win.tabSleepTimers.delete(tabId);
  }
}

function updateTabAudibleState(win, tabId, isAudible) {
  if (!win || win.isDestroyed()) return;
  if (!win.tabAudibleStates) {
    win.tabAudibleStates = new Map();
  }
  
  let state = win.tabAudibleStates.get(tabId);
  if (!state) {
    state = {
      reportedPlayState: false,
      silenceTimeout: null
    };
    win.tabAudibleStates.set(tabId, state);
  }
  
  if (isAudible) {
    if (state.silenceTimeout) {
      clearTimeout(state.silenceTimeout);
      state.silenceTimeout = null;
    }
    if (!state.reportedPlayState) {
      state.reportedPlayState = true;
      if (win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send('sniffer-media-playing', { tabId, isPlaying: true });
      }
    }
  } else {
    if (state.reportedPlayState && !state.silenceTimeout) {
      state.silenceTimeout = setTimeout(() => {
        state.reportedPlayState = false;
        state.silenceTimeout = null;
        if (win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('sniffer-media-playing', { tabId, isPlaying: false });
        }
      }, 5000); // 5 seconds silence delay
    }
  }
}

function clearTabAudibleState(win, tabId) {
  if (win && win.tabAudibleStates) {
    const state = win.tabAudibleStates.get(tabId);
    if (state) {
      if (state.silenceTimeout) {
        clearTimeout(state.silenceTimeout);
      }
      win.tabAudibleStates.delete(tabId);
    }
  }
}

function captureTabPreview(win, tabId) {
  if (!win || win.isDestroyed() || !win.snifferViews) return;
  const view = win.snifferViews.get(tabId);
  if (view && view.webContents && !view.webContents.isDestroyed()) {
    view.webContents.capturePage().then(img => {
      const dataUrl = img.toDataURL({ scaleFactor: 0.4 });
      win.webContents.send('sniffer-tab-preview', { tabId, preview: dataUrl });
    }).catch(err => {
      logStream(`[CAPTURE PREVIEW ERROR] Failed to capture page for tab ${tabId}: ${err.message}`);
    });
  }
}

function showTabPreview(win, { tabId, x, y, width, height, title, url, isSleeping, favicon, preview, lang }) {
  if (!win || win.isDestroyed()) return;
  const { BrowserWindow, nativeTheme } = require('electron');
  const isDark = nativeTheme.shouldUseDarkColors;
  
  let displayDomain = 'New Tab';
  if (url) {
    if (url.startsWith('nighthub://')) {
      displayDomain = url.replace('nighthub://', 'NightHUB // ');
    } else {
      try {
        const u = new URL(url);
        displayDomain = u.hostname;
      } catch (e) {
        displayDomain = url;
      }
    }
  }

  const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  };

  const escapedTitle = escapeHtml(title);
  const escapedFavicon = favicon ? favicon : '';
  const escapedPreview = preview ? preview : '';
  const escapedDomain = escapeHtml(displayDomain);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: ${isDark ? '#1e1e1e' : '#ffffff'};
          overflow: hidden;
          user-select: none;
        }
        .popover-container {
          width: 280px;
          height: 215px;
          box-sizing: border-box;
          background: ${isDark ? '#1e1e1e' : '#ffffff'};
          border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .thumbnail-container {
          width: 100%;
          height: 140px;
          background: ${isDark ? '#1f1f1f' : '#f4f4f5'};
          border-bottom: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'};
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .thumbnail-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .placeholder-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .placeholder-text {
          font-size: 10px;
          font-family: monospace;
          color: ${isDark ? '#71717a' : '#a1a1aa'};
          margin-top: 8px;
          letter-spacing: 0.05em;
        }
        .details {
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .favicon {
          width: 14px;
          height: 14px;
          border-radius: 3px;
          flex-shrink: 0;
          object-fit: contain;
        }
        .globe-icon {
          width: 14px;
          height: 14px;
          opacity: 0.5;
          color: ${isDark ? '#a1a1aa' : '#71717a'};
        }
        .title {
          font-size: 12px;
          font-weight: 600;
          color: ${isDark ? '#f4f4f5' : '#18181b'};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin: 0;
        }
        .domain {
          font-size: 10px;
          font-family: monospace;
          color: ${isDark ? '#a1a1aa' : '#71717a'};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding-left: 20px;
        }
        .sleeping-banner {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)'};
          color: #10b981;
        }
        .sleeping-text {
          font-size: 9px;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="popover-container">
        <div class="thumbnail-container">
          ${escapedPreview ? `
            <img class="thumbnail-img" src="${escapedPreview}" />
          ` : `
            <div class="placeholder-container">
              ${escapedFavicon ? `<img class="favicon" style="width: 32px; height: 32px; border-radius: 6px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" src="${escapedFavicon}" />` : `
                <svg class="globe-icon" style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
              `}
              <div class="placeholder-text">${lang === 'id' ? 'TIDAK ADA PRATINJAU' : 'NO PREVIEW'}</div>
            </div>
          `}
        </div>
        <div class="details">
          <div class="title-row">
            ${escapedFavicon ? `<img class="favicon" src="${escapedFavicon}" />` : `
              <svg class="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            `}
            <h3 class="title">${escapedTitle || 'New Tab'}</h3>
          </div>
          <div class="domain">${escapedDomain}</div>
          ${isSleeping ? `
            <div class="sleeping-banner">
              <svg style="width: 10px; height: 10px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 3.5 2 5.5a7 7 0 0 1-7 7M12 14v6M12 14c1.5 0 3 .5 4 1.5M12 14c-1.5 0-3 .5-4 1.5"></path>
              </svg>
              <span class="sleeping-text">${lang === 'id' ? 'Tab ini sedang tidur' : 'This tab is sleeping'}</span>
            </div>
          ` : ''}
        </div>
      </div>
    </body>
    </html>
  `;

  const popoverWidth = 280;
  const popoverHeight = 215;

  const winBounds = win.getBounds();
  let left = winBounds.x + x + (width / 2) - (popoverWidth / 2);
  left = Math.max(winBounds.x + 8, left);
  const maxLeft = winBounds.x + winBounds.width - popoverWidth - 8;
  left = Math.min(left, maxLeft);

  const top = winBounds.y + 44;

  if (!tabPreviewWindow || tabPreviewWindow.isDestroyed()) {
    tabPreviewWindow = new BrowserWindow({
      width: popoverWidth,
      height: popoverHeight,
      x: Math.round(left),
      y: Math.round(top),
      frame: false,
      transparent: false,
      backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
      show: false,
      focusable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      parent: win,
      type: 'utility',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });
  } else {
    tabPreviewWindow.setBounds({
      x: Math.round(left),
      y: Math.round(top),
      width: popoverWidth,
      height: popoverHeight
    });
  }

  const encodedHtml = Buffer.from(html).toString('base64');
  tabPreviewWindow.loadURL(`data:text/html;charset=utf-8;base64,${encodedHtml}`);

  tabPreviewWindow.once('ready-to-show', () => {
    if (tabPreviewWindow && !tabPreviewWindow.isDestroyed()) {
      tabPreviewWindow.showInactive();
    }
  });
}

function hideTabPreview() {
  if (tabPreviewWindow && !tabPreviewWindow.isDestroyed()) {
    tabPreviewWindow.close();
    tabPreviewWindow = null;
  }
}

function startSleepTimer(win, tabId) {
  if (!win || !win.tabSleepTimers) return;
  clearSleepTimer(win, tabId);
  const timer = setTimeout(() => {
    sleepTab(win, tabId);
  }, SLEEP_TIMEOUT);
  win.tabSleepTimers.set(tabId, timer);
}

function sleepTab(win, tabId) {
  if (!win || !win.snifferViews) return;
  if (activeDownloadTabs.has(tabId)) {
    logStream(`[SLEEP TAB] Tab ${tabId} has active downloads, skipping sleep`);
    return;
  }
  if (win.activeTabId === tabId) {
    // Don't sleep the currently active tab
    return;
  }
  const view = win.snifferViews.get(tabId);
  if (view) {
    if (view.webContents && !view.webContents.isDestroyed() && view.webContents.isCurrentlyAudible()) {
      logStream(`[SLEEP TAB] Tab ${tabId} is currently playing audio, keeping awake and rescheduling sleep`);
      startSleepTimer(win, tabId);
      return;
    }
    try {
      win.contentView.removeChildView(view);
      if (view.webContents && !view.webContents.isDestroyed()) {
        view.webContents.destroy();
      }
      win.snifferViews.delete(tabId);
      clearTabAudibleState(win, tabId);
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-tab-slept', tabId);
      }
      logStream(`[SLEEP TAB] Tab ${tabId} put to sleep after 15 minutes of inactivity`);
    } catch (e) {
      logStream(`[ERROR] Failed to sleep tab ${tabId}: ${e.message}`);
    }
  }
}

function getAdjustedSnifferBounds(win, bounds) {
  if (!bounds) return bounds;
  let adjustedBounds = { ...bounds };
  if (win && typeof win.isFullScreen === 'function' && !win.isFullScreen()) {
    if (adjustedBounds.width > 0 && adjustedBounds.height > 0 && adjustedBounds.y < 95) {
      const topOffset = 100;
      const diff = topOffset - adjustedBounds.y;
      adjustedBounds.y = topOffset;
      adjustedBounds.height = Math.max(0, adjustedBounds.height - diff);
    }
  }
  return adjustedBounds;
}

function createSnifferWindow(win, url, bounds, tabId = 'default', background = false, isTabSwitch = false) {
  if (!win || win.isDestroyed()) return;

  const currentActiveTabId = win.activeTabId;
  if (!background && currentActiveTabId && currentActiveTabId !== tabId && win.snifferViews) {
    const prevView = win.snifferViews.get(currentActiveTabId);
    if (prevView && prevView.webContents && !prevView.webContents.isDestroyed()) {
      prevView.webContents.capturePage().then(img => {
        const dataUrl = img.toDataURL({ scaleFactor: 0.4 });
        win.webContents.send('sniffer-tab-preview', { tabId: currentActiveTabId, preview: dataUrl });
      }).catch(err => {});
    }
  }

  if (!background) {
    win.activeTabId = tabId;
    clearSleepTimer(win, tabId);
  }

  // Hide all other views if not background
  if (!background && win.snifferViews) {
    for (const [id, view] of win.snifferViews.entries()) {
      if (id !== tabId) {
        try {
          // Use off-screen non-zero bounds instead of 0x0 to ensure Chromium still reports isCurrentlyAudible() correctly in real-time!
          view.setBounds({ x: -20000, y: -20000, width: 800, height: 600 });
          // Note: DO NOT remove from contentView so background media (like YouTube) keeps playing and tabs don't get suspended.
          // Start sleep timer for inactive tabs if not already started
          if (win.tabSleepTimers && !win.tabSleepTimers.has(id)) {
            startSleepTimer(win, id);
          }
        } catch (e) {}
      }
    }
  }

  let view = win.snifferViews ? win.snifferViews.get(tabId) : null;

  if (view) {
    try {
      if (url && !isTabSwitch && view.webContents.getURL() !== url) {
        view.webContents.loadURL(url);
      }
      const isBlank = !url || url === '' || url === 'about:blank' || (bounds && (bounds.width === 0 || bounds.height === 0));
      if (bounds && !background) {
        try {
          win.contentView.addChildView(view);
        } catch (e) {}
        view.setBounds(getAdjustedSnifferBounds(win, bounds));
        if (isBlank) {
          try {
            win.webContents.focus();
          } catch (e) {}
        } else {
          try {
            if (!win.webContents.isFocused()) {
              view.webContents.focus();
            }
          } catch (e) {
            try {
              view.webContents.focus();
            } catch (err) {}
          }
        }
      } else if (background) {
        view.setBounds({ x: -20000, y: -20000, width: 800, height: 600 });
        try {
          win.contentView.addChildView(view);
        } catch (e) {}
      }
      if (view.webContents && !view.userMuted) {
        view.webContents.setAudioMuted(false);
      }

      // Update navigation state when switching to this tab
      if (win && !win.isDestroyed() && view.webContents) {
        win.webContents.send('sniffer-nav-state-updated', {
          tabId,
          canGoBack: view.webContents.navigationHistory.canGoBack(),
          canGoForward: view.webContents.navigationHistory.canGoForward()
        });
        win.webContents.send('sniffer-tab-awoken', tabId);
        // Sync real-time audible state on tab switch
        win.webContents.send('sniffer-media-playing', { tabId, isPlaying: view.webContents.isCurrentlyAudible() });
        
        // Beritahu webContents tab bahwa tab ini telah aktif kembali agar SPA (HuggingFace, dsb) menyegarkan auth state
        try {
          view.webContents.send('sniffer-tab-activated');
        } catch (e) {}

        // Capture new active tab preview after switch settling
        setTimeout(() => {
          if (win && !win.isDestroyed() && win.activeTabId === tabId) {
            captureTabPreview(win, tabId);
          }
        }, 600);
      }

      return;
    } catch (e) {
      logStream(`[ERROR] Failed to reuse snifferView for tab ${tabId}: ${e.message}`);
      try {
        win.contentView.removeChildView(view);
      } catch (err) {}
      if (win.snifferViews) win.snifferViews.delete(tabId);
      view = null;
    }
  }

  const { WebContentsView } = require('electron');
  view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'sniffer-preload.cjs'),
      zoomFactor: 1.0,
      backgroundThrottling: false
    }
  });
  
  // Set background color to transparent to allow Mica effect to show through
  view.setBackgroundColor('#00000000');
  view.userMuted = false;

  if (win.snifferViews) win.snifferViews.set(tabId, view);
  
  try {
    win.contentView.addChildView(view);
  } catch (e) {}

  const isBlank = !url || url === '' || url === 'about:blank' || (bounds && (bounds.width === 0 || bounds.height === 0));
  if (background) {
    view.setBounds({ x: -20000, y: -20000, width: 800, height: 600 });
  } else {
    if (bounds) {
      view.setBounds(getAdjustedSnifferBounds(win, bounds));
    } else {
      const winBounds = win.getBounds();
      view.setBounds({ x: 0, y: 100, width: winBounds.width, height: winBounds.height - 100 });
    }
    if (isBlank) {
      try {
        win.webContents.focus();
      } catch (e) {}
    } else {
      try {
        if (!win.webContents.isFocused()) {
          view.webContents.focus();
        }
      } catch (e) {
        try {
          view.webContents.focus();
        } catch (err) {}
      }
    }
  }
  
  if (win && !win.isDestroyed()) {
    win.webContents.send('sniffer-tab-awoken', tabId);
  }

  // Set User Agent
  const chromeMatch = app.userAgentFallback.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
  const chromeVersion = chromeMatch ? chromeMatch[1] : '116.0.0.0';
  const mobileUA = `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
  const desktopUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

  if (view.webContents) {
    view.webContents.setUserAgent(snifferIsMobile ? mobileUA : desktopUA);
  }

  // --- POPUP BLOCKER ---
  if (view.webContents) {
    view.webContents.setWindowOpenHandler(({ url: popupUrl, disposition, userGesture }) => {
      view.lastPopupTime = Date.now();
      view.lastPopupUrl = popupUrl;

      // Walaupun userGesture-nya TRUE (karena jebakan klik transparan),
      // kalau URL-nya ngandung parameter affiliate binal ini atau e-commerce popup, Bantai!
      const lowerPopupUrl = (popupUrl || '').toLowerCase();
      if ((popupBlockEnabled || adBlockEnabled) && (
        lowerPopupUrl.includes('mmp_pid=') || 
        lowerPopupUrl.includes('utm_medium=affiliates') || 
        lowerPopupUrl.includes('uls_trackid=') ||
        lowerPopupUrl.includes('share_channel_code=') ||
        lowerPopupUrl.includes('shope.ee') ||
        lowerPopupUrl.includes('tokopedia.link') ||
        lowerPopupUrl.includes('c.lazada')
      )) {
        logStream(`[Bantai] Affiliate licik ketangkap basah: ${popupUrl}`);
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('video-detected', {
            url: popupUrl || 'about:blank',
            type: 'POPUP (BLOCKED)',
            timestamp: Date.now(),
            title: 'Affiliate Blocked'
          });
        }
        return { action: 'deny' };
      }

      // 1. Allow important login/OAuth popups to be opened as real popups, NOT redirected to a tab
      if (isAllowedAuthOrOAuth(popupUrl)) {
        logStream(`[POPUP ALLOWED - OAUTH] Membuka jendela login OAuth: ${popupUrl}`);
        return { 
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true
            }
          }
        };
      }

      // 2. If user clicked and popup is empty or about:blank (standard launcher for Google One Tap / OAuth SDKs)
      const isBlankLauncher = userGesture === true && (!popupUrl || lowerPopupUrl === 'about:blank' || lowerPopupUrl.startsWith('about:blank'));
      if (isBlankLauncher) {
        logStream(`[POPUP ALLOWED - USER GESTURE BLANK] Membuka launcher popup kosong untuk aksi pengguna: ${popupUrl || 'about:blank'}`);
        return { 
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true
            }
          }
        };
      }

      // 3. Block programmatic popup triggers (no user gesture) if popup blocking is enabled
      if (popupBlockEnabled && userGesture === false) {
        logStream(`[POPUP BLOCKED - NO USER GESTURE] Denied automatic window open: ${popupUrl}`);
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('video-detected', {
            url: popupUrl || 'about:blank',
            type: 'POPUP (BLOCKED)',
            timestamp: Date.now(),
            title: 'Automatic Popup'
          });
        }
        return { action: 'deny' };
      }

      // 4. Block popup/new tab if it's an ad URL, matches adblocker rules
      if ((popupBlockEnabled || adBlockEnabled) && isUrlAdOrBlocked(popupUrl, true)) {
        logStream(`[POPUP BLOCKED - ADBLOCK MATCH] Denied opening new tab/popup for: ${popupUrl}`);
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('video-detected', {
            url: popupUrl || 'about:blank',
            type: 'POPUP (BLOCKED)',
            timestamp: Date.now(),
            title: view.webContents ? view.webContents.getTitle() : 'Unknown'
          });
        }
        return { action: 'deny' };
      }

      // 5. Handle middle-click or Ctrl+click that triggers window open (untuk url aman/same-domain)
      if (disposition === 'background-tab' || disposition === 'foreground-tab' || disposition === 'new-window') {
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('open-new-tab', {
            url: popupUrl,
            background: disposition === 'background-tab'
          });
        }
        return { action: 'deny' };
      }
      
      if (popupBlockEnabled) {
        return { action: 'allow' };
      }
      return { action: 'allow' };
    });

    view.webContents.on('did-create-window', (childWindow, details) => {
      // Remove default menu bar (File, Edit, View, etc.) from child popup windows
      if (childWindow && !childWindow.isDestroyed()) {
        try {
          if (typeof childWindow.setMenu === 'function') {
            childWindow.setMenu(null);
          }
        } catch (e) {}
      }

      const initialUrl = details.url || '';
      let isChildOAuth = isAllowedAuthOrOAuth(initialUrl);

      // Always set standard Desktop User Agent or Firefox UA on child windows/popups to bypass Google login / OAuth blocks
      if (childWindow && childWindow.webContents) {
        const chromeMatch = app.userAgentFallback.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
        const chromeVersion = chromeMatch ? chromeMatch[1] : '116.0.0.0';
        const desktopUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
        const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

        const updateChildUA = (urlToCheck) => {
          if (!childWindow || childWindow.isDestroyed() || !childWindow.webContents) return;
          try {
            if (isAllowedAuthOrOAuth(urlToCheck)) {
              childWindow.webContents.setUserAgent(firefoxUA);
            } else {
              childWindow.webContents.setUserAgent(desktopUA);
            }
          } catch (e) {}
        };

        updateChildUA(initialUrl);

        // Intercept navigation & redirects for newly created popup/child windows
        const handleChildNavigation = (e, targetUrl) => {
          if (!targetUrl) return;
          const lowerTarget = targetUrl.toLowerCase();

          // Allow about:blank during initial window setup
          if (lowerTarget === 'about:blank' || lowerTarget.startsWith('about:')) {
            return;
          }

          // If navigating to an OAuth / SSO login endpoint, ALWAYS allow and protect it!
          if (isAllowedAuthOrOAuth(targetUrl)) {
            isChildOAuth = true;
            updateChildUA(targetUrl);
            logStream(`[CHILD WINDOW OAUTH NAV] Navigasi login OAuth diizinkan: ${targetUrl}`);
            return;
          }

          // If this child window was established as an OAuth session and is redirecting back to website (e.g. callback with code/token)
          if (isChildOAuth) {
            logStream(`[CHILD WINDOW OAUTH RETURN] Menyelesaikan callback login OAuth: ${targetUrl}`);
            return;
          }

          // Destroy child window ONLY if it navigates to a confirmed ad or blocked domain
          if (isUrlAdOrBlocked(targetUrl, true)) {
            logStream(`[CHILD WINDOW BLOCKED NAVIGATION] Menutup child window yang menuju ke iklan: ${targetUrl}`);
            if (e && typeof e.preventDefault === 'function') {
              e.preventDefault();
            }
            try { childWindow.destroy(); } catch (err) {}
          }
        };

        childWindow.webContents.on('will-navigate', handleChildNavigation);
        childWindow.webContents.on('will-redirect', handleChildNavigation);
        childWindow.webContents.on('did-start-navigation', (e, targetUrl, isInPlace, isMainFrame) => {
          if (isMainFrame) {
            handleChildNavigation(e, targetUrl);
          }
        });
      }

      // If this popup was opened directly with an OAuth URL, keep it open
      if (isChildOAuth) {
        logStream(`[POPUP ALLOWED] Membiarkan popup login OAuth terbuka: ${initialUrl}`);
        return;
      }

      // If initial URL is blank or about:blank, give it a 5-second grace period to navigate to OAuth
      const isBlank = !initialUrl || initialUrl.toLowerCase() === 'about:blank' || initialUrl.toLowerCase().startsWith('about:');
      if (isBlank) {
        const graceTimer = setTimeout(() => {
          if (childWindow && !childWindow.isDestroyed()) {
            const currentUrl = childWindow.webContents ? childWindow.webContents.getURL() : '';
            if (!isAllowedAuthOrOAuth(currentUrl) && (!currentUrl || currentUrl.startsWith('about:'))) {
              logStream(`[POPUP GRACE EXPIRED] Menutup popup kosong yang tidak terpakai: ${currentUrl}`);
              try { childWindow.destroy(); } catch (e) {}
            }
          }
        }, 5000);

        childWindow.on('closed', () => clearTimeout(graceTimer));
        return;
      }

      // Only destroy if it's a known ad or popup block is enabled on non-auth URLs
      if (popupBlockEnabled || (adBlockEnabled && isUrlAdOrBlocked(initialUrl, true))) {
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('video-detected', {
            url: initialUrl,
            type: 'POPUP (BLOCKED)',
            timestamp: Date.now(),
            title: view.webContents ? view.webContents.getTitle() : 'Unknown'
          });
        }

        logStream(`[POPUP SILENT DESTROY] Menutup popup iklan: ${initialUrl}`);
        try {
          childWindow.destroy();
        } catch (e) {}
      }
    });
  }

  // --- CUSTOM SCROLLBAR & CORNERS INJECTION ---
  if (view.webContents) {
    view.webContents.on('dom-ready', () => {
      if (view.webContents) {
        view.webContents.insertCSS(`
          html, body {
            overscroll-behavior: auto !important;
          }
          ::-webkit-scrollbar {
            width: 3px !important;
            height: 3px !important;
            background: transparent !important;
          }
          ::-webkit-scrollbar-corner {
            background: transparent !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background-color: rgba(129, 129, 129, 0.45) !important;
            border-radius: 4px !important;
          }
          ::-webkit-scrollbar-thumb:hover {
            background-color: rgba(153, 153, 153, 0.6) !important;
          }
        `);
      }
    });
  }

  // --- TAB INFO UPDATES ---
  if (view.webContents) {
    view.webContents.on('found-in-page', (event, result) => {
      if (findView && !findView.isDestroyed()) {
        findView.webContents.send('found-in-page-result', {
          activeMatchOrdinal: result.activeMatchOrdinal,
          matches: result.matches,
          finalUpdate: result.finalUpdate
        });
      }
    });

    view.webContents.on('page-title-updated', (event, title) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-title-updated', { tabId, title });
        setTimeout(() => {
          if (win && !win.isDestroyed() && win.activeTabId === tabId) {
            captureTabPreview(win, tabId);
          }
        }, 1200);
      }
    });

    view.webContents.on('page-favicon-updated', (event, favicons) => {
      if (win && !win.isDestroyed() && favicons.length > 0) {
        win.webContents.send('sniffer-favicon-updated', { tabId, favicon: favicons[0] });
      }
    });

    const sendUrlUpdate = (newUrl) => {
      if (isLikelyDownloadUrl(newUrl)) {
        logStream(`[URL UPDATE FILTER] Blocked updating tab ${tabId} URL to download/media link: ${newUrl}`);
        return;
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-url-updated', { tabId, url: newUrl });
      }
    };

    // Handle drag and drop
    view.webContents.on('will-navigate', (event, newUrl) => {
      if (newUrl.startsWith('file://')) {
        event.preventDefault();
        if (win && !win.isDestroyed()) {
          let filePath = newUrl.replace('file://', '');
          try { filePath = decodeURIComponent(filePath); } catch(e) {}
          win.webContents.send('open-file', filePath);
        }
        return;
      }

      // Check if navigation is to an ad or blocked affiliate URL
      if ((adBlockEnabled || popupBlockEnabled) && isUrlAdOrBlocked(newUrl, true)) {
        logStream(`[TAB NAVIGATION BLOCKED] Prevented tab navigating to Ad or Affiliate URL: ${newUrl}`);
        event.preventDefault();
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('video-detected', {
            url: newUrl,
            type: 'POPUP (BLOCKED)',
            timestamp: Date.now(),
            title: 'Ad Navigation Blocked'
          });
        }
        return;
      }

      // Tab-under / redirect protection heuristic
      if (popupBlockEnabled && view.lastPopupTime && (Date.now() - view.lastPopupTime < 2500)) {
          try {
            const currentUrl = view.webContents.getURL();
            if (currentUrl && currentUrl.startsWith('http')) {
              const currentHost = new URL(currentUrl).hostname;
              const newHost = new URL(newUrl).hostname;
              
              const getRootDomain = (hostname) => {
                const parts = hostname.split('.');
                if (parts.length <= 2) return hostname;
                const penult = parts[parts.length - 2];
                if (['co', 'com', 'net', 'org', 'gov', 'edu'].includes(penult)) {
                  return parts.slice(-3).join('.');
                }
                return parts.slice(-2).join('.');
              };

              const currentRoot = getRootDomain(currentHost);
              const newRoot = getRootDomain(newHost);

              if (currentRoot && newRoot && currentRoot !== newRoot) {
                logStream(`[TAB-UNDER BLOCKED] Terdeteksi pembajakan tab-under dari ${currentHost} ke ${newHost}. Navigasi dibatalkan.`);
                event.preventDefault();
                
                // Kirim notifikasi ke frontend
                if (win && !win.isDestroyed() && win.webContents) {
                  win.webContents.send('video-detected', {
                    url: newUrl,
                    type: 'REDIRECT (BLOCKED)',
                    timestamp: Date.now(),
                    title: `Redirect Blocked: ${newHost}`
                  });
                }
                return;
              }
            }
          } catch (e) {
            logStream(`[TAB-UNDER ERROR] Gagal memeriksa domain tab-under: ${e.message}`);
          }
        }
        sendUrlUpdate(newUrl);
    });

    view.webContents.on('will-redirect', (event, newUrl) => {
      if ((adBlockEnabled || popupBlockEnabled) && isUrlAdOrBlocked(newUrl, true)) {
        logStream(`[TAB REDIRECT BLOCKED] Prevented tab redirecting to Ad or Affiliate URL: ${newUrl}`);
        event.preventDefault();
        if (win && !win.isDestroyed() && win.webContents) {
          win.webContents.send('video-detected', {
            url: newUrl,
            type: 'POPUP (BLOCKED)',
            timestamp: Date.now(),
            title: 'Ad Redirect Blocked'
          });
        }
      }
    });

    const clearTabBlockedCount = () => {
      blockedThisPageCount[tabId] = 0;
      broadcastAdblockStats();
    };

    view.webContents.on('did-navigate', (event, newUrl) => {
      clearTabBlockedCount();
      sendUrlUpdate(newUrl);
      if (passwordsView && !passwordsView.isDestroyed()) {
        passwordsView.hide();
      }
      setTimeout(() => {
        if (win && !win.isDestroyed() && win.activeTabId === tabId) {
          captureTabPreview(win, tabId);
        }
      }, 1000);
    });
    view.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      if (isMainFrame) {
        clearTabBlockedCount();
        sendUrlUpdate(url);
        if (passwordsView && !passwordsView.isDestroyed()) {
          passwordsView.hide();
        }
      }
    });
    view.webContents.on('did-redirect-navigation', (event, newUrl, isInPlace, isMainFrame) => {
      if (isMainFrame) {
        clearTabBlockedCount();
        sendUrlUpdate(newUrl);
        if (passwordsView && !passwordsView.isDestroyed()) {
          passwordsView.hide();
        }
      }
    });

    // Intercept zoom shortcuts inside view
    view.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && view.webContents) {
        if (input.key === 'F11') {
          event.preventDefault();
          toggleVideoFullscreenOrWindow(win, view);
          return;
        }

        if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
          event.preventDefault();
          if (input.shift || (input.control && input.key === 'F5')) {
            view.webContents.reloadIgnoringCache();
          } else {
            view.webContents.reload();
          }
        } else if ((input.control || input.meta) && input.key.toLowerCase() === 'f') {
          event.preventDefault();
          showFindView();
        } else if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'k') {
          event.preventDefault();
          if (win && !win.isDestroyed()) {
            const currentActiveId = win.activeTabId || tabId;
            const currentActiveView = (win.snifferViews && win.snifferViews.get(currentActiveId)) || view;
            const currentUrl = currentActiveView && currentActiveView.webContents ? currentActiveView.webContents.getURL() : '';
            win.webContents.send('sniffer-shortcut-duplicate-tab', currentActiveId, currentUrl);
          }
        } else if ((input.control || input.meta) && !input.shift && input.key.toLowerCase() === 'w') {
          event.preventDefault();
          if (win && !win.isDestroyed()) {
            const currentActiveId = win.activeTabId || tabId;
            win.webContents.send('sniffer-shortcut-close-tab', currentActiveId);
          }
        } else if ((input.control || input.meta) && !input.shift && input.key.toLowerCase() === 't') {
          event.preventDefault();
          if (win && !win.isDestroyed()) {
            try {
              win.webContents.focus();
            } catch (e) {}
            win.webContents.send('sniffer-shortcut-new-tab');
          }
        } else if ((input.control || input.meta) && (input.key === 'Tab' || input.code === 'Tab' || input.key === 'Backtab')) {
          event.preventDefault();
          if (win && !win.isDestroyed()) {
            if (input.shift) {
              win.webContents.send('sniffer-shortcut-prev-tab');
            } else {
              win.webContents.send('sniffer-shortcut-next-tab');
            }
          }
        } else if ((input.control || input.meta) && !input.shift && input.key.toLowerCase() === 'l') {
          event.preventDefault();
          if (win && !win.isDestroyed()) {
            try {
              win.webContents.focus();
            } catch (e) {}
            win.webContents.send('sniffer-shortcut-focus-address-bar');
          }
        } else if (input.control || input.meta) {
          if (input.key === '=' || input.key === '+' || input.key === '-') {
            event.preventDefault();
            const currentZoom = view.webContents.getZoomFactor();
            const newZoom = input.key === '-' ? currentZoom - 0.1 : currentZoom + 0.1;
            view.webContents.setZoomFactor(Math.max(0.2, Math.min(newZoom, 3.0)));
          } else if (input.key === '0') {
            event.preventDefault();
            view.webContents.setZoomFactor(1.0);
          }
        }
      }
    });

    // Context Menu
    view.webContents.on('context-menu', async (event, params) => {
      event.preventDefault();
      const { Menu, clipboard, nativeImage } = require('electron');
      const template = [];
      const getLabel = (idLabel, enLabel) => {
        return currentLanguage === 'en' ? enLabel : idLabel;
      };

      if (params.isEditable) {
        // Textbox / input field context menu
        template.push(
          { label: getLabel('Urungkan', 'Undo'), iconName: 'undo', click: () => view.webContents.undo(), enabled: params.editFlags.canUndo },
          { label: getLabel('Ulangi', 'Redo'), iconName: 'redo', click: () => view.webContents.redo(), enabled: params.editFlags.canRedo },
          { type: 'separator' },
          { label: getLabel('Potong', 'Cut'), iconName: 'cut', click: () => view.webContents.cut(), enabled: params.editFlags.canCut },
          { label: getLabel('Salin', 'Copy'), iconName: 'copy', click: () => view.webContents.copy(), enabled: params.editFlags.canCopy },
          { label: getLabel('Tempel', 'Paste'), iconName: 'paste', click: () => view.webContents.paste(), enabled: params.editFlags.canPaste },
          { label: getLabel('Hapus', 'Delete'), iconName: 'delete', click: () => view.webContents.delete(), enabled: params.editFlags.canDelete },
          { type: 'separator' },
          { label: getLabel('Pilih Semua', 'Select All'), iconName: 'selectAll', click: () => view.webContents.selectAll(), enabled: params.editFlags.canSelectAll }
        );
      } else if (params.mediaType === 'image') {
        // Combined Image & Link context menu
        const pageInfo = await view.webContents.executeJavaScript(`
          (() => {
            const el = document.elementFromPoint(${params.x}, ${params.y});
            
            let linkUrl = null;
            if (el) {
              const anchor = el.closest('a');
              if (anchor && anchor.href) {
                linkUrl = anchor.href;
              }
            }
            return {
              linkUrl: linkUrl
            };
          })()
        `).catch(() => ({ linkUrl: null }));

        const hasLink = !!(params.linkURL || pageInfo.linkUrl);
        const targetLink = params.linkURL || pageInfo.linkUrl;

        // 1. Link items (Urutan pertama, grayed out jika tidak ada link)
        template.push(
          {
            label: getLabel('Buka Tautan di Tab Baru', 'Open Link in New Tab'),
            iconName: 'openInNewTab',
            enabled: hasLink,
            click: () => {
              if (hasLink && win && !win.isDestroyed()) {
                win.webContents.send('open-new-tab', targetLink);
              }
            }
          },
          {
            label: getLabel('Simpan Tautan Sebagai...', 'Save Link As...'),
            iconName: 'saveAs',
            enabled: hasLink,
            click: () => {
              if (hasLink) {
                view.webContents.downloadURL(targetLink);
              }
            }
          },
          {
            label: getLabel('Salin Alamat Tautan', 'Copy Link Address'),
            iconName: 'copyLink',
            enabled: hasLink,
            click: () => {
              if (hasLink) {
                clipboard.writeText(targetLink);
              }
            }
          }
        );

        // Separator pembatas Link dan Image
        template.push({ type: 'separator' });

        // 2. Image items
        template.push(
          { 
            label: getLabel('Buka Gambar di Tab Baru', 'Open Image in New Tab'), 
            iconName: 'openInNewTab', 
            click: () => {
              if (win && !win.isDestroyed()) {
                win.webContents.send('open-new-tab', params.srcURL);
              }
            }
          },
          { 
            label: getLabel('Salin Gambar', 'Copy Image'), 
            iconName: 'copy', 
            click: () => view.webContents.copyImageAt(params.x, params.y) 
          },
          { 
            label: getLabel('Salin Alamat Gambar', 'Copy Image Address'), 
            iconName: 'copyLink', 
            click: () => {
              clipboard.writeText(params.srcURL);
            }
          },
          { 
            label: getLabel('Simpan Gambar Sebagai...', 'Save Image As...'), 
            iconName: 'saveAs', 
            click: () => {
              if (params.srcURL) {
                imageDownloadRequests.add(params.srcURL);
              }
              view.webContents.downloadURL(params.srcURL);
            }
          }
        );
      } else if (params.selectionText) {
        // Text selection context menu
        template.push(
          { label: getLabel('Salin', 'Copy'), iconName: 'copy', click: () => view.webContents.copy() },
          { type: 'separator' },
          { label: currentLanguage === 'en' 
            ? `Search "${params.selectionText.length > 15 ? params.selectionText.substring(0, 15) + '...' : params.selectionText}" on Google` 
            : `Cari "${params.selectionText.length > 15 ? params.selectionText.substring(0, 15) + '...' : params.selectionText}" di Google`, 
            iconName: 'search',
            click: () => {
              const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`;
              if (win && !win.isDestroyed()) {
                win.webContents.send('open-new-tab', searchUrl);
              }
            }
          }
        );
      } else if (params.mediaType === 'video' || params.linkURL) {
        // Combined Video & Link context menu
        const pageInfo = await view.webContents.executeJavaScript(`
          (() => {
            const el = document.elementFromPoint(${params.x}, ${params.y});
            const video = el?.closest('video') || document.querySelector('video');
            
            let linkUrl = null;
            if (el) {
              const anchor = el.closest('a');
              if (anchor && anchor.href) {
                linkUrl = anchor.href;
              }
            }
            if (!linkUrl && video) {
              const anchor = video.closest('a');
              if (anchor && anchor.href) {
                linkUrl = anchor.href;
              }
            }
            
            return {
              videoExists: !!video,
              videoPaused: video ? video.paused : false,
              videoLoop: video ? video.loop : false,
              videoMuted: video ? video.muted : false,
              videoControls: video ? video.controls : false,
              videoPip: video ? (document.pictureInPictureElement === video) : false,
              videoSrc: video ? (video.src || video.currentSrc) : null,
              linkUrl: linkUrl
            };
          })()
        `).catch(() => ({ videoExists: false, linkUrl: null }));

        const hasVideo = !!(params.mediaType === 'video' || pageInfo.videoExists);
        const hasLink = !!(params.linkURL || pageInfo.linkUrl);
        const targetLink = params.linkURL || pageInfo.linkUrl;

        // 1. Link items (Urutan pertama)
        template.push(
          {
            label: getLabel('Buka Tautan di Tab Baru', 'Open Link in New Tab'),
            iconName: 'openInNewTab',
            enabled: hasLink,
            click: () => {
              if (hasLink && win && !win.isDestroyed()) {
                win.webContents.send('open-new-tab', targetLink);
              }
            }
          },
          {
            label: getLabel('Simpan Tautan Sebagai...', 'Save Link As...'),
            iconName: 'saveAs',
            enabled: hasLink,
            click: () => {
              if (hasLink) {
                view.webContents.downloadURL(targetLink);
              }
            }
          },
          {
            label: getLabel('Salin Alamat Tautan', 'Copy Link Address'),
            iconName: 'copyLink',
            enabled: hasLink,
            click: () => {
              if (hasLink) {
                clipboard.writeText(targetLink);
              }
            }
          }
        );

        // Separator pembatas Link dan Video
        template.push({ type: 'separator' });

        // 2. Video items
        template.push(
          {
            label: getLabel('Ulangi', 'Loop'),
            type: 'checkbox',
            checked: hasVideo ? pageInfo.videoLoop : false,
            enabled: hasVideo,
            iconName: 'loop',
            click: () => {
              if (hasVideo) {
                view.webContents.executeJavaScript(`
                  (() => {
                    const video = document.elementFromPoint(${params.x}, ${params.y})?.closest('video') || document.querySelector('video');
                    if (video) {
                      video.loop = !video.loop;
                    }
                  })()
                `);
              }
            }
          },
          {
            label: getLabel('Tampilkan Semua Kontrol', 'Show All Controls'),
            type: 'checkbox',
            checked: hasVideo ? pageInfo.videoControls : false,
            enabled: hasVideo,
            iconName: 'controls',
            click: () => {
              if (hasVideo) {
                view.webContents.executeJavaScript(`
                  (() => {
                    const video = document.elementFromPoint(${params.x}, ${params.y})?.closest('video') || document.querySelector('video');
                    if (video) {
                      video.controls = !video.controls;
                    }
                  })()
                `);
              }
            }
          },
          {
            label: getLabel('Gambar dalam Gambar (PiP)', 'Picture in Picture'),
            type: 'checkbox',
            checked: hasVideo ? pageInfo.videoPip : false,
            enabled: hasVideo,
            iconName: 'pip',
            click: () => {
              if (hasVideo) {
                view.webContents.executeJavaScript(`
                  (() => {
                    const video = document.elementFromPoint(${params.x}, ${params.y})?.closest('video') || document.querySelector('video');
                    if (video) {
                      if (document.pictureInPictureElement === video) {
                        document.exitPictureInPicture();
                      } else {
                        video.requestPictureInPicture();
                      }
                    }
                  })()
                `);
              }
            }
          },
          { type: 'separator' }
        );

        const videoSrc = params.srcURL || pageInfo.videoSrc;
        const isBlobOrMediaSource = typeof videoSrc === 'string' && (videoSrc.startsWith('blob:') || videoSrc.startsWith('mediasource:'));
        const hasVideoSrc = hasVideo && !!videoSrc && !isBlobOrMediaSource;

        template.push(
          {
            label: getLabel('Buka Video di Tab Baru', 'Open Video in New Tab'),
            iconName: 'openInNewTab',
            enabled: hasVideoSrc,
            click: () => {
              if (hasVideoSrc && win && !win.isDestroyed()) {
                win.webContents.send('open-new-tab', videoSrc);
              }
            }
          },
          {
            label: getLabel('Salin Alamat Video', 'Copy Video Link'),
            iconName: 'copyLink',
            enabled: hasVideoSrc,
            click: () => {
              if (hasVideoSrc) {
                clipboard.writeText(videoSrc);
              }
            }
          },
          {
            label: getLabel('Simpan Video Sebagai...', 'Save Video As...'),
            iconName: 'saveAs',
            enabled: hasVideoSrc,
            click: () => {
              if (hasVideoSrc) {
                view.webContents.downloadURL(videoSrc);
              }
            }
          },
          { type: 'separator' },
          {
            label: getLabel('Salin Bingkai Video', 'Copy Video Frame'),
            iconName: 'copyFrame',
            enabled: hasVideo,
            click: async () => {
              if (hasVideo) {
                const dataUrl = await view.webContents.executeJavaScript(`
                  (() => {
                    const video = document.elementFromPoint(${params.x}, ${params.y})?.closest('video') || document.querySelector('video');
                    if (!video) return null;
                    try {
                      const canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || video.clientWidth;
                      canvas.height = video.videoHeight || video.clientHeight;
                      const ctx = canvas.getContext('2d');
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      return canvas.toDataURL('image/png');
                    } catch (e) {
                      return null;
                    }
                  })()
                `).catch(() => null);

                if (dataUrl) {
                  const img = nativeImage.createFromDataURL(dataUrl);
                  clipboard.writeImage(img);
                }
              }
            }
          },
          {
            label: getLabel('Simpan Bingkai Video Sebagai...', 'Save Video Frame As...'),
            iconName: 'saveFrame',
            enabled: hasVideo,
            click: async () => {
              if (hasVideo) {
                const dataUrl = await view.webContents.executeJavaScript(`
                  (() => {
                    const video = document.elementFromPoint(${params.x}, ${params.y})?.closest('video') || document.querySelector('video');
                    if (!video) return null;
                    try {
                      const canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth || video.clientWidth;
                      canvas.height = video.videoHeight || video.clientHeight;
                      const ctx = canvas.getContext('2d');
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      return canvas.toDataURL('image/png');
                    } catch (e) {
                      return null;
                    }
                  })()
                `).catch(() => null);

                if (dataUrl) {
                  view.webContents.downloadURL(dataUrl);
                }
              }
            }
          }
        );
      } else {
        // Default context menu (blank area)
        template.push(
          { label: getLabel('Kembali', 'Back'), iconName: 'back', click: () => view.webContents.navigationHistory.goBack(), enabled: view.webContents.navigationHistory.canGoBack() },
          { label: getLabel('Maju', 'Forward'), iconName: 'forward', click: () => view.webContents.navigationHistory.goForward(), enabled: view.webContents.navigationHistory.canGoForward() },
          { label: getLabel('Muat Ulang', 'Reload'), iconName: 'reload', click: () => view.webContents.reload() },
          { type: 'separator' },
          { label: getLabel('Cetak...', 'Print...'), iconName: 'print', click: () => view.webContents.print() }
        );
      }

      if (template.length > 0) {
        if (template[template.length - 1].type !== 'separator') {
          template.push({ type: 'separator' });
        }
        template.push({
          label: getLabel('Inspeksi Elemen', 'Inspect Element'),
          iconName: 'inspect',
          click: () => view.webContents.inspectElement(params.x, params.y)
        });

        showWebContextMenu(win, view, params, template);
      }
    });

    // Focus management: prevent background tabs from stealing focus when loading or receiving focus
    const ensureActiveTabFocus = () => {
      if (!win || win.isDestroyed()) return;
      if (win.activeTabId && win.activeTabId !== tabId) {
        const activeView = win.snifferViews ? win.snifferViews.get(win.activeTabId) : null;
        if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
          try {
            activeView.webContents.focus();
          } catch (e) {}
        }
      }
    };

    view.webContents.on('focus', () => {
      ensureActiveTabFocus();
    });

    // Loading events for progress bar (Main frame only to prevent duplicate/stuck/iframe-triggered progress bars)
    view.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace && win && !win.isDestroyed()) {
        win.webContents.send('sniffer-loading-start', { tabId });
      }
    });

    view.webContents.on('did-finish-load', () => {
      ensureActiveTabFocus();
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-loading-stop', { tabId });
      }
    });

    view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame && win && !win.isDestroyed()) {
        win.webContents.send('sniffer-loading-stop', { tabId });
      }
    });

    view.webContents.on('did-stop-loading', () => {
      ensureActiveTabFocus();
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-loading-stop', { tabId });
      }
    });

    view.webContents.on('dom-ready', () => {
      ensureActiveTabFocus();
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-loading-stop', { tabId });
      }
    });

    // Navigation state for Back/Forward buttons
    const updateNavigationState = () => {
      if (win && !win.isDestroyed() && view.webContents) {
        win.webContents.send('sniffer-nav-state-updated', {
          tabId,
          canGoBack: view.webContents.navigationHistory.canGoBack(),
          canGoForward: view.webContents.navigationHistory.canGoForward()
        });
      }
    };

    view.webContents.on('did-navigate', updateNavigationState);
    view.webContents.on('did-navigate-in-page', updateNavigationState);
    view.webContents.on('did-finish-load', updateNavigationState);

    // Audible state events for audio/speaker indicator (reliable and immune to page visibility/throttling)
    view.webContents.on('is-currently-audible-changed', (...args) => {
      // Electron's is-currently-audible-changed signature has changed over versions:
      // older versions: (event, isCurrentlyAudible)
      // newer versions: (isCurrentlyAudible)
      let isPlaying = false;
      if (args.length === 1) {
        isPlaying = !!args[0];
      } else if (args.length >= 2) {
        isPlaying = !!args[1];
      }
      logStream(`[AUDIBLE CHANGE] tab ${tabId} audible is now: ${isPlaying}`);
      updateTabAudibleState(win, tabId, isPlaying);
    });

    // Handle HTML Fullscreen
    let previousZoomFactor = 1.0;
    view.webContents.on('enter-html-full-screen', () => {
      if (win && !win.isDestroyed()) {
        if (view.webContents) {
          previousZoomFactor = view.webContents.getZoomFactor();
          view.webContents.setZoomFactor(1.0);
        }
        win.setFullScreen(true);
        win.webContents.send('sniffer-fullscreen-changed', true);
      }
    });

    view.webContents.on('leave-html-full-screen', () => {
      if (win && !win.isDestroyed()) {
        if (view.webContents) {
          view.webContents.setZoomFactor(previousZoomFactor);
        }
        win.setFullScreen(false);
        win.webContents.send('sniffer-fullscreen-changed', false);
      }
    });

    // Arc-like Swipe Navigation: Detect finger release
    view.webContents.on('scroll-touch-begin', () => {
      if (view.webContents) view.webContents.send('sniffer-scroll-begin');
    });

    view.webContents.on('scroll-touch-end', () => {
      if (view.webContents) view.webContents.send('sniffer-scroll-end');
    });

    if (url) {
      view.webContents.loadURL(url);
    }

    // Initial navigation state
    updateNavigationState();
  }
}

ipcMain.on('open-sniffer-browser', (event, url, bounds, tabId = 'default', background = false, isTabSwitch = false) => {
  const win = getWindowFromEvent(event);
  if (win) win.isSnifferOpen = true;
  createSnifferWindow(win, url, bounds, tabId, background, isTabSwitch);
});

ipcMain.on('show-tab-context-menu', (event, { tabId, isActive }) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  const { Menu } = require('electron');
  const template = [
    { label: getLocalizedLabel('Tab Baru', 'New Tab'), click: () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('open-new-tab', 'https://google.com');
      }
    }},
    { type: 'separator' },
    { label: getLocalizedLabel('Muat Ulang', 'Reload'), click: () => {
        const view = win.snifferViews ? win.snifferViews.get(tabId) : null;
        if (view && view.webContents) view.webContents.reload();
      }
    },
    { label: getLocalizedLabel('Gandakan Tab', 'Duplicate Tab'), accelerator: 'CmdOrCtrl+Shift+K', click: () => {
        const view = win.snifferViews ? win.snifferViews.get(tabId) : null;
        let targetUrl = '';
        if (view && view.webContents) {
          targetUrl = view.webContents.getURL();
        }
        if (win && !win.isDestroyed()) {
          win.webContents.send('sniffer-shortcut-duplicate-tab', tabId, targetUrl);
        }
      }
    },
    { type: 'separator' },
    { label: getLocalizedLabel('Tutup Tab', 'Close Tab'), click: () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('close-tab-from-menu', tabId);
      }
    }},
    { label: getLocalizedLabel('Tutup Tab Lainnya', 'Close Other Tabs'), click: () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('close-other-tabs', tabId);
      }
    }},
    { label: getLocalizedLabel('Tutup Tab di Kanan', 'Close Tabs to the Right'), click: () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('close-tabs-right', tabId);
      }
    }}
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup();
});

ipcMain.on('show-titlebar-context-menu', (event) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  const { Menu } = require('electron');
  const template = [
    { label: getLocalizedLabel('Tab Baru', 'New Tab'), click: () => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('open-new-tab', 'https://google.com');
      }
    }},
    { type: 'separator' },
    { label: getLocalizedLabel('Kembalikan', 'Restore'), role: 'restore' },
    { label: getLocalizedLabel('Minimalkan', 'Minimize'), role: 'minimize' },
    { label: getLocalizedLabel('Maksimalkan', 'Maximize'), role: 'maximize' },
    { type: 'separator' },
    { label: getLocalizedLabel('Tutup', 'Close'), role: 'close' }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup();
});

ipcMain.on('show-tab-preview', (event, data) => {
  const win = getWindowFromEvent(event);
  showTabPreview(win, data);
});

ipcMain.on('hide-tab-preview', () => {
  hideTabPreview();
});

// --- CROSS-TAB STORAGE SYNCHRONIZATION ---
// Meneruskan pembaruan localStorage (seperti token login Hugging Face, auth state, dsb.)
// dari satu tab ke tab lain yang membuka website dengan origin/domain yang sama secara real-time
ipcMain.on('sync-cross-tab-storage', (event, data) => {
  const senderWebContents = event.sender;
  if (!data || !data.origin) return;

  // Broadcast ke seluruh BrowserView / WebContentsView aktif yang memiliki origin yang sama (kecuali pengirim)
  const { BrowserWindow, webContents } = require('electron');
  const allWebContents = webContents.getAllWebContents();

  for (const wc of allWebContents) {
    if (wc && !wc.isDestroyed() && wc.id !== senderWebContents.id) {
      try {
        const wcUrl = wc.getURL();
        if (wcUrl) {
          const wcOrigin = new URL(wcUrl).origin;
          if (wcOrigin === data.origin) {
            wc.send('apply-cross-tab-storage', data);
          }
        }
      } catch (err) {}
    }
  }

  // Juga flush storage session agar cookie/storage langsung ter-persist tanpa menunggu
  try {
    const { session } = require('electron');
    if (session.defaultSession && typeof session.defaultSession.flushStorageData === 'function') {
      session.defaultSession.flushStorageData();
    }
  } catch (e) {}
});

ipcMain.on('show-search-engine-menu', (event, { currentEngine, bounds }) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  if (!menuView || menuView.isDestroyed()) createMenuView();
  
  if (menuView.isVisible()) {
    menuView.webContents.send('hide-menu');
    setTimeout(() => {
      if (menuView && !menuView.isDestroyed()) {
        menuView.hide();
      }
    }, 100);
    return;
  }

  // Save for resize
  lastMenuTriggerBounds = bounds;
  lastMenuWindow = win;

  const menuWidth = 260;
  const menuHeight = lastMenuHeight || 130;
  
  const winBounds = win.getContentBounds();
  
  // Align precisely to the bottom of the trigger bounds, without padding offset
  let x = Math.round(winBounds.x + bounds.x);
  let y = Math.round(winBounds.y + bounds.y + bounds.height);
  
  // Adjust position to stay within window
  if (x + menuWidth > winBounds.x + winBounds.width) {
    x = Math.round(winBounds.x + bounds.x + bounds.width - menuWidth);
  }
  
  menuView.setBounds({ x, y, width: menuWidth, height: menuHeight });
  menuView.show();
  menuView.webContents.send('show-menu', { engine: currentEngine, lang: currentLanguage });
  menuView.focus();
});

ipcMain.on('resize-search-engine-menu', (event, height) => {
  const h = Math.round(height);
  if (h <= 0) return;
  lastMenuHeight = h;
  
  if (menuView && !menuView.isDestroyed() && menuView.isVisible() && lastMenuTriggerBounds && lastMenuWindow && !lastMenuWindow.isDestroyed()) {
    const winBounds = lastMenuWindow.getContentBounds();
    const bounds = lastMenuTriggerBounds;
    const menuWidth = 260;
    
    let x = Math.round(winBounds.x + bounds.x);
    let y = Math.round(winBounds.y + bounds.y + bounds.height);
    
    if (x + menuWidth > winBounds.x + winBounds.width) {
      x = Math.round(winBounds.x + bounds.x + bounds.width - menuWidth);
    }
    
    menuView.setBounds({ x, y, width: menuWidth, height: h });
  }
});

ipcMain.on('select-search-engine', (event, engine) => {
  // Send search engine update to all open regular player windows
  for (const w of openWindows) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('set-search-engine', engine);
    }
  }
  if (menuView && !menuView.isDestroyed()) {
    menuView.webContents.send('hide-menu');
    setTimeout(() => {
      if (menuView && !menuView.isDestroyed()) {
        menuView.hide();
      }
    }, 100);
  }
});

ipcMain.on('start-find-in-page', (event, { text, matchCase, wholeWord, forward, findNext }) => {
  const wc = getActiveWebContents();
  if (wc) {
    wc.findInPage(text, {
      matchCase: !!matchCase,
      wholeWord: !!wholeWord,
      forward: forward !== false,
      findNext: !!findNext
    });
  }
});

ipcMain.on('stop-find-in-page', (event, { action }) => {
  const wc = getActiveWebContents();
  if (wc) {
    wc.stopFindInPage(action || 'clearSelection');
  }
});

ipcMain.on('hide-find-in-page', () => {
  if (findView && !findView.isDestroyed()) {
    findView.hide();
  }
  const wc = getActiveWebContents();
  if (wc) {
    wc.stopFindInPage('clearSelection');
  }
});

ipcMain.on('show-find-view', () => {
  showFindView();
});

ipcMain.on('show-suggestions-menu', (event, { bounds, url, searchEngine, webHistory, lang }) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  win.lastSuggestionsBounds = bounds;
  if (!suggestionsView || suggestionsView.isDestroyed()) createSuggestionsView();

  const winBounds = win.getContentBounds();
  
  const x = Math.round(winBounds.x + bounds.x);
  const y = Math.round(winBounds.y + bounds.y + bounds.height + 4);
  const width = Math.round(bounds.width);
  const height = 340;

  if (suggestionsView && !suggestionsView.isDestroyed()) {
    suggestionsView.setBounds({ x, y, width, height });
    if (!suggestionsView.isVisible()) {
      suggestionsView.showInactive();
    }
    suggestionsView.webContents.send('update-suggestions', { url, searchEngine, webHistory, lang });
  }
});

ipcMain.on('hide-suggestions-menu', () => {
  if (suggestionsView && !suggestionsView.isDestroyed() && suggestionsView.isVisible()) {
    suggestionsView.hide();
  }
});

ipcMain.on('select-suggestion', (event, targetUrl) => {
  if (suggestionsView && !suggestionsView.isDestroyed() && suggestionsView.isVisible()) {
    suggestionsView.hide();
  }
  for (const w of openWindows) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('select-suggestion', targetUrl);
    }
  }
});

ipcMain.on('show-passwords-menu', (event, { bounds, url, lang }) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  if (!passwordsView || passwordsView.isDestroyed()) createPasswordsView();

  const winBounds = win.getContentBounds();
  const menuWidth = 320;
  const menuHeight = 380;
  const padding = 24; // p-6 matches PasswordsMenu.tsx padding (24px)
  
  let x = Math.round(winBounds.x + bounds.x + bounds.width - menuWidth + padding);
  let y = Math.round(winBounds.y + bounds.y + bounds.height - padding + 8);

  if (x < winBounds.x) {
    x = winBounds.x + 8;
  }
  if (x + menuWidth > winBounds.x + winBounds.width) {
    x = winBounds.x + winBounds.width - menuWidth - 8;
  }

  if (passwordsView && !passwordsView.isDestroyed()) {
    passwordsView.setBounds({ x, y, width: menuWidth, height: menuHeight });
    passwordsView.setAlwaysOnTop(true, 'screen-saver');
    if (!passwordsView.isVisible()) {
      passwordsView.show();
    }
    passwordsView.webContents.send('show-passwords-menu-data', { url, lang, isAutofillTrigger: false });
    passwordsView.focus();
  }
});

ipcMain.on('request-autofill-popup', (event, { bounds, url }) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  const activeView = getActiveSnifferView(win);
  if (!activeView) return;
  
  if (!passwordsView || passwordsView.isDestroyed()) createPasswordsView();

  const winBounds = win.getContentBounds();
  const viewBounds = activeView.getBounds();
  
  const menuWidth = 300;
  
  let x = Math.round(winBounds.x + viewBounds.x + bounds.x);
  let y = Math.round(winBounds.y + viewBounds.y + bounds.y + bounds.height + 4);

  if (x < winBounds.x + 8) {
    x = winBounds.x + 8;
  }
  if (x + menuWidth > winBounds.x + winBounds.width - 8) {
    x = winBounds.x + winBounds.width - menuWidth - 8;
  }

  if (passwordsView && !passwordsView.isDestroyed()) {
    passwordsView.setAlwaysOnTop(true, 'screen-saver');
    passwordsView.webContents.send('show-passwords-menu-data', { 
      url, 
      lang: currentLanguage, 
      isAutofillTrigger: true,
      bounds: { x, y }
    });
  }
});

ipcMain.on('confirm-show-passwords-menu', (event, { hasData, isAutofillTrigger, bounds, height }) => {
  if (!passwordsView || passwordsView.isDestroyed()) return;
  
  if (!hasData) {
    if (isAutofillTrigger) {
      passwordsView.hide();
    }
    return;
  }

  if (isAutofillTrigger && bounds) {
    const menuWidth = 300;
    const menuHeight = height || 180;
    passwordsView.setBounds({ x: bounds.x, y: bounds.y, width: menuWidth, height: menuHeight });
    passwordsView.setAlwaysOnTop(true, 'screen-saver');
    if (!passwordsView.isVisible()) {
      passwordsView.showInactive();
    }
  }
});

ipcMain.on('hide-passwords-menu-popup', () => {
  if (passwordsView && !passwordsView.isDestroyed() && passwordsView.isVisible()) {
    passwordsView.hide();
  }
});

ipcMain.on('trigger-open-passwords-manager', () => {
  for (const w of openWindows) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('open-passwords-manager');
    }
  }
});

ipcMain.on('trigger-edit-password', (event, { credential, bounds }) => {
  if (!passwordsView || passwordsView.isDestroyed()) createPasswordsView();

  if (passwordsView && !passwordsView.isDestroyed()) {
    const x = Math.round(bounds.x);
    const y = Math.round(bounds.y);
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);

    passwordsView.setBounds({ x, y, width, height });
    passwordsView.setAlwaysOnTop(true, 'screen-saver');
    if (!passwordsView.isVisible()) {
      passwordsView.show();
    } else {
      passwordsView.show();
    }
    passwordsView.webContents.send('show-edit-form', { credential });
    passwordsView.focus();
  }
});

ipcMain.on('notify-credentials-changed', () => {
  for (const w of openWindows) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('credentials-updated');
    }
  }
  if (passwordsView && !passwordsView.isDestroyed()) {
    passwordsView.webContents.send('credentials-updated');
  }
});

ipcMain.on('show-home-context-menu', (event) => {
  const win = getWindowFromEvent(event);
  const { Menu } = require('electron');
  const template = [
    { 
      label: getLocalizedLabel('Ubah Alamat Beranda', 'Edit/Set Home Address'), 
      click: () => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('edit-home-address');
        }
      }
    },
    { 
      label: getLocalizedLabel('Atur Ulang Alamat Beranda', 'Reset Home Address to Default'), 
      click: () => {
        const win = getWindowFromEvent(event);
        if (win && !win.isDestroyed()) {
          win.webContents.send('reset-home-address');
        }
      }
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup();
});

ipcMain.on('close-sniffer-tab', (event, tabId) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  const view = win.snifferViews ? win.snifferViews.get(tabId) : null;
  if (view) {
    try {
      win.contentView.removeChildView(view);
    } catch (e) {}
    if (view.webContents) {
      try {
        view.webContents.destroy();
      } catch (e) {}
    }
    if (win.snifferViews) win.snifferViews.delete(tabId);
    clearTabAudibleState(win, tabId);
    clearSleepTimer(win, tabId);
    if (win.activeTabId === tabId) {
      win.activeTabId = null;
    }
  }
});

ipcMain.on('toggle-sniffer-mute', (event, tabId) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  const view = win.snifferViews ? win.snifferViews.get(tabId) : null;
  if (view && view.webContents) {
    const isMuted = view.webContents.isAudioMuted();
    view.webContents.setAudioMuted(!isMuted);
    view.userMuted = !isMuted;
    if (win && !win.isDestroyed()) {
      win.webContents.send('sniffer-mute-updated', { tabId, isMuted: !isMuted });
    }
  }
});

ipcMain.on('sniffer-toggle-video-fullscreen', (event, tabId) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  const view = win.snifferViews ? win.snifferViews.get(tabId) : null;
  if (view && view.webContents) {
    view.webContents.executeJavaScript(`
      (function() {
        const isFS = !!document.fullscreenElement;
        
        // Try dispatching 'f' key first (works for YouTube, etc.)
        const event = new KeyboardEvent('keydown', {
          key: 'f',
          code: 'KeyF',
          keyCode: 70,
          which: 70,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(event);
        
        // Fallback if state didn't change
        setTimeout(() => {
          if (!!document.fullscreenElement === isFS) {
            if (isFS) {
              document.exitFullscreen().catch(()=>{});
            } else {
              const video = document.querySelector('video');
              if (video) video.requestFullscreen().catch(()=>{});
            }
          }
        }, 150);
      })();
    `).catch(() => {});
  }
});

ipcMain.on('update-sniffer-bounds', (event, bounds, isModalClosed = false) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  
  if (bounds.width === 0 && bounds.height === 0 && isModalClosed) {
    pauseAllVideos(win);
  }

  if (bounds.width === 0 && bounds.height === 0 && isModalClosed) {
    // Modal is closed, destroy all tabs to free memory (Sleep Tab feature)
    // EXCEPT those that are currently downloading
    if (win.snifferViews) {
      for (const [id, view] of win.snifferViews.entries()) {
        if (activeDownloadTabs.has(id)) {
          logStream(`[SLEEP TAB] Keeping tab ${id} alive because it has active downloads`);
          // Hide it and remove from contentView to prevent blocking clicks/focus in the main window
          try {
            view.setBounds({ x: -20000, y: -20000, width: 800, height: 600 });
            try {
              win.contentView.removeChildView(view);
            } catch (err) {}
          } catch (e) {}
          continue;
        }
        
        try {
          win.contentView.removeChildView(view);
          if (view.webContents && !view.webContents.isDestroyed()) {
            view.webContents.destroy();
          }
          win.snifferViews.delete(id);
          clearSleepTimer(win, id);
          if (win && !win.isDestroyed()) {
            win.webContents.send('sniffer-tab-slept', id);
          }
          logStream(`[SLEEP TAB] Tab ${id} put to sleep to save memory`);
        } catch (e) {
          logStream(`[ERROR] Failed to destroy sleeping tab ${id}: ${e.message}`);
        }
      }
    }
    // Do NOT clear activeTabId, so we know which one to recreate
  } else {
    const activeView = getActiveSnifferView(win);
    if (activeView && win && !win.isDestroyed()) {
      try {
        win.contentView.addChildView(activeView);
      } catch (e) {}
      activeView.setBounds(getAdjustedSnifferBounds(win, bounds));
      // Modal is open, ensure active tab is unmuted if not user muted
      if (bounds.width > 0 && bounds.height > 0 && activeView.webContents && !activeView.userMuted) {
        activeView.webContents.setAudioMuted(false);
      }
    }
  }
});

ipcMain.on('close-sniffer-browser', (event) => {
  const win = getWindowFromEvent(event);
  if (!win) return;
  win.isSnifferOpen = false;
  pauseAllVideos(win);
  if (win.snifferViews) {
    for (const [id, view] of win.snifferViews.entries()) {
      if (activeDownloadTabs.has(id)) {
        logStream(`[CLOSE SNIFFER] Keeping tab ${id} alive because it has active downloads`);
        try {
          view.setBounds({ x: -20000, y: -20000, width: 800, height: 600 });
          try {
            win.contentView.removeChildView(view);
          } catch (err) {}
        } catch (e) {}
        continue;
      }
      
      try {
        win.contentView.removeChildView(view);
      } catch (e) {}
      if (view.webContents) {
        try {
          view.webContents.destroy();
        } catch (e) {}
      }
      win.snifferViews.delete(id);
      clearSleepTimer(win, id);
      if (win && !win.isDestroyed()) {
        win.webContents.send('sniffer-tab-slept', id);
      }
    }
  }
  // Do NOT clear activeTabId if we want to remember it, but close-sniffer-browser usually means stopping sniffing
  // If we don't clear it, when we open sniffer again, it might reuse the tab.
  // We'll leave activeTabId alone so it can be reused.
});

ipcMain.on('open-new-tab', (event, url) => {
  const win = getWindowFromEvent(event);
  let targetUrl = '';
  if (url && typeof url === 'object' && url.url) {
    targetUrl = url.url;
  } else if (typeof url === 'string') {
    targetUrl = url;
  }

  if (targetUrl && isUrlAdOrBlocked(targetUrl, true)) {
    logStream(`[OPEN-NEW-TAB BLOCKED] Prevented opening new tab for Ad/Blocked URL: ${targetUrl}`);
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send('video-detected', {
        url: targetUrl,
        type: 'POPUP (BLOCKED)',
        timestamp: Date.now(),
        title: 'New Tab Blocked'
      });
    }
    return;
  }

  if (win && !win.isDestroyed() && win.webContents) {
    win.webContents.send('open-new-tab', url);
  }
});

ipcMain.on('password-submitted', (event, data) => {
  const win = getWindowFromEvent(event) || mainWindow;
  if (!win || win.isDestroyed()) return;

  // Store for invoke/request
  pendingPasswordData = {
    credential: data,
    lang: currentLanguage
  };

  if (!passwordPromptView || passwordPromptView.isDestroyed()) {
    createPasswordPromptView(win);
  }

  const winBounds = win.getBounds();
  const width = 340;
  const height = 310;
  
  // Position near bottom right of the address bar
  let x = Math.round(winBounds.x + winBounds.width - width - 20);
  let y = Math.round(winBounds.y + 115);

  if (x < winBounds.x + 8) {
    x = winBounds.x + 8;
  }
  if (y + height > winBounds.y + winBounds.height - 8) {
    y = winBounds.y + winBounds.height - height - 8;
  }

  if (passwordPromptView && !passwordPromptView.isDestroyed()) {
    passwordPromptView.setBounds({ x, y, width, height });
    passwordPromptView.setAlwaysOnTop(true, 'screen-saver');

    const sendData = () => {
      passwordPromptView.webContents.send('show-password-prompt-data', {
        credential: data,
        lang: currentLanguage
      });
    };

    if (passwordPromptView.webContents.isLoading()) {
      passwordPromptView.webContents.once('did-finish-load', sendData);
    } else {
      sendData();
    }

    if (!passwordPromptView.isVisible()) {
      passwordPromptView.show();
    } else {
      passwordPromptView.show();
    }
  }
});

ipcMain.handle('request-password-prompt-data', () => {
  return pendingPasswordData;
});

ipcMain.handle('request-web-context-menu-data', () => {
  return pendingWebContextMenuData;
});

ipcMain.on('resize-web-context-menu', (event, size) => {
  let w = lastWebContextMenuWidth || 200;
  let h = lastWebContextMenuHeight || 250;
  if (typeof size === 'object' && size !== null) {
    w = Math.round(size.width || w);
    h = Math.round(size.height || h);
  } else if (typeof size === 'number') {
    h = Math.round(size);
  }

  if (w <= 0 || h <= 0) return;

  lastWebContextMenuWidth = w;
  lastWebContextMenuHeight = h;

  if (webContextMenuView && !webContextMenuView.isDestroyed() && webContextMenuView.isVisible()) {
    const newBounds = getWebContextMenuBounds(w, h);
    webContextMenuView.setBounds(newBounds);
  }
});

ipcMain.on('web-context-menu-click', (event, id) => {
  if (webContextMenuView && !webContextMenuView.isDestroyed()) {
    webContextMenuView.hide();
  }
  const callback = webContextMenuCallbacks.get(id);
  if (callback) {
    callback();
  }
});

ipcMain.on('hide-password-prompt', () => {
  pendingPasswordData = null;
  if (passwordPromptView && !passwordPromptView.isDestroyed() && passwordPromptView.isVisible()) {
    passwordPromptView.hide();
  }
});

ipcMain.on('sniffer-autofill', (event, { username, password }) => {
  let win = getWindowFromEvent(event);
  if (win && passwordsView && win === passwordsView) {
    try {
      const parent = passwordsView.getParentWindow();
      win = parent || mainWindow;
    } catch (e) {
      win = mainWindow;
    }
  }
  const view = getActiveSnifferView(win);
  if (view && view.webContents) {
    view.webContents.executeJavaScript(`
      (() => {
        try {
          const setValue = (el, val) => {
            try {
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
              if (nativeSetter) {
                nativeSetter.call(el, val);
              } else {
                el.value = val;
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } catch(err) {
              el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          };

          const passFields = Array.from(document.querySelectorAll('input[type="password"]'));
          if (passFields.length > 0) {
            passFields.forEach(p => {
              setValue(p, ${JSON.stringify(password)});
              
              const form = p.form;
              let userField = null;
              if (form) {
                userField = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
              }
              if (!userField) {
                const allInputs = Array.from(document.querySelectorAll('input'));
                const idx = allInputs.indexOf(p);
                if (idx > 0) {
                  for (let i = idx - 1; i >= 0; i--) {
                    if (allInputs[i].type === 'text' || allInputs[i].type === 'email' || !allInputs[i].type) {
                      userField = allInputs[i];
                      break;
                    }
                  }
                }
              }
              if (userField) {
                setValue(userField, ${JSON.stringify(username)});
              }
            });
          } else {
            // Fallback: search for any fields with autocomplete="username" or name containing "user"/"email"/"pass"
            const userInputs = Array.from(document.querySelectorAll('input')).filter(i => {
              const name = (i.name || '').toLowerCase();
              const id = (i.id || '').toLowerCase();
              const type = (i.type || '').toLowerCase();
              return type === 'text' || type === 'email' || name.includes('user') || name.includes('email') || id.includes('user') || id.includes('email');
            });
            const passInputs = Array.from(document.querySelectorAll('input')).filter(i => {
              const type = (i.type || '').toLowerCase();
              const name = (i.name || '').toLowerCase();
              return type === 'password' || name.includes('pass') || name.includes('word');
            });
            if (userInputs.length > 0) {
              setValue(userInputs[0], ${JSON.stringify(username)});
            }
            if (passInputs.length > 0) {
              setValue(passInputs[0], ${JSON.stringify(password)});
            }
          }
        } catch (e) {
          console.error('Autofill injection failed', e);
        }
      })()
    `).catch(e => console.error('[AUTOFILL ERROR] ' + e.message));
  }
});

ipcMain.on('sniffer-go-back', (event) => {
  const win = getWindowFromEvent(event);
  const view = getActiveSnifferView(win);
  if (view && view.webContents && view.webContents.navigationHistory.canGoBack()) {
    view.webContents.navigationHistory.goBack();
  }
});

ipcMain.on('sniffer-go-forward', (event) => {
  const win = getWindowFromEvent(event);
  const view = getActiveSnifferView(win);
  if (view && view.webContents && view.webContents.navigationHistory.canGoForward()) {
    view.webContents.navigationHistory.goForward();
  }
});

ipcMain.on('sniffer-reload', (event, ignoreCache = false) => {
  const win = getWindowFromEvent(event);
  const view = getActiveSnifferView(win);
  if (view && view.webContents) {
    if (ignoreCache) {
      view.webContents.reloadIgnoringCache();
    } else {
      view.webContents.reload();
    }
  }
});

ipcMain.on('set-sniffer-mode', (event, isMobile) => {
  const win = getWindowFromEvent(event);
  snifferIsMobile = isMobile;
  logStream(`Sniffer mode set to: ${isMobile ? 'Mobile' : 'Desktop'}`);
  const view = getActiveSnifferView(win);
  if (view && view.webContents) {
    const chromeMatch = app.userAgentFallback.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    const chromeVersion = chromeMatch ? chromeMatch[1] : '116.0.0.0';
    const mobileUA = `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
    const desktopUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    view.webContents.setUserAgent(isMobile ? mobileUA : desktopUA);
    view.webContents.reload();
  }
});

let mainPlayerReferer = '';

ipcMain.on('set-main-player-referer', (event, referer) => {
  mainPlayerReferer = referer;
});

ipcMain.on('set-adblock-enabled', (event, enabled) => {
  adBlockEnabled = enabled;
  logStream(`AdBlock set to: ${enabled}`);
  if (engineBlocker) {
    try {
      if (enabled) {
        engineBlocker.enableBlockingInSession(session.defaultSession);
      } else {
        engineBlocker.disableBlockingInSession(session.defaultSession);
      }
    } catch (e) {
      logStream(`AdBlock toggle error: ${e.message}`);
    }
  }
});

ipcMain.on('set-popupblock-enabled', (event, enabled) => {
  popupBlockEnabled = enabled;
  logStream(`PopupBlock set to: ${enabled}`);
});

ipcMain.on('set-theme-mode', (event, mode) => {
  try {
    if (mode === 'dark') {
      nativeTheme.themeSource = 'dark';
    } else if (mode === 'light') {
      nativeTheme.themeSource = 'light';
    } else {
      nativeTheme.themeSource = 'system';
    }
    logStream(`Theme mode set to: ${mode}`);

    // Broadcast to mainWindow
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('theme-mode-updated', mode);
    }

    // Broadcast to overlay views/windows
    const views = [
      typeof findView !== 'undefined' ? findView : null,
      typeof menuView !== 'undefined' ? menuView : null,
      typeof suggestionsView !== 'undefined' ? suggestionsView : null,
      typeof passwordsView !== 'undefined' ? passwordsView : null,
      typeof passwordPromptView !== 'undefined' ? passwordPromptView : null,
      typeof webContextMenuView !== 'undefined' ? webContextMenuView : null
    ];

    for (const v of views) {
      if (v && !v.isDestroyed() && v.webContents) {
        v.webContents.send('theme-mode-updated', mode);
      }
    }
  } catch (e) {
    logStream(`Failed to set theme mode: ${e.message}`);
  }
});

ipcMain.on('set-language', (event, lang) => {
  currentLanguage = lang || 'id';
  logStream(`Language set to: ${currentLanguage}`);
});

const activeDownloads = new Map();
const manualDownloads = new Map();
const activeDownloadTabs = new Map(); // tabId -> count of active downloads

function incrementDownloadTab(tabId) {
  if (!tabId) return;
  activeDownloadTabs.set(tabId, (activeDownloadTabs.get(tabId) || 0) + 1);
}

function decrementDownloadTab(tabId) {
  if (!tabId) return;
  const count = (activeDownloadTabs.get(tabId) || 0) - 1;
  if (count <= 0) {
    activeDownloadTabs.delete(tabId);
  } else {
    activeDownloadTabs.set(tabId, count);
  }
}

ipcMain.on('set-multipart-download', (event, value) => {
  useMultiPartDownload = value;
});

ipcMain.on('download-hls', async (event, url, defaultName, referer, tabId, allDetectedM3u8s) => {
  const { dialog } = require('electron');
  const win = BrowserWindow.fromWebContents(event.sender);
  
  const dialogOpts = getDownloadDialogOptions(defaultName || 'video.mp4', 'video/mp4', currentLanguage, url);
  const { filePath } = await dialog.showSaveDialog(win, {
    title: dialogOpts.title,
    defaultPath: dialogOpts.defaultPath,
    filters: dialogOpts.filters
  });

  if (!filePath) {
    event.reply('download-progress', { url, status: 'cancelled' });
    return;
  }
  lastSaveDirectory = path.dirname(filePath);

  if (tabId) incrementDownloadTab(tabId);

  logStream(`[DOWNLOAD] Starting download: ${url} -> ${filePath}`);
  event.reply('download-progress', { url, status: 'starting', percent: 0 });

  try {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    
    // Fix untuk path ffmpeg saat aplikasi di-build (dibungkus asar)
    let ffmpegPath = ffmpegInstaller.path;
    if (ffmpegPath.includes('app.asar')) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
    ffmpeg.setFfmpegPath(ffmpegPath);

    const chromeMatch = app.userAgentFallback.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
    const chromeVersion = chromeMatch ? chromeMatch[1] : '116.0.0.0';
    const mobileUA = `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
    const desktopUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
    const userAgent = snifferIsMobile ? mobileUA : desktopUA;

    const inputOptions = [
      '-protocol_whitelist file,http,https,tcp,tls,crypto',
      '-rw_timeout 30000000',
      '-user_agent', userAgent,
      '-probesize', '10M',
      '-analyzeduration', '10M',
      '-ignore_unknown'
    ];

    let cookiesStr = '';
    try {
      const { session } = require('electron');
      // Ambil cookies untuk URL video dan referer
      const cookiesUrl = await session.defaultSession.cookies.get({ url });
      const cookiesRef = referer ? await session.defaultSession.cookies.get({ url: referer }) : [];
      
      // Gabungkan cookies unik
      const allCookies = [...cookiesUrl, ...cookiesRef];
      const uniqueCookies = Array.from(new Map(allCookies.map(c => [c.name, c])).values());
      
      if (uniqueCookies.length > 0) {
        cookiesStr = uniqueCookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
    } catch (e) {
      logStream(`[DOWNLOAD] Failed to get cookies: ${e.message}`);
    }

    let headers = '';
    
    // Gunakan logika spoofing referer yang sama dengan onBeforeSendHeaders
    let spoofedReferer = referer;
    if (!spoofedReferer) {
      try {
        const urlObj = new URL(url);
        const hostnameParts = urlObj.hostname.split('.');
        let rootDomain = urlObj.hostname;
        if (hostnameParts.length >= 2) {
           rootDomain = hostnameParts.slice(-2).join('.');
        }
        spoofedReferer = `https://www.${rootDomain}/`;
      } catch (e) {}
    }

    if (spoofedReferer) {
      headers += `Referer: ${spoofedReferer}\r\n`;
      try {
        const refUrl = new URL(spoofedReferer);
        headers += `Origin: ${refUrl.origin}\r\n`;
      } catch (e) {}
    }
    
    if (cookiesStr) {
      headers += `Cookie: ${cookiesStr}\r\n`;
    }

    headers += `User-Agent: ${userAgent}\r\n`;
    headers += `Accept: */*\r\n`;
    headers += `Accept-Language: en-US,en;q=0.9\r\n`;
    headers += `Connection: keep-alive\r\n`;

    if (headers) {
      inputOptions.push('-headers', headers);
    }

    let lastTargetSize = 0;
    let lastTime = Date.now();
    let currentSpeed = 0;

    let finalUrl = url;
    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    if (isYoutube) {
      logStream(`[YOUTUBE DOWNLOAD] Resolving YouTube URL: ${url}`);
      try {
        const resolvedUrl = await resolveYoutubeWithYtDlp(url);
        logStream(`[YOUTUBE DOWNLOAD SUCCESS] Successfully resolved via yt-dlp: ${resolvedUrl}`);
        finalUrl = resolvedUrl;
      } catch (ytDlpErr) {
        logStream(`[YOUTUBE DOWNLOAD YT-DLP FAILED] yt-dlp failed: ${ytDlpErr.message}. Falling back to Cobalt...`);
        try {
          const fetchClient = (net && typeof net.fetch === 'function') ? net.fetch : require('cross-fetch');
          const res = await fetchClient('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              url: url,
              videoQuality: '720',
              downloadMode: 'auto'
            })
          });
          const cobaltData = await res.json();
          if (cobaltData && cobaltData.url) {
            logStream(`[YOUTUBE DOWNLOAD COBALT FALLBACK SUCCESS] Successfully resolved via Cobalt fallback: ${cobaltData.url}`);
            finalUrl = cobaltData.url;
          } else {
            throw new Error((cobaltData && cobaltData.message) || 'No stream URL returned from Cobalt');
          }
        } catch (err) {
          logStream(`[YOUTUBE DOWNLOAD ERROR] Both yt-dlp and Cobalt failed to resolve YouTube URL: ${err.message}`);
          event.reply('download-progress', { url, status: 'error', error: 'Gagal mendapatkan aliran download YouTube.' });
          if (tabId) decrementDownloadTab(tabId);
          return;
        }
      }
    }
    let tempM3u8Path = null;

    async function resolveM3u8Url(m3u8Url, fetchHeaders) {
      try {
        const { net } = require('electron');
        const response = await net.fetch(m3u8Url, { headers: fetchHeaders, redirect: 'follow' });
        if (!response.ok) return m3u8Url;
        const text = await response.text();
        
        if (text.includes('#EXT-X-STREAM-INF')) {
          const lines = text.split(/\r?\n/);
          let bestVariantUrl = null;
          let maxBandwidth = -1;
          let currentBandwidth = 0;
          let currentCodecs = '';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
              currentBandwidth = 0;
              currentCodecs = '';
              const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
              if (bwMatch) currentBandwidth = parseInt(bwMatch[1], 10);
              const codecsMatch = line.match(/CODECS="([^"]+)"/i);
              if (codecsMatch) currentCodecs = codecsMatch[1].toLowerCase();
            } else if (line && !line.startsWith('#')) {
              if (!currentCodecs.includes('png') && !currentCodecs.includes('mjpeg') && !line.includes('.image')) {
                if (currentBandwidth >= maxBandwidth) {
                  maxBandwidth = currentBandwidth;
                  bestVariantUrl = line;
                }
              }
            }
          }

          if (!bestVariantUrl) {
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line && !line.startsWith('#') && !line.includes('.image')) {
                bestVariantUrl = line;
                break;
              }
            }
          }

          if (bestVariantUrl) {
            const resolved = new URL(bestVariantUrl, m3u8Url).href;
            logStream(`[DOWNLOAD HLS] Resolved master playlist to variant stream: ${resolved} (Bandwidth: ${maxBandwidth})`);
            return await resolveM3u8Url(resolved, fetchHeaders);
          }
        }
        return m3u8Url;
      } catch (e) {
        logStream(`[DOWNLOAD HLS] Error resolving m3u8 URL: ${e.message}`);
        return m3u8Url;
      }
    }

    // Simplified HLS download logic: Pass the resolved playlist URL directly to FFmpeg.
    // FFmpeg's native HLS implementation is more robust than manual concatenation.
    if (url.includes('.m3u8')) {
      finalUrl = await resolveM3u8Url(url, {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        ...(spoofedReferer && { 'Referer': spoofedReferer }),
        ...(cookiesStr && { 'Cookie': cookiesStr })
      });
      logStream(`[DOWNLOAD HLS] Using resolved master/variant playlist: ${finalUrl}`);
    }

    // Check if this HLS stream consists of image segments (e.g. TikTok photo slideshows with .image segments)
    let isImageHls = false;
    try {
      const { net } = require('electron');
      const resp = await net.fetch(finalUrl, {
        headers: {
          'User-Agent': userAgent,
          ...(spoofedReferer && { 'Referer': spoofedReferer }),
          ...(cookiesStr && { 'Cookie': cookiesStr })
        },
        redirect: 'follow'
      });
      if (resp.ok) {
        const txt = await resp.text();
        if (txt.includes('.image') || txt.includes('.png') || txt.includes('.jpg')) {
          isImageHls = true;
        }
      }
    } catch (e) {}

    if (isImageHls) {
      logStream(`[DOWNLOAD HLS] Detected image-based HLS stream (slideshow/images). Downloading frames...`);
      event.reply('download-progress', { url, status: 'starting', percent: 10, message: 'Mengunduh slide foto TikTok...' });
      
      try {
        const { net } = require('electron');
        const resp = await net.fetch(finalUrl, {
          headers: {
            'User-Agent': userAgent,
            ...(spoofedReferer && { 'Referer': spoofedReferer }),
            ...(cookiesStr && { 'Cookie': cookiesStr })
          },
          redirect: 'follow'
        });
        const playlistText = await resp.text();
        const baseUrl = new URL(finalUrl);
        const lines = playlistText.split('\n');
        const imageUrls = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            try {
              const absUrl = new URL(trimmed, baseUrl).href;
              imageUrls.push(absUrl);
            } catch (e) {}
          }
        }

        if (imageUrls.length > 0) {
          const fs = require('fs');
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nighthub-slides-'));
          logStream(`[DOWNLOAD HLS] Downloading ${imageUrls.length} image frames to ${tempDir}`);

          for (let i = 0; i < imageUrls.length; i++) {
            try {
              const imgResp = await net.fetch(imageUrls[i], {
                headers: {
                  'User-Agent': userAgent,
                  ...(spoofedReferer && { 'Referer': spoofedReferer }),
                  ...(cookiesStr && { 'Cookie': cookiesStr })
                }
              });
              if (imgResp.ok) {
                const buffer = Buffer.from(await imgResp.arrayBuffer());
                const frameName = `frame_${String(i + 1).padStart(3, '0')}.png`;
                fs.writeFileSync(path.join(tempDir, frameName), buffer);
              }
            } catch (imgErr) {
              logStream(`[DOWNLOAD HLS] Failed to download frame ${i}: ${imgErr.message}`);
            }
            const pct = Math.floor(10 + (i / imageUrls.length) * 50);
            event.reply('download-progress', { url, status: 'downloading', percent: pct, message: `Mengunduh frame ${i + 1}/${imageUrls.length}...` });
          }

          logStream(`[DOWNLOAD HLS] Frames downloaded successfully. Compiling into MP4 video...`);
          event.reply('download-progress', { url, status: 'downloading', percent: 65, message: 'Mengonversi gambar menjadi video MP4...' });

          const pattern = path.join(tempDir, 'frame_%03d.png').replace(/\\/g, '/');
          
          await new Promise((resolve, reject) => {
            ffmpeg()
              .input(pattern)
              .inputOptions(['-framerate 0.5']) // 2 seconds per photo slide
              .outputOptions([
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-r', '25',
                '-movflags', '+faststart'
              ])
              .output(filePath)
              .on('start', (cmd) => logStream(`[FFMPEG SLIDESHOW] Started: ${cmd}`))
              .on('progress', (prog) => {
                event.reply('download-progress', {
                  url,
                  status: 'downloading',
                  percent: 65 + Math.min(30, Math.floor((prog.percent || 0) * 0.3)),
                  timemark: prog.timemark
                });
              })
              .on('end', () => {
                try {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {}
                logStream(`[DOWNLOAD HLS] Slideshow video compiled successfully: ${filePath}`);
                event.reply('download-progress', { url, status: 'completed', filePath });
                resolve(true);
              })
              .on('error', (err, stdout, stderr) => {
                try {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {}
                reject(err);
              })
              .run();
          });

          if (tabId) decrementDownloadTab(tabId);
          return;
        }
      } catch (slideErr) {
        logStream(`[DOWNLOAD HLS] Slideshow fallback error: ${slideErr.message}`);
      }
    }

    // --- STREAM HEADER ANALYZER (FFPROBE) ---
    let videoStreamIndex = '0:v?';
    try {
      const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
      let ffprobePath = ffprobeInstaller.path;
      if (ffprobePath.includes('app.asar')) {
        ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');
      }
      ffmpeg.setFfprobePath(ffprobePath);

      logStream(`[FFPROBE] Analyzing stream headers for: ${finalUrl}`);
      const probeData = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(finalUrl, {
          inputOptions: inputOptions
        }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      if (probeData && probeData.streams) {
        logStream(`[FFPROBE] Analyzed successfully. Total streams: ${probeData.streams.length}`);
        const videoStreams = probeData.streams.filter(s => s.codec_type === 'video');
        
        const validVideoStreams = videoStreams.filter(s => {
          const codec = (s.codec_name || '').toLowerCase();
          const pixFmt = (s.pix_fmt || '').toLowerCase();
          return codec !== 'png' && codec !== 'mjpeg' && !pixFmt.includes('png');
        });

        if (validVideoStreams.length > 0) {
          const bestStream = validVideoStreams[0];
          videoStreamIndex = `0:${bestStream.index}`;
          logStream(`[FFPROBE] Identified valid video stream -> Index: ${bestStream.index}, Codec: ${bestStream.codec_name}, Width: ${bestStream.width}, Height: ${bestStream.height}, FPS: ${bestStream.r_frame_rate}`);
        } else if (videoStreams.length > 0) {
          videoStreamIndex = `0:${videoStreams[0].index}`;
          logStream(`[FFPROBE WARNING] Only image/unknown video streams found, using stream index ${videoStreams[0].index}`);
        }
      }
    } catch (probeErr) {
      logStream(`[FFPROBE ERROR] Failed to analyze stream headers: ${probeErr.message}. Falling back to default 0:v?`);
    }

    const startFFmpegDownload = (isFallback) => {
      let outputOptions = [];
      if (isFallback) {
        logStream(`[DOWNLOAD FALLBACK] Retrying with full transcoding for problematic stream...`);
        lastTargetSize = 0;
        lastTime = Date.now();
        currentSpeed = 0;
        event.reply('download-progress', { 
          url, 
          status: 'starting', 
          percent: 0,
          message: 'Mencoba transcoding video... Silakan tunggu sebentar~'
        });
        outputOptions = [
          '-ignore_unknown',
          '-map', videoStreamIndex,
          '-map', '0:a?',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-max_muxing_queue_size', '9999',
          '-movflags', '+faststart'
        ];
      } else {
        outputOptions = [
          '-ignore_unknown',
          '-map', videoStreamIndex,
          '-map', '0:a?',
          '-c', 'copy',
          '-bsf:a', 'aac_adtstoasc',
          '-max_muxing_queue_size', '9999',
          '-movflags', '+faststart'
        ];
      }

      const command = ffmpeg(finalUrl)
        .inputOptions(inputOptions)
        .outputOptions(outputOptions)
        .output(filePath)
        .on('start', (cmdLine) => {
          logStream(`[DOWNLOAD] FFmpeg started (${isFallback ? 'transcode' : 'copy'}): ${cmdLine}`);
        })
        .on('progress', (progress) => {
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000;
          if (timeDiff >= 0.5) { // Update speed every 500ms
            const sizeDiff = (progress.targetSize || 0) - lastTargetSize;
            currentSpeed = (sizeDiff * 1024) / timeDiff; // bytes per second
            lastTargetSize = progress.targetSize || 0;
            lastTime = now;
          }

          event.reply('download-progress', { 
            url, 
            status: 'downloading', 
            percent: progress.percent || 0,
            timemark: progress.timemark,
            speed: currentSpeed,
            message: isFallback ? 'Sedang men-transcode video, silakan tunggu...' : undefined
          });
        })
        .on('end', () => {
          activeDownloads.delete(url);
          if (tabId) decrementDownloadTab(tabId);
          logStream(`[DOWNLOAD] Finished: ${filePath}`);
          event.reply('download-progress', { url, status: 'completed', filePath });
          if (tempM3u8Path) { try { require('fs').unlinkSync(tempM3u8Path); } catch(e){} }
        })
        .on('error', (err, stdout, stderr) => {
          if (err.message.includes('SIGKILL')) {
            activeDownloads.delete(url);
            if (tabId) decrementDownloadTab(tabId);
            if (tempM3u8Path) { try { require('fs').unlinkSync(tempM3u8Path); } catch(e){} }
            logStream(`[DOWNLOAD] Cancelled by user: ${url}`);
            event.reply('download-progress', { url, status: 'cancelled' });
            // Hapus file setengah jadi kalau di-cancel
            const fs = require('fs');
            if (fs.existsSync(filePath)) {
              try { fs.unlinkSync(filePath); } catch(e) {}
            }
          } else if (!isFallback) {
            logStream(`[DOWNLOAD ERROR] Failed in copy mode, trying fallback to transcode: ${err.message}`);
            startFFmpegDownload(true);
          } else {
            activeDownloads.delete(url);
            if (tabId) decrementDownloadTab(tabId);
            if (tempM3u8Path) { try { require('fs').unlinkSync(tempM3u8Path); } catch(e){} }
            logStream(`[DOWNLOAD ERROR] ${err.message}`);
            logStream(`[DOWNLOAD ERROR] STDERR: ${stderr}`);
            event.reply('download-progress', { url, status: 'error', error: `${err.message}\n${stderr || ''}` });
          }
        });

      activeDownloads.set(url, command);
      command.run();
    };

    startFFmpegDownload(false);
  } catch (err) {
    if (tabId) decrementDownloadTab(tabId);
    logStream(`[DOWNLOAD ERROR] Failed to start ffmpeg: ${err.message}`);
    event.reply('download-progress', { url, status: 'error', error: err.message });
  }
});

ipcMain.on('cancel-download', (event, url) => {
  if (activeDownloads.has(url)) {
    const cmd = activeDownloads.get(url);
    cmd.kill('SIGKILL');
    activeDownloads.delete(url);
  }
});

ipcMain.on('manual-download-action', (event, { id, action }) => {
  if (manualDownloads.has(id)) {
    const item = manualDownloads.get(id);
    if (action === 'pause') item.pause();
    else if (action === 'resume') item.resume();
    else if (action === 'cancel') item.cancel();
  }
});

const retryPaths = new Map();

ipcMain.on('retry-manual-download', (event, { url, filePath }) => {
  const win = getWindowFromEvent(event);
  if (win && !win.isDestroyed()) {
    if (filePath) retryPaths.set(url, filePath);
    win.webContents.downloadURL(url);
  }
});

ipcMain.handle('save-file', async (event, { fileName, data, contentType, options }) => {
  const win = getWindowFromEvent(event);
  const dialogOpts = getDownloadDialogOptions(fileName, contentType, currentLanguage);

  if (options && options.accept) {
    const customFilters = [];
    for (const [mime, exts] of Object.entries(options.accept)) {
      const cleanExts = exts.map(e => e.replace(/^\./, ''));
      const desc = options.description || `${cleanExts.join(', ').toUpperCase()} Files`;
      customFilters.push({ name: `${desc} (*.${cleanExts.join(', *.')})`, extensions: cleanExts });
    }
    customFilters.push({ name: currentLanguage === 'en' ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] });
    dialogOpts.filters = customFilters;
    if (options.description) {
      dialogOpts.title = currentLanguage === 'en' ? `Save ${options.description}` : `Simpan ${options.description}`;
    }
  }

  const result = await dialog.showSaveDialog(win || mainWindow, {
    title: dialogOpts.title,
    defaultPath: dialogOpts.defaultPath,
    filters: dialogOpts.filters
  });

  if (!result.canceled && result.filePath) {
    try {
      let targetPath = result.filePath;
      const targetExt = path.extname(targetPath);
      const defaultExt = path.extname(dialogOpts.defaultPath);
      if (!targetExt && defaultExt) {
        targetPath = `${targetPath}${defaultExt}`;
      }
      lastSaveDirectory = path.dirname(targetPath);
      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(targetPath, buffer);
      return { success: true, filePath: targetPath };
    } catch (e) {
      console.error('Save file error:', e);
      return { success: false, error: e.message };
    }
  }
  return { success: false, cancelled: true };
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const win = getWindowFromEvent(event) || mainWindow;
  return await dialog.showOpenDialog(win, options);
});

ipcMain.handle('read-file-text', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('trim-video-segment', async (event, { inputPath, startTime, duration, suggestedName, accurate = true }) => {
  const win = getWindowFromEvent(event) || mainWindow;
  const isEn = currentLanguage === 'en';
  const fs = require('fs');
  const os = require('os');
  const { spawn } = require('child_process');
  
  let cleanInputPath = inputPath || '';
  if (cleanInputPath.startsWith('file://')) {
    cleanInputPath = decodeURIComponent(cleanInputPath.replace('file://', ''));
    if (process.platform === 'win32' && cleanInputPath.startsWith('/')) {
      cleanInputPath = cleanInputPath.slice(1);
    }
  }

  const ext = path.extname(cleanInputPath) || '.mp4';
  const cleanExt = ext.replace(/^\./, '').toLowerCase() || 'mp4';
  const defaultFileName = suggestedName || `trimmed_${Math.floor(startTime)}_${Math.floor(startTime + duration)}${ext}`;

  const result = await dialog.showSaveDialog(win, {
    title: isEn ? 'Export Video Segment' : 'Ekspor Segmen Video',
    defaultPath: path.join(lastSaveDirectory || app.getPath('downloads'), defaultFileName),
    filters: [
      { name: `${cleanExt.toUpperCase()} Video (*.${cleanExt})`, extensions: [cleanExt] },
      { name: isEn ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }

  let outputPath = result.filePath;
  if (!path.extname(outputPath)) {
    outputPath = `${outputPath}${ext}`;
  }
  lastSaveDirectory = path.dirname(outputPath);

  // Helper to run processes safely with argument arrays & timeout
  const runProcess = (binaryPath, args, timeoutMs = 300000) => {
    return new Promise((resolve, reject) => {
      const proc = spawn(binaryPath, args, { windowsHide: true });
      let stderr = '';
      let stdout = '';
      
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
        reject(new Error(`Process timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });

      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Process exited with code ${code}: ${stderr.slice(-600)}`));
        }
      });

      proc.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };

  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    let ffmpegPath = ffmpegInstaller.path;
    if (ffmpegPath && ffmpegPath.includes('app.asar')) {
      ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }

    let ffprobePath = null;
    try {
      const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
      ffprobePath = ffprobeInstaller.path;
      if (ffprobePath && ffprobePath.includes('app.asar')) {
        ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked');
      }
    } catch (e) {
      logStream(`[TRIM] ffprobe installer not found: ${e.message}`);
    }

    const isMp4OrMov = ext.toLowerCase() === '.mp4' || ext.toLowerCase() === '.mov' || ext.toLowerCase() === '.m4v';

    if (!accurate) {
      // Mode Cepat: Stream Copy langsung pada Keyframe
      logStream(`[TRIM] Starting fast stream-copy trim: start=${startTime}s, dur=${duration}s -> ${outputPath}`);
      const copyArgs = [
        '-ss', startTime.toString(),
        '-i', cleanInputPath,
        '-t', duration.toString(),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero'
      ];
      if (isMp4OrMov) copyArgs.push('-movflags', '+faststart');
      copyArgs.push(outputPath, '-y');

      await runProcess(ffmpegPath, copyArgs, 180000);
      logStream(`[TRIM] Fast stream copy succeeded: ${outputPath}`);
      return { success: true, filePath: outputPath, method: 'copy' };
    }

    // Mode Akurat: Full Precision Re-encode dari Point A ke Point B dengan Frame Rate Asli
    logStream(`[TRIM ACCURATE] Initiating full precision re-encode for start=${startTime}s, dur=${duration}s`);

    let vStream = null;

    // Ambil metadata stream dan framerate asli video via ffprobe
    if (ffprobePath) {
      try {
        const probeRes = await runProcess(ffprobePath, ['-show_streams', '-select_streams', 'v:0', '-of', 'json', cleanInputPath], 20000);
        const probeData = JSON.parse(probeRes.stdout);
        vStream = (probeData.streams || [])[0];
      } catch (probeErr) {
        logStream(`[TRIM PROBE WARNING] Failed to probe streams: ${probeErr.message}`);
      }
    }

    // Tentukan frame rate asli secara presisi (misal 60/1, 59.94, 29.97, dll)
    const sourceFps = vStream && vStream.r_frame_rate && vStream.r_frame_rate !== '0/0'
      ? vStream.r_frame_rate
      : (vStream && vStream.avg_frame_rate && vStream.avg_frame_rate !== '0/0' ? vStream.avg_frame_rate : '30/1');
    const pixFmt = vStream && vStream.pix_fmt ? vStream.pix_fmt : 'yuv420p';

    logStream(`[TRIM ACCURATE] Parameters: targetFps=${sourceFps}, pix_fmt=${pixFmt}, start=${startTime.toFixed(3)}s, dur=${duration.toFixed(3)}s`);

    // Perintah eksplisit FFmpeg:
    // 1. -ss startTime sebelum input untuk seeking frame-akurat
    // 2. -t duration untuk durasi tepat dari Point A ke B
    // 3. -r sourceFps untuk mengunci frame rate persis sama dengan video asli
    // 4. -vf "setpts=PTS-STARTPTS" & -af "asetpts=PTS-STARTPTS" untuk reset timestamp dari 0.0s tanpa lag/patah
    // 5. -crf 17 untuk kualitas visual tinggi (visually lossless)
    // 6. -avoid_negative_ts make_zero untuk mencegah gap timestamp di MP4
    const accurateArgs = [
      '-ss', startTime.toString(),
      '-i', cleanInputPath,
      '-t', duration.toString(),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '17',
      '-r', sourceFps,
      '-pix_fmt', pixFmt,
      '-vf', 'setpts=PTS-STARTPTS',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-af', 'asetpts=PTS-STARTPTS',
      '-avoid_negative_ts', 'make_zero'
    ];
    if (isMp4OrMov) accurateArgs.push('-movflags', '+faststart');
    accurateArgs.push(outputPath, '-y');

    await runProcess(ffmpegPath, accurateArgs, 600000);
    logStream(`[TRIM ACCURATE] Full precision re-encode succeeded: ${outputPath}`);
    return { success: true, filePath: outputPath, method: 'full-precision-reencode' };

  } catch (err) {
    logStream(`[TRIM ERROR] Primary export failed: ${err.message}. Attempting emergency stream-copy fallback...`);
    try {
      const emergencyArgs = [
        '-ss', startTime.toString(),
        '-i', cleanInputPath,
        '-t', duration.toString(),
        '-c', 'copy',
        '-avoid_negative_ts', 'make_zero',
        outputPath,
        '-y'
      ];
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      let fallbackFfmpeg = ffmpegInstaller.path;
      if (fallbackFfmpeg && fallbackFfmpeg.includes('app.asar')) {
        fallbackFfmpeg = fallbackFfmpeg.replace('app.asar', 'app.asar.unpacked');
      }
      await runProcess(fallbackFfmpeg, emergencyArgs, 180000);
      logStream(`[TRIM] Emergency stream copy succeeded: ${outputPath}`);
      return { success: true, filePath: outputPath, method: 'emergency-copy' };
    } catch (emergencyErr) {
      logStream(`[TRIM FATAL ERROR] All export attempts failed: ${emergencyErr.message}`);
      return { success: false, error: emergencyErr.message };
    }
  }
});

const gotTheLock = app.requestSingleInstanceLock(); // Request single instance lock to manage multiple windows correctly.

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    logStream('Opening new window from second-instance call.');
    
    const args = commandLine.slice(app.isPackaged ? 1 : 2);
    let videoPath = null;
    for (const arg of args) {
      try {
        if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
          const ext = path.extname(arg).toLowerCase();
          if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m3u8', '.m3u', '.ts', '.flv', '.wmv', '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
            videoPath = arg;
            break;
          }
        } else {
          const resolvedPath = path.resolve(workingDirectory, arg);
          if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
            const ext = path.extname(resolvedPath).toLowerCase();
            if (['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m3u8', '.m3u', '.ts', '.flv', '.wmv', '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
              videoPath = resolvedPath;
              break;
            }
          }
        }
      } catch (e) {}
    }

    const newWin = createWindow(videoPath);
    if (newWin) {
      if (newWin.isMinimized()) newWin.restore();
      newWin.focus();
      if (videoPath) {
        logStream(`Opening video from second instance on new window: ${videoPath}`);
      }
    }
  });

  app.on('open-file', (event, path) => {
    event.preventDefault();
    logStream(`macOS open-file event: ${path}`);
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('open-file', path);
    } else {
      // If app is not ready yet, we can store it or let the process.argv handle it if possible,
      // but macOS usually sends this event. We can store it in a global variable.
      global.macOpenFile = path;
    }
  });

  app.whenReady().then(async () => {
    const { session, Menu } = require('electron');
    try {
      Menu.setApplicationMenu(null);
    } catch (e) {
      console.error('Failed to set application menu to null:', e);
    }
    // Set user agent fallback globally to look like standard Chrome
    const defaultUA = session.defaultSession.getUserAgent();
    app.userAgentFallback = defaultUA.replace(/NightHUB Player\/[\d\.]+\s*/, '').replace(/Electron\/[\d\.]+\s*/, '');
    
    // 1. BERSIHKAN CACHE (SANGAT PENTING!)
    // Menghapus riwayat video "warning" yang mungkin nyangkut di memori Electron
    try {
      await session.defaultSession.clearCache();
      // BERSILAHKAN CACHE DNS AGAR TIDAK NYANGKUT DI IP INTERNET POSITIF
      await session.defaultSession.clearHostResolverCache(); 
      console.log("Cache & DNS cleared successfully!");
    } catch (e) {
      console.log("Failed to clear cache:", e);
    }

    // Pastikan perubahan cookie (misal login akun di Tab lain) langsung di-flush ke storage sesi
    try {
      session.defaultSession.cookies.on('changed', (event, cookie, cause, removed) => {
        if (!removed && cookie && (cookie.domain || '').includes('huggingface.co')) {
          session.defaultSession.flushStorageData();
        }
      });
    } catch (e) {}

    const requestOrigins = new Map();

    // Buka celah lebar-lebar buat malsuin header Referer & Origin (VERSI AGRESIF)
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      try {
        const urlObj = new URL(details.url);
        const urlStr = details.url.toLowerCase();

        // Capture Origin for CORS handling in onHeadersReceived
        const originHeaderKey = Object.keys(details.requestHeaders || {}).find(k => k.toLowerCase() === 'origin');
        if (originHeaderKey && details.requestHeaders[originHeaderKey]) {
          requestOrigins.set(details.id, details.requestHeaders[originHeaderKey]);
        } else {
          const refererHeaderKey = Object.keys(details.requestHeaders || {}).find(k => k.toLowerCase() === 'referer');
          if (refererHeaderKey && details.requestHeaders[refererHeaderKey]) {
            try {
              requestOrigins.set(details.id, new URL(details.requestHeaders[refererHeaderKey]).origin);
            } catch (e) {}
          } else if (details.referrer) {
            try {
              requestOrigins.set(details.id, new URL(details.referrer).origin);
            } catch (e) {}
          }
        }

        // 1. Blokir Internet Positif (Pindah ke sini karena onBeforeRequest dipakai Ghostery)
        if (urlStr.includes('internet-positif') || urlStr.includes('uzone.id') || urlStr.includes('mercusuar')) {
          logStream(`[BLOCKED] ISP mencoba mengalihkan ke Internet Positif: ${details.url}`);
          return callback({ cancel: true });
        }

        // Abaikan request internal / vite dev server / proxy internal
        if (details.webContentsId === -1 || urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
          return callback({ cancel: false, requestHeaders: details.requestHeaders });
        }

        // Copy semua header bawaan dari request
        let reqHeaders = { ...details.requestHeaders };

        // 2. HAPUS "TUKANG CEPU" CHROMIUM TERTENTU HANYA UNTUK MEDIA
        if (details.resourceType === 'media') {
          const headersToKill = [
            'Sec-Fetch-Site', 'sec-fetch-site',
            'Sec-Fetch-Mode', 'sec-fetch-mode',
            'Sec-Fetch-Dest', 'sec-fetch-dest'
          ];
          headersToKill.forEach(header => {
            if (reqHeaders[header]) delete reqHeaders[header];
          });
        }

        // 3. LOGIKA SPOOFING REFERER DOMAIN
        const hostnameParts = urlObj.hostname.split('.');
        let rootDomain = urlObj.hostname;
        if (hostnameParts.length >= 2) {
           rootDomain = hostnameParts.slice(-2).join('.');
        }

        // 4. SAMARKAN IDENTITAS BROWSER
        let isSnifferRequest = false;
        let snifferViewUrl = '';
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.snifferViews) {
          for (const view of mainWindow.snifferViews.values()) {
            if (view.webContents && details.webContentsId === view.webContents.id) {
              isSnifferRequest = true;
              try {
                snifferViewUrl = view.webContents.getURL();
              } catch (e) {}
              break;
            }
          }
        }

        let isMainPlayerRequest = false;
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && details.webContentsId === mainWindow.webContents.id) {
          isMainPlayerRequest = true;
        }

        // Pasang Referer & Origin palsu
        if (isMainPlayerRequest && mainPlayerReferer) {
          reqHeaders['Referer'] = mainPlayerReferer;
          try {
            const refUrl = new URL(mainPlayerReferer);
            reqHeaders['Origin'] = refUrl.origin;
          } catch(e) {}
        } else if (!reqHeaders['Referer'] && details.resourceType !== 'main_frame' && !urlStr.includes('cloudflare.com') && !urlStr.includes('turnstile') && !urlStr.includes('google.com')) {
          if (isSnifferRequest && snifferViewUrl && snifferViewUrl.startsWith('http')) {
            reqHeaders['Referer'] = snifferViewUrl;
            try {
              const refUrl = new URL(snifferViewUrl);
              reqHeaders['Origin'] = refUrl.origin;
            } catch(e) {}
          } else {
            // Gunakan root domain tanpa paksa www. agar lebih kompatibel
            reqHeaders['Referer'] = `https://${rootDomain}/`;
            reqHeaders['Origin'] = `https://${rootDomain}`;
          }
        }
        
        const chromeMatch = app.userAgentFallback.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
        const chromeVersion = chromeMatch ? chromeMatch[1] : '116.0.0.0';
        const mobileUA = `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Mobile Safari/537.36`;
        const desktopUA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
        const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

        const isGoogleOrOauth = 
          urlObj.hostname.includes('accounts.google.com') || 
          urlObj.hostname.includes('googleusercontent.com') ||
          urlObj.hostname.includes('googleapis.com') ||
          urlObj.hostname.includes('login.microsoftonline.com') ||
          urlObj.hostname.includes('login.live.com') ||
          urlObj.hostname.includes('account.live.com') ||
          urlObj.hostname.includes('login.yahoo.com') ||
          urlObj.hostname.includes('twitter.com') ||
          urlObj.hostname.includes('x.com') ||
          urlObj.hostname.includes('appleid.apple.com') ||
          urlObj.hostname.includes('facebook.com') ||
          urlObj.hostname.includes('github.com') ||
          urlObj.hostname.includes('discord.com');

        if (isGoogleOrOauth) {
          reqHeaders['User-Agent'] = firefoxUA;
          // Delete all Chrome client hints for perfect Firefox compatibility
          for (const key of Object.keys(reqHeaders)) {
            if (key.toLowerCase().startsWith('sec-ch-ua')) {
              delete reqHeaders[key];
            }
          }
        } else if (isSnifferRequest || (isMainPlayerRequest && mainPlayerReferer)) {
          reqHeaders['User-Agent'] = snifferIsMobile ? mobileUA : desktopUA;
          if (snifferIsMobile) {
            reqHeaders['sec-ch-ua-mobile'] = '?1';
            reqHeaders['sec-ch-ua-platform'] = '"Android"';
            if (reqHeaders['sec-ch-ua-platform-version']) {
              reqHeaders['sec-ch-ua-platform-version'] = '"13.0.0"';
            }
            if (reqHeaders['sec-ch-ua-model']) {
              reqHeaders['sec-ch-ua-model'] = '"Pixel 7"';
            }
          }
        } else {
          reqHeaders['User-Agent'] = desktopUA;
        }

        // Clean up sec-ch-ua to remove Electron/App Name globally for non-Google/OAuth requests
        if (!isGoogleOrOauth) {
          const secChUaKey = Object.keys(reqHeaders).find(k => k.toLowerCase() === 'sec-ch-ua');
          if (secChUaKey && reqHeaders[secChUaKey]) {
            reqHeaders[secChUaKey] = reqHeaders[secChUaKey].split(',')
              .filter(part => !part.toLowerCase().includes('electron') && !part.toLowerCase().includes('nighthub'))
              .map(part => part.replace(/Chromium/gi, 'Google Chrome'))
              .join(',');
          }
        }
        
        const secChUaFullKey = Object.keys(reqHeaders).find(k => k.toLowerCase() === 'sec-ch-ua-full-version-list');
        if (secChUaFullKey && reqHeaders[secChUaFullKey]) {
          reqHeaders[secChUaFullKey] = reqHeaders[secChUaFullKey].split(',')
            .filter(part => !part.toLowerCase().includes('electron') && !part.toLowerCase().includes('nighthub'))
            .map(part => part.replace(/Chromium/gi, 'Google Chrome'))
            .join(',');
        }

        callback({ cancel: false, requestHeaders: reqHeaders });

      } catch (e) {
        callback({ cancel: false, requestHeaders: details.requestHeaders });
      }
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      try {
        const urlObj = new URL(details.url);
        if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
          return callback({ cancel: false, responseHeaders: details.responseHeaders });
        }
        
        const isGoogleOrOauth = 
          urlObj.hostname.includes('google.com') || 
          urlObj.hostname.includes('googleusercontent.com') ||
          urlObj.hostname.includes('googleapis.com') ||
          urlObj.hostname.includes('youtube.com') ||
          urlObj.hostname.includes('facebook.com') ||
          urlObj.hostname.includes('github.com') ||
          urlObj.hostname.includes('discord.com');
          
        if (isGoogleOrOauth) {
          return callback({ cancel: false, responseHeaders: details.responseHeaders });
        }
      } catch (e) {}

      const responseHeaders = { ...details.responseHeaders };
      
      let origin = requestOrigins.get(details.id);
      requestOrigins.delete(details.id);

      if (!origin && details.referrer) {
        try {
          origin = new URL(details.referrer).origin;
        } catch (e) {}
      }

      // Force CORS headers to allow Web Audio API to process the media
      const corsHeaders = {
        'Access-Control-Allow-Methods': ['GET, POST, OPTIONS, PUT, DELETE, PATCH'],
        'Access-Control-Allow-Headers': ['Content-Type, Range, Authorization, X-Requested-With, Cache-Control, Accept, Origin, Accept-Encoding'],
        'Access-Control-Expose-Headers': ['Content-Length, Content-Range, Content-Type, Accept-Ranges'],
      };

      if (origin && origin !== 'null') {
        corsHeaders['Access-Control-Allow-Origin'] = [origin];
        corsHeaders['Access-Control-Allow-Credentials'] = ['true'];
      } else {
        corsHeaders['Access-Control-Allow-Origin'] = ['*'];
        delete responseHeaders['Access-Control-Allow-Credentials'];
        delete responseHeaders['access-control-allow-credentials'];
      }

      Object.keys(corsHeaders).forEach(key => {
        responseHeaders[key] = corsHeaders[key];
      });

      // Remove X-Frame-Options to allow embedding if needed
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['Content-Security-Policy'];

      const isOptions = details.method === 'OPTIONS';
      const responseData = { cancel: false, responseHeaders };
      if (isOptions) {
        responseData.statusLine = 'HTTP/1.1 200 OK';
      }

      callback(responseData);
    });

    // --- TAMBAHAN LOGGING STREAM BIKINAN AKU ---
    session.defaultSession.webRequest.onResponseStarted((details) => {
      if (details.url.includes('localhost') || details.url.includes('127.0.0.1')) return;
      
      const url = details.url.toLowerCase();
      
      // Filter ketat: Abaikan gambar, thumbnail, preview singkat, dan iklan
      const isImage = details.resourceType === 'image' || url.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)(\?|$)/);
      const isPreview = url.match(/(preview|thumb|storyboard|sprite|teaser|trailer|promo|sample|short)/) && 
                        !url.includes('spankbang') && 
                        !url.includes('sb-preview') &&
                        !url.match(/\.(mp4|m3u8|webm)(\?|$)/);
      const isAd = url.match(/(\/ads\/|ad-|tracker|banner|popunder|vast|vmap|adserver|analytics)/);
      
      if (isImage || isPreview || isAd) return;

      // Cek apakah ini benar-benar video stream utama
      // Fokus pada HLS (.m3u8), DASH (.mpd), atau file video langsung (.mp4, .webm)
      // Abaikan segmen individual (.ts, .m4s, .vtt) agar list tidak penuh
      
      // Abaikan resource type yang jelas bukan video
      const isDocumentOrScript = ['mainFrame', 'subFrame', 'stylesheet', 'script', 'font', 'ping', 'cspReport'].includes(details.resourceType);
      if (isDocumentOrScript) return;

      let contentType = '';
      if (details.responseHeaders) {
        const ctHeader = details.responseHeaders['Content-Type'] || details.responseHeaders['content-type'];
        if (ctHeader && ctHeader.length > 0) {
          contentType = ctHeader[0].toLowerCase();
        }
      }

      const isM3u8ContentType = contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || contentType.includes('vnd.apple.mpegurl');
      const isDashContentType = contentType.includes('dash+xml');
      const isVideoContentType = contentType.startsWith('video/');

      const isMainStream = (url.includes('.m3u8') || url.includes('/m3u8/') || url.includes('.mpd') || isM3u8ContentType || isDashContentType) && !url.match(/\.(ts|m4s|vtt)(\?|$)/);
      const isDirectVideo = (details.resourceType === 'media' || url.match(/\.(mp4|webm|mov|avi)(\?|$)/) || isVideoContentType) && !url.match(/\.(ts|m4s|vtt)(\?|$)/);

      if ((isMainStream || isDirectVideo) && mainWindow && !mainWindow.isDestroyed()) {
        // Abaikan file video yang ukurannya terlalu kecil (kemungkinan preview/iklan) < 2MB
        let contentLength = 0;
        if (details.responseHeaders) {
          const clHeader = details.responseHeaders['Content-Length'] || details.responseHeaders['content-length'];
          if (clHeader && clHeader.length > 0) {
            contentLength = parseInt(clHeader[0], 10);
          }
        }

        // Jika direct video (bukan stream) dan ukurannya kurang dari 2MB, abaikan (kemungkinan preview)
        if (!isMainStream && isDirectVideo && contentLength > 0 && contentLength < 2 * 1024 * 1024) {
          logStream(`[IGNORED SMALL VIDEO] ${details.url} (${Math.round(contentLength/1024)} KB)`);
          return;
        }

        // Coba deteksi resolusi dari URL jika ada (misal: 1080p, 720p, 480p)
        const resMatch = url.match(/(1080p|720p|480p|360p|240p|1080|720|480|360|240)/);
        const resolutionStr = resMatch ? ` [${resMatch[1]}]` : '';
        
        logStream(`[SNIFFER] Video detected: ${details.url}`);
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
            const activeView = getActiveSnifferView();
            mainWindow.webContents.send('video-detected', {
            url: details.url,
            type: (isMainStream ? 'HLS/DASH STREAM' : 'DIRECT VIDEO') + resolutionStr,
            timestamp: Date.now(),
            size: contentLength > 0 ? `${(contentLength / (1024 * 1024)).toFixed(2)} MB` : undefined,
            title: activeView && activeView.webContents ? activeView.webContents.getTitle() : 'Unknown Video'
          });
        }
      }

      // Cuma ngintip request media atau API biar log-nya nggak kepenuhan
      if (details.resourceType === 'media' || details.resourceType === 'xhr' || details.resourceType === 'fetch') {
        logStream(`[RESPONSE] ${details.statusCode} | ${details.resourceType.toUpperCase()} | ${details.url}`);
      }
    });

    session.defaultSession.webRequest.onErrorOccurred((details) => {
      requestOrigins.delete(details.id);
      if (details.url.includes('localhost') || details.url.includes('127.0.0.1')) return;
      logStream(`[ERROR] ${details.error} | ${details.resourceType.toUpperCase()} | ${details.url}`);
    });

    session.defaultSession.webRequest.onCompleted((details) => {
      requestOrigins.delete(details.id);
    });
    // -------------------------------------------

    // --- MANUAL DOWNLOAD HANDLER ---
    session.defaultSession.on('will-download', (event, item, webContents) => {
      const id = Date.now().toString();
      const fileName = item.getFilename();
      const totalBytes = item.getTotalBytes();
      const url = item.getURL();
      const referer = webContents ? webContents.getURL() : '';
      const userAgent = webContents ? webContents.getUserAgent() : '';

      let tabId = null;
      let targetWin = null;
      if (openWindows) {
        for (const w of openWindows) {
          if (w && !w.isDestroyed() && w.snifferViews) {
            for (const [tId, view] of w.snifferViews.entries()) {
              if (view.webContents === webContents) {
                tabId = tId;
                targetWin = w;
                break;
              }
            }
          }
          if (tabId) break;
        }
      }

      if (tabId && targetWin && !targetWin.isDestroyed() && webContents && !webContents.isDestroyed()) {
        const originalUrl = webContents.getURL();
        if (originalUrl && originalUrl !== url) {
          logStream(`[DOWNLOAD INTERCEPT] Resetting tab ${tabId} URL from download URL ${url} back to page URL ${originalUrl}`);
          targetWin.webContents.send('sniffer-url-updated', { tabId, url: originalUrl });
        }
      }

      // NATIVE DOWNLOAD FLOW
      const setupDownload = () => {
        manualDownloads.set(id, item);
        if (tabId) incrementDownloadTab(tabId);

        let lastBytes = 0;
        let lastTime = Date.now();
        let currentSpeed = 0;

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('manual-download-started', {
            id,
            fileName,
            totalBytes,
            url,
            state: 'progressing',
            receivedBytes: item.getReceivedBytes(),
            speed: 0
          });
        }

        item.on('updated', (event, state) => {
          const now = Date.now();
          const receivedBytes = item.getReceivedBytes();
          
          if (now - lastTime >= 500) {
            currentSpeed = ((receivedBytes - lastBytes) / (now - lastTime)) * 1000;
            lastBytes = receivedBytes;
            lastTime = now;
          }

          if (state === 'interrupted') {
            logStream(`[MANUAL DOWNLOAD] Interrupted: ${fileName}`);
          } else if (state === 'progressing') {
            if (item.isPaused()) {
              logStream(`[MANUAL DOWNLOAD] Paused: ${fileName}`);
              currentSpeed = 0;
            }
          }
          
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('manual-download-progress', {
              id,
              state: item.isPaused() ? 'paused' : state,
              receivedBytes,
              totalBytes: item.getTotalBytes(),
              speed: currentSpeed
            });
          }
        });

        item.once('done', (event, state) => {
          logStream(`[MANUAL DOWNLOAD] Done: ${fileName} (${state})`);
          if (tabId) decrementDownloadTab(tabId);
          if (mainWindow && !mainWindow.isDestroyed()) {
            const finalTotal = item.getTotalBytes();
            const finalReceived = item.getReceivedBytes();
            mainWindow.webContents.send('manual-download-done', {
              id,
              state, // 'completed', 'cancelled', 'interrupted'
              filePath: item.getSavePath(),
              receivedBytes: state === 'completed' && finalTotal > 0 ? finalTotal : finalReceived,
              totalBytes: finalTotal > 0 ? finalTotal : finalReceived,
              error: state === 'interrupted' ? 'Unduhan terganggu (interrupted). Silakan periksa koneksi internet Anda.' : undefined
            });
          }
          manualDownloads.delete(id);
        });
      };

      if (retryPaths.has(url)) {
        item.setSavePath(retryPaths.get(url));
        retryPaths.delete(url);
        setupDownload();
      } else {
        const isImageDownload = imageDownloadRequests.has(url);
        if (isImageDownload) {
          imageDownloadRequests.delete(url);
        }

        const dialogOpts = getDownloadDialogOptions(fileName, item.getMimeType(), currentLanguage, url, isImageDownload);

        // Show Save Dialog synchronously to prevent background downloading/timeouts while choosing target location
        const filePath = dialog.showSaveDialogSync({
          title: dialogOpts.title,
          defaultPath: dialogOpts.defaultPath,
          filters: dialogOpts.filters
        });

        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            mainWindow.focus();
          } catch (e) {}
        }

        if (filePath) {
          let targetPath = filePath;
          const targetExt = path.extname(targetPath);
          const defaultExt = path.extname(dialogOpts.defaultPath);
          if (!targetExt && defaultExt) {
            targetPath = `${targetPath}${defaultExt}`;
          }
          lastSaveDirectory = path.dirname(targetPath);
          item.setSavePath(targetPath);
          setupDownload();
        } else {
          item.cancel();
        }
      }
    });
    // -------------------------------------------

    createWindow();
  });
}

// BYPASS SSL 2: Paksa Electron menerima sertifikat apapun (meskipun cacat)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault(); // Cegah Electron memutus koneksi
  callback(true);         // Izinkan koneksi diteruskan dengan status "Aman"
});

// --- MASTER CLEANUP & PROCESS TERMINATION ---
let isTerminatingApp = false;

function terminateAllBackgroundProcessesAndExit() {
  if (isTerminatingApp) return;
  isTerminatingApp = true;
  logStream('Stopping all background processes and exiting application...');

  // 1. Hentikan pembaruan adblock di latar belakang jika sedang berjalan
  try {
    stopAdblockUpdate();
  } catch (e) {}

  // 2. Matikan background utility worker (worker.cjs)
  try {
    stopBackgroundWorker();
  } catch (e) {}

  // 3. Matikan proses native MPV jika sedang berjalan
  if (activeMpvProcess && !activeMpvProcess.killed) {
    try {
      activeMpvProcess.kill('SIGKILL');
    } catch (e) {}
    activeMpvProcess = null;
  }

  // 4. Tutup dan putuskan semua koneksi server proxy lokal
  try {
    if (proxyServer) {
      if (typeof proxyServer.closeAllConnections === 'function') {
        proxyServer.closeAllConnections();
      }
      proxyServer.close();
    }
  } catch (e) {}

  // 5. Tutup server AI API lokal
  try {
    if (aiApiServer) {
      if (typeof aiApiServer.closeAllConnections === 'function') {
        aiApiServer.closeAllConnections();
      }
      aiApiServer.close();
    }
  } catch (e) {}

  // 6. Hancurkan semua popup / helper views
  const popupViews = [
    menuView, suggestionsView, findView, passwordsView, passwordPromptView,
    webContextMenuView, tabPreviewWindow
  ];
  for (const v of popupViews) {
    if (v && !v.isDestroyed()) {
      try {
        if (typeof v.close === 'function') v.close();
        else if (v.webContents && !v.webContents.isDestroyed()) v.webContents.destroy();
      } catch (e) {}
    }
  }

  // 7. Paksa penghentian proses total dari Task Manager
  try {
    app.exit(0);
  } catch (e) {}
  try {
    process.exit(0);
  } catch (e) {}
}

app.on('window-all-closed', () => {
  terminateAllBackgroundProcessesAndExit();
});

app.on('before-quit', () => {
  terminateAllBackgroundProcessesAndExit();
});

app.on('will-quit', () => {
  terminateAllBackgroundProcessesAndExit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

