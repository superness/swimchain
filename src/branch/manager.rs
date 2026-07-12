//! Branch Manager (SPEC_08 §5 - Milestone 1.7)
//!
//! Core logic for branch assignment and fracturing:
//!
//! # Cross-Branch Reference Rules (SPEC_08 §4.3)
//!
//! 1. **POST**: New thread - assigned by hash to leaf branch
//! 2. **REPLY**: Goes to parent thread's branch (parent-anchored)
//! 3. **ENGAGE**: Goes to TARGET content's branch, NOT engager's location
//!
//! Cross-branch references are allowed and tracked. When a user in branch A
//! engages content in branch B, the engagement is recorded in branch B.
//! This maintains thread locality - users syncing branch B will get all
//! engagements on content in that branch, regardless of engager's home branch.

use std::collections::BTreeSet;

use crate::blocks::{BranchDirection, BranchPath};
use crate::storage::ChainStore;

use super::behavioral::{
    self, BehavioralEvent, ClusterOutcome, ClusteringAction, CommunityFormation,
};
use super::error::BranchError;
use super::metadata::{BranchMetadata, SpaceBranchState};
use super::BRANCH_FRACTURE_THRESHOLD;

/// Mode for [`BranchManager::process_action_for_clustering`] — controls what
/// happens when detection crosses the community-formation thresholds
/// (`docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md` Phase 1).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClusteringMode {
    /// Detection runs; a qualifying cluster executes the behavioral fracture
    /// and is recorded as a [`CommunityFormation`] (existing Phase A
    /// behavior). Gated to regtest by default via
    /// `NodeConfig::behavioral_branching_enabled()`.
    Full,
    /// Detection runs; a qualifying cluster is persisted as a
    /// [`BehavioralEvent`] ("would-be formation") but no fracture executes
    /// and no space/branch is created. Rollout Phase 1 default for testnet
    /// via `NodeConfig::behavioral_branching_log_only_enabled()`.
    LogOnly,
}

/// Branch manager for assignment and fracturing
///
/// Handles:
/// - Assigning branches to new threads and replies
/// - Tracking branch sizes and thread counts
/// - Executing fractures when thresholds are exceeded
pub struct BranchManager<'a> {
    store: &'a ChainStore,
    fracture_threshold: u64,
}

impl<'a> BranchManager<'a> {
    /// Create a new branch manager with default threshold
    #[must_use]
    pub fn new(store: &'a ChainStore) -> Self {
        Self {
            store,
            fracture_threshold: BRANCH_FRACTURE_THRESHOLD,
        }
    }

    /// Create a new branch manager with custom threshold
    #[must_use]
    pub fn with_threshold(store: &'a ChainStore, threshold: u64) -> Self {
        Self {
            store,
            fracture_threshold: threshold,
        }
    }

    /// Assign branch for a NEW thread (no parent)
    ///
    /// For unfractured spaces, returns root branch.
    /// For fractured spaces, navigates by hash bits to find the appropriate leaf branch.
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `thread_root_id` - Hash of the thread root (used for branch selection)
    pub fn assign_branch_for_new_thread(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        let state = self
            .store
            .get_space_branch_state(space_id)?
            .unwrap_or_else(SpaceBranchState::new);

        if state.max_depth == 0 {
            // No fractures yet - all threads go to root
            return Ok(BranchPath::root());
        }

        // Find the leaf branch that matches this hash
        // Since the tree may not be balanced (branches fracture independently),
        // we need to find the active branch whose path matches the hash bits
        for active_branch in &state.active_branches {
            if Self::hash_matches_branch(thread_root_id, active_branch) {
                return Ok(active_branch.clone());
            }
        }

        // If no match found, navigate by hash bits to max_depth as fallback
        let current = BranchPath::from_thread_root(thread_root_id, state.max_depth);

        // This shouldn't happen with correct state
        Err(BranchError::NotLeafBranch {
            branch_path: current,
        })
    }

    /// Check if a hash matches a branch's path
    ///
    /// A hash matches a branch if the hash bits at positions 0..branch.depth
    /// match the branch's path bits.
    fn hash_matches_branch(hash: &[u8; 32], branch: &BranchPath) -> bool {
        // For root branch, everything matches
        if branch.depth == 0 {
            return true;
        }

        // Check each bit up to branch.depth
        for depth in 0..branch.depth {
            let hash_direction = BranchPath::direction_at(hash, depth);
            let byte_index = (depth / 8) as usize;
            let bit_index = 7 - (depth % 8);

            // Get the branch's direction at this depth
            let branch_bit = if byte_index < branch.path.len() {
                (branch.path[byte_index] >> bit_index) & 1
            } else {
                0
            };

            let matches = match hash_direction {
                BranchDirection::Left => branch_bit == 0,
                BranchDirection::Right => branch_bit == 1,
            };

            if !matches {
                return false;
            }
        }

        true
    }

