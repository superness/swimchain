//! Chunk manifest for large files (SPEC_07 - Milestone 1.6)
//!
//! Handles splitting large content into chunks and reassembling them.

use serde::{Deserialize, Serialize};

use super::blob::{ContentBlobHash, CHUNK_SIZE};
use crate::types::error::StorageError;

/// Chunk manifest for large files
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Manifest {
    /// Manifest format version
    pub version: u8,
    /// Total size of the complete content in bytes
    pub total_size: u64,
    /// Size of each chunk (except possibly the last)
    pub chunk_size: u32,
    /// Ordered list of chunk information
    pub chunks: Vec<ChunkInfo>,
}

/// Information about a single chunk
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChunkInfo {
    /// Index of this chunk (0-based)
    pub index: u32,
    /// Hash of this chunk in sha256:<hex> format
    pub hash: String,
    /// Size of this chunk in bytes
    pub size: u32,
}

impl Manifest {
    /// Current manifest format version
    pub const CURRENT_VERSION: u8 = 1;

    /// Create manifest from data, splitting into chunks
    ///
    /// Returns the manifest and a list of (chunk_data, chunk_hash) pairs
    /// that need to be stored.
    #[must_use]
    pub fn from_data(data: &[u8], chunk_size: usize) -> (Self, Vec<(Vec<u8>, ContentBlobHash)>) {
        let mut chunks = Vec::new();
        let mut chunk_data_list = Vec::new();

        for (index, chunk) in data.chunks(chunk_size).enumerate() {
            let hash = ContentBlobHash::compute(chunk);
            chunks.push(ChunkInfo {
                index: index as u32,
                hash: hash.to_hash_string(),
                size: chunk.len() as u32,
            });
            chunk_data_list.push((chunk.to_vec(), hash));
        }

        let manifest = Self {
            version: Self::CURRENT_VERSION,
            total_size: data.len() as u64,
            chunk_size: chunk_size as u32,
            chunks,
        };

        (manifest, chunk_data_list)
    }

    /// Create manifest with default chunk size (1MB)
    #[must_use]
    pub fn from_data_default(data: &[u8]) -> (Self, Vec<(Vec<u8>, ContentBlobHash)>) {
        Self::from_data(data, CHUNK_SIZE)
    }

    /// Validate manifest structure
    ///
    /// # Errors
    ///
    /// Returns error if manifest is invalid.
    pub fn validate(&self) -> Result<(), StorageError> {
        if self.version != Self::CURRENT_VERSION {
            return Err(StorageError::SerializationError(format!(
                "unsupported manifest version: {}",
                self.version
            )));
        }

        if self.chunks.is_empty() && self.total_size > 0 {
            return Err(StorageError::SerializationError(
                "manifest has no chunks but non-zero size".to_string(),
            ));
        }

        // Validate chunk indices are sequential
        for (i, chunk) in self.chunks.iter().enumerate() {
            if chunk.index as usize != i {
                return Err(StorageError::SerializationError(format!(
                    "chunk index mismatch: expected {i}, got {}",
                    chunk.index
                )));
            }

            // Validate hash format
            ContentBlobHash::from_hash_string(&chunk.hash)?;
        }

        // Validate total size matches sum of chunk sizes
        let computed_size: u64 = self.chunks.iter().map(|c| u64::from(c.size)).sum();
        if computed_size != self.total_size {
            return Err(StorageError::SerializationError(format!(
                "total size mismatch: manifest says {}, chunks sum to {computed_size}",
                self.total_size
            )));
        }

        // Validate chunk sizes
        for (i, chunk) in self.chunks.iter().enumerate() {
            let is_last = i == self.chunks.len() - 1;
            if !is_last && chunk.size != self.chunk_size {
                return Err(StorageError::SerializationError(format!(
                    "non-final chunk {} has size {}, expected {}",
                    i, chunk.size, self.chunk_size
                )));
            }
            if is_last && chunk.size > self.chunk_size {
                return Err(StorageError::SerializationError(format!(
                    "final chunk has size {}, exceeds chunk_size {}",
                    chunk.size, self.chunk_size
                )));
            }
        }

        Ok(())
    }

    /// Get the number of chunks
    #[must_use]
    pub fn chunk_count(&self) -> usize {
        self.chunks.len()
    }

    /// Get chunk hash by index
    ///
    /// # Errors
    ///
    /// Returns error if index is out of bounds or hash is invalid.
    pub fn get_chunk_hash(&self, index: usize) -> Result<ContentBlobHash, StorageError> {
        let chunk = self.chunks.get(index).ok_or_else(|| {
            StorageError::SerializationError(format!("chunk index {index} out of bounds"))
        })?;
        ContentBlobHash::from_hash_string(&chunk.hash)
    }

    /// Compute manifest hash for storage
    #[must_use]
    pub fn compute_hash(&self) -> ContentBlobHash {
        let data = serde_json::to_vec(self).expect("manifest serialization cannot fail");
        ContentBlobHash::compute(&data)
    }

    /// Serialize manifest to JSON bytes
    ///
    /// # Errors
    ///
    /// Returns error if serialization fails.
    pub fn to_bytes(&self) -> Result<Vec<u8>, StorageError> {
        serde_json::to_vec(self).map_err(StorageError::from)
    }

    /// Deserialize manifest from JSON bytes
    ///
    /// # Errors
    ///
    /// Returns error if deserialization fails.
    pub fn from_bytes(data: &[u8]) -> Result<Self, StorageError> {
        serde_json::from_slice(data).map_err(StorageError::from)
    }
}

