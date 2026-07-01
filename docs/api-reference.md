# API Reference

This document describes the Swimchain API layer (Milestone 5.2), which provides a unified interface for GUI and CLI applications to interact with the Swimchain protocol.

## Overview

The API layer follows a hybrid event-driven and request/response architecture:

- **Event-driven subscriptions**: Real-time notifications via tokio broadcast channels
- **Request/response queries**: Synchronous reads for content, sync status, etc.
- **Command handlers**: Write operations with proof-of-work
- **Type-safe bindings**: All types are serializable with Serde for cross-process communication

## Getting Started

### Basic Setup

```rust
use swimchain::api::{ApiClient, ApiConfig};
use swimchain::storage::{StorageConfig, StorageManager};
use swimchain::types::identity::IdentityId;
use std::sync::{Arc, RwLock};

// Create storage
let storage = Arc::new(RwLock::new(
    StorageManager::open(
        StorageConfig::default(),
        IdentityId::from_bytes([0u8; 32])
    ).unwrap()
));

// Build the API client
let client = ApiClient::builder()
    .storage(storage)
    .build()
    .unwrap();
```

### With Pool Manager

```rust
use swimchain::content::pool::PoolManager;

let pool_manager = Arc::new(RwLock::new(PoolManager::new()));

let client = ApiClient::builder()
    .storage(storage)
    .pool_manager(pool_manager)
    .build()
    .unwrap();
```

### With Identity

```rust
use swimchain::identity::{create_identity_with_difficulty, export_identity};

let (keypair, proof) = create_identity_with_difficulty(4);
let identity = export_identity(&keypair, Some(&proof), "password").unwrap();

let mut client = ApiClient::builder()
    .storage(storage)
    .identity(identity)
    .build()
    .unwrap();
```

## Events

The API emits events via a publish-subscribe system. Subscribe to receive all events:

```rust
let mut rx = client.subscribe();

// In an async context:
while let Ok(event) = rx.recv().await {
    match event {
        ApiEvent::Content(content_event) => { /* ... */ }
        ApiEvent::Network(network_event) => { /* ... */ }
        ApiEvent::Pool(pool_event) => { /* ... */ }
        ApiEvent::Pow(pow_event) => { /* ... */ }
    }
}
```

### Event Types

#### ContentEvent

| Variant | Fields | Description |
|---------|--------|-------------|
| `NewPost` | `content_id`, `space_id`, `author_id` | A new post was created |
| `NewReply` | `content_id`, `parent_id`, `author_id` | A reply was created |
| `ContentDecaying` | `content_id`, `hours_remaining` | Content approaching decay threshold |
| `ContentDecayed` | `content_id` | Content has fully decayed |

#### NetworkEvent

| Variant | Fields | Description |
|---------|--------|-------------|
| `PeerConnected` | `peer_count` | A peer connected |
| `PeerDisconnected` | `peer_count` | A peer disconnected |
| `SyncStarted` | `target_height` | Sync process started |
| `SyncProgress` | `current_height`, `target_height`, `percent` | Sync progress update |
| `SyncCompleted` | `height`, `duration_ms` | Sync finished successfully |
| `SyncFailed` | `reason` | Sync failed |
| `ForkDetected` | `fork_id`, `height` | Fork detected in chain |

#### PoolEvent

| Variant | Fields | Description |
|---------|--------|-------------|
| `PoolCreated` | `pool_id`, `content_id` | Engagement pool created |
| `PoolProgress` | `pool_id`, `contributed`, `required`, `percent` | Contribution progress |
| `PoolCompleted` | `pool_id`, `content_id`, `contributor_count` | Pool successfully completed |
| `PoolExpired` | `pool_id` | Pool expired without completion |

#### PowEvent

| Variant | Fields | Description |
|---------|--------|-------------|
| `Started` | `action`, `difficulty` | PoW computation started |
| `Progress` | `nonces_tried`, `elapsed_ms`, `estimated_remaining_ms` | Mining progress |
| `Completed` | `nonce`, `elapsed_ms` | PoW solved |
| `Cancelled` | - | PoW cancelled by user |

### Event JSON Serialization

Events are tagged with `type` and `kind` for easy deserialization:

```json
{
  "type": "Content",
  "data": {
    "kind": "NewPost",
    "content_id": "...",
    "space_id": "...",
    "author_id": "..."
  }
}
```

## Queries

### get_content

Retrieves content by ID with decay state information.

```rust
let response = client.get_content(&content_id)?;
```

**Returns**: `ContentResponse`

```rust
pub struct ContentResponse {
    pub item: ContentItem,
    pub survival_probability: f64,  // 0.0 to 1.0
    pub is_decayed: bool,
    pub is_protected: bool,
    pub hours_until_decay: Option<u64>,  // None if protected/decayed
    pub pool: Option<PoolSummary>,
}
```

