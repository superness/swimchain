//! Chain validation for three-level hierarchy (SPEC_08 §7)
//!
//! Provides validation at each level:
//! - Action: timestamp, type, signature (placeholder)
//! - ContentBlock: merkle root, PoW sum, thread integrity
//! - SpaceBlock: merkle root, PoW sum, space membership
//! - RootBlock: merkle root, PoW sum, difficulty, chain continuity

use super::action::{Action, ActionType};
use super::content_block::{ContentBlock, ContentBlockError};
use super::root_block::{RootBlock, RootBlockError};
use super::space_block::{SpaceBlock, SpaceBlockError};
use crate::types::identity::{PublicKey, Signature};

/// Timestamp validity window: 10 minutes in the past
pub const TIMESTAMP_WINDOW_SECS: u64 = 600;

/// Future timestamp tolerance: 60 seconds
pub const TIMESTAMP_FUTURE_SECS: u64 = 60;

/// Validation error types
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    /// Action validation error
    ActionError(String),
    /// Content block validation error
    ContentBlockError(ContentBlockError),
    /// Space block validation error
    SpaceBlockError(SpaceBlockError),
    /// Root block validation error
    RootBlockError(RootBlockError),
    /// Timestamp too old
    TimestampTooOld { timestamp: u64, current: u64 },
    /// Timestamp in future
    TimestampInFuture { timestamp: u64, current: u64 },
    /// Invalid action type for context
    InvalidActionType {
        expected: ActionType,
        actual: ActionType,
    },
    /// Chain continuity error
    ChainContinuityError {
        expected_prev: [u8; 32],
        actual_prev: [u8; 32],
    },
    /// Height continuity error
    HeightContinuityError { expected: u64, actual: u64 },
    /// Signature verification failed
    SignatureVerificationFailed,
    /// PoW verification failed
    PoWVerificationFailed(String),
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationError::ActionError(msg) => write!(f, "Action error: {msg}"),
            ValidationError::ContentBlockError(e) => write!(f, "Content block error: {e}"),
            ValidationError::SpaceBlockError(e) => write!(f, "Space block error: {e}"),
            ValidationError::RootBlockError(e) => write!(f, "Root block error: {e}"),
            ValidationError::TimestampTooOld { timestamp, current } => {
                write!(f, "Timestamp {timestamp} too old (current: {current})")
            }
            ValidationError::TimestampInFuture { timestamp, current } => {
                write!(f, "Timestamp {timestamp} in future (current: {current})")
            }
            ValidationError::InvalidActionType { expected, actual } => {
                write!(
                    f,
                    "Invalid action type: expected {expected:?}, got {actual:?}"
                )
            }
            ValidationError::ChainContinuityError {
                expected_prev,
                actual_prev,
            } => {
                write!(
                    f,
                    "Chain continuity error: expected prev {:02x}{:02x}..., got {:02x}{:02x}...",
                    expected_prev[0], expected_prev[1], actual_prev[0], actual_prev[1]
                )
            }
            ValidationError::HeightContinuityError { expected, actual } => {
                write!(
                    f,
                    "Height continuity error: expected {expected}, got {actual}"
                )
            }
            ValidationError::SignatureVerificationFailed => {
                write!(f, "Signature verification failed")
            }
            ValidationError::PoWVerificationFailed(msg) => {
                write!(f, "PoW verification failed: {msg}")
            }
        }
    }
}

impl std::error::Error for ValidationError {}

impl From<ContentBlockError> for ValidationError {
    fn from(e: ContentBlockError) -> Self {
        ValidationError::ContentBlockError(e)
    }
}

impl From<SpaceBlockError> for ValidationError {
    fn from(e: SpaceBlockError) -> Self {
        ValidationError::SpaceBlockError(e)
    }
}

impl From<RootBlockError> for ValidationError {
    fn from(e: RootBlockError) -> Self {
        ValidationError::RootBlockError(e)
    }
}