    /// Assign branch for a REPLY (inherits parent's branch)
    ///
    /// Replies stay with their parent thread to maintain thread integrity.
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `thread_root_id` - Thread root hash (identifies the thread)
    pub fn assign_branch_for_reply(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        self.store
            .get_thread_branch(space_id, thread_root_id)?
            .ok_or(BranchError::ThreadNotFound {
                thread_root_id: *thread_root_id,
            })
    }

    /// Check if branch needs fracturing
    ///
    /// # Arguments
    /// * `space_id` - Space containing the branch
    /// * `branch_path` - Branch to check
    pub fn needs_fracture(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
    ) -> Result<bool, BranchError> {
        // Cannot fracture at max depth
        if branch_path.depth >= BranchPath::MAX_DEPTH {
            return Ok(false);
        }

        // Check branch size against threshold
        let metadata = self.store.get_branch_metadata(space_id, branch_path)?;
        Ok(metadata.map_or(false, |m| m.is_over_threshold(self.fracture_threshold)))
    }

    /// Ensure space has branch state initialized
    fn ensure_space_initialized(
        &self,
        space_id: &[u8; 32],
        timestamp: u64,
    ) -> Result<(), BranchError> {
        // Use atomic check-and-set pattern
        if self.store.get_space_branch_state(space_id)?.is_none() {
            let state = SpaceBranchState::new();
            self.store.put_space_branch_state(space_id, &state)?;

            // Also create root branch metadata
            let metadata = BranchMetadata::new_empty(BranchPath::root(), timestamp);
            self.store.put_branch_metadata(space_id, &metadata)?;
        }
        Ok(())
    }

    /// Register a content block and update branch indexes
    ///
    /// This method:
    /// 1. Ensures space is initialized
    /// 2. Assigns or looks up branch path
    /// 3. Updates thread size tracking
    /// 4. Updates branch metadata
    /// 5. Triggers fracture if threshold exceeded
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `thread_root_id` - Thread root hash
    /// * `is_new_thread` - True if this is a new thread (POST), false for REPLY
    /// * `serialized_size` - Size of bincode-serialized ContentBlock in bytes
    /// * `timestamp` - Current timestamp for metadata
    ///
    /// # Returns
    /// (assigned_branch_path, fracture_triggered)
    pub fn register_content_block(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        is_new_thread: bool,
        serialized_size: u64,
        timestamp: u64,
    ) -> Result<(BranchPath, bool), BranchError> {
        // 1. Ensure space is initialized
        self.ensure_space_initialized(space_id, timestamp)?;

        // 2. Get or assign branch path
        let path = if is_new_thread {
            let assigned = self.assign_branch_for_new_thread(space_id, thread_root_id)?;
            // Index the new thread
            self.store
                .put_thread_branch(space_id, thread_root_id, &assigned)?;
            assigned
        } else {
            self.assign_branch_for_reply(space_id, thread_root_id)?
        };

        // 3. Update thread size tracking
        self.store
            .update_thread_size(space_id, thread_root_id, serialized_size)?;

        // 4. Update branch metadata
        let mut metadata = self
            .store
            .get_branch_metadata(space_id, &path)?
            .unwrap_or_else(|| BranchMetadata::new_empty(path.clone(), timestamp));

        metadata.total_size += serialized_size;
        if is_new_thread {
            metadata.thread_count += 1;
        }
        metadata.last_updated = timestamp;
        self.store.put_branch_metadata(space_id, &metadata)?;

        // 5. Check for fracture trigger
        let fracture_triggered = if self.needs_fracture(space_id, &path)? {
            self.execute_fracture(space_id, &path, timestamp)?;
            true
        } else {
            false
        };

        Ok((path, fracture_triggered))
    }

