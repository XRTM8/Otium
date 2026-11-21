// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardLiveInk } from './useBoardLiveInk';
import type { BoardStroke, BoardTool } from '../types';

let root: Root;
let host: HTMLDivElement;
let hookResult!: ReturnType<typeof useBoardLiveInk>;

function TestHost({
  activeTool,
  strokes,
  setStrokes,
  setUndoStack,
  setRedoStack,
  setDrawingRevision,
}: {
  activeTool: BoardTool;
  strokes: BoardStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<BoardStroke[]>>;
  setUndoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  setRedoStack: React.Dispatch<React.SetStateAction<BoardStroke[][]>>;
  setDrawingRevision: React.Dispatch<React.SetStateAction<number>>;
}) {
  const stageRef = { current: document.createElement('div') };
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    right: 1920,
    bottom: 1080,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);

  const liveCanvas = document.createElement('canvas');
  const canvasRef = { current: canvas };
  const liveCanvasRef = { current: liveCanvas };
  const laserTrailRef = { current: [] };

  const res = useBoardLiveInk({
    stageRef,
    canvasRef,
    liveCanvasRef,
    ready: true,
    target: 'board',
    presentation: false,
    activeTool,
    stylusOnly: false,
    isDarkBg: false,
    selectedColor: '#111827',
    selectedWidth: 4,
    strokes,
    setStrokes,
    setUndoStack,
    setRedoStack,
    setDrawingRevision,
    laserTrailRef,
  });

  useLayoutEffect(() => {
    hookResult = res;
  });

  return null;
}

describe('useBoardLiveInk', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => { cb(0); return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('erases strokes when stylus eraser button is pressed even while tool is pen', async () => {
    const existingStroke: BoardStroke = {
      id: 'existing-1',
      tool: 'pen',
      color: '#111827',
      width: 4,
      points: [
        { x: 100, y: 100 },
        { x: 120, y: 120 },
      ],
    };
    let currentStrokes: BoardStroke[] = [existingStroke];
    const setStrokes = vi.fn((updater) => {
      currentStrokes = typeof updater === 'function' ? updater(currentStrokes) : updater;
    });
    const setUndoStack = vi.fn();
    const setRedoStack = vi.fn();
    const setDrawingRevision = vi.fn();

    await act(async () => {
      root.render(
        <TestHost
          activeTool="pen"
          strokes={currentStrokes}
          setStrokes={setStrokes}
          setUndoStack={setUndoStack}
          setRedoStack={setRedoStack}
          setDrawingRevision={setDrawingRevision}
        />
      );
    });

    // Pointer down with pen and eraser button (button = 5 or buttons = 32)
    await act(async () => {
      hookResult.handlePointerDown({
        pointerId: 10,
        pointerType: 'pen',
        button: 5,
        buttons: 32,
        clientX: 105,
        clientY: 105,
        nativeEvent: {},
      } as unknown as React.PointerEvent<HTMLCanvasElement>);
    });

    expect(setStrokes).toHaveBeenCalled();
    expect(currentStrokes).toEqual([]);
    expect(setUndoStack).toHaveBeenCalledWith(expect.any(Function));

    await act(async () => {
      hookResult.handlePointerUp({
        pointerId: 10,
        pointerType: 'pen',
      } as unknown as React.PointerEvent<HTMLCanvasElement>);
    });
  });

  it('rejects stray palm touch inputs immediately after pen usage', async () => {
    let currentStrokes: BoardStroke[] = [];
    const setStrokes = vi.fn();

    await act(async () => {
      root.render(
        <TestHost
          activeTool="pen"
          strokes={currentStrokes}
          setStrokes={setStrokes}
          setUndoStack={vi.fn()}
          setRedoStack={vi.fn()}
          setDrawingRevision={vi.fn()}
        />
      );
    });

    // 1. Pen touches down
    await act(async () => {
      hookResult.handlePointerDown({
        pointerId: 1,
        pointerType: 'pen',
        button: 0,
        clientX: 200,
        clientY: 200,
        nativeEvent: {},
      } as unknown as React.PointerEvent<HTMLCanvasElement>);
    });

    await act(async () => {
      hookResult.handlePointerUp({
        pointerId: 1,
        pointerType: 'pen',
      } as unknown as React.PointerEvent<HTMLCanvasElement>);
    });

    // Pen committed exactly 1 stroke
    expect(setStrokes).toHaveBeenCalledTimes(1);

    // 2. Palm touches down immediately (width > 25, touch, < 1200ms from pen)
    await act(async () => {
      hookResult.handlePointerDown({
        pointerId: 2,
        pointerType: 'touch',
        button: 0,
        width: 40,
        height: 40,
        clientX: 250,
        clientY: 250,
        nativeEvent: {},
      } as unknown as React.PointerEvent<HTMLCanvasElement>);
    });

    await act(async () => {
      hookResult.handlePointerUp({
        pointerId: 2,
        pointerType: 'touch',
      } as unknown as React.PointerEvent<HTMLCanvasElement>);
    });

    // Palm touch must be rejected, setStrokes must NOT be called again
    expect(setStrokes).toHaveBeenCalledTimes(1);
  });
});
