/**
 * One shared render lane for PDF canvases.
 *
 * pdf.js renders synchronously in chunks on the main thread. When a continuous
 * scroll mounts several pages at once, starting every page render in parallel
 * steals frames from the scroll. This scheduler keeps exactly one canvas render
 * in flight, serves the page closest to the reader first, and parks background
 * pages while the viewport is moving. Text layers are only built once scrolling
 * settles, because `getTextContent()` allocates a large structure per page.
 */

type RenderJob = () => Promise<void>;

interface QueueItem {
  id: number;
  priority: number;
  run: RenderJob;
  cancelled: boolean;
}

let queue: QueueItem[] = [];
let activeJobs = 0;
let nextId = 1;
let pumpTimer: number | null = null;
let scrollActiveUntil = 0;

export function markScrollActivity(): void {
  scrollActiveUntil = performance.now() + 160;
}

export function isScrollActive(): boolean {
  return performance.now() < scrollActiveUntil;
}

function schedulePump(delay = 0): void {
  if (typeof window === 'undefined') return;
  if (pumpTimer !== null) return;
  pumpTimer = window.setTimeout(() => {
    pumpTimer = null;
    void pump();
  }, delay);
}

async function pump(): Promise<void> {
  if (activeJobs > 0) return;

  const item = queue.shift();
  if (!item) return;

  if (item.cancelled) {
    schedulePump(0);
    return;
  }

  // While the reader is scrolling, only the page under the viewport (and its
  // immediate neighbour) may start. The rest wait for the scroll to settle.
  if (isScrollActive() && item.priority > 1) {
    queue.unshift(item);
    schedulePump(180);
    return;
  }

  activeJobs = 1;
  try {
    // Safety timeout: prevents background WebView pause / phone lock from freezing the queue forever
    await Promise.race([
      item.run(),
      new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error('Render task timeout')), 8000);
      })
    ]);
  } catch {
    // Individual PDF pages already surface their own render errors.
  } finally {
    activeJobs = 0;
    schedulePump(0);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      activeJobs = 0;
      scrollActiveUntil = 0;
      schedulePump(0);
    }
  });
}

/** Enqueue a canvas render. Lower priority values are rendered first. */
export function scheduleRender(priority: number, run: RenderJob): () => void {
  const item: QueueItem = {
    id: nextId++,
    priority,
    run,
    cancelled: false
  };

  queue.push(item);
  queue.sort((a, b) => a.priority - b.priority || a.id - b.id);
  schedulePump(0);

  return () => {
    item.cancelled = true;
    queue = queue.filter((queued) => queued !== item);
  };
}

/**
 * Run non-urgent work (text layers, highlighting) after scrolling stops.
 * Retries while the viewport is still moving so selection never blocks a pan.
 */
export function scheduleIdleWork(run: () => void | Promise<void>, timeout = 500): () => void {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  let timer: number | null = null;

  const execute = async () => {
    if (cancelled) return;
    try {
      await run();
    } catch {
      // Idle work is strictly optional.
    }
  };

  const attempt = () => {
    if (cancelled) return;
    if (isScrollActive()) {
      timer = window.setTimeout(attempt, 150);
      return;
    }

    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleWindow.requestIdleCallback(() => void execute(), { timeout });
    } else {
      timer = window.setTimeout(() => void execute(), 40);
    }
  };

  timer = window.setTimeout(attempt, 140);

  return () => {
    cancelled = true;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}
