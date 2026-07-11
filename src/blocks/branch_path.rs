//! Branch path for parent-anchored threading (SPEC_08 §4)
//!
//! BranchPath determines where in the tree structure a thread/content belongs.
//! This enables:
//! - Replies staying with their parent thread
//! - Deterministic placement based on content hash
//! - Efficient tree navigation
//!
//! # How It Works
//!
//! 1. Thread roots get a path based on their content hash
//! 2. Replies inherit the parent's path (staying together)
//! 3. The path is used for tree placement during block building

/// Direction in the binary tree
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum BranchDirection {
    /// Left branch (bit = 0)
    Left,
    /// Right branch (bit = 1)
    Right,
}

/// Branch path for tree placement (SPEC_08 §4)
///
/// A path through the binary tree structure, determining where
/// content should be placed.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct BranchPath {
    /// Depth in the tree (0 = root level)
    pub depth: u8,
    /// Path bits (each bit represents left/right at that level)
    pub path: Vec<u8>,
}

impl BranchPath {
    /// Maximum depth allowed
    pub const MAX_DEPTH: u8 = 255;

    /// Create root-level path
    #[must_use]
    pub fn root() -> Self {
        Self {
            depth: 0,
            path: vec![],
        }
    }

    /// Create path from thread root content hash (SPEC_08 §4)
    ///
    /// Derives the placement path by walking the hash bits from the root:
    /// bit `i` of the hash selects Left/Right at depth `i`, down to `depth`.
    /// `depth` is the fracture depth of the space (0 = unfractured, which
    /// yields the root path). This is a pure function of `(hash, depth)`,
    /// so every node derives the identical placement from chain data alone.
    #[must_use]
    pub fn from_thread_root(hash: &[u8; 32], depth: u8) -> Self {
        let mut path = Self::root();
        for d in 0..depth {
            path = path.branch(Self::direction_at(hash, d));
        }
        path
    }

    /// Get direction at a specific depth
    ///
    /// Uses the hash bits to determine direction
    #[must_use]
    pub fn direction_at(hash: &[u8; 32], depth: u8) -> BranchDirection {
        let byte_index = (depth / 8) as usize;
        let bit_index = 7 - (depth % 8);

        if byte_index >= hash.len() {
            return BranchDirection::Left;
        }

        if (hash[byte_index] >> bit_index) & 1 == 0 {
            BranchDirection::Left
        } else {
            BranchDirection::Right
        }
    }

    /// Branch from current path
    ///
    /// Creates a new path one level deeper in the specified direction
    #[must_use]
    pub fn branch(&self, direction: BranchDirection) -> Self {
        if self.depth == Self::MAX_DEPTH {
            return self.clone();
        }

        let mut new_path = self.path.clone();
        let byte_index = (self.depth / 8) as usize;
        let bit_index = 7 - (self.depth % 8);

        // Extend path if needed
        while new_path.len() <= byte_index {
            new_path.push(0);
        }

        // Set bit for direction
        match direction {
            BranchDirection::Left => {
                // Bit stays 0
            }
            BranchDirection::Right => {
                new_path[byte_index] |= 1 << bit_index;
            }
        }

        Self {
            depth: self.depth + 1,
            path: new_path,
        }
    }

    /// Create path for a reply (inherits parent's path)
    ///
    /// Replies stay with their parent, so they use the same path
    #[must_use]
    pub fn for_reply(parent_path: &BranchPath) -> Self {
        parent_path.clone()
    }

    /// Check if this path is a descendant of another
    #[must_use]
    pub fn is_descendant_of(&self, ancestor: &BranchPath) -> bool {
        if self.depth < ancestor.depth {
            return false;
        }

        // Check that all ancestor bits match
        for i in 0..ancestor.depth {
            let byte_index = (i / 8) as usize;
            let bit_index = 7 - (i % 8);

            let self_bit = self
                .path
                .get(byte_index)
                .map_or(0, |b| (b >> bit_index) & 1);
            let ancestor_bit = ancestor
                .path
                .get(byte_index)
                .map_or(0, |b| (b >> bit_index) & 1);

            if self_bit != ancestor_bit {
                return false;
            }
        }

        true
    }

    /// Serialize for inclusion in block hash
    ///
    /// Returns: [depth(1)] || [path_bytes]
    #[must_use]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(1 + self.path.len());
        buf.push(self.depth);
        buf.extend_from_slice(&self.path);
        buf
    }

    /// Deserialize from bytes
    #[must_use]
    pub fn deserialize(data: &[u8]) -> Option<Self> {
        if data.is_empty() {
            return None;
        }
        let depth = data[0];
        let path = data[1..].to_vec();
        Some(Self { depth, path })
    }

    /// Get depth in tree
    #[must_use]
    pub fn depth(&self) -> u8 {
        self.depth
    }

    /// Check if this is a root path
    #[must_use]
    pub fn is_root(&self) -> bool {
        self.depth == 0
    }
}

