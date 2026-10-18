/**
 * Centralized media type detection utility.
 * 
 * IMPORTANT: .m3u8 and .m3u playlists are frequently assigned the MIME type 
 * "audio/x-mpegurl" or "audio/mpegurl" by Windows and browsers because M3U was 
 * historically created for MP3 playlists (Winamp). 
 * 
 * In modern media players (like NightHub), .m3u8 is predominantly an HLS video stream.
 * Categorizing it as audio based purely on startsWith('audio/') hides the video screen 
 * (opacity-0) and incorrectly activates the music visualizer.
 */

export function isAudioMedia(file: { name?: string; type?: string; path?: string; url?: string } | null | undefined): boolean {
  if (!file) return false;
  const name = (file.name || file.path || file.url || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  // 1. Never treat m3u8, m3u playlists or transport streams (.ts) as audio
  if (name.includes('.m3u8') || name.includes('.m3u') || name.endsWith('.ts')) {
    return false;
  }
  if (type.includes('mpegurl') || type.includes('vnd.apple.mpegurl')) {
    return false;
  }

  // 2. Video file extensions must NEVER be considered audio
  if (name.match(/\.(mp4|mkv|webm|avi|mov|wmv|flv|m4v|3gp|vob|ogv)(\?|$)/i)) {
    return false;
  }

  // 3. Explicit audio file extensions
  if (name.match(/\.(mp3|wav|flac|ogg|m4a|aac|wma|opus|oga|mid|midi|alac|aiff)(\?|$)/i)) {
    return true;
  }

  // 4. Video MIME types
  if (type.startsWith('video/')) {
    return false;
  }

  // 5. Pure audio MIME type (now safely excluding mpegurl)
  return type.startsWith('audio/');
}

/**
 * Normalizes file path to handle Windows backslashes and case-insensitivity on Windows.
 */
function normalizePath(p?: string): string {
  if (!p) return '';
  return p.replace(/\\/g, '/').toLowerCase();
}

/**
 * Strict media comparison function to prevent falsely matching different files
 * that happen to share the same filename in different directories.
 */
export function isSameMediaFile(a: any, b: any): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const pathA = (a as any).path || (a as any).fullPath;
  const pathB = (b as any).path || (b as any).fullPath;

  // 1. If BOTH files have a file system path, the normalized path is the absolute authority
  if (pathA && pathB) {
    return normalizePath(pathA) === normalizePath(pathB);
  }

  // 2. If BOTH have paths and they do not match, they are NEVER the same file
  if (pathA && pathB && normalizePath(pathA) !== normalizePath(pathB)) {
    return false;
  }

  // 3. For streams or network URLs
  if ((a as any).isStream || (b as any).isStream) {
    const urlA = (a as any).url || (a as any).path;
    const urlB = (b as any).url || (b as any).path;
    return Boolean(urlA && urlB && urlA === urlB);
  }

  // 4. If neither has a path (e.g. pure web browser File/Blob objects):
  // They must match name AND exact non-zero size
  if (a.name === b.name) {
    // If one has a path and the other does not, do NOT assume same file unless names match and neither has differing paths
    if (a.size !== undefined && b.size !== undefined && a.size > 0 && b.size > 0) {
      if (a.size !== b.size) return false;
      if (a.lastModified && b.lastModified) {
        return a.lastModified === b.lastModified;
      }
      return true;
    }
    return !pathA && !pathB;
  }

  return false;
}

/**
 * Computes a unique, distinct key for indexing files in IndexedDB (markers, loops, progress, thumbnails).
 */
export function getMediaFileKey(file: any): string {
  if (!file) return '';
  return (file as any).path || (file as any).fullPath || (file.name + (file.size || 0));
}
