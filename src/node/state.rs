//! Node state types
//!
//! Defines NodeState enum for lifecycle management and NodeStatus struct
//! for runtime status reporting.
//!
//! See SPEC_10 §8.2-8.3 for status and state definitions.

use serde::{Deserialize, Serialize};

/// Node lifecycle state
///
/// Represents the current state of the node in its lifecycle.
/// Transitions follow the state machine defined in SPEC_10 §8.3.
///
/// # State Transitions
///
/// ```text
/// Stopped -> Starting -> Bootstrapping -> Syncing -> Running -> ShuttingDown -> Stopped
///                |             |
///                └─────────────┴── (error recovery) --> Stopped
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Hash, Serialize, Deserialize)]
pub enum NodeState {
    /// Node is stopped and not running
    #[default]
    Stopped,

    /// Node is initializing subsystems
    Starting,

    /// Node is connecting to peers
    Bootstrapping,

    /// Node is synchronizing chain data
    Syncing,

    /// Node is fully operational
    Running,

    /// Node is shutting down gracefully
    ShuttingDown,
}

impl NodeState {
    /// Check if a transition from current state to next state is valid.
    ///
    /// Valid transitions per SPEC_10:
    /// - Stopped -> Starting
    /// - Starting -> Bootstrapping
    /// - Bootstrapping -> Syncing
    /// - Syncing -> Running
    /// - Running -> ShuttingDown
    /// - ShuttingDown -> Stopped
    ///
    /// Error recovery paths:
    /// - Starting -> Stopped (startup failed)
    /// - Bootstrapping -> Stopped (no peers found)
    /// - Syncing -> Running (skip sync if no peers)
    pub fn can_transition_to(&self, next: NodeState) -> bool {
        matches!(
            (self, next),
            // Normal flow
            (NodeState::Stopped, NodeState::Starting)
                | (NodeState::Starting, NodeState::Bootstrapping)
                | (NodeState::Bootstrapping, NodeState::Syncing)
                | (NodeState::Syncing, NodeState::Running) // Also handles skip sync case
                | (NodeState::Running, NodeState::ShuttingDown)
                | (NodeState::ShuttingDown, NodeState::Stopped)
                // Error recovery paths
                | (NodeState::Starting, NodeState::Stopped) // startup failed
                | (NodeState::Bootstrapping, NodeState::Stopped) // no peers
        )
    }

    /// Returns true if the node is in a running state (not stopped or shutting down)
    pub fn is_active(&self) -> bool {
        matches!(
            self,
            NodeState::Starting
                | NodeState::Bootstrapping
                | NodeState::Syncing
                | NodeState::Running
        )
    }

    /// Returns true if the node is fully operational
    pub fn is_running(&self) -> bool {
        matches!(self, NodeState::Running)
    }

    /// Returns the human-readable name of this state
    pub fn name(&self) -> &'static str {
        match self {
            NodeState::Stopped => "Stopped",
            NodeState::Starting => "Starting",
            NodeState::Bootstrapping => "Bootstrapping",
            NodeState::Syncing => "Syncing",
            NodeState::Running => "Running",
            NodeState::ShuttingDown => "Shutting Down",
        }
    }
}

/// Node runtime status
///
/// Provides a snapshot of the node's current operational status.
/// Returned by `NodeManager::status()`.
///
/// See SPEC_10 §8.2 for field definitions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStatus {
    /// Current lifecycle state
    pub state: NodeState,

    /// Seconds since node started (0 if not running)
    pub uptime_seconds: u64,

    /// Number of connected peers
    pub peers: usize,

    /// Current chain height (block count)
    pub chain_height: u64,

    /// Sync progress percentage (0.0 - 100.0)
    pub sync_percent: f32,

    /// Storage used in megabytes
    pub storage_used_mb: u64,

    /// Storage usage percentage (0.0 - 100.0)
    pub storage_percent: f32,
}

impl Default for NodeStatus {
    fn default() -> Self {
        Self {
            state: NodeState::Stopped,
            uptime_seconds: 0,
            peers: 0,
            chain_height: 0,
            sync_percent: 0.0,
            storage_used_mb: 0,
            storage_percent: 0.0,
        }
    }
}

impl NodeStatus {
    /// Create a status for a stopped node
    pub fn stopped() -> Self {
        Self::default()
    }

    /// Create a status for a starting node
    pub fn starting() -> Self {
        Self {
            state: NodeState::Starting,
            ..Self::default()
        }
    }

    /// Returns true if the node is healthy (running and synced)
    pub fn is_healthy(&self) -> bool {
        self.state == NodeState::Running && self.sync_percent >= 99.0 && self.peers > 0
    }

