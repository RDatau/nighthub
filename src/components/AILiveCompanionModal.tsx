import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import {
  Sparkles,
  MessageSquare,
  Volume2,
  VolumeX,
  X,
  Send,
  Radio,
  RefreshCw,
  Clapperboard,
  GraduationCap,
  Smile,
  Languages,
  Bot,
  User,
  Mic,
  MicOff,
  Activity,
  Phone,
  PhoneOff,
  Trash2, Image,
  Pin,
  PinOff,
  Play,
  Pause,
  RotateCcw,
  Edit2,
  Check,
  GripHorizontal,
  ChevronDown,
  ChevronUp,
  Zap,
  BrainCircuit,
  Film,
  Download,
  SlidersHorizontal
} from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp?: string;
  audioUrl?: string;
  timeInSeconds?: number;
  isAutoCommentary?: boolean;
}

// Safety settings untuk mengizinkan bahasa eksplisit/vulgar tanpa diblokir model
export const safetySettings = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
];

function parseAgentText(text: string) {
  let reasoning = "";
  let speech = text;
  if (text.includes("<THINKING>")) {
    const parts = text.split("</THINKING>");
    if (parts.length > 1) {
      reasoning = parts[0].replace("<THINKING>", "").trim();
      speech = parts.slice(1).join("").trim();
    } else {
      reasoning = text.replace("<THINKING>", "").trim();
      speech = "";
    }
  }
  return { reasoning, speech };
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate = 24000,
  numChannels = 1
): Promise<AudioBuffer> {
  const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frameCount = Math.floor(data.byteLength / 2);
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    const int16 = dataView.getInt16(i * 2, true);
    channelData[i] = int16 / 32768.0;
  }
  return buffer;
}

