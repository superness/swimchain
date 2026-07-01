//! Battery monitoring and thermal awareness
//!
//! Provides platform-abstracted battery monitoring for contribution pause decisions.
//! Implements hysteresis to prevent rapid pause/resume cycling.

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::{ContributionSettings, ThermalState};

/// Hysteresis margin for resume (percentage points above pause threshold)
pub const RESUME_HYSTERESIS_PERCENT: u8 = 5;

/// Battery monitor trait for platform abstraction
///
/// Implementations should provide access to system battery state.
/// Platform-specific implementations (iOS, Android, desktop) would
/// implement this trait with native API calls.
pub trait BatteryMonitor: Send + Sync {
    /// Get current battery level (0-100%)
    /// Returns None if battery information is unavailable
    fn get_battery_level(&self) -> Option<u8>;

    /// Check if device is currently charging
    fn is_charging(&self) -> bool;

    /// Get current thermal state
    fn get_thermal_state(&self) -> ThermalState;
}

/// Current battery state snapshot
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BatteryState {
    /// Battery level (0-100%), None if unavailable
    pub level: Option<u8>,

    /// Whether device is charging
    pub charging: bool,

    /// Current thermal state
    pub thermal_state: ThermalState,

    /// Timestamp when this state was captured (Unix seconds)
    pub timestamp_secs: u64,
}

impl BatteryState {
    /// Create a new battery state with current timestamp
    #[must_use]
    pub fn new(level: Option<u8>, charging: bool, thermal_state: ThermalState) -> Self {
        Self {
            level,
            charging,
            thermal_state,
            timestamp_secs: Self::now_secs(),
        }
    }

    fn now_secs() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

impl Default for BatteryState {
    fn default() -> Self {
        Self {
            level: None,
            charging: false,
            thermal_state: ThermalState::Normal,
            timestamp_secs: 0,
        }
    }
}

/// Reason for pausing contribution
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PauseReason {
    /// Battery level is below threshold
    BatteryLow {
        /// Current battery level
        level: u8,
    },

    /// Thermal state is Serious (and thermal_pause is enabled)
    ThermalSerious,

    /// Thermal state is Critical (always pauses)
    ThermalCritical,
}

impl std::fmt::Display for PauseReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::BatteryLow { level } => write!(f, "Battery low ({}%)", level),
            Self::ThermalSerious => write!(f, "Device overheating"),
            Self::ThermalCritical => write!(f, "Device critically hot"),
        }
    }
}

/// Battery-aware contribution checker
///
/// Coordinates battery monitoring with contribution settings to determine
/// when contribution should be paused or resumed. Implements hysteresis
/// to prevent rapid cycling.
pub struct BatteryChecker {
    /// Battery monitor implementation
    monitor: Arc<dyn BatteryMonitor>,

    /// Current settings
    settings: Arc<RwLock<ContributionSettings>>,

    /// Whether we were paused on last check (for hysteresis)
    was_paused: AtomicBool,
}

impl BatteryChecker {
    /// Create a new battery checker
    pub fn new(
        monitor: Arc<dyn BatteryMonitor>,
        settings: Arc<RwLock<ContributionSettings>>,
    ) -> Self {
        Self {
            monitor,
            settings,
            was_paused: AtomicBool::new(false),
        }
    }

    /// Check if contribution should be paused
    ///
    /// Returns (should_pause, reason) where reason is Some if should_pause is true.
    ///
    /// Implements hysteresis: once paused, only resumes at threshold + 5%
    /// (or when charging).
    pub fn should_pause_contribution(&self) -> (bool, Option<PauseReason>) {
        let state = self.get_state();
        let settings = self.settings.read().unwrap_or_else(|e| e.into_inner());

        // Critical thermal always pauses (regardless of thermal_pause setting)
        if state.thermal_state == ThermalState::Critical {
            self.was_paused.store(true, Ordering::Relaxed);
            return (true, Some(PauseReason::ThermalCritical));
        }

        // Serious thermal pauses if thermal_pause enabled
        if state.thermal_state == ThermalState::Serious && settings.thermal_pause {
            self.was_paused.store(true, Ordering::Relaxed);
            return (true, Some(PauseReason::ThermalSerious));
        }

        // Battery level check with hysteresis
        if let Some(level) = state.level {
            let was_paused = self.was_paused.load(Ordering::Relaxed);
            let pause_threshold = settings.battery_threshold;
            let resume_threshold = pause_threshold.saturating_add(RESUME_HYSTERESIS_PERCENT);

            if was_paused {
                // Need to exceed resume threshold OR be charging to unpause
                if level < resume_threshold && !state.charging {
                    return (true, Some(PauseReason::BatteryLow { level }));
                }
                // Above resume threshold or charging - unpause
            } else {
                // Pause when below threshold (unless charging)
                if level < pause_threshold && !state.charging {
                    self.was_paused.store(true, Ordering::Relaxed);
                    return (true, Some(PauseReason::BatteryLow { level }));
                }
            }

            // If charging or above threshold, we're not paused
            self.was_paused.store(false, Ordering::Relaxed);
        }

        (false, None)
    }

