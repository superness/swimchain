//! Content types per SPEC_02
//!
//! Types for posts, replies, media references, and engagement tracking.

use std::fmt;

use super::identity::{IdentityId, Signature};

/// Content hash - SHA-256 hash of content (32 bytes)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default, serde::Serialize, serde::Deserialize)]
pub struct ContentHash(pub [u8; 32]);

impl ContentHash {
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
}

impl fmt::Debug for ContentHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ContentHash(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for ContentHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Content identifier - unique ID for content items (32 bytes)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default, serde::Serialize, serde::Deserialize)]
pub struct ContentId(pub [u8; 32]);

impl ContentId {
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
}

impl fmt::Debug for ContentId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ContentId(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for ContentId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Space identifier (32 bytes)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default, serde::Serialize, serde::Deserialize)]
pub struct SpaceId(pub [u8; 32]);

impl SpaceId {
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
}

impl fmt::Debug for SpaceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "SpaceId(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for SpaceId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Content type discriminants (SPEC_02 §3.2)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ContentType {
    /// Original post
    Post = 0x00,
    /// Reply to another post
    Reply = 0x01,
    /// Quote of another post
    Quote = 0x02,
    /// Edit of existing content
    Edit = 0x03,
}

impl TryFrom<u8> for ContentType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(ContentType::Post),
            0x01 => Ok(ContentType::Reply),
            0x02 => Ok(ContentType::Quote),
            0x03 => Ok(ContentType::Edit),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Media type discriminants (SPEC_02 §3.3)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum MediaType {
    /// JPEG image
    ImageJpeg = 0x01,
    /// PNG image
    ImagePng = 0x02,
    /// GIF image
    ImageGif = 0x03,
    /// WebP image
    ImageWebp = 0x04,
}

impl TryFrom<u8> for MediaType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(MediaType::ImageJpeg),
            0x02 => Ok(MediaType::ImagePng),
            0x03 => Ok(MediaType::ImageGif),
            0x04 => Ok(MediaType::ImageWebp),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Media reference (SPEC_02 §3.3)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct MediaRef {
    /// Hash of the media content
    pub media_hash: ContentHash,
    /// Type of media
    pub media_type: MediaType,
    /// Size in bytes
    pub size_bytes: u32,
    /// Optional inline preview (max 1024 bytes)
    pub inline_preview: Option<Vec<u8>>,
}

/// Pin type discriminants (SPEC_02 §3.4)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum PinType {
    /// Pinned by author
    Author = 0x01,
    /// Pinned by community
    Community = 0x02,
}

impl TryFrom<u8> for PinType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(PinType::Author),
            0x02 => Ok(PinType::Community),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Pin state (SPEC_02 §3.4)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct PinState {
    /// Type of pin
    pub pin_type: PinType,
    /// Creation timestamp (UNIX milliseconds)
    pub pin_created: u64,
    /// Optional expiry timestamp (UNIX milliseconds)
    pub pin_expiry: Option<u64>,
    /// Cost paid for pinning
    pub pin_cost: u64,
}

/// Content item (SPEC_02 §3.1)
///
/// All timestamps are UNIX milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ContentItem {
    /// Unique content identifier
    pub content_id: ContentId,
    /// Author's identity
    pub author_id: IdentityId,
    /// Type of content
    pub content_type: ContentType,
    /// Space this content belongs to
    pub space_id: SpaceId,
    /// Parent content ID (for replies/quotes)
    pub parent_id: Option<ContentId>,
    /// Creation timestamp (UNIX milliseconds)
    pub created_at: u64,
    /// Last meaningful engagement timestamp (UNIX milliseconds) (SPEC_02 §3.1)
    pub last_engagement: u64,
    /// Inline body text (for content <= 1024 bytes)
    pub body_inline: Option<String>,
    /// Hash of external body (for content > 1024 bytes)
    pub content_hash: Option<ContentHash>,
    /// Size of content blob in bytes (for >1KB content) (SPEC_02 §3.1)
    pub content_size: Option<u32>,
    /// MIME type of content blob (SPEC_02 §3.1)
    pub content_type_mime: Option<String>,
    /// Media attachments (max 4)
    pub media_refs: Vec<MediaRef>,
    /// Pin state if pinned
    pub pin_state: Option<PinState>,
    /// Engagement count
    pub engagement_count: u32,
    /// Author signature
    pub signature: Signature,
    /// Proof of work nonce for engagement
    pub pow_nonce: u64,
    /// PoW difficulty level met (SPEC_02 §3.1)
    pub pow_difficulty: u8,
    /// Optional author preservation PoW (SPEC_02 §3.1)
    pub preservation_pow: Option<u64>,
    /// Author's display name (if provided when action was created)
    pub display_name: Option<String>,
}

