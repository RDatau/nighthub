import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, Maximize, Minimize, FileVideo, ListVideo, MessageSquare, Settings, Repeat, X, Plus, Gauge, Info, Subtitles, Search, Save, Download, Link, Camera, Video, Shuffle, Repeat1, LayoutGrid, List, BookmarkPlus, MapPin, Trash2, FolderOpen, PictureInPicture2, AlertCircle, CheckCircle2, Move } from 'lucide-react';
import MediaInfoFactory from 'mediainfo.js';

import { DragOverlay } from './components/DragOverlay';
import { OSD } from './components/OSD';
import { EmptyState } from './components/EmptyState';
import { ContextMenu } from './components/ContextMenu';
import { NetworkStreamModal } from './components/NetworkStreamModal';
import { SaveCollectionModal } from './components/SaveCollectionModal';
import { SavedCollection } from './components/LoadCollectionModal';
import { AddMarkerModal } from './components/AddMarkerModal';
import { AddLoopModal } from './components/AddLoopModal';
import { MarkerListModal } from './components/MarkerListModal';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import { SubtitleBrowserSidebar } from './components/SubtitleBrowserSidebar';
import { SettingsModal } from './components/SettingsModal';
import { AboutModal } from './components/AboutModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { MemoryManagerModal } from './components/MemoryManagerModal';
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { ResumeOverlay } from './components/ResumeOverlay';
import { WebSnifferModal } from './components/WebSnifferModal';
import { AILiveCompanionModal } from './components/AILiveCompanionModal';
import { TopControls } from './components/TopControls';
import { BottomControls } from './components/BottomControls';
import { AmbientGlow } from './components/AmbientGlow';
import { FrameInterpolator } from './components/FrameInterpolator';
import { Video360Viewer } from './components/Video360Viewer';
import { SubtitleItem } from './components/SubtitleItem';
import { ElegantMarker, CustomMarkerIcon } from './components/Icons';
import { TitleBar } from './components/TitleBar';

import { dbService, VideoMarker, SavedLoop, AppearanceSettings, VideoSettings, PreferenceSettings, VideoMetadata, MpvInterpolationSettings } from './services/db';
import { isAudioMedia, isSameMediaFile, getMediaFileKey } from './services/mediaUtils';
import { getLocalTimestampStrings, resolveBrowserDownloadName, getRealFilePath } from './services/fileUtils';
import { usePlayer } from './hooks/usePlayer';
import { usePlaylist } from './hooks/usePlaylist';
import { useSubtitles } from './hooks/useSubtitles';
import { useElectron } from './hooks/useElectron';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { matchesCommand } from './services/shortcutManager';
import { t, Language } from './services/i18n';

const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function renderFormattedText(text: string): React.ReactNode {
  if (!text) return '';
  
  // Normalize pseudo-tags first
  const normalizedText = text
    .replace(/\{i\}/gi, '<i>')
    .replace(/\{\/i\}/gi, '</i>')
    .replace(/\{b\}/gi, '<b>')
    .replace(/\{\/b\}/gi, '</b>')
    .replace(/\{u\}/gi, '<u>')
    .replace(/\{\/u\}/gi, '</u>')
    .replace(/\{\\i1\}/gi, '<i>')
    .replace(/\{\\i0\}/gi, '</i>')
    .replace(/\{\\b1\}/gi, '<b>')
    .replace(/\{\\b0\}/gi, '</b>')
    .replace(/\{\\u1\}/gi, '<u>')
    .replace(/\{\\u0\}/gi, '</u>')
    .replace(/\{\\i\}/gi, '<i>')
    .replace(/\{\\b\}/gi, '<b>')
    .replace(/\{\\u\}/gi, '<u>');

  // Split by HTML tags
  const parts = normalizedText.split(/(<\/?[a-zA-Z0-9]+(?:\s+[^>]*)?>)/gi);
  if (parts.length === 1) return normalizedText;

  interface StyleState {
    italic: boolean;
    bold: boolean;
    underline: boolean;
    color: string | null;
  }

  const stack: StyleState[] = [{
    italic: false,
    bold: false,
    underline: false,
    color: null
  }];

  const result: React.ReactNode[] = [];

  parts.forEach((part, index) => {
    if (!part) return;

    const isTag = part.startsWith('<') && part.endsWith('>');
    if (isTag) {
      const lowerPart = part.toLowerCase();
      const isClosing = lowerPart.startsWith('</');
      
      if (isClosing) {
        // Pop from stack if we can
        if (stack.length > 1) {
          stack.pop();
        }
      } else {
        // It's an opening tag. Get current top state.
        const current = stack[stack.length - 1];
        const nextState = { ...current };

        if (lowerPart.startsWith('<i') && (lowerPart[2] === '>' || lowerPart[2] === ' ')) {
          nextState.italic = true;
        } else if (lowerPart.startsWith('<b') && (lowerPart[2] === '>' || lowerPart[2] === ' ')) {
          nextState.bold = true;
        } else if (lowerPart.startsWith('<u') && (lowerPart[2] === '>' || lowerPart[2] === ' ')) {
          nextState.underline = true;
        } else if (lowerPart.startsWith('<font')) {
          // Extract color attribute
          const colorMatch = part.match(/color\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+))/i);
          if (colorMatch) {
            nextState.color = colorMatch[1] || colorMatch[2] || colorMatch[3];
          }
        }
        stack.push(nextState);
      }
    } else {
      // It's a text content. Render it with the current style on top of the stack.
      const current = stack[stack.length - 1];
      let node: React.ReactNode = part;

      if (current.italic) {
        node = <em key={`i-${index}`} className="not-italic italic">{node}</em>;
      }
      if (current.bold) {
        node = <strong key={`b-${index}`} className="font-bold">{node}</strong>;
      }
      if (current.underline) {
        node = <u key={`u-${index}`} className="underline">{node}</u>;
      }
      if (current.color) {
        node = <span key={`c-${index}`} style={{ color: current.color }}>{node}</span>;
      }

      result.push(<span key={index}>{node}</span>);
    }
  });

  return result;
}

