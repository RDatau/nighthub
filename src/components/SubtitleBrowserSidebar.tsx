import React, { ReactNode, RefObject, useState, useMemo, useEffect } from 'react';
import { Subtitles, X, Search, Plus, Download, Save, ChevronDown, ChevronUp, ArrowDown, ArrowUp, ArrowLeftRight } from 'lucide-react';
import { SubtitleLine } from '../hooks/useSubtitles';
import { t, Language } from '../services/i18n';

export const SubtitleBrowserSidebar = ({
  show,
  onClose,
  onFindCurrentSync,
  onAddSubtitleLine,
  onExportSrtFile,
  editingSubId,
  editingSubText,
  onEditingSubTextChange,
  onCancelEdit,
  onSaveEdit,
  listRef,
  subBrowserData = [],
  onSubBrowserDataChange,
  onSelectSub,
  onShowFeedback,
  children,
  lang = 'id',
  getCurrentTime
}: {
  show: boolean;
  onClose: () => void;
  onFindCurrentSync: () => void;
  onAddSubtitleLine: () => void;
  onExportSrtFile: () => void;
  editingSubId: string | null;
  editingSubText: string;
  onEditingSubTextChange: (text: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (text?: string, start?: number, end?: number) => void;
  listRef: RefObject<HTMLDivElement>;
  subBrowserData?: SubtitleLine[];
  onSubBrowserDataChange: (newData: SubtitleLine[]) => void;
  onSelectSub: (id: string, text: string, start: number) => void;
  onShowFeedback: (msg: string) => void;
  children: ReactNode;
  lang?: Language;
  getCurrentTime?: () => number;
}) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1);

  const [editingStart, setEditingStart] = useState('');
  const [editingEnd, setEditingEnd] = useState('');

  useEffect(() => {
    if (editingSubId) {
      const currentSub = subBrowserData.find(s => s.id === editingSubId);
      if (currentSub) {
        setEditingStart(currentSub.start.toString());
        setEditingEnd(currentSub.end.toString());
      }
    } else {
      setEditingStart('');
      setEditingEnd('');
    }
  }, [editingSubId, subBrowserData]);

  const handleSave = () => {
    const startVal = editingStart ? parseFloat(editingStart) : undefined;
    const endVal = editingEnd ? parseFloat(editingEnd) : undefined;
    onSaveEdit(editingSubText, startVal, endVal);
  };

  // Helper to escape regex special characters
  const escapeRegExp = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // Compute matching subtitle indices
  const matchIndices = useMemo(() => {
    if (!findText.trim()) return [];
    const query = findText.toLowerCase();
    const indices: number[] = [];
    subBrowserData.forEach((sub, idx) => {
      if (sub.text.toLowerCase().includes(query)) {
        indices.push(idx);
      }
    });
    return indices;
  }, [findText, subBrowserData]);

  // Reset current index if match list changes
  useEffect(() => {
    if (matchIndices.length === 0) {
      setCurrentMatchIdx(-1);
    } else if (currentMatchIdx >= matchIndices.length) {
      setCurrentMatchIdx(matchIndices.length - 1);
    }
  }, [matchIndices, currentMatchIdx]);

  const handleFindNext = () => {
    if (matchIndices.length === 0) {
      onShowFeedback(t('noMatchingSubtitles', lang));
      return;
    }
    let nextIdx = currentMatchIdx + 1;
    if (nextIdx >= matchIndices.length) {
      nextIdx = 0;
    }
    setCurrentMatchIdx(nextIdx);
    const matchedSub = subBrowserData[matchIndices[nextIdx]];
    onSelectSub(matchedSub.id, matchedSub.text, matchedSub.start);

    // Smooth scroll the matched subtitle into view
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${matchedSub.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleFindPrev = () => {
    if (matchIndices.length === 0) {
      onShowFeedback(t('noMatchingSubtitles', lang));
      return;
    }
    let prevIdx = currentMatchIdx - 1;
    if (prevIdx < 0) {
      prevIdx = matchIndices.length - 1;
    }
    setCurrentMatchIdx(prevIdx);
    const matchedSub = subBrowserData[matchIndices[prevIdx]];
    onSelectSub(matchedSub.id, matchedSub.text, matchedSub.start);

    // Smooth scroll the matched subtitle into view
    setTimeout(() => {
      const el = document.querySelector(`[data-id="${matchedSub.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  };

  const handleReplaceCurrent = () => {
    if (matchIndices.length === 0) {
      onShowFeedback(t('noMatchingSubtitles', lang));
      return;
    }

    let targetMatchIdx = currentMatchIdx;
    if (targetMatchIdx < 0 || targetMatchIdx >= matchIndices.length) {
      targetMatchIdx = 0;
      setCurrentMatchIdx(0);
    }

    const targetIdx = matchIndices[targetMatchIdx];
    const targetSub = subBrowserData[targetIdx];

    const regex = new RegExp(escapeRegExp(findText), 'gi');
    const newText = targetSub.text.replace(regex, replaceText);

    const updatedData = subBrowserData.map((sub, idx) =>
      idx === targetIdx ? { ...sub, text: newText } : sub
    );

    onSubBrowserDataChange(updatedData);
    onShowFeedback(t('subtitlesReplacedOne', lang));

    // Automatically trigger find next to highlight the next match
    setTimeout(() => {
      if (matchIndices.length > 1) {
        handleFindNext();
      }
    }, 100);
  };

  const handleReplaceAll = () => {
    if (matchIndices.length === 0) {
      onShowFeedback(t('noMatchingSubtitles', lang));
      return;
    }

    const regex = new RegExp(escapeRegExp(findText), 'gi');
    const updatedData = subBrowserData.map((sub) => {
      if (sub.text.toLowerCase().includes(findText.toLowerCase())) {
        return { ...sub, text: sub.text.replace(regex, replaceText) };
      }
      return sub;
    });

    onSubBrowserDataChange(updatedData);
    onShowFeedback(t('subtitlesReplacedAll', lang, { count: matchIndices.length }));
    setCurrentMatchIdx(-1);
  };

  return (
    <div 
      onContextMenu={(e) => e.stopPropagation()}
      className={`absolute top-0 right-0 bottom-0 w-96 bg-white/90 dark:bg-black/95 backdrop-blur-xl border-l border-black/10 dark:border-white/10 z-40 transition-transform duration-500 transform ${show ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
    >
      <div className="p-6 flex justify-between items-center border-b border-black/10 dark:border-white/10 shrink-0">
        <h2 className="text-zinc-900 dark:text-zinc-100 font-bold tracking-wide uppercase flex items-center gap-2">
          <Subtitles size={20} className="text-orange-600 dark:text-amber-500" />
          {t('subtitleBrowserHeader', lang)}
        </h2>
        <button onClick={onClose} className="text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 p-1.5 rounded-full transition-colors"><X size={20}/></button>
      </div>
      
      {/* Controls */}
      <div className="p-4 border-b border-black/10 dark:border-white/10 shrink-0 flex flex-col gap-3">
        <div className="flex gap-2">
          <button onClick={onFindCurrentSync} className="flex-1 bg-black/5 dark:bg-white/5 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-amber-500 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 border border-black/5 dark:border-white/5">
            <Search size={14} /> {t('findSync', lang)}
          </button>
          <button onClick={onAddSubtitleLine} className="flex-1 bg-orange-500/20 dark:bg-amber-500/20 hover:bg-orange-500/30 dark:hover:bg-amber-500/30 text-orange-600 dark:text-amber-500 border border-orange-500/30 dark:border-amber-500/30 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
            <Plus size={14} /> {t('add', lang)}
          </button>
        </div>
        <button onClick={onExportSrtFile} className="w-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2">
          <Download size={14} /> {t('saveSrtFile', lang)}
        </button>

        {/* Toggle Find & Replace */}
        <button 
          onClick={() => setShowFindReplace(!showFindReplace)} 
          className={`w-full py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-between border ${showFindReplace ? 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-amber-500 font-bold' : 'bg-black/5 dark:bg-white/5 border-transparent text-zinc-700 dark:text-zinc-300 hover:bg-orange-500/5 dark:hover:bg-amber-500/5'}`}
        >
          <span className="flex items-center gap-2">
            <ArrowLeftRight size={14} /> {t('findReplaceHeader', lang)}
          </span>
          {showFindReplace ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showFindReplace && (
          <div className="flex flex-col gap-2.5 p-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-xl">
            {/* Find field */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">{t('textToFind', lang)}</label>
                {matchIndices.length > 0 && (
                  <span className="text-[10px] font-bold text-orange-600 dark:text-amber-500 font-mono">
                    {t('matchesCount', lang, { current: currentMatchIdx + 1, total: matchIndices.length })}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => {
                    setFindText(e.target.value);
                    setCurrentMatchIdx(-1);
                  }}
                  className="flex-1 bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs p-2 rounded-lg border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none"
                  placeholder={t('searchPlaceholder', lang)}
                />
                <button
                  onClick={handleFindPrev}
                  className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg text-zinc-700 dark:text-zinc-300 transition-colors"
                  title={t('findPrev', lang)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={handleFindNext}
                  className="p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg text-zinc-700 dark:text-zinc-300 transition-colors"
                  title={t('findNext', lang)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            </div>

            {/* Replace field */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">{t('replaceWith', lang)}</label>
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs p-2 rounded-lg border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none"
                placeholder={t('replacePlaceholder', lang)}
              />
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-black/5 dark:border-white/5 mt-1">
              <button
                onClick={handleReplaceCurrent}
                className="w-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-amber-500 border border-orange-500/20 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
              >
                {t('replaceOne', lang)}
              </button>
              <button
                onClick={handleReplaceAll}
                className="w-full bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors shadow-sm"
              >
                {t('replaceAll', lang)}
              </button>
            </div>
          </div>
        )}
        
        {editingSubId && (
          <div className="flex flex-col gap-2 mt-2 p-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10">
            <textarea 
              value={editingSubText}
              onChange={(e) => onEditingSubTextChange(e.target.value)}
              className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-sm p-2 rounded border border-black/10 dark:border-white/10 focus:border-orange-500 dark:border-amber-500 focus:outline-none resize-none h-20"
              placeholder={t('editSubtitlePlaceholder', lang)}
            />
            {/* Start & End Time */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">Set Start Time (detik)</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingStart}
                    onChange={(e) => setEditingStart(e.target.value)}
                    className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs p-2 rounded-lg border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const time = getCurrentTime ? getCurrentTime() : (document.querySelector('video')?.currentTime || 0);
                      const playheadVal = parseFloat(time.toFixed(2));
                      setEditingStart(playheadVal.toString());
                    }}
                    className="px-2 bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 rounded-lg border border-orange-500/30 dark:border-amber-500/30 transition-colors flex items-center justify-center font-bold text-[10px] shrink-0"
                    title={t('useCurrentTimeTooltip', lang)}
                  >
                    CUR
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">Set End Time (detik)</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingEnd}
                    onChange={(e) => setEditingEnd(e.target.value)}
                    className="w-full bg-black/5 dark:bg-black/50 text-zinc-900 dark:text-white text-xs p-2 rounded-lg border border-black/10 dark:border-white/10 focus:border-orange-500 dark:focus:border-amber-500 focus:outline-none font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const time = getCurrentTime ? getCurrentTime() : (document.querySelector('video')?.currentTime || 0);
                      const playheadVal = parseFloat(time.toFixed(2));
                      setEditingEnd(playheadVal.toString());
                    }}
                    className="px-2 bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500 hover:bg-orange-500/20 dark:hover:bg-amber-500/20 rounded-lg border border-orange-500/30 dark:border-amber-500/30 transition-colors flex items-center justify-center font-bold text-[10px] shrink-0"
                    title={t('useCurrentTimeTooltip', lang)}
                  >
                    CUR
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <button onClick={onCancelEdit} className="px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white transition-colors">{t('cancel', lang)}</button>
              <button onClick={handleSave} className="bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1 transition-colors">
                <Save size={14} /> {t('save', lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subtitle List */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2 scroll-smooth custom-scrollbar">
        {children}
      </div>
    </div>
  );
};
