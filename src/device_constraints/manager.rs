//! Device Constraint Manager
//!
//! Unified manager coordinating battery, bandwidth, and efficiency constraints.
//! Provides single API for checking if contribution is allowed.

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, RwLock};

use super::bandwidth::DailyBandwidthLimiter;
use super::battery::{BatteryChecker, BatteryMonitor, BatteryState};
use super::efficiency::EfficiencyTracker;
use super::error::DeviceConstraintError;
use super::storage::DeviceSettingsStore;
use super::types::{ContributionMode, ContributionSettings, ThermalState};

/// Network state provider trait for WiFi detection
///
/// Platform implementations should provide access to network state
/// for WiFi-only mode enforcement.
///
/// # Note on `is_wifi()`
/// The `is_wifi()` method is provided for platform implementations that need
/// to distinguish WiFi from other non-cellular connections (e.g., Ethernet).
/// Current constraint checking uses `is_cellular()` negation, but `is_wifi()`
/// is retained for future use cases like bandwidth throttling based on
/// connection type.
pub trait NetworkStateProvider: Send + Sync {
    /// Check if currently on WiFi
    ///
    /// Returns true if connected via WiFi. Used by platform implementations
    /// to provide detailed connection type information.
    fn is_wifi(&self) -> bool;

    /// Check if currently on cellular
    fn is_cellular(&self) -> bool;

    /// Check if network is connected
    fn is_connected(&self) -> bool;
}

/// Active constraint status for UI display
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConstraintStatus {
    /// Whether WiFi-only mode is active in settings
    pub wifi_only_active: bool,

    /// Whether currently on cellular network
    pub on_cellular: bool,

    /// Whether paused due to battery
    pub battery_paused: bool,

    /// Current battery level (if available)
    pub battery_level: Option<u8>,

    /// Whether paused due to thermal
    pub thermal_paused: bool,

    /// Current thermal state
    pub thermal_state: ThermalState,

    /// Whether daily cap is reached
    pub daily_cap_reached: bool,

    /// Remaining daily bandwidth budget in bytes
    pub daily_remaining_bytes: u64,

    /// Overall: is contribution currently allowed?
    pub contribution_allowed: bool,

    /// Current contribution mode
    pub mode: ContributionMode,

    /// Current efficiency score
    pub efficiency_score: f32,
}

impl ConstraintStatus {
    /// Get reason why contribution is blocked (if any)
    ///
    /// Returns actionable messages to help users understand what to do.
    #[must_use]
    pub fn block_reason(&self) -> Option<String> {
        if !self.contribution_allowed {
            if self.battery_paused {
                if let Some(level) = self.battery_level {
                    return Some(format!(
                        "Battery low ({}%). Charge to 25% or plug in to resume.",
                        level
                    ));
                }
                return Some("Battery low. Charge to 25% or plug in to resume.".to_string());
            }
            if self.thermal_paused {
                return Some(format!(
                    "{}. Let your device cool down to resume.",
                    self.thermal_state.display_name()
                ));
            }
            if self.wifi_only_active && self.on_cellular {
                return Some("On cellular data. Connect to WiFi to resume.".to_string());
            }
            if self.daily_cap_reached {
                return Some("Daily limit reached. Resets at midnight UTC.".to_string());
            }
            return Some("No network connection. Connect to resume.".to_string());
        }
        None
    }
}

/// Unified device constraint manager
///
/// Coordinates all device constraints:
/// - Battery monitoring with hysteresis
/// - Thermal pause
/// - WiFi-only mode
/// - Daily bandwidth caps
/// - Efficiency tracking
///
/// Provides single `should_contribute()` check and `try_serve()` for serving content.
pub struct DeviceConstraintManager {
    /// Current settings (thread-safe)
    settings: Arc<RwLock<ContributionSettings>>,

    /// Current mode (thread-safe)
    mode: Arc<RwLock<ContributionMode>>,

    /// Battery checker
    battery_checker: BatteryChecker,

    /// Bandwidth limiter
    bandwidth_limiter: DailyBandwidthLimiter,

    /// Efficiency tracker
    efficiency_tracker: RwLock<EfficiencyTracker>,

    /// Network state provider
    network_provider: Arc<dyn NetworkStateProvider>,

    /// Persistent storage
    store: DeviceSettingsStore,
}

