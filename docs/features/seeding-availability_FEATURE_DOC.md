# Seeding & Availability Feature Documentation

> **Generated**: 2026-01-12
> **Source Section**: MASTER_FEATURES.md §21
> **Implementation Status**: Complete (Phase 3 - Milestone 3.5)
> **Specification**: SPEC_07_CONTENT_DISTRIBUTION.md §5-6

---

## Overview

The Seeding & Availability module provides voluntary content sharing capabilities for the Swimchain network. Nodes can choose to serve content they have cached to other peers, with configurable bandwidth limits, storage constraints, and mobile-aware policies.

### Core Principles

1. **Voluntary Participation**: Seeding is opt-in; no node is required to serve content
2. **Resource Protection**: Token bucket rate limiting prevents network overload
3. **Mobile-First Design**: WiFi-only mode and cellular data limits for mobile devices
4. **Privacy-Preserving**: Content requests require knowing the hash (no enumeration)
5. **Statistics for Achievements**: Tracking enables "Bandwidth Baron" and "Terabyte Club" achievements

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SeedingManager                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Config    │  │ RateLimiter  │  │  Statistics   │  │
│  │ (spaces,    │  │ (token       │  │ (bytes,       │  │
│  │  bandwidth) │  │  bucket)     │  │  requests)    │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  AvailabilityHandler                    │
│  - on_content_stored(): queue for announcement         │
│  - get_announcement_batches(): prepare gossip payloads │
│  - should_reannounce(): check re-announcement timer    │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  PeerAvailabilityMap                    │
│  - record(): track peer content availability           │
│  - get_peers(): find peers with content                │
│  - prune(): remove expired entries                     │
└─────────────────────────────────────────────────────────┘
```

---

## Data Structures

### SeedingMode

```rust
/// Seeding operation mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeedingMode {
    /// Seeding disabled
    Disabled,
    /// Only seed own content
    OwnContent,
    /// Seed own + recently viewed content (default)
    ViewedContent,
    /// Seed all content in specified spaces
    FullSpace,
}

