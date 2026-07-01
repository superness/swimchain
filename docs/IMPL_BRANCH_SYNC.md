# Implementation Spec: Branch-Selective Sync

## Overview

This document provides concrete implementation details for branch-selective sync.
See `BRANCH_SELECTIVE_SYNC.md` for architecture overview.

---

## 1. New Constants

**File: `src/types/constants.rs`**

```rust
// === Branch-Selective Sync Messages (0x7B-0x7F) ===

/// Request blocks for a specific branch
pub const MSG_GETBLOCKS_BRANCH: u8 = 0x7B;

/// Subscribe to a branch (start receiving announcements)
pub const MSG_SUBSCRIBE_BRANCH: u8 = 0x7C;

/// Unsubscribe from a branch
pub const MSG_UNSUBSCRIBE_BRANCH: u8 = 0x7D;

/// Announce new content in a branch
pub const MSG_BRANCH_ANNOUNCE: u8 = 0x7E;

/// Response with branch subscription list
pub const MSG_BRANCH_INVENTORY: u8 = 0x7F;

// === Subscription Limits ===

/// Maximum branches a node can subscribe to
pub const MAX_BRANCH_SUBSCRIPTIONS: usize = 100;

/// Maximum branches to advertise per message
pub const MAX_BRANCH_INVENTORY: usize = 50;

/// Default storage budget for branch content (400MB)
pub const DEFAULT_BRANCH_STORAGE_BUDGET: u64 = 400 * 1024 * 1024;
```

---

## 2. New Message Payloads

**File: `src/network/messages.rs`**

```rust
use crate::blocks::BranchPath;

/// Request blocks for a specific space + branch
/// Wire size: 32 + branch_path_len + 19 bytes
#[derive(Debug, Clone)]
pub struct GetBlocksBranchPayload {
    /// Space ID (32 bytes)
    pub space_id: [u8; 32],
    /// Branch path within space
    pub branch_path: BranchPath,
    /// Starting block height
    pub start_height: u64,
    /// Ending block height (inclusive)
    pub end_height: u64,
    /// Include content blocks in response
    pub include_content: bool,
    /// Maximum blocks to return
    pub max_blocks: u16,
}

impl GetBlocksBranchPayload {
    pub fn new(
        space_id: [u8; 32],
        branch_path: BranchPath,
        start_height: u64,
        max_blocks: u16,
    ) -> Self {
        Self {
            space_id,
            branch_path,
            start_height,
            end_height: u64::MAX,
            include_content: true,
            max_blocks,
        }
    }
}

/// Subscribe to receive announcements for a branch
/// Wire size: 32 + branch_path_len bytes
#[derive(Debug, Clone)]
pub struct SubscribeBranchPayload {
    /// Space ID
    pub space_id: [u8; 32],
    /// Branch path
    pub branch_path: BranchPath,
}

/// Unsubscribe from a branch
/// Wire size: 32 + branch_path_len bytes
#[derive(Debug, Clone)]
pub struct UnsubscribeBranchPayload {
    /// Space ID
    pub space_id: [u8; 32],
    /// Branch path
    pub branch_path: BranchPath,
}

/// Announce new content in a branch (gossip)
/// Wire size: 32 + branch_path_len + 56 bytes
#[derive(Debug, Clone)]
pub struct BranchAnnouncePayload {
    /// Space ID
    pub space_id: [u8; 32],
    /// Branch path
    pub branch_path: BranchPath,
    /// Block hash containing the content
    pub block_hash: [u8; 32],
    /// Block height
    pub height: u64,
    /// Content block count in this branch for this block
    pub content_count: u32,
    /// Timestamp
    pub timestamp: u64,
}

/// Advertise which branches this peer serves
/// Wire size: variable (4 + entries * ~40 bytes each)
#[derive(Debug, Clone)]
pub struct BranchInventoryPayload {
    /// List of (space_id, branch_path) pairs this peer serves
    pub branches: Vec<(SpaceId, BranchPath)>,
}

/// Compact space ID for inventory (16 bytes)
pub type SpaceId = [u8; 16];
```

---

## 3. Serialization

**File: `src/network/serialize.rs`**