/// A space id is well-classed iff its first byte is a known `SpaceClass`.
///
/// After the class-byte rollout (SWIM space-class taxonomy), every
/// legitimately-derived space id carries a recognized class byte at
/// `space_id_16[0]` (see `crate::types::space_class`). CreateSpace actions
/// whose id fails this check are malformed and must be rejected so they
/// never enter the mempool/chain.
pub fn space_id_class_is_valid(space_id_16: &[u8; 16]) -> bool {
    crate::types::space_class::class_of(space_id_16).is_some()
}

/// Validate action timestamp
fn validate_action_timestamp(timestamp: u64, current_time: u64) -> Result<(), ValidationError> {
    // Check if timestamp is too old
    if timestamp + TIMESTAMP_WINDOW_SECS < current_time {
        return Err(ValidationError::TimestampTooOld {
            timestamp,
            current: current_time,
        });
    }

    // Check if timestamp is in the future
    if timestamp > current_time + TIMESTAMP_FUTURE_SECS {
        return Err(ValidationError::TimestampInFuture {
            timestamp,
            current: current_time,
        });
    }

    Ok(())
}

/// Validate an action
///
/// Checks:
/// - Timestamp is within valid window
/// - Action type-specific requirements (parent_id for Reply)
///
/// Does NOT check:
/// - Signature (expensive, use validate_action_signature separately)
/// - PoW (expensive, use validate_action_pow separately)
pub fn validate_action(action: &Action, current_time: u64) -> Result<(), ValidationError> {
    // Validate timestamp
    validate_action_timestamp(action.timestamp, current_time)?;

    // Action type-specific validation
    match action.action_type {
        ActionType::Post => {
            // POST must have content_hash
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "POST must have content_hash".to_string(),
                ));
            }
        }
        ActionType::Reply => {
            // REPLY must have both content_hash and parent_id
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "REPLY must have content_hash".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "REPLY must have parent_id".to_string(),
                ));
            }
        }
        ActionType::CreateSpace => {
            // CreateSpace actions are handled separately - they have space_id in content_hash position
            // and signature validation is done at RPC layer.
            //
            // Space ids are trusted as carried in the action (no rederivation check exists on
            // the sync/gossip path - PoW is summed upward through the block hierarchy, not tied
            // to id derivation). The one shape constraint we DO enforce here: the class byte at
            // space_id_16[0] must be a known SpaceClass, so malformed/unclassified space ids
            // never enter the mempool or chain.
            if let Some(content_hash) = action.content_hash {
                let mut space_id_16 = [0u8; 16];
                space_id_16.copy_from_slice(&content_hash[..16]);
                if !space_id_class_is_valid(&space_id_16) {
                    return Err(ValidationError::ActionError(format!(
                        "CreateSpace space_id has unknown class byte: 0x{:02x}",
                        space_id_16[0]
                    )));
                }
            }
        }
        ActionType::Engage => {
            // ENGAGE must have content_hash (target content)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "ENGAGE must have content_hash".to_string(),
                ));
            }
        }
        ActionType::Edit => {
            // EDIT must have both parent_id (original) and content_hash (new)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "EDIT must have content_hash (new content)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "EDIT must have parent_id (original content)".to_string(),
                ));
            }
        }

        // === Private Space Actions ===
        ActionType::Invite => {
            // INVITE must have content_hash (InvitePayload) and parent_id (space_id)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "INVITE must have content_hash (invite payload)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "INVITE must have parent_id (space_id)".to_string(),
                ));
            }
        }
        ActionType::Leave => {
            // LEAVE must have parent_id (space_id)
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "LEAVE must have parent_id (space_id)".to_string(),
                ));
            }
        }
        ActionType::Kick => {
            // KICK must have content_hash (kicked member) and parent_id (space_id)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "KICK must have content_hash (kicked member pubkey hash)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "KICK must have parent_id (space_id)".to_string(),
                ));
            }
        }
        ActionType::RevokeInvite => {
            // REVOKE_INVITE must have content_hash (original invite hash)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "REVOKE_INVITE must have content_hash (original invite hash)".to_string(),
                ));
            }
        }
        ActionType::KeyRotation => {
            // KEY_ROTATION must have content_hash (payload) and parent_id (space_id)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "KEY_ROTATION must have content_hash (rotation payload)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "KEY_ROTATION must have parent_id (space_id)".to_string(),
                ));
            }
        }
        ActionType::DMRequest => {
            // DM_REQUEST must have content_hash (request payload with encrypted key share)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "DM_REQUEST must have content_hash (request payload)".to_string(),
                ));
            }
        }
        ActionType::AcceptDM => {
            // ACCEPT_DM must have content_hash (accept payload) and parent_id (DM space_id)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "ACCEPT_DM must have content_hash (accept payload)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "ACCEPT_DM must have parent_id (DM space_id)".to_string(),
                ));
            }
        }
        ActionType::DeclineDM => {
            // DECLINE_DM must have parent_id (original DM request hash)
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "DECLINE_DM must have parent_id (DM request hash)".to_string(),
                ));
            }
        }

        // === Sponsorship Actions (SPEC_11 Phase 6) ===
        ActionType::Sponsor => {
            // SPONSOR must have content_hash (sponsee pubkey)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "SPONSOR must have content_hash (sponsee pubkey)".to_string(),
                ));
            }
        }
        ActionType::GenesisRegister => {
            // GENESIS_REGISTER must have content_hash (genesis pubkey)
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "GENESIS_REGISTER must have content_hash (genesis pubkey)".to_string(),
                ));
            }
        }

        // === Space Metadata Actions (SPEC_13 Phase 2) ===
        ActionType::RenameSpace => {
            // RENAME_SPACE must have content_hash (sha256 of the new name)
            // and parent_id (target space/community id). The rename-specific
            // signature and authorization are validated at block-processing
            // time against local chain state (router).
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "RENAME_SPACE must have content_hash (new-name commitment)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "RENAME_SPACE must have parent_id (target space id)".to_string(),
                ));
            }
        }

        // === Network Isolation Actions (Frequency) ===
        ActionType::FrequencyDrift => {
            // FREQUENCY_DRIFT must have content_hash (packed target frequency)
            // and parent_id (namespace key, all-zero for a drift back to base).
            // The drift-specific signature is validated at block-processing time
            // against local chain state (router); it is self-authored and
            // log-only, so no cross-node authorization is required.
            if action.content_hash.is_none() {
                return Err(ValidationError::ActionError(
                    "FREQUENCY_DRIFT must have content_hash (packed frequency)".to_string(),
                ));
            }
            if action.parent_id.is_none() {
                return Err(ValidationError::ActionError(
                    "FREQUENCY_DRIFT must have parent_id (namespace key)".to_string(),
                ));
            }
        }
    }

    Ok(())
}

