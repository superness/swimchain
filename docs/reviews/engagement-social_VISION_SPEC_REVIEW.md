# Vision & Spec Alignment Review: Engagement Social

## Summary

The Engagement & Social feature demonstrates **strong alignment with Swimchain's decentralized, community-driven vision** but has **significant spec deviations** in achievement thresholds and **architectural drift** from the hosting-focused swimmer level system. The implementation correctly avoids central authorities and enables organic content moderation through decay mechanics, but the documented swimmer level system (MASTER_FEATURES §11) contradicts SPEC_09's hosting-first philosophy. The feature is extensible and maintains backwards compatibility, though deprecated features (Engagement Pools, Swimmer Levels) need cleaner removal.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 26 | 30 | Strong decentralization; minor drift toward activity metrics over hosting |
| Spec Compliance | 17 | 25 | 4 threshold mismatches, swimr level philosophy mismatch, missing uptime tracking |
| Architectural Fit | 21 | 25 | Good patterns; JSON vs bincode inconsistency; appropriate module placement |
| Future Compatibility | 18 | 20 | Extensible design; deprecated features need cleanup for clean evolution |
| **Total** | **82** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision (Strong: 26/30)

#### Decentralization
- **Engagement Graph**: Directed edges stored locally per node; no central social graph server
- **Achievement System**: Computed locally from verifiable on-chain data; cannot be revoked by central authority
- **Space Health**: Peer-observed metrics (active swimmers, sync age) aggregated from decentralized observations
- **Attribution Display**: "Kept alive by" shows community effort, not platform curation

#### User Empowerment
- **Identity IS Keypair**: Achievements bound to Ed25519 identity; non-transferable aligns with vision
- **PoW for Spam Resistance**: `submit_engagement` requires PoW validation; spam deterrence without central moderation
- **Opt-Out Notifications**: NotificationPreferences gives users control; no mandatory engagement hooks
- **Organic Content Moderation**: Decay + engagement resets implement vision of "content dies naturally without engagement"

#### Privacy Through Encryption
- **Engagement data**: Public space engagement is visible (intentional for social proof)
- **Private space engagement**: Appropriately scoped to space members via existing encryption layer
- **No cross-space tracking**: EngagementGraphStore is per-node; no global engagement surveillance

### Vision Concerns (Lost 4 points)

#### 1. Activity vs Hosting Tension
**SPEC_09 Core Philosophy**: "Levels are about HOSTING, not posting. An active poster with no hosting stays at Regular."

**MASTER_FEATURES §11 Says**:
```
Minnow: 1 week + 5 posts
Regular: 1 month + 25 posts
Swimmer: 3 months + 100 posts
```

**Concern**: The documented swimmer level system rewards posting activity, not hosting contribution. This contradicts SPEC_09 §3.1's hosting-focused levels (Regular: "7+ days, any bandwidth served"). The implementation appears to have deprecated swimmer levels in favor of PoW-only gating, but documentation still describes activity-based progression.

**Vision Impact**: If posting activity grants levels with PoW reductions (SPEC_09 §4.3), users are incentivized to post rather than host. This undermines the "hosting keeps the network alive" philosophy.

#### 2. Self-Engagement Not Blocked
**Implementation**: Self-engagement is tracked (`self_engagement_count`) but not prevented.

**Vision Concern**: Users can game decay timers by engaging with their own content. While `looks_organic()` can flag this, allowing self-engagement undermines organic moderation—content should require *others* to care enough to engage.

#### 3. No Hosting Metrics in Feature Doc
The feature doc focuses entirely on engagement graph, achievements, notifications, space health, and attribution. Missing from the social layer:
- `bandwidth_served` tracking (SPEC_09 §2.2)
- `uptime_ratio` computation (SPEC_09 §2.2)
- `peer_requests_served` logging (SPEC_09 §2.2)
- Peer attestation validation (SPEC_09 §8.2)

**Vision Impact**: The social layer should make hosting contribution visible. Without hosting metrics, the feature reduces to activity gamification rather than infrastructure recognition.

---

## Spec Deviations

### Achievement Threshold Mismatches

