import React, { useState, useEffect } from 'react';
import { Play, Info, FileVideo } from 'lucide-react';
import { motion } from 'framer-motion';
import { t, Language } from '../services/i18n';

export const AboutModal = ({
  show,
  onClose,
  currentFile,
  videoElement,
  lang = 'id'
}: {
  show: boolean;
  onClose: () => void;
  currentFile?: File | null;
  videoElement?: HTMLVideoElement | null;
  lang?: Language;
}) => {
  const [activeTab, setActiveTab] = useState<'app' | 'media'>('app');
  const [mediaInfo, setMediaInfo] = useState<any>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [analyzedFilePath, setAnalyzedFilePath] = useState<string | null>(null);

  useEffect(() => {
    if (!show) {
      setActiveTab('app');
    }
  }, [show]);

  useEffect(() => {
    const filePath = (currentFile as any)?.path || currentFile?.name;

    if (currentFile && filePath && filePath !== analyzedFilePath) {
      let isMounted = true;
      const fetchInfo = async () => {
        setIsLoadingInfo(true);
        try {
          const MediaInfoFactory = (await import('mediainfo.js')).default;
          const mediainfo = await MediaInfoFactory({
            format: 'object',
            locateFile: (path, prefix) => {
              if (path.endsWith('.wasm')) {
                return 'https://unpkg.com/mediainfo.js@0.3.7/dist/MediaInfoModule.wasm';
              }
              return prefix + path;
            }
          });

          let getSize: () => number;
          let readChunk: (chunkSize: number, offset: number) => Promise<Uint8Array>;

          if ((currentFile as any).path && typeof window !== 'undefined' && (window as any).require) {
            const fs = (window as any).require('fs');
            const stat = fs.statSync((currentFile as any).path);
            getSize = () => stat.size;
            readChunk = (chunkSize, offset) => {
              return new Promise((resolve, reject) => {
                fs.open((currentFile as any).path, 'r', (err: any, fd: any) => {
                  if (err) return reject(err);
                  const buffer = Buffer.alloc(chunkSize);
                  fs.read(fd, buffer, 0, chunkSize, offset, (err: any, bytesRead: number, buffer: Buffer) => {
                    fs.close(fd, () => {});
                    if (err) return reject(err);
                    resolve(new Uint8Array(buffer.slice(0, bytesRead)));
                  });
                });
              });
            };
          } else {
            getSize = () => currentFile.size;
            readChunk = (chunkSize, offset) => {
              return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                  if (e.target?.result instanceof ArrayBuffer) {
                    resolve(new Uint8Array(e.target.result));
                  } else {
                    reject('Read error');
                  }
                };
                reader.onerror = reject;
                reader.readAsArrayBuffer(currentFile.slice(offset, offset + chunkSize));
              });
            };
          }

          const result = await mediainfo.analyzeData(getSize, readChunk);
          if (isMounted) {
            setMediaInfo(result);
            setAnalyzedFilePath(filePath);
          }
          mediainfo.close();
        } catch (e: any) {
          console.error("Failed to get mediainfo, likely file access error:", e);
          if (isMounted) {
             setMediaInfo(null);
             // Optionally set an error state here if needed
          }
        } finally {
          if (isMounted) setIsLoadingInfo(false);
        }
      };
      fetchInfo();
      return () => { isMounted = false; };
    }
  }, [currentFile, analyzedFilePath]);

  if (!show) return null;

  const getRealFileSize = () => {
    if (mediaInfo?.media?.track?.[0]?.FileSize) {
      return parseInt(mediaInfo.media.track[0].FileSize);
    }
    const filePath = (currentFile as any)?.path;
    if (filePath && typeof window !== 'undefined' && (window as any).require) {
      try {
        const fs = (window as any).require('fs');
        return fs.statSync(filePath).size;
      } catch (e) {
        return currentFile?.size || 0;
      }
    }
    return currentFile?.size || 0;
  };

  const getBitrate = () => {
    if (mediaInfo?.media?.track?.[0]?.OverallBitRate) {
      return Math.round(parseInt(mediaInfo.media.track[0].OverallBitRate) / 1000);
    }
    const size = getRealFileSize();
    if (size && videoElement?.duration) {
      return Math.round((size * 8) / videoElement.duration / 1000);
    }
    return 0;
  };

  const getFrameRate = () => {
    const videoTrack = mediaInfo?.media?.track?.find((t: any) => t['@type'] === 'Video');
    if (videoTrack?.FrameRate) {
      return parseFloat(videoTrack.FrameRate).toFixed(2);
    }
    return null;
  };

  const getAudioInfo = () => {
    const audioTracks = mediaInfo?.media?.track?.filter((t: any) => t['@type'] === 'Audio');
    if (!audioTracks || audioTracks.length === 0) return [];

    return audioTracks.map((track: any) => {
      const codec = track.Format || 'Unknown Audio';
      const channels = track.Channels ? `${track.Channels} ch` : '';
      const sampleRate = track.SamplingRate ? `${parseInt(track.SamplingRate) / 1000} kHz` : '';
      const bitRate = track.BitRate ? `${Math.round(parseInt(track.BitRate) / 1000)} kbps` : '';
      const lang = track.Language ? `(${track.Language})` : '';

      return [codec, channels, sampleRate, bitRate, lang].filter(Boolean).join(' • ');
    });
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return 'Unknown';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}j ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <motion.div 
      drag
      dragMomentum={false}
      className="absolute bg-white/90 dark:bg-[#0a0502]/95 border border-orange-500/20 dark:border-amber-500/20 rounded-3xl z-50 backdrop-blur-2xl w-[400px] shadow-[rgba(249,115,22,0.15)_0px_10px_40px] dark:shadow-[rgba(245,158,11,0.15)_0px_10px_40px] flex flex-col overflow-hidden"
      style={{ left: 'calc(50% - 200px)', top: 'calc(50% - 250px)' }}
    >
      {/* Drag Handle Area */}
      <div className="w-full h-8 cursor-grab active:cursor-grabbing flex justify-center items-center pt-2">
        <div className="w-12 h-1.5 bg-black/20 dark:bg-white/20 rounded-full"></div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/10 dark:border-white/10 px-6 pt-2">
        <button 
          onClick={() => setActiveTab('app')}
          className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'app' ? 'text-orange-600 dark:text-amber-500 border-orange-500 dark:border-amber-500' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent'}`}
        >
          <Info size={16} /> App Info
        </button>
        <button 
          onClick={() => setActiveTab('media')}
          className={`flex-1 py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors border-b-2 ${activeTab === 'media' ? 'text-orange-600 dark:text-amber-500 border-orange-500 dark:border-amber-500' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border-transparent'}`}
        >
          <FileVideo size={16} /> Media Info
        </button>
      </div>

      <div className="p-8 pt-6 flex flex-col items-center">
        {activeTab === 'app' ? (
          <div className="flex flex-col items-center text-center w-full">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-900/40 to-orange-900/20 flex items-center justify-center mb-4 shadow-[rgba(249,115,22,0.2)_0px_0px_20px] dark:shadow-[rgba(245,158,11,0.2)_0px_0px_20px] border border-orange-500/30 dark:border-amber-500/30">
              <Play size={36} className="text-amber-400 ml-1" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              NIGHT<span className="bg-orange-500 dark:bg-amber-500 text-black px-2 py-0.5 rounded-md text-sm">HUB</span>
            </h2>
            <p className="text-orange-600/80 dark:text-amber-500/80 text-xs font-mono tracking-widest mb-6">v1.0.0</p>
            <p className="text-zinc-700 dark:text-zinc-300 text-sm mb-6 leading-relaxed">
              {t('aboutAppDesc', lang)}
            </p>
            <div className="w-full h-px bg-black/10 dark:bg-white/10 mb-6"></div>
            <p className="text-zinc-500 text-xs uppercase tracking-widest mb-1">{t('createdBy', lang)}</p>
            <p className="text-amber-400 font-bold tracking-wide mb-8">Ryan Datau</p>
          </div>
        ) : (
          <div className="flex flex-col w-full text-sm text-zinc-700 dark:text-zinc-300 min-h-[350px]">
            {currentFile ? (
              <div className="space-y-5 w-full">
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileName', lang)}</span>
                  <span className="font-medium break-all">{currentFile.name}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileSize', lang)}</span>
                    <span className="font-mono">{isLoadingInfo ? t('calculating', lang) : formatBytes(getRealFileSize())}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileFormat', lang)}</span>
                    <span className="font-mono">{currentFile.type || 'Unknown'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileDuration', lang)}</span>
                    <span className="font-mono">{formatDuration(videoElement?.duration || 0)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileResolution', lang)}</span>
                    <span className="font-mono">{videoElement?.videoWidth ? `${videoElement.videoWidth}x${videoElement.videoHeight}` : 'Unknown'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileBitrate', lang)}</span>
                    <span className="font-mono">{isLoadingInfo ? t('calculating', lang) : `${getBitrate()} kbps`}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileFrameRate', lang)}</span>
                    <span className="font-mono">{isLoadingInfo ? t('calculating', lang) : (getFrameRate() ? `${getFrameRate()} fps` : 'Unknown')}</span>
                  </div>
                </div>

                {getAudioInfo().length > 0 && (
                  <div className="flex flex-col">
                    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileAudioTrack', lang)}</span>
                    {getAudioInfo().map((audio, idx) => (
                      <span key={idx} className="font-mono text-xs mb-1 opacity-90">{audio}</span>
                    ))}
                  </div>
                )}

                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t('fileLocation', lang)}</span>
                  <div className="max-h-24 overflow-y-auto custom-scrollbar pr-1">
                    <span className="font-mono text-xs break-all opacity-80">{(currentFile as any).path || 'Local Browser File'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center flex-1 mt-10">
                <FileVideo size={48} className="text-zinc-400 dark:text-zinc-600 mb-4 opacity-50" />
                <p className="text-zinc-500">{t('noVideoPlaying', lang)}</p>
              </div>
            )}
            <div className="mb-8"></div>
          </div>
        )}

        <button onClick={onClose} className="w-full bg-orange-500 dark:bg-amber-500 hover:bg-orange-400 dark:hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition-all hover:scale-105 duration-300 text-sm uppercase tracking-widest shadow-[rgba(249,115,22,0.2)_0px_5px_15px] dark:shadow-[rgba(245,158,11,0.2)_0px_5px_15px] mt-auto">{t('close', lang)}</button>
      </div>
    </motion.div>
  );
};
