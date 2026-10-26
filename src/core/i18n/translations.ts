export type Language = 'ar' | 'en';

export interface Translations {
  themeLabel: string;
  themes: {
    paper: string;
    midnight: string;
    eink: string;
    amber: string;
    pure: string;
    amoled: string;
    parchment: string;
  };
  dropzoneTitle: string;
  dropzoneSubtitle: string;
  openSample: string;
  savedDocs: string;
  clearAll: string;
  deleteTooltip: string;
  pageOf: (current: number, total: number) => string;
  todayAt: (time: string) => string;
  yesterdayAt: (time: string) => string;
  searchPlaceholder: string;
  closeDoc: string;
  searchTooltip: string;
  prevPage: string;
  nextPage: string;
  zoomIn: string;
  zoomOut: string;
  zoomLevel: string;
  continuousMode: string;
  singleMode: string;
  dualMode: string;
  fullscreen: string;
  pagesTab: string;
  outlineTab: string;
  addBookmark: string;
  removeBookmark: string;
  passwordRequired: string;
  enterPasswordPrompt: string;
  passwordIncorrect: string;
  unlockButton: string;
  moreTools: string;
  readingThemesTitle: string;
  settingsTitle: string;
  typographyTitle: string;
  fontsTitle: string;
  defaultReadingMode: string;
  resetDefaults: string;
}

const translations: Record<Language, Translations> = {
  ar: {
    themeLabel: 'بيئة القراءة',
    themes: {
      paper: 'ورق دافئ',
      midnight: 'ليلي عميق',
      eink: 'حبر إلكتروني',
      amber: 'كهرماني هادئ',
      pure: 'أبيض استوديو',
      amoled: 'أسود مطلق',
      parchment: 'ورق قديم'
    },
    dropzoneTitle: 'اسحب وأفلت ملف PDF هنا',
    dropzoneSubtitle: 'أو انقر للاستعراض من جهازك',
    openSample: 'المستند النموذجي',
    savedDocs: 'الملفات المحفوظة',
    clearAll: 'مسح الكل',
    deleteTooltip: 'حذف من السجل',
    pageOf: (current, total) => `صفحة ${current} من ${total}`,
    todayAt: (time) => `اليوم، ${time}`,
    yesterdayAt: (time) => `أمس، ${time}`,
    searchPlaceholder: 'بحث في الوثيقة...',
    closeDoc: 'إغلاق الوثيقة (Esc)',
    searchTooltip: 'بحث في الوثيقة (Ctrl + F)',
    prevPage: 'الصفحة السابقة (K / ↑)',
    nextPage: 'الصفحة التالية (J / ↓)',
    zoomIn: 'تكبير (+)',
    zoomOut: 'تصغير (-)',
    zoomLevel: 'نسبة التكبير',
    continuousMode: 'التبديل للتمرير المستمر',
    singleMode: 'التبديل لنمط الصفحة الواحدة',
    dualMode: 'التبديل لعرض صفحتين متجاورة (كتاب مفتوح)',
    fullscreen: 'ملء الشاشة (F)',
    pagesTab: 'الصفحات',
    outlineTab: 'الفهرس',
    addBookmark: 'إضافة إشارة مرجعية (B)',
    removeBookmark: 'إزالة الإشارة المرجعية',
    passwordRequired: 'هذا الملف محمي بكلمة مرور',
    enterPasswordPrompt: 'يرجى إدخال كلمة المرور لفتح وتصفح الوثيقة',
    passwordIncorrect: 'كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى',
    unlockButton: 'فتح الوثيقة',
    moreTools: 'المزيد من الأدوات',
    readingThemesTitle: 'بيئات القراءة',
    settingsTitle: 'إعدادات القارئ',
    typographyTitle: 'الخط والطباعة',
    fontsTitle: 'مكتبة الخطوط المدعومة',
    defaultReadingMode: 'نمط القراءة الافتراضي',
    resetDefaults: 'استعادة الإعدادات الافتراضية'
  },
  en: {
    themeLabel: 'Reading Theme',
    themes: {
      paper: 'Paper',
      midnight: 'Midnight',
      eink: 'E-Ink',
      amber: 'Amber',
      pure: 'Pure',
      amoled: 'AMOLED',
      parchment: 'Parchment'
    },
    dropzoneTitle: 'Drag & drop a PDF file here',
    dropzoneSubtitle: 'or click to browse from your device',
    openSample: 'Open Sample Document',
    savedDocs: 'Saved Documents',
    clearAll: 'Clear All',
    deleteTooltip: 'Remove from history',
    pageOf: (current, total) => `Page ${current} of ${total}`,
    todayAt: (time) => `Today, ${time}`,
    yesterdayAt: (time) => `Yesterday, ${time}`,
    searchPlaceholder: 'Search in document...',
    closeDoc: 'Close Document (Esc)',
    searchTooltip: 'Search in Document (Ctrl + F)',
    prevPage: 'Previous Page (K / ↑)',
    nextPage: 'Next Page (J / ↓)',
    zoomIn: 'Zoom In (+)',
    zoomOut: 'Zoom Out (-)',
    zoomLevel: 'Zoom Level',
    continuousMode: 'Switch to Continuous Scroll',
    singleMode: 'Switch to Single Page',
    dualMode: 'Switch to Two-Page Book Spread',
    fullscreen: 'Fullscreen (F)',
    pagesTab: 'Pages',
    outlineTab: 'Outline',
    addBookmark: 'Add Bookmark (B)',
    removeBookmark: 'Remove Bookmark',
    passwordRequired: 'Protected PDF Document',
    enterPasswordPrompt: 'Please enter the password to unlock this document',
    passwordIncorrect: 'Incorrect password, please try again',
    unlockButton: 'Unlock Document',
    moreTools: 'More Tools',
    readingThemesTitle: 'Reading Themes',
    settingsTitle: 'Reader Settings',
    typographyTitle: 'Typography & Fonts',
    fontsTitle: 'Supported Fonts Library',
    defaultReadingMode: 'Default Reading Mode',
    resetDefaults: 'Reset to Defaults'
  }
};

export const getTranslations = (lang?: string | null): Translations => {
  if (lang === 'en') return translations.en;
  return translations.ar;
};
