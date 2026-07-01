//! Flow 3: Media Upload and Retrieval
//!
//! Tests the chunked media upload and parallel fetch flow:
//!
//! 1. Uploader chunks a large file (>1MB)
//! 2. Uploader stores manifest and chunks
//! 3. Fetcher discovers content via manifest hash
//! 4. Fetcher downloads chunks (simulated parallel)
//! 5. Fetcher reassembles and verifies integrity
//!
//! Per SPEC_07 (Content Distribution) - 1MB chunk size

use std::time::{Duration, Instant};
use tempfile::tempdir;

use std::collections::HashSet;
use swimchain::content::chunking::{chunk_data, ChunkedContentStore, ChunkingError, Manifest};
use swimchain::storage::{BlobStore, ContentBlobHash, CHUNK_SIZE};

use super::timing::TimingCollector;

/// Test: Basic chunking of 3MB file
#[test]
fn test_flow3_basic_chunking() {
    let mut timing = TimingCollector::new();

    // Create 3MB test data with unique content per chunk
    // Use different starting offsets for each MB to ensure unique chunks
    let data_size = 3 * 1024 * 1024; // 3MB
    let test_data: Vec<u8> = (0..data_size)
        .map(|i| {
            // Include the chunk index in the pattern to ensure uniqueness
            let chunk_idx = i / (1024 * 1024);
            ((i + chunk_idx * 7) % 256) as u8
        })
        .collect();

    // Chunk the data
    let chunk_start = Instant::now();
    let (manifest, chunks) = chunk_data(&test_data).unwrap();
    timing.record("chunking", chunk_start.elapsed());

    // Verify chunk structure
    assert_eq!(manifest.version, 1, "Manifest version should be 1");
    assert_eq!(manifest.total_size, data_size as u64);
    assert_eq!(manifest.chunk_size, CHUNK_SIZE as u32);
    assert_eq!(chunks.len(), 3, "3MB should produce 3 chunks");

    // Verify first two chunks are full size, last may be smaller
    assert_eq!(chunks[0].0.size, CHUNK_SIZE as u32);
    assert_eq!(chunks[1].0.size, CHUNK_SIZE as u32);
    assert_eq!(chunks[2].0.size, CHUNK_SIZE as u32);

    // Verify each chunk has unique hash
    let hashes: Vec<_> = chunks.iter().map(|(info, _)| info.hash).collect();
    for i in 0..hashes.len() {
        for j in (i + 1)..hashes.len() {
            assert_ne!(hashes[i], hashes[j], "Chunk hashes should be unique");
        }
    }

    // Verify manifest validation
    manifest.validate().unwrap();

    println!("Flow 3a - Basic Chunking Summary:\n{}", timing.summary());
}

/// Test: Store and reassemble chunked content
#[test]
fn test_flow3_store_and_reassemble() {
    let mut timing = TimingCollector::new();

    let dir = tempdir().unwrap();
    let store = ChunkedContentStore::at_path(dir.path().join("chunks")).unwrap();

    // Create 3MB test data
    let data_size = 3 * 1024 * 1024;
    let test_data: Vec<u8> = (0..data_size).map(|i| (i % 256) as u8).collect();

    // Store chunked content
    let store_start = Instant::now();
    let reference = store.store(&test_data).unwrap();
    timing.record("store_chunked", store_start.elapsed());

    assert_eq!(reference.total_size, data_size as u64);
    assert_eq!(reference.chunk_count, 3);

    // Reassemble
    let reassemble_start = Instant::now();
    let reassembled = store.reassemble(&reference.manifest_hash).unwrap();
    timing.record("reassemble", reassemble_start.elapsed());

    // Verify integrity
    assert_eq!(reassembled.len(), test_data.len(), "Size mismatch");
    assert_eq!(reassembled, test_data, "Content mismatch after reassembly");

    // Timing check: chunking + reassembly for 3MB should be fast
    let total = timing.total("store_chunked").unwrap() + timing.total("reassemble").unwrap();
    assert!(
        total < Duration::from_millis(500),
        "Store + reassemble should be <500ms for 3MB, was {:?}",
        total
    );

    println!(
        "Flow 3b - Store and Reassemble Summary:\n{}",
        timing.summary()
    );
}

