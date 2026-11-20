// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsSheetDrag } from './useSettingsSheetDrag';

let host: HTMLDivElement;
let root: Root;

interface TestComponentProps {
  isOpen: boolean;
  onClose: () => void;
  onHookReady: (hook: ReturnType<typeof useSettingsSheetDrag>) => void;
}

function TestComponent({ isOpen, onClose, onHookReady }: TestComponentProps) {
  const { sheetRef, ...hook } = useSettingsSheetDrag(isOpen, onClose);
  useEffect(() => {
    onHookReady({ sheetRef, ...hook });
  }, [hook, onHookReady, sheetRef]);
  return <div ref={sheetRef} data-testid="modal" />;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('useSettingsSheetDrag', () => {
  it('initializes with default states', async () => {
    let hookState!: ReturnType<typeof useSettingsSheetDrag>;
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <TestComponent
          isOpen={true}
          onClose={onClose}
          onHookReady={(h) => {
            hookState = h;
          }}
        />
      );
    });

    expect(hookState.isExpanded).toBe(false);
    expect(hookState.dragOffset).toBe(0);
    expect(hookState.isDragging).toBe(false);
  });

  it('toggles expansion on quick tap on the handle', async () => {
    let hookState!: ReturnType<typeof useSettingsSheetDrag>;
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <TestComponent
          isOpen={true}
          onClose={onClose}
          onHookReady={(h) => {
            hookState = h;
          }}
        />
      );
    });

    const modalEl = host.querySelector('[data-testid="modal"]') as HTMLElement;

    await act(async () => {
      hookState.handlePointerDown({
        button: 0,
        clientY: 200,
        pointerId: 1,
        currentTarget: modalEl,
      } as unknown as React.PointerEvent);
    });

    expect(hookState.isDragging).toBe(true);

    await act(async () => {
      hookState.handlePointerUp({
        pointerId: 1,
        currentTarget: modalEl,
      } as unknown as React.PointerEvent);
    });

    expect(hookState.isDragging).toBe(false);
    expect(hookState.isExpanded).toBe(true);
  });

  it('triggers onClose when pulled down past the dismiss threshold', async () => {
    vi.useFakeTimers();
    let hookState!: ReturnType<typeof useSettingsSheetDrag>;
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <TestComponent
          isOpen={true}
          onClose={onClose}
          onHookReady={(h) => {
            hookState = h;
          }}
        />
      );
    });

    const modalEl = host.querySelector('[data-testid="modal"]') as HTMLElement;

    await act(async () => {
      hookState.handlePointerDown({
        button: 0,
        clientY: 200,
        pointerId: 1,
        currentTarget: modalEl,
      } as unknown as React.PointerEvent);
    });

    await act(async () => {
      hookState.handlePointerMove({
        clientY: 350,
      } as unknown as React.PointerEvent);
    });

    await act(async () => {
      hookState.handlePointerUp({
        pointerId: 1,
        currentTarget: modalEl,
      } as unknown as React.PointerEvent);
    });

    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(onClose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('expands when pulled up past the expansion threshold', async () => {
    let hookState!: ReturnType<typeof useSettingsSheetDrag>;
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <TestComponent
          isOpen={true}
          onClose={onClose}
          onHookReady={(h) => {
            hookState = h;
          }}
        />
      );
    });

    const modalEl = host.querySelector('[data-testid="modal"]') as HTMLElement;

    await act(async () => {
      hookState.handlePointerDown({
        button: 0,
        clientY: 300,
        pointerId: 1,
        currentTarget: modalEl,
      } as unknown as React.PointerEvent);
    });

    await act(async () => {
      hookState.handlePointerMove({
        clientY: 220,
      } as unknown as React.PointerEvent);
    });

    await act(async () => {
      hookState.handlePointerUp({
        pointerId: 1,
        currentTarget: modalEl,
      } as unknown as React.PointerEvent);
    });

    expect(hookState.isExpanded).toBe(true);
    expect(hookState.isDragging).toBe(false);
  });
});
