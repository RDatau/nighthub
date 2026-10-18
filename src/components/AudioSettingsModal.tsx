import React from 'react';
import { Volume2, X, Sliders, Zap } from 'lucide-react';
import { t, Language } from '../services/i18n';
import { AudioNormalisationVisualizer } from './AudioNormalisationVisualizer';

export const AudioSettingsModal = ({
  show,
  onClose,
  audioBoost,
  onAudioBoostChange,
  eqGains,
  onEqChange,
  isAudioNormalized = false,
  onToggleAudioNormalize = () => {},
  normalizeThreshold = -50,
  onNormalizeThresholdChange = () => {},
  normalizeGain = 0,
  onNormalizeGainChange = () => {},
  analyserRef,
  lang = 'id'
}: {
  show: boolean;
  onClose: () => void;
  audioBoost: number;
  onAudioBoostChange: (val: number) => void;
  eqGains: number[];
  onEqChange: (index: number, val: number) => void;
  isAudioNormalized?: boolean;
  onToggleAudioNormalize?: () => void;
  normalizeThreshold?: number;
  onNormalizeThresholdChange?: (val: number) => void;
  normalizeGain?: number;
  onNormalizeGainChange?: (val: number) => void;
  analyserRef?: React.MutableRefObject<AnalyserNode | null>;
  lang?: Language;
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/10 dark:bg-black/60">
      <div className="bg-white dark:bg-[#0a0502] border border-orange-500/20 dark:border-amber-500/20 rounded-3xl w-full max-w-md overflow-hidden flex flex-col shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)] max-h-[90vh]">
        <div className="p-6 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 dark:bg-amber-500/10 rounded-lg">
              <Volume2 className="text-orange-600 dark:text-amber-500" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">{t('audioSettingsHeader', lang)}</h2>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Filters & Control Deck</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 rounded-full text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto max-h-[60vh]">
          {/* Audio Boost */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 text-sm font-medium">
                <Zap size={16} className="text-orange-600 dark:text-amber-500" />
                <span>Audio Boost</span>
              </div>
              <span className="text-orange-600 dark:text-amber-500 font-mono text-sm">{(audioBoost * 100).toFixed(0)}%</span>
            </div>
            <input 
              type="range"
              min="1"
              max="3"
              step="0.1"
              value={audioBoost}
              onChange={(e) => onAudioBoostChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider text-center">{t('audioBoostWarning', lang)}</p>
          </div>

          <div className="h-px bg-black/5 dark:bg-white/5"></div>

          {/* Equalizer */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 text-sm font-medium">
              <Sliders size={16} className="text-orange-600 dark:text-amber-500" />
              <span>Equalizer (3-Band)</span>
            </div>
            
            <div className="flex justify-between gap-4 h-40">
              {['Low', 'Mid', 'High'].map((label, i) => (
                <div key={label} className="flex-1 flex flex-col items-center gap-3">
                  <div className="flex-1 w-full flex justify-center relative">
                    <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 bg-black/5 dark:bg-white/5 rounded-full"></div>
                    <input 
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={eqGains[i]}
                      onChange={(e) => onEqChange(i, parseInt(e.target.value))}
                      className="h-full w-6 appearance-none bg-transparent cursor-pointer accent-amber-500 vertical-range"
                      style={{ WebkitAppearance: 'slider-vertical' } as any}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-orange-600 dark:text-amber-500 font-mono text-[10px] mb-1">{eqGains[i] > 0 ? '+' : ''}{eqGains[i]}dB</p>
                    <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-bold">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-black/5 dark:bg-white/5"></div>

          {/* Audio Normalisation */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 text-sm font-medium">
                <Volume2 size={16} className="text-orange-600 dark:text-amber-500" />
                <span>{t('audioNormalize', lang)}</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isAudioNormalized} 
                  onChange={onToggleAudioNormalize}
                  className="sr-only peer" 
                />
                <div className="w-9 h-5 bg-zinc-300 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500 dark:peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <p className="text-[10px] text-zinc-500 uppercase tracking-wider leading-relaxed">
              {t('audioNormalizeDesc', lang)}
            </p>

            {/* Dynamic Real-time Waveform Visualizer */}
            <AudioNormalisationVisualizer 
              isAudioNormalized={isAudioNormalized}
              threshold={normalizeThreshold}
              gain={normalizeGain}
              lang={lang}
              analyserRef={analyserRef}
            />

            {isAudioNormalized && (
              <div className="space-y-4 pt-1 animate-fade-in">
                {/* Threshold Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                      {lang === 'id' ? 'Ambang Batas (Threshold)' : 'Normalisation Threshold'}
                    </span>
                    <span className="font-mono text-orange-600 dark:text-amber-500 font-bold">
                      {normalizeThreshold} dB
                    </span>
                  </div>
                  <input 
                    type="range"
                    min="-100"
                    max="0"
                    step="1"
                    value={normalizeThreshold}
                    onChange={(e) => onNormalizeThresholdChange(parseInt(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  />
                  <span className="text-[10px] text-zinc-500 block leading-tight">
                    {lang === 'id' 
                      ? 'Menentukan batas volume di mana normalisasi mulai aktif.' 
                      : 'Determines the volume level where normalisation starts working.'}
                  </span>
                </div>

                {/* Makeup Gain Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                      {lang === 'id' ? 'Penguatan Tambahan (Gain)' : 'Makeup Gain'}
                    </span>
                    <span className="font-mono text-orange-600 dark:text-amber-500 font-bold">
                      +{normalizeGain} dB
                    </span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="20"
                    step="0.5"
                    value={normalizeGain}
                    onChange={(e) => onNormalizeGainChange(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-black/5 dark:bg-white/5 rounded-full appearance-none cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  />
                  <span className="text-[10px] text-zinc-500 block leading-tight">
                    {lang === 'id' 
                      ? 'Meningkatkan volume keseluruhan setelah suara dinormalisasi.' 
                      : 'Boosts the overall volume after the audio is normalised.'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-black/10 dark:border-white/10 bg-white/[0.02]">
          <button 
            onClick={onClose}
            className="w-full bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition-all text-sm uppercase tracking-widest shadow-[rgba(249,115,22,)] dark:shadow-[rgba(245,158,11,)]"
          >
            {t('apply', lang)}
          </button>
        </div>
      </div>
    </div>
  );
};
