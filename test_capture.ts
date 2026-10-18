const captureFutureVideoFrame = async (videoRef: any, offsetSeconds: number = 5): Promise<string | null> => {
    if (!videoRef.current) return null;
    const mainVideo = videoRef.current;
    if (mainVideo.readyState < 2) return null;

    if (offsetSeconds <= 0) {
      // Logic for synchronous capture
      return null;
    }

    return new Promise((resolve) => {
      const futureVideo = document.createElement('video');
      
      // If it's a MediaStream (Live), we cannot seek ahead.
      if (mainVideo.srcObject) {
        resolve(null); // fallback
        return;
      }

      futureVideo.src = mainVideo.currentSrc || mainVideo.src;
      futureVideo.crossOrigin = mainVideo.crossOrigin;
      futureVideo.muted = true;
      futureVideo.playbackRate = 2.0; // Try to speed up loading if needed

      let targetTime = mainVideo.currentTime + offsetSeconds;
      if (isFinite(mainVideo.duration) && targetTime > mainVideo.duration) {
        targetTime = mainVideo.duration - 0.5;
      }

      let resolved = false;
      const cleanup = () => {
        futureVideo.onseeked = null;
        futureVideo.onerror = null;
        futureVideo.remove();
      };

      const finish = (data: string | null) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(data);
        }
      };

      futureVideo.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(futureVideo.videoWidth || 480, 480);
          canvas.height = Math.min(futureVideo.videoHeight || 270, 270);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(futureVideo, 0, 0, canvas.width, canvas.height);
            finish(canvas.toDataURL('image/jpeg', 0.5));
          } else {
            finish(null);
          }
        } catch (e) {
          console.warn('Future frame capture failed:', e);
          finish(null);
        }
      };

      futureVideo.onerror = () => {
        finish(null);
      };

      // Set time to trigger seek
      futureVideo.currentTime = targetTime;
      
      // Timeout fallback just in case it hangs
      setTimeout(() => {
        finish(null);
      }, 1500);
    });
};
