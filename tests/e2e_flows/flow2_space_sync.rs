//! Flow 2: Space Joining and Content Sync
//!
//! Tests the flow of a new user joining a space and syncing content:
//!
//! 1. Seeders have pre-populated content in a space
//! 2. Joiner discovers the space and connects
//! 3. Joiner syncs content from seeders
//! 4. Joiner can retrieve and verify all content
//!
//! Per SPEC_06 (Network Sync) and SPEC_07 (Content Distribution)

use std::time::{Duration, Instant};
use tempfile::tempdir;

use std::collections::HashSet;
use swimchain::identity::create_identity_with_difficulty;
use swimchain::storage::{BlobStore, ContentBlobHash};
use swimchain::types::content::SpaceId;

use super::timing::TimingCollector;

/// Test: Basic content sync between two nodes
#[test]
fn test_flow2_basic_content_sync() {
    let mut timing = TimingCollector::new();

    // Create two nodes
    let seeder_dir = tempdir().unwrap();
    let joiner_dir = tempdir().unwrap();

    let seeder_store = BlobStore::new(seeder_dir.path().join("blobs")).unwrap();
    let joiner_store = BlobStore::new(joiner_dir.path().join("blobs")).unwrap();

    let mut seeder_seen: HashSet<[u8; 32]> = HashSet::new();
    let mut joiner_seen: HashSet<[u8; 32]> = HashSet::new();

    // Space ID for testing
    let _space_id = SpaceId::from_bytes([1u8; 32]);

    // Step 1: Seeder creates 10 posts in the space
    let populate_start = Instant::now();
    let mut content_hashes = Vec::new();

    for i in 0..10 {
        let content = format!("Test post number {} in space", i);
        let hash = seeder_store.put(content.as_bytes()).unwrap();
        seeder_seen.insert(*hash.as_bytes());
        content_hashes.push((hash, content.into_bytes()));
    }
    timing.record("seeder_populate", populate_start.elapsed());

    // Step 2: Joiner syncs content (simulated WHO_HAS/I_HAVE/GET/DATA)
    let sync_start = Instant::now();

    for (hash, expected_content) in &content_hashes {
        // Joiner checks if they have content (they don't)
        assert!(!joiner_seen.contains(hash.as_bytes()));

        // Joiner "asks" seeder (WHO_HAS simulation)
        assert!(
            seeder_seen.contains(hash.as_bytes()),
            "Seeder should have content"
        );

        // Seeder sends data (GET/DATA simulation)
        let content = seeder_store.get(hash).unwrap();
        assert_eq!(&content, expected_content);

        // Joiner stores and marks as received
        joiner_store.put_with_hash(&content, hash).unwrap();
        joiner_seen.insert(*hash.as_bytes());
    }
    timing.record("sync_complete", sync_start.elapsed());

    // Step 3: Verify joiner has all content
    let verify_start = Instant::now();
    for (hash, expected_content) in &content_hashes {
        assert!(
            joiner_seen.contains(hash.as_bytes()),
            "Joiner should have content"
        );
        let content = joiner_store.get(hash).unwrap();
        assert_eq!(&content, expected_content, "Content should match");
    }
    timing.record("verification", verify_start.elapsed());

    // Timing assertions: Total sync should be <5s for 10 posts
    let total_sync = timing.total("sync_complete").unwrap();
    assert!(
        total_sync < Duration::from_secs(5),
        "Sync should be <5s, was {:?}",
        total_sync
    );

    println!(
        "Flow 2a - Basic Content Sync Summary:\n{}",
        timing.summary()
    );
}

