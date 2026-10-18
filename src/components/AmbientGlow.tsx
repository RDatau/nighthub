import React, { useEffect, useRef } from 'react';

interface AmbientGlowProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  isEnabled: boolean;
  isAudioFile?: boolean;
  is360Mode?: boolean;
  videoSrc?: string;
  className?: string;
}

export const AmbientGlow: React.FC<AmbientGlowProps> = ({
  videoRef,
  isPlaying,
  isEnabled,
  isAudioFile,
  is360Mode,
  videoSrc,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastDrawTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isEnabled || isAudioFile || is360Mode || !videoSrc) {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) return;

    let active = true;

    const renderFrame = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !canvas) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // Adapt canvas aspect ratio to container for accurate projection
      const parent = canvas.parentElement;
      if (parent) {
        const pWidth = parent.clientWidth || window.innerWidth;
        const pHeight = parent.clientHeight || window.innerHeight;
        const targetCw = 80;
        const targetCh = Math.max(20, Math.round(80 * (pHeight / pWidth)));
        if (canvas.width !== targetCw || canvas.height !== targetCh) {
          canvas.width = targetCw;
          canvas.height = targetCh;
        }
      }

      const cw = canvas.width;
      const ch = canvas.height;
      const videoAspect = vw / vh;
      const canvasAspect = cw / ch;

      try {
        if (Math.abs(videoAspect - canvasAspect) < 0.05) {
          // Direct 1:1 match
          ctx.drawImage(video, 0, 0, cw, ch);
        } else if (videoAspect < canvasAspect) {
          // Pillarbox (e.g. vertical video 9:16 in a widescreen player):
          // Render video centered, and bleed the outermost edge columns smoothly outward
          const drawW = ch * videoAspect;
          const offsetX = (cw - drawW) / 2;
          const sliceW = Math.max(1, Math.round(vw * 0.05));

          // 1. Center video content
          ctx.drawImage(video, offsetX, 0, drawW, ch);

          // 2. Seamlessly bleed left edge outward to x = 0
          ctx.drawImage(video, 0, 0, sliceW, vh, 0, 0, offsetX + 1, ch);

          // 3. Seamlessly bleed right edge outward to x = cw
          ctx.drawImage(video, vw - sliceW, 0, sliceW, vh, offsetX + drawW - 1, 0, cw - (offsetX + drawW) + 1, ch);
        } else {
          // Letterbox (e.g. ultrawide video 21:9 in a taller player):
          // Render video centered, and bleed top/bottom edge rows smoothly outward
          const drawH = cw / videoAspect;
          const offsetY = (ch - drawH) / 2;
          const sliceH = Math.max(1, Math.round(vh * 0.05));

          // 1. Center video content
          ctx.drawImage(video, 0, offsetY, cw, drawH);

          // 2. Seamlessly bleed top edge upward to y = 0
          ctx.drawImage(video, 0, 0, vw, sliceH, 0, 0, cw, offsetY + 1);

          // 3. Seamlessly bleed bottom edge downward to y = ch
          ctx.drawImage(video, 0, vh - sliceH, vw, sliceH, 0, offsetY + drawH - 1, cw, ch - (offsetY + drawH) + 1);
        }
      } catch (_) {
        // Silently catch cross-origin or tainted canvas errors
      }
    };

    const render = (now: number) => {
      if (!active) return;

      const video = videoRef.current;
      if (video && video.readyState >= 2 && !video.paused && !video.ended) {
        // Draw at approx 24-30 fps (every ~35ms) to conserve CPU/GPU
        if (now - lastDrawTimeRef.current >= 35) {
          lastDrawTimeRef.current = now;
          renderFrame();
        }
      }

      if (isPlaying) {
        animFrameIdRef.current = requestAnimationFrame(render);
      }
    };

    // Initial draw once (for when video starts or is paused)
    renderFrame();

    if (isPlaying) {
      animFrameIdRef.current = requestAnimationFrame(render);
    }

    return () => {
      active = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [isPlaying, isEnabled, isAudioFile, is360Mode, videoSrc, videoRef]);

  // Hook into seeked / timeupdate events when paused so ambient glow follows seeking
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isEnabled) return;

    const updateGlow = () => {
      if (video.paused && canvasRef.current && video.readyState >= 2) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return;

        const cw = canvas.width;
        const ch = canvas.height;
        const videoAspect = vw / vh;
        const canvasAspect = cw / ch;

        try {
          if (Math.abs(videoAspect - canvasAspect) < 0.05) {
            ctx.drawImage(video, 0, 0, cw, ch);
          } else if (videoAspect < canvasAspect) {
            const drawW = ch * videoAspect;
            const offsetX = (cw - drawW) / 2;
            const sliceW = Math.max(1, Math.round(vw * 0.05));
            ctx.drawImage(video, offsetX, 0, drawW, ch);
            ctx.drawImage(video, 0, 0, sliceW, vh, 0, 0, offsetX + 1, ch);
            ctx.drawImage(video, vw - sliceW, 0, sliceW, vh, offsetX + drawW - 1, 0, cw - (offsetX + drawW) + 1, ch);
          } else {
            const drawH = cw / videoAspect;
            const offsetY = (ch - drawH) / 2;
            const sliceH = Math.max(1, Math.round(vh * 0.05));
            ctx.drawImage(video, 0, offsetY, cw, drawH);
            ctx.drawImage(video, 0, 0, vw, sliceH, 0, 0, cw, offsetY + 1);
            ctx.drawImage(video, 0, vh - sliceH, vw, sliceH, 0, offsetY + drawH - 1, cw, ch - (offsetY + drawH) + 1);
          }
        } catch (_) {}
      }
    };

    video.addEventListener('seeked', updateGlow);
    video.addEventListener('loadeddata', updateGlow);
    video.addEventListener('timeupdate', updateGlow);

    return () => {
      video.removeEventListener('seeked', updateGlow);
      video.removeEventListener('loadeddata', updateGlow);
      video.removeEventListener('timeupdate', updateGlow);
    };
  }, [videoRef, isEnabled]);

  if (!isEnabled || isAudioFile || is360Mode) return null;

  return (
    <div 
      className={`absolute inset-0 z-0 pointer-events-none overflow-hidden flex items-center justify-center transition-opacity duration-700 ease-out ${className}`}
      style={{
        opacity: isEnabled ? (isPlaying ? 0.85 : 0.45) : 0,
      }}
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        width={80}
        height={45}
        className="w-full h-full object-cover pointer-events-none select-none"
        style={{
          filter: 'blur(68px) saturate(1.4) brightness(0.9)',
          transform: 'scale(1.12)',
          willChange: 'filter, transform',
        }}
      />
    </div>
  );
};
