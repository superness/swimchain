# API Layer - Feature Documentation

## Overview

The API Layer provides a unified programmatic interface for Swimchain applications to interact with the protocol. It serves as the internal Rust API that abstracts storage, networking, and content operations into a cohesive client interface suitable for GUI and CLI applications.

Key capabilities:
- **Event-driven subscriptions**: Real-time notifications via tokio broadcast channels
- **Request/response queries**: Synchronous reads for content and sync status
- **Command handlers**: Write operations with proof-of-work validation
- **Type-safe bindings**: All types are serializable for cross-process communication

**Owner Area**: `src/api/`

**Milestone**: 5.2

## Architecture

```
+------------------+
|   Application    |  (GUI/CLI)
+------------------+
        |
        v
+------------------+     subscribe()      +---------------------+
|    ApiClient     |--------------------->| SubscriptionManager |
|                  |                      |   (broadcast chan)  |
|  - get_content() |                      +---------------------+
|  - create_post() |                              |
|  - subscribe()   |                              v
+------------------+                      +---------------------+
        |                                 |     ApiEvent        |
        |                                 | - Content/Network   |
        v                                 | - Pool/Pow/Notif    |
+------------------+                      +---------------------+
|  QueryHandler    |
|  - get_content() |
|  - get_sync()    |
+--------+---------+
         |
         v
+------------------+     +------------------+
|  StorageManager  |     |  CommandHandler  |
|                  |     |  - create_post() |
|                  |     |  - create_reply()|
+------------------+     |  - PoW compute   |
                         +------------------+
```

The API Layer follows a facade pattern where `ApiClient` delegates to specialized handlers:
- `QueryHandler`: Read operations from storage with decay state calculation
- `CommandHandler`: Write operations with PoW and content format validation
- `SubscriptionManager`: Event broadcast distribution via tokio channels

## Data Structures

### ApiClient
The main entry point for all API operations. Combines queries, commands, and subscriptions.

| Field | Type | Description |
|-------|------|-------------|
| query_handler | QueryHandler | Handles read operations |
| command_handler | CommandHandler | Handles write operations with PoW |
| subscription_manager | SubscriptionManager | Manages event broadcasting |
| config | ApiConfig | Client configuration |

**Location**: `src/api/client.rs:49-55`

### ApiClientBuilder
Builder pattern for constructing `ApiClient` instances.

| Field | Type | Description |
|-------|------|-------------|
| storage | Option<Arc<RwLock<StorageManager>>> | Storage backend (required) |
| pool_manager | Option<Arc<RwLock<PoolManager>>> | Pool manager for engagement pools |
| identity | Option<PortableIdentity> | Initial identity for signing |
| config | Option<ApiConfig> | Custom configuration |
| use_test_pow | bool | Use test PoW config for faster mining |

**Location**: `src/api/client.rs:156-163`

### QueryHandler
Handler for read operations with decay state calculation.

| Field | Type | Description |
|-------|------|-------------|
| storage | Arc<RwLock<StorageManager>> | Storage backend |
| pool_manager | Option<Arc<RwLock<PoolManager>>> | Pool manager for pool queries |
| half_life_secs | u64 | Half-life for decay calculation |

**Location**: `src/api/queries.rs:16-20`

### CommandHandler
Handler for write operations with proof-of-work computation.

| Field | Type | Description |
|-------|------|-------------|
| identity | Option<PortableIdentity> | Identity for signing operations |
| pow_config | ForkPoWConfig | PoW configuration |

**Location**: `src/api/commands.rs:37-40`

### SubscriptionManager
Manages event subscriptions using tokio broadcast channels.

| Field | Type | Description |
|-------|------|-------------|
| sender | broadcast::Sender<ApiEvent> | Broadcast sender |
| _receiver | broadcast::Receiver<ApiEvent> | Internal receiver (keeps channel alive) |

**Location**: `src/api/subscription.rs:15-19`

### ApiConfig
Configuration options for the API client.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| event_buffer_size | usize | 100 | Broadcast channel buffer size |
| query_timeout_ms | u64 | 5000 | Query timeout (not currently enforced) |

