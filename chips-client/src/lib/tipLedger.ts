/**
 * WHAT A TIP ACTUALLY TAKES — the receipt, in numbers, before anything goes.
 *
 * On 2026-08-04 the operator tipped twelve times on one table, three of them
 * inside ninety minutes, and was surprised by the reset every single time —
 * once saying flatly "i did not tip". Every one of those twelve carries a keep
 * on chain (`tip season7`), so the picker inside the reveal was tapped each
 * time: these were button presses, not phantom moves. The mechanic is correct
 * and stays. The affordance was the bug.
 *
 * The reveal already HAD a ledger, and the ledger is where it went wrong. It
 * listed three things, two of them without a number:
 *
 *     every crumb in the bowl
 *     all {jarCount} jars you have bought
 *     your depth — back to Plain Salsa from {depth}
 *
 * Meanwhile the tip verb in `foldChips` (chipsEngine.ts, `parsed.kind ===
 * 'tip'`) zeroes rather more than that, including the three the player misses
 * hardest and the ledger never mentioned at all:
 *
 *     state.broken = 0          you re-break every band, from the porcelain up
 *     state.bossDamage = 0      the fight you are mid-way through is gone
 *     state.lifetimeChips = 0   the number the salt was computed FROM
 *
 * `broken` is the expensive one. Losing it is exactly the "reset to 0 no
 * upgrades" report we chased for an hour on 2026-08-04 before finding a tip
 * behind it — the player re-breaks the porcelain and reads that as the game
 * having eaten their descent.
 *
 * And the jar line was actively FALSE whenever THE CRACK was carrying one
 * through: the picker sits four lines under "all 5 jars you have bought" and
 * that sentence never changed when you chose one to save. Hence `jarsLost`
 * below — the ledger and the picker are now the same computation, so they
 * cannot disagree the way they did.
 *
 * PURE, and deliberately in `lib/` rather than inside Bowl.tsx: this is a
 * mirror of the fold's tip verb, and tipLedger.test.ts pins it against the
 * real fold by tipping a folded state and diffing what moved. A mirror nobody
 * checks is a display that lies — sogProjection.ts's header makes the same
 * argument about `applySog`, for the same reason.
 */
import { saltFor, type ChipsState } from './chipsEngine';
import { UPGRADES } from './chipsConst';

/** Everything the confirmation has to say, already resolved to numbers. */
export interface TipReceipt {
  /**
   * Crumbs that go back in the bowl. The SOG-PROJECTED figure the player is
   * looking at (`projectedCrumbs`), not `state.crumbs` — the fold banks decay
   * at the next move, so between moves those two differ and only one of them
   * is on screen. Naming the other would be a fresh way to be surprised.
   */
  crumbs: number;
  /** Jars that actually go: everything owned, less the one THE CRACK carries. */
  jarsLost: number;
  /**
   * The jar riding through, or null. Resolved on the SAME three conditions
   * the fold honours a keep on — asked for, `crack` owned, jar owned — so the
   * ledger can never promise a keep the fold is going to drop.
   */
  keptLabel: string | null;
  /** Chips banked this run. Zeroed by the tip, and what `saltFor` reads. */
  lifetimeChips: number;
  /** Bands broken in this bowl. Every one of them has to be broken again. */
  bandsBroken: number;
  /** Damage stacked on the band being fought right now; 0 if none is. */
  bossDamage: number;
  /** Where you are, so the depth loss is a place and not a number. */
  depthLabel: string;
  /** Old salt this tip pays. */
  saltGained: number;
  /** Old salt afterwards, in total. */
  saltAfter: number;
}

/**
 * The receipt for tipping `state` right now, keeping `keep`.
 *
 * `crumbsNow` is passed rather than read off `state` for the reason on
 * `TipReceipt.crumbs`; everything else comes straight off the state the fold
 * is about to reset.
 */
export function tipReceipt(
  state: ChipsState, crumbsNow: number, keep: string | undefined, depthLabel: string,
): TipReceipt {
  // The fold's own three conditions, in the fold's own order (chipsEngine.ts:
  // `const keeping = parsed.keep !== null && state.charOwned.has('crack') &&
  // state.owned.has(parsed.keep)`).
  const keeping = keep !== undefined
    && state.charOwned.has('crack')
    && state.owned.has(keep)
    ? UPGRADES[keep]
    : undefined;
  const saltGained = saltFor(state.lifetimeChips);
  return {
    crumbs: crumbsNow,
    jarsLost: state.owned.size - (keeping ? 1 : 0),
    keptLabel: keeping ? keeping.label : null,
    lifetimeChips: state.lifetimeChips,
    bandsBroken: state.broken,
    bossDamage: state.bossDamage,
    depthLabel,
    saltGained,
    saltAfter: state.oldSalt + saltGained,
  };
}

/**
 * THE DEAD BEAT — how long the commit button ignores taps after it appears.
 *
 * The reveal is a full-screen overlay that opens over a game the player is
 * tapping at speed (fryers, critters, the rat), and the twelve tips were two
 * taps each. Two taps is what a tap-stream produces by accident; that is the
 * whole failure. So the destructive button ARMS on the first tap — replacing
 * itself with the numbers above — and refuses to fire for this long after,
 * which a double-tap cannot outlast and a person reading a receipt never
 * notices.
 *
 * It is short on purpose. This is not a nag and not a setting (there is one
 * path and it has to be honest); it is the gap between "tapped" and "read".
 */
export const TIP_ARM_DEAD_MS = 900;

/**
 * Whether the armed commit may fire. `armedAt` is when the first tap landed,
 * null when nothing is armed.
 *
 * The button also carries `disabled`, but `disabled` is a paint: a tap already
 * travelling when the attribute lifts still dispatches, and on a phone that is
 * precisely the tap we are guarding against. This is the rule; the attribute
 * is the hint.
 */
export function tipCommitReady(armedAt: number | null, now: number): boolean {
  return armedAt !== null && now - armedAt >= TIP_ARM_DEAD_MS;
}
