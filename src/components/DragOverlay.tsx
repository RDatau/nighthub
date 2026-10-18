import React, { useEffect } from 'react';
import { FileVideo, X } from 'lucide-react';
import { t, Language } from '../services/i18n';

export const DragOverlay = ({ 
  isDragging, 
  lang = 'id',
  onClose
}: { 
  isDragging: boolean; 
  lang?: Language;
  onClose?: () => void;
}) => {
  useEffect(() => {
    if (!isDragging || !onClose) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDragging, onClose]);

  const hasActiveModal = typeof document !== 'undefined' && !!(
    document.querySelector('[data-playlist-modal="true"]') ||
    document.querySelector('[data-modal]') ||
    document.querySelector('.backdrop-blur-md') ||
    document.querySelector('.backdrop-blur-sm') ||
    document.querySelector('[role="dialog"]')
  );

  if (!isDragging || hasActiveModal) return null;

  return (
    <div className="absolute inset-0 z-50 bg-white/90 dark:bg-[#050002]/90 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-orange-500/50 dark:border-amber-500/50">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 z-50 cursor-pointer"
          aria-label="Close drag overlay"
          id="btn-close-drag-overlay"
        >
          <X size={28} />
        </button>
      )}
      <div className="w-32 h-32 rounded-full bg-amber-900/30 flex items-center justify-center mb-6 animate-pulse shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]">
        <FileVideo size={64} className="text-orange-600 dark:text-amber-500" />
      </div>
      <h2 className="text-3xl font-bold tracking-widest text-orange-600 dark:text-amber-500 uppercase drop-shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]">
        {t('dropzoneHeader', lang)}
      </h2>
      <p className="text-zinc-700 dark:text-zinc-300 mt-4 tracking-wide font-light">{t('dropzoneSubheader', lang)}</p>
    </div>
  );
};

