//! Error types for serialization, address handling, and identity operations

use std::string::FromUtf8Error;

/// Errors that can occur during serialization/deserialization
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SerializeError {
    /// Length mismatch during deserialization
    #[error("invalid length: expected {expected}, got {actual}")]
    InvalidLength {
        /// Expected length
        expected: usize,
        /// Actual length received
        actual: usize,
    },

    /// Magic bytes don't match expected value
    #[error("invalid magic bytes")]
    InvalidMagic,

    /// Checksum verification failed
    #[error("invalid checksum")]
    InvalidChecksum,

    /// Unknown type discriminant encountered
    #[error("unknown type discriminant: {0}")]
    UnknownType(u8),

    /// Invalid UTF-8 string data
    #[error("invalid UTF-8: {0}")]
    InvalidUtf8(String),

    /// Integer overflow during computation
    #[error("integer overflow")]
    Overflow,

    /// Unexpected end of input data
    #[error("unexpected end of input")]
    UnexpectedEof,

    /// Timestamp is too far in the past
    #[error("timestamp too old: {age_secs}s exceeds tolerance of {tolerance_secs}s")]
    TimestampTooOld {
        /// Age of the timestamp in seconds
        age_secs: u64,
        /// Maximum allowed age in seconds
        tolerance_secs: u64,
    },

    /// Timestamp is too far in the future
    #[error("timestamp too new: {ahead_secs}s ahead exceeds tolerance of {tolerance_secs}s")]
    TimestampTooNew {
        /// How far ahead the timestamp is in seconds
        ahead_secs: u64,
        /// Maximum allowed time ahead in seconds
        tolerance_secs: u64,
    },
}

impl From<FromUtf8Error> for SerializeError {
    fn from(err: FromUtf8Error) -> Self {
        SerializeError::InvalidUtf8(err.to_string())
    }
}

/// Errors that can occur during Bech32m address encoding/decoding
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AddressError {
    /// Human-readable part doesn't match expected "cs"
    #[error("invalid HRP: expected 'cs', got '{0}'")]
    InvalidHrp(String),

    /// Bech32 checksum is invalid
    #[error("invalid checksum")]
    InvalidChecksum,

    /// Address has invalid length
    #[error("invalid length: {0}")]
    InvalidLength(usize),

    /// Invalid character in address
    #[error("invalid character at position {0}")]
    InvalidCharacter(usize),

    /// Address version is not supported
    #[error("unsupported version: {0}")]
    UnsupportedVersion(u8),

    /// Generic bech32 library error
    #[error("bech32 error: {0}")]
    Bech32Error(String),
}

/// Errors that can occur during action proof-of-work operations
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ActionPowError {
    /// PoW hash doesn't meet the required difficulty
    #[error("difficulty not met: required {required} leading zeros, got {actual}")]
    DifficultyNotMet {
        /// Required number of leading zeros
        required: u8,
        /// Actual number of leading zeros in hash
        actual: u32,
    },

    /// Challenge timestamp has expired (>10 minutes old per SPEC_03 §6.1)
    #[error("challenge expired: {age_secs}s exceeds 600s window")]
    ChallengeExpired {
        /// Age of the timestamp in seconds
        age_secs: u64,
    },

    /// Challenge timestamp is in the future (>1 minute per clock drift tolerance)
    #[error("challenge timestamp in future: {ahead_secs}s ahead")]
    ChallengeFuture {
        /// How far ahead the timestamp is in seconds
        ahead_secs: u64,
    },

    /// Recomputed hash doesn't match provided hash
    #[error("hash mismatch: solution hash doesn't match recomputed hash")]
    HashMismatch,

    /// Content hash in challenge doesn't match actual content
    #[error("content mismatch: challenge content_hash doesn't match content")]
    ContentMismatch,

    /// Invalid action type discriminant
    #[error("invalid action type: 0x{0:02x}")]
    InvalidActionType(u8),

    /// Invalid challenge serialization length
    #[error("invalid challenge length: expected 82, got {0}")]
    InvalidChallengeLength(usize),

    /// Argon2id memory parameter too low (ASIC resistance floor)
    #[error("memory too low: {actual_kib} KiB < 32768 KiB minimum")]
    MemoryTooLow {
        /// Actual memory in KiB
        actual_kib: u32,
    },

    /// Argon2id computation error
    #[error("Argon2 error: {0}")]
    Argon2Error(String),

    /// PoW mining was cancelled by user (Ctrl+C)
    #[error("proof-of-work mining cancelled")]
    Cancelled,
}

