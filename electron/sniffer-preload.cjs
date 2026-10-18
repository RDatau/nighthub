// Sniffer Preload Script
// Digunakan untuk bypass deteksi AdBlock sederhana di situs-situs streaming
const { ipcRenderer, contextBridge } = require('electron');

// --- BROWSER ENV SPOOFING (RUNS IMMEDIATELY AT DOCUMENT-START) ---
// Spoof webdriver to fool anti-bot/Google security checks
try {
  if (navigator.webdriver !== undefined) {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true
    });
  }
} catch (e) {}

// Helper to inject code into the page's MAIN world DOM context
function injectScriptIntoPage(code) {
  try {
    const { webFrame } = require('electron');
    if (webFrame && typeof webFrame.executeJavaScript === 'function') {
      webFrame.executeJavaScript(code);
      return;
    }
  } catch (e) {}

  const run = () => {
    try {
      const target = document.head || document.documentElement || document.body;
      if (target) {
        const el = document.createElement('script');
        const existing = document.querySelector('script[nonce]');
        if (existing && existing.nonce) {
          el.nonce = existing.nonce;
        }
        el.textContent = code;
        target.appendChild(el);
        el.remove();
      }
    } catch (e) {}
  };
  if (document.documentElement) {
    run();
  } else {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  }
}

// Pornhub safe stubs (NEVER set abp1 or holiday_promo: they trigger anti-adblock loops and promo interstitial spinner)
try {
  if (window.location.hostname.includes('pornhub')) {
    window.adsbytrafficjunkycontext = window.adsbytrafficjunkycontext || {};
    window.trafficjunky = window.trafficjunky || {};
  }
} catch (e) {}

const host = window.location.hostname;
const isGoogleOrOauth = host.includes('google.') || host.includes('youtube.com') || host.includes('facebook.com') || host.includes('github.com') || host.includes('discord.com');
const firefoxUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

if (isGoogleOrOauth) {
  try {
    Object.defineProperty(navigator, 'userAgent', {
      get: () => firefoxUA,
      configurable: true
    });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'appVersion', {
      get: () => '5.0 (Windows)',
      configurable: true
    });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Win32',
      configurable: true
    });
  } catch (e) {}
}

const isFirefox = navigator.userAgent.includes('Firefox') || isGoogleOrOauth;

if (isFirefox) {
  // If the User Agent is Firefox, we MUST completely delete/hide Chrome-specific APIs
  // to avoid environment fingerprint mismatch with the sent Firefox headers.
  try {
    delete Navigator.prototype.userAgentData;
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => undefined,
      configurable: true
    });
  } catch (e) {}
  try {
    delete window.chrome;
  } catch (e) {}
  try {
    Object.defineProperty(window, 'chrome', {
      get: () => undefined,
      configurable: true
    });
  } catch (e) {}
} else {
  // Spoof userAgentData to look exactly like standard Google Chrome (Windows or Android based on UA)
  if (navigator.userAgentData) {
    try {
      const isMobile = navigator.userAgent.toLowerCase().includes('mobile') || navigator.userAgent.toLowerCase().includes('android');
      const brands = [
        { brand: 'Not A(An Brand', version: '24' },
        { brand: 'Chromium', version: '134' },
        { brand: 'Google Chrome', version: '134' }
      ];
      
      Object.defineProperty(navigator.userAgentData, 'brands', {
        get: () => brands,
        configurable: true
      });
      
      Object.defineProperty(navigator.userAgentData, 'mobile', {
        get: () => isMobile,
        configurable: true
      });
      
      Object.defineProperty(navigator.userAgentData, 'platform', {
        get: () => isMobile ? 'Android' : 'Windows',
        configurable: true
      });

      if (typeof navigator.userAgentData.getHighEntropyValues === 'function') {
        const origGetHighEntropy = navigator.userAgentData.getHighEntropyValues.bind(navigator.userAgentData);
        navigator.userAgentData.getHighEntropyValues = function(hints) {
          return origGetHighEntropy(hints).then(values => {
            return {
              ...values,
              brands: brands,
              mobile: isMobile,
              platform: isMobile ? 'Android' : 'Windows',
              platformVersion: isMobile ? '13.0.0' : '15.0.0',
              architecture: isMobile ? 'arm' : 'x86',
              model: isMobile ? 'Pixel 7' : '',
              uaFullVersion: '134.0.0.0'
            };
          }).catch(() => ({
            brands: brands,
            mobile: isMobile,
            platform: isMobile ? 'Android' : 'Windows',
            platformVersion: isMobile ? '13.0.0' : '15.0.0',
            architecture: isMobile ? 'arm' : 'x86',
            model: isMobile ? 'Pixel 7' : '',
            uaFullVersion: '134.0.0.0'
          }));
        };
      }
    } catch (e) {}
  }

  // Emulate standard window.chrome so Google thinks it is a real standard Chrome (without chrome.runtime)
  try {
    if (!window.chrome) {
      window.chrome = {};
    }
    window.chrome.app = window.chrome.app || {
      isInstalled: false,
      InstallState: {
        DISABLED: 'disabled',
        INSTALLED: 'installed',
        NOT_INSTALLED: 'not_installed'
      },
      RunningState: {
        CANNOT_RUN: 'cannot_run',
        READY_TO_RUN: 'ready_to_run',
        RUNNING: 'running'
      },
      getDetails: function() {},
      getIsInstalled: function() {},
      installState: function() {}
    };
    window.chrome.csi = window.chrome.csi || function() {};
    window.chrome.loadTimes = window.chrome.loadTimes || function() {};
    
    // Standard Chrome on a normal web page does NOT have chrome.runtime!
    if (window.chrome.runtime) {
      try { delete window.chrome.runtime; } catch(err) {}
    }
  } catch (e) {}
}

