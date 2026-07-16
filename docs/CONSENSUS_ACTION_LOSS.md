# Consensus: legitimate actions can be lost in fork races

Status: **investigation / design** — 2026-07-16. Living doc; expand freely.

## Measured (2026-07-15, seed chain snapshot + 24h journal)

Tooling: `examples/fork_diag.rs` (new) — dumps every height with >1 stored root
block and diffs the competing blocks' actions. Run against a read-only snapshot of
the seed's chain DB (`ssh root@167.71.241.252 'tar czf - -C /var/lib/swimchain-testnet chain'`).
Possible because rollback is non-destructive — orphaned blocks are never deleted.

- **376 heights; 62 contested (16.5%)** — one in six blocks was a fork race.
- **29 of the 62 (47%) were exact `cumulative_pow` ties** → decided by the
  content-blind lowest-hash coin flip.
- **0 actions permanently lost** — every orphaned action was eventually re-included
  on the canonical chain. The user-visible "wipe" is **orphan limbo**: the window
  (minutes, unbounded) between rollback and whenever a node still holding the
  action wins a later block. *(Correction to the first draft below, which assumed
  the height-365 moves fell through permanently. They sealed later.)*
- Seed journal, last 24h: **31 lower-hash-tiebreak reorgs, 132 heavier-chain
  reorgs, 21 "returned orphaned actions to mempool" events, 98 blocks formed** by
  the seed alone.

**The height-365 race, actual contents** (the incident that started this):

```
=== height 365: 2 competing blocks ===  (prev block was 270s earlier → threshold long since 100%)
  block 0e701dcb creator=11d8015e total_pow=3 cum_pow=71202 [CANONICAL]
      Reply pow_work=1 actor=f9caefe9 content=336cd05a
      Reply pow_work=1 actor=aa03450c content=25b94f60   ← only in winner
      Reply pow_work=1 actor=f9caefe9 content=89d92277
  block 3d7ac1e5 creator=16db7824 total_pow=3 cum_pow=71202 [orphan]
      Reply pow_work=1 actor=f9caefe9 content=336cd05a   (re-included later)
      Reply pow_work=1 actor=f9caefe9 content=89d92277   (re-included later)
      Reply pow_work=1 actor=f9caefe9 content=20042869   ← only in loser (re-included later)
  -> TIE on cumulative_pow: decided by lowest-hash coin flip
```

Same total work, different actions — and this is **structural, not coincidence**:

1. **`pow_work` is a per-difficulty constant, not measured work.**
   `pow_work = (1 << difficulty) / 1000 + 1` (`src/rpc/methods.rs:3105`) — every
   difficulty-8 action (reef move, chess move, comment) is worth exactly **1**.
   Any two blocks carrying the same *count* of typical actions tie *exactly*.
