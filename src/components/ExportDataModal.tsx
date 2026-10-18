import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Download, CheckSquare, Square, ChevronDown, ChevronUp, 
  Settings, Clock, Repeat, Bookmark as BookmarkIcon, History, 
  Key, Film, Image as ImageIcon, ListMusic, MapPin, Search, 
  Eye, EyeOff, Check, Loader2, AlertCircle, FileText,
  ShieldCheck, Lock, Unlock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { dbService, SavedLoop, VideoMarker, SavedCollection, Bookmark, WebHistoryItem, SavedCredential, VideoHistoryItem } from '../services/db';
import { getLocalDateString } from '../services/fileUtils';
import { Language, t } from '../services/i18n';
import { encryptBackupData } from '../services/cryptoUtils';

export interface ExportDataModalProps {
  show: boolean;
  onClose: () => void;
  lang?: Language;
  onSuccessNotice?: (message: string) => void;
}

interface StoreItemSummary {
  storeName: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  count: number;
  description: string;
  entries: { key: any; value: any }[];
}

function formatDuration(seconds?: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const ExportDataModal: React.FC<ExportDataModalProps> = ({
  show,
  onClose,
  lang = 'id',
  onSuccessNotice
}) => {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedStores, setSelectedStores] = useState<Record<string, boolean>>({});
  const [expandedStores, setExpandedStores] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [storeData, setStoreData] = useState<Record<string, { key: any; value: any }[]>>({});
  
  // Master Password AES-256 states
  const [enableEncryption, setEnableEncryption] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [encryptionError, setEncryptionError] = useState<string | null>(null);

  // Fetch all store data on open
  useEffect(() => {
    if (!show) return;

    let isMounted = true;
    setLoading(true);

    const loadAllStores = async () => {
      const stores = [
        'settings',
        'progress',
        'loops',
        'markers',
        'collections',
        'webHistory',
        'bookmarks',
        'passwords',
        'videoHistory',
        'metadata',
        'thumbnails'
      ];

      const loaded: Record<string, { key: any; value: any }[]> = {};
      const initialSelected: Record<string, boolean> = {};

      for (const s of stores) {
        try {
          const entries = await dbService.getAllEntriesFromStore(s);
          loaded[s] = entries || [];
          // Pre-select all stores except thumbnails if thumbnails are heavy
          if (s === 'thumbnails') {
            initialSelected[s] = entries.length > 0 && entries.length <= 100;
          } else {
            initialSelected[s] = entries.length > 0;
          }
        } catch (e) {
          console.error(`Failed to read store ${s}:`, e);
          loaded[s] = [];
          initialSelected[s] = false;
        }
      }

      if (isMounted) {
        setStoreData(loaded);
        setSelectedStores(initialSelected);
        setLoading(false);
      }
    };

    loadAllStores();

    return () => {
      isMounted = false;
    };
  }, [show]);

  const toggleSelectStore = (storeName: string) => {
    setSelectedStores(prev => ({
      ...prev,
      [storeName]: !prev[storeName]
    }));
  };

  const toggleExpandStore = (storeName: string) => {
    setExpandedStores(prev => ({
      ...prev,
      [storeName]: !prev[storeName]
    }));
  };

  const handleSelectAll = () => {
    const updated: Record<string, boolean> = {};
    Object.keys(storeData).forEach(k => {
      if (storeData[k]?.length > 0) {
        updated[k] = true;
      }
    });
    setSelectedStores(updated);
  };

  const handleDeselectAll = () => {
    const updated: Record<string, boolean> = {};
    Object.keys(storeData).forEach(k => {
      updated[k] = false;
    });
    setSelectedStores(updated);
  };

  // Summaries per store
  const storeSummaries: StoreItemSummary[] = useMemo(() => {
    const isId = lang === 'id';
    return [
      {
        storeName: 'settings',
        title: isId ? 'Pengaturan & Preferensi' : 'Settings & Preferences',
        icon: <Settings size={18} />,
        color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20',
        count: storeData['settings']?.length || 0,
        description: isId ? 'Konfigurasi tampilan, player, video, audio, & subtitle' : 'Appearance, player, video, audio, & subtitle configurations',
        entries: storeData['settings'] || []
      },
      {
        storeName: 'progress',
        title: isId ? 'Riwayat Progres Resume' : 'Resume & Playback Progress',
        icon: <Clock size={18} />,
        color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20',
        count: storeData['progress']?.length || 0,
        description: isId ? 'Posisi menit/detik terakhir video yang ditonton' : 'Saved playback timestamp for videos',
        entries: storeData['progress'] || []
      },
      {
        storeName: 'loops',
        title: isId ? 'A-B Loop Segmen' : 'A-B Loop Segments',
        icon: <Repeat size={18} />,
        color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        count: (storeData['loops'] || []).reduce((acc, curr) => {
          if (Array.isArray(curr.value)) return acc + curr.value.length;
          return acc + (curr.value ? 1 : 0);
        }, 0),
        description: isId ? 'Titik segmen pengulangan A-B beserta file dan judul' : 'Saved A-B loop intervals with file paths and names',
        entries: storeData['loops'] || []
      },
      {
        storeName: 'markers',
        title: isId ? 'Penanda Waktu (Markers)' : 'Video Markers',
        icon: <MapPin size={18} />,
        color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/20',
        count: (storeData['markers'] || []).reduce((acc, curr) => {
          if (Array.isArray(curr.value)) return acc + curr.value.length;
          return acc + (curr.value ? 1 : 0);
        }, 0),
        description: isId ? 'Penanda stempel waktu dan label adegan video' : 'Scene timestamps and custom labels',
        entries: storeData['markers'] || []
      },
      {
        storeName: 'collections',
        title: isId ? 'Daftar Putar (Playlists)' : 'Custom Playlists',
        icon: <ListMusic size={18} />,
        color: 'text-pink-600 dark:text-pink-400 bg-pink-500/10 border-pink-500/20',
        count: storeData['collections']?.length || 0,
        description: isId ? 'Koleksi playlist tersimpan beserta daftar berkas' : 'Saved playlist collections and file entries',
        entries: storeData['collections'] || []
      },
      {
        storeName: 'webHistory',
        title: isId ? 'Riwayat Web Browser' : 'Web Browser History',
        icon: <History size={18} />,
        color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
        count: storeData['webHistory']?.length || 0,
        description: isId ? 'Daftar situs web yang pernah dikunjungi dan waktu akses' : 'Visited websites, page titles, and timestamps',
        entries: storeData['webHistory'] || []
      },
      {
        storeName: 'bookmarks',
        title: isId ? 'Markah Web (Bookmarks)' : 'Web Bookmarks',
        icon: <BookmarkIcon size={18} />,
        color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20',
        count: storeData['bookmarks']?.length || 0,
        description: isId ? 'Situs favorit dan folder bookmark' : 'Saved favorite websites and folders',
        entries: storeData['bookmarks'] || []
      },
      {
        storeName: 'passwords',
        title: isId ? 'Kredensial & Sandi Tersimpan' : 'Saved Passwords & Vault',
        icon: <Key size={18} />,
        color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20',
        count: storeData['passwords']?.length || 0,
        description: isId ? 'Data login situs web (username & sandi terproteksi)' : 'Saved web logins and account credentials',
        entries: storeData['passwords'] || []
      },
      {
        storeName: 'videoHistory',
        title: isId ? 'Riwayat Media Web Sniffer' : 'Sniffed Media History',
        icon: <Film size={18} />,
        color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
        count: storeData['videoHistory']?.length || 0,
        description: isId ? 'Tautan stream video/audio hasil tangkapan web' : 'Sniffed media streams and page sources',
        entries: storeData['videoHistory'] || []
      },
      {
        storeName: 'metadata',
        title: isId ? 'Metadata Video & Poster' : 'Video Metadata & Posters',
        icon: <FileText size={18} />,
        color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20',
        count: storeData['metadata']?.length || 0,
        description: isId ? 'Informasi judul kustom dan poster video' : 'Custom video titles and poster associations',
        entries: storeData['metadata'] || []
      },
      {
        storeName: 'thumbnails',
        title: isId ? 'Sampul & Thumbnail Cache' : 'Thumbnails & Cover Cache',
        icon: <ImageIcon size={18} />,
        color: 'text-amber-600 dark:text-yellow-400 bg-amber-500/10 border-amber-500/20',
        count: storeData['thumbnails']?.length || 0,
        description: isId ? 'Cache visual thumbnail video & lagu (ukuran file lebih besar)' : 'Visual thumbnail cache (increases backup file size)',
        entries: storeData['thumbnails'] || []
      }
    ];
  }, [storeData, lang]);

  // Selected count calculation
  const selectedCount = useMemo(() => {
    return Object.values(selectedStores).filter(Boolean).length;
  }, [selectedStores]);

  const totalItemsSelected = useMemo(() => {
    let total = 0;
    storeSummaries.forEach(s => {
      if (selectedStores[s.storeName]) {
        total += s.count;
      }
    });
    return total;
  }, [storeSummaries, selectedStores]);

  // Filtered store summaries by search
  const filteredSummaries = useMemo(() => {
    if (!searchQuery.trim()) return storeSummaries;
    const q = searchQuery.toLowerCase().trim();
    return storeSummaries.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.description.toLowerCase().includes(q) ||
      s.storeName.toLowerCase().includes(q)
    );
  }, [storeSummaries, searchQuery]);

  // Execute export of only selected stores
  const handlePerformExport = async () => {
    if (selectedCount === 0) return;
    setEncryptionError(null);

    // Validate master password if encryption is enabled
    if (enableEncryption) {
      if (!masterPassword || masterPassword.length < 4) {
        setEncryptionError(lang === 'en' ? 'Master password must be at least 4 characters.' : 'Kata sandi master minimal 4 karakter.');
        return;
      }
      if (masterPassword !== confirmMasterPassword) {
        setEncryptionError(lang === 'en' ? 'Master passwords do not match.' : 'Konfirmasi kata sandi master tidak cocok.');
        return;
      }
    }

    setExporting(true);

    try {
      const exportObject: Record<string, any> = {};
      const chosenStoreNames = Object.keys(selectedStores).filter(k => selectedStores[k]);

      // Populate selected data
      for (const storeName of chosenStoreNames) {
        exportObject[storeName] = storeData[storeName] || [];
      }

      // Add clean metadata header
      const metadata = {
        app: 'NightHUB Player',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        categories: chosenStoreNames,
        isEncrypted: enableEncryption,
        encryptionAlgorithm: enableEncryption ? 'AES-256-GCM' : 'none',
        counts: chosenStoreNames.reduce((acc, k) => {
          acc[k] = storeData[k]?.length || 0;
          return acc;
        }, {} as Record<string, number>)
      };
      exportObject._exportMetadata = metadata;

      let finalExportPayload: any = exportObject;
      if (enableEncryption) {
        finalExportPayload = await encryptBackupData(exportObject, masterPassword, passwordHint, metadata);
      }

      const jsonStr = JSON.stringify(finalExportPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const localDate = getLocalDateString();
      const fileName = enableEncryption 
        ? `nighthub_encrypted_backup_${localDate}.json`
        : `nighthub_backup_${localDate}.json`;

      const isElectron = !!((window as any).electron || (window as any).require?.('electron'));
      const ipc = (window as any).electron?.ipcRenderer || (window as any).require?.('electron')?.ipcRenderer;

      if (isElectron && ipc && typeof ipc.invoke === 'function') {
        const arrayBuffer = await blob.arrayBuffer();
        let base64 = '';
        if (typeof Buffer !== 'undefined') {
          base64 = Buffer.from(arrayBuffer).toString('base64');
        } else {
          base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        }

        const res = await ipc.invoke('save-file', {
          fileName,
          data: base64,
          contentType: 'application/json',
          options: {
            description: enableEncryption
              ? (lang === 'en' ? 'Encrypted Database Backup (*.json)' : 'Cadangan Database Terenkripsi AES-256 (*.json)')
              : (lang === 'en' ? 'JSON Database Backup (*.json)' : 'Cadangan Database JSON (*.json)'),
            accept: { 'application/json': ['.json'] }
          }
        });

        if (res && res.cancelled) {
          setExporting(false);
          return;
        }
      } else {
        // Web mode browser download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      const successMsg = enableEncryption
        ? (lang === 'en' 
            ? `Successfully exported and encrypted ${selectedCount} categories with AES-256!` 
            : `Berhasil mengekspor dan mengamankan ${selectedCount} kategori dengan Enkripsi AES-256!`)
        : (lang === 'en' 
            ? `Successfully exported ${selectedCount} categories (${totalItemsSelected} items)!` 
            : `Berhasil mengekspor ${selectedCount} kategori (${totalItemsSelected} data)!`);

      if (onSuccessNotice) {
        onSuccessNotice(successMsg);
      }
      onClose();
    } catch (err: any) {
      console.error('Export error:', err);
      alert(lang === 'en' ? 'Failed to export data: ' + err.message : 'Gagal mengekspor data: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (!show) return null;

  return (
    <div 
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 dark:bg-black/80 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div 
        drag
        dragMomentum={false}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-[#0a0502] border border-black/10 dark:border-white/10 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100 pointer-events-auto"
      >
        {/* Drag handle area */}
        <div className="w-full h-6 cursor-grab active:cursor-grabbing flex justify-center items-center pt-2 shrink-0 bg-transparent select-none">
          <div className="w-12 h-1.5 bg-black/15 dark:bg-white/15 rounded-full" />
        </div>

        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 dark:bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/5 blur-[80px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="px-6 pb-4 pt-1 border-b border-black/10 dark:border-white/10 flex items-center justify-between bg-white/80 dark:bg-[#0a0502]/80 sticky top-0 z-10 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 border border-orange-500/20 dark:border-amber-500/20">
              <Download size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                {lang === 'en' ? 'Select Data to Export' : 'Pilih Data yang Akan Diekspor'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {lang === 'en' 
                  ? 'Inspect details and customize which categories to include in the backup' 
                  : 'Periksa rincian data dan centang kategori yang ingin dicadangkan'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Controls & Search Filter */}
        <div className="px-6 py-3 border-b border-black/5 dark:border-white/5 bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-800 dark:text-zinc-200 border border-black/5 dark:border-white/5 transition-colors flex items-center gap-1.5 active:scale-95"
            >
              <CheckSquare size={14} className="text-orange-500 dark:text-amber-400" />
              <span>{lang === 'en' ? 'Select All' : 'Pilih Semua'}</span>
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-black/5 dark:border-white/5 transition-colors flex items-center gap-1.5 active:scale-95"
            >
              <Square size={14} />
              <span>{lang === 'en' ? 'Deselect All' : 'Batal Semua'}</span>
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={lang === 'en' ? 'Filter categories...' : 'Cari kategori...'}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-orange-500 dark:focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 size={32} className="animate-spin text-orange-500 dark:text-amber-500" />
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{lang === 'en' ? 'Scanning database entries...' : 'Memindai data database...'}</p>
            </div>
          ) : filteredSummaries.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-xs">
              {lang === 'en' ? 'No categories matched your search.' : 'Tidak ada kategori yang cocok dengan pencarian.'}
            </div>
          ) : (
            <>
              {/* Master Password AES-256 Encryption Security Card */}
              <div className={`p-4 rounded-2xl border transition-all mb-3 ${
                enableEncryption 
                  ? 'bg-amber-500/10 dark:bg-amber-500/5 border-amber-500/40 shadow-xs' 
                  : selectedStores['passwords']
                    ? 'bg-orange-500/5 dark:bg-orange-500/5 border-orange-500/30'
                    : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl transition-colors ${
                      enableEncryption 
                        ? 'bg-amber-500 text-black shadow-sm' 
                        : 'bg-black/5 dark:bg-white/5 text-zinc-500 dark:text-zinc-400'
                    }`}>
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {lang === 'en' ? 'Master Password Encryption' : 'Enkripsi Master Password'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-mono font-bold border border-amber-500/30">
                          AES-256-GCM
                        </span>
                        {selectedStores['passwords'] && !enableEncryption && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium animate-pulse border border-orange-500/20">
                            {lang === 'en' ? 'Recommended for Passwords' : 'Direkomendasikan'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                        {lang === 'en'
                          ? 'Lock your backup file with AES-256-GCM so saved credentials and sensitive data cannot be read in plain text.'
                          : 'Kunci file cadangan dengan AES-256-GCM agar password dan data sensitif tidak dapat dibaca dalam bentuk teks biasa.'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => {
                      setEnableEncryption(!enableEncryption);
                      setEncryptionError(null);
                    }}
                    className={`w-12 h-6.5 rounded-full transition-colors relative flex items-center px-0.5 shrink-0 cursor-pointer ${
                      enableEncryption ? 'bg-orange-500 dark:bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                    title={enableEncryption ? (lang === 'en' ? 'Disable encryption' : 'Matikan enkripsi') : (lang === 'en' ? 'Enable encryption' : 'Aktifkan enkripsi')}
                  >
                    <div className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transform transition-transform ${
                      enableEncryption ? 'translate-x-5.5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Expanded Password Input Fields */}
                {enableEncryption && (
                  <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Master Password Input */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                          {lang === 'en' ? 'Master Password' : 'Kata Sandi Master'} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showMasterPassword ? 'text' : 'password'}
                            value={masterPassword}
                            onChange={(e) => {
                              setMasterPassword(e.target.value);
                              setEncryptionError(null);
                            }}
                            placeholder={lang === 'en' ? 'Min. 4 characters...' : 'Minimal 4 karakter...'}
                            className="w-full pl-3 pr-9 py-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500 font-mono transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowMasterPassword(!showMasterPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                          >
                            {showMasterPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Confirm Password Input */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                          {lang === 'en' ? 'Confirm Master Password' : 'Ulangi Kata Sandi Master'} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type={showMasterPassword ? 'text' : 'password'}
                            value={confirmMasterPassword}
                            onChange={(e) => {
                              setConfirmMasterPassword(e.target.value);
                              setEncryptionError(null);
                            }}
                            placeholder={lang === 'en' ? 'Repeat master password...' : 'Ulangi kata sandi master...'}
                            className="w-full pl-3 pr-9 py-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500 font-mono transition-colors"
                          />
                          {confirmMasterPassword && (
                            <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold ${
                              confirmMasterPassword === masterPassword ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {confirmMasterPassword === masterPassword ? '✓' : '✗'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Password Hint */}
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        {lang === 'en' ? 'Password Hint (Optional)' : 'Petunjuk Kata Sandi (Opsional)'}
                      </label>
                      <input
                        type="text"
                        value={passwordHint}
                        onChange={(e) => setPasswordHint(e.target.value)}
                        placeholder={lang === 'en' ? 'E.g. Favorite book or pet name' : 'Misal: Tahun lahir atau nama hewan peliharaan'}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-black/15 dark:border-white/15 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                    </div>

                    {/* Error message if validation fails */}
                    {encryptionError && (
                      <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{encryptionError}</span>
                      </div>
                    )}

                    {/* Encryption Details Info */}
                    <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed flex items-center gap-2">
                      <Lock size={13} className="text-amber-500 shrink-0" />
                      <span>
                        {lang === 'en'
                          ? 'Direnkripsi dengan PBKDF2 (100,000 iterasi) + AES-GCM 256-bit. File cadangan hanya dapat dipulihkan dengan kata sandi ini.'
                          : 'Dienkripsi dengan PBKDF2 (100.000 iterasi) + AES-GCM 256-bit. File cadangan hanya dapat dipulihkan dengan kata sandi ini.'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {filteredSummaries.map((summary) => {
              const isSelected = !!selectedStores[summary.storeName];
              const isExpanded = !!expandedStores[summary.storeName];
              const hasItems = summary.count > 0;

              return (
                <div 
                  key={summary.storeName}
                  className={`rounded-2xl border transition-all ${
                    isSelected 
                      ? 'bg-orange-500/[0.05] dark:bg-amber-500/[0.08] border-orange-500/40 dark:border-amber-500/40 shadow-xs' 
                      : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 opacity-80 hover:opacity-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Category Header Row */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer select-none"
                      onClick={() => toggleSelectStore(summary.storeName)}
                    >
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectStore(summary.storeName);
                        }}
                        className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors border ${
                          isSelected 
                            ? 'bg-orange-500 dark:bg-amber-500 border-orange-500 dark:border-amber-500 text-black shadow-xs' 
                            : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 text-transparent hover:border-orange-500 dark:hover:border-amber-500'
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </button>

                      <div className={`p-2 rounded-xl border ${summary.color}`}>
                        {summary.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold truncate ${isSelected ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                            {summary.title}
                          </span>
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                            hasItems 
                              ? 'bg-orange-500/10 dark:bg-amber-500/10 border-orange-500/30 dark:border-amber-500/30 text-orange-600 dark:text-amber-400 font-semibold' 
                              : 'bg-black/5 dark:bg-zinc-800 border-black/5 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500'
                          }`}>
                            {summary.count} {lang === 'en' ? 'items' : 'data'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {summary.description}
                        </p>
                      </div>
                    </div>

                    {/* Expand/Collapse Button */}
                    {hasItems && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandStore(summary.storeName);
                        }}
                        className="px-2.5 py-1.5 rounded-xl text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center gap-1"
                        title={isExpanded ? (lang === 'en' ? 'Collapse details' : 'Tutup detail') : (lang === 'en' ? 'Expand details' : 'Lihat detail')}
                      >
                        <span className="text-[11px] font-medium">{isExpanded ? (lang === 'en' ? 'Hide' : 'Tutup') : (lang === 'en' ? 'View' : 'Lihat')}</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded Detail Accordion Content */}
                  {isExpanded && hasItems && (
                    <div className="px-4 pb-4 pt-1 border-t border-black/5 dark:border-white/5 bg-zinc-50/70 dark:bg-black/30 rounded-b-2xl">
                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-xs">
                        {renderStoreDetailItems(
                          summary.storeName, 
                          summary.entries, 
                          lang, 
                          revealedPasswords, 
                          (id) => setRevealedPasswords(prev => ({ ...prev, [id]: !prev[id] }))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
        </div>

        {/* Footer Bar */}
        <div className="px-6 py-4 border-t border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#0a0502]/95 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0 z-10 backdrop-blur-md shrink-0">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{selectedCount}</span>
            <span>{lang === 'en' ? 'categories selected' : 'kategori dipilih'}</span>
            <span className="text-zinc-400 dark:text-zinc-600">•</span>
            <span className="font-mono text-orange-600 dark:text-amber-400 font-bold">{totalItemsSelected}</span>
            <span>{lang === 'en' ? 'total records' : 'total catatan data'}</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={exporting}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              {lang === 'en' ? 'Cancel' : 'Batal'}
            </button>
            <button
              type="button"
              onClick={handlePerformExport}
              disabled={exporting || selectedCount === 0}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 dark:bg-amber-500 dark:hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {exporting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{lang === 'en' ? 'Exporting...' : 'Mengekspor...'}</span>
                </>
              ) : (
                <>
                  <Download size={15} />
                  <span>
                    {lang === 'en' 
                      ? `Export Selected (${selectedCount})` 
                      : `Ekspor Terpilih (${selectedCount})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

/**
 * Render detail accordion items based on the store type
 */
function renderStoreDetailItems(
  storeName: string, 
  entries: { key: any; value: any }[], 
  lang: Language,
  revealedPasswords: Record<string, boolean>,
  onToggleRevealPassword: (id: string) => void
) {
  const isId = lang === 'id';

  switch (storeName) {
    case 'settings': {
      return entries.map((entry, idx) => {
        const settingName = String(entry.key);
        let preview = '';
        if (typeof entry.value === 'object' && entry.value !== null) {
          preview = Object.keys(entry.value).slice(0, 4).join(', ') + (Object.keys(entry.value).length > 4 ? '...' : '');
        } else {
          preview = String(entry.value);
        }

        return (
          <div key={idx} className="p-2 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex items-center justify-between gap-2 shadow-xs">
            <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium">{settingName}</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-xs">{preview}</span>
          </div>
        );
      });
    }

    case 'progress': {
      return entries.map((entry, idx) => {
        const rawKey = String(entry.key);
        const fileName = rawKey.split(/[\\/]/).pop() || rawKey;
        const time = typeof entry.value === 'object' ? entry.value?.time : Number(entry.value);
        const dur = typeof entry.value === 'object' ? entry.value?.duration : undefined;

        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shadow-xs">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate" title={rawKey}>{fileName}</p>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate font-mono">{rawKey}</p>
            </div>
            <div className="text-right font-mono text-[11px] text-orange-600 dark:text-amber-400 shrink-0 font-semibold">
              {formatDuration(time)} {dur ? `/ ${formatDuration(dur)}` : ''}
            </div>
          </div>
        );
      });
    }

    case 'loops': {
      return entries.map((entry, idx) => {
        const rawKey = String(entry.key);
        const fileName = rawKey.split(/[\\/]/).pop() || rawKey;
        const loopsList: SavedLoop[] = Array.isArray(entry.value) ? entry.value : [entry.value];

        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 space-y-1.5 shadow-xs">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate" title={rawKey}>
              {fileName}
            </div>
            <div className="space-y-1">
              {loopsList.map((lp, lIdx) => (
                <div key={lIdx} className="flex items-center justify-between text-[11px] bg-zinc-100/70 dark:bg-zinc-950/60 px-2.5 py-1 rounded-lg border border-black/5 dark:border-white/5">
                  <span className="text-zinc-600 dark:text-zinc-400 font-medium">{lp.name || `Loop ${lIdx + 1}`}</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {formatDuration(lp.start)} &rarr; {formatDuration(lp.end)} ({formatDuration(Math.max(0, lp.end - lp.start))})
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      });
    }

    case 'markers': {
      return entries.map((entry, idx) => {
        const rawKey = String(entry.key);
        const fileName = rawKey.split(/[\\/]/).pop() || rawKey;
        const markersList: VideoMarker[] = Array.isArray(entry.value) ? entry.value : [entry.value];

        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 space-y-1.5 shadow-xs">
            <div className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 truncate" title={rawKey}>
              {fileName}
            </div>
            <div className="space-y-1">
              {markersList.map((mk, mIdx) => (
                <div key={mIdx} className="flex items-center justify-between text-[11px] bg-zinc-100/70 dark:bg-zinc-950/60 px-2.5 py-1 rounded-lg border border-black/5 dark:border-white/5">
                  <span className="text-zinc-600 dark:text-zinc-400">{mk.label || `Marker ${mIdx + 1}`}</span>
                  <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">{formatDuration(mk.time)}</span>
                </div>
              ))}
            </div>
          </div>
        );
      });
    }

    case 'collections': {
      return entries.map((entry, idx) => {
        const col: SavedCollection = entry.value;
        const filesCount = col.files?.length || 0;

        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex items-center justify-between gap-2 shadow-xs">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200">{col.name || 'Unnamed Playlist'}</span>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {col.files?.map(f => f.name).slice(0, 3).join(', ')}{filesCount > 3 ? ` +${filesCount - 3} more` : ''}
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 rounded-md font-semibold">
              {filesCount} {isId ? 'berkas' : 'files'}
            </span>
          </div>
        );
      });
    }

    case 'webHistory': {
      return entries.slice(0, 50).map((entry, idx) => {
        const item: WebHistoryItem = entry.value;
        const dateStr = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';

        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex flex-col gap-0.5 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.title || item.url}</span>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 whitespace-nowrap">{dateStr}</span>
            </div>
            <span className="text-[10px] text-cyan-600 dark:text-cyan-400/80 font-mono truncate">{item.url}</span>
          </div>
        );
      });
    }

    case 'bookmarks': {
      return entries.map((entry, idx) => {
        const b: Bookmark = entry.value;
        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex items-center justify-between gap-2 shadow-xs">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-zinc-800 dark:text-zinc-200">{b.title}</span>
              {b.url && <p className="text-[10px] text-orange-600 dark:text-orange-400/80 font-mono truncate mt-0.5">{b.url}</p>}
            </div>
            {b.type === 'folder' && (
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-black/5 dark:border-zinc-700 font-semibold">
                Folder
              </span>
            )}
          </div>
        );
      });
    }

    case 'passwords': {
      return entries.map((entry, idx) => {
        const cred: SavedCredential = entry.value;
        const isRevealed = !!revealedPasswords[cred.id];

        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex items-center justify-between gap-3 shadow-xs">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-600 dark:text-rose-400 text-xs">{cred.url}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>User: <strong className="text-zinc-800 dark:text-zinc-200">{cred.username}</strong></span>
                <span>•</span>
                <span className="font-mono">
                  Sandi: {isRevealed ? cred.password : '••••••••'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleRevealPassword(cred.id)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
              title={isRevealed ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
            >
              {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        );
      });
    }

    case 'videoHistory': {
      return entries.slice(0, 30).map((entry, idx) => {
        const item: VideoHistoryItem = entry.value;
        return (
          <div key={idx} className="p-2.5 rounded-xl bg-white dark:bg-zinc-900/80 border border-black/5 dark:border-white/5 flex flex-col gap-0.5 shadow-xs">
            <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.title || item.url}</span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400/80 font-mono truncate">{item.url}</span>
          </div>
        );
      });
    }

    case 'thumbnails': {
      return (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-400 text-xs space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertCircle size={14} />
            {isId ? 'Catatan Ukuran File Cadangan:' : 'Backup File Size Notice:'}
          </p>
          <p className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {isId 
              ? `Terdapat ${entries.length} gambar sampul video dan lagu. Mencadangkan thumbnail akan memperbesar ukuran berkas JSON cadangan. Anda dapat menghapus centang jika hanya ingin mencadangkan data teks yang ringan.` 
              : `There are ${entries.length} cached cover images. Including thumbnails will significantly increase the JSON backup file size. You may uncheck this to keep the file lightweight.`}
          </p>
        </div>
      );
    }

    default: {
      return (
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 italic p-2">
          {entries.length} {isId ? 'item tersimpan.' : 'records stored.'}
        </div>
      );
    }
  }
}
