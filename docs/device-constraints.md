# Device Constraints (Milestone 7.8)

Device-aware contribution system per SPEC_09 Section 9.

## Overview

The device constraints module ensures Swimchain is a "good citizen" on mobile devices by:

- Respecting battery levels and thermal state
- Enforcing daily bandwidth caps
- Supporting WiFi-only mode
- Tracking resource efficiency

This allows users to contribute to the network without excessive battery drain or data usage.

## Architecture

```
src/device_constraints/
  mod.rs          - Module exports
  error.rs        - Error types
  types.rs        - Core types (ContributionSettings, ContributionMode, ThermalState)
  battery.rs      - Battery monitoring with hysteresis
  bandwidth.rs    - Daily bandwidth limiting
  efficiency.rs   - Efficiency tracking per SPEC_09 §9.3
  storage.rs      - Sled-based persistence
  manager.rs      - Unified DeviceConstraintManager
```

## ContributionSettings

Controls how the node participates in network contribution:

```rust
pub struct ContributionSettings {
    /// Contribute only when on WiFi (not cellular)
    pub wifi_only: bool,              // default: true

    /// Maximum bandwidth per day (bytes)
    pub daily_bandwidth_cap: u64,     // default: 500_000_000 (500MB)

    /// Pause contribution below this battery level (percent)
    pub battery_threshold: u8,        // default: 20

    /// Pause during system thermal throttling
    pub thermal_pause: bool,          // default: true
}
```

### Default Values (SPEC_09 §9.1)

| Setting | Default | Description |
|---------|---------|-------------|
| `wifi_only` | `true` | Conservative - prevents cellular data usage |
| `daily_bandwidth_cap` | 500MB | Reasonable daily limit |
| `battery_threshold` | 20% | Pause below this level |
| `thermal_pause` | `true` | Respect device health |

## Battery Monitoring

### Pause/Resume Behavior

The battery checker implements hysteresis to prevent rapid cycling:

1. **Pause** when battery drops below `battery_threshold`
2. **Resume** only when battery exceeds `threshold + 5%` OR device is charging

Example with 20% threshold:
- At 19%: Pause contribution
- At 22%: Still paused (hysteresis)
- At 25%: Resume contribution
- At 15% while charging: Do NOT pause (charging bypasses)

### Thermal States

```rust
pub enum ThermalState {
    Normal = 0,    // OK to contribute
    Fair = 1,      // OK to contribute
    Serious = 2,   // Pause if thermal_pause enabled
    Critical = 3,  // Always pause
}
```

- `Critical` always pauses, regardless of `thermal_pause` setting
- `Serious` only pauses when `thermal_pause = true`

## Bandwidth Limiting

### Daily Cap with Midnight UTC Reset

The `DailyBandwidthLimiter` enforces daily bandwidth budgets:

```rust
let limiter = DailyBandwidthLimiter::new(500_000_000, 10); // 500MB, 10Mbps

// Check if budget allows
if limiter.can_serve(bytes) {
    let acquired = limiter.try_acquire(bytes);
    // acquired may be less due to rate limiting
}

// Get remaining budget
let remaining = limiter.remaining_daily_budget();
```

The counter automatically resets at midnight UTC.

### Rate Limiting

Within the daily cap, a token bucket rate limiter prevents burst usage:
- Default: 10 Mbps
- Allows bursting up to 1 second of bandwidth
- Refills continuously

## Efficiency Tracking

### Formula (SPEC_09 §9.3)

```rust
efficiency = bandwidth_served / (battery_consumed + data_used).max(1.0)
```

High efficiency means contributing more while consuming fewer resources.

### Efficient Swimmer Achievement

Threshold: `efficiency_score >= 2.0` AND `bandwidth_served > 0`

```rust
if tracker.qualifies_for_efficient_swimmer() {
    // Award "Efficient Swimmer" badge
}
```

## DeviceConstraintManager

Unified API for all constraints:

```rust
use swimchain::device_constraints::{
    DeviceConstraintManager, ContributionSettings, ContributionMode
};

// Create manager
let manager = DeviceConstraintManager::new(
    data_path,
    battery_monitor,
    network_provider,
)?;

// Check if contribution allowed
if manager.should_contribute() {
    let bytes = manager.try_serve(1024);
}

// Get detailed status for UI
let status = manager.check_constraints();
println!("Battery: {:?}%", status.battery_level);
println!("Daily remaining: {} bytes", status.daily_remaining_bytes);
println!("Contribution allowed: {}", status.contribution_allowed);
```

### ConstraintStatus

Full status for UI display:

```rust
pub struct ConstraintStatus {
    pub wifi_only_active: bool,
    pub on_cellular: bool,
    pub battery_paused: bool,
    pub battery_level: Option<u8>,
    pub thermal_paused: bool,
    pub thermal_state: ThermalState,
    pub daily_cap_reached: bool,
    pub daily_remaining_bytes: u64,
    pub contribution_allowed: bool,
    pub mode: ContributionMode,
    pub efficiency_score: f32,
}
```

## Platform Integration

### Battery Monitor Trait

```rust
pub trait BatteryMonitor: Send + Sync {
    fn get_battery_level(&self) -> Option<u8>;
    fn is_charging(&self) -> bool;
    fn get_thermal_state(&self) -> ThermalState;
}
```

Implementations needed for:
- iOS: `UIDevice.current.batteryLevel`, `ProcessInfo.processInfo.thermalState`
- Android: `BatteryManager`, thermal API
- Desktop: `DesktopBatteryMonitor` (stub, assumes plugged in)

### Network State Provider Trait

```rust
pub trait NetworkStateProvider: Send + Sync {
    fn is_wifi(&self) -> bool;
    fn is_cellular(&self) -> bool;
    fn is_connected(&self) -> bool;
}
```

Implementations needed for:
- iOS: `NWPathMonitor`
- Android: `ConnectivityManager`
- Desktop: `DesktopNetworkProvider` (always WiFi/connected)

## Persistence

Settings and mode are persisted using sled:

```rust
// Automatic on update
manager.update_settings(new_settings)?;
manager.set_mode(ContributionMode::ActiveSwimmer)?;

// Loaded on startup
let manager = DeviceConstraintManager::new(path, ...)?;
// Mode and settings restored from previous session
```

## Testing

Mock implementations provided for testing:

```rust
#[cfg(test)]
use swimchain::device_constraints::battery::MockBatteryMonitor;
use swimchain::device_constraints::manager::MockNetworkProvider;

let battery = Arc::new(MockBatteryMonitor::new());
battery.set_level(50);
battery.set_charging(false);
battery.set_thermal(ThermalState::Normal);

let network = Arc::new(MockNetworkProvider::new());
network.set_wifi(true);
network.set_cellular(false);
```

## Related Documentation

- [Contribution Modes](contribution-modes.md) - Mode definitions and level gating
- [Swimmer Levels](swimmer-levels.md) - Level system overview
- [Streaks and Achievements](streaks-achievements.md) - Efficient Swimmer badge
