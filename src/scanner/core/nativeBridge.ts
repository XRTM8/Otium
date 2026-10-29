/**
 * Otium Native Bridge
 * Connects the web frontend to native Android capabilities in MainActivity.kt
 * via JavascriptInterface: FileProvider sharing, MediaStore/Downloads saving,
 * and seamless handoff to Otium Reader (com.otium.reader).
 */

declare global {
  interface Window {
    OtiumNative?: {
      sharePdf?: (base64Data: string, filename: string) => void;
      shareFile?: (base64Data: string, filename: string, mimeType: string) => void;
      savePdfToDownloads?: (base64Data: string, filename: string) => boolean;
      saveFileToDownloads?: (base64Data: string, filename: string, mimeType: string) => boolean;
      openInOtiumReader?: (base64Data: string, filename: string) => void;
      printPdf?: (base64Data: string, filename: string) => void;
      openExternalUrl?: (url: string) => void;
      downloadAndInstallApk?: (apkUrl: string, filename: string) => void;
      fetchUrl?: (url: string) => string;
    };
  }
}

export function isNativeAndroid(): boolean {
  return typeof window !== 'undefined' && Boolean(window.OtiumNative);
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      resolve(res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Share PDF or file using native Android Share Sheet or Web Share API
 */
async function nativeShareFile(
  blob: Blob,
  filename: string,
  title?: string,
  mimeType?: string
): Promise<void> {
  const safeFilename = sanitizeFilename(filename);
  const resolvedMime = mimeType || blob.type || 'application/octet-stream';

  if (window.OtiumNative?.shareFile) {
    try {
      const base64 = await blobToBase64(blob);
      window.OtiumNative.shareFile(base64, safeFilename, resolvedMime);
      return;
    } catch (e) {
      console.warn('Native shareFile failed, falling back:', e);
    }
  }

  if (window.OtiumNative?.sharePdf && safeFilename.endsWith('.pdf')) {
    try {
      const base64 = await blobToBase64(blob);
      window.OtiumNative.sharePdf(base64, safeFilename);
      return;
    } catch (e) {
      console.warn('Native sharePdf failed, falling back:', e);
    }
  }

  // Web Share fallback
  const file = new File([blob], safeFilename, { type: resolvedMime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: title || safeFilename,
        text: `تمت المشاركة من Otium`,
      });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.warn('Web Share failed, downloading instead:', e);
    }
  }

  // Fallback download
  downloadBlob(blob, safeFilename);
}

export async function nativeSharePdf(blob: Blob, filename: string, title?: string): Promise<void> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  return nativeShareFile(blob, cleanFilename, title, 'application/pdf');
}

export async function nativeShareImage(blob: Blob, filename: string, title?: string): Promise<void> {
  return nativeShareFile(blob, filename, title, 'image/jpeg');
}

/**
 * Save file directly to Android Downloads or Pictures directory with system toast
 */
async function nativeSaveFile(
  blob: Blob,
  filename: string,
  mimeType?: string
): Promise<boolean> {
  const safeFilename = sanitizeFilename(filename);
  const resolvedMime = mimeType || blob.type || 'application/octet-stream';

  if (window.OtiumNative?.saveFileToDownloads) {
    try {
      const base64 = await blobToBase64(blob);
      return window.OtiumNative.saveFileToDownloads(base64, safeFilename, resolvedMime);
    } catch (e) {
      console.warn('Native saveFileToDownloads failed, falling back:', e);
    }
  }

  if (window.OtiumNative?.savePdfToDownloads && safeFilename.endsWith('.pdf')) {
    try {
      const base64 = await blobToBase64(blob);
      return window.OtiumNative.savePdfToDownloads(base64, safeFilename);
    } catch (e) {
      console.warn('Native savePdfToDownloads failed, falling back:', e);
    }
  }

  // Web download fallback
  downloadBlob(blob, safeFilename);
  return true;
}

export async function nativeSavePdf(blob: Blob, filename: string): Promise<boolean> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  return nativeSaveFile(blob, cleanFilename, 'application/pdf');
}

export async function nativeSaveImage(blob: Blob, filename: string): Promise<boolean> {
  return nativeSaveFile(blob, filename, 'image/jpeg');
}

/**
 * Open PDF directly in Otium Reader (com.otium.reader) or system PDF viewer
 */
