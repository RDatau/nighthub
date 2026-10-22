import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";

// Safety settings untuk mengizinkan bahasa eksplisit/vulgar tanpa diblokir model
export const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Helper to parse multiple Gemini API Keys (separated by Enter, commas, spaces, etc.)
export function parseGeminiApiKeys(input?: string): string[] {
  const keys: string[] = [];
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

  // Also include environment key if present
  if (process.env.GEMINI_API_KEY) {
    const envKeys = process.env.GEMINI_API_KEY
      .split(/[\r\n,;\s]+/)
      .map(k => k.trim().replace(/^["']|["']$/g, '').trim())
      .filter(k => k.length > 10);
    keys.push(...envKeys);
  }

  // Deduplicate while preserving order
  const uniqueKeys: string[] = [];
  for (const k of keys) {
    if (!uniqueKeys.includes(k)) {
      uniqueKeys.push(k);
    }
  }
  return uniqueKeys;
}

// Key rotation state & 429 tracking (matched with Lumina geminiService logic)
let currentGeminiKeyIndex = 0;
const exhaustedGeminiKeysMap = new Map<string, number>();
const GEMINI_KEY_COOLDOWN_MS = 60 * 1000; // 60s cooldown for keys hitting 429 quota

export function markGeminiKeyExhausted(key: string) {
  if (key) {
    exhaustedGeminiKeysMap.set(key, Date.now());
  }
}

export function getNextAvailableGeminiKey(keys: string[]): { key: string; index: number } | null {
  if (!keys || keys.length === 0) return null;
  const now = Date.now();

  // Clear keys whose cooldown period has expired
  for (const [key, timestamp] of exhaustedGeminiKeysMap.entries()) {
    if (now - timestamp > GEMINI_KEY_COOLDOWN_MS) {
      exhaustedGeminiKeysMap.delete(key);
    }
  }

  // Search starting from current index for an unexhausted key
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentGeminiKeyIndex + i) % keys.length;
    const candidate = keys[idx];
    if (!exhaustedGeminiKeysMap.has(candidate)) {
      currentGeminiKeyIndex = idx;
      return { key: candidate, index: idx };
    }
  }

  // If all keys are in cooldown, pick the one that has been in cooldown the longest
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

export function rotateGeminiKey(keys: string[]): string | null {
  if (!keys || keys.length === 0) return null;
  currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % keys.length;
  const nextKey = keys[currentGeminiKeyIndex];
  console.log(`[Gemini-Rotation] Beralih ke Key #${currentGeminiKeyIndex + 1}/${keys.length} (${nextKey.slice(0, 4)}...${nextKey.slice(-4)})`);
  return nextKey;
}

export async function executeWithKeyRotation<T>(
  customKeyInput: string | undefined,
  operation: (ai: GoogleGenAI, activeKey: string, keyIndex: number, totalKeys: number) => Promise<T>,
  options: { maxRetries?: number; operationName?: string } = {}
): Promise<T> {
  const allKeys = parseGeminiApiKeys(customKeyInput);
  if (allKeys.length === 0) {
    throw new Error("Tidak ada Gemini API Key yang valid ditemukan. Masukkan API Key Anda di menu Pengaturan.");
  }

  const opName = options.operationName || "Gemini-Operation";
  const totalAttempts = allKeys.length > 1 ? allKeys.length : (options.maxRetries ?? 2) + 1;
  let lastError: any = null;

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
    } catch (error: any) {
      lastError = error;
      const errorMsg = (error.message || "").toLowerCase();
      const status = error.status || error.code;

      const isQuotaError =
        errorMsg.includes("429") ||
        errorMsg.includes("resource_exhausted") ||
        errorMsg.includes("quota") ||
        errorMsg.includes("rate limit") ||
        status === "RESOURCE_EXHAUSTED" ||
        status === 429;

      const isKeyInvalid =
        errorMsg.includes("api_key_invalid") ||
        errorMsg.includes("not valid") ||
        errorMsg.includes("permission_denied") ||
        status === 403;

      const isConnectionError =
        errorMsg.includes("fetch failed") ||
        errorMsg.includes("network") ||
        errorMsg.includes("econnreset") ||
        errorMsg.includes("etimedout") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("socket") ||
        errorMsg.includes("500") ||
        errorMsg.includes("503") ||
        status === 500 ||
        status === 503;

      if ((isQuotaError || isKeyInvalid || isConnectionError) && allKeys.length > 1 && attempt < totalAttempts - 1) {
        console.warn(`[${opName}-Rotation] Key #${keyIndex + 1}/${allKeys.length} (${activeKey.slice(0, 4)}...${activeKey.slice(-4)}) terkena ${isQuotaError ? '429 Quota Exceeded' : isKeyInvalid ? 'Invalid/Permission Error' : 'Connection Error'}. Merotasi ke Key berikutnya (Percobaan ${attempt + 1}/${totalAttempts})...`);
        markGeminiKeyExhausted(activeKey);
        rotateGeminiKey(allKeys);
        const waitTime = isConnectionError ? 500 : 200;
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }

      if (isQuotaError && allKeys.length === 1 && attempt < totalAttempts - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[${opName}-Retry] Quota hit 429 pada single key, retry in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// Single key helper fallback
function getGenAI(customKey?: string): GoogleGenAI {
  const keys = parseGeminiApiKeys(customKey);
  const keyToUse = keys[0] || process.env.GEMINI_API_KEY || '';
  if (!keyToUse) {
    throw new Error("GEMINI_API_KEY environment variable is missing and no custom key was provided.");
  }
  return new GoogleGenAI({
    apiKey: keyToUse,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// API Endpoint to verify Gemini API Key
app.post("/api/ai/verify-key", async (req, res) => {
  try {
    const { apiKey } = req.body;
    const keys = parseGeminiApiKeys(apiKey);
    if (keys.length === 0) {
      return res.status(400).json({ success: false, error: "Tidak ada API Key yang valid ditemukan." });
    }

    await executeWithKeyRotation(
      apiKey,
      async (ai, activeKey, idx, total) => {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: [{ parts: [{ text: "ping" }] }],
          config: {
            safetySettings: safetySettings as any,
          },
        });
        if (response.text) {
          return true;
        }
        throw new Error("Respons kosong dari Gemini API.");
      },
      { operationName: "Verify-Key" }
    );

    res.json({
      success: true,
      totalKeys: keys.length,
      message: `${keys.length} Gemini API Key terdaftar. Rotasi otomatis aktif & siap digunakan!`
    });
  } catch (error: any) {
    console.error("Error verifying Gemini API keys:", error);
    res.status(400).json({ success: false, error: error.message || "Semua API Key gagal atau kuota habis." });
  }
});

export const isTtsModelStreamSupported = (modelName: string): boolean => {
  const m = (modelName || '').toLowerCase().trim();
  return m.includes('3.8') || m.includes('3.1') || m.includes('live');
};

export function buildTtsParts(text: string, modelName: string, styleInstruction?: string): any[] {
  const cleanText = text.replace(/[*#_~`]/g, "").slice(0, 800).trim();
  const isModel38 = (modelName || '').toLowerCase().includes('3.8');
  
  if (isModel38 && styleInstruction && styleInstruction.trim()) {
    const rawStyle = styleInstruction.trim();
    return [
      {
        text: `Speak this text: "${cleanText}",\nspeechMetadata: {\n  style: ${JSON.stringify(rawStyle)}\n}`
      },
      {
        inlineData: {
          mimeType: 'application/json',
          data: Buffer.from(JSON.stringify({ style: rawStyle })).toString('base64')
        }
      }
    ];
  }
  
  const stylePrefix = styleInstruction && styleInstruction.trim() ? `[Style Instruction (Speech Tone & Emotion)]: ${styleInstruction.trim()}\n` : '';
  return [{ text: `${stylePrefix}Speak this text: "${cleanText}".` }];
}

// API Endpoint for generating standalone TTS audio for specific text
app.post("/api/ai/tts", async (req, res) => {
  try {
    const { text, apiKey, ttsModel = "gemini-3.8-flash-tts", voice = "Kore", aiStyleInstruction, temperature = 1.0 } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: "Text is required for TTS." });
    }

    const voiceName = voice || "Kore";
    const primaryModel = (ttsModel && ttsModel.includes("gemini")) ? ttsModel : "gemini-3.8-flash-tts";
    const ttsParts = buildTtsParts(text, primaryModel, aiStyleInstruction);
    const supportsStreaming = isTtsModelStreamSupported(primaryModel);

    const result = await executeWithKeyRotation(
      apiKey,
      async (ai, activeKey, keyIdx, totalKeys) => {
        let audioBase64: string | null = null;
        let mimeType: string = "audio/pcm";

        // Jika model mendukung streaming, coba generateContentStream terlebih dahulu
        if (supportsStreaming) {
          try {
            const stream = await ai.models.generateContentStream({
              model: primaryModel,
              contents: [{ parts: ttsParts }],
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
                temperature: typeof temperature === 'number' ? temperature : 1.0,
                safetySettings: safetySettings as any,
              },
            });

            const pcmChunks: Buffer[] = [];
            for await (const chunk of stream) {
              const parts = chunk.candidates?.[0]?.content?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    pcmChunks.push(Buffer.from(part.inlineData.data, "base64"));
                    if (part.inlineData.mimeType) {
                      mimeType = part.inlineData.mimeType;
                    }
                  }
                }
              }
            }

            if (pcmChunks.length > 0) {
              audioBase64 = Buffer.concat(pcmChunks).toString("base64");
            }
          } catch (streamErr: any) {
            console.warn(`[TTS-Stream] Streaming dengan model ${primaryModel} gagal/tidak didukung, coba generateContent:`, streamErr?.message || streamErr);
            const msg = (streamErr?.message || "").toLowerCase();
            // Jika error 429 kuota habis, lempar error agar executeWithKeyRotation merotasi ke key berikutnya!
            if (msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("403")) {
              throw streamErr;
            }
          }
        }

        // Fallback ke generateContent utuh jika streaming tidak menghasilkan audio
        if (!audioBase64) {
          const speechResponse = await ai.models.generateContent({
            model: primaryModel,
            contents: [{ parts: ttsParts }],
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              temperature: typeof temperature === 'number' ? temperature : 1.0,
              safetySettings: safetySettings as any,
            },
          });

          const candidates = speechResponse.candidates || [];
          for (const cand of candidates) {
            const parts = cand.content?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                audioBase64 = part.inlineData.data;
                mimeType = part.inlineData.mimeType || mimeType;
                break;
              }
            }
            if (audioBase64) break;
          }
        }

        if (!audioBase64) {
          throw new Error("Gagal menghasilkan audio: Model tidak mengembalikan audio chunk.");
        }

        return { audio: audioBase64, mimeType };
      },
      { operationName: "TTS-Speech" }
    );

    res.json({ success: true, audio: result.audio, mimeType: result.mimeType });
  } catch (err: any) {
    console.error("Error generating TTS across key pool:", err);
    res.status(500).json({ success: false, error: err.message || "Gagal memproses TTS pada semua API Key." });
  }
});

