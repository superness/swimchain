//! Peer Branch Tracking (BRANCH_SELECTIVE_SYNC.md §5.2)
//!
//! Tracks which branches each peer serves, enabling efficient peer
//! selection for branch-selective sync.
//!
//! # Design
//!
//! This is kept separate from `PeerEntry` to:
//! - Maintain backwards compatibility with existing peer cache format
//! - Allow branch info to be updated frequently without rewriting peer entries
//! - Enable efficient branch→peer lookups
//!
//! # Example
//!
//! ```no_run
//! use swimchain::discovery::peer_branches::PeerBranchTracker;
//! use swimchain::blocks::BranchPath;
//!
//! let mut tracker = PeerBranchTracker::new();
//!
//! let peer_id = [1u8; 32];
//! let space_id = [2u8; 32];
//! let branch = BranchPath::root();
//!
//! // Record that peer serves this branch
//! tracker.add_branch(peer_id, space_id, branch.clone());
//!
//! // Find peers serving a branch
//! let peers = tracker.peers_for_branch(&space_id, &branch);
//! ```

use crate::blocks::BranchPath;
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

/// Information about branches a peer serves
#[derive(Debug, Clone)]
pub struct PeerBranchInfo {
    /// Peer identifier (typically derived from their public key or connection info)
    pub peer_id: [u8; 32],
    /// Branches this peer serves: Map<space_id, Set<serialized_branch_path>>
    pub branches: HashMap<[u8; 32], HashSet<Vec<u8>>>,
    /// When this info was last updated
    pub last_update: u64,
    /// Whether peer supports branch-selective sync protocol
    pub supports_branch_sync: bool,
}

