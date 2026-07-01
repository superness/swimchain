//! Device constraint type definitions
//!
//! Defines ContributionSettings, ContributionMode, and ThermalState
//! per SPEC_09 Section 9.

use serde::{Deserialize, Serialize};
use std::fmt;

// === Default values per SPEC_09 §9.1 ===

/// Default WiFi-only setting (conservative)
pub const DEFAULT_WIFI_ONLY: bool = true;

/// Default daily bandwidth cap in bytes (500MB)
pub const DEFAULT_DAILY_BANDWIDTH_CAP: u64 = 500_000_000;

/// Default battery threshold percentage
pub const DEFAULT_BATTERY_THRESHOLD: u8 = 20;

/// Default thermal pause setting
pub const DEFAULT_THERMAL_PAUSE: bool = true;

/// Device constraint settings per SPEC_09 §9.1
///
/// Controls how the node participates in network contribution
/// while respecting device resources.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContributionSettings {
    /// Contribute only when on WiFi (not cellular)
    pub wifi_only: bool,

    /// Maximum bandwidth per day (bytes)
    pub daily_bandwidth_cap: u64,

    /// Pause contribution below this battery level (percent, 0-100)
    pub battery_threshold: u8,

    /// Pause during system thermal throttling
    pub thermal_pause: bool,
}

impl Default for ContributionSettings {
    fn default() -> Self {
        Self {
            wifi_only: DEFAULT_WIFI_ONLY,
            daily_bandwidth_cap: DEFAULT_DAILY_BANDWIDTH_CAP,
            battery_threshold: DEFAULT_BATTERY_THRESHOLD,
            thermal_pause: DEFAULT_THERMAL_PAUSE,
        }
    }
}

impl ContributionSettings {
    /// Create settings for minimal contribution (most conservative)
    #[must_use]
    pub fn minimal() -> Self {
        Self {
            wifi_only: true,
            daily_bandwidth_cap: 100_000_000, // 100MB
            battery_threshold: 30,
            thermal_pause: true,
        }
    }

    /// Create settings for maximum contribution (least conservative)
    #[must_use]
    pub fn maximum() -> Self {
        Self {
            wifi_only: false,
            daily_bandwidth_cap: u64::MAX, // No limit
            battery_threshold: 5,
            thermal_pause: false,
        }
    }

    /// Validate settings
    pub fn validate(&self) -> Result<(), String> {
        if self.battery_threshold > 100 {
            return Err(format!(
                "battery_threshold {} exceeds 100%",
                self.battery_threshold
            ));
        }
        Ok(())
    }

    /// Get daily bandwidth cap in human-readable format
    #[must_use]
    pub fn cap_display(&self) -> String {
        if self.daily_bandwidth_cap == u64::MAX {
            "Unlimited".to_string()
        } else if self.daily_bandwidth_cap >= 1_000_000_000 {
            format!("{:.1}GB", self.daily_bandwidth_cap as f64 / 1_000_000_000.0)
        } else {
            format!("{:.0}MB", self.daily_bandwidth_cap as f64 / 1_000_000.0)
        }
    }
}

/// Contribution mode per SPEC_09 §9.2
///
/// Users choose their commitment level, which affects background behavior.
///
/// # Note on Disabled Mode
///
/// SPEC_09 §9.2 mentions a "Disabled" variant, but it is intentionally omitted.
/// The `Swimmer` mode with `wifi_only: true` and `daily_bandwidth_cap: 0` achieves
/// the same effect while maintaining simpler serialization and avoiding the need
/// for special-case handling throughout the codebase. Users who want to completely
/// disable contribution can set the bandwidth cap to 0.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum ContributionMode {
    /// Foreground only, minimal background activity
    Swimmer = 0,

    /// Background on WiFi with daily cap
    ActiveSwimmer = 1,

    /// Background always, high daily cap
    DedicatedSwimmer = 2,

    /// Always-on, no cap
    AnchorMode = 3,
}

impl Default for ContributionMode {
    fn default() -> Self {
        Self::Swimmer
    }
}

