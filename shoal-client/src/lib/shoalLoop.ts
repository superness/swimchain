/**
 * The loop — the seam between the node bridge and the deterministic fold.
 *
 * The bridge (shoalRoom.ts) hands this module the WHOLE ROOM on every poll, as
 * a fresh array, in no guaranteed order relative to what it handed over last
 * time. The engine (shoalEngine.ts) offers `foldTick`, which advances one tick
 * from an existing state and costs nothing per already-folded tick. Bridging
 * those two is all this module does, and it is the reason `foldTick` exists: an
 * epoch is 14_400 ticks with O(n^2) shelter in each, so re-folding it on every
 * frame is not viable.
 *
 * Two open items in docs/THE_SHOAL_OPEN_ITEMS.md section 8 are closed here —
 * "foldShoal throws a RangeError at every epoch end" and "the incremental fold
 * is currently unreachable."
 *
 * =============================================================================
 * 1. WHY `hash` IS A SOUND DEDUPE KEY — AND WHAT IT DOES NOT BUY
 * =============================================================================
 *
 * A `LogEntry.hash` is the reply's `content_id`, sourced from the reply's own
 * envelope and never from its body (shoalRoom.ts's module header). It is
 * content-addressed by the node, so two entries share a hash only if they are
 * the same reply; `repliesToLog` already collapses the duplicate copies one
 * fetch can contain (a pending row and its later-finalized self), and
 * `orderLog`'s (ms, hash) total order ALREADY depends on hashes being distinct
 * — if they were not, two clients could sort the same log differently and
 * diverge, which is a far older problem than this module. So hash is exactly
 * the right identity for "have I already got this entry."
 *
 * WHAT IT DOES NOT BUY IS ORDER. Identity answers "have I seen this before";
 * it says nothing about WHERE the entry belongs. `foldTick` walks the log with
 * a cursor (`ShoalState.cursor`), and a never-before-seen entry can still land
 * BEHIND that cursor. That is the whole of section 2.
 *
 * A measured aside, because it changes what the dedupe is FOR. Applying an
 * identical entry twice is already a no-op in this engine: presence is
 * last-write-wins and re-reads the row it just wrote as its own `prior`, and a
 * duplicate eat claim is refused by its own `EAT_COOLDOWN_MS` at a delta of
 * zero (bloom.ts:129). Folding `[...log, ...log]` and `[...log, ...log,
 * ...log]` both produce a byte-identical world to folding `log` — verified in
 * shoalLoop.test.ts's header. The dedupe is therefore load-bearing for COST,
 * not for the fingerprint: without it every poll re-admits the whole room,
 * every entry classifies as late, and every frame pays a full-epoch replay —
 * the incremental path stops existing. It is also load-bearing against the
 * FUTURE: that absorption is a property of today's consensus constants, not a
 * licence, and any verb that accumulates rather than latches would
 * double-credit on the first refetch.
 *
 * =============================================================================
 * 2. THE LATE-ENTRY RULE: ABSORB BY BOUNDED REPLAY, NEVER DROP
 * =============================================================================
 *
 * Gossip is not ordered and the bridge refetches the whole room, so an entry
 * whose `ms` precedes ticks this client has already folded is routine, not
 * hypothetical. THE RULE:
 *
 *   An entry is appended to the live log only if `entry.ms > lastTickMs`, the
 *   most recent tick already folded. Anything else re-enters through
 *   `foldShoal` — the epoch is re-folded from its own warm start with the
 *   enlarged log, exactly as a cold joiner folds it. Nothing is ever dropped
 *   for being late, and nothing is ever applied out of order.
 *
 * The property that buys, and the one shoalLoop.test.ts asserts directly:
 * **`advance` is a pure function of (epoch, seed, the SET of entries admitted,
 * toMs).** Two clients holding the same entries agree no matter what order
 * those entries arrived in or when each of them polled. That is the single
 * property this engine exists to provide.
 *
 * WHY `ms > lastTickMs` IS EXACTLY THE SAFE CONDITION, not merely a
 * conservative one. `foldTick` drains `while (log[cursor].ms <= t)`, so after
 * the tick at `lastTickMs` the entries before the cursor are precisely
 * `{ms <= lastTickMs}` (plus the prefix `foldShoal` skipped — see section 3,
 * which is strictly older still). The log is sorted by (ms, hash), so an entry
 * with `ms > lastTickMs` sorts after every one of them and lands at an index
 * at or after the cursor: the cursor stays valid and the re-sorted array is an
 * append relative to what has been folded, which is the exact condition
 * `ShoalState.cursor`'s own doc requires. An entry with `ms == lastTickMs` does
 * NOT qualify — its tick has already drained every entry sharing that ms, so
 * it would have to be inserted before the cursor. Hence `>`, not `>=`.
 *
 * WHAT WAS REJECTED, and why:
 *
 *  - **Drop it.** Defensible on the grounds that the fold is append-only
 *    forward, and cheap. Rejected because it makes the world a function of
 *    ARRIVAL ORDER: a client that polled a second earlier than its neighbour
 *    folds a different sea, forever, and at the boundary the two publish
 *    different checkpoints for the same history. Preventing exactly that is
 *    the reason the fold is deterministic at all, and fold rules are permanent
 *    (project_fold_rules_are_permanent) — this is not a knob to be corrected
 *    later.
 *  - **Re-fold the epoch every poll.** Correct, and it is what `foldTick` was
 *    merged to avoid: 14_400 ticks per frame.
 *  - **The bounded middle, chosen.** Replay ONLY when an entry actually lands
 *    behind the cursor. The cost is bounded by construction at one epoch
 *    (spec 3.9 point 2 — nothing ever replays from genesis), it is paid per
 *    late arrival rather than per frame, and it is the SAME code path a cold
 *    joiner runs, so it cannot introduce a second definition of the world.
 *    Measured on the test fixture: a full 14_760-tick epoch replay is ~10 ms.
 *    Section 3 shaves the common case further by absorbing, with no replay at
 *    all, entries the fold provably cannot see.
 *
 * THE ONE PLACE THE RULE STOPS, stated because it is a real limit and not a
 * bug being hidden: a checkpoint is published AT the boundary (spec 3.9), so
 * an entry that arrives after the roll can no longer change the epoch it
 * belonged to. It is still absorbed into the epoch now being folded — the new
 * epoch's warm-up window reaches 180 s back, so late deliveries from the last
 * three minutes of the previous epoch still land — but two clients that rolled
 * holding different entry sets have published different checkpoints. That is a
 * property of the epoch design, which is exactly why checkpoints are published
 * and comparable; it is not something this module can fix, and pretending
 * otherwise by widening the replay backwards would mean re-folding closed
 * epochs and re-issuing checkpoints nobody would accept.
 *
 * RESIDUAL COST, unforeclosed: a hostile writer can force one full-epoch
 * replay per poll by back-dating one entry each time. That is a frame-rate
 * attack on the client, never a divergence — every client that receives the
 * entry converges on the same world. The bound that would foreclose it is a
 * sanity bound on the body's `ms`, which is open item 5 in
 * docs/THE_SHOAL_OPEN_ITEMS.md and is a CONSENSUS rule needing its own design.
 * It is deliberately not invented here.
 *
 * =============================================================================
 * 3. THE ADMIT FLOOR: entries the fold provably cannot see
 * =============================================================================
 *
 * `foldShoal` skips a prefix of its own log before the first tick: every entry
 * with `ms < epochWarmStartMs(epoch) - PRESENCE_TTL_MS`, because such an
 * entry's presence has already expired at the very first warm-up tick, so step
 * 2 would evict it on the tick step 1 admitted it. Adding one to the log
 * therefore cannot change the fold — the skip simply grows by one. So the loop
 * absorbs them with NO replay and does not carry them at all.
 *
 * This is not an optimisation of convenience. The room post never rotates
 * (open item 1), so a poll keeps returning every reply the room has ever held;
 * without this the fold's log would grow for the life of the room and every
 * replay would re-sort all of it. With it, the log holds at most the ~1 hour
 * an epoch spans plus the 180 s of prior history the warm-up reads.
 *
 * The floor is EXACT, not conservative: an entry AT it expires at the first
 * warm-up tick and `foldTick` evicts only on `t > expiresMs`, so it is alive
 * for that tick, leaves a `departed` row, and DOES change the fold. Both sides
 * are pinned against the engine itself in shoalLoop.test.ts section 4.
 *
 * `appliedHashes` still remembers a floored-out entry, so a refetch does not
 * reconsider it every poll.
 *
 * THAT SET'S BOUND, CORRECTED. This paragraph used to say it was bounded by
 * the room's own fetch ceiling (`ROOM_FETCH_LIMIT`, past which
 * `narrowRoomReplies` refuses the response outright). That is true of REAL
 * content ids and false of the log a shell actually hands over: `chainSea.ts`
 * mints a synthetic `pending-N` hash for every optimistic local write, and
 * those are hashes no room will ever serve, so no ceiling on the room bounds
 * them. At the emitter's own rate — up to 21 presence writes a minute plus up
 * to 24 eat claims (`shoalEmit.ts`'s budget table) — that is roughly 2,700
 * synthetic hashes an hour, and NOTHING removed them: the rollover pruned
 * `ordered` and left `applied` alone, so the set grew for the life of the
 * window.
 *
 * The rollover now prunes BOTH, to exactly the hashes `ordered` still holds
 * (section 4). That is safe rather than merely tidy: every hash it drops
 * belongs to an entry whose `ms` is below the NEXT epoch's admit floor, and
 * floors only ever move forward — so a re-offered copy is re-added to
 * `applied` and then floored again on the same pass, reaching neither `fresh`
 * nor `behindCursor`. The observable behaviour ("a refetch cannot re-admit a
 * floored-out entry") is unchanged; what changes is that the set is now
 * bounded per epoch instead of per session. Pinned in shoalLoop.test.ts
 * section 6.
 *
 * =============================================================================
 * 4. THE ROLLOVER: there is exactly one way to start an epoch
 * =============================================================================
 *
 * Spec 3.9 point 3. A rollover publishes a checkpoint and re-enters through
 * the SAME seeded warm-up path a cold joiner uses; it never carries live state
 * across. A carried continuation was measured disagreeing with a cold fold on
 * `touchedIds`, `outsideTicks` (14_396 vs 237) and `tension` (51_000 vs
 * 15_750), landing their sweeps six seconds apart — two honest clients
 * publishing different checkpoints for the same world. So `advance` does
 * literally this, and nothing cleverer:
 *
 *   const cp = rollEpoch(state);                                    // e closes
 *   state = foldShoal(log, t, { epoch: e + 1, seed: cp });          // e+1 opens
 *
 * AT MOST ONE ROLLOVER PER CALL — which is why `advance` returns a single
 * `rolled` rather than a list. Work per call stays bounded at roughly one
 * epoch of ticks even if the caller has been asleep for hours; a caller that
 * has fallen further behind catches up by calling again, and `rolled` tells it
 * a checkpoint is waiting to be published each time.
 *
 * =============================================================================
 * 5. CALLING CONVENTION
 * =============================================================================
 *
 * `advance` CONSUMES the `LoopState` it is given — it advances `loop.state` in
 * place (as `foldTick` does) and mutates `loop.appliedHashes` — and returns
 * the LoopState to use from then on. Do not keep or re-use the old one; the
 * same discipline `rollEpoch`'s doc states for `ShoalState`.
 *
 * Integer math only, and no wall-clock read anywhere in this file: the caller
 * passes `toMs`.
 */