/// Engagement type discriminants (SPEC_02 §3.5)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum EngagementType {
    /// Reply engagement
    Reply = 0x01,
    /// Quote engagement
    Quote = 0x02,
    /// Direct engagement (like/boost)
    Engage = 0x03,
}

impl TryFrom<u8> for EngagementType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(EngagementType::Reply),
            0x02 => Ok(EngagementType::Quote),
            0x03 => Ok(EngagementType::Engage),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Engagement record (SPEC_02 §3.5)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct EngagementRecord {
    /// Content being engaged with
    pub content_id: ContentId,
    /// User engaging
    pub engager_id: IdentityId,
    /// Type of engagement
    pub engagement_type: EngagementType,
    /// Engagement timestamp (UNIX milliseconds)
    pub timestamp: u64,
    /// PoW nonce
    pub pow_nonce: u64,
    /// Work amount computed (in Argon2id iterations equivalent)
    pub pow_work: u64,
    /// Signature over engagement
    pub signature: Signature,
    /// Emoji type for reactions (1-8, None for generic engage)
    /// 1=❤️, 2=👍, 3=👎, 4=😂, 5=🤔, 6=🤯, 7=🔥, 8=🏊
    pub emoji: Option<u8>,
}

/// Reaction type for Discord-style emoji reactions
///
/// Each emoji type has a unique discriminant.
/// Users can add one reaction of each type per content item.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ReactionType {
    /// Heart reaction ❤️
    Heart = 0x01,
    /// Thumbs up reaction 👍
    ThumbsUp = 0x02,
    /// Thumbs down reaction 👎
    ThumbsDown = 0x03,
    /// Laugh reaction 😂
    Laugh = 0x04,
    /// Thinking reaction 🤔
    Thinking = 0x05,
    /// Mind blown reaction 🤯
    MindBlown = 0x06,
    /// Fire reaction 🔥
    Fire = 0x07,
    /// Swimming reaction 🏊 (SwimChain special!)
    Swimming = 0x08,
}

impl ReactionType {
    /// Get the emoji representation
    #[must_use]
    pub const fn emoji(&self) -> &'static str {
        match self {
            Self::Heart => "❤️",
            Self::ThumbsUp => "👍",
            Self::ThumbsDown => "👎",
            Self::Laugh => "😂",
            Self::Thinking => "🤔",
            Self::MindBlown => "🤯",
            Self::Fire => "🔥",
            Self::Swimming => "🏊",
        }
    }

    /// Get all reaction types
    #[must_use]
    pub fn all() -> [Self; 8] {
        [
            Self::Heart,
            Self::ThumbsUp,
            Self::ThumbsDown,
            Self::Laugh,
            Self::Thinking,
            Self::MindBlown,
            Self::Fire,
            Self::Swimming,
        ]
    }
}