    /// Execute fracture on a branch that exceeded threshold
    ///
    /// # Algorithm
    /// 1. Create LEFT and RIGHT child branches
    /// 2. Get all threads in this branch
    /// 3. Reassign each thread to appropriate child based on hash bit
    /// 4. Create child metadata, delete parent metadata
    /// 5. Update SpaceBranchState
    ///
    /// # Thread Integrity Note
    /// Only index pointers change - ContentBlock data is NOT moved.
    /// All content blocks for a thread share the same thread_root_id,
    /// so replies will continue to find the correct branch.
    pub fn execute_fracture(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        timestamp: u64,
    ) -> Result<(), BranchError> {
        // 1. Validate fracture is possible
        if branch_path.depth >= BranchPath::MAX_DEPTH {
            return Err(BranchError::MaxDepthReached {
                branch_path: branch_path.clone(),
            });
        }

        // 2. Create child branches
        let left_child = branch_path.branch(BranchDirection::Left);
        let right_child = branch_path.branch(BranchDirection::Right);
        let fracture_depth = branch_path.depth; // Bit position to check

        // 3. Get all threads in this branch with their sizes
        let threads = self.store.get_threads_in_branch(space_id, branch_path)?;

        // 4. Track child branch statistics
        let mut left_size: u64 = 0;
        let mut left_count: u32 = 0;
        let mut right_size: u64 = 0;
        let mut right_count: u32 = 0;

        // 5. Reassign each thread to appropriate child
        for (thread_id, size) in &threads {
            let direction = BranchPath::direction_at(thread_id, fracture_depth);

            // Delete old index entry
            self.store
                .delete_thread_branch(space_id, thread_id, branch_path)?;

            // Add new index entry
            match direction {
                BranchDirection::Left => {
                    self.store
                        .put_thread_branch(space_id, thread_id, &left_child)?;
                    left_size += size;
                    left_count += 1;
                }
                BranchDirection::Right => {
                    self.store
                        .put_thread_branch(space_id, thread_id, &right_child)?;
                    right_size += size;
                    right_count += 1;
                }
            }
        }

        // 6. Create child branch metadata
        let left_meta = BranchMetadata {
            branch_path: left_child.clone(),
            total_size: left_size,
            thread_count: left_count,
            last_updated: timestamp,
        };
        let right_meta = BranchMetadata {
            branch_path: right_child.clone(),
            total_size: right_size,
            thread_count: right_count,
            last_updated: timestamp,
        };
        self.store.put_branch_metadata(space_id, &left_meta)?;
        self.store.put_branch_metadata(space_id, &right_meta)?;

        // 7. Delete parent branch metadata
        self.store.delete_branch_metadata(space_id, branch_path)?;

        // 8. Update SpaceBranchState
        let mut state = self
            .store
            .get_space_branch_state(space_id)?
            .unwrap_or_else(SpaceBranchState::new);

        state.active_branches.retain(|p| p != branch_path);
        state.active_branches.push(left_child);
        state.active_branches.push(right_child);

        let new_depth = fracture_depth + 1;
        if new_depth > state.max_depth {
            state.max_depth = new_depth;
        }

        self.store.put_space_branch_state(space_id, &state)?;

        Ok(())
    }

    // ========================================================================
    // Behavioral branching (SPEC_13 Phase A)
    // ========================================================================

    /// Process one action for behavioral clustering (SPEC_13 §3.1), in
    /// [`ClusteringMode::Full`].
    ///
    /// Convenience wrapper over
    /// [`Self::process_action_for_clustering_with_mode`] preserving the
    /// original (pre-Phase-1) signature and behavior: qualifying formations
    /// execute the fracture immediately.
    ///
    /// Callers must gate this behind
    /// `NodeConfig::behavioral_branching_enabled()` — detection is local-only
    /// until SPEC_13 §7 consensus messages land.
    ///
    /// # Arguments
    /// * `space_id` - Space the action occurred in
    /// * `action` - Normalized clustering view of the action
    /// * `current_height` - Current chain height (for age/cooldown gates)
    /// * `timestamp` - Current timestamp (for branch metadata updates)
    pub fn process_action_for_clustering(
        &self,
        space_id: &[u8; 32],
        action: &ClusteringAction,
        current_height: u64,
        timestamp: u64,
    ) -> Result<ClusterOutcome, BranchError> {
        self.process_action_for_clustering_with_mode(
            space_id,
            action,
            current_height,
            timestamp,
            ClusteringMode::Full,
        )
    }

