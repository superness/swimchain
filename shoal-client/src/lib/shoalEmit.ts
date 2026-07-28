/**
 * The Shoal — deciding when to write a swim vector (plan 2b, task 5, "the
 * bridge"). Spec §3.3: a player never writes a step. They write a **swim
 * vector** — `{x, y, heading, speed, t}` — meaning *from here, at this
 * instant, I am heading that way*. Every other client dead-reckons forward
 * from that one message. A new vector is emitted only on a change of mind:
 * turn, stop, arrive, dart. This module is the entire distance between a
 * 60fps render loop and that ~1-write-per-3-8s cadence: without it, an
 * emitter that writes per frame breaks both hard platform limits below and
 * crowds every other swimmer out of a mempool budget they all share.
 *
 * ## The differential-PoW mitigation is STATED INTENT, NOT IMPLEMENTED
 *
 * An earlier version of this header claimed that because eviction takes the
 * lowest-PoW actions first, a per-frame emitter would evict "other players'
 * speech" — i.e. that speech mines harder than movement and therefore outranks
 * it in the eviction queue. THAT MECHANISM DOES NOT EXIST. Every shoal write —
 * a swim vector, a swim vector carrying `say`, an eat claim — is submitted as a
 * `Reply` at `difficultyFor`'s MINIMUM for that action type (shoalSend.ts:
 * `submitMove` mines `ACTION_TYPE_REPLY` and `difficultyFor` deliberately
 * returns the minimum, since anything above it is pure wasted work). So all
 * shoal actions carry identical difficulty and eviction has NO ordering signal
 * among them: past capacity the mempool sheds whichever of them it sheds, and
 * speech is exactly as evictable as a keep-alive.
 *
 * The design's "footsteps stutter before speech is lost" (the design doc §3.6,
 * "Eviction is a feature") is therefore an INTENT this bridge does not yet
 * implement. Implementing it would mean deliberately over-mining speech-bearing
 * writes above the minimum — a real, quantified cost per write and a policy
 * decision, not a comment. Until then, MIN_EMIT_GAP_MS is the ONLY thing
 * keeping one client from crowding the shared per-space budget, which is why
 * the floor below is absolute and has no change-of-mind exception.
 *
 * `shouldEmit` is pure — no wall-clock reads. `intent.t` and `lastEmitMs` are
 * its only source of time (global constraint); callers own a real clock, and
 * read it exactly ONCE per decision — see `shouldEmit`'s own "one clock" note.
 *
 * ## Why position (x, y) is never compared
 *
 * `intent` is the vector the caller's OWN local simulation would produce if
 * it wrote right now — including x/y continuing to advance every frame from
 * simple dead reckoning off the last vector, exactly like every OTHER
 * client's reckoning of this swimmer. Comparing raw x/y for "did it change"
 * would therefore see a difference on almost every call once any time has
 * passed at all (the fish moved, by construction) — either always true (if
 * compared for exact equality) or requiring its own separately-tuned
 * distance threshold that duplicates information already carried by heading
 * and speed. "Arrive" is not a distinct signal needing its own check: a
 * swimmer reaching a destination reports it exactly the way a stop does —
 * speed drops to 0 — so the (heading, speed) comparison already covers it.
 *
 * ## Is `shouldEmit`'s (last, intent, lastEmitMs) signature
 * sufficient to tell a dart from a plain heading change?
 *
 * Yes, and this is not a guess to verify by adding a parameter — a dart is
 * fully expressed as a SPEED change already carried inside `intent`
 * (`Vec.speed` moving to a dart speed), exactly the same field a stop uses
 * to move to 0. Speed takes only a few meaningful values in this engine
 * (stopped, cruising, darting — see SPEED_CRUISE/SPEED_DART in
 * shoalConst.ts), so comparing `intent.speed !== last.speed` for exact
 * inequality already distinguishes "still cruising, just turned" (speed
 * unchanged, heading changed) from "darted" or "stopped" (speed changed,
 * heading may not have) with nothing beyond the two Vec snapshots the brief
 * already specifies. No extra "intent kind" tag is needed — pinned by
 * shoalEmit.test.ts's dart case.
 *
 * ## MIN_EMIT_GAP_MS / MAX_EMIT_GAP_MS: derived, not chosen freely
 *
 * Both are POLICY, not consensus — nothing here is folded, so any client
 * (or a later tuning pass) can change these with no coordination and no
 * history re-score. But the values below are not arbitrary-but-practical
 * placeholders either: they reproduce the numbers
 * `docs/superpowers/specs/2026-07-27-the-shoal-design.md` §3.6 already
 * sized the whole design against, verified here against the same node
 * source that doc cites:
 *
 *  - RPC write cap: 120/min (`src/rpc/rate_limiter.rs:70`) — a per-client
 *    backstop this project owns. At MIN_EMIT_GAP_MS=3_000, one client tops
 *    out at `60_000 / 3_000 + 1 = 21` writes/min — 5.7x under the cap. This
 *    is NEVER the binding constraint; see the next point.
 *  - `MAX_ACTIONS_PER_SPACE = 2_000`, lowest-PoW-first eviction
 *    (`src/blocks/builder.rs:92`), and `TARGET_BLOCK_INTERVAL = 600` s
 *    (`src/blocks/leader.rs:16`) — this IS the tighter constraint, because
 *    it is a budget SHARED by every swimmer in the space, not a per-client
 *    allowance. A 25-swimmer shoal (the design's own stated ceiling) idling
 *    at the MAX_EMIT_GAP_MS keep-alive rate for one whole block window
 *    uses `25 * (600_000 / 8_000) = 1_875 <= 2_000` — fits, with margin
 *    left over for eat-claims sharing the same budget. The SAME shoal, all
 *    25 continuously turning at the MIN_EMIT_GAP_MS floor for the whole
 *    window, would need `25 * (600_000 / 3_000) = 5_000 > 2_000` — over
 *    budget. That is not a defect in these constants: past capacity the
 *    mempool sheds the lowest-PoW pending action first, by design ("Eviction
 *    is a feature", same doc §3.6). NOTE that among SHOAL writes this shedding
 *    is undirected — every one of them is a Reply at the same minimum
 *    difficulty, so the doc's "footsteps stutter before speech is lost" does
 *    not hold here; see the unimplemented-differential-PoW note above.
 *    MIN_EMIT_GAP_MS's job is to make sure that degradation only
 *    engages under genuinely heavy simultaneous activity, not on every
 *    render frame. Full arithmetic, including the RPC-cap and per-space
 *    checks run as real assertions, lives in shoalEmit.test.ts.
 *  - `PRESENCE_TTL_MS = 90_000` (shoalConst.ts) — MAX_EMIT_GAP_MS=8_000
 *    gives `2 * MAX_EMIT_GAP_MS = 16_000 < 90_000`, with 74_000 ms (~74 s,
 *    5.6x) of margin — comfortably enough to survive one entirely missed
 *    keep-alive (the next one still lands well inside the TTL) plus
 *    ordinary gossip latency ("seconds", per §3.4). See shoalEmit.test.ts
 *    for the relationship asserted directly against the imported
 *    PRESENCE_TTL_MS, not a hardcoded pair of numbers.
 */