impl TryFrom<u8> for ReactionType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(Self::Heart),
            0x02 => Ok(Self::ThumbsUp),
            0x03 => Ok(Self::ThumbsDown),
            0x04 => Ok(Self::Laugh),
            0x05 => Ok(Self::Thinking),
            0x06 => Ok(Self::MindBlown),
            0x07 => Ok(Self::Fire),
            0x08 => Ok(Self::Swimming),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// A user's reaction to content
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Reaction {
    /// Content being reacted to
    pub content_id: ContentId,
    /// User who reacted
    pub reactor_id: IdentityId,
    /// Type of reaction (emoji)
    pub reaction_type: ReactionType,
    /// Reaction timestamp (UNIX milliseconds)
    pub timestamp: u64,
    /// Signature over reaction data
    pub signature: Signature,
}

/// Aggregated reaction counts for a content item
#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ReactionCounts {
    /// Heart count ❤️
    pub heart: u32,
    /// Thumbs up count 👍
    pub thumbs_up: u32,
    /// Thumbs down count 👎
    pub thumbs_down: u32,
    /// Laugh count 😂
    pub laugh: u32,
    /// Thinking count 🤔
    pub thinking: u32,
    /// Mind blown count 🤯
    pub mind_blown: u32,
    /// Fire count 🔥
    pub fire: u32,
    /// Swimming count 🏊
    pub swimming: u32,
}

impl ReactionCounts {
    /// Create new empty reaction counts
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Get count for a specific reaction type
    #[must_use]
    pub fn get(&self, reaction_type: ReactionType) -> u32 {
        match reaction_type {
            ReactionType::Heart => self.heart,
            ReactionType::ThumbsUp => self.thumbs_up,
            ReactionType::ThumbsDown => self.thumbs_down,
            ReactionType::Laugh => self.laugh,
            ReactionType::Thinking => self.thinking,
            ReactionType::MindBlown => self.mind_blown,
            ReactionType::Fire => self.fire,
            ReactionType::Swimming => self.swimming,
        }
    }

    /// Increment count for a specific reaction type
    pub fn increment(&mut self, reaction_type: ReactionType) {
        match reaction_type {
            ReactionType::Heart => self.heart = self.heart.saturating_add(1),
            ReactionType::ThumbsUp => self.thumbs_up = self.thumbs_up.saturating_add(1),
            ReactionType::ThumbsDown => self.thumbs_down = self.thumbs_down.saturating_add(1),
            ReactionType::Laugh => self.laugh = self.laugh.saturating_add(1),
            ReactionType::Thinking => self.thinking = self.thinking.saturating_add(1),
            ReactionType::MindBlown => self.mind_blown = self.mind_blown.saturating_add(1),
            ReactionType::Fire => self.fire = self.fire.saturating_add(1),
            ReactionType::Swimming => self.swimming = self.swimming.saturating_add(1),
        }
    }

    /// Decrement count for a specific reaction type
    pub fn decrement(&mut self, reaction_type: ReactionType) {
        match reaction_type {
            ReactionType::Heart => self.heart = self.heart.saturating_sub(1),
            ReactionType::ThumbsUp => self.thumbs_up = self.thumbs_up.saturating_sub(1),
            ReactionType::ThumbsDown => self.thumbs_down = self.thumbs_down.saturating_sub(1),
            ReactionType::Laugh => self.laugh = self.laugh.saturating_sub(1),
            ReactionType::Thinking => self.thinking = self.thinking.saturating_sub(1),
            ReactionType::MindBlown => self.mind_blown = self.mind_blown.saturating_sub(1),
            ReactionType::Fire => self.fire = self.fire.saturating_sub(1),
            ReactionType::Swimming => self.swimming = self.swimming.saturating_sub(1),
        }
    }

    /// Get total reaction count
    #[must_use]
    pub fn total(&self) -> u64 {
        u64::from(self.heart)
            + u64::from(self.thumbs_up)
            + u64::from(self.thumbs_down)
            + u64::from(self.laugh)
            + u64::from(self.thinking)
            + u64::from(self.mind_blown)
            + u64::from(self.fire)
            + u64::from(self.swimming)
    }

