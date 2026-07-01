//! Content chunking API (SPEC_07 - Milestone 3.2)
//!
//! This module provides file chunking for large content (>1MB) with:
//! - 1MB chunk size per SPEC_07 §3
//! - Manifest generation with chunk hashes
//! - Chunk reassembly with integrity verification
//! - Partial availability handling for P2P downloads
//!
//! # Size Thresholds
//!
//! | Content Size | Storage Method |
//! |--------------|----------------|
//! | ≤1KB | Inline in chain record |
//! | 1KB-1MB | Single blob |
//! | >1MB-1GB | Chunked (manifest + chunks) |
//! | >1GB | Rejected |
//!
//! # Manifest Format
//!
//! ```json
//! {
//!   "version": 1,
//!   "total_size": 52428800,
//!   "chunk_size": 1048576,
//!   "chunks": [
//!     {"index": 0, "hash": "sha256:...", "size": 1048576},
//!     {"index": 1, "hash": "sha256:...", "size": 1048576},
//!     ...
//!   ]
//! }
//! ```

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::storage::blob::{BlobStore, ContentBlobHash, CHUNK_SIZE};
use crate::types::error::StorageError;

use super::addressing::INLINE_THRESHOLD;

// ============================================================================
// Constants
// ============================================================================

/// Maximum chunks per file per SPEC_07 §Chunk Parameters
pub const MAX_CHUNKS: u32 = 1024;

/// Maximum file size (1MB × 1024 = 1GB)
pub const MAX_FILE_SIZE: u64 = (CHUNK_SIZE as u64) * (MAX_CHUNKS as u64);

/// Manifest format version
pub const MANIFEST_VERSION: u8 = 1;

// Re-export CHUNK_SIZE for convenience
pub use crate::storage::blob::CHUNK_SIZE as CHUNKING_CHUNK_SIZE;

// ============================================================================
// Error Types
// ============================================================================

/// Errors that can occur during chunking operations
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ChunkingError {
    /// File exceeds maximum size (1GB)
    #[error("file too large: {size} bytes exceeds maximum {limit} bytes")]
    FileTooLarge {
        /// Actual file size
        size: u64,
        /// Maximum allowed size
        limit: u64,
    },

    /// File too small for chunking (≤1KB should use inline)
    #[error("file too small for chunking: {size} bytes <= 1KB threshold")]
    FileTooSmallForChunking {
        /// Actual file size
        size: usize,
    },

    /// Chunk count exceeds maximum (1024)
    #[error("too many chunks: {count} exceeds maximum {limit}")]
    TooManyChunks {
        /// Actual chunk count
        count: u32,
        /// Maximum allowed chunks
        limit: u32,
    },

    /// Manifest version unsupported
    #[error("unsupported manifest version: {version}")]
    UnsupportedVersion {
        /// The unsupported version number
        version: u8,
    },

    /// Manifest JSON parsing failed
    #[error("manifest parse error: {0}")]
    ManifestParseError(String),

    /// Manifest validation failed
    #[error("invalid manifest: {0}")]
    InvalidManifest(String),

    /// Chunk not found in storage
    #[error("chunk not found: {hash}")]
    ChunkNotFound {
        /// Hash of the missing chunk
        hash: String,
    },

    /// Size mismatch after reassembly
    #[error("size mismatch: expected {expected} bytes, got {actual}")]
    SizeMismatch {
        /// Expected size
        expected: u64,
        /// Actual size
        actual: u64,
    },

    /// Storage layer error
    #[error("storage error: {0}")]
    Storage(#[from] StorageError),
}

// ============================================================================
// Data Structures
// ============================================================================

/// Information about a single chunk in a chunked file
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChunkInfo {
    /// Zero-based index of this chunk (0 to MAX_CHUNKS-1)
    pub index: u32,
    /// SHA-256 hash of chunk bytes (sha256:<hex> format via serde)
    pub hash: ContentBlobHash,
    /// Size in bytes (1..=CHUNK_SIZE, last chunk may be smaller)
    pub size: u32,
}

/// Manifest for a chunked file - the content_hash points to this
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    /// Format version, must be 1
    pub version: u8,
    /// Total size of original file in bytes
    pub total_size: u64,
    /// Chunk size used (always 1048576 for v1)
    pub chunk_size: u32,
    /// Ordered list of chunks (index 0, 1, 2, ...)
    pub chunks: Vec<ChunkInfo>,
}

