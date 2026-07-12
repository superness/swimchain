//! Engagement Pool Integration Tests
//!
//! Tests for multi-user pooled engagement per SPEC_03 §7.
//! Pools allow multiple users to contribute PoW to preserve content.
//!
//! Key properties tested:
//! - Pool creation and contribution
//! - Sybil resistance (60×1s = 1×60s)
//! - Pool expiry after 10 minutes
//! - Pool completion resets decay timer
//! - Content-specific PoW targets

use swimchain::content::pool::{
    compute_pool_pow_target, CompletionResult, EngagementPool, PoolContribution, PoolError, PoolId,
    PoolManager, PoolStatus,
};
use swimchain::crypto::action_pow::ForkPoWConfig;
use swimchain::types::constants::{MIN_CONTRIBUTION_SECS, POOL_REQUIRED_POW_SECS, POOL_WINDOW_MS};

// ============================================================================
// Unit Tests - PoolManager Core Logic
// ============================================================================

fn make_contribution(
    contributor: [u8; 32],
    pow_work: u64,
    timestamp: u64,
    pow_target: [u8; 32],
) -> PoolContribution {
    PoolContribution {
        contributor,
        pow_nonce: 12345,
        pow_work,
        pow_target,
        timestamp,
        signature: [0u8; 64],
        nonce_space: [0u8; 8],
        emoji: None,
    }
}

#[test]
fn test_pool_creation_basic() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let initiator = [2u8; 32];
    let time = 1000u64;

    let pool_id = manager.create_pool(content, initiator, time);

    let pool = manager.get_pool(&pool_id).unwrap();
    assert_eq!(pool.status, PoolStatus::Open);
    assert_eq!(pool.required_pow, POOL_REQUIRED_POW_SECS);
    assert_eq!(pool.target_content, content);
    assert!(pool.contributions.is_empty());
}

#[test]
fn test_pool_id_is_deterministic() {
    let mut m1 = PoolManager::new();
    let mut m2 = PoolManager::new();

    let content = [1u8; 32];
    let initiator = [2u8; 32];
    let time = 5000u64;

    let id1 = m1.create_pool(content, initiator, time);
    let id2 = m2.create_pool(content, initiator, time);

    assert_eq!(id1, id2, "Same inputs should produce same pool ID");
}

#[test]
fn test_pool_id_differs_for_different_content() {
    let mut manager = PoolManager::new();

    let id1 = manager.create_pool([1u8; 32], [0u8; 32], 0);
    let id2 = manager.create_pool([2u8; 32], [0u8; 32], 0);

    assert_ne!(
        id1, id2,
        "Different content should produce different pool IDs"
    );
}

#[test]
fn test_single_contributor_completion() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // One person contributes full 60s
    let contribution = make_contribution([1u8; 32], 60, 1000, pow_target);
    manager
        .add_contribution(pool_id, contribution, 5000, &config)
        .unwrap();

    let result = manager.check_completion(pool_id).unwrap();
    match result {
        CompletionResult::Completed {
            total_pow,
            contributor_count,
            ..
        } => {
            assert_eq!(total_pow, 60);
            assert_eq!(contributor_count, 1);
        }
        _ => panic!("Expected Completed, got {:?}", result),
    }
}

#[test]
fn test_multi_contributor_completion() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // 3 contributors, 20s each = 60s total
    for i in 0..3u8 {
        let contribution = make_contribution([i; 32], 20, 1000 + i as u64, pow_target);
        manager
            .add_contribution(pool_id, contribution, 5000, &config)
            .unwrap();
    }

    let result = manager.check_completion(pool_id).unwrap();
    match result {
        CompletionResult::Completed {
            total_pow,
            contributor_count,
            contributors,
        } => {
            assert_eq!(total_pow, 60);
            assert_eq!(contributor_count, 3);
            assert_eq!(contributors.len(), 3);
        }
        _ => panic!("Expected Completed, got {:?}", result),
    }
}

#[test]
fn test_sybil_resistance_equivalence() {
    // Scenario 1: One user contributes 60s
    let mut m1 = PoolManager::new();
    let content = [1u8; 32];
    let pool_id1 = m1.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let target1 = compute_pool_pow_target(&content, &pool_id1, None);

    let single_contribution = make_contribution([1u8; 32], 60, 1000, target1);
    m1.add_contribution(pool_id1, single_contribution, 5000, &config)
        .unwrap();

    // Scenario 2: 60 users contribute 1s each
    let mut m2 = PoolManager::new();
    let pool_id2 = m2.create_pool(content, [0u8; 32], 0);
    let target2 = compute_pool_pow_target(&content, &pool_id2, None);

    for i in 0..60u8 {
        let contribution = make_contribution([i; 32], 1, 1000 + i as u64, target2);
        m2.add_contribution(pool_id2, contribution, 5000, &config)
            .unwrap();
    }

    // Both should complete with same total work
    let result1 = m1.check_completion(pool_id1).unwrap();
    let result2 = m2.check_completion(pool_id2).unwrap();

    match (result1, result2) {
        (
            CompletionResult::Completed { total_pow: t1, .. },
            CompletionResult::Completed { total_pow: t2, .. },
        ) => {
            assert_eq!(t1, 60);
            assert_eq!(t2, 60);
        }
        _ => panic!("Both pools should complete"),
    }
}

