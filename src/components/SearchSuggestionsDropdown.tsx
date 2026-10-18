import React, { useState, useEffect } from 'react';
import { Globe, Search, Bookmark } from 'lucide-react';
import { dbService, Bookmark as BookmarkType } from '../services/db';
import { useOverlayTheme } from '../hooks/useOverlayTheme';

const getBookmarkFavicon = (bookmark: BookmarkType) => {
  if (bookmark.favicon) return bookmark.favicon;
  if (bookmark.url) {
    try {
      let u = bookmark.url;
      if (!u.startsWith('http://') && !u.startsWith('https://')) {
        u = 'https://' + u;
      }
      const urlObj = new URL(u);
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch (e) {
      return null;
    }
  }
  return null;
};

export function SearchSuggestionsDropdown() {
  useOverlayTheme();
  const [url, setUrl] = useState('');
  const [searchEngine, setSearchEngine] = useState('google');
  const [webHistory, setWebHistory] = useState<any[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [lang, setLang] = useState('id');
  const [isVisible, setIsVisible] = useState(false);
  const [failedFavicons, setFailedFavicons] = useState<Record<string, boolean>>({});
  const [acrylicEnabled, setAcrylicEnabled] = useState(true);

  useEffect(() => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      const updateHandler = (_: any, data: any) => {
        setUrl(data.url);
        setSearchEngine(data.searchEngine);
        setWebHistory(data.webHistory || []);
        setLang(data.lang || 'id');
        setIsVisible(true);
      };
      const hideHandler = () => {
        setIsVisible(false);
      };

      ipc.on('update-suggestions', updateHandler);
      ipc.on('hide-suggestions', hideHandler);

      ipc.invoke('get-acrylic-enabled').then((enabled: boolean) => {
        setAcrylicEnabled(enabled);
      }).catch(() => {});

      return () => {
        ipc.removeListener('update-suggestions', updateHandler);
        ipc.removeListener('hide-suggestions', hideHandler);
      };
    }
  }, []);

  // Fetch bookmarks when suggestions become visible
  useEffect(() => {
    if (isVisible) {
      dbService.getBookmarks()
        .then(setBookmarks)
        .catch(e => console.error('Failed to load bookmarks:', e));
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const trimmedUrl = url.trim();

  // ONLY show dropdown when there is typed text. Do not show when text is empty.
  if (!trimmedUrl) return null;

  const filteredHistory = webHistory.filter((item: any) => 
    (item.title && item.title.toLowerCase().includes(trimmedUrl.toLowerCase())) || 
    (item.url && item.url.toLowerCase().includes(trimmedUrl.toLowerCase()))
  );

  const filteredBookmarks = bookmarks.filter((item: BookmarkType) =>
    (item.title && item.title.toLowerCase().includes(trimmedUrl.toLowerCase())) || 
    (item.url && item.url.toLowerCase().includes(trimmedUrl.toLowerCase()))
  );

  const shouldShowDropdown = true; // Since trimmedUrl.length > 0 and we render at least the Search/URL button

  const handleSelect = (targetUrl: string) => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.send('select-suggestion', targetUrl);
    }
  };

  return (
    <div className="h-screen w-screen bg-transparent overflow-hidden select-none flex flex-col">
      <div className={`flex-1 flex flex-col border border-black/10 dark:border-white/10 shadow-2xl overflow-hidden max-h-[340px] ${
        acrylicEnabled 
          ? 'bg-white/60 dark:bg-[#1c1c1b]/60 backdrop-blur-md' 
          : 'bg-white dark:bg-[#1c1c1b] rounded-xl'
      }`}>
        <div className="overflow-y-auto custom-scrollbar flex-1">
          {/* Action Item: Search or Direct URL Navigation */}
          <button
            onClick={() => handleSelect(trimmedUrl)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-500/[0.04] dark:bg-zinc-500/[0.04] hover:bg-zinc-500/10 dark:hover:bg-zinc-500/10 border-b border-black/5 dark:border-white/5 transition-colors text-left group cursor-pointer"
          >
            <div className="w-6 h-6 rounded-lg bg-zinc-500/10 dark:bg-zinc-500/10 flex items-center justify-center shrink-0 group-hover:bg-zinc-500/20 dark:group-hover:bg-zinc-500/20 transition-colors">
              <Search size={12} className="text-zinc-600 dark:text-zinc-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-900 dark:text-white truncate font-semibold">
                {(() => {
                  const isUrl = trimmedUrl.match(/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/) || (trimmedUrl.includes('.') && !trimmedUrl.includes(' '));
                  return isUrl 
                    ? (lang === 'id' ? `Buka URL: ${trimmedUrl}` : `Open URL: ${trimmedUrl}`)
                    : (lang === 'id' ? `Cari "${trimmedUrl}" dengan ${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)}` : `Search "${trimmedUrl}" with ${searchEngine.charAt(0).toUpperCase() + searchEngine.slice(1)}`);
                })()}
              </div>
            </div>
          </button>

          {/* Bookmarks Items */}
          {filteredBookmarks.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-black/5 dark:bg-white/5 flex items-center gap-1.5 border-b border-black/5 dark:border-white/5">
                <Bookmark size={10} className="text-zinc-500" />
                {lang === 'id' ? 'Bookmark' : 'Bookmarks'}
              </div>
              {filteredBookmarks.slice(0, 5).map((item) => {
                const fav = getBookmarkFavicon(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item.url || '')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-500/10 dark:hover:bg-zinc-500/10 border-b border-black/5 dark:border-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg bg-zinc-500/10 dark:bg-zinc-500/10 flex items-center justify-center shrink-0 group-hover:bg-zinc-500/20 dark:group-hover:bg-zinc-500/20 transition-colors">
                      {(fav && !failedFavicons[fav]) ? (
                        <img 
                          src={fav} 
                          alt="" 
                          onError={() => {
                            if (fav) {
                              setFailedFavicons(prev => ({ ...prev, [fav]: true }));
                            }
                          }}
                          className="w-4 h-4 object-contain" 
                        />
                      ) : (
                        <Bookmark size={12} className="text-zinc-600 dark:text-zinc-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-900 dark:text-white truncate font-medium">{item.title}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{item.url}</div>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* History items */}
          {filteredHistory.length > 0 && (
            <>
              <div className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5">
                {lang === 'id' ? 'Hasil Riwayat Pencarian' : 'Search History Results'}
              </div>
              {filteredHistory.slice(0, 10).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.url)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-500/10 dark:hover:bg-zinc-500/10 border-b border-black/5 dark:border-white/5 transition-colors text-left group cursor-pointer"
                >
                  <div className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-zinc-500/20 dark:group-hover:bg-zinc-500/20 transition-colors">
                    {(item.favicon && !failedFavicons[item.favicon]) ? (
                      <img 
                        src={item.favicon} 
                        alt="" 
                        onError={() => {
                          if (item.favicon) {
                            setFailedFavicons(prev => ({ ...prev, [item.favicon]: true }));
                          }
                        }}
                        className="w-4 h-4 object-contain" 
                      />
                    ) : (
                      <Globe size={12} className="text-zinc-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-900 dark:text-white truncate font-medium">{item.title}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{item.url}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