    /// Process one action for behavioral clustering (SPEC_13 §3.1), honoring
    /// the given [`ClusteringMode`] (`docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md`
    /// Phase 1).
    ///
    /// Updates per-identity interaction metrics, checks whether the acting
    /// identity's cluster now crosses the formation thresholds, and applies
    /// the outcome:
    ///
    /// - **Community** (cluster >= `MIN_COMMUNITY_SIZE`):
    ///   - [`ClusteringMode::Full`] executes a behavioral fracture — threads
    ///     are assigned by cluster membership, not hash bit — then records
    ///     the formation.
    ///   - [`ClusteringMode::LogOnly`] persists a [`BehavioralEvent`]
    ///     ("would-be formation") instead: no fracture executes, no
    ///     space/branch is created. The per-space formation cooldown
    ///     (§6.3) is still applied so a sustained insular cluster produces
    ///     one observation per cooldown window rather than one per action.
    /// - **Spam signal** (cluster of one, §6.1): records a
    ///   [`behavioral::SpamClusterSignal`] for the spam-attestation /
    ///   space-health side in either mode. No community forms.
    ///
    /// Callers must gate this behind `NodeConfig::behavioral_branching_mode()`
    /// — detection is local-only until SPEC_13 §7 consensus messages land.
    ///
    /// # Arguments
    /// * `space_id` - Space the action occurred in
    /// * `action` - Normalized clustering view of the action
    /// * `current_height` - Current chain height (for age/cooldown gates)
    /// * `timestamp` - Current timestamp (for branch metadata / event updates)
    /// * `mode` - Whether a qualifying cluster fractures ([`ClusteringMode::Full`])
    ///   or is only logged ([`ClusteringMode::LogOnly`])
    pub fn process_action_for_clustering_with_mode(
        &self,
        space_id: &[u8; 32],
        action: &ClusteringAction,
        current_height: u64,
        timestamp: u64,
        mode: ClusteringMode,
    ) -> Result<ClusterOutcome, BranchError> {
        behavioral::update_metrics_for_action(self.store, space_id, action, current_height)?;

        let outcome = behavioral::check_threshold_crossing(
            self.store,
            space_id,
            &action.author(),
            current_height,
        )?;

        match (mode, outcome) {
            (ClusteringMode::Full, ClusterOutcome::Community(mut formation)) => {
                let community_branch =
                    self.execute_behavioral_fracture(space_id, &formation, timestamp)?;
                formation.community_branch = Some(community_branch);
                self.store.record_community_formation(&formation)?;
                self.store
                    .put_last_formation_height(space_id, current_height)?;
                Ok(ClusterOutcome::Community(formation))
            }
            (ClusteringMode::LogOnly, ClusterOutcome::Community(formation)) => {
                // Phase 1 (log-only): record the would-be formation for
                // observation. No fracture executes and no space/branch is
                // created. The cooldown is still advanced so this mirrors
                // Full mode's cadence -- one observation per cooldown window
                // per space, not one per subsequent qualifying action.
                let event = BehavioralEvent::from_formation(&formation, timestamp);
                self.store.record_behavioral_event(&event)?;
                self.store
                    .put_last_formation_height(space_id, current_height)?;
                Ok(ClusterOutcome::Community(formation))
            }
            (_, ClusterOutcome::SpamSignal(signal)) => {
                self.store.record_spam_cluster_signal(&signal)?;
                Ok(ClusterOutcome::SpamSignal(signal))
            }
            (_, ClusterOutcome::None) => Ok(ClusterOutcome::None),
        }
    }

