# The Shoal — open items

*Live tracker. Started 2026-07-28, after plans 1, 2a and 2b merged (PRs #152, #162, #163).*

Design: `docs/superpowers/specs/2026-07-27-the-shoal-design.md`.
Everything here was surfaced by a code review or a live run, not speculation. Each entry
says what is broken, how it was found, and what it costs to leave.

---

## Resolved

### 12. The shell computes a checkpoint every hour and throws it away *(RESOLVED 2026-07-28)*

Closed on branch `feat/the-shoal-shallows`. A checkpoint now travels as a third wire kind
(`v1|checkpoint|salt|<canonical payload>`, plan task 1), `chainSea.ts` publishes `rolled`
at every boundary, and a joining client adopts the newest one it can see before its first
fold. Full write-up in place below, under Blockers, with a RESOLUTION note.

---

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

#### RECOGNITION HALF DONE 2026-07-28 — the granting half is still open

**What now exists.** `classifySendFailure` (`shoal-client/src/lib/shoalSend.ts`, plan 4a
Task 3) reads the node's numeric JSON-RPC code and returns
`'not-sponsored' | 'unreachable' | 'unknown'` — no message text anywhere.
`chainSea`'s `onWrite` callback carries that classification out of every write,
`wayIn.afterWrite` (`src/ui/wayIn.ts`) folds it into a standing, and `TheEdge.tsx` draws
the edge of the water for `'not-sponsored'` and for nothing else. A write that is
*accepted* clears the standing, so a player vouched in mid-session is simply let in.
Verified against a real local testnet node answering a real -32015.

**What is still missing: actually granting a vouch.** The node side exists in full —
`create_sponsorship_offer` / `list_sponsorship_offers` / `claim_sponsorship_offer` /
`approve_sponsorship_claim` (`src/rpc/methods.rs:1197-1204`), with params in
`src/rpc/types.rs:1877-1921`. What a client would have to add:

1. **A signed `create_sponsorship_offer` on the sponsor's side.** `CreateSponsorshipOfferParams`
   wants `sponsor_pubkey`, `slots`, `offer_type`, `expires_days`, `timestamp` and a
   `signature` over the offer's own preimage — a fourth signing preimage the bridge does
   not implement (it knows only the action preimage). The sponsor's key must itself be
   sponsored, which is true of anyone actually in the water.
2. **A signed, PoW-mined `claim_sponsorship_offer` on the newcomer's side** —
   `ClaimSponsorshipOfferParams` carries its own nonce/difficulty/hash/signature, a fifth
   preimage and a second mining path.
3. **A way for the offer id to travel that is not a link or a code.** This is the real
   design problem, and §2.16 forbids the easy answer outright. The newcomer cannot write
   to the room — that IS the condition — but they can *read* it, so an "open hand"
   published by a swimmer already in the water is the obvious shape. That is a FOURTH wire
   kind in `shoalWire.ts` (`presence` / `eat` / `checkpoint` / …), which is
   **consensus and permanent** (spec §4) and must be specified before it is written.
4. **A mainnet policy decision.** `auto_approve` offers are refused on mainnet except for
   the operator-designated game sponsor (`methods.rs:17184-17195`). Without that
   exception, granting is two in-game acts by the sponsor (offer, then approve the claim),
   not one — which changes the mechanic, not just the plumbing.

Roughly: one spec decision, one consensus wire change, two new signing preimages, a second
mining path, and a sponsor-side gesture. Deliberately **not** attempted in plan 4a Task 4:
a grant flow that looks like it works and silently does not is worse than a clear
"someone already swimming has to bring you through".

**Also still true:** the way-in surface is only reachable where a chain sea is, and
`buildChainSea` is gated on `import.meta.env.DEV` (`App.tsx`, deliberately — it reads a
cookie and a weak key derivation out of the address bar). A shipped build folds a demo sea
and never writes, so it never sees -32015 either. Whatever eventually gives the shipped
shell a real room (open item 7, mainnet provisioning) is what makes this surface reachable
by a real downloader; the recognition logic itself is shell-agnostic and needs no change.

### 12. The shell computes a checkpoint every hour and throws it away — **RESOLVED 2026-07-28**

**Closed by** `feat/the-shoal-shallows`, tasks 1 and 2. The description below is left as
written; what changed follows it under **RESOLUTION**.

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

**RESOLUTION (2026-07-28).** All five points above are built.

1. **Wire form** — `v1|checkpoint|salt|<canonical checkpoint JSON>` in `shoalWire.ts`,
   calling `serialiseCheckpoint`/`parseCheckpoint` rather than re-deciding canonical text.
   A checkpoint carries an author SALT, so two agreeing publishers are two chain objects
   rather than one (`content_id = sha256(body)` would otherwise collapse them and make the
   surviving object's author nondeterministic). **The consequence for point 3 below: two
   honest clients emit different BODIES with identical PAYLOADS, so agreement is a payload
   comparison, never a byte comparison.**
2. **Publish** — `sendCheckpoint(ctx, cp, nowMs)` in `shoalSend.ts`, mined and signed like
   any other reply, into the same room. `nowMs` reaches only the action envelope, never the
   body, so two clients rolling milliseconds apart still author identical payloads. **Every
   client publishes, every hour**: PoW is priced per action, so a checkpoint costs one mine
   however many KB it carries, and one-publisher-per-opinion is exactly what makes the
   evidence in point 3 mean anything.
3. **Adopt, by evidence** — `adopt.ts`. Candidates are only those for exactly `epoch - 1`
   (`foldShoal` refuses any other seed). Group by canonical payload; a publisher that
   published two payloads for one epoch votes for neither; adopt the payload with the most
   independent publishers, lowest content hash breaking a tie. Any epoch with more than one
   payload is REPORTED through the shell's `onError` — a difference does not prove
   dishonesty (a bite still in flight when one client rolls is enough), and the message says
   so. The `k`-of-agreement threshold this item asked for was deliberately NOT made a hard
   floor: it would have left a two-player room permanently unseeded, which is the very
   failure being fixed. Plurality gives the same sybil cost without that.
4. **The seam** — `chainSea.ts` adopts before its first fold AND again on every refetch
   until it succeeds, because the constructor's own fetch has not answered by the first
   frame; a one-shot at startup would miss the checkpoint almost every time.
5. **Ordering against item 1** — unchanged and still open. Checkpoints are replies too, so
   they accumulate in the same log that is heading for `ROOM_FETCH_LIMIT`; whatever rotates
   a room must decide where checkpoints live at the same time. `fetchRoom` reads both halves
   in ONE `get_replies`, so nothing here doubles the fetch cost.

**Proved, not asserted.** `shoal-client/scripts/two-client-checkpoint.ts` (`npm run
smoke:checkpoint`) runs two peered regtest nodes, two identities, real mined writes and real
gossip: both clients compute the identical payload for a real epoch on the absolute grid,
publish it as two distinct chain objects, and a joiner reading the OTHER node adopts it and
folds to a fingerprint identical to the client that crossed the hour — with an unseeded
control alongside that remembers nobody. The hour itself is compressed by passing the sea
clock as the parameter it already is (`advance(loop, entries, toMs)` reads no clock); every
timestamp the node validates stays real. Run 2026-07-28 against epoch 495912: ALL PASS.

**One thing carried forward.** A checkpoint body does not name its ROOM, and `content_id`
is `sha256(body)` alone — so the same publisher publishing the same payload into two
different rooms produces ONE chain object (observed across two runs of the proof script).
It is benign today: the two are the same fact by the same author, and reply indexing is
per-parent, so each room still serves it. It would stop being benign if a rule ever read a
checkpoint's own provenance rather than the room it was fetched from.

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

### 13. The wild shoal's seed is a parameter with no agreed source *(RESOLVED 2026-07-28)*

**Resolved by Task 5 of plan 3**, which is the first real consumer (the paint) and was
therefore the caller this item said had to settle it.

`Sea.wildSeed` (`shoal-client/src/ui/demoSea.ts`) is now part of the contract every sea
implements, so a sea states which ocean it is at the one seam that knows what room it is,
and no caller can invent a private one:

- the two offline seas use `DEMO_WILD_SEED = 1`, matching `npm run harness`'s own default,
  so the window and the text output describe one sea;
- `chainSea` uses `wildSeedFrom(spaceId, roomContentId)` — FNV-1a over
  `` `${spaceId}/${roomContentId}` `` folded to 31 bits. BOTH ids, not just the space,
  because item 1 has rooms rotating within a space and two rooms should be two seas.
  Non-negative because a negative seed survives a JSON or query-string round trip
  differently depending on where it stops, and the seed space loses nothing.

Any second implementation (the launcher, a native shell) must derive it the SAME way —
`wildSeedFrom` is exported for exactly that reason. The original text follows.

---


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

### 16. `terrain.ts` places its four regions by plan view; the sea is drawn in elevation

**Found by:** Task 5 of plan 3 (the-shoal-wild), drawing the places for the first time.

The sea is painted in ELEVATION, not in plan. `seaPaint.paintWater` runs its gradient down
the world's y axis from a surface above y=0 to the abyss below `WORLD_H`, `paintShafts`
drops light from y=-700, and a swimmer is drawn side-on with its dorsal up. **World y is
depth.**

`terrain.ts` chose its four coordinates by plan-view quadrant — its own header says "NW
quadrant", "NE quadrant", "SE" — which under that projection means the Kelp Stand (y=900)
and the Wreck (y=750) sit in the upper third of the water column rather than on any
seabed, and the four places are distributed by *depth* far more than the quadrant language
suggests (750, 900, 2300, 2700).

**Nothing is broken.** The geometry, the queries and all 37 of `terrain.test.ts`'s checks
are about distances and containment, none of which cares which way is down; the module is
display-only and consensus-free either way. What is wrong is the *rationale in the header*,
which a reader will use to place the fifth landmark.

`terrainPaint.ts` accommodates it rather than moving the coordinates (which would mean
rewriting hand-derived boundary cases in `terrain.test.ts`): every place is drawn standing
on its own rock outcrop that fades into the murk below it, so a kelp stand on a shallow
pinnacle and a wreck caught on a ledge are both ordinary things at any depth. Whoever adds
a fifth place should decide deliberately whether that is the model, or whether the four
should be re-laid-out along a real seabed near `WORLD_H` — the second is the bigger change
and would want the same pass to give the world a floor, which it does not have today.

### 17. Wild fish shelter you, and the tether draws strands to them

**Found by:** Task 5 of plan 3, wiring the tether to `shelterBodiesOf`'s population.

Not a defect — a consequence worth having on the record, because it is the first thing a
player will ask about. `bodyShelterWeight` prices a wild fish at half a person, so wild
fish are among `shelterOf`'s summands, so the tether — whose strand weights sum to
`shelterOf` exactly, which is the property that makes the picture trustworthy — draws a
strand to every wild fish inside `SHELTER_R`.

That means a player can be held up almost entirely by scenery, see a warm short tether
saying so, and be telling the truth right up until the hush. It is what makes the bolt land
(the strands all leave at once) and it is what open item 14 is about. The alternative —
counting wild fish for shelter but hiding them from the tether — was rejected: it would
make the tether disagree with `shelterOf`, which `tether.ts`'s own header forbids outright.

### 15. Terrain does not bias where blooms appear

**Found by:** Task 4 of plan 3 (the-shoal-wild), reading spec 2.13 against its own brief.

Spec 2.13 says the sea's named places should "give blooms legible places to appear" — food
should be more likely to grow at the Kelp Stand than in open water, so the places earn their
keep as more than scenery. `shoal-client/src/ui/terrain.ts` (four hand-authored places: Kelp
Stand, The Wreck, The Drop-off, The Shelf — centre and radius each, plus `placeAt` /
`nearestPlace` queries) **does not do this, on purpose.**

Biasing bloom placement toward a region is a **consensus** rule: `isBloomReady` and the cell
grid it reads (`bloom.ts`) feed `foldTick`, so any rule that makes cells near a place more
likely to ready would change which cells every client agrees are edible — the same category
of change as item 10's claimant-exemption rule, and item 5's `ms` bound. It needs its own
design (does "biased" mean a shorter `BLOOM_READY_MS` near a place, a higher `BLOOM_BITES`,
or something else; do overlapping places stack; does the bias apply to the 32x24 bloom grid
cell-by-cell or only to cells whose centre falls inside a place's extent) and its own review,
not a quiet addition riding along with a display-only terrain module.

**Consequence of leaving it:** `terrain.ts` is display-only and consensus-free by
construction — `src/lib/` never imports it and nothing about it enters `foldShoal` or a
checkpoint — so places are legible to *look at* and to *say* ("kelp!") but carry no gameplay
weight yet. The minute-between-sweeps improvement spec 2.13 promises ("be near people, at the
good spot") still lands from making places somewhere to shelter and rally, but "the good
spot" is not yet also *the place food is more likely to be*, which is the other half of the
same sentence. Whoever picks this up should also decide whether wild-fish schools (`wild.ts`)
ought to loiter near named places, which is the same shape of question one level up.

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
