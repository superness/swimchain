/**
 * The fryers.
 *
 * The one rule this file exists to obey: CRISPNESS IS A LOOK, NOT A NUMBER.
 * A chip's leading-zero bits drive its colour, its silhouette, its blistering
 * and its edge — a raw chip is pale, puffy and soft-cornered; a done one is
 * dark, buckled and sharp; a golden one stops being food-coloured altogether.
 * There is no bar, no percentage and no "12/16" anywhere in here. A player
 * should know whether to pull a chip by squinting at it from across the room.
 */
import { useEffect, useMemo, useState } from 'react';
import type { FryerChip } from './lib/useFryers';
import { BANK_MIN_BITS } from './lib/chipsConst';
import type { ChipsState } from './lib/chipsEngine';
import { worthIfBankedNow } from './lib/chipsPayoutDisplay';
import { compact } from './lib/format';

/** xorshift32 — a chip's silhouette must be stable across every re-render, and
 *  every chip must look like a different chip. Keyed on its authoring-ms. */
function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export interface Crispness {
  /** 0 = batter, 1 = the golden threshold. Keeps climbing past 1. */
  crisp: number;
  golden: boolean;
  bankable: boolean;
  /** No hash reported yet — the chip is still going in. */
  raw: boolean;
}

/**
 * Bits alone move in discrete jumps that get exponentially rarer (8 -> 9 is
 * twice the work of everything before it), so a chip driven by bits ALONE
 * would visibly stall for minutes at a time and read as broken. `attempts`
 * fills the gap: expected work for the next bit is 2^(bits+1), and the fill
 * is `1 - e^(-attempts/expected)` — the actual probability that the next bit
 * WOULD have landed by now. That curve is the fidelity fix: the old version
 * was `min(1, attempts/expected)`, a hard cap that froze the entire visual
 * the moment a chip ran past its expected work — i.e. on every unlucky chip,
 * for as long as the bad luck lasted (minutes at high bits, measured live).
 * The asymptote keeps creeping forever instead; it slows, but it never
 * stops, and the tosses ticker (`WorthTag`) carries raw, unbounded fidelity
 * alongside it. Scaled by .95 so it can never overtake the next real bit.
 */
export function crispnessOf(chip: FryerChip, goldenBits: number): Crispness {
  if (chip.bits < 0) return { crisp: 0, golden: false, bankable: false, raw: true };
  const expected = Math.pow(2, chip.bits + 1);
  const micro = expected > 0 ? 1 - Math.exp(-chip.attempts / expected) : 0;
  const effective = chip.bits + micro * 0.95;
  return {
    crisp: Math.max(0, effective / Math.max(1, goldenBits)),
    golden: chip.bits >= goldenBits,
    bankable: chip.bits >= BANK_MIN_BITS,
    raw: false,
  };
}

function chipColors(crisp: number, golden: boolean) {
  if (golden) {
    return {
      light: 'hsl(50 100% 84%)',
      mid: 'hsl(43 98% 60%)',
      dark: 'hsl(33 92% 41%)',
      edge: 'hsl(28 88% 31%)',
    };
  }
  const t = Math.min(1, crisp);
  // The ramp is deliberately wide on BOTH lightness and saturation. A narrow
  // one (the first cut moved lightness only 36 points) makes a half-done chip
  // and a nearly-golden one look like the same chip under slightly different
  // light, which defeats the entire point of reading crispness off the object.
  // Raw still tops out at pale DOUGH, not paper. The first cut said that and
  // then set the ceiling at l 82 / light 88 anyway, which against the cream
  // splashback read as a white cut-out pasted over the scene — exactly what
  // this comment forbids. 74 is dough: clearly lighter than a fried chip, still
  // plainly a solid object sitting in oil. The dark end is unchanged, so the
  // full crisping ramp is only slightly shorter.
  const h = 46 - 20 * t;
  const s = 40 + 44 * t;
  const l = 74 - 38 * t;
  return {
    light: `hsl(${h} ${s}% ${Math.min(84, l + 9)}%)`,
    mid: `hsl(${h} ${s}% ${l}%)`,
    dark: `hsl(${h - 7} ${s + 8}% ${Math.max(15, l - 23)}%)`,
    edge: `hsl(${h - 13} ${s + 12}% ${Math.max(10, l - 33)}%)`,
  };
}

