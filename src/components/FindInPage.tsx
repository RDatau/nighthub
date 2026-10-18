import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { t as i18nT, Language } from '../services/i18n';
import { useOverlayTheme } from '../hooks/useOverlayTheme';

export function FindInPage() {
  useOverlayTheme();
  const ipc = (window as any).require ? (window as any).require('electron').ipcRenderer : null;
  
  // Parse language from URL query parameter
  const [lang, setLang] = useState<Language>('id');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewLang = params.get('lang') || 'id';
    setLang(viewLang === 'en' ? 'en' : 'id');
  }, []);

  const [searchText, setSearchText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const [activeMatchOrdinal, setActiveMatchOrdinal] = useState(0);
  const [matches, setMatches] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Translations
  const t = {
    placeholder: i18nT('findPlaceholder', lang),
    matchCase: i18nT('findMatchCase', lang),
    matchWholeWord: i18nT('findMatchWholeWord', lang),
    prev: i18nT('findInPagePrev', lang),
    next: i18nT('findInPageNext', lang),
    options: i18nT('findOptions', lang),
    close: i18nT('findClose', lang),
    noResults: i18nT('findNoResults', lang)
  };

  // Listen to focus trigger from Main process
  useEffect(() => {
    const handleFocusInput = (event: any, data: any) => {
      if (data && data.lang) {
        setLang(data.lang === 'en' ? 'en' : 'id');
      }
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    };
    if (ipc) {
      ipc.on('focus-input', handleFocusInput);
      // Auto focus on load
      setTimeout(() => handleFocusInput(null, null), 150);
      return () => {
        ipc.removeListener('focus-input', handleFocusInput);
      };
    }
  }, [ipc]);

  // Listen for search results from Main process
  useEffect(() => {
    const handleResult = (event: any, result: any) => {
      setActiveMatchOrdinal(result.activeMatchOrdinal);
      setMatches(result.matches);
    };
    if (ipc) {
      ipc.on('found-in-page-result', handleResult);
      return () => {
        ipc.removeListener('found-in-page-result', handleResult);
      };
    }
  }, [ipc]);

  // Core find trigger function
  const triggerFind = (text: string, mCase: boolean, wWord: boolean, next: boolean = false, fwd: boolean = true) => {
    if (!ipc) return;
    if (!text.trim()) {
      ipc.send('stop-find-in-page', { action: 'clearSelection' });
      setActiveMatchOrdinal(0);
      setMatches(0);
      return;
    }
    ipc.send('start-find-in-page', {
      text,
      matchCase: mCase,
      wholeWord: wWord,
      forward: fwd,
      findNext: next
    });
  };

  // Handle typing search query
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearchText(text);
    triggerFind(text, matchCase, wholeWord, false, true);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Shift + Enter -> search backward, Enter -> search forward
      triggerFind(searchText, matchCase, wholeWord, true, !e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  };

  // Prev / Next actions
  const handlePrev = () => {
    triggerFind(searchText, matchCase, wholeWord, true, false);
  };

  const handleNext = () => {
    triggerFind(searchText, matchCase, wholeWord, true, true);
  };

  const handleToggleOptionCase = () => {
    const newVal = !matchCase;
    setMatchCase(newVal);
    triggerFind(searchText, newVal, wholeWord, false, true);
  };

  const handleToggleOptionWhole = () => {
    const newVal = !wholeWord;
    setWholeWord(newVal);
    triggerFind(searchText, matchCase, newVal, false, true);
  };

  const handleClose = () => {
    if (ipc) {
      ipc.send('hide-find-in-page');
    }
  };

  return (
    <div className="w-full flex flex-col bg-white dark:bg-[#1c1c1b] border border-zinc-200 dark:border-[#2d2d2d] rounded-2xl shadow-2xl overflow-hidden select-none font-sans text-zinc-800 dark:text-white">
      {/* Search Input Bar */}
      <div className="flex items-center h-12 px-3 gap-1">
        <Search size={16} className="text-zinc-500 shrink-0 ml-1" />
        
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={t.placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-zinc-800 dark:text-white focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-500 caret-[#ff9f00] font-sans pr-1"
        />

        {/* Matches Status Counter */}
        {searchText && (
          <div className="text-[11px] font-mono text-zinc-500 shrink-0 px-1 select-none">
            {matches > 0 ? `${activeMatchOrdinal}/${matches}` : t.noResults}
          </div>
        )}

        <div className="w-px h-5 bg-zinc-200 dark:bg-[#2a2a2a] mx-1 shrink-0" />

        {/* Up / Prev Button */}
        <button
          onClick={handlePrev}
          disabled={!searchText}
          className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-20 disabled:hover:bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white rounded-lg transition-all"
          title={t.prev}
        >
          <ChevronUp size={16} />
        </button>

        {/* Down / Next Button */}
        <button
          onClick={handleNext}
          disabled={!searchText}
          className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-20 disabled:hover:bg-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white rounded-lg transition-all"
          title={t.next}
        >
          <ChevronDown size={16} />
        </button>

        {/* Search Options Expand Toggle */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          className={`p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white rounded-lg transition-all ${showOptions ? 'bg-[#ff9f00]/10 text-[#ff9f00] hover:text-[#ffaf33]' : ''}`}
          title={t.options}
        >
          <SlidersHorizontal size={15} />
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="p-1.5 hover:bg-red-500/10 hover:text-red-500 text-zinc-500 dark:text-zinc-400 rounded-lg transition-all"
          title={t.close}
        >
          <X size={16} />
        </button>
      </div>

      {/* Slide-out Options Panel */}
      {showOptions && (
        <div className="border-t border-zinc-200 dark:border-[#2a2a2a] bg-zinc-50/95 dark:bg-[#111111]/90 p-3 flex flex-col gap-2.5 text-xs animate-in slide-in-from-top-2 duration-150">
          {/* Match Case Option */}
          <div 
            onClick={handleToggleOptionCase}
            className="flex items-center justify-between cursor-pointer group py-0.5"
          >
            <span className="text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-white transition-colors">{t.matchCase}</span>
            <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ${matchCase ? 'bg-[#ff9f00]' : 'bg-zinc-200 dark:bg-[#2a2a2a]'}`}>
              <div className="w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200 transform translate-x-0" style={{ transform: matchCase ? 'translateX(14px)' : 'translateX(0px)' }} />
            </div>
          </div>

          {/* Match Whole Word Option */}
          <div 
            onClick={handleToggleOptionWhole}
            className="flex items-center justify-between cursor-pointer group py-0.5"
          >
            <span className="text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-white transition-colors">{t.matchWholeWord}</span>
            <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ${wholeWord ? 'bg-[#ff9f00]' : 'bg-zinc-200 dark:bg-[#2a2a2a]'}`}>
              <div className="w-3.5 h-3.5 bg-white rounded-full shadow transition-transform duration-200 transform translate-x-0" style={{ transform: wholeWord ? 'translateX(14px)' : 'translateX(0px)' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
