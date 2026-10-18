import React from 'react';
import { FolderOpen, Trash2, Play } from 'lucide-react';
import { t, Language } from '../services/i18n';

export interface SavedCollection {
  id: string;
  name: string;
  files: { name: string; path?: string; size: number }[];
  createdAt: number;
}

export const LoadCollectionModal = ({
  show,
  collections,
  onSelect,
  onDelete,
  onCancel,
  lang = 'id'
}: {
  show: boolean;
  collections: SavedCollection[];
  onSelect: (collection: SavedCollection) => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
  lang?: Language;
}) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/60 dark:bg-black/80 backdrop-blur-sm">
      <div className="bg-white/90 dark:bg-[#0a0502]/95 border border-orange-500/20 dark:border-amber-500/20 p-8 rounded-3xl z-50 backdrop-blur-2xl w-[480px] max-h-[80vh] shadow-[0_0_80px_rgba(249,115,22,0.2)] dark:shadow-[0_0_80px_rgba(245,158,11,0.2)] flex flex-col items-center text-center overflow-hidden">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-900/40 to-orange-950/20 flex items-center justify-center mb-4 shadow-[0_0_80px_rgba(249,115,22,0.2)] dark:shadow-[0_0_80px_rgba(245,158,11,0.2)] border border-orange-500/30 dark:border-amber-500/30">
          <FolderOpen size={30} className="text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">
          {t('loadCollection', lang)}
        </h2>
        <p className="text-zinc-700 dark:text-zinc-300 text-sm mb-6">
          {t('loadCollectionDesc', lang)}
        </p>
        
        <div className="w-full overflow-y-auto pr-2 custom-scrollbar mb-6 space-y-3">
          {collections.length === 0 ? (
            <div className="py-12 text-zinc-500 italic text-sm">
              {t('noSavedCollections', lang)}
            </div>
          ) : (
            collections.map((col) => (
              <div 
                key={col.id}
                className="group flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-2xl border border-black/5 dark:border-white/5 hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 transition-all duration-300 cursor-pointer"
                onClick={() => onSelect(col)}
              >
                <div className="flex items-center gap-4 text-left">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 dark:bg-amber-500/10 flex items-center justify-center text-orange-600 dark:text-amber-500 group-hover:bg-orange-500 dark:group-hover:bg-amber-500 group-hover:text-black transition-all">
                    <Play size={18} fill="currentColor" />
                  </div>
                  <div>
                    <h3 className="text-zinc-900 dark:text-white font-bold text-sm group-hover:text-orange-400 dark:group-hover:text-amber-400 transition-colors">{col.id === 'play_queue' ? t('playQueue', lang) : col.name}</h3>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">{col.files.length} Video • {new Date(col.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {col.id !== 'play_queue' ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(col.id);
                    }}
                    className="p-2 text-zinc-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                    title={t('deleteCollection', lang)}
                  >
                    <Trash2 size={18} />
                  </button>
                ) : (
                  <div className="w-9 h-9" />
                )}
              </div>
            ))
          )}
        </div>
        
        <button 
          onClick={onCancel} 
          className="w-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl transition-all duration-300 text-sm uppercase tracking-widest"
        >
          {t('close', lang)}
        </button>
      </div>
    </div>
  );
};
