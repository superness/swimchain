/**
 * THE TABLE — the descent's second boss, and the porcelain's opposite.
 *
 * "Land FIVE dips in a row in the same basket, together worth more than the bar."
 *
 * THE PORCELAIN TAUGHT ONE THING; THIS TEACHES ITS COUNTERPART. That fight
 * demanded a single dip worth more than everything banked this run, which is
 * only winnable by refusing to dip at all — it taught that holding wins, which
 * was the game's measured secret. The Table asks for the opposite shape: not one
 * enormous dip but a rising run of them, which is only winnable by dipping
 * deliberately and repeatedly into the same basket.
 *
 * That is also exactly what THE GRAIN pays for (lib/polish.ts), and it is the
 * ability this band sells — so the boss is a test of the thing the band gives
 * you. It must therefore be beatable WITHOUT the ability, or the descent locks
 * behind a purchase, and it must not be trivial WITH it, or the band is a
 * formality. Both properties are measured in scripts/tablesim.ts rather than
 * asserted, because two of today's "obviously fine" balance claims were wrong
 * when measured.
 *
 * Without The Grain you win it by cooking five fat chips — real patience. With
 * The Grain the escalating multiplier adds up to 60% across the run, so the same
 * five chips clear a bar they otherwise would not: the ability is a genuine
 * shortcut rather than a requirement.
 *
 * THE FIRST DESIGN WAS "each worth more than the last" AND IT WAS WRONG.
 * Measured (scripts/tablesim.ts): at any patience above zero the win rate was
 * IDENTICAL with and without The Grain — 90% either way — because lengthening
 * each cook makes the pot rise reliably and swamps polish's 15% steps. And at
 * zero patience even polish only reached 18%, because crackle count varies by
 * POWERS OF TWO and a 15% bonus cannot out-climb that. The rule tested luck,
 * then patience, and never once tested the streak it was supposed to be about.
 * A SUM does: polish contributes to it directly and additively.
 *
 * PURE: no React, no clock, no storage. The app supplies the numbers, exactly
 * as porcelain.ts does.
 */
import { deepBandFloor } from './chipsConst';

/** Dips in a row required. */
export const TABLE_RUN = 5;

/** You may not walk up to it with a cold rack — the same courtesy the porcelain
 *  extends (design doc: "free retries, but only if they are prepared"). */
export const TABLE_READY_CRACKLES = 3;

export interface TableRun {
  /** Basket the run belongs to; null before it starts. */
  at: number | null;
  /** Worth of each dip so far, in order. */
  worths: number[];
}

/**
 * What five dips must total. Scales with the band floor so it cannot be
 * out-grown: a player who arrives late does not walk through it.
 */
export function tableBar(lifetimeChips: number): number {
  return Math.max(deepBandFloor(1) * 1000, Math.floor(lifetimeChips * 1000 * 0.02));
}

export const freshRun = (): TableRun => ({ at: null, worths: [] });

/**
 * Is The Table even down there? Band 1, and only once the porcelain is behind
 * you — the fold applies the same floor to `broke`, so offering it earlier would
 * be offering something the chain refuses.
 */
export function tableInReach(lifetimeChips: number, alreadyBroken: number): boolean {
  return alreadyBroken === 1 && lifetimeChips >= deepBandFloor(1);
}

/**
 * Fold a dip into the run.
 *
 * ONE way it resets: a different basket. The run is about staying with one
 * basket, and that is the only discipline it asks for — a reset restarts at
 * this dip rather than at zero, because this dip is a perfectly good first step
 * and punishing the attempt is not the point.
 *
 * Only the last TABLE_RUN dips count, so a long session in one basket is a
 * rolling window rather than an accumulating certainty.
 */
export function feed(run: TableRun, index: number, worth: number): TableRun {
  if (run.at !== index) return { at: index, worths: [worth] };
  return { at: index, worths: [...run.worths, worth].slice(-TABLE_RUN) };
}

/** What the current window totals. */
export function runTotal(run: TableRun): number {
  return run.worths.reduce((a, b) => a + b, 0);
}

/** Has the run been made? Five dips in one basket, clearing the bar together. */
export function won(run: TableRun, bar: number): boolean {
  return run.worths.length >= TABLE_RUN && runTotal(run) > bar;
}

/** How far along, 0..1 — for the drawing, from the same number the rule uses. */
export function progress(run: TableRun): number {
  return Math.min(1, run.worths.length / TABLE_RUN);
}

/**
 * PREPARED, in the operator's sense: retries are free, but the fight will not
 * start until you bring something to it.
 */
export function ready(crackles: readonly number[]): boolean {
  return crackles.some((c) => c >= TABLE_READY_CRACKLES);
}

/** What the window still needs. 0 once the bar is cleared. */
export function stillNeeded(run: TableRun, bar: number): number {
  return Math.max(0, bar - runTotal(run) + 1);
}
