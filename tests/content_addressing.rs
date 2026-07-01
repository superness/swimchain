//! Integration tests for content addressing (SPEC_07 - Milestone 3.1)
//!
//! Tests the ContentAddressedStore with actual filesystem operations.

use swimchain::content::addressing::{
    apply_content_reference, classify_content, compute_hash, extract_content_reference,
    should_inline, validate_content_item_fields, ContentAddressedStore, ContentAddressingError,
    ContentBlobHash, ContentReference, INLINE_THRESHOLD,
};
use swimchain::types::content::{ContentHash, ContentId, ContentItem, ContentType, SpaceId};
use swimchain::types::identity::{IdentityId, Signature};
use tempfile::tempdir;

/// Create a minimal ContentItem for testing
fn create_test_content_item() -> ContentItem {
    ContentItem {
        content_id: ContentId::from_bytes([0u8; 32]),
        author_id: IdentityId::from_bytes([1u8; 32]),
        content_type: ContentType::Post,
        space_id: SpaceId::from_bytes([2u8; 32]),
        parent_id: None,
        created_at: 0,
        last_engagement: 0,
        body_inline: None,
        content_hash: None,
        content_size: None,
        content_type_mime: None,
        media_refs: vec![],
        pin_state: None,
        engagement_count: 0,
        signature: Signature::from_bytes([0u8; 64]),
        pow_nonce: 0,
        pow_difficulty: 0,
        preservation_pow: None,
        display_name: None,
    }
}

#[test]
fn test_store_inline_no_blob() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let data = b"small content";
    let reference = store.store(data).unwrap();

    assert!(matches!(reference, ContentReference::Inline(_)));
    assert_eq!(store.total_bytes(), 0); // No blob stored

    let retrieved = store.retrieve(&reference).unwrap();
    assert_eq!(retrieved, data);
}

#[test]
fn test_store_inline_at_boundary() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    // Exactly at threshold (1024 bytes) should be inline
    let data = vec![b'x'; INLINE_THRESHOLD];
    let reference = store.store(&data).unwrap();

    assert!(matches!(reference, ContentReference::Inline(_)));
    assert_eq!(store.total_bytes(), 0); // No blob stored

    let retrieved = store.retrieve(&reference).unwrap();
    assert_eq!(retrieved, data);
}

#[test]
fn test_store_referenced_creates_blob() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    // One byte over threshold should be referenced
    let data = vec![b'x'; INLINE_THRESHOLD + 1];
    let reference = store.store(&data).unwrap();

    match &reference {
        ContentReference::Referenced { hash, size, .. } => {
            assert_eq!(*size, (INLINE_THRESHOLD + 1) as u32);
            assert!(store.exists(hash));
        }
        _ => panic!("Expected Referenced"),
    }

    let retrieved = store.retrieve(&reference).unwrap();
    assert_eq!(retrieved, data);
}

#[test]
fn test_store_large_content() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let data = vec![b'x'; 100_000]; // 100KB
    let reference = store.store(&data).unwrap();

    match &reference {
        ContentReference::Referenced { hash, size, .. } => {
            assert_eq!(*size, 100_000);
            assert!(store.exists(hash));
            assert_eq!(store.total_bytes(), 100_000);
        }
        _ => panic!("Expected Referenced"),
    }

    let retrieved = store.retrieve(&reference).unwrap();
    assert_eq!(retrieved, data);
}

#[test]
fn test_store_with_mime() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let data = vec![0xFF, 0xD8, 0xFF, 0xE0]; // JPEG magic + padding
    let data_large: Vec<u8> = std::iter::once(data.clone())
        .flat_map(|v| std::iter::repeat(v).take(500))
        .flatten()
        .collect();

    let reference = store.store_with_mime(&data_large, "image/jpeg").unwrap();

    match &reference {
        ContentReference::Referenced { mime_type, .. } => {
            assert_eq!(mime_type.as_deref(), Some("image/jpeg"));
        }
        _ => panic!("Expected Referenced"),
    }
}

#[test]
fn test_store_idempotent() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let data = vec![b'x'; 2000];
    let ref1 = store.store(&data).unwrap();
    let bytes_after_first = store.total_bytes();

    let ref2 = store.store(&data).unwrap();
    let bytes_after_second = store.total_bytes();

    // Same reference
    assert_eq!(ref1, ref2);

    // Same storage size (blob not duplicated)
    assert_eq!(bytes_after_first, bytes_after_second);
}

