/**
 * Epoch arithmetic — an absolute grid, independent of any client's log.
 *
 * The fold covers exactly one epoch (spec section 3.9). The grid is absolute
 * so two clients holding different slices of history still agree on where
 * every tick falls; anchoring to the first entry a client happened to hold is
 * precisely what made them diverge.
 */
import { EPOCH_MS } from './shoalConst';

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

/** True when a timestamp sits exactly on an epoch boundary. */
export function isEpochBoundary(ms: number): boolean {
  return ms % EPOCH_MS === 0;
}
