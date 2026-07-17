//! Block Builder for accumulating actions and forming blocks (SPEC_08 §6)
//!
//! The BlockBuilder accumulates actions and forms blocks when conditions are met:
//! - Content blocks: formed per thread when actions accumulate
//! - Space blocks: formed per space when content blocks accumulate
//! - Root blocks: formed when total PoW reaches ~30 seconds
//!
//! # Usage
//!
//! ```ignore
//! let mut builder = BlockBuilder::new(30); // 30s difficulty target
//!
//! // Add actions for a thread
//! builder.add_action(thread_id, space_id, action);
//!
//! // Check if ready to form root block
//! if builder.should_form_root() {
//!     let (root, spaces, contents) = builder.build_root_block(timestamp);
//! }
//! ```

use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::time::Instant;

use lru::LruCache;

use super::action::Action;
use super::branch_path::BranchPath;
use super::content_block::{ContentBlock, SpaceCreationMetadata};
use super::root_block::RootBlock;
use super::space_block::SpaceBlock;
use crate::crypto::sha256;

/// Thread identifier
pub type ThreadId = [u8; 32];
/// Space identifier
pub type SpaceId = [u8; 32];

/// Magic prefix for the framed, versioned mempool.bin format.
const MEMPOOL_MAGIC: &[u8; 4] = b"SWMP";
/// Current mempool.bin format version. v1 was raw `bincode(HashMap)` with no header
/// — a single struct change (e.g. adding a field to `Action`) made the whole file
/// undecodable and silently dropped every pending action. The framed format length-
/// prefixes each thread so a decode failure skips only that thread, and a version
/// mismatch is surfaced loudly (and the raw file backed up) instead of wiping data.
const MEMPOOL_FORMAT_VERSION: u32 = 2;

/// Read a little-endian u32 at `*off`, advancing it. `None` if out of bounds.
fn read_u32_le(data: &[u8], off: &mut usize) -> Option<u32> {
    let end = off.checked_add(4)?;
    if end > data.len() {
        return None;
    }
    let v = u32::from_le_bytes([data[*off], data[*off + 1], data[*off + 2], data[*off + 3]]);
    *off = end;
    Some(v)
}

/// Timestamp quantization window in seconds.
/// Blocks within the same window will have the same timestamp,
/// ensuring deterministic block hashes across nodes.
pub const TIMESTAMP_QUANTUM_SECS: u64 = 10;

/// Lazy block formation wait time in milliseconds.
/// When threshold is crossed, wait this long for someone else's block
/// before forming our own. This reduces churn by letting nodes that
/// already formed a block propagate it before we duplicate the work.
pub const LAZY_BLOCK_WAIT_MS: u64 = 30_000; // 30 seconds

/// Timeout-flush interval for pending actions that never meet the PoW threshold.
/// A low-PoW onboarding action (a `pow=0` Sponsor/claim on a 0-difficulty offer)
/// can't cross `total_pow >= difficulty_target` on its own, so on a quiet chain it
/// hangs in every mempool forever, never mined. Once pending actions have waited
/// this long below threshold, form a block anyway so they finalize. Bounds
/// onboarding latency without turning quiet chains into a block mill.
pub const PENDING_FLUSH_TIMEOUT_SECS: u64 = 60;

/// Maximum capacity of seen_actions LRU cache.
/// At 32 bytes per hash, 100,000 entries = ~3.2MB.
/// This bounds memory growth from ~46MB/day to a fixed ~3.2MB.
pub const SEEN_ACTIONS_CAPACITY: usize = 100_000;

/// Maximum total actions allowed in the mempool (H-BLOCK-2).
/// At ~1KB per action, 10,000 entries = ~10MB.
/// Prevents memory exhaustion attacks from flooding the mempool.
pub const MAX_MEMPOOL_ACTIONS: usize = 10_000;

/// Maximum actions per space in the mempool (H-BLOCK-2).
/// Prevents a single space from monopolizing the mempool.
/// Set to 20% of total capacity.
pub const MAX_ACTIONS_PER_SPACE: usize = 2_000;

/// Pending thread with accumulated actions
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct PendingThread {
    /// Thread root ID
    thread_id: ThreadId,
    /// Space this thread belongs to
    space_id: SpaceId,
    /// Accumulated actions
    actions: Vec<Action>,
    /// Branch path for this thread
    branch_path: BranchPath,
    /// Previous content block hash (for chaining)
    prev_content_hash: Option<[u8; 32]>,
    /// Optional space metadata (for CreateSpace actions)
    space_metadata: Option<SpaceCreationMetadata>,
}

impl PendingThread {
    fn new(thread_id: ThreadId, space_id: SpaceId, branch_path: BranchPath) -> Self {
        Self {
            thread_id,
            space_id,
            actions: Vec::new(),
            branch_path,
            prev_content_hash: None,
            space_metadata: None,
        }
    }

    fn total_pow(&self) -> u64 {
        self.actions.iter().map(|a| a.pow_work).sum()
    }
}

/// Block builder for accumulating actions and forming blocks
pub struct BlockBuilder {
    /// Pending actions per thread
    threads: HashMap<ThreadId, PendingThread>,
    /// Difficulty target (seconds of PoW for root block)
    difficulty_target: u64,
    /// Current chain height
    current_height: u64,
    /// Previous root block hash
    prev_root_hash: [u8; 32],
    /// Previous root block's cumulative PoW (for fork resolution)
    prev_cumulative_pow: u64,
    /// Previous space block hashes per space
    prev_space_hashes: HashMap<SpaceId, [u8; 32]>,
    /// Seen action hashes for deduplication (mempool gossip).
    /// Uses LRU cache to bound memory growth (H-BLOCK-1).
    seen_actions: LruCache<[u8; 32], ()>,
    /// When we started waiting for someone else's block (lazy formation)
    waiting_since: Option<Instant>,
    /// When pending actions first sat below the PoW formation threshold. Drives
    /// the timeout-flush: low-PoW onboarding actions (a `pow=0` Sponsor/claim on
    /// a 0-difficulty offer) otherwise never cross `total_pow >= difficulty_target`
    /// and hang in every mempool forever on a quiet chain. Separate from
    /// `waiting_since` because `should_form_root` clears that one below threshold.
    flush_since: Option<Instant>,
    /// Action hash -> (thread_id, index) for Replace-In-Mempool lookups
    action_locations: HashMap<[u8; 32], (ThreadId, usize)>,
    /// Per-space action counts for enforcing MAX_ACTIONS_PER_SPACE (H-BLOCK-2)
    space_action_counts: HashMap<SpaceId, usize>,
    /// Total action count for enforcing MAX_MEMPOOL_ACTIONS (H-BLOCK-2)
    total_action_count: usize,
    /// Optional on-disk mempool file. When set, the pending thread map is
    /// written (atomic + flushed) after every mutation so pending actions
    /// survive restart and keep propagating until mined. `None` disables
    /// persistence (unit tests, minimal modes).
    persist_path: Option<std::path::PathBuf>,
}

impl BlockBuilder {
    /// Create a new block builder
    ///
    /// # Arguments
    /// * `difficulty_target` - Target PoW in seconds for root block formation
    pub fn new(difficulty_target: u64) -> Self {
        Self {
            threads: HashMap::new(),
            difficulty_target,
            current_height: 0,
            prev_root_hash: [0u8; 32],
            prev_cumulative_pow: 0,
            prev_space_hashes: HashMap::new(),
            seen_actions: LruCache::new(NonZeroUsize::new(SEEN_ACTIONS_CAPACITY).unwrap()),
            waiting_since: None,
            flush_since: None,
            action_locations: HashMap::new(),
            space_action_counts: HashMap::new(),
            total_action_count: 0,
            persist_path: None,
        }
    }

    /// Create builder starting from an existing chain state
    pub fn from_chain_state(
        difficulty_target: u64,
        height: u64,
        prev_root_hash: [u8; 32],
        prev_cumulative_pow: u64,
    ) -> Self {
        Self {
            threads: HashMap::new(),
            difficulty_target,
            current_height: height,
            prev_root_hash,
            prev_cumulative_pow,
            prev_space_hashes: HashMap::new(),
            seen_actions: LruCache::new(NonZeroUsize::new(SEEN_ACTIONS_CAPACITY).unwrap()),
            waiting_since: None,
            flush_since: None,
            action_locations: HashMap::new(),
            space_action_counts: HashMap::new(),
            total_action_count: 0,
            persist_path: None,
        }
    }

    /// Update chain tip (for syncing to a new best chain)
    pub fn sync_to_chain_tip(&mut self, height: u64, tip_hash: [u8; 32], cumulative_pow: u64) {
        self.current_height = height;
        self.prev_root_hash = tip_hash;
        self.prev_cumulative_pow = cumulative_pow;
    }

    /// Enable on-disk mempool persistence at `path`, loading any existing file.
    ///
    /// After this call every mutation writes the pending set to disk, and the
    /// pending actions from a prior run are restored (with all derived indexes
    /// rebuilt). Call once at startup.
    pub fn set_persistence(&mut self, path: std::path::PathBuf) {
        self.persist_path = Some(path);
        self.load_persisted();
    }

