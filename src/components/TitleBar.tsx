import React from 'react';
import { Globe, Video, X, Plus, Volume2, VolumeX, Leaf, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useElectron } from '../hooks/useElectron';
import { t } from '../services/i18n';

const nighthubFavicon = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjNDUxYTAzIiAvPgogICAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiM3YzJkMTIiIC8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGZpbHRlciBpZD0iZ2xvdyIgeD0iLTIwJSIgeT0iLTIwJSIgd2lkdGg9IjE0MCUiIGhlaWdodD0iMTQwJSI+CiAgICAgIDxmZUdhdXNzaWFuQmx1ciBzdGREZXZpYXRpb249IjIwIiByZXN1bHQ9ImJsdXIiIC8+CiAgICAgIDxmZUNvbXBvc2l0ZSBpbj0iU291cmNlR3JhcGhpYyIgaW4yPSJibHVyIiBvcGVyYXRvcj0ib3ZlciIgLz4KICAgIDwvZmlsdGVyPgogIDwvZGVmcz4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9IjEyOCIgZmlsbD0idXJsKCNiZykiIC8+CiAgPGNpcmNsZSBjeD0iMjU2IiBjeT0iMjU2IiByPSIxNjAiIGZpbGw9IiMwNTAwMDIiIHN0cm9rZT0iI2Y1OWUwYiIgc3Ryb2tlLXdpZHRoPSI4IiBmaWx0ZXI9InVybCgjZ2xvdykiIC8+CiAgPHBhdGggZD0iTTIxNiAxNzYgTDM0NCAyNTYgTDIxNiAzMzYgWiIgZmlsbD0iI2ZiYmYyNCIgZmlsdGVyPSJ1cmwoI2dsb3cpIiAvPgo8L3N2Zz4K";

export interface TabData {
  id: string;
  title: string;
  url: string;
  favicon?: string | null;
  isPlaying?: boolean;
  isMuted?: boolean;
  isSleeping?: boolean;
  isLoading?: boolean;
}

interface TitleBarProps {
  isSnifferOpen: boolean;
  tabs?: TabData[];
  activeTabId?: string;
  onTabClick?: (id: string) => void;
  onTabClose?: (id: string, e: React.MouseEvent) => void;
  onTabAdd?: () => void;
  onTabMuteToggle?: (id: string, e: React.MouseEvent) => void;
  onTabContextMenu?: (id: string, isActive: boolean) => void;
  onTitleBarContextMenu?: () => void;
  onTabReorder?: (draggedId: string, targetId: string) => void;
  tabPreviews?: Record<string, string>;
  lang?: 'id' | 'en';
}