function createBlob(data: Float32Array, sampleRate: number): { data: string; mimeType: string } {
  const l = data.length;
  const int16Array = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  let binary = "";
  const bytes = new Uint8Array(int16Array.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return {
    data: base64,
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}

// Convert base64 audio (raw PCM or MP3/WAV) to a playable Blob Object URL with RIFF WAV header if needed
function createAudioUrlFromBase64(base64Data: string, mimeType = 'audio/pcm'): string {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Check if it already has a RIFF WAV or MP3 header
  if (
    mimeType.includes('mp3') ||
    mimeType.includes('mpeg') ||
    (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
  ) {
    const blob = new Blob([bytes], { type: mimeType.includes('mp3') ? 'audio/mp3' : 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  // Gemini returns 24000Hz, 1 channel mono 16-bit PCM raw audio
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  /* RIFF identifier */
  view.setUint32(0, 0x52494646, false); // "RIFF"
  /* RIFF chunk length */
  view.setUint32(4, 36 + bytes.length, true);
  /* RIFF type */
  view.setUint32(8, 0x57415645, false); // "WAVE"
  /* format chunk identifier */
  view.setUint32(12, 0x666d7420, false); // "fmt "
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (1 = PCM) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate */
  view.setUint32(28, byteRate, true);
  /* block align */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitsPerSample, true);
  /* data chunk identifier */
  view.setUint32(36, 0x64617461, false); // "data"
  /* data chunk length */
  view.setUint32(40, bytes.length, true);

  const wavBlob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
  return URL.createObjectURL(wavBlob);
}

interface AILiveCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hasActiveVideo?: boolean;
  videoTitle: string;
  currentTimeFormatted: string;
  durationFormatted: string;
  currentSubtitleText: string;
  onSeekTo: (seconds: number) => void;
  geminiApiKey?: string;
  lang?: 'id' | 'en';
  aiResponseLanguage?: 'id' | 'en' | 'jp' | 'es' | 'auto';
  aiMode?: 'chat' | 'live_call';
  aiChatModel?: string;
  aiLiveModel?: string;
  aiVoice?: string;
  aiTtsModel?: string;
  aiCustomPersona?: string;
  aiLanguageStyle?: string;
  aiStyleInstruction?: string;
  aiPredictiveCaching?: boolean;
  aiPredictiveMs?: number;
  aiPredictiveStepMs?: number;
  onPreferenceSettingsChange?: (settings: any) => void;
  aiTemperature?: number;
  aiMediaResolution?: 'low' | 'medium' | 'high';
  aiSafetySettings?: 'block_none' | 'block_few';
  aiThinkingLevel?: 'off' | 'low' | 'high';
  aiMaxOutputTokens?: number;
}

export function AILiveCompanionModal({
  isOpen,
  onClose,
  isPinned = false,
  onTogglePin,
  videoRef,
  hasActiveVideo = true,
  videoTitle,
  currentTimeFormatted,
  durationFormatted,
  currentSubtitleText,
  onSeekTo,
  geminiApiKey,
  lang = 'id',
  aiResponseLanguage,
  aiMode = 'chat',
  aiChatModel,
  aiLiveModel,
  aiVoice,
  aiTtsModel,
  aiCustomPersona,
  aiLanguageStyle,
  aiStyleInstruction,
  aiPredictiveCaching = true,
  aiPredictiveMs,
  aiPredictiveStepMs,
  onPreferenceSettingsChange,
  aiTemperature,
  aiMediaResolution,
  aiSafetySettings,
  aiThinkingLevel,
  aiMaxOutputTokens,
}: AILiveCompanionModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeMode, setActiveMode] = useState<'chat' | 'live_call'>(aiMode || 'chat');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoCommentary, setAutoCommentary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [isTtsLoading, setIsTtsLoading] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [expandedThinking, setExpandedThinking] = useState<Record<string, boolean>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState<number>(380);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Sidebar's right edge is 8px away from window right edge due to p-2 on parent
      const rightEdge = window.innerWidth - 8;
      const newWidth = rightEdge - e.clientX;
      if (newWidth >= 300 && newWidth <= 700) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Draggable floating modal state
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  useEffect(() => {
    if (isPinned) {
      setDragOffset({ x: 0, y: 0 });
    }
  }, [isPinned]);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0,
  });

  const handleMouseDownDrag = (e: React.MouseEvent) => {
    if (isPinned) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [role="button"]')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: dragOffset.x,
      initialY: dragOffset.y,
    };
  };

  const handleTouchStartDrag = (e: React.TouchEvent) => {
    if (isPinned) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, select, a, [role="button"]')) {
      return;
    }
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        mouseX: e.touches[0].clientX,
        mouseY: e.touches[0].clientY,
        initialX: dragOffset.x,
        initialY: dragOffset.y,
      };
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setDragOffset({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - dragStartRef.current.mouseX;
        const dy = e.touches[0].clientY - dragStartRef.current.mouseY;
        setDragOffset({
          x: dragStartRef.current.initialX + dx,
          y: dragStartRef.current.initialY + dy,
        });
      }
    };

    const handleMouseUp = () => setIsDragging(false);
    const handleTouchEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);

  // Live Call specific state and refs
  const [liveStatus, setLiveStatus] = useState<string>('IDLE');
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);
  const isQuotaErrorRef = useRef(false);
  const [agentReasoningText, setAgentReasoningText] = useState('');
  const [agentSpeechText, setAgentSpeechText] = useState('');
  const [transcription, setTranscription] = useState('');
  const [isFinishingSpeech, setIsFinishingSpeech] = useState(false);
  const [agentActivity, setAgentActivity] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sessionRef = useRef<any | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isMutedRef = useRef(false);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const gainNodeRef = useRef<GainNode | null>(null);
  const currentAgentTurnRef = useRef<string>('');
  const currentUserTurnRef = useRef<string>('');
  const callTranscriptRef = useRef<string>('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoCommentIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  // Sync mode when prop changes
  useEffect(() => {
    setActiveMode(aiMode || 'chat');
    if (aiMode === 'live_call') {
      setVoiceEnabled(true);
    }
  }, [aiMode]);

  // Live Session Connection Effect using Gemini Live API WebSocket Server
  useEffect(() => {
    if (activeMode !== 'live_call' || !isOpen) {
      if (sessionRef.current) {
        try { sessionRef.current.close(); } catch (e) {}
        sessionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      sourcesRef.current.forEach((s) => { try { s.stop(); } catch (e) {} });
      sourcesRef.current.clear();
      if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close().catch(() => {});
        inputAudioContextRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      setLiveStatus('IDLE');
      return;
    }

    let isMounted = true;

    const startSession = async () => {
      setLiveStatus('CONNECTING...');
      setLiveErrorMessage(null);
      setIsQuotaError(false);
      isQuotaErrorRef.current = false;

      try {
        const keyToUse = geminiApiKey || (typeof localStorage !== 'undefined' ? localStorage.getItem('gemini_api_key') : '') || '';
        const ai = new GoogleGenAI({ apiKey: keyToUse });

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        inputAudioContextRef.current = new AudioCtx({ sampleRate: 16000 });
        audioContextRef.current = new AudioCtx({ sampleRate: 24000 });
        const inputSampleRate = inputAudioContextRef.current.sampleRate;

        const currentVoice = aiVoice || 'Kore';
        const personaText = aiCustomPersona && aiCustomPersona.trim()
          ? `[PERSONA AI / KEPRIBADIAN KHUSUS]: ${aiCustomPersona.trim()}`
          : '[PERSONA AI / KEPRIBADIAN KHUSUS]: Anda adalah AI Companion kawan nonton video yang seru, jujur, dan santai.';
        const styleText = aiLanguageStyle && aiLanguageStyle.trim()
          ? `[GAYA BAHASA & SLANG WAJIB]: Gunakan gaya bahasa / slang berikut dalam setiap ucapan audio/respon kamu: "${aiLanguageStyle.trim()}".`
          : '[GAYA BAHASA & SLANG]: Gunakan gaya bicara santai, ramah, dan interaktif.';
        const speechStyleText = aiStyleInstruction && aiStyleInstruction.trim()
          ? `[PETUNJUK TONE & GAYA BICARA SUARA WAJIB]: ${aiStyleInstruction.trim()}`
          : '';
        const fullInstruction = `${personaText}
${styleText}
${speechStyleText ? speechStyleText + '\n' : ''}
Informasi Context Video:
${hasActiveVideo ? `- Judul Video: "${videoTitle || 'Pemutar Utama'}"
- Waktu Pemutaran Saat Ini: ${currentTimeFormatted} / ${durationFormatted}
- Subtitle/Dialog Saat Ini: "${currentSubtitleText}"` : `- Saat ini TIDAK ADA video yang sedang diputar (Empty State). Jangan mengarang isi video atau menebak-nebak, fokus saja berkomunikasi dengan pengguna.`}

Instruksi Perilaku Live Call:
- Bertindaklah konsisten dan terus-menerus sesuai Persona & Gaya Bahasa/Slang di atas dalam setiap ucapan audio yang kamu hasilkan.
- Berikan respon lisan yang alami, ekspresif, dan relevan dengan tayangan video atau pembicaraan pengguna.
- Bicaralah secara singkat, langsung, dan padat (1-2 kalimat) agar respon mengalir cepat tanpa jeda.
- Kamu akan menerima frame/gambar dari video secara real-time. Perhatikan dan komentari visual video jika ada hal yang relevan atau menarik.`;

        const targetLiveModel = (aiLiveModel && aiLiveModel.includes('gemini'))
          ? aiLiveModel
          : 'gemini-3.1-flash-live-preview';

        const session = await ai.live.connect({
          model: targetLiveModel,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: fullInstruction,
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } } },
            safetySettings: safetySettings as any,
          } as any,
          callbacks: {
            onopen: () => {
              if (!isMounted) return;
              setLiveStatus('LISTENING...');

              // Stream mic audio directly to Session
              const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
              const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
              scriptProcessor.onaudioprocess = (e) => {
                if (isMutedRef.current || !isMounted || !sessionRef.current) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData, inputSampleRate);
                sessionRef.current.sendRealtimeInput({ audio: pcmBlob });
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContextRef.current!.destination);

              // Poke greeting
              setTimeout(() => {
                if (sessionRef.current) {
                  sessionRef.current.sendRealtimeInput({
                    text: 'URGENT_POKE_GREETING: Sapa aku duluan sekarang dalam 1 kalimat singkat!'
                  });
                }
              }, 500);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (!isMounted) return;

              if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                currentAgentTurnRef.current += text;
                
                const parsed = parseAgentText(currentAgentTurnRef.current);
                setAgentReasoningText(parsed.reasoning);
                setAgentSpeechText(parsed.speech);
                
                if (currentUserTurnRef.current.trim()) {
                  callTranscriptRef.current += `\nKamu: ${currentUserTurnRef.current.trim()}`;
                  currentUserTurnRef.current = "";
                  setTranscription("");
                }
              }
              if (message.serverContent?.inputTranscription) {
                const cleanedAgentText = parseAgentText(currentAgentTurnRef.current).speech;
                if (cleanedAgentText.trim()) {
                  callTranscriptRef.current += `\nAgen: ${cleanedAgentText.trim()}`;
                  currentAgentTurnRef.current = "";
                }
                const text = message.serverContent.inputTranscription.text;
                currentUserTurnRef.current += (currentUserTurnRef.current ? " " : "") + text;
                setTranscription(currentUserTurnRef.current.trim());
                lastActivityRef.current = Date.now();
              }

              const parts = message.serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  currentAgentTurnRef.current += part.text;
                  const parsed = parseAgentText(currentAgentTurnRef.current);
                  setAgentReasoningText(parsed.reasoning);
                  setAgentSpeechText(parsed.speech);
                }
                if (part.inlineData?.data) {
                  lastActivityRef.current = Date.now();
                  setLiveStatus('SPEAKING...');
                  setIsSpeaking(true);
                  setIsFinishingSpeech(false);

                  const base64Audio = part.inlineData.data;
                  const ctx = audioContextRef.current!;
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                  try {
                    const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                    const source = ctx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(gainNodeRef.current || ctx.destination);
                    source.addEventListener('ended', () => {
                      sourcesRef.current.delete(source);
                      if (sourcesRef.current.size === 0) {
                        setLiveStatus('LISTENING...');
                        setIsSpeaking(false);
                        setIsFinishingSpeech(true);
                        setTimeout(() => setIsFinishingSpeech(false), 1500);
                        setTimeout(() => { if (sourcesRef.current.size === 0) setAgentSpeechText(''); }, 2000);
                      }
                    });
                    source.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(source);
                  } catch (e) {
                    console.error('Realtime audio decode error:', e);
                  }
                }
              }

              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach((s) => { try { s.stop(); } catch (e) {} });
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;

                const toCommit = parseAgentText(currentAgentTurnRef.current).speech;
                if (toCommit) {
                  callTranscriptRef.current += `\nAgen: ${toCommit} [DIPOTONG]`;
                }

                setAgentReasoningText('');
                setAgentSpeechText('');
                currentAgentTurnRef.current = "";
                setAgentActivity(0);
                setIsFinishingSpeech(false);
                setIsSpeaking(false);
              }

              if (message.serverContent?.turnComplete) {
                setLiveStatus('LISTENING...');
                const toCommit = parseAgentText(currentAgentTurnRef.current).speech;
                if (toCommit && !callTranscriptRef.current.endsWith(toCommit)) {
                  callTranscriptRef.current += `\nAgen: ${toCommit}`;
                }
                currentAgentTurnRef.current = "";
                setTranscription('');
                currentUserTurnRef.current = "";
              }
            },
            onerror: (e: any) => {
              console.error('Gemini Live session error:', e);
              if (isMounted) {
                const msg = e.message || '';
                if (msg.includes('429')) {
                  setIsQuotaError(true);
                  isQuotaErrorRef.current = true;
                  setLiveStatus('QUOTA EXHAUSTED');
                  setLiveErrorMessage('Kuota Gratisan Habis (Error 429).');
                } else {
                  setLiveStatus('ERROR');
                  setLiveErrorMessage('Koneksi terganggu.');
                }
              }
            },
            onclose: (e: any) => {
              if (isMounted) {
                setLiveStatus('OFFLINE');
                if (!isQuotaErrorRef.current) {
                  setTimeout(() => {
                    if (isMounted) {
                      setLiveErrorMessage('Mencoba menyambung kembali...');
                      setReconnectTrigger(prev => prev + 1);
                    }
                  }, 2000);
                }
              }
            }
          }
        });
        sessionRef.current = session;
      } catch (err: any) {
        if (isMounted) {
          setLiveStatus('ERROR');
          setLiveErrorMessage('Gagal menyambung ke Live Agent.');
        }
      }
    };

    startSession();

    return () => {
      isMounted = false;
      if (sessionRef.current) {
        try { sessionRef.current.close(); } catch (e) {}
        sessionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      sourcesRef.current.forEach((s) => { try { s.stop(); } catch (e) {} });
      sourcesRef.current.clear();
      if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close().catch(() => {});
        inputAudioContextRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, [activeMode, isOpen, aiLiveModel, aiVoice, geminiApiKey, aiCustomPersona, aiLanguageStyle, aiStyleInstruction, reconnectTrigger]); // Removed videoTitle, currentTimeFormatted, durationFormatted, currentSubtitleText from deps to prevent constant reconnection

  // Live Call timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (activeMode === 'live_call' && isOpen) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeMode, isOpen]);

  const formatCallTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Clear Chat History
  const handleClearChat = useCallback(() => {
    setMessages([]);
    callTranscriptRef.current = '';
    setAgentSpeechText('');
    setAgentReasoningText('');
    setTranscription('');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setPlayingMsgId(null);
  }, []);

  // Speech-to-Text Voice Microphone Toggle
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg(
        lang === 'en'
          ? 'Voice Speech Recognition is not supported in this browser. Try Google Chrome.'
          : 'Mikrofon Speech Recognition tidak didukung di browser ini. Gunakan Google Chrome.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = lang === 'en' ? 'en-US' : 'id-ID';

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        // Auto send if in live call mode with non-empty input
        if (activeMode === 'live_call' && inputText.trim()) {
          sendMessage(inputText);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  };

  // Auto scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Helper to resolve API endpoint for web vs electron (file:// or nighthub:// protocol)
  const getApiEndpoint = (endpoint: string) => {
    if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'nighthub:')) {
      return `http://localhost:3000${endpoint}`;
    }
    return endpoint;
  };

  // Capture frame from video canvas
  const captureVideoFrame = useCallback((): string | null => {
    if (!videoRef.current) return null;
    try {
      const video = videoRef.current;
      if (video.readyState < 2) return null;

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth || 480, 480);
      canvas.height = Math.min(video.videoHeight || 270, 270);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.5);
      }
    } catch (e) {
      console.warn('Canvas frame capture prevented by CORS or state:', e);
    }
    return null;
  }, [videoRef]);

  // Capture future frame (async) for VOD, or current frame with player delay for Live
  const captureFutureVideoFrame = useCallback(async (offsetSeconds: number = 10): Promise<string | null> => {
    if (!videoRef.current) return null;
    const mainVideo = videoRef.current;
    if (mainVideo.readyState < 2) return null;

    const isLive = !isFinite(mainVideo.duration) || mainVideo.duration === 0 || mainVideo.srcObject;

    if (isLive) {
      const frame = captureVideoFrame();
      // Delay player by pausing to sync with AI thinking time
      if (!mainVideo.paused) {
        mainVideo.pause();
        setTimeout(() => {
          if (videoRef.current) videoRef.current.play().catch(console.error);
        }, offsetSeconds * 1000);
      }
      return frame;
    }

    return new Promise((resolve) => {
      const futureVideo = document.createElement('video');
      futureVideo.crossOrigin = mainVideo.crossOrigin || 'anonymous';
      futureVideo.muted = true;
      futureVideo.src = mainVideo.currentSrc || mainVideo.src;
      futureVideo.load();

      let targetTime = mainVideo.currentTime + offsetSeconds;
      if (targetTime > mainVideo.duration) {
        targetTime = mainVideo.duration - 0.5;
      }
      
      if (targetTime <= mainVideo.currentTime) {
         resolve(captureVideoFrame());
         return;
      }

      let resolved = false;
      const cleanup = () => {
        futureVideo.onloadedmetadata = null;
        futureVideo.onseeked = null;
        futureVideo.onerror = null;
        futureVideo.remove();
      };

      const finish = (data: string | null) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(data);
        }
      };

      futureVideo.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(futureVideo.videoWidth || 480, 480);
          canvas.height = Math.min(futureVideo.videoHeight || 270, 270);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(futureVideo, 0, 0, canvas.width, canvas.height);
            finish(canvas.toDataURL('image/jpeg', 0.5));
          } else {
            finish(captureVideoFrame());
          }
        } catch (e) {
          console.warn('Future frame capture failed:', e);
          finish(captureVideoFrame());
        }
      };

      futureVideo.onerror = () => {
        console.warn('Future video error, fallback to current frame');
        finish(captureVideoFrame());
      };

      futureVideo.onloadedmetadata = () => {
        futureVideo.currentTime = targetTime;
      };

      // In case metadata is already loaded
      if (futureVideo.readyState >= 1) {
        futureVideo.currentTime = targetTime;
      }

      setTimeout(() => {
        finish(captureVideoFrame());
      }, 1000); // reduced timeout to 1 second to prevent blocking too long
    });
  }, [videoRef, captureVideoFrame]);

  // Predictive caching duration offset in ms (Context) & step interval (Frame Sampling)
  const [predictiveMs, setPredictiveMs] = useState<number>(aiPredictiveMs ?? 10000);
  const [predictiveStepMs, setPredictiveStepMs] = useState<number>(aiPredictiveStepMs ?? 2000);
  const [showContextSettings, setShowContextSettings] = useState<boolean>(false);
  
  interface DebugFrame {
    id: string;
    dataUrl: string;
    timestamp: string;
    label: string;
  }
  const [debugFrames, setDebugFrames] = useState<DebugFrame[]>([]);
  const [showDebugFrames, setShowDebugFrames] = useState<boolean>(false);

  const addDebugFrame = useCallback((dataUrl: string, label: string) => {
    if (!videoRef.current) return;
    const currentSecs = videoRef.current.currentTime;
    const m = Math.floor(currentSecs / 60);
    const s = Math.floor(currentSecs % 60);
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    setDebugFrames(prev => {
      const newFrame = {
        id: Date.now().toString() + Math.random().toString(),
        dataUrl,
        timestamp: timeStr,
        label
      };
      return [...prev, newFrame].slice(-6); // Keep last 6 frames
    });
  }, [videoRef]);

  useEffect(() => {
    if (aiPredictiveMs !== undefined) setPredictiveMs(aiPredictiveMs);
  }, [aiPredictiveMs]);

  useEffect(() => {
    if (aiPredictiveStepMs !== undefined) setPredictiveStepMs(aiPredictiveStepMs);
  }, [aiPredictiveStepMs]);

  // Helper to send a single snapshot video frame
  const sendFrameSnapshot = useCallback(async (offsetMs: number = 0) => {
    if (!sessionRef.current) return;
    
    // Bersihkan frame debug yang lama agar hanya menampilkan batch frame yang baru saja diminta (yang relevan saat ini)
    setDebugFrames([]);

    if (offsetMs > 0 && aiPredictiveCaching) {
      const isLive = videoRef.current && (!isFinite(videoRef.current.duration) || videoRef.current.duration === 0 || videoRef.current.srcObject);
      
      if (isLive) {
        // Untuk Live Broadcast (Metode Dejavu):
        // Player ditunda sebanyak offsetMs, dan AI menerima frame real-time terkini
        const frameDataUrl = await captureFutureVideoFrame(offsetMs / 1000);
        if (frameDataUrl && sessionRef.current) {
           addDebugFrame(frameDataUrl, `Live +${offsetMs / 1000}s`);
           const base64Data = frameDataUrl.split(',')[1];
           if (base64Data) sessionRef.current.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
        }
      } else {
        // For VOD, capture frames sequentially up to the requested offset
        const offsets = [];
        for (let i = predictiveStepMs; i <= offsetMs; i += predictiveStepMs) {
          offsets.push(i / 1000); // converting to seconds for the actual capture function
        }
        for (const offset of offsets) {
          const frameDataUrl = await captureFutureVideoFrame(offset);
          if (frameDataUrl && sessionRef.current) {
            addDebugFrame(frameDataUrl, `VOD +${offset}s`);
            const base64Data = frameDataUrl.split(',')[1];
            if (base64Data) {
              try {
                sessionRef.current.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
              } catch (e) {
                console.warn(`Failed to send frame at offset ${offset}:`, e);
              }
            }
          }
        }
      }
    } else {
      // Standard single frame capture
      const frameDataUrl = captureVideoFrame();
      if (frameDataUrl) {
        addDebugFrame(frameDataUrl, `Current Frame`);
        const base64Data = frameDataUrl.split(',')[1];
        if (base64Data) {
          try {
            sessionRef.current.sendRealtimeInput({
              video: { data: base64Data, mimeType: 'image/jpeg' }
            });
          } catch (e) {
            console.warn('Failed to send video frame snapshot:', e);
          }
        }
      }
    }
  }, [captureVideoFrame, captureFutureVideoFrame, aiPredictiveCaching, predictiveStepMs, addDebugFrame]);

  // Continuous Video Streaming (Live Context)
  useEffect(() => {
    let frameInterval: NodeJS.Timeout;
    
    // ABAIKAN SEMUA FRAME SAAT AGEN SEDANG BERBICARA
    if (activeMode === 'live_call' && isOpen && !isSpeaking) {
      // Kirim frame tepat setelah agen berhenti berbicara
      if (sessionRef.current && videoRef.current && !videoRef.current.paused) {
        sendFrameSnapshot(aiPredictiveCaching ? predictiveMs : 0);
      }

      // Interval disesuaikan berdasarkan nilai Context (predictiveMs)
      const intervalMs = aiPredictiveCaching ? Math.max(100, predictiveMs) : 2500;

      frameInterval = setInterval(() => {
        if (
          sessionRef.current &&
          videoRef.current && 
          !videoRef.current.paused
        ) {
          sendFrameSnapshot(aiPredictiveCaching ? predictiveMs : 0);
        }
      }, intervalMs);
    }
    
    return () => {
      if (frameInterval) clearInterval(frameInterval);
    };
  }, [activeMode, isOpen, sendFrameSnapshot, aiPredictiveCaching, isSpeaking, predictiveMs]);

  // Notifikasi saat Video Berubah (Video Title Changed)
  const previousVideoTitleRef = useRef<string>(videoTitle);
  useEffect(() => {
    if (activeMode === 'live_call' && sessionRef.current && isOpen) {
      if (previousVideoTitleRef.current !== videoTitle) {
        lastActivityRef.current = Date.now();
        if (hasActiveVideo) {
          sessionRef.current.sendRealtimeInput({
            text: `SYSTEM NOTIFICATION: Pengguna baru saja mengganti video yang diputar. Judul video baru yang sedang dimainkan saat ini adalah "${videoTitle || 'Video Utama'}". Harap sesuaikan konteks pembahasan ke video yang baru ini.`
          });
        }
        previousVideoTitleRef.current = videoTitle;
      }
    }
  }, [videoTitle, activeMode, isOpen, hasActiveVideo]);

  // Handle Video State Changes (Seek, Pause, Play, Empty): Inform AI that context changed
  useEffect(() => {
    const videoElement = videoRef?.current;
    if (!videoElement) return;

    const handleSeeked = async () => {
      if (activeMode === 'live_call' && sessionRef.current && isOpen) {
        lastActivityRef.current = Date.now();
        await sendFrameSnapshot(aiPredictiveCaching ? predictiveMs : 0);
        
        // Format the new time to tell the AI where we are now
        const currentSecs = videoElement.currentTime;
        const m = Math.floor(currentSecs / 60);
        const s = Math.floor(currentSecs % 60);
        const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        
        sessionRef.current.sendRealtimeInput({
          text: `SYSTEM NOTIFICATION: Pengguna baru saja melompat (seek) ke posisi waktu ${timeStr}. Harap lupakan konteks adegan sebelumnya dan langsung fokus mengomentari apa yang terjadi di adegan pada menit ${timeStr} ini!`
        });
      }
    };

    const handlePause = async () => {
      if (activeMode === 'live_call' && sessionRef.current && isOpen) {
        lastActivityRef.current = Date.now();
        const currentSecs = videoElement.currentTime;
        const m = Math.floor(currentSecs / 60);
        const s = Math.floor(currentSecs % 60);
        const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        sessionRef.current.sendRealtimeInput({
          text: `SYSTEM NOTIFICATION: Pengguna baru saja menjeda (PAUSE) pemutaran video di waktu ${timeStr}. Video saat ini sedang berhenti sementara. Jangan bahas seolah-olah videonya sedang jalan.`
        });
      }
    };

    const handlePlay = async () => {
      if (activeMode === 'live_call' && sessionRef.current && isOpen) {
        lastActivityRef.current = Date.now();
        const currentSecs = videoElement.currentTime;
        const m = Math.floor(currentSecs / 60);
        const s = Math.floor(currentSecs % 60);
        const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        sessionRef.current.sendRealtimeInput({
          text: `SYSTEM NOTIFICATION: Pengguna baru saja melanjutkan (PLAY) pemutaran video kembali dari waktu ${timeStr}.`
        });
      }
    };

    const handleEmptied = async () => {
      if (activeMode === 'live_call' && sessionRef.current && isOpen) {
        lastActivityRef.current = Date.now();
        sessionRef.current.sendRealtimeInput({
          text: 'SYSTEM NOTIFICATION: Saat ini TIDAK ADA video yang dimuat atau sedang diputar (Empty State). Tolong BERHENTI berhalusinasi atau mengomentari adegan, karena videonya sudah ditutup/dihentikan. Informasikan pengguna bahwa videonya kosong jika ditanya tentang video.'
        });
      }
    };

    const handleLoadedData = async () => {
      if (activeMode === 'live_call' && sessionRef.current && isOpen) {
        lastActivityRef.current = Date.now();
        sessionRef.current.sendRealtimeInput({
          text: 'SYSTEM NOTIFICATION: Pengguna baru saja memuat video baru. Bersiaplah untuk menganalisa adegan dari video baru ini.'
        });
      }
    };

    videoElement.addEventListener('seeked', handleSeeked);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('emptied', handleEmptied);
    videoElement.addEventListener('loadeddata', handleLoadedData);

    return () => {
      videoElement.removeEventListener('seeked', handleSeeked);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('emptied', handleEmptied);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [activeMode, isOpen, sendFrameSnapshot, aiPredictiveCaching, videoRef, predictiveMs]);

  // Auto-comment timer: Kirim snapshot video & pancing komentar otomatis HANYA jika diam tanpa interaksi dan video jalan
  useEffect(() => {
    let checkInterval: NodeJS.Timeout;
    if (activeMode === 'live_call' && isOpen) {
      checkInterval = setInterval(async () => {
        const now = Date.now();
        if (
          now - lastActivityRef.current > 5000 &&
          liveStatus === 'LISTENING...' &&
          !isSpeaking &&
          sessionRef.current &&
          videoRef.current && 
          !videoRef.current.paused
        ) {
          lastActivityRef.current = now;
          setLiveStatus('THINKING...');
          await sendFrameSnapshot(aiPredictiveCaching ? predictiveMs : 0); // Request future frame ahead
          if (sessionRef.current) {
            sessionRef.current.sendRealtimeInput({
              text: 'Coba berikan komentar atau tanggapan santai 1 kalimat mengenai adegan video saat ini.'
            });
          }
        }
      }, 5000);
    }
    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [activeMode, isOpen, liveStatus, isSpeaking, sendFrameSnapshot]);

  // Format audio seconds to "m:ss"
  const formatAudioTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Helper to attach listeners to HTMLAudioElement for playback controls
  const setupAudioListeners = useCallback((audio: HTMLAudioElement, msgId: string) => {
    audio.onplay = () => {
      setIsPlaying(true);
      setPlayingMsgId(msgId);
      setIsSpeaking(true);
    };
    audio.onpause = () => {
      setIsPlaying(false);
      setIsSpeaking(false);
    };
    audio.ontimeupdate = () => {
      setAudioCurrentTime(audio.currentTime);
      setAudioDuration(audio.duration || 0);
    };
    audio.onended = () => {
      setIsPlaying(false);
      setPlayingMsgId(null);
      setIsSpeaking(false);
      setAudioCurrentTime(0);
    };
    audio.onerror = (err) => {
      console.warn('Audio element playback error:', err);
      setIsPlaying(false);
      setPlayingMsgId(null);
      setIsSpeaking(false);
    };
  }, []);

  // Play / Pause audio playback without re-generating if audioUrl already exists
  const togglePlayAudio = async (msg: ChatMessage) => {
    if (!msg.audioUrl) {
      await handleGenerateTts(msg);
      return;
    }

    if (playingMsgId === msg.id && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(console.warn);
      }
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(msg.audioUrl);
    audioRef.current = audio;
    setupAudioListeners(audio, msg.id);
    setPlayingMsgId(msg.id);
    try {
      await audio.play();
    } catch (err) {
      console.warn('Audio play error:', err);
    }
  };

  const handleSeekAudio = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setAudioCurrentTime(seconds);
    }
  };

  const handleDownloadAudio = (msg: ChatMessage) => {
    if (!msg.audioUrl) return;
    const a = document.createElement('a');
    a.href = msg.audioUrl;
    a.download = `TTS_${msg.id}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Generate or Regenerate TTS for a message
  const handleGenerateTts = async (msg: ChatMessage, forceRegenerate = false) => {
    if (msg.audioUrl && !forceRegenerate) {
      togglePlayAudio(msg);
      return;
    }

    setIsTtsLoading(msg.id);
    setErrorMsg(null);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const res = await fetch(getApiEndpoint('/api/ai/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: msg.text,
          apiKey: geminiApiKey,
          ttsModel: aiTtsModel || aiLiveModel || 'gemini-3.1-flash-tts-preview',
          voice: aiVoice || 'Kore',
          aiStyleInstruction,
        }),
      });
      const data = await res.json();
      if (data.success && data.audio) {
        const audioUrl = createAudioUrlFromBase64(data.audio, data.mimeType);

        // Update message audioUrl in state
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, audioUrl } : m))
        );

        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setupAudioListeners(audio, msg.id);
        setPlayingMsgId(msg.id);
        await audio.play();
      } else {
        throw new Error(data.error || 'Gagal memproses audio TTS Gemini.');
      }
    } catch (err: any) {
      console.warn('Gemini TTS failed:', err);
      setErrorMsg(err.message || 'Gagal menghasilkan suara Gemini TTS.');
    } finally {
      setIsTtsLoading(null);
    }
  };

  // Edit Message Handlers
  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.text);
  };

  const handleCancelEdit = () => {
    setEditingMsgId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (msg: ChatMessage) => {
    if (!editingText.trim()) return;

    if (msg.role === 'assistant') {
      // Local edit for AI response
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, text: editingText.trim(), audioUrl: undefined }
            : m
        )
      );
      setEditingMsgId(null);
      setEditingText('');
    } else {
      // User message edited: create new branch & regenerate response
      const newPrompt = editingText.trim();
      setEditingMsgId(null);
      setEditingText('');

      const msgIndex = messages.findIndex((m) => m.id === msg.id);
      if (msgIndex !== -1) {
        const historyBefore = messages.slice(0, msgIndex);
        const updatedUserMsg: ChatMessage = {
          ...msg,
          text: newPrompt,
        };
        setMessages([...historyBefore, updatedUserMsg]);
        await sendEditedUserMessage(newPrompt, historyBefore);
      }
    }
  };

  // Send edited user message and get new AI response branch
  const sendEditedUserMessage = async (newPrompt: string, historyBefore: ChatMessage[]) => {
    setIsLoading(true);
    setErrorMsg(null);
    const currentSecs = videoRef.current ? videoRef.current.currentTime : 0;
    const frameImg = captureVideoFrame();
    const newMsgId = Date.now().toString();

    try {
      const isVoiceNeeded = voiceEnabled;
      const response = await fetch(getApiEndpoint('/api/ai/live-comment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: newPrompt,
          hasActiveVideo,
          videoTitle: videoTitle || 'Video Utama',
          currentTime: currentTimeFormatted,
          duration: durationFormatted,
          subtitles: currentSubtitleText,
          frameImage: frameImg,
          aiCustomPersona,
          aiLanguageStyle,
          voiceEnabled: isVoiceNeeded,
          chatHistory: historyBefore.slice(-6),
          apiKey: geminiApiKey,
          lang,
          aiResponseLanguage,
          chatModel: aiChatModel,
          liveModel: aiLiveModel,
          ttsModel: aiTtsModel || 'gemini-3.1-flash-tts-preview',
          mode: activeMode,
          voice: aiVoice || 'Kore',
          temperature: aiTemperature ?? 0.85,
          mediaResolution: aiMediaResolution || 'low',
          safetySettings: aiSafetySettings || 'block_none',
          thinkingLevel: aiThinkingLevel || 'off',
          maxOutputTokens: aiMaxOutputTokens || 2048,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal menerima tanggapan AI');
      }

      let audioUrl: string | undefined;
      if (data.audio && isVoiceNeeded) {
        audioUrl = createAudioUrlFromBase64(data.audio, data.mimeType);
      }

      const assistantMsg: ChatMessage = {
        id: newMsgId + '-ai',
        role: 'assistant',
        text: data.text,
        timestamp: currentTimeFormatted,
        timeInSeconds: currentSecs,
        audioUrl,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      if (audioUrl) {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setupAudioListeners(audio, assistantMsg.id);
        setPlayingMsgId(assistantMsg.id);
        audio.play().catch(console.warn);
      }
    } catch (err: any) {
      console.error('Error sending edited user message:', err);
      setErrorMsg(err.message || 'Gagal meregenerasi respon AI.');
    } finally {
      setIsLoading(false);
    }
  };

  // Regenerate AI Response for the same prompt
  const handleRegenerateResponse = async (aiMsg: ChatMessage) => {
    const aiIndex = messages.findIndex((m) => m.id === aiMsg.id);
    if (aiIndex === -1) return;

    let userPromptText = '';
    let userMsgTimeSecs = videoRef.current ? videoRef.current.currentTime : 0;
    let userMsgTimeFormatted = currentTimeFormatted;

    for (let i = aiIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userPromptText = messages[i].text;
        userMsgTimeSecs = messages[i].timeInSeconds ?? userMsgTimeSecs;
        userMsgTimeFormatted = messages[i].timestamp || userMsgTimeFormatted;
        break;
      }
    }

    if (!userPromptText) {
      userPromptText = lang === 'en' ? 'Provide live commentary on current scene' : 'Berikan komentar adegan saat ini';
    }

    const historyBefore = messages.slice(0, aiIndex);
    setIsLoading(true);
    setErrorMsg(null);

    const frameImg = captureVideoFrame();
    const newMsgId = Date.now().toString();

    try {
      const isVoiceNeeded = voiceEnabled;
      const response = await fetch(getApiEndpoint('/api/ai/live-comment'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPromptText,
          hasActiveVideo,
          videoTitle: videoTitle || 'Video Utama',
          currentTime: userMsgTimeFormatted,
          duration: durationFormatted,
          subtitles: currentSubtitleText,
          frameImage: frameImg,
          aiCustomPersona,
          aiLanguageStyle,
          voiceEnabled: isVoiceNeeded,
          chatHistory: historyBefore.slice(-6),
          apiKey: geminiApiKey,
          lang,
          aiResponseLanguage,
          chatModel: aiChatModel,
          liveModel: aiLiveModel,
          ttsModel: aiTtsModel || 'gemini-3.1-flash-tts-preview',
          mode: activeMode,
          voice: aiVoice || 'Kore',
          temperature: (aiTemperature ?? 0.85) + 0.05,
          mediaResolution: aiMediaResolution || 'low',
          safetySettings: aiSafetySettings || 'block_none',
          thinkingLevel: aiThinkingLevel || 'off',
          maxOutputTokens: aiMaxOutputTokens || 2048,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal regenerasi tanggapan AI');
      }

      let audioUrl: string | undefined;
      if (data.audio && isVoiceNeeded) {
        audioUrl = createAudioUrlFromBase64(data.audio, data.mimeType);
      }

      const updatedAssistantMsg: ChatMessage = {
        id: newMsgId + '-ai-regen',
        role: 'assistant',
        text: data.text,
        timestamp: userMsgTimeFormatted,
        timeInSeconds: userMsgTimeSecs,
        audioUrl,
      };

      setMessages((prev) => prev.map((m, idx) => (idx === aiIndex ? updatedAssistantMsg : m)));

      if (audioUrl) {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setupAudioListeners(audio, updatedAssistantMsg.id);
        setPlayingMsgId(updatedAssistantMsg.id);
        audio.play().catch(console.warn);
      }
    } catch (err: any) {
      console.error('Error regenerating AI response:', err);
      setErrorMsg(err.message || 'Gagal regenerasi respon AI.');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to send message to AI
  const sendMessage = useCallback(
    async (userPrompt?: string, isAuto = false) => {
      const textToSend = userPrompt !== undefined ? userPrompt : inputText;
      if (!textToSend.trim() && !isAuto) return;

      const currentSecs = videoRef.current ? videoRef.current.currentTime : 0;
      const frameImg = captureVideoFrame();

      const newMsgId = Date.now().toString();

      if (!isAuto && textToSend) {
        const userMsg: ChatMessage = {
          id: newMsgId + '-user',
          role: 'user',
          text: textToSend,
          timestamp: currentTimeFormatted,
          timeInSeconds: currentSecs,
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      if (userPrompt === undefined || userPrompt === inputText) {
        setInputText('');
      }

      if (activeMode === 'live_call') {
        if (sessionRef.current && textToSend) {
          lastActivityRef.current = Date.now();
          sendFrameSnapshot();
          setLiveStatus('THINKING...');
          sessionRef.current.sendRealtimeInput({ text: textToSend });
        }
        return;
      }

      setIsLoading(true);
      setErrorMsg(null);

      try {
        const isVoiceNeeded = voiceEnabled;

        const response = await fetch(getApiEndpoint('/api/ai/live-comment'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: textToSend || (lang === 'en' ? 'Provide live commentary on current scene' : 'Berikan komentar adegan saat ini'),
            hasActiveVideo,
            videoTitle: videoTitle || 'Video Utama',
            currentTime: currentTimeFormatted,
            duration: durationFormatted,
            subtitles: currentSubtitleText,
            frameImage: frameImg,
            aiCustomPersona,
            aiLanguageStyle,
            aiStyleInstruction,
            voiceEnabled: isVoiceNeeded,
            chatHistory: messages.slice(-6),
            apiKey: geminiApiKey,
            lang,
            aiResponseLanguage,
            chatModel: aiChatModel,
            liveModel: aiLiveModel,
            ttsModel: aiTtsModel || 'gemini-3.1-flash-tts-preview',
            mode: activeMode,
            voice: aiVoice || 'Kore',
            temperature: aiTemperature ?? 0.85,
            mediaResolution: aiMediaResolution || 'low',
            safetySettings: aiSafetySettings || 'block_none',
            thinkingLevel: aiThinkingLevel || 'off',
            maxOutputTokens: aiMaxOutputTokens || 2048,
          }),
        });

        let data: any = {};
        try {
          data = await response.json();
        } catch (e) {
          throw new Error(`Server Error (${response.status}): Tidak dapat membaca format respons server.`);
        }

        if (!response.ok || !data.success) {
          throw new Error(data.error || `Error ${response.status}: Gagal menerima tanggapan AI`);
        }

        let audioUrl: string | undefined;
        if (data.audio && isVoiceNeeded) {
          audioUrl = createAudioUrlFromBase64(data.audio, data.mimeType);
        }

        const assistantMsg: ChatMessage = {
          id: newMsgId + '-ai',
          role: 'assistant',
          text: data.text,
          timestamp: currentTimeFormatted,
          timeInSeconds: currentSecs,
          isAutoCommentary: isAuto,
          audioUrl,
        };

        setMessages((prev) => [...prev, assistantMsg]);

        // Play TTS Audio if generated
        if (audioUrl) {
          try {
            if (audioRef.current) {
              audioRef.current.pause();
            }
            const audio = new Audio(audioUrl);
            audioRef.current = audio;
            setupAudioListeners(audio, assistantMsg.id);
            setPlayingMsgId(assistantMsg.id);
            audio.play().catch((err) => {
              console.warn('Audio autoplay blocked:', err);
              setIsSpeaking(false);
            });
          } catch (audioErr) {
            console.warn('Error playing audio TTS:', audioErr);
            setIsSpeaking(false);
          }
        }
      } catch (err: any) {
        console.error('AI Live error:', err);
        const isFetchError = err.name === 'TypeError' || (err.message && err.message.toLowerCase().includes('failed to fetch'));
        if (isFetchError) {
          setErrorMsg(
            lang === 'en'
              ? '⚠️ Connection failed. Please check your Gemini API key in Settings or ensure backend server is active.'
              : '⚠️ Gagal terhubung ke server AI. Pastikan Gemini API Key sudah terisi di Pengaturan atau periksa koneksi server.'
          );
        } else {
          setErrorMsg(err.message || 'Gagal berkomunikasi dengan AI');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      inputText,
      videoRef,
      captureVideoFrame,
      currentTimeFormatted,
      durationFormatted,
      videoTitle,
      currentSubtitleText,
      aiCustomPersona,
      aiLanguageStyle,
      voiceEnabled,
      messages,
      activeMode,
      geminiApiKey,
      lang,
      aiResponseLanguage,
      aiChatModel,
      aiLiveModel,
      aiVoice,
      aiTtsModel,
      setupAudioListeners,
    ]
  );

  // Auto-commentary interval effect
  useEffect(() => {
    if (autoCommentary && isOpen) {
      autoCommentIntervalRef.current = setInterval(() => {
        if (videoRef.current && !videoRef.current.paused) {
          sendMessage('Komentari adegan yang sedang berjalan ini secara singkat!', true);
        }
      }, 25000); // Every 25 seconds
    } else {
      if (autoCommentIntervalRef.current) {
        clearInterval(autoCommentIntervalRef.current);
        autoCommentIntervalRef.current = null;
      }
    }

    return () => {
      if (autoCommentIntervalRef.current) {
        clearInterval(autoCommentIntervalRef.current);
      }
    };
  }, [autoCommentary, isOpen, videoRef, sendMessage]);

  if (!isOpen) return null;

  const quickPrompts = lang === 'en' ? [
    { label: 'Scene Analysis', icon: Clapperboard, prompt: 'Analyze cinematographic techniques, mood, and visual storytelling in this active scene.' },
    { label: 'Fun Trivia', icon: Sparkles, prompt: 'Are there any interesting behind-the-scenes facts or trivia related to this active scene?' },
    { label: 'Dialogue Summary', icon: MessageSquare, prompt: 'Summarize the active dialogue and subtitles currently taking place.' },
    { label: 'Character Motives', icon: Bot, prompt: 'Explain the potential character motivations and context behind actions in this scene.' },
  ] : [
    { label: 'Analisis Adegan', icon: Clapperboard, prompt: 'Apa analisis teknik sinematografi dan suasana pada adegan ini?' },
    { label: 'Fakta Menarik', icon: Sparkles, prompt: 'Apakah ada fakta menarik atau fakta unik terkait adegan ini?' },
    { label: 'Rangkum Subtitle', icon: MessageSquare, prompt: 'Rangkum percakapan/dialog yang sedang terjadi saat ini!' },
    { label: 'Kenapa begini?', icon: Bot, prompt: 'Jelaskan kemungkinan alasan karakter melakukan hal ini di adegan saat ini.' },
  ];

  const toggleThinking = (msgId: string) => {
    setExpandedThinking(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div
      style={{
        width: `${sidebarWidth}px`,
      }}
      className={`${isResizing ? 'transition-none' : 'transition-all duration-200'} flex flex-col text-zinc-900 dark:text-white shrink-0 select-none relative z-40 h-full bg-white/70 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200/50 dark:border-white/10 shadow-2xl backdrop-blur-2xl overflow-hidden`}
    >
      {/* Resizable handle on left edge */}
        <div
          onMouseDown={handleMouseDownResize}
          className="absolute left-0 top-0 bottom-0 w-3 -ml-1.5 hover:w-4 cursor-ew-resize group flex items-center justify-center z-50 transition-all hover:bg-amber-500/20 rounded-l-2xl"
          title={lang === 'en' ? 'Drag to resize sidebar width' : 'Geser untuk mengubah ukuran lebar sidebar'}
        >
          <div className="w-1 h-16 rounded-full bg-amber-500/50 group-hover:bg-amber-400 group-hover:scale-y-125 transition-all shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
        </div>

      {/* Main Container Layout */}
      <div className="flex flex-col h-full w-full overflow-hidden relative">
        {/* ================= TOP HEADER BAR ================= */}
        <div className="grid grid-cols-3 items-center px-3 py-2 border-b border-zinc-200/50 dark:border-white/10 bg-zinc-50 dark:bg-zinc-950 backdrop-blur-xl shrink-0">
          {/* Header Left (Icon/Badge) */}
          <div className="flex items-center justify-start gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <span className="font-bold text-xs tracking-wide text-amber-600 dark:text-amber-300 uppercase truncate">
              AI
            </span>
          </div>

          {/* Centered Mode Selector Tabs */}
          <div className="flex items-center justify-center">
              <div className="flex items-center p-0.5 rounded-lg bg-zinc-200/50 dark:bg-zinc-900 border border-zinc-300/50 dark:border-zinc-800">
                <button
                  onClick={() => setActiveMode('chat')}
                  className={`px-3 py-1 rounded text-[10px] font-semibold flex items-center gap-1.5 transition-all ${
                    activeMode === 'chat'
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                  title={lang === 'en' ? 'Text Chat Mode' : 'Mode Chat Teks'}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Chat</span>
                </button>
                <button
                  onClick={() => {
                    setActiveMode('live_call');
                    setVoiceEnabled(true);
                  }}
                  className={`px-3 py-1 rounded text-[10px] font-semibold flex items-center gap-1.5 transition-all ${
                    activeMode === 'live_call'
                      ? 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/40 animate-pulse'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                  title={lang === 'en' ? 'Live Agent Call Mode' : 'Mode Live Call'}
                >
                  <Phone className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />
                  <span>Live</span>
                </button>
              </div>
          </div>

          {/* Window Action Controls */}
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setShowDebugFrames(!showDebugFrames)}
              className={`p-1.5 rounded-lg transition-colors ${
                showDebugFrames
                  ? 'bg-indigo-500/20 text-indigo-500 border border-indigo-500/40'
                  : 'text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10'
              }`}
              title={lang === 'en' ? 'Show Sample Frames Debug' : 'Tampilkan Debug Frame Sampling'}
            >
              <Image className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowContextSettings(!showContextSettings)}
              className={`p-1.5 rounded-lg transition-colors ${
                showContextSettings
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                  : 'text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10'
              }`}
              title={lang === 'en' ? 'Context & Sampling Settings' : 'Pengaturan Konteks & Sampling'}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleClearChat}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title={lang === 'en' ? 'Clear Chat History' : 'Hapus Riwayat Chat'}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title={lang === 'en' ? 'Close AI Companion' : 'Tutup AI Companion'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sub-Header Context & Frame Sampling Settings Panel */}
        {showContextSettings && (
          <div className="px-3.5 py-2.5 bg-amber-500/10 dark:bg-amber-950/40 border-b border-amber-500/20 flex items-center justify-between gap-3 text-xs shrink-0 animate-in slide-in-from-top-1 duration-150">
            {/* Context (predictiveMs) */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {lang === 'en' ? 'Context' : 'Konteks'}:
              </span>
              <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-amber-500/30 rounded-lg px-2 py-0.5 shadow-sm">
                <input
                  type="number"
                  min={100}
                  max={60000}
                  step={100}
                  value={predictiveMs}
                  onChange={e => {
                    const val = Math.max(100, Math.min(60000, parseInt(e.target.value) || 10000));
                    setPredictiveMs(val);
                    onPreferenceSettingsChange?.({ aiPredictiveMs: val });
                  }}
                  className="w-14 bg-transparent text-xs font-mono text-zinc-900 dark:text-white text-center focus:outline-none"
                />
                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">ms</span>
              </div>
            </div>
            {/* Frame Sampling (predictiveStepMs) */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">
                {lang === 'en' ? 'Frame Sampling' : 'Sampling Frame'}:
              </span>
              <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-amber-500/30 rounded-lg px-2 py-0.5 shadow-sm">
                <input
                  type="number"
                  min={100}
                  max={30000}
                  step={100}
                  value={predictiveStepMs}
                  onChange={e => {
                    const val = Math.max(100, Math.min(30000, parseInt(e.target.value) || 2000));
                    setPredictiveStepMs(val);
                    onPreferenceSettingsChange?.({ aiPredictiveStepMs: val });
                  }}
                  className="w-14 bg-transparent text-xs font-mono text-zinc-900 dark:text-white text-center focus:outline-none"
                />
                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">ms</span>
              </div>
            </div>
          </div>
        )}

        {/* Debug Frames Grid Panel */}
        {showDebugFrames && (
          <div className="px-3.5 py-2.5 bg-indigo-500/10 dark:bg-indigo-950/40 border-b border-indigo-500/20 shrink-0 animate-in slide-in-from-top-1 duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-[10px] uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                {lang === 'en' ? 'Sent Video Frames Debug' : 'Debug Frame Video Terkirim'}
              </span>
              <button 
                onClick={() => setDebugFrames([])}
                className="text-[10px] text-zinc-500 hover:text-indigo-500"
              >
                Clear
              </button>
            </div>
            {debugFrames.length === 0 ? (
              <div className="text-center text-xs text-zinc-500 italic py-2">
                {lang === 'en' ? 'No frames sent yet' : 'Belum ada frame terkirim'}
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {debugFrames.map(frame => (
                  <div key={frame.id} className="relative flex-shrink-0 w-24 h-16 rounded-md overflow-hidden border border-indigo-500/30 shadow-sm group">
                    <img src={frame.dataUrl} className="w-full h-full object-cover" alt="Video frame" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
                      <span className="text-white text-[8px] font-mono text-center leading-tight bg-black/70 px-1 rounded truncate w-full">
                        {frame.label}
                      </span>
                      <span className="text-amber-400 text-[8px] font-mono font-bold mt-0.5 bg-black/70 px-1 rounded">
                        {frame.timestamp}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= CONTENT BODY ================= */}
        {activeMode === 'live_call' ? (
          /* ================= LIVE CALL INTERFACE ================= */
          <div className="flex-1 flex flex-col justify-between p-4 bg-gradient-to-b from-white/95 via-zinc-100/90 to-zinc-100/95 dark:from-zinc-950 dark:via-[#120d08] dark:to-zinc-950 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top Info Pill */}
            <div className="flex items-center justify-between text-xs z-10 bg-white/10 dark:bg-zinc-900/10 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-2xl px-3 py-2 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-zinc-800 dark:text-zinc-200 font-bold text-[10px] tracking-wider uppercase">
                  {lang === 'en' ? 'Live Agent Connected' : 'Live Agent Terhubung'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[10px]">
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 dark:text-amber-300 border border-amber-500/30">
                  ⏱️ {formatCallTimer(callDuration)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500 dark:text-orange-300 border border-orange-500/30">
                  🎙️ {aiVoice || 'Kore'}
                </span>
              </div>
            </div>

            {/* Center Interactive Orb & Equalizer Visualizer */}
            <div className="my-auto flex flex-col items-center justify-center py-4 text-center z-10">
              <div className="relative flex items-center justify-center mb-6">
                {/* Concentric Pulsing Sound Rings */}
                {(isSpeaking || isListening || isLoading || liveStatus === 'THINKING...') && (
                  <>
                    <div className={`absolute w-44 h-44 rounded-full border ${isSpeaking ? 'border-amber-500/30 animate-ping' : isListening ? 'border-rose-500/30 animate-ping' : liveStatus === 'THINKING...' ? 'border-indigo-500/30 animate-ping' : 'border-amber-500/20 animate-pulse'}`} />
                    <div className={`absolute w-32 h-32 rounded-full border ${isSpeaking ? 'border-amber-400/50 animate-pulse' : isListening ? 'border-rose-400/50 animate-pulse' : liveStatus === 'THINKING...' ? 'border-indigo-400/50 animate-pulse' : 'border-amber-400/30 animate-ping'}`} />
                  </>
                )}
                {/* Central Orb */}
                <div className={`w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative z-10 ${
                  isSpeaking
                    ? 'bg-gradient-to-br from-amber-500 via-orange-600 to-amber-700 shadow-amber-500/50 scale-105'
                    : isListening || liveStatus === 'LISTENING...'
                    ? 'bg-gradient-to-br from-rose-500 via-red-600 to-rose-700 shadow-rose-500/50 ring-4 ring-rose-500/30'
                    : isLoading || liveStatus === 'THINKING...'
                    ? 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-500/40 animate-pulse'
                    : 'bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300 dark:from-zinc-800 dark:via-zinc-900 dark:to-zinc-950 border border-zinc-300 dark:border-zinc-700 shadow-black/20 dark:shadow-black'
                }`}>
                  {isSpeaking ? (
                    <Volume2 className="w-12 h-12 text-white animate-bounce" />
                  ) : isListening || liveStatus === 'LISTENING...' ? (
                    <Mic className="w-12 h-12 text-white animate-pulse" />
                  ) : isLoading || liveStatus === 'THINKING...' ? (
                    <BrainCircuit className="w-10 h-10 text-white animate-pulse" />
                  ) : (
                    <Bot className="w-12 h-12 text-amber-500 dark:text-amber-400" />
                  )}
                </div>
              </div>

              {/* Status Text */}
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white tracking-wide mb-1 flex items-center justify-center gap-1.5">
                {liveStatus === 'SPEAKING...' || isSpeaking
                  ? (lang === 'en' ? 'AI Agent Speaking...' : 'AI Agent sedang berbicara...')
                  : liveStatus === 'THINKING...'
                  ? (lang === 'en' ? 'AI Agent Thinking...' : 'AI Agent sedang berpikir...')
                  : liveStatus === 'LISTENING...'
                  ? (lang === 'en' ? 'Listening to your voice...' : 'Mendengarkan suara Anda...')
                  : liveStatus === 'CONNECTING...'
                  ? (lang === 'en' ? 'Connecting to Live Agent...' : 'Menghubungkan ke Live Agent...')
                  : liveStatus === 'QUOTA EXHAUSTED'
                  ? (lang === 'en' ? 'Free Quota Exhausted' : 'Kuota Gratisan Habis')
                  : liveStatus === 'OFFLINE'
                  ? (lang === 'en' ? 'Connection Offline' : 'Koneksi Terputus')
                  : liveStatus === 'ERROR'
                  ? (lang === 'en' ? 'Connection Error' : 'Gagal Menyambung')
                  : (lang === 'en' ? 'AI Agent Connected' : 'AI Agent Terhubung Live')}
              </h3>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 max-w-xs font-mono">
                Model: {aiLiveModel || 'gemini-3.1-flash-live-preview'} • Voice: {aiVoice || 'Kore'}
              </p>
              {liveErrorMessage && (
                <div className="mt-2 text-xs text-rose-500 dark:text-rose-300 bg-rose-100/50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800/60 rounded-xl px-3 py-1.5 max-w-xs">
                  ⚠️ {liveErrorMessage}
                </div>
              )}

              {/* Real-time Frequency Wave Spectrum */}
              <div className="flex items-center gap-1 mt-4 h-6">
                {[40, 80, 35, 95, 60, 100, 70, 45, 85, 30, 75, 50].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full transition-all duration-150 ${
                      isSpeaking || liveStatus === 'SPEAKING...'
                        ? 'bg-gradient-to-t from-amber-500 to-amber-300 animate-pulse'
                        : liveStatus === 'THINKING...'
                        ? 'bg-gradient-to-t from-indigo-500 to-indigo-300 animate-pulse'
                        : liveStatus === 'LISTENING...'
                        ? 'bg-gradient-to-t from-rose-500 to-rose-300 animate-bounce'
                        : 'bg-zinc-300 dark:bg-zinc-700 h-1'
                    }`}
                    style={{
                      height: (isSpeaking || liveStatus === 'SPEAKING...') ? `${Math.max(4, (h * 0.7))}px` : liveStatus === 'THINKING...' ? `${Math.max(4, (h * 0.4))}px` : liveStatus === 'LISTENING...' ? `${Math.max(4, (h * 0.5))}px` : '4px',
                      animationDelay: `${i * 0.08}s`,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Live Streaming Speech & Reasoning Card */}
            {(agentSpeechText || agentReasoningText || transcription) && (
              <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-amber-500/30 rounded-2xl p-3 mb-3 max-h-32 overflow-y-auto z-10 scrollbar-thin shadow-xl">
                {agentReasoningText && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-300 font-mono mb-1.5 p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="font-bold">🧠 Thinking:</span> {agentReasoningText}
                  </div>
                )}
                {agentSpeechText && (
                  <div className="text-xs text-zinc-900 dark:text-zinc-100 font-sans leading-relaxed">
                    <span className="text-amber-500 dark:text-amber-400 font-bold mr-1">🎙️ Agent:</span>
                    "{agentSpeechText}"
                  </div>
                )}
                {transcription && (
                  <div className="text-xs text-emerald-300 font-sans italic mt-1 pt-1 border-t border-zinc-800/80">
                    <span className="font-bold">🗣️ {lang === 'en' ? 'You:' : 'Anda:'}</span> "{transcription}"
                  </div>
                )}
              </div>
            )}

            {/* Live Call Control Action Dock */}
            <div className="space-y-2.5 z-10">
              <div className="flex items-center justify-center gap-4">
                {/* Mic Mute Toggle */}
                <button
                  onClick={() => {
                    isMutedRef.current = !isMutedRef.current;
                    setIsMicMuted(isMutedRef.current);
                  }}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    !isMicMuted
                      ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30 animate-pulse'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-700'
                  }`}
                  title={!isMicMuted ? (lang === 'en' ? 'Mute Microphone' : 'Mute Mikrofon') : (lang === 'en' ? 'Unmute Microphone' : 'Unmute Mikrofon')}
                >
                  {!isMicMuted ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5 text-rose-400" />}
                </button>

                {/* Speaker Toggle */}
                <button
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    voiceEnabled
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 border-zinc-300 dark:border-zinc-700'
                  }`}
                  title={voiceEnabled ? (lang === 'en' ? 'Mute Speaker' : 'Mute Speaker') : (lang === 'en' ? 'Unmute Speaker' : 'Unmute Speaker')}
                >
                  {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>

                {/* Poke Button */}
                <button
                  onClick={async () => {
                    if (sessionRef.current) {
                      lastActivityRef.current = Date.now();
                      setLiveStatus('THINKING...');
                      await sendFrameSnapshot(aiPredictiveCaching ? predictiveMs : 0); // Request future frame ahead
                      if (sessionRef.current) {
                        sessionRef.current.sendRealtimeInput({
                          text: "URGENT: Poke! Coba respon berdasarkan visual/video terbaru atau konteks pembicaraan jika belum!"
                        });
                      }
                    }
                  }}
                  className="p-3.5 rounded-2xl border transition-all bg-indigo-500/20 text-indigo-400 border-indigo-500/40 hover:bg-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/20"
                  title={lang === 'en' ? 'Poke AI (Force Response)' : 'Pancing AI (Paksa Respon)'}
                >
                  <Zap className="w-5 h-5" />
                </button>

                {/* End Call / Reconnect Button */}
                {(liveStatus === 'OFFLINE' || liveStatus === 'ERROR' || liveStatus === 'QUOTA EXHAUSTED') ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setLiveStatus('CONNECTING...');
                        setLiveErrorMessage(null);
                        setReconnectTrigger(prev => prev + 1);
                      }}
                      className="px-4 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/40 transition-all cursor-pointer flex items-center gap-2 text-sm font-bold"
                      title={lang === 'en' ? 'Reconnect' : 'Hubungkan Ulang'}
                    >
                      <RefreshCw className="w-5 h-5" />
                      {lang === 'en' ? 'Reconnect' : 'Ulangi'}
                    </button>
                    <button
                      onClick={() => {
                        if (audioRef.current) audioRef.current.pause();
                        if (recognitionRef.current) recognitionRef.current.stop();
                        setIsListening(false);
                        setIsSpeaking(false);
                        setActiveMode('chat');
                      }}
                      className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/40 transition-all cursor-pointer"
                      title={lang === 'en' ? 'End Live Call (Return to Chat)' : 'Akhiri Live Call (Kembali ke Chat)'}
                    >
                      <PhoneOff className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (audioRef.current) audioRef.current.pause();
                      if (recognitionRef.current) recognitionRef.current.stop();
                      setIsListening(false);
                      setIsSpeaking(false);
                      setActiveMode('chat');
                    }}
                    className="p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/40 transition-all cursor-pointer"
                    title={lang === 'en' ? 'End Live Call (Return to Chat)' : 'Akhiri Live Call (Kembali ke Chat)'}
                  >
                    <PhoneOff className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Alternative Text Input Field for Live Call */}
              <div className="flex items-center gap-2 bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-1.5 shadow-md">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={lang === 'en' ? 'Type message if you cannot speak...' : 'Ketik pesan alternatif jika tidak bisa bicara...'}
                  className="flex-1 bg-transparent px-2.5 py-1 text-xs text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !inputText.trim()}
                  className="p-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold text-xs disabled:opacity-40 transition-all shrink-0"
                  title={lang === 'en' ? 'Send to Live Agent' : 'Kirim ke Live Agent'}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ================= STANDARD CHAT INTERFACE ================= */
          <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-b from-zinc-50/95 via-zinc-100/80 to-zinc-100 dark:from-zinc-950/95 dark:via-zinc-900 dark:to-zinc-950">
            {/* Context & Video Dashboard Banner */}
            <div className="bg-zinc-100/50 dark:bg-zinc-900/50 border-b border-zinc-200/50 dark:border-white/10 p-2 shrink-0">
              {/* Active Subtitle Ticker with Quick Action */}
              {currentSubtitleText ? (
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Film className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="italic text-amber-800 dark:text-amber-200 truncate font-sans text-[11px]">
                      "{currentSubtitleText}"
                    </span>
                  </div>
                  <button
                    onClick={() => sendMessage(lang === 'en' ? `Analyze and explain this active line: "${currentSubtitleText}"` : `Jelaskan dan analisis subtitle ini: "${currentSubtitleText}"`)}
                    className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold flex items-center gap-1 shrink-0 transition-all"
                  >
                    <Zap className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>{lang === 'en' ? 'Analyze Line' : 'Rangkum Subtitle'}</span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 px-1">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300 truncate">
                    <Film className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                    <span className="truncate">{hasActiveVideo ? (videoTitle || 'Main Video Player') : (lang === 'en' ? 'NO ACTIVE VIDEO (EMPTY STATE)' : 'TIDAK ADA VIDEO (KOSONG)')}</span>
                  </span>
                  {hasActiveVideo && (
                    <span className="font-mono text-amber-600 dark:text-amber-400 text-[10px] bg-amber-500/10 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-white/10 shrink-0">
                      ⏱️ {currentTimeFormatted}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Chat Message Feed */}
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-400">
                  <div className="relative mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 p-0.5 shadow-lg shadow-amber-500/20">
                      <div className="w-full h-full bg-white dark:bg-zinc-950 rounded-2xl flex items-center justify-center text-amber-500 dark:text-amber-400">
                        <Bot className="w-7 h-7" />
                      </div>
                    </div>
                  </div>

                  <h4 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm mb-1">
                    {lang === 'en' ? 'Start AI Live Discussion' : 'Mulai Diskusi dengan AI Companion'}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
                    {lang === 'en'
                      ? 'Ask questions or discuss story plots, characters, and visual techniques in real-time.'
                      : 'Tanyakan atau bahas alur cerita, karakter, dan teknik sinematografi secara real-time.'}
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                const { reasoning, speech } = parseAgentText(msg.text);
                const isExpanded = !!expandedThinking[msg.id];

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-md">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-br-none shadow-lg'
                          : 'bg-white/95 dark:bg-zinc-900/95 border-l-2 border-l-amber-500 border border-zinc-200 dark:border-zinc-800/80 text-zinc-800 dark:text-zinc-200 rounded-bl-none shadow-md'
                      }`}
                    >
                      {/* Message Header Bar */}
                      <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] opacity-90 border-b pb-1 border-zinc-800/60">
                        <span className="font-medium flex items-center gap-1.5">
                          {msg.role === 'assistant' ? (
                            <span className="text-amber-300 font-bold flex items-center gap-1">
                              AI Companion
                              <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">UNCENSORED</span>
                            </span>
                          ) : (
                            <span className="font-bold text-amber-100">{lang === 'en' ? 'You' : 'Anda'}</span>
                          )}
                        </span>

                        <div className="flex items-center gap-1">
                          {msg.timestamp && (
                            <button
                              onClick={() => msg.timeInSeconds !== undefined && onSeekTo(msg.timeInSeconds)}
                              className="hover:text-amber-300 font-mono flex items-center gap-0.5 mr-1 cursor-pointer bg-zinc-200/60 dark:bg-zinc-800/60 px-1.5 py-0.5 rounded text-[9px] text-amber-300"
                              title={lang === 'en' ? 'Jump to timestamp' : 'Lompat ke durasi ini'}
                            >
                              ⏱️ {msg.timestamp}
                            </button>
                          )}

                          {/* Action Buttons */}
                          {msg.role === 'assistant' && (
                            <>
                              <button
                                onClick={() => handleRegenerateResponse(msg)}
                                disabled={isLoading}
                                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-amber-500 dark:hover:text-amber-300 text-zinc-500 dark:text-zinc-400 transition-colors disabled:opacity-40"
                                title={lang === 'en' ? 'Regenerate Response' : 'Regenerate Respon AI'}
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>

                              <button
                                onClick={() => handleGenerateTts(msg, true)}
                                disabled={isTtsLoading === msg.id}
                                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-amber-500 dark:hover:text-amber-300 text-zinc-500 dark:text-zinc-400 transition-colors disabled:opacity-40"
                                title={lang === 'en' ? 'Regenerate Voice (TTS)' : 'Regenerate Suara (TTS)'}
                              >
                                <RefreshCw className={`w-3 h-3 ${isTtsLoading === msg.id ? 'animate-spin text-amber-400' : ''}`} />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handleStartEdit(msg)}
                            className={`p-1 rounded transition-colors ${
                              msg.role === 'user'
                                ? 'hover:bg-amber-700 text-amber-100 hover:text-white'
                                : 'hover:bg-zinc-800 text-zinc-400 hover:text-amber-300'
                            }`}
                            title={
                              msg.role === 'user'
                                ? (lang === 'en' ? 'Edit Prompt & Branch' : 'Edit Pesan Anda & Minta Respon Baru')
                                : (lang === 'en' ? 'Edit Response' : 'Edit Respon AI')
                            }
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Message Content or Inline Editor */}
                      {editingMsgId === msg.id ? (
                        <div className="space-y-2 mt-1">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full bg-white dark:bg-zinc-950 border border-amber-500/60 rounded-xl p-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                            rows={3}
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={handleCancelEdit}
                              className="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-[10px] flex items-center gap-1 transition-colors"
                            >
                              <X className="w-3 h-3" />
                              <span>{lang === 'en' ? 'Cancel' : 'Batal'}</span>
                            </button>
                            <button
                              onClick={() => handleSaveEdit(msg)}
                              disabled={!editingText.trim()}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[10px] flex items-center gap-1 disabled:opacity-40 shadow-sm transition-all"
                            >
                              <Check className="w-3 h-3" />
                              <span>
                                {msg.role === 'user'
                                  ? (lang === 'en' ? 'Save & Send' : 'Simpan & Kirim Ulang')
                                  : (lang === 'en' ? 'Save' : 'Simpan')}
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Reasoning Accordion if assistant message has thinking process */}
                          {msg.role === 'assistant' && reasoning && (
                            <div className="mb-2">
                              <button
                                onClick={() => toggleThinking(msg.id)}
                                className="w-full text-left px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-300 text-[10px] font-mono flex items-center justify-between transition-all"
                              >
                                <span className="flex items-center gap-1 font-semibold">
                                  <BrainCircuit className="w-3 h-3 text-amber-400" />
                                  {lang === 'en' ? 'AI Reasoning & Thinking' : 'Proses Berpikir AI'}
                                </span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                              {isExpanded && (
                                <div className="mt-1 p-2 rounded-lg bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-[10px] text-amber-200/90 font-mono whitespace-pre-wrap leading-normal">
                                  {reasoning}
                                </div>
                              )}
                            </div>
                          )}

                          <p className="whitespace-pre-wrap">{msg.role === 'assistant' ? speech : msg.text}</p>

                          {/* TTS Audio Card */}
                          {msg.role === 'assistant' && (
                            <>
                              {msg.audioUrl ? (
                                <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex flex-col gap-1.5 bg-zinc-50/80 dark:bg-zinc-950/80 p-2.5 rounded-xl border border-amber-500/20">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => togglePlayAudio(msg)}
                                      className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-all shrink-0 cursor-pointer"
                                      title={playingMsgId === msg.id && isPlaying ? 'Pause Audio' : 'Play Audio'}
                                    >
                                      {playingMsgId === msg.id && isPlaying ? (
                                        <Pause className="w-3.5 h-3.5 text-amber-400" />
                                      ) : (
                                        <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                      )}
                                    </button>

                                    <div className="flex-1 flex flex-col justify-center gap-1">
                                      <input
                                        type="range"
                                        min={0}
                                        max={playingMsgId === msg.id ? audioDuration || 100 : 100}
                                        value={playingMsgId === msg.id ? audioCurrentTime : 0}
                                        onChange={(e) => {
                                          if (playingMsgId === msg.id) {
                                            handleSeekAudio(parseFloat(e.target.value));
                                          }
                                        }}
                                        className="w-full h-1 bg-zinc-800 accent-amber-400 rounded-lg cursor-pointer"
                                      />
                                      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                                        <span>{playingMsgId === msg.id ? formatAudioTime(audioCurrentTime) : '0:00'}</span>
                                        <span>{playingMsgId === msg.id && audioDuration ? formatAudioTime(audioDuration) : (lang === 'en' ? 'TTS Audio' : 'Suara TTS')}</span>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => handleDownloadAudio(msg)}
                                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition-all shrink-0"
                                      title={lang === 'en' ? 'Download Audio' : 'Unduh Audio'}
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => handleGenerateTts(msg, true)}
                                      disabled={isTtsLoading === msg.id}
                                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition-all shrink-0"
                                      title={lang === 'en' ? 'Regenerate Voice' : 'Regenerate Suara'}
                                    >
                                      <RefreshCw className={`w-3 h-3 ${isTtsLoading === msg.id ? 'animate-spin text-amber-400' : ''}`} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px]">
                                  <button
                                    onClick={() => handleGenerateTts(msg)}
                                    disabled={isTtsLoading === msg.id}
                                    className="hover:text-amber-300 text-zinc-400 flex items-center gap-1 px-2 py-1 rounded bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 transition-all cursor-pointer"
                                    title={lang === 'en' ? 'Generate Voice (TTS)' : 'Generate Suara (TTS)'}
                                  >
                                    <Volume2 className="w-3 h-3 text-amber-400" />
                                    <span>
                                      {isTtsLoading === msg.id
                                        ? (lang === 'en' ? 'Generating Voice...' : 'Menggenerate Suara...')
                                        : (lang === 'en' ? 'Generate TTS' : 'Dengarkan Suara (TTS)')}
                                    </span>
                                    {isTtsLoading === msg.id && <RefreshCw className="w-3 h-3 animate-spin text-amber-400 ml-1" />}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0 mt-0.5 shadow-sm">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isSpeaking && (
                <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-2.5 w-fit animate-pulse">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <span>{lang === 'en' ? 'AI Voice speaking...' : 'AI sedang berbicara (Suara)...'}</span>
                </div>
              )}

              {isListening && (
                <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-2.5 w-fit animate-pulse">
                  <Mic className="w-4 h-4 text-rose-400" />
                  <span>{lang === 'en' ? 'Listening to your voice...' : 'Mendengarkan suara Anda... Sampaikan pesan...'}</span>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-2.5 text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-2xl p-3 w-fit">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{lang === 'en' ? 'AI analyzing scene & responding...' : 'AI sedang menganalisis adegan & merespon...'}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-2">
                  <span>⚠️ {errorMsg}</span>
                  <button 
                    onClick={() => {
                       setErrorMsg(null);
                       const lastUserMsg = messages.slice().reverse().find(m => m.role === 'user');
                       if (lastUserMsg) {
                         // Attempt to reconnect/retry the last failed message
                         sendMessage(lastUserMsg.text);
                       }
                    }}
                    className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 rounded-lg shrink-0 transition-colors flex items-center gap-1 font-bold shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {lang === 'en' ? 'Reconnect' : 'Ulangi'}
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Command Input Dock */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border-t border-amber-500/15 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isListening
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/50 animate-bounce'
                      : 'bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 border-zinc-200 dark:border-zinc-800 hover:border-amber-500/40'
                  }`}
                  title={isListening ? (lang === 'en' ? 'Stop Recording' : 'Hentikan Rekam Suara') : (lang === 'en' ? 'Speak with Voice' : 'Bicara dengan Suara (STT)')}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder={lang === 'en' ? 'Ask or discuss this scene with AI...' : 'Tanyakan atau bahas adegan ini dengan AI...'}
                  className="flex-1 bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
                />

                <button
                  onClick={() => sendMessage()}
                  disabled={isLoading || !inputText.trim()}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-md shadow-amber-500/20"
                  title={lang === 'en' ? 'Send Message' : 'Kirim Pesan'}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
