# Quality & Reliability Review: Engagement Social

## Summary

The Engagement & Social feature demonstrates **solid code quality** with well-structured modules, comprehensive documentation, and extensive inline tests. However, critical reliability issues exist: the `unique_engagers`/`unique_authors_engaged` counters are never incremented, breaking the spam detection system. Test coverage is strong for unit tests but weak for integration scenarios. Error handling follows Rust best practices using `thiserror`, but several error paths lack recovery mechanisms.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Code Quality | 21 | 25 | Well-structured, good naming, minor DRY violations |
| Test Coverage | 18 | 25 | Excellent unit tests, weak integration coverage |
| Error Handling | 17 | 25 | Good patterns, missing recovery mechanisms |
| Reliability | 13 | 25 | Critical bug breaks spam detection, no retry logic |
| **Total** | **69** | **100** | **Needs Improvement** |

## Code Quality Assessment

### Structure: Good (8/10)
- **Strengths**: Clean module separation across 5 directories (`achievement/`, `notification/`, `space_health/`, `attribution/`, `engagement_graph/`)
- **Proper layering**: Types → Storage → Service pattern consistently applied
- **Good separation**: Wire protocol handlers separate from business logic
- **Issue**: Some duplication between `compute_health_score()` and `HealthScoreBreakdown::compute()` (`src/space_health/compute.rs:62-99` vs `158-228`)

### Naming: Excellent (9/10)
- Consistent `snake_case` for functions, `CamelCase` for types
- Descriptive names: `looks_organic()`, `incoming_diversity()`, `is_self_engagement()`
- Clear enum variants: `NotificationType::ContributionThanks`, `DecayStatus::Protected`
- Well-named constants: `POOL_REQUIRED_POW_SECS`, `MAX_LINEAR_CHAIN_PENALTY`

### Documentation: Very Good (8/10)
- Module-level `//!` documentation with usage examples
- SPEC_09 references throughout (e.g., `src/notification/types.rs:9`)
- Inline examples in doc comments for public APIs
- **Gap**: No architecture decision records (ADRs) for deprecated features

### Technical Debt: Moderate

| Debt Item | Location | Effort |
|-----------|----------|--------|
| Health score duplication | `space_health/compute.rs` | 1 hour |
| Unused `is_self` parameter | `storage.rs:236,268` | 30 min |
| Hardcoded milestones in `record_sent()` | `throttle.rs:305` | 1 hour |
| Level system remnants | `service.rs:160-168` | 2 hours |
| JSON serialization (inefficient) | `engagement_graph/storage.rs` | 4 hours |

## Test Coverage Analysis

| Module | Unit Tests | Integration Tests | E2E Tests | Notes |
|--------|------------|-------------------|-----------|-------|
| achievement/types.rs | Yes (13 tests) | No | No | Boundary tests excellent |
| achievement/service.rs | Yes (14 tests) | No | Partial | Event subscription tested |
| notification/types.rs | Yes (15 tests) | No | No | All context types covered |
| notification/throttle.rs | Yes (19 tests) | Yes (via store) | No | Comprehensive |
| space_health/compute.rs | Yes (20 tests) | No | No | All components tested |
| attribution/types.rs | Yes (10 tests) | No | No | Wire format validated |
| attribution/handler.rs | Yes (11 tests) | No | No | Protocol roundtrip tests |
| engagement_graph/storage.rs | Yes (4 tests) | No | Partial | Flow5 tests engagement |
| engagement_pools.rs | Yes (20 tests) | 7 ignored | No | Integration tests stubbed |

### Test Quality Observations
- **Positive**: Boundary value testing (e.g., `test_health_status_boundaries`)
- **Positive**: Serialization roundtrip tests throughout
- **Positive**: Temporary database usage via `tempfile` crate
- **Negative**: Integration tests marked `#[ignore]` with TODO comments
- **Negative**: No property-based testing for edge cases

## Missing Tests

### Critical
1. **`unique_engagers` counter increment** - No test verifies counter updates
2. **`unique_authors_engaged` counter increment** - No test for this path
3. **Concurrent engagement recording** - Race condition potential untested
4. **Cross-module achievement triggers** - Integration with actual node events

### Major
5. **Achievement UI display** - No tests for badge rendering paths
6. **Notification delivery** - No tests for end-to-end notification flow
7. **Space health with real data** - Only unit tests with synthetic inputs
8. **Attribution caching** - No performance/correctness tests

### Minor
9. **Quiet hours edge cases** - DST transitions, timezone boundaries
10. **Pool expiry cleanup** - Memory leak potential under high load

## Error Handling Issues

### Critical

1. **Issue**: Counter fields never incremented in `EngagementStats`
   **Location**: `src/engagement_graph/storage.rs:231-293`
   **Risk**: `looks_organic()` always returns `true` for `insufficient_data` because `unique_engagers` is always 0
   **Fix**: Add counter increment when new edges are created:
   ```rust
   // In update_stats_outgoing, when is_new_edge:
   stats.unique_authors_engaged += 1;
   // In update_stats_incoming, when is_new_edge:
   stats.unique_engagers += 1;
   ```

