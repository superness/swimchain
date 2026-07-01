# Vision & Spec Alignment Review: Engagement Social

**Feature**: Engagement & Social
**Reviewer**: Vision & Spec Alignment Expert
**Date**: 2026-01-13 (Updated)
**Spec Reference**: SPEC_09_SOCIAL_LAYER.md

---

## Summary

The Engagement & Social feature demonstrates **strong philosophical alignment** with Swimchain's decentralized vision - identity IS the keypair, achievements are non-transferable, and spam detection uses organic pattern analysis rather than central moderation. However, significant spec deviations exist: the swimmer level system referenced in notifications was deprecated without updating related code paths, 2 of 12 achievements are non-functional (AnchorDrop due to level deprecation, AlwaysOn lacking uptime tracking), and a **critical spec violation** exists where `unique_engagers`/`unique_authors_engaged` counters are never incremented, breaking the spec-mandated organic pattern detection (SPEC_09 §2.3). The space health computation formula aligns with SPEC_09 §6.1, and attribution follows §6.3 correctly. Future compatibility is compromised by JSON serialization in engagement graph (all other modules use bincode).

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Strong decentralization; minor self-engagement gaming risk |
| Spec Compliance | 16 | 25 | **Critical bug** in unique counter tracking breaks spam detection |
| Architectural Fit | 20 | 25 | JSON serialization inconsistency; level system residue |
| Future Compatibility | 18 | 20 | Level deprecation incomplete; peer attestation not implemented |
| **Total** | **80** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

**Decentralization Excellence**
- **Identity IS the keypair**: Achievements are permanently bound to identity, non-transferable, matching the "no account recovery" philosophy
- **No central authority**: Engagement graph is peer-maintained; no central moderation server
- **PoW spam resistance**: All engagement actions require PoW validation (`submit_engagement` enforces `pow_nonce`, `pow_difficulty`, `pow_hash`)
- **Community-driven governance**: Space health scores (0-100) enable organic community self-assessment without platform intervention
- **Content decay lifecycle**: Attribution system ("kept alive by") makes the natural content lifecycle visible and social

**Empowers Users Over Platforms**
- **Visible contribution**: "Kept alive by" display makes hosting contribution socially visible
- **Opt-out notification model**: Users control all 6 notification types via preferences
- **Self-engagement tracking**: System detects but doesn't prohibit self-engagement, allowing community to observe patterns

**Organic Moderation Philosophy**
- **Space health nudges**: When health < 50, users are notified, encouraging organic community response
- **Decay warnings**: Content risk notifications (24h cooldown) let users decide what to preserve
- **Linear chain warnings**: Sybil detection reduces health score (2 points per warning, max 10) rather than blocking

### Vision Concerns

