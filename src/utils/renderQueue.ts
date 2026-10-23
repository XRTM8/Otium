// Smart Render Queue for PDF.js concurrency management
class RenderQueue {
  private activeCount: number = 0;
  private readonly maxConcurrent: number = 2; // Optimal for 60fps rendering without worker contention
  private queue: Array<{ id: number; execute: () => Promise<void> }> = [];

  public async schedule(id: number, execute: () => Promise<void>): Promise<void> {
    // Remove any previous pending request for the same page
    this.queue = this.queue.filter((item) => item.id !== id);

    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      try {
        await execute();
      } finally {
        this.activeCount--;
        this.processNext();
      }
    } else {
      // Put at the front of queue (LIFO for current viewport priority)
      this.queue.unshift({ id, execute });
    }
  }

  private processNext() {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        this.activeCount++;
        next.execute().finally(() => {
          this.activeCount--;
          this.processNext();
        });
      }
    }
  }

  public cancel(id: number) {
    this.queue = this.queue.filter((item) => item.id !== id);
  }
}

export const renderQueue = new RenderQueue();
