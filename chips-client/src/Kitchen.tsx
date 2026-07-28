/**
 * The fryers — pot × multi edition (spec verbatim in lib/cooking.ts).
 *
 * The rules this file obeys:
 *   - THE POT IS ALWAYS MOVING. The number under the chip climbs on every
 *     tick; nothing on this screen is ever frozen.
 *   - CRACKLES ARE MOMENTS. When the multiplier jumps the basket flashes,
 *     the chip visibly crisps a stage, and the ×N badge slams in. A player
 *     looking away should hear it and look back.
 *   - THE CHIP'S LOOK IS ITS MULTI. Same silhouette engine as ever — pale
 *     and puffy at ×1, dark and buckled by ×16, gold at the top. No bars.
 */
import { useMemo } from 'react';
import { multiOf, isGolden, worthOf, MAX_CRACKLES, type CookingChip } from './lib/cooking';
import { RatArt } from './Crew';
import { compact } from './lib/format';

/** What the chip SVG renders from — a purely visual shape since the miner
 *  retired; `bits` here is an art dial, not a proof. */
export interface VisualChip {
  ms: number;
  bits: number;
  attempts: number;
}

/** Crackle count -> the art dial. 16 is where the golden look begins in
 *  chipColors/crispnessOf, so the terminal crackle goes gold exactly. */
const CRACKLE_BITS = [9, 11, 12, 13, 14, 16] as const;
const GOLD_AT = 16;

export function visualFor(chip: Pick<CookingChip, 'ms' | 'crackles'>): VisualChip {
  const bits = CRACKLE_BITS[Math.max(0, Math.min(MAX_CRACKLES, chip.crackles))];
  return { ms: chip.ms, bits, attempts: 2 ** (bits + 1) };
}

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
  crisp: number;
  golden: boolean;
  raw: boolean;
}

/** The art dial: crackle level fills the same 0..1 crisp range the old game
 *  drove with proof bits, so the whole silhouette/colour engine carries over
 *  untouched. */
