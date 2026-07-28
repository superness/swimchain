# The Shoal — open items

*Live tracker. Started 2026-07-28, after plans 1, 2a and 2b merged (PRs #152, #162, #163).*

Design: `docs/superpowers/specs/2026-07-27-the-shoal-design.md`.
Everything here was surfaced by a code review or a live run, not speculation. Each entry
says what is broken, how it was found, and what it costs to leave.

---

## Resolved

### 3. Gossip is unproven end to end *(RESOLVED 2026-07-28)*

Closed by two real peered regtest nodes and `shoal-client/scripts/two-client-smoke.ts`.
Full write-up in place below, under Blockers.

---

### 10. The core loop was unreachable — a swimmer could never eat *(RESOLVED 2026-07-28)*

To eat you must be within `EAT_R` (90) of a cell centre, but you stamp it visited — killing
the bloom for 45 s — at `BLOOM_VISIT_R` (200), and the fastest travel is 55 cu/tick. **Any
approach crossed the trample radius many ticks before reaching the bite radius**, so the
bloom was always dead on arrival. Measured: swim-in 0 bites, spawn-on-cell 6.

Two fixes were tried and measured at 0 bites before the right one was found: matching the
radii, and exempting the bite radius from trampling. Both fail because the approach crosses
the ring regardless of how it is sized.

**Resolved by: a claim ignores the claimant's own visits.** Another fish trampling a bloom
still kills it; you trampling it by arriving does not. `lastVisit` became
`Map<cell, Map<swimmerId, ms>>`, pruned to `BLOOM_READY_MS`. `Checkpoint` is unchanged —
`lastVisit` is rebuilt by the warm-up replay, not carried.

Verified: swim-in-stop-feed credits the full `BLOOM_BITES` at both dart and cruise speed,
and a different fish squatting on the cell still denies it entirely.

Two cautionary notes worth keeping:

- The controller's *own* first probe reported 0 bites and nearly rejected this correct fix.
  Its fish darted straight **through** the bloom into the world edge, in range for a single
  frame. A probe that does not model real behaviour manufactures a bug that is not there —
  the mirror image of one that misses a real bug.
- Pruning `lastVisit` made a full-epoch fold **6× faster** (1.0 s vs 6.0 s; 1,821 stamps vs
  19,199). The bound was added for correctness and paid for itself in speed.

---

## Blockers — decide, don't just build

### 1. Long-lived rooms need a node change, or the room must rotate

**Found by:** the bridge's final whole-branch review, confirmed against the node source.

`get_replies` returns a post's direct children **oldest first** (`src/storage/chain.rs:1511-1540`,
key = `parent || timestamp || hash`) and does not clamp `limit`
(`src/rpc/methods.rs:9358-9363`). The room post never rotates — epochs roll the fold, not
the room — so replies accumulate without bound. Past the fetch limit every client would
receive the **oldest** N and silently drop the entire live window, folding an empty sea.

At the emitter's own derived rate (21 writes/min × 25 swimmers) that is **~3 hours**; on
idle keep-alives, under a day.

A tail fetch is not currently possible:
- `total_count` is **not a total** — the node computes it as `all_replies.len()`
  (`src/rpc/methods.rs:9620`), so it always equals `replies.length`.
- `offset` is honoured but the skip is a linear `O(limit + offset)` scan.
- Pending replies are appended to **every** page, after the limit check.
- `get_content().reply_count` over-estimates (whole subtree plus mempool), and
  `block_height` cannot separate chain rows from mempool rows.

**Mitigated, not fixed.** `fetchRoomLog` now **refuses a truncated log loudly** rather than
folding a wrong one. The documented contract is *rotate the room*, not *raise the limit*.

**Decide:** add a node-side tail fetch (an `order: 'newest'` or a real `total_count`), or
commit to room rotation and design what a rotation boundary means for the fold. Leaving it
turns into a rewrite once a shoal is played for an afternoon.

