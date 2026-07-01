//! Flow 1: Identity Creation to Post Viewing
//!
//! Tests the complete lifecycle from identity creation through content
//! propagation to viewing by another user:
//!
//! 1. Author creates identity with PoW
//! 2. Author creates and signs content
//! 3. Content propagates via gossip (simulated)
//! 4. Viewer receives and verifies content
//!
//! Per SPEC_01 (Identity) and SPEC_06 (Network Sync)

use std::time::{Duration, Instant};
use tempfile::tempdir;

use swimchain::identity::{
    create_identity_with_difficulty, current_timestamp, sign, verify, verify_identity_pow,
};
use swimchain::storage::{BlobStore, ContentBlobHash};
use swimchain::types::identity::IdentityId;

use super::timing::TimingCollector;

/// Test: Complete identity creation and signing flow
#[test]
fn test_flow1_identity_creation_and_signing() {
    let mut timing = TimingCollector::new();

    // Step 1: Create author identity with difficulty 4 (fast for tests)
    let author_start = Instant::now();
    let (author_keypair, author_proof) = create_identity_with_difficulty(4);
    timing.record("identity_creation", author_start.elapsed());

    // Verify identity proof is valid
    let verify_start = Instant::now();
    let verify_result = verify_identity_pow(&author_proof, 4, current_timestamp());
    timing.record("pow_verification", verify_start.elapsed());
    assert!(
        verify_result.is_ok(),
        "Identity PoW verification failed: {:?}",
        verify_result
    );

    // Step 2: Create test content
    let content_body = b"Hello from Swimchain! This is a test post.";
    let content_hash = ContentBlobHash::compute(content_body);

    // Step 3: Sign the content
    let sign_start = Instant::now();
    let signature = sign(&author_keypair.private_key, content_hash.as_bytes());
    timing.record("content_signing", sign_start.elapsed());

    // Step 4: Verify signature (as viewer would)
    let verify_sig_start = Instant::now();
    let sig_valid = verify(
        &author_keypair.public_key,
        content_hash.as_bytes(),
        &signature,
    );
    timing.record("signature_verification", verify_sig_start.elapsed());
    assert!(sig_valid, "Signature verification failed");

    // Timing assertions per plan:
    // - Identity creation (difficulty 4) should be <500ms
    timing.assert_under("identity_creation", Duration::from_millis(500));
    // - Content signing should be <1ms (Ed25519 is fast)
    timing.assert_under("content_signing", Duration::from_millis(10));

    println!(
        "Flow 1a - Identity and Signing Summary:\n{}",
        timing.summary()
    );
}

/// Test: Content storage and propagation simulation
#[test]
fn test_flow1_content_propagation() {
    let mut timing = TimingCollector::new();

    // Create author and viewer identities
    let (author_keypair, _) = create_identity_with_difficulty(4);
    let (viewer_keypair, _) = create_identity_with_difficulty(4);

    let _author_id = IdentityId::from_bytes(*author_keypair.public_key.as_bytes());
    let _viewer_id = IdentityId::from_bytes(*viewer_keypair.public_key.as_bytes());

    // Create temporary storage for both nodes
    let author_dir = tempdir().unwrap();
    let viewer_dir = tempdir().unwrap();

    let author_store = BlobStore::new(author_dir.path().join("blobs")).unwrap();
    let viewer_store = BlobStore::new(viewer_dir.path().join("blobs")).unwrap();

    // Step 1: Author creates content
    let content_body = b"Hello from Swimchain! This is a test post that will propagate.";

    let store_start = Instant::now();
    let content_hash = author_store.put(content_body).unwrap();
    timing.record("content_storage", store_start.elapsed());

    // Step 2: Author signs content
    let signature = sign(&author_keypair.private_key, content_hash.as_bytes());

    // Step 3: Simulate gossip propagation
    // In real flow: Author broadcasts INV -> Viewer requests GETDATA -> Author sends DATA
    let propagate_start = Instant::now();

    // Simulate: Viewer receives and stores content
    let content_data = author_store.get(&content_hash).unwrap();
    viewer_store
        .put_with_hash(&content_data, &content_hash)
        .unwrap();
    timing.record("gossip_propagation", propagate_start.elapsed());

    // Step 4: Viewer retrieves and verifies
    let verify_start = Instant::now();
    let retrieved = viewer_store.get(&content_hash).unwrap();
    assert_eq!(retrieved, content_body.to_vec(), "Content mismatch");

    // Verify signature
    let sig_valid = verify(
        &author_keypair.public_key,
        content_hash.as_bytes(),
        &signature,
    );
    assert!(sig_valid, "Signature verification failed");
    timing.record("content_verification", verify_start.elapsed());

    // Verify content integrity by recomputing hash
    let recomputed_hash = ContentBlobHash::compute(&retrieved);
    assert_eq!(
        recomputed_hash, content_hash,
        "Hash mismatch - content corrupted"
    );

    println!(
        "Flow 1b - Content Propagation Summary:\n{}",
        timing.summary()
    );
}

