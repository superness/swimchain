//! Node Operations Module
//!
//! This module implements the Node Manager - the central orchestrator that connects
//! all subsystems into a running network node.
//!
//! # Architecture
//!
//! The NodeManager coordinates:
//! - Network connections and peer lifecycle
//! - Message routing to appropriate handlers
//! - Background tasks (sync, decay, contribution tracking)
//! - Unified API for CLI and GUI clients
//!
//! # Example
//!
//! ```no_run
//! use swimchain::node::{NodeManager, NodeConfig};
//! use swimchain::identity::KeyPair;
//!
//! async fn run_node() {
//!     let config = NodeConfig::default();
//!     let keypair = KeyPair::generate();
//!     let mut node = NodeManager::new(config, keypair).unwrap();
//!     node.start().await.unwrap();
//!     // Node is now running...
//!     node.stop().await.unwrap();
//! }
//! ```
//!
//! See `specs/SPEC_10_NODE_OPERATIONS.md` for full specification.

pub mod config;
pub mod connection_event;
pub mod connection_manager;
pub mod error;
pub mod formation_gate;
pub mod manager;
pub mod metrics;
pub mod origin_privacy;
pub mod peer_connections;
pub mod router;
pub mod state;
pub mod tasks;

// Re-exports for convenient access
pub use config::{BehavioralBranchingMode, NodeConfig, SeedEntry, SeedingMode};
pub use connection_event::{ConnectionError, ConnectionEvent, DisconnectReason};
pub use connection_manager::{
    ConnectionConfig, ConnectionHandle, ConnectionManager, ConnectionManagerError, ReconnectState,
};
pub use error::NodeError;
pub use formation_gate::{FormationGate, FORMATION_GRACE_SECS};
pub use manager::NodeManager;
pub use metrics::NodeMetrics;
pub use origin_privacy::{route_relayed, route_self_originated, OriginPrivacyConfig, OriginRoute};
pub use peer_connections::{PeerConnection, PeerConnectionPool, SendError};
pub use router::{MessageRouter, MessageRouterBuilder, RouteError};
pub use state::{NodeState, NodeStatus};
pub use tasks::BackgroundTaskRunner;
