/**
 * Acoustic Feedback Engine using synthesized Web Audio API.
 * Zero-asset, 100% offline mechanical camera shutter click and haptic tone.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Synthesizes a dual-stage SLR mechanical shutter click sound.
 */
export function playShutterSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Stage 1: Initial Shutter Curtain Trip (Short sharp burst)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const filter1 = ctx.createBiquadFilter();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1400, now);
    osc1.frequency.exponentialRampToValueAtTime(180, now + 0.035);

    filter1.type = 'bandpass';
    filter1.frequency.setValueAtTime(2200, now);
    filter1.Q.setValueAtTime(3.0, now);

    gain1.gain.setValueAtTime(0.45, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.036);

    // Stage 2: Mechanical Blade Closure Click (60ms later)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    const filter2 = ctx.createBiquadFilter();

    const t2 = now + 0.055;
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(950, t2);
    osc2.frequency.exponentialRampToValueAtTime(80, t2 + 0.045);

    filter2.type = 'lowpass';
    filter2.frequency.setValueAtTime(1200, t2);

    gain2.gain.setValueAtTime(0.5, t2);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);

    osc2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(t2);
    osc2.stop(t2 + 0.046);
  } catch (e) {
    console.debug('Acoustic feedback omitted:', e);
  }
}
