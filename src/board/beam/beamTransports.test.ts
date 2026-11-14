import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeBeamRtcPeer,
  handleBeamRtcAnswer,
  handleBeamRtcIce,
  type BeamWebRtcState,
} from './beamWebRtcTransport';
import { extractMessagesFromRelayEvent, fetchRelayWithRetry } from './beamRelayTransport';

function makeRtcState(overrides: Partial<BeamWebRtcState> = {}): BeamWebRtcState {
  return {
    isRtcSupported: true,
    rtcPeer: null,
    rtcDataChannel: null,
    remoteDescriptionSet: false,
    queuedIce: [],
    rtcAttempt: 0,
    lastOfferSdp: null,
    incomingFile: null,
    ...overrides,
  };
}

describe('beamWebRtcTransport & beamRelayTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('queues early ICE candidates until remote description is set and flushes on answer', async () => {
    const addIceCandidate = vi.fn(async () => {});
    const setRemoteDescription = vi.fn(async () => {});
    const mockPeer = {
      signalingState: 'have-local-offer',
      setRemoteDescription,
      addIceCandidate,
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    vi.stubGlobal('RTCSessionDescription', function (init: RTCSessionDescriptionInit) {
      return init;
    });
    vi.stubGlobal('RTCIceCandidate', function (init: RTCIceCandidateInit) {
      return init;
    });

    const state = makeRtcState({ rtcPeer: mockPeer, remoteDescriptionSet: false });
    await handleBeamRtcIce(state, {
      type: 'BEAM_RTC_ICE',
      roomCode: '1234',
      candidate: { candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host' },
      timestamp: Date.now(),
    });
    expect(state.queuedIce).toHaveLength(1);
    expect(addIceCandidate).not.toHaveBeenCalled();

    await handleBeamRtcAnswer(state, {
      type: 'BEAM_RTC_ANSWER',
      roomCode: '1234',
      sdp: { type: 'answer', sdp: 'v=0' },
      timestamp: Date.now(),
    });

    expect(setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(state.remoteDescriptionSet).toBe(true);
    expect(addIceCandidate).toHaveBeenCalledTimes(1);
    expect(state.queuedIce).toHaveLength(0);

    closeBeamRtcPeer(state);
    expect(state.rtcPeer).toBeNull();
    expect(mockPeer.close).toHaveBeenCalledTimes(1);
  });

  it('parses inline JSON beam relay events and rejects untrusted relay URLs', async () => {
    const events = await extractMessagesFromRelayEvent(
      {
        message: JSON.stringify({
          type: 'BEAM_SYNC_PAGE',
          roomCode: '9988',
          pageNumber: 7,
          timestamp: Date.now(),
        }),
      },
      {
        role: 'receiver',
        peerSessionId: 'peer-1',
        connectedRoom: '9988',
        fetchText: vi.fn(async () => ''),
      }
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.pageNumber).toBe(7);

    await expect(fetchRelayWithRetry('https://evil.example.com/payload.json', 1)).rejects.toThrow();
  });
});