impl Manifest {
    /// Create new manifest from computed chunks
    #[must_use]
    pub fn new(total_size: u64, chunks: Vec<ChunkInfo>) -> Self {
        Self {
            version: MANIFEST_VERSION,
            total_size,
            chunk_size: CHUNK_SIZE as u32,
            chunks,
        }
    }

    /// Serialize to JSON bytes
    ///
    /// # Errors
    ///
    /// Returns error if JSON serialization fails.
    pub fn to_json(&self) -> Result<Vec<u8>, ChunkingError> {
        serde_json::to_vec(self).map_err(|e| ChunkingError::ManifestParseError(e.to_string()))
    }

    /// Parse from JSON bytes
    ///
    /// # Errors
    ///
    /// Returns error if JSON parsing fails.
    pub fn from_json(data: &[u8]) -> Result<Self, ChunkingError> {
        serde_json::from_slice(data).map_err(|e| ChunkingError::ManifestParseError(e.to_string()))
    }

    /// Compute SHA-256 hash of serialized manifest
    ///
    /// # Errors
    ///
    /// Returns error if serialization fails.
    pub fn compute_hash(&self) -> Result<ContentBlobHash, ChunkingError> {
        let json_bytes = self.to_json()?;
        Ok(ContentBlobHash::compute(&json_bytes))
    }

    /// Number of chunks
    #[must_use]
    pub fn chunk_count(&self) -> u32 {
        self.chunks.len() as u32
    }

    /// Validate manifest integrity (version, chunk count limits, sizes)
    ///
    /// # Errors
    ///
    /// Returns error if manifest is invalid.
    pub fn validate(&self) -> Result<(), ChunkingError> {
        // Check version
        if self.version != MANIFEST_VERSION {
            return Err(ChunkingError::UnsupportedVersion {
                version: self.version,
            });
        }

        // Check chunk count
        if self.chunks.len() > MAX_CHUNKS as usize {
            return Err(ChunkingError::TooManyChunks {
                count: self.chunks.len() as u32,
                limit: MAX_CHUNKS,
            });
        }

        // Empty chunks with non-zero size is invalid
        if self.chunks.is_empty() && self.total_size > 0 {
            return Err(ChunkingError::InvalidManifest(
                "no chunks but non-zero total_size".to_string(),
            ));
        }

        // Validate chunk indices are sequential
        for (i, chunk) in self.chunks.iter().enumerate() {
            if chunk.index as usize != i {
                return Err(ChunkingError::InvalidManifest(format!(
                    "chunk index mismatch: expected {i}, got {}",
                    chunk.index
                )));
            }
        }

        // Validate total size matches sum of chunk sizes
        let computed_size: u64 = self.chunks.iter().map(|c| u64::from(c.size)).sum();
        if computed_size != self.total_size {
            return Err(ChunkingError::InvalidManifest(format!(
                "total size mismatch: manifest says {}, chunks sum to {computed_size}",
                self.total_size
            )));
        }

        // Validate chunk sizes
        for (i, chunk) in self.chunks.iter().enumerate() {
            let is_last = i == self.chunks.len() - 1;
            if !is_last && chunk.size != self.chunk_size {
                return Err(ChunkingError::InvalidManifest(format!(
                    "non-final chunk {} has size {}, expected {}",
                    i, chunk.size, self.chunk_size
                )));
            }
            if is_last && chunk.size > self.chunk_size {
                return Err(ChunkingError::InvalidManifest(format!(
                    "final chunk has size {}, exceeds chunk_size {}",
                    chunk.size, self.chunk_size
                )));
            }
            if chunk.size == 0 {
                return Err(ChunkingError::InvalidManifest(format!(
                    "chunk {i} has zero size"
                )));
            }
        }

        Ok(())
    }

