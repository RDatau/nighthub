import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Key, Search, Lock, Settings, Plus, Trash2, Eye, EyeOff, Copy, Check, Globe, Sliders, Shield, AlertCircle, Sparkles, RefreshCw, EyeIcon, Edit2, Database, Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { t, Language } from '../services/i18n';
import { dbService, SavedCredential } from '../services/db';
import { getLocalDateString, resolveBrowserDownloadName } from '../services/fileUtils';

interface SavedPassword {
  id: string;
  siteName: string;
  siteUrl: string;
  username: string;
  passwordVal: string;
  notes?: string;
  createdAt: number;
}

interface BrowserSettingsTabProps {
  lang: Language;
  searchEngine: 'google' | 'bing' | 'duckduckgo';
  setSearchEngine: (val: 'google' | 'bing' | 'duckduckgo') => void;
  homeUrl: string;
  setHomeUrl: (val: string) => void;
  adBlockEnabled: boolean;
  setAdBlockEnabled: (val: boolean) => void;
  popupBlockEnabled: boolean;
  setPopupBlockEnabled: (val: boolean) => void;
  adblockStats: { total: number };
  webHistoryCount: number;
  onClearHistory: () => void;
  credentials: SavedCredential[];
  loadCredentials: () => Promise<void>;
  getIpcRenderer: () => any;
}

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