**Location**: `src/api/config.rs:6-12`

### ContentResponse
Response containing content with decay state information.

| Field | Type | Description |
|-------|------|-------------|
| item | ContentItem | The content item |
| survival_probability | f64 | Current survival probability (0.0 to 1.0) |
| is_decayed | bool | Whether content has decayed below threshold |
| is_protected | bool | Whether content is protected (floor period or pinned) |
| hours_until_decay | Option<u64> | Hours until decay (None if protected/decayed) |
| pool | Option<PoolSummary> | Associated engagement pool, if any |

**Location**: `src/api/types.rs:11-25`

### PoolSummary
Summary of an engagement pool.

| Field | Type | Description |
|-------|------|-------------|
| pool_id | PoolId | Unique pool identifier ([u8; 32]) |
| contributed_seconds | u64 | Total seconds contributed so far |
| required_seconds | u64 | Required total seconds for completion |
| contributor_count | usize | Number of contributions |
| time_remaining_ms | Option<u64> | Milliseconds remaining in pool window |
| progress_percentage | f64 | Progress percentage, capped at 100.0 |

**Location**: `src/api/types.rs:28-42`

### SyncStatusResponse
Response containing sync status information.

| Field | Type | Description |
|-------|------|-------------|
| state | SyncState | Current sync state |
| current_height | u64 | Current block height |
| target_height | u64 | Target block height |
| peer_count | usize | Number of connected peers |
| bytes_downloaded | u64 | Total bytes downloaded |
| progress_percentage | f64 | Sync progress percentage |

**Location**: `src/api/types.rs:79-93`

### SyncState
Enum representing synchronization state.

| Variant | Description |
|---------|-------------|
| Idle | Not syncing |
| Connecting | Connecting to peers |
| Syncing | Actively syncing |
| Complete | Sync completed |
| Failed | Sync failed |

**Location**: `src/api/types.rs:64-76`

### PowResult<T>
Result of a proof-of-work operation.

| Field | Type | Description |
|-------|------|-------------|
| result | T | The operation result (e.g., ContentId) |
| nonce | u64 | The nonce that solved the PoW |
| difficulty | u8 | The difficulty level that was met |
| elapsed_ms | u64 | Time taken in milliseconds |

**Location**: `src/api/commands.rs:24-34`

### ApiError
Error types for API operations.

| Variant | Fields | Description |
|---------|--------|-------------|
| ContentNotFound | ContentId | Content was not found in storage |
| NoIdentity | - | No identity has been set for the client |
| SpaceNotFound | SpaceId | Space was not found |
| PowCancelled | - | PoW operation was cancelled by user |
| PowFailed | String | PoW computation failed |
| Storage | String | Storage operation failed |
| ContentFormat | ContentFormatError | Content format validation failed (SPEC_12 section 3.1) |
| Internal | String | Internal error |

**Location**: `src/api/error.rs:10-34`

### ContentFormatError
Error types for content format validation.

| Variant | Fields | Description |
|---------|--------|-------------|
| VideoNotSupported | - | Video content is not supported |
| TextTooLong | size, max | Text content exceeds maximum length |
| ImageTooLarge | size, max | Image size exceeds maximum |
| ImageDimensionTooLarge | width, height, max | Image dimension exceeds maximum |
| ImageFormatNotAllowed | format | Unsupported image format |
| UnknownFormat | u8 | Unknown content format byte |

**Location**: `src/content/content_format.rs:143-174`

## Core APIs

### ApiClient::builder()
**Signature**: `fn builder() -> ApiClientBuilder`

**Purpose**: Create a new builder for ApiClient.

**Returns**: A new `ApiClientBuilder` instance.

**Example**:
```rust
let client = ApiClient::builder()
    .storage(storage)
    .pool_manager(pool_manager)
    .identity(identity)
    .config(ApiConfig::default().with_buffer_size(200))
    .use_test_pow()
    .build()?;
```

