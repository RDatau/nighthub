import React, { useState, useEffect, useRef } from 'react';
import { Camera, Video, Link, Info, Settings, Subtitles, ListVideo, Database, Globe, MoreVertical, Clock, Rotate3D, Check, X, Keyboard, Sparkles, Eye, EyeOff } from 'lucide-react';

import { AppearanceSettings } from '../services/db';
import { t, Language } from '../services/i18n';

export const TopControls = ({
  onCaptureScreenshot,
  onToggleRecording,
  isRecording,
  recordingCountdown = null,
  isPlaying,
  currentVideoName,
  metadata,
  onShowNetworkModal,
  onShowAbout,
  onShowMemoryManager,
  onShowWebSniffer,
  onShowSubSettings,
  onShowShortcuts,
  showSubBrowser,
  onToggleSubBrowser,
  showPlaylist,
  onTogglePlaylist,
  is360Mode,
  onToggle360,
  projectionMode,
  onProjectionModeChange,
  stereoMode,
  onStereoModeChange,
  appearanceSettings,
  onMinimize,
  lang = 'id',
  activeDownloadsCount = 0,
  completedDownloadsCount = 0,
  onToggleAILive,
  showAILive = false,
  enableAIFeatures = true,
  onToggleControlsHidden,
  isControlsHidden = false
}: {
  onCaptureScreenshot: () => void;
  onToggleRecording: () => void;
  isRecording: boolean;
  recordingCountdown: number | null;
  isPlaying: boolean;
  currentVideoName: string;
  metadata?: any;
  onShowNetworkModal: () => void;
  onShowAbout: () => void;
  onShowMemoryManager: () => void;
  onShowWebSniffer: () => void;
  onShowSubSettings: () => void;
  onShowShortcuts: () => void;
  showSubBrowser: boolean;
  onToggleSubBrowser: () => void;
  showPlaylist: boolean;
  onTogglePlaylist: () => void;
  is360Mode: boolean;
  onToggle360: () => void;
  projectionMode: string;
  onProjectionModeChange: (mode: string) => void;
  stereoMode: string;
  onStereoModeChange: (mode: string) => void;
  appearanceSettings?: AppearanceSettings;
  onMinimize?: () => void;
  lang?: Language;
  activeDownloadsCount?: number;
  completedDownloadsCount?: number;
  onToggleAILive?: () => void;
  showAILive?: boolean;
  enableAIFeatures?: boolean;
  onToggleControlsHidden?: () => void;
  isControlsHidden?: boolean;
}) => {
  const [showTopMenu, setShowTopMenu] = useState(false);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const [show360Menu, setShow360Menu] = useState(false);
  const menu360Ref = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkOverflow = () => {
      if (titleContainerRef.current && titleContentRef.current) {
        setIsOverflowing(titleContentRef.current.scrollWidth > titleContainerRef.current.clientWidth);
      }
    };

    checkOverflow();
    
    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });
    
    if (titleContainerRef.current) resizeObserver.observe(titleContainerRef.current);
    if (titleContentRef.current) resizeObserver.observe(titleContentRef.current);

    return () => resizeObserver.disconnect();
  }, [currentVideoName, isPlaying]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (topMenuRef.current && !topMenuRef.current.contains(event.target as Node)) {
        setShowTopMenu(false);
      }
      if (menu360Ref.current && !menu360Ref.current.contains(event.target as Node)) {
        setShow360Menu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const blurValue = appearanceSettings?.blur ?? 10;
  const transparencyValue = appearanceSettings?.transparency ?? 0.5;
  const displayMode = appearanceSettings?.displayMode ?? 'default';
  const isCompact = displayMode === 'compact';

  const containerStyle = {
    backgroundColor: `rgba(var(--panel-bg-color), ${transparencyValue})`,
    backdropFilter: `blur(${blurValue}px)`,
    WebkitBackdropFilter: `blur(${blurValue}px)`,
  } as React.CSSProperties;

  return (
    <div onContextMenu={(e) => e.stopPropagation()} className="contents">
      {/* Floating Action Buttons (Left Side) */}
      <div className={`absolute ${isCompact ? 'left-0' : 'left-2 sm:left-6'} top-1/2 transform -translate-y-1/2 flex flex-col gap-2 sm:gap-4 pointer-events-auto`}>
        <button 
          onClick={onCaptureScreenshot}
          className={`w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 flex items-center justify-center transition-all duration-300 group ${isCompact ? 'rounded-r-xl border-y border-r border-black/10 dark:border-white/10' : 'rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-lg hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]'}`}
          style={containerStyle}
          title={t('captureScreenshotTooltip', lang)}
        >
          <Camera size={20} className="sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
        </button>

        {enableAIFeatures && (
          <button 
            onClick={onToggleAILive}
            className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-all duration-300 group ${isCompact ? 'rounded-r-xl border-y border-r border-black/10 dark:border-white/10' : 'rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-lg'} ${
              showAILive 
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.4)]' 
                : 'hover:bg-cyan-500/20 text-zinc-700 dark:text-zinc-300 hover:text-cyan-400'
            }`}
            style={!showAILive ? containerStyle : {}}
            title={lang === 'id' ? 'AI Live Discussion / Commentary' : 'AI Live Conversation'}
          >
            <Sparkles size={20} className={`sm:w-6 sm:h-6 ${showAILive ? 'animate-pulse text-cyan-400' : 'group-hover:scale-110'} transition-transform`} />
          </button>
        )}
        
        <button 
          onClick={onToggleRecording}
          className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-all duration-300 group ${isCompact ? 'rounded-r-xl border-y border-r border-black/10 dark:border-white/10' : 'rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-lg'} ${
            isRecording 
              ? 'bg-rose-500/20 text-rose-500 border-rose-500/50 shadow-[0_0_20px_rgba(243,24,38,0.4)] animate-pulse' 
              : recordingCountdown !== null
                ? 'bg-orange-500/20 dark:bg-amber-500/20 text-orange-600 dark:text-amber-500 border-orange-500/50 dark:border-amber-500/50 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]'
                : `hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 ${!isCompact ? 'hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]' : ''}`
          }`}
          style={!isRecording && recordingCountdown === null ? containerStyle : {}}
          title={isRecording ? t('stopRecordingTooltip', lang) : recordingCountdown !== null ? t('startingInTooltip', lang, { countdown: recordingCountdown }) : t('recordVideoTooltip', lang)}
        >
          {recordingCountdown !== null ? (
            <span className="text-base sm:text-lg font-bold">{recordingCountdown}</span>
          ) : (
            <Video size={20} className={`sm:w-6 sm:h-6 ${isRecording ? '' : 'group-hover:scale-110'} transition-transform`} />
          )}
        </button>

        {onToggleControlsHidden && (
          <button 
            onClick={onToggleControlsHidden}
            className={`w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 flex items-center justify-center transition-all duration-300 group ${isCompact ? 'rounded-r-xl border-y border-r border-black/10 dark:border-white/10' : 'rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-lg'}`}
            style={containerStyle}
            title={lang === 'id' ? 'Sembunyikan Semua Kontrol' : 'Hide All Controls'}
          >
            <EyeOff size={20} className="sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
          </button>
        )}
      </div>

      {/* Floating Action Buttons (Right Side) */}
      <div className={`absolute ${isCompact ? 'right-0' : 'right-2 sm:right-6'} top-1/2 transform -translate-y-1/2 flex flex-col gap-2 sm:gap-4 pointer-events-auto`}>
        <button 
          onClick={onShowWebSniffer}
          className={`w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 flex items-center justify-center transition-all duration-300 group relative ${isCompact ? 'rounded-l-xl border-y border-l border-black/10 dark:border-white/10' : 'rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-lg hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]'}`}
          style={containerStyle}
          title={t('videoSnifferTooltip', lang)}
        >
          <Globe size={20} className="sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
          
          {/* Download Badge */}
          {(activeDownloadsCount > 0 || completedDownloadsCount > 0) && (
            <span className={`absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] border border-white/10 transition-colors duration-300 ${
              activeDownloadsCount > 0 
                ? 'bg-orange-500 animate-pulse' 
                : 'bg-emerald-500'
            }`}>
              {activeDownloadsCount > 0 ? activeDownloadsCount : completedDownloadsCount}
            </span>
          )}
        </button>
        
        <button 
          onClick={onShowNetworkModal}
          className={`w-10 h-10 sm:w-12 sm:h-12 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 flex items-center justify-center transition-all duration-300 group ${isCompact ? 'rounded-l-xl border-y border-l border-black/10 dark:border-white/10' : 'rounded-xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-lg hover:shadow-[rgba(249,115,22,)] dark:hover:shadow-[rgba(245,158,11,)]'}`}
          style={containerStyle}
          title={t('openStreamUrlTooltip', lang)}
        >
          <Link size={20} className="sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
        </button>
      </div>

      {/* Top Bar */}
      <div 
        className={`absolute z-50 ${isCompact ? 'top-0 left-0 right-0 w-full border-b py-1 px-2 sm:py-1.5 sm:px-4' : 'top-4 sm:top-6 left-1/2 transform -translate-x-1/2 w-[95%] max-w-6xl border shadow-[0_8px_32px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.8)] rounded-2xl p-2 sm:p-2.5 px-3 sm:px-4'} border-black/10 dark:border-white/5 flex justify-between items-center pointer-events-auto`}
        style={containerStyle}
      >
        <div className="flex items-center gap-2 sm:gap-4 w-auto shrink-0 pl-1 sm:pl-2">
          <button 
            onClick={onMinimize}
            className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white drop-shadow-lg flex items-center gap-1 sm:gap-2 hover:opacity-85 cursor-pointer active:scale-95 transition-all focus:outline-none"
            title={lang === 'id' ? 'Kembali ke Beranda' : 'Back to Home'}
          >
            NIGHT<span className="bg-orange-500 dark:bg-amber-500 text-black px-1.5 sm:px-2 py-0.5 rounded-md text-[10px] sm:text-sm">HUB</span>
          </button>
        </div>

        {/* Title */}
        <div 
          ref={titleContainerRef}
          className={`flex-1 relative overflow-hidden flex items-center min-w-0 ${isOverflowing ? 'marquee-mask marquee-container' : 'justify-center'}`}
        >
          <div 
            ref={titleContentRef}
            className={`${isOverflowing ? 'animate-pingpong' : ''} flex items-center gap-2 sm:gap-3 w-max shrink-0`}
            style={{ '--scroll-duration': `${Math.max(8, currentVideoName.length * 0.2)}s` } as React.CSSProperties}
          >
            <div className="text-[10px] sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap flex items-center gap-2">
              {metadata?.title ? (
                <>
                  <span className="font-bold">{metadata.title}</span>
                  {metadata.artist ? <span className="text-zinc-500 dark:text-zinc-400">- {metadata.artist}</span> : (metadata.artists ? <span className="text-zinc-500 dark:text-zinc-400">- {metadata.artists.join(', ')}</span> : null)}
                  {metadata.album && <span className="text-zinc-500 dark:text-zinc-400">({metadata.album})</span>}
                </>
              ) : (
                currentVideoName
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-1 sm:gap-1.5 w-auto justify-end shrink-0">
          <button onClick={onShowMemoryManager} className="hidden sm:flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none" title={t('memoryManagerHeader', lang)}>
            <Database size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <button onClick={onShowShortcuts} className="hidden sm:flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none" title={t('keyboardShortcutsTitle', lang)}>
            <Keyboard size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <button onClick={onShowAbout} className="hidden md:flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none" title={t('aboutAppTooltip', lang)}>
            <Info size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          <button onClick={onShowSubSettings} className="hidden sm:flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none" title={t('settings', lang)}>
            <Settings size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
          
          <div className="sm:hidden relative" ref={topMenuRef}>
            <button 
              onClick={() => setShowTopMenu(!showTopMenu)} 
              className="bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 p-1.5 rounded-xl transition-all cursor-pointer focus:outline-none"
            >
              <MoreVertical size={16} />
            </button>
            {showTopMenu && (
              <div className="absolute top-full mt-2 right-0 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 min-w-[160px]" style={containerStyle}>
                <button onClick={() => { onShowMemoryManager(); setShowTopMenu(false); }} className="flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors">
                  <Database size={16} /> <span>{t('memoryManagerHeader', lang)}</span>
                </button>
                <button onClick={() => { onShowShortcuts(); setShowTopMenu(false); }} className="flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors">
                  <Keyboard size={16} /> <span>{t('keyboardShortcutsTitle', lang)}</span>
                </button>
                <button onClick={() => { onShowSubSettings(); setShowTopMenu(false); }} className="flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors">
                  <Settings size={16} /> <span>{t('settings', lang)}</span>
                </button>
                <button onClick={() => { onToggleSubBrowser(); setShowTopMenu(false); }} className={`flex items-center gap-3 px-4 py-3 text-xs font-bold transition-colors ${showSubBrowser ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}>
                  <Subtitles size={16} /> <span>{t('subtitleBrowserHeader', lang)}</span>
                </button>
                <button onClick={() => { onShowAbout(); setShowTopMenu(false); }} className="flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500 transition-colors border-t border-black/10 dark:border-white/10">
                  <Info size={16} /> <span>{t('aboutAppTooltip', lang)}</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={menu360Ref}>
            <button 
              onClick={() => setShow360Menu(!show360Menu)} 
              className={`flex items-center justify-center p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none ${is360Mode ? 'text-orange-600 dark:text-amber-500 bg-orange-500/20 dark:bg-amber-500/20 shadow-sm' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`} 
              title={t('menu3dTooltip', lang)}
            >
              <Rotate3D size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
            {show360Menu && (
              <div className="absolute top-full mt-2 right-0 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 min-w-[280px] bg-white dark:bg-[#111111] p-1.5 gap-1">
                <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 flex justify-between items-center rounded-lg mb-1">
                  <span className="text-[10px] font-bold text-orange-600 dark:text-amber-500 uppercase tracking-wider">{lang === 'id' ? 'Menu Video 360°' : '360° Video Menu'}</span>
                  <button onClick={() => setShow360Menu(false)} className="text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"><X size={12}/></button>
                </div>
                
                <div 
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 transition-all rounded-lg cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); onToggle360(); }}
                >
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{lang === 'id' ? 'Aktifkan Mode 360°' : 'Enable 360° Mode'}</span>
                  <div className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${is360Mode ? 'bg-orange-500 dark:bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${is360Mode ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </div>
                
                <div className="h-px bg-black/10 dark:bg-white/10 my-1 mx-1"></div>
                
                <button 
                  onClick={() => { onProjectionModeChange('Auto select'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${projectionMode === 'Auto select' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Auto select</span>
                  {projectionMode === 'Auto select' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onProjectionModeChange('Equirectangular'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${projectionMode === 'Equirectangular' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Equirectangular</span>
                  {projectionMode === 'Equirectangular' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onProjectionModeChange('Dual Fisheye'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${projectionMode === 'Dual Fisheye' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Dual Fisheye</span>
                  {projectionMode === 'Dual Fisheye' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onProjectionModeChange('Cubemap'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${projectionMode === 'Cubemap' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Cubemap</span>
                  {projectionMode === 'Cubemap' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onProjectionModeChange('Equi-Angular Cubemap 3x2 (Mono 2D)'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${projectionMode === 'Equi-Angular Cubemap 3x2 (Mono 2D)' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Equi-Angular Cubemap 3x2 (Mono 2D)</span>
                  {projectionMode === 'Equi-Angular Cubemap 3x2 (Mono 2D)' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onProjectionModeChange('Equi-Angular Cubemap 2x3 (Stereo 3D)'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${projectionMode === 'Equi-Angular Cubemap 2x3 (Stereo 3D)' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Equi-Angular Cubemap 2x3 (Stereo 3D)</span>
                  {projectionMode === 'Equi-Angular Cubemap 2x3 (Stereo 3D)' && <Check size={14} />}
                </button>

                <div className="h-px bg-black/10 dark:bg-white/10 my-1 mx-1"></div>
                <div className="px-3 py-1.5 text-[9px] font-extrabold text-orange-600 dark:text-amber-500 uppercase tracking-widest border-b border-black/5 dark:border-white/5 mb-1">Stereo Mode</div>
                
                <button 
                  onClick={() => { onStereoModeChange('2D'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${stereoMode === '2D' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>2D (Mono)</span>
                  {stereoMode === '2D' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onStereoModeChange('Side-by-Side'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${stereoMode === 'Side-by-Side' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Side-by-Side (SbS)</span>
                  {stereoMode === 'Side-by-Side' && <Check size={14} />}
                </button>
                <button 
                  onClick={() => { onStereoModeChange('Top-Bottom'); setShow360Menu(false); }} 
                  className={`flex items-center justify-between px-3 py-2 text-xs font-bold transition-all rounded-lg ${stereoMode === 'Top-Bottom' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10' : 'text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 hover:text-orange-600 dark:hover:text-amber-500'}`}
                >
                  <span>Top-Bottom (TB)</span>
                  {stereoMode === 'Top-Bottom' && <Check size={14} />}
                </button>
              </div>
            )}
          </div>

          <button onClick={onToggleSubBrowser} className={`hidden sm:flex items-center justify-center p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none ${showSubBrowser ? 'text-orange-600 dark:text-amber-500 bg-orange-500/20 dark:bg-amber-500/20 shadow-sm' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} title={t('subtitleBrowserHeader', lang)}>
            <Subtitles size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>

          <button onClick={onTogglePlaylist} className={`flex items-center justify-center p-1.5 sm:p-2 rounded-xl transition-all cursor-pointer focus:outline-none ${showPlaylist ? 'text-orange-600 dark:text-amber-500 bg-orange-500/20 dark:bg-amber-500/20 shadow-sm' : 'bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} title={t('personalCollection', lang)}>
            <ListVideo size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
};