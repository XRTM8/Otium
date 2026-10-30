import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import type { BeamMessage } from '../board/types';
import { beamService } from '../board/beam/beamService';

/** Delivery is confirmed by the other reader, never inferred from a successful send. */
export function useAnnotationDelivery(reader: ReaderController) {
  const [delivery, setDelivery] = useState<'local' | 'sending' | 'received' | 'waiting'>('local');
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    pending.current.clear();
    if (timer.current) clearTimeout(timer.current);
    setDelivery(reader.beamRoom ? 'waiting' : 'local');
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [reader.docId, reader.beamRoom, reader.beamPeerConnected]);
  useEffect(() => beamService.subscribe(message => {
    const receipt = message.annotationReceipt;
    if (message.type !== 'BEAM_ANNOTATION_ACK' || receipt?.documentId !== reader.docId || !pending.current.delete(receipt.id)) return;
    if (!pending.current.size) { if (timer.current) clearTimeout(timer.current); setDelivery('received'); }
  }), [reader.docId]);
  const send = useCallback((message: BeamMessage) => {
    if (!reader.beamPeerConnected) { setDelivery('waiting'); return; }
    const receiptId = crypto.randomUUID();
    pending.current.add(receiptId); setDelivery('sending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (pending.current.size) setDelivery('waiting'); }, 8000);
    void beamService.broadcast({ ...message, receiptId }).catch(() => setDelivery('waiting'));
  }, [reader.beamPeerConnected]);
  const acknowledge = useCallback((message: BeamMessage) => {
    if (!message.receiptId || message.receiptId.length > 128 || !reader.docId || !reader.beamPeerConnected) return;
    void beamService.broadcast({ type: 'BEAM_ANNOTATION_ACK', roomCode: message.roomCode,
      annotationReceipt: { documentId: reader.docId, id: message.receiptId }, timestamp: Date.now() });
  }, [reader.docId, reader.beamPeerConnected]);
  return { delivery, send, acknowledge };
}