    /// Load and restore the pending thread map from disk, rebuilding the
    /// derived indexes (seen_actions, locations, per-space/total counts).
    fn load_persisted(&mut self) {
        let Some(ref path) = self.persist_path else {
            return;
        };
        let data = match std::fs::read(path) {
            Ok(d) => d,
            Err(_) => return, // no file yet
        };
        if data.is_empty() {
            return;
        }

        let mut threads: HashMap<ThreadId, PendingThread> = HashMap::new();
        let mut skipped = 0usize;

        // `decoded` = we could read this file's format at all. When false we do NOT
        // touch `self.threads` and we back the raw file up (below) so the next
        // persist() can't silently overwrite recoverable data.
        let decoded = if data.len() >= 4 && &data[..4] == MEMPOOL_MAGIC {
            // Framed v2+: MAGIC | version(4) | count(4) | [len(4) | bincode(PendingThread)]*
            let mut off = 4;
            let version = read_u32_le(&data, &mut off);
            let count = read_u32_le(&data, &mut off);
            match (version, count) {
                (Some(v), Some(count)) if v == MEMPOOL_FORMAT_VERSION => {
                    for i in 0..count {
                        let Some(len) = read_u32_le(&data, &mut off) else {
                            log::warn!("[MEMPOOL] truncated header at thread {}/{}", i, count);
                            break;
                        };
                        let end = match off.checked_add(len as usize) {
                            Some(e) if e <= data.len() => e,
                            _ => {
                                log::warn!("[MEMPOOL] truncated body at thread {}/{}", i, count);
                                break;
                            }
                        };
                        match bincode::deserialize::<PendingThread>(&data[off..end]) {
                            Ok(t) => {
                                threads.insert(t.thread_id, t);
                            }
                            Err(e) => {
                                skipped += 1;
                                log::warn!("[MEMPOOL] skipping undecodable pending thread: {}", e);
                            }
                        }
                        off = end;
                    }
                    true // keep whatever decoded, even if some threads were skipped
                }
                (Some(v), _) => {
                    log::warn!(
                        "[MEMPOOL] mempool.bin format v{} != v{}: cannot decode, backing up",
                        v,
                        MEMPOOL_FORMAT_VERSION
                    );
                    false
                }
                _ => {
                    log::warn!("[MEMPOOL] mempool.bin header truncated, backing up");
                    false
                }
            }
        } else {
            // Legacy v1: raw bincode of the whole map. Migrate it if it still decodes.
            match bincode::deserialize::<HashMap<ThreadId, PendingThread>>(&data) {
                Ok(t) => {
                    threads = t;
                    true
                }
                Err(e) => {
                    log::warn!("[MEMPOOL] legacy mempool.bin no longer decodable: {}", e);
                    false
                }
            }
        };

        if !decoded {
            // Preserve the raw bytes so a struct/format change doesn't permanently
            // destroy unmined posts — the next persist() would otherwise overwrite them.
            let bak = path.with_extension("bak");
            match std::fs::write(&bak, &data) {
                Ok(_) => log::warn!(
                    "[MEMPOOL] backed up unreadable mempool ({} bytes) to {:?}",
                    data.len(),
                    bak
                ),
                Err(e) => log::warn!("[MEMPOOL] failed to back up unreadable mempool: {}", e),
            }
            return;
        }

        self.threads = threads;
        self.action_locations.clear();
        self.space_action_counts.clear();
        self.total_action_count = 0;
        for thread in self.threads.values() {
            for (idx, action) in thread.actions.iter().enumerate() {
                let hash = Self::action_hash(action);
                self.seen_actions.put(hash, ());
                self.action_locations.insert(hash, (thread.thread_id, idx));
                *self.space_action_counts.entry(thread.space_id).or_insert(0) += 1;
                self.total_action_count += 1;
            }
        }
        log::info!(
            "[MEMPOOL] Restored {} pending actions across {} threads from disk ({} thread(s) skipped)",
            self.total_action_count,
            self.threads.len(),
            skipped
        );
    }

    /// Persist the pending thread map to disk (atomic + flushed). Best-effort:
    /// a failure is logged, never fatal to the action that triggered it.
    fn persist(&self) {
        let Some(ref path) = self.persist_path else {
            return;
        };
        // Framed format: MAGIC | version | count | [len(4) | bincode(PendingThread)]*.
        // Serialize each thread independently so one bad thread can't corrupt the file,
        // and so a later struct change fails per-thread on load instead of wholesale.
        let mut entries: Vec<Vec<u8>> = Vec::with_capacity(self.threads.len());
        for thread in self.threads.values() {
            match bincode::serialize(thread) {
                Ok(b) => entries.push(b),
                Err(e) => log::warn!("[MEMPOOL] Failed to serialize pending thread: {}", e),
            }
        }
        let mut data = Vec::with_capacity(12 + entries.iter().map(|e| e.len() + 4).sum::<usize>());
        data.extend_from_slice(MEMPOOL_MAGIC);
        data.extend_from_slice(&MEMPOOL_FORMAT_VERSION.to_le_bytes());
        data.extend_from_slice(&(entries.len() as u32).to_le_bytes());
        for b in &entries {
            data.extend_from_slice(&(b.len() as u32).to_le_bytes());
            data.extend_from_slice(b);
        }
        let tmp = path.with_extension("tmp");
        if let Err(e) = std::fs::write(&tmp, &data) {
            log::warn!("[MEMPOOL] Failed to write mempool tmp: {}", e);
            return;
        }
        if let Err(e) = std::fs::rename(&tmp, path) {
            log::warn!("[MEMPOOL] Failed to rename mempool file: {}", e);
        }
    }

    /// Compute a unique hash for an action (for deduplication)
    ///
    /// Hash is computed from: actor || timestamp || action_type || content_hash
    #[must_use]
    pub fn action_hash(action: &Action) -> [u8; 32] {
        let mut data = Vec::with_capacity(73); // 32 + 8 + 1 + 32
        data.extend_from_slice(&action.actor);
        data.extend_from_slice(&action.timestamp.to_be_bytes());
        data.push(action.action_type as u8);
        if let Some(hash) = &action.content_hash {
            data.extend_from_slice(hash);
        } else {
            data.extend_from_slice(&[0u8; 32]);
        }
        sha256(&data)
    }

    /// Evict the action with lowest PoW work from a specific space (H-BLOCK-2)
    ///
    /// Returns the evicted action's PoW work value, or None if the space is empty.
    /// This is called when a space exceeds MAX_ACTIONS_PER_SPACE.
    fn evict_lowest_pow_from_space(&mut self, space_id: &SpaceId) -> Option<u64> {
        // Find the thread and action index with lowest PoW in this space
        let mut lowest: Option<(ThreadId, usize, u64, [u8; 32])> = None;

        for thread in self.threads.values() {
            if thread.space_id != *space_id {
                continue;
            }
            for (idx, action) in thread.actions.iter().enumerate() {
                // Skip already-invalidated actions (pow_work == 0 from RIM)
                if action.pow_work == 0 {
                    continue;
                }
                let dominated = lowest
                    .as_ref()
                    .map(|(_, _, pow, _)| action.pow_work < *pow)
                    .unwrap_or(true);
                if dominated {
                    let hash = Self::action_hash(action);
                    lowest = Some((thread.thread_id, idx, action.pow_work, hash));
                }
            }
        }

        let (thread_id, action_idx, evicted_pow, action_hash) = lowest?;

        // Mark the action as evicted (set pow_work to 0, will be filtered in block building)
        if let Some(thread) = self.threads.get_mut(&thread_id) {
            if action_idx < thread.actions.len() {
                thread.actions[action_idx].pow_work = 0;
                thread.actions[action_idx].content_hash = None;
            }
        }

        // Remove from tracking structures
        self.seen_actions.pop(&action_hash);
        self.action_locations.remove(&action_hash);

        // Decrement counts
        if let Some(count) = self.space_action_counts.get_mut(space_id) {
            *count = count.saturating_sub(1);
        }
        self.total_action_count = self.total_action_count.saturating_sub(1);

        log::info!(
            "[MEMPOOL] Evicted lowest-PoW action (pow={}) from space {} (space at capacity)",
            evicted_pow,
            hex::encode(&space_id[..8])
        );

        Some(evicted_pow)
    }

    /// Evict the action with lowest PoW work from the entire mempool (H-BLOCK-2)
    ///
    /// Returns the evicted action's PoW work value, or None if the mempool is empty.
    /// This is called when total mempool exceeds MAX_MEMPOOL_ACTIONS.
    fn evict_lowest_pow_global(&mut self) -> Option<u64> {
        // Find the action with lowest PoW across all threads
        let mut lowest: Option<(ThreadId, SpaceId, usize, u64, [u8; 32])> = None;

        for thread in self.threads.values() {
            for (idx, action) in thread.actions.iter().enumerate() {
                // Skip already-invalidated actions (pow_work == 0 from RIM)
                if action.pow_work == 0 {
                    continue;
                }
                let dominated = lowest
                    .as_ref()
                    .map(|(_, _, _, pow, _)| action.pow_work < *pow)
                    .unwrap_or(true);
                if dominated {
                    let hash = Self::action_hash(action);
                    lowest = Some((
                        thread.thread_id,
                        thread.space_id,
                        idx,
                        action.pow_work,
                        hash,
                    ));
                }
            }
        }

        let (thread_id, space_id, action_idx, evicted_pow, action_hash) = lowest?;

        // Mark the action as evicted (set pow_work to 0, will be filtered in block building)
        if let Some(thread) = self.threads.get_mut(&thread_id) {
            if action_idx < thread.actions.len() {
                thread.actions[action_idx].pow_work = 0;
                thread.actions[action_idx].content_hash = None;
            }
        }

        // Remove from tracking structures
        self.seen_actions.pop(&action_hash);
        self.action_locations.remove(&action_hash);

        // Decrement counts
        if let Some(count) = self.space_action_counts.get_mut(&space_id) {
            *count = count.saturating_sub(1);
        }
        self.total_action_count = self.total_action_count.saturating_sub(1);

        log::info!(
            "[MEMPOOL] Evicted lowest-PoW action (pow={}) globally (mempool at capacity)",
            evicted_pow
        );

        Some(evicted_pow)
    }

