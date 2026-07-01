# Area Owner Review: Seeding & Availability

**Generated**: 2026-01-13
**Overall Health Score**: 69/100
**Status**: Needs Attention

## Executive Summary

The Seeding & Availability feature has a well-architected backend with a lock-free rate limiter, comprehensive statistics tracking, and a clean modular design. However, **critical integration gaps prevent the feature from being usable**: the background announcement task is a placeholder (TODO), there are no RPC endpoints or CLI commands for user access, and silent lock poisoning failures could mask system issues. The core logic is sound and scores well on performance (81/100) and vision alignment (88/100), but the UX score of 35/100 reflects that users cannot interact with this feature at all. Additionally, availability announcements lack signature verification, creating a peer spoofing vulnerability.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 80/100 | 🟢 |
| Performance | 81/100 | 🟢 |
| Vision Alignment | 88/100 | 🟢 |
| User Experience | 35/100 | 🔴 |
| Accessibility | 48/100 | 🔴 |
| Quality | 75/100 | 🟡 |
| Security | 78/100 | 🟡 |
| **Overall** | **69/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Background Announcement Task is Placeholder
- **Source**: Functionality, Quality, UX Reviews
- **Severity**: Critical
- **Description**: `spawn_availability_announcer()` at `src/node/tasks.rs:1119-1120` contains only a TODO comment and placeholder debug log. The actual gossip broadcast is never executed.
- **Impact**: Content availability is never announced to the network. Peers cannot discover what content is available from this node. The entire gossip-based content discovery mechanism is non-functional.
- **Action**: Implement the background task to call `AvailabilityHandler::get_announcement_batches()` and broadcast via the gossip protocol.
- **Effort**: M (4-8 hours)

### 2. No RPC Endpoints for User Access
- **Source**: Functionality, UX, Vision Reviews
- **Severity**: Critical
- **Description**: Users cannot configure seeding settings or view statistics via the API. The feature is invisible to client applications.
- **Impact**: Web/mobile clients cannot integrate seeding controls. Users must edit config files manually and restart the node. Creates "soft centralization" where platform defaults control user behavior.
- **Action**: Implement RPC methods: `get_seeding_config`, `set_seeding_config`, `get_seeding_stats`
- **Effort**: M (4-6 hours)

