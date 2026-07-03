//! Node configuration types
//!
//! Defines NodeConfig with all configuration options per SPEC_10 §3.2.
//!
//! # Example
//!
//! ```
//! use swimchain::node::{NodeConfig, SeedingMode};
//!
//! let config = NodeConfig::default();
//! assert_eq!(config.max_connections, 500);
//! assert_eq!(config.seeding_mode, SeedingMode::ViewedContent);
//! ```

use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::discovery::seed_list::{default_mainnet_seeds, default_testnet_seeds};
use crate::network::NetworkMode;
use crate::node::NodeError;
use crate::storage::StorageProfile;
use crate::types::constants::{
    CONNECTION_MIN_PEERS, CONNECTION_TARGET_PEERS, MAX_CONNECTIONS, MAX_INBOUND_CONNECTIONS,
    MAX_OUTBOUND_CONNECTIONS,
};

/// Seed node entry for bootstrap
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedEntry {
    /// Network address of the seed node
    pub addr: SocketAddr,

    /// Optional node ID for verification (32 bytes)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<[u8; 32]>,
}

impl SeedEntry {
    /// Create a new seed entry with just an address
    pub fn new(addr: SocketAddr) -> Self {
        Self { addr, node_id: None }
    }

    /// Create a new seed entry with address and node ID
    pub fn with_id(addr: SocketAddr, node_id: [u8; 32]) -> Self {
        Self {
            addr,
            node_id: Some(node_id),
        }
    }
}

/// Content seeding mode
///
/// Controls what content the node will seed to peers.
/// Per SPEC_10 §3.2, affects contribution tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum SeedingMode {
    /// Seed content the user has viewed (default)
    #[default]
    ViewedContent,

    /// Seed all cached content
    AllContent,

    /// Only seed explicitly pinned content
    PinnedOnly,

    /// Do not seed any content
    Disabled,
}

impl SeedingMode {
    /// Returns true if seeding is enabled
    pub fn is_enabled(&self) -> bool {
        !matches!(self, SeedingMode::Disabled)
    }

    /// Returns the human-readable name of this mode
    pub fn name(&self) -> &'static str {
        match self {
            SeedingMode::ViewedContent => "Viewed Content",
            SeedingMode::AllContent => "All Content",
            SeedingMode::PinnedOnly => "Pinned Only",
            SeedingMode::Disabled => "Disabled",
        }
    }
}

/// Node configuration
///
/// All configuration options for running a node per SPEC_10 §3.2.
/// Default values are specified in the SPEC for network compatibility.
#[derive(Debug, Clone)]
pub struct NodeConfig {
    // ========== Network Mode ==========
    /// Network mode (Mainnet, Testnet, or Regtest)
    ///
    /// Regtest mode bypasses level checks for local development.
    pub network_mode: NetworkMode,

    // ========== Network ==========
    /// Address to listen on (default: 0.0.0.0:9735)
    pub listen_addr: SocketAddr,

    /// Maximum total connections (default: 125)
    pub max_connections: usize,

    /// Maximum inbound connections (default: 100)
    pub max_inbound: usize,

    /// Maximum outbound connections (default: 25)
    pub max_outbound: usize,

    /// Connection timeout in seconds (default: 30)
    pub connect_timeout: Duration,

    // ========== Bootstrap ==========
    /// Seed nodes for discovery
    pub seeds: Vec<SeedEntry>,

    /// Minimum peers before bootstrap (default: 8)
    pub min_peers: usize,

    /// Target peer count (default: 25)
    pub target_peers: usize,

    // ========== Storage ==========
    /// Data directory for all storage
    pub data_dir: PathBuf,

    /// Storage profile for cache limits
    pub storage_profile: StorageProfile,

    // ========== Sync ==========
    /// Sync check interval (default: 30s)
    pub sync_interval: Duration,

    /// Headers per batch during sync (default: 500)
    pub sync_batch_size: usize,

    // ========== Decay ==========
    /// Decay tick interval (default: 60s)
    pub decay_interval: Duration,

