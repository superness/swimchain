//! Multi-node test harness infrastructure
//!
//! Provides the core infrastructure for spawning and managing multiple
//! Swimchain nodes in a test environment with ephemeral ports.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tempfile::TempDir;
use tokio::time::{sleep, timeout};

use swimchain::crypto::signature::generate_keypair;
use swimchain::identity::KeyPair;
use swimchain::node::{NodeConfig, NodeManager, NodeState};

use super::error::TestError;

/// A running node in the test harness
pub struct RunningNode {
    /// The node manager instance
    pub manager: NodeManager,
    /// The node's keypair
    pub keypair: KeyPair,
    /// The actual listen address (after binding with port 0)
    pub listen_addr: SocketAddr,
    /// Temporary data directory (cleaned up on drop)
    pub data_dir: TempDir,
    /// Node index for identification
    pub index: usize,
}

impl RunningNode {
    /// Get the node's public key ID
    pub fn node_id(&self) -> [u8; 32] {
        self.manager.node_id()
    }

    /// Check if this node is connected to another node
    pub fn is_connected_to(&self, other: &RunningNode) -> bool {
        let peers = self.manager.peers();
        peers.iter().any(|p| p.node_id == other.node_id())
    }

    /// Get the number of connected peers
    pub fn peer_count(&self) -> usize {
        self.manager.peer_count()
    }
}

/// Harness for managing multiple test nodes
pub struct MultiNodeTestHarness {
    /// Running nodes in the harness
    pub nodes: Vec<RunningNode>,
}

impl MultiNodeTestHarness {
    /// Create a new test harness with the specified number of nodes
    ///
    /// This creates nodes but does NOT start them. Call `start_all()` to start.
    /// Uses port 0 for all nodes to get ephemeral ports (CI-safe).
    pub async fn new(node_count: usize) -> Result<Self, TestError> {
        let mut nodes = Vec::with_capacity(node_count);

        for i in 0..node_count {
            let keypair = generate_keypair();
            let data_dir = TempDir::new().map_err(|e| TestError::NodeStart {
                node_index: i,
                message: format!("Failed to create temp dir: {}", e),
            })?;

            let config = NodeConfig {
                // Use port 0 for ephemeral port assignment
                listen_addr: "127.0.0.1:0".parse().unwrap(),
                data_dir: data_dir.path().to_path_buf(),
                // Minimal peer requirements for testing
                min_peers: 0,
                target_peers: 8,
                max_inbound: 10,
                max_outbound: 10,
                // No seed nodes for local testing
                seeds: vec![],
                // Enable contribution tracking
                contribution_enabled: true,
                // Use ephemeral RPC port (0) to avoid port conflicts in tests
                rpc_port: Some(0),
                ..NodeConfig::default()
            };

            let manager = NodeManager::new(config, keypair.clone()).map_err(|e| TestError::NodeStart {
                node_index: i,
                message: e.to_string(),
            })?;

            nodes.push(RunningNode {
                manager,
                keypair,
                listen_addr: "127.0.0.1:0".parse().unwrap(), // Updated after start
                data_dir,
                index: i,
            });
        }

        Ok(Self { nodes })
    }

    /// Start all nodes in the harness
    ///
    /// After this returns, all nodes are in the Running state and listening
    /// on their assigned ephemeral ports.
    pub async fn start_all(&mut self) -> Result<(), TestError> {
        for i in 0..self.nodes.len() {
            self.nodes[i]
                .manager
                .start()
                .await
                .map_err(|e| TestError::NodeStart {
                    node_index: i,
                    message: e.to_string(),
                })?;

            // Update listen address with actual bound address
            if let Some(addr) = self.nodes[i].manager.listen_addr() {
                self.nodes[i].listen_addr = addr;
            }

            log::info!(
                "Node {} started on {}",
                i,
                self.nodes[i].listen_addr
            );
        }

        Ok(())
    }

    /// Get the number of nodes in the harness
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Connect one node to another
    ///
    /// This initiates an outbound connection from `from` to `to`.
    pub async fn connect_pair(&self, from: usize, to: usize) -> Result<(), TestError> {
        let to_addr = self.nodes[to].listen_addr;

        self.nodes[from]
            .manager
            .connect(to_addr)
            .await
            .map_err(|e| TestError::ConnectFailed {
                node_index: from,
                addr: to_addr,
                message: e.to_string(),
            })?;

        Ok(())
    }

    /// Connect all nodes in a full mesh topology
    ///
    /// Each node connects to all other nodes.
    pub async fn connect_mesh(&self) -> Result<(), TestError> {
        for i in 0..self.nodes.len() {
            for j in (i + 1)..self.nodes.len() {
                // Only connect i -> j, the reverse will be established via accept
                self.connect_pair(i, j).await?;
            }
        }
        Ok(())
    }

