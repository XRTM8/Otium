import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeamService } from './beamService';
import {
  clearRecentLanTargets,
  getRecentLanTargets,
  lanPairingCode,
  lanRoomCode,
  parseLanTarget,
  saveRecentLanTarget,
} from './beamLanTransport';

const native = vi.hoisted(() => {
  type Event = { type: string; message?: string };
  type Endpoint = { onmessage: (event: Event) => void };
  const endpoints = new Map<number, Endpoint>();
  const links = new Map<number, number>();
  const invitation = { addresses: ['192.168.1.93'], port: 50200, key: 'AB'.repeat(32) };
  let receiver = 0;
  const invoke = vi.fn(async (command: string, args: { id: number; events?: Endpoint; frame?: string }) => {
    switch (command) {
      case 'beam_lan_listen':
        receiver = args.id;
        endpoints.set(receiver, args.events!);
        return invitation;
      case 'beam_lan_connect':
        endpoints.set(args.id, args.events!);
        links.set(args.id, receiver);
        links.set(receiver, args.id);
        endpoints.get(receiver)?.onmessage({ type: 'connected' });
        args.events?.onmessage({ type: 'connected' });
        return;
      case 'beam_lan_send':
        endpoints.get(links.get(args.id)!)?.onmessage({ type: 'frame', message: args.frame });
        return;
      case 'beam_lan_stop': {
        const peer = links.get(args.id);
        if (peer !== undefined) {
          links.delete(peer);
          endpoints.get(peer)?.onmessage({ type: 'disconnected' });
        }
        links.delete(args.id);
        endpoints.delete(args.id);
      }
    }
  });
  return { invoke, invitation };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: native.invoke,
  Channel: class {
    readonly onmessage: (event: unknown) => void;
    constructor(onmessage: (event: unknown) => void) { this.onmessage = onmessage; }
  },
}));

const services: BeamService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.disconnect();
  vi.unstubAllGlobals();
});

describe('local-network Beam', () => {
  it('accepts only a local address and the full invitation key', () => {
    const target = { address: '192.168.1.93', port: 50200, key: 'AB'.repeat(32) };
    const code = lanPairingCode(target);
    expect(parseLanTarget(code)).toEqual(target);
    expect(parseLanTarget(code.toLowerCase())).toEqual(target);
    expect(parseLanTarget(code.replace('192.168.1.93', '8.8.8.8'))).toBeNull();
    expect(parseLanTarget(code.replace('50200', '65536'))).toBeNull();
    expect(parseLanTarget(code.slice(0, -1))).toBeNull();
  });

  it('pairs, delivers direct binary files, handles remote steps, and reconnects without external requests', async () => {
    const fetch = vi.fn(() => Promise.reject(new Error('WAN blocked')));
    const eventSource = vi.fn();
    const rtc = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('EventSource', eventSource);
    vi.stubGlobal('RTCPeerConnection', rtc);
    const receiver = new BeamService();
    const sender = new BeamService();
    services.push(sender, receiver);
    const target = { ...native.invitation, address: native.invitation.addresses[0]! };
    const room = lanRoomCode(target.key);
    const { port, key } = (await receiver.startLanReceiver(() => true))!;
    expect({ port, key }).toEqual({ port: target.port, key: target.key });
    const opened = vi.fn();
    const step = vi.fn();
    receiver.subscribe(async (message, transport) => {
      if (message.type === 'BEAM_PAYLOAD') opened(message.payload, transport);
      if (message.type === 'BEAM_STEP') step(message.direction);
    });
    await sender.startLanSender(target);
    await vi.waitFor(() => expect(sender.getPeerState().connected).toBe(true));
    const pdf = new TextEncoder().encode('%PDF-1.7 fixture').buffer;
    expect(await sender.sendDocument({ roomCode: room, buffer: pdf, title: 'Test PDF' })).toEqual({ mode: 'p2p' });
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ pdfData: pdf }), 'p2p');
    sender.sendStep('next');
    await vi.waitFor(() => expect(step).toHaveBeenCalledWith('next'));

    sender.disconnect();
    await vi.waitFor(() => expect(receiver.getPeerState().connected).toBe(false));
    await sender.startLanSender(target);
    await vi.waitFor(() => expect(sender.getPeerState().connected).toBe(true));
    const image = new Uint8Array(72_000).fill(17).buffer;
    expect(await sender.sendDocument({ roomCode: room, buffer: image, title: 'Image', fileName: 'picture.png' })).toEqual({ mode: 'p2p' });
    expect(opened).toHaveBeenLastCalledWith(expect.objectContaining({ fileData: image, fileName: 'picture.png' }), 'p2p');
    expect(fetch).not.toHaveBeenCalled();
    expect(eventSource).not.toHaveBeenCalled();
    expect(rtc).not.toHaveBeenCalled();
  });

  it('persists, deduplicates and clears recent LAN targets in localStorage', () => {
    localStorage.clear();
    expect(getRecentLanTargets()).toEqual([]);

    const target1 = { address: '192.168.1.10', port: 51000, key: '11'.repeat(32) };
    const target2 = { address: '192.168.1.20', port: 52000, key: '22'.repeat(32) };
    saveRecentLanTarget(target1);
    saveRecentLanTarget(lanPairingCode(target2));

    const recents = getRecentLanTargets();
    expect(recents).toHaveLength(2);
    expect(recents[0]?.address).toBe('192.168.1.20');
    expect(recents[1]?.address).toBe('192.168.1.10');

    // Deduplicate same address and port by moving it to the top
    saveRecentLanTarget(target1);
    const updated = getRecentLanTargets();
    expect(updated).toHaveLength(2);
    expect(updated[0]?.address).toBe('192.168.1.10');

    clearRecentLanTargets();
    expect(getRecentLanTargets()).toEqual([]);
  });
});
