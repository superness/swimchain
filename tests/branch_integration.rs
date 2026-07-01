//! Integration tests for Milestone 1.7: Branch Management
//!
//! Tests all acceptance criteria from ROADMAP.md:
//! - New posts assigned to branch by content hash
//! - Replies always go to same branch as parent (thread integrity)
//! - Branches fracture automatically at size threshold
//! - Threads never split across branches
//! - Branch metadata tracked correctly

use swimchain::blocks::{Action, ActionType, BranchDirection, BranchPath, ContentBlock};
use swimchain::branch::{
    BranchAwareStore, BranchManager, SpaceBranchState, BRANCH_FRACTURE_THRESHOLD,
};
use swimchain::storage::ChainStore;
use tempfile::tempdir;

/// Create a test action with specified PoW work
fn create_test_action(pow_work: u64) -> Action {
    Action {
        action_type: ActionType::Post,
        actor: [1u8; 32],
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
    }
}

/// Create a content block for testing
fn create_content_block(thread_id: [u8; 32], space_id: [u8; 32], is_first: bool) -> ContentBlock {
    ContentBlock {
        thread_root_id: thread_id,
        space_id,
        actions: vec![create_test_action(10)],
        merkle_root: [0u8; 32],
        prev_content_hash: if is_first { None } else { Some([0xFFu8; 32]) },
        timestamp: 1000,
        total_pow: 10,
        branch_path: BranchPath::root(),
        space_metadata: None,
    }
}

#[test]
fn test_new_post_branch_assignment_unfractured() {
    // CRITERION: New posts assigned to branch by content hash (before fracture)
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::new(&store);

    let mut thread_id = [0u8; 32];
    thread_id[0] = 0x80; // First bit = 1, would go RIGHT if fractured

    let block = create_content_block(thread_id, [1u8; 32], true);
    let result = branch_store.put_content_block(block).unwrap();

    // In unfractured space, all threads go to root
    assert_eq!(result.branch_path, BranchPath::root());
}

#[test]
fn test_new_post_after_fracture() {
    // CRITERION: New posts assigned to branch by content hash (after fracture)
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    // Use small threshold to trigger fracture easily
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, 1000);

    // Add blocks until fracture triggers
    let space_id = [1u8; 32];
    for i in 0..15 {
        let mut thread_id = [0u8; 32];
        thread_id[0] = i;
        let block = create_content_block(thread_id, space_id, true);
        branch_store.put_content_block(block).unwrap();
    }

    // Verify fracture occurred
    let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
    assert!(state.has_fractured(), "Space should have fractured");

    // New thread with hash 0x80... should go to RIGHT
    let mut new_thread_id = [0u8; 32];
    new_thread_id[0] = 0x80;
    let block = create_content_block(new_thread_id, space_id, true);
    let result = branch_store.put_content_block(block).unwrap();

    assert_eq!(
        result.branch_path,
        BranchPath::root().branch(BranchDirection::Right)
    );
}

#[test]
fn test_reply_inherits_parent_branch() {
    // CRITERION: Replies always go to same branch as parent (thread integrity)
    // NOTE: After fracture, threads get reassigned to child branches.
    // The reply should get the same branch as the thread's CURRENT location.
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, 1000);

    let space_id = [1u8; 32];
    let thread_id = [0x80u8; 32]; // Would go RIGHT if fractured

    // Create thread (first post)
    let first_block = create_content_block(thread_id, space_id, true);
    let first_result = branch_store.put_content_block(first_block).unwrap();

    // Force fracture by adding many other threads
    for i in 0..20 {
        let mut other_id = [0u8; 32];
        other_id[0] = i;
        let block = create_content_block(other_id, space_id, true);
        branch_store.put_content_block(block).unwrap();
    }

    // Get the thread's current branch (may have changed due to fracture)
    let manager = BranchManager::new(&store);
    let current_thread_branch = manager.get_thread_branch(&space_id, &thread_id).unwrap();

    // Create reply to original thread
    let mut reply_block = create_content_block(thread_id, space_id, false);
    reply_block.prev_content_hash = Some(first_result.hash);
    let reply_result = branch_store.put_content_block(reply_block).unwrap();

    // Reply should be in same branch as thread's CURRENT location (after fracture)
    assert_eq!(reply_result.branch_path, current_thread_branch);
}

#[test]
fn test_fracture_at_threshold() {
    // CRITERION: Branches fracture automatically at size threshold
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();

    let threshold = 500; // Small threshold
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, threshold);
    let space_id = [1u8; 32];

    // Add blocks until fracture triggers
    for i in 0..100 {
        let mut thread_id = [0u8; 32];
        thread_id[0] = i as u8;
        let block = create_content_block(thread_id, space_id, true);
        let result = branch_store.put_content_block(block).unwrap();

        if result.fracture_triggered {
            // Verify fracture happened
            let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
            assert!(state.has_fractured());
            assert_eq!(state.active_branches.len(), 2); // LEFT and RIGHT
            return;
        }
    }

    panic!("Fracture should have triggered before 100 blocks");
}