    /// Add an action for a thread
    ///
    /// Returns true if the action was added, false if it was a duplicate or
    /// replacement failed validation.
    ///
    /// # Replace-In-Mempool (RIM)
    ///
    /// If `action.replaces_pending` is set, this action will replace the
    /// specified pending action if:
    /// - The target action exists in the mempool
    /// - Both actions are from the same author
    ///
    /// This enables coalescing create+edit into a single on-chain action,
    /// reducing chain bloat when users quickly edit their content.
    ///
    /// # Arguments
    /// * `thread_id` - Thread identifier (content hash of thread root)
    /// * `space_id` - Space this thread belongs to
    /// * `action` - The action to add
    /// * `branch_path` - Branch path for tree placement
    pub fn add_action(
        &mut self,
        thread_id: ThreadId,
        space_id: SpaceId,
        action: Action,
        branch_path: BranchPath,
    ) -> bool {
        // Check for duplicate using action hash
        let hash = Self::action_hash(&action);
        if self.seen_actions.contains(&hash) {
            return false; // Already have this action
        }

        // Handle Replace-In-Mempool (RIM)
        if let Some(replaces_hash) = action.replaces_pending {
            return self.replace_action(thread_id, space_id, action, branch_path, replaces_hash);
        }

        let incoming_pow = action.pow_work;

        // H-BLOCK-2: Enforce per-space limit
        let space_count = self
            .space_action_counts
            .get(&space_id)
            .copied()
            .unwrap_or(0);
        if space_count >= MAX_ACTIONS_PER_SPACE {
            // Evict lowest PoW action from this space
            if let Some(evicted_pow) = self.evict_lowest_pow_from_space(&space_id) {
                // Only accept if incoming action has higher PoW than evicted
                if incoming_pow <= evicted_pow {
                    log::debug!(
                        "[MEMPOOL] Rejected action (pow={}) - lower than evicted (pow={}) for space {}",
                        incoming_pow,
                        evicted_pow,
                        hex::encode(&space_id[..8])
                    );
                    return false;
                }
            }
        }

        // H-BLOCK-2: Enforce global mempool limit
        if self.total_action_count >= MAX_MEMPOOL_ACTIONS {
            // Evict lowest PoW action globally
            if let Some(evicted_pow) = self.evict_lowest_pow_global() {
                // Only accept if incoming action has higher PoW than evicted
                if incoming_pow <= evicted_pow {
                    log::debug!(
                        "[MEMPOOL] Rejected action (pow={}) - lower than evicted (pow={})",
                        incoming_pow,
                        evicted_pow
                    );
                    return false;
                }
            }
        }

        // Normal add path
        self.seen_actions.put(hash, ());

        let thread = self
            .threads
            .entry(thread_id)
            .or_insert_with(|| PendingThread::new(thread_id, space_id, branch_path));

        let action_index = thread.actions.len();
        thread.actions.push(action);

        // Track location for potential future replacement
        self.action_locations
            .insert(hash, (thread_id, action_index));

        // Update counts (H-BLOCK-2)
        *self.space_action_counts.entry(space_id).or_insert(0) += 1;
        self.total_action_count += 1;

        self.persist();
        true
    }

    /// Replace a pending action with a new one (RIM - Replace-In-Mempool)
    ///
    /// # Arguments
    /// * `thread_id` - Thread identifier for the new action
    /// * `space_id` - Space this thread belongs to
    /// * `new_action` - The replacement action
    /// * `branch_path` - Branch path for tree placement
    /// * `replaces_hash` - Hash of the action to replace
    fn replace_action(
        &mut self,
        thread_id: ThreadId,
        space_id: SpaceId,
        new_action: Action,
        branch_path: BranchPath,
        replaces_hash: [u8; 32],
    ) -> bool {
        // Find the action to replace
        let (old_thread_id, old_index) = match self.action_locations.get(&replaces_hash) {
            Some(&loc) => loc,
            None => {
                // Target action not found in mempool - reject replacement
                log::warn!(
                    "[RIM] Replace target not found: {}",
                    hex::encode(&replaces_hash[..8])
                );
                return false;
            }
        };

        // Get the old action to verify authorship
        let old_action = match self.threads.get(&old_thread_id) {
            Some(thread) => match thread.actions.get(old_index) {
                Some(action) => action.clone(),
                None => {
                    log::warn!("[RIM] Old action index out of bounds");
                    return false;
                }
            },
            None => {
                log::warn!("[RIM] Old thread not found");
                return false;
            }
        };

        // Verify same author
        if old_action.actor != new_action.actor {
            log::warn!(
                "[RIM] Author mismatch: old={} new={}",
                hex::encode(&old_action.actor[..8]),
                hex::encode(&new_action.actor[..8])
            );
            return false;
        }

        // Remove old action from tracking
        self.seen_actions.pop(&replaces_hash);
        self.action_locations.remove(&replaces_hash);

        // Mark old action slot as replaced (set to dummy action that will be filtered)
        // Note: We don't actually remove from the vec to preserve indices, we mark as replaced
        if let Some(thread) = self.threads.get_mut(&old_thread_id) {
            if old_index < thread.actions.len() {
                // Create a marker action with zero pow_work (will be filtered in block building)
                thread.actions[old_index].pow_work = 0;
                thread.actions[old_index].content_hash = None;
            }
        }

        // Add the new action
        let new_hash = Self::action_hash(&new_action);
        self.seen_actions.put(new_hash, ());

        let thread = self
            .threads
            .entry(thread_id)
            .or_insert_with(|| PendingThread::new(thread_id, space_id, branch_path));

        let new_index = thread.actions.len();
        thread.actions.push(new_action);
        self.action_locations
            .insert(new_hash, (thread_id, new_index));

        log::info!(
            "[RIM] Replaced action {} with {} (same author)",
            hex::encode(&replaces_hash[..8]),
            hex::encode(&new_hash[..8])
        );
        true
    }

    /// Add a CreateSpace action with metadata
    ///
    /// This is used for space creation to include the space name and description
    /// in the block so other nodes can register the space when syncing.
    ///
    /// Returns true if the action was added, false if it was a duplicate.
    ///
    /// # Arguments
    /// * `thread_id` - Thread identifier (space_id for CreateSpace)
    /// * `space_id` - Space identifier
    /// * `action` - The CreateSpace action
    /// * `branch_path` - Branch path for tree placement
    /// * `metadata` - Space name and description
    pub fn add_create_space_action(
        &mut self,
        thread_id: ThreadId,
        space_id: SpaceId,
        action: Action,
        branch_path: BranchPath,
        metadata: SpaceCreationMetadata,
    ) -> bool {
        // Check for duplicate using action hash
        let hash = Self::action_hash(&action);
        if self.seen_actions.contains(&hash) {
            return false; // Already have this action
        }

        let incoming_pow = action.pow_work;

        // H-BLOCK-2: Enforce per-space limit
        let space_count = self
            .space_action_counts
            .get(&space_id)
            .copied()
            .unwrap_or(0);
        if space_count >= MAX_ACTIONS_PER_SPACE {
            if let Some(evicted_pow) = self.evict_lowest_pow_from_space(&space_id) {
                if incoming_pow <= evicted_pow {
                    return false;
                }
            }
        }

        // H-BLOCK-2: Enforce global mempool limit
        if self.total_action_count >= MAX_MEMPOOL_ACTIONS {
            if let Some(evicted_pow) = self.evict_lowest_pow_global() {
                if incoming_pow <= evicted_pow {
                    return false;
                }
            }
        }

        self.seen_actions.put(hash, ());

        let thread = self
            .threads
            .entry(thread_id)
            .or_insert_with(|| PendingThread::new(thread_id, space_id, branch_path));

        thread.actions.push(action);
        thread.space_metadata = Some(metadata);

        // Update counts (H-BLOCK-2)
        *self.space_action_counts.entry(space_id).or_insert(0) += 1;
        self.total_action_count += 1;

        self.persist();
        true
    }

    /// Get total accumulated PoW across all pending actions
    #[must_use]
    pub fn total_pow(&self) -> u64 {
        self.threads.values().map(|t| t.total_pow()).sum()
    }

    /// Check if threshold is met (without lazy waiting logic)
    #[must_use]
    pub fn is_threshold_met(&self) -> bool {
        self.total_pow() >= self.difficulty_target
    }

    /// Check if we should form a root block (with lazy waiting)
    ///
    /// Lazy block formation: when threshold is met, wait for someone else's
    /// block first. Only form if no block arrives within LAZY_BLOCK_WAIT_MS.
    /// This reduces churn by avoiding duplicate block formation.
    pub fn should_form_root(&mut self) -> bool {
        if !self.is_threshold_met() {
            // Threshold not met - reset waiting state
            self.waiting_since = None;
            return false;
        }

        // Threshold is met - check lazy waiting
        match self.waiting_since {
            None => {
                // Start waiting for someone else's block
                self.waiting_since = Some(Instant::now());
                log::info!(
                    "[BLOCK-BUILDER] Threshold met (pow={}), waiting {}s for network block",
                    self.total_pow(),
                    LAZY_BLOCK_WAIT_MS / 1000
                );
                false
            }
            Some(started) => {
                let elapsed = started.elapsed().as_millis() as u64;
                if elapsed >= LAZY_BLOCK_WAIT_MS {
                    log::info!(
                        "[BLOCK-BUILDER] Wait expired after {}s, forming block ourselves",
                        elapsed / 1000
                    );
                    true
                } else {
                    false
                }
            }
        }
    }