interface Geometry {
  outline: string;
  blisters: { x: number; y: number; r: number }[];
  salt: { x: number; y: number; r: number }[];
  fold: string;
}

/**
 * A tortilla chip: three corners, three curved sides. The BOW of those sides is
 * the whole trick — raw dough bulges outward and looks puffy and soft, a fried
 * chip pulls flat and then buckles inward with irregular, sharp edges. Same
 * geometry, opposite silhouette, driven only by crispness.
 */
function geometryFor(seed: number, crisp: number): Geometry {
  const rnd = seeded(seed);
  const cx = 50, cy = 53, R = 39;
  const corners: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = ((-90 + i * 120 + (rnd() - 0.5) * 16) * Math.PI) / 180;
    const r = R * (0.88 + rnd() * 0.24);
    corners.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }

  const t = Math.min(1.25, crisp);
  const bow = 13 - 19 * t;           // +13 puffy dough -> -11 buckled crisp
  let outline = `M ${corners[0][0].toFixed(2)} ${corners[0][1].toFixed(2)}`;
  for (let i = 0; i < 3; i++) {
    const [px, py] = corners[i];
    const [qx, qy] = corners[(i + 1) % 3];
    const mx = (px + qx) / 2, my = (py + qy) / 2;
    const nx = mx - cx, ny = my - cy;
    const nl = Math.hypot(nx, ny) || 1;
    const wob = (rnd() - 0.5) * 22 * t; // crisp chips warp; raw ones are smooth
    const ctlx = mx + (nx / nl) * bow + wob;
    const ctly = my + (ny / nl) * bow + (rnd() - 0.5) * 22 * t;
    outline += ` Q ${ctlx.toFixed(2)} ${ctly.toFixed(2)} ${qx.toFixed(2)} ${qy.toFixed(2)}`;
  }
  outline += ' Z';

  // Blistering: the bubbles that lift and brown as it fries. None on dough.
  const blisters: Geometry['blisters'] = [];
  const nb = Math.round(Math.min(1, crisp) * 11);
  for (let i = 0; i < nb; i++) {
    const w = [rnd(), rnd(), rnd()];
    const sum = w[0] + w[1] + w[2] || 1;
    const bx = (corners[0][0] * w[0] + corners[1][0] * w[1] + corners[2][0] * w[2]) / sum;
    const by = (corners[0][1] * w[0] + corners[1][1] * w[1] + corners[2][1] * w[2]) / sum;
    blisters.push({ x: bx, y: by, r: 1.6 + rnd() * 3.4 });
  }

  const salt: Geometry['salt'] = [];
  for (let i = 0; i < 7; i++) {
    const w = [rnd(), rnd(), rnd()];
    const sum = w[0] + w[1] + w[2] || 1;
    salt.push({
      x: (corners[0][0] * w[0] + corners[1][0] * w[1] + corners[2][0] * w[2]) / sum,
      y: (corners[0][1] * w[0] + corners[1][1] * w[1] + corners[2][1] * w[2]) / sum,
      r: 0.5 + rnd() * 0.8,
    });
  }

  // A single crease across the chip, so it reads as a solid object, not a blob.
  const f0 = corners[0], f1 = corners[2];
  const fmx = (f0[0] + f1[0]) / 2 + (rnd() - 0.5) * 10;
  const fmy = (f0[1] + f1[1]) / 2 + (rnd() - 0.5) * 10;
  const fold = `M ${(f0[0] * 0.72 + cx * 0.28).toFixed(2)} ${(f0[1] * 0.72 + cy * 0.28).toFixed(2)}`
    + ` Q ${fmx.toFixed(2)} ${fmy.toFixed(2)} ${(f1[0] * 0.72 + cx * 0.28).toFixed(2)} ${(f1[1] * 0.72 + cy * 0.28).toFixed(2)}`;

  return { outline, blisters, salt, fold };
}

