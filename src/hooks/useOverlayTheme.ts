import { useEffect } from 'react';
import { dbService } from '../services/db';

export function useOverlayTheme() {
  useEffect(() => {
    const applyTheme = (mode: 'dark' | 'light' | 'auto') => {
      if (mode === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (mode === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        // Auto (System preference)
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (systemPrefersDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    // Load initial theme settings from db
    dbService.getSettings()
      .then((settings) => {
        const mode = settings.appearanceSettings?.themeMode || 'auto';
        applyTheme(mode);
      })
      .catch((err) => {
        console.warn('Failed to load settings for overlay theme:', err);
      });

    // Handle system preference changes if mode is 'auto'
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemThemeListener = () => {
      dbService.getSettings().then((settings) => {
        const mode = settings.appearanceSettings?.themeMode || 'auto';
        if (mode === 'auto') {
          applyTheme('auto');
        }
      });
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', systemThemeListener);
    } else {
      mediaQuery.addListener(systemThemeListener);
    }

    // Handle live theme mode updates from Electron main process
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    let themeUpdateHandler: any;

    if (ipc) {
      themeUpdateHandler = (_event: any, mode: 'dark' | 'light' | 'auto') => {
        applyTheme(mode);
      };
      ipc.on('theme-mode-updated', themeUpdateHandler);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', systemThemeListener);
      } else {
        mediaQuery.removeListener(systemThemeListener);
      }
      if (ipc && themeUpdateHandler) {
        ipc.removeListener('theme-mode-updated', themeUpdateHandler);
      }
    };
  }, []);
}