/// Errors that can occur during identity operations
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum IdentityError {
    /// PoW hash doesn't meet the required difficulty
    #[error("PoW difficulty not met: required {required} leading zeros, actual {actual}")]
    PowDifficultyNotMet {
        /// Required number of leading zeros
        required: u8,
        /// Actual number of leading zeros in hash
        actual: u32,
    },

    /// PoW timestamp too old for initial creation (anti-stockpiling, 24h limit per SPEC_01 V-POW-04)
    #[error("PoW timestamp too old for creation: {age_secs}s exceeds 24h anti-stockpile limit")]
    PowTimestampStockpile {
        /// Age of the timestamp in seconds
        age_secs: u64,
    },

    /// PoW timestamp too old for verification tolerance (1h limit per SPEC_01 V-POW-03)
    #[error("PoW timestamp too old for verification: {age_secs}s exceeds 1h tolerance")]
    PowTimestampExpired {
        /// Age of the timestamp in seconds
        age_secs: u64,
    },

    /// PoW timestamp is in the future (5min tolerance)
    #[error("PoW timestamp in future: {ahead_secs}s ahead exceeds 5min tolerance")]
    PowTimestampFuture {
        /// How far ahead the timestamp is in seconds
        ahead_secs: u64,
    },

    /// Invalid key format or structure
    #[error("Invalid key format: {reason}")]
    InvalidKeyFormat {
        /// Description of what's wrong with the key format
        reason: String,
    },

    /// Encryption operation failed
    #[error("Encryption failed: {0}")]
    EncryptionError(String),

    /// Decryption operation failed (wrong passphrase or corrupted data)
    #[error("Decryption failed: {0}")]
    DecryptionError(String),

    /// Key derivation from passphrase failed
    #[error("Key derivation failed: {0}")]
    KeyDerivationError(String),

    /// File or storage I/O error
    #[error("Storage error: {0}")]
    StorageError(String),

    /// Portable identity format is invalid
    #[error("Invalid portable format: {reason}")]
    InvalidPortableFormat {
        /// Description of what's wrong with the format
        reason: String,
    },

    /// Decrypted private key doesn't match stored public key
    #[error("Keypair mismatch: expected public key {expected}, derived {derived}")]
    KeypairMismatch {
        /// Expected public key (from portable format)
        expected: String,
        /// Derived public key (from decrypted private key)
        derived: String,
    },
}

/// Errors that can occur during content operations
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ContentError {
    /// Content with this ID already exists
    #[error("content already exists: {0:?}")]
    AlreadyExists(crate::types::content::ContentId),

    /// Content not found by ID
    #[error("content not found: {0:?}")]
    NotFound(crate::types::content::ContentId),

    /// Content has decayed and cannot be engaged with
    #[error("content decayed: {0:?}")]
    Decayed(crate::types::content::ContentId),

    /// Content validation failed
    #[error("invalid content: {0}")]
    InvalidContent(String),

    /// Storage lock was poisoned by a panicked thread
    #[error("storage lock poisoned")]
    StorageLockPoisoned,

    /// Engagement validation failed
    #[error("invalid engagement: {0}")]
    InvalidEngagement(String),
}

/// Errors that can occur during storage operations (SPEC_07 - Milestone 1.6)
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum StorageError {
    /// I/O error during file operations
    #[error("I/O error: {0}")]
    IoError(String),

    /// Database error from sled
    #[error("database error: {0}")]
    DatabaseError(String),

    /// Content blob not found by hash
    #[error("blob not found: {hash}")]
    BlobNotFound {
        /// The hash that was not found
        hash: String,
    },

    /// Storage limit reached, cannot store more
    #[error("storage full: {used_bytes}/{limit_bytes} bytes")]
    StorageFull {
        /// Currently used bytes
        used_bytes: u64,
        /// Maximum allowed bytes
        limit_bytes: u64,
    },

    /// Data corruption detected (hash mismatch)
    #[error("corrupted data: expected {expected}, got {actual}")]
    CorruptedData {
        /// Expected hash
        expected: String,
        /// Actual hash computed
        actual: String,
    },

    /// Data exceeds maximum allowed size (protocol limit)
    #[error("data too large: {size} bytes (max {max} bytes)")]
    DataTooLarge {
        /// Size of the data
        size: usize,
        /// Maximum allowed size
        max: usize,
    },

    /// Invalid storage path
    #[error("invalid path: {0}")]
    InvalidPath(String),

    /// Serialization/deserialization failed
    #[error("serialization error: {0}")]
    SerializationError(String),

    /// Block not found
    #[error("block not found: {hash}")]
    BlockNotFound {
        /// The hash of the missing block
        hash: String,
    },

    /// Manifest not found
    #[error("manifest not found: {hash}")]
    ManifestNotFound {
        /// The hash of the missing manifest
        hash: String,
    },

    /// Invalid hash format
    #[error("invalid hash format: {0}")]
    InvalidHashFormat(String),
}

impl From<std::io::Error> for StorageError {
    fn from(err: std::io::Error) -> Self {
        StorageError::IoError(err.to_string())
    }
}

impl From<sled::Error> for StorageError {
    fn from(err: sled::Error) -> Self {
        StorageError::DatabaseError(err.to_string())
    }
}

impl From<bincode::Error> for StorageError {
    fn from(err: bincode::Error) -> Self {
        StorageError::SerializationError(err.to_string())
    }
}

impl From<serde_json::Error> for StorageError {
    fn from(err: serde_json::Error) -> Self {
        StorageError::SerializationError(err.to_string())
    }
}
