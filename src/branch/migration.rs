//! Deterministic branch-state rebuild (SPEC_08 §5 migration)
//!
//! Branch placement state (thread → branch index, branch sizes, per-space
//! fracture state) must be a pure function of canonical chain data — never of
//! *when* a node started tracking it. Otherwise two nodes that upgraded at
//! different chain heights would accumulate different branch sizes, fracture
//! at different points, and diverge on placements.
//!
//! This module rebuilds the entire branch state by replaying the canonical
//! chain in height order through [`BranchManager::register_built_block`],
//! which is the exact same code path used for live block processing. The
//! rebuild runs once per `BRANCH_STATE_VERSION` (marker stored in the chain
//! DB) — typically on first startup after upgrading to a branching-aware
//! build, or on a fresh node after initial sync catches up (a fresh node
//! builds the same state incrementally as blocks arrive, so the replay is a
//! no-op for it).
//!
//! # Compatibility story
//!
//! - **Old blocks on disk**: everything was stamped `BranchPath::root()` and
//!   nothing was ever registered. Replay lazily assigns each thread from
//!   chain data (hash bits + fracture state at that point in the replay), so
//!   pre-branching chains migrate without a chain reset.
//! - **Root branch already over 50MB**: the replay triggers fractures
//!   mid-replay exactly as live processing would have — deterministically at
//!   the same block on every node.
//! - **Old nodes, new blocks**: `branch_path` has always been part of the
//!   content block hash; its *value* is not consensus-validated, so old nodes
//!   accept new blocks with non-root stamps unchanged. No reset required in
//!   either direction (regtest/testnet reset therefore NOT needed).

use crate::storage::ChainStore;

use super::error::BranchError;
use super::manager::BranchManager;

/// Current branch state schema version. Bump to force a rebuild on upgrade.
pub const BRANCH_STATE_VERSION: u32 = 1;

/// Statistics from a branch-state rebuild
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RebuildStats {
    /// Root block heights replayed
    pub heights_replayed: u64,
    /// Content blocks registered
    pub blocks_registered: u64,
    /// Fractures triggered during replay
    pub fractures: u64,
    /// Content blocks that failed to register (logged, not fatal)
    pub errors: u64,
}

/// Ensure branch state matches [`BRANCH_STATE_VERSION`], rebuilding from
/// canonical chain data if it does not.
///
/// Returns `Ok(None)` if the state was already current, `Ok(Some(stats))`
/// after a rebuild.
///
/// # Errors
///
/// Returns error if the version marker cannot be read/written or the chain
/// cannot be traversed. Per-block registration errors are counted in
/// `RebuildStats::errors` but do not abort the rebuild.
pub fn ensure_branch_state(
    store: &ChainStore,
    fracture_threshold: u64,
) -> Result<Option<RebuildStats>, BranchError> {
    if store.get_branch_state_version()? == Some(BRANCH_STATE_VERSION) {
        return Ok(None);
    }
    let stats = rebuild_branch_state(store, fracture_threshold)?;
    Ok(Some(stats))
}

