//! Device Constraints Module - Milestone 7.8
//!
//! Implements device-aware contribution per SPEC_09 Section 9.
//! Provides battery monitoring, bandwidth limiting, and efficiency tracking
//! to ensure good app citizenship on mobile devices.
//!
//! # Architecture
//!
//! - `types`: Core types (ContributionSettings, ContributionMode, ThermalState)
//! - `error`: Error types for constraint operations
//! - `battery`: Battery monitoring and thermal awareness
//! - `bandwidth`: Daily bandwidth caps with midnight UTC reset
//! - `efficiency`: Resource efficiency tracking per SPEC_09 §9.3
//! - `storage`: Sled-based persistence for settings and mode
//! - `manager`: Unified DeviceConstraintManager coordinating all constraints
//!
//! # Example
//!
//! ```rust,ignore
//! use swimchain::device_constraints::{
//!     DeviceConstraintManager, ContributionSettings, ContributionMode
//! };
//!
//! let manager = DeviceConstraintManager::new(
//!     identity_bytes,
//!     data_path,
//!     battery_monitor,
//!     network_provider,
//! )?;
//!
//! // Check if contribution is allowed
//! if manager.should_contribute() {
//!     let bytes_served = manager.try_serve(1024)?;
//! }
//!
//! // Get detailed status for UI
//! let status = manager.check_constraints();
//! ```

pub mod error;
pub mod types;
pub mod battery;
pub mod bandwidth;
pub mod efficiency;
pub mod storage;
pub mod manager;

pub use error::DeviceConstraintError;
pub use types::{ContributionSettings, ContributionMode, ThermalState};
pub use battery::{BatteryMonitor, BatteryState, BatteryChecker, PauseReason};
pub use bandwidth::DailyBandwidthLimiter;
pub use efficiency::{EfficiencyTracker, EFFICIENT_SWIMMER_THRESHOLD};
pub use storage::DeviceSettingsStore;
pub use manager::{DeviceConstraintManager, NetworkStateProvider, ConstraintStatus};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exports() {
        // Verify all public types are accessible
        let _settings = ContributionSettings::default();
        let _mode = ContributionMode::default();
        let _thermal = ThermalState::Normal;
    }

    #[test]
    fn test_types_serde() {
        // Verify types are serializable
        let settings = ContributionSettings::default();
        let serialized = bincode::serialize(&settings).unwrap();
        let _deserialized: ContributionSettings = bincode::deserialize(&serialized).unwrap();

        let mode = ContributionMode::ActiveSwimmer;
        let serialized = bincode::serialize(&mode).unwrap();
        let _deserialized: ContributionMode = bincode::deserialize(&serialized).unwrap();
    }
}
