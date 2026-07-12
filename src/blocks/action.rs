//! Action types for block content (SPEC_08 §2.3)
//!
//! Actions represent individual operations within content blocks:
//! - POST: Create a new thread
//! - REPLY: Reply to existing content
//! - ENGAGE: Express engagement with content (individual PoW action)

use crate::crypto::sha256;
use serde_big_array::BigArray;

/// Action serialized size: 466 bytes (was 465 pre private-space confidentiality).
/// - action_type: 1 byte
/// - actor: 32 bytes
/// - timestamp: 8 bytes
/// - content_hash: 32 bytes (zeros if None)
/// - parent_id: 32 bytes (zeros if None)
/// - pow_nonce: 8 bytes
/// - pow_work: 8 bytes
/// - pow_target: 32 bytes
/// - signature: 64 bytes
/// - emoji: 1 byte (0 if None, 1-8 for reaction type)
/// - display_name_len: 1 byte (0-64, length of display name)
/// - display_name: 64 bytes (UTF-8 display name, padded with zeros) (SPEC_01 §3.5)
/// - media_ref_count: 1 byte (0-4)
/// - media_refs: 148 bytes (4 x 37 bytes each: 32 hash + 1 type + 4 size)
/// - replaces_pending_flag: 1 byte (0 = None, 1 = Some)
/// - replaces_pending: 32 bytes (hash of action to replace, zeros if None)
/// - private: 1 byte (0 = public, 1 = private-space encrypted content)
///
/// WIRE FORK: this is a hard fork of the action encoding (465 → 466). `deserialize`
/// still accepts the 465-byte legacy layout (treated as `private = false`) so
/// already-signed actions validate through the network-coordinated rollout; `serialize`
/// always emits 466. See `docs/private-spaces.md`.
pub const ACTION_SERIALIZED_SIZE: usize = 466;

/// Legacy (pre-confidentiality) action serialized size, without the trailing `private`
/// byte. Accepted by `deserialize` for backward compatibility during rollout.
pub const ACTION_SERIALIZED_SIZE_LEGACY: usize = 465;

/// Maximum number of media attachments per action
pub const MAX_MEDIA_REFS: usize = 4;

/// Size of each serialized media ref: 32 (hash) + 1 (type) + 4 (size) = 37 bytes
pub const MEDIA_REF_SERIALIZED_SIZE: usize = 37;

/// Maximum display name length in bytes (SPEC_01 §3.5)
/// Using constant from types::constants for consistency
pub const MAX_DISPLAY_NAME_LEN: usize = crate::types::constants::MAX_DISPLAY_NAME_BYTES;

/// Compact media reference for action serialization
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ActionMediaRef {
    /// SHA-256 hash of the media blob
    pub media_hash: [u8; 32],
    /// Media type (1=jpeg, 2=png, 3=gif, 4=webp)
    pub media_type: u8,
    /// Size in bytes
    pub size_bytes: u32,
}

impl ActionMediaRef {
    /// Create a new media reference
    pub fn new(media_hash: [u8; 32], media_type: u8, size_bytes: u32) -> Self {
        Self {
            media_hash,
            media_type,
            size_bytes,
        }
    }

    /// Media type constants
    pub const TYPE_JPEG: u8 = 1;
    pub const TYPE_PNG: u8 = 2;
    pub const TYPE_GIF: u8 = 3;
    pub const TYPE_WEBP: u8 = 4;
}

/// Action type discriminant (SPEC_08 §2.3)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ActionType {
    /// Create a new space (on-chain registration)
    CreateSpace = 0x00,
    /// Create a new post/thread
    Post = 0x01,
    /// Reply to existing content
    Reply = 0x02,
    /// Engage with content (individual PoW action)
    Engage = 0x03,
    /// Edit existing content (only original author can edit)
    /// parent_id = original content hash, content_hash = new content hash
    Edit = 0x04,

    // === Private Space Actions ===
    /// Invite user to existing private space
    /// content_hash = InvitePayload hash, parent_id = space_id
    Invite = 0x05,
    /// Member leaves a private space
    /// parent_id = space_id
    Leave = 0x06,
    /// Admin kicks member from private space (triggers key rotation)
    /// content_hash = kicked member pubkey hash, parent_id = space_id
    Kick = 0x07,
    /// Cancel pending invite
    /// content_hash = original invite action hash
    RevokeInvite = 0x08,
    /// Distribute new space key after kick
    /// content_hash = KeyRotationPayload hash, parent_id = space_id
    KeyRotation = 0x09,
    /// Request to start 1:1 DM
    /// content_hash = DMRequestPayload hash (includes encrypted key share)
    DMRequest = 0x0A,
    /// Accept DM request and establish shared space
    /// content_hash = AcceptPayload hash, parent_id = DM space_id
    AcceptDM = 0x0B,
    /// Decline DM request
    /// parent_id = original DMRequest action hash
    DeclineDM = 0x0C,

    // === Sponsorship Actions (SPEC_11 Phase 6) ===
    /// On-chain sponsorship record
    /// actor = sponsor pubkey, content_hash = sponsee pubkey
    Sponsor = 0x0D,
    /// On-chain genesis identity registration
    /// actor = genesis pubkey, content_hash = genesis pubkey (self-registration)
    GenesisRegister = 0x0E,

    // === Space Metadata Actions (SPEC_13 Phase 2) ===
    /// Rename a space's display name (PoW-costing, signed).
    /// actor = renamer pubkey, parent_id = target space id (32 bytes:
    /// zero-padded 16-byte space id, or a full behavioral community id),
    /// content_hash = sha256(new_name bytes) — a commitment binding the
    /// signature/PoW to the name; the name itself travels in the enclosing
    /// content block's `space_metadata` (same channel CreateSpace uses).
    /// Signature message: b"swimchain:rename_space:v1" || parent_id(32) ||
    /// content_hash(32) || timestamp(8 BE).
    /// Authorization (validated against local chain state at processing):
    /// the space creator, or a founding member for behavioral communities.
    RenameSpace = 0x0F,

    // === Network Isolation Actions (Frequency) ===
    /// Auditable record that this actor's node has drifted to (or back from) a
    /// discovery frequency (`docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`).
    /// Self-authored only: `actor` is the drifting node's identity; a node can
    /// only record its OWN drift. Log/notify only — the network effect is
    /// self-computed and never waits on this action.
    /// parent_id = 32-byte namespace key (zero-padded 16-byte space id or app
    /// namespace hash) the node concentrated on, or all-zero for a drift back
    /// to base. content_hash = target frequency packed big-endian into the
    /// first 4 bytes (0 = base). Signature message:
    /// b"swimchain:frequency_drift:v1" || parent_id(32) || content_hash(32) ||
    /// timestamp(8 BE).
    FrequencyDrift = 0x10,
}