import type { Checkpoint, LogEntry, ShoalState } from './shoalTypes';
import { foldShoal, foldTick, orderLog, rollEpoch } from './shoalEngine';
import { epochEndMs, epochFoldEndMs, epochStartMs, epochWarmStartMs } from './epoch';
import { PRESENCE_TTL_MS, TICK_MS } from './shoalConst';

/**
 * A driver's whole state: the folded world, which epoch it is folding, the
 * checkpoint that seeded that epoch, the log the fold is walking, and the
 * hashes already admitted.
 *
 * `ordered` is `orderLog`'s output and is the array handed to every `foldTick`
 * call — the same content in the same order across a fold, as
 * `ShoalState.cursor` requires. It is REBUILT (a new array) whenever entries
 * are admitted, never mutated in place, so a `ShoalState` that is still
 * walking the old array is never left holding a cursor into a changed one.
 *
 * `appliedHashes` means "already admitted into this driver's history", which
 * includes entries whose tick has not arrived yet — they are already in
 * `ordered` and the cursor will reach them — and entries dropped under the
 * admit floor, which the fold provably cannot see.
 *
 * `replays` counts bounded epoch replays performed (section 2). Diagnostic
 * only: nothing in the fold reads it, and it is not part of any checkpoint.
 */
export interface LoopState {
  state: ShoalState;
  epoch: number;
  appliedHashes: Set<string>;
  seed: Checkpoint | null;
  ordered: readonly LogEntry[];
  replays: number;
}

