import React from 'react';
import { X, Plus, Minus, Type, Palette, Square, Clock } from 'lucide-react';
import { t, Language } from '../services/i18n';

export interface SubSettings {
  size: number;
  color: string;
  bg: string;
  offset?: number;
  bgType?: 'box' | 'line';
  lineHeight?: number;
  fontFamily?: string;
  bgOpacity?: number;
}

export const SubtitleSettingsModal = ({
  show,
  settings,
  onSettingsChange,
  onClose,
  lang = 'id'
}: {
  show: boolean;
  settings: SubSettings;
  onSettingsChange: (settings: SubSettings) => void;
  onClose: () => void;
  lang?: Language;
}) => {
  if (!show) return null;

  const updateOffset = (delta: number) => {
    const current = settings.offset || 0;
    onSettingsChange({ ...settings, offset: Math.round((current + delta) * 10) / 10 });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/10 dark:bg-black/60 backdrop-blur-sm">
      <div className="bg-white/90 dark:bg-[#0a0502]/95 border border-black/10 dark:border-white/10 p-8 rounded-[2rem] z-50 backdrop-blur-2xl w-full max-w-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 dark:bg-amber-500/10 blur-[80px] rounded-full pointer-events-none"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-amber-500/5 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="flex justify-between items-center mb-8 relative z-10">
          <h3 className="text-zinc-900 dark:text-white text-xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 dark:bg-amber-500/10 flex items-center justify-center border border-orange-500/20 dark:border-amber-500/20">
              <Type size={18} className="text-orange-600 dark:text-amber-500" />
            </div>
            {t('textStyle', lang)}
          </h3>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-all border border-black/5 dark:border-white/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-8 relative z-10">
          {/* Size Control */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em]">{t('fontSize', lang)}</label>
              <span className="text-orange-600 dark:text-amber-500 font-mono text-xs font-bold bg-orange-500/10 dark:bg-amber-500/10 px-2 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20">
                {settings.size}px
              </span>
            </div>
            <div className="relative flex items-center group">
              <input 
                type="range" 
                min="12" 
                max="48" 
                value={settings.size} 
                onChange={e => onSettingsChange({...settings, size: Number(e.target.value)})} 
                className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors" 
              />
            </div>
          </div>

          {/* Color Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                <Palette size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('color', lang)}
              </label>
              <div className="relative h-12 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden group hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 transition-all">
                <input 
                  type="color" 
                  value={settings.color} 
                  onChange={e => onSettingsChange({...settings, color: e.target.value})} 
                  className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10" 
                />
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ backgroundColor: settings.color }}
                >
                  <span className="text-[10px] font-bold mix-blend-difference text-zinc-900 dark:text-white uppercase tracking-wider">
                    {settings.color}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
                <Square size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('background', lang)}
              </label>
              <div className="relative h-12 rounded-xl border border-black/10 dark:border-white/10 overflow-hidden group hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 transition-all">
                <input 
                  type="color" 
                  value={settings.bg.slice(0,7)} 
                  onChange={e => onSettingsChange({...settings, bg: e.target.value + '80'})} 
                  className="absolute inset-0 w-full h-full cursor-pointer opacity-0 z-10" 
                />
                <div 
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ backgroundColor: settings.bg }}
                >
                  <span className="text-[10px] font-bold mix-blend-difference text-zinc-900 dark:text-white uppercase tracking-wider">
                    {settings.bg.slice(0,7)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Offset Control - REDESIGNED */}
          <div className="space-y-3">
            <label className="text-zinc-700 dark:text-zinc-300 text-[10px] uppercase font-bold tracking-[0.2em] flex items-center gap-2">
              <Clock size={12} className="text-orange-600/50 dark:text-amber-500/50" /> {t('timeSync', lang)}
            </label>
            <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2 rounded-2xl border border-black/5 dark:border-white/5">
              <button 
                onClick={() => updateOffset(-0.5)} 
                className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white rounded-xl transition-all border border-black/5 dark:border-white/5 active:scale-95"
                title="-0.5s"
              >
                <Minus size={16} />
              </button>
              
              <div className="flex-1 flex flex-col items-center justify-center py-1">
                <span className="text-xl font-mono font-black text-orange-600 dark:text-amber-500 tracking-tighter">
                  {settings.offset || 0}<span className="text-[10px] ml-0.5 opacity-50">S</span>
                </span>
                <span className="text-[8px] text-zinc-500 uppercase font-bold tracking-widest">Offset</span>
              </div>

              <button 
                onClick={() => updateOffset(0.5)} 
                className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white rounded-xl transition-all border border-black/5 dark:border-white/5 active:scale-95"
                title="+0.5s"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose} 
          className="w-full mt-10 bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-black py-4 rounded-2xl transition-all text-xs uppercase tracking-[0.3em] shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)] active:scale-[0.98]"
        >
          {t('saveAndClose', lang)}
        </button>
      </div>
    </div>
  );
};