    /// Execute a behavioral fracture along a community boundary (SPEC_13).
    ///
    /// Unlike [`Self::execute_fracture`] (SPEC_08 size trigger, hash-bit
    /// assignment), threads are assigned by **cluster membership**: threads
    /// whose author is a founding member go to the RIGHT (community) child,
    /// everything else — including threads whose author cannot be resolved —
    /// goes to the LEFT (remainder) child.
    ///
    /// The fractured branch is the active branch holding the most
    /// community-authored threads (deterministic tie-break: shallowest depth,
    /// then lexicographic path). Existing community branches are never
    /// re-fractured behaviorally, and `MAX_DEPTH` is respected.
    ///
    /// As with size fractures, only index pointers change — ContentBlock data
    /// is not moved (§13.2/§13.6: no content migration).
    ///
    /// # Returns
    /// The community child branch path.
    pub fn execute_behavioral_fracture(
        &self,
        space_id: &[u8; 32],
        formation: &CommunityFormation,
        timestamp: u64,
    ) -> Result<BranchPath, BranchError> {
        self.ensure_space_initialized(space_id, timestamp)?;

        let mut state = self
            .store
            .get_space_branch_state(space_id)?
            .unwrap_or_else(SpaceBranchState::new);

        let members: BTreeSet<[u8; 32]> = formation.founding_members.iter().copied().collect();

        // 1. Pick the target branch deterministically.
        let mut candidates: Vec<BranchPath> = state.active_branches.clone();
        candidates.sort_by(|a, b| a.depth.cmp(&b.depth).then_with(|| a.path.cmp(&b.path)));

        let mut target: Option<BranchPath> = None;
        let mut best_count: usize = 0;
        for branch in &candidates {
            if branch.depth >= BranchPath::MAX_DEPTH {
                continue;
            }
            if self
                .store
                .get_community_for_branch(space_id, branch)?
                .is_some()
            {
                continue;
            }
            let threads = self.store.get_threads_in_branch(space_id, branch)?;
            let count = threads
                .iter()
                .filter(|(thread_id, _)| {
                    self.store
                        .get_content_author(thread_id)
                        .ok()
                        .flatten()
                        .is_some_and(|a| members.contains(&a))
                })
                .count();
            if target.is_none() || count > best_count {
                target = Some(branch.clone());
                best_count = count;
            }
        }

        let target = target.ok_or_else(|| {
            BranchError::FractureError(
                "no eligible branch for behavioral fracture (all at max depth or community-owned)"
                    .to_string(),
            )
        })?;

        // 2. Create child branches: LEFT = remainder, RIGHT = community.
        let remainder_child = target.branch(BranchDirection::Left);
        let community_child = target.branch(BranchDirection::Right);

        // 3. Reassign threads by cluster membership.
        let threads = self.store.get_threads_in_branch(space_id, &target)?;
        let mut community_size: u64 = 0;
        let mut community_count: u32 = 0;
        let mut remainder_size: u64 = 0;
        let mut remainder_count: u32 = 0;

        for (thread_id, size) in &threads {
            let in_community = self
                .store
                .get_content_author(thread_id)?
                .is_some_and(|a| members.contains(&a));

            self.store
                .delete_thread_branch(space_id, thread_id, &target)?;

            if in_community {
                self.store
                    .put_thread_branch(space_id, thread_id, &community_child)?;
                community_size += size;
                community_count += 1;
            } else {
                self.store
                    .put_thread_branch(space_id, thread_id, &remainder_child)?;
                remainder_size += size;
                remainder_count += 1;
            }
        }

        // 4. Create child branch metadata, delete parent metadata.
        let remainder_meta = BranchMetadata {
            branch_path: remainder_child.clone(),
            total_size: remainder_size,
            thread_count: remainder_count,
            last_updated: timestamp,
        };
        let community_meta = BranchMetadata {
            branch_path: community_child.clone(),
            total_size: community_size,
            thread_count: community_count,
            last_updated: timestamp,
        };
        self.store.put_branch_metadata(space_id, &remainder_meta)?;
        self.store.put_branch_metadata(space_id, &community_meta)?;
        self.store.delete_branch_metadata(space_id, &target)?;

        // 5. Update SpaceBranchState.
        state.active_branches.retain(|p| p != &target);
        state.active_branches.push(remainder_child);
        state.active_branches.push(community_child.clone());

        let new_depth = target.depth + 1;
        if new_depth > state.max_depth {
            state.max_depth = new_depth;
        }
        self.store.put_space_branch_state(space_id, &state)?;

        // 6. Index the community branch so routing can honor membership.
        self.store
            .put_community_branch(space_id, &community_child, &formation.community_id)?;

        Ok(community_child)
    }

    /// Assign branch for a NEW thread with community-aware routing (SPEC_13).
    ///
    /// Routing rules (§13.2: only new posts route to the community):
    /// 1. If the author belongs to a community in this space, the thread goes
    ///    to the community branch (or the hash-resolved leaf under it, if the
    ///    community branch has since size-fractured).
    /// 2. Otherwise hash-bit assignment applies; if the hash lands inside a
    ///    community subtree, the thread is deterministically redirected to
    ///    the community branch's sibling (remainder) subtree.
    ///
    /// With no communities in the space this behaves identically to
    /// [`Self::assign_branch_for_new_thread`].
    pub fn assign_branch_for_new_thread_with_author(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        author: Option<&[u8; 32]>,
    ) -> Result<BranchPath, BranchError> {
        let state = self
            .store
            .get_space_branch_state(space_id)?
            .unwrap_or_else(SpaceBranchState::new);

        if state.max_depth == 0 {
            return Ok(BranchPath::root());
        }

        let community_branches = self.store.get_community_branches(space_id)?;

        // 1. Community members: route into their community subtree.
        if let Some(author) = author {
            if let Some(community_id) = self.store.get_identity_community(space_id, author)? {
                if let Some((base, _)) = community_branches
                    .iter()
                    .find(|(_, cid)| cid == &community_id)
                {
                    if let Some(leaf) =
                        Self::resolve_active_leaf_under(&state, base, thread_root_id)
                    {
                        return Ok(leaf);
                    }
                }
            }
        }

        // 2. Non-members: hash-bit assignment, redirected out of community subtrees.
        for active_branch in &state.active_branches {
            if Self::hash_matches_branch(thread_root_id, active_branch) {
                if let Some((community_base, _)) = community_branches
                    .iter()
                    .find(|(base, _)| Self::is_prefix_of(base, active_branch))
                {
                    // Redirect to the community branch's sibling subtree.
                    if let Some(sibling) = Self::sibling_path(community_base) {
                        if let Some(leaf) =
                            Self::resolve_active_leaf_under(&state, &sibling, thread_root_id)
                        {
                            return Ok(leaf);
                        }
                    }
                }
                return Ok(active_branch.clone());
            }
        }

        // Fallback mirrors assign_branch_for_new_thread.
        Err(BranchError::NotLeafBranch {
            branch_path: BranchPath::from_thread_root(thread_root_id, state.max_depth),
        })
    }