import type { Vec } from './shoalTypes';
import { HEADING_STEPS } from './shoalConst';

// Note: PRESENCE_TTL_MS (shoalConst.ts) is cited in the module header's
// derivation above but not imported here — this module does no TTL math
// itself (that is the fold's job; shouldEmit only decides when to write).
// shoalEmit.test.ts imports PRESENCE_TTL_MS directly and asserts the
// keep-alive relationship against it.

// ---------------------------------------------------------------------------
// POLICY — free to change at any time; nothing here is consensus. See the
// module header above for the full derivation against the two hard platform
// limits (RPC write cap, per-space mempool budget) and the presence TTL.
// ---------------------------------------------------------------------------

/**
 * Floor: no client may emit more often than this, regardless of how much
 * `intent` has changed. Applies UNCONDITIONALLY — there is no "but it's a
 * real change of mind" exception, because such an exception is exactly what
 * a 60fps loop (or a burst of jitter that keeps crossing the heading
 * threshold) would exploit to blow the per-space budget above. See
 * shoalEmit.test.ts's "the floor is absolute" case and its burst test.
 */
export const MIN_EMIT_GAP_MS = 3_000;

/**
 * Ceiling: if nothing has changed for this long, emit anyway — a
 * keep-alive, so presence does not lapse under PRESENCE_TTL_MS on other
 * clients' folds. See the module header's TTL-margin derivation.
 */
