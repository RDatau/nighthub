
import React, { useState, useRef, useEffect, useCallback } from 'react';
import mpegts from 'mpegts.js';
import Hls from 'hls.js';
import { dbService, PlayerSettings, VideoMarker, SavedLoop } from '../services/db';
import { t, Language } from '../services/i18n';

export const usePlayer = (videoRef: React.RefObject<HTMLVideoElement | null>, initialLanguage: Language = 'id') => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [originalVideoSrc, setOriginalVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioNormalized, setIsAudioNormalized] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bufferedProgress, setBufferedProgress] = useState(0);
  const [proxyProgress, setProxyProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [audioBoost, setAudioBoost] = useState(1);
  const [eqGains, setEqGains] = useState([0, 0, 0]); // Low, Mid, High
  const [audioDelay, setAudioDelay] = useState(0); // Audio Sync delay in seconds
  const [isSwapChannels, setIsSwapChannels] = useState(false);
  const [normalizeThreshold, setNormalizeThreshold] = useState(-50);
  const [normalizeGain, setNormalizeGain] = useState(0);

  const [currentLanguage, setCurrentLanguage] = useState<Language>(initialLanguage);
  const [isCheckingStream, setIsCheckingStream] = useState(false);

  useEffect(() => {
    setCurrentLanguage(initialLanguage);
  }, [initialLanguage]);

  // A/B Repeat States
  const [repeatA, setRepeatA] = useState<number | null>(null);
  const [repeatB, setRepeatB] = useState<number | null>(null);
  const [repeatEnabled, setRepeatEnabled] = useState(false);

  const mpegtsPlayerRef = useRef<mpegts.Player | null>(null);
  const hlsPlayerRef = useRef<Hls | null>(null);

  // Audio Context Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const normalizeGainNodeRef = useRef<GainNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const eqNodesRef = useRef<BiquadFilterNode[]>([]);
  const splitterNodeRef = useRef<ChannelSplitterNode | null>(null);
  const mergerNodeRef = useRef<ChannelMergerNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);

  const cleanupAudioContext = useCallback(() => {
    if (audioCtxRef.current) {
      try {
        if (audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close().catch(console.error);
        }
      } catch (e) {
        console.error("Failed to close AudioContext:", e);
      }
      audioCtxRef.current = null;
      sourceNodeRef.current = null;
      delayNodeRef.current = null;
      compressorNodeRef.current = null;
      normalizeGainNodeRef.current = null;
      gainNodeRef.current = null;
      eqNodesRef.current = [];
      splitterNodeRef.current = null;
      mergerNodeRef.current = null;
      analyserNodeRef.current = null;
    }
  }, []);

  const initAudioContext = useCallback(() => {
    if (!videoRef.current || audioCtxRef.current) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(videoRef.current);
      sourceNodeRef.current = source;

      // Equalizer Nodes
      const lowFilter = ctx.createBiquadFilter();
      lowFilter.type = 'lowshelf';
      lowFilter.frequency.value = 320;
      lowFilter.gain.value = eqGains[0];

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = 'peaking';
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;
      midFilter.gain.value = eqGains[1];

      const highFilter = ctx.createBiquadFilter();
      highFilter.type = 'highshelf';
      highFilter.frequency.value = 3200;
      highFilter.gain.value = eqGains[2];

      eqNodesRef.current = [lowFilter, midFilter, highFilter];

      // Gain Node (Audio Boost)
      const gainNode = ctx.createGain();
      gainNode.gain.value = audioBoost;
      gainNodeRef.current = gainNode;

      // Delay Node (Audio Sync)
      const delayNode = ctx.createDelay(5.0); // max delay 5 seconds
      delayNode.delayTime.value = Math.max(0, audioDelay);
      // Ensure the delayNode output is in Stereo (2 channels) for balanced audio.
      delayNode.channelCount = 2;
      delayNode.channelCountMode = 'explicit';
      delayNodeRef.current = delayNode;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = normalizeThreshold;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      compressorNodeRef.current = compressor;

      const normalizeGainNode = ctx.createGain();
      normalizeGainNode.gain.value = Math.pow(10, normalizeGain / 20);
      normalizeGainNodeRef.current = normalizeGainNode;

      // Splitter & Merger Nodes to Swap Stereo Channels
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      splitterNodeRef.current = splitter;
      mergerNodeRef.current = merger;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserNodeRef.current = analyser;

      // Connect chain: source -> filters -> gain -> delay -> splitter -> merger -> [compressor -> normalizeGainNode] -> analyser -> destination
      source.connect(lowFilter);
      lowFilter.connect(midFilter);
      midFilter.connect(highFilter);
      highFilter.connect(gainNode);
      gainNode.connect(delayNode);

      delayNode.connect(splitter);
      if (isSwapChannels) {
        splitter.connect(merger, 0, 1); // Left to Right
        splitter.connect(merger, 1, 0); // Right to Left
      } else {
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 1, 1);
      }

      if (isAudioNormalized) {
        merger.connect(compressor);
        compressor.connect(normalizeGainNode);
        normalizeGainNode.connect(analyser);
      } else {
        merger.connect(analyser);
      }
      analyser.connect(ctx.destination);
    } catch (e) {
      console.error("AudioContext init failed", e);
    }
  }, [videoRef, isAudioNormalized, audioBoost, eqGains, audioDelay, isSwapChannels, normalizeThreshold, normalizeGain]);

  useEffect(() => {
    if (!audioCtxRef.current || !sourceNodeRef.current || !compressorNodeRef.current || !gainNodeRef.current || !delayNodeRef.current || !splitterNodeRef.current || !mergerNodeRef.current || !normalizeGainNodeRef.current || !analyserNodeRef.current) return;
    const ctx = audioCtxRef.current;
    const gainNode = gainNodeRef.current;
    const delayNode = delayNodeRef.current;
    const splitter = splitterNodeRef.current;
    const merger = mergerNodeRef.current;
    const compressor = compressorNodeRef.current;
    const normalizeGainNode = normalizeGainNodeRef.current;
    const analyser = analyserNodeRef.current;

    try {
      gainNode.disconnect();
      delayNode.disconnect();
      splitter.disconnect();
      merger.disconnect();
      compressor.disconnect();
      normalizeGainNode.disconnect();
      analyser.disconnect();

      // gainNode -> delayNode
      gainNode.connect(delayNode);

      // delayNode -> splitter
      delayNode.connect(splitter);

      // splitter -> merger
      if (isSwapChannels) {
        splitter.connect(merger, 0, 1); // Left to Right
        splitter.connect(merger, 1, 0); // Right to Left
      } else {
        splitter.connect(merger, 0, 0);
        splitter.connect(merger, 1, 1);
      }

      // merger -> destination/compressor
      if (isAudioNormalized) {
        merger.connect(compressor);
        compressor.connect(normalizeGainNode);
        normalizeGainNode.connect(analyser);
      } else {
        merger.connect(analyser);
      }
      analyser.connect(ctx.destination);
    } catch (e) {
      console.error("AudioContext toggle failed", e);
    }
  }, [isAudioNormalized, isSwapChannels]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(audioBoost, audioCtxRef.current?.currentTime || 0, 0.1);
    }
  }, [audioBoost]);

  useEffect(() => {
    if (delayNodeRef.current) {
      delayNodeRef.current.delayTime.setTargetAtTime(Math.max(0, audioDelay), audioCtxRef.current?.currentTime || 0, 0.1);
    }
  }, [audioDelay]);

  useEffect(() => {
    eqNodesRef.current.forEach((node, i) => {
      if (node) {
        node.gain.setTargetAtTime(eqGains[i], audioCtxRef.current?.currentTime || 0, 0.1);
      }
    });
  }, [eqGains]);

  useEffect(() => {
    if (compressorNodeRef.current) {
      compressorNodeRef.current.threshold.setTargetAtTime(normalizeThreshold, audioCtxRef.current?.currentTime || 0, 0.1);
    }
  }, [normalizeThreshold]);

  useEffect(() => {
    if (normalizeGainNodeRef.current) {
      const val = Math.pow(10, normalizeGain / 20);
      normalizeGainNodeRef.current.gain.setTargetAtTime(val, audioCtxRef.current?.currentTime || 0, 0.1);
    }
  }, [normalizeGain]);

  const togglePlay = useCallback(() => {
    // Initialize AudioContext on user interaction to avoid browser autoplay restrictions
    if (isAudioNormalized || isSwapChannels || audioBoost !== 1 || audioDelay !== 0 || eqGains.some(g => g !== 0)) {
      initAudioContext();
    }
    setIsPlaying(prev => !prev);
  }, [initAudioContext, isAudioNormalized, isSwapChannels, audioBoost, audioDelay, eqGains]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const toggleAudioNormalize = useCallback(() => {
    initAudioContext();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    setIsAudioNormalized(prev => !prev);
  }, [initAudioContext]);

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, [videoRef]);

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const curr = videoRef.current.currentTime;
    const dur = videoRef.current.duration;
    setDuration(dur || 0);
    setProgress((curr / dur) * 100 || 0);
    setCurrentTime(curr);

    if (repeatEnabled && repeatA !== null && repeatB !== null) {
      if (curr >= repeatB) {
        videoRef.current.currentTime = repeatA;
      }
    }
  }, [videoRef, repeatEnabled, repeatA, repeatB]);

  const handleVideoError = useCallback((e: any) => {
    const video = e.target as HTMLVideoElement;
    let errorMsg = 'Gagal memutar video.';
    if (video.error) {
      switch (video.error.code) {
        case 1: errorMsg = 'Proses pemuatan dibatalkan.'; break;
        case 2: errorMsg = 'Kesalahan jaringan saat memuat video.'; break;
        case 3: errorMsg = 'Video rusak atau format tidak didukung.'; break;
        case 4: errorMsg = 'Video tidak ditemukan atau link tidak valid.'; break;
      }
    }
    setVideoError(errorMsg);
    setIsPlaying(false);
  }, []);

  const toggleFullscreen = useCallback((containerRef: React.RefObject<HTMLDivElement | null>) => {
    if (containerRef.current) {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (isCurrentlyFullscreen) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  }, []);

  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  }, [videoRef]);

  const checkStreamAvailability = useCallback(async (url: string): Promise<boolean> => {
    if (!url) return false;
    if (!url.includes('.m3u8')) return true;
    if (url.startsWith('blob:') || url.startsWith('file:') || url.startsWith('local-file:') || url.includes('127.0.0.1') || url.includes('localhost')) return true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': '*/*'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn("HLS availability check failed:", error);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!videoRef.current) return;

    let isCancelled = false;

    // Explicitly pause and clear previous srcObject before loading the new source to prevent playback issues
    try {
      videoRef.current.pause();
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      console.warn("Error pausing/clearing media element:", e);
    }

    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.pause();
        mpegtsPlayerRef.current.unload();
        mpegtsPlayerRef.current.detachMediaElement();
      } catch (e) {
        console.warn("Error detaching mpegts:", e);
      }
      mpegtsPlayerRef.current.destroy();
      mpegtsPlayerRef.current = null;
    }

    if (hlsPlayerRef.current) {
      try {
        hlsPlayerRef.current.stopLoad();
        hlsPlayerRef.current.detachMedia();
      } catch (e) {
        console.warn("Error detaching Hls:", e);
      }
      hlsPlayerRef.current.destroy();
      hlsPlayerRef.current = null;
    }

    // Clean up AudioContext when source changes or is cleared to ensure a clean slate
    cleanupAudioContext();

    if (videoSrc) {
      // Re-init audio context for new source if normalization or other audio processing is active
      if (isAudioNormalized || isSwapChannels || audioBoost !== 1 || audioDelay !== 0 || eqGains.some(g => g !== 0)) {
        initAudioContext();
      }

      const isM3U8 = videoSrc.includes('.m3u8') || (originalVideoSrc && originalVideoSrc.includes('.m3u8'));

      if (isM3U8) {
        setIsCheckingStream(true);
        setVideoError(null);

        checkStreamAvailability(videoSrc).then((available) => {
          if (isCancelled) return;
          setIsCheckingStream(false);

          if (!available) {
            setVideoError(t('streamUnreachable', currentLanguage));
            setIsPlaying(false);
            if (videoRef.current) {
              videoRef.current.removeAttribute('src');
              videoRef.current.load();
            }
            return;
          }

          if (Hls.isSupported()) {
            try {
              const hls = new Hls({
                maxMaxBufferLength: 30, // Limit buffer size to be super responsive
                enableWorker: true,
                lowLatencyMode: true,
              });
              hls.loadSource(videoSrc);
              hls.attachMedia(videoRef.current);
              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                if (isPlaying && videoRef.current) {
                  videoRef.current.play().catch(() => {});
                }
              });
              hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      console.warn('Fatal HLS network error, attempting reload...', data);
                      hls.startLoad();
                      break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                      console.warn('Fatal HLS media error, recovering...', data);
                      hls.recoverMediaError();
                      break;
                    default:
                      console.error('Fatal unrecoverable HLS error:', data);
                      hls.destroy();
                      setVideoError(t('streamUnreachable', currentLanguage));
                      setIsPlaying(false);
                      break;
                  }
                }
              });
              hlsPlayerRef.current = hls;
            } catch (e) {
              console.error("Hls error", e);
              if (videoRef.current) {
                videoRef.current.src = videoSrc;
                videoRef.current.load();
                if (isPlaying) videoRef.current.play().catch(() => {});
              }
            }
          } else if (videoRef.current) {
            videoRef.current.src = videoSrc;
            videoRef.current.load();
            if (isPlaying) videoRef.current.play().catch(() => {});
          }
        });
      } else if ((videoSrc.endsWith('.ts') || videoSrc.includes('.ts?')) && mpegts.isSupported()) {
        try {
          const player = mpegts.createPlayer({
            type: 'mse',
            isLive: false,
            url: videoSrc,
          });
          player.attachMediaElement(videoRef.current);
          player.load();
          mpegtsPlayerRef.current = player;
          if (isPlaying && videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        } catch (e) {
          console.error("mpegts error", e);
          videoRef.current.src = videoSrc;
          videoRef.current.load();
          if (isPlaying && videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        }
      } else {
        videoRef.current.src = videoSrc;
        videoRef.current.load();
        if (isPlaying && videoRef.current) {
          videoRef.current.play().catch(() => {});
        }
      }
    } else {
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }

    return () => {
      isCancelled = true;
      if (mpegtsPlayerRef.current) {
        try {
          mpegtsPlayerRef.current.pause();
          mpegtsPlayerRef.current.unload();
          mpegtsPlayerRef.current.detachMediaElement();
        } catch (e) {}
        mpegtsPlayerRef.current.destroy();
        mpegtsPlayerRef.current = null;
      }
      if (hlsPlayerRef.current) {
        try {
          hlsPlayerRef.current.stopLoad();
          hlsPlayerRef.current.detachMedia();
        } catch (e) {}
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }
      cleanupAudioContext();
    };
  }, [videoSrc, videoRef, currentLanguage, checkStreamAvailability]); // eslint-disable-next-line react-hooks/exhaustive-deps

  // Auto-play when video is ready/canplay if isPlaying is true
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleReadyToPlay = () => {
      if (isPlaying && videoEl.paused && videoEl.src && videoSrc) {
        videoEl.play().catch(e => {
          if (e.name !== 'AbortError' && e.name !== 'NotSupportedError') {
            console.warn("Auto-play on ready failed:", e);
          }
        });
      }
    };

    videoEl.addEventListener('canplay', handleReadyToPlay);
    videoEl.addEventListener('loadedmetadata', handleReadyToPlay);

    return () => {
      videoEl.removeEventListener('canplay', handleReadyToPlay);
      videoEl.removeEventListener('loadedmetadata', handleReadyToPlay);
    };
  }, [isPlaying, videoRef, videoSrc]);

  // Force sound on source change
  useEffect(() => {
    if (videoRef.current && videoSrc) {
      // Reset mute and set volume whenever source changes
      videoRef.current.muted = isMuted;
      videoRef.current.volume = volume;
      
      // Attempt to resume audio context on source change too
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(console.warn);
      }
    }
  }, [videoSrc, isMuted, volume]);

  useEffect(() => {
    if (videoRef.current) {
      if (!videoSrc) {
        return;
      }
      if (isPlaying) {
        // Force sync volume and mute state before playing
        videoRef.current.muted = isMuted;
        videoRef.current.volume = volume;
        
        // Initialize AudioContext on playback start
        if (isAudioNormalized || isSwapChannels || audioBoost !== 1 || audioDelay !== 0 || eqGains.some(g => g !== 0)) {
          initAudioContext();
        }

        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'AbortError' && e.name !== 'NotSupportedError') {
              console.warn("Autoplay blocked or failed, retrying muted...", e);
              // If blocked, sometimes playing muted first then unmuting works
              if (videoRef.current && videoSrc) {
                videoRef.current.muted = true;
                videoRef.current.play().then(() => {
                  // After successful muted play, try to unmute after a short delay
                  setTimeout(() => {
                    if (videoRef.current && isPlaying) {
                      videoRef.current.muted = isMuted;
                      // Ensure AudioContext is initialized & resumed
                      if (isAudioNormalized || isSwapChannels || audioBoost !== 1 || audioDelay !== 0 || eqGains.some(g => g !== 0)) {
                        initAudioContext();
                      }
                      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
                        audioCtxRef.current.resume().catch(console.warn);
                      }
                    }
                  }, 100);
                }).catch(console.warn);
              }
            }
          });
        }
        
        // Aggressive resume for AudioContext
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume().catch(console.warn);
        }
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, videoSrc, videoRef, isMuted, volume, isAudioNormalized, isSwapChannels, audioBoost, audioDelay, eqGains, initAudioContext]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
      videoRef.current.playbackRate = playbackRate;
      
      // Ensure AudioContext is resumed on play if it exists
      if (isPlaying && audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    }
  }, [volume, isMuted, playbackRate, isPlaying, videoRef, videoSrc]);

  return {
    videoSrc, setVideoSrc,
    originalVideoSrc, setOriginalVideoSrc,
    isPlaying, setIsPlaying, togglePlay,
    volume, setVolume,
    isMuted, setIsMuted, toggleMute,
    isAudioNormalized, setIsAudioNormalized, toggleAudioNormalize,
    progress, setProgress,
    bufferedProgress, setBufferedProgress,
    proxyProgress, setProxyProgress,
    currentTime, setCurrentTime,
    duration, setDuration,
    playbackRate, setPlaybackRate, setSpeed,
    isFullscreen, setIsFullscreen, toggleFullscreen,
    isPiP, setIsPiP, togglePiP,
    videoError, setVideoError,
    isCheckingStream,
    handleTimeUpdate, handleVideoError,
    repeatA, setRepeatA,
    repeatB, setRepeatB,
    repeatEnabled, setRepeatEnabled,
    audioBoost, setAudioBoost,
    eqGains, setEqGains,
    audioDelay, setAudioDelay,
    isSwapChannels, setIsSwapChannels,
    normalizeThreshold, setNormalizeThreshold,
    normalizeGain, setNormalizeGain,
    initAudioContext,
    analyserRef: analyserNodeRef
  };
};
