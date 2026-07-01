# Security Review: Device Constraints

## Summary

The Device Constraints module is a **low-risk, local-only resource management component** with no cryptographic operations, no authentication requirements, and no external attack surface. The module manages user preferences for network contribution (battery thresholds, bandwidth caps, WiFi-only mode) stored locally via Sled. Primary security concerns are availability risks from RwLock panic conditions, the lack of integrity verification on persisted settings, and a non-atomic day boundary reset. The feature appropriately avoids unnecessary crypto complexity for its scope.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 23 | 25 | N/A for scope - no auth needed, local-only operations |
| Crypto Correctness | 22 | 25 | No crypto operations (appropriate); safe bincode serialization |
| Input Validation | 21 | 25 | Basic validation present; missing bounds on bandwidth cap |
| Data Protection | 19 | 25 | Unencrypted local storage; no integrity verification |
| **Total** | **85** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Lock poisoning DoS | Low | Medium | Replace `unwrap()` with poison recovery pattern |
| Settings tampering via file access | Low | Low | Local attacker already has device access |
| Integer overflow in bandwidth tracking | Very Low | Low | Saturating arithmetic used throughout |
| Deserialization of corrupted data | Low | Medium | Serde bincode with type-safe enums |
| Race condition at day boundary | Low | Very Low | Non-atomic reset; documented limitation |
| Resource exhaustion via settings | Very Low | Low | Validation limits battery_threshold <= 100 |
| TOCTOU in constraint checking | Low | Low | Check-then-act pattern; minimal window |

## Vulnerabilities Found

### Critical (Exploitable)
*None identified - the module has no external attack surface.*

### High

1. **RwLock Panic on Lock Poisoning**
   **Vulnerability**: Multiple `unwrap()` calls on `RwLock` in production code paths
   **Location**:
   - `manager.rs:150` - `settings.read().unwrap()`
   - `manager.rs:179` - `settings.read().unwrap()`
   - `manager.rs:180` - `mode.read().unwrap()`
   - `manager.rs:225` - `mode.read().unwrap()`
   - `manager.rs:231` - `mode.write().unwrap()`
   - `manager.rs:238` - `settings.read().unwrap()`
   - `manager.rs:258` - `settings.write().unwrap()`
   - `battery.rs:143` - `settings.read().unwrap()`
   **Attack**: If any thread panics while holding the lock, subsequent `unwrap()` calls will panic, causing cascading failures
   **Impact**: Denial of service - application crashes; node becomes unavailable
   **Fix**: Replace with poison recovery pattern:
   ```rust
   self.settings.read().unwrap_or_else(|e| e.into_inner())
   ```
   **CVSS**: 4.3 (Medium) - Local, low complexity, no auth required, availability impact

### Medium

1. **No Integrity Verification on Stored Settings**
   **Vulnerability**: Settings stored in Sled can be modified without detection
   **Location**: `storage.rs:29-83`
   **Attack**: An attacker with local file access could modify the Sled database to inject arbitrary settings
   **Impact**: Could disable contribution protection (set battery_threshold=0, thermal_pause=false) or exhaust bandwidth
   **Fix**: Add HMAC verification using node's identity key:
   ```rust
   // When storing:
   let hmac = compute_hmac(&settings_bytes, node_key);
   store(settings_bytes || hmac);
   // When loading:
   verify_hmac(stored_hmac, &settings_bytes, node_key)?;
   ```
   **CVSS**: 3.3 (Low) - Local access required, limited impact (user can legitimately change these settings anyway)

2. **Deserialization Without Version Check**
   **Vulnerability**: Bincode deserialization of stored settings/mode lacks version handling
   **Location**: `storage.rs:40-43`, `storage.rs:61-64`
   **Attack**: If enum variants are reordered or added in future versions, old stored data could deserialize to incorrect values
   **Impact**: Settings silently corrupted after software upgrade
   **Fix**: Add version byte prefix to serialized data and validate on load:
   ```rust
   const SETTINGS_VERSION: u8 = 1;
   // Serialize: [version, ...settings_bytes]
   // Deserialize: check version, then parse
   ```
   **CVSS**: 2.9 (Low) - Requires version mismatch scenario; low impact

3. **Non-Atomic Day Boundary Reset**
   **Vulnerability**: Race condition in `maybe_reset()` at midnight UTC
   **Location**: `bandwidth.rs:76-87`
   **Attack**: Concurrent threads checking at day boundary could cause:
   - Double reset (bandwidth counter reset twice)
   - Lost update (one thread's reset clobbers another's usage recording)
   **Impact**: Minor accounting discrepancy in bandwidth tracking
   **Fix**: Use compare-and-swap pattern:
   ```rust
   loop {
       let current = self.day_start_secs.load(Ordering::Acquire);
       if new_day_start <= current { break; }
       if self.day_start_secs.compare_exchange(
           current, new_day_start,
           Ordering::Release, Ordering::Relaxed
       ).is_ok() {
           self.bytes_used_today.store(0, Ordering::Release);
           break;
       }
   }
   ```
   **CVSS**: 2.0 (Low) - Narrow time window; very limited impact

### Low

1. **Missing Upper Bound Validation on Bandwidth Cap**
   **Vulnerability**: `daily_bandwidth_cap` accepts any u64 value without validation
   **Location**: `types.rs:77` - `validate()` only checks battery_threshold
   **Attack**: Setting cap to `u64::MAX` disables daily limits entirely
   **Impact**: User can bypass intended resource limits (but this is already possible via AnchorMode)
   **Fix**: Add optional sanity check or document that unlimited is intentional via `maximum()` preset

