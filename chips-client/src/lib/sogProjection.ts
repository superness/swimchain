/**
 * DISPLAY-ONLY sogginess projection.
 *
 * The fold banks decay at the next confirmed move (chipsEngine.ts's `applySog`),
 * so between moves a player's real bowl is already rotting on-chain while their
 * screen still shows the pre-decay figure. This projects that forward for the
 * BOWL RENDER ONLY. Nothing here ever feeds `ChipsState` — the fold stays the
 * single source of truth and every client still folds byte-identically.
 *
 * Lives in `lib/` rather than inside Bowl.tsx (where the task brief drafted it)
 * for one reason: it is a mirror of `applySog`, and a mirror that silently
 * drifts from its original is a display that lies. Here it is pinned against
 * the REAL fold by sogProjection.test.ts, and it reuses the fold's own exported
 * `sogHoursFor` AND `sogNum`, so neither the clamp nor the dip-then-airtight
 * numerator can diverge at all. Only the per-hour loop is restated, because the
 * fold's mutates `ChipsState` in place and this must not.
 */
import { SOG_DEN } from './chipsConst';
import { sogHoursFor, sogNum, type ChipsState } from './chipsEngine';

/**
 * The bowl as it will be once the next move lands, given wall-clock `nowMs`.
 *
 * `lastConfirmedAt === 0` (nothing of this player's has been confirmed yet)
 * means the fold has NO clock to decay from and applies no sog at all — so the
 * projection must not either. The brief's draft omitted this guard and
 * measured the gap from epoch 0, which clamps straight to SOG_MAX_HOURS and
 * renders a brand-new player's freshly-banked bowl as empty.
 */
export function projectedCrumbs(state: ChipsState, nowMs: number): number {
  if (state.lastConfirmedAt <= 0) return state.crumbs;
  let crumbs = state.crumbs;
  if (crumbs <= 0) return crumbs;
  const hours = sogHoursFor(state.lastConfirmedAt, nowMs);
  const num = sogNum(state);
  for (let i = 0; i < hours && crumbs > 0; i++) crumbs = Math.floor((crumbs * num) / SOG_DEN);
  return crumbs;
}

/**
 * How SOFT the pile should LOOK, 0 (just fried) to 1 (given up), continuous.
 *
 * Deliberately NOT derived from `projectedCrumbs`: decay is quantised to whole
 * hours, so a bowl only starts visibly shrinking 60 minutes after the last
 * move. Sogginess is supposed to be felt before it is counted, so the texture
 * cue rides a continuous clock and reaches "properly soggy" around one decay
 * half-life. The crumb COUNT still comes from `projectedCrumbs` — this only
 * drives colour, slump and sheen.
 */
export function soggyLook(state: ChipsState, nowMs: number): number {
  if (state.lastConfirmedAt <= 0) return 0;
  const HALF_LIFE_MS = 23 * 3_600_000;
  const elapsed = nowMs - state.lastConfirmedAt;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / HALF_LIFE_MS);
}