export function crispnessOf(chip: VisualChip): Crispness {
  if (chip.bits < 0) return { crisp: 0, golden: false, raw: true };
  const expected = 2 ** (chip.bits + 1);
  const micro = expected > 0 ? 1 - Math.exp(-chip.attempts / expected) : 0;
  const effective = chip.bits + micro * 0.95;
  return {
    crisp: Math.max(0, effective / GOLD_AT),
    golden: chip.bits >= GOLD_AT,
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
 * A tortilla chip: three corners, three curved sides. Raw dough bulges
 * outward and looks puffy; a cooked chip pulls flat and buckles inward with
 * sharp edges. Same geometry engine as the proof-of-work era — the dial that
 * drives it changed, the art did not.
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
  const bow = 13 - 19 * t;
  let outline = `M ${corners[0][0].toFixed(2)} ${corners[0][1].toFixed(2)}`;
  for (let i = 0; i < 3; i++) {
    const [px, py] = corners[i];
    const [qx, qy] = corners[(i + 1) % 3];
    const mx = (px + qx) / 2, my = (py + qy) / 2;
    const nx = mx - cx, ny = my - cy;
    const nl = Math.hypot(nx, ny) || 1;
    const wob = (rnd() - 0.5) * 22 * t;
    const ctlx = mx + (nx / nl) * bow + wob;
    const ctly = my + (ny / nl) * bow + (rnd() - 0.5) * 22 * t;
    outline += ` Q ${ctlx.toFixed(2)} ${ctly.toFixed(2)} ${qx.toFixed(2)} ${qy.toFixed(2)}`;
  }
  outline += ' Z';

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

  const f0 = corners[0], f1 = corners[2];
  const fmx = (f0[0] + f1[0]) / 2 + (rnd() - 0.5) * 10;
  const fmy = (f0[1] + f1[1]) / 2 + (rnd() - 0.5) * 10;
  const fold = `M ${(f0[0] * 0.72 + cx * 0.28).toFixed(2)} ${(f0[1] * 0.72 + cy * 0.28).toFixed(2)}`
    + ` Q ${fmx.toFixed(2)} ${fmy.toFixed(2)} ${(f1[0] * 0.72 + cx * 0.28).toFixed(2)} ${(f1[1] * 0.72 + cy * 0.28).toFixed(2)}`;

  return { outline, blisters, salt, fold };
}

export function Chip({ chip }: { chip: VisualChip }) {
  const c = crispnessOf(chip);
  const step = Math.round(c.crisp * 12);
  const geo = useMemo(() => geometryFor(chip.ms, step / 12), [chip.ms, step]);
  const col = chipColors(c.crisp, c.golden);
  const uid = `c${chip.ms.toString(36)}`;

  return (
    <svg
      className={`chip${c.raw ? ' is-batter' : ''}${c.golden ? ' is-golden' : ''}`}
      viewBox="0 0 100 100"
      role="img"
      aria-label={c.golden ? 'a golden chip' : 'a chip cooking'}
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
        {c.golden && <rect className="chip-sheen" x="-120" y="-20" width="120" height="140" fill={`url(#${uid}s)`} />}
      </g>
    </svg>
  );
}

/** The cheese rat, latched to this basket. `gorge` scales his cheeks;
 *  `chompKey` replays the crackle-eaten flash. Clicking him is the SHOO. */
export interface RatPerch {
  gorge: number;
  hoard: number;
  chompKey: number | null;
}

/** Feed mode: a vendor is waiting to be paid in chips. 'golden' means only
 *  a golden chip settles the bill (the angel). */
export type FeedMode = 'any' | 'golden' | null;

interface BasketProps {
  index: number;
  chip: CookingChip;
  onDip: () => void;
  /** Timestamp of this basket's latest crackle — keys the flash animation so
   *  every crackle replays it (same fresh-mount trick as the dip flight). */
  crackledAt: number | null;
  /** Latest tick's gain, keyed by timestamp — the "+500" floater. */
  tickFx: { at: number; amount: number } | null;
  /** How many crumbs the bowl can still take — a dip past this SPILLS, and
   *  the designer review demanded the warning land BEFORE the dip, not
   *  after ("punished by information the game withheld"). */
  capRoom: number;
  rat: RatPerch | null;
  onShoo: () => void;
  feedMode: FeedMode;
  /** The angel just blessed this fryer — keyed mark until the crackle. */
  blessedAt: number | null;
  /** The wing is perched here (pays double), keyed by its landing time. */
  wingAt: number | null;
  /** The strings are pointing here (pays extra while the window is open). */
  prophesied: boolean;
  /** This fryer's flame is lit — its pot burns for faster crackles. */
  overcooking: boolean;
  /** Tap the flame. `null` when overcooking is not owned. */
  onOvercook: (() => void) | null;
  /** Top of this player's crackle ladder — GOLDEN normally, one higher with
   *  The Long Fry. Golden and topped-out stopped being the same thing. */
  ceiling: number;
  /** Whistle the wing over here. `null` when A Reason is not owned. */
  onWingCall: (() => void) | null;
  /** Seconds left on the call cooldown; 0 when it will answer.
   *
   *  THIS WAS A BOOLEAN AND THE BUTTON WAS `disabled` (operator, 2026-07-28:
   *  "no sound or visuals - just nothing happens"). A disabled control eats
   *  the tap silently — the browser fires no click, so there was nowhere to
   *  put feedback even if we had wanted to. Worse, the only cue was opacity
   *  .35 on a 12px glyph, which is not a cue. The number is now ON the
   *  button, so the answer is visible without tapping at all. */
  wingCoolS: number;
  /** Timestamp of a REFUSED tap on this basket's whistle — keys the shake. */
  wingNope: number | null;
}

function Basket({ chip, onDip, index, crackledAt, tickFx, capRoom, rat, onShoo, feedMode, blessedAt, wingAt, prophesied, overcooking, onOvercook, ceiling, onWingCall, wingCoolS, wingNope }: BasketProps) {
  const golden = isGolden(chip);
  /** Nothing left to cook FOR — distinct from `golden` since The Long Fry.
   *  A golden chip with the jar still has a sixth crackle ahead of it, and
   *  that stretch is precisely what the burner is for. */
  const topped = chip.crackles >= ceiling;
  const multi = multiOf(chip);
  const worth = worthOf(chip);
  const spills = worth > capRoom;
  // In golden feed mode only a golden chip settles the bill — the others dim.
  const feedable = feedMode !== null && chip.pot > 0 && (feedMode === 'any' || golden);
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
      {/* THE WELL. Every overlay below is trying to sit on the FRYER, but they
          were absolutely positioned against `.basket-slot`, which is the fryer
          PLUS the worth caption under it. Top-anchored ones worked by accident
          (the basket starts at the slot's top edge); anything bottom-anchored
          measured from below the caption and could only be placed by
          hand-tuned offsets — which is how the burner ended up in the wing's
          corner. The well is exactly the button's box, so `bottom: 0` means
          the bottom of the fryer and nothing has to be guessed. */}
      <div className="basket-well">
      <button
        type="button"
        className={`basket ready${golden ? ' golden' : ''}${feedMode !== null ? (feedable ? ' feed-target' : ' feed-dim') : ''}`}
        onClick={onDip}
        data-fryer={index}
        data-crackles={chip.crackles}
        aria-label={feedMode !== null
          ? (feedable ? `Chip worth ${compact(worth)} — feed it` : 'not the chip they want')
          : golden
            ? `Golden chip worth ${compact(worth)} — dip it`
            : `Chip worth ${compact(worth)} at times ${multi} — dip it`}
        title={feedMode !== null ? (feedable ? 'feed it' : 'not this one') : 'dip it'}
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
        <span className="basket-chip" aria-hidden="true"><Chip chip={visualFor(chip)} /></span>
        <span className="mesh" aria-hidden="true" />
        {golden && <span className="steam" aria-hidden="true"><i /><i /><i /></span>}
        {crackledAt !== null && <span key={crackledAt} className="crackle-flash" aria-hidden="true" />}
        {/* The crackle's WAKE: a banner that lingers ~3.5s, so eyes that were
            elsewhere still learn what happened (designer review: ten crackles
            witnessed, zero seen — the moment needs residue). */}
        {crackledAt !== null && chip.crackles > 0 && (
          <span key={`b${crackledAt}`} className={`crackle-banner m${chip.crackles}`} aria-hidden="true">
            CRACKLED ×{multi}{golden ? ' — GOLDEN!' : '!'}
          </span>
        )}
        {tickFx && <span key={`t${tickFx.at}`} className={`tick-float${rat ? ' to-rat' : ''}`} aria-hidden="true">+{compact(tickFx.amount)}</span>}
        <span className="tongs" aria-hidden="true">{feedMode !== null && feedable ? 'feed it' : 'dip it'}</span>
      </button>

      {/* The cheese rat, latched on. His own button, so a shoo can never be a
          misdip: the click stops here. The chomp flash replays per eaten
          crackle via its key. The badge says what he TOOK and what a shoo
          PAYS — the review read the old unlabeled counter as a bonus pet. */}
      {rat && (
        <button
          type="button"
          className="rat-perch"
          onClick={(e) => { e.stopPropagation(); onShoo(); }}
          title={`shoo the rat — he pays ${compact(Math.floor(rat.hoard * rat.gorge))}`}
          aria-label={`the cheese rat is banking this fryer's ticks — shoo him for ${compact(Math.floor(rat.hoard * rat.gorge))}`}
        >
          <RatArt gorge={rat.gorge} />
          <span className="rat-hoard">
            <i className="rat-took">took {compact(rat.hoard)}</i>
            <i className="rat-pays">shoo → {compact(Math.floor(rat.hoard * rat.gorge))}</i>
          </span>
          <span className="rat-shoo" aria-hidden="true">shoo him!</span>
          {rat.chompKey !== null && (
            <span key={rat.chompKey} className="rat-chomp" aria-hidden="true">ate the crackle</span>
          )}
        </button>
      )}

      {/* Her mark — mounts on the click, outlives the crackle it forces, so
          the x2 that lands moments later is visibly HERS. */}
      {blessedAt !== null && (
        <span key={blessedAt} className="bless-mark" aria-hidden="true">blessed — watch it</span>
      )}

      {/* THE WING sits where it hurts — a basket it is on pays double, and
          the only skill is noticing it moved. */}
      {wingAt !== null && (
        <span key={wingAt} className="wing-perch" aria-label="the wing is on this basket — it pays double">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path d="M34 30 Q60 18 72 44 Q80 64 62 78 Q46 88 36 74 Q24 56 34 30 Z" fill="#d96c2a" />
            <circle cx="34" cy="28" r="7" fill="#f5efe3" />
            <circle cx="44" cy="22" r="7" fill="#f5efe3" />
            <circle cx="52" cy="56" r="2.4" fill="#3a1c08" />
            <circle cx="62" cy="56" r="2.4" fill="#3a1c08" />
          </svg>
          <i>pays double</i>
        </span>
      )}

      {/* THE WHISTLE (A Reason). Only on baskets the wing is NOT on, so it
          can never share a corner with the perch above — the two are mutually
          exclusive by construction rather than by hand-tuned offsets. */}
      {onWingCall && wingAt === null && (
        <button
          type="button"
          // Re-keyed on every refusal so the shake animation replays; a class
          // toggle alone would only ever animate the first rejected tap.
          key={wingNope ?? 'ready'}
          className={`wing-call${wingCoolS > 0 ? ' cooling' : ''}${wingNope !== null ? ' nope' : ''}`}
          onClick={(e) => { e.stopPropagation(); onWingCall(); }}
          title={wingCoolS > 0
            ? `it is not listening yet — ${wingCoolS}s`
            : 'call the wing over — it pays double where it sits'}
          aria-label={wingCoolS > 0
            ? `the wing will not answer for another ${wingCoolS} seconds`
            : 'call the wing to this fryer'}
        >
          <span aria-hidden="true">{wingCoolS > 0 ? wingCoolS : '✦'}</span>
        </button>
      )}

      {/* Not on a topped-out chip: the haste lives inside `crackles < ceiling`,
          so a chip at the top gets no benefit while the drain still runs a
          full tick before the auto-extinguish fires — measured at ~30k crumbs
          burned per tap. NOTE this is `topped`, not `golden`: with The Long
          Fry a golden chip still has one crackle to chase, and burning for it
          is the decision that jar exists to create. */}
      {onOvercook && !topped && (
        <button
          type="button"
          className={`burner${overcooking ? ' lit' : ''}`}
          onClick={(e) => { e.stopPropagation(); onOvercook(); }}
          title={overcooking ? 'stop overcooking' : 'overcook this fryer — burns the pot, crackles sooner'}
          aria-label={overcooking ? 'stop overcooking this fryer' : 'overcook this fryer'}
          aria-pressed={overcooking}
        >
          <span aria-hidden="true">🔥</span>
        </button>
      )}

      </div>

      {/* Deliberately OUTSIDE the well: the strings' label is a wide pill and
          the burner now owns the fryer's bottom centre. Anchored to the slot,
          it hangs below the caption exactly where it always has. */}
      {prophesied && (
        <span className="prophecy-mark" aria-label="the oracle named this basket">the strings point here</span>
      )}

      {/* THE POT, always moving; the ladder shows the summit exists. */}
      <p className={`worth pot${golden ? ' worth-golden' : ''}`}>
        <span className="pot-line"><strong>{compact(chip.pot)}</strong> in the pot</span>
        <span className="ladder" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((k) => (
            <i key={k} className={`rung${chip.crackles >= k ? ' lit' : ''}${k === 5 ? ' top' : ''}`}>×{2 ** k}</i>
          ))}
        </span>
        {rat
          ? <em className="pot-worth ratted">the rat is eating this fryer&apos;s crumbs — shoo him</em>
          : overcooking
            ? <em className="pot-worth burning">overcooking — the pot pays for the hurry</em>
            : spills
              ? <em className="pot-worth over">dips for {compact(Math.max(0, capRoom))} — bowl full, {compact(worth - Math.max(0, capRoom))} would spill</em>
              : <em className="pot-worth">dips for {compact(worth)}</em>}
      </p>
    </div>
  );
}