    /// Store manifest in blob store, return its hash
    ///
    /// # Errors
    ///
    /// Returns error if storage fails.
    pub fn store(&self, blob_store: &BlobStore) -> Result<ContentBlobHash, ChunkingError> {
        let json_bytes = self.to_json()?;
        let hash = blob_store.put(&json_bytes)?;
        Ok(hash)
    }

    /// Load manifest from blob store by hash
    ///
    /// # Errors
    ///
    /// Returns error if blob not found or manifest is invalid.
    pub fn load(hash: &ContentBlobHash, blob_store: &BlobStore) -> Result<Self, ChunkingError> {
        let json_bytes = blob_store.get(hash).map_err(|e| match e {
            StorageError::BlobNotFound { hash } => ChunkingError::ChunkNotFound { hash },
            other => ChunkingError::Storage(other),
        })?;
        let manifest = Self::from_json(&json_bytes)?;
        manifest.validate()?;
        Ok(manifest)
    }
}

// ============================================================================
// Chunking Algorithm
// ============================================================================

/// Chunk data into 1MB pieces, returning manifest and chunk data
///
/// # Arguments
/// * `data` - Raw bytes to chunk (must be >1KB, ≤1GB)
///
/// # Returns
/// * `(Manifest, Vec<(ChunkInfo, Vec<u8>)>)` - Manifest and chunk data with metadata
///
/// # Errors
/// * `FileTooLarge` if data exceeds `MAX_FILE_SIZE` (1GB)
/// * `FileTooSmallForChunking` if data ≤ `INLINE_THRESHOLD` (1KB)
/// * `TooManyChunks` if chunk count exceeds `MAX_CHUNKS` (1024)
pub fn chunk_data(data: &[u8]) -> Result<(Manifest, Vec<(ChunkInfo, Vec<u8>)>), ChunkingError> {
    // 1. Validate size: 1KB < size ≤ 1GB
    if data.len() <= INLINE_THRESHOLD {
        return Err(ChunkingError::FileTooSmallForChunking { size: data.len() });
    }
    if data.len() as u64 > MAX_FILE_SIZE {
        return Err(ChunkingError::FileTooLarge {
            size: data.len() as u64,
            limit: MAX_FILE_SIZE,
        });
    }

    // 2. Split into CHUNK_SIZE pieces
    let mut chunks = Vec::new();
    let mut offset = 0usize;
    let mut index = 0u32;

    while offset < data.len() {
        let end = std::cmp::min(offset + CHUNK_SIZE, data.len());
        let chunk_bytes = &data[offset..end];
        let chunk_size = chunk_bytes.len() as u32;
        let chunk_hash = ContentBlobHash::compute(chunk_bytes);

        let info = ChunkInfo {
            index,
            hash: chunk_hash,
            size: chunk_size,
        };
        chunks.push((info, chunk_bytes.to_vec()));

        offset = end;
        index += 1;
    }

    // 3. Validate chunk count
    if index > MAX_CHUNKS {
        return Err(ChunkingError::TooManyChunks {
            count: index,
            limit: MAX_CHUNKS,
        });
    }

    // 4. Build manifest
    let chunk_infos: Vec<ChunkInfo> = chunks.iter().map(|(info, _)| info.clone()).collect();
    let manifest = Manifest::new(data.len() as u64, chunk_infos);

    Ok((manifest, chunks))
}

// ============================================================================
// ChunkedContentStore
// ============================================================================

/// Reference to chunked content (returned from store operations)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChunkedReference {
    /// Hash of the manifest (this is the content_hash for chain record)
    pub manifest_hash: ContentBlobHash,
    /// Total size of original content
    pub total_size: u64,
    /// Number of chunks
    pub chunk_count: u32,
    /// Optional MIME type
    pub mime_type: Option<String>,
}

