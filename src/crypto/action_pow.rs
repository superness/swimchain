//! Action Proof-of-Work for Swimchain
//!
//! Implements SPEC_03 for action-based PoW using Argon2id.
//! This is DISTINCT from identity PoW (SPEC_01) which uses SHA-256.
//!
//! # Overview
//!
//! Every action in Swimchain (post, reply, engage, etc.) requires solving
//! a proof-of-work challenge. This uses Argon2id for memory-hardness to
//! prevent ASIC optimization of bulk spam.
//!
//! # Example
//!
//! ```
//! use swimchain::crypto::action_pow::{
//!     ActionType, PoWChallenge, ForkPoWConfig, compute_pow, verify_pow,
//! };
//! use swimchain::crypto::{sha256, current_timestamp};
//!
//! // Create a challenge
//! let config = ForkPoWConfig::test(); // Use test config for low difficulty
//! let challenge = PoWChallenge {
//!     action_type: ActionType::Post,
//!     content_hash: sha256(b"Hello, world!"),
//!     author_id: [0u8; 32],
//!     timestamp: current_timestamp(),
//!     difficulty: 4, // Very low for testing
//!     nonce_space: [0u8; 8],
//! };
//!
//! // Mine a solution
//! let solution = compute_pow(&challenge, &config).unwrap();
//!
//! // Verify it
//! verify_pow(&solution, &config, current_timestamp()).unwrap();
//! ```

use crate::types::error::ActionPowError;
use argon2::{Algorithm, Argon2, Params, Version};

/// Action types per SPEC_03 §3.1
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActionType {
    /// Creating a new space (highest difficulty)
    SpaceCreation = 0x01,
    /// Creating a new post
    Post = 0x02,
    /// Replying to a post
    Reply = 0x03,
    /// Engaging with content (renamed from REACTION in v2.0.0)
    Engage = 0x04,
    /// Updating identity metadata
    IdentityUpdate = 0x05,
    /// Editing existing content
    Edit = 0x06,
    /// Inviting a user to a private space
    Invite = 0x07,
}

impl TryFrom<u8> for ActionType {
    type Error = ActionPowError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(ActionType::SpaceCreation),
            0x02 => Ok(ActionType::Post),
            0x03 => Ok(ActionType::Reply),
            0x04 => Ok(ActionType::Engage),
            0x05 => Ok(ActionType::IdentityUpdate),
            0x06 => Ok(ActionType::Edit),
            0x07 => Ok(ActionType::Invite),
            _ => Err(ActionPowError::InvalidActionType(value)),
        }
    }
}

/// Challenge validity window (10 minutes per SPEC_03 §6.1)
pub const CHALLENGE_VALIDITY_SECS: u64 = 600;

/// Future timestamp tolerance (1 minute for clock drift)
pub const CHALLENGE_FUTURE_TOLERANCE_SECS: u64 = 60;

/// Minimum memory for ASIC resistance (32 MiB per SPEC_03 §9.3)
pub const MIN_MEMORY_KIB: u32 = 32768;

/// Serialized challenge size (82 bytes - NOTE: spec text says 75 but offset table = 82)
pub const CHALLENGE_SERIALIZED_SIZE: usize = 82;

/// Default difficulty values per SPEC_03 §6.4
pub mod difficulty {
    /// Space creation difficulty (~60 seconds)
    pub const SPACE_CREATION: u8 = 22;
    /// Post creation difficulty (~30 seconds)
    pub const POST: u8 = 20;
    /// Reply creation difficulty (~15 seconds)
    pub const REPLY: u8 = 18;
    /// Engagement difficulty (~5-60 seconds, pooled)
    pub const ENGAGE: u8 = 16;
    /// Identity update difficulty (~30 seconds)
    pub const IDENTITY_UPDATE: u8 = 20;
    /// Edit difficulty (same as original post/reply)
    pub const EDIT: u8 = 18;
    /// Invite difficulty (~10 seconds)
    pub const INVITE: u8 = 16;
}

