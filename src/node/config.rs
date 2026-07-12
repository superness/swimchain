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
        Self {
            addr,
            node_id: None,
        }
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

/// Effective behavioral-branching mode for a node (SPEC_13 Phase A,
/// `docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md` Phase 1), resolved from
/// [`NodeConfig::behavioral_branching_mode`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BehavioralBranchingMode {
    /// Detection does not run at all.
    Disabled,
    /// Detection runs; qualifying formations are recorded as
    /// [`crate::branch::BehavioralEvent`]s but no fracture executes and no
    /// space/branch is created (Phase 1 observation rollout).
    LogOnly,
    /// Detection runs; qualifying formations execute the fracture and are
    /// recorded as a real [`crate::branch::CommunityFormation`] (pre-rollout
    /// behavior, currently regtest-only by default).
    Full,
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

    // ========== Privacy / Proxy (SWIM-PRIV-2) ==========
    /// SOCKS5 proxy for outbound peer connections (e.g. `127.0.0.1:9050` for Tor).
    ///
    /// When set, every outbound peer dial is performed via a SOCKS5 CONNECT
    /// handshake through this proxy instead of a direct `TcpStream::connect`,
    /// so peers see the proxy's / Tor exit's address rather than the node's
    /// real IP. `None` (default) means direct clearnet connections.
    pub proxy: Option<SocketAddr>,

    /// Refuse any outbound path that would bypass the proxy or leak the local IP.
    ///
    /// Requires `proxy` to be set. When enabled, the node:
    /// - skips DNS-seed resolution (which would leak DNS lookups on clearnet),
    /// - disables local/mDNS discovery, and
    /// - advertises no local address in the P2P handshake.
    ///
    /// See the SWIM-PRIV-2 docs for the exact leak-prevention scope.
    pub proxy_only: bool,

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

    /// Enable log-only behavioral branching (Phase 1 observation rollout,
    /// `docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md`).
    ///
    /// When on (and full [`Self::behavioral_branching`] is off), detection
    /// still runs and qualifying clusters are persisted as
    /// [`crate::branch::BehavioralEvent`]s — queryable via the
    /// `list_behavioral_events` RPC — but no fracture executes and no
    /// space/branch is created.
    ///
    /// `None` uses the network-mode default: ON for Testnet (Phase 1
    /// rollout), OFF for Mainnet/Regtest. Regtest defaults to full formation
    /// instead (see [`Self::behavioral_branching_enabled`]), so log-only
    /// would never be consulted there unless full is explicitly disabled.
    pub behavioral_branching_log_only: Option<bool>,

    // ========== Gossip Origin Privacy (SWIM-PRIV-1) ==========
    /// Enable gossip origin obfuscation for self-originated actions.
    ///
    /// When on, actions this node authors (via its own `submit_*` RPC) get a
    /// randomized first-announce delay (and, if `origin_privacy_stem`, a single
    /// random stem hop) so a passive observer can't identify the author by who
    /// announces first. Relayed actions are unaffected and propagate promptly.
    ///
    /// `None` uses the network-mode default: ON for Mainnet/Testnet, OFF for
    /// Regtest (so local/e2e tests are not slowed by diffusion delays).
    pub origin_privacy: Option<bool>,

    /// Lower bound of the randomized first-announce delay (default: 2s).
    pub origin_privacy_min_delay: Duration,

    /// Upper bound of the randomized first-announce delay (default: 12s).
    pub origin_privacy_max_delay: Duration,

    /// Use stem+fluff: relay the first hop of a self-originated action to a
    /// single random peer before the network-wide diffusion (default: true).
    /// When false, falls back to delay-only diffusion (delay then broadcast).
    pub origin_privacy_stem: bool,

    // ========== Blocklist Trust Anchors (SPEC_12 CSAM seeding) ==========
    /// Ed25519 public keys of trusted blocklist list-maintainers.
    ///
    /// Blocklist updates and signed bundles authored by one of these keys are
    /// accepted network-wide *without* community spam-attestations (trust is
    /// anchored in this configured set). Updates from any other key still
    /// require the full attestation threshold. Empty by default; operators
    /// populate it from `<data_dir>/blocklist_trusted_keys.txt` via
    /// [`NodeConfig::load_trusted_blocklist_keys`] or by setting it directly.
    pub trusted_blocklist_keys: Vec<[u8; 32]>,
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

            // Privacy / proxy defaults (SWIM-PRIV-2): direct clearnet, no proxy
            proxy: None,
            proxy_only: false,

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

            // Log-only behavioral branching defaults to network-mode behavior
            // (ON for testnet -- Phase 1 rollout, OFF for mainnet/regtest)
            behavioral_branching_log_only: None,

            // Gossip origin privacy (SWIM-PRIV-1) defaults to network-mode
            // behavior (ON for mainnet/testnet, OFF for regtest) with a
            // 2-12s jittered first-announce delay and stem+fluff enabled.
            origin_privacy: None,
            origin_privacy_min_delay: Duration::from_secs(2),
            origin_privacy_max_delay: Duration::from_secs(12),
            origin_privacy_stem: true,

            // No trusted blocklist maintainers by default; operator-configured.
            trusted_blocklist_keys: Vec::new(),
        }
    }
}