/// Test: Content sync with multiple seeders
#[test]
fn test_flow2_multi_seeder_sync() {
    let mut timing = TimingCollector::new();

    // Create two seeders and one joiner
    let seeder1_dir = tempdir().unwrap();
    let seeder2_dir = tempdir().unwrap();
    let joiner_dir = tempdir().unwrap();

    let seeder1_store = BlobStore::new(seeder1_dir.path().join("blobs")).unwrap();
    let seeder2_store = BlobStore::new(seeder2_dir.path().join("blobs")).unwrap();
    let joiner_store = BlobStore::new(joiner_dir.path().join("blobs")).unwrap();

    let mut seeder1_seen: HashSet<[u8; 32]> = HashSet::new();
    let mut seeder2_seen: HashSet<[u8; 32]> = HashSet::new();
    let mut joiner_seen: HashSet<[u8; 32]> = HashSet::new();

    // Step 1: Both seeders have overlapping content
    let populate_start = Instant::now();
    let mut content_hashes = Vec::new();

    // Seeder 1 has posts 0-7
    for i in 0..8 {
        let content = format!("Post {} from seeder 1", i);
        let hash = seeder1_store.put(content.as_bytes()).unwrap();
        seeder1_seen.insert(*hash.as_bytes());
        content_hashes.push((hash, content.into_bytes(), 1));
    }

    // Seeder 2 has posts 4-9 (overlapping with seeder 1 on 4-7)
    for i in 4..10 {
        let content = format!("Post {} from seeder 2", i);
        let hash = ContentBlobHash::compute(content.as_bytes());

        // For posts 4-7, seeder 2 already has them (marked as seen)
        if i < 8 {
            // Already exists, just mark as seen
            seeder2_seen.insert(*hash.as_bytes());
        } else {
            // New posts 8-9 only from seeder 2
            let hash = seeder2_store.put(content.as_bytes()).unwrap();
            seeder2_seen.insert(*hash.as_bytes());
            content_hashes.push((hash, content.into_bytes(), 2));
        }
    }
    timing.record("populate_seeders", populate_start.elapsed());

    // Step 2: Joiner syncs from both seeders
    let sync_start = Instant::now();

    for (hash, _expected_content, _from_seeder) in &content_hashes {
        // Try seeder 1 first
        let content = if seeder1_store.exists(hash) {
            Some(seeder1_store.get(hash).unwrap())
        } else if seeder2_store.exists(hash) {
            Some(seeder2_store.get(hash).unwrap())
        } else {
            None
        };

        if let Some(content) = content {
            joiner_store.put_with_hash(&content, hash).unwrap();
            joiner_seen.insert(*hash.as_bytes());
        }
    }
    timing.record("sync_from_seeders", sync_start.elapsed());

    // Step 3: Verify joiner has all unique content
    let verify_start = Instant::now();
    for (hash, expected_content, _) in &content_hashes {
        assert!(joiner_store.exists(hash), "Joiner should have content");
        let content = joiner_store.get(hash).unwrap();
        assert_eq!(&content, expected_content);
    }
    timing.record("verification", verify_start.elapsed());

    println!("Flow 2b - Multi-Seeder Sync Summary:\n{}", timing.summary());
}

/// Test: Sync with verification of content integrity
#[test]
fn test_flow2_sync_with_integrity() {
    let mut timing = TimingCollector::new();

    let seeder_dir = tempdir().unwrap();
    let joiner_dir = tempdir().unwrap();

    let seeder_store = BlobStore::new(seeder_dir.path().join("blobs")).unwrap();
    let joiner_store = BlobStore::new(joiner_dir.path().join("blobs")).unwrap();

    // Create identity for signing
    let (seeder_keypair, _) = create_identity_with_difficulty(4);

    // Step 1: Seeder creates signed content
    let create_start = Instant::now();

    let mut content_entries = Vec::new();
    for i in 0..5 {
        let content = format!("Signed post {} for integrity test", i);
        let content_bytes = content.as_bytes();
        let hash = seeder_store.put(content_bytes).unwrap();

        // Sign the content hash
        let signature = swimchain::identity::sign(&seeder_keypair.private_key, hash.as_bytes());

        content_entries.push((hash, content_bytes.to_vec(), signature));
    }
    timing.record("create_signed_content", create_start.elapsed());

    // Step 2: Joiner syncs and verifies signatures
    let sync_start = Instant::now();

    for (hash, _expected_content, signature) in &content_entries {
        // Transfer content
        let content = seeder_store.get(hash).unwrap();
        joiner_store.put_with_hash(&content, hash).unwrap();

        // Verify hash matches (integrity)
        let computed_hash = ContentBlobHash::compute(&content);
        assert_eq!(&computed_hash, hash, "Hash mismatch - content corrupted");

        // Verify signature (authenticity)
        let sig_valid =
            swimchain::identity::verify(&seeder_keypair.public_key, hash.as_bytes(), signature);
        assert!(sig_valid, "Signature verification failed");
    }
    timing.record("sync_and_verify", sync_start.elapsed());

    println!(
        "Flow 2c - Sync with Integrity Summary:\n{}",
        timing.summary()
    );
}