```rust
impl Serialize for GetBlocksBranchPayload {
    fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(64);
        buf.extend_from_slice(&self.space_id);
        buf.push(self.branch_path.depth);
        buf.extend_from_slice(&self.branch_path.path);
        buf.extend_from_slice(&self.start_height.to_be_bytes());
        buf.extend_from_slice(&self.end_height.to_be_bytes());
        buf.push(self.include_content as u8);
        buf.extend_from_slice(&self.max_blocks.to_be_bytes());
        buf
    }
}

impl Deserialize for GetBlocksBranchPayload {
    fn deserialize(data: &[u8]) -> Result<Self, DeserializeError> {
        if data.len() < 52 {
            return Err(DeserializeError::InsufficientData);
        }

        let space_id: [u8; 32] = data[0..32].try_into().unwrap();
        let depth = data[32];
        let path_len = (depth as usize + 7) / 8;

        if data.len() < 33 + path_len + 19 {
            return Err(DeserializeError::InsufficientData);
        }

        let path = data[33..33 + path_len].to_vec();
        let branch_path = BranchPath { depth, path };

        let offset = 33 + path_len;
        let start_height = u64::from_be_bytes(data[offset..offset + 8].try_into().unwrap());
        let end_height = u64::from_be_bytes(data[offset + 8..offset + 16].try_into().unwrap());
        let include_content = data[offset + 16] != 0;
        let max_blocks = u16::from_be_bytes(data[offset + 17..offset + 19].try_into().unwrap());

        Ok(Self {
            space_id,
            branch_path,
            start_height,
            end_height,
            include_content,
            max_blocks,
        })
    }
}

// Similar implementations for other payloads...
```

---

## 4. Subscription Manager

**File: `src/sync/subscription.rs` (NEW)**