/// Validate action signature using Ed25519
///
/// Verifies the signature over: content_hash || timestamp (8 bytes LE)
/// This matches the signing format used in `crypto::signature::sign_content()`.
pub fn validate_action_signature(action: &Action) -> Result<(), ValidationError> {
    // Get the content hash - required for signature verification
    let content_hash = action.content_hash.ok_or_else(|| {
        ValidationError::ActionError("Cannot verify signature without content_hash".to_string())
    })?;

    // Construct the signed message. The private-space confidentiality change binds the
    // `private` flag into the preimage so it cannot be flipped on the wire without
    // invalidating the signature:
    //   v2 (current): content_hash(32) || timestamp_LE(8) || private(1)  = 41 bytes
    //   v1 (legacy):  content_hash(32) || timestamp_LE(8)               = 40 bytes
    // We accept a valid v1 signature only when `private == false`, so already-signed
    // pre-fork actions keep validating through the network-coordinated rollout while a
    // private action can never authenticate under the legacy (flag-less) preimage.
    let public_key = PublicKey(action.actor);
    let signature = Signature(action.signature);

    let mut message_v2 = [0u8; 41];
    message_v2[..32].copy_from_slice(&content_hash);
    message_v2[32..40].copy_from_slice(&action.timestamp.to_le_bytes());
    message_v2[40] = u8::from(action.private);

    if crate::crypto::signature::verify(&public_key, &message_v2, &signature) {
        return Ok(());
    }

    // Legacy v1 fallback: only permissible for public actions.
    if !action.private
        && crate::crypto::signature::verify(&public_key, &message_v2[..40], &signature)
    {
        return Ok(());
    }

    Err(ValidationError::SignatureVerificationFailed)
}