/**
 * The oldest `ms` an entry may carry and still be able to change epoch
 * `epoch`'s fold: `epochWarmStartMs(epoch) - PRESENCE_TTL_MS`. Mirrors
 * `foldShoal`'s own cursor prefix skip — see section 3. Exported so the shell
 * (and the test) can reason about the same number rather than re-deriving it.
 */
export function admitFloorMs(epoch: number): number {
  return epochWarmStartMs(epoch) - PRESENCE_TTL_MS;
}

/**
 * Start a driver for `epoch`, seeded by the previous epoch's checkpoint (or
 * `null` for an unseeded start — a brand-new sea, or a joiner with no
 * checkpoint in reach).
 *
 * The state is built by `foldShoal` over an EMPTY log, folded to the epoch's
 * own first ms: the warm-up runs, the seed is adopted at the origin, and
 * nothing else has happened yet. That is precisely the world a cold joiner
 * holds before any reply has reached it, and building it through `foldShoal`
 * rather than by hand is what keeps "exactly one way to start an epoch" true
 * of this module too — the seed-adoption rules live in one place, and this is
 * not a second copy of them.
 *
 * The first `advance` that brings entries older than the origin will replay
 * over them, which is correct and is the path the rule in section 2 describes.
 */
export function createLoop(epoch: number, seed: Checkpoint | null): LoopState {
  return {
    state: foldShoal([], epochStartMs(epoch), { epoch, seed: seed ?? undefined }),
    epoch,
    appliedHashes: new Set<string>(),
    seed,
    ordered: [],
    replays: 0,
  };
}

