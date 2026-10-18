import React, { useEffect, useState } from 'react';
import { Trash2, X, Database, Bookmark, Repeat, Clock, Film, Image as ImageIcon, Settings, ChevronDown, ChevronRight, Volume2, Shuffle, Sparkles, Zap } from 'lucide-react';
import { dbService, VideoMarker, SavedLoop } from '../services/db';
import { t, Language } from '../services/i18n';

interface MemoryManagerModalProps {
  show: boolean;
  onClose: () => void;
  onClearThumbnails: () => void;
  repeatMode: 'none' | 'playlist' | 'current';
  isShuffle: boolean;
  isAudioNormalized: boolean;
  audioBoost: number;
  eqGains: number[];
  isEnhance: boolean;
  isSuperRes: boolean;
  onLoadLoop?: (videoId: string, loop: SavedLoop) => void;
  lang?: Language;
}

export const MemoryManagerModal = ({
  show,
  onClose,
  onClearThumbnails,
  repeatMode,
  isShuffle,
  isAudioNormalized,
  audioBoost,
  eqGains,
  isEnhance,
  isSuperRes,
  onLoadLoop,
  lang = 'id'
}: MemoryManagerModalProps) => {
  const [progressData, setProgressData] = useState<{videoId: string, time: number}[]>([]);
  const [markersData, setMarkersData] = useState<{videoId: string, markers: VideoMarker[]}[]>([]);
  const [loopsData, setLoopsData] = useState<{videoId: string, loops: SavedLoop[]}[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  const loadMemories = async () => {
    setLoading(true);
    const [progress, markers, loops] = await Promise.all([
      dbService.getAllProgress(),
      dbService.getAllMarkers(),
      dbService.getAllLoops()
    ]);

    setProgressData(progress);
    setMarkersData(markers);
    setLoopsData(loops);
    setLoading(false);
  };

  useEffect(() => {
    if (show) {
      loadMemories();
    }
  }, [show]);

  const handleDeleteProgress = async (videoId: string) => {
    await dbService.deleteProgress(videoId);
    loadMemories();
  };

  const handleDeleteAllProgress = async () => {
    await Promise.all(progressData.map(p => dbService.deleteProgress(p.videoId)));
    loadMemories();
  };

  const handleDeleteMarkers = async (videoId: string) => {
    await dbService.deleteMarkers(videoId);
    loadMemories();
  };

  const handleDeleteAllMarkers = async () => {
    await Promise.all(markersData.map(m => dbService.deleteMarkers(m.videoId)));
    loadMemories();
  };

  const handleDeleteLoops = async (videoId: string) => {
    await dbService.deleteLoops(videoId);
    loadMemories();
  };

  const handleDeleteAllLoops = async () => {
    await Promise.all(loopsData.map(l => dbService.deleteLoops(l.videoId)));
    loadMemories();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleCategory = (category: string) => {
    setExpandedCategory(prev => prev === category ? null : category);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/10 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-white/90 dark:bg-[#0a0502]/95 border border-orange-500/20 dark:border-amber-500/20 rounded-3xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]">
        <div className="p-6 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 dark:bg-amber-500/10 rounded-lg">
              <Database className="text-orange-600 dark:text-amber-500" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{t('memoryManagerHeader', lang)}</h2>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">{t('memoryManagerSubHeader', lang)}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 rounded-full text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
              <div className="w-8 h-8 border-2 border-orange-500 dark:border-amber-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-mono uppercase tracking-widest">{t('loadingData', lang)}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Lanjut Category */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden">
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  onClick={() => toggleCategory('lanjut')}
                >
                  <div className="flex items-center gap-3">
                    {expandedCategory === 'lanjut' ? <ChevronDown size={18} className="text-zinc-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
                    <Clock size={18} className="text-orange-600 dark:text-amber-500" />
                    <span className="font-medium text-zinc-900 dark:text-white">{t('categoryResume', lang)} ({progressData.length})</span>
                  </div>
                  {progressData.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAllProgress(); }}
                      className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-zinc-900 dark:text-white rounded-lg transition-all text-xs font-bold"
                    >
                      {t('clearAll', lang)}
                    </button>
                  )}
                </div>
                {expandedCategory === 'lanjut' && (
                  <div className="p-4 pt-0 space-y-2 border-t border-black/5 dark:border-white/5 mt-2">
                    {progressData.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">{t('noResumeData', lang)}</p>
                    ) : (
                      progressData.map(p => (
                        <div key={p.videoId} className="flex items-center justify-between bg-white/50 dark:bg-black/20 p-3 rounded-xl">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm text-zinc-900 dark:text-white truncate" title={p.videoId}>{p.videoId}</p>
                            <p className="text-xs text-zinc-500 mt-1">Waktu: {formatTime(p.time)}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteProgress(p.videoId)}
                            className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Penanda Category */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden">
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  onClick={() => toggleCategory('penanda')}
                >
                  <div className="flex items-center gap-3">
                    {expandedCategory === 'penanda' ? <ChevronDown size={18} className="text-zinc-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
                    <Bookmark size={18} className="text-orange-600 dark:text-amber-500" />
                    <span className="font-medium text-zinc-900 dark:text-white">{t('categoryMarkers', lang)} ({markersData.length})</span>
                  </div>
                  {markersData.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAllMarkers(); }}
                      className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-zinc-900 dark:text-white rounded-lg transition-all text-xs font-bold"
                    >
                      {t('clearAll', lang)}
                    </button>
                  )}
                </div>
                {expandedCategory === 'penanda' && (
                  <div className="p-4 pt-0 space-y-2 border-t border-black/5 dark:border-white/5 mt-2">
                    {markersData.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">{t('noMarkerData', lang)}</p>
                    ) : (
                      markersData.map(m => (
                        <div key={m.videoId} className="flex items-center justify-between bg-white/50 dark:bg-black/20 p-3 rounded-xl">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm text-zinc-900 dark:text-white truncate" title={m.videoId}>{m.videoId}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {m.markers.map(marker => (
                                <span key={marker.id} className="text-[10px] bg-orange-500/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded-md">
                                  {formatTime(marker.time)} - {marker.label}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteMarkers(m.videoId)}
                            className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Loop Category */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden">
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  onClick={() => toggleCategory('loop')}
                >
                  <div className="flex items-center gap-3">
                    {expandedCategory === 'loop' ? <ChevronDown size={18} className="text-zinc-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
                    <Repeat size={18} className="text-orange-600 dark:text-amber-500" />
                    <span className="font-medium text-zinc-900 dark:text-white">{t('categoryLoops', lang)} ({loopsData.length})</span>
                  </div>
                  {loopsData.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAllLoops(); }}
                      className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-zinc-900 dark:text-white rounded-lg transition-all text-xs font-bold"
                    >
                      {t('clearAll', lang)}
                    </button>
                  )}
                </div>
                {expandedCategory === 'loop' && (
                  <div className="p-4 pt-0 space-y-2 border-t border-black/5 dark:border-white/5 mt-2">
                    {loopsData.length === 0 ? (
                      <p className="text-sm text-zinc-500 text-center py-4">{t('noLoopData', lang)}</p>
                    ) : (
                      loopsData.map(l => (
                        <div key={l.videoId} className="flex items-center justify-between bg-white/50 dark:bg-black/20 p-3 rounded-xl">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-sm text-zinc-900 dark:text-white truncate" title={l.videoId}>{l.videoId}</p>
                            <div className="space-y-2 mt-2">
                              {l.loops.map(loop => (
                                <button 
                                  key={loop.id} 
                                  onClick={() => onLoadLoop?.(l.videoId, loop)}
                                  className="w-full flex items-center justify-between text-[10px] bg-orange-500/10 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-2 rounded-md hover:bg-orange-500/20 dark:hover:bg-amber-500/20 transition-colors group/loop"
                                >
                                  <span className="font-bold flex items-center gap-2">
                                    <Repeat size={10} />
                                    {loop.name}
                                  </span>
                                  <span className="font-mono bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    {formatTime(loop.start)} - {formatTime(loop.end)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteLoops(l.videoId)}
                            className="p-2 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Pengaturan Category */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden">
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  onClick={() => toggleCategory('pengaturan')}
                >
                  <div className="flex items-center gap-3">
                    {expandedCategory === 'pengaturan' ? <ChevronDown size={18} className="text-zinc-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
                    <Settings size={18} className="text-orange-600 dark:text-amber-500" />
                    <span className="font-medium text-zinc-900 dark:text-white">{t('categorySettings', lang)}</span>
                  </div>
                </div>
                {expandedCategory === 'pengaturan' && (
                  <div className="p-4 pt-0 space-y-3 border-t border-black/5 dark:border-white/5 mt-2">
                    <div className="bg-white/50 dark:bg-black/20 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <Repeat size={16} />
                        <span className="text-sm">{t('settingRepeat', lang)}</span>
                      </div>
                      <span className="text-xs font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded text-zinc-900 dark:text-white uppercase">
                        {repeatMode}
                      </span>
                    </div>
                    <div className="bg-white/50 dark:bg-black/20 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <Shuffle size={16} />
                        <span className="text-sm">{t('settingShuffle', lang)}</span>
                      </div>
                      <span className="text-xs font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded text-zinc-900 dark:text-white uppercase">
                        {isShuffle ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="bg-white/50 dark:bg-black/20 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <Sparkles size={16} />
                        <span className="text-sm">{t('settingEnhance', lang)}</span>
                      </div>
                      <span className="text-xs font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded text-zinc-900 dark:text-white uppercase">
                        {isEnhance ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="bg-white/50 dark:bg-black/20 p-3 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <Zap size={16} />
                        <span className="text-sm">{t('settingSuperRes', lang)}</span>
                      </div>
                      <span className="text-xs font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded text-zinc-900 dark:text-white uppercase">
                        {isSuperRes ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <div className="bg-white/50 dark:bg-black/20 p-3 rounded-xl flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 mb-1">
                        <Volume2 size={16} />
                        <span className="text-sm">{t('settingAudio', lang)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                          <span className="text-xs text-zinc-500">Normalizer</span>
                          <span className="text-xs font-mono text-zinc-900 dark:text-white">{isAudioNormalized ? 'ON' : 'OFF'}</span>
                        </div>
                        <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                          <span className="text-xs text-zinc-500">Boost</span>
                          <span className="text-xs font-mono text-zinc-900 dark:text-white">{(audioBoost * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="bg-black/5 dark:bg-white/5 p-2 rounded-lg mt-1">
                        <span className="text-xs text-zinc-500 block mb-2">Equalizer (EQ)</span>
                        <div className="flex items-end justify-between h-10 gap-1">
                          {eqGains.map((gain, i) => {
                            const height = Math.max(10, ((gain + 12) / 24) * 100);
                            return (
                              <div key={i} className="flex-1 bg-black/10 dark:bg-white/10 rounded-t-sm relative group">
                                <div 
                                  className="absolute bottom-0 left-0 right-0 bg-amber-500/50 rounded-t-sm"
                                  style={{ height: `${height}%` }}
                                />
                                <div className="opacity-0 group-hover:opacity-100 absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] px-1 py-0.5 rounded pointer-events-none z-10">
                                  {gain > 0 ? '+' : ''}{gain.toFixed(1)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-black/10 dark:border-white/10 bg-white/[0.02] flex gap-4">
          <button 
            onClick={onClearThumbnails}
            className="flex-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-zinc-900 dark:text-white font-bold py-3 rounded-xl transition-all text-xs uppercase tracking-widest border border-red-500/20 flex items-center justify-center gap-2"
          >
            <ImageIcon size={14} />
            {t('clearThumbnailCache', lang)}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-900 dark:text-white font-bold py-3 rounded-xl transition-all text-xs uppercase tracking-widest border border-black/10 dark:border-white/10"
          >
            {t('done', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