/// Test: Chunk transfer between uploader and fetcher
#[test]
fn test_flow3_chunk_transfer() {
    let mut timing = TimingCollector::new();

    let uploader_dir = tempdir().unwrap();
    let fetcher_dir = tempdir().unwrap();

    let uploader_store = ChunkedContentStore::at_path(uploader_dir.path().join("chunks")).unwrap();
    let fetcher_blob_store = BlobStore::new(fetcher_dir.path().join("blobs")).unwrap();

    // Step 1: Uploader creates chunked content
    let data_size = 3 * 1024 * 1024;
    let test_data: Vec<u8> = (0..data_size).map(|i| (i % 256) as u8).collect();

    let upload_start = Instant::now();
    let reference = uploader_store.store(&test_data).unwrap();
    timing.record("upload", upload_start.elapsed());

    // Load manifest for transfer
    let manifest = Manifest::load(&reference.manifest_hash, uploader_store.blob_store()).unwrap();

    // Store manifest in fetcher's store
    let manifest_bytes = manifest.to_json().unwrap();
    fetcher_blob_store
        .put_with_hash(&manifest_bytes, &reference.manifest_hash)
        .unwrap();

    // Step 2: Fetcher downloads chunks (simulated parallel)
    let fetch_start = Instant::now();

    // In real implementation, these would be parallel GET requests
    for chunk_info in &manifest.chunks {
        // Uploader provides chunk data
        let chunk_data = uploader_store.blob_store().get(&chunk_info.hash).unwrap();

        // Fetcher stores chunk
        fetcher_blob_store
            .put_with_hash(&chunk_data, &chunk_info.hash)
            .unwrap();
    }
    timing.record("fetch_chunks", fetch_start.elapsed());

    // Step 3: Fetcher reassembles
    let reassemble_start = Instant::now();

    // Fetcher creates their own chunked store for reassembly
    let _fetcher_chunked =
        ChunkedContentStore::new(BlobStore::new(fetcher_dir.path().join("blobs")).unwrap());

    // Reassemble from manifest (chunks are in blob store now)
    let mut reassembled = Vec::with_capacity(manifest.total_size as usize);
    for chunk_info in &manifest.chunks {
        let chunk_data = fetcher_blob_store.get(&chunk_info.hash).unwrap();

        // Verify chunk hash (integrity check)
        let computed_hash = ContentBlobHash::compute(&chunk_data);
        assert_eq!(
            computed_hash, chunk_info.hash,
            "Chunk hash mismatch - corruption detected"
        );

        reassembled.extend_from_slice(&chunk_data);
    }
    timing.record("reassemble", reassemble_start.elapsed());

    // Step 4: Verify
    assert_eq!(reassembled.len(), test_data.len());
    assert_eq!(reassembled, test_data);

    println!("Flow 3c - Chunk Transfer Summary:\n{}", timing.summary());
}

/// Test: Partial availability and missing chunk detection
#[test]
fn test_flow3_partial_availability() {
    let mut timing = TimingCollector::new();

    let dir = tempdir().unwrap();
    let store = ChunkedContentStore::at_path(dir.path().join("chunks")).unwrap();

    // Create 4MB test data (4 chunks) with unique patterns per chunk
    fn generate_unique_chunk_data(num_chunks: usize) -> Vec<u8> {
        let mut data = Vec::with_capacity(num_chunks * CHUNK_SIZE);
        for chunk_idx in 0..num_chunks {
            for byte_idx in 0..CHUNK_SIZE {
                // Each chunk has unique pattern based on index
                data.push(((chunk_idx * 37 + byte_idx) % 256) as u8);
            }
        }
        data
    }

    let test_data = generate_unique_chunk_data(4);

    // Store chunked content
    let reference = store.store(&test_data).unwrap();
    assert_eq!(reference.chunk_count, 4);

    // Check initial availability (should be 100%)
    let avail_start = Instant::now();
    let availability = store.check_availability(&reference.manifest_hash).unwrap();
    timing.record("check_availability", avail_start.elapsed());

    assert!(availability.is_complete());
    assert_eq!(availability.available_count(), 4);
    assert_eq!(availability.missing_count(), 0);
    assert!((availability.availability_percent() - 100.0).abs() < 0.01);

    // Delete middle chunk to simulate partial download
    let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
    store.blob_store().delete(&manifest.chunks[1].hash).unwrap();

    // Check partial availability
    let partial_availability = store.check_availability(&reference.manifest_hash).unwrap();

    assert!(!partial_availability.is_complete());
    assert_eq!(partial_availability.available_count(), 3);
    assert_eq!(partial_availability.missing_count(), 1);
    assert_eq!(partial_availability.missing_indices(), vec![1]);
    assert!((partial_availability.availability_percent() - 75.0).abs() < 0.01);

    // Get missing chunk hashes for re-download
    let missing = store.get_missing_chunk_hashes(&partial_availability);
    assert_eq!(missing.len(), 1);
    assert_eq!(missing[0], manifest.chunks[1].hash);

    println!(
        "Flow 3d - Partial Availability Summary:\n{}",
        timing.summary()
    );
}