2. **Issue**: Missing error propagation in `looks_organic()`
   **Location**: `src/engagement_graph/types.rs:176-193`
   **Risk**: Function relies on broken counters, making spam detection ineffective
   **Fix**: Add validation or fallback mechanism

### Major

1. **Issue**: No recovery for sled write failures
   **Location**: `src/notification/throttle.rs:390-399`
   **Risk**: Throttle state can be lost silently
   **Fix**: Add retry logic or mark notification as failed

2. **Issue**: Achievement unlock not transactional
   **Location**: `src/achievement/service.rs:78-96`
   **Risk**: Partial unlocks if save fails after event broadcast
   **Fix**: Use sled transaction or persist before broadcasting

3. **Issue**: No validation of achievement ID range
   **Location**: `src/notification/types.rs:239`
   **Risk**: Invalid achievement IDs can be stored
   **Fix**: Validate `achievement_id <= 11` on construction

### Minor

1. **Issue**: `generate_notification_id()` uses weak entropy
   **Location**: `src/notification/types.rs:116-134`
   **Risk**: Potential ID collisions under high throughput
   **Fix**: Use `uuid` crate or proper CSPRNG

2. **Issue**: Missing bounds check in `from_bytes()`
   **Location**: `src/attribution/handler.rs:174`
   **Risk**: Array index panic on malformed input
   **Fix**: Already handled with length checks (false positive in initial review)

## Reliability Concerns

### Race Conditions
1. **Engagement graph adjacency updates** (`storage.rs:201-218`) - Non-atomic read-modify-write
2. **Achievement tracker updates** - Multiple concurrent check_and_unlock calls may cause duplicate unlocks
3. **Pool contribution counting** - `contributor_count` may be inaccurate under concurrent writes

### Failure Modes

| Scenario | Current Behavior | Impact |
|----------|------------------|--------|
| sled database corruption | Returns error, no recovery | Data loss |
| Full disk during write | Returns error | Silent data loss |
| Concurrent achievement unlock | May emit duplicate events | UI inconsistency |
| Clock skew between nodes | Streak calculations incorrect | False achievements |
| Pool expiry during contribution | Contribution rejected | Lost work |

### Recovery Mechanisms
- **Present**: `saturating_sub` for timestamp calculations prevents underflow
- **Present**: Daily limit resets automatically on day change
- **Present**: Pool cleanup removes completed/expired pools
- **Missing**: No retry logic for transient storage failures
- **Missing**: No checkpointing for long-running operations
- **Missing**: No degraded mode when dependencies fail

### Timeout Configuration
- Pool window: 10 minutes (`POOL_WINDOW_MS`)
- Space health cooldown: 4 hours
- Content risk cooldown: 24 hours
- Notification expiry: 30 days
- **Missing**: No configurable timeouts for storage operations

## Recommendations

### Priority 1: Fix Critical Bug
1. **Fix counter increment bug** - `src/engagement_graph/storage.rs:231-293`
   - Track `is_new_edge` boolean
   - Increment `unique_engagers`/`unique_authors_engaged` when true
   - Add test coverage for spam detection relying on these counters
   - Estimated effort: 2 hours

### Priority 2: Improve Reliability
2. **Add retry logic for storage operations**
   - Implement exponential backoff for sled writes
   - Add circuit breaker for repeated failures
   - Estimated effort: 4 hours

3. **Make achievement unlock atomic**
   - Use sled transactions
   - Persist before emitting events
   - Estimated effort: 2 hours

### Priority 3: Improve Test Coverage
4. **Enable and implement integration tests**
   - Un-ignore tests in `tests/engagement_pools.rs`
   - Implement multi-node engagement sync tests
   - Estimated effort: 8 hours

5. **Add concurrency tests**
   - Test parallel engagement recording
   - Test parallel achievement checking
   - Estimated effort: 4 hours

### Priority 4: Code Quality
6. **Remove health score computation duplication**
   - Refactor `compute_health_score()` to delegate to `HealthScoreBreakdown`
   - Estimated effort: 1 hour

7. **Replace JSON with bincode in engagement graph**
   - Currently uses `serde_json` unlike other modules
   - Would improve performance and consistency
   - Estimated effort: 2 hours

## Technical Debt Summary

| Item | Description | Effort | Priority |
|------|-------------|--------|----------|
| Counter bug | `unique_engagers`/`unique_authors_engaged` never increment | 2h | Critical |
| Integration tests | 7 tests marked `#[ignore]` with TODOs | 8h | High |
| Retry logic | No retry for transient storage failures | 4h | High |
| Achievement atomicity | Events emitted before persistence confirmed | 2h | Medium |
| Notification ID entropy | Weak ID generation | 1h | Medium |
| Health score DRY | Duplicated computation logic | 1h | Low |
| Level system remnants | Dead code for deprecated levels | 2h | Low |
| JSON inefficiency | engagement_graph uses JSON not bincode | 2h | Low |

---

**Review Date**: 2026-01-13
**Reviewer**: Quality & Reliability Reviewer
**Files Analyzed**: 15 source files, 3 test files
**Lines of Code**: ~3,500 (implementation + tests)

DECISION: review_complete