2. **The testnet eligibility window is 45 seconds, not 10 minutes.**
   `max_eligibility_time()` returns 45 for non-mainnet (`src/blocks/leader.rs:30-35`).
   Blocks form when content arrives; gaps between play bursts almost always exceed
   45s (365's gap: 270s) — so at the moment an action lands, the threshold is 100%
   and **every node is eligible**. The one-at-a-time staggering only exists during
   the first 45s after a block; effectively it never applies to our traffic.
3. Every node's formation ticker (30s on testnet) then races: all eligible, all
   have the gossiped action, whoever ticks first forges; anyone ticking within the
   propagation window forges a competitor. Both 365 blocks carry the same quantized
   timestamp — formed within the same 10s window.

Also observed: stuck node `fafe76e0` forging **empty** blocks on a stale fork hours
later (heights 122–124, timestamps ~8h after the canonical blocks, `total_pow=28`
with 0 actions — a pow-accounting anomaly worth its own look).

## The symptom

A player posted three reef moves (`(1,7) (2,7) (3,7)`), saw them appear, then watched
them vanish — and they are **genuinely absent from the chain** (verified via
`get_replies`). This is not a client display bug. A legitimately mined, signed,
accepted action did not seal. The reef only made it *visible* (it re-derives state
every second); a forum reply would fail the same way, silently.

**Reliability principle we want (per operator, and correct):** once the node accepts a
valid, mined, signed action, it MUST eventually appear on the canonical chain. No
client-side confirmation-depth / resubmission band-aids. The protocol owes this.

## What actually happened (seed node log, height 365)

```
00:45:29  Block 3d7ac1e5 becomes tip at height 365          ← contains the player's 3 moves
00:45:32  Block 0e701dcb beats 3d7ac1e5 at height 365
          (lower-hash tiebreaker, EQUAL cumulative_pow=71202)
00:45:32  Rolled back 3d7ac1e5 — 3 orphaned actions → returned to mempool
00:46:06  Block eab6cbfc formed at height 366                ← does NOT contain the 3 moves
```

Two nodes forged **competing** blocks at height 365. They had **equal** cumulative
PoW, so the winner was chosen by **lowest block hash** — which is blind to *which*
actions each block carries. The player's block lost the coin-flip; its actions were
orphaned back to the mempool; the next block (366), formed by yet another node whose
mempool didn't contain them, didn't re-include them.

**Correction (see Measured above):** they did NOT fall through permanently — they
were re-included in a later block, minutes afterward. The symptom is **orphan
limbo** (visible → rolled back → gone for an unbounded number of minutes → back),
not permanent loss. For the reef this is still lossy in game terms: a move
re-included at a later height replays in a different order, which can flip the
fold's verdict on it and on moves that depended on it.

## How the pieces work (verified in code)

- **Leader election** (`src/blocks/leader.rs`): per-round, per-identity lottery.
  `distance = xor_distance(block_seed, identity)`; a node is eligible when
  `distance < threshold(now)`. `block_seed` changes every block, so a different
  identity is "closest" each round. The threshold **expands over time** from
  `starting_pct` (0.001%) to 100% over `TARGET_BLOCK_INTERVAL = 600s`
  (`threshold_at_elapsed`). Early after a block almost nobody is eligible; the longer
  since the last block, the more nodes become eligible — guaranteeing *liveness*.
- **Block formation** (`src/blocks/builder.rs`): a node forges when content is ready
  (`total_pow >= difficulty_target`) **and** it's eligible. Forming **drains the whole
  mempool** into the block (no per-block cap, no TTL).
- **Block weight** (`src/blocks/root_block.rs:167-170`):
  `total_pow = Σ action.pow_work`; `cumulative_pow = prev_cumulative_pow + total_pow`.
  So work *does* scale with the actions included.
- **Fork choice** (`src/storage/chain.rs`): heavier `cumulative_pow` wins; **ties break
  by lowest block hash**. Orphaned actions are returned to the mempool
  (`[REORG] Returned orphaned actions to mempool`).

## Root cause (the chain of it)

1. **Multiple nodes forge the same height.** The lottery makes simultaneous
   eligibility *improbable*, not *impossible*. When two eligible nodes forge within a
   block-propagation delay of each other, both produce a block at height N.
2. **Their mempools differ at that instant.** Propagation lag: the action you just
   submitted to node A hasn't reached node B yet. So A's block and B's block carry
   **different actions**.
3. **The competing blocks tie on work.** Each carried a similar amount of `pow_work`
   (e.g. 3 difficulty-8 actions each), so `cumulative_pow` is equal despite different
   *contents*.
4. **The tiebreak is content-blind.** Equal work → lowest hash wins. Whether *your*
   action survives is a coin flip unrelated to its validity.
5. **Re-inclusion isn't guaranteed.** The loser's actions return to *one* node's
   mempool, but the winning fork was built by a *different* node that never had them,
   and its next block doesn't re-include them before they're lost.

**Why it's frequent right now (aggravators):**
- Several synced nodes all forging (seed, bot host, client2, local — plus the chess
  nodes/bots added today put more forgers + traffic on the fleet).
- Degraded propagation: a **WHO_HAS storm** and stuck peers (89b06b9d, 11d8015e,
  timed-out fafe76e0) are clogging gossip, which *widens the fork window* (step 1) and
  *worsens mempool divergence* (step 2).
- Tiny block-level PoW on testnet → ties (step 3) are common, so the content-blind
  tiebreak (step 4) decides often.

## The operator's four questions, answered

1. **Why doesn't the over-time expansion let one node in at a time?**
   It's not an identity-filtering bug — the filter works (per-identity `xor_distance`,
   reseeded each block). The expansion guarantees *liveness*, not *uniqueness*: it
   makes two nodes crossing the threshold close together *unlikely*, but nothing
   *prevents* it. Under degraded propagation (WHO_HAS storm) the fork window is wide,
   so "unlikely" becomes "often." **To verify:** whether the logarithmic expansion is
   too aggressive for fleet latency, and whether `block_seed`/`prev_block_timestamp`
   reset cleanly every block.
