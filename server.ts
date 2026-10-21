import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import crossFetch from "cross-fetch";

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

// Helper to get GoogleGenAI client with custom or default API key
let defaultAiClient: GoogleGenAI | null = null;

function getGenAI(customKey?: string): GoogleGenAI {
  if (customKey && customKey.trim()) {
    return new GoogleGenAI({
      apiKey: customKey.trim(),
      httpOptions: {
        fetch: crossFetch,
        headers: {
          "User-Agent": "aistudio-build",
        },
      } as any,
    });
  }

  if (!defaultAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing and no custom key was provided.");
    }
    defaultAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        fetch: crossFetch,
        headers: {
          "User-Agent": "aistudio-build",
        },
      } as any,
    });
  }
  return defaultAiClient;
}

// API Endpoint to verify Gemini API Key
app.post("/api/ai/verify-key", async (req, res) => {
  try {
    const { apiKey } = req.body;
    const ai = getGenAI(apiKey);
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [{ parts: [{ text: "ping" }] }],
      config: {
        safetySettings: safetySettings as any,
      },
    });
    if (response.text) {
      res.json({ success: true, message: "Gemini API Key valid!" });
    } else {
      res.status(400).json({ success: false, error: "Respons kosong dari Gemini API." });
    }
  } catch (error: any) {
    console.error("Error verifying Gemini API key:", error);
    res.status(400).json({ success: false, error: error.message || "API Key tidak valid atau kuota habis." });
  }
});

// API Endpoint for generating standalone TTS audio for specific text
app.post("/api/ai/tts", async (req, res) => {
  try {
    const { text, apiKey, ttsModel = "gemini-3.1-flash-tts-preview", voice = "Kore", aiStyleInstruction } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: "Text is required for TTS." });
    }

    const ai = getGenAI(apiKey);
    let audioBase64: string | null = null;
    let mimeType: string = "audio/pcm";

    const cleanText = text.replace(/[*#_~`]/g, "").slice(0, 500).trim();
    const voiceName = voice || "Kore";
    const primaryModel = (ttsModel && ttsModel.includes("gemini")) ? ttsModel : "gemini-3.1-flash-tts-preview";
    const stylePrefix = aiStyleInstruction && aiStyleInstruction.trim() ? `[Style Instruction (Speech Tone & Emotion)]: ${aiStyleInstruction.trim()}\n` : '';
    const fullSpeechPrompt = `${stylePrefix}Speak this text: "${cleanText}".`;

    try {
      const speechResponse = await ai.models.generateContent({
        model: primaryModel,
        contents: [{ parts: [{ text: fullSpeechPrompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          safetySettings: safetySettings as any,
        },
      });

      const part = speechResponse.candidates?.[0]?.content?.parts?.[0];
      audioBase64 = part?.inlineData?.data || null;
      mimeType = part?.inlineData?.mimeType || "audio/pcm";
    } catch (primaryErr) {
      console.warn("Primary TTS endpoint warning, trying gemini-2.5-flash fallback:", primaryErr);
      try {
        const fallbackResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: fullSpeechPrompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
            safetySettings: safetySettings as any,
          },
        });
        const part = fallbackResponse.candidates?.[0]?.content?.parts?.[0];
        audioBase64 = part?.inlineData?.data || null;
        mimeType = part?.inlineData?.mimeType || "audio/pcm";
      } catch (fbErr) {
        console.error("Fallback TTS generation failed:", fbErr);
      }
    }

    if (audioBase64) {
      res.json({ success: true, audio: audioBase64, mimeType });
    } else {
      res.status(500).json({ success: false, error: "Gagal menghasilkan audio TTS Suara AI." });
    }
  } catch (err: any) {
    console.error("Error generating TTS:", err);
    res.status(500).json({ success: false, error: err.message || "Gagal memproses TTS." });
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
      chatModel = "gemini-3.6-flash",
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

    const ai = getGenAI(apiKey);

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

    const targetModel = chatModel || "gemini-3.6-flash";

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

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: targetModel,
        contents: { parts: contentsParts },
        config: genConfig,
      });
    } catch (genErr: any) {
      console.warn("Primary generateContent failed with config, retrying with clean fallback config:", genErr?.message || genErr);
      // Fallback clean config to guarantee no 400 INVALID_ARGUMENT errors
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

    const replyText = response.text || "Saya tidak dapat menganalisis video saat ini.";

    let audioBase64: string | null = null;
    let mimeType: string = "audio/pcm";

    // Optional Speech Generation if voice is enabled or in live_call mode
    if ((voiceEnabled || mode === "live_call") && replyText) {
      const cleanReply = replyText.replace(/[*#_~`]/g, "").slice(0, 400).trim();
      const voiceName = voice || "Kore";
      const ttsPrimaryModel = (ttsModel && ttsModel.includes("gemini")) ? ttsModel : (aiTtsModel || "gemini-3.1-flash-tts-preview");
      const stylePrefix = aiStyleInstruction && aiStyleInstruction.trim() ? `[Style Instruction (Speech Tone & Emotion)]: ${aiStyleInstruction.trim()}\n` : '';
      const speechPrompt = `${stylePrefix}Speak this text: "${cleanReply}".`;

      try {
        const speechResponse = await ai.models.generateContent({
          model: ttsPrimaryModel,
          contents: [{ parts: [{ text: speechPrompt }] }],
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
        audioBase64 = part?.inlineData?.data || null;
        mimeType = part?.inlineData?.mimeType || "audio/pcm";
      } catch (ttsErr) {
        console.warn("Primary TTS Generation warning, trying gemini-3.1-flash fallback:", ttsErr);
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: "gemini-3.1-flash",
            contents: [{ parts: [{ text: speechPrompt }] }],
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
          const part = fallbackResponse.candidates?.[0]?.content?.parts?.[0];
          audioBase64 = part?.inlineData?.data || null;
          mimeType = part?.inlineData?.mimeType || "audio/pcm";
        } catch (fallbackErr) {
          console.warn("Fallback TTS Generation failed:", fallbackErr);
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

          try {
            const ai = getGenAI(apiKey);
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

            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "connected" }));
            }
          } catch (initErr: any) {
            console.error("[Gemini Live API] Connect failed:", initErr);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: "error", error: initErr?.message || "Gagal menghubungkan ke Gemini Live API." }));
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