export interface KitchenProps {
  chips: CookingChip[];
  onDip: (index: number) => void;
  /** Latest crackle per basket index (timestamps), for the flash. */
  crackles: (number | null)[];
  /** Latest tick per basket index, for the +N floater. */
  ticks: ({ at: number; amount: number } | null)[];
  /** Crumbs of headroom left in the bowl — the overflow warning's input. */
  capRoom: number;
  /** The rat's latched fryer, if any. */
  ratAt: number | null;
  ratPerch: RatPerch | null;
  onShoo: () => void;
  feedMode: FeedMode;
  blessAt: { index: number; at: number } | null;
  wingIndex: number | null;
  wingSince: number;
  oracleIndex: number | null;
  /** The lit fryer, if any — its pot burns for faster crackles. */
  overcookAt: number | null;
  /** Tap a fryer's flame. `null` when overcooking is not owned. */
  onOvercook: ((index: number) => void) | null;
  /** Top of the crackle ladder for this player (The Long Fry raises it). */
  ceiling: number;
  /** Whistle the wing over. `null` when A Reason is not owned. */
  onWingCall: ((index: number) => void) | null;
  /** Seconds left on the call cooldown; 0 when it will answer. */
  wingCoolS: number;
  /** The basket whose whistle was last tapped-and-refused, and when. */
  wingNope: { index: number; at: number } | null;
}

