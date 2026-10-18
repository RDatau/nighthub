import React, { useState, useEffect, useRef } from 'react';
import { 
  Undo, Redo, Scissors, Copy, Clipboard, Trash2, Check,
  Play, Pause, Repeat, Settings, VolumeX, Volume2, Maximize, ExternalLink, Download, Image,
  Search, ArrowLeft, ArrowRight, RefreshCw, Printer, Code
} from 'lucide-react';
import { useOverlayTheme } from '../hooks/useOverlayTheme';

interface WebContextMenuItem {
  id: string;
  label: string;
  type?: 'separator' | 'checkbox' | 'normal';
  checked?: boolean;
  enabled?: boolean;
  iconName?: string;
}

// Icon mapping dictionary
const iconMap: Record<string, React.ComponentType<any>> = {
  undo: Undo,
  redo: Redo,
  cut: Scissors,
  copy: Copy,
  paste: Clipboard,
  delete: Trash2,
  selectAll: Check,
  play: Play,
  pause: Pause,
  loop: Repeat,
  controls: Settings,
  mute: VolumeX,
  unmute: Volume2,
  pip: Maximize,
  openInNewTab: ExternalLink,
  copyLink: Copy,
  saveAs: Download,
  copyFrame: Image,
  saveFrame: Download,
  search: Search,
  back: ArrowLeft,
  forward: ArrowRight,
  reload: RefreshCw,
  print: Printer,
  inspect: Code,
};

export const WebContextMenu: React.FC = () => {
  useOverlayTheme();
  const [items, setItems] = useState<WebContextMenuItem[]>([]);
  const [acrylicEnabled, setAcrylicEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inject style to disable scrollbars and handle transparency correctly
    const style = document.createElement('style');
    style.innerHTML = `
      html, body {
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        background: transparent !important;
      }
    `;
    document.head.appendChild(style);

    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.on('show-web-context-menu-data', (_event: any, data: { items: WebContextMenuItem[] }) => {
        if (data && data.items) {
          setItems(data.items);
        }
      });

      // Request initial items if available
      ipc.invoke('request-web-context-menu-data').then((data: any) => {
        if (data && data.items) {
          setItems(data.items);
        }
      }).catch((err: any) => {
        console.error('Failed to request web context menu data:', err);
      });

      // Query acrylic background setting
      ipc.invoke('get-acrylic-enabled').then((enabled: boolean) => {
        setAcrylicEnabled(enabled);
      }).catch(() => {});
    }

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Communicate height and width updates for resizing
  useEffect(() => {
    if (items.length > 0 && containerRef.current) {
      const observer = new ResizeObserver(() => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = Math.ceil(rect?.width || containerRef.current?.offsetWidth || 200);
        const height = Math.ceil(rect?.height || containerRef.current?.offsetHeight || 250);
        // @ts-ignore
        const ipc = window.require ? window.require('electron').ipcRenderer : null;
        if (ipc && width > 0 && height > 0) {
          ipc.send('resize-web-context-menu', { width, height });
        }
      });
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, [items]);

  const handleItemClick = (id: string, enabled?: boolean) => {
    if (enabled === false) return;
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.send('web-context-menu-click', id);
    }
  };

  if (items.length === 0) return null;

  return (
    <div 
      ref={containerRef} 
      className="h-fit w-fit bg-transparent select-none overflow-hidden flex flex-col font-sans"
    >
      <div 
        id="web-context-menu-container"
        className={`flex flex-col gap-0.5 p-1.5 border border-black/20 dark:border-white/10 shadow-xl overflow-hidden h-fit w-max min-w-[280px] max-w-[380px] ${
          acrylicEnabled 
            ? 'bg-white/60 dark:bg-[#1c1c1b]/60 backdrop-blur-md' 
            : 'bg-white dark:bg-[#1c1c1b] rounded-xl'
        }`}
      >
        {items.map((item, index) => {
          if (item.type === 'separator') {
            return (
              <div 
                key={`sep-${index}`} 
                className="h-[1px] bg-black/5 dark:bg-white/5 my-0.5 mx-1" 
              />
            );
          }

          const IconComponent = item.iconName ? iconMap[item.iconName] : null;
          const isEnabled = item.enabled !== false;

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id, item.enabled)}
              disabled={!isEnabled}
              className={`
                flex items-center justify-between w-full px-3 py-1.5 rounded-lg transition-all duration-150 group text-left border-0 bg-transparent cursor-pointer
                ${isEnabled 
                  ? 'text-zinc-800 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.98]' 
                  : 'text-zinc-500 dark:text-zinc-600 cursor-not-allowed opacity-50'}
              `}
            >
              <div className="flex items-center gap-3 min-w-0">
                {IconComponent ? (
                  <IconComponent 
                    size={14} 
                    className={`shrink-0 ${isEnabled ? 'text-zinc-800 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-white' : ''}`} 
                  />
                ) : (
                  <div className="w-3.5 h-3.5 shrink-0" />
                )}
                <span className="text-[13px] font-medium truncate">
                  {item.label}
                </span>
              </div>

              {item.type === 'checkbox' && (
                <div className="flex items-center justify-center shrink-0 w-3.5 h-3.5">
                  {item.checked && (
                    <Check 
                      size={12} 
                      className="text-black dark:text-zinc-100 font-bold" 
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