**Self-Engagement Gaming Possible**
- Self-engagement is tracked but not blocked (per Known Limitation #6)
- Users can boost their own content's decay timer via self-engagement
- **Impact**: Undermines organic moderation; creates asymmetry between honest and gaming users
- **Recommendation**: Add rate limiting or diminishing returns for self-engagement

**Swimmer Level Deprecation Impact**
- SPEC_09 §3-4 defines a 6-level system (NewSwimmer → PoolKeeper) with hosting-based benefits
- Implementation deprecated levels in favor of PoW-only gating
- **Impact**: Removes the "hosting is rewarded" reciprocity that SPEC_09 §4.1 calls "The Fair Exchange"
- The vision statement "Give bandwidth → get faster posting" no longer applies

**Potential Centralization via Notification Service**
- Notifications are stored and polled (no WebSocket push)
- Future WebSocket implementation should use P2P channels, not central server
- **Recommendation**: Document that future notification push must be peer-relayed

---

## Spec Compliance

### Critical Bug: Unique Engager/Author Tracking

**Location**: `src/engagement_graph/storage.rs:231-261`

The `unique_engagers` and `unique_authors_engaged` fields in `EngagementStats` are defined but **never incremented** when new edges are created:

```rust
// storage.rs:245-260 - update_stats_outgoing()
fn update_stats_outgoing(...) {
    stats.total_outgoing += 1;
    // BUG: unique_authors_engaged is NOT incremented when adding new author
    ...
}

// storage.rs:277-293 - update_stats_incoming()
fn update_stats_incoming(...) {
    stats.total_incoming += 1;
    // BUG: unique_engagers is NOT incremented when adding new engager
    ...
}
```

**Impact on Spec Compliance (SPEC_09 §2.3)**:

The `looks_organic()` function at `types.rs:176-193` relies on these counters for spam detection:

```rust
pub fn incoming_diversity(&self) -> f64 {
    if self.total_incoming == 0 || self.unique_engagers == 0 {
        return 0.0;  // Always returns 0.0 because unique_engagers is always 0!
    }
    (self.unique_engagers as f64 / self.total_incoming as f64).min(1.0)
}
```

This breaks the SPEC_09 §2.3 requirement for diversity-based spam detection. The "low diversity" check (`incoming_diversity() < 0.1`) always passes because diversity is always 0.0.

### Spec Deviations

| Spec Reference | Expected (SPEC_09) | Actual (Implementation) | Severity |
|----------------|-------------------|-------------------------|----------|
| **§2.3 unique_engagers** | **Increment on new engager** | **Never incremented** | **Critical** |
| **§2.3 unique_authors_engaged** | **Increment on new author** | **Never incremented** | **Critical** |
| §5.3 Always On | 7-day hosting streak | 30 days at 95%+ uptime (placeholder, non-functional) | High |
| §5.3 AnchorDrop | Reaching Anchor level | Non-functional (levels deprecated) | High |
| §3.1 Swimmer Levels | 6 levels with hosting requirements | Deprecated (PoW-only gating) | High |
| §4.3-4.6 Benefits | PoW reduction, decay extension, priority sync | Not implemented (levels deprecated) | High |
| §5.3 Bandwidth Baron | 1TB served | 100GB (BANDWIDTH_BARON_BYTES) | Medium |
| §5.3 Terabyte Club | 10TB served | 1TB (TERABYTE_CLUB_BYTES) | Medium |
| §5.3 Keeper of Flame | 1000+ posts kept alive | 100+ posts (KEEPER_OF_FLAME_POSTS) | Medium |
| §6.1.1 Health Freshness | 15+ min = 0 points | 5 min threshold for 20 points | Low |

### Protocol Compliance

| Protocol Element | SPEC_09 | Implementation | Status |
|------------------|---------|----------------|--------|
| MSG_SPACE_HEALTH_QUERY (0x34) | §6.1.4 | Implemented | Compliant |
| MSG_SPACE_HEALTH_RESPONSE (0x35) | §6.1.4 | Implemented | Compliant |
| MSG_ATTRIBUTION_QUERY (0x50) | §13.7 | Implemented | Compliant |
| MSG_ATTRIBUTION_RESPONSE (0x51) | §13.7 | Implemented | Compliant |
| Notification types | §7.1 | 6 types implemented | Compliant |
| Throttle rules | §7 | Per-type cooldowns per spec | Compliant |

### Data Structure Compliance

| Structure | SPEC_09 | Implementation | Status |
|-----------|---------|----------------|--------|
| SpaceHealth | §6.1 | Matches (active_swimmers, posts_at_risk, health_score) | Compliant |
| NotificationPreferences | §7.2 | 5 fields including streak_notify_threshold | Compliant |
| EngagementEdge | Not in spec | Custom structure (engager, author, counts) | Extension |
| Achievement triggers | §5.3 | Mismatched thresholds (see above) | Non-compliant |

---

## Architectural Observations

### Fits Well

- **Module organization**: Clean separation (`engagement_graph/`, `achievement/`, `notification/`, `space_health/`, `attribution/`)
- **Storage pattern**: Consistent use of sled with prefixed keys (`edge:`, `out:`, `in:`, `stats:`)
- **Error types**: Module-specific error enums following Rust conventions
- **API pattern**: `record_engagement()`, `check_and_unlock()`, `compute_health_score()` follow existing patterns
- **RPC integration**: `submit_engagement`, `get_chain_engagements` follow JSON-RPC 2.0 conventions

### Concerns

- **Swimmer Level Residue**: `SwimmerLevel` enum still exists and is actively used in:
  - `src/api/anti_abuse.rs:25` - import and usage in `can_post_content()`
  - `src/network/messages.rs:985-995` - wire format `LevelResponsePayload`
  - `src/achievement/service.rs:160` - `update_level()` is a no-op but still called
  - Creates dead code paths and confusion
- **Engagement Pools Deprecation**: RPC methods (`create_pool`, `contribute_to_pool`) return `MethodNotFound` - should be removed
- **AlwaysOn Tracking Gap**: Achievement requires `days_at_95_percent_uptime` but no module tracks this metric
- **JSON vs bincode inconsistency**: Engagement graph uses `serde_json` (storage.rs:41,57,74) while all other modules use bincode - 3-5x storage overhead

### Layer Placement

| Component | Expected Layer | Actual | Assessment |
|-----------|---------------|--------|------------|
| Engagement Graph | Social/Data | `src/engagement_graph/` | Correct |
| Achievement System | Social/Gamification | `src/achievement/` | Correct |
| Notification Service | Application/UX | `src/notification/` | Correct |
| Space Health | Community/Analytics | `src/space_health/` | Correct |
| Attribution | Content/Social | `src/attribution/` | Correct |

---

## Future Compatibility

### Extensibility Assessment

| Aspect | Assessment | Details |
|--------|------------|---------|
| New achievement types | Good | `Achievement` enum can add variants; ID range 0-255 available (12 used) |
| New notification types | Good | `NotificationType` enum extensible; throttle config per-type |
| New engagement types | Good | `EngagementType` enum has only 3 variants; room for Quote, Share, etc. |
| New health components | Good | `compute_health_score_with_warnings()` shows pattern for additional factors |
| WebSocket notifications | Planned | §7 mentions push; `NotificationApiEvent` already has `New` variant |

### Breaking Change Risks

1. **Swimmer Level Re-enablement**: If levels are restored, `update_level()` no-op must be replaced; all level-gated code paths are currently dead
2. **Achievement Threshold Changes**: Changing `KEEPER_OF_FLAME_POSTS` from 100 to 1000 would invalidate earned achievements or require migration
3. **Engagement Pool Restoration**: `engagement_pools` concept deprecated; restoring would require API versioning

### Migration Paths

- **Documented**: Known Limitations section lists 8 items with clear migration guidance
- **Future Work**: 8 specific improvements listed with no breaking changes
- **Deprecation Notice**: Engagement Pools and Swimmer Levels clearly marked as deprecated

### Backwards Compatibility

| Feature | BC Status | Notes |
|---------|-----------|-------|
| Achievement IDs | Stable | IDs 0-11 assigned; new achievements use 12+ |
| Notification storage | Stable | Key format `identity[32]+timestamp[8BE]+id[16]` documented |
| Engagement edge keys | Stable | `edge:{engager}:{author}` format stable |
| RPC methods | Stable | `submit_engagement`, `get_chain_engagements` stable |

---

## Recommendations

### Priority 0: Critical Spec Violations (Immediate)

1. **Fix unique_engagers/unique_authors_engaged tracking**:
   - Location: `src/engagement_graph/storage.rs:231-293`
   - When adding new identity to adjacency list (`add_to_adjacency_list()`), also increment unique counter
   - The fix must detect if this is a NEW engager/author (first edge) vs repeat engagement
   - This is blocking spam detection functionality per SPEC_09 §2.3

```rust
// Suggested fix in add_to_adjacency_list():
if !list.contains(other) {
    list.push(*other);
    // Also increment unique counter in stats
    if prefix == OUT_PREFIX {
        self.increment_unique_authors_engaged(identity)?;
    } else if prefix == IN_PREFIX {
        self.increment_unique_engagers(identity)?;
    }
}
```

### Priority 1: Spec Alignment (Critical)

2. **Update MASTER_FEATURES.md thresholds** to match implementation:
   - Bandwidth Baron: 100GB (not 1TB)
   - Terabyte Club: 1TB (not 10TB)
   - Keeper of Flame: 100+ posts (not 1000+)
   - Always On: 30 days at 95%+ uptime (not 7-day streak)

3. **Implement daily uptime tracking** to enable AlwaysOn achievement:
   - Add `src/uptime/daily_tracker.rs`
   - Track 95%+ uptime days for 30-day window
   - Integrate with `TriggerContext.days_at_95_percent_uptime`

4. **Remove or document Swimmer Level deprecation** formally:
   - Either remove `SwimmerLevel` from `anti_abuse.rs`, `messages.rs`
   - Or document the PoW-only gating decision with rationale
   - Current half-deprecated state creates confusion

### Priority 2: Vision Protection (High)

5. **Add self-engagement rate limiting**:
   - Implement diminishing returns: first self-engagement = 100%, 2nd = 50%, 3rd = 25%, 4th+ = 0%
   - Prevents gaming while allowing occasional self-promotion

6. **Document P2P notification architecture** for future WebSocket implementation:
   - Specify peer-relayed push to avoid central notification server
   - Maintain decentralization commitment

### Priority 3: Architectural Cleanup (Medium)

7. **Remove deprecated RPC methods** (`create_pool`, `contribute_to_pool`, etc.):
   - Currently return `MethodNotFound`
   - Clean removal reduces confusion

8. **Standardize serialization** to bincode across all social modules:
   - Engagement graph currently uses JSON (storage.rs:41,57,74) - 3-5x larger
   - Align with notification module's bincode usage
   - Requires one-time migration of existing data

9. **Remove or re-implement AnchorDrop achievement**:
   - Cannot be earned with deprecated level system
   - Either implement alternative trigger or remove from `Achievement::all()`

### Priority 4: Future Preparation (Low)

10. **Add achievement progress API** per Future Work item #4:
    - Enable UI to show "50/100 posts kept alive" progress
    - Increases user engagement without new features

11. **Add peer attestation hooks** per SPEC_09 §8.2:
    - Contribution claims require 3 attesters minimum
    - Add attestation fields to `EngagementStats`
    - Prepare for network-verified contribution

---

## Conclusion

The Engagement & Social feature embodies Swimchain's decentralization vision well (26/30) - identity anchored to keypairs, no central authority for achievements, and organic spam detection. However, **spec compliance is compromised (16/25)** by a critical bug: the `unique_engagers`/`unique_authors_engaged` counters that SPEC_09 §2.3 requires for spam detection are never incremented, causing `looks_organic()` to always report 0% diversity.

**Overall Grade: 80/100 (Needs Attention)**

The primary concerns are:

1. **Critical bug**: Unique counter tracking is broken - spam detection non-functional
2. **Spec drift**: Level system deprecation created orphaned code and 2 non-functional achievements
3. **Documentation mismatch**: Achievement thresholds in MASTER_FEATURES.md don't match implementation

With the critical bug fixed and level system decision finalized, this feature provides a solid foundation for Swimchain's social layer. The score reflects strong vision alignment offset by spec compliance issues requiring prompt attention.

---

*Review Date: 2026-01-13 (Updated)*
*Reviewer: Vision & Spec Alignment Expert*
*Feature Version: 2.0 (per FEATURE_DOC.md)*
*Spec Reference: SPEC_09_SOCIAL_LAYER.md*