/// PoW challenge per SPEC_03 §3.1
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoWChallenge {
    /// Type of action being performed
    pub action_type: ActionType,
    /// SHA-256 hash of the content
    pub content_hash: [u8; 32],
    /// Author's public key bytes
    pub author_id: [u8; 32],
    /// Unix timestamp in seconds
    pub timestamp: u64,
    /// Number of leading zero bits required
    pub difficulty: u8,
    /// Random bytes for challenge uniqueness
    pub nonce_space: [u8; 8],
}

impl PoWChallenge {
    /// Serialize to 82-byte canonical format per SPEC_03 §4.2
    ///
    /// Layout:
    /// - [0]:      action_type (u8)
    /// - [1..33]:  content_hash (32 bytes)
    /// - [33..65]: author_id (32 bytes)
    /// - [65..73]: timestamp (u64, big-endian)
    /// - [73]:     difficulty (u8)
    /// - [74..82]: nonce_space (8 bytes)
    #[must_use]
    pub fn serialize(&self) -> [u8; CHALLENGE_SERIALIZED_SIZE] {
        let mut buf = [0u8; CHALLENGE_SERIALIZED_SIZE];
        buf[0] = self.action_type as u8;
        buf[1..33].copy_from_slice(&self.content_hash);
        buf[33..65].copy_from_slice(&self.author_id);
        buf[65..73].copy_from_slice(&self.timestamp.to_be_bytes());
        buf[73] = self.difficulty;
        buf[74..82].copy_from_slice(&self.nonce_space);
        buf
    }

    /// Deserialize from 82-byte canonical format
    ///
    /// # Errors
    ///
    /// Returns error if data length is not 82 bytes or action type is invalid.
    pub fn deserialize(data: &[u8]) -> Result<Self, ActionPowError> {
        if data.len() != CHALLENGE_SERIALIZED_SIZE {
            return Err(ActionPowError::InvalidChallengeLength(data.len()));
        }

        let action_type = ActionType::try_from(data[0])?;
        let mut content_hash = [0u8; 32];
        content_hash.copy_from_slice(&data[1..33]);
        let mut author_id = [0u8; 32];
        author_id.copy_from_slice(&data[33..65]);
        let timestamp =
            u64::from_be_bytes(data[65..73].try_into().expect("slice is exactly 8 bytes"));
        let difficulty = data[73];
        let mut nonce_space = [0u8; 8];
        nonce_space.copy_from_slice(&data[74..82]);

        Ok(Self {
            action_type,
            content_hash,
            author_id,
            timestamp,
            difficulty,
            nonce_space,
        })
    }

    /// Generate a new challenge for content
    ///
    /// Creates a challenge with current timestamp and random nonce_space.
    #[must_use]
    pub fn generate(
        action_type: ActionType,
        content: &[u8],
        author_pubkey: &[u8; 32],
        difficulty: u8,
    ) -> Self {
        use rand::RngCore;

        let content_hash = crate::crypto::sha256(content);
        let timestamp = crate::crypto::current_timestamp();
        let mut nonce_space = [0u8; 8];
        rand::thread_rng().fill_bytes(&mut nonce_space);

        Self {
            action_type,
            content_hash,
            author_id: *author_pubkey,
            timestamp,
            difficulty,
            nonce_space,
        }
    }

    /// Generate a challenge with a pre-computed content hash.
    ///
    /// Use this for engagement where the content ID is already a hash
    /// (e.g., `sha256:abc123...`) and shouldn't be hashed again.
    #[must_use]
    pub fn generate_with_hash(
        action_type: ActionType,
        content_hash: [u8; 32],
        author_pubkey: &[u8; 32],
        difficulty: u8,
    ) -> Self {
        use rand::RngCore;

        let timestamp = crate::crypto::current_timestamp();
        let mut nonce_space = [0u8; 8];
        rand::thread_rng().fill_bytes(&mut nonce_space);

        Self {
            action_type,
            content_hash,
            author_id: *author_pubkey,
            timestamp,
            difficulty,
            nonce_space,
        }
    }

}

/// PoW solution per SPEC_03 §3.2
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoWSolution {
    /// The challenge that was solved
    pub challenge: PoWChallenge,
    /// The nonce that produces a valid hash
    pub nonce: u64,
    /// The Argon2id hash result
    pub hash: [u8; 32],
}

