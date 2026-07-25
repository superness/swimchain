# Chips & Dip — Phase 2: Batched Banking

**Date:** 2026-07-25
**Status:** Approved
**What:** Decouple the player from the action-PoW wait. Dipped chips queue locally, credit
immediately, and are submitted to the chain as batches in the background. Upgrades ride the same
queue.

Supersedes the one-line Phase 2 note in `2026-07-25-chips-and-dip-design.md` §6.

## Premise

In v1 every banked chip is one on-chain reply, and every reply needs the node's ~8-bit action PoW —
several seconds of CPU during which the player is blocked. The fryers keep grinding, so the player
watches a chip finish and cannot take it.

Batching is not an optimisation here. It is what makes the loop playable.

## Why batching is required, not merely nice

At the measured **~47 Argon2id-8MiB hashes/sec**:

| | attempts | time |
|---|---|---|
| one bank's action PoW (8 bits) | ~256 | **~5.4 s** |
| one 8-bit chip | ~256 | ~5.4 s per fryer |

Chips are produced in parallel across fryers; banks drain one at a time.

| fryers | produced | drained | net |
|---|---|---|---|
| 1 | 1 / 5.4 s | 1 / 5.4 s | breaks even, and they contend for CPU |
| 4 (fully upgraded) | 4 / 5.4 s | 1 / 5.4 s | **backlog grows ~33 chips/min** |

So simply moving submission into the background is not enough: the queue diverges and the player's
crumbs become a promise the chain never catches up to. Batching 24 chips per reply drains 2.2/s
against 0.74/s produced, which closes with margin.

## 1. The wire format

### 1.1 Batch grammar

```
bank <ms>:<bits>:<nonce>,<ms>:<bits>:<nonce>,…#<authoringMs>~
```

Every entry carries its own `ms` because the chip preimage binds it
(`chips-v1 ‖ author_id ‖ table_id ‖ ms ‖ nonce_le_u64`), and chips from different fryers necessarily
have different `ms` values. A batch cannot share one.

`buy <upgrade-key>#<ms>~` is **unchanged**. Buys are a handful per session, so batching them buys
nothing and would widen a consensus-critical grammar for no gain.

### 1.2 v1 replies fold forever

The single form `bank <bits> <nonce>#<ms>~` remains permanently valid, and a v1 chip's `ms` is its
authoring-ms — which is already exactly what it means. `parseMove` tries the batch form (identified
by `:` in the argument) and falls back to the single form.

This is not politeness. Real chips are on mainnet: at time of writing one table stands at 612
lifetime crunch with a 17-bit crispest. Dropping v1 parsing would silently zero real players.

### 1.3 Size

`INLINE_THRESHOLD = 1024` bytes (`src/content/addressing.rs:33`) is the inline/chunked storage
switch, **not** a body cap — the wiki client posts multi-KB bodies routinely. Staying under it keeps
a batch inline and cheap. At ~34 bytes per entry, ~29 entries fit.

> Correction to the v1 spec, which claimed moves must fit "inside the 466-byte action". 466 bytes is
> the fixed `Action` struct (`src/blocks/action.rs:11`); it carries a content hash, not the body.

## 2. Fold rules (consensus-critical)

**`MAX_BATCH = 24`, and it is a security bound.** A reply declaring more entries folds as
`rejected-oversize` **whole**, without verifying any of them. (A new `Outcome` variant: the move is
well-formed but disallowed, so neither `rejected-parse` nor `rejected-bits` describes it honestly.) Without this cap a single hostile reply
containing 10,000 entries forces *every observer* into 10,000 Argon2id-8MiB hashes to fold that
table — and the boards fold other people's tables, so this is someone else's CPU. The cap must be
checked before any hashing.

**Partial validity: entries are credited individually.** A batch is not all-or-nothing. Each entry
is verified and credited exactly as a lone chip would be; an invalid entry is rejected on its own and
does not void its 23 neighbours. Written down because "reject the whole reply" is equally defensible
and the two disagree forever.

**Everything else is unchanged.** Payout order (base → golden → dip → congeal → seasoning), decay,
the bowl rim, and `seenProofs` keyed on `author:ms:nonce` all behave per chip exactly as in v1.
Replaying a chip inside a batch is rejected as `rejected-duplicate`, the same as replaying it alone.

**Decay is unaffected by batching.** Decay integrates over `created_at` gaps between confirmed
moves. Fewer, larger replies means fewer clock advances over the same wall-clock span, and the sum of
gaps is identical. There is no decay advantage to batching.