#[test]
fn test_retrieve_by_hash() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let data = vec![b'y'; 5000];
    let reference = store.store(&data).unwrap();

    if let ContentReference::Referenced { hash, .. } = &reference {
        let retrieved = store.retrieve_by_hash(hash).unwrap();
        assert_eq!(retrieved, data);
    } else {
        panic!("Expected Referenced");
    }
}

#[test]
fn test_corrupted_blob_rejected() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let data = vec![b'x'; 2000];
    let reference = store.store(&data).unwrap();

    // Corrupt the blob file
    if let ContentReference::Referenced { hash, .. } = &reference {
        let blob_path = store.blob_path(hash);
        std::fs::write(&blob_path, b"corrupted data").unwrap();

        let result = store.retrieve(&reference);
        assert!(result.is_err());

        // Verify it's a storage corruption error
        match result {
            Err(ContentAddressingError::Storage(
                swimchain::types::error::StorageError::CorruptedData { .. },
            )) => {}
            other => panic!("Expected CorruptedData error, got: {:?}", other),
        }
    }
}

#[test]
fn test_nonexistent_hash() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let fake_hash = ContentBlobHash::from_bytes([0xDE; 32]);
    let result = store.retrieve_by_hash(&fake_hash);

    assert!(result.is_err());
}

#[test]
fn test_hash_format() {
    let data = b"test data for hashing";
    let hash = compute_hash(data);
    let hash_str = hash.to_hash_string();

    // Format: sha256:<64-hex-chars>
    assert!(hash_str.starts_with("sha256:"));
    assert_eq!(hash_str.len(), 7 + 64);

    // Can parse back
    let parsed = ContentBlobHash::from_hash_string(&hash_str).unwrap();
    assert_eq!(parsed, hash);
}

#[test]
fn test_classify_content_boundary() {
    // At boundary - should be inline
    let data_at = vec![b'a'; INLINE_THRESHOLD];
    assert!(matches!(
        classify_content(&data_at),
        ContentReference::Inline(_)
    ));

    // Over boundary - should be referenced
    let data_over = vec![b'b'; INLINE_THRESHOLD + 1];
    assert!(matches!(
        classify_content(&data_over),
        ContentReference::Referenced { .. }
    ));
}

#[test]
fn test_apply_content_reference_inline() {
    let mut item = create_test_content_item();
    let reference = ContentReference::Inline(b"Hello, world!".to_vec());

    apply_content_reference(&mut item, &reference);

    assert_eq!(item.body_inline, Some("Hello, world!".to_string()));
    assert!(item.content_hash.is_none());
    assert!(item.content_size.is_none());
    assert!(item.content_type_mime.is_none());
}

#[test]
fn test_apply_content_reference_referenced() {
    let mut item = create_test_content_item();
    let hash = ContentBlobHash::compute(b"large content");
    let reference = ContentReference::Referenced {
        hash,
        size: 5000,
        mime_type: Some("text/plain".to_string()),
    };

    apply_content_reference(&mut item, &reference);

    assert!(item.body_inline.is_none());
    assert!(item.content_hash.is_some());
    assert_eq!(item.content_size, Some(5000));
    assert_eq!(item.content_type_mime, Some("text/plain".to_string()));

    // Verify hash bytes match
    let content_hash = item.content_hash.unwrap();
    assert_eq!(content_hash.as_bytes(), hash.as_bytes());
}

#[test]
fn test_validate_content_item_fields_valid_inline() {
    let mut item = create_test_content_item();
    item.body_inline = Some("Small content".to_string());

    assert!(validate_content_item_fields(&item).is_ok());
}

#[test]
fn test_validate_content_item_fields_valid_referenced() {
    let mut item = create_test_content_item();
    item.content_hash = Some(ContentHash::from_bytes([0xAB; 32]));
    item.content_size = Some(5000);

    assert!(validate_content_item_fields(&item).is_ok());
}

#[test]
fn test_validate_content_item_fields_valid_empty() {
    let item = create_test_content_item();
    // Neither inline nor hash is valid (empty content)
    assert!(validate_content_item_fields(&item).is_ok());
}