    /// Wait for a specific connection to be established
    ///
    /// Polls until node `from` is connected to node `to` or timeout expires.
    pub async fn wait_for_connection(
        &self,
        from: usize,
        to: usize,
        timeout_duration: Duration,
    ) -> Result<(), TestError> {
        let start = std::time::Instant::now();
        let poll_interval = Duration::from_millis(50);
        let to_id = self.nodes[to].node_id();

        while start.elapsed() < timeout_duration {
            let peers = self.nodes[from].manager.peers();
            if peers.iter().any(|p| p.node_id == to_id) {
                log::debug!("Connection established: {} -> {}", from, to);
                return Ok(());
            }
            sleep(poll_interval).await;
        }

        Err(TestError::ConnectionTimeout {
            from,
            to,
            timeout_secs: timeout_duration.as_secs(),
        })
    }

    /// Wait for all nodes to reach a minimum peer count
    ///
    /// Useful for verifying mesh connectivity.
    pub async fn wait_for_all_connected(
        &self,
        min_peers: usize,
        timeout_duration: Duration,
    ) -> Result<(), TestError> {
        let start = std::time::Instant::now();
        let poll_interval = Duration::from_millis(100);

        while start.elapsed() < timeout_duration {
            let all_connected = self
                .nodes
                .iter()
                .all(|n| n.peer_count() >= min_peers);

            if all_connected {
                log::debug!(
                    "All nodes connected with at least {} peers",
                    min_peers
                );
                return Ok(());
            }
            sleep(poll_interval).await;
        }

        // Log current state for debugging
        for (i, node) in self.nodes.iter().enumerate() {
            log::warn!("Node {} has {} peers", i, node.peer_count());
        }

        Err(TestError::AllConnectionsTimeout {
            timeout_secs: timeout_duration.as_secs(),
        })
    }

    /// Wait for a condition to be met
    ///
    /// Generic utility for waiting on arbitrary conditions.
    pub async fn wait_for<F>(
        &self,
        condition_name: &str,
        timeout_duration: Duration,
        condition: F,
    ) -> Result<(), TestError>
    where
        F: Fn(&Self) -> bool,
    {
        let start = std::time::Instant::now();
        let poll_interval = Duration::from_millis(50);

        while start.elapsed() < timeout_duration {
            if condition(self) {
                return Ok(());
            }
            sleep(poll_interval).await;
        }

        Err(TestError::ConditionTimeout {
            condition: condition_name.to_string(),
            timeout_secs: timeout_duration.as_secs(),
        })
    }

    /// Shutdown all nodes gracefully
    pub async fn shutdown_all(&mut self) -> Result<(), TestError> {
        let mut errors = Vec::new();

        for (i, node) in self.nodes.iter_mut().enumerate() {
            if node.manager.state() != NodeState::Stopped {
                if let Err(e) = node.manager.stop().await {
                    errors.push(TestError::Shutdown {
                        node_index: i,
                        message: e.to_string(),
                    });
                } else {
                    log::info!("Node {} stopped", i);
                }
            }
        }

        if let Some(err) = errors.into_iter().next() {
            return Err(err);
        }

        Ok(())
    }
}

impl Drop for MultiNodeTestHarness {
    fn drop(&mut self) {
        // Nodes are dropped automatically, which triggers their Drop impl
        // TempDir is cleaned up automatically when dropped
        log::debug!("MultiNodeTestHarness dropped, cleaning up {} nodes", self.nodes.len());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_harness_creation() {
        let harness = MultiNodeTestHarness::new(2).await.unwrap();
        assert_eq!(harness.node_count(), 2);
    }

    #[tokio::test]
    async fn test_harness_start_all() {
        let mut harness = MultiNodeTestHarness::new(2).await.unwrap();
        harness.start_all().await.unwrap();

        for node in &harness.nodes {
            assert_eq!(node.manager.state(), NodeState::Running);
            assert!(node.listen_addr.port() > 0);
        }

        harness.shutdown_all().await.unwrap();
    }

    #[tokio::test]
    async fn test_harness_ephemeral_ports() {
        let mut harness = MultiNodeTestHarness::new(3).await.unwrap();
        harness.start_all().await.unwrap();

        // All ports should be different and non-zero
        let ports: Vec<u16> = harness.nodes.iter().map(|n| n.listen_addr.port()).collect();
        assert!(ports.iter().all(|&p| p > 0));

        // Check all ports are unique
        let mut unique_ports = ports.clone();
        unique_ports.sort();
        unique_ports.dedup();
        assert_eq!(unique_ports.len(), ports.len());

        harness.shutdown_all().await.unwrap();
    }
}