**`MoveResult` becomes per chip.** One reply now yields N results, so the move log and `crispest`
continue to work per chip rather than per reply.

## 3. Verification

The verified map is currently keyed by `content_id`, which no longer identifies a single chip. It
becomes keyed by the proof itself:

```
tableId : author : ms : nonce   →   bits
```

That key is exactly the Argon2id input, so it *determines* its value. This also permanently closes
the "cache key does not determine its value" finding from the v1 final review, which was left open on
the grounds that content dedup plus the owner filter made a collision unreachable — an argument that
rested on two other subsystems rather than on construction.

The owner filter stays where it is and keeps running **before** any hashing.

## 4. The client

### 4.1 The queue replaces the napkin

One ordered, persisted list of pending moves. This is a generalisation, not an addition: the napkin
already persists mined proofs to `localStorage` because they are CPU the player paid for. It grows
from "failures" to "everything not yet on chain", and the failure UI becomes a *state* of the queue.

### 4.2 Optimistic state IS the fold

Queued moves are rendered as synthetic `ChipsReply` objects with `block_height: null`, appended to
the confirmed replies and run through the **same `foldChips`**.

The fold already treats pending replies correctly: they credit payout but do not advance the decay
clock. So there is no second accounting path to drift, and no reconciliation logic. When a batch
confirms, its synthetic entries drop out and the real ones arrive; fold output is continuous.

This is what makes silent reconcile safe — there is nothing to reconcile.

Bits for a locally-mined chip are known (we mined it), so the synthetic entry seeds the verification
map directly. On confirmation the same proof is re-verified from the chain by the normal path.

### 4.3 One sender, one flight, strict FIFO

When idle, take up to `MAX_BATCH` chips from the head and submit them as one reply. Nothing else is
sent until it lands.

Batch size therefore self-clocks: an idle player's chip goes out alone and immediately; a busy
kitchen accumulates during each PoW and the batch grows to match. No timing constants to pick or
retune as difficulty or fryer counts change.

Strict FIFO is what keeps an upgrade from landing ahead of the chips that funded it — otherwise the
buy folds as `rejected-cost` and un-buys itself.

### 4.4 Failure

Retry indefinitely, with exponential backoff capped at 60 s so a long offline spell does not decay
into one attempt an hour. **A stuck head blocks the queue**, deliberately: it must not be
overtaken. The player sees nothing until the head has failed repeatedly, at which point the existing
napkin UI surfaces with "try again".

## 5. The dip animation

The chip's journey becomes the payout's cause. Today it sinks into the dip and vanishes, which is a
strange fate for a chip.

| beat | ~ms | |
|---|---|---|
| lift | 0-280 | arcs out of the basket toward the bowl |
| dip | 280-520 | submerges; surface ripples, chip comes back coated and glossier |
| rise | 520-760 | lifts out loaded, tilts toward the viewer, scales up |
| crunch | 760-950 | shatters into shards and crumb particles |
| collect | 950-1250 | crumbs streak to the counter, which ticks up as they arrive |

~1.25 s total. This is **feedback, not waiting**: a fixed animation fully decoupled from the ~5.4 s
PoW running invisibly behind it.

**When the crumbs actually credit.** The move enters the queue at the click, so it is durable
immediately and the optimistic fold includes it from that instant — there is no window where a mined
proof exists outside the queue. What the animation paces is the *displayed* counter, which tweens to
the already-credited value and lands on the collect beat. Display-only easing over authoritative
state, exactly like the sog projection: the number the fold holds is never in question, only how
quickly the player is shown it.

It also earns its place in the batching design. Fully-optimistic silent reconcile has one weakness —
crumbs appearing from nowhere, and potentially vanishing from nowhere. Giving the payout a visible
cause means the number moving is always explained by something the player just did.

**Deliberately not done:** crumbs are not gated on the batch landing (that reinstates the wait), and
the batch itself gets no indicator at all. The moment the network is visible, the player waits on it
again.

The existing `.dip-flight` element is already fixed-position and layout-free, so this extends it and
remains incapable of moving the fryer.

## 6. Balance amendment: pressure #3 is retired

The v1 spec names three pressures to bank, the third being kitchen overhead:

> *"a progressive penalty on spam-banking trash and it correctly disappears where the game wants you.
> It is not a designed cost and nothing may be added on top of it."*

Today one bank costs ~256 attempts: a **100% tax on an 8-bit chip, 0.4% on a 16-bit one**. Amortised
across 24 chips that becomes **~4% flat at every size**. The pressure stops existing.