### ApiClientBuilder::storage()
**Signature**: `fn storage(mut self, storage: Arc<RwLock<StorageManager>>) -> Self`

**Purpose**: Set the storage manager (required).

**Parameters**:
- `storage`: Arc-wrapped RwLock storage manager

**Returns**: Self for method chaining.

### ApiClientBuilder::pool_manager()
**Signature**: `fn pool_manager(mut self, pm: Arc<RwLock<PoolManager>>) -> Self`

**Purpose**: Set the pool manager for pool queries (optional).

**Parameters**:
- `pm`: Arc-wrapped RwLock pool manager

**Returns**: Self for method chaining.

### ApiClientBuilder::identity()
**Signature**: `fn identity(mut self, identity: PortableIdentity) -> Self`

**Purpose**: Set the initial identity for signing operations (optional).

**Parameters**:
- `identity`: Portable identity for signing

**Returns**: Self for method chaining.

### ApiClientBuilder::config()
**Signature**: `fn config(mut self, config: ApiConfig) -> Self`

**Purpose**: Set custom API configuration (optional).

**Parameters**:
- `config`: API configuration

**Returns**: Self for method chaining.

### ApiClientBuilder::use_test_pow()
**Signature**: `fn use_test_pow(mut self) -> Self`

**Purpose**: Use test PoW configuration for faster mining in tests.

**Returns**: Self for method chaining.

### ApiClientBuilder::build()
**Signature**: `fn build(self) -> Result<ApiClient, ApiError>`

**Purpose**: Build the ApiClient instance.

**Returns**: `ApiClient` or `ApiError::Internal` if storage is not set.

### ApiClient::get_content()
**Signature**: `fn get_content(&self, content_id: &ContentId) -> Result<ContentResponse, ApiError>`

**Purpose**: Get content by ID with computed decay state.

**Parameters**:
- `content_id`: The ID of the content to retrieve

**Returns**: `ContentResponse` with content item and decay state, or `ApiError`.

**Example**:
```rust
let content_id = ContentId::from_bytes([1u8; 32]);
match client.get_content(&content_id) {
    Ok(response) => {
        println!("Survival: {:.1}%", response.survival_probability * 100.0);
        if let Some(hours) = response.hours_until_decay {
            println!("Decays in {} hours", hours);
        }
    }
    Err(ApiError::ContentNotFound(_)) => println!("Content not found"),
    Err(e) => eprintln!("Error: {}", e),
}
```

### ApiClient::get_sync_status()
**Signature**: `fn get_sync_status(&self) -> SyncStatusResponse`

**Purpose**: Get current sync status.

**Returns**: `SyncStatusResponse` with sync state information.

**Note**: Currently returns placeholder idle response. Will be connected to actual sync state in future milestones.

**Example**:
```rust
let status = client.get_sync_status();
match status.state {
    SyncState::Syncing => println!("Syncing: {:.1}%", status.progress_percentage),
    SyncState::Idle => println!("Idle"),
    _ => {}
}
```

### ApiClient::create_post()
**Signature**: `fn create_post(&self, space_id: SpaceId, body: &str, progress: Option<PowProgressCallback>) -> Result<PowResult<ContentId>, ApiError>`

**Purpose**: Create a new post with proof-of-work.

**Parameters**:
- `space_id`: The space to post in
- `body`: The post body text
- `progress`: Optional callback for progress updates `Box<dyn Fn(u64, u64) -> bool + Send>`

**Returns**: `PowResult<ContentId>` containing the new content ID and PoW statistics.

**Example**:
```rust
let space = SpaceId::from_bytes([1u8; 32]);
let progress: PowProgressCallback = Box::new(|nonces, elapsed_ms| {
    println!("Tried {} nonces in {}ms", nonces, elapsed_ms);
    true // return false to cancel
});

let result = client.create_post(space, "Hello, Swimchain!", Some(progress))?;
println!("Created post {} in {}ms", result.result, result.elapsed_ms);
```

### ApiClient::create_reply()
**Signature**: `fn create_reply(&self, parent_id: ContentId, body: &str, progress: Option<PowProgressCallback>) -> Result<PowResult<ContentId>, ApiError>`