impl Default for SeedingMode {
    fn default() -> Self {
        SeedingMode::ViewedContent
    }
}
```

**Purpose**: Defines what content a node will serve to peers

**Mode Selection Logic** (in `SeedingConfig::mode()`):
1. If `enabled == false` → `Disabled`
2. If `spaces` is non-empty → `FullSpace`
3. If `seed_viewed_content == true` → `ViewedContent`
4. If `seed_own_content == true` → `OwnContent`
5. Otherwise → `Disabled`

**Used by**: `SeedingManager::should_seed()`

> **Note**: Documentation mentions `AllFollowed` and `Everything` modes, but implementation uses `FullSpace` instead.

---

### SeedingConfig

```rust
/// Seeding configuration (SPEC_07 §5)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedingConfig {
    /// Whether seeding is enabled
    pub enabled: bool,
    /// Space IDs to seed (empty = all spaces)
    pub spaces: Vec<SpaceId>,
    /// Bandwidth limit in Mbps (1-100)
    pub bandwidth_limit_mbps: u32,
    /// Storage limit in GB (1-1000)
    pub storage_limit_gb: u32,
    /// Seed own content regardless of duration
    pub seed_own_content: bool,
    /// Seed recently viewed content
    pub seed_viewed_content: bool,
    /// Duration to seed viewed content (hours, 1-8760)
    pub seed_duration_hours: u32,
}
```

**Purpose**: User-configurable seeding behavior

**Default Values**:
| Field | Default | Source |
|-------|---------|--------|
| `enabled` | `true` | Code default |
| `spaces` | `[]` (empty = all) | Code default |
| `bandwidth_limit_mbps` | 10 | `SEEDING_DEFAULT_BANDWIDTH_MBPS` |
| `storage_limit_gb` | 50 | `SEEDING_DEFAULT_STORAGE_GB` |
| `seed_own_content` | `true` | Code default |
| `seed_viewed_content` | `true` | Code default |
| `seed_duration_hours` | 168 (7 days) | `SEEDING_DEFAULT_DURATION_HOURS` |

**Validation Rules** (`validate()`):
- Bandwidth: 1-100 Mbps
- Storage: 1-1000 GB
- Duration: 1-8760 hours (1 hour to 1 year)

**Used by**: `SeedingManager`, JSON configuration files

**Location**: `src/seeding/config.rs:69-98`

---

### MobileConfig

```rust
/// Mobile-specific configuration (SPEC_07 §8)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileConfig {
    /// Cache limit in GB (default: 2)
    pub cache_limit_gb: f64,
    /// Only serve on WiFi (default: true)
    pub serve_on_wifi_only: bool,
    /// Daily cellular limit in MB for chain sync (default: 100)
    pub cellular_limit_mb_per_day: u32,
    /// Allow background serving (default: false)
    pub background_serving: bool,
}
```

**Purpose**: Mobile device constraints for bandwidth and battery conservation

**Default Values**:
| Field | Default | Rationale |
|-------|---------|-----------|
| `cache_limit_gb` | 2.0 | Limited mobile storage |
| `serve_on_wifi_only` | `true` | Preserve cellular data |
| `cellular_limit_mb_per_day` | 100 | Chain sync budget only |
| `background_serving` | `false` | Battery conservation |

**Factory Methods**:
- `MobileConfig::wifi_only()` - Default WiFi-only configuration
- `MobileConfig::with_cellular(limit_mb)` - Allow cellular with limit

**Used by**: `SeedingManager::should_seed()` for WiFi check

**Location**: `src/seeding/config.rs:194-233`

---

### ConfigError

```rust
/// Configuration error
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ConfigError {
    #[error("bandwidth must be {min}-{max} Mbps, got {value}")]
    InvalidBandwidth { min: u32, max: u32, value: u32 },

    #[error("storage must be 1-{max} GB, got {value}")]
    InvalidStorage { max: u32, value: u32 },

    #[error("duration must be {min}-{max} hours, got {value}")]
    InvalidDuration { min: u32, max: u32, value: u32 },
}
```

**Purpose**: Strongly-typed configuration validation errors

**Used by**: `SeedingConfig::validate()`, `SeedingManager::update_config()`

**Location**: `src/seeding/config.rs:34-66`

---

### SeedingManager

```rust
/// Seeding manager (SPEC_07 §5-6)
pub struct SeedingManager {
    config: RwLock<SeedingConfig>,
    rate_limiter: TokenBucketLimiter,
    statistics: SeedingStatistics,
    mobile_config: RwLock<Option<MobileConfig>>,
    network_state_provider: RwLock<Option<NetworkStateProvider>>,
    current_user: IdentityId,
}

/// Network state provider callback (for WiFi-only mode)
pub type NetworkStateProvider = Arc<dyn Fn() -> bool + Send + Sync>;
```

**Purpose**: Central coordinator for seeding configuration, rate limiting, and statistics

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| `config` | `RwLock<SeedingConfig>` | User configuration |
| `rate_limiter` | `TokenBucketLimiter` | Bandwidth control |
| `statistics` | `SeedingStatistics` | Metrics tracking |
| `mobile_config` | `RwLock<Option<MobileConfig>>` | Mobile constraints |
| `network_state_provider` | `RwLock<Option<NetworkStateProvider>>` | WiFi detection callback |
| `current_user` | `IdentityId` | Node owner's identity |

**Used by**: `AvailabilityHandler`, `ContentRetrievalManager`

**Location**: `src/seeding/manager.rs:28-35`

---

### TokenBucketLimiter

```rust
/// Token bucket rate limiter for bandwidth control (SPEC_07 §5)
pub struct TokenBucketLimiter {
    /// Maximum tokens (burst capacity = 1 second of bandwidth)
    max_tokens: u64,
    /// Current token count
    tokens: AtomicU64,
    /// Token refill rate (bytes per second)
    rate_bytes_per_sec: AtomicU64,
    /// Last refill timestamp (nanoseconds since init)
    last_refill_nanos: AtomicU64,
    /// Initialization instant for time reference
    init_instant: Instant,
}
```

**Purpose**: Lock-free bandwidth rate limiting using token bucket algorithm

**Algorithm**:
1. Tokens = bytes available for transmission
2. Burst capacity = 1 second of bandwidth (e.g., 10 Mbps = 1,250,000 bytes)
3. Tokens refill continuously at `rate_bytes_per_sec`
4. `try_acquire(n)` consumes up to `n` tokens, returns actual amount acquired

**Concurrency**: All operations use `AtomicU64` with CAS loops for lock-free access

**Bandwidth Conversion**: `Mbps * 125,000 = bytes/sec`
- 1 Mbps = 125,000 bytes/sec
- 10 Mbps = 1,250,000 bytes/sec
- 100 Mbps = 12,500,000 bytes/sec

**Used by**: `SeedingManager`, `DailyBandwidthLimiter`

**Location**: `src/seeding/rate_limiter.rs:12-23`

---

### SeedingStatistics

```rust
/// Seeding statistics tracker (SPEC_07 §5)
pub struct SeedingStatistics {
    // Atomic counters for lock-free reads
    bytes_uploaded: AtomicU64,
    bytes_downloaded: AtomicU64,
    requests_served: AtomicU64,
    requests_denied: AtomicU64,

