# Handoff: Wire Thread Branch Anchoring + Size Fracturing (with Search Parity)

**Status:** Ready to work, with one hard requirement attached. Decision (operator, 2026-07-11): implement — but the search-divergence side effect must be addressed, not accepted. ("Different search results is a sad face; we should work to solve this.")

## Background

Branch partitioning is the storage-scaling half of the bounded-storage story (decay is the other half). It does NOT affect consensus or visibility: all branches roll up into the same space and root blocks, PoW aggregates across branches, and any node can fetch any branch on demand (view-to-host). Splits are by content hash — random, not social — so this cannot create echo chambers. What it changes is which content blocks a node persistently holds.

Both halves exist and both are dead in the live path:

1. **Thread branch anchoring** — `blocks/branch_path.rs`: `for_reply` (:116-120) correctly inherits the parent's branch path so threads stay together; `direction_at` (:67) derives placement from hash bits. But `from_thread_root` (:53-61) is a stub returning root, and every live block-builder call passes `BranchPath::root()` (`rpc/methods.rs:1827, 2543, 3273, 10439`, and siblings). Result: all content sits in one root branch.
2. **Size-based fracturing** — 50MB threshold (`branch/mod.rs:67`) and hash-bit split (`branch/manager.rs:275 execute_fracture`) are correct, but the production write path (`rpc/methods.rs:886`) calls `store.put_content_block()` directly, bypassing `BranchAwareStore` (`branch/storage.rs:87`) — so nothing ever tracks size or fractures. Only tests exercise it.
3. Branch-selective sync is already wired (`sync/subscription.rs`, `node/manager.rs:799`, `node/tasks.rs:400-434`) — it just has nothing to select on while everything is at root.

## Scope of work

1. Implement `from_thread_root` (derive path from thread-root content hash) and thread the real `BranchPath` through every live block-builder call site (posts get hash-derived paths, replies inherit via `for_reply`).
2. Route the production content-block write through `BranchAwareStore` so size tracking and 50MB fracture actually run.
3. Migration/compat: existing chains have everything at root — fracture must handle a root branch that is already over threshold, and old nodes must still validate new blocks. State the compatibility story explicitly in the PR (regtest/testnet reset is acceptable if the operator signs off; mainnet is not live).
4. Multi-node regtest: fracture on node A must produce identical branch assignment on node B (determinism from chain data only).

## Hard requirement: search parity

Branch-selective sync means a node no longer holds all content blocks, and local search (Tantivy in `cli/search_index/`, plus gateway lunr) currently indexes only what the node holds — so search results would silently differ per node by hosting choices. That is unacceptable per operator decision. Solve it in the same program (can be a second PR, but the lane isn't done without it). Directions to evaluate, pick and propose:

- **Global metadata index (recommended starting point):** every node syncs *all* chain records (it already must — they're in the blocks); text content ≤10KB can be inline in records (`content/addressing.rs` Inline variant). If post titles/text are chain-inline, a full-network search index can be built from chain data alone even for branches whose blobs you don't host — results then link to on-demand fetch. Verify how much of a text post actually lands inline vs. referenced; if inline coverage is high, this solves parity cheaply.
- **Distributed search:** a search query message fans out to peers holding other branches (WHO_HAS-style, `types/constants.rs:244-251` pattern), results merged client-side. More moving parts, network-dependent latency; fits the protocol ethos; consider as a follow-up rather than the first solution.
- Non-solution: "search covers your branches only" — rejected by the operator.

## Acceptance criteria

- Regtest: create enough content to cross 50MB in one space → branch fractures; replies stay with their thread; two nodes agree on every placement.
- A node subscribed to branch subset can still find (via search) content living in branches it doesn't host, and open it (on-demand fetch).
- Sync of a fresh node downloads only subscribed branches' content blocks + all chain records.
- `cargo test --all-targets` + clippy; document the fracture/compat story in the PR body.