    /// Target storage size in MB (default: 500)
    pub storage_target_mb: u64,

    // ========== Contribution ==========
    /// Enable contribution tracking (default: true)
    pub contribution_enabled: bool,

    /// Content seeding mode (default: ViewedContent)
    pub seeding_mode: SeedingMode,

    /// Bandwidth limit in Mbps (default: 10)
    pub bandwidth_limit_mbps: u32,

    // ========== Mobile ==========
    /// Enable mobile-specific optimizations (default: false)
    pub mobile_mode: bool,

    /// Only sync on WiFi (default: true for mobile)
    pub wifi_only_sync: bool,

    /// Monthly cellular budget in MB (default: 100)
    pub cellular_budget_mb: u64,

    // ========== Seed Node ==========
    /// Run as a seed node with short-term connections
    ///
    /// When enabled, the node will:
    /// - Disconnect idle peers after `seed_connection_timeout`
    /// - Prioritize serving GETADDR and block sync requests
    /// - Not maintain long-lived connections
    pub seed_node_mode: bool,

    /// Connection timeout for seed node mode (default: 30s)
    ///
    /// Peers that haven't sent any messages in this time will be disconnected.
    /// Only applies when `seed_node_mode` is true.
    pub seed_connection_timeout: Duration,

    // ========== RPC ==========
    /// Enable RPC server (default: true)
    pub rpc_enabled: bool,

    /// RPC bind address (default: 127.0.0.1)
    /// WARNING: Binding to 0.0.0.0 exposes RPC to the network
    pub rpc_bind: std::net::IpAddr,

    /// RPC port (default: P2P port + 1: 9736/19736/29736)
    pub rpc_port: Option<u16>,

    /// RPC username (optional, for non-cookie auth)
    pub rpc_user: Option<String>,

    /// RPC password (optional, for non-cookie auth)
    pub rpc_password: Option<String>,

    // ========== Identity ==========
    /// Display name for this node's identity (max 31 UTF-8 bytes)
    /// This name is attached to all actions (posts, replies) created by this node
    pub identity_name: Option<String>,

    // ========== Behavioral Branching (SPEC_13 Phase A) ==========
    /// Enable behavioral branching (organic community detection + fracture).
    ///
    /// `None` uses the network-mode default: ON for Regtest, OFF for
    /// Mainnet/Testnet until SPEC_13 §7 consensus messages land. Detection is
    /// deterministic from chain data (§4.3), but keeping public networks off
    /// avoids state divergence with nodes that don't run detection yet.
    pub behavioral_branching: Option<bool>,
}

impl Default for NodeConfig {
    fn default() -> Self {
        Self {
            // Network mode defaults to mainnet
            network_mode: NetworkMode::default(),

            // Network defaults per SPEC_10 §3.2
            listen_addr: "0.0.0.0:9735".parse().unwrap(),
            max_connections: MAX_CONNECTIONS,
            max_inbound: MAX_INBOUND_CONNECTIONS,
            max_outbound: MAX_OUTBOUND_CONNECTIONS,
            connect_timeout: Duration::from_secs(30),

            // Bootstrap defaults
            seeds: vec![],
            min_peers: CONNECTION_MIN_PEERS,
            target_peers: CONNECTION_TARGET_PEERS,

            // Storage defaults
            data_dir: default_data_dir(),
            storage_profile: StorageProfile::Standard5GB,

            // Sync defaults
            sync_interval: Duration::from_secs(30),
            sync_batch_size: 500,

            // Decay defaults
            decay_interval: Duration::from_secs(60),
            storage_target_mb: 500,

            // Contribution defaults
            contribution_enabled: true,
            seeding_mode: SeedingMode::ViewedContent,
            bandwidth_limit_mbps: 10,

            // Mobile defaults
            mobile_mode: false,
            wifi_only_sync: true,
            cellular_budget_mb: 100,

            // Seed node defaults
            seed_node_mode: false,
            seed_connection_timeout: Duration::from_secs(30),

            // RPC defaults
            rpc_enabled: true,
            rpc_bind: "127.0.0.1".parse().unwrap(),
            rpc_port: None, // Will default to network_mode.default_rpc_port()
            rpc_user: None,
            rpc_password: None,

            // Identity defaults
            identity_name: None,

            // Behavioral branching defaults to network-mode behavior
            // (ON for regtest, OFF for mainnet/testnet)
            behavioral_branching: None,
        }
    }
}

