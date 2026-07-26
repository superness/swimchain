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

/** What the chalk says once the ladder runs out and the dip keeps going. */
const BEYOND_LINES = [
  'the dip goes on',
  'and on',
  'and on…',
  'still dip',
  'dip beneath the dip',
  'unfathomed dip',
  'dip all the way down',
];

export function tunnelDepth(dipIndex: number, lifetimeChips: number): TunnelDepth {
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
  const frac = Math.min(0.999, Math.max(0, (life - lo) / lo));
  const layer = LAST + k;
  return { layer, frac, depth: layer + frac };
}

export function bandAt(ordinal: number): TunnelBand {
  const o = Math.max(0, Math.floor(ordinal));
  if (o < DIP_TIERS.length) {
    const t = DIP_TIERS[o];
    return { ordinal: o, key: t.key, label: t.label, beyond: false };
  }
  const line = BEYOND_LINES[Math.min(BEYOND_LINES.length - 1, o - DIP_TIERS.length)];
  return { ordinal: o, key: DIP_TIERS[LAST].key, label: line, beyond: true };
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
