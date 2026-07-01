# Device Constraints - Feature Documentation

## Overview

The Device Constraints module provides mobile-aware resource management for Swimchain nodes. It ensures the application is a "good citizen" on mobile devices by monitoring battery levels, thermal state, network conditions, and bandwidth usage. This allows users to participate in the network without draining their battery or using excessive data.

The feature enables users to choose their contribution level (from minimal to always-on) while the system automatically pauses or throttles contribution based on device conditions. All settings are persisted locally and survive app restarts.

**Module**: `src/device_constraints/`
**Specification**: SPEC_09 Section 9 - Social Layer (Good App Citizenship)
**Status**: Complete (5/5 features implemented)

## Architecture

```
+----------------------------------+
|     DeviceConstraintManager      |  <-- Unified coordinator
+----------------------------------+
         |         |         |
    +----+    +----+    +----+
    |         |         |
    v         v         v
+--------+ +--------+ +--------+
|Battery | |Network | |Bandwidth|
|Checker | |Provider| |Limiter  |
+--------+ +--------+ +--------+
    |         |         |
    v         v         v
+--------+ +--------+ +--------+
|Battery | |Platform| |Token   |
|Monitor | |Network | |Bucket  |
|(trait) | |(trait) | |Limiter |
+--------+ +--------+ +--------+
         |
         v
  +---------------+
  |Efficiency     |
  |Tracker        |
  +---------------+
         |
         v
  +---------------+
  |Device         |
  |SettingsStore  |
  |(Sled DB)      |
  +---------------+
```

### Module Organization

| File | Purpose | Key Exports |
|------|---------|-------------|
| `mod.rs` | Module entry point | Re-exports all public types |
| `types.rs` | Core type definitions | `ContributionSettings`, `ContributionMode`, `ThermalState` |
| `error.rs` | Error handling | `DeviceConstraintError` |
| `battery.rs` | Battery monitoring | `BatteryMonitor`, `BatteryState`, `BatteryChecker`, `PauseReason` |
| `bandwidth.rs` | Daily bandwidth caps | `DailyBandwidthLimiter` |
| `efficiency.rs` | Resource efficiency | `EfficiencyTracker`, `EfficiencyHistory` |
| `storage.rs` | Persistence layer | `DeviceSettingsStore` |
| `manager.rs` | Unified coordinator | `DeviceConstraintManager`, `NetworkStateProvider`, `ConstraintStatus` |

## Data Structures

### ContributionSettings

User-configurable settings that control how the node participates in the network.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `wifi_only` | `bool` | `true` | Only contribute when on WiFi (not cellular) |
| `daily_bandwidth_cap` | `u64` | `500_000_000` (500MB) | Maximum bytes to contribute per day |
| `battery_threshold` | `u8` | `20` | Pause contribution below this battery level (percent) |
| `thermal_pause` | `bool` | `true` | Pause during system thermal throttling |

**Factory Methods**:
- `ContributionSettings::default()` - Conservative defaults
- `ContributionSettings::minimal()` - Most conservative (100MB cap, 30% battery threshold)
- `ContributionSettings::maximum()` - Least conservative (unlimited bandwidth, 5% threshold)

**Key Methods**:
- `validate() -> Result<(), String>` - Validates settings (battery_threshold <= 100)
- `cap_display() -> String` - Human-readable cap format ("500MB", "2.5GB", "Unlimited")

**Location**: `src/device_constraints/types.rs:27-98`

### ContributionMode

User-selected commitment level affecting background behavior.

| Variant | Value | Description | Background | WiFi Required | Daily Cap |
|---------|-------|-------------|------------|---------------|-----------|
| `Swimmer` | 0 | Foreground only | No | N/A | Yes |
| `ActiveSwimmer` | 1 | Background on WiFi | Yes | Yes | Yes |
| `DedicatedSwimmer` | 2 | Background always | Yes | No | Yes |
| `AnchorMode` | 3 | Always-on, no limits | Yes | No | No |

**Key Methods**:
- `allows_background() -> bool` - Returns `true` for all except `Swimmer`
- `background_requires_wifi() -> bool` - Returns `true` only for `ActiveSwimmer`
- `has_daily_cap() -> bool` - Returns `true` for all except `AnchorMode`
- `name() / icon() / description()` - Display helpers for UI

**Location**: `src/device_constraints/types.rs:100-211`

### ThermalState

Device thermal state for pause decisions.

