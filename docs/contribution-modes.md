# Contribution Modes (Milestone 7.8)

Users choose their contribution commitment level, which gates the maximum SwimmerLevel they can achieve.

## Mode Definitions (SPEC_09 §9.2)

| Mode | Description | Max Level | Background | Daily Cap |
|------|-------------|-----------|------------|-----------|
| **Swimmer** | Foreground only | Regular | No | Yes |
| **Active Swimmer** | Background on WiFi | Lifeguard | WiFi only | Yes |
| **Dedicated Swimmer** | Background always | Anchor | Yes | Yes |
| **Anchor Mode** | Always-on | PoolKeeper | Yes | No |

## Mode Details

### Swimmer (Default)
- Contributes only when app is in foreground
- Minimal battery and data impact
- Maximum level: Regular
- Good for casual users

### Active Swimmer
- Background contribution on WiFi connections
- Respects daily bandwidth cap
- Maximum level: Lifeguard
- Good for users who want to contribute more without cellular data usage

### Dedicated Swimmer
- Background contribution on any connection
- Respects daily bandwidth cap (but typically higher)
- Maximum level: Anchor
- Good for committed network participants

### Anchor Mode
- Always-on contribution
- No daily cap (unlimited)
- Maximum level: PoolKeeper
- For dedicated infrastructure providers

## Level Gating

The contribution mode gates the maximum SwimmerLevel a user can reach:

```rust
impl ContributionMode {
    pub fn max_level(&self) -> SwimmerLevel {
        match self {
            Self::Swimmer => SwimmerLevel::Regular,
            Self::ActiveSwimmer => SwimmerLevel::Lifeguard,
            Self::DedicatedSwimmer => SwimmerLevel::Anchor,
            Self::AnchorMode => SwimmerLevel::PoolKeeper,
        }
    }
}
```

This means:
- Even if you have enough bandwidth/uptime for Anchor level, you can only reach Lifeguard if you're in Active Swimmer mode
- To reach PoolKeeper, you must enable Anchor Mode (always-on, unlimited)

## Selecting a Mode

```rust
use swimchain::device_constraints::{DeviceConstraintManager, ContributionMode};

// Get current mode
let mode = manager.get_mode();
println!("Current: {} {}", mode.icon(), mode.name());

// Change mode
manager.set_mode(ContributionMode::ActiveSwimmer)?;

// Mode properties
println!("Allows background: {}", mode.allows_background());
println!("Requires WiFi: {}", mode.background_requires_wifi());
println!("Has daily cap: {}", mode.has_daily_cap());
```

## Mode Properties

| Mode | `allows_background()` | `background_requires_wifi()` | `has_daily_cap()` |
|------|----------------------|------------------------------|-------------------|
| Swimmer | `false` | `false` | `true` |
| ActiveSwimmer | `true` | `true` | `true` |
| DedicatedSwimmer | `true` | `false` | `true` |
| AnchorMode | `true` | `false` | `false` |

## Persistence

Mode selection is persisted across app restarts:

```rust
// Set mode (persisted immediately)
manager.set_mode(ContributionMode::DedicatedSwimmer)?;

// On next app launch, mode is restored
let manager = DeviceConstraintManager::new(path, ...)?;
assert_eq!(manager.get_mode(), ContributionMode::DedicatedSwimmer);
```

## UI Recommendations

1. **Mode Selector** - Show all 4 modes with descriptions
2. **Level Indicator** - Show max achievable level for selected mode
3. **Resource Impact** - Indicate battery/data expectations
4. **Upgrade Prompt** - When user is at mode's max level, prompt to upgrade mode

Example UI text:
```
Swimmer
You're contributing when using the app.
Max Level: Regular

[Active Swimmer]
Contribute on WiFi even when app is closed.
Max Level: Lifeguard
Expected: ~500MB/day, minimal battery impact

[Dedicated Swimmer]
Contribute on any connection when app is closed.
Max Level: Anchor
Expected: Up to 2GB/day

[Anchor Mode]
Always contribute to keep the network healthy.
Max Level: PoolKeeper
Expected: Unlimited bandwidth
```

## Integration with Swimmer Levels

The mode check should be applied when computing effective level:

```rust
fn effective_level(computed: SwimmerLevel, mode: ContributionMode) -> SwimmerLevel {
    std::cmp::min(computed, mode.max_level())
}
```

Example:
- User has 300GB/month bandwidth (Anchor level metrics)
- User is in Active Swimmer mode
- Effective level: Lifeguard (mode cap)

## Related Documentation

- [Device Constraints](device-constraints.md) - Full constraint system
- [Swimmer Levels](swimmer-levels.md) - Level requirements
- [Contribution Benefits](contribution-benefits.md) - Benefits per level
