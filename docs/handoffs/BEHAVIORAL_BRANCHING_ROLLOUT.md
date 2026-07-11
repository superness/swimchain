# Handoff: Behavioral Branching — Log-Only Testnet Rollout, then UX

**Status:** Phase 1 (log-only) ready to work. Phase 2 (enable + UX) gated on Phase 1 data and operator UX review.
**Decisions (operator, 2026-07-11):** behavioral branching WILL be enabled. Discoverability is the #1 UX concern — the multiverse must be navigable. Focused attackers self-clustering "up and away from everyone else" is desired behavior. Rollout via observation first.

## Background

Detection is implemented and wired into live block processing (`node/router/router.rs:2405, 3808 → :4199 process_behavioral_clustering`), with SPEC_13 thresholds exact in code (`branch/behavioral.rs:62-75`): engagement_diversity < 0.30, external_interaction < 0.20, internal_cohesion > 0.80, cluster ≥ 3, sustained ≈7 days (20160 blocks). It is **enabled only on regtest** (`node/config.rs:428 behavioral_branching_enabled`; early-return at `router.rs:4202`). Cross-node consensus messages (SPEC_13 §7) are deferred — formation is deterministic from chain data, which may make §7 redundant (same data + same algorithm ⇒ same conclusion); evaluate during Phase 1.

## Phase 1 — Observe (log-only on testnet)

1. Add a `log_only` mode alongside the enable flag: detection runs, would-be formations are logged/persisted (cluster members, metrics, triggering space, timestamp) but no space is created.
2. Enable log-only on testnet. Run ≥2 weeks of normal traffic.
3. Deliverable: a report of every would-be formation — were they real communities? noise? what would users have experienced? Plus a determinism check across ≥2 testnet nodes (identical would-be formations from identical chain state). Use that to recommend keeping/adjusting thresholds and whether §7 consensus messaging is actually needed.

## Phase 2 — Enable, with the UX contract

The UX principles (settled with the operator; implementation details open):

1. **Continuity** — threads visibly continue in the new space; nothing is lost or hidden. Parent space keeps a live pointer: "this conversation grew into its own space →".
2. **Graduation framing** — notification copy reads as recognition ("your group earned its own lane"), never eviction.
3. **Naming** — auto-names will be bad; members can rename via a normal PoW-costing space action.
4. **No opt-out of the split** (protocol physics, like decay) — but participation is free: members choose where they post afterward.
5. **Discoverability is the anti-segregation guarantee (TOP PRIORITY).** New spaces MUST appear in space listings with visible lineage (parent → child). Isolation of a spam cluster happens because nobody *chooses* to visit — never because the space is concealed. Navigation of the space tree ("the multiverse") is a first-class client feature: lineage breadcrumbs, a browsable space tree, and "recently formed" surfacing. This is the most novel UX in the product vs. existing social media — design it deliberately, prototype in forum-client or feed-client first.

## Acceptance criteria

- Phase 1: log-only flag; formation events persisted & queryable (RPC `list_behavioral_events` or similar); 2-week testnet report delivered; multi-node determinism confirmed.
- Phase 2 (after operator reviews the report): formation creates the space + pointer + notification per the contract above; space listings show lineage; one client renders the space tree.
- Spam-case check on regtest: a self-engaging cluster of sock puppets forms its own space and the parent space's listing/traffic is unaffected.
