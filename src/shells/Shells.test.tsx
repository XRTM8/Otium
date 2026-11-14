// @vitest-environment happy-dom
import { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderController } from '../app/useReaderController';
import { clearBackHandlers, executeBackStep } from '../core/navigation/backHandler';
import { DesktopShell } from './DesktopShell';
import { MobileShell } from './MobileShell';

const shellMocks = vi.hoisted(() => ({
  reader: null as unknown as ReaderController,
  controllerCalls: [] as Array<{ keyboard: boolean; dragDrop: boolean }>,
  compact: false,
  receiver: false,
}));

vi.mock('../app/useReaderController', () => ({
  useReaderController: (caps: { keyboard: boolean; dragDrop: boolean }) => {
    shellMocks.controllerCalls.push(caps);
    return shellMocks.reader;
  },
}));

vi.mock('../media/useAppMedia', () => ({
  useAppMedia: () => ({
    kind: null,
    item: null,
    url: null,
    pending: false,
    open: vi.fn(),
    close: vi.fn(),
    beam: { canSend: false, error: null, retry: vi.fn(), remotePage: null },
  }),
}));

vi.mock('../platform/deviceUsage', () => ({
  useDeviceUsage: () => ({
    role: shellMocks.compact ? 'handheld' : 'desktop',
    compact: shellMocks.compact,
    receiver: shellMocks.receiver,
  }),
}));

vi.mock('../platform/useMobileFullscreen', () => ({
  useMobileFullscreen: vi.fn(),
}));

vi.mock('../components/WelcomeScreen', () => ({
  WelcomeScreen: (props: { onOpenBeam?: () => void }) => (
    <div data-testid="welcome-screen">
      {props.onOpenBeam && (
        <button type="button" onClick={props.onOpenBeam}>
          Open Beam
        </button>
      )}
    </div>
  ),
}));

vi.mock('../components/Toolbar', () => ({
  Toolbar: (props: { onOpenBeam?: () => void }) => (
    <div data-testid="desktop-toolbar">
      {props.onOpenBeam && (
        <button type="button" onClick={props.onOpenBeam}>
          Toolbar Beam
        </button>
      )}
    </div>
  ),
}));

vi.mock('../components/MobileToolbar', () => ({
  MobileToolbar: (props: { onOpenScanner?: () => void; onOpenBeam?: () => void }) => (
    <div data-testid="mobile-toolbar">
      {props.onOpenScanner && (
        <button type="button" onClick={props.onOpenScanner}>
          Open Scanner
        </button>
      )}
      {props.onOpenBeam && (
        <button type="button" onClick={props.onOpenBeam}>
          Mobile Beam
        </button>
      )}
    </div>
  ),
}));

vi.mock('../components/ReaderWorkspace', () => ({
  ReaderWorkspace: () => <div data-testid="reader-workspace" />,
}));

vi.mock('../components/ReaderOverlays', () => ({
  ReaderOverlays: () => <div data-testid="reader-overlays" />,
}));

vi.mock('../components/TextSelectionMenu', () => ({
  TextSelectionMenu: () => null,
}));

vi.mock('../board/components/BoardSplitWorkspace', () => ({
  BoardSplitWorkspace: () => <div data-testid="board-split-workspace" />,
}));

vi.mock('../board/beam/BeamModal', () => ({
  BeamModal: (props: { formFactor: string }) => (
    <div data-testid="beam-modal" data-form-factor={props.formFactor} />
  ),
}));

vi.mock('../scanner/ScannerModal', () => ({
  ScannerModal: () => <div data-testid="scanner-modal" />,
}));

