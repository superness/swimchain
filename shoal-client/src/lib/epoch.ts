/**
 * Epoch arithmetic — an absolute grid, independent of any client's log.
 *
 * The fold covers exactly one epoch (spec section 3.9). The grid is absolute
 * so two clients holding different slices of history still agree on where
 * every tick falls; anchoring to the first entry a client happened to hold is
 * precisely what made them diverge.
 */
import { EPOCH_MS, TICK_MS } from './shoalConst';

/** Which epoch a timestamp belongs to. Floors, so it is correct below zero. */
export function epochOf(ms: number): number {
  return Math.floor(ms / EPOCH_MS);
}

/** First ms of an epoch, inclusive. */
export function epochStartMs(epoch: number): number {
  return epoch * EPOCH_MS;
}

/** First ms after an epoch, exclusive — i.e. the next epoch's start. */
export function epochEndMs(epoch: number): number {
  return (epoch + 1) * EPOCH_MS;
}

/**
 * The canonical LAST TICK of an epoch: `epochStartMs(e) + EPOCH_MS - TICK_MS`.
 *
 * This is the one fold point an epoch has. `foldShoal(log, epochFoldEndMs(e),
 * { epoch: e })` folds every tick the epoch contains and leaves `state.nowMs`
 * sitting exactly on `epochEndMs(e)`, which is what `rollEpoch` requires.
 * Exported so no caller has to re-derive the off-by-one-tick: `epochEndMs(e)`
 * is the first ms of the NEXT epoch and is therefore not a tick this epoch may
 * fold (foldTick refuses it). EPOCH_MS / TICK_MS = 14_400 is exact, so this
 * always lands on the absolute tick grid.
 */
export function epochFoldEndMs(epoch: number): number {
  return epochStartMs(epoch) + EPOCH_MS - TICK_MS;
}

/** True when a timestamp sits exactly on an epoch boundary. */
export function isEpochBoundary(ms: number): boolean {
  return ms % EPOCH_MS === 0;
}