    /// Resolve the branch path to stamp on a mempool action (SPEC_08 §4).
    ///
    /// Rules:
    /// 1. Thread already indexed on-chain → inherit its branch (replies,
    ///    engagements and edits stay with their thread, [`BranchPath::for_reply`]).
    /// 2. Otherwise treat as a new thread → hash-derived active leaf for the
    ///    space (community-aware when `author` is given).
    ///
    /// Infallible by design: any storage/assignment error falls back to the
    /// root path. The stamped path is a placement hint committed into the
    /// block hash; the authoritative placement index is maintained by
    /// [`Self::register_built_block`] from chain data, so a stale stamp can
    /// never diverge placement across nodes.
    #[must_use]
    pub fn resolve_mempool_branch_path(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        author: Option<&[u8; 32]>,
    ) -> BranchPath {
        if let Ok(Some(existing)) = self.store.get_thread_branch(space_id, thread_root_id) {
            return BranchPath::for_reply(&existing);
        }
        self.assign_branch_for_new_thread_with_author(space_id, thread_root_id, author)
            .unwrap_or_else(|_| BranchPath::root())
    }

    /// Register an already-built content block with the branch indexes.
    ///
    /// Unlike [`BranchAwareStore::put_content_block`](super::BranchAwareStore),
    /// this NEVER mutates the block: built blocks are hash-committed (the
    /// `branch_path` field is part of the content block hash, which the space
    /// block merkle root commits to), so placement is tracked purely in the
    /// local indexes. Used by every production write path — locally formed
    /// blocks and blocks received from the network — so that size tracking
    /// and the 50MB fracture run identically on all nodes.
    ///
    /// Placement is a pure function of chain data processed in chain order:
    /// - thread already indexed → continuation (branch inherited);
    /// - unindexed thread → hash-derived active leaf. This also lazily
    ///   migrates pre-branching chains where nothing was ever indexed.
    ///
    /// Metadata timestamps use `block.timestamp` (never wall time) so replay
    /// and live processing produce byte-identical branch state.
    ///
    /// # Returns
    /// (assigned_branch_path, fracture_triggered)
    pub fn register_built_block(
        &self,
        block: &crate::blocks::ContentBlock,
    ) -> Result<(BranchPath, bool), BranchError> {
        let timestamp = block.timestamp;
        self.ensure_space_initialized(&block.space_id, timestamp)?;

        let author = block.actions.first().map(|a| a.actor);

        // Continuation if the thread is already indexed; otherwise this block
        // starts (or lazily migrates) the thread.
        let existing = self
            .store
            .get_thread_branch(&block.space_id, &block.thread_root_id)?;
        let (path, is_new_thread) = match existing {
            Some(p) => (p, false),
            None => {
                let assigned = self.assign_branch_for_new_thread_with_author(
                    &block.space_id,
                    &block.thread_root_id,
                    author.as_ref(),
                )?;
                self.store
                    .put_thread_branch(&block.space_id, &block.thread_root_id, &assigned)?;
                (assigned, true)
            }
        };

        let serialized_size = bincode::serialized_size(block)?;

        self.store
            .update_thread_size(&block.space_id, &block.thread_root_id, serialized_size)?;

        let mut metadata = self
            .store
            .get_branch_metadata(&block.space_id, &path)?
            .unwrap_or_else(|| BranchMetadata::new_empty(path.clone(), timestamp));
        metadata.total_size += serialized_size;
        if is_new_thread {
            metadata.thread_count += 1;
        }
        metadata.last_updated = timestamp;
        self.store.put_branch_metadata(&block.space_id, &metadata)?;

        let fracture_triggered = if self.needs_fracture(&block.space_id, &path)? {
            self.execute_fracture(&block.space_id, &path, timestamp)?;
            true
        } else {
            false
        };

        Ok((path, fracture_triggered))
    }