// Spoof languages for consistency
try {
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true
  });
} catch (e) {}

// --- NEW FEATURE: CONTEXT BRIDGE ---
// Restrict and secure context bridge communication for external scripts. 🔒
// Do not expose electronAPI on Google/YouTube/other OAuth domains to prevent fingerprint detection!
if (!isGoogleOrOauth) {
  contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => {
      const validChannels = ['log-message', 'video-detected', 'open-new-tab', 'sniffer-go-back', 'sniffer-go-forward'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    on: (channel, func) => {
      const validChannels = ['sniffer-scroll-begin', 'sniffer-scroll-end', 'open-file'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  });
}

let isFingerOnTouchpad = false;

ipcRenderer.on('sniffer-scroll-begin', () => {
  isFingerOnTouchpad = true;
});

ipcRenderer.on('sniffer-scroll-end', () => {
  isFingerOnTouchpad = false;
  
  // This is the "Arc Browser" way: Execute ONLY when fingers are lifted
  if (isSwiping) {
    const maxDistance = 200;
    const threshold = 100;
    
    if (swipeAccumulator > threshold) {
      if (swipeDirection === 'back') ipcRenderer.send('sniffer-go-back');
      if (swipeDirection === 'forward') ipcRenderer.send('sniffer-go-forward');
    }
    
    hideSwipeIndicator();
    isSwiping = false;
    swipeAccumulator = 0;
    swipeDirection = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
});

window.addEventListener('DOMContentLoaded', () => {
  // 0.5. Touchpad Gesture (Two-finger swipe for Back/Forward with visual pull)
  let swipeAccumulator = 0;
  let isSwiping = false;
  let swipeDirection = null; // 'back' or 'forward'
  let swipeTimeout = null;
  let swipeIndicator = null;
  let swipeIcon = null;
  let originalHtmlOverflowX = '';
  let originalBodyOverflowX = '';
  let isSnappingBackX = false;
  let rafId = null;

  function createSwipeIndicator() {
    if (swipeIndicator) return;
    swipeIndicator = document.createElement('div');
    swipeIndicator.style.cssText = `
      position: fixed;
      top: 50%;
      width: 56px;
      height: 56px;
      background-color: rgba(39, 39, 42, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 50%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease-out, transform 0.2s ease-out;
    `;
    
    swipeIcon = document.createElement('div');
    swipeIcon.style.cssText = `
      width: 28px;
      height: 28px;
      transition: color 0.2s ease, transform 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    swipeIndicator.appendChild(swipeIcon);
    document.documentElement.appendChild(swipeIndicator);
  }

  function updateSwipeIndicator(distance, direction) {
    if (!swipeIndicator) createSwipeIndicator();
    
    const maxDistance = 200; 
    const threshold = 100;
    const isReady = distance > threshold;
    
    const backSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>';
    const forwardSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>';
    
    swipeIcon.innerHTML = direction === 'back' ? backSvg : forwardSvg;
    swipeIcon.style.color = isReady ? '#f59e0b' : '#ffffff';
    
    // 1:1 Movement with a bit of extra room
    const visualDistance = Math.min(distance, maxDistance + 30);
    
    // Disable transition during active swipe for 1:1 feel
    swipeIndicator.style.transition = 'opacity 0.1s ease-out';
    
    if (direction === 'back') {
      swipeIndicator.style.left = '-60px'; // Start hidden
      swipeIndicator.style.right = 'auto';
      const translateX = visualDistance;
      swipeIndicator.style.transform = `translate(${translateX}px, -50%)`;
    } else {
      swipeIndicator.style.right = '-60px'; // Start hidden
      swipeIndicator.style.left = 'auto';
      const translateX = -visualDistance;
      swipeIndicator.style.transform = `translate(${translateX}px, -50%)`;
    }
    
    swipeIndicator.style.opacity = Math.min(distance / 20, 1).toString();
  }

  function renderSwipeIndicator() {
    if (isSwiping) {
      updateSwipeIndicator(swipeAccumulator, swipeDirection);
      rafId = requestAnimationFrame(renderSwipeIndicator);
    }
  }

  function hideSwipeIndicator() {
    if (swipeIndicator) {
      // Smooth slide out animation
      swipeIndicator.style.transition = 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1), opacity 0.4s ease-out';
      if (swipeDirection === 'back') {
        swipeIndicator.style.transform = 'translate(-120px, -50%)';
      } else {
        swipeIndicator.style.transform = 'translate(120px, -50%)';
      }
      swipeIndicator.style.opacity = '0';
    }
    isSnappingBackX = true;
    
    // Clean up after animation completes
    setTimeout(() => {
      if (!isSwiping) {
        document.documentElement.style.overflowX = originalHtmlOverflowX;
        document.body.style.overflowX = originalBodyOverflowX;
        isSnappingBackX = false;
      }
    }, 500);
  }

  window.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      // Horizontal swipe logic
      let target = e.target;
      let isInnerScrollableX = false;
      while (target && target !== document.body && target !== document.documentElement) {
        if (target.nodeType === 1) {
          const style = window.getComputedStyle(target);
          if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
            if (target.scrollWidth > target.clientWidth) {
              if (e.deltaX < 0 && target.scrollLeft > 0) isInnerScrollableX = true;
              if (e.deltaX > 0 && Math.ceil(target.scrollLeft + target.clientWidth) < target.scrollWidth - 5) isInnerScrollableX = true;
            }
          }
        }
        target = target.parentElement;
      }

      if (isInnerScrollableX) return;

      const atLeftEdge = window.scrollX <= 0;
      const atRightEdge = Math.ceil(window.scrollX + document.documentElement.clientWidth) >= document.documentElement.scrollWidth - 5;

      if (!isSwiping) {
        if (e.deltaX < 0 && atLeftEdge) {
          isSwiping = true;
          swipeDirection = 'back';
          swipeAccumulator = 0;
          
          if (!isSnappingBackX) {
            originalHtmlOverflowX = document.documentElement.style.overflowX;
            originalBodyOverflowX = document.body.style.overflowX;
          }
          document.documentElement.style.overflowX = 'hidden';
          document.body.style.overflowX = 'hidden';
        } else if (e.deltaX > 0 && atRightEdge) {
          isSwiping = true;
          swipeDirection = 'forward';
          swipeAccumulator = 0;
          
          if (!isSnappingBackX) {
            originalHtmlOverflowX = document.documentElement.style.overflowX;
            originalBodyOverflowX = document.body.style.overflowX;
          }
          document.documentElement.style.overflowX = 'hidden';
          document.body.style.overflowX = 'hidden';
        }
      }

      if (isSwiping) {
        if (swipeDirection === 'back') {
          swipeAccumulator -= e.deltaX;
        } else {
          swipeAccumulator += e.deltaX;
        }

        if (swipeAccumulator < 0) {
          swipeAccumulator = 0;
        }

        if (!rafId) {
          rafId = requestAnimationFrame(renderSwipeIndicator);
        }

        clearTimeout(swipeTimeout);
        swipeTimeout = setTimeout(() => {
          // Fallback for mouse wheel or if scroll-touch-end is not fired
          if (!isFingerOnTouchpad && isSwiping) {
            const maxDistance = 200;
            const threshold = 100;
            
            if (swipeAccumulator > threshold) {
              if (swipeDirection === 'back') ipcRenderer.send('sniffer-go-back');
              if (swipeDirection === 'forward') ipcRenderer.send('sniffer-go-forward');
            }
            
            hideSwipeIndicator();
            isSwiping = false;
            swipeAccumulator = 0;
            swipeDirection = null;
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
          }
        }, 300); // Longer fallback timeout
      }
    } else {
      // Vertical scroll logic
      if (isSwiping) {
        hideSwipeIndicator();
        isSwiping = false;
        swipeAccumulator = 0;
        swipeDirection = null;
        clearTimeout(swipeTimeout);
      }
    }
  }, { passive: true });

  // Jangan jalankan script anti-adblock spoofing di domain Cloudflare, recu.me, atau Google
  if (window.location.hostname.includes('cloudflare.com') || 
      window.location.hostname.includes('recu.me') ||
      window.location.hostname.includes('google.com') ||
      window.location.hostname.includes('youtube.com')) {
    return;
  }

  // 1. Palsukan variabel yang sering dicek oleh script Anti-AdBlock (Dihapus karena dideteksi oleh Cloudflare Turnstile)
  
  // 2. Buat elemen dummy yang biasanya dianggap sebagai iklan (Cosmetic Filtering)
  if (!window.location.hostname.includes('pornhub') && 
      !window.location.hostname.includes('spankbang') && 
      !window.location.hostname.includes('xhamster')) {
    const adStyles = `
      #ad-container, .ad-box, .ads-wrapper, #google_ads_frame, .ad-unit, .adsbygoogle,
      .ad-placement, .ad-sidebar, .ad-top, .ad-bottom, .ad-left, .ad-right,
      .ytp-ad-module, .ad-banner, [class*="ad-unit"], [id*="ad-unit"],
      .ad-slot, .ad-label, .ad-link {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        top: -9999px !important;
        left: -9999px !important;
      }
    `;
    const style = document.createElement('style');
    style.innerHTML = adStyles;
    document.head.appendChild(style);
  }

  // 3. Override beberapa fungsi deteksi (Dihapus karena dideteksi oleh Cloudflare Turnstile)
  
  // 4. Mencegah deteksi melalui pengecekan elemen tersembunyi
  // (Dihapus karena sering merusak layout player modern)

  // 5. Bypass FuckAdBlock / BlockAdBlock (Dihapus karena dideteksi oleh Cloudflare Turnstile)

  // 6. Mencegah error pada script yang mencari variabel iklan
  const stub = () => {};
  if (typeof window.ga === 'undefined') window.ga = stub;
  if (typeof window.gtag === 'undefined') window.gtag = stub;

  // 7. BRUTE FORCE OVERLAY REMOVER
  setInterval(() => {
    // Hapus overlay AdBlock yang menutupi layar
    const overlays = [
      '.adblock-overlay', '.adblock-message', '#adblock-msg', 
      '.blocked-content', '.ad-notice', '.fc-ab-root',
      '.sp-message-open', '.tp-modal', '.tp-backdrop', '.tp-iframe-wrapper',
      '[class*="adblock"]', '[id*="adblock"]', '[class*="anti-ad"]', '[id*="anti-ad"]'
    ];
    overlays.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.style.display !== 'none') {
            el.style.display = 'none';
            el.style.pointerEvents = 'none';
            // Kembalikan scroll jika dikunci oleh overlay
            document.body.style.overflow = 'auto';
            document.documentElement.style.overflow = 'auto';
          }
        });
      } catch (e) {}
    });
  }, 2000);

  // 8. Intercept Ctrl+Click untuk buka di tab baru (in the background)
  document.addEventListener('click', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.button === 0) {
      const target = e.target.closest('a');
      if (target && target.href && !target.href.startsWith('javascript:')) {
        e.preventDefault();
        e.stopPropagation();
        ipcRenderer.send('open-new-tab', { url: target.href, background: true });
      }
    }
  }, true);

  // 9. YOUTUBE VIDEO SNIFFER DETECTOR
  let lastYoutubeVideoId = null;
  setInterval(() => {
    try {
      const href = window.location.href;
      const isYoutubeWatch = href.includes('youtube.com/watch') || href.includes('youtu.be/') || href.includes('youtube.com/shorts/');
      if (isYoutubeWatch) {
        let videoId = null;
        if (href.includes('youtube.com/watch')) {
          const urlParams = new URLSearchParams(window.location.search);
          videoId = urlParams.get('v');
        } else if (href.includes('youtu.be/')) {
          const parts = href.split('/');
          videoId = parts[parts.length - 1].split('?')[0];
        } else if (href.includes('youtube.com/shorts/')) {
          const parts = href.split('/shorts/');
          videoId = parts[parts.length - 1].split('?')[0];
        }

        if (videoId && videoId !== lastYoutubeVideoId) {
          lastYoutubeVideoId = videoId;
          
          let title = document.title;
          if (title.endsWith(' - YouTube')) {
            title = title.substring(0, title.length - 10);
          }
          
          const h1 = document.querySelector('h1.ytd-watch-metadata') || document.querySelector('h1.style-scope.ytd-watch-metadata') || document.querySelector('yt-formatted-string.style-scope.ytd-watch-metadata');
          if (h1 && h1.textContent) {
            title = h1.textContent.trim();
          }

          ipcRenderer.send('video-detected', {
            url: href,
            type: 'YOUTUBE VIDEO',
            timestamp: Date.now(),
            title: title || 'YouTube Video',
            size: 'Auto Stream'
          });
        }
      }
    } catch (e) {
      console.error('YouTube detector error:', e);
    }
  }, 1500);

  // 9.5. ADVANCED COMPREHENSIVE STREAM SNIFFER (Spankbang, Pornhub, xHamster, HLS, Blob, etc.)
  const detectedMediaUrls = new Set();

  function reportDetectedStream(url, type, title, size) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return;
    if (detectedMediaUrls.has(cleanUrl)) return;
    
    // Aggressive filtering for ad-related URLs and non-video media
    const adKeywords = [
        '/ads/', 'analytics', 'tracker', 'banner', 'popunder', 'vast', 'vmap', 'adserver', 'googleadservices', 'googlesyndication', 'doubleclick.net', 'adnxs.com'
    ];
    if (adKeywords.some(kw => cleanUrl.includes(kw))) return;
    
    // Only allow common video file extensions or known stream formats
    const isVideoFile = cleanUrl.match(/\.(mp4|m3u8|mpd|webm|ts|m4s)(\?|$)/i);
    if (!isVideoFile && !cleanUrl.includes('/m3u8/') && !cleanUrl.includes('/dash/')) return;
    
    detectedMediaUrls.add(cleanUrl);
    const resolvedTitle = (title || document.title || 'Video Stream').trim();
    ipcRenderer.send('video-detected', {
      url: cleanUrl,
      type: type || 'STREAM VIDEO',
      timestamp: Date.now(),
      title: resolvedTitle,
      size: size
    });
  }

  // Listen to messages posted from the page's main world
  window.addEventListener('message', (event) => {
    try {
      if (event.data && event.data.type === 'NIGHTHUB_SNIFFED_STREAM' && event.data.url) {
        reportDetectedStream(event.data.url, event.data.streamType, event.data.title, event.data.size);
      }
    } catch (e) {}
  });

  // Inject main-world extractor script to capture stream_data, flashvars, fetch, XHR, and HTML5 video play events
  injectScriptIntoPage(`
    (function() {
      if (window.__nighthub_stream_injected) return;
      window.__nighthub_stream_injected = true;

      function notifyStream(url, type, quality) {
        if (!url || typeof url !== 'string' || url.startsWith('blob:')) return;
        try {
          window.postMessage({
            type: 'NIGHTHUB_SNIFFED_STREAM',
            url: url,
            streamType: (type || 'DIRECT VIDEO') + (quality ? ' [' + quality + ']' : ''),
            title: document.title || 'Video Stream'
          }, '*');
        } catch (e) {}
      }

      // Defuse Pornhub anti-adblock & promo loops in the main world
      try {
        if (location.hostname.includes('pornhub')) {
          window.adsbytrafficjunkycontext = window.adsbytrafficjunkycontext || {};
          window.trafficjunky = window.trafficjunky || {
            init: function() {},
            load: function() {},
            render: function() {}
          };
          let _pp = window.page_params || {};
          _pp.holiday_promo = 0;
          _pp.has_ad = false;
          _pp.ad_tags = [];
          try {
            Object.defineProperty(window, 'page_params', {
              get: () => _pp,
              set: (val) => {
                if (val && typeof val === 'object') {
                  val.holiday_promo = 0;
                  val.has_ad = false;
                  val.ad_tags = [];
                  _pp = val;
                }
              },
              configurable: true
            });
          } catch(e) {}
        }
      } catch(e) {}

      // 1. Spankbang stream_data & stream_url extraction
      function checkSpankbang() {
        try {
          if (window.stream_data && typeof window.stream_data === 'object') {
            for (const [key, val] of Object.entries(window.stream_data)) {
              if (Array.isArray(val) && val[0]) {
                notifyStream(val[0], key.includes('m3u8') ? 'HLS STREAM' : 'DIRECT VIDEO', key);
              } else if (typeof val === 'string' && val.startsWith('http')) {
                notifyStream(val, key.includes('m3u8') ? 'HLS STREAM' : 'DIRECT VIDEO', key);
              }
            }
          }
          for (const key of Object.keys(window)) {
            if (key.startsWith('stream_url_')) {
              const val = window[key];
              const q = key.replace('stream_url_', '');
              if (typeof val === 'string' && val.startsWith('http')) {
                notifyStream(val, q.includes('m3u8') ? 'HLS STREAM' : 'DIRECT VIDEO', q);
              }
            }
          }
        } catch (e) {}
      }

      // 2. Pornhub flashvars & mediaDefinitions extraction
      function checkPornhub() {
        try {
          for (const key of Object.keys(window)) {
            if (key.startsWith('flashvars_')) {
              const fv = window[key];
              if (fv && fv.mediaDefinitions && Array.isArray(fv.mediaDefinitions)) {
                fv.mediaDefinitions.forEach(item => {
                  if (item && item.videoUrl && item.videoUrl.startsWith('http')) {
                    const q = item.quality ? (item.quality + 'p') : (item.format || '');
                    notifyStream(item.videoUrl, item.format === 'hls' ? 'HLS STREAM' : 'DIRECT VIDEO', q);
                  }
                });
              }
            }
          }
        } catch (e) {}
      }

      // 3. xHamster initials / videoModel extraction
      function checkXHamster() {
        try {
          if (window.initials && window.initials.videoModel) {
            const sources = window.initials.videoModel.sources;
            if (sources) {
              if (sources.mp4 && typeof sources.mp4 === 'object') {
                for (const [q, u] of Object.entries(sources.mp4)) {
                  if (typeof u === 'string' && u.startsWith('http')) notifyStream(u, 'DIRECT VIDEO', q);
                }
              }
              if (sources.hls && typeof sources.hls === 'object') {
                for (const [q, u] of Object.entries(sources.hls)) {
                  if (typeof u === 'string' && u.startsWith('http')) notifyStream(u, 'HLS STREAM', q);
                }
              }
            }
          }
        } catch (e) {}
      }

      // 4. Check HTML5 <video> elements on page
      function checkVideoElements() {
        try {
          document.querySelectorAll('video').forEach(video => {
            let src = video.currentSrc || video.src;
            if (!src) {
              const source = video.querySelector('source');
              if (source) src = source.src;
            }
            if (!src) {
              src = video.getAttribute('data-src') || video.getAttribute('data-mediabook');
            }
            if (src && typeof src === 'string' && src.startsWith('http')) {
              notifyStream(src, 'HTML5 VIDEO', '');
            }
          });
        } catch (e) {}
      }

      // 5. Hook HTMLMediaElement.prototype.play and load
      try {
        const origPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function(...args) {
          try {
            let src = this.currentSrc || this.src;
            if (!src) {
              const source = this.querySelector('source');
              if (source) src = source.src;
            }
            if (src && typeof src === 'string' && src.startsWith('http')) {
              notifyStream(src, 'HTML5 VIDEO', '');
            }
          } catch (e) {}
          return origPlay.apply(this, args);
        };

        const origLoad = HTMLMediaElement.prototype.load;
        HTMLMediaElement.prototype.load = function(...args) {
          try {
            let src = this.currentSrc || this.src;
            if (!src) {
              const source = this.querySelector('source');
              if (source) src = source.src;
            }
            if (src && typeof src === 'string' && src.startsWith('http')) {
              notifyStream(src, 'HTML5 VIDEO', '');
            }
          } catch (e) {}
          return origLoad.apply(this, args);
        };
      } catch (e) {}

      // 6. Hook XMLHttpRequest for stream APIs (Spankbang / Pornhub / HLS)
      try {
        const origXHROpen = XMLHttpRequest.prototype.open;
        const origXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
          this.__nh_url = typeof url === 'string' ? url : (url ? url.toString() : '');
          return origXHROpen.call(this, method, url, ...args);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          this.addEventListener('load', function() {
            try {
              const reqUrl = this.__nh_url || '';
              if (reqUrl.includes('/api/videos/stream') || reqUrl.includes('/video/get_media') || reqUrl.includes('stream_data')) {
                try {
                  const data = JSON.parse(this.responseText);
                  if (data && typeof data === 'object') {
                    for (const [k, v] of Object.entries(data)) {
                      const streamUrl = Array.isArray(v) ? v[0] : v;
                      if (typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
                        notifyStream(streamUrl, k.includes('m3u8') ? 'HLS STREAM' : 'DIRECT VIDEO', k);
                      }
                    }
                  }
                } catch (e) {}
              } else if (reqUrl.includes('.m3u8') || reqUrl.includes('.mpd') || reqUrl.includes('.mp4')) {
                if (reqUrl.startsWith('http') && !reqUrl.match(/\.(ts|m4s|vtt)(\?|$)/i)) {
                  notifyStream(reqUrl, reqUrl.includes('.m3u8') ? 'HLS STREAM' : 'DIRECT VIDEO', '');
                }
              }
            } catch (e) {}
          });
          return origXHRSend.apply(this, args);
        };
      } catch (e) {}

      // 7. Hook fetch to intercept video/stream API responses (like /api/videos/stream)
      const origFetch = window.fetch;
      if (origFetch) {
        window.fetch = function(...args) {
          const promise = origFetch.apply(this, args);
          try {
            const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
            if (reqUrl.includes('/api/videos/stream') || reqUrl.includes('/video/get_media') || reqUrl.includes('.m3u8') || reqUrl.includes('.mpd') || reqUrl.includes('.mp4')) {
              promise.then(res => {
                try {
                  const clone = res.clone();
                  if (reqUrl.includes('/api/videos/stream') || reqUrl.includes('/video/get_media')) {
                    clone.json().then(data => {
                      if (data && typeof data === 'object') {
                        for (const [k, v] of Object.entries(data)) {
                          const streamUrl = Array.isArray(v) ? v[0] : v;
                          if (typeof streamUrl === 'string' && streamUrl.startsWith('http')) {
                            notifyStream(streamUrl, k.includes('m3u8') ? 'HLS STREAM' : 'DIRECT VIDEO', k);
                          }
                        }
                      }
                    }).catch(() => {});
                  } else if (reqUrl.startsWith('http') && !reqUrl.match(/\.(ts|m4s|vtt)(\?|$)/i)) {
                    const isM3u8 = reqUrl.includes('.m3u8');
                    notifyStream(reqUrl, isM3u8 ? 'HLS STREAM' : 'DIRECT VIDEO', '');
                  }
                } catch (e) {}
              }).catch(() => {});
            }
          } catch (e) {}
          return promise;
        };
      }

      // Periodic check
      setInterval(() => {
        checkSpankbang();
        checkPornhub();
        checkXHamster();
        checkVideoElements();
      }, 1500);
      checkSpankbang();
      checkPornhub();
      checkXHamster();
      checkVideoElements();
    })();
  `);

  // Periodic DOM scanner in preload
  setInterval(() => {
    try {
      if (window.location.hostname.includes('youtube.com')) return;
      const videos = document.querySelectorAll('video');
      videos.forEach((video) => {
        let src = video.currentSrc || video.src;
        if (!src) {
          const source = video.querySelector('source');
          if (source) src = source.src;
        }
        if (!src) {
          src = video.getAttribute('data-src') || video.getAttribute('data-mediabook');
        }
        if (src && src.startsWith('http')) {
          reportDetectedStream(src, 'HTML5 VIDEO', document.title, undefined);
        }
      });
    } catch (e) {}
  }, 1500);

  // 10. PASSWORD MANAGER SNIFFER DETECTOR
  let lastUsername = '';
  let lastPassword = '';
  let lastSentTime = 0;
  let lastSentPassword = '';
  let lastSentUsername = '';

  function sendPasswordSubmitted(user, pwd) {
    if (!pwd) return;
    const now = Date.now();
    if (pwd === lastSentPassword && user === lastSentUsername && now - lastSentTime < 3000) {
      return; // Skip duplicate within 3 seconds
    }
    lastSentTime = now;
    lastSentPassword = pwd;
    lastSentUsername = user;

    ipcRenderer.send('password-submitted', {
      url: window.location.href,
      username: user || '',
      password: pwd
    });
  }

  // Monitor input events to catch username/password values as they are typed
  document.addEventListener('input', (e) => {
    try {
      if (!e.target || e.target.tagName !== 'INPUT') return;
      const input = e.target;
      if (input.type === 'password') {
        lastPassword = input.value;
        const form = input.form;
        let usernameInput = null;
        if (form) {
          usernameInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
        }
        if (!usernameInput) {
          const allInputs = Array.from(document.querySelectorAll('input'));
          const passIndex = allInputs.indexOf(input);
          if (passIndex > 0) {
            for (let i = passIndex - 1; i >= 0; i--) {
              const possible = allInputs[i];
              if (possible.type === 'text' || possible.type === 'email' || !possible.type) {
                usernameInput = possible;
                break;
              }
            }
          }
        }
        if (usernameInput) {
          lastUsername = usernameInput.value;
        }
      } else if (input.type === 'text' || input.type === 'email' || !input.type) {
        lastUsername = input.value;
      }
    } catch (err) {}
  }, true);

  // Monitor submit events
  document.addEventListener('submit', (e) => {
    try {
      const form = e.target;
      const passwordInput = form.querySelector('input[type="password"]');
      if (passwordInput && passwordInput.value) {
        const pwd = passwordInput.value;
        let user = '';
        const usernameInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
        if (usernameInput && usernameInput.value) {
          user = usernameInput.value;
        } else {
          user = lastUsername;
        }
        sendPasswordSubmitted(user, pwd);
      }
    } catch (err) {}
  }, true);

  // Monitor click events on any button that acts as submission
  document.addEventListener('click', (e) => {
    try {
      const target = e.target;
      if (!target) return;
      const isButton = target.tagName === 'BUTTON' || target.type === 'submit' || target.getAttribute('role') === 'button' || target.tagName === 'INPUT' && (target.type === 'button' || target.type === 'submit');
      if (isButton) {
        const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
        const filledPasswordInput = passwordInputs.find(i => i.value);
        if (filledPasswordInput) {
          const pwd = filledPasswordInput.value;
          let user = '';
          const form = filledPasswordInput.form;
          let usernameInput = null;
          if (form) {
            usernameInput = form.querySelector('input[type="text"], input[type="email"], input:not([type])');
          }
          if (!usernameInput) {
            const allInputs = Array.from(document.querySelectorAll('input'));
            const passIndex = allInputs.indexOf(filledPasswordInput);
            if (passIndex > 0) {
              for (let i = passIndex - 1; i >= 0; i--) {
                const possible = allInputs[i];
                if (possible.type === 'text' || possible.type === 'email' || !possible.type) {
                  usernameInput = possible;
                  break;
                }
              }
            }
          }
          if (usernameInput && usernameInput.value) {
            user = usernameInput.value;
          } else {
            user = lastUsername;
          }
          sendPasswordSubmitted(user, pwd);
        }
      }
    } catch (err) {}
  }, true);

  // 11. AUTOFILL DETECTOR FOR INPUT FIELDS
  let hasUserInteracted = false;
  document.addEventListener('mousedown', () => { hasUserInteracted = true; }, { capture: true, passive: true });
  document.addEventListener('keydown', () => { hasUserInteracted = true; }, { capture: true, passive: true });

  function handleInputFocusOrClick(e) {
    try {
      // Ignore focusin if the user has not interacted yet (prevents programmatic autofocus on load)
      if (e.type === 'focusin' && !hasUserInteracted) return;

      const input = e.target;
      if (!input || input.tagName !== 'INPUT') {
        ipcRenderer.send('hide-passwords-menu-popup');
        return;
      }
      const type = (input.type || '').toLowerCase();
      if (type === 'password' || type === 'text' || type === 'email' || type === 'tel' || type === 'number' || type === 'search' || !type) {
        
        // Exclude search inputs and fields with query-related keywords
        const excludeTerms = ['search', 'query', 'cari', 'find', 'filter', 'q'];
        const captchaTerms = ['captcha', 'code', 'otp', 'verification', 'verifikasi', 'secode', 'validate', 'vcode', 'pin', 'digit', 'mfa', 'totp', 'token', 'securecode', 'authcode', 'sms', 'sms_code', 'phone_code', 'phonecode', 'kode', 'keamanan', 'validasi', 'capca'];
        
        const hasTermInString = (str, termList) => {
          if (!str) return false;
          const lower = str.toLowerCase();
          return termList.some(term => lower.includes(term));
        };

        const isExcluded = type === 'search' || 
                           hasTermInString(input.name, excludeTerms) || 
                           hasTermInString(input.id, excludeTerms) || 
                           hasTermInString(input.placeholder, excludeTerms) || 
                           hasTermInString(input.className, excludeTerms) ||
                           hasTermInString(input.name, captchaTerms) || 
                           hasTermInString(input.id, captchaTerms) || 
                           hasTermInString(input.placeholder, captchaTerms) || 
                           hasTermInString(input.className, captchaTerms) ||
                           hasTermInString(input.getAttribute('aria-label'), captchaTerms);
                           
        if (isExcluded) {
          ipcRenderer.send('hide-passwords-menu-popup');
          return;
        }

        // Only trigger autofill for possible login fields
        const terms = ['user', 'email', 'login', 'phone', 'account', 'id', 'signin', 'sandi', 'identifier', 'pass', 'key', 'auth'];
        const hasTerm = (str) => {
          if (!str) return false;
          const lower = str.toLowerCase();
          return terms.some(term => lower.includes(term));
        };
        const hasPasswordOnPage = !!document.querySelector('input[type="password"]');
        const isLoginField = type === 'password' || 
                             type === 'email' || 
                             hasPasswordOnPage ||
                             hasTerm(input.name) ||
                             hasTerm(input.id) ||
                             hasTerm(input.placeholder) ||
                             hasTerm(input.autocomplete) ||
                             hasTerm(input.className) ||
                             hasTerm(input.getAttribute('aria-label'));
        
        if (isLoginField) {
          const rect = input.getBoundingClientRect();
          ipcRenderer.send('request-autofill-popup', {
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            url: window.location.href
          });
        } else {
          ipcRenderer.send('hide-passwords-menu-popup');
        }
      } else {
        ipcRenderer.send('hide-passwords-menu-popup');
      }
    } catch (err) {
      console.error('Autofill listener error:', err);
    }
  }

  document.addEventListener('focusin', handleInputFocusOrClick, true);
  document.addEventListener('click', handleInputFocusOrClick, true);
  
  // Hide popup when user clicks elsewhere, scrolls or presses Escape
  window.addEventListener('scroll', () => {
    ipcRenderer.send('hide-passwords-menu-popup');
  }, true);
  
  document.addEventListener('mousedown', (e) => {
    if (e.target && e.target.tagName !== 'INPUT') {
      ipcRenderer.send('hide-passwords-menu-popup');
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ipcRenderer.send('hide-passwords-menu-popup');
    }
  }, true);
});

// Matikan alert/confirm di dalam sniffer agar tidak mengganggu (kecuali di Cloudflare)
if (!window.location.hostname.includes('cloudflare.com') && !window.location.hostname.includes('recu.me')) {
  window.alert = () => {};
  window.confirm = () => true;
  window.prompt = () => null;
}

// --- CROSS-TAB STORAGE & AUTH SYNCHRONIZATION ---
// Memungkinkan tab lain (seperti Hugging Face, dsb.) langsung mendeteksi perubahan login/token/storage
// dari tab lain secara real-time persis seperti Microsoft Edge / Google Chrome
try {
  let isApplyingRemoteStorage = false;

  // Intercept localStorage setItem & removeItem untuk membroadcast perubahan ke tab lain
  if (window.localStorage && typeof window.localStorage.setItem === 'function') {
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    const originalRemoveItem = window.localStorage.removeItem.bind(window.localStorage);
    const originalClear = window.localStorage.clear.bind(window.localStorage);

    window.localStorage.setItem = function(key, value) {
      const oldValue = window.localStorage.getItem(key);
      const strVal = String(value);
      originalSetItem(key, strVal);
      if (!isApplyingRemoteStorage) {
        ipcRenderer.send('sync-cross-tab-storage', {
          origin: window.location.origin,
          action: 'setItem',
          key: String(key),
          newValue: strVal,
          oldValue: oldValue,
          url: window.location.href
        });
      }
    };

    window.localStorage.removeItem = function(key) {
      const oldValue = window.localStorage.getItem(key);
      originalRemoveItem(key);
      if (!isApplyingRemoteStorage) {
        ipcRenderer.send('sync-cross-tab-storage', {
          origin: window.location.origin,
          action: 'removeItem',
          key: String(key),
          newValue: null,
          oldValue: oldValue,
          url: window.location.href
        });
      }
    };

    window.localStorage.clear = function() {
      originalClear();
      if (!isApplyingRemoteStorage) {
        ipcRenderer.send('sync-cross-tab-storage', {
          origin: window.location.origin,
          action: 'clear',
          key: null,
          newValue: null,
          oldValue: null,
          url: window.location.href
        });
      }
    };
  }

  // Tangkap event storage sync dari tab lain dengan origin yang sama
  ipcRenderer.on('apply-cross-tab-storage', (event, data) => {
    try {
      if (!data || data.origin !== window.location.origin) return;
      isApplyingRemoteStorage = true;
      if (data.action === 'setItem' && data.key != null) {
        if (window.localStorage) {
          Storage.prototype.setItem.call(window.localStorage, data.key, data.newValue);
        }
      } else if (data.action === 'removeItem' && data.key != null) {
        if (window.localStorage) {
          Storage.prototype.removeItem.call(window.localStorage, data.key);
        }
      } else if (data.action === 'clear') {
        if (window.localStorage) {
          Storage.prototype.clear.call(window.localStorage);
        }
      }
      isApplyingRemoteStorage = false;

      // Picu StorageEvent standar DOM di tab penerima agar client runtime (React/Vue/Svelte/Auth state) terupdate otomatis
      const storageEvent = new StorageEvent('storage', {
        key: data.key,
        oldValue: data.oldValue,
        newValue: data.newValue,
        url: data.url || window.location.href,
        storageArea: window.localStorage
      });
      window.dispatchEvent(storageEvent);
    } catch (err) {
      isApplyingRemoteStorage = false;
    }
  });

  // Saat tab menjadi aktif kembali, picu event storage dan visibility change agar app SPA menyegarkan session state
  ipcRenderer.on('sniffer-tab-activated', () => {
    try {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      // Kirim custom event atau periksa token login
      window.dispatchEvent(new StorageEvent('storage', {
        key: null,
        oldValue: null,
        newValue: null,
        url: window.location.href,
        storageArea: window.localStorage
      }));
    } catch (e) {}
  });
} catch (e) {}

