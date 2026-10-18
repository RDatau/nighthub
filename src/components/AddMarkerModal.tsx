import React from 'react';
import { BookmarkPlus } from 'lucide-react';
import { t, Language } from '../services/i18n';

export const AddMarkerModal = ({
  show,
  time,
  formatTime,
  label,
  onLabelChange,
  onSubmit,
  onCancel,
  lang = 'id'
}: {
  show: boolean;
  time: number;
  formatTime: (secs: number) => string;
  label: string;
  onLabelChange: (label: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  lang?: Language;
}) => {
  if (!show) return null;
  return (
    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/90 dark:bg-[#0a0502]/95 border border-orange-500/20 dark:border-amber-500/20 p-8 rounded-3xl z-50 backdrop-blur-2xl w-96 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)] flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-900/40 to-orange-900/20 flex items-center justify-center mb-4 shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)] border border-orange-500/30 dark:border-amber-500/30">
        <BookmarkPlus size={36} className="text-amber-400" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2 flex items-center gap-2">
        {t('addMarker', lang).toUpperCase()}
      </h2>
      <p className="text-amber-400 font-mono text-lg mb-4 bg-orange-500/10 dark:bg-amber-500/10 px-3 py-1 rounded-lg border border-orange-500/20 dark:border-amber-500/20">
        {formatTime(time)}
      </p>
      <p className="text-zinc-700 dark:text-zinc-300 text-sm mb-6 leading-relaxed">
        {t('markerNameLabel', lang)}
      </p>
      <input 
        type="text" 
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder={t('markerNamePlaceholder', lang)}
        className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-sm p-3 rounded-xl border border-black/10 dark:border-white/10 focus:border-orange-500 dark:border-amber-500 focus:outline-none mb-6"
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        autoFocus
      />
      <div className="flex gap-3 w-full">
        <button onClick={onCancel} className="flex-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 font-bold py-3 rounded-xl transition-all duration-300 text-sm uppercase tracking-widest">{t('cancel', lang)}</button>
        <button onClick={onSubmit} className="flex-1 bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition-all hover:scale-105 duration-300 text-sm uppercase tracking-widest shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]">{t('add', lang)}</button>
      </div>
    </div>
  );
};