    /// Returns a short description of the node status
    pub fn summary(&self) -> String {
        match self.state {
            NodeState::Stopped => "Node is stopped".to_string(),
            NodeState::Starting => "Node is starting...".to_string(),
            NodeState::Bootstrapping => format!("Connecting to peers ({} connected)", self.peers),
            NodeState::Syncing => format!("Syncing ({:.1}%)", self.sync_percent),
            NodeState::Running => format!(
                "Running: {} peers, height {}, {:.1}% storage",
                self.peers, self.chain_height, self.storage_percent
            ),
            NodeState::ShuttingDown => "Shutting down...".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_transitions() {
        // Normal flow
        assert!(NodeState::Stopped.can_transition_to(NodeState::Starting));
        assert!(NodeState::Starting.can_transition_to(NodeState::Bootstrapping));
        assert!(NodeState::Bootstrapping.can_transition_to(NodeState::Syncing));
        assert!(NodeState::Syncing.can_transition_to(NodeState::Running));
        assert!(NodeState::Running.can_transition_to(NodeState::ShuttingDown));
        assert!(NodeState::ShuttingDown.can_transition_to(NodeState::Stopped));
    }

    #[test]
    fn test_error_recovery_transitions() {
        // Error recovery paths
        assert!(NodeState::Starting.can_transition_to(NodeState::Stopped));
        assert!(NodeState::Bootstrapping.can_transition_to(NodeState::Stopped));
        assert!(NodeState::Syncing.can_transition_to(NodeState::Running));
    }

    #[test]
    fn test_invalid_transitions() {
        // Invalid transitions
        assert!(!NodeState::Stopped.can_transition_to(NodeState::Running));
        assert!(!NodeState::Running.can_transition_to(NodeState::Starting));
        assert!(!NodeState::Starting.can_transition_to(NodeState::Running));
        assert!(!NodeState::Stopped.can_transition_to(NodeState::ShuttingDown));
    }

    #[test]
    fn test_default_state_is_stopped() {
        assert_eq!(NodeState::default(), NodeState::Stopped);
    }

    #[test]
    fn test_is_active() {
        assert!(!NodeState::Stopped.is_active());
        assert!(NodeState::Starting.is_active());
        assert!(NodeState::Bootstrapping.is_active());
        assert!(NodeState::Syncing.is_active());
        assert!(NodeState::Running.is_active());
        assert!(!NodeState::ShuttingDown.is_active());
    }

    #[test]
    fn test_is_running() {
        assert!(!NodeState::Stopped.is_running());
        assert!(!NodeState::Starting.is_running());
        assert!(NodeState::Running.is_running());
    }

    #[test]
    fn test_state_names() {
        assert_eq!(NodeState::Stopped.name(), "Stopped");
        assert_eq!(NodeState::Starting.name(), "Starting");
        assert_eq!(NodeState::Bootstrapping.name(), "Bootstrapping");
        assert_eq!(NodeState::Syncing.name(), "Syncing");
        assert_eq!(NodeState::Running.name(), "Running");
        assert_eq!(NodeState::ShuttingDown.name(), "Shutting Down");
    }

    #[test]
    fn test_default_status() {
        let status = NodeStatus::default();
        assert_eq!(status.state, NodeState::Stopped);
        assert_eq!(status.uptime_seconds, 0);
        assert_eq!(status.peers, 0);
        assert_eq!(status.chain_height, 0);
        assert_eq!(status.sync_percent, 0.0);
        assert_eq!(status.storage_used_mb, 0);
        assert_eq!(status.storage_percent, 0.0);
    }

    #[test]
    fn test_status_is_healthy() {
        let mut status = NodeStatus::default();
        assert!(!status.is_healthy()); // Stopped

        status.state = NodeState::Running;
        status.sync_percent = 100.0;
        status.peers = 1;
        assert!(status.is_healthy());

        // Not synced
        status.sync_percent = 50.0;
        assert!(!status.is_healthy());

        // No peers
        status.sync_percent = 100.0;
        status.peers = 0;
        assert!(!status.is_healthy());
    }

    #[test]
    fn test_status_summary() {
        let mut status = NodeStatus::default();
        assert!(status.summary().contains("stopped"));

        status.state = NodeState::Starting;
        assert!(status.summary().contains("starting"));

        status.state = NodeState::Syncing;
        status.sync_percent = 75.5;
        assert!(status.summary().contains("75.5%"));

        status.state = NodeState::Running;
        status.peers = 10;
        status.chain_height = 1000;
        status.storage_percent = 45.2;
        let summary = status.summary();
        assert!(summary.contains("10 peers"));
        assert!(summary.contains("1000"));
    }

    #[test]
    fn test_status_serde() {
        let status = NodeStatus {
            state: NodeState::Running,
            uptime_seconds: 3600,
            peers: 25,
            chain_height: 50000,
            sync_percent: 100.0,
            storage_used_mb: 250,
            storage_percent: 50.0,
        };

        let json = serde_json::to_string(&status).unwrap();
        let parsed: NodeStatus = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.state, NodeState::Running);
        assert_eq!(parsed.uptime_seconds, 3600);
        assert_eq!(parsed.peers, 25);
        assert_eq!(parsed.chain_height, 50000);
    }
}