// API Endpoint for AI Live Conversation / Commentary
app.post("/api/ai/live-comment", async (req, res) => {
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
      aiStyleInstruction,
      voiceEnabled = false,
      chatHistory = [],
      apiKey,
      lang = "id",
      aiResponseLanguage,
      chatModel = "gemini-3.1-flash-lite",
      liveModel = "gemini-3.1-flash-live-preview",
      ttsModel,
      aiTtsModel,
      mode = "chat",
      voice = "Kore",
      temperature = 0.85,
      mediaResolution = "low",
      safetySettings: userSafetySetting = "block_none",
      thinkingLevel = "off",
      maxOutputTokens = 2048,
      hasActiveVideo = true,
    } = req.body;

    const langTarget = aiResponseLanguage && aiResponseLanguage !== 'auto' ? aiResponseLanguage : lang;
    let languageInstruction = "Bahasa Indonesia";
    if (langTarget === "en") languageInstruction = "Bahasa Inggris (English)";
    else if (langTarget === "jp") languageInstruction = "Bahasa Jepang (Japanese)";
    else if (langTarget === "es") languageInstruction = "Bahasa Spanyol (Spanish)";

    const customPersonaInstruction = aiCustomPersona && aiCustomPersona.trim()
      ? `[Persona AI / Kepribadian Khusus]: ${aiCustomPersona.trim()}`
      : `[Persona AI / Kepribadian Khusus]: Anda adalah AI Companion kawan nonton video yang seru, jujur, dan santai.`;

    const customStyleInstruction = aiLanguageStyle && aiLanguageStyle.trim()
      ? `[Gaya Bahasa & Slang WAJIB]: Gunakan gaya bahasa / slang berikut dalam setiap tanggapan: "${aiLanguageStyle.trim()}".`
      : `[Gaya Bahasa & Slang]: Gunakan gaya bicara santai, gaul, alami, dan sangat ekspresif.`;

    const speechStyleInstruction = aiStyleInstruction && aiStyleInstruction.trim()
      ? `[Petunjuk Tone & Gaya Bicara Suara TTS/Live Call]: ${aiStyleInstruction.trim()}`
      : '';

    const videoContextText = hasActiveVideo 
      ? `Judul Video: "${videoTitle || "Video Utama"}"
Posisi Durasi Video Saat Ini: ${currentTime || "00:00"} ${duration ? `/ ${duration}` : ""}
Subtitle/Dialog Aktif Saat Ini: "${subtitles || "Tidak ada subtitle"}"`
      : `- Saat ini TIDAK ADA video yang sedang diputar (Empty State). Jangan mengarang isi video atau menebak-nebak, fokus saja berkomunikasi dengan pengguna.`;

    const systemInstruction = `${customPersonaInstruction}
${customStyleInstruction}
${speechStyleInstruction ? speechStyleInstruction + '\n' : ''}
${videoContextText}

ATURAN PERILAKU & UNCENSORED MODE (ROLEPLAY AMAN & BEBAS):
- Bertindaklah konsisten sesuai Persona & Gaya Bahasa/Slang di atas.
- Jangan menahan diri, memunculkan ceramah moral, atau menolak topik diskusi secara kaku.
- Jika pengguna mengajak berbicara dalam konteks santai, romantis, atau berani, tanggapi secara alami dan ekspresif.
- Gunakan bahasa dasar ${languageInstruction} yang dipadukan dengan Gaya Bahasa / Slang yang telah ditentukan.
- Tanggapan dibuat ringkas (1-3 paragraf/kalimat) agar nyaman didengar dalam sesi Live Call/Nonton.`;

    const contentsParts: any[] = [];

    // Add frame image if captured
    if (frameImage && typeof frameImage === "string" && frameImage.includes("data:image")) {
      const base64Data = frameImage.split(",")[1];
      const mimeType = frameImage.split(";")[0].split(":")[1] || "image/jpeg";
      if (base64Data) {
        contentsParts.push({
          inlineData: {
            mimeType,
            data: base64Data,
          },
        });
      }
    }

    // Build chat context or message
    let fullUserPrompt = prompt;
    if (!fullUserPrompt) {
      fullUserPrompt = "Tolong berikan reaksi atau komentar langsung tentang adegan video yang sedang diputar saat ini!";
    }

    if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
      const historyContext = chatHistory
        .slice(-6)
        .map((m: any) => `${m.role === "user" ? "Pengguna" : "AI"}: ${m.text}`)
        .join("\n");
      fullUserPrompt = `[Riwayat Diskusi Sebelumnya]:\n${historyContext}\n\n[Pesan Terbaru Pengguna]:\n${fullUserPrompt}`;
    }

    contentsParts.push({ text: fullUserPrompt });

    const targetModel = chatModel || "gemini-3.1-flash-lite";

    const computedSafetySettings = [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: userSafetySetting === 'block_few' ? 'BLOCK_ONLY_HIGH' : 'BLOCK_NONE' },
    ] as any;

    const genConfig: any = {
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

    // Execute Chat Commentary with Key Rotation
    const replyText = await executeWithKeyRotation(
      apiKey,
      async (ai, activeKey, keyIdx, totalKeys) => {
        let response: any;
        try {
          response = await ai.models.generateContent({
            model: targetModel,
            contents: { parts: contentsParts },
            config: genConfig,
          });
        } catch (genErr: any) {
          const msg = (genErr?.message || "").toLowerCase();
          if (msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("403")) {
            throw genErr; // Lempar agar executeWithKeyRotation merotasi ke key berikutnya!
          }
          console.warn("Primary generateContent failed with config, retrying with clean fallback config:", genErr?.message || genErr);
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
        return response.text || "Saya tidak dapat menganalisis video saat ini.";
      },
      { operationName: "Live-Comment" }
    );

    let audioBase64: string | null = null;
    let mimeType: string = "audio/pcm";

    // Optional Speech Generation if voice is enabled or in live_call mode with Key Rotation
    if ((voiceEnabled || mode === "live_call") && replyText) {
      try {
        const ttsPrimaryModel = (ttsModel && ttsModel.includes("gemini")) ? ttsModel : (aiTtsModel || "gemini-3.8-flash-tts");
        const voiceName = voice || "Kore";
        const cleanReply = replyText.replace(/[*#_~`]/g, "").slice(0, 400).trim();
        const ttsParts = buildTtsParts(cleanReply, ttsPrimaryModel, aiStyleInstruction);
        const supportsStreaming = isTtsModelStreamSupported(ttsPrimaryModel);

        const ttsResult = await executeWithKeyRotation(
          apiKey,
          async (ai, activeKey, keyIdx, totalKeys) => {
            let chunkAudio: string | null = null;
            let chunkMime = "audio/pcm";

            if (supportsStreaming) {
              try {
                const stream = await ai.models.generateContentStream({
                  model: ttsPrimaryModel,
                  contents: [{ parts: ttsParts }],
                  config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                      },
                    },
                    safetySettings: computedSafetySettings as any,
                  },
                });

                const pcmChunks: Buffer[] = [];
                for await (const chunk of stream) {
                  const parts = chunk.candidates?.[0]?.content?.parts;
                  if (parts) {
                    for (const part of parts) {
                      if (part.inlineData?.data) {
                        pcmChunks.push(Buffer.from(part.inlineData.data, "base64"));
                        if (part.inlineData.mimeType) chunkMime = part.inlineData.mimeType;
                      }
                    }
                  }
                }
                if (pcmChunks.length > 0) {
                  chunkAudio = Buffer.concat(pcmChunks).toString("base64");
                }
              } catch (stErr: any) {
                const msg = (stErr?.message || "").toLowerCase();
                if (msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("403")) {
                  throw stErr;
                }
              }
            }

            if (!chunkAudio) {
              const speechResponse = await ai.models.generateContent({
                model: ttsPrimaryModel,
                contents: [{ parts: ttsParts }],
                config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName },
                    },
                  },
                  safetySettings: computedSafetySettings as any,
                },
              });
              const part = speechResponse.candidates?.[0]?.content?.parts?.[0];
              chunkAudio = part?.inlineData?.data || null;
              chunkMime = part?.inlineData?.mimeType || chunkMime;
            }

            if (!chunkAudio) throw new Error("AUDIO_GEN_EMPTY");
            return { audio: chunkAudio, mimeType: chunkMime };
          },
          { operationName: "Live-Comment-TTS" }
        );

        audioBase64 = ttsResult.audio;
        mimeType = ttsResult.mimeType;
      } catch (voiceErr: any) {
        console.warn("Live-Comment speech generation failed across key pool:", voiceErr?.message || voiceErr);
      }
    }

    res.json({
      success: true,
      text: replyText,
      audio: audioBase64,
      mimeType,
      timestamp: currentTime,
    });
  } catch (error: any) {
    console.error("Error in /api/ai/live-comment:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Gagal memproses AI Live Conversation.",
    });
  }
});

