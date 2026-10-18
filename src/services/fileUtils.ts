/**
 * Utility functions for date-aware filename generation and automatic numbering.
 */

// Tracks downloaded filenames in the current web session to enable auto-numbering in browser mode
const sessionDownloadedNames = new Set<string>();

/**
 * Get date string in YYYY-MM-DD format based on the PC's actual local clock.
 */
export function getLocalDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Get time string in HH-mm-ss format based on the PC's actual local clock.
 */
export function getLocalTimeString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * Get both local date and time strings.
 */
export function getLocalTimestampStrings(d: Date = new Date()): {
  dateStr: string;
  timeStr: string;
  fullTimestamp: string;
} {
  const dateStr = getLocalDateString(d);
  const timeStr = getLocalTimeString(d);
  return {
    dateStr,
    timeStr,
    fullTimestamp: `${dateStr}_${timeStr}`
  };
}

/**
 * Given a filename (e.g. "image.png") and an existence check function,
 * returns the next available numbered filename (e.g. "image (1).png", "image (2).png").
 */
export function getNextNumberedFileName(
  fileName: string,
  isExisting: (name: string) => boolean
): string {
  if (!isExisting(fileName)) {
    return fileName;
  }

  const lastDot = fileName.lastIndexOf('.');
  const baseName = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  const ext = lastDot > 0 ? fileName.substring(lastDot) : '';

  // Check if baseName already ends with (N), e.g. "image (1)"
  const match = baseName.match(/^(.*?)\s*\((\d+)\)$/);
  let prefix = baseName;
  let counter = 1;

  if (match) {
    prefix = match[1];
    counter = parseInt(match[2], 10) + 1;
  }

  let candidate = `${prefix} (${counter})${ext}`;
  while (isExisting(candidate)) {
    counter++;
    candidate = `${prefix} (${counter})${ext}`;
  }

  return candidate;
}

/**
 * Resolves a file name for browser downloads, ensuring that duplicates
 * within the current session are automatically assigned (1), (2), etc.
 */
export function resolveBrowserDownloadName(suggestedName: string): string {
  const finalName = getNextNumberedFileName(suggestedName, (name) => sessionDownloadedNames.has(name));
  sessionDownloadedNames.add(finalName);
  return finalName;
}

/**
 * Safely extracts the real, absolute local file path from a File object.
 * In Electron environments (v28+), File.path is deprecated or empty for security,
 * so electron.webUtils.getPathForFile(file) MUST be used.
 */
export function getRealFilePath(file: File | any): string {
  if (!file) return '';

  // 1. Check if already has a direct valid path string
  if (typeof file.path === 'string' && file.path.trim().length > 0) {
    return file.path.trim();
  }
  if (typeof file.fullPath === 'string' && file.fullPath.trim().length > 0) {
    return file.fullPath.trim();
  }

  // 2. Electron webUtils.getPathForFile (standard in Electron 28+)
  try {
    if (typeof window !== 'undefined' && typeof (window as any).require === 'function') {
      const electron = (window as any).require('electron');
      if (electron?.webUtils && typeof electron.webUtils.getPathForFile === 'function') {
        const electronPath = electron.webUtils.getPathForFile(file);
        if (electronPath && typeof electronPath === 'string' && electronPath.trim().length > 0) {
          return electronPath.trim();
        }
      }
    }
  } catch {}

  // 3. Check window.electron / window.electronAPI if exposed via preload
  try {
    if (typeof window !== 'undefined') {
      const api = (window as any).electron || (window as any).electronAPI;
      if (api && typeof api.getPathForFile === 'function') {
        const electronPath = api.getPathForFile(file);
        if (electronPath && typeof electronPath === 'string' && electronPath.trim().length > 0) {
          return electronPath.trim();
        }
      }
    }
  } catch {}

  return '';
}
