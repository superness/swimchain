# Quality & Reliability Review: Seeding & Availability

## Summary

The Seeding & Availability module exhibits good code quality with consistent naming, comprehensive documentation, and a well-structured test suite (~60 unit tests). However, reliability concerns exist around silent lock poisoning failures and a placeholder background task that prevents core functionality from working. The error handling is well-typed but some failure paths are swallowed silently.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Code Quality | 21 | 25 | Well-structured, good docs, some silent failures |
| Test Coverage | 20 | 25 | Good unit tests, missing integration tests for background task |
| Error Handling | 17 | 25 | Good typed errors, but lock poisoning handled silently |
| Reliability | 17 | 25 | Background task placeholder, in-memory only stats |
| **Total** | **75** | **100** | |

## Code Quality Assessment

### Structure
**Assessment: Good (8/10)**
- Clean module hierarchy: `mod.rs` → `config.rs` → `manager.rs` → `statistics.rs` → `availability.rs`
- Single-responsibility components (config validation separate from execution)
- Re-exports in `mod.rs` provide clean public API
- Well-documented module-level docs with ASCII architecture diagrams

### Naming
**Assessment: Excellent (9/10)**
- Consistent naming conventions throughout:
  - `SeedingConfig`, `SeedingManager`, `SeedingStatistics`, `SeedingMode`
  - Factory methods: `with_defaults()`, `own_content_only()`, `disabled()`
  - Methods: `should_seed()`, `try_acquire_bandwidth()`, `record_served()`
- Minor issue: `_hash` parameter in `should_seed()` indicates design intent not met

### Documentation
**Assessment: Good (8/10)**
- Spec references throughout (e.g., "SPEC_07 §5")
- `#[must_use]` annotations on all relevant functions
- Constants have clear purpose documentation in `types/constants.rs`
- Doc examples in `mod.rs` show usage patterns
- Minor: Some internal functions lack doc comments

### Technical Debt
| Item | Description | Effort |
|------|-------------|--------|
| Placeholder background task | `spawn_availability_announcer()` at `tasks.rs:1119-1120` is TODO | Medium |
| Unused `_hash` parameter | `should_seed()` takes hash but doesn't use it | Low |
| Doc/code mismatch | `AllFollowed`/`Everything` modes mentioned in docs but not implemented | Low |
| Silent lock failures | Multiple `if let Ok(...)` patterns swallow lock poisoning | Medium |

## Test Coverage Analysis

| Module | Unit Tests | Integration Tests | Notes |
|--------|------------|-------------------|-------|
| `config.rs` | 13 tests | No | Mode selection, validation, JSON roundtrip |
| `manager.rs` | 13 tests | No | should_seed logic, bandwidth, WiFi-only |
| `rate_limiter.rs` | 12 tests | No | Token bucket, concurrency, rate updates |
| `statistics.rs` | 12 tests | No | Recording, per-space, health, snapshots |
| `availability.rs` | 10 tests | No | Payload serialization, batching, announcements |
| `device_constraints/bandwidth.rs` | 18 tests | No | Daily limits, reset, concurrent usage |
| Mobile simulation | N/A | 1 file | `tests/mobile_simulation/bandwidth_throttle.rs` |

**Total: ~78 unit tests, 1 integration test file**

## Missing Tests

1. **Background task integration test** - Cannot test because task is placeholder
2. **End-to-end announcement flow** - Content storage → gossip broadcast → peer map update
3. **Malformed wire format fuzzing** - `AvailabilityAnnouncePayload::deserialize()` needs fuzz tests
4. **Lock poisoning recovery** - No tests verify behavior when locks are poisoned
5. **Clock adjustment handling** - Statistics health with system time changes
6. **High contention scenarios** - `space_stats` lock under concurrent writes
7. **PeerAvailabilityMap TTL expiry** - Tests exist but no time-mocking for deterministic results
8. **Config update race conditions** - Concurrent `update_config()` calls

## Error Handling Issues

### Critical

1. **Issue**: Lock poisoning handled silently throughout codebase
   **Location**: `src/seeding/manager.rs:61-63, 68-70, 75-77, 187-189, 231-233, 238-240`
   **Pattern**:
   ```rust
   if let Ok(mut mc) = self.mobile_config.write() {
       *mc = Some(config);
   }
   // Silent failure if lock is poisoned
   ```
   **Risk**: Poisoned locks indicate a prior panic. Silent handling means:
   - Configuration changes may not take effect
   - Statistics may not be recorded
   - No logging or metrics for debugging
   **Fix**: Add explicit logging or return `Result`:
   ```rust
   match self.mobile_config.write() {
       Ok(mut mc) => *mc = Some(config),
       Err(e) => {
           tracing::error!("Lock poisoned in set_mobile_config: {}", e);
           // Consider: panic, return error, or use PoisonError::into_inner()
       }
   }
   ```

2. **Issue**: Background task is placeholder - core feature non-functional
   **Location**: `src/node/tasks.rs:1098-1127`
   **Code**:
   ```rust
   pub fn spawn_availability_announcer(&mut self) {
       // ...
       _ = ticker.tick() => {
           // TODO: Integrate with SeedingManager
           // seeding_manager.broadcast_availability()
           debug!("Availability announcement (placeholder)");
       }
   }
   ```
   **Risk**: Availability announcements never broadcast; peers cannot discover content
   **Fix**: Complete implementation by passing `SeedingManager` reference and calling announcement methods

### Major

