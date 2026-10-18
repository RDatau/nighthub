import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Square, Volume2, VolumeX, Shuffle, Repeat, Repeat1, 
  BookmarkPlus, MapPin, Gauge, MessageSquare, Maximize, Minimize, PictureInPicture2,
  Save, List, Trash2, X, Plus, Activity, Pencil, Check, Sliders, AudioLines, Sparkles, Cpu,
  ArrowLeftRight, GripHorizontal, Home, Monitor, SunMedium, Layers,
  Scissors, RotateCcw, Download, ChevronRight,
  Target, Zap,
  MoreHorizontal, SlidersHorizontal
} from 'lucide-react';

import mpegts from 'mpegts.js';
import { motion, useDragControls } from 'motion/react';
import { t } from '../services/i18n';
import { matchesCommand } from '../services/shortcutManager';

// Reusing the marker icons
const ElegantMarker = ({ color, className }: { color: string, className?: string }) => (
  <div className={`relative flex items-center justify-center ${className}`}>
    <svg
      viewBox="0 0 100 120"
      className="absolute inset-0 w-full h-full drop-shadow-md"
      preserveAspectRatio="none">
      <path 
        d="M50 0 C80 0 100 20 100 50 C100 85 50 120 50 120 C50 120 0 85 0 50 C0 20 20 0 50 0 Z" 
        fill={color || "#f59e0b"} 
      />
    </svg>
    <svg 
      viewBox="0 0 600 600"
      className="relative z-10 w-[80%] h-[80%] -translate-y-[10%]"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="translate(0.000000,600.000000) scale(0.100000,-0.100000)" fill="#000000" stroke="none">
          <path d="M3424 5380 c-58 -12 -177 -73 -226 -118 -93 -83 -207 -261 -259 -403 -17 -46 -50 -128 -74 -184 -64 -147 -94 -377 -64 -490 27 -100 17 -180 -36 -285 -32 -63 -57 -83 -92 -76 -45 10 -180 -21 -260 -58 -89 -43 -137 -76 -227 -155 -38 -34 -94 -75 -125 -92 -74 -40 -319 -149 -336 -149 -7 0 -28 18 -46 41 -17 22 -63 67 -100 99 -38 33 -112 107 -166 166 -106 116 -186 176 -261 193 -40 10 -58 9 -127 -10 -44 -12 -109 -27 -145 -34 -106 -19 -108 -21 -139 -88 -19 -42 -48 -82 -92 -125 l-64 -62 0 -98 c0 -181 34 -282 96 -282 37 0 37 2 0 -237 -36 -231 -48 -379 -56 -683 -11 -412 -25 -668 -46 -804 -24 -161 -38 -374 -39 -611 -2 -218 -10 -285 -36 -300 -40 -22 -124 -112 -124 -134 0 -25 0 -25 95 -41 63 -11 78 -10 155 10 54 14 111 22 157 21 66 -1 75 1 105 28 l32 29 -12 71 c-7 39 -12 117 -12 174 0 117 10 142 81 198 121 95 169 164 169 242 0 51 -27 92 -115 180 l-48 47 6 68 c3 37 19 119 36 182 69 264 78 296 89 317 7 12 19 57 28 100 19 90 31 120 45 106 6 -6 21 -70 34 -143 55 -303 162 -586 285 -752 118 -161 285 -237 422 -195 63 20 72 9 53 -64 -30 -111 -6 -289 47 -346 21 -23 19 -53 -5 -53 -7 0 -80 11 -161 25 -167 28 -196 26 -277 -26 -25 -16 -67 -32 -93 -35 -85 -12 -136 -81 -122 -162 4 -20 9 -56 13 -80 3 -29 12 -47 27 -56 34 -22 130 -34 286 -37 334 -7 409 -2 530 31 89 25 278 35 577 32 211 -3 266 -1 332 13 71 16 96 16 218 6 97 -8 154 -9 192 -1 67 13 142 13 174 1 15 -6 107 -7 233 -2 185 7 218 11 284 34 42 14 108 30 148 35 39 6 87 19 104 30 18 11 50 25 71 32 46 14 147 96 187 151 45 62 63 135 56 221 -3 40 -7 89 -8 108 l-3 35 177 2 c182 1 218 8 218 42 0 21 -30 51 -51 51 -23 0 -112 46 -137 70 -33 31 -78 41 -213 45 -145 4 -181 18 -203 78 -27 78 -37 250 -36 649 2 405 1 418 -44 594 -41 162 -50 251 -42 439 3 93 13 224 21 290 19 152 19 305 0 420 -24 155 -55 288 -72 315 -44 70 -123 123 -201 136 -37 6 -40 9 -47 48 -3 22 -10 118 -15 211 -9 173 -23 279 -67 510 -47 247 -83 328 -192 434 -93 90 -124 105 -201 96 -45 -5 -59 -3 -69 9 -15 18 -122 21 -197 6z m-854 -2187 c32 -55 34 -79 11 -112 -80 -112 -99 -248 -49 -351 15 -30 37 -67 49 -82 25 -30 25 -28 -23 -154 -27 -70 -44 -94 -68 -94 -36 0 -309 -91 -347 -116 -12 -7 -28 -11 -35 -9 -7 3 -26 49 -42 103 -38 125 -122 322 -201 473 -42 81 -44 97 -7 105 15 3 37 9 49 14 13 5 52 16 88 25 121 28 323 117 410 181 52 38 105 62 125 57 11 -3 28 -21 40 -40z m1503 -663 c3 -11 3 -47 0 -80 -5 -47 2 -95 31 -222 20 -90 49 -226 66 -303 29 -141 91 -411 108 -475 19 -73 45 -230 39 -237 -4 -3 -37 -1 -74 5 -38 7 -174 16 -303 22 -245 11 -283 13 -440 32 -90 10 -125 22 -115 37 2 4 13 50 23 102 35 164 61 252 103 331 37 73 139 228 179 273 48 54 172 283 200 370 19 59 38 83 86 111 23 14 48 31 54 39 17 21 37 19 43 -5z"/>
      </g>
    </svg>
  </div>
);

const CustomMarkerIcon = ({ color, className }: { color: string, className?: string }) => (
  <ElegantMarker color={color} className={className} />
);