    /// Register a content block with community-aware branch assignment.
    ///
    /// Identical to [`Self::register_content_block`] except new threads are
    /// assigned via [`Self::assign_branch_for_new_thread_with_author`], so
    /// community members' new threads land in their community branch (§13.2).
    pub fn register_content_block_with_author(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
        is_new_thread: bool,
        serialized_size: u64,
        timestamp: u64,
        author: Option<&[u8; 32]>,
    ) -> Result<(BranchPath, bool), BranchError> {
        // 1. Ensure space is initialized
        self.ensure_space_initialized(space_id, timestamp)?;

        // 2. Get or assign branch path
        let path = if is_new_thread {
            let assigned =
                self.assign_branch_for_new_thread_with_author(space_id, thread_root_id, author)?;
            self.store
                .put_thread_branch(space_id, thread_root_id, &assigned)?;
            assigned
        } else {
            self.assign_branch_for_reply(space_id, thread_root_id)?
        };

        // 3. Update thread size tracking
        self.store
            .update_thread_size(space_id, thread_root_id, serialized_size)?;

        // 4. Update branch metadata
        let mut metadata = self
            .store
            .get_branch_metadata(space_id, &path)?
            .unwrap_or_else(|| BranchMetadata::new_empty(path.clone(), timestamp));

        metadata.total_size += serialized_size;
        if is_new_thread {
            metadata.thread_count += 1;
        }
        metadata.last_updated = timestamp;
        self.store.put_branch_metadata(space_id, &metadata)?;

        // 5. Check for fracture trigger (size-based, SPEC_08)
        let fracture_triggered = if self.needs_fracture(space_id, &path)? {
            self.execute_fracture(space_id, &path, timestamp)?;
            true
        } else {
            false
        };

        Ok((path, fracture_triggered))
    }

    /// Get the bit of a branch path at a given depth (0 = left, 1 = right).
    fn branch_bit(path: &BranchPath, depth: u8) -> u8 {
        let byte_index = (depth / 8) as usize;
        let bit_index = 7 - (depth % 8);
        if byte_index < path.path.len() {
            (path.path[byte_index] >> bit_index) & 1
        } else {
            0
        }
    }

    /// Check if `prefix` is a prefix of (or equal to) `other` in the branch tree.
    fn is_prefix_of(prefix: &BranchPath, other: &BranchPath) -> bool {
        if prefix.depth > other.depth {
            return false;
        }
        (0..prefix.depth).all(|d| Self::branch_bit(prefix, d) == Self::branch_bit(other, d))
    }

    /// Get the sibling of a branch (same parent, flipped last bit).
    fn sibling_path(path: &BranchPath) -> Option<BranchPath> {
        if path.depth == 0 {
            return None;
        }
        let mut sibling = path.clone();
        let last = path.depth - 1;
        let byte_index = (last / 8) as usize;
        let bit_index = 7 - (last % 8);
        if byte_index >= sibling.path.len() {
            return None;
        }
        sibling.path[byte_index] ^= 1 << bit_index;
        Some(sibling)
    }

    /// Check if hash bits from `from_depth` up to `branch.depth` match the
    /// branch's path bits (ignoring bits above `from_depth`).
    fn hash_matches_from(hash: &[u8; 32], branch: &BranchPath, from_depth: u8) -> bool {
        (from_depth..branch.depth).all(|d| {
            let bit = Self::branch_bit(branch, d);
            match BranchPath::direction_at(hash, d) {
                BranchDirection::Left => bit == 0,
                BranchDirection::Right => bit == 1,
            }
        })
    }

    /// Find the active leaf under `base` selected by the hash bits beyond
    /// `base.depth`. Returns `base` itself if it is still an active leaf.
    fn resolve_active_leaf_under(
        state: &SpaceBranchState,
        base: &BranchPath,
        hash: &[u8; 32],
    ) -> Option<BranchPath> {
        state
            .active_branches
            .iter()
            .find(|active| {
                Self::is_prefix_of(base, active)
                    && Self::hash_matches_from(hash, active, base.depth)
            })
            .cloned()
    }

    /// Get the branch for a thread (by thread_root_id)
    pub fn get_thread_branch(
        &self,
        space_id: &[u8; 32],
        thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        self.store
            .get_thread_branch(space_id, thread_root_id)?
            .ok_or(BranchError::ThreadNotFound {
                thread_root_id: *thread_root_id,
            })
    }

    /// Resolve engagement target's branch
    ///
    /// Per SPEC_08 §4.3: Engagements go to the TARGET content's branch.
    ///
    /// # Arguments
    /// * `space_id` - Space containing the content
    /// * `target_thread_root_id` - Thread root of the content being engaged
    ///
    /// # Returns
    /// The branch path where the engagement should be recorded
    pub fn resolve_engagement_branch(
        &self,
        space_id: &[u8; 32],
        target_thread_root_id: &[u8; 32],
    ) -> Result<BranchPath, BranchError> {
        // Engagement goes to TARGET content's branch, not engager's location
        self.get_thread_branch(space_id, target_thread_root_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_branch_manager_new() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        assert_eq!(manager.fracture_threshold, BRANCH_FRACTURE_THRESHOLD);
    }

    #[test]
    fn test_branch_manager_with_threshold() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::with_threshold(&store, 1000);

        assert_eq!(manager.fracture_threshold, 1000);
    }