**Purpose**: Create a reply to existing content with proof-of-work.

**Parameters**:
- `parent_id`: The content being replied to
- `body`: The reply body text
- `progress`: Optional callback for progress updates

**Returns**: `PowResult<ContentId>` containing the new content ID and PoW statistics.

**Example**:
```rust
let parent = ContentId::from_bytes([1u8; 32]);
let result = client.create_reply(parent, "Great post!", None)?;
println!("Created reply {}", result.result);
```

### ApiClient::set_identity()
**Signature**: `fn set_identity(&mut self, identity: PortableIdentity)`

**Purpose**: Set the identity for signing operations.

**Parameters**:
- `identity`: The portable identity to use for signing

### ApiClient::clear_identity()
**Signature**: `fn clear_identity(&mut self)`

**Purpose**: Clear the current identity.

### ApiClient::has_identity()
**Signature**: `fn has_identity(&self) -> bool`

**Purpose**: Check if an identity is set.

**Returns**: `true` if an identity is set, `false` otherwise.

### ApiClient::subscribe()
**Signature**: `fn subscribe(&self) -> broadcast::Receiver<ApiEvent>`

**Purpose**: Subscribe to receive events.

**Returns**: A receiver that will receive all events sent after subscription.

**Example**:
```rust
let mut rx = client.subscribe();

// In an async context:
while let Ok(event) = rx.recv().await {
    match event {
        ApiEvent::Content(ContentEvent::NewPost { content_id, .. }) => {
            println!("New post: {:?}", content_id);
        }
        ApiEvent::Network(NetworkEvent::PeerConnected { peer_count }) => {
            println!("Peers: {}", peer_count);
        }
        _ => {}
    }
}
```

### ApiClient::emit_event()
**Signature**: `fn emit_event(&self, event: ApiEvent)`

**Purpose**: Emit an event to all subscribers. Used by internal components.

**Parameters**:
- `event`: The event to broadcast

### ApiClient::subscriber_count()
**Signature**: `fn subscriber_count(&self) -> usize`

**Purpose**: Get the number of active subscribers.

**Returns**: Count of active subscribers (includes internal receiver).

### CommandHandler::create_text_post()
**Signature**: `fn create_text_post(&self, space_id: SpaceId, body: &str, progress: Option<PowProgressCallback>) -> Result<PowResult<ContentId>, ApiError>`

**Purpose**: Create a text post with content format validation per SPEC_12 section 3.1.

**Parameters**:
- `space_id`: The space to post in
- `body`: The post body text (max 10KB)
- `progress`: Optional callback for progress updates

**Returns**: `PowResult<ContentId>` or `ApiError::ContentFormat` if validation fails.

**Location**: `src/api/commands.rs:319-337`

### CommandHandler::create_image_post()
**Signature**: `fn create_image_post(&self, space_id: SpaceId, image_data: &[u8], width: u32, height: u32, format: &str, caption: Option<&str>, progress: Option<PowProgressCallback>) -> Result<PowResult<ContentId>, ApiError>`

**Purpose**: Create an image post with content format validation.

**Parameters**:
- `space_id`: The space to post in
- `image_data`: Raw image bytes (max 500KB)
- `width`: Image width in pixels (max 2048)
- `height`: Image height in pixels (max 2048)
- `format`: Image format (jpeg/png/webp)
- `caption`: Optional text caption
- `progress`: Optional callback for progress updates

**Returns**: `PowResult<ContentId>` or `ApiError::ContentFormat` if validation fails.

**Location**: `src/api/commands.rs:361-390`

### CommandHandler::validate_content_format()
**Signature**: `fn validate_content_format(&self, format: ContentFormat, content_bytes: Option<&[u8]>, width: Option<u32>, height: Option<u32>, mime_type: Option<&str>, extension: Option<&str>) -> Result<(), ApiError>`

**Purpose**: Validate content format before posting per SPEC_12 section 3.1.

