
export interface VideoMarker {
  id: string;
  time: number;
  label: string;
}

export interface SavedLoop {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface SavedCollection {
  id: string;
  name: string;
  files: { name: string; path?: string; size: number }[];
  createdAt: number;
}

export interface Bookmark {
  id: string;
  title: string;
  url?: string;
  type?: 'link' | 'folder';
  parentId?: string | null;
  createdAt: number;
  order?: number;
  folderOrder?: number;
  favicon?: string | null;
}

export interface WebHistoryItem {
  id: string;
  url: string;
  title: string;
  favicon?: string | null;
  timestamp: number;
}

export interface VideoMetadata {
  id: string;
  title?: string;
  poster?: string | null;
}

export interface SavedCredential {
  id: string;
  url: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
}

export interface VideoHistoryItem {
  id: string;
  url: string;
  type: string;
  title?: string;
  pageUrl: string;
  timestamp: number;
}

export interface AppearanceSettings {
  blur: number;
  transparency: number;
  displayMode?: 'default' | 'compact';
  themeMode?: 'dark' | 'light' | 'auto';
}

export interface VideoSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  hue?: number;
  grayscale?: number;
  sepia?: number;
  invert?: number;
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  zoom?: number;
  panX?: number;
  panY?: number;
}

export interface PreferenceSettings {
  saveResume: boolean;
  saveMarkers: boolean;
  saveLoops: boolean;
  language?: 'en' | 'id';
  alwaysAutoResume?: boolean;
  showResumeConfirmation?: boolean;
  hardwareAcceleration?: boolean;
  playDownloadSound?: boolean;
  showLoopsOnHome?: boolean;
  geminiApiKey?: string;
  aiResponseLanguage?: 'id' | 'en' | 'jp' | 'es' | 'auto';
  aiMode?: 'chat' | 'live_call';
  aiChatModel?: string;
  aiLiveModel?: string;
  aiVoice?: string;
  aiTtsModel?: string;
  aiCustomPersona?: string;
  aiLanguageStyle?: string;
  aiStyleInstruction?: string;
  aiPredictiveCaching?: boolean;
  aiPredictiveMs?: number;
  aiPredictiveStepMs?: number;
  aiTemperature?: number;
  aiMediaResolution?: 'low' | 'medium' | 'high';
  aiSafetySettings?: 'block_none' | 'block_few';
  aiThinkingLevel?: 'off' | 'low' | 'high';
  aiMaxOutputTokens?: number;
  videoTransition?: 'blur' | 'crossfade' | 'zoom' | 'fade-black' | 'none';
  videoTransitionDuration?: number;
}

export interface MpvInterpolationSettings {
  tscale: 'oversample' | 'mitchell' | 'bicubic' | 'box';
  videoSync: 'display-resample' | 'audio';
  enableSvp: boolean;
  useMvtools?: boolean;
  mvtoolsFps?: 60 | 120 | 144;
  mvtoolsMode?: 'flow' | 'block';
  hwdec: 'auto-safe' | 'auto' | 'nvdec' | 'vaapi' | 'd3d11va' | 'no';
  customPath?: string;
}

export interface PlayerSettings {
  volume: number;
  isMuted: boolean;
  isAudioNormalized: boolean;
  playlistViewMode: 'list' | 'grid';
  isShuffle: boolean;
  repeatMode: 'none' | 'playlist' | 'current';
  isEnhance?: boolean;
  isSuperRes?: boolean;
  isAmbientMode?: boolean;
  isFrameInterpolation?: boolean;
  interpolationEngine?: 'canvas_light' | 'libmpv';
  interpolationMode?: 'optical_flow' | 'temporal_blend';
  mpvSettings?: MpvInterpolationSettings;
  subSettings: {
    size: number;
    color: string;
    bg: string;
    offset?: number;
    bgType?: 'box' | 'line';
    lineHeight?: number;
    fontFamily?: string;
    bgOpacity?: number;
  };
  appearanceSettings?: AppearanceSettings;
  videoSettings?: VideoSettings;
  preferenceSettings?: PreferenceSettings;
  playbackRate: number;
  audioBoost?: number;
  eqGains?: number[];
  audioDelay?: number;
  isSwapChannels?: boolean;
  normalizeThreshold?: number;
  normalizeGain?: number;
}

const DB_NAME = 'NightHUB_DB';
const DB_VERSION = 6;

