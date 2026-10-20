// Shortcut Manager for NightHUB Player
// Manages default and custom keybindings with localStorage persistence

export type CommandCategory = 
  | 'playback'
  | 'audio'
  | 'subtitles'
  | 'display'
  | 'markers'
  | 'playlist'
  | 'tools'
  | 'sniffer'
  | 'frameNav';

export interface CommandDefinition {
  id: string;
  nameKey: string;
  category: CommandCategory;
  defaultKeys: string[];
  secondaryKeys?: string[];
  descriptionKey?: string;
}

export const DEFAULT_COMMANDS: CommandDefinition[] = [
  // ==========================================
  // 1. Pemutaran & Navigasi Frame (Playback)
  // ==========================================
  {
    id: 'togglePlay',
    nameKey: 'shortcutTogglePlay',
    category: 'playback',
    defaultKeys: ['Space'],
  },
  {
    id: 'stopPlayback',
    nameKey: 'shortcutStopPlayback',
    category: 'playback',
    defaultKeys: ['Esc'],
  },
  {
    id: 'restartVideo',
    nameKey: 'shortcutRestartVideo',
    category: 'playback',
    defaultKeys: ['Backspace'],
  },
  {
    id: 'seekForward5',
    nameKey: 'shortcutSeek5sForward',
    category: 'playback',
    defaultKeys: ['→'],
    secondaryKeys: ['L'],
  },
  {
    id: 'seekBackward5',
    nameKey: 'shortcutSeek5sBackward',
    category: 'playback',
    defaultKeys: ['←'],
    secondaryKeys: ['J'],
  },
  {
    id: 'seekForward10',
    nameKey: 'shortcutSeek10sForward',
    category: 'playback',
    defaultKeys: [],
  },
  {
    id: 'seekBackward10',
    nameKey: 'shortcutSeek10sBackward',
    category: 'playback',
    defaultKeys: [],
  },
  {
    id: 'seekForward30',
    nameKey: 'shortcutSeek30sForward',
    category: 'playback',
    defaultKeys: ['Shift', '→'],
    secondaryKeys: ['Ctrl', '→'],
  },
  {
    id: 'seekBackward30',
    nameKey: 'shortcutSeek30sBackward',
    category: 'playback',
    defaultKeys: ['Shift', '←'],
    secondaryKeys: ['Ctrl', '←'],
  },
  {
    id: 'seekForward60',
    nameKey: 'shortcutSeek60sForward',
    category: 'playback',
    defaultKeys: [],
  },
  {
    id: 'seekBackward60',
    nameKey: 'shortcutSeek60sBackward',
    category: 'playback',
    defaultKeys: [],
  },
  {
    id: 'stepFrameForward',
    nameKey: 'shortcutStepFrameForward',
    category: 'playback',
    defaultKeys: ['Shift', '>'],
    secondaryKeys: ['.', '>'],
  },
  {
    id: 'stepFrameBackward',
    nameKey: 'shortcutStepFrameBackward',
    category: 'playback',
    defaultKeys: ['Shift', '<'],
    secondaryKeys: [',', '<'],
  },
  {
    id: 'speedUp',
    nameKey: 'shortcutSpeedUp',
    category: 'playback',
    defaultKeys: [],
  },
  {
    id: 'speedDown',
    nameKey: 'shortcutSpeedDown',
    category: 'playback',
    defaultKeys: [],
  },
  {
    id: 'resetSpeed',
    nameKey: 'shortcutResetSpeed',
    category: 'playback',
    defaultKeys: [],
  },

  // ==========================================
  // 2. Audio, Volume & Equalizer (Audio)
  // ==========================================
  {
    id: 'volumeUp',
    nameKey: 'shortcutVolumeUp',
    category: 'audio',
    defaultKeys: ['↑'],
  },
  {
    id: 'volumeDown',
    nameKey: 'shortcutVolumeDown',
    category: 'audio',
    defaultKeys: ['↓'],
  },
  {
    id: 'toggleMute',
    nameKey: 'shortcutToggleMute',
    category: 'audio',
    defaultKeys: ['M'],
  },
  {
    id: 'cycleAudioTrack',
    nameKey: 'shortcutCycleAudioTrack',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'audioDelayPlus',
    nameKey: 'shortcutAudioDelayPlus',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'audioDelayMinus',
    nameKey: 'shortcutAudioDelayMinus',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'resetAudioDelay',
    nameKey: 'shortcutResetAudioDelay',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'toggleAudioNormalize',
    nameKey: 'shortcutToggleAudioNormalize',
    category: 'audio',
    defaultKeys: ['Alt', 'A'],
  },
  {
    id: 'toggleSwapChannels',
    nameKey: 'shortcutToggleSwapChannels',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'toggleMonoDownmix',
    nameKey: 'shortcutToggleMonoDownmix',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'openAudioSettings',
    nameKey: 'shortcutOpenAudioSettings',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'audioBoostPlus',
    nameKey: 'shortcutAudioBoostPlus',
    category: 'audio',
    defaultKeys: [],
  },
  {
    id: 'audioBoostMinus',
    nameKey: 'shortcutAudioBoostMinus',
    category: 'audio',
    defaultKeys: [],
  },

  // ==========================================
  // 3. Teks Terjemahan (Subtitles)
  // ==========================================
  {
    id: 'toggleSubtitles',
    nameKey: 'shortcutToggleSubtitles',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'cycleSubtitleTrack',
    nameKey: 'shortcutCycleSubtitleTrack',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'subDelayPlus',
    nameKey: 'shortcutSubDelayPlus',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'subDelayMinus',
    nameKey: 'shortcutSubDelayMinus',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'resetSubDelay',
    nameKey: 'shortcutResetSubDelay',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'subSizeIncrease',
    nameKey: 'shortcutSubSizeIncrease',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'subSizeDecrease',
    nameKey: 'shortcutSubSizeDecrease',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'openSubSettings',
    nameKey: 'shortcutOpenSubSettings',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'openSubBrowser',
    nameKey: 'shortcutOpenSubBrowser',
    category: 'subtitles',
    defaultKeys: [],
  },
  {
    id: 'openSubtitleFile',
    nameKey: 'shortcutOpenSubtitleFile',
    category: 'subtitles',
    defaultKeys: [],
  },

  // ==========================================
  // 4. Layar & Visual (Display)
  // ==========================================
  {
    id: 'toggleFullscreen',
    nameKey: 'shortcutToggleFullscreen',
    category: 'display',
    defaultKeys: ['F'],
  },
  {
    id: 'togglePiP',
    nameKey: 'shortcutTogglePiP',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'cycleRotate',
    nameKey: 'shortcutCycleRotate',
    category: 'display',
    defaultKeys: ['Alt', 'K'],
  },
  {
    id: 'cycleAspectRatio',
    nameKey: 'shortcutCycleAspectRatio',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'toggleFlipHorizontal',
    nameKey: 'shortcutToggleFlipHorizontal',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'toggleEnhance',
    nameKey: 'shortcutToggleEnhance',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'toggleSuperRes',
    nameKey: 'shortcutToggleSuperRes',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'toggleAmbientMode',
    nameKey: 'shortcutToggleAmbientMode',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'toggleFrameInterpolation',
    nameKey: 'shortcutToggleFrameInterpolation',
    category: 'display',
    defaultKeys: [],
  },
  {
    id: 'toggleAllControls',
    nameKey: 'shortcutToggleAllControls',
    category: 'display',
    defaultKeys: [],
  },

  // ==========================================
  // 5. A-B Repeat, Penanda & Trim (Markers)
  // ==========================================
  {
    id: 'setPointA',
    nameKey: 'shortcutSetPointA',
    category: 'markers',
    defaultKeys: ['['],
  },
  {
    id: 'setPointB',
    nameKey: 'shortcutSetPointB',
    category: 'markers',
    defaultKeys: [']'],
  },
  {
    id: 'resetPointA',
    nameKey: 'shortcutResetPointA',
    category: 'markers',
    defaultKeys: ['{'],
  },
  {
    id: 'resetPointB',
    nameKey: 'shortcutResetPointB',
    category: 'markers',
    defaultKeys: ['}'],
  },
  {
    id: 'toggleABRepeat',
    nameKey: 'shortcutToggleABRepeat',
    category: 'markers',
    defaultKeys: ['\\'],
  },
  {
    id: 'resetABRepeat',
    nameKey: 'shortcutResetABRepeat',
    category: 'markers',
    defaultKeys: ['|'],
  },
  {
    id: 'saveCurrentLoop',
    nameKey: 'shortcutSaveCurrentLoop',
    category: 'markers',
    defaultKeys: [],
  },
  {
    id: 'toggleLoopList',
    nameKey: 'shortcutToggleLoopList',
    category: 'markers',
    defaultKeys: [],
  },
  {
    id: 'addMarker',
    nameKey: 'shortcutAddMarker',
    category: 'markers',
    defaultKeys: ['B'],
  },
  {
    id: 'toggleMarkerList',
    nameKey: 'shortcutToggleMarkerList',
    category: 'markers',
    defaultKeys: [],
  },
  {
    id: 'nextMarker',
    nameKey: 'shortcutNextMarker',
    category: 'markers',
    defaultKeys: [],
  },
  {
    id: 'prevMarker',
    nameKey: 'shortcutPrevMarker',
    category: 'markers',
    defaultKeys: [],
  },
  {
    id: 'toggleTrim',
    nameKey: 'shortcutToggleTrim',
    category: 'markers',
    defaultKeys: ['Ctrl', 'T'],
  },
  {
    id: 'trimStart',
    nameKey: 'shortcutTrimStart',
    category: 'markers',
    defaultKeys: ['['],
  },
  {
    id: 'trimEnd',
    nameKey: 'shortcutTrimEnd',
    category: 'markers',
    defaultKeys: [']'],
  },

  // ==========================================
  // 6. Daftar Putar & Berkas (Playlist)
  // ==========================================
  {
    id: 'nextVideo',
    nameKey: 'shortcutNext',
    category: 'playlist',
    defaultKeys: ['Shift', 'N'],
  },
  {
    id: 'prevVideo',
    nameKey: 'shortcutPrev',
    category: 'playlist',
    defaultKeys: ['Shift', 'P'],
  },
  {
    id: 'togglePlaylist',
    nameKey: 'shortcutTogglePlaylist',
    category: 'playlist',
    defaultKeys: ['Q'],
  },
  {
    id: 'toggleShuffle',
    nameKey: 'shortcutToggleShuffle',
    category: 'playlist',
    defaultKeys: [],
  },
  {
    id: 'cycleRepeatMode',
    nameKey: 'shortcutCycleRepeatMode',
    category: 'playlist',
    defaultKeys: [],
  },
  {
    id: 'openMediaFile',
    nameKey: 'shortcutOpenMediaFile',
    category: 'playlist',
    defaultKeys: [],
  },
  {
    id: 'openNetworkStream',
    nameKey: 'shortcutOpenNetworkStream',
    category: 'playlist',
    defaultKeys: [],
  },
  {
    id: 'clearPlaylist',
    nameKey: 'shortcutClearPlaylist',
    category: 'playlist',
    defaultKeys: [],
  },

  // ==========================================
  // 7. Alat, Rekam & Jendela (Tools)
  // ==========================================
  {
    id: 'openWebSniffer',
    nameKey: 'shortcutOpenWebSniffer',
    category: 'tools',
    defaultKeys: [],
  },
  {
    id: 'captureScreenshot',
    nameKey: 'shortcutCaptureScreenshot',
    category: 'tools',
    defaultKeys: ['K'],
  },
  {
    id: 'makeThumbnail',
    nameKey: 'shortcutMakeThumbnail',
    category: 'tools',
    defaultKeys: [],
  },
  {
    id: 'toggleRecording',
    nameKey: 'shortcutToggleRecording',
    category: 'tools',
    defaultKeys: ['Shift', 'R'],
  },
  {
    id: 'openSettings',
    nameKey: 'shortcutOpenSettings',
    category: 'tools',
    defaultKeys: [],
  },
  {
    id: 'openShortcutsSheet',
    nameKey: 'shortcutOpenShortcutsSheet',
    category: 'tools',
    defaultKeys: [],
  },
  {
    id: 'openMemoryManager',
    nameKey: 'shortcutOpenMemoryManager',
    category: 'tools',
    defaultKeys: [],
  },
  {
    id: 'minimizeToHome',
    nameKey: 'shortcutMinimizeToHome',
    category: 'tools',
    defaultKeys: [],
  },
  {
    id: 'toggleAlwaysOnTop',
    nameKey: 'shortcutToggleAlwaysOnTop',
    category: 'tools',
    defaultKeys: [],
  },

  // ==========================================
  // 8. Sniffer Browser (sniffer)
  // ==========================================
  {
    id: 'newTab',
    nameKey: 'shortcutNewTab',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'T'],
  },
  {
    id: 'closeTab',
    nameKey: 'shortcutCloseTab',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'W'],
  },
  {
    id: 'duplicateTab',
    nameKey: 'shortcutDuplicateTab',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'Shift', 'K'],
  },
  {
    id: 'nextTab',
    nameKey: 'shortcutNextTab',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'Tab'],
  },
  {
    id: 'prevTab',
    nameKey: 'shortcutPrevTab',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'Shift', 'Tab'],
  },
  {
    id: 'addBookmark',
    nameKey: 'shortcutAddBookmark',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'D'],
  },
  {
    id: 'toggleHistory',
    nameKey: 'shortcutToggleHistory',
    category: 'sniffer',
    defaultKeys: ['Ctrl', 'H'],
  },
  {
    id: 'reloadPage',
    nameKey: 'shortcutReloadPage',
    category: 'sniffer',
    defaultKeys: [],
  },
];