**This is accepted, and pressure #3 is struck from the design.** Reward remains linear in work, so a
CPU-second is worth the same either way and nothing is gained by spamming. The two real pressures are
untouched: golden chips still pay 5/2 past `GOLDEN_BITS`, and Seasoning still multiplies every future
chip. The retired friction mostly punished casual players banking as they go.

No replacement cost is invented. The v1 spec forbids adding one, and that still holds.

## 7. Security

**Batching cannot forge work.** Every entry is an independent Argon2id proof bound to
`(author, table, ms, nonce)` and verified by every observer. Bits claimed above bits mined are
rejected per entry. A batch containing another identity's chip fails the preimage. `seenProofs`
dedupes across the whole fold. None of this weakens.

**Client-side dishonesty is self-harm.** A patched client can display any crumb count it likes; the
boards are folded from the chain by everyone else.

**Unloading pre-ground work is the point, not an attack.** A player may grind nonces offline and bank
them later, in bulk. That is real CPU spent, and reward tracks work by construction — this is the
protocol's principle, not a loophole. Batching makes dumping cheaper; it does not make it free of
work.

**Verification cost is the real exposure, and it is pre-existing.** A table with many banked chips
costs a fresh viewer one Argon2id-8MiB per chip. v1 already has this (10,000 single-chip replies is
10,000 hashes); batching concentrates ~24× more per reply without changing the per-chip total.
`MAX_BATCH` bounds the per-reply blast radius; the boards' 6-table rotation and the persistent verify
cache bound the rest. Watch it as the space grows.

### 7.1 The fold is the enforcement layer

The node cannot judge chips semantics — it validates PoW and signatures, not game rules — so a
hostile reply *will* land on chain. That is fine and expected: **the fold decides what a reply
means, and simply does not credit one that breaks the rules.**

This does not depend on everyone running our client. A modified client can show its owner any number
it likes; it cannot make *other* clients credit it, because they run the fold. The guarantee survives
client diversity, which is a stronger property than client uniformity would give.

**Structural violations are free to reject.** `MAX_BATCH` is checked by counting entries, before any
hashing, so an oversized reply costs a viewer a string parse. 24 is a practical number, not a derived
one: it is the 1 KB inline threshold (~29 entries) rounded down for headroom.

**Fold constants are effectively permanent.** Raising `MAX_BATCH` later would newly credit replies
that were previously rejected; lowering it would un-credit chips already counted. Either direction
retroactively re-scores every table, and clients that disagree compute different balances for the
same history. Treat these numbers as set once, not tuned later.

**The residual cost is well-sized garbage.** 24 junk entries still cost each viewer 24 real Argon2id
hashes to discover they are junk. The arithmetic bounds it:

| | |
|---|---|
| attacker cost per reply | ~5.4 s — the node's action PoW, doing real rate-limiting work |
| viewer cost per reply | ~0.51 s (24 hashes at 47/s) |
| amplification, one viewer | **0.09×** — the attacker pays ~10× what they inflict |
| amplification, V viewers | 0.09 × V, net above ~11 concurrent viewers |

The persistent verify cache means each viewer pays once ever, and the boards' 6-table rotation
already bounds work per pass. No new machinery is warranted; if the space grows enough to need more,
the lever is a client-side verification budget per pass — a policy choice, not a fold rule, so it can
change freely without re-scoring history.

## 8. Testing

Consensus rules need fold-level fixtures, hand-computed, each falsifiable against the specific bug it
targets:

- a batch credits each entry exactly as N lone chips would (equivalence against the v1 path)
- a v1 single-form reply still folds identically — the regression that would zero live players
- `MAX_BATCH + 1` entries folds as rejected **whole**, and performs **no** hashing
- one invalid entry among valid ones rejects only itself
- a chip replayed inside a batch, and across two batches, is `rejected-duplicate`
- decay over one 24-chip reply equals decay over 24 single replies spanning the same `created_at`
- the verification key discriminates: same `content_id`, different `(ms, nonce)` → different entries
- optimistic-vs-confirmed continuity: folding `[confirmed…, synthetic pending…]` then replacing the
  synthetics with their confirmed replies yields the same crumbs, lifetime and upgrades

Client-level: FIFO ordering holds a buy behind its funding banks; a stuck head blocks the queue; the
queue survives reload.

## 9. Out of scope

Seasons. Batched *buys*. Any batch/queue depth indicator. Any replacement for the retired junk tax.
