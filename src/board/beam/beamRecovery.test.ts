import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { BeamMessage, BeamTransport } from '../types';
import { BeamService } from './beamService';
import type { BeamCompletionTracker } from './beamServiceHosts';
import { fetchRelayAttachmentBuffer } from './beamRelayTransport';
import type { BeamSignalingState } from './beamSignalingTransport';
import { bindBeamDataChannel, type BeamWebRtcHost } from './beamWebRtcTransport';
import { P2P_CHUNK_SIZE, RELAY_CHUNK_SIZE, type SendDocumentOptions } from './beamUtils';

const room = 'OTM-1234';
const sessionId = 'paired-session';

interface ServiceTransport {
  sigState: BeamSignalingState;
  peerSessionId: string | null;
  rtcDataChannel: RTCDataChannel | null;
  isRtcSupported: boolean;
  hosts: { rtcHost: () => BeamWebRtcHost };
  completions: BeamCompletionTracker;
  handleIncoming: (message: BeamMessage, via: BeamTransport) => Promise<void>;
  sendFileOverRelay: (options: SendDocumentOptions) => Promise<void>;
  putAttachment: (topic: string, chunk: ArrayBuffer, name: string) => Promise<string>;
}

const services: BeamService[] = [];

function paired(role: 'sender' | 'receiver') {
  const service = new BeamService();
  services.push(service);
  const transport = service as unknown as ServiceTransport;
  Object.assign(transport.sigState, { connectedRoom: room, activeRoomCode: room, role, sessionId: role === 'sender' ? sessionId : null });
  transport.peerSessionId = sessionId;
  return { service, transport };
}

function pdf(): ArrayBuffer {
  return new TextEncoder().encode('%PDF-1.4\nBeam recovery test\n%%EOF').buffer;
}

async function largePdf(streamLength: number): Promise<ArrayBuffer> {
  const document = await PDFDocument.create();
  document.addPage();
  const bytes = Uint8Array.from({ length: streamLength }, (_, index) => index % 251);
  document.context.register(document.context.stream(bytes));
  return Uint8Array.from(await document.save()).buffer;
}

function documentOptions(buffer: ArrayBuffer): SendDocumentOptions {
  return { roomCode: room, buffer, title: 'Lecture', pageNumber: 1, totalPages: 1, theme: 'paper' };
}

async function markReady(sender: ServiceTransport) {
  await sender.handleIncoming({ type: 'BEAM_READY', roomCode: room, sessionId, timestamp: 2 }, 'p2p');
}

function directLink(
  sender: ServiceTransport, receiver: ServiceTransport,
  shouldDrop: (data: string | ArrayBuffer, direction: 'sender' | 'receiver', close: () => void) => boolean = () => false,
) {
  const left = makeChannel('sender', () => right);
  const right = makeChannel('receiver', () => left);
  function close() {
    for (const channel of [left, right]) {
      Object.defineProperty(channel, 'readyState', { value: 'closed' });
      channel.onclose?.(new Event('close'));
    }
  }
  function makeChannel(direction: 'sender' | 'receiver', remote: () => RTCDataChannel): RTCDataChannel {
    return {
      readyState: 'open', bufferedAmount: 0, close: vi.fn(),
      send: (data: string | ArrayBuffer) => {
        if (shouldDrop(data, direction, close)) return;
        const other = remote();
        other.onmessage?.(new MessageEvent('message', { data }));
      },
    } as unknown as RTCDataChannel;
  }
  bindBeamDataChannel(sender.hosts.rtcHost(), left);
  bindBeamDataChannel(receiver.hosts.rtcHost(), right);
  return { left, right };
}

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
});

