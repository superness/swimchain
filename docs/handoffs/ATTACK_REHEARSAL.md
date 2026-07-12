# Handoff: Behavioral-Branching Attack Rehearsal (regtest)

**Goal (operator request 2026-07-11):** a runnable scenario that *deliberately* triggers behavioral community formation with a sock-puppet attack cluster — proving attackers self-quarantine — plus the negative case proving the minority gate protects legitimate regulars. Doubles as the regression test for the anti-capture story.

## Why regtest

Formation gates require a pattern sustained for `MIN_PATTERN_AGE_BLOCKS = 20160` blocks (`src/branch/behavioral.rs`). On testnet at 10% PoW that's an impractical grind; regtest (0.1% PoW, formation Full by default) can drive that block volume quickly. Existing in-process integration tests (`tests/behavioral_branching.rs`) already exercise formation; this handoff adds the *live-node* rehearsal.

## Scenario A — attack succeeds (self-quarantine)

1. Start one regtest node (`sw --regtest node start`), script against its RPC (cookie auth; `SWIMCHAIN_DATA_DIR`/`SWIMCHAIN_PASSWORD` env make the CLI scriptable).
2. Create a space; create ~8 identities: 4 "background" users + 4 sock puppets.
3. Background users post/reply/engage across each other at a modest rate (keeps the space's active-participant count up and their own metrics healthy).
4. Sock puppets post and engage ONLY with each other's content — never touching background content, never receiving background engagement (drives cohesion > 0.8, external < 0.2, diversity < 0.3; 4/8 participants satisfies the ≤0.5 minority gate).
5. Keep driving actions until block height advances past `MIN_PATTERN_AGE_BLOCKS` from the pattern's start (each action's PoW accumulates toward the 30-PoW-second root-block threshold; at regtest scaling this is fast — measure and report actual wall time).
6. Assert: `list_behavioral_events` shows the detection; a community space exists (space listing `children` / `get_space_lineage` on the parent); founding members = the 4 puppets; parent space threads from background users untouched.
7. Bonus assertion (the quarantine): the new community space's content receives no engagement from background users → its content decays; the parent space is unaffected.

## Scenario B — minority gate refuses (regulars protected)

Same script, but: 4 identities total, ALL insular (they are the whole space). Drive the same volume. Assert: NO formation occurs and no `BehavioralEvent` fires for that cluster (4/4 = 100% > 50% gate), no matter how long the pattern persists.

## Deliverable shape

- `scripts/attack-rehearsal.sh` (bash, mirrors start-test-nodes.sh conventions) or a `tools/app-automation` scenario if driving via swim-auto is easier — implementer's choice; must run headless and exit nonzero on assertion failure.
- Print a timing summary (blocks driven, wall time, when detection fired) — this calibrates whether `MIN_PATTERN_AGE_BLOCKS` is testable enough or needs a regtest-only override (if you add one, make it explicit config, never a lowered default).
- Document invocation at the top of the script.

## Acceptance

Scenario A forms exactly one community with the right founders; Scenario B forms nothing; both runs are deterministic across two consecutive executions; README-level usage comment; conventional commit.
