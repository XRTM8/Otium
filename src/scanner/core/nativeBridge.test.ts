// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canSaveFileInPlace, nativeSaveFileInPlace } from './nativeBridge';

describe('nativeBridge in-place saving', () => {
  const nativeWindow = window as unknown as { OtiumNative?: Record<string, unknown> };

  beforeEach(() => {
    delete nativeWindow.OtiumNative;
  });

  afterEach(() => {
    delete nativeWindow.OtiumNative;
  });

  it('reports whether in-place saving is available for a document id', () => {
    expect(canSaveFileInPlace('doc-1')).toBe(false);

    nativeWindow.OtiumNative = {
      canSaveInPlace: vi.fn((id: string) => id === 'doc-saf'),
    };

    expect(canSaveFileInPlace('doc-saf')).toBe(true);
    expect(canSaveFileInPlace('doc-other')).toBe(false);
  });

  it('saves directly in-place when native bridge supports it', async () => {
    const saveFileInPlaceMock = vi.fn().mockReturnValue(true);
    nativeWindow.OtiumNative = {
      saveFileInPlace: saveFileInPlaceMock,
    };

    const blob = new Blob(['%PDF-1.4 updated'], { type: 'application/pdf' });
    const result = await nativeSaveFileInPlace('content://media/external/doc-123', blob);

    expect(result).toBe(true);
    expect(saveFileInPlaceMock).toHaveBeenCalledWith('content://media/external/doc-123', expect.any(String));
  });

  it('falls back to filename download when in-place save fails or is unavailable', async () => {
    const blob = new Blob(['%PDF-1.4 updated'], { type: 'application/pdf' });
    const result = await nativeSaveFileInPlace('unknown-id', blob, 'fallback.pdf');

    expect(result).toBe(true);
  });
});