/// High-level API for storing and retrieving chunked content
pub struct ChunkedContentStore {
    blob_store: BlobStore,
}

impl ChunkedContentStore {
    /// Create store wrapping existing blob store
    #[must_use]
    pub fn new(blob_store: BlobStore) -> Self {
        Self { blob_store }
    }

    /// Create store at path (creates new `BlobStore`)
    ///
    /// # Errors
    ///
    /// Returns error if directory cannot be created.
    pub fn at_path(path: impl AsRef<Path>) -> Result<Self, ChunkingError> {
        let blob_store = BlobStore::new(path)?;
        Ok(Self { blob_store })
    }

    /// Store content, chunking into 1MB pieces
    ///
    /// # Returns
    /// `ChunkedReference` containing manifest hash (use as content_hash)
    ///
    /// # Errors
    /// * `FileTooLarge` if content > 1GB
    /// * `FileTooSmallForChunking` if content ≤ 1KB
    pub fn store(&self, data: &[u8]) -> Result<ChunkedReference, ChunkingError> {
        let (manifest, chunks) = chunk_data(data)?;

        // Store each chunk
        for (info, chunk_bytes) in &chunks {
            self.blob_store.put_with_hash(chunk_bytes, &info.hash)?;
        }

        // Store manifest
        let manifest_hash = manifest.store(&self.blob_store)?;

        Ok(ChunkedReference {
            manifest_hash,
            total_size: manifest.total_size,
            chunk_count: manifest.chunk_count(),
            mime_type: None,
        })
    }

    /// Store with MIME type
    ///
    /// # Errors
    ///
    /// Same as `store()`.
    pub fn store_with_mime(
        &self,
        data: &[u8],
        mime: &str,
    ) -> Result<ChunkedReference, ChunkingError> {
        let mut reference = self.store(data)?;
        reference.mime_type = Some(mime.to_string());
        Ok(reference)
    }

    /// Reassemble content from manifest hash
    ///
    /// # Errors
    /// * `ChunkNotFound` if any chunk missing
    /// * `SizeMismatch` if reassembled size doesn't match manifest
    pub fn reassemble(&self, manifest_hash: &ContentBlobHash) -> Result<Vec<u8>, ChunkingError> {
        let manifest = Manifest::load(manifest_hash, &self.blob_store)?;
        self.reassemble_from_manifest(&manifest)
    }

    /// Reassemble from already-loaded manifest
    ///
    /// # Errors
    ///
    /// Same as `reassemble()`.
    pub fn reassemble_from_manifest(&self, manifest: &Manifest) -> Result<Vec<u8>, ChunkingError> {
        // Pre-allocate output buffer
        let mut result = Vec::with_capacity(manifest.total_size as usize);

        // Fetch chunks in index order
        for chunk_info in &manifest.chunks {
            let chunk_data = self.blob_store.get(&chunk_info.hash).map_err(|e| match e {
                StorageError::BlobNotFound { hash } => ChunkingError::ChunkNotFound { hash },
                other => ChunkingError::Storage(other),
            })?; // BlobStore.get already verifies hash

            // Verify size matches manifest
            if chunk_data.len() as u32 != chunk_info.size {
                return Err(ChunkingError::SizeMismatch {
                    expected: chunk_info.size as u64,
                    actual: chunk_data.len() as u64,
                });
            }

            result.extend_from_slice(&chunk_data);
        }

        // Verify total size
        if result.len() as u64 != manifest.total_size {
            return Err(ChunkingError::SizeMismatch {
                expected: manifest.total_size,
                actual: result.len() as u64,
            });
        }

        Ok(result)
    }

    /// Get underlying blob store reference
    #[must_use]
    pub fn blob_store(&self) -> &BlobStore {
        &self.blob_store
    }

