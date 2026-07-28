/**
 * Checkpoints: the state that crosses an epoch boundary (spec 3.9) — size,
 * plus a bounded tail of recent-bite state. Everything else a client needs
 * across a boundary is RECONSTRUCTED by the warm-up replay rather than
 * transmitted here (see WARMUP_MS in shoalConst.ts): what belongs in a
 * checkpoint is durable, player-owned value that no bounded replay can
 * recover. See `Checkpoint`'s doc in shoalTypes.ts for why the recent-bite
 * tail is part of that — both halves of it are reachable, though the void
 * ledger only became so once the warm-up let a hush cross the boundary.
 *
 * A joining client adopts the newest checkpoint it can see rather than
 * replaying from genesis, so two honest clients MUST compute byte-identical
 * checkpoints for the same world, or they cannot tell agreement from
 * disagreement. Everything here exists in service of that: `sizes` and
 * `recent` are sorted arrays rather than Maps (see shoalTypes.ts's
 * `Checkpoint` doc), and `parseCheckpoint` rejects rather than repairs
 * anything that is not already canonical — accepting two different
 * serialisations of the same world would defeat the point of publishing one.
 */
import type { ShoalState, Checkpoint } from './shoalTypes';
import { VOID_WINDOW_MS } from './shoalConst';
import { epochEndMs } from './epoch';

/**
 * Build the checkpoint for `state` at `epoch`.
 *
 * Merges live `fish` sizes with `departed` sizes into one sorted array. A
 * live fish and a departed record are mutually exclusive by construction:
 * shoalEngine.ts's revival path (in `foldTick`'s step 1) deletes a
 * swimmer's `departed` record the moment it revives them, specifically so no
 * stale row can coexist with (or be read behind) the now-live `fish` entry.
 * This function still treats `fish` as authoritative over `departed` for the
 * same id — belt-and-braces against a state built by some other caller (e.g.
 * a hand-built `ShoalState` in a test) that never went through that revival
 * path and so was never guaranteed to have made the same cleanup.
 *
 * `recent` includes `[id, lastBiteMs, recentBites]` only for swimmers whose
 * `lastBiteMs` is within `VOID_WINDOW_MS` of `epochEndMs(epoch)` — see
 * shoalTypes.ts's `Checkpoint` doc for why this exists and why the cutoff
 * keeps the payload small.
 *
 * The cutoff is measured against the EPOCH'S END, never `state.nowMs`.
 * `state.nowMs` is whatever tick the caller happened to stop on, so measuring
 * against it made the serialisation a function of the fold's endpoint: the
 * same epoch, the same log and the same world, folded to three defensible
 * endpoints, produced three different `recent` tails and therefore three
 * different byte strings. That destroys the single property a checkpoint
 * exists for — two honest clients must produce identical bytes or they cannot
 * tell agreement from disagreement. `epochEndMs(epoch)` is a constant of the
 * epoch, known to every client, and is the instant the checkpoint conceptually
 * describes.
 *
 * Throws a `RangeError` when `state.epoch` is not `epoch`. Since the cutoff
 * now depends on `epoch`, checkpointing a mid-epoch-3 state as epoch 7 would
 * silently produce a `recent` tail measured against the wrong hour — a wrong
 * answer rather than a detectable error.
 *
 * AT AN EPOCH BOUNDARY, CALLERS MUST USE `rollEpoch`, NEVER THIS FUNCTION
 * DIRECTLY. This function does not prune `departed` — only `rollEpoch` does,
 * immediately before it calls this one (spec 3.9 point 6; see `rollEpoch`'s
 * doc in shoalEngine.ts). A checkpoint built here at a boundary without going
 * through `rollEpoch` first still carries every `departed` record the epoch
 * collected, including ones that should have aged out (measured: a lapsed
 * swimmer `ghost` survives at size 300 through this function where
 * `rollEpoch` correctly drops it). That is not a harmless superset — it is a
 * DIFFERENT canonical payload for the same epoch, so a client that calls this
 * function directly at a boundary publishes a checkpoint no honest peer
 * agrees with.
 */