    /// Get current battery state
    #[must_use]
    pub fn get_state(&self) -> BatteryState {
        BatteryState::new(
            self.monitor.get_battery_level(),
            self.monitor.is_charging(),
            self.monitor.get_thermal_state(),
        )
    }

    /// Check if currently in paused state
    #[must_use]
    pub fn is_paused(&self) -> bool {
        self.was_paused.load(Ordering::Relaxed)
    }

    /// Reset the paused state (for testing or explicit resume)
    pub fn reset_paused(&self) {
        self.was_paused.store(false, Ordering::Relaxed);
    }
}

/// Mock battery monitor for testing
#[cfg(any(test, feature = "test-utils"))]
pub struct MockBatteryMonitor {
    level: std::sync::atomic::AtomicU8,
    charging: AtomicBool,
    thermal: std::sync::atomic::AtomicU8,
    level_available: AtomicBool,
}

#[cfg(any(test, feature = "test-utils"))]
impl MockBatteryMonitor {
    /// Create a new mock with default values
    pub fn new() -> Self {
        Self {
            level: std::sync::atomic::AtomicU8::new(100),
            charging: AtomicBool::new(false),
            thermal: std::sync::atomic::AtomicU8::new(ThermalState::Normal.as_u8()),
            level_available: AtomicBool::new(true),
        }
    }

    /// Set battery level (0-100)
    pub fn set_level(&self, level: u8) {
        self.level.store(level, Ordering::Relaxed);
    }

    /// Set whether battery level is available
    pub fn set_level_available(&self, available: bool) {
        self.level_available.store(available, Ordering::Relaxed);
    }

    /// Set charging state
    pub fn set_charging(&self, charging: bool) {
        self.charging.store(charging, Ordering::Relaxed);
    }

    /// Set thermal state
    pub fn set_thermal(&self, state: ThermalState) {
        self.thermal.store(state.as_u8(), Ordering::Relaxed);
    }
}

#[cfg(any(test, feature = "test-utils"))]
impl Default for MockBatteryMonitor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "test-utils"))]
impl BatteryMonitor for MockBatteryMonitor {
    fn get_battery_level(&self) -> Option<u8> {
        if self.level_available.load(Ordering::Relaxed) {
            Some(self.level.load(Ordering::Relaxed))
        } else {
            None
        }
    }

    fn is_charging(&self) -> bool {
        self.charging.load(Ordering::Relaxed)
    }

    fn get_thermal_state(&self) -> ThermalState {
        ThermalState::from_u8(self.thermal.load(Ordering::Relaxed)).unwrap_or(ThermalState::Normal)
    }
}

/// Desktop battery monitor (stub - always returns "plugged in")
pub struct DesktopBatteryMonitor;

impl BatteryMonitor for DesktopBatteryMonitor {
    fn get_battery_level(&self) -> Option<u8> {
        None // Desktop assumed to be plugged in
    }

    fn is_charging(&self) -> bool {
        true // Always charging (plugged in)
    }

    fn get_thermal_state(&self) -> ThermalState {
        ThermalState::Normal // Assume normal thermal on desktop
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_checker(monitor: Arc<MockBatteryMonitor>) -> BatteryChecker {
        let settings = Arc::new(RwLock::new(ContributionSettings::default()));
        BatteryChecker::new(monitor, settings)
    }

    fn make_checker_with_settings(
        monitor: Arc<MockBatteryMonitor>,
        settings: ContributionSettings,
    ) -> BatteryChecker {
        BatteryChecker::new(monitor, Arc::new(RwLock::new(settings)))
    }

    #[test]
    fn test_battery_state_creation() {
        let state = BatteryState::new(Some(75), true, ThermalState::Normal);
        assert_eq!(state.level, Some(75));
        assert!(state.charging);
        assert_eq!(state.thermal_state, ThermalState::Normal);
        assert!(state.timestamp_secs > 0);
    }

    #[test]
    fn test_pause_reason_display() {
        assert_eq!(
            format!("{}", PauseReason::BatteryLow { level: 15 }),
            "Battery low (15%)"
        );
        assert_eq!(
            format!("{}", PauseReason::ThermalSerious),
            "Device overheating"
        );
        assert_eq!(
            format!("{}", PauseReason::ThermalCritical),
            "Device critically hot"
        );
    }

    #[test]
    fn test_battery_pause_below_threshold() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        // Default threshold is 20%
        monitor.set_level(15);

        let (paused, reason) = checker.should_pause_contribution();
        assert!(paused);
        assert_eq!(reason, Some(PauseReason::BatteryLow { level: 15 }));
    }

