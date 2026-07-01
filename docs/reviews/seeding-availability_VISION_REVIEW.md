# Vision & Spec Alignment Review: Seeding & Availability

> **Feature**: Seeding & Availability
> **Reviewer Role**: Vision & Spec Alignment Reviewer
> **Review Date**: 2026-01-13
> **Document Reviewed**: `/docs/features/seeding-availability_FEATURE_DOC.md`
> **Specification**: SPEC_07_CONTENT_DISTRIBUTION.md §5-6

---

## Summary

The Seeding & Availability feature demonstrates **strong alignment with Swimchain's core vision** of decentralization and user empowerment. The voluntary participation model, resource protection through rate limiting, and privacy-preserving design are excellent implementations of the platform's principles. Key concerns include a few spec deviations (mode naming differences) and the incomplete background task integration that could affect gossip protocol reliability. Overall, this feature exemplifies the "no obligation to store" philosophy while enabling organic content availability.

---

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Vision Alignment | 27 | 30 | Strong decentralization, minor central-ish RPC gap |
| Spec Compliance | 21 | 25 | Mode naming deviations, wire format matches |
| Architectural Fit | 23 | 25 | Clean module structure, follows patterns |
| Future Compatibility | 17 | 20 | Good extensibility, DHT migration path unclear |
| **Total** | **88** | **100** | |

---

## Vision Alignment Assessment

### Supports Vision (Strongly)

#### 1. Decentralization (Excellent)
- **Voluntary participation model**: No node is required to seed anything. This perfectly embodies "no central authority" - availability emerges from user choice, not platform mandate.
- **Peer-based content discovery**: `PeerAvailabilityMap` and gossip-based announcements enable discovery without central trackers.
- **No enumeration attack surface**: Content requests require knowing the hash - peers cannot enumerate what a node has.

#### 2. User Empowerment (Excellent)
- **Full control over contribution**: Users choose seeding mode, bandwidth limits, storage limits, and duration.
- **Mobile-first design respects constraints**: WiFi-only mode and cellular limits demonstrate respect for user resources.
- **Space filtering**: Users can choose which spaces to support, enabling targeted community contribution.

#### 3. Organic Moderation Philosophy (Good)
- **Content follows interest**: The "ViewedContent" default means content availability follows organic viewing patterns.
- **Decay integration ready**: Statistics and health monitoring support the achievement system that rewards contribution.
- **No forced hosting**: The view-to-host model (documented in spec) means users only host what they explicitly choose to view.

#### 4. Privacy Through Encryption (Good)
- **Hash-based addressing**: Privacy preserved by content-addressed requests.
- **No announcement of viewing patterns**: Nodes announce what they *have*, not what they *want*.

### Vision Concerns

#### 1. Centralization Risk: Missing RPC Endpoints
**Severity: Medium**

The feature lacks RPC endpoints for users to access and modify seeding configuration. Without these, users must rely on:
- Direct config file editing (technical barrier)
- CLI commands (not implemented)
- Platform-provided defaults

This creates a **soft centralization risk** where platform defaults effectively control seeding behavior for less technical users.

**Recommendation**: Implement `rpc_get_seeding_config()` and `rpc_set_seeding_config()` to empower users.

#### 2. Background Task Placeholder
**Severity: Low-Medium**

The `spawn_availability_announcer()` is a placeholder (TODO at `src/node/tasks.rs:1119-1120`). Without periodic re-announcements, the gossip network may have stale availability data, indirectly impacting content discoverability.

**Recommendation**: Implement the background task to ensure decentralized content discovery works reliably.

#### 3. Achievement System Not Wired
**Severity: Low**

Statistics tracking is complete but not connected to the achievement system. Achievements like "Bandwidth Baron" and "Terabyte Club" are designed to incentivize seeding through social recognition rather than platform rewards - this supports organic moderation philosophy but isn't yet functional.

---

## Spec Deviations

