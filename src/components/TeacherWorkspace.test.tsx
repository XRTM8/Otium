// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeachingProvider, useTeaching } from './TeachingContext';
import { DocumentInkProvider, DocumentInkLayer } from './DocumentInk';
import { BoardCanvas } from '../board/components/BoardCanvas';
import { readBoard, writeBoard } from '../board/utils/boardStorage';
import { readInk } from '../core/annotations/ink';
import { beamService } from '../board/beam/beamService';
import type { BeamMessage } from '../board/types';
import type { ReaderController } from '../app/useReaderController';

let root: Root, host: HTMLDivElement;
let teaching: ReturnType<typeof useTeaching>;
const restore = vi.fn();
function Probe() { teaching = useTeaching(); return null; }
const initialStroke = { id: 'line', tool: 'pen' as const, color: '#e11d48', width: 4, points: [{ x: 100, y: 100 }, { x: 400, y: 100 }] };
function reader(id: string, linked = false) {
  return { doc: {}, docId: id, docTitle: 'Lesson', annotations: [], annotationSaveStatus: 'saved',
    currentPage: 1, numPages: 3, theme: 'amoled', lang: 'ar', beamRoom: linked ? 'OTM-1234' : null,
    beamPeerConnected: linked, receiveBeamSelection: vi.fn(), mergeRemoteAnnotations: vi.fn(),
    scrollContainerRef: { current: null }, closeDocument: vi.fn(), goToPrevPage: vi.fn(), goToNextPage: vi.fn()
  } as unknown as ReaderController;
}
async function render(id: string, linked = false, mobile = false) {
  await act(async () => root.render(<TeachingProvider mobile={mobile}><DocumentInkProvider reader={reader(id, linked)}>
    <Probe /><DocumentInkLayer page={1} width={800} height={450} lang="ar" />
    <BoardCanvas documentId={id} lang="ar" snippets={[]} onRestoreSnippets={restore} onRemoveSnippet={vi.fn()} onUpdateSnippetPosition={vi.fn()} />
  </DocumentInkProvider></TeachingProvider>));
  await settled(() => teaching.board?.ready === true);
  if (!mobile) {
    await act(async () => teaching.updatePrefs({ boardEnabled: true }));
    await act(async () => teaching.setLayout('split'));
  }
}
async function settled(test: () => boolean) {
  for (let i = 0; i < 60; i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    if (test()) return;
  }
  expect(test()).toBe(true);
}
function button(name: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name);
  if (!result) throw Error(`Missing button: ${name}`);
  return result;
}
async function click(name: string) { await act(async () => button(name).click()); }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => vi.fn() }) as CanvasRenderingContext2D);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 450));
  HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('unified teacher workspace', () => {
  it('keeps the whiteboard hidden by default but restores it immediately when the saved setting is enabled', async () => {
    await act(async () => root.render(<TeachingProvider><DocumentInkProvider reader={reader('lesson-board-switch')}>
      <Probe /><DocumentInkLayer page={1} width={800} height={450} lang="ar" />
      <BoardCanvas documentId="lesson-board-switch" lang="ar" snippets={[]} onRestoreSnippets={restore} onRemoveSnippet={vi.fn()} onUpdateSnippetPosition={vi.fn()} />
    </DocumentInkProvider></TeachingProvider>));
    await settled(() => teaching.board?.ready === true);
    expect(host.querySelector('.teacher-dock')).toBeNull();
    await act(async () => teaching.updatePrefs({ boardEnabled: true }));
    await act(async () => teaching.setLayout('split'));
    expect(host.querySelector('button[aria-label="إظهار السبورة"]')).not.toBeNull();
  });
  it('switches targets, confirms clearing, restores erased ink with undo and keeps it after remount', async () => {
    await writeBoard('lesson-controls', { pages: [{ id: 'p1', strokes: [initialStroke], redoStack: [], undoStack: [[]], background: 'grid' }], currentPage: 0, snippets: [] });
    await render('lesson-controls');
    expect(host.textContent).toContain('تكتب على الملف');
    await click('إظهار السبورة'); expect(host.textContent).toContain('تكتب على السبورة');
    await click('المزيد'); await click('مسح شرح صفحة السبورة');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    await click('إلغاء'); expect(teaching.board?.canUndo).toBe(true);
    await click('المزيد'); await click('مسح شرح صفحة السبورة'); await click('مسح الشرح');
    await settled(() => teaching.board?.status === 'saved');
    expect((await readBoard('lesson-controls'))?.pages[0].strokes).toEqual([]);
    await click('تراجع'); await settled(() => teaching.board?.status === 'saved');
    expect((await readBoard('lesson-controls'))?.pages[0].strokes).toEqual([initialStroke]);
    await click('إظهار الكتاب');
    await act(async () => teaching.setLayout('board'));
    await act(async () => root.unmount()); root = createRoot(host); await render('lesson-controls');
    expect((await readBoard('lesson-controls'))?.pages[0].strokes).toEqual([initialStroke]);
  });
  it('hides teaching controls for students and keeps a reachable restore button', async () => {
    await render('lesson-presentation');
    await click('المزيد'); await click('عرض للطلاب');
    expect(host.querySelector('.teacher-context-line')).toBeNull();
    expect(host.querySelector('button[aria-label="قلم"]')).toBeNull();
    await click('إرجاع الأدوات'); expect(host.querySelector('button[aria-label="قلم"]')).not.toBeNull();
  });
  it('keeps phone document tools, including selection, without desktop board controls', async () => {
    await render('lesson-mobile', false, true);
    expect(host.querySelector('button[aria-label="إظهار السبورة"]')).toBeNull();
    expect(host.querySelector('.teacher-mobile')).not.toBeNull();
    expect(host.querySelector('button[aria-label="تحديد"]')).not.toBeNull();
    expect(teaching.layout).toBe('document');
  });
  it('collapses phone study tools and restores selection without losing the document', async () => {
    await render('lesson-mobile-hide', false, true);
    expect(host.querySelector('.teacher-context-line')).toBeNull();
    expect(host.querySelector('button[aria-label="تصدير"]')).toBeNull();
    await click('إخفاء كل الأدوات');
    expect(host.querySelector('button[aria-label="تحديد"]')).toBeNull();
    expect(host.querySelector('.teacher-main-row')?.querySelectorAll('button')).toHaveLength(1);
    await click('إرجاع الأدوات');
    expect(host.querySelector('button[aria-label="تحديد"]')).not.toBeNull();
    expect(teaching.readerTools).toBe(true);
  });
  it('expands mobile teaching actions only when a live beam peer is connected', async () => {
    await render('lesson-mobile-broadcast', true, true);
    expect(host.querySelector('.teacher-context-line')).not.toBeNull();
    expect(host.querySelector('button[aria-label="تصدير"]')).not.toBeNull();
    expect(host.querySelector('.teacher-page-navigation')?.getAttribute('dir')).toBe('ltr');
  });
  it('waits for valid receipts from the paired reader instead of treating send as delivery', async () => {
    const listeners = new Set<(message: BeamMessage) => unknown>();
    vi.spyOn(beamService, 'subscribe').mockImplementation(callback => { listeners.add(callback as never); return () => { listeners.delete(callback as never); }; });
    const outgoing: BeamMessage[] = [];
    vi.spyOn(beamService, 'broadcast').mockImplementation(async message => { outgoing.push(message); });
    await render('lesson-receipts', true);
    expect(host.textContent).not.toContain('وصل الشرح للجهاز الآخر');
    const tracked = outgoing.filter(message => message.receiptId);
    expect(tracked.length).toBeGreaterThan(0);
    await act(async () => { for (const message of tracked) for (const callback of listeners) callback({ type: 'BEAM_ANNOTATION_ACK', roomCode: 'OTM-1234', timestamp: Date.now(), annotationReceipt: { documentId: 'wrong-document', id: message.receiptId! } }); });
    expect(host.textContent).not.toContain('وصل الشرح للجهاز الآخر');
    await act(async () => { for (const message of tracked) for (const callback of listeners) callback({ type: 'BEAM_ANNOTATION_ACK', roomCode: 'OTM-1234', timestamp: Date.now(), annotationReceipt: { documentId: 'lesson-receipts', id: message.receiptId! } }); });
    expect(host.textContent).toContain('وصل الشرح للجهاز الآخر');
  });
  it('keeps finger input from writing when stylus-only mode is enabled', async () => {
    await render('lesson-stylus'); await click('قلم');
    await act(async () => teaching.updatePrefs({ stylusOnly: true }));
    const surface = host.querySelector('svg.absolute')!.parentElement!;
    for (const [name, type, id] of [['pointerdown', 'touch', 1], ['pointerup', 'touch', 1], ['pointerdown', 'pen', 2], ['pointerup', 'pen', 2]] as const) {
      await act(async () => { surface.dispatchEvent(new PointerEvent(name, { pointerType: type, pointerId: id, button: 0, clientX: 80, clientY: 100, bubbles: true })); });
    }
    await settled(() => host.textContent!.includes('محفوظ على هذا الجهاز'));
    expect(await readInk('lesson-stylus')).toHaveLength(1);
  });
  it('uses the selected color and width for whiteboard highlighting', async () => {
    await render('lesson-highlight-options'); await click('إظهار السبورة'); await click('تظليل');
    await act(async () => teaching.updatePrefs({ color: '#059669', width: 8 }));
    const canvas = host.querySelector('canvas')!;
    await act(async () => { canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', pointerId: 9, button: 0, clientX: 100, clientY: 100, bubbles: true })); });
    await act(async () => { canvas.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 9, button: 0, clientX: 100, clientY: 100, bubbles: true })); });
    await settled(() => teaching.board?.status === 'saved');
    const snapshot = { value: null as Awaited<ReturnType<typeof readBoard>> };
    await act(async () => { snapshot.value = await readBoard('lesson-highlight-options'); });
    expect(snapshot.value?.pages[0].strokes[0]).toMatchObject({ tool: 'highlighter', color: '#059669', width: 48 });
  });
});