    // Per-space stats (behind lock)
    space_stats: RwLock<HashMap<SpaceId, SpaceStats>>,

    // Rolling window for hourly calculation (behind lock)
    hourly_samples: RwLock<VecDeque<RollingSample>>,

    // Last activity timestamp
    last_activity: RwLock<Option<Instant>>,

    // When statistics were created
    created_at: Instant,
}
```

**Purpose**: Track seeding metrics with both aggregate and per-space statistics

**Used by**: `SeedingManager`, achievement system

**Location**: `src/seeding/statistics.rs:55-77`

---

### SpaceStats

```rust
/// Per-space seeding statistics
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SpaceStats {
    /// Bytes uploaded for this space
    pub bytes_uploaded: u64,
    /// Number of requests served for this space
    pub requests_served: u64,
}
```

**Purpose**: Track seeding activity per space

**Used by**: `SeedingStatistics::record_upload()`

**Location**: `src/seeding/statistics.rs:24-30`

---

### SeedingHealth

```rust
/// Seeding health indicator
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SeedingHealth {
    /// Active seeding in last 5 minutes
    Healthy,
    /// Some activity but degraded (5-60 minutes)
    Degraded,
    /// No activity in last 60 minutes
    Inactive,
}
```

**Purpose**: Quick health status indicator for UI

**Thresholds**:
| Status | Time Since Last Activity |
|--------|-------------------------|
| `Healthy` | < 5 minutes (300 seconds) |
| `Degraded` | 5-60 minutes |
| `Inactive` | > 60 minutes |

**Used by**: `SeedingStatistics::health()`, UI status displays

**Location**: `src/seeding/statistics.rs:33-47`

---

### StatisticsSnapshot

```rust
/// Snapshot of statistics at a point in time
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticsSnapshot {
    pub bytes_uploaded: u64,
    pub bytes_downloaded: u64,
    pub requests_served: u64,
    pub requests_denied: u64,
    pub bytes_uploaded_last_hour: u64,
    pub health: SeedingHealth,
    pub space_stats: HashMap<SpaceId, SpaceStats>,
    pub uptime_secs: u64,
}
```

**Purpose**: Immutable snapshot of all statistics for serialization/display

**Methods**:
- `summary() -> String` - Human-readable summary

**Used by**: `SeedingManager::statistics_snapshot()`, RPC responses

**Location**: `src/seeding/statistics.rs:271-289`

---

### AvailabilityAnnouncePayload

```rust
/// AVAILABILITY_ANNOUNCE payload (SPEC_07 §6)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AvailabilityAnnouncePayload {
    /// Space the content belongs to
    pub space_id: [u8; 32],
    /// When this announcement expires (UNIX seconds)
    pub expires_at: u64,
    /// Content hashes being announced (max 100)
    pub hashes: Vec<[u8; 32]>,
}
```

**Purpose**: Wire format for gossip-based content availability announcements

**Wire Format** (little-endian):
| Field | Bytes | Description |
|-------|-------|-------------|
| `space_id` | 32 | Space identifier |
| `expires_at` | 8 | Expiry timestamp (u64) |
| `count` | 2 | Number of hashes (u16, max 100) |
| `hashes` | 32 × count | Content hashes |

**Total size**: 42 + (32 × count) bytes

**Used by**: `AvailabilityHandler`, network message handlers

**Location**: `src/seeding/availability.rs:23-31`

---

### AvailabilityHandler

```rust
/// Handles availability announcements (SPEC_07 §6)
pub struct AvailabilityHandler {
    seeding_manager: Arc<SeedingManager>,
    /// Last announcement time per space
    last_announced: RwLock<HashMap<SpaceId, Instant>>,
    /// Pending hashes to announce (queued on content storage)
    pending_announcements: RwLock<HashMap<SpaceId, Vec<ContentBlobHash>>>,
}
```

**Purpose**: Manage content availability gossip announcements

**Used by**: Background task runner, content storage callbacks

**Location**: `src/seeding/availability.rs:124-130`

---

### PeerAvailabilityMap

```rust
/// Tracks which peers have announced availability for content
pub struct PeerAvailabilityMap {
    /// Content hash -> list of peers that have it
    entries: RwLock<HashMap<ContentBlobHash, Vec<PeerAvailability>>>,
    /// TTL for entries in seconds
    ttl_secs: u64,
    /// Maximum entries
    max_entries: usize,
}