impl DeviceConstraintManager {
    /// Create a new device constraint manager
    ///
    /// # Arguments
    /// - `data_path`: Path for persistent storage
    /// - `battery_monitor`: Platform battery monitor
    /// - `network_provider`: Platform network state provider
    pub fn new(
        data_path: impl AsRef<Path>,
        battery_monitor: Arc<dyn BatteryMonitor>,
        network_provider: Arc<dyn NetworkStateProvider>,
    ) -> Result<Self, DeviceConstraintError> {
        let store = DeviceSettingsStore::open(data_path)?;

        // Load persisted values or use defaults
        let settings = store.get_settings_or_default()?;
        let mode = store.get_mode_or_default()?;

        let settings = Arc::new(RwLock::new(settings.clone()));
        let mode = Arc::new(RwLock::new(mode));

        let battery_checker = BatteryChecker::new(battery_monitor, Arc::clone(&settings));

        // Create bandwidth limiter with current settings
        let bandwidth_limiter = {
            let s = settings.read().unwrap_or_else(|e| e.into_inner());
            DailyBandwidthLimiter::with_default_rate(s.daily_bandwidth_cap)
        };

        Ok(Self {
            settings,
            mode,
            battery_checker,
            bandwidth_limiter,
            efficiency_tracker: RwLock::new(EfficiencyTracker::new(0)),
            network_provider,
            store,
        })
    }

    /// Check if contribution is currently allowed
    ///
    /// Checks all constraints and returns true only if all are satisfied.
    #[inline]
    #[must_use]
    pub fn should_contribute(&self) -> bool {
        self.check_constraints().contribution_allowed
    }

    /// Get detailed constraint status
    ///
    /// Provides full status for UI display including why contribution
    /// might be blocked.
    #[inline]
    #[must_use]
    pub fn check_constraints(&self) -> ConstraintStatus {
        let settings = self.settings.read().unwrap_or_else(|e| e.into_inner());
        let mode = *self.mode.read().unwrap_or_else(|e| e.into_inner());

        // Battery and thermal check
        let (battery_paused, _pause_reason) = self.battery_checker.should_pause_contribution();
        let battery_state = self.battery_checker.get_state();
        let thermal_paused = battery_state
            .thermal_state
            .should_pause(settings.thermal_pause);

        // Network check
        let on_cellular = self.network_provider.is_cellular();
        let connected = self.network_provider.is_connected();
        let wifi_blocked = settings.wifi_only && on_cellular;

        // Bandwidth check
        let daily_remaining = self.bandwidth_limiter.remaining_daily_budget();
        let daily_cap_reached = daily_remaining == 0;

        // Overall contribution allowed
        let contribution_allowed =
            !battery_paused && !wifi_blocked && !daily_cap_reached && connected;

        // Efficiency score
        let efficiency_score = self
            .efficiency_tracker
            .read()
            .map(|t| t.efficiency_score())
            .unwrap_or(0.0);

        ConstraintStatus {
            wifi_only_active: settings.wifi_only,
            on_cellular,
            battery_paused,
            battery_level: battery_state.level,
            thermal_paused,
            thermal_state: battery_state.thermal_state,
            daily_cap_reached,
            daily_remaining_bytes: daily_remaining,
            contribution_allowed,
            mode,
            efficiency_score,
        }
    }

    /// Get current contribution mode
    #[must_use]
    pub fn get_mode(&self) -> ContributionMode {
        *self.mode.read().unwrap_or_else(|e| e.into_inner())
    }

    /// Set contribution mode (persisted)
    pub fn set_mode(&self, mode: ContributionMode) -> Result<(), DeviceConstraintError> {
        self.store.set_mode(mode)?;
        *self.mode.write().unwrap_or_else(|e| e.into_inner()) = mode;
        Ok(())
    }