| Spec (SPEC_09 §5.3) | Feature Doc | Implementation | Severity |
|---------------------|-------------|----------------|----------|
| Bandwidth Baron: 100GB | Doc: 1TB | Impl: 100GB (`BANDWIDTH_BARON_BYTES = 107,374,182,400`) | High - Doc wrong |
| Terabyte Club: 1TB | Doc: 10TB | Impl: 1TB (`TERABYTE_CLUB_BYTES = 1,099,511,627,776`) | High - Doc wrong |
| Keeper of the Flame: 100+ | Doc: 1000+ | Impl: 100+ (`KEEPER_OF_FLAME_POSTS = 100`) | High - Doc wrong |
| Always On: 30 days 95%+ | Doc: 7-day hosting streak | Impl: 30 days 95%+ (placeholder) | Medium - Doc wrong |

### Swimmer Level Philosophy Mismatch

| Aspect | SPEC_09 | MASTER_FEATURES | Severity |
|--------|---------|-----------------|----------|
| Level basis | Hosting contribution (bandwidth, uptime) | Activity metrics (posts, time) | High |
| Regular requirement | "7+ days, any bandwidth served" | "1 month + 25 posts" | High |
| Lifeguard requirement | "50GB+/month, 70% uptime" | "6 months + 500 posts + hosting" | High |

### Missing Spec Components

| SPEC_09 Section | Spec Requirement | Implementation Status | Severity |
|-----------------|------------------|----------------------|----------|
| §2.2 `bandwidth_served` | Primary contribution metric | Not tracked in engagement_graph | High |
| §2.2 `uptime_ratio` | Primary contribution metric | AlwaysOn placeholder, no real tracking | High |
| §8.2 Attestation validation | 3+ attesters, median value, established attester check | Attestation module exists but not integrated with engagement | Medium |
| §4.3 PoW reduction | Level-based difficulty adjustment | Swimmer levels deprecated; unclear if PoW reduction active | Medium |
| §4.4 Decay extension | Level-based decay multiplier | `decay_countdown_days_with_level()` exists in attribution | Low |

### Protocol Message Alignment

| SPEC_09 Message | Code | Feature Doc | Status |
|-----------------|------|-------------|--------|
| MSG_SPACE_HEALTH_QUERY | 0x34 | 0x34 | ✅ Aligned |
| MSG_SPACE_HEALTH_RESPONSE | 0x35 | 0x35 | ✅ Aligned |
| MSG_ATTRIBUTION_QUERY | 0x50 | 0x50 | ✅ Aligned |
| MSG_ATTRIBUTION_RESPONSE | 0x51 | 0x51 | ✅ Aligned |
| MSG_CONTRIBUTION_CLAIM | 0x30 | Not mentioned | ❌ Missing |
| MSG_CONTRIBUTION_ATTEST | 0x31 | Not mentioned | ❌ Missing |
| MSG_LEVEL_QUERY | 0x32 | Not mentioned | ❌ Missing |
| MSG_LEVEL_RESPONSE | 0x33 | Not mentioned | ❌ Missing |

---

## Architectural Observations

### Fits Well

1. **Module Placement**: `src/engagement_graph/`, `src/achievement/`, `src/notification/`, `src/space_health/`, `src/attribution/` follow established `src/{feature}/` pattern with types.rs, storage.rs, service.rs separation.

2. **Sled Storage Keys**: Prefix-based key format (`edge:`, `out:`, `in:`, `stats:`) matches other modules (content, sponsorship) for consistent range scans.

3. **RPC Integration**: `submit_engagement`, `get_chain_engagements` follow established JSON-RPC 2.0 patterns in `src/rpc/methods.rs`.

4. **Decay Integration**: Attribution module correctly depends on Content & Decay Engine; `decay_countdown_days()` uses `calculate_decay_state()` from decay module.

5. **Sybil Integration**: `submit_engagement` checks sponsorship status via existing sponsorship module.

### Concerns

1. **JSON vs Bincode Inconsistency**
   - EngagementEdge uses JSON serialization
   - NotificationStore uses bincode
   - Recommendation: Align on bincode for 60-70% storage reduction (see Performance Review)

2. **Missing Hosting Metrics Module**
   - SPEC_09 defines contribution tracking in `src/contribution/`
   - Feature doc references `src/engagement_graph/` but not contribution
   - The engagement graph tracks social graph edges, not hosting contribution
   - Need to clarify relationship between engagement_graph and contribution modules

3. **Deprecated Feature Handling**
   - Engagement Pools: RPC methods return `MethodNotFound` (correct)
   - Swimmer Levels: `update_level()` is a no-op (correct)
   - But: AnchorDrop achievement references deprecated level system
   - Recommendation: Remove or update AnchorDrop achievement