    #[test]
    fn test_battery_no_pause_above_threshold() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        monitor.set_level(50);

        let (paused, reason) = checker.should_pause_contribution();
        assert!(!paused);
        assert!(reason.is_none());
    }

    #[test]
    fn test_battery_hysteresis() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        // First, go below threshold (20%) to trigger pause
        monitor.set_level(15);
        let (paused, _) = checker.should_pause_contribution();
        assert!(paused);
        assert!(checker.is_paused());

        // At 22% (threshold + 2), still below resume threshold (25%)
        monitor.set_level(22);
        let (paused, _) = checker.should_pause_contribution();
        assert!(paused); // Still paused due to hysteresis

        // At 25% (threshold + 5), should resume
        monitor.set_level(25);
        let (paused, _) = checker.should_pause_contribution();
        assert!(!paused);
        assert!(!checker.is_paused());
    }

    #[test]
    fn test_charging_bypasses_battery_threshold() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        // Below threshold but charging
        monitor.set_level(15);
        monitor.set_charging(true);

        let (paused, reason) = checker.should_pause_contribution();
        assert!(!paused);
        assert!(reason.is_none());
    }

    #[test]
    fn test_charging_clears_hysteresis() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        // Trigger pause
        monitor.set_level(15);
        let (paused, _) = checker.should_pause_contribution();
        assert!(paused);

        // Start charging - should resume even if still below resume threshold
        monitor.set_level(18);
        monitor.set_charging(true);
        let (paused, _) = checker.should_pause_contribution();
        assert!(!paused);
        assert!(!checker.is_paused());
    }

    #[test]
    fn test_thermal_critical_always_pauses() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let settings = ContributionSettings {
            thermal_pause: false, // Even with thermal_pause disabled
            ..Default::default()
        };
        let checker = make_checker_with_settings(Arc::clone(&monitor), settings);

        monitor.set_level(100);
        monitor.set_thermal(ThermalState::Critical);

        let (paused, reason) = checker.should_pause_contribution();
        assert!(paused);
        assert_eq!(reason, Some(PauseReason::ThermalCritical));
    }

    #[test]
    fn test_thermal_serious_respects_setting() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        monitor.set_level(100);
        monitor.set_thermal(ThermalState::Serious);

        // With thermal_pause enabled
        let settings_on = ContributionSettings {
            thermal_pause: true,
            ..Default::default()
        };
        let checker = make_checker_with_settings(Arc::clone(&monitor), settings_on);
        let (paused, reason) = checker.should_pause_contribution();
        assert!(paused);
        assert_eq!(reason, Some(PauseReason::ThermalSerious));

        // With thermal_pause disabled
        let settings_off = ContributionSettings {
            thermal_pause: false,
            ..Default::default()
        };
        let checker = make_checker_with_settings(Arc::clone(&monitor), settings_off);
        let (paused, reason) = checker.should_pause_contribution();
        assert!(!paused);
        assert!(reason.is_none());
    }

    #[test]
    fn test_thermal_normal_and_fair_no_pause() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        monitor.set_level(100);
        monitor.set_thermal(ThermalState::Normal);
        let (paused, _) = checker.should_pause_contribution();
        assert!(!paused);

        monitor.set_thermal(ThermalState::Fair);
        let (paused, _) = checker.should_pause_contribution();
        assert!(!paused);
    }

    #[test]
    fn test_battery_unavailable() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        monitor.set_level_available(false);

        // With no battery level, shouldn't pause
        let (paused, _) = checker.should_pause_contribution();
        assert!(!paused);
    }

    #[test]
    fn test_desktop_battery_monitor() {
        let monitor = DesktopBatteryMonitor;

        assert!(monitor.get_battery_level().is_none());
        assert!(monitor.is_charging());
        assert_eq!(monitor.get_thermal_state(), ThermalState::Normal);
    }

    #[test]
    fn test_get_state() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        monitor.set_level(42);
        monitor.set_charging(true);
        monitor.set_thermal(ThermalState::Fair);

        let state = checker.get_state();
        assert_eq!(state.level, Some(42));
        assert!(state.charging);
        assert_eq!(state.thermal_state, ThermalState::Fair);
    }

    #[test]
    fn test_reset_paused() {
        let monitor = Arc::new(MockBatteryMonitor::new());
        let checker = make_checker(Arc::clone(&monitor));

        // Trigger pause
        monitor.set_level(10);
        checker.should_pause_contribution();
        assert!(checker.is_paused());

        // Manual reset
        checker.reset_paused();
        assert!(!checker.is_paused());
    }
}