```rust
use std::collections::{HashMap, HashSet};
use std::sync::RwLock;
use crate::blocks::BranchPath;

/// Manages branch subscriptions and storage budget
pub struct BranchSubscriptionManager {
    /// Active subscriptions: (space_id, branch_path) -> subscription info
    subscriptions: RwLock<HashMap<([u8; 32], BranchPath), SubscriptionInfo>>,

    /// Storage budget in bytes
    storage_budget: u64,

    /// Current storage used
    storage_used: RwLock<u64>,
}

#[derive(Debug, Clone)]
pub struct SubscriptionInfo {
    /// When we subscribed
    pub subscribed_at: u64,
    /// Last time we accessed content from this branch
    pub last_access: u64,
    /// Bytes stored for this branch
    pub storage_bytes: u64,
    /// Last synced block height
    pub last_synced_height: u64,
    /// Whether we're actively syncing
    pub sync_active: bool,
}

impl BranchSubscriptionManager {
    pub fn new(storage_budget: u64) -> Self {
        Self {
            subscriptions: RwLock::new(HashMap::new()),
            storage_budget,
            storage_used: RwLock::new(0),
        }
    }

    /// Subscribe to a branch
    pub fn subscribe(
        &self,
        space_id: [u8; 32],
        branch_path: BranchPath,
    ) -> Result<(), SubscriptionError> {
        let mut subs = self.subscriptions.write().unwrap();

        if subs.len() >= MAX_BRANCH_SUBSCRIPTIONS {
            return Err(SubscriptionError::TooManySubscriptions);
        }

        let key = (space_id, branch_path);
        if subs.contains_key(&key) {
            return Ok(()); // Already subscribed
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        subs.insert(key, SubscriptionInfo {
            subscribed_at: now,
            last_access: now,
            storage_bytes: 0,
            last_synced_height: 0,
            sync_active: true,
        });

        Ok(())
    }

    /// Unsubscribe from a branch
    pub fn unsubscribe(&self, space_id: [u8; 32], branch_path: BranchPath) {
        let mut subs = self.subscriptions.write().unwrap();
        let key = (space_id, branch_path);

        if let Some(info) = subs.remove(&key) {
            let mut used = self.storage_used.write().unwrap();
            *used = used.saturating_sub(info.storage_bytes);
        }
    }

    /// Check if subscribed to a branch
    pub fn is_subscribed(&self, space_id: &[u8; 32], branch_path: &BranchPath) -> bool {
        let subs = self.subscriptions.read().unwrap();
        subs.contains_key(&(*space_id, branch_path.clone()))
    }

    /// Record storage used by a branch
    pub fn add_storage(&self, space_id: [u8; 32], branch_path: BranchPath, bytes: u64) {
        let mut subs = self.subscriptions.write().unwrap();
        let key = (space_id, branch_path);

        if let Some(info) = subs.get_mut(&key) {
            info.storage_bytes += bytes;
            let mut used = self.storage_used.write().unwrap();
            *used += bytes;
        }
    }

    /// Get branches that need syncing
    pub fn get_sync_candidates(&self) -> Vec<([u8; 32], BranchPath, u64)> {
        let subs = self.subscriptions.read().unwrap();
        subs.iter()
            .filter(|(_, info)| info.sync_active)
            .map(|((space_id, branch), info)| (*space_id, branch.clone(), info.last_synced_height))
            .collect()
    }

    /// Make room by unsubscribing LRU branches
    pub fn make_room(&self, needed_bytes: u64) -> Vec<([u8; 32], BranchPath)> {
        let used = *self.storage_used.read().unwrap();
        let available = self.storage_budget.saturating_sub(used);

        if available >= needed_bytes {
            return vec![]; // Already have room
        }

        let to_free = needed_bytes - available;
        let mut freed = 0u64;
        let mut to_remove = vec![];

        // Sort by last_access (oldest first)
        let mut subs: Vec<_> = {
            let subs = self.subscriptions.read().unwrap();
            subs.iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        };
        subs.sort_by_key(|(_, info)| info.last_access);

        for ((space_id, branch), info) in subs {
            if freed >= to_free {
                break;
            }
            to_remove.push((space_id, branch));
            freed += info.storage_bytes;
        }

        // Actually unsubscribe
        for (space_id, branch) in &to_remove {
            self.unsubscribe(*space_id, branch.clone());
        }

        to_remove
    }

    /// Update last access time (call when user views content)
    pub fn touch(&self, space_id: [u8; 32], branch_path: BranchPath) {
        let mut subs = self.subscriptions.write().unwrap();
        let key = (space_id, branch_path);

        if let Some(info) = subs.get_mut(&key) {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs();
            info.last_access = now;
        }
    }

    /// Get all subscriptions
    pub fn list_subscriptions(&self) -> Vec<([u8; 32], BranchPath)> {
        let subs = self.subscriptions.read().unwrap();
        subs.keys().cloned().collect()
    }

    /// Get storage statistics
    pub fn storage_stats(&self) -> (u64, u64) {
        let used = *self.storage_used.read().unwrap();
        (used, self.storage_budget)
    }
}

#[derive(Debug)]
pub enum SubscriptionError {
    TooManySubscriptions,
    StorageBudgetExceeded,
}
```

---

## 5. Enhanced Peer Entry

**File: `src/discovery/peer_entry.rs`**

```rust
use crate::blocks::BranchPath;

#[derive(Debug, Clone)]
pub struct PeerEntry {
    pub wire_addr: WireAddr,
    pub last_success: u64,
    pub failures: u16,
    pub score: i16,
    pub first_seen: u64,

    // NEW: Branch service info
    /// Branches this peer serves (space_id, branch_path)
    pub serves_branches: Vec<([u8; 16], BranchPath)>,
    /// Last time we received branch inventory
    pub last_branch_update: u64,
}

impl PeerEntry {
    /// Check if peer serves a specific branch
    pub fn serves_branch(&self, space_id: &[u8; 16], branch: &BranchPath) -> bool {
        self.serves_branches.iter().any(|(s, b)| s == space_id && b == branch)
    }

    /// Update branch inventory from peer
    pub fn update_branch_inventory(&mut self, branches: Vec<([u8; 16], BranchPath)>) {
        self.serves_branches = branches;
        self.last_branch_update = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
    }
}
```

---

## 6. Router Handlers

**File: `src/node/router/router.rs`**

