//! Simulated node with seen cache integration
//!
//! NodeHandle represents a single node in the test network,
//! maintaining its own chain state and seen cache.

use super::mock_chain::MockBlock;
use std::collections::HashSet;

/// Current chain tip information
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChainTip {
    /// Height of the tip block
    pub height: u64,
    /// Hash of the tip block
    pub hash: [u8; 32],
}

impl Default for ChainTip {
    fn default() -> Self {
        Self {
            height: 0,
            hash: [0u8; 32],
        }
    }
}

/// A simulated node in the test network
pub struct NodeHandle {
    /// Unique identifier for this node (0-indexed)
    pub node_id: usize,
    /// Seen cache for duplicate detection
    seen_cache: HashSet<[u8; 32]>,
    /// Current chain tip
    tip: ChainTip,
    /// All blocks this node has applied
    blocks: Vec<MockBlock>,
    /// Receive timestamps for each block (block_height, time_ms)
    receive_times_ms: Vec<(usize, u64)>,
    /// Whether this node is offline
    offline: bool,
}

impl NodeHandle {
    /// Create a new node with the given ID
    pub fn new(node_id: usize) -> Self {
        Self {
            node_id,
            seen_cache: HashSet::with_capacity(1000),
            tip: ChainTip::default(),
            blocks: Vec::new(),
            receive_times_ms: Vec::new(),
            offline: false,
        }
    }

    /// Apply a block if it extends the current tip
    ///
    /// Returns true if the block was applied, false otherwise.
    /// A block is applied if:
    /// 1. It's the genesis block (height 0) and we have no blocks
    /// 2. It extends our current tip (height == tip.height + 1 && prev_hash == tip.hash)
    pub fn apply_block(&mut self, block: &MockBlock, received_at_ms: u64) -> bool {
        if self.offline {
            return false;
        }

        // Accept genesis at height 0 if we have no blocks
        if block.height == 0 && self.blocks.is_empty() {
            self.blocks.push(block.clone());
            self.tip = ChainTip {
                height: 0,
                hash: block.hash,
            };
            self.receive_times_ms.push((0, received_at_ms));
            return true;
        }

        // Reject if not extending current tip
        if block.height != self.tip.height + 1 || block.prev_hash != self.tip.hash {
            return false;
        }

        // Reject duplicates (by hash)
        if self.blocks.iter().any(|b| b.hash == block.hash) {
            return false;
        }

        self.blocks.push(block.clone());
        self.tip = ChainTip {
            height: block.height,
            hash: block.hash,
        };
        self.receive_times_ms
            .push((block.height as usize, received_at_ms));
        true
    }

    /// Get the current chain tip
    pub fn chain_tip(&self) -> &ChainTip {
        &self.tip
    }

    /// Check if a content ID has been seen
    pub fn has_seen(&self, content_id: &[u8; 32]) -> bool {
        self.seen_cache.contains(content_id)
    }

    /// Mark a content ID as seen
    ///
    /// Returns true if newly marked, false if already seen.
    pub fn mark_seen(&mut self, content_id: [u8; 32]) -> bool {
        // HashSet::insert returns true if the value was NOT present
        self.seen_cache.insert(content_id)
    }

    /// Get all blocks this node has
    pub fn blocks(&self) -> &[MockBlock] {
        &self.blocks
    }

    /// Get receive times for all blocks
    pub fn receive_times(&self) -> &[(usize, u64)] {
        &self.receive_times_ms
    }

    /// Check if this node has a specific block
    pub fn has_block(&self, hash: &[u8; 32]) -> bool {
        self.blocks.iter().any(|b| &b.hash == hash)
    }

    /// Get the height of this node's chain
    pub fn height(&self) -> u64 {
        self.tip.height
    }

    /// Set node offline status
    pub fn set_offline(&mut self, offline: bool) {
        self.offline = offline;
    }

    /// Check if node is offline
    pub fn is_offline(&self) -> bool {
        self.offline
    }

    /// Reset the node to initial state
    pub fn reset(&mut self) {
        self.tip = ChainTip::default();
        self.blocks.clear();
        self.receive_times_ms.clear();
        self.seen_cache.clear();
        self.offline = false;
    }

    /// Clear the seen cache
    pub fn clear_seen_cache(&mut self) {
        self.seen_cache.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_creation() {
        let node = NodeHandle::new(5);
        assert_eq!(node.node_id, 5);
        assert_eq!(node.height(), 0);
        assert!(node.blocks().is_empty());
    }

    #[test]
    fn test_apply_genesis_block() {
        let mut node = NodeHandle::new(0);
        let genesis = MockBlock::genesis(1);

        assert!(node.apply_block(&genesis, 0));
        assert_eq!(node.height(), 0);
        assert_eq!(node.chain_tip().hash, genesis.hash);
        assert_eq!(node.blocks().len(), 1);
    }

    #[test]
    fn test_apply_extending_block() {
        let mut node = NodeHandle::new(0);
        let genesis = MockBlock::genesis(1);
        let block1 = genesis.next(2);

        assert!(node.apply_block(&genesis, 0));
        assert!(node.apply_block(&block1, 100));
        assert_eq!(node.height(), 1);
        assert_eq!(node.chain_tip().hash, block1.hash);
    }

    #[test]
    fn test_reject_non_extending_block() {
        let mut node = NodeHandle::new(0);
        let genesis = MockBlock::genesis(1);
        let block1 = genesis.next(2);
        let block2 = block1.next(3);

        assert!(node.apply_block(&genesis, 0));
        // Try to apply block2 without block1
        assert!(!node.apply_block(&block2, 100));
        assert_eq!(node.height(), 0);
    }

    #[test]
    fn test_seen_cache() {
        let mut node = NodeHandle::new(0);
        let content_id = [0xab; 32];

        assert!(!node.has_seen(&content_id));
        assert!(node.mark_seen(content_id));
        assert!(node.has_seen(&content_id));
        assert!(!node.mark_seen(content_id)); // Already seen
    }

    #[test]
    fn test_receive_times() {
        let mut node = NodeHandle::new(0);
        let genesis = MockBlock::genesis(1);
        let block1 = genesis.next(2);

        node.apply_block(&genesis, 100);
        node.apply_block(&block1, 200);

        let times = node.receive_times();
        assert_eq!(times.len(), 2);
        assert_eq!(times[0], (0, 100));
        assert_eq!(times[1], (1, 200));
    }

    #[test]
    fn test_offline_node() {
        let mut node = NodeHandle::new(0);
        let genesis = MockBlock::genesis(1);

        node.set_offline(true);
        assert!(!node.apply_block(&genesis, 0));
        assert!(node.is_offline());

        node.set_offline(false);
        assert!(node.apply_block(&genesis, 0));
    }

    #[test]
    fn test_reset() {
        let mut node = NodeHandle::new(0);
        let genesis = MockBlock::genesis(1);

        node.apply_block(&genesis, 0);
        node.mark_seen([0x11; 32]);
        node.set_offline(true);

        node.reset();

        assert_eq!(node.height(), 0);
        assert!(node.blocks().is_empty());
        assert!(!node.has_seen(&[0x11; 32]));
        assert!(!node.is_offline());
    }
}
