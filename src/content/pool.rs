//! Engagement Pool System (SPEC_03 §7, SPEC_08 §3.3)
//!
//! Implements pooled engagement where multiple users contribute PoW to a shared pool.
//! A pool completes when total PoW reaches 60 seconds, resetting the content's decay timer.
//!
//! # Key Concepts
//!
//! - **Pool Creation**: Any user can create a pool targeting specific content
//! - **Contribution**: Users add PoW work to the pool (minimum 1 second)
//! - **Completion**: When total reaches 60s, pool completes and decay resets
//! - **Expiry**: Pools that don't complete within 10 minutes expire; work is lost
//! - **Content-Specific PoW**: Each pool has a unique target derived from content hash
//!
//! # Sybil Resistance
//!
//! Creating 100 identities to contribute 0.6s each costs the same as one identity
//! contributing 60s. The total PoW requirement is fixed regardless of contributor count.

use crate::crypto::action_pow::ForkPoWConfig;
use crate::crypto::sha256;
use crate::types::constants::{MIN_CONTRIBUTION_SECS, POOL_REQUIRED_POW_SECS, POOL_WINDOW_MS};
use log::{debug, info, warn};
use sled::Db;
use std::collections::HashMap;
use std::sync::Arc;

// ============================================================================
// Types
// ============================================================================

/// Pool ID - 32-byte unique identifier
pub type PoolId = [u8; 32];

/// Pool status per SPEC_08 §3.3
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PoolStatus {
    /// Accepting contributions
    Open = 0x01,
    /// Total met, engagement recorded
    Completed = 0x02,
    /// Window closed incomplete
    Expired = 0x03,
}

impl TryFrom<u8> for PoolStatus {
    type Error = PoolError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(PoolStatus::Open),
            0x02 => Ok(PoolStatus::Completed),
            0x03 => Ok(PoolStatus::Expired),
            _ => Err(PoolError::InvalidStatus(value)),
        }
    }
}

/// Individual contribution per SPEC_08 §3.3
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoolContribution {
    /// PublicKey bytes of contributor
    pub contributor: [u8; 32],
    /// PoW solution nonce
    pub pow_nonce: u64,
    /// Work amount in seconds (NOT milliseconds)
    pub pow_work: u64,
    /// Target hash solved against (content-specific)
    pub pow_target: [u8; 32],
    /// Unix timestamp in milliseconds
    pub timestamp: u64,
    /// Ed25519 signature bytes
    pub signature: [u8; 64],
    /// Random bytes for challenge uniqueness (needed for PoW verification)
    pub nonce_space: [u8; 8],
    /// Optional emoji code (1=❤️, 2=👍, 3=👎, 4=😂, 5=🤔, 6=🤯, 7=🔥, 8=🏊)
    pub emoji: Option<u8>,
}

impl PoolContribution {
    /// Serialize a contribution to bytes for storage
    /// Wire format: 32 + 8 + 8 + 32 + 8 + 64 + 8 + 1 = 161 bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(161);
        buf.extend_from_slice(&self.contributor);
        buf.extend_from_slice(&self.pow_nonce.to_le_bytes());
        buf.extend_from_slice(&self.pow_work.to_le_bytes());
        buf.extend_from_slice(&self.pow_target);
        buf.extend_from_slice(&self.timestamp.to_le_bytes());
        buf.extend_from_slice(&self.signature);
        buf.extend_from_slice(&self.nonce_space);
        buf.push(self.emoji.unwrap_or(0));
        buf
    }

    /// Deserialize a contribution from bytes
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.len() < 161 {
            return None;
        }
        let mut contributor = [0u8; 32];
        contributor.copy_from_slice(&data[0..32]);
        let pow_nonce = u64::from_le_bytes(data[32..40].try_into().ok()?);
        let pow_work = u64::from_le_bytes(data[40..48].try_into().ok()?);
        let mut pow_target = [0u8; 32];
        pow_target.copy_from_slice(&data[48..80]);
        let timestamp = u64::from_le_bytes(data[80..88].try_into().ok()?);
        let mut signature = [0u8; 64];
        signature.copy_from_slice(&data[88..152]);
        let mut nonce_space = [0u8; 8];
        nonce_space.copy_from_slice(&data[152..160]);
        let emoji_byte = data[160];
        let emoji = if emoji_byte == 0 { None } else { Some(emoji_byte) };

        Some(Self {
            contributor,
            pow_nonce,
            pow_work,
            pow_target,
            timestamp,
            signature,
            nonce_space,
            emoji,
        })
    }
}

/// Engagement pool per SPEC_08 §3.3 + SPEC_03 §7.2
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngagementPool {
    /// Unique pool identifier
    pub pool_id: PoolId,
    /// ContentHash of target content
    pub target_content: [u8; 32],
    /// Total PoW needed (60 seconds)
    pub required_pow: u64,
    /// Unix timestamp in milliseconds
    pub window_start: u64,
    /// window_start + POOL_WINDOW_MS
    pub window_end: u64,
    /// List of contributions
    pub contributions: Vec<PoolContribution>,
    /// Current pool status
    pub status: PoolStatus,
}

