# Mempool Persistence

**Date:** 2026-07-11
**Status:** Approved (operator-chosen over optimistic local writes)

## Problem

The `BlockBuilder` mempool (pending actions not yet mined into a block) is
in-memory only. On a quiet network a single action may never meet the block
threshold, and the mempool is lost on process restart — so posts/reactions/
sponsorship claims that were submitted but not yet mined vanish on app restart.
An earlier stop-gap wrote reactions to the content store optimistically, which
created a second write path ahead of the canonical chain. The operator chose
the principled fix: **persist the mempool** so pending actions survive restart,
keep propagating, and only ever materialize through the one canonical block
path.

## Design

`BlockBuilder` gains an optional persistence file. Whenever the pending set
changes, the full thread map is written to disk (atomic + flushed). On startup
the node loads the file and restores the mempool, then derived indexes
(seen_actions, action_locations, per-space/total counts) are rebuilt from it.

- `PendingThread` derives `Serialize`/`Deserialize` (all fields already do).
- `BlockBuilder.persist_path: Option<PathBuf>` — `None` disables persistence
  (unit tests, minimal modes) so behavior is unchanged unless wired.
- `set_persistence(path)` sets the path and immediately loads any existing file.
- Private `persist(&self)`: if a path is set, bincode-serialize `self.threads`
  to `<path>.tmp`, rename over `<path>`, flush the directory handle. Best-effort;
  a persistence error is logged, never fatal to the action.
- `persist()` is called at the end of every mutation: `add_action`,
  `add_create_space_action`, `replace_action`, action eviction/removal,
  `build_root_block` (mempool now drained → writes empty), and `clear`.
- On load: deserialize the thread map into `self.threads`, then rebuild
  `seen_actions` (put each action hash), `action_locations`,
  `space_action_counts`, and `total_action_count`.

## Reverts

Remove the optimistic immediate reaction write in `submit_engagement`
(reactions again materialize only via block application), and the
persistent-vs-pending double count disappears with it — the reaction is counted
once from the persisted-but-unmined mempool until a block applies it, then once
from the store, never both.

## Node wiring

In node startup (manager), after constructing the `BlockBuilder`, call
`set_persistence(data_dir.join("mempool.bin"))`. Regtest/testnet/mainnet all
use the same per-network data dir, so each network keeps its own mempool file.

## Verification

- Unit test: add actions to a builder with a temp persist path; construct a new
  builder pointing at the same path; assert the pending actions and counts
  match. After `build_root_block`, the persisted file is empty.
- On device: react, force-stop the app, reopen — the reaction shows exactly
  once (no 2→1 flip), and persists.
