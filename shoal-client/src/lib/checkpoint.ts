/**
 * Checkpoints: the only state that crosses an epoch boundary (spec 3.9).
 *
 * A joining client adopts the newest checkpoint it can see rather than
 * replaying from genesis, so two honest clients MUST compute byte-identical
 * checkpoints for the same world, or they cannot tell agreement from
 * disagreement. Everything here exists in service of that: `sizes` is a
 * sorted array rather than a Map (see shoalTypes.ts's `Checkpoint` doc), and
 * `parseCheckpoint` rejects rather than repairs anything that is not already
 * canonical — accepting two different serialisations of the same world would
 * defeat the point of publishing one.
 */
import type { ShoalState, Checkpoint } from './shoalTypes';

/**
 * Build the checkpoint for `state` at `epoch`.
 *
 * Merges live `fish` sizes with `departed` sizes into one sorted array. A
 * live fish and a departed record are documented as mutually exclusive
 * (eviction moves one to the other — shoalTypes.ts's comment on `departed`:
 * "A swimmer who is currently live has no entry that is authoritative;
 * `fish` always wins while it exists"), but checked against shoalEngine.ts
 * directly: the presence branch that revives a departed swimmer
 * (`state.fish.set(e.id, ...)`) never calls `state.departed.delete(e.id)`.
 * So a stale `departed` row CAN survive alongside a freshly-live `fish` row
 * for the same id. This function follows the documented policy and treats
 * `fish` as authoritative: a live entry always wins over a departed one for
 * the same id.
 */
export function checkpointFrom(state: ShoalState, epoch: number): Checkpoint {
  const sizes: Array<[string, number]> = [];
  for (const f of state.fish.values()) sizes.push([f.id, f.size]);
  for (const [id, d] of state.departed) {
    if (state.fish.has(id)) continue; // live wins; see doc comment above
    sizes.push([id, d.size]);
  }
  sizes.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { epoch, sizes };
}

/**
 * Canonical text form. `sizes` is already sorted by `checkpointFrom`, and
 * both fields are written in a fixed order (`epoch` then `sizes`), so plain
 * `JSON.stringify` is deterministic across clients — no key-order ambiguity
 * to worry about since the object literal always has the same two keys in
 * the same order.
 */
export function serialiseCheckpoint(cp: Checkpoint): string {
  return JSON.stringify({ epoch: cp.epoch, sizes: cp.sizes });
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/**
 * Parse text into a Checkpoint, or return null for anything that is not a
 * well-formed, already-canonical checkpoint. Never throws.
 *
 * Rejected, not repaired: bad JSON, missing fields, a non-integer epoch or
 * size, a non-string id, and — the one that matters most — an array that is
 * not already sorted ascending by id. Sorting it here instead of rejecting
 * it would let two different serialisations of the same world both parse to
 * the same in-memory Checkpoint, which defeats the reason `sizes` is an
 * array in the first place: a client could publish an unsorted checkpoint
 * and every peer would silently normalise it instead of detecting the
 * disagreement.
 */
export function parseCheckpoint(text: string): Checkpoint | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (!isInt(obj.epoch)) return null;
  if (!Array.isArray(obj.sizes)) return null;

  const sizes: Array<[string, number]> = [];
  let prevId: string | null = null;
  for (const entry of obj.sizes) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [id, size] = entry;
    if (typeof id !== 'string') return null;
    if (!Number.isInteger(size)) return null;
    if (prevId !== null && !(prevId < id)) return null; // strictly ascending, no dupes
    prevId = id;
    sizes.push([id, size]);
  }

  return { epoch: obj.epoch, sizes };
}