| Variant | Value | Description | Pauses (thermal_pause=true) | Pauses (thermal_pause=false) |
|---------|-------|-------------|----------------------------|-----------------------------|
| `Normal` | 0 | Normal temperature | No | No |
| `Fair` | 1 | Slightly elevated | No | No |
| `Serious` | 2 | High temperature | Yes | No |
| `Critical` | 3 | Critical temperature | **Yes** | **Yes** (always) |

**Key Methods**:
- `should_pause(thermal_pause_enabled: bool) -> bool` - Whether to pause contribution
- `name() -> &'static str` - Human-readable state name

**Location**: `src/device_constraints/types.rs:213-285`

### BatteryState

Snapshot of current battery conditions.

| Field | Type | Description |
|-------|------|-------------|
| `level` | `Option<u8>` | Battery percentage (0-100), None if unavailable |
| `charging` | `bool` | Whether device is plugged in |
| `thermal_state` | `ThermalState` | Current thermal state |
| `timestamp_secs` | `u64` | Unix timestamp when captured |

**Location**: `src/device_constraints/battery.rs:34-78`

### PauseReason

Reason for pausing contribution (battery/thermal only).

| Variant | Description | Display String |
|---------|-------------|----------------|
| `BatteryLow { level: u8 }` | Battery below threshold | "Battery low (15%)" |
| `ThermalSerious` | Device overheating (Serious state) | "Device overheating" |
| `ThermalCritical` | Device critically hot (Critical state) | "Device critically hot" |

**Location**: `src/device_constraints/battery.rs:80-104`

### ConstraintStatus

Comprehensive status for UI display.

| Field | Type | Description |
|-------|------|-------------|
| `wifi_only_active` | `bool` | WiFi-only mode enabled in settings |
| `on_cellular` | `bool` | Currently on cellular network |
| `battery_paused` | `bool` | Paused due to battery |
| `battery_level` | `Option<u8>` | Current battery level |
| `thermal_paused` | `bool` | Paused due to thermal |
| `thermal_state` | `ThermalState` | Current thermal state |
| `daily_cap_reached` | `bool` | Daily bandwidth cap exhausted |
| `daily_remaining_bytes` | `u64` | Remaining daily budget |
| `contribution_allowed` | `bool` | Overall: can we contribute? |
| `mode` | `ContributionMode` | Current contribution mode |
| `efficiency_score` | `f32` | Current efficiency score |

**Key Method**:
```rust
pub fn block_reason(&self) -> Option<String>
```
Returns human-readable block reason with priority: Battery low > Device overheating > WiFi-only mode > Daily cap reached > Network disconnected

**Location**: `src/device_constraints/manager.rs:32-90`

### EfficiencyTracker

Tracks resource efficiency for achievements.

| Field | Type | Description |
|-------|------|-------------|
| `bandwidth_served` | `u64` | Total bytes served (output) |
| `battery_consumed` | `u64` | Estimated battery used (mAh) |
| `data_used` | `u64` | Data transferred (bytes) |
| `period` | `u32` | Tracking period identifier |
| `last_update_secs` | `u64` | Last update timestamp |

**Location**: `src/device_constraints/efficiency.rs:20-151`

### EfficiencyHistory

Maintains efficiency data across multiple periods for trend analysis.

| Field | Type | Description |
|-------|------|-------------|
| `periods` | `Vec<EfficiencyTracker>` | Historical periods (newest first) |
| `max_periods` | `usize` | Maximum periods to retain |

**Key Methods**:
- `add_period(tracker)` - Add completed period (auto-truncates)
- `average_efficiency() -> f32` - Average score across retained periods
- `trend() -> f32` - Trend direction (positive = improving)

**Location**: `src/device_constraints/efficiency.rs:172-241`

### DeviceConstraintError

Error types for constraint operations.

| Variant | Description |
|---------|-------------|
| `Storage(String)` | Sled storage operation failed |
| `BatteryUnavailable` | Battery monitor not available |
| `NetworkUnavailable` | Network state provider not available |
| `InvalidSettings(String)` | Settings validation failed |
| `ModeChangeBlocked { reason: String }` | Mode change not allowed |
| `Serialization(String)` | Serialization/deserialization failed |

**Location**: `src/device_constraints/error.rs:8-59`

## Core APIs

### DeviceConstraintManager::new()

