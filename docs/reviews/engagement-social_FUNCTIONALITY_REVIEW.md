# Functionality Review: Engagement & Social

## Summary

The Engagement & Social feature provides a comprehensive social layer for Swimchain with solid implementations of engagement graph tracking, achievement systems, notifications, space health monitoring, and content attribution. Core functionality works as designed, with well-structured APIs and extensive test coverage. However, **critical bugs** exist in engagement statistics (unique counters never incremented), **2 of 12 achievements are non-functional**, and **documentation thresholds are mismatched** with implementation. The feature is functional for basic use cases but requires immediate fixes before production scaling.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Completeness | 18 | 25 | 2 achievements broken, no real-time notifications, engagement pools deprecated |
| Correctness | 17 | 25 | Critical bug in unique_engagers counters breaks spam detection |
| API Design | 22 | 25 | Well-designed builder patterns, clear naming, minor inconsistencies |
| Integration | 21 | 25 | Good module separation, reasonable dependencies, some tight coupling |
| **Total** | **78** | **100** | |

## Strengths

1. **Well-structured module organization**: Consistent `types.rs`, `storage.rs`, `service.rs` pattern across all subsystems (engagement_graph, achievement, notification, space_health, attribution)

2. **Comprehensive data structures**: `EngagementEdge` tracks per-type counts, recent timestamps for rate analysis; `EngagementStats` aggregates identity-level metrics; clean separation between data and display types

3. **Builder pattern APIs**: `TriggerContext` uses fluent builder pattern (`with_post_count()`, `with_bandwidth()`, etc.) making test construction and real usage intuitive

4. **Extensive test coverage**: 100+ unit tests with excellent boundary testing (e.g., streak thresholds at exactly 6, 7, 8 days; bandwidth at BARON_BYTES-1, BARON_BYTES)

5. **Multi-layer notification throttling**: Sophisticated per-type cooldowns (4hr space health, 24hr content risk), milestone-based streak notifications, daily global limits, and quiet hours support

6. **Sound space health algorithm**: Four weighted components (swimmers 30%, risk 30%, sync 20%, contribution 20%) with linear chain Sybil penalty - well-documented and tested

7. **Clean attribution formatting**: SPEC_09 §6.3 compliant "Kept alive by" display with identity resolution fallback to truncated hex

8. **Proper error types**: Each module defines its own error enum with appropriate variants; implements `From<sled::Error>` for storage errors

## Issues Found

### Critical (Must Fix)

1. **Issue**: `unique_engagers` and `unique_authors_engaged` fields never incremented
   **Location**: `src/engagement_graph/storage.rs:231-261` (`update_stats_outgoing()` and `update_stats_incoming()`)
   **Impact**: The `looks_organic()` spam detection heuristic checks if `incoming_diversity() < 0.1` which uses `unique_engagers / total_incoming`. Since `unique_engagers` is always 0, this check always fails, **completely breaking spam/Sybil detection**. The `_is_self` parameter is passed to both functions but never used to increment unique counts.
   **Recommendation**: In `add_to_adjacency_list()`, when adding a new identity (`!list.contains(other)`), also increment the appropriate unique counter in the stats:
   ```rust
   // When adding to OUT list: increment engager's unique_authors_engaged
   // When adding to IN list: increment author's unique_engagers
   ```

2. **Issue**: AlwaysOn achievement trigger always returns false
   **Location**: `src/achievement/triggers.rs:157-159`
   **Impact**: AlwaysOn achievement is documented but impossible to earn. The `days_at_95_percent_uptime` field in `TriggerContext` is always 0 because daily uptime tracking is not implemented anywhere.
   **Recommendation**: Either (a) implement daily uptime tracking, or (b) mark AlwaysOn as disabled/placeholder in the UI and documentation until implemented

3. **Issue**: AnchorDrop achievement permanently unavailable
   **Location**: `src/achievement/triggers.rs:198` returns hardcoded `false`
   **Impact**: Achievement references deprecated level system. Users see 12 achievements but can only earn 10.
   **Recommendation**: Remove AnchorDrop from `Achievement::all()` or repurpose to a new achievable trigger

4. **Issue**: Documentation threshold mismatches (4 instances)
   **Location**: `docs/features/engagement-social_FEATURE_DOC.md:721-725` vs `src/achievement/triggers.rs:19-29`
   **Impact**: Users following documentation to earn achievements will be confused
   **Discrepancies**:
   - BandwidthBaron: Doc says 1TB, impl is 100GB (107,374,182,400 bytes)
   - TerabyteClub: Doc says 10TB, impl is 1TB (1,099,511,627,776 bytes)
   - KeeperOfTheFlame: Doc says 1000+ posts, impl is 100 posts
   - AlwaysOn: Doc says 7-day streak, impl is 30 days at 95%+ uptime
   **Recommendation**: Update FEATURE_DOC.md and MASTER_FEATURES.md to match actual implementation constants

### Major (Should Fix)

