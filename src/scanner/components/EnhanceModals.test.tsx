// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScannedPage } from '../core/types';
import { EnhanceModals, type EnhanceModalsProps } from './EnhanceModals';

function makePage(id: string): ScannedPage {
  return {
    id,
    originalDataUrl: 'data:image/png;base64,AAAA',
    enhancedDataUrl: 'data:image/png;base64,AAAA',
    quad: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    filter: 'original',
    rotation: 0,
    width: 100,
    height: 100,
    createdAt: 1,
  };
}

function makeProps(overrides: Partial<EnhanceModalsProps> = {}): EnhanceModalsProps {
  const page = makePage('p1');
  return {
    pages: [page],
    safeIndex: 0,
    currentPage: page,
    showCancelModal: false,
    setShowCancelModal: vi.fn(),
    showDeletePageModal: false,
    setShowDeletePageModal: vi.fn(),
    showMoreActions: false,
    setShowMoreActions: vi.fn(),
    isSignatureOpen: false,
    setIsSignatureOpen: vi.fn(),
    isWatermarkOpen: false,
    setIsWatermarkOpen: vi.fn(),
    isAdvancedOptionsOpen: false,
    setIsAdvancedOptionsOpen: vi.fn(),
    isOcrModalOpen: false,
    setIsOcrModalOpen: vi.fn(),
    watermarkText: '',
    setWatermarkText: vi.fn(),
    watermarkStyle: 'diagonal',
    setWatermarkStyle: vi.fn(),
    compressionPreset: 'balanced',
    setCompressionPreset: vi.fn(),
    pageFormat: 'a4',
    setPageFormat: vi.fn(),
    enableOcr: true,
    setEnableOcr: vi.fn(),
    curvature: 0,
    setCurvature: vi.fn(),
    spinePos: 0.5,
    setSpinePos: vi.fn(),
    suggestedDocTitle: 'Extracted Notes',
    extractedText: 'Sample OCR body text',
    setDocTitle: vi.fn(),
    setToastMsg: vi.fn(),
    setCurrentPageIndex: vi.fn(),
    setSignatures: vi.fn(),
    onDeletePage: vi.fn(),
    onResetAll: vi.fn(),
    onSharePdf: vi.fn(),
    onDownloadJpg: vi.fn(),
    onOpenInReader: vi.fn(),
    onPrintPdf: vi.fn(),
    triggerHaptic: vi.fn(),
    ...overrides,
  };
}

describe('EnhanceModals', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('triggers delete page confirmation and applies suggested OCR document title', async () => {
    const onDeletePage = vi.fn();
    const setShowDeletePageModal = vi.fn();
    const setDocTitle = vi.fn();
    const setIsOcrModalOpen = vi.fn();

    await act(async () => {
      root.render(
        <EnhanceModals
          {...makeProps({
            pages: [makePage('p1'), makePage('p2')],
            showDeletePageModal: true,
            isOcrModalOpen: true,
            onDeletePage,
            setShowDeletePageModal,
            setDocTitle,
            setIsOcrModalOpen,
          })}
        />
      );
    });

    const deleteConfirmBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('حذف الصفحة')
    );
    expect(deleteConfirmBtn).toBeDefined();
    await act(async () => {
      deleteConfirmBtn?.click();
    });
    expect(onDeletePage).toHaveBeenCalledWith(0);
    expect(setShowDeletePageModal).toHaveBeenCalledWith(false);

    const applyTitleBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('اعتماد كاسم')
    );
    expect(applyTitleBtn).toBeDefined();
    await act(async () => {
      applyTitleBtn?.click();
    });
    expect(setDocTitle).toHaveBeenCalledWith('Extracted Notes');
  });
});
