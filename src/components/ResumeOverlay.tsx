import React from 'react';
import { Play, X, HardDrive, Clock } from 'lucide-react';
import { t, Language } from '../services/i18n';

export const ResumeOverlay = ({
  show,
  savedTime,
  formatTime,
  onResume,
  onClose,
  lang = 'id',
  fileSize,
  videoDuration
}: {
  show: boolean;
  savedTime: number | null;
  formatTime: (secs: number) => string;
  onResume: () => void;
  onClose: () => void;
  lang?: Language;
  fileSize?: number;
  videoDuration?: number;
}) => {
  if (!show || !savedTime) return null;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return null;
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const sizeStr = formatFileSize(fileSize);

  return (
    <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto">
      <div 
        className="flex flex-col gap-1.5 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 px-4 py-3 rounded-2xl shadow-xl transition-all hover:scale-[1.02] group cursor-pointer min-w-[280px]"
        onClick={onResume}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-orange-500 dark:bg-amber-500 text-white dark:text-zinc-900 w-6 h-6 rounded-full flex items-center justify-center shadow-sm shrink-0">
              <Play size={12} className="fill-current ml-0.5" />
            </div>
            <span className="text-[11px] font-semibold tracking-wide text-zinc-700 dark:text-zinc-300">
              {t('resumeLastQuestion', lang)}
            </span>
          </div>
          <button 
            className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-400 hover:text-orange-600 dark:hover:text-amber-500 transition-colors ml-2"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X size={12} />
          </button>
        </div>

        {/* Metadata badges row */}
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 pt-1.5 border-t border-black/5 dark:border-white/5">
          <span className="text-[10px] font-mono font-bold text-orange-600 dark:text-amber-500 bg-orange-500/10 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-md flex items-center gap-1" title={t('saveResumeStatus', lang)}>
            <Play size={10} />
            {formatTime(savedTime)}
          </span>
          
          {videoDuration && videoDuration > 0 ? (
            <span className="text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-md flex items-center gap-1" title={t('fileDuration', lang)}>
              <Clock size={10} />
              {formatTime(videoDuration)}
            </span>
          ) : null}

          {sizeStr ? (
            <span className="text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-md flex items-center gap-1" title={t('fileSize', lang)}>
              <HardDrive size={10} />
              {sizeStr}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
