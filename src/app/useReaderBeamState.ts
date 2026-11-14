import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnnotationRect, TextAnnotation } from '../core/types';
import { validSelectionRects } from '../core/annotations/textSync';
import { beamService } from '../board/beam/beamService';

/** Subscribes to Beam connection/peer state and remote text selection highlights. */
export function useReaderBeamState(docId: string) {
  const [beamState, setBeamState] = useState<{ room: string | null; role: 'receiver' | 'sender' | null }>({
    room: beamService.getConnectedRoom(),
    role: beamService.getRole(),
  });
  const [beamPeerConnected, setBeamPeerConnected] = useState(beamService.getPeerState().connected);
  const beamSelectionKey = `${docId}:${beamPeerConnected ? 1 : 0}`;
  const [beamSelectionState, setBeamSelectionState] = useState<{
    key: string;
    value: TextAnnotation | null;
  }>({ key: beamSelectionKey, value: null });
  const beamSelection = beamSelectionState.key === beamSelectionKey ? beamSelectionState.value : null;
  const beamSelectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const receiveBeamSelection = useCallback(
    (page: number, rects: AnnotationRect[]) => {
      if (beamSelectionTimer.current) clearTimeout(beamSelectionTimer.current);
      if (!Number.isInteger(page) || page < 1 || !validSelectionRects(rects)) return;
      const value: TextAnnotation | null = rects.length
        ? { id: '__beam_selection', pageNumber: page, rects, type: 'highlight', color: '#38bdf8', text: '', createdAt: Date.now() }
        : null;
      setBeamSelectionState({ key: beamSelectionKey, value });
      beamSelectionTimer.current = setTimeout(() => {
        setBeamSelectionState((prev) => (prev.key === beamSelectionKey ? { key: beamSelectionKey, value: null } : prev));
      }, 6000);
    },
    [beamSelectionKey]
  );

  useEffect(() => {
    return () => {
      if (beamSelectionTimer.current) clearTimeout(beamSelectionTimer.current);
    };
  }, []);

  useEffect(() => beamService.onPeerChange((peer) => setBeamPeerConnected(peer.connected)), []);
  useEffect(() => beamService.onStateChange((state) => setBeamState(state)), []);

  return {
    beamState,
    beamPeerConnected,
    beamSelection,
    receiveBeamSelection,
  };
}