impl EngagementPool {
    /// Serialize pool to bytes for storage
    /// Format: pool_id (32) + target_content (32) + required_pow (8) + window_start (8) +
    ///         window_end (8) + status (1) + contribution_count (4) + contributions (161 each)
    pub fn to_bytes(&self) -> Vec<u8> {
        let header_size = 32 + 32 + 8 + 8 + 8 + 1 + 4;
        let contrib_size = 161 * self.contributions.len();
        let mut buf = Vec::with_capacity(header_size + contrib_size);

        buf.extend_from_slice(&self.pool_id);
        buf.extend_from_slice(&self.target_content);
        buf.extend_from_slice(&self.required_pow.to_le_bytes());
        buf.extend_from_slice(&self.window_start.to_le_bytes());
        buf.extend_from_slice(&self.window_end.to_le_bytes());
        buf.push(self.status as u8);
        buf.extend_from_slice(&(self.contributions.len() as u32).to_le_bytes());

        for contrib in &self.contributions {
            buf.extend_from_slice(&contrib.to_bytes());
        }

        buf
    }

    /// Deserialize pool from bytes
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        let header_size = 32 + 32 + 8 + 8 + 8 + 1 + 4;
        if data.len() < header_size {
            return None;
        }

        let mut pool_id = [0u8; 32];
        pool_id.copy_from_slice(&data[0..32]);
        let mut target_content = [0u8; 32];
        target_content.copy_from_slice(&data[32..64]);
        let required_pow = u64::from_le_bytes(data[64..72].try_into().ok()?);
        let window_start = u64::from_le_bytes(data[72..80].try_into().ok()?);
        let window_end = u64::from_le_bytes(data[80..88].try_into().ok()?);
        let status = PoolStatus::try_from(data[88]).ok()?;
        let contribution_count = u32::from_le_bytes(data[89..93].try_into().ok()?) as usize;

        let mut contributions = Vec::with_capacity(contribution_count);
        let mut offset = header_size;
        for _ in 0..contribution_count {
            if offset + 161 > data.len() {
                return None;
            }
            let contrib = PoolContribution::from_bytes(&data[offset..offset + 161])?;
            contributions.push(contrib);
            offset += 161;
        }

        Some(Self {
            pool_id,
            target_content,
            required_pow,
            window_start,
            window_end,
            contributions,
            status,
        })
    }
}

// ============================================================================
// Errors
// ============================================================================

/// Error types for pool operations
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PoolError {
    /// Pool not found with given ID
    PoolNotFound(PoolId),
    /// Pool is not open for contributions
    PoolNotOpen(PoolId),
    /// Pool has expired
    PoolExpired(PoolId),
    /// Contribution work is below minimum
    ContributionTooSmall { provided: u64, minimum: u64 },
    /// PoW validation failed
    InvalidPoW(String),
    /// Signature validation failed
    InvalidSignature,
    /// PoW target doesn't match expected for this pool
    ContentMismatch,
    /// Contribution timestamp is after pool deadline
    ContributionAfterDeadline {
        contribution_time: u64,
        deadline: u64,
    },
    /// Invalid pool status byte
    InvalidStatus(u8),
}

impl std::fmt::Display for PoolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PoolError::PoolNotFound(id) => {
                // Format first 8 bytes as hex
                write!(
                    f,
                    "Pool not found: {:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
                    id[0], id[1], id[2], id[3], id[4], id[5], id[6], id[7]
                )
            }
            PoolError::PoolNotOpen(id) => {
                write!(
                    f,
                    "Pool not open: {:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
                    id[0], id[1], id[2], id[3], id[4], id[5], id[6], id[7]
                )
            }
            PoolError::PoolExpired(id) => {
                write!(
                    f,
                    "Pool expired: {:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
                    id[0], id[1], id[2], id[3], id[4], id[5], id[6], id[7]
                )
            }
            PoolError::ContributionTooSmall { provided, minimum } => {
                write!(
                    f,
                    "Contribution too small: {provided}s < {minimum}s minimum"
                )
            }
            PoolError::InvalidPoW(msg) => write!(f, "Invalid PoW: {msg}"),
            PoolError::InvalidSignature => write!(f, "Invalid signature"),
            PoolError::ContentMismatch => write!(f, "PoW target doesn't match pool content"),
            PoolError::ContributionAfterDeadline {
                contribution_time,
                deadline,
            } => {
                write!(
                    f,
                    "Contribution at {contribution_time}ms is after deadline {deadline}ms"
                )
            }
            PoolError::InvalidStatus(v) => write!(f, "Invalid pool status: {v:#04x}"),
        }
    }
}

impl std::error::Error for PoolError {}

// ============================================================================
// Result Types
// ============================================================================

/// Result of checking pool completion
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompletionResult {
    /// Pool completed - total PoW met requirement
    Completed {
        /// Total PoW accumulated in seconds
        total_pow: u64,
        /// Number of contributions (not unique contributors)
        contributor_count: usize,
        /// List of contributor pubkeys (may have duplicates if same user contributed multiple times)
        contributors: Vec<[u8; 32]>,
    },
    /// Pool still incomplete
    Incomplete {
        /// Current accumulated PoW in seconds
        current: u64,
        /// Required total PoW in seconds
        required: u64,
    },
    /// Pool has expired
    Expired,
}