**Parameters**:
- `format`: The content format type (Text, Image, Link, Mention)
- `content_bytes`: Optional raw content bytes for size validation
- `width`: Optional image width in pixels
- `height`: Optional image height in pixels
- `mime_type`: Optional MIME type string
- `extension`: Optional file extension

**Returns**: `Ok(())` if valid, `ApiError::ContentFormat` with specific error.

**Location**: `src/api/commands.rs:275-293`

### CommandHandler::is_video_content()
**Signature**: `fn is_video_content(mime_type: Option<&str>, extension: Option<&str>) -> bool`

**Purpose**: Check if content is video (always prohibited).

**Parameters**:
- `mime_type`: Optional MIME type to check
- `extension`: Optional file extension to check

**Returns**: `true` if the content appears to be video.

**Location**: `src/api/commands.rs:299-302`

### CommandHandler::public_key()
**Signature**: `fn public_key(&self) -> Option<[u8; 32]>`

**Purpose**: Get the public key bytes of the current identity.

**Returns**: Public key bytes if identity is set, `None` otherwise.

**Location**: `src/api/commands.rs:84-87`

### CommandHandler::max_text_length()
**Signature**: `const fn max_text_length() -> usize`

**Purpose**: Get the maximum allowed text length.

**Returns**: 10,000 bytes (10KB).

**Location**: `src/api/commands.rs:394-396`

### CommandHandler::max_image_size()
**Signature**: `const fn max_image_size() -> usize`

**Purpose**: Get the maximum allowed image size.

**Returns**: 500,000 bytes (500KB).

**Location**: `src/api/commands.rs:400-402`

## Event Types

### ApiEvent
Top-level event enum with tagged serialization.

```rust
#[serde(tag = "type", content = "data")]
pub enum ApiEvent {
    Content(ContentEvent),
    Network(NetworkEvent),
    Pool(PoolEvent),
    Pow(PowEvent),
    Notification(NotificationApiEvent),
}
```

**Location**: `src/api/events.rs:16-29`

### ContentEvent
Events related to content creation and lifecycle.

| Variant | Fields | Description |
|---------|--------|-------------|
| NewPost | content_id, space_id, author_id | A new post was created |
| NewReply | content_id, parent_id, author_id | A new reply was created |
| ContentDecaying | content_id, hours_remaining | Content is approaching decay threshold |
| ContentDecayed | content_id | Content has fully decayed |

**Location**: `src/api/events.rs:48-70`

### NetworkEvent
Events related to network state.

| Variant | Fields | Description |
|---------|--------|-------------|
| PeerConnected | peer_count | A peer connected |
| PeerDisconnected | peer_count | A peer disconnected |
| SyncStarted | target_height | Sync has started |
| SyncProgress | current_height, target_height, percent | Sync progress update |
| SyncCompleted | height, duration_ms | Sync completed successfully |
| SyncFailed | reason | Sync failed |
| ForkDetected | fork_id, height | Fork detected |

**Location**: `src/api/events.rs:73-94`

### PoolEvent
Events related to engagement pools.

| Variant | Fields | Description |
|---------|--------|-------------|
| PoolCreated | pool_id, content_id | A new pool was created |
| PoolProgress | pool_id, contributed, required, percent | Pool contribution progress |
| PoolCompleted | pool_id, content_id, contributor_count | Pool completed successfully |
| PoolExpired | pool_id | Pool expired without completion |

**Location**: `src/api/events.rs:97-120`

### PowEvent
Events related to proof-of-work operations.

| Variant | Fields | Description |
|---------|--------|-------------|
| Started | action, difficulty | PoW computation started |
| Progress | nonces_tried, elapsed_ms, estimated_remaining_ms | PoW progress update |
| Completed | nonce, elapsed_ms | PoW completed successfully |
| Cancelled | - | PoW was cancelled |

**Location**: `src/api/events.rs:123-138`

### NotificationApiEvent
Events related to notifications (per SPEC_09 section 7).