export function Kitchen({ chips, onDip, crackles, ticks, capRoom, ratAt, ratPerch, onShoo, feedMode, blessAt, wingIndex, wingSince, oracleIndex, overcookAt, onOvercook, ceiling, onWingCall, wingCoolS, wingNope }: KitchenProps) {
  return (
    <section className="kitchen" aria-label="the fryers">
      <div className={`rack rack-${Math.min(4, Math.max(1, chips.length))}`}>
        {chips.map((chip, i) => (
          <Basket
            key={chip.ms}
            index={i}
            chip={chip}
            crackledAt={crackles[i] ?? null}
            tickFx={ticks[i] ?? null}
            capRoom={capRoom}
            rat={ratAt === i ? ratPerch : null}
            onShoo={onShoo}
            feedMode={feedMode}
            blessedAt={blessAt && blessAt.index === i ? blessAt.at : null}
            wingAt={wingIndex === i ? wingSince : null}
            prophesied={oracleIndex === i}
            overcooking={overcookAt === i}
            onOvercook={onOvercook ? () => onOvercook(i) : null}
            ceiling={ceiling}
            onWingCall={onWingCall ? () => onWingCall(i) : null}
            wingCoolS={wingCoolS}
            wingNope={wingNope && wingNope.index === i ? wingNope.at : null}
            onDip={() => onDip(i)}
          />
        ))}
      </div>
    </section>
  );
}