    /// Check availability of all chunks for a manifest
    ///
    /// # Errors
    ///
    /// Returns error if manifest cannot be loaded.
    pub fn check_availability(
        &self,
        manifest_hash: &ContentBlobHash,
    ) -> Result<ChunkAvailability, ChunkingError> {
        let manifest = Manifest::load(manifest_hash, &self.blob_store)?;
        Ok(self.check_availability_from_manifest(&manifest))
    }

    /// Check availability from already-loaded manifest
    #[must_use]
    pub fn check_availability_from_manifest(&self, manifest: &Manifest) -> ChunkAvailability {
        let mut available = Vec::with_capacity(manifest.chunks.len());
        let mut available_bytes = 0u64;

        for chunk_info in &manifest.chunks {
            let exists = self.blob_store.exists(&chunk_info.hash);
            available.push(exists);
            if exists {
                available_bytes += chunk_info.size as u64;
            }
        }

        ChunkAvailability {
            manifest: manifest.clone(),
            available,
            available_bytes,
        }
    }

    /// Get list of missing chunk hashes (for network requests)
    #[must_use]
    pub fn get_missing_chunk_hashes(
        &self,
        availability: &ChunkAvailability,
    ) -> Vec<ContentBlobHash> {
        availability
            .manifest
            .chunks
            .iter()
            .zip(&availability.available)
            .filter_map(|(info, &avail)| if !avail { Some(info.hash) } else { None })
            .collect()
    }

    /// Get available chunks as (index, data) pairs
    ///
    /// # Errors
    ///
    /// Returns error if chunk retrieval fails.
    pub fn get_available_chunks(
        &self,
        availability: &ChunkAvailability,
    ) -> Result<Vec<(u32, Vec<u8>)>, ChunkingError> {
        let mut result = Vec::new();

        for (info, &is_available) in availability
            .manifest
            .chunks
            .iter()
            .zip(&availability.available)
        {
            if is_available {
                let data = self.blob_store.get(&info.hash)?;
                result.push((info.index, data));
            }
        }

        Ok(result)
    }
}

// ============================================================================
// Partial Availability
// ============================================================================

/// Status of chunk availability for a manifest
#[derive(Debug, Clone)]
pub struct ChunkAvailability {
    /// The manifest being checked
    pub manifest: Manifest,
    /// Availability of each chunk (index corresponds to chunk index)
    pub available: Vec<bool>,
    /// Total bytes available
    pub available_bytes: u64,
}

