//! Content addressing API (SPEC_07 - Milestone 3.1)
//!
//! This module provides a high-level API for content-addressed storage,
//! combining inline storage for small content (≤1KB) with blob storage
//! for larger content.
//!
//! # Content ID Format
//!
//! Content is addressed by SHA-256 hash in the format `sha256:<64-hex-chars>`.
//! This is consistent with the existing BlobStore implementation.
//!
//! # Inline vs Referenced
//!
//! Per SPEC_02 §3.1 and SPEC_07 §3:
//! - Content ≤1024 bytes: stored inline in `body_inline` field
//! - Content >1024 bytes: stored in blob layer, referenced by `content_hash`
//!
//! # Hash Verification
//!
//! All content is verified against its expected hash on retrieval.
//! Corrupted or tampered content is rejected.

use std::path::Path;

use crate::storage::blob::BlobStore;
use crate::types::content::{ContentHash, ContentItem};
use crate::types::error::StorageError;

// Re-export ContentBlobHash for external use
pub use crate::storage::blob::ContentBlobHash;

/// Maximum inline content size (SPEC_02 §3.1, SPEC_07 §3)
pub const INLINE_THRESHOLD: usize = 1024; // 1KB

/// Alias to unify naming: ContentAddressHash is the same as ContentBlobHash
pub type ContentAddressHash = ContentBlobHash;

/// Reference to content - inline, single blob, or chunked
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentReference {
    /// Small content stored inline (≤1024 bytes)
    Inline(Vec<u8>),
    /// Medium content as single blob (1KB < size ≤ 1MB)
    Referenced {
        /// SHA-256 hash of the content
        hash: ContentBlobHash,
        /// Size in bytes
        size: u32,
        /// Optional MIME type
        mime_type: Option<String>,
    },
    /// Large content as chunked blobs (>1MB)
    Chunked {
        /// Hash of the manifest (stored in content_hash field)
        manifest_hash: ContentBlobHash,
        /// Total size of original content
        total_size: u64,
        /// Number of chunks
        chunk_count: u32,
        /// Optional MIME type
        mime_type: Option<String>,
    },
}