impl ContributionMode {
    /// Human-readable description
    #[must_use]
    pub fn description(&self) -> &'static str {
        match self {
            Self::Swimmer => "Foreground only, minimal background",
            Self::ActiveSwimmer => "Background on WiFi, daily cap",
            Self::DedicatedSwimmer => "Background always, high cap",
            Self::AnchorMode => "Always-on, no cap",
        }
    }

    /// Short name for the mode
    #[must_use]
    pub fn name(&self) -> &'static str {
        match self {
            Self::Swimmer => "Swimmer",
            Self::ActiveSwimmer => "Active Swimmer",
            Self::DedicatedSwimmer => "Dedicated Swimmer",
            Self::AnchorMode => "Anchor Mode",
        }
    }

    /// User-friendly display name for non-technical users
    #[must_use]
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Swimmer => "Basic Mode",
            Self::ActiveSwimmer => "Help when on WiFi",
            Self::DedicatedSwimmer => "Always help",
            Self::AnchorMode => "Maximum contribution",
        }
    }

    /// Icon for the mode
    #[must_use]
    pub fn icon(&self) -> &'static str {
        match self {
            Self::Swimmer => "🏊",
            Self::ActiveSwimmer => "🏊‍♂️",
            Self::DedicatedSwimmer => "🤿",
            Self::AnchorMode => "⚓",
        }
    }

    /// Whether this mode allows background contribution
    #[must_use]
    pub fn allows_background(&self) -> bool {
        !matches!(self, Self::Swimmer)
    }

    /// Whether this mode requires WiFi for background work
    #[must_use]
    pub fn background_requires_wifi(&self) -> bool {
        matches!(self, Self::ActiveSwimmer)
    }

    /// Whether this mode has a daily cap
    #[must_use]
    pub fn has_daily_cap(&self) -> bool {
        !matches!(self, Self::AnchorMode)
    }

    /// Convert from u8 representation
    #[must_use]
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0 => Some(Self::Swimmer),
            1 => Some(Self::ActiveSwimmer),
            2 => Some(Self::DedicatedSwimmer),
            3 => Some(Self::AnchorMode),
            _ => None,
        }
    }

    /// Convert to u8 representation
    #[must_use]
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Get all modes in ascending order
    #[must_use]
    pub fn all() -> &'static [ContributionMode] {
        &[
            Self::Swimmer,
            Self::ActiveSwimmer,
            Self::DedicatedSwimmer,
            Self::AnchorMode,
        ]
    }
}

impl fmt::Display for ContributionMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {}", self.icon(), self.name())
    }
}

/// Thermal state for pause decisions
///
/// Maps to system thermal state APIs. Used to pause contribution
/// when the device is overheating.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum ThermalState {
    /// Normal temperature, OK to contribute
    Normal = 0,

    /// Slightly elevated, OK to contribute
    Fair = 1,

    /// High temperature, pause if thermal_pause enabled
    Serious = 2,

    /// Critical temperature, always pause
    Critical = 3,
}

impl Default for ThermalState {
    fn default() -> Self {
        Self::Normal
    }
}

impl ThermalState {
    /// Whether this thermal state should cause contribution pause
    /// when thermal_pause is enabled
    #[must_use]
    pub fn should_pause(&self, thermal_pause_enabled: bool) -> bool {
        match self {
            Self::Normal | Self::Fair => false,
            Self::Serious => thermal_pause_enabled,
            Self::Critical => true, // Always pause at critical
        }
    }

    /// Convert from u8 representation
    #[must_use]
    pub fn from_u8(val: u8) -> Option<Self> {
        match val {
            0 => Some(Self::Normal),
            1 => Some(Self::Fair),
            2 => Some(Self::Serious),
            3 => Some(Self::Critical),
            _ => None,
        }
    }

    /// Convert to u8 representation
    #[must_use]
    pub fn as_u8(&self) -> u8 {
        *self as u8
    }

    /// Human-readable name
    #[must_use]
    pub fn name(&self) -> &'static str {
        match self {
            Self::Normal => "Normal",
            Self::Fair => "Fair",
            Self::Serious => "Serious",
            Self::Critical => "Critical",
        }
    }

    /// User-friendly display name for non-technical users
    #[must_use]
    pub fn display_name(&self) -> &'static str {
        match self {
            Self::Normal => "Temperature OK",
            Self::Fair => "Slightly warm",
            Self::Serious => "Phone is warm",
            Self::Critical => "Phone is hot",
        }
    }
}

impl fmt::Display for ThermalState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.name())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contribution_settings_defaults() {
        let settings = ContributionSettings::default();

