/**
 * Which fryer is overcooking — client-only state, never persisted and never
 * sent to the chain (the fold knows only that the jar was bought).
 *
 * ONE AT A TIME by design: the interesting question is *which* fryer you are
 * willing to burn, and a rack of four lit fryers has no question in it. A
 * later chained rung lifts the limit; a hotter burn never should, since the
 * burn is already a straight loss (see cooking.ts's OVERCOOK note).
 */
import { MAX_CRACKLES } from './cooking';

/** Tap a fryer's flame: light it, move it, or put it out. */
export function toggleOvercook(lit: number | null, index: number): number | null {
  return lit === index ? null : index;
}

/**
 * The flame goes out on its own when there is nothing left to hurry — the
 * chip has topped out, or the rack shrank out from under it. Called every
 * tick, so it must be cheap and total.
 *
 * NOTHING LEFT TO HURRY IS THE CEILING, NOT GOLDEN. With The Long Fry bought
 * there is still a sixth crackle to chase after a chip goes golden, and that
 * is exactly the window the burner exists to shorten — a flame that died at
 * five would switch itself off at the precise moment the new decision starts,
 * with no explanation the player could see.
 */
export function overcookOff(
  lit: number | null,
  chips: { crackles: number }[],
  ceiling: number = MAX_CRACKLES
): number | null {
  if (lit === null) return null;
  const chip = chips[lit];
  if (!chip) return null;
  return chip.crackles >= ceiling ? null : lit;
}