    #[test]
    fn test_new_thread_unfractured_space() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        let path = manager
            .assign_branch_for_new_thread(&space_id, &thread_id)
            .unwrap();
        assert_eq!(path, BranchPath::root());
    }

    #[test]
    fn test_reply_thread_not_found() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        let result = manager.assign_branch_for_reply(&space_id, &thread_id);
        assert!(matches!(result, Err(BranchError::ThreadNotFound { .. })));
    }

    #[test]
    fn test_register_content_block_initializes_space() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Register first block
        let (path, fractured) = manager
            .register_content_block(&space_id, &thread_id, true, 100, 1000)
            .unwrap();

        assert_eq!(path, BranchPath::root());
        assert!(!fractured);

        // Space should be initialized
        let state = store.get_space_branch_state(&space_id).unwrap();
        assert!(state.is_some());

        // Branch metadata should exist
        let metadata = store
            .get_branch_metadata(&space_id, &BranchPath::root())
            .unwrap();
        assert!(metadata.is_some());
        let metadata = metadata.unwrap();
        assert_eq!(metadata.thread_count, 1);
        assert_eq!(metadata.total_size, 100);
    }

    #[test]
    fn test_reply_inherits_thread_branch() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Register new thread
        let (thread_path, _) = manager
            .register_content_block(&space_id, &thread_id, true, 100, 1000)
            .unwrap();

        // Register reply (is_new_thread = false)
        let (reply_path, _) = manager
            .register_content_block(&space_id, &thread_id, false, 50, 1001)
            .unwrap();

        assert_eq!(reply_path, thread_path);

        // Thread count should still be 1 (reply doesn't add thread)
        let metadata = store
            .get_branch_metadata(&space_id, &BranchPath::root())
            .unwrap()
            .unwrap();
        assert_eq!(metadata.thread_count, 1);
        assert_eq!(metadata.total_size, 150); // 100 + 50
    }

    #[test]
    fn test_needs_fracture() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::with_threshold(&store, 500);

        let space_id = [1u8; 32];
        let thread_id = [2u8; 32];

        // Register block below threshold
        manager
            .register_content_block(&space_id, &thread_id, true, 400, 1000)
            .unwrap();

        assert!(!manager
            .needs_fracture(&space_id, &BranchPath::root())
            .unwrap());

        // Register block that pushes over threshold
        // Note: register_content_block triggers fracture automatically
        let mut thread_id2 = [0u8; 32];
        thread_id2[0] = 3;
        let (_, fractured) = manager
            .register_content_block(&space_id, &thread_id2, true, 200, 1001)
            .unwrap();

        // The fracture should have happened during registration
        assert!(
            fractured,
            "Fracture should have triggered during registration"
        );

        // After fracture, root branch no longer exists - it's been split
        // So needs_fracture on root returns false (branch doesn't exist)
        assert!(!manager
            .needs_fracture(&space_id, &BranchPath::root())
            .unwrap());
    }

    #[test]
    fn test_execute_fracture() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::with_threshold(&store, 100);

        let space_id = [1u8; 32];

        // Create threads with different first bits (for different branches)
        let thread_left = [0x00u8; 32]; // Bit 0 = 0 -> LEFT
        let thread_right = [0x80u8; 32]; // Bit 0 = 1 -> RIGHT

        // Register both threads
        manager
            .register_content_block(&space_id, &thread_left, true, 60, 1000)
            .unwrap();
        manager
            .register_content_block(&space_id, &thread_right, true, 60, 1001)
            .unwrap();

        // Should trigger fracture (120 > 100)
        let state = store.get_space_branch_state(&space_id).unwrap().unwrap();
        assert!(state.has_fractured());
        assert_eq!(state.max_depth, 1);
        assert_eq!(state.active_branches.len(), 2);

        // Verify thread assignments
        let left_branch = manager.get_thread_branch(&space_id, &thread_left).unwrap();
        let right_branch = manager.get_thread_branch(&space_id, &thread_right).unwrap();

        assert_eq!(
            left_branch,
            BranchPath::root().branch(BranchDirection::Left)
        );
        assert_eq!(
            right_branch,
            BranchPath::root().branch(BranchDirection::Right)
        );
    }

    #[test]
    fn test_resolve_engagement_branch() {
        let dir = tempdir().unwrap();
        let store = ChainStore::open(dir.path()).unwrap();
        let manager = BranchManager::new(&store);

        let space_id = [1u8; 32];
        let target_thread = [2u8; 32];

        // Register target thread
        manager
            .register_content_block(&space_id, &target_thread, true, 100, 1000)
            .unwrap();

        // Resolve engagement branch should return target's branch
        let engagement_branch = manager
            .resolve_engagement_branch(&space_id, &target_thread)
            .unwrap();

        assert_eq!(engagement_branch, BranchPath::root());
    }
}
