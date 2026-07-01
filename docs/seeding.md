# Seeding Configuration

**SPEC_07 Milestone 3.5 - Seeding & Availability**

## Overview

Seeding allows nodes to share content they have cached locally with other nodes in the network. This is a voluntary action that can be configured per-user based on bandwidth, storage, and content preferences.

## Configuration

### SeedingConfig

The main configuration structure (SPEC_07 §5):

```rust
SeedingConfig {
    enabled: bool,               // Enable/disable seeding
    spaces: Vec<SpaceId>,        // Spaces to seed (empty = all)
    bandwidth_limit_mbps: u32,   // Bandwidth limit (1-100 Mbps)
    storage_limit_gb: u32,       // Storage limit (1-1000 GB)
    seed_own_content: bool,      // Always seed own content
    seed_viewed_content: bool,   // Seed recently viewed content
    seed_duration_hours: u32,    // Duration to seed (1-8760 hours)
}
```

### JSON Configuration Example

```json
{
  "enabled": true,
  "spaces": [],
  "bandwidth_limit_mbps": 10,
  "storage_limit_gb": 50,
  "seed_own_content": true,
  "seed_viewed_content": true,
  "seed_duration_hours": 168
}
```

### Configuration Constraints

| Parameter | Min | Max | Default | Notes |
|-----------|-----|-----|---------|-------|
| bandwidth_limit_mbps | 1 | 100 | 10 | Megabits per second |
| storage_limit_gb | 1 | 1000 | 50 | Gigabytes |
| seed_duration_hours | 1 | 8760 | 168 | 1 hour to 1 year |

## Seeding Modes

The seeding mode is derived from configuration:

| Mode | enabled | spaces | seed_own_content | seed_viewed_content |
|------|---------|--------|------------------|---------------------|
| Disabled | false | - | - | - |
| OwnContent | true | empty | true | false |
| ViewedContent | true | empty | true | true |
| FullSpace | true | non-empty | - | - |

### Mode Descriptions

- **Disabled**: No content is seeded
- **OwnContent**: Only seed content you created
- **ViewedContent**: Seed your content plus content you've viewed within duration
- **FullSpace**: Seed all content in specified spaces (for dedicated seeders)

## Bandwidth Limiting

### Token Bucket Algorithm

Bandwidth is controlled using a token bucket rate limiter:

- **Tokens** = bytes that can be transmitted
- **Refill Rate** = bandwidth_limit_mbps × 125,000 bytes/second
- **Burst Capacity** = 1 second of bandwidth

```rust
// Create limiter for 10 Mbps
let limiter = TokenBucketLimiter::new_mbps(10);

// Try to send 1MB
let acquired = limiter.try_acquire(1_000_000);
if acquired == 1_000_000 {
    // Full request can be sent
} else {
    // Partial send or queue for later
}
```

### Bandwidth Conversion

| Mbps | Bytes/sec | Burst (1 sec) |
|------|-----------|---------------|
| 1 | 125,000 | 125 KB |
| 10 | 1,250,000 | 1.25 MB |
| 50 | 6,250,000 | 6.25 MB |
| 100 | 12,500,000 | 12.5 MB |

## Mobile Configuration

### MobileConfig (SPEC_07 §8)

```rust
MobileConfig {
    cache_limit_gb: f64,           // Default: 2.0
    serve_on_wifi_only: bool,      // Default: true
    cellular_limit_mb_per_day: u32, // Default: 100
    background_serving: bool,       // Default: false
}
```

### WiFi-Only Mode

When `serve_on_wifi_only` is true:

1. A network state provider callback is registered
2. Before seeding, the callback is checked
3. If on cellular, seeding is blocked

```rust
// Register network state provider
let provider = Arc::new(|| check_wifi_connected());
manager.set_network_state_provider(provider);
```

## Statistics Tracking

### SeedingStatistics

Tracks seeding activity:

- **bytes_uploaded**: Total bytes served to peers
- **bytes_downloaded**: Total bytes received (symmetry metric)
- **requests_served**: Number of successful GET responses
- **requests_denied**: Number of rate-limited requests
- **bytes_uploaded_last_hour**: Rolling 1-hour window

### SeedingHealth

Health indicator based on recent activity:

| Status | Last Activity |
|--------|---------------|
| Healthy | < 5 minutes |
| Degraded | 5-60 minutes |
| Inactive | > 60 minutes |

### Per-Space Statistics

Track activity per space:

```rust
let stats = manager.statistics();
let space_stats = stats.space_stats(&my_space_id);
println!("Bytes uploaded: {}", space_stats.bytes_uploaded);
```

## Integration with Cache

### Eviction Protection

Own content has eviction priority `OwnContent` (tier 5), which prevents automatic eviction. This ensures users always have their own content available for seeding.

### Cache Iteration for Seeding

```rust
// Get all seedable entries
let entries = cache.get_seedable_entries();
for (hash, space_id, owner_id, created_at) in entries {
    if manager.should_seed(&hash, space_id, owner_id, created_at) {
        // Include in availability announcements
    }
}
```

### Eviction Callback

When content is evicted, a callback can trigger withdrawal announcements:

```rust
let callback = Arc::new(|hash: &ContentBlobHash| {
    availability_handler.on_content_evicted(hash);
});
caching_store.set_eviction_callback(callback);
```

## Usage Examples

### Basic Setup

```rust
use swimchain::seeding::{SeedingManager, SeedingConfig};

let config = SeedingConfig::default();
let manager = SeedingManager::new(config, current_user);
```

### Check if Content Should Be Seeded

```rust
let should_seed = manager.should_seed(
    &content_hash,
    space_id,
    owner_id,
    created_at
);
```

### Handle Bandwidth-Limited GET

```rust
let result = retrieval_manager.on_get_with_seeding(
    &payload,
    space_id,
    &seeding_manager
);

match result {
    Ok((data_payload, bytes_served)) => {
        // Send response
    }
    Err(not_found) => {
        // Bandwidth exhausted or content not found
    }
}
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| SEEDING_DEFAULT_BANDWIDTH_MBPS | 10 | Default bandwidth limit |
| SEEDING_MIN_BANDWIDTH_MBPS | 1 | Minimum bandwidth |
| SEEDING_MAX_BANDWIDTH_MBPS | 100 | Maximum bandwidth |
| SEEDING_DEFAULT_STORAGE_GB | 50 | Default storage limit |
| SEEDING_MAX_STORAGE_GB | 1000 | Maximum storage |
| SEEDING_DEFAULT_DURATION_HOURS | 168 | Default duration (7 days) |
| SEEDING_MIN_DURATION_HOURS | 1 | Minimum duration |
| SEEDING_MAX_DURATION_HOURS | 8760 | Maximum duration (1 year) |
