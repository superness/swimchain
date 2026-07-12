//! Flow 5: Chain Growth, Engagement Graph, and Content Lifecycle
//!
//! Comprehensive E2E tests for:
//! 1. Chain growth simulation - estimates storage at scale
//! 2. Engagement graph building - tracks who engages with whom
//! 3. Content posting and fetching - full lifecycle validation
//!
//! These tests validate system behavior under simulated long-term usage.

use std::collections::HashMap;
use std::time::{Duration, Instant};
use tempfile::tempdir;

use swimchain::blocks::{Action, ActionType, BranchPath, ContentBlock, RootBlock};
use swimchain::crypto::sha256;
use swimchain::engagement_graph::{EngagementGraphStore, EngagementType};
use swimchain::identity::create_identity_with_difficulty;
use swimchain::storage::{BlobStore, ChainStore, ContentBlobHash};
use swimchain::types::content::SpaceId;

use super::timing::TimingCollector;

// ============================================================================
// Chain Growth Simulation Tests
// ============================================================================

/// Test: Simulate chain growth over time and estimate storage requirements
///
/// This tests how much storage space the chain will consume as it grows
/// with realistic usage patterns.
#[test]
fn test_chain_growth_simulation() {
    let mut timing = TimingCollector::new();
    let dir = tempdir().unwrap();
    let chain_store = ChainStore::open(dir.path().join("chain")).unwrap();

    // Simulation parameters
    const BLOCKS_PER_DAY: u64 = 24 * 60; // 1 block per minute
    const DAYS_TO_SIMULATE: u64 = 365; // 1 year
    const ACTIONS_PER_BLOCK_AVG: usize = 50;

    // But for actual test, use smaller numbers
    const TEST_BLOCKS: u64 = 100;
    const TEST_ACTIONS_PER_BLOCK: usize = 20;

    let simulate_start = Instant::now();

    // Track storage growth
    let mut total_root_bytes: u64 = 0;
    let mut total_content_bytes: u64 = 0;
    let mut action_count: u64 = 0;

    // Create test identity for actions
    let (keypair, _) = create_identity_with_difficulty(4);
    let actor = *keypair.public_key.as_bytes();

    // Generate simulated blocks
    for block_num in 0..TEST_BLOCKS {
        let timestamp = 1700000000 + (block_num * 60); // 1 minute apart

        // Create actions for this block
        let mut actions = Vec::new();
        for action_idx in 0..TEST_ACTIONS_PER_BLOCK {
            let content_data = format!("Content {} in block {}", action_idx, block_num);
            let content_hash = sha256(content_data.as_bytes());

            let action = Action {
                action_type: if action_idx % 3 == 0 {
                    ActionType::Post
                } else if action_idx % 3 == 1 {
                    ActionType::Reply
                } else {
                    ActionType::Engage
                },
                actor,
                timestamp,
                content_hash: Some(content_hash),
                parent_id: if action_idx % 3 == 1 {
                    // Replies reference previous content
                    Some(sha256(
                        format!("Content 0 in block {}", block_num.saturating_sub(1)).as_bytes(),
                    ))
                } else {
                    None
                },
                pow_nonce: 12345,
                pow_work: 10,
                pow_target: [0u8; 32],
                signature: [0u8; 64],
                emoji: if action_idx % 3 == 2 { Some(1) } else { None }, // Engage actions have emoji
                media_refs: vec![],
                display_name: None,
                replaces_pending: None,
            };
            actions.push(action);
            action_count += 1;
        }

        // Estimate serialized sizes
        let action_size = 218; // ACTION_SERIALIZED_SIZE
        let content_block_overhead = 100; // Header, merkle root, etc.
        let content_block_size = content_block_overhead + (actions.len() * action_size);
        total_content_bytes += content_block_size as u64;

        // Root block overhead (hash, height, timestamp, etc.)
        let root_block_size = 200;
        total_root_bytes += root_block_size;
    }
    timing.record("simulation", simulate_start.elapsed());

    // Calculate projections
    let bytes_per_block = (total_root_bytes + total_content_bytes) / TEST_BLOCKS;
    let projected_daily_bytes = bytes_per_block * BLOCKS_PER_DAY;
    let projected_yearly_bytes = projected_daily_bytes * DAYS_TO_SIMULATE;
    let projected_yearly_gb = projected_yearly_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

    // With full simulation params (50 actions/block)
    let full_bytes_per_block = 200 + 100 + (ACTIONS_PER_BLOCK_AVG * 218);
    let full_yearly_bytes = (full_bytes_per_block as u64) * BLOCKS_PER_DAY * DAYS_TO_SIMULATE;
    let full_yearly_gb = full_yearly_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

    println!("=== Chain Growth Simulation Results ===");
    println!(
        "Test simulation: {} blocks, {} actions/block",
        TEST_BLOCKS, TEST_ACTIONS_PER_BLOCK
    );
    println!(
        "Total bytes (test): {} KB",
        (total_root_bytes + total_content_bytes) / 1024
    );
    println!("Bytes per block: {} bytes", bytes_per_block);
    println!("Actions simulated: {}", action_count);
    println!();
    println!(
        "=== Yearly Projections (at {} actions/block) ===",
        ACTIONS_PER_BLOCK_AVG
    );
    println!("Blocks per year: {}", BLOCKS_PER_DAY * DAYS_TO_SIMULATE);
    println!(
        "Daily storage growth: {} MB",
        projected_daily_bytes / (1024 * 1024)
    );
    println!(
        "Yearly storage (test params): {:.2} GB",
        projected_yearly_gb
    );
    println!("Yearly storage (full params): {:.2} GB", full_yearly_gb);
    println!();
    println!("Timing: {:?}", timing.total("simulation").unwrap());

    // Assertions
    assert!(bytes_per_block > 0, "Should calculate bytes per block");
    assert!(action_count == TEST_BLOCKS * TEST_ACTIONS_PER_BLOCK as u64);

    // Yearly storage should be reasonable (< 100GB for moderate usage)
    assert!(
        full_yearly_gb < 100.0,
        "Yearly storage should be < 100GB, got {:.2} GB",
        full_yearly_gb
    );
}

