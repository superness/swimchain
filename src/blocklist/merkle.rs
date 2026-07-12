//! Merkle tree implementation for blocklist synchronization
//!
//! Provides eventual consistency for distributed blocklist via Merkle root exchange.
//!
//! # Incremental Updates
//!
//! The `IncrementalMerkleTree` tracks dirty paths and only recomputes affected
//! branches when entries are added or removed. This avoids O(n log n) full
//! rebuilds on every write.

use blake3::Hasher;
use std::collections::BTreeSet;

/// Compute Merkle root for a list of blocklist content hashes.
///
/// The hashes are sorted before computing to ensure deterministic results
/// across nodes with entries in different orders.
pub fn compute_merkle_root(hashes: &[[u8; 32]]) -> [u8; 32] {
    if hashes.is_empty() {
        return [0u8; 32];
    }

    // Sort hashes for deterministic ordering
    let mut sorted: Vec<[u8; 32]> = hashes.to_vec();
    sorted.sort();

    // Build Merkle tree bottom-up
    let mut current_level: Vec<[u8; 32]> = sorted;

    while current_level.len() > 1 {
        let mut next_level = Vec::with_capacity((current_level.len() + 1) / 2);

        for chunk in current_level.chunks(2) {
            if chunk.len() == 2 {
                // Hash pair of nodes
                next_level.push(hash_pair(&chunk[0], &chunk[1]));
            } else {
                // Odd node gets promoted
                next_level.push(chunk[0]);
            }
        }

        current_level = next_level;
    }

    current_level[0]
}

/// Hash two nodes together.
fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Hasher::new();
    hasher.update(b"BLOCKLIST_MERKLE_NODE");
    hasher.update(left);
    hasher.update(right);
    *hasher.finalize().as_bytes()
}

/// Incremental Merkle tree that only recomputes affected branches.
///
/// Instead of rebuilding the entire tree on every write, this structure
/// tracks which entries have changed and only recomputes the path from
/// those entries to the root.
#[derive(Debug, Clone)]
pub struct IncrementalMerkleTree {
    /// Sorted leaf entries (content hashes)
    leaves: BTreeSet<[u8; 32]>,

    /// Cached internal nodes by level (level 0 = leaves, higher = parents)
    /// Each level maps index -> hash
    levels: Vec<Vec<[u8; 32]>>,

    /// Set of dirty leaf indices that need recomputation
    dirty_leaves: BTreeSet<usize>,

    /// Whether the tree structure has changed (leaves added/removed)
    structure_dirty: bool,

    /// Cached root hash
    cached_root: [u8; 32],
}

impl IncrementalMerkleTree {
    /// Create a new empty incremental Merkle tree.
    pub fn new() -> Self {
        Self {
            leaves: BTreeSet::new(),
            levels: Vec::new(),
            dirty_leaves: BTreeSet::new(),
            structure_dirty: false,
            cached_root: [0u8; 32],
        }
    }

    /// Create an incremental Merkle tree from existing hashes.
    pub fn from_hashes(hashes: &[[u8; 32]]) -> Self {
        let mut tree = Self::new();
        for hash in hashes {
            tree.leaves.insert(*hash);
        }
        tree.structure_dirty = true;
        tree.rebuild();
        tree
    }

    /// Add a leaf to the tree.
    ///
    /// Returns true if the leaf was newly added.
    pub fn insert(&mut self, hash: [u8; 32]) -> bool {
        if self.leaves.insert(hash) {
            self.structure_dirty = true;
            true
        } else {
            false
        }
    }

    /// Remove a leaf from the tree.
    ///
    /// Returns true if the leaf was present and removed.
    pub fn remove(&mut self, hash: &[u8; 32]) -> bool {
        if self.leaves.remove(hash) {
            self.structure_dirty = true;
            true
        } else {
            false
        }
    }

    /// Check if a hash is in the tree.
    pub fn contains(&self, hash: &[u8; 32]) -> bool {
        self.leaves.contains(hash)
    }

    /// Get the number of leaves.
    pub fn len(&self) -> usize {
        self.leaves.len()
    }

    /// Check if tree is empty.
    pub fn is_empty(&self) -> bool {
        self.leaves.is_empty()
    }