export function Chip({ chip, goldenBits }: { chip: FryerChip; goldenBits: number }) {
  const c = crispnessOf(chip, goldenBits);
  // Re-cut the silhouette only when the LOOK changes materially, not on every
  // one of the ~4 worker messages a second — otherwise the chip jitters.
  const step = Math.round(c.crisp * 12);
  const geo = useMemo(() => geometryFor(chip.ms, step / 12), [chip.ms, step]);
  const col = chipColors(c.crisp, c.golden);
  const uid = `c${chip.ms.toString(36)}`;

  return (
    <svg
      className={`chip${c.raw ? ' is-batter' : ''}${c.bankable ? ' is-done' : ''}${c.golden ? ' is-golden' : ''}`}
      viewBox="0 0 100 100"
      role="img"
      aria-label={c.golden ? 'a golden chip' : c.bankable ? 'a chip that is done' : 'a pale chip, still frying'}
      style={{ ['--crisp' as string]: c.crisp.toFixed(3) }}
    >
      <defs>
        <radialGradient id={`${uid}f`} cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor={col.light} />
          <stop offset="55%" stopColor={col.mid} />
          <stop offset="100%" stopColor={col.dark} />
        </radialGradient>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="45%" stopColor="#fff8d8" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}c`}>
          <path d={geo.outline} />
        </clipPath>
      </defs>

      <path className="chip-shadow" d={geo.outline} />
      <path
        className="chip-body"
        d={geo.outline}
        fill={`url(#${uid}f)`}
        stroke={col.edge}
        strokeWidth={0.7 + c.crisp * 1.5}
        strokeLinejoin="round"
      />

      <g clipPath={`url(#${uid}c)`}>
        {geo.blisters.map((b, i) => (
          <circle
            key={i} cx={b.x} cy={b.y} r={b.r}
            fill={col.edge}
            opacity={Math.min(0.62, c.crisp * 0.7)}
          />
        ))}
        <path
          className="chip-fold" d={geo.fold} fill="none"
          stroke={col.dark} strokeWidth={1.1}
          opacity={0.16 + Math.min(0.4, c.crisp * 0.4)}
        />
        {geo.salt.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fffaf0" opacity={0.55} />
        ))}
        {/* The golden band is a THING THAT HAPPENS TO THE CHIP: a sheen sweeps
            across it, forever. No tooltip, no multiplier text. */}
        {c.golden && <rect className="chip-sheen" x="-120" y="-20" width="120" height="140" fill={`url(#${uid}s)`} />}
      </g>
    </svg>
  );
}

interface BasketProps {
  /** Position in the rack — the dip flight measures this exact basket. */
  index: number;
  chip: FryerChip;
  goldenBits: number;
  onBank: () => void;
  /** `null` for the handful of frames before the first fold lands — the
   *  worth line only ever appears once there is a real fold to ask. */
  state: ChipsState | null;
  nowMs: number;
}

/**
 * What this basket's chip would pay if lifted out THIS INSTANT — see
 * `worthIfBankedNow` (lib/chipsPayoutDisplay.ts) for why this is a live call
 * against the real fold rather than a restated formula, and why it can
 * legitimately change with no change to the chip (congeal, the bowl cap).
 */
function WorthTag({ chip, goldenBits, state, nowMs }: { chip: FryerChip; goldenBits: number; state: ChipsState | null; nowMs: number }) {
  const live = state ? worthIfBankedNow(state, chip.bits, nowMs) : null;
  if (!state) return null;
  // The raw work meter — the one figure that NEVER stalls. Crispness is
  // bounded below the next bit by honesty (it may only jump when a real bit
  // lands), so on an unlucky chip every bounded visual eventually slows to a
  // crawl; this counter is unbounded and ticks with every progress message
  // (~4/s), which is what makes a long golden grind read as "working", not
  // "hung". Updates every 16 attempts — the worker's report stride.
  // Full digits, never compact(): "104k" only changes once per ~1000
  // attempts, which would hand the ticker its own ten-second stalls at
  // exactly the counts where it matters most.
  const tosses = chip.attempts > 0
    ? <em className="tosses" aria-hidden="true">{chip.attempts.toLocaleString()} tosses of the basket</em>
    : <em className="tosses" aria-hidden="true">&nbsp;</em>;
  if (!live) {
    // Below BANK_MIN_BITS: worth NOTHING yet, not a misleading number — see
    // the file header. Matches "still pale" (Basket's own title/nudge copy).
    return <p className="worth worth-pale" aria-hidden="true">worth nothing — still pale{tosses}</p>;
  }
  const golden = chip.bits >= goldenBits;
  return (
    <p className={`worth${live.capped ? ' worth-capped' : ''}${golden ? ' worth-golden' : ''}`}>
      <strong>{compact(live.worth)}</strong> now
      {/* The actual decision being made every second this chip keeps frying:
       *  the fixed cost of one more bit is the fryer's time; the fixed
       *  benefit is that this number doubles. A static tag, not a recomputed
       *  "x2.4" or similar — the DOUBLING is the invariant fact, not a
       *  number worth calculating live alongside the worth itself. */}
      <em className="worth-next" aria-hidden="true">next bit ×2</em>
      {tosses}
    </p>
  );
}

