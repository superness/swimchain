# Sponsorship Rights

This document describes the sponsorship rights system that gates who can sponsor new identities and how often.

## Overview

Swimchain uses contribution-based access control for sponsorship. Only members who have demonstrated sustained contribution to the network can sponsor new identities. This prevents Sybil attacks by making identity creation require real social cost.

## Level Requirements

Sponsorship is gated by SwimmerLevel:

| Level | Can Sponsor | Monthly Capacity | Notes |
|-------|-------------|------------------|-------|
| NewSwimmer | No | 0 | Must contribute before sponsoring |
| Regular | No | 0 | Must reach Resident level |
| Resident | Yes | 1/month | 30+ days, 10GB+ hosting |
| Lifeguard | Yes | 1/month | 50GB+ hosted |
| Anchor | Yes | 3/month | 200GB+ hosted |
| PoolKeeper | Yes | Unlimited | 500GB+ hosted |

### Minimum Requirements

Per SPEC_11 and THESIS_08, Resident level is the minimum for all sponsorships:
- **30 days minimum**: Identity must have been active for at least 30 days
- **10GB minimum hosting**: Must have served at least 10GB of content bandwidth

## Capacity Tracking

### Monthly Window

Sponsorship capacity is tracked per 30-day rolling window (`SPONSORSHIP_WINDOW_SECONDS = 2,592,000`):
- Window resets automatically when 30 days have elapsed since first sponsorship in window
- Unused capacity does not roll over
- Each sponsorship consumes one slot from remaining capacity

### Capacity by Level

```rust
RESIDENT_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 1
LIFEGUARD_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 1
ANCHOR_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 3
POOL_KEEPER_MONTHLY_SPONSORSHIP_CAPACITY: u8 = 255  // Unlimited
```

## Cooldown Enforcement

To prevent rapid sponsorship even within capacity limits:

- **Cooldown period**: 1 hour (`SPONSORSHIP_COOLDOWN_SECONDS = 3600`)
- After each sponsorship, sponsor must wait before sponsoring again
- Cooldown persists across window resets
- Cooldown is tracked per-sponsor, not per-sponsee

## API Usage

### Checking Sponsorship Eligibility

Use `can_sponsor()` to check if an identity can sponsor:

```rust
use swimchain::sponsorship::{RightsStore, SponsorshipCapacityInfo};
use swimchain::level::SwimmerLevel;

let rights_store = RightsStore::from_db(&db)?;
let current_time = SystemTime::now()
    .duration_since(UNIX_EPOCH)?
    .as_secs();

let result: SponsorshipCapacityInfo = rights_store.can_sponsor(
    &sponsor_id,
    SwimmerLevel::Resident,
    current_time,
    |id| sponsorship_store.get_active_penalty(id, current_time),
)?;

if result.can_sponsor {
    println!("Can sponsor, {} slots remaining", result.remaining_slots.unwrap());
} else {
    println!("Cannot sponsor: {:?}", result.denial_reason);
}
```

### SponsorshipCapacityInfo Structure

```rust
pub struct SponsorshipCapacityInfo {
    /// Whether the sponsor can currently sponsor
    pub can_sponsor: bool,

    /// Remaining sponsorship slots this month (None if not eligible)
    pub remaining_slots: Option<u8>,

    /// When the sponsor can next sponsor (None if can sponsor now)
    pub next_available_at: Option<u64>,

    /// Reason sponsorship is denied (None if allowed)
    pub denial_reason: Option<SponsorshipError>,
}
```

### Recording a Sponsorship

After a successful sponsorship, record it:

```rust
rights_store.record_sponsorship(&sponsor_id, current_time)?;
```

This atomically:
1. Increments the sponsorship count for the current window
2. Updates the last sponsorship timestamp for cooldown tracking
3. Uses compare-and-swap for concurrent safety

### Integrated Registration

For convenience, use the integrated function that handles rights checking:

```rust
use swimchain::sponsorship::register_sponsored_identity_with_rights;

register_sponsored_identity_with_rights(
    &sponsorship_store,
    &rights_store,
    &sponsor_id,
    &sponsee_id,
    sponsor_level,
    current_time,
    is_genesis,  // Genesis sponsors bypass capacity checks
)?;
```

## Denial Reasons

When `can_sponsor` returns false, `denial_reason` indicates why:

| Error | Meaning |
|-------|---------|
| `InsufficientLevel { required, actual }` | Sponsor level below Resident |
| `SponsorOnCooldown { available_at }` | Must wait until `available_at` timestamp |
| `ExceedsMonthlyCapacity { used, capacity, level }` | All monthly slots consumed |
| `ActivePenalty` | Sponsor has active penalty from sponsee misbehavior |

## Penalty Integration

Sponsors with active penalties cannot sponsor:
- Penalties propagate from sponsee misbehavior (see SPEC_11 consequence propagation)
- `can_sponsor()` checks for active penalties via a provided closure
- Penalty duration depends on severity (7/30/90 days)

## Genesis Identity Handling

Genesis identities (the initial 100 network identities) have special handling:
- They can sponsor immediately without the 30-day requirement
- They bypass the Resident level requirement
- They are not subject to capacity limits
- This bootstraps the initial sponsor tree

## Implementation Files

- `src/sponsorship/types.rs` - Constants and helper functions
- `src/sponsorship/rights.rs` - RightsStore and can_sponsor() implementation
- `src/sponsorship/error.rs` - SponsorshipError variants
- `src/sponsorship/mod.rs` - Public exports and integration function

## Test Coverage

101 tests cover the sponsorship rights system:
- 17 rights module tests (level gating, cooldown, capacity)
- 20 types module tests (capacity calculations, window reset)
- 35 validation tests (end-to-end flows)
- Additional tests in genesis_list, storage, and error modules

---

*Created: 2025-12-27*
*Related: SPEC_11_SPONSORSHIP_ACCESS.md Section 4*