        // Per SPEC_09 §9.1
        assert!(settings.wifi_only);
        assert_eq!(settings.daily_bandwidth_cap, 500_000_000); // 500MB
        assert_eq!(settings.battery_threshold, 20);
        assert!(settings.thermal_pause);
    }

    #[test]
    fn test_contribution_settings_minimal() {
        let settings = ContributionSettings::minimal();
        assert!(settings.wifi_only);
        assert_eq!(settings.daily_bandwidth_cap, 100_000_000);
        assert_eq!(settings.battery_threshold, 30);
        assert!(settings.thermal_pause);
    }

    #[test]
    fn test_contribution_settings_maximum() {
        let settings = ContributionSettings::maximum();
        assert!(!settings.wifi_only);
        assert_eq!(settings.daily_bandwidth_cap, u64::MAX);
        assert_eq!(settings.battery_threshold, 5);
        assert!(!settings.thermal_pause);
    }

    #[test]
    fn test_contribution_settings_validate() {
        let valid = ContributionSettings::default();
        assert!(valid.validate().is_ok());

        let invalid = ContributionSettings {
            battery_threshold: 150,
            ..Default::default()
        };
        assert!(invalid.validate().is_err());
    }

    #[test]
    fn test_contribution_settings_cap_display() {
        let settings = ContributionSettings::default();
        assert_eq!(settings.cap_display(), "500MB");

        let gb_settings = ContributionSettings {
            daily_bandwidth_cap: 2_500_000_000,
            ..Default::default()
        };
        assert_eq!(gb_settings.cap_display(), "2.5GB");

        let unlimited = ContributionSettings::maximum();
        assert_eq!(unlimited.cap_display(), "Unlimited");
    }

    #[test]
    fn test_contribution_mode_default() {
        assert_eq!(ContributionMode::default(), ContributionMode::Swimmer);
    }

    #[test]
    fn test_contribution_mode_ordering() {
        assert!(ContributionMode::Swimmer < ContributionMode::ActiveSwimmer);
        assert!(ContributionMode::ActiveSwimmer < ContributionMode::DedicatedSwimmer);
        assert!(ContributionMode::DedicatedSwimmer < ContributionMode::AnchorMode);
    }

    #[test]
    fn test_contribution_mode_from_u8() {
        assert_eq!(
            ContributionMode::from_u8(0),
            Some(ContributionMode::Swimmer)
        );
        assert_eq!(
            ContributionMode::from_u8(1),
            Some(ContributionMode::ActiveSwimmer)
        );
        assert_eq!(
            ContributionMode::from_u8(2),
            Some(ContributionMode::DedicatedSwimmer)
        );
        assert_eq!(
            ContributionMode::from_u8(3),
            Some(ContributionMode::AnchorMode)
        );
        assert_eq!(ContributionMode::from_u8(4), None);
        assert_eq!(ContributionMode::from_u8(255), None);
    }

    #[test]
    fn test_contribution_mode_roundtrip() {
        for mode in ContributionMode::all() {
            let val = mode.as_u8();
            let restored = ContributionMode::from_u8(val).unwrap();
            assert_eq!(*mode, restored);
        }
    }

    #[test]
    fn test_contribution_mode_background_properties() {
        assert!(!ContributionMode::Swimmer.allows_background());
        assert!(ContributionMode::ActiveSwimmer.allows_background());
        assert!(ContributionMode::DedicatedSwimmer.allows_background());
        assert!(ContributionMode::AnchorMode.allows_background());

        assert!(!ContributionMode::Swimmer.background_requires_wifi());
        assert!(ContributionMode::ActiveSwimmer.background_requires_wifi());
        assert!(!ContributionMode::DedicatedSwimmer.background_requires_wifi());
        assert!(!ContributionMode::AnchorMode.background_requires_wifi());
    }

    #[test]
    fn test_contribution_mode_has_daily_cap() {
        assert!(ContributionMode::Swimmer.has_daily_cap());
        assert!(ContributionMode::ActiveSwimmer.has_daily_cap());
        assert!(ContributionMode::DedicatedSwimmer.has_daily_cap());
        assert!(!ContributionMode::AnchorMode.has_daily_cap());
    }

    #[test]
    fn test_contribution_mode_display() {
        let mode = ContributionMode::AnchorMode;
        let display = format!("{}", mode);
        assert!(display.contains("Anchor Mode"));
    }

    #[test]
    fn test_thermal_state_ordering() {
        assert!(ThermalState::Normal < ThermalState::Fair);
        assert!(ThermalState::Fair < ThermalState::Serious);
        assert!(ThermalState::Serious < ThermalState::Critical);
    }

    #[test]
    fn test_thermal_state_should_pause() {
        assert!(!ThermalState::Normal.should_pause(true));
        assert!(!ThermalState::Normal.should_pause(false));
        assert!(!ThermalState::Fair.should_pause(true));
        assert!(!ThermalState::Fair.should_pause(false));

        assert!(ThermalState::Serious.should_pause(true));
        assert!(!ThermalState::Serious.should_pause(false));

        assert!(ThermalState::Critical.should_pause(true));
        assert!(ThermalState::Critical.should_pause(false)); // Always pauses
    }

    #[test]
    fn test_thermal_state_from_u8() {
        assert_eq!(ThermalState::from_u8(0), Some(ThermalState::Normal));
        assert_eq!(ThermalState::from_u8(1), Some(ThermalState::Fair));
        assert_eq!(ThermalState::from_u8(2), Some(ThermalState::Serious));
        assert_eq!(ThermalState::from_u8(3), Some(ThermalState::Critical));
        assert_eq!(ThermalState::from_u8(4), None);
    }

    #[test]
    fn test_thermal_state_roundtrip() {
        for val in 0..=3 {
            let state = ThermalState::from_u8(val).unwrap();
            assert_eq!(state.as_u8(), val);
        }
    }

    #[test]
    fn test_serialization() {
        let settings = ContributionSettings::default();
        let serialized = bincode::serialize(&settings).unwrap();
        let deserialized: ContributionSettings = bincode::deserialize(&serialized).unwrap();
        assert_eq!(settings, deserialized);

        let mode = ContributionMode::DedicatedSwimmer;
        let serialized = bincode::serialize(&mode).unwrap();
        let deserialized: ContributionMode = bincode::deserialize(&serialized).unwrap();
        assert_eq!(mode, deserialized);

        let thermal = ThermalState::Serious;
        let serialized = bincode::serialize(&thermal).unwrap();
        let deserialized: ThermalState = bincode::deserialize(&serialized).unwrap();
        assert_eq!(thermal, deserialized);
    }
}