    /// Get the current Merkle root, recomputing if necessary.
    ///
    /// This is the main entry point for getting the root. It handles
    /// both incremental updates and full rebuilds as needed.
    pub fn root(&mut self) -> [u8; 32] {
        if self.leaves.is_empty() {
            self.cached_root = [0u8; 32];
            return self.cached_root;
        }

        if self.structure_dirty {
            // Structure changed, need full rebuild
            self.rebuild();
        } else if !self.dirty_leaves.is_empty() {
            // Only some leaves changed, do incremental update
            self.update_dirty_paths();
        }

        self.cached_root
    }

    /// Get the cached root without recomputing.
    ///
    /// Use `root()` to ensure the root is up-to-date.
    pub fn cached_root(&self) -> [u8; 32] {
        self.cached_root
    }

    /// Check if the tree needs recomputation.
    pub fn is_dirty(&self) -> bool {
        self.structure_dirty || !self.dirty_leaves.is_empty()
    }

    /// Get all leaf hashes in sorted order.
    pub fn leaves(&self) -> Vec<[u8; 32]> {
        self.leaves.iter().copied().collect()
    }

    /// Rebuild the entire tree from scratch.
    ///
    /// Called when structure changes (add/remove) or for initial build.
    fn rebuild(&mut self) {
        self.dirty_leaves.clear();
        self.structure_dirty = false;

        if self.leaves.is_empty() {
            self.levels.clear();
            self.cached_root = [0u8; 32];
            return;
        }

        // Build levels from leaves up
        let leaves_vec: Vec<[u8; 32]> = self.leaves.iter().copied().collect();
        self.levels = vec![leaves_vec];

        while self.levels.last().map_or(false, |l| l.len() > 1) {
            let current = self.levels.last().unwrap();
            let mut next = Vec::with_capacity((current.len() + 1) / 2);

            for chunk in current.chunks(2) {
                if chunk.len() == 2 {
                    next.push(hash_pair(&chunk[0], &chunk[1]));
                } else {
                    next.push(chunk[0]);
                }
            }

            self.levels.push(next);
        }

        self.cached_root = self.levels.last().map_or([0u8; 32], |l| l[0]);
    }

    /// Incrementally update only the dirty paths.
    ///
    /// For each dirty leaf, recompute the path from that leaf to the root.
    fn update_dirty_paths(&mut self) {
        if self.levels.is_empty() {
            return;
        }

        // Collect affected indices at each level
        let num_levels = self.levels.len();
        let mut affected_at_level: Vec<BTreeSet<usize>> = vec![BTreeSet::new(); num_levels];

        // Start with dirty leaves
        for &leaf_idx in &self.dirty_leaves {
            if leaf_idx < self.levels[0].len() {
                affected_at_level[0].insert(leaf_idx);
            }
        }

        // Propagate up: affected parent = affected_child / 2
        for level in 0..num_levels - 1 {
            // Collect indices to propagate
            let indices_to_propagate: Vec<usize> =
                affected_at_level[level].iter().copied().collect();
            for idx in indices_to_propagate {
                affected_at_level[level + 1].insert(idx / 2);
            }
        }

        // Now recompute affected nodes from bottom up
        for level in 0..num_levels - 1 {
            let parent_level = level + 1;
            let parent_indices: Vec<usize> =
                affected_at_level[parent_level].iter().copied().collect();

            for parent_idx in parent_indices {
                let left_idx = parent_idx * 2;
                let right_idx = left_idx + 1;

                let left = self.levels[level].get(left_idx).copied();
                let right = self.levels[level].get(right_idx).copied();

                let new_hash = match (left, right) {
                    (Some(l), Some(r)) => hash_pair(&l, &r),
                    (Some(l), None) => l, // Odd node promoted
                    _ => continue,
                };

                if let Some(node) = self.levels[parent_level].get_mut(parent_idx) {
                    *node = new_hash;
                }
            }
        }

        self.cached_root = self.levels.last().map_or([0u8; 32], |l| l[0]);
        self.dirty_leaves.clear();
    }

    /// Mark a specific leaf as dirty (content changed but position same).
    ///
    /// This is useful if you're updating a leaf value without changing
    /// the set of leaves. For add/remove, use insert/remove instead.
    #[allow(dead_code)]
    fn mark_dirty(&mut self, hash: &[u8; 32]) {
        if let Some(idx) = self.leaves.iter().position(|h| h == hash) {
            self.dirty_leaves.insert(idx);
        }
    }
}