| Variant | Fields | Description |
|---------|--------|-------------|
| New | notification_id, notification_type, message | A new notification was generated |
| Read | notification_id | A notification was marked as read |
| Cleared | count | Notifications were cleared |

**Note**: Implemented but not documented in MASTER_FEATURES.md.

**Location**: `src/api/events.rs:32-45`

## Behaviors

### Content Retrieval with Decay State
When content is retrieved via `get_content()`:

1. Content is fetched from storage by ID
2. Decay state is calculated based on:
   - Time since last engagement
   - Half-life constant (7 days default)
   - Protection status (floor period or pinned)
3. Hours until decay threshold is computed using formula: `time = half_life * log2(survival_probability / threshold)`
4. Associated pool info is retrieved if pool manager is available
5. Complete `ContentResponse` is returned

**Edge cases**:
- Content not found returns `ApiError::ContentNotFound`
- Storage errors return `ApiError::Storage`
- Protected content has `hours_until_decay = None`
- Already decayed content has `hours_until_decay = None`

### Post Creation with PoW
When a post is created via `create_post()`:

1. Identity is verified (returns `ApiError::NoIdentity` if not set)
2. Content hash is computed: `sha256(body)`
3. PoW challenge is constructed with:
   - ActionType::Post
   - Author ID from identity
   - Current timestamp
   - POST difficulty level
   - Random nonce space
4. PoW is computed (with optional progress callback)
5. ContentId is derived: `sha256(space_id || author_id || content_hash || nonce)`
6. `PowResult` is returned with ID, nonce, difficulty, and elapsed time

**Edge cases**:
- No identity returns `ApiError::NoIdentity`
- Callback returning false should cancel (limited support)
- PoW failures return `ApiError::PowFailed`

### Reply Creation with PoW
When a reply is created via `create_reply()`:

1. Identity is verified
2. Content hash is computed: `sha256(parent_id || body)`
3. PoW challenge is constructed with Reply action type
4. PoW is computed
5. ContentId is derived: `sha256(parent_id || author_id || content_hash || nonce)`
6. `PowResult` is returned

### Event Broadcasting
Events are distributed via tokio broadcast channels:

1. `SubscriptionManager` holds a broadcast sender
2. Subscribers receive a receiver via `subscribe()`
3. Events sent via `send()` are cloned to all active receivers
4. No subscribers = events silently dropped
5. Receivers that fall behind lose oldest events (bounded buffer)

**Guarantees**:
- Event delivery is real-time (sub-10ms latency)
- Multiple subscribers each receive independent copies
- Channel remains open even with no subscribers (internal receiver kept)

### Content Format Validation
When `validate_content_format()` is called:

1. Video content is always rejected first
2. Based on format type:
   - **Text**: Size checked against MAX_TEXT_LENGTH (10KB)
   - **Image**: Size, dimensions, and format validated
   - **Link/Mention**: Treated as text for validation
3. Specific `ContentFormatError` returned on failure

**Constraints enforced (SPEC_12 section 3.1)**:
- Text: max 10KB
- Image: max 500KB, max 2048px dimension, jpeg/png/webp only
- Video: always rejected

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| event_buffer_size | usize | 100 | Broadcast channel buffer size. Determines how many events can be queued if a subscriber falls behind. |
| query_timeout_ms | u64 | 5000 | Query timeout in milliseconds. **Note**: Not currently enforced in implementation. |

### Content Format Constants

| Constant | Value | Description | Location |
|----------|-------|-------------|----------|
| MAX_TEXT_LENGTH | 10,000 bytes | Maximum text content size | `src/content/content_format.rs:16` |
| MAX_IMAGE_SIZE | 500,000 bytes | Maximum image file size | `src/content/content_format.rs:19` |
| MAX_IMAGE_DIMENSION | 2,048 px | Maximum image width or height | `src/content/content_format.rs:22` |
| ALLOWED_IMAGE_FORMATS | ["jpeg", "jpg", "png", "webp"] | Allowed image formats | `src/content/content_format.rs:25` |

### Builder Configuration Example

