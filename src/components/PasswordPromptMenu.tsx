import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, X } from 'lucide-react';
import { dbService, SavedCredential } from '../services/db';
import { t, Language } from '../services/i18n';
import { useOverlayTheme } from '../hooks/useOverlayTheme';

const getHostname = (urlString: string) => {
  if (!urlString) return '';
  let cleanUrl = urlString.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'http://' + cleanUrl;
  }
  try {
    const parsed = new URL(cleanUrl);
    return parsed.hostname;
  } catch (e) {
    return urlString;
  }
};

const isMatchingHostname = (h1: string, h2: string) => {
  if (!h1 || !h2) return false;
  const cleanHost1 = h1.toLowerCase().replace(/^www\./, '');
  const cleanHost2 = h2.toLowerCase().replace(/^www\./, '');
  if (cleanHost1 === cleanHost2) return true;

  const getApex = (h: string) => {
    const parts = h.split('.');
    if (parts.length > 2) {
      const secondLevelDomains = ['com', 'co', 'net', 'org', 'gov', 'edu', 'mil', 'ac', 'or', 'sch', 'web', 'my'];
      if (secondLevelDomains.includes(parts[parts.length - 2]) && parts.length > 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    return h;
  };

  const apex1 = getApex(cleanHost1);
  const apex2 = getApex(cleanHost2);
  return apex1 === apex2;
};

export function PasswordPromptMenu() {
  useOverlayTheme();
  const [pendingCredential, setPendingCredential] = useState<SavedCredential | null>(null);
  const [isUpdatePrompt, setIsUpdatePrompt] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      // Request initial data from main process to avoid race condition
      ipc.invoke('request-password-prompt-data').then((data: any) => {
        if (data && data.credential) {
          handleCredentialData(data);
        }
      }).catch((err: any) => {
        console.error('Failed to request password prompt data:', err);
      });

      // Also listen for future updates via IPC event
      const showHandler = (_event: any, data: any) => {
        if (data && data.credential) {
          handleCredentialData(data);
        }
      };

      ipc.on('show-password-prompt-data', showHandler);
      return () => {
        ipc.off('show-password-prompt-data', showHandler);
      };
    }
  }, []);

  const handleCredentialData = async (data: { credential: SavedCredential; isUpdatePrompt?: boolean; lang?: string }) => {
    setLang((data.lang === 'id' ? 'id' : 'en') as Language);
    
    const checkDb = async () => {
      try {
        const hostname = getHostname(data.credential.url);
        const allCreds = await dbService.getCredentials();
        const existing = allCreds.find(c => isMatchingHostname(getHostname(c.url), hostname) && c.username === data.credential.username);
        setIsUpdatePrompt(!!existing);
      } catch (err) {
        console.error('Failed to check database for existing credential:', err);
        if (data.isUpdatePrompt !== undefined) {
          setIsUpdatePrompt(data.isUpdatePrompt);
        }
      }
    };

    checkDb();
    setPendingCredential(data.credential);
  };

  // @ts-ignore
  const ipc = window.require ? window.require('electron').ipcRenderer : null;

  const handleCancel = () => {
    if (ipc) {
      ipc.send('hide-password-prompt');
    }
  };

  const handleSaveOrUpdate = async () => {
    if (!pendingCredential) return;
    
    try {
      const hostname = getHostname(pendingCredential.url);
      const allCreds = await dbService.getCredentials();
      const existing = allCreds.find(c => isMatchingHostname(getHostname(c.url), hostname) && c.username === pendingCredential.username);

      const now = Date.now();
      const credToSave: SavedCredential = {
        id: existing ? existing.id : (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)),
        url: pendingCredential.url,
        username: pendingCredential.username,
        password: pendingCredential.password,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now
      };

      await dbService.saveCredential(credToSave);
      
      if (ipc) {
        ipc.send('notify-credentials-changed');
        ipc.send('hide-password-prompt');
      }
    } catch (err) {
      console.error('Failed to save password:', err);
    }
  };

  return (
    <div className="h-screen w-screen bg-transparent overflow-hidden select-none flex flex-col">
      <div className="w-[328px] h-[298px] m-1 bg-white dark:bg-[#1c1c1b] text-zinc-800 dark:text-white rounded-2xl shadow-2xl border border-zinc-200 dark:border-[#2d2d2d] p-3.5 font-sans flex flex-col justify-between select-none box-border">
        {!pendingCredential ? (
          /* Tampilan Loading Indikator Ringan saat data IPC belum masuk pertama kali */
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium animate-pulse">
              Loading credential data...
            </p>
          </div>
        ) : (
          /* Tampilan Menu Utama jika data sudah siap */
          <>
            {/* Header */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                <Key className="text-amber-500" size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate leading-tight">
                  {isUpdatePrompt 
                    ? t('pwdPromptUpdateTitle', lang) 
                    : t('pwdPromptSaveTitle', lang)}
                </h3>
                <p className="text-[9px] text-zinc-450 dark:text-zinc-500 font-medium leading-none">
                  NightHUB Password Manager
                </p>
              </div>
              <button 
                onClick={handleCancel}
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-650 dark:hover:text-zinc-300 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors bg-transparent border-0 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body Inputs */}
            <div className="flex flex-col gap-2 text-[11px]">
              {/* Domain */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  {t('pwdPromptLabelSite', lang)}
                </label>
                <div className="px-2.5 py-1 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-300 select-all truncate font-medium">
                  {getHostname(pendingCredential.url)}
                </div>
              </div>

              {/* Username */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  {t('pwdPromptLabelUser', lang)}
                </label>
                <input
                  type="text"
                  value={pendingCredential.username || ''}
                  onChange={(e) => setPendingCredential(prev => prev ? { ...prev, username: e.target.value } : null)}
                  className="w-full px-2.5 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-white focus:outline-none focus:border-amber-500/50 transition-colors font-medium box-border"
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-0.5">
                <label className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  {t('pwdPromptLabelPwd', lang)}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={pendingCredential.password || ''}
                    onChange={(e) => setPendingCredential(prev => prev ? { ...prev, password: e.target.value } : null)}
                    className="w-full pl-2.5 pr-8 py-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-800 dark:text-white focus:outline-none focus:border-amber-500/50 transition-colors font-mono box-border"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-0.5 p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-650 dark:hover:text-zinc-300 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors bg-transparent border-0 cursor-pointer"
                  >
                    {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end items-center gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-[9px] font-bold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all uppercase tracking-wider bg-transparent border-0 cursor-pointer"
              >
                {t('pwdPromptCancel', lang)}
              </button>
              <button
                onClick={handleSaveOrUpdate}
                className="px-3 py-1.5 text-[9px] font-bold bg-amber-500 hover:bg-amber-600 active:scale-95 text-black rounded-lg transition-all uppercase tracking-wider border-0 cursor-pointer"
              >
                {isUpdatePrompt 
                  ? t('pwdPromptBtnUpdate', lang) 
                  : t('pwdPromptBtnSave', lang)}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}