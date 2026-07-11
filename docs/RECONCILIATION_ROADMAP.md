# Reconciliation Roadmap — closing the vision/implementation gap

**Date:** 2026-07-11
**Source:** `docs/VISION_PARITY_AUDIT.md` (claim-by-claim audit of VISION.md vs `src/`), followed by operator decisions in session. VISION.md has already been updated to present-tense reality (video prohibited, per-engagement PoW instead of pools, threshold-driven block formation, eager header verification, achievements-not-levels).

Each lane below has a self-contained handoff doc an agent can execute from without further context.

## Phase 1 — Cleanup & switches (small, start immediately, parallel)

| Lane | Doc | One-liner |
|---|---|---|
| Remove pool code | [handoffs/REMOVE_POOL_CODE.md](handoffs/REMOVE_POOL_CODE.md) | Pool concept abandoned by decision; delete node machinery + fix the gateway's public "pool progress" ranking claim (live wrong claim — highest urgency in this phase) |
| Spam decay prune fix | [handoffs/FIX_SPAM_DECAY_PRUNE.md](handoffs/FIX_SPAM_DECAY_PRUNE.md) | 4h flagged half-life currently affects display only; make the prune loop honor it |
| Wire mDNS | [handoffs/WIRE_MDNS.md](handoffs/WIRE_MDNS.md) | Module exists, node never starts it; LAN discovery on for all modes |

## Phase 2 — Social layer wiring (parallel, independent)

| Lane | Doc | One-liner |
|---|---|---|
| Achievements | [handoffs/WIRE_ACHIEVEMENTS.md](handoffs/WIRE_ACHIEVEMENTS.md) | Award live, expose over RPC, render on profiles. Recognition only — no protocol privileges, ever |
| Reputation | [handoffs/USE_REPUTATION.md](handoffs/USE_REPUTATION.md) | Decided order: display-on-profiles first (option D), then attestation weighting (A). B/C are later separate decisions |
| Sponsorship penalties | [handoffs/WIRE_SPONSORSHIP_PENALTIES.md](handoffs/WIRE_SPONSORSHIP_PENALTIES.md) | Wire `on_misbehavior` to the spam-flag threshold event so bad sponsorship finally costs something |

## Phase 3 — Scale machinery

| Lane | Doc | One-liner |
|---|---|---|
| Thread branching + fracture | [handoffs/WIRE_THREAD_BRANCHING.md](handoffs/WIRE_THREAD_BRANCHING.md) | Wire branch anchoring & 50MB fracture into live paths. **Hard requirement:** search parity must be solved in the same program (global metadata index first, distributed search as follow-up) — divergent per-node search results were rejected by the operator |
| Behavioral branching | [handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md](handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md) | Log-only on testnet ≥2 weeks → formation report → enable with the UX contract. Discoverability/lineage navigation is the top UX priority; attacker self-isolation is desired behavior |

## Phase 4 — Safety & escape hatches

| Lane | Doc | One-liner |
|---|---|---|
| CSAM hash seeding | [handoffs/CSAM_HASH_SEEDING.md](handoffs/CSAM_HASH_SEEDING.md) | Build import + trust-anchored signed-list distribution now; pursue IWF/NCMEC/C3P access as an operator/organizational task in parallel |
| Fork network layer | (no handoff yet — design doc first) | Operator decision: forking is a heavy-duty technical action, not a first-class UX feature. Keep fork creation working; wire announce/discover/join messages when prioritized; content-migration model (lean: community re-posting with a PoW-waived window) needs its own design doc before any code |

## Standing principles (apply to every lane)

1. **Code is the source of truth; docs state present reality.** No "previously/used to be" annotations — git history (including `adminwizard-legacy/main` for pre-restart archaeology) is the record.
2. **No protocol privileges for status.** Reputation/achievements/streaks never reduce PoW, extend decay, or raise limits. Settled when the level system was removed (legacy commit `a2e6934f`).
3. **Every lane lands with regtest verification** (multi-node where consensus-relevant), tests, clippy, conventional commits.
4. **Public pages follow code.** Any lane that changes user-visible behavior checks swimchain.io (static site + /browse gateway) for claims that need updating.
