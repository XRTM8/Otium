import type { TextAnnotation, ThemeMode } from '../core/types';
import { normalizeAnnotationRects } from '../core/annotations/geometry';
import { getCanvasPixelRatio } from '../core/reader/device';

export const PAGE_BACKGROUND: Record<ThemeMode, string> = {
  amoled: '#000000',
  midnight: '#06090f',
  amber: '#18130e',
  parchment: '#fbf6ea',
  eink: '#eaeaea',
  pure: '#ffffff',
  paper: '#f7f4ee',
  sakura: '#fdf6f7',
  forest: '#0c1813',
  nordic: '#15181e'
};

const THEME_FILTERS: Partial<Record<ThemeMode, string>> = {
  // Cap the brightest ink in dark themes and preserve grayscale detail.
  amoled: 'invert(1) hue-rotate(180deg) brightness(0.82)',
  amber: 'invert(0.93) sepia(0.36) hue-rotate(-12deg) brightness(0.84)',
  paper: 'sepia(0.20) contrast(0.98) brightness(0.98)',
  eink: 'grayscale(1) brightness(0.93)',
  midnight: 'invert(0.93) hue-rotate(185deg) brightness(0.86)',
  forest: 'invert(0.93) sepia(0.28) hue-rotate(90deg) brightness(0.86)',
  nordic: 'invert(0.91) hue-rotate(175deg) brightness(0.86)'
};

export function themeFilter(theme: ThemeMode): string | null {
  return THEME_FILTERS[theme] ?? null;
}

/**
 * A full-page CSS filter is repainted on every scroll frame in Android's WebView.
 * Applying the same filter once while copying the finished raster into the visible
 * canvas yields identical colours without per-frame repaint cost.
 */
let canvasFilterSupport: boolean | null = null;

export function supportsCanvasFilter(): boolean {
  if (canvasFilterSupport !== null) return canvasFilterSupport;

  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const context = probe.getContext('2d');
    if (!context) {
      canvasFilterSupport = false;
      return false;
    }
    context.filter = 'invert(1)';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    const firstChannel = context.getImageData(0, 0, 1, 1).data[0] ?? 255;
    canvasFilterSupport = firstChannel < 64;
  } catch {
    canvasFilterSupport = false;
  }

  return canvasFilterSupport;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '').trim();
  const full = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value;
  if (/^[0-9a-f]{6}$/i.test(full)) {
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16)
    ];
  }
  return [253, 224, 71];
}

export function drawAnnotationLayer(
  canvas: HTMLCanvasElement,
  annotations: TextAnnotation[],
  width: number,
  height: number,
  dark: boolean
): void {
  const ratio = Math.min(
    getCanvasPixelRatio(),
    Math.sqrt(3_600_000 / Math.max(1, width * height))
  );
  const backingWidth = Math.max(1, Math.round(width * ratio));
  const backingHeight = Math.max(1, Math.round(height * ratio));

  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  for (const annotation of annotations) {
    const [red, green, blue] = hexToRgb(annotation.color);
    const rects = normalizeAnnotationRects(annotation.rects);

    if (annotation.type === 'underline') {
      context.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.92)`;
      context.lineWidth = 2.2;
      context.lineCap = 'round';
      for (const rect of rects) {
        const x = rect.xPct * width;
        const y = (rect.yPct + rect.heightPct) * height - 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + rect.widthPct * width, y);
        context.stroke();
      }
      continue;
    }

    for (const rect of rects) {
      const x = rect.xPct * width;
      const y = rect.yPct * height;
      const rectWidth = rect.widthPct * width;
      const rectHeight = rect.heightPct * height;

      // Clean physical highlighter gradient without blur or muddy halos
      const gradient = context.createLinearGradient(0, y, 0, y + rectHeight);
      gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${dark ? 0.65 : 0.48})`);
      gradient.addColorStop(0.65, `rgba(${red}, ${green}, ${blue}, ${dark ? 0.55 : 0.40})`);
      gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, ${dark ? 0.45 : 0.32})`);
      context.fillStyle = gradient;

      const radius = Math.min(3, rectHeight / 2);
      context.beginPath();
      if (typeof context.roundRect === 'function') {
        context.roundRect(x, y, rectWidth, rectHeight, radius);
      } else {
        context.rect(x, y, rectWidth, rectHeight);
      }
      context.fill();
    }
  }
}
