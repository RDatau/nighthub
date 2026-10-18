import React, { useState, useEffect, useRef } from 'react';
import { 
  Keyboard, X, PlayCircle, Bookmark, Globe, Film, 
  Search, Edit2, RotateCcw, Check, AlertTriangle, 
  Sparkles, SlidersHorizontal, Trash2, Volume2, 
  Subtitles, Monitor, ListMusic, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { t, Language } from '../services/i18n';
import { 
  DEFAULT_COMMANDS, 
  CommandDefinition, 
  CommandCategory,
  getCommandKeys, 
  isCommandCustomized, 
  setCommandShortcut, 
  clearCommandShortcut,
  resetCommandShortcut, 
  resetAllShortcuts, 
  eventToShortcutKeys, 
  formatShortcut, 
  findShortcutConflict,
  subscribeShortcuts
} from '../services/shortcutManager';

export const ShortcutsModal = ({
  show,
  onClose,
  lang = 'id'
}: {
  show: boolean;
  onClose: () => void;
  lang?: Language;
}) => {
  const [activeTab, setActiveTab] = useState<
    'all' | 'playback' | 'audio' | 'subtitles' | 'display' | 'markers' | 'playlist' | 'tools' | 'sniffer'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [, setRerenderToggle] = useState(0);

  // Subscribe to shortcut manager changes
  useEffect(() => {
    return subscribeShortcuts(() => {
      setRerenderToggle(prev => prev + 1);
    });
  }, []);

  // Keyboard capture for rebinding
  useEffect(() => {
    if (!editingCommandId) return;

    const handleKeyCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels editing
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        setEditingCommandId(null);
        setRecordedKeys([]);
        setConflictWarning(null);
        return;
      }

      const keys = eventToShortcutKeys(e);
      if (!keys || keys.length === 0) return;

      setRecordedKeys(keys);

      // Check conflict
      const conflict = findShortcutConflict(keys, editingCommandId);
      if (conflict) {
        const conflictName = t(conflict.nameKey as any, lang) || conflict.id;
        setConflictWarning(`${t('shortcutConflictWarning', lang)}${conflictName}`);
      } else {
        setConflictWarning(null);
      }
    };

    window.addEventListener('keydown', handleKeyCapture, true);
    return () => window.removeEventListener('keydown', handleKeyCapture, true);
  }, [editingCommandId, lang]);

  if (!show) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleSaveRebind = (cmdId: string) => {
    if (recordedKeys.length === 0) return;
    setCommandShortcut(cmdId, recordedKeys);
    setEditingCommandId(null);
    setRecordedKeys([]);
    setConflictWarning(null);
    showToast(t('shortcutAssignedSuccess', lang));
  };

  const handleCancelRebind = () => {
    setEditingCommandId(null);
    setRecordedKeys([]);
    setConflictWarning(null);
  };

  const handleClearSingle = (cmdId: string) => {
    clearCommandShortcut(cmdId);
    showToast(t('shortcutClear', lang) || 'Pintasan dihapus');
  };

  const handleResetSingle = (cmdId: string) => {
    resetCommandShortcut(cmdId);
    showToast(t('resetShortcut', lang));
  };

  const handleResetAll = () => {
    if (window.confirm(lang === 'id' ? 'Kembalikan semua pintasan ke pengaturan bawaan?' : 'Reset all shortcuts to default?')) {
      resetAllShortcuts();
      showToast(lang === 'id' ? 'Semua pintasan dikembalikan ke default' : 'All shortcuts reset to defaults');
    }
  };

  // Filter commands by active tab and search query
  const filteredCommands = DEFAULT_COMMANDS.filter(cmd => {
    if (activeTab !== 'all' && cmd.category !== activeTab) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase().trim();
    const name = (t(cmd.nameKey as any, lang) || '').toLowerCase();
    const currentKeys = getCommandKeys(cmd.id).join(' ').toLowerCase();
    const defaultKeys = cmd.defaultKeys.join(' ').toLowerCase();

    return name.includes(q) || currentKeys.includes(q) || defaultKeys.includes(q);
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'frameNav':
        return <Film size={15} className="text-amber-500" />;
      case 'playback':
        return <PlayCircle size={15} className="text-orange-500" />;
      case 'audio':
        return <Volume2 size={15} className="text-amber-500" />;
      case 'subtitles':
        return <Subtitles size={15} className="text-yellow-500" />;
      case 'display':
        return <Monitor size={15} className="text-blue-500" />;
      case 'markers':
        return <Bookmark size={15} className="text-amber-500" />;
      case 'playlist':
        return <ListMusic size={15} className="text-orange-500" />;
      case 'tools':
        return <SlidersHorizontal size={15} className="text-emerald-500" />;
      case 'sniffer':
        return <Globe size={15} className="text-orange-500" />;
      default:
        return <Keyboard size={15} className="text-zinc-400" />;
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'frameNav':
        return t('categoryFrameNav', lang);
      case 'playback':
        return t('categoryPlayback', lang);
      case 'audio':
        return t('categoryAudio', lang);
      case 'subtitles':
        return t('categorySubtitles', lang);
      case 'display':
        return t('categoryDisplay', lang);
      case 'markers':
        return t('categoryMarkersShortcut', lang);
      case 'playlist':
        return t('categoryPlaylist', lang);
      case 'tools':
        return t('categoryTools', lang);
      case 'sniffer':
        return t('categorySniffer', lang);
      default:
        return category;
    }
  };

  return (
    <motion.div 
      drag
      dragMomentum={false}
      className="absolute bg-white/95 dark:bg-[#0a0502]/98 border border-orange-500/20 dark:border-amber-500/20 rounded-3xl z-50 backdrop-blur-2xl w-[620px] max-w-[95vw] h-[680px] max-h-[90vh] shadow-[rgba(249,115,22,0.2)_0px_10px_40px] dark:shadow-[rgba(245,158,11,0.2)_0px_10px_40px] flex flex-col overflow-hidden text-zinc-800 dark:text-zinc-200"
      style={{ left: 'calc(50% - 310px)', top: 'calc(50% - 340px)' }}
    >
      {/* Drag Handle Area */}
      <div className="w-full h-7 cursor-grab active:cursor-grabbing flex justify-center items-center pt-2 shrink-0">
        <div className="w-12 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
      </div>

      {/* Header */}
      <div className="px-6 pb-3 border-b border-black/10 dark:border-white/10 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-500">
            <Keyboard size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-white leading-tight flex items-center gap-2">
              <span>{t('keyboardShortcutsTitle', lang)}</span>
              <span className="text-[10px] bg-orange-500/10 dark:bg-amber-500/10 text-orange-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-full border border-orange-500/20 dark:border-amber-500/20">
                {t('shortcutTabCustomize', lang)}
              </span>
            </h2>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {t('keyboardShortcutsSubtitle', lang)}
            </p>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
          title="Tutup"
        >
          <X size={18} />
        </button>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-6 mt-2 py-1.5 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium"
          >
            <Check size={14} className="shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and Search Bar */}
      <div className="px-6 pt-3 pb-2 space-y-2.5 shrink-0">
        {/* Search Input */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchShortcutsPlaceholder', lang)}
            className="w-full pl-9 pr-8 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-amber-500/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          {[
            { id: 'all', label: lang === 'id' ? 'Semua' : 'All' },
            { id: 'playback', label: t('categoryPlayback', lang) },
            { id: 'audio', label: t('categoryAudio', lang) },
            { id: 'subtitles', label: t('categorySubtitles', lang) },
            { id: 'display', label: t('categoryDisplay', lang) },
            { id: 'markers', label: t('categoryMarkersShortcut', lang) },
            { id: 'playlist', label: t('categoryPlaylist', lang) },
            { id: 'tools', label: t('categoryTools', lang) },
            { id: 'sniffer', label: t('categorySniffer', lang) }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all text-[11px] ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-black font-bold shadow-sm'
                  : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Frame Navigation Tip Banner */}
      {(activeTab === 'all' || activeTab === 'playback') && !searchQuery && (
        <div className="mx-6 mb-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <Film size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <span>{t('frameNavigationHint', lang)}</span>
        </div>
      )}

      {/* Shortcuts List Content */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2 custom-scrollbar">
        {filteredCommands.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            {lang === 'id' ? 'Tidak ada pintasan yang cocok' : 'No matching shortcuts found'}
          </div>
        ) : (
          filteredCommands.map((cmd) => {
            const isEditing = editingCommandId === cmd.id;
            const currentKeys = getCommandKeys(cmd.id);
            const isCustom = isCommandCustomized(cmd.id);

            return (
              <div 
                key={cmd.id}
                className={`p-2.5 rounded-xl border transition-all ${
                  isEditing
                    ? 'bg-amber-500/10 border-amber-500 shadow-md ring-1 ring-amber-500/30'
                    : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/5 dark:border-white/5 hover:border-black/15 dark:hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Command Info */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-md bg-black/5 dark:bg-white/5 shrink-0">
                      {getCategoryIcon(cmd.category)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                          {t(cmd.nameKey as any, lang) || cmd.id}
                        </span>
                        {isCustom && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-orange-500/20 text-orange-600 dark:text-amber-400 rounded-md border border-orange-500/30">
                            {t('customizedBadge', lang)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        {getCategoryTitle(cmd.category)}
                      </span>
                    </div>
                  </div>

                  {/* Keys & Action Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/50 rounded-lg animate-pulse text-[11px] font-mono font-bold text-amber-800 dark:text-amber-300">
                          {recordedKeys.length > 0 ? (
                            recordedKeys.map((k, idx) => (
                              <React.Fragment key={idx}>
                                {idx > 0 && <span className="text-zinc-400">+</span>}
                                <kbd className="px-1.5 py-0.5 bg-zinc-900 text-amber-400 rounded text-[10px]">
                                  {k}
                                </kbd>
                              </React.Fragment>
                            ))
                          ) : (
                            <span className="text-[10px] italic">{t('pressNewKeys', lang)}</span>
                          )}
                        </div>

                        <button
                          onClick={() => handleSaveRebind(cmd.id)}
                          disabled={recordedKeys.length === 0}
                          className="p-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black rounded-lg transition-all"
                          title="Simpan"
                        >
                          <Check size={13} />
                        </button>

                        <button
                          onClick={handleCancelRebind}
                          className="p-1.5 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 text-zinc-600 dark:text-zinc-300 rounded-lg transition-all"
                          title="Batal"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {/* Key display badges or Unassigned Button */}
                        {currentKeys && currentKeys.length > 0 ? (
                          <div className="flex items-center gap-1">
                            {currentKeys.map((key, kIdx) => (
                              <React.Fragment key={kIdx}>
                                {kIdx > 0 && <span className="text-[10px] text-zinc-400">+</span>}
                                <kbd className="px-1.5 py-0.5 text-[10px] font-bold font-mono text-zinc-800 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded shadow-xs">
                                  {key}
                                </kbd>
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCommandId(cmd.id);
                              setRecordedKeys([]);
                              setConflictWarning(null);
                            }}
                            className="px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-dashed border-amber-500/30 hover:border-amber-500/60 rounded-md transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                          >
                            <Plus size={11} />
                            <span>{t('shortcutAssignKey', lang) || '+ Tetapkan'}</span>
                          </button>
                        )}

                        {/* Edit Button */}
                        <button
                          onClick={() => {
                            setEditingCommandId(cmd.id);
                            setRecordedKeys([]);
                            setConflictWarning(null);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                          title={t('editShortcut', lang)}
                        >
                          <Edit2 size={13} />
                        </button>

                        {/* Clear/Delete Button if has keys */}
                        {currentKeys && currentKeys.length > 0 && (
                          <button
                            onClick={() => handleClearSingle(cmd.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title={t('shortcutClear', lang) || 'Hapus'}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}

                        {/* Reset Single Button */}
                        {isCustom && (
                          <button
                            onClick={() => handleResetSingle(cmd.id)}
                            className="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
                            title={t('resetShortcut', lang)}
                          >
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Conflict warning message */}
                {isEditing && conflictWarning && (
                  <div className="mt-2 text-[10px] text-red-500 dark:text-red-400 flex items-center gap-1.5 bg-red-500/10 p-1.5 rounded-lg">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>{conflictWarning}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-black/10 dark:border-white/10 shrink-0 flex items-center justify-between gap-3 bg-black/[0.01] dark:bg-white/[0.01]">
        <button
          onClick={handleResetAll}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors py-1 px-2 rounded-lg hover:bg-red-500/10"
        >
          <RotateCcw size={13} />
          <span>{t('resetAllShortcuts', lang)}</span>
        </button>

        <button 
          onClick={onClose} 
          className="bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-bold py-2 px-6 rounded-xl transition-all hover:scale-[1.02] duration-300 text-xs uppercase tracking-wider shadow-[rgba(249,115,22,0.2)_0px_5px_15px] dark:shadow-[rgba(245,158,11,0.2)_0px_5px_15px]"
        >
          {t('close', lang)}
        </button>
      </div>
    </motion.div>
  );
};
