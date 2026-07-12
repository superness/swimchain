//! Chain storage using sled embedded database (SPEC_07 - Milestone 1.6)
//!
//! Stores root blocks, space blocks, and content blocks in a persistent
//! embedded database with height indexing.
//!
//! # Branch Management (Milestone 1.7)
//!
//! Additional trees for branch tracking:
//! - `branch_metadata`: Per-branch size and thread count
//! - `thread_branch_index`: Thread -> Branch mapping
//! - `space_branch_state`: Space-level branching state
//! - `thread_size`: Per-thread cumulative size
//! - `branch_thread_index`: Branch -> Thread reverse index

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};

use sled::Db;

use crate::blocks::{BranchPath, ContentBlock, RootBlock, SpaceBlock};
use crate::branch::behavioral::{
    BehavioralEvent, CommunityFormation, CommunityLineage, IdentitySpaceMetrics, SpamClusterSignal,
};
use crate::branch::{BranchMetadata, SpaceBranchState};
use crate::types::error::StorageError;

/// Block hash type alias (32 bytes)
pub type BlockHash = [u8; 32];

/// Chain storage using sled embedded database
pub struct ChainStore {
    db: Db,
    /// Separate tree for root blocks
    root_blocks: sled::Tree,
    /// Separate tree for space blocks
    space_blocks: sled::Tree,
    /// Separate tree for content blocks
    content_blocks: sled::Tree,
    /// Height index: height (u64 big-endian) -> BlockHash (canonical chain only)
    height_index: sled::Tree,
    /// Best tip tracking: stores the hash of the canonical chain tip
    /// Key = "best_tip", Value = BlockHash (32 bytes)
    best_tip: sled::Tree,
    /// Track total bytes stored (approximate).
    ///
    /// Uses `Ordering::Relaxed` for performance. This counter is approximate and
    /// may be slightly inaccurate under high concurrency, but remains suitable for
    /// monitoring and eviction threshold calculations where exactness isn't critical.
    total_bytes: AtomicU64,

    // === Space Content Index (Performance optimization) ===
    /// Space content index: Key = space_id(16) || timestamp(8, big-endian), Value = content_hash(32)
    /// Enables O(1) lookup of content in a space, ordered by time
    space_content_index: sled::Tree,
    /// Content metadata index: Key = content_hash(32), Value = ContentIndexEntry (author, parent, type, timestamp)
    content_metadata_index: sled::Tree,

    // === Content Type Indexes (Scalability) ===
    /// Posts-only index: Key = space_id(16) || timestamp(8, big-endian), Value = content_hash(32)
    /// Enables O(log n) lookup of posts without scanning replies
    posts_by_space_index: sled::Tree,
    /// Replies-by-parent index: Key = parent_hash(32) || timestamp(8, big-endian), Value = content_hash(32)
    /// Enables O(log n) lookup of replies to a specific post/reply
    replies_by_parent_index: sled::Tree,
    /// Author content index: Key = author_pk(32) || timestamp(8, big-endian), Value = content_hash(32)
    /// Enables O(log n) lookup of all content by a specific author (for feed-style clients)
    author_content_index: sled::Tree,

    // === Branch Management (Milestone 1.7) ===
    /// Branch metadata: Key = space_id(32) || depth(1) || path_bytes, Value = BranchMetadata
    branch_metadata: sled::Tree,
    /// Thread to branch index: Key = space_id(32) || thread_root_id(32), Value = branch_path_bytes
    thread_branch_index: sled::Tree,
    /// Space branch state: Key = space_id(32), Value = SpaceBranchState
    space_branch_state: sled::Tree,
    /// Thread sizes for fracture redistribution: Key = space_id(32) || thread_root_id(32), Value = u64 (size)
    thread_size: sled::Tree,
    /// Reverse index for fracture: Key = space_id(32) || depth(1) || path_bytes || thread_root_id(32), Value = ()
    /// This enables get_threads_in_branch() via prefix scan
    branch_thread_index: sled::Tree,

    // === Space Registry (On-chain space registration) ===
    /// Space registry: Key = space_id(16, zero-padded to 32), Value = SpaceInfo
    /// Stores on-chain space registration metadata
    space_registry: sled::Tree,

    // === Finalized Action Tracking (Prevents duplicate action inclusion) ===
    /// Finalized actions: Key = action_hash(32), Value = block_height(8, big-endian)
    /// Tracks which actions have been included in finalized blocks to prevent re-inclusion
    finalized_actions: sled::Tree,

    // === Behavioral Branching (SPEC_13 Phase A) ===
    /// Per-identity, per-space interaction metrics (SPEC_13 §3.2, §8.1):
    /// Key = space_id(32) || identity(32), Value = IdentitySpaceMetrics (bincode)
    identity_space_metrics: sled::Tree,
    /// Community formation records (SPEC_13 §8.1 TREE_COMMUNITIES):
    /// Key = community_id(32), Value = CommunityFormation (bincode)
    communities: sled::Tree,
    /// Identity -> primary community mapping (SPEC_13 §8.1 TREE_IDENTITY_COMMUNITY):
    /// Key = space_id(32) || identity(32), Value = community_id(32)
    identity_community: sled::Tree,
    /// Communities by parent space (SPEC_13 §8.1 TREE_SPACE_COMMUNITIES):
    /// Key = parent_space_id(32) || community_id(32), Value = formation_height(8, big-endian)
    space_communities: sled::Tree,
    /// Community branch index (Phase A: community realized as a branch):
    /// Key = space_id(32) || branch_path_bytes, Value = community_id(32)
    community_branches: sled::Tree,
    /// Spam cluster signals (SPEC_13 §6.1, surfaced to spam/space-health side):
    /// Key = space_id(32) || identity(32), Value = SpamClusterSignal (bincode)
    spam_cluster_signals: sled::Tree,
    /// Last behavioral formation height per space (SPEC_13 §6.3 cooldown):
    /// Key = space_id(32), Value = height(8, big-endian)
    space_formation_heights: sled::Tree,
    /// Log-only behavioral events (Phase 1 rollout, would-be formations):
    /// Key = event_id(32), Value = BehavioralEvent (bincode)
    behavioral_events: sled::Tree,
    /// Behavioral events by parent space (mirrors `space_communities`):
    /// Key = parent_space_id(32) || event_id(32), Value = detected_height(8, big-endian)
    space_behavioral_events: sled::Tree,
    /// Community lineage records (Phase 2 space-tree navigation):
    /// Key = community_id(32), Value = CommunityLineage (bincode)
    community_lineage: sled::Tree,
    /// Frequency-drift audit records (network isolation), latest per actor:
    /// `actor(32) -> FrequencyDriftRecord`. See
    /// `docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`.
    frequency_drifts: sled::Tree,
}

/// Compact content metadata for indexed lookups
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ContentIndexEntry {
    /// Author identity (32 bytes)
    pub author: [u8; 32],
    /// Parent content hash (32 bytes, zeroed if top-level post)
    pub parent_hash: [u8; 32],
    /// Content type: 0=Post, 1=Reply, 2=Engage
    pub content_type: u8,
    /// Creation timestamp (UNIX seconds)
    pub timestamp: u64,
    /// Space ID (first 16 bytes)
    pub space_id: [u8; 16],
}

/// An on-chain frequency-drift audit record (network isolation). Self-authored:
/// `actor` recorded that its node drifted to `frequency` (0 = back to base) on
/// namespace `namespace_key`. See `docs/handoffs/FREQUENCY_ISOLATION_DESIGN.md`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FrequencyDriftRecord {
    /// Drifting node's identity public key.
    pub actor: [u8; 32],
    /// Namespace the node concentrated on (zero-padded 16-byte space id or app
    /// hash), or all-zero for a drift back to base.
    pub namespace_key: [u8; 32],
    /// Target discovery frequency (0 = base).
    pub frequency: u32,
    /// Action timestamp (UNIX seconds).
    pub timestamp: u64,
}

/// On-chain space registration info
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SpaceInfo {
    /// Space ID (16 bytes, padded to 32 in storage key)
    pub space_id: [u8; 16],
    /// Space name (max 64 bytes UTF-8)
    /// For public spaces: plaintext name
    /// For private spaces: use `encrypted_name` instead
    pub name: String,
    /// Optional description (max 256 bytes UTF-8)
    pub description: Option<String>,
    /// Creator's identity (32 bytes)
    pub creator: [u8; 32],
    /// Creation timestamp (UNIX seconds)
    pub created_at: u64,
    /// PoW work amount (proves spam cost)
    pub pow_work: u64,

    // === Private Space Fields ===
    /// Is this a private/encrypted space?
    /// Private spaces have encrypted content and membership management
    #[serde(default)]
    pub is_private: bool,
    /// Encrypted space name (only members can decrypt)
    /// Format: AES-256-GCM ciphertext with embedded nonce
    /// None for public spaces
    #[serde(default)]
    pub encrypted_name: Option<Vec<u8>>,
    /// Encrypted space key for creator (X25519 box)
    /// Allows creator to recover space key from their private key
    /// Format: X25519 + XSalsa20-Poly1305 ciphertext
    #[serde(default)]
    pub creator_encrypted_key: Option<Vec<u8>>,
    /// Current space key version (incremented on key rotation after kicks)
    /// 0 = initial key, 1+ = rotated keys
    #[serde(default)]
    pub key_version: u32,
}

impl ChainStore {
    /// Open or create chain store at path
    ///
    /// # Errors
    ///
    /// Returns error if database cannot be opened or trees cannot be created.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, StorageError> {
        let db = crate::storage::open_db(path.as_ref())?;
        let root_blocks = db.open_tree("root_blocks")?;
        let space_blocks = db.open_tree("space_blocks")?;
        let content_blocks = db.open_tree("content_blocks")?;
        let height_index = db.open_tree("height_index")?;
        let best_tip = db.open_tree("best_tip")?;

        // Space content index (performance optimization)
        let space_content_index = db.open_tree("space_content_index")?;
        let content_metadata_index = db.open_tree("content_metadata_index")?;

        // Content type indexes (scalability)
        let posts_by_space_index = db.open_tree("posts_by_space_index")?;
        let replies_by_parent_index = db.open_tree("replies_by_parent_index")?;
        let author_content_index = db.open_tree("author_content_index")?;

        // Branch management trees (Milestone 1.7)
        let branch_metadata = db.open_tree("branch_metadata")?;
        let thread_branch_index = db.open_tree("thread_branch_index")?;
        let space_branch_state = db.open_tree("space_branch_state")?;
        let thread_size = db.open_tree("thread_size")?;
        let branch_thread_index = db.open_tree("branch_thread_index")?;

        // Space registry (on-chain space registration)
        let space_registry = db.open_tree("space_registry")?;

        // Finalized action tracking (prevents duplicate action inclusion)
        let finalized_actions = db.open_tree("finalized_actions")?;

        // Behavioral branching trees (SPEC_13 Phase A)
        let identity_space_metrics = db.open_tree("identity_space_metrics")?;
        let communities = db.open_tree("communities")?;
        let identity_community = db.open_tree("identity_community")?;
        let space_communities = db.open_tree("space_communities")?;
        let community_branches = db.open_tree("community_branches")?;
        let spam_cluster_signals = db.open_tree("spam_cluster_signals")?;
        let space_formation_heights = db.open_tree("space_formation_heights")?;
        let behavioral_events = db.open_tree("behavioral_events")?;
        let space_behavioral_events = db.open_tree("space_behavioral_events")?;
        let community_lineage = db.open_tree("community_lineage")?;
        let frequency_drifts = db.open_tree("frequency_drifts")?;

        // Calculate initial total bytes
        let mut total = 0u64;
        for result in root_blocks.iter() {
            let (k, v) = result?;
            total += (k.len() + v.len()) as u64;
        }
        for result in space_blocks.iter() {
            let (k, v) = result?;
            total += (k.len() + v.len()) as u64;
        }
        for result in content_blocks.iter() {
            let (k, v) = result?;
            total += (k.len() + v.len()) as u64;
        }

