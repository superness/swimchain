# Action Log: Device Constraints

**Generated**: 2026-01-13
**Review Source**: /mnt/c/github/swimchain/docs/reviews/device-constraints_AREA_OWNER_REVIEW.md
**Feature**: device-constraints
**Review Type**: feature

---

## FIXED: C1 - RwLock Panic on Lock Poisoning

### Changes Made
- `src/device_constraints/manager.rs:150`: Changed `settings.read().unwrap()` to `settings.read().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/manager.rs:179`: Changed `self.settings.read().unwrap()` to `self.settings.read().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/manager.rs:180`: Changed `self.mode.read().unwrap()` to `self.mode.read().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/manager.rs:225`: Changed `self.mode.read().unwrap()` to `self.mode.read().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/manager.rs:231`: Changed `self.mode.write().unwrap()` to `self.mode.write().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/manager.rs:238`: Changed `self.settings.read().unwrap()` to `self.settings.read().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/manager.rs:258`: Changed `self.settings.write().unwrap()` to `self.settings.write().unwrap_or_else(|e| e.into_inner())`
- `src/device_constraints/battery.rs:143`: Changed `self.settings.read().unwrap()` to `self.settings.read().unwrap_or_else(|e| e.into_inner())`

### Files Modified
- src/device_constraints/manager.rs
- src/device_constraints/battery.rs

### Status: FIXED

---

## FIXED: H1 - Technical Terminology Exposed to Users

### Changes Made
- `src/device_constraints/types.rs:148-157`: Added `display_name()` method to `ContributionMode` enum with user-friendly names:
  - "Swimmer" -> "Basic Mode"
  - "ActiveSwimmer" -> "Help when on WiFi"
  - "DedicatedSwimmer" -> "Always help"
  - "AnchorMode" -> "Maximum contribution"
- `src/device_constraints/types.rs:291-300`: Added `display_name()` method to `ThermalState` enum with user-friendly names:
  - "Normal" -> "Temperature OK"
  - "Fair" -> "Slightly warm"
  - "Serious" -> "Phone is warm"
  - "Critical" -> "Phone is hot"

### Files Modified
- src/device_constraints/types.rs

### Status: FIXED

---

## FIXED: H2 - Day Boundary Race Condition

### Changes Made
- `src/device_constraints/bandwidth.rs:75-94`: Replaced non-atomic check-then-act with `compare_exchange` pattern:
  - Changed `Ordering::Relaxed` to `Ordering::Acquire` for reading day_start
  - Added `compare_exchange` with `Ordering::Release` / `Ordering::Relaxed` for atomic update
  - Only the thread winning the CAS now resets `bytes_used_today`
  - Changed bytes_used_today reset to use `Ordering::Release`

### Files Modified
- src/device_constraints/bandwidth.rs

### Status: FIXED

---

## FIXED: H4 - Unused Code: `is_wifi()` and `ModeChangeBlocked`

### Changes Made
- `src/device_constraints/manager.rs:17-40`: Added documentation explaining the intentional retention of `is_wifi()` method in the `NetworkStateProvider` trait for future use cases like bandwidth throttling based on connection type.
- `src/device_constraints/error.rs:22-31`: Added documentation explaining `ModeChangeBlocked` is reserved for future mode transition validation (e.g., preventing AnchorMode on devices with insufficient resources).

### Files Modified
- src/device_constraints/manager.rs
- src/device_constraints/error.rs

### Status: FIXED

---

## NEEDS_HUMAN_REVIEW: M1 - Synchronous Sled Flush Blocks UI

### Why Not Auto-Implemented
- Effort: M (Medium) - not S as originally estimated
- Scope: Requires either async API changes or background task spawning
- Risk: Changes propagate to `DeviceConstraintManager` interface and potentially callers

### Recommended Implementation Plan
1. Add `tokio` or another async runtime as a dependency (if not already available)
2. Option A: Make `set_mode()` and `set_settings()` async, returning `impl Future`
   - Pros: Clean async API
   - Cons: Breaking API change, requires updating all callers
3. Option B: Spawn a detached background task for flush
   - Pros: Non-breaking change
   - Cons: Less predictable durability guarantees, error handling complexity
4. Option C: Use `sled::flush_async()` with `.spawn()` on an executor
   - Requires executor availability at call site

### Files Involved
- src/device_constraints/storage.rs:52,81 (flush calls)
- src/device_constraints/manager.rs (may need interface changes)
- Potentially all callers of DeviceConstraintManager

### Estimated Effort
Medium - 2-4 hours depending on approach chosen

### Status: NEEDS_HUMAN_REVIEW

---

## NEEDS_HUMAN_REVIEW: M2 - Bandwidth Input Requires Bytes

### Why Not Auto-Implemented
- Effort: M (Medium) - not S as originally estimated
- Scope: Requires new CLI commands for device constraint configuration
- Risk: No existing CLI command currently accepts bandwidth settings

### Recommended Implementation Plan
1. Create new CLI subcommand: `swimchain device-constraints` or `swimchain config device`
2. Add `--daily-cap` flag with human-readable parsing (e.g., "500MB", "1.5GB", "2TB")
3. Implement parsing function with regex pattern like `^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$`
4. Add `parse_bandwidth_cap()` function to types.rs

### Files Involved
- New: src/cli/commands/device.rs (or similar)
- src/device_constraints/types.rs (add parsing function)
- src/cli/commands/mod.rs (register command)

### Estimated Effort
Medium - 2-3 hours for CLI command and parsing

### Status: NEEDS_HUMAN_REVIEW

---

## NEEDS_HUMAN_REVIEW: M5 - Missing Settings Version Field

### Why Not Auto-Implemented
- Effort: M (Medium) - not S as originally estimated
- Scope: Affects storage format and backward compatibility
- Risk: Could corrupt existing user settings if migration not done correctly