4. **Circular Dependency Risk**
   - Notification depends on Achievement (achievement notification)
   - Achievement depends on Notification (achievement triggers notify)
   - Currently works via service layer indirection; monitor for future coupling

---

## Future Compatibility

### Extensibility Assessment (Strong)

1. **Achievement System**: 12-achievement enum is extensible; ID-based lookup allows adding achievements without migration.

2. **Notification Types**: 6-type enum with discriminant byte; space for 250+ additional types.

3. **Space Health Formula**: Weighted component system (30/30/20/20) allows rebalancing without structural changes.

4. **Attribution**: `MAX_DISPLAY_CONTRIBUTORS = 10` is configurable; wire format supports variable contributor counts.

### Breaking Change Risks (Moderate)

1. **EngagementEdge Wire Format**: If EngagementEdge serialization changes, existing stored edges need migration. Current JSON format is flexible but verbose.

2. **Achievement Threshold Changes**: If thresholds change, users may retroactively earn/lose achievements. Current design: achievements are permanent once earned (vision-aligned).

3. **Space Health Score Algorithm**: Formula changes would shift historical health comparisons. Consider versioning health scores.

### Planned Features Alignment

| Future Feature (from Feature Doc §12) | Compatibility | Notes |
|---------------------------------------|---------------|-------|
| WebSocket Notification Push | Good | NotificationService emits events; subscribe pattern ready |
| Achievement Progress API | Good | `get_progress()` exists; need RPC method wrapper |
| Space Health Alerts | Good | `check_space_health()` trigger exists; need threshold config |
| Attribution Caching | Implemented | AttributionManager has 5-minute TTL cache |
| Linear Chain Detection | Partial | SpaceHealth has `linear_chain_warnings`; need full integration |

### Migration Considerations

1. **Engagement Pools → submit_engagement**: Migration path documented; deprecated methods return error.

2. **Swimmer Levels → PoW-only**: Level system removed but AnchorDrop achievement orphaned; needs cleanup.

3. **JSON → Bincode**: Would require one-time migration of all stored EngagementEdges; plan for downtime.

---

## Recommendations

### Priority 1: Fix Documentation (Effort: S)

Update MASTER_FEATURES.md §11 and engagement-social_FEATURE_DOC.md to:
- Correct achievement thresholds to match SPEC_09 and implementation
- Document swimmer level deprecation clearly
- Remove or update activity-based level descriptions
- Add note about hosting contribution tracking being in separate `src/contribution/` module

### Priority 2: Clean Up Deprecated Features (Effort: S)

1. Update AnchorDrop achievement: Either:
   - Remove entirely (breaking for existing holders)
   - Rename to "Early Adopter" with new trigger (e.g., identity age > 1 year)

2. Remove swimmer level enum from MASTER_FEATURES if truly deprecated

3. Document deprecation timeline in feature doc

### Priority 3: Implement Missing Hosting Metrics (Effort: L)

Per SPEC_09 §2.2, the social layer should track and display:
- `bandwidth_served` per identity
- `uptime_ratio` per identity
- Peer attestation for hosting claims

This may be in `src/contribution/` module—clarify relationship with engagement_graph in documentation.

### Priority 4: Block Self-Engagement (Effort: S)

Add validation in `record_engagement()`:
```rust
if engager == author {
    return Err(EngagementGraphError::SelfEngagementNotAllowed);
}
```

This aligns with organic moderation vision: content needs *others* to engage.

### Priority 5: Align Serialization (Effort: M)

Switch EngagementEdge storage from JSON to bincode:
- Reduces storage by 60-70%
- Aligns with notification module pattern
- Requires one-time migration

---

## Vision Compliance Matrix

| Swimchain Principle | Feature Alignment | Score |
|---------------------|-------------------|-------|
| Decentralization | ✅ All data stored per-node; no central authority | 5/5 |
| Identity IS Keypair | ✅ Achievements bound to Ed25519 identity | 5/5 |
| PoW for Spam Resistance | ✅ submit_engagement requires PoW | 5/5 |
| Content Decay | ✅ Attribution shows decay countdown; engagement resets timer | 5/5 |
| No Central Authority | ✅ Space health computed from peer observations | 5/5 |
| Hosting-First Philosophy | ⚠️ Documentation describes activity-based levels | 2/5 |

**Overall Vision Score: 27/30** (would be 30/30 with documentation fixes and hosting metric integration)

---

*Review completed: 2026-01-12*
*Reviewer: Vision & Spec Alignment Reviewer*
*Feature version: 2.0*

DECISION: review_complete