```rust
impl MessageRouter {
    /// Handle branch-filtered block request
    async fn handle_getblocks_branch(
        &self,
        payload: &[u8],
        peer_id: &[u8; 32],
    ) -> Result<Vec<u8>, RouterError> {
        let request = GetBlocksBranchPayload::deserialize(payload)?;

        let chain_store = self.chain_store.as_ref()
            .ok_or(RouterError::SubsystemUnavailable)?;

        // Get blocks filtered by space and branch
        let blocks = chain_store.get_blocks_for_branch(
            &request.space_id,
            &request.branch_path,
            request.start_height,
            request.end_height,
            request.max_blocks as usize,
            request.include_content,
        )?;

        let response = BlocksPayload { blocks };
        Ok(response.serialize())
    }

    /// Handle branch subscription request
    async fn handle_subscribe_branch(
        &self,
        payload: &[u8],
        peer_id: &[u8; 32],
    ) -> Result<(), RouterError> {
        let request = SubscribeBranchPayload::deserialize(payload)?;

        // Track that this peer wants announcements for this branch
        if let Some(peer_subs) = &self.peer_subscriptions {
            peer_subs.add_subscription(
                *peer_id,
                request.space_id,
                request.branch_path,
            );
        }

        Ok(())
    }

    /// Handle branch announcement (gossip)
    async fn handle_branch_announce(
        &self,
        payload: &[u8],
        peer_id: &[u8; 32],
    ) -> Result<(), RouterError> {
        let announce = BranchAnnouncePayload::deserialize(payload)?;

        // Check if we're subscribed to this branch
        if let Some(sub_manager) = &self.subscription_manager {
            if sub_manager.is_subscribed(&announce.space_id, &announce.branch_path) {
                // We care about this - request the block
                self.request_block(&announce.block_hash, peer_id).await?;
            }
        }

        // Forward to peers subscribed to this branch
        self.forward_branch_announce(&announce, peer_id).await?;

        Ok(())
    }

    /// Forward announcement to subscribed peers only
    async fn forward_branch_announce(
        &self,
        announce: &BranchAnnouncePayload,
        from_peer: &[u8; 32],
    ) -> Result<(), RouterError> {
        if let Some(peer_subs) = &self.peer_subscriptions {
            let subscribers = peer_subs.get_subscribers(
                &announce.space_id,
                &announce.branch_path,
            );

            for peer_id in subscribers {
                if &peer_id != from_peer {
                    // Send to subscriber
                    self.send_to_peer(&peer_id, MSG_BRANCH_ANNOUNCE, announce.serialize()).await?;
                }
            }
        }

        Ok(())
    }
}
```

---

## 7. Branch-Aware Sync Loop

**File: `src/node/tasks.rs`**

```rust
impl NodeManager {
    /// Spawn branch-aware sync loop
    pub fn spawn_branch_sync_loop(&mut self) {
        let subscription_manager = self.subscription_manager.clone();
        let peer_store = self.peer_store.clone();
        let connection_pool = self.connection_pool.clone();
        let chain_store = self.chain_store.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(30));

            loop {
                interval.tick().await;

                if let Some(sub_manager) = &subscription_manager {
                    // Get branches that need syncing
                    let candidates = sub_manager.get_sync_candidates();

                    for (space_id, branch_path, last_height) in candidates {
                        // Find peers that serve this branch
                        let peers = Self::find_peers_for_branch(
                            &peer_store,
                            &connection_pool,
                            &space_id[..16].try_into().unwrap(),
                            &branch_path,
                        ).await;

                        if peers.is_empty() {
                            debug!("[SYNC] No peers for branch {:?}", branch_path);
                            continue;
                        }

                        // Request blocks from first available peer
                        let request = GetBlocksBranchPayload::new(
                            space_id,
                            branch_path.clone(),
                            last_height + 1,
                            100,
                        );

                        for peer in peers.iter().take(2) {
                            if let Err(e) = peer.send_message(
                                MSG_GETBLOCKS_BRANCH,
                                request.serialize(),
                            ).await {
                                warn!("[SYNC] Failed to request branch blocks: {}", e);
                            } else {
                                break; // One request at a time
                            }
                        }
                    }
                }
            }
        });
    }

    /// Find peers serving a specific branch
    async fn find_peers_for_branch(
        peer_store: &Option<Arc<PeerStore>>,
        connection_pool: &Option<Arc<PeerConnectionPool>>,
        space_id: &[u8; 16],
        branch_path: &BranchPath,
    ) -> Vec<Arc<PeerConnection>> {
        let mut result = vec![];

        if let (Some(store), Some(pool)) = (peer_store, connection_pool) {
            let peers = store.get_peers_for_branch(space_id, branch_path);

            for peer_addr in peers {
                if let Some(conn) = pool.get_connection(&peer_addr).await {
                    result.push(conn);
                }
            }
        }

        result
    }
}
```

