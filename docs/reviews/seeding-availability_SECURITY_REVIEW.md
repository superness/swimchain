# Security Review: Seeding & Availability

## Summary

The Seeding & Availability module demonstrates **adequate security design** for a voluntary content sharing feature, with good input validation on configuration and proper bounds checking on wire protocol parsing. However, there are notable concerns: (1) silent failure patterns on lock poisoning could mask attacks or leave the system in an inconsistent state, (2) availability announcements lack origin verification allowing potential peer spoofing, and (3) the `PeerAvailabilityMap` can be targeted for memory exhaustion attacks through announcement flooding.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 16 | 25 | No signature verification on availability announcements |
| Crypto Correctness | 20 | 25 | Hashes used correctly, no crypto primitives |
| Input Validation | 21 | 25 | Good bounds checking, missing fuzz testing |
| Data Protection | 21 | 25 | Statistics not persisted, no sensitive data exposed |
| **Total** | **78** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Availability announcement spoofing | High | Medium | **Not mitigated** - no signature verification on announcements |
| Memory exhaustion via announcement flooding | Medium | Medium | Partially mitigated - max_entries cap (10,000), but no per-peer limits |
| Lock poisoning leading to silent failures | Low | High | **Not mitigated** - silent `if let Ok()` patterns |
| Wire format parsing DoS | Low | Low | Mitigated - batch size limits (100 max), length checks |
| Configuration tampering | Low | Medium | Partially mitigated - validation exists but no authentication |
| Rate limiter bypass via clock manipulation | Low | Medium | Partially mitigated - uses `Instant` for monotonic time |

## Vulnerabilities Found

### Critical (Exploitable)

*None identified*

### High

1. **Vulnerability**: Availability announcement spoofing
   **Location**: `src/seeding/availability.rs:255-269`
   **Attack**: A malicious peer can announce availability for content they don't have by calling `PeerAvailabilityMap::record(hash, peer_id)`. The `peer_id` is simply a 32-byte array with no verification that the announcement actually came from that peer.
   **Impact**: Attackers can:
   - Advertise false content availability, causing retrieval failures
   - Impersonate other peers to redirect content requests
   - Perform Sybil attacks by announcing many fake peer identities
   **Fix**: Require signed announcements where the signature is verified against the announcing peer's public key before recording availability.
   **CVSS**: 6.5 (Medium)

2. **Vulnerability**: Silent lock poisoning failures allow state corruption
   **Location**: Multiple (~20 sites) in `manager.rs`, `availability.rs`, `statistics.rs`
   **Attack**: If a panic occurs while holding a lock (e.g., from a malformed input in a concurrent thread), subsequent operations silently return default values rather than propagating the error.
   **Impact**:
   - Configuration updates appear to succeed but don't persist (`update_config` at line 187)
   - Statistics can become inconsistent (partial updates)
   - Seeding decisions fall back to unsafe defaults
   **Fix**: Replace `if let Ok()` patterns with proper error handling that either recovers the lock via `PoisonError::into_inner()` or propagates the error to the caller.
   **CVSS**: 5.3 (Medium)

### Medium

1. **Vulnerability**: No per-peer rate limiting on availability announcements
   **Location**: `src/seeding/availability.rs:255-269`
   **Attack**: A malicious peer can flood the `PeerAvailabilityMap` by sending rapid availability announcements for different content hashes, each consuming memory until the global `max_entries` (10,000) limit triggers pruning.
   **Impact**:
   - Memory pressure on victim nodes
   - Legitimate availability entries may be evicted
   - CPU overhead from constant pruning
   **Fix**: Add per-peer limits (e.g., max 100 announcements per peer) and implement rate limiting on announcement processing.
   **CVSS**: 4.3 (Medium)

2. **Vulnerability**: Timestamp manipulation in wire format
   **Location**: `src/seeding/availability.rs:78`
   **Attack**: The `expires_at` field is parsed from untrusted network data without validation. A peer could send announcements with `expires_at` set to `u64::MAX`, causing entries to never expire naturally.
   **Impact**: Memory accumulation over time as entries don't get pruned
   **Fix**: Validate `expires_at` against a reasonable maximum (e.g., current_time + MAX_TTL), reject announcements with excessive expiry times.
   **CVSS**: 4.3 (Medium)

3. **Vulnerability**: Missing origin validation for network state provider
   **Location**: `src/seeding/manager.rs:74-78`
   **Attack**: The `NetworkStateProvider` callback is stored without any validation. A malicious component that gains access to the `SeedingManager` could install a provider that always returns `true`, bypassing WiFi-only restrictions on mobile.
   **Impact**: Cellular data consumption on mobile devices despite user preferences
   **Fix**: Consider making `NetworkStateProvider` immutable after initialization or requiring elevated privileges to change it.
   **CVSS**: 3.7 (Low)

### Low

1. **Vulnerability**: Hash count truncation in wire format
   **Location**: `src/seeding/availability.rs:57`
   **Attack**: When serializing, `self.hashes.len() as u16` silently truncates if more than 65535 hashes exist (though `AVAILABILITY_ANNOUNCE_BATCH_SIZE` limits to 100).
   **Impact**: Theoretical data loss if batching logic fails
   **Fix**: Add an assertion or validation before the cast
   **CVSS**: 2.0 (Low)