export const BrowserSettingsTab = ({
  lang,
  searchEngine,
  setSearchEngine,
  homeUrl,
  setHomeUrl,
  adBlockEnabled,
  setAdBlockEnabled,
  popupBlockEnabled,
  setPopupBlockEnabled,
  adblockStats,
  webHistoryCount,
  onClearHistory,
  credentials,
  loadCredentials,
  getIpcRenderer
}: BrowserSettingsTabProps) => {
  const [activeMenu, setActiveMenu] = useState<'passwords' | 'browser' | 'privacy'>('passwords');
  
  const passwords: SavedPassword[] = useMemo(() => {
    return credentials.map(c => ({
      id: c.id,
      siteName: getHostname(c.url),
      siteUrl: c.url,
      username: c.username,
      passwordVal: c.password,
      createdAt: c.createdAt,
    }));
  }, [credentials]);

  const [searchQuery, setSearchQuery] = useState('');
  
  // New Password Form States
  const [showAddForm, setShowAddForm] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [passwordVal, setPasswordVal] = useState('');
  const [notes, setNotes] = useState('');
  const [genLength, setGenLength] = useState(16);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Edit Password Form States
  const [editingPwd, setEditingPwd] = useState<SavedPassword | null>(null);
  const [editSiteName, setEditSiteName] = useState('');
  const [editSiteUrl, setEditSiteUrl] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPasswordVal, setEditPasswordVal] = useState('');

  // Home URL setting input
  const [homeInput, setHomeInput] = useState(homeUrl);
  const [showHomeSavedFeedback, setShowHomeSavedFeedback] = useState(false);

  const [acrylicEnabled, setAcrylicEnabled] = useState(true);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [pendingAcrylicVal, setPendingAcrylicVal] = useState(true);

  // Password Database Management States (Isolated from NightHUB General DB)
  const [showDeleteDbConfirm, setShowDeleteDbConfirm] = useState(false);
  const [isDeletingDb, setIsDeletingDb] = useState(false);
  const [dbNotification, setDbNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.invoke('get-acrylic-enabled').then((enabled: boolean) => {
        setAcrylicEnabled(enabled);
        setPendingAcrylicVal(enabled);
      }).catch(() => {
        const saved = localStorage.getItem('snifferAcrylicEnabled');
        const isEnabled = saved !== 'false';
        setAcrylicEnabled(isEnabled);
        setPendingAcrylicVal(isEnabled);
      });
    } else {
      const saved = localStorage.getItem('snifferAcrylicEnabled');
      const isEnabled = saved !== 'false';
      setAcrylicEnabled(isEnabled);
      setPendingAcrylicVal(isEnabled);
    }
  }, [getIpcRenderer]);

  const handleToggleAcrylic = (checked: boolean) => {
    setPendingAcrylicVal(checked);
    setShowRestartConfirm(true);
  };

  // Load passwords and migrate on mount
  useEffect(() => {
    const migrateAndLoad = async () => {
      const old = localStorage.getItem('nighthub_passwords');
      if (old) {
        try {
          const list = JSON.parse(old);
          for (const item of list) {
            const existingList = await dbService.getCredentials();
            const exists = existingList.some(c => c.username === item.username && getHostname(c.url) === getHostname(item.siteUrl));
            if (!exists) {
              const cred: SavedCredential = {
                id: item.id || `pwd-${Date.now()}-${Math.random()}`,
                url: item.siteUrl || item.siteName || '',
                username: item.username || '',
                password: item.passwordVal || '',
                createdAt: item.createdAt || Date.now(),
                updatedAt: Date.now()
              };
              await dbService.saveCredential(cred);
            }
          }
          localStorage.removeItem('nighthub_passwords');
        } catch (e) {
          console.error('Failed to migrate passwords', e);
        }
      }
      await loadCredentials();
    };
    migrateAndLoad();
  }, [loadCredentials]);

  // Generate Password
  const handleGeneratePassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let generated = "";
    for (let i = 0; i < genLength; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPasswordVal(generated);
  };

  // Calculate Password Strength
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { label: '', color: 'bg-zinc-200' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) return { label: lang === 'id' ? 'Lemah' : 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { label: lang === 'id' ? 'Sedang' : 'Medium', color: 'bg-amber-500' };
    return { label: lang === 'id' ? 'Kuat' : 'Strong', color: 'bg-emerald-500' };
  };

  // Add password
  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName || !username || !passwordVal) return;

    let formattedUrl = siteUrl.trim();
    if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const newCredential: SavedCredential = {
      id: `pwd-${Date.now()}`,
      url: formattedUrl || siteName.trim(),
      username: username.trim(),
      password: passwordVal,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await dbService.saveCredential(newCredential);
    await loadCredentials();
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('notify-credentials-changed');
    }
    
    // Reset Form
    setSiteName('');
    setSiteUrl('');
    setUsername('');
    setPasswordVal('');
    setNotes('');
    setShowAddForm(false);
  };

  // Generate Edit Password
  const handleGenerateEditPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
    let generated = "";
    for (let i = 0; i < genLength; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setEditPasswordVal(generated);
  };

  // Update password
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPwd || !editSiteName || !editUsername || !editPasswordVal) return;

    let formattedUrl = editSiteUrl.trim();
    if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const updatedCredential: SavedCredential = {
      id: editingPwd.id,
      url: formattedUrl || editSiteName.trim(),
      username: editUsername.trim(),
      password: editPasswordVal,
      createdAt: editingPwd.createdAt,
      updatedAt: Date.now()
    };

    await dbService.saveCredential(updatedCredential);
    await loadCredentials();
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('notify-credentials-changed');
    }

    setEditingPwd(null);
  };

  const handleStartEdit = (pwd: SavedPassword) => {
    setEditingPwd(pwd);
    setEditSiteName(pwd.siteName);
    setEditSiteUrl(pwd.siteUrl || '');
    setEditUsername(pwd.username);
    setEditPasswordVal(pwd.passwordVal);
    setShowAddForm(false); // hide add form if editing
  };

  // Delete password
  const handleDeletePassword = async (id: string) => {
    await dbService.deleteCredential(id);
    await loadCredentials();
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('notify-credentials-changed');
    }
  };

  // Copy to clipboard helper
  const handleCopyToClipboard = (text: string, copyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(copyId);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSaveHomeUrl = () => {
    let formattedHome = homeInput.trim();
    if (formattedHome && !/^https?:\/\//i.test(formattedHome)) {
      formattedHome = `https://${formattedHome}`;
    }
    setHomeUrl(formattedHome);
    localStorage.setItem('snifferHomeUrl', formattedHome);
    setShowHomeSavedFeedback(true);
    setTimeout(() => setShowHomeSavedFeedback(false), 2000);
  };

  // Process CSV Text into saved credentials
  const processCSVText = async (text: string) => {
    try {
      if (!text) return;

      const parseCSV = (csvText: string) => {
        const lines = csvText.split(/\r?\n/);
        if (lines.length < 2) return [];

        const results = [];
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        const nameIdx = headers.indexOf('name') !== -1 ? headers.indexOf('name') : 0;
        const urlIdx = headers.indexOf('url') !== -1 ? headers.indexOf('url') : 1;
        const userIdx = headers.indexOf('username') !== -1 ? headers.indexOf('username') : 2;
        const passIdx = headers.indexOf('password') !== -1 ? headers.indexOf('password') : 3;
        const noteIdx = headers.indexOf('note') !== -1 ? headers.indexOf('note') : 4;

        const parseLine = (line: string) => {
          const fields = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              fields.push(current);
              current = '';
            } else {
              current += char;
            }
          }
          fields.push(current);
          return fields.map(f => {
            let s = f.trim();
            if (s.startsWith('"') && s.endsWith('"')) {
              s = s.slice(1, -1);
            }
            return s;
          });
        };

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const fields = parseLine(line);
          if (fields.length === 0) continue;

          const name = fields[nameIdx] || '';
          const url = fields[urlIdx] || '';
          const username = fields[userIdx] || '';
          const password = fields[passIdx] || '';
          const note = fields[noteIdx] || '';

          if (url && (username || password)) {
            results.push({ name, url, username, password, note });
          }
        }
        return results;
      };

      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setDbNotification({
          type: 'error',
          message: lang === 'id' ? 'Format CSV tidak valid atau tidak ada data yang bisa diimpor.' : 'Invalid CSV format or no data to import.'
        });
        return;
      }

      const now = Date.now();
      const validated: SavedPassword[] = parsed.map((item, idx) => {
        let siteNameFallback = item.url;
        try {
          if (item.url.includes('://')) {
            siteNameFallback = new URL(item.url).hostname || item.url;
          }
        } catch (e) {}

        return {
          id: `pwd-${now}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          siteName: item.name || siteNameFallback,
          siteUrl: item.url,
          username: item.username,
          passwordVal: item.password,
          notes: item.note,
          createdAt: now
        };
      });

      if (validated.length > 0) {
        for (const item of validated) {
          const cred: SavedCredential = {
            id: item.id,
            url: item.siteUrl || item.siteName,
            username: item.username,
            password: item.passwordVal,
            createdAt: item.createdAt,
            updatedAt: Date.now()
          };
          await dbService.saveCredential(cred);
        }
        await loadCredentials();
        const ipc = getIpcRenderer();
        if (ipc) {
          ipc.send('notify-credentials-changed');
        }
        setDbNotification({
          type: 'success',
          message: lang === 'id'
            ? `Berhasil mengimpor ${validated.length} kata sandi dari file CSV!`
            : `Successfully imported ${validated.length} passwords from CSV file!`
        });
        setTimeout(() => setDbNotification(null), 4000);
      } else {
        setDbNotification({
          type: 'error',
          message: lang === 'id' ? 'Tidak ada data valid yang ditemukan dalam file CSV.' : 'No valid credentials found in CSV file.'
        });
      }
    } catch (err) {
      console.error(err);
      setDbNotification({
        type: 'error',
        message: lang === 'id' ? 'Gagal membaca atau mengimpor file CSV.' : 'Failed to read or import CSV file.'
      });
    }
  };

  // Trigger file import dialog
  const triggerImport = async () => {
    const isElectron = !!((window as any).electron || (window as any).require?.('electron'));
    const ipc = (window as any).electron?.ipcRenderer || (window as any).require?.('electron')?.ipcRenderer;

    if (isElectron && ipc && typeof ipc.invoke === 'function') {
      try {
        const res = await ipc.invoke('show-open-dialog', {
          title: lang === 'id' ? 'Impor Kata Sandi dari CSV' : 'Import Passwords from CSV',
          filters: [
            { name: 'CSV File (*.csv)', extensions: ['csv'] },
            { name: lang === 'id' ? 'Berkas Teks (*.txt)' : 'Text File (*.txt)', extensions: ['txt'] },
            { name: lang === 'id' ? 'Semua Berkas (*.*)' : 'All Files (*.*)', extensions: ['*'] }
          ],
          properties: ['openFile']
        });
        if (!res.canceled && res.filePaths && res.filePaths[0]) {
          const readRes = await ipc.invoke('read-file-text', res.filePaths[0]);
          if (readRes && readRes.success) {
            await processCSVText(readRes.content);
            return;
          }
        } else {
          return;
        }
      } catch (e) {
        console.warn('Native open dialog failed, falling back:', e);
      }
    }

    if (csvFileInputRef.current) {
      csvFileInputRef.current.value = '';
      csvFileInputRef.current.click();
    }
  };

  // Export Passwords to CSV
  const handleExportCSV = async () => {
    try {
      if (passwords.length === 0) return;
      const escapeCSVField = (val: string) => {
        if (!val) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvRows = [
        'name,url,username,password,note',
        ...passwords.map(p => {
          const name = escapeCSVField(p.siteName);
          const url = escapeCSVField(p.siteUrl);
          const username = escapeCSVField(p.username);
          const password = escapeCSVField(p.passwordVal);
          const note = escapeCSVField(p.notes || '');
          return `${name},${url},${username},${password},${note}`;
        })
      ];

      const csvContent = '\ufeff' + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const localDate = getLocalDateString();
      const fileName = `nighthub_passwords_backup_${localDate}.csv`;

      const isElectron = !!((window as any).electron || (window as any).require?.('electron'));
      const ipc = (window as any).electron?.ipcRenderer || (window as any).require?.('electron')?.ipcRenderer;

      if (isElectron && ipc && typeof ipc.invoke === 'function') {
        const arrayBuffer = await blob.arrayBuffer();
        let base64;
        if (typeof Buffer !== 'undefined') {
          base64 = Buffer.from(arrayBuffer).toString('base64');
        } else {
          base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        }
        const res = await ipc.invoke('save-file', {
          fileName,
          data: base64,
          contentType: 'text/csv',
          options: {
            description: lang === 'id' ? 'Berkas CSV Kata Sandi' : 'CSV Passwords Backup',
            accept: { 'text/csv': ['.csv'] }
          }
        });
        if (res && res.success) {
          setDbNotification({
            type: 'success',
            message: lang === 'id' ? 'Kata sandi berhasil diekspor ke CSV.' : 'Passwords exported successfully to CSV.'
          });
          return;
        } else if (res && res.cancelled) {
          return;
        }
      }

      const webDownloadName = resolveBrowserDownloadName(fileName);
      const urlBlob = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', urlBlob);
      link.setAttribute('download', webDownloadName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(urlBlob);
    } catch (e) {
      console.error('Failed to export CSV:', e);
      setDbNotification({
        type: 'error',
        message: lang === 'id' ? 'Gagal mengekspor kata sandi ke CSV.' : 'Failed to export CSV passwords.'
      });
    }
  };

  // Import Passwords from CSV File
  const handleImportCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        await processCSVText(text);
      }
    };
    reader.readAsText(file);
  };

  // Delete Password Database (Isolated from NightHUB General DB)
  const handleDeletePasswordDatabase = async () => {
    setIsDeletingDb(true);
    try {
      await dbService.clearCredentials();
      localStorage.removeItem('nighthub_passwords');
      await loadCredentials();
      const ipc = getIpcRenderer();
      if (ipc) {
        ipc.send('notify-credentials-changed');
      }
      setShowDeleteDbConfirm(false);
      setDbNotification({
        type: 'success',
        message: lang === 'id'
          ? 'Database kata sandi brankas berhasil dihapus. Anda kini dapat mengimpor file cadangan baru.'
          : 'Password database has been deleted. You can now import a new backup file.'
      });
      setTimeout(() => setDbNotification(null), 5000);
    } catch (err) {
      console.error('Failed to clear password database:', err);
      setDbNotification({
        type: 'error',
        message: lang === 'id' ? 'Gagal menghapus database kata sandi.' : 'Failed to delete password database.'
      });
    } finally {
      setIsDeletingDb(false);
    }
  };

  // Filtered Passwords
  const filteredPasswords = passwords.filter(p => {
    const query = searchQuery.toLowerCase();
    return (
      p.siteName.toLowerCase().includes(query) ||
      p.siteUrl.toLowerCase().includes(query) ||
      p.username.toLowerCase().includes(query) ||
      (p.notes && p.notes.toLowerCase().includes(query))
    );
  });

  return (
    <div className="w-full h-full flex bg-zinc-50 dark:bg-[#0d0704] text-zinc-800 dark:text-zinc-100 font-sans select-text overflow-hidden">
      {/* Sidebar Controls */}
      <div className="w-64 bg-zinc-100/50 dark:bg-black/30 border-r border-zinc-200 dark:border-white/5 p-4 flex flex-col gap-1 select-none">
        <div className="px-3 py-2 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border-b border-zinc-200 dark:border-white/5 mb-3 flex items-center gap-2">
          <Settings size={12} className="text-orange-500 dark:text-amber-500" />
          <span>{lang === 'id' ? 'Browser Control Center' : 'Browser Control Center'}</span>
        </div>
        
        <button
          onClick={() => setActiveMenu('passwords')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left ${
            activeMenu === 'passwords'
              ? 'bg-orange-500/10 text-orange-600 dark:text-amber-500 border border-orange-500/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-white/5 border border-transparent'
          }`}
        >
          <Key size={16} />
          <span>{lang === 'id' ? 'Pengelola Kata Sandi' : 'Password Manager'}</span>
        </button>

        <button
          onClick={() => setActiveMenu('browser')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left ${
            activeMenu === 'browser'
              ? 'bg-orange-500/10 text-orange-600 dark:text-amber-500 border border-orange-500/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-white/5 border border-transparent'
          }`}
        >
          <Sliders size={16} />
          <span>{lang === 'id' ? 'Konfigurasi Browser' : 'Browser Configurations'}</span>
        </button>

        <button
          onClick={() => setActiveMenu('privacy')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all text-left ${
            activeMenu === 'privacy'
              ? 'bg-orange-500/10 text-orange-600 dark:text-amber-500 border border-orange-500/20'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/50 dark:hover:bg-white/5 border border-transparent'
          }`}
        >
          <Lock size={16} />
          <span>{lang === 'id' ? 'Privasi & Keamanan' : 'Privacy & Security'}</span>
        </button>

        <div className="mt-auto p-3 bg-zinc-100 dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-white/5 text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-orange-500/80 dark:text-amber-500/80">
            <Shield size={12} />
            <span>Local Vault</span>
          </div>
          <p className="leading-relaxed">
            {lang === 'id' 
              ? 'Semua kata sandi dienkripsi lokal pada penyimpanan peramban Anda. Tidak ada data yang dikirim keluar.' 
              : 'All credentials are encrypted and stored safely inside your local browser vault. No data ever leaves your device.'}
          </p>
        </div>
      </div>

      {/* Main Content Pane */}
      <div className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-white to-zinc-50 dark:from-[#0c0603] dark:to-[#120a06] custom-scrollbar">
        {activeMenu === 'passwords' && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-white/5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Key className="text-orange-500 dark:text-amber-500" />
                    <span>{lang === 'id' ? 'Pengelola Kata Sandi' : 'Password Manager'}</span>
                  </h2>
                </div>
                <p className="text-sm text-zinc-500 mt-1">
                  {lang === 'id' 
                    ? 'Simpan, hasilkan, dan kelola kredensial Anda untuk situs web dengan aman di database lokal.' 
                    : 'Securely store, generate, and autofill credentials for the websites you browse in your local database.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={triggerImport}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-200/70 hover:bg-zinc-300 dark:bg-white/5 dark:hover:bg-white/10 text-zinc-800 dark:text-zinc-200 text-xs font-bold rounded-xl transition-all border border-zinc-300/80 dark:border-white/10 active:scale-95 cursor-pointer"
                  title={lang === 'id' ? 'Impor kata sandi dari file CSV' : 'Import passwords from CSV file'}
                >
                  <Upload size={14} className="text-orange-500 dark:text-amber-500" />
                  <span>{lang === 'id' ? 'Impor (.csv)' : 'Import (.csv)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={passwords.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-zinc-200/70 hover:bg-zinc-300 dark:bg-white/5 dark:hover:bg-white/10 disabled:opacity-40 text-zinc-800 dark:text-zinc-200 text-xs font-bold rounded-xl transition-all border border-zinc-300/80 dark:border-white/10 active:scale-95 disabled:active:scale-100 cursor-pointer"
                  title={lang === 'id' ? 'Ekspor seluruh kata sandi ke file CSV' : 'Export all passwords to CSV file'}
                >
                  <Download size={14} className="text-orange-500 dark:text-amber-500" />
                  <span>{lang === 'id' ? 'Ekspor (.csv)' : 'Export (.csv)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteDbConfirm(true)}
                  disabled={passwords.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white disabled:opacity-30 disabled:hover:bg-red-500/10 disabled:hover:text-red-600 text-xs font-bold rounded-xl transition-all border border-red-500/20 active:scale-95 disabled:active:scale-100 cursor-pointer"
                  title={lang === 'id' ? 'Hapus Database Password (Terpisah dari Database NightHUB)' : 'Delete Password Database (Separated from NightHUB DB)'}
                >
                  <Trash2 size={14} />
                  <span>{lang === 'id' ? 'Hapus Database' : 'Delete Database'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(!showAddForm);
                    setEditingPwd(null);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>{lang === 'id' ? 'Tambah Kata Sandi' : 'Add Password'}</span>
                </button>
              </div>
            </div>

            {/* Add New Password Form */}
            {showAddForm && (
              <form onSubmit={handleAddPassword} className="p-5 bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 rounded-2xl flex flex-col gap-4 animate-in fade-in duration-300">
                <div className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                  <Sparkles size={12} />
                  <span>{lang === 'id' ? 'Simpan Kredensial Baru' : 'Save New Credential'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Nama Situs' : 'Site Name'}</label>
                    <input
                      type="text"
                      required
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="e.g. Netflix, Google, GitHub"
                      className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'URL Situs' : 'Site URL'}</label>
                    <input
                      type="text"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                      placeholder="e.g. netflix.com, github.com"
                      className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Nama Pengguna / Email' : 'Username / Email'}</label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. user@gmail.com, nighthub_user"
                      className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Kata Sandi' : 'Password'}</label>
                      <button
                        type="button"
                        onClick={handleGeneratePassword}
                        className="text-[10px] text-orange-500 dark:text-amber-500 hover:underline font-bold uppercase tracking-wider flex items-center gap-1"
                      >
                        <Sparkles size={10} />
                        <span>{lang === 'id' ? 'Acak Kuat' : 'Auto Generate'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={passwordVal}
                        onChange={(e) => setPasswordVal(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl pl-3 pr-10 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50 font-mono"
                      />
                    </div>
                    {passwordVal && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${getPasswordStrength(passwordVal).color} transition-all duration-300`} style={{ width: getPasswordStrength(passwordVal).label === (lang === 'id' ? 'Kuat' : 'Strong') ? '100%' : getPasswordStrength(passwordVal).label === (lang === 'id' ? 'Sedang' : 'Medium') ? '66%' : '33%' }} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {getPasswordStrength(passwordVal).label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Catatan (Opsional)' : 'Notes (Optional)'}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Pin, security questions, etc."
                    rows={2}
                    className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50 resize-none"
                  />
                </div>

                <div className="flex items-center gap-3 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all"
                  >
                    {lang === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 text-black text-xs font-bold rounded-xl transition-all shadow-lg"
                  >
                    {lang === 'id' ? 'Simpan' : 'Save'}
                  </button>
                </div>
              </form>
            )}

            {/* Edit Password Form */}
            {editingPwd && (
              <form onSubmit={handleUpdatePassword} className="p-5 bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 rounded-2xl flex flex-col gap-4 animate-in fade-in duration-300">
                <div className="text-xs font-bold text-orange-500 dark:text-amber-500 uppercase tracking-widest flex items-center gap-2 mb-1">
                  <Edit2 size={12} />
                  <span>{lang === 'id' ? 'Edit Kredensial Tersimpan' : 'Edit Saved Credential'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Nama Situs' : 'Site Name'}</label>
                    <input
                      type="text"
                      required
                      value={editSiteName}
                      onChange={(e) => setEditSiteName(e.target.value)}
                      placeholder="e.g. Netflix, Google, GitHub"
                      className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'URL Situs' : 'Site URL'}</label>
                    <input
                      type="text"
                      value={editSiteUrl}
                      onChange={(e) => setEditSiteUrl(e.target.value)}
                      placeholder="e.g. netflix.com, github.com"
                      className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Nama Pengguna / Email' : 'Username / Email'}</label>
                    <input
                      type="text"
                      required
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      placeholder="e.g. user@gmail.com, nighthub_user"
                      className="bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{lang === 'id' ? 'Kata Sandi' : 'Password'}</label>
                      <button
                        type="button"
                        onClick={handleGenerateEditPassword}
                        className="text-[10px] text-orange-500 dark:text-amber-500 hover:underline font-bold uppercase tracking-wider flex items-center gap-1"
                      >
                        <Sparkles size={10} />
                        <span>{lang === 'id' ? 'Acak Kuat' : 'Auto Generate'}</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={editPasswordVal}
                        onChange={(e) => setEditPasswordVal(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl pl-3 pr-10 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50 font-mono"
                      />
                    </div>
                    {editPasswordVal && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div className={`h-full ${getPasswordStrength(editPasswordVal).color} transition-all duration-300`} style={{ width: getPasswordStrength(editPasswordVal).label === (lang === 'id' ? 'Kuat' : 'Strong') ? '100%' : getPasswordStrength(editPasswordVal).label === (lang === 'id' ? 'Sedang' : 'Medium') ? '66%' : '33%' }} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                          {getPasswordStrength(editPasswordVal).label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setEditingPwd(null)}
                    className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all"
                  >
                    {lang === 'id' ? 'Batal' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 text-black text-xs font-bold rounded-xl transition-all shadow-lg"
                  >
                    {lang === 'id' ? 'Simpan' : 'Save'}
                  </button>
                </div>
              </form>
            )}

            {/* Search Passwords & Database Info Bar */}
            <div className="flex flex-col gap-2.5">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === 'id' ? 'Cari kata sandi tersimpan...' : 'Search saved credentials...'}
                  className="w-full bg-zinc-100/80 dark:bg-black/40 border border-zinc-200 dark:border-white/5 rounded-2xl pl-12 pr-4 py-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-orange-500/30"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1 py-0.5">
                <div className="flex items-center gap-2">
                  <Database size={13} className="text-orange-500 dark:text-amber-500" />
                  <span className="font-medium">
                    {lang === 'id'
                      ? `${passwords.length} kredensial di database brankas lokal`
                      : `${passwords.length} credentials in local vault database`}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                    ({lang === 'id' ? 'Terpisah dari DB Umum NightHUB' : 'Separate from NightHUB DB'})
                  </span>
                </div>
                {passwords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteDbConfirm(true)}
                    className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-semibold flex items-center gap-1 hover:underline text-[11px] cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>{lang === 'id' ? 'Hapus Database Password' : 'Delete Password Database'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Password Vault List */}
            {filteredPasswords.length === 0 ? (
              <div className="py-12 px-6 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-200 dark:border-white/10 rounded-2xl bg-zinc-100/50 dark:bg-black/10 gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 dark:text-amber-500">
                  <Key size={30} strokeWidth={1.5} />
                </div>
                <div className="max-w-md flex flex-col gap-1">
                  <h4 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                    {searchQuery 
                      ? (lang === 'id' ? 'Tidak ada kredensial yang cocok' : 'No matching credentials') 
                      : (lang === 'id' ? 'Database Brankas Kata Sandi Kosong' : 'Password Vault Database is Empty')}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {searchQuery 
                      ? (lang === 'id' ? 'Coba cari dengan kata kunci nama situs atau username lain.' : 'Try searching with a different site name or username.') 
                      : (lang === 'id' ? 'Belum ada kata sandi tersimpan, atau database baru saja dihapus. Anda dapat menambahkan kata sandi baru atau mengimpor file cadangan CSV.' : 'No credentials saved yet, or database was recently cleared. You can add new passwords or import from a CSV backup file.')}
                  </p>
                </div>
                {!searchQuery && (
                  <div className="flex items-center gap-3 mt-1 flex-wrap justify-center">
                    <button
                      type="button"
                      onClick={triggerImport}
                      className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-black text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      <Upload size={14} />
                      <span>{lang === 'id' ? 'Impor File Cadangan (.csv)' : 'Import Backup File (.csv)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(true);
                        setEditingPwd(null);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-white/10 dark:hover:bg-white/15 text-zinc-800 dark:text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>{lang === 'id' ? 'Tambah Manual' : 'Add Manually'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredPasswords.map((pwd) => {
                  const isVisible = visiblePasswords[pwd.id] || false;
                  return (
                    <div
                      key={pwd.id}
                      className="p-4 bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 hover:border-orange-500/20 dark:hover:border-orange-500/20 rounded-2xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/10">
                          <Key size={18} className="text-orange-500 dark:text-amber-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900 dark:text-white text-sm">{pwd.siteName}</span>
                            {pwd.siteUrl && (
                              <a
                                href={pwd.siteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-zinc-400 dark:text-zinc-500 hover:text-orange-500 underline truncate"
                              >
                                {pwd.siteUrl.replace(/^https?:\/\//i, '')}
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 flex items-center gap-2">
                            <span className="font-mono text-zinc-400 dark:text-zinc-500">{lang === 'id' ? 'Akun' : 'User'}:</span>
                            <span className="font-medium truncate text-zinc-800 dark:text-zinc-300">{pwd.username}</span>
                            <button
                              onClick={() => handleCopyToClipboard(pwd.username, `${pwd.id}-user`)}
                              className="text-zinc-400 dark:text-zinc-500 hover:text-orange-500 transition-colors shrink-0"
                              title="Copy Username"
                            >
                              {copiedId === `${pwd.id}-user` ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="bg-zinc-200/50 dark:bg-black/30 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-white/5 flex items-center gap-2">
                          <input
                            type={isVisible ? "text" : "password"}
                            readOnly
                            value={pwd.passwordVal}
                            className="bg-transparent text-xs font-mono text-zinc-800 dark:text-white tracking-wider w-32 focus:outline-none select-all"
                          />
                          <button
                            onClick={() => togglePasswordVisibility(pwd.id)}
                            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                            title={isVisible ? "Hide Password" : "Show Password"}
                          >
                            {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            onClick={() => handleCopyToClipboard(pwd.passwordVal, pwd.id)}
                            className="text-zinc-500 hover:text-orange-500 transition-colors"
                            title="Copy Password"
                          >
                            {copiedId === pwd.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                          </button>
                        </div>

                        <button
                          onClick={() => handleStartEdit(pwd)}
                          className="p-2 bg-transparent hover:bg-orange-500/10 text-zinc-500 hover:text-orange-500 rounded-xl transition-all"
                          title={lang === 'id' ? 'Edit Kata Sandi' : 'Edit Password'}
                        >
                          <Edit2 size={15} />
                        </button>

                        <button
                          onClick={() => handleDeletePassword(pwd.id)}
                          className="p-2 bg-transparent hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-xl transition-all"
                          title="Delete Password"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeMenu === 'browser' && (
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            <div className="pb-4 border-b border-zinc-200 dark:border-white/5">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Sliders className="text-orange-500 dark:text-amber-500" />
                <span>{lang === 'id' ? 'Konfigurasi Browser' : 'Browser Configurations'}</span>
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                {lang === 'id' 
                  ? 'Sesuaikan preferensi peramban bawaan Nighthub Player Anda.' 
                  : 'Customize the default browser options inside your Nighthub Player sniffer.'}
              </p>
            </div>

            <div className="bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 rounded-2xl p-6 flex flex-col gap-6">
              {/* Search Engine Settings */}
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">{lang === 'id' ? 'Mesin Pencari Utama' : 'Default Search Engine'}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {lang === 'id' ? 'Gunakan mesin pencari ini ketika memasukkan kata kunci pada bilah alamat.' : 'Use this search engine when entering raw keywords in the browser address bar.'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'google', name: 'Google' },
                    { id: 'bing', name: 'Bing' },
                    { id: 'duckduckgo', name: 'DuckDuckGo' }
                  ].map((engine) => (
                    <button
                      key={engine.id}
                      onClick={() => setSearchEngine(engine.id as any)}
                      className={`px-4 py-3 rounded-xl border text-sm font-bold transition-all text-center flex flex-col items-center justify-center gap-1.5 ${
                        searchEngine === engine.id
                          ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-amber-500'
                          : 'border-zinc-250 dark:border-white/5 bg-zinc-200/50 dark:bg-black/20 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-black/40'
                      }`}
                    >
                      <Globe size={16} />
                      <span>{engine.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-zinc-200 dark:border-white/5" />

              {/* Home URL Settings */}
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">{lang === 'id' ? 'URL Beranda Kustom' : 'Custom Homepage URL'}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {lang === 'id' ? 'Tentukan situs web default yang akan dimuat saat menekan tombol Beranda.' : 'Define the default website loaded when clicking the Home navigation button.'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={homeInput}
                    onChange={(e) => setHomeInput(e.target.value)}
                    placeholder="https://google.com"
                    className="flex-1 bg-white dark:bg-black/40 border border-zinc-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-orange-500/50 font-mono"
                  />
                  <button
                    onClick={handleSaveHomeUrl}
                    className="px-5 py-2 bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 text-black text-sm font-bold rounded-xl transition-all shadow-md active:scale-95"
                  >
                    {lang === 'id' ? 'Simpan' : 'Save'}
                  </button>
                </div>
                {showHomeSavedFeedback && (
                  <div className="text-xs text-emerald-500 font-bold flex items-center gap-1">
                    <Check size={12} />
                    <span>{lang === 'id' ? 'Berhasil disimpan!' : 'Successfully saved!'}</span>
                  </div>
                )}
              </div>

              <hr className="border-zinc-200 dark:border-white/5" />

              {/* Adblock settings */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">{lang === 'id' ? 'Adblock & Pelacak Terintegrasi' : 'Built-in Adblock & Trackers'}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {lang === 'id' ? 'Blokir iklan dan pelacak otomatis untuk pemuatan situs yang lebih cepat.' : 'Automatically block ads, analytics, and privacy-invasive trackers.'}
                  </p>
                </div>
                <button
                  onClick={() => setAdBlockEnabled(!adBlockEnabled)}
                  className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${adBlockEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${adBlockEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {adBlockEnabled && (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">{lang === 'id' ? 'Total iklan diblokir secara global:' : 'Total ads blocked globally:'}</span>
                  <span className="text-sm font-bold text-emerald-500">{adblockStats.total}</span>
                </div>
              )}

              <hr className="border-zinc-200 dark:border-white/5" />

              {/* Popup blocker settings */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">{lang === 'id' ? 'Pemblokir PopUp Otomatis' : 'Automatic PopUp Blocker'}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {lang === 'id' ? 'Cegah situs web membuka tab atau jendela iklan baru tanpa izin Anda.' : 'Prevent websites from opening unauthorized advertisement popups.'}
                  </p>
                </div>
                <button
                  onClick={() => setPopupBlockEnabled(!popupBlockEnabled)}
                  className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${popupBlockEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${popupBlockEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <hr className="border-zinc-200 dark:border-white/5" />

              {/* Acrylic background settings */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">
                    {lang === 'id' ? 'Efek Latar Belakang Acrylic (Mika)' : 'Acrylic (Mica) Background Effect'}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {lang === 'id' 
                      ? 'Gunakan efek mika transparan yang elegan untuk menu klik kanan, mesin pencari, dan saran pencarian.' 
                      : 'Use elegant transparent micas for menus, search engines, and suggestions.'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAcrylic(!acrylicEnabled)}
                  className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${acrylicEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-800'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all duration-300 ${acrylicEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'privacy' && (
          <div className="max-w-3xl mx-auto flex flex-col gap-6">
            <div className="pb-4 border-b border-zinc-200 dark:border-white/5">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Lock className="text-orange-500 dark:text-amber-500" />
                <span>{lang === 'id' ? 'Privasi & Keamanan' : 'Privacy & Security'}</span>
              </h2>
              <p className="text-sm text-zinc-500 mt-1">
                {lang === 'id' 
                  ? 'Atur perlindungan data pribadi dan data peramban Anda.' 
                  : 'Manage your data safety, local vault, and browsing cleanup.'}
              </p>
            </div>

            <div className="bg-zinc-100/50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 rounded-2xl p-6 flex flex-col gap-6">
              {/* Clear browsing history */}
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">{lang === 'id' ? 'Hapus Riwayat Penjelajahan' : 'Clear Browsing History'}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {lang === 'id' ? 'Hapus semua riwayat penjelajahan peramban sniffer Anda.' : 'Instantly clear all websites visited from your internal browser sniffer history.'}
                  </p>
                </div>
                <div className="bg-zinc-200/30 dark:bg-black/20 p-4 border border-zinc-200 dark:border-white/5 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                    {lang === 'id' 
                      ? `Anda memiliki ${webHistoryCount} entri riwayat.` 
                      : `You currently have ${webHistoryCount} history logs.`}
                  </span>
                  <button
                    onClick={onClearHistory}
                    disabled={webHistoryCount === 0}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white disabled:opacity-30 disabled:hover:bg-red-500/10 disabled:hover:text-red-500 disabled:cursor-default text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
                  >
                    {lang === 'id' ? 'Hapus Semua Riwayat' : 'Clear All History'}
                  </button>
                </div>
              </div>

              <hr className="border-zinc-200 dark:border-white/5" />

              {/* Delete Password Database (Isolated from NightHUB General DB) */}
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-zinc-800 dark:text-white uppercase tracking-wider">
                      {lang === 'id' ? 'Database Kata Sandi (Brankas Peramban)' : 'Password Vault Database'}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-amber-500 border border-orange-500/20">
                      {lang === 'id' ? 'Terpisah dari DB Umum NightHUB' : 'Isolated from General DB'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    {lang === 'id'
                      ? 'Kelola atau hapus database kata sandi peramban secara terpisah tanpa memengaruhi database umum NightHUB (video, playlist, marker, loop, atau preferensi). Setelah database dihapus, brankas menjadi kosong dan Anda dapat mengimpor file cadangan baru.'
                      : 'Manage or wipe the browser password database independently without touching NightHUB general database (videos, playlists, markers, loops, or preferences). Once deleted, your vault is reset and ready for importing a fresh backup.'}
                  </p>
                </div>

                <div className="bg-zinc-200/30 dark:bg-black/20 p-4 border border-zinc-200 dark:border-white/5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 dark:text-amber-500 shrink-0 border border-orange-500/20">
                      <Database size={18} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {lang === 'id' ? 'Status Database Brankas' : 'Vault Database Status'}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {lang === 'id'
                          ? `${passwords.length} kredensial akun tersimpan`
                          : `${passwords.length} account credentials saved`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={triggerImport}
                      className="px-3.5 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white text-xs font-bold rounded-xl transition-all border border-zinc-300 dark:border-white/5 flex items-center gap-1.5 active:scale-95 cursor-pointer"
                      title={lang === 'id' ? 'Impor file kata sandi CSV' : 'Import CSV password file'}
                    >
                      <Upload size={13} />
                      <span>{lang === 'id' ? 'Impor (.csv)' : 'Import (.csv)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCSV}
                      disabled={passwords.length === 0}
                      className="px-3.5 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-40 text-zinc-800 dark:text-white text-xs font-bold rounded-xl transition-all border border-zinc-300 dark:border-white/5 flex items-center gap-1.5 active:scale-95 disabled:active:scale-100 cursor-pointer"
                      title={lang === 'id' ? 'Ekspor seluruh kata sandi ke CSV' : 'Export all passwords to CSV'}
                    >
                      <Download size={13} />
                      <span>{lang === 'id' ? 'Ekspor (.csv)' : 'Export (.csv)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteDbConfirm(true)}
                      disabled={passwords.length === 0}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white disabled:opacity-30 disabled:hover:bg-red-500/10 disabled:hover:text-red-500 text-xs font-bold rounded-xl transition-all border border-red-500/20 shadow-sm flex items-center gap-1.5 active:scale-95 disabled:active:scale-100 cursor-pointer"
                      title={lang === 'id' ? 'Hapus Database Password secara terpisah' : 'Delete Password Database separately'}
                    >
                      <Trash2 size={13} />
                      <span>{lang === 'id' ? 'Hapus Database Password' : 'Delete Password Database'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showRestartConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
          <div className="w-full max-w-md bg-white dark:bg-[#1a0f0a] border border-zinc-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  {lang === 'id' ? 'Mulai Ulang Aplikasi Diperlukan' : 'App Restart Required'}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
                  {lang === 'id' 
                    ? 'Perubahan efek Acrylic memerlukan mulai ulang aplikasi agar dapat diterapkan sepenuhnya ke semua bagian player. Apakah Anda ingin memulai ulang sekarang?' 
                    : 'Changes to the Acrylic effect require an application restart to be fully applied to all parts of the player. Would you like to restart now?'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRestartConfirm(false);
                }}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all border border-zinc-200 dark:border-white/5 active:scale-95 cursor-pointer"
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  // Save preference and relaunch
                  const ipc = getIpcRenderer();
                  if (ipc) {
                    ipc.send('set-acrylic-enabled', pendingAcrylicVal);
                    localStorage.setItem('snifferAcrylicEnabled', pendingAcrylicVal ? 'true' : 'false');
                    ipc.send('relaunch-app');
                  } else {
                    localStorage.setItem('snifferAcrylicEnabled', pendingAcrylicVal ? 'true' : 'false');
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black text-xs font-bold rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                {lang === 'id' ? 'Restart Aplikasi' : 'Restart App'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden CSV File Input */}
      <input
        ref={csvFileInputRef}
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImportCSVFile(file);
          }
        }}
      />

      {/* Delete Password Database Confirmation Modal */}
      {showDeleteDbConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 select-none">
          <div className="w-full max-w-md bg-white dark:bg-[#1a0f0a] border border-red-500/20 dark:border-red-500/30 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0 border border-red-500/20">
                <AlertTriangle size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                    {lang === 'id' ? 'Hapus Database Kata Sandi?' : 'Delete Password Database?'}
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-amber-500 border border-orange-500/20">
                    {lang === 'id' ? 'Terpisah dari DB NightHUB' : 'Isolated from NightHUB DB'}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2 leading-relaxed">
                  {lang === 'id'
                    ? `Tindakan ini akan menghapus seluruh data kredensial (${passwords.length} akun tersimpan) dari brankas peramban Anda. Database umum NightHUB (video, playlist, marker, loop, dan setelan umum) akan tetap aman.`
                    : `This action will erase all credentials (${passwords.length} saved accounts) from your browser vault database. NightHUB general database (videos, playlists, markers, loops, and app preferences) remains untouched.`}
                </p>
                <div className="mt-2.5 p-2.5 bg-red-500/5 dark:bg-red-950/20 border border-red-500/15 rounded-xl text-[11px] text-red-600 dark:text-red-400">
                  {lang === 'id'
                    ? 'Setelah database dihapus, brankas Anda menjadi kosong dan Anda dapat mengimpor file cadangan kata sandi baru kapan saja.'
                    : 'After database deletion, your vault will be empty and ready for you to import fresh credentials anytime.'}
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                disabled={isDeletingDb}
                onClick={() => setShowDeleteDbConfirm(false)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all border border-zinc-200 dark:border-white/5 active:scale-95 cursor-pointer"
              >
                {lang === 'id' ? 'Batal' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isDeletingDb}
                onClick={handleDeletePasswordDatabase}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center gap-2 active:scale-95 cursor-pointer"
              >
                {isDeletingDb ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>{lang === 'id' ? 'Menghapus...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>{lang === 'id' ? 'Ya, Hapus Database Brankas' : 'Yes, Delete Vault Database'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {dbNotification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-medium max-w-md ${
            dbNotification.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30 backdrop-blur-md'
              : 'bg-red-950/90 text-red-200 border-red-500/30 backdrop-blur-md'
          }`}>
            {dbNotification.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-400 shrink-0" />
            )}
            <span className="flex-1">{dbNotification.message}</span>
            <button
              onClick={() => setDbNotification(null)}
              className="text-zinc-400 hover:text-white text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