/// Test: Complete space sync flow
#[test]
fn test_flow2_complete_space_sync() {
    let mut timing = TimingCollector::new();
    let flow_start = Instant::now();

    // === Setup: Create nodes ===
    let seeder1_dir = tempdir().unwrap();
    let seeder2_dir = tempdir().unwrap();
    let joiner_dir = tempdir().unwrap();

    let seeder1_store = BlobStore::new(seeder1_dir.path().join("blobs")).unwrap();
    let seeder2_store = BlobStore::new(seeder2_dir.path().join("blobs")).unwrap();
    let joiner_store = BlobStore::new(joiner_dir.path().join("blobs")).unwrap();

    let mut seeder1_seen: HashSet<[u8; 32]> = HashSet::new();
    let mut seeder2_seen: HashSet<[u8; 32]> = HashSet::new();
    let mut joiner_seen: HashSet<[u8; 32]> = HashSet::new();

    // Create identities
    let (seeder1_keypair, _) = create_identity_with_difficulty(4);
    let (seeder2_keypair, _) = create_identity_with_difficulty(4);

    let space_id = SpaceId::from_bytes([42u8; 32]);

    // === Phase 1: Seeders populate space with 10 posts ===
    let populate_start = Instant::now();

    struct PostEntry {
        hash: ContentBlobHash,
        content: Vec<u8>,
        signature: swimchain::types::identity::Signature,
        author_pubkey: swimchain::types::identity::PublicKey,
    }

    let mut all_posts: Vec<PostEntry> = Vec::new();

    // Seeder 1 creates 5 posts
    for i in 0..5 {
        let content = format!("Seeder 1 post {} in space {:?}", i, space_id);
        let content_bytes = content.into_bytes();
        let hash = seeder1_store.put(&content_bytes).unwrap();
        let signature = swimchain::identity::sign(&seeder1_keypair.private_key, hash.as_bytes());
        seeder1_seen.insert(*hash.as_bytes());

        all_posts.push(PostEntry {
            hash,
            content: content_bytes,
            signature,
            author_pubkey: seeder1_keypair.public_key.clone(),
        });
    }

    // Seeder 2 creates 5 posts
    for i in 0..5 {
        let content = format!("Seeder 2 post {} in space {:?}", i, space_id);
        let content_bytes = content.into_bytes();
        let hash = seeder2_store.put(&content_bytes).unwrap();
        let signature = swimchain::identity::sign(&seeder2_keypair.private_key, hash.as_bytes());
        seeder2_seen.insert(*hash.as_bytes());

        all_posts.push(PostEntry {
            hash,
            content: content_bytes,
            signature,
            author_pubkey: seeder2_keypair.public_key.clone(),
        });
    }
    timing.record("populate_space", populate_start.elapsed());

    assert_eq!(all_posts.len(), 10, "Should have 10 posts");

    // === Phase 2: Joiner discovers and syncs ===
    let sync_start = Instant::now();

    for post in &all_posts {
        // Joiner doesn't have content yet
        assert!(!joiner_seen.contains(post.hash.as_bytes()));

        // Simulate WHO_HAS: Check which seeder has it
        let has_seeder1 = seeder1_seen.contains(post.hash.as_bytes());
        let has_seeder2 = seeder2_seen.contains(post.hash.as_bytes());

        // Get from whichever seeder has it
        let content = if has_seeder1 && seeder1_store.exists(&post.hash) {
            seeder1_store.get(&post.hash).unwrap()
        } else if has_seeder2 && seeder2_store.exists(&post.hash) {
            seeder2_store.get(&post.hash).unwrap()
        } else {
            panic!("No seeder has content {:?}", post.hash);
        };

        // Store and mark as received
        joiner_store.put_with_hash(&content, &post.hash).unwrap();
        joiner_seen.insert(*post.hash.as_bytes());
    }
    timing.record("sync_all_content", sync_start.elapsed());

    // === Phase 3: Verify all content ===
    let verify_start = Instant::now();

    for post in &all_posts {
        // Verify joiner has content
        assert!(joiner_seen.contains(post.hash.as_bytes()));
        assert!(joiner_store.exists(&post.hash));

        // Verify content integrity
        let content = joiner_store.get(&post.hash).unwrap();
        assert_eq!(content, post.content, "Content mismatch");

        // Verify hash
        let computed = ContentBlobHash::compute(&content);
        assert_eq!(computed, post.hash, "Hash mismatch");

        // Verify signature
        let sig_valid =
            swimchain::identity::verify(&post.author_pubkey, post.hash.as_bytes(), &post.signature);
        assert!(sig_valid, "Signature verification failed");
    }
    timing.record("verify_all_content", verify_start.elapsed());

    timing.record("total_flow", flow_start.elapsed());

    // === Assertions ===
    // Total sync should be <5s for 10 posts
    timing.assert_under("total_flow", Duration::from_secs(5));

    println!("\n=== Flow 2 Complete Space Sync Summary ===");
    println!("{}", timing.summary());
    println!("✓ 10 posts created across 2 seeders");
    println!("✓ Joiner synced all content");
    println!("✓ All content integrity verified");
    println!("✓ All signatures verified");
    println!("✓ Timing requirements met");
}