        Ok(Self {
            db,
            root_blocks,
            space_blocks,
            content_blocks,
            height_index,
            best_tip,
            total_bytes: AtomicU64::new(total),
            space_content_index,
            content_metadata_index,
            posts_by_space_index,
            replies_by_parent_index,
            author_content_index,
            branch_metadata,
            thread_branch_index,
            space_branch_state,
            thread_size,
            branch_thread_index,
            space_registry,
            finalized_actions,
            identity_space_metrics,
            communities,
            identity_community,
            space_communities,
            community_branches,
            spam_cluster_signals,
            space_formation_heights,
            behavioral_events,
            space_behavioral_events,
            community_lineage,
            frequency_drifts,
        })
    }

    /// Store a root block
    ///
    /// # Errors
    ///
    /// Returns error if serialization or storage fails.
    pub fn put_root_block(&self, block: &RootBlock) -> Result<BlockHash, StorageError> {
        let hash = block.hash();
        let data = bincode::serialize(block)?;
        let size = (32 + data.len()) as u64;
        self.root_blocks.insert(&hash, data)?;
        self.total_bytes.fetch_add(size, Ordering::Relaxed);
        Ok(hash)
    }

    /// Get a root block by hash
    ///
    /// # Errors
    ///
    /// Returns error if database read fails or deserialization fails.
    pub fn get_root_block(&self, hash: &BlockHash) -> Result<Option<RootBlock>, StorageError> {
        match self.root_blocks.get(hash)? {
            Some(data) => {
                let block: RootBlock = bincode::deserialize(&data)?;
                Ok(Some(block))
            }
            None => Ok(None),
        }
    }

    /// Store a space block
    ///
    /// # Errors
    ///
    /// Returns error if serialization or storage fails.
    pub fn put_space_block(&self, block: &SpaceBlock) -> Result<BlockHash, StorageError> {
        let hash = block.hash();
        let data = bincode::serialize(block)?;
        let size = (32 + data.len()) as u64;
        self.space_blocks.insert(&hash, data)?;
        self.total_bytes.fetch_add(size, Ordering::Relaxed);
        Ok(hash)
    }

    /// Get a space block by hash
    ///
    /// # Errors
    ///
    /// Returns error if database read fails or deserialization fails.
    pub fn get_space_block(&self, hash: &BlockHash) -> Result<Option<SpaceBlock>, StorageError> {
        match self.space_blocks.get(hash)? {
            Some(data) => {
                let block: SpaceBlock = bincode::deserialize(&data)?;
                Ok(Some(block))
            }
            None => Ok(None),
        }
    }

    /// Store a content block
    ///
    /// # Errors
    ///
    /// Returns error if serialization or storage fails.
    pub fn put_content_block(&self, block: &ContentBlock) -> Result<BlockHash, StorageError> {
        let hash = block.hash();

        // Deduplication: skip if already stored
        if self.content_blocks.contains_key(&hash)? {
            log::debug!(
                "[CHAIN] ContentBlock {} already exists, skipping",
                hex::encode(&hash[..8])
            );
            return Ok(hash);
        }

        log::info!(
            "[CHAIN] Storing ContentBlock hash={}, actions={}, space_metadata={}",
            hex::encode(&hash[..8]),
            block.actions.len(),
            if block.space_metadata.is_some() {
                "PRESENT"
            } else {
                "NONE"
            }
        );
        let data = bincode::serialize(block)?;
        let size = (32 + data.len()) as u64;
        self.content_blocks.insert(&hash, data)?;
        self.total_bytes.fetch_add(size, Ordering::Relaxed);

        // Get default space_id from block
        let block_space_id_16: [u8; 16] = block.space_id[..16].try_into().unwrap_or([0u8; 16]);

        for action in &block.actions {
            // Skip Engage actions - they don't create new content
            if matches!(action.action_type, crate::blocks::ActionType::Engage) {
                continue;
            }

            if let Some(content_hash) = action.content_hash {
                // For replies, look up the parent's space_id to ensure correct indexing
                // This fixes a bug where replies were indexed under parent's content_hash instead of parent's space
                let space_id_16: [u8; 16] =
                    if matches!(action.action_type, crate::blocks::ActionType::Reply) {
                        if let Some(parent_hash) = action.parent_id {
                            // Look up parent's space_id from existing index
                            if let Ok(Some(parent_entry_data)) =
                                self.content_metadata_index.get(&parent_hash)
                            {
                                if let Ok(parent_entry) =
                                    bincode::deserialize::<ContentIndexEntry>(&parent_entry_data)
                                {
                                    parent_entry.space_id
                                } else {
                                    block_space_id_16
                                }
                            } else {
                                // Parent not indexed yet - use block's space_id
                                // This is a fallback; ideally parent should already be indexed
                                block_space_id_16
                            }
                        } else {
                            block_space_id_16
                        }
                    } else {
                        block_space_id_16
                    };

                // Create space content index key: space_id(16) || timestamp(8, big-endian)
                let mut index_key = [0u8; 24];
                index_key[..16].copy_from_slice(&space_id_16);
                index_key[16..].copy_from_slice(&action.timestamp.to_be_bytes());

                // Store content hash as value
                self.space_content_index.insert(&index_key, &content_hash)?;

                // Store content metadata for fast lookups
                let parent_hash = action.parent_id.unwrap_or([0u8; 32]);
                let content_type = match action.action_type {
                    crate::blocks::ActionType::Post => 0u8,
                    crate::blocks::ActionType::Reply => 1u8,
                    crate::blocks::ActionType::Engage => 2u8,
                    crate::blocks::ActionType::CreateSpace => 3u8,
                    crate::blocks::ActionType::Edit => 4u8,
                    // Private space actions use a dedicated content type
                    crate::blocks::ActionType::Invite => 5u8,
                    crate::blocks::ActionType::Leave => 6u8,
                    crate::blocks::ActionType::Kick => 7u8,
                    crate::blocks::ActionType::RevokeInvite => 8u8,
                    crate::blocks::ActionType::KeyRotation => 9u8,
                    crate::blocks::ActionType::DMRequest => 10u8,
                    crate::blocks::ActionType::AcceptDM => 11u8,
                    crate::blocks::ActionType::DeclineDM => 12u8,
                    crate::blocks::ActionType::Sponsor => 13u8,
                    crate::blocks::ActionType::GenesisRegister => 14u8,
                    crate::blocks::ActionType::RenameSpace => 15u8,
                    crate::blocks::ActionType::FrequencyDrift => 16u8,
                };

                let entry = ContentIndexEntry {
                    author: action.actor,
                    parent_hash,
                    content_type,
                    timestamp: action.timestamp,
                    space_id: space_id_16,
                };

                let entry_data = bincode::serialize(&entry)?;
                self.content_metadata_index
                    .insert(&content_hash, entry_data)?;

                // === Author content index for feed-style queries ===
                // Key = author_pk(32) || timestamp(8, big-endian), Value = content_hash(32)
                let mut author_key = [0u8; 40];
                author_key[..32].copy_from_slice(&action.actor);
                author_key[32..].copy_from_slice(&action.timestamp.to_be_bytes());
                self.author_content_index
                    .insert(&author_key, &content_hash)?;

                // === Content-type specific indexes for O(log n) queries at scale ===
                match action.action_type {
                    crate::blocks::ActionType::Post => {
                        // Index post by space: Key = space_id(16) || timestamp(8) → content_hash
                        self.posts_by_space_index
                            .insert(&index_key, &content_hash)?;
                    }
                    crate::blocks::ActionType::Reply => {
                        // Index reply by parent: Key = parent_hash(32) || timestamp(8) → content_hash
                        // Never index content as a reply to ITSELF: a self-parent entry makes the
                        // reply-tree walk (count_all_replies) cycle forever.
                        if let Some(parent) = action.parent_id {
                            if parent != content_hash {
                                let mut reply_key = [0u8; 40];
                                reply_key[..32].copy_from_slice(&parent);
                                reply_key[32..].copy_from_slice(&action.timestamp.to_be_bytes());
                                self.replies_by_parent_index
                                    .insert(&reply_key, &content_hash)?;
                            } else {
                                // TRIPWIRE: a self-parenting reply should be impossible
                                // (you can't reply to a message that doesn't exist yet).
                                // If this ever fires, capture who/when so the source flow
                                // can be found — this is the data that pegged mobile.
                                log::warn!(
                                    "[SELF-PARENT-TRIPWIRE] Reply {} parents ITSELF — not indexed. author={} ts={}",
                                    hex::encode(content_hash),
                                    hex::encode(action.actor),
                                    action.timestamp
                                );
                            }
                        }
                    }
                    crate::blocks::ActionType::CreateSpace => {
                        // Space creation is indexed in the space registry, not content index
                    }
                    crate::blocks::ActionType::Engage => {
                        // Engagements are not indexed separately
                    }
                    crate::blocks::ActionType::Edit => {
                        // Index edit by original content: Key = parent_hash(32) || timestamp(8) → new content_hash
                        // Skip self-referential edits (original == this content): a self-parent
                        // entry makes count_all_replies cycle forever. This is the observed
                        // source of the mobile CPU peg (self-parenting wiki content).
                        if let Some(original_id) = action.parent_id {
                            if original_id != content_hash {
                                let mut edit_key = [0u8; 40];
                                edit_key[..32].copy_from_slice(&original_id);
                                edit_key[32..].copy_from_slice(&action.timestamp.to_be_bytes());
                                // Reuse replies_by_parent_index for edits (edit is like a special reply to original)
                                self.replies_by_parent_index
                                    .insert(&edit_key, &content_hash)?;
                            } else {
                                // TRIPWIRE: an edit whose "original" is itself is nonsensical.
                                log::warn!(
                                    "[SELF-PARENT-TRIPWIRE] Edit {} edits ITSELF — not indexed. author={} ts={}",
                                    hex::encode(content_hash),
                                    hex::encode(action.actor),
                                    action.timestamp
                                );
                            }
                        }
                    }
                    // Private space actions will be indexed via MembershipStore
                    // For now, they're stored in content_metadata_index but not separately indexed
                    crate::blocks::ActionType::Invite
                    | crate::blocks::ActionType::Leave
                    | crate::blocks::ActionType::Kick
                    | crate::blocks::ActionType::RevokeInvite
                    | crate::blocks::ActionType::KeyRotation
                    | crate::blocks::ActionType::DMRequest
                    | crate::blocks::ActionType::AcceptDM
                    | crate::blocks::ActionType::DeclineDM => {
                        // TODO: Index in MembershipStore when implemented
                    }
                    // Sponsorship actions are processed during block ingestion
                    // (applied to SponsorshipStore in router.rs handle_block_data)
                    crate::blocks::ActionType::Sponsor
                    | crate::blocks::ActionType::GenesisRegister => {
                        // No additional content indexing needed
                    }
                    // Space renames are applied during block ingestion
                    // (router.rs apply_rename_space_actions_from_block)
                    crate::blocks::ActionType::RenameSpace => {
                        // No additional content indexing needed
                    }
                    // Frequency drift is a network-layer audit record applied
                    // during block ingestion (router.rs
                    // apply_frequency_drift_actions_from_block); not content.
                    crate::blocks::ActionType::FrequencyDrift => {
                        // No additional content indexing needed
                    }
                }
            }
        }

        Ok(hash)
    }

    /// Get a content block by hash
    ///
    /// # Errors
    ///
    /// Returns error if database read fails or deserialization fails.
    pub fn get_content_block(
        &self,
        hash: &BlockHash,
    ) -> Result<Option<ContentBlock>, StorageError> {
        match self.content_blocks.get(hash)? {
            Some(data) => {
                let block: ContentBlock = bincode::deserialize(&data)?;
                Ok(Some(block))
            }
            None => Ok(None),
        }
    }

    /// Delete a block by hash (any type)
    ///
    /// Tries to delete from all trees, returns true if found and deleted.
    ///
    /// # Errors
    ///
    /// Returns error if database operation fails.
    pub fn delete_block(&self, hash: &BlockHash) -> Result<bool, StorageError> {
        let mut deleted = false;
        let mut freed = 0u64;

        if let Some(data) = self.root_blocks.remove(hash)? {
            freed += (32 + data.len()) as u64;
            deleted = true;
        }
        if let Some(data) = self.space_blocks.remove(hash)? {
            freed += (32 + data.len()) as u64;
            deleted = true;
        }
        if let Some(data) = self.content_blocks.remove(hash)? {
            freed += (32 + data.len()) as u64;
            deleted = true;
        }

        if freed > 0 {
            self.total_bytes.fetch_sub(freed, Ordering::Relaxed);
        }

        Ok(deleted)
    }

    /// Get root block hash at height
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_root_hash_at_height(&self, height: u64) -> Result<Option<BlockHash>, StorageError> {
        let key = height.to_be_bytes();
        match self.height_index.get(&key)? {
            Some(data) => {
                let hash: BlockHash =
                    data.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes".to_string(),
                            actual: format!("{} bytes", data.len()),
                        })?;
                Ok(Some(hash))
            }
            None => Ok(None),
        }
    }

    /// Find heights whose root blocks claim space or content blocks that are
    /// missing locally.
    ///
    /// After headers-first sync a node holds root-block headers whose
    /// space blocks — or the content blocks inside them, which carry space
    /// names and posts — were never downloaded; spaces then show placeholder
    /// names and zero posts. The sync loop uses this scan to request those
    /// heights as full blocks (content backfill). Scans from genesis upward
    /// and stops after `max` gap heights so the per-tick cost stays bounded.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn find_content_gap_heights(&self, max: usize) -> Result<Vec<u64>, StorageError> {
        let mut gaps = Vec::new();
        let Some(tip) = self.get_latest_height()? else {
            return Ok(gaps);
        };

        for height in 0..=tip {
            if gaps.len() >= max {
                break;
            }
            let Some(hash) = self.get_root_hash_at_height(height)? else {
                continue;
            };
            let Some(root) = self.get_root_block(&hash)? else {
                continue;
            };
            'spaces: for space_hash in &root.space_block_hashes {
                match self.get_space_block(space_hash)? {
                    None => {
                        gaps.push(height);
                        break 'spaces;
                    }
                    Some(space_block) => {
                        // Space block present, but the content blocks it
                        // claims (which carry space names and posts) may
                        // still be missing — the gap actually observed on
                        // fresh nodes.
                        for content_hash in &space_block.content_block_hashes {
                            if self.get_content_block(content_hash)?.is_none() {
                                gaps.push(height);
                                break 'spaces;
                            }
                        }
                    }
                }
            }
        }

        Ok(gaps)
    }

    /// Index a root block by height
    ///
    /// # Errors
    ///
    /// Returns error if database write fails.
    pub fn index_height(&self, height: u64, hash: BlockHash) -> Result<(), StorageError> {
        let key = height.to_be_bytes();
        self.height_index.insert(&key, &hash)?;
        Ok(())
    }

    /// Get the latest indexed height
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_latest_height(&self) -> Result<Option<u64>, StorageError> {
        match self.height_index.last()? {
            Some((key, _)) => {
                let height_bytes: [u8; 8] =
                    key.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "8 bytes".to_string(),
                            actual: format!("{} bytes", key.len()),
                        })?;
                Ok(Some(u64::from_be_bytes(height_bytes)))
            }
            None => Ok(None),
        }
    }

    /// Generate a Bitcoin-style locator for the current chain.
    ///
    /// Returns block hashes at exponentially-spaced heights from tip to genesis:
    /// `[tip, tip-1, tip-2, tip-4, tip-8, tip-16, ..., genesis]`
    ///
    /// This allows efficient common ancestor detection with ~log(N) hashes.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn generate_locator(&self) -> Result<Vec<BlockHash>, StorageError> {
        let mut locator = Vec::with_capacity(20); // Typically ~15 hashes for any chain

        let tip_height = match self.get_latest_height()? {
            Some(h) => h,
            None => return Ok(locator), // Empty chain
        };

        // Add tip
        if let Some(hash) = self.get_root_hash_at_height(tip_height)? {
            locator.push(hash);
        }

        if tip_height == 0 {
            return Ok(locator);
        }

        // Add last 2 blocks before tip (high density near tip)
        for h in (tip_height.saturating_sub(2)..tip_height).rev() {
            if let Some(hash) = self.get_root_hash_at_height(h)? {
                locator.push(hash);
            }
        }

        // Exponential backoff from tip-3
        let mut height = tip_height.saturating_sub(3);
        let mut step = 2u64;

        while height > 0 {
            if let Some(hash) = self.get_root_hash_at_height(height)? {
                locator.push(hash);
            }
            if height <= step {
                break;
            }
            height = height.saturating_sub(step);
            step = step.saturating_mul(2);
        }

        // Always include genesis
        if let Some(genesis_hash) = self.get_root_hash_at_height(0)? {
            if locator.last() != Some(&genesis_hash) {
                locator.push(genesis_hash);
            }
        }

        Ok(locator)
    }

    /// Find the first matching locator hash in our chain.
    ///
    /// Searches the locator hashes (ordered from tip to genesis) and returns
    /// the height of the first hash that exists in our chain.
    ///
    /// This identifies the common ancestor between two chains.
    ///
    /// # Arguments
    ///
    /// * `locator` - Block hashes from peer's chain, tip to genesis
    ///
    /// # Returns
    ///
    /// The height of the first matching hash, or None if no match (different chain).
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn find_locator_match(&self, locator: &[[u8; 32]]) -> Result<Option<u64>, StorageError> {
        for hash in locator {
            // Check if we have this block
            if let Some(block) = self.get_root_block(hash)? {
                // IMPORTANT: Only match if this block is in our CANONICAL chain.
                // Non-canonical blocks (stored from orphan resolution) shouldn't count
                // as common ancestors, because get_blocks_from_height sends canonical blocks.
                if let Some(canonical_hash) = self.get_root_hash_at_height(block.height)? {
                    if canonical_hash == *hash {
                        return Ok(Some(block.height));
                    }
                    // Block exists but is not canonical - keep searching for earlier match
                }
            }
        }
        Ok(None)
    }

    /// Get blocks starting from a locator match.
    ///
    /// After finding a common ancestor via `find_locator_match`, use this to
    /// get blocks from that height onwards for syncing.
    ///
    /// # Arguments
    ///
    /// * `start_height` - Height to start from (typically locator match + 1)
    /// * `max_blocks` - Maximum number of blocks to return
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_blocks_from_height(
        &self,
        start_height: u64,
        max_blocks: u16,
    ) -> Result<Vec<crate::blocks::RootBlock>, StorageError> {
        let mut blocks = Vec::new();
        let end_height = match self.get_latest_height()? {
            Some(h) => h,
            None => return Ok(blocks),
        };

        for height in start_height..=end_height {
            if blocks.len() >= max_blocks as usize {
                break;
            }
            if let Some(hash) = self.get_root_hash_at_height(height)? {
                if let Some(block) = self.get_root_block(&hash)? {
                    blocks.push(block);
                }
            }
        }

        Ok(blocks)
    }

    /// Get total storage bytes
    #[must_use]
    pub fn total_bytes(&self) -> u64 {
        self.total_bytes.load(Ordering::Relaxed)
    }

    /// Get count of root blocks
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn root_block_count(&self) -> Result<u64, StorageError> {
        Ok(self.root_blocks.len() as u64)
    }

    /// Get count of space blocks
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn space_block_count(&self) -> Result<u64, StorageError> {
        Ok(self.space_blocks.len() as u64)
    }

    /// Get count of content blocks
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn content_block_count(&self) -> Result<u64, StorageError> {
        Ok(self.content_blocks.len() as u64)
    }

    /// Flush pending writes to disk
    ///
    /// # Errors
    ///
    /// Returns error if flush fails.
    pub fn flush(&self) -> Result<(), StorageError> {
        self.db.flush()?;
        Ok(())
    }

    /// Check if a root block exists
    pub fn has_root_block(&self, hash: &BlockHash) -> Result<bool, StorageError> {
        Ok(self.root_blocks.contains_key(hash)?)
    }

    /// Check if a space block exists
    pub fn has_space_block(&self, hash: &BlockHash) -> Result<bool, StorageError> {
        Ok(self.space_blocks.contains_key(hash)?)
    }

    /// Check if a content block exists
    pub fn has_content_block(&self, hash: &BlockHash) -> Result<bool, StorageError> {
        Ok(self.content_blocks.contains_key(hash)?)
    }

    /// Iterate over all root block hashes
    pub fn root_block_hashes(&self) -> impl Iterator<Item = Result<BlockHash, StorageError>> + '_ {
        self.root_blocks.iter().map(|result| {
            result.map_err(StorageError::from).and_then(|(key, _)| {
                key.as_ref()
                    .try_into()
                    .map_err(|_| StorageError::CorruptedData {
                        expected: "32 bytes".to_string(),
                        actual: format!("{} bytes", key.len()),
                    })
            })
        })
    }

    /// Iterate over all root blocks
    ///
    /// Returns an iterator over all root blocks stored in the chain.
    /// Useful for enumerating spaces from space_blocks in each root block.
    pub fn iter_root_blocks(&self) -> impl Iterator<Item = Result<RootBlock, StorageError>> + '_ {
        self.root_blocks.iter().map(|result| {
            result.map_err(StorageError::from).and_then(|(_, data)| {
                bincode::deserialize(&data).map_err(|e| {
                    StorageError::SerializationError(format!(
                        "Failed to deserialize root block: {}",
                        e
                    ))
                })
            })
        })
    }

    /// Iterate over all content blocks
    ///
    /// Returns an iterator over all content blocks stored in the chain.
    /// Useful for building space/content indexes from blockchain data.
    pub fn iter_content_blocks(
        &self,
    ) -> impl Iterator<Item = Result<ContentBlock, StorageError>> + '_ {
        self.content_blocks.iter().map(|result| {
            result.map_err(StorageError::from).and_then(|(_, data)| {
                bincode::deserialize(&data).map_err(|e| {
                    StorageError::SerializationError(format!(
                        "Failed to deserialize content block: {}",
                        e
                    ))
                })
            })
        })
    }

    // ==========================================================================
    // Space Registry Methods (On-chain space registration)
    // ==========================================================================

    /// Register a space on-chain
    ///
    /// Upgrade-only for names: several callers register spaces with
    /// placeholder names ("Space <hex>", or empty on the gossip path), and a
    /// blind overwrite erased real names learned via SPACE_META peer exchange
    /// (a space reverted to its placeholder after every app restart on
    /// mobile). A placeholder/empty incoming name never replaces an existing
    /// real or encrypted name; everything else still overwrites. Private
    /// spaces (empty `name` by design) pass through via `encrypted_name`.
    ///
    /// # Errors
    ///
    /// Returns error if serialization or storage fails.
    pub fn register_space(&self, info: &SpaceInfo) -> Result<(), StorageError> {
        // Storage-boundary guard (SWIM-SPACE-CLASS Task 4): every legitimately
        // registered space id carries a class byte 0x01-0x05 at
        // space_id[0] (see crate::types::space_class). No genesis/root/system
        // space is ever registered unclassed, so rejecting unclassed ids here
        // cannot break a legitimate flow — it only blocks malformed/forged
        // ids arriving via peer/RPC-controlled call sites that don't already
        // guard individually (handle_block_data, handle_space_meta,
        // redeem_space_invite).
        if !crate::blocks::validation::space_id_class_is_valid(&info.space_id) {
            log::warn!(
                "[SPACE-REGISTRY] Rejected register_space for unclassed space id (first byte 0x{:02x}, id {})",
                info.space_id[0],
                hex::encode(&info.space_id[..4])
            );
            return Err(StorageError::InvalidHashFormat(format!(
                "space id has unrecognized class byte 0x{:02x} (expected one of 0x01-0x05)",
                info.space_id[0]
            )));
        }

        // Key is space_id (16 bytes) padded to 32 bytes
        let mut key = [0u8; 32];
        key[..16].copy_from_slice(&info.space_id);

        let placeholder = format!("Space {}", hex::encode(&info.space_id[..4]));
        let incoming_is_placeholder =
            (info.name.is_empty() && info.encrypted_name.is_none()) || info.name == placeholder;
        if incoming_is_placeholder {
            if let Some(existing) = self.get_space(&info.space_id)? {
                let existing_is_real = !existing.name.is_empty() && existing.name != placeholder;
                if existing_is_real || existing.encrypted_name.is_some() {
                    log::info!(
                        "[SPACE-REGISTRY] Kept existing name '{}' for {} (blocked placeholder write)",
                        existing.name,
                        hex::encode(&info.space_id[..4])
                    );
                    return Ok(());
                }
            }
        }

        let data = bincode::serialize(info)?;
        let size = (32 + data.len()) as u64;
        self.space_registry.insert(&key, data)?;
        // Space registrations are rare and precious (a real name learned from
        // a peer must survive an abrupt process kill on mobile) — flush
        // synchronously instead of relying on the periodic background flush.
        self.space_registry.flush()?;
        self.total_bytes.fetch_add(size, Ordering::Relaxed);
        log::info!(
            "[SPACE-REGISTRY] Wrote name '{}' for {}",
            info.name,
            hex::encode(&info.space_id[..4])
        );
        Ok(())
    }

    /// Get space info by space_id (16 bytes)
    ///
    /// # Errors
    ///
    /// Returns error if database read fails or deserialization fails.
    pub fn get_space(&self, space_id: &[u8; 16]) -> Result<Option<SpaceInfo>, StorageError> {
        // Key is space_id padded to 32 bytes
        let mut key = [0u8; 32];
        key[..16].copy_from_slice(space_id);

        match self.space_registry.get(&key)? {
            Some(data) => {
                let info: SpaceInfo = bincode::deserialize(&data)?;
                Ok(Some(info))
            }
            None => Ok(None),
        }
    }

    /// Check if a space exists on-chain
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn space_exists(&self, space_id: &[u8; 16]) -> Result<bool, StorageError> {
        // First check space_registry (populated when content is processed)
        let mut key = [0u8; 32];
        key[..16].copy_from_slice(space_id);
        if self.space_registry.contains_key(&key)? {
            return Ok(true);
        }

        // Fallback: Check space_blocks from root blocks on chain
        // This handles spaces that exist on-chain but haven't had content processed yet
        for result in self.iter_root_blocks() {
            let root_block = match result {
                Ok(rb) => rb,
                Err(_) => continue,
            };
            for space_hash in &root_block.space_block_hashes {
                if let Ok(Some(space_block)) = self.get_space_block(space_hash) {
                    // Compare first 16 bytes of space_block.space_id
                    if space_block.space_id[..16] == *space_id {
                        return Ok(true);
                    }
                }
            }
        }

        Ok(false)
    }

    /// Get all registered spaces
    ///
    /// Returns an iterator over all registered spaces.
    pub fn list_spaces(&self) -> impl Iterator<Item = Result<SpaceInfo, StorageError>> + '_ {
        self.space_registry.iter().map(|result| {
            result.map_err(StorageError::from).and_then(|(_, data)| {
                bincode::deserialize(&data).map_err(|e| {
                    StorageError::SerializationError(format!(
                        "Failed to deserialize space info: {}",
                        e
                    ))
                })
            })
        })
    }

    /// Get count of registered spaces
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn space_count(&self) -> Result<u64, StorageError> {
        Ok(self.space_registry.len() as u64)
    }

    // ==========================================================================
    // Space Content Index Methods (Performance optimization)
    // ==========================================================================

    /// Get content metadata by content hash (O(1) lookup)
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_content_metadata(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<Option<ContentIndexEntry>, StorageError> {
        match self.content_metadata_index.get(content_hash)? {
            Some(data) => {
                let entry: ContentIndexEntry = bincode::deserialize(&data)?;
                Ok(Some(entry))
            }
            None => Ok(None),
        }
    }

    /// Get the author of a content item by its hash
    ///
    /// Convenience method for engagement graph tracking.
    ///
    /// # Arguments
    /// * `content_hash` - 32-byte content hash
    ///
    /// # Returns
    /// * `Ok(Some(author))` - Author identity (32 bytes)
    /// * `Ok(None)` - Content not found
    /// * `Err(_)` - Database error
    pub fn get_content_author(
        &self,
        content_hash: &[u8; 32],
    ) -> Result<Option<[u8; 32]>, StorageError> {
        Ok(self
            .get_content_metadata(content_hash)?
            .map(|entry| entry.author))
    }

    /// Get content for a space, ordered by timestamp (newest first)
    ///
    /// Uses the space_content_index for O(log n) lookup instead of full table scan.
    /// Returns (content_hash, metadata) pairs.
    ///
    /// # Arguments
    /// * `space_id` - 16-byte space ID
    /// * `limit` - Maximum number of items to return
    /// * `offset` - Number of items to skip
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_content_for_space(
        &self,
        space_id: &[u8; 16],
        limit: usize,
        offset: usize,
    ) -> Result<Vec<([u8; 32], ContentIndexEntry)>, StorageError> {
        let mut results = Vec::new();
        let mut skipped = 0usize;

        // Build prefix for this space
        let mut prefix = [0u8; 16];
        prefix.copy_from_slice(space_id);

        // Scan in reverse order (newest first, since timestamps are big-endian)
        for result in self.space_content_index.scan_prefix(&prefix).rev() {
            let (key, content_hash_bytes) = result?;

            // Parse content hash
            let content_hash: [u8; 32] = content_hash_bytes.as_ref().try_into().map_err(|_| {
                StorageError::CorruptedData {
                    expected: "32 bytes for content hash".to_string(),
                    actual: format!("{} bytes", content_hash_bytes.len()),
                }
            })?;

            // Skip malformed entries whose "hash" is a short (16-byte space/thread) id
            // zero-padded to 32 bytes. These aren't real content — fetching them 404s
            // (-32004) and they surfaced as an "(untitled)" wiki page that couldn't be
            // opened. A real SHA-256 content hash effectively never has its entire lower
            // 16 bytes zero (~2^-128), so this only drops the padded artifacts.
            if content_hash[16..].iter().all(|&b| b == 0) {
                continue;
            }

            // Skip offset items
            if skipped < offset {
                skipped += 1;
                continue;
            }

            // Stop at limit
            if results.len() >= limit {
                break;
            }

            // Get metadata for this content
            if let Some(metadata) = self.get_content_metadata(&content_hash)? {
                results.push((content_hash, metadata));
            }
        }

        Ok(results)
    }

    /// Get posts only for a space (content_type = 0)
    ///
    /// Returns posts in reverse chronological order (newest first).
    /// Uses dedicated `posts_by_space_index` for O(limit + offset) performance
    /// instead of O(n) scanning through all content.
    ///
    /// At 100K items where 1% are posts: O(50) vs O(5000) operations.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    /// Count total posts in a space
    pub fn count_posts_for_space(&self, space_id: &[u8; 16]) -> Result<usize, StorageError> {
        let mut prefix = [0u8; 16];
        prefix.copy_from_slice(space_id);
        Ok(self.posts_by_space_index.scan_prefix(&prefix).count())
    }

    pub fn get_posts_for_space(
        &self,
        space_id: &[u8; 16],
        limit: usize,
        offset: usize,
    ) -> Result<Vec<([u8; 32], ContentIndexEntry)>, StorageError> {
        let mut results = Vec::new();
        let mut skipped = 0usize;

        // Build prefix for this space
        let mut prefix = [0u8; 16];
        prefix.copy_from_slice(space_id);

        // Use the dedicated posts index - only contains posts, no filtering needed
        for result in self.posts_by_space_index.scan_prefix(&prefix).rev() {
            let (_, content_hash_bytes) = result?;

            let content_hash: [u8; 32] = content_hash_bytes.as_ref().try_into().map_err(|_| {
                StorageError::CorruptedData {
                    expected: "32 bytes for content hash".to_string(),
                    actual: format!("{} bytes", content_hash_bytes.len()),
                }
            })?;

            // Skip offset items
            if skipped < offset {
                skipped += 1;
                continue;
            }

            // Stop at limit
            if results.len() >= limit {
                break;
            }

            // Get metadata for this post
            if let Some(metadata) = self.get_content_metadata(&content_hash)? {
                results.push((content_hash, metadata));
            }
        }

        Ok(results)
    }

    /// Get replies to a specific content item (post or reply)
    ///
    /// Returns replies in chronological order (oldest first, for natural thread reading).
    /// Uses dedicated `replies_by_parent_index` for O(limit + offset) performance.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_replies_for_content(
        &self,
        parent_hash: &[u8; 32],
        limit: usize,
        offset: usize,
    ) -> Result<Vec<([u8; 32], ContentIndexEntry)>, StorageError> {
        let mut results = Vec::new();
        let mut skipped = 0usize;

        // Use the dedicated replies index - key is parent_hash(32) || timestamp(8)
        for result in self.replies_by_parent_index.scan_prefix(parent_hash) {
            let (_, content_hash_bytes) = result?;

            let content_hash: [u8; 32] = content_hash_bytes.as_ref().try_into().map_err(|_| {
                StorageError::CorruptedData {
                    expected: "32 bytes for content hash".to_string(),
                    actual: format!("{} bytes", content_hash_bytes.len()),
                }
            })?;

            // Skip offset items
            if skipped < offset {
                skipped += 1;
                continue;
            }

            // Stop at limit
            if results.len() >= limit {
                break;
            }

            // Get metadata for this reply
            if let Some(metadata) = self.get_content_metadata(&content_hash)? {
                results.push((content_hash, metadata));
            }
        }

        Ok(results)
    }

    /// Count replies to a specific content item
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn count_replies(&self, parent_hash: &[u8; 32]) -> Result<usize, StorageError> {
        let count = self
            .replies_by_parent_index
            .scan_prefix(parent_hash)
            .count();
        Ok(count)
    }

    /// Count ALL replies in a thread recursively (including nested replies)
    ///
    /// This traverses the entire reply tree to count all descendants.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn count_all_replies(&self, parent_hash: &[u8; 32]) -> Result<usize, StorageError> {
        let mut total = 0usize;
        let mut stack: Vec<[u8; 32]> = vec![*parent_hash];

        // Cycle guard: the reply index is untrusted (built from synced,
        // possibly-malformed content), so a self- or mutually-referential reply
        // would otherwise make this walk loop FOREVER — spinning a core and
        // growing `stack` without bound (observed pegging every core on mobile).
        // Expand each node at most once, and count each distinct reply once.
        let mut visited: std::collections::HashSet<[u8; 32]> = std::collections::HashSet::new();
        visited.insert(*parent_hash);

        // Self-parent rows (an entry whose value equals its own parent key) are
        // pure corruption — the content is still indexed under its REAL parent by
        // a separate row, so dropping the self-row is lossless. Collect them during
        // the walk and purge after, repairing the index in place the first time the
        // feed touches this thread rather than skipping it on every future call.
        let mut self_parent_rows: Vec<sled::IVec> = Vec::new();

        while let Some(current) = stack.pop() {
            // Get direct children of current node
            for result in self.replies_by_parent_index.scan_prefix(&current) {
                // Key format: [parent_hash (32 bytes)][timestamp (8 bytes)]
                // Value: reply_hash (32 bytes)
                let (key, value) = result?;

                // The reply hash is in the VALUE, not the key
                if value.len() != 32 {
                    continue;
                }
                let mut reply_hash = [0u8; 32];
                reply_hash.copy_from_slice(&value);

                if reply_hash == current {
                    // Self-parent: this row claims `current` is a reply to itself —
                    // impossible for valid data. Flag it for targeted repair below.
                    self_parent_rows.push(key);
                    continue;
                }

                // Skip replies already seen so a (non-self) cycle can neither inflate
                // the count nor loop; recurse into genuinely new ones.
                if visited.insert(reply_hash) {
                    total += 1;
                    stack.push(reply_hash);
                } else {
                    log::debug!(
                        "[REPLY-CYCLE] reply {} re-encountered under parent {} (non-self cycle)",
                        hex::encode(reply_hash),
                        hex::encode(current)
                    );
                }
            }
        }

        // Targeted self-heal: remove the corrupt self-parent rows. The count above
        // is already correct without them; this just clears the data that pegged
        // mobile (and stops it costing anything on future calls) — no full reindex.
        if !self_parent_rows.is_empty() {
            let n = self_parent_rows.len();
            for key in self_parent_rows {
                let _ = self.replies_by_parent_index.remove(&key);
            }
            log::warn!(
                "[REPLY-INDEX-REPAIR] purged {} self-parent reply-index row(s) under {} (targeted self-heal)",
                n,
                hex::encode(parent_hash)
            );
        }

        Ok(total)
    }

    /// Count total content items in a space
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn count_content_in_space(&self, space_id: &[u8; 16]) -> Result<usize, StorageError> {
        let mut count = 0usize;

        // Build prefix for this space
        let mut prefix = [0u8; 16];
        prefix.copy_from_slice(space_id);

        for result in self.space_content_index.scan_prefix(&prefix) {
            result?;
            count += 1;
        }

        Ok(count)
    }

    // ==========================================================================
    // Author Content Index Methods (Feed-style queries)
    // ==========================================================================

    /// Get content by author, ordered by timestamp (newest first)
    ///
    /// Uses the author_content_index for O(limit + offset) performance.
    /// Returns (content_hash, metadata) pairs.
    ///
    /// # Arguments
    /// * `author` - 32-byte author public key
    /// * `limit` - Maximum number of items to return
    /// * `offset` - Number of items to skip
    /// * `content_type_filter` - Optional filter: 0=Post, 1=Reply, None=all
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_content_by_author(
        &self,
        author: &[u8; 32],
        limit: usize,
        offset: usize,
        content_type_filter: Option<u8>,
    ) -> Result<Vec<([u8; 32], ContentIndexEntry)>, StorageError> {
        let mut results = Vec::new();
        let mut skipped = 0usize;

        // Scan in reverse order (newest first, since timestamps are big-endian)
        for result in self.author_content_index.scan_prefix(author).rev() {
            let (_, content_hash_bytes) = result?;

            let content_hash: [u8; 32] = content_hash_bytes.as_ref().try_into().map_err(|_| {
                StorageError::CorruptedData {
                    expected: "32 bytes for content hash".to_string(),
                    actual: format!("{} bytes", content_hash_bytes.len()),
                }
            })?;

            // Get metadata for this content
            if let Some(metadata) = self.get_content_metadata(&content_hash)? {
                // Apply content type filter if specified
                if let Some(filter) = content_type_filter {
                    if metadata.content_type != filter {
                        continue;
                    }
                }

                // Skip offset items
                if skipped < offset {
                    skipped += 1;
                    continue;
                }

                // Stop at limit
                if results.len() >= limit {
                    break;
                }

                results.push((content_hash, metadata));
            }
        }

        Ok(results)
    }

    /// Get posts only by author (content_type = 0)
    ///
    /// Convenience method that filters to posts only.
    pub fn get_posts_by_author(
        &self,
        author: &[u8; 32],
        limit: usize,
        offset: usize,
    ) -> Result<Vec<([u8; 32], ContentIndexEntry)>, StorageError> {
        self.get_content_by_author(author, limit, offset, Some(0))
    }

    /// Count total content items by author
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn count_content_by_author(&self, author: &[u8; 32]) -> Result<usize, StorageError> {
        Ok(self.author_content_index.scan_prefix(author).count())
    }

    /// Count posts only by author (content_type = 0)
    pub fn count_posts_by_author(&self, author: &[u8; 32]) -> Result<usize, StorageError> {
        let mut count = 0usize;
        for result in self.author_content_index.scan_prefix(author) {
            let (_, content_hash_bytes) = result?;
            if content_hash_bytes.len() == 32 {
                let content_hash: [u8; 32] = content_hash_bytes.as_ref().try_into().unwrap();
                if let Some(metadata) = self.get_content_metadata(&content_hash)? {
                    if metadata.content_type == 0 {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }

    /// Rebuild all content indexes from existing content blocks
    ///
    /// Rebuilds: space_content_index, content_metadata_index,
    /// posts_by_space_index, replies_by_parent_index, author_content_index
    ///
    /// Call this once after upgrading to populate indexes from existing data.
    /// This is idempotent - can be called multiple times safely.
    ///
    /// # Errors
    ///
    /// Returns error if database operations fail.
    pub fn rebuild_space_content_index(&self) -> Result<usize, StorageError> {
        // Clear existing indexes first
        self.space_content_index.clear()?;
        self.content_metadata_index.clear()?;
        self.posts_by_space_index.clear()?;
        self.replies_by_parent_index.clear()?;
        self.author_content_index.clear()?;

        // Collect all actions with their block space_ids
        // We need to process Posts first, then Replies, so parent space_ids are available
        let mut posts: Vec<(crate::blocks::Action, [u8; 16])> = Vec::new();
        let mut replies: Vec<(crate::blocks::Action, [u8; 16])> = Vec::new();

        for result in self.content_blocks.iter() {
            let (_, data) = result?;
            let block: ContentBlock = bincode::deserialize(&data)?;
            let block_space_id_16: [u8; 16] = block.space_id[..16].try_into().unwrap_or([0u8; 16]);

            for action in block.actions {
                if matches!(action.action_type, crate::blocks::ActionType::Engage) {
                    continue;
                }
                if action.content_hash.is_none() {
                    continue;
                }

                if matches!(action.action_type, crate::blocks::ActionType::Post) {
                    posts.push((action, block_space_id_16));
                } else {
                    replies.push((action, block_space_id_16));
                }
            }
        }

        let mut indexed = 0usize;

        // Index all Posts first (they use their block's space_id directly)
        for (action, block_space_id_16) in posts {
            let content_hash = action.content_hash.unwrap();

            // Create space content index key
            let mut index_key = [0u8; 24];
            index_key[..16].copy_from_slice(&block_space_id_16);
            index_key[16..].copy_from_slice(&action.timestamp.to_be_bytes());

            self.space_content_index.insert(&index_key, &content_hash)?;
            // Also add to posts-only index
            self.posts_by_space_index
                .insert(&index_key, &content_hash)?;

            let parent_hash = action.parent_id.unwrap_or([0u8; 32]);
            let entry = ContentIndexEntry {
                author: action.actor,
                parent_hash,
                content_type: 0u8, // Post
                timestamp: action.timestamp,
                space_id: block_space_id_16,
            };

            let entry_data = bincode::serialize(&entry)?;
            self.content_metadata_index
                .insert(&content_hash, entry_data)?;

            // Author content index: Key = author_pk(32) || timestamp(8) → content_hash
            let mut author_key = [0u8; 40];
            author_key[..32].copy_from_slice(&action.actor);
            author_key[32..].copy_from_slice(&action.timestamp.to_be_bytes());
            self.author_content_index
                .insert(&author_key, &content_hash)?;

            indexed += 1;
        }

        // Now index Replies - look up parent's space_id
        for (action, block_space_id_16) in replies {
            let content_hash = action.content_hash.unwrap();

            // For replies, look up parent's space_id to ensure correct indexing
            let space_id_16: [u8; 16] = if let Some(parent_hash) = action.parent_id {
                if let Ok(Some(parent_entry_data)) = self.content_metadata_index.get(&parent_hash) {
                    if let Ok(parent_entry) =
                        bincode::deserialize::<ContentIndexEntry>(&parent_entry_data)
                    {
                        parent_entry.space_id
                    } else {
                        block_space_id_16
                    }
                } else {
                    // Parent not indexed - fallback to block's space_id
                    block_space_id_16
                }
            } else {
                block_space_id_16
            };

            // Create space content index key
            let mut index_key = [0u8; 24];
            index_key[..16].copy_from_slice(&space_id_16);
            index_key[16..].copy_from_slice(&action.timestamp.to_be_bytes());

            self.space_content_index.insert(&index_key, &content_hash)?;

            let parent_hash = action.parent_id.unwrap_or([0u8; 32]);

            // Add to replies-by-parent index for efficient thread loading.
            // Guard against self-parent (parent == content) which would make the
            // reply-tree walk cycle — same guard as the other two write paths.
            if action.parent_id.is_some() {
                if parent_hash != content_hash {
                    let mut reply_key = [0u8; 40];
                    reply_key[..32].copy_from_slice(&parent_hash);
                    reply_key[32..].copy_from_slice(&action.timestamp.to_be_bytes());
                    self.replies_by_parent_index
                        .insert(&reply_key, &content_hash)?;
                } else {
                    // TRIPWIRE: self-parenting reply reached the batch indexer.
                    log::warn!(
                        "[SELF-PARENT-TRIPWIRE] Reply {} (batch) parents ITSELF — not indexed. author={} ts={}",
                        hex::encode(content_hash),
                        hex::encode(action.actor),
                        action.timestamp
                    );
                }
            }

            let entry = ContentIndexEntry {
                author: action.actor,
                parent_hash,
                content_type: 1u8, // Reply
                timestamp: action.timestamp,
                space_id: space_id_16,
            };

            let entry_data = bincode::serialize(&entry)?;
            self.content_metadata_index
                .insert(&content_hash, entry_data)?;

            // Author content index: Key = author_pk(32) || timestamp(8) → content_hash
            let mut author_key = [0u8; 40];
            author_key[..32].copy_from_slice(&action.actor);
            author_key[32..].copy_from_slice(&action.timestamp.to_be_bytes());
            self.author_content_index
                .insert(&author_key, &content_hash)?;

            indexed += 1;
        }

        // Store index version marker
        let version_key = b"__index_version__";
        self.content_metadata_index
            .insert(version_key, &Self::INDEX_VERSION.to_le_bytes())?;
        log::info!("[INDEX] Index version {} saved", Self::INDEX_VERSION);

        // Flush to ensure index is persisted
        self.db.flush()?;

        Ok(indexed)
    }

    /// Current index version - bump this to force rebuild on schema changes
    const INDEX_VERSION: u32 = 5; // Version 5: Add author_content_index for feed-style queries

    /// Check if space content index needs rebuilding
    pub fn needs_index_rebuild(&self) -> Result<bool, StorageError> {
        // Check index version - rebuild if version is outdated or missing
        let version_key = b"__index_version__";
        if let Ok(Some(version_bytes)) = self.content_metadata_index.get(version_key) {
            if version_bytes.len() == 4 {
                let stored_version = u32::from_le_bytes([
                    version_bytes[0],
                    version_bytes[1],
                    version_bytes[2],
                    version_bytes[3],
                ]);
                if stored_version == Self::INDEX_VERSION {
                    return Ok(false); // Up to date, no rebuild needed
                }
                log::info!(
                    "[INDEX] Index version {} is outdated (current: {}), triggering rebuild",
                    stored_version,
                    Self::INDEX_VERSION
                );
                return Ok(true); // Outdated version, rebuild
            }
        }

        // No version marker found - check if we have content but no index
        let has_content = self.content_blocks.iter().next().is_some();
        let has_index = self.content_metadata_index.iter().next().is_some();

        if has_content && has_index {
            // Index exists but no version marker - could be old schema, rebuild to be safe
            log::info!("[INDEX] Index exists but no version marker, triggering rebuild");
            return Ok(true);
        }

        Ok(has_content && !has_index)
    }

    // ==========================================================================
    // Best Tip Management (Fork Resolution)
    // ==========================================================================

    /// Key used for storing the best tip in the best_tip tree
    const BEST_TIP_KEY: &'static [u8] = b"best_tip";

    /// Get the current canonical chain tip hash
    ///
    /// Returns the hash of the block at the tip of the heaviest chain.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_best_tip(&self) -> Result<Option<BlockHash>, StorageError> {
        match self.best_tip.get(Self::BEST_TIP_KEY)? {
            Some(data) => {
                let hash: BlockHash =
                    data.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes".to_string(),
                            actual: format!("{} bytes", data.len()),
                        })?;
                Ok(Some(hash))
            }
            None => Ok(None),
        }
    }

    /// Set the canonical chain tip hash
    ///
    /// Updates the best_tip to point to the new canonical chain tip.
    ///
    /// # Errors
    ///
    /// Returns error if database write fails.
    pub fn set_best_tip(&self, hash: &BlockHash) -> Result<(), StorageError> {
        self.best_tip.insert(Self::BEST_TIP_KEY, hash)?;
        Ok(())
    }

    /// Get the canonical tip block
    ///
    /// Returns the full RootBlock at the tip of the heaviest chain.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_best_tip_block(&self) -> Result<Option<RootBlock>, StorageError> {
        match self.get_best_tip()? {
            Some(hash) => self.get_root_block(&hash),
            None => Ok(None),
        }
    }

    /// Check if a block is heavier than the current best tip
    ///
    /// Returns true if the block has higher cumulative_pow than the current best tip,
    /// meaning it should become the new canonical chain.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn is_heavier_than_best_tip(&self, block: &RootBlock) -> Result<bool, StorageError> {
        match self.get_best_tip_block()? {
            Some(tip) => Ok(block.cumulative_pow > tip.cumulative_pow),
            None => Ok(true), // No tip yet, any block is heavier
        }
    }

    /// Update best tip if the new block is heavier
    ///
    /// This is the core fork resolution logic. If the new block has more
    /// cumulative PoW than the current best tip, it becomes the new canonical tip.
    ///
    /// Returns true if the best tip was updated (a reorg occurred or first block).
    ///
    /// # Errors
    ///
    /// Returns error if database operations fail.
    pub fn update_best_tip_if_heavier(&self, block: &RootBlock) -> Result<bool, StorageError> {
        let block_hash = block.hash();

        if self.is_heavier_than_best_tip(block)? {
            // Make this block canonical by rewriting the height index along its
            // ENTIRE ancestry back to the common ancestor — not just its own
            // height. The single-height update used previously left the index
            // inconsistent whenever the heavier block descended from a fork
            // point BELOW our current tip (the block's height became canonical
            // while its ancestors still pointed at the losing fork), so a node
            // that had built a minority fork could never adopt the heavier
            // chain and stayed stuck forever.
            match self.make_canonical(block)? {
                Some(orphaned) => {
                    log::info!(
                        "[CHAIN] New best tip: height={}, hash={}, cumulative_pow={} ({} blocks reorged out)",
                        block.height,
                        hex::encode(&block_hash[..8]),
                        block.cumulative_pow,
                        orphaned.len()
                    );
                    Ok(true)
                }
                None => {
                    // Heavier than our tip, but its ancestry is not fully
                    // present yet. Adopting now would corrupt the height index,
                    // so defer: the block stays in raw storage and adoption
                    // happens once the missing ancestors arrive (e.g. via a
                    // locator sync).
                    log::debug!(
                        "[CHAIN] Heavier block {} (height {}) deferred: ancestry incomplete",
                        hex::encode(&block_hash[..8]),
                        block.height
                    );
                    Ok(false)
                }
            }
        } else {
            // Block is valid but not heavier - store it but don't update canonical chain
            log::debug!(
                "[CHAIN] Block stored but not canonical: height={}, hash={}, cumulative_pow={}",
                block.height,
                hex::encode(&block_hash[..8]),
                block.cumulative_pow
            );
            Ok(false)
        }
    }

    /// Remove a single height's entry from the canonical height index.
    fn remove_height_index(&self, height: u64) -> Result<(), StorageError> {
        let key = height.to_be_bytes();
        self.height_index.remove(&key)?;
        Ok(())
    }

    /// Make `new_tip` the canonical chain tip, rewriting the height index along
    /// its full ancestry back to the common ancestor with the current canonical
    /// chain.
    ///
    /// This is the deep-reorg primitive. It walks `new_tip`'s ancestry via
    /// `prev_root_hash` collecting every height that must be reassigned, until
    /// it reaches a block that is already canonical at its height (the common
    /// ancestor) or the new chain's genesis. It only mutates storage once it
    /// knows the whole ancestry is present.
    ///
    /// Returns:
    /// * `Ok(Some(orphaned))` — reorg applied; `orphaned` are the old canonical
    ///   block hashes displaced from the height index.
    /// * `Ok(None)` — the ancestry is not fully present in storage yet, so
    ///   NOTHING was mutated. The caller should defer until the missing
    ///   ancestors arrive.
    ///
    /// # Errors
    ///
    /// Returns error if a database operation fails.
    fn make_canonical(&self, new_tip: &RootBlock) -> Result<Option<Vec<BlockHash>>, StorageError> {
        // Phase 1 (read-only): collect the new chain's (height, hash) pairs from
        // the tip down to the common ancestor. Abort WITHOUT mutating if any
        // ancestor block is missing.
        let mut new_chain: Vec<(u64, BlockHash)> = Vec::new();
        let mut cursor = new_tip.clone();
        loop {
            let height = cursor.height;
            let hash = cursor.hash();

            // Already canonical at its height → common ancestor reached.
            if self.get_root_hash_at_height(height)? == Some(hash) {
                break;
            }

            new_chain.push((height, hash));

            // Reached the new chain's genesis without meeting our canonical
            // chain — the whole chain is its own ancestry (shared genesis on an
            // isolated network), so treat genesis as the ancestor and stop.
            if cursor.prev_root_hash == [0u8; 32] {
                break;
            }

            cursor = match self.get_root_block(&cursor.prev_root_hash)? {
                Some(b) => b,
                None => return Ok(None), // ancestry incomplete — defer, no mutation
            };
        }

        // Phase 2 (mutate): the ancestry is complete, apply the reorg.
        let mut orphaned: Vec<BlockHash> = Vec::new();

        // Any old canonical blocks strictly above the new tip's height are
        // orphaned and their index entries must be truncated, otherwise
        // get_latest_height() would keep reporting the stale higher height.
        let old_height = self.get_latest_height()?.unwrap_or(0);
        for height in (new_tip.height + 1)..=old_height {
            if let Some(old_hash) = self.get_root_hash_at_height(height)? {
                orphaned.push(old_hash);
                self.remove_height_index(height)?;
            }
        }

        // Reassign every height along the new chain, recording displaced blocks.
        for (height, hash) in &new_chain {
            if let Some(old_hash) = self.get_root_hash_at_height(*height)? {
                if old_hash != *hash {
                    orphaned.push(old_hash);
                }
            }
            self.index_height(*height, *hash)?;
        }

        self.set_best_tip(&new_tip.hash())?;
        Ok(Some(orphaned))
    }

    /// Store a root block and update canonical chain if heavier
    ///
    /// This is the main entry point for adding blocks with fork resolution.
    /// It always stores the block, but only updates the height index if this
    /// block becomes part of the canonical (heaviest) chain.
    ///
    /// Returns (block_hash, is_new_canonical_tip).
    ///
    /// # Errors
    ///
    /// Returns error if storage operations fail.
    pub fn put_root_block_with_fork_resolution(
        &self,
        block: &RootBlock,
    ) -> Result<(BlockHash, bool), StorageError> {
        // Always store the block (even if it's on a fork)
        let hash = self.put_root_block(block)?;

        // Update canonical chain if this block is heavier
        let is_new_tip = self.update_best_tip_if_heavier(block)?;

        Ok((hash, is_new_tip))
    }

    /// Reorg to a heavier chain
    ///
    /// When we receive a heavier chain, we need to:
    /// 1. Find the common ancestor
    /// 2. Collect blocks that will be orphaned
    /// 3. Update height index to point to new chain
    /// 4. Return orphaned blocks for mempool return
    ///
    /// # Arguments
    /// * `new_tip` - The new canonical tip (already stored)
    ///
    /// # Returns
    /// Returns a list of orphaned block hashes that were part of the old canonical chain.
    ///
    /// # Errors
    ///
    /// Returns error if database operations fail.
    pub fn reorg_to_heavier_chain(
        &self,
        new_tip: &RootBlock,
    ) -> Result<Vec<BlockHash>, StorageError> {
        let current_tip = match self.get_best_tip_block()? {
            Some(tip) => tip,
            None => {
                // No current tip — make_canonical handles first-block indexing.
                return Ok(self.make_canonical(new_tip)?.unwrap_or_default());
            }
        };

        // If new tip is not heavier, no reorg needed.
        if new_tip.cumulative_pow <= current_tip.cumulative_pow {
            return Ok(vec![]);
        }

        // Delegate to the connectivity-guarded reorg. Unlike the previous
        // implementation this refuses to rewrite a partial ancestry (returning
        // an empty vec until the full fork is present) rather than corrupting
        // the height index mid-walk.
        Ok(self.make_canonical(new_tip)?.unwrap_or_default())
    }

    /// Get root blocks in a height range
    ///
    /// Returns blocks from start_height to end_height (inclusive), up to max_blocks.
    /// Blocks are returned in height order.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_blocks_in_range(
        &self,
        start_height: u64,
        end_height: u64,
        max_blocks: u16,
    ) -> Result<Vec<(u64, RootBlock)>, StorageError> {
        let mut blocks = Vec::new();
        let start_key = start_height.to_be_bytes();
        let end_key = end_height.saturating_add(1).to_be_bytes();

        // Range scan on height_index
        for result in self.height_index.range(start_key..end_key) {
            if blocks.len() >= max_blocks as usize {
                break;
            }

            let (height_bytes, hash_bytes) = result?;

            // Parse height
            let height_arr: [u8; 8] =
                height_bytes
                    .as_ref()
                    .try_into()
                    .map_err(|_| StorageError::CorruptedData {
                        expected: "8 bytes for height".to_string(),
                        actual: format!("{} bytes", height_bytes.len()),
                    })?;
            let height = u64::from_be_bytes(height_arr);

            // Parse hash
            let hash: BlockHash =
                hash_bytes
                    .as_ref()
                    .try_into()
                    .map_err(|_| StorageError::CorruptedData {
                        expected: "32 bytes for hash".to_string(),
                        actual: format!("{} bytes", hash_bytes.len()),
                    })?;

            // Get the root block
            if let Some(block) = self.get_root_block(&hash)? {
                blocks.push((height, block));
            }
        }

        Ok(blocks)
    }

    // ==========================================================================
    // Branch Management Methods (Milestone 1.7)
    // ==========================================================================

    /// Build key for branch_metadata tree: space_id(32) || depth(1) || path_bytes
    fn branch_metadata_key(space_id: &[u8; 32], branch_path: &BranchPath) -> Vec<u8> {
        let mut key = Vec::with_capacity(33 + branch_path.path.len());
        key.extend_from_slice(space_id);
        key.push(branch_path.depth);
        key.extend_from_slice(&branch_path.path);
        key
    }

    /// Build key for thread_branch_index: space_id(32) || thread_root_id(32)
    fn thread_index_key(space_id: &[u8; 32], thread_root_id: &[u8; 32]) -> [u8; 64] {
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(space_id);
        key[32..].copy_from_slice(thread_root_id);
        key
    }

    /// Build key for branch_thread_index: space_id(32) || depth(1) || path_bytes || thread_root_id(32)
    fn branch_thread_key(
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        thread_root_id: &[u8; 32],
    ) -> Vec<u8> {
        let mut key = Vec::with_capacity(65 + branch_path.path.len());
        key.extend_from_slice(space_id);
        key.push(branch_path.depth);
        key.extend_from_slice(&branch_path.path);
        key.extend_from_slice(thread_root_id);
        key
    }

    // === Branch Metadata ===

    /// Get branch metadata for a space and branch path
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_branch_metadata(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<Option<BranchMetadata>, StorageError> {
        let key = Self::branch_metadata_key(space_id, branch_path);
        match self.branch_metadata.get(&key)? {
            Some(data) => {
                let metadata: BranchMetadata = bincode::deserialize(&data)?;
                Ok(Some(metadata))
            }
            None => Ok(None),
        }
    }

    /// Store branch metadata
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn put_branch_metadata(
        &self,
        space_id: &[u8; 32],
        metadata: &BranchMetadata,
    ) -> Result<(), StorageError> {
        let key = Self::branch_metadata_key(space_id, &metadata.branch_path);
        let data = bincode::serialize(metadata)?;
        self.branch_metadata.insert(&key, data)?;
        Ok(())
    }

    /// Delete branch metadata
    ///
    /// # Errors
    ///
    /// Returns error if database operation fails.
    pub fn delete_branch_metadata(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<bool, StorageError> {
        let key = Self::branch_metadata_key(space_id, branch_path);
        let removed = self.branch_metadata.remove(&key)?;
        Ok(removed.is_some())
    }

    // === Thread-to-Branch Index ===

    /// Get the branch path for a thread
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_thread_branch(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<Option<BranchPath>, StorageError> {
        let key = Self::thread_index_key(space_id, thread_root_id);
        match self.thread_branch_index.get(&key)? {
            Some(data) => {
                let path =
                    BranchPath::deserialize(&data).ok_or_else(|| StorageError::CorruptedData {
                        expected: "valid BranchPath".to_string(),
                        actual: format!("{} bytes", data.len()),
                    })?;
                Ok(Some(path))
            }
            None => Ok(None),
        }
    }

    /// Store thread-to-branch mapping
    ///
    /// Updates both forward index (thread -> branch) and reverse index (branch -> thread).
    ///
    /// # Errors
    ///
    /// Returns error if database write fails.
    pub fn put_thread_branch(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<(), StorageError> {
        // Forward index: thread -> branch
        let thread_key = Self::thread_index_key(space_id, thread_root_id);
        self.thread_branch_index
            .insert(&thread_key, branch_path.serialize())?;

        // Reverse index: branch -> thread (value is empty, existence is what matters)
        let branch_key = Self::branch_thread_key(space_id, branch_path, thread_root_id);
        self.branch_thread_index.insert(&branch_key, &[])?;

        Ok(())
    }

    /// Delete thread-to-branch mapping
    ///
    /// Removes from both forward and reverse indexes.
    ///
    /// # Errors
    ///
    /// Returns error if database operation fails.
    pub fn delete_thread_branch(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<(), StorageError> {
        let thread_key = Self::thread_index_key(space_id, thread_root_id);
        let branch_key = Self::branch_thread_key(space_id, branch_path, thread_root_id);
        self.thread_branch_index.remove(&thread_key)?;
        self.branch_thread_index.remove(&branch_key)?;
        Ok(())
    }

    // === Thread Size ===

    /// Get cumulative size for a thread
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_thread_size(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<u64, StorageError> {
        let key = Self::thread_index_key(space_id, thread_root_id);
        match self.thread_size.get(&key)? {
            Some(data) => {
                let bytes: [u8; 8] =
                    data.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "8 bytes".to_string(),
                            actual: format!("{} bytes", data.len()),
                        })?;
                Ok(u64::from_be_bytes(bytes))
            }
            None => Ok(0),
        }
    }

    /// Update thread size by adding a delta
    ///
    /// Uses atomic fetch_and_update for thread safety.
    ///
    /// # Errors
    ///
    /// Returns error if database operation fails.
    pub fn update_thread_size(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        size_delta: u64,
    ) -> Result<u64, StorageError> {
        let key = Self::thread_index_key(space_id, thread_root_id);

        // Atomic read-modify-write using sled's fetch_and_update
        let result = self.thread_size.fetch_and_update(&key, |old| {
            let current = old
                .map(|v| {
                    let bytes: [u8; 8] = v.try_into().unwrap_or([0u8; 8]);
                    u64::from_be_bytes(bytes)
                })
                .unwrap_or(0);
            Some((current + size_delta).to_be_bytes().to_vec())
        })?;

        // Return the NEW value (current + delta)
        let current = result
            .map(|v| {
                let bytes: [u8; 8] = v.as_ref().try_into().unwrap_or(&[0u8; 8]).clone();
                u64::from_be_bytes(bytes)
            })
            .unwrap_or(0);

        Ok(current + size_delta)
    }

    // === Space Branch State ===

    /// Get space branch state
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_space_branch_state(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Option<SpaceBranchState>, StorageError> {
        match self.space_branch_state.get(space_id)? {
            Some(data) => {
                let state: SpaceBranchState = bincode::deserialize(&data)?;
                Ok(Some(state))
            }
            None => Ok(None),
        }
    }

    /// Store space branch state
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn put_space_branch_state(
        &self,
        space_id: &[u8; 32],
        state: &SpaceBranchState,
    ) -> Result<(), StorageError> {
        let data = bincode::serialize(state)?;
        self.space_branch_state.insert(space_id, data)?;
        Ok(())
    }

    // === Branch State Versioning & Rebuild Support (SPEC_08 §5 migration) ===

    /// Reserved key for the branch state version marker.
    ///
    /// Lives in the `space_branch_state` tree; space keys are exactly 32
    /// bytes, so this shorter reserved key can never collide with one.
    const BRANCH_STATE_VERSION_KEY: &'static [u8] = b"__branch_state_version__";

    /// Get the stored branch state schema version (None = never built)
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_branch_state_version(&self) -> Result<Option<u32>, StorageError> {
        match self
            .space_branch_state
            .get(Self::BRANCH_STATE_VERSION_KEY)?
        {
            Some(v) if v.len() == 4 => Ok(Some(u32::from_le_bytes([v[0], v[1], v[2], v[3]]))),
            _ => Ok(None),
        }
    }

    /// Set the branch state schema version marker
    ///
    /// # Errors
    ///
    /// Returns error if database write fails.
    pub fn set_branch_state_version(&self, version: u32) -> Result<(), StorageError> {
        self.space_branch_state
            .insert(Self::BRANCH_STATE_VERSION_KEY, &version.to_le_bytes())?;
        Ok(())
    }

    /// Clear ALL branch placement state (metadata, indexes, sizes, per-space
    /// fracture state, and the version marker).
    ///
    /// Used by the deterministic branch-state rebuild: state is then replayed
    /// from canonical chain data so every node derives identical placements
    /// regardless of when it upgraded.
    ///
    /// # Errors
    ///
    /// Returns error if a database operation fails.
    pub fn clear_branch_state(&self) -> Result<(), StorageError> {
        self.branch_metadata.clear()?;
        self.thread_branch_index.clear()?;
        self.space_branch_state.clear()?;
        self.thread_size.clear()?;
        self.branch_thread_index.clear()?;
        Ok(())
    }

    // === Query: Get all threads in a branch ===

    /// Get all threads in a branch with their sizes
    ///
    /// Uses prefix scan on branch_thread_index to find all threads.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_threads_in_branch(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<Vec<([u8; 32], u64)>, StorageError> {
        // Build prefix for scan: space_id || depth || path_bytes
        let prefix = Self::branch_metadata_key(space_id, branch_path);
        let prefix_len = prefix.len();

        let mut threads = Vec::new();
        for item in self.branch_thread_index.scan_prefix(&prefix) {
            let (key, _) = item?;
            // Extract thread_root_id from end of key (last 32 bytes)
            if key.len() == prefix_len + 32 {
                let thread_id: [u8; 32] =
                    key[prefix_len..]
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes for thread_id".to_string(),
                            actual: format!("{} bytes", key.len() - prefix_len),
                        })?;
                let size = self.get_thread_size(space_id, &thread_id)?;
                threads.push((thread_id, size));
            }
        }
        Ok(threads)
    }

    // === Behavioral Branching State (SPEC_13 Phase A) ===

    /// Build key for identity-scoped space state: space_id(32) || identity(32)
    fn space_identity_key(space_id: &[u8; 32], identity: &[u8; 32]) -> [u8; 64] {
        let mut key = [0u8; 64];
        key[..32].copy_from_slice(space_id);
        key[32..].copy_from_slice(identity);
        key
    }

    /// Get per-identity metrics within a space (SPEC_13 §3.2)
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_identity_space_metrics(
        &self,
        space_id: &[u8; 32],
        identity: &[u8; 32],
    ) -> Result<Option<IdentitySpaceMetrics>, StorageError> {
        let key = Self::space_identity_key(space_id, identity);
        match self.identity_space_metrics.get(key)? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// Store per-identity metrics within a space (SPEC_13 §3.2)
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn put_identity_space_metrics(
        &self,
        space_id: &[u8; 32],
        identity: &[u8; 32],
        metrics: &IdentitySpaceMetrics,
    ) -> Result<(), StorageError> {
        let key = Self::space_identity_key(space_id, identity);
        let data = bincode::serialize(metrics)?;
        self.identity_space_metrics.insert(key, data)?;
        Ok(())
    }

    /// Record a directed interaction author -> target_author (SPEC_13 §3.1).
    ///
    /// Updates the author's outgoing edge count and the target's received
    /// engagement counters. Self-interactions (author == target) are recorded
    /// against a single metrics entry — the §6.1 spam case depends on this.
    ///
    /// # Errors
    ///
    /// Returns error if database read/write fails.
    pub fn increment_interaction(
        &self,
        space_id: &[u8; 32],
        author: &[u8; 32],
        target_author: &[u8; 32],
        current_height: u64,
    ) -> Result<(), StorageError> {
        if author == target_author {
            // Single entry: outgoing self-edge plus received self-engagement.
            let mut m = self
                .get_identity_space_metrics(space_id, author)?
                .unwrap_or_else(|| Self::new_identity_metrics(current_height));
            *m.interactions.entry(*target_author).or_insert(0) += 1;
            m.engagements_received += 1;
            m.unique_engagers.insert(*author);
            self.put_identity_space_metrics(space_id, author, &m)?;
            return Ok(());
        }

        // Author side: outgoing edge count.
        let mut author_metrics = self
            .get_identity_space_metrics(space_id, author)?
            .unwrap_or_else(|| Self::new_identity_metrics(current_height));
        *author_metrics
            .interactions
            .entry(*target_author)
            .or_insert(0) += 1;
        self.put_identity_space_metrics(space_id, author, &author_metrics)?;

        // Target side: received engagement counters.
        let mut target_metrics = self
            .get_identity_space_metrics(space_id, target_author)?
            .unwrap_or_else(|| Self::new_identity_metrics(current_height));
        target_metrics.engagements_received += 1;
        target_metrics.unique_engagers.insert(*author);
        self.put_identity_space_metrics(space_id, target_author, &target_metrics)?;

        Ok(())
    }

    /// Register authored content for clustering metrics (SPEC_13 §3.1 Post arm).
    ///
    /// # Errors
    ///
    /// Returns error if database read/write fails.
    pub fn register_author_content(
        &self,
        space_id: &[u8; 32],
        author: &[u8; 32],
        current_height: u64,
    ) -> Result<(), StorageError> {
        let mut m = self
            .get_identity_space_metrics(space_id, author)?
            .unwrap_or_else(|| Self::new_identity_metrics(current_height));
        m.content_count += 1;
        self.put_identity_space_metrics(space_id, author, &m)?;
        Ok(())
    }

    /// Count unique active participants in a space (SPEC_13 §2.2 minority gate).
    ///
    /// A participant is any identity with recorded per-space interaction
    /// metrics — i.e. anyone who posted, replied, engaged, or was engaged in
    /// this space over the same (cumulative) window the other §2.1 metrics
    /// use. Derived purely from chain data processed in chain order, so all
    /// nodes agree.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn count_space_participants(&self, space_id: &[u8; 32]) -> Result<usize, StorageError> {
        let mut count = 0usize;
        for item in self.identity_space_metrics.scan_prefix(space_id) {
            let (key, _) = item?;
            if key.len() == 64 {
                count += 1;
            }
        }
        Ok(count)
    }

    fn new_identity_metrics(current_height: u64) -> IdentitySpaceMetrics {
        IdentitySpaceMetrics {
            first_activity_height: current_height,
            ..IdentitySpaceMetrics::default()
        }
    }

    /// Record a community formation (SPEC_13 §5.1 step 3 / §8.1).
    ///
    /// Writes the formation record, maps each founding member to the
    /// community, indexes the community under its parent space, and (if the
    /// fracture already executed) indexes the community branch.
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn record_community_formation(
        &self,
        formation: &CommunityFormation,
    ) -> Result<(), StorageError> {
        let data = bincode::serialize(formation)?;
        self.communities.insert(formation.community_id, data)?;

        for member in &formation.founding_members {
            let key = Self::space_identity_key(&formation.parent_space_id, member);
            self.identity_community
                .insert(key, &formation.community_id)?;
        }

        let space_key =
            Self::space_identity_key(&formation.parent_space_id, &formation.community_id);
        self.space_communities
            .insert(space_key, &formation.formation_height.to_be_bytes())?;

        if let Some(branch) = &formation.community_branch {
            self.put_community_branch(&formation.parent_space_id, branch, &formation.community_id)?;
        }

        Ok(())
    }

    /// Get a community formation record by ID (SPEC_13 §8.1)
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_community_formation(
        &self,
        community_id: &[u8; 32],
    ) -> Result<Option<CommunityFormation>, StorageError> {
        match self.communities.get(community_id)? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// Get the primary community an identity belongs to in a space (SPEC_13 §8.1)
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_identity_community(
        &self,
        space_id: &[u8; 32],
        identity: &[u8; 32],
    ) -> Result<Option<[u8; 32]>, StorageError> {
        let key = Self::space_identity_key(space_id, identity);
        match self.identity_community.get(key)? {
            Some(data) => {
                let id: [u8; 32] =
                    data.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes for community_id".to_string(),
                            actual: format!("{} bytes", data.len()),
                        })?;
                Ok(Some(id))
            }
            None => Ok(None),
        }
    }

    /// List communities formed under a parent space (SPEC_13 §8.1)
    ///
    /// Returns (community_id, formation_height) pairs.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_space_communities(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Vec<([u8; 32], u64)>, StorageError> {
        let mut result = Vec::new();
        for item in self.space_communities.scan_prefix(space_id) {
            let (key, value) = item?;
            if key.len() == 64 && value.len() == 8 {
                let community_id: [u8; 32] =
                    key[32..]
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes for community_id".to_string(),
                            actual: format!("{} bytes", key.len() - 32),
                        })?;
                let height = u64::from_be_bytes(value.as_ref().try_into().map_err(|_| {
                    StorageError::CorruptedData {
                        expected: "8 bytes for height".to_string(),
                        actual: format!("{} bytes", value.len()),
                    }
                })?);
                result.push((community_id, height));
            }
        }
        Ok(result)
    }

    /// Index a branch as belonging to a community (Phase A community-as-branch).
    ///
    /// # Errors
    ///
    /// Returns error if database write fails.
    pub fn put_community_branch(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        community_id: &[u8; 32],
    ) -> Result<(), StorageError> {
        let key = Self::branch_metadata_key(space_id, branch_path);
        self.community_branches.insert(key, community_id)?;
        Ok(())
    }

    /// Get the community owning a branch, if any (Phase A community-as-branch).
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_community_for_branch(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<Option<[u8; 32]>, StorageError> {
        let key = Self::branch_metadata_key(space_id, branch_path);
        match self.community_branches.get(key)? {
            Some(data) => {
                let id: [u8; 32] =
                    data.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes for community_id".to_string(),
                            actual: format!("{} bytes", data.len()),
                        })?;
                Ok(Some(id))
            }
            None => Ok(None),
        }
    }

    /// List all community branches in a space (Phase A community-as-branch).
    ///
    /// Returns (branch_path, community_id) pairs.
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_community_branches(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Vec<(BranchPath, [u8; 32])>, StorageError> {
        let mut result = Vec::new();
        for item in self.community_branches.scan_prefix(space_id) {
            let (key, value) = item?;
            if key.len() > 32 && value.len() == 32 {
                if let Some(path) = BranchPath::deserialize(&key[32..]) {
                    let community_id: [u8; 32] =
                        value
                            .as_ref()
                            .try_into()
                            .map_err(|_| StorageError::CorruptedData {
                                expected: "32 bytes for community_id".to_string(),
                                actual: format!("{} bytes", value.len()),
                            })?;
                    result.push((path, community_id));
                }
            }
        }
        Ok(result)
    }

    /// Store a community lineage record (Phase 2 space-tree navigation).
    ///
    /// Written at formation time and updated by the space-rename action.
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn put_community_lineage(&self, lineage: &CommunityLineage) -> Result<(), StorageError> {
        let data = bincode::serialize(lineage)?;
        self.community_lineage.insert(lineage.community_id, data)?;
        Ok(())
    }

    /// Get the lineage record for a community, if any.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_community_lineage(
        &self,
        community_id: &[u8; 32],
    ) -> Result<Option<CommunityLineage>, StorageError> {
        match self.community_lineage.get(community_id)? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// List lineage records for all communities formed under a parent space,
    /// sorted by formation height then community id (deterministic order).
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_space_children(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Vec<CommunityLineage>, StorageError> {
        let mut children = Vec::new();
        for (community_id, _height) in self.get_space_communities(space_id)? {
            if let Some(lineage) = self.get_community_lineage(&community_id)? {
                children.push(lineage);
            }
        }
        children.sort_by(|a, b| {
            a.formation_height
                .cmp(&b.formation_height)
                .then_with(|| a.community_id.cmp(&b.community_id))
        });
        Ok(children)
    }

    /// List ALL community lineage records on this node (Phase 2).
    ///
    /// Bounded by the number of formed communities (small — one per space
    /// per ~14-day cooldown). Used to resolve 16-byte community prefixes.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_all_community_lineages(&self) -> Result<Vec<CommunityLineage>, StorageError> {
        let mut result = Vec::new();
        for item in self.community_lineage.iter() {
            let (_, data) = item?;
            result.push(bincode::deserialize(&data)?);
        }
        Ok(result)
    }

    /// Record a frequency-drift audit record (network isolation). Latest per
    /// actor wins (upsert), and only a strictly newer timestamp overwrites so
    /// out-of-order block application can't regress a node's known frequency.
    ///
    /// # Errors
    /// Returns error if serialization or database access fails.
    pub fn put_frequency_drift(
        &self,
        record: &FrequencyDriftRecord,
    ) -> Result<(), StorageError> {
        if let Some(existing) = self.frequency_drifts.get(record.actor)? {
            let prev: FrequencyDriftRecord = bincode::deserialize(&existing)?;
            if prev.timestamp >= record.timestamp {
                return Ok(());
            }
        }
        let data = bincode::serialize(record)?;
        self.frequency_drifts.insert(record.actor, data)?;
        Ok(())
    }

    /// All known frequency-drift records (latest per actor).
    ///
    /// # Errors
    /// Returns error if database read or deserialization fails.
    pub fn get_all_frequency_drifts(&self) -> Result<Vec<FrequencyDriftRecord>, StorageError> {
        let mut result = Vec::new();
        for item in self.frequency_drifts.iter() {
            let (_, data) = item?;
            result.push(bincode::deserialize(&data)?);
        }
        Ok(result)
    }

    /// Record a spam cluster signal (SPEC_13 §6.1).
    ///
    /// Upserts by (space, identity) — repeated detections refresh the signal.
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn record_spam_cluster_signal(
        &self,
        signal: &SpamClusterSignal,
    ) -> Result<(), StorageError> {
        let key = Self::space_identity_key(&signal.space_id, &signal.identity);
        let data = bincode::serialize(signal)?;
        self.spam_cluster_signals.insert(key, data)?;
        Ok(())
    }

    /// Get the spam cluster signal for an identity in a space, if any (SPEC_13 §6.1)
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_spam_cluster_signal(
        &self,
        space_id: &[u8; 32],
        identity: &[u8; 32],
    ) -> Result<Option<SpamClusterSignal>, StorageError> {
        let key = Self::space_identity_key(space_id, identity);
        match self.spam_cluster_signals.get(key)? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// List spam cluster signals for a space (SPEC_13 §6.1), for consumption
    /// by the spam-attestation / space-health side.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_spam_cluster_signals(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Vec<SpamClusterSignal>, StorageError> {
        let mut result = Vec::new();
        for item in self.spam_cluster_signals.scan_prefix(space_id) {
            let (_, data) = item?;
            result.push(bincode::deserialize(&data)?);
        }
        Ok(result)
    }

    /// Get the last behavioral formation height for a space (SPEC_13 §6.3 cooldown)
    ///
    /// # Errors
    ///
    /// Returns error if database read fails.
    pub fn get_last_formation_height(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Option<u64>, StorageError> {
        match self.space_formation_heights.get(space_id)? {
            Some(data) => {
                let bytes: [u8; 8] =
                    data.as_ref()
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "8 bytes for height".to_string(),
                            actual: format!("{} bytes", data.len()),
                        })?;
                Ok(Some(u64::from_be_bytes(bytes)))
            }
            None => Ok(None),
        }
    }

    /// Set the last behavioral formation height for a space (SPEC_13 §6.3 cooldown)
    ///
    /// # Errors
    ///
    /// Returns error if database write fails.
    pub fn put_last_formation_height(
        &self,
        space_id: &[u8; 32],
        height: u64,
    ) -> Result<(), StorageError> {
        self.space_formation_heights
            .insert(space_id, &height.to_be_bytes())?;
        Ok(())
    }

    /// Record a log-only behavioral event ("would-be formation", Phase 1
    /// rollout). Writes the event record and indexes it under its parent
    /// space, mirroring [`Self::record_community_formation`] but without any
    /// membership/branch side effects — log-only mode never creates a space.
    ///
    /// # Errors
    ///
    /// Returns error if serialization or database write fails.
    pub fn record_behavioral_event(&self, event: &BehavioralEvent) -> Result<(), StorageError> {
        let data = bincode::serialize(event)?;
        self.behavioral_events.insert(event.event_id, data)?;

        let space_key = Self::space_identity_key(&event.parent_space_id, &event.event_id);
        self.space_behavioral_events
            .insert(space_key, &event.detected_height.to_be_bytes())?;

        Ok(())
    }

    /// Get a behavioral event record by ID.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_behavioral_event(
        &self,
        event_id: &[u8; 32],
    ) -> Result<Option<BehavioralEvent>, StorageError> {
        match self.behavioral_events.get(event_id)? {
            Some(data) => Ok(Some(bincode::deserialize(&data)?)),
            None => Ok(None),
        }
    }

    /// List behavioral events recorded under a parent space (Phase 1 rollout).
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_space_behavioral_events(
        &self,
        space_id: &[u8; 32],
    ) -> Result<Vec<BehavioralEvent>, StorageError> {
        let mut result = Vec::new();
        for item in self.space_behavioral_events.scan_prefix(space_id) {
            let (key, _) = item?;
            if key.len() == 64 {
                let event_id: [u8; 32] =
                    key[32..]
                        .try_into()
                        .map_err(|_| StorageError::CorruptedData {
                            expected: "32 bytes for event_id".to_string(),
                            actual: format!("{} bytes", key.len() - 32),
                        })?;
                if let Some(event) = self.get_behavioral_event(&event_id)? {
                    result.push(event);
                }
            }
        }
        Ok(result)
    }

    /// List all behavioral events recorded on this node (Phase 1 rollout),
    /// across every space.
    ///
    /// # Errors
    ///
    /// Returns error if database read or deserialization fails.
    pub fn get_all_behavioral_events(&self) -> Result<Vec<BehavioralEvent>, StorageError> {
        let mut result = Vec::new();
        for item in self.behavioral_events.iter() {
            let (_, data) = item?;
            result.push(bincode::deserialize(&data)?);
        }
        Ok(result)
    }

    // === Finalized Action Tracking ===

    /// Check if an action has already been finalized in a block
    ///
    /// Returns the block height where the action was finalized, or None if not finalized.
    pub fn is_action_finalized(&self, action_hash: &[u8; 32]) -> Result<Option<u64>, StorageError> {
        match self.finalized_actions.get(action_hash)? {
            Some(height_bytes) => {
                if height_bytes.len() == 8 {
                    let height =
                        u64::from_be_bytes(height_bytes.as_ref().try_into().map_err(|_| {
                            StorageError::CorruptedData {
                                expected: "8 bytes for height".to_string(),
                                actual: format!("{} bytes", height_bytes.len()),
                            }
                        })?);
                    Ok(Some(height))
                } else {
                    Err(StorageError::CorruptedData {
                        expected: "8 bytes for height".to_string(),
                        actual: format!("{} bytes", height_bytes.len()),
                    })
                }
            }
            None => Ok(None),
        }
    }

    /// Mark an action as finalized at a specific block height
    ///
    /// This should be called when storing a block to track which actions have been included.
    pub fn mark_action_finalized(
        &self,
        action_hash: &[u8; 32],
        height: u64,
    ) -> Result<(), StorageError> {
        self.finalized_actions
            .insert(action_hash, &height.to_be_bytes())?;
        Ok(())
    }

    /// Check if any actions in a content block are already finalized
    ///
    /// Returns a list of (action_index, finalized_height) for any already-finalized actions.
    pub fn check_content_block_for_duplicates(
        &self,
        content_block: &ContentBlock,
    ) -> Result<Vec<(usize, u64)>, StorageError> {
        use crate::blocks::builder::BlockBuilder;

        let mut duplicates = Vec::new();
        for (idx, action) in content_block.actions.iter().enumerate() {
            let action_hash = BlockBuilder::action_hash(action);
            if let Some(height) = self.is_action_finalized(&action_hash)? {
                duplicates.push((idx, height));
            }
        }
        Ok(duplicates)
    }

    /// Mark all actions in a content block as finalized
    pub fn mark_content_block_actions_finalized(
        &self,
        content_block: &ContentBlock,
        height: u64,
    ) -> Result<(), StorageError> {
        use crate::blocks::builder::BlockBuilder;

        for action in &content_block.actions {
            let action_hash = BlockBuilder::action_hash(action);
            self.mark_action_finalized(&action_hash, height)?;
        }
        Ok(())
    }

    /// Remove finalized status for an action
    ///
    /// Called during reorg when orphaning a block.
    pub fn unmark_action_finalized(&self, action_hash: &[u8; 32]) -> Result<bool, StorageError> {
        Ok(self.finalized_actions.remove(action_hash)?.is_some())
    }

    /// Unmark all finalized actions at a given height
    ///
    /// Called during reorg to allow a heavier chain's blocks to be accepted.
    /// Returns the number of actions unmarked.
    pub fn unmark_actions_at_height(&self, height: u64) -> Result<usize, StorageError> {
        use crate::blocks::builder::BlockBuilder;

        let mut count = 0;

        // First try to find actions via the stored block (if it exists)
        if let Some(root_hash) = self.get_root_hash_at_height(height)? {
            if let Some(root_block) = self.get_root_block(&root_hash)? {
                for space_hash in &root_block.space_block_hashes {
                    let space_block = match self.get_space_block(space_hash)? {
                        Some(b) => b,
                        None => continue,
                    };

                    for content_hash in &space_block.content_block_hashes {
                        let content_block = match self.get_content_block(content_hash)? {
                            Some(b) => b,
                            None => continue,
                        };

                        for action in &content_block.actions {
                            let action_hash = BlockBuilder::action_hash(action);
                            if self.unmark_action_finalized(&action_hash)? {
                                count += 1;
                            }
                        }
                    }
                }
            }
        }

        // ALSO: Scan the finalized_actions tree directly for any actions marked at this height
        // This handles the case where content blocks were processed but root block was never stored
        let height_removed = self.clear_finalized_actions_by_height(height)?;
        count += height_removed;

        if count > 0 {
            log::info!(
                "[CHAIN] Unmarked {} finalized actions at height {}",
                count,
                height
            );
        }
        Ok(count)
    }

    /// Clear all finalized actions marked at a specific height
    ///
    /// Scans the finalized_actions tree and removes any action marked at the given height.
    /// This handles partial failures where content was processed but root block wasn't stored.
    pub fn clear_finalized_actions_by_height(&self, height: u64) -> Result<usize, StorageError> {
        let mut count = 0;
        let mut to_remove = Vec::new();

        // Scan all finalized actions and collect those at the target height
        for result in self.finalized_actions.iter() {
            let (key, value) = result?;
            // Value is the height stored as u64 bytes
            if value.len() >= 8 {
                let stored_height = u64::from_be_bytes(value[..8].try_into().unwrap_or([0u8; 8]));
                if stored_height == height {
                    let mut action_hash = [0u8; 32];
                    action_hash.copy_from_slice(&key);
                    to_remove.push(action_hash);
                }
            }
        }

        // Remove collected actions
        for action_hash in to_remove {
            if self.finalized_actions.remove(&action_hash)?.is_some() {
                count += 1;
            }
        }

        if count > 0 {
            log::debug!(
                "[CHAIN] Cleared {} stale finalized actions at height {}",
                count,
                height
            );
        }
        Ok(count)
    }

    // === Fork Resolution ===

    /// Get all actions from a block at a given height
    ///
    /// Returns (thread_id, space_id, action, branch_path) tuples for returning to mempool.
    pub fn get_actions_at_height(
        &self,
        height: u64,
    ) -> Result<
        Vec<(
            [u8; 32],
            [u8; 32],
            crate::blocks::action::Action,
            crate::blocks::BranchPath,
        )>,
        StorageError,
    > {
        use crate::blocks::BranchPath;

        let root_hash = match self.get_root_hash_at_height(height)? {
            Some(h) => h,
            None => return Ok(Vec::new()),
        };

        let root_block = match self.get_root_block(&root_hash)? {
            Some(b) => b,
            None => return Ok(Vec::new()),
        };

        let mut actions = Vec::new();

        for space_hash in &root_block.space_block_hashes {
            let space_block = match self.get_space_block(space_hash)? {
                Some(b) => b,
                None => continue,
            };

            for content_hash in &space_block.content_block_hashes {
                let content_block = match self.get_content_block(content_hash)? {
                    Some(b) => b,
                    None => continue,
                };

                let thread_id = content_block.thread_root_id;
                let space_id = content_block.space_id;
                // Use root branch for simplicity - actions will be re-routed properly on re-add
                let branch_path = BranchPath::root();

                for action in content_block.actions {
                    actions.push((thread_id, space_id, action, branch_path.clone()));
                }
            }
        }

        Ok(actions)
    }

    /// Rollback a block at a given height and ALL blocks at higher heights
    ///
    /// This cascades the rollback: if we rollback height H, we must also rollback
    /// heights H+1, H+2, ..., tip because they depend on the block at height H.
    /// Returns the orphaned actions to be returned to the mempool.
    pub fn rollback_block_at_height(
        &self,
        height: u64,
    ) -> Result<
        Vec<(
            [u8; 32],
            [u8; 32],
            crate::blocks::action::Action,
            crate::blocks::BranchPath,
        )>,
        StorageError,
    > {
        use crate::blocks::builder::BlockBuilder;

        let current_tip = self.get_latest_height()?.unwrap_or(0);
        let mut all_orphaned_actions = Vec::new();

        // CRITICAL: First rollback all heights from tip down to height+1
        // This ensures we don't leave orphaned blocks in the height_index
        if current_tip > height {
            log::info!(
                "[ROLLBACK] Cascading rollback: rolling back heights {} down to {}",
                current_tip,
                height
            );
            for h in (height + 1..=current_tip).rev() {
                let orphaned = self.rollback_single_height(h)?;
                all_orphaned_actions.extend(orphaned);
            }
        }

        // Now rollback the target height
        let orphaned = self.rollback_single_height(height)?;
        all_orphaned_actions.extend(orphaned);

        Ok(all_orphaned_actions)
    }

    /// Rollback a single height (internal helper, does not cascade)
    fn rollback_single_height(
        &self,
        height: u64,
    ) -> Result<
        Vec<(
            [u8; 32],
            [u8; 32],
            crate::blocks::action::Action,
            crate::blocks::BranchPath,
        )>,
        StorageError,
    > {
        use crate::blocks::builder::BlockBuilder;

        let root_hash = match self.get_root_hash_at_height(height)? {
            Some(h) => h,
            None => return Ok(Vec::new()),
        };

        let root_block = match self.get_root_block(&root_hash)? {
            Some(b) => b,
            None => return Ok(Vec::new()),
        };

        // Collect actions first (before deleting)
        let actions = self.get_actions_at_height(height)?;

        // Unmark all actions as finalized
        for (_, _, action, _) in &actions {
            let action_hash = BlockBuilder::action_hash(action);
            self.unmark_action_finalized(&action_hash)?;
        }

        // Delete content blocks
        for space_hash in &root_block.space_block_hashes {
            if let Some(space_block) = self.get_space_block(space_hash)? {
                for content_hash in &space_block.content_block_hashes {
                    self.delete_block(content_hash)?;
                }
            }
        }

        // Delete space blocks
        for space_hash in &root_block.space_block_hashes {
            self.delete_block(space_hash)?;
        }

        // Delete root block
        self.delete_block(&root_hash)?;

        // Remove from height index
        self.height_index.remove(&height.to_be_bytes())?;

        // Update best tip if this was the tip
        if let Some(tip_hash) = self.get_best_tip()? {
            if tip_hash == root_hash {
                // Set tip to previous block
                if height > 0 {
                    if let Some(prev_hash) = self.get_root_hash_at_height(height - 1)? {
                        self.set_best_tip(&prev_hash)?;
                    }
                }
            }
        }

        Ok(actions)
    }

    /// Compare two block hashes for fork resolution
    ///
    /// Returns true if hash_a should win (is "lower" than hash_b).
    /// Lower hash wins for deterministic tie-breaking.
    pub fn hash_wins(hash_a: &[u8; 32], hash_b: &[u8; 32]) -> bool {
        hash_a < hash_b
    }

    /// Validate the canonical chain integrity
    ///
    /// Walks the height_index from genesis to tip, verifying:
    /// 1. Each indexed block exists in root_blocks
    /// 2. Each block's prev_root_hash matches the block at height-1
    ///
    /// Returns Ok(last_valid_height) - the highest height with a valid chain.
    /// If the entire chain is valid, returns the tip height.
    /// If corruption is found, returns the height just before the corruption.
    pub fn validate_chain(&self) -> Result<u64, StorageError> {
        let tip_height = match self.get_latest_height()? {
            Some(h) => h,
            None => return Ok(0), // Empty chain is valid
        };

        log::info!(
            "[CHAIN-VALIDATE] Validating chain from height 1 to {}",
            tip_height
        );

        let mut last_valid_height = 0u64;
        let mut prev_hash: Option<BlockHash> = None;

        for height in 1..=tip_height {
            // Get the indexed hash at this height
            let indexed_hash = match self.get_root_hash_at_height(height)? {
                Some(h) => h,
                None => {
                    log::warn!(
                        "[CHAIN-VALIDATE] CORRUPTION: No block indexed at height {} (gap in chain)",
                        height
                    );
                    break;
                }
            };

            // Get the actual block
            let block = match self.get_root_block(&indexed_hash)? {
                Some(b) => b,
                None => {
                    log::warn!(
                        "[CHAIN-VALIDATE] CORRUPTION: Block {} indexed at height {} but not found in storage",
                        hex::encode(&indexed_hash[..8]),
                        height
                    );
                    break;
                }
            };

            // Verify block height matches
            if block.height() != height {
                log::warn!(
                    "[CHAIN-VALIDATE] CORRUPTION: Block {} claims height {} but indexed at height {}",
                    hex::encode(&indexed_hash[..8]),
                    block.height(),
                    height
                );
                break;
            }

            // For height > 1, verify parent link
            if height > 1 {
                if let Some(expected_prev) = prev_hash {
                    if block.prev_root_hash != expected_prev {
                        log::warn!(
                            "[CHAIN-VALIDATE] CORRUPTION: Block {} at height {} has prev_root_hash {} but expected {}",
                            hex::encode(&indexed_hash[..8]),
                            height,
                            hex::encode(&block.prev_root_hash[..8]),
                            hex::encode(&expected_prev[..8])
                        );
                        break;
                    }
                }

                // Also verify the parent block actually exists
                if self.get_root_block(&block.prev_root_hash)?.is_none() {
                    log::warn!(
                        "[CHAIN-VALIDATE] CORRUPTION: Block {} at height {} references missing parent {}",
                        hex::encode(&indexed_hash[..8]),
                        height,
                        hex::encode(&block.prev_root_hash[..8])
                    );
                    break;
                }
            }

            // This height is valid
            last_valid_height = height;
            prev_hash = Some(indexed_hash);
        }

        if last_valid_height == tip_height {
            log::info!(
                "[CHAIN-VALIDATE] Chain is valid from height 1 to {}",
                tip_height
            );
        } else {
            log::warn!(
                "[CHAIN-VALIDATE] Chain corruption detected! Valid up to height {}, tip is {}",
                last_valid_height,
                tip_height
            );
        }

        Ok(last_valid_height)
    }

    /// Repair the chain by rolling back to the last valid height
    ///
    /// This is called when validate_chain() finds corruption.
    /// Rolls back all blocks from (last_valid_height + 1) to tip.
    /// Returns the orphaned actions for mempool resubmission.
    pub fn repair_chain(
        &self,
    ) -> Result<
        Vec<(
            [u8; 32],
            [u8; 32],
            crate::blocks::action::Action,
            crate::blocks::BranchPath,
        )>,
        StorageError,
    > {
        let last_valid = self.validate_chain()?;
        let tip_height = self.get_latest_height()?.unwrap_or(0);

        if last_valid >= tip_height {
            log::info!("[CHAIN-REPAIR] No repair needed, chain is valid");
            return Ok(Vec::new());
        }

        log::warn!(
            "[CHAIN-REPAIR] Repairing chain: rolling back heights {} to {}",
            last_valid + 1,
            tip_height
        );

        let mut all_orphaned = Vec::new();

        // Rollback from tip down to last_valid + 1
        for height in (last_valid + 1..=tip_height).rev() {
            log::info!("[CHAIN-REPAIR] Rolling back height {}", height);
            let orphaned = self.rollback_single_height(height)?;
            all_orphaned.extend(orphaned);
        }

        // Update best tip to last valid block
        if last_valid > 0 {
            if let Some(valid_hash) = self.get_root_hash_at_height(last_valid)? {
                self.set_best_tip(&valid_hash)?;
                log::info!(
                    "[CHAIN-REPAIR] Set best tip to block {} at height {}",
                    hex::encode(&valid_hash[..8]),
                    last_valid
                );
            }
        }

        log::info!(
            "[CHAIN-REPAIR] Repair complete. Chain now at height {}, {} orphaned actions returned to mempool",
            last_valid,
            all_orphaned.len()
        );

        Ok(all_orphaned)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_root_block(height: u64, prev_hash: BlockHash) -> RootBlock {
        RootBlock {
            version: RootBlock::CURRENT_VERSION,
            prev_root_hash: prev_hash,
            timestamp: 1_000_000 + height,
            merkle_root: [0u8; 32],
            space_block_hashes: vec![],
            space_block_count: 0,
            total_pow: 0,
            difficulty_target: crate::blocks::INITIAL_DIFFICULTY,
            height,
            cumulative_pow: 0,
            block_creator: [0u8; 32],
        }
    }

    fn create_test_space_block(space_id: [u8; 32]) -> SpaceBlock {
        SpaceBlock {
            space_id,
            merkle_root: [0u8; 32],
            content_block_hashes: vec![],
            prev_space_hash: None,
            timestamp: 1_000_000,
            total_pow: 0,
            content_block_count: 0,
        }
    }

    fn create_test_content_block(thread_id: [u8; 32]) -> ContentBlock {
        ContentBlock {
            thread_root_id: thread_id,
            space_id: [0u8; 32],
            actions: vec![],
            merkle_root: [0u8; 32],
            prev_content_hash: None,
            timestamp: 1_000_000,
            total_pow: 0,
            branch_path: crate::blocks::BranchPath::root(),
            space_metadata: None,
        }
    }

    #[test]
    fn test_chain_store_open_close() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("chain");

        {
            let store = ChainStore::open(&path).unwrap();
            assert_eq!(store.total_bytes(), 0);
        }

        // Reopen should work
        let store = ChainStore::open(&path).unwrap();
        assert_eq!(store.total_bytes(), 0);
    }

    #[test]
    fn test_root_block_storage() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let block = create_test_root_block(0, [0u8; 32]);
        let hash = store.put_root_block(&block).unwrap();

        let retrieved = store.get_root_block(&hash).unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.height, block.height);
        assert_eq!(retrieved.timestamp, block.timestamp);
    }

    #[test]
    fn test_space_block_storage() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let mut space_id = [0u8; 32];
        space_id[0] = 1;
        let block = create_test_space_block(space_id);
        let hash = store.put_space_block(&block).unwrap();

        let retrieved = store.get_space_block(&hash).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().space_id, space_id);
    }

    #[test]
    fn test_content_block_storage() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let mut thread_id = [0u8; 32];
        thread_id[0] = 42;
        let block = create_test_content_block(thread_id);
        let hash = store.put_content_block(&block).unwrap();

        let retrieved = store.get_content_block(&hash).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().thread_root_id, thread_id);
    }

    #[test]
    fn test_height_index() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        // Store blocks at different heights
        for height in 0..10 {
            let block = create_test_root_block(height, [height as u8; 32]);
            let hash = store.put_root_block(&block).unwrap();
            store.index_height(height, hash).unwrap();
        }

        // Verify height index
        for height in 0..10 {
            let hash = store.get_root_hash_at_height(height).unwrap();
            assert!(hash.is_some());
            let block = store.get_root_block(&hash.unwrap()).unwrap().unwrap();
            assert_eq!(block.height, height);
        }

        // Get latest height
        let latest = store.get_latest_height().unwrap();
        assert_eq!(latest, Some(9));
    }

    #[test]
    fn test_delete_block() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let block = create_test_root_block(0, [0u8; 32]);
        let hash = store.put_root_block(&block).unwrap();

        assert!(store.has_root_block(&hash).unwrap());

        let deleted = store.delete_block(&hash).unwrap();
        assert!(deleted);

        assert!(!store.has_root_block(&hash).unwrap());
        assert!(store.get_root_block(&hash).unwrap().is_none());
    }

    #[test]
    fn test_persistence() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("chain");

        let hash;
        {
            let store = ChainStore::open(&path).unwrap();
            let block = create_test_root_block(42, [1u8; 32]);
            hash = store.put_root_block(&block).unwrap();
            store.index_height(42, hash).unwrap();
            store.flush().unwrap();
        }

        // Reopen and verify
        let store = ChainStore::open(&path).unwrap();
        let retrieved = store.get_root_block(&hash).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().height, 42);

        let indexed_hash = store.get_root_hash_at_height(42).unwrap();
        assert_eq!(indexed_hash, Some(hash));
    }

    /// Build a root block linked to `prev`, tagged so that two forks produce
    /// distinct hashes at the same height.
    fn linked_block(height: u64, prev: BlockHash, cumulative_pow: u64, fork_tag: u8) -> RootBlock {
        let mut b = create_test_root_block(height, prev);
        b.cumulative_pow = cumulative_pow;
        b.total_pow = cumulative_pow;
        b.block_creator = [fork_tag; 32];
        b
    }

    /// Build a chain of `heights` blocks starting from `start_prev`, returning
    /// them in ascending order. `pow_base` is added to the height for
    /// cumulative_pow so a fork can be made strictly heavier.
    fn build_chain(
        start_prev: BlockHash,
        start_height: u64,
        count: u64,
        pow_base: u64,
        fork_tag: u8,
    ) -> Vec<RootBlock> {
        let mut blocks = Vec::new();
        let mut prev = start_prev;
        for i in 0..count {
            let height = start_height + i;
            let b = linked_block(height, prev, pow_base + height, fork_tag);
            prev = b.hash();
            blocks.push(b);
        }
        blocks
    }

    // A node on a minority fork must adopt a heavier fork that diverged BELOW
    // its current tip, once that fork's blocks are present. Regression test for
    // the stuck-at-height-12 bug: previously update_best_tip_if_heavier only
    // reindexed the incoming block's own height, leaving the ancestry pointing
    // at the losing fork so the reorg never took.
    #[test]
    fn test_deep_reorg_below_tip_adopts_heavier_chain() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        // Shared history heights 0..=5.
        let shared = build_chain([0u8; 32], 0, 6, 0, 0x11);
        for b in &shared {
            store.put_root_block_with_fork_resolution(b).unwrap();
        }
        let fork_point = shared.last().unwrap().hash();
        let fork_point_height = 5;

        // Fork A: heights 6..=12, canonical (stored via fork resolution).
        let fork_a = build_chain(fork_point, 6, 7, 0, 0xAA);
        for b in &fork_a {
            store.put_root_block_with_fork_resolution(b).unwrap();
        }
        assert_eq!(store.get_latest_height().unwrap(), Some(12));
        assert_eq!(
            store.get_root_hash_at_height(12).unwrap(),
            Some(fork_a.last().unwrap().hash())
        );

        // Fork B: heights 6..=16, heavier (pow_base 1000). Store 6..=15 as RAW
        // only — present but not canonical, exactly the state after a locator
        // sync delivers the fork's ancestry.
        let fork_b = build_chain(fork_point, 6, 11, 1000, 0xBB);
        for b in &fork_b[..fork_b.len() - 1] {
            store.put_root_block(b).unwrap();
        }
        // Height index is still entirely fork A at this point.
        assert_eq!(
            store.get_root_hash_at_height(10).unwrap(),
            Some(fork_a[10 - 6].hash())
        );

        // Now the fork B tip (height 16) arrives via fork resolution → deep reorg.
        let (_, is_new_tip) = store
            .put_root_block_with_fork_resolution(fork_b.last().unwrap())
            .unwrap();
        assert!(is_new_tip, "heavier fork tip should become canonical");

        // Canonical chain is now fork B from the fork point up to 16.
        assert_eq!(store.get_latest_height().unwrap(), Some(16));
        assert_eq!(
            store.get_best_tip_block().unwrap().unwrap().hash(),
            fork_b.last().unwrap().hash()
        );
        for (i, b) in fork_b.iter().enumerate() {
            let h = 6 + i as u64;
            assert_eq!(
                store.get_root_hash_at_height(h).unwrap(),
                Some(b.hash()),
                "height {h} should point at fork B"
            );
        }
        // Shared history below the fork point is untouched.
        assert_eq!(
            store.get_root_hash_at_height(fork_point_height).unwrap(),
            Some(fork_point)
        );
        // Every canonical height links to its parent — no broken chain.
        for h in 1..=16u64 {
            let hash = store.get_root_hash_at_height(h).unwrap().unwrap();
            let block = store.get_root_block(&hash).unwrap().unwrap();
            let parent = store.get_root_hash_at_height(h - 1).unwrap().unwrap();
            assert_eq!(block.prev_root_hash, parent, "height {h} parent mismatch");
        }
    }

    // A heavier block whose ancestry is NOT yet present must NOT be adopted —
    // adopting it would corrupt the height index. It stays deferred until the
    // ancestors arrive.
    #[test]
    fn test_deep_reorg_defers_when_ancestry_missing() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let shared = build_chain([0u8; 32], 0, 6, 0, 0x11);
        for b in &shared {
            store.put_root_block_with_fork_resolution(b).unwrap();
        }
        let fork_point = shared.last().unwrap().hash();
        let fork_a = build_chain(fork_point, 6, 7, 0, 0xAA);
        for b in &fork_a {
            store.put_root_block_with_fork_resolution(b).unwrap();
        }

        // Heavier fork B tip, but its ancestry (6..=15) is absent.
        let fork_b = build_chain(fork_point, 6, 11, 1000, 0xBB);
        let (_, is_new_tip) = store
            .put_root_block_with_fork_resolution(fork_b.last().unwrap())
            .unwrap();

        assert!(!is_new_tip, "must not adopt a fork with missing ancestry");
        // Canonical chain is unchanged — still fork A at height 12.
        assert_eq!(store.get_latest_height().unwrap(), Some(12));
        assert_eq!(
            store.get_root_hash_at_height(12).unwrap(),
            Some(fork_a.last().unwrap().hash())
        );

        // Once the ancestry is delivered, feeding the tip again adopts fork B.
        for b in &fork_b[..fork_b.len() - 1] {
            store.put_root_block(b).unwrap();
        }
        let (_, is_new_tip) = store
            .put_root_block_with_fork_resolution(fork_b.last().unwrap())
            .unwrap();
        assert!(is_new_tip, "adopts once ancestry is present");
        assert_eq!(store.get_latest_height().unwrap(), Some(16));
    }

    #[test]
    fn test_block_counts() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        assert_eq!(store.root_block_count().unwrap(), 0);
        assert_eq!(store.space_block_count().unwrap(), 0);
        assert_eq!(store.content_block_count().unwrap(), 0);

        for i in 0..5 {
            store
                .put_root_block(&create_test_root_block(i, [0u8; 32]))
                .unwrap();
        }
        for i in 0..3 {
            store
                .put_space_block(&create_test_space_block([i as u8; 32]))
                .unwrap();
        }
        for i in 0..7 {
            store
                .put_content_block(&create_test_content_block([i as u8; 32]))
                .unwrap();
        }

        assert_eq!(store.root_block_count().unwrap(), 5);
        assert_eq!(store.space_block_count().unwrap(), 3);
        assert_eq!(store.content_block_count().unwrap(), 7);
    }

    fn make_test_space_info(space_id: [u8; 16]) -> SpaceInfo {
        SpaceInfo {
            space_id,
            name: "Test Space".to_string(),
            description: None,
            creator: [0x42u8; 32],
            created_at: 1_000_000,
            pow_work: 1,
            is_private: false,
            encrypted_name: None,
            creator_encrypted_key: None,
            key_version: 0,
        }
    }

    /// SWIM-SPACE-CLASS Task 4: `register_space` must reject an unclassed
    /// space id (first byte not in 0x01-0x05) at the storage boundary, and
    /// must still accept a legitimately-classed id.
    #[test]
    fn register_space_rejects_unclassed_id() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let mut bad_id = [0xABu8; 16];
        bad_id[0] = 0x00; // not a valid SpaceClass byte
        let bad_info = make_test_space_info(bad_id);

        let result = store.register_space(&bad_info);
        assert!(
            result.is_err(),
            "register_space must reject an unclassed space id"
        );
        assert!(
            store.get_space(&bad_id).unwrap().is_none(),
            "rejected space must not be persisted"
        );
    }

    #[test]
    fn register_space_accepts_classed_id() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path().join("chain")).unwrap();

        let mut good_id = [0xABu8; 16];
        good_id[0] = 0x01; // SpaceClass::Social
        let good_info = make_test_space_info(good_id);

        store
            .register_space(&good_info)
            .expect("register_space must accept a validly-classed space id");
        let fetched = store.get_space(&good_id).unwrap();
        assert!(fetched.is_some(), "accepted space must be persisted");
        assert_eq!(fetched.unwrap().name, "Test Space");
    }
}