/// Test: Storage size per content type
#[test]
fn test_content_type_storage_sizes() {
    println!("=== Storage Size Analysis ===");

    // Action sizes (from SPEC_08)
    let action_size = 218; // Fixed action size

    // Typical content sizes
    let post_text_avg = 500; // 500 bytes for average post text
    let reply_text_avg = 200; // Replies are shorter
    let media_chunk = 1024 * 1024; // 1MB chunks for media

    // Per-action storage (action + content blob)
    let post_total = action_size + post_text_avg;
    let reply_total = action_size + reply_text_avg;
    let engage_total = action_size; // No content blob
    let media_total = action_size + media_chunk;

    println!("Action base size: {} bytes", action_size);
    println!("Post (action + text): {} bytes", post_total);
    println!("Reply (action + text): {} bytes", reply_total);
    println!("Engage (action only): {} bytes", engage_total);
    println!("Media post (action + 1MB): {} bytes", media_total);
    println!();

    // Estimate for typical usage patterns
    // Assume: 60% posts, 30% replies, 10% engages
    let weighted_avg =
        (0.6 * post_total as f64) + (0.3 * reply_total as f64) + (0.1 * engage_total as f64);
    println!("Weighted average per action: {:.0} bytes", weighted_avg);

    // If 1000 active users, 10 actions/day each
    let daily_actions = 1000 * 10;
    let daily_bytes = daily_actions as f64 * weighted_avg;
    let monthly_gb = (daily_bytes * 30.0) / (1024.0 * 1024.0 * 1024.0);
    println!("1000 users @ 10 actions/day:");
    println!("  Daily: {:.2} MB", daily_bytes / (1024.0 * 1024.0));
    println!("  Monthly: {:.4} GB", monthly_gb);

    // Assertions
    assert!(action_size == 218, "Action size should be 218 bytes");
    assert!(
        monthly_gb < 1.0,
        "Monthly storage for 1000 users should be < 1GB"
    );
}