2. **Guaranteed re-inclusion** — agreed; highest-value fix (see below).
3. **"They should have the same mempool."** They *should*, but propagation lag means a
   fresh action isn't on every node when they forge simultaneously — so competing
   blocks genuinely carry different actions. And they can still have *equal work*
   because weight is a **sum of action PoW**, not a function of *which* actions — two
   blocks each with 3 equal-difficulty actions tie, and the content-blind hash
   tiebreak drops one set. That's the core defect.
4. **Client-side confirm-depth / resubmit** — **dropped.** The operator is right:
   creating an action should reliably hit the chain. This belongs in the protocol.

## Fix directions

### Shipped 2026-07-15 (operator-approved sequence)
1. **Testnet eligibility window matched to mainnet** (`leader.rs`:
   `max_eligibility_time()` now returns `MAX_ELIGIBILITY_TIME` (480s) for testnet;
   regtest keeps 45s for fast local dev). The 45s window was fully open by the time
   any action arrived on a bursty chain, making every node eligible at once —
   the direct cause of the 1-in-6 race rate. Tradeoff accepted: testnet blocks now
   seal on mainnet-like cadence (minutes, not seconds).
2. **Re-gossip orphaned actions on rollback** (`router.rs`
   `requeue_and_regossip_orphans`): all three rollback sites now requeue orphans to
   the mempool AND re-announce them via `ActionAnnounce` so every forger holds them
   for the next block — closing the distribution gap that caused orphan limbo.
   Bonus: the `process_orphan_block_data` rollback site previously DROPPED orphaned
   actions entirely (never returned them to the mempool); it now routes through the
   same helper.

### Deferred / superseded mitigations
- ~~Collapse to a single block producer~~ — superseded by the window fix (leader
  election now actually staggers forgers).
- **Quell the WHO_HAS storm / stuck peers** so propagation is healthy — still worth
  doing; degraded gossip widens what fork window remains.

### Why not just MERGE the disputed blocks? (operator question, 2026-07-15)

There is **no semantic reason not to** — and this protocol is unusually suited to
it. The classic obstacle to merging fork losers is double-spends (currency chains
carry mutually exclusive transactions, so one side must die). Swimchain actions are
individually signed, self-contained, and almost never conflict: the union of two
competing blocks is almost always a valid action set, and identical actions dedup
naturally by content hash. A fork "dispute" here is about *packaging*, not truth —
discarding the loser's unique actions is pure waste.

The obstacles are mechanical:
- **No creator.** A synthetic union block at height N was signed by nobody and
  fails `validate_block_leader` — needs a special validity rule.
- **Determinism.** All nodes must derive a byte-identical merged block (canonical
  action order, timestamp, merkle root) or the merge mints new forks. Union-merge
  is commutative/associative so it converges CRDT-style, but it is
  consensus-critical code.
- **Convergence/propagation.** A node that saw only one parent must recognize the
  merged block as its replacement (merged block likely carries both parents as
  proof). Deep forks need recursive merge.
- **Order-sensitive edge cases** need explicit rules in a union: Replace-In-Mempool
  chains split across the two blocks, Kick/Leave in private spaces, engages
  targeting content in the sibling block.

**Pragmatic near-merge — merge at N+1:** keep fork choice as-is (one block wins),
but guarantee the loser's unique actions enter the mempool with TOP priority on
rollback and are swept into the very next block by whoever forges it. Chain history
converges to the same content one block later. No new block type, no leader
exception, no determinism problem — mempool policy, not consensus change. Given the
measurement (re-inclusion already happens *eventually*, 0 actions permanently
lost), this tightens "unbounded minutes of orphan limbo" to "next block."

The two compose: ship merge-at-N+1 now; consider true deterministic union-merge as
the elegant endgame. Pair with a "more actions wins the tie" rule so the coin flip
never prefers the smaller block.

### Bitcoin's model: first-seen ties + fee-driven re-inclusion (operator question, 2026-07-15)

Bitcoin nodes keep the FIRST block they see at a height and never reorg for an
equal-weight competitor — they only switch when one side becomes strictly heavier
(the next block lands on it). Brief node-to-node disagreement is accepted; the coin
flip is deferred to the next block. Disconnected transactions return to the mempool
and get re-mined promptly because fees make miners want them (we have no fees, so
that pull must become a rule here). Wallets also rebroadcast unconfirmed
transactions — Bitcoin runs client-side resubmission alongside the protocol path.

