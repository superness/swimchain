# Handoff: Make Spam-Flagged Content Actually Prune Faster

**Status:** Ready to work. Decision (operator, 2026-07-11): turn the spam-decay feature fully on.
**Bug:** Spam-flagged content is supposed to decay with a 4-hour half-life (`FLAGGED_DECAY_HALF_LIFE_SECS = 14_400`, `src/types/constants.rs:576`). Today that accelerated half-life is applied only on the **read/query path** (`content/decay_integration.rs:520` `get_decay_state`), so flagged content *displays* as nearly dead — but the actual prune loop (`decay_integration.rs:375` → `content/pruning.rs:45`, ticked every 60s from `node/tasks.rs:545`) uses the normal adaptive half-life. Flagged spam is therefore pruned no faster than regular content.

## Scope of work

1. In the prune path, use the flagged half-life for content whose spam-flag state is set (same check `get_decay_state` uses — factor the half-life selection into one helper so read and prune paths can't diverge again).
2. Confirm the flag source: spam-attestation aggregation sets the flagged state (`content/decay_integration.rs:251` area). Verify the prune path can see that state cheaply (it runs every 60s — avoid adding per-item lookups that scale badly; batch or cache if needed).
3. Check the un-flag path: counter-attestations can clear a flag — make sure content flagged-then-cleared returns to the normal half-life in both paths.
4. Unit test: flagged item with fixed timestamps is `is_decayed` and pruned on the accelerated schedule; unflagged sibling is not.

## Acceptance criteria

- Regtest: post content, attest it to the flag threshold, advance/mock time past ~4 half-lives (≈16h) — content is pruned while an unflagged control post survives.
- Read path and prune path share one half-life-selection helper.
- `cargo test --all-targets` + clippy clean; conventional commit (`fix(decay): ...`).