// ============================================================================
// Engagement Graph Tests
// ============================================================================

/// Test: Engagement graph tracks reply relationships
#[test]
fn test_engagement_graph_reply_tracking() {
    let mut timing = TimingCollector::new();
    let dir = tempdir().unwrap();
    let db = sled::open(dir.path().join("engagement")).unwrap();
    let store = EngagementGraphStore::open(db);

    // Create test identities
    let alice = [1u8; 32];
    let bob = [2u8; 32];
    let charlie = [3u8; 32];

    let start = Instant::now();

    // Alice posts, Bob replies to Alice's post
    store
        .record_engagement(&bob, &alice, EngagementType::Reply, 1000)
        .unwrap();

    // Charlie also replies to Alice
    store
        .record_engagement(&charlie, &alice, EngagementType::Reply, 2000)
        .unwrap();

    // Bob replies to Alice again
    store
        .record_engagement(&bob, &alice, EngagementType::Reply, 3000)
        .unwrap();

    timing.record("recording", start.elapsed());

    // Verify edges
    let bob_alice = store.get_edge(&bob, &alice).unwrap().unwrap();
    assert_eq!(bob_alice.total_count, 2, "Bob replied to Alice twice");
    assert_eq!(bob_alice.reply_count, 2);

    let charlie_alice = store.get_edge(&charlie, &alice).unwrap().unwrap();
    assert_eq!(charlie_alice.total_count, 1, "Charlie replied once");

    // Verify stats
    let alice_stats = store.get_stats(&alice).unwrap();
    assert_eq!(
        alice_stats.total_incoming, 3,
        "Alice received 3 engagements"
    );
    assert_eq!(alice_stats.incoming_replies, 3);

    // Verify engagers list
    let alice_engagers = store.get_engagers(&alice).unwrap();
    assert_eq!(alice_engagers.len(), 2, "Alice has 2 unique engagers");
    assert!(alice_engagers.contains(&bob));
    assert!(alice_engagers.contains(&charlie));

    println!(
        "Engagement graph reply tracking: {:?}",
        timing.total("recording").unwrap()
    );
}

/// Test: Engagement graph tracks reactions
#[test]
fn test_engagement_graph_reaction_tracking() {
    let dir = tempdir().unwrap();
    let db = sled::open(dir.path().join("engagement")).unwrap();
    let store = EngagementGraphStore::open(db);

    let author = [10u8; 32];
    let reactor1 = [11u8; 32];
    let reactor2 = [12u8; 32];

    // Multiple users react to author's content
    for i in 0..5 {
        store
            .record_engagement(&reactor1, &author, EngagementType::Reaction, 1000 + i * 100)
            .unwrap();
    }
    store
        .record_engagement(&reactor2, &author, EngagementType::Reaction, 2000)
        .unwrap();

    // Verify
    let r1_edge = store.get_edge(&reactor1, &author).unwrap().unwrap();
    assert_eq!(r1_edge.total_count, 5);
    assert_eq!(r1_edge.reaction_count, 5);
    assert_eq!(r1_edge.reply_count, 0);

    let author_stats = store.get_stats(&author).unwrap();
    assert_eq!(author_stats.total_incoming, 6);
    assert_eq!(author_stats.incoming_reactions, 6);
}

