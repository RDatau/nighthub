import React, { useState, useEffect } from 'react';
import { 
  X, Sliders, Trash2, GripVertical, FileVideo, Edit3, 
  ChevronUp, ChevronDown, ArrowDownAZ, ArrowUpAZ, Shuffle, ArrowUpDown,
  ArrowDown, Link2, AlertTriangle
} from 'lucide-react';
import { Language } from '../services/i18n';
import { SavedCollection } from '../services/db';
import { getRealFilePath } from '../services/fileUtils';

export const EditPlaylistModal = ({
  show,
  collection,
  onSave,
  onCancel,
  lang = 'id'
}: {
  show: boolean;
  collection: SavedCollection | null;
  onSave: (updated: SavedCollection) => void;
  onCancel: () => void;
  lang?: Language;
}) => {
  const [name, setName] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);

  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setFiles([...collection.files]);
      setDraggedIndex(null);
      setActiveSlotIndex(null);
    }
  }, [collection]);

  if (!show || !collection) return null;

  const handleRemoveFile = (indexToRemove: number) => {
    setFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = [...files];
    const temp = reordered[index - 1];
    reordered[index - 1] = reordered[index];
    reordered[index] = temp;
    setFiles(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= files.length - 1) return;
    const reordered = [...files];
    const temp = reordered[index + 1];
    reordered[index + 1] = reordered[index];
    reordered[index] = temp;
    setFiles(reordered);
  };

  // Quick Sorting Helpers
  const handleSortAz = () => {
    const sorted = [...files].sort((a, b) => 
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    setFiles(sorted);
  };

  const handleSortZa = () => {
    const sorted = [...files].sort((a, b) => 
      (b.name || '').localeCompare(a.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    setFiles(sorted);
  };

  const handleReverse = () => {
    setFiles([...files].reverse());
  };

  const handleShuffle = () => {
    const shuffled = [...files];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setFiles(shuffled);
  };

  const handleRelinkFile = (index: number, pickedFile: File) => {
    const realPath = getRealFilePath(pickedFile);
    if (!realPath) return;
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, path: realPath, size: pickedFile.size || f.size } : f));
  };

  const handleDropExternalFiles = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files') && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      const droppedList = Array.from(e.dataTransfer.files);
      setFiles(prev => {
        let updated = [...prev];
        droppedList.forEach(df => {
          const realPath = getRealFilePath(df);
          const matchIdx = updated.findIndex(f => f.name.toLowerCase() === df.name.toLowerCase());
          if (matchIdx !== -1) {
            updated[matchIdx] = {
              ...updated[matchIdx],
              path: realPath || updated[matchIdx].path,
              size: df.size || updated[matchIdx].size
            };
          } else {
            updated.push({
              name: df.name,
              path: realPath,
              size: df.size,
              type: df.type,
              isStream: false
            });
          }
        });
        return updated;
      });
    }
  };

  // Drag & Drop Handlers with Zero-Layout-Shift Insertion Detection
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.setData('application/x-playlist-index', String(index));
    } catch {}

    // Defer state update so browser captures unmutated element snapshot
    requestAnimationFrame(() => {
      setDraggedIndex(index);
    });
  };

  const handleDropToSlot = (slotIndex: number) => {
    if (draggedIndex === null) return;
    if (slotIndex === draggedIndex || slotIndex === draggedIndex + 1) {
      setDraggedIndex(null);
      setActiveSlotIndex(null);
      return;
    }

    const reordered = [...files];
    const [draggedItem] = reordered.splice(draggedIndex, 1);
    const targetIdx = slotIndex > draggedIndex ? slotIndex - 1 : slotIndex;
    const clampedIdx = Math.max(0, Math.min(reordered.length, targetIdx));
    reordered.splice(clampedIdx, 0, draggedItem);
    setFiles(reordered);

    setDraggedIndex(null);
    setActiveSlotIndex(null);
  };

  const handleSlotDragOver = (e: React.DragEvent, slot: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null) return;
    e.dataTransfer.dropEffect = 'move';
    if (activeSlotIndex !== slot) {
      setActiveSlotIndex(slot);
    }
  };

  const handleDropOnSlot = (e: React.DragEvent, slot: number) => {
    e.preventDefault();
    e.stopPropagation();
    handleDropToSlot(slot);
  };

  const handleCardDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null) return;
    e.dataTransfer.dropEffect = 'move';

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const slot = mouseY < rect.height * 0.5 ? index : index + 1;
    if (activeSlotIndex !== slot) {
      setActiveSlotIndex(slot);
    }
  };

  const handleDropOnCard = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    const slot = mouseY < rect.height * 0.5 ? index : index + 1;
    handleDropToSlot(slot);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setActiveSlotIndex(null);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert(lang === 'id' ? 'Nama Playlist tidak boleh kosong' : 'Playlist name cannot be empty');
      return;
    }
    if (files.length === 0) {
      if (!confirm(lang === 'id' ? 'Playlist kosong akan disimpan tanpa berkas. Lanjutkan?' : 'Empty playlist will be saved with no files. Continue?')) {
        return;
      }
    }

    onSave({
      ...collection,
      name: name.trim(),
      files
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderDropSlot = (slotIndex: number) => {
    if (draggedIndex === null) return null;

    const isSelf = slotIndex === draggedIndex || slotIndex === draggedIndex + 1;
    const isActive = activeSlotIndex === slotIndex && !isSelf;

    return (
      <div
        key={`slot-${slotIndex}`}
        onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
        onDrop={(e) => handleDropOnSlot(e, slotIndex)}
        className="h-3 my-0.5 relative flex items-center justify-center transition-all z-20 cursor-move"
      >
        {/* If Active: render full glowing guide line with pins and center arrow icon OVERLAID without shifting layout */}
        {isActive ? (
          <div className="absolute inset-x-0 h-8 flex items-center justify-between px-2 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/50 rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.25)] pointer-events-none animate-in fade-in duration-100 z-30">
            {/* Glowing guide line */}
            <div className="absolute inset-x-2 h-1 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400 shadow-[0_0_14px_rgba(245,158,11,1)]" />

            {/* Left glowing pin */}
            <div className="relative w-4 h-4 rounded-full bg-amber-400 border-2 border-white dark:border-[#0e0c0b] shadow-[0_0_10px_rgba(245,158,11,1)] flex items-center justify-center shrink-0 z-10 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-black" />
            </div>

            {/* Center visual marker - pure indicator icon without any text */}
            <div className="relative z-10 mx-auto w-7 h-7 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-black shadow-[0_2px_10px_rgba(245,158,11,0.6)] flex items-center justify-center">
              <ArrowDown size={14} className="stroke-[3]" />
            </div>

            {/* Right glowing pin */}
            <div className="relative w-4 h-4 rounded-full bg-amber-400 border-2 border-white dark:border-[#0e0c0b] shadow-[0_0_10px_rgba(245,158,11,1)] flex items-center justify-center shrink-0 z-10 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-black" />
            </div>
          </div>
        ) : !isSelf ? (
          <div className="w-full h-[1px] bg-zinc-200/50 dark:bg-white/5 rounded-full transition-all" />
        ) : null}
      </div>
    );
  };

  return (
    <div 
      data-playlist-modal="true" 
      data-modal="edit-playlist"
      onDragOver={(e) => { 
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault(); 
          e.stopPropagation(); 
        }
      }}
      onDrop={(e) => { 
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault(); 
          e.stopPropagation();
          handleDropExternalFiles(e);
        }
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 dark:bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
    >
      <div 
        onDragOver={(e) => { 
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault(); 
            e.stopPropagation(); 
          }
        }}
        onDrop={(e) => { 
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault(); 
            e.stopPropagation();
            handleDropExternalFiles(e);
          }
        }}
        className="bg-white/95 dark:bg-[#0e0c0b] text-zinc-900 dark:text-white border border-zinc-200/80 dark:border-amber-500/20 p-6 md:p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh] transition-colors duration-200"
      >
        
        {/* Close Button */}
        <button 
          onClick={onCancel}
          className="absolute right-5 top-5 p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded-full transition-all cursor-pointer"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 dark:border-white/5 pb-4 mb-5">
          <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-500">
            <Sliders size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
              {lang === 'id' ? 'Edit & Urutkan Playlist' : 'Edit & Sort Playlist'}
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5 font-semibold">
              {lang === 'id' 
                ? 'Tarik & lepas berkas untuk mengatur urutan posisi, atau gunakan tombol navigasi cepat.' 
                : 'Drag & drop files to reorder positions, or use quick action buttons.'}
            </p>
          </div>
        </div>

        {/* Playlist Name Input */}
        <div className="mb-4">
          <label className="block text-zinc-600 dark:text-zinc-400 font-extrabold text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Edit3 size={12} className="text-amber-500" />
            <span>{lang === 'id' ? 'Nama Playlist' : 'Playlist Name'}</span>
          </label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === 'id' ? 'Masukkan nama playlist...' : 'Enter playlist name...'}
            className="w-full bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-white text-sm p-3.5 rounded-xl border border-zinc-300/80 dark:border-white/10 focus:border-amber-500 dark:focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all font-bold placeholder-zinc-400 dark:placeholder-zinc-600"
          />
        </div>

        {/* Quick Sorting Toolbar */}
        {files.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-zinc-100 dark:bg-zinc-950/60 border border-zinc-200 dark:border-white/5 rounded-2xl mb-4">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-1 pl-1">
              <ArrowUpDown size={12} className="text-amber-500" />
              {lang === 'id' ? 'Urutan Cepat:' : 'Quick Sort:'}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleSortAz}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-white/5 hover:bg-amber-500/15 dark:hover:bg-amber-500/15 text-zinc-700 hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-400 border border-zinc-200 dark:border-white/5 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title={lang === 'id' ? 'Urutkan Nama A ke Z' : 'Sort Name A to Z'}
              >
                <ArrowDownAZ size={13} />
                <span>A-Z</span>
              </button>
              <button
                type="button"
                onClick={handleSortZa}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-white/5 hover:bg-amber-500/15 dark:hover:bg-amber-500/15 text-zinc-700 hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-400 border border-zinc-200 dark:border-white/5 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title={lang === 'id' ? 'Urutkan Nama Z ke A' : 'Sort Name Z to A'}
              >
                <ArrowUpAZ size={13} />
                <span>Z-A</span>
              </button>
              <button
                type="button"
                onClick={handleReverse}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-white/5 hover:bg-amber-500/15 dark:hover:bg-amber-500/15 text-zinc-700 hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-400 border border-zinc-200 dark:border-white/5 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title={lang === 'id' ? 'Balik Urutan Saat Ini' : 'Reverse Current Order'}
              >
                <ArrowUpDown size={13} />
                <span>{lang === 'id' ? 'Balik' : 'Reverse'}</span>
              </button>
              <button
                type="button"
                onClick={handleShuffle}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-white/5 hover:bg-amber-500/15 dark:hover:bg-amber-500/15 text-zinc-700 hover:text-amber-700 dark:text-zinc-300 dark:hover:text-amber-400 border border-zinc-200 dark:border-white/5 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title={lang === 'id' ? 'Acak Urutan' : 'Shuffle Order'}
              >
                <Shuffle size={13} />
                <span>{lang === 'id' ? 'Acak' : 'Shuffle'}</span>
              </button>
            </div>
          </div>
        )}

        {/* File Reorder & Delete List */}
        <div className="flex-1 overflow-y-auto min-h-[220px] mb-5 pr-1.5 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-zinc-600 dark:text-zinc-400 font-extrabold text-[10px] uppercase tracking-wider">
              {lang === 'id' ? `Daftar Berkas (${files.length})` : `Files List (${files.length})`}
            </h3>
            {draggedIndex !== null && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30 dark:border-amber-500/20">
                <ArrowUpDown size={11} className="animate-bounce" />
                <span>{lang === 'id' ? 'Geser & Lepaskan' : 'Drag & Drop'}</span>
              </div>
            )}
          </div>

          {files.length > 0 ? (
            <div 
              className="select-none relative pb-2"
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedIndex !== null) {
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (activeSlotIndex !== null) {
                  handleDropToSlot(activeSlotIndex);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setActiveSlotIndex(null);
                }
              }}
            >
              {files.map((file, idx) => {
                const isDraggingThis = idx === draggedIndex;

                return (
                  <React.Fragment key={idx}>
                    {/* Insertion slot before file idx */}
                    {renderDropSlot(idx)}

                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleCardDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDropOnCard(e, idx)}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-colors duration-150 cursor-grab active:cursor-grabbing select-none ${
                        isDraggingThis 
                          ? 'bg-amber-500/15 dark:bg-amber-500/10 border-amber-500/60 opacity-40 border-dashed' 
                          : 'bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200/80 dark:border-white/5 hover:border-zinc-300 dark:hover:border-white/15 hover:bg-zinc-100 dark:hover:bg-zinc-900/40'
                      }`}
                    >
                      {/* Drag Handle & Number & File Info */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pointer-events-none select-none">
                        {/* Grip Handle */}
                        <div 
                          className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-amber-600 dark:text-zinc-500 dark:hover:text-amber-400 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                          title={lang === 'id' ? 'Tahan dan geser untuk memindahkan urutan' : 'Click and drag to reorder'}
                        >
                          <GripVertical size={16} />
                        </div>

                        {/* Order Index Badge */}
                        <div className="w-6 h-6 rounded-lg bg-black/5 dark:bg-white/5 border border-zinc-200/80 dark:border-white/5 text-zinc-600 dark:text-zinc-400 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </div>
                        
                        <div className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-zinc-500 dark:text-zinc-400 shrink-0">
                          <FileVideo size={14} />
                        </div>

                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-xs text-zinc-900 dark:text-zinc-100 font-bold truncate" title={file.name}>{file.name}</div>
                          {file.isStream ? (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase mt-0.5 truncate" title={file.url || file.path}>
                              Stream • {file.url || file.path}
                            </div>
                          ) : file.path ? (
                            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate mt-0.5" title={file.path}>
                              {file.path} • {formatBytes(file.size || 0)}
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={11} className="shrink-0" />
                              <span>{lang === 'id' ? 'Path belum tertaut' : 'Path not linked'}</span>
                              <span className="text-zinc-400 dark:text-zinc-500 font-normal">• {formatBytes(file.size || 0)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Move Up/Down Controls & Relink & Remove */}
                      <div className="flex items-center gap-1 shrink-0 ml-2 pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
                        {/* Relink Button if path is missing */}
                        {!file.isStream && !file.path && (
                          <label 
                            className="p-1 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500 text-amber-600 dark:text-amber-400 hover:text-black text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0 shadow-sm" 
                            title={lang === 'id' ? 'Pilih berkas asli dari komputer untuk menautkan path' : 'Select original file to link path'}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <Link2 size={12} />
                            <span>{lang === 'id' ? 'Tautkan' : 'Relink'}</span>
                            <input 
                              type="file" 
                              accept="video/*,audio/*,.ts,.m3u8,.m3u" 
                              className="hidden" 
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleRelinkFile(idx, e.target.files[0]);
                                }
                              }} 
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => handleMoveUp(idx)}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-20 disabled:hover:text-zinc-400 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
                          title={lang === 'id' ? 'Pindah ke atas' : 'Move up'}
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(idx)}
                          disabled={idx === files.length - 1}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 hover:bg-amber-500/10 disabled:opacity-20 disabled:hover:text-zinc-400 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
                          title={lang === 'id' ? 'Pindah ke bawah' : 'Move down'}
                        >
                          <ChevronDown size={15} />
                        </button>
                        <div className="w-px h-4 bg-zinc-200 dark:bg-white/10 mx-0.5" />
                        <button 
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          className="p-2 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-600 dark:text-red-500 rounded-xl transition-all cursor-pointer"
                          title={lang === 'id' ? 'Hapus dari Playlist' : 'Remove from Playlist'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Final Drop Slot after the last item (slot files.length) */}
              {renderDropSlot(files.length)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-dashed border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-950/20 text-center">
              <span className="text-zinc-500 dark:text-zinc-600 text-xs font-bold">
                {lang === 'id' ? 'Tidak ada berkas dalam playlist ini.' : 'No files in this playlist.'}
              </span>
            </div>
          )}
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
            {lang === 'id' ? 'Simpan Perubahan' : 'Save Changes'}
          </button>
        </div>

      </div>
    </div>
  );
};
