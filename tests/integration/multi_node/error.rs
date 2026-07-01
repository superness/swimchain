//! Test-specific error types for multi-node testing

use std::fmt;
use std::net::SocketAddr;

/// Errors that can occur during multi-node testing
#[derive(Debug)]
pub enum TestError {
    /// Failed to start a node
    NodeStart {
        node_index: usize,
        message: String,
    },
    /// Connection timed out between nodes
    ConnectionTimeout {
        from: usize,
        to: usize,
        timeout_secs: u64,
    },
    /// All connections did not establish in time
    AllConnectionsTimeout {
        timeout_secs: u64,
    },
    /// Failed to connect to a specific address
    ConnectFailed {
        node_index: usize,
        addr: SocketAddr,
        message: String,
    },
    /// Failed to shut down a node
    Shutdown {
        node_index: usize,
        message: String,
    },
    /// Handshake failed between nodes
    HandshakeFailed {
        from: usize,
        to: usize,
        message: String,
    },
    /// Assertion failed in test
    AssertionFailed {
        message: String,
    },
    /// Sync failed
    SyncFailed {
        node_index: usize,
        message: String,
    },
    /// Content propagation failed
    PropagationFailed {
        message: String,
    },
    /// Timeout waiting for condition
    ConditionTimeout {
        condition: String,
        timeout_secs: u64,
    },
}

impl fmt::Display for TestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TestError::NodeStart { node_index, message } => {
                write!(f, "Failed to start node {}: {}", node_index, message)
            }
            TestError::ConnectionTimeout { from, to, timeout_secs } => {
                write!(
                    f,
                    "Connection timeout: node {} -> node {} after {}s",
                    from, to, timeout_secs
                )
            }
            TestError::AllConnectionsTimeout { timeout_secs } => {
                write!(f, "All connections timeout after {}s", timeout_secs)
            }
            TestError::ConnectFailed { node_index, addr, message } => {
                write!(
                    f,
                    "Node {} failed to connect to {}: {}",
                    node_index, addr, message
                )
            }
            TestError::Shutdown { node_index, message } => {
                write!(f, "Failed to shut down node {}: {}", node_index, message)
            }
            TestError::HandshakeFailed { from, to, message } => {
                write!(
                    f,
                    "Handshake failed between node {} and {}: {}",
                    from, to, message
                )
            }
            TestError::AssertionFailed { message } => {
                write!(f, "Assertion failed: {}", message)
            }
            TestError::SyncFailed { node_index, message } => {
                write!(f, "Sync failed on node {}: {}", node_index, message)
            }
            TestError::PropagationFailed { message } => {
                write!(f, "Content propagation failed: {}", message)
            }
            TestError::ConditionTimeout { condition, timeout_secs } => {
                write!(f, "Condition '{}' not met after {}s", condition, timeout_secs)
            }
        }
    }
}

impl std::error::Error for TestError {}

impl From<swimchain::node::NodeError> for TestError {
    fn from(err: swimchain::node::NodeError) -> Self {
        TestError::NodeStart {
            node_index: 0,
            message: err.to_string(),
        }
    }
}