export const TitleBar: React.FC<TitleBarProps> = ({ 
  isSnifferOpen, 
  tabs = [], 
  activeTabId, 
  onTabClick, 
  onTabClose, 
  onTabAdd,
  onTabMuteToggle,
  onTabContextMenu,
  onTitleBarContextMenu,
  onTabReorder,
  tabPreviews = {},
  lang = 'id'
}) => {
  const [draggedTabId, setDraggedTabId] = React.useState<string | null>(null);
  const [hoveredTab, setHoveredTab] = React.useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const dragSwitchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastTargetTabIdRef = React.useRef<string | null>(null);
  const titleBarRef = React.useRef<HTMLDivElement>(null);
  const { isElectron, getIpcRenderer } = useElectron();
  const [failedFavicons, setFailedFavicons] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    return () => {
      if (dragSwitchTimeoutRef.current) {
        clearTimeout(dragSwitchTimeoutRef.current);
      }
    };
  }, []);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTabId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
    if (dragSwitchTimeoutRef.current) {
      clearTimeout(dragSwitchTimeoutRef.current);
      dragSwitchTimeoutRef.current = null;
    }
    lastTargetTabIdRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, id?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = draggedTabId ? 'move' : 'copy';

    // When dragging external files or items across tabs, switch active tab when hovering over it
    if (id && id !== activeTabId && !draggedTabId) {
      if (!dragSwitchTimeoutRef.current && lastTargetTabIdRef.current !== id) {
        lastTargetTabIdRef.current = id;
        dragSwitchTimeoutRef.current = setTimeout(() => {
          onTabClick?.(id);
          dragSwitchTimeoutRef.current = null;
        }, 180);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (draggedTabId && draggedTabId !== id) {
      onTabReorder?.(draggedTabId, id);
      return;
    }

    // Dismiss tab preview tooltip when dragging
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredTab(null);
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('hide-tab-preview');
    }

    // Trigger tab switch when dragging over any inactive tab
    if (id !== activeTabId && !draggedTabId) {
      if (lastTargetTabIdRef.current !== id) {
        lastTargetTabIdRef.current = id;
        if (dragSwitchTimeoutRef.current) {
          clearTimeout(dragSwitchTimeoutRef.current);
        }
        dragSwitchTimeoutRef.current = setTimeout(() => {
          onTabClick?.(id);
          dragSwitchTimeoutRef.current = null;
        }, 180);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent, id: string) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (!relatedTarget || !(e.currentTarget as Node).contains(relatedTarget)) {
      if (lastTargetTabIdRef.current === id) {
        if (dragSwitchTimeoutRef.current) {
          clearTimeout(dragSwitchTimeoutRef.current);
          dragSwitchTimeoutRef.current = null;
        }
        lastTargetTabIdRef.current = null;
      }
    }
  };

  const handleDrop = (e: React.DragEvent, id: string) => {
    if (dragSwitchTimeoutRef.current) {
      clearTimeout(dragSwitchTimeoutRef.current);
      dragSwitchTimeoutRef.current = null;
    }
    lastTargetTabIdRef.current = null;
    if (id !== activeTabId) {
      onTabClick?.(id);
    }
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, tabId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    const triggerPreview = () => {
      setHoveredTab({ id: tabId, rect });
      const ipc = getIpcRenderer();
      if (ipc) {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
          ipc.send('show-tab-preview', {
            tabId,
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            title: tab.title,
            url: tab.url,
            isSleeping: tab.isSleeping,
            favicon: tab.favicon,
            preview: tabPreviews[tabId] || null,
            lang
          });
        }
      }
    };

    if (hoveredTab) {
      triggerPreview();
    } else {
      hoverTimeoutRef.current = setTimeout(() => {
        triggerPreview();
      }, 400);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredTab(null);
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('hide-tab-preview');
    }
  };

  const getPopoverStyle = () => {
    if (!hoveredTab || !titleBarRef.current) return {};
    const titleBarRect = titleBarRef.current.getBoundingClientRect();
    const tabRect = hoveredTab.rect;
    
    const popoverWidth = 280;
    let left = tabRect.left - titleBarRect.left + (tabRect.width / 2) - (popoverWidth / 2);
    
    left = Math.max(8, left);
    const maxLeft = titleBarRect.width - popoverWidth - 8;
    left = Math.min(left, maxLeft);
    
    return {
      position: 'absolute' as const,
      top: '44px',
      left: `${left}px`,
      width: `${popoverWidth}px`,
    };
  };

  const getDisplayDomain = (url: string) => {
    if (!url) return 'New Tab';
    if (url.startsWith('nighthub://')) {
      return url.replace('nighthub://', 'NightHUB // ');
    }
    try {
      const u = new URL(url);
      return u.hostname;
    } catch (e) {
      return url;
    }
  };

  const isLastTabActive = tabs && tabs.length > 0 && activeTabId === tabs[tabs.length - 1].id;

  return (
    <div 
      ref={titleBarRef}
      className="flex-none h-10 flex items-center z-[9999] titlebar-drag bg-transparent select-none w-full relative"
      onContextMenu={onTitleBarContextMenu}
    >
      {/* Spacer for left padding */}
      <div className="w-4 flex-none"></div>
      
      {/* Icon and Title / Tabs */}
      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 text-xs font-medium h-full flex-1 overflow-hidden">
        {isSnifferOpen ? (
          <>
            <Globe size={14} className="text-orange-600 dark:text-amber-500 flex-none" />
            
            {/* Tab System */}
            <div className="ml-1 flex items-end h-full pt-[5px] gap-0.5 flex-1 overflow-x-auto overflow-y-hidden scrollbar-none px-[5px]">
              {tabs.map(tab => (
                <div 
                  key={tab.id}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, tab.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, tab.id)}
                  onDragEnter={(e) => handleDragEnter(e, tab.id)}
                  onDragLeave={(e) => handleDragLeave(e, tab.id)}
                  onDrop={(e) => handleDrop(e, tab.id)}
                  onMouseEnter={(e) => handleMouseEnter(e, tab.id)}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => {
                    handleMouseLeave();
                    onTabClick?.(tab.id);
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault(); // Prevent middle-click scroll-compass on Windows
                    }
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (tabs.length > 1) {
                        handleMouseLeave();
                        onTabClose?.(tab.id, e as any);
                      }
                    }
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    onTabContextMenu?.(tab.id, activeTabId === tab.id);
                  }}
                  onDoubleClick={(e) => {
                    if (tabs.length > 1) {
                      handleMouseLeave();
                      onTabClose?.(tab.id, e);
                    }
                  }}
                  className={`px-3 h-full rounded-t-lg flex items-center gap-2 cursor-pointer transition-colors flex-1 min-w-[120px] max-w-[240px] group border-transparent titlebar-nodrag relative -mb-[1.5px] ${
                    draggedTabId === tab.id
                      ? 'bg-zinc-100/50 dark:bg-zinc-800/50 opacity-40 border-dashed border-zinc-300 dark:border-zinc-700 scale-95 overflow-hidden'
                      : activeTabId === tab.id 
                        ? 'bg-white/60 dark:bg-zinc-700/40 backdrop-blur-md text-zinc-900 dark:text-white border-transparent overflow-visible z-10' 
                        : 'bg-transparent text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 overflow-hidden'
                  }`}
                >
                  {activeTabId === tab.id && (
                    <>
                      {/* Left Corner Curve with matching fill and border */}
                      <div className="absolute left-[-10px] bottom-0 w-[10px] h-[10px] pointer-events-none select-none z-10">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path 
                            d="M0 10 A 10 10 0 0 0 10 0 L 10 10 Z" 
                            className="fill-white/60 dark:fill-zinc-700/40" 
                          />
                        </svg>
                      </div>

                      {/* Right Corner Curve with matching fill and border */}
                      <div className="absolute right-[-10px] bottom-0 w-[10px] h-[10px] pointer-events-none select-none z-10">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path 
                            d="M0 0 A 10 10 0 0 0 10 10 L 0 10 Z" 
                            className="fill-white/60 dark:fill-zinc-700/40" 
                          />
                        </svg>
                      </div>
                    </>
                  )}
                  {tab.isLoading ? (
                    <Loader2 size={13} className="text-orange-600 dark:text-amber-500 animate-spin flex-none" />
                  ) : (tab.favicon && !failedFavicons[tab.favicon]) ? (
                    <img 
                      src={tab.favicon} 
                      alt="" 
                      onError={() => {
                        if (tab.favicon) {
                          setFailedFavicons(prev => ({ ...prev, [tab.favicon!]: true }));
                        }
                      }}
                      className={`w-3.5 h-3.5 rounded-sm flex-none ${tab.isSleeping && activeTabId !== tab.id ? 'opacity-40 grayscale-[50%]' : ''}`} 
                    />
                  ) : (
                    <Globe size={14} className={`flex-none ${tab.isSleeping && activeTabId !== tab.id ? 'opacity-30' : 'opacity-50'}`} />
                  )}
                  <span 
                    className={`text-[11px] flex-1 text-left min-w-0 whitespace-nowrap overflow-hidden ${tab.isSleeping && activeTabId !== tab.id ? 'opacity-50' : ''}`}
                    style={{
                      maskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 24px), rgba(0,0,0,0) 100%)',
                      WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) calc(100% - 24px), rgba(0,0,0,0) 100%)'
                    }}
                  >
                    {tab.title || 'New Tab'}
                  </span>
                  
                  <div className="flex items-center gap-0.5 flex-none ml-auto">
                    {(tab.isPlaying || tab.isMuted) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onTabMuteToggle?.(tab.id, e); }}
                        className="p-0.5 hover:bg-black/20 dark:hover:bg-white/20 rounded-full opacity-70 hover:opacity-100 transition-opacity flex-none"
                        title={tab.isMuted ? (lang === 'id' ? 'Bunyikan tab' : 'Unmute tab') : (lang === 'id' ? 'Bisukan tab' : 'Mute tab')}
                      >
                        {tab.isMuted ? <VolumeX size={12} className="text-red-400" /> : <Volume2 size={12} className="text-amber-400" />}
                      </button>
                    )}
                    {tabs.length > 1 && (
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          handleMouseLeave();
                          onTabClose?.(tab.id, e); 
                        }}
                        className={`p-0.5 hover:bg-black/20 dark:hover:bg-white/20 rounded-full transition-opacity flex-none ${
                          activeTabId === tab.id ? 'opacity-80 hover:opacity-100' : 'opacity-40 group-hover:opacity-70 hover:!opacity-100'
                        }`}
                        title={lang === 'id' ? 'Tutup tab' : 'Close tab'}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button 
                onClick={() => onTabAdd?.()}
                className="flex-none w-7 h-7 flex items-center justify-center rounded-[6px] ml-[4px] mb-[4px] text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all duration-150 titlebar-nodrag"
                title={lang === 'id' ? 'Tab Baru (Ctrl+T)' : 'New Tab (Ctrl+T)'}
              >
                <Plus size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <img src={nighthubFavicon} className="w-5 h-5 object-contain rounded-sm" />
            <span>NightHUB Player</span>
          </>
        )}
      </div>

      {/* Spacer for right window controls (Minimize, Maximize, Close) provided by titleBarOverlay */}
      <div className="ml-auto w-[140px] h-full titlebar-nodrag flex-none"></div>

      {/* Hover Preview Popover */}
      <AnimatePresence>
        {!isElectron && hoveredTab && (() => {
          const tab = tabs.find(t => t.id === hoveredTab.id);
          if (!tab) return null;
          const preview = tabPreviews[tab.id];
          const displayDomain = getDisplayDomain(tab.url);
          const style = getPopoverStyle();
          
          return (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 5, scale: 0.98 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={style}
              className="z-[99999] rounded-xl overflow-hidden bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border border-black/10 dark:border-white/10 shadow-2xl flex flex-col pointer-events-none"
            >
              {/* Thumbnail Container */}
              <div className="w-full aspect-[1.6/1] bg-zinc-100 dark:bg-zinc-800/80 relative overflow-hidden flex items-center justify-center border-b border-black/5 dark:border-white/5">
                {preview ? (
                  <img 
                    src={preview} 
                    alt="" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // Stunning custom placeholder
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-[#222] dark:to-[#1a1a1a] relative">
                    <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]"></div>
                     {(tab.favicon && !failedFavicons[tab.favicon]) ? (
                      <img 
                        src={tab.favicon} 
                        alt="" 
                        onError={() => {
                          if (tab.favicon) {
                            setFailedFavicons(prev => ({ ...prev, [tab.favicon!]: true }));
                          }
                        }}
                        className="w-10 h-10 rounded-lg shadow-md animate-pulse object-contain" 
                      />
                    ) : (
                      <Globe size={32} className="text-zinc-400 dark:text-zinc-600 animate-pulse" />
                    )}
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600 font-mono mt-2 tracking-wider">
                      {t('tabPreviewNoPreview', lang)}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Tab Details */}
              <div className="p-3 flex flex-col gap-1 text-left">
                <div className="flex items-center gap-1.5">
                  {(tab.favicon && !failedFavicons[tab.favicon]) ? (
                    <img 
                      src={tab.favicon} 
                      alt="" 
                      onError={() => {
                        if (tab.favicon) {
                          setFailedFavicons(prev => ({ ...prev, [tab.favicon!]: true }));
                        }
                      }}
                      className="w-3.5 h-3.5 rounded-sm flex-none" 
                    />
                  ) : (
                    <Globe size={14} className="text-zinc-400 dark:text-zinc-600 flex-none" />
                  )}
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate flex-1 leading-snug">
                    {tab.title || 'New Tab'}
                  </span>
                </div>
                
                <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 truncate pl-5">
                  {displayDomain}
                </span>
                
                {tab.isSleeping && (
                  <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/5 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <Leaf size={12} className="flex-none" />
                    <span className="text-[10px] font-medium leading-none">
                      {t('tabPreviewSleepingSaveResources', lang)}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