export class DatabaseService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
        if (!db.objectStoreNames.contains('markers')) {
          db.createObjectStore('markers');
        }
        if (!db.objectStoreNames.contains('loops')) {
          db.createObjectStore('loops');
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress');
        }
        if (!db.objectStoreNames.contains('collections')) {
          db.createObjectStore('collections', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('thumbnails')) {
          db.createObjectStore('thumbnails');
        }
        if (!db.objectStoreNames.contains('webHistory')) {
          db.createObjectStore('webHistory', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('videoHistory')) {
          db.createObjectStore('videoHistory', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('passwords')) {
          db.createObjectStore('passwords', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private async getStore(name: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    if (!this.db) await this.init();
    if (!this.db!.objectStoreNames.contains(name)) {
      throw new Error(`Object store "${name}" not found. Please refresh the app.`);
    }
    const transaction = this.db!.transaction(name, mode);
    return transaction.objectStore(name);
  }

  async getSettings(): Promise<Partial<PlayerSettings>> {
    const store = await this.getStore('settings');
    return new Promise((resolve) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result || {});
    });
  }

  async saveSettings(settings: Partial<PlayerSettings>): Promise<void> {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(settings, 'current');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMarkers(videoId: string): Promise<VideoMarker[]> {
    const store = await this.getStore('markers');
    return new Promise((resolve) => {
      const request = store.get(videoId);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveMarkers(videoId: string, markers: VideoMarker[]): Promise<void> {
    const store = await this.getStore('markers', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(markers, videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getLoops(videoId: string): Promise<SavedLoop[]> {
    const store = await this.getStore('loops');
    return new Promise((resolve) => {
      const request = store.get(videoId);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveLoops(videoId: string, loops: SavedLoop[]): Promise<void> {
    const store = await this.getStore('loops', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(loops, videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProgress(videoId: string): Promise<number | null> {
    const store = await this.getStore('progress');
    return new Promise((resolve) => {
      const request = store.get(videoId);
      request.onsuccess = () => {
        const val = request.result;
        if (val && typeof val === 'object') {
          resolve(val.time || null);
        } else {
          resolve(val || null);
        }
      };
    });
  }

  async saveProgress(videoId: string, time: number, duration?: number): Promise<void> {
    const store = await this.getStore('progress', 'readwrite');
    return new Promise((resolve, reject) => {
      const val = { time, duration, updatedAt: Date.now() };
      const request = store.put(val, videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllProgress(): Promise<{ videoId: string; time: number; duration?: number; updatedAt?: number }[]> {
    const store = await this.getStore('progress');
    return new Promise((resolve) => {
      const request = store.getAll();
      const keysRequest = store.getAllKeys();
      
      request.onsuccess = () => {
        const values = request.result;
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result as string[];
          const result = keys.map((key, index) => {
            const val = values[index];
            if (val && typeof val === 'object') {
              return {
                videoId: key,
                time: val.time,
                duration: val.duration,
                updatedAt: val.updatedAt
              };
            }
            return {
              videoId: key,
              time: val
            };
          });
          resolve(result);
        };
      };
    });
  }

  async deleteProgress(videoId: string): Promise<void> {
    const store = await this.getStore('progress', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllMarkers(): Promise<{ videoId: string; markers: VideoMarker[] }[]> {
    const store = await this.getStore('markers');
    return new Promise((resolve) => {
      const request = store.getAll();
      const keysRequest = store.getAllKeys();
      
      request.onsuccess = () => {
        const values = request.result;
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result as string[];
          const result = keys.map((key, index) => ({
            videoId: key,
            markers: values[index]
          }));
          resolve(result);
        };
      };
    });
  }

  async deleteMarkers(videoId: string): Promise<void> {
    const store = await this.getStore('markers', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllLoops(): Promise<{ videoId: string; loops: SavedLoop[] }[]> {
    const store = await this.getStore('loops');
    return new Promise((resolve) => {
      const request = store.getAll();
      const keysRequest = store.getAllKeys();
      
      request.onsuccess = () => {
        const values = request.result;
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result as string[];
          const result = keys.map((key, index) => ({
            videoId: key,
            loops: values[index]
          }));
          resolve(result);
        };
      };
    });
  }

  async deleteLoops(videoId: string): Promise<void> {
    const store = await this.getStore('loops', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCollections(): Promise<SavedCollection[]> {
    const store = await this.getStore('collections');
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveCollection(collection: SavedCollection): Promise<void> {
    const store = await this.getStore('collections', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(collection);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCollection(id: string): Promise<void> {
    const store = await this.getStore('collections', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBookmarks(): Promise<Bookmark[]> {
    const store = await this.getStore('bookmarks');
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveBookmark(bookmark: Bookmark): Promise<void> {
    const store = await this.getStore('bookmarks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(bookmark);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBookmark(id: string): Promise<void> {
    const store = await this.getStore('bookmarks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearBookmarks(): Promise<void> {
    const store = await this.getStore('bookmarks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getThumbnail(key: string): Promise<string | null> {
    const store = await this.getStore('thumbnails');
    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveThumbnail(key: string, dataUrl: string): Promise<void> {
    const store = await this.getStore('thumbnails', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(dataUrl, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteThumbnail(key: string): Promise<void> {
    const store = await this.getStore('thumbnails', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearThumbnails(): Promise<void> {
    const store = await this.getStore('thumbnails', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getWebHistory(): Promise<WebHistoryItem[]> {
    const store = await this.getStore('webHistory');
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveWebHistory(item: WebHistoryItem): Promise<void> {
    const store = await this.getStore('webHistory', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteWebHistory(id: string): Promise<void> {
    const store = await this.getStore('webHistory', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearWebHistory(): Promise<void> {
    const store = await this.getStore('webHistory', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getVideoHistory(): Promise<VideoHistoryItem[]> {
    const store = await this.getStore('videoHistory');
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveVideoHistory(item: VideoHistoryItem): Promise<void> {
    const store = await this.getStore('videoHistory', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteVideoHistory(id: string): Promise<void> {
    const store = await this.getStore('videoHistory', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearVideoHistory(): Promise<void> {
    const store = await this.getStore('videoHistory', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getActivePlaylist(): Promise<{ files: any[]; currentIndex: number } | null> {
    const store = await this.getStore('settings');
    return new Promise((resolve) => {
      const request = store.get('activePlaylist');
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveActivePlaylist(files: any[], currentIndex: number): Promise<void> {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ files, currentIndex }, 'activePlaylist');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(videoId: string): Promise<VideoMetadata | null> {
    const store = await this.getStore('metadata');
    return new Promise((resolve) => {
      const request = store.get(videoId);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveMetadata(metadata: VideoMetadata): Promise<void> {
    const store = await this.getStore('metadata', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(metadata);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteMetadata(videoId: string): Promise<void> {
    const store = await this.getStore('metadata', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(videoId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCredentials(): Promise<SavedCredential[]> {
    const store = await this.getStore('passwords');
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async saveCredential(credential: SavedCredential): Promise<void> {
    const store = await this.getStore('passwords', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(credential);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCredential(id: string): Promise<void> {
    const store = await this.getStore('passwords', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearCredentials(): Promise<void> {
    const store = await this.getStore('passwords', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllEntriesFromStore(storeName: string): Promise<{ key: any, value: any }[]> {
    const store = await this.getStore(storeName);
    return new Promise((resolve) => {
      const result: { key: any, value: any }[] = [];
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          result.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(result);
        }
      };
    });
  }

  async clearAllStores(): Promise<void> {
    const stores = ['settings', 'markers', 'loops', 'progress', 'collections', 'bookmarks', 'thumbnails', 'webHistory', 'videoHistory', 'metadata', 'passwords'];
    for (const storeName of stores) {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  async importData(data: Record<string, { key: any, value: any }[]>, clearOnlyImported: boolean = true): Promise<void> {
    const inlineKeyStores = ['collections', 'bookmarks', 'webHistory', 'videoHistory', 'metadata', 'passwords'];
    const validStores = ['settings', 'markers', 'loops', 'progress', 'collections', 'bookmarks', 'thumbnails', 'webHistory', 'videoHistory', 'metadata', 'passwords'];
    
    // If selective backup, only clear the stores present in the imported data
    const storesToClear = clearOnlyImported 
      ? Object.keys(data).filter(s => validStores.includes(s) && Array.isArray(data[s]))
      : validStores;

    for (const storeName of storesToClear) {
      const store = await this.getStore(storeName, 'readwrite');
      await new Promise<void>((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    
    for (const [storeName, entries] of Object.entries(data)) {
      if (!validStores.includes(storeName)) continue;
      if (!Array.isArray(entries)) continue;
      
      const isInlineKey = inlineKeyStores.includes(storeName);
      const store = await this.getStore(storeName, 'readwrite');
      
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || !('value' in entry)) continue;
        
        await new Promise<void>((resolve, reject) => {
          let req;
          if (isInlineKey) {
            req = store.put(entry.value);
          } else {
            req = store.put(entry.value, entry.key);
          }
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      }
    }
  }
}

export const dbService = new DatabaseService();
