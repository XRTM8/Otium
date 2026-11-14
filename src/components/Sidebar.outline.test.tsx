// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

describe('Sidebar nested PDF outline flattening', () => {
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

  it('flattens nested PDF outline items recursively with depth indentation and navigation', async () => {
    const onSelectPage = vi.fn();
    const onClose = vi.fn();
    const mockDoc = {
      getOutline: vi.fn(async () => [
        {
          title: 'Chapter 1',
          dest: 'dest-ch1',
          items: [
            {
              title: 'Section 1.1',
              dest: [{ num: 2, gen: 0 }],
              items: [
                {
                  title: 'Subsection 1.1.1',
                  dest: 'dest-sub',
                  items: [],
                },
              ],
            },
          ],
        },
      ]),
      getDestination: vi.fn(async (name: string) => {
        if (name === 'dest-ch1') return [{ num: 1, gen: 0 }];
        if (name === 'dest-sub') return [{ num: 4, gen: 0 }];
        return null;
      }),
      getPageIndex: vi.fn(async (ref: { num: number }) => ref.num),
      getPage: vi.fn(),
    } as unknown as Parameters<typeof Sidebar>[0]['doc'];

    await act(async () => {
      root.render(
        <Sidebar
          isOpen
          doc={mockDoc}
          totalPages={10}
          currentPage={1}
          lang="en"
          onSelectPage={onSelectPage}
          onClose={onClose}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const tocTabBtn = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Outline')
    );
    expect(tocTabBtn).toBeDefined();
    await act(async () => {
      tocTabBtn!.click();
    });

    const buttons = [...host.querySelectorAll('button')].filter((b) =>
      ['Chapter 1', 'Section 1.1', 'Subsection 1.1.1'].some((t) => b.textContent?.includes(t))
    );
    expect(buttons).toHaveLength(3);
    expect(buttons[0].style.paddingInlineStart).toBe('12px');
    expect(buttons[1].style.paddingInlineStart).toBe('26px');
    expect(buttons[2].style.paddingInlineStart).toBe('40px');

    await act(async () => {
      buttons[2].click();
    });
    expect(onSelectPage).toHaveBeenCalledWith(5);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
