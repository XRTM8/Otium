import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { ThemeMode, ViewMode } from '../../core/types';
import { beamService } from './beamService';

interface AutoBeamDocument {
  doc: PDFDocumentProxy | null;
  docId: string; title: string; page: number; total: number; theme: ThemeMode; viewMode: ViewMode;
  room: string | null; role: 'sender' | 'receiver' | null; peerConnected: boolean; loading: boolean;
}

/** One automatic transfer per opened document; the latest file waits its turn. */
export function useAutoBeamDocument(options: AutoBeamDocument) {
  const latest = useRef(options);
  latest.current = options;
  const [transfer, setTransfer] = useState(() => beamService.getTransferState());
  const [error, setError] = useState<string | null>(null);
  const [wake, setWake] = useState(0);
  const attempt = useRef<string | null>(null);
  const busy = useRef(false);
  const { doc, docId, room, role, peerConnected, loading } = options;
  useEffect(() => beamService.onTransferProgress(setTransfer), []);
  useEffect(() => { setError(null); }, [docId, room]);
  useEffect(() => {
    if (!room || role !== 'sender' || !peerConnected) { attempt.current = null; return; }
    if (!doc || !docId || loading || transfer.active || busy.current) return;
    const key = `${room}:${docId}`;
    if (attempt.current === key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || busy.current) return;
      busy.current = true; attempt.current = key; setError(null);
      try {
        // Read directly from PDF.js: the library's IndexedDB save may still
        // be running immediately after opening a new or scanned document.
        const data = await doc.getData();
        const current = latest.current;
        if (cancelled || current.doc !== doc || current.room !== room || current.role !== 'sender' || !current.peerConnected || current.loading) {
          attempt.current = null; return;
        }
        const buffer = new Uint8Array(data).buffer;
        await beamService.sendDocument({ roomCode: room, buffer, title: current.title, pageNumber: current.page, totalPages: current.total, theme: current.theme });
        if (latest.current.docId === docId && latest.current.room === room) {
          beamService.sendViewMode(latest.current.viewMode);
          beamService.broadcastPageChange(latest.current.page);
        }
      } catch (cause) {
        if (latest.current.docId === docId && latest.current.room === room) setError(cause instanceof Error ? cause.message : 'The automatic transfer failed.');
      } finally {
        busy.current = false;
        setWake(value => value + 1);
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [doc, docId, room, role, peerConnected, loading, transfer.active, wake]);
  const retry = useCallback(() => { attempt.current = null; setError(null); setWake(value => value + 1); }, []);
  return { active: role === 'sender' && transfer.active, progress: transfer.progress, error, retry, dismiss: () => setError(null) };
}
