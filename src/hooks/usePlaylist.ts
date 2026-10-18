
import { useState, useCallback, useRef, useEffect } from 'react';
import { dbService } from '../services/db';
import * as mm from 'music-metadata-browser';
import jsmediatags from 'jsmediatags';
import { useElectron } from './useElectron';
import { isAudioMedia } from '../services/mediaUtils';

const generateDefaultAlbumCover = (fileName: string, title?: string, artist?: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // 1. Draw smooth gradient background
  const grad = ctx.createRadialGradient(200, 180, 50, 200, 180, 260);
  grad.addColorStop(0, '#27272a'); // zinc-800
  grad.addColorStop(0.5, '#09090b'); // zinc-950
  grad.addColorStop(1, '#020202'); // near black
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);

  // 2. Add a soft orange/amber ambient glow in the background
  const glowGrad = ctx.createRadialGradient(200, 180, 10, 200, 180, 180);
  glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.15)'); // amber glow
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, 400, 400);

  // 3. Draw Vinyl Record
  const centerX = 200;
  const centerY = 165;
  const vinylRadius = 105;

  // Vinyl body (outer shadow/border)
  ctx.beginPath();
  ctx.arc(centerX, centerY, vinylRadius + 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fill();

  // Vinyl body (dark slate)
  ctx.beginPath();
  ctx.arc(centerX, centerY, vinylRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#111113';
  ctx.fill();

  // Draw vinyl grooving lines for realistic texture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  const grooves = [95, 85, 75, 65, 55, 45];
  grooves.forEach(r => {
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Center label (Amber/Orange circle)
  ctx.beginPath();
  ctx.arc(centerX, centerY, 35, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b'; // amber-500
  ctx.fill();

  // Center label inner ring
  ctx.beginPath();
  ctx.arc(centerX, centerY, 35, 0, Math.PI * 2);
  ctx.strokeStyle = '#d97706'; // amber-600
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center hole
  ctx.beginPath();
  ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#09090b'; // matching bg
  ctx.fill();

  // Vinyl metallic highlight (sheen overlay)
  ctx.beginPath();
  ctx.moveTo(centerX - vinylRadius, centerY);
  ctx.lineTo(centerX + vinylRadius, centerY);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 12;
  ctx.stroke();

  // 4. Draw Typography / Text metadata
  const displayTitle = title || fileName.replace(/\.[^/.]+$/, ""); // strip extension
  const displayArtist = artist || "Audio Track";

  // Title Text
  ctx.fillStyle = '#f4f4f5'; // zinc-100
  ctx.font = 'bold 20px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Truncate title if too long
  let maxTitleWidth = 340;
  let truncatedTitle = displayTitle;
  if (ctx.measureText(truncatedTitle).width > maxTitleWidth) {
    while (ctx.measureText(truncatedTitle + '...').width > maxTitleWidth && truncatedTitle.length > 0) {
      truncatedTitle = truncatedTitle.slice(0, -1);
    }
    truncatedTitle += '...';
  }
  ctx.fillText(truncatedTitle, 200, 310);

  // Artist Text
  ctx.fillStyle = '#a1a1aa'; // zinc-400
  ctx.font = '500 14px "Inter", "Segoe UI", sans-serif';
  let truncatedArtist = displayArtist;
  let maxArtistWidth = 340;
  if (ctx.measureText(truncatedArtist).width > maxArtistWidth) {
    while (ctx.measureText(truncatedArtist + '...').width > maxArtistWidth && truncatedArtist.length > 0) {
      truncatedArtist = truncatedArtist.slice(0, -1);
    }
    truncatedArtist += '...';
  }
  ctx.fillText(truncatedArtist, 200, 345);

  // Subtle decorative label at the top
  ctx.fillStyle = 'rgba(245, 158, 11, 0.4)'; // transparent amber
  ctx.font = 'bold 10px monospace';
  ctx.fillText('NIGHTHUB AUDIO', 200, 50);

  return canvas.toDataURL('image/jpeg', 0.85);
};

const isThumbnailValid = (thumb: string | null | undefined): boolean => {
  if (!thumb) return false;
  if (!thumb.startsWith('data:image/')) return false;
  if (thumb.length < 100) return false; // ignore data:, or other tiny invalid values
  return true;
};

export const usePlaylist = () => {
  const { getLocalFileUrl } = useElectron();
  const [playlist, setPlaylist] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'playlist' | 'current'>('none');
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [playlistViewMode, setPlaylistViewMode] = useState<'list' | 'grid'>('list');
  const [isGenerating, setIsGenerating] = useState(false);
  const thumbQueueRef = useRef<File[]>([]);

  const parseAudioMetadata = useCallback(async (file: File) => {
    const isAudio = isAudioMedia(file);
    if (!isAudio || (file as any).isStream) return null;

    try {
      let blobToParse: Blob = file;
      if ((file as any).path) {
        try {
          const fs = (window as any).require('fs');
          const filePath = (file as any).path;
          const buffer = await fs.promises.readFile(filePath);
          
          let mimeType = file.type;
          if (!mimeType) {
            const ext = filePath.split('.').pop()?.toLowerCase();
            if (ext === 'mp3') mimeType = 'audio/mpeg';
            else if (ext === 'flac') mimeType = 'audio/flac';
            else if (ext === 'wav') mimeType = 'audio/wav';
            else if (ext === 'ogg') mimeType = 'audio/ogg';
            else if (ext === 'm4a') mimeType = 'audio/mp4';
            else if (ext === 'aac') mimeType = 'audio/aac';
            else mimeType = 'audio/mpeg';
          }
          
          blobToParse = new File([buffer], file.name, { type: mimeType });
        } catch (err) {
          console.error('Failed to read file from path:', err);
        }
      }
      
      const metadata = await mm.parseBlob(blobToParse);
      
      try {
        const lyrics = await new Promise<string | undefined>((resolveLyrics) => {
          jsmediatags.read(blobToParse as any, {
            onSuccess: function(tag: any) {
              const l = tag.tags?.lyrics?.lyrics || tag.tags?.USLT?.text || tag.tags?.SYLT?.text || undefined;
              resolveLyrics(l);
            },
            onError: function() {
              resolveLyrics(undefined);
            }
          });
        });
        
        if (lyrics && (!metadata.common.lyrics || metadata.common.lyrics.length === 0)) {
          metadata.common.lyrics = [lyrics];
        }
      } catch (e) {
        console.warn('jsmediatags error:', e);
      }
      
      const key = (file as any).path || (file as any).fullPath || (file.name + file.size);
      setMetadata(prev => ({ ...prev, [key]: metadata.common }));
      
      return metadata;
    } catch (error) {
      console.warn('music-metadata error:', error);
      return null;
    }
  }, []);

  const generateThumbnail = useCallback((file: File): Promise<string> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('Thumbnail generation timed out for:', file.name);
        resolve('');
      }, 10000); // 10s timeout

      try {
        const isAudio = isAudioMedia(file);
        if (isAudio) {
          const key = (file as any).path || (file as any).fullPath || (file.name + file.size);
          if ((file as any).isStream) {
            const defaultArt = generateDefaultAlbumCover(file.name);
            dbService.saveThumbnail(key, defaultArt).catch(e => console.error('Save thumb error:', e));
            clearTimeout(timeout);
            resolve(defaultArt);
            return;
          }
          parseAudioMetadata(file).then(metadata => {
            if (!metadata) {
              const defaultArt = generateDefaultAlbumCover(file.name);
              dbService.saveThumbnail(key, defaultArt).catch(e => console.error('Save thumb error:', e));
              clearTimeout(timeout);
              resolve(defaultArt);
              return;
            }
            const picture = metadata.common.picture?.[0];
            if (picture) {
              let base64String = "";
              const bytes = new Uint8Array(picture.data);
              const len = bytes.byteLength;
              for (let i = 0; i < len; i++) {
                  base64String += String.fromCharCode(bytes[i]);
              }
              const dataUrl = "data:" + picture.format + ";base64," + window.btoa(base64String);
              dbService.saveThumbnail(key, dataUrl).catch(e => console.error('Save thumb error:', e));
              clearTimeout(timeout);
              resolve(dataUrl);
            } else {
              const defaultArt = generateDefaultAlbumCover(file.name, metadata.common.title, metadata.common.artist);
              dbService.saveThumbnail(key, defaultArt).catch(e => console.error('Save thumb error:', e));
              clearTimeout(timeout);
              resolve(defaultArt);
            }
          }).catch(() => {
            const defaultArt = generateDefaultAlbumCover(file.name);
            dbService.saveThumbnail(key, defaultArt).catch(e => console.error('Save thumb error:', e));
            clearTimeout(timeout);
            resolve(defaultArt);
          });
          return;
        }

        if (file.name.match(/\.(m3u8|m3u)$/i)) {
          clearTimeout(timeout);
          resolve('');
          return;
        }

        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        let src = '';
        
        if ((file as any).isStream) {
          src = (file as any).url;
        } else if ((file as any).path) {
          src = getLocalFileUrl((file as any).path);
        } else {
          if (!(file instanceof Blob)) {
            clearTimeout(timeout);
            resolve('');
            return;
          }
          src = URL.createObjectURL(file);
        }
        
        video.src = src;

        video.onloadedmetadata = () => {
          // Seek to 10% or 5 seconds
          video.currentTime = Math.min(video.duration * 0.1, 5);
        };

        video.onseeked = async () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = (video.videoHeight / video.videoWidth) * 320;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            // Save to DB for next time
            const key = (file as any).path || (file as any).fullPath || (file.name + file.size);
            dbService.saveThumbnail(key, dataUrl).catch(e => console.error('Save thumb error:', e));
            
            clearTimeout(timeout);
            resolve(dataUrl);
          } catch (error) {
            console.warn('Failed to generate thumbnail:', error);
            clearTimeout(timeout);
            resolve('');
          } finally {
            if (!(file as any).path && !(file as any).isStream && (file instanceof Blob)) URL.revokeObjectURL(src);
            video.src = '';
            video.load();
            video.remove();
          }
        };

        video.onerror = () => {
          console.warn('Video error during thumbnail generation:', file.name);
          clearTimeout(timeout);
          resolve('');
          if (!(file as any).path && !(file as any).isStream && (file instanceof Blob)) URL.revokeObjectURL(src);
          video.remove();
        };
      } catch (e) {
        console.error('Error in generateThumbnail:', e);
        clearTimeout(timeout);
        resolve('');
      }
    });
  }, []);

  const processThumbQueue = useCallback(async () => {
    if (thumbQueueRef.current.length === 0) {
      setIsGenerating(false);
      return;
    }
    
    setIsGenerating(true);
    const file = thumbQueueRef.current.shift();
    if (file) {
      const key = (file as any).path || (file as any).fullPath || (file.name + file.size);
      
      try {
        const cached = await dbService.getThumbnail(key);
        if (isThumbnailValid(cached)) {
          setThumbnails(prev => ({ ...prev, [key]: cached! }));
        } else {
          const thumb = await generateThumbnail(file);
          if (thumb) {
            setThumbnails(prev => ({ ...prev, [key]: thumb }));
          }
        }
      } catch (err) {
        console.error('Thumbnail queue error:', err);
      }
    }
    
    // Small delay to prevent UI freeze
    setTimeout(() => processThumbQueue(), 100);
  }, [generateThumbnail]);

  useEffect(() => {
    if (!isGenerating && thumbQueueRef.current.length > 0) {
      processThumbQueue();
    }
  }, [isGenerating, processThumbQueue]);

  const queueThumbnails = useCallback(async (files: File[]) => {
    const mediaFiles = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/') || f.name.match(/\.(mp4|webm|mkv|avi|mov|ts|m3u8|m3u|mp3|wav|flac|ogg|m4a|aac)$/i));
    for (const vid of mediaFiles) {
      const key = (vid as any).path || (vid as any).fullPath || (vid.name + vid.size);
      
      // Always parse metadata for audio files, regardless of thumbnail cache
      const isAudio = isAudioMedia(vid);
      if (isAudio && !(vid as any).isStream) {
        parseAudioMetadata(vid).catch(e => console.warn('Metadata parse error:', e));
      }

      const cached = await dbService.getThumbnail(key);
      if (isThumbnailValid(cached)) {
        setThumbnails(prev => ({ ...prev, [key]: cached! }));
      } else {
        thumbQueueRef.current.push(vid);
      }
    }
    processThumbQueue();
  }, [processThumbQueue, parseAudioMetadata]);

  const addFiles = useCallback(async (files: File[]) => {
    const mediaFiles = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/') || f.name.match(/\.(mp4|webm|mkv|avi|mov|ts|m3u8|m3u|mp3|wav|flac|ogg|m4a|aac)$/i));
    if (mediaFiles.length > 0) {
      setPlaylist(prev => [...prev, ...mediaFiles]);
      queueThumbnails(mediaFiles);
    }
    return mediaFiles;
  }, [queueThumbnails]);

  const clearThumbnails = useCallback(async () => {
    await dbService.clearThumbnails();
    setThumbnails({});
  }, []);

  const removeFile = useCallback((index: number) => {
    setPlaylist(prev => prev.filter((_, i) => i !== index));
    if (index === currentIndex) {
      setCurrentIndex(-1);
    } else if (index < currentIndex) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const nextVideo = useCallback(() => {
    if (playlist.length === 0) return -1;
    let nextIndex = currentIndex + 1;
    if (isShuffle) {
      if (playlist.length > 1) {
        do {
          nextIndex = Math.floor(Math.random() * playlist.length);
        } while (nextIndex === currentIndex);
      } else {
        nextIndex = 0;
      }
    }
    if (nextIndex < playlist.length) {
      return nextIndex;
    } else if (repeatMode === 'playlist') {
      return 0;
    }
    return -1;
  }, [playlist, currentIndex, isShuffle, repeatMode]);

  const prevVideo = useCallback(() => {
    if (playlist.length === 0) return -1;
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      if (repeatMode === 'playlist') {
        return playlist.length - 1;
      }
      return -1;
    }
    return prevIndex;
  }, [playlist, currentIndex, repeatMode]);

  const invalidateThumbnail = useCallback(async (key: string) => {
    await dbService.deleteThumbnail(key);
    setThumbnails(prev => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    // Find the file in the playlist to regenerate
    const file = playlist.find(f => {
      const fKey = (f as any).path || (f as any).fullPath || (f.name + f.size);
      return fKey === key;
    });
    if (file) {
      const thumb = await generateThumbnail(file);
      if (thumb) {
        setThumbnails(prev => ({ ...prev, [key]: thumb }));
      }
    }
  }, [playlist, generateThumbnail]);

  return {
    playlist, setPlaylist,
    currentIndex, setCurrentIndex,
    isShuffle, setIsShuffle,
    repeatMode, setRepeatMode,
    thumbnails, setThumbnails,
    metadata, setMetadata,
    playlistViewMode, setPlaylistViewMode,
    addFiles, removeFile,
    nextVideo, prevVideo,
    generateThumbnail, clearThumbnails, queueThumbnails,
    invalidateThumbnail
  };
};