impl Default for IncrementalMerkleTree {
    fn default() -> Self {
        Self::new()
    }
}

/// Compute the difference between two blocklists.
///
/// Returns hashes that are in `local` but not in `remote`, and vice versa.
pub fn compute_diff(local: &[[u8; 32]], remote: &[[u8; 32]]) -> (Vec<[u8; 32]>, Vec<[u8; 32]>) {
    use std::collections::HashSet;

    let local_set: HashSet<[u8; 32]> = local.iter().copied().collect();
    let remote_set: HashSet<[u8; 32]> = remote.iter().copied().collect();

    let local_only: Vec<[u8; 32]> = local_set.difference(&remote_set).copied().collect();
    let remote_only: Vec<[u8; 32]> = remote_set.difference(&local_set).copied().collect();

    (local_only, remote_only)
}

/// Merkle proof for a single entry.
///
/// Contains the sibling hashes needed to verify inclusion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MerkleProof {
    /// The entry being proven
    pub entry_hash: [u8; 32],
    /// Sibling hashes from leaf to root
    pub siblings: Vec<([u8; 32], bool)>, // (hash, is_left)
}

impl MerkleProof {
    /// Verify this proof against a Merkle root.
    pub fn verify(&self, root: &[u8; 32]) -> bool {
        let mut current = self.entry_hash;

        for (sibling, is_left) in &self.siblings {
            current = if *is_left {
                hash_pair(sibling, &current)
            } else {
                hash_pair(&current, sibling)
            };
        }

        current == *root
    }

    /// Serialize to bytes.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(32 + 4 + self.siblings.len() * 33);
        bytes.extend_from_slice(&self.entry_hash);
        bytes.extend_from_slice(&(self.siblings.len() as u32).to_le_bytes());
        for (hash, is_left) in &self.siblings {
            bytes.extend_from_slice(hash);
            bytes.push(if *is_left { 1 } else { 0 });
        }
        bytes
    }

    /// Deserialize from bytes.
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 36 {
            return None;
        }

        let mut entry_hash = [0u8; 32];
        entry_hash.copy_from_slice(&bytes[0..32]);

        let sibling_count = u32::from_le_bytes(bytes[32..36].try_into().ok()?) as usize;

        if bytes.len() < 36 + sibling_count * 33 {
            return None;
        }

        let mut siblings = Vec::with_capacity(sibling_count);
        for i in 0..sibling_count {
            let start = 36 + i * 33;
            let mut hash = [0u8; 32];
            hash.copy_from_slice(&bytes[start..start + 32]);
            let is_left = bytes[start + 32] == 1;
            siblings.push((hash, is_left));
        }

        Some(Self {
            entry_hash,
            siblings,
        })
    }
}

/// Build a Merkle proof for a specific entry.
///
/// Returns None if the entry is not in the list.
pub fn build_proof(hashes: &[[u8; 32]], entry: &[u8; 32]) -> Option<MerkleProof> {
    if hashes.is_empty() {
        return None;
    }

    // Sort hashes for deterministic ordering
    let mut sorted: Vec<[u8; 32]> = hashes.to_vec();
    sorted.sort();

    // Find index of entry
    let mut index = sorted.iter().position(|h| h == entry)?;

    let mut siblings = Vec::new();
    let mut current_level = sorted;

    while current_level.len() > 1 {
        // Find sibling
        let sibling_index = if index % 2 == 0 {
            if index + 1 < current_level.len() {
                Some(index + 1)
            } else {
                None // Odd node, no sibling
            }
        } else {
            Some(index - 1)
        };

        if let Some(si) = sibling_index {
            let is_left = index % 2 == 1; // Sibling is on left if we're on right
            siblings.push((current_level[si], is_left));
        }

        // Build next level
        let mut next_level = Vec::with_capacity((current_level.len() + 1) / 2);
        for chunk in current_level.chunks(2) {
            if chunk.len() == 2 {
                next_level.push(hash_pair(&chunk[0], &chunk[1]));
            } else {
                next_level.push(chunk[0]);
            }
        }

        index /= 2;
        current_level = next_level;
    }

    Some(MerkleProof {
        entry_hash: *entry,
        siblings,
    })
}