/// Error types specific to content addressing
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ContentAddressingError {
    /// Hash mismatch between expected and actual content
    #[error("hash mismatch: expected {expected}, actual {actual}")]
    HashMismatch {
        /// Expected hash string
        expected: String,
        /// Actual computed hash string
        actual: String,
    },

    /// Content is too large for inline storage
    #[error("content too large for inline: {size} > {threshold}")]
    ContentTooLargeForInline {
        /// Actual content size
        size: usize,
        /// Maximum allowed inline size
        threshold: usize,
    },

    /// Content item fields are inconsistent
    #[error("inconsistent content fields: {reason}")]
    InconsistentFields {
        /// Description of the inconsistency
        reason: String,
    },

    /// Storage layer error
    #[error("storage error: {0}")]
    Storage(#[from] StorageError),
}

/// Returns true if content should be stored inline (≤1024 bytes)
#[must_use]
pub fn should_inline(size: usize) -> bool {
    size <= INLINE_THRESHOLD
}

/// Classify content for storage and create appropriate reference
///
/// - ≤1KB: Inline
/// - 1KB-1MB: Single blob (Referenced)
/// - >1MB: Chunked (manifest + chunks)
#[must_use]
pub fn classify_content(data: &[u8]) -> ContentReference {
    use crate::storage::blob::CHUNK_SIZE;

    if should_inline(data.len()) {
        ContentReference::Inline(data.to_vec())
    } else if data.len() <= CHUNK_SIZE {
        // Single blob for 1KB < size ≤ 1MB
        let hash = ContentBlobHash::compute(data);
        ContentReference::Referenced {
            hash,
            size: data.len() as u32,
            mime_type: None,
        }
    } else {
        // Chunked for > 1MB
        use super::chunking::chunk_data;

        // chunk_data will succeed since size > 1KB (already checked)
        // and we don't have upper limit check here (handled by chunking module)
        match chunk_data(data) {
            Ok((manifest, _)) => {
                match manifest.compute_hash() {
                    Ok(manifest_hash) => ContentReference::Chunked {
                        manifest_hash,
                        total_size: data.len() as u64,
                        chunk_count: manifest.chunk_count(),
                        mime_type: None,
                    },
                    Err(_) => {
                        // Fallback to Referenced if manifest hash computation fails
                        let hash = ContentBlobHash::compute(data);
                        ContentReference::Referenced {
                            hash,
                            size: data.len() as u32,
                            mime_type: None,
                        }
                    }
                }
            }
            Err(_) => {
                // Fallback to Referenced for very large files (>1GB)
                // This case should be rejected at a higher level
                let hash = ContentBlobHash::compute(data);
                ContentReference::Referenced {
                    hash,
                    size: data.len() as u32,
                    mime_type: None,
                }
            }
        }
    }
}

/// Classify content with MIME type
///
/// - ≤1KB: Inline (MIME type not stored for inline content)
/// - 1KB-1MB: Single blob (Referenced)
/// - >1MB: Chunked (manifest + chunks)
#[must_use]
pub fn classify_content_with_mime(data: &[u8], mime: &str) -> ContentReference {
    use crate::storage::blob::CHUNK_SIZE;

    if should_inline(data.len()) {
        ContentReference::Inline(data.to_vec())
    } else if data.len() <= CHUNK_SIZE {
        let hash = ContentBlobHash::compute(data);
        ContentReference::Referenced {
            hash,
            size: data.len() as u32,
            mime_type: Some(mime.to_string()),
        }
    } else {
        // Chunked for > 1MB
        use super::chunking::chunk_data;

        match chunk_data(data) {
            Ok((manifest, _)) => {
                match manifest.compute_hash() {
                    Ok(manifest_hash) => ContentReference::Chunked {
                        manifest_hash,
                        total_size: data.len() as u64,
                        chunk_count: manifest.chunk_count(),
                        mime_type: Some(mime.to_string()),
                    },
                    Err(_) => {
                        // Fallback to Referenced if manifest hash computation fails
                        let hash = ContentBlobHash::compute(data);
                        ContentReference::Referenced {
                            hash,
                            size: data.len() as u32,
                            mime_type: Some(mime.to_string()),
                        }
                    }
                }
            }
            Err(_) => {
                // Fallback to Referenced for very large files (>1GB)
                let hash = ContentBlobHash::compute(data);
                ContentReference::Referenced {
                    hash,
                    size: data.len() as u32,
                    mime_type: Some(mime.to_string()),
                }
            }
        }
    }
}

/// Verify content matches expected hash
///
/// # Errors
///
/// Returns `ContentAddressingError::HashMismatch` if the computed hash
/// doesn't match the expected hash.
pub fn verify_content(
    data: &[u8],
    expected: &ContentBlobHash,
) -> Result<(), ContentAddressingError> {
    let actual = ContentBlobHash::compute(data);
    if actual == *expected {
        Ok(())
    } else {
        Err(ContentAddressingError::HashMismatch {
            expected: expected.to_hash_string(),
            actual: actual.to_hash_string(),
        })
    }
}

/// Compute hash of content
#[must_use]
pub fn compute_hash(data: &[u8]) -> ContentBlobHash {
    ContentBlobHash::compute(data)
}

/// High-level content-addressed storage combining inline and blob storage
pub struct ContentAddressedStore {
    blob_store: BlobStore,
}

impl ContentAddressedStore {
    /// Create new store at given path
    ///
    /// # Errors
    ///
    /// Returns error if directory cannot be created.
    pub fn new(path: impl AsRef<Path>) -> Result<Self, ContentAddressingError> {
        let blob_store = BlobStore::new(path)?;
        Ok(Self { blob_store })
    }

    /// Store content, returning reference
    ///
    /// - Inline content (≤1KB): no blob stored, returns Inline reference
    /// - Referenced content (1KB-1MB): single blob stored, returns Referenced
    /// - Chunked content (>1MB): chunks + manifest stored, returns Chunked
    ///
    /// # Errors
    ///
    /// Returns error if blob storage fails.
    pub fn store(&self, data: &[u8]) -> Result<ContentReference, ContentAddressingError> {
        use crate::storage::blob::CHUNK_SIZE;

        if should_inline(data.len()) {
            Ok(ContentReference::Inline(data.to_vec()))
        } else if data.len() <= CHUNK_SIZE {
            let hash = self.blob_store.put(data)?;
            Ok(ContentReference::Referenced {
                hash,
                size: data.len() as u32,
                mime_type: None,
            })
        } else {
            // Chunked storage for > 1MB
            use super::chunking::{chunk_data, ChunkingError};

            let (manifest, chunks) = chunk_data(data).map_err(|e| match e {
                ChunkingError::Storage(se) => ContentAddressingError::Storage(se),
                other => ContentAddressingError::InconsistentFields {
                    reason: other.to_string(),
                },
            })?;

            // Store each chunk
            for (info, chunk_bytes) in &chunks {
                self.blob_store.put_with_hash(chunk_bytes, &info.hash)?;
            }

            // Store manifest
            let manifest_hash = manifest.store(&self.blob_store).map_err(|e| match e {
                ChunkingError::Storage(se) => ContentAddressingError::Storage(se),
                other => ContentAddressingError::InconsistentFields {
                    reason: other.to_string(),
                },
            })?;

            Ok(ContentReference::Chunked {
                manifest_hash,
                total_size: manifest.total_size,
                chunk_count: manifest.chunk_count(),
                mime_type: None,
            })
        }
    }

    /// Store content with MIME type
    ///
    /// # Errors
    ///
    /// Returns error if blob storage fails.
    pub fn store_with_mime(
        &self,
        data: &[u8],
        mime: &str,
    ) -> Result<ContentReference, ContentAddressingError> {
        use crate::storage::blob::CHUNK_SIZE;

        if should_inline(data.len()) {
            Ok(ContentReference::Inline(data.to_vec()))
        } else if data.len() <= CHUNK_SIZE {
            let hash = self.blob_store.put(data)?;
            Ok(ContentReference::Referenced {
                hash,
                size: data.len() as u32,
                mime_type: Some(mime.to_string()),
            })
        } else {
            // Chunked storage for > 1MB
            use super::chunking::{chunk_data, ChunkingError};

            let (manifest, chunks) = chunk_data(data).map_err(|e| match e {
                ChunkingError::Storage(se) => ContentAddressingError::Storage(se),
                other => ContentAddressingError::InconsistentFields {
                    reason: other.to_string(),
                },
            })?;

            // Store each chunk
            for (info, chunk_bytes) in &chunks {
                self.blob_store.put_with_hash(chunk_bytes, &info.hash)?;
            }

            // Store manifest
            let manifest_hash = manifest.store(&self.blob_store).map_err(|e| match e {
                ChunkingError::Storage(se) => ContentAddressingError::Storage(se),
                other => ContentAddressingError::InconsistentFields {
                    reason: other.to_string(),
                },
            })?;

            Ok(ContentReference::Chunked {
                manifest_hash,
                total_size: manifest.total_size,
                chunk_count: manifest.chunk_count(),
                mime_type: Some(mime.to_string()),
            })
        }
    }

    /// Retrieve content by reference
    ///
    /// # Errors
    ///
    /// Returns error if blob not found or corrupted.
    pub fn retrieve(
        &self,
        reference: &ContentReference,
    ) -> Result<Vec<u8>, ContentAddressingError> {
        match reference {
            ContentReference::Inline(data) => Ok(data.clone()),
            ContentReference::Referenced { hash, .. } => {
                let data = self.blob_store.get(hash)?; // Already verifies hash
                Ok(data)
            }
            ContentReference::Chunked {
                manifest_hash,
                total_size,
                ..
            } => {
                use super::chunking::{ChunkingError, Manifest};

                // Load manifest
                let manifest =
                    Manifest::load(manifest_hash, &self.blob_store).map_err(|e| match e {
                        ChunkingError::Storage(se) => ContentAddressingError::Storage(se),
                        ChunkingError::ChunkNotFound { hash } => ContentAddressingError::Storage(
                            crate::types::error::StorageError::BlobNotFound { hash },
                        ),
                        other => ContentAddressingError::InconsistentFields {
                            reason: other.to_string(),
                        },
                    })?;

                // Reassemble chunks
                let mut result = Vec::with_capacity(*total_size as usize);
                for chunk_info in &manifest.chunks {
                    let chunk_data = self.blob_store.get(&chunk_info.hash)?;
                    result.extend_from_slice(&chunk_data);
                }

                Ok(result)
            }
        }
    }

    /// Retrieve by hash directly (for external lookups)
    ///
    /// # Errors
    ///
    /// Returns error if blob not found or corrupted.
    pub fn retrieve_by_hash(
        &self,
        hash: &ContentBlobHash,
    ) -> Result<Vec<u8>, ContentAddressingError> {
        let data = self.blob_store.get(hash)?;
        Ok(data)
    }

    /// Check if blob exists
    #[must_use]
    pub fn exists(&self, hash: &ContentBlobHash) -> bool {
        self.blob_store.exists(hash)
    }

    /// Get total storage bytes (only counts blob storage, not inline)
    #[must_use]
    pub fn total_bytes(&self) -> u64 {
        self.blob_store.total_bytes()
    }

    /// Get blob path for a hash (for testing/debugging)
    #[must_use]
    pub fn blob_path(&self, hash: &ContentBlobHash) -> std::path::PathBuf {
        self.blob_store.blob_path(hash)
    }
}

/// Populate ContentItem fields based on content reference
///
/// Sets: `body_inline`, `content_hash`, `content_size`, `content_type_mime`
/// Caller must set other ContentItem fields separately.
///
/// For chunked content, `content_hash` points to the manifest hash and
/// `content_size` contains the total size as u32 (for sizes up to 4GB).
pub fn apply_content_reference(item: &mut ContentItem, reference: &ContentReference) {
    match reference {
        ContentReference::Inline(data) => {
            // UTF-8 content stored inline
            item.body_inline = String::from_utf8(data.clone()).ok();
            item.content_hash = None;
            item.content_size = None;
            item.content_type_mime = None;
        }
        ContentReference::Referenced {
            hash,
            size,
            mime_type,
        } => {
            item.body_inline = None;
            item.content_hash = Some(ContentHash::from_bytes(*hash.as_bytes()));
            item.content_size = Some(*size);
            item.content_type_mime = mime_type.clone();
        }
        ContentReference::Chunked {
            manifest_hash,
            total_size,
            mime_type,
            ..
        } => {
            item.body_inline = None;
            // content_hash points to the manifest for chunked content
            item.content_hash = Some(ContentHash::from_bytes(*manifest_hash.as_bytes()));
            // Store total_size as u32 (truncated for very large files, but we limit to 1GB anyway)
            item.content_size = Some(*total_size as u32);
            item.content_type_mime = mime_type.clone();
        }
    }
}

/// Validate that ContentItem content fields are consistent
///
/// # Errors
///
/// Returns error if:
/// - Both `body_inline` AND `content_hash` are set (must be XOR)
/// - `content_hash` is set but `content_size` is not
/// - `body_inline` exceeds INLINE_THRESHOLD
pub fn validate_content_item_fields(item: &ContentItem) -> Result<(), ContentAddressingError> {
    let has_inline = item.body_inline.is_some();
    let has_hash = item.content_hash.is_some();

    // Cannot have both inline and hash
    if has_inline && has_hash {
        return Err(ContentAddressingError::InconsistentFields {
            reason: "both body_inline and content_hash are set (must be XOR)".to_string(),
        });
    }

    // If hash is set, size should also be set
    if has_hash && item.content_size.is_none() {
        return Err(ContentAddressingError::InconsistentFields {
            reason: "content_hash is set but content_size is None".to_string(),
        });
    }

    // Inline content must not exceed threshold
    if let Some(ref inline) = item.body_inline {
        if inline.len() > INLINE_THRESHOLD {
            return Err(ContentAddressingError::ContentTooLargeForInline {
                size: inline.len(),
                threshold: INLINE_THRESHOLD,
            });
        }
    }

    Ok(())
}

/// Extract content reference from ContentItem
///
/// # Errors
///
/// Returns error if ContentItem fields are inconsistent.
pub fn extract_content_reference(
    item: &ContentItem,
) -> Result<Option<ContentReference>, ContentAddressingError> {
    validate_content_item_fields(item)?;

    if let Some(ref inline) = item.body_inline {
        Ok(Some(ContentReference::Inline(inline.as_bytes().to_vec())))
    } else if let Some(ref hash) = item.content_hash {
        Ok(Some(ContentReference::Referenced {
            hash: ContentBlobHash::from_bytes(*hash.as_bytes()),
            size: item.content_size.unwrap_or(0),
            mime_type: item.content_type_mime.clone(),
        }))
    } else {
        // Neither inline nor hash - empty content is allowed
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inline_threshold() {
        assert_eq!(INLINE_THRESHOLD, 1024);
    }

    #[test]
    fn test_should_inline_boundary() {
        assert!(should_inline(0)); // Empty content
        assert!(should_inline(1));
        assert!(should_inline(512));
        assert!(should_inline(1023));
        assert!(should_inline(1024)); // Boundary - inclusive
        assert!(!should_inline(1025)); // Boundary - exclusive
        assert!(!should_inline(10_000));
        assert!(!should_inline(1_000_000));
    }

    #[test]
    fn test_classify_content_inline() {
        let data = vec![b'x'; 1024];
        match classify_content(&data) {
            ContentReference::Inline(d) => assert_eq!(d, data),
            ContentReference::Referenced { .. } => panic!("Expected Inline"),
            ContentReference::Chunked { .. } => panic!("Expected Inline"),
        }
    }

    #[test]
    fn test_classify_content_inline_empty() {
        let data = vec![];
        match classify_content(&data) {
            ContentReference::Inline(d) => assert!(d.is_empty()),
            ContentReference::Referenced { .. } => panic!("Expected Inline"),
            ContentReference::Chunked { .. } => panic!("Expected Inline"),
        }
    }

    #[test]
    fn test_classify_content_referenced() {
        let data = vec![b'x'; 1025];
        match classify_content(&data) {
            ContentReference::Inline(_) => panic!("Expected Referenced"),
            ContentReference::Referenced {
                hash,
                size,
                mime_type,
            } => {
                assert_eq!(size, 1025);
                assert_eq!(hash, ContentBlobHash::compute(&data));
                assert!(mime_type.is_none());
            }
            ContentReference::Chunked { .. } => panic!("Expected Referenced, not Chunked"),
        }
    }

    #[test]
    fn test_classify_content_referenced_max_size() {
        // Maximum size for Referenced: exactly 1MB
        use crate::storage::blob::CHUNK_SIZE;
        let data = vec![b'x'; CHUNK_SIZE];
        match classify_content(&data) {
            ContentReference::Inline(_) => panic!("Expected Referenced"),
            ContentReference::Referenced { size, .. } => {
                assert_eq!(size, CHUNK_SIZE as u32);
            }
            ContentReference::Chunked { .. } => panic!("Expected Referenced, not Chunked"),
        }
    }

    #[test]
    fn test_classify_content_chunked() {
        // Just over 1MB should be chunked
        use crate::storage::blob::CHUNK_SIZE;
        let data = vec![b'x'; CHUNK_SIZE + 1];
        match classify_content(&data) {
            ContentReference::Inline(_) => panic!("Expected Chunked"),
            ContentReference::Referenced { .. } => panic!("Expected Chunked"),
            ContentReference::Chunked {
                total_size,
                chunk_count,
                mime_type,
                ..
            } => {
                assert_eq!(total_size, (CHUNK_SIZE + 1) as u64);
                assert_eq!(chunk_count, 2); // 1MB + 1 byte = 2 chunks
                assert!(mime_type.is_none());
            }
        }
    }

    #[test]
    fn test_classify_content_with_mime() {
        let data = vec![b'x'; 2000];
        match classify_content_with_mime(&data, "application/octet-stream") {
            ContentReference::Inline(_) => panic!("Expected Referenced"),
            ContentReference::Referenced { mime_type, .. } => {
                assert_eq!(mime_type, Some("application/octet-stream".to_string()));
            }
            ContentReference::Chunked { .. } => panic!("Expected Referenced"),
        }
    }

    #[test]
    fn test_classify_content_chunked_with_mime() {
        use crate::storage::blob::CHUNK_SIZE;
        let data = vec![b'x'; 2 * CHUNK_SIZE];
        match classify_content_with_mime(&data, "video/mp4") {
            ContentReference::Inline(_) => panic!("Expected Chunked"),
            ContentReference::Referenced { .. } => panic!("Expected Chunked"),
            ContentReference::Chunked {
                total_size,
                chunk_count,
                mime_type,
                ..
            } => {
                assert_eq!(total_size, (2 * CHUNK_SIZE) as u64);
                assert_eq!(chunk_count, 2);
                assert_eq!(mime_type, Some("video/mp4".to_string()));
            }
        }
    }

    #[test]
    fn test_verify_content_valid() {
        let data = b"test content";
        let hash = ContentBlobHash::compute(data);
        assert!(verify_content(data, &hash).is_ok());
    }

    #[test]
    fn test_verify_content_invalid() {
        let data = b"test content";
        let wrong_hash = ContentBlobHash::compute(b"wrong");
        assert!(matches!(
            verify_content(data, &wrong_hash),
            Err(ContentAddressingError::HashMismatch { .. })
        ));
    }

    #[test]
    fn test_compute_hash() {
        let data = b"test data";
        let hash = compute_hash(data);
        assert_eq!(hash, ContentBlobHash::compute(data));
    }

    #[test]
    fn test_hash_format() {
        let hash = ContentBlobHash::compute(b"test");
        let s = hash.to_hash_string();
        assert!(s.starts_with("sha256:"));
        assert_eq!(s.len(), 7 + 64); // sha256: + 64 hex chars
    }

    #[test]
    fn test_content_address_hash_alias() {
        // Verify ContentAddressHash is the same type as ContentBlobHash
        let hash: ContentAddressHash = ContentBlobHash::compute(b"test");
        let hash2: ContentBlobHash = hash;
        assert_eq!(hash, hash2);
    }

    #[test]
    fn test_content_reference_inline_equality() {
        let ref1 = ContentReference::Inline(vec![1, 2, 3]);
        let ref2 = ContentReference::Inline(vec![1, 2, 3]);
        let ref3 = ContentReference::Inline(vec![4, 5, 6]);
        assert_eq!(ref1, ref2);
        assert_ne!(ref1, ref3);
    }

    #[test]
    fn test_content_reference_referenced_equality() {
        let hash = ContentBlobHash::compute(b"test");
        let ref1 = ContentReference::Referenced {
            hash,
            size: 100,
            mime_type: Some("text/plain".to_string()),
        };
        let ref2 = ContentReference::Referenced {
            hash,
            size: 100,
            mime_type: Some("text/plain".to_string()),
        };
        assert_eq!(ref1, ref2);
    }
}