**Errors**:
- `ApiError::ContentNotFound` - Content doesn't exist
- `ApiError::Storage` - Storage read error

### get_sync_status

Returns current synchronization status.

```rust
let status = client.get_sync_status();
```

**Returns**: `SyncStatusResponse`

```rust
pub struct SyncStatusResponse {
    pub state: SyncState,  // Idle, Connecting, Syncing, Complete, Failed
    pub current_height: u64,
    pub target_height: u64,
    pub peer_count: usize,
    pub bytes_downloaded: u64,
    pub progress_percentage: f64,
}
```

## Commands

### create_post

Creates a new post with proof-of-work.

```rust
let result = client.create_post(
    space_id,
    "Hello, world!",
    None, // Optional progress callback
)?;

println!("Created post: {:?}", result.result);
println!("PoW took {}ms", result.elapsed_ms);
```

**With Progress Callback**:

```rust
let callback: PowProgressCallback = Box::new(|nonces, elapsed_ms| {
    println!("Tried {} nonces in {}ms", nonces, elapsed_ms);
    true // Return false to cancel
});

let result = client.create_post(space_id, "Hello!", Some(callback))?;
```

**Returns**: `PowResult<ContentId>`

```rust
pub struct PowResult<T> {
    pub result: T,          // ContentId
    pub nonce: u64,         // Winning nonce
    pub difficulty: u8,     // Difficulty met
    pub elapsed_ms: u64,    // Time taken
}
```

**Errors**:
- `ApiError::NoIdentity` - No identity set
- `ApiError::PowCancelled` - User cancelled
- `ApiError::PowFailed` - PoW computation error

### create_reply

Creates a reply to existing content.

```rust
let result = client.create_reply(parent_id, "My reply", None)?;
```

Parameters and return type are the same as `create_post`.

### set_identity / clear_identity

Manage the current signing identity.

```rust
client.set_identity(identity);
assert!(client.has_identity());

client.clear_identity();
assert!(!client.has_identity());
```

## Types

### PoolSummary

Summary of an engagement pool:

```rust
pub struct PoolSummary {
    pub pool_id: PoolId,           // [u8; 32]
    pub contributed_seconds: u64,
    pub required_seconds: u64,
    pub contributor_count: usize,
    pub time_remaining_ms: Option<u64>,  // None if completed/expired
    pub progress_percentage: f64,        // Capped at 100.0
}
```

### SyncState

Enumeration of sync states:

```rust
pub enum SyncState {
    Idle,       // Not syncing
    Connecting, // Connecting to peers
    Syncing,    // Actively syncing
    Complete,   // Sync finished
    Failed,     // Sync failed
}
```

## Error Handling

All API errors are variants of `ApiError`:

| Variant | Description |
|---------|-------------|
| `ContentNotFound(ContentId)` | Content doesn't exist |
| `NoIdentity` | No identity set for signing |
| `SpaceNotFound(SpaceId)` | Space doesn't exist |
| `PowCancelled` | User cancelled PoW |
| `PowFailed(String)` | PoW computation failed |
| `Storage(String)` | Storage operation failed |
| `Internal(String)` | Internal error |

## Configuration

### ApiConfig

```rust
pub struct ApiConfig {
    pub event_buffer_size: usize,  // Default: 100
    pub query_timeout_ms: u64,     // Default: 5000
}
```

Usage:

```rust
let config = ApiConfig::default()
    .with_buffer_size(200)
    .with_query_timeout(10000);

let client = ApiClient::builder()
    .storage(storage)
    .config(config)
    .build()?;
```

## Thread Safety

- `ApiClient` is `Send + Sync` safe
- Storage and pool manager use `Arc<RwLock<T>>` for interior mutability
- Event subscribers receive independent clones of each event
- The broadcast channel drops events if a slow subscriber falls behind

## Performance Considerations

1. **Event Buffer Size**: Increase `event_buffer_size` if subscribers might fall behind
2. **PoW in Tests**: Use `.use_test_pow()` builder method for faster tests
3. **Lock Contention**: Minimize time holding storage locks for high-throughput scenarios

## Migration from CLI

If migrating from direct CLI usage to the API:

| CLI Command | API Method |
|-------------|------------|
| `cs post create --space <id> --body "..."` | `client.create_post(space_id, body, None)` |
| `cs post view <id>` | `client.get_content(&content_id)` |
| `cs identity set <path>` | `client.set_identity(identity)` |

## Future Enhancements

Planned for future milestones:
- WebSocket/IPC transport for cross-process events
- Async query variants
- Batch operations
- Connection to actual sync state (currently placeholder)
