import React from 'react';
import { MapPin, X, BookmarkPlus, Trash2 } from 'lucide-react';
import { t, Language } from '../services/i18n';

export interface Marker {
  id: string;
  time: number;
  label: string;
}

export const MarkerListModal = ({
  show,
  markers,
  formatTime,
  onClose,
  onSeek,
  onRemove,
  lang = 'id'
}: {
  show: boolean;
  markers: Marker[];
  formatTime: (secs: number) => string;
  onClose: () => void;
  onSeek: (time: number) => void;
  onRemove: (id: string) => void;
  lang?: Language;
}) => {
  if (!show) return null;
  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-[#0a0502] border border-orange-500/20 dark:border-amber-500/20 p-6 rounded-3xl z-50 w-[400px] max-h-[80vh] shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-500/20 dark:bg-amber-500/20 flex items-center justify-center border border-orange-500/30 dark:border-amber-500/30">
            <MapPin size={20} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">{t('markerList', lang)}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-colors p-2 rounded-full hover:bg-orange-500/10 dark:hover:bg-amber-500/10">
          <X size={20} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
        {markers.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 flex flex-col items-center gap-3">
            <BookmarkPlus size={32} className="opacity-50" />
            <p>{t('noMarkersAdded', lang)}</p>
          </div>
        ) : (
          markers.map(marker => (
            <div key={marker.id} className="group flex items-center justify-between bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 p-3 rounded-xl transition-all duration-300">
              <div 
                className="flex-1 flex items-center gap-3 cursor-pointer"
                onClick={() => {
                  onSeek(marker.time);
                  onClose();
                }}
              >
                <span className="font-mono text-amber-400 text-sm font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-1 rounded">
                  {formatTime(marker.time)}
                </span>
                <span className="text-zinc-800 dark:text-zinc-200 text-sm font-medium truncate">
                  {marker.label}
                </span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(marker.id);
                }}
                className="text-zinc-500 hover:text-rose-500 p-2 rounded-lg hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                title={t('deleteMarker', lang)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