### 2. No `ensureSponsored` flow

**Found by:** the regtest smoke script, the hard way.

The smoke's first run **passed**, then the block builder logged
`Excluding Reply … author not authorized in space` and purged all six moves; the room fell
back to zero ~45 s later. Regtest bypasses sponsorship at RPC ingestion but not at block
inclusion, and reads honour the mempool — so a broken write looked like a working one.

On testnet and mainnet the gate *is* enforced at ingestion
(`src/rpc/methods.rs:2917`, `:753-759`), so a real player's first write fails loudly rather
than silently. That makes this a plan 4 (onboarding) item rather than a hidden landmine —
but nothing works for a new player until it exists.

Related: the bridge has no way to distinguish "you have no sponsor" from "the node is
down" without string-matching an error message. A typed classification in `shoalSend` is a
small addition and belongs with this work.

### 3. Gossip is unproven end to end — **RESOLVED 2026-07-28**

**Closed by:** `shoal-client/scripts/two-client-smoke.ts`, run against two real peered
regtest nodes (`npm run smoke:two`, 41 checks, ALL PASS — see the Task 7 report).

Two `sw` processes, two data dirs, two port pairs, peered with `--connect` and each
verified to list the *other's* `node_id` via `get_peers`. One identity per node. A presence
written only to node A made node B's client refetch **6040 ms after its watcher started,
19 ms after the write was requested**, against a 60 s poll heartbeat that provably had not
ticked — and the mirror direction held too.

That the event came from `router.rs:5947` and not from a local submission is established by
elimination, made airtight four ways rather than asserted:

1. **The poll timer cannot have fired.** Every watcher ran at `pollIntervalMs = 60_000` and
   the whole watch window was 9,726 ms. `nextAction` only sets `refetch` from a matching
   `content` event or from a `tick`, and no tick was possible.
2. **The observing node received no write.** `globalThis.fetch` is wrapped for the run and
   every (endpoint, method, ms) recorded; node B's endpoint saw only `get_info`,
   `get_peers`, `register_sponsored_identity` and `get_content` up to the refetch. The
   script also **reads the Rust** and asserts every `.publish_content_new(` call site
   outside `router.rs` sits in `submit_post` or `submit_reply`, so the elimination cannot
   silently go stale when a third publisher is added.
3. **A negative control on the same socket** — a watcher on node B with a well-formed but
   different space id — recorded **0** refetches while watcher B recorded 3. Mutation-tested:
   pointing the control at the real space id flips it to 3 and fails the check.
4. **A quiet window first.** All three watchers recorded zero refetches across a 4 s idle
   period before anyone wrote, so no late setup gossip could be mistaken for the event.