/// Peer availability map entry
pub struct PeerAvailability {
    pub recorded_at: Instant,
    pub peer_id: [u8; 32],
}
```

**Purpose**: Track which peers have announced they have specific content

**Configuration**:
| Parameter | Default | Source |
|-----------|---------|--------|
| `ttl_secs` | 300 (5 min) | `PEER_AVAILABILITY_TTL_SECS` |
| `max_entries` | 10,000 | `MAX_PEER_AVAILABILITY_ENTRIES` |

**Used by**: Content retrieval, peer selection

**Location**: `src/seeding/availability.rs:225-241`

---

### DailyBandwidthLimiter

```rust
/// Daily bandwidth limiter with midnight UTC reset
pub struct DailyBandwidthLimiter {
    /// Underlying rate limiter for burst control
    rate_limiter: TokenBucketLimiter,
    /// Daily cap in bytes
    daily_cap_bytes: AtomicU64,
    /// Bytes used today
    bytes_used_today: AtomicU64,
    /// Day start timestamp (Unix seconds, midnight UTC)
    day_start_secs: AtomicU64,
}
```

**Purpose**: Combine daily bandwidth caps with rate limiting for mobile devices

**Features**:
- Automatic midnight UTC reset
- Tracks `bytes_used_today`
- Respects both daily cap and burst rate

**Used by**: Mobile contribution tracking, cellular data management

**Location**: `src/device_constraints/bandwidth.rs:23-35`

---

## Public APIs

### SeedingConfig

#### SeedingConfig::new()
```rust
pub fn new() -> Self
```
**Purpose**: Create config with default values
**Returns**: `SeedingConfig` with sensible defaults

#### SeedingConfig::validate()
```rust
pub fn validate(&self) -> Result<(), ConfigError>
```
**Purpose**: Validate configuration values are within allowed ranges
**Errors**: `ConfigError::InvalidBandwidth`, `InvalidStorage`, `InvalidDuration`

#### SeedingConfig::mode()
```rust
pub fn mode(&self) -> SeedingMode
```
**Purpose**: Determine current seeding mode based on configuration
**Returns**: Computed `SeedingMode`

#### SeedingConfig::own_content_only()
```rust
pub fn own_content_only() -> Self
```
**Purpose**: Factory for minimal seeding (own content only)

#### SeedingConfig::disabled()
```rust
pub fn disabled() -> Self
```
**Purpose**: Factory for disabled seeding

---

### SeedingManager

#### SeedingManager::new()
```rust
pub fn new(config: SeedingConfig, current_user: IdentityId) -> Self
```
**Purpose**: Create manager with specific configuration
**Called from**: Node initialization

#### SeedingManager::with_defaults()
```rust
pub fn with_defaults(current_user: IdentityId) -> Self
```
**Purpose**: Create manager with default configuration
**Called from**: Quick start, tests

#### SeedingManager::should_seed()
```rust
pub fn should_seed(
    &self,
    _hash: &ContentBlobHash,
    space_id: SpaceId,
    owner_id: IdentityId,
    created_at: u64,
) -> bool
```
**Purpose**: Determine if content should be served to peers

**Decision Logic** (evaluated in order):
1. Return `false` if seeding disabled
2. Return `false` if mobile WiFi-only mode and on cellular
3. Return `config.seed_own_content` if owner is current user
4. Return `false` if space filter set and space not in list
5. If `seed_viewed_content`: return `true` if within duration window
6. Return `false` otherwise

**Called from**: `ContentRetrievalManager::on_who_has_with_seeding()`, `on_get_with_seeding()`

**Location**: `src/seeding/manager.rs:89-142`

#### SeedingManager::try_acquire_bandwidth()
```rust
pub fn try_acquire_bandwidth(&self, requested: u64) -> u64
```
**Purpose**: Acquire bandwidth for content transmission
**Returns**: Actual bytes acquired (may be less than requested)
**Side effects**: Consumes tokens from rate limiter

#### SeedingManager::record_served()
```rust
pub fn record_served(&self, bytes: u64, space_id: SpaceId)
```
**Purpose**: Record successful content serving
**Side effects**: Updates statistics counters

#### SeedingManager::record_denied()
```rust
pub fn record_denied(&self)
```
**Purpose**: Record denied request (rate limited)
**Side effects**: Increments `requests_denied` counter

#### SeedingManager::update_config()
```rust
pub fn update_config(&self, new_config: SeedingConfig) -> Result<(), ConfigError>
```
**Purpose**: Update configuration at runtime
**Side effects**: Updates rate limiter if bandwidth changed
**Errors**: `ConfigError` if validation fails

#### SeedingManager::set_mobile_config()
```rust
pub fn set_mobile_config(&self, config: MobileConfig)
```
**Purpose**: Enable mobile constraints
**Side effects**: Enables WiFi-only checking

#### SeedingManager::set_network_state_provider()
```rust
pub fn set_network_state_provider(&self, provider: NetworkStateProvider)
```
**Purpose**: Register callback for WiFi detection
**Side effects**: Provider called during `should_seed()`

---

### TokenBucketLimiter

#### TokenBucketLimiter::new_mbps()
```rust
pub fn new_mbps(mbps: u32) -> Self
```
**Purpose**: Create rate limiter with Mbps limit
**Returns**: Limiter with full burst capacity

#### TokenBucketLimiter::try_acquire()
```rust
pub fn try_acquire(&self, requested: u64) -> u64
```
**Purpose**: Attempt to acquire tokens (bytes)
**Returns**: Actual tokens acquired (0 to `requested`)
**Side effects**: Triggers refill, consumes tokens atomically

**Implementation**: Uses CAS loop for lock-free concurrent access

#### TokenBucketLimiter::available()
```rust
pub fn available(&self) -> u64
```
**Purpose**: Check available tokens without consuming
**Returns**: Current token count after refill

#### TokenBucketLimiter::update_rate()
```rust
pub fn update_rate(&self, mbps: u32)
```
**Purpose**: Change rate limit at runtime
**Side effects**: Caps current tokens if rate reduced

---

### SeedingStatistics

#### SeedingStatistics::record_upload()
```rust
pub fn record_upload(&self, bytes: u64, space_id: SpaceId)
```
**Purpose**: Record content served
**Side effects**: Updates counters, per-space stats, rolling window, last activity

#### SeedingStatistics::health()
```rust
pub fn health(&self) -> SeedingHealth
```
**Purpose**: Get current health status
**Returns**: `Healthy`, `Degraded`, or `Inactive`

#### SeedingStatistics::snapshot()
```rust
pub fn snapshot(&self) -> StatisticsSnapshot
```
**Purpose**: Create immutable snapshot of all statistics
**Returns**: `StatisticsSnapshot` for serialization

---

### AvailabilityHandler

#### AvailabilityHandler::on_content_stored()
```rust
pub fn on_content_stored(&self, hash: ContentBlobHash, space_id: SpaceId)
```
**Purpose**: Queue content for next announcement batch
**Called from**: Content storage callbacks

#### AvailabilityHandler::get_announcement_batches()
```rust
pub fn get_announcement_batches(
    &self,
    space_id: SpaceId,
    all_hashes: &[ContentBlobHash],
) -> Vec<AvailabilityAnnouncePayload>
```
**Purpose**: Create announcement payloads (max 100 hashes each)
**Returns**: Vector of payloads for gossip

#### AvailabilityHandler::should_reannounce()
```rust
pub fn should_reannounce(&self, space_id: &SpaceId) -> bool
```
**Purpose**: Check if re-announcement timer expired (5 minutes)
**Returns**: `true` if should re-announce

#### AvailabilityHandler::mark_announced()
```rust
pub fn mark_announced(&self, space_id: SpaceId)
```
**Purpose**: Record announcement timestamp
**Called from**: After successful gossip

---

### AvailabilityAnnouncePayload

#### AvailabilityAnnouncePayload::serialize()
```rust
pub fn serialize(&self) -> Vec<u8>
```
**Purpose**: Serialize to wire format
**Returns**: Little-endian bytes

#### AvailabilityAnnouncePayload::deserialize()
```rust
pub fn deserialize(data: &[u8]) -> Option<Self>
```
**Purpose**: Parse from wire format
**Returns**: `None` if malformed (too short, count > 100, etc.)

---

### PeerAvailabilityMap

#### PeerAvailabilityMap::record()
```rust
pub fn record(&self, hash: ContentBlobHash, peer_id: [u8; 32])
```
**Purpose**: Record that a peer has content
**Side effects**: May prune if at capacity

#### PeerAvailabilityMap::get_peers()
```rust
pub fn get_peers(&self, hash: &ContentBlobHash) -> Vec<[u8; 32]>
```
**Purpose**: Find peers with specific content
**Returns**: List of peer IDs (filtered by TTL)

---

## Behaviors

### Content Seeding Decision Flow

**Trigger**: WHO_HAS or GET request received

**Process**:
1. Check if seeding is enabled globally
2. If mobile config set with WiFi-only, check network state
3. If content owner is current user, return `seed_own_content` setting
4. If space filter configured, check if content's space is allowed
5. If viewed content seeding enabled, check age against duration limit
6. Default to not seeding

**Outcome**: Boolean decision passed to content retrieval

### Bandwidth Rate Limiting

**Trigger**: Content request with `try_acquire_bandwidth()`

**Process**:
1. `TokenBucketLimiter::refill()` calculates tokens to add based on elapsed time
2. CAS loop atomically updates `last_refill_nanos` and `tokens`
3. `try_acquire()` attempts to consume requested tokens
4. If insufficient, returns actual available amount (partial fulfillment)

**Outcome**: Caller transmits only acquired bytes, prevents overload

### Availability Announcement Protocol

**Trigger**: New content stored locally OR 5-minute re-announce timer

**Process**:
1. `AvailabilityHandler::on_content_stored()` queues hash for announcement
2. Background task calls `should_reannounce()` every 5 minutes
3. `get_announcement_batches()` creates payloads (max 100 hashes each)
4. Payloads serialized and sent via gossip (MSG_AVAILABILITY_ANNOUNCE = 0x29)
5. `mark_announced()` records timestamp

**Outcome**: Peers learn about available content via gossip

### Statistics Health Monitoring

**Trigger**: `SeedingStatistics::health()` called

**Process**:
1. Calculate seconds since `last_activity`
2. If < 300 seconds → `Healthy`
3. If 300-3600 seconds → `Degraded`
4. If > 3600 seconds → `Inactive`

**Outcome**: Health indicator for UI display

### Daily Bandwidth Reset (Mobile)

**Trigger**: Any `DailyBandwidthLimiter` operation

**Process**:
1. `maybe_reset()` calculates current day start (midnight UTC)
2. If current day > stored day, reset `bytes_used_today` to 0
3. Operations respect both daily cap and rate limit

**Outcome**: Fresh bandwidth budget each day

---

## Configuration Options

| Option | Type | Default | Range | Description |
|--------|------|---------|-------|-------------|
| `enabled` | `bool` | `true` | - | Enable/disable all seeding |
| `spaces` | `Vec<SpaceId>` | `[]` | - | Spaces to seed (empty = all) |
| `bandwidth_limit_mbps` | `u32` | 10 | 1-100 | Max upload bandwidth |
| `storage_limit_gb` | `u32` | 50 | 1-1000 | Max storage for seeding |
| `seed_own_content` | `bool` | `true` | - | Always seed own content |
| `seed_viewed_content` | `bool` | `true` | - | Seed viewed content |
| `seed_duration_hours` | `u32` | 168 (7d) | 1-8760 | How long to seed viewed content |

### Mobile-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cache_limit_gb` | `f64` | 2.0 | Cache storage limit |
| `serve_on_wifi_only` | `bool` | `true` | Disable seeding on cellular |
| `cellular_limit_mb_per_day` | `u32` | 100 | Daily cellular budget (chain sync only) |
| `background_serving` | `bool` | `false` | Allow background seeding |