const STORAGE_KEY = 'nighthub_custom_shortcuts';

// Listeners for reactivity across components
type ShortcutChangeListener = () => void;
const listeners = new Set<ShortcutChangeListener>();

export function subscribeShortcuts(listener: ShortcutChangeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (err) {
      console.error('Error in shortcut listener:', err);
    }
  });
}

// Get saved custom overrides
export function getCustomShortcuts(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Get effective keys for a command ID
export function getCommandKeys(id: string): string[] {
  const custom = getCustomShortcuts();
  if (id in custom) {
    return custom[id];
  }
  const cmd = DEFAULT_COMMANDS.find(c => c.id === id);
  return cmd ? cmd.defaultKeys : [];
}

// Check if a command is customized by user (can be empty array if user unassigned it)
export function isCommandCustomized(id: string): boolean {
  const custom = getCustomShortcuts();
  return id in custom;
}

// Assign a new shortcut to a command
export function setCommandShortcut(id: string, keys: string[]) {
  const custom = getCustomShortcuts();
  custom[id] = keys;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch (err) {
    console.error('Failed to save custom shortcut:', err);
  }
  notifyListeners();
}

// Unassign / clear a shortcut from a command
export function clearCommandShortcut(id: string) {
  const custom = getCustomShortcuts();
  custom[id] = [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch (err) {
    console.error('Failed to clear custom shortcut:', err);
  }
  notifyListeners();
}

// Reset a specific command to its default shortcut
export function resetCommandShortcut(id: string) {
  const custom = getCustomShortcuts();
  delete custom[id];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch (err) {
    console.error('Failed to reset custom shortcut:', err);
  }
  notifyListeners();
}

// Reset all commands to defaults
export function resetAllShortcuts() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear custom shortcuts:', err);
  }
  notifyListeners();
}