/// Test: Retry on missing chunk (simulated NOTFOUND scenario)
#[test]
fn test_flow3_retry_on_missing() {
    let mut timing = TimingCollector::new();

    let primary_dir = tempdir().unwrap();
    let backup_dir = tempdir().unwrap();
    let fetcher_dir = tempdir().unwrap();

    let primary_store = ChunkedContentStore::at_path(primary_dir.path().join("chunks")).unwrap();
    let backup_store = BlobStore::new(backup_dir.path().join("blobs")).unwrap();
    let fetcher_store = BlobStore::new(fetcher_dir.path().join("blobs")).unwrap();

    // Create content and store on primary
    // Use unique data per chunk to ensure chunks have different hashes
    let test_data: Vec<u8> = (0..(2 * 1024 * 1024))
        .map(|i| {
            let chunk_idx = i / (1024 * 1024);
            ((i + chunk_idx * 7) % 256) as u8
        })
        .collect();
    let reference = primary_store.store(&test_data).unwrap();

    // Copy to backup peer
    let manifest = Manifest::load(&reference.manifest_hash, primary_store.blob_store()).unwrap();
    let manifest_bytes = manifest.to_json().unwrap();
    backup_store
        .put_with_hash(&manifest_bytes, &reference.manifest_hash)
        .unwrap();

    for chunk_info in &manifest.chunks {
        let chunk_data = primary_store.blob_store().get(&chunk_info.hash).unwrap();
        backup_store
            .put_with_hash(&chunk_data, &chunk_info.hash)
            .unwrap();
    }

    // Delete chunk from primary to simulate partial availability
    primary_store
        .blob_store()
        .delete(&manifest.chunks[0].hash)
        .unwrap();

    // Step 1: Fetcher tries primary, gets NOTFOUND for chunk 0
    let fetch_start = Instant::now();
    let mut failed_from_primary = false;
    let mut chunks_fetched = 0;

    for chunk_info in &manifest.chunks {
        if primary_store.blob_store().exists(&chunk_info.hash) {
            let chunk_data = primary_store.blob_store().get(&chunk_info.hash).unwrap();
            fetcher_store
                .put_with_hash(&chunk_data, &chunk_info.hash)
                .unwrap();
            chunks_fetched += 1;
        } else {
            failed_from_primary = true;
        }
    }
    timing.record("fetch_from_primary", fetch_start.elapsed());

    assert!(
        failed_from_primary,
        "Should have failed to get chunk 0 from primary"
    );
    assert_eq!(
        chunks_fetched, 1,
        "Should have fetched 1 chunk from primary"
    );

    // Step 2: Retry missing chunk from backup
    let retry_start = Instant::now();

    let missing_hash = &manifest.chunks[0].hash;
    assert!(
        backup_store.exists(missing_hash),
        "Backup should have chunk"
    );

    let chunk_data = backup_store.get(missing_hash).unwrap();
    fetcher_store
        .put_with_hash(&chunk_data, missing_hash)
        .unwrap();
    timing.record("retry_from_backup", retry_start.elapsed());

    // Step 3: Verify all chunks available
    for chunk_info in &manifest.chunks {
        assert!(
            fetcher_store.exists(&chunk_info.hash),
            "Missing chunk {:?}",
            chunk_info.index
        );
    }

    // Step 4: Reassemble
    let reassemble_start = Instant::now();
    let mut reassembled = Vec::with_capacity(manifest.total_size as usize);
    for chunk_info in &manifest.chunks {
        let chunk_data = fetcher_store.get(&chunk_info.hash).unwrap();
        reassembled.extend_from_slice(&chunk_data);
    }
    timing.record("reassemble", reassemble_start.elapsed());

    assert_eq!(reassembled, test_data);

    println!("Flow 3e - Retry on Missing Summary:\n{}", timing.summary());
    println!("  Primary fetch failed as expected");
    println!("  Backup retry successful");
}