**Signature**:
```rust
pub fn new(
    data_path: impl AsRef<Path>,
    battery_monitor: Arc<dyn BatteryMonitor>,
    network_provider: Arc<dyn NetworkStateProvider>,
) -> Result<Self, DeviceConstraintError>
```

**Purpose**: Create a new device constraint manager with platform-specific implementations.

**Parameters**:
- `data_path`: Path for persistent settings storage (Sled database)
- `battery_monitor`: Platform-specific battery monitor implementation
- `network_provider`: Platform-specific network state provider

**Returns**: Configured manager or error if storage fails.

**Example**:
```rust
use swimchain::device_constraints::{
    DeviceConstraintManager, DesktopBatteryMonitor, DesktopNetworkProvider
};
use std::sync::Arc;

let battery = Arc::new(DesktopBatteryMonitor);
let network = Arc::new(DesktopNetworkProvider);

let manager = DeviceConstraintManager::new(
    "/path/to/data",
    battery,
    network,
)?;
```

**Location**: `src/device_constraints/manager.rs:125-163`

### should_contribute()

**Signature**: `pub fn should_contribute(&self) -> bool`

**Purpose**: Quick check if contribution is currently allowed based on all constraints.

**Returns**: `true` if all constraints pass, `false` if any constraint blocks.

**Example**:
```rust
if manager.should_contribute() {
    serve_content();
}
```

**Location**: `src/device_constraints/manager.rs:168-171`

### check_constraints()

**Signature**: `pub fn check_constraints(&self) -> ConstraintStatus`

**Purpose**: Get detailed constraint status for UI display.

**Returns**: `ConstraintStatus` with all constraint states and overall status.

**Example**:
```rust
let status = manager.check_constraints();
if !status.contribution_allowed {
    if let Some(reason) = status.block_reason() {
        println!("Blocked: {}", reason);
    }
}
```

**Location**: `src/device_constraints/manager.rs:177-220`

### try_serve()

**Signature**: `pub fn try_serve(&self, bytes: u64) -> u64`

**Purpose**: Attempt to serve content, respecting all constraints and rate limits.

**Parameters**:
- `bytes`: Number of bytes to serve

**Returns**: Actual bytes acquired (0 if blocked by constraints).

**Example**:
```rust
let requested = 1024;
let acquired = manager.try_serve(requested);
if acquired > 0 {
    // Serve `acquired` bytes
}
```

**Location**: `src/device_constraints/manager.rs:263-279`

### update_settings()

**Signature**:
```rust
pub fn update_settings(
    &self,
    settings: ContributionSettings,
) -> Result<(), DeviceConstraintError>
```

**Purpose**: Update user settings (validates and persists).

**Parameters**:
- `settings`: New settings to apply

**Returns**: Success or validation/storage error.

**Location**: `src/device_constraints/manager.rs:242-261`

### BatteryMonitor (trait)

Platform abstraction for battery state access.

```rust
pub trait BatteryMonitor: Send + Sync {
    fn get_battery_level(&self) -> Option<u8>;
    fn is_charging(&self) -> bool;
    fn get_thermal_state(&self) -> ThermalState;
}
```

**Implementations**:
- `DesktopBatteryMonitor` - Stub for desktop (always "plugged in")
- `MockBatteryMonitor` - For testing (feature: `test-utils`)

**Location**: `src/device_constraints/battery.rs:17-31`

### NetworkStateProvider (trait)

Platform abstraction for network state access.

```rust
pub trait NetworkStateProvider: Send + Sync {
    fn is_wifi(&self) -> bool;
    fn is_cellular(&self) -> bool;
    fn is_connected(&self) -> bool;
}
```

**Implementations**:
- `DesktopNetworkProvider` - Stub for desktop (always WiFi connected)
- `MockNetworkProvider` - For testing (feature: `test-utils`)

**Location**: `src/device_constraints/manager.rs:17-30`

### DailyBandwidthLimiter

Daily bandwidth cap enforcement with rate limiting.

**Key Methods**:
```rust
pub fn new(daily_cap_bytes: u64, rate_mbps: u32) -> Self
pub fn try_acquire(&self, bytes: u64) -> u64
pub fn remaining_daily_budget(&self) -> u64
pub fn is_cap_reached(&self) -> bool
pub fn usage_percent(&self) -> f32
pub fn seconds_until_reset(&self) -> u64
```

**Location**: `src/device_constraints/bandwidth.rs:17-208`

### EfficiencyTracker Methods

