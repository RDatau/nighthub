import React, { useState, useEffect } from 'react';
import { X, Download, Pause, Play, Trash2, FileCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { useElectron } from '../hooks/useElectron';

export interface ManualDownload {
  id: string;
  fileName: string;
  url: string;
  totalBytes: number;
  receivedBytes: number;
  speed?: number;
  isMultiPart?: boolean;
  state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
  filePath?: string;
}

export const DownloadManagerSidebar = ({
  show,
  onClose,
  width,
  lang = 'id',
}: {
  show: boolean;
  onClose: () => void;
  width: number;
  lang?: 'id' | 'en';
}) => {
  const { getIpcRenderer } = useElectron();
  const [downloads, setDownloads] = useState<ManualDownload[]>([]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    const handleStarted = (e: any, data: ManualDownload) => {
      setDownloads(prev => [data, ...prev]);
    };

    const handleProgress = (e: any, data: { id: string, state: string, receivedBytes: number, totalBytes: number, speed?: number }) => {
      setDownloads(prev => prev.map(d => 
        d.id === data.id 
          ? { ...d, state: data.state as any, receivedBytes: data.receivedBytes, totalBytes: data.totalBytes, speed: data.speed } 
          : d
      ));
    };

    const handleDone = (e: any, data: { id: string, state: string, filePath: string, receivedBytes?: number, totalBytes?: number }) => {
      setDownloads(prev => prev.map(d => 
        d.id === data.id 
          ? { 
              ...d, 
              state: data.state as any, 
              filePath: data.filePath,
              receivedBytes: data.receivedBytes !== undefined ? data.receivedBytes : (data.state === 'completed' && d.totalBytes > 0 ? d.totalBytes : d.receivedBytes),
              totalBytes: data.totalBytes !== undefined ? data.totalBytes : d.totalBytes,
              speed: 0
            } 
          : d
      ));
    };

    ipc.on('manual-download-started', handleStarted);
    ipc.on('manual-download-progress', handleProgress);
    ipc.on('manual-download-done', handleDone);

    return () => {
      ipc.removeListener('manual-download-started', handleStarted);
      ipc.removeListener('manual-download-progress', handleProgress);
      ipc.removeListener('manual-download-done', handleDone);
    };
  }, [getIpcRenderer]);

  const handleAction = (id: string, action: 'pause' | 'resume' | 'cancel') => {
    const ipc = getIpcRenderer();
    if (ipc) ipc.send('manual-download-action', { id, action });
  };

  const handleRetry = (url: string, id: string, filePath?: string) => {
    const ipc = getIpcRenderer();
    if (ipc) {
      ipc.send('retry-manual-download', { url, filePath });
      removeDownload(id);
    }
  };

  const removeDownload = (id: string) => {
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div 
      style={{ width }}
      className={`flex-none bg-white/5 dark:bg-black/40 backdrop-blur-md border border-transparent dark:border-transparent rounded-2xl flex flex-col z-10 h-full overflow-hidden shadow-sm ${!show ? 'hidden' : ''}`}
    >
      <div className="flex items-center justify-between h-14 px-4 bg-zinc-200/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 flex-none">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
          <Download size={16} className="text-orange-500 dark:text-amber-500" />
          {lang === 'id' ? 'Pengelola Unduhan' : 'Download Manager'}
        </h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={onClose} 
            className="p-1.5 text-zinc-500 hover:text-orange-600 dark:hover:text-amber-500 hover:bg-orange-500/10 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
            title={lang === 'id' ? 'Tutup Pengelola Unduhan' : 'Close Download Manager'}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-0">
        {downloads.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-700 dark:text-zinc-300 gap-4 opacity-50">
            <Download size={48} strokeWidth={1} />
            <p className="text-xs font-mono uppercase tracking-widest text-center px-4">
              {lang === 'id' ? 'Belum ada download manual' : 'No manual downloads yet'}
            </p>
          </div>
        ) : (
          downloads.map(dl => {
            const percent = dl.totalBytes > 0 ? Math.round((dl.receivedBytes / dl.totalBytes) * 100) : 0;
            return (
              <div key={dl.id} className="group bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:border-orange-500/30 dark:hover:border-amber-500/30 dark:border-amber-500/30 rounded-xl p-3 transition-all duration-300 flex flex-col gap-2">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-zinc-900 dark:text-white text-sm font-medium truncate" title={dl.fileName}>{dl.fileName}</h3>
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5" title={dl.url}>{dl.url}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(dl.state === 'progressing' || dl.state === 'paused') && (
                      <>
                        {!dl.isMultiPart && (
                          <button 
                            onClick={() => handleAction(dl.id, dl.state === 'paused' ? 'resume' : 'pause')}
                            className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors"
                            title={dl.state === 'paused' ? (lang === 'id' ? 'Lanjutkan' : 'Resume') : (lang === 'id' ? 'Jeda' : 'Pause')}
                          >
                            {dl.state === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                          </button>
                        )}
                        <button 
                          onClick={() => handleAction(dl.id, 'cancel')}
                          className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                          title={lang === 'id' ? 'Batalkan' : 'Cancel'}
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}
                    {(dl.state === 'completed' || dl.state === 'cancelled' || dl.state === 'interrupted') && (
                      <>
                        {dl.state === 'interrupted' && (
                          <button 
                            onClick={() => handleRetry(dl.url, dl.id, dl.filePath)}
                            className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:text-white hover:bg-black/10 dark:hover:bg-white/10 rounded-md transition-colors"
                            title={lang === 'id' ? 'Coba Lagi Unduhan' : 'Retry Download'}
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => removeDownload(dl.id)}
                          className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                          title={lang === 'id' ? 'Hapus dari daftar' : 'Remove from list'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-black/5 dark:bg-black/50 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        dl.state === 'completed' ? 'bg-emerald-500' :
                        dl.state === 'cancelled' || dl.state === 'interrupted' ? 'bg-red-500' :
                        dl.state === 'paused' ? 'bg-orange-500 dark:bg-amber-500' :
                        'bg-blue-500'
                      }`}
                      style={{ width: `${Math.max(2, percent)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-700 dark:text-zinc-300 w-8 text-right">{percent}%</span>
                </div>

                <div className="flex justify-between items-center text-[10px] uppercase tracking-wider font-mono mt-1">
                  <div className="flex items-center gap-1.5">
                    {dl.state === 'completed' && <FileCheck size={12} className="text-emerald-500" />}
                    {dl.state === 'cancelled' && <X size={12} className="text-red-500" />}
                    {dl.state === 'interrupted' && <AlertCircle size={12} className="text-red-500" />}
                    <span className={
                      dl.state === 'completed' ? 'text-emerald-500' :
                      dl.state === 'cancelled' || dl.state === 'interrupted' ? 'text-red-500' :
                      dl.state === 'paused' ? 'text-orange-600 dark:text-amber-500' :
                      'text-blue-400'
                    }>
                      {dl.state}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {dl.state === 'progressing' && dl.speed !== undefined && (
                      <span className="text-emerald-400 font-medium">
                        {formatBytes(dl.speed)}/s
                      </span>
                    )}
                    <span className="text-zinc-500">
                      {formatBytes(dl.receivedBytes)} / {formatBytes(dl.totalBytes)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