---

## Constants

| Name | Value | Purpose | Source |
|------|-------|---------|--------|
| `SEEDING_DEFAULT_BANDWIDTH_MBPS` | 10 | Default bandwidth limit | `src/types/constants.rs:269` |
| `SEEDING_MIN_BANDWIDTH_MBPS` | 1 | Minimum bandwidth | `src/types/constants.rs:272` |
| `SEEDING_MAX_BANDWIDTH_MBPS` | 100 | Maximum bandwidth | `src/types/constants.rs:275` |
| `SEEDING_DEFAULT_STORAGE_GB` | 50 | Default storage limit | `src/types/constants.rs:278` |
| `SEEDING_MAX_STORAGE_GB` | 1000 | Maximum storage limit | `src/types/constants.rs:281` |
| `SEEDING_DEFAULT_DURATION_HOURS` | 168 | Default seeding duration (7 days) | `src/types/constants.rs:284` |
| `SEEDING_MIN_DURATION_HOURS` | 1 | Minimum duration | `src/types/constants.rs:287` |
| `SEEDING_MAX_DURATION_HOURS` | 8760 | Maximum duration (1 year) | `src/types/constants.rs:290` |
| `AVAILABILITY_ANNOUNCE_BATCH_SIZE` | 100 | Max hashes per announcement | `src/types/constants.rs:293` |
| `AVAILABILITY_REANNOUNCE_SECS` | 300 | Re-announcement interval (5 min) | `src/types/constants.rs:296` |
| `MSG_AVAILABILITY_ANNOUNCE` | 0x29 | Message type code | `src/types/constants.rs:299` |
| `PEER_AVAILABILITY_TTL_SECS` | 300 | Peer availability cache TTL | `src/types/constants.rs:258` |
| `MAX_PEER_AVAILABILITY_ENTRIES` | 10,000 | Max cached entries | `src/types/constants.rs:261` |