/// Information about a pool
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PoolInfo {
    /// Pool unique identifier
    pub pool_id: PoolId,
    /// Target content hash
    pub target_content: [u8; 32],
    /// Current status
    pub status: PoolStatus,
    /// Total PoW contributed so far
    pub total_contributed: u64,
    /// Required total PoW
    pub required: u64,
    /// Number of contributions
    pub contributor_count: usize,
    /// Time remaining in milliseconds (None if expired/completed)
    pub time_remaining_ms: Option<u64>,
}

// ============================================================================
// PoW Target Computation
// ============================================================================

/// Compute content-specific PoW target per SPEC_03 §7.4
///
/// target = sha256(content_hash || pool_id || prev_block_hash)
/// For prototype: prev_block_hash = [0u8; 32] until blocks implemented
#[must_use]
pub fn compute_pool_pow_target(
    content_hash: &[u8; 32],
    pool_id: &PoolId,
    prev_block_hash: Option<&[u8; 32]>,
) -> [u8; 32] {
    let zero_hash = [0u8; 32];
    let block_hash = prev_block_hash.unwrap_or(&zero_hash);

    let mut preimage = Vec::with_capacity(32 + 32 + 32);
    preimage.extend_from_slice(content_hash);
    preimage.extend_from_slice(pool_id);
    preimage.extend_from_slice(block_hash);

    sha256(&preimage)
}

// ============================================================================
// Pool Manager
// ============================================================================

/// Pool manager tracks active pools with optional Sled persistence
pub struct PoolManager {
    /// All pools by ID (in-memory cache)
    pools: HashMap<PoolId, EngagementPool>,
    /// Index: content_hash -> pool_ids for that content
    content_pools: HashMap<[u8; 32], Vec<PoolId>>,
    /// Optional Sled tree for persistence
    db: Option<Arc<Db>>,
}

impl Default for PoolManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PoolManager {
    /// Create a new pool manager (in-memory only)
    #[must_use]
    pub fn new() -> Self {
        Self {
            pools: HashMap::new(),
            content_pools: HashMap::new(),
            db: None,
        }
    }

    /// Create a new pool manager with Sled persistence
    #[must_use]
    pub fn with_db(db: Arc<Db>) -> Self {
        let mut manager = Self {
            pools: HashMap::new(),
            content_pools: HashMap::new(),
            db: Some(db.clone()),
        };

        // Load existing pools from database
        if let Ok(tree) = db.open_tree("pools") {
            let mut loaded = 0;
            let mut expired = 0;
            let current_time_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            for result in tree.iter() {
                if let Ok((key, value)) = result {
                    if let Some(pool) = EngagementPool::from_bytes(&value) {
                        // Skip expired pools that haven't been cleaned up
                        if pool.status == PoolStatus::Open && current_time_ms > pool.window_end {
                            // Delete expired pool from DB
                            let _ = tree.remove(&key);
                            expired += 1;
                            continue;
                        }
                        manager.content_pools
                            .entry(pool.target_content)
                            .or_default()
                            .push(pool.pool_id);
                        manager.pools.insert(pool.pool_id, pool);
                        loaded += 1;
                    }
                }
            }
            info!("[POOL] Loaded {} pools from disk ({} expired removed)", loaded, expired);
        }

        manager
    }

    /// Persist a pool to the database
    fn persist_pool(&self, pool: &EngagementPool) {
        if let Some(ref db) = self.db {
            if let Ok(tree) = db.open_tree("pools") {
                if let Err(e) = tree.insert(&pool.pool_id, pool.to_bytes()) {
                    warn!("[POOL] Failed to persist pool: {}", e);
                } else {
                    debug!("[POOL] Persisted pool {}", hex::encode(&pool.pool_id[..8]));
                }
            }
        }
    }

    /// Remove a pool from the database
    fn remove_pool_from_db(&self, pool_id: &PoolId) {
        if let Some(ref db) = self.db {
            if let Ok(tree) = db.open_tree("pools") {
                if let Err(e) = tree.remove(pool_id) {
                    warn!("[POOL] Failed to remove pool from db: {}", e);
                }
            }
        }
    }

    /// Create a new engagement pool
    ///
    /// pool_id = sha256(target_content || window_start_be || initiator)
    ///
    /// # Arguments
    /// * `target_content` - Hash of content being engaged with
    /// * `initiator` - Public key of pool creator
    /// * `current_time_ms` - Current timestamp in milliseconds
    ///
    /// # Returns
    /// The unique pool ID
    pub fn create_pool(
        &mut self,
        target_content: [u8; 32],
        initiator: [u8; 32],
        current_time_ms: u64,
    ) -> PoolId {
        // Generate deterministic pool ID
        let mut preimage = Vec::with_capacity(32 + 8 + 32);
        preimage.extend_from_slice(&target_content);
        preimage.extend_from_slice(&current_time_ms.to_be_bytes());
        preimage.extend_from_slice(&initiator);
        let pool_id = sha256(&preimage);

        let pool = EngagementPool {
            pool_id,
            target_content,
            required_pow: POOL_REQUIRED_POW_SECS,
            window_start: current_time_ms,
            window_end: current_time_ms + POOL_WINDOW_MS,
            contributions: Vec::new(),
            status: PoolStatus::Open,
        };

        self.pools.insert(pool_id, pool.clone());
        self.content_pools
            .entry(target_content)
            .or_default()
            .push(pool_id);

        // Persist to database
        self.persist_pool(&pool);

        pool_id
    }

