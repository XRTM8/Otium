import { useEffect, useMemo, useState } from 'react';
import type { ReaderController } from '../app/useReaderController';
import { BeamAnnotationQueue, type AnnotationDeliveryState } from '../board/beam/beamAnnotationQueue';
import { beamService } from '../board/beam/beamService';

export function useAnnotationDelivery(reader: ReaderController) {
  const { docId, beamRoom, beamPeerConnected } = reader;
  const key = JSON.stringify([docId, beamRoom]);
  const [status, setStatus] = useState<{ key: string; value: AnnotationDeliveryState }>();
  const queue = useMemo(() => new BeamAnnotationQueue({
    documentId: docId, room: beamRoom, broadcast: message => beamService.broadcast(message),
    onDelivery: value => setStatus({ key, value }),
  }), [docId, beamRoom, key]);

  useEffect(() => beamService.subscribe(message => queue.receiveReceipt(message)), [queue]);
  useEffect(() => {
    queue.connect(beamPeerConnected);
    return () => queue.connect(false, false);
  }, [beamPeerConnected, queue]);

  return { delivery: status?.key === key ? status.value : beamRoom ? 'waiting' as const : 'local' as const, queue };
}