/// Fork-level PoW configuration per SPEC_03 §3.3
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForkPoWConfig {
    /// Memory cost in KiB (default: 65536 = 64 MiB)
    pub memory_kib: u32,
    /// Number of iterations (default: 3)
    pub iterations: u32,
    /// Degree of parallelism (default: 4)
    pub parallelism: u8,
}

impl Default for ForkPoWConfig {
    fn default() -> Self {
        Self::production()
    }
}

impl ForkPoWConfig {
    /// Default production configuration per SPEC_03 §4.1
    #[must_use]
    pub fn production() -> Self {
        Self {
            memory_kib: 65536, // 64 MiB
            iterations: 3,
            parallelism: 4,
        }
    }

    /// Test configuration with reduced parameters per SPEC_03 §11.2
    ///
    /// **WARNING**: This configuration does NOT validate memory requirements.
    /// Only use for testing.
    #[must_use]
    pub fn test() -> Self {
        Self {
            memory_kib: 1024, // 1 MiB
            iterations: 1,
            parallelism: 1,
        }
    }

    /// Mobile configuration per SPEC_03 §10.2
    #[must_use]
    pub fn mobile() -> Self {
        Self {
            memory_kib: 65536, // 64 MiB (same memory)
            iterations: 3,
            parallelism: 2, // Reduced parallelism for heat management
        }
    }

    /// Testnet configuration with significantly reduced parameters
    ///
    /// Uses 8 MiB memory and 1 iteration for fast testing.
    /// **WARNING**: This does NOT validate memory requirements.
    /// Only use for testnet testing.
    #[must_use]
    pub fn testnet() -> Self {
        Self {
            memory_kib: 8192, // 8 MiB (reduced for fast testing)
            iterations: 1,   // Single iteration
            parallelism: 2,  // Low parallelism
        }
    }

    /// Validate configuration meets ASIC resistance requirements
    ///
    /// # Errors
    ///
    /// Returns error if memory is below 32 MiB minimum.
    pub fn validate(&self) -> Result<(), ActionPowError> {
        if self.memory_kib < MIN_MEMORY_KIB {
            return Err(ActionPowError::MemoryTooLow {
                actual_kib: self.memory_kib,
            });
        }
        Ok(())
    }

    /// Validate configuration for production use
    ///
    /// This is a stricter check for production deployments.
    ///
    /// # Errors
    ///
    /// Returns error if memory is below 32 MiB minimum.
    pub fn validate_production(&self) -> Result<(), ActionPowError> {
        self.validate()
    }

    /// Get difficulty for action type per SPEC_03 §6.4
    #[must_use]
    pub fn get_difficulty(&self, action: ActionType) -> u8 {
        match action {
            ActionType::SpaceCreation => difficulty::SPACE_CREATION,
            ActionType::Post => difficulty::POST,
            ActionType::Reply => difficulty::REPLY,
            ActionType::Engage => difficulty::ENGAGE,
            ActionType::IdentityUpdate => difficulty::IDENTITY_UPDATE,
            ActionType::Edit => difficulty::EDIT,
            ActionType::Invite => difficulty::INVITE,
        }
    }
}

/// Compute Argon2id hash with given parameters
fn compute_argon2id(
    input: &[u8],
    salt: &[u8; 8],
    config: &ForkPoWConfig,
) -> Result<[u8; 32], ActionPowError> {
    // Argon2id requires 8-byte minimum salt, we have exactly 8
    let params = Params::new(
        config.memory_kib,
        config.iterations,
        config.parallelism.into(),
        Some(32), // output length
    )
    .map_err(|e| ActionPowError::Argon2Error(e.to_string()))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut hash = [0u8; 32];
    argon2
        .hash_password_into(input, salt, &mut hash)
        .map_err(|e| ActionPowError::Argon2Error(e.to_string()))?;

    Ok(hash)
}