impl TryFrom<u8> for ActionType {
    type Error = ActionError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(ActionType::CreateSpace),
            0x01 => Ok(ActionType::Post),
            0x02 => Ok(ActionType::Reply),
            0x03 => Ok(ActionType::Engage),
            0x04 => Ok(ActionType::Edit),
            0x05 => Ok(ActionType::Invite),
            0x06 => Ok(ActionType::Leave),
            0x07 => Ok(ActionType::Kick),
            0x08 => Ok(ActionType::RevokeInvite),
            0x09 => Ok(ActionType::KeyRotation),
            0x0A => Ok(ActionType::DMRequest),
            0x0B => Ok(ActionType::AcceptDM),
            0x0C => Ok(ActionType::DeclineDM),
            0x0D => Ok(ActionType::Sponsor),
            0x0E => Ok(ActionType::GenesisRegister),
            0x0F => Ok(ActionType::RenameSpace),
            0x10 => Ok(ActionType::FrequencyDrift),
            _ => Err(ActionError::InvalidActionType(value)),
        }
    }
}

/// Error types for action operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActionError {
    /// Invalid action type byte
    InvalidActionType(u8),
    /// Serialization error
    SerializationError(String),
    /// Deserialization error
    DeserializationError(String),
    /// Missing required field
    MissingField(&'static str),
}

impl std::fmt::Display for ActionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionError::InvalidActionType(v) => write!(f, "Invalid action type: {v:#04x}"),
            ActionError::SerializationError(msg) => write!(f, "Serialization error: {msg}"),
            ActionError::DeserializationError(msg) => write!(f, "Deserialization error: {msg}"),
            ActionError::MissingField(field) => write!(f, "Missing required field: {field}"),
        }
    }
}

impl std::error::Error for ActionError {}

/// Individual action within a content block (SPEC_08 §2.3)
///
/// Each action carries its own PoW proof and signature.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Action {
    /// Type of action (POST, REPLY, ENGAGE)
    pub action_type: ActionType,
    /// Public key of actor (32 bytes)
    pub actor: [u8; 32],
    /// Unix timestamp in seconds
    pub timestamp: u64,
    /// Content hash (for POST/REPLY) or target hash (for ENGAGE)
    /// None for certain action types
    pub content_hash: Option<[u8; 32]>,
    /// Parent content ID (for REPLY), None for POST/ENGAGE
    pub parent_id: Option<[u8; 32]>,
    /// PoW nonce
    pub pow_nonce: u64,
    /// Work amount in seconds (computed from PoW difficulty)
    pub pow_work: u64,
    /// PoW target hash (content-specific)
    pub pow_target: [u8; 32],
    /// Ed25519 signature (64 bytes)
    #[serde(with = "BigArray")]
    pub signature: [u8; 64],
    /// Emoji type for ENGAGE actions (1-8, None for POST/REPLY)
    /// 1=❤️, 2=👍, 3=👎, 4=😂, 5=🤔, 6=🤯, 7=🔥, 8=🏊
    pub emoji: Option<u8>,
    /// Display name chosen by the actor (max 64 UTF-8 bytes per SPEC_01 §3.5)
    /// Propagates with each action so other nodes can see it
    pub display_name: Option<String>,
    /// Media attachments for POST/REPLY actions (max 4)
    /// Each contains hash, type, and size of uploaded media blob
    pub media_refs: Vec<ActionMediaRef>,
    /// Replace-In-Mempool: If set, this action replaces a pending (unconfirmed) action.
    /// The old action must be from the same author and still in the mempool.
    /// This enables coalescing create+edit into a single on-chain action.
    pub replaces_pending: Option<[u8; 32]>,
    /// Private-space marker: `true` iff this action's content is end-to-end encrypted
    /// for a private space (text framed `[PRIVATE:v1:]`, media as `PRVM1`).
    ///
    /// This lets a node decide — WITHOUT decrypting or even fetching the body — whether
    /// content is private, so it can gate propagation/serving to members only. It is
    /// **authenticated**: folded into the signature preimage (see
    /// `blocks::validation::validate_action_signature`), so flipping it on the wire
    /// invalidates the signature. See the private-space confidentiality design spec
    /// and `docs/private-spaces.md`.
    ///
    /// STORAGE: this field is `#[serde(skip)]` so it is EXCLUDED from the serde/bincode
    /// encoding used to persist blocks (`ContentBlock` is bincode-serialized, and bincode
    /// is not self-describing — adding a field to Action would corrupt reads of all
    /// pre-existing stored blocks). The `private` bit lives only in the manual wire
    /// `serialize()`/`deserialize()` (the 466-byte format) and in memory; on the storage
    /// path it defaults to `false`. Re-deriving it for stored private content (so its
    /// 466-byte hash survives a reload) is handled in the propagation/serve-gating phase.
    #[serde(skip)]
    pub private: bool,
}