2. **Relaxed Memory Ordering Throughout**
   **Vulnerability**: All atomic operations use `Ordering::Relaxed`
   **Location**: Throughout `bandwidth.rs` and `battery.rs`
   **Attack**: Theoretical stale reads on weakly-ordered architectures (ARM, etc.)
   **Impact**: Slightly outdated constraint status; no security impact
   **Fix**: Review and upgrade to `Acquire/Release` where cross-thread visibility matters:
   - `bytes_used_today` updates should use `Release`
   - Reads for constraint checks should use `Acquire`

3. **SystemTime Clock Manipulation**
   **Vulnerability**: Day boundary detection uses `SystemTime::now()`
   **Location**: `bandwidth.rs:68-73`
   **Attack**: NTP clock adjustment or manual clock manipulation could trigger early/late reset
   **Impact**: Bandwidth accounting affected; user could game daily limits
   **Fix**: Use monotonic `Instant` for relative timing, persist actual UTC timestamp for day boundary

## Cryptographic Assessment

- **Algorithms used**: None (appropriate - no crypto needed for local resource management)
- **Key management**: N/A
- **Random number generation**: N/A
- **Nonce handling**: N/A
- **Serialization**: Bincode - safe binary format, deterministic, no arbitrary code execution
- **Storage**: Sled embedded database - LSM tree, no built-in encryption

**Assessment**: The module correctly avoids cryptographic operations for its scope. Adding HMAC integrity verification would provide defense-in-depth but is not strictly necessary given the local-only nature.

## Attack Surface

### External Inputs

| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| `ContributionSettings` | User via CLI/API | `validate()` checks battery_threshold <= 100 | Low |
| `ContributionMode` | User via CLI/API | Enum - type-safe, `from_u8()` rejects invalid | Very Low |
| `bytes` to `try_serve()` | Internal (content serving) | None - saturating add prevents overflow | Very Low |
| `data_path` | Node initialization | Passed to `sled::open()` | Low (path traversal possible but local-only) |

### Trust Boundaries

| Boundary | Trust Level | Notes |
|----------|-------------|-------|
| User Settings | Trusted | User explicitly configures these values |
| BatteryMonitor trait impl | Trusted | Platform-provided, assumed correct |
| NetworkStateProvider impl | Trusted | Platform-provided, assumed correct |
| Sled Storage | Semi-trusted | Local file, could be tampered by local attacker |
| System Clock | Semi-trusted | Used for day boundary; could be manipulated |

### Privileged Operations

- **Storage writes** (`set_settings`, `set_mode`): Persists to disk; no elevation required
- **Bandwidth tracking** (`try_acquire`, `record_usage`): Mutates atomic counters; no persistence
- **Mode changes** (`set_mode`): Persists immediately; no restrictions (no auth required for local node)

## Recommendations

### Priority 1 (Immediate)
1. **Replace RwLock unwrap() with poison recovery**
   - Impact: Prevents DoS via lock poisoning
   - Effort: Small (8 locations)
   - Code: `self.lock.read().unwrap_or_else(|e| e.into_inner())`

### Priority 2 (Short-term)
2. **Add version byte to serialized settings**
   - Impact: Prevents silent corruption on upgrades
   - Effort: Small

3. **Fix day boundary race with CAS pattern**
   - Impact: Ensures atomic bandwidth reset
   - Effort: Small

### Priority 3 (Defense in Depth)
4. **Add HMAC integrity verification for stored settings**
   - Impact: Detects tampering of local settings
   - Effort: Medium
   - Note: Low priority since local attacker already has device access

5. **Upgrade to Acquire/Release memory ordering**
   - Impact: Correctness on weakly-ordered architectures
   - Effort: Small (review and upgrade ~10 atomic operations)

## Security Best Practices Check

- [x] No hardcoded secrets - N/A (no secrets in this module)
- [x] Timing-safe comparisons - N/A (no sensitive comparisons)
- [x] Secure defaults - Yes: `wifi_only: true`, `thermal_pause: true`, conservative battery threshold
- [x] Principle of least privilege - Yes: module only manages local resources, no network access
- [x] Input validation - Partial: battery_threshold validated, bandwidth_cap unbounded
- [x] Integer overflow protection - Yes: saturating arithmetic throughout
- [x] Safe serialization - Yes: bincode with type-safe enums
- [ ] Integrity verification - No: Sled data not authenticated
- [x] No arbitrary code execution - Yes: no eval, no dynamic loading
- [ ] Audit logging - No: settings changes not logged

## Swimchain-Specific Security Considerations

| Consideration | Status | Notes |
|---------------|--------|-------|
| PoW validation | N/A | Module doesn't handle PoW - local resource management only |
| Signature verification | N/A | No signatures needed for local settings |
| Spam attestation | N/A | Not involved in spam detection |
| Private space encryption | N/A | Settings are non-sensitive preferences |
| Identity key protection | N/A | Module doesn't access identity keys |

**Note**: The Device Constraints module correctly stays out of Swimchain's cryptographic security model. It manages local resource allocation without requiring authentication or cryptographic verification. This separation of concerns is appropriate.

## Conclusion

The Device Constraints module has an **appropriate security posture** for its scope as a local resource management system. No critical-severity vulnerabilities were identified. The high-severity lock poisoning issue should be addressed to prevent potential node crashes. The module correctly avoids handling any sensitive data, cryptographic material, or network-exposed APIs.

**Overall Assessment**: Production-ready with the RwLock panic fix as a release blocker.

---

*Security review performed on module at `src/device_constraints/`*
*Review date: 2026-01-12*
*Reviewer: Security Expert Perspective*
*Lines of Code: ~2,300 (including tests)*
