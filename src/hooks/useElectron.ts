
import { useCallback } from 'react';

export const useElectron = () => {
  const isElectron = typeof window !== 'undefined' && (window as any).require;

  const logToMain = useCallback((msg: string) => {
    try {
      if (isElectron) {
        const electron = (window as any).require('electron');
        if (electron && electron.ipcRenderer) {
          electron.ipcRenderer.send('log-message', msg);
          return;
        }
      }
      console.log(`[FRONTEND LOG] ${msg}`);
    } catch (e) {
      console.log(`[FRONTEND LOG] ${msg}`);
    }
  }, [isElectron]);

  const getFs = useCallback(() => {
    if (isElectron) {
      return (window as any).require('fs');
    }
    return null;
  }, [isElectron]);

  const getPath = useCallback(() => {
    if (isElectron) {
      return (window as any).require('path');
    }
    return null;
  }, [isElectron]);

  const getIpcRenderer = useCallback(() => {
    if (isElectron) {
      return (window as any).require('electron').ipcRenderer;
    }
    return null;
  }, [isElectron]);

  const getPathForFile = useCallback((file: File) => {
    if (!isElectron) return (file as any).path || null;
    try {
      const { webUtils } = (window as any).require('electron');
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
      return (file as any).path || null;
    } catch (e) {
      return (file as any).path || null;
    }
  }, [isElectron]);

  const getLocalFileUrl = useCallback((filePath: string) => {
    if (!isElectron || !filePath) return '';
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        const proxyUrl = ipcRenderer.sendSync('get-local-file-url-sync', filePath);
        if (proxyUrl) return proxyUrl;
      }
    } catch (e) {
      console.warn('Failed to get local file url via sync IPC:', e);
    }
    // Fallback to file:// protocol for local files in Electron
    let filePathStr = filePath.replace(/\\/g, '/');
    if (!filePathStr.startsWith('/')) filePathStr = '/' + filePathStr;
    return `file://${filePathStr.split('/').map((part: string) => encodeURIComponent(part).replace(/%3A/g, ':')).join('/')}`;
  }, [isElectron]);

  const checkMpvAvailable = useCallback(async (customPath?: string): Promise<{ available: boolean; path?: string; version?: string; error?: string }> => {
    if (!isElectron) {
      return { available: false, error: 'Web environment: Electron Desktop required for native libmpv.' };
    }
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('check-mpv-available', customPath);
      }
    } catch (e: any) {
      return { available: false, error: e?.message || 'IPC error' };
    }
    return { available: false, error: 'IPC renderer not available' };
  }, [isElectron]);

  const checkVapourSynthStatus = useCallback(async (): Promise<{
    available: boolean;
    hasVapourSynth?: boolean;
    hasMvtools?: boolean;
    message?: string;
    installCommand?: string;
    error?: string;
  }> => {
    if (!isElectron) {
      return { available: false, error: 'Web environment: MVTools runs in Electron Desktop mode.' };
    }
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('check-vapoursynth-status');
      }
    } catch (e: any) {
      return { available: false, error: e?.message || 'IPC error' };
    }
    return { available: false, error: 'IPC renderer not available' };
  }, [isElectron]);

  const launchMpvPlayer = useCallback(async (options: {
    filePath: string;
    interpolation?: boolean;
    tscale?: string;
    videoSync?: string;
    enableSvp?: boolean;
    useMvtools?: boolean;
    mvtoolsFps?: number;
    mvtoolsMode?: 'flow' | 'block';
    hwdec?: string;
    customPath?: string;
    startTime?: number;
  }): Promise<{ success: boolean; message?: string; error?: string }> => {
    if (!isElectron) {
      return { success: false, error: 'Web environment: libmpv native engine runs in Electron Desktop mode.' };
    }
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('launch-mpv-player', options);
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to launch mpv' };
    }
    return { success: false, error: 'IPC renderer not available' };
  }, [isElectron]);

  const stopMpvPlayer = useCallback(async (): Promise<{ success: boolean }> => {
    if (!isElectron) return { success: false };
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('stop-mpv-player');
      }
    } catch (e) {
      // ignore
    }
    return { success: false };
  }, [isElectron]);

  const getMpvStatus = useCallback(async (): Promise<{ isRunning: boolean; currentFile?: string; pid?: number }> => {
    if (!isElectron) return { isRunning: false };
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('get-mpv-status');
      }
    } catch (e) {
      // ignore
    }
    return { isRunning: false };
  }, [isElectron]);

  const getAppFeatures = useCallback(async (): Promise<{ enableAIFeatures: boolean; configuredByInstaller?: boolean }> => {
    if (!isElectron) {
      // For web mode or fallback, check localStorage or default to true
      const localPref = localStorage.getItem('nighthub_enable_ai');
      return { enableAIFeatures: localPref !== 'false' };
    }
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('get-app-features');
      }
    } catch (e) {
      // ignore
    }
    const localPref = localStorage.getItem('nighthub_enable_ai');
    return { enableAIFeatures: localPref !== 'false' };
  }, [isElectron]);

  const setAIFeaturesEnabled = useCallback((enabled: boolean) => {
    localStorage.setItem('nighthub_enable_ai', enabled ? 'true' : 'false');
    if (isElectron) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        if (ipcRenderer) {
          ipcRenderer.send('set-ai-features-enabled', enabled);
        }
      } catch (e) {
        // ignore
      }
    }
  }, [isElectron]);

  const trimVideoSegment = useCallback(async (options: {
    inputPath: string;
    startTime: number;
    duration: number;
    suggestedName?: string;
    accurate?: boolean;
  }): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string; method?: string }> => {
    if (!isElectron) {
      return { success: false, error: 'Electron required for native FFmpeg trimming' };
    }
    try {
      const { ipcRenderer } = (window as any).require('electron');
      if (ipcRenderer) {
        return await ipcRenderer.invoke('trim-video-segment', options);
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to trim video' };
    }
    return { success: false, error: 'IPC renderer not available' };
  }, [isElectron]);

  return {
    isElectron,
    logToMain,
    getFs,
    getPath,
    getIpcRenderer,
    getPathForFile,
    getLocalFileUrl,
    checkMpvAvailable,
    checkVapourSynthStatus,
    launchMpvPlayer,
    stopMpvPlayer,
    getMpvStatus,
    getAppFeatures,
    setAIFeaturesEnabled,
    trimVideoSegment
  };
};