**Key Methods**:
```rust
pub fn efficiency_score(&self) -> f32
pub fn qualifies_for_efficient_swimmer(&self) -> bool
pub fn record_bandwidth(&mut self, bytes: u64)
pub fn record_battery(&mut self, mah: u64)
pub fn record_data(&mut self, bytes: u64)
pub fn summary(&self) -> String
```

**Location**: `src/device_constraints/efficiency.rs:38-151`

## Behaviors

### Battery Pause with Hysteresis

The system implements hysteresis to prevent rapid pause/resume cycling when battery hovers near the threshold.

**When it triggers**: Battery level drops below `battery_threshold`

**What happens step by step**:
1. Check battery level against threshold
2. If level < threshold AND not charging -> pause contribution
3. Once paused, set `was_paused = true`
4. To resume, battery must reach `threshold + 5%` (hysteresis margin)
5. OR: Device starts charging (immediately clears pause)

**Edge cases**:
- Battery unavailable (returns None): Does not trigger pause
- Charging at low battery: Contribution allowed
- Critical thermal overrides battery check

**Example**: With default threshold of 20%:
- Pauses at 19%
- Stays paused at 22% (below 25% resume threshold)
- Resumes at 25%
- OR: Plugged in at 18% -> immediate resume

**Constant**: `RESUME_HYSTERESIS_PERCENT = 5`

**Location**: `src/device_constraints/battery.rs:141-182`

### Thermal Throttling

**When it triggers**: ThermalState changes

**What happens step by step**:
1. Check current ThermalState from BatteryMonitor
2. If `Critical` -> always pause (regardless of settings)
3. If `Serious` AND `thermal_pause=true` -> pause
4. If `Normal` or `Fair` -> allow contribution

**Edge cases**:
- `thermal_pause=false` with `Serious` state: Contribution allowed
- `thermal_pause=false` with `Critical` state: Still pauses (Critical always pauses)

### Daily Bandwidth Reset

**When it triggers**: System time crosses midnight UTC

**What happens step by step**:
1. On each `can_serve()` or `try_acquire()` call, check current time
2. Calculate `day_start = (timestamp / 86400) * 86400`
3. If current day start > stored day start:
   - Update stored day start
   - Reset `bytes_used_today` to 0

**Edge cases**:
- Small race window at day boundary may cause slight over/under counting
- Clock skew handled gracefully (only resets if current > stored)

**Location**: `src/device_constraints/bandwidth.rs:75-87`

### WiFi-Only Mode

**When it triggers**: `wifi_only` setting is enabled

**What happens step by step**:
1. On `should_contribute()`, query NetworkStateProvider
2. If `wifi_only=true` AND `is_cellular=true` -> block
3. If `is_connected=false` -> block (regardless of wifi_only)

**Edge cases**:
- `wifi_only=false`: Cellular contribution allowed
- Disconnected: Blocks regardless of other settings

### Efficiency Score Calculation

**When it triggers**: `efficiency_score()` or `qualifies_for_efficient_swimmer()` called

**Formula**:
```
efficiency = bandwidth_served / max(battery_consumed + data_used, 1.0)
```

**Edge cases**:
- Zero input (no battery/data used): Returns `bandwidth_served` (divided by 1.0)
- Zero output (no bandwidth served): Returns 0.0
- Integer overflow: Uses saturating_add for all increments

**Achievement Threshold**: Score >= 2.0 with bandwidth_served > 0

**Ratings**:
| Score | Rating |
|-------|--------|
| >= 3.0 | Excellent |
| >= 2.0 | Good |
| >= 1.0 | Fair |
| > 0.0 | Low |
| 0.0 | None |