// Convert a KeyboardEvent into formatted keys e.g. ['Ctrl', 'Shift', 'T']
export function eventToShortcutKeys(e: KeyboardEvent): string[] | null {
  // Ignore single modifier key presses
  const key = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  let normalizedKey = key;
  if (key === ' ') normalizedKey = 'Space';
  else if (key === 'ArrowUp') normalizedKey = '↑';
  else if (key === 'ArrowDown') normalizedKey = '↓';
  else if (key === 'ArrowLeft') normalizedKey = '←';
  else if (key === 'ArrowRight') normalizedKey = '→';
  else if (key === 'Escape') normalizedKey = 'Esc';
  else if (key === 'Enter') normalizedKey = 'Enter';
  else if (key === 'Backspace') normalizedKey = 'Backspace';
  else if (key === 'Delete') normalizedKey = 'Delete';
  else if (key === 'Tab') normalizedKey = 'Tab';
  else if (key.length === 1) {
    normalizedKey = key.toUpperCase();
  }

  parts.push(normalizedKey);
  return parts;
}

// Format keys into display string e.g. "Ctrl + T"
export function formatShortcut(keys: string[]): string {
  return keys.join(' + ');
}

// Test if an incoming KeyboardEvent matches a key pattern
export function matchesKeys(e: KeyboardEvent, targetKeys: string[]): boolean {
  if (!targetKeys || targetKeys.length === 0) return false;

  const hasCtrl = targetKeys.includes('Ctrl') || targetKeys.includes('Meta');
  const hasAlt = targetKeys.includes('Alt');
  const hasShift = targetKeys.includes('Shift');

  const actualCtrl = Boolean(e.ctrlKey || e.metaKey);
  const actualAlt = Boolean(e.altKey);
  const actualShift = Boolean(e.shiftKey);

  if (hasCtrl !== actualCtrl) return false;
  if (hasAlt !== actualAlt) return false;
  // If Shift is expected or not
  if (hasShift !== actualShift) return false;

  // Find the primary non-modifier key in targetKeys
  const mainTarget = targetKeys.find(k => !['Ctrl', 'Meta', 'Alt', 'Shift'].includes(k));
  if (!mainTarget) return false;

  const key = e.key;
  const target = mainTarget.toLowerCase();

  if (target === 'space' && (key === ' ' || e.code === 'Space')) return true;
  if ((target === '→' || target === 'arrowright') && (key === 'ArrowRight' || key.toLowerCase() === 'arrowright')) return true;
  if ((target === '←' || target === 'arrowleft') && (key === 'ArrowLeft' || key.toLowerCase() === 'arrowleft')) return true;
  if ((target === '↑' || target === 'arrowup') && (key === 'ArrowUp' || key.toLowerCase() === 'arrowup')) return true;
  if ((target === '↓' || target === 'arrowdown') && (key === 'ArrowDown' || key.toLowerCase() === 'arrowdown')) return true;
  if (target === 'esc' && (key === 'Escape' || key.toLowerCase() === 'escape')) return true;
  if (target === 'backspace' && key.toLowerCase() === 'backspace') return true;
  if (target === 'enter' && key.toLowerCase() === 'enter') return true;
  if (target === 'tab' && key.toLowerCase() === 'tab') return true;
  if (target === '<' && (key === '<' || key === ',')) return true;
  if (target === '>' && (key === '>' || key === '.')) return true;

  return key.toLowerCase() === target;
}

