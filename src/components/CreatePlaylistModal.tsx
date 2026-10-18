import React, { useState } from 'react';
import { Plus, X, ListVideo, Trash2, CheckSquare, Square, FolderPlus, Upload } from 'lucide-react';
import { Language } from '../services/i18n';
import { getRealFilePath } from '../services/fileUtils';

interface FileItem {
  name: string;
  size: number;
  path?: string;
  isStream?: boolean;
  url?: string;
  type?: string;
}

export const CreatePlaylistModal = ({
  show,
  availableFiles,
  onSave,
  onCancel,
  lang = 'id'
}: {
  show: boolean;
  availableFiles: any[];
  onSave: (name: string, files: any[]) => void;
  onCancel: () => void;
  lang?: Language;
}) => {
  const [playlistName, setPlaylistName] = useState('');
  const [selectedLibraryIndices, setSelectedLibraryIndices] = useState<number[]>([]);
  const [additionalFiles, setAdditionalFiles] = useState<FileItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  if (!show) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        setIsDragActive(true);
      }
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const list: FileItem[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        const realPath = getRealFilePath(f);
        list.push({
          name: f.name,
          size: f.size,
          path: realPath,
          type: f.type
        });
      }
      setAdditionalFiles(prev => [...prev, ...list]);
    }
  };

  const handleLibraryToggle = (index: number) => {
    setSelectedLibraryIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleSelectAllLibrary = () => {
    if (selectedLibraryIndices.length === availableFiles.length) {
      setSelectedLibraryIndices([]);
    } else {
      setSelectedLibraryIndices(availableFiles.map((_, idx) => idx));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const list: FileItem[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      const f = e.target.files[i];
      const realPath = getRealFilePath(f);
      list.push({
        name: f.name,
        size: f.size,
        path: realPath,
        type: f.type
      });
    }
    setAdditionalFiles(prev => [...prev, ...list]);
  };

  const removeAdditionalFile = (idx: number) => {
    setAdditionalFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!playlistName.trim()) {
      alert(lang === 'id' ? 'Nama Playlist tidak boleh kosong' : 'Playlist name cannot be empty');
      return;
    }

    const filesFromLibrary = selectedLibraryIndices.map(idx => {
      const f = availableFiles[idx];
      const realPath = getRealFilePath(f) || (f as any).path || '';
      return {
        name: f.name,
        size: f.size,
        path: realPath,
        isStream: (f as any).isStream || false,
        url: (f as any).url || '',
        type: f.type || ''
      };
    });

    const allFiles = [...filesFromLibrary, ...additionalFiles];
    if (allFiles.length === 0) {
      alert(lang === 'id' ? 'Pilih setidaknya satu file untuk dimasukkan ke dalam Playlist' : 'Select at least one file to include in the Playlist');
      return;
    }

    onSave(playlistName.trim(), allFiles);
    // Reset state
    setPlaylistName('');
    setSelectedLibraryIndices([]);
    setAdditionalFiles([]);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div 
      data-playlist-modal="true" 
      data-modal="create-playlist"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragActive(false);
        }
      }}
      onDrop={handleDrop}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 dark:bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`bg-white/95 dark:bg-[#0e0c0b] text-zinc-900 dark:text-white border ${isDragActive ? 'border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.25)] ring-2 ring-amber-500/40' : 'border-zinc-200/80 dark:border-amber-500/20'} p-6 md:p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh] transition-all duration-200`}
      >
        {/* Drag Drop Overlay Banner when hovering files over modal */}
        {isDragActive && (
          <div className="absolute inset-3 z-40 bg-amber-500/15 backdrop-blur-sm border-2 border-dashed border-amber-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 mb-3 animate-bounce">
              <Upload size={32} />
            </div>
            <span className="text-zinc-900 dark:text-white text-base font-black tracking-wide">
              {lang === 'id' ? 'Lepaskan Berkas di Sini' : 'Drop Files Here'}
            </span>
            <span className="text-amber-600 dark:text-amber-400 text-xs font-bold mt-1">
              {lang === 'id' ? 'Berkas akan ditambahkan ke playlist baru ini' : 'Files will be added to this new playlist'}
            </span>
          </div>
        )}
        
        {/* Close Button */}
        <button 
          onClick={onCancel}
          className="absolute right-5 top-5 p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded-full transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-4 mb-6">
          <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-500">
            <ListVideo size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
              {lang === 'id' ? 'Buat Playlist Baru' : 'Create New Playlist'}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5 font-semibold">
              {lang === 'id' ? 'Buat daftar putar kustom dari pustaka media Anda atau tambahkan dari disk.' : 'Create a custom playlist from your media library or add from disk.'}
            </p>
          </div>
        </div>

        {/* Playlist Name Input */}
        <div className="mb-5">
          <label className="block text-zinc-600 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider mb-2">
            {lang === 'id' ? 'Nama Playlist' : 'Playlist Name'}
          </label>
          <input 
            type="text" 
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder={lang === 'id' ? 'Masukkan nama playlist...' : 'Enter playlist name...'}
            className="w-full bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-white text-sm p-3.5 rounded-xl border border-zinc-300/80 dark:border-white/10 focus:border-amber-500 dark:focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all font-bold placeholder-zinc-400 dark:placeholder-zinc-600"
            autoFocus
          />
        </div>

        {/* Scrollable File Selection list */}
        <div className="flex-1 overflow-y-auto min-h-[150px] mb-6 pr-2 space-y-4 select-none scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {/* Library Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-600 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider">
                {lang === 'id' ? 'Pilih Dari Pustaka Media' : 'Choose From Media Library'}
              </span>
              {availableFiles.length > 0 && (
                <button 
                  onClick={handleSelectAllLibrary}
                  className="text-xs text-amber-600 dark:text-amber-500 hover:text-amber-500 dark:hover:text-amber-400 font-extrabold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {selectedLibraryIndices.length === availableFiles.length ? (
                    <>
                      <CheckSquare size={13} />
                      <span>{lang === 'id' ? 'Batal Semua' : 'Deselect All'}</span>
                    </>
                  ) : (
                    <>
                      <Square size={13} />
                      <span>{lang === 'id' ? 'Pilih Semua' : 'Select All'}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {availableFiles.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 bg-zinc-100 dark:bg-zinc-950/40 border border-zinc-200 dark:border-white/5 p-3 rounded-2xl max-h-[180px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {availableFiles.map((file, idx) => {
                  const isChecked = selectedLibraryIndices.includes(idx);
                  return (
                    <div 
                      key={idx}
                      onClick={() => handleLibraryToggle(idx)}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-amber-500/15 dark:bg-amber-500/10 border-amber-500/40 dark:border-amber-500/30 text-zinc-900 dark:text-white font-bold' 
                          : 'bg-white/60 dark:bg-black/20 border-zinc-200/50 dark:border-transparent hover:border-zinc-300 dark:hover:border-white/5 text-zinc-700 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare size={16} className="text-amber-500 shrink-0" />
                      ) : (
                        <Square size={16} className="text-zinc-400 dark:text-zinc-600 shrink-0" />
                      )}
                      <div className="flex-1 truncate text-xs" title={file.name}>
                        {file.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500 shrink-0">
                        {formatBytes(file.size)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-dashed border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-950/10 text-center text-xs text-zinc-500 font-medium">
                {lang === 'id' ? 'Pustaka media kosong. Silakan tambahkan file langsung di bawah.' : 'Media library is empty. Please add files directly below.'}
              </div>
            )}
          </div>

          {/* Disk Upload Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-600 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider">
                {lang === 'id' ? 'Tambah File Dari Komputer' : 'Add Files From Computer'}
              </span>
            </div>

            <label 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center border border-dashed rounded-2xl p-5 mb-2 text-center cursor-pointer transition-all group ${
                isDragActive 
                  ? 'border-amber-500 bg-amber-500/10' 
                  : 'border-zinc-300 dark:border-white/10 hover:border-amber-500/50 bg-zinc-50 dark:bg-zinc-950/30 hover:bg-amber-500/5'
              }`}
            >
              <Upload size={22} className="text-zinc-400 dark:text-zinc-500 group-hover:text-amber-500 transition-colors mb-1.5" />
              <div className="flex items-center gap-1.5 text-xs font-black text-zinc-900 dark:text-white">
                <span>{lang === 'id' ? 'Tarik & Lepas Berkas ke Sini atau' : 'Drag & Drop Files Here or'}</span>
                <span className="text-amber-600 dark:text-amber-400 underline underline-offset-2">{lang === 'id' ? 'Telusuri Berkas' : 'Browse Files'}</span>
              </div>
              <span className="text-zinc-500 dark:text-zinc-500 text-[10px] font-semibold mt-1">
                {lang === 'id' ? 'Mendukung MP4, MKV, M3U8, TS, WebM, MP3, dll.' : 'Supports MP4, MKV, M3U8, TS, WebM, MP3, etc.'}
              </span>
              <input type="file" accept="video/*,audio/*,.ts,.m3u8,.m3u" multiple className="hidden" onChange={handleFileChange} />
            </label>

            {additionalFiles.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 bg-zinc-100 dark:bg-zinc-950/40 border border-zinc-200 dark:border-white/5 p-3 rounded-2xl max-h-[140px] overflow-y-auto animate-fade-in scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {additionalFiles.map((file, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between gap-4 p-2.5 rounded-xl bg-white dark:bg-black/20 border border-zinc-200/80 dark:border-transparent text-zinc-800 dark:text-zinc-300"
                  >
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs truncate font-bold block text-zinc-900 dark:text-zinc-300" title={file.name}>{file.name}</span>
                        {file.path && (
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate" title={file.path}>
                            {file.path}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono text-zinc-500">{formatBytes(file.size)}</span>
                      <button 
                        onClick={() => removeAdditionalFile(idx)}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-600 dark:text-red-500 rounded-lg transition-all cursor-pointer"
                        title={lang === 'id' ? 'Hapus' : 'Remove'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 rounded-2xl border border-dashed border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-950/10 text-center text-xs text-zinc-500 dark:text-zinc-600">
                {lang === 'id' ? 'Belum ada file tambahan dipilih.' : 'No additional files selected.'}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 border-t border-zinc-200 dark:border-white/5 pt-5">
          <button 
            onClick={onCancel}
            className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white font-extrabold py-3.5 rounded-xl transition-all duration-300 text-xs uppercase tracking-widest cursor-pointer"
          >
            {lang === 'id' ? 'Batal' : 'Cancel'}
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold py-3.5 rounded-xl transition-all hover:scale-[1.02] duration-300 text-xs uppercase tracking-widest shadow-lg shadow-amber-500/10 cursor-pointer"
          >
            {lang === 'id' ? 'Simpan Playlist' : 'Save Playlist'}
          </button>
        </div>

      </div>
    </div>
  );
};