export function checkpointFrom(state: ShoalState, epoch: number): Checkpoint {
  if (state.epoch !== epoch) {
    throw new RangeError(
      `checkpointFrom: state is folding epoch ${state.epoch} but was asked for a ` +
      `checkpoint of epoch ${epoch}. The recent-tail cutoff is measured against ` +
      "epochEndMs(epoch), so a mismatch silently produces the wrong `recent`.",
    );
  }
  const cutoffMs = epochEndMs(epoch);
  const sizes: Array<[string, number]> = [];
  const recent: Array<[string, number, number[]]> = [];
  const record = (id: string, size: number, lastBiteMs: number, recentBites: number[]) => {
    sizes.push([id, size]);
    if (lastBiteMs >= 0 && cutoffMs - lastBiteMs <= VOID_WINDOW_MS) {
      // Copied, not aliased: `recentBites` is the live array on the Fish or
      // Departed record it came from. A published checkpoint must not change
      // underneath its publisher because the fold kept folding.
      recent.push([id, lastBiteMs, [...recentBites]]);
    }
  };
  for (const f of state.fish.values()) record(f.id, f.size, f.lastBiteMs, f.recentBites);
  for (const [id, d] of state.departed) {
    if (state.fish.has(id)) continue; // live wins; see doc comment above
    record(id, d.size, d.lastBiteMs, d.recentBites);
  }
  sizes.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  recent.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { epoch, sizes, recent };
}

/**
 * Canonical text form. `sizes` and `recent` are already sorted by
 * `checkpointFrom`, and all three fields are written in a fixed order
 * (`epoch`, `sizes`, `recent`), so plain `JSON.stringify` is deterministic
 * across clients — no key-order ambiguity to worry about since the object
 * literal always has the same keys in the same order.
 */
export function serialiseCheckpoint(cp: Checkpoint): string {
  return JSON.stringify({ epoch: cp.epoch, sizes: cp.sizes, recent: cp.recent });
}

function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/**
 * Parse text into a Checkpoint, or return null for anything that is not a
 * well-formed, already-canonical checkpoint. Never throws.
 *
 * Rejected, not repaired: bad JSON, missing required fields, a non-integer
 * epoch or size, a non-string id, and — the one that matters most — an array
 * that is not already sorted ascending by id (this applies to `recent` too,
 * exactly as it does to `sizes`). Sorting it here instead of rejecting it
 * would let two different serialisations of the same world both parse to the
 * same in-memory Checkpoint, which defeats the reason these are arrays in
 * the first place: a client could publish an unsorted checkpoint and every
 * peer would silently normalise it instead of detecting the disagreement.
 *
 * `recent` is OPTIONAL on the wire — a checkpoint serialised before this
 * field existed still parses. An absent `recent` means exactly the same
 * thing as an explicitly empty one: "nobody had a bite recent enough to be
 * worth carrying," never "unknown, treat with suspicion." A pre-this-field
 * checkpoint predates any client that could have produced a nonempty
 * `recent` in the first place, so treating its absence as empty loses
 * nothing that was ever actually there. Every in-memory `Checkpoint` this
 * function returns always has a concrete `recent` array (possibly `[]`),
 * never `undefined`, so callers never need an `?? []` of their own.
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

  const recent: Array<[string, number, number[]]> = [];
  if (obj.recent !== undefined) {
    if (!Array.isArray(obj.recent)) return null;
    let prevRecentId: string | null = null;
    for (const entry of obj.recent) {
      if (!Array.isArray(entry) || entry.length !== 3) return null;
      const [id, lastBiteMs, recentBites] = entry;
      if (typeof id !== 'string') return null;
      if (!isInt(lastBiteMs)) return null;
      if (!Array.isArray(recentBites) || !recentBites.every(isInt)) return null;
      if (prevRecentId !== null && !(prevRecentId < id)) return null; // strictly ascending, no dupes
      prevRecentId = id;
      recent.push([id, lastBiteMs, recentBites]);
    }
  }

  return { epoch: obj.epoch, sizes, recent };
}