function playNotificationSound(type: 'success' | 'failure' = 'success') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const playNote = (frequency: number, startTime: number, duration: number, oscType: 'sine' | 'square' | 'sawtooth' | 'triangle' = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = oscType;
      osc.frequency.setValueAtTime(frequency, startTime);
      
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(type === 'failure' ? 0.08 : 0.12, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    const now = ctx.currentTime;
    if (type === 'success') {
      playNote(659.25, now, 0.4);
      playNote(880.00, now + 0.12, 0.6);
    } else {
      // Failure alert: Two distinct descending warning tones using triangle wave
      playNote(293.66, now, 0.25, 'triangle');
      playNote(220.00, now + 0.18, 0.45, 'triangle');
    }
  } catch (error) {
    console.error('Failed to play notification sound:', error);
  }
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const subBrowserListRef = useRef<HTMLDivElement>(null);

  const { isElectron, logToMain, getFs, getPath, getIpcRenderer } = useElectron();
  const electron = useElectron();
  
  const [preferenceSettings, setPreferenceSettings] = useState<PreferenceSettings>({ 
    saveResume: true, 
    saveMarkers: true, 
    saveLoops: true, 
    showResumeConfirmation: true,
    language: 'id', 
    playDownloadSound: true, 
    showLoopsOnHome: true, 
    aiLiveModel: 'gemini-3.1-flash-live-preview',
    videoTransition: 'crossfade',
    videoTransitionDuration: 500
  });
  const preferenceSettingsRef = useRef(preferenceSettings);
  useEffect(() => {
    preferenceSettingsRef.current = preferenceSettings;
  }, [preferenceSettings]);

  useEffect(() => {
    document.title = 'NightHUB Player';
  }, []);

  const player = usePlayer(videoRef, preferenceSettings.language || 'id');
  const playlist = usePlaylist();
  const subtitles = useSubtitles();
  const openedViaShortcutRef = useRef(false);
  const openedFileViaIpcRef = useRef(false);

  const playlistRef = useRef(playlist);
  const subtitlesRef = useRef(subtitles);
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);
  useEffect(() => {
    subtitlesRef.current = subtitles;
  }, [subtitles]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (ipc) {
      const useMultiPart = localStorage.getItem('useMultiPart') === 'true';
      ipc.send('set-multipart-download', useMultiPart);
    }
  }, [getIpcRenderer]);

  // UI States
  const [showPlayer, setShowPlayer] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [enableAIFeatures, setEnableAIFeatures] = useState<boolean>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('nighthub_enable_ai') !== 'false';
    }
    return true;
  });
  const [showAILive, setShowAILive] = useState(false);
  const [isAIPinned, setIsAIPinned] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showSubSettings, setShowSubSettings] = useState(false);
  const [showSubBrowser, setShowSubBrowser] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [networkUrl, setNetworkUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [savedCollections, setSavedCollections] = useState<SavedCollection[]>([]);
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });
  const [isScrubbing, setIsScrubbing] = useState(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const dragTimeoutRef = useRef<any>(null);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number>(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showResumeOverlay, setShowResumeOverlay] = useState(false);
  const [savedTime, setSavedTime] = useState<number | null>(null);
  const [markers, setMarkers] = useState<VideoMarker[]>([]);
  const [showMarkerInput, setShowMarkerInput] = useState(false);
  const [markerInputLabel, setMarkerInputLabel] = useState('');
  const [pendingMarkerTime, setPendingMarkerTime] = useState(0);
  const [showMarkerList, setShowMarkerList] = useState(false);
  const [savedLoops, setSavedLoops] = useState<SavedLoop[]>([]);
  const [showLoopInput, setShowLoopInput] = useState(false);
  const [loopInputLabel, setLoopInputLabel] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState<number | null>(null);
  const [showWebSniffer, setShowWebSniffer] = useState(false);
  const [snifferInitialUrl, setSnifferInitialUrl] = useState<string | null>(null);
  const showWebSnifferRef = useRef(showWebSniffer);
  useEffect(() => {
    showWebSnifferRef.current = showWebSniffer;
  }, [showWebSniffer]);

  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);
  const [isEnhance, setIsEnhance] = useState(false);
  const [isSuperRes, setIsSuperRes] = useState(false);
  const [isAmbientMode, setIsAmbientMode] = useState(true);
  const [isFrameInterpolation, setIsFrameInterpolation] = useState(false);
  const [interpolationEngine, setInterpolationEngine] = useState<'canvas_light' | 'libmpv'>('canvas_light');
  const [interpolationMode, setInterpolationMode] = useState<'optical_flow' | 'temporal_blend'>('optical_flow');
  const [mpvSettings, setMpvSettings] = useState<MpvInterpolationSettings>({
    tscale: 'oversample',
    videoSync: 'display-resample',
    enableSvp: true,
    useMvtools: true,
    mvtoolsFps: 60,
    mvtoolsMode: 'flow',
    hwdec: 'auto-safe',
    customPath: ''
  });
  const [isMpvRunning, setIsMpvRunning] = useState(false);
  const [isInterpolatorActive, setIsInterpolatorActive] = useState(false);
  const [is360Mode, setIs360Mode] = useState(false);
  const [projectionMode, setProjectionMode] = useState('Equirectangular');
  const [stereoMode, setStereoMode] = useState('2D');
  const [appearanceSettings, setAppearanceSettings] = useState<AppearanceSettings>({ blur: 10, transparency: 0.5, themeMode: 'auto' });

  // Theme management effect
  useEffect(() => {
    const mode = appearanceSettings.themeMode || 'auto';
    const applyTheme = () => {
      if (mode === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (mode === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // Auto (Sesuai System)
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemPrefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }

      // Notify Electron about theme change
      try {
        if ((window as any).require) {
          const { ipcRenderer } = (window as any).require('electron');
          if (ipcRenderer) {
            ipcRenderer.send('set-theme-mode', mode);
          }
        }
      } catch (e) {
        console.warn('Failed to send theme mode to Electron:', e);
      }
    };

    applyTheme();

    if (mode === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
      } else {
        mediaQuery.addListener(listener);
      }
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', listener);
        } else {
          mediaQuery.removeListener(listener);
        }
      };
    }
  }, [appearanceSettings.themeMode]);

  // Sync feature flags (e.g. AI Features enabled/disabled from installer or settings)
  useEffect(() => {
    electron.getAppFeatures().then(res => {
      if (res && typeof res.enableAIFeatures === 'boolean') {
        setEnableAIFeatures(res.enableAIFeatures);
      }
    });

    const ipc = getIpcRenderer();
    if (ipc) {
      const handleFeaturesChanged = (_e: any, features: any) => {
        if (features && typeof features.enableAIFeatures === 'boolean') {
          setEnableAIFeatures(features.enableAIFeatures);
          if (!features.enableAIFeatures) {
            setShowAILive(false);
          }
        }
      };
      ipc.on('app-features-changed', handleFeaturesChanged);
      return () => {
        ipc.removeListener('app-features-changed', handleFeaturesChanged);
      };
    }
  }, [electron, getIpcRenderer]);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({ 
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

  // Deck B: Dual Video Deck / Seamless Transition Engine
  const deckBCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDeckBActive, setIsDeckBActive] = useState(false);
  const [deckBPhase, setDeckBPhase] = useState<'idle' | 'holding' | 'fading'>('idle');
  const [deckBLayout, setDeckBLayout] = useState<{
    width: string | number;
    height: string | number;
    transform: string;
    objectFit: any;
    filter: string;
  }>({
    width: '100%',
    height: '100%',
    transform: 'none',
    objectFit: 'contain',
    filter: 'none'
  });
  const deckBTimerRef = useRef<NodeJS.Timeout | null>(null);
  const deckBSafetyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoLayoutRef = useRef<{
    targetWidth: string | number;
    targetHeight: string | number;
    objectFitMode: any;
    videoTransform: string;
    filter: string;
  }>({
    targetWidth: '100%',
    targetHeight: '100%',
    objectFitMode: 'fill',
    videoTransform: 'none',
    filter: 'none'
  });

  const activateDeckBTransition = useCallback(() => {
    const pref = preferenceSettingsRef.current;
    const effect = pref.videoTransition || 'none';
    if (effect === 'none' || !videoRef.current) return;
    
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

    try {
      const canvas = deckBCanvasRef.current;
      if (canvas) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
      }

      setDeckBLayout({
        width: videoLayoutRef.current.targetWidth,
        height: videoLayoutRef.current.targetHeight,
        transform: videoLayoutRef.current.videoTransform,
        objectFit: videoLayoutRef.current.objectFitMode,
        filter: videoLayoutRef.current.filter
      });

      setIsDeckBActive(true);
      setDeckBPhase('holding');

      if (deckBTimerRef.current) clearTimeout(deckBTimerRef.current);
      if (deckBSafetyTimerRef.current) clearTimeout(deckBSafetyTimerRef.current);

      // Safety timeout: dismiss Deck B after 4s if new video stalls
      deckBSafetyTimerRef.current = setTimeout(() => {
        setDeckBPhase('idle');
        setIsDeckBActive(false);
      }, 4000);
    } catch (e) {
      console.warn("Deck B transition capture skipped:", e);
    }
  }, []);

  const triggerDeckBFade = useCallback(() => {
    const pref = preferenceSettingsRef.current;
    if (pref.videoTransition === 'none') {
      setIsDeckBActive(false);
      setDeckBPhase('idle');
      return;
    }

    setDeckBPhase(prev => {
      if (prev === 'holding') {
        const duration = pref.videoTransitionDuration || 500;
        if (deckBTimerRef.current) clearTimeout(deckBTimerRef.current);
        deckBTimerRef.current = setTimeout(() => {
          setDeckBPhase('idle');
          setIsDeckBActive(false);
        }, duration);
        return 'fading';
      }
      return prev;
    });
  }, []);

  const suppressPlayToggleRef = useRef(false);
  const panDragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialPanX: 0,
    initialPanY: 0,
    hasMoved: false,
  });
  const [isPanDragging, setIsPanDragging] = useState(false);

  useEffect(() => {
    if (!isPanDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!panDragRef.current.isDragging) return;
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;

      if (!panDragRef.current.hasMoved && Math.hypot(dx, dy) > 4) {
        panDragRef.current.hasMoved = true;
        suppressPlayToggleRef.current = true;
      }

      if (panDragRef.current.hasMoved) {
        setVideoSettings(prev => ({
          ...prev,
          panX: Math.round(panDragRef.current.initialPanX + dx),
          panY: Math.round(panDragRef.current.initialPanY + dy),
        }));
      }
    };

    const handleWindowMouseUp = () => {
      if (panDragRef.current.isDragging) {
        if (panDragRef.current.hasMoved) {
          suppressPlayToggleRef.current = true;
          setTimeout(() => {
            suppressPlayToggleRef.current = false;
          }, 150);
        }
        panDragRef.current.isDragging = false;
        setIsPanDragging(false);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isPanDragging]);

  const handlePlayerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;

    const isZoomed = (videoSettings.zoom || 1) > 1;
    const isPanned = (videoSettings.panX || 0) !== 0 || (videoSettings.panY || 0) !== 0;

    if (isZoomed || isPanned || e.button === 1 || e.altKey || e.shiftKey) {
      panDragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startY: e.clientY,
        initialPanX: videoSettings.panX || 0,
        initialPanY: videoSettings.panY || 0,
        hasMoved: false,
      };
      setIsPanDragging(true);
    }
  };

  const handlePlayerWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY < 0 ? 0.1 : -0.1;
      setVideoSettings(prev => {
        const currentZoom = prev.zoom || 1;
        const nextZoom = Math.min(5, Math.max(0.5, Math.round((currentZoom + zoomDelta) * 10) / 10));
        return { ...prev, zoom: nextZoom };
      });
    }
  };
  const [videoSizingMode, setVideoSizingMode] = useState<'contain' | 'fill' | 'fit-horizontal' | 'fit-vertical' | 'original'>(() => {
    return (localStorage.getItem('videoSizingMode') as any) || 'contain';
  });
  useEffect(() => {
    localStorage.setItem('videoSizingMode', videoSizingMode);
  }, [videoSizingMode]);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!playerContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(playerContainerRef.current);
    setContainerSize({
      width: playerContainerRef.current.clientWidth,
      height: playerContainerRef.current.clientHeight
    });
    return () => observer.disconnect();
  }, [playerContainerRef]);

  useEffect(() => {
    const handleResize = () => {
      if (playerContainerRef.current) {
        setContainerSize({
          width: playerContainerRef.current.clientWidth,
          height: playerContainerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
      if (!isFileDrag) return;

      const activeModal = document.querySelector('[data-playlist-modal="true"], [data-modal], [role="dialog"]');
      if (activeModal) {
        const target = e.target as Node;
        if (!activeModal.contains(target)) {
          e.preventDefault();
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'none';
          }
        }
      }
    };

    const handleGlobalDrop = (e: DragEvent) => {
      const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
      if (!isFileDrag) return;

      const activeModal = document.querySelector('[data-playlist-modal="true"], [data-modal], [role="dialog"]');
      if (activeModal) {
        const target = e.target as Node;
        if (!activeModal.contains(target)) {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(false);
        }
      }
    };

    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('drop', handleGlobalDrop);
    return () => {
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, []);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const isSettingsLoadedRef = useRef(false);
  useEffect(() => {
    isSettingsLoadedRef.current = isSettingsLoaded;
  }, [isSettingsLoaded]);

  const currentVideoIdRef = useRef<string | null>(null);
  const lastSavedTimeRef = useRef<number>(0);
  const pendingResumeTimeRef = useRef<number | null>(null);
  const pendingLoopRef = useRef<SavedLoop | null>(null);
  const resumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlayedIndexRef = useRef<number>(-1);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const wasPlayingBeforeSnifferRef = useRef(false);

  // OSD State
  const [osd, setOsd] = useState({ message: '', visible: false });
  const osdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showFeedback = useCallback((msg: string, durationMs: number = 1000) => {
    setOsd({ message: msg, visible: true });
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => {
      setOsd(prev => ({ ...prev, visible: false }));
    }, durationMs);
  }, []);

  // Background Download Notifications
  const [downloadNotifications, setDownloadNotifications] = useState<Array<{
    id: string;
    name: string;
    percent: number;
    status: 'starting' | 'downloading' | 'completed' | 'error' | 'cancelled';
    speed?: string;
    error?: string;
    type: 'hls' | 'manual';
    completedAt?: number;
    minimized?: boolean;
  }>>([]);

  const downloadNotificationsRef = useRef(downloadNotifications);
  useEffect(() => {
    downloadNotificationsRef.current = downloadNotifications;
  }, [downloadNotifications]);

  const [downloadErrorModal, setDownloadErrorModal] = useState<{ show: boolean; filename: string; error: string } | null>(null);

  const toggleMinimizeDownloadNotification = useCallback((id: string) => {
    setDownloadNotifications(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, minimized: !item.minimized };
      }
      return item;
    }));
  }, []);

  const dismissDownloadNotification = useCallback((id: string) => {
    setDownloadNotifications(prev => prev.filter(item => item.id !== id));
  }, []);

  const { activeDownloadsCount, completedDownloadsCount } = useMemo(() => {
    let active = 0;
    let completed = 0;
    for (const item of downloadNotifications) {
      if (item.status === 'downloading' || item.status === 'starting') {
        active++;
      } else if (item.status === 'completed') {
        completed++;
      }
    }
    return { activeDownloadsCount: active, completedDownloadsCount: completed };
  }, [downloadNotifications]);

  const getFilenameFromUrl = (url: string) => {
    try {
      const decoded = decodeURIComponent(url);
      const pathname = new URL(decoded).pathname;
      const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
      return lastPart || 'Video';
    } catch (e) {
      return 'Video';
    }
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    const handleHlsProgress = (event: any, data: any) => {
      // data: { url, status, percent, speed, error, timemark }
      const id = data.url;
      const isComplete = data.status === 'completed';
      const isError = data.status === 'error';
      const isCancelled = data.status === 'cancelled';

      setDownloadNotifications(prev => {
        const name = getFilenameFromUrl(data.url);
        const existing = prev.find(item => item.id === id);
        
        let updated;
        if (existing) {
          updated = prev.map(item => {
            if (item.id === id) {
              return {
                ...item,
                percent: data.percent !== undefined ? data.percent : item.percent,
                status: data.status,
                speed: data.speed !== undefined ? formatSpeed(data.speed) : item.speed,
                error: data.error,
                completedAt: (isComplete || isError || isCancelled) ? Date.now() : undefined
              };
            }
            return item;
          });
        } else {
          updated = [
            ...prev,
            {
              id,
              name,
              percent: data.percent || 0,
              status: data.status,
              speed: data.speed !== undefined ? formatSpeed(data.speed) : undefined,
              error: data.error,
              type: 'hls' as const,
              completedAt: (isComplete || isError || isCancelled) ? Date.now() : undefined
            }
          ];
        }
        return updated;
      });

      if (isComplete) {
        const existing = downloadNotificationsRef.current?.find(item => item.id === id);
        if (!existing || existing.status !== 'completed') {
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('success');
          }
        }
      }

      if (isError) {
        const existing = downloadNotificationsRef.current?.find(item => item.id === id);
        if (!existing || existing.status !== 'error') {
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('failure');
          }
        }
      }

      // Auto-remove completed/cancelled after 4 seconds (10 seconds if minimized)
      if (isComplete || isCancelled) {
        const isMinimized = downloadNotificationsRef.current?.find(item => item.id === id)?.minimized;
        setTimeout(() => {
          setDownloadNotifications(prev => prev.filter(item => item.id !== id));
        }, isMinimized ? 10000 : 4000);
      } else if (isError) {
        setTimeout(() => {
          setDownloadNotifications(prev => prev.filter(item => item.id !== id));
        }, 8000);
      }
    };

    const handleManualStarted = (event: any, data: any) => {
      // data: { id, fileName, url, totalBytes, receivedBytes, speed, state }
      const id = data.id;
      setDownloadNotifications(prev => [
        ...prev.filter(item => item.id !== id),
        {
          id,
          name: data.fileName || getFilenameFromUrl(data.url),
          percent: data.totalBytes > 0 ? (data.receivedBytes / data.totalBytes) * 100 : 0,
          status: 'downloading',
          speed: data.speed ? formatSpeed(data.speed) : undefined,
          type: 'manual' as const
        }
      ]);
    };

    const handleManualProgress = (event: any, data: any) => {
      // data: { id, state, receivedBytes, totalBytes, speed, error }
      const id = data.id;
      const isComplete = data.state === 'completed';
      const isError = data.state === 'interrupted' || data.state === 'error';
      const isCancelled = data.state === 'cancelled';

      setDownloadNotifications(prev => {
        const existing = prev.find(item => item.id === id);
        const percent = data.totalBytes > 0 ? (data.receivedBytes / data.totalBytes) * 100 : 0;
        
        let status: 'downloading' | 'completed' | 'error' | 'cancelled' = 'downloading';
        if (data.state === 'completed') status = 'completed';
        else if (data.state === 'interrupted') status = 'error';
        else if (data.state === 'cancelled') status = 'cancelled';

        if (existing) {
          return prev.map(item => {
            if (item.id === id) {
              return {
                ...item,
                percent,
                status,
                speed: data.speed ? formatSpeed(data.speed) : item.speed,
                completedAt: (isComplete || isError || isCancelled) ? Date.now() : undefined,
                error: data.error || item.error
              };
            }
            return item;
          });
        } else {
          return [
            ...prev,
            {
              id,
              name: 'Download',
              percent,
              status,
              speed: data.speed ? formatSpeed(data.speed) : undefined,
              type: 'manual' as const,
              completedAt: (isComplete || isError || isCancelled) ? Date.now() : undefined,
              error: data.error
            }
          ];
        }
      });

      if (isComplete) {
        const existing = downloadNotificationsRef.current?.find(item => item.id === id);
        if (!existing || existing.status !== 'completed') {
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('success');
          }
        }
      }

      if (isError) {
        const existing = downloadNotificationsRef.current?.find(item => item.id === id);
        if (!existing || existing.status !== 'error') {
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('failure');
          }
        }
      }

      if (isComplete || isCancelled) {
        const isMinimized = downloadNotificationsRef.current?.find(item => item.id === id)?.minimized;
        setTimeout(() => {
          setDownloadNotifications(prev => prev.filter(item => item.id !== id));
        }, isMinimized ? 10000 : 4000);
      } else if (isError) {
        setTimeout(() => {
          setDownloadNotifications(prev => prev.filter(item => item.id !== id));
        }, 8000);
      }
    };

    const handleManualDone = (event: any, data: any) => {
      // data: { id, state, filePath, receivedBytes, totalBytes, error }
      const id = data.id;
      const isComplete = data.state === 'completed';
      const isError = data.state === 'interrupted' || data.state === 'error';
      const isCancelled = data.state === 'cancelled';

      setDownloadNotifications(prev => {
        const existing = prev.find(item => item.id === id);
        let status: 'downloading' | 'completed' | 'error' | 'cancelled' = 'downloading';
        if (data.state === 'completed') status = 'completed';
        else if (data.state === 'interrupted') status = 'error';
        else if (data.state === 'cancelled') status = 'cancelled';

        if (existing) {
          return prev.map(item => {
            if (item.id === id) {
              return {
                ...item,
                status,
                percent: 100,
                completedAt: Date.now(),
                error: data.error || item.error
              };
            }
            return item;
          });
        }
        return prev;
      });

      if (isComplete) {
        const existing = downloadNotificationsRef.current?.find(item => item.id === id);
        if (!existing || existing.status !== 'completed') {
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('success');
          }
        }
      }

      if (isError) {
        const existing = downloadNotificationsRef.current?.find(item => item.id === id);
        if (!existing || existing.status !== 'error') {
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('failure');
          }
        }
      }

      if (isError) {
        const lang = (preferenceSettingsRef.current && preferenceSettingsRef.current.language) || preferenceSettings.language || 'id';
        const errorMsg = data.error || (lang === 'id' 
          ? 'Unduhan terganggu (interrupted). Silakan periksa koneksi internet Anda.' 
          : 'Download interrupted. Please check your internet connection.');
        
        const filename = data.filePath ? data.filePath.split(/[\\/]/).pop() : (lang === 'id' ? 'Berkas Video' : 'Video File');
        
        setDownloadErrorModal({
          show: true,
          filename,
          error: errorMsg
        });
      }

      const isMinimized = downloadNotificationsRef.current?.find(item => item.id === id)?.minimized;
      setTimeout(() => {
        setDownloadNotifications(prev => prev.filter(item => item.id !== id));
      }, isError ? 8000 : (isMinimized ? 10000 : 4000));
    };

    ipc.on('download-progress', handleHlsProgress);
    ipc.on('manual-download-started', handleManualStarted);
    ipc.on('manual-download-progress', handleManualProgress);
    ipc.on('manual-download-done', handleManualDone);

    return () => {
      ipc.removeListener('download-progress', handleHlsProgress);
      ipc.removeListener('manual-download-started', handleManualStarted);
      ipc.removeListener('manual-download-progress', handleManualProgress);
      ipc.removeListener('manual-download-done', handleManualDone);
    };
  }, [getIpcRenderer]);

  const addFileToPlayQueue = useCallback(async (file: any) => {
    if (!file) return;
    try {
      const serialized = {
        name: file.name || 'Unknown Media',
        path: file.path || file.url || '',
        isStream: !!file.isStream,
        url: file.url || file.path || '',
        type: file.type || 'video/mp4',
        size: file.size || 0
      };

      setSavedCollections(prev => {
        let playQueueCol = prev.find(c => c.id === 'play_queue');
        let otherCols = prev.filter(c => c.id !== 'play_queue');
        
        if (!playQueueCol) {
          playQueueCol = {
            id: 'play_queue',
            name: 'Play Queue',
            files: [],
            createdAt: Date.now()
          };
        }

        const filteredFiles = playQueueCol.files.filter((f: any) => f.path !== serialized.path && f.url !== serialized.url && f.name !== serialized.name);
        const updatedFiles = [serialized, ...filteredFiles];
        const updatedCol = {
          ...playQueueCol,
          files: updatedFiles,
          createdAt: Date.now()
        };

        dbService.saveCollection(updatedCol).catch(err => console.error('Failed to save Play Queue:', err));
        return [updatedCol, ...otherCols];
      });
    } catch (e) {
      console.error('Failed to add file to Play Queue:', e);
    }
  }, []);

  const handlePlayFromSniffer = async (url: string, referer?: string, title?: string) => {
    // Stop current playback/stream to prevent overlapping streams and freezing issues
    stopPlayback();
    await new Promise(resolve => setTimeout(resolve, 100));

    const ipc = getIpcRenderer();
    player.setOriginalVideoSrc(url);
    player.setIsMuted(false); // Unmute player to ensure sound plays
    if (player.volume === 0) player.setVolume(0.8); // Set default audible volume level
    
    // Create a fake file object to load into the playlist and update title dynamically
    const resolvedTitle = title || url.split('/').pop()?.split('?')[0] || 'Streaming Video';
    const fakeFile = new File([""], resolvedTitle, { type: "video/mp4" });
    Object.defineProperty(fakeFile, 'path', { value: url });
    Object.defineProperty(fakeFile, 'isStream', { value: true });
    Object.defineProperty(fakeFile, 'url', { value: url });
    
    addFileToPlayQueue(fakeFile);
    
    currentVideoIdRef.current = url;
    
    let targetIndex = -1;
    playlist.setPlaylist(prev => {
      const existsIndex = prev.findIndex(item => (item as any).path === url || (item as any).url === url);
      if (existsIndex !== -1) {
        targetIndex = existsIndex;
        return prev;
      } else {
        targetIndex = 0;
        return [fakeFile, ...prev];
      }
    });
    
    setTimeout(() => {
      playlist.setCurrentIndex(targetIndex === -1 ? 0 : targetIndex);
    }, 0);

    const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
    let videoUrlToPlay = url;

    if (isYoutube) {
      showFeedback(preferenceSettings.language === 'id' ? 'Menyiapkan aliran video YouTube... ⏳' : 'Resolving YouTube stream... ⏳');
      let resolved = false;

      if (ipc) {
        try {
          const resolvedUrl = await ipc.invoke('resolve-youtube', url);
          if (resolvedUrl) {
            videoUrlToPlay = resolvedUrl;
            resolved = true;
          }
        } catch (err) {
          console.error('Failed to resolve YouTube URL via backend yt-dlp:', err);
        }
      }

      if (!resolved) {
        try {
          const res = await fetch('https://api.cobalt.tools/api/json', {
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
            videoUrlToPlay = cobaltData.url;
            resolved = true;
          } else {
            console.warn('Cobalt did not return url, playing original:', cobaltData);
          }
        } catch (err) {
          console.error('Failed to resolve YouTube URL:', err);
        }
      }
    }

    if (ipc) {
      ipc.send('set-main-player-referer', referer || '');
      try {
        const proxyUrl = isYoutube ? videoUrlToPlay : await ipc.invoke('get-proxy-url', videoUrlToPlay, referer || '');
        player.setVideoSrc(proxyUrl || videoUrlToPlay);
        player.setIsPlaying(true);
        setShowWebSniffer(false);
        showFeedback(isYoutube 
          ? (preferenceSettings.language === 'id' ? 'Memutar Aliran YouTube! 🚀' : 'Playing YouTube Stream! 🚀')
          : t('playingFromSnifferCached', preferenceSettings.language || 'id') + ' 🚀'
        );
      } catch (e) {
        player.setVideoSrc(videoUrlToPlay);
        player.setIsPlaying(true);
        setShowWebSniffer(false);
        showFeedback(t('playingFromSniffer', preferenceSettings.language || 'id') + ' 🚀');
      }
    } else {
      player.setVideoSrc(videoUrlToPlay);
      player.setIsPlaying(true);
      setShowWebSniffer(false);
      showFeedback(t('playingFromSniffer', preferenceSettings.language || 'id') + ' 🚀');
    }
  };

  const openWebSniffer = async (initialUrl?: string | any) => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {
        console.error(e);
      }
    }
    const finalUrl = typeof initialUrl === 'string' ? initialUrl : null;
    setSnifferInitialUrl(finalUrl);
    setShowWebSniffer(true);
  };

  // Auto-pause when opening Sniffer
  const prevShowWebSnifferRef = useRef(showWebSniffer);
  useEffect(() => {
    if (showWebSniffer !== prevShowWebSnifferRef.current) {
      if (showWebSniffer) {
        if (videoRef.current && !videoRef.current.paused) {
          wasPlayingBeforeSnifferRef.current = true;
          videoRef.current.pause();
          player.setIsPlaying(false);
        } else {
          // Only reset if it wasn't already set by something else (like handleOpenFile)
          if (!wasPlayingBeforeSnifferRef.current) {
            wasPlayingBeforeSnifferRef.current = false;
          }
        }
      } else {
        if (wasPlayingBeforeSnifferRef.current && videoRef.current) {
          videoRef.current.play().catch(console.error);
          player.setIsPlaying(true);
        }
        wasPlayingBeforeSnifferRef.current = false; // Reset after resuming
      }
      prevShowWebSnifferRef.current = showWebSniffer;
    }
  }, [showWebSniffer, player.setIsPlaying]);

  // Initialize DB and Load Settings
  useEffect(() => {
    const init = async () => {
      await dbService.init();
      const settings = await dbService.getSettings();
      if (settings.volume !== undefined) player.setVolume(settings.volume);
      if (settings.isMuted !== undefined) player.setIsMuted(settings.isMuted);
      if (settings.isAudioNormalized !== undefined) player.setIsAudioNormalized(settings.isAudioNormalized);
      if (settings.playlistViewMode !== undefined) playlist.setPlaylistViewMode(settings.playlistViewMode);
      if (settings.isShuffle !== undefined) playlist.setIsShuffle(settings.isShuffle);
      if (settings.repeatMode !== undefined) playlist.setRepeatMode(settings.repeatMode);
      if (settings.subSettings !== undefined) subtitles.setSubSettings(settings.subSettings);
      if (settings.playbackRate !== undefined) player.setPlaybackRate(settings.playbackRate);
      if (settings.isEnhance !== undefined) setIsEnhance(settings.isEnhance);
      if (settings.isSuperRes !== undefined) setIsSuperRes(settings.isSuperRes);
      if (settings.isAmbientMode !== undefined) setIsAmbientMode(settings.isAmbientMode);
      if (settings.isFrameInterpolation !== undefined) setIsFrameInterpolation(settings.isFrameInterpolation);
      setInterpolationEngine('canvas_light');
      if (settings.interpolationMode !== undefined) setInterpolationMode(settings.interpolationMode);
      if (settings.mpvSettings !== undefined) setMpvSettings(prev => ({ ...prev, ...settings.mpvSettings }));
      if (settings.appearanceSettings !== undefined) setAppearanceSettings(settings.appearanceSettings);
      if (settings.videoSettings !== undefined) setVideoSettings(settings.videoSettings);
      if (settings.preferenceSettings !== undefined) setPreferenceSettings(settings.preferenceSettings);
      if (settings.audioBoost !== undefined) player.setAudioBoost(settings.audioBoost);
      if (settings.eqGains !== undefined) player.setEqGains(settings.eqGains);
      if (settings.audioDelay !== undefined) player.setAudioDelay(settings.audioDelay);
      if (settings.isSwapChannels !== undefined) player.setIsSwapChannels(settings.isSwapChannels);
      if (settings.normalizeThreshold !== undefined) player.setNormalizeThreshold(settings.normalizeThreshold);
      if (settings.normalizeGain !== undefined) player.setNormalizeGain(settings.normalizeGain);
      
      let collections = await dbService.getCollections();
      let playQueueCol = collections.find(c => c.id === 'play_queue');
      if (!playQueueCol) {
        playQueueCol = {
          id: 'play_queue',
          name: 'Play Queue',
          files: [],
          createdAt: Date.now()
        };
        await dbService.saveCollection(playQueueCol);
        collections = [playQueueCol, ...collections];
      }
      setSavedCollections(collections);

      try {
        const lastPlaylist = await dbService.getActivePlaylist();
        if (lastPlaylist && lastPlaylist.files && lastPlaylist.files.length > 0) {
          const reconstructed = lastPlaylist.files.map((item: any) => {
            if (item.isStream) {
              return {
                name: item.name,
                path: item.path,
                isStream: item.isStream,
                url: item.url,
                type: item.type,
                size: item.size
              } as any;
            }
            let fileSize = item.size || 0;
            const fsModule = electron.getFs();
            if (!fileSize && electron.isElectron && fsModule && item.path) {
              try {
                if (fsModule.existsSync(item.path)) {
                  fileSize = fsModule.statSync(item.path).size;
                }
              } catch (e) {}
            }
            const fakeFile = new File([""], item.name, { type: item.type || "video/mp4" });
            Object.defineProperty(fakeFile, 'path', { value: item.path });
            if (fileSize > 0) {
              Object.defineProperty(fakeFile, 'size', { value: fileSize });
            }
            return fakeFile;
          });

          playlistRef.current.queueThumbnails(reconstructed);

          let finalMerged: File[] = [];
          let finalPlayIdx = -1;

          playlistRef.current.setPlaylist(prev => {
            if (prev.length > 0) {
              const merged = [...reconstructed];
              prev.forEach(p => {
                const exists = merged.some(m => isSameMediaFile(p, m));
                if (!exists) {
                  merged.push(p);
                }
              });

              const lastOpened = prev[prev.length - 1];
              const playIdx = merged.findIndex(m => isSameMediaFile(lastOpened, m));

              finalPlayIdx = playIdx !== -1 ? playIdx : merged.length - 1;
              finalMerged = merged;
              return merged;
            }

            finalPlayIdx = lastPlaylist.currentIndex;
            finalMerged = reconstructed;
            return reconstructed;
          });

          setTimeout(() => {
            if (openedFileViaIpcRef.current || openedViaShortcutRef.current) {
              return;
            }
            if (finalPlayIdx !== -1 && finalPlayIdx < finalMerged.length) {
              playlistRef.current.setCurrentIndex(finalPlayIdx);
              const file = finalMerged[finalPlayIdx];
              if (file) {
                let url = '';
                if ((file as any).isStream) {
                  url = (file as any).url || (file as any).path;
                } else if ((file as any).path && isElectron) {
                  url = electron.getLocalFileUrl((file as any).path);
                } else if (file instanceof Blob) {
                  url = URL.createObjectURL(file);
                }
                if (url) {
                  const shouldPlay = finalMerged.length > reconstructed.length && !openedViaShortcutRef.current;
                  player.setVideoSrc(url);
                  player.setIsPlaying(shouldPlay);
                }
              }
            }
          }, 50);
        }
      } catch (e) {
        console.error('Failed to load active playlist on start:', e);
      }

      setIsSettingsLoaded(true);
      electron.logToMain('Frontend App initialized with IndexedDB');
    };
    init();
  }, []);

  // Save Active Playlist when it changes
  useEffect(() => {
    if (!isSettingsLoaded) return;

    const serializableFiles = playlist.playlist.map((file: any) => {
      return {
        name: file.name,
        path: file.path,
        isStream: file.isStream,
        url: file.url,
        type: file.type,
        size: file.size
      };
    });

    dbService.saveActivePlaylist(serializableFiles, playlist.currentIndex).catch(e => {
      console.error('Failed to save active playlist:', e);
    });
  }, [isSettingsLoaded, playlist.playlist, playlist.currentIndex]);

  // Save Settings
  useEffect(() => {
    if (!isSettingsLoaded) return;
    dbService.saveSettings({
      volume: player.volume,
      isMuted: player.isMuted,
      isAudioNormalized: player.isAudioNormalized,
      playlistViewMode: playlist.playlistViewMode,
      isShuffle: playlist.isShuffle,
      repeatMode: playlist.repeatMode,
      subSettings: subtitles.subSettings,
      playbackRate: player.playbackRate,
      isEnhance,
      isSuperRes,
      isAmbientMode,
      isFrameInterpolation,
      interpolationEngine,
      interpolationMode,
      mpvSettings,
      appearanceSettings,
      videoSettings,
      preferenceSettings,
      audioBoost: player.audioBoost,
      eqGains: player.eqGains,
      audioDelay: player.audioDelay,
      isSwapChannels: player.isSwapChannels,
      normalizeThreshold: player.normalizeThreshold,
      normalizeGain: player.normalizeGain
    });
  }, [isSettingsLoaded, player.volume, player.isMuted, player.isAudioNormalized, playlist.playlistViewMode, playlist.isShuffle, playlist.repeatMode, subtitles.subSettings, player.playbackRate, isEnhance, isSuperRes, isAmbientMode, isFrameInterpolation, interpolationEngine, interpolationMode, mpvSettings, appearanceSettings, videoSettings, preferenceSettings, player.audioBoost, player.eqGains, player.audioDelay, player.isSwapChannels, player.normalizeThreshold, player.normalizeGain]);

  // Sync language with Electron
  useEffect(() => {
    const ipc = electron.getIpcRenderer();
    if (ipc) {
      ipc.send('set-language', preferenceSettings.language || 'id');
    }
  }, [preferenceSettings.language, electron]);

  const handleCheckMpvAvailable = useCallback(async () => {
    return await electron.checkMpvAvailable(mpvSettings.customPath);
  }, [electron, mpvSettings.customPath]);

  const handleLaunchMpv = useCallback(async () => {
    // Determine path from current playlist item or videoSrc
    const currentFile = playlist.playlist[playlist.currentIndex];
    let targetPath = '';
    if (currentFile) {
      targetPath = electron.getPathForFile(currentFile) || currentFile.name;
    } else if (player.videoSrc) {
      targetPath = player.videoSrc;
    }

    if (!targetPath) {
      showFeedback(preferenceSettings.language === 'id' ? 'Muat video terlebih dahulu' : 'Please load a video first');
      return;
    }

    const startTime = videoRef.current?.currentTime || 0;
    showFeedback(preferenceSettings.language === 'id' ? 'Meluncurkan player libmpv...' : 'Launching libmpv player...');

    const res = await electron.launchMpvPlayer({
      filePath: targetPath,
      interpolation: isFrameInterpolation,
      tscale: mpvSettings.tscale,
      videoSync: mpvSettings.videoSync,
      enableSvp: mpvSettings.enableSvp,
      useMvtools: mpvSettings.useMvtools,
      mvtoolsFps: mpvSettings.mvtoolsFps || 60,
      mvtoolsMode: mpvSettings.mvtoolsMode || 'flow',
      hwdec: mpvSettings.hwdec,
      customPath: mpvSettings.customPath,
      startTime
    });

    if (res.success) {
      setIsMpvRunning(true);
      if (player.isPlaying) {
        player.togglePlay();
      }
      showFeedback(preferenceSettings.language === 'id' ? 'libmpv aktif dengan akselerasi 60-144Hz+' : 'libmpv active with 60-144Hz+ acceleration');
    } else {
      showFeedback(res.error || (preferenceSettings.language === 'id' ? 'Gagal meluncurkan libmpv' : 'Failed to launch libmpv'));
    }
  }, [playlist.playlist, playlist.currentIndex, player, electron, isFrameInterpolation, mpvSettings, preferenceSettings.language, showFeedback]);

  const loadMarkers = useCallback(async (id: string, file?: File) => {
    try {
      let loadedMarkers = await dbService.getMarkers(id);

      // If it's a local file and we have MediaInfo, try to extract chapters
      if (file && file.name.toLowerCase().endsWith('.mkv')) {
        let mediainfo: any = null;
        try {
          mediainfo = await MediaInfoFactory({
            format: 'object',
            locateFile: (path, prefix) => {
              if (path.endsWith('.wasm')) {
                return 'https://unpkg.com/mediainfo.js@0.3.7/dist/MediaInfoModule.wasm';
              }
              return prefix + path;
            }
          });
          const getSize = () => file.size;
          const readChunk = (chunkSize: number, offset: number) =>
            new Promise<Uint8Array>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => {
                if (e.target?.error) reject(e.target.error);
                resolve(new Uint8Array(e.target?.result as ArrayBuffer));
              };
              reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
            });

          try {
            const result = await mediainfo.analyzeData(getSize, readChunk);
            const menuTrack = result?.media?.track?.find((t: any) => t['@type'] === 'Menu');
            
            if (menuTrack && menuTrack.extra) {
              const extractedMarkers: VideoMarker[] = [];
              Object.entries(menuTrack.extra).forEach(([key, value]) => {
                const normalizedKey = key.replace(/^_+/, '').replace(/_/g, ':');
                const timestampRegex = /^(\d{2}:)?\d{2}:\d{2}([.:]\d{3})?$/;
                let timeStr = '';
                let labelStr = value as string;

                if (timestampRegex.test(normalizedKey)) {
                  timeStr = normalizedKey;
                } else if (typeof value === 'string' && timestampRegex.test(value)) {
                  timeStr = value;
                  labelStr = key;
                }

                if (timeStr) {
                  const parts = timeStr.split(/[:.]/);
                  let hours = 0, minutes = 0, seconds = 0, ms = 0;
                  
                  if (parts.length === 4) {
                    hours = parseInt(parts[0], 10);
                    minutes = parseInt(parts[1], 10);
                    seconds = parseInt(parts[2], 10);
                    ms = parseInt(parts[3], 10);
                  } else if (parts.length === 3) {
                    if (timeStr.includes('.') || timeStr.includes(',')) {
                      minutes = parseInt(parts[0], 10);
                      seconds = parseInt(parts[1], 10);
                      ms = parseInt(parts[2], 10);
                    } else {
                      hours = parseInt(parts[0], 10);
                      minutes = parseInt(parts[1], 10);
                      seconds = parseInt(parts[2], 10);
                    }
                  } else if (parts.length === 2) {
                    minutes = parseInt(parts[0], 10);
                    seconds = parseInt(parts[1], 10);
                  }
                  
                  const timeInSeconds = (hours * 3600) + (minutes * 60) + seconds + (ms / 1000);
                  if (!loadedMarkers.some(m => Math.abs(m.time - timeInSeconds) < 0.5)) {
                    extractedMarkers.push({
                      id: `mkv_${timeInSeconds}`,
                      time: timeInSeconds,
                      label: labelStr.split(' - ')[0] || `Chapter ${extractedMarkers.length + 1}`
                    });
                  }
                }
              });
              
              if (extractedMarkers.length > 0) {
                loadedMarkers = [...loadedMarkers, ...extractedMarkers].sort((a, b) => a.time - b.time);
                await dbService.saveMarkers(id, loadedMarkers);
              }
            }
          } catch (analysisErr) {
            console.error("MediaInfo analysis failed, skipping chapters:", analysisErr);
          }
        } catch (err) {
          console.error("Failed to parse MKV chapters:", err);
        } finally {
          if (mediainfo) {
            try {
              mediainfo.close();
            } catch (e) {
              console.error("Failed to close mediainfo", e);
            }
          }
        }
      }
      
      setMarkers(loadedMarkers);
    } catch (e) { setMarkers([]); }
  }, []);

  const handleAddMarker = () => {
    if (!videoRef.current) return;
    setPendingMarkerTime(videoRef.current.currentTime);
    setMarkerInputLabel('');
    setShowMarkerInput(true);
  };

  const confirmAddMarker = async () => {
    if (!currentVideoIdRef.current) return;
    const newMarker: VideoMarker = {
      id: Date.now().toString(),
      time: pendingMarkerTime,
      label: markerInputLabel.trim() || 'Marker'
    };
    const updated = [...markers, newMarker].sort((a, b) => a.time - b.time);
    setMarkers(updated);
    if (preferenceSettings.saveMarkers) {
      await dbService.saveMarkers(currentVideoIdRef.current, updated);
    }
    setShowMarkerInput(false);
    showFeedback(t('markerAdded', preferenceSettings.language || 'id', { label: newMarker.label }));
  };

  const handleSaveLoop = () => {
    if (!currentVideoIdRef.current || player.repeatA === null || player.repeatB === null) return;
    setLoopInputLabel('');
    setShowLoopInput(true);
  };

  const confirmSaveLoop = async () => {
    if (!currentVideoIdRef.current || player.repeatA === null || player.repeatB === null) return;
    const newLoop: SavedLoop = {
      id: Date.now().toString(),
      name: loopInputLabel.trim() || `Loop ${savedLoops.length + 1}`,
      start: player.repeatA,
      end: player.repeatB
    };
    const updated = [...savedLoops, newLoop].sort((a, b) => a.start - b.start);
    setSavedLoops(updated);
    if (preferenceSettings.saveLoops) {
      await dbService.saveLoops(currentVideoIdRef.current, updated);
    }
    setShowLoopInput(false);
    showFeedback(t('loopSaved', preferenceSettings.language, { name: newLoop.name }));
  };

  const removeLoop = async (loopId: string) => {
    if (!currentVideoIdRef.current) return;
    const updated = savedLoops.filter(l => l.id !== loopId);
    setSavedLoops(updated);
    if (preferenceSettings.saveLoops) {
      await dbService.saveLoops(currentVideoIdRef.current, updated);
    }
    showFeedback(t('loopDeleted', preferenceSettings.language || 'id'));
  };

  const renameLoop = async (loopId: string, newName: string) => {
    if (!currentVideoIdRef.current) return;
    const updated = savedLoops.map(l => l.id === loopId ? { ...l, name: newName } : l);
    setSavedLoops(updated);
    if (preferenceSettings.saveLoops) {
      await dbService.saveLoops(currentVideoIdRef.current, updated);
    }
    showFeedback(t('loopNameUpdated', preferenceSettings.language || 'id'));
  };

  const playLoop = (loop: SavedLoop) => {
    player.setRepeatA(loop.start);
    player.setRepeatB(loop.end);
    player.setRepeatEnabled(true);
    if (videoRef.current) {
      videoRef.current.currentTime = loop.start;
      videoRef.current.play();
    }
    showFeedback(t('playLoop', preferenceSettings.language, { name: loop.name }));
  };

  const accumulatedSkipRef = useRef<number>(0);
  const lastSkipTimeRef = useRef<number>(0);
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const targetTimeRef = useRef<number | null>(null);

  const applySkip = useCallback((amount: number) => {
    if (!videoRef.current) return;
    const now = Date.now();
    
    if (now - lastSkipTimeRef.current < 1000) {
      accumulatedSkipRef.current += amount;
    } else {
      accumulatedSkipRef.current = amount;
      targetTimeRef.current = videoRef.current.currentTime;
    }
    lastSkipTimeRef.current = now;
    
    const duration = isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
    const baseTime = targetTimeRef.current !== null ? targetTimeRef.current : videoRef.current.currentTime;
    targetTimeRef.current = Math.max(0, Math.min(duration, baseTime + amount));
    
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    
    seekTimeoutRef.current = setTimeout(() => {
      if (videoRef.current && targetTimeRef.current !== null) {
        videoRef.current.currentTime = targetTimeRef.current;
      }
    }, 200);
    
    const sign = accumulatedSkipRef.current > 0 ? '+' : '';
    const percent = duration > 0 ? Math.round((targetTimeRef.current / duration) * 100) : 0;
    showFeedback(`${sign}${accumulatedSkipRef.current}s (${percent}%)`);
  }, [showFeedback]);

  const captureCurrentFrameAsPoster = useCallback(() => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  const captureAndSaveCurrentFrame = useCallback(() => {
    if (currentVideoIdRef.current && videoRef.current && videoRef.current.readyState >= 2) {
      try {
        const key = currentVideoIdRef.current;
        const currentFile = playlist.playlist.find(f => {
          const fKey = (f as any).path || (f as any).fullPath || (f.name + f.size);
          return fKey === key;
        });
        const isAudio = isAudioMedia(currentFile);
        if (isAudio) return; // Do not capture frames for audio files!

        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        const targetWidth = 320;
        canvas.width = targetWidth;
        canvas.height = (video.videoHeight / video.videoWidth) * targetWidth;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          dbService.saveThumbnail(key, dataUrl).catch(console.error);
          playlist.setThumbnails(prev => ({ ...prev, [key]: dataUrl }));
        }
      } catch (e) {
        console.warn('Failed to capture frame:', e);
      }
    }
  }, [playlist]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentVideoIdRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const key = currentVideoIdRef.current;
          const currentFile = playlist.playlist.find(f => {
            const fKey = (f as any).path || (f as any).fullPath || (f.name + f.size);
            return fKey === key;
          });
          const isAudio = isAudioMedia(currentFile);
          if (isAudio) return; // Do not capture frames for audio files!

          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          const targetWidth = 320;
          canvas.width = targetWidth;
          canvas.height = (video.videoHeight / video.videoWidth) * targetWidth;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            dbService.saveThumbnail(key, dataUrl).catch(console.error);
          }
        } catch (e) {
          console.warn('Failed to capture frame on unload:', e);
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [playlist.playlist]);

  // Keyboard Shortcuts moved down

  const stopPlayback = useCallback(() => {
    captureAndSaveCurrentFrame();
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    player.setOriginalVideoSrc(null);
    player.setVideoSrc(null);
    setShowPlayer(true);
    player.setIsPlaying(false);
    player.setProgress(0);
    // playlist.setCurrentIndex(-1); // Keep index to allow resume with Space
    subtitles.setSubtitleUrl(null);
    subtitles.setSubBrowserData([]);
    player.setRepeatA(null);
    player.setRepeatB(null);
    player.setRepeatEnabled(false);
    setContextMenu({ ...contextMenu, show: false });
    currentVideoIdRef.current = null;
    setShowResumeOverlay(false);
    setMarkers([]);
  }, [player, playlist, subtitles, contextMenu, captureAndSaveCurrentFrame]);

  const processFiles = async (files: File[]) => {
    // Explicitly capture path for Electron environment
    const filesWithPaths = files.map(f => {
      const electronPath = getRealFilePath(f) || electron.getPathForFile(f);
      if (electronPath) {
        // Create a new File object to prevent Drag & Drop file expiration issues
        // and to safely assign properties without read-only errors.
        const safeFile = new File([""], f.name, { type: f.type });
        Object.defineProperty(safeFile, 'path', { value: electronPath, configurable: true });
        Object.defineProperty(safeFile, 'fullPath', { value: electronPath, configurable: true });
        Object.defineProperty(safeFile, 'size', { value: f.size, configurable: true });
        return safeFile;
      }
      return f;
    });

    const vids = await playlist.addFiles(filesWithPaths);
    const subs = filesWithPaths.filter(f => f.name.match(/\.(vtt|srt|ass|ssa)$/i));

    if (vids.length > 0) {
      playVideoIndex(playlist.playlist.length, [...playlist.playlist, ...vids]);
    }

    if (vids.length > 0 && subs.length > 0) {
      const baseName = vids[0].name.replace(/\.[^/.]+$/, "");
      const matchedSub = subs.find(s => s.name.includes(baseName));
      if (matchedSub) subtitles.loadSubtitle(matchedSub);
    } else if (subs.length > 0 && player.videoSrc) {
      subtitles.loadSubtitle(subs[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }
    setIsDragging(false);

    // Block global drop if any modal is active (specifically Add Files to Playlist, Create Playlist, Edit Playlist, etc.)
    const activeModal = document.querySelector('[data-playlist-modal="true"], [data-modal], [role="dialog"]');
    if (activeModal) {
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleAddNewSubtitleDirectly = (newSub: any) => {
    const updatedData = [...subtitles.subBrowserData, newSub].sort((a, b) => a.start - b.start);
    subtitles.setSubBrowserData(updatedData);
    
    // Update the actual subtitle track URL so the video player reflects the changes
    const newVtt = subtitles.generateVttFromBrowserData(subtitles.subOffset, updatedData);
    const blob = new Blob([newVtt], { type: 'text/vtt' });
    if (subtitles.subtitleUrl) URL.revokeObjectURL(subtitles.subtitleUrl);
    subtitles.setSubtitleUrl(URL.createObjectURL(blob));
    
    showFeedback(t('subtitlesLoaded', preferenceSettings.language || 'id'));
  };

  const handleUnloadSubtitle = () => {
    if (subtitles.subtitleUrl) URL.revokeObjectURL(subtitles.subtitleUrl);
    subtitles.setSubtitleUrl(null);
    subtitles.setSubBrowserData([]);
    showFeedback(t('subtitlesCleared', preferenceSettings.language || 'id'));
  };

  const addSubtitleLine = () => {
    const currentTime = videoRef.current?.currentTime || 0;
    const newSub = {
      id: Math.random().toString(36).substr(2, 9),
      start: currentTime,
      end: currentTime + 2, // Default 2 seconds duration
      text: 'Teks Baru...'
    };
    
    const updatedData = [...subtitles.subBrowserData, newSub].sort((a, b) => a.start - b.start);
    subtitles.setSubBrowserData(updatedData);
    
    // Update the actual subtitle track URL so the video player reflects the changes
    const newVtt = subtitles.generateVttFromBrowserData(subtitles.subOffset, updatedData);
    const blob = new Blob([newVtt], { type: 'text/vtt' });
    if (subtitles.subtitleUrl) URL.revokeObjectURL(subtitles.subtitleUrl);
    subtitles.setSubtitleUrl(URL.createObjectURL(blob));
    
    subtitles.setEditingSubId(newSub.id);
    subtitles.setEditingSubText(newSub.text);
    
    // Auto scroll to new item
    setTimeout(() => {
      if (subBrowserListRef.current) {
        const item = subBrowserListRef.current.querySelector(`[data-id="${newSub.id}"]`);
        if (item) item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const findCurrentSync = () => {
    if (!videoRef.current || !subBrowserListRef.current || subtitles.subBrowserData.length === 0) return;
    const currentTime = videoRef.current.currentTime;
    
    let nearestSub: any = null;
    let minDistance = Infinity;

    subtitles.subBrowserData.forEach(sub => {
      let distance;
      if (currentTime >= sub.start && currentTime <= sub.end) {
        distance = 0;
      } else if (currentTime < sub.start) {
        distance = sub.start - currentTime;
      } else {
        distance = currentTime - sub.end;
      }

      if (distance < minDistance) {
        minDistance = distance;
        nearestSub = sub;
      }
    });

    if (nearestSub) {
      const item = subBrowserListRef.current.querySelector(`[data-id="${nearestSub.id}"]`);
      if (item) {
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.classList.add('bg-amber-500/40');
        setTimeout(() => item.classList.remove('bg-amber-500/40'), 1000);
        
        if (minDistance > 0) {
          showFeedback(t('jumpToNearestSubtitle', preferenceSettings.language || 'id', { seconds: Math.round(minDistance).toString() }));
        }
      }
    } else {
      showFeedback(t('noSubtitleAtCurrentTime', preferenceSettings.language || 'id'));
    }
  };

  const handlePlaySniffedVideo = async (url: string) => {
    electron.logToMain(`Playing sniffed video: ${url}`);
    stopPlayback();
    await new Promise(resolve => setTimeout(resolve, 100));

    player.setOriginalVideoSrc(url);
    
    const ipc = getIpcRenderer();
    if (ipc) {
      try {
        const proxyUrl = await ipc.invoke('get-proxy-url', url, '');
        player.setVideoSrc(proxyUrl || url);
        showFeedback(t('sniffedVideoLoadedCached', preferenceSettings.language || 'id'));
      } catch (e) {
        player.setVideoSrc(url);
        showFeedback(t('sniffedVideoLoaded', preferenceSettings.language || 'id'));
      }
    } else {
      player.setVideoSrc(url);
      showFeedback(t('sniffedVideoLoaded', preferenceSettings.language || 'id'));
    }
    
    player.setIsPlaying(true);
    player.setProgress(0);
    
    // Create a fake file object for the playlist
    const fileName = url.split('/').pop()?.split('?')[0] || 'Sniffed Video';
    const fakeFile = new File([""], fileName, { type: "video/mp4" });
    Object.defineProperty(fakeFile, 'path', { value: url });
    Object.defineProperty(fakeFile, 'isStream', { value: true });
    
    playlist.setPlaylist([fakeFile, ...playlist.playlist]);
    playlist.setCurrentIndex(0);
    
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('close-sniffer-browser');
    }
  };

  // --- Playback Controls ---
  useEffect(() => {
    if (videoRef.current) {
      if (player.isPlaying) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            if (error.name !== 'AbortError') {
              console.error("Playback prevented:", error);
              player.setIsPlaying(false);
            }
          });
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, [player.isPlaying, player.videoSrc]);

  const showVideoLoadFeedback = useCallback((fileName: string) => {
    const lang = preferenceSettingsRef.current.language || 'id';
    if (showWebSnifferRef.current) {
      wasPlayingBeforeSnifferRef.current = true;
      showFeedback(t('fileLoadedWaitSniffer', lang, { name: fileName }));
    } else {
      showFeedback(t('fileLoadedAutoPlay', lang, { name: fileName }));
    }
  }, [showFeedback]);

  const playVideoIndex = useCallback(async (index: number, customPlaylist?: File[]) => {
    const list = customPlaylist || playlistRef.current.playlist;
    if (index < 0 || index >= list.length) return;

    // Deck B Smooth transition: capture previous video frame before switching
    activateDeckBTransition();

    // Soft audio ramp down to prevent audio pop/crack
    if (videoRef.current && !videoRef.current.paused && videoRef.current.volume > 0) {
      try {
        videoRef.current.volume = Math.max(0, videoRef.current.volume * 0.2);
      } catch {}
    }

    // Stop current playback/stream to prevent overlapping streams and freezing issues
    stopPlayback();
    await new Promise(resolve => setTimeout(resolve, 80));

    let file = list[index];

    // In-memory matching to restore Blob objects for local files if they are in the current playlist
    if (!(file as any).isStream && !(file instanceof Blob)) {
      const realFile = playlistRef.current.playlist.find(f => 
        (f instanceof Blob) && isSameMediaFile(file, f)
      );
      if (realFile) {
        file = realFile;
        list[index] = realFile;
      }
    }

    // Use getRealFilePath or electron.getPathForFile to ensure we have the path even if it was lost
    const detectedPath = getRealFilePath(file) || electron.getPathForFile(file);
    if (detectedPath && !(file as any).path) {
      (file as any).path = detectedPath;
    }
    
    if (file) {
      addFileToPlayQueue(file);
    }
    
    const id = (file as any).path || (file as any).fullPath || (file.name + file.size);
    currentVideoIdRef.current = id;
    
    // Revoke old URL if it was a blob
    if (player.videoSrc && player.videoSrc.startsWith('blob:')) {
      URL.revokeObjectURL(player.videoSrc);
    }

    let url = '';
    if ((file as any).isStream) {
      url = (file as any).url || (file as any).path; // Sniffed videos store url in path
    } else if ((file as any).path && electron.isElectron) {
      url = electron.getLocalFileUrl((file as any).path);
    } else if (file instanceof Blob) {
      url = URL.createObjectURL(file);
      if (file.name && file.name.toLowerCase().endsWith('.m3u8')) {
        url = `${url}#${encodeURIComponent(file.name)}`;
      }
    } else {
      const lang = preferenceSettingsRef.current.language || 'id';
      const msg = lang === 'id' 
        ? `Berkas "${(file as any).name || ''}" belum memiliki identitas path file di sistem. Silakan buka "Edit Playlist" untuk menautkan berkas aslinya atau tarik berkas ke aplikasi.`
        : `File "${(file as any).name || ''}" does not have a saved file path. Please open "Edit Playlist" to link the original file or drag it into the application.`;
      
      player.setVideoError(msg);
      player.setIsPlaying(false);
      player.setVideoSrc('error'); // Transition to player view to show error overlay
      return;
    }

    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('set-main-player-referer', '');
      if ((file as any).isStream) {
        player.setOriginalVideoSrc(url);
        try {
          const proxyUrl = await ipc.invoke('get-proxy-url', url, '');
          url = proxyUrl || url;
        } catch (e) {
          // Fallback to original url
        }
      } else {
        player.setOriginalVideoSrc(null);
      }
    } else {
      player.setOriginalVideoSrc(null);
    }

    player.setVideoSrc(url);
    setShowPlayer(true);
    
    let targetIndex = index;
    if (customPlaylist) {
      const globalIndex = playlistRef.current.playlist.findIndex(f => isSameMediaFile(file, f));
      if (globalIndex !== -1) {
        targetIndex = globalIndex;
      }
    }
    playlistRef.current.setCurrentIndex(targetIndex);
    
    player.setIsPlaying(true);
    player.setProgress(0);
    player.setRepeatA(null);
    player.setRepeatB(null);
    player.setRepeatEnabled(false);
    
    // Load markers, loops and check resume
    loadMarkers(id, file);
    loadLoops(id);
    checkResume(id);
    
    lastSavedTimeRef.current = 0;

    // Show loading feedback consistently
    showVideoLoadFeedback(file.name);

    // Auto-detect subtitles
    const fs = electron.getFs();
    const path = electron.getPath();
    
    if (!(file as any).isStream && (file as any).path && fs && path) {
      try {
        const filePath = (file as any).path;
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        
        electron.logToMain(`Auto-detecting subtitles in: ${dir} for ${baseName}`);
        
        if (fs.existsSync(dir)) {
          const filesInDir = fs.readdirSync(dir);
          
          // Look for .srt, .vtt, .ass or .ssa files that match the video name
          const subFile = filesInDir.find((f: string) => {
            const lower = f.toLowerCase();
            const isSub = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
            if (!isSub) return false;
            
            const fBase = lower.replace(/\.(srt|vtt|ass|ssa)$/, '');
            const vBase = baseName.toLowerCase();
            
            return fBase === vBase || fBase.includes(vBase) || vBase.includes(fBase);
          });

          if (subFile) {
            const subPath = path.join(dir, subFile);
            electron.logToMain(`Found subtitle: ${subPath}`);
            
            const content = fs.readFileSync(subPath, 'utf8');
            const blob = new Blob([content], { type: 'text/plain' });
            const subFileObj = new File([blob], subFile);
            subtitlesRef.current.loadSubtitle(subFileObj);
            showFeedback(t('autoSubtitleLoaded', preferenceSettings.language || 'id', { name: subFile }));
          } else {
            electron.logToMain(`No matching subtitle found in ${dir}`);
          }
        }
      } catch (e) {
        electron.logToMain(`Error auto-detecting subtitles: ${e}`);
        console.error('Subtitle auto-detect error:', e);
      }
    }
  }, [player, electron, loadMarkers, showVideoLoadFeedback, stopPlayback, activateDeckBTransition]);

  const playVideoIndexRef = useRef(playVideoIndex);
  useEffect(() => {
    playVideoIndexRef.current = playVideoIndex;
  }, [playVideoIndex]);

  const checkResume = useCallback(async (id: string) => {
    if (pendingLoopRef.current) return;
    const savedProgress = await dbService.getProgress(id);
    if (savedProgress && savedProgress > 5) {
      let activeSettings = preferenceSettingsRef.current || preferenceSettings;
      if (!isSettingsLoadedRef.current) {
        const settings = await dbService.getSettings();
        if (settings && settings.preferenceSettings) {
          activeSettings = settings.preferenceSettings;
        }
      }
      if (activeSettings.alwaysAutoResume) {
        pendingResumeTimeRef.current = savedProgress;
        if (videoRef.current && videoRef.current.readyState >= 1) {
          videoRef.current.currentTime = savedProgress;
          pendingResumeTimeRef.current = null;
        }
        player.setIsPlaying(true);
        const formatSeconds = (secs: number) => {
          const h = Math.floor(secs / 3600);
          const m = Math.floor((secs % 3600) / 60);
          const s = Math.floor(secs % 60);
          return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
        };
        const lang = activeSettings.language || 'id';
        showFeedback(t('resumingVideo', lang) + ` (${formatSeconds(savedProgress)})`);
        setShowResumeOverlay(false);
        setSavedTime(null);
      } else if (activeSettings.showResumeConfirmation !== false) {
        setSavedTime(savedProgress);
        setShowResumeOverlay(true);
        if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = setTimeout(() => setShowResumeOverlay(false), 5000);
      } else {
        setShowResumeOverlay(false);
        setSavedTime(null);
        pendingResumeTimeRef.current = null;
      }
    } else {
      setShowResumeOverlay(false);
      setSavedTime(null);
      pendingResumeTimeRef.current = null;
    }
  }, [player, showFeedback]);

  const loadLoops = useCallback(async (id: string) => {
    const loops = await dbService.getLoops(id);
    setSavedLoops(loops);
  }, []);

  const handleLoadLoop = useCallback(async (videoId: string, loop: SavedLoop) => {
    pendingLoopRef.current = loop;
    setShowResumeOverlay(false);
    
    // Check if it's already playing exactly this video
    const currentVideoId = currentVideoIdRef.current;
    
    if (currentVideoId === videoId && player.videoSrc && videoRef.current && videoRef.current.readyState >= 1) {
      // It's already loaded and ready
      videoRef.current.currentTime = loop.start;
      player.setRepeatA(loop.start);
      player.setRepeatB(loop.end);
      player.setRepeatEnabled(true);
      player.setIsPlaying(true);
      videoRef.current.play().catch(console.error);
      showFeedback(t('loopActive', preferenceSettings.language || 'id', { name: loop.name }));
      pendingLoopRef.current = null;
      return;
    }

    // 1. Check if it's already in playlist
    const existingIndex = playlist.playlist.findIndex(f => {
      const key = (f as any).path || (f as any).fullPath || (f.name + f.size);
      return key === videoId;
    });

    if (existingIndex !== -1) {
      if (playlist.currentIndex === existingIndex && player.videoSrc) {
        // Technically handled by currentVideoId check above, but just in case
        if (videoRef.current && videoRef.current.readyState >= 1) {
          videoRef.current.currentTime = loop.start;
          player.setRepeatA(loop.start);
          player.setRepeatB(loop.end);
          player.setRepeatEnabled(true);
          player.setIsPlaying(true);
          videoRef.current.play().catch(console.error);
          showFeedback(t('loopActive', preferenceSettings.language || 'id', { name: loop.name }));
          pendingLoopRef.current = null;
        }
      } else {
        // Change index then wait for load
        await playVideoIndexRef.current(existingIndex, playlist.playlist);
      }
      return;
    }

    // 2. If it's a file path not in playlist, we need to load it
    if (videoId.startsWith('/') || videoId.includes(':\\')) {
      const fs = electron.getFs();
      if (fs && fs.existsSync(videoId)) {
        const path = electron.getPath();
        const fileName = path ? path.basename(videoId) : videoId.split(/[/\\]/).pop() || videoId;
        const ext = path ? path.extname(fileName).toLowerCase() : (fileName.includes('.') ? '.' + fileName.split('.').pop()?.toLowerCase() : '');
        let mimeType = "video/mp4";
        if (['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
          mimeType = "audio/" + ext.substring(1);
        }
        const fakeFile = new File([""], fileName, { type: mimeType });
        Object.defineProperty(fakeFile, 'path', { value: videoId });

        const prev = playlist.playlist;
        const existsIndex = prev.findIndex((f: any) => f.path === videoId);
        if (existsIndex !== -1) {
          await playVideoIndexRef.current(existsIndex, prev);
        } else {
          const updated = [...prev, fakeFile];
          playlist.setPlaylist(updated);
          await playVideoIndexRef.current(updated.length - 1, updated);
        }
      } else {
        pendingLoopRef.current = null;
        showFeedback(t('videoNotFound', preferenceSettings.language || 'id') + ' ⚠️');
      }
    } else if (videoId.startsWith('http')) {
       pendingLoopRef.current = null;
       showFeedback(t('videoNotInPlaylist', preferenceSettings.language || 'id') + ' ⚠️');
    }
  }, [playlist, player, showFeedback, electron, preferenceSettings.language]);

  const saveFile = useCallback(async (blob: Blob, suggestedName: string, options: { description: string, accept: Record<string, string[]> }) => {
    // 1. Try Electron IPC
    if (isElectron) {
      try {
        const ipc = getIpcRenderer();
        if (ipc && typeof ipc.invoke === 'function') {
          const arrayBuffer = await blob.arrayBuffer();
          // Use Buffer if available (nodeIntegration: true)
          let base64;
          if (typeof Buffer !== 'undefined') {
            base64 = Buffer.from(arrayBuffer).toString('base64');
          } else {
            base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          }
          
          const result = await ipc.invoke('save-file', { 
            fileName: suggestedName, 
            data: base64, 
            contentType: blob.type,
            options
          });
          
          if (result.success) return true;
          if (result.cancelled) return false;
          // If error, fall through to web methods
        }
      } catch (e) {
        console.warn('Electron save failed, falling back:', e);
      }
    }

    // Auto-number filename for browser downloads if already downloaded in this session
    const resolvedWebName = resolveBrowserDownloadName(suggestedName);

    // 2. Try File System Access API
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: resolvedWebName,
          types: [options],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return false;
      console.warn('SaveFilePicker failed, falling back:', err);
    }

    // 3. Native Download Fallback (Common across all browsers)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resolvedWebName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // We can't easily know if the user cancelled the native dialog,
    // so we return true and hope for the best.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }, [isElectron, getIpcRenderer]);

  const exportSrtFile = useCallback(async () => {
    const vtt = subtitles.generateVttFromBrowserData(subtitles.subOffset);
    const srt = vtt.replace('WEBVTT\n\n', '').replace(/\./g, ',');
    
    let baseName = 'NightHUB_Subtitles';
    const currentFile = playlist.playlist[playlist.currentIndex];
    if (currentFile && currentFile.name) {
      baseName = currentFile.name.replace(/\.[^/.]+$/, "");
    }
    
    const blob = new Blob([srt], { type: 'text/plain' });
    const fileName = `${baseName}.edited.srt`;
    
    const success = await saveFile(blob, fileName, {
      description: 'Subtitle File',
      accept: {'text/plain': ['.srt']}
    });
    
    if (success) {
      showFeedback(t('srtExported', preferenceSettings.language || 'id'));
    }
  }, [subtitles, playlist, showFeedback, isElectron, getIpcRenderer, saveFile]);

  const saveSubtitleEdits = useCallback((updatedText?: string, updatedStart?: number, updatedEnd?: number) => {
    if (!subtitles.editingSubId) return;
    const newSubs = subtitles.subBrowserData.map(s => {
      if (s.id === subtitles.editingSubId) {
        return {
          ...s,
          text: updatedText !== undefined ? updatedText : subtitles.editingSubText,
          start: updatedStart !== undefined ? updatedStart : s.start,
          end: updatedEnd !== undefined ? updatedEnd : s.end
        };
      }
      return s;
    });
    newSubs.sort((a, b) => a.start - b.start);
    subtitles.setSubBrowserData(newSubs);
    
    // Update the actual subtitle track URL so the video player reflects the changes
    const newVtt = subtitles.generateVttFromBrowserData(subtitles.subOffset, newSubs);
    const blob = new Blob([newVtt], { type: 'text/vtt' });
    if (subtitles.subtitleUrl) URL.revokeObjectURL(subtitles.subtitleUrl);
    subtitles.setSubtitleUrl(URL.createObjectURL(blob));
    
    subtitles.setEditingSubId(null);
    subtitles.setEditingSubText('');
    showFeedback(t('subtitleUpdated', preferenceSettings.language || 'id'));
  }, [subtitles, showFeedback, preferenceSettings.language]);

  const handleSubBrowserDataChange = useCallback((updatedData: any[]) => {
    subtitles.setSubBrowserData(updatedData);
    const newVtt = subtitles.generateVttFromBrowserData(subtitles.subOffset, updatedData);
    const blob = new Blob([newVtt], { type: 'text/vtt' });
    if (subtitles.subtitleUrl) URL.revokeObjectURL(subtitles.subtitleUrl);
    subtitles.setSubtitleUrl(URL.createObjectURL(blob));
  }, [subtitles]);

  const handleSelectSub = useCallback((id: string, text: string, start: number) => {
    subtitles.setEditingSubId(id);
    subtitles.setEditingSubText(text);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
    }
  }, [subtitles]);

  const togglePlay = () => {
    if (suppressPlayToggleRef.current) {
      suppressPlayToggleRef.current = false;
      return;
    }
    player.setIsPlaying(prev => {
      const newState = !prev;
      electron.logToMain(`Playback toggled: ${newState ? 'Playing' : 'Paused'}`);
      if (!newState) {
        setTimeout(() => {
          captureAndSaveCurrentFrame();
        }, 50);
      }
      return newState;
    });
    setContextMenu(prev => ({ ...prev, show: false }));
  };

  const toggleAudioNormalize = () => {
    player.toggleAudioNormalize();
    showFeedback(!player.isAudioNormalized ? t('audioNormalizeOn', preferenceSettings.language || 'id') : t('audioNormalizeOff', preferenceSettings.language || 'id'));
  };

  const clearPlaylist = () => {
    playlist.setPlaylist([]);
    stopPlayback();
  };

  const savePlaylist = () => {
    if (playlist.playlist.length === 0) {
      showFeedback(t('collectionEmpty', preferenceSettings.language || 'id'));
      return;
    }
    setCollectionName('');
    setIsExportingJson(false);
    setShowSaveModal(true);
  };

  const exportJson = () => {
    if (playlist.playlist.length === 0) {
      showFeedback(t('collectionEmpty', preferenceSettings.language || 'id'));
      return;
    }
    setCollectionName('');
    setIsExportingJson(true);
    setShowSaveModal(true);
  };

  const importJson = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const collection = JSON.parse(text);
          if (collection && collection.name && collection.files) {
            playlist.setPlaylist([]);
            stopPlayback();

            const reconstructed = collection.files.map((item: any) => {
              return {
                name: item.name,
                path: item.path,
                isStream: item.isStream,
                url: item.url,
                type: item.type,
                size: item.size
              };
            });

            playlist.setPlaylist(reconstructed);
            playlist.setCurrentIndex(0);
            setShowPlaylist(true);

            const newCollection: SavedCollection = {
              id: Date.now().toString(),
              name: collection.name,
              files: reconstructed.map((file: any) => {
                if (file.isStream) {
                  return { name: file.name, path: file.path, isStream: true, url: file.url, type: 'video/mp4', size: 0 };
                }
                return { name: file.name, path: file.path, type: file.type, size: file.size };
              }),
              createdAt: Date.now()
            };

            setSavedCollections(prev => {
              const updated = [newCollection, ...prev];
              dbService.saveCollection(newCollection);
              return updated;
            });

            showFeedback(t('collectionImportedAndSaved', preferenceSettings.language || 'id', { name: collection.name }));

            if (reconstructed.length > 0) {
              const firstPlayableIndex = reconstructed.findIndex((item: any) => item.isStream || item.path);
              if (firstPlayableIndex !== -1) {
                playVideoIndex(firstPlayableIndex, reconstructed);
              }
            }
          } else {
            showFeedback(t('invalidJsonFormat', preferenceSettings.language || 'id'));
          }
        } catch (err) {
          showFeedback(t('failedToReadJson', preferenceSettings.language || 'id'));
        }
      };
      input.click();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmSaveCollection = async () => {
    if (!collectionName.trim()) {
      showFeedback(t('pleaseEnterCollectionName', preferenceSettings.language || 'id'));
      return;
    }

    const playlistData = playlist.playlist.map(file => {
      if ((file as any).isStream) {
        return { name: file.name, path: (file as any).path, isStream: true, url: (file as any).url, type: 'video/mp4', size: 0 };
      }
      return { name: file.name, path: (file as any).path, type: file.type, size: file.size };
    });

    const newCollection: SavedCollection = {
      id: Date.now().toString(),
      name: collectionName.trim(),
      files: playlistData,
      createdAt: Date.now()
    };

    if (isExportingJson) {
      try {
        const jsonString = JSON.stringify(newCollection, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const fileName = `${collectionName.trim().replace(/\s+/g, '_')}.json`;
        
        const success = await saveFile(blob, fileName, {
          description: 'JSON Collection File',
          accept: {'application/json': ['.json']}
        });

        if (success) {
          showFeedback(t('collectionExported', preferenceSettings.language, { name: collectionName }));
          setIsExportingJson(false);
          setShowSaveModal(false);
        }
      } catch (err) {
        console.error(err);
        showFeedback(t('failedToExportCollection', preferenceSettings.language || 'id'));
      }
    } else {
      const updatedCollections = [newCollection, ...savedCollections];
      setSavedCollections(updatedCollections);
      await dbService.saveCollection(newCollection);
      showFeedback(t('collectionSaved', preferenceSettings.language, { name: collectionName }));
    }
    
    setShowSaveModal(false);
  };

  const loadPlaylist = () => {
    setShowLoadModal(true);
  };

  const confirmLoadCollection = async (collection: SavedCollection, playIndex?: number) => {
    try {
      playlist.setPlaylist([]);
      stopPlayback();

      const reconstructed = collection.files.map((item: any) => {
        let itemPath = item.path || '';
        if (!itemPath) {
          const matchInLib = playlistRef.current.playlist.find(f => isSameMediaFile(item, f));
          if (matchInLib) {
            itemPath = (matchInLib as any).path || getRealFilePath(matchInLib) || '';
          }
        }
        return {
          name: item.name,
          path: itemPath,
          fullPath: itemPath,
          isStream: item.isStream,
          url: item.url,
          type: item.type,
          size: item.size
        } as unknown as File;
      });
      
      playlist.setPlaylist(reconstructed);
      
      // Use queueThumbnails to handle thumbnails with queueing and caching
      playlist.queueThumbnails(reconstructed);
      
      setShowLoadModal(false);
      setShowPlaylist(true);
      showFeedback(t('collectionLoaded', preferenceSettings.language || 'id', { name: collection.name }));
      
      if (reconstructed.length > 0) {
        const indexToPlay = playIndex !== undefined ? playIndex : reconstructed.findIndex(item => (item as any).isStream || (item as any).path);
        if (indexToPlay !== -1) {
          playVideoIndex(indexToPlay, reconstructed);
        } else {
          setShowPlaylist(true);
        }
      }
    } catch (e) {
      console.error('Failed to load collection:', e);
      playlist.setPlaylist([]);
      stopPlayback();
      showFeedback(t('failedToLoadCollection', preferenceSettings.language || 'id'));
    }
  };

  const deleteCollection = async (id: string) => {
    const updated = savedCollections.filter(c => c.id !== id);
    setSavedCollections(updated);
    await dbService.deleteCollection(id);
    showFeedback(t('collectionDeleted', preferenceSettings.language || 'id'));
  };

  const createPlaylist = async (name: string, files: any[]) => {
    const resolvedFiles = files.map((item: any) => {
      const realPath = getRealFilePath(item) || item.path || '';
      return {
        ...item,
        path: realPath
      };
    });

    const newCollection: SavedCollection = {
      id: Math.random().toString(36).substring(2, 11),
      name,
      files: resolvedFiles,
      createdAt: Date.now()
    };
    const updated = [newCollection, ...savedCollections];
    setSavedCollections(updated);
    await dbService.saveCollection(newCollection);
    showFeedback(t('collectionSaved', preferenceSettings.language || 'id', { name }));
  };

  const updateCollection = async (collection: SavedCollection) => {
    const resolvedFiles = collection.files.map((item: any) => {
      const realPath = getRealFilePath(item) || item.path || '';
      return {
        ...item,
        path: realPath
      };
    });

    const updatedCol = {
      ...collection,
      files: resolvedFiles
    };

    const updated = savedCollections.map(c => c.id === collection.id ? updatedCol : c);
    setSavedCollections(updated);
    await dbService.saveCollection(updatedCol);
    
    if (collection.id === 'play_queue') {
      const isCleared = collection.files.length === 0;
      if (preferenceSettings.language === 'id') {
        showFeedback(isCleared ? 'Antrean putar berhasil dikosongkan!' : 'Antrean putar berhasil diperbarui!');
      } else {
        showFeedback(isCleared ? 'Play queue cleared!' : 'Play queue updated successfully!');
      }
    } else {
      showFeedback(preferenceSettings.language === 'id' ? `Playlist "${collection.name}" berhasil diperbarui!` : `Playlist "${collection.name}" updated successfully!`);
    }
  };

  const handleVideoError = (e: any) => {
    const video = e.target as HTMLVideoElement;
    let errorMsg = t('videoPlayFailed', preferenceSettings.language || 'id');
    
    if (video.error) {
      switch (video.error.code) {
        case 1: errorMsg = t('videoErrorAborted', preferenceSettings.language || 'id'); break;
        case 2: errorMsg = t('videoErrorNetwork', preferenceSettings.language || 'id'); break;
        case 3: errorMsg = t('videoErrorDecode', preferenceSettings.language || 'id'); break;
        case 4: errorMsg = t('videoErrorSrcNotSupported', preferenceSettings.language || 'id'); break;
      }
    }
    
    player.setVideoError(errorMsg);
    player.setIsPlaying(false);
    electron.logToMain(`Video Error: ${errorMsg} (Code: ${video.error?.code})`);
  };

  const handleNetworkStream = () => {
    if (networkUrl.trim()) {
      const url = networkUrl.trim();
      
      try {
        new URL(url);
      } catch (e) {
        showFeedback(t('invalidStreamLink', preferenceSettings.language || 'id'));
        return;
      }

      electron.logToMain(`Opening network stream: ${url}`);
      
      const streamFile = {
        name: url.split('/').pop()?.split('?')[0] || url,
        path: url,
        isStream: true,
        url: url,
        type: 'video/mp4',
        size: 0,
      } as unknown as File;
      
      const newPlaylist = [...playlist.playlist, streamFile];
      playlist.setPlaylist(newPlaylist);
      playVideoIndex(newPlaylist.length - 1, newPlaylist);
      
      const key = streamFile.name + streamFile.size;
      if (!playlist.thumbnails[key]) {
        playlist.generateThumbnail(streamFile).then(thumb => {
          if (thumb) {
            playlist.setThumbnails(prev => ({ ...prev, [key]: thumb }));
          }
        });
      }
      
      setShowNetworkModal(false);
      setNetworkUrl('');
      showFeedback(t('openingStream', preferenceSettings.language || 'id'));
    }
  };

  const captureScreenshot = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(async (blob) => {
          if (!blob) {
            showFeedback(t('failedToCaptureScreenshot', preferenceSettings.language || 'id'));
            return;
          }
          
          let baseName = 'NightHUB_Capture';
          const currentFile = playlist.playlist[playlist.currentIndex];
          if (currentFile && currentFile.name) {
            baseName = currentFile.name.replace(/\.[^/.]+$/, "");
          }
          const { dateStr, timeStr } = getLocalTimestampStrings();
          const fileName = `${baseName}_Capture_${dateStr}_${timeStr}.png`;

          const success = await saveFile(blob, fileName, {
            description: 'Image File',
            accept: {'image/png': ['.png']}
          });

          if (success) {
            showFeedback(t('screenshotSaved', preferenceSettings.language || 'id'));
            electron.logToMain('Screenshot captured');
          }
        }, 'image/png');
        
      } catch (error) {
        console.warn('Failed to capture screenshot (CORS issue):', error);
        showFeedback(t('screenshotCorsError', preferenceSettings.language || 'id'));
      }
    }
  };

  const makeFrameAsThumbnail = async () => {
    if (!videoRef.current || !currentVideoIdRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const key = currentVideoIdRef.current;
        
        await dbService.saveThumbnail(key, dataUrl);
        playlist.setThumbnails(prev => ({ ...prev, [key]: dataUrl }));
        
        showFeedback(t('thumbnailGenerated', preferenceSettings.language || 'id'));
        electron.logToMain('Frame captured and set as thumbnail');
      } catch (error) {
        console.warn('Failed to capture frame for thumbnail (CORS issue):', error);
        showFeedback(t('thumbnailCorsError', preferenceSettings.language || 'id'));
      }
    }
    setContextMenu(prev => ({ ...prev, show: false }));
  };

  const toggleRecording = () => {
    if (!videoRef.current) return;

    if (isRecording) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        showFeedback(t('recordingSaved', preferenceSettings.language || 'id'));
        electron.logToMain('Recording stopped');
      }
    } else if (recordingCountdown === null) {
      // Start countdown
      let count = 3;
      setRecordingCountdown(count);
      
      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setRecordingCountdown(count);
        } else {
          clearInterval(interval);
          setRecordingCountdown(null);
          startActualRecording();
        }
      }, 1000);
    }
  };

  const startActualRecording = () => {
    if (!videoRef.current) return;
    
    try {
      const stream = (videoRef.current as any).captureStream();
      
      // Try H264 MP4 (supported in newer Chromium/Electron)
      let options: MediaRecorderOptions = {};
      const mimeTypes = [
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4',
        'video/webm; codecs=h264',
        'video/webm; codecs=vp9'
      ];
      
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          options = { mimeType: type };
          break;
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, options);
      
      recordedChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: options.mimeType || 'video/mp4' });
        
        let baseName = 'NightHUB_Record';
        const currentFile = playlist.playlist[playlist.currentIndex];
        if (currentFile && currentFile.name) {
          baseName = currentFile.name.replace(/\.[^/.]+$/, "");
        }
        const { dateStr, timeStr } = getLocalTimestampStrings();
        const fileName = `${baseName}_Record_${dateStr}_${timeStr}.mp4`;
        
        const success = await saveFile(blob, fileName, {
          description: 'Video File',
          accept: {'video/mp4': ['.mp4'], 'video/webm': ['.webm']}
        });
        
        if (success) {
          showFeedback(t('recordingSaved', preferenceSettings.language || 'id'));
          electron.logToMain('Recording saved');
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      showFeedback(t('recordingStarted', preferenceSettings.language || 'id'));
      electron.logToMain('Recording started');
    } catch (err) {
      console.error("Error starting recording:", err);
      setIsRecording(false);
      showFeedback(t('recordingFailed', preferenceSettings.language || 'id'));
      electron.logToMain(`Recording error: ${err}`);
    }
  };

  const [isExportingTrim, setIsExportingTrim] = useState(false);
  const [trimExportStatus, setTrimExportStatus] = useState<'idle' | 'exporting' | 'completed' | 'error'>('idle');
  const trimStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTrimMode, setIsTrimMode] = useState(false);

  const handleToggleTrim = useCallback(() => {
    if (!player.videoSrc) {
      showFeedback(t('noVideoToTrim', preferenceSettings.language || 'id'));
      return;
    }
    setIsTrimMode(prev => {
      const next = !prev;
      setShowControls(true);
      showFeedback(next 
        ? t('trimOpened', preferenceSettings.language || 'id')
        : t('trimClosed', preferenceSettings.language || 'id')
      );
      return next;
    });
  }, [player.videoSrc, preferenceSettings.language]);

  const toggleTrimRef = useRef(handleToggleTrim);
  toggleTrimRef.current = handleToggleTrim;

  const handleExportTrimSegment = useCallback(async ({ 
    startTime, 
    endTime, 
    duration, 
    accurate = true,
    customName
  }: { 
    startTime: number; 
    endTime: number; 
    duration: number; 
    accurate?: boolean;
    customName?: string;
  }) => {
    if (duration <= 0.1 || startTime >= endTime) {
      showFeedback(t('trimInvalidRange', preferenceSettings.language || 'id'));
      return false;
    }

    if (trimStatusTimeoutRef.current) clearTimeout(trimStatusTimeoutRef.current);
    setIsExportingTrim(true);
    setTrimExportStatus('exporting');
    showFeedback(t('trimExportingToast', preferenceSettings.language || 'id'), 4500);

    const currentFile = playlist.playlist[playlist.currentIndex];
    let baseName = 'video';
    if (currentFile && currentFile.name) {
      baseName = currentFile.name.replace(/\.[^/.]+$/, "");
    } else if (player.videoSrc) {
      try {
        const u = new URL(player.videoSrc);
        const pathname = u.pathname.split('/').pop() || 'stream';
        baseName = pathname.replace(/\.[^/.]+$/, "");
      } catch {
        baseName = 'video';
      }
    }

    const cleanTimeStr = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m.toString().padStart(2, '0')}-${s.toString().padStart(2, '0')}`;
    };

    const cleanLoopSuffix = customName ? `_${customName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_')}` : '';
    const suggestedName = `${baseName}${cleanLoopSuffix}_trim_${cleanTimeStr(startTime)}_${cleanTimeStr(endTime)}.mp4`;

    // 1. Electron with local file: utilize native FFmpeg background process
    let filePath: string | null = null;
    if (currentFile) {
      filePath = electron.getPathForFile(currentFile) || (currentFile as any).path || null;
    }
    if (!filePath && player.videoSrc && !player.videoSrc.startsWith('blob:')) {
      filePath = player.videoSrc;
    }

    if (electron.isElectron && filePath) {
      try {
        const result = await electron.trimVideoSegment({
          inputPath: filePath,
          startTime,
          duration,
          suggestedName,
          accurate
        });

        setIsExportingTrim(false);
        if (result.success) {
          setTrimExportStatus('completed');
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('success');
          }
          if (trimStatusTimeoutRef.current) clearTimeout(trimStatusTimeoutRef.current);
          trimStatusTimeoutRef.current = setTimeout(() => {
            setTrimExportStatus('idle');
          }, 4500);

          showFeedback(t('trimExportSuccess', preferenceSettings.language || 'id'));
          electron.logToMain(`Trim segment exported successfully: ${result.filePath} (method: ${result.method})`);
          return true;
        } else if (result.cancelled) {
          setTrimExportStatus('idle');
          return false;
        } else {
          console.error('FFmpeg trim error:', result.error);
          setTrimExportStatus('error');
          if (preferenceSettingsRef.current.playDownloadSound !== false) {
            playNotificationSound('failure');
          }
          if (trimStatusTimeoutRef.current) clearTimeout(trimStatusTimeoutRef.current);
          trimStatusTimeoutRef.current = setTimeout(() => {
            setTrimExportStatus('idle');
          }, 4000);
          showFeedback(t('trimExportFailed', preferenceSettings.language || 'id'));
          return false;
        }
      } catch (err) {
        console.error('FFmpeg trim invocation error:', err);
        setIsExportingTrim(false);
        setTrimExportStatus('error');
        if (preferenceSettingsRef.current.playDownloadSound !== false) {
          playNotificationSound('failure');
        }
        if (trimStatusTimeoutRef.current) clearTimeout(trimStatusTimeoutRef.current);
        trimStatusTimeoutRef.current = setTimeout(() => {
          setTrimExportStatus('idle');
        }, 4000);
      }
    }

    // 2. Web browser or blob stream fallback: use an offscreen background video element
    // so the main Player is completely independent, never interrupted, and can be played/watched manually!
    let bgVideo: HTMLVideoElement | null = null;
    let bgSrcUrl: string | null = null;
    try {
      bgVideo = document.createElement('video');
      bgVideo.muted = true;
      bgVideo.playsInline = true;
      bgVideo.preload = 'auto';

      if (player.videoSrc) {
        bgVideo.src = player.videoSrc;
      } else if (currentFile) {
        bgSrcUrl = URL.createObjectURL(currentFile);
        bgVideo.src = bgSrcUrl;
      } else if (videoRef.current && videoRef.current.src) {
        bgVideo.src = videoRef.current.src;
      } else {
        throw new Error('No video source available for trimming');
      }

      await new Promise<void>((res, rej) => {
        if (!bgVideo) return rej(new Error('Background video null'));
        if (bgVideo.readyState >= 1) return res();
        const onLoaded = () => {
          bgVideo?.removeEventListener('loadedmetadata', onLoaded);
          res();
        };
        const onErr = () => {
          bgVideo?.removeEventListener('error', onErr);
          rej(new Error('Failed to load video metadata in background'));
        };
        bgVideo.addEventListener('loadedmetadata', onLoaded);
        bgVideo.addEventListener('error', onErr);
        bgVideo.load();
      });

      const stream = (bgVideo as any).captureStream ? (bgVideo as any).captureStream() : (bgVideo as any).mozCaptureStream ? (bgVideo as any).mozCaptureStream() : null;
      if (!stream) {
        throw new Error('captureStream is not supported in this browser environment');
      }

      let recorderOptions: MediaRecorderOptions = {};
      const candidateTypes = [
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4',
        'video/webm; codecs=h264',
        'video/webm; codecs=vp9',
        'video/webm'
      ];
      for (const type of candidateTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          recorderOptions = { mimeType: type };
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const trimPromise = new Promise<Blob>((resolve, reject) => {
        let checkInterval: any = null;

        mediaRecorder.onstop = () => {
          if (checkInterval) clearInterval(checkInterval);
          const finalBlob = new Blob(chunks, { type: recorderOptions.mimeType || 'video/mp4' });
          resolve(finalBlob);
        };

        mediaRecorder.onerror = (recErr) => {
          if (checkInterval) clearInterval(checkInterval);
          reject(recErr);
        };

        const handleSeeked = () => {
          if (!bgVideo) return;
          bgVideo.removeEventListener('seeked', handleSeeked);
          try {
            mediaRecorder.start(100);
            bgVideo.play().catch(reject);

            checkInterval = setInterval(() => {
              if (!bgVideo || bgVideo.currentTime >= endTime || bgVideo.ended) {
                clearInterval(checkInterval);
                checkInterval = null;
                if (mediaRecorder.state !== 'inactive') {
                  mediaRecorder.stop();
                }
                bgVideo?.pause();
              }
            }, 30);
          } catch (err) {
            reject(err);
          }
        };

        bgVideo.addEventListener('seeked', handleSeeked);
        bgVideo.currentTime = startTime;
      });

      const recordedBlob = await trimPromise;

      const saved = await saveFile(recordedBlob, suggestedName, {
        description: 'Video File',
        accept: { 'video/mp4': ['.mp4'], 'video/webm': ['.webm'] }
      });

      setIsExportingTrim(false);
      if (saved) {
        setTrimExportStatus('completed');
        if (preferenceSettingsRef.current.playDownloadSound !== false) {
          playNotificationSound('success');
        }
        if (trimStatusTimeoutRef.current) clearTimeout(trimStatusTimeoutRef.current);
        trimStatusTimeoutRef.current = setTimeout(() => {
          setTrimExportStatus('idle');
        }, 4500);

        showFeedback(t('trimExportSuccess', preferenceSettings.language || 'id'));
        return true;
      } else {
        setTrimExportStatus('idle');
        return false;
      }
    } catch (err) {
      console.error('Browser trim export error:', err);
      setIsExportingTrim(false);
      setTrimExportStatus('error');
      if (preferenceSettingsRef.current.playDownloadSound !== false) {
        playNotificationSound('failure');
      }
      if (trimStatusTimeoutRef.current) clearTimeout(trimStatusTimeoutRef.current);
      trimStatusTimeoutRef.current = setTimeout(() => {
        setTrimExportStatus('idle');
      }, 4000);
      showFeedback(t('trimExportFailed', preferenceSettings.language || 'id'));
      return false;
    } finally {
      if (bgVideo) {
        bgVideo.pause();
        bgVideo.src = '';
        bgVideo.load();
      }
      if (bgSrcUrl) {
        URL.revokeObjectURL(bgSrcUrl);
      }
    }
  }, [playlist, player, electron, preferenceSettings.language, saveFile, showFeedback]);

  const updateProgressFromMouse = (clientX: number) => {
    if (!videoRef.current || !progressBarRef.current) return;
    const bounds = progressBarRef.current.getBoundingClientRect();
    let percent = (clientX - bounds.left) / bounds.width;
    percent = Math.max(0, Math.min(1, percent));
    const duration = isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
    videoRef.current.currentTime = percent * duration;
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        updateProgressFromMouse(e.clientX);
      }
    };
    
    const handleGlobalMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
        if (wasPlayingBeforeScrubRef.current && videoRef.current) {
          videoRef.current.play().catch(() => {});
          player.setIsPlaying(true);
        }
      }
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isScrubbing]);

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressBarRef.current) return;
    
    wasPlayingBeforeScrubRef.current = !videoRef.current.paused;
    if (wasPlayingBeforeScrubRef.current) {
      videoRef.current.pause();
      player.setIsPlaying(false);
    }
    
    setIsScrubbing(true);
    updateProgressFromMouse(e.clientX);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressBarRef.current) return;
    
    const bounds = progressBarRef.current.getBoundingClientRect();
    let percent = (e.clientX - bounds.left) / bounds.width;
    percent = Math.max(0, Math.min(1, percent));
    
    setHoverProgress(percent * 100);
    const duration = isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
    const time = percent * duration;
    setHoverTime(time);
    
    if (previewVideoRef.current && isFinite(time)) {
      previewVideoRef.current.currentTime = time;
    }

    if (isScrubbing) {
      updateProgressFromMouse(e.clientX);
    }
  };

  const handleProgressMouseLeave = () => {
    setHoverProgress(null);
  };

  const formatTime = useCallback((timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '00:00';
    const h = Math.floor(timeInSeconds / 3600);
    const m = Math.floor((timeInSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  }, []);

  const formatTimeWithMs = useCallback((timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '00:00.000';
    const h = Math.floor(timeInSeconds / 3600);
    const m = Math.floor((timeInSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    const ms = Math.floor((timeInSeconds % 1) * 1000).toString().padStart(3, '0');
    return h > 0 ? `${h}:${m}:${s}.${ms}` : `${m}:${s}.${ms}`;
  }, []);

  const handleStepFrame = useCallback((direction: -1 | 1) => {
    if (!videoRef.current || !player.videoSrc) return;
    const vid = videoRef.current;

    // Memicu pause jika saat sedang main (Shift+< dan Shift+>)
    if (!vid.paused || player.isPlaying) {
      vid.pause();
      player.setIsPlaying(false);
    }

    const fps = 30;
    const frameStep = 1 / fps;
    const current = vid.currentTime;
    const targetTime = Math.max(0, Math.min(vid.duration || 0, current + (direction * frameStep)));

    vid.currentTime = targetTime;
    player.setCurrentTime(targetTime);
    if (vid.duration > 0) {
      player.setProgress((targetTime / vid.duration) * 100);
    }

    const timeStr = formatTimeWithMs(targetTime);
    const feedbackText = direction > 0
      ? `${t('frameStepForward', preferenceSettings.language || 'id')} (+1 Frame · ${timeStr})`
      : `${t('frameStepBackward', preferenceSettings.language || 'id')} (-1 Frame · ${timeStr})`;
    showFeedback(feedbackText);
  }, [player.videoSrc, player.isPlaying, formatTimeWithMs, preferenceSettings.language]);

  const handleProgressUpdate = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    if (videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      player.setBufferedProgress((bufferedEnd / dur) * 100 || 0);
    } else {
      player.setBufferedProgress(0);
    }
  };

  // --- Poll Proxy Status ---
  useEffect(() => {
    if (!player.originalVideoSrc) {
      player.setProxyProgress(0);
      return;
    }

    const ipc = getIpcRenderer();
    if (!ipc) return;

    const intervalId = setInterval(async () => {
      try {
        const status = await ipc.invoke('get-proxy-status', player.originalVideoSrc);
        if (status && status.totalBytes && status.totalBytes > 0) {
          const progress = (status.downloadedBytes / status.totalBytes) * 100;
          player.setProxyProgress(progress);
          
          if (status.status === 'completed' || status.status === 'error') {
            clearInterval(intervalId);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [player.originalVideoSrc, player.setProxyProgress]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration;
    player.setProgress((curr / dur) * 100 || 0);
    player.setCurrentTime(curr);

    // Update buffered progress
    handleProgressUpdate();

    // Update active subtitle ID
    if (subtitles.subBrowserData.length > 0) {
      const activeSub = subtitles.subBrowserData.find(s => curr >= s.start && curr <= s.end);
      if (activeSub?.id !== subtitles.activeSubId) {
        subtitles.setActiveSubId(activeSub?.id || null);
      }
    }

    if (preferenceSettings.saveResume && currentVideoIdRef.current && curr > 5 && Math.abs(curr - lastSavedTimeRef.current) > 2) {
      dbService.saveProgress(currentVideoIdRef.current, curr, dur);
      lastSavedTimeRef.current = curr;
    }

    // A/B Repeat Logic
    if (player.repeatEnabled && player.repeatA !== null && player.repeatB !== null) {
      if (curr >= player.repeatB) {
        videoRef.current.currentTime = player.repeatA;
      }
    }
  };

  const handleEnded = () => {
    electron.logToMain('Video playback ended');
    
    // A/B Repeat logic takes precedence if active
    if (player.repeatEnabled && player.repeatA !== null && player.repeatB !== null) {
      if (videoRef.current) {
        videoRef.current.currentTime = player.repeatA;
        videoRef.current.play();
      }
      return;
    }

    if (playlist.repeatMode === 'current') {
      electron.logToMain('Replaying current video');
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    } else {
      const nextIdx = playlist.nextVideo();
      if (nextIdx !== -1) {
        playVideoIndex(nextIdx);
      } else {
        player.setIsPlaying(false);
      }
    }
  };

  const toggleFullscreen = () => {
    if (playerContainerRef.current) {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      electron.logToMain(`Fullscreen toggled: ${!isCurrentlyFullscreen ? 'Entering' : 'Exiting'}`);
      if (isCurrentlyFullscreen) {
        document.exitFullscreen();
      } else {
        playerContainerRef.current.requestFullscreen();
      }
    }
    setContextMenu({ ...contextMenu, show: false });
  };

  const togglePiP = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        electron.logToMain('Exiting PiP Mode');
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
        electron.logToMain('Entering PiP Mode');
      } else {
        showFeedback(t('pipNotSupported', preferenceSettings.language || 'id'));
      }
    } catch (error) {
      console.error('PiP error:', error);
      showFeedback(t('pipFailed', preferenceSettings.language || 'id'));
    }
    setContextMenu({ ...contextMenu, show: false });
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      player.setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [player]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnterPiP = () => player.setIsPiP(true);
    const handleLeavePiP = () => {
      player.setIsPiP(false);
      setShowPlayer(true);
      const ipc = electron.getIpcRenderer();
      if (ipc) {
        ipc.send('restore-window');
      }
    };

    video.addEventListener('enterpictureinpicture', handleEnterPiP);
    video.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnterPiP);
      video.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [player.videoSrc, player, setShowPlayer, electron]);

  // --- IPC Listener for Open With ---
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      const fs = (window as any).require('fs');
      const path = (window as any).require('path');

      const handleOpenFile = (event: any, filePath: string) => {
        openedFileViaIpcRef.current = true;
        electron.logToMain(`IPC Event: open-file received for ${filePath}`);
        const fileName = path.basename(filePath);
        const ext = path.extname(fileName).toLowerCase();
        let mimeType = "video/mp4";
        if (['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
          mimeType = "audio/" + ext.substring(1);
        }
        let fileSize = 0;
        try {
          if (fs && fs.existsSync(filePath)) {
            fileSize = fs.statSync(filePath).size;
          }
        } catch (e) {}

        const fakeFile = new File([""], fileName, { type: mimeType });
        Object.defineProperty(fakeFile, 'path', { value: filePath });
        if (fileSize > 0) {
          Object.defineProperty(fakeFile, 'size', { value: fileSize });
        }

        addFileToPlayQueue(fakeFile);

        // Add to playlist without overwriting and play immediately
        playlistRef.current.setPlaylist(prev => {
          const existsIndex = prev.findIndex((f: any) => isSameMediaFile(f, fakeFile));
          if (existsIndex !== -1) {
            setTimeout(() => {
              playVideoIndexRef.current(existsIndex, prev);
            }, 50);
            return prev;
          } else {
            const updated = [...prev, fakeFile];
            setTimeout(() => {
              playVideoIndexRef.current(updated.length - 1, updated);
            }, 50);
            return updated;
          }
        });
        playlistRef.current.queueThumbnails([fakeFile]);

        // Generate thumbnail for IPC file
        const key = (fakeFile as any).path || (fakeFile as any).fullPath || (fakeFile.name + fakeFile.size);
        playlistRef.current.generateThumbnail(fakeFile).then(thumb => {
          if (thumb) playlistRef.current.setThumbnails(prev => ({ ...prev, [key]: thumb }));
        });

        // Subtitle Detection
        try {
          const dirName = path.dirname(filePath);
          const baseName = path.parse(filePath).name;
          
          const possibleSubs = ['.srt', '.vtt', '.ass', '.ssa'].map((ext: string) => path.join(dirName, baseName + ext));
          let foundSub = null;
          for (const subPath of possibleSubs) {
            if (fs.existsSync(subPath)) {
              foundSub = subPath;
              break;
            }
          }
          
          if (foundSub) {
            const subContent = fs.readFileSync(foundSub, 'utf-8');
            let vttText = subContent;
            if (foundSub.endsWith('.srt')) {
              vttText = subtitlesRef.current.convertSrtToVtt(subContent);
            } else if (foundSub.endsWith('.ass') || foundSub.endsWith('.ssa')) {
              vttText = subtitlesRef.current.convertAssToVtt(subContent);
            }
            const blob = new Blob([vttText], { type: 'text/vtt' });
            subtitlesRef.current.setSubtitleUrl(URL.createObjectURL(blob));
            subtitlesRef.current.parseVttForBrowser(vttText);
            showFeedback(t('autoLoadedSubtitles', preferenceSettingsRef.current.language || 'id'));
          } else {
            subtitlesRef.current.setSubtitleUrl(null);
            subtitlesRef.current.setSubBrowserData([]);
          }
        } catch (e) {
          console.error("Error loading subtitles:", e);
          subtitlesRef.current.setSubtitleUrl(null);
          subtitlesRef.current.setSubBrowserData([]);
        }
      };

      const handleAppOpenedViaShortcut = () => {
        electron.logToMain("IPC Event: app-opened-via-shortcut received");
        openedViaShortcutRef.current = true;
        player.setVideoSrc(null);
        setShowPlayer(false);
        window.dispatchEvent(new CustomEvent('app-opened-via-shortcut'));
        window.dispatchEvent(new CustomEvent('focus-home-search'));
      };

      const handleToggleTrimIPC = () => {
        electron.logToMain("IPC Event: player-shortcut-toggle-trim received");
        toggleTrimRef.current();
      };

      ipcRenderer.on('open-file', handleOpenFile);
      ipcRenderer.on('app-opened-via-shortcut', handleAppOpenedViaShortcut);
      ipcRenderer.on('player-shortcut-toggle-trim', handleToggleTrimIPC);
      
      // Tell main process we are ready
      ipcRenderer.send('frontend-ready');
      
      return () => {
        ipcRenderer.removeListener('open-file', handleOpenFile);
        ipcRenderer.removeListener('app-opened-via-shortcut', handleAppOpenedViaShortcut);
        ipcRenderer.removeListener('player-shortcut-toggle-trim', handleToggleTrimIPC);
      };
    }
  }, []);

  // --- Event Listeners ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (matchesCommand(e, 'toggleTrim')) {
        e.preventDefault();
        toggleTrimRef.current();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const { ipcRenderer } = (window as any).require('electron');
        if (ipcRenderer) {
          ipcRenderer.send('show-find-view');
        }
        return;
      }
      
      if (showWebSniffer) return;

      if (!videoRef.current) return;

      if (matchesCommand(e, 'setPointA')) {
        e.preventDefault(); 
        if (videoRef.current) {
          const time = videoRef.current.currentTime;
          player.setRepeatA(time);
          if (player.repeatB !== null) player.setRepeatEnabled(true);
          showFeedback(t('pointA', preferenceSettings.language || 'id', { time: formatTime(time) }));
        }
        return;
      }

      if (matchesCommand(e, 'setPointB')) {
        e.preventDefault(); 
        if (videoRef.current) {
          const time = videoRef.current.currentTime;
          player.setRepeatB(time);
          if (player.repeatA !== null) player.setRepeatEnabled(true);
          showFeedback(t('pointB', preferenceSettings.language || 'id', { time: formatTime(time) }));
        }
        return;
      }

      if (matchesCommand(e, 'resetPointA')) {
        e.preventDefault();
        player.setRepeatA(null);
        return;
      }

      if (matchesCommand(e, 'resetPointB')) {
        e.preventDefault();
        player.setRepeatB(null);
        return;
      }

      if (matchesCommand(e, 'toggleABRepeat')) {
        e.preventDefault(); 
        if (player.repeatA === null || player.repeatB === null) {
          showFeedback(t('setPointsFirst', preferenceSettings.language || 'id'));
          return;
        }
        player.setRepeatEnabled(prev => !prev); 
        return;
      }

      if (matchesCommand(e, 'resetABRepeat')) {
        e.preventDefault();
        player.setRepeatA(null);
        player.setRepeatB(null);
        player.setRepeatEnabled(false);
        showFeedback(t('abResetFeedback', preferenceSettings.language || 'id'));
        return;
      }

      if (matchesCommand(e, 'stopPlayback')) {
        e.preventDefault();
        stopPlayback();
        showFeedback(t('stoppedFeedback', preferenceSettings.language || 'id'));
        return;
      }

      if (matchesCommand(e, 'restartVideo')) {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          showFeedback(t('startFromBeginning', preferenceSettings.language || 'id'));
        }
        return;
      }
    };

    const handleClick = () => {
      setContextMenu(prev => ({ ...prev, show: false }));
      setShowSpeedMenu(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [player.videoSrc, player.repeatA, player.repeatB, player.repeatEnabled, playlist, playlist.currentIndex, stopPlayback, showWebSniffer]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (player.isPlaying && !isTrimMode && !showPlaylist && !showSubSettings && !showSubBrowser && !contextMenu.show) setShowControls(false);
    }, 3000);
  };

  const playlistContent = useMemo(() => playlist.playlist.map((file, idx) => {
    const key = (file as any).path || (file as any).fullPath || (file.name + file.size);
    const displayTitle = file.name;
    const thumb = playlist.thumbnails[key];
    const isOffline = !(file instanceof Blob) && !(file as any).isStream && !(file as any).path;
    
    if (playlist.playlistViewMode === 'grid') {
      return (
        <div 
          key={idx} 
          className={`relative rounded-xl overflow-hidden transition-all group aspect-video bg-black/5 dark:bg-white/5 ${playlist.currentIndex === idx ? 'ring-2 ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'hover:ring-1 hover:ring-white/30'}`}
        >
          <div className="absolute inset-0 cursor-pointer z-0" onClick={() => playVideoIndex(idx)}>
            {thumb ? (
              <img src={thumb} alt={displayTitle} className={`w-full h-full object-cover transition-opacity ${playlist.currentIndex === idx ? 'opacity-30' : 'opacity-70 group-hover:opacity-100'}`} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                {isOffline ? <div className="text-[10px] text-rose-500 font-bold uppercase tracking-tighter">Offline</div> : <FileVideo size={24} />}
              </div>
            )}
            
            {/* Visualizer Overlay for Current Video */}
            {playlist.currentIndex === idx && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex items-end gap-[3px] h-8">
                  <div className={`w-1.5 bg-amber-500 rounded-t-sm ${player.isPlaying ? 'bar-1' : 'h-3'}`}></div>
                  <div className={`w-1.5 bg-amber-500 rounded-t-sm ${player.isPlaying ? 'bar-2' : 'h-6'}`}></div>
                  <div className={`w-1.5 bg-amber-500 rounded-t-sm ${player.isPlaying ? 'bar-3' : 'h-8'}`}></div>
                  <div className={`w-1.5 bg-amber-500 rounded-t-sm ${player.isPlaying ? 'bar-4' : 'h-4'}`}></div>
                  <div className={`w-1.5 bg-amber-500 rounded-t-sm ${player.isPlaying ? 'bar-5' : 'h-5'}`}></div>
                </div>
              </div>
            )}
            
            {/* Play/Current Indicators */}
            <div className="absolute top-2 left-2 flex gap-1 items-center z-10">
              {playlist.currentIndex === idx && (
                <div className="bg-amber-500 text-black p-1 rounded-md shadow-lg animate-pulse">
                  <Play size={10} fill="currentColor" />
                </div>
              )}
              {isOffline && (
                 <div className="bg-rose-500 text-white p-1 rounded-md shadow-lg">
                    <Video size={10} />
                 </div>
              )}
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex items-end p-2">
              <p className={`text-[10px] font-medium truncate w-full pr-6 ${playlist.currentIndex === idx ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300'}`}>{displayTitle}</p>
            </div>
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const newPlaylist = [...playlist.playlist];
              newPlaylist.splice(idx, 1);
              playlist.setPlaylist(newPlaylist);
              if (playlist.currentIndex === idx) {
                if (newPlaylist.length > 0) {
                  playVideoIndex(Math.min(idx, newPlaylist.length - 1));
                } else {
                  player.setOriginalVideoSrc(null);
                  player.setVideoSrc(null);
                  subtitles.setSubtitleUrl(null);
                }
              } else if (playlist.currentIndex > idx) {
                playlist.setCurrentIndex(playlist.currentIndex - 1);
              }
            }}
            className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-white/80 dark:bg-black/60 text-zinc-700 dark:text-zinc-300 hover:text-rose-500 hover:bg-white/60 dark:hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all z-10"
            title={preferenceSettings.language === 'id' ? 'Hapus dari Koleksi' : 'Remove from Collection'}
          >
            <Trash2 size={14} strokeWidth={2.5} />
          </button>
        </div>
      );
    }

    return (
      <div 
        key={idx} 
        className={`p-3 rounded-lg transition-all flex items-center gap-3 group ${playlist.currentIndex === idx ? 'bg-amber-500/20 border border-amber-500/50 text-amber-500 font-medium' : 'hover:bg-black/5 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300 border border-transparent'}`}
      >
        <div className="flex-1 flex items-center gap-3 cursor-pointer overflow-hidden" onClick={() => playVideoIndex(idx)}>
          {thumb ? (
            <img src={thumb} className="w-10 h-6 object-cover rounded bg-black/5 dark:bg-black/50 shrink-0" />
          ) : (
            <div className="w-10 h-6 flex items-center justify-center bg-black/5 dark:bg-black/50 rounded shrink-0">
              {isOffline ? <div className="text-[8px] text-rose-500 font-bold uppercase">OFF</div> : <FileVideo size={12} />}
            </div>
          )}
          <p className="text-sm truncate flex-1">{file.name}</p>
          {isOffline && <span className="text-[10px] text-rose-500/70 font-bold uppercase tracking-widest ml-1">Offline</span>}
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            const newPlaylist = [...playlist.playlist];
            newPlaylist.splice(idx, 1);
            playlist.setPlaylist(newPlaylist);
            if (playlist.currentIndex === idx) {
              if (newPlaylist.length > 0) {
                playVideoIndex(Math.min(idx, newPlaylist.length - 1));
              } else {
                player.setOriginalVideoSrc(null);
                player.setVideoSrc(null);
                subtitles.setSubtitleUrl(null);
              }
            } else if (playlist.currentIndex > idx) {
              playlist.setCurrentIndex(playlist.currentIndex - 1);
            }
          }}
          className="p-1.5 rounded text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title={preferenceSettings.language === 'id' ? 'Hapus dari Koleksi' : 'Remove from Collection'}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }), [playlist, player.isPlaying, playVideoIndex, player.setVideoSrc, subtitles.setSubtitleUrl]);

  const subtitleListContent = useMemo(() => {
    if (subtitles.subBrowserData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
          <MessageSquare size={32} className="opacity-50" />
          <p className="text-sm">{t('noSubtitlesLoaded', preferenceSettings.language)}</p>
        </div>
      );
    }
    return subtitles.subBrowserData.map((sub) => (
      <SubtitleItem
        key={sub.id}
        sub={sub}
        isActive={subtitles.activeSubId === sub.id}
        isEditing={subtitles.editingSubId === sub.id}
        onEdit={(id, text, start) => {
          subtitles.setEditingSubId(id);
          subtitles.setEditingSubText(text);
          if (videoRef.current) videoRef.current.currentTime = start;
        }}
        formatTime={formatTime}
      />
    ));
  }, [subtitles, formatTime]);

  // Keyboard Shortcuts
  useKeyboardShortcuts({
    onTogglePlay: () => {
      if (!player.videoSrc) {
        if (playlist.currentIndex !== -1) {
          playVideoIndex(playlist.currentIndex);
        } else if (playlist.playlist.length > 0) {
          const targetIndex = lastPlayedIndexRef.current >= 0 && lastPlayedIndexRef.current < playlist.playlist.length 
            ? lastPlayedIndexRef.current 
            : 0;
          playVideoIndex(targetIndex);
        }
      } else {
        togglePlay();
      }
    },
    onSeekForward: (amt) => applySkip(amt),
    onSeekBackward: (amt) => applySkip(-amt),
    onVolumeUp: () => {
      player.setIsMuted(false);
      player.setVolume(v => {
        const newVol = Math.min(1, (Math.round(v * 20) + 1) / 20);
        showFeedback(t('volume', preferenceSettings.language || 'id', { percent: Math.round(newVol * 100).toString() }));
        return newVol;
      });
    },
    onVolumeDown: () => {
      player.setVolume(v => {
        const newVol = Math.max(0, (Math.round(v * 20) - 1) / 20);
        showFeedback(t('volume', preferenceSettings.language || 'id', { percent: Math.round(newVol * 100).toString() }));
        if (newVol === 0) player.setIsMuted(true);
        return newVol;
      });
    },
    onToggleMute: () => {
      const newMute = !player.isMuted;
      player.setIsMuted(newMute);
      showFeedback(newMute ? t('mute', preferenceSettings.language || 'id') : t('volume', preferenceSettings.language || 'id', { percent: Math.round(player.volume * 100).toString() }));
    },
    onToggleFullscreen: () => player.toggleFullscreen(playerContainerRef),
    onNext: () => {
      const nextIdx = playlist.nextVideo();
      if (nextIdx !== -1) playVideoIndex(nextIdx);
    },
    onPrev: () => {
      const prevIdx = playlist.prevVideo();
      if (prevIdx !== -1) playVideoIndex(prevIdx);
    },
    onTogglePlaylist: () => setShowPlaylist(p => !p),
    onAddMarker: handleAddMarker,
    onCaptureScreenshot: () => captureScreenshot(),
    onToggleAudioNormalize: () => {
      player.toggleAudioNormalize();
      showFeedback(!player.isAudioNormalized ? t('audioNormalizeOn', preferenceSettings.language || 'id') : t('audioNormalizeOff', preferenceSettings.language || 'id'));
    },
    onCycleRotate: () => {
      const currentRot = videoSettings.rotation || 0;
      const newRot = (currentRot + 90) % 360;
      setVideoSettings(prev => ({ ...prev, rotation: newRot }));
      showFeedback(t('rotationFeedback', preferenceSettings.language || 'id', { degrees: newRot.toString() }));
    },
    onToggleRecording: toggleRecording,
    onToggleTrim: handleToggleTrim,
    onStepFrameBackward: () => handleStepFrame(-1),
    onStepFrameForward: () => handleStepFrame(1),

    // Extended shortcut handlers
    onSpeedUp: () => {
      const newSpd = Math.min(4, Math.round((player.playbackRate + 0.25) * 100) / 100);
      player.setSpeed(newSpd);
      showFeedback(`${newSpd}x`);
    },
    onSpeedDown: () => {
      const newSpd = Math.max(0.25, Math.round((player.playbackRate - 0.25) * 100) / 100);
      player.setSpeed(newSpd);
      showFeedback(`${newSpd}x`);
    },
    onResetSpeed: () => {
      player.setSpeed(1);
      showFeedback('1.0x');
    },
    onTogglePiP: () => player.togglePiP(),
    onCycleAspectRatio: () => {
      const modes: Array<"fill" | "contain" | "fit-horizontal" | "fit-vertical" | "original"> = [
        "contain", "fill", "fit-horizontal", "fit-vertical", "original"
      ];
      setVideoSizingMode(curr => {
        const next = modes[(modes.indexOf(curr) + 1) % modes.length];
        showFeedback(`Rasio: ${next.toUpperCase()}`);
        return next;
      });
    },
    onToggleFlipHorizontal: () => {
      setVideoSettings(v => {
        const n = !v.flipH;
        showFeedback(n ? 'Flip Horizontal ON' : 'Flip Horizontal OFF');
        return { ...v, flipH: n };
      });
    },
    onToggleEnhance: () => {
      setIsEnhance(e => {
        const n = !e;
        showFeedback(n ? 'Enhance ON' : 'Enhance OFF');
        return n;
      });
    },
    onToggleSuperRes: () => {
      setIsSuperRes(e => {
        const n = !e;
        showFeedback(n ? 'Super Resolution ON' : 'Super Resolution OFF');
        return n;
      });
    },
    onToggleAmbientMode: () => {
      setIsAmbientMode(e => {
        const n = !e;
        showFeedback(n ? 'Ambient ON' : 'Ambient OFF');
        return n;
      });
    },
    onToggleFrameInterpolation: () => {
      setIsFrameInterpolation(e => {
        const n = !e;
        showFeedback(n ? 'Smooth 60 FPS ON' : 'Smooth 60 FPS OFF');
        return n;
      });
    },
    onToggleShuffle: () => {
      playlist.setIsShuffle((s: boolean) => {
        const n = !s;
        showFeedback(n ? 'Shuffle ON' : 'Shuffle OFF');
        return n;
      });
    },
    onCycleRepeatMode: () => {
      playlist.setRepeatMode((m: "none" | "current" | "playlist") => {
        const next: "none" | "current" | "playlist" = m === 'none' ? 'playlist' : m === 'playlist' ? 'current' : 'none';
        showFeedback(`Repeat: ${next.toUpperCase()}`);
        return next;
      });
    },
    onClearPlaylist: () => {
      playlist.setPlaylist([]);
      playlist.setCurrentIndex(-1);
      showFeedback('Playlist dikosongkan');
    },
    onOpenWebSniffer: () => setShowWebSniffer(true),
    onOpenSettings: () => setShowSubSettings(true),
    onOpenShortcutsSheet: () => setShowShortcuts(true),
    onOpenMemoryManager: () => setShowMemoryManager(true),
    onOpenAudioSettings: () => setShowAudioSettings(true),
    onOpenSubSettings: () => setShowSubSettings(true),
    onOpenSubBrowser: () => setShowSubBrowser(true),
    onOpenNetworkStream: () => setShowNetworkModal(true),
    onMinimizeToHome: () => setShowPlayer(false),
    onToggleSwapChannels: () => {
      player.setIsSwapChannels(s => {
        const n = !s;
        showFeedback(n ? 'Swap Channels (L/R) ON' : 'Swap Channels (L/R) OFF');
        return n;
      });
    },
    onAudioDelayPlus: () => {
      player.setAudioDelay(d => {
        const n = Math.round((d + 0.05) * 100) / 100;
        showFeedback(`Audio Delay: ${Math.round(n * 1000)}ms`);
        return n;
      });
    },
    onAudioDelayMinus: () => {
      player.setAudioDelay(d => {
        const n = Math.round((d - 0.05) * 100) / 100;
        showFeedback(`Audio Delay: ${Math.round(n * 1000)}ms`);
        return n;
      });
    },
    onResetAudioDelay: () => {
      player.setAudioDelay(0);
      showFeedback('Audio Delay: 0ms');
    },
    onAudioBoostPlus: () => {
      player.setAudioBoost(b => {
        const n = Math.min(3, Math.round((b + 0.2) * 10) / 10);
        showFeedback(`Audio Boost: ${Math.round(n * 100)}%`);
        return n;
      });
    },
    onAudioBoostMinus: () => {
      player.setAudioBoost(b => {
        const n = Math.max(1, Math.round((b - 0.2) * 10) / 10);
        showFeedback(`Audio Boost: ${Math.round(n * 100)}%`);
        return n;
      });
    },
    onToggleSubtitles: () => {
      subtitles.setSubSettings((s: any) => {
        const n = !s.showSubtitles;
        showFeedback(n ? 'Subtitles ON' : 'Subtitles OFF');
        return { ...s, showSubtitles: n };
      });
    },
    onSubDelayPlus: () => {
      subtitles.setSubOffset((d: number) => {
        const n = Math.round((d + 0.05) * 100) / 100;
        showFeedback(`Sub Delay: ${Math.round(n * 1000)}ms`);
        return n;
      });
    },
    onSubDelayMinus: () => {
      subtitles.setSubOffset((d: number) => {
        const n = Math.round((d - 0.05) * 100) / 100;
        showFeedback(`Sub Delay: ${Math.round(n * 1000)}ms`);
        return n;
      });
    },
    onResetSubDelay: () => {
      subtitles.setSubOffset(0);
      showFeedback('Sub Delay: 0ms');
    },
    onSubSizeIncrease: () => {
      subtitles.setSubSettings((s: any) => {
        const n = Math.min(60, s.fontSize + 2);
        showFeedback(`Sub Size: ${n}px`);
        return { ...s, fontSize: n };
      });
    },
    onSubSizeDecrease: () => {
      subtitles.setSubSettings((s: any) => {
        const n = Math.max(12, s.fontSize - 2);
        showFeedback(`Sub Size: ${n}px`);
        return { ...s, fontSize: n };
      });
    },
    onToggleMarkerList: () => setShowMarkerList(m => !m),
    onMakeThumbnail: () => makeFrameAsThumbnail()
  }, !showWebSniffer);

  const currentFile = playlist.playlist[playlist.currentIndex];
  const isAudioFile = isAudioMedia(currentFile);
  const currentMetadata = currentVideoIdRef.current ? playlist.metadata[currentVideoIdRef.current] : null;
  const currentThumbnail = currentVideoIdRef.current ? playlist.thumbnails[currentVideoIdRef.current] : null;

  // Compute video style size
  const CW = containerSize.width || (playerContainerRef.current ? playerContainerRef.current.clientWidth : 0) || window.innerWidth;
  const CH = containerSize.height || (playerContainerRef.current ? playerContainerRef.current.clientHeight : 0) || window.innerHeight;
  const VW = videoDimensions.width || (videoRef.current ? videoRef.current.videoWidth : 0) || 1920;
  const VH = videoDimensions.height || (videoRef.current ? videoRef.current.videoHeight : 0) || 1080;

  const rotation = videoSettings.rotation || 0;
  const isSwapped = rotation % 180 !== 0;

  let targetWidth = '100%';
  let targetHeight = '100%';
  let objectFitMode = 'contain';

  if (videoSizingMode === 'contain') {
    if (isSwapped) {
      const r = Math.min(CW / VH, CH / VW);
      targetWidth = `${VW * r}px`;
      targetHeight = `${VH * r}px`;
    } else {
      const r = Math.min(CW / VW, CH / VH);
      targetWidth = `${VW * r}px`;
      targetHeight = `${VH * r}px`;
    }
    objectFitMode = 'fill';
  } else if (videoSizingMode === 'fit-horizontal') {
    if (isSwapped) {
      targetWidth = `${CW * (VW / VH)}px`;
      targetHeight = `${CW}px`;
    } else {
      targetWidth = `${CW}px`;
      targetHeight = `${CW * (VH / VW)}px`;
    }
    objectFitMode = 'fill';
  } else if (videoSizingMode === 'fit-vertical') {
    if (isSwapped) {
      targetWidth = `${CH}px`;
      targetHeight = `${CH * (VH / VW)}px`;
    } else {
      targetWidth = `${CH * (VW / VH)}px`;
      targetHeight = `${CH}px`;
    }
    objectFitMode = 'fill';
  } else if (videoSizingMode === 'fill') {
    if (isSwapped) {
      targetWidth = `${CH}px`;
      targetHeight = `${CW}px`;
    } else {
      targetWidth = `${CW}px`;
      targetHeight = `${CH}px`;
    }
    objectFitMode = 'fill';
  } else if (videoSizingMode === 'original') {
    targetWidth = `${VW}px`;
    targetHeight = `${VH}px`;
    objectFitMode = 'fill';
  }

  const isZoomed = (videoSettings.zoom || 1) > 1;
  const isPanned = (videoSettings.panX || 0) !== 0 || (videoSettings.panY || 0) !== 0;
  const videoTransform = `translate(calc(-50% + ${videoSettings.panX || 0}px), calc(-50% + ${videoSettings.panY || 0}px)) ${preferenceSettings.hardwareAcceleration !== false ? 'translateZ(0) ' : ''}scale(${videoSettings.zoom || 1}) rotate(${videoSettings.rotation || 0}deg) scaleX(${videoSettings.flipH ? -1 : 1}) scaleY(${videoSettings.flipV ? -1 : 1})`;

  const videoFilterStyle = [
    `brightness(${videoSettings.brightness}%) contrast(${videoSettings.contrast}%) saturate(${videoSettings.saturation}%) hue-rotate(${videoSettings.hue || 0}deg) grayscale(${videoSettings.grayscale || 0}%) sepia(${videoSettings.sepia || 0}%) invert(${videoSettings.invert || 0}%)`,
    isEnhance ? 'contrast(1.15) saturate(1.2) brightness(1.05)' : '',
    isSuperRes ? 'url(#super-res-sharpen)' : ''
  ].filter(Boolean).join(' ') || 'none';

  videoLayoutRef.current = {
    targetWidth,
    targetHeight,
    objectFitMode,
    videoTransform,
    filter: videoFilterStyle
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-transparent overflow-hidden">
      {!showWebSniffer && <TitleBar isSnifferOpen={false} />}
      <div className={`flex-1 flex flex-row min-h-0 overflow-hidden relative ${player.isFullscreen ? '' : 'p-2 gap-2'}`}>
        <div 
          ref={playerContainerRef}
          className={`flex-1 min-w-0 h-full relative bg-zinc-950/0 overflow-hidden flex items-center justify-center select-none ${isPanDragging ? 'cursor-grabbing' : isZoomed ? 'cursor-grab active:cursor-grabbing' : (!showControls && player.isPlaying ? 'cursor-none' : '')} ${showWebSniffer ? 'opacity-0 pointer-events-none' : ''} ${player.isFullscreen ? 'rounded-none border-none' : 'rounded-2xl border border-white/0'}`}
          onMouseDown={handlePlayerMouseDown}
          onWheel={handlePlayerWheel}
          onMouseMove={handleMouseMove}
        onMouseLeave={() => player.isPlaying && !isTrimMode && setShowControls(false)}
        onDragOver={(e) => { 
          const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
          if (!isFileDrag) return;
          e.preventDefault(); 
          e.stopPropagation(); 
          const activeModal = document.querySelector('[data-playlist-modal="true"], [data-modal], [role="dialog"]');
          if (activeModal && e.dataTransfer) {
            const target = e.target as Node;
            if (!activeModal.contains(target)) {
              e.dataTransfer.dropEffect = 'none';
            }
          } else if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDragEnter={(e) => { 
          const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
          if (!isFileDrag) return;
          e.preventDefault(); 
          const activeModal = document.querySelector('[data-playlist-modal="true"], [data-modal], [role="dialog"]');
          if (activeModal) {
            if (dragTimeoutRef.current) {
              clearTimeout(dragTimeoutRef.current);
              dragTimeoutRef.current = null;
            }
            setIsDragging(false);
            return;
          }

          if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
            if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
            dragTimeoutRef.current = setTimeout(() => {
              const stillHasModal = document.querySelector('[data-playlist-modal="true"], [data-modal], [role="dialog"]');
              if (stillHasModal) {
                setIsDragging(false);
                return;
              }
              setIsDragging(true);
            }, 80);
          }
        }}
        onDragLeave={(e) => { 
          const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
          if (!isFileDrag) return;
          e.preventDefault(); 
          if (e.currentTarget === e.target) {
            if (dragTimeoutRef.current) {
              clearTimeout(dragTimeoutRef.current);
              dragTimeoutRef.current = null;
            }
            setIsDragging(false); 
          }
        }}
        onDrop={(e) => {
          const isFileDrag = e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
          if (!isFileDrag) return;
          if (dragTimeoutRef.current) {
            clearTimeout(dragTimeoutRef.current);
            dragTimeoutRef.current = null;
          }
          handleDrop(e);
        }}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.bookmark-menu-container') || target.closest('.bookmark-trigger')) {
            // Let bookmark context menu (native) handle this event;
            return;
          }
          e.preventDefault();
          setContextMenu({ show: true, x: e.clientX, y: e.clientY });
        }}
      >
        {/* Dynamic Subtitle Styles */}
      <style>{`
        ::cue {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
        video::cue {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
        video::-webkit-media-text-track-display {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
        }
        @keyframes pingpong {
          0%, 15% { transform: translateX(12px); }
          85%, 100% { transform: translateX(calc(100cqw - 100% - 12px)); }
        }
        .marquee-container {
          container-type: inline-size;
        }
        .animate-pingpong {
          display: inline-block;
          white-space: nowrap;
          /* Use a custom property for dynamic duration, fallback to 8s */
          animation: pingpong var(--scroll-duration, 8s) linear infinite alternate;
        }
        .animate-pingpong:hover {
          animation-play-state: paused;
        }
        .marquee-mask {
          mask-image: linear-gradient(to right, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%);
        }
      `}</style>

      {/* Drag Overlay */}
      <DragOverlay 
        isDragging={isDragging} 
        lang={preferenceSettings.language || 'id'} 
        onClose={() => setIsDragging(false)} 
      />

      {/* OSD Feedback */}
      <OSD visible={osd.visible} message={osd.message} />

      {/* Background Download Notifications */}
      {downloadNotifications.filter(n => !n.minimized).length > 0 && (
        <div className="absolute top-16 right-4 z-[9999] flex flex-col gap-2 max-w-xs md:max-w-sm w-full pointer-events-none">
          {downloadNotifications.filter(n => !n.minimized).map((notif) => {
            const isDownloading = notif.status === 'downloading' || notif.status === 'starting';
            const isCompleted = notif.status === 'completed';
            const isError = notif.status === 'error';
            const isCancelled = notif.status === 'cancelled';

            let statusLabel = '';
            let statusColor = 'text-blue-400';
            let barColor = 'bg-orange-500 dark:bg-amber-500';
            let icon = <Download className="w-5 h-5 text-orange-500 dark:text-amber-500 animate-pulse" />;

            if (notif.status === 'starting') {
              statusLabel = preferenceSettings.language === 'id' ? 'Memulai...' : 'Starting...';
            } else if (notif.status === 'downloading') {
              statusLabel = preferenceSettings.language === 'id' ? 'Mengunduh' : 'Downloading';
            } else if (isCompleted) {
              statusLabel = preferenceSettings.language === 'id' ? 'Selesai!' : 'Completed!';
              statusColor = 'text-green-500 font-bold';
              barColor = 'bg-green-500';
              icon = <CheckCircle2 className="w-5 h-5 text-green-500" />;
            } else if (isError) {
              statusLabel = preferenceSettings.language === 'id' ? 'Gagal' : 'Failed';
              statusColor = 'text-red-500 font-bold';
              barColor = 'bg-red-500';
              icon = <AlertCircle className="w-5 h-5 text-red-500" />;
            } else if (isCancelled) {
              statusLabel = preferenceSettings.language === 'id' ? 'Dibatalkan' : 'Cancelled';
              statusColor = 'text-zinc-400';
              barColor = 'bg-zinc-500';
              icon = <X className="w-5 h-5 text-zinc-400" />;
            }

            return (
              <div
                key={notif.id}
                className="bg-white/80 dark:bg-black/45 backdrop-blur-xl border border-black/10 dark:border-white/10 text-zinc-900 dark:text-white rounded-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-all duration-300 flex flex-col gap-1.5 pointer-events-auto"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="shrink-0">{icon}</div>
                    <div className="flex flex-col overflow-hidden w-full">
                      <span className="text-xs font-bold truncate block text-zinc-800 dark:text-zinc-200" title={notif.name}>
                        {notif.name}
                      </span>
                      <span className={`text-[10px] ${statusColor} uppercase tracking-wider font-semibold`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleMinimizeDownloadNotification(notif.id)}
                      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                      title={preferenceSettings.language === 'id' ? 'Minimalkan' : 'Minimize'}
                    >
                      <Minimize className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => dismissDownloadNotification(notif.id)}
                      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!isError && !isCancelled && (
                  <>
                    <div className="w-full bg-black/10 dark:bg-white/15 h-1.5 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full ${isCompleted ? 'bg-green-500' : barColor} transition-all duration-300`}
                        style={{ width: `${isCompleted ? 100 : Math.max(5, notif.percent)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      <span>{isCompleted ? (preferenceSettings.language === 'id' ? 'Unduhan Selesai' : 'Downloaded') : (notif.speed || '')}</span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{isCompleted ? '100%' : `${Math.round(notif.percent)}%`}</span>
                    </div>
                  </>
                )}

                {isError && notif.error && (
                  <p className="text-[10px] text-red-400 bg-red-500/10 p-1.5 rounded border border-red-500/20 mt-1 max-h-12 overflow-y-auto font-mono">
                    {notif.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Minimized Download Notifications Clinging to the Right Side */}
      {downloadNotifications.filter(n => n.minimized).length > 0 && (
        <div className="absolute top-24 right-0 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
          {downloadNotifications.filter(n => n.minimized).map((notif) => {
            const isDownloading = notif.status === 'downloading' || notif.status === 'starting';
            const isCompleted = notif.status === 'completed';
            const isError = notif.status === 'error';

            let badgeColor = 'bg-orange-500 animate-pulse';
            let icon = <Download className="w-3.5 h-3.5 text-orange-500 dark:text-amber-500 animate-pulse" />;
            
            if (isCompleted) {
              badgeColor = 'bg-green-500';
              icon = <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
            } else if (isError) {
              badgeColor = 'bg-red-500';
              icon = <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
            } else if (notif.status === 'cancelled') {
              badgeColor = 'bg-zinc-500';
              icon = <X className="w-3.5 h-3.5 text-zinc-400" />;
            }

            return (
              <div
                key={notif.id}
                onClick={() => {
                  // Restore all minimized download notifications when clicked
                  setDownloadNotifications(prev => prev.map(item => ({ ...item, minimized: false })));
                }}
                className="pointer-events-auto cursor-pointer flex items-center gap-2 pl-3 pr-2 py-2 rounded-l-xl bg-white/80 dark:bg-black/45 backdrop-blur-xl border-y border-l border-black/10 dark:border-white/10 text-zinc-900 dark:text-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:bg-zinc-100/90 dark:hover:bg-zinc-900/75 transition-all duration-300 transform hover:-translate-x-1.5 translate-x-0 group"
                title={`${notif.name} (${Math.round(notif.percent)}%) - ${preferenceSettings.language === 'id' ? 'Klik untuk memunculkan kembali' : 'Click to restore'}`}
              >
                <div className="flex items-center gap-1.5 max-w-[110px] sm:max-w-[160px] overflow-hidden">
                  <div className="shrink-0">{icon}</div>
                  <span className="text-[10px] font-bold truncate text-zinc-600 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
                    {notif.name}
                  </span>
                </div>
                
                <span className={`text-[9px] font-black font-mono text-white px-1.5 py-0.5 rounded-full shrink-0 ${badgeColor}`}>
                  {Math.round(notif.percent)}%
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissDownloadNotification(notif.id);
                  }}
                  className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                  title={preferenceSettings.language === 'id' ? 'Tutup' : 'Dismiss'}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Atmospheric Background */}

      {(!player.videoSrc || !showPlayer) && (
        <EmptyState 
          onFileChange={handleFileChange}
          onShowNetworkModal={() => setShowNetworkModal(true)}
          onLoadPlaylist={loadPlaylist}
          onShowSniffer={openWebSniffer}
          lang={preferenceSettings.language || 'id'}
          playlist={playlist.playlist}
          thumbnails={playlist.thumbnails}
          onInvalidateThumbnail={playlist.invalidateThumbnail}
          onPlayIndex={playVideoIndex}
          onPlayStream={(url) => {
            const streamFile = {
              name: url.split('/').pop()?.split('?')[0] || url,
              path: url,
              isStream: true,
              url: url,
              type: 'video/mp4',
              size: 0,
            } as unknown as File;
            const newPlaylist = [...playlist.playlist, streamFile];
            playlist.setPlaylist(newPlaylist);
            playVideoIndex(newPlaylist.length - 1, newPlaylist);
          }}
          savedCollections={savedCollections}
          onSelectCollection={confirmLoadCollection}
          onRemoveFile={playlist.removeFile}
          onDeleteCollection={deleteCollection}
          onCreatePlaylist={createPlaylist}
          onSetPlaylist={playlist.setPlaylist}
          onUpdateCollection={updateCollection}
          hasActiveMedia={!!player.videoSrc}
          onLoadLoop={handleLoadLoop}
          onGoToPlayer={() => setShowPlayer(true)}
          onShowSettings={() => setShowSubSettings(true)}
          onShowShortcuts={() => setShowShortcuts(true)}
          activeDownloadsCount={activeDownloadsCount}
          completedDownloadsCount={completedDownloadsCount}
          preferenceSettings={preferenceSettings}
        />
      )}

      {player.videoSrc && (
        <div className={showPlayer ? "contents" : "hidden"}>
          <AmbientGlow
            videoRef={videoRef}
            isPlaying={player.isPlaying}
            isEnabled={isAmbientMode}
            isAudioFile={!!isAudioFile}
            is360Mode={is360Mode}
            videoSrc={player.videoSrc}
          />
          <FrameInterpolator
            videoRef={videoRef}
            isPlaying={player.isPlaying}
            isEnabled={isFrameInterpolation && interpolationEngine === 'canvas_light'}
            mode={interpolationMode}
            isAudioFile={!!isAudioFile}
            is360Mode={is360Mode}
            videoSrc={player.videoSrc}
            targetWidth={targetWidth}
            targetHeight={targetHeight}
            objectFitMode={objectFitMode}
            transformStyle={videoTransform}
            filterStyle={[
              `brightness(${videoSettings.brightness}%) contrast(${videoSettings.contrast}%) saturate(${videoSettings.saturation}%) hue-rotate(${videoSettings.hue || 0}deg) grayscale(${videoSettings.grayscale || 0}%) sepia(${videoSettings.sepia || 0}%) invert(${videoSettings.invert || 0}%)`,
              isEnhance ? 'contrast(1.15) saturate(1.2) brightness(1.05)' : '',
              isSuperRes ? 'url(#super-res-sharpen)' : ''
            ].filter(Boolean).join(' ') || 'none'}
            borderRadius="0px"
            boxShadow={isAmbientMode ? '0 0 32px 4px rgba(0, 0, 0, 0.45)' : 'none'}
            onActiveChange={setIsInterpolatorActive}
          />
          <svg width="0" height="0" className="absolute pointer-events-none">
            <defs>
              <filter id="super-res-sharpen">
                <feConvolveMatrix order="3 3" preserveAlpha="true" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" />
              </filter>
            </defs>
          </svg>
          <video
            ref={videoRef}
            crossOrigin="anonymous"
            {...{ decoding: preferenceSettings.hardwareAcceleration !== false ? "async" : "sync" } as any}
            className={`absolute z-10 transition-all duration-300 ${is360Mode || isAudioFile ? 'opacity-0 pointer-events-none' : (isFrameInterpolation && interpolationEngine === 'canvas_light' && isInterpolatorActive ? 'opacity-0' : '')}`}
            style={{
              left: '50%',
              top: '50%',
              width: targetWidth,
              height: targetHeight,
              maxWidth: 'none',
              maxHeight: 'none',
              objectFit: objectFitMode as any,
              transform: videoTransform,
              filter: [
                `brightness(${videoSettings.brightness}%) contrast(${videoSettings.contrast}%) saturate(${videoSettings.saturation}%) hue-rotate(${videoSettings.hue || 0}deg) grayscale(${videoSettings.grayscale || 0}%) sepia(${videoSettings.sepia || 0}%) invert(${videoSettings.invert || 0}%)`,
                isEnhance ? 'contrast(1.15) saturate(1.2) brightness(1.05)' : '',
                isSuperRes ? 'url(#super-res-sharpen)' : ''
              ].filter(Boolean).join(' ') || 'none',
              borderRadius: '0px',
              boxShadow: isAmbientMode ? '0 0 32px 4px rgba(0, 0, 0, 0.45)' : 'none',
            }}
            onTimeUpdate={handleTimeUpdate}
            onProgress={handleProgressUpdate}
            onEnded={handleEnded}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setVideoDimensions({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight
                });
                videoRef.current.muted = player.isMuted;
                videoRef.current.volume = player.volume;
                if (pendingLoopRef.current) {
                  const loop = pendingLoopRef.current;
                  videoRef.current.currentTime = loop.start;
                  player.setRepeatA(loop.start);
                  player.setRepeatB(loop.end);
                  player.setRepeatEnabled(true);
                  player.setIsPlaying(true);
                  videoRef.current.play().catch(console.error);
                  showFeedback(t('loopActive', preferenceSettings.language || 'id', { name: loop.name }));
                  pendingLoopRef.current = null;
                  pendingResumeTimeRef.current = null;
                } else if (pendingResumeTimeRef.current !== null) {
                  videoRef.current.currentTime = pendingResumeTimeRef.current;
                  pendingResumeTimeRef.current = null;
                  if (player.isPlaying) {
                    videoRef.current.play().catch(console.warn);
                  }
                } else if (player.isPlaying) {
                  videoRef.current.play().catch(console.warn);
                }
              }
            }}
            onCanPlay={() => {
              if (videoRef.current && player.isPlaying && videoRef.current.paused) {
                videoRef.current.play().catch(console.warn);
              }
            }}
            onLoadedData={() => {
              if (videoRef.current) {
                setVideoDimensions({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight
                });
              }
              if (!player.isPlaying) {
                triggerDeckBFade();
              }
            }}
            onPlay={() => {
              if (videoRef.current) {
                setVideoDimensions({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight
                });
              }
            }}
            onPlaying={() => {
              triggerDeckBFade();
            }}
            onClick={togglePlay}
            onError={handleVideoError}
          >
            {subtitles.subtitleUrl && <track kind="subtitles" src={subtitles.subtitleUrl} default />}
          </video>

          {/* DECK B: Dual Video Deck / Seamless Transition Engine */}
          <div
            className={`absolute z-15 pointer-events-none transition-all ${
              !isDeckBActive || deckBPhase === 'idle'
                ? 'opacity-0 pointer-events-none'
                : deckBPhase === 'fading'
                ? (preferenceSettings.videoTransition === 'crossfade'
                    ? 'opacity-0'
                    : preferenceSettings.videoTransition === 'zoom'
                    ? 'opacity-0 scale-105 filter blur-md'
                    : preferenceSettings.videoTransition === 'fade-black'
                    ? 'opacity-0 filter brightness-0'
                    : 'opacity-0 filter blur-xl scale-[1.02]')
                : 'opacity-100 scale-100 filter blur-0'
            }`}
            style={{
              left: '50%',
              top: '50%',
              width: deckBLayout.width,
              height: deckBLayout.height,
              transform: deckBLayout.transform,
              maxWidth: 'none',
              maxHeight: 'none',
              transitionDuration: `${preferenceSettings.videoTransitionDuration || 500}ms`,
              transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
              visibility: (!isDeckBActive && deckBPhase === 'idle') || preferenceSettings.videoTransition === 'none' ? 'hidden' : 'visible',
              overflow: 'hidden',
            }}
            aria-hidden="true"
          >
            <canvas
              ref={deckBCanvasRef}
              className="w-full h-full block"
              style={{
                objectFit: deckBLayout.objectFit,
                filter: deckBLayout.filter,
              }}
            />
          </div>

          {/* Soft Edge Transition Overlay for Ambient Mode - Feathered Vignette & Natural Seam Blending */}
          {isAmbientMode && !isAudioFile && !is360Mode && (
            <div
              className="absolute z-12 pointer-events-none transition-all duration-300"
              style={{
                left: '50%',
                top: '50%',
                width: targetWidth,
                height: targetHeight,
                transform: videoTransform,
                borderRadius: '0px',
                boxShadow: 'inset 0 0 16px 2px rgba(0, 0, 0, 0.38), inset 0 0 2px 1px rgba(255, 255, 255, 0.05), 0 0 32px 3px rgba(0, 0, 0, 0.45)',
              }}
              aria-hidden="true"
            />
          )}

          {/* libmpv Player Active Status Overlay */}
          {isMpvRunning && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-orange-500/40 text-white shadow-2xl animate-fade-in">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <div className="text-xs font-medium">
                <span className="font-bold text-orange-400">libmpv Native:</span>{' '}
                {mpvSettings.useMvtools ? `MVTools ${mpvSettings.mvtoolsFps || 60}fps (${mpvSettings.mvtoolsMode || 'flow'})` : `${mpvSettings.videoSync} • ${mpvSettings.tscale}`} {mpvSettings.enableSvp ? '• SVP' : ''}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await electron.stopMpvPlayer();
                  setIsMpvRunning(false);
                }}
                className="ml-2 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white transition-all"
              >
                {preferenceSettings.language === 'id' ? 'Tutup libmpv' : 'Close libmpv'}
              </button>
            </div>
          )}

          {/* Custom Subtitles Overlay */}
          {subtitles.subtitleUrl && (
            (() => {
              const activeSubLine = subtitles.subBrowserData.find(s => s.id === subtitles.activeSubId);
              if (!activeSubLine) return null;
              
              const isLineStyle = subtitles.subSettings.bgType === 'line';
              const isCompact = appearanceSettings?.displayMode === 'compact';
              const bottomOffset = showControls ? (isCompact ? '110px' : '155px') : '36px';
              
              return (
                <div 
                  className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-300 ease-in-out text-center select-none"
                  style={{
                    bottom: bottomOffset,
                    maxWidth: '85%',
                    width: 'max-content',
                  }}
                >
                  {isLineStyle ? (
                    <div 
                      className="whitespace-pre-wrap text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
                      style={{
                        fontSize: `${subtitles.subSettings.size}px`,
                        fontFamily: subtitles.subSettings.fontFamily || 'sans-serif',
                        lineHeight: subtitles.subSettings.lineHeight || '1.4',
                      }}
                    >
                      <span 
                        className="rounded-[4px] px-2 py-1"
                        style={{
                          color: subtitles.subSettings.color,
                          backgroundColor: subtitles.subSettings.bg || 'rgba(0,0,0,0.5)',
                          boxDecorationBreak: 'clone',
                          WebkitBoxDecorationBreak: 'clone',
                          display: 'inline',
                        }}
                      >
                        {renderFormattedText(activeSubLine.text)}
                      </span>
                    </div>
                  ) : (
                    <div 
                      className="px-4 py-2 rounded-lg whitespace-pre-wrap text-center shadow-lg"
                      style={{
                        fontSize: `${subtitles.subSettings.size}px`,
                        fontFamily: subtitles.subSettings.fontFamily || 'sans-serif',
                        lineHeight: subtitles.subSettings.lineHeight || '1.4',
                        color: subtitles.subSettings.color,
                        backgroundColor: subtitles.subSettings.bg || 'rgba(0,0,0,0.5)',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      {renderFormattedText(activeSubLine.text)}
                    </div>
                  )}
                </div>
              );
            })()
          )}

          {isAudioFile && (
            <div className="absolute inset-0 z-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 p-8 pb-16 pointer-events-none" onClick={togglePlay}>
              {/* Left Side: Album Art & Basic Info */}
              <div className={`flex flex-col items-center max-w-md w-full pointer-events-auto ${!currentMetadata?.lyrics ? 'md:max-w-xl' : ''}`}>
                <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-2xl overflow-hidden shadow-2xl bg-black/20 dark:bg-white/5 flex items-center justify-center backdrop-blur-xl border border-white/10 cursor-pointer transition-transform hover:scale-105 duration-500 shrink-0" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                  {currentThumbnail ? (
                    <img src={currentThumbnail} alt="Album Art" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
                      <div className="w-24 h-24 rounded-full bg-orange-500/20 dark:bg-amber-500/20 flex items-center justify-center animate-pulse">
                        <div className="w-16 h-16 rounded-full bg-orange-500/40 dark:bg-amber-500/40"></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-8 text-center w-full px-4">
                  <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white mb-2 truncate">{currentMetadata?.title || currentFile?.name || 'Unknown Audio'}</h2>
                  <p className="text-lg text-zinc-600 dark:text-zinc-300 truncate">{currentMetadata?.artist || (currentMetadata?.artists ? currentMetadata.artists.join(', ') : 'Unknown Artist')}</p>
                  {currentMetadata?.album && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 truncate">{currentMetadata.album} {currentMetadata.year ? `(${currentMetadata.year})` : ''}</p>}
                  {currentMetadata?.genre && <p className="text-xs text-orange-600 dark:text-amber-500 mt-2 font-medium uppercase tracking-wider">{Array.isArray(currentMetadata.genre) ? currentMetadata.genre.join(', ') : currentMetadata.genre}</p>}
                </div>
              </div>

              {/* Right Side: Lyrics */}
              {currentMetadata?.lyrics && (
                <div 
                  className="flex-1 max-w-2xl w-full h-[40vh] md:h-[60vh] overflow-y-auto custom-scrollbar pointer-events-auto pr-4"
                  style={{ 
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
                    maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' 
                  }}
                >
                  <div className="text-base md:text-lg lg:text-xl text-zinc-600 dark:text-zinc-300 italic whitespace-pre-wrap leading-relaxed text-center md:text-left py-12">
                    {Array.isArray(currentMetadata.lyrics) ? currentMetadata.lyrics.join('\n') : (typeof currentMetadata.lyrics === 'string' ? currentMetadata.lyrics : (currentMetadata.lyrics.lyrics || currentMetadata.lyrics.text || JSON.stringify(currentMetadata.lyrics)))}
                  </div>
                </div>
              )}
            </div>
          )}

          {is360Mode && videoRef.current && (
            <div className="absolute inset-0 z-10">
              <Video360Viewer videoElement={videoRef.current} projectionMode={projectionMode} stereoMode={stereoMode} />
            </div>
          )}

          {player.videoError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 dark:bg-black/80 backdrop-blur-sm">
              <div className="bg-white/90 dark:bg-[#0a0502] border border-rose-500/30 p-8 rounded-3xl max-w-md text-center shadow-[0_0_50px_rgba(244,63,94,0.2)]">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
                  <X size={32} className="text-rose-500" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{t('errorTitle', preferenceSettings.language || 'id')}</h3>
                <p className="text-zinc-700 dark:text-zinc-300 text-sm mb-6">{player.videoError}</p>
                <button 
                  onClick={() => {
                    player.setVideoError(null);
                    if (player.videoSrc === 'error') {
                      player.setVideoSrc('');
                    }
                  }}
                  className="px-6 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-900 dark:text-white rounded-xl transition-all border border-black/10 dark:border-white/10 text-sm font-medium"
                >
                  {t('close', preferenceSettings.language || 'id')}
                </button>
              </div>
            </div>
          )}

          {player.isCheckingStream && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-white/95 dark:bg-[#0a0502]/95 border border-orange-500/30 p-8 rounded-3xl max-w-sm text-center shadow-[0_0_50px_rgba(249,115,22,0.15)] flex flex-col items-center">
                <div className="relative w-16 h-16 flex items-center justify-center mb-4">
                  <div className="absolute inset-0 rounded-full border-4 border-orange-500/10 border-t-orange-500 animate-spin" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
                  {preferenceSettings.language === 'id' ? 'Memeriksa Stream...' : 'Checking Stream...'}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                  {t('checkingStream', preferenceSettings.language || 'id')}
                </p>
              </div>
            </div>
          )}

          {/* Context Menu */}
          <ContextMenu 
            show={contextMenu.show}
            x={contextMenu.x}
            y={contextMenu.y}
            isPlaying={player.isPlaying}
            onTogglePlay={togglePlay}
            onStopPlayback={stopPlayback}
            onToggleFullscreen={toggleFullscreen}
            onTogglePiP={togglePiP}
            repeatEnabled={player.repeatEnabled}
            onToggleRepeat={() => {
              if (player.repeatA === null || player.repeatB === null) {
                showFeedback(t('setPointsFirst', preferenceSettings.language));
                return;
              }
              player.setRepeatEnabled(prev => !prev);
            }}
            onLoadSubtitle={subtitles.loadSubtitle}
            onClearPlaylist={clearPlaylist}
            lang={preferenceSettings.language}
            onMakeThumbnail={makeFrameAsThumbnail}
            hasActiveVideo={!!videoRef.current && !!currentVideoIdRef.current}
          />

          {/* Subtitle Browser Sidebar */}
          <SubtitleBrowserSidebar
            show={showSubBrowser}
            onClose={() => setShowSubBrowser(false)}
            onFindCurrentSync={findCurrentSync}
            onAddSubtitleLine={addSubtitleLine}
            onExportSrtFile={exportSrtFile}
            editingSubId={subtitles.editingSubId}
            editingSubText={subtitles.editingSubText}
            onEditingSubTextChange={subtitles.setEditingSubText}
            onCancelEdit={() => { subtitles.setEditingSubId(null); subtitles.setEditingSubText(''); }}
            onSaveEdit={saveSubtitleEdits}
            listRef={subBrowserListRef}
            subBrowserData={subtitles.subBrowserData}
            onSubBrowserDataChange={handleSubBrowserDataChange}
            onSelectSub={handleSelectSub}
            onShowFeedback={showFeedback}
            lang={preferenceSettings.language || 'id'}
            getCurrentTime={() => videoRef.current?.currentTime || 0}
          >
            {subtitleListContent}
          </SubtitleBrowserSidebar>

          {/* Modals and Overlays moved outside player.videoSrc condition for global accessibility */}

          {/* Floating Zoom & Pan Indicator Badge */}
          {(isZoomed || isPanned) && !isAudioFile && !is360Mode && (
            <div 
              className={`absolute top-16 left-6 z-35 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/80 dark:bg-black/90 backdrop-blur-md border border-white/15 text-white text-xs shadow-2xl transition-all duration-300 pointer-events-auto select-none ${showControls ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
            >
              <div className="flex items-center gap-1.5 font-mono font-bold text-amber-400">
                <Search size={12} />
                <span>{videoSettings.zoom || 1}x</span>
              </div>
              {isPanned && (
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-300 border-l border-white/15 pl-2">
                  <Move size={11} className="text-zinc-400" />
                  <span>{videoSettings.panX || 0}, {videoSettings.panY || 0}px</span>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoSettings(prev => ({ ...prev, zoom: 1, panX: 0, panY: 0 }));
                }}
                className="ml-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-amber-500 hover:text-black transition-colors text-[10px] font-bold tracking-wide"
                title={t('resetPanZoom', preferenceSettings.language || 'id')}
              >
                Reset
              </button>
            </div>
          )}

          {/* Controls Overlay */}
          <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 z-30 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            
            <TopControls
              onMinimize={async () => {
                setShowPlayer(false);
                if (videoRef.current && !document.pictureInPictureElement && document.pictureInPictureEnabled) {
                  try {
                    await videoRef.current.requestPictureInPicture();
                  } catch (err) {
                    console.error('PiP error on minimize:', err);
                  }
                }
              }}
              onCaptureScreenshot={captureScreenshot}
              onToggleRecording={toggleRecording}
              isRecording={isRecording}
              recordingCountdown={recordingCountdown}
              isPlaying={player.isPlaying}
              currentVideoName={playlist.playlist[playlist.currentIndex]?.name || "Memutar Video..."}
              metadata={currentVideoIdRef.current ? playlist.metadata[currentVideoIdRef.current] : null}
              onShowNetworkModal={() => setShowNetworkModal(true)}
              onShowAbout={() => setShowAbout(true)}
              onShowShortcuts={() => setShowShortcuts(true)}
              onShowMemoryManager={() => setShowMemoryManager(true)}
              onShowWebSniffer={openWebSniffer}
              onShowSubSettings={() => setShowSubSettings(true)}
              showSubBrowser={showSubBrowser}
              onToggleSubBrowser={() => {
                setShowSubBrowser(!showSubBrowser);
                setShowPlaylist(false);
              }}
              showPlaylist={showPlaylist}
              onTogglePlaylist={() => {
                setShowPlaylist(!showPlaylist);
                setShowSubBrowser(false);
              }}
              is360Mode={is360Mode}
              onToggle360={() => setIs360Mode(!is360Mode)}
              projectionMode={projectionMode}
              onProjectionModeChange={setProjectionMode}
              stereoMode={stereoMode}
              onStereoModeChange={setStereoMode}
              appearanceSettings={appearanceSettings}
              lang={preferenceSettings.language || 'id'}
              activeDownloadsCount={activeDownloadsCount}
              completedDownloadsCount={completedDownloadsCount}
              showAILive={showAILive}
              onToggleAILive={() => setShowAILive(!showAILive)}
              enableAIFeatures={enableAIFeatures}
            />

            {/* Bottom Bar (Floating Pill) */}
            <BottomControls
              onMinimize={() => setShowPlayer(false)}
              appearanceSettings={appearanceSettings}
              lang={preferenceSettings.language || 'id'}
              videoSizingMode={videoSizingMode}
              onChangeVideoSizingMode={setVideoSizingMode}
              currentTime={player.currentTime}
              formatTime={formatTime}
              progressBarRef={progressBarRef}
              handleProgressMouseDown={handleProgressMouseDown}
              handleProgressMouseMove={handleProgressMouseMove}
              handleProgressMouseLeave={handleProgressMouseLeave}
              progress={player.progress}
              bufferedProgress={Math.max(player.bufferedProgress, player.proxyProgress)}
              hoverProgress={hoverProgress}
              videoSrc={player.videoSrc}
              previewVideoRef={previewVideoRef}
              hoverTime={hoverTime}
              repeatA={player.repeatA}
              repeatB={player.repeatB}
              videoDuration={videoRef.current?.duration || 0}
              onSeek={(time: number) => {
                if (videoRef.current) videoRef.current.currentTime = time;
              }}
              onExportTrimSegment={handleExportTrimSegment}
              isExportingTrim={isExportingTrim}
              trimExportStatus={trimExportStatus}
              isTrimMode={isTrimMode}
              setIsTrimMode={setIsTrimMode}
              onToggleTrim={handleToggleTrim}
              markers={markers}
              togglePlay={togglePlay}
              isPlaying={player.isPlaying}
              stopPlayback={stopPlayback}
              isMuted={player.isMuted}
              onToggleMute={() => {
                player.setIsMuted(!player.isMuted);
                if(videoRef.current) videoRef.current.muted = !player.isMuted;
              }}
              volume={player.volume}
              onVolumeChange={(v: number) => {
                player.setVolume(v);
                if(videoRef.current) {
                  videoRef.current.volume = v;
                  if(v>0) {player.setIsMuted(false); videoRef.current.muted=false;}
                }
              }}
              isAudioNormalized={player.isAudioNormalized}
              onToggleAudioNormalize={player.toggleAudioNormalize}
              isSwapChannels={player.isSwapChannels}
              onToggleSwapChannels={() => player.setIsSwapChannels(prev => !prev)}
              isShuffle={playlist.isShuffle}
              onToggleShuffle={() => playlist.setIsShuffle(!playlist.isShuffle)}
              repeatMode={playlist.repeatMode}
              onToggleRepeatMode={() => {
                if (playlist.repeatMode === 'none') playlist.setRepeatMode('playlist');
                else if (playlist.repeatMode === 'playlist') playlist.setRepeatMode('current');
                else playlist.setRepeatMode('none');
              }}
              isEnhance={isEnhance}
              onToggleEnhance={() => {
                setIsEnhance(!isEnhance);
                showFeedback(isEnhance ? t('enhanceOff', preferenceSettings.language) : t('enhanceOn', preferenceSettings.language));
              }}
              isSuperRes={isSuperRes}
              onToggleSuperRes={() => {
                setIsSuperRes(!isSuperRes);
                showFeedback(isSuperRes ? t('superResOff', preferenceSettings.language || 'id') : t('superResOn', preferenceSettings.language || 'id'));
              }}
              isAmbientMode={isAmbientMode}
              onToggleAmbientMode={() => {
                const next = !isAmbientMode;
                setIsAmbientMode(next);
                showFeedback(next ? t('ambientOn', preferenceSettings.language || 'id') : t('ambientOff', preferenceSettings.language || 'id'));
              }}
              isFrameInterpolation={isFrameInterpolation}
              interpolationEngine={interpolationEngine}
              onToggleFrameInterpolation={() => {
                const next = !isFrameInterpolation;
                setIsFrameInterpolation(next);
                showFeedback(next ? t('interpolationOn', preferenceSettings.language || 'id') : t('interpolationOff', preferenceSettings.language || 'id'));
              }}
              setRepeatA={() => {
                const time = videoRef.current?.currentTime || 0;
                player.setRepeatA(time);
                if (player.repeatB !== null) player.setRepeatEnabled(true);
              }}
              setRepeatB={() => {
                const time = videoRef.current?.currentTime || 0;
                player.setRepeatB(time);
                if (player.repeatA !== null) player.setRepeatEnabled(true);
              }}
              repeatEnabled={player.repeatEnabled}
              onToggleRepeatEnabled={() => {
                if (player.repeatA === null || player.repeatB === null) {
                  showFeedback(t('setPointsFirst', preferenceSettings.language || 'id'));
                  return;
                }
                player.setRepeatEnabled(prev => !prev);
              }}
              handleAddMarker={handleAddMarker}
              setShowMarkerList={setShowMarkerList}
              showSpeedMenu={showSpeedMenu}
              setShowSpeedMenu={setShowSpeedMenu}
              playbackRate={player.playbackRate}
              playbackRates={playbackRates}
              setSpeed={player.setSpeed}
              loadSubtitle={subtitles.loadSubtitle}
              hasSubtitle={!!subtitles.subtitleUrl}
              onUnloadSubtitle={handleUnloadSubtitle}
              onAddNewSubtitleDirectly={handleAddNewSubtitleDirectly}
              toggleFullscreen={() => player.toggleFullscreen(playerContainerRef)}
              isFullscreen={player.isFullscreen}
              onTogglePiP={player.togglePiP}
              isPiP={player.isPiP}
              savedLoops={savedLoops}
              onSaveLoop={handleSaveLoop}
              onRenameLoop={renameLoop}
              onPlayLoop={playLoop}
              onRemoveLoop={removeLoop}
              onShowAudioSettings={() => setShowAudioSettings(true)}
            />
          </div>
        </div>
      )}

      {/* Playlist Sidebar */}
      <PlaylistSidebar 
        show={showPlaylist}
        viewMode={playlist.playlistViewMode}
        onViewModeChange={playlist.setPlaylistViewMode}
        onLoad={loadPlaylist}
        onSave={savePlaylist}
        onExportJson={exportJson}
        onImportJson={importJson}
        onClear={clearPlaylist}
        onClose={() => setShowPlaylist(false)}
        onFileChange={handleFileChange}
        onShowNetworkModal={() => setShowNetworkModal(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        lang={preferenceSettings.language || 'id'}
      >
        {playlist.playlist
          .filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
          .map((file, index) => {
            const originalIndex = playlist.playlist.indexOf(file);
            const isActive = playlist.currentIndex === originalIndex;
            const thumbKey = (file as any).path || (file as any).fullPath || (file.name + file.size);
            const thumb = playlist.thumbnails[thumbKey];
            const isGrid = playlist.playlistViewMode === 'grid';

            return (
              <div 
                key={originalIndex}
                tabIndex={0}
                onClick={() => playVideoIndex(originalIndex)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    playVideoIndex(originalIndex);
                  }
                }}
                className={`group relative flex ${isGrid ? 'flex-col' : 'items-center gap-3'} p-2 rounded-xl cursor-pointer transition-all duration-300 border focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                  isActive 
                    ? 'bg-amber-500/10 border-amber-500/30' 
                    : 'bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 hover:border-black/10 dark:hover:border-white/10'
                }`}
              >
                {/* Thumbnail Container */}
                <div className={`relative ${isGrid ? 'w-full aspect-video mb-2' : 'w-16 h-10'} rounded-lg overflow-hidden bg-black flex items-center justify-center shrink-0 border border-black/10 dark:border-white/10 ${isActive ? 'ring-2 ring-amber-500/50' : ''}`}>
                  {thumb ? (
                    <img 
                      src={thumb} 
                      onError={() => {
                        playlist.invalidateThumbnail(thumbKey);
                      }}
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer" 
                    />
                  ) : (
                    <FileVideo size={isGrid ? 24 : 16} className={isActive ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300'} />
                  )}

                  {/* Visualizer Overlay */}
                  {isActive && player.isPlaying && (
                    <div className="absolute inset-0 bg-black/5 dark:bg-black/40 flex items-center justify-center">
                      <div className="flex items-end gap-1 h-8">
                        <div className="w-1.5 bg-amber-500 animate-vis-1 rounded-full"></div>
                        <div className="w-1.5 bg-amber-500 animate-vis-2 rounded-full"></div>
                        <div className="w-1.5 bg-amber-500 animate-vis-3 rounded-full"></div>
                        <div className="w-1.5 bg-amber-500 animate-vis-4 rounded-full"></div>
                      </div>
                    </div>
                  )}

                  {/* Delete Button Overlay (Grid Mode) */}
                  {isGrid && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); playlist.removeFile(originalIndex); }}
                      className="absolute top-1 right-1 p-1.5 bg-white/80 dark:bg-black/60 text-zinc-700 dark:text-zinc-300 hover:text-rose-500 hover:bg-white/60 dark:hover:bg-black/80 rounded-lg opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md border border-black/10 dark:border-white/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* Info Container */}
                <div className="flex-1 min-w-0">
                  <p className={`${isGrid ? 'text-[11px] text-center' : 'text-sm'} font-medium truncate ${isActive ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300'}`}>
                    {file.name}
                  </p>
                  {!isGrid && (
                    <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-0.5">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                  )}
                </div>

                {/* Delete Button (List Mode) */}
                {!isGrid && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); playlist.removeFile(originalIndex); }}
                    className="p-2 text-zinc-700 dark:text-zinc-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
      </PlaylistSidebar>

      {/* Remaining Modals and Overlays */}
      <div onContextMenu={(e) => e.stopPropagation()} className="contents">
        {/* About Modal */}
        <AboutModal
          show={showAbout}
          onClose={() => setShowAbout(false)}
          currentFile={playlist.currentIndex !== -1 ? playlist.playlist[playlist.currentIndex] : null}
          videoElement={videoRef.current}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Shortcuts Modal */}
        <ShortcutsModal
          show={showShortcuts}
          onClose={() => setShowShortcuts(false)}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Memory Manager Modal */}
        <MemoryManagerModal
          show={showMemoryManager}
          onLoadLoop={handleLoadLoop}
          onClose={() => setShowMemoryManager(false)}
          onClearThumbnails={() => {
            playlist.clearThumbnails();
            showFeedback(t('thumbnailCacheCleared', preferenceSettings.language || 'id'));
          }}
          repeatMode={playlist.repeatMode}
          isShuffle={playlist.isShuffle}
          isAudioNormalized={player.isAudioNormalized}
          audioBoost={player.audioBoost}
          eqGains={player.eqGains}
          isEnhance={isEnhance}
          isSuperRes={isSuperRes}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Resume Overlay */}
        <ResumeOverlay
          show={showResumeOverlay && preferenceSettings.showResumeConfirmation !== false && !preferenceSettings.alwaysAutoResume}
          savedTime={savedTime}
          formatTime={formatTime}
          fileSize={playlist.playlist[playlist.currentIndex]?.size}
          videoDuration={player.duration}
          onResume={() => {
            if (videoRef.current && savedTime) {
              videoRef.current.currentTime = savedTime;
              setShowResumeOverlay(false);
              showFeedback(t('resumingVideo', preferenceSettings.language || 'id'));
            }
          }}
          onClose={() => setShowResumeOverlay(false)}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Network Stream Modal */}
        <NetworkStreamModal 
          show={showNetworkModal}
          url={networkUrl}
          onUrlChange={setNetworkUrl}
          onSubmit={handleNetworkStream}
          onCancel={() => setShowNetworkModal(false)}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Download Error Modal */}
        {downloadErrorModal && downloadErrorModal.show && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-md bg-zinc-900/95 border border-red-500/30 rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-fade-in text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                  <AlertCircle size={22} className="stroke-[2.5]" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <h3 className="text-base font-bold text-zinc-100 truncate">
                    {preferenceSettings.language === 'id' ? 'Unduhan Manual Gagal' : 'Manual Download Failed'}
                  </h3>
                  <span className="text-[11px] text-zinc-400 truncate" title={downloadErrorModal.filename}>
                    {downloadErrorModal.filename}
                  </span>
                </div>
              </div>

              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3.5 max-h-40 overflow-y-auto custom-scrollbar">
                <p className="text-xs text-red-400 font-mono leading-relaxed select-text">
                  {downloadErrorModal.error}
                </p>
              </div>

              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setDownloadErrorModal(null)}
                  className="px-5 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white rounded-xl font-bold text-sm shadow-[0_4px_12px_rgba(239,68,68,0.25)] hover:shadow-[0_6px_20px_rgba(239,68,68,0.4)] transition-all cursor-pointer active:scale-95 animate-pulse duration-1000"
                >
                  {preferenceSettings.language === 'id' ? 'Tutup' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collection Modals */}
        <SaveCollectionModal 
          show={showSaveModal}
          name={collectionName}
          onNameChange={setCollectionName}
          onSave={confirmSaveCollection}
          onCancel={() => setShowSaveModal(false)}
          isExportingJson={isExportingJson}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Add Marker Modal */}
        <AddMarkerModal 
          show={showMarkerInput}
          time={pendingMarkerTime}
          formatTime={formatTime}
          label={markerInputLabel}
          onLabelChange={setMarkerInputLabel}
          onSubmit={confirmAddMarker}
          onCancel={() => setShowMarkerInput(false)}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Add Loop Modal */}
        <AddLoopModal 
          show={showLoopInput}
          start={player.repeatA || 0}
          end={player.repeatB || 0}
          formatTime={formatTime}
          label={loopInputLabel}
          onLabelChange={setLoopInputLabel}
          onSubmit={confirmSaveLoop}
          onCancel={() => setShowLoopInput(false)}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Marker List Modal */}
        <MarkerListModal 
          show={showMarkerList}
          markers={markers}
          formatTime={formatTime}
          onClose={() => setShowMarkerList(false)}
          onSeek={(time) => {
            if (videoRef.current) videoRef.current.currentTime = time;
          }}
          lang={preferenceSettings.language || 'id'}
          onRemove={async (markerId) => {
            if (!currentVideoIdRef.current) return;
            const updated = markers.filter(m => m.id !== markerId);
            setMarkers(updated);
            if (preferenceSettings.saveMarkers) {
              await dbService.saveMarkers(currentVideoIdRef.current, updated);
            }
          }}
        />

        {/* Audio Settings Modal */}
        <AudioSettingsModal
          show={showAudioSettings}
          onClose={() => setShowAudioSettings(false)}
          audioBoost={player.audioBoost}
          onAudioBoostChange={player.setAudioBoost}
          eqGains={player.eqGains}
          onEqChange={(i, v) => {
            const newGains = [...player.eqGains];
            newGains[i] = v;
            player.setEqGains(newGains);
          }}
          isAudioNormalized={player.isAudioNormalized}
          onToggleAudioNormalize={player.toggleAudioNormalize}
          normalizeThreshold={player.normalizeThreshold}
          onNormalizeThresholdChange={player.setNormalizeThreshold}
          normalizeGain={player.normalizeGain}
          onNormalizeGainChange={player.setNormalizeGain}
          analyserRef={player.analyserRef}
          lang={preferenceSettings.language || 'id'}
        />

        {/* Settings Modal (Globally accessible from Player and Home) */}
        <SettingsModal
          show={showSubSettings}
          subSettings={subtitles.subSettings}
          appearanceSettings={appearanceSettings}
          videoSettings={videoSettings}
          preferenceSettings={preferenceSettings}
          audioBoost={player.audioBoost}
          onAudioBoostChange={player.setAudioBoost}
          eqGains={player.eqGains}
          onEqChange={(i, v) => {
            const newGains = [...player.eqGains];
            newGains[i] = v;
            player.setEqGains(newGains);
          }}
          audioDelay={player.audioDelay}
          onAudioDelayChange={player.setAudioDelay}
          isAudioNormalized={player.isAudioNormalized}
          onToggleAudioNormalize={player.toggleAudioNormalize}
          normalizeThreshold={player.normalizeThreshold}
          onNormalizeThresholdChange={player.setNormalizeThreshold}
          normalizeGain={player.normalizeGain}
          onNormalizeGainChange={player.setNormalizeGain}
          isSwapChannels={player.isSwapChannels}
          onToggleSwapChannels={() => player.setIsSwapChannels(prev => !prev)}
          onSubSettingsChange={subtitles.setSubSettings}
          onAppearanceSettingsChange={setAppearanceSettings}
          onVideoSettingsChange={setVideoSettings}
          onPreferenceSettingsChange={setPreferenceSettings}
          onClose={() => setShowSubSettings(false)}
          videoSizingMode={videoSizingMode}
          onChangeVideoSizingMode={setVideoSizingMode}
          isAmbientMode={isAmbientMode}
          onToggleAmbientMode={() => {
            const next = !isAmbientMode;
            setIsAmbientMode(next);
            showFeedback(next ? t('ambientOn', preferenceSettings.language || 'id') : t('ambientOff', preferenceSettings.language || 'id'));
          }}
          isFrameInterpolation={isFrameInterpolation}
          onToggleFrameInterpolation={() => {
            const next = !isFrameInterpolation;
            setIsFrameInterpolation(next);
            showFeedback(next ? t('interpolationOn', preferenceSettings.language || 'id') : t('interpolationOff', preferenceSettings.language || 'id'));
          }}
          interpolationEngine={interpolationEngine}
          onChangeInterpolationEngine={setInterpolationEngine}
          interpolationMode={interpolationMode}
          onChangeInterpolationMode={setInterpolationMode}
          mpvSettings={mpvSettings}
          onChangeMpvSettings={(newSettings) => setMpvSettings(prev => ({ ...prev, ...newSettings }))}
          onCheckMpvAvailable={handleCheckMpvAvailable}
          onCheckVapourSynth={electron.checkVapourSynthStatus}
          onLaunchMpv={handleLaunchMpv}
          isMpvRunning={isMpvRunning}
          currentVideoPath={player.videoSrc}
          enableAIFeatures={enableAIFeatures}
          onToggleAIFeatures={(enabled) => {
            setEnableAIFeatures(enabled);
            electron.setAIFeaturesEnabled(enabled);
            if (!enabled) {
              setShowAILive(false);
            }
          }}
        />
      </div>

      </div>

      {/* AI Live Conversation / Discussion Overlay (SplitScreen Sidebar) */}
      {enableAIFeatures && (
        <AILiveCompanionModal
          isOpen={showAILive && !showWebSniffer}
          onClose={() => setShowAILive(false)}
          isPinned={true}
          videoRef={videoRef}
          hasActiveVideo={!!player.videoSrc}
          videoTitle={player.videoSrc ? (playlist.playlist[playlist.currentIndex]?.name || (currentMetadata?.title ? `${currentMetadata.title}` : 'Video Utama')) : ''}
          currentTimeFormatted={formatTime(player.currentTime)}
          durationFormatted={formatTime(videoRef.current?.duration || 0)}
          currentSubtitleText={subtitles.subBrowserData.find(s => player.currentTime >= s.start && player.currentTime <= s.end)?.text || ''}
          onSeekTo={(secs) => {
            if (videoRef.current) {
              videoRef.current.currentTime = secs;
            }
          }}
          geminiApiKey={preferenceSettings.geminiApiKey}
          lang={preferenceSettings.language || 'id'}
          aiResponseLanguage={preferenceSettings.aiResponseLanguage}
          aiMode={preferenceSettings.aiMode}
          aiChatModel={preferenceSettings.aiChatModel}
          aiLiveModel={preferenceSettings.aiLiveModel}
          aiVoice={preferenceSettings.aiVoice}
          aiTtsModel={preferenceSettings.aiTtsModel}
          aiCustomPersona={preferenceSettings.aiCustomPersona}
          aiLanguageStyle={preferenceSettings.aiLanguageStyle}
          aiPredictiveCaching={preferenceSettings.aiPredictiveCaching !== false}
          aiPredictiveMs={preferenceSettings.aiPredictiveMs}
          aiPredictiveStepMs={preferenceSettings.aiPredictiveStepMs}
          onPreferenceSettingsChange={(newSettings) => setPreferenceSettings(prev => ({ ...prev, ...newSettings }))}
          aiTemperature={preferenceSettings.aiTemperature}
          aiMediaResolution={preferenceSettings.aiMediaResolution}
          aiSafetySettings={preferenceSettings.aiSafetySettings}
          aiThinkingLevel={preferenceSettings.aiThinkingLevel}
          aiMaxOutputTokens={preferenceSettings.aiMaxOutputTokens}
        />
      )}


    {/* Web Sniffer Modal */}
    <WebSnifferModal
      show={showWebSniffer}
      initialUrl={snifferInitialUrl}
      onClearInitialUrl={() => setSnifferInitialUrl(null)}
      onClose={() => {
        setShowWebSniffer(false);
        setSnifferInitialUrl(null);
      }}
      onPlay={handlePlayFromSniffer}
      getIpcRenderer={getIpcRenderer}
      logToMain={logToMain}
      lang={preferenceSettings.language || 'id'}
    />
    </div>
  </div>
  );
}