2. **Vulnerability**: Statistics reset without audit trail
   **Location**: `src/seeding/statistics.rs:224-241`
   **Attack**: The `reset()` function can be called to clear all statistics without logging or authorization.
   **Impact**: Loss of achievement progress data, inability to audit seeding behavior
   **Fix**: Add logging on reset operations; consider requiring explicit user confirmation
   **CVSS**: 2.0 (Low)

## Cryptographic Assessment

- **Algorithms used**: No cryptographic primitives are used directly in this module. Content is identified by `ContentBlobHash` (32-byte hash), which is generated elsewhere.
- **Key management**: Not applicable - no keys are generated or stored in this module.
- **Random number generation**: Not applicable - no random values are generated.
- **Nonce handling**: Not applicable.

**Note**: The module relies on content hashes for identification but does not verify them. Hash verification should occur in the content retrieval layer, not the seeding layer.

## Attack Surface

### External Inputs

| Input | Source | Validation |
|-------|--------|------------|
| `AvailabilityAnnouncePayload` wire bytes | Network (peers) | Length checks, count bounds (max 100) |
| `SeedingConfig` JSON | Configuration files, RPC (future) | Range validation on bandwidth, storage, duration |
| `MobileConfig` | Application/platform | No validation |
| `NetworkStateProvider` callback | Internal components | None |
| `peer_id` in announcements | Network (peers) | None - treated as opaque bytes |

### Trust Boundaries

1. **Network ↔ Node**: Wire format parsing in `AvailabilityAnnouncePayload::deserialize()` - this is the primary untrusted data boundary
2. **Platform ↔ Module**: `NetworkStateProvider` callback from mobile platform - partially trusted
3. **User ↔ Module**: `SeedingConfig` from user preferences - validated but not authenticated

### Privileged Operations

| Operation | Current Protection | Risk |
|-----------|-------------------|------|
| Enable/disable seeding | None | Medium - could be toggled by any component |
| Update bandwidth limits | Validation only | Low - bounded to 1-100 Mbps |
| Set mobile config | None | Medium - could bypass WiFi-only |
| Reset statistics | None | Low - achievement data loss |

## Recommendations

### Priority 1 (High - Security Impact)

1. **Add signature verification to availability announcements**
   - Modify `AvailabilityAnnouncePayload` to include a signature field
   - Verify signature against the peer's public key before recording in `PeerAvailabilityMap`
   - This prevents peer spoofing and Sybil attacks

2. **Replace silent lock poisoning handling**
   - Audit all `if let Ok()` patterns in `src/seeding/`
   - Use `lock().unwrap_or_else(|e| e.into_inner())` for recoverable cases
   - Add logging for poisoning events
   - Consider using `parking_lot::RwLock` which doesn't poison

### Priority 2 (Medium - Defense in Depth)

3. **Add per-peer rate limiting for announcements**
   - Track announcement counts per peer
   - Implement exponential backoff for peers exceeding thresholds
   - Add to `PeerAvailabilityMap::record()`

4. **Validate `expires_at` in wire format parsing**
   - Add maximum TTL constant (e.g., 1 hour = 3600 seconds)
   - Reject announcements where `expires_at > now + MAX_TTL`

5. **Add authentication for configuration changes**
   - When RPC endpoints are added, ensure they require authenticated sessions
   - Log all configuration changes with identity

### Priority 3 (Low - Best Practices)

6. **Add fuzz testing for wire format parsing**
   - Create fuzz targets for `AvailabilityAnnouncePayload::deserialize()`
   - Test with malformed, truncated, and oversized inputs

7. **Audit logging for security-relevant operations**
   - Log seeding enable/disable events
   - Log configuration changes with before/after values
   - Log rate limit events (requests denied)

## Security Best Practices Check

- [x] No hardcoded secrets
- [ ] Timing-safe comparisons - *N/A, no sensitive comparisons*
- [x] Secure defaults - WiFi-only on mobile, seeding disabled by default logic paths
- [ ] Principle of least privilege - *PARTIAL: No authorization on configuration changes*
- [x] Input validation present
- [ ] Complete input validation - *Missing per-peer limits, expires_at validation*
- [x] Bounds checking on arrays/vectors
- [ ] Error handling propagates appropriately - *FAIL: Silent lock poisoning*
- [x] No logging of sensitive data (hashes are not sensitive)
- [ ] Rate limiting present - *PARTIAL: Only for bandwidth, not for announcements*

## Swimchain-Specific Security Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| PoW validation (anti-stockpile) | N/A | Not applicable to seeding |
| Signature verification on all actions | **FAIL** | Availability announcements not signed |
| Spam attestation thresholds | N/A | Not applicable |
| Private space encryption | N/A | Seeding module doesn't handle encryption |
| Identity key protection | PASS | `current_user` identity stored but not exposed |

## Conclusion

The Seeding & Availability module has a **reasonable security posture** for a voluntary content sharing feature, scoring **78/100**. The most significant security gap is the lack of signature verification on availability announcements, which enables peer spoofing attacks. The silent lock poisoning pattern used throughout the codebase is a reliability and security concern that should be addressed systematically.

The module appropriately:
- Validates configuration inputs within defined bounds
- Uses bounds checking on wire format parsing
- Implements rate limiting for bandwidth consumption
- Uses atomic operations for lock-free statistics

The module should be improved by:
- Adding cryptographic verification to availability announcements
- Implementing proper error propagation on lock failures
- Adding per-peer rate limits for announcement processing
- Validating timestamp fields in wire format

---

*Review Date: 2026-01-13*
*Reviewer: Security Agent*
*Module Version: Milestone 3.5*