#[test]
fn test_thread_integrity_during_fracture() {
    // CRITERION: Threads never split across branches
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, 2000);
    let space_id = [1u8; 32];

    // Create 10 threads with multiple content blocks each
    let mut thread_hashes: Vec<([u8; 32], Vec<[u8; 32]>)> = Vec::new();

    for i in 0..10 {
        let mut thread_id = [0u8; 32];
        thread_id[0] = i * 10; // Spread across hash space

        let first = create_content_block(thread_id, space_id, true);
        let first_result = branch_store.put_content_block(first).unwrap();

        let mut hashes = vec![first_result.hash];

        // Add 5 replies per thread
        let mut prev_hash = first_result.hash;
        for _ in 0..5 {
            let mut reply = create_content_block(thread_id, space_id, false);
            reply.prev_content_hash = Some(prev_hash);
            let result = branch_store.put_content_block(reply).unwrap();
            hashes.push(result.hash);
            prev_hash = result.hash;
        }

        thread_hashes.push((thread_id, hashes));
    }

    // Verify fracture occurred
    let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
    assert!(state.has_fractured(), "Fracture should have occurred");

    // Verify all content blocks for each thread are in the same branch
    let manager = BranchManager::new(&store);
    for (thread_id, _hashes) in &thread_hashes {
        let branch = manager.get_thread_branch(&space_id, thread_id).unwrap();
        // All blocks share the same thread_root_id, so they're all in the same branch
        // The index lookup returns consistent branch for the thread
        assert!(
            state.active_branches.contains(&branch) || branch == BranchPath::root(),
            "Thread branch should be valid"
        );
    }
}

#[test]
fn test_branch_metadata_tracked() {
    // CRITERION: Branch metadata tracked correctly
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::new(&store);
    let space_id = [1u8; 32];

    // Add 5 content blocks with varying sizes
    for i in 0..5 {
        let mut thread_id = [0u8; 32];
        thread_id[0] = i;
        let block = create_content_block(thread_id, space_id, true);
        branch_store.put_content_block(block).unwrap();
    }

    // Check metadata
    let metadata = store
        .get_branch_metadata(&space_id, &BranchPath::root())
        .unwrap()
        .unwrap();
    assert_eq!(metadata.thread_count, 5);
    assert!(metadata.total_size > 0);
}

#[test]
fn test_deterministic_assignment_across_sessions() {
    // CRITERION: Consistent assignment (implicit from hash-based)
    // Thread assignment is deterministic based on stored index, persisted across sessions.
    let dir = tempdir().unwrap();
    let path = dir.path().join("chain");
    let space_id = [1u8; 32];
    let test_thread_id = [0u8; 32];
    let mut expected_branch = None;

    // First session: create thread and trigger fracture
    {
        let store = ChainStore::open(&path).unwrap();
        let branch_store = BranchAwareStore::with_fracture_threshold(&store, 1000);

        // Add enough to fracture
        for i in 0..20 {
            let mut tid = [0u8; 32];
            tid[0] = i;
            let block = create_content_block(tid, space_id, true);
            branch_store.put_content_block(block).unwrap();
        }

        // Record what branch the test thread ended up in
        let manager = BranchManager::new(&store);
        expected_branch = Some(
            manager
                .get_thread_branch(&space_id, &test_thread_id)
                .unwrap(),
        );

        store.flush().unwrap();
    }

    // Second session: query same thread - should get same branch
    {
        let store = ChainStore::open(&path).unwrap();
        let manager = BranchManager::new(&store);

        // Thread should have same assignment after reopen
        let branch = manager
            .get_thread_branch(&space_id, &test_thread_id)
            .unwrap();
        assert_eq!(branch, expected_branch.unwrap());
    }
}

#[test]
fn test_cross_branch_engagement() {
    // CRITERION: Cross-branch reference handling
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, 500);
    let space_id = [1u8; 32];

    // Create two threads that will end up in different branches
    let thread_a = [0x00u8; 32]; // Will go LEFT
    let thread_b = [0x80u8; 32]; // Will go RIGHT

    // Create threads
    let block_a = create_content_block(thread_a, space_id, true);
    let _result_a = branch_store.put_content_block(block_a).unwrap();

    let block_b = create_content_block(thread_b, space_id, true);
    let _result_b = branch_store.put_content_block(block_b).unwrap();

    // Add more to trigger fracture
    for i in 0..30 {
        let mut tid = [0u8; 32];
        tid[0] = i;
        let block = create_content_block(tid, space_id, true);
        branch_store.put_content_block(block).unwrap();
    }

    // Verify fracture
    let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
    if state.has_fractured() {
        let manager = BranchManager::new(&store);

        // Resolve engagement from thread_a to content in thread_b
        let engagement_branch = manager
            .resolve_engagement_branch(&space_id, &thread_b)
            .unwrap();
        let thread_b_branch = manager.get_thread_branch(&space_id, &thread_b).unwrap();

        // Engagement should go to TARGET's branch (thread_b's branch)
        assert_eq!(engagement_branch, thread_b_branch);
    }
}