export const BottomControls = ({
  currentTime,
  formatTime,
  progressBarRef,
  handleProgressMouseDown,
  handleProgressMouseMove,
  handleProgressMouseLeave,
  progress,
  bufferedProgress,
  hoverProgress,
  videoSrc,
  previewVideoRef,
  hoverTime,
  repeatA,
  repeatB,
  videoDuration,
  onSeek,
  markers,
  togglePlay,
  isPlaying,
  stopPlayback,
  isMuted,
  onToggleMute,
  volume,
  onVolumeChange,
  isAudioNormalized,
  onToggleAudioNormalize,
  isSwapChannels,
  onToggleSwapChannels,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onToggleRepeatMode,
  isEnhance,
  onToggleEnhance,
  isSuperRes,
  onToggleSuperRes,
  isAmbientMode = true,
  onToggleAmbientMode,
  isFrameInterpolation = false,
  onToggleFrameInterpolation,
  setRepeatA,
  setRepeatB,
  repeatEnabled,
  onToggleRepeatEnabled,
  handleAddMarker,
  setShowMarkerList,
  showSpeedMenu,
  setShowSpeedMenu,
  playbackRate,
  playbackRates,
  setSpeed,
  loadSubtitle,
  hasSubtitle,
  onUnloadSubtitle,
  onAddNewSubtitleDirectly,
  toggleFullscreen,
  isFullscreen,
  onTogglePiP,
  isPiP,
  savedLoops = [],
  onSaveLoop,
  onRenameLoop,
  onPlayLoop,
  onRemoveLoop,
  onShowAudioSettings,
  appearanceSettings,
  onMinimize,
  lang = 'id',
  videoSizingMode = 'contain',
  onChangeVideoSizingMode,
  interpolationEngine = 'canvas_light',
  onExportTrimSegment,
  isExportingTrim = false,
  trimExportStatus = 'idle',
  isTrimMode: propIsTrimMode,
  setIsTrimMode: propSetIsTrimMode,
  onToggleTrim
}: any) => {
  const [showLoopMenu, setShowLoopMenu] = useState(false);
  const [showAudioFlyout, setShowAudioFlyout] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [showMarkerFlyout, setShowMarkerFlyout] = useState(false);
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [exportingLoopId, setExportingLoopId] = useState<string | null>(null);
  const [completedLoopId, setCompletedLoopId] = useState<string | null>(null);
  const completedLoopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleExportLoopSegment = async (e: React.MouseEvent, loop: any) => {
    e.stopPropagation();
    if (isExportingTrim || !onExportTrimSegment) return;
    setExportingLoopId(loop.id);
    try {
      const success = await onExportTrimSegment({
        startTime: loop.start,
        endTime: loop.end,
        duration: loop.end - loop.start,
        accurate: true,
        customName: loop.name
      });
      if (success) {
        setCompletedLoopId(loop.id);
        if (completedLoopTimeoutRef.current) clearTimeout(completedLoopTimeoutRef.current);
        completedLoopTimeoutRef.current = setTimeout(() => {
          setCompletedLoopId(null);
        }, 4500);
      }
    } finally {
      setExportingLoopId(null);
    }
  };
  const [showSizingMenu, setShowSizingMenu] = useState(false);
  const [showEnhanceMenu, setShowEnhanceMenu] = useState(false);

  // Non-destructive Trimming state
  const [internalTrimMode, setInternalTrimMode] = useState(false);
  const isTrimMode = propIsTrimMode !== undefined ? propIsTrimMode : internalTrimMode;
  const setIsTrimMode = propSetIsTrimMode || setInternalTrimMode;
  const [trimStart, setTrimStart] = useState<number>(repeatA !== null ? repeatA : 0);
  const [trimEnd, setTrimEnd] = useState<number>(repeatB !== null ? repeatB : (videoDuration || 0));
  const [isPreviewingTrim, setIsPreviewingTrim] = useState(false);
  const [isAccurateTrim, setIsAccurateTrim] = useState(true);

  const formatPreciseTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00.000';
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    const ms = Math.floor((sec % 1) * 1000).toString().padStart(3, '0');
    const h = Math.floor(sec / 3600);
    return h > 0 ? `${h}:${m}:${s}.${ms}` : `${m}:${s}.${ms}`;
  };

  useEffect(() => {
    if (trimEnd === 0 && videoDuration > 0) {
      setTrimEnd(videoDuration);
    }
  }, [videoDuration, trimEnd]);

  useEffect(() => {
    if (repeatA !== null && isTrimMode) {
      setTrimStart(repeatA);
    }
  }, [repeatA, isTrimMode]);

  useEffect(() => {
    if (repeatB !== null && isTrimMode) {
      setTrimEnd(repeatB);
    }
  }, [repeatB, isTrimMode]);

  // Preview loop monitor
  useEffect(() => {
    if (isPreviewingTrim) {
      if (currentTime >= trimEnd) {
        onSeek(trimStart);
        if (repeatMode === 'none') {
          if (isPlaying) togglePlay();
          setIsPreviewingTrim(false);
        }
      }
    }
  }, [isPreviewingTrim, currentTime, trimEnd, trimStart, isPlaying, repeatMode, onSeek, togglePlay]);

  // Keyboard shortcut support for trimming markers and global Ctrl+T toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (matchesCommand(e, 'toggleTrim')) {
        e.preventDefault();
        e.stopPropagation();
        if (onToggleTrim) {
          onToggleTrim();
        } else {
          setIsTrimMode((prev: boolean) => !prev);
        }
        return;
      }

      if (!isTrimMode) return;
      if (matchesCommand(e, 'trimStart')) {
        e.preventDefault();
        setTrimStart(Math.max(0, Math.min(currentTime, trimEnd - 0.05)));
      } else if (matchesCommand(e, 'trimEnd')) {
        e.preventDefault();
        setTrimEnd(Math.min(videoDuration || 99999, Math.max(currentTime, trimStart + 0.05)));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTrimMode, currentTime, trimStart, trimEnd, videoDuration, onToggleTrim, setIsTrimMode]);

  const handleDragTrimStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (moveEvt: MouseEvent) => {
      if (!progressBarRef.current || videoDuration <= 0) return;
      const bounds = progressBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (moveEvt.clientX - bounds.left) / bounds.width));
      const newTime = ratio * videoDuration;
      setTrimStart(Math.max(0, Math.min(newTime, trimEnd - 0.1)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleDragTrimEnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const onMove = (moveEvt: MouseEvent) => {
      if (!progressBarRef.current || videoDuration <= 0) return;
      const bounds = progressBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (moveEvt.clientX - bounds.left) / bounds.width));
      const newTime = ratio * videoDuration;
      setTrimEnd(Math.min(videoDuration, Math.max(newTime, trimStart + 0.1)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  
  // State untuk menu & modal subtitle baru
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showNewSubtitleModal, setShowNewSubtitleModal] = useState(false);
  const [newSubText, setNewSubText] = useState('');
  const [newSubStart, setNewSubStart] = useState('0');
  const [newSubEnd, setNewSubEnd] = useState('2');
  const dragControls = useDragControls();

  const audioMenuRef = useRef<HTMLDivElement>(null);
  const markerMenuRef = useRef<HTMLDivElement>(null);
  const loopMenuRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const subtitleMenuRef = useRef<HTMLDivElement>(null);
  const sizingMenuRef = useRef<HTMLDivElement>(null);
  const enhanceMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mpegtsPreviewPlayerRef = useRef<mpegts.Player | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(1000);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect ? entry.contentRect.width : entry.target.clientWidth;
          if (w > 0) setContainerWidth(w);
        }
      });
      ro.observe(containerRef.current);
    }

    window.addEventListener('resize', updateWidth);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!previewVideoRef?.current) return;

    if (mpegtsPreviewPlayerRef.current) {
      mpegtsPreviewPlayerRef.current.destroy();
      mpegtsPreviewPlayerRef.current = null;
    }

    if (videoSrc && hoverProgress !== null) {
      if ((videoSrc.endsWith('.ts') || videoSrc.includes('.ts?')) && mpegts.isSupported()) {
        try {
          const player = mpegts.createPlayer({
            type: 'mse',
            isLive: false,
            url: videoSrc,
          });
          player.attachMediaElement(previewVideoRef.current);
          player.load();
          mpegtsPreviewPlayerRef.current = player;
        } catch (e) {
          console.error("mpegts preview error", e);
          previewVideoRef.current.src = videoSrc;
          previewVideoRef.current.load();
        }
      } else {
        previewVideoRef.current.src = videoSrc;
        previewVideoRef.current.load();
      }
    } else {
      previewVideoRef.current.removeAttribute('src');
      previewVideoRef.current.load();
    }

    return () => {
      if (mpegtsPreviewPlayerRef.current) {
        mpegtsPreviewPlayerRef.current.destroy();
        mpegtsPreviewPlayerRef.current = null;
      }
    };
  }, [videoSrc, hoverProgress, previewVideoRef]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(event.target as Node)) {
        setShowAudioFlyout(false);
      }
      if (markerMenuRef.current && !markerMenuRef.current.contains(event.target as Node)) {
        setShowMarkerFlyout(false);
      }
      if (loopMenuRef.current && !loopMenuRef.current.contains(event.target as Node)) {
        setShowLoopMenu(false);
      }
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setShowSpeedMenu(false);
      }
      if (subtitleMenuRef.current && !subtitleMenuRef.current.contains(event.target as Node)) {
        setShowSubtitleMenu(false);
      }
      if (sizingMenuRef.current && !sizingMenuRef.current.contains(event.target as Node)) {
        setShowSizingMenu(false);
      }
      if (enhanceMenuRef.current && !enhanceMenuRef.current.contains(event.target as Node)) {
        setShowEnhanceMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSaveRename = (id: string) => {
    if (tempName.trim()) {
      onRenameLoop(id, tempName.trim());
    }
    setEditingLoopId(null);
  };

  const blurValue = appearanceSettings?.blur ?? 10;
  const transparencyValue = appearanceSettings?.transparency ?? 0.5;
  const displayMode = appearanceSettings?.displayMode ?? 'default';
  const isCompact = displayMode === 'compact';

  // Responsive adaptive thresholds based on measured container width
  const showShuffleRepeatOnBar = containerWidth >= 1040;
  const showHomeOnBar = containerWidth >= 980;
  const showStopOnBar = containerWidth >= 880;
  const showAudioFlyoutOnBar = containerWidth >= 840;
  const showPiPOnBar = containerWidth >= 900;
  const showEnhanceOnBar = containerWidth >= 860;
  const showSizingOnBar = containerWidth >= 820;
  const showSpeedOnBar = containerWidth >= 780;
  const showMarkerOnBar = containerWidth >= 820;
  const showLoopOnBar = containerWidth >= 720;
  const showABRepeatOnBar = containerWidth >= 840;
  const showTrimmerOnBar = containerWidth >= 720;
  const showCenterControls = containerWidth >= 720;
  const isMini = containerWidth < 520;
  const showMoreButton = containerWidth < 960;

  const containerStyle = {
    backgroundColor: `rgba(var(--panel-bg-color), ${transparencyValue})`,
    backdropFilter: `blur(${blurValue}px)`,
    WebkitBackdropFilter: `blur(${blurValue}px)`,
  } as React.CSSProperties;

  return (
    <div 
      ref={containerRef}
      onContextMenu={(e) => e.stopPropagation()}
      className={`absolute z-30 ${isCompact ? 'bottom-0 left-0 right-0 w-full border-t py-2 px-2 sm:py-3 sm:px-4 gap-2 sm:gap-3' : 'bottom-8 left-1/2 transform -translate-x-1/2 w-[95%] max-w-6xl border shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.8)] rounded-2xl p-4 gap-4'} border-black/10 dark:border-white/5 pointer-events-auto flex flex-col`}
      style={containerStyle}
    >
      <div className="flex items-center gap-4 px-2">
        <div className="text-xs font-mono font-bold text-orange-600 dark:text-amber-500 tracking-wider w-16 text-right">
          {formatTime(currentTime)}
        </div>
        
        {/* Progress Bar */}
        <div 
          ref={progressBarRef}
          className="relative flex-1 h-2 rounded-full cursor-pointer group/progress" 
          onMouseDown={handleProgressMouseDown}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          <div className="absolute inset-0 bg-black/20 dark:bg-white/10 rounded-full overflow-hidden">
            {/* Buffered Progress */}
            <div className="absolute top-0 left-0 bottom-0 bg-black/30 dark:bg-white/30 transition-all duration-300 ease-linear rounded-full" style={{ width: `${bufferedProgress || 0}%` }} />
            {/* Played Progress */}
            <div className="absolute top-0 left-0 bottom-0 bg-orange-500 dark:bg-amber-500 transition-all duration-100 ease-linear rounded-full" style={{ width: `${progress}%` }} />
          </div>
          {/* Hover Preview */}
          {hoverProgress !== null && videoSrc && (
            <div 
              className="absolute bottom-6 -translate-x-1/2 flex flex-col items-center pointer-events-none z-50 transition-opacity duration-200"
              style={{ left: `${hoverProgress}%` }}
            >
              <div className="w-32 h-20 bg-black border border-orange-500/50 dark:border-amber-500/50 rounded overflow-hidden shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]">
                <video 
                  ref={previewVideoRef} 
                  className="w-full h-full object-cover" 
                  muted 
                  preload="auto"
                />
              </div>
              <div className="mt-1 px-2 py-0.5 bg-white/60 dark:bg-black/80 text-orange-600 dark:text-amber-500 text-[10px] rounded font-mono font-bold tracking-wider">
                {formatTime(hoverTime)}
              </div>
            </div>
          )}
          {/* A/B Markers */}
          {repeatA !== null && videoDuration > 0 && (
            <div className="absolute bottom-full mb-1 -translate-x-1/2 pointer-events-none" style={{ left: `${(repeatA / videoDuration) * 100}%` }}>
              <ElegantMarker color="#f59e0b" className="w-6 h-8" />
            </div>
          )}
          {repeatB !== null && videoDuration > 0 && (
            <div className="absolute bottom-full mb-1 -translate-x-1/2 pointer-events-none" style={{ left: `${(repeatB / videoDuration) * 100}%` }}>
              <ElegantMarker color="#f97316" className="w-6 h-8" />
            </div>
          )}
          {/* Custom Markers */}
          {markers.map((marker: any) => (
            <div 
              key={marker.id}
              className="absolute bottom-full mb-1 -translate-x-1/2 pointer-events-auto cursor-pointer group/marker z-20" 
              style={{ left: `${(marker.time / (videoDuration || 1)) * 100}%` }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(marker.time);
              }}
              title={marker.label}
            >
              <CustomMarkerIcon color="#f59e0b" className="w-5 h-7 hover:scale-110 transition-transform" />
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white/80 dark:bg-black/90 text-amber-400 text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover/marker:opacity-100 transition-opacity pointer-events-none border border-orange-500/30 dark:border-amber-500/30 font-bold tracking-wider">
                {marker.label}
              </div>
            </div>
          ))}

          {/* Trimming Highlight Band */}
          {isTrimMode && trimStart !== null && trimEnd !== null && videoDuration > 0 && (
            <div 
              className="absolute top-0 bottom-0 bg-amber-500/30 border-x border-amber-400 z-10 pointer-events-none rounded-full"
              style={{
                left: `${(Math.max(0, trimStart) / videoDuration) * 100}%`,
                width: `${Math.max(0, ((Math.min(videoDuration, trimEnd) - Math.max(0, trimStart)) / videoDuration) * 100)}%`
              }}
            />
          )}

          {/* Trimming IN Marker Handle */}
          {isTrimMode && trimStart !== null && videoDuration > 0 && (
            <div 
              id="trim-marker-start-handle"
              className="absolute bottom-full mb-0.5 -translate-x-1/2 cursor-ew-resize z-30 group/trimstart select-none"
              style={{ left: `${(Math.max(0, trimStart) / videoDuration) * 100}%` }}
              onMouseDown={handleDragTrimStart}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(trimStart);
              }}
              title={`${t('trimStartShort', lang)}: ${formatTime(trimStart)}`}
            >
              <div className="bg-amber-500 hover:bg-amber-400 text-black text-[9px] font-mono font-black px-1.5 py-0.5 rounded shadow flex items-center gap-0.5 border border-amber-300 transition-colors">
                <span>[</span>
                <span>IN</span>
              </div>
              <div className="w-0.5 h-2 bg-amber-500 mx-auto"></div>
            </div>
          )}

          {/* Trimming OUT Marker Handle */}
          {isTrimMode && trimEnd !== null && videoDuration > 0 && (
            <div 
              id="trim-marker-end-handle"
              className="absolute bottom-full mb-0.5 -translate-x-1/2 cursor-ew-resize z-30 group/trimend select-none"
              style={{ left: `${(Math.min(videoDuration, trimEnd) / videoDuration) * 100}%` }}
              onMouseDown={handleDragTrimEnd}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(trimEnd);
              }}
              title={`${t('trimEndShort', lang)}: ${formatTime(trimEnd)}`}
            >
              <div className="bg-orange-600 hover:bg-orange-500 text-white text-[9px] font-mono font-black px-1.5 py-0.5 rounded shadow flex items-center gap-0.5 border border-orange-400 transition-colors">
                <span>OUT</span>
                <span>]</span>
              </div>
              <div className="w-0.5 h-2 bg-orange-600 mx-auto"></div>
            </div>
          )}
        </div>

        <div className="text-xs font-mono font-bold text-orange-600 dark:text-amber-500 tracking-wider w-16 text-left">
          {formatTime(videoDuration || 0)}
        </div>
      </div>

      {/* Non-Destructive Trimming Panel */}
      {isTrimMode && (
        <div 
          id="trimming-control-panel"
          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/5 dark:bg-black/40 border border-amber-500/30 dark:border-amber-500/20 rounded-xl relative z-20 pointer-events-auto"
        >
          {/* Left: IN Marker Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Scissors size={12} className="text-amber-500" />
              {t('trimStartShort', lang)}
            </span>
            <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 bg-black/5 dark:bg-white/5 rounded border border-black/10 dark:border-white/10" title="Format: MM:SS.mmm">
              {formatPreciseTime(trimStart)}
            </span>
            <button
              id="btn-set-trim-start"
              onClick={() => setTrimStart(Math.max(0, Math.min(currentTime, trimEnd - 0.05)))}
              className="px-2 py-1 text-[10px] font-bold uppercase rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 transition-colors"
              title={`${t('trimSetStart', lang)} ( [ )`}
            >
              [ {t('trimSetStart', lang).split(' ')[0]}
            </button>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  const next = Math.max(0, trimStart - (1 / 30));
                  setTrimStart(next);
                  onSeek(next);
                }}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 rounded transition-colors"
                title={lang === 'id' ? 'Mundur 1 Frame (-1F)' : 'Step Back 1 Frame (-1F)'}
              >
                -1F
              </button>
              <button
                onClick={() => {
                  const next = Math.min(trimEnd - 0.033, trimStart + (1 / 30));
                  setTrimStart(next);
                  onSeek(next);
                }}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 rounded transition-colors"
                title={lang === 'id' ? 'Maju 1 Frame (+1F)' : 'Step Forward 1 Frame (+1F)'}
              >
                +1F
              </button>
              <button
                onClick={() => setTrimStart(prev => Math.max(0, prev - 0.5))}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400 hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                title="-0.5s"
              >
                -0.5s
              </button>
              <button
                onClick={() => setTrimStart(prev => Math.min(trimEnd - 0.1, prev + 0.5))}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400 hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                title="+0.5s"
              >
                +0.5s
              </button>
              <button
                onClick={() => onSeek(trimStart)}
                className="p-1 text-zinc-500 hover:text-amber-500 rounded transition-colors"
                title={lang === 'id' ? 'Lompat ke Titik Awal Potong' : 'Seek to Start'}
              >
                <ChevronRight size={13} className="-rotate-180" />
              </button>
            </div>
          </div>

          {/* Center: Duration & Preview & Accuracy Toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg" title={t('trimNonDestructiveDesc', lang)}>
              <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400">{t('trimDuration', lang)}:</span>
              <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">{formatPreciseTime(Math.max(0, trimEnd - trimStart))}</span>
            </div>
            
            {/* Mode Toggle: Akurat (Frame) vs Cepat (Keyframe) */}
            <button
              id="btn-toggle-trim-mode"
              type="button"
              onClick={() => setIsAccurateTrim(prev => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all border cursor-pointer ${
                isAccurateTrim
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-black/5 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 border-black/10 dark:border-white/10 hover:text-amber-500'
              }`}
              title={isAccurateTrim ? t('trimModeAccurateTooltip', lang) : t('trimModeFastTooltip', lang)}
            >
              {isAccurateTrim ? <Target size={12} className="text-amber-500" /> : <Zap size={12} className="text-amber-500" />}
              <span>{isAccurateTrim ? t('trimModeAccurate', lang) : t('trimModeFast', lang)}</span>
            </button>

            <button
              id="btn-preview-trim-segment"
              onClick={() => {
                if (isPreviewingTrim) {
                  setIsPreviewingTrim(false);
                  if (isPlaying) togglePlay();
                } else {
                  onSeek(trimStart);
                  setIsPreviewingTrim(true);
                  if (!isPlaying) togglePlay();
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors border ${
                isPreviewingTrim
                  ? 'bg-amber-500 text-black border-amber-400 shadow-sm'
                  : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-amber-500 border-black/10 dark:border-white/10 hover:border-amber-500/30'
              }`}
              title={isPreviewingTrim ? t('trimPreviewStop', lang) : t('trimPreview', lang)}
            >
              {isPreviewingTrim ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              <span>{isPreviewingTrim ? t('trimPreviewStop', lang) : t('trimPreview', lang)}</span>
            </button>
          </div>

          {/* Right: OUT Marker Controls & Actions */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
              {t('trimEndShort', lang)}
            </span>
            <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200 px-1.5 py-0.5 bg-black/5 dark:bg-white/5 rounded border border-black/10 dark:border-white/10" title="Format: MM:SS.mmm">
              {formatPreciseTime(trimEnd)}
            </span>
            <button
              id="btn-set-trim-end"
              onClick={() => setTrimEnd(Math.min(videoDuration || 99999, Math.max(currentTime, trimStart + 0.05)))}
              className="px-2 py-1 text-[10px] font-bold uppercase rounded-md bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-300 border border-orange-500/30 transition-colors"
              title={`${t('trimSetEnd', lang)} ( ] )`}
            >
              {t('trimSetEnd', lang).split(' ')[0]} ]
            </button>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  const next = Math.max(trimStart + 0.033, trimEnd - (1 / 30));
                  setTrimEnd(next);
                  onSeek(next);
                }}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-500/15 rounded transition-colors"
                title={lang === 'id' ? 'Mundur 1 Frame (-1F)' : 'Step Back 1 Frame (-1F)'}
              >
                -1F
              </button>
              <button
                onClick={() => {
                  const next = Math.min(videoDuration || 99999, trimEnd + (1 / 30));
                  setTrimEnd(next);
                  onSeek(next);
                }}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-orange-600 dark:text-orange-400 hover:bg-orange-500/15 rounded transition-colors"
                title={lang === 'id' ? 'Maju 1 Frame (+1F)' : 'Step Forward 1 Frame (+1F)'}
              >
                +1F
              </button>
              <button
                onClick={() => setTrimEnd(prev => Math.max(trimStart + 0.1, prev - 0.5))}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400 hover:text-orange-500 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                title="-0.5s"
              >
                -0.5s
              </button>
              <button
                onClick={() => setTrimEnd(prev => Math.min(videoDuration || 99999, prev + 0.5))}
                className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-600 dark:text-zinc-400 hover:text-orange-500 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                title="+0.5s"
              >
                +0.5s
              </button>
              <button
                onClick={() => onSeek(trimEnd)}
                className="p-1 text-zinc-500 hover:text-orange-500 rounded transition-colors"
                title={lang === 'id' ? 'Lompat ke Titik Akhir Potong' : 'Seek to End'}
              >
                <ChevronRight size={13} />
              </button>
            </div>

            <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1"></div>

            <button
              id="btn-reset-trim"
              onClick={() => {
                setTrimStart(0);
                setTrimEnd(videoDuration || 0);
              }}
              className="p-1.5 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
              title={t('trimReset', lang)}
            >
              <RotateCcw size={13} />
            </button>

            {/* Export Segment Button */}
            <button
              id="btn-export-trim"
              disabled={isExportingTrim || trimEnd <= trimStart}
              onClick={() => {
                if (onExportTrimSegment) {
                  onExportTrimSegment({
                    startTime: trimStart,
                    endTime: trimEnd,
                    duration: trimEnd - trimStart,
                    accurate: isAccurateTrim
                  });
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm ${
                trimExportStatus === 'completed'
                  ? 'bg-emerald-500 text-white shadow-emerald-500/20 active:scale-95 cursor-pointer'
                  : isExportingTrim || trimEnd <= trimStart
                  ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black shadow-amber-500/20 active:scale-95 cursor-pointer'
              }`}
              title={t('trimExport', lang)}
            >
              {trimExportStatus === 'completed' ? (
                <>
                  <Check size={13} strokeWidth={3} className="text-white" />
                  <span>{lang === 'id' ? 'Selesai!' : 'Done!'}</span>
                </>
              ) : (
                <>
                  <Download size={13} className={isExportingTrim ? 'animate-bounce' : ''} />
                  <span>{isExportingTrim ? t('trimExporting', lang) : t('trimExport', lang)}</span>
                </>
              )}
            </button>

            <button
              id="btn-close-trim"
              onClick={() => {
                setIsTrimMode(false);
                setIsPreviewingTrim(false);
              }}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
              title={t('trimClose', lang)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Row: Controls */}
      <div className="flex items-center justify-between w-full px-1 sm:px-2 gap-1 sm:gap-2">
        {/* Left Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 justify-start flex-1 min-w-0 pointer-events-none [&>*]:pointer-events-auto">
          <button 
            onClick={togglePlay} 
            className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black rounded-full transition-all focus:outline-none transform hover:scale-105 duration-300 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)] shrink-0 cursor-pointer" 
            title={t('playPauseTooltip', lang)}
          >
            {isPlaying ? <Pause size={20} className="sm:w-6 sm:h-6" fill="currentColor" /> : <Play size={20} className="sm:w-6 sm:h-6 ml-1" fill="currentColor" />}
          </button>

          {showStopOnBar && (
            <button 
              onClick={stopPlayback} 
              className="flex w-9 h-9 sm:w-10 sm:h-10 items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 rounded-full transition-all focus:outline-none shrink-0 cursor-pointer" 
              title={t('stopTooltip', lang)}
            >
              <Square size={16} fill="currentColor" />
            </button>
          )}

          {showHomeOnBar && onMinimize && (
            <button 
              onClick={onMinimize} 
              className="flex w-9 h-9 sm:w-10 sm:h-10 items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 rounded-full transition-all focus:outline-none shrink-0 cursor-pointer" 
              title={lang === 'id' ? 'Sembunyikan Pemutar (Kembali ke Beranda)' : 'Minimize Player (Back to Home)'}
            >
              <Home size={16} />
            </button>
          )}

          {/* Volume Control: Full slider when space permits, compact mute button on narrow width */}
          {!isMini ? (
            <div 
              onMouseEnter={() => { setIsVolumeHovered(true); setShowAudioFlyout(false); }}
              onMouseLeave={() => setIsVolumeHovered(false)}
              onFocus={() => { setIsVolumeHovered(true); setShowAudioFlyout(false); }}
              onBlur={() => setIsVolumeHovered(false)}
              className="flex items-center gap-1.5 sm:gap-2 bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full transition-all duration-300 shrink-0"
            >
              <button 
                onClick={onToggleMute} 
                className="text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-colors focus:outline-none cursor-pointer" 
                title={t('muteUnmuteTooltip', lang)}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className={`relative h-1 transition-all duration-300 rounded-full flex items-center overflow-hidden ${isVolumeHovered ? 'w-16 sm:w-20' : 'w-0'}`}>
                <div className="absolute inset-0 bg-black/20 dark:bg-white/20 rounded-full"></div>
                <div className="absolute left-0 top-0 bottom-0 bg-orange-500 dark:bg-amber-500 rounded-full" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}></div>
                <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={(e) => onVolumeChange(parseFloat(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
            </div>
          ) : (
            <button 
              onClick={onToggleMute} 
              className="w-8 h-8 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 rounded-full transition-all shrink-0 cursor-pointer" 
              title={t('muteUnmuteTooltip', lang)}
            >
              {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          )}

          {showAudioFlyoutOnBar && (
            <div 
              className={`relative shrink-0 transition-all duration-300 origin-left ${isVolumeHovered ? 'w-0 opacity-0 pointer-events-none scale-0 mr-[-8px]' : 'w-auto opacity-100 scale-100'}`} 
              ref={audioMenuRef}
            >
              <button 
                onClick={() => setShowAudioFlyout(!showAudioFlyout)} 
                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all focus:outline-none cursor-pointer ${showAudioFlyout || isAudioNormalized ? 'bg-orange-500/20 dark:bg-amber-500/20 text-orange-600 dark:text-amber-500 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} 
                title={t('audioSettingsTooltip', lang)}
              >
                <AudioLines size={16} className="sm:w-[18px] sm:h-[18px]" />
              </button>

              {showAudioFlyout && (
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 min-w-[210px] bg-white dark:bg-[#111111] p-1.5 gap-1">
                  <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex justify-between items-center rounded-lg mb-1">
                    <span className="text-[10px] font-bold text-orange-600 dark:text-amber-500 uppercase tracking-wider">{t('audioMenuTitle', lang)}</span>
                    <button onClick={() => setShowAudioFlyout(false)} className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"><X size={12}/></button>
                  </div>
                  
                  <button
                    onClick={() => { onToggleAudioNormalize(); setShowAudioFlyout(false); }}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold transition-all rounded-lg cursor-pointer ${isAudioNormalized ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Activity size={16} className={isAudioNormalized ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                      <span>{t('normalization', lang)}</span>
                    </div>
                    {isAudioNormalized && <Check size={14} />}
                  </button>

                  <button
                    onClick={() => { onToggleSwapChannels(); setShowAudioFlyout(false); }}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold transition-all rounded-lg cursor-pointer ${isSwapChannels ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                  >
                    <div className="flex items-center gap-3">
                      <ArrowLeftRight size={16} className={isSwapChannels ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                      <span>{t('swapStereoMenu', lang)}</span>
                    </div>
                    {isSwapChannels && <Check size={14} />}
                  </button>

                  <button
                    onClick={() => { onShowAudioSettings(); setShowAudioFlyout(false); }}
                    className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-all rounded-lg text-left cursor-pointer"
                  >
                    <Sliders size={16} className="text-zinc-400 dark:text-zinc-500" />
                    <span>{t('advancedAudioEq', lang)}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center Controls (Looping, Markers, Trimmer) */}
        {showCenterControls && (
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 justify-center shrink-0 relative z-10 pointer-events-auto">
            {showShuffleRepeatOnBar && (
              <>
                <button 
                  type="button"
                  onClick={onToggleShuffle} 
                  className={`flex w-8 h-8 sm:w-9 sm:h-9 items-center justify-center rounded-full transition-colors shrink-0 cursor-pointer ${isShuffle ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} 
                  title={t('shuffle', lang)}
                >
                  <Shuffle size={16} className="sm:w-[18px] sm:h-[18px]" />
                </button>
                <button 
                  type="button"
                  onClick={onToggleRepeatMode} 
                  className={`flex w-8 h-8 sm:w-9 sm:h-9 items-center justify-center rounded-full transition-colors shrink-0 cursor-pointer ${repeatMode !== 'none' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} 
                  title={repeatMode === 'current' ? t('repeatVideo', lang) : repeatMode === 'playlist' ? t('repeatAll', lang) : t('noRepeat', lang)}
                >
                  {repeatMode === 'current' ? <Repeat1 size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Repeat size={16} className="sm:w-[18px] sm:h-[18px]" />}
                </button>
              </>
            )}
            
            {showLoopOnBar && (
              <div className="flex items-center gap-0.5 sm:gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg relative shrink-0" ref={loopMenuRef}>
                <button onClick={setRepeatA} className={`px-2 md:px-3 py-1.5 rounded text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${repeatA !== null ? 'bg-black/10 dark:bg-white/10 text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`}>
                  <span className="hidden sm:inline">[ SET A</span>
                  <span className="sm:hidden">A</span>
                </button>
                <button onClick={setRepeatB} className={`px-2 md:px-3 py-1.5 rounded text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${repeatB !== null ? 'bg-black/10 dark:bg-white/10 text-zinc-900 dark:text-white' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`}>
                  <span className="hidden sm:inline">SET B ]</span>
                  <span className="sm:hidden">B</span>
                </button>
                
                {repeatA !== null && repeatB !== null && (
                  <button onClick={() => onSaveLoop('')} className="p-1.5 rounded text-orange-600 dark:text-amber-500 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 transition-colors cursor-pointer" title={t('saveThisLoop', lang)}>
                    <Save size={14} />
                  </button>
                )}
                
                <button onClick={() => setShowLoopMenu(!showLoopMenu)} className={`p-1.5 rounded transition-colors cursor-pointer ${savedLoops.length > 0 ? 'text-orange-600 dark:text-amber-500 hover:bg-orange-500/20 dark:hover:bg-amber-500/20' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} title={t('savedLoopsTitle', lang)}>
                  <List size={14} />
                </button>

                {/* Loop Menu Dropdown */}
                {showLoopMenu && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 bg-white dark:bg-[#111111] p-1.5 gap-1 flex flex-col">
                    <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex justify-between items-center rounded-lg mb-1">
                      <span className="text-[10px] font-bold text-orange-600 dark:text-amber-500 uppercase tracking-wider">{t('loopTersimpanHeader', lang)}</span>
                      <button onClick={() => setShowLoopMenu(false)} className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"><X size={12}/></button>
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-1 p-0.5">
                      {savedLoops.length === 0 ? (
                        <div className="p-4 text-center text-xs text-zinc-500">{t('noSavedLoops', lang)}</div>
                      ) : (
                        savedLoops.map((loop: any) => (
                          <div key={loop.id} className="flex items-center justify-between px-3 py-2 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 transition-all rounded-lg group">
                            {editingLoopId === loop.id ? (
                              <div className="flex-1 flex items-center gap-2 pr-1">
                                <input 
                                  autoFocus
                                  type="text"
                                  value={tempName}
                                  onChange={(e) => setTempName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(loop.id);
                                    if (e.key === 'Escape') setEditingLoopId(null);
                                  }}
                                  className="flex-1 bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs p-1 rounded border border-orange-500/50 dark:border-amber-500/50 focus:outline-none"
                                />
                                <button onClick={() => handleSaveRename(loop.id)} className="text-emerald-500 hover:text-emerald-400">
                                  <Check size={14} />
                                </button>
                                <button onClick={() => setEditingLoopId(null)} className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors">
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <button 
                                  onClick={() => { onPlayLoop(loop); setShowLoopMenu(false); }}
                                  className="flex-1 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 font-bold truncate pr-2 transition-colors cursor-pointer"
                                >
                                  {loop.name} <span className="text-[10px] text-zinc-500 font-normal ml-1">({formatTime(loop.start)} - {formatTime(loop.end)})</span>
                                </button>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button 
                                    onClick={(e) => handleExportLoopSegment(e, loop)}
                                    disabled={isExportingTrim}
                                    className={`p-1 transition-all rounded cursor-pointer relative ${
                                      exportingLoopId === loop.id
                                        ? 'text-amber-500 opacity-100 bg-amber-500/10'
                                        : completedLoopId === loop.id
                                        ? 'text-emerald-500 opacity-100 bg-emerald-500/10'
                                        : isExportingTrim
                                        ? 'text-zinc-400 dark:text-zinc-600 opacity-0 group-hover:opacity-100 cursor-not-allowed'
                                        : 'text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 opacity-0 group-hover:opacity-100'
                                    }`}
                                    title={
                                      exportingLoopId === loop.id 
                                        ? t('trimExporting', lang) 
                                        : completedLoopId === loop.id
                                        ? t('trimExportSuccess', lang)
                                        : t('trimExportLoop', lang)
                                    }
                                  >
                                    {completedLoopId === loop.id ? (
                                      <Check size={13} strokeWidth={2.5} className="text-emerald-500" />
                                    ) : (
                                      <Scissors size={13} className={exportingLoopId === loop.id ? 'animate-bounce text-amber-500' : ''} />
                                    )}
                                    {exportingLoopId === loop.id && (
                                      <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                      </span>
                                    )}
                                  </button>
                                  <button 
                                    onClick={() => { setEditingLoopId(loop.id); setTempName(loop.name); }} 
                                    className="p-1 text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button onClick={() => onRemoveLoop(loop.id)} className="p-1 text-zinc-500 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-rose-500/10 cursor-pointer">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {showABRepeatOnBar && (
              <button onClick={onToggleRepeatEnabled} className={`flex w-8 h-8 md:w-10 md:h-10 items-center justify-center rounded-full transition-all font-bold text-[10px] tracking-tighter shrink-0 cursor-pointer ${repeatEnabled ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} title={t('settingRepeat', lang)}>
                A/B
              </button>
            )}
            
            {showMarkerOnBar && (
              <>
                <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-0.5 sm:mx-1 shrink-0"></div>
                
                <div className="relative shrink-0" ref={markerMenuRef}>
                  <button 
                    onClick={() => setShowMarkerFlyout(!showMarkerFlyout)} 
                    className={`p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer ${showMarkerFlyout || markers.length > 0 ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} 
                    title={t('markerMenu', lang)}
                  >
                    <MapPin size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </button>

                  {showMarkerFlyout && (
                    <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 min-w-[210px] bg-white dark:bg-[#111111] p-1.5 gap-1">
                      <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex justify-between items-center rounded-lg mb-1">
                        <span className="text-[10px] font-bold text-orange-600 dark:text-amber-500 uppercase tracking-wider">{t('markerMenu', lang)}</span>
                        <button onClick={() => setShowMarkerFlyout(false)} className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"><X size={12}/></button>
                      </div>
                      <button
                        onClick={() => { handleAddMarker(); setShowMarkerFlyout(false); }}
                        className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-all rounded-lg text-left cursor-pointer"
                      >
                        <BookmarkPlus size={16} className="text-zinc-400 dark:text-zinc-500" />
                        <span>{t('addMarker', lang)}</span>
                      </button>
                      <button
                        onClick={() => { setShowMarkerList(true); setShowMarkerFlyout(false); }}
                        className="flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-all rounded-lg text-left cursor-pointer"
                      >
                        <List size={16} className="text-zinc-400 dark:text-zinc-500" />
                        <span>{t('markerListWithCount', lang, { count: markers.length })}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Trimmer UI Toggle */}
            {showTrimmerOnBar && (
              <button 
                id="btn-toggle-trimmer"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTrimMode(prev => !prev);
                }} 
                className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all shrink-0 cursor-pointer relative z-20 ${
                  trimExportStatus === 'completed'
                    ? 'text-emerald-500 bg-emerald-500/20 ring-1 ring-emerald-500/50 shadow-sm shadow-emerald-500/30'
                    : (isExportingTrim || trimExportStatus === 'exporting')
                    ? 'text-amber-500 bg-amber-500/20 ring-1 ring-amber-500/50 shadow-sm shadow-amber-500/30'
                    : isTrimMode 
                    ? 'text-amber-500 bg-amber-500/20 ring-1 ring-amber-500/40 shadow-sm' 
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'
                }`} 
                title={
                  isExportingTrim || trimExportStatus === 'exporting'
                    ? t('trimExporting', lang)
                    : trimExportStatus === 'completed'
                    ? t('trimExportSuccess', lang)
                    : `${t('trimVideoTooltip', lang)} (Ctrl+T)`
                }
              >
                <Scissors 
                  size={16} 
                  className={`sm:w-[18px] sm:h-[18px] transition-all duration-300 ${
                    trimExportStatus === 'completed'
                      ? 'text-emerald-500 scale-110'
                      : (isExportingTrim || trimExportStatus === 'exporting')
                      ? 'animate-bounce text-amber-500'
                      : ''
                  }`} 
                />

                {/* Status Indicator Badge (Consistent with Sniffer Download Badge) */}
                {(isExportingTrim || trimExportStatus === 'exporting' || trimExportStatus === 'completed') && (
                  <span 
                    className={`absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 sm:h-5 sm:w-5 items-center justify-center rounded-full text-[10px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-white/10 transition-colors duration-300 ${
                      (isExportingTrim || trimExportStatus === 'exporting')
                        ? 'bg-orange-500 animate-pulse' 
                        : 'bg-emerald-500'
                    }`}
                  >
                    {(isExportingTrim || trimExportStatus === 'exporting') ? (
                      <span className="w-2 h-2 bg-white rounded-full animate-ping" />
                    ) : (
                      <Check size={11} strokeWidth={3} className="text-white" />
                    )}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Right Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1 justify-end flex-1 min-w-0 pointer-events-none [&>*]:pointer-events-auto">
          {showEnhanceOnBar && (
            <div className="relative flex items-center shrink-0" ref={enhanceMenuRef}>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowEnhanceMenu(!showEnhanceMenu); }} 
                className={`flex items-center justify-center p-1.5 sm:p-2 rounded-full transition-all focus:outline-none cursor-pointer ${showEnhanceMenu || isEnhance || isSuperRes || isAmbientMode || isFrameInterpolation ? 'bg-orange-500/20 dark:bg-amber-500/20 text-orange-600 dark:text-amber-500 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} 
                title={lang === 'id' ? 'Menu Efek Video' : 'Video Effects Menu'}
              >
                <Sparkles size={16} className="sm:w-[18px] sm:h-[18px]" />
              </button>

              {showEnhanceMenu && (
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 min-w-[220px] bg-white dark:bg-[#111111] p-1.5 gap-1">
                  <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex justify-between items-center rounded-lg mb-1">
                    <span className="text-[10px] font-bold text-orange-600 dark:text-amber-500 uppercase tracking-wider">{lang === 'id' ? 'Menu Video' : 'Video Menu'}</span>
                    <button onClick={() => setShowEnhanceMenu(false)} className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"><X size={12}/></button>
                  </div>
                  
                  <button
                    onClick={() => { onToggleFrameInterpolation && onToggleFrameInterpolation(); }}
                    className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg cursor-pointer ${isFrameInterpolation ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Layers size={16} className={isFrameInterpolation ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                      <div className="flex flex-col text-left">
                        <span>{lang === 'id' ? 'Interpolasi Frame' : 'Frame Interpolation'}</span>
                        <span className="text-[10px] font-normal opacity-75">
                          {lang === 'id' ? 'Metode Ringan (60 FPS)' : 'Light Method (60 FPS)'}
                        </span>
                      </div>
                    </div>
                    {isFrameInterpolation && <Check size={14} />}
                  </button>

                  <button
                    onClick={() => { onToggleAmbientMode && onToggleAmbientMode(); }}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold transition-all rounded-lg cursor-pointer ${isAmbientMode ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                  >
                    <div className="flex items-center gap-3">
                      <SunMedium size={16} className={isAmbientMode ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                      <span>{lang === 'id' ? 'Mode Ambient (Pendaran)' : 'Ambient Mode (Glow)'}</span>
                    </div>
                    {isAmbientMode && <Check size={14} />}
                  </button>

                  <button
                    onClick={() => { onToggleEnhance(); }}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold transition-all rounded-lg cursor-pointer ${isEnhance ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles size={16} className={isEnhance ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                      <span>{t('settingEnhance', lang)}</span>
                    </div>
                    {isEnhance && <Check size={14} />}
                  </button>

                  <button
                    onClick={() => { onToggleSuperRes(); }}
                    className={`flex items-center justify-between px-3 py-2.5 text-xs font-bold transition-all rounded-lg cursor-pointer ${isSuperRes ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Cpu size={16} className={isSuperRes ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-400 dark:text-zinc-500'} />
                      <span>{lang === 'id' ? 'Super Resolusi' : 'Super Resolution'}</span>
                    </div>
                    {isSuperRes && <Check size={14} />}
                  </button>
                </div>
              )}
            </div>
          )}

          {showSpeedOnBar && (
            <div className="relative flex items-center shrink-0" ref={speedMenuRef}>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); }} 
                className="flex items-center gap-0.5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-colors p-1.5 sm:p-2 px-2 rounded-full hover:bg-orange-500/10 dark:hover:bg-amber-500/10 cursor-pointer" 
                title={t('playbackSpeed', lang)}
              >
                <Gauge size={16} className="sm:w-[18px] sm:h-[18px]" />
                <span className="text-[10px] font-bold">{playbackRate}x</span>
              </button>
              
              {showSpeedMenu && (
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 border border-black/10 dark:border-white/10 rounded-lg shadow-2xl overflow-hidden flex flex-col z-50 bg-white dark:bg-[#111111]">
                  {playbackRates.map((rate: number) => (
                    <button
                      key={rate}
                      onClick={() => setSpeed(rate)}
                      className={`px-6 py-2.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${playbackRate === rate ? 'bg-orange-500 dark:bg-amber-500 text-black' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showSizingOnBar && (
            <div className="relative flex items-center shrink-0" ref={sizingMenuRef}>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSizingMenu(!showSizingMenu); }} 
                className="flex items-center gap-0.5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-colors p-1.5 sm:p-2 px-2 rounded-full hover:bg-orange-500/10 dark:hover:bg-amber-500/10 cursor-pointer" 
                title={lang === 'id' ? 'Ukuran Video' : 'Video Sizing'}
              >
                <Monitor size={16} className="sm:w-[18px] sm:h-[18px]" />
                <span className="text-[10px] font-bold">
                  {videoSizingMode === 'contain' ? 'Fit' : videoSizingMode === 'fill' ? 'Fill' : videoSizingMode === 'fit-horizontal' ? 'W-Fit' : videoSizingMode === 'fit-vertical' ? 'H-Fit' : 'Orig'}
                </span>
              </button>
              
              {showSizingMenu && (
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 bg-white dark:bg-[#111111] min-w-[175px] p-1.5 gap-1">
                  <div className="px-3 py-1.5 text-[9px] font-extrabold text-orange-600 dark:text-amber-500 uppercase tracking-widest border-b border-black/5 dark:border-white/5 mb-1">
                    {lang === 'id' ? 'Ukuran Video' : 'Video Sizing'}
                  </div>
                  {([
                    { mode: 'contain', id: 'Fit (Bawaan)', en: 'Fit (Default)' },
                    { mode: 'fill', id: 'Isi Layar (Penuh)', en: 'Fit to Screen' },
                    { mode: 'fit-horizontal', id: 'Cocokkan Lebar', en: 'Fit Horizontal' },
                    { mode: 'fit-vertical', id: 'Cocokkan Tinggi', en: 'Fit Vertical' },
                    { mode: 'original', id: 'Ukuran Asli', en: 'Original Size' }
                  ] as const).map((item) => (
                    <button
                      key={item.mode}
                      onClick={() => {
                        onChangeVideoSizingMode(item.mode);
                        setShowSizingMenu(false);
                      }}
                      className={`px-4 py-2.5 text-left text-xs font-bold transition-all rounded-lg flex items-center justify-between gap-3 cursor-pointer ${videoSizingMode === item.mode ? 'bg-orange-500 dark:bg-amber-500 text-black' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                    >
                      <span>{lang === 'id' ? item.id : item.en}</span>
                      {videoSizingMode === item.mode && <Check size={14} className="shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Subtitle Control */}
          <div className="relative shrink-0" ref={subtitleMenuRef}>
            <button 
              onClick={() => setShowSubtitleMenu(!showSubtitleMenu)} 
              className={`p-1.5 sm:p-2 rounded-full transition-colors cursor-pointer ${showSubtitleMenu || hasSubtitle ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} 
              title={t('subtitlesTitle', lang)}
            >
              <MessageSquare size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
            
            {showSubtitleMenu && (
              <div className="absolute bottom-full mb-4 right-0 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 bg-white dark:bg-[#111111] min-w-[200px] p-1.5 gap-1">
                <label className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg cursor-pointer text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors">
                  <Plus size={14} /> {t('openLoadSubtitle', lang)}
                  <input 
                    type="file" 
                    accept=".srt,.vtt,.ass,.ssa" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        loadSubtitle(e.target.files[0]);
                        setShowSubtitleMenu(false);
                      }
                    }} 
                  />
                </label>
                
                <button
                  onClick={() => {
                    setShowNewSubtitleModal(true);
                    setShowSubtitleMenu(false);
                    const startVal = typeof currentTime === 'number' ? parseFloat(currentTime.toFixed(2)) : 0;
                    setNewSubStart(startVal.toString());
                    setNewSubEnd((startVal + 2).toFixed(2));
                    setNewSubText('');
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 text-left transition-colors cursor-pointer"
                >
                  <Pencil size={14} /> {t('newSubtitleOption', lang)}
                </button>
 
                 {hasSubtitle && (
                  <button
                    onClick={() => {
                      onUnloadSubtitle();
                      setShowSubtitleMenu(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg text-red-500 hover:bg-red-500/10 text-left transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} /> {t('unloadSubtitleOption', lang)}
                  </button>
                )}
              </div>
            )}
          </div>

          {showPiPOnBar && (
            <button 
              type="button"
              onClick={onTogglePiP} 
              className={`flex w-8 h-8 sm:w-9 sm:h-9 items-center justify-center rounded-full transition-colors cursor-pointer shrink-0 ${isPiP ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} 
              title={t('pipTooltip', lang)}
            >
              <PictureInPicture2 size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          )}

          {/* More Controls (...) Overflow Menu when window/container is resized */}
          {showMoreButton && (
            <div className="relative flex items-center shrink-0" ref={moreMenuRef}>
              <button 
                id="btn-more-controls"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMoreMenu(prev => !prev);
                }} 
                className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full transition-all cursor-pointer shrink-0 focus:outline-none ${
                  showMoreMenu || isTrimMode || isEnhance || isSuperRes || repeatEnabled || playbackRate !== 1
                    ? 'bg-orange-500/20 dark:bg-amber-500/20 text-orange-600 dark:text-amber-500 ring-1 ring-orange-500/30 dark:ring-amber-500/30' 
                    : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'
                }`} 
                title={lang === 'id' ? 'Kontrol & Fitur Tambahan' : 'More Controls'}
              >
                <MoreHorizontal size={18} />
              </button>

              {/* Overflow Popover Menu */}
              {showMoreMenu && (
                <div className="absolute bottom-full mb-3 right-0 border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-50 w-72 sm:w-80 max-h-[75vh] bg-white dark:bg-[#121212] p-2 gap-2 custom-scrollbar overflow-y-auto">
                  {/* Header */}
                  <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex justify-between items-center rounded-xl">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={14} className="text-orange-600 dark:text-amber-500" />
                      <span className="text-[11px] font-extrabold text-orange-600 dark:text-amber-500 uppercase tracking-wider">
                        {lang === 'id' ? 'Kontrol Tambahan' : 'More Controls'}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setShowMoreMenu(false)} 
                      className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors p-1 cursor-pointer"
                    >
                      <X size={14}/>
                    </button>
                  </div>

                  {/* Section 1: Pemangkas & Loop (Trim & A-B Loop) */}
                  {(!showTrimmerOnBar || !showLoopOnBar || !showABRepeatOnBar) && (
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        {lang === 'id' ? 'Pemangkasan & Loop' : 'Trim & Loop'}
                      </span>
                      
                      {/* Toggle Trimmer */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsTrimMode(prev => !prev);
                          setShowMoreMenu(false);
                        }}
                        className={`flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          trimExportStatus === 'completed'
                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 border border-emerald-500/40'
                            : (isExportingTrim || trimExportStatus === 'exporting')
                            ? 'text-amber-600 dark:text-amber-400 bg-amber-500/20 border border-amber-500/40'
                            : isTrimMode
                            ? 'text-amber-600 dark:text-amber-400 bg-amber-500/20 border border-amber-500/40'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Scissors 
                            size={15} 
                            className={
                              trimExportStatus === 'completed'
                                ? 'text-emerald-500'
                                : (isExportingTrim || trimExportStatus === 'exporting')
                                ? 'text-amber-500 animate-bounce'
                                : isTrimMode 
                                ? 'text-amber-500' 
                                : 'text-zinc-400 dark:text-zinc-500'
                            } 
                          />
                          <span>{lang === 'id' ? 'Panel Pemangkas Video' : 'Video Trimmer Panel'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {trimExportStatus === 'completed' ? (
                            <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                              <Check size={10} strokeWidth={3} /> {lang === 'id' ? 'SELESAI' : 'DONE'}
                            </span>
                          ) : (isExportingTrim || trimExportStatus === 'exporting') ? (
                            <span className="text-[10px] bg-orange-500 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">
                              {lang === 'id' ? 'EKSPOR...' : 'EXPORTING...'}
                            </span>
                          ) : (
                            <>
                              <kbd className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-black/10 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 rounded border border-black/10 dark:border-white/10">Ctrl+T</kbd>
                              {isTrimMode && <span className="text-[10px] bg-amber-500 text-black px-1.5 py-0.5 rounded font-bold">AKTIF</span>}
                            </>
                          )}
                        </div>
                      </button>

                      {/* Loop A/B Controls */}
                      <div className="flex items-center gap-1 mt-1 pt-1 border-t border-black/5 dark:border-white/5">
                        <button
                          type="button"
                          onClick={() => { setRepeatA(); }}
                          className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded text-center transition-all cursor-pointer ${
                            repeatA !== null 
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' 
                              : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500'
                          }`}
                        >
                          [ SET A {repeatA !== null ? `(${formatTime(repeatA)})` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRepeatB(); }}
                          className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded text-center transition-all cursor-pointer ${
                            repeatB !== null 
                              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40' 
                              : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500'
                          }`}
                        >
                          SET B ] {repeatB !== null ? `(${formatTime(repeatB)})` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => { onToggleRepeatEnabled(); }}
                          className={`py-1.5 px-2.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                            repeatEnabled 
                              ? 'bg-orange-500 dark:bg-amber-500 text-black font-extrabold' 
                              : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300'
                          }`}
                          title={t('settingRepeat', lang)}
                        >
                          A/B
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            setShowLoopMenu(true);
                          }}
                          className="p-1.5 rounded bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 cursor-pointer"
                          title={t('savedLoopsTitle', lang)}
                        >
                          <List size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Section 2: Penanda (Markers) */}
                  {!showMarkerOnBar && (
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        {t('markerMenu', lang)}
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            handleAddMarker();
                            setShowMoreMenu(false);
                          }}
                          className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold rounded-lg bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors cursor-pointer"
                        >
                          <BookmarkPlus size={14} />
                          <span>{t('addMarker', lang)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMarkerList(true);
                            setShowMoreMenu(false);
                          }}
                          className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold rounded-lg bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors cursor-pointer"
                        >
                          <List size={14} />
                          <span>Marker ({markers.length})</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Section 3: Kecepatan Putar (Playback Speed) */}
                  {!showSpeedOnBar && (
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        {t('playbackSpeed', lang)}
                      </span>
                      <div className="flex items-center gap-1 overflow-x-auto py-0.5 custom-scrollbar">
                        {playbackRates.map((rate: number) => (
                          <button
                            type="button"
                            key={rate}
                            onClick={() => setSpeed(rate)}
                            className={`flex-1 min-w-[42px] py-1.5 text-xs font-bold rounded-md transition-all text-center cursor-pointer ${
                              playbackRate === rate
                                ? 'bg-orange-500 dark:bg-amber-500 text-black shadow-sm font-extrabold'
                                : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 4: Ukuran & Efek Layar Video */}
                  {(!showSizingOnBar || !showEnhanceOnBar || !showPiPOnBar) && (
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        {lang === 'id' ? 'Tampilan & Efek Video' : 'Video Display & Effects'}
                      </span>

                      {/* Video Sizing Row */}
                      {!showSizingOnBar && (
                        <div className="flex items-center justify-between gap-1 py-1">
                          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                            <Monitor size={14} className="text-zinc-400" />
                            {lang === 'id' ? 'Ukuran Layar' : 'Sizing'}:
                          </span>
                          <div className="flex items-center gap-1">
                            {([
                              { mode: 'contain', label: 'Fit' },
                              { mode: 'fill', label: 'Fill' },
                              { mode: 'fit-horizontal', label: 'W-Fit' },
                              { mode: 'original', label: '100%' }
                            ] as const).map((item) => (
                              <button
                                type="button"
                                key={item.mode}
                                onClick={() => onChangeVideoSizingMode(item.mode)}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-all cursor-pointer ${
                                  videoSizingMode === item.mode
                                    ? 'bg-orange-500 dark:bg-amber-500 text-black font-extrabold'
                                    : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500'
                                }`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PiP button */}
                      {!showPiPOnBar && (
                        <button
                          type="button"
                          onClick={() => {
                            onTogglePiP();
                            setShowMoreMenu(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            isPiP
                              ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10'
                              : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <PictureInPicture2 size={15} />
                            <span>Picture-in-Picture (PiP)</span>
                          </div>
                          {isPiP && <Check size={14} />}
                        </button>
                      )}

                      {/* Video Effects items */}
                      {!showEnhanceOnBar && (
                        <div className="flex flex-col gap-0.5 pt-1 border-t border-black/5 dark:border-white/5">
                          <button
                            type="button"
                            onClick={() => onToggleAmbientMode && onToggleAmbientMode()}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isAmbientMode ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300 hover:text-amber-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <SunMedium size={14} className={isAmbientMode ? 'text-amber-500' : 'text-zinc-400'} />
                              <span>{lang === 'id' ? 'Mode Ambient (Glow)' : 'Ambient Mode'}</span>
                            </div>
                            {isAmbientMode && <Check size={14} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleFrameInterpolation && onToggleFrameInterpolation()}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isFrameInterpolation ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300 hover:text-amber-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Layers size={14} className={isFrameInterpolation ? 'text-amber-500' : 'text-zinc-400'} />
                              <span>Interpolasi 60 FPS</span>
                            </div>
                            {isFrameInterpolation && <Check size={14} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleEnhance()}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isEnhance ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300 hover:text-amber-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className={isEnhance ? 'text-amber-500' : 'text-zinc-400'} />
                              <span>{t('settingEnhance', lang)}</span>
                            </div>
                            {isEnhance && <Check size={14} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleSuperRes()}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isSuperRes ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300 hover:text-amber-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Cpu size={14} className={isSuperRes ? 'text-amber-500' : 'text-zinc-400'} />
                              <span>Super Resolusi</span>
                            </div>
                            {isSuperRes && <Check size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 5: Audio & Pengulangan */}
                  {(!showAudioFlyoutOnBar || !showShuffleRepeatOnBar || !showStopOnBar || !showHomeOnBar) && (
                    <div className="flex flex-col gap-1 p-2 rounded-xl bg-black/5 dark:bg-white/5">
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                        {lang === 'id' ? 'Audio & Putar' : 'Audio & Playback'}
                      </span>

                      {/* Audio features */}
                      {!showAudioFlyoutOnBar && (
                        <>
                          <button
                            type="button"
                            onClick={() => onToggleAudioNormalize()}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isAudioNormalized ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300 hover:text-amber-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Activity size={14} className={isAudioNormalized ? 'text-amber-500' : 'text-zinc-400'} />
                              <span>{t('normalization', lang)}</span>
                            </div>
                            {isAudioNormalized && <Check size={14} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleSwapChannels()}
                            className={`flex items-center justify-between px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isSwapChannels ? 'text-amber-500' : 'text-zinc-700 dark:text-zinc-300 hover:text-amber-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <ArrowLeftRight size={14} className={isSwapChannels ? 'text-amber-500' : 'text-zinc-400'} />
                              <span>{t('swapStereoMenu', lang)}</span>
                            </div>
                            {isSwapChannels && <Check size={14} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onShowAudioSettings();
                              setShowMoreMenu(false);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:text-amber-500 transition-colors cursor-pointer"
                          >
                            <Sliders size={14} className="text-zinc-400" />
                            <span>{t('advancedAudioEq', lang)}</span>
                          </button>
                        </>
                      )}

                      {/* Shuffle & Repeat in More Menu */}
                      {!showShuffleRepeatOnBar && (
                        <div className="flex items-center gap-1 pt-1 border-t border-black/5 dark:border-white/5">
                          <button
                            type="button"
                            onClick={onToggleShuffle}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              isShuffle ? 'bg-amber-500/20 text-amber-500 font-extrabold' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <Shuffle size={14} />
                            <span>Acak</span>
                          </button>
                          <button
                            type="button"
                            onClick={onToggleRepeatMode}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              repeatMode !== 'none' ? 'bg-amber-500/20 text-amber-500 font-extrabold' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            {repeatMode === 'current' ? <Repeat1 size={14} /> : <Repeat size={14} />}
                            <span>{repeatMode === 'current' ? '1 Video' : repeatMode === 'playlist' ? 'Semua' : 'Ulangi'}</span>
                          </button>
                        </div>
                      )}

                      {/* Stop & Home actions if hidden from bar */}
                      {(!showStopOnBar || (!showHomeOnBar && onMinimize)) && (
                        <div className="flex items-center gap-1 pt-1 border-t border-black/5 dark:border-white/5">
                          {!showStopOnBar && (
                            <button
                              type="button"
                              onClick={() => {
                                stopPlayback();
                                setShowMoreMenu(false);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold rounded-lg bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-red-500 cursor-pointer"
                            >
                              <Square size={14} />
                              <span>Stop</span>
                            </button>
                          )}
                          {!showHomeOnBar && onMinimize && (
                            <button
                              type="button"
                              onClick={() => {
                                onMinimize();
                                setShowMoreMenu(false);
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold rounded-lg bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-amber-500 cursor-pointer"
                            >
                              <Home size={14} />
                              <span>{lang === 'id' ? 'Beranda' : 'Home'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fullscreen - always accessible */}
          <button 
            type="button"
            onClick={toggleFullscreen} 
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 transition-colors cursor-pointer shrink-0" 
            title={t('fullscreenTooltip', lang)}
          >
            {isFullscreen ? <Minimize size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Maximize size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>
        </div>
      </div>

      {showNewSubtitleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-[1px] pointer-events-none p-4">
          <motion.div 
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            className="w-full max-w-md bg-white dark:bg-[#111111] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 pointer-events-auto"
          >
            <div 
              onPointerDown={(e) => dragControls.start(e)}
              className="flex justify-between items-center border-b border-black/10 dark:border-white/10 pb-3 cursor-grab active:cursor-grabbing select-none"
              title={t('dragModalTooltip', lang)}
            >
              <h3 className="text-zinc-900 dark:text-zinc-100 font-bold text-xs sm:text-sm tracking-wide uppercase flex items-center gap-2 pointer-events-none">
                <GripHorizontal size={16} className="text-orange-500 dark:text-amber-500 animate-pulse" />
                <MessageSquare size={16} className="text-orange-600 dark:text-amber-500" />
                {t('addNewSubtitleHeader', lang)}
              </h3>
              <button
                onClick={() => setShowNewSubtitleModal(false)}
                className="text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 p-1.5 rounded-full transition-colors pointer-events-auto"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Kolom Teks */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
                  {lang === 'id' ? 'Kolom Teks' : 'Text Content'}
                </label>
                <textarea
                  value={newSubText}
                  onChange={(e) => setNewSubText(e.target.value)}
                  className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-sm p-3 rounded-xl border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none resize-none h-24 font-medium"
                  placeholder={t('typeSubtitlePlaceholder', lang)}
                />
              </div>

              {/* Start & End Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
                    {lang === 'id' ? 'Set Waktu Awal (detik)' : 'Set Start Time (seconds)'}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newSubStart}
                      onChange={(e) => setNewSubStart(e.target.value)}
                      className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs sm:text-sm p-2 sm:p-3 rounded-xl border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const playheadVal = typeof currentTime === 'number' ? parseFloat(currentTime.toFixed(2)) : 0;
                        setNewSubStart(playheadVal.toString());
                      }}
                      className="px-2 bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 rounded-xl border border-orange-500/30 dark:border-amber-500/30 transition-colors flex items-center justify-center font-bold text-[10px] shrink-0"
                      title={t('useCurrentTimeTooltip', lang)}
                    >
                      CUR
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
                    {lang === 'id' ? 'Set Waktu Akhir (detik)' : 'Set End Time (seconds)'}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newSubEnd}
                      onChange={(e) => setNewSubEnd(e.target.value)}
                      className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs sm:text-sm p-2 sm:p-3 rounded-xl border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const playheadVal = typeof currentTime === 'number' ? parseFloat(currentTime.toFixed(2)) : 0;
                        setNewSubEnd(playheadVal.toString());
                      }}
                      className="px-2 bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 rounded-xl border border-orange-500/30 dark:border-amber-500/30 transition-colors flex items-center justify-center font-bold text-[10px] shrink-0"
                      title={t('useCurrentTimeTooltip', lang)}
                    >
                      CUR
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-black/10 dark:border-white/10">
              <button
                onClick={() => setShowNewSubtitleModal(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                {t('cancel', lang)}
              </button>
              <button
                onClick={() => {
                  const startSecs = parseFloat(newSubStart);
                  const endSecs = parseFloat(newSubEnd);
                  if (isNaN(startSecs) || isNaN(endSecs) || startSecs < 0 || endSecs < 0) {
                    alert(t('errorPositiveTimes', lang));
                    return;
                  }
                  if (startSecs >= endSecs) {
                    alert(t('errorStartTimeLess', lang));
                    return;
                  }
                  if (!newSubText.trim()) {
                    alert(t('errorSubtitleTextRequired', lang));
                    return;
                  }

                  onAddNewSubtitleDirectly({
                    id: Math.random().toString(36).substr(2, 9),
                    start: startSecs,
                    end: endSecs,
                    text: newSubText.trim()
                  });
                  setShowNewSubtitleModal(false);
                }}
                className="bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-bold uppercase tracking-wider text-xs px-5 py-2.5 rounded-xl transition-colors shadow-lg shadow-orange-500/10 dark:shadow-amber-500/10"
              >
                {lang === 'id' ? 'Terapkan / Simpan Teks' : 'Apply / Save Text'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
