# User Experience Review: API Layer

## Summary

The API Layer provides a technically sound internal Rust API with good type safety and a clean builder pattern. However, as an internal API consumed by frontends, several UX-critical gaps exist: **PoW cancellation doesn't actually work** (users can't abort long operations), **sync status returns fake data** (misleading users about network state), and **error messages lack actionable guidance**. The event system is well-designed for real-time feedback, but the disabled anti-abuse module means no rate limit feedback exists for users.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Usability | 21 | 30 | Clean API but critical feedback gaps |
| Discoverability | 14 | 20 | Internal API, docs adequate but no inline help |
| Efficiency | 17 | 25 | PoW blocking, non-functional cancellation |
| Delight & Polish | 15 | 25 | Events well-designed, edge cases unhandled |
| **Total** | **67** | **100** | |

## User Flows Analyzed

### Flow 1: Creating a Post (Core User Flow)

**Steps:**
1. User composes message in UI
2. Frontend calls `create_post()` with space ID and body
3. API validates content format against SPEC_12
4. PoW computation begins (blocks thread)
5. Progress callback fires with nonces_tried/elapsed_ms
6. On success, returns ContentId + PoW statistics

**UX Assessment:**
- **Step 1-3**: Smooth, validation happens before expensive PoW
- **Step 4**: **Critical Issue** - PoW blocks synchronously. On slow hardware, UI could freeze for 30+ seconds
- **Step 5**: Progress callback exists but:
  - No estimated time remaining provided by API (UI must calculate)
  - Returning `false` to cancel **does not actually work** (see `commands.rs:219-224`)
- **Step 6**: Good - returns timing stats for user feedback

**Friction Points:**
1. **Cannot cancel PoW** - User clicks cancel, callback returns false, but mining continues
2. **No time estimate** - User doesn't know if they're waiting 5 seconds or 5 minutes
3. **Blocking call** - Not async, frontend must run in thread/worker

**Improvement Recommendations:**
1. Implement actual PoW cancellation via atomic flag check in inner loop
2. Add `estimated_remaining_ms` field to PowProgressCallback params
3. Provide async variant: `create_post_async()` that returns a Future with cancel handle

### Flow 2: Checking Content with Decay Status

**Steps:**
1. User views content in feed
2. Frontend calls `get_content(content_id)`
3. API returns content + decay state + pool info

**UX Assessment:**
- **Excellent decay visibility**: Returns `survival_probability`, `is_decayed`, `is_protected`, `hours_until_decay`
- **Pool integration**: Associated engagement pool included in response
- **Clear error mapping**: `ContentNotFound` vs `Storage` errors

**Friction Points:**
1. No batch query method - fetching 50 items requires 50 calls
2. `hours_until_decay` returns `None` for both protected AND decayed content (ambiguous)

**Improvement Recommendations:**
1. Add `get_contents_batch(Vec<ContentId>)` method
2. Split `hours_until_decay: None` into distinct states:
   ```rust
   decay_status: DecayStatus::Protected | DecayStatus::Decayed | DecayStatus::Active { hours: u64 }
   ```

### Flow 3: Monitoring Sync Status

**Steps:**
1. User opens app
2. Frontend calls `get_sync_status()`
3. API returns current sync state

**UX Assessment:**
- **Critical Issue**: Returns hardcoded placeholder data (`types.rs:96-107`)
```rust
pub fn idle() -> Self {
    Self {
        state: SyncState::Idle,
        current_height: 0,  // Always 0!
        peer_count: 0,      // Always 0!
        ...
    }
}
```

**Friction Points:**
1. **Misleading feedback** - User sees "0 peers, 0 height" even when fully synced
2. **No network awareness** - Cannot tell if offline or fully synchronized
3. **Missing events** - `NetworkEvent::SyncProgress` can be emitted but `get_sync_status()` never reflects it

**Improvement Recommendations:**
1. **Wire to actual sync manager** - This is a blocking UX issue
2. Add `is_online` boolean for quick network status checks
3. Include `last_sync_timestamp` for "last updated X minutes ago" displays

### Flow 4: Subscribing to Real-time Events

**Steps:**
1. Frontend calls `subscribe()` to get broadcast receiver
2. Events flow through channel
3. Frontend pattern-matches on event type

**UX Assessment:**
- **Well-designed event system**: Tagged serialization, comprehensive event types
- **Good variety**: Content, Network, Pool, PoW, Notification events
- **Sub-10ms delivery**: Documented performance target

**Friction Points:**
1. **Buffer overflow silent drop** - If subscriber falls behind, oldest events dropped silently
2. **No reconnection guidance** - If subscriber disconnects, no event indicates state resync needed
3. **NotificationApiEvent not exported** - Consumers can't easily use it (`src/api/mod.rs` omits it)

**Improvement Recommendations:**
1. Add `ApiEvent::SubscriptionLagged { dropped_count: usize }` event
2. Export `NotificationApiEvent` in public API
3. Add `ApiEvent::Reconnect` to signal subscribers should re-fetch state

### Flow 5: Identity Management (Critical for Swimchain)

**Steps:**
1. User sets identity via `set_identity(PortableIdentity)`
2. User performs write operations
3. User clears identity via `clear_identity()`

**UX Assessment:**
- **Simple API**: Set/clear/has_identity pattern is clean
- **No persistence** - Identity must be re-set after client restart

**Friction Points:**
1. **No identity recovery** - If passphrase lost, identity is permanently lost (Swimchain design, not bug)
2. **No validation feedback** - Setting invalid identity silently accepted until first operation
3. **`NoIdentity` error generic** - Could specify which operation needed identity

