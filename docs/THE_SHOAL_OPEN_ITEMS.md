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

### 8. The shared `fingerprint` is not a complete divergence detector *(RESOLVED 2026-07-28)*

Closed by Task 1 of plan 3 (the-shoal-wild), before wild fish landed. Full write-up in place
below, under Carried items.

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

### 12. The shell computes a checkpoint every hour and throws it away

**Found by:** the final whole-branch review of the Shoal shell (plan 2c), reading
`chainSea.ts`'s frame step against `shoalLoop.advance`'s return type. Not a live run — it
has never been observed, because nobody has yet had two clients up across an hour boundary.

`advance` returns `{ loop, rolled }`. `chainSea.ts:194-197` writes:

```ts
if (loop === null) loop = createLoop(epochOf(wallMs), null);
loop = advance(loop, combined(), wallMs).loop;   // `.rolled` is discarded
```

`scripts/harness.ts` is the **only** consumer of `rolled` anywhere in the tree, and the only
`createLoop` call on the chain path seeds `null`. **So the shell never publishes a
checkpoint and never adopts one.** Both halves of the mechanism are built, tested and
unreachable.

**What it costs to leave.** Two clients in the same sea disagree about the world, and the
disagreement is the one the game cannot survive:

- A client that has been running through an hour boundary is seeded by its *own* in-memory
  `rolled` (`advance` sets `seed = rolled` internally), so it keeps every swimmer's
  accumulated size across the boundary.
- A client that joins *after* that boundary calls `createLoop(epochOf(now), null)` — an
  **unseeded** fold — and sees every swimmer back at `START_SIZE`.
- Size feeds `shelterWeight` → `shelterOf` → `isExposed` → `selectTaken`. **The two clients
  therefore compute different answers to "who did the shark eat."** `sweep.ts`'s own header
  names that outcome the most trust-destroying bug this game can have.
- Spec §2.7's promise — *"you return the size you left"* — is false across any reload that
  crosses an hour, which is also every crash, every hot reload and every app restart.

This is **not** a divergence between honest folds: `rollEpoch` is deterministic and every
client computes the identical checkpoint. It is a divergence between clients that *have* one
and clients that *cannot get* one, which is worse, because both are behaving correctly.

**Spec §3.9 point 4** — *"Checkpoints are published, deterministic, and self-verifying going
forward"* — is unimplemented: nothing publishes. **Spec §3.9 point 5** — *"A cold joiner
adopts the newest checkpoint it can see and verifies forward from there"* — is unimplemented:
nothing adopts, and a cold joiner re-derives from an unseeded warm-up instead. Points 1, 2
and 3 (grid-aligned origin, fixed era, warm-up replay) **are** implemented and tested; it is
only the two that require a *published* artifact that are missing. The shell plan's
self-review claim "§3.9 epoch rollover → Task 2" is therefore too strong and has been
corrected in `docs/superpowers/plans/2026-07-28-the-shoal-shell.md`.

**What the fix would take** — plan-3 scale, deliberately not attempted on this branch:

1. **A checkpoint wire form and a verb.** `Checkpoint` is a `Map`-bearing structure
   (`shoalTypes.ts`); it needs a canonical, byte-stable encoding in `shoalWire.ts` with its
   own round-trip and ordering tests, because two clients that serialize the same checkpoint
   differently republish different bytes for the same world.
2. **Publish.** A third `send*` in `shoalSend.ts`, mined and signed like the other two, into
   the same room — plus a rule for who publishes. Every client publishing every hour costs
   one write per client per hour (negligible against the per-space budget in item 4), but
   they must all be *identical*, which is exactly what makes them cheap to verify.
3. **Adopt.** `chainSea` must, before its first fold, fetch the room, find the newest
   checkpoint entries for the epoch it is about to fold, and **verify by agreement**: adopt
   the value at least *k* independent authors agree on, never simply "the newest one seen".
   A single hostile publisher who is trusted unilaterally can hand every joiner an arbitrary
   size table — a strictly worse failure than the one being fixed.