    /// Reset waiting state (call when we receive a block from the network)
    pub fn reset_waiting(&mut self) {
        self.waiting_since = None;
        self.flush_since = None;
    }

    /// Autonomous formation decision for the block-formation task.
    ///
    /// Forms when the PoW threshold is met (immediate — the task loop does not
    /// lazy-wait), OR when there are pending actions that have sat below the
    /// threshold for `flush_timeout_secs`. The flush arm is what lets a low-PoW
    /// onboarding action (a `pow=0` Sponsor/claim) finalize on an otherwise-quiet
    /// chain instead of stranding in every mempool. The caller must still pass
    /// leader eligibility before forming; this only gates on mempool readiness.
    pub fn should_form_or_flush(&mut self, flush_timeout_secs: u64) -> bool {
        if self.pending_action_count() == 0 {
            self.flush_since = None;
            return false;
        }
        if self.is_threshold_met() {
            // Threshold path forms right away; drop any flush timer.
            self.flush_since = None;
            return true;
        }
        // Below threshold with pending work: start/continue the flush timer.
        let started = *self.flush_since.get_or_insert_with(Instant::now);
        started.elapsed().as_secs() >= flush_timeout_secs
    }

    /// Test-only: backdate the lazy-wait timer so `should_form_root` fires
    /// immediately instead of sleeping through LAZY_BLOCK_WAIT_MS in tests.
    #[cfg(test)]
    pub fn backdate_lazy_wait_for_test(&mut self) {
        self.waiting_since = Instant::now()
            .checked_sub(std::time::Duration::from_millis(LAZY_BLOCK_WAIT_MS + 1_000));
    }

    /// Get the expected next block height
    #[must_use]
    pub fn next_height(&self) -> u64 {
        self.current_height + 1
    }

    /// Get pending action count
    #[must_use]
    pub fn pending_action_count(&self) -> usize {
        self.threads.values().map(|t| t.actions.len()).sum()
    }

    /// Snapshot of all pending mempool actions as `(thread_id, space_id, action)`,
    /// for periodic re-announcement until they are finalized. A self-originated
    /// action is broadcast once at submit time; if that broadcast misses (a peer
    /// mid-reconnect, a flaky/NAT link, a seed-node dropping the connection) the
    /// action can strand with no retry. Re-announcing the live mempool closes that
    /// gap — the generalization of the claim-only re-broadcast task.
    #[must_use]
    pub fn pending_action_announcements(&self) -> Vec<(ThreadId, SpaceId, Action)> {
        let mut out = Vec::new();
        for thread in self.threads.values() {
            for action in &thread.actions {
                out.push((thread.thread_id, thread.space_id, action.clone()));
            }
        }
        out
    }

    /// Get pending thread count
    #[must_use]
    pub fn pending_thread_count(&self) -> usize {
        self.threads.len()
    }

    /// Get the difficulty threshold (PoW required for block formation)
    #[must_use]
    pub fn difficulty_threshold(&self) -> u64 {
        self.difficulty_target
    }

    /// Get seconds spent waiting for block formation (0 if not waiting)
    #[must_use]
    pub fn waiting_seconds(&self) -> u64 {
        self.waiting_since
            .map(|started| started.elapsed().as_secs())
            .unwrap_or(0)
    }

    /// Build all pending blocks
    ///
    /// Creates content blocks, space blocks, and a root block from
    /// all accumulated actions.
    ///
    /// # Arguments
    /// * `timestamp` - Block creation timestamp (UNIX seconds)
    /// * `block_creator` - Identity of the node creating this block
    ///
    /// # Returns
    /// (RootBlock, Vec<SpaceBlock>, Vec<ContentBlock>)
    pub fn build_root_block(
        &mut self,
        timestamp: u64,
        block_creator: [u8; 32],
        sponsorship_store: Option<&crate::sponsorship::SponsorshipStore>,
    ) -> (RootBlock, Vec<SpaceBlock>, Vec<ContentBlock>) {
        // DETERMINISTIC: Quantize timestamp to 10-second windows
        // This ensures nodes forming blocks at nearly the same time
        // will produce identical block hashes
        let quantized_timestamp = (timestamp / TIMESTAMP_QUANTUM_SECS) * TIMESTAMP_QUANTUM_SECS;

        // Group threads by space, collecting into Vec for deterministic ordering
        let mut space_threads: HashMap<SpaceId, Vec<PendingThread>> = HashMap::new();
        for thread in self.threads.drain().map(|(_, t)| t) {
            space_threads
                .entry(thread.space_id)
                .or_default()
                .push(thread);
        }

        // DEPENDENCY CHECK: Ensure CreateSpace actions have required Sponsor actions
        // Collect all Sponsor actions in this batch
        let mut identities_sponsored_in_batch: std::collections::HashSet<[u8; 32]> =
            std::collections::HashSet::new();
        for threads in space_threads.values() {
            for thread in threads {
                for action in &thread.actions {
                    if action.action_type == crate::blocks::ActionType::Sponsor {
                        if let Some(sponsee_bytes) = action.content_hash {
                            identities_sponsored_in_batch.insert(sponsee_bytes);
                        }
                    }
                }
            }
        }

        // Filter out actions that would fail the consensus sponsorship gate, so
        // we never form a block a peer would reject. Every action producing
        // durable public on-chain state (Post/Reply/Engage/Edit/CreateSpace/
        // RenameSpace — see ActionType::requires_sponsored_author) is valid ONLY
        // if its author is:
        // 1. Already sponsored on-chain (in sponsorship_store), OR
        // 2. Being sponsored in this block (Sponsor action in this batch), OR
        // 3. A hardcoded genesis identity (the sponsor ROOT usually has no
        //    store record of its own — without this fallback the builder would
        //    silently drop genesis's own actions from every block it formed;
        //    same bootstrap deadlock as the validation in tasks.rs and the
        //    sponsorship apply in the router).
        let mut removed_actions = Vec::new();
        for threads in space_threads.values_mut() {
            for thread in threads {
                let original_count = thread.actions.len();
                thread.actions.retain(|action| {
                    if action.action_type.requires_sponsored_author() {
                        let creator_bytes = action.actor;

                        // Check if sponsored in this batch
                        let sponsored_in_batch =
                            identities_sponsored_in_batch.contains(&creator_bytes);

                        let creator_pk =
                            crate::types::identity::PublicKey::from_bytes(creator_bytes);

                        // Check if sponsored on-chain. With no store configured
                        // we cannot verify and must NOT gate — keep the action,
                        // matching the block-validation gates (tasks.rs / router),
                        // which treat a missing store as "valid". A real node
                        // always has a store; a store-less builder is a test/
                        // degenerate case that must not silently drop all content.
                        let sponsored_on_chain = if let Some(store) = sponsorship_store {
                            store.exists(&creator_pk).unwrap_or(false)
                        } else {
                            true
                        };

                        // Hardcoded genesis identities are always eligible.
                        let is_genesis =
                            crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(
                                &creator_pk,
                            );

                        if !sponsored_on_chain && !sponsored_in_batch && !is_genesis {
                            log::warn!(
                                "[BLOCK_BUILDER] Excluding {:?} by {} from block: \
                                author not sponsored on-chain and no Sponsor action in batch",
                                action.action_type,
                                hex::encode(&creator_bytes[..8])
                            );
                            removed_actions.push(action.clone());
                            return false; // Exclude from block
                        }
                    }
                    true // Keep action
                });

                if thread.actions.len() < original_count {
                    log::info!(
                        "[BLOCK_BUILDER] Removed {} invalid actions from thread {}",
                        original_count - thread.actions.len(),
                        hex::encode(&thread.thread_id[..8])
                    );
                }
            }
        }

        // Re-add removed actions back to mempool for next block
        for action in removed_actions {
            // Re-hash and track the action
            let hash = Self::action_hash(&action);
            self.seen_actions.put(hash, ());
            // Note: We can't easily re-add to threads here without knowing thread_id/space_id
            // These actions will need to be re-submitted via RPC
        }

        // DETERMINISTIC: Sort spaces by ID for consistent block formation
        // This ensures same mempool produces same block hash across all nodes
        let mut sorted_spaces: Vec<_> = space_threads.into_iter().collect();
        sorted_spaces.sort_by(|a, b| a.0.cmp(&b.0));

        // Build content blocks per thread
        let mut all_content_blocks = Vec::new();
        let mut content_blocks_by_space: Vec<(SpaceId, Vec<ContentBlock>)> = Vec::new();

        // Block-level dedup: an action must never appear in more than one content
        // block of the same root block. The same action can reach the mempool under
        // two thread_ids (gossip races, reorg re-adds), and without this a peer marks
        // the action finalized while storing the first content block, then skips the
        // second as "already-finalized" — diverging from the forming node and stalling
        // the chain. Dedup deterministically (spaces and threads are already sorted)
        // so every node forms the identical block.
        let mut seen_action_hashes: std::collections::HashSet<[u8; 32]> =
            std::collections::HashSet::new();

        for (space_id, mut threads) in sorted_spaces {
            // DETERMINISTIC: Sort threads by ID within each space
            threads.sort_by(|a, b| a.thread_id.cmp(&b.thread_id));

            let mut space_content_blocks = Vec::new();
            for mut thread in threads {
                if thread.actions.is_empty() {
                    continue;
                }

                // DETERMINISTIC: Sort actions by their hash within each thread
                thread.actions.sort_by(|a, b| {
                    let hash_a = Self::action_hash(a);
                    let hash_b = Self::action_hash(b);
                    hash_a.cmp(&hash_b)
                });

                // Drop any action already placed in an earlier content block of this
                // same root block (block-level dedup, see seen_action_hashes above).
                thread
                    .actions
                    .retain(|a| seen_action_hashes.insert(Self::action_hash(a)));
                if thread.actions.is_empty() {
                    continue;
                }

                // Use new_with_space_metadata if space metadata is present (CreateSpace actions)
                let content_block_result = if let Some(metadata) = thread.space_metadata {
                    ContentBlock::new_with_space_metadata(
                        thread.thread_id,
                        thread.space_id,
                        thread.actions,
                        thread.prev_content_hash,
                        quantized_timestamp,
                        thread.branch_path,
                        metadata,
                    )
                } else {
                    ContentBlock::new(
                        thread.thread_id,
                        thread.space_id,
                        thread.actions,
                        thread.prev_content_hash,
                        quantized_timestamp,
                        thread.branch_path,
                    )
                };

                if let Ok(content_block) = content_block_result {
                    all_content_blocks.push(content_block.clone());
                    space_content_blocks.push(content_block);
                }
            }

            // Only add space if it has content blocks
            if !space_content_blocks.is_empty() {
                content_blocks_by_space.push((space_id, space_content_blocks));
            }
        }

        // Build space blocks (already sorted by space_id from above)
        let mut space_blocks = Vec::new();
        for (space_id, content_blocks) in content_blocks_by_space {
            let prev_space_hash = self.prev_space_hashes.get(&space_id).copied();
            let space_block = SpaceBlock::from_content_blocks(
                space_id,
                &content_blocks,
                prev_space_hash,
                quantized_timestamp,
            );
            // Update prev space hash for next round
            self.prev_space_hashes.insert(space_id, space_block.hash());
            space_blocks.push(space_block);
        }

        // Build root block
        let root_block = RootBlock::from_space_blocks(
            &space_blocks,
            self.prev_root_hash,
            self.prev_cumulative_pow,
            quantized_timestamp,
            self.difficulty_target,
            self.current_height + 1,
            block_creator,
        );

        // Update state
        self.prev_root_hash = root_block.hash();
        self.prev_cumulative_pow = root_block.cumulative_pow;
        self.current_height += 1;
        // Reset waiting timer - we just formed a block
        self.waiting_since = None;
        self.flush_since = None;
        // NOTE: Do NOT clear seen_actions here! Actions that have been included in a block
        // should never be re-added to the mempool. If we clear this, the same action can
        // arrive via gossip from another peer and get included in multiple blocks.

        // H-BLOCK-2: Clear action counts since threads were drained
        self.space_action_counts.clear();
        self.total_action_count = 0;
        self.action_locations.clear();

        // Mempool drained into the block — persist the now-empty set so a
        // restart doesn't resurrect already-mined actions.
        self.persist();

        (root_block, space_blocks, all_content_blocks)
    }