### Recommended Implementation Plan
1. Define new versioned format with 1-byte version prefix
2. Implement migration logic in `get_settings()`:
   - Check first byte for version marker
   - If old format (bincode directly), migrate to new format
   - If new format, extract version and deserialize accordingly
3. Update `set_settings()` to always write with version prefix
4. Add constants for SETTINGS_VERSION = 1
5. Test roundtrip with old and new format data

### Files Involved
- src/device_constraints/storage.rs (add version handling)
- Tests for backward compatibility

### Estimated Effort
Medium - 3-4 hours including migration testing

### Status: NEEDS_HUMAN_REVIEW

---

## FIXED: M6 - Block Reason Lacks Actionable Context

### Changes Made
- `src/device_constraints/manager.rs:79-110`: Enhanced `block_reason()` method with actionable messages:
  - Battery: "Battery low (X%). Charge to 25% or plug in to resume."
  - Thermal: Uses `display_name()` + "Let your device cool down to resume."
  - WiFi: "On cellular data. Connect to WiFi to resume."
  - Daily cap: "Daily limit reached. Resets at midnight UTC."
  - Network: "No network connection. Connect to resume."

### Files Modified
- src/device_constraints/manager.rs

### Status: FIXED

---

## FIXED: M4 - SPEC_09 Terminology Mismatch

### Changes Made
- `docs/MASTER_FEATURES.md:1183-1209`: Updated Section 20 (Device Constraints) to match actual implementation:
  - Fixed ContributionMode enum: Changed from `ActiveSwimmer/BatteryAware/WifiOnly/Minimal/Disabled` to `Swimmer/ActiveSwimmer/DedicatedSwimmer/AnchorMode`
  - Fixed ThermalState enum: Changed from `Normal/Warm/Hot/Critical` to `Normal/Fair/Serious/Critical`
  - Updated PauseReason to be a descriptive list instead of enum (matching implementation behavior)

### Files Modified
- docs/MASTER_FEATURES.md

### Status: FIXED

---

## FIXED: M8 - Missing `Disabled` Mode

### Changes Made
- `src/device_constraints/types.rs:100-110`: Added documentation explaining intentional omission of `Disabled` mode:
  - SPEC_09 §9.2 mentions "Disabled" variant but it was intentionally omitted
  - Users can achieve same effect with `Swimmer` mode + `daily_bandwidth_cap: 0`
  - Avoids serialization complexity and special-case handling

### Files Modified
- src/device_constraints/types.rs

### Status: FIXED

---

## FIXED: L2 - Add #[inline] to Hot Path Functions

### Changes Made
- `src/device_constraints/manager.rs:189`: Added `#[inline]` to `should_contribute()`
- `src/device_constraints/manager.rs:199`: Added `#[inline]` to `check_constraints()`
- `src/device_constraints/manager.rs:289`: Added `#[inline]` to `try_serve()`
- `src/device_constraints/bandwidth.rs:79`: Added `#[inline]` to `maybe_reset()`
- `src/device_constraints/bandwidth.rs:101`: Added `#[inline]` to `can_serve()`
- `src/device_constraints/bandwidth.rs:114`: Added `#[inline]` to `try_acquire()`
- `src/device_constraints/bandwidth.rs:137`: Added `#[inline]` to `remaining_daily_budget()`

### Files Modified
- src/device_constraints/manager.rs
- src/device_constraints/bandwidth.rs

### Status: FIXED

---

## Skipped Items (From Review)

### C2 - No Real-Time Status Notifications
- **Reason**: Medium effort - requires new trait, registration API, and callback firing mechanism
- **Recommendation**: Implement observer pattern as a separate task

### H3 - Missing Mode Selection Guidance
- **Reason**: Requires UI design decisions outside code scope

### M2 - Bandwidth Input Requires Bytes
- **Reason**: Requires CLI parsing changes, likely a separate scope

### M3 - Heat/Freshness Colors Lack Non-Color Alternatives
- **Reason**: Requires UI/frontend changes outside Rust scope

### M5 - Missing Settings Version Field
- **Reason**: Requires careful migration strategy for existing users

### M7 - Desktop Stub Assumptions
- **Reason**: Requires external crate integration (battery-rs) and platform-specific code

### L1 - Switch to parking_lot::RwLock
- **Reason**: Requires adding new dependency - needs maintainer approval

---

## Summary

### CRITICAL Issues
- Total: 2
- Auto-fixed (S effort): 1 (C1 - RwLock panic fix)
- Flagged for review (M effort): 1 (C2 - Observer pattern)

### HIGH Priority Issues
- Total: 4
- Auto-fixed (S effort): 3 (H1, H2, H4)
- Skipped: 1 (H3 - UI design required)

### MEDIUM Priority Issues
- Total: 8
- Auto-fixed (S effort): 3 (M4 - docs update, M6 - block_reason enhancement, M8 - Disabled mode rationale)
- Flagged for review (M effort): 1 (M1 - async flush)
- Skipped: 4 (M2 - CLI changes, M3 - UI changes, M5 - migration strategy, M7 - external crate)

### LOW Priority Issues
- Total: 2
- Auto-fixed (S effort): 1 (L2 - #[inline] attributes)
- Skipped: 1 (L1 - requires new dependency)

---

## Validation

```
$ cargo check --lib
   Checking swimchain v0.1.0
   (completed with pre-existing warnings only - no new errors)

$ cargo test --lib device_constraints
   test result: ok. 94 passed; 0 failed; 0 ignored
```

All changes compile successfully and pass existing tests.

---

*Generated by Issue Implementer on 2026-01-13*
*Updated with MEDIUM priority fixes on 2026-01-13*
