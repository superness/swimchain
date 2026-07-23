/**
 * The Trench — procedural ambient sound ("the deep").
 *
 * WebAudio-only, no assets: a very quiet layered ambience (filtered brown-noise rumble
 * + a slow LFO swell + a sparse random deep tone) plus a couple of soft interaction
 * cues (a low "thock" on build/tend/expedition submit, a warm two-tone on ceremony
 * beats). Everything here is best-effort and defensive — a storage-less or older
 * browser, or a browser that refuses `AudioContext` construction, degrades to silent
 * no-ops rather than throwing anywhere a caller might not expect it.
 *
 * Autoplay rules: the `AudioContext` (and every node in it) is only ever built lazily,
 * inside `start()`, which the UI calls from an actual user gesture (the landing "Play"
 * click, with a first-click-anywhere fallback for any other entry path) — never from
 * an effect that could fire before a gesture has happened.
 */

const STORAGE_KEY = 'trench-sound';

/** Reads the persisted mute preference. Default is ON (not muted) — absence of a
 *  stored value, a storage-less environment, or a corrupt value all fall back to
 *  "not muted" rather than silently opting the player out of the ambience. */
export function getStoredMutePreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'muted';
  } catch {
    return false;
  }
}

function persistMutePreference(muted: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? 'muted' : 'on');
  } catch {
    /* storage unavailable — preference just won't survive a reload */
  }
}

type AC = AudioContext;

interface AmbienceNodes {
  noiseSrc: AudioBufferSourceNode;
  rumbleGain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  deepToneTimer: ReturnType<typeof setTimeout> | null;
}

export interface AbyssAudioHandle {
  /** Idempotent — call from a user-gesture handler. No-ops if already started, muted,
   *  or WebAudio isn't available. */
  start: () => void;
  /** Persists the preference and tears the ambience graph fully down (suspends the
   *  context) when muting, rebuilds it when unmuting. */
  setMuted: (muted: boolean) => void;
  /** A tiny low percussive tick — build/tend/expedition submit. */
  thock: () => void;
  /** A warm two-tone chime — ceremony beats (kindling bloom, founding, tier shifts,
   *  a structure ruining). */
  chime: () => void;
  /** Full teardown — call on unmount. Safe to call more than once. */
  teardown: () => void;
}

/** A no-op handle — returned whenever WebAudio isn't available, so every call site
 *  can use `audioRef.current?.thock()` etc. without ever checking feature support
 *  itself. */
function silentHandle(): AbyssAudioHandle {
  const noop = () => {};
  return { start: noop, setMuted: noop, thock: noop, chime: noop, teardown: noop };
}

/** Renders one channel of brown ("red") noise via the classic leaky-integrator random
 *  walk, gain-compensated so its RMS lands in a sane range before the downstream gain
 *  node attenuates it further to ambience level. */
function makeBrownNoiseBuffer(ctx: AC, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

export function createAbyssAudio(): AbyssAudioHandle {
  const AudioCtor =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtor) return silentHandle();

  let ctx: AC | null = null;
  let muted = getStoredMutePreference();
  let nodes: AmbienceNodes | null = null;
  let torn = false;

  const safely = (fn: () => void): void => {
    try {
      fn();
    } catch {
      /* audio is decoration — never let a WebAudio quirk surface to the player */
    }
  };

  function scheduleDeepTone(target: AmbienceNodes, c: AC): void {
    const delay = 20_000 + Math.random() * 25_000; // every 20-45s
    target.deepToneTimer = setTimeout(() => {
      safely(() => {
        if (torn || muted || !ctx || c.state !== 'running') return;
        const freq = 60 + Math.random() * 30; // 60-90Hz
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = c.createGain();
        const now = c.currentTime;
        const attack = 3 + Math.random() * 2;
        const hold = 2;
        const release = 4 + Math.random() * 3;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.03, now + attack);
        g.gain.setValueAtTime(0.03, now + attack + hold);
        g.gain.linearRampToValueAtTime(0, now + attack + hold + release);
        osc.connect(g);
        g.connect(c.destination);
        osc.start(now);
        osc.stop(now + attack + hold + release + 0.5);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
      });
      if (nodes === target) scheduleDeepTone(target, c);
    }, delay);
  }

  function buildAmbience(c: AC): void {
    if (nodes) return;
    const noiseSrc = c.createBufferSource();
    noiseSrc.buffer = makeBrownNoiseBuffer(c, 4);
    noiseSrc.loop = true;

    const lowpass = c.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 120;

    const rumbleGain = c.createGain();
    rumbleGain.gain.value = 0.02;

    // Slow LFO swell on the rumble's own gain — a very gentle breathing tide, not a
    // tremolo (period is tens of seconds).
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.035; // ~29s period
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.01;
    lfo.connect(lfoGain);
    lfoGain.connect(rumbleGain.gain);

    noiseSrc.connect(lowpass);
    lowpass.connect(rumbleGain);
    rumbleGain.connect(c.destination);

    noiseSrc.start();
    lfo.start();

    const built: AmbienceNodes = { noiseSrc, rumbleGain, lfo, lfoGain, deepToneTimer: null };
    nodes = built;
    scheduleDeepTone(built, c);
  }

  function teardownAmbience(): void {
    if (!nodes) return;
    const n = nodes;
    nodes = null; // clear first so any in-flight deep-tone timer's `nodes === target` check fails
    if (n.deepToneTimer) clearTimeout(n.deepToneTimer);
    safely(() => n.noiseSrc.stop());
    safely(() => n.lfo.stop());
    safely(() => n.noiseSrc.disconnect());
    safely(() => n.lfo.disconnect());
    safely(() => n.lfoGain.disconnect());
    safely(() => n.rumbleGain.disconnect());
  }

  function ensureContext(): AC | null {
    if (torn) return null;
    if (!ctx) {
      safely(() => {
        ctx = new AudioCtor!();
      });
    }
    return ctx;
  }

  function start(): void {
    if (torn) return;
    const c = ensureContext();
    if (!c) return;
    safely(() => void c.resume());
    if (!muted) safely(() => buildAmbience(c));
  }

  function setMuted(next: boolean): void {
    muted = next;
    persistMutePreference(next);
    if (torn) return;
    if (next) {
      teardownAmbience();
      if (ctx) safely(() => void ctx!.suspend());
    } else {
      const c = ensureContext();
      if (!c) return;
      safely(() => void c.resume());
      safely(() => buildAmbience(c));
    }
  }

  function pluck(freq: number, delaySec: number, durationSec: number, peakGain: number): void {
    if (torn || muted || !ctx || ctx.state !== 'running') return;
    const c = ctx;
    safely(() => {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = c.createGain();
      const now = c.currentTime + delaySec;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peakGain, now + durationSec * 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.05);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    });
  }

  function thock(): void {
    // A tiny low percussive tick — well under startle range.
    pluck(72, 0, 0.09, 0.05);
  }

  function chime(): void {
    // A warm two-tone: a low note, a fifth above it a beat later.
    pluck(196, 0, 0.5, 0.035);
    pluck(294, 0.12, 0.6, 0.03);
  }

  function teardown(): void {
    if (torn) return;
    torn = true;
    teardownAmbience();
    if (ctx) {
      const c = ctx;
      ctx = null;
      safely(() => void c.close());
    }
  }

  return { start, setMuted, thock, chime, teardown };
}
