import React, { useState, useEffect } from 'react';
import { Key, Copy, Check, ShieldAlert, X, Edit2 } from 'lucide-react';
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

  // helper to get apex/registrable domain
  const getApex = (h: string) => {
    const parts = h.split('.');
    if (parts.length > 2) {
      // Check if it has a common two-part TLD (e.g. co.uk, com.br, etc)
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

export function PasswordsMenu() {
  useOverlayTheme();
  const [url, setUrl] = useState('');
  const [lang, setLang] = useState<Language>('en');
  const [credentials, setCredentials] = useState<SavedCredential[]>([]);
  const [copiedUsernameId, setCopiedUsernameId] = useState<string | null>(null);
  const [copiedPasswordId, setCopiedPasswordId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isAutofillTrigger, setIsAutofillTrigger] = useState(false);
  const [autofillBounds, setAutofillBounds] = useState<any>(null);
  const [editingCredential, setEditingCredential] = useState<SavedCredential | null>(null);

  useEffect(() => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      const showHandler = (_: any, data: { url: string; lang: string; isAutofillTrigger?: boolean; bounds?: any }) => {
        const isAutofill = !!data.isAutofillTrigger;
        setUrl(data.url || '');
        setLang((data.lang === 'id' ? 'id' : 'en') as Language);
        setIsAutofillTrigger(isAutofill);
        setAutofillBounds(data.bounds || null);
        
        // Load credentials from database
        dbService.getCredentials().then((allCreds) => {
          const hostname = getHostname(data.url || '');
          const filtered = allCreds.filter(c => isMatchingHostname(getHostname(c.url), hostname));
          setCredentials(allCreds || []);
          setIsVisible(true);
          
          const hasData = filtered.length > 0;
          let calculatedHeight = 380; // fallback
          if (isAutofill) {
            const count = Math.min(filtered.length, 3);
            if (count === 1) {
              calculatedHeight = 160;
            } else if (count === 2) {
              calculatedHeight = 210;
            } else {
              calculatedHeight = 260;
            }
          } else {
            calculatedHeight = 380;
          }

          ipc.send('confirm-show-passwords-menu', {
            hasData: isAutofill ? hasData : true, // Always show for toolbar
            isAutofillTrigger: isAutofill,
            bounds: data.bounds,
            height: calculatedHeight
          });
        }).catch((err) => {
          console.error('Failed to load credentials in menu', err);
          ipc.send('confirm-show-passwords-menu', {
            hasData: false,
            isAutofillTrigger: isAutofill,
            bounds: data.bounds
          });
        });
      };

      const hideHandler = () => {
        setIsVisible(false);
      };

      const editHandler = (_: any, data: { credential: SavedCredential }) => {
        setEditingCredential(data.credential);
        setIsVisible(true);
        ipc.send('confirm-show-passwords-menu', {
          hasData: true,
          isAutofillTrigger: false,
          height: 380
        });
      };

      const handleCredentialsUpdated = () => {
        dbService.getCredentials().then((allCreds) => {
          setCredentials(allCreds || []);
        });
      };

      ipc.on('show-passwords-menu-data', showHandler);
      ipc.on('hide-passwords-menu', hideHandler);
      ipc.on('show-edit-form', editHandler);
      ipc.on('credentials-updated', handleCredentialsUpdated);

      return () => {
        ipc.removeListener('show-passwords-menu-data', showHandler);
        ipc.removeListener('hide-passwords-menu', hideHandler);
        ipc.removeListener('show-edit-form', editHandler);
        ipc.removeListener('credentials-updated', handleCredentialsUpdated);
      };
    }
  }, []);

  const handleCopyUsername = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedUsernameId(id);
    setTimeout(() => setCopiedUsernameId(null), 2000);
  };

  const handleCopyPassword = (id: string, text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedPasswordId(id);
    setTimeout(() => setCopiedPasswordId(null), 2000);
  };

  const handleAutofill = (cred: SavedCredential) => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.send('sniffer-autofill', { username: cred.username, password: cred.password });
      ipc.send('hide-passwords-menu-popup');
    }
  };

  const handleManage = () => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.send('trigger-open-passwords-manager');
      ipc.send('hide-passwords-menu-popup');
    }
  };

  const handleClosePopup = () => {
    // @ts-ignore
    const ipc = window.require ? window.require('electron').ipcRenderer : null;
    if (ipc) {
      ipc.send('hide-passwords-menu-popup');
    }
  };

  if (!isVisible) return null;

  // Render the Edit form when a credential is being edited
  if (editingCredential) {
    return (
      <div className="h-screen w-screen flex flex-col p-4 overflow-hidden select-none bg-transparent">
        <div className="flex flex-col gap-2.5 p-4 bg-white dark:bg-[#1a1a1a] text-zinc-800 dark:text-white border border-black/15 dark:border-white/15 rounded-2xl shadow-2xl h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
            <span className="text-xs font-bold text-zinc-950 dark:text-white flex items-center gap-1.5">
              <Edit2 size={13} className="text-orange-500 dark:text-amber-500" />
              {t('pwdMenuEditTitle', lang)}
            </span>
            <button 
              onClick={() => setEditingCredential(null)}
              className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X size={12} />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar text-xs">
            {/* URL */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                {t('pwdMenuSiteUrl', lang)}
              </label>
              <input
                type="text"
                value={editingCredential.url}
                onChange={(e) => setEditingCredential({ ...editingCredential, url: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-xs text-zinc-950 dark:text-white focus:outline-none focus:border-orange-500/50 dark:focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Username */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                {t('pwdMenuUsername', lang)}
              </label>
              <input
                type="text"
                value={editingCredential.username}
                onChange={(e) => setEditingCredential({ ...editingCredential, username: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-xs text-zinc-950 dark:text-white focus:outline-none focus:border-orange-500/50 dark:focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                {t('pwdMenuPassword', lang)}
              </label>
              <input
                type="text"
                value={editingCredential.password}
                onChange={(e) => setEditingCredential({ ...editingCredential, password: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg text-xs text-zinc-950 dark:text-white focus:outline-none focus:border-orange-500/50 dark:focus:border-amber-500/50 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-black/5 dark:border-white/5 pt-2">
            <button
              onClick={() => {
                setEditingCredential(null);
              }}
              className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 uppercase tracking-wider"
            >
              {t('pwdMenuCancel', lang)}
            </button>
            <button
              onClick={async () => {
                try {
                  const now = Date.now();
                  const updated: SavedCredential = {
                    ...editingCredential,
                    updatedAt: now
                  };
                  await dbService.saveCredential(updated);
                  
                  // @ts-ignore
                  const ipc = window.require ? window.require('electron').ipcRenderer : null;
                  if (ipc) {
                    ipc.send('notify-credentials-changed');
                  }
                  
                  setEditingCredential(null);
                } catch (e) {
                  console.error('Failed to save updated credential', e);
                }
              }}
              className="px-3 py-1.5 text-[10px] font-bold bg-orange-500 hover:bg-orange-600 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-black rounded-lg transition-colors uppercase tracking-wider shadow-sm"
            >
              {t('pwdMenuSave', lang)}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentHostname = getHostname(url);
  const filteredCredentials = credentials.filter(
    (c) => isMatchingHostname(getHostname(c.url), currentHostname)
  );

  // If in autofill mode, render a highly-compact dropdown tailored to overlay input boxes perfectly
  if (isAutofillTrigger) {
    return (
      <div className="h-screen w-screen flex flex-col p-1.5 overflow-hidden select-none bg-transparent font-sans">
        <div className="flex flex-col bg-white dark:bg-[#1c1c1b] text-zinc-800 dark:text-white border border-zinc-200 dark:border-[#2d2d2d] rounded-2xl shadow-2xl h-full p-3 gap-2.5 justify-between">
          {/* Header */}
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100 dark:border-white/5">
            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
              {t('pwdMenuSavedPasswords', lang)}
            </span>
            <button 
              onClick={handleClosePopup}
              className="p-1 rounded text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors bg-transparent border-0 cursor-pointer flex items-center justify-center outline-none"
            >
              <X size={12} />
            </button>
          </div>

          {/* Compact Credential list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1 pr-0.5">
            {filteredCredentials.map((cred) => (
              <button
                key={cred.id}
                onClick={() => handleAutofill(cred)}
                className="w-full text-left p-2 rounded-xl bg-transparent hover:bg-zinc-50 dark:hover:bg-white/5 transition-all flex flex-col gap-0.5 border-0 outline-none cursor-pointer group"
              >
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white truncate max-w-full">
                  {cred.username}
                </span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono tracking-widest leading-none">
                  ••••••••
                </span>
              </button>
            ))}
          </div>

          {/* Footer - Kelola Sandi */}
          <div className="pt-2 border-t border-zinc-100 dark:border-white/5 flex items-center">
            <button 
              onClick={handleManage}
              className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500 hover:underline bg-transparent border-0 outline-none p-0 cursor-pointer"
            >
              <Key size={10} className="shrink-0 text-amber-500" />
              <span>{lang === 'id' ? 'Kelola sandi' : 'Manage passwords'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard drop-down mode (when clicking key button)
  return (
    <div className="h-screen w-screen flex flex-col p-6 overflow-hidden select-none bg-transparent font-sans">
      <div className="flex flex-col gap-3 p-4 bg-white dark:bg-[#1c1c1b] text-zinc-800 dark:text-white border border-zinc-200 dark:border-[#2d2d2d] rounded-2xl shadow-2xl h-fit">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-150 dark:border-[#282828] pb-2.5">
          <div className="flex items-center gap-1.5">
            <Key size={14} className="text-[#ff9f00] fill-[#ff9f00]/10" />
            <div className="flex flex-col">
              <span className="text-xs font-extrabold text-zinc-900 dark:text-white leading-tight">
                {t('pwdMenuSavedForSite', lang)}
              </span>
              {currentHostname && (
                <span className="text-[10px] text-zinc-550 dark:text-zinc-400 truncate max-w-[140px] leading-tight">
                  {currentHostname}
                </span>
              )}
            </div>
          </div>
          
          <button
            onClick={handleManage}
            className="px-2 py-0.5 text-[10px] font-bold text-[#ff9f00] hover:underline bg-transparent border-0 cursor-pointer"
          >
            {t('pwdMenuManage', lang)}
          </button>
        </div>

        {/* Credentials List */}
        {filteredCredentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center gap-1.5">
            <ShieldAlert size={20} className="text-zinc-400 dark:text-zinc-500" />
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {t('pwdMenuNoSaved', lang)}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {filteredCredentials.map((cred) => (
              <div 
                key={cred.id} 
                className="p-3 rounded-xl bg-zinc-50 dark:bg-[#111111] border border-zinc-200 dark:border-[#242424] flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-800 dark:text-white truncate max-w-[150px]">
                    {cred.username}
                  </span>
                  
                  <div className="flex items-center gap-1.5">
                    {/* Edit button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCredential(cred);
                      }}
                      className="p-1 rounded text-zinc-450 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      title={t('pwdMenuEditTooltip', lang)}
                    >
                      <Edit2 size={11} />
                    </button>

                    {/* Copy Username */}
                    <button
                      onClick={(e) => handleCopyUsername(cred.id, cred.username, e)}
                      className={`p-1 rounded transition-all ${
                        copiedUsernameId === cred.id
                          ? 'text-emerald-500 bg-emerald-500/10'
                          : 'text-zinc-450 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                      title={t('pwdMenuCopyUserTooltip', lang)}
                    >
                      {copiedUsernameId === cred.id ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                    
                    {/* Copy Password */}
                    <button
                      onClick={(e) => handleCopyPassword(cred.id, cred.password, e)}
                      className={`p-1 rounded transition-all ${
                        copiedPasswordId === cred.id
                          ? 'text-emerald-500 bg-emerald-500/10'
                          : 'text-zinc-450 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                      title={t('pwdMenuCopyPwdTooltip', lang)}
                    >
                      {copiedPasswordId === cred.id ? <Check size={11} /> : <Key size={11} />}
                    </button>
                  </div>
                </div>

                {/* Autofill Button */}
                <button
                  onClick={() => handleAutofill(cred)}
                  className="w-full py-1.5 text-[10px] font-black uppercase tracking-wider text-center bg-[#ff9f00] hover:bg-[#ffa81a] text-black rounded-lg transition-all shadow-md active:scale-[0.98]"
                >
                  {t('pwdMenuAutofill', lang)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