#[test]
fn test_same_contributor_multiple_times() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // Same person contributes twice
    let c1 = make_contribution([1u8; 32], 30, 1000, pow_target);
    let c2 = make_contribution([1u8; 32], 30, 2000, pow_target);

    manager
        .add_contribution(pool_id, c1, 5000, &config)
        .unwrap();
    manager
        .add_contribution(pool_id, c2, 5000, &config)
        .unwrap();

    let result = manager.check_completion(pool_id).unwrap();
    match result {
        CompletionResult::Completed {
            total_pow,
            contributor_count,
            ..
        } => {
            assert_eq!(total_pow, 60);
            assert_eq!(contributor_count, 2); // 2 contributions (may have same contributor)
        }
        _ => panic!("Expected Completed"),
    }
}

#[test]
fn test_pool_expiry() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // Add 30s (not enough to complete)
    let contribution = make_contribution([1u8; 32], 30, 1000, pow_target);
    manager
        .add_contribution(pool_id, contribution, 5000, &config)
        .unwrap();

    // Advance time past window (11 minutes)
    let after_expiry = POOL_WINDOW_MS + 60_000;
    let expired = manager.expire_pools(after_expiry);

    assert_eq!(expired.len(), 1);
    assert_eq!(expired[0], pool_id);

    let pool = manager.get_pool(&pool_id).unwrap();
    assert_eq!(pool.status, PoolStatus::Expired);
    // Work is preserved but unusable
    assert_eq!(pool.contributions.len(), 1);
}

#[test]
fn test_expired_pool_rejects_contributions() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // Expire the pool
    manager.expire_pools(POOL_WINDOW_MS + 1);

    // Try to add contribution
    let contribution = make_contribution([1u8; 32], 30, 1000, pow_target);
    let result = manager.add_contribution(pool_id, contribution, POOL_WINDOW_MS + 1, &config);

    assert!(matches!(result, Err(PoolError::PoolNotOpen(_))));
}

#[test]
fn test_minimum_contribution_enforced() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // Try to add 0s contribution
    let contribution = make_contribution([1u8; 32], 0, 1000, pow_target);
    let result = manager.add_contribution(pool_id, contribution, 5000, &config);

    assert!(matches!(
        result,
        Err(PoolError::ContributionTooSmall {
            provided: 0,
            minimum: 1
        })
    ));
}

#[test]
fn test_content_specific_pow_target() {
    let mut manager = PoolManager::new();
    let content_a = [1u8; 32];
    let content_b = [2u8; 32];
    let config = ForkPoWConfig::test();

    let pool_a = manager.create_pool(content_a, [0u8; 32], 0);
    let pool_b = manager.create_pool(content_b, [0u8; 32], 0);

    let target_a = compute_pool_pow_target(&content_a, &pool_a, None);
    let target_b = compute_pool_pow_target(&content_b, &pool_b, None);

    assert_ne!(target_a, target_b);

    // Try to use target_b on pool_a
    let contribution = make_contribution([1u8; 32], 30, 1000, target_b);
    let result = manager.add_contribution(pool_a, contribution, 5000, &config);

    assert!(matches!(result, Err(PoolError::ContentMismatch)));
}

#[test]
fn test_pool_info_query() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    // Add 30s
    let contribution = make_contribution([1u8; 32], 30, 1000, pow_target);
    manager
        .add_contribution(pool_id, contribution, 5000, &config)
        .unwrap();

    let info = manager.get_pool_info(&pool_id, 5000).unwrap();
    assert_eq!(info.pool_id, pool_id);
    assert_eq!(info.status, PoolStatus::Open);
    assert_eq!(info.total_contributed, 30);
    assert_eq!(info.required, 60);
    assert_eq!(info.contributor_count, 1);
    assert!(info.time_remaining_ms.is_some());
}

#[test]
fn test_get_pools_for_content() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];

    // Create 3 pools for same content
    let pool1 = manager.create_pool(content, [1u8; 32], 0);
    let pool2 = manager.create_pool(content, [2u8; 32], 100);
    let pool3 = manager.create_pool(content, [3u8; 32], 200);

    let pools = manager.get_pools_for_content(&content);
    assert_eq!(pools.len(), 3);
    assert!(pools.contains(&pool1));
    assert!(pools.contains(&pool2));
    assert!(pools.contains(&pool3));
}