```rust
// Full configuration example
let client = ApiClient::builder()
    .storage(storage)                           // Required
    .pool_manager(pool_manager)                 // Optional: enables pool queries
    .identity(identity)                         // Optional: pre-set identity
    .config(
        ApiConfig::default()
            .with_buffer_size(200)              // Custom event buffer
            .with_query_timeout(10000)          // Custom timeout (not enforced)
    )
    .use_test_pow()                            // Use faster test PoW config
    .build()?;
```

## RPC Methods

The API Layer is an internal Rust API, not an RPC interface. For JSON-RPC methods, see the **RPC API** documentation (`src/rpc/`).

The API Layer may be used internally by RPC handlers to implement RPC methods.

## CLI Commands

The API Layer does not expose CLI commands directly. It is consumed by the CLI Interface (`src/cli/`) which provides commands like:

- `cs content get <content-id>` - Uses `ApiClient::get_content()`
- `cs post create <space-id> <body>` - Uses `ApiClient::create_post()`
- `cs reply create <parent-id> <body>` - Uses `ApiClient::create_reply()`

See the **CLI Interface** documentation for full command reference.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| ContentNotFound(ContentId) | Content ID does not exist in storage | Verify content ID is correct; content may have been pruned |
| NoIdentity | Attempted write operation without setting identity | Call `set_identity()` before write operations |
| SpaceNotFound(SpaceId) | Referenced space does not exist | Verify space ID; space may need to be created first |
| PowCancelled | User cancelled PoW via callback returning false | Retry operation if desired |
| PowFailed(String) | PoW computation encountered an error | Check error message; may indicate system resource issues |
| Storage(String) | Storage read/write error | Check disk space; verify database integrity |
| ContentFormat(ContentFormatError) | Content validation failed | See ContentFormatError for specific constraint violated |
| Internal(String) | Internal API error (e.g., missing required config) | Check API usage; ensure required fields are set |

### ContentFormatError Resolution

| Error | Cause | Resolution |
|-------|-------|------------|
| VideoNotSupported | Attempted to post video content | Video is prohibited at protocol level; use image or text |
| TextTooLong { size, max } | Text exceeds 10KB limit | Truncate or split content |
| ImageTooLarge { size, max } | Image exceeds 500KB | Compress or resize image |
| ImageDimensionTooLarge | Image dimension exceeds 2048px | Resize image to fit within limits |
| ImageFormatNotAllowed { format } | Unsupported image format | Convert to jpeg, png, or webp |
| UnknownFormat(u8) | Invalid format byte value | Use valid ContentFormat enum value |

## Testing

### Unit Tests

Run the API layer tests:

```bash
# Run all API tests
cargo test --lib api::

# Run specific test modules
cargo test --lib api::client::tests
cargo test --lib api::commands::tests
cargo test --lib api::queries::tests
cargo test --lib api::subscription::tests
cargo test --lib api::events::tests
cargo test --lib api::types::tests
cargo test --lib api::error::tests
```

### Integration Test Example

```rust
#[test]
fn test_gui_integration_flow() {
    // 1. Create storage
    let storage = create_test_storage();

    // 2. Build client with pool manager
    let pool_manager = Arc::new(RwLock::new(PoolManager::new()));
    let client = ApiClient::builder()
        .storage(storage)
        .pool_manager(pool_manager)
        .use_test_pow()
        .build()
        .unwrap();

    // 3. Subscribe to events
    let mut rx = client.subscribe();
    assert!(client.subscriber_count() >= 1);

    // 4. Check sync status
    let status = client.get_sync_status();
    assert_eq!(status.state, SyncState::Idle);

    // 5. Emit and receive an event
    client.emit_event(ApiEvent::Network(NetworkEvent::PeerConnected {
        peer_count: 1,
    }));
    let received = rx.try_recv();
    assert!(received.is_ok());
}
```

### Event Delivery Test

