import React, { ReactNode } from 'react';
import { FolderOpen, Save, Trash2, List, LayoutGrid, X, Plus, Link, Download, Upload, Search } from 'lucide-react';
import { t, Language } from '../services/i18n';

export const PlaylistSidebar = ({
  show,
  viewMode,
  onViewModeChange,
  onLoad,
  onSave,
  onClear,
  onClose,
  onFileChange,
  onShowNetworkModal,
  onExportJson,
  onImportJson,
  searchQuery,
  onSearchChange,
  children,
  lang = 'id'
}: {
  show: boolean;
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  onLoad: () => void;
  onSave: () => void;
  onClear: () => void;
  onClose: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShowNetworkModal: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  children: ReactNode;
  lang?: Language;
}) => {
  return (
    <div 
      onContextMenu={(e) => e.stopPropagation()}
      className={`absolute top-0 right-0 bottom-0 w-[420px] bg-white/90 dark:bg-black/95 backdrop-blur-xl border-l border-black/10 dark:border-white/10 z-40 transition-transform duration-500 transform ${show ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
    >
      <div className="px-5 py-6 flex justify-between items-center border-b border-black/10 dark:border-white/10 shrink-0">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide uppercase text-sm">{t('personalCollection', lang)}</h2>
        <div className="flex items-center gap-1.5">
          <button onClick={onLoad} className="p-1.5 rounded transition-colors text-emerald-500 dark:text-emerald-400 hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20" title={t('loadCollectionTooltip', lang)}><FolderOpen size={16}/></button>
          <button onClick={onSave} className="p-1.5 rounded transition-colors text-blue-500 dark:text-blue-400 hover:bg-blue-500/10 dark:hover:bg-blue-500/20" title={t('saveCollectionTooltip', lang)}><Save size={16}/></button>
          <button onClick={onExportJson} className="p-1.5 rounded transition-colors text-purple-500 dark:text-purple-400 hover:bg-purple-500/10 dark:hover:bg-purple-500/20" title={t('exportJsonTooltip', lang)}><Download size={16}/></button>
          <button onClick={onImportJson} className="p-1.5 rounded transition-colors text-pink-500 dark:text-pink-400 hover:bg-pink-500/10 dark:hover:bg-pink-500/20" title={t('importJsonTooltip', lang)}><Upload size={16}/></button>
          <button onClick={onClear} className="p-1.5 rounded transition-colors text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/20" title={t('clearCollectionTooltip', lang)}><Trash2 size={16}/></button>
          <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1"></div>
          <button onClick={() => onViewModeChange('list')} className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/20 dark:bg-amber-500/20' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} title={t('listViewTooltip', lang)}><List size={16}/></button>
          <button onClick={() => onViewModeChange('grid')} className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'text-orange-600 dark:text-amber-500 bg-orange-500/20 dark:bg-amber-500/20' : 'text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10'}`} title={t('gridViewTooltip', lang)}><LayoutGrid size={16}/></button>
          <div className="w-px h-4 bg-black/10 dark:bg-white/10 mx-1"></div>
          <button onClick={onClose} className="text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 p-1.5 rounded-full transition-colors"><X size={20}/></button>
        </div>
      </div>
      
      {/* Search Bar */}
      <div className="px-5 py-3 border-b border-black/5 dark:border-white/5 bg-white/[0.02]">
        <div className="relative group">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-orange-600 dark:text-amber-500 transition-colors" />
          <input 
            type="text"
            placeholder={t('searchVideoPlaceholder', lang)}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 dark:border-amber-500/50 focus:bg-black/10 dark:focus:bg-white/10 transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900 dark:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
        <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-2'}>
          {children}
        </div>
        <label className="mt-4 cursor-pointer bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-orange-600/70 dark:text-amber-500/70 hover:text-orange-600 dark:hover:text-amber-500 p-3 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors border border-dashed border-orange-500/30 dark:border-amber-500/30">
          <Plus size={16} /> {t('addCollection', lang)}
          <input type="file" accept="video/*,audio/*,.ts,.m3u8,.m3u" multiple className="hidden" onChange={onFileChange} />
        </label>
        <button 
          onClick={onShowNetworkModal}
          className="mt-2 w-full cursor-pointer bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-orange-600/70 dark:text-amber-500/70 hover:text-orange-600 dark:hover:text-amber-500 p-3 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors border border-dashed border-orange-500/30 dark:border-amber-500/30"
        >
          <Link size={16} /> {t('sniffViaLink', lang)}
        </button>
      </div>
    </div>
  );
};
