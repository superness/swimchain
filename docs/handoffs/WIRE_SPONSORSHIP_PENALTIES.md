# Handoff: Wire Sponsorship Penalty Propagation

**Status:** Ready to work. Operator direction 2026-07-11: penalties are important and should be functioning.
**Background:** Sponsorship trees themselves are real and wired (store, on-chain rebuild, offer propagation — `node/manager.rs:580-711,866`). But the *teeth* — penalty propagation up the sponsor chain when a sponsee misbehaves — exist only as tested-but-unwired code: `on_misbehavior`/`propagate_consequences` are called **only from unit tests** (`src/sponsorship/mod.rs:530-593`). See `docs/VISION_PARITY_AUDIT.md`.

## Why this matters (design intent, THESIS_08 / SPEC_11)

Sponsorship is the Sybil gate: new identities enter by being vouched for. That only deters bad vouching if a sponsee's misbehavior costs the sponsor something. Without penalty propagation, sponsoring is free reputation-washing — an attacker sponsors unlimited sock puppets with zero consequence.

## What exists today

- `src/sponsorship/propagation.rs:53` — penalty propagation logic (attenuating consequences up the sponsor chain).
- `src/sponsorship/mod.rs:367` — `on_misbehavior` entry point; `:530-593` unit tests exercising it.
- `src/sponsorship/` — trees, storage, offer flow: wired and live.
- The natural misbehavior *signal* already flows through the node: spam attestations are validated and aggregated in the router (`node/router/router.rs:6668`), and content spam-flagging drives accelerated decay (`content/decay_integration.rs:251`).
- Dead constants worth reviewing while in there: `*_MONTHLY_SPONSORSHIP_CAPACITY` in `sponsorship/types.rs:55-65` are never referenced (leftovers from the removed level system — either wire a flat capacity rule or delete them).

## Scope of work

1. **Define the trigger.** Recommended: when an identity's content crosses the spam-flagged threshold (the same event that accelerates decay), emit a misbehavior event for that identity. This reuses the community-attested signal — no new judgment mechanism. Confirm threshold semantics in `spam_attestation/` + `decay_integration.rs`.
2. **Wire the call.** From that trigger path, call `SponsorshipManager::on_misbehavior(identity, severity)` so `propagate_consequences` walks the sponsor chain. The sponsorship manager already lives in the node (`node/manager.rs:580+`); route the event to it (channel or direct call, match existing patterns in the router).
3. **Decide the consequence semantics** (propose at review, don't invent silently):
   - What a penalty does to a sponsor: counts against their sponsorship capacity / temporarily blocks new sponsorship offers. It must NOT touch PoW cost or content decay of the sponsor's own content (no-privileges principle applies to punishments' scope too — keep consequences inside the sponsorship domain).
   - Attenuation per level up the chain (the propagation code has a model — verify constants against SPEC_11 and state them in the PR).
   - Recovery: penalties should age out; check what the module already supports.
4. **Determinism check.** If penalties affect anything consensus-relevant, every node must compute identical results from chain data. If they're node-local policy (recommended for v1: local refusal to relay/accept *sponsorship offers* from penalized identities), say so explicitly in code comments and PR.
5. **Observability.** Log penalty events; expose `get_sponsorship_status(identity)` including active penalties over RPC (handler + allowlist in `rpc/server.rs`).
6. If reputation work lands (see `USE_REPUTATION.md` option C), coordinate: sponsorship gating may consume reputation; penalties may feed it. Keep the two PRs independent but interface-aware.

## Acceptance criteria

- Two-identity regtest scenario: A sponsors B; B's content gets spam-flagged via attestations; A's sponsorship status shows a penalty; A's next sponsorship offer is refused/reduced per the chosen semantics; penalty ages out.
- Unit tests for trigger wiring (not just the existing propagation tests).
- Multi-node regtest: nodes don't diverge (or the PR documents penalties as node-local policy).
- `cargo test --all-targets` + clippy clean; conventional commits.
