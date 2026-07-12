//! Cryptographic primitives for Swimchain
//!
//! Provides:
//! - **hash**: SHA-256, Blake3, merkle trees, PoW verification (SPEC_01, SPEC_03)
//! - **signature**: Ed25519 key generation, signing, verification (SPEC_01)
//! - **address**: Bech32m address encoding/decoding (SPEC_01 §3.3)
//! - **pow**: Proof-of-work mining and verification for identity creation (SPEC_01 §3.4)
//! - **action_pow**: Action-based PoW using Argon2id (SPEC_03)

pub mod action_pow;
pub mod address;
pub mod hash;
pub mod pow;
pub mod private_space;
pub mod signature;

// Re-export commonly used functions
pub use address::{
    decode_address, decode_address_to_pubkey, encode_address, encode_address_from_pubkey,
    is_valid_address,
};
pub use hash::{
    blake3_hash, checksum, content_hash, leading_zeros, md5, merkle_root, pow_hash, sha1, sha256,
    verify_pow_difficulty,
};
pub use pow::{
    mine_identity_pow, mine_identity_pow_with_callback, verify_identity_pow,
    verify_identity_pow_strict, DEFAULT_IDENTITY_POW_DIFFICULTY, POW_FUTURE_TOLERANCE_SECS,
    POW_MAX_AGE_SECS, POW_PAST_TOLERANCE_SECS,
};
pub use signature::{
    current_timestamp, generate_keypair, sign, sign_content, verify, verify_envelope,
};

// Re-export action PoW types and functions
pub use action_pow::{
    compute_pow, compute_pow_with_callback, get_adjusted_difficulty, verify_content_binding,
    verify_pow, ActionType, ForkPoWConfig, PoWChallenge, PoWSolution,
    CHALLENGE_FUTURE_TOLERANCE_SECS, CHALLENGE_SERIALIZED_SIZE, CHALLENGE_VALIDITY_SECS,
    MIN_MEMORY_KIB,
};

/// Re-export difficulty constants
pub mod action_difficulty {
    pub use super::action_pow::difficulty::*;
}
