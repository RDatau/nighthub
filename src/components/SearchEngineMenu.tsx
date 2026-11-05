import React, { useState, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { t, Language } from '../services/i18n';
import { useOverlayTheme } from '../hooks/useOverlayTheme';

const engines = [
  { id: 'google', name: 'Google', icon: 'https://www.google.com/favicon.ico' },
  { id: 'bing', name: 'Bing', icon: 'https://www.bing.com/favicon.ico' },
  { id: 'duckduckgo', name: 'DuckDuckGo', icon: 'https://www.google.com/s2/favicons?domain=duckduckgo.com&sz=64' },
];

export function SearchEngineMenu() {
  useOverlayTheme();
  const [currentEngine, setCurrentEngine] = useState('google');
  const [lang, setLang] = useState<Language>('id');
  const [isVisible, setIsVisible] = useState(false);
  const [acrylicEnabled, setAcrylicEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      const showHandler = (_: any, data: any) => {
        if (data && typeof data === 'object') {
          setCurrentEngine(data.engine || 'google');
          setLang(data.lang || 'id');
        } else {
          setCurrentEngine(data || 'google');
        }
        setIsVisible(true);
      };
      const hideHandler = () => {
        setIsVisible(false);
      };

      ipc.on('show-menu', showHandler);
      ipc.on('hide-menu', hideHandler);

      ipc.invoke('get-acrylic-enabled').then((enabled: boolean) => {
        setAcrylicEnabled(enabled);
      }).catch(() => {});

      return () => {
        ipc.removeListener('show-menu', showHandler);
        ipc.removeListener('hide-menu', hideHandler);
      };
    }
  }, []);

  useEffect(() => {
    if (isVisible && containerRef.current) {
      const sendResizedHeight = () => {
        if (!containerRef.current) return;
        const rectHeight = containerRef.current.getBoundingClientRect().height;
        const scrollHeight = containerRef.current.scrollHeight;
        const height = Math.ceil(Math.max(rectHeight, scrollHeight)) + 2;
        // @ts-ignore
        const ipc = window.require ? window.require('electron').ipcRenderer : null;
        if (ipc && height > 0) {
          ipc.send('resize-search-engine-menu', height);
        }
      };

      sendResizedHeight();
      const observer = new ResizeObserver(sendResizedHeight);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, [isVisible]);

  const selectEngine = (id: string) => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.send('select-search-engine', id);
    }
  };

  if (!isVisible) return null;

  return (
    <div ref={containerRef} className="flex flex-col overflow-hidden select-none w-full h-fit">
      <style>{`
        html, body, #root {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
          scrollbar-width: none !important;
        }
        ::-webkit-scrollbar {
          display: none !important;
          width: 0 !important;
          height: 0 !important;
        }
      `}</style>
      <div className={`flex flex-col gap-2 p-3.5 shadow-xl overflow-hidden ${
        acrylicEnabled 
          ? 'bg-white/60 dark:bg-[#000000]/50 backdrop-blur-md' 
          : 'bg-white dark:bg-[#1c1c1b] border border-black/10 dark:border-white/10 rounded-2xl'
      }`}>
        <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 opacity-60">
          {t('searchEngineTitle', lang)}
        </div>
        
        {engines.map((engine) => (
          <button
            key={engine.id}
            onClick={() => selectEngine(engine.id)}
            className={`
              flex items-center justify-between w-full px-2.5 py-2 rounded-xl transition-all duration-200 group text-zinc-700 dark:text-zinc-300 cursor-pointer
              ${currentEngine === engine.id 
                ? 'bg-black/5 dark:bg-white/10 font-semibold' 
                : 'hover:bg-black/5 dark:hover:bg-white/5'}
            `}
          >
            <div className="flex items-center gap-2.5">
              <div className={`
                w-6 h-6 rounded-md transition-colors flex items-center justify-center shrink-0
                ${currentEngine === engine.id ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'bg-transparent group-hover:bg-black/5 dark:group-hover:bg-white/5'}
              `}>
                <img 
                  src={engine.icon} 
                  alt={engine.name} 
                  className="w-4 h-4 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="text-xs font-medium">{engine.name}</span>
            </div>
            {currentEngine === engine.id && (
              <Check size={14} className="text-emerald-500 shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