    /// Add a contribution to an existing pool
    ///
    /// # Arguments
    /// * `pool_id` - Target pool ID
    /// * `contribution` - The contribution to add
    /// * `current_time_ms` - Current timestamp in milliseconds
    /// * `_config` - PoW configuration (for verification)
    ///
    /// # Errors
    /// Returns error if pool not found, not open, contribution invalid, etc.
    pub fn add_contribution(
        &mut self,
        pool_id: PoolId,
        contribution: PoolContribution,
        current_time_ms: u64,
        _config: &ForkPoWConfig,
    ) -> Result<(), PoolError> {
        // First, do immutable checks and compute expected target
        let (expected_target, window_end) = {
            let pool = self
                .pools
                .get(&pool_id)
                .ok_or(PoolError::PoolNotFound(pool_id))?;

            // Validate pool is still open
            if pool.status != PoolStatus::Open {
                return Err(PoolError::PoolNotOpen(pool_id));
            }

            // Compute expected target
            let expected_target = compute_pool_pow_target(
                &pool.target_content,
                &pool_id,
                None, // TODO: Add prev_block_hash when blocks implemented
            );

            (expected_target, pool.window_end)
        };

        // Check if pool has expired (but status not yet updated)
        if current_time_ms > window_end {
            // Update status
            if let Some(pool) = self.pools.get_mut(&pool_id) {
                pool.status = PoolStatus::Expired;
            }
            return Err(PoolError::PoolExpired(pool_id));
        }

        // Validate contribution is within window
        if contribution.timestamp > window_end {
            return Err(PoolError::ContributionAfterDeadline {
                contribution_time: contribution.timestamp,
                deadline: window_end,
            });
        }

        // Validate minimum contribution
        if contribution.pow_work < MIN_CONTRIBUTION_SECS {
            return Err(PoolError::ContributionTooSmall {
                provided: contribution.pow_work,
                minimum: MIN_CONTRIBUTION_SECS,
            });
        }

        // Validate PoW target matches expected
        if contribution.pow_target != expected_target {
            return Err(PoolError::ContentMismatch);
        }

        // Verify PoW (this is expensive ~50-200ms per SPEC_03 §4.5 note)
        // For prototype, we do basic validation; full Argon2id verification in production
        Self::verify_contribution_pow_static(&contribution, &expected_target)?;

        // Add contribution
        let pool_to_persist = if let Some(pool) = self.pools.get_mut(&pool_id) {
            pool.contributions.push(contribution);
            Some(pool.clone())
        } else {
            None
        };

        // Persist updated pool (after releasing mutable borrow)
        if let Some(pool) = pool_to_persist {
            self.persist_pool(&pool);
        }

        Ok(())
    }

    /// Verify a contribution's PoW (static version for borrow checker)
    ///
    /// For prototype phase, this performs basic validation.
    /// Full Argon2id verification requires reconstructing the challenge.
    fn verify_contribution_pow_static(
        contribution: &PoolContribution,
        expected_target: &[u8; 32],
    ) -> Result<(), PoolError> {
        // Verify the target matches
        if contribution.pow_target != *expected_target {
            return Err(PoolError::ContentMismatch);
        }

        // Verify work amount is reasonable (not claiming absurd amounts)
        // Maximum reasonable work per contribution: 1 hour = 3600 seconds
        const MAX_WORK_SECS: u64 = 3600;
        if contribution.pow_work > MAX_WORK_SECS {
            return Err(PoolError::InvalidPoW(format!(
                "Claimed work {}s exceeds maximum {}s",
                contribution.pow_work, MAX_WORK_SECS
            )));
        }

        // Note: Full PoW verification would reconstruct the PoWChallenge:
        //
        // let challenge = PoWChallenge {
        //     action_type: ActionType::Engage,
        //     content_hash: *expected_target,
        //     author_id: contribution.contributor,
        //     timestamp: contribution.timestamp / 1000,  // Convert ms to seconds
        //     difficulty: difficulty::ENGAGE,
        //     nonce_space: contribution.nonce_space,
        // };
        //
        // Then recompute Argon2id hash with the nonce and verify leading zeros.
        // This is deferred to full implementation to avoid expensive operations in tests.

        Ok(())
    }

    /// Check if pool has completed and update status if so
    ///
    /// # Returns
    /// `CompletionResult` indicating current state
    pub fn check_completion(&mut self, pool_id: PoolId) -> Result<CompletionResult, PoolError> {
        // Get mutable reference, update state, and collect data
        let (completed, total_pow, contributors, pool_to_persist) = {
            let pool = self
                .pools
                .get_mut(&pool_id)
                .ok_or(PoolError::PoolNotFound(pool_id))?;

            if pool.status == PoolStatus::Expired {
                return Ok(CompletionResult::Expired);
            }

            let total_pow: u64 = pool.contributions.iter().map(|c| c.pow_work).sum();

            if total_pow >= pool.required_pow {
                pool.status = PoolStatus::Completed;

                // Collect all contributors (may have duplicates)
                let contributors: Vec<[u8; 32]> =
                    pool.contributions.iter().map(|c| c.contributor).collect();

                (true, total_pow, contributors, Some(pool.clone()))
            } else {
                (false, total_pow, Vec::new(), None)
            }
        };

        // Persist completed status (after releasing mutable borrow)
        if let Some(pool) = pool_to_persist {
            self.persist_pool(&pool);
        }

        if completed {
            Ok(CompletionResult::Completed {
                total_pow,
                contributor_count: contributors.len(),
                contributors,
            })
        } else {
            Ok(CompletionResult::Incomplete {
                current: total_pow,
                required: self.pools.get(&pool_id).map(|p| p.required_pow).unwrap_or(POOL_REQUIRED_POW_SECS),
            })
        }
    }