impl NodeConfig {
    /// Get the RPC port (uses network mode default if not explicitly set)
    pub fn rpc_port(&self) -> u16 {
        self.rpc_port.unwrap_or_else(|| self.network_mode.default_rpc_port())
    }

    /// Get the full RPC address
    pub fn rpc_addr(&self) -> SocketAddr {
        SocketAddr::new(self.rpc_bind, self.rpc_port())
    }

    /// Get the RPC cookie path
    pub fn rpc_cookie_path(&self) -> PathBuf {
        self.data_dir.join(".cookie")
    }

    /// Create a new NodeConfig with default values
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a minimal config for testing
    ///
    /// Uses a unique directory based on thread ID and timestamp to avoid
    /// file lock conflicts when running tests in parallel.
    /// Defaults to Regtest mode for bypassing level checks.
    pub fn for_test(port: u16) -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};

        // Generate a unique directory name using timestamp and thread ID
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let thread_id = std::thread::current().id();
        let unique_name = format!("swimchain_test_{}_{:?}", timestamp, thread_id);

        Self {
            network_mode: NetworkMode::Regtest, // Test mode for bypassing level checks
            listen_addr: format!("127.0.0.1:{}", port).parse().unwrap(),
            data_dir: std::env::temp_dir().join(unique_name),
            min_peers: 0,
            target_peers: 1,
            ..Self::default()
        }
    }

    /// Create a config for regtest mode (local development)
    pub fn for_regtest(port: u16) -> Self {
        Self {
            network_mode: NetworkMode::Regtest,
            listen_addr: format!("127.0.0.1:{}", port).parse().unwrap(),
            min_peers: 0,
            target_peers: 1,
            ..Self::default()
        }
    }

    /// Create a config for testnet
    pub fn for_testnet() -> Self {
        Self {
            network_mode: NetworkMode::Testnet,
            listen_addr: format!("0.0.0.0:{}", NetworkMode::Testnet.default_port())
                .parse()
                .unwrap(),
            min_peers: 4,
            ..Self::default()
        }
    }

    /// Check if level checks should be bypassed
    ///
    /// Returns true in Regtest mode where level gating is disabled.
    pub fn skip_level_checks(&self) -> bool {
        self.network_mode.allows_skip_level_check()
    }

    /// Check if self-sponsorship is allowed
    ///
    /// Returns true in Regtest mode where users can self-sponsor.
    pub fn allows_self_sponsorship(&self) -> bool {
        self.network_mode.allows_self_sponsorship()
    }

    /// Check if behavioral branching (SPEC_13) is enabled.
    ///
    /// Explicit setting wins; otherwise defaults ON for Regtest and OFF for
    /// Mainnet/Testnet (until SPEC_13 §7 network messages are implemented).
    pub fn behavioral_branching_enabled(&self) -> bool {
        self.behavioral_branching
            .unwrap_or(matches!(self.network_mode, NetworkMode::Regtest))
    }

    /// Validate the configuration
    ///
    /// Returns an error if any values are invalid or inconsistent.
    pub fn validate(&self) -> Result<(), NodeError> {
        // min_peers must not exceed target_peers
        if self.min_peers > self.target_peers {
            return Err(NodeError::InvalidConfig(
                "min_peers cannot exceed target_peers".into(),
            ));
        }

        // max_connections must be >= target_peers
        if self.max_connections < self.target_peers {
            return Err(NodeError::InvalidConfig(
                "max_connections must be >= target_peers".into(),
            ));
        }

        // storage_target_mb must be reasonable
        if self.storage_target_mb < 100 {
            return Err(NodeError::InvalidConfig(
                "storage_target_mb must be at least 100".into(),
            ));
        }

        // bandwidth_limit_mbps must be reasonable
        if self.bandwidth_limit_mbps == 0 && self.seeding_mode != SeedingMode::Disabled {
            return Err(NodeError::InvalidConfig(
                "bandwidth_limit_mbps cannot be 0 when seeding is enabled".into(),
            ));
        }

        // sync_batch_size must be reasonable
        if self.sync_batch_size == 0 {
            return Err(NodeError::InvalidConfig(
                "sync_batch_size must be > 0".into(),
            ));
        }

        Ok(())
    }

    /// Get the path for chain storage
    pub fn chain_store_path(&self) -> PathBuf {
        self.data_dir.join("chain")
    }

    /// Get the path for blob storage
    pub fn blob_store_path(&self) -> PathBuf {
        self.data_dir.join("blobs")
    }

    /// Get the path for peer storage
    pub fn peer_store_path(&self) -> PathBuf {
        self.data_dir.join("peers")
    }

    /// Get the path for contribution storage
    pub fn contribution_store_path(&self) -> PathBuf {
        self.data_dir.join("contribution")
    }

    /// Get default seeds for the current network mode
    ///
    /// Returns the hardcoded seed list for the network:
    /// - Mainnet: mainnet seed nodes
    /// - Testnet: testnet seed nodes
    /// - Regtest: empty (local development)
    pub fn default_seeds_for_network(&self) -> Vec<SeedEntry> {
        match self.network_mode {
            NetworkMode::Mainnet => default_mainnet_seeds()
                .into_iter()
                .map(|s| {
                    let ip = &s.address[0..4];
                    let addr = format!("{}.{}.{}.{}:{}", ip[0], ip[1], ip[2], ip[3], s.port);
                    SeedEntry::new(addr.parse().unwrap())
                })
                .collect(),
            NetworkMode::Testnet => default_testnet_seeds()
                .into_iter()
                .map(|s| {
                    let ip = &s.address[0..4];
                    let addr = format!("{}.{}.{}.{}:{}", ip[0], ip[1], ip[2], ip[3], s.port);
                    SeedEntry::new(addr.parse().unwrap())
                })
                .collect(),
            NetworkMode::Regtest => {
                // No seeds in regtest mode - local development only
                Vec::new()
            }
        }
    }

    /// Create a config with network-appropriate defaults including seeds
    ///
    /// This loads the hardcoded seed list for the network mode automatically.
    pub fn with_network_defaults(network_mode: NetworkMode) -> Self {
        let mut config = Self {
            network_mode,
            listen_addr: format!("0.0.0.0:{}", network_mode.default_port())
                .parse()
                .unwrap(),
            ..Self::default()
        };
        config.seeds = config.default_seeds_for_network();
        config
    }
}

