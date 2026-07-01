//! Content-addressed blob storage (SPEC_07 - Milestone 1.6)
//!
//! Stores content blobs using content-addressable storage with SHA-256 hashes.
//! Directory structure: `blobs/sha256/<2-char-prefix>/<remaining-62-chars>`

use std::fmt;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::types::error::StorageError;

/// 1MB chunk size for large files per SPEC_07
pub const CHUNK_SIZE: usize = 1_048_576;

/// Content hash (32 bytes SHA-256)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct ContentBlobHash([u8; 32]);

impl ContentBlobHash {
    /// Create from raw bytes
    #[must_use]
    pub const fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    /// Get the raw bytes
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// Format as sha256:<hex> per SPEC_07
    #[must_use]
    pub fn to_hash_string(&self) -> String {
        format!("sha256:{}", hex::encode(self.0))
    }

    /// Parse from sha256:<hex> format
    ///
    /// # Errors
    ///
    /// Returns error if format is invalid.
    pub fn from_hash_string(s: &str) -> Result<Self, StorageError> {
        let hex_str = s.strip_prefix("sha256:").ok_or_else(|| {
            StorageError::InvalidHashFormat(format!("expected sha256: prefix, got: {s}"))
        })?;

        if hex_str.len() != 64 {
            return Err(StorageError::InvalidHashFormat(format!(
                "expected 64 hex chars, got {}",
                hex_str.len()
            )));
        }

        let bytes = hex::decode(hex_str)
            .map_err(|e| StorageError::InvalidHashFormat(format!("invalid hex: {e}")))?;

        let arr: [u8; 32] = bytes
            .try_into()
            .map_err(|_| StorageError::InvalidHashFormat("expected 32 bytes".to_string()))?;

        Ok(Self(arr))
    }

    /// Compute hash from data
    #[must_use]
    pub fn compute(data: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash: [u8; 32] = hasher.finalize().into();
        Self(hash)
    }

    /// Get 2-character prefix for directory sharding
    #[must_use]
    pub fn prefix(&self) -> String {
        hex::encode(&self.0[0..1]) // First byte = 2 hex chars
    }

    /// Get remaining hash (62 chars) for filename
    #[must_use]
    pub fn suffix(&self) -> String {
        hex::encode(&self.0[1..]) // Bytes 1-31 = 62 hex chars
    }

    /// Get full hex representation (64 chars)
    #[must_use]
    pub fn to_hex(&self) -> String {
        hex::encode(self.0)
    }
}

impl fmt::Debug for ContentBlobHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ContentBlobHash({})", self.to_hash_string())
    }
}

impl fmt::Display for ContentBlobHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_hash_string())
    }
}

impl Serialize for ContentBlobHash {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_hash_string())
    }
}

impl<'de> Deserialize<'de> for ContentBlobHash {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        Self::from_hash_string(&s).map_err(serde::de::Error::custom)
    }
}

/// Filesystem-based blob storage
pub struct BlobStore {
    base_path: PathBuf,
    /// Track total bytes stored (approximate).
    ///
    /// Uses `Ordering::Relaxed` for performance. This counter is approximate and
    /// may be slightly inaccurate under high concurrency, but remains suitable for
    /// monitoring and eviction threshold calculations where exactness isn't critical.
    total_bytes: AtomicU64,
}

impl BlobStore {
    /// Create blob store at path
    ///
    /// # Errors
    ///
    /// Returns error if directory cannot be created.
    pub fn new(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let base_path = path.as_ref().to_path_buf();
        fs::create_dir_all(&base_path)?;

        let store = Self {
            base_path,
            total_bytes: AtomicU64::new(0),
        };

        // Scan existing blobs to compute total size
        let total = store.scan_total_size()?;
        store.total_bytes.store(total, Ordering::Relaxed);

        Ok(store)
    }

    /// Store blob, returning its hash
    ///
    /// Computes SHA-256 and writes to `<prefix>/<suffix>`.
    /// Verifies the hash matches after write.
    ///
    /// # Errors
    ///
    /// Returns error if write fails.
    pub fn put(&self, data: &[u8]) -> Result<ContentBlobHash, StorageError> {
        let hash = ContentBlobHash::compute(data);
        self.put_with_hash(data, &hash)?;
        Ok(hash)
    }

