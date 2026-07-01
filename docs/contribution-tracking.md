# Contribution Tracking

Implementation documentation for Milestone 7.1 - Contribution Tracking.

This module implements SPEC_09 (Social Layer) Section 2: Contribution Metrics.

## Overview

Contribution tracking measures how much a node contributes to the network by hosting content, serving requests, and maintaining uptime. This is the foundation for the reputation system and future lifeguard selection.

**Phase 1 Scope**: Self-reported metrics. Future phases will add peer attestation for verification.

## Data Structures

### ContributionRecord

A signed record capturing all contribution metrics for a single period (week).

```rust
pub struct ContributionRecord {
    pub identity: [u8; 32],          // Ed25519 public key
    pub period: u32,                  // Weeks since genesis
    pub bandwidth_served: u64,        // Bytes
    pub uptime_ratio: u16,            // 0-10000 = 0.00%-100.00%
    pub content_served_count: u32,    // Number of requests
    pub posts_supported: u32,         // Posts kept alive
    pub spaces_active: u16,           // Distinct spaces
    pub previous_hash: [u8; 32],      // Hash chain link
    pub signature: [u8; 64],          // Ed25519 signature
}
```

### StreakTracker

Tracks consecutive days of activity.

```rust
pub struct StreakTracker {
    pub current_streak: u16,     // Current consecutive days
    pub best_streak: u16,        // All-time best
    pub last_active_day: u32,    // Days since genesis
    pub total_active_days: u32,  // Lifetime active days
}
```

### ContributionSummary

Real-time view of current period's contributions.

```rust
pub struct ContributionSummary {
    pub period: u32,
    pub bandwidth_served: u64,
    pub uptime_ratio: u16,
    pub content_served_count: u32,
    pub streak_days: u16,
    pub contribution_score: u64,
}
```

## Period Calculation

Periods are weeks since the genesis epoch.

**Genesis Epoch**: January 1, 2025 00:00:00 UTC (Unix timestamp: 1735689600)

```rust
pub const GENESIS_EPOCH_SECS: u64 = 1735689600;
pub const SECONDS_PER_WEEK: u64 = 604_800;

fn period_from_timestamp(timestamp_secs: u64) -> Option<u32> {
    if timestamp_secs < GENESIS_EPOCH_SECS {
        return None;
    }
    Some(((timestamp_secs - GENESIS_EPOCH_SECS) / SECONDS_PER_WEEK) as u32)
}
```

## Streak Tracking

### Rules

1. **First Activity**: Sets streak to 1
2. **Consecutive Day**: Extends streak by 1
3. **Same Day**: Idempotent (no change)
4. **Gap > 1 Day**: Resets streak to 1
5. **Past Day**: Ignored (no retroactive recording)
6. **Best Streak**: Preserved across resets

### Day Calculation

```rust
pub const SECONDS_PER_DAY: u64 = 86_400;

fn days_since_genesis(timestamp_secs: u64) -> Option<u32> {
    if timestamp_secs < GENESIS_EPOCH_SECS {
        return None;
    }
    Some(((timestamp_secs - GENESIS_EPOCH_SECS) / SECONDS_PER_DAY) as u32)
}
```

### Edge Cases

| Scenario | Current Streak | Best Streak | Total Days |
|----------|----------------|-------------|------------|
| Days 0,1,2 | 3 | 3 | 3 |
| Days 0,1,5 | 1 | 2 | 3 |
| Day 5 twice | 1 | 1 | 1 |
| Days 0-9, break, 20-24 | 5 | 10 | 15 |

## Score Calculation

Per SPEC_09 Section 2.3:

```
contribution_score = bandwidth_score + hosting_score + request_score + engagement_score

where:
  bandwidth_score = bandwidth_served_gb * 100
  hosting_score = content_hosted_gb * uptime_ratio * 10
  request_score = peer_requests_served / 100
  engagement_score = posts_kept_alive (1 point each)
```

### Examples

**Lifeguard Candidate**:
- 50 GB bandwidth, 5 GB hosted, 70% uptime, 5000 requests, 20 posts
- Score: 50×100 + (5×0.70×10) + 5000/100 + 20 = 5000 + 35 + 50 + 20 = **5105**

**Poster Only**:
- 1 GB bandwidth, 0 GB hosted, 20% uptime, 100 requests, 50 posts
- Score: 1×100 + 0 + 100/100 + 50 = 100 + 0 + 1 + 50 = **151**

