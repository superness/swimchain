# Vision & Spec Alignment Review: Content Decay Engine

## Summary

The Content Decay Engine is **excellently aligned** with Swimchain's core vision of decentralized, organic moderation. It embodies the platform's philosophy that community engagement should determine content longevity without central authority. The implementation closely follows documented specifications with minor deviations in terminology and a few architectural inconsistencies around deprecated pool features. The design is extensible and supports future evolution while maintaining backwards compatibility.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 28 | 30 | Near-perfect alignment with decentralization vision |
| Spec Compliance | 22 | 25 | Minor deviations from MASTER_FEATURES.md |
| Architectural Fit | 22 | 25 | Good patterns with some inconsistencies |
| Future Compatibility | 17 | 20 | Extensible but some migration considerations |
| **Total** | **89** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision

**Decentralization (Excellent)**
- No central authority decides content visibility or removal
- Each node independently calculates decay state - no consensus required
- Community engagement directly influences content lifecycle
- Spam-flagged content uses community attestation thresholds (3 attesters), not central moderation

**User Empowerment (Excellent)**
- Users control content preservation through engagement
- Pin system allows authors to protect their content
- PoW-based reactions ensure engaged users have skin in the game
- Attribution system ("Kept alive by") gives credit to preservers

**Organic Moderation Philosophy (Excellent)**
- Half-life model creates natural content lifecycle
- Popular content survives; irrelevant content fades organically
- No voting, flagging as primary moderation - engagement IS moderation
- 48-hour floor protects new content from premature death

**Proof-of-Work for Sybil Protection (Excellent)**
- Engagements require PoW (`pow_nonce`, `pow_work` fields)
- Prevents spam engagement that could artificially extend content life
- Self-engagement not blocked (costs same PoW) - elegant anti-gaming design
- Counter-attestation requires Lifeguard+ level (earned through time/contribution)

**Privacy Through Design (Good)**
- Content stored by hash, not cleartext identifiers
- Tombstones preserve only summary hash, not full content
- Decay is local computation, not broadcast state

### Vision Concerns

**Minor: Adaptive Half-Life is Global, Not Per-Space (-1 point)**
- All spaces share the same half-life parameter
- High-traffic spaces can't have different decay dynamics
- This creates slight centralization of content policy
- *Impact*: Low - affects performance tuning, not fundamental moderation

**Minor: Tombstone Accumulation (-1 point)**
- Tombstones are never pruned, creating indefinite storage
- While not a centralization risk, it contradicts "organic" lifecycle
- Dead content leaves permanent ghosts in the system

---

## Spec Deviations

| Spec Reference | Expected | Actual | Severity |
|----------------|----------|--------|----------|
| MASTER_FEATURES §4 | `ContentType::Media` variant | No Media type - media via `media_refs` field | Low |
| MASTER_FEATURES §4 | Engagement Pools "Complete" | Pools deprecated, RPC returns errors | Medium |
| MASTER_FEATURES §4 | `display_name` max 31 chars | Documentation says 64 bytes | Low |
| Feature Doc | `lifecycle.rs` for decay | Actually `decay.rs` contains decay calculation | Low |
| SPEC_02 §4.2 | Self-engagement blocked | Implementation allows self-engagement (costs PoW) | Info (by design) |

### Analysis

**Pool Deprecation (Medium Severity)**
The `pool.rs` file still exists with full implementation, and `EngagementResult::PoolPending/PoolCompleted` variants remain in the enum, but the RPC layer returns errors. This creates technical debt:
- Test `test_engage_returns_pool_pending` expects `PoolPending` but implementation now returns `Accepted`
- Dead code path in `engagement.rs:76-82` never returns pool variants
- `MASTER_FEATURES.md` still lists pools as "Complete"

**ContentType::Media Non-Implementation (Low Severity)**
The feature doc clearly notes this as intentional: "Media is attached via the `media_refs` field instead." This is a reasonable architectural decision documented appropriately.

---

## Architectural Observations

### Fits Well

**Module Organization**
- Clean separation: `decay.rs` (calculation), `engagement.rs` (processing), `pruning.rs` (cleanup)
- Types in `types/content.rs`, algorithms in `content/` module
- Constants centralized in `types/constants.rs`

**Type Safety**
- `DecayState` is computed on-demand, not serialized (prevents stale state)
- `ContentLifecycle` enum provides type-safe lifecycle stages
- Saturating arithmetic prevents overflow in engagement counts

**Test Coverage**
- Comprehensive unit tests for decay calculation edge cases
- Floor protection, pin expiry, engagement reset all tested
- Integration tests in `tests/decay_edge_cases.rs`

**Spec References in Code**
- Doc comments reference `SPEC_02`, `SPEC_03`, `SPEC_09`, `SPEC_12`
- Algorithm documentation matches formula in feature doc

