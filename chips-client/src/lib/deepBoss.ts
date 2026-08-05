/**
 * THE DEEP BOSSES — one fight, five bands, "chipping away at the table".
 *
 * Bands 1-5 all share a single mechanic: the boss has HEALTH in crumbs, every
 * chip you feed does its worth in damage, and the band gives when the total
 * lands. So this file is deliberately one module rather than five: what differs
 * between The Table and The Lava is a number and some words, not a rule.
 *
 * BAND 0 IS NOT HERE. The Porcelain settles in one blow and keeps its own module
 * (porcelain.ts) — operator: "leave porcelein alone". That is also what keeps
 * the chain safe; see the note in chipsConst's BOSS_HP_MULT.
 *
 * The fight is PAID, not won: `broke <paid>` already spends the chip rather than
 * banking it, which is why a boss can be chipped at across sessions without the
 * player accumulating the value twice.
 *
 * PURE: no React, no clock, no storage. The app supplies the numbers.
 */
import { bossHp, deepBandFloor, DEEP_BAND_COUNT, FIRST_HP_BAND } from './chipsConst';
import { DEEP_BANDS } from './tunnelDepth';
import { flavourFor, type BandFlavour } from './bandFlavour';
import { worthOf, type CookingChip } from './cooking';

/** You may not walk up to one with a cold rack — the porcelain's courtesy,
 *  extended: "free retries, but only if they are prepared". */
export const DEEP_READY_CRACKLES = 3;

export interface DeepFight {
  /** Band index, 1..DEEP_BAND_COUNT-1. */
  band: number;
  /** The STRATUM — where you are. What the tunnel draws behind you. */
  label: string;
  /** What you are HITTING, plus its lines. A location is not a fight. */
  flavour: BandFlavour;
  /** Total health, in crumbs. */
  hp: number;
  /** Damage dealt so far this bowl. */
  done: number;
  /** What is left. */
  left: number;
  /** 0..1, for the bar. */
  frac: number;
}

/**
 * Is there a deep boss in front of you, and what state is it in?
 *
 * Null when there is nothing to fight: the porcelain is still up (band 0 is not
 * this fight), the descent is finished, or you are not deep enough for the band
 * the chain would let you break.
 */
export function fightAt(
  broken: number,
  lifetimeChips: number,
  bossDamage: number,
  /** The band's frozen HP from the fold (`ChipsState.bossHpFrozen`), or 0 when
   *  no blow has landed yet. THE BAR MUST BE THE ONE THE FOLD IS SCORING
   *  AGAINST — computing it here from `lifetimeChips` is what made the health
   *  bar creep backwards while you were hitting it, since lifetime only grows.
   *  Before the first blow there is nothing frozen yet, so the preview is what
   *  it WOULD be if you swung now, which is the honest thing to show. */
  bossHpFrozen = 0,
): DeepFight | null {
  const band = broken;
  if (band < FIRST_HP_BAND || band >= DEEP_BAND_COUNT) return null;
  if (lifetimeChips < deepBandFloor(band)) return null;

  const hp = bossHpFrozen > 0 ? bossHpFrozen : bossHp(band);
  const done = Math.max(0, Math.min(hp, bossDamage));
  return {
    band,
    label: DEEP_BANDS[band]?.label ?? 'the dark',
    flavour: flavourFor(band),
    hp,
    done,
    left: hp - done,
    frac: hp <= 0 ? 1 : done / hp,
  };
}

/**
 * PREPARED: the fight will not start until you bring something to it. A cold
 * rack cannot hurt a table, and being told so is friendlier than losing.
 */
export function ready(chips: readonly CookingChip[]): boolean {
  return chips.some((c) => c.crackles >= DEEP_READY_CRACKLES);
}

/** The fattest chip you have, and what it would do. Null on an empty rack. */
export function bestBlow(
  chips: readonly CookingChip[],
): { index: number; worth: number; crackles: number } | null {
  let best: { index: number; worth: number; crackles: number } | null = null;
  chips.forEach((c, index) => {
    const worth = worthOf(c);
    if (best === null || worth > best.worth) best = { index, worth, crackles: c.crackles };
  });
  return best;
}

/** Would this blow finish it? */
export function finishes(fight: DeepFight, worth: number): boolean {
  return fight.done + worth >= fight.hp;
}

/**
 * How many more blows like this one, if nothing changes. For the copy that
 * tells a player where they stand — it is the difference between "this is
 * hopeless" and "three more of those".
 */
export function blowsLeft(fight: DeepFight, worth: number): number {
  if (worth <= 0) return Infinity;
  return Math.max(1, Math.ceil(fight.left / worth));
}