    /// Store blob with known hash (skips hash computation)
    ///
    /// # Errors
    ///
    /// Returns error if write fails, hash doesn't match, or blob exceeds MAX_MEDIA_SIZE.
    pub fn put_with_hash(&self, data: &[u8], hash: &ContentBlobHash) -> Result<(), StorageError> {
        use crate::types::constants::MAX_MEDIA_SIZE;

        // Protocol enforcement: reject blobs over 1MB
        if data.len() > MAX_MEDIA_SIZE {
            return Err(StorageError::DataTooLarge {
                size: data.len(),
                max: MAX_MEDIA_SIZE,
            });
        }

        // Verify hash matches
        let computed = ContentBlobHash::compute(data);
        if computed != *hash {
            return Err(StorageError::CorruptedData {
                expected: hash.to_hash_string(),
                actual: computed.to_hash_string(),
            });
        }

        let blob_path = self.blob_path(hash);

        // Skip if already exists (content-addressed = idempotent)
        if blob_path.exists() {
            return Ok(());
        }

        // Create parent directory
        if let Some(parent) = blob_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Atomic write: write to temp file first, then rename
        let temp_path = blob_path.with_extension("tmp");
        {
            let mut file = fs::File::create(&temp_path)?;
            file.write_all(data)?;
            file.sync_all()?;
        }
        fs::rename(&temp_path, &blob_path)?;

        self.total_bytes
            .fetch_add(data.len() as u64, Ordering::Relaxed);

        Ok(())
    }

    /// Get blob by hash, verifying integrity
    ///
    /// # Errors
    ///
    /// Returns error if blob not found, read fails, or hash doesn't match.
    pub fn get(&self, hash: &ContentBlobHash) -> Result<Vec<u8>, StorageError> {
        let blob_path = self.blob_path(hash);

        if !blob_path.exists() {
            return Err(StorageError::BlobNotFound {
                hash: hash.to_hash_string(),
            });
        }

        let mut file = fs::File::open(&blob_path)?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;

        // Verify integrity
        let computed = ContentBlobHash::compute(&data);
        if computed != *hash {
            return Err(StorageError::CorruptedData {
                expected: hash.to_hash_string(),
                actual: computed.to_hash_string(),
            });
        }

        Ok(data)
    }

    /// Get blob without integrity verification (faster)
    ///
    /// # Errors
    ///
    /// Returns error if blob not found or read fails.
    pub fn get_unchecked(&self, hash: &ContentBlobHash) -> Result<Vec<u8>, StorageError> {
        let blob_path = self.blob_path(hash);

        if !blob_path.exists() {
            return Err(StorageError::BlobNotFound {
                hash: hash.to_hash_string(),
            });
        }

        let mut file = fs::File::open(&blob_path)?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;

        Ok(data)
    }

    /// Check if blob exists
    #[must_use]
    pub fn exists(&self, hash: &ContentBlobHash) -> bool {
        self.blob_path(hash).exists()
    }

    /// Delete blob
    ///
    /// # Errors
    ///
    /// Returns error if deletion fails (except file not found).
    pub fn delete(&self, hash: &ContentBlobHash) -> Result<bool, StorageError> {
        let blob_path = self.blob_path(hash);

        if !blob_path.exists() {
            return Ok(false);
        }

        let size = fs::metadata(&blob_path)?.len();
        fs::remove_file(&blob_path)?;
        self.total_bytes.fetch_sub(size, Ordering::Relaxed);

        // Try to clean up empty parent directory
        if let Some(parent) = blob_path.parent() {
            let _ = fs::remove_dir(parent); // Ignore errors (may not be empty)
        }

        Ok(true)
    }

    /// Get file path for hash
    ///
    /// Returns the path for storing the blob, constructed from the hash's
    /// prefix (first byte as 2 hex chars) and suffix (remaining 31 bytes as 62 hex chars).
    ///
    /// # Safety
    ///
    /// The path is guaranteed to be within `base_path` because:
    /// - `hash.prefix()` and `hash.suffix()` are hex-encoded byte arrays
    /// - Hex encoding only produces characters [0-9a-f]
    /// - No path traversal characters (/, \, ..) can appear
    #[must_use]
    pub fn blob_path(&self, hash: &ContentBlobHash) -> PathBuf {
        let path = self.base_path.join(hash.prefix()).join(hash.suffix());

        // Defense-in-depth: verify path is within base_path
        // This should always succeed given the hex-encoding guarantees above,
        // but provides additional protection against future changes.
        debug_assert!(
            path.starts_with(&self.base_path),
            "blob_path escaped base directory: {:?}",
            path
        );

        path
    }