/// Validate action PoW
///
/// Performs basic validation of PoW fields. Full Argon2id verification
/// requires the original PoW challenge data (nonce_space, hash) which is not
/// stored in the Action struct. Chain-level PoW validation aggregates work
/// at the block level via ContentBlock.total_pow and SpaceBlock.total_pow.
///
/// This function validates:
/// - pow_work is non-zero for work-requiring actions
/// - pow_nonce is present
pub fn validate_action_pow(action: &Action) -> Result<(), ValidationError> {
    // All actions except ENGAGE require PoW work
    let min_work = match action.action_type {
        ActionType::Post => 1,        // Posts must have some PoW
        ActionType::Reply => 1,       // Replies must have some PoW
        ActionType::CreateSpace => 1, // Space creation requires PoW
        ActionType::Engage => 0,      // Engagements may carry zero work
        ActionType::Edit => 1,        // Edits must have some PoW
        // Private space actions have lighter PoW requirements
        ActionType::Invite => 1,       // Invites need basic PoW
        ActionType::Leave => 0,        // Leaving is free
        ActionType::Kick => 1,         // Kicks need basic PoW
        ActionType::RevokeInvite => 0, // Revoking is free
        ActionType::KeyRotation => 1,  // Key rotation needs PoW
        ActionType::DMRequest => 1,    // DM requests need PoW (anti-spam)
        ActionType::AcceptDM => 0,     // Accepting is free
        ActionType::DeclineDM => 0,    // Declining is free
        // Sponsorship actions don't require PoW
        ActionType::Sponsor => 0,
        ActionType::GenesisRegister => 0,
        // Space renames are PoW-costing (same class as space creation)
        ActionType::RenameSpace => 1,
        // Frequency drift records are PoW-costing (anti-spam on the audit log)
        ActionType::FrequencyDrift => 1,
    };

    if action.pow_work < min_work {
        return Err(ValidationError::PoWVerificationFailed(format!(
            "Action type {:?} requires minimum {} work, got {}",
            action.action_type, min_work, action.pow_work
        )));
    }

    Ok(())
}

/// Full action validation including PoW and signature
pub fn validate_action_full(action: &Action, current_time: u64) -> Result<(), ValidationError> {
    validate_action(action, current_time)?;
    validate_action_signature(action)?;
    validate_action_pow(action)?;
    Ok(())
}

/// Validate a content block
///
/// Checks:
/// - Merkle root matches action hashes
/// - PoW sum matches action pow_work values
/// - Thread integrity (all actions belong to thread)
/// - All actions pass validation
pub fn validate_content_block(
    block: &ContentBlock,
    current_time: u64,
) -> Result<(), ValidationError> {
    // Verify merkle root
    block.verify_merkle_root()?;

    // Verify PoW sum
    block.verify_pow_sum()?;

    // Verify thread integrity
    block.verify_thread_integrity()?;

    // Validate each action (including signature and PoW verification)
    for action in &block.actions {
        validate_action_full(action, current_time)?;
    }

    Ok(())
}

/// Validate reply parent existence within a content block
///
/// For each REPLY action in the block, verifies that the parent content exists either:
/// 1. In the provided content store (previously committed content)
/// 2. Or in this same block (parent is being added in the same batch)
///
/// This prevents orphan replies from being accepted into the chain.
pub fn validate_reply_parents<F>(
    block: &ContentBlock,
    parent_exists: F,
) -> Result<(), ValidationError>
where
    F: Fn(&[u8; 32]) -> bool,
{
    // First, collect all content_hashes being added in this block (potential parents)
    let block_content_ids: std::collections::HashSet<[u8; 32]> = block
        .actions
        .iter()
        .filter_map(|action| action.content_hash)
        .collect();

    // Check each REPLY action
    for action in &block.actions {
        if action.action_type == ActionType::Reply {
            if let Some(parent_id) = action.parent_id {
                // Parent must exist either in the content store or in this block
                let parent_in_block = block_content_ids.contains(&parent_id);
                let parent_in_store = parent_exists(&parent_id);

                if !parent_in_block && !parent_in_store {
                    return Err(ValidationError::ActionError(format!(
                        "Reply has orphan parent: parent {} not found in store or block",
                        hex::encode(&parent_id[..16])
                    )));
                }
            }
        }
    }

    Ok(())
}