---

## 8. ChainStore Branch Query

**File: `src/storage/chain.rs`**

```rust
impl ChainStore {
    /// Get blocks filtered by space and branch
    pub fn get_blocks_for_branch(
        &self,
        space_id: &[u8; 32],
        branch_path: &BranchPath,
        start_height: u64,
        end_height: u64,
        max_blocks: usize,
        include_content: bool,
    ) -> Result<Vec<SerializedBlock>, StorageError> {
        let mut result = vec![];

        // Iterate through height range
        for height in start_height..=end_height {
            if result.len() >= max_blocks {
                break;
            }

            // Get root block at height
            if let Some(root_hash) = self.get_root_hash_at_height(height)? {
                if let Some(root_block) = self.get_root_block(&root_hash)? {
                    // Check if this block has content for our space
                    let space_id_16: [u8; 16] = space_id[..16].try_into().unwrap();

                    // Get space block for this space
                    if let Some(space_block) = self.get_space_block_for_root(
                        &root_hash,
                        &space_id_16,
                    )? {
                        let mut block_data = SerializedBlock {
                            root_block: bincode::serialize(&root_block)?,
                            space_blocks: vec![bincode::serialize(&space_block)?],
                            content_blocks: vec![],
                        };

                        if include_content {
                            // Get content blocks for this branch only
                            let content_blocks = self.get_content_blocks_for_branch(
                                &root_hash,
                                &space_id_16,
                                branch_path,
                            )?;

                            for cb in content_blocks {
                                block_data.content_blocks.push(bincode::serialize(&cb)?);
                            }
                        }

                        result.push(block_data);
                    }
                }
            }
        }

        Ok(result)
    }

    /// Get content blocks for a specific branch
    fn get_content_blocks_for_branch(
        &self,
        root_hash: &[u8; 32],
        space_id: &[u8; 16],
        branch_path: &BranchPath,
    ) -> Result<Vec<ContentBlock>, StorageError> {
        let mut result = vec![];

        // Scan content blocks for this root
        let prefix = self.content_block_prefix(root_hash, space_id);

        for item in self.content_blocks.scan_prefix(&prefix) {
            let (_, value) = item?;
            let content_block: ContentBlock = bincode::deserialize(&value)?;

            // Check if content block belongs to requested branch
            if content_block.branch_path.is_descendant_of(branch_path)
                || content_block.branch_path == *branch_path
            {
                result.push(content_block);
            }
        }

        Ok(result)
    }
}
```

---

