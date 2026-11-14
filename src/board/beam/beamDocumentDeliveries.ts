import type { BeamMessage } from '../types';

const COMPLETED_TRANSFERS_LIMIT = 64;

/** A transport retry can replay the same logical transfer while the reader is opening it. */
export class BeamDocumentDeliveries {
  private readonly opening = new Map<string, Promise<void>>();
  private readonly opened = new Set<string>();

  deliver(message: BeamMessage, open: () => Promise<void>): Promise<void> {
    const transferId = message.payload?.transferId;
    if (!transferId || !message.sessionId) return open();
    const key = JSON.stringify([message.sessionId, transferId]);
    if (this.opened.has(key)) return Promise.resolve();
    const pending = this.opening.get(key);
    if (pending) return pending;

    const attempt = Promise.resolve().then(open);
    this.opening.set(key, attempt);
    void attempt.then(() => {
      this.opening.delete(key);
      this.opened.add(key);
      if (this.opened.size > COMPLETED_TRANSFERS_LIMIT) {
        const oldest = this.opened.values().next().value;
        if (oldest !== undefined) this.opened.delete(oldest);
      }
    }, () => { this.opening.delete(key); });
    return attempt;
  }
}
