/**
 * DISPLAY-ONLY depth model for the dip tunnel.
 *
 * The tunnel renders the dip ladder as strata: layer 0 (Plain Salsa) is the
 * surface, and every tier below it is a band you dig down through. Nothing
 * here feeds the fold — `state.dipIndex` (chipsEngine.ts) stays the one
 * authority on which tier the player is IN; this file only decides where to
 * DRAW that, plus how far into the band the dig front sits.
 *
 * Two rules:
 *   1. The current band comes from `dipIndex`, never re-derived from
 *      `lifetimeChips`. Re-deriving would be a second copy of the fold's
 *      threshold walk, and a copy that drifts is a tunnel that draws the dig
 *      front inside a layer the fold says you are not in.
 *   2. The tunnel NEVER ends. Below the last defined tier the bands continue
 *      forever — the fold's `dipIndex` stops at the Abyss, but the visual
 *      keeps digging: each synthetic band spans twice the lifetime of the one
 *      above it, so progress stays visible at any hoard size without ever
 *      inventing a new payout tier.
 */
import { DIP_TIERS } from './chipsConst';

export interface TunnelBand {
  /** 0-based layer number, unbounded — 0..7 are DIP_TIERS, 8+ are synthetic. */
  ordinal: number;
  /** Palette key for `[data-dip=…]` — synthetic bands reuse the deepest one. */
  key: string;
  /** What the chalk label on the band says. */
  label: string;
  /** True for 8+: an endless-continuation band, not a real payout tier. */
  beyond: boolean;
}

export interface TunnelDepth {
  /** The band the dig front is in — equals `dipIndex` until the player is in
   *  the last tier, then keeps counting down through synthetic bands. */
  layer: number;
  /** 0..1 (exclusive): how far through the band the front has dug. */
  frac: number;
  /** layer + frac — the continuous scroll position, in band heights. */
  depth: number;
}

/** The last defined tier doubles forever: band 7+k spans
 *  [lastMin·2^k, lastMin·2^(k+1)). Keeps every band finishable in roughly the
 *  time the previous one took at a steady rate — the idle-game curve the real
 *  tier thresholds already follow. */
const LAST = DIP_TIERS.length - 1;
const LAST_MIN = DIP_TIERS[LAST].minLifetime;

/**
 * THE DESCENT. Below the Abyssal Dip the ladder stops being dip and starts
 * being the world the bowl was sitting in — you break the porcelain, then the
 * table, then the floor, then the earth under the shop, and then something
 * that was always under the shop. Design: docs/superpowers/specs/
 * 2026-07-28-chips-the-descent-design.md.
 *
 * These are REAL bands, not the continuation filler they replace: each has its
 * own palette (styles.css `[data-dip=…]`) and its own resident. Ordinal 8 is
 * the first, immediately below `DIP_TIERS`' last entry.
 *
 * The thresholds are already handled — a band spans twice the lifetime of the
 * one above it, forever, and that maths does not care what the band is called.
 */
export const DEEP_BANDS: { key: string; label: string }[] = [
  { key: 'porcelain', label: 'The Porcelain' },
  { key: 'table',     label: 'The Table' },
  { key: 'floor',     label: 'The Floor' },
  { key: 'dirt',      label: 'The Dirt' },
  { key: 'lava',      label: 'The Lava' },
  { key: 'otherside', label: 'The Other Side' },
];

/** And once even the descent runs out, the chalk gives up gracefully. */
const BEYOND_LINES = [
  'the dip goes on',
  'and on',
  'and on…',
  'still dip',
  'dip beneath the dip',
  'unfathomed dip',
  'dip all the way down',
];

