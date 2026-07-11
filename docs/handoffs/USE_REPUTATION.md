# Handoff: Put Poster Reputation to Use

**Status:** Needs a design decision before implementation — options below. Operator direction 2026-07-11: "Reputation should definitely be used somehow."
**Background:** A complete poster-reputation module exists (score calculation, decay on spam attestations, recovery over time — SPEC_12 §3.4/§4.5) but is **never constructed outside tests**: `AntiAbuseManager`/`ReputationStore` appear only in `src/api/anti_abuse.rs:669` (test code). See `docs/VISION_PARITY_AUDIT.md`.

## What exists today

- `src/reputation/score.rs:17-133` — score model: decays when the community attests an identity's content as spam, recovers with time/good behavior.
- `src/reputation/` — storage + manager plumbing.
- `src/api/anti_abuse.rs` — `AntiAbuseManager` intended to combine reputation with spam heuristics; test-only today.
- Working and wired nearby: spam attestations + counter-attestations (router `router.rs:6668,6755`) and attestation-driven **content** decay acceleration (`content/decay_integration.rs:251`). Reputation is the identity-level layer that should sit on top.

## The design question

What should reputation DO? Hard constraint (settled principle): **no protocol privileges for good standing** — reputation must never make a veteran's PoW cheaper or content longer-lived (that road led to the removed swimmer-level system, legacy commit `a2e6934f`). Reputation can only make *abuse* more expensive or *information* more visible.

### Options (not mutually exclusive)

**A. Attestation weighting (protocol, defensive).** Low-reputation identities' spam attestations count for less; prevents attestation-bombing by fresh sybil accounts. High reputation never grants power — it only restores the default weight. Touch points: attestation aggregation in `src/spam_attestation/manager.rs`/`counter.rs`.

**B. Spam-flag threshold input (protocol, defensive).** Content from very-low-reputation posters crosses the spam-flagged (accelerated-decay) threshold with fewer attestations. This is a *penalty axis only* — normal and high reputation behave identically. Touch points: `content/decay_integration.rs` flag logic + `spam_heuristics/`.

**C. Sponsorship gating (protocol, defensive).** Minimum reputation to *sponsor new identities* (ties into sponsorship trees — a chronic spammer shouldn't be a gateway for new accounts). Touch points: sponsorship offer validation, `src/sponsorship/`. Pairs naturally with `WIRE_SPONSORSHIP_PENALTIES.md`.

**D. Display only (client, informational).** Expose `get_reputation(identity)` over RPC; clients render it on profiles/posts as a trust signal; users/clients decide what to do with it. Zero protocol behavior change — safest first step, and A–C can layer on later.

### Recommendation

Ship **D first** (small, unblocks visibility, no consensus implications), then **A** (the clearest defensive win — attestation systems without attester weighting are gameable). B and C afterward as separate decisions.

## Scope of work (once options are picked)

1. Construct `ReputationStore` (+ `AntiAbuseManager` if used) in `node/manager.rs`; feed it from the existing attestation-processing path in the router (where attestations are already validated and aggregated).
2. Persist to the node's sled DB (module already supports storage — verify schema).
3. RPC: `get_reputation(identity)` + include in profile responses; add real handler AND allowlist entry (`rpc/server.rs`).
4. Implement chosen options A/B/C at their touch points, each behind its own config flag defaulting per-network (regtest on, mainnet decided at review).
5. Client: render the score on one profile view (forum or feed client).

## Acceptance criteria

- Regtest scenario: identity posts spam → N attestations → `get_reputation` drops; time passes / good posts → recovers per SPEC_12 curves.
- If A is implemented: fresh identity's attestations measurably weigh less in the aggregate (unit test on the aggregation math).
- No path exists where reputation reduces PoW cost, extends decay, or raises rate limits (add a test or review checklist item asserting the touch points).
- `cargo test --all-targets` + clippy clean; conventional commits.