function Basket({ chip, goldenBits, onBank, index, state, nowMs }: BasketProps) {
  const c = crispnessOf(chip, goldenBits);
  const bubbles = useMemo(() => {
    const rnd = seeded(chip.ms ^ 0x5bf03635);
    return Array.from({ length: 9 }, () => ({
      left: 8 + rnd() * 84,
      delay: rnd() * 2.6,
      dur: 1.5 + rnd() * 1.6,
      size: 3 + rnd() * 6,
    }));
  }, [chip.ms]);

  return (
    <div className="basket-slot">
      <button
        type="button"
        className={`basket${c.bankable ? ' ready' : ''}${c.golden ? ' golden' : ''}`}
        onClick={onBank}
        data-bits={chip.bits}
        data-fryer={index}
        data-attempts={chip.attempts}
        aria-label={
          c.golden ? 'Golden chip — lift it out'
            : c.bankable ? 'This chip is done — lift it out'
              : 'Still frying'
        }
        title={c.bankable ? 'lift it out' : 'still pale'}
      >
        <span className="basket-hook" aria-hidden="true" />
        <span className="oil" aria-hidden="true">
          {bubbles.map((b, i) => (
            <span
              key={i} className="bubble"
              style={{
                left: `${b.left}%`,
                width: `${b.size}px`, height: `${b.size}px`,
                animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`,
              }}
            />
          ))}
        </span>
        <span className="basket-chip" aria-hidden="true"><Chip chip={chip} goldenBits={goldenBits} /></span>
        <span className="mesh" aria-hidden="true" />
        {c.bankable && <span className="steam" aria-hidden="true"><i /><i /><i /></span>}
        <span className="tongs" aria-hidden="true">lift it out</span>
      </button>
      <WorthTag chip={chip} goldenBits={goldenBits} state={state} nowMs={nowMs} />
    </div>
  );
}

export interface KitchenProps {
  chips: FryerChip[];
  goldenBits: number;
  onBank: (index: number) => void;
  /** For the live "worth if banked now" tag — see `WorthTag`. `null` before
   *  the first fold lands. */
  state: ChipsState | null;
  nowMs: number;
}

export function Kitchen({ chips, goldenBits, onBank, state, nowMs }: KitchenProps) {
  // Nudge text when a player grabs at a chip that is still pale. Diegetic, and
  // it clears itself — this is a cook muttering, not an error dialog.
  const [nudge, setNudge] = useState<string | null>(null);
  useEffect(() => {
    if (!nudge) return;
    const t = setTimeout(() => setNudge(null), 2200);
    return () => clearTimeout(t);
  }, [nudge]);

  return (
    <section className="kitchen" aria-label="the fryers">
      <div className={`rack rack-${Math.min(4, Math.max(1, chips.length))}`}>
        {/* chips.map — NEVER Array.from({length: fryers}). Effects flush after
            render, so for one render chips.length is still the OLD count and an
            index-built list would read past the end. */}
        {chips.map((chip, i) => (
          <Basket
            key={chip.ms}
            index={i}
            chip={chip}
            goldenBits={goldenBits}
            state={state}
            nowMs={nowMs}
            onBank={() => {
              if (crispnessOf(chip, goldenBits).bankable) onBank(i);
              else setNudge('still pale — give it a minute');
            }}
          />
        ))}
      </div>

      {nudge && <p className="mutter" role="status">{nudge}</p>}
    </section>
  );
}

/** A chip travelling from its fryer down into the dip tunnel. */
export interface DipFlightState {
  key: number;
  ms: number;
  bits: number;
  x0: number; y0: number;
  x1: number; y1: number;
  /** The crumb counter's centre — where the crumb burst travels to. */
  cx1: number; cy1: number;
  size: number;
}

const CRUMBS = 7;

// Deterministic scatter: keyed on the chip's ms so a re-render cannot reshuffle
// crumbs mid-flight. Same reason the chip's own silhouette is seeded.
function crumbJitter(seed: number, i: number): { dx: number; dy: number } {
  const n = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453;
  const f = n - Math.floor(n);
  const a = f * Math.PI * 2;
  return { dx: Math.cos(a) * 26, dy: Math.sin(a) * 18 };
}

/**
 * The banked chip, arcing out of the basket and plunging into the dig front —
 * one more chip dipped into the current layer, one scratch deeper down the
 * tunnel. The crumb burst is the splash it makes going under.
 *
 * Fixed-position and pointer-events:none, so it is painted over the scene and
 * takes part in no layout — which is the point. The panel this replaced was a
 * flow child of a centred column, so showing it shoved the fryer upward and
 * under the hood.
 *
 * It is a flourish, not a progress bar: the credit already landed in the queue
 * the instant the chip was banked (see `onBank` in App.tsx), before this
 * component ever mounts. The flight runs 1.25s (DOM lifetime 1.4s so the
 * crumb burst isn't cut off mid-splash) purely to *pace the displayed
 * counter* — nothing here gates, delays, or reflects a real state change.
 */
export function DipFlight({ flight, goldenBits }: { flight: DipFlightState | null; goldenBits: number }) {
  if (!flight) return null;
  return (
    <>
      <div
        key={flight.key}
        className="dip-flight"
        aria-hidden="true"
        style={{
          '--fx0': `${flight.x0}px`, '--fy0': `${flight.y0}px`,
          '--fx1': `${flight.x1}px`, '--fy1': `${flight.y1}px`,
          '--fmx': `${(flight.x0 + flight.x1) / 2}px`,
          '--fmy': `${Math.min(flight.y0, flight.y1) - 70}px`,
          '--fs': `${flight.size}px`,
        } as React.CSSProperties}
      >
        <Chip chip={{ ms: flight.ms, bits: flight.bits, attempts: 0 }} goldenBits={goldenBits} />
      </div>

      <div key={`${flight.key}-ripple`} className="dip-ripple" aria-hidden="true" style={{
        '--fx1': `${flight.x1}px`, '--fy1': `${flight.y1}px`, '--fs': `${flight.size}px`,
      } as React.CSSProperties} />

      {Array.from({ length: CRUMBS }, (_, i) => {
        const j = crumbJitter(flight.ms, i);
        return (
          <div
            key={`${flight.key}-${i}`}
            className="dip-crumb"
            aria-hidden="true"
            style={{
              // The splash starts where the chip went UNDER — the entry point
              // itself, not the old "eaten" spot 46px above it: the chip is no
              // longer eaten, it dips in and keeps going down.
              '--cx0': `${flight.x1 + flight.size / 2}px`,
              '--cy0': `${flight.y1 + flight.size / 2}px`,
              '--cx1': `${flight.cx1 + j.dx}px`,
              '--cy1': `${flight.cy1 + j.dy}px`,
              animationDelay: `${0.78 + i * 0.012}s`,
            } as React.CSSProperties}
          />
        );
      })}

      {/* Pure presentation: a brief warm pulse on the crumb counter itself,
       * timed to land alongside the crumb burst, so the crumbs read as
       * arriving somewhere rather than just dissolving in transit. Keyed
       * off flight.key for the same reason the ripple and crumbs are — a
       * fresh mount per bank, so overlapping banks each get their own pulse
       * instead of reusing (and failing to retrigger) a stuck node. It has
       * no handler of any kind and touches no state; the credit already
       * landed before this ever renders. Hidden under reduced-motion
       * alongside .dip-ripple/.dip-crumb (styles.css). */}
      <div
        key={`${flight.key}-land`}
        className="crumb-land"
        aria-hidden="true"
        style={{ '--lx': `${flight.cx1}px`, '--ly': `${flight.cy1}px` } as React.CSSProperties}
      />
    </>
  );
}