### Internal Constants (statistics.rs)

| Name | Value | Purpose |
|------|-------|---------|
| `HEALTHY_THRESHOLD_SECS` | 300 | 5 minutes for Healthy status |
| `DEGRADED_THRESHOLD_SECS` | 3600 | 60 minutes for Inactive status |
| `HOURLY_WINDOW_SECS` | 3600 | Rolling window for hourly stats |

### Background Task Constants (tasks.rs)

| Name | Value | Purpose |
|------|-------|---------|
| `AVAILABILITY_ANNOUNCE_INTERVAL_SECS` | 300 | Background task interval |

---

## Integration Points

### Content Retrieval Integration

The seeding module integrates with `ContentRetrievalManager` via:

```rust
// src/content/retrieval.rs
use crate::seeding::SeedingManager;

impl ContentRetrievalManager {
    // Check seeding before responding to WHO_HAS
    fn on_who_has_with_seeding(&self, hash: ContentBlobHash, seeding: &SeedingManager) -> bool

    // Check seeding before responding to GET
    fn on_get_with_seeding(&self, hash: ContentBlobHash, seeding: &SeedingManager) -> Option<Vec<u8>>
}
```

### Background Tasks Integration

```rust
// src/node/tasks.rs
impl BackgroundTasks {
    /// Spawn availability announcer (5-minute interval)
    pub fn spawn_availability_announcer(&mut self)
}
```