/// Get the default data directory
fn default_data_dir() -> PathBuf {
    // Use standard XDG paths on Linux, or home directory otherwise
    std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            std::env::var("HOME")
                .map(|h| PathBuf::from(h).join(".local").join("share"))
                .unwrap_or_else(|_| PathBuf::from("."))
        })
        .join("swimchain")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_defaults_match_spec() {
        let config = NodeConfig::default();

        // SPEC_10 §3.2 defaults
        assert_eq!(
            config.listen_addr,
            "0.0.0.0:9735".parse::<SocketAddr>().unwrap()
        );
        assert_eq!(config.max_connections, MAX_CONNECTIONS);
        assert_eq!(config.max_inbound, MAX_INBOUND_CONNECTIONS);
        assert_eq!(config.max_outbound, MAX_OUTBOUND_CONNECTIONS);
        assert_eq!(config.connect_timeout.as_secs(), 30);
        assert_eq!(config.min_peers, CONNECTION_MIN_PEERS);
        assert_eq!(config.target_peers, CONNECTION_TARGET_PEERS);
        assert_eq!(config.sync_interval.as_secs(), 30);
        assert_eq!(config.sync_batch_size, 500);
        assert_eq!(config.decay_interval.as_secs(), 60);
        assert_eq!(config.storage_target_mb, 500);
        assert!(config.contribution_enabled);
        assert_eq!(config.seeding_mode, SeedingMode::ViewedContent);
        assert_eq!(config.bandwidth_limit_mbps, 10);
        assert!(!config.mobile_mode);
        assert!(config.wifi_only_sync);
        assert_eq!(config.cellular_budget_mb, 100);
    }

    #[test]
    fn test_validate_accepts_valid_config() {
        let config = NodeConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_validate_rejects_min_gt_target() {
        let config = NodeConfig {
            min_peers: 30,
            target_peers: 25,
            ..NodeConfig::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("min_peers"));
    }

    #[test]
    fn test_validate_rejects_max_lt_target() {
        let config = NodeConfig {
            max_connections: 20,
            target_peers: 25,
            ..NodeConfig::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("max_connections"));
    }

    #[test]
    fn test_validate_rejects_small_storage() {
        let config = NodeConfig {
            storage_target_mb: 50,
            ..NodeConfig::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("storage_target_mb"));
    }

    #[test]
    fn test_validate_rejects_zero_bandwidth_with_seeding() {
        let config = NodeConfig {
            bandwidth_limit_mbps: 0,
            seeding_mode: SeedingMode::ViewedContent,
            ..NodeConfig::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("bandwidth_limit"));
    }

    #[test]
    fn test_validate_accepts_zero_bandwidth_when_disabled() {
        let config = NodeConfig {
            bandwidth_limit_mbps: 0,
            seeding_mode: SeedingMode::Disabled,
            ..NodeConfig::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_seed_entry_new() {
        let addr: SocketAddr = "192.168.1.1:9735".parse().unwrap();
        let entry = SeedEntry::new(addr);
        assert_eq!(entry.addr, addr);
        assert!(entry.node_id.is_none());
    }

    #[test]
    fn test_seed_entry_with_id() {
        let addr: SocketAddr = "192.168.1.1:9735".parse().unwrap();
        let id = [42u8; 32];
        let entry = SeedEntry::with_id(addr, id);
        assert_eq!(entry.addr, addr);
        assert_eq!(entry.node_id, Some(id));
    }

    #[test]
    fn test_seeding_mode_is_enabled() {
        assert!(SeedingMode::ViewedContent.is_enabled());
        assert!(SeedingMode::AllContent.is_enabled());
        assert!(SeedingMode::PinnedOnly.is_enabled());
        assert!(!SeedingMode::Disabled.is_enabled());
    }

    #[test]
    fn test_seeding_mode_names() {
        assert_eq!(SeedingMode::ViewedContent.name(), "Viewed Content");
        assert_eq!(SeedingMode::AllContent.name(), "All Content");
        assert_eq!(SeedingMode::PinnedOnly.name(), "Pinned Only");
        assert_eq!(SeedingMode::Disabled.name(), "Disabled");
    }

    #[test]
    fn test_for_test_config() {
        let config = NodeConfig::for_test(9999);
        assert_eq!(
            config.listen_addr,
            "127.0.0.1:9999".parse::<SocketAddr>().unwrap()
        );
        assert_eq!(config.min_peers, 0);
        assert_eq!(config.target_peers, 1);
    }

    #[test]
    fn test_storage_paths() {
        let config = NodeConfig {
            data_dir: PathBuf::from("/data/swimchain"),
            ..NodeConfig::default()
        };
        assert_eq!(config.chain_store_path(), PathBuf::from("/data/swimchain/chain"));
        assert_eq!(config.blob_store_path(), PathBuf::from("/data/swimchain/blobs"));
        assert_eq!(config.peer_store_path(), PathBuf::from("/data/swimchain/peers"));
        assert_eq!(
            config.contribution_store_path(),
            PathBuf::from("/data/swimchain/contribution")
        );
    }
}