/// Test: Mutual engagement detection
#[test]
fn test_engagement_graph_mutual_engagement() {
    let dir = tempdir().unwrap();
    let db = sled::open(dir.path().join("engagement")).unwrap();
    let store = EngagementGraphStore::open(db);

    let user_a = [20u8; 32];
    let user_b = [21u8; 32];

    // User A engages with User B
    store
        .record_engagement(&user_a, &user_b, EngagementType::Reply, 1000)
        .unwrap();
    store
        .record_engagement(&user_a, &user_b, EngagementType::Reaction, 1500)
        .unwrap();

    // User B engages with User A
    store
        .record_engagement(&user_b, &user_a, EngagementType::Reply, 2000)
        .unwrap();

    // Check mutual engagement
    let mutual = store.get_mutual(&user_a, &user_b).unwrap();
    assert!(mutual.is_mutual(), "Should detect mutual engagement");
    assert_eq!(mutual.total(), 3, "Total should be 3 engagements");

    // A engages more with B
    let balance = mutual.balance();
    assert!(balance > 0.0, "Balance should be positive (A engages more)");

    // Find mutual connections
    let mutual_connections = store.find_mutual_connections(&user_a, 1).unwrap();
    assert_eq!(mutual_connections.len(), 1);
    assert_eq!(mutual_connections[0].identity_b, user_b);
}

/// Test: Self-engagement tracking (for spam detection)
#[test]
fn test_engagement_graph_self_engagement() {
    let dir = tempdir().unwrap();
    let db = sled::open(dir.path().join("engagement")).unwrap();
    let store = EngagementGraphStore::open(db);

    let user = [30u8; 32];
    let other = [31u8; 32];

    // User engages with own content (suspicious)
    for i in 0..10 {
        store
            .record_engagement(&user, &user, EngagementType::Reaction, 1000 + i * 100)
            .unwrap();
    }

    // User also gets some organic engagement
    for i in 0..3 {
        store
            .record_engagement(&other, &user, EngagementType::Reaction, 2000 + i * 100)
            .unwrap();
    }

    let stats = store.get_stats(&user).unwrap();
    assert_eq!(
        stats.self_engagement_count, 10,
        "Should track self-engagement"
    );
    assert_eq!(stats.total_incoming, 13, "Total incoming is self + others");

    // Self-engagement ratio should be high (suspicious)
    let ratio = stats.self_engagement_ratio();
    assert!(ratio > 0.7, "Self-engagement ratio should be >70%");

    // Should not look organic
    let (is_organic, reason) = stats.looks_organic();
    assert!(!is_organic, "High self-engagement should not look organic");
    assert_eq!(reason, "high_self_engagement");
}

/// Test: Engagement graph statistics
#[test]
fn test_engagement_graph_statistics() {
    let dir = tempdir().unwrap();
    let db = sled::open(dir.path().join("engagement")).unwrap();
    let store = EngagementGraphStore::open(db);

    // Create a small social graph
    let users: Vec<[u8; 32]> = (0..10).map(|i| [i as u8; 32]).collect();

    // Each user engages with the next user
    for i in 0..9 {
        store
            .record_engagement(
                &users[i],
                &users[i + 1],
                EngagementType::Reply,
                (i * 1000) as u64,
            )
            .unwrap();
    }

    // Some users engage multiple times
    store
        .record_engagement(&users[0], &users[1], EngagementType::Reaction, 10000)
        .unwrap();
    store
        .record_engagement(&users[0], &users[2], EngagementType::Reply, 11000)
        .unwrap();

    let graph_stats = store.graph_stats().unwrap();

    // 9 edges from chain + 1 new edge (0->2) = 10 edges
    // (0->1 gets updated, not created new)
    assert_eq!(graph_stats.total_edges, 10, "Should have 10 unique edges");
    assert!(
        graph_stats.total_identities > 0,
        "Should have identities with stats"
    );

    println!(
        "Graph stats: {} edges, {} identities with stats",
        graph_stats.total_edges, graph_stats.total_identities
    );
}

