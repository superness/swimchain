# Availability Announcements

**SPEC_07 Milestone 3.5 - Seeding & Availability**

## Overview

Availability announcements enable gossip-based content discovery. Nodes announce which content they have available for seeding, allowing other nodes to discover seeders without querying the entire network.

## Protocol Design

The protocol uses gossip-based announcements (Option B from SPEC_07 §6):

1. When content is stored, announce availability
2. Periodically re-announce to maintain freshness
3. When content is evicted, stop announcing

## Wire Format

### AVAILABILITY_ANNOUNCE Message (0x29)

| Field | Offset | Size | Type | Description |
|-------|--------|------|------|-------------|
| space_id | 0 | 32 | bytes | Space identifier |
| expires_at | 32 | 8 | u64 LE | Expiration timestamp (UNIX seconds) |
| count | 40 | 2 | u16 LE | Number of hashes (max 100) |
| hashes | 42 | 32×count | bytes | Content hashes |

### Size Calculation

```
wire_size = 32 + 8 + 2 + (count × 32)
         = 42 + (count × 32)
```

| Hashes | Wire Size |
|--------|-----------|
| 1 | 74 bytes |
| 10 | 362 bytes |
| 50 | 1,642 bytes |
| 100 | 3,242 bytes |

## Implementation

### AvailabilityAnnouncePayload

```rust
pub struct AvailabilityAnnouncePayload {
    pub space_id: [u8; 32],
    pub expires_at: u64,
    pub hashes: Vec<[u8; 32]>,
}
```

### Serialization

```rust
impl AvailabilityAnnouncePayload {
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(self.wire_size());
        buf.extend_from_slice(&self.space_id);
        buf.extend_from_slice(&self.expires_at.to_le_bytes());
        buf.extend_from_slice(&(self.hashes.len() as u16).to_le_bytes());
        for hash in &self.hashes {
            buf.extend_from_slice(hash);
        }
        buf
    }

    pub fn deserialize(data: &[u8]) -> Option<Self> {
        // Header validation
        if data.len() < 42 {
            return None;
        }
        // ... parse fields
    }
}
```

## Batching

### Maximum Batch Size

Announcements are limited to 100 hashes per message (AVAILABILITY_ANNOUNCE_BATCH_SIZE).

### Batch Generation

```rust
fn get_announcement_batches(
    space_id: SpaceId,
    all_hashes: &[ContentBlobHash],
) -> Vec<AvailabilityAnnouncePayload> {
    all_hashes
        .chunks(100)
        .map(|chunk| AvailabilityAnnouncePayload {
            space_id: space_id.0,
            expires_at: current_time() + 300, // 5 minutes
            hashes: chunk.iter().map(|h| *h.as_bytes()).collect(),
        })
        .collect()
}
```

### Example

For 250 content items:
- Batch 1: hashes 0-99
- Batch 2: hashes 100-199
- Batch 3: hashes 200-249

## Re-announcement

### Interval

Re-announcements occur every 5 minutes (AVAILABILITY_REANNOUNCE_SECS = 300).

### Logic

```rust
fn should_reannounce(space_id: &SpaceId) -> bool {
    match last_announced.get(space_id) {
        Some(t) => t.elapsed().as_secs() >= 300,
        None => true, // Never announced
    }
}
```

## Integration with WHO_HAS/I_HAVE

### How It Works

1. Node A receives availability announcement from Node B
2. Node A records that B has content hashes H1, H2, ...
3. Later, when A needs content H1:
   - A can skip WHO_HAS broadcast
   - A sends GET directly to B

### Peer Availability Map

```rust
pub struct PeerAvailabilityMap {
    entries: HashMap<ContentBlobHash, Vec<PeerAvailability>>,
    ttl_secs: u64,
    max_entries: usize,
}

impl PeerAvailabilityMap {
    pub fn record(&self, hash: ContentBlobHash, peer_id: [u8; 32]);
    pub fn get_peers(&self, hash: &ContentBlobHash) -> Vec<[u8; 32]>;
    pub fn has_availability(&self, hash: &ContentBlobHash) -> bool;
}
```

## Eviction Withdrawal

### Callback Registration

```rust
let handler = Arc::new(availability_handler);
caching_store.set_eviction_callback(Arc::new(move |hash| {
    handler.on_content_evicted(hash);
}));
```

### Withdrawal Mechanism

When content is evicted:
1. Eviction callback is triggered
2. Hash is removed from pending announcements
3. Subsequent re-announcements exclude the hash
4. Announcement expires naturally (5 minutes)

## AvailabilityHandler

### Structure

```rust
pub struct AvailabilityHandler {
    seeding_manager: Arc<SeedingManager>,
    last_announced: RwLock<HashMap<SpaceId, Instant>>,
    pending_announcements: RwLock<HashMap<SpaceId, Vec<ContentBlobHash>>>,
}
```

### Key Methods

```rust
impl AvailabilityHandler {
    // Queue hash for next announcement
    pub fn on_content_stored(&self, hash: ContentBlobHash, space_id: SpaceId);

    // Get batched payloads for a space
    pub fn get_announcement_batches(
        &self,
        space_id: SpaceId,
        all_hashes: &[ContentBlobHash],
    ) -> Vec<AvailabilityAnnouncePayload>;

    // Check if re-announcement needed
    pub fn should_reannounce(&self, space_id: &SpaceId) -> bool;

    // Mark space as announced
    pub fn mark_announced(&self, space_id: SpaceId);
}
```

## Usage Example

### Announcing on Content Storage

```rust
// Content stored in cache
let hash = caching_store.put_with_metadata(data, owner, space, created_at)?;

// Queue for announcement
availability_handler.on_content_stored(hash, space);
```

### Periodic Re-announcement

```rust
// In periodic task
for space_id in tracked_spaces {
    if handler.should_reannounce(&space_id) {
        let hashes = cache.get_hashes_by_space(&space_id);
        let batches = handler.get_announcement_batches(space_id, &hashes);

        for batch in batches {
            gossip_manager.broadcast(batch.serialize());
        }

        handler.mark_announced(space_id);
    }
}
```

### Processing Incoming Announcements

```rust
fn on_availability_announce(
    payload: &AvailabilityAnnouncePayload,
    sender: PeerId,
) {
    if payload.is_expired() {
        return;
    }

    for hash in payload.content_hashes() {
        peer_availability_map.record(hash, sender);
    }
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| AVAILABILITY_ANNOUNCE_BATCH_SIZE | 100 | Max hashes per announcement |
| AVAILABILITY_REANNOUNCE_SECS | 300 | Re-announcement interval (5 min) |
| MSG_AVAILABILITY_ANNOUNCE | 0x29 | Message type identifier |

## Expiration Handling

Announcements include an `expires_at` timestamp:

```rust
impl AvailabilityAnnouncePayload {
    pub fn is_expired(&self) -> bool {
        current_timestamp() > self.expires_at
    }
}
```

Receivers should:
1. Check expiration before recording
2. Periodically prune expired entries from availability map
3. Consider freshness when selecting peers
