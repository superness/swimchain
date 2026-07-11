# Handoff: Remove the Engagement-Pool Code

**Status:** Ready to work. Decision (operator, 2026-07-11): the pooled-engagement concept is abandoned. The current model is per-engagement PoW — every engagement is an individual proof-of-work action and a valid engagement resets the content's decay timer (`rpc/methods.rs:3207-3221`). The pool machinery is dead code and one public page still advertises it.

## What to remove (node)

- `src/content/pool.rs` — the pool model (60s total, contributors, expiry). Check for types re-exported elsewhere before deleting.
- `POOL_REQUIRED_POW_SECS` and related constants (`src/types/constants.rs:211` area).
- Router handlers `POOL_ANNOUNCE` / `POOL_CONTRIBUTION` and the completion → `decay.on_engagement` bridge (`src/node/router/router.rs:4888-5061`), plus their message-type constants.
- `PoolManager` construction in `src/node/manager.rs:809-826`.
- Deprecated RPC stubs `create_pool` / `contribute_to_pool` (`rpc/methods.rs:7739-7742, 8101`) and their allowlist entries in `rpc/server.rs`.
- Sweep: `git grep -in "pool" src/` and judge each hit — the *swimming-pool metaphor* (network = pool) stays; the *engagement-pool mechanism* goes. Mempool references stay.

## What to update (docs & clients)

- `specs/` — SPEC_03 §7 / SPEC_08 / SPEC_13 references to pooled engagement: rewrite to per-engagement PoW + decay reset. State reality plainly; no "previously" notes (git history is the record).
- **web-gateway (live site — the important one):** the about page's ranking table lists "Engagement 20% — Pool progress (0-60 seconds)" and `/docs/search-ranking` documents an `ENGAGEMENT_POOL` factor (`web-gateway/src/types/search.ts` RANKING_WEIGHTS, `src/lib/search/ranking.ts`). Replace the pool-progress factor with engagement recency/count from real engagement data; redistribute its 20% weight proportionally across the remaining factors unless the operator picks different weights. Update both pages and the ranking code together so docs match code.
- Client sweep: grep clients for pool-progress UI (`archiver-client` showed pool status; forum/feed may render pool bars). Remove or repoint to engagement counts.

## Acceptance criteria

- `cargo test --all-targets` and clippy pass with the module gone.
- Two-node regtest: engagement still resets decay; no POOL_* messages on the wire.
- `git grep -i "engagement pool\|POOL_ANNOUNCE\|contribute_to_pool" src/ specs/ web-gateway/src/` returns nothing (metaphor uses excepted).
- Gateway builds; /browse/about and /browse/docs/search-ranking describe the actual ranking factors.
- Conventional commits; separate commits for node removal vs. gateway ranking change.