#[test]
fn test_get_pool_info_for_content_returns_highest() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let config = ForkPoWConfig::test();

    // Create 3 pools with different contributions
    let pool1 = manager.create_pool(content, [1u8; 32], 0);
    let pool2 = manager.create_pool(content, [2u8; 32], 100);
    let pool3 = manager.create_pool(content, [3u8; 32], 200);

    let target1 = compute_pool_pow_target(&content, &pool1, None);
    let target2 = compute_pool_pow_target(&content, &pool2, None);
    let target3 = compute_pool_pow_target(&content, &pool3, None);

    // Pool 1: 10s, Pool 2: 30s (highest), Pool 3: 20s
    manager
        .add_contribution(
            pool1,
            make_contribution([1u8; 32], 10, 1000, target1),
            5000,
            &config,
        )
        .unwrap();
    manager
        .add_contribution(
            pool2,
            make_contribution([2u8; 32], 30, 1000, target2),
            5000,
            &config,
        )
        .unwrap();
    manager
        .add_contribution(
            pool3,
            make_contribution([3u8; 32], 20, 1000, target3),
            5000,
            &config,
        )
        .unwrap();

    let best = manager.get_pool_info_for_content(&content, 5000).unwrap();
    assert_eq!(best.pool_id, pool2);
    assert_eq!(best.total_contributed, 30);
}

#[test]
fn test_pool_cleanup() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let config = ForkPoWConfig::test();

    // Create and complete a pool
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);
    let contribution = make_contribution([1u8; 32], 60, 1000, pow_target);
    manager
        .add_contribution(pool_id, contribution, 5000, &config)
        .unwrap();
    manager.check_completion(pool_id).unwrap();

    assert_eq!(manager.pool_count(), 1);

    // Cleanup pools older than 2x window
    let removed = manager.cleanup_old_pools(POOL_WINDOW_MS * 2);
    assert_eq!(removed, 1);
    assert_eq!(manager.pool_count(), 0);
}

#[test]
fn test_completion_check_is_idempotent() {
    let mut manager = PoolManager::new();
    let content = [1u8; 32];
    let pool_id = manager.create_pool(content, [0u8; 32], 0);
    let config = ForkPoWConfig::test();
    let pow_target = compute_pool_pow_target(&content, &pool_id, None);

    let contribution = make_contribution([1u8; 32], 60, 1000, pow_target);
    manager
        .add_contribution(pool_id, contribution, 5000, &config)
        .unwrap();

    // Check completion multiple times
    let result1 = manager.check_completion(pool_id).unwrap();
    let result2 = manager.check_completion(pool_id).unwrap();

    // Both should show completed
    assert!(matches!(result1, CompletionResult::Completed { .. }));
    assert!(matches!(result2, CompletionResult::Completed { .. }));
}

// ============================================================================
// Integration Tests - Pool System in Node Context
// ============================================================================

/// Test pool creation via RPC
#[test]
#[ignore = "requires node integration"]
fn test_pool_creation_via_rpc() {
    // 1. Create content
    // 2. Call create_pool RPC with content hash
    // 3. Get pool_id back
    // 4. Query pool info
    // 5. Verify pool is open and targets content
    todo!("Implement after PoolManager node integration")
}

/// Test multi-user pool completion
#[test]
#[ignore = "requires node integration"]
fn test_multi_user_pool_completion_e2e() {
    // 1. User A creates content
    // 2. User B creates pool for content
    // 3. Users B, C, D each contribute 20s PoW
    // 4. Pool completes
    // 5. Content's decay timer is reset
    todo!("Implement after PoolManager node integration")
}

/// Test pool discovery via gossip
#[test]
#[ignore = "requires node integration"]
fn test_pool_discovery_via_gossip() {
    // 1. Node A creates pool
    // 2. Node B connects to A
    // 3. B receives POOL_ANNOUNCE
    // 4. B can contribute to pool
    todo!("Implement after PoolManager node integration")
}

/// Test pool expiry with lost work
#[test]
#[ignore = "requires node integration"]
fn test_pool_expiry_work_lost() {
    // 1. Create pool
    // 2. Add 30s contribution
    // 3. Wait 11 minutes (past expiry)
    // 4. Pool status is Expired
    // 5. Work is not applied to content
    // 6. Content continues normal decay
    todo!("Implement after PoolManager node integration")
}

/// Test pool completion resets decay
#[test]
#[ignore = "requires node integration"]
fn test_pool_completion_resets_decay_timer() {
    // 1. Create content
    // 2. Wait 5 days (content near decay)
    // 3. Create and complete pool
    // 4. Content's last_engagement is updated
    // 5. Content is no longer near decay
    todo!("Implement after PoolManager node integration")
}

/// Test pool contribution requires correct target
#[test]
#[ignore = "requires node integration"]
fn test_pool_contribution_target_enforcement() {
    // 1. Create pool A for content A
    // 2. Create pool B for content B
    // 3. Compute PoW for content B
    // 4. Try to submit to pool A
    // 5. Rejected: ContentMismatch
    todo!("Implement after PoolManager node integration")
}

/// Test concurrent pool contributions
#[test]
#[ignore = "requires node integration"]
fn test_concurrent_pool_contributions() {
    // 1. Create pool
    // 2. 10 users contribute simultaneously
    // 3. All contributions recorded
    // 4. No race conditions
    // 5. Pool completes when threshold met
    todo!("Implement after PoolManager node integration")
}
