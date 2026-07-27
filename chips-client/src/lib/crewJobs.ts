/**
 * CREW JOBS — the cheese rat (risk) and the queso angel (reward).
 *
 * THE RAT: once recruited he periodically latches onto a fryer. While latched
 * he banks that fryer's ticks into his cheeks instead of the pot, and he EATS
 * ANY CRACKLE that lands there — even a blessing. Click him to shoo: he pays
 * out his hoard times a gorge bonus that grows the fatter he got (×1.0 fresh
 * → ×1.75 fully gorged). "It depends" tension by design: on a ×1 chip he is
 * pure profit (his ×1.75 beats the pot's ×1); on a cooked ×8 chip he is a
 * disaster (those ticks would have been multiplied). The Sous Chef refuses to
 * touch rats.
 *
 * THE ANGEL: occasionally begins to glow, and stays glowing until used.
 * Click her → she blesses one fryer with a GUARANTEED CRACKLE on its next
 * tick. The skill is saving her for a fat pot: a forced crackle is worth the
 * whole expected wait at that level, which doubles per rung.
 *
 * All client policy — the rat's payout rides the ordinary self-declared
 * `dip <amount>` verb, the blessing just moves a tick the clock would have
 * granted eventually. No consensus surface anywhere in this file.
 *
 * PURE MODULE: no React, no timers, injected RNG — the driver is App.tsx's
 * cook-events callback, which runs exactly once per cooking tick.
 */
import { TICK_MS } from './cooking';

/** Both jobs unlock with their critters — the Queso breakthrough. */
export const JOBS_MIN_DIP_INDEX = 3;

/** Expected seconds between latches while the rat is loose. */
export const RAT_LATCH_EXPECT_S = 150;
/** Seconds of latching to reach the full gorge bonus. */
export const RAT_FULL_GORGE_S = 120;
/** The gorge bonus climbs ×1.0 → ×(1 + RAT_GORGE_MAX). */
export const RAT_GORGE_MAX = 0.75;

/** Expected seconds between glows once the angel is idle again. */
export const ANGEL_GLOW_EXPECT_S = 240;
/** Cooldown after a blessing before she can start glowing again. */
export const ANGEL_COOLDOWN_S = 180;

export interface RatState {
  /** Fryer index he is latched to, or null while loose. */
  latched: number | null;
  /** Crumbs siphoned from that fryer's ticks since latching. */
  hoard: number;
  latchedTicks: number;
  /** Crackles he has eaten this latch (visual outrage counter). */
  eaten: number;
}

export interface AngelState {
  glowing: boolean;
  cooldownTicks: number;
}

export const freshRat = (): RatState => ({ latched: null, hoard: 0, latchedTicks: 0, eaten: 0 });
export const freshAngel = (): AngelState => ({ glowing: false, cooldownTicks: 0 });

const perTickP = (expectS: number): number => TICK_MS / 1000 / expectS;

/**
 * One cooking tick of rat life. Loose → maybe latch a random fryer; latched →
 * he digs in one tick deeper (the hoard itself grows via `ratAbsorb`, fed by
 * the cooking engine's diverted-gain events). He never leaves on his own:
 * ignoring him is the punishment — he keeps eating crackles until shooed.
 */
export function ratTick(rat: RatState, fryerCount: number, rng: () => number): RatState {
  if (rat.latched !== null) {
    // A shrunken rack (never happens live, but cheap to be exact about)
    // drops him loose rather than leaving him latched to a missing fryer.
    if (rat.latched >= fryerCount) return freshRat();
    return { ...rat, latchedTicks: rat.latchedTicks + 1 };
  }
  if (fryerCount <= 0) return rat;
  if (rng() < perTickP(RAT_LATCH_EXPECT_S)) {
    return { latched: Math.min(fryerCount - 1, Math.floor(rng() * fryerCount)), hoard: 0, latchedTicks: 0, eaten: 0 };
  }
  return rat;
}

/** A diverted tick lands in his cheeks. */
export function ratAbsorb(rat: RatState, amount: number): RatState {
  return rat.latched === null ? rat : { ...rat, hoard: rat.hoard + Math.max(0, amount) };
}

/** He ate a crackle. He is not sorry. */
export function ratAte(rat: RatState): RatState {
  return rat.latched === null ? rat : { ...rat, eaten: rat.eaten + 1 };
}

/** ×1.0 the moment he latches, ×(1+RAT_GORGE_MAX) once fully gorged. */
export function gorgeOf(rat: RatState): number {
  return 1 + RAT_GORGE_MAX * Math.min(1, (rat.latchedTicks * TICK_MS) / 1000 / RAT_FULL_GORGE_S);
}

/** Shoo him: the hoard pays out ×gorge and he scurries back into the queso. */
export function shooRat(rat: RatState): { payout: number; rat: RatState } {
  return { payout: Math.floor(rat.hoard * gorgeOf(rat)), rat: freshRat() };
}

/** One cooking tick of angel life: cooldown burns down, then she may glow.
 *  A glow PERSISTS until spent — the skill is in when you spend it. */
export function angelTick(angel: AngelState, rng: () => number): AngelState {
  if (angel.glowing) return angel;
  if (angel.cooldownTicks > 0) return { ...angel, cooldownTicks: angel.cooldownTicks - 1 };
  if (rng() < perTickP(ANGEL_GLOW_EXPECT_S)) return { ...angel, glowing: true };
  return angel;
}

/** Spend the glow on a blessing; she rests for ANGEL_COOLDOWN_S. */
export function spendBlessing(_angel: AngelState): AngelState {
  return { glowing: false, cooldownTicks: Math.round((ANGEL_COOLDOWN_S * 1000) / TICK_MS) };
}