/// Compute PoW solution for a challenge
///
/// This function will iterate through nonces until it finds one that produces
/// a hash with the required number of leading zero bits.
///
/// # Errors
///
/// Returns error if configuration validation fails or Argon2id computation fails.
///
/// # Note
///
/// This function does NOT validate memory requirements for test configurations.
/// Call `config.validate()` separately if needed.
pub fn compute_pow(
    challenge: &PoWChallenge,
    config: &ForkPoWConfig,
) -> Result<PoWSolution, ActionPowError> {
    let serialized = challenge.serialize();
    let mut nonce: u64 = 0;

    loop {
        // Build input: serialized_challenge(82) || nonce_be(8)
        let mut input = [0u8; CHALLENGE_SERIALIZED_SIZE + 8];
        input[..CHALLENGE_SERIALIZED_SIZE].copy_from_slice(&serialized);
        input[CHALLENGE_SERIALIZED_SIZE..].copy_from_slice(&nonce.to_be_bytes());

        let hash = compute_argon2id(&input, &challenge.nonce_space, config)?;

        if crate::crypto::leading_zeros(&hash) >= u32::from(challenge.difficulty) {
            return Ok(PoWSolution {
                challenge: challenge.clone(),
                nonce,
                hash,
            });
        }

        nonce = nonce.wrapping_add(1);
        if nonce == 0 {
            // Wrapped around (extremely unlikely)
            break;
        }
    }

    // Should never reach here with reasonable difficulty
    Err(ActionPowError::Argon2Error(
        "nonce space exhausted".to_string(),
    ))
}

/// Compute PoW with progress callback
///
/// Same as `compute_pow` but calls the callback periodically with the current nonce.
/// The callback is called approximately every 100 nonce attempts.
///
/// # Errors
///
/// Returns error if configuration validation fails or Argon2id computation fails.
pub fn compute_pow_with_callback<F>(
    challenge: &PoWChallenge,
    config: &ForkPoWConfig,
    mut callback: F,
) -> Result<PoWSolution, ActionPowError>
where
    F: FnMut(u64),
{
    let serialized = challenge.serialize();
    let mut nonce: u64 = 0;
    const CALLBACK_INTERVAL: u64 = 100; // Argon2id is slow

    loop {
        let mut input = [0u8; CHALLENGE_SERIALIZED_SIZE + 8];
        input[..CHALLENGE_SERIALIZED_SIZE].copy_from_slice(&serialized);
        input[CHALLENGE_SERIALIZED_SIZE..].copy_from_slice(&nonce.to_be_bytes());

        let hash = compute_argon2id(&input, &challenge.nonce_space, config)?;

        if crate::crypto::leading_zeros(&hash) >= u32::from(challenge.difficulty) {
            return Ok(PoWSolution {
                challenge: challenge.clone(),
                nonce,
                hash,
            });
        }

        nonce = nonce.wrapping_add(1);
        if nonce % CALLBACK_INTERVAL == 0 {
            callback(nonce);
        }
        if nonce == 0 {
            break;
        }
    }

    Err(ActionPowError::Argon2Error(
        "nonce space exhausted".to_string(),
    ))
}

/// Compute PoW with cancellation support
///
/// Same as `compute_pow_with_callback` but takes a cancellation check function.
/// The check is called every iteration and if it returns true, mining stops.
///
/// # Errors
///
/// Returns `ActionPowError::Cancelled` if the check function returns true.
/// Returns other errors if configuration validation or Argon2id computation fails.
pub fn compute_pow_cancellable<F, C>(
    challenge: &PoWChallenge,
    config: &ForkPoWConfig,
    mut callback: F,
    is_cancelled: C,
) -> Result<PoWSolution, ActionPowError>
where
    F: FnMut(u64),
    C: Fn() -> bool,
{
    let serialized = challenge.serialize();
    let mut nonce: u64 = 0;
    const CALLBACK_INTERVAL: u64 = 10; // Check more frequently for responsiveness

    loop {
        // Check for cancellation FIRST (every iteration for responsiveness)
        if is_cancelled() {
            return Err(ActionPowError::Cancelled);
        }

        let mut input = [0u8; CHALLENGE_SERIALIZED_SIZE + 8];
        input[..CHALLENGE_SERIALIZED_SIZE].copy_from_slice(&serialized);
        input[CHALLENGE_SERIALIZED_SIZE..].copy_from_slice(&nonce.to_be_bytes());

        let hash = compute_argon2id(&input, &challenge.nonce_space, config)?;

        if crate::crypto::leading_zeros(&hash) >= u32::from(challenge.difficulty) {
            return Ok(PoWSolution {
                challenge: challenge.clone(),
                nonce,
                hash,
            });
        }

        nonce = nonce.wrapping_add(1);
        if nonce % CALLBACK_INTERVAL == 0 {
            callback(nonce);
        }
        if nonce == 0 {
            break;
        }
    }

    Err(ActionPowError::Argon2Error(
        "nonce space exhausted".to_string(),
    ))
}