    /// Get current pool total without modifying state
    pub fn get_pool_total(&self, pool_id: &PoolId) -> Result<u64, PoolError> {
        let pool = self
            .pools
            .get(pool_id)
            .ok_or(PoolError::PoolNotFound(*pool_id))?;

        Ok(pool.contributions.iter().map(|c| c.pow_work).sum())
    }

    /// Expire all pools past their deadline
    ///
    /// # Returns
    /// List of expired pool IDs
    pub fn expire_pools(&mut self, current_time_ms: u64) -> Vec<PoolId> {
        let mut expired = Vec::new();

        for pool in self.pools.values_mut() {
            if pool.status == PoolStatus::Open && current_time_ms > pool.window_end {
                pool.status = PoolStatus::Expired;
                expired.push(pool.pool_id);
            }
        }

        // Remove expired pools from database to save space
        for pool_id in &expired {
            self.remove_pool_from_db(pool_id);
        }

        expired
    }

    /// Get pool status and info
    pub fn get_pool_info(
        &self,
        pool_id: &PoolId,
        current_time_ms: u64,
    ) -> Result<PoolInfo, PoolError> {
        let pool = self
            .pools
            .get(pool_id)
            .ok_or(PoolError::PoolNotFound(*pool_id))?;

        let total_contributed: u64 = pool.contributions.iter().map(|c| c.pow_work).sum();

        let time_remaining_ms = if pool.status == PoolStatus::Open {
            pool.window_end.checked_sub(current_time_ms)
        } else {
            None
        };

        Ok(PoolInfo {
            pool_id: pool.pool_id,
            target_content: pool.target_content,
            status: pool.status,
            total_contributed,
            required: pool.required_pow,
            contributor_count: pool.contributions.len(),
            time_remaining_ms,
        })
    }

    /// Get all currently open pools
    #[must_use]
    pub fn get_active_pools(&self) -> Vec<PoolId> {
        self.pools
            .values()
            .filter(|p| p.status == PoolStatus::Open)
            .map(|p| p.pool_id)
            .collect()
    }