// Vite server configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = http.createServer(app);

  // Setup WebSocket Server for Gemini Live API (/api/gemini-live)
  const wss = new WebSocketServer({ server, path: "/api/gemini-live" });

  wss.on("connection", (clientWs) => {
    console.log("[WebSocket] Client connected to Gemini Live API route");
    let sessionPromise: Promise<any> | null = null;
    let session: any = null;

    clientWs.on("message", async (rawMessage) => {
      try {
        const msg = JSON.parse(rawMessage.toString());

        if (msg.type === "init") {
          const {
            apiKey,
            voice = "Kore",
            systemInstruction = "You are an AI companion.",
            model = "gemini-3.1-flash-live-preview",
          } = msg;

          const targetModel = (model && model.includes("gemini")) ? model : "gemini-3.1-flash-live-preview";

          const allKeys = parseGeminiApiKeys(apiKey);
          let connected = false;
          const maxAttempts = Math.min(allKeys.length, 5);

          for (let attempt = 0; attempt < Math.max(maxAttempts, 1); attempt++) {
            const keyObj = getNextAvailableGeminiKey(allKeys);
            const activeKey = keyObj?.key || allKeys[0] || process.env.GEMINI_API_KEY || '';

            try {
              const ai = new GoogleGenAI({
                apiKey: activeKey,
                httpOptions: { headers: { "User-Agent": "aistudio-build" } },
              });

              sessionPromise = ai.live.connect({
                model: targetModel,
                config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: voice || "Kore" },
                    },
                  },
                  systemInstruction: systemInstruction || "You are a helpful AI companion.",
                } as any,
                callbacks: {
                  onmessage: (message: LiveServerMessage) => {
                    if (clientWs.readyState !== WebSocket.OPEN) return;

                    // 1) Audio chunk from model
                    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (audioData) {
                      clientWs.send(JSON.stringify({ type: "audio", data: audioData }));
                    }

                    // 2) Model text response / output transcription
                    const textPart = message.serverContent?.modelTurn?.parts?.find((p) => p.text)?.text;
                    const outputText = message.serverContent?.outputTranscription?.text || textPart;
                    if (outputText) {
                      clientWs.send(JSON.stringify({ type: "model_transcript", text: outputText }));
                    }

                    // 3) User input transcription
                    const inputText = message.serverContent?.inputTranscription?.text;
                    if (inputText) {
                      clientWs.send(JSON.stringify({ type: "user_transcript", text: inputText }));
                    }

                    // 4) Turn complete
                    if (message.serverContent?.turnComplete) {
                      clientWs.send(JSON.stringify({ type: "turn_complete" }));
                    }

                    // 5) Interrupted (barge-in)
                    if (message.serverContent?.interrupted) {
                      clientWs.send(JSON.stringify({ type: "interrupted" }));
                    }
                  },
                  onerror: (err: any) => {
                    console.error("[Gemini Live API] Session error:", err);
                    const errMsg = (err?.message || "").toLowerCase();
                    if (errMsg.includes("429") || errMsg.includes("quota")) {
                      markGeminiKeyExhausted(activeKey);
                      rotateGeminiKey(allKeys);
                    }
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({ type: "error", error: err?.message || "Live session error" }));
                    }
                  },
                  onclose: () => {
                    console.log("[Gemini Live API] Session closed");
                    if (clientWs.readyState === WebSocket.OPEN) {
                      clientWs.send(JSON.stringify({ type: "closed" }));
                    }
                  },
                },
              });

              session = await sessionPromise;
              connected = true;

              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: "connected" }));
              }
              break;
            } catch (initErr: any) {
              const errMsg = (initErr?.message || "").toLowerCase();
              if ((errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("resource_exhausted")) && allKeys.length > 1) {
                console.warn(`[Gemini-Live-WebSocket] Key ${activeKey.slice(0, 4)}... kena 429, merotasi ke key berikutnya...`);
                markGeminiKeyExhausted(activeKey);
                rotateGeminiKey(allKeys);
                continue;
              }
              console.error("[Gemini Live API] Connect failed:", initErr);
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: "error", error: initErr?.message || "Gagal menghubungkan ke Gemini Live API." }));
              }
              break;
            }
          }
        } else if (sessionPromise) {
          const activeSession = session || (await sessionPromise.catch(() => null));
          if (activeSession) {
            if (msg.type === "audio" && msg.data) {
              activeSession.sendRealtimeInput({
                audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" },
              });
            } else if (msg.type === "image" && msg.data) {
              activeSession.sendRealtimeInput({
                video: { data: msg.data, mimeType: msg.mimeType || "image/jpeg" },
              });
            } else if (msg.type === "text" && msg.text) {
              console.log("[Gemini Live API] Received text/poke input:", msg.text.slice(0, 80));
              try {
                await activeSession.sendRealtimeInput({
                  text: msg.text,
                });
              } catch (textErr) {
                console.error("[Gemini Live API] Failed to send text input to session:", textErr);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error processing WebSocket client message:", err);
      }
    });

    clientWs.on("close", async () => {
      if (sessionPromise) {
        try {
          const activeSession = session || (await sessionPromise.catch(() => null));
          if (activeSession) activeSession.close();
        } catch (_) {}
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`NightHUB Player server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