1. **Issue**: Self-engagement tracked but not prevented
   **Location**: `src/engagement_graph/storage.rs:62-63` records `is_self` flag but engagement still proceeds
   **Impact**: Users can game decay timers by engaging with their own content, undermining organic moderation. While `self_engagement_ratio()` is computed, it's only used in `looks_organic()` which is already broken.
   **Recommendation**: Return error immediately in `record_engagement()` if `engager == author`

2. **Issue**: Engagement pools deprecated without migration path
   **Location**: `src/rpc/methods.rs:5616-5651` - `create_pool`, `contribute_to_pool`, `get_pool_info`, `get_pool_for_content` all return `MethodNotFound`
   **Impact**: Feature doc still references pool-based attribution but pools are deprecated. Clients may attempt to use deprecated APIs.
   **Recommendation**: Update feature documentation to clearly indicate pool deprecation and provide migration guidance

3. **Issue**: EfficientSwimmer achievement criteria undefined
   **Location**: `src/achievement/triggers.rs:173-179` - checks `contribution_score / resource_cost >= 2.0`
   **Impact**: `contribution_score` and `resource_cost` are never populated by any service. Achievement is technically earnable but the criteria are meaningless.
   **Recommendation**: Either implement proper contribution/cost tracking or mark as provisional

4. **Issue**: RPC param parsing uses `unwrap_or_default()` silently
   **Location**: `src/rpc/methods.rs:6469` - `serde_json::from_value(params).unwrap_or_default()`
   **Impact**: Malformed `get_chain_engagements` requests receive empty results instead of error responses
   **Recommendation**: Return `InvalidParams` RPC error on parse failure

### Minor (Nice to Fix)

1. **Issue**: `recent_rate()` uses `.unwrap()` after length check
   **Location**: `src/engagement_graph/types.rs:95-96`
   **Impact**: Potential panic under concurrent modification (unlikely but possible)
   **Recommendation**: Use `if let Some((first, last)) = self.recent_timestamps.first().zip(self.recent_timestamps.last())` pattern

2. **Issue**: `Vec::remove(0)` for recent timestamps sliding window
   **Location**: `src/engagement_graph/types.rs:77-79`
   **Impact**: O(n) shift on each removal for MAX_RECENT=100 timestamps
   **Recommendation**: Use `VecDeque` with `push_back()`/`pop_front()` for O(1) operations

3. **Issue**: Inconsistent serialization formats
   **Location**: Engagement graph uses JSON (`serde_json`), other modules use bincode
   **Impact**: 3-5x storage overhead for engagement data, inconsistent architecture
   **Recommendation**: Migrate to bincode for engagement graph (requires one-time data migration)

4. **Issue**: No progress API for locked achievements
   **Location**: `src/achievement/triggers.rs:212-263` - `get_progress()` returns percentages but not exposed via RPC
   **Impact**: UI cannot show "45% toward Centurion (50/100 days)"
   **Recommendation**: Add RPC method `get_achievement_progress(identity)` returning all achievements with progress

5. **Issue**: NotificationService broadcast errors silently ignored
   **Location**: `src/notification/service.rs:162` - `let _ = self.event_tx.send(...)`
   **Impact**: Events dropped when no subscribers; no logging of capacity issues
   **Recommendation**: Log warning when channel is full or send fails

## Missing Functionality

1. **Real-time notification delivery**: Notifications are stored and polled; no WebSocket push implementation exists despite documentation mentioning it as future work

2. **Achievement visibility UI**: 12 achievements defined with badges and descriptions but no RPC method to list/query achievements, no progress tracking exposed

3. **Daily uptime tracking**: Required for AlwaysOn achievement but not implemented; no `UptimeTracker` or similar service exists

4. **Engagement graph export**: No API to export engagement graph for visualization or analysis (mentioned as future work)

5. **Attribution caching**: `format_attribution_display()` recomputes from scratch each call; no caching layer for frequently-accessed content

6. **Space health alerts**: Documentation mentions automatic notifications when health drops below thresholds, but `check_space_health()` must be called manually by callers

## Recommendations

1. **Immediate (P0)**: Fix `unique_engagers`/`unique_authors_engaged` increment in `add_to_adjacency_list()` - trivial fix that restores spam detection functionality

2. **High (P1)**: Update all documentation (FEATURE_DOC.md, MASTER_FEATURES.md) to match actual implementation thresholds

3. **High (P1)**: Block self-engagement in `record_engagement()` to prevent decay timer gaming

4. **Medium (P2)**: Expose achievement progress via RPC so clients can build progress UI

5. **Medium (P2)**: Handle AlwaysOn and AnchorDrop gracefully - either implement or clearly mark as unavailable

6. **Low (P3)**: Migrate engagement graph to bincode serialization for consistency and performance

7. **Low (P3)**: Add WebSocket notification push for real-time delivery

---

*Reviewed: 2026-01-13*
*Reviewer: Functionality Specialist*
*Feature Version: 2.0*
