//! Sync state tracking (SPEC_06 - Chain Sync)
//!
//! Tracks the current state of the chain synchronization process.

/// Current state of the chain synchronization process
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncState {
    /// Not currently syncing
    Idle,

    /// Downloading and verifying headers
    SyncingHeaders {
        /// Current height being synced
        current: u64,
        /// Target height to sync to
        target: u64,
    },

    /// Downloading block content
    SyncingBlocks {
        /// Current height being synced
        current: u64,
        /// Target height to sync to
        target: u64,
    },

    /// Running continuous sync loop (monitoring for new blocks)
    Continuous,

    /// Sync encountered an error
    Error,
}

impl SyncState {
    /// Check if currently syncing (headers or blocks)
    #[must_use]
    pub fn is_syncing(&self) -> bool {
        matches!(
            self,
            SyncState::SyncingHeaders { .. } | SyncState::SyncingBlocks { .. }
        )
    }

    /// Check if in continuous sync mode
    #[must_use]
    pub fn is_continuous(&self) -> bool {
        matches!(self, SyncState::Continuous)
    }

    /// Check if idle
    #[must_use]
    pub fn is_idle(&self) -> bool {
        matches!(self, SyncState::Idle)
    }

    /// Check if in error state
    #[must_use]
    pub fn is_error(&self) -> bool {
        matches!(self, SyncState::Error)
    }

    /// Get progress percentage if syncing
    #[must_use]
    pub fn progress(&self) -> Option<f64> {
        match self {
            SyncState::SyncingHeaders { current, target }
            | SyncState::SyncingBlocks { current, target } => {
                if *target == 0 {
                    Some(0.0)
                } else {
                    Some((*current as f64 / *target as f64) * 100.0)
                }
            }
            _ => None,
        }
    }
}

impl Default for SyncState {
    fn default() -> Self {
        SyncState::Idle
    }
}

impl std::fmt::Display for SyncState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncState::Idle => write!(f, "Idle"),
            SyncState::SyncingHeaders { current, target } => {
                write!(f, "Syncing headers: {}/{}", current, target)
            }
            SyncState::SyncingBlocks { current, target } => {
                write!(f, "Syncing blocks: {}/{}", current, target)
            }
            SyncState::Continuous => write!(f, "Continuous sync"),
            SyncState::Error => write!(f, "Error"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_state() {
        let state = SyncState::default();
        assert!(state.is_idle());
    }

    #[test]
    fn test_is_syncing() {
        let idle = SyncState::Idle;
        assert!(!idle.is_syncing());

        let syncing_headers = SyncState::SyncingHeaders {
            current: 50,
            target: 100,
        };
        assert!(syncing_headers.is_syncing());

        let syncing_blocks = SyncState::SyncingBlocks {
            current: 75,
            target: 100,
        };
        assert!(syncing_blocks.is_syncing());

        let continuous = SyncState::Continuous;
        assert!(!continuous.is_syncing());
    }

    #[test]
    fn test_progress() {
        let syncing = SyncState::SyncingHeaders {
            current: 50,
            target: 100,
        };
        assert_eq!(syncing.progress(), Some(50.0));

        let idle = SyncState::Idle;
        assert_eq!(idle.progress(), None);

        let zero_target = SyncState::SyncingHeaders {
            current: 0,
            target: 0,
        };
        assert_eq!(zero_target.progress(), Some(0.0));
    }

    #[test]
    fn test_display() {
        let syncing = SyncState::SyncingHeaders {
            current: 50,
            target: 100,
        };
        assert!(syncing.to_string().contains("50/100"));
    }
}
