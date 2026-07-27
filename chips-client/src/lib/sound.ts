/**
 * The shop's sound — synthesized, entirely. No sample files, no downloads:
 * the same rule the visuals live by ("everything here is CSS/SVG") applied
 * to audio. Every voice is oscillators and filtered noise shaped by
 * envelopes, glued by one master compressor.
 *
 * The palette, and what each sound is FOR:
 *   - sizzle    the fryers, continuously. Presence, not information — it
 *               scales gently with fryer count and is mixed low enough to
 *               disappear under everything else.
 *   - dip()     the bank gesture: a grab tick, then a wet plop timed to the
 *               flight's entry into the dip (42% of its 1.25s), then the
 *               crumb-splash rattle at the same .78s the visual burst fires.
 *   - gain()    the payout chime, delayed to land WITH the floating "+N" —
 *               golden chips get a brighter, longer voice.
 *   - breakthrough()  the tier-up whump: sub swell + rumble + a rising
 *               sweep, sized to the DipChange flood it accompanies.
 *   - pop()     a jar coming off the shelf.
 *   - tap()     the dull "still pale" poke.
 *   - golden()  a quiet shimmer when a frying chip turns golden.
 *
 * AUTOPLAY: browsers refuse an AudioContext before a user gesture, so the
 * context is created lazily by `unlock()` (App wires it to the first
 * pointerdown/keydown) and every play call re-tries `resume()`. Until then
 * every call is a silent no-op — sound must never be load-bearing.
 *
 * MUTE persists per-origin under `chips.sound.v1`. Muting zeroes the master
 * gain rather than tearing the graph down, so unmuting is instant.
 */

