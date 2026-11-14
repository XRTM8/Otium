import { computeSha256, randomId, type SendDocumentOptions } from './beamUtils';

interface DocumentCheckpoint {
  session: string | null;
  metadata: string;
  buffer: ArrayBuffer | null;
  transferId: string;
  sha256: string | null;
  directAttempts: number;
  relayChunks: string[];
  relayStartedAt: number;
}

export type BeamDocumentAttempt = SendDocumentOptions & { checkpoint?: DocumentCheckpoint };

export async function prepareBeamDocument(
  session: string | null, options: SendDocumentOptions, previous?: DocumentCheckpoint,
): Promise<DocumentCheckpoint> {
  const sha256 = await computeSha256(options.buffer);
  const metadata = JSON.stringify([options.title, options.fileName, options.pageNumber, options.totalPages, options.theme, options.buffer.byteLength]);
  if (previous?.session === session && previous.metadata === metadata &&
      (sha256 ? previous.sha256 === sha256 : previous.buffer === options.buffer)) return previous;
  return {
    session, metadata, buffer: sha256 ? null : options.buffer, transferId: randomId('t'), sha256,
    directAttempts: 0, relayChunks: [], relayStartedAt: Date.now(),
  };
}