/**
 * Admit whatever is new in `entries`, then fold forward to `toMs`, rolling the
 * epoch if `toMs` has reached its end.
 *
 * `entries` is the bridge's whole-room log; it is read, never mutated, and its
 * order is irrelevant. `toMs` is the caller's clock — this module never reads
 * one. A `toMs` at or behind the current tick simply folds nothing.
 *
 * Returns the LoopState to use from now on, plus the checkpoint published if a
 * boundary was crossed (`null` otherwise). See section 5 on consumption.
 */
export function advance(
  loop: LoopState,
  entries: readonly LogEntry[],
  toMs: number,
): { loop: LoopState; rolled: Checkpoint | null } {
  let epoch = loop.epoch;
  let seed = loop.seed;
  let state = loop.state;
  let replays = loop.replays;
  const applied = loop.appliedHashes;

  // --- 1. Admit. `lastTickMs` is the most recent tick folded: `foldShoal` and
  // `foldTick` both leave `nowMs` one tick past it.
  const lastTickMs = state.nowMs - TICK_MS;
  const floorMs = admitFloorMs(epoch);
  const fresh: LogEntry[] = [];
  let behindCursor = false;
  for (const e of entries) {
    if (applied.has(e.hash)) continue;
    applied.add(e.hash);
    // Below the floor the fold's own cursor skip swallows it, so carrying it
    // would change nothing except the size of the log (section 3).
    if (e.ms < floorMs) continue;
    if (e.ms <= lastTickMs) behindCursor = true;
    fresh.push(e);
  }
  let ordered = loop.ordered;
  if (fresh.length > 0) ordered = orderLog([...ordered, ...fresh]);

  // --- 2. Anything that landed behind the cursor is absorbed by re-folding
  // the epoch from its warm start, through the same seeded path a cold joiner
  // takes (section 2). The replay ends on exactly the tick the fold was
  // already on, so step 3 continues from where it would have.
  if (behindCursor) {
    state = foldShoal(ordered, lastTickMs, { epoch, seed: seed ?? undefined });
    replays++;
  }

  // --- 3. Fold forward, never past this epoch's last legal tick.
  const foldEnd = epochFoldEndMs(epoch);
  const target = toMs < foldEnd ? toMs : foldEnd;
  while (state.nowMs <= target) state = foldTick(state, ordered);

  // --- 4. The rollover (section 4). Reached only when the caller's clock has
  // actually passed the boundary, so step 3 above necessarily folded to
  // `foldEnd` and left `nowMs` exactly on `epochEndMs(epoch)` — which is
  // `rollEpoch`'s precondition.
  let rolled: Checkpoint | null = null;
  if (toMs >= epochEndMs(epoch)) {
    rolled = rollEpoch(state);
    epoch += 1;
    seed = rolled;
    // Prune what the next epoch's fold provably cannot see, for the same
    // reason step 1 never admitted it. Safe HERE specifically because the
    // state is about to be rebuilt from scratch by `foldShoal`, which
    // recomputes its cursor from zero; pruning mid-epoch would invalidate a
    // live cursor.
    const nextFloorMs = admitFloorMs(epoch);
    ordered = ordered.filter((e) => e.ms >= nextFloorMs);
    // ...and prune `applied` WITH it, to exactly what `ordered` still holds.
    // Without this the set is bounded per SESSION rather than per epoch: a
    // shell's optimistic local writes carry synthetic `pending-N` hashes no
    // room will ever serve, so the room's own fetch ceiling does not bound them
    // (~2,700 an hour at the emitter's rate — see section 3). Safe because
    // every hash dropped here belongs to an entry below the next epoch's admit
    // floor, and floors only move forward, so a re-offered copy is floored
    // again on the same pass it is re-added.
    const keep = new Set<string>();
    for (const e of ordered) keep.add(e.hash);
    for (const h of applied) if (!keep.has(h)) applied.delete(h);
    const nextFoldEnd = epochFoldEndMs(epoch);
    state = foldShoal(ordered, toMs < nextFoldEnd ? toMs : nextFoldEnd, { epoch, seed });
  }

  return {
    loop: { state, epoch, appliedHashes: applied, seed, ordered, replays },
    rolled,
  };
}
