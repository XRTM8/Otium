export type Language = 'ar' | 'en';

export interface Translations {
  themeLabel: string;
  languageLabel: string;
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
  openDocumentSuccess: (num: number) => string;
  openDocumentError: string;
  searchPlaceholder: string;
  shortcutsTitle: string;
  closeDoc: string;
  tableOfContents: string;
  searchTooltip: string;
  prevPage: string;
  nextPage: string;
  zoomIn: string;
  zoomOut: string;
  zoomLevel: string;
  focusRulerOn: string;
  focusRulerOff: string;
  ambientSound: string;
  ambientOnToast: string;
  ambientOffToast: string;
  continuousMode: string;
  singleMode: string;
  fullscreen: string;
  shortcutsTooltip: string;
  pagesTab: string;
  outlineTab: string;
  moreTools: string;
  readingThemesTitle: string;
}

export const translations: Record<Language, Translations> = {
  ar: {
    themeLabel: 'بيئة القراءة',
    languageLabel: 'اللغة',
    themes: {
      paper: 'Paper (ورقي دافئ)',
      midnight: 'Midnight (ليلي عميق)',
      eink: 'E-Ink (حبر إلكتروني)',
      amber: 'Amber (كهرماني هادئ)',
      pure: 'Pure (أبيض استوديو)',
      amoled: 'AMOLED (أسود مطلق)',
      parchment: 'Parchment (ورق تاريخي)'
    },
    dropzoneTitle: 'اسحب وأفلت ملف PDF هنا',
    dropzoneSubtitle: 'أو انقر للاستعراض من جهازك',
    openSample: 'فتح الوثيقة النموذجية للمعاينة',
    savedDocs: 'الملفات المحفوظة',
    clearAll: 'مسح الكل',
    deleteTooltip: 'حذف من السجل',
    pageOf: (current, total) => `صفحة ${current} / ${total}`,
    todayAt: (time) => `اليوم، ${time}`,
    yesterdayAt: (time) => `أمس، ${time}`,
    openDocumentSuccess: (num) => `تم فتح الوثيقة (${num} صفحة)`,
    openDocumentError: 'تعذر فتح ملف الـ PDF. يرجى التأكد من سلامة الملف.',
    searchPlaceholder: 'بحث في الوثيقة...',
    shortcutsTitle: 'اختصارات لوحة المفاتيح',
    closeDoc: 'إغلاق الوثيقة (Esc)',
    tableOfContents: 'الفهرس ومصغرات الصفحات (S)',
    searchTooltip: 'بحث في الوثيقة (Ctrl + F)',
    prevPage: 'الصفحة السابقة (K / ↑)',
    nextPage: 'الصفحة التالية (J / ↓)',
    zoomIn: 'تكبير (+)',
    zoomOut: 'تصغير (-)',
    zoomLevel: 'نسبة التكبير',
    focusRulerOn: 'تفعيل مسطرة التركيز (R)',
    focusRulerOff: 'إلغاء مسطرة التركيز (R)',
    ambientSound: 'صوت مطر هادئ',
    ambientOnToast: 'تم تشغيل صوت المطر الهادئ',
    ambientOffToast: 'تم إيقاف الصوت',
    continuousMode: 'التبديل للتمرير المستمر',
    singleMode: 'التبديل لنمط الصفحة الواحدة',
    fullscreen: 'ملء الشاشة (F)',
    shortcutsTooltip: 'اختصارات لوحة المفاتيح (?)',
    pagesTab: 'الصفحات',
    outlineTab: 'الفهرس',
    moreTools: 'المزيد من الأدوات',
    readingThemesTitle: 'بيئات القراءة (Themes)'
  },
  en: {
    themeLabel: 'Reading Theme',
    languageLabel: 'Language',
    themes: {
      paper: 'Paper (Warm Ivory)',
      midnight: 'Midnight (OLED Dark)',
      eink: 'E-Ink (Monochrome)',
      amber: 'Amber (Low Blue Light)',
      pure: 'Pure (Studio Titanium)',
      amoled: 'AMOLED (Pitch Black)',
      parchment: 'Parchment (Historic Codex)'
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
    openDocumentSuccess: (num) => `Document opened (${num} pages)`,
    openDocumentError: 'Unable to open PDF. Please ensure the file is valid.',
    searchPlaceholder: 'Search in document...',
    shortcutsTitle: 'Keyboard Shortcuts',
    closeDoc: 'Close Document (Esc)',
    tableOfContents: 'Table of Contents & Thumbnails (S)',
    searchTooltip: 'Search in Document (Ctrl + F)',
    prevPage: 'Previous Page (K / ↑)',
    nextPage: 'Next Page (J / ↓)',
    zoomIn: 'Zoom In (+)',
    zoomOut: 'Zoom Out (-)',
    zoomLevel: 'Zoom Level',
    focusRulerOn: 'Enable Focus Ruler (R)',
    focusRulerOff: 'Disable Focus Ruler (R)',
    ambientSound: 'Ambient Rain Sound',
    ambientOnToast: 'Ambient rain enabled',
    ambientOffToast: 'Ambient sound stopped',
    continuousMode: 'Switch to Continuous Scroll',
    singleMode: 'Switch to Single Page',
    fullscreen: 'Fullscreen (F)',
    shortcutsTooltip: 'Keyboard Shortcuts (?)',
    pagesTab: 'Pages',
    outlineTab: 'Outline',
    moreTools: 'More Tools',
    readingThemesTitle: 'Reading Themes'
  }
};
