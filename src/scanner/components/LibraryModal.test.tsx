// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryDocument } from '../core/storage/documentLibrary';
import { LibraryModal } from './LibraryModal';

const libraryMocks = vi.hoisted(() => ({
  docs: [] as LibraryDocument[],
  deleteDocumentFromLibrary: vi.fn(async () => {}),
}));

vi.mock('../core/storage/documentLibrary', () => ({
  getAllLibraryDocuments: vi.fn(async () => libraryMocks.docs),
  deleteDocumentFromLibrary: libraryMocks.deleteDocumentFromLibrary,
  exportVaultBackup: vi.fn(async () => new Blob(['{}'])),
  restoreVaultBackup: vi.fn(async () => 0),
}));

describe('LibraryModal', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    libraryMocks.docs = [];
    libraryMocks.deleteDocumentFromLibrary.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('renders nothing when closed, shows empty state, and opens or deletes saved scans', async () => {
    const onOpenDocument = vi.fn();

    await act(async () => {
      root.render(<LibraryModal isOpen={false} onClose={vi.fn()} onOpenDocument={onOpenDocument} />);
    });
    expect(host.textContent).toBe('');

    libraryMocks.docs = [
      {
        id: 'scan-doc-1',
        title: 'Scanned Contract',
        category: 'doc',
        pageCount: 2,
        createdAt: Date.now(),
        thumbnail: 'data:image/png;base64,AAAA',
        pdfBlob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      } as LibraryDocument,
    ];

    await act(async () => {
      root.render(<LibraryModal isOpen={true} onClose={vi.fn()} onOpenDocument={onOpenDocument} lang="en" />);
    });

    expect(host.textContent).toContain('Scanned Contract');
    const openBtn = host.querySelector<HTMLButtonElement>('button[title="Open in Otium Reader"]');
    await act(async () => {
      openBtn?.click();
    });
    expect(onOpenDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'scan-doc-1' }));

    const deleteBtn = host.querySelector<HTMLButtonElement>('button[title="حذف"]');
    await act(async () => {
      deleteBtn?.click();
    });
    expect(libraryMocks.deleteDocumentFromLibrary).toHaveBeenCalledWith('scan-doc-1');
  });
});