afterEach(() => {
  for (const service of services.splice(0)) service.disconnect();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Beam recovery', () => {
  it('routes an ink update and receipt through the active session using ordinary broadcast', async () => {
    const sender = paired('sender');
    const receiver = paired('receiver');
    const wire: Promise<void>[] = [];
    function channel(destination: ServiceTransport): RTCDataChannel {
      return {
        readyState: 'open',
        send: (json: string) => wire.push(destination.handleIncoming(JSON.parse(json), 'p2p')),
        close: vi.fn(),
      } as Partial<RTCDataChannel> as RTCDataChannel;
    }
    sender.transport.rtcDataChannel = channel(receiver.transport);
    receiver.transport.rtcDataChannel = channel(sender.transport);
    const gotInk = vi.fn();
    receiver.service.subscribe(message => { if (message.type === 'BEAM_INK_UPDATE') gotInk(message); });
    await sender.service.broadcast({
      type: 'BEAM_INK_UPDATE', roomCode: room, receiptId: 'ink-op',
      ink: { documentId: 'book', deleted: ['old-stroke'] }, timestamp: 1,
    });
    await Promise.all(wire);
    expect(gotInk).toHaveBeenCalledWith(expect.objectContaining({ sessionId, receiptId: 'ink-op' }));

    const ack = vi.fn();
    sender.service.subscribe(message => { if (message.type === 'BEAM_ANNOTATION_ACK') ack(message); });
    await sender.transport.handleIncoming({ type: 'BEAM_READY', roomCode: room, sessionId, timestamp: 2 }, 'p2p');
    await receiver.service.broadcast({
      type: 'BEAM_ANNOTATION_ACK', roomCode: room, annotationReceipt: { documentId: 'book', id: 'ink-op' }, timestamp: 3,
    });
    await Promise.all(wire);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ sessionId, annotationReceipt: { documentId: 'book', id: 'ink-op' } }));
  });

  it('confirms a replayed PDF transfer without asking the reader to open it again', async () => {
    const { service, transport } = paired('receiver');
    const broadcast = vi.spyOn(service, 'broadcast').mockResolvedValue(undefined);
    const open = vi.fn(async () => {});
    service.subscribe(message => message.type === 'BEAM_PAYLOAD' ? open() : undefined);
    const transfer: BeamMessage = {
      type: 'BEAM_PAYLOAD', roomCode: room, sessionId, timestamp: 1,
      payload: { transferId: 'same-pdf', pdfData: pdf(), title: 'Lecture', pageNumber: 1, totalPages: 1, theme: 'paper' },
    };
    await transport.handleIncoming({ ...transfer, msgId: 'first' }, 'relay');
    await transport.handleIncoming({ ...transfer, msgId: 'retry' }, 'relay');
    expect(open).toHaveBeenCalledOnce();
    expect(broadcast.mock.calls.map(([message]) => [message.type, message.transferId, message.ok])).toEqual([
      ['BEAM_DOCUMENT_RESULT', 'same-pdf', true],
      ['BEAM_DOCUMENT_RESULT', 'same-pdf', true],
    ]);
  });

  it('finishes uploading after signaling reconnects without changing the paired session', async () => {
    const { service, transport } = paired('sender');
    vi.spyOn(transport, 'putAttachment').mockImplementationOnce(async () => {
      transport.sigState.sourceGeneration++;
      return 'https://ntfy.sh/file/chunk';
    });
    vi.spyOn(service, 'broadcast').mockImplementation(async message => {
      if (message.type === 'BEAM_PAYLOAD' && message.payload?.transferId) {
        service.handleFileCompletion(message.payload.transferId, true);
      }
    });
    await expect(transport.sendFileOverRelay({
      roomCode: room, buffer: pdf(), title: 'Lecture', pageNumber: 1, totalPages: 1, theme: 'paper',
    })).resolves.toBeUndefined();
    expect(service.getTransferState()).toMatchObject({ phase: 'done', active: false });
  });

  it('resumes a direct PDF from the receiver-confirmed byte offset after a channel drops mid-file', async () => {
    const sender = paired('sender');
    const receiver = paired('receiver');
    await markReady(sender.transport);
    sender.transport.isRtcSupported = true;
    const buffer = await largePdf(P2P_CHUNK_SIZE * 2 + 19);
    const opened = vi.fn(async (data: ArrayBuffer) => {
      expect((await PDFDocument.load(data)).getPageCount()).toBe(1);
    });
    receiver.service.subscribe(message => message.type === 'BEAM_PAYLOAD' && message.payload?.pdfData
      ? opened(message.payload.pdfData) : undefined);
    let firstChannelChunks = 0;
    let resumedBytes = 0;
    const frames: Array<{ kind: string; offset?: number; transferId?: string }> = [];
    directLink(sender.transport, receiver.transport, (data, direction, close) => {
      if (direction !== 'sender' || typeof data === 'string') {
        if (typeof data === 'string') frames.push(JSON.parse(data));
        return false;
      }
      if (++firstChannelChunks === 1) return false;
      close();
      directLink(sender.transport, receiver.transport, next => {
        if (typeof next === 'string') frames.push(JSON.parse(next));
        else resumedBytes += next.byteLength;
        return false;
      });
      return true;
    });

    await expect(sender.service.sendDocument(documentOptions(buffer))).resolves.toEqual({ mode: 'p2p' });
    const begins = frames.filter(frame => frame.kind === 'file-begin');
    expect(begins.map(frame => frame.offset)).toEqual([0, P2P_CHUNK_SIZE]);
    expect(new Set(begins.map(frame => frame.transferId)).size).toBe(1);
    expect(resumedBytes).toBe(buffer.byteLength - P2P_CHUNK_SIZE);
    expect(opened).toHaveBeenCalledExactlyOnceWith(buffer);
  });

  it('confirms an already-open direct PDF after its completion frame is lost without resending bytes', async () => {
    const sender = paired('sender');
    const receiver = paired('receiver');
    await markReady(sender.transport);
    sender.transport.isRtcSupported = true;
    const opened = vi.fn(async () => {});
    receiver.service.subscribe(message => message.type === 'BEAM_PAYLOAD' ? opened() : undefined);
    let completionDropped = false;
    let resentBytes = 0;
    directLink(sender.transport, receiver.transport, (data, direction, close) => {
      if (direction !== 'receiver' || typeof data !== 'string' || JSON.parse(data).kind !== 'file-complete') return false;
      completionDropped = true;
      close();
      directLink(sender.transport, receiver.transport, next => {
        if (typeof next !== 'string') resentBytes += next.byteLength;
        return false;
      });
      return true;
    });

    await expect(sender.service.sendDocument(documentOptions(pdf()))).resolves.toEqual({ mode: 'p2p' });
    expect(completionDropped).toBe(true);
    expect(resentBytes).toBe(0);
    expect(opened).toHaveBeenCalledOnce();
  });

  it('reuses uploaded relay chunks on retry and the receiver recovers from a broken attachment body', async () => {
    const sender = paired('sender');
    const receiver = paired('receiver');
    await markReady(sender.transport);
    const buffer = await largePdf(RELAY_CHUNK_SIZE + 31);
    const uploads = new Map<string, ArrayBuffer>();
    const put = vi.spyOn(sender.transport, 'putAttachment').mockImplementation(async (topic, bytes) => {
      if (put.mock.calls.length === 2) throw new TypeError('Connection lost during upload');
      const url = `https://ntfy.sh/file/${topic}`;
      uploads.set(url, bytes);
      return url;
    });
    let brokenBody = false;
    vi.mocked(fetch).mockImplementation(async input => {
      const url = String(input);
      const bytes = uploads.get(url);
      if (!bytes) return new Response('');
      if (url.endsWith('_c1') && !brokenBody) {
        brokenBody = true;
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes.slice(0, 4)));
            controller.error(new TypeError('Connection lost while reading the chunk'));
          },
        }));
      }
      return new Response(bytes);
    });
    vi.spyOn(sender.service, 'broadcast').mockImplementation(async message => {
      if (message.type === 'BEAM_PAYLOAD') await receiver.transport.handleIncoming(message, 'relay');
    });
    vi.spyOn(receiver.service, 'broadcast').mockImplementation(async message => {
      await sender.transport.handleIncoming(message, 'relay');
    });
    const opened = vi.fn(async (bytes: ArrayBuffer) => {
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    });
    receiver.service.subscribe(async message => {
      const payload = message.payload;
      if (message.type !== 'BEAM_PAYLOAD' || !payload?.chunks) return;
      await opened(await receiver.service.downloadRelayChunks(payload.chunks, payload.totalSize, payload.sha256));
    });

    await expect(sender.service.sendDocument(documentOptions(buffer))).rejects.toThrow('Connection lost during upload');
    await expect(sender.service.sendDocument(documentOptions(buffer.slice(0)))).resolves.toEqual({ mode: 'relay' });
    expect(put).toHaveBeenCalledTimes(3);
    expect(put.mock.calls[1]?.[0]).toBe(put.mock.calls[2]?.[0]);
    expect(brokenBody).toBe(true);
    expect(opened).toHaveBeenCalledExactlyOnceWith(buffer);
  });

  it('rejects an oversized attachment body without retrying it', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array(9)));
    await expect(fetchRelayAttachmentBuffer('https://ntfy.sh/file/oversized', 8)).rejects.toThrow('transfer limit');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('republishes a relay manifest after a lost confirmation without reuploading or reopening the PDF', async () => {
    const sender = paired('sender');
    const receiver = paired('receiver');
    await markReady(sender.transport);
    const tracker = sender.transport.completions;
    const register = tracker.register.bind(tracker);
    vi.spyOn(tracker, 'register').mockImplementation((id, _timeout, message) => register(id, 50, message));
    const put = vi.spyOn(sender.transport, 'putAttachment').mockResolvedValue('https://ntfy.sh/file/chunk');
    const opened = vi.fn(async () => {});
    receiver.service.subscribe(message => message.type === 'BEAM_PAYLOAD' ? opened() : undefined);
    let replies = 0;
    const manifests: BeamMessage[] = [];
    vi.spyOn(sender.service, 'broadcast').mockImplementation(async message => {
      if (message.type !== 'BEAM_PAYLOAD') return;
      manifests.push(message);
      await receiver.transport.handleIncoming({ ...message, msgId: `manifest-${manifests.length}` }, 'relay');
    });
    vi.spyOn(receiver.service, 'broadcast').mockImplementation(async message => {
      if (message.type === 'BEAM_DOCUMENT_RESULT' && ++replies > 1) {
        await sender.transport.handleIncoming(message, 'relay');
      }
    });
    await expect(sender.service.sendDocument(documentOptions(pdf()))).resolves.toEqual({ mode: 'relay' });
    expect(replies).toBe(2);
    expect(manifests.map(message => message.payload?.transferId)).toEqual([
      expect.any(String), manifests[0]?.payload?.transferId,
    ]);
    expect(put).toHaveBeenCalledOnce();
    expect(opened).toHaveBeenCalledOnce();
  });
});