export async function nativeOpenInOtium(blob: Blob, filename: string): Promise<void> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (window.OtiumNative?.openInOtiumReader) {
    try {
      const base64 = await blobToBase64(blob);
      window.OtiumNative.openInOtiumReader(base64, cleanFilename);
      return;
    } catch (e) {
      console.warn('Native open in Otium Reader failed:', e);
    }
  }

  // Fallback to sharing
  await nativeSharePdf(blob, cleanFilename, 'فتح بواسطة');
}

/**
 * Direct print PDF document via system PrintManager/printer chooser or browser window.print()
 */
export async function nativePrintPdf(blob: Blob, filename: string): Promise<void> {
  const cleanFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (window.OtiumNative?.printPdf) {
    try {
      const base64 = await blobToBase64(blob);
      window.OtiumNative.printPdf(base64, cleanFilename);
      return;
    } catch (e) {
      console.warn('Native printPdf failed, falling back:', e);
    }
  }

  // Web fallback: open blob in hidden iframe and trigger print
  try {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }, 300);
    };
    setTimeout(() => {
      document.body.removeChild(iframe);
      URL.revokeObjectURL(url);
    }, 60000);
  } catch (e) {
    console.warn('Web print fallback failed:', e);
  }
}

/**
 * Sanitizes a filename to prevent path traversal (../), null byte injection,
 * and invalid filesystem control characters across Windows, Android, and Linux.
 */
export function sanitizeFilename(filename: string, defaultName = 'document'): string {
  if (!filename || typeof filename !== 'string') return defaultName;
  const clean = filename
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[/\\]+/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[?%*:|"<>]/g, '_')
    .trim();
  const stripped = clean.replace(/^[._ -]+/, '');
  return stripped.length > 0 ? stripped.slice(0, 255) : defaultName;
}

/**
 * Validates that an external URL is strictly HTTP or HTTPS and contains no
 * dangerous schemes, embedded credentials, or malicious protocols.
 */
export function isSafeUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  try {
    const base = typeof window !== 'undefined' && window?.location?.href ? window.location.href : 'http://localhost';
    const parsed = new URL(trimmed, base);

    // Strict protocol check: only http: and https:
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }

    // Must have a valid non-empty hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }

    // Disallow embedded user credentials (e.g. https://user:pass@evil.com)
    if (parsed.username || parsed.password) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Downloads and installs APK directly via native Android DownloadManager & PackageInstaller
 */
export function nativeInstallApk(apkUrl: string, filename: string): void {
  if (!isSafeUrl(apkUrl)) {
    console.warn('Blocked unsafe APK URL:', apkUrl);
    return;
  }
  const safeFilename = sanitizeFilename(filename, 'update.apk');
  if (typeof window !== 'undefined' && window.OtiumNative && (window.OtiumNative as any).downloadAndInstallApk) {
    try {
      (window.OtiumNative as any).downloadAndInstallApk(apkUrl, safeFilename);
      return;
    } catch (e) {
      console.warn('Native downloadAndInstallApk failed, falling back to browser:', e);
    }
  }
  nativeOpenUrl(apkUrl);
}

/**
 * Opens an external URL or APK download in the system browser or package installer
 */
export function nativeOpenUrl(url: string): void {
  if (!isSafeUrl(url)) {
    console.warn('Blocked unsafe URL navigation:', url);
    return;
  }

  if (typeof window !== 'undefined' && window.OtiumNative && (window.OtiumNative as any).openExternalUrl) {
    try {
      (window.OtiumNative as any).openExternalUrl(url);
      return;
    } catch (e) {
      console.warn('Native openExternalUrl failed:', e);
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Native HTTP GET to bypass webview CSP and CORS limitations
 */
export async function nativeFetchUrl(url: string): Promise<string | null> {
  if (typeof window !== 'undefined' && window.OtiumNative?.fetchUrl) {
    try {
      const res = window.OtiumNative.fetchUrl(url);
      if (res && !res.startsWith('ERROR:')) {
        return res;
      }
      if (res && res.startsWith('ERROR:')) {
        console.warn('Native fetchUrl returned error:', res);
      }
    } catch (e) {
      console.warn('Native fetchUrl execution failed:', e);
    }
  }
  return null;
}

/**
 * Standard browser blob download helper
 */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