### 3. Silent Lock Poisoning Failures
- **Source**: Quality, Security Reviews
- **Severity**: Critical
- **Description**: ~20 sites use `if let Ok(...)` pattern on locks, silently failing when locks are poisoned. Found in `manager.rs`, `availability.rs`, `statistics.rs`.
- **Impact**: Configuration changes may not take effect (caller receives `Ok(())` but config wasn't updated). Statistics recording can fail silently. Hard to debug issues in production.
- **Action**: Add logging for all lock failures. Consider using `parking_lot::RwLock` which doesn't poison, or use `PoisonError::into_inner()` for recovery.
- **Effort**: S (2-4 hours)

### 4. Availability Announcements Lack Signature Verification
- **Source**: Security Review
- **Severity**: Critical (Security)
- **Description**: `PeerAvailabilityMap::record()` accepts `peer_id` as an opaque 32-byte array with no verification that the announcement came from that peer.
- **Impact**: Attackers can spoof peer announcements, advertise false content availability, impersonate other peers to redirect requests, or perform Sybil attacks with fake peer identities.
- **Action**: Require signed announcements with signature verification against the peer's public key before recording.
- **Effort**: L (8-16 hours)

## High Priority Issues

### 1. Unbounded Pending Announcements Queue
- **Source**: Performance Review
- **Severity**: High
- **Description**: `pending_announcements` HashMap in `AvailabilityHandler` has no size limit. If content is stored faster than announced, memory grows without bound.
- **Impact**: Memory exhaustion under sustained content storage load.
- **Action**: Add `max_pending_per_space` limit with oldest-eviction policy.
- **Effort**: S (2-3 hours)

### 2. No Per-Peer Rate Limiting on Announcements
- **Source**: Security Review
- **Severity**: High
- **Description**: Malicious peers can flood `PeerAvailabilityMap` with rapid announcements.
- **Impact**: Memory pressure, legitimate entries evicted, CPU overhead from constant pruning.
- **Action**: Track announcement counts per peer, implement exponential backoff for excessive senders.
- **Effort**: M (4-6 hours)

### 3. Statistics HashMap Lock Contention
- **Source**: Performance Review
- **Severity**: High
- **Description**: `space_stats` uses `RwLock<HashMap>` with write lock acquired on every upload.
- **Impact**: At high upload rates (>1000/sec), lock contention degrades throughput.
- **Action**: Replace with `DashMap` for 3-5x throughput improvement.
- **Effort**: S (1-2 hours)

### 4. No CLI Commands
- **Source**: UX Review
- **Severity**: High
- **Description**: No CLI for seeding management exists.
- **Impact**: Node operators cannot manage seeding from the command line.
- **Action**: Implement `cs seeding show|enable|disable|set` commands.
- **Effort**: S (2-3 hours)

## Medium Priority Issues

### 1. `storage_limit_gb` Configuration Not Enforced
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: Config accepts `storage_limit_gb` but `SeedingManager` doesn't check or enforce it.
- **Impact**: Users configure storage limits that are never enforced, leading to unexpected disk usage.
- **Action**: Either implement enforcement or remove the config option.
- **Effort**: M (4-6 hours to implement, 30min to remove)

### 2. `update_config()` Returns Ok Even on Write Failure
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: Rate limiter is updated but if config write fails due to lock poisoning, `Ok(())` is still returned.
- **Impact**: Callers believe configuration was saved when it wasn't. State inconsistency between rate limiter and stored config.
- **Action**: Return error on lock failure or use atomic update pattern.
- **Effort**: S (1-2 hours)

### 3. Mode Naming Inconsistency
- **Source**: Vision, Functionality Reviews
- **Severity**: Medium
- **Description**: Documentation mentions `AllFollowed`/`Everything` modes but implementation uses `FullSpace`.
- **Impact**: Confusion between documentation and code. Unclear spec compliance.
- **Action**: Either update docs to match code or add the documented modes.
- **Effort**: S (1-2 hours)

### 4. No Expiry Validation in Wire Format
- **Source**: Security Review
- **Severity**: Medium
- **Description**: `expires_at` parsed from network without validation. Could be set to `u64::MAX`.
- **Impact**: Entries never expire naturally, causing memory accumulation.
- **Action**: Validate `expires_at` against `current_time + MAX_TTL`, reject excessive values.
- **Effort**: S (1-2 hours)

### 5. PeerAvailabilityMap Full Prune at Capacity
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: When map reaches 10,000 entries, full O(n×p) prune runs with write lock held.
- **Impact**: Latency spikes during prune operations.
- **Action**: Implement incremental pruning (100 entries per `record()` call).
- **Effort**: M (3-4 hours)

### 6. No Statistics Persistence
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: All statistics are in-memory only, lost on restart.
- **Impact**: Achievement progress lost. Node operators can't track long-term contribution.
- **Action**: Add periodic save/load to disk.
- **Effort**: M (4-8 hours)

## Quick Wins (Low Effort, High Impact)

1. **Add logging for lock poisoning**: Replace all `if let Ok()` with proper `match` that logs errors - 2-4 hours
2. **Replace RwLock with parking_lot**: Drop-in replacement for ~20% faster lock operations - 30 min
3. **Add `#[inline]` to hot path methods**: `rate_limiter.rs:88-90` and similar - 15 min
4. **Add mode descriptions**: `SeedingMode::description()` method for future UI - 30 min
5. **Bound pending announcements**: Add max limit to prevent memory growth - 2 hours
6. **Replace statistics HashMap with DashMap**: Eliminates lock contention on stats - 1-2 hours

## Strengths to Preserve

- **Lock-free rate limiter**: `TokenBucketLimiter` uses CAS loops for thread-safe O(1) bandwidth control - excellent design
- **Comprehensive statistics tracking**: Atomic counters, per-space breakdown, rolling hourly windows - ready for UI
- **Clean module structure**: Well-separated concerns (config, manager, rate_limiter, statistics, availability)
- **Privacy-preserving design**: Hash-based requests prevent content enumeration - aligns with Swimchain vision
- **Mobile-first configuration**: WiFi-only mode, cellular limits, background serving toggle - respects user resources
- **Strong input validation**: `ConfigError` provides specific, actionable error messages
- **Good test coverage**: ~78 unit tests covering core functionality and edge cases

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] Fix background task placeholder at `src/node/tasks.rs:1119-1120`
- [ ] Add logging for all lock poisoning sites (~20 locations)
- [ ] Implement basic RPC endpoints: `get_seeding_config`, `set_seeding_config`, `get_seeding_stats`
- [ ] Bound pending announcements queue with max limit

### Short Term (Next 2-4 Weeks)
- [ ] Add CLI commands for seeding management
- [ ] Implement signature verification on availability announcements
- [ ] Replace `RwLock<HashMap>` with `DashMap` for statistics
- [ ] Add per-peer rate limiting for announcements
- [ ] Validate `expires_at` field in wire format parsing
- [ ] Either enforce `storage_limit_gb` or remove it from config

### Long Term (Backlog)
- [ ] Add statistics persistence to disk
- [ ] Implement incremental pruning in `PeerAvailabilityMap`
- [ ] Create Settings UI panel for seeding configuration
- [ ] Wire achievement system to statistics
- [ ] Add fuzz testing for wire format parsing
- [ ] Reserve DHT message types for hybrid protocol (future)

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Background task placeholder | M | H | 1 |
| Silent lock failures (~20 sites) | S | H | 1 |
| No RPC endpoints | M | H | 1 |
| Unbounded pending queue | S | M | 2 |
| Statistics lock contention | S | M | 2 |
| Mode naming doc/code mismatch | S | L | 3 |
| Unused `_hash` parameter in `should_seed()` | S | L | 4 |
| `max_tokens` not updated on rate change | S | L | 4 |
| Statistics not persisted | M | M | 3 |
| Wire format fuzz tests missing | M | M | 3 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Feature ships without gossip working | High | High | Fix background task before any release |
| Peer spoofing attacks | Medium | Medium | Add signature verification to announcements |
| Memory exhaustion from announcement flood | Medium | Medium | Bound queues, add per-peer limits |
| Silent configuration failures in production | Medium | High | Add logging for all lock sites |
| User frustration due to invisible feature | High | Medium | Prioritize RPC endpoints and basic UI |
| Lock contention under load | Low | Medium | Replace with `DashMap`/`parking_lot` |