    /// Build content block for a specific thread without forming full chain
    ///
    /// Useful for incremental building or testing
    pub fn build_content_block(
        &mut self,
        thread_id: &ThreadId,
        timestamp: u64,
    ) -> Option<ContentBlock> {
        let thread = self.threads.remove(thread_id)?;

        if thread.actions.is_empty() {
            return None;
        }

        ContentBlock::new(
            thread.thread_id,
            thread.space_id,
            thread.actions,
            thread.prev_content_hash,
            timestamp,
            thread.branch_path,
        )
        .ok()
    }

    /// Clear all pending actions
    pub fn clear(&mut self) {
        self.threads.clear();
        self.seen_actions.clear();
        self.action_locations.clear();
        self.space_action_counts.clear();
        self.total_action_count = 0;
        self.waiting_since = None;
        self.flush_since = None;
        self.persist();
    }

    /// Get difficulty target
    #[must_use]
    pub fn difficulty_target(&self) -> u64 {
        self.difficulty_target
    }

    /// Set difficulty target
    pub fn set_difficulty_target(&mut self, target: u64) {
        self.difficulty_target = target;
    }

    /// Get current chain height
    #[must_use]
    pub fn current_height(&self) -> u64 {
        self.current_height
    }

    /// Sync chain state from external source (e.g., when receiving blocks from peers)
    ///
    /// This ensures the builder builds on top of the latest chain tip,
    /// not just locally-built blocks.
    pub fn sync_chain_state(&mut self, height: u64, prev_root_hash: [u8; 32], cumulative_pow: u64) {
        if height > self.current_height {
            self.current_height = height;
            self.prev_root_hash = prev_root_hash;
            self.prev_cumulative_pow = cumulative_pow;
        }
    }

    /// Force the builder's tip state to the canonical chain tip, regressing if
    /// the builder ran ahead. `build_root_block` advances `current_height` /
    /// `prev_root_hash` as soon as it forms a block, BEFORE the caller decides
    /// whether to store it. If the caller then rejects the block (a validation
    /// backstop, an invalid CreateSpace), the store stays put but the builder is
    /// left one height ahead on a phantom parent — and `sync_chain_state` only
    /// advances, so it can never pull the builder back. The next tick then forms
    /// on the phantom parent, producing blocks every peer rejects as "too far
    /// ahead / invalid parent" and wedging the chain. Call this against the chain
    /// store's real tip at the top of the formation loop so a rejected form self
    /// corrects instead of cascading.
    pub fn reset_to_chain_tip(
        &mut self,
        height: u64,
        prev_root_hash: [u8; 32],
        cumulative_pow: u64,
    ) {
        if self.current_height != height
            || self.prev_root_hash != prev_root_hash
            || self.prev_cumulative_pow != cumulative_pow
        {
            self.current_height = height;
            self.prev_root_hash = prev_root_hash;
            self.prev_cumulative_pow = cumulative_pow;
            self.waiting_since = None;
            self.flush_since = None;
        }
    }

    /// Set previous content block hash for a thread
    pub fn set_prev_content_hash(&mut self, thread_id: ThreadId, hash: [u8; 32]) {
        if let Some(thread) = self.threads.get_mut(&thread_id) {
            thread.prev_content_hash = Some(hash);
        }
    }

    /// Get pending PoW for a specific space
    #[must_use]
    pub fn space_pow(&self, space_id: &SpaceId) -> u64 {
        self.threads
            .values()
            .filter(|t| t.space_id == *space_id)
            .map(|t| t.total_pow())
            .sum()
    }

    /// Find a content hash in pending actions
    ///
    /// Searches all pending threads for an action with the given content_hash.
    /// Returns the space_id if found, None otherwise.
    ///
    /// This is used to allow replies to content that hasn't been finalized
    /// to the blockchain yet (still in the block builder's accumulator).
    #[must_use]
    pub fn find_pending_content(&self, content_hash: &[u8; 32]) -> Option<SpaceId> {
        for thread in self.threads.values() {
            for action in &thread.actions {
                if let Some(hash) = &action.content_hash {
                    if hash == content_hash {
                        return Some(thread.space_id);
                    }
                }
            }
        }
        None
    }

    /// Check if an action is already in the mempool
    #[must_use]
    pub fn has_action(&self, action_hash: &[u8; 32]) -> bool {
        self.seen_actions.contains(action_hash)
    }

    /// Remove an action from the mempool by its hash
    ///
    /// Called when receiving a block that contains this action.
    /// Returns true if the action was removed, false if it wasn't found.
    pub fn remove_action(&mut self, action_hash: &[u8; 32]) -> bool {
        self.seen_actions.pop(action_hash).is_some()
    }

    /// Clear finalized actions from mempool when receiving a block
    ///
    /// This properly removes actions from both seen_actions (dedup set)
    /// AND from the threads (actual pending actions that contribute to PoW).
    ///
    /// Returns the number of actions removed.
    pub fn clear_finalized_actions(&mut self, actions: &[Action]) -> usize {
        let mut removed = 0;

        // Build set of dedup hashes for matching
        // IMPORTANT: Use action_hash (actor, timestamp, type, content_hash) NOT full hash!
        // Different nodes may have the same logical action with different pow_nonce/signature,
        // so we must match on the canonical identity fields, not the full serialization.
        let finalized_hashes: std::collections::HashSet<[u8; 32]> =
            actions.iter().map(Self::action_hash).collect();

        // Remove finalized actions from seen_actions and action_locations so they don't bloat memory.
        // The router's handle_action_announce checks is_action_finalized() in the
        // chain_store DB before adding, so finalized actions won't be re-added.
        for hash in &finalized_hashes {
            self.seen_actions.pop(hash);
            self.action_locations.remove(hash);
        }

        // Remove from threads (actual pending actions) and track per-space removals
        // Iterate through all threads and filter out finalized actions
        let mut empty_threads = Vec::new();
        let mut space_removals: HashMap<SpaceId, usize> = HashMap::new();

        for (thread_id, thread) in self.threads.iter_mut() {
            let before = thread.actions.len();
            thread.actions.retain(|action| {
                let hash = Self::action_hash(action);
                !finalized_hashes.contains(&hash)
            });
            let after = thread.actions.len();
            let removed_from_thread = before - after;
            removed += removed_from_thread;

            // Track per-space removals (H-BLOCK-2)
            if removed_from_thread > 0 {
                *space_removals.entry(thread.space_id).or_insert(0) += removed_from_thread;
            }

            // Mark empty threads for removal
            if thread.actions.is_empty() {
                empty_threads.push(*thread_id);
            }
        }

        // Update per-space counts (H-BLOCK-2)
        for (space_id, count) in space_removals {
            if let Some(space_count) = self.space_action_counts.get_mut(&space_id) {
                *space_count = space_count.saturating_sub(count);
                if *space_count == 0 {
                    self.space_action_counts.remove(&space_id);
                }
            }
        }

        // Update total count (H-BLOCK-2)
        self.total_action_count = self.total_action_count.saturating_sub(removed);

        // Remove empty threads
        for thread_id in empty_threads {
            self.threads.remove(&thread_id);
        }

        if removed > 0 {
            self.persist();
        }
        removed
    }