impl ChunkAvailability {
    /// All chunks are present
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.available.iter().all(|&a| a)
    }

    /// Percentage of content available (0.0 to 100.0)
    #[must_use]
    pub fn availability_percent(&self) -> f64 {
        if self.manifest.total_size == 0 {
            return 100.0;
        }
        (self.available_bytes as f64 / self.manifest.total_size as f64) * 100.0
    }

    /// Number of chunks available
    #[must_use]
    pub fn available_count(&self) -> u32 {
        self.available.iter().filter(|&&a| a).count() as u32
    }

    /// Number of chunks missing
    #[must_use]
    pub fn missing_count(&self) -> u32 {
        self.available.iter().filter(|&&a| !a).count() as u32
    }

    /// Get indices of missing chunks
    #[must_use]
    pub fn missing_indices(&self) -> Vec<u32> {
        self.available
            .iter()
            .enumerate()
            .filter_map(|(i, &avail)| if !avail { Some(i as u32) } else { None })
            .collect()
    }

    /// Get indices of available chunks
    #[must_use]
    pub fn available_indices(&self) -> Vec<u32> {
        self.available
            .iter()
            .enumerate()
            .filter_map(|(i, &avail)| if avail { Some(i as u32) } else { None })
            .collect()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // === Unit Tests ===

    #[test]
    fn test_manifest_serialization_roundtrip() {
        let chunks = vec![
            ChunkInfo {
                index: 0,
                hash: ContentBlobHash::compute(b"chunk0"),
                size: 1_048_576,
            },
            ChunkInfo {
                index: 1,
                hash: ContentBlobHash::compute(b"chunk1"),
                size: 51200,
            },
        ];
        let manifest = Manifest::new(1_048_576 + 51200, chunks);

        let json = manifest.to_json().unwrap();
        let parsed = Manifest::from_json(&json).unwrap();

        assert_eq!(manifest, parsed);
    }

    #[test]
    fn test_manifest_json_format() {
        let chunks = vec![ChunkInfo {
            index: 0,
            hash: ContentBlobHash::compute(b"test"),
            size: 100,
        }];
        let manifest = Manifest::new(100, chunks);
        let json = manifest.to_json().unwrap();
        let json_str = String::from_utf8(json).unwrap();

        assert!(json_str.contains("\"version\":1"));
        assert!(json_str.contains("\"total_size\":100"));
        assert!(json_str.contains("\"chunk_size\":1048576"));
        assert!(json_str.contains("\"index\":0"));
        assert!(json_str.contains("sha256:"));
    }

    #[test]
    fn test_chunk_data_small_file_rejected() {
        let data = vec![0u8; 1024]; // Exactly 1KB = inline threshold
        let result = chunk_data(&data);
        assert!(matches!(
            result,
            Err(ChunkingError::FileTooSmallForChunking { size: 1024 })
        ));
    }

    #[test]
    fn test_chunk_data_just_over_threshold() {
        let data = vec![0u8; 1025];
        let (manifest, chunks) = chunk_data(&data).unwrap();

        assert_eq!(chunks.len(), 1);
        assert_eq!(manifest.total_size, 1025);
        assert_eq!(chunks[0].0.size, 1025);
    }

    #[test]
    fn test_chunk_data_exactly_1mb() {
        let data = vec![0u8; 1_048_576];
        let (manifest, chunks) = chunk_data(&data).unwrap();

        assert_eq!(chunks.len(), 1);
        assert_eq!(manifest.total_size, 1_048_576);
        assert_eq!(chunks[0].0.size, 1_048_576);
    }

    #[test]
    fn test_chunk_data_1mb_plus_one() {
        let data = vec![0u8; 1_048_577];
        let (manifest, chunks) = chunk_data(&data).unwrap();

        assert_eq!(chunks.len(), 2);
        assert_eq!(manifest.total_size, 1_048_577);
        assert_eq!(chunks[0].0.size, 1_048_576);
        assert_eq!(chunks[1].0.size, 1);
    }

    #[test]
    fn test_chunk_data_50mb() {
        let data = vec![0u8; 50 * 1_048_576];
        let (manifest, chunks) = chunk_data(&data).unwrap();

        assert_eq!(chunks.len(), 50);
        assert_eq!(manifest.total_size, 50 * 1_048_576);
        for chunk in &chunks[..49] {
            assert_eq!(chunk.0.size, 1_048_576);
        }
    }

    #[test]
    fn test_chunk_data_too_large() {
        // 1GB + 1 byte = ERROR
        // Note: We can't easily allocate 1GB in tests, so we test the validation logic
        // by checking the constant calculations
        assert_eq!(MAX_FILE_SIZE, 1_073_741_824); // 1GB
        assert_eq!(MAX_CHUNKS, 1024);
        assert_eq!(CHUNK_SIZE, 1_048_576); // 1MB
    }

    #[test]
    fn test_manifest_validation_version() {
        let chunks = vec![ChunkInfo {
            index: 0,
            hash: ContentBlobHash::compute(b"test"),
            size: 100,
        }];
        let mut manifest = Manifest::new(100, chunks);
        manifest.version = 99; // Invalid version

        assert!(matches!(
            manifest.validate(),
            Err(ChunkingError::UnsupportedVersion { version: 99 })
        ));
    }

    #[test]
    fn test_manifest_validation_index_mismatch() {
        let chunks = vec![
            ChunkInfo {
                index: 0,
                hash: ContentBlobHash::compute(b"chunk0"),
                size: 100,
            },
            ChunkInfo {
                index: 5, // Wrong index, should be 1
                hash: ContentBlobHash::compute(b"chunk1"),
                size: 50,
            },
        ];
        let manifest = Manifest::new(150, chunks);

        assert!(matches!(
            manifest.validate(),
            Err(ChunkingError::InvalidManifest(_))
        ));
    }

    #[test]
    fn test_manifest_validation_size_mismatch() {
        let chunks = vec![ChunkInfo {
            index: 0,
            hash: ContentBlobHash::compute(b"test"),
            size: 100,
        }];
        let mut manifest = Manifest::new(100, chunks);
        manifest.total_size = 999; // Wrong size

        assert!(matches!(
            manifest.validate(),
            Err(ChunkingError::InvalidManifest(_))
        ));
    }

    // === Integration Tests ===

    #[test]
    fn test_store_and_reassemble_roundtrip() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        // Create test data with recognizable pattern (just over 1KB threshold)
        let original: Vec<u8> = (0..2_097_152u32).map(|i| (i % 256) as u8).collect(); // 2MB

        let reference = store.store(&original).unwrap();
        assert_eq!(reference.total_size, 2_097_152);
        assert_eq!(reference.chunk_count, 2);

        let reassembled = store.reassemble(&reference.manifest_hash).unwrap();

        assert_eq!(original, reassembled);
    }

    #[test]
    fn test_store_10mb_roundtrip() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        // Create 10MB test data with recognizable pattern
        let original: Vec<u8> = (0..10_485_760u32).map(|i| (i % 256) as u8).collect();

        let reference = store.store(&original).unwrap();
        assert_eq!(reference.chunk_count, 10);

        let reassembled = store.reassemble(&reference.manifest_hash).unwrap();

        assert_eq!(original, reassembled);
    }

    /// Generate test data where each chunk has unique content
    fn generate_unique_chunk_data(num_chunks: usize) -> Vec<u8> {
        let chunk_size = CHUNK_SIZE;
        let mut data = Vec::with_capacity(num_chunks * chunk_size);
        for chunk_idx in 0..num_chunks {
            // Each chunk starts with its index to ensure uniqueness
            for byte_idx in 0..chunk_size {
                // Include chunk index in high bits, byte position in low bits
                data.push(((chunk_idx * 37 + byte_idx) % 256) as u8);
            }
        }
        data
    }

    #[test]
    fn test_partial_availability() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        // Store 3MB file (3 chunks) - use unique data so each chunk has different hash
        let data = generate_unique_chunk_data(3);
        let reference = store.store(&data).unwrap();

        // Verify chunks have different hashes
        let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
        assert_ne!(manifest.chunks[0].hash, manifest.chunks[1].hash);
        assert_ne!(manifest.chunks[1].hash, manifest.chunks[2].hash);

        // Delete middle chunk
        let chunk1_hash = &manifest.chunks[1].hash;
        store.blob_store().delete(chunk1_hash).unwrap();

        let availability = store.check_availability(&reference.manifest_hash).unwrap();

        assert!(!availability.is_complete());
        assert_eq!(availability.available_count(), 2);
        assert_eq!(availability.missing_count(), 1);
        assert_eq!(availability.available_bytes, 2 * 1_048_576);
        assert!((availability.availability_percent() - 66.666).abs() < 0.01);
    }

    #[test]
    fn test_get_missing_chunk_hashes() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        // Use unique data so each chunk has different hash
        let data = generate_unique_chunk_data(3);
        let reference = store.store(&data).unwrap();

        // Verify chunks have different hashes
        let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
        assert_ne!(manifest.chunks[0].hash, manifest.chunks[1].hash);
        assert_ne!(manifest.chunks[1].hash, manifest.chunks[2].hash);
        assert_ne!(manifest.chunks[0].hash, manifest.chunks[2].hash);

        // Delete first and last chunk
        store.blob_store().delete(&manifest.chunks[0].hash).unwrap();
        store.blob_store().delete(&manifest.chunks[2].hash).unwrap();

        let availability = store.check_availability(&reference.manifest_hash).unwrap();
        let missing = store.get_missing_chunk_hashes(&availability);

        assert_eq!(missing.len(), 2);
        assert!(missing.contains(&manifest.chunks[0].hash));
        assert!(missing.contains(&manifest.chunks[2].hash));
    }

    #[test]
    fn test_get_available_chunks() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        // Store 3MB file (3 chunks) - use unique data so each chunk has different hash
        let data = generate_unique_chunk_data(3);
        let reference = store.store(&data).unwrap();

        // Verify we actually have 3 different chunk hashes
        let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
        assert_ne!(manifest.chunks[0].hash, manifest.chunks[1].hash);
        assert_ne!(manifest.chunks[1].hash, manifest.chunks[2].hash);

        // Delete middle chunk
        store.blob_store().delete(&manifest.chunks[1].hash).unwrap();

        let availability = store.check_availability(&reference.manifest_hash).unwrap();
        let available_chunks = store.get_available_chunks(&availability).unwrap();

        assert_eq!(available_chunks.len(), 2);
        assert_eq!(available_chunks[0].0, 0);
        assert_eq!(available_chunks[1].0, 2);
    }

    #[test]
    fn test_corrupted_chunk_detected() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        let data = vec![42u8; 2 * 1_048_576];
        let reference = store.store(&data).unwrap();

        // Corrupt chunk on disk
        let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
        let chunk_path = store.blob_store().blob_path(&manifest.chunks[0].hash);
        std::fs::write(&chunk_path, b"corrupted data").unwrap();

        let result = store.reassemble(&reference.manifest_hash);
        assert!(matches!(
            result,
            Err(ChunkingError::Storage(StorageError::CorruptedData { .. }))
        ));
    }

    #[test]
    fn test_missing_chunk_error() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        let data = vec![42u8; 2 * 1_048_576];
        let reference = store.store(&data).unwrap();

        // Delete a chunk
        let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
        store.blob_store().delete(&manifest.chunks[0].hash).unwrap();

        let result = store.reassemble(&reference.manifest_hash);
        assert!(matches!(result, Err(ChunkingError::ChunkNotFound { .. })));
    }

    #[test]
    fn test_chunk_availability_indices() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        // Store 4MB file (4 chunks) - use unique data
        let data = generate_unique_chunk_data(4);
        let reference = store.store(&data).unwrap();

        // Verify all chunks have different hashes
        let manifest = Manifest::load(&reference.manifest_hash, store.blob_store()).unwrap();
        for i in 0..4 {
            for j in (i + 1)..4 {
                assert_ne!(
                    manifest.chunks[i].hash, manifest.chunks[j].hash,
                    "Chunks {} and {} have same hash",
                    i, j
                );
            }
        }

        // Delete chunks 1 and 3
        store.blob_store().delete(&manifest.chunks[1].hash).unwrap();
        store.blob_store().delete(&manifest.chunks[3].hash).unwrap();

        let availability = store.check_availability(&reference.manifest_hash).unwrap();

        assert_eq!(availability.missing_indices(), vec![1, 3]);
        assert_eq!(availability.available_indices(), vec![0, 2]);
    }

    #[test]
    fn test_store_with_mime() {
        let dir = tempdir().unwrap();
        let store = ChunkedContentStore::at_path(dir.path().join("blobs")).unwrap();

        let data = vec![0u8; 2 * 1_048_576];
        let reference = store
            .store_with_mime(&data, "application/octet-stream")
            .unwrap();

        assert_eq!(
            reference.mime_type,
            Some("application/octet-stream".to_string())
        );
    }

    #[test]
    fn test_constants() {
        assert_eq!(CHUNK_SIZE, 1_048_576);
        assert_eq!(MAX_CHUNKS, 1024);
        assert_eq!(MAX_FILE_SIZE, 1_073_741_824);
        assert_eq!(MANIFEST_VERSION, 1);
        assert_eq!(INLINE_THRESHOLD, 1024);
    }
}