4. **The seam already exists and is the easy part.** `createLoop(epoch, seed)` takes a
   checkpoint, `advance` already returns one, and `demoSea.livelySea` already proves the
   seeded-join path folds correctly (that is precisely how its size spread is produced). The
   work is entirely in 1–3.
5. **Ordering against item 1.** The room does not rotate, so checkpoints accumulate in the
   same log that is already heading for `ROOM_FETCH_LIMIT`. Whatever resolves item 1 has to
   resolve where checkpoints live at the same time; doing this first would bake a second
   consumer into a log shape that is going to change.

**Recorded, not fixed.** `chainSea.ts` now says at the call site that `rolled` is dropped
deliberately, what it costs, and points here. Until this is built, the shell is safe only in
a session that never crosses an hour boundary, and any two clients that do cross one together
agree only because they crossed it together.

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

**Corrected 2026-07-28 (final whole-branch review): 10 is the figure for a shoal that never
eats.** The derivation above counted presence writes only, and the eat verb only became
reachable on plan 2c's branch — before item 10's claimant-exemption rule a swimmer that swam
to a bloom was credited nothing, so nobody sent claims. Per swimmer, per 600 s block window:

| what the swimmer is doing | writes per window |
|---|---|
| idle (keep-alives, `MAX_EMIT_GAP_MS` 8_000) | 600_000 / 8_000 = **75** |
| turning at the floor (`MIN_EMIT_GAP_MS` 3_000) | 600_000 / 3_000 = **200** |
| feeding (`EAT_COOLDOWN_MS` 2_500) | 600_000 / 2_500 = **240** |

So against `MAX_ACTIONS_PER_SPACE` = 2_000: **10** turning swimmers saturate it, **6** that
idle and feed, **4** that turn and feed. Feeding is the largest single contributor, and it is
the one rate nothing governs — `shouldEmit` is never consulted for an eat claim. App.tsx asks
`canClaimEat`, which mirrors the FOLD's cooldown so a doomed claim is never mined; that is a
correctness mirror, not a budget policy.

The old sum in `shoalEmit.ts` and `shoalEmit.test.ts` concluded that a 25-swimmer idle shoal
fits `25 × (600_000 / 8_000) = 1_875 ≤ 2_000` "with margin left over for eat-claims sharing
the same budget." The leftover is **125 actions for the whole shoal**, and a *single* feeder
emits 240 — `1_875 + 240 = 2_115 > 2_000`. Both files now carry the corrected arithmetic as
real assertions.

**So eat needs its own emit-side floor, and it does not have one.** Not added on this branch:
it is a policy change with a play-feel cost (a bite refused for a reason the fold would have
allowed) and it belongs with the differential-PoW decision above rather than being slipped in
alongside a comment fix.

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

### 8. The shared `fingerprint` is not a complete divergence detector — **RESOLVED 2026-07-28**

**Found by:** the shell's Task 2 review.
**Fixed by:** Task 1 of plan 3 (the-shoal-wild), `shoal-client/src/lib/shoalFixtures.ts`.

`shoalFixtures.ts`'s `fingerprint` — used by every byte-identical check in the suite —
deliberately omitted `touchedIds` and `outsideTicks`. Those are **two of the three fields**
spec §3.9 measured a carried epoch continuation diverging on (the third, `tension`, was
covered).

`outsideTicks` feeds `topContributor` → `lockedPreferred` → `selectTaken` — i.e. **who the
shark eats**. So a divergence confined to it was player-visible and yet invisible to every
determinism check on the project. Nothing had diverged there; the point was that nothing
would tell us if it did.

**Resolved by widening `fingerprint` to include both fields**, sorted canonically like every
other entry. `cursor`, `tickCount`, `nowMs` and `epoch` stay out — they are
POSITION-IN-THE-FOLD (which log index, which call, which tick, which epoch a client happens
to have stopped folding at), not world state, and two honest clients that reach the same
`toMs` by different call paths (a straight `foldShoal` versus a shell driving `foldTick` one
tick at a time) legitimately disagree on all four with no divergence in the sea itself.
`outsideTicks` and `touchedIds` do not have that excuse: both are TRAJECTORY accumulators
(how a fish's core membership changed tick by tick; which ids ever authored a presence
write), not final-state values, which is exactly what let a divergence hide in them.