| Spec Element | Expected (SPEC_07) | Actual Implementation | Severity |
|--------------|--------------------|-----------------------|----------|
| Seeding modes | "AllFollowed", "Everything" mentioned in early docs | `FullSpace` used instead | Low - Different name, similar functionality |
| `battery_threshold` in MobileConfig | Mentioned in some docs | Not implemented | Low - Missing mobile optimization |
| Announcement interval | Not explicitly specified | 300 seconds (5 min) - reasonable default | None |
| Bandwidth range | 10 Mbps example in §5 | 1-100 Mbps range with 10 Mbps default | None - Exceeds spec |
| Wire format for AVAILABILITY_ANNOUNCE | space_id:32 + expires_at:8 + count:2 + hashes:32×N | Matches exactly | None |
| Max hashes per announcement | 100 specified in §6 | `AVAILABILITY_ANNOUNCE_BATCH_SIZE = 100` | None |
| Peer availability TTL | Not specified | 300 seconds (5 min) | None - Sensible default |
| Max peer entries | Not specified | 10,000 | None - Bounded as expected |

### Wire Protocol Compliance

The `AvailabilityAnnouncePayload` serialization matches SPEC_07 §6 exactly:
- Little-endian encoding
- Space ID: 32 bytes
- Expires at: 8 bytes (u64)
- Count: 2 bytes (u16, max 100)
- Hashes: 32 bytes × count

**Assessment**: Wire format is spec-compliant and interoperable.

### Constants Alignment

| Constant | Spec Value | Implementation | Status |
|----------|-----------|----------------|--------|
| `SEEDING_DEFAULT_BANDWIDTH_MBPS` | 10 | 10 | ✓ Match |
| `SEEDING_DEFAULT_STORAGE_GB` | 50 | 50 | ✓ Match |
| `SEEDING_DEFAULT_DURATION_HOURS` | 168 (7 days) | 168 | ✓ Match |
| `MSG_AVAILABILITY_ANNOUNCE` | 0x29 | 0x29 | ✓ Match |
| Chunk size | 1MB | (Not in seeding, handled by chunking module) | N/A |

---

## Architectural Observations

### Fits Well

1. **Clean Module Structure**
   - `src/seeding/` follows the established pattern of feature-per-directory
   - Clear separation: config.rs, manager.rs, rate_limiter.rs, statistics.rs, availability.rs
   - Each file has focused responsibility

