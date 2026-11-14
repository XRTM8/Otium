import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeInk, type InkMark } from '../../core/annotations/ink';
import type { BeamMessage } from '../types';
import { BeamAnnotationQueue } from './beamAnnotationQueue';

const documentId = 'lesson';
const room = 'OTM-1234';
const stroke = (id: string, color = '#111111'): InkMark => ({
  id, color, type: 'pen', width: 0.004, page: 1, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }],
});

function ink(changes: Omit<NonNullable<BeamMessage['ink']>, 'documentId'>): BeamMessage {
  return { type: 'BEAM_INK_UPDATE', roomCode: room, ink: { documentId, ...changes }, timestamp: 0 };
}

function peer(initial: InkMark[]) {
  let marks = initial;
  const outgoing: BeamMessage[] = [];
  const onDelivery = vi.fn();
  const apply = vi.fn((upsert: InkMark[], deleted: string[]) => { marks = mergeInk(marks, upsert, deleted); });
  const queue = new BeamAnnotationQueue({
    documentId, room, onDelivery, broadcast: async message => { outgoing.push(message); },
  });
  return {
    queue, outgoing, onDelivery, apply,
    edit(message: BeamMessage) {
      marks = mergeInk(marks, message.ink?.upsert, message.ink?.deleted);
      queue.send(message);
    },
    receive(message: BeamMessage) {
      if (message.ink?.documentId === documentId) queue.receive('BEAM_INK_UPDATE', message, message.ink, apply);
      else queue.receiveReceipt(message);
    },
    get marks() { return marks; },
  };
}

afterEach(() => vi.useRealTimers());

describe('Beam annotation recovery', () => {
  it('replays an unconfirmed operation after a dropped receipt, then delivers offline edits in order', () => {
    vi.useFakeTimers();
    const original = stroke('original');
    const added = stroke('added');
    const edited = stroke('added', '#ff0000');
    const sender = peer([original]);
    const receiver = peer([original]);
    sender.queue.connect(true);
    sender.edit(ink({ upsert: [added] }));
    receiver.receive(sender.outgoing[0]!);
    expect(receiver.marks).toEqual([original, added]);

    // The receiver applied the operation, but its receipt never arrived.
    sender.queue.connect(false);
    sender.edit(ink({ upsert: [edited] }));
    sender.edit(ink({ deleted: [original.id] }));
    vi.advanceTimersByTime(16000);
    expect(sender.outgoing).toHaveLength(1);
    expect(sender.onDelivery).toHaveBeenLastCalledWith('waiting');

    sender.queue.connect(true);
    expect(sender.outgoing[1]?.receiptId).toBe(sender.outgoing[0]?.receiptId);
    receiver.receive(sender.outgoing[1]!);
    expect(receiver.apply).toHaveBeenCalledTimes(1);
    const receipt = receiver.outgoing[1]!;
    sender.receive({ ...receipt, roomCode: 'OTM-9999' });
    expect(sender.outgoing).toHaveLength(2);
    sender.receive(receipt);
    receiver.receive(sender.outgoing[2]!);
    sender.receive(receiver.outgoing[2]!);
    receiver.receive(sender.outgoing[3]!);
    sender.receive(receiver.outgoing[3]!);
    receiver.receive(sender.outgoing[0]!);
    receiver.receive({ ...ink({ upsert: [original] }), annotationSnapshot: true });

    expect(receiver.marks).toEqual([edited]);
    expect(sender.marks).toEqual(receiver.marks);
    expect(receiver.apply).toHaveBeenCalledTimes(3);
    expect(sender.onDelivery).toHaveBeenLastCalledWith('received');
    vi.advanceTimersByTime(16000);
    expect(sender.outgoing).toHaveLength(4);
  });

  it('retries while the peer still appears connected and converges concurrent edits of the same mark', () => {
    vi.useFakeTimers();
    const initial = stroke('shared');
    const a = peer([initial]);
    const b = peer([initial]);
    a.queue.connect(true);
    b.queue.connect(true);
    a.edit(ink({ deleted: [initial.id] }));
    b.edit(ink({ upsert: [stroke(initial.id, '#ff0000')] }));
    vi.advanceTimersByTime(8000);
    expect(a.outgoing[1]?.receiptId).toBe(a.outgoing[0]?.receiptId);
    expect(b.outgoing[1]?.receiptId).toBe(b.outgoing[0]?.receiptId);
    a.receive(b.outgoing[1]!);
    b.receive(a.outgoing[1]!);
    a.receive(b.outgoing[2]!);
    b.receive(a.outgoing[2]!);
    expect(a.marks).toEqual(b.marks);
    expect(a.apply.mock.calls.length + b.apply.mock.calls.length).toBe(1);
    expect(a.onDelivery).toHaveBeenLastCalledWith('received');
    expect(b.onDelivery).toHaveBeenLastCalledWith('received');
  });
});