export const MAX_EMIT_GAP_MS = 8_000;

/**
 * A heading delta at or above this (in brads, out of HEADING_STEPS=256)
 * counts as a turn. Arbitrary-but-practical: HEADING_STEPS/32, ~11.25
 * degrees — wide enough to absorb ordinary input-smoothing jitter, tight
 * enough that a real course correction is never mistaken for noise. Unlike
 * MIN_EMIT_GAP_MS/MAX_EMIT_GAP_MS this has no hard platform number driving
 * it; it has never been played, same caveat as this codebase's other
 * arbitrary-but-practical constants (see shoalConst.ts's module header).
 */
export const HEADING_CHANGE_THRESHOLD_BRADS = 8;

/**
 * Circular distance between two headings, in brads — the short way around
 * the HEADING_STEPS wheel, so a turn from 254 to 2 (4 brads the short way)
 * is never mistaken for a 252-brad turn the long way. Both inputs are
 * assumed already in `[0, HEADING_STEPS)` — shouldEmit never constructs an
 * out-of-range value itself, and the wire boundary
 * (shoalWire.ts's `encodePresence`) enforces the range before anything
 * reaches this function.
 */
function headingDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % HEADING_STEPS;
  return diff <= HEADING_STEPS - diff ? diff : HEADING_STEPS - diff;
}

/**
 * True if `intent` differs from `last` by enough to count as a change of
 * mind, independent of timing (the timing gate lives in `shouldEmit`).
 *
 * Speed is compared for exact inequality: it only ever takes a handful of
 * meaningful states in this engine (stopped, cruising, darting), so ANY
 * difference is a change of mind — unlike heading, which is effectively
 * continuous and needs a threshold to filter jitter. This is also what
 * makes a dart or a stop distinguishable from a plain turn using nothing
 * more than the two Vec snapshots — see the module header.
 *
 * Position is deliberately not read here — see the module header.
 */
function isChangeOfMind(last: Vec, intent: Vec): boolean {
  if (intent.speed !== last.speed) return true;
  return headingDelta(last.heading, intent.heading) >= HEADING_CHANGE_THRESHOLD_BRADS;
}

/**
 * Decide whether to write `intent` now.
 *
 *  - `last === null` (no prior vector for this session): always emit —
 *    there is nothing yet for any other client to dead-reckon from.
 *  - `intent.t - lastEmitMs < MIN_EMIT_GAP_MS`: never emit, unconditionally.
 *  - `intent.t - lastEmitMs >= MAX_EMIT_GAP_MS`: always emit — the keep-alive,
 *    regardless of whether `intent` has changed at all.
 *  - Otherwise (the gap is between the floor and the ceiling): emit only if
 *    `intent` represents a genuine change of mind versus `last`.
 *
 * ## ONE CLOCK: the gap is measured against `intent.t`, not a separate `nowMs`
 *
 * This function used to take a `nowMs` parameter and gate on it, while the
 * value that actually reached the wire was `intent.t`. Those are the SAME
 * INSTANT by definition — `intent` is "the vector I would write right now", and
 * `shoalSend`'s own header states the design "gives the caller exactly one
 * clock read to make instead of two". A second parameter for the same instant
 * is not merely redundant, it is a way for the two to disagree: a caller that
 * reused a stale `intent` against a fresh `nowMs` (or the reverse) would gate
 * on one millisecond and publish another, and the failure would be a silently
 * mis-spaced write cadence with nothing to catch it.
 *
 * It also removes the last way an honest client could author two byte-identical
 * bodies. With two clocks, a keep-alive could re-publish a `Vec` whose `t` had
 * not advanced; identical `t`, identical fields, identical body, identical
 * `content_id = sha256(body)` — and the node keeps only one of them. That is
 * the same-swimmer half of the collision argument in shoalWire.ts's salt
 * section, and it closes here rather than there.
 */
export function shouldEmit(last: Vec | null, intent: Vec, lastEmitMs: number): boolean {
  if (last === null) return true;
  const gap = intent.t - lastEmitMs;
  if (gap < MIN_EMIT_GAP_MS) return false;
  if (gap >= MAX_EMIT_GAP_MS) return true;
  return isChangeOfMind(last, intent);
}
