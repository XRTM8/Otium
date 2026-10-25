import type { FontFamilyId } from '../types';

interface FontDefinition {
  id: FontFamilyId;
  name: string;
  subname: string;
  cssFamily: string;
  badge: string;
  sampleAr: string;
  sampleEn: string;
}

export const FONTS_LIST: FontDefinition[] = [
  {
    id: 'tajawal',
    name: 'تجوال',
    subname: 'Tajawal',
    cssFamily: "'Tajawal', 'Plus Jakarta Sans Variable', sans-serif",
    badge: 'افتراضي متوازن',
    sampleAr: 'أبجد هوز حطي كلمن',
    sampleEn: 'The quiet reading vibe'
  },
  {
    id: 'amiri',
    name: 'أميري',
    subname: 'Amiri',
    cssFamily: "'Amiri', serif",
    badge: 'أدبي كلاسيكي',
    sampleAr: 'القراءة الهادئة تفتح آفاق العقل',
    sampleEn: 'Classic literary serenity'
  },
  {
    id: 'cairo',
    name: 'كايرو',
    subname: 'Cairo',
    cssFamily: "'Cairo Variable', 'Tajawal', sans-serif",
    badge: 'معاصر وجريء',
    sampleAr: 'وضوح فائق وسهولة تصفح',
    sampleEn: 'Bold and clear modern type'
  },
  {
    id: 'almarai',
    name: 'المراعي',
    subname: 'Almarai',
    cssFamily: "'Almarai', sans-serif",
    badge: 'مريح للعين',
    sampleAr: 'انسيابية تدعم القراءة المطولة',
    sampleEn: 'Designed for long reading'
  },
  {
    id: 'ibm',
    name: 'آي بي إم بليكس',
    subname: 'IBM Plex Sans Arabic',
    cssFamily: "'IBM Plex Sans Arabic', sans-serif",
    badge: 'دقة تقنية',
    sampleAr: 'هندسة خطية عالية التوازن',
    sampleEn: 'Engineered legibility'
  },
  {
    id: 'lora',
    name: 'لورا سيريف',
    subname: 'Lora Editorial',
    cssFamily: "'Lora Variable', 'Amiri', serif",
    badge: 'مطبوعات ورقية',
    sampleAr: 'طابع المطابع الكلاسيكية الراقية',
    sampleEn: 'Editorial book typography'
  },
  {
    id: 'jakarta',
    name: 'بلس جاكرتا',
    subname: 'Plus Jakarta Sans',
    cssFamily: "'Plus Jakarta Sans Variable', 'Tajawal', sans-serif",
    badge: 'واجهات رقمية',
    sampleAr: 'تصميم عالمي حديث',
    sampleEn: 'Geometric & tech minimal'
  },
  {
    id: 'system',
    name: 'خط النظام',
    subname: 'Native System',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    badge: 'أعلى سرعة',
    sampleAr: 'الخط الافتراضي لجهازك',
    sampleEn: 'Instant zero-lag native'
  }
];

const FONT_STORAGE_KEY = 'otium_font_family';

export function getSavedFont(): FontFamilyId {
  if (typeof window === 'undefined') return 'tajawal';
  const saved = localStorage.getItem(FONT_STORAGE_KEY) as FontFamilyId;
  if (saved && FONTS_LIST.some((f) => f.id === saved)) {
    return saved;
  }
  return 'tajawal';
}

export function saveFont(fontId: FontFamilyId): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FONT_STORAGE_KEY, fontId);
  applyFontFamily(fontId);
}

export function applyFontFamily(fontId: FontFamilyId): void {
  if (typeof document === 'undefined') return;
  const fontDef = FONTS_LIST.find((f) => f.id === fontId) || FONTS_LIST[0];
  const root = document.documentElement;

  // Both variables live on the document root so every surface (reader,
  // toolbars, drawers, dialogs, portals) repaints immediately. `--font-sans`
  // is mapped to `--font-ui` in index.css so Tailwind's `font-sans` utility
  // follows the choice instead of pinning its own stack.
  root.style.setProperty('--font-ui', fontDef.cssFamily);
  root.style.setProperty('--font-reader', fontDef.cssFamily);
  root.style.setProperty('--app-font-family', fontDef.cssFamily);
  root.style.setProperty('--reader-font-family', fontDef.cssFamily);
  root.dataset.font = fontId;
}