    /// Get total storage bytes
    #[must_use]
    pub fn total_bytes(&self) -> u64 {
        self.total_bytes.load(Ordering::Relaxed)
    }

    /// Get blob count by scanning directory
    ///
    /// # Errors
    ///
    /// Returns error if directory scan fails.
    pub fn blob_count(&self) -> Result<u64, StorageError> {
        let mut count = 0u64;

        for prefix_entry in fs::read_dir(&self.base_path)? {
            let prefix_entry = prefix_entry?;
            if prefix_entry.file_type()?.is_dir() {
                for blob_entry in fs::read_dir(prefix_entry.path())? {
                    let blob_entry = blob_entry?;
                    if blob_entry.file_type()?.is_file() {
                        count += 1;
                    }
                }
            }
        }

        Ok(count)
    }

    /// Scan and compute total bytes from filesystem
    fn scan_total_size(&self) -> Result<u64, StorageError> {
        let mut total = 0u64;

        if !self.base_path.exists() {
            return Ok(0);
        }

        for prefix_entry in fs::read_dir(&self.base_path)? {
            let prefix_entry = prefix_entry?;
            if prefix_entry.file_type()?.is_dir() {
                for blob_entry in fs::read_dir(prefix_entry.path())? {
                    let blob_entry = blob_entry?;
                    if blob_entry.file_type()?.is_file() {
                        total += blob_entry.metadata()?.len();
                    }
                }
            }
        }

        Ok(total)
    }

    /// Recalculate total size by scanning all blobs
    ///
    /// # Errors
    ///
    /// Returns error if scan fails.
    pub fn recalculate_size(&mut self) -> Result<u64, StorageError> {
        let total = self.scan_total_size()?;
        self.total_bytes.store(total, Ordering::Relaxed);
        Ok(total)
    }

    /// Iterate over all blob hashes
    pub fn iter_hashes(&self) -> impl Iterator<Item = Result<ContentBlobHash, StorageError>> + '_ {
        BlobHashIterator::new(&self.base_path)
    }
}

/// Iterator over blob hashes
struct BlobHashIterator {
    prefix_entries: Vec<PathBuf>,
    current_prefix_idx: usize,
    current_blobs: Option<fs::ReadDir>,
}

impl BlobHashIterator {
    fn new(base_path: &Path) -> Self {
        let prefix_entries: Vec<PathBuf> = if base_path.exists() {
            fs::read_dir(base_path)
                .into_iter()
                .flatten()
                .flatten()
                .filter_map(|e| {
                    if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                        Some(e.path())
                    } else {
                        None
                    }
                })
                .collect()
        } else {
            Vec::new()
        };

        Self {
            prefix_entries,
            current_prefix_idx: 0,
            current_blobs: None,
        }
    }
}

