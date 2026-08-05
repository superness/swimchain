# Chips hardening — triage plan

**Cut:** 2026-08-05, after an overnight session that shipped eight fixes and had
to correct three of them in front of the operator.

**Thesis:** we are not fighting many bugs. We are fighting **two generators**
and one **discovery problem**. Fixing instances is what makes it feel endless.

## The evidence

Eight fixes in one night. Five were the same defect wearing different clothes:

| # | Symptom | The non-unique key it searched |
|---|---|---|
| 1 | a beaten boss un-beat itself | `bossHp` re-derived from a still-growing `lifetimeChips` |
| 2 | the victory card named the wrong boss | `fightAt(state.broken)` read *after* the fold advanced it |
| 3 | reconcile ate fresh buys | `buy:<table>:<me>:<jar>` — no `ms`, collides every bowl |
| 4 | the same jar queued twice | any `rejected-*` for that jar, anywhere in history |
| 5 | a sent buy retired by an old namesake | same key, on the stamped path |

The scan for this pattern in the other clients:

```
reef-client  4 matches   chess-client 0   shoal-client 0   forum-client 0
chips-client 68 test suites, all green
```

Chips is the only client with a **pending-move queue**. That machinery is the
generator. It is not rot spreading — it is one subsystem, and it is also the
best-tested one we have.

## Generator 1 — the client must GUESS whether a move landed

`sentAt`, `SETTLE_TTL_MS`, `retireSettled`, `confirmedMoveKeys`, the reconcile,
head-of-line submission, TTL expiry deleting real credit: every line of it
exists to infer *"did my move make it?"* because **the node cannot be asked**.

The node exposes 134 RPC methods. `verify_action_finalized` answers "is it in a
block?" — by iterating **every content block** — and nothing answers "is it in
your mempool?", which is where a move lives for the 5–13 minutes before a block
forms. So "in flight" and "lost" are indistinguishable, and the client papers
over the gap with a timer.

This is also our own design law, half-implemented: *chain + mempool is reality;
never wait for block finalization to answer "is X real."*

**Kill:** `get_action_status(content_id) -> {block N | mempool | unknown}`,
indexed by content hash. Then **delete** the guessing machinery. Not fix — delete.

## Generator 2 — time-blind keys

A key with no timestamp cannot answer a question about a specific attempt. It
can only answer *"has this ever happened"*, which is almost never what the
caller meant. Five bugs, one sentence.

Closed by discipline tonight; the client was swept and the remaining scans are
legitimate (`tutorial.ts` asks a lifetime question; bank-announce seeds on
`ms`). But discipline reopens the moment someone adds a lookup.

**Kill:** make it structural — keys carry their moment, or the lookup API
demands an `asOf`. Impossible beats absent.

## The discovery problem

Every one of these was found by the operator playing at midnight. Five had
invariants a machine checks in seconds. Until discovery moves to CI, the bug
rate *feels* like the problem when the real problem is the channel.

**Kill:** the robot player — `docs/handoffs/CHIPS_ROBOT_PLAYER.md`.

## The DAG

```
  T0-RPC ──────────────► T1-DELETE ──┐
  (get_action_status)                │
                                     ├──► SYNTHESIS (operator gate)
  T0-ROBOT ────► T1-INVARIANTS ──────┤
                      │              │
                      └► T2-ADVERSARIAL
                                     │
  T0-ASSEMBLY ───────────────────────┤   (node: copy, don't drain)
  T0-KEYS ───────────────────────────┘   (structural)

  P2 lanes, independent, no gate:
  UI-OFFERS   UI-POPUPS   UI-TIP   UI-REPORTS
```

**Track 0 has no dependencies and unblocks everything.** Run those three first.

## Exit criteria for SYNTHESIS

Not "the lanes are done" — measured:

1. The robot plays **one unattended hour** with zero assertion failures.
2. `grep -rn "sentAt\|SETTLE_TTL" chips-client/src` returns **nothing** outside
   tests — the machinery is gone, not refactored.
3. A rejected block on a node loses **zero** actions (regtest, forced).
4. The family grep is clean in chips *and* reef.

## What is deliberately NOT on this plan

The four P2 UI lanes are real bugs with real reports behind them, but they are
ordinary — they do not generate more of themselves. They ship whenever. Do not
let them displace Track 0.