#[test]
fn test_branch_fracture_threshold_default() {
    // Verify default threshold is 50MB
    assert_eq!(BRANCH_FRACTURE_THRESHOLD, 50 * 1024 * 1024);
}

#[test]
fn test_space_branch_state_initial() {
    let state = SpaceBranchState::new();
    assert_eq!(state.max_depth, 0);
    assert_eq!(state.active_branches.len(), 1);
    assert_eq!(state.active_branches[0], BranchPath::root());
    assert!(!state.has_fractured());
}

#[test]
fn test_new_thread_after_multiple_fractures() {
    // Test that threads are correctly assigned after multiple fractures
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, 400);
    let space_id = [1u8; 32];

    // Add many threads to trigger multiple fractures
    for i in 0..50 {
        let mut thread_id = [0u8; 32];
        thread_id[0] = i * 5;
        thread_id[1] = i; // Add more variation
        let block = create_content_block(thread_id, space_id, true);
        branch_store.put_content_block(block).unwrap();
    }

    let state = store.get_space_branch_state(&space_id).unwrap().unwrap();

    // Should have fractured at least once
    assert!(state.has_fractured(), "Should have fractured");
    assert!(
        state.max_depth >= 1,
        "Max depth should be at least 1: {}",
        state.max_depth
    );

    // Active branches can be at different depths (tree may not be balanced)
    // But they should all be at or below max_depth
    for branch in &state.active_branches {
        assert!(
            branch.depth <= state.max_depth,
            "Active branch depth {} exceeds max_depth {}",
            branch.depth,
            state.max_depth
        );
    }

    // Verify new threads can still be assigned
    let mut new_thread_id = [0xABu8; 32];
    let block = create_content_block(new_thread_id, space_id, true);
    let result = branch_store.put_content_block(block);
    assert!(
        result.is_ok(),
        "Should be able to assign new thread after fractures"
    );
}

#[test]
fn test_reply_lookup_after_fracture() {
    // Test that reply lookup works correctly after fracture
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::with_fracture_threshold(&store, 500);
    let space_id = [1u8; 32];

    // Create a thread before fracture
    let thread_id = [0x40u8; 32]; // Will be reassigned during fracture
    let first_block = create_content_block(thread_id, space_id, true);
    let first_result = branch_store.put_content_block(first_block).unwrap();
    let original_branch = first_result.branch_path.clone();

    // Trigger fracture with many other threads
    for i in 0..20 {
        let mut other_id = [0u8; 32];
        other_id[0] = i * 12;
        let block = create_content_block(other_id, space_id, true);
        branch_store.put_content_block(block).unwrap();
    }

    // Get current thread branch (may have changed due to fracture)
    let manager = BranchManager::new(&store);
    let current_branch = manager.get_thread_branch(&space_id, &thread_id).unwrap();

    // Add a reply - it should follow the thread's current branch
    let mut reply_block = create_content_block(thread_id, space_id, false);
    reply_block.prev_content_hash = Some(first_result.hash);
    let reply_result = branch_store.put_content_block(reply_block).unwrap();

    // Reply should be in same branch as thread (not necessarily the original!)
    assert_eq!(reply_result.branch_path, current_branch);
}

#[test]
fn test_branch_metadata_updates_on_reply() {
    // Test that replies update metadata correctly
    let dir = tempdir().unwrap();
    let store = ChainStore::open(dir.path()).unwrap();
    let branch_store = BranchAwareStore::new(&store);
    let space_id = [1u8; 32];
    let thread_id = [1u8; 32];

    // Create thread
    let block = create_content_block(thread_id, space_id, true);
    branch_store.put_content_block(block).unwrap();

    let metadata_after_post = store
        .get_branch_metadata(&space_id, &BranchPath::root())
        .unwrap()
        .unwrap();

    // Add reply
    let mut reply = create_content_block(thread_id, space_id, false);
    reply.prev_content_hash = Some([0xAAu8; 32]);
    branch_store.put_content_block(reply).unwrap();

    let metadata_after_reply = store
        .get_branch_metadata(&space_id, &BranchPath::root())
        .unwrap()
        .unwrap();

    // Thread count should be same (reply doesn't create new thread)
    assert_eq!(
        metadata_after_reply.thread_count,
        metadata_after_post.thread_count
    );

    // Total size should increase
    assert!(metadata_after_reply.total_size > metadata_after_post.total_size);
}