/// Reassemble chunks into original data
///
/// # Errors
///
/// Returns error if chunk sizes don't match manifest.
pub fn reassemble_chunks(manifest: &Manifest, chunks: &[Vec<u8>]) -> Result<Vec<u8>, StorageError> {
    if chunks.len() != manifest.chunks.len() {
        return Err(StorageError::SerializationError(format!(
            "chunk count mismatch: manifest has {}, got {}",
            manifest.chunks.len(),
            chunks.len()
        )));
    }

    let mut data = Vec::with_capacity(manifest.total_size as usize);

    for (i, (chunk_info, chunk_data)) in manifest.chunks.iter().zip(chunks.iter()).enumerate() {
        if chunk_data.len() != chunk_info.size as usize {
            return Err(StorageError::SerializationError(format!(
                "chunk {i} size mismatch: expected {}, got {}",
                chunk_info.size,
                chunk_data.len()
            )));
        }

        // Verify hash
        let hash = ContentBlobHash::compute(chunk_data);
        if hash.to_hash_string() != chunk_info.hash {
            return Err(StorageError::CorruptedData {
                expected: chunk_info.hash.clone(),
                actual: hash.to_hash_string(),
            });
        }

        data.extend_from_slice(chunk_data);
    }

    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_from_small_data() {
        let data = b"hello world";
        let (manifest, chunks) = Manifest::from_data(data, 1024);

        assert_eq!(manifest.version, Manifest::CURRENT_VERSION);
        assert_eq!(manifest.total_size, data.len() as u64);
        assert_eq!(manifest.chunk_size, 1024);
        assert_eq!(manifest.chunks.len(), 1);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].0, data);

        manifest.validate().unwrap();
    }

    #[test]
    fn test_manifest_from_large_data() {
        // 2.5 chunks worth of data
        let data: Vec<u8> = (0..2560).map(|i| (i % 256) as u8).collect();
        let (manifest, chunks) = Manifest::from_data(&data, 1024);

        assert_eq!(manifest.total_size, 2560);
        assert_eq!(manifest.chunk_size, 1024);
        assert_eq!(manifest.chunks.len(), 3);
        assert_eq!(chunks.len(), 3);

        // Check chunk sizes
        assert_eq!(manifest.chunks[0].size, 1024);
        assert_eq!(manifest.chunks[1].size, 1024);
        assert_eq!(manifest.chunks[2].size, 512); // Last chunk is smaller

        manifest.validate().unwrap();
    }

    #[test]
    fn test_manifest_reassemble() {
        let original_data: Vec<u8> = (0..5000).map(|i| (i % 256) as u8).collect();
        let (manifest, chunks) = Manifest::from_data(&original_data, 1024);

        let chunk_data: Vec<Vec<u8>> = chunks.into_iter().map(|(data, _)| data).collect();
        let reassembled = reassemble_chunks(&manifest, &chunk_data).unwrap();

        assert_eq!(reassembled, original_data);
    }

    #[test]
    fn test_manifest_validation_version() {
        let mut manifest = Manifest {
            version: 99, // Invalid version
            total_size: 0,
            chunk_size: 1024,
            chunks: vec![],
        };

        assert!(manifest.validate().is_err());

        manifest.version = Manifest::CURRENT_VERSION;
        manifest.validate().unwrap();
    }

    #[test]
    fn test_manifest_validation_size_mismatch() {
        let data = b"test";
        let (mut manifest, _) = Manifest::from_data(data, 1024);
        manifest.total_size = 999; // Wrong size

        assert!(manifest.validate().is_err());
    }

    #[test]
    fn test_manifest_serialization() {
        let data = b"test data for manifest";
        let (manifest, _) = Manifest::from_data(data, 1024);

        let bytes = manifest.to_bytes().unwrap();
        let parsed = Manifest::from_bytes(&bytes).unwrap();

        assert_eq!(manifest, parsed);
    }

    #[test]
    fn test_manifest_hash() {
        let data = b"test";
        let (manifest, _) = Manifest::from_data(data, 1024);

        let hash1 = manifest.compute_hash();
        let hash2 = manifest.compute_hash();

        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_reassemble_chunk_mismatch() {
        let data: Vec<u8> = (0..2048).map(|i| (i % 256) as u8).collect();
        let (manifest, _) = Manifest::from_data(&data, 1024);

        // Wrong number of chunks
        let result = reassemble_chunks(&manifest, &[vec![0; 1024]]);
        assert!(result.is_err());
    }

    #[test]
    fn test_reassemble_corrupted_chunk() {
        let data: Vec<u8> = (0..2048).map(|i| (i % 256) as u8).collect();
        let (manifest, mut chunks) = Manifest::from_data(&data, 1024);

        let chunk_data: Vec<Vec<u8>> = chunks
            .iter_mut()
            .map(|(data, _)| {
                data[0] ^= 0xFF; // Corrupt first byte
                data.clone()
            })
            .collect();

        let result = reassemble_chunks(&manifest, &chunk_data);
        assert!(matches!(result, Err(StorageError::CorruptedData { .. })));
    }

    #[test]
    fn test_get_chunk_hash() {
        let data = b"test data";
        let (manifest, _) = Manifest::from_data(data, 1024);

        let hash = manifest.get_chunk_hash(0).unwrap();
        assert_eq!(hash.to_hash_string(), manifest.chunks[0].hash);

        let result = manifest.get_chunk_hash(999);
        assert!(result.is_err());
    }
}