#[test]
fn test_validate_content_item_fields_both_set() {
    let mut item = create_test_content_item();
    item.body_inline = Some("Some text".to_string());
    item.content_hash = Some(ContentHash::from_bytes([0xAB; 32]));
    item.content_size = Some(1000);

    let result = validate_content_item_fields(&item);
    assert!(matches!(
        result,
        Err(ContentAddressingError::InconsistentFields { .. })
    ));
}

#[test]
fn test_validate_content_item_fields_hash_without_size() {
    let mut item = create_test_content_item();
    item.content_hash = Some(ContentHash::from_bytes([0xAB; 32]));
    // content_size is None

    let result = validate_content_item_fields(&item);
    assert!(matches!(
        result,
        Err(ContentAddressingError::InconsistentFields { .. })
    ));
}

#[test]
fn test_validate_content_item_fields_inline_too_large() {
    let mut item = create_test_content_item();
    item.body_inline = Some("x".repeat(INLINE_THRESHOLD + 1));

    let result = validate_content_item_fields(&item);
    assert!(matches!(
        result,
        Err(ContentAddressingError::ContentTooLargeForInline { .. })
    ));
}

#[test]
fn test_extract_content_reference_inline() {
    let mut item = create_test_content_item();
    item.body_inline = Some("Test content".to_string());

    let reference = extract_content_reference(&item).unwrap();
    assert!(matches!(reference, Some(ContentReference::Inline(_))));

    if let Some(ContentReference::Inline(data)) = reference {
        assert_eq!(data, b"Test content");
    }
}

#[test]
fn test_extract_content_reference_referenced() {
    let mut item = create_test_content_item();
    item.content_hash = Some(ContentHash::from_bytes([0xCD; 32]));
    item.content_size = Some(10000);
    item.content_type_mime = Some("application/json".to_string());

    let reference = extract_content_reference(&item).unwrap();

    if let Some(ContentReference::Referenced {
        hash,
        size,
        mime_type,
    }) = reference
    {
        assert_eq!(hash.as_bytes(), &[0xCD; 32]);
        assert_eq!(size, 10000);
        assert_eq!(mime_type, Some("application/json".to_string()));
    } else {
        panic!("Expected Referenced");
    }
}

#[test]
fn test_extract_content_reference_empty() {
    let item = create_test_content_item();
    let reference = extract_content_reference(&item).unwrap();
    assert!(reference.is_none());
}

#[test]
fn test_round_trip_inline() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    let original = "Hello, this is a small post!";
    let reference = store.store(original.as_bytes()).unwrap();

    let mut item = create_test_content_item();
    apply_content_reference(&mut item, &reference);

    // Validate
    assert!(validate_content_item_fields(&item).is_ok());

    // Extract back
    let extracted = extract_content_reference(&item).unwrap().unwrap();
    let retrieved = store.retrieve(&extracted).unwrap();

    assert_eq!(String::from_utf8(retrieved).unwrap(), original);
}

#[test]
fn test_round_trip_referenced() {
    let dir = tempdir().unwrap();
    let store = ContentAddressedStore::new(dir.path().join("blobs")).unwrap();

    // Create content larger than threshold
    let original: Vec<u8> = (0..5000).map(|i| (i % 256) as u8).collect();
    let reference = store.store(&original).unwrap();

    let mut item = create_test_content_item();
    apply_content_reference(&mut item, &reference);

    // Validate
    assert!(validate_content_item_fields(&item).is_ok());

    // Extract back
    let extracted = extract_content_reference(&item).unwrap().unwrap();
    let retrieved = store.retrieve(&extracted).unwrap();

    assert_eq!(retrieved, original);
}

#[test]
fn test_should_inline_edge_cases() {
    assert!(should_inline(0));
    assert!(should_inline(1));
    assert!(should_inline(INLINE_THRESHOLD));
    assert!(!should_inline(INLINE_THRESHOLD + 1));
    assert!(!should_inline(usize::MAX));
}

#[test]
fn test_content_blob_hash_serialization() {
    let hash = ContentBlobHash::compute(b"test");
    let json = serde_json::to_string(&hash).unwrap();

    // Should serialize as sha256:<hex>
    assert!(json.contains("sha256:"));

    let deserialized: ContentBlobHash = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized, hash);
}
