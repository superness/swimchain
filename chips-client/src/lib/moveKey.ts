/**
 * THE JOIN KEY between the client's history and the chain's.
 *
 * Lifted out of chipsSettling on 2026-07-29 so [[moveJournal]] can stamp every
 * move with the identity it will have on chain WITHOUT an import cycle
 * (chipsQueue -> moveJournal -> chipsSettling -> chipsQueue). Duplicating the
 * key format instead would have been the real hazard: two copies that drift are
 * worse than no key at all, because the report would then look joinable and
 * quietly not be.
 *
 * chipsSettling re-exports it, so every existing caller and test is unchanged.
 */
import { proofKey } from './proofKey';
import type { QueuedMove } from './chipsQueue';

/**
 * The identity of a move, as the chain will express it once the move lands —
 * table and author folded in, so it can only ever match its own twin.
 *
 * A queued bank carries exactly one chip (`chip: ChipEntry`), which is why this
 * is a single key rather than a set: batching happens at SUBMIT time
 * (`bankBatchBody` over the moves `takeBatch` grouped), never in the queue.
 */
export function moveKey(m: QueuedMove): string {
  if (m.kind === 'bank') return proofKey(m.tableId, m.author, m.chip.ms, m.chip.nonce);
  if (m.kind === 'dip') return `dip:${m.tableId}:${m.author.toLowerCase()}:${m.ms}`;
  if (m.kind === 'tip') return `tip:${m.tableId}:${m.author.toLowerCase()}:${m.ms}`;
  // Keyed on ms, not key: the same jar can be burned more than once a run.
  if (m.kind === 'broke') return `broke:${m.tableId}:${m.author.toLowerCase()}:${m.ms}`;
  if (m.kind === 'burn') return `burn:${m.tableId}:${m.author.toLowerCase()}:${m.ms}`;
  // Keyed on ability, not ms: an ability is bought at most once, ever.
  if (m.kind === 'spend') return `spend:${m.tableId}:${m.author.toLowerCase()}:${m.ability}`;
  return `buy:${m.tableId}:${m.author.toLowerCase()}:${m.key}`;
}