/// Rebuild branch state unconditionally by replaying the canonical chain.
///
/// Deterministic: walks heights 0..=tip, and within each root block visits
/// space blocks and content blocks in their stored (hash-committed) order —
/// the same order every node sees. Metadata timestamps come from block
/// timestamps, so the resulting state is byte-identical across nodes.
///
/// # Errors
///
/// Returns error on marker/traversal failures; per-block registration errors
/// are tolerated and counted.
pub fn rebuild_branch_state(
    store: &ChainStore,
    fracture_threshold: u64,
) -> Result<RebuildStats, BranchError> {
    store.clear_branch_state()?;

    let manager = BranchManager::with_threshold(store, fracture_threshold);
    let mut stats = RebuildStats::default();

    let tip = match store.get_latest_height()? {
        Some(h) => h,
        None => {
            // Empty chain — nothing to replay, just stamp the version.
            store.set_branch_state_version(BRANCH_STATE_VERSION)?;
            return Ok(stats);
        }
    };

    for height in 0..=tip {
        let root_hash = match store.get_root_hash_at_height(height)? {
            Some(h) => h,
            None => continue,
        };
        let root_block = match store.get_root_block(&root_hash)? {
            Some(b) => b,
            None => continue,
        };
        stats.heights_replayed += 1;

        for space_hash in &root_block.space_block_hashes {
            let space_block = match store.get_space_block(space_hash)? {
                Some(b) => b,
                None => continue,
            };
            for content_hash in &space_block.content_block_hashes {
                let content_block = match store.get_content_block(content_hash)? {
                    Some(b) => b,
                    None => continue,
                };
                match manager.register_built_block(&content_block) {
                    Ok((_, fractured)) => {
                        stats.blocks_registered += 1;
                        if fractured {
                            stats.fractures += 1;
                        }
                    }
                    Err(e) => {
                        log::warn!(
                            "[BRANCH-REBUILD] Failed to register content block {} at height {}: {}",
                            hex::encode(&content_hash[..8]),
                            height,
                            e
                        );
                        stats.errors += 1;
                    }
                }
            }
        }
    }

    store.set_branch_state_version(BRANCH_STATE_VERSION)?;
    log::info!(
        "[BRANCH-REBUILD] Rebuilt branch state: {} heights, {} blocks, {} fractures, {} errors",
        stats.heights_replayed,
        stats.blocks_registered,
        stats.fractures,
        stats.errors
    );
    Ok(stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::{Action, ActionType, BranchPath, ContentBlock, RootBlock, SpaceBlock};
    use crate::branch::BRANCH_FRACTURE_THRESHOLD;
    use tempfile::tempdir;

    fn make_action(actor_byte: u8, pow_work: u64) -> Action {
        Action {
            action_type: ActionType::Post,
            actor: [actor_byte; 32],
            timestamp: 1000,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        }
    }

    fn make_content_block(thread_id: [u8; 32], space_id: [u8; 32], ts: u64) -> ContentBlock {
        ContentBlock::new(
            thread_id,
            space_id,
            vec![make_action(1, 10)],
            None,
            ts,
            // Old chains: everything stamped at root
            BranchPath::root(),
        )
        .unwrap()
    }

    /// Build a minimal single-space chain of `n` root blocks, one content
    /// block each, and store it WITHOUT registering any branch state
    /// (simulates a pre-branching chain).
    fn build_legacy_chain(store: &ChainStore, n: u8) {
        let space_id = [7u8; 32];
        let mut prev_root = [0u8; 32];
        let mut prev_cumulative = 0u64;
        for i in 0..n {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            let ts = 1000 + u64::from(i);
            let cb = make_content_block(thread_id, space_id, ts);
            store.put_content_block(&cb).unwrap();

            let sb = SpaceBlock::from_content_blocks(space_id, &[cb], None, ts);
            store.put_space_block(&sb).unwrap();

            let rb = RootBlock::from_space_blocks(
                &[sb],
                prev_root,
                prev_cumulative,
                ts,
                30,
                u64::from(i) + 1,
                [9u8; 32],
            );
            prev_root = rb.hash();
            prev_cumulative = rb.cumulative_pow;
            store.put_root_block_with_fork_resolution(&rb).unwrap();
        }
    }

    #[test]
    fn test_ensure_branch_state_empty_chain() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();

        let stats = ensure_branch_state(&store, BRANCH_FRACTURE_THRESHOLD)
            .unwrap()
            .expect("first run rebuilds");
        assert_eq!(stats.blocks_registered, 0);

        // Second run is a no-op
        assert!(ensure_branch_state(&store, BRANCH_FRACTURE_THRESHOLD)
            .unwrap()
            .is_none());
    }

    #[test]
    fn test_rebuild_indexes_legacy_chain() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        build_legacy_chain(&store, 4);

        let stats = ensure_branch_state(&store, BRANCH_FRACTURE_THRESHOLD)
            .unwrap()
            .expect("rebuild runs");
        assert_eq!(stats.blocks_registered, 4);
        assert_eq!(stats.errors, 0);

        // All threads must now be indexed
        let space_id = [7u8; 32];
        for i in 0..4u8 {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            assert!(store
                .get_thread_branch(&space_id, &thread_id)
                .unwrap()
                .is_some());
        }
    }

    #[test]
    fn test_rebuild_fractures_oversized_root() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        build_legacy_chain(&store, 8);

        // Tiny threshold: legacy root is already "over threshold"
        let stats = rebuild_branch_state(&store, 300).unwrap();
        assert!(stats.fractures > 0, "replay must fracture oversized root");

        let space_id = [7u8; 32];
        let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
        assert!(state.has_fractured());
    }

    #[test]
    fn test_rebuild_is_deterministic() {
        // Two independent stores fed the same chain data must produce
        // identical placements for every thread.
        let dir_a = tempdir().unwrap();
        let dir_b = tempdir().unwrap();
        let store_a = ChainStore::open(dir_a.path()).unwrap();
        let store_b = ChainStore::open(dir_b.path()).unwrap();
        build_legacy_chain(&store_a, 8);
        build_legacy_chain(&store_b, 8);

        rebuild_branch_state(&store_a, 300).unwrap();
        rebuild_branch_state(&store_b, 300).unwrap();

        let space_id = [7u8; 32];
        let state_a = store_a.get_space_branch_state(&space_id).unwrap().unwrap();
        let state_b = store_b.get_space_branch_state(&space_id).unwrap().unwrap();
        assert_eq!(state_a.max_depth, state_b.max_depth);
        assert_eq!(state_a.active_branches, state_b.active_branches);

        for i in 0..8u8 {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            assert_eq!(
                store_a.get_thread_branch(&space_id, &thread_id).unwrap(),
                store_b.get_thread_branch(&space_id, &thread_id).unwrap(),
                "placement diverged for thread {i}"
            );
        }
    }

    #[test]
    fn test_rebuild_replay_matches_incremental() {
        // A node that processed blocks live (incremental registration) must
        // hold the same state as a node that rebuilt from the chain.
        let dir_live = tempdir().unwrap();
        let dir_replay = tempdir().unwrap();
        let store_live = ChainStore::open(dir_live.path()).unwrap();
        let store_replay = ChainStore::open(dir_replay.path()).unwrap();

        let space_id = [7u8; 32];
        let threshold = 300u64;

        // Live node: register as blocks are produced
        let live_mgr = BranchManager::with_threshold(&store_live, threshold);
        let mut prev_root = [0u8; 32];
        let mut prev_cumulative = 0u64;
        for i in 0..8u8 {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            let ts = 1000 + u64::from(i);
            let cb = make_content_block(thread_id, space_id, ts);
            store_live.put_content_block(&cb).unwrap();
            live_mgr.register_built_block(&cb).unwrap();
            // Mirror the chain structure on both stores
            store_replay.put_content_block(&cb).unwrap();

            let sb = SpaceBlock::from_content_blocks(space_id, &[cb], None, ts);
            store_live.put_space_block(&sb).unwrap();
            store_replay.put_space_block(&sb).unwrap();

            let rb = RootBlock::from_space_blocks(
                &[sb],
                prev_root,
                prev_cumulative,
                ts,
                30,
                u64::from(i) + 1,
                [9u8; 32],
            );
            prev_root = rb.hash();
            prev_cumulative = rb.cumulative_pow;
            store_live.put_root_block_with_fork_resolution(&rb).unwrap();
            store_replay
                .put_root_block_with_fork_resolution(&rb)
                .unwrap();
        }

        // Replay node: rebuild from chain data alone
        rebuild_branch_state(&store_replay, threshold).unwrap();

        let state_live = store_live
            .get_space_branch_state(&space_id)
            .unwrap()
            .unwrap();
        let state_replay = store_replay
            .get_space_branch_state(&space_id)
            .unwrap()
            .unwrap();
        assert_eq!(state_live.max_depth, state_replay.max_depth);
        assert_eq!(state_live.active_branches, state_replay.active_branches);

        for i in 0..8u8 {
            let mut thread_id = [0u8; 32];
            thread_id[0] = i;
            assert_eq!(
                store_live.get_thread_branch(&space_id, &thread_id).unwrap(),
                store_replay
                    .get_thread_branch(&space_id, &thread_id)
                    .unwrap(),
                "live vs replay placement diverged for thread {i}"
            );
        }
    }
}
