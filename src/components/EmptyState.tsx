import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  FileVideo, Plus, Link, FolderOpen, Globe, MousePointer2,
  Database, Search, Play, FileText, ArrowRight, Folder, ListVideo,
  Home, Trash2, LayoutGrid, List, ChevronDown, ChevronRight, Edit, Settings,
  AlertCircle, Keyboard, Repeat
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { t, Language } from '../services/i18n';
import { SavedCollection, SavedLoop, dbService, PreferenceSettings } from '../services/db';
import { CreatePlaylistModal } from './CreatePlaylistModal';
import { AddFilesToPlaylistModal } from './AddFilesToPlaylistModal';
import { EditPlaylistModal } from './EditPlaylistModal';
import { useElectron } from '../hooks/useElectron';
import { isAudioMedia } from '../services/mediaUtils';

export const EmptyState = ({ 
  onFileChange, 
  onShowNetworkModal, 
  onLoadPlaylist,
  onShowSniffer,
  lang = 'id',
  playlist = [],
  thumbnails = {},
  onInvalidateThumbnail,
  onPlayIndex,
  onPlayStream,
  savedCollections = [],
  onSelectCollection,
  onRemoveFile,
  onDeleteCollection,
  onCreatePlaylist,
  onSetPlaylist,
  onUpdateCollection,
  hasActiveMedia = false,
  onGoToPlayer,
  onShowSettings,
  onShowShortcuts,
  activeDownloadsCount = 0,
  completedDownloadsCount = 0,
  onLoadLoop,
  preferenceSettings
}: { 
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  onShowNetworkModal: () => void,
  onLoadPlaylist: () => void,
  onShowSniffer: (initialUrl?: string) => void,
  lang?: Language,
  playlist?: File[],
  thumbnails?: Record<string, string>,
  onInvalidateThumbnail?: (key: string) => void,
  onPlayIndex?: (index: number) => void,
  onPlayStream?: (url: string) => void,
  savedCollections?: SavedCollection[],
  onSelectCollection?: (collection: SavedCollection, playIndex?: number) => void,
  onRemoveFile?: (index: number) => void,
  onDeleteCollection?: (id: string) => void,
  onCreatePlaylist?: (name: string, files: any[]) => void,
  onSetPlaylist?: (files: File[]) => void,
  onUpdateCollection?: (collection: SavedCollection) => void,
  hasActiveMedia?: boolean,
  onGoToPlayer?: () => void,
  onShowSettings?: () => void,
  onShowShortcuts?: () => void,
  activeDownloadsCount?: number,
  completedDownloadsCount?: number,
  onLoadLoop?: (videoId: string, loop: SavedLoop) => void,
  preferenceSettings?: PreferenceSettings
}) => {
  const { getLocalFileUrl } = useElectron();
  const [loopThumbnails, setLoopThumbnails] = useState<Record<string, string>>({});
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const generateLoopThumbnail = React.useCallback((videoId: string, loop: SavedLoop, file: File | null): Promise<string> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve('');
      }, 8000);

      try {
        const isAudio = file 
          ? isAudioMedia(file)
          : isAudioMedia({ name: videoId });
          
        if (isAudio) {
          clearTimeout(timeout);
          resolve('');
          return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        let src = '';

        if (file && (file as any).isStream) {
          src = (file as any).url || (file as any).path;
        } else if (file && (file as any).path) {
          src = getLocalFileUrl((file as any).path);
        } else if (file && (file instanceof Blob)) {
          src = URL.createObjectURL(file);
        } else if (videoId.startsWith('/') || videoId.includes(':\\')) {
          src = getLocalFileUrl(videoId);
        } else if (videoId.startsWith('http')) {
          src = videoId;
        } else {
          clearTimeout(timeout);
          resolve('');
          return;
        }

        video.src = src;

        video.onloadedmetadata = () => {
          video.currentTime = loop.start;
        };

        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = video.videoHeight && video.videoWidth 
              ? (video.videoHeight / video.videoWidth) * 320 
              : 180;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

            dbService.saveThumbnail("loop_thumb_" + loop.id, dataUrl)
              .catch(e => console.error('Failed to save loop thumbnail:', e));

            clearTimeout(timeout);
            resolve(dataUrl);
          } catch (err) {
            console.warn('Failed to draw loop canvas:', err);
            clearTimeout(timeout);
            resolve('');
          } finally {
            if (file && !(file as any).path && !(file as any).isStream && (file instanceof Blob)) {
              URL.revokeObjectURL(src);
            }
            video.src = '';
            video.load();
            video.remove();
          }
        };

        video.onerror = () => {
          clearTimeout(timeout);
          resolve('');
          if (file && !(file as any).path && !(file as any).isStream && (file instanceof Blob)) {
            URL.revokeObjectURL(src);
          }
          video.remove();
        };
      } catch (e) {
        console.error('Error in generateLoopThumbnail:', e);
        clearTimeout(timeout);
        resolve('');
      }
    });
  }, [getLocalFileUrl]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<'files' | 'library' | 'playlists' | 'queue'>('files');
  const [sortType, setSortType] = useState<'name' | 'size' | 'type'>('name');

  const userPlaylists = useMemo(() => {
    return (savedCollections || []).filter(col => col.id !== 'play_queue');
  }, [savedCollections]);

  const playQueueCollection = useMemo(() => {
    return (savedCollections || []).find(col => col.id === 'play_queue') || null;
  }, [savedCollections]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [expandedPlaylists, setExpandedPlaylists] = useState<Record<string, boolean>>({});
  const [allProgress, setAllProgress] = useState<Record<string, { time: number; duration?: number; updatedAt?: number }>>({});
  const [allLoops, setAllLoops] = useState<{videoId: string, loops: SavedLoop[]}[]>([]);
  const [showAddFilesModal, setShowAddFilesModal] = useState(false);
  const [addFilesPlaylist, setAddFilesPlaylist] = useState<SavedCollection | null>(null);
  const [showEditPlaylistModal, setShowEditPlaylistModal] = useState(false);
  const [editPlaylistCollection, setEditPlaylistCollection] = useState<SavedCollection | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    dbService.getAllProgress().then(progressList => {
      const progressMap: Record<string, { time: number; duration?: number; updatedAt?: number }> = {};
      progressList.forEach(p => {
        progressMap[p.videoId] = { time: p.time, duration: (p as any).duration, updatedAt: p.updatedAt };
      });
      setAllProgress(progressMap);
    }).catch(e => console.error('Error loading progress:', e));

    dbService.getAllLoops().then(setAllLoops).catch(e => console.error('Error loading loops:', e));
  }, [playlist]);

  useEffect(() => {
    if (allLoops.length === 0) return;

    const loadAndGenerateLoopThumbs = async () => {
      const updatedThumbs: Record<string, string> = {};
      let hasChanges = false;

      for (const ld of allLoops) {
        for (const loop of ld.loops) {
          const thumbKey = `loop_thumb_${loop.id}`;
          if (loopThumbnails[loop.id] || updatedThumbs[loop.id]) continue;

          try {
            const cached = await dbService.getThumbnail(thumbKey);
            if (cached) {
              updatedThumbs[loop.id] = cached;
              hasChanges = true;
            } else {
              const file = playlist.find(f => {
                const fKey = (f as any).path || (f as any).fullPath || (f.name + f.size);
                return fKey === ld.videoId;
              }) || null;

              const thumb = await generateLoopThumbnail(ld.videoId, loop, file);
              if (thumb) {
                updatedThumbs[loop.id] = thumb;
                hasChanges = true;
              }
            }
          } catch (e) {
            console.error('Failed to load/generate loop thumbnail:', e);
          }
        }
      }

      if (hasChanges) {
        setLoopThumbnails(prev => ({ ...prev, ...updatedThumbs }));
      }
    };

    loadAndGenerateLoopThumbs();
  }, [allLoops, playlist, generateLoopThumbnail]);

  const togglePlaylistExpand = (id: string) => {
    setExpandedPlaylists(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const sortedAndFilteredPlaylist = useMemo(() => {
    const playlistWithOriginalIndex = playlist.map((file, idx) => ({ file, originalIndex: idx }));
    const filtered = playlistWithOriginalIndex.filter(item => 
      item.file.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      if (sortType === 'name') {
        return a.file.name.localeCompare(b.file.name);
      } else if (sortType === 'size') {
        return b.file.size - a.file.size;
      } else {
        const typeA = a.file.type || '';
        const typeB = b.file.type || '';
        return typeA.localeCompare(typeB);
      }
    });
  }, [playlist, searchQuery, sortType]);

  // Filter actual playlist if any
  const filteredPlaylist = playlist.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Generate Recently Played items: only those that have been actually played or currently playing (i.e. has progress in IndexedDB)
  const recentPlayed = useMemo(() => {
    return playlist
      .map((file, idx) => {
        const fileKey = (file as any).path || (file as any).fullPath || (file.name + file.size);
        const progressInfo = allProgress[fileKey];
        if (!progressInfo || progressInfo.time <= 0) return null;

        const thumb = thumbnails[fileKey] || '';
        let pct = 0;
        if (progressInfo.duration && progressInfo.duration > 0) {
          pct = Math.min(100, Math.max(0, Math.round((progressInfo.time / progressInfo.duration) * 100)));
        } else {
          // fallback if no duration is stored yet (e.g. legacy or not playing long enough)
          pct = 0;
        }

        // Apply search query filter if search exists
        if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return null;
        }

        return {
          title: file.name,
          artist: (file as any).isStream ? 'Stream URL' : 'Local File',
          progress: pct,
          isReal: true,
          index: idx,
          thumbnail: thumb,
          bg: 'bg-gradient-to-br from-zinc-800 to-zinc-900',
          updatedAt: progressInfo.updatedAt || 0,
          fileKey: fileKey
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [playlist, allProgress, thumbnails, searchQuery]);

  // Helper to detect if a string is a URL
  const isUrl = (str: string) => {
    try {
      new URL(str);
      return true;
    } catch {
      const domainRegex = /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/;
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/;
      const localhostRegex = /^localhost(:\d+)?(\/.*)?$/;
      return domainRegex.test(str) || ipRegex.test(str) || localhostRegex.test(str);
    }
  };

  // Helper to detect if a URL is a media/stream URL
  const isStreamUrl = (str: string) => {
    const trimmed = str.trim().toLowerCase();
    const mediaExtensions = [
      '.m3u8', '.mp4', '.mkv', '.webm', '.mp3', 
      '.wav', '.ogg', '.aac', '.flac', '.mov', 
      '.avi', '.mpd', '.ts', '.3gp', '.flv',
      '.m3u'
    ];
    const hasMediaExt = mediaExtensions.some(ext => trimmed.includes(ext)) || trimmed.includes('/stream/') || trimmed.includes('stream?') || trimmed.includes('/live');
    return isUrl(str) && hasMediaExt;
  };

  interface SearchSuggestion {
    type: 'file' | 'playlist' | 'loop' | 'url' | 'search';
    id: string;
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    action: () => void;
  }

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus active cursor on Home search bar when app is opened via shortcut/exe without active media playing
  useEffect(() => {
    if (activeMenu === 'files' && !hasActiveMedia) {
      const focusSearch = () => {
        // Prevent stealing focus if user is already interacting with another input or modal
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && activeEl !== searchInputRef.current) {
          return;
        }
        if (searchInputRef.current) {
          searchInputRef.current.focus({ preventScroll: true });
          const len = searchInputRef.current.value.length;
          try {
            searchInputRef.current.setSelectionRange(len, len);
          } catch (_) {}
        }
      };

      // Staged focus attempts to guarantee active cursor once window focus, DOM rendering, and animations settle
      focusSearch();
      const t1 = setTimeout(focusSearch, 80);
      const t2 = setTimeout(focusSearch, 250);
      const t3 = setTimeout(focusSearch, 600);

      const handleShortcutFocus = () => {
        focusSearch();
        setTimeout(focusSearch, 120);
      };

      window.addEventListener('focus-home-search', handleShortcutFocus);
      window.addEventListener('app-opened-via-shortcut', handleShortcutFocus);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        window.removeEventListener('focus-home-search', handleShortcutFocus);
        window.removeEventListener('app-opened-via-shortcut', handleShortcutFocus);
      };
    }
  }, [activeMenu, hasActiveMedia]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchFormRef.current && !searchFormRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setSelectedIndex(-1);
    if (searchQuery.trim()) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [searchQuery]);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim();
    const list: SearchSuggestion[] = [];

    // 1. Files
    const matchedFiles = playlist
      .map((f, idx) => ({ f, idx }))
      .filter(item => item.f.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3);

    matchedFiles.forEach(item => {
      list.push({
        type: 'file',
        id: `file-${item.idx}`,
        title: item.f.name,
        subtitle: lang === 'id' ? 'Berkas Lokal' : 'Local File',
        icon: <FileVideo size={14} className="text-blue-500" />,
        action: () => {
          if (onPlayIndex) onPlayIndex(item.idx);
          setSearchQuery('');
        }
      });
    });

    // 2. Playlists
    const matchedPlaylists = userPlaylists
      .filter(pl => pl.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 3);

    matchedPlaylists.forEach(pl => {
      list.push({
        type: 'playlist',
        id: `playlist-${pl.id}`,
        title: pl.name,
        subtitle: lang === 'id' ? 'Daftar Putar' : 'Playlist',
        icon: <ListVideo size={14} className="text-emerald-500" />,
        action: () => {
          if (onSelectCollection) onSelectCollection(pl);
          setSearchQuery('');
        }
      });
    });

    // 3. Loops
    const matchedLoops: { loop: SavedLoop; videoId: string }[] = [];
    for (const ld of allLoops) {
      for (const loop of ld.loops) {
        if (loop.name.toLowerCase().includes(query.toLowerCase())) {
          matchedLoops.push({ loop, videoId: ld.videoId });
        }
      }
    }
    matchedLoops.slice(0, 3).forEach(item => {
      const fileName = item.videoId.split(/[/\\]/).pop() || item.videoId;
      list.push({
        type: 'loop',
        id: `loop-${item.loop.id}`,
        title: item.loop.name,
        subtitle: `${lang === 'id' ? 'Loop' : 'Loop'} • ${fileName}`,
        icon: <Repeat size={14} className="text-amber-500" />,
        action: () => {
          if (onLoadLoop) onLoadLoop(item.videoId, item.loop);
          setSearchQuery('');
        }
      });
    });

    // 4. URL
    if (isUrl(query)) {
      let finalUrl = query;
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }
      
      if (isStreamUrl(finalUrl)) {
        // Suggest direct play
        list.push({
          type: 'url',
          id: 'stream-play',
          title: finalUrl,
          subtitle: lang === 'id' ? 'Putar Aliran Video Langsung' : 'Play Direct Stream URL',
          icon: <Play size={14} className="text-amber-500 animate-pulse" />,
          action: () => {
            if (onPlayStream) {
              onPlayStream(finalUrl);
            } else {
              onShowNetworkModal();
            }
            setSearchQuery('');
          }
        });

        // Also suggest opening in Sniffer Browser
        list.push({
          type: 'url',
          id: 'url-match',
          title: finalUrl,
          subtitle: lang === 'id' ? 'Buka di Peramban Sniffer' : 'Open in Sniffer Browser',
          icon: <Globe size={14} className="text-purple-500" />,
          action: () => {
            onShowSniffer(finalUrl);
            setSearchQuery('');
          }
        });
      } else {
        list.push({
          type: 'url',
          id: 'url-match',
          title: finalUrl,
          subtitle: lang === 'id' ? 'Buka Alamat Web' : 'Open Web Address',
          icon: <Globe size={14} className="text-purple-500 animate-pulse" />,
          action: () => {
            onShowSniffer(finalUrl);
            setSearchQuery('');
          }
        });
      }
    }

    // 5. Internet search
    const searchEngine = localStorage.getItem('snifferSearchEngine') || 'google';
    const encodedQuery = encodeURIComponent(query);
    let searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
    let engineName = 'Google';
    if (searchEngine === 'bing') {
      searchUrl = `https://www.bing.com/search?q=${encodedQuery}`;
      engineName = 'Bing';
    } else if (searchEngine === 'duckduckgo') {
      searchUrl = `https://duckduckgo.com/?q=${encodedQuery}`;
      engineName = 'DuckDuckGo';
    }

    list.push({
      type: 'search',
      id: 'web-search',
      title: query,
      subtitle: lang === 'id' ? `Cari dengan ${engineName}` : `Search with ${engineName}`,
      icon: <Search size={14} className="text-orange-500" />,
      action: () => {
        onShowSniffer(searchUrl);
        setSearchQuery('');
      }
    });

    return list;
  }, [searchQuery, playlist, userPlaylists, allLoops, lang, onPlayIndex, onSelectCollection, onLoadLoop, onShowSniffer, onPlayStream, onShowNetworkModal]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const trimmed = searchQuery.trim();
    // 1. If there's an exact local file name match, play it
    const exactFileIndex = playlist.findIndex(f => f.name.toLowerCase() === trimmed.toLowerCase());
    if (exactFileIndex !== -1) {
      if (onPlayIndex) {
        onPlayIndex(exactFileIndex);
        setSearchQuery('');
        setShowSuggestions(false);
        return;
      }
    }

    // 2. Exact playlist name match
    const exactPlaylist = userPlaylists.find(pl => pl.name.toLowerCase() === trimmed.toLowerCase());
    if (exactPlaylist) {
      if (onSelectCollection) {
        onSelectCollection(exactPlaylist);
        setSearchQuery('');
        setShowSuggestions(false);
        return;
      }
    }

    // 3. Standard submission
    if (isUrl(trimmed)) {
      let finalUrl = trimmed;
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }
      
      if (isStreamUrl(finalUrl)) {
        if (onPlayStream) {
          onPlayStream(finalUrl);
        } else {
          onShowNetworkModal();
        }
      } else {
        onShowSniffer(finalUrl);
      }
    } else {
      const searchEngine = localStorage.getItem('snifferSearchEngine') || 'google';
      const encodedQuery = encodeURIComponent(trimmed);
      let searchUrl = `https://www.google.com/search?q=${encodedQuery}`;
      if (searchEngine === 'bing') {
        searchUrl = `https://www.bing.com/search?q=${encodedQuery}`;
      } else if (searchEngine === 'duckduckgo') {
        searchUrl = `https://duckduckgo.com/?q=${encodedQuery}`;
      }
      onShowSniffer(searchUrl);
    }
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Check if selecting suggestion in dropdown
      if (showSuggestions && selectedIndex >= 0 && selectedIndex < suggestions.length) {
        e.preventDefault();
        suggestions[selectedIndex].action();
        setShowSuggestions(false);
        return;
      }

      e.preventDefault();
      const trimmed = searchQuery.trim();
      if (!trimmed) return;

      if (e.ctrlKey) {
        // Ctrl+Enter
        let finalUrl = trimmed;
        if (!finalUrl.includes('.') && !finalUrl.startsWith('http')) {
          finalUrl = `https://${finalUrl}.com`;
        } else if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
          finalUrl = `https://${finalUrl}`;
        }
        onShowSniffer(finalUrl);
        setSearchQuery('');
        setShowSuggestions(false);
      } else {
        handleSearchSubmit(e);
      }
    } else if (e.key === 'ArrowDown') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };  return (
    <div className={`absolute inset-0 w-full h-full flex flex-row items-stretch z-10 overflow-hidden ${isFullscreen ? 'bg-white dark:bg-zinc-950' : 'bg-white/0 dark:bg-black/0'} backdrop-blur-2xl text-zinc-900 dark:text-zinc-50 transition-colors duration-300`}>
      {/* Sidebar Wrapper with Hover Group for Mobile Auto-hide */}
      <div className="relative md:static shrink-0 group/sidebar z-30">
        {/* Invisible Hover Zone (only active on mobile/small screens) */}
        <div className="sm:hidden fixed left-0 top-0 bottom-0 w-4 bg-transparent z-40" />
        {/* Sidebar Section */}
        <div className={`fixed sm:static inset-y-0 left-0 w-16 md:w-64 lg:w-72 h-full -translate-x-full sm:translate-x-0 group-hover/sidebar:translate-x-0 transition-all duration-300 z-30 ${
          isFullscreen 
            ? 'bg-zinc-50 dark:bg-zinc-900' 
            : 'bg-white/0 dark:bg-black/0'
        } border-r border-zinc-200/50 dark:border-zinc-800/40 backdrop-blur-3xl flex flex-col justify-between px-2 md:px-6 py-4 md:py-6 shadow-xl sm:shadow-none overflow-y-auto custom-scrollbar`}>
          <div>
            {/* Brand Logo */}
            <div className="flex items-center gap-3 mb-8 justify-center md:justify-start">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/30 border border-amber-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.15)] shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                  <defs>
                    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#451a03" />
                      <stop offset="100%" stopColor="#7c2d12" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="20" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <rect width="512" height="512" rx="128" fill="url(#bg)" />
                  <circle cx="256" cy="256" r="160" fill="#050002" stroke="#f59e0b" strokeWidth="8" filter="url(#glow)" />
                  <path d="M216 176 L344 256 L216 336 Z" fill="#fbbf24" filter="url(#glow)" />
                </svg>

              </div>
              <div className="hidden md:flex items-center text-xl font-black tracking-tight">
                <span className="text-zinc-900 dark:text-white transition-colors duration-300">NIGHT</span>
                <span className="ml-1 bg-amber-500/95 text-black px-2 py-0.5 rounded-lg text-xs font-black tracking-wide shadow-[0_0_15px_rgba(245,158,11,0.3)]">HUB</span>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex flex-col gap-1 overflow-y-auto scrollbar-none">
              <button 
                onClick={() => setActiveMenu('files')}
                className={`w-full shrink-0 flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all text-left relative overflow-hidden ${activeMenu === 'files' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500' : 'text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10'}`}
              >
                {activeMenu === 'files' && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-orange-500 dark:bg-amber-500 rounded-r" />
                )}
                <Home size={18} className={activeMenu === 'files' ? 'text-orange-500 dark:text-amber-500 shrink-0' : 'text-zinc-800 dark:text-white shrink-0'} />
                <span className="hidden md:inline">{lang === 'id' ? 'Beranda' : 'Home'}</span>
              </button>

              <button 
                onClick={() => setActiveMenu('library')}
                className={`w-full shrink-0 flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all text-left relative overflow-hidden ${activeMenu === 'library' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500' : 'text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10'}`}
              >
                {activeMenu === 'library' && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-orange-500 dark:bg-amber-500 rounded-r" />
                )}
                <Database size={18} className={activeMenu === 'library' ? 'text-orange-500 dark:text-amber-500 shrink-0' : 'text-zinc-800 dark:text-white shrink-0'} />
                <span className="hidden md:inline">{lang === 'id' ? 'Pustaka Media' : 'Media Library'}</span>
              </button>

              <button 
                onClick={() => { setActiveMenu('playlists'); }}
                className={`w-full shrink-0 flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all text-left relative overflow-hidden ${activeMenu === 'playlists' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500' : 'text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10'}`}
              >
                {activeMenu === 'playlists' && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-orange-500 dark:bg-amber-500 rounded-r" />
                )}
                <ListVideo size={18} className={activeMenu === 'playlists' ? 'text-orange-500 dark:text-amber-500 shrink-0' : 'text-zinc-800 dark:text-white shrink-0'} />
                <span className="hidden md:inline">{lang === 'id' ? 'Daftar Putar' : 'Playlists'}</span>
              </button>

              <button 
                onClick={() => { setActiveMenu('queue'); }}
                className={`w-full shrink-0 flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all text-left relative overflow-hidden ${activeMenu === 'queue' ? 'bg-orange-500/10 text-orange-500 dark:text-amber-500' : 'text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10'}`}
              >
                {activeMenu === 'queue' && (
                  <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-orange-500 dark:bg-amber-500 rounded-r" />
                )}
                <List size={18} className={activeMenu === 'queue' ? 'text-orange-500 dark:text-amber-500 shrink-0' : 'text-zinc-800 dark:text-white shrink-0'} />
                <span className="hidden md:inline">{lang === 'id' ? 'Antrean Putar' : 'Play Queue'}</span>
              </button>

              <button 
                onClick={hasActiveMedia && onGoToPlayer ? onGoToPlayer : undefined}
                disabled={!hasActiveMedia}
                className={`w-full shrink-0 flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all text-left relative overflow-hidden mt-1 group ${
                  hasActiveMedia 
                    ? 'text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10 cursor-pointer' 
                    : 'text-zinc-800/50 dark:text-zinc-500 opacity-60'
                }`}
              >
                <div className="relative flex h-4 w-4 items-center justify-center shrink-0">
                  {hasActiveMedia ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-orange-500/50 dark:bg-amber-500/50 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500 dark:bg-amber-500"></span>
                    </>
                  ) : (
                    <span className="inline-flex rounded-full h-2 w-2 bg-zinc-300 dark:bg-zinc-700"></span>
                  )}
                </div>
                <span className="hidden md:inline">{lang === 'id' ? 'Sedang Diputar' : 'Now Playing'}</span>
              </button>

              {/* Quick Access Section */}
              <div className="hidden md:flex items-center gap-2 px-4 py-3 mt-4 mb-1 select-none">
                <span className="text-[10px] font-black text-zinc-600 dark:text-zinc-500 uppercase tracking-widest">{lang === 'id' ? 'Akses Cepat' : 'Quick Access'}</span>
              </div>

              <button 
                onClick={() => onShowSniffer()}
                className="w-full shrink-0 flex items-center justify-between gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10 transition-all text-left relative"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="relative">
                    <Globe size={18} className="text-zinc-800 dark:text-white shrink-0" />
                    {/* Small dot on icon for compact layout if any download is active/complete */}
                    {(activeDownloadsCount > 0 || completedDownloadsCount > 0) && (
                      <span className={`md:hidden absolute -top-1 -right-1 flex h-2.5 w-2.5 rounded-full border border-white dark:border-zinc-900 ${
                        activeDownloadsCount > 0 ? 'bg-orange-500 animate-pulse' : 'bg-emerald-500'
                      }`} />
                    )}
                  </div>
                  <span className="hidden md:inline">{lang === 'id' ? 'Detektor Video' : 'Video Sniffer'}</span>
                </div>
                
                {/* Badge for full sidebar view */}
                {(activeDownloadsCount > 0 || completedDownloadsCount > 0) && (
                  <span className={`hidden md:flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full text-[10px] font-black text-white shadow-sm shrink-0 transition-colors duration-300 ${
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
                className="w-full shrink-0 flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10 transition-all text-left"
              >
                <Link size={18} className="text-zinc-800 dark:text-white shrink-0" />
                <span className="hidden md:inline">{lang === 'id' ? 'Aliran URL' : 'Stream URL'}</span>
              </button>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="flex flex-col gap-2 mt-8">
            {onShowShortcuts && (
              <button 
                onClick={onShowShortcuts}
                className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10 transition-all text-left group"
              >
                <Keyboard size={18} className="text-zinc-800 dark:text-white group-hover:scale-110 transition-transform duration-300 shrink-0" />
                <span className="hidden md:inline">{lang === 'id' ? 'Pintasan' : 'Shortcuts'}</span>
              </button>
            )}

            {onShowSettings && (
              <button 
                onClick={onShowSettings}
                className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-xl text-xs sm:text-sm font-bold text-zinc-800 dark:text-white hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-500/10 dark:hover:bg-zinc-600/10 transition-all text-left group"
              >
                <Settings size={18} className="text-zinc-800 dark:text-white group-hover:rotate-45 transition-transform duration-300 shrink-0" />
                <span className="hidden md:inline">{lang === 'id' ? 'Pengaturan' : 'Settings'}</span>
              </button>
            )}
            
          </div>
        </div>
      </div>

      {/* Main Workspace Section */}
      <div className={`flex-1 h-full flex flex-col overflow-hidden relative z-10 ${
        isFullscreen 
          ? 'bg-white dark:bg-zinc-950' 
          : 'bg-white/0 dark:bg-black/0'
      } backdrop-blur-3xl transition-colors duration-300`}>
        {/* Glow Spots */}

        {/* Conditional rendering depending on activeMenu */}
        {activeMenu === 'files' && (
          <div className="w-full flex flex-col h-full overflow-hidden animate-fade-in">
            {/* Header / Central Action Bar */}
            <div className="w-full shrink-0 px-8 pt-8 pb-4">
              <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
                {/* Big Local File CTA */}
                <label className="w-full max-w-md mx-auto flex items-center justify-center gap-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black py-4 px-8 rounded-2xl font-black text-lg shadow-[0_0_25px_rgba(245,158,11,0.25)] hover:shadow-[0_0_40px_rgba(245,158,11,0.45)] transition-all hover:scale-[1.02] active:scale-98 cursor-pointer tracking-wider uppercase">
                  <Plus size={22} className="stroke-[3]" />
                  <span>{t('openLocalFile', lang)}</span>
                  <input type="file" accept="video/*,audio/*,.ts,.m3u8,.m3u,.srt,.vtt,.ass,.ssa" multiple className="hidden" onChange={onFileChange} />
                </label>

                {/* Search Bar */}
                <form 
                  ref={searchFormRef}
                  onSubmit={handleSearchSubmit} 
                  className="relative w-full max-w-xl mx-auto z-50"
                >
                  <div className="relative flex items-center bg-white/50 dark:bg-zinc-900/50 rounded-full border border-zinc-200/50 dark:border-zinc-800/50 px-4 py-3.5 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/50 transition-all shadow-xl dark:shadow-2xl backdrop-blur-xl">
                    <Search size={18} className="text-amber-500 mr-3 shrink-0" />
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={() => {
                        if (searchQuery.trim()) setShowSuggestions(true);
                      }}
                      placeholder={lang === 'id' ? 'Cari pustaka atau tempel URL aliran...' : 'Search library or paste stream URL...'}
                      className="w-full bg-transparent border-none text-zinc-800 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-500 text-sm focus:outline-none focus:ring-0 p-0"
                    />
                    {searchQuery && (
                      <button type="submit" className="p-1 bg-amber-500/10 hover:bg-amber-500 hover:text-black rounded-lg text-amber-500 transition-all">
                        <ArrowRight size={12} className="stroke-[2.5]" />
                      </button>
                    )}
                  </div>

                  {/* Suggestions List */}
                  <AnimatePresence>
                    {showSuggestions && suggestions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-[0_15px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_15px_40px_rgba(0,0,0,0.4)] overflow-hidden backdrop-blur-xl max-h-96 overflow-y-auto custom-scrollbar flex flex-col p-2 gap-0.5"
                      >
                        {suggestions.map((item, index) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              item.action();
                              setShowSuggestions(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors ${
                              index === selectedIndex 
                                ? 'bg-amber-500/15 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium' 
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-750 dark:text-zinc-300'
                            }`}
                          >
                            <div className="shrink-0 p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg group-hover:scale-105 transition-transform">
                              {item.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm font-semibold truncate">
                                {item.title}
                              </p>
                              {item.subtitle && (
                                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium mt-0.5 uppercase tracking-wider">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              {lang === 'id' ? 'Klik untuk buka' : 'Click to open'}
                            </div>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
              </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8 pt-2">
              {/* Recently Played Section */}
            <div className="w-full max-w-5xl mx-auto mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-zinc-800 dark:text-zinc-200 font-extrabold text-sm uppercase tracking-widest flex items-center gap-2">
                  <Play size={18} className="text-amber-500 shrink-0" />
                  <span>{lang === 'id' ? 'Baru Saja Diputar' : 'Recently Played'}</span>
                  {recentPlayed.length > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 font-mono px-2 py-0.5 rounded-full border border-amber-500/20">
                      {recentPlayed.length}
                    </span>
                  )}
                </h2>
                {recentPlayed.length > 0 && (onRemoveFile || onSetPlaylist) && (
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: lang === 'id' ? 'Hapus Semua Baru Saja Diputar' : 'Clear All Recently Played',
                        message: lang === 'id' 
                          ? 'Apakah Anda yakin ingin menghapus semua berkas Baru Saja Diputar?' 
                          : 'Are you sure you want to clear all Recently Played files?',
                        confirmText: lang === 'id' ? 'Ya, Hapus Semua' : 'Yes, Clear All',
                        cancelText: lang === 'id' ? 'Batal' : 'Cancel',
                        onConfirm: () => {
                          const recentKeys = new Set(recentPlayed.map(v => {
                            const file = playlist[v.index];
                            return (file as any).path || (file as any).fullPath || (file.name + file.size);
                          }));
                          
                          // Clear progress in database
                          for (const key of recentKeys) {
                            dbService.deleteProgress(key).catch(e => console.error('Failed to delete progress:', e));
                          }
                          
                          // Clear progress in local state
                          setAllProgress(prev => {
                            const next = { ...prev };
                            for (const key of recentKeys) {
                              delete next[key];
                            }
                            return next;
                          });

                          // Remove from playlist
                          if (onSetPlaylist && playlist) {
                            const newPlaylist = playlist.filter(file => {
                              const key = (file as any).path || (file as any).fullPath || (file.name + file.size);
                              return !recentKeys.has(key);
                            });
                            onSetPlaylist(newPlaylist);
                          } else if (onRemoveFile) {
                            const indicesToRemove = recentPlayed.map(v => v.index).sort((a, b) => b - a);
                            indicesToRemove.forEach(index => {
                              onRemoveFile(index);
                            });
                          }
                        }
                      });
                    }}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 font-extrabold hover:underline transition-all animate-fade-in"
                  >
                    <Trash2 size={13} />
                    <span>{lang === 'id' ? 'Hapus Semua' : 'Clear All'}</span>
                  </button>
                )}
              </div>

              {recentPlayed.length > 0 ? (
                <div className="flex flex-row gap-4 overflow-x-auto pt-2 pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent animate-fade-in -mx-4 px-4">
                  {recentPlayed.map((video, idx) => (
                    <div 
                      key={idx}
                      onClick={() => {
                        if (video.isReal && onPlayIndex) {
                          onPlayIndex(video.index);
                        } else {
                          onLoadPlaylist();
                        }
                      }}
                      className="group flex flex-col w-64 md:w-72 shrink-0 bg-white/80 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/5 hover:border-amber-500/30 dark:hover:border-amber-500/30 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] shadow-md dark:shadow-lg cursor-pointer backdrop-blur-md relative"
                    >
                      {/* Thumbnail Area */}
                      <div className={`aspect-video w-full flex items-center justify-center relative overflow-hidden ${!video.thumbnail ? video.bg : ''}`}>
                        {video.thumbnail ? (
                          <img 
                            src={video.thumbnail} 
                            alt={video.title} 
                            onError={() => {
                              if (onInvalidateThumbnail && video.fileKey) {
                                onInvalidateThumbnail(video.fileKey);
                              }
                            }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          />
                        ) : (
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/40 transition-colors">
                            <Play size={24} className="text-amber-500 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                          </div>
                        )}

                        {/* Hover Delete Button */}
                        {onRemoveFile && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveFile(video.index);
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-black/75 hover:bg-red-600 hover:scale-105 text-zinc-400 hover:text-white rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
                            title={lang === 'id' ? 'Hapus' : 'Delete'}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}

                        {/* Indicator lines */}
                        <div className="absolute bottom-0 left-0 w-full bg-zinc-900/60 h-1">
                          <div className="bg-amber-500 h-full transition-all" style={{ width: `${video.progress}%` }} />
                        </div>
                      </div>

                      {/* Info Area */}
                      <div className="p-3.5 flex flex-col gap-0.5">
                        <p className="text-zinc-700 dark:text-zinc-200 font-bold text-xs truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" title={video.title}>
                          {video.title}
                        </p>
                        <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-medium truncate">
                          {video.artist}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-950/10 text-center min-h-[120px]">
                  <Play size={24} className="text-zinc-400 dark:text-zinc-600 mb-2 stroke-[1.5] animate-pulse duration-[3000ms]" />
                  <p className="text-zinc-500 dark:text-zinc-400 font-bold text-xs">{lang === 'id' ? 'Belum ada riwayat putar.' : 'No recently played media.'}</p>
                </div>
              )}
            </div>

            {/* Saved Loops Section */}
            {preferenceSettings?.showLoopsOnHome !== false && allLoops.length > 0 && (
              <div className="w-full max-w-5xl mx-auto mb-10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-zinc-800 dark:text-zinc-200 font-extrabold text-sm uppercase tracking-widest flex items-center gap-2">
                    <Repeat size={18} className="text-amber-500 shrink-0" />
                    <span>{lang === 'id' ? 'Loop Tersimpan' : 'Saved Loops'}</span>
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 font-mono px-2 py-0.5 rounded-full border border-amber-500/20">
                      {allLoops.reduce((acc, curr) => acc + curr.loops.length, 0)}
                    </span>
                  </h2>
                </div>

                <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
                  {allLoops.map(ld => (
                    ld.loops.map(loop => {
                      const formatTime = (seconds: number) => {
                        const m = Math.floor(seconds / 60);
                        const s = Math.floor(seconds % 60);
                        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                      };
                      
                      const fileName = ld.videoId.split(/[/\\]/).pop() || ld.videoId;

                      return (
                        <div 
                          key={loop.id}
                          className="flex-none w-64 md:w-72 bg-white/80 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-white/10 rounded-2xl overflow-hidden hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all duration-300 group cursor-pointer shadow-sm hover:shadow-md flex flex-col"
                          onClick={() => {
                            if (onLoadLoop) onLoadLoop(ld.videoId, loop);
                          }}
                        >
                          {/* Thumbnail Container */}
                          <div className="relative aspect-video w-full bg-zinc-100 dark:bg-zinc-950 overflow-hidden border-b border-zinc-100 dark:border-zinc-800/50 flex items-center justify-center">
                            {loopThumbnails[loop.id] ? (
                              <img 
                                src={loopThumbnails[loop.id]} 
                                alt={loop.name} 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-600">
                                <Play size={24} className="group-hover:text-amber-500 transition-colors animate-pulse stroke-[1.5]" />
                              </div>
                            )}
                            
                            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-md text-[9px] font-bold text-amber-500 tracking-wider uppercase border border-amber-500/20 shadow-sm">
                              LOOP
                            </div>
                          </div>

                          <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-bold text-zinc-900 dark:text-white text-sm line-clamp-1 group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">
                                  {loop.name}
                                </h3>
                                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded shrink-0">
                                  {formatTime(loop.start)} - {formatTime(loop.end)}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <FileVideo size={13} className="shrink-0 text-zinc-400" />
                                <span className="line-clamp-1 break-all font-medium" title={ld.videoId}>{fileName}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>
            )}

            {/* My Playlists / Widgets Bento section */}
            <div className="w-full max-w-5xl mx-auto mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-zinc-800 dark:text-zinc-200 font-extrabold text-sm uppercase tracking-widest flex items-center gap-2">
                  <ListVideo size={18} className="text-amber-500 shrink-0" />
                  <span>{lang === 'id' ? 'Daftar Putar Saya' : 'My Playlists'}</span>
                  {userPlaylists && userPlaylists.length > 0 && (
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 font-mono px-2 py-0.5 rounded-full border border-amber-500/20">
                      {userPlaylists.length}
                    </span>
                  )}
                </h2>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 w-full">
                {/* Playlists Left list */}
                <div className="xl:col-span-7 flex flex-col gap-3">
                  {userPlaylists && userPlaylists.length > 0 ? (
                    userPlaylists.map((pl, plIdx) => {
                      const plKey = pl.id || String(plIdx);
                      const isExpanded = expandedPlaylists[plKey];
                      return (
                        <div 
                          key={plKey}
                          className="flex flex-col rounded-2xl bg-white/80 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-white/5 hover:border-amber-500/20 dark:hover:border-amber-500/20 transition-all backdrop-blur-md duration-300 overflow-hidden shadow-md dark:shadow-lg animate-fade-in"
                        >
                          {/* Card Header (Click to expand/collapse) */}
                          <div 
                            onClick={() => togglePlaylistExpand(plKey)}
                            className="group flex items-center justify-between p-4 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 shrink-0">
                                <Folder size={20} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-zinc-700 dark:text-zinc-200 font-bold text-sm truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">{pl.name}</div>
                                <div className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-tight mt-0.5">
                                  {pl.files.length} {lang === 'id' ? 'Berkas' : 'Files'}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {onUpdateCollection && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAddFilesPlaylist(pl);
                                    setShowAddFilesModal(true);
                                  }}
                                  className="p-2 bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 rounded-lg transition-all"
                                  title={lang === 'id' ? 'Tambah Berkas' : 'Add Files'}
                                >
                                  <Plus size={12} />
                                </button>
                              )}

                              {onUpdateCollection && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditPlaylistCollection(pl);
                                    setShowEditPlaylistModal(true);
                                  }}
                                  className="p-2 bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 rounded-lg transition-all"
                                  title={lang === 'id' ? 'Edit Playlist' : 'Edit Playlist'}
                                >
                                  <Edit size={12} />
                                </button>
                              )}

                              {onSelectCollection && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectCollection(pl);
                                  }}
                                  className="p-2 bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 rounded-lg transition-all"
                                  title={lang === 'id' ? 'Putar Semua' : 'Play All'}
                                >
                                  <Play size={12} className="fill-current" />
                                </button>
                              )}

                              {onDeleteCollection && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmModal({
                                      isOpen: true,
                                      title: lang === 'id' ? 'Hapus Playlist' : 'Delete Playlist',
                                      message: lang === 'id' 
                                        ? `Apakah Anda yakin ingin menghapus playlist "${pl.name}"?` 
                                        : `Are you sure you want to delete playlist "${pl.name}"?`,
                                      confirmText: lang === 'id' ? 'Hapus' : 'Delete',
                                      cancelText: lang === 'id' ? 'Batal' : 'Cancel',
                                      onConfirm: () => {
                                        onDeleteCollection(pl.id);
                                      }
                                    });
                                  }}
                                  className="p-2 bg-red-500/15 hover:bg-red-500 hover:text-white text-red-500 rounded-lg transition-all shrink-0"
                                  title={lang === 'id' ? 'Hapus Playlist' : 'Delete Playlist'}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}

                              <div className="text-zinc-400 dark:text-zinc-400 p-1">
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </div>
                            </div>
                          </div>

                          {/* Folder contents (Files list) */}
                          {isExpanded && (
                            <div className="border-t border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-black/25 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-850 scrollbar-track-transparent">
                              {pl.files && pl.files.length > 0 ? (
                                <div className="p-2 flex flex-col gap-1">
                                  {pl.files.map((file: any, fileIdx: number) => (
                                    <div 
                                      key={fileIdx}
                                      onClick={() => {
                                        if (onSelectCollection) {
                                          onSelectCollection(pl, fileIdx);
                                        }
                                      }}
                                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-500/10/60 dark:hover:bg-white/5 transition-all cursor-pointer group/file"
                                    >
                                      <div className="p-1.5 bg-zinc-150 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 group-hover/file:text-amber-500 group-hover/file:bg-amber-500/10 dark:group-hover/file:text-amber-500 dark:group-hover/file:bg-amber-500/10 rounded-lg transition-colors shrink-0">
                                        <FileVideo size={12} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-[11px] text-zinc-650 dark:text-zinc-300 font-bold truncate group-hover/file:text-zinc-900 dark:group-hover/file:text-white transition-colors">
                                          {file.name}
                                        </div>
                                        <div className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase mt-0.5 font-semibold">
                                          {file.isStream ? 'Stream' : 'Local'} • {formatBytes(file.size || 0)}
                                        </div>
                                      </div>
                                      <Play size={10} className="text-amber-500 opacity-0 group-hover/file:opacity-100 transition-opacity fill-current" />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="p-4 text-center text-zinc-450 dark:text-zinc-600 text-[11px]">
                                  {lang === 'id' ? 'Tidak ada berkas.' : 'No files.'}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-950/10 text-center min-h-[160px]">
                      <FolderOpen size={32} className="text-zinc-400 dark:text-zinc-600 mb-2 stroke-[1.5]" />
                      <p className="text-zinc-500 dark:text-zinc-400 font-bold text-xs">{t('noSavedCollections', lang)}</p>
                      <p className="text-zinc-400 dark:text-zinc-600 text-[10px] mt-1">
                        {lang === 'id' ? 'Simpan daftar putar dari menu samping saat memutar berkas.' : 'Save playlists from the sidebar when playing files.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Widgets Right list */}
                <div className="xl:col-span-5 flex flex-col gap-3">
                  {/* Video Sniffer Pro Widget */}
                  <div 
                    onClick={() => onShowSniffer()}
                    className="group flex items-center gap-4 p-4 rounded-2xl bg-white/80 dark:bg-transparent dark:bg-gradient-to-r dark:from-[#1d1b1a]/40 dark:to-[#121111]/40 border border-zinc-200/60 dark:border-amber-500/10 hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all hover:scale-[1.01] cursor-pointer backdrop-blur-md shadow-md dark:shadow-lg relative overflow-hidden"
                  >
                    <div className="p-3 bg-amber-500/10 group-hover:bg-amber-500 group-hover:text-black rounded-xl text-amber-500 transition-all relative">
                      <Globe size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-zinc-750 dark:text-zinc-200 font-black text-sm group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">{t('videoSnifferPro', lang)}</div>
                      <div className="text-zinc-400 dark:text-zinc-500 text-[9px] font-bold mt-0.5 tracking-wider uppercase">
                        {lang === 'id' ? 'AMBIL VIDEO DARI WEB' : 'FETCH VIDEO FROM WEB'}
                      </div>
                    </div>
                    
                    {/* Badge */}
                    {(activeDownloadsCount > 0 || completedDownloadsCount > 0) && (
                      <span className={`absolute top-4 right-4 flex h-6 min-w-6 px-1.5 items-center justify-center rounded-full text-xs font-black text-white shadow-sm transition-colors duration-300 ${
                        activeDownloadsCount > 0 
                          ? 'bg-orange-500 animate-pulse' 
                          : 'bg-emerald-500'
                      }`}>
                        {activeDownloadsCount > 0 ? activeDownloadsCount : completedDownloadsCount}
                      </span>
                    )}
                  </div>

                  {/* Open Stream URL Widget */}
                  <div 
                    onClick={onShowNetworkModal}
                    className="group flex items-center gap-4 p-4 rounded-2xl bg-white/80 dark:bg-transparent dark:bg-gradient-to-r dark:from-[#1d1b1a]/40 dark:to-[#121111]/40 border border-zinc-200/60 dark:border-amber-500/10 hover:border-amber-500/30 dark:hover:border-amber-500/30 transition-all hover:scale-[1.01] cursor-pointer backdrop-blur-md shadow-md dark:shadow-lg"
                  >
                    <div className="p-3 bg-amber-500/10 group-hover:bg-amber-500 group-hover:text-black rounded-xl text-amber-500 transition-all">
                      <Link size={20} />
                    </div>
                    <div>
                      <div className="text-zinc-750 dark:text-zinc-200 font-black text-sm group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">{t('openStreamUrl', lang)}</div>
                      <div className="text-zinc-400 dark:text-zinc-500 text-[9px] font-bold mt-0.5 tracking-wider uppercase">
                        M3U8, MP4, & LINK
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        {activeMenu === 'library' && (
          <div className="w-full flex flex-col h-full overflow-hidden animate-fade-in">
            {/* Fixed Header */}
            <div className="w-full shrink-0 px-8 pt-8 pb-4">
              <div className="w-full max-w-5xl mx-auto">
                {/* Top Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-white/5 pb-5">
                  <div>
                    <h1 className="text-xl font-black text-zinc-800 dark:text-white tracking-tight flex items-center gap-2">
                      <Database className="text-amber-500" size={22} />
                      <span>{lang === 'id' ? 'Pustaka Media' : 'Media Library'}</span>
                      <span className="text-xs font-mono bg-amber-500/10 text-amber-500 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                        {playlist.length} {lang === 'id' ? 'Berkas' : 'Files'}
                      </span>
                    </h1>
                  </div>

                  <div className="flex items-center flex-wrap gap-2.5">
                    {/* Sort dropdown/selector */}
                    <div className="flex items-center bg-zinc-100/80 dark:bg-black/40 border border-zinc-200 dark:border-white/5 rounded-xl p-1 text-xs shadow-sm">
                      <span className="text-zinc-450 dark:text-zinc-500 px-2 font-bold">{lang === 'id' ? 'Urutkan:' : 'Sort by:'}</span>
                      {(['name', 'size', 'type'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setSortType(type)}
                          className={`px-3 py-1.5 rounded-lg font-bold transition-all capitalize ${sortType === type ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/5'}`}
                        >
                          {type === 'name' ? (lang === 'id' ? 'Nama' : 'Name') : type === 'size' ? (lang === 'id' ? 'Ukuran' : 'Size') : (lang === 'id' ? 'Tipe' : 'Type')}
                        </button>
                      ))}
                    </div>

                    {/* View switcher */}
                    <div className="flex items-center bg-zinc-100/80 dark:bg-black/40 border border-zinc-200 dark:border-white/5 rounded-xl p-1 text-xs shadow-sm">
                      <span className="text-zinc-450 dark:text-zinc-500 px-2 font-bold">{lang === 'id' ? 'Tampilan:' : 'View as:'}</span>
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded-lg font-bold transition-all ${viewMode === 'grid' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/5'}`}
                        title={lang === 'id' ? 'Tampilan Grid' : 'Grid View'}
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-lg font-bold transition-all ${viewMode === 'list' ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/5'}`}
                        title={lang === 'id' ? 'Tampilan Daftar' : 'List View'}
                      >
                        <List size={16} />
                      </button>
                    </div>

                    {/* Clear All Media Action */}
                    {playlist.length > 0 && (onSetPlaylist || onRemoveFile) && (
                      <button
                        id="clear-all-media-library-btn"
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: lang === 'id' ? 'Hapus Semua Pustaka Media' : 'Clear Media Library',
                            message: lang === 'id' 
                              ? 'Apakah Anda yakin ingin menghapus semua berkas dari Pustaka Media?' 
                              : 'Are you sure you want to clear all files from the Media Library?',
                            confirmText: lang === 'id' ? 'Ya, Hapus Semua' : 'Yes, Clear All',
                            cancelText: lang === 'id' ? 'Batal' : 'Cancel',
                            onConfirm: () => {
                              if (onSetPlaylist) {
                                onSetPlaylist([]);
                              } else if (onRemoveFile) {
                                for (let i = playlist.length - 1; i >= 0; i--) {
                                  onRemoveFile(i);
                                }
                              }
                            }
                          });
                        }}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md hover:scale-105 cursor-pointer"
                        title={lang === 'id' ? 'Hapus Semua Berkas' : 'Clear All Files'}
                      >
                        <Trash2 size={14} />
                        <span>{lang === 'id' ? 'Hapus Semua' : 'Clear All'}</span>
                      </button>
                    )}

                    {/* Add Media Action */}
                    <label className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black py-2.5 px-4 rounded-xl font-black text-xs shadow-lg hover:shadow-amber-500/20 transition-all hover:scale-[1.02] cursor-pointer tracking-wide uppercase">
                      <Plus size={14} className="stroke-[3]" />
                      <span>{lang === 'id' ? 'Tambah Media' : 'Add Media'}</span>
                      <input type="file" accept="video/*,audio/*,.ts,.m3u8,.m3u" multiple className="hidden" onChange={onFileChange} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8 pt-2">
              <div className="w-full max-w-5xl mx-auto">
                {/* Media Items */}
            {sortedAndFilteredPlaylist.length > 0 ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {sortedAndFilteredPlaylist.map((item) => {
                    const fileKey = (item.file as any).path || (item.file as any).fullPath || (item.file.name + item.file.size);
                    const thumbnail = thumbnails[fileKey] || '';
                    return (
                      <div 
                        key={item.originalIndex}
                        onClick={() => onPlayIndex?.(item.originalIndex)}
                        className="group relative flex flex-col bg-white/80 dark:bg-zinc-950/40 border border-zinc-200/50 dark:border-white/5 hover:border-amber-500/30 dark:hover:border-amber-500/30 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-md dark:shadow-lg cursor-pointer backdrop-blur-md"
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video w-full flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-900 dark:to-zinc-950">
                          {thumbnail ? (
                            <img 
                              src={thumbnail} 
                              alt={item.file.name} 
                              onError={() => {
                                if (onInvalidateThumbnail) {
                                  onInvalidateThumbnail(fileKey);
                                }
                              }}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                            />
                          ) : (
                            <div className="absolute inset-0 bg-black/5 dark:bg-black/20 flex items-center justify-center group-hover:bg-black/35 transition-colors">
                              <Play size={28} className="text-amber-500 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                            </div>
                          )}
                        </div>

                        {/* Text details & Delete Button */}
                        <div className="p-4 flex flex-col gap-1 relative pr-12">
                          <p className="text-zinc-700 dark:text-zinc-200 font-bold text-xs truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold flex items-center gap-1.5 uppercase tracking-wide">
                            <span>{formatBytes(item.file.size)}</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></span>
                            <span className="truncate max-w-[60px]">{item.file.name.split('.').pop() || 'Unknown'}</span>
                          </p>

                          {/* Delete Button (Only removes from media library, not from disk) */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onRemoveFile) onRemoveFile(item.originalIndex);
                            }}
                            className="absolute right-3.5 bottom-3.5 p-2 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 rounded-xl transition-all border border-red-500/20"
                            title={lang === 'id' ? 'Hapus dari Pustaka' : 'Remove from Library'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {sortedAndFilteredPlaylist.map((item) => {
                    const fileKey = (item.file as any).path || (item.file as any).fullPath || (item.file.name + item.file.size);
                    const thumbnail = thumbnails[fileKey] || '';
                    return (
                      <div 
                        key={item.originalIndex}
                        onClick={() => onPlayIndex?.(item.originalIndex)}
                        className="group flex items-center gap-4 p-3 rounded-2xl bg-white/80 dark:bg-zinc-950/20 border border-zinc-200/50 dark:border-white/5 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 hover:border-amber-500/20 dark:hover:border-amber-500/20 transition-all cursor-pointer backdrop-blur-md shadow-sm dark:shadow-md"
                      >
                        {/* Thumbnail Icon */}
                        <div className="w-20 h-12 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-zinc-200 to-zinc-350 dark:from-zinc-900 dark:to-zinc-950 flex items-center justify-center relative">
                          {thumbnail ? (
                            <img 
                              src={thumbnail} 
                              alt={item.file.name} 
                              onError={() => {
                                if (onInvalidateThumbnail) {
                                  onInvalidateThumbnail(fileKey);
                                }
                              }}
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <Play size={18} className="text-amber-500/60" />
                          )}
                        </div>

                        {/* Title and details */}
                        <div className="flex-1 overflow-hidden">
                          <div className="text-zinc-700 dark:text-zinc-200 font-bold text-sm truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" title={item.file.name}>
                            {item.file.name}
                          </div>
                          <div className="text-zinc-400 dark:text-zinc-500 text-xs mt-0.5 flex items-center gap-2 font-semibold">
                            <span>{formatBytes(item.file.size)}</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-800"></span>
                            <span className="uppercase">{item.file.name.split('.').pop() || 'Unknown'}</span>
                          </div>
                        </div>

                        {/* Delete Action button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onRemoveFile) onRemoveFile(item.originalIndex);
                          }}
                          className="p-2.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-500 rounded-xl transition-all border border-red-500/20 mr-2"
                          title={lang === 'id' ? 'Hapus dari Pustaka' : 'Remove from Library'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-950/10 text-center min-h-[300px]">
                <FileVideo size={48} className="text-zinc-400 dark:text-zinc-600 mb-3 stroke-[1.5] animate-pulse duration-[3000ms]" />
                <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm">{lang === 'id' ? 'Pustaka media masih kosong.' : 'Media library is currently empty.'}</p>
                <p className="text-zinc-400 dark:text-zinc-600 text-xs mt-1.5 max-w-sm">
                  {lang === 'id' ? 'Klik tombol Tambah Media di atas atau seret berkas ke sini untuk mulai memutar.' : 'Click Add Media above or drag files here to start playing.'}
                </p>
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'playlists' && (
          <div className="w-full flex flex-col h-full overflow-hidden animate-fade-in">
            {/* Fixed Header */}
            <div className="w-full shrink-0 px-8 pt-8 pb-4">
              <div className="w-full max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-200/60 dark:border-white/5 pb-4">
                  <h1 className="text-xl font-black text-zinc-800 dark:text-white tracking-tight flex items-center gap-2">
                    <ListVideo className="text-amber-500" size={22} />
                    <span>{lang === 'id' ? 'Daftar Putar Saya' : 'My Playlists'}</span>
                  </h1>
                  <button 
                    onClick={() => setShowCreatePlaylistModal(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg hover:scale-105"
                  >
                    <Plus size={14} />
                    <span>{lang === 'id' ? 'Tambah Playlist' : 'Add Playlist'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8 pt-2">
              <div className="w-full max-w-5xl mx-auto">
                {/* Collections list */}
            {userPlaylists && userPlaylists.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {userPlaylists.map((pl, plIdx) => {
                  const plKey = pl.id || String(plIdx);
                  const isExpanded = expandedPlaylists[plKey];
                  return (
                    <div 
                      key={plKey}
                      className="flex flex-col rounded-2xl bg-white/80 dark:bg-zinc-950/30 border border-zinc-200/50 dark:border-white/5 hover:border-amber-500/20 dark:hover:border-amber-500/20 transition-all backdrop-blur-md duration-300 overflow-hidden shadow-md dark:shadow-lg"
                    >
                      {/* Card Header (Click to expand/collapse) */}
                      <div 
                        onClick={() => togglePlaylistExpand(plKey)}
                        className="group flex items-center justify-between p-5 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-500 shrink-0">
                            <Folder size={20} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-zinc-700 dark:text-zinc-200 font-bold text-sm truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">{pl.name}</div>
                            <div className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-tight mt-0.5">
                              {pl.files.length} {lang === 'id' ? 'Berkas' : 'Files'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {onUpdateCollection && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddFilesPlaylist(pl);
                                setShowAddFilesModal(true);
                              }}
                              className="p-2 bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 rounded-lg transition-all"
                              title={lang === 'id' ? 'Tambah Berkas' : 'Add Files'}
                            >
                              <Plus size={12} />
                            </button>
                          )}

                          {onUpdateCollection && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditPlaylistCollection(pl);
                                setShowEditPlaylistModal(true);
                              }}
                              className="p-2 bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 rounded-lg transition-all"
                              title={lang === 'id' ? 'Edit Playlist' : 'Edit Playlist'}
                            >
                              <Edit size={12} />
                            </button>
                          )}

                          {onSelectCollection && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCollection(pl);
                              }}
                              className="p-2 bg-amber-500/10 hover:bg-amber-500 hover:text-black text-amber-500 rounded-lg transition-all"
                              title={lang === 'id' ? 'Putar Semua' : 'Play All'}
                            >
                              <Play size={12} className="fill-current" />
                            </button>
                          )}

                          {onDeleteCollection && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmModal({
                                  isOpen: true,
                                  title: lang === 'id' ? 'Hapus Playlist' : 'Delete Playlist',
                                  message: lang === 'id' 
                                    ? `Apakah Anda yakin ingin menghapus playlist "${pl.name}"?` 
                                    : `Are you sure you want to delete playlist "${pl.name}"?`,
                                  confirmText: lang === 'id' ? 'Hapus' : 'Delete',
                                  cancelText: lang === 'id' ? 'Batal' : 'Cancel',
                                  onConfirm: () => {
                                    onDeleteCollection(pl.id);
                                  }
                                });
                              }}
                              className="p-2 bg-red-500/15 hover:bg-red-500 hover:text-white text-red-500 rounded-lg transition-all shrink-0"
                              title={lang === 'id' ? 'Hapus Playlist' : 'Delete Playlist'}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}

                          <div className="text-zinc-405 dark:text-zinc-400 p-1">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </div>
                        </div>
                      </div>

                      {/* Folder contents (Files list) */}
                      {isExpanded && (
                        <div className="border-t border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-black/25 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-850 scrollbar-track-transparent">
                          {pl.files && pl.files.length > 0 ? (
                            <div className="p-2 flex flex-col gap-1">
                              {pl.files.map((file: any, fileIdx: number) => (
                                <div 
                                  key={fileIdx}
                                  onClick={() => {
                                    if (onSelectCollection) {
                                      onSelectCollection(pl, fileIdx);
                                    }
                                  }}
                                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-500/10/60 dark:hover:bg-white/5 transition-all cursor-pointer group/file"
                                >
                                  <div className="p-1.5 bg-zinc-150 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 group-hover/file:text-amber-500 group-hover/file:bg-amber-500/10 dark:group-hover/file:text-amber-500 dark:group-hover/file:bg-amber-500/10 rounded-lg transition-colors shrink-0">
                                    <FileVideo size={12} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[11px] text-zinc-650 dark:text-zinc-300 font-bold truncate group-hover/file:text-zinc-900 dark:group-hover/file:text-white transition-colors">
                                      {file.name}
                                    </div>
                                    <div className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase mt-0.5 font-semibold">
                                      {file.isStream ? 'Stream' : 'Local'} • {formatBytes(file.size || 0)}
                                    </div>
                                  </div>
                                  <Play size={10} className="text-amber-500 opacity-0 group-hover/file:opacity-100 transition-opacity fill-current" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 text-center text-zinc-450 dark:text-zinc-600 text-[11px]">
                              {lang === 'id' ? 'Tidak ada berkas.' : 'No files.'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-950/10 text-center min-h-[240px]">
                <FolderOpen size={48} className="text-zinc-400 dark:text-zinc-600 mb-3 stroke-[1.5]" />
                <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm">{t('noSavedCollections', lang)}</p>
                <p className="text-zinc-400 dark:text-zinc-600 text-xs mt-1.5 max-w-md">
                  {lang === 'id' ? 'Simpan daftar putar dari menu samping saat memutar berkas.' : 'Save playlists from the sidebar when playing files.'}
                </p>
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'queue' && (
          <div className="w-full flex flex-col h-full overflow-hidden animate-fade-in">
            {/* Fixed Header */}
            <div className="w-full shrink-0 px-8 pt-8 pb-4">
              <div className="w-full max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-200/60 dark:border-white/5 pb-4 gap-4">
                  <div>
                    <h1 className="text-xl font-black text-zinc-800 dark:text-white tracking-tight flex items-center gap-2">
                      <List className="text-amber-500" size={22} />
                      <span>{lang === 'id' ? 'Antrean Putar' : 'Play Queue'}</span>
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1.5 font-semibold">
                      {t('playQueueDesc', lang)}
                    </p>
                  </div>

                  {playQueueCollection && playQueueCollection.files && playQueueCollection.files.length > 0 && (
                    <button 
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: t('clearPlayQueue', lang),
                          message: lang === 'id' 
                            ? 'Apakah Anda yakin ingin mengosongkan semua berkas di Antrean Putar?' 
                            : 'Are you sure you want to clear all files in the Play Queue?',
                          confirmText: lang === 'id' ? 'Kosongkan' : 'Clear',
                          cancelText: lang === 'id' ? 'Batal' : 'Cancel',
                          onConfirm: async () => {
                            if (onUpdateCollection && playQueueCollection) {
                              const updated = {
                                ...playQueueCollection,
                                files: [],
                                createdAt: Date.now()
                              };
                              onUpdateCollection(updated);
                            }
                          }
                        });
                      }}
                      className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 font-black text-xs px-4 py-2.5 rounded-xl transition-all shadow-md hover:scale-105"
                    >
                      <Trash2 size={14} />
                      <span>{lang === 'id' ? 'Kosongkan' : 'Clear All'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8 pt-2">
              <div className="w-full max-w-5xl mx-auto">
                {/* List of files */}
                {playQueueCollection && playQueueCollection.files && playQueueCollection.files.length > 0 ? (
                  <div className="flex flex-col gap-2">
                {playQueueCollection.files.map((file: any, fileIdx: number) => {
                  return (
                    <div 
                      key={fileIdx}
                      onClick={() => {
                        if (onSelectCollection) {
                          onSelectCollection(playQueueCollection, fileIdx);
                        }
                      }}
                      className="group flex items-center justify-between p-4 bg-white/80 dark:bg-zinc-950/30 hover:bg-zinc-500/10 dark:hover:bg-white/5 rounded-2xl border border-zinc-200/50 dark:border-white/5 hover:border-amber-500/20 dark:hover:border-amber-500/20 transition-all duration-300 cursor-pointer"
                    >
                      <div className="flex items-center gap-4 text-left min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-black transition-all shrink-0">
                          <Play size={18} fill="currentColor" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-zinc-900 dark:text-white font-bold text-sm truncate group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors" title={file.name}>
                            {file.name}
                          </h3>
                          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1 font-semibold">
                            {file.isStream ? 'Stream' : 'Local'} • {formatBytes(file.size || 0)}
                          </p>
                        </div>
                      </div>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onUpdateCollection && playQueueCollection) {
                            const updatedFiles = playQueueCollection.files.filter((_: any, idx: number) => idx !== fileIdx);
                            const updated = {
                              ...playQueueCollection,
                              files: updatedFiles,
                              createdAt: Date.now()
                            };
                            onUpdateCollection(updated);
                          }
                        }}
                        className="p-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all shrink-0"
                        title={lang === 'id' ? 'Hapus' : 'Delete'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800/40 bg-zinc-100/50 dark:bg-zinc-950/10 text-center min-h-[240px]">
                <List size={48} className="text-zinc-400 dark:text-zinc-600 mb-3 stroke-[1.5]" />
                <p className="text-zinc-500 dark:text-zinc-400 font-bold text-sm">{lang === 'id' ? 'Antrean putar masih kosong.' : 'Play queue is currently empty.'}</p>
                <p className="text-zinc-400 dark:text-zinc-600 text-xs mt-1.5 max-w-md">
                  {lang === 'id' ? 'Semua berkas yang Anda buka lewat cara apa pun otomatis ditambahkan ke sini.' : 'Any files you open through any method will automatically be added here.'}
                </p>
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        {/* Create Playlist Modal */}
        <CreatePlaylistModal 
          show={showCreatePlaylistModal}
          availableFiles={playlist}
          onCancel={() => setShowCreatePlaylistModal(false)}
          onSave={(name, files) => {
            if (onCreatePlaylist) {
              onCreatePlaylist(name, files);
            }
            setShowCreatePlaylistModal(false);
          }}
          lang={lang}
        />

        {/* Add Files To Playlist Modal */}
        {addFilesPlaylist && (
          <AddFilesToPlaylistModal 
            show={showAddFilesModal}
            playlistName={addFilesPlaylist.name}
            availableFiles={playlist}
            onCancel={() => {
              setShowAddFilesModal(false);
              setAddFilesPlaylist(null);
            }}
            onAdd={(newFiles) => {
              if (onUpdateCollection && addFilesPlaylist) {
                const updated: SavedCollection = {
                  ...addFilesPlaylist,
                  files: [...addFilesPlaylist.files, ...newFiles]
                };
                onUpdateCollection(updated);
              }
              setShowAddFilesModal(false);
              setAddFilesPlaylist(null);
            }}
            lang={lang}
          />
        )}

        {/* Edit Playlist Modal */}
        {editPlaylistCollection && (
          <EditPlaylistModal 
            show={showEditPlaylistModal}
            collection={editPlaylistCollection}
            onCancel={() => {
              setShowEditPlaylistModal(false);
              setEditPlaylistCollection(null);
            }}
            onSave={(updated) => {
              if (onUpdateCollection) {
                onUpdateCollection(updated);
              }
              setShowEditPlaylistModal(false);
              setEditPlaylistCollection(null);
            }}
            lang={lang}
          />
        )}

        {/* Custom Confirmation Modal */}
        <AnimatePresence>
          {confirmModal.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="absolute inset-0 bg-black/40 dark:bg-black/80 backdrop-blur-md"
              />
              
              {/* Modal Card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ type: "spring", duration: 0.4 }}
                className="relative w-full max-w-md bg-white/95 dark:bg-zinc-950/95 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-6 overflow-hidden z-10"
              >
                {/* Glow Accent Header */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500" />
                
                <div className="flex items-start gap-4 mb-5">
                  <div className="flex-shrink-0 w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                    <AlertCircle size={22} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
                      {confirmModal.title}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                      {confirmModal.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 mt-6">
                  <button
                    onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2.5 bg-zinc-100/80 hover:bg-zinc-200 dark:bg-zinc-900/80 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs uppercase tracking-widest rounded-xl border border-zinc-200 dark:border-zinc-800 transition-all cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700 active:scale-95"
                  >
                    {confirmModal.cancelText || (lang === 'id' ? 'Batal' : 'Cancel')}
                  </button>
                  <button
                    onClick={() => {
                      confirmModal.onConfirm();
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    }}
                    className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-orange-950/20 hover:shadow-orange-950/30 transition-all cursor-pointer active:scale-95"
                  >
                    {confirmModal.confirmText || (lang === 'id' ? 'Hapus' : 'Delete')}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
