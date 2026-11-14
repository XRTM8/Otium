import type { BeamMessage } from '../types';
import { ignoreBenignRejection } from '../../core/utils/bestEffort';
import { randomId } from './beamUtils';

export type AnnotationDeliveryState = 'local' | 'sending' | 'received' | 'waiting';
type AnnotationType = 'BEAM_INK_UPDATE' | 'BEAM_TEXT_ANNOTATIONS';
type Version = { revision: number; id: string };
type Changes<T> = { upsert?: T[]; deleted?: string[] };
interface AnnotationQueueOptions {
  documentId: string | null;
  room: string | null;
  broadcast: (message: BeamMessage) => Promise<void>;
  onDelivery: (state: AnnotationDeliveryState) => void;
}
const RETRY_MS = 8000;

/** A single in-flight operation keeps retries ordered. Receipts identify edits across transports. */
export class BeamAnnotationQueue {
  private pending: BeamMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private online = false;
  private readonly versions = new Map<string, Version>();
  private readonly options: AnnotationQueueOptions;

  constructor(options: AnnotationQueueOptions) {
    this.options = options;
  }

  connect(online: boolean, notify = true): void {
    this.online = online;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (notify && this.pending.length) this.pump();
  }

  send(message: BeamMessage): void {
    const { room, documentId } = this.options;
    if (!room || message.roomCode !== room || !documentId) return;
    if (message.annotationSnapshot && this.pending.some(item => item.type === message.type && item.annotationSnapshot)) return;
    const receiptId = randomId('a');
    const annotationRevision = ++this.revision;
    const changes = message.ink ?? message.annotationSync;
    if (changes && !message.annotationSnapshot) {
      for (const id of [...(changes.upsert ?? []).map(item => item.id), ...(changes.deleted ?? [])]) {
        this.versions.set(`${message.type}:${id}`, { revision: annotationRevision, id: receiptId });
      }
    }
    this.pending.push({ ...message, receiptId, annotationRevision });
    if (this.pending.length === 1) this.pump();
  }

  receiveReceipt(message: BeamMessage): void {
    const receipt = message.annotationReceipt;
    const { room, documentId, onDelivery } = this.options;
    if (message.type !== 'BEAM_ANNOTATION_ACK' || message.roomCode !== room ||
        !receipt || receipt.documentId !== documentId || receipt.id !== this.pending[0]?.receiptId) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.shift();
    if (this.pending.length) this.pump();
    else onDelivery('received');
  }

  receive<T extends { id: string }>(
    type: AnnotationType, message: BeamMessage, changes: Changes<T>, apply: (upsert: T[], deleted: string[]) => void,
  ): void {
    const { room, documentId, broadcast } = this.options;
    if (message.roomCode !== room || !documentId) return;
    const revision = message.annotationRevision;
    const receiptId = typeof message.receiptId === 'string' && message.receiptId.length <= 128 ? message.receiptId : '';
    const version = typeof revision === 'number' && Number.isSafeInteger(revision) && revision > 0 && receiptId
      ? { revision, id: receiptId } : null;
    if (version) this.revision = Math.max(this.revision, version.revision);
    const shouldApply = (id: string) => {
      const previous = this.versions.get(`${type}:${id}`);
      if (!previous) return true;
      if (message.annotationSnapshot) return false;
      if (!version) return true; // Support live edits from peers that predate revision metadata.
      return version.revision > previous.revision || (version.revision === previous.revision && version.id > previous.id);
    };
    const upsert = Array.isArray(changes.upsert)
      ? changes.upsert.filter(item => item && typeof item.id === 'string' && shouldApply(item.id)) : [];
    const deleted = Array.isArray(changes.deleted) ? changes.deleted.filter(id => typeof id === 'string' && shouldApply(id)) : [];
    if (upsert.length || deleted.length) apply(upsert, deleted);
    if (version && !message.annotationSnapshot) {
      for (const id of [...upsert.map(item => item.id), ...deleted]) this.versions.set(`${type}:${id}`, version);
    }
    if (receiptId) {
      ignoreBenignRejection(broadcast({
        type: 'BEAM_ANNOTATION_ACK', roomCode: message.roomCode, sessionId: message.sessionId,
        annotationReceipt: { documentId, id: receiptId }, timestamp: Date.now(),
      }), 'beam-annotation-ack');
    }
  }

  private pump(): void {
    const head = this.pending[0];
    if (!head) return;
    if (!this.online) {
      this.options.onDelivery('waiting');
      return;
    }
    this.options.onDelivery('sending');
    this.scheduleRetry(head);
    this.transmit(head);
  }

  private scheduleRetry(head: BeamMessage): void {
    if (!this.online || this.pending[0] !== head) return;
    this.timer = setTimeout(() => {
      this.options.onDelivery('waiting');
      this.transmit(head);
      this.scheduleRetry(head);
    }, RETRY_MS);
  }

  private transmit(head: BeamMessage): void {
    // The transport assigns a fresh message ID, while the edit retains its receipt ID.
    void this.options.broadcast({ ...head, msgId: undefined, timestamp: Date.now() }).catch(() => {
      if (this.pending[0] === head && this.online) this.options.onDelivery('waiting');
    });
  }
}