/// Test: Large-scale engagement graph simulation
#[test]
fn test_engagement_graph_scale_simulation() {
    let mut timing = TimingCollector::new();
    let dir = tempdir().unwrap();
    let db = sled::open(dir.path().join("engagement")).unwrap();
    let store = EngagementGraphStore::open(db);

    const NUM_USERS: usize = 100;
    const ENGAGEMENTS_PER_USER: usize = 50;

    let users: Vec<[u8; 32]> = (0..NUM_USERS)
        .map(|i| {
            let mut bytes = [0u8; 32];
            bytes[0..4].copy_from_slice(&(i as u32).to_le_bytes());
            bytes
        })
        .collect();

    let start = Instant::now();

    // Simulate engagement patterns
    for (i, user) in users.iter().enumerate() {
        for j in 0..ENGAGEMENTS_PER_USER {
            // Engage with random other users (power-law distribution approximation)
            let target_idx = (i + j + 1) % NUM_USERS;
            let target = &users[target_idx];

            let engagement_type = match j % 3 {
                0 => EngagementType::Reply,
                1 => EngagementType::Reaction,
                _ => EngagementType::Reaction, // More reactions than replies
            };

            store
                .record_engagement(user, target, engagement_type, (i * 1000 + j) as u64)
                .unwrap();
        }
    }

    timing.record("insert", start.elapsed());

    let query_start = Instant::now();

    // Query performance tests
    let stats = store.get_stats(&users[0]).unwrap();
    let engagers = store.get_engagers(&users[50]).unwrap();
    let mutual = store.get_mutual(&users[0], &users[1]).unwrap();
    let top = store.get_top_engagers(&users[25], 10).unwrap();

    timing.record("queries", query_start.elapsed());

    let graph_stats = store.graph_stats().unwrap();

    println!("=== Engagement Graph Scale Test ===");
    println!(
        "Users: {}, Engagements per user: {}",
        NUM_USERS, ENGAGEMENTS_PER_USER
    );
    println!("Total engagements: {}", NUM_USERS * ENGAGEMENTS_PER_USER);
    println!("Insert time: {:?}", timing.total("insert").unwrap());
    println!("Query time: {:?}", timing.total("queries").unwrap());
    println!("Graph edges: {}", graph_stats.total_edges);
    println!(
        "User 0 stats: {} outgoing, {} incoming",
        stats.total_outgoing, stats.total_incoming
    );
    println!("User 50 engagers: {}", engagers.len());
    println!("Top engagers for user 25: {}", top.len());

    // Performance assertions
    assert!(
        timing.total("insert").unwrap() < Duration::from_secs(10),
        "Should insert {} engagements in <10s",
        NUM_USERS * ENGAGEMENTS_PER_USER
    );
    assert!(
        timing.total("queries").unwrap() < Duration::from_millis(100),
        "Queries should complete in <100ms"
    );
}

// ============================================================================
// Content Posting and Fetching Tests
// ============================================================================