impl Action {
    /// Create a new POST action
    pub fn new_post(
        actor: [u8; 32],
        timestamp: u64,
        content_hash: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::Post,
            actor,
            timestamp,
            content_hash: Some(content_hash),
            parent_id: None,
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new POST action with media attachments
    pub fn new_post_with_media(
        actor: [u8; 32],
        timestamp: u64,
        content_hash: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
        media_refs: Vec<ActionMediaRef>,
    ) -> Self {
        Self {
            action_type: ActionType::Post,
            actor,
            timestamp,
            content_hash: Some(content_hash),
            parent_id: None,
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: media_refs.into_iter().take(MAX_MEDIA_REFS).collect(),
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new REPLY action
    pub fn new_reply(
        actor: [u8; 32],
        timestamp: u64,
        content_hash: [u8; 32],
        parent_id: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::Reply,
            actor,
            timestamp,
            content_hash: Some(content_hash),
            parent_id: Some(parent_id),
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new REPLY action with media attachments
    pub fn new_reply_with_media(
        actor: [u8; 32],
        timestamp: u64,
        content_hash: [u8; 32],
        parent_id: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
        media_refs: Vec<ActionMediaRef>,
    ) -> Self {
        Self {
            action_type: ActionType::Reply,
            actor,
            timestamp,
            content_hash: Some(content_hash),
            parent_id: Some(parent_id),
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: media_refs.into_iter().take(MAX_MEDIA_REFS).collect(),
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new ENGAGE action with emoji
    pub fn new_engage(
        actor: [u8; 32],
        timestamp: u64,
        target_content: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
        emoji: Option<u8>,
    ) -> Self {
        Self {
            action_type: ActionType::Engage,
            actor,
            timestamp,
            content_hash: Some(target_content),
            parent_id: None,
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new CREATE_SPACE action
    ///
    /// The space_id is derived from the PoW hash (first 16 bytes).
    /// The space name is stored separately in the space registry.
    pub fn new_create_space(
        actor: [u8; 32],
        timestamp: u64,
        space_id: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::CreateSpace,
            actor,
            timestamp,
            content_hash: Some(space_id), // space_id stored in content_hash field
            parent_id: None,
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new EDIT action (modify existing content)
    ///
    /// Only the original author can edit their content.
    /// The edit creates a new content version while preserving the original.
    #[must_use]
    pub fn new_edit(
        actor: [u8; 32],
        timestamp: u64,
        original_content_id: [u8; 32],
        new_content_hash: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::Edit,
            actor,
            timestamp,
            content_hash: Some(new_content_hash),
            parent_id: Some(original_content_id),
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new EDIT action with media attachments
    #[must_use]
    pub fn new_edit_with_media(
        actor: [u8; 32],
        timestamp: u64,
        original_content_id: [u8; 32],
        new_content_hash: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
        media_refs: Vec<ActionMediaRef>,
    ) -> Self {
        Self {
            action_type: ActionType::Edit,
            actor,
            timestamp,
            content_hash: Some(new_content_hash),
            parent_id: Some(original_content_id),
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: media_refs.into_iter().take(MAX_MEDIA_REFS).collect(),
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new SPONSOR action (on-chain sponsorship record, SPEC_11 Phase 6)
    ///
    /// Records a sponsorship on-chain so it propagates to all nodes via block sync.
    /// actor = sponsor pubkey, content_hash = sponsee pubkey.
    /// pow_nonce/pow_work/pow_target carry the claimant's anti-spam proof.
    #[must_use]
    pub fn new_sponsor(
        sponsor: [u8; 32],
        sponsee: [u8; 32],
        timestamp: u64,
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::Sponsor,
            actor: sponsor,
            timestamp,
            content_hash: Some(sponsee),
            parent_id: None,
            pow_nonce: 0,
            pow_work: 0,
            pow_target: [0u8; 32],
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new SPONSOR action with PoW fields populated from the claimant's proof.
    ///
    /// This variant carries the claimant's proof-of-work so every node validating the
    /// block can independently verify anti-spam work was done.
    #[must_use]
    pub fn new_sponsor_with_pow(
        sponsor: [u8; 32],
        sponsee: [u8; 32],
        timestamp: u64,
        signature: [u8; 64],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
    ) -> Self {
        Self {
            action_type: ActionType::Sponsor,
            actor: sponsor,
            timestamp,
            content_hash: Some(sponsee),
            parent_id: None,
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Create a new GENESIS_REGISTER action (on-chain genesis identity, SPEC_11 Phase 6)
    ///
    /// Records a genesis identity registration on-chain.
    /// actor = genesis pubkey, content_hash = genesis pubkey (self-registration).
    #[must_use]
    pub fn new_genesis_register(
        genesis_pubkey: [u8; 32],
        timestamp: u64,
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::GenesisRegister,
            actor: genesis_pubkey,
            timestamp,
            content_hash: Some(genesis_pubkey),
            parent_id: None,
            pow_nonce: 0,
            pow_work: 0,
            pow_target: [0u8; 32],
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Check if this is an edit action
    #[must_use]
    pub fn is_edit(&self) -> bool {
        self.action_type == ActionType::Edit
    }

    /// Get the original content ID for an Edit action
    #[must_use]
    pub fn original_content_id(&self) -> Option<[u8; 32]> {
        if self.action_type == ActionType::Edit {
            self.parent_id
        } else {
            None
        }
    }

    /// Serialize action to bytes (399 bytes)
    #[must_use]
    pub fn serialize(&self) -> [u8; ACTION_SERIALIZED_SIZE] {
        let mut buf = [0u8; ACTION_SERIALIZED_SIZE];
        let mut offset = 0;

        // action_type: 1 byte
        buf[offset] = self.action_type as u8;
        offset += 1;

        // actor: 32 bytes
        buf[offset..offset + 32].copy_from_slice(&self.actor);
        offset += 32;

        // timestamp: 8 bytes (big-endian)
        buf[offset..offset + 8].copy_from_slice(&self.timestamp.to_be_bytes());
        offset += 8;

        // content_hash: 32 bytes (zeros if None)
        if let Some(hash) = &self.content_hash {
            buf[offset..offset + 32].copy_from_slice(hash);
        }
        offset += 32;

        // parent_id: 32 bytes (zeros if None)
        if let Some(parent) = &self.parent_id {
            buf[offset..offset + 32].copy_from_slice(parent);
        }
        offset += 32;

        // pow_nonce: 8 bytes (big-endian)
        buf[offset..offset + 8].copy_from_slice(&self.pow_nonce.to_be_bytes());
        offset += 8;

        // pow_work: 8 bytes (big-endian)
        buf[offset..offset + 8].copy_from_slice(&self.pow_work.to_be_bytes());
        offset += 8;

        // pow_target: 32 bytes
        buf[offset..offset + 32].copy_from_slice(&self.pow_target);
        offset += 32;

        // signature: 64 bytes
        buf[offset..offset + 64].copy_from_slice(&self.signature);
        offset += 64;

        // emoji: 1 byte (0 if None)
        buf[offset] = self.emoji.unwrap_or(0);
        offset += 1;

        // display_name_len: 1 byte (0-64, per SPEC_01 §3.5)
        // display_name: 64 bytes (UTF-8, padded with zeros)
        if let Some(ref name) = self.display_name {
            let name_bytes = name.as_bytes();
            let len = name_bytes.len().min(MAX_DISPLAY_NAME_LEN) as u8;
            buf[offset] = len;
            offset += 1;
            buf[offset..offset + len as usize].copy_from_slice(&name_bytes[..len as usize]);
            offset += MAX_DISPLAY_NAME_LEN; // Skip to end of display_name field
        } else {
            offset += 1 + MAX_DISPLAY_NAME_LEN; // Skip len (1) + name (64)
        }

        // media_ref_count: 1 byte (0-4)
        let media_count = self.media_refs.len().min(MAX_MEDIA_REFS) as u8;
        buf[offset] = media_count;
        offset += 1;

        // media_refs: 148 bytes (4 x 37 bytes each)
        for (i, media_ref) in self.media_refs.iter().take(MAX_MEDIA_REFS).enumerate() {
            let ref_offset = offset + i * MEDIA_REF_SERIALIZED_SIZE;
            // media_hash: 32 bytes
            buf[ref_offset..ref_offset + 32].copy_from_slice(&media_ref.media_hash);
            // media_type: 1 byte
            buf[ref_offset + 32] = media_ref.media_type;
            // size_bytes: 4 bytes (big-endian)
            buf[ref_offset + 33..ref_offset + 37]
                .copy_from_slice(&media_ref.size_bytes.to_be_bytes());
        }
        offset += MAX_MEDIA_REFS * MEDIA_REF_SERIALIZED_SIZE; // 148 bytes

        // replaces_pending_flag: 1 byte (0 = None, 1 = Some)
        // replaces_pending: 32 bytes (hash of action to replace)
        if let Some(ref replaces_hash) = self.replaces_pending {
            buf[offset] = 1;
            offset += 1;
            buf[offset..offset + 32].copy_from_slice(replaces_hash);
        }
        // Remaining bytes already zero from initialization (flag = 0, hash = zeros)

        // private: 1 byte at the fixed final offset (465). Written by absolute index
        // because `offset` is not advanced in the replaces_pending == None branch.
        buf[ACTION_SERIALIZED_SIZE_LEGACY] = u8::from(self.private);

        buf
    }

    /// Deserialize action from bytes.
    ///
    /// Accepts both the current 466-byte layout and the legacy 465-byte layout
    /// (pre private-space confidentiality). A legacy buffer is decoded as
    /// `private = false`. See `ACTION_SERIALIZED_SIZE` for the wire-fork rationale.
    pub fn deserialize(data: &[u8]) -> Result<Self, ActionError> {
        if data.len() != ACTION_SERIALIZED_SIZE && data.len() != ACTION_SERIALIZED_SIZE_LEGACY {
            return Err(ActionError::DeserializationError(format!(
                "Expected {ACTION_SERIALIZED_SIZE} or {ACTION_SERIALIZED_SIZE_LEGACY} bytes, got {}",
                data.len()
            )));
        }

        // private: trailing byte, present only in the 466-byte layout.
        let private =
            data.len() == ACTION_SERIALIZED_SIZE && data[ACTION_SERIALIZED_SIZE_LEGACY] == 1;

        let mut offset = 0;

        // action_type: 1 byte
        let action_type = ActionType::try_from(data[offset])?;
        offset += 1;

        // actor: 32 bytes
        let mut actor = [0u8; 32];
        actor.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;

        // timestamp: 8 bytes (big-endian)
        let timestamp = u64::from_be_bytes(data[offset..offset + 8].try_into().map_err(|_| {
            ActionError::DeserializationError("Invalid timestamp bytes".to_string())
        })?);
        offset += 8;

        // content_hash: 32 bytes
        let mut content_hash_bytes = [0u8; 32];
        content_hash_bytes.copy_from_slice(&data[offset..offset + 32]);
        let content_hash = if content_hash_bytes == [0u8; 32] {
            None
        } else {
            Some(content_hash_bytes)
        };
        offset += 32;

        // parent_id: 32 bytes
        let mut parent_id_bytes = [0u8; 32];
        parent_id_bytes.copy_from_slice(&data[offset..offset + 32]);
        let parent_id = if parent_id_bytes == [0u8; 32] {
            None
        } else {
            Some(parent_id_bytes)
        };
        offset += 32;

        // pow_nonce: 8 bytes (big-endian)
        let pow_nonce = u64::from_be_bytes(data[offset..offset + 8].try_into().map_err(|_| {
            ActionError::DeserializationError("Invalid pow_nonce bytes".to_string())
        })?);
        offset += 8;

        // pow_work: 8 bytes (big-endian)
        let pow_work = u64::from_be_bytes(data[offset..offset + 8].try_into().map_err(|_| {
            ActionError::DeserializationError("Invalid pow_work bytes".to_string())
        })?);
        offset += 8;

        // pow_target: 32 bytes
        let mut pow_target = [0u8; 32];
        pow_target.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;

        // signature: 64 bytes
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&data[offset..offset + 64]);
        offset += 64;

        // emoji: 1 byte (0 = None)
        let emoji = if data[offset] == 0 {
            None
        } else {
            Some(data[offset])
        };
        offset += 1;

        // display_name_len: 1 byte (0-64, per SPEC_01 §3.5)
        // display_name: 64 bytes (UTF-8, padded with zeros)
        let display_name_len = data[offset] as usize;
        offset += 1;
        let display_name = if display_name_len == 0 || display_name_len > MAX_DISPLAY_NAME_LEN {
            None
        } else {
            let name_bytes = &data[offset..offset + display_name_len];
            Some(String::from_utf8(name_bytes.to_vec()).map_err(|e| {
                ActionError::DeserializationError(format!("Invalid UTF-8 in display_name: {e}"))
            })?)
        };
        offset += MAX_DISPLAY_NAME_LEN; // Skip to end of display_name field

        // media_ref_count: 1 byte (0-4)
        let media_count = data[offset].min(MAX_MEDIA_REFS as u8) as usize;
        offset += 1;

        // media_refs: 148 bytes (4 x 37 bytes each)
        let mut media_refs = Vec::with_capacity(media_count);
        for i in 0..media_count {
            let ref_offset = offset + i * MEDIA_REF_SERIALIZED_SIZE;

            // media_hash: 32 bytes
            let mut media_hash = [0u8; 32];
            media_hash.copy_from_slice(&data[ref_offset..ref_offset + 32]);

            // Skip if hash is all zeros (empty slot)
            if media_hash == [0u8; 32] {
                continue;
            }

            // media_type: 1 byte
            let media_type = data[ref_offset + 32];

            // size_bytes: 4 bytes (big-endian)
            let size_bytes =
                u32::from_be_bytes(data[ref_offset + 33..ref_offset + 37].try_into().map_err(
                    |_| ActionError::DeserializationError("Invalid media size_bytes".to_string()),
                )?);

            media_refs.push(ActionMediaRef {
                media_hash,
                media_type,
                size_bytes,
            });
        }
        offset += MAX_MEDIA_REFS * MEDIA_REF_SERIALIZED_SIZE; // 148 bytes

        // replaces_pending_flag: 1 byte (0 = None, 1 = Some)
        // replaces_pending: 32 bytes
        let replaces_pending_flag = data[offset];
        offset += 1;
        let replaces_pending = if replaces_pending_flag == 0 {
            None
        } else {
            let mut replaces_hash = [0u8; 32];
            replaces_hash.copy_from_slice(&data[offset..offset + 32]);
            Some(replaces_hash)
        };

        Ok(Self {
            action_type,
            actor,
            timestamp,
            content_hash,
            parent_id,
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji,
            display_name,
            media_refs,
            replaces_pending,
            private,
        })
    }

    /// Compute hash of this action.
    ///
    /// BACKWARD COMPATIBILITY: a **public** action (`private == false`) is hashed over the
    /// legacy 465-byte layout, i.e. WITHOUT the trailing `private` byte, so its hash is
    /// byte-identical to the pre-confidentiality encoding. This keeps the merkle roots of
    /// all existing (public) content valid on upgraded nodes — the private-space wire fork
    /// grows the on-wire action to 466 bytes but must not change the identity of content
    /// that predates it. A **private** action is hashed over the full 466 bytes.
    /// See `docs/private-spaces.md`.
    #[must_use]
    pub fn hash(&self) -> [u8; 32] {
        let full = self.serialize();
        let len = if self.private {
            ACTION_SERIALIZED_SIZE
        } else {
            ACTION_SERIALIZED_SIZE_LEGACY
        };
        sha256(&full[..len])
    }

    /// Create a new RENAME_SPACE action (SPEC_13 Phase 2).
    ///
    /// `target_space_id` is the 32-byte target (zero-padded 16-byte space id
    /// or a full behavioral community id); `new_name_hash` is
    /// `sha256(new_name bytes)`. The plaintext name travels via the content
    /// block's `space_metadata`, exactly like CreateSpace.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new_rename_space(
        actor: [u8; 32],
        timestamp: u64,
        target_space_id: [u8; 32],
        new_name_hash: [u8; 32],
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        Self {
            action_type: ActionType::RenameSpace,
            actor,
            timestamp,
            content_hash: Some(new_name_hash),
            parent_id: Some(target_space_id),
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Build the signing message for a RenameSpace action:
    /// b"swimchain:rename_space:v1" || target(32) || name_hash(32) || timestamp(8 BE)
    #[must_use]
    pub fn rename_space_signing_message(
        target_space_id: &[u8; 32],
        new_name_hash: &[u8; 32],
        timestamp: u64,
    ) -> Vec<u8> {
        let tag = b"swimchain:rename_space:v1";
        let mut msg = Vec::with_capacity(tag.len() + 32 + 32 + 8);
        msg.extend_from_slice(tag);
        msg.extend_from_slice(target_space_id);
        msg.extend_from_slice(new_name_hash);
        msg.extend_from_slice(&timestamp.to_be_bytes());
        msg
    }

    /// Check if this is a rename-space action
    #[must_use]
    pub fn is_rename_space(&self) -> bool {
        self.action_type == ActionType::RenameSpace
    }

    /// Create a new FREQUENCY_DRIFT action (network isolation, audit log).
    ///
    /// `namespace_key` is the 32-byte namespace the node concentrated on
    /// (zero-padded 16-byte space id or app-namespace hash), or all-zero for a
    /// drift back to base. `frequency` is the target discovery frequency (0 =
    /// base), packed big-endian into the first 4 bytes of `content_hash`.
    /// Self-authored only: `actor` is the drifting node's own identity.
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new_frequency_drift(
        actor: [u8; 32],
        timestamp: u64,
        namespace_key: [u8; 32],
        frequency: u32,
        pow_nonce: u64,
        pow_work: u64,
        pow_target: [u8; 32],
        signature: [u8; 64],
    ) -> Self {
        let mut freq_commit = [0u8; 32];
        freq_commit[..4].copy_from_slice(&frequency.to_be_bytes());
        Self {
            action_type: ActionType::FrequencyDrift,
            actor,
            timestamp,
            content_hash: Some(freq_commit),
            parent_id: Some(namespace_key),
            pow_nonce,
            pow_work,
            pow_target,
            signature,
            emoji: None,
            display_name: None,
            media_refs: vec![],
            replaces_pending: None,
            private: false,
        }
    }

    /// Build the signing message for a FrequencyDrift action:
    /// b"swimchain:frequency_drift:v1" || namespace_key(32) || freq_commit(32) || timestamp(8 BE)
    #[must_use]
    pub fn frequency_drift_signing_message(
        namespace_key: &[u8; 32],
        freq_commit: &[u8; 32],
        timestamp: u64,
    ) -> Vec<u8> {
        let tag = b"swimchain:frequency_drift:v1";
        let mut msg = Vec::with_capacity(tag.len() + 32 + 32 + 8);
        msg.extend_from_slice(tag);
        msg.extend_from_slice(namespace_key);
        msg.extend_from_slice(freq_commit);
        msg.extend_from_slice(&timestamp.to_be_bytes());
        msg
    }

    /// Check if this is a frequency-drift action.
    #[must_use]
    pub fn is_frequency_drift(&self) -> bool {
        self.action_type == ActionType::FrequencyDrift
    }

    /// The target frequency of a FrequencyDrift action (0 = base), read from the
    /// first 4 bytes of `content_hash`. Returns `None` for other action types.
    #[must_use]
    pub fn frequency_drift_target(&self) -> Option<u32> {
        if self.action_type != ActionType::FrequencyDrift {
            return None;
        }
        self.content_hash
            .map(|c| u32::from_be_bytes([c[0], c[1], c[2], c[3]]))
    }

    /// Get the target space id for a RenameSpace action
    #[must_use]
    pub fn rename_target_space_id(&self) -> Option<[u8; 32]> {
        if self.action_type == ActionType::RenameSpace {
            self.parent_id
        } else {
            None
        }
    }

    /// Check if this is a thread-creating action
    #[must_use]
    pub fn is_thread_root(&self) -> bool {
        self.action_type == ActionType::Post
    }

    /// Check if this is a space creation action
    #[must_use]
    pub fn is_create_space(&self) -> bool {
        self.action_type == ActionType::CreateSpace
    }

    /// Get the space_id for a CreateSpace action
    #[must_use]
    pub fn space_id(&self) -> Option<[u8; 32]> {
        if self.action_type == ActionType::CreateSpace {
            self.content_hash
        } else {
            None
        }
    }

    /// Check if this is a sponsorship action (Sponsor or GenesisRegister)
    #[must_use]
    pub fn is_sponsorship(&self) -> bool {
        matches!(
            self.action_type,
            ActionType::Sponsor | ActionType::GenesisRegister
        )
    }

    /// Get the sponsee pubkey for a Sponsor action
    #[must_use]
    pub fn sponsee_pubkey(&self) -> Option<[u8; 32]> {
        if self.action_type == ActionType::Sponsor {
            self.content_hash
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_action() -> Action {
        Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: 1234567890,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work: 30,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        }
    }

    #[test]
    fn test_action_type_discriminants() {
        assert_eq!(ActionType::CreateSpace as u8, 0x00);
        assert_eq!(ActionType::Post as u8, 0x01);
        assert_eq!(ActionType::Reply as u8, 0x02);
        assert_eq!(ActionType::Engage as u8, 0x03);
        assert_eq!(ActionType::Edit as u8, 0x04);
        // Private space actions
        assert_eq!(ActionType::Invite as u8, 0x05);
        assert_eq!(ActionType::Leave as u8, 0x06);
        assert_eq!(ActionType::Kick as u8, 0x07);
        assert_eq!(ActionType::RevokeInvite as u8, 0x08);
        assert_eq!(ActionType::KeyRotation as u8, 0x09);
        assert_eq!(ActionType::DMRequest as u8, 0x0A);
        assert_eq!(ActionType::AcceptDM as u8, 0x0B);
        assert_eq!(ActionType::DeclineDM as u8, 0x0C);
        // Sponsorship actions
        assert_eq!(ActionType::Sponsor as u8, 0x0D);
        assert_eq!(ActionType::GenesisRegister as u8, 0x0E);
        // Space metadata actions
        assert_eq!(ActionType::RenameSpace as u8, 0x0F);
    }

    #[test]
    fn test_action_type_try_from() {
        assert_eq!(ActionType::try_from(0x00).unwrap(), ActionType::CreateSpace);
        assert_eq!(ActionType::try_from(0x01).unwrap(), ActionType::Post);
        assert_eq!(ActionType::try_from(0x02).unwrap(), ActionType::Reply);
        assert_eq!(ActionType::try_from(0x03).unwrap(), ActionType::Engage);
        assert_eq!(ActionType::try_from(0x04).unwrap(), ActionType::Edit);
        // Private space actions
        assert_eq!(ActionType::try_from(0x05).unwrap(), ActionType::Invite);
        assert_eq!(ActionType::try_from(0x06).unwrap(), ActionType::Leave);
        assert_eq!(ActionType::try_from(0x07).unwrap(), ActionType::Kick);
        assert_eq!(
            ActionType::try_from(0x08).unwrap(),
            ActionType::RevokeInvite
        );
        assert_eq!(ActionType::try_from(0x09).unwrap(), ActionType::KeyRotation);
        assert_eq!(ActionType::try_from(0x0A).unwrap(), ActionType::DMRequest);
        assert_eq!(ActionType::try_from(0x0B).unwrap(), ActionType::AcceptDM);
        assert_eq!(ActionType::try_from(0x0C).unwrap(), ActionType::DeclineDM);
        // Sponsorship actions
        assert_eq!(ActionType::try_from(0x0D).unwrap(), ActionType::Sponsor);
        assert_eq!(
            ActionType::try_from(0x0E).unwrap(),
            ActionType::GenesisRegister
        );
        // Space metadata actions
        assert_eq!(ActionType::try_from(0x0F).unwrap(), ActionType::RenameSpace);
        assert!(ActionType::try_from(0x10).is_err());
        assert!(ActionType::try_from(0xFF).is_err());
    }

    #[test]
    fn test_new_rename_space() {
        let target = [0xab; 32];
        let name_hash = sha256(b"new-name");
        let action = Action::new_rename_space(
            [1u8; 32], 1000, target, name_hash, 42, 60, [3u8; 32], [4u8; 64],
        );
        assert_eq!(action.action_type, ActionType::RenameSpace);
        assert!(action.is_rename_space());
        assert_eq!(action.rename_target_space_id(), Some(target));
        assert_eq!(action.content_hash, Some(name_hash));
        assert!(!action.is_thread_root());
        assert!(!action.is_create_space());
        assert_eq!(action.space_id(), None);

        // Wire roundtrip within the fixed action size.
        let serialized = action.serialize();
        assert_eq!(serialized.len(), ACTION_SERIALIZED_SIZE);
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
    }

    #[test]
    fn test_rename_space_signing_message_is_deterministic_and_binding() {
        let target = [0xab; 32];
        let hash = sha256(b"new-name");
        let m1 = Action::rename_space_signing_message(&target, &hash, 1000);
        let m2 = Action::rename_space_signing_message(&target, &hash, 1000);
        assert_eq!(m1, m2);
        // Changing any input changes the message.
        assert_ne!(
            m1,
            Action::rename_space_signing_message(&target, &hash, 1001)
        );
        assert_ne!(
            m1,
            Action::rename_space_signing_message(&[0xacu8; 32], &hash, 1000)
        );
        assert_ne!(
            m1,
            Action::rename_space_signing_message(&target, &sha256(b"other"), 1000)
        );
        // Domain-separated.
        assert!(m1.starts_with(b"swimchain:rename_space:v1"));
    }

    #[test]
    fn test_new_edit() {
        let original_id = [0xaa; 32];
        let new_content = [0xbb; 32];
        let action = Action::new_edit(
            [1u8; 32],
            1000,
            original_id,
            new_content,
            42,
            15,
            [3u8; 32],
            [4u8; 64],
        );
        assert_eq!(action.action_type, ActionType::Edit);
        assert!(action.is_edit());
        assert_eq!(action.content_hash, Some(new_content));
        assert_eq!(action.parent_id, Some(original_id));
        assert_eq!(action.original_content_id(), Some(original_id));
        assert!(!action.is_thread_root());
    }

    #[test]
    fn test_action_serialization_size() {
        let action = make_test_action();
        let serialized = action.serialize();
        assert_eq!(serialized.len(), ACTION_SERIALIZED_SIZE);
        assert_eq!(serialized.len(), 466);
    }

    #[test]
    fn test_private_flag_serialized_at_final_byte() {
        let mut action = make_test_action();
        action.private = false;
        assert_eq!(action.serialize()[465], 0);
        action.private = true;
        assert_eq!(action.serialize()[465], 1);
    }

    #[test]
    fn test_private_flag_excluded_from_bincode_storage() {
        // ContentBlock is persisted via bincode; the private flag must NOT change the
        // serde/bincode layout, or existing stored blocks become unreadable. Bincode of a
        // private and a public action must be byte-identical, and decode to private=false.
        let mut public = make_test_action();
        public.private = false;
        let mut private = make_test_action();
        private.private = true;

        let pub_bytes = bincode::serialize(&public).unwrap();
        let priv_bytes = bincode::serialize(&private).unwrap();
        assert_eq!(pub_bytes, priv_bytes, "private must be skipped in bincode");

        let decoded: Action = bincode::deserialize(&priv_bytes).unwrap();
        assert!(!decoded.private, "storage path defaults private to false");
    }

    #[test]
    fn test_public_action_hash_is_backward_compatible() {
        // A public action must hash over the legacy 465-byte layout (no trailing private
        // byte), so existing content identity / merkle roots survive the wire fork.
        let mut action = make_test_action();
        action.private = false;
        let full = action.serialize();
        assert_eq!(full.len(), 466);
        assert_eq!(action.hash(), crate::crypto::sha256(&full[..465]));
        // and NOT the naive full-466 hash (proves the slice matters)
        assert_ne!(action.hash(), crate::crypto::sha256(&full[..]));
    }

    #[test]
    fn test_private_action_hash_covers_full_466() {
        let mut action = make_test_action();
        action.private = true;
        let full = action.serialize();
        assert_eq!(action.hash(), crate::crypto::sha256(&full[..]));
        // private flips the trailing byte, so its hash differs from the public hash
        let mut public = action.clone();
        public.private = false;
        assert_ne!(action.hash(), public.hash());
    }

    #[test]
    fn test_private_flag_roundtrip() {
        for private in [false, true] {
            let mut action = make_test_action();
            action.private = private;
            let de = Action::deserialize(&action.serialize()).unwrap();
            assert_eq!(de.private, private);
            assert_eq!(de, action);
        }
    }

    #[test]
    fn test_legacy_465_byte_action_deserializes_as_public() {
        // A 466-byte private action, truncated to the legacy 465-byte layout, must decode
        // as public (private = false) so pre-fork wire data still validates.
        let mut action = make_test_action();
        action.private = true;
        let full = action.serialize();
        let legacy = &full[..ACTION_SERIALIZED_SIZE_LEGACY];
        assert_eq!(legacy.len(), 465);
        let de = Action::deserialize(legacy).unwrap();
        assert!(!de.private);
        // Every other field is byte-identical to the private original.
        assert_eq!(
            de,
            Action {
                private: false,
                ..action
            }
        );
    }

    #[test]
    fn test_action_serialization_roundtrip() {
        let action = make_test_action();
        let serialized = action.serialize();
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
    }

    #[test]
    fn test_action_with_parent_id_roundtrip() {
        let action = Action {
            action_type: ActionType::Reply,
            actor: [1u8; 32],
            timestamp: 1234567890,
            content_hash: Some([2u8; 32]),
            parent_id: Some([5u8; 32]),
            pow_nonce: 42,
            pow_work: 10,
            pow_target: [3u8; 32],
            signature: [4u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };
        let serialized = action.serialize();
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
    }

    #[test]
    fn test_action_without_content_hash_roundtrip() {
        let mut action = make_test_action();
        action.content_hash = None;
        let serialized = action.serialize();
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
    }

    #[test]
    fn test_action_hash_deterministic() {
        let action = make_test_action();
        let hash1 = action.hash();
        let hash2 = action.hash();
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_action_hash_changes_with_content() {
        let action1 = make_test_action();
        let mut action2 = make_test_action();
        action2.pow_work = 60;
        assert_ne!(action1.hash(), action2.hash());
    }

    #[test]
    fn test_new_post() {
        let action = Action::new_post([1u8; 32], 1000, [2u8; 32], 42, 30, [3u8; 32], [4u8; 64]);
        assert_eq!(action.action_type, ActionType::Post);
        assert!(action.content_hash.is_some());
        assert!(action.parent_id.is_none());
        assert!(action.is_thread_root());
    }

    #[test]
    fn test_new_reply() {
        let action = Action::new_reply(
            [1u8; 32], 1000, [2u8; 32], [5u8; 32], 42, 10, [3u8; 32], [4u8; 64],
        );
        assert_eq!(action.action_type, ActionType::Reply);
        assert!(action.content_hash.is_some());
        assert!(action.parent_id.is_some());
        assert!(!action.is_thread_root());
    }

    #[test]
    fn test_new_engage() {
        let action = Action::new_engage(
            [1u8; 32],
            1000,
            [2u8; 32],
            42,
            20,
            [3u8; 32],
            [4u8; 64],
            Some(1),
        );
        assert_eq!(action.action_type, ActionType::Engage);
        assert!(action.content_hash.is_some());
        assert!(action.parent_id.is_none());
        assert!(!action.is_thread_root());
        assert_eq!(action.emoji, Some(1));
    }

    #[test]
    fn test_new_create_space() {
        let space_id = [0xab; 32];
        let action =
            Action::new_create_space([1u8; 32], 1000, space_id, 42, 60, [3u8; 32], [4u8; 64]);
        assert_eq!(action.action_type, ActionType::CreateSpace);
        assert!(action.is_create_space());
        assert!(!action.is_thread_root());
        assert_eq!(action.space_id(), Some(space_id));
        assert!(action.parent_id.is_none());
        assert!(action.emoji.is_none());
    }

    #[test]
    fn test_deserialization_wrong_size() {
        let result = Action::deserialize(&[0u8; 100]);
        assert!(result.is_err());
    }

    #[test]
    fn test_action_with_replaces_pending_roundtrip() {
        let mut action = make_test_action();
        action.replaces_pending = Some([0xaa; 32]);
        let serialized = action.serialize();
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
        assert_eq!(deserialized.replaces_pending, Some([0xaa; 32]));
    }

    #[test]
    fn test_action_without_replaces_pending_roundtrip() {
        let action = make_test_action();
        assert!(action.replaces_pending.is_none());
        let serialized = action.serialize();
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
        assert!(deserialized.replaces_pending.is_none());
    }

    #[test]
    fn test_new_sponsor() {
        let sponsor = [1u8; 32];
        let sponsee = [2u8; 32];
        let action = Action::new_sponsor(sponsor, sponsee, 1000, [4u8; 64]);
        assert_eq!(action.action_type, ActionType::Sponsor);
        assert_eq!(action.actor, sponsor);
        assert_eq!(action.content_hash, Some(sponsee));
        assert!(action.parent_id.is_none());
        assert!(action.is_sponsorship());
        assert!(!action.is_thread_root());
        assert!(!action.is_create_space());
        assert_eq!(action.sponsee_pubkey(), Some(sponsee));
    }

    #[test]
    fn test_new_genesis_register() {
        let genesis = [1u8; 32];
        let action = Action::new_genesis_register(genesis, 1000, [4u8; 64]);
        assert_eq!(action.action_type, ActionType::GenesisRegister);
        assert_eq!(action.actor, genesis);
        assert_eq!(action.content_hash, Some(genesis)); // self-registration
        assert!(action.parent_id.is_none());
        assert!(action.is_sponsorship());
        assert!(!action.is_thread_root());
    }

    #[test]
    fn test_sponsor_action_roundtrip() {
        let action = Action::new_sponsor([1u8; 32], [2u8; 32], 1000, [4u8; 64]);
        let serialized = action.serialize();
        assert_eq!(serialized.len(), ACTION_SERIALIZED_SIZE);
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
    }

    #[test]
    fn test_genesis_register_action_roundtrip() {
        let action = Action::new_genesis_register([1u8; 32], 1000, [4u8; 64]);
        let serialized = action.serialize();
        assert_eq!(serialized.len(), ACTION_SERIALIZED_SIZE);
        let deserialized = Action::deserialize(&serialized).unwrap();
        assert_eq!(action, deserialized);
    }
}
