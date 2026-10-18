import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Palette, Square, Clock, Settings, Monitor, RotateCcw, Save, FlipHorizontal, FlipVertical, RotateCw, Search, Volume2, Sliders, Zap, ArrowLeftRight, Cpu, Activity, Type, ChevronDown, Repeat, Database, Download, Trash2, Upload, CheckCircle2, AlertTriangle, AlertCircle, XCircle, Eye, EyeOff, Key, Sparkles, ExternalLink, Loader2, SunMedium, Layers, Move, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Check, Play, Terminal, Info, Copy, ShieldCheck, Lock, Unlock } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppearanceSettings, VideoSettings, PreferenceSettings, PlayerSettings, dbService, MpvInterpolationSettings } from '../services/db';
import { getLocalDateString, resolveBrowserDownloadName } from '../services/fileUtils';
import { t } from '../services/i18n';
import { decryptBackupData } from '../services/cryptoUtils';
import { ExportDataModal } from './ExportDataModal';

export const SettingsModal = ({
  show,
  subSettings,
  appearanceSettings,
  videoSettings,
  preferenceSettings,
  audioBoost,
  onAudioBoostChange,
  eqGains,
  onEqChange,
  audioDelay,
  onAudioDelayChange,
  isAudioNormalized,
  onToggleAudioNormalize,
  normalizeThreshold,
  onNormalizeThresholdChange,
  normalizeGain,
  onNormalizeGainChange,
  isSwapChannels,
  onToggleSwapChannels,
  onSubSettingsChange,
  onAppearanceSettingsChange,
  onVideoSettingsChange,
  onPreferenceSettingsChange,
  onClose,
  videoSizingMode = 'contain',
  onChangeVideoSizingMode,
  isAmbientMode = true,
  onToggleAmbientMode,
  isFrameInterpolation = false,
  onToggleFrameInterpolation,
  interpolationEngine = 'canvas_light',
  onChangeInterpolationEngine,
  interpolationMode = 'optical_flow',
  onChangeInterpolationMode,
  mpvSettings = {
    tscale: 'oversample',
    videoSync: 'display-resample',
    enableSvp: true,
    useMvtools: true,
    mvtoolsFps: 60,
    mvtoolsMode: 'flow',
    hwdec: 'auto-safe',
    customPath: ''
  },
  onChangeMpvSettings,
  onCheckMpvAvailable,
  onCheckVapourSynth,
  onLaunchMpv,
  isMpvRunning = false,
  currentVideoPath,
  enableAIFeatures = true,
  onToggleAIFeatures
}: {
  show: boolean;
  subSettings: PlayerSettings['subSettings'];
  appearanceSettings: AppearanceSettings;
  videoSettings: VideoSettings;
  preferenceSettings: PreferenceSettings;
  audioBoost: number;
  onAudioBoostChange: (val: number) => void;
  eqGains: number[];
  onEqChange: (index: number, val: number) => void;
  audioDelay: number;
  onAudioDelayChange: (val: number) => void;
  isAudioNormalized: boolean;
  onToggleAudioNormalize: () => void;
  normalizeThreshold: number;
  onNormalizeThresholdChange: (val: number) => void;
  normalizeGain: number;
  onNormalizeGainChange: (val: number) => void;
  isSwapChannels: boolean;
  onToggleSwapChannels: () => void;
  onSubSettingsChange: (settings: PlayerSettings['subSettings']) => void;
  onAppearanceSettingsChange: (settings: AppearanceSettings) => void;
  onVideoSettingsChange: (settings: VideoSettings) => void;
  onPreferenceSettingsChange: (settings: PreferenceSettings) => void;
  onClose: () => void;
  videoSizingMode?: 'contain' | 'fill' | 'fit-horizontal' | 'fit-vertical' | 'original';
  onChangeVideoSizingMode?: (val: 'contain' | 'fill' | 'fit-horizontal' | 'fit-vertical' | 'original') => void;
  isAmbientMode?: boolean;
  onToggleAmbientMode?: () => void;
  isFrameInterpolation?: boolean;
  onToggleFrameInterpolation?: () => void;
  interpolationEngine?: 'canvas_light' | 'libmpv';
  onChangeInterpolationEngine?: (engine: 'canvas_light' | 'libmpv') => void;
  interpolationMode?: 'optical_flow' | 'temporal_blend';
  onChangeInterpolationMode?: (mode: 'optical_flow' | 'temporal_blend') => void;
  mpvSettings?: MpvInterpolationSettings;
  onChangeMpvSettings?: (settings: Partial<MpvInterpolationSettings>) => void;
  onCheckMpvAvailable?: () => Promise<{ available: boolean; path?: string; version?: string; error?: string }>;
  onCheckVapourSynth?: () => Promise<{ available: boolean; hasVapourSynth?: boolean; hasMvtools?: boolean; message?: string; installCommand?: string; error?: string }>;
  onLaunchMpv?: () => void;
  isMpvRunning?: boolean;
  currentVideoPath?: string;
  enableAIFeatures?: boolean;
  onToggleAIFeatures?: (enabled: boolean) => void;
}) => {
  const [activeTab, setActiveTab] = useState<'teks' | 'tampilan' | 'video' | 'audio' | 'ai' | 'lainnya'>('teks');
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [isChatModelDropdownOpen, setIsChatModelDropdownOpen] = useState(false);
  const [isLiveModelDropdownOpen, setIsLiveModelDropdownOpen] = useState(false);
  const [isTtsModelDropdownOpen, setIsTtsModelDropdownOpen] = useState(false);
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const [isMediaResDropdownOpen, setIsMediaResDropdownOpen] = useState(false);
  const [isTemperatureDropdownOpen, setIsTemperatureDropdownOpen] = useState(false);
  const [isSafetyDropdownOpen, setIsSafetyDropdownOpen] = useState(false);
  const [isThinkingDropdownOpen, setIsThinkingDropdownOpen] = useState(false);
  const [isMaxTokensDropdownOpen, setIsMaxTokensDropdownOpen] = useState(false);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setIsFontDropdownOpen(false);
        setIsChatModelDropdownOpen(false);
        setIsLiveModelDropdownOpen(false);
        setIsTtsModelDropdownOpen(false);
        setIsVoiceDropdownOpen(false);
        setIsMediaResDropdownOpen(false);
        setIsTemperatureDropdownOpen(false);
        setIsSafetyDropdownOpen(false);
        setIsThinkingDropdownOpen(false);
        setIsMaxTokensDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
    };
  }, []);
  const [hardwareDiagnostics, setHardwareDiagnostics] = useState<{
    supported: boolean;
    smooth: boolean;
    powerEfficient: boolean;
    codec: string;
  } | null>(null);

  const [customDialog, setCustomDialog] = useState<{
    type: 'success' | 'confirm' | 'error' | 'warning';
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  } | null>(null);

  // Decryption dialog state for encrypted backups
  const [decryptModal, setDecryptModal] = useState<{
    payload: any;
    hint?: string;
  } | null>(null);
  const [decryptPassword, setDecryptPassword] = useState('');
  const [showDecryptPassword, setShowDecryptPassword] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyTesting, setApiKeyTesting] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleVerifyApiKey = async () => {
    const keyToTest = preferenceSettings.geminiApiKey;
    if (!keyToTest || !keyToTest.trim()) {
      setApiKeyStatus({
        success: false,
        message: lang === 'en' ? 'API Key is empty!' : 'API Key masih kosong!'
      });
      return;
    }

    setApiKeyTesting(true);
    setApiKeyStatus(null);
    try {
      const getApiEndpoint = (endpoint: string) => {
        if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || window.location.protocol === 'nighthub:')) {
          return `http://localhost:3000${endpoint}`;
        }
        return endpoint;
      };

      const res = await fetch(getApiEndpoint('/api/ai/verify-key'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setApiKeyStatus({
          success: true,
          message: lang === 'en' ? 'API Key is valid and working!' : 'API Key valid & siap digunakan!'
        });
      } else {
        setApiKeyStatus({
          success: false,
          message: data.error || (lang === 'en' ? 'API Key is invalid.' : 'API Key tidak valid.')
        });
      }
    } catch (err: any) {
      setApiKeyStatus({
        success: false,
        message: err.message || (lang === 'en' ? 'Failed to connect to server.' : 'Gagal menghubungi server.')
      });
    } finally {
      setApiKeyTesting(false);
    }
  };

  const [showExportModal, setShowExportModal] = useState(false);

  const handleExportData = () => {
    setShowExportModal(true);
  };

  const handleResetData = () => {
    setCustomDialog({
      type: 'warning',
      title: t('resetConfirmTitle', lang),
      message: t('resetConfirm', lang),
      onConfirm: async () => {
        try {
          await dbService.clearAllStores();
          setCustomDialog({
            type: 'success',
            title: t('resetSuccessTitle', lang),
            message: t('resetSuccess', lang),
            onConfirm: () => {
              window.location.reload();
            }
          });
        } catch (err) {
          console.error('Failed to reset settings:', err);
          setCustomDialog({
            type: 'error',
            title: t('importErrorTitle', lang),
            message: 'Failed to reset database.'
          });
        }
      },
      onCancel: () => {}
    });
  };

  const executeImportConfirmation = (parsedData: any) => {
    setCustomDialog({
      type: 'confirm',
      title: t('importConfirmTitle', lang),
      message: t('importConfirm', lang),
      onConfirm: async () => {
        try {
          await dbService.importData(parsedData);
          setCustomDialog({
            type: 'success',
            title: t('importSuccessTitle', lang),
            message: t('importSuccess', lang),
            onConfirm: () => {
              window.location.reload();
            }
          });
        } catch (err) {
          console.error('Failed to import data:', err);
          setCustomDialog({
            type: 'error',
            title: t('importErrorTitle', lang),
            message: t('importError', lang)
          });
        }
      },
      onCancel: () => {}
    });
  };

  const handlePerformDecrypt = async () => {
    if (!decryptModal) return;
    if (!decryptPassword) {
      setDecryptError(lang === 'en' ? 'Please enter master password.' : 'Silakan masukkan kata sandi master.');
      return;
    }

    setDecrypting(true);
    setDecryptError(null);

    try {
      const decryptedData = await decryptBackupData(decryptModal.payload, decryptPassword);
      setDecryptModal(null);
      executeImportConfirmation(decryptedData);
    } catch (err: any) {
      console.error('Decryption failed:', err);
      setDecryptError(
        lang === 'en' 
          ? 'Incorrect master password or corrupted file.' 
          : 'Kata sandi master salah atau berkas cadangan rusak.'
      );
    } finally {
      setDecrypting(false);
    }
  };

  const handleImportData = async () => {
    const isElectron = !!((window as any).electron || (window as any).require?.('electron'));
    const ipc = (window as any).electron?.ipcRenderer || (window as any).require?.('electron')?.ipcRenderer;

    const processImportJson = async (text: string) => {
      try {
        const parsed = JSON.parse(text);
        
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Invalid backup file structure.');
        }

        // Check if file is encrypted with Master Password AES-256
        if (parsed._encrypted === true) {
          setDecryptPassword('');
          setDecryptError(null);
          setDecryptModal({
            payload: parsed,
            hint: parsed.hint
          });
          return;
        }

        executeImportConfirmation(parsed);
      } catch (err) {
        console.error('Failed to parse import JSON:', err);
        setCustomDialog({
          type: 'error',
          title: t('importErrorTitle', lang),
          message: t('importError', lang)
        });
      }
    };

    if (isElectron && ipc && typeof ipc.invoke === 'function') {
      try {
        const res = await ipc.invoke('show-open-dialog', {
          title: lang === 'en' ? 'Import Database / JSON' : 'Impor Database / JSON',
          filters: [
            { name: 'JSON Document (*.json)', extensions: ['json'] },
            { name: lang === 'en' ? 'All Files (*.*)' : 'Semua Berkas (*.*)', extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        if (!res.canceled && res.filePaths && res.filePaths[0]) {
          const readRes = await ipc.invoke('read-file-text', res.filePaths[0]);
          if (readRes && readRes.success) {
            await processImportJson(readRes.content);
            return;
          }
        } else {
          return;
        }
      } catch (e) {
        console.warn('Native open dialog failed, falling back:', e);
      }
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      await processImportJson(text);
    };
    input.click();
  };

  useEffect(() => {
    if (!show) return;
    
    const checkCapabilities = async () => {
      if (!navigator.mediaCapabilities) return;
      
      const codecsToTest = [
        { name: 'H.264 (AVC) 4K', mime: 'video/mp4; codecs="avc1.640033"' },
        { name: 'VP9 4K', mime: 'video/webm; codecs="vp9"' },
        { name: 'HEVC 4K', mime: 'video/mp4; codecs="hev1.1.6.L153.B0"' }
      ];

      for (const codec of codecsToTest) {
        try {
          const info = await navigator.mediaCapabilities.decodingInfo({
            type: 'file',
            video: {
              contentType: codec.mime,
              width: 3840,
              height: 2160,
              bitrate: 20000000,
              framerate: 60
            }
          });
          if (info.supported) {
            setHardwareDiagnostics({
              supported: info.supported,
              smooth: info.smooth,
              powerEfficient: info.powerEfficient,
              codec: codec.name
            });
            if (info.powerEfficient) {
              return; // found hardware accelerated
            }
          }
        } catch (e) {
          // ignore error and test next
        }
      }

      // fallback 1080p
      try {
        const info = await navigator.mediaCapabilities.decodingInfo({
          type: 'file',
          video: {
            contentType: 'video/mp4; codecs="avc1.64002a"',
            width: 1920,
            height: 1080,
            bitrate: 5000000,
            framerate: 30
          }
        });
        setHardwareDiagnostics({
          supported: info.supported,
          smooth: info.smooth,
          powerEfficient: info.powerEfficient,
          codec: 'H.264 (1080p)'
        });
      } catch (e) {
        console.error('Capabilities check failed:', e);
      }
    };

    checkCapabilities();
  }, [show]);

  if (!show) return null;

  const lang = preferenceSettings.language || 'id';

  const updateOffset = (delta: number) => {
    const current = subSettings.offset || 0;
    onSubSettingsChange({ ...subSettings, offset: Math.round((current + delta) * 10) / 10 });
  };

  const resetVideoSettings = () => {
    onVideoSettingsChange({ 
      brightness: 100, 
      contrast: 100, 
      saturation: 100,
      hue: 0,
      grayscale: 0,
      sepia: 0,
      invert: 0,
      rotation: 0,
      flipH: false,
      flipV: false,
      zoom: 1,
      panX: 0,
      panY: 0
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
      <motion.div 
        drag
        dragMomentum={false}
        className="pointer-events-auto bg-white dark:bg-[#0a0502] border border-black/10 dark:border-white/10 p-6 sm:p-8 rounded-[2rem] z-50 backdrop-blur-2xl w-full max-w-4xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col max-h-[90vh] md:h-[680px]"
      >
        {/* Drag handle area */}
        <div className="absolute top-0 left-0 right-0 h-12 cursor-grab active:cursor-grabbing z-20 flex items-center justify-center">
          <div className="w-12 h-1.5 bg-black/10 dark:bg-white/10 rounded-full mt-2"></div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 dark:bg-amber-500/10 blur-[80px] rounded-full pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/5 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="flex justify-between items-center mb-6 relative z-10 shrink-0 mt-4">
          <h3 className="text-zinc-900 dark:text-white text-xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 dark:bg-amber-500/10 flex items-center justify-center border border-orange-500/20 dark:border-amber-500/20">
              <Settings size={18} className="text-orange-600 dark:text-amber-500" />
            </div>
            {t('settings', lang)}
          </h3>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-all border border-black/5 dark:border-white/5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sidebar + Content layout */}
        <div className="flex flex-col md:flex-row gap-6 relative z-10 flex-1 overflow-hidden min-h-0">
          
          {/* Navigation (Sidebar) */}
          <div className="w-full md:w-56 shrink-0 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible md:overflow-y-auto p-3 pb-2 md:pb-3 scrollbar-hide bg-zinc-100/50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-white/5 rounded-2xl md:h-full">
            <button
              onClick={() => setActiveTab('teks')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap md:w-full transition-all border-l-[3px] text-left ${activeTab === 'teks' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500 border-orange-500/90 dark:border-amber-500/90 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
            >
              <Type size={16} className={activeTab === 'teks' ? 'text-orange-500 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
              <span>{t('teks', lang)}</span>
            </button>
            <button
              onClick={() => setActiveTab('tampilan')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap md:w-full transition-all border-l-[3px] text-left ${activeTab === 'tampilan' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500 border-orange-500/90 dark:border-amber-500/90 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
            >
              <Palette size={16} className={activeTab === 'tampilan' ? 'text-orange-500 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
              <span>{t('tampilan', lang)}</span>
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap md:w-full transition-all border-l-[3px] text-left ${activeTab === 'video' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500 border-orange-500/90 dark:border-amber-500/90 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
            >
              <Monitor size={16} className={activeTab === 'video' ? 'text-orange-500 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
              <span>{t('video', lang)}</span>
            </button>
            <button
              onClick={() => setActiveTab('audio')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap md:w-full transition-all border-l-[3px] text-left ${activeTab === 'audio' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500 border-orange-500/90 dark:border-amber-500/90 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
            >
              <Volume2 size={16} className={activeTab === 'audio' ? 'text-orange-500 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
              <span>{t('audio', lang)}</span>
            </button>
            {enableAIFeatures && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap md:w-full transition-all border-l-[3px] text-left ${activeTab === 'ai' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500 border-orange-500/90 dark:border-amber-500/90 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
              >
                <Sparkles size={16} className={activeTab === 'ai' ? 'text-orange-500 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                <span>{t('aiSettings', lang)}</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('lainnya')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap md:w-full transition-all border-l-[3px] text-left ${activeTab === 'lainnya' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500 border-orange-500/90 dark:border-amber-500/90 font-extrabold shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'bg-transparent text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'}`}
            >
              <Sliders size={16} className={activeTab === 'lainnya' ? 'text-orange-500 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
              <span>{t('lainnya', lang)}</span>
            </button>
          </div>

          {/* Main Content Pane */}
          <div className="flex-1 overflow-y-auto pr-2 pb-4 custom-scrollbar space-y-8">
          
          {/* TAB: TEKS */}
          {activeTab === 'teks' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* Font Family Selection */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('fontFamily', lang)}</label>
                
                {/* Custom Dropdown Trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-sm flex items-center justify-between cursor-pointer hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-colors focus:outline-none focus:border-orange-500 dark:focus:border-amber-500 bg-white/50 dark:bg-[#120a06]/50"
                    style={{ fontFamily: subSettings.fontFamily || 'sans-serif' }}
                  >
                    <span>
                      {(() => {
                        const val = subSettings.fontFamily || 'sans-serif';
                        if (val === 'sans-serif') return 'Sans-serif (Default)';
                        if (val === 'serif') return 'Serif (Classic)';
                        if (val === 'monospace') return 'Monospace (Code)';
                        if (val === 'system-ui') return 'System UI';
                        if (val === 'Arial, sans-serif') return 'Arial';
                        if (val === 'Georgia, serif') return 'Georgia';
                        if (val === 'Courier New, monospace') return 'Courier New';
                        if (val === "'Trebuchet MS', sans-serif") return 'Trebuchet MS';
                        if (val === 'Impact, Charcoal, sans-serif') return 'Impact (Bold)';
                        if (val === "'Comic Sans MS', cursive") return 'Comic Sans MS';
                        return val;
                      })()}
                    </span>
                    <ChevronDown 
                      size={16} 
                      className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${isFontDropdownOpen ? 'rotate-180' : ''}`} 
                    />
                  </button>

                  {/* Dropdown Options Menu */}
                  {isFontDropdownOpen && (
                    <div 
                      className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150"
                    >
                        {[
                          { value: 'sans-serif', label: 'Sans-serif (Default)' },
                          { value: 'serif', label: 'Serif (Classic)' },
                          { value: 'monospace', label: 'Monospace (Code)' },
                          { value: 'system-ui', label: 'System UI' },
                          { value: 'Arial, sans-serif', label: 'Arial' },
                          { value: 'Georgia, serif', label: 'Georgia' },
                          { value: 'Courier New, monospace', label: 'Courier New' },
                          { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
                          { value: 'Impact, Charcoal, sans-serif', label: 'Impact (Bold)' },
                          { value: "'Comic Sans MS', cursive", label: 'Comic Sans MS' }
                        ].map((opt) => {
                          const isSelected = (subSettings.fontFamily || 'sans-serif') === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                onSubSettingsChange({ ...subSettings, fontFamily: opt.value });
                                setIsFontDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between ${
                                isSelected 
                                  ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-semibold' 
                                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                              }`}
                              style={{ fontFamily: opt.value }}
                            >
                              <span>{opt.label}</span>
                              {isSelected && (
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                  )}
                </div>
              </div>

              {/* Size Control */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('fontSize', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {subSettings.size}px
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="12" 
                    max="48" 
                    value={subSettings.size} 
                    onChange={e => onSubSettingsChange({...subSettings, size: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              {/* Color Controls */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Palette size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('color', lang)}
                  </label>
                  <div className="relative h-12 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden group hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 transition-all">
                    <input 
                      type="color" 
                      value={subSettings.color} 
                      onChange={e => onSubSettingsChange({...subSettings, color: e.target.value})} 
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10" 
                    />
                    <div 
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ backgroundColor: subSettings.color }}
                    >
                      <span className="text-[10px] font-bold mix-blend-difference text-zinc-900 dark:text-white uppercase tracking-wider">
                        {subSettings.color}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Square size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('background', lang)}
                  </label>
                  <div className="relative h-12 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden group hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 transition-all">
                    <input 
                      type="color" 
                      value={subSettings.bg.slice(0,7)} 
                      onChange={e => {
                        const hexColor = e.target.value;
                        const currentOpacity = subSettings.bgOpacity !== undefined ? subSettings.bgOpacity : (() => {
                          if (subSettings.bg && subSettings.bg.length === 9) {
                            const alphaHex = subSettings.bg.slice(7, 9);
                            const parsed = parseInt(alphaHex, 16);
                            if (!isNaN(parsed)) return Math.round((parsed / 255) * 100);
                          }
                          return 50;
                        })();
                        const hexOpacity = Math.round((currentOpacity / 100) * 255).toString(16).padStart(2, '0');
                        onSubSettingsChange({
                          ...subSettings,
                          bg: hexColor + hexOpacity
                        });
                      }} 
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10" 
                    />
                    <div 
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      style={{ backgroundColor: subSettings.bg }}
                    >
                      <span className="text-[10px] font-bold mix-blend-difference text-zinc-900 dark:text-white uppercase tracking-wider">
                        {subSettings.bg.slice(0,7)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Background Opacity Control */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('bgOpacity', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {(() => {
                      if (subSettings.bgOpacity !== undefined) return subSettings.bgOpacity;
                      if (subSettings.bg && subSettings.bg.length === 9) {
                        const alphaHex = subSettings.bg.slice(7, 9);
                        const parsed = parseInt(alphaHex, 16);
                        if (!isNaN(parsed)) return Math.round((parsed / 255) * 100);
                      }
                      return 50;
                    })()}%
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={(() => {
                      if (subSettings.bgOpacity !== undefined) return subSettings.bgOpacity;
                      if (subSettings.bg && subSettings.bg.length === 9) {
                        const alphaHex = subSettings.bg.slice(7, 9);
                        const parsed = parseInt(alphaHex, 16);
                        if (!isNaN(parsed)) return Math.round((parsed / 255) * 100);
                      }
                      return 50;
                    })()} 
                    onChange={e => {
                      const opacity = Number(e.target.value);
                      const baseColor = subSettings.bg.slice(0, 7);
                      const hexOpacity = Math.round((opacity / 100) * 255).toString(16).padStart(2, '0');
                      onSubSettingsChange({
                        ...subSettings,
                        bgOpacity: opacity,
                        bg: baseColor + hexOpacity
                      });
                    }} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              {/* Background Style Type Control */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('bgStyle', lang)}</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => onSubSettingsChange({...subSettings, bgType: 'box'})}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${(!subSettings.bgType || subSettings.bgType === 'box') ? 'bg-orange-500 dark:bg-amber-500 text-black shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
                  >
                    {t('bgStyleFull', lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSubSettingsChange({...subSettings, bgType: 'line'})}
                    className={`py-2 rounded-lg text-xs font-bold transition-all ${subSettings.bgType === 'line' ? 'bg-orange-500 dark:bg-amber-500 text-black shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'}`}
                  >
                    {t('bgStyleLine', lang)}
                  </button>
                </div>
              </div>

              {/* Line Height Control */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('lineSpacing', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {subSettings.lineHeight || 1.4}
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="1.0" 
                    max="2.2" 
                    step="0.1"
                    value={subSettings.lineHeight || 1.4} 
                    onChange={e => onSubSettingsChange({...subSettings, lineHeight: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              {/* Offset Control */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                  <Clock size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('timeSync', lang)}
                </label>
                <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2 rounded-2xl border border-black/5 dark:border-white/5">
                  <button 
                    type="button"
                    onClick={() => updateOffset(-0.5)} 
                    className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white rounded-xl transition-all border border-black/5 dark:border-white/5 active:scale-95"
                    title="-0.5s"
                  >
                    <Minus size={16} />
                  </button>
                  
                  <div className="flex-1 flex flex-col items-center justify-center py-1">
                    <span className="text-xl font-mono font-black text-orange-600 dark:text-amber-500 tracking-tighter">
                      {subSettings.offset || 0}<span className="text-[10px] ml-0.5 opacity-50">S</span>
                    </span>
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Offset</span>
                  </div>

                  <button 
                    type="button"
                    onClick={() => updateOffset(0.5)} 
                    className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white rounded-xl transition-all border border-black/5 dark:border-white/5 active:scale-95"
                    title="+0.5s"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TAMPILAN */}
          {activeTab === 'tampilan' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Monitor size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('blurLevel', lang)}
                  </label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {appearanceSettings.blur}px
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="0" 
                    max="40" 
                    value={appearanceSettings.blur} 
                    onChange={e => onAppearanceSettingsChange({...appearanceSettings, blur: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Clock size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('transparency', lang)}
                  </label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {Math.round(appearanceSettings.transparency * 100)}%
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={appearanceSettings.transparency} 
                    onChange={e => onAppearanceSettingsChange({...appearanceSettings, transparency: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Monitor size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('displayMode', lang)}
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAppearanceSettingsChange({...appearanceSettings, displayMode: 'default'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${(!appearanceSettings.displayMode || appearanceSettings.displayMode === 'default') ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    {t('displayDefault', lang)}
                  </button>
                  <button
                    onClick={() => onAppearanceSettingsChange({...appearanceSettings, displayMode: 'compact'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${appearanceSettings.displayMode === 'compact' ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    {t('displayCompact', lang)}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Palette size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('themeModeSetting', lang)}
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAppearanceSettingsChange({...appearanceSettings, themeMode: 'dark'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${appearanceSettings.themeMode === 'dark' ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    {t('themeDark', lang)}
                  </button>
                  <button
                    onClick={() => onAppearanceSettingsChange({...appearanceSettings, themeMode: 'light'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${appearanceSettings.themeMode === 'light' ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    {t('themeLight', lang)}
                  </button>
                  <button
                    onClick={() => onAppearanceSettingsChange({...appearanceSettings, themeMode: 'auto'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${(!appearanceSettings.themeMode || appearanceSettings.themeMode === 'auto') ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    {t('themeAuto', lang)}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Repeat size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('showLoopsOnHome', lang)}
                  </label>
                </div>
                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('showLoopsOnHomeStatus', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('showLoopsOnHomeDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.showLoopsOnHome !== false}
                      onChange={e => onPreferenceSettingsChange({...preferenceSettings, showLoopsOnHome: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* TAB: VIDEO */}
          {activeTab === 'video' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-end">
                <button 
                  onClick={resetVideoSettings}
                  className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-zinc-500 hover:text-orange-500 dark:hover:text-amber-500 transition-colors"
                >
                  <RotateCcw size={12} /> {t('resetDefault', lang)}
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('brightness', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {videoSettings.brightness}%
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="50" 
                    max="200" 
                    value={videoSettings.brightness} 
                    onChange={e => onVideoSettingsChange({...videoSettings, brightness: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('contrast', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {videoSettings.contrast}%
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="50" 
                    max="200" 
                    value={videoSettings.contrast} 
                    onChange={e => onVideoSettingsChange({...videoSettings, contrast: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('saturation', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {videoSettings.saturation}%
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="0" 
                    max="200" 
                    value={videoSettings.saturation} 
                    onChange={e => onVideoSettingsChange({...videoSettings, saturation: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('hue', lang)}</label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {videoSettings.hue || 0}°
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range" 
                    min="0" 
                    max="360" 
                    value={videoSettings.hue || 0} 
                    onChange={e => onVideoSettingsChange({...videoSettings, hue: Number(e.target.value)})} 
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('grayscale', lang)}</label>
                    <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                      {videoSettings.grayscale || 0}%
                    </span>
                  </div>
                  <div className="relative flex items-center group">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={videoSettings.grayscale || 0} 
                      onChange={e => onVideoSettingsChange({...videoSettings, grayscale: Number(e.target.value)})} 
                      className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('sepia', lang)}</label>
                    <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                      {videoSettings.sepia || 0}%
                    </span>
                  </div>
                  <div className="relative flex items-center group">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={videoSettings.sepia || 0} 
                      onChange={e => onVideoSettingsChange({...videoSettings, sepia: Number(e.target.value)})} 
                      className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('invert', lang)}</label>
                    <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                      {videoSettings.invert || 0}%
                    </span>
                  </div>
                  <div className="relative flex items-center group">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={videoSettings.invert || 0} 
                      onChange={e => onVideoSettingsChange({...videoSettings, invert: Number(e.target.value)})} 
                      className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-1"><Search size={10} /> {t('zoom', lang)}</label>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                        {videoSettings.zoom || 1}x
                      </span>
                      {((videoSettings.zoom || 1) !== 1 || (videoSettings.panX || 0) !== 0 || (videoSettings.panY || 0) !== 0) && (
                        <button
                          type="button"
                          onClick={() => onVideoSettingsChange({ ...videoSettings, zoom: 1, panX: 0, panY: 0 })}
                          className="text-[10px] text-zinc-500 hover:text-orange-500 dark:hover:text-amber-400 transition-colors flex items-center gap-1 font-semibold"
                          title={t('resetPanZoom', lang)}
                        >
                          <RotateCcw size={10} /> Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative flex items-center group">
                    <input 
                      type="range" 
                      min="0.5" 
                      max="5" 
                      step="0.1"
                      value={videoSettings.zoom || 1} 
                      onChange={e => onVideoSettingsChange({...videoSettings, zoom: Number(e.target.value)})} 
                      className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
                    />
                  </div>
                </div>

                {/* Pan (Geser Sudut Pandang) */}
                <div className="p-3.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-orange-500/10 dark:bg-amber-500/10 text-orange-500 dark:text-amber-500">
                        <Move size={14} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                          {t('pan', lang)}
                          {((videoSettings.panX || 0) !== 0 || (videoSettings.panY || 0) !== 0) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-400"></span>
                          )}
                        </h4>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-tight">
                          {t('panDragTip', lang)}
                        </p>
                      </div>
                    </div>
                    {((videoSettings.panX || 0) !== 0 || (videoSettings.panY || 0) !== 0) && (
                      <button
                        type="button"
                        onClick={() => onVideoSettingsChange({ ...videoSettings, panX: 0, panY: 0 })}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-400 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 border border-orange-500/20 dark:border-amber-500/20 transition-all flex items-center gap-1"
                        title={t('resetPan', lang)}
                      >
                        <RotateCcw size={10} /> 0,0
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Pan Horizontal (X) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                          <ArrowLeftRight size={10} /> {t('panX', lang)}
                        </span>
                        <span className="font-mono text-zinc-800 dark:text-zinc-200 text-[11px]">
                          {(videoSettings.panX || 0) > 0 ? `+${videoSettings.panX}` : (videoSettings.panX || 0)}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-800"
                        max="800"
                        step="10"
                        value={videoSettings.panX || 0}
                        onChange={e => onVideoSettingsChange({ ...videoSettings, panX: Number(e.target.value) })}
                        className="w-full accent-amber-500 h-1.5 bg-black/10 dark:bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-black/15 dark:hover:bg-white/15 transition-colors"
                      />
                    </div>

                    {/* Pan Vertical (Y) */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Move size={10} /> {t('panY', lang)}
                        </span>
                        <span className="font-mono text-zinc-800 dark:text-zinc-200 text-[11px]">
                          {(videoSettings.panY || 0) > 0 ? `+${videoSettings.panY}` : (videoSettings.panY || 0)}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-600"
                        max="600"
                        step="10"
                        value={videoSettings.panY || 0}
                        onChange={e => onVideoSettingsChange({ ...videoSettings, panY: Number(e.target.value) })}
                        className="w-full accent-amber-500 h-1.5 bg-black/10 dark:bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-black/15 dark:hover:bg-white/15 transition-colors"
                      />
                    </div>
                  </div>

                  {/* D-Pad Navigasi Cepat (Nudge) */}
                  <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title={lang === 'id' ? 'Geser Kiri (-40px)' : 'Pan Left (-40px)'}
                        onClick={() => onVideoSettingsChange({ ...videoSettings, panX: (videoSettings.panX || 0) - 40 })}
                        className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-amber-400 transition-colors text-zinc-700 dark:text-zinc-300"
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <button
                        type="button"
                        title={lang === 'id' ? 'Geser Atas (-40px)' : 'Pan Up (-40px)'}
                        onClick={() => onVideoSettingsChange({ ...videoSettings, panY: (videoSettings.panY || 0) - 40 })}
                        className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-amber-400 transition-colors text-zinc-700 dark:text-zinc-300"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        title={lang === 'id' ? 'Tengah / Reset Pan' : 'Center / Reset Pan'}
                        onClick={() => onVideoSettingsChange({ ...videoSettings, panX: 0, panY: 0 })}
                        className="px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-amber-400 transition-colors text-zinc-700 dark:text-zinc-300 font-mono text-[10px] font-bold"
                      >
                        0,0
                      </button>
                      <button
                        type="button"
                        title={lang === 'id' ? 'Geser Bawah (+40px)' : 'Pan Down (+40px)'}
                        onClick={() => onVideoSettingsChange({ ...videoSettings, panY: (videoSettings.panY || 0) + 40 })}
                        className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-amber-400 transition-colors text-zinc-700 dark:text-zinc-300"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button"
                        title={lang === 'id' ? 'Geser Kanan (+40px)' : 'Pan Right (+40px)'}
                        onClick={() => onVideoSettingsChange({ ...videoSettings, panX: (videoSettings.panX || 0) + 40 })}
                        className="p-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-orange-500/20 hover:text-orange-600 dark:hover:text-amber-400 transition-colors text-zinc-700 dark:text-zinc-300"
                      >
                        <ArrowRight size={13} />
                      </button>
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                      X: <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{videoSettings.panX || 0}</span>, Y: <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{videoSettings.panY || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ambient Glow Mode */}
              <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-amber-500/10 text-orange-500 dark:text-amber-500 shrink-0">
                      <SunMedium size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                        {lang === 'id' ? 'Mode Ambient (Pendaran Video)' : 'Ambient Mode (Video Glow)'}
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                        {lang === 'id' 
                          ? 'Efek pendaran warna video dinamis di area luar frame video (letterbox / pillarbox) seperti di YouTube.' 
                          : 'Dynamic glowing video color effect on empty margins outside the video frame (letterbox / pillarbox) like YouTube.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleAmbientMode && onToggleAmbientMode()}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isAmbientMode ? 'bg-orange-500 dark:bg-amber-500' : 'bg-black/20 dark:bg-white/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isAmbientMode ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Smooth Video Transition (Transisi Antar Video) */}
              <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-amber-500/10 text-orange-500 dark:text-amber-500 shrink-0">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                          {t('videoTransitionTitle', lang)}
                        </h4>
                        {(preferenceSettings.videoTransition || 'blur') !== 'none' && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-400 border border-orange-500/20 dark:border-amber-500/20">
                            {preferenceSettings.videoTransition === 'crossfade' ? 'Crossfade' : preferenceSettings.videoTransition === 'zoom' ? 'Zoom' : preferenceSettings.videoTransition === 'fade-black' ? 'Fade to Black' : 'Blur'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                        {t('videoTransitionDesc', lang)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = preferenceSettings.videoTransition || 'none';
                      const next = current === 'none' ? 'crossfade' : 'none';
                      onPreferenceSettingsChange({ 
                        ...preferenceSettings, 
                        videoTransition: next,
                        videoTransitionDuration: preferenceSettings.videoTransitionDuration || 500
                      });
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      (preferenceSettings.videoTransition || 'none') !== 'none' ? 'bg-orange-500 dark:bg-amber-500' : 'bg-black/20 dark:bg-white/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        (preferenceSettings.videoTransition || 'none') !== 'none' ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {(preferenceSettings.videoTransition || 'none') !== 'none' && (
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 space-y-4">
                    {/* Pilihan Gaya Transisi */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-600 dark:text-zinc-400">
                        {t('transitionEffect', lang)}
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'blur', label: t('transitionBlur', lang), icon: '✨' },
                          { id: 'crossfade', label: t('transitionCrossfade', lang), icon: '🔀' },
                          { id: 'zoom', label: t('transitionZoom', lang), icon: '🔍' },
                          { id: 'fade-black', label: t('transitionFadeBlack', lang), icon: '🌑' },
                        ].map((opt) => {
                          const isSelected = (preferenceSettings.videoTransition || 'blur') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onPreferenceSettingsChange({ ...preferenceSettings, videoTransition: opt.id as any })}
                              className={`p-2.5 rounded-xl border text-left transition-all text-xs flex flex-col gap-1.5 ${
                                isSelected
                                  ? 'bg-orange-500/10 dark:bg-amber-500/10 border-orange-500/40 dark:border-amber-500/40 text-orange-600 dark:text-amber-400 font-bold shadow-sm'
                                  : 'bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10'
                              }`}
                            >
                              <span className="text-base">{opt.icon}</span>
                              <span className="text-[11px] leading-tight font-medium">{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Durasi Transisi */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                        <span>{t('transitionDurationLabel', lang)}</span>
                        <span className="font-mono text-zinc-800 dark:text-zinc-200">
                          {preferenceSettings.videoTransitionDuration || 350}ms
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { val: 200, label: t('transitionFast', lang) },
                          { val: 350, label: t('transitionNormal', lang) },
                          { val: 500, label: t('transitionSmooth', lang) },
                        ].map((d) => {
                          const isSelected = (preferenceSettings.videoTransitionDuration || 350) === d.val;
                          return (
                            <button
                              key={d.val}
                              type="button"
                              onClick={() => onPreferenceSettingsChange({ ...preferenceSettings, videoTransitionDuration: d.val })}
                              className={`py-2 px-3 rounded-lg border text-center text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-orange-500/10 dark:bg-amber-500/10 border-orange-500/40 dark:border-amber-500/40 text-orange-600 dark:text-amber-400'
                                  : 'bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Frame Interpolation (Motion Smooth) */}
              <div className="p-4 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10 dark:bg-amber-500/10 text-orange-500 dark:text-amber-500 shrink-0">
                      <Layers size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                          {t('settingInterpolation', lang)}
                        </h4>
                        {isFrameInterpolation && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-400 border border-orange-500/20 dark:border-amber-500/20">
                            {lang === 'id' ? 'Metode Ringan (60 FPS)' : 'Light Method (60 FPS)'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                        {t('interpolationDesc', lang)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleFrameInterpolation && onToggleFrameInterpolation()}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isFrameInterpolation ? 'bg-orange-500 dark:bg-amber-500' : 'bg-black/20 dark:bg-white/20'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isFrameInterpolation ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {isFrameInterpolation && (
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 space-y-3.5">
                    {/* Metode Ringan Banner */}
                    <div className="p-3.5 rounded-xl border border-orange-500/30 dark:border-amber-500/30 bg-orange-500/5 dark:bg-amber-500/5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Cpu size={16} className="text-orange-500 dark:text-amber-400 shrink-0" />
                          <span className="text-xs font-bold text-orange-600 dark:text-amber-400">
                            {lang === 'id' ? 'Metode Ringan (Akselerasi WebGL Shader)' : 'Light Method (WebGL Shader Acceleration)'}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-orange-500/15 dark:bg-amber-500/15 text-orange-600 dark:text-amber-400">
                          {lang === 'id' ? '60 FPS Universal' : 'Universal 60 FPS'}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {lang === 'id'
                          ? 'Menggunakan akselerasi GPU shader browser langsung yang sangat hemat daya dan lancar. Berjalan otomatis tanpa memerlukan instalasi software pihak ketiga.'
                          : 'Uses direct browser GPU shader acceleration which is battery-friendly and smooth. Runs automatically without requiring third-party software.'}
                      </p>
                    </div>

                    {/* Algoritma Shader */}
                    <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-2">
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                        {lang === 'id' ? 'Pilihan Algoritma Gerakan' : 'Motion Algorithm Option'}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onChangeInterpolationMode && onChangeInterpolationMode('optical_flow')}
                          className={`p-2.5 rounded-lg text-left transition-all border ${
                            interpolationMode === 'optical_flow'
                              ? 'bg-orange-500/15 dark:bg-amber-500/15 border-orange-500/50 dark:border-amber-500/50 text-orange-600 dark:text-amber-400 font-bold'
                              : 'bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10'
                          }`}
                        >
                          <div className="text-xs">{t('interpolationModeOptFlow', lang)}</div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            {lang === 'id' ? 'Prediksi vektor gerak piksel (Lebih halus & dinamis)' : 'Pixel motion vector prediction (Smoother & dynamic)'}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => onChangeInterpolationMode && onChangeInterpolationMode('temporal_blend')}
                          className={`p-2.5 rounded-lg text-left transition-all border ${
                            interpolationMode === 'temporal_blend'
                              ? 'bg-orange-500/15 dark:bg-amber-500/15 border-orange-500/50 dark:border-amber-500/50 text-orange-600 dark:text-amber-400 font-bold'
                              : 'bg-black/5 dark:bg-white/5 border-transparent text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10'
                          }`}
                        >
                          <div className="text-xs">{t('interpolationModeBlend', lang)}</div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            {lang === 'id' ? 'Transisi lembut bebas artefak (Sangat ringan)' : 'Soft artifact-free transition (Ultra light)'}
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">
                  {lang === 'id' ? 'Ukuran & Fitting Video' : 'Video Sizing & Fitting'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {([
                    { mode: 'contain', id: 'Fit (Bawaan)', en: 'Fit (Default)' },
                    { mode: 'fill', id: 'Isi Layar', en: 'Fit Screen' },
                    { mode: 'fit-horizontal', id: 'Lebar', en: 'Horizontal' },
                    { mode: 'fit-vertical', id: 'Tinggi', en: 'Vertical' },
                    { mode: 'original', id: 'Asli', en: 'Original' }
                  ] as const).map((item) => (
                    <button
                      key={item.mode}
                      onClick={() => onChangeVideoSizingMode && onChangeVideoSizingMode(item.mode)}
                      className={`py-2 px-1 rounded-xl text-center text-[11px] font-bold transition-all border ${
                        videoSizingMode === item.mode
                          ? 'bg-orange-500 dark:bg-amber-500 text-black border-transparent shadow-sm'
                          : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 border-black/5 dark:border-white/5'
                      }`}
                    >
                      {lang === 'id' ? item.id : item.en}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('transform', lang)}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => onVideoSettingsChange({...videoSettings, rotation: ((videoSettings.rotation || 0) + 90) % 360})}
                    className="flex-1 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-colors"
                  >
                    <RotateCw size={14} /> {t('rotation', lang)}
                  </button>
                  <button
                    onClick={() => onVideoSettingsChange({...videoSettings, flipH: !videoSettings.flipH})}
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-colors ${videoSettings.flipH ? 'bg-orange-500 dark:bg-amber-500 text-black' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300'}`}
                  >
                    <FlipHorizontal size={14} /> {t('flipH', lang)}
                  </button>
                  <button
                    onClick={() => onVideoSettingsChange({...videoSettings, flipV: !videoSettings.flipV})}
                    className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-colors ${videoSettings.flipV ? 'bg-orange-500 dark:bg-amber-500 text-black' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300'}`}
                  >
                    <FlipVertical size={14} /> {t('flipV', lang)}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AUDIO */}
          {activeTab === 'audio' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* Audio Boost */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                    <Zap size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('audioBoost', lang)}
                  </label>
                  <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                    {(audioBoost * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={audioBoost}
                    onChange={(e) => onAudioBoostChange(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  />
                </div>
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest text-center">{t('audioBoostWarning', lang)}</p>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Normalisasi Audio */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                   <Volume2 size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('audioNormalize', lang)}
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('audioNormalize', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('audioNormalizeDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={isAudioNormalized}
                      onChange={onToggleAudioNormalize}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>

                {isAudioNormalized && (
                  <div className="p-3.5 space-y-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 mt-2 animate-fade-in">
                    {/* Threshold Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {lang === 'id' ? 'Ambang Batas (Threshold)' : 'Normalisation Threshold'}
                        </span>
                        <span className="font-mono text-orange-600 dark:text-amber-500 font-bold">
                          {normalizeThreshold} dB
                        </span>
                      </div>
                      <input 
                        type="range"
                        min="-100"
                        max="0"
                        step="1"
                        value={normalizeThreshold}
                        onChange={(e) => onNormalizeThresholdChange(parseInt(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      />
                      <span className="text-[10px] text-zinc-500 block leading-tight">
                        {lang === 'id' 
                          ? 'Menentukan batas volume di mana normalisasi mulai aktif.' 
                          : 'Determines the volume level where normalisation starts working.'}
                      </span>
                    </div>

                    {/* Makeup Gain Slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {lang === 'id' ? 'Penguatan Tambahan (Gain)' : 'Makeup Gain'}
                        </span>
                        <span className="font-mono text-orange-600 dark:text-amber-500 font-bold">
                          +{normalizeGain} dB
                        </span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={normalizeGain}
                        onChange={(e) => onNormalizeGainChange(parseFloat(e.target.value))}
                        className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      />
                      <span className="text-[10px] text-zinc-500 block leading-tight">
                        {lang === 'id' 
                          ? 'Meningkatkan volume keseluruhan setelah suara dinormalisasi.' 
                          : 'Boosts the overall volume after the audio is normalised.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Swap Stereo Channel */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                  <ArrowLeftRight size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('swapStereo', lang)}
                </label>
                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('swapStereo', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('swapStereoDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={isSwapChannels}
                      onChange={onToggleSwapChannels}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Audio Sync */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                  <Clock size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('audioSync', lang)}
                </label>
                <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2 rounded-2xl border border-black/5 dark:border-white/5">
                  <button 
                    onClick={() => onAudioDelayChange(Math.max(-5.0, Math.round((audioDelay - 0.1) * 10) / 10))}
                    className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white rounded-xl transition-all border border-black/5 dark:border-white/5 active:scale-95"
                    title="-0.1s"
                  >
                    <Minus size={16} />
                  </button>
                  
                  <div className="flex-1 flex flex-col items-center justify-center py-1">
                    <span className="text-xl font-mono font-black text-orange-600 dark:text-amber-500 tracking-tighter">
                      {audioDelay > 0 ? '+' : ''}{audioDelay.toFixed(1)}<span className="text-[10px] ml-0.5 opacity-50">S</span>
                    </span>
                    <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">{audioDelay < 0 ? t('audioDelayFaster', lang) : t('audioDelaySlower', lang)}</span>
                  </div>

                  <button 
                    onClick={() => onAudioDelayChange(Math.min(5.0, Math.round((audioDelay + 0.1) * 10) / 10))}
                    className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white rounded-xl transition-all border border-black/5 dark:border-white/5 active:scale-95"
                    title="+0.1s"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="relative flex items-center group">
                  <input 
                    type="range"
                    min="-5.0"
                    max="5.0"
                    step="0.1"
                    value={audioDelay}
                    onChange={(e) => onAudioDelayChange(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  />
                </div>
                {audioDelay < 0 && (
                  <p className="text-[8px] text-orange-500 dark:text-amber-500 text-center uppercase tracking-widest animate-pulse font-medium">
                    {t('audioSyncWarning', lang)}
                  </p>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Equalizer */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">
                  <Sliders size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('equalizer', lang)}
                </div>
                
                <div className="flex justify-between gap-4 h-40 bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5">
                  {['Bass', 'Vokal', 'Treble'].map((label, i) => (
                    <div key={label} className="flex-1 flex flex-col items-center gap-2">
                      <div className="flex-1 w-full flex justify-center relative">
                        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-black/10 dark:bg-white/10 rounded-full"></div>
                        <input 
                          type="range"
                          min="-12"
                          max="12"
                          step="1"
                          value={eqGains[i]}
                          onChange={(e) => onEqChange(i, parseInt(e.target.value))}
                          className="h-full w-6 appearance-none bg-transparent cursor-pointer accent-amber-500 vertical-range"
                          style={{ WebkitAppearance: 'slider-vertical' } as any}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-orange-600 dark:text-amber-500 font-mono text-[10px] font-bold">{eqGains[i] > 0 ? '+' : ''}{eqGains[i]}dB</p>
                        <p className="text-zinc-500 text-[8px] uppercase tracking-wider font-bold">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: PENGATURAN AI */}
          {enableAIFeatures && activeTab === 'ai' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-52">
              {/* GEMINI API KEY SECTION */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                    <Key size={14} className="text-cyan-400" />
                    <span>GEMINI API KEY</span>
                  </h4>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/60 hover:border-cyan-500/50 text-[11px] font-bold text-zinc-700 dark:text-zinc-300 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span>{lang === 'en' ? 'GET KEY' : 'AMBIL KEY'}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800/80 shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1 flex items-center">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={preferenceSettings.geminiApiKey || ''}
                      onChange={(e) =>
                        onPreferenceSettingsChange({
                          ...preferenceSettings,
                          geminiApiKey: e.target.value,
                        })
                      }
                      placeholder={lang === 'en' ? 'Enter custom Gemini API Key (AIZA...)' : 'Masukkan Gemini API Key secara manual (AIZA...)'}
                      className="w-full bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-3 pr-10 py-2.5 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                      title={showApiKey ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyApiKey}
                    disabled={apiKeyTesting}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    {apiKeyTesting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Key size={14} />
                    )}
                    <span>{lang === 'en' ? 'CHECK API' : 'CEK API'}</span>
                  </button>
                </div>

                {apiKeyStatus && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                      apiKeyStatus.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}
                  >
                    {apiKeyStatus.success ? (
                      <CheckCircle2 size={16} className="shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="shrink-0" />
                    )}
                    <span>{apiKeyStatus.message}</span>
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* BAHASA JAWABAN / RESPON */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'RESPONSE / ANSWER LANGUAGE' : 'BAHASA JAWABAN / RESPON AI'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'auto', label: lang === 'en' ? 'Auto (UI Language)' : 'Otomatis (Bahasa UI)' },
                    { id: 'id', label: 'Bahasa Indonesia' },
                    { id: 'en', label: 'English' },
                    { id: 'jp', label: 'Bahasa Jepang (日本語)' },
                    { id: 'es', label: 'Bahasa Spanyol (Español)' },
                  ].map((item) => {
                    const currentLang = preferenceSettings.aiResponseLanguage || 'auto';
                    const isSelected = currentLang === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() =>
                          onPreferenceSettingsChange({
                            ...preferenceSettings,
                            aiResponseLanguage: item.id as any,
                          })
                        }
                        className={`p-3 rounded-xl text-xs font-medium text-left border transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-orange-500/15 border-orange-500 text-orange-600 dark:text-amber-400 font-bold shadow-sm'
                            : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/10'
                        }`}
                      >
                        <span>{item.label}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-orange-500 dark:text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* PERSONA AI (MANUAL) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                    {lang === 'en' ? 'CUSTOM AI PERSONA' : 'PERSONA AI (MANUAL)'}
                  </label>
                  <span className="text-[10px] text-zinc-500 font-normal">
                    {lang === 'en' ? 'Custom role & character' : 'Peran & Karakter AI secara bebas'}
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={preferenceSettings.aiCustomPersona || ''}
                  onChange={(e) =>
                    onPreferenceSettingsChange({
                      ...preferenceSettings,
                      aiCustomPersona: e.target.value,
                    })
                  }
                  placeholder={
                    lang === 'en'
                      ? 'e.g. A passionate anime enthusiast who loves deep character analysis and witty humor...'
                      : 'e.g. Teman nonton anime yang santai, seru, humoris, dan antusias menceritakan alur cerita...'
                  }
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 text-zinc-900 dark:text-white text-xs placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 dark:focus:border-amber-500/50 transition-all resize-y min-h-[70px]"
                />
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* GAYA BAHASA / SLANG */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                    {lang === 'en' ? 'LANGUAGE STYLE & SLANG' : 'GAYA BAHASA & SLANG AI'}
                  </label>
                  <span className="text-[10px] text-zinc-500 font-normal">
                    {lang === 'en' ? 'Dialect, slang, or style' : 'Dialek, slang, atau logat'}
                  </span>
                </div>
                <input
                  type="text"
                  value={preferenceSettings.aiLanguageStyle || ''}
                  onChange={(e) =>
                    onPreferenceSettingsChange({
                      ...preferenceSettings,
                      aiLanguageStyle: e.target.value,
                    })
                  }
                  placeholder={
                    lang === 'en'
                      ? 'e.g. Casual Gen-Z slang, Friendly Bro-Talk, Formal, Sunda dialect, etc.'
                      : 'e.g. Gaul Jakarta (Lo-Gue), Slang Gen-Z, Sunda Halus, Jawa Casual, Santai tanpa sensor...'
                  }
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 dark:focus:border-amber-500/50 transition-all"
                />
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* STYLE INSTRUCTION UNTUK TTS & LIVE CALL */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block flex items-center gap-1.5">
                    <Sparkles size={12} className="text-amber-500" />
                    <span>{lang === 'en' ? 'TTS & LIVE CALL STYLE INSTRUCTION (TONE & VOICE)' : 'STYLE INSTRUCTION (PETUNJUK TONE & GAYA BICARA TTS / LIVE CALL)'}</span>
                  </label>
                  <span className="text-[10px] text-zinc-500 font-normal">
                    {lang === 'en' ? 'Speech tone, tempo, pitch, & emotion' : 'Intonasi, tempo, ekspresi, & nada suara'}
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '😊 Ramah & Ceria', val: 'Bicaralah dengan nada hangat, ramah, intonasi ceria, artikulasi jelas, tempo sedang.' },
                    { label: '🔥 Antusias & Energik', val: 'Bicaralah dengan tempo agak cepat, intonasi tinggi, gembira, antusias, penuh energi.' },
                    { label: '🌙 Lembut & Santai', val: 'Bicaralah dengan suara lembut, bernada santai, intonasi rendah, tempo agak lambat, menenangkan.' },
                    { label: '💋 Intim & Berbisik', val: 'Bicaralah dengan suara berbisik halus, bernada manja, tempo lambat, sensual dan hangat.' },
                    { label: '💼 Berwibawa & Tegas', val: 'Bicaralah dengan tempo teratur, nada tenang, tegas, artikulasi sangat jelas dan berwibawa.' },
                    { label: '🎭 Ekspresif & Dramatis', val: 'Bicaralah dengan intonasi dinamis, sangat ekspresif, dengan penekanan emosi yang kuat.' },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        onPreferenceSettingsChange({
                          ...preferenceSettings,
                          aiStyleInstruction: preset.val,
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 border border-black/5 dark:border-white/10 text-[10px] font-medium text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-400 transition-all cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={preferenceSettings.aiStyleInstruction || ''}
                  onChange={(e) =>
                    onPreferenceSettingsChange({
                      ...preferenceSettings,
                      aiStyleInstruction: e.target.value,
                    })
                  }
                  placeholder={
                    lang === 'en'
                      ? 'e.g. Speak with an enthusiastic tone, fast pace, expressive emotion, clear articulation, and energetic mood...'
                      : 'e.g. Bicaralah dengan nada gembira dan antusias, tempo sedang, artikulasi sangat jelas, intonasi dinamis, dan ekspresi hangat...'
                  }
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 text-zinc-900 dark:text-white text-xs placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:border-orange-500/50 dark:focus:border-amber-500/50 transition-all resize-y min-h-[60px]"
                />
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {lang === 'en'
                    ? 'This instruction directly controls how Gemini TTS and Live Agent speak (tone of voice, speed, pitch, and vocal emotion).'
                    : 'Petunjuk ini secara langsung mengontrol cara Gemini TTS dan Live Agent berbicara (intonasi suara, kecepatan/tempo, pitch, dan ekspresi vokal).'}
                </p>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* MODE AI (CHAT VS LIVE AGENT CALL) */}
              <div className="space-y-3">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'AI INTERACTION MODE' : 'MODE INTERAKSI AI'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'chat',
                      title: lang === 'en' ? 'Chat / Text Mode' : 'Mode Chat (Teks)',
                      desc: lang === 'en' ? 'Text conversation with optional Voice TTS button per message' : 'Diskusi teks interaktif dengan tombol Suara/TTS per balon pesan',
                    },
                    {
                      id: 'live_call',
                      title: lang === 'en' ? 'Live Agent Call' : 'Mode Live Agent Call',
                      desc: lang === 'en' ? 'Real-time automatic voice commentary and live audio response' : 'Respon suara langsung otomatis untuk percakapan panggil suara',
                    },
                  ].map((modeItem) => {
                    const currentMode = preferenceSettings.aiMode || 'chat';
                    const isSelected = currentMode === modeItem.id;
                    return (
                      <button
                        key={modeItem.id}
                        type="button"
                        onClick={() =>
                          onPreferenceSettingsChange({
                            ...preferenceSettings,
                            aiMode: modeItem.id as any,
                          })
                        }
                        className={`p-3.5 rounded-2xl text-left border transition-all flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'bg-orange-500/15 border-orange-500 text-zinc-900 dark:text-white ring-1 ring-orange-500/50'
                            : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-zinc-600 dark:text-zinc-400 hover:bg-black/10 dark:hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{modeItem.title}</span>
                          {isSelected && <CheckCircle2 size={16} className="text-orange-500 dark:text-amber-400 shrink-0" />}
                        </div>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{modeItem.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* SMART AI CONTEXT SYNC (PREDICTIVE CACHING) */}
              <div className="p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1 pr-4">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      {lang === 'en' ? 'Smart AI Context Sync' : 'Sinkronisasi Konteks Cerdas (Kamera AI)'}
                    </span>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      {lang === 'en' 
                        ? 'Predictive caching & delay buffer to prevent AI context lag.'
                        : 'Caching prediktif & safe delay buffer untuk menghindari jeda pemahaman konteks adegan AI.'}
                    </span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.aiPredictiveCaching !== false}
                      onChange={e => onPreferenceSettingsChange({...preferenceSettings, aiPredictiveCaching: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-300 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </div>

                {preferenceSettings.aiPredictiveCaching !== false && (
                  <div className="pt-2 border-t border-black/5 dark:border-white/5 grid grid-cols-2 gap-3">
                    {/* Context (predictiveMs) */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                        {lang === 'en' ? 'Context' : 'Konteks'}
                      </label>
                      <div className="flex items-center gap-1.5 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-1.5">
                        <input
                          type="number"
                          min={100}
                          max={60000}
                          step={100}
                          value={preferenceSettings.aiPredictiveMs ?? 10000}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 10000;
                            onPreferenceSettingsChange({
                              ...preferenceSettings,
                              aiPredictiveMs: Math.max(100, Math.min(60000, val))
                            });
                          }}
                          className="w-full bg-transparent text-xs font-mono text-zinc-900 dark:text-white focus:outline-none"
                        />
                        <span className="text-[10px] font-mono text-zinc-400">ms</span>
                      </div>
                    </div>

                    {/* Frame Sampling (predictiveStepMs) */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                        {lang === 'en' ? 'Frame Sampling' : 'Sampling Frame'}
                      </label>
                      <div className="flex items-center gap-1.5 bg-white/50 dark:bg-black/30 border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-1.5">
                        <input
                          type="number"
                          min={100}
                          max={30000}
                          step={100}
                          value={preferenceSettings.aiPredictiveStepMs ?? 2000}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 2000;
                            onPreferenceSettingsChange({
                              ...preferenceSettings,
                              aiPredictiveStepMs: Math.max(100, Math.min(30000, val))
                            });
                          }}
                          className="w-full bg-transparent text-xs font-mono text-zinc-900 dark:text-white focus:outline-none"
                        />
                        <span className="text-[10px] font-mono text-zinc-400">ms</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* PILIH MODEL UNTUK CHAT */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'SELECT MODEL FOR CHAT' : 'PILIH MODEL UNTUK CHAT'}
                </label>
                <button
                  type="button"
                  onClick={() => setIsChatModelDropdownOpen(!isChatModelDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiChatModel || 'gemini-3.6-flash';
                      if (val === 'gemini-3.6-flash') return `gemini-3.6-flash (${lang === 'en' ? 'Recommended - Fast & Smart' : 'Rekomendasi - Cepat & Cerdas'})`;
                      if (val === 'gemini-2.5-flash') return `gemini-2.5-flash (${lang === 'en' ? 'Ultra Fast' : 'Super Cepat'})`;
                      if (val === 'gemini-2.5-pro') return `gemini-2.5-pro (${lang === 'en' ? 'Deep Reasoning & Context' : 'Analisis Mendalam'})`;
                      return val;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isChatModelDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isChatModelDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'gemini-3.6-flash', label: `gemini-3.6-flash (${lang === 'en' ? 'Recommended - Fast & Smart' : 'Rekomendasi - Cepat & Cerdas'})` },
                      { value: 'gemini-2.5-flash', label: `gemini-2.5-flash (${lang === 'en' ? 'Ultra Fast' : 'Super Cepat'})` },
                      { value: 'gemini-2.5-pro', label: `gemini-2.5-pro (${lang === 'en' ? 'Deep Reasoning & Context' : 'Analisis Mendalam'})` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiChatModel || 'gemini-3.6-flash') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiChatModel: opt.value });
                            setIsChatModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* PILIH MODEL UNTUK LIVE CONVERSATION */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'SELECT MODEL FOR LIVE CONVERSATION' : 'PILIH MODEL UNTUK LIVE CONVERSATION'}
                </label>
                <button
                  type="button"
                  onClick={() => setIsLiveModelDropdownOpen(!isLiveModelDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiLiveModel || 'gemini-3.1-flash-live-preview';
                      if (val === 'gemini-3.1-flash-live-preview') return `gemini-3.1-flash-live-preview (${lang === 'en' ? 'Default Live Model' : 'Model Live Standar'})`;
                      if (val === 'gemini-2.5-flash-native-audio-preview-12-2025') return `gemini-2.5-flash-native-audio-preview-12-2025 (${lang === 'en' ? 'Native Audio Preview' : 'Model Native Audio'})`;
                      if (val === 'gemini-2.5-flash-native-audio-preview-09-2025') return `gemini-2.5-flash-native-audio-preview-09-2025 (${lang === 'en' ? 'Native Audio Preview' : 'Model Native Audio'})`;
                      return val;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isLiveModelDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isLiveModelDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'gemini-3.1-flash-live-preview', label: `gemini-3.1-flash-live-preview (${lang === 'en' ? 'Default Live Model' : 'Model Live Standar'})` },
                      { value: 'gemini-2.5-flash-native-audio-preview-12-2025', label: `gemini-2.5-flash-native-audio-preview-12-2025 (${lang === 'en' ? 'Native Audio Preview' : 'Model Native Audio'})` },
                      { value: 'gemini-2.5-flash-native-audio-preview-09-2025', label: `gemini-2.5-flash-native-audio-preview-09-2025 (${lang === 'en' ? 'Native Audio Preview' : 'Model Native Audio'})` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiLiveModel || 'gemini-3.1-flash-live-preview') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiLiveModel: opt.value });
                            setIsLiveModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* PILIH MODEL TTS */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'SELECT MODEL FOR TTS (SPEECH)' : 'PILIH MODEL TTS (TEXT TO SPEECH)'}
                </label>
                <button
                  type="button"
                  onClick={() => setIsTtsModelDropdownOpen(!isTtsModelDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiTtsModel || 'gemini-2.5-flash-preview-tts';
                      if (val === 'gemini-2.5-flash-preview-tts') return `gemini-2.5-flash-preview-tts (${lang === 'en' ? 'Fast Voice Model' : 'Suara Cepat'})`;
                      if (val === 'gemini-2.5-pro-preview-tts') return `gemini-2.5-pro-preview-tts (${lang === 'en' ? 'Default - High Quality Voice' : 'Default - Kualitas Suara Tinggi'})`;
                      if (val === 'gemini-3.1-flash-tts-preview') return `gemini-3.1-flash-tts-preview (${lang === 'en' ? 'TTS Voice Preview Model' : 'Model Suara TTS HD'})`;
                      return val;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isTtsModelDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isTtsModelDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'gemini-2.5-flash-preview-tts', label: `gemini-2.5-flash-preview-tts (${lang === 'en' ? 'Fast Voice Model' : 'Suara Cepat'})` },
                      { value: 'gemini-2.5-pro-preview-tts', label: `gemini-2.5-pro-preview-tts (${lang === 'en' ? 'Default - High Quality Voice' : 'Default - Kualitas Suara Tinggi'})` },
                      { value: 'gemini-3.1-flash-tts-preview', label: `gemini-3.1-flash-tts-preview (${lang === 'en' ? 'TTS Voice Preview Model' : 'Model Suara TTS HD'})` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiTtsModel || 'gemini-2.5-flash-preview-tts') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiTtsModel: opt.value });
                            setIsTtsModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* PILIH SUARA AI (VOICE) */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'AI VOICE CHARACTER (TTS / LIVE)' : 'PILIH SUARA AI (TTS / LIVE)'}
                </label>
                <button
                  type="button"
                  onClick={() => setIsVoiceDropdownOpen(!isVoiceDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <div className="flex items-center gap-2">
                    <Volume2 size={15} className="text-orange-500 dark:text-amber-400 shrink-0" />
                    <span>
                      {(() => {
                        const val = preferenceSettings.aiVoice || 'Kore';
                        if (val === 'Kore') return `Kore (${lang === 'en' ? 'Female - Natural & Warm' : 'Perempuan - Natural & Hangat'})`;
                        if (val === 'Zephyr') return `Zephyr (${lang === 'en' ? 'Female - Fast & Energetic' : 'Perempuan - Cepat & Energik'})`;
                        if (val === 'Puck') return `Puck (${lang === 'en' ? 'Male - Cheerful & Friendly' : 'Laki-laki - Ceria & Ramah'})`;
                        if (val === 'Charon') return `Charon (${lang === 'en' ? 'Male - Deep & Serious' : 'Laki-laki - Dalam & Serius'})`;
                        if (val === 'Fenrir') return `Fenrir (${lang === 'en' ? 'Male - Authoritative' : 'Laki-laki - Berwibawa & Tegas'})`;
                        if (val === 'Aoede') return `Aoede (${lang === 'en' ? 'Female - Soft & Melodic' : 'Perempuan - Halus & Merdu'})`;
                        return val;
                      })()}
                    </span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isVoiceDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isVoiceDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'Kore', label: `Kore (${lang === 'en' ? 'Female - Natural & Warm' : 'Perempuan - Natural & Hangat'})` },
                      { value: 'Zephyr', label: `Zephyr (${lang === 'en' ? 'Female - Fast & Energetic' : 'Perempuan - Cepat & Energik'})` },
                      { value: 'Puck', label: `Puck (${lang === 'en' ? 'Male - Cheerful & Friendly' : 'Laki-laki - Ceria & Ramah'})` },
                      { value: 'Charon', label: `Charon (${lang === 'en' ? 'Male - Deep & Serious' : 'Laki-laki - Dalam & Serius'})` },
                      { value: 'Fenrir', label: `Fenrir (${lang === 'en' ? 'Male - Authoritative' : 'Laki-laki - Berwibawa & Tegas'})` },
                      { value: 'Aoede', label: `Aoede (${lang === 'en' ? 'Female - Soft & Melodic' : 'Perempuan - Halus & Merdu'})` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiVoice || 'Kore') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiVoice: opt.value });
                            setIsVoiceDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* MEDIA RESOLUTION */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'MEDIA RESOLUTION (VIDEO FRAME CAPTURE)' : 'RESOLUSI MEDIA (FRAME CAPTURE VIDEO)'}
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lang === 'en'
                    ? 'Lower media resolution avoids safety blocks and uses fewer tokens.'
                    : 'Resolusi rendah mencegah pemblokiran filter visual & menghemat kuota token.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsMediaResDropdownOpen(!isMediaResDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiMediaResolution || 'low';
                      if (val === 'low') return `LOW - ${lang === 'en' ? 'Default (Safe & Uncensored Optimal)' : 'Default (Hemat Token & Bebas Blokir)'}`;
                      if (val === 'medium') return `MEDIUM - ${lang === 'en' ? 'Balanced Detail' : 'Kualitas Standar'}`;
                      if (val === 'high') return `HIGH - ${lang === 'en' ? 'High Detail Image' : 'Detail Gambar Tinggi'}`;
                      return val;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isMediaResDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isMediaResDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'low', label: `LOW - ${lang === 'en' ? 'Default (Safe & Uncensored Optimal)' : 'Default (Hemat Token & Bebas Blokir)'}` },
                      { value: 'medium', label: `MEDIUM - ${lang === 'en' ? 'Balanced Detail' : 'Kualitas Standar'}` },
                      { value: 'high', label: `HIGH - ${lang === 'en' ? 'High Detail Image' : 'Detail Gambar Tinggi'}` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiMediaResolution || 'low') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiMediaResolution: opt.value as any });
                            setIsMediaResDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* TEMPERATURE */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'TEMPERATURE (CREATIVITY & MOOD)' : 'TEMPERATURE (SUHU KREATIVITAS & MOOD)'}
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lang === 'en'
                    ? 'Controls response randomness and emotional expression.'
                    : 'Mengontrol tingkat variasi & kebebasan ekspresi suasana AI.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsTemperatureDropdownOpen(!isTemperatureDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiTemperature ?? 0.85;
                      if (val === 0.85) return `0.85 - ${lang === 'en' ? 'Default (Uncensored & Natural Roleplay)' : 'Default (Optimal Roleplay & Suasana Alami)'}`;
                      if (val === 0.7) return `0.70 - ${lang === 'en' ? 'Balanced & Consistent' : 'Konsisten & Teratur'}`;
                      if (val === 1.0) return `1.00 - ${lang === 'en' ? 'High Variety & Very Expressive' : 'Sangat Kreatif & Bervariasi'}`;
                      if (val === 0.5) return `0.50 - ${lang === 'en' ? 'Strict & Concise' : 'Ringkas & Sangat Terfokus'}`;
                      return `${val}`;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isTemperatureDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isTemperatureDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 0.85, label: `0.85 - ${lang === 'en' ? 'Default (Uncensored & Natural Roleplay)' : 'Default (Optimal Roleplay & Suasana Alami)'}` },
                      { value: 0.7, label: `0.70 - ${lang === 'en' ? 'Balanced & Consistent' : 'Konsisten & Teratur'}` },
                      { value: 1.0, label: `1.00 - ${lang === 'en' ? 'High Variety & Very Expressive' : 'Sangat Kreatif & Bervariasi'}` },
                      { value: 0.5, label: `0.50 - ${lang === 'en' ? 'Strict & Concise' : 'Ringkas & Sangat Terfokus'}` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiTemperature ?? 0.85) === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiTemperature: opt.value });
                            setIsTemperatureDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* SAFETY SETTINGS */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'SAFETY SETTINGS (CONTENT FILTERING)' : 'SAFETY SETTINGS (FILTER KEAMANAN MODEL)'}
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lang === 'en'
                    ? 'Disabling safety blocks allows open roleplay without refusals.'
                    : 'Pengaturan BLOCK_NONE menonaktifkan blokir otomatis untuk konteks bebas & roleplay.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsSafetyDropdownOpen(!isSafetyDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiSafetySettings || 'block_none';
                      if (val === 'block_none') return `BLOCK_NONE - ${lang === 'en' ? 'Default (Uncensored / No Blocking)' : 'Default (Bebas Blokir / Mode Terbuka)'}`;
                      if (val === 'block_few') return `BLOCK_ONLY_HIGH - ${lang === 'en' ? 'Filter Severe Danger Only' : 'Filter Konten Bahaya Utama'}`;
                      return val;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isSafetyDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isSafetyDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'block_none', label: `BLOCK_NONE - ${lang === 'en' ? 'Default (Uncensored / No Blocking)' : 'Default (Bebas Blokir / Mode Terbuka)'}` },
                      { value: 'block_few', label: `BLOCK_ONLY_HIGH - ${lang === 'en' ? 'Filter Severe Danger Only' : 'Filter Konten Bahaya Utama'}` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiSafetySettings || 'block_none') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiSafetySettings: opt.value as any });
                            setIsSafetyDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* THINKING LEVEL */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'THINKING LEVEL / BUDGET' : 'THINKING LEVEL / BUDGET (PENALARAN INTERNAL)'}
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lang === 'en'
                    ? 'Setting Thinking Level to OFF (0 budget) prevents internal self-censorship loops.'
                    : 'Mematikan Thinking Budget (OFF / 0) mencegah pertimbangan kaku & penolakan otomatis.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsThinkingDropdownOpen(!isThinkingDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiThinkingLevel || 'off';
                      if (val === 'off') return `OFF (0 Budget) - ${lang === 'en' ? 'Default (Fast & No Internal Refusal)' : 'Default (Langsung Respon & Bebas Blokir Internal)'}`;
                      if (val === 'low') return `LOW (512 Budget) - ${lang === 'en' ? 'Light Reasoning' : 'Penalaran Ringan'}`;
                      if (val === 'high') return `HIGH (2048 Budget) - ${lang === 'en' ? 'Deep Context Analysis' : 'Analisis Mendalam'}`;
                      return val;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isThinkingDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isThinkingDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 'off', label: `OFF (0 Budget) - ${lang === 'en' ? 'Default (Fast & No Internal Refusal)' : 'Default (Langsung Respon & Bebas Blokir Internal)'}` },
                      { value: 'low', label: `LOW (512 Budget) - ${lang === 'en' ? 'Light Reasoning' : 'Penalaran Ringan'}` },
                      { value: 'high', label: `HIGH (2048 Budget) - ${lang === 'en' ? 'Deep Context Analysis' : 'Analisis Mendalam'}` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiThinkingLevel || 'off') === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiThinkingLevel: opt.value as any });
                            setIsThinkingDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* MAX OUTPUT TOKENS */}
              <div className="space-y-3 relative dropdown-container">
                <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] block">
                  {lang === 'en' ? 'MAX OUTPUT TOKENS (RESPONSE LENGTH)' : 'MAX OUTPUT TOKENS (PANJANG RESPON MAKSIMUM)'}
                </label>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lang === 'en'
                    ? 'Limits maximum token length per AI response.'
                    : 'Batas panjang maksimum kalimat yang dihasilkan AI per balasan.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsMaxTokensDropdownOpen(!isMaxTokensDropdownOpen)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-zinc-900 dark:text-white text-xs font-mono font-medium flex items-center justify-between hover:border-orange-500/50 dark:hover:border-amber-500/50 transition-all text-left"
                >
                  <span>
                    {(() => {
                      const val = preferenceSettings.aiMaxOutputTokens ?? 2048;
                      if (val === 2048) return `2048 Tokens - ${lang === 'en' ? 'Default (Balanced Length)' : 'Default (Panjang Ideal & Stabil)'}`;
                      if (val === 1024) return `1024 Tokens - ${lang === 'en' ? 'Short & Direct' : 'Singkat & Cepat'}`;
                      if (val === 4096) return `4096 Tokens - ${lang === 'en' ? 'Detailed & Extended' : 'Panjang & Sangat Detail'}`;
                      return `${val} Tokens`;
                    })()}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-500 dark:text-zinc-400 transition-transform duration-200 shrink-0 ${isMaxTokensDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isMaxTokensDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-[#120a06] border border-black/10 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-40 py-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 animate-in fade-in slide-in-from-top-2 duration-150">
                    {[
                      { value: 2048, label: `2048 Tokens - ${lang === 'en' ? 'Default (Balanced Length)' : 'Default (Panjang Ideal & Stabil)'}` },
                      { value: 1024, label: `1024 Tokens - ${lang === 'en' ? 'Short & Direct' : 'Singkat & Cepat'}` },
                      { value: 4096, label: `4096 Tokens - ${lang === 'en' ? 'Detailed & Extended' : 'Panjang & Sangat Detail'}` },
                    ].map((opt) => {
                      const isSelected = (preferenceSettings.aiMaxOutputTokens ?? 2048) === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            onPreferenceSettingsChange({ ...preferenceSettings, aiMaxOutputTokens: opt.value });
                            setIsMaxTokensDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                            isSelected
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 font-bold'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500 dark:bg-amber-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: LAINNYA */}
          {activeTab === 'lainnya' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Save size={14} /> {t('autoSave', lang)}
                </h4>
                
                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('saveResumeStatus', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('saveResumeDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.saveResume}
                      onChange={e => onPreferenceSettingsChange({...preferenceSettings, saveResume: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>

                {preferenceSettings.saveResume && (
                  <div className="space-y-2 pl-2 border-l-2 border-orange-500/30 dark:border-amber-500/30 my-1">
                    <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('alwaysAutoResume', lang)}</span>
                        <span className="text-[10px] text-zinc-500">{t('alwaysAutoResumeDesc', lang)}</span>
                      </div>
                      <div className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={!!preferenceSettings.alwaysAutoResume}
                          onChange={e => onPreferenceSettingsChange({...preferenceSettings, alwaysAutoResume: e.target.checked})}
                        />
                        <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                      </div>
                    </label>

                    {!preferenceSettings.alwaysAutoResume && (
                      <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('showResumeConfirmation', lang)}</span>
                          <span className="text-[10px] text-zinc-500">{t('showResumeConfirmationDesc', lang)}</span>
                        </div>
                        <div className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={preferenceSettings.showResumeConfirmation !== false}
                            onChange={e => onPreferenceSettingsChange({...preferenceSettings, showResumeConfirmation: e.target.checked})}
                          />
                          <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                        </div>
                      </label>
                    )}
                  </div>
                )}

                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('saveMarkers', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('saveMarkersDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.saveMarkers}
                      onChange={e => onPreferenceSettingsChange({...preferenceSettings, saveMarkers: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('saveLoops', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('saveLoopsDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.saveLoops}
                      onChange={e => onPreferenceSettingsChange({...preferenceSettings, saveLoops: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('playDownloadSoundStatus', lang)}</span>
                    <span className="text-[10px] text-zinc-500">{t('playDownloadSoundDesc', lang)}</span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.playDownloadSound !== false}
                      onChange={e => onPreferenceSettingsChange({...preferenceSettings, playDownloadSound: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>

                {/* AI Features Module Toggle */}
                {onToggleAIFeatures && (
                  <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                    <div className="flex flex-col pr-4">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className={enableAIFeatures ? "text-cyan-500" : "text-zinc-400"} />
                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('enableAIFeaturesTitle', lang)}</span>
                        {!enableAIFeatures && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase bg-rose-500/10 text-rose-500 border border-rose-500/20">
                            {t('aiFeaturesDisabledBadge', lang)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-0.5">{t('enableAIFeaturesDesc', lang)}</span>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={enableAIFeatures}
                        onChange={e => onToggleAIFeatures(e.target.checked)}
                      />
                      <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                    </div>
                  </label>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Hardware Acceleration & Video Diagnostics */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Cpu size={14} /> {lang === 'id' ? 'Akselerasi Perangkat Keras' : 'Hardware Acceleration'}
                </h4>

                <label className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      {lang === 'id' ? 'Aktifkan Akselerasi HW' : 'Enable HW Acceleration'}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {lang === 'id' 
                        ? 'Gunakan decoding kartu grafis (GPU) untuk pemutaran file 4K / VR yang mulus.' 
                        : 'Use graphics card (GPU) decoding for smooth 4K / VR file playback.'}
                    </span>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={preferenceSettings.hardwareAcceleration !== false}
                      onChange={e => onPreferenceSettingsChange({
                        ...preferenceSettings, 
                        hardwareAcceleration: e.target.checked
                      })}
                    />
                    <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
                  </div>
                </label>

                {/* Diagnostics Area */}
                {hardwareDiagnostics && (
                  <div className="p-4 rounded-2xl bg-orange-500/5 dark:bg-amber-500/5 border border-orange-500/10 dark:border-amber-500/10 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity size={12} className="text-orange-500 dark:text-amber-500 animate-pulse" />
                        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
                          {lang === 'id' ? 'Diagnostik Media' : 'Media Diagnostics'}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                        {hardwareDiagnostics.codec}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-medium">
                      <div className="p-2 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-between">
                        <span className="text-zinc-500">{lang === 'id' ? 'Kapasitas 4K:' : '4K Support:'}</span>
                        <span className={hardwareDiagnostics.supported ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                          {hardwareDiagnostics.supported ? (lang === 'id' ? 'Didukung' : 'Supported') : (lang === 'id' ? 'Tidak' : 'No')}
                        </span>
                      </div>
                      <div className="p-2 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-between">
                        <span className="text-zinc-500">{lang === 'id' ? 'Lancar (Smooth):' : 'Smooth Decoding:'}</span>
                        <span className={hardwareDiagnostics.smooth ? "text-green-500 font-bold" : "text-amber-500 font-bold animate-pulse"}>
                          {hardwareDiagnostics.smooth ? (lang === 'id' ? 'Ya' : 'Yes') : (lang === 'id' ? 'Patah-patah' : 'Stuttery')}
                        </span>
                      </div>
                    </div>

                    <div className="text-[9px] leading-relaxed text-zinc-500 border-t border-black/5 dark:border-white/5 pt-2">
                      {hardwareDiagnostics.powerEfficient ? (
                        <p className="text-green-500/90 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
                          {lang === 'id' 
                            ? 'Akselerasi Perangkat Keras didukung penuh & hemat daya.' 
                            : 'Hardware Acceleration is fully supported & power efficient.'}
                        </p>
                      ) : (
                        <div className="text-amber-500/95 flex flex-col gap-0.5">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 animate-pulse"></span>
                            {lang === 'id' 
                              ? 'Akselerasi Perangkat Keras mungkin tidak optimal / fallback ke CPU.' 
                              : 'Hardware Acceleration may be sub-optimal or fallback to CPU.'}
                          </span>
                          <span className="text-zinc-500 pl-2.5">
                            {lang === 'id' 
                              ? 'Hal ini menyebabkan pemutaran berkas lokal 4K VR terasa berat/lambat dibanding HLS.' 
                              : 'This makes playback of local 4K VR files feel heavier/slower than HLS streams.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Bahasa (Language) Switcher */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Settings size={14} /> {t('language', lang)}
                </h4>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => onPreferenceSettingsChange({...preferenceSettings, language: 'id'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${(!preferenceSettings.language || preferenceSettings.language === 'id') ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    Bahasa Indonesia
                  </button>
                  <button
                    onClick={() => onPreferenceSettingsChange({...preferenceSettings, language: 'en'})}
                    className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${preferenceSettings.language === 'en' ? 'bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border-orange-500/30 dark:border-amber-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]' : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-transparent hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    English
                  </button>
                </div>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Backup & Reset */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Database size={14} /> {t('backupReset', lang)}
                </h4>
                
                {/* Export Data Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors gap-3">
                  <div className="flex flex-col flex-1">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('exportData', lang)}</span>
                    <span className="text-[10px] text-zinc-500 leading-normal mt-0.5">{t('exportDataDesc', lang)}</span>
                  </div>
                  <button
                    onClick={handleExportData}
                    className="flex items-center justify-center gap-2 self-start sm:self-center bg-orange-500 hover:bg-orange-400 dark:bg-amber-500 dark:hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-md hover:shadow-orange-500/10 active:scale-[0.97]"
                  >
                    <Download size={14} />
                    <span>{t('exportData', lang)}</span>
                  </button>
                </div>

                {/* Import Data Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors gap-3">
                  <div className="flex flex-col flex-1">
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t('importData', lang)}</span>
                    <span className="text-[10px] text-zinc-500 leading-normal mt-0.5">{t('importDataDesc', lang)}</span>
                  </div>
                  <button
                    onClick={handleImportData}
                    className="flex items-center justify-center gap-2 self-start sm:self-center bg-orange-500/10 hover:bg-orange-500 dark:bg-amber-500/10 dark:hover:bg-amber-500 border border-orange-500/20 hover:border-transparent text-orange-600 dark:text-amber-500 hover:text-black dark:hover:text-black font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.97]"
                  >
                    <Upload size={14} />
                    <span>{t('importData', lang)}</span>
                  </button>
                </div>

                {/* Reset Settings Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors gap-3">
                  <div className="flex flex-col flex-1">
                    <span className="text-sm font-bold text-red-600 dark:text-red-400">{t('resetSettings', lang)}</span>
                    <span className="text-[10px] text-zinc-500 leading-normal mt-0.5">{t('resetSettingsDesc', lang)}</span>
                  </div>
                  <button
                    onClick={handleResetData}
                    className="flex items-center justify-center gap-2 self-start sm:self-center bg-red-600/10 hover:bg-red-600 dark:bg-red-500/10 dark:hover:bg-red-500 border border-red-500/20 hover:border-transparent text-red-600 dark:text-red-400 hover:text-white dark:hover:text-black font-extrabold text-xs uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all active:scale-[0.97]"
                  >
                    <Trash2 size={14} />
                    <span>{t('resetSettings', lang)}</span>
                  </button>
                </div>
              </div>

              <div className="h-px bg-black/5 dark:bg-white/5"></div>

              {/* Windows 11 SmartScreen / Unknown Publisher Info Card */}
              <div className="space-y-3 p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    {lang === 'en' ? 'Windows 11 "App Blocked / Unknown Publisher" Fix' : 'Panduan "App Blocked / Unknown Publisher" Windows 11'}
                  </h4>
                </div>
                <p className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {lang === 'en'
                    ? 'Standard open-source Windows installers without expensive EV certificates are flagged as "Unknown Publisher" by Windows Defender SmartScreen.'
                    : 'Aplikasi independen tanpa Sertifikat Digital berbayar sering ditandai "Unknown Publisher" oleh Windows Defender SmartScreen.'}
                </p>
                <div className="space-y-1.5 text-[11px] font-medium bg-black/5 dark:bg-black/30 p-3 rounded-xl border border-black/5 dark:border-white/5">
                  <div className="font-bold text-amber-600 dark:text-amber-400 text-[10px] uppercase tracking-wider mb-1">
                    {lang === 'en' ? 'How to install on Windows 11:' : 'Cara Install di Windows 11:'}
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold font-mono text-amber-500">1.</span>
                    <span>{lang === 'en' ? 'When the SmartScreen warning appears, click "More Info".' : 'Saat peringatan SmartScreen muncul, klik "Info Selengkapnya" (More info).'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold font-mono text-amber-500">2.</span>
                    <span>{lang === 'en' ? 'Click "Run anyway".' : 'Klik tombol "Tetap Jalankan" (Run anyway).'}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold font-mono text-amber-500">3.</span>
                    <span>{lang === 'en' ? 'Or Right-Click setup.exe -> Properties -> Check "Unblock" at the bottom -> Apply.' : 'Atau Klik Kanan file .exe -> Properties -> Centang "Unblock" (Buka Blokir) -> Apply.'}</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 italic">
                  * {lang === 'en' ? 'NightHUB installer is optimized with per-user (asInvoker) install to prevent UAC administrator blocks.' : 'NightHUB installer telah dikonfigurasi dengan mode per-user (asInvoker) untuk menghindari blokir UAC Administrator.'}
                </p>
              </div>
            </div>
          )}

          </div>
        </div>

        <button 
          onClick={onClose} 
          className="w-full mt-6 shrink-0 bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-black py-4 rounded-2xl transition-all text-xs uppercase tracking-[0.3em] active:scale-[0.98]"
        >
          {t('close', lang)}
        </button>
      </motion.div>

      {customDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-auto bg-black/60 dark:bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#f9f6f0] dark:bg-[#0c0704] border border-black/10 dark:border-orange-500/10 rounded-[2.5rem] p-6 sm:p-8 max-w-md w-full shadow-[0_25px_60px_rgba(0,0,0,0.6)] flex flex-col items-center text-center gap-6 border-t-4 border-t-orange-500 dark:border-t-amber-500 relative overflow-hidden">
            {customDialog.type === 'success' && (
              <div className="p-4 bg-green-500/10 rounded-full text-green-600 dark:text-green-400">
                <CheckCircle2 size={36} />
              </div>
            )}
            {customDialog.type === 'error' && (
              <div className="p-4 bg-red-500/10 rounded-full text-red-600 dark:text-red-400">
                <XCircle size={36} />
              </div>
            )}
            {(customDialog.type === 'confirm' || customDialog.type === 'warning') && (
              <div className="p-4 bg-orange-500/10 rounded-full text-orange-600 dark:text-amber-500 animate-pulse">
                <AlertTriangle size={36} />
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50">
                {customDialog.title}
              </h3>
              <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                {customDialog.message}
              </p>
            </div>

            <div className="flex items-center gap-3 w-full mt-2">
              {customDialog.onCancel && (
                <button
                  onClick={() => {
                    customDialog.onCancel?.();
                    setCustomDialog(null);
                  }}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-zinc-700 dark:text-zinc-300 font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.97]"
                >
                  {t('cancelBtn', lang)}
                </button>
              )}
              <button
                onClick={() => {
                  const onConf = customDialog.onConfirm;
                  setCustomDialog(null);
                  if (onConf) {
                    onConf();
                  }
                }}
                className={`flex-1 py-3.5 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.97] ${
                  customDialog.type === 'warning'
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-orange-500 hover:bg-orange-400 dark:bg-amber-500 dark:hover:bg-amber-400 text-black'
                }`}
              >
                {customDialog.onConfirm ? (customDialog.type === 'warning' ? t('resetBtn', lang) : t('confirmBtn', lang)) : t('okBtn', lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AES-256 Decrypt Modal for Encrypted Backup Files */}
      {decryptModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pointer-events-auto bg-black/60 dark:bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#f9f6f0] dark:bg-[#0c0704] border border-black/10 dark:border-amber-500/20 rounded-[2.5rem] p-6 sm:p-8 max-w-md w-full shadow-[0_25px_60px_rgba(0,0,0,0.6)] flex flex-col items-center text-center gap-5 border-t-4 border-t-amber-500 relative overflow-hidden">
            <div className="p-4 bg-amber-500/10 rounded-full text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <ShieldCheck size={36} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {lang === 'en' ? 'Encrypted Backup File' : 'File Cadangan Terenkripsi'}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 font-mono font-bold border border-amber-500/30">
                  AES-256
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium">
                {lang === 'en'
                  ? 'This backup is protected with AES-256-GCM encryption. Enter the master password to unlock and restore.'
                  : 'File cadangan ini dilindungi enkripsi AES-256-GCM. Masukkan kata sandi master untuk mendekripsi dan memulihkan data.'}
              </p>
            </div>

            {/* Hint if present */}
            {decryptModal.hint && (
              <div className="w-full p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 text-left">
                <Key size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate">
                  <strong>{lang === 'en' ? 'Password Hint:' : 'Petunjuk Sandi:'}</strong> {decryptModal.hint}
                </span>
              </div>
            )}

            {/* Password Input */}
            <div className="w-full text-left space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {lang === 'en' ? 'Master Password' : 'Kata Sandi Master'}
              </label>
              <div className="relative">
                <input
                  type={showDecryptPassword ? 'text' : 'password'}
                  value={decryptPassword}
                  onChange={(e) => {
                    setDecryptPassword(e.target.value);
                    setDecryptError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handlePerformDecrypt();
                    }
                  }}
                  placeholder={lang === 'en' ? 'Enter master password...' : 'Masukkan kata sandi master...'}
                  autoFocus
                  className="w-full pl-3 pr-10 py-3 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDecryptPassword(!showDecryptPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  {showDecryptPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {decryptError && (
                <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl mt-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{decryptError}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 w-full mt-2">
              <button
                type="button"
                onClick={() => {
                  setDecryptModal(null);
                  setDecryptPassword('');
                  setDecryptError(null);
                }}
                disabled={decrypting}
                className="flex-1 py-3 px-4 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-zinc-700 dark:text-zinc-300 font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.97] cursor-pointer"
              >
                {t('cancelBtn', lang)}
              </button>
              <button
                type="button"
                onClick={handlePerformDecrypt}
                disabled={decrypting || !decryptPassword}
                className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer flex items-center justify-center gap-2 shadow-md"
              >
                {decrypting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>{lang === 'en' ? 'Decrypting...' : 'Mendekripsi...'}</span>
                  </>
                ) : (
                  <>
                    <Unlock size={14} />
                    <span>{lang === 'en' ? 'Decrypt & Restore' : 'Buka & Pulihkan'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Granular Selective Export Modal */}
      <ExportDataModal
        show={showExportModal}
        onClose={() => setShowExportModal(false)}
        lang={lang}
        onSuccessNotice={(msg) => {
          setCustomDialog({
            type: 'success',
            title: t('exportSuccessTitle', lang),
            message: msg
          });
        }}
      />
    </div>
  );
};