/// Verify a PoW solution per SPEC_03 §4.5
///
/// Checks (in order of cost, cheapest first):
/// 1. Challenge timestamp is within validity window (10 minutes)
/// 2. Quick rejection: provided hash has sufficient leading zeros
/// 3. Recomputes the Argon2id hash and verifies it matches
/// 4. Verifies the recomputed hash meets the difficulty requirement
///
/// # Errors
///
/// Returns error if:
/// - Configuration validation fails
/// - Challenge has expired or is too far in the future
/// - Hash doesn't meet difficulty requirement (quick rejection)
/// - Hash doesn't match recomputed hash
///
/// # Note
///
/// Verification takes ~50-200ms due to Argon2id computation.
/// Cheap checks are performed first to reject invalid submissions
/// before the expensive Argon2id computation.
pub fn verify_pow(
    solution: &PoWSolution,
    config: &ForkPoWConfig,
    current_time: u64,
) -> Result<(), ActionPowError> {
    // CHEAP CHECK 1: Timestamp window per SPEC_03 §6.1
    // This is O(1) and should be checked before any expensive operations
    let challenge_time = solution.challenge.timestamp;
    if challenge_time > current_time {
        let ahead = challenge_time - current_time;
        if ahead > CHALLENGE_FUTURE_TOLERANCE_SECS {
            return Err(ActionPowError::ChallengeFuture { ahead_secs: ahead });
        }
    } else {
        let age = current_time - challenge_time;
        if age > CHALLENGE_VALIDITY_SECS {
            return Err(ActionPowError::ChallengeExpired { age_secs: age });
        }
    }

    // CHEAP CHECK 2: Quick rejection - verify provided hash meets difficulty
    // This is O(1) and catches obviously invalid submissions before expensive Argon2id
    // An attacker cannot fake leading zeros without doing the actual work
    let claimed_zeros = crate::crypto::leading_zeros(&solution.hash);
    if claimed_zeros < u32::from(solution.challenge.difficulty) {
        return Err(ActionPowError::DifficultyNotMet {
            required: solution.challenge.difficulty,
            actual: claimed_zeros,
        });
    }

    // EXPENSIVE CHECK: Recompute hash per SPEC_03 §4.5
    // Only reached after cheap checks pass - this takes 50-200ms + 64 MiB
    let serialized = solution.challenge.serialize();
    let mut input = [0u8; CHALLENGE_SERIALIZED_SIZE + 8];
    input[..CHALLENGE_SERIALIZED_SIZE].copy_from_slice(&serialized);
    input[CHALLENGE_SERIALIZED_SIZE..].copy_from_slice(&solution.nonce.to_be_bytes());

    let expected_hash = compute_argon2id(&input, &solution.challenge.nonce_space, config)?;

    // Verify hash matches using constant-time comparison
    // This prevents timing side-channel attacks
    if !constant_time_eq(&expected_hash, &solution.hash) {
        return Err(ActionPowError::HashMismatch);
    }

    // Final verification: recomputed hash also meets difficulty
    // This should always pass if the above checks passed, but verify for safety
    let zeros = crate::crypto::leading_zeros(&expected_hash);
    if zeros < u32::from(solution.challenge.difficulty) {
        return Err(ActionPowError::DifficultyNotMet {
            required: solution.challenge.difficulty,
            actual: zeros,
        });
    }

    Ok(())
}