Corroborated positively by node B's own log: `[MEMPOOL] Added action … from peer
60f1839fba1dd9a5 to mempool (type=Reply …)` — the gossip-ingest path's own line, a few
above the publisher.

Also proven in the same run: both clients fold to identical fingerprints from two
independent nodes; all three moves finalize with a `block_height` on **both** nodes; and
A's rendered position for B is **exactly** B's own (0 cu), with a one-broadcast-stale view
397.3 cu out against a derived bound of 1320 cu.

---

## Carried items

### 4. Differential PoW is stated intent, not code

The spec's policy table and `shoalEmit.ts`'s header both describe speech mining harder than
movement, so that when a space exceeds `MAX_ACTIONS_PER_SPACE` (2,000, lowest-PoW-first
eviction) footsteps stutter before anyone's words are lost.

**It does not exist.** Every shoal write is a `Reply` mined at the minimum difficulty, so
under eviction pressure there is no ordering signal among shoal actions at all. Now
documented as unimplemented rather than claimed. Either build it or drop the claim from
the spec.

Related, and worth stating in the spec: at the emitter's floor gap, **~10 continuously
turning swimmers** already saturate the per-space budget for a block window — not 25. The
15–25 ceiling is load-dependent, not hard.

### 5. The body's `ms` has no sanity bound

A hostile `ms` is checked against nothing the node knows — not `created_at`, not the action
`timestamp`. A back-dated vector rewrites where a swimmer *was* when someone else's bite is
judged against `reckon(fish.vec, claim.ms)`; a forward-dated one parks a swimmer whose
`expiresMs` is years out — an immortal ghost that shelters and threatens forever, for one
write.

**Unforeclosed, not fixed.** `RawReply` now carries `created_at` so a future fold rule can
add a bound without changing a shape that `repliesToLog` and every checkpoint depend on.
The bound itself is a consensus rule and needs its own design.

### 6. PoW and signing primitives are duplicated five times

`shoal-client` is the fifth copy, and the first in a package with **no React and no Vite** —
which is exactly the shape a shared package would need. But the five copies have genuinely
diverged (this one adds an event-loop yield and encodes regtest's flat-4-bit rule that the
others do not carry), so extraction means reconciling five implementations against the Rust.

**Do it before plan 2c adds a sixth caller**, as its own change with its own review.

### 7. Mainnet provisioning

Not yet started, and not covered by any plan. The same shape Chips and The Trench needed:
an app-addressed space, the room post, and a scoped auto-approve sponsorship offer from the
game-sponsor bot (which auto-renews via `game-offer-keeper-mainnet.service` — adding a game
is one space id in its `GAME_SPACES` env).

### 8. The shared `fingerprint` is not a complete divergence detector

**Found by:** the shell's Task 2 review.

`shoalFixtures.ts`'s `fingerprint` — used by every byte-identical check in the suite —
deliberately omits `touchedIds` and `outsideTicks`. Those are **two of the three fields**
spec §3.9 measured a carried epoch continuation diverging on (the third, `tension`, is
covered).

`outsideTicks` feeds `topContributor` → `lockedPreferred` → `selectTaken` — i.e. **who the
shark eats**. So a divergence confined to it is player-visible and yet invisible to every
determinism check on the project. Nothing has diverged there; the point is that nothing
would tell us if it did.

Widening the fingerprint is cheap. Do it before plan 3 adds wild fish, which touch both
fields.

### 10. A swimmer that swims to a bloom can never eat it — **RESOLVED 2026-07-28**

**Found by:** the shell's Task 5 (the four verbs), measured against the real fold.
**Fixed by:** the claimant-exemption rule (`shoal-client/src/lib/bloom.ts`).

`BLOOM_VISIT_R` (200 cu) is the radius at which a fish marks a cell **visited**; `EAT_R`
(90 cu) is the radius within which it may take a **bite**. The fold stamps `lastVisit` at
the end of a tick (`markVisits`, step 3 of `foldTick`) and judges eat claims at the start of
the next one (step 1). So to take a bite from an **unlatched** bloom, a swimmer had to get
from outside 200 cu to inside 90 cu *within a single tick* — **110 cu in `TICK_MS`**. The
fastest anything in this game moves is `SPEED_DART`, which covers `220 x 250 / 1000 = 55`
cu in a tick. The gap needed **twice the top speed in the game**.

Measured against the real fold, before and after:

| scenario | before | after |
|---|---|---|
| swims in from 600 cu away at **dart**, claims on the `EAT_COOLDOWN_MS` cadence | `bitesTaken = 0`, size 77 | **`bitesTaken = 6`**, size 155 |
| swims in from 600 cu away at **cruise**, same cadence | `bitesTaken = 0`, size 70 | **`bitesTaken = 6`**, size 148 |
| first presence vector already on the cell centre | `bitesTaken = 6` | `bitesTaken = 6` (unchanged) |
| swims in while **another fish** sits on the cell | `bitesTaken = 0` | **`bitesTaken = 0`** (school shadow intact) |

**The ruling: a claim ignores the claimant's own visits.** Another fish trampling a bloom
still kills it; *you* trampling it by arriving does not. Chosen over shrinking
`BLOOM_VISIT_R` because it preserves the design intent exactly — the full 200-cu school
shadow survives, so §2.2's *"food grows in the open, safety is in the crowd, and they are
never in the same place"* still holds — and it needs no exact-tick timing from the client.

Two other candidates were **tried and measured at 0 bites**, and are recorded here so they
are not retried: raising `EAT_R` to 200 (matching the radii), and exempting cells within
`EAT_R` from `markVisits`. Both fail identically — the trample is stamped by *proximity*
and the claim is judged ticks later, so the approach crosses the ring wherever the ring is.

**The exemption is for claims only.** The regrowth reset (`foldTick` step 3) asks
`isBloomReady` with **no** claimant, so a bloom comes back only once the cell has lain
fallow to *everyone*, the last eater included. A lone fish parked on a cell it emptied still
gets exactly one bloom out of it, however long it sits there.

**Shape.** `lastVisit` became `Map<cell, Map<swimmerId, ms>>` (`VisitMap` in
`shoalTypes.ts`). `markVisits` prunes every stamp older than `BLOOM_READY_MS` on the tick it
runs, so the map holds only the last 45 s of cells and swimmers rather than one entry per id
that ever passed a cell. `Checkpoint`'s shape is **unchanged** — `lastVisit` is still
reconstructed by the warm-up replay, never carried.

This was a **consensus** change, free only because nobody has played yet.

Pinned by: `shoalEngine.test.ts` (swim-in at both speeds, the school shadow A/B, the
lone-fish farming case, and the 36-vs-432 pruning bound over 48 swimmers), `bloom.test.ts`
(the rule and the prune at unit level), `shoalEngine.determinism.test.ts` (the fingerprint
reaches both levels of the map), and the arithmetic tripwire in `src/ui/input.test.ts` §8,
which still fails the day either constant moves — that is the day to re-examine whether the
exemption is still load-bearing.

### 11. `content_new` arrives before `get_replies` can serve it

**Found by:** the first run of the two-node smoke, which passed every gossip assertion and
then failed four content assertions in a row.

The node publishes the gossip event immediately after `block_builder.add_action`
(router.rs, a few lines above 5947), but the mempool merge `get_replies` performs is a
different read. Measured lag between the event firing and the log becoming readable:
**74–372 ms** on a local regtest node, in both directions.

So **a `content_new` means "something happened", not "the log now contains it."** A client
that refetches exactly once per event and renders the result drops writes silently. This
never shows up on one node, because the local-submission path writes and merges in the same
call — which is exactly why the bridge's single-node smoke could not have found it.

`startLive` already survives this (its poll heartbeat and silence detection refetch again),
but "eventually" there means up to `DEFAULT_POLL_INTERVAL_MS`. `chainSea.ts` therefore
schedules a second refetch 600 ms after each event-driven one. **Not fixed, accommodated** —
the node-side answer would be to publish after the merge rather than before, and that is a
node change nobody has costed.

### 9. Smaller

- `foldShoal` throws a `RangeError` at every epoch end, so a naive
  `foldShoal(log, Date.now())` in the shell hard-throws once an hour until `rollEpoch` is
  wired. Plan 2c must handle the rollover.
- `fetchRoomLog` returns a fresh array of the whole room every poll, so #162's incremental
  fold has nothing to consume — the incremental path is currently unreachable.
- `onRefetch` is synchronous, returns `void`, and swallows throws, so a shell has no way to
  surface a failed fetch.
- Dart-end (`dart → cruise`) is handled correctly but untested.
- `shoalLoop.advance` is O(|entries|) per call even when nothing is new, so a shell
  calling it from `requestAnimationFrame` with the last-fetched array does up to 100,000
  `Set.has` calls per frame to fold zero ticks. A reference-equality guard fixes it.
- A back-dating writer can force one full-epoch replay per poll — a frame-rate cost, never
  a divergence. The real fix is item 5's `ms` bound.
