# Orphan Handling

This document describes how Swimchain handles orphaned identities in the sponsorship system per SPEC_11 Section 3.2.

## Overview

An identity becomes "orphaned" when their sponsor can no longer vouch for them. This occurs when:

1. **Sponsor Inactivity**: The sponsor has been inactive for more than 90 days
2. **Sponsor Revocation**: The sponsor was permanently revoked (e.g., for illegal content)

Orphaned identities are not immediately penalized. Instead, they enter a grace period and can seek adoption by a PoolKeeper.

## Detection Triggers

### Sponsor Inactivity (90+ Days)

```
ORPHAN_INACTIVITY_THRESHOLD_SECONDS = 7,776,000 (90 days)
```

A background task periodically scans all sponsorships and checks if sponsors have been active. If a sponsor's last activity is more than 90 days ago, their direct sponsees are marked as orphaned.

### Sponsor Permanent Revocation

When an identity is permanently revoked (e.g., for posting illegal content), their direct sponsees are immediately orphaned. This uses cascade protection to prevent the "guilt by association" problem.

## Grace Period

```
ORPHAN_GRACE_PERIOD_SECONDS = 2,592,000 (30 days)
```

When an identity is orphaned, they have a 30-day grace period during which:

- **Full Capabilities Retained**: They can post, reply, engage, and interact normally
- **Sponsoring Restricted**: Only Anchor+ level identities can still sponsor during this period
- **Not Eligible for Adoption**: They must wait until the grace period expires before being adopted

### Capabilities During Grace Period

| Capability | During Grace Period | After Grace Period |
|------------|--------------------|--------------------|
| Post content | Yes | Yes |
| Reply to posts | Yes | Yes |
| Engage (like, share) | Yes | Yes |
| Sponsor others (Resident/Lifeguard) | No | No |
| Sponsor others (Anchor+) | Yes | Yes |

## PoolKeeper Adoption

After the grace period expires, orphaned identities become eligible for adoption by PoolKeeper-level identities.

### Requirements for Adoption

1. **Adopter Level**: Must be PoolKeeper (highest tier)
2. **Orphan Status**: Identity must have `Orphaned` status
3. **Grace Period**: Must be past the 30-day grace period
4. **Valid Signature**: Adopter must sign the adoption request

### Adoption Process

```rust
AdoptionRequest {
    adopter: PublicKey,     // PoolKeeper adopting
    orphan: PublicKey,      // Orphan being adopted
    signature: Signature,   // Adopter's signature
    timestamp: u64,         // Request timestamp
}
```

The signature message format is: `adopter(32 bytes) || orphan(32 bytes) || timestamp(8 bytes BE)`

### Effects of Adoption

When an orphan is adopted:

1. **New Sponsor**: The adopter becomes the new sponsor
2. **New Depth**: Depth is set to `adopter.depth + 1`
3. **Status**: Changed from `Orphaned` to `Active`
4. **Clean Slate**: Any previous penalties are cleared (per RESEARCH_07)

## Cascade Prevention

When a sponsor is revoked, only their **direct sponsees** become orphaned. The sponsees' sponsees remain Active until their immediate sponsor's grace period expires.

### Example

```
Genesis(0) -> A(1) -> B(2) -> C(3)
```

If A is revoked:
- B immediately becomes Orphaned (direct sponsee of A)
- C remains Active (B is still their sponsor)

If B's grace period expires without adoption:
- B cannot sponsor
- C's sponsorship is still valid through B
- C would only be orphaned if B were later revoked

This prevents cascading orphan waves that could destabilize large portions of the network.

## Recovery Paths

Orphaned identities have several paths to restore their full capabilities:

### 1. Get Adopted by a PoolKeeper

The primary path is to be adopted by a PoolKeeper, which:
- Restores Active status
- Provides a new sponsor in the tree
- Clears any prior penalties

### 2. Reach Anchor Level

Orphaned identities at Anchor level or above can still sponsor others (SPEC_11 §3.2). This allows established contributors to continue participating even without a sponsor.

### 3. Wait for Original Sponsor Recovery

If the original sponsor becomes active again (for inactivity-based orphaning), the orphan can potentially be re-sponsored through normal channels.

## API Reference

### Storage Methods

```rust
// Mark identity as orphaned
store.set_orphan_status(&identity, orphaned_at)?;

// Clear orphan status (adoption)
store.clear_orphan_status(&identity, &new_sponsor, new_depth)?;

// Get all orphans
let orphans = store.get_orphans()?;

// Get orphans eligible for adoption
let eligible = store.get_orphans_eligible_for_adoption(current_time)?;
```

### Orphan Detection Task

```rust
let mut task = OrphanDetectionTask::new();

if task.should_scan(current_time) {
    let newly_orphaned = task.scan_for_inactive_sponsors(
        &store,
        current_time,
        |sponsor| get_last_active_timestamp(sponsor),
    )?;
}
```

### Adoption Validation

```rust
// Validate adoption request
orphan::validate_adoption(&request, &store, adopter_level, current_time)?;

// Execute adoption
let result = orphan::execute_adoption(&request, &store)?;
```

## Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `ORPHAN_INACTIVITY_THRESHOLD_SECONDS` | 7,776,000 | 90 days - sponsor inactivity threshold |
| `ORPHAN_GRACE_PERIOD_SECONDS` | 2,592,000 | 30 days - grace period before adoption eligibility |
| `ORPHAN_SCAN_INTERVAL_SECONDS` | 86,400 | 1 day - interval between orphan detection scans |

## Error Types

| Error | Description |
|-------|-------------|
| `CannotOrphanGenesis` | Genesis identities cannot be orphaned |
| `NotOrphaned` | Identity is not in orphaned status |
| `OrphanNotEligibleForAdoption` | Still in grace period |
| `AdopterNotPoolKeeper` | Adopter must be PoolKeeper level |
| `AlreadyAdopted` | Identity has already been adopted |

## Wire Protocol (Future)

Reserved message IDs for network synchronization:

| Message ID | Name | Description |
|------------|------|-------------|
| 0x4E | MSG_ADOPTION_REQUEST | Adoption request broadcast |
| 0x4F | MSG_ADOPTION_RESPONSE | Adoption confirmation/rejection |
| 0x50 | MSG_ORPHAN_NOTIFY | Notify network of new orphan |
| 0x51 | MSG_ADOPTION_OFFER | PoolKeeper offer to adopt |

*Note: Wire protocol implementation is deferred to a future milestone.*