**Adopt first-seen ties? Pros:** no instant rollback churn on ties (the 29 measured
tie-reorgs simply wouldn't have happened as rollbacks); at most ONE reorg per race,
on the losing side, when the race actually resolves; strictly less work than
lowest-hash (no block re-validation storm on every tie). **Cons:** temporary
divergence — nodes on opposite sides show different states until the next block
(cross-device: a player's phone-node and PC-node could disagree for minutes); the
resolution depends on the next block arriving, which on a quiet chain is unbounded;
consensus-behavior change, fleet must deploy together. **Mitigant for the big con:**
with guaranteed re-inclusion, both sides' actions survive regardless of which side
wins, so divergence is cosmetic ordering, not lost content.

**Verified (2026-07-15): the mempool return path is already correct.** On finalize,
`clear_finalized_actions` removes block actions from the pending pool AND the
`seen_actions` dedup cache; on rollback, orphans are unmarked and re-added via
`add_action` (`router.rs` reorg sites), with a guard skipping actions still
finalized in surviving blocks. The actual gap is DISTRIBUTION: an action submitted
seconds before a race (like 20042869 at height 365) hasn't gossiped to every node
yet; after the reorg nothing re-broadcasts it, so it waits in the holders' mempools
until one of THEM wins a block. **Targeted fix: re-gossip orphaned actions on
rollback** — cheap, no consensus change, bounds limbo to ~the next block.

### SHIPPED (2026-07-16, launch readiness B4)

**Content-aware tie handling.** At an equal-`cumulative_pow` tie between two
same-height blocks, the block carrying MORE actions now wins; only equal action
counts fall back to lowest hash (`ChainStore::content_aware_wins` +
`block_action_count`, applied at both router tie sites). So a block that
contains a user's action can no longer be orphaned by a coin flip in favor of an
emptier competitor — the asymmetric-tie case (one forger saw more pending
actions than the other), which is the common shape.

Determinism is preserved because this only fires for TIP-level ties: the
incoming block arrives WITH its content in BLOCK_DATA, the existing block is the
node's stored tip, and below-tip forks are excluded by `deep_fork_blocked`. Every
node resolving the same tie has both action sets and picks the same winner. When
either block's content isn't fully present, it falls back to hash-only.

For the residual SYMMETRIC case (both blocks tie on work AND action count but
carry different actions), the loser's unique actions are recovered by:
immediate re-gossip on rollback (`requeue_and_regossip_orphans`) + the periodic
mempool re-announce (`MEMPOOL_REBROADCAST_INTERVAL_SECS = 20`), so every forger
gets them within ~20s and includes them in the next block. Same-node
re-inclusion is proven by `tests/fork_race_reinclusion.rs`; the content-aware
preference by `content_aware_tie_prefers_the_fuller_block`.

**Not a coin flip anymore in the common case; recovered (not dropped) in the
rare symmetric one.** A true zero-latency guarantee for the symmetric case would
need a block-format commitment to action identity (a hard fork) — noted as
future work, not required for the durability the reliability principle demands.

### Real fixes (protocol)
- **Guaranteed re-inclusion (highest value).** Track every accepted action until it is
  in the canonical chain. On a reorg, its orphaned actions must be re-queued on the
  *winning* chain and re-included by the next block — never dropped. This upholds the
  reliability principle directly, independent of fork frequency.
- **Content-aware fork choice / tie handling.** When two blocks tie on work, prefer the
  one carrying *more* (or a superset of) actions, or merge — so a block with your action
  can't lose to an emptier one. At minimum, never let a tiebreak *drop* actions the
  loser uniquely held.
- **Fewer simultaneous forgers by design.** A small network shouldn't have 4+ racers.
  Tighter target so ~1 node is eligible per round, or an explicit small producer set.
- **Propagate-before-forge / mempool convergence.** Reduce mempool divergence so
  competing blocks (if any) carry the same actions, making ties harmless.

## Open questions to verify
- Exact reason the two height-365 blocks tied at `cumulative_pow=71202` — same action
  count/difficulty, or a `pow_work` accounting quirk (`builder.rs:410` treats
  `pow_work == 0` specially)?
- Is there a relay/non-forging node mode, or must forging be stopped per-node?
- Reorg re-inclusion path: where, after `[REORG] Returned orphaned actions to
  mempool`, does a returned action get lost instead of re-sealed?
- WHO_HAS storm origin (recurrence of the 2026-07-14 fix?) and the stuck peers at
  heights 12/254.

## Related history
- `project_reef_pending_created_at_ordering` — earlier reef "poof" (decay coupling).
- WHO_HAS storm (2026-07-14, thought resolved) — recurring here.
- Deep-fork reorg bug (`cumulative_pow NOT cumulative`) — same fork-resolution area.