/**
 * THE DESCENT IS GATED BY THE BOSSES, NOT BY LIFETIME.
 *
 * `broken` is how many deep bands you have actually beaten. Depth may reach the
 * band below your last kill and no further, so a band you have not earned is
 * never drawn under you.
 *
 * This was missing, and the porcelain made it visible in the worst way. To beat
 * that boss you must land ONE dip worth more than everything else banked this
 * run — an enormous dip, by construction. Depth read `lifetimeChips` alone, so
 * the very dip the fight demanded (4.8 BILLION crumbs, live, 2026-07-29) blew
 * lifetime past all six band floors at once and dropped the player through The
 * Table, The Floor, The Dirt and The Lava out the far side, having fought
 * exactly one boss. Operator: "I went from porcelain and that sent me
 * immediately past everything."
 *
 * The fight was self-defeating: winning it was the thing that skipped the rest
 * of the descent. Progress belongs to the boss ("an ACT, like having to beat a
 * boss to progress" — the design), and lifetime only ever positions you WITHIN
 * the band you have earned.
 */
export function tunnelDepth(
  dipIndex: number,
  lifetimeChips: number,
  broken = Number.POSITIVE_INFINITY,
): TunnelDepth {
  const i = Math.max(0, Math.min(LAST, Math.floor(dipIndex)));
  const life = Math.max(0, lifetimeChips);

  if (i < LAST) {
    const lo = DIP_TIERS[i].minLifetime;
    const hi = DIP_TIERS[i + 1].minLifetime;
    // Clamp both ways: the fold's dipIndex is authoritative, so a lifetime
    // outside [lo, hi) (a mid-poll mismatch, a congeal jump) pins the front to
    // the band's edge rather than drawing it in a band the fold disagrees with.
    const frac = Math.min(0.999, Math.max(0, (life - lo) / Math.max(1, hi - lo)));
    return { layer: i, frac, depth: i + frac };
  }

  // In the last tier: keep digging through doubling synthetic bands.
  let k = 0;
  let lo = LAST_MIN;
  while (life >= lo * 2) { lo *= 2; k++; }
  let frac = Math.min(0.999, Math.max(0, (life - lo) / lo));
  let layer = LAST + k;

  // THE GATE. `broken` bands beaten earns the bands up to and including the
  // next unbroken one — you stand at the face of the band you are about to
  // fight, never inside the one after it. Default Infinity so callers that
  // legitimately draw an ungated shaft (the pre-game doorway) are unchanged.
  if (Number.isFinite(broken)) {
    const earned = LAST + Math.max(0, Math.floor(broken)) + 1;
    if (layer > earned) {
      layer = earned;
      frac = 0.999; // pinned at the floor of the band you have not yet broken
    }
  }
  return { layer, frac, depth: layer + frac };
}

export function bandAt(ordinal: number): TunnelBand {
  const o = Math.max(0, Math.floor(ordinal));
  if (o < DIP_TIERS.length) {
    const t = DIP_TIERS[o];
    return { ordinal: o, key: t.key, label: t.label, beyond: false };
  }
  // THE DESCENT — named strata with their own palettes. `beyond` stays FALSE
  // for these: it is the flag that dims a band's chalk into scenery, and
  // these are places, not filler.
  const d = o - DIP_TIERS.length;
  if (d < DEEP_BANDS.length) {
    return { ordinal: o, key: DEEP_BANDS[d].key, label: DEEP_BANDS[d].label, beyond: false };
  }
  // Past the descent, the endless continuation as before.
  const line = BEYOND_LINES[Math.min(BEYOND_LINES.length - 1, d - DEEP_BANDS.length)];
  return { ordinal: o, key: DEEP_BANDS[DEEP_BANDS.length - 1].key, label: line, beyond: true };
}

/**
 * The bands worth rendering around a scroll position: a few above the front
 * (the shaft already dug) and a few below (the strata still coming). The
 * window is what makes "endless" cheap — the DOM only ever holds ~9 bands no
 * matter how deep the dig goes.
 */
export function bandsAround(depth: number, above = 3, below = 5): TunnelBand[] {
  const centre = Math.max(0, Math.floor(depth));
  const first = Math.max(0, centre - above);
  const out: TunnelBand[] = [];
  for (let o = first; o <= centre + below; o++) out.push(bandAt(o));
  return out;
}
