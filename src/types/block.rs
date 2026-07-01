//! Block types per SPEC_08
//!
//! Types for block headers, block variants, and chain structure.

use std::fmt;

use super::content::{ContentId, ContentItem, EngagementRecord, SpaceId};
use super::identity::{IdentityId, Signature};

/// Block hash (32 bytes)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct BlockHash(pub [u8; 32]);

impl BlockHash {
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

    /// Zero hash (genesis block parent)
    #[must_use]
    pub const fn zero() -> Self {
        Self([0u8; 32])
    }
}

impl fmt::Debug for BlockHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "BlockHash(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for BlockHash {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Fork identifier (32 bytes)
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct ForkId(pub [u8; 32]);

impl ForkId {
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

    /// Main chain fork ID (all zeros)
    #[must_use]
    pub const fn main_chain() -> Self {
        Self([0u8; 32])
    }
}

impl fmt::Debug for ForkId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ForkId(")?;
        for byte in &self.0[..8] {
            write!(f, "{byte:02x}")?;
        }
        write!(f, "...)")
    }
}

impl AsRef<[u8]> for ForkId {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

/// Block type discriminants (SPEC_08 §3.1)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BlockType {
    /// Root block (chain coordination)
    Root = 0x00,
    /// Space block (space management)
    Space = 0x01,
    /// Content block (posts, replies, engagement)
    Content = 0x02,
}

impl TryFrom<u8> for BlockType {
    type Error = super::error::SerializeError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(BlockType::Root),
            0x01 => Ok(BlockType::Space),
            0x02 => Ok(BlockType::Content),
            _ => Err(super::error::SerializeError::UnknownType(value)),
        }
    }
}

/// Block header (SPEC_08 §3.1)
///
/// Common header for all block types. Timestamps are UNIX seconds (chain layer).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockHeader {
    /// Block format version
    pub version: u8,
    /// Type of block
    pub block_type: BlockType,
    /// Hash of previous block
    pub prev_hash: BlockHash,
    /// Merkle root of block contents
    pub merkle_root: [u8; 32],
    /// Block creation timestamp (UNIX seconds)
    pub timestamp: u64,
    /// Block height in chain
    pub height: u64,
    /// Fork identifier
    pub fork_id: ForkId,
    /// PoW nonce
    pub pow_nonce: u64,
    /// Required PoW difficulty
    pub pow_difficulty: u8,
}

impl BlockHeader {
    /// Calculate the hash of this block header
    #[must_use]
    pub fn hash(&self) -> BlockHash {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update([self.version]);
        hasher.update([self.block_type as u8]);
        hasher.update(&self.prev_hash.0);
        hasher.update(&self.merkle_root);
        hasher.update(&self.timestamp.to_le_bytes());
        hasher.update(&self.height.to_le_bytes());
        hasher.update(&self.fork_id.0);
        hasher.update(&self.pow_nonce.to_le_bytes());
        hasher.update([self.pow_difficulty]);
        BlockHash(hasher.finalize().into())
    }
}

/// Preservation proof for extending content lifetime (SPEC_02 §4.3)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreservationProof {
    /// Content being preserved
    pub content_id: ContentId,
    /// Author of content (for verification)
    pub author_id: IdentityId,
    /// PoW nonce
    pub pow_nonce: u64,
    /// Required difficulty
    pub pow_difficulty: u8,
    /// Extension period (1-30 days)
    pub extension_days: u8,
    /// Signature proving authorization
    pub signature: Signature,
}

/// Content action types for content blocks (SPEC_08 §3.3)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentAction {
    /// Create a new post
    CreatePost(ContentItem),
    /// Create a reply
    CreateReply(ContentItem),
    /// Record engagement
    Engage(EngagementRecord),
    /// Extend content preservation
    Preserve(PreservationProof),
}

/// Content block (SPEC_08 §3.3)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentBlock {
    /// Block header
    pub header: BlockHeader,
    /// Space this block belongs to
    pub space_id: SpaceId,
    /// Actions in this block
    pub actions: Vec<ContentAction>,
}

