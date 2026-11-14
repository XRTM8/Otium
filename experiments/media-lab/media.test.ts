import { describe, expect, it, vi } from 'vitest';
import { describeFile, validateFile, fitSize, formatTime, SourceLease, mediaErrorMessage } from '../../src/media/media';

describe('media file policy', () => {
  it('accepts known extensions with empty browser MIME but never trusts HTML/SVG', () => {
    expect(describeFile('lesson.MP4')).toMatchObject({ kind: 'video', mime: 'video/mp4' });
    for (const name of ['lesson.html', 'lesson.svg', 'lesson.mp4.exe', 'lesson.pptm', 'lesson']) {
      expect(validateFile({ name, size: 10 })).toBeTruthy();
    }
  });
  it('uses bounded reads for text and PDF and rejects empty files', () => {
    expect(validateFile({ name: 'notes.txt', size: 3 * 1024 ** 2 })).toBeTruthy();
    expect(validateFile({ name: 'notes.pdf', size: 81 * 1024 ** 2 })).toBeTruthy();
    expect(validateFile({ name: 'lesson.mp4', size: 3 * 1024 ** 3 })).toBeTruthy();
    expect(validateFile({ name: 'lesson.mp4', size: 0 })).toBeTruthy();
    expect(validateFile({ name: 'lesson.mp4', size: 100_000_000 })).toBeNull();
  });
  it('routes PowerPoint to engine guidance, never falsely to a static slide renderer', () => {
    expect(describeFile('lecture.pptx').kind).toBe('presentation');
    expect(validateFile({ name: 'lecture.ppt', size: 100 })).toContain('PPT القديمة');
    expect(validateFile({ name: 'lecture.pptx', size: 41 * 1024 ** 2 })).toBeTruthy();
    expect(describeFile('book.docx').kind).toBe('office');
  });
  it('explains a failed decoder', () => {
    expect(mediaErrorMessage(4)).toContain('H.264');
  });
});

describe('source lifecycle', () => {
  const setup = () => {
    const urls = { createObjectURL: vi.fn(() => 'blob:local-1'), revokeObjectURL: vi.fn() };
    return { urls, lease: new SourceLease(urls) };
  };
  it('revokes a video URL when another file opens or the workspace closes', () => {
    const { lease, urls } = setup();
    lease.file(lease.replace(), new Blob(['video']));
    lease.replace();
    lease.replace();
    expect(urls.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:local-1');
  });
  it('prevents an obsolete text read or file open from replacing the current document', () => {
    const { lease, urls } = setup();
    const first = lease.replace();
    const second = lease.replace();
    expect(lease.current(first)).toBe(false);
    expect(lease.current(second)).toBe(true);
    expect(lease.file(first, new Blob(['stale']))).toBeNull();
    expect(urls.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('presentation geometry', () => {
  it('keeps the source aspect ratio across portrait and landscape workspaces', () => {
    for (const space of [{ width: 375, height: 600 }, { width: 1800, height: 600 }, { width: 600, height: 1800 }]) {
      const fitted = fitSize(space, { width: 1920, height: 1080 });
      expect(fitted.width / fitted.height).toBeCloseTo(1920 / 1080);
      expect(fitted.width).toBeLessThanOrEqual(space.width);
      expect(fitted.height).toBeLessThanOrEqual(space.height);
    }
  });
  it('survives a zero-sized layout during rotation', () => {
    expect(fitSize({ width: 0, height: 0 }, { width: 1920, height: 1080 })).toEqual({ width: 0, height: 0 });
  });
  it('does not show NaN while media metadata is pending', () => {
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(125.8)).toBe('2:05');
  });
});