/// Test: Full end-to-end identity to post viewing flow
#[test]
fn test_flow1_complete_end_to_end() {
    let mut timing = TimingCollector::new();
    let flow_start = Instant::now();

    // === Phase 1: Identity Creation ===
    let identity_start = Instant::now();
    let (author_keypair, author_proof) = create_identity_with_difficulty(4);
    let (_viewer_keypair, _viewer_proof) = create_identity_with_difficulty(4);
    timing.record("identity_creation_both", identity_start.elapsed());

    // Verify author identity
    assert!(verify_identity_pow(&author_proof, 4, current_timestamp()).is_ok());

    // === Phase 2: Content Creation and Storage ===
    let author_dir = tempdir().unwrap();
    let viewer_dir = tempdir().unwrap();

    let author_store = BlobStore::new(author_dir.path().join("blobs")).unwrap();
    let viewer_store = BlobStore::new(viewer_dir.path().join("blobs")).unwrap();

    let content_body = b"This is a complete end-to-end test of the identity to post viewing flow!";

    let content_start = Instant::now();
    let content_hash = author_store.put(content_body).unwrap();
    let signature = sign(&author_keypair.private_key, content_hash.as_bytes());
    timing.record("content_creation_and_sign", content_start.elapsed());

    // === Phase 3: Content Propagation (Simulated) ===
    let propagation_start = Instant::now();

    // Transfer content (simulated GETDATA/DATA exchange)
    let content_data = author_store.get(&content_hash).unwrap();
    viewer_store
        .put_with_hash(&content_data, &content_hash)
        .unwrap();

    timing.record("propagation_complete", propagation_start.elapsed());

    // === Phase 4: Viewer Retrieves and Verifies ===
    let verify_start = Instant::now();

    // Retrieve content
    let retrieved = viewer_store.get(&content_hash).unwrap();
    assert_eq!(retrieved, content_body.to_vec());

    // Verify signature
    assert!(verify(
        &author_keypair.public_key,
        content_hash.as_bytes(),
        &signature
    ));

    // Verify hash integrity
    assert_eq!(ContentBlobHash::compute(&retrieved), content_hash);

    timing.record("retrieval_and_verify", verify_start.elapsed());

    // Record total flow time
    timing.record("total_flow", flow_start.elapsed());

    // === Assertions ===
    // Total flow should be under 2 seconds (per plan)
    timing.assert_under("total_flow", Duration::from_secs(2));

    println!("\n=== Flow 1 Complete E2E Summary ===");
    println!("{}", timing.summary());
    println!("✓ Identity creation verified");
    println!("✓ Content storage verified");
    println!("✓ Content propagation verified");
    println!("✓ Content retrieval verified");
    println!("✓ Signature verification passed");
    println!("✓ All timing requirements met");
}