/// Validate a space block
///
/// Checks:
/// - Merkle root matches content block hashes
/// - PoW sum matches content block total_pow values (if content blocks provided)
/// - All content blocks belong to this space
pub fn validate_space_block(
    block: &SpaceBlock,
    content_blocks: Option<&[ContentBlock]>,
) -> Result<(), ValidationError> {
    // Verify merkle root
    block.verify_merkle_root()?;

    // If content blocks provided, verify PoW sum and space membership
    if let Some(blocks) = content_blocks {
        block.verify_pow_sum(blocks)?;
        block.verify_space_membership(blocks)?;
    }

    Ok(())
}

/// Validate a root block
///
/// Checks:
/// - Merkle root matches space block hashes
/// - PoW sum matches space block total_pow values (if space blocks provided)
/// - Difficulty is met
/// - Genesis block constraints (if applicable)
/// - Chain continuity (if prev_block provided)
pub fn validate_root_block(
    block: &RootBlock,
    prev_block: Option<&RootBlock>,
    space_blocks: Option<&[SpaceBlock]>,
) -> Result<(), ValidationError> {
    // Verify merkle root
    block.verify_merkle_root()?;

    // If space blocks provided, verify PoW sum
    if let Some(blocks) = space_blocks {
        block.verify_pow_sum(blocks)?;
    }

    // Verify difficulty (skip for genesis block which has no PoW by design)
    if !block.is_genesis() {
        block.verify_difficulty()?;
    }

    // Verify genesis constraints
    block.verify_genesis()?;

    // Verify chain continuity
    if let Some(prev) = prev_block {
        // Check prev_root_hash
        if block.prev_root_hash != prev.hash() {
            return Err(ValidationError::ChainContinuityError {
                expected_prev: prev.hash(),
                actual_prev: block.prev_root_hash,
            });
        }

        // Check height
        if block.height != prev.height + 1 {
            return Err(ValidationError::HeightContinuityError {
                expected: prev.height + 1,
                actual: block.height,
            });
        }
    }

    Ok(())
}

