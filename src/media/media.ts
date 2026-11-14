export type FileKind = 'video' | 'audio' | 'image' | 'pdf' | 'text' | 'presentation' | 'office' | 'unsupported';
const formats: Record<string, [FileKind, string]> = {
  mp4: ['video', 'video/mp4'], m4v: ['video', 'video/mp4'], webm: ['video', 'video/webm'],
  mov: ['video', 'video/quicktime'], mkv: ['video', 'video/x-matroska'], ogv: ['video', 'video/ogg'],
  mp3: ['audio', 'audio/mpeg'], wav: ['audio', 'audio/wav'], m4a: ['audio', 'audio/mp4'],
  ogg: ['audio', 'audio/ogg'], opus: ['audio', 'audio/ogg; codecs=opus'], flac: ['audio', 'audio/flac'],
  png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'],
  webp: ['image', 'image/webp'], gif: ['image', 'image/gif'], avif: ['image', 'image/avif'],
  pdf: ['pdf', 'application/pdf'], txt: ['text', 'text/plain'], md: ['text', 'text/plain'],
  pptx: ['presentation', ''], ppsx: ['presentation', ''],
  doc: ['office', ''], docx: ['office', ''], xls: ['office', ''], xlsx: ['office', ''],
};

export function describeFile(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const [kind, mime] = formats[ext] ?? ['unsupported', ''];
  return { kind, mime, ext };
}

export const BEAM_MEDIA_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.avif,.mp4,.m4v,.webm,.mov,.mkv,.ogv,.pptx,.ppsx';

export function isBeamMediaFile(name: string): boolean {
  const { kind } = describeFile(name);
  return name.length <= 255 && !name.includes('/') && !name.includes('\\') &&
    !Array.from(name).some(character => character.charCodeAt(0) < 32) &&
    (kind === 'image' || kind === 'presentation' || kind === 'video');
}

export function validateFile(file: Pick<File, 'name' | 'size'>): string | null {
  const { kind } = describeFile(file.name);
  if (!file.size) return 'الملف فارغ.';
  if (/\.(ppt|pps)$/i.test(file.name)) return 'صيغة PPT القديمة غير مدعومة حالياً. استخدم PPTX أو PDF.';
  if (kind === 'unsupported') return 'هذه الصيغة غير مدعومة في التجربة. ملفات HTML وSVG والبرامج لا تُشغّل هنا.';
  const limit = kind === 'text' ? 2 * 1024 ** 2 : kind === 'presentation' ? 40 * 1024 ** 2 : kind === 'pdf' || kind === 'image' ? 80 * 1024 ** 2 : 2 * 1024 ** 3;
  return file.size > limit ? 'الملف أكبر من حد التجربة: 2 MB للنص، 40 MB لـPPTX، 80 MB للصور وPDF، و2 GB للوسائط.' : null;
}

export function fitSize(space: { width: number; height: number }, content: { width: number; height: number }) {
  const scale = Math.max(0, Math.min(space.width / Math.max(1, content.width), space.height / Math.max(1, content.height)));
  return { width: content.width * scale, height: content.height * scale };
}

export function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;
}

export function mediaErrorMessage(code?: number) {
  if (code === 3 || code === 4) return 'تعذّر فك ترميز هذا الملف. امتداد MP4 وحده لا يضمن التوافق؛ جرّب MP4 بترميز H.264 وصوت AAC أو WebM.';
  if (code === 1) return 'توقف تحميل الوسائط. أعد فتح الملف للمحاولة.';
  return 'تعذّر تشغيل الوسائط. تأكد من سلامة الملف ودعم المتصفح لترميزه.';
}

// A new source invalidates pending local file reads.
export class SourceLease {
  private generation = 0;
  private url?: string;
  private urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  constructor(urls: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> = URL) { this.urls = urls; }
  replace() {
    this.generation++;
    if (this.url) this.urls.revokeObjectURL(this.url);
    this.url = undefined;
    return this.generation;
  }
  current(ticket: number) { return ticket === this.generation; }
  file(ticket: number, blob: Blob) {
    if (!this.current(ticket)) return null;
    this.url = this.urls.createObjectURL(blob);
    return this.url;
  }
}