impl PeerBranchInfo {
    /// Create new peer branch info
    pub fn new(peer_id: [u8; 32]) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            peer_id,
            branches: HashMap::new(),
            last_update: now,
            supports_branch_sync: false,
        }
    }

    /// Add a branch this peer serves
    pub fn add_branch(&mut self, space_id: [u8; 32], branch: BranchPath) {
        let path_key = branch.serialize();
        self.branches.entry(space_id).or_default().insert(path_key);
        self.touch();
    }

    /// Remove a branch this peer no longer serves
    pub fn remove_branch(&mut self, space_id: &[u8; 32], branch: &BranchPath) {
        let path_key = branch.serialize();
        if let Some(space_branches) = self.branches.get_mut(space_id) {
            space_branches.remove(&path_key);
            if space_branches.is_empty() {
                self.branches.remove(space_id);
            }
        }
        self.touch();
    }

    /// Check if peer serves a specific branch
    pub fn serves_branch(&self, space_id: &[u8; 32], branch: &BranchPath) -> bool {
        let path_key = branch.serialize();
        self.branches
            .get(space_id)
            .map_or(false, |branches| branches.contains(&path_key))
    }

    /// Get all branches this peer serves for a space
    pub fn branches_for_space(&self, space_id: &[u8; 32]) -> Vec<BranchPath> {
        self.branches
            .get(space_id)
            .map(|branches| {
                branches
                    .iter()
                    .filter_map(|path_key| BranchPath::deserialize(path_key))
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get all (space_id, branch_path) pairs this peer serves
    pub fn all_branches(&self) -> Vec<([u8; 32], BranchPath)> {
        let mut result = Vec::new();
        for (space_id, branches) in &self.branches {
            for path_key in branches {
                if let Some(branch) = BranchPath::deserialize(path_key) {
                    result.push((*space_id, branch));
                }
            }
        }
        result
    }

    /// Get count of branches served
    pub fn branch_count(&self) -> usize {
        self.branches.values().map(|set| set.len()).sum()
    }

    /// Clear all branches (e.g., when peer disconnects)
    pub fn clear_branches(&mut self) {
        self.branches.clear();
        self.touch();
    }

    /// Update last_update timestamp
    fn touch(&mut self) {
        self.last_update = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
    }

    /// Check if info is stale
    pub fn is_stale(&self, max_age_secs: u64) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        now.saturating_sub(self.last_update) > max_age_secs
    }
}

/// Tracks branch information for all known peers
#[derive(Debug, Default)]
pub struct PeerBranchTracker {
    /// Peer branch info keyed by peer_id
    peers: HashMap<[u8; 32], PeerBranchInfo>,

    /// Reverse index: (space_id, serialized_branch_path) -> Set<peer_id>
    branch_to_peers: HashMap<([u8; 32], Vec<u8>), HashSet<[u8; 32]>>,
}

impl PeerBranchTracker {
    /// Create a new tracker
    pub fn new() -> Self {
        Self::default()
    }

    /// Add or update a branch that a peer serves
    pub fn add_branch(&mut self, peer_id: [u8; 32], space_id: [u8; 32], branch: BranchPath) {
        let path_key = branch.serialize();

        // Update peer info
        let peer_info = self
            .peers
            .entry(peer_id)
            .or_insert_with(|| PeerBranchInfo::new(peer_id));
        peer_info.add_branch(space_id, branch);

        // Update reverse index
        self.branch_to_peers
            .entry((space_id, path_key))
            .or_default()
            .insert(peer_id);
    }

    /// Set that a peer supports branch-selective sync
    pub fn set_supports_branch_sync(&mut self, peer_id: [u8; 32], supports: bool) {
        let peer_info = self
            .peers
            .entry(peer_id)
            .or_insert_with(|| PeerBranchInfo::new(peer_id));
        peer_info.supports_branch_sync = supports;
    }

    /// Remove a branch from a peer's served list
    pub fn remove_branch(&mut self, peer_id: &[u8; 32], space_id: &[u8; 32], branch: &BranchPath) {
        let path_key = branch.serialize();

        // Update peer info
        if let Some(peer_info) = self.peers.get_mut(peer_id) {
            peer_info.remove_branch(space_id, branch);
        }

        // Update reverse index
        if let Some(peers) = self.branch_to_peers.get_mut(&(*space_id, path_key.clone())) {
            peers.remove(peer_id);
            if peers.is_empty() {
                self.branch_to_peers.remove(&(*space_id, path_key));
            }
        }
    }

    /// Remove all branch info for a peer (e.g., on disconnect)
    pub fn remove_peer(&mut self, peer_id: &[u8; 32]) {
        if let Some(peer_info) = self.peers.remove(peer_id) {
            // Clean up reverse index
            for (space_id, branches) in peer_info.branches {
                for path_key in branches {
                    if let Some(peers) = self.branch_to_peers.get_mut(&(space_id, path_key.clone()))
                    {
                        peers.remove(peer_id);
                        if peers.is_empty() {
                            self.branch_to_peers.remove(&(space_id, path_key));
                        }
                    }
                }
            }
        }
    }

    /// Get peers that serve a specific branch
    pub fn peers_for_branch(&self, space_id: &[u8; 32], branch: &BranchPath) -> Vec<[u8; 32]> {
        let path_key = branch.serialize();
        self.branch_to_peers
            .get(&(*space_id, path_key))
            .map(|peers| peers.iter().copied().collect())
            .unwrap_or_default()
    }

    /// Get peers that support branch-selective sync
    pub fn peers_supporting_branch_sync(&self) -> Vec<[u8; 32]> {
        self.peers
            .iter()
            .filter(|(_, info)| info.supports_branch_sync)
            .map(|(peer_id, _)| *peer_id)
            .collect()
    }

    /// Get peer info
    pub fn get_peer(&self, peer_id: &[u8; 32]) -> Option<&PeerBranchInfo> {
        self.peers.get(peer_id)
    }

    /// Check if we have any peers serving a branch
    pub fn has_peers_for_branch(&self, space_id: &[u8; 32], branch: &BranchPath) -> bool {
        let path_key = branch.serialize();
        self.branch_to_peers
            .get(&(*space_id, path_key))
            .map_or(false, |peers| !peers.is_empty())
    }

    /// Get number of tracked peers
    pub fn peer_count(&self) -> usize {
        self.peers.len()
    }

    /// Get number of unique branches being tracked
    pub fn branch_count(&self) -> usize {
        self.branch_to_peers.len()
    }

    /// Clean up stale peer info
    pub fn cleanup_stale(&mut self, max_age_secs: u64) {
        let stale_peers: Vec<_> = self
            .peers
            .iter()
            .filter(|(_, info)| info.is_stale(max_age_secs))
            .map(|(id, _)| *id)
            .collect();

        for peer_id in stale_peers {
            self.remove_peer(&peer_id);
        }
    }

    /// Update peer info from a branch inventory message
    pub fn update_from_inventory(
        &mut self,
        peer_id: [u8; 32],
        branches: Vec<([u8; 32], BranchPath)>,
    ) {
        // First, clear existing info for this peer
        self.remove_peer(&peer_id);

        // Set up new peer info
        let mut peer_info = PeerBranchInfo::new(peer_id);
        peer_info.supports_branch_sync = true;

        // Add all branches from inventory
        for (space_id, branch) in branches {
            let path_key = branch.serialize();

            // Add to peer info
            peer_info
                .branches
                .entry(space_id)
                .or_default()
                .insert(path_key.clone());

            // Add to reverse index
            self.branch_to_peers
                .entry((space_id, path_key))
                .or_default()
                .insert(peer_id);
        }

        self.peers.insert(peer_id, peer_info);
    }

    /// Get a summary of branch coverage (for debugging/monitoring)
    pub fn coverage_summary(&self) -> BranchCoverageSummary {
        let mut spaces: HashMap<[u8; 32], usize> = HashMap::new();
        let mut min_peers = usize::MAX;
        let mut max_peers = 0;
        let mut total_coverage = 0;

        for ((space_id, _), peers) in &self.branch_to_peers {
            *spaces.entry(*space_id).or_default() += 1;
            let peer_count = peers.len();
            min_peers = min_peers.min(peer_count);
            max_peers = max_peers.max(peer_count);
            total_coverage += peer_count;
        }

        if self.branch_to_peers.is_empty() {
            min_peers = 0;
        }

        BranchCoverageSummary {
            total_peers: self.peers.len(),
            total_branches: self.branch_to_peers.len(),
            total_spaces: spaces.len(),
            min_peers_per_branch: min_peers,
            max_peers_per_branch: max_peers,
            avg_peers_per_branch: if self.branch_to_peers.is_empty() {
                0.0
            } else {
                total_coverage as f64 / self.branch_to_peers.len() as f64
            },
        }
    }
}

/// Summary of branch coverage across peers
#[derive(Debug, Clone)]
pub struct BranchCoverageSummary {
    /// Total tracked peers
    pub total_peers: usize,
    /// Total unique branches
    pub total_branches: usize,
    /// Total unique spaces
    pub total_spaces: usize,
    /// Minimum peers serving any branch
    pub min_peers_per_branch: usize,
    /// Maximum peers serving any branch
    pub max_peers_per_branch: usize,
    /// Average peers per branch
    pub avg_peers_per_branch: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocks::BranchDirection;

    fn make_peer_id(n: u8) -> [u8; 32] {
        let mut id = [0u8; 32];
        id[0] = n;
        id
    }

    fn make_space_id(n: u8) -> [u8; 32] {
        let mut id = [0u8; 32];
        id[0] = n;
        id
    }

    #[test]
    fn test_peer_branch_info_basic() {
        let peer_id = make_peer_id(1);
        let mut info = PeerBranchInfo::new(peer_id);

        assert_eq!(info.branch_count(), 0);

        let space_id = make_space_id(1);
        let branch = BranchPath::root();

        info.add_branch(space_id, branch.clone());
        assert!(info.serves_branch(&space_id, &branch));
        assert_eq!(info.branch_count(), 1);

        info.remove_branch(&space_id, &branch);
        assert!(!info.serves_branch(&space_id, &branch));
        assert_eq!(info.branch_count(), 0);
    }

    #[test]
    fn test_peer_branch_info_multiple_branches() {
        let peer_id = make_peer_id(1);
        let mut info = PeerBranchInfo::new(peer_id);

        let space_id = make_space_id(1);
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);
        let right = root.branch(BranchDirection::Right);

        info.add_branch(space_id, root.clone());
        info.add_branch(space_id, left.clone());
        info.add_branch(space_id, right.clone());

        assert_eq!(info.branch_count(), 3);

        let branches = info.branches_for_space(&space_id);
        assert_eq!(branches.len(), 3);
    }

    #[test]
    fn test_tracker_add_remove() {
        let mut tracker = PeerBranchTracker::new();

        let peer_id = make_peer_id(1);
        let space_id = make_space_id(1);
        let branch = BranchPath::root();

        tracker.add_branch(peer_id, space_id, branch.clone());

        assert!(tracker.has_peers_for_branch(&space_id, &branch));
        let peers = tracker.peers_for_branch(&space_id, &branch);
        assert_eq!(peers.len(), 1);
        assert_eq!(peers[0], peer_id);

        tracker.remove_branch(&peer_id, &space_id, &branch);
        assert!(!tracker.has_peers_for_branch(&space_id, &branch));
    }

    #[test]
    fn test_tracker_multiple_peers_same_branch() {
        let mut tracker = PeerBranchTracker::new();

        let peer1 = make_peer_id(1);
        let peer2 = make_peer_id(2);
        let peer3 = make_peer_id(3);
        let space_id = make_space_id(1);
        let branch = BranchPath::root();

        tracker.add_branch(peer1, space_id, branch.clone());
        tracker.add_branch(peer2, space_id, branch.clone());
        tracker.add_branch(peer3, space_id, branch.clone());

        let peers = tracker.peers_for_branch(&space_id, &branch);
        assert_eq!(peers.len(), 3);
    }

    #[test]
    fn test_tracker_remove_peer() {
        let mut tracker = PeerBranchTracker::new();

        let peer_id = make_peer_id(1);
        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let branch = BranchPath::root();

        tracker.add_branch(peer_id, space1, branch.clone());
        tracker.add_branch(peer_id, space2, branch.clone());

        assert_eq!(tracker.peer_count(), 1);
        assert_eq!(tracker.branch_count(), 2);

        tracker.remove_peer(&peer_id);

        assert_eq!(tracker.peer_count(), 0);
        assert_eq!(tracker.branch_count(), 0);
        assert!(!tracker.has_peers_for_branch(&space1, &branch));
        assert!(!tracker.has_peers_for_branch(&space2, &branch));
    }

    #[test]
    fn test_tracker_update_from_inventory() {
        let mut tracker = PeerBranchTracker::new();

        let peer_id = make_peer_id(1);
        let space_id = make_space_id(1);
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);

        // Add initial branches
        tracker.add_branch(peer_id, space_id, root.clone());

        // Update with new inventory (should replace)
        tracker.update_from_inventory(peer_id, vec![(space_id, left.clone())]);

        // Should only have left now, not root
        assert!(!tracker.has_peers_for_branch(&space_id, &root));
        assert!(tracker.has_peers_for_branch(&space_id, &left));
    }

    #[test]
    fn test_tracker_supports_branch_sync() {
        let mut tracker = PeerBranchTracker::new();

        let peer1 = make_peer_id(1);
        let peer2 = make_peer_id(2);

        tracker.add_branch(peer1, make_space_id(1), BranchPath::root());
        tracker.add_branch(peer2, make_space_id(1), BranchPath::root());

        tracker.set_supports_branch_sync(peer1, true);
        tracker.set_supports_branch_sync(peer2, false);

        let supporting = tracker.peers_supporting_branch_sync();
        assert_eq!(supporting.len(), 1);
        assert_eq!(supporting[0], peer1);
    }

    #[test]
    fn test_coverage_summary() {
        let mut tracker = PeerBranchTracker::new();

        let peer1 = make_peer_id(1);
        let peer2 = make_peer_id(2);
        let space1 = make_space_id(1);
        let space2 = make_space_id(2);
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);

        // Peer 1 serves space1/root, space1/left, space2/root
        tracker.add_branch(peer1, space1, root.clone());
        tracker.add_branch(peer1, space1, left.clone());
        tracker.add_branch(peer1, space2, root.clone());

        // Peer 2 serves space1/root only
        tracker.add_branch(peer2, space1, root.clone());

        let summary = tracker.coverage_summary();
        assert_eq!(summary.total_peers, 2);
        assert_eq!(summary.total_branches, 3); // space1/root, space1/left, space2/root
        assert_eq!(summary.total_spaces, 2);
        assert_eq!(summary.min_peers_per_branch, 1); // space1/left and space2/root have 1 peer
        assert_eq!(summary.max_peers_per_branch, 2); // space1/root has 2 peers
    }
}