## Hash Chain

Each ContributionRecord links to the previous via SHA-256 hash.

### Chain Structure

```
Record 0: previous_hash = [0u8; 32] (genesis)
Record 1: previous_hash = SHA256(bincode(Record 0))
Record 2: previous_hash = SHA256(bincode(Record 1))
...
```

### Signature

The signature covers all fields except the signature itself:

```rust
fn signable_bytes(record: &ContributionRecord) -> Vec<u8> {
    let mut temp = record.clone();
    temp.signature = [0u8; 64];
    bincode::serialize(&temp).unwrap()
}
```

### Verification

```rust
fn verify_chain(current: &ContributionRecord, previous: &ContributionRecord) -> bool {
    let expected = sha256(bincode::serialize(previous));
    current.previous_hash == expected
}
```

## Storage

Uses sled database with three trees:

### Trees

| Tree | Key Format | Value |
|------|------------|-------|
| `contribution_records` | identity(32) \|\| period(4 BE) | bincode(ContributionRecord) |
| `contribution_streaks` | identity(32) | bincode(StreakTracker) |
| `contribution_uptime` | identity(32) | bincode(UptimeState) |

### Key Format

Record keys use big-endian period encoding for natural ordering:

```rust
fn record_key(identity: &[u8; 32], period: u32) -> [u8; 36] {
    let mut key = [0u8; 36];
    key[..32].copy_from_slice(identity);
    key[32..36].copy_from_slice(&period.to_be_bytes());
    key
}
```

### Serialization Overhead

- ContributionRecord: ~150 bytes serialized
- StreakTracker: ~20 bytes serialized
- UptimeState: ~16 bytes serialized

## Phase 1 Limitations

1. **Self-Reported**: Metrics are not verified by peers
2. **No Attestation**: No cryptographic proof of contributions
3. **Trust Assumption**: Nodes are assumed honest
4. **Local Only**: Records are stored locally, not propagated

Future phases will add:
- Peer attestation for uptime
- Content availability proofs
- Cross-node verification
- Gossip of contribution records

## Code Examples

### Basic Usage

```rust
use swimchain::contribution::ContributionManager;

// Create manager for an identity
let manager = ContributionManager::new(
    identity_pubkey,
    PathBuf::from("/data/contributions"),
)?;

// Record contributions during normal operation
manager.record_bandwidth_served(1024 * 1024); // 1 MB
manager.record_content_served(10);
manager.record_post_supported();

// Record uptime sample (call every 5 minutes)
manager.record_uptime_sample();

// Get current summary
let summary = manager.get_current_contribution();
println!("Score: {}", summary.contribution_score);
println!("Streak: {} days", summary.streak_days);

// Finalize period (call when period changes)
let record = manager.finalize_period(|bytes| {
    signing_key.sign(bytes)
})?;
```

### Streak Tracking

```rust
use swimchain::contribution::StreakTracker;

let mut streak = StreakTracker::new();

// Record activity by timestamp
streak.record_activity_at(1735689600); // Day 0
streak.record_activity_at(1735776000); // Day 1

println!("Current streak: {}", streak.current_streak); // 2

// Check if streak is active
if streak.is_active(now_secs) {
    println!("Still active!");
}
```

### Uptime Tracking

```rust
use swimchain::contribution::UptimeTracker;

let tracker = UptimeTracker::new();

// Record samples (rate-limited to 5 min intervals)
for i in 0..100 {
    let timestamp = base + (i * 300);
    tracker.record_sample(timestamp, true);
}

// Get ratio
let ratio = tracker.calculate_ratio(); // 0-10000
let percent = ratio as f64 / 100.0;    // 0.0-100.0%
```

### Score Calculation

```rust
use swimchain::contribution::{build_hosting_metrics, contribution_score};

let metrics = build_hosting_metrics(
    50 * 1024 * 1024 * 1024, // 50 GB bandwidth
    5000,                     // 5000 requests
    9500,                     // 95% uptime
    100,                      // 100 posts
);

let score = contribution_score(&metrics);
```

## Testing

Run contribution module tests:

```bash
cargo test contribution::
```

Key test cases:
1. Period calculation from timestamps
2. Streak consecutive/break scenarios
3. Uptime ratio calculation
4. Score formula verification
5. Hash chain integrity
6. Storage round-trips
7. Thread safety of atomic counters