    /// Check if there are any reactions
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.total() == 0
    }

    /// Convert to a vec of (emoji, count) pairs for non-zero reactions
    #[must_use]
    pub fn to_emoji_counts(&self) -> Vec<(&'static str, u32)> {
        let mut result = Vec::new();
        for rt in ReactionType::all() {
            let count = self.get(rt);
            if count > 0 {
                result.push((rt.emoji(), count));
            }
        }
        result
    }
}

/// Decay state (computed on-demand, not serialized) (SPEC_02 §3.6)
#[derive(Debug, Clone, PartialEq)]
pub struct DecayState {
    /// Content this decay applies to
    pub content_id: ContentId,
    /// Age in seconds (current_time - created_at)
    pub age_seconds: u64,
    /// Time since last engagement in seconds
    pub time_since_engagement: u64,
    /// Number of half-lives elapsed (effective_decay_time / half_life)
    pub half_lives_elapsed: f64,
    /// Survival probability: 0.5^half_lives_elapsed
    pub survival_probability: f64,
    /// True if survival_probability < DECAY_THRESHOLD (0.0625)
    pub is_decayed: bool,
    /// True if within floor period (48h) or pinned
    pub is_protected: bool,
}

/// Content lifecycle stage derived from decay state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContentLifecycle {
    /// Within floor period or pinned - cannot decay
    Protected,
    /// survival_probability >= 0.5 (less than 1 half-life)
    Active,
    /// survival_probability in [0.0625, 0.5) (1-4 half-lives)
    Stale,
    /// survival_probability < 0.0625 (>4 half-lives) - eligible for pruning
    Decayed,
}

impl ContentLifecycle {
    /// Determine lifecycle from survival probability and protection status
    #[must_use]
    pub fn from_decay_state(survival: f64, is_protected: bool) -> Self {
        if is_protected {
            ContentLifecycle::Protected
        } else if survival >= 0.5 {
            ContentLifecycle::Active
        } else if survival >= 0.0625 {
            ContentLifecycle::Stale
        } else {
            ContentLifecycle::Decayed
        }
    }
}

/// Tombstone for deleted content (SPEC_02 §3.6)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Tombstone {
    /// Deleted content ID
    pub content_id: ContentId,
    /// Deletion timestamp (UNIX milliseconds)
    pub tombstone_time: u64,
    /// Author who deleted
    pub author_id: IdentityId,
    /// Hash of content summary (for audit)
    pub summary_hash: ContentHash,
}

/// Manifest for chunked content (SPEC_02 §3.7)
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Manifest {
    /// Overall content hash
    pub content_hash: ContentHash,
    /// Ordered list of chunk hashes
    pub chunk_hashes: Vec<ContentHash>,
    /// Total size in bytes
    pub total_size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_type_discriminants() {
        assert_eq!(ContentType::Post as u8, 0x00);
        assert_eq!(ContentType::Reply as u8, 0x01);
        assert_eq!(ContentType::Quote as u8, 0x02);
        assert_eq!(ContentType::Edit as u8, 0x03);
    }

    #[test]
    fn test_content_type_try_from() {
        assert_eq!(ContentType::try_from(0x00).unwrap(), ContentType::Post);
        assert_eq!(ContentType::try_from(0x01).unwrap(), ContentType::Reply);
        assert_eq!(ContentType::try_from(0x02).unwrap(), ContentType::Quote);
        assert_eq!(ContentType::try_from(0x03).unwrap(), ContentType::Edit);
        assert!(ContentType::try_from(0xFF).is_err());
    }

    #[test]
    fn test_media_type_discriminants() {
        assert_eq!(MediaType::ImageJpeg as u8, 0x01);
        assert_eq!(MediaType::ImagePng as u8, 0x02);
        assert_eq!(MediaType::ImageGif as u8, 0x03);
        assert_eq!(MediaType::ImageWebp as u8, 0x04);
    }

    #[test]
    fn test_content_hash_default() {
        let hash = ContentHash::default();
        assert_eq!(hash.0, [0u8; 32]);
    }
}