**Location**: `src/device_constraints/efficiency.rs:58-81`

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wifi_only` | bool | `true` | Only contribute on WiFi |
| `daily_bandwidth_cap` | u64 | `500_000_000` (500MB) | Max bytes per day |
| `battery_threshold` | u8 | `20` | Pause below this % |
| `thermal_pause` | bool | `true` | Pause on Serious thermal |

### Preset Configurations

| Preset | WiFi-only | Daily Cap | Battery Threshold | Thermal Pause |
|--------|-----------|-----------|-------------------|---------------|
| Default | true | 500MB | 20% | true |
| Minimal | true | 100MB | 30% | true |
| Maximum | false | Unlimited | 5% | false |

### Internal Constants

| Constant | Value | Description | Location |
|----------|-------|-------------|----------|
| `DEFAULT_WIFI_ONLY` | `true` | Default WiFi-only setting | types.rs:12 |
| `DEFAULT_DAILY_BANDWIDTH_CAP` | `500_000_000` | Default 500MB daily cap | types.rs:15 |
| `DEFAULT_BATTERY_THRESHOLD` | `20` | Default 20% battery threshold | types.rs:18 |
| `DEFAULT_THERMAL_PAUSE` | `true` | Default thermal pause enabled | types.rs:21 |
| `RESUME_HYSTERESIS_PERCENT` | `5` | Battery resume margin | battery.rs:14 |
| `EFFICIENT_SWIMMER_THRESHOLD` | `2.0` | Efficiency achievement threshold | efficiency.rs:14 |
| `DEFAULT_RATE_MBPS` | `10` | Default burst rate limit | bandwidth.rs:15 |
| `SECS_PER_DAY` | `86400` | Seconds per day for reset | bandwidth.rs:12 |

## RPC Methods

Device constraints are primarily an internal module with no dedicated RPC methods. Constraint status is typically embedded in node status responses.

### get_node_status (relevant fields)

**Request**:
```json
{"method": "get_node_status", "params": {}}
```

**Response** (device constraint fields):
```json
{
  "result": {
    "contribution": {
      "allowed": true,
      "mode": "ActiveSwimmer",
      "battery_level": 75,
      "thermal_state": "Normal",
      "daily_remaining_mb": 423,
      "efficiency_score": 2.5,
      "block_reason": null
    }
  }
}
```

## CLI Commands

### cs device-status

```bash
cs device-status
```

Displays current device constraint status including battery level, thermal state, bandwidth usage, contribution mode, and whether contribution is allowed.

**Example Output**:
```
Device Constraints Status
-------------------------
Mode: Active Swimmer
Contribution: Allowed
Battery: 75% (not charging)
Thermal: Normal
Daily Bandwidth: 423MB / 500MB remaining
Efficiency Score: 2.50 (Good)
```

### cs device-mode

```bash
cs device-mode [MODE]
```

Get or set contribution mode.

**Options**: `swimmer`, `active-swimmer`, `dedicated-swimmer`, `anchor-mode`

**Example**:
```bash
cs device-mode                    # Show current mode
cs device-mode dedicated-swimmer  # Set mode
```

### cs device-settings

```bash
cs device-settings [OPTIONS]
```

View or update device constraint settings.

**Options**:
- `--wifi-only <BOOL>` - Set WiFi-only mode
- `--cap <BYTES>` - Set daily bandwidth cap
- `--battery <PERCENT>` - Set battery threshold

**Example**:
```bash
cs device-settings                          # Show current settings
cs device-settings --cap 1000000000        # Set 1GB daily cap
cs device-settings --battery 15 --wifi-only false
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `Storage(msg)` | Sled database operation failed | Check disk space and permissions |
| `BatteryUnavailable` | Platform battery API not available | Use desktop stub on non-mobile platforms |
| `NetworkUnavailable` | Platform network API not available | Use desktop stub on non-mobile platforms |
| `InvalidSettings(msg)` | Settings validation failed (e.g., battery_threshold > 100) | Correct the invalid setting value |
| `ModeChangeBlocked { reason }` | Mode change rejected | Check reason for specific cause |
| `Serialization(msg)` | Bincode serialization failed | Data may be corrupted; clear storage |

## Testing

### Running Unit Tests

```bash
# Run all device constraints tests
cargo test device_constraints

# Run specific module tests
cargo test device_constraints::battery
cargo test device_constraints::bandwidth
cargo test device_constraints::efficiency
cargo test device_constraints::manager
```

### Integration Test Example

```rust
use swimchain::device_constraints::{
    DeviceConstraintManager,
    ContributionSettings,
    ContributionMode,
};
use swimchain::device_constraints::battery::MockBatteryMonitor;
use swimchain::device_constraints::manager::MockNetworkProvider;
use std::sync::Arc;
use tempfile::TempDir;

#[test]
fn test_constraint_integration() {
    let tmp = TempDir::new().unwrap();
    let battery = Arc::new(MockBatteryMonitor::new());
    let network = Arc::new(MockNetworkProvider::new());

    let manager = DeviceConstraintManager::new(
        tmp.path(),
        battery.clone() as Arc<dyn BatteryMonitor>,
        network.clone() as Arc<dyn NetworkStateProvider>,
    ).unwrap();

    // Test battery pause
    battery.set_level(15);
    assert!(!manager.should_contribute());

    // Test charging bypass
    battery.set_charging(true);
    assert!(manager.should_contribute());

    // Test WiFi-only blocking
    battery.set_level(100);
    battery.set_charging(false);
    network.set_wifi(false);
    network.set_cellular(true);
    assert!(!manager.should_contribute());
}
```