/// Test: Complete media upload and retrieval flow
#[test]
fn test_flow3_complete_media_flow() {
    let mut timing = TimingCollector::new();
    let flow_start = Instant::now();

    // === Setup ===
    let uploader_dir = tempdir().unwrap();
    let fetcher_dir = tempdir().unwrap();

    let uploader_store = ChunkedContentStore::at_path(uploader_dir.path().join("chunks")).unwrap();
    let fetcher_store = ChunkedContentStore::at_path(fetcher_dir.path().join("chunks")).unwrap();

    let mut uploader_seen: HashSet<[u8; 32]> = HashSet::new();
    let mut fetcher_seen: HashSet<[u8; 32]> = HashSet::new();

    // === Phase 1: Upload 3MB media file ===
    let data_size = 3 * 1024 * 1024;
    let test_data: Vec<u8> = (0..data_size).map(|i| (i % 256) as u8).collect();

    let upload_start = Instant::now();
    let reference = uploader_store
        .store_with_mime(&test_data, "application/octet-stream")
        .unwrap();
    timing.record("upload_chunked", upload_start.elapsed());

    assert_eq!(reference.total_size, data_size as u64);
    assert_eq!(reference.chunk_count, 3);
    assert_eq!(
        reference.mime_type,
        Some("application/octet-stream".to_string())
    );

    // Mark manifest as available
    uploader_seen.insert(*reference.manifest_hash.as_bytes());

    // Load manifest for transfer (verified by loading)
    let _manifest = Manifest::load(&reference.manifest_hash, uploader_store.blob_store()).unwrap();

    // === Phase 2: Fetcher discovers and downloads ===

    // Fetcher learns about content (INV simulation)
    assert!(!fetcher_seen.contains(reference.manifest_hash.as_bytes()));

    // Fetch manifest first
    let manifest_start = Instant::now();
    let manifest_bytes = uploader_store
        .blob_store()
        .get(&reference.manifest_hash)
        .unwrap();
    fetcher_store
        .blob_store()
        .put_with_hash(&manifest_bytes, &reference.manifest_hash)
        .unwrap();
    fetcher_seen.insert(*reference.manifest_hash.as_bytes());
    timing.record("fetch_manifest", manifest_start.elapsed());

    // Parse manifest on fetcher side
    let fetcher_manifest = Manifest::from_json(&manifest_bytes).unwrap();
    fetcher_manifest.validate().unwrap();

    // Fetch all chunks (simulated parallel - in sequence for test simplicity)
    let chunks_start = Instant::now();
    for chunk_info in &fetcher_manifest.chunks {
        // Check if we need this chunk
        if !fetcher_store.blob_store().exists(&chunk_info.hash) {
            // Request from uploader
            let chunk_data = uploader_store.blob_store().get(&chunk_info.hash).unwrap();

            // Verify and store
            let computed = ContentBlobHash::compute(&chunk_data);
            assert_eq!(computed, chunk_info.hash, "Chunk hash mismatch");

            fetcher_store
                .blob_store()
                .put_with_hash(&chunk_data, &chunk_info.hash)
                .unwrap();
        }
    }
    timing.record("fetch_all_chunks", chunks_start.elapsed());

    // === Phase 3: Reassemble and verify ===
    let reassemble_start = Instant::now();
    let reassembled = fetcher_store.reassemble(&reference.manifest_hash).unwrap();
    timing.record("reassemble", reassemble_start.elapsed());

    // Verify content
    let verify_start = Instant::now();
    assert_eq!(reassembled.len(), test_data.len(), "Size mismatch");
    assert_eq!(reassembled, test_data, "Content mismatch after reassembly");
    timing.record("verify", verify_start.elapsed());

    timing.record("total_flow", flow_start.elapsed());

    // === Assertions ===
    // Total flow should be <2s for 3MB
    timing.assert_under("total_flow", Duration::from_secs(2));

    println!("\n=== Flow 3 Complete Media Flow Summary ===");
    println!("{}", timing.summary());
    println!("✓ 3MB file chunked into {} chunks", reference.chunk_count);
    println!("✓ Manifest created and transferred");
    println!("✓ All chunks transferred with integrity checks");
    println!("✓ Content reassembled and verified");
    println!("✓ Timing requirements met");
}

/// Test: Edge cases for chunking
#[test]
fn test_flow3_chunking_edge_cases() {
    // Test: File just over 1KB threshold (should chunk)
    let just_over_threshold = vec![0u8; 1025];
    let result = chunk_data(&just_over_threshold);
    assert!(result.is_ok());
    let (manifest, chunks) = result.unwrap();
    assert_eq!(chunks.len(), 1);
    assert_eq!(manifest.total_size, 1025);

    // Test: File at 1KB threshold (should fail - too small)
    let at_threshold = vec![0u8; 1024];
    let result = chunk_data(&at_threshold);
    assert!(matches!(
        result,
        Err(ChunkingError::FileTooSmallForChunking { .. })
    ));

    // Test: File exactly 1MB (should produce 1 chunk)
    let exactly_1mb = vec![0u8; CHUNK_SIZE];
    let (manifest, chunks) = chunk_data(&exactly_1mb).unwrap();
    assert_eq!(chunks.len(), 1);
    assert_eq!(manifest.total_size, CHUNK_SIZE as u64);

    // Test: File 1MB + 1 byte (should produce 2 chunks)
    let just_over_1mb = vec![0u8; CHUNK_SIZE + 1];
    let (_manifest, chunks) = chunk_data(&just_over_1mb).unwrap();
    assert_eq!(chunks.len(), 2);
    assert_eq!(chunks[0].0.size, CHUNK_SIZE as u32);
    assert_eq!(chunks[1].0.size, 1);

    println!("Flow 3f - Edge Cases: All passed");
}