**Current Status**: Placeholder implementation (TODO: integrate with SeedingManager)

### Device Constraints Integration

```rust
// src/device_constraints/bandwidth.rs
use crate::seeding::rate_limiter::TokenBucketLimiter;

pub struct DailyBandwidthLimiter {
    rate_limiter: TokenBucketLimiter,
    // ...
}
```

### Network Messages

| Message | Code | Direction | Purpose |
|---------|------|-----------|---------|
| `MSG_AVAILABILITY_ANNOUNCE` | 0x29 | Broadcast | Announce available content |

---

## Test Coverage

### Unit Tests

| File | Tests | Coverage |
|------|-------|----------|
| `config.rs` | 13 | Mode selection, validation, JSON roundtrip |
| `manager.rs` | 11 | should_seed logic, bandwidth, WiFi-only |
| `rate_limiter.rs` | 12 | Token bucket, concurrency, rate updates |
| `statistics.rs` | 11 | Recording, per-space, health, snapshots |
| `availability.rs` | 10 | Payload serialization, batching, announcements |

**Total**: ~60 tests for seeding module

### Integration Tests

- `tests/mobile_simulation/bandwidth_throttle.rs` - Bandwidth throttling simulation

---

## Gap Analysis

### Documented but Not Implemented

1. **AllFollowed/Everything modes**: Documentation mentions these modes, but implementation uses `FullSpace` instead
2. **battery_threshold in MobileConfig**: Documentation mentions this field, but implementation doesn't include it
3. **Background task integration**: `spawn_availability_announcer()` is a placeholder (TODO comment at `src/node/tasks.rs:1119-1120`)