2. **Lock-Free Rate Limiter**
   - Uses `AtomicU64` with CAS loops - matches Rust performance patterns
   - No `RwLock` in the hot path for bandwidth checks
   - Appropriate abstraction level (doesn't expose atomics to callers)

3. **Integration Pattern**
   - `SeedingManager` is the public facade - callers don't interact with internals
   - `ContentRetrievalManager` integration via `on_who_has_with_seeding()` is clean
   - `NetworkStateProvider` callback pattern allows platform-specific WiFi detection

4. **Error Handling**
   - `ConfigError` enum uses `thiserror` - consistent with rest of codebase
   - Validation happens at config change time, not at runtime

### Concerns

1. **Silent Lock Poisoning**
   ```rust
   if let Ok(mut mc) = self.mobile_config.write() {
       *mc = Some(config);
   }
   // Silent failure if lock is poisoned
   ```

   This pattern appears in multiple places. While safe, it hides potential issues.

   **Recommendation**: At minimum, log when locks are poisoned. Consider `expect()` for locks that should never be poisoned.

2. **Sequential Lock Acquisition**
   ```rust
   // should_seed() acquires 3 locks sequentially
   let config = self.config.read()?;
   if let Ok(mobile) = self.mobile_config.read() { ... }
   if let Ok(provider) = self.network_state_provider.read() { ... }
   ```

   While correct, this limits throughput under high concurrency.

   **Recommendation**: Consider combining mobile_config and network_state_provider into a single struct, or using `DashMap` for space_stats.

3. **Incomplete Integration Layer**
   - Background task is placeholder
   - No RPC layer for user access
   - Achievement system not wired

   The core is complete but the integration layer that makes it usable is missing.

---

## Future Compatibility

### Extensibility Assessment

#### Positive Signals

1. **Mode Enum is Extensible**
   ```rust
   pub enum SeedingMode {
       Disabled,
       OwnContent,
       ViewedContent,
       FullSpace,
       // Easy to add: AllFollowed, Everything, etc.
   }
   ```
   Adding new modes is non-breaking.

2. **Config is Serializable**
   - Uses `serde` derive macros
   - JSON roundtrip tested
   - New fields can use `#[serde(default)]` for backwards compatibility

3. **Statistics are Extensible**
   - `SpaceStats` can grow without breaking existing code
   - `StatisticsSnapshot` captures point-in-time data cleanly

4. **Wire Format Versioned (Implicit)**
   - Message type 0x29 is reserved
   - Payload format is simple and complete
   - Could add version field if needed

#### Breaking Change Risks

1. **DHT Migration Path Unclear**

   SPEC_07 mentions "Hybrid" approach (gossip + DHT), but current implementation is gossip-only:
   - `PeerAvailabilityMap` is local per-node
   - No DHT key/value structure defined
   - Migration would require new message types or protocol changes

   **Recommendation**: Define `MSG_AVAILABILITY_ANNOUNCE_V2` or DHT protocol messages before Phase 4 integration.

2. **MobileConfig Battery Threshold Missing**

   Documentation mentions `battery_threshold` but implementation lacks it:
   - Adding later is non-breaking
   - But clients expecting it may fail silently

   **Recommendation**: Add `battery_threshold: Option<f32>` now with `#[serde(default)]`.

3. **Achievement System Coupling**

   Statistics are ready but achievement unlocking is not wired. When implemented:
   - `StatisticsSnapshot` format may need changes
   - Achievement thresholds not yet defined

   **Recommendation**: Define achievement thresholds as constants now.

### Planned Future Features Supported

| Future Feature | Support Level | Notes |
|----------------|---------------|-------|
| DHT content discovery | Partial | PeerAvailabilityMap provides local foundation |
| Achievement unlocks | Ready | Statistics tracking complete |
| Mobile optimization | Good | MobileConfig structure in place |
| Streaming video | Unknown | Rate limiter doesn't distinguish streaming vs download |
| Content encryption | Agnostic | Seeding is hash-based, doesn't inspect content |

---

## Recommendations

### Priority 1: Critical for Vision

1. **Implement RPC Endpoints for Seeding Config**
   - Without this, users cannot easily modify seeding behavior
   - Creates implicit platform control over defaults
   - Required methods: `rpc_get_seeding_config()`, `rpc_set_seeding_config()`, `rpc_get_seeding_stats()`

2. **Complete Background Task Integration**
   - The placeholder at `src/node/tasks.rs:1119-1120` must be implemented
   - Without periodic re-announcements, gossip protocol degrades
   - Content discoverability depends on timely announcements

### Priority 2: Spec Compliance

3. **Document Mode Naming Decision**
   - Spec mentions "AllFollowed"/"Everything", implementation uses "FullSpace"
   - Either update spec or add aliases for clarity
   - Prevents future confusion during protocol documentation

4. **Add `battery_threshold` to MobileConfig**
   ```rust
   pub struct MobileConfig {
       // existing fields...
       pub battery_threshold: Option<f32>, // None = no battery check
   }
   ```

### Priority 3: Architectural Improvements

5. **Address Silent Lock Poisoning**
   - Add logging for poisoned locks
   - Consider using `parking_lot::RwLock` which doesn't poison
   - Or use `expect()` with clear panic messages

6. **Define DHT Message Types**
   - Reserve `MSG_AVAILABILITY_DHT_PUT = 0x2A`
   - Reserve `MSG_AVAILABILITY_DHT_GET = 0x2B`
   - Even if not implemented, reserving prevents protocol conflicts

### Priority 4: Future Compatibility

7. **Define Achievement Thresholds**
   ```rust
   pub const ACHIEVEMENT_BANDWIDTH_BARON_BYTES: u64 = 100 * 1024 * 1024 * 1024; // 100 GB
   pub const ACHIEVEMENT_TERABYTE_CLUB_BYTES: u64 = 1024 * 1024 * 1024 * 1024; // 1 TB
   ```

8. **Add Streaming Mode Flag**
   ```rust
   pub struct SeedingConfig {
       // existing fields...
       pub streaming_priority: bool, // Prefer streaming chunks over sequential
   }
   ```

---

## Conclusion

The Seeding & Availability feature is a **strong implementation** of Swimchain's vision. The voluntary participation model, user control, and privacy-preserving design all align with the platform's core principles of decentralization and user empowerment.

The main gaps are in the **integration layer** (RPC, CLI, background tasks) rather than the core logic. Addressing these gaps will complete the vision of user-controlled content seeding.

**Overall Assessment**: 88/100 - Excellent vision alignment with minor spec deviations and integration gaps.

---

*Review completed: 2026-01-13*