/// Space membership update (SPEC_08 §3.2)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceMembershipUpdate {
    /// Identity being updated
    pub identity: IdentityId,
    /// New membership status (true = member, false = removed)
    pub is_member: bool,
    /// Timestamp of update (UNIX seconds)
    pub timestamp: u64,
    /// Signature from space admin
    pub signature: Signature,
}

/// Space configuration (SPEC_08 §3.2)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceConfig {
    /// Space identifier
    pub space_id: SpaceId,
    /// Human-readable name
    pub name: String,
    /// Description
    pub description: Option<String>,
    /// Creation timestamp (UNIX seconds)
    pub created_at: u64,
    /// Admin identity
    pub admin: IdentityId,
    /// Moderator identities
    pub moderators: Vec<IdentityId>,
}

/// Space block (SPEC_08 §3.2)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceBlock {
    /// Block header
    pub header: BlockHeader,
    /// Space configuration (if changed)
    pub config: Option<SpaceConfig>,
    /// Membership updates
    pub membership_updates: Vec<SpaceMembershipUpdate>,
    /// Child content block hashes
    pub content_block_hashes: Vec<BlockHash>,
}

/// Root block commitment to space blocks (SPEC_08 §3.1)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SpaceCommitment {
    /// Space being committed
    pub space_id: SpaceId,
    /// Latest space block hash
    pub space_block_hash: BlockHash,
    /// Space block height
    pub space_block_height: u64,
}

/// Root block (SPEC_08 §3.1)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RootBlock {
    /// Block header
    pub header: BlockHeader,
    /// Commitments to space blocks
    pub space_commitments: Vec<SpaceCommitment>,
    /// Protocol upgrade signals
    pub upgrade_signals: Vec<u8>,
}

/// Block enum for all block types (SPEC_08)
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Block {
    /// Root block
    Root(RootBlock),
    /// Space block
    Space(SpaceBlock),
    /// Content block
    Content(ContentBlock),
}

impl Block {
    /// Get the header of this block
    #[must_use]
    pub fn header(&self) -> &BlockHeader {
        match self {
            Block::Root(b) => &b.header,
            Block::Space(b) => &b.header,
            Block::Content(b) => &b.header,
        }
    }

    /// Get the hash of this block
    #[must_use]
    pub fn hash(&self) -> BlockHash {
        self.header().hash()
    }

    /// Get the block type
    #[must_use]
    pub fn block_type(&self) -> BlockType {
        self.header().block_type
    }

    /// Get the block height
    #[must_use]
    pub fn height(&self) -> u64 {
        self.header().height
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_block_type_discriminants() {
        assert_eq!(BlockType::Root as u8, 0x00);
        assert_eq!(BlockType::Space as u8, 0x01);
        assert_eq!(BlockType::Content as u8, 0x02);
    }

    #[test]
    fn test_block_type_try_from() {
        assert_eq!(BlockType::try_from(0x00).unwrap(), BlockType::Root);
        assert_eq!(BlockType::try_from(0x01).unwrap(), BlockType::Space);
        assert_eq!(BlockType::try_from(0x02).unwrap(), BlockType::Content);
        assert!(BlockType::try_from(0xFF).is_err());
    }

    #[test]
    fn test_block_hash_zero() {
        let zero = BlockHash::zero();
        assert_eq!(zero.0, [0u8; 32]);
    }

    #[test]
    fn test_fork_id_main_chain() {
        let main = ForkId::main_chain();
        assert_eq!(main.0, [0u8; 32]);
    }

    #[test]
    fn test_block_header_hash_deterministic() {
        let header = BlockHeader {
            version: 1,
            block_type: BlockType::Root,
            prev_hash: BlockHash::zero(),
            merkle_root: [0u8; 32],
            timestamp: 1234567890,
            height: 0,
            fork_id: ForkId::main_chain(),
            pow_nonce: 0,
            pow_difficulty: 20,
        };
        let hash1 = header.hash();
        let hash2 = header.hash();
        assert_eq!(hash1, hash2);
    }
}