impl Iterator for BlobHashIterator {
    type Item = Result<ContentBlobHash, StorageError>;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            // Try to get next blob from current directory
            if let Some(ref mut read_dir) = self.current_blobs {
                if let Some(entry_result) = read_dir.next() {
                    match entry_result {
                        Ok(entry) => {
                            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                                // Extract hash from path
                                let path = entry.path();
                                let suffix = path.file_name()?.to_str()?;
                                let prefix = path.parent()?.file_name()?.to_str()?;
                                let hex_str = format!("{prefix}{suffix}");

                                if hex_str.len() == 64 {
                                    match hex::decode(&hex_str) {
                                        Ok(bytes) => {
                                            if let Ok(arr) = bytes.try_into() {
                                                return Some(Ok(ContentBlobHash::from_bytes(arr)));
                                            }
                                        }
                                        Err(e) => {
                                            return Some(Err(StorageError::InvalidHashFormat(
                                                e.to_string(),
                                            )));
                                        }
                                    }
                                }
                            }
                            continue;
                        }
                        Err(e) => return Some(Err(e.into())),
                    }
                } else {
                    self.current_blobs = None;
                }
            }

            // Move to next prefix directory
            if self.current_prefix_idx >= self.prefix_entries.len() {
                return None;
            }

            let prefix_path = &self.prefix_entries[self.current_prefix_idx];
            self.current_prefix_idx += 1;

            match fs::read_dir(prefix_path) {
                Ok(read_dir) => self.current_blobs = Some(read_dir),
                Err(e) => return Some(Err(e.into())),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_content_blob_hash_format() {
        let data = b"test data";
        let hash = ContentBlobHash::compute(data);

        let hash_string = hash.to_hash_string();
        assert!(hash_string.starts_with("sha256:"));
        assert_eq!(hash_string.len(), 7 + 64); // "sha256:" + 64 hex chars

        let parsed = ContentBlobHash::from_hash_string(&hash_string).unwrap();
        assert_eq!(parsed, hash);
    }

    #[test]
    fn test_content_blob_hash_prefix_suffix() {
        let hash = ContentBlobHash::from_bytes([0xab; 32]);
        assert_eq!(hash.prefix(), "ab");
        assert_eq!(hash.suffix().len(), 62);
        assert_eq!(hash.to_hex().len(), 64);
    }

    #[test]
    fn test_blob_store_put_get() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let data = b"hello world";
        let hash = store.put(data).unwrap();

        assert!(store.exists(&hash));
        let retrieved = store.get(&hash).unwrap();
        assert_eq!(retrieved, data);
    }

    #[test]
    fn test_blob_store_integrity_check() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let data = b"test data";
        let hash = store.put(data).unwrap();

        // Corrupt the file
        let blob_path = store.blob_path(&hash);
        fs::write(&blob_path, b"corrupted").unwrap();

        // Should fail integrity check
        let result = store.get(&hash);
        assert!(matches!(result, Err(StorageError::CorruptedData { .. })));
    }

    #[test]
    fn test_blob_store_delete() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let data = b"test data";
        let hash = store.put(data).unwrap();
        let size = data.len() as u64;

        assert!(store.exists(&hash));
        assert_eq!(store.total_bytes(), size);

        let deleted = store.delete(&hash).unwrap();
        assert!(deleted);
        assert!(!store.exists(&hash));
        assert_eq!(store.total_bytes(), 0);
    }

    #[test]
    fn test_blob_store_directory_structure() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let data = b"test data";
        let hash = store.put(data).unwrap();

        let blob_path = store.blob_path(&hash);
        assert!(blob_path.exists());

        // Check directory structure
        let parent = blob_path.parent().unwrap();
        let prefix_dir = parent.file_name().unwrap().to_str().unwrap();
        assert_eq!(prefix_dir.len(), 2);
        assert_eq!(prefix_dir, hash.prefix());
    }

    #[test]
    fn test_blob_store_idempotent() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let data = b"test data";
        let hash1 = store.put(data).unwrap();
        let hash2 = store.put(data).unwrap();

        assert_eq!(hash1, hash2);
        // Total bytes should only count once
        assert_eq!(store.total_bytes(), data.len() as u64);
    }

    #[test]
    fn test_blob_store_persistence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("blobs");

        let hash;
        let size;
        {
            let store = BlobStore::new(&path).unwrap();
            let data = b"persistent data";
            hash = store.put(data).unwrap();
            size = data.len() as u64;
        }

        // Reopen
        let store = BlobStore::new(&path).unwrap();
        assert!(store.exists(&hash));
        assert_eq!(store.total_bytes(), size);

        let data = store.get(&hash).unwrap();
        assert_eq!(data, b"persistent data");
    }

    #[test]
    fn test_blob_store_iter_hashes() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let mut expected_hashes = vec![];
        for i in 0..10 {
            let data = format!("data {i}");
            let hash = store.put(data.as_bytes()).unwrap();
            expected_hashes.push(hash);
        }

        let found_hashes: Vec<_> = store.iter_hashes().map(|r| r.unwrap()).collect();
        assert_eq!(found_hashes.len(), expected_hashes.len());

        for hash in &expected_hashes {
            assert!(found_hashes.contains(hash));
        }
    }

    #[test]
    fn test_blob_store_not_found() {
        let dir = tempdir().unwrap();
        let store = BlobStore::new(dir.path().join("blobs")).unwrap();

        let fake_hash = ContentBlobHash::from_bytes([0x42; 32]);
        let result = store.get(&fake_hash);
        assert!(matches!(result, Err(StorageError::BlobNotFound { .. })));
    }

    #[test]
    fn test_hash_serialization() {
        let hash = ContentBlobHash::from_bytes([0xab; 32]);
        let json = serde_json::to_string(&hash).unwrap();
        assert!(json.contains("sha256:"));

        let parsed: ContentBlobHash = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, hash);
    }
}
