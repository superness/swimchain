//! Network simulation test infrastructure
//!
//! Provides in-process simulation of multi-node network behavior.
//! This approach was chosen over Docker-based testing for:
//! - Faster iteration (no container startup overhead)
//! - Deterministic timing control
//! - Easier debugging with standard Rust tooling
//!
//! Architecture:
//! - MockBlock: Simplified block representation for testing
//! - NodeHandle: Simulated node with SeenCache integration
//! - Topology: Network topology abstraction (FullMesh, Ring, Star, Custom)
//! - PartitionController: Network partition simulation
//! - TestNetwork: Orchestrates propagation simulation

mod helpers;
mod metrics_collector;
mod mock_chain;
mod node;
mod partition;
mod test_network;
mod topology;

// Test modules
mod convergence_tests;
mod failure_tests;
mod partition_tests;
mod propagation_tests;

// Re-export key types for test modules
pub use helpers::*;
pub use metrics_collector::MetricsCollector;
pub use mock_chain::MockBlock;
pub use node::{ChainTip, NodeHandle};
pub use partition::PartitionController;
pub use test_network::{PropagationResult, TestNetwork, TestNetworkConfig};
pub use topology::Topology;