    /// Get current settings
    #[must_use]
    pub fn get_settings(&self) -> ContributionSettings {
        self.settings
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Update settings (persisted)
    pub fn update_settings(
        &self,
        settings: ContributionSettings,
    ) -> Result<(), DeviceConstraintError> {
        // Validate
        settings
            .validate()
            .map_err(DeviceConstraintError::InvalidSettings)?;

        // Persist
        self.store.set_settings(&settings)?;

        // Update bandwidth limiter cap
        self.bandwidth_limiter
            .set_daily_cap(settings.daily_bandwidth_cap);

        // Update in-memory settings
        *self.settings.write().unwrap_or_else(|e| e.into_inner()) = settings;

        Ok(())
    }

    /// Try to serve content (checks all constraints, updates trackers)
    ///
    /// Returns actual bytes acquired (0 if constraints block).
    #[inline]
    pub fn try_serve(&self, bytes: u64) -> u64 {
        if !self.should_contribute() {
            return 0;
        }

        let acquired = self.bandwidth_limiter.try_acquire(bytes);
        if acquired > 0 {
            if let Ok(mut tracker) = self.efficiency_tracker.write() {
                tracker.record_bandwidth(acquired);
                tracker.record_data(acquired); // Data used = served
            }
        }
        acquired
    }

    /// Record bandwidth served (for external tracking)
    pub fn record_bandwidth_served(&self, bytes: u64) {
        self.bandwidth_limiter.record_usage(bytes);
        if let Ok(mut tracker) = self.efficiency_tracker.write() {
            tracker.record_bandwidth(bytes);
            tracker.record_data(bytes);
        }
    }

    /// Record battery consumption
    pub fn record_battery_consumed(&self, mah: u64) {
        if let Ok(mut tracker) = self.efficiency_tracker.write() {
            tracker.record_battery(mah);
        }
    }

    /// Get current efficiency score
    #[must_use]
    pub fn efficiency_score(&self) -> f32 {
        self.efficiency_tracker
            .read()
            .map(|t| t.efficiency_score())
            .unwrap_or(0.0)
    }

    /// Check if eligible for Efficient Swimmer achievement
    #[must_use]
    pub fn qualifies_for_efficient_swimmer(&self) -> bool {
        self.efficiency_tracker
            .read()
            .map(|t| t.qualifies_for_efficient_swimmer())
            .unwrap_or(false)
    }

    /// Get battery state
    #[must_use]
    pub fn battery_state(&self) -> BatteryState {
        self.battery_checker.get_state()
    }

    /// Get remaining daily bandwidth
    #[must_use]
    pub fn remaining_daily_bandwidth(&self) -> u64 {
        self.bandwidth_limiter.remaining_daily_budget()
    }

    /// Get bytes used today
    #[must_use]
    pub fn bytes_used_today(&self) -> u64 {
        self.bandwidth_limiter.bytes_used_today()
    }

    /// Get the underlying efficiency tracker (for advanced usage)
    pub fn efficiency_tracker(&self) -> &RwLock<EfficiencyTracker> {
        &self.efficiency_tracker
    }

    /// Reset efficiency tracker for new period
    pub fn reset_efficiency_for_period(&self, period: u32) {
        if let Ok(mut tracker) = self.efficiency_tracker.write() {
            tracker.reset_for_period(period);
        }
    }
}

/// Mock network provider for testing
#[cfg(any(test, feature = "test-utils"))]
pub struct MockNetworkProvider {
    wifi: std::sync::atomic::AtomicBool,
    cellular: std::sync::atomic::AtomicBool,
    connected: std::sync::atomic::AtomicBool,
}

#[cfg(any(test, feature = "test-utils"))]
impl MockNetworkProvider {
    pub fn new() -> Self {
        Self {
            wifi: std::sync::atomic::AtomicBool::new(true),
            cellular: std::sync::atomic::AtomicBool::new(false),
            connected: std::sync::atomic::AtomicBool::new(true),
        }
    }