### Concerns

**O(n) Pruning Iteration**
- `prune_decayed_content()` iterates all content via `storage.iter()`
- No decay index for efficient candidate lookup
- Architectural pattern doesn't scale with content volume
- *Recommendation*: Add B-tree index on `last_engagement` for pruning candidates

**Recursive Child Checking**
- `has_non_decayed_children()` is recursive without depth limit
- Deep thread trees could cause stack overflow
- No memoization of decay state during pruning pass
- *Recommendation*: Convert to iterative with explicit stack, cache decay calculations

**Pool Infrastructure Remnants**
- `pool.rs` (345 lines) is deprecated but not removed
- `EngagementResult` enum has unused variants
- `on_pool_complete()` function exists but is never called
- *Recommendation*: Remove deprecated pool code or clearly gate behind feature flag

**Timestamp Trust**
- `last_engagement` is updated from `engagement.timestamp` (client-provided)
- No validation that engagement timestamp is reasonable
- Malicious nodes could backdate or future-date engagements
- *Recommendation*: Validate `engagement.timestamp` within tolerance of current time

---

## Future Compatibility

### Extensibility Assessment

**Strong Extensibility**
- `ContentLifecycle` enum can add new stages (e.g., `Archived`, `Preserved`)
- `ReactionType` enum has room for expansion (8 types, u8 discriminant)
- Decay formula parameters are constants, easily configurable per-space in future
- `PinType` has room for new variants (e.g., `SpaceModerator`, `Community`)

**Breaking Change Risks**

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Per-space half-life | High (documented future work) | Add `half_life_secs` to `SpaceConfig`, deprecate global |
| Tombstone cleanup | Medium | Add `tombstone_expiry_ms` field, migration script |
| Video support | Low (currently prohibited) | Add `MediaType::Video` variant, max duration field |
| Preservation PoW pricing | Medium | Document formula before implementing |

### Migration Considerations

**Adding Per-Space Half-Life**
1. Add `custom_half_life_secs: Option<u64>` to space configuration
2. Pass space config to `calculate_decay_state()`
3. Existing content continues with global default
4. No data migration needed - calculation change only

**Tombstone Cleanup**
1. Add `tombstone_created_at` to `Tombstone` struct (migration needed)
2. Implement `prune_old_tombstones()` with configurable TTL
3. Requires schema migration for existing tombstones
4. Consider grace period for thread reconstruction

---

## Recommendations

### Priority 1: Critical Vision/Spec Issues

1. **Update MASTER_FEATURES.md for Pool Deprecation**
   - Change "Engagement Pools | Complete" to "Engagement Pools | Deprecated"
   - Document migration path to `submit_engagement` with emoji
   - Prevents developer confusion and expectation mismatch

2. **Add Engagement Timestamp Validation**
   - Validate `engagement.timestamp` is within ±1 hour of current time
   - Prevents decay manipulation through backdated engagements
   - Critical for maintaining organic moderation integrity

### Priority 2: Architectural Improvements

3. **Remove Deprecated Pool Code**
   - Delete `pool.rs` or move to `deprecated/` module
   - Remove `PoolPending`/`PoolCompleted` from `EngagementResult`
   - Clean up `on_pool_complete()` references
   - Reduces confusion and code maintenance burden

4. **Add Tombstone Expiry Mechanism**
   - Define tombstone TTL (suggest: 90 days after last child activity)
   - Implement cleanup in pruning pass
   - Aligns with organic lifecycle philosophy

### Priority 3: Future-Proofing

5. **Design Per-Space Half-Life Extension**
   - Document space-level decay configuration schema
   - Define bounds (MIN_HALF_LIFE to MAX_HALF_LIFE)
   - Plan API surface for space creators

6. **Document Preservation PoW Pricing**
   - The `preservation_pow` field exists but is undocumented
   - Define cost formula (PoW difficulty for time extension)
   - This is listed in Known Limitations

---

## Conclusion

The Content Decay Engine is a **strong implementation** that embodies Swimchain's vision of decentralized, organic content moderation. The half-life decay model is mathematically sound, the implementation is well-tested, and the architecture supports future evolution.

Key strengths:
- Perfect alignment with decentralization principles
- Community engagement as the sole arbiter of content longevity
- No central authority required for moderation

Areas for attention:
- Clean up deprecated pool infrastructure
- Add timestamp validation for engagement security
- Plan per-space customization for future flexibility

**Overall Assessment**: This feature is ready for production with minor cleanup. The vision alignment is excellent, and the implementation faithfully represents Swimchain's core philosophy.

---

*Reviewed: 2026-01-12*
*Reviewer: Vision & Spec Alignment Expert*
*Feature Version: Current (MASTER_FEATURES v1.1)*