impl Default for BranchPath {
    fn default() -> Self {
        Self::root()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_direction_at_left() {
        // Hash starting with 0x00 means first bit is 0 (Left)
        let hash = [0x00u8; 32];
        assert_eq!(BranchPath::direction_at(&hash, 0), BranchDirection::Left);
    }

    #[test]
    fn test_direction_at_right() {
        // Hash starting with 0x80 means first bit is 1 (Right)
        let mut hash = [0x00u8; 32];
        hash[0] = 0x80;
        assert_eq!(BranchPath::direction_at(&hash, 0), BranchDirection::Right);
    }

    #[test]
    fn test_direction_at_various_depths() {
        let hash = [0b10110001u8; 32];
        // Bit 0: 1 (Right)
        assert_eq!(BranchPath::direction_at(&hash, 0), BranchDirection::Right);
        // Bit 1: 0 (Left)
        assert_eq!(BranchPath::direction_at(&hash, 1), BranchDirection::Left);
        // Bit 2: 1 (Right)
        assert_eq!(BranchPath::direction_at(&hash, 2), BranchDirection::Right);
        // Bit 3: 1 (Right)
        assert_eq!(BranchPath::direction_at(&hash, 3), BranchDirection::Right);
        // Bit 4: 0 (Left)
        assert_eq!(BranchPath::direction_at(&hash, 4), BranchDirection::Left);
    }

    #[test]
    fn test_root_path() {
        let path = BranchPath::root();
        assert_eq!(path.depth, 0);
        assert!(path.path.is_empty());
        assert!(path.is_root());
    }

    #[test]
    fn test_branch_left() {
        let root = BranchPath::root();
        let left = root.branch(BranchDirection::Left);
        assert_eq!(left.depth, 1);
        assert!(!left.path.is_empty());
        // First bit should be 0
        assert_eq!(left.path[0] & 0x80, 0);
    }

    #[test]
    fn test_branch_right() {
        let root = BranchPath::root();
        let right = root.branch(BranchDirection::Right);
        assert_eq!(right.depth, 1);
        assert!(!right.path.is_empty());
        // First bit should be 1
        assert_eq!(right.path[0] & 0x80, 0x80);
    }

    #[test]
    fn test_reply_inherits_parent_path() {
        let parent = BranchPath::root()
            .branch(BranchDirection::Left)
            .branch(BranchDirection::Right);
        let reply = BranchPath::for_reply(&parent);
        assert_eq!(reply, parent);
    }

    #[test]
    fn test_is_descendant_of() {
        let root = BranchPath::root();
        let level1 = root.branch(BranchDirection::Left);
        let level2 = level1.branch(BranchDirection::Right);

        assert!(level1.is_descendant_of(&root));
        assert!(level2.is_descendant_of(&root));
        assert!(level2.is_descendant_of(&level1));
        assert!(!root.is_descendant_of(&level1));
        assert!(!level1.is_descendant_of(&level2));
    }

    #[test]
    fn test_serialize_deserialize_roundtrip() {
        let path = BranchPath::root()
            .branch(BranchDirection::Left)
            .branch(BranchDirection::Right)
            .branch(BranchDirection::Right);

        let serialized = path.serialize();
        let deserialized = BranchPath::deserialize(&serialized).unwrap();

        assert_eq!(path, deserialized);
    }

    #[test]
    fn test_deserialize_empty() {
        assert!(BranchPath::deserialize(&[]).is_none());
    }

    #[test]
    fn test_from_thread_root_depth_zero_is_root() {
        let hash = [0x42u8; 32];
        let path = BranchPath::from_thread_root(&hash, 0);
        // Unfractured space: everything lives at the root branch
        assert_eq!(path, BranchPath::root());
    }

    #[test]
    fn test_from_thread_root_follows_hash_bits() {
        // 0b1011_0001 -> Right, Left, Right, Right at depths 0..4
        let hash = [0b1011_0001u8; 32];
        let expected = BranchPath::root()
            .branch(BranchDirection::Right)
            .branch(BranchDirection::Left)
            .branch(BranchDirection::Right)
            .branch(BranchDirection::Right);
        assert_eq!(BranchPath::from_thread_root(&hash, 4), expected);
    }

    #[test]
    fn test_from_thread_root_deterministic() {
        let hash = [0xA7u8; 32];
        for depth in 0..16 {
            assert_eq!(
                BranchPath::from_thread_root(&hash, depth),
                BranchPath::from_thread_root(&hash, depth),
            );
        }
    }

    #[test]
    fn test_from_thread_root_prefix_consistency() {
        // Deeper derivations must be descendants of shallower ones
        let hash = [0x5Cu8; 32];
        let shallow = BranchPath::from_thread_root(&hash, 3);
        let deep = BranchPath::from_thread_root(&hash, 9);
        assert!(deep.is_descendant_of(&shallow));
        // Every derived bit matches direction_at
        for d in 0..9u8 {
            let expected_bit = match BranchPath::direction_at(&hash, d) {
                BranchDirection::Left => 0,
                BranchDirection::Right => 1,
            };
            let byte_index = (d / 8) as usize;
            let bit_index = 7 - (d % 8);
            let actual_bit = (deep.path[byte_index] >> bit_index) & 1;
            assert_eq!(actual_bit, expected_bit, "bit mismatch at depth {d}");
        }
    }

    #[test]
    fn test_branch_max_depth() {
        let mut path = BranchPath::root();
        for _ in 0..255 {
            path = path.branch(BranchDirection::Left);
        }
        assert_eq!(path.depth, 255);

        // Should not increase beyond max
        let same = path.branch(BranchDirection::Left);
        assert_eq!(same.depth, 255);
    }
}