1. **Issue**: `update_config()` validates then silently fails on write
   **Location**: `src/seeding/manager.rs:172-192`
   **Code**:
   ```rust
   pub fn update_config(&self, new_config: SeedingConfig) -> Result<(), ConfigError> {
       new_config.validate()?;
       // Rate limiter update happens here...
       if let Ok(mut config) = self.config.write() {
           *config = new_config;
       }
       Ok(()) // Returns Ok even if write failed!
   }
   ```
   **Risk**: Caller thinks config updated but it wasn't
   **Fix**: Return error on lock failure or use `RwLock::write().expect()`

2. **Issue**: `should_seed()` returns `false` on lock failure (security-sensitive)
   **Location**: `src/seeding/manager.rs:96-99`
   **Code**:
   ```rust
   let config = match self.config.read() {
       Ok(c) => c,
       Err(_) => return false,
   };
   ```
   **Risk**: Lock poisoning would prevent all seeding silently - potentially correct behavior, but no logging
   **Fix**: Log the error for debugging

3. **Issue**: `deserialize()` returns `Option` with no error details
   **Location**: `src/seeding/availability.rs:72-101`
   **Risk**: Debugging parse failures requires guessing which condition failed
   **Fix**: Return `Result<Self, DeserializeError>` with specific error variants

### Minor

1. **Issue**: No metrics/logging for rate-limited requests
   **Location**: `src/seeding/manager.rs:157-159`
   **Risk**: Hard to diagnose why seeding is slow
   **Fix**: Add counter or debug log

2. **Issue**: Statistics `reset()` doesn't notify observers
   **Location**: `src/seeding/statistics.rs:224-241`
   **Risk**: Cached snapshots become stale
   **Fix**: Consider event/callback pattern for reset notification

## Reliability Concerns

### Race Conditions

1. **Config read during update**
   - `should_seed()` reads config via `RwLock`
   - `update_config()` writes config
   - Concurrent calls could see partially updated state
   - **Mitigation**: `RwLock` provides atomic read/write, not a real issue

2. **Daily bandwidth reset race** (`device_constraints/bandwidth.rs:76-86`)
   - `maybe_reset()` has a documented race window at midnight
   - Two threads could both see `current_day > stored_day`
   - **Impact**: Slight over/under counting at day boundary
   - **Severity**: Low - documented and acceptable

3. **Rate limiter CAS contention**
   - Under high concurrency, CAS loops may spin
   - **Mitigation**: Tests verify correct behavior under contention

### Failure Modes

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| Lock poisoning | Silent failure, returns default/false | None - requires restart |
| Rate limit exhausted | Partial acquisition, returns 0 | Automatic refill over time |
| Daily cap reached | Returns 0, `is_cap_reached()` = true | Midnight UTC auto-reset |
| Config validation fails | Returns `Err(ConfigError)` | Caller can retry with valid config |
| Announcement serialization | Always succeeds (infallible) | N/A |
| Announcement deserialization | Returns `None` | Caller should log and skip |

### Recovery Mechanisms

**Present:**
- Token bucket auto-refills based on elapsed time
- Daily bandwidth limiter auto-resets at midnight UTC
- `PeerAvailabilityMap` TTL-based expiry
- Statistics rolling window auto-prunes old samples

**Missing:**
- No persistent storage for statistics (lost on restart)
- No lock recovery strategy (requires restart)
- No graceful degradation for poisoned locks
- No health checks that would detect stuck state

### State Consistency

1. **After config update failure**
   - Rate limiter may be updated even if config write fails
   - State becomes inconsistent between rate and config
   - **Severity**: Medium

2. **After statistics reset**
   - Atomic counters reset independently
   - Per-space stats cleared under lock
   - Brief window where counters and space stats disagree
   - **Severity**: Low - acceptable for metrics

## Recommendations

### Priority 1 (Critical)

1. **Add logging for lock poisoning**
   - Every `if let Ok(...)` on a lock should have an `else` branch that logs
   - Consider using `tracing::error!` with context

2. **Fix `update_config()` consistency**
   - Either return error on lock failure or make operation atomic
   - Ensure rate limiter and config are updated together

3. **Complete background task implementation**
   - This is the #1 reliability issue - core feature doesn't work

### Priority 2 (High)

4. **Add statistics persistence**
   - Save to disk periodically (every N minutes)
   - Load on startup
   - Preserve achievement progress across restarts

5. **Add fuzz testing for wire format**
   - `AvailabilityAnnouncePayload::deserialize()` handles untrusted network input
   - Use cargo-fuzz or proptest

6. **Add integration test for announcement flow**
   - End-to-end test once background task is implemented

### Priority 3 (Medium)

7. **Inject time source for testability**
   - Replace `SystemTime::now()` with trait/callback
   - Enables deterministic testing of health, TTL, duration

8. **Add error details to deserialize**
   - Return `Result<Self, DeserializeError>` instead of `Option`
   - Include offset and expected vs actual values

9. **Add metrics for lock contention**
   - Track how often locks are held/waited
   - Detect if contention becomes problematic

## Technical Debt

| Item | Description | Effort Estimate |
|------|-------------|-----------------|
| Placeholder background task | Complete `spawn_availability_announcer()` | 4-8 hours |
| Silent lock failures | Add logging/error handling to ~20 lock sites | 2-4 hours |
| Statistics persistence | Add periodic save/load to disk | 4-8 hours |
| Wire format fuzz tests | Set up cargo-fuzz, write test harness | 4-6 hours |
| Time injection | Trait for time source + refactor ~10 call sites | 3-5 hours |
| Doc/code sync | Remove or implement AllFollowed/Everything modes | 1-2 hours |

---

*Review Date: 2026-01-13*
*Reviewer: Quality & Reliability Expert*
*Files Analyzed: src/seeding/*.rs, src/device_constraints/bandwidth.rs, src/node/tasks.rs*