### Implemented but Not Documented

1. **DailyBandwidthLimiter**: Full implementation in `src/device_constraints/bandwidth.rs` wraps TokenBucketLimiter
2. **SeedingHealth::Degraded**: Third health state between Healthy and Inactive
3. **Rolling hourly window**: `bytes_uploaded_last_hour` calculation

### Not Yet Integrated

1. **RPC methods**: No RPC endpoints for seeding configuration or statistics
2. **CLI commands**: No CLI for seeding management
3. **Achievement system**: Statistics ready but achievement unlocking not wired

---

## Files Reference

| File | LOC | Purpose |
|------|-----|---------|
| `src/seeding/mod.rs` | 94 | Module root, re-exports, documentation |
| `src/seeding/config.rs` | 351 | Configuration structures, validation |
| `src/seeding/manager.rs` | 454 | Central coordinator |
| `src/seeding/rate_limiter.rs` | 337 | Token bucket implementation |
| `src/seeding/statistics.rs` | 493 | Metrics tracking |
| `src/seeding/availability.rs` | 501 | Gossip announcements |
| `src/device_constraints/bandwidth.rs` | 399 | Daily bandwidth limits |
| `src/types/constants.rs` | (lines 266-299) | Seeding constants |

---

## Related Documentation

- **Specification**: `specs/SPEC_07_CONTENT_DISTRIBUTION.md` §5-6
- **Design Guide**: `docs/seeding.md` (240 lines)
- **Protocol Design**: `docs/availability-announcements.md` (277 lines)
- **Background Tasks**: `docs/background-tasks.md`
- **Content Availability**: `docs/content-availability.md`
