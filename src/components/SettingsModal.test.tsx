// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorage as labStorage } from '../platform/storage';
import type { SaveTextOutcome } from '../platform/saveFile';
import { SettingsModal } from './SettingsModal';

vi.mock('../core/updates/useUpdateChecker', () => ({
  useUpdateChecker: () => ({
    snapshot: null,
    isChecking: false,
    isInstalling: false,
    check: vi.fn(async () => {}),
    install: vi.fn(async () => {}),
    openManualDownload: vi.fn(async () => {}),
  }),
}));

vi.mock('../core/storage/documents', () => ({
  getStorageSummary: vi.fn(async () => ({
    documents: 2,
    maxDocuments: 12,
    bytes: 4096,
    restoredOnly: 0,
  })),
}));

vi.mock('../scanner/core/ocr/ocrEngine', () => ({
  isOcrLanguageCached: () => false,
  preloadOcrLanguage: vi.fn(async () => {}),
}));

let host: HTMLDivElement;
let root: Root;

function baseProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onFontChange: vi.fn(),
    onResetDefaults: vi.fn(),
    onExportBackup: vi.fn<() => Promise<SaveTextOutcome>>(async () => 'download'),
    onImportBackup: vi.fn(async () => ({ documents: 1, annotations: 2, bookmarks: 3 })),
    lang: 'ar' as const,
  };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  labStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
});

describe('SettingsModal', () => {
  it('returns null when closed and renders dialog tabs when open', async () => {
    const props = { ...baseProps(), isOpen: false };
    await act(async () => {
      root.render(<SettingsModal {...props} />);
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => {
      root.render(<SettingsModal {...baseProps()} />);
    });
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(host.textContent).toContain('الخطوط');
    expect(host.textContent).toContain('الماسح');
    expect(host.textContent).toContain('البيانات');
  });

  it('switches to scanner and data tabs, toggles crop mode, and exports backup', async () => {
    const props = baseProps();
    await act(async () => {
      root.render(<SettingsModal {...props} />);
    });

    const clickText = async (label: string) => {
      const btn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
      if (!btn) throw new Error(`Missing button containing: ${label}`);
      await act(async () => {
        btn.click();
        await Promise.resolve();
      });
    };

    await clickText('الماسح');
    await clickText('كشف ذكي للحواف');
    expect(labStorage.getItem('otium_scan_crop_mode')).toBe('auto');

    await clickText('البيانات');
    await clickText('تصدير نسخة احتياطية');
    expect(props.onExportBackup).toHaveBeenCalledOnce();

    await clickText('استعادة الإعدادات الافتراضية');
    expect(props.onResetDefaults).toHaveBeenCalledOnce();

    await clickText('تم وحفظ');
    expect(props.onClose).toHaveBeenCalledOnce();
  });
});
