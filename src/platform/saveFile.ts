import { getPlatformId, isTauriRuntime } from './runtime';

export type SaveTextOutcome = 'native-picker' | 'download' | 'unavailable';

interface NativeFileBridge {
  saveTextFile?: (content: string, fileName: string, mimeType: string) => boolean;
}

/**
 * Saves a text file through the Android Storage Access Framework when native,
 * and through a normal browser download everywhere else. The native path opens
 * the system picker so the reader decides the destination folder.
 */
export async function saveTextFile(
  fileName: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
): Promise<SaveTextOutcome> {
  if (typeof window === 'undefined') return 'unavailable';

  if (isTauriRuntime() && getPlatformId() === 'android') {
    const bridge = (window as Window & { OtiumFile?: NativeFileBridge }).OtiumFile;
    if (bridge?.saveTextFile) {
      try {
        const opened = bridge.saveTextFile(content, fileName, mimeType);
        if (opened !== false) return 'native-picker';
      } catch {
        // Fall through to the download path if the picker cannot open.
      }
    }
  }

  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'download';
  } catch {
    return 'unavailable';
  }
}