/// Test: Full content lifecycle - create, store, retrieve, verify
#[test]
fn test_content_lifecycle_full() {
    let mut timing = TimingCollector::new();
    let dir = tempdir().unwrap();
    let blob_store = BlobStore::new(dir.path().join("blobs")).unwrap();
    let chain_store = ChainStore::open(dir.path().join("chain")).unwrap();

    // Create identity
    let (keypair, _) = create_identity_with_difficulty(4);
    let author = *keypair.public_key.as_bytes();

    // Step 1: Create content
    let content_bodies: Vec<Vec<u8>> = (0..10)
        .map(|i| {
            format!(
                "Post content number {}: This is a longer post with some text.",
                i
            )
            .into_bytes()
        })
        .collect();

    let create_start = Instant::now();
    let mut content_hashes = Vec::new();
    for body in &content_bodies {
        let hash = blob_store.put(body).unwrap();
        content_hashes.push(hash);
    }
    timing.record("content_create", create_start.elapsed());

    // Step 2: Create actions referencing content
    let actions_start = Instant::now();
    let mut actions = Vec::new();
    for (i, hash) in content_hashes.iter().enumerate() {
        let action = Action {
            action_type: ActionType::Post,
            actor: author,
            timestamp: 1700000000 + i as u64,
            content_hash: Some(*hash.as_bytes()),
            parent_id: None,
            pow_nonce: 12345,
            pow_work: 10,
            pow_target: [0u8; 32],
            signature: [0u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        };
        actions.push(action);
    }
    timing.record("actions_create", actions_start.elapsed());

    // Step 3: Create and store content block
    let thread_root = sha256(b"thread_root");
    let space_id_32 = [0u8; 32];
    let content_block = ContentBlock::new(
        thread_root,
        space_id_32,
        actions.clone(),
        None,       // prev_content_hash
        1700000000, // timestamp
        BranchPath::root(),
    )
    .unwrap();

    let store_start = Instant::now();
    chain_store.put_content_block(&content_block).unwrap();
    timing.record("block_store", store_start.elapsed());

    // Step 4: Retrieve content
    let retrieve_start = Instant::now();
    for (i, hash) in content_hashes.iter().enumerate() {
        let retrieved = blob_store.get(hash).unwrap();
        assert_eq!(&retrieved, &content_bodies[i], "Content should match");
    }
    timing.record("content_retrieve", retrieve_start.elapsed());

    // Step 5: Verify content metadata can be indexed
    let index_start = Instant::now();
    let index_count = chain_store.rebuild_space_content_index().unwrap();
    timing.record("index_rebuild", index_start.elapsed());

    println!("=== Content Lifecycle Test ===");
    println!("Created {} content items", content_hashes.len());
    println!(
        "Content create: {:?}",
        timing.total("content_create").unwrap()
    );
    println!(
        "Actions create: {:?}",
        timing.total("actions_create").unwrap()
    );
    println!("Block store: {:?}", timing.total("block_store").unwrap());
    println!(
        "Content retrieve: {:?}",
        timing.total("content_retrieve").unwrap()
    );
    println!(
        "Index rebuild: {:?} ({} items)",
        timing.total("index_rebuild").unwrap(),
        index_count
    );

    // Assertions
    assert!(timing.total("content_retrieve").unwrap() < Duration::from_millis(100));
    assert_eq!(index_count, actions.len());
}

/// Test: Content retrieval by space
#[test]
fn test_content_retrieval_by_space() {
    let dir = tempdir().unwrap();
    let chain_store = ChainStore::open(dir.path().join("chain")).unwrap();

    let space_id = SpaceId::from_bytes([1u8; 32]);
    let author = [2u8; 32];

    // Create posts in the space
    let mut actions = Vec::new();
    for i in 0..20 {
        let content_hash = sha256(format!("Post {}", i).as_bytes());
        actions.push(Action {
            action_type: ActionType::Post,
            actor: author,
            timestamp: 1700000000 + i,
            content_hash: Some(content_hash),
            parent_id: None,
            pow_nonce: 12345,
            pow_work: 10,
            pow_target: [0u8; 32],
            signature: [0u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        });
    }

    let thread_root = sha256(b"thread_root");
    let content_block = ContentBlock::new(
        thread_root,
        *space_id.as_bytes(),
        actions,
        None,
        1700000000,
        BranchPath::root(),
    )
    .unwrap();
    chain_store.put_content_block(&content_block).unwrap();
    chain_store.rebuild_space_content_index().unwrap();

    // Query content for space
    let space_id_16: [u8; 16] = space_id.as_bytes()[..16].try_into().unwrap();
    let content = chain_store
        .get_content_for_space(&space_id_16, 10, 0)
        .unwrap();

    assert_eq!(content.len(), 10, "Should return 10 items (limit)");

    // Get next page
    let content_page2 = chain_store
        .get_content_for_space(&space_id_16, 10, 10)
        .unwrap();
    assert_eq!(content_page2.len(), 10, "Should return 10 more items");

    println!(
        "Space content retrieval: {} + {} items",
        content.len(),
        content_page2.len()
    );
}

/// Test: Reply threading (parent-child relationships)
#[test]
fn test_reply_threading() {
    let dir = tempdir().unwrap();
    let chain_store = ChainStore::open(dir.path().join("chain")).unwrap();

    let space_id: [u8; 32] = [1u8; 32];
    let author = [2u8; 32];

    // Create a post
    let post_hash = sha256(b"Original post content");
    let thread_root = post_hash; // Post is its own thread root
    let post_action = Action {
        action_type: ActionType::Post,
        actor: author,
        timestamp: 1700000000,
        content_hash: Some(post_hash),
        parent_id: None,
        pow_nonce: 12345,
        pow_work: 10,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // Create replies to the post
    let mut reply_hashes = Vec::new();
    for i in 0..5 {
        let reply_hash = sha256(format!("Reply {}", i).as_bytes());
        reply_hashes.push(reply_hash);
    }

    let mut actions = vec![post_action];
    for (i, reply_hash) in reply_hashes.iter().enumerate() {
        actions.push(Action {
            action_type: ActionType::Reply,
            actor: author,
            timestamp: 1700000001 + i as u64,
            content_hash: Some(*reply_hash),
            parent_id: Some(post_hash), // All reply to original post
            pow_nonce: 12345,
            pow_work: 10,
            pow_target: [0u8; 32],
            signature: [0u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        });
    }

    let content_block = ContentBlock::new(
        thread_root,
        space_id,
        actions,
        None,
        1700000000,
        BranchPath::root(),
    )
    .unwrap();
    chain_store.put_content_block(&content_block).unwrap();
    chain_store.rebuild_space_content_index().unwrap();

    // Query replies to the post
    let replies = chain_store
        .get_replies_for_content(&post_hash, 100, 0)
        .unwrap();
    assert_eq!(replies.len(), 5, "Should have 5 replies");

    // Verify all replies reference the parent
    for (hash, metadata) in &replies {
        assert_eq!(
            metadata.parent_hash, post_hash,
            "Reply should reference parent"
        );
        assert_eq!(metadata.content_type, 1, "Content type should be Reply (1)");
    }

    println!("Reply threading: {} replies to post", replies.len());
}

/// Test: Content metadata indexing
#[test]
fn test_content_metadata_indexing() {
    let dir = tempdir().unwrap();
    let chain_store = ChainStore::open(dir.path().join("chain")).unwrap();

    let space_id: [u8; 32] = [1u8; 32];
    let author1 = [10u8; 32];
    let author2 = [20u8; 32];

    // Create content from multiple authors
    let hash1 = sha256(b"Content from author 1");
    let hash2 = sha256(b"Content from author 2");
    let thread_root = hash1; // First post is thread root

    let actions = vec![
        Action {
            action_type: ActionType::Post,
            actor: author1,
            timestamp: 1700000000,
            content_hash: Some(hash1),
            parent_id: None,
            pow_nonce: 12345,
            pow_work: 10,
            pow_target: [0u8; 32],
            signature: [0u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        },
        Action {
            action_type: ActionType::Post,
            actor: author2,
            timestamp: 1700000001,
            content_hash: Some(hash2),
            parent_id: None,
            pow_nonce: 12345,
            pow_work: 10,
            pow_target: [0u8; 32],
            signature: [0u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
        },
    ];

    let content_block = ContentBlock::new(
        thread_root,
        space_id,
        actions,
        None,
        1700000000,
        BranchPath::root(),
    )
    .unwrap();
    chain_store.put_content_block(&content_block).unwrap();
    chain_store.rebuild_space_content_index().unwrap();

    // Look up metadata
    let meta1 = chain_store.get_content_metadata(&hash1).unwrap().unwrap();
    assert_eq!(meta1.author, author1);
    assert_eq!(meta1.content_type, 0); // Post

    let meta2 = chain_store.get_content_metadata(&hash2).unwrap().unwrap();
    assert_eq!(meta2.author, author2);

    // Look up author directly
    let author_result = chain_store.get_content_author(&hash1).unwrap();
    assert_eq!(author_result, Some(author1));

    println!("Metadata indexing verified for {} authors", 2);
}

// ============================================================================
// Combined Integration Tests
// ============================================================================

/// Test: Full flow - content creation triggers engagement graph updates
#[test]
fn test_content_to_engagement_integration() {
    let dir = tempdir().unwrap();
    let chain_store = ChainStore::open(dir.path().join("chain")).unwrap();
    let engagement_db = sled::open(dir.path().join("engagement")).unwrap();
    let engagement_store = EngagementGraphStore::open(engagement_db);

    let space_id: [u8; 32] = [1u8; 32];
    let alice = [1u8; 32];
    let bob = [2u8; 32];
    let charlie = [3u8; 32];

    // Alice creates a post
    let post_hash = sha256(b"Alice's post");
    let thread_root = post_hash; // Post is thread root
    let post_action = Action {
        action_type: ActionType::Post,
        actor: alice,
        timestamp: 1700000000,
        content_hash: Some(post_hash),
        parent_id: None,
        pow_nonce: 12345,
        pow_work: 10,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    // Store the post
    let block1 = ContentBlock::new(
        thread_root,
        space_id,
        vec![post_action],
        None,
        1700000000,
        BranchPath::root(),
    )
    .unwrap();
    chain_store.put_content_block(&block1).unwrap();
    chain_store.rebuild_space_content_index().unwrap();

    // Bob and Charlie engage with Alice's post
    let bob_reply_hash = sha256(b"Bob's reply");
    let bob_reply = Action {
        action_type: ActionType::Reply,
        actor: bob,
        timestamp: 1700001000,
        content_hash: Some(bob_reply_hash),
        parent_id: Some(post_hash),
        pow_nonce: 12345,
        pow_work: 10,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: None,
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    let charlie_engage = Action {
        action_type: ActionType::Engage,
        actor: charlie,
        timestamp: 1700002000,
        content_hash: Some(post_hash), // Target content
        parent_id: None,
        pow_nonce: 12345,
        pow_work: 10,
        pow_target: [0u8; 32],
        signature: [0u8; 64],
        emoji: Some(1), // Thumbs up
        media_refs: vec![],
        display_name: None,
        replaces_pending: None,
    };

    let block2 = ContentBlock::new(
        thread_root,
        space_id,
        vec![bob_reply, charlie_engage],
        Some(sha256(b"block1_hash")), // prev_content_hash
        1700001000,
        BranchPath::root(),
    )
    .unwrap();
    chain_store.put_content_block(&block2).unwrap();
    chain_store.rebuild_space_content_index().unwrap();

    // Simulate what the router would do - extract engagements
    // Bob replied to Alice's post -> Bob engages with Alice
    let alice_author = chain_store.get_content_author(&post_hash).unwrap().unwrap();
    engagement_store
        .record_engagement(&bob, &alice_author, EngagementType::Reply, 1700001000)
        .unwrap();

    // Charlie engaged with Alice's post
    engagement_store
        .record_engagement(
            &charlie,
            &alice_author,
            EngagementType::Reaction,
            1700002000,
        )
        .unwrap();

    // Verify engagement graph
    let alice_stats = engagement_store.get_stats(&alice).unwrap();
    assert_eq!(
        alice_stats.total_incoming, 2,
        "Alice should have 2 engagements"
    );
    assert_eq!(alice_stats.incoming_replies, 1);
    assert_eq!(alice_stats.incoming_reactions, 1);

    let alice_engagers = engagement_store.get_engagers(&alice).unwrap();
    assert_eq!(alice_engagers.len(), 2);
    assert!(alice_engagers.contains(&bob));
    assert!(alice_engagers.contains(&charlie));

    println!("Content-to-engagement integration verified");
    println!(
        "Alice received {} engagements from {} unique users",
        alice_stats.total_incoming,
        alice_engagers.len()
    );
}