function makeReader(hasDoc: boolean): ReaderController {
  return {
    doc: hasDoc ? ({ numPages: 5 } as ReaderController['doc']) : null,
    docId: 'doc-1',
    docTitle: 'Sample.pdf',
    docIsRtl: true,
    numPages: 5,
    currentPage: 1,
    scale: 1,
    theme: 'paper',
    lang: 'ar',
    viewMode: 'continuous',
    outline: [],
    annotations: [],
    annotationSaveStatus: 'saved',
    bookmarks: [],
    isFullscreen: false,
    isImmersive: false,
    setIsImmersive: vi.fn(),
    isSidebarOpen: false,
    setIsSidebarOpen: vi.fn(),
    isSearchOpen: false,
    setIsSearchOpen: vi.fn(),
    isSettingsOpen: false,
    setIsSettingsOpen: vi.fn(),
    beamRoom: null,
    beamRole: null,
    beamPeerConnected: false,
    basePageSize: { width: 595, height: 842 },
    fileSizeBytes: 1024,
    scrollContainerRef: { current: null },
    passwordModal: { isOpen: false, isIncorrect: false, isSubmitting: false, error: null, submit: vi.fn(), cancel: vi.fn() },
    changeTheme: vi.fn(),
    changeLanguage: vi.fn(),
    changeViewMode: vi.fn(),
    setZoom: vi.fn(),
    scrollToPage: vi.fn(),
    goToNextPage: vi.fn(),
    goToPrevPage: vi.fn(),
    toggleBookmark: vi.fn(),
    addAnnotation: vi.fn(),
    deleteAnnotation: vi.fn(),
    handleToggleFullscreen: vi.fn(),
    openSearchWithText: vi.fn(),
    openFile: vi.fn(),
    openRecent: vi.fn(),
    loadDocumentBytes: vi.fn(),
    closeDocument: vi.fn(),
    renameDocument: vi.fn(),
    disconnectBeam: vi.fn(),
    setDocumentError: vi.fn(),
    receiveBeamSelection: vi.fn(),
    mergeRemoteAnnotations: vi.fn(),
  } as unknown as ReaderController;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearBackHandlers();
  shellMocks.controllerCalls = [];
  shellMocks.compact = false;
  shellMocks.receiver = false;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  clearBackHandlers();
});

describe('DesktopShell and MobileShell', () => {
  it('mounts DesktopShell welcome flow, drag overlay, and document beam modal', async () => {
    shellMocks.reader = makeReader(false);
    await act(async () => {
      root.render(
        <Suspense fallback={null}>
          <DesktopShell />
        </Suspense>
      );
    });

    expect(shellMocks.controllerCalls[0]).toEqual({ keyboard: true, dragDrop: false });
    expect(host.querySelector('[data-testid="welcome-screen"]')).not.toBeNull();

    // Drag enter with Files triggers frosted dropzone; drag leave clears it.
    await act(async () => {
      const enterEvent = new Event('dragenter', { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(enterEvent, 'dataTransfer', {
        value: { types: ['Files'], files: [] },
      });
      window.dispatchEvent(enterEvent);
    });
    expect(host.textContent).toContain('أفلت ملف الـ PDF هنا لفتحه فوراً');

    await act(async () => {
      window.dispatchEvent(new Event('dragleave', { bubbles: true, cancelable: true }));
    });
    expect(host.textContent).not.toContain('أفلت ملف الـ PDF هنا لفتحه فوراً');

    // Rerender with an open document and open Smart Beam.
    shellMocks.reader = makeReader(true);
    await act(async () => {
      root.render(
        <Suspense fallback={null}>
          <DesktopShell />
        </Suspense>
      );
    });
    expect(host.querySelector('[data-testid="desktop-toolbar"]')).not.toBeNull();

    await act(async () => {
      const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Toolbar Beam');
      btn?.click();
      await new Promise((r) => setTimeout(r, 10));
    });
    const modal = host.querySelector('[data-testid="beam-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('data-form-factor')).toBe('desktop');
  });

  it('mounts MobileShell with touch capabilities and handles hardware back for scanner/beam', async () => {
    shellMocks.compact = true;
    shellMocks.reader = makeReader(true);
    await act(async () => {
      root.render(
        <Suspense fallback={null}>
          <MobileShell />
        </Suspense>
      );
    });

    expect(shellMocks.controllerCalls[0]).toEqual({ keyboard: false, dragDrop: false });
    expect(host.querySelector('[data-testid="mobile-toolbar"]')).not.toBeNull();

    await act(async () => {
      const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Mobile Beam');
      btn?.click();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(host.querySelector('[data-testid="beam-modal"]')?.getAttribute('data-form-factor')).toBe('mobile');

    await act(async () => {
      expect(executeBackStep()).toBe(true);
    });
    expect(host.querySelector('[data-testid="beam-modal"]')).toBeNull();
  });
});