**Improvement Recommendations:**
1. Add `validate_identity(identity) -> Result<(), IdentityError>` before set
2. Improve error message: `NoIdentity` -> `NoIdentityForPost` / `NoIdentityForReply`
3. Document identity-is-unrecoverable prominently in API docs

## UX Issues

### Critical (Blocking User Tasks)

1. **PoW cancellation non-functional** (`commands.rs:219-224`)
   - User cannot abort long-running PoW
   - Code comment acknowledges: "compute_pow_with_callback doesn't support cancellation"
   - **Impact**: Users trapped in 30+ second operations on slow devices

2. **Sync status returns fake data** (`types.rs:96-107`)
   - Always shows 0 peers, 0 height, Idle state
   - Users cannot determine actual network/sync status
   - **Impact**: No way to know if content is stale or app is offline

### Major (Causing Significant Friction)

1. **No time estimation for PoW**
   - Progress callback receives `(nonces_tried, elapsed_ms)` but no estimate
   - Frontend must guess completion time
   - **Impact**: User anxiety during long operations

2. **Query timeout config ignored** (`config.rs:9`)
   - `query_timeout_ms: 5000` exists but never enforced
   - Slow storage queries block indefinitely
   - **Impact**: Potential UI freezes on large datasets

3. **Content commands don't store** (per feature doc Known Limitation #6)
   - `create_post()` computes PoW, returns ID, but doesn't persist
   - Caller must separately store content
   - **Impact**: Confusing API - "created" content doesn't exist until extra step

4. **Anti-abuse disabled** (709 lines in `anti_abuse.rs`)
   - No rate limiting feedback to users
   - No spam resistance warnings
   - **Impact**: Users get no warning before hitting (non-existent) limits

### Minor (Reducing Delight)

1. **Error messages lack actionable guidance**
   - `"Content not found: {:?}"` - Could suggest "content may have decayed"
   - `"PoW failed: {}"` - Could suggest retry or check system resources

2. **Pool progress can exceed 100%** (fixed in code but conceptually odd)
   - `PoolSummary` caps at 100.0, but over-contribution is possible

3. **ContentFormatError::UnknownFormat(u8)** exposes internal byte value
   - User sees "Unknown format: 5" instead of friendly message

4. **Event buffer overflow silent**
   - No indication to subscriber they missed events

## Positive UX Elements

1. **Clean builder pattern** - `ApiClient::builder().storage(s).pool_manager(pm).build()` is intuitive
2. **Comprehensive decay info** - survival_probability, hours_until_decay, is_protected
3. **Type-safe event system** - Tagged enums serialize cleanly for cross-process communication
4. **Content validation before PoW** - Fails fast on invalid content, doesn't waste user time on PoW
5. **Test PoW mode** - `use_test_pow()` enables fast development/testing
6. **SPEC_12 compliance** - Clear content limits (10KB text, 500KB images, 2048px max)
7. **Good error enum design** - Specific variants for ContentNotFound, NoIdentity, SpaceNotFound

## Recommendations

### Priority 1: Fix Critical UX Gaps

1. **Implement actual PoW cancellation**
   ```rust
   // Add AtomicBool cancellation flag checked in PoW inner loop
   pub fn create_post_cancellable(
       &self, space_id: SpaceId, body: &str, cancel_token: Arc<AtomicBool>
   ) -> Result<PowResult<ContentId>, ApiError>
   ```

2. **Wire sync status to real data**
   - Connect `get_sync_status()` to actual SyncManager
   - Remove hardcoded placeholder response

### Priority 2: Improve Feedback Quality

3. **Add estimated PoW time**
   - Calculate based on difficulty + observed hash rate
   - Include in progress callback or PowEvent::Progress

4. **Enforce query timeouts**
   - Use tokio::time::timeout around storage operations
   - Return `ApiError::QueryTimeout` after configured duration

5. **Batch content retrieval**
   - Add `get_contents_batch(Vec<ContentId>)` for efficient list views

### Priority 3: Polish & Edge Cases

6. **Export NotificationApiEvent** in `mod.rs` re-exports

7. **Improve error messages** with actionable guidance:
   - `ContentNotFound` -> "Content not found. It may have decayed or been removed."
   - `NoIdentity` -> "Identity required. Call set_identity() before posting."

8. **Add event for subscriber lag**
   - `ApiEvent::SubscriptionLagged { dropped_count }` when buffer overflows

## Swimchain-Specific UX Feedback

### PoW Experience: Needs Work (Score: 5/10)
- Progress events exist and are well-designed
- **Critical gap**: Cancellation doesn't work
- **Missing**: Time estimates, async variant
- Good: `PowResult` includes elapsed_ms for post-action feedback

### Decay Communication: Good (Score: 8/10)
- Excellent `ContentResponse` structure with all decay info
- `ContentDecaying` and `ContentDecayed` events for proactive notification
- `hours_until_decay` is user-friendly
- Minor: Ambiguity when `hours_until_decay: None` (protected vs decayed)

### Identity UX: Adequate (Score: 6/10)
- Simple set/clear/has pattern
- `NoIdentity` error is clear
- **Missing**: Validation before set, no persistence guidance
- **Design constraint**: No recovery by design (acceptable for Swimchain model)

### Sync Status Communication: Poor (Score: 2/10)
- Returns placeholder data - completely non-functional
- Events exist (`NetworkEvent::SyncProgress`) but status query ignores them
- Users cannot determine online/offline state
- **Blocking issue** for any production frontend

---

*Review conducted from User Experience perspective focusing on frontend developer experience and end-user feedback quality.*