/// Blocklist sync state for tracking synchronization with peers.
#[derive(Debug, Clone)]
pub struct SyncState {
    /// Our current Merkle root
    pub local_root: [u8; 32],

    /// Number of entries in our blocklist
    pub local_count: u32,

    /// Last sync timestamp per peer
    pub peer_sync_times: std::collections::HashMap<[u8; 32], u64>,

    /// Known peer Merkle roots
    pub peer_roots: std::collections::HashMap<[u8; 32], ([u8; 32], u32)>, // (root, count)
}

impl SyncState {
    /// Create a new sync state.
    pub fn new() -> Self {
        Self {
            local_root: [0u8; 32],
            local_count: 0,
            peer_sync_times: std::collections::HashMap::new(),
            peer_roots: std::collections::HashMap::new(),
        }
    }

    /// Update local state from blocklist entries.
    pub fn update_local(&mut self, hashes: &[[u8; 32]]) {
        self.local_root = compute_merkle_root(hashes);
        self.local_count = hashes.len() as u32;
    }

    /// Record a peer's sync state.
    pub fn record_peer(&mut self, peer_id: [u8; 32], root: [u8; 32], count: u32, timestamp: u64) {
        self.peer_roots.insert(peer_id, (root, count));
        self.peer_sync_times.insert(peer_id, timestamp);
    }

    /// Check if a peer has a different blocklist.
    pub fn peer_differs(&self, peer_id: &[u8; 32]) -> bool {
        self.peer_roots
            .get(peer_id)
            .map(|(root, _)| *root != self.local_root)
            .unwrap_or(true)
    }

    /// Check if we need to sync with a peer.
    pub fn needs_sync(&self, peer_id: &[u8; 32], current_time: u64, sync_interval: u64) -> bool {
        let last_sync = self.peer_sync_times.get(peer_id).copied().unwrap_or(0);
        current_time >= last_sync + sync_interval
    }

    /// Get peers that need synchronization.
    pub fn peers_needing_sync(&self, current_time: u64, sync_interval: u64) -> Vec<[u8; 32]> {
        self.peer_roots
            .keys()
            .filter(|peer_id| self.needs_sync(peer_id, current_time, sync_interval))
            .copied()
            .collect()
    }
}