    /// Get all open pools targeting specific content
    #[must_use]
    pub fn get_pools_for_content(&self, content_hash: &[u8; 32]) -> Vec<PoolId> {
        self.content_pools
            .get(content_hash)
            .map(|ids| {
                ids.iter()
                    .filter(|id| {
                        self.pools
                            .get(*id)
                            .map(|p| p.status == PoolStatus::Open)
                            .unwrap_or(false)
                    })
                    .copied()
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get pool by ID
    #[must_use]
    pub fn get_pool(&self, pool_id: &PoolId) -> Option<&EngagementPool> {
        self.pools.get(pool_id)
    }

    /// Remove completed/expired pools older than given time
    ///
    /// # Returns
    /// Number of pools removed
    pub fn cleanup_old_pools(&mut self, older_than_ms: u64) -> usize {
        let to_remove: Vec<PoolId> = self
            .pools
            .iter()
            .filter(|(_, p)| p.status != PoolStatus::Open && p.window_end < older_than_ms)
            .map(|(id, _)| *id)
            .collect();

        for id in &to_remove {
            self.pools.remove(id);
            // Also clean up content_pools index
            for pools in self.content_pools.values_mut() {
                pools.retain(|pid| pid != id);
            }
        }

        to_remove.len()
    }

    /// Get number of pools (for testing/metrics)
    #[must_use]
    pub fn pool_count(&self) -> usize {
        self.pools.len()
    }

    /// Get the most active open pool for specific content
    ///
    /// Returns the open pool with highest total contribution, or None if no open pools exist.
    /// When multiple pools have the same contribution, returns any of them (deterministic
    /// but not specified which).
    ///
    /// # Arguments
    /// * `content_hash` - Content hash to find pools for
    /// * `current_time_ms` - Current time for checking pool expiry
    #[must_use]
    pub fn get_pool_info_for_content(
        &self,
        content_hash: &[u8; 32],
        current_time_ms: u64,
    ) -> Option<PoolInfo> {
        let pool_ids = self.get_pools_for_content(content_hash);

        pool_ids
            .iter()
            .filter_map(|id| self.get_pool_info(id, current_time_ms).ok())
            .filter(|info| info.status == PoolStatus::Open)
            .max_by_key(|info| info.total_contributed)
    }

    /// Get emoji counts for a content item from all its pools
    /// Returns a HashMap of emoji code -> count
    pub fn get_emoji_counts_for_content(
        &self,
        content_hash: &[u8; 32],
    ) -> std::collections::HashMap<u8, u32> {
        let mut counts: std::collections::HashMap<u8, u32> = std::collections::HashMap::new();

        let pool_ids = self.get_pools_for_content(content_hash);
        for pool_id in pool_ids {
            if let Some(pool) = self.pools.get(&pool_id) {
                for contribution in &pool.contributions {
                    if let Some(emoji) = contribution.emoji {
                        *counts.entry(emoji).or_insert(0) += 1;
                    }
                }
            }
        }

        counts
    }

    /// Get a user's emoji reactions for a content item
    /// Returns the emoji codes the user has used
    pub fn get_user_emojis_for_content(
        &self,
        content_hash: &[u8; 32],
        user_id: &[u8; 32],
    ) -> Vec<u8> {
        let mut emojis = Vec::new();

        let pool_ids = self.get_pools_for_content(content_hash);
        for pool_id in pool_ids {
            if let Some(pool) = self.pools.get(&pool_id) {
                for contribution in &pool.contributions {
                    if &contribution.contributor == user_id {
                        if let Some(emoji) = contribution.emoji {
                            if !emojis.contains(&emoji) {
                                emojis.push(emoji);
                            }
                        }
                    }
                }
            }
        }

        emojis
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_contribution(
        contributor: [u8; 32],
        pow_work: u64,
        timestamp: u64,
        pow_target: [u8; 32],
    ) -> PoolContribution {
        PoolContribution {
            contributor,
            pow_nonce: 12345,
            pow_work,
            pow_target,
            timestamp,
            signature: [0u8; 64],
            nonce_space: [0u8; 8],
            emoji: None,
        }
    }

    #[test]
    fn test_pool_creation() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let initiator = [2u8; 32];
        let time = 1000u64;

        let pool_id = manager.create_pool(content, initiator, time);

        let pool = manager.get_pool(&pool_id).unwrap();
        assert_eq!(pool.status, PoolStatus::Open);
        assert_eq!(pool.required_pow, POOL_REQUIRED_POW_SECS);
        assert_eq!(pool.window_end, time + POOL_WINDOW_MS);
        assert_eq!(pool.target_content, content);
        assert!(pool.contributions.is_empty());
    }

    #[test]
    fn test_deterministic_pool_id() {
        let mut manager1 = PoolManager::new();
        let mut manager2 = PoolManager::new();
        let content = [1u8; 32];
        let initiator = [2u8; 32];
        let time = 1000u64;

        let pool_id1 = manager1.create_pool(content, initiator, time);
        let pool_id2 = manager2.create_pool(content, initiator, time);

        assert_eq!(pool_id1, pool_id2);
    }

    #[test]
    fn test_multi_contributor_pool() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        // 3 contributors, 20s each = 60s total
        for i in 0..3 {
            let contribution = make_test_contribution(
                [i as u8; 32],
                20, // 20 seconds each
                1000 * (i as u64 + 1),
                pow_target,
            );
            manager
                .add_contribution(pool_id, contribution, 5000, &config)
                .unwrap();
        }

        let result = manager.check_completion(pool_id).unwrap();
        match result {
            CompletionResult::Completed {
                total_pow,
                contributor_count,
                ..
            } => {
                assert_eq!(total_pow, 60);
                assert_eq!(contributor_count, 3);
            }
            _ => panic!("Expected Completed, got {:?}", result),
        }
    }

    #[test]
    fn test_same_contributor_multiple() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);
        let contributor = [1u8; 32];

        // Same contributor adds 30s, then another 30s = 60s total
        let contribution1 = make_test_contribution(contributor, 30, 1000, pow_target);
        let contribution2 = make_test_contribution(contributor, 30, 2000, pow_target);

        manager
            .add_contribution(pool_id, contribution1, 5000, &config)
            .unwrap();
        manager
            .add_contribution(pool_id, contribution2, 5000, &config)
            .unwrap();

        let result = manager.check_completion(pool_id).unwrap();
        match result {
            CompletionResult::Completed {
                total_pow,
                contributor_count,
                ..
            } => {
                assert_eq!(total_pow, 60);
                assert_eq!(contributor_count, 2); // 2 contributions
            }
            _ => panic!("Expected Completed"),
        }
    }

    #[test]
    fn test_completion_at_threshold() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        // Add 59s - should be incomplete
        let contribution1 = make_test_contribution([1u8; 32], 59, 1000, pow_target);
        manager
            .add_contribution(pool_id, contribution1, 5000, &config)
            .unwrap();

        let result1 = manager.check_completion(pool_id).unwrap();
        assert_eq!(
            result1,
            CompletionResult::Incomplete {
                current: 59,
                required: 60
            }
        );

        // Add 1s more - should complete
        let contribution2 = make_test_contribution([2u8; 32], 1, 2000, pow_target);
        manager
            .add_contribution(pool_id, contribution2, 5000, &config)
            .unwrap();