```rust
#[tokio::test]
async fn test_events_are_realtime() {
    let manager = SubscriptionManager::with_default_buffer();
    let mut rx = manager.subscribe();

    let event = ApiEvent::Network(NetworkEvent::PeerConnected { peer_count: 5 });
    manager.send(event);

    let start = std::time::Instant::now();
    let received = rx.try_recv();
    assert!(start.elapsed().as_millis() < 10, "Event delivery took too long");
    assert!(received.is_ok());
}
```

### Key Test Assertions

- Events delivered in < 10ms
- Multiple subscribers receive same event
- No panic when no subscribers exist
- Pool progress capped at 100%
- Content ID uniqueness for different content
- PoW completes in reasonable time with test config

## Known Limitations

1. **Query timeout not enforced**: The `query_timeout_ms` configuration option exists but is not currently used to enforce timeouts on queries.

2. **Sync status placeholder**: `get_sync_status()` returns a placeholder idle response. Actual sync state integration is planned for future milestones.

3. **Anti-abuse module disabled**: The `anti_abuse.rs` module (709 lines) exists but is commented out in `mod.rs` with note: "TEMPORARY: Disabled due to API changes - needs update".

4. **PoW cancellation limited**: The progress callback can return `false` to request cancellation, but the underlying `compute_pow_with_callback` doesn't fully support cancellation.

5. **NotificationApiEvent not re-exported**: The `NotificationApiEvent` type is implemented but not included in the public re-exports from `mod.rs` (available via `events::NotificationApiEvent`).

6. **Command methods don't store content**: `create_post()` and `create_reply()` compute PoW and return ContentId but do not store the content. Storage must be handled separately.

## Future Work

1. **Connect sync status to actual state**: Wire `get_sync_status()` to the real sync manager for accurate sync progress reporting.

2. **Re-enable anti-abuse module**: Update `AntiAbuseHandler` APIs and re-enable the module for rate limiting and abuse prevention.

3. **Enforce query timeouts**: Implement actual timeout enforcement using the `query_timeout_ms` configuration.

4. **Full PoW cancellation support**: Enhance the PoW computation API to properly support cancellation via the progress callback.

5. **Export NotificationApiEvent**: Add `NotificationApiEvent` to the public re-exports for easier access by consumers.

6. **Batch query support**: Add methods for batch content retrieval to reduce overhead for listing operations.

7. **Integrated content storage**: Consider option to store content directly in write commands rather than requiring separate storage step.

## Related Features

- **[RPC API](rpc-api_FEATURE_DOC.md)** (`src/rpc/`): JSON-RPC 2.0 external interface that uses API Layer internally
- **[CLI Interface](cli-interface_FEATURE_DOC.md)** (`src/cli/`): Command-line interface that consumes the API Layer
- **[Storage Layer](storage-layer_FEATURE_DOC.md)** (`src/storage/`): Underlying storage that API Layer reads from
- **[Content & Decay Engine](content-decay-engine_FEATURE_DOC.md)** (`src/content/`): Content types and decay calculation
- **[Proof-of-Work Systems](proof-of-work-systems_FEATURE_DOC.md)** (`src/crypto/`): PoW computation used by CommandHandler
- **[Frontend SDK](frontend-sdk_FEATURE_DOC.md)** (`swimchain-frontend/`): Browser SDK that connects via RPC
- **[React SDK](react-sdk_FEATURE_DOC.md)** (`swimchain-react/`): React hooks that wrap API Layer concepts

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/api/mod.rs` | 283 | Module root, re-exports, integration tests |
| `src/api/client.rs` | 363 | ApiClient and ApiClientBuilder |
| `src/api/queries.rs` | 289 | QueryHandler for read operations |
| `src/api/commands.rs` | 502 | CommandHandler for write operations |
| `src/api/subscription.rs` | 163 | SubscriptionManager for events |
| `src/api/config.rs` | 59 | ApiConfig |
| `src/api/events.rs` | 236 | Event type definitions |
| `src/api/types.rs` | 167 | Request/response types |
| `src/api/error.rs` | 80 | Error types |
| `src/api/anti_abuse.rs` | 709 | AntiAbuseHandler (disabled) |
| `src/content/content_format.rs` | 649 | Content format validation |