impl NodeConfig {
    /// Get the RPC port (uses network mode default if not explicitly set)
    pub fn rpc_port(&self) -> u16 {
        self.rpc_port
            .unwrap_or_else(|| self.network_mode.default_rpc_port())
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

    /// Returns true when outbound connections should be routed through a
    /// SOCKS5 proxy (SWIM-PRIV-2).
    pub fn proxy_enabled(&self) -> bool {
        self.proxy.is_some()
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

    /// Check if log-only behavioral branching (Phase 1 rollout) is enabled.
    ///
    /// Explicit setting wins; otherwise defaults ON for Testnet and OFF for
    /// Mainnet/Regtest. Only consulted when [`Self::behavioral_branching_enabled`]
    /// is false -- see [`Self::behavioral_branching_mode`].
    pub fn behavioral_branching_log_only_enabled(&self) -> bool {
        self.behavioral_branching_log_only
            .unwrap_or(matches!(self.network_mode, NetworkMode::Testnet))
    }

    /// Resolve the effective behavioral-branching mode for this node
    /// (`docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md`).
    ///
    /// Full formation wins over log-only if both are (explicitly or by
    /// default) enabled -- log-only exists to observe *before* full
    /// formation is safe to enable, not alongside it.
    pub fn behavioral_branching_mode(&self) -> BehavioralBranchingMode {
        if self.behavioral_branching_enabled() {
            BehavioralBranchingMode::Full
        } else if self.behavioral_branching_log_only_enabled() {
            BehavioralBranchingMode::LogOnly
        } else {
            BehavioralBranchingMode::Disabled
        }
    }

    /// Check if gossip origin privacy (SWIM-PRIV-1) is enabled.
    ///
    /// Explicit setting wins; otherwise defaults ON for Mainnet/Testnet and OFF
    /// for Regtest (so local/e2e tests are not slowed by diffusion delays).
    pub fn origin_privacy_enabled(&self) -> bool {
        self.origin_privacy
            .unwrap_or(!matches!(self.network_mode, NetworkMode::Regtest))
    }

    /// Resolve the effective origin-privacy settings for this node.
    ///
    /// Combines the network-mode-aware enable flag with the configured delay
    /// bounds and stem toggle into an [`OriginPrivacyConfig`] that the gossip
    /// path consults on every self-originated broadcast.
    pub fn origin_privacy(&self) -> crate::node::OriginPrivacyConfig {
        crate::node::OriginPrivacyConfig {
            enabled: self.origin_privacy_enabled(),
            min_delay: self.origin_privacy_min_delay,
            max_delay: self.origin_privacy_max_delay,
            stem_enabled: self.origin_privacy_stem,
        }
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

        // proxy_only requires a proxy to be configured (SWIM-PRIV-2), otherwise
        // there is no proxied path to fall back to and every dial would fail.
        if self.proxy_only && self.proxy.is_none() {
            return Err(NodeError::InvalidConfig(
                "proxy_only requires a proxy address (set --proxy)".into(),
            ));
        }

        Ok(())
    }

    /// Path to the operator's trusted blocklist-maintainer key file.
    pub fn trusted_blocklist_keys_path(&self) -> PathBuf {
        self.data_dir.join("blocklist_trusted_keys.txt")
    }

    /// Load trusted blocklist-maintainer keys from
    /// `<data_dir>/blocklist_trusted_keys.txt` into `trusted_blocklist_keys`.
    ///
    /// The file lists one Ed25519 public key per line, either as 64-char hex or
    /// a `swim1...` bech32m address. Blank lines and `#` comments are ignored.
    /// Missing file is not an error (no trusted keys configured). Keys loaded
    /// here are merged with any already present (deduplicated).
    pub fn load_trusted_blocklist_keys(&mut self) -> Result<usize, NodeError> {
        let path = self.trusted_blocklist_keys_path();
        if !path.exists() {
            return Ok(0);
        }
        let contents = std::fs::read_to_string(&path)
            .map_err(|e| NodeError::InvalidConfig(format!("reading {:?}: {}", path, e)))?;

        let mut loaded = 0;
        for (idx, raw) in contents.lines().enumerate() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let key = parse_pubkey(line).ok_or_else(|| {
                NodeError::InvalidConfig(format!(
                    "blocklist_trusted_keys.txt line {}: invalid pubkey '{}'",
                    idx + 1,
                    line
                ))
            })?;
            if !self.trusted_blocklist_keys.contains(&key) {
                self.trusted_blocklist_keys.push(key);
                loaded += 1;
            }
        }
        Ok(loaded)
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

/// Parse an Ed25519 public key from either 64-char hex or a bech32m address.
fn parse_pubkey(s: &str) -> Option<[u8; 32]> {
    // Try raw hex first.
    if let Ok(bytes) = hex::decode(s) {
        if bytes.len() == 32 {
            let mut out = [0u8; 32];
            out.copy_from_slice(&bytes);
            return Some(out);
        }
    }
    // Fall back to a bech32m swimchain address.
    crate::crypto::address::decode_address_to_pubkey(s)
        .ok()
        .map(|pk| pk.0)
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
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("storage_target_mb"));
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
    fn test_proxy_defaults_off() {
        let config = NodeConfig::default();
        assert!(config.proxy.is_none());
        assert!(!config.proxy_only);
        assert!(!config.proxy_enabled());
    }

    #[test]
    fn test_proxy_enabled_when_set() {
        let config = NodeConfig {
            proxy: Some("127.0.0.1:9050".parse().unwrap()),
            ..NodeConfig::default()
        };
        assert!(config.proxy_enabled());
        // proxy alone (without proxy_only) is a valid config
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_validate_rejects_proxy_only_without_proxy() {
        let config = NodeConfig {
            proxy: None,
            proxy_only: true,
            ..NodeConfig::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("proxy_only"));
    }

    #[test]
    fn test_validate_accepts_proxy_only_with_proxy() {
        let config = NodeConfig {
            proxy: Some("127.0.0.1:9050".parse().unwrap()),
            proxy_only: true,
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
    fn test_origin_privacy_network_defaults() {
        // Default (None) resolves ON for mainnet/testnet, OFF for regtest so
        // local/e2e tests are not slowed by diffusion delays.
        let mainnet = NodeConfig::with_network_defaults(NetworkMode::Mainnet);
        assert!(mainnet.origin_privacy_enabled());
        assert!(mainnet.origin_privacy().enabled);

        let testnet = NodeConfig::for_testnet();
        assert!(testnet.origin_privacy_enabled());

        let regtest = NodeConfig::for_regtest(29999);
        assert!(!regtest.origin_privacy_enabled());
        assert!(!regtest.origin_privacy().enabled);

        // Explicit override wins over the network-mode default.
        let forced_on = NodeConfig {
            origin_privacy: Some(true),
            ..NodeConfig::for_regtest(29998)
        };
        assert!(forced_on.origin_privacy_enabled());
    }

    #[test]
    fn test_behavioral_branching_mode_network_defaults() {
        // Phase 1 rollout (docs/handoffs/BEHAVIORAL_BRANCHING_ROLLOUT.md):
        // regtest keeps full formation, testnet gets log-only observation,
        // mainnet stays fully disabled -- all by default (None/None).
        let mainnet = NodeConfig::with_network_defaults(NetworkMode::Mainnet);
        assert_eq!(
            mainnet.behavioral_branching_mode(),
            BehavioralBranchingMode::Disabled
        );
        assert!(!mainnet.behavioral_branching_enabled());
        assert!(!mainnet.behavioral_branching_log_only_enabled());

        let testnet = NodeConfig::for_testnet();
        assert_eq!(
            testnet.behavioral_branching_mode(),
            BehavioralBranchingMode::LogOnly
        );
        assert!(!testnet.behavioral_branching_enabled());
        assert!(testnet.behavioral_branching_log_only_enabled());

        let regtest = NodeConfig::for_regtest(29997);
        assert_eq!(
            regtest.behavioral_branching_mode(),
            BehavioralBranchingMode::Full
        );
        assert!(regtest.behavioral_branching_enabled());

        // Explicit full override wins over log-only, even on testnet.
        let forced_full = NodeConfig {
            behavioral_branching: Some(true),
            ..NodeConfig::for_testnet()
        };
        assert_eq!(
            forced_full.behavioral_branching_mode(),
            BehavioralBranchingMode::Full
        );

        // Explicit log-only override applies on mainnet too.
        let forced_log_only = NodeConfig {
            behavioral_branching_log_only: Some(true),
            ..NodeConfig::with_network_defaults(NetworkMode::Mainnet)
        };
        assert_eq!(
            forced_log_only.behavioral_branching_mode(),
            BehavioralBranchingMode::LogOnly
        );

        // Explicit false on both disables regardless of network mode.
        let forced_off = NodeConfig {
            behavioral_branching: Some(false),
            behavioral_branching_log_only: Some(false),
            ..NodeConfig::for_testnet()
        };
        assert_eq!(
            forced_off.behavioral_branching_mode(),
            BehavioralBranchingMode::Disabled
        );
    }

    #[test]
    fn test_origin_privacy_delay_bounds_default() {
        let cfg = NodeConfig::default();
        assert_eq!(cfg.origin_privacy_min_delay, Duration::from_secs(2));
        assert_eq!(cfg.origin_privacy_max_delay, Duration::from_secs(12));
        assert!(cfg.origin_privacy_stem);
        let op = cfg.origin_privacy();
        assert_eq!(op.min_delay, Duration::from_secs(2));
        assert_eq!(op.max_delay, Duration::from_secs(12));
        assert!(op.stem_enabled);
    }

    #[test]
    fn test_storage_paths() {
        let config = NodeConfig {
            data_dir: PathBuf::from("/data/swimchain"),
            ..NodeConfig::default()
        };
        assert_eq!(
            config.chain_store_path(),
            PathBuf::from("/data/swimchain/chain")
        );
        assert_eq!(
            config.blob_store_path(),
            PathBuf::from("/data/swimchain/blobs")
        );
        assert_eq!(
            config.peer_store_path(),
            PathBuf::from("/data/swimchain/peers")
        );
        assert_eq!(
            config.contribution_store_path(),
            PathBuf::from("/data/swimchain/contribution")
        );
    }
}