## Appendix: Detailed Review Summaries

### Functionality (80/100)
The core seeding logic is well-implemented with a lock-free rate limiter, comprehensive statistics, and clean API design. Critical gaps: background task is placeholder (TODO), no RPC/CLI endpoints, and `storage_limit_gb` isn't enforced. ~78 unit tests cover the module, but integration tests are blocked by the placeholder background task.

**Key Files**: `src/seeding/manager.rs` (454 LOC), `src/seeding/config.rs` (351 LOC), `src/seeding/rate_limiter.rs` (337 LOC)

**Strengths**:
- Lock-free `TokenBucketLimiter` using CAS loops
- Comprehensive validation in `ConfigError`
- Clean factory methods (`own_content_only()`, `disabled()`)

**Gaps**:
- Background task at `tasks.rs:1119-1120` is TODO
- No RPC/CLI integration
- Unused `_hash` parameter in `should_seed()`

### Performance (81/100)
Strong performance design with O(1) rate limiting using CAS loops and bounded data structures. Memory footprint ~750KB typical with 100 active spaces.

**Bottlenecks Identified**:
1. Sequential lock acquisition in `should_seed()` (3 RwLocks)
2. Statistics HashMap write lock on every upload
3. Unbounded pending announcements queue - memory risk
4. Full prune O(n×p) at capacity in `PeerAvailabilityMap`

**Resource Estimates**:
- Memory: ~750 KB typical
- CPU per operation: 50ns-500ns for hot paths
- Network: ~10 bytes/sec average for announcements

### Vision Alignment (88/100)
Excellent alignment with Swimchain's decentralization and user empowerment principles. Voluntary participation model, full user control over resources, and privacy-preserving hash-based requests.

**Vision Strengths**:
- Voluntary seeding - no node required to store anything
- Full user control over bandwidth, storage, spaces, duration
- Privacy-preserving hash-based requests
- Mobile-first design respects user resources

**Vision Concerns**:
- Missing RPC creates "soft centralization" risk
- Background task placeholder affects gossip reliability
- Achievement system not wired

### User Experience (35/100)
**Critical UX failure**: The feature is completely invisible to users. No UI, no RPC, no CLI. Rich statistics are tracked but hidden. Users cannot configure seeding, view their contribution, or understand the feature exists.

**User Flows Blocked**:
- Configuring seeding settings: No way to access
- Viewing seeding statistics: Data tracked but hidden
- Understanding content availability: Internal only
- Mobile configuration: Cannot be changed by user

**Positive Elements** (when accessible):
- Sensible defaults (10 Mbps, WiFi-only, 7-day duration)
- Privacy-preserving design
- Clean validation error messages

### Accessibility (48/100)
Score reflects complete absence of user interface. No WCAG compliance testing possible. Backend error messages are well-structured for future accessibility.

**WCAG Concerns** (for future UI):
- `SeedingHealth` status will likely rely on color coding
- Bandwidth slider will need accessible ARIA labeling
- Mobile settings need clear mode indication

**Recommendations for Implementation**:
- Use semantic HTML structure
- Ensure color independence for health status
- Implement accessible slider controls
- Use live regions for dynamic content

### Quality (75/100)
Good code quality with consistent naming, comprehensive documentation, and ~78 unit tests. Reliability concerns around silent lock poisoning and placeholder background task.

**Code Quality Strengths**:
- Clean module structure with single-responsibility components
- Lock-free rate limiter is well-implemented
- `ConfigError` is strongly typed with helpful messages
- Good documentation with spec references

**Reliability Gaps**:
- Silent lock poisoning failures (~20 sites)
- Background task is placeholder
- Statistics are in-memory only (lost on restart)
- `update_config()` returns Ok even on write failure

### Security (78/100)
Adequate security for voluntary content sharing with good input validation. Critical gap: availability announcements lack signature verification, enabling peer spoofing.

**Threat Model**:
| Threat | Likelihood | Impact | Status |
|--------|------------|--------|--------|
| Announcement spoofing | High | Medium | Not mitigated |
| Memory exhaustion via flooding | Medium | Medium | Partial - max_entries cap |
| Lock poisoning silent failures | Low | High | Not mitigated |
| Wire format parsing DoS | Low | Low | Mitigated |

**Recommendations**:
1. Add signature verification to announcements
2. Replace silent lock poisoning handling
3. Add per-peer rate limiting
4. Validate `expires_at` in wire format

---

*Synthesized from 7 expert reviews*
*Area Owner Review completed: 2026-01-13*
*Next review recommended: After completing "Immediate" action items*
