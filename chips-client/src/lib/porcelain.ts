/**
 * THE PORCELAIN — the descent's first boss, and the one that teaches the game.
 *
 * "Land ONE dip worth more than everything else you have banked this run."
 *
 * The condition is a moving target, and that is the whole design: everything
 * you bank raises the bar you have to clear. So the only way through is to
 * STOP DIPPING and let one chip cook — which is exactly the secret the game
 * has never told anyone (cooking.ts's BALANCE MATH note: holding wins, always,
 * and selling early is simply bad). A player who has not worked that out will
 * grind the bar upward forever and never crack it. A player who has will park
 * one basket, sit on their hands, and go through in one hit.
 *
 * PURE: no React, no storage, no clock. The app supplies the numbers.
 */
import { worthOf, type CookingChip } from './cooking';
import { CRUMBS_PER_CHIP, deepBandFloor } from './chipsConst';

/** You may not walk up to it with a cold rack. Something real in the oil. */
export const PORCELAIN_READY_CRACKLES = 3;   // x8 or better

/**
 * Everything banked this run, in crumbs. `lifetimeChips` paces on
 * crumbs/CRUMBS_PER_CHIP (chipsEngine), so this inverts that — it is the bar
 * a single dip has to clear, and it is why the fight gets harder every time
 * you cash anything.
 */
export function bankedThisRun(lifetimeChips: number): number {
  return lifetimeChips * CRUMBS_PER_CHIP;
}

/**
 * Is the porcelain even down there? The band has to be reachable — the fold
 * applies the same floor to `broke`, so offering the fight any earlier would
 * be offering something the chain will refuse.
 */
export function porcelainInReach(lifetimeChips: number, alreadyBroken: number): boolean {
  return alreadyBroken === 0 && lifetimeChips >= deepBandFloor(0);
}

export interface Readiness {
  ready: boolean;
  /** The fattest chip you have, and what it would pay. Null on an empty rack. */
  best: { index: number; worth: number; crackles: number } | null;
  /** What a single dip must beat. */
  bar: number;
}

/**
 * PREPARED, in the operator's sense: retries are free, but the fight will not
 * start until you bring something to it. A cold rack cannot crack a bowl, and
 * being told so is friendlier than losing.
 */
export function readiness(chips: readonly CookingChip[], lifetimeChips: number): Readiness {
  let best: Readiness['best'] = null;
  chips.forEach((c, index) => {
    const w = worthOf(c);
    if (best === null || w > best.worth) best = { index, worth: w, crackles: c.crackles };
  });
  const ready = best !== null && (best as { crackles: number }).crackles >= PORCELAIN_READY_CRACKLES;
  return { ready, best, bar: bankedThisRun(lifetimeChips) };
}

/**
 * Does this dip go through? Strictly greater: matching the bar is not
 * cracking it, and an exact tie on a number this large means you were not
 * really past it.
 */
export function cracks(dipAmount: number, lifetimeChips: number): boolean {
  return dipAmount > bankedThisRun(lifetimeChips);
}

/**
 * How far in the hairlines have spread, 0..1 — `dipAmount` against the bar.
 * Purely for the drawing, but it lives here so the picture cannot disagree
 * with the rule: at 1 the bowl breaks, and at 1 `cracks` is true.
 */
export function crackProgress(dipAmount: number, lifetimeChips: number): number {
  const bar = bankedThisRun(lifetimeChips);
  if (bar <= 0) return 1;
  return Math.max(0, Math.min(1, dipAmount / bar));
}
