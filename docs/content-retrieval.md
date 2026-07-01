# Content Retrieval Protocol

This document describes the P2P content retrieval protocol implemented in Milestone 3.3, as specified in SPEC_07 Section 4.

## Overview

The content retrieval protocol enables nodes to discover and fetch content from peers on the network. It supports:

- **Content discovery** via WHO_HAS/I_HAVE messages
- **Content fetching** via GET/DATA exchange
- **Parallel chunk fetching** for large files
- **Automatic retry** with peer rotation on failure

## Protocol Flow

```
Requester                           Peer Network
    |                                    |
    |------ WHO_HAS(content_hash) ------>| (broadcast)
    |                                    |
    |<----- I_HAVE(content_hash) --------| (from peers who have it)
    |                                    |
    |------ GET(content_hash) ---------->| (to selected peer)
    |                                    |
    |<----- DATA(content) ---------------| (content bytes)
    |       or NOTFOUND -----------------| (peer doesn't have it)
```

## Message Types

| Message | Type Code | Wire Size | Description |
|---------|-----------|-----------|-------------|
| WHO_HAS | 0x24 | 32 bytes | Query for content availability |
| I_HAVE | 0x25 | 32 bytes | Announce content availability |
| GET | 0x26 | 32 bytes | Request content by hash |
| DATA | 0x22 | Variable | Return content (reuses existing) |
| NOTFOUND | 0x23 | Variable | Content not available (reuses existing) |

### WHO_HAS Payload (32 bytes)

```
+-----------------------------------+
|        hash[32]                   |
+-----------------------------------+
```

- `hash`: SHA-256 hash of content being queried

### I_HAVE Payload (32 bytes)

```
+-----------------------------------+
|        hash[32]                   |
+-----------------------------------+
```

- `hash`: SHA-256 hash of content we have

### GET Payload (32 bytes)

```
+-----------------------------------+
|        hash[32]                   |
+-----------------------------------+
```

- `hash`: SHA-256 hash of content to retrieve

### DATA Response Format

When responding to GET requests, the DATA payload contains:

```
+-----------------------------------+
|        hash[32]                   |
+-----------------------------------+
|        length[4] (LE u32)         |
+-----------------------------------+
|        data[length]               |
+-----------------------------------+
```

## Parallel Chunk Fetching

For chunked content (files >1MB), the protocol fetches multiple chunks concurrently:

### Algorithm

```
1. Load manifest from content_hash
2. Check local availability of chunks
3. If all chunks present -> reassemble and return
4. Create ParallelFetcher for missing chunks
5. While not complete and no permanent failures:
   a. Get next chunks to request (up to max_concurrent)
   b. For each chunk:
      - Select peer from availability map
      - Mark chunk as in-flight
      - Send GET to peer
   c. Process responses:
      - DATA: validate hash, store chunk, mark received
      - NOTFOUND: remove peer from availability, retry with different peer
      - Timeout: mark failed, retry if under max_retries
6. Reassemble content from chunks
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| max_concurrent_requests | 4 | Maximum parallel GET requests |
| request_timeout | 30s | Timeout for individual requests |
| max_retries | 3 | Maximum retry attempts per chunk |
| availability_cache_ttl | 5 min | TTL for peer availability entries |

## Usage

### Basic Content Retrieval

```rust
use swimchain::content::{
    ContentRetrievalManager, ContentRetrievalConfig,
    ContentBlobHash,
};
use std::sync::Arc;

// Create manager
let manager = ContentRetrievalManager::with_defaults(
    blob_store,
    chunked_store,
);

// Check local availability
if manager.has_content(&hash) {
    let data = manager.get_local(&hash).unwrap();
}

// Create WHO_HAS query for network
let query = manager.create_who_has_query(&hash);
// broadcast(query)

// Handle I_HAVE response
manager.on_i_have(&payload, sender_peer_id);

// Create GET request
let get_request = manager.create_get_request(&hash);
// send_to_peer(selected_peer, get_request)

// Handle DATA response
manager.on_data(&expected_hash, &received_data)?;
```

### Parallel Chunk Fetching

```rust
// Load manifest
let manifest = manager.load_manifest(&manifest_hash)?;

// Check chunk availability
let availability = manager.check_chunk_availability(&manifest);

if availability.is_complete() {
    let content = manager.reassemble_content(&manifest)?;
} else {
    // Create fetcher for missing chunks
    let mut fetcher = manager.create_fetcher_for_missing(&availability);

    while !fetcher.is_complete() {
        // Get next batch of chunks to request
        for hash in fetcher.get_next_chunks() {
            if let Some(peer) = manager.select_peer(&hash, &[]) {
                fetcher.mark_in_flight(&hash, peer);
                // send GET to peer
            }
        }

        // Handle responses...
        // fetcher.mark_received(&hash) on success
        // fetcher.mark_failed(&hash, max_retries) on failure
    }

    let content = manager.reassemble_content(&manifest)?;
}
```

## Retry Strategy

1. **Initial Request**: Send GET to first available peer
2. **On NOTFOUND**: Remove peer from availability, select next peer, retry
3. **On Timeout**: Increment retry count, select different peer, retry
4. **Max Retries Exhausted**: Mark chunk as permanently failed

### Peer Selection

- Peers are tracked in an availability map (content_hash -> set of peers)
- Selection excludes peers that have already failed for this content
- Map entries expire after 5 minutes (configurable)

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `NotFound` | Content not found locally or on network | N/A (content doesn't exist) |
| `NoPeersAvailable` | No peers have the content | Wait and retry WHO_HAS |
| `Timeout` | Request exceeded timeout | Retry with different peer |
| `MaxRetriesExhausted` | All retry attempts failed | Report failure to caller |
| `HashMismatch` | Received data doesn't match expected hash | Reject data, try different peer |

## Integration with ChunkedContentStore

The retrieval protocol integrates with the chunking layer from Milestone 3.2:

- `ChunkedContentStore` handles chunk storage and reassembly
- `Manifest` defines the chunk layout for large files
- `ChunkAvailability` tracks which chunks are locally available

See [docs/content-chunking.md](content-chunking.md) for chunking details.

## Constants

Defined in `src/types/constants.rs`:

```rust
// Message type codes
pub const MSG_WHO_HAS: u8 = 0x24;
pub const MSG_I_HAVE: u8 = 0x25;
pub const MSG_GET: u8 = 0x26;

// Retrieval configuration
pub const CONTENT_REQUEST_TIMEOUT_SECS: u64 = 30;
pub const CONTENT_MAX_RETRIES: usize = 3;
pub const MAX_CONCURRENT_CHUNK_REQUESTS: usize = 4;
pub const PEER_AVAILABILITY_TTL_SECS: u64 = 300;
pub const MAX_PEER_AVAILABILITY_ENTRIES: usize = 10_000;
pub const WHO_HAS_SEEN_TTL_SECS: u64 = 60;
```

## Future Enhancements

- **Rarest-first selection**: Prioritize chunks with fewer available peers
- **Peer scoring**: Prefer peers with better response times
- **DHT integration**: Distributed peer discovery for content
- **Bandwidth throttling**: Limit concurrent downloads per peer