// Check if KeyboardEvent matches a specific Command ID (respecting user custom overrides and built-in secondary fallbacks)
export function matchesCommand(e: KeyboardEvent, commandId: string): boolean {
  const custom = getCustomShortcuts();
  if (commandId in custom) {
    const keys = custom[commandId];
    if (!keys || keys.length === 0) return false;
    return matchesKeys(e, keys);
  }

  const cmd = DEFAULT_COMMANDS.find(c => c.id === commandId);
  if (!cmd || !cmd.defaultKeys || cmd.defaultKeys.length === 0) return false;

  if (matchesKeys(e, cmd.defaultKeys)) return true;
  if (cmd.secondaryKeys && matchesKeys(e, cmd.secondaryKeys)) return true;

  return false;
}

// Find if a key combination is already used by another command
export function findShortcutConflict(keys: string[], excludeCommandId?: string): CommandDefinition | null {
  if (!keys || keys.length === 0) return null;
  const targetStr = keys.map(k => k.toLowerCase()).sort().join('+');
  const custom = getCustomShortcuts();

  for (const cmd of DEFAULT_COMMANDS) {
    if (excludeCommandId && cmd.id === excludeCommandId) continue;
    const currentKeys = (cmd.id in custom) ? custom[cmd.id] : cmd.defaultKeys;
    if (!currentKeys || currentKeys.length === 0) continue;
    const currentStr = currentKeys.map(k => k.toLowerCase()).sort().join('+');
    if (targetStr === currentStr) {
      return cmd;
    }
  }
  return null;
}