    /// Get all pending actions with their thread and space IDs
    ///
    /// Returns a vector of (thread_id, space_id, action) tuples for gossip.
    #[must_use]
    pub fn get_pending_actions(&self) -> Vec<(ThreadId, SpaceId, Action)> {
        let mut result = Vec::new();
        for thread in self.threads.values() {
            for action in &thread.actions {
                result.push((thread.thread_id, thread.space_id, action.clone()));
            }
        }
        result
    }

    /// Get all pending action hashes
    ///
    /// Returns a vector of action hashes for mempool INV messages.
    #[must_use]
    pub fn get_pending_action_hashes(&self) -> Vec<[u8; 32]> {
        let mut result = Vec::new();
        for thread in self.threads.values() {
            for action in &thread.actions {
                result.push(Self::action_hash(action));
            }
        }
        result
    }

    /// Get a pending action by its hash
    ///
    /// Returns (thread_id, space_id, action) if found.
    /// Used for responding to GETDATA requests for mempool actions.
    #[must_use]
    pub fn get_pending_action_by_hash(
        &self,
        hash: &[u8; 32],
    ) -> Option<(ThreadId, SpaceId, Action)> {
        for thread in self.threads.values() {
            for action in &thread.actions {
                if &Self::action_hash(action) == hash {
                    return Some((thread.thread_id, thread.space_id, action.clone()));
                }
            }
        }
        None
    }

    /// Get seen action count (for debugging/stats)
    #[must_use]
    pub fn seen_action_count(&self) -> usize {
        self.seen_actions.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::action::ActionType;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Counter to generate unique timestamps for test actions
    static TEST_ACTION_COUNTER: AtomicU64 = AtomicU64::new(1000);

    fn make_test_action(pow_work: u64) -> Action {
        // Use incrementing timestamp to ensure unique action hashes
        let timestamp = TEST_ACTION_COUNTER.fetch_add(1, Ordering::Relaxed);
        Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp,
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work,
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
    fn test_builder_creation() {
        let builder = BlockBuilder::new(30);
        assert_eq!(builder.difficulty_target(), 30);
        assert_eq!(builder.pending_action_count(), 0);
        assert_eq!(builder.pending_thread_count(), 0);
    }

    #[test]
    fn build_root_block_filters_unsponsored_content_actions() {
        // The sybil wall at the formation layer: a self-minted, unsponsored
        // identity's Post is dropped before it can enter a block, while a
        // sponsored identity's Post is kept. Mirrors the consensus block-ingest
        // gate so we never form a block a peer would reject.
        use crate::sponsorship::types::{SponsorshipStatus, StoredSponsorship};
        use crate::sponsorship::SponsorshipStore;
        use crate::types::identity::PublicKey;

        let db = sled::Config::new().temporary(true).open().unwrap();
        let store = SponsorshipStore::from_db(&db).unwrap();

        let sponsored_actor = [7u8; 32];
        let unsponsored_actor = [9u8; 32];

        store
            .put(&StoredSponsorship {
                sponsored_identity: PublicKey::from_bytes(sponsored_actor),
                sponsor: Some(PublicKey::from_bytes([1u8; 32])),
                creation_timestamp: 1000,
                status: SponsorshipStatus::Active,
                penalty_until: None,
                depth: 1,
                probationary: false,
                probation_expires: None,
                positive_contribution_score: 0,
                is_genesis: false,
                orphaned_at: None,
            })
            .unwrap();
        assert!(store
            .exists(&PublicKey::from_bytes(sponsored_actor))
            .unwrap());

        let mk_post = |actor: [u8; 32], content: [u8; 32]| Action {
            action_type: ActionType::Post,
            actor,
            timestamp: TEST_ACTION_COUNTER.fetch_add(1, Ordering::Relaxed),
            content_hash: Some(content),
            parent_id: None,
            pow_nonce: 1,
            pow_work: 1,
            pow_target: [0u8; 32],
            signature: [0u8; 64],
            emoji: None,
            media_refs: vec![],
            display_name: None,
            replaces_pending: None,
            private: false,
        };

        let mut builder = BlockBuilder::new(1);
        let space_id = [1u8; 32];
        builder.add_action(
            [1u8; 32],
            space_id,
            mk_post(sponsored_actor, [11u8; 32]),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            space_id,
            mk_post(unsponsored_actor, [22u8; 32]),
            BranchPath::root(),
        );

        let (_root, _spaces, content_blocks) =
            builder.build_root_block(2000, [1u8; 32], Some(&store));

        let actors: Vec<[u8; 32]> = content_blocks
            .iter()
            .flat_map(|cb| cb.actions.iter().map(|a| a.actor))
            .collect();
        assert!(
            actors.contains(&sponsored_actor),
            "sponsored Post must be included"
        );
        assert!(
            !actors.contains(&unsponsored_actor),
            "unsponsored Post must be filtered out by the sponsorship gate"
        );
    }

    #[test]
    fn reset_to_chain_tip_regresses_when_builder_ran_ahead() {
        // Regression: a formation rejected after build_root_block bumped the
        // builder leaves current_height ahead of the stored tip. sync_chain_state
        // only advances, so it can't recover; reset_to_chain_tip must.
        let mut builder = BlockBuilder::new(30);
        builder.sync_chain_state(5, [0xAA; 32], 500);
        assert_eq!(builder.current_height(), 5);

        // Simulate the builder having run one height ahead on a phantom parent.
        builder.reset_to_chain_tip(6, [0xBB; 32], 600);
        assert_eq!(builder.current_height(), 6);

        // advance-only sync CANNOT pull it back to the real tip (5)...
        builder.sync_chain_state(5, [0xAA; 32], 500);
        assert_eq!(
            builder.current_height(),
            6,
            "sync_chain_state must not regress"
        );

        // ...but reset_to_chain_tip forces it back to the canonical tip.
        builder.reset_to_chain_tip(5, [0xAA; 32], 500);
        assert_eq!(
            builder.current_height(),
            5,
            "reset_to_chain_tip must regress to the real tip"
        );
        // And next_height now points at the correct height to form (tip + 1).
        assert_eq!(builder.next_height(), 6);
    }

    #[test]
    fn mempool_survives_reload_from_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mempool.bin");

        // Build a mempool with two actions and persist as we go.
        {
            let mut builder = BlockBuilder::new(30);
            builder.set_persistence(path.clone());
            assert!(builder.add_action(
                [10u8; 32],
                [11u8; 32],
                make_test_action(5),
                BranchPath::root()
            ));
            assert!(builder.add_action(
                [12u8; 32],
                [13u8; 32],
                make_test_action(7),
                BranchPath::root()
            ));
            assert_eq!(builder.pending_action_count(), 2);
        }

        // A fresh builder pointed at the same file recovers the pending set.
        let mut reloaded = BlockBuilder::new(30);
        reloaded.set_persistence(path.clone());
        assert_eq!(
            reloaded.pending_action_count(),
            2,
            "pending actions restored from disk"
        );
        assert_eq!(reloaded.pending_thread_count(), 2);

        // Dedup index rebuilt: re-adding a restored action is rejected.
        let restored = reloaded.get_pending_actions();
        let (tid, sid, action) = restored[0].clone();
        assert!(
            !reloaded.add_action(tid, sid, action, BranchPath::root()),
            "seen_actions must be rebuilt so a restored action is not re-added"
        );

        // Draining the mempool (block formation / clear) persists empty.
        reloaded.clear();
        let mut after_clear = BlockBuilder::new(30);
        after_clear.set_persistence(path);
        assert_eq!(
            after_clear.pending_action_count(),
            0,
            "drained mempool persisted as empty"
        );
    }

    #[test]
    fn test_builder_threshold_scaled_per_network() {
        // SWIM-BLOCK-THRESHOLD: the block-formation threshold the builder is created
        // with must be the network-scaled value, matching per-action PoW scaling.
        use crate::blocks::INITIAL_DIFFICULTY;
        use crate::network::NetworkMode;

        let mainnet =
            BlockBuilder::new(NetworkMode::Mainnet.scaled_block_difficulty(INITIAL_DIFFICULTY));
        let testnet =
            BlockBuilder::new(NetworkMode::Testnet.scaled_block_difficulty(INITIAL_DIFFICULTY));
        let regtest =
            BlockBuilder::new(NetworkMode::Regtest.scaled_block_difficulty(INITIAL_DIFFICULTY));

        assert_eq!(mainnet.difficulty_target(), 30);
        assert_eq!(testnet.difficulty_target(), 3);
        assert_eq!(regtest.difficulty_target(), 1);

        // A single small action must seal a block on regtest (near-instant).
        let mut regtest = regtest;
        regtest.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(1),
            BranchPath::root(),
        );
        assert!(
            regtest.is_threshold_met(),
            "regtest should seal on a single pow=1 action"
        );
    }

