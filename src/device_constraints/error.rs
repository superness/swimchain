//! Device constraint error types
//!
//! Defines errors that can occur during device constraint operations.

use std::fmt;

/// Errors that can occur in device constraint operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceConstraintError {
    /// Storage operation failed
    Storage(String),

    /// Battery monitor is unavailable
    BatteryUnavailable,

    /// Network state provider is unavailable
    NetworkUnavailable,

    /// Settings validation failed
    InvalidSettings(String),

    /// Mode change is not allowed
    ///
    /// Reserved for future mode transition validation (e.g., preventing
    /// AnchorMode on devices with insufficient resources, or requiring
    /// user confirmation for high-commitment modes). Currently unused
    /// but retained for API stability.
    ModeChangeBlocked {
        /// Reason the mode change was blocked
        reason: String,
    },

    /// Serialization/deserialization failed
    Serialization(String),

    /// Migration from older storage format failed
    MigrationFailed {
        /// Source version that failed to migrate
        from_version: u8,
        /// Target version
        to_version: u8,
        /// Reason for failure
        reason: String,
    },
}

impl fmt::Display for DeviceConstraintError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Storage(msg) => write!(f, "storage error: {}", msg),
            Self::BatteryUnavailable => write!(f, "battery monitor unavailable"),
            Self::NetworkUnavailable => write!(f, "network state unavailable"),
            Self::InvalidSettings(msg) => write!(f, "invalid settings: {}", msg),
            Self::ModeChangeBlocked { reason } => {
                write!(f, "mode change not allowed: {}", reason)
            }
            Self::Serialization(msg) => write!(f, "serialization error: {}", msg),
            Self::MigrationFailed {
                from_version,
                to_version,
                reason,
            } => {
                write!(
                    f,
                    "migration failed from v{} to v{}: {}",
                    from_version, to_version, reason
                )
            }
        }
    }
}

impl std::error::Error for DeviceConstraintError {}

impl From<sled::Error> for DeviceConstraintError {
    fn from(err: sled::Error) -> Self {
        Self::Storage(err.to_string())
    }
}

impl From<bincode::Error> for DeviceConstraintError {
    fn from(err: bincode::Error) -> Self {
        Self::Serialization(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = DeviceConstraintError::Storage("db failed".to_string());
        assert_eq!(format!("{}", err), "storage error: db failed");

        let err = DeviceConstraintError::BatteryUnavailable;
        assert_eq!(format!("{}", err), "battery monitor unavailable");

        let err = DeviceConstraintError::NetworkUnavailable;
        assert_eq!(format!("{}", err), "network state unavailable");

        let err = DeviceConstraintError::InvalidSettings("bad value".to_string());
        assert_eq!(format!("{}", err), "invalid settings: bad value");

        let err = DeviceConstraintError::ModeChangeBlocked {
            reason: "already at max".to_string(),
        };
        assert_eq!(format!("{}", err), "mode change not allowed: already at max");

        let err = DeviceConstraintError::Serialization("decode failed".to_string());
        assert_eq!(format!("{}", err), "serialization error: decode failed");
    }

    #[test]
    fn test_error_clone_eq() {
        let err1 = DeviceConstraintError::BatteryUnavailable;
        let err2 = err1.clone();
        assert_eq!(err1, err2);
    }

    #[test]
    fn test_error_debug() {
        let err = DeviceConstraintError::Storage("test".to_string());
        let debug_str = format!("{:?}", err);
        assert!(debug_str.contains("Storage"));
        assert!(debug_str.contains("test"));
    }
}