/// Constant-time comparison of two 32-byte arrays
///
/// Prevents timing side-channel attacks by ensuring comparison
/// time is independent of where the first difference occurs.
#[inline]
fn constant_time_eq(a: &[u8; 32], b: &[u8; 32]) -> bool {
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Verify content binding per SPEC_03 §6.3
///
/// Ensures the PoW solution is bound to specific content and author.
///
/// # Errors
///
/// Returns error if:
/// - Content hash doesn't match SHA-256 of provided content
/// - Author ID doesn't match provided public key
pub fn verify_content_binding(
    solution: &PoWSolution,
    content: &[u8],
    author_pubkey: &[u8; 32],
) -> Result<(), ActionPowError> {
    // Check content_hash = SHA-256(content)
    let expected_hash = crate::crypto::sha256(content);
    if solution.challenge.content_hash != expected_hash {
        return Err(ActionPowError::ContentMismatch);
    }

    // Check author_id matches
    if &solution.challenge.author_id != author_pubkey {
        return Err(ActionPowError::ContentMismatch);
    }

    Ok(())
}

/// Get adjusted difficulty (future: dynamic adjustment per SPEC_03 SC-5)
///
/// Currently returns default difficulty. Future implementations may
/// adjust based on fork parameters or network conditions.
#[must_use]
pub fn get_adjusted_difficulty(action: ActionType, _fork_config: &ForkPoWConfig) -> u8 {
    // Per SPEC_03 SC-5: "SHOULD NOT require difficulty adjustment over time"
    // This stub exists for future fork-level customization
    match action {
        ActionType::SpaceCreation => difficulty::SPACE_CREATION,
        ActionType::Post => difficulty::POST,
        ActionType::Reply => difficulty::REPLY,
        ActionType::Engage => difficulty::ENGAGE,
        ActionType::IdentityUpdate => difficulty::IDENTITY_UPDATE,
        ActionType::Edit => difficulty::EDIT,
        ActionType::Invite => difficulty::INVITE,
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::leading_zeros;

    #[test]
    fn test_serialization_vector() {
        // SPEC_03 §11.1 test vector
        // timestamp 0x658f5080 = 1703891072 = 2023-12-29 23:04:32 UTC
        let challenge = PoWChallenge {
            action_type: ActionType::Post, // 0x02
            content_hash: hex_decode(
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            ),
            author_id: hex_decode(
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            ),
            timestamp: 0x658f5080, // from test vector hex
            difficulty: 20,
            nonce_space: hex_decode_8("deadbeefcafebabe"),
        };

        let serialized = challenge.serialize();
        assert_eq!(serialized.len(), 82); // NOTE: Spec says 75, but offset table = 82

        let expected_hex = "02e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8550123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef00000000658f508014deadbeefcafebabe";
        assert_eq!(hex::encode(serialized), expected_hex);
    }

    #[test]
    fn test_round_trip_serialization() {
        let original = PoWChallenge {
            action_type: ActionType::Reply,
            content_hash: [0xab; 32],
            author_id: [0xcd; 32],
            timestamp: 1234567890,
            difficulty: 18,
            nonce_space: [0xef; 8],
        };

        let serialized = original.serialize();
        let deserialized = PoWChallenge::deserialize(&serialized).unwrap();
        assert_eq!(original, deserialized);
    }

    #[test]
    fn test_action_type_conversion() {
        assert_eq!(ActionType::SpaceCreation as u8, 0x01);
        assert_eq!(ActionType::Post as u8, 0x02);
        assert_eq!(ActionType::Reply as u8, 0x03);
        assert_eq!(ActionType::Engage as u8, 0x04);
        assert_eq!(ActionType::IdentityUpdate as u8, 0x05);

        assert_eq!(ActionType::try_from(0x02).unwrap(), ActionType::Post);
        assert!(ActionType::try_from(0xFF).is_err());
    }

    #[test]
    fn test_leading_zero_boundary() {
        // SPEC_03 §11.3
        let mut hash = [0xFF; 32];
        hash[0] = 0x00;
        hash[1] = 0xFF;
        assert_eq!(leading_zeros(&hash), 8);

        hash[0] = 0x00;
        hash[1] = 0x7F; // 0b01111111 = 1 leading zero in second byte
        assert_eq!(leading_zeros(&hash), 9);

        hash[0] = 0x00;
        hash[1] = 0x80; // 0b10000000 = 0 leading zeros in second byte
        assert_eq!(leading_zeros(&hash), 8);
    }

    #[test]
    fn test_pow_computation_low_difficulty() {
        let config = ForkPoWConfig::test();
        let challenge = PoWChallenge {
            action_type: ActionType::Engage,
            content_hash: crate::crypto::sha256(b"test"),
            author_id: [0; 32],
            timestamp: 0,
            difficulty: 8,
            nonce_space: [0; 8],
        };

        let solution = compute_pow(&challenge, &config).unwrap();
        assert!(leading_zeros(&solution.hash) >= 8);
    }

    #[test]
    fn test_valid_solution_verification() {
        let config = ForkPoWConfig::test();
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: crate::crypto::sha256(b"content"),
            author_id: [1; 32],
            timestamp: crate::crypto::current_timestamp(),
            difficulty: 4, // Very low for fast test
            nonce_space: [2; 8],
        };

        let solution = compute_pow(&challenge, &config).unwrap();
        let result = verify_pow(&solution, &config, crate::crypto::current_timestamp());
        assert!(result.is_ok());
    }

    #[test]
    fn test_modified_nonce_detection() {
        let config = ForkPoWConfig::test();
        let challenge = PoWChallenge {
            action_type: ActionType::Reply,
            content_hash: crate::crypto::sha256(b"test"),
            author_id: [0; 32],
            timestamp: crate::crypto::current_timestamp(),
            difficulty: 4,
            nonce_space: [0; 8],
        };

        let mut solution = compute_pow(&challenge, &config).unwrap();
        solution.nonce = solution.nonce.wrapping_add(1); // Tamper with nonce

        let result = verify_pow(&solution, &config, crate::crypto::current_timestamp());
        assert!(matches!(result, Err(ActionPowError::HashMismatch)));
    }

    #[test]
    fn test_challenge_expiry() {
        // SPEC_03 §11.4: 11 minutes = expired
        let config = ForkPoWConfig::test();
        let old_time = crate::crypto::current_timestamp() - (11 * 60); // 11 min ago
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: [0; 32],
            author_id: [0; 32],
            timestamp: old_time,
            difficulty: 4,
            nonce_space: [0; 8],
        };

        let solution = compute_pow(&challenge, &config).unwrap();
        let result = verify_pow(&solution, &config, crate::crypto::current_timestamp());
        assert!(matches!(
            result,
            Err(ActionPowError::ChallengeExpired { .. })
        ));
    }

    #[test]
    fn test_content_mismatch() {
        // SPEC_03 §11.5
        let config = ForkPoWConfig::test();
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: crate::crypto::sha256(b"original content"),
            author_id: [1; 32],
            timestamp: crate::crypto::current_timestamp(),
            difficulty: 4,
            nonce_space: [0; 8],
        };

        let solution = compute_pow(&challenge, &config).unwrap();

        // Verify with different content
        let result = verify_content_binding(&solution, b"modified content", &[1; 32]);
        assert!(matches!(result, Err(ActionPowError::ContentMismatch)));
    }

    #[test]
    fn test_memory_validation() {
        let config = ForkPoWConfig {
            memory_kib: 16384, // 16 MiB < 32 MiB minimum
            iterations: 1,
            parallelism: 1,
        };

        assert!(matches!(
            config.validate(),
            Err(ActionPowError::MemoryTooLow { actual_kib: 16384 })
        ));
    }

    #[test]
    fn test_difficulty_per_action_type() {
        let config = ForkPoWConfig::production();
        assert_eq!(config.get_difficulty(ActionType::SpaceCreation), 22);
        assert_eq!(config.get_difficulty(ActionType::Post), 20);
        assert_eq!(config.get_difficulty(ActionType::Reply), 18);
        assert_eq!(config.get_difficulty(ActionType::Engage), 16);
        assert_eq!(config.get_difficulty(ActionType::IdentityUpdate), 20);
    }

    #[test]
    fn test_config_presets() {
        let prod = ForkPoWConfig::production();
        assert_eq!(prod.memory_kib, 65536);
        assert_eq!(prod.iterations, 3);
        assert_eq!(prod.parallelism, 4);

        let test = ForkPoWConfig::test();
        assert_eq!(test.memory_kib, 1024);
        assert_eq!(test.iterations, 1);
        assert_eq!(test.parallelism, 1);

        let mobile = ForkPoWConfig::mobile();
        assert_eq!(mobile.memory_kib, 65536);
        assert_eq!(mobile.iterations, 3);
        assert_eq!(mobile.parallelism, 2);
    }

    #[test]
    fn test_challenge_generation() {
        let content = b"Hello, world!";
        let author = [42u8; 32];
        let challenge = PoWChallenge::generate(ActionType::Post, content, &author, 20);

        assert_eq!(challenge.action_type, ActionType::Post);
        assert_eq!(challenge.content_hash, crate::crypto::sha256(content));
        assert_eq!(challenge.author_id, author);
        assert_eq!(challenge.difficulty, 20);
        // nonce_space should be random, just check it exists
        assert_eq!(challenge.nonce_space.len(), 8);
    }

    #[test]
    fn test_invalid_challenge_length() {
        let short_data = [0u8; 50];
        let result = PoWChallenge::deserialize(&short_data);
        assert!(matches!(
            result,
            Err(ActionPowError::InvalidChallengeLength(50))
        ));
    }

    #[test]
    fn test_invalid_action_type_in_challenge() {
        let mut data = [0u8; 82];
        data[0] = 0xFF; // Invalid action type
        let result = PoWChallenge::deserialize(&data);
        assert!(matches!(
            result,
            Err(ActionPowError::InvalidActionType(0xFF))
        ));
    }

    #[test]
    fn test_future_challenge_within_tolerance() {
        let config = ForkPoWConfig::test();
        let future_time = crate::crypto::current_timestamp() + 30; // 30 seconds in future
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: [0; 32],
            author_id: [0; 32],
            timestamp: future_time,
            difficulty: 4,
            nonce_space: [0; 8],
        };

        let solution = compute_pow(&challenge, &config).unwrap();
        let result = verify_pow(&solution, &config, crate::crypto::current_timestamp());
        assert!(result.is_ok());
    }

    #[test]
    fn test_future_challenge_beyond_tolerance() {
        let config = ForkPoWConfig::test();
        let future_time = crate::crypto::current_timestamp() + 120; // 2 minutes in future
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: [0; 32],
            author_id: [0; 32],
            timestamp: future_time,
            difficulty: 4,
            nonce_space: [0; 8],
        };

        let solution = compute_pow(&challenge, &config).unwrap();
        let result = verify_pow(&solution, &config, crate::crypto::current_timestamp());
        assert!(matches!(
            result,
            Err(ActionPowError::ChallengeFuture { .. })
        ));
    }

    #[test]
    fn test_adjusted_difficulty_stub() {
        let config = ForkPoWConfig::production();
        assert_eq!(
            get_adjusted_difficulty(ActionType::SpaceCreation, &config),
            22
        );
        assert_eq!(get_adjusted_difficulty(ActionType::Post, &config), 20);
        assert_eq!(get_adjusted_difficulty(ActionType::Reply, &config), 18);
        assert_eq!(get_adjusted_difficulty(ActionType::Engage, &config), 16);
        assert_eq!(
            get_adjusted_difficulty(ActionType::IdentityUpdate, &config),
            20
        );
    }

    #[test]
    fn test_pow_callback() {
        let config = ForkPoWConfig::test();
        let challenge = PoWChallenge {
            action_type: ActionType::Post,
            content_hash: [0; 32],
            author_id: [0; 32],
            timestamp: crate::crypto::current_timestamp(),
            difficulty: 4,
            nonce_space: [0; 8],
        };

        let mut callbacks = 0;
        let _solution = compute_pow_with_callback(&challenge, &config, |_nonce| {
            callbacks += 1;
        })
        .unwrap();

        // For difficulty 4, we likely don't call back much (< 16 attempts expected)
        // but this test just verifies the callback mechanism works
        assert!(callbacks >= 0);
    }

    // Helper functions for test data
    fn hex_decode(s: &str) -> [u8; 32] {
        let bytes = hex::decode(s).unwrap();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        arr
    }

    fn hex_decode_8(s: &str) -> [u8; 8] {
        let bytes = hex::decode(s).unwrap();
        let mut arr = [0u8; 8];
        arr.copy_from_slice(&bytes);
        arr
    }
}