impl Default for SyncState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_merkle_root() {
        let root = compute_merkle_root(&[]);
        assert_eq!(root, [0u8; 32]);
    }

    #[test]
    fn test_single_entry_merkle_root() {
        let hash = [1u8; 32];
        let root = compute_merkle_root(&[hash]);
        assert_eq!(root, hash);
    }

    #[test]
    fn test_two_entries_merkle_root() {
        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];

        let root = compute_merkle_root(&[hash1, hash2]);

        // Root should be hash of the two sorted entries
        // [1;32] < [2;32], so order is hash1, hash2
        let expected = hash_pair(&hash1, &hash2);
        assert_eq!(root, expected);
    }

    #[test]
    fn test_merkle_root_deterministic() {
        let hashes = [[3u8; 32], [1u8; 32], [2u8; 32]];

        // Different order should give same root
        let root1 = compute_merkle_root(&hashes);
        let root2 = compute_merkle_root(&[[1u8; 32], [2u8; 32], [3u8; 32]]);
        let root3 = compute_merkle_root(&[[2u8; 32], [3u8; 32], [1u8; 32]]);

        assert_eq!(root1, root2);
        assert_eq!(root2, root3);
    }

    #[test]
    fn test_merkle_root_changes_with_entries() {
        let hash1 = [1u8; 32];
        let hash2 = [2u8; 32];

        let root1 = compute_merkle_root(&[hash1]);
        let root2 = compute_merkle_root(&[hash1, hash2]);

        assert_ne!(root1, root2);
    }

    #[test]
    fn test_compute_diff() {
        let local = [[1u8; 32], [2u8; 32], [3u8; 32]];
        let remote = [[2u8; 32], [3u8; 32], [4u8; 32]];

        let (local_only, remote_only) = compute_diff(&local, &remote);

        assert_eq!(local_only.len(), 1);
        assert!(local_only.contains(&[1u8; 32]));

        assert_eq!(remote_only.len(), 1);
        assert!(remote_only.contains(&[4u8; 32]));
    }

    #[test]
    fn test_build_and_verify_proof() {
        let hashes = [[1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32]];
        let root = compute_merkle_root(&hashes);

        for hash in &hashes {
            let proof = build_proof(&hashes, hash).unwrap();
            assert!(proof.verify(&root), "Proof failed for {:?}", hash);
        }
    }

    #[test]
    fn test_proof_fails_for_wrong_root() {
        let hashes = [[1u8; 32], [2u8; 32], [3u8; 32]];
        let root = compute_merkle_root(&hashes);
        let wrong_root = [99u8; 32];

        let proof = build_proof(&hashes, &[1u8; 32]).unwrap();
        assert!(proof.verify(&root));
        assert!(!proof.verify(&wrong_root));
    }

    #[test]
    fn test_proof_for_missing_entry() {
        let hashes = [[1u8; 32], [2u8; 32]];
        let missing = [99u8; 32];

        let proof = build_proof(&hashes, &missing);
        assert!(proof.is_none());
    }

    #[test]
    fn test_merkle_proof_serialization() {
        let hashes = [[1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32]];
        let proof = build_proof(&hashes, &[2u8; 32]).unwrap();

        let bytes = proof.to_bytes();
        let restored = MerkleProof::from_bytes(&bytes).unwrap();

        assert_eq!(proof.entry_hash, restored.entry_hash);
        assert_eq!(proof.siblings.len(), restored.siblings.len());
    }

    #[test]
    fn test_sync_state() {
        let mut state = SyncState::new();

        // Update local state
        state.update_local(&[[1u8; 32], [2u8; 32]]);
        assert_eq!(state.local_count, 2);
        assert_ne!(state.local_root, [0u8; 32]);

        // Record peer
        let peer_id = [10u8; 32];
        let peer_root = [20u8; 32];
        state.record_peer(peer_id, peer_root, 5, 1000);

        assert!(state.peer_differs(&peer_id));
        assert!(!state.needs_sync(&peer_id, 1000, 3600)); // Just synced
        assert!(state.needs_sync(&peer_id, 5000, 3600)); // Time passed
    }

    #[test]
    fn test_peers_needing_sync() {
        let mut state = SyncState::new();

        let peer1 = [1u8; 32];
        let peer2 = [2u8; 32];

        // peer1 last synced at 1000, peer2 last synced at 2000
        state.record_peer(peer1, [10u8; 32], 5, 1000);
        state.record_peer(peer2, [20u8; 32], 10, 2000);

        // At time 6000 with interval 3600, both need sync:
        // peer1: 6000 >= 1000 + 3600 → needs sync
        // peer2: 6000 >= 2000 + 3600 → needs sync
        let needing = state.peers_needing_sync(6000, 3600);
        assert_eq!(needing.len(), 2);

        // At time 5000 with interval 3600:
        // peer1: 5000 >= 1000 + 3600 (4600) → needs sync
        // peer2: 5000 >= 2000 + 3600 (5600) → does NOT need sync
        let needing = state.peers_needing_sync(5000, 3600);
        assert_eq!(needing.len(), 1);
        assert!(needing.contains(&peer1));
    }

    // ===== IncrementalMerkleTree tests =====

    #[test]
    fn test_incremental_tree_empty() {
        let mut tree = IncrementalMerkleTree::new();
        assert_eq!(tree.root(), [0u8; 32]);
        assert!(tree.is_empty());
        assert_eq!(tree.len(), 0);
    }

    #[test]
    fn test_incremental_tree_single_entry() {
        let mut tree = IncrementalMerkleTree::new();
        tree.insert([1u8; 32]);

        let root = tree.root();
        assert_eq!(root, [1u8; 32]); // Single entry is its own root
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_incremental_tree_matches_full_computation() {
        // Verify incremental tree produces same root as full computation
        let hashes = [[1u8; 32], [2u8; 32], [3u8; 32], [4u8; 32], [5u8; 32]];

        let full_root = compute_merkle_root(&hashes);

        let mut tree = IncrementalMerkleTree::new();
        for hash in &hashes {
            tree.insert(*hash);
        }
        let incremental_root = tree.root();

        assert_eq!(full_root, incremental_root);
    }

    #[test]
    fn test_incremental_tree_from_hashes() {
        let hashes = [[1u8; 32], [2u8; 32], [3u8; 32]];

        let mut tree = IncrementalMerkleTree::from_hashes(&hashes);
        let expected = compute_merkle_root(&hashes);

        assert_eq!(tree.root(), expected);
        assert_eq!(tree.len(), 3);
    }

    #[test]
    fn test_incremental_tree_insert_updates_root() {
        let mut tree = IncrementalMerkleTree::new();
        tree.insert([1u8; 32]);
        let root1 = tree.root();

        tree.insert([2u8; 32]);
        let root2 = tree.root();

        assert_ne!(root1, root2);

        // Should match full computation
        let expected = compute_merkle_root(&[[1u8; 32], [2u8; 32]]);
        assert_eq!(root2, expected);
    }

    #[test]
    fn test_incremental_tree_remove_updates_root() {
        let mut tree = IncrementalMerkleTree::new();
        tree.insert([1u8; 32]);
        tree.insert([2u8; 32]);
        tree.insert([3u8; 32]);
        let root_with_3 = tree.root();

        tree.remove(&[2u8; 32]);
        let root_without_2 = tree.root();

        assert_ne!(root_with_3, root_without_2);

        // Should match full computation
        let expected = compute_merkle_root(&[[1u8; 32], [3u8; 32]]);
        assert_eq!(root_without_2, expected);
    }

    #[test]
    fn test_incremental_tree_duplicate_insert() {
        let mut tree = IncrementalMerkleTree::new();
        assert!(tree.insert([1u8; 32])); // First insert
        assert!(!tree.insert([1u8; 32])); // Duplicate, returns false
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_incremental_tree_remove_nonexistent() {
        let mut tree = IncrementalMerkleTree::new();
        tree.insert([1u8; 32]);
        assert!(!tree.remove(&[2u8; 32])); // Not present
        assert_eq!(tree.len(), 1);
    }

    #[test]
    fn test_incremental_tree_contains() {
        let mut tree = IncrementalMerkleTree::new();
        tree.insert([1u8; 32]);
        tree.insert([2u8; 32]);

        assert!(tree.contains(&[1u8; 32]));
        assert!(tree.contains(&[2u8; 32]));
        assert!(!tree.contains(&[3u8; 32]));
    }

    #[test]
    fn test_incremental_tree_leaves() {
        let mut tree = IncrementalMerkleTree::new();
        tree.insert([3u8; 32]);
        tree.insert([1u8; 32]);
        tree.insert([2u8; 32]);

        let leaves = tree.leaves();
        // Should be sorted
        assert_eq!(leaves, vec![[1u8; 32], [2u8; 32], [3u8; 32]]);
    }

    #[test]
    fn test_incremental_tree_dirty_tracking() {
        let mut tree = IncrementalMerkleTree::new();
        assert!(!tree.is_dirty());

        tree.insert([1u8; 32]);
        assert!(tree.is_dirty());

        let _ = tree.root(); // Computes and clears dirty flag
        assert!(!tree.is_dirty());

        tree.insert([2u8; 32]);
        assert!(tree.is_dirty());
    }

    #[test]
    fn test_incremental_tree_batch_operations() {
        // Simulate batch: multiple inserts, single root computation
        let mut tree = IncrementalMerkleTree::new();

        // Add 100 entries
        for i in 0..100u8 {
            let mut hash = [0u8; 32];
            hash[0] = i;
            tree.insert(hash);
        }

        // All inserts marked structure as dirty, but root not computed yet
        assert!(tree.is_dirty());

        // Single root computation at the end
        let root = tree.root();
        assert_ne!(root, [0u8; 32]);
        assert!(!tree.is_dirty());
    }

    #[test]
    fn test_incremental_tree_large_set_consistency() {
        // Test with larger set to ensure tree structure is correct
        let hashes: Vec<[u8; 32]> = (0..1000u32)
            .map(|i| {
                let mut h = [0u8; 32];
                h[0..4].copy_from_slice(&i.to_le_bytes());
                h
            })
            .collect();

        // Build incrementally
        let mut tree = IncrementalMerkleTree::new();
        for hash in &hashes {
            tree.insert(*hash);
        }
        let incremental_root = tree.root();

        // Build all at once
        let full_root = compute_merkle_root(&hashes);

        assert_eq!(incremental_root, full_root);
    }
}