    #[test]
    fn should_form_or_flush_forms_low_pow_actions_after_timeout() {
        // Regression for the onboarding stall: a low-PoW action (a pow=0 Sponsor/
        // claim) can't meet total_pow >= difficulty_target, so on a quiet chain it
        // never triggers a block and strands in the mempool. The flush timeout mines
        // it anyway.
        let mut builder = BlockBuilder::new(30); // difficulty_target = 30
                                                 // Empty mempool: nothing to form regardless of timeout.
        assert!(!builder.should_form_or_flush(60));

        // A single low-PoW action never meets the threshold.
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(5),
            BranchPath::root(),
        );
        assert!(!builder.is_threshold_met());
        // With a long flush timeout it keeps waiting (timer just started).
        assert!(!builder.should_form_or_flush(3600));
        // Once the flush timeout has elapsed (0s), it forms anyway.
        assert!(
            builder.should_form_or_flush(0),
            "low-pow pending action must flush after the timeout"
        );

        // A high-PoW action meets the threshold and forms immediately — the flush
        // timeout is irrelevant on the threshold path.
        let mut b2 = BlockBuilder::new(30);
        b2.add_action(
            [3u8; 32],
            [4u8; 32],
            make_test_action(50),
            BranchPath::root(),
        );
        assert!(b2.is_threshold_met());
        assert!(
            b2.should_form_or_flush(3600),
            "threshold-met forms immediately regardless of flush timeout"
        );
    }

    #[test]
    fn pending_action_announcements_snapshots_all_mempool_actions() {
        // Backs the mempool re-broadcast task: every still-pending action must be
        // re-announceable (with its thread/space) so a missed one-shot broadcast
        // can self-heal instead of stranding the action.
        let mut builder = BlockBuilder::new(30);
        assert!(builder.pending_action_announcements().is_empty());

        builder.add_action(
            [10u8; 32],
            [11u8; 32],
            make_test_action(5),
            BranchPath::root(),
        );
        builder.add_action(
            [10u8; 32],
            [11u8; 32],
            make_test_action(5),
            BranchPath::root(),
        );
        builder.add_action(
            [12u8; 32],
            [13u8; 32],
            make_test_action(5),
            BranchPath::root(),
        );

        let snap = builder.pending_action_announcements();
        assert_eq!(
            snap.len(),
            3,
            "all pending actions across threads are included"
        );
        // Thread/space are carried so peers can place the re-announced action.
        assert!(snap
            .iter()
            .any(|(t, s, _)| *t == [10u8; 32] && *s == [11u8; 32]));
        assert!(snap
            .iter()
            .any(|(t, s, _)| *t == [12u8; 32] && *s == [13u8; 32]));
    }

    #[test]
    fn test_add_action() {
        let mut builder = BlockBuilder::new(30);
        let action = make_test_action(10);

        builder.add_action([1u8; 32], [2u8; 32], action, BranchPath::root());

        assert_eq!(builder.pending_action_count(), 1);
        assert_eq!(builder.pending_thread_count(), 1);
        assert_eq!(builder.total_pow(), 10);
    }

    #[test]
    fn test_add_multiple_actions_same_thread() {
        let mut builder = BlockBuilder::new(30);

        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(10),
            BranchPath::root(),
        );
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(15),
            BranchPath::root(),
        );

        assert_eq!(builder.pending_action_count(), 2);
        assert_eq!(builder.pending_thread_count(), 1);
        assert_eq!(builder.total_pow(), 25);
    }

    #[test]
    fn test_add_actions_different_threads() {
        let mut builder = BlockBuilder::new(30);

        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(10),
            BranchPath::root(),
        );
        builder.add_action(
            [3u8; 32],
            [2u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );

        assert_eq!(builder.pending_action_count(), 2);
        assert_eq!(builder.pending_thread_count(), 2);
        assert_eq!(builder.total_pow(), 30);
    }

    #[test]
    fn test_should_form_root_below_threshold() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(29),
            BranchPath::root(),
        );

        assert!(!builder.should_form_root());
    }

    #[test]
    fn test_is_threshold_met_at_threshold() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );

        assert!(builder.is_threshold_met());
    }

    #[test]
    fn test_is_threshold_met_above_threshold() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(35),
            BranchPath::root(),
        );

        assert!(builder.is_threshold_met());
    }

    #[test]
    fn should_form_root_lazy_waits_before_forming() {
        // should_form_root() does NOT form on the first threshold-met call: it
        // starts a lazy wait for someone else's block (fork-race mitigation) and
        // only forms after LAZY_BLOCK_WAIT_MS. Threshold detection itself is
        // is_threshold_met(); this pins the deferral contract.
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );

        assert!(builder.is_threshold_met(), "threshold is met immediately");
        assert!(
            !builder.should_form_root(),
            "first threshold-met call starts the lazy wait, does not form"
        );
        assert!(
            !builder.should_form_root(),
            "still waiting within the lazy window"
        );
    }

    #[test]
    fn test_build_root_block() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );
        builder.add_action(
            [3u8; 32],
            [2u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );

        let (root, spaces, contents) = builder.build_root_block(1000, [0u8; 32], None);

        assert_eq!(root.total_pow, 50);
        assert_eq!(root.height, 1);
        assert_eq!(spaces.len(), 1); // Both threads in same space
        assert_eq!(contents.len(), 2); // Two threads = two content blocks

        // Builder should be cleared
        assert_eq!(builder.pending_action_count(), 0);
        assert_eq!(builder.current_height(), 1);
    }

    #[test]
    fn test_build_multiple_spaces() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [10u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            [20u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );

        let (root, spaces, contents) = builder.build_root_block(1000, [0u8; 32], None);

        assert_eq!(root.total_pow, 50);
        assert_eq!(spaces.len(), 2); // Two different spaces
        assert_eq!(contents.len(), 2);
    }

    #[test]
    fn test_chain_continuity() {
        let mut builder = BlockBuilder::new(30);

        // First block
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );
        let (root1, _, _) = builder.build_root_block(1000, [0u8; 32], None);

        // Second block
        builder.add_action(
            [3u8; 32],
            [2u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );
        let (root2, _, _) = builder.build_root_block(1030, [0u8; 32], None);

        assert_eq!(root2.prev_root_hash, root1.hash());
        assert_eq!(root2.height, 2);
    }

    #[test]
    fn test_space_pow() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [10u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            [10u8; 32],
            make_test_action(15),
            BranchPath::root(),
        );
        builder.add_action(
            [3u8; 32],
            [20u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );

        assert_eq!(builder.space_pow(&[10u8; 32]), 35);
        assert_eq!(builder.space_pow(&[20u8; 32]), 30);
        assert_eq!(builder.space_pow(&[30u8; 32]), 0);
    }

    #[test]
    fn test_clear() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );

        builder.clear();

        assert_eq!(builder.pending_action_count(), 0);
        assert_eq!(builder.pending_thread_count(), 0);
        assert_eq!(builder.total_pow(), 0);
    }

    #[test]
    fn test_from_chain_state() {
        let builder = BlockBuilder::from_chain_state(30, 100, [5u8; 32], 500);

        assert_eq!(builder.difficulty_target(), 30);
        assert_eq!(builder.current_height(), 100);
    }

    #[test]
    fn test_build_content_block() {
        let mut builder = BlockBuilder::new(30);
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );
        builder.add_action(
            [1u8; 32],
            [2u8; 32],
            make_test_action(10),
            BranchPath::root(),
        );

        let content_block = builder.build_content_block(&[1u8; 32], 1000);

        assert!(content_block.is_some());
        let cb = content_block.unwrap();
        assert_eq!(cb.total_pow, 30);
        assert_eq!(cb.action_count(), 2);

        // Thread should be removed
        assert_eq!(builder.pending_thread_count(), 0);
    }

    #[test]
    fn test_build_content_block_nonexistent() {
        let mut builder = BlockBuilder::new(30);

        let content_block = builder.build_content_block(&[1u8; 32], 1000);

        assert!(content_block.is_none());
    }

    // ============================================================================
    // Replace-In-Mempool (RIM) Tests
    // ============================================================================

    #[test]
    fn test_rim_replace_same_author() {
        let mut builder = BlockBuilder::new(30);

        // Add initial action
        let action1 = make_test_action(20);
        let action1_hash = BlockBuilder::action_hash(&action1);
        builder.add_action([1u8; 32], [2u8; 32], action1, BranchPath::root());

        assert_eq!(builder.pending_action_count(), 1);
        assert_eq!(builder.total_pow(), 20);

        // Create replacement action with same author
        let mut action2 = make_test_action(25);
        action2.content_hash = Some([99u8; 32]); // Different content
        action2.replaces_pending = Some(action1_hash);

        let replaced = builder.add_action([1u8; 32], [2u8; 32], action2, BranchPath::root());

        assert!(replaced, "Replacement should succeed for same author");
        // Note: pending_action_count may be 2 because old action is marked but not removed
        // The total_pow should reflect the new action
    }

    #[test]
    fn test_rim_reject_different_author() {
        let mut builder = BlockBuilder::new(30);

        // Add initial action from author [1u8; 32]
        let action1 = make_test_action(20);
        let action1_hash = BlockBuilder::action_hash(&action1);
        builder.add_action([1u8; 32], [2u8; 32], action1, BranchPath::root());

        assert_eq!(builder.pending_action_count(), 1);

        // Try to replace with different author - should fail
        let mut action2 = Action {
            actor: [99u8; 32], // Different author
            ..make_test_action(25)
        };
        action2.replaces_pending = Some(action1_hash);

        let replaced = builder.add_action([1u8; 32], [2u8; 32], action2, BranchPath::root());

        assert!(!replaced, "Replacement should fail for different author");
        assert_eq!(builder.pending_action_count(), 1); // Still only original action
    }

    #[test]
    fn test_rim_reject_nonexistent_target() {
        let mut builder = BlockBuilder::new(30);

        // Try to replace non-existent action
        let mut action = make_test_action(20);
        action.replaces_pending = Some([0xab; 32]); // Non-existent hash

        let replaced = builder.add_action([1u8; 32], [2u8; 32], action, BranchPath::root());

        assert!(!replaced, "Replacement should fail for non-existent target");
        assert_eq!(builder.pending_action_count(), 0);
    }

    #[test]
    fn test_rim_updates_seen_actions() {
        let mut builder = BlockBuilder::new(30);

        // Add initial action
        let action1 = make_test_action(20);
        let action1_hash = BlockBuilder::action_hash(&action1);
        builder.add_action([1u8; 32], [2u8; 32], action1.clone(), BranchPath::root());

        // Verify original is tracked
        assert!(builder.seen_actions.contains(&action1_hash));

        // Create replacement
        let mut action2 = make_test_action(25);
        action2.content_hash = Some([99u8; 32]);
        action2.replaces_pending = Some(action1_hash);
        let action2_hash = BlockBuilder::action_hash(&action2);

        builder.add_action([1u8; 32], [2u8; 32], action2, BranchPath::root());

        // After replacement: old hash should be removed, new hash should be present
        assert!(
            !builder.seen_actions.contains(&action1_hash),
            "Old action hash should be removed"
        );
        assert!(
            builder.seen_actions.contains(&action2_hash),
            "New action hash should be tracked"
        );
    }

    // ============================================================================
    // Mempool Size Limits Tests (H-BLOCK-2)
    // ============================================================================

    fn make_test_action_with_pow(pow_work: u64, unique_id: u64) -> Action {
        Action {
            action_type: ActionType::Post,
            actor: [1u8; 32],
            timestamp: unique_id, // Use unique_id as timestamp for unique hashes
            content_hash: Some([2u8; 32]),
            parent_id: None,
            pow_nonce: 42,
            pow_work,
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
    fn test_action_count_tracking() {
        let mut builder = BlockBuilder::new(30);

        // Add actions and verify counts are tracked
        builder.add_action(
            [1u8; 32],
            [10u8; 32],
            make_test_action(10),
            BranchPath::root(),
        );
        assert_eq!(builder.total_action_count, 1);
        assert_eq!(builder.space_action_counts.get(&[10u8; 32]), Some(&1));

        builder.add_action(
            [2u8; 32],
            [10u8; 32],
            make_test_action(15),
            BranchPath::root(),
        );
        assert_eq!(builder.total_action_count, 2);
        assert_eq!(builder.space_action_counts.get(&[10u8; 32]), Some(&2));

        // Different space
        builder.add_action(
            [3u8; 32],
            [20u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );
        assert_eq!(builder.total_action_count, 3);
        assert_eq!(builder.space_action_counts.get(&[20u8; 32]), Some(&1));
    }

    #[test]
    fn test_evict_lowest_pow_from_space() {
        let mut builder = BlockBuilder::new(30);
        let space_id = [10u8; 32];

        // Add actions with different PoW values
        builder.add_action(
            [1u8; 32],
            space_id,
            make_test_action_with_pow(100, 1),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            space_id,
            make_test_action_with_pow(50, 2),
            BranchPath::root(),
        );
        builder.add_action(
            [3u8; 32],
            space_id,
            make_test_action_with_pow(200, 3),
            BranchPath::root(),
        );

        assert_eq!(builder.total_action_count, 3);

        // Evict lowest PoW (should be 50)
        let evicted_pow = builder.evict_lowest_pow_from_space(&space_id);
        assert_eq!(evicted_pow, Some(50));
        assert_eq!(builder.total_action_count, 2);
        assert_eq!(builder.space_action_counts.get(&space_id), Some(&2));
    }

    #[test]
    fn test_evict_lowest_pow_global() {
        let mut builder = BlockBuilder::new(30);

        // Add actions in different spaces
        builder.add_action(
            [1u8; 32],
            [10u8; 32],
            make_test_action_with_pow(100, 1),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            [20u8; 32],
            make_test_action_with_pow(25, 2),
            BranchPath::root(),
        ); // Lowest
        builder.add_action(
            [3u8; 32],
            [30u8; 32],
            make_test_action_with_pow(200, 3),
            BranchPath::root(),
        );

        assert_eq!(builder.total_action_count, 3);

        // Evict lowest PoW globally (should be 25)
        let evicted_pow = builder.evict_lowest_pow_global();
        assert_eq!(evicted_pow, Some(25));
        assert_eq!(builder.total_action_count, 2);
        assert_eq!(builder.space_action_counts.get(&[20u8; 32]), Some(&0));
    }

    #[test]
    fn test_counts_cleared_on_build_root_block() {
        let mut builder = BlockBuilder::new(30);

        builder.add_action(
            [1u8; 32],
            [10u8; 32],
            make_test_action(30),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            [20u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );

        assert_eq!(builder.total_action_count, 2);
        assert!(!builder.space_action_counts.is_empty());

        // Build root block - counts should be cleared
        let (_root, _spaces, _contents) = builder.build_root_block(1000, [0u8; 32], None);

        assert_eq!(builder.total_action_count, 0);
        assert!(builder.space_action_counts.is_empty());
    }

    #[test]
    fn test_counts_updated_on_clear_finalized_actions() {
        let mut builder = BlockBuilder::new(30);

        let action1 = make_test_action_with_pow(10, 100);
        let action2 = make_test_action_with_pow(20, 101);

        builder.add_action([1u8; 32], [10u8; 32], action1.clone(), BranchPath::root());
        builder.add_action([2u8; 32], [10u8; 32], action2.clone(), BranchPath::root());

        assert_eq!(builder.total_action_count, 2);
        assert_eq!(builder.space_action_counts.get(&[10u8; 32]), Some(&2));

        // Clear one finalized action
        let removed = builder.clear_finalized_actions(&[action1]);
        assert_eq!(removed, 1);
        assert_eq!(builder.total_action_count, 1);
        assert_eq!(builder.space_action_counts.get(&[10u8; 32]), Some(&1));
    }

    #[test]
    fn test_counts_cleared_on_clear() {
        let mut builder = BlockBuilder::new(30);

        builder.add_action(
            [1u8; 32],
            [10u8; 32],
            make_test_action(10),
            BranchPath::root(),
        );
        builder.add_action(
            [2u8; 32],
            [20u8; 32],
            make_test_action(20),
            BranchPath::root(),
        );

        assert_eq!(builder.total_action_count, 2);

        builder.clear();

        assert_eq!(builder.total_action_count, 0);
        assert!(builder.space_action_counts.is_empty());
    }

    /// A hardcoded-genesis creator's CreateSpace must survive the builder's
    /// sponsorship filter even with NO sponsorship store record — genesis is
    /// the sponsor root and usually has none. Regression for the live bug
    /// where genesis's own "Latency Lab" CreateSpace was silently excluded
    /// from every block it formed ("creator not sponsored on-chain and no
    /// Sponsor action in batch") and the space never mined.
    #[test]
    fn test_genesis_create_space_survives_builder_filter() {
        use crate::sponsorship::SponsorshipStore;
        use crate::types::identity::PublicKey;

        // The hardcoded genesis identities are network-gated; the key below is
        // the testnet root.
        crate::network::NetworkContext::set_mode(crate::network::NetworkMode::Testnet);

        // Real hardcoded testnet genesis pubkey (genesis_list.rs).
        let genesis: [u8; 32] = [
            0x9e, 0xc9, 0x66, 0x1d, 0x3a, 0x97, 0x5a, 0xd1, 0x41, 0xca, 0xa5, 0xdf, 0x9f, 0x14,
            0xb3, 0xc4, 0x6c, 0xf7, 0x25, 0x50, 0x9e, 0x7f, 0xa0, 0x44, 0xc1, 0x9d, 0x26, 0xfe,
            0x76, 0xbd, 0x04, 0x20,
        ];
        assert!(
            crate::sponsorship::genesis_list::is_in_hardcoded_genesis_list(&PublicKey::from_bytes(
                genesis
            ))
        );

        let mut space_id_32 = [0u8; 32];
        space_id_32[0] = 0x01; // valid Social class byte
        let action = Action::new_create_space(
            genesis,
            1_700_000_000,
            space_id_32,
            0,
            1,
            [0u8; 32],
            [0u8; 64],
        );

        let mut builder = BlockBuilder::new(0);
        builder.add_action(space_id_32, space_id_32, action, BranchPath::root());

        // Real (empty) sponsorship store present: genesis has NO record of its
        // own, yet its CreateSpace must survive the sponsorship filter via the
        // hardcoded-genesis-list fallback — the exact bootstrap case the filter
        // must not break. (A missing store is now lenient, so we must supply one
        // to exercise the genesis path rather than the no-store path.)
        let db = sled::Config::new().temporary(true).open().unwrap();
        let store = SponsorshipStore::from_db(&db).unwrap();
        let (root, _spaces, contents) =
            builder.build_root_block(1_700_000_000, [0u8; 32], Some(&store));

        let kept: usize = contents
            .iter()
            .flat_map(|cb| cb.actions.iter())
            .filter(|a| a.action_type == crate::blocks::ActionType::CreateSpace)
            .count();
        assert_eq!(kept, 1, "genesis CreateSpace must be included in the block");
        assert!(!root.space_block_hashes.is_empty());
    }
}