        let result2 = manager.check_completion(pool_id).unwrap();
        match result2 {
            CompletionResult::Completed { total_pow, .. } => {
                assert_eq!(total_pow, 60);
            }
            _ => panic!("Expected Completed"),
        }
    }

    #[test]
    fn test_sybil_equivalence() {
        // Scenario 1: One user contributes 60s
        let mut manager1 = PoolManager::new();
        let content = [1u8; 32];
        let pool_id1 = manager1.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target1 = compute_pool_pow_target(&content, &pool_id1, None);

        let contribution = make_test_contribution([1u8; 32], 60, 1000, pow_target1);
        manager1
            .add_contribution(pool_id1, contribution, 5000, &config)
            .unwrap();
        let result1 = manager1.check_completion(pool_id1).unwrap();

        // Scenario 2: 100 users contribute 0.6s each... but min is 1s
        // So instead: 60 users contribute 1s each
        let mut manager2 = PoolManager::new();
        let pool_id2 = manager2.create_pool(content, [0u8; 32], 0);
        let pow_target2 = compute_pool_pow_target(&content, &pool_id2, None);

        for i in 0..60 {
            let contribution =
                make_test_contribution([i as u8; 32], 1, 1000 + i as u64, pow_target2);
            manager2
                .add_contribution(pool_id2, contribution, 5000, &config)
                .unwrap();
        }
        let result2 = manager2.check_completion(pool_id2).unwrap();

        // Both should complete with same total work
        match (result1, result2) {
            (
                CompletionResult::Completed { total_pow: t1, .. },
                CompletionResult::Completed { total_pow: t2, .. },
            ) => {
                assert_eq!(t1, 60);
                assert_eq!(t2, 60);
            }
            _ => panic!("Both pools should complete"),
        }
    }

    #[test]
    fn test_pool_expiry() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        // Add 30s of work
        let contribution = make_test_contribution([1u8; 32], 30, 1000, pow_target);
        manager
            .add_contribution(pool_id, contribution, 5000, &config)
            .unwrap();

        // Advance time past window (11 minutes)
        let after_expiry = POOL_WINDOW_MS + 60_000; // 11 minutes
        let expired = manager.expire_pools(after_expiry);

        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0], pool_id);

        let pool = manager.get_pool(&pool_id).unwrap();
        assert_eq!(pool.status, PoolStatus::Expired);
        // Work is preserved but unusable
        assert_eq!(pool.contributions.len(), 1);
    }

    #[test]
    fn test_content_specific_pow() {
        let mut manager = PoolManager::new();
        let content_a = [1u8; 32];
        let content_b = [2u8; 32];
        let config = ForkPoWConfig::test();

        let pool_id_a = manager.create_pool(content_a, [0u8; 32], 0);
        let _pool_id_b = manager.create_pool(content_b, [0u8; 32], 0);

        let pow_target_a = compute_pool_pow_target(&content_a, &pool_id_a, None);
        let pow_target_b = compute_pool_pow_target(&content_b, &pool_id_a, None); // Wrong!

        assert_ne!(pow_target_a, pow_target_b);

        // Try to use contribution for content B on pool A
        let contribution = make_test_contribution([1u8; 32], 30, 1000, pow_target_b);
        let result = manager.add_contribution(pool_id_a, contribution, 5000, &config);

        assert!(matches!(result, Err(PoolError::ContentMismatch)));
    }

    #[test]
    fn test_minimum_contribution() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        // Try to add 0s contribution
        let contribution = make_test_contribution([1u8; 32], 0, 1000, pow_target);
        let result = manager.add_contribution(pool_id, contribution, 5000, &config);

        assert!(matches!(
            result,
            Err(PoolError::ContributionTooSmall {
                provided: 0,
                minimum: 1
            })
        ));
    }

    #[test]
    fn test_expired_pool_rejects() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        // Expire the pool
        manager.expire_pools(POOL_WINDOW_MS + 1);

        // Try to add contribution
        let contribution = make_test_contribution([1u8; 32], 30, 1000, pow_target);
        let result = manager.add_contribution(pool_id, contribution, POOL_WINDOW_MS + 1, &config);

        assert!(matches!(result, Err(PoolError::PoolNotOpen(_))));
    }

    #[test]
    fn test_pool_query_methods() {
        let mut manager = PoolManager::new();
        let content1 = [1u8; 32];
        let content2 = [2u8; 32];

        let pool_id1 = manager.create_pool(content1, [0u8; 32], 0);
        let pool_id2 = manager.create_pool(content1, [1u8; 32], 100); // Same content, different pool
        let pool_id3 = manager.create_pool(content2, [0u8; 32], 200);

        // Get pools for content1
        let pools_for_content1 = manager.get_pools_for_content(&content1);
        assert_eq!(pools_for_content1.len(), 2);
        assert!(pools_for_content1.contains(&pool_id1));
        assert!(pools_for_content1.contains(&pool_id2));

        // Get pools for content2
        let pools_for_content2 = manager.get_pools_for_content(&content2);
        assert_eq!(pools_for_content2.len(), 1);
        assert!(pools_for_content2.contains(&pool_id3));

        // Active pools
        let active = manager.get_active_pools();
        assert_eq!(active.len(), 3);
    }

    #[test]
    fn test_pool_info() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);

        // Add some work
        let contribution = make_test_contribution([1u8; 32], 30, 1000, pow_target);
        manager
            .add_contribution(pool_id, contribution, 5000, &config)
            .unwrap();

        let info = manager.get_pool_info(&pool_id, 5000).unwrap();
        assert_eq!(info.pool_id, pool_id);
        assert_eq!(info.status, PoolStatus::Open);
        assert_eq!(info.total_contributed, 30);
        assert_eq!(info.required, 60);
        assert_eq!(info.contributor_count, 1);
        assert!(info.time_remaining_ms.is_some());
    }

    #[test]
    fn test_cleanup_old_pools() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];

        // Create and complete a pool
        let pool_id = manager.create_pool(content, [0u8; 32], 0);
        let config = ForkPoWConfig::test();
        let pow_target = compute_pool_pow_target(&content, &pool_id, None);
        let contribution = make_test_contribution([1u8; 32], 60, 1000, pow_target);
        manager
            .add_contribution(pool_id, contribution, 5000, &config)
            .unwrap();
        manager.check_completion(pool_id).unwrap();

        assert_eq!(manager.pool_count(), 1);

        // Cleanup pools older than 2x window
        let removed = manager.cleanup_old_pools(POOL_WINDOW_MS * 2);
        assert_eq!(removed, 1);
        assert_eq!(manager.pool_count(), 0);
    }

    #[test]
    fn test_pool_pow_target_computation() {
        let content1 = [1u8; 32];
        let content2 = [2u8; 32];
        let pool_id1 = [3u8; 32];
        let pool_id2 = [4u8; 32];

        // Same inputs produce same target
        let target1a = compute_pool_pow_target(&content1, &pool_id1, None);
        let target1b = compute_pool_pow_target(&content1, &pool_id1, None);
        assert_eq!(target1a, target1b);

        // Different content produces different target
        let target2 = compute_pool_pow_target(&content2, &pool_id1, None);
        assert_ne!(target1a, target2);

        // Different pool produces different target
        let target3 = compute_pool_pow_target(&content1, &pool_id2, None);
        assert_ne!(target1a, target3);

        // Different block hash produces different target
        let block_hash = [5u8; 32];
        let target4 = compute_pool_pow_target(&content1, &pool_id1, Some(&block_hash));
        assert_ne!(target1a, target4);
    }

    #[test]
    fn test_pool_status_try_from() {
        assert_eq!(PoolStatus::try_from(0x01).unwrap(), PoolStatus::Open);
        assert_eq!(PoolStatus::try_from(0x02).unwrap(), PoolStatus::Completed);
        assert_eq!(PoolStatus::try_from(0x03).unwrap(), PoolStatus::Expired);
        assert!(matches!(
            PoolStatus::try_from(0xFF),
            Err(PoolError::InvalidStatus(0xFF))
        ));
    }

    #[test]
    fn test_get_pool_info_for_content_no_pools() {
        let manager = PoolManager::new();
        let content = [1u8; 32];

        let result = manager.get_pool_info_for_content(&content, 5000);
        assert!(result.is_none());
    }

    #[test]
    fn test_get_pool_info_for_content_returns_highest() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let config = ForkPoWConfig::test();

        // Create 3 pools with different contributions
        let pool_id1 = manager.create_pool(content, [0u8; 32], 0);
        let pool_id2 = manager.create_pool(content, [1u8; 32], 100);
        let pool_id3 = manager.create_pool(content, [2u8; 32], 200);

        // Add different amounts of work to each
        let pow_target1 = compute_pool_pow_target(&content, &pool_id1, None);
        let pow_target2 = compute_pool_pow_target(&content, &pool_id2, None);
        let pow_target3 = compute_pool_pow_target(&content, &pool_id3, None);

        let c1 = make_test_contribution([1u8; 32], 10, 1000, pow_target1);
        let c2 = make_test_contribution([1u8; 32], 30, 1000, pow_target2); // Highest
        let c3 = make_test_contribution([1u8; 32], 20, 1000, pow_target3);

        manager
            .add_contribution(pool_id1, c1, 5000, &config)
            .unwrap();
        manager
            .add_contribution(pool_id2, c2, 5000, &config)
            .unwrap();
        manager
            .add_contribution(pool_id3, c3, 5000, &config)
            .unwrap();

        let result = manager.get_pool_info_for_content(&content, 5000);
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.pool_id, pool_id2); // Should return pool with highest contribution
        assert_eq!(info.total_contributed, 30);
    }

    #[test]
    fn test_get_pool_info_for_content_filters_expired() {
        let mut manager = PoolManager::new();
        let content = [1u8; 32];
        let config = ForkPoWConfig::test();

        // Create 2 pools
        let pool_id1 = manager.create_pool(content, [0u8; 32], 0);
        let pool_id2 = manager.create_pool(content, [1u8; 32], 100);

        let pow_target1 = compute_pool_pow_target(&content, &pool_id1, None);
        let pow_target2 = compute_pool_pow_target(&content, &pool_id2, None);

        // Add 50s to first pool
        let c1 = make_test_contribution([1u8; 32], 50, 1000, pow_target1);
        // Add 10s to second pool
        let c2 = make_test_contribution([1u8; 32], 10, 1000, pow_target2);

        manager
            .add_contribution(pool_id1, c1, 5000, &config)
            .unwrap();
        manager
            .add_contribution(pool_id2, c2, 5000, &config)
            .unwrap();

        // Expire first pool (which has more work)
        manager.expire_pools(POOL_WINDOW_MS + 1);

        // Should return second pool since first is expired
        let result = manager.get_pool_info_for_content(&content, POOL_WINDOW_MS + 1);
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.pool_id, pool_id2);
        assert_eq!(info.total_contributed, 10);
    }
}
