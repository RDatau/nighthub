import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Pause, Square, Maximize, Monitor, 
  Repeat, FileText, Trash2, ChevronRight,
  Settings, Info, Image
} from 'lucide-react';
import { t, Language } from '../services/i18n';

interface ContextMenuProps {
  show: boolean;
  x: number;
  y: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStopPlayback: () => void;
  onToggleFullscreen: () => void;
  onTogglePiP: () => void;
  repeatEnabled: boolean;
  onToggleRepeat: () => void;
  onLoadSubtitle: (file: File) => void;
  onClearPlaylist: () => void;
  lang?: Language;
  onMakeThumbnail?: () => void;
  hasActiveVideo?: boolean;
}

const MenuItem = ({ icon: Icon, label, shortcut, onClick, color = "text-zinc-800 dark:text-zinc-200", hoverBg = "hover:bg-black/5 dark:hover:bg-white/5" }: any) => (
  <button 
    onClick={onClick} 
    className={`w-full flex items-center justify-between px-3 py-2.5 ${hoverBg} transition-all duration-200 group relative gap-4`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <Icon size={16} className={`${color} opacity-70 group-hover:opacity-100 transition-opacity shrink-0`} />
      <span className={`text-sm ${color} font-medium whitespace-nowrap overflow-hidden text-ellipsis`}>{label}</span>
    </div>
    {shortcut && (
      <span className="text-[10px] font-mono text-zinc-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded border border-black/5 dark:border-white/5 group-hover:border-black/10 dark:group-hover:border-white/10 transition-colors shrink-0">
        {shortcut}
      </span>
    )}
  </button>
);

export const ContextMenu = React.memo(({
  show, x, y, isPlaying,
  onTogglePlay, onStopPlayback, onToggleFullscreen, onTogglePiP,
  repeatEnabled, onToggleRepeat,
  onLoadSubtitle, onClearPlaylist,
  lang = 'id',
  onMakeThumbnail,
  hasActiveVideo
}: ContextMenuProps) => {
  const menuRef = React.useRef<HTMLDivElement>(null);
  
  // Adjust position if menu goes off screen
  const top = Math.max(16, Math.min(y, window.innerHeight - 460));
  const left = Math.max(16, Math.min(x, window.innerWidth - 300));

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          ref={menuRef}
          className="fixed z-[100] bg-white/90 dark:bg-[#0a0a0a]/90 border border-black/10 dark:border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl py-2 w-max min-w-[240px] max-w-sm overflow-hidden"
          style={{ top, left }}
        >
          <div className="px-3 py-1 mb-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('quickActions', lang)}</span>
          </div>

          <MenuItem 
            icon={isPlaying ? Pause : Play} 
            label={isPlaying ? t('contextPause', lang) : t('contextPlay', lang)} 
            shortcut="SPACE" 
            onClick={onTogglePlay} 
          />
          
          <MenuItem 
            icon={Square} 
            label={t('contextStop', lang)} 
            onClick={onStopPlayback}
          />

          <div className="h-px bg-black/5 dark:bg-white/5 my-1 mx-2"></div>

          <MenuItem 
            icon={Monitor} 
            label={t('contextPiP', lang)} 
            onClick={onTogglePiP} 
          />
          
          <MenuItem 
            icon={Maximize} 
            label={t('contextFullscreen', lang)} 
            shortcut="F" 
            onClick={onToggleFullscreen} 
          />

          {hasActiveVideo && onMakeThumbnail && (
            <MenuItem 
              icon={Image} 
              label={t('contextMakeThumbnail', lang)} 
              onClick={onMakeThumbnail} 
            />
          )}

          <button 
            onClick={onToggleRepeat} 
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 group gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-4 h-4 flex items-center justify-center text-[10px] font-black tracking-tighter ${repeatEnabled ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-800 dark:text-zinc-200'} opacity-70 group-hover:opacity-100 transition-opacity shrink-0`}>
                A/B
              </div>
              <span className={`text-sm ${repeatEnabled ? 'text-orange-600 dark:text-amber-500' : 'text-zinc-800 dark:text-zinc-200'} font-medium whitespace-nowrap overflow-hidden text-ellipsis`}>{t('contextRepeatAB', lang)}</span>
            </div>
            <div className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${repeatEnabled ? 'bg-orange-500 dark:bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-zinc-900 dark:bg-white transition-all ${repeatEnabled ? 'left-4.5' : 'left-0.5'}`} />
            </div>
          </button>

          <div className="h-px bg-black/5 dark:bg-white/5 my-1 mx-2"></div>

          <label className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 text-zinc-800 dark:text-zinc-200 transition-all duration-200 cursor-pointer group">
            <FileText size={16} className="opacity-70 group-hover:opacity-100 transition-opacity shrink-0" />
            <span className="text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">{t('contextAddSubtitle', lang)}</span>
            <input type="file" accept=".srt,.vtt,.ass,.ssa" className="hidden" onChange={(e) => e.target.files && onLoadSubtitle(e.target.files[0])} />
          </label>

          <div className="h-px bg-black/5 dark:bg-white/5 my-1 mx-2"></div>

          <MenuItem 
            icon={Trash2} 
            label={t('contextClearPlaylist', lang)} 
            onClick={onClearPlaylist}
            color="text-rose-500 dark:text-rose-400"
            hoverBg="hover:bg-rose-500/10 dark:hover:bg-rose-500/20"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
});
