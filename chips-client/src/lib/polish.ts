/**
 * THE GRAIN — polish. What finally makes DIPPING a reward instead of a
 * withdrawal.
 *
 * Consecutive dips in the SAME basket escalate: each one pays
 * `1 + min(streak, CAP) * STEP`. Dipping a different basket resets the streak.
 *
 * WHY THIS RULE. Dipping was an un-reward — something you did because upgrades
 * cost crumbs, never because dipping paid. The measured reason is that holding
 * wins: the rate doubles per crackle rung, and parking at max was within 0.09%
 * of cycling, so a dip below max threw away a ramp you had already paid for.
 * Three literal readings of "a second chip cooks in each fryer" were rejected
 * first: doubling the baskets breaks the four-basket cap (the fifth already
 * shoved the counter below the fold on a phone), doubling the tick rate is a
 * second multiplier and salt already owns that job, and two pots per basket
 * doubles the ATTENTION the cap exists to protect.
 *
 * MEASURED BEFORE IT WAS BUILT (scripts/polishsim.ts), because the last two
 * times this curve was reasoned about instead of measured the answer was wrong:
 *
 *                            no polish   with polish
 *     park at the bell         baseline     baseline
 *     cycle at max                -5.0%       +32.6%
 *     cycle one rung early       -51.2%       -26.6%
 *     spam at x2                 -93.8%       -90.1%
 *                                        (x32, 120 min session)
 *
 * So dipping AT MAX becomes better than parking, while dipping before max is
 * still ruinous. The ladder survives; what this buys out is the parking
 * endgame — deliberately, and for 3 grains.
 *
 * PURE: no React, no clock. Policy, not consensus — the bonus rides the
 * ordinary self-declared `dip <amount>` verb exactly as the wing's and the
 * oracle's do.
 */

/** Bonus per streak step. */
export const POLISH_STEP = 0.15;
/** Steps at which it stops climbing — a fully polished basket pays x1.60. */
export const POLISH_CAP = 4;

export interface Polish {
  /** Basket the streak belongs to; null when nothing is in progress. */
  at: number | null;
  /** Dips landed in a row on `at`, uncapped (the multiplier clamps). */
  streak: number;
}

export const freshPolish = (): Polish => ({ at: null, streak: 0 });

/**
 * What a dip on `index` pays, as a multiplier, GIVEN the streak so far.
 *
 * Called BEFORE `advance` — the dip that starts a streak pays x1, and the
 * fifth in a row is the first to pay the cap. Paying the bonus on the dip that
 * earns it would hand out a free 15% for switching baskets, which is the
 * opposite of the intended decision.
 */
export function polishMult(p: Polish, index: number): number {
  if (p.at !== index) return 1;
  return 1 + Math.min(p.streak, POLISH_CAP) * POLISH_STEP;
}

/** The streak after dipping `index`. Same basket climbs; any other restarts. */
export function advance(p: Polish, index: number): Polish {
  if (p.at !== index) return { at: index, streak: 1 };
  return { at: index, streak: p.streak + 1 };
}

/**
 * How polished the basket LOOKS, 0..1 — for the shine on the basket, so the
 * streak is visible before it is arithmetic. Derived from the same numbers the
 * payout uses so the picture cannot disagree with the rule.
 */
export function polishLook(p: Polish, index: number): number {
  if (p.at !== index) return 0;
  return Math.min(1, p.streak / POLISH_CAP);
}
