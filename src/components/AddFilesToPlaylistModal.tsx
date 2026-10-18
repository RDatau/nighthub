import React, { useState } from 'react';
import { Plus, X, FileVideo, CheckSquare, Square, Upload } from 'lucide-react';
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

export const AddFilesToPlaylistModal = ({
  show,
  playlistName,
  availableFiles,
  onAdd,
  onCancel,
  lang = 'id'
}: {
  show: boolean;
  playlistName: string;
  availableFiles: any[];
  onAdd: (files: any[]) => void;
  onCancel: () => void;
  lang?: Language;
}) => {
  const [selectedLibraryIndices, setSelectedLibraryIndices] = useState<number[]>([]);
  const [additionalFiles, setAdditionalFiles] = useState<FileItem[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);

  if (!show) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        setIsDragActive(true);
      }
    } else if (e.type === "dragleave") {
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
      alert(lang === 'id' ? 'Pilih setidaknya satu file untuk ditambahkan' : 'Select at least one file to add');
      return;
    }

    onAdd(allFiles);
    // Reset state
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
      data-modal="add-files-to-playlist"
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
        {/* Drag Drop Full Overlay Banner when hovering files over modal */}
        {isDragActive && (
          <div className="absolute inset-3 z-40 bg-amber-500/15 backdrop-blur-sm border-2 border-dashed border-amber-500 rounded-2xl flex flex-col items-center justify-center pointer-events-none animate-in fade-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 text-black flex items-center justify-center shadow-lg shadow-amber-500/30 mb-3 animate-bounce">
              <Upload size={32} />
            </div>
            <span className="text-zinc-900 dark:text-white text-base font-black tracking-wide">
              {lang === 'id' ? 'Lepaskan Berkas di Sini' : 'Drop Files Here'}
            </span>
            <span className="text-amber-600 dark:text-amber-400 text-xs font-bold mt-1">
              {lang === 'id' ? 'Berkas akan langsung ditambahkan ke daftar playlist ini' : 'Files will be added directly to this playlist list'}
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
            <Plus size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
              {lang === 'id' ? `Tambah Berkas ke "${playlistName}"` : `Add Files to "${playlistName}"`}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5 font-semibold">
              {lang === 'id' 
                ? 'Tambahkan berkas baru dari pustaka media aktif atau unggah dari penyimpanan lokal.' 
                : 'Add new files from the active media library or upload from local storage.'}
            </p>
          </div>
        </div>

        {/* Scrollable File Selection list */}
        <div className="flex-1 overflow-y-auto min-h-[150px] mb-6 pr-2 space-y-4 select-none scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {/* Library Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-zinc-600 dark:text-zinc-400 font-extrabold text-[10px] uppercase tracking-wider">
                {lang === 'id' ? 'Pilih dari Pustaka Media Aktif' : 'Select from Active Media Library'}
              </h3>
              {availableFiles.length > 0 && (
                <button 
                  onClick={handleSelectAllLibrary}
                  className="text-amber-600 dark:text-amber-500 hover:text-amber-500 dark:hover:text-amber-400 text-[10px] font-black uppercase tracking-wider cursor-pointer"
                >
                  {selectedLibraryIndices.length === availableFiles.length 
                    ? (lang === 'id' ? 'Batal Semua' : 'Deselect All') 
                    : (lang === 'id' ? 'Pilih Semua' : 'Select All')}
                </button>
              )}
            </div>

            {availableFiles.length > 0 ? (
              <div className="bg-zinc-100 dark:bg-zinc-950/50 rounded-2xl border border-zinc-200 dark:border-white/5 p-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {availableFiles.map((file, idx) => {
                  const isSelected = selectedLibraryIndices.includes(idx);
                  return (
                    <div 
                      key={idx}
                      onClick={() => handleLibraryToggle(idx)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-amber-500/15 dark:bg-amber-500/10 border border-amber-500/40 dark:border-amber-500/20' 
                          : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-amber-500/15 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500' : 'bg-black/5 dark:bg-white/5 text-zinc-500 dark:text-zinc-400'}`}>
                          <FileVideo size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-zinc-900 dark:text-white font-bold truncate">{file.name}</div>
                          <div className="text-[10px] text-zinc-500 dark:text-zinc-500 font-semibold uppercase mt-0.5">
                            {file.isStream ? 'Stream' : 'Local'} • {formatBytes(file.size || 0)}
                          </div>
                        </div>
                      </div>
                      <div className="ml-3 shrink-0 text-amber-500">
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} className="text-zinc-400 dark:text-zinc-600" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center border border-dashed border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50 dark:bg-zinc-950/20 text-zinc-500 dark:text-zinc-600 text-xs font-bold">
                {lang === 'id' ? 'Tidak ada berkas di pustaka aktif.' : 'No files in the active library.'}
              </div>
            )}
          </div>

          {/* Add from disk section */}
          <div>
            <h3 className="text-zinc-600 dark:text-zinc-400 font-extrabold text-[10px] uppercase tracking-wider mb-2">
              {lang === 'id' ? 'Tambah dari Disk Lokal' : 'Add from Local Disk'}
            </h3>
            
            <div className="flex flex-col gap-3">
              <label 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center border border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all group ${
                  isDragActive 
                    ? 'border-amber-500 bg-amber-500/10' 
                    : 'border-zinc-300 dark:border-white/10 hover:border-amber-500/50 bg-zinc-50 dark:bg-zinc-950/30 hover:bg-amber-500/5'
                }`}
              >
                <Upload size={24} className="text-zinc-400 dark:text-zinc-500 group-hover:text-amber-500 transition-colors mb-2" />
                <span className="text-zinc-900 dark:text-white text-xs font-black">
                  {lang === 'id' ? 'Pilih Berkas Video/Audio' : 'Choose Video/Audio Files'}
                </span>
                <span className="text-zinc-500 dark:text-zinc-600 text-[10px] font-bold mt-1">
                  {lang === 'id' ? 'Mendukung format MP4, MKV, M3U8, MP3, dll.' : 'Supports MP4, MKV, M3U8, MP3, etc.'}
                </span>
                <input 
                  type="file" 
                  multiple 
                  accept="video/*,audio/*,.ts,.m3u8,.m3u" 
                  onChange={handleFileChange}
                  className="hidden" 
                />
              </label>

              {additionalFiles.length > 0 && (
                <div className="space-y-1 bg-zinc-100 dark:bg-zinc-950/30 rounded-2xl border border-zinc-200 dark:border-white/5 p-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                  {additionalFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-white/5 border border-zinc-200/80 dark:border-transparent">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileVideo size={14} className="text-amber-500 shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="text-xs text-zinc-900 dark:text-zinc-300 font-bold truncate">{file.name}</div>
                          {file.path && (
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate" title={file.path}>
                              {file.path}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-semibold shrink-0 uppercase">{formatBytes(file.size)}</span>
                      </div>
                      <button 
                        onClick={() => removeAdditionalFile(idx)}
                        className="ml-3 p-1 hover:bg-black/5 dark:hover:bg-white/15 text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Actions footer */}
        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 dark:border-white/5 pt-4">
          <button 
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-transparent dark:hover:bg-white/5 text-zinc-700 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
          >
            {lang === 'id' ? 'Batal' : 'Cancel'}
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-amber-500/10 active:scale-95 cursor-pointer"
          >
            {lang === 'id' ? 'Tambah Berkas' : 'Add Files'}
          </button>
        </div>

      </div>
    </div>
  );
};
