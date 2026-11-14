// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../app/useReaderController';
import { DocumentInkProvider } from './DocumentInk';
import { ReaderWorkspace } from './ReaderWorkspace';
import { TeachingProvider } from './TeachingContext';

vi.mock('./PdfPage', () => ({
  PdfPage: ({
    pageNumber,
    searchQuery,
    isCurrentSearchPage,
  }: {
    pageNumber: number;
    searchQuery?: string;
    isCurrentSearchPage?: boolean;
  }) => (
    <div
      data-testid={`pdf-page-${pageNumber}`}
      data-search={searchQuery || ''}
      data-active-search={isCurrentSearchPage ? 'true' : 'false'}
    >
      Page {pageNumber}
    </div>
  ),
}));

let root: Root;
let host: HTMLDivElement;

function makeReader(overrides: Partial<ReaderController> = {}): ReaderController {
  return {
    doc: {},
    docId: 'doc-ws-1',
    docTitle: 'Calculus Notes',
    docIsRtl: false,
    numPages: 3,
    currentPage: 1,
    zoom: 1,
    setZoom: vi.fn(),
    refitViewport: vi.fn(),
    theme: 'paper',
    viewMode: 'single',
    lang: 'en',
    baseAspectRatio: 595 / 842,
    basePageSize: { width: 595, height: 842 },
    annotations: [],
    annotationSaveStatus: 'saved',
    deleteAnnotation: vi.fn(),
    searchQuery: '',
    activeSearchPage: null,
    isImmersive: false,
    setIsImmersive: vi.fn(),
    handlePageVisible: vi.fn(),
    goToNextPage: vi.fn(),
    goToPrevPage: vi.fn(),
    scrollContainerRef: { current: null },
    touchZoomActiveRef: { current: false },
    handleTouchStart: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleTouchCancel: vi.fn(),
    dualFlipKey: 0,
    numberJumpDisplay: '',
    arrivalGlowKey: 0,
    scrollToPage: vi.fn(),
    showMobileNavBar: true,
    beamRoom: null,
    beamPeerConnected: false,
    beamSelection: null,
    receiveBeamSelection: vi.fn(),
    mergeRemoteAnnotations: vi.fn(),
    closeDocument: vi.fn(),
    ...overrides,
  } as unknown as ReaderController;
}

async function renderWorkspace(reader: ReaderController, compact = false) {
  await act(async () => {
    root.render(
      <TeachingProvider mobile={compact}>
        <DocumentInkProvider reader={reader}>
          <ReaderWorkspace reader={reader} compact={compact} />
        </DocumentInkProvider>
      </TeachingProvider>
    );
  });
}

describe('ReaderWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns null when no document is loaded', async () => {
    await renderWorkspace(makeReader({ doc: null }));
    expect(host.innerHTML).toBe('');
  });

  it('renders single mode with paged navigation arrows and respects first-page disable state', async () => {
    const reader = makeReader({ viewMode: 'single', currentPage: 1, numPages: 3 });
    await renderWorkspace(reader);

    expect(host.querySelector('[data-testid="pdf-page-1"]')).not.toBeNull();
    const prevBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]');
    const nextBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
    expect(prevBtn?.disabled).toBe(true);
    expect(nextBtn?.disabled).toBe(false);

    await act(async () => nextBtn?.click());
    expect(reader.goToNextPage).toHaveBeenCalledTimes(1);
  });

  it('renders dual-page spread and End of Document placeholder on trailing odd page', async () => {
    await renderWorkspace(makeReader({ viewMode: 'dual', currentPage: 1, numPages: 3 }));
    expect(host.querySelector('[data-testid="pdf-page-1"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="pdf-page-2"]')).not.toBeNull();

    await renderWorkspace(makeReader({ viewMode: 'dual', currentPage: 3, numPages: 3 }));
    expect(host.querySelector('[data-testid="pdf-page-3"]')).not.toBeNull();
    expect(host.textContent).toContain('End of Document');
  });

  it('renders continuous page slots and forwards active search query only to near pages', async () => {
    await renderWorkspace(
      makeReader({
        viewMode: 'continuous',
        currentPage: 1,
        numPages: 6,
        searchQuery: 'integral',
        activeSearchPage: 2,
      })
    );

    expect(host.querySelectorAll('[data-page-slot]').length).toBe(6);
    const page2 = host.querySelector('[data-testid="pdf-page-2"]');
    expect(page2?.getAttribute('data-search')).toBe('integral');
    expect(page2?.getAttribute('data-active-search')).toBe('true');
    // Page 6 is > 3 pages away from currentPage 1 so its PageSlot stays virtualized
    expect(host.querySelector('[data-testid="pdf-page-6"]')).toBeNull();
  });
});