Widening was checked against the concern that a fingerprint field only reachable state can
vary is decoration — a field that only a hand-mutated `ShoalState` can move is not real
coverage. `shoalEngine.determinism.test.ts`'s "outsideTicks and touchedIds: reachable, not
decoration" section builds two REAL fold pairs (via `foldShoal`, never a hand-mutated state):

- **outsideTicks:** two logs where, at every tick, the tension core holds exactly the same
  COUNT of outside fish (so `tension` — which reads only the count, never the identities —
  is identical throughout) but a DIFFERENT specific fish is outside during an early window,
  before both logs converge onto the same trajectory. Every field the old fingerprint covered
  matches byte-for-byte; only `outsideTicks` differs (189 vs 181 ticks for the fish in
  question, hand-derived and asserted).
- **touchedIds:** two folds seeded from an identical checkpoint carrying a phantom `departed`
  row for `'ghost'`. One log gives `'ghost'` a single presence write, timed to the fold's
  exact admit floor so it lives for one tick (before hunger's first firing) and is evicted
  the next, banking the exact values the seed already gave it — so `departed` ends up
  byte-identical between the two folds, but `touchedIds` does not. Rolling both to the epoch
  boundary confirms the real, player-visible consequence: `rollEpoch` keeps `'ghost'` in one
  published checkpoint and prunes it from the other — two honest clients publishing different
  checkpoints for what the old fingerprint called the same world.

Both constructions were mutation-verified: removing the two new lines from `fingerprint`
makes exactly those two "the widened fingerprint tells ... apart" checks fail (and nothing
else), confirming the widening is load-bearing rather than decorative. Full test-driven
evidence, hand arithmetic and verbatim mutation output in
`.superpowers/sdd/2026-07-28-the-shoal-wild/task-1-report.md`.

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

### 13. The wild shoal's seed is a parameter with no agreed source

`wildAt(seed, tick, hush, now)` and `shelterBodiesOf(state, wildSeed, atMs)` both take a
seed, and **every client in a room must pass the same one** or two players standing in the
same water read different shelter. Nothing in `ShoalState` carries it today, so it is a
parameter every caller supplies (the harness defaults to `--wild-seed 1`).

The obvious source is the room itself — the space id is a value every client already agrees
on, and hashing it to a 32-bit integer would make the sea a property of the place rather
than of whoever wired the call. That is a small change, but it is a **consensus** one (it
decides which sea everyone sees, permanently), so it is recorded rather than slipped in as
part of Task 3.

Nothing depends on it yet: no shipped client draws or counts wild fish, because the paint
is Task 5 of the same plan. Whoever wires the first real consumer must resolve this first,
and the launcher and the browser client must resolve it the *same* way.

### 14. Wild cover is not scarce, and the shelter weight cannot make it so

`WILD_SHELTER_WEIGHT` (shoalConst.ts) prices a wild fish at half a person, so six of them
do what three people do. That fixes the *ratio* — the old size-weighted reading made three
wild fish worth 303 against a threshold of 300, i.e. exactly as good as three people — but
it does not make wild cover rare, and the numbers say so plainly: a school is
`WILD_PER_SCHOOL` (12) fish inside `WILD_SCHOOL_R` (200), against a `SHELTER_R` of 340, so a
swimmer at the middle of any school holds 12 × 50 = **600**, twice the threshold. It held
1212 before. Both are "completely safe".

Measured on the harness's own session (`--wild-seed 1`), two of the eight outsiders were
sheltered by scenery alone right up to the hush, at 550 and 350. Sampling three hundred
seeds against that fixture's twelve swimmers, it is rare for *no* swimmer to have six wild
fish in range.

This is not obviously wrong — the bolt means wild cover is never worth anything at the
verdict, so what it buys is a *false* sense of safety, which is exactly what the design
wants to sell. But if the operator wants wild cover to be something a player has to seek
out rather than something they are usually standing in, the lever is `WILD_PER_SCHOOL` or
`WILD_SCHOOL_R` in wild.ts, not the weight. Both are CONSENSUS and both are cheap **now**
and never again.

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