/** A chip travelling from its fryer down into the dip tunnel. */
export interface DipFlightState {
  key: number;
  ms: number;
  /** Art dial for the flying chip (crackle-mapped bits). */
  bits: number;
  /** Double-dip procced — the flight bobs and goes under twice. */
  double: boolean;
  x0: number; y0: number;
  x1: number; y1: number;
  cx1: number; cy1: number;
  size: number;
}

const CRUMBS = 7;

function crumbJitter(seed: number, i: number): { dx: number; dy: number } {
  const n = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453;
  const f = n - Math.floor(n);
  const a = f * Math.PI * 2;
  return { dx: Math.cos(a) * 26, dy: Math.sin(a) * 18 };
}

/**
 * The dipped chip, arcing out of the basket and plunging into the dig front —
 * the crumb burst is the splash it makes going under. Fixed-position,
 * pointer-events:none, pure flourish: the credit already landed in the queue
 * before this mounts.
 */
export function DipFlight({ flight }: { flight: DipFlightState | null }) {
  if (!flight) return null;
  return (
    <>
      <div
        key={flight.key}
        className={`dip-flight${flight.double ? ' double' : ''}`}
        aria-hidden="true"
        style={{
          '--fx0': `${flight.x0}px`, '--fy0': `${flight.y0}px`,
          '--fx1': `${flight.x1}px`, '--fy1': `${flight.y1}px`,
          '--fmx': `${(flight.x0 + flight.x1) / 2}px`,
          '--fmy': `${Math.min(flight.y0, flight.y1) - 70}px`,
          '--fs': `${flight.size}px`,
        } as React.CSSProperties}
      >
        <Chip chip={{ ms: flight.ms, bits: flight.bits, attempts: 2 ** (flight.bits + 1) }} />
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
              '--cx0': `${flight.x1 + flight.size / 2}px`,
              '--cy0': `${flight.y1 + flight.size / 2}px`,
              '--cx1': `${flight.cx1 + j.dx}px`,
              '--cy1': `${flight.cy1 + j.dy}px`,
              animationDelay: `${0.78 + i * 0.012}s`,
            } as React.CSSProperties}
          />
        );
      })}

      <div
        key={`${flight.key}-land`}
        className="crumb-land"
        aria-hidden="true"
        style={{ '--lx': `${flight.cx1}px`, '--ly': `${flight.cy1}px` } as React.CSSProperties}
      />
    </>
  );
}