## 9. Testing Strategy

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subscription_manager_basic() {
        let manager = BranchSubscriptionManager::new(100 * 1024 * 1024); // 100MB

        let space = [1u8; 32];
        let branch = BranchPath::root();

        // Subscribe
        manager.subscribe(space, branch.clone()).unwrap();
        assert!(manager.is_subscribed(&space, &branch));

        // Unsubscribe
        manager.unsubscribe(space, branch.clone());
        assert!(!manager.is_subscribed(&space, &branch));
    }

    #[test]
    fn test_subscription_lru_eviction() {
        let manager = BranchSubscriptionManager::new(100); // Tiny budget

        let space1 = [1u8; 32];
        let space2 = [2u8; 32];
        let branch = BranchPath::root();

        manager.subscribe(space1, branch.clone()).unwrap();
        manager.add_storage(space1, branch.clone(), 60);

        manager.subscribe(space2, branch.clone()).unwrap();
        manager.add_storage(space2, branch.clone(), 60);

        // Need room for more - should evict oldest
        let evicted = manager.make_room(50);
        assert_eq!(evicted.len(), 1);
        assert_eq!(evicted[0].0, space1); // First subscribed = oldest
    }

    #[test]
    fn test_branch_payload_serialization() {
        let payload = GetBlocksBranchPayload::new(
            [1u8; 32],
            BranchPath::root().branch(BranchDirection::Left),
            100,
            50,
        );

        let serialized = payload.serialize();
        let deserialized = GetBlocksBranchPayload::deserialize(&serialized).unwrap();

        assert_eq!(payload.space_id, deserialized.space_id);
        assert_eq!(payload.branch_path, deserialized.branch_path);
        assert_eq!(payload.start_height, deserialized.start_height);
    }
}
```

### Integration Tests

```rust
#[tokio::test]
async fn test_branch_sync_between_nodes() {
    // Create two nodes
    let node_a = TestNode::new().await;
    let node_b = TestNode::new().await;

    // Node A creates content in branch L
    let space_id = [1u8; 32];
    let branch_l = BranchPath::root().branch(BranchDirection::Left);
    node_a.create_content(space_id, branch_l.clone()).await;

    // Node B subscribes to branch L only
    node_b.subscribe(space_id, branch_l.clone()).await;

    // Connect nodes
    node_a.connect_to(&node_b).await;

    // Trigger sync
    node_b.sync().await;

    // Verify Node B has branch L content
    assert!(node_b.has_branch_content(&space_id, &branch_l));

    // Verify Node B does NOT have branch R content
    let branch_r = BranchPath::root().branch(BranchDirection::Right);
    assert!(!node_b.has_branch_content(&space_id, &branch_r));
}
```

---

## 10. Migration Path

### Phase 1: Add Message Types (Non-Breaking)
- Add new message constants
- Add payload structs
- Existing nodes ignore unknown messages

### Phase 2: Add Subscription Manager (Non-Breaking)
- New component, doesn't affect existing sync
- Can run alongside old sync

### Phase 3: Enable Branch-Aware Handlers (Feature Flag)
- `--enable-branch-sync` flag
- Falls back to full sync with old peers

### Phase 4: Default to Branch Sync (Breaking)
- Requires network coordination
- Old nodes can still participate via bridge nodes

---

## 11. Configuration

**File: `src/node/config.rs`**

```rust
pub struct NodeConfig {
    // ... existing fields ...

    /// Enable branch-selective sync
    pub branch_sync_enabled: bool,

    /// Storage budget for branch content (bytes)
    pub branch_storage_budget: u64,

    /// Maximum branch subscriptions
    pub max_branch_subscriptions: usize,

    /// Auto-subscribe to branches user engages with
    pub auto_subscribe_engaged: bool,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            // ... existing defaults ...
            branch_sync_enabled: true,
            branch_storage_budget: 400 * 1024 * 1024, // 400MB
            max_branch_subscriptions: 50,
            auto_subscribe_engaged: true,
        }
    }
}
```

---

## 12. CLI Commands

```bash
# List subscriptions
sw branch list

# Subscribe to a branch
sw branch subscribe --space <space_id> --path L.R.L

# Unsubscribe
sw branch unsubscribe --space <space_id> --path L.R.L

# Check storage
sw branch storage
# Output: Used: 245MB / 400MB (61%)

# Find peers for branch
sw branch peers --space <space_id> --path L.R.L
```

---

## Appendix: File Locations Summary

| File | Changes |
|------|---------|
| `src/types/constants.rs` | Add message type constants |
| `src/network/messages.rs` | Add payload structs |
| `src/network/serialize.rs` | Add serialization |
| `src/sync/subscription.rs` | NEW: Subscription manager |
| `src/sync/mod.rs` | Export subscription module |
| `src/discovery/peer_entry.rs` | Add branch tracking |
| `src/node/router/router.rs` | Add handlers |
| `src/node/tasks.rs` | Add branch sync loop |
| `src/storage/chain.rs` | Add branch query methods |
| `src/node/config.rs` | Add config options |
| `src/cli/commands/branch.rs` | NEW: CLI commands |