    pub fn set_wifi(&self, wifi: bool) {
        self.wifi.store(wifi, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn set_cellular(&self, cellular: bool) {
        self.cellular
            .store(cellular, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn set_connected(&self, connected: bool) {
        self.connected
            .store(connected, std::sync::atomic::Ordering::Relaxed);
    }
}

#[cfg(any(test, feature = "test-utils"))]
impl Default for MockNetworkProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(any(test, feature = "test-utils"))]
impl NetworkStateProvider for MockNetworkProvider {
    fn is_wifi(&self) -> bool {
        self.wifi.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn is_cellular(&self) -> bool {
        self.cellular.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn is_connected(&self) -> bool {
        self.connected.load(std::sync::atomic::Ordering::Relaxed)
    }
}

/// Desktop network provider (always connected via WiFi/ethernet)
pub struct DesktopNetworkProvider;

impl NetworkStateProvider for DesktopNetworkProvider {
    fn is_wifi(&self) -> bool {
        true // Assume WiFi/ethernet
    }

    fn is_cellular(&self) -> bool {
        false // Desktop is not on cellular
    }

    fn is_connected(&self) -> bool {
        true // Assume connected
    }
}

#[cfg(test)]
mod tests {
    use super::super::battery::MockBatteryMonitor;
    use super::*;
    use tempfile::TempDir;

    fn create_test_manager() -> (DeviceConstraintManager, TempDir) {
        let tmp = TempDir::new().unwrap();
        let battery: Arc<dyn BatteryMonitor> = Arc::new(MockBatteryMonitor::new());
        let network: Arc<dyn NetworkStateProvider> = Arc::new(MockNetworkProvider::new());

        let manager = DeviceConstraintManager::new(tmp.path(), battery, network).unwrap();

        (manager, tmp)
    }

    fn create_test_manager_with_mocks() -> (
        DeviceConstraintManager,
        Arc<MockBatteryMonitor>,
        Arc<MockNetworkProvider>,
        TempDir,
    ) {
        let tmp = TempDir::new().unwrap();
        let battery = Arc::new(MockBatteryMonitor::new());
        let network = Arc::new(MockNetworkProvider::new());

        let manager = DeviceConstraintManager::new(
            tmp.path(),
            battery.clone() as Arc<dyn BatteryMonitor>,
            network.clone() as Arc<dyn NetworkStateProvider>,
        )
        .unwrap();

        (manager, battery, network, tmp)
    }

    #[test]
    fn test_new_manager() {
        let (manager, _tmp) = create_test_manager();

        // Default mode is Swimmer
        assert_eq!(manager.get_mode(), ContributionMode::Swimmer);

        // Default settings
        let settings = manager.get_settings();
        assert!(settings.wifi_only);
        assert_eq!(settings.daily_bandwidth_cap, 500_000_000);
    }

    #[test]
    fn test_should_contribute_default() {
        let (manager, _tmp) = create_test_manager();

        // With defaults (on WiFi, good battery), should allow
        assert!(manager.should_contribute());
    }

    #[test]
    fn test_wifi_only_blocks_cellular() {
        let (manager, _battery, network, _tmp) = create_test_manager_with_mocks();

        // On WiFi - should allow
        network.set_wifi(true);
        network.set_cellular(false);
        assert!(manager.should_contribute());

        // On cellular with wifi_only=true - should block
        network.set_wifi(false);
        network.set_cellular(true);
        assert!(!manager.should_contribute());

        let status = manager.check_constraints();
        assert!(status.wifi_only_active);
        assert!(status.on_cellular);
        assert!(!status.contribution_allowed);
    }

    #[test]
    fn test_wifi_only_allows_wifi() {
        let (manager, _battery, network, _tmp) = create_test_manager_with_mocks();

        network.set_wifi(true);
        network.set_cellular(false);

        let status = manager.check_constraints();
        assert!(status.wifi_only_active);
        assert!(!status.on_cellular);
        assert!(status.contribution_allowed);
    }

    #[test]
    fn test_battery_pause_respected() {
        let (manager, battery, _network, _tmp) = create_test_manager_with_mocks();

        // Good battery
        battery.set_level(50);
        assert!(manager.should_contribute());

        // Low battery (below default threshold of 20%)
        battery.set_level(15);
        assert!(!manager.should_contribute());

        let status = manager.check_constraints();
        assert!(status.battery_paused);
    }

    #[test]
    fn test_charging_bypasses_battery() {
        let (manager, battery, _network, _tmp) = create_test_manager_with_mocks();

        battery.set_level(15); // Below threshold
        battery.set_charging(true);

        assert!(manager.should_contribute());
    }

    #[test]
    fn test_daily_cap_enforced() {
        let (manager, _battery, _network, _tmp) = create_test_manager_with_mocks();

        // Set a small cap for testing
        let settings = ContributionSettings {
            daily_bandwidth_cap: 1000,
            ..Default::default()
        };
        manager.update_settings(settings).unwrap();

        // Use up the budget
        let served = manager.try_serve(900);
        assert!(served > 0);

        // Try to get more than remaining
        let status = manager.check_constraints();
        let remaining = status.daily_remaining_bytes;
        assert!(remaining < 200); // Should have used some

        // Eventually exhaust budget (loop to handle rate limiting)
        for _ in 0..100 {
            manager.try_serve(100);
        }

        // Now cap should be reached
        assert_eq!(manager.remaining_daily_bandwidth(), 0);

        let status = manager.check_constraints();
        assert!(status.daily_cap_reached);
    }

    #[test]
    fn test_mode_persistence() {
        let tmp = TempDir::new().unwrap();

        // Set mode and close
        {
            let battery = Arc::new(MockBatteryMonitor::new());
            let network = Arc::new(MockNetworkProvider::new());
            let manager = DeviceConstraintManager::new(tmp.path(), battery, network).unwrap();
            manager.set_mode(ContributionMode::AnchorMode).unwrap();
        }

        // Reopen and verify
        {
            let battery = Arc::new(MockBatteryMonitor::new());
            let network = Arc::new(MockNetworkProvider::new());
            let manager = DeviceConstraintManager::new(tmp.path(), battery, network).unwrap();
            assert_eq!(manager.get_mode(), ContributionMode::AnchorMode);
        }
    }

    #[test]
    fn test_settings_persistence() {
        let tmp = TempDir::new().unwrap();

        let custom_settings = ContributionSettings {
            wifi_only: false,
            daily_bandwidth_cap: 1_000_000_000,
            battery_threshold: 10,
            thermal_pause: false,
        };

        // Set settings and close
        {
            let battery = Arc::new(MockBatteryMonitor::new());
            let network = Arc::new(MockNetworkProvider::new());
            let manager = DeviceConstraintManager::new(tmp.path(), battery, network).unwrap();
            manager.update_settings(custom_settings.clone()).unwrap();
        }

        // Reopen and verify
        {
            let battery = Arc::new(MockBatteryMonitor::new());
            let network = Arc::new(MockNetworkProvider::new());
            let manager = DeviceConstraintManager::new(tmp.path(), battery, network).unwrap();
            assert_eq!(manager.get_settings(), custom_settings);
        }
    }

    #[test]
    fn test_efficiency_tracking() {
        let (manager, _tmp) = create_test_manager();

        // Record some activity
        manager.record_bandwidth_served(1000);
        manager.record_battery_consumed(200);

        // Efficiency should be calculated
        // bandwidth=1000, battery=200, data=1000 (recorded with bandwidth)
        // efficiency = 1000 / (200 + 1000) = 1000 / 1200 ≈ 0.83
        let score = manager.efficiency_score();
        assert!(score > 0.0);
    }

    #[test]
    fn test_thermal_pause() {
        let (manager, battery, _network, _tmp) = create_test_manager_with_mocks();

        battery.set_level(100);
        battery.set_thermal(ThermalState::Critical);

        assert!(!manager.should_contribute());

        let status = manager.check_constraints();
        assert!(status.thermal_paused);
        assert_eq!(status.thermal_state, ThermalState::Critical);
    }

    #[test]
    fn test_disconnected_blocks() {
        let (manager, _battery, network, _tmp) = create_test_manager_with_mocks();

        network.set_connected(false);

        assert!(!manager.should_contribute());
    }

    #[test]
    fn test_constraint_status_block_reason() {
        let (manager, battery, network, _tmp) = create_test_manager_with_mocks();

        // Battery low
        battery.set_level(10);
        battery.set_charging(false);
        let status = manager.check_constraints();
        assert!(status.block_reason().unwrap().contains("Battery"));

        // Reset battery, set cellular with wifi_only
        battery.set_level(100);
        network.set_wifi(false);
        network.set_cellular(true);
        let status = manager.check_constraints();
        assert!(status.block_reason().unwrap().contains("WiFi"));
    }

    #[test]
    fn test_desktop_network_provider() {
        let provider = DesktopNetworkProvider;
        assert!(provider.is_wifi());
        assert!(!provider.is_cellular());
        assert!(provider.is_connected());
    }

    #[test]
    fn test_try_serve_respects_constraints() {
        let (manager, battery, _network, _tmp) = create_test_manager_with_mocks();

        // With good conditions, should serve
        battery.set_level(100);
        let served = manager.try_serve(100);
        assert!(served > 0);

        // With bad conditions, should not serve
        battery.set_level(5);
        battery.set_charging(false);
        let served = manager.try_serve(100);
        assert_eq!(served, 0);
    }

    #[test]
    fn test_reset_efficiency() {
        let (manager, _tmp) = create_test_manager();

        manager.record_bandwidth_served(1000);
        assert!(manager.efficiency_score() > 0.0);

        manager.reset_efficiency_for_period(1);
        assert_eq!(manager.efficiency_score(), 0.0);
    }
}