const MUTE_KEY = 'chips.sound.v1';

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === 'muted'; } catch { return false; }
}

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mutedFlag = readMuted();

  private sizzleGain: GainNode | null = null;
  private sizzleTimer: number | null = null;
  private sizzleFryers = 0;

  /** Idempotent; call from a user gesture. Safe to call every gesture. */
  unlock(): void {
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
      } catch { return; }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.mutedFlag ? 0 : 0.5;
      // One compressor on the master is most of what "mixed" sounds like:
      // overlapping banks stack politely instead of clipping.
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 18;
      comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.16;
      // The analyser is the only reason an automated check (or a curious
      // player) can ever confirm audio is really flowing — WebAudio output
      // is otherwise unobservable from script. Costs nothing audible.
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = 512;
      this.master.connect(comp);
      comp.connect(this.analyser);
      this.analyser.connect(c.destination);
      (window as unknown as Record<string, unknown>).__sfxProbe = () => this.probe();
      this.applySizzle();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.applySizzle());
  }

  muted(): boolean { return this.mutedFlag; }

  setMuted(m: boolean): void {
    this.mutedFlag = m;
    try { localStorage.setItem(MUTE_KEY, m ? 'muted' : 'on'); } catch { /* private mode */ }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.04);
    }
    this.applySizzle();
  }

  /** How audio verification works — see the analyser comment above. */
  private probe(): { state: string; rms: number; sizzling: boolean } {
    let rms = 0;
    if (this.analyser) {
      const buf = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      for (const v of buf) rms += v * v;
      rms = Math.sqrt(rms / buf.length);
    }
    return { state: this.ctx?.state ?? 'none', rms, sizzling: this.sizzleTimer !== null };
  }

  /* ── shared plumbing ─────────────────────────────────────────────────── */

  private ready(): { c: AudioContext; out: GainNode } | null {
    if (!this.ctx || !this.master) return null;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.mutedFlag) return null;
    return { c: this.ctx, out: this.master };
  }

  private noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** One enveloped noise burst through a filter. The workhorse. */
  private burst(
    c: AudioContext, out: AudioNode, at: number,
    opts: { dur: number; type: BiquadFilterType; freq: number; q?: number; peak: number; attack?: number }
  ): void {
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(c, opts.dur + 0.05);
    const f = c.createBiquadFilter();
    f.type = opts.type; f.frequency.value = opts.freq; f.Q.value = opts.q ?? 0.8;
    const g = c.createGain();
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(opts.peak, at + a);
    g.gain.exponentialRampToValueAtTime(0.0005, at + opts.dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(at); src.stop(at + opts.dur + 0.05);
  }

  /** One enveloped oscillator, optionally gliding in pitch. */
  private tone(
    c: AudioContext, out: AudioNode, at: number,
    opts: { dur: number; from: number; to?: number; type?: OscillatorType; peak: number; attack?: number }
  ): void {
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.from, at);
    if (opts.to !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), at + opts.dur * 0.85);
    const g = c.createGain();
    const a = opts.attack ?? 0.004;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(opts.peak, at + a);
    g.gain.exponentialRampToValueAtTime(0.0005, at + opts.dur);
    o.connect(g); g.connect(out);
    o.start(at); o.stop(at + opts.dur + 0.05);
  }

  /* ── the sizzle ──────────────────────────────────────────────────────── */

  /** Called by App whenever the fryer count (or 0 for "stop") changes. */
  sizzle(fryers: number): void {
    this.sizzleFryers = Math.max(0, fryers);
    this.applySizzle();
  }

  private applySizzle(): void {
    const want = this.sizzleFryers > 0 && !this.mutedFlag && this.ctx?.state === 'running';
    if (!want) {
      if (this.sizzleTimer !== null) { clearInterval(this.sizzleTimer); this.sizzleTimer = null; }
      if (this.sizzleGain && this.ctx) {
        this.sizzleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      }
      return;
    }
    const c = this.ctx!;
    if (!this.sizzleGain) {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuffer(c, 2);
      src.loop = true;
      const band = c.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 5200; band.Q.value = 0.5;
      const hp = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      this.sizzleGain = c.createGain();
      this.sizzleGain.gain.value = 0;
      src.connect(band); band.connect(hp); hp.connect(this.sizzleGain);
      this.sizzleGain.connect(this.master!);
      src.start();
    }
    // The crackle: oil doesn't hiss steadily, it spits. A fast random walk
    // on the gain around the fryer-scaled base reads as frying, not static.
    if (this.sizzleTimer === null) {
      this.sizzleTimer = window.setInterval(() => {
        if (!this.ctx || !this.sizzleGain) return;
        const base = 0.014 * Math.sqrt(this.sizzleFryers);
        const flutter = base * (0.45 + Math.random() * 0.9);
        this.sizzleGain.gain.setTargetAtTime(flutter, this.ctx.currentTime, 0.05);
      }, 90);
    }
  }

  /* ── one-shots ───────────────────────────────────────────────────────── */

  /** The bank: grab now, plop at the flight's dip entry, splash with the
   *  crumb burst. Offsets mirror the CSS keyframes (styles.css dip-flight). */
  dip(): void {
    const r = this.ready(); if (!r) return;
    const { c, out } = r; const t = c.currentTime;
    // grab: a dry little snap off the basket
    this.burst(c, out, t, { dur: 0.05, type: 'highpass', freq: 3000, peak: 0.1 });
    this.tone(c, out, t, { dur: 0.06, from: 660, to: 880, type: 'triangle', peak: 0.05 });
    // plop: pitch-dropping body + a low thump, wet
    this.tone(c, out, t + 0.53, { dur: 0.16, from: 300, to: 82, peak: 0.22 });
    this.burst(c, out, t + 0.53, { dur: 0.12, type: 'lowpass', freq: 500, peak: 0.16 });
    // splash: a scatter of tiny high ticks, same instant the crumbs fly
    for (let i = 0; i < 5; i++) {
      this.burst(c, out, t + 0.78 + i * 0.035, {
        dur: 0.04, type: 'highpass', freq: 3800 + i * 500, peak: 0.05,
      });
    }
  }

  /** The payout, landing WITH its floating figure (delay in seconds). */
  gain(golden: boolean, delay: number): void {
    const r = this.ready(); if (!r) return;
    const { c, out } = r; const t = c.currentTime + Math.max(0, delay);
    if (golden) {
      for (const [i, f] of [880, 1320, 1760].entries()) {
        this.tone(c, out, t + i * 0.05, { dur: 0.5, from: f, peak: 0.07, attack: 0.008 });
      }
    } else {
      this.tone(c, out, t, { dur: 0.22, from: 660, peak: 0.07, attack: 0.006 });
      this.tone(c, out, t + 0.04, { dur: 0.26, from: 990, peak: 0.05, attack: 0.006 });
    }
  }

  /** Tier-up: the floor gives way. Sized to the 5.2s flood, front-loaded. */
  breakthrough(): void {
    const r = this.ready(); if (!r) return;
    const { c, out } = r; const t = c.currentTime;
    this.tone(c, out, t, { dur: 0.9, from: 48, to: 30, peak: 0.4, attack: 0.02 });
    this.burst(c, out, t, { dur: 0.8, type: 'lowpass', freq: 180, peak: 0.28, attack: 0.02 });
    // the new layer rushing up past you
    this.burst(c, out, t + 0.1, { dur: 1.4, type: 'bandpass', freq: 900, q: 1.4, peak: 0.1, attack: 0.35 });
    this.tone(c, out, t + 0.35, { dur: 1.1, from: 180, to: 620, type: 'sine', peak: 0.05, attack: 0.3 });
  }

  /** A jar off the shelf. */
  pop(): void {
    const r = this.ready(); if (!r) return;
    const { c, out } = r; const t = c.currentTime;
    this.tone(c, out, t, { dur: 0.09, from: 190, to: 560, type: 'square', peak: 0.06 });
    this.burst(c, out, t, { dur: 0.03, type: 'highpass', freq: 2400, peak: 0.09 });
  }

  /** The dull "still pale" poke. */
  tap(): void {
    const r = this.ready(); if (!r) return;
    const { c, out } = r; const t = c.currentTime;
    this.tone(c, out, t, { dur: 0.08, from: 150, to: 110, peak: 0.11 });
  }

  /** A chip in the oil turning golden — quiet; it happens unprompted. */
  golden(): void {
    const r = this.ready(); if (!r) return;
    const { c, out } = r; const t = c.currentTime;
    this.tone(c, out, t, { dur: 0.4, from: 1980, peak: 0.035, attack: 0.01 });
    this.tone(c, out, t + 0.07, { dur: 0.45, from: 2640, peak: 0.025, attack: 0.01 });
  }
}

export const sfx = new Sfx();