### Test Coverage

| Module | Test Count | Coverage Areas |
|--------|------------|----------------|
| `types.rs` | 17 tests | Defaults, validation, serialization, mode properties, thermal behavior |
| `battery.rs` | 14 tests | Pause logic, hysteresis, charging bypass, thermal states, mock battery |
| `bandwidth.rs` | 16 tests | Cap enforcement, reset, rate limiting, concurrent access |
| `efficiency.rs` | 16 tests | Formula, threshold, history, trend analysis, saturating arithmetic |
| `storage.rs` | 9 tests | Persistence, roundtrip, validation rejection, clear |
| `manager.rs` | 15 tests | Full integration across all constraints |
| `error.rs` | 3 tests | Display, clone, debug |
| `mod.rs` | 2 tests | Module exports, serde |

**Total**: 92+ inline tests

## Known Limitations

1. **Platform Stubs Only**: Desktop implementations (`DesktopBatteryMonitor`, `DesktopNetworkProvider`) assume always-connected WiFi with no battery constraints. Mobile platforms (iOS, Android) require native implementations of the `BatteryMonitor` and `NetworkStateProvider` traits.

2. **No Disabled Mode**: Unlike the MASTER_FEATURES.md documentation, there is no `Disabled` variant of `ContributionMode`. To effectively disable contribution, users should set `Swimmer` mode with minimal settings.

3. **Thermal State Mapping**: Platform-specific thermal APIs must be manually mapped to the four-state enum (`Normal`, `Fair`, `Serious`, `Critical`). Intermediate values should map to the nearest state.

4. **Day Boundary Race**: The daily bandwidth reset has a small race window at midnight UTC that may cause slight over/under counting of bytes.

5. **Battery Estimation External**: The `battery_consumed` metric requires external estimation; the tracker only records what's reported to it via `record_battery()`.

6. **No Network Events**: Settings changes don't automatically trigger re-evaluation; `should_contribute()` must be called to detect changes.

## Future Work

1. **Native Platform Implementations**: Create iOS and Android implementations of `BatteryMonitor` and `NetworkStateProvider` traits using native APIs.

2. **Adaptive Rate Limiting**: Implement smarter rate limits based on network conditions and peer demand.

3. **Battery Prediction**: Predictive pause based on battery drain rate, not just current level.

4. **Graduated Thermal Throttling**: Progressive throttling instead of binary pause at Serious/Critical states.

5. **Mode Scheduling**: Time-based mode switching (e.g., `AnchorMode` only when plugged in at night).

6. **Offline Efficiency Tracking**: Continue tracking efficiency when offline for later sync.

7. **Settings Sync**: Optional cloud sync of settings across devices.

## Related Features

- **[Storage Layer](./storage-layer_FEATURE_DOC.md)**: Storage profiles (Budget 1GB, Standard 5GB, Flagship 10GB, Desktop 50GB) work with device constraints.
- **[Seeding & Availability](./seeding-availability_FEATURE_DOC.md)**: Mobile seeding configuration integrates with device constraints.
- **[Mobile Platform](./mobile-platform_FEATURE_DOC.md)**: Platform-specific implementations of battery and network providers.
- **[Engagement & Social](./engagement-social_FEATURE_DOC.md)**: Efficiency tracking feeds into the achievement system ("Efficient Swimmer" badge).

---

## Quality Checklist Status

| Check | Status | Implementation Evidence |
|-------|--------|------------------------|
| Battery monitoring accurate | Implemented | Hysteresis prevents flapping (`RESUME_HYSTERESIS_PERCENT = 5`) |
| Bandwidth resets at UTC midnight | Implemented | `day_start_for()` calculates midnight, `maybe_reset()` checks on each operation |
| Thermal throttling responsive | Implemented | Critical always pauses, Serious respects `thermal_pause` setting |
| Efficiency calculations correct | Implemented | Formula matches spec: `bandwidth_served / max(battery + data, 1.0)` |
| Settings persist correctly | Implemented | Sled-based storage with validation before save |

---

*Documentation generated from implementation in `src/device_constraints/`. Last verified against commit: main branch.*