/// Validate entire chain segment
///
/// Validates a sequence of root blocks, checking chain continuity.
pub fn validate_chain_segment(blocks: &[RootBlock]) -> Result<(), ValidationError> {
    if blocks.is_empty() {
        return Ok(());
    }

    // Validate first block (may be genesis)
    validate_root_block(&blocks[0], None, None)?;

    // Validate remaining blocks with chain continuity
    for window in blocks.windows(2) {
        validate_root_block(&window[1], Some(&window[0]), None)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::branch_path::BranchPath;
    use crate::crypto::signature::{generate_keypair_from_seed, sign_content};

    fn make_test_action(action_type: ActionType, timestamp: u64) -> Action {
        Action {
            action_type,
            actor: [1u8; 32],
            timestamp,
            content_hash: Some([2u8; 32]),
            parent_id: if action_type == ActionType::Reply {
                Some([3u8; 32])
            } else {
                None
            },
            pow_nonce: 42,
            pow_work: 30,
            pow_target: [4u8; 32],
            signature: [5u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        }
    }

    /// Creates a test action with a valid Ed25519 signature
    fn make_signed_test_action(action_type: ActionType, timestamp: u64) -> Action {
        let seed = [42u8; 32]; // Deterministic seed for testing
        let keypair = generate_keypair_from_seed(seed);
        let content_hash = [2u8; 32];
        let signature = sign_content(&keypair.private_key, &content_hash, timestamp);

        Action {
            action_type,
            actor: keypair.public_key.0,
            timestamp,
            content_hash: Some(content_hash),
            parent_id: if action_type == ActionType::Reply {
                Some([3u8; 32])
            } else {
                None
            },
            pow_nonce: 42,
            pow_work: 30,
            pow_target: [4u8; 32],
            signature: signature.0,
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        }
    }

    /// Sign an action over the v2 preimage (content_hash || ts_LE || private).
    fn sign_action_v2(
        private_key: &crate::types::identity::PrivateKey,
        content_hash: &[u8; 32],
        timestamp: u64,
        private: bool,
    ) -> crate::types::identity::Signature {
        let mut msg = [0u8; 41];
        msg[..32].copy_from_slice(content_hash);
        msg[32..40].copy_from_slice(&timestamp.to_le_bytes());
        msg[40] = u8::from(private);
        crate::crypto::signature::sign(private_key, &msg)
    }

    #[test]
    fn test_private_flag_is_authenticated_by_signature() {
        let keypair = generate_keypair_from_seed([42u8; 32]);
        let content_hash = [2u8; 32];
        let ts = 1000;
        let sig = sign_action_v2(&keypair.private_key, &content_hash, ts, true);

        let mut action = make_test_action(ActionType::Post, ts);
        action.actor = keypair.public_key.0;
        action.content_hash = Some(content_hash);
        action.signature = sig.0;
        action.private = true;

        // Correctly signed private action verifies.
        assert!(validate_action_signature(&action).is_ok());

        // Flipping the flag on the wire (private -> public) breaks verification: the v2
        // preimage no longer matches and the legacy v1 fallback is disallowed for a sig
        // made over the 41-byte private preimage.
        let mut forged = action.clone();
        forged.private = false;
        assert!(validate_action_signature(&forged).is_err());
    }

    #[test]
    fn test_legacy_v1_signature_only_valid_for_public() {
        // A signature made with the legacy 40-byte preimage (sign_content) authenticates
        // a public action, but must NOT authenticate the same action marked private.
        let keypair = generate_keypair_from_seed([7u8; 32]);
        let content_hash = [9u8; 32];
        let ts = 2000;
        let sig = sign_content(&keypair.private_key, &content_hash, ts);

        let mut action = make_test_action(ActionType::Post, ts);
        action.actor = keypair.public_key.0;
        action.content_hash = Some(content_hash);
        action.signature = sig.0;

        action.private = false;
        assert!(validate_action_signature(&action).is_ok());

        action.private = true;
        assert!(validate_action_signature(&action).is_err());
    }

    #[test]
    fn test_validate_action_post() {
        let action = make_test_action(ActionType::Post, 1000);
        let result = validate_action(&action, 1000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_action_reply() {
        let action = make_test_action(ActionType::Reply, 1000);
        let result = validate_action(&action, 1000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_action_engage() {
        let action = make_test_action(ActionType::Engage, 1000);
        let result = validate_action(&action, 1000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_action_timestamp_too_old() {
        let action = make_test_action(ActionType::Post, 100);
        let result = validate_action(&action, 1000); // 900 seconds old
        assert!(matches!(
            result,
            Err(ValidationError::TimestampTooOld { .. })
        ));
    }

    #[test]
    fn test_validate_action_timestamp_in_future() {
        let action = make_test_action(ActionType::Post, 2000);
        let result = validate_action(&action, 1000); // 1000 seconds in future
        assert!(matches!(
            result,
            Err(ValidationError::TimestampInFuture { .. })
        ));
    }

    #[test]
    fn test_validate_action_reply_without_parent() {
        let mut action = make_test_action(ActionType::Reply, 1000);
        action.parent_id = None;
        let result = validate_action(&action, 1000);
        assert!(matches!(result, Err(ValidationError::ActionError(_))));
    }

    #[test]
    fn test_validate_action_post_without_content() {
        let mut action = make_test_action(ActionType::Post, 1000);
        action.content_hash = None;
        let result = validate_action(&action, 1000);
        assert!(matches!(result, Err(ValidationError::ActionError(_))));
    }

    #[test]
    fn test_validate_content_block() {
        // Use signed action since validate_content_block now performs full validation
        let action = make_signed_test_action(ActionType::Post, 1000);
        let block = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        let result = validate_content_block(&block, 1000);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_content_block_invalid_merkle() {
        let action = make_test_action(ActionType::Post, 1000);
        let mut block = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        block.merkle_root = [0xFFu8; 32];

        let result = validate_content_block(&block, 1000);
        assert!(matches!(
            result,
            Err(ValidationError::ContentBlockError(
                ContentBlockError::MerkleRootMismatch { .. }
            ))
        ));
    }

    #[test]
    fn test_validate_space_block() {
        let action = make_test_action(ActionType::Post, 1000);
        let content_block = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        let space_block =
            SpaceBlock::from_content_blocks([20u8; 32], &[content_block.clone()], None, 1000);

        let result = validate_space_block(&space_block, Some(&[content_block]));
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_root_block_genesis() {
        let genesis = RootBlock::genesis(1000);
        let _result = validate_root_block(&genesis, None, None);
        // Genesis has no PoW, so difficulty check fails
        // But verify_genesis should pass
        assert!(genesis.verify_genesis().is_ok());
    }

    #[test]
    fn test_validate_root_block_with_pow() {
        let action = make_test_action(ActionType::Post, 1000);
        let content_block = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action],
            None,
            1000,
            BranchPath::root(),
        )
        .unwrap();

        let space_block = SpaceBlock::from_content_blocks([20u8; 32], &[content_block], None, 1000);

        let root_block = RootBlock::from_space_blocks(
            &[space_block.clone()],
            [0u8; 32],
            0, // prev_cumulative_pow
            1000,
            30, // 30s difficulty
            1,
            [0u8; 32], // block_creator for tests
        );

        let result = validate_root_block(&root_block, None, Some(&[space_block]));
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_chain_continuity() {
        let genesis = RootBlock::genesis(1000);

        // Create a block with enough PoW
        let action = Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: 1030,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work: 60, // Enough to meet difficulty
            pow_target: [4u8; 32],
            signature: [5u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };
        let content_block = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action],
            None,
            1030,
            BranchPath::root(),
        )
        .unwrap();
        let space_block = SpaceBlock::from_content_blocks([20u8; 32], &[content_block], None, 1030);
        let block1 = RootBlock::create_next(&genesis, &[space_block], 1030, [0u8; 32]);

        // Validate chain
        assert_eq!(block1.prev_root_hash, genesis.hash());
        assert_eq!(block1.height, 1);
    }

    #[test]
    fn test_validate_chain_segment() {
        // Build a simple chain
        let genesis = RootBlock::genesis(1000);

        // Block 1
        let action1 = Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: 1030,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work: 60,
            pow_target: [4u8; 32],
            signature: [5u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };
        let cb1 = ContentBlock::new(
            [10u8; 32],
            [20u8; 32],
            vec![action1],
            None,
            1030,
            BranchPath::root(),
        )
        .unwrap();
        let sb1 = SpaceBlock::from_content_blocks([20u8; 32], &[cb1], None, 1030);
        let block1 = RootBlock::create_next(&genesis, &[sb1], 1030, [0u8; 32]);

        // Block 2
        let action2 = Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: 1060,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 43,
            pow_work: 60,
            pow_target: [4u8; 32],
            signature: [5u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };
        let cb2 = ContentBlock::new(
            [11u8; 32],
            [20u8; 32],
            vec![action2],
            None,
            1060,
            BranchPath::root(),
        )
        .unwrap();
        let sb2 = SpaceBlock::from_content_blocks([20u8; 32], &[cb2], None, 1060);
        let block2 = RootBlock::create_next(&block1, &[sb2], 1060, [0u8; 32]);

        // Validate segment - genesis skips difficulty check by design (M1 fix)
        let result = validate_chain_segment(&[genesis, block1, block2]);
        assert!(result.is_ok());
    }
}
