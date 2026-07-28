# The Shoal — open items

*Live tracker. Started 2026-07-28, after plans 1, 2a and 2b merged (PRs #152, #162, #163).*

Design: `docs/superpowers/specs/2026-07-27-the-shoal-design.md`.
Everything here was surfaced by a code review or a live run, not speculation. Each entry
says what is broken, how it was found, and what it costs to leave.

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

### 3. Gossip is unproven end to end

Both smoke identities talk to **one** node, so `src/node/router/router.rs:5947` — the
gossip-ingest event publisher, the entire reason the live channel exists — never fired.
Every event in the smoke came from the local-submission publisher.

**Missing run:** two nodes, a peer connection, one identity on each, and an assertion that a
`content_new` raised by *gossip* triggers a refetch. Until then the live channel's central
premise is verified only by reading the Rust.

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

### 8. Smaller

- `foldShoal` throws a `RangeError` at every epoch end, so a naive
  `foldShoal(log, Date.now())` in the shell hard-throws once an hour until `rollEpoch` is
  wired. Plan 2c must handle the rollover.
- `fetchRoomLog` returns a fresh array of the whole room every poll, so #162's incremental
  fold has nothing to consume — the incremental path is currently unreachable.
- `onRefetch` is synchronous, returns `void`, and swallows throws, so a shell has no way to
  surface a failed fetch.
- Dart-end (`dart → cruise`) is handled correctly but untested.
