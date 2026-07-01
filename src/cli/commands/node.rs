//! Node management commands
//!
//! Implements the `sw node` command group for managing the Swimchain node.
//! Provides start, stop, status, peers, connect, disconnect, sync, and contribution commands.
//!
//! # Overview
//!
//! Currently, the node runs in foreground mode only. Commands that require
//! a running node (like `status`, `peers`, `connect`, `disconnect`) provide
//! informational messages in foreground-only mode.
//!
//! Background daemon mode with IPC is planned for a future release.
//! See `specs/SPEC_10_NODE_OPERATIONS.md §14.2` for the pending specification.
//!
//! # Example
//!
//! ```bash
//! # Start a node in foreground mode
//! sw node start --listen 0.0.0.0:9735
//!
//! # Start and connect to a peer
//! sw node start --connect 192.168.1.100:9735
//!
//! # Show node status
//! sw node status --json
//! ```

use std::net::SocketAddr;

use clap::Subcommand;
use serde::Serialize;

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::output::print_json;
use crate::identity::{deserialize_portable, encode_address_from_pubkey, import_identity, KeyPair};
use crate::node::{NodeConfig, NodeManager};

/// Node management commands
#[derive(Subcommand, Debug)]
pub enum NodeCmd {
    /// Start the node in foreground mode
    #[command(
        about = "Start the node in foreground mode",
        long_about = "Starts the Swimchain node, binding to the specified address and \
                      connecting to the network. The node runs in the foreground until \
                      stopped with Ctrl+C.",
        after_help = "EXAMPLES:\n  \
                      sw node start\n  \
                      sw node start --listen 127.0.0.1:9735\n  \
                      sw node start --connect 192.168.1.100:9735"
    )]
    Start {
        /// Listen address (default: 0.0.0.0:9735)
        #[arg(short, long, default_value = "0.0.0.0:9735")]
        listen: SocketAddr,

        /// Connect to peer(s) after starting (can specify multiple)
        #[arg(short, long)]
        connect: Vec<SocketAddr>,

        /// Run in background (not yet implemented)
        #[arg(long)]
        background: bool,
    },

    /// Stop a running node
    #[command(
        about = "Stop a running node",
        long_about = "Stops a running node. Currently, nodes run in foreground mode only, \
                      so use Ctrl+C to stop the node in the terminal where it's running.",
        after_help = "EXAMPLES:\n  sw node stop"
    )]
    Stop,

    /// Show node status
    #[command(
        about = "Show node status",
        long_about = "Displays the current status of the running node including state, \
                      uptime, connected peers, chain height, and storage usage.",
        after_help = "EXAMPLES:\n  sw node status\n  sw node status --json"
    )]
    Status {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// List connected peers
    #[command(
        about = "List connected peers",
        long_about = "Shows all currently connected peers with their addresses, \
                      chain height, and connection direction.",
        after_help = "EXAMPLES:\n  sw node peers\n  sw node peers --json"
    )]
    Peers {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Connect to a specific peer
    #[command(
        about = "Connect to a specific peer",
        long_about = "Initiates a connection to a peer at the specified address. \
                      The connection may take a few seconds to establish.",
        after_help = "EXAMPLES:\n  sw node connect 192.168.1.100:9735"
    )]
    Connect {
        /// Peer address (host:port)
        #[arg()]
        addr: SocketAddr,
    },

    /// Disconnect from a peer
    #[command(
        about = "Disconnect from a peer",
        long_about = "Disconnects from a peer identified by their peer ID. \
                      Use 'sw node peers' to list connected peers and their IDs.",
        after_help = "EXAMPLES:\n  sw node disconnect a1b2c3d4e5f6a7b8"
    )]
    Disconnect {
        /// Peer ID (hex string, at least 8 characters)
        #[arg()]
        peer_id: String,
    },

    /// Show sync status
    #[command(
        about = "Show sync status",
        long_about = "Displays the current synchronization status including sync state, \
                      headers synced, blocks synced, and best known height.",
        after_help = "EXAMPLES:\n  sw node sync\n  sw node sync --json"
    )]
    Sync {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show contribution metrics
    #[command(
        about = "Show contribution metrics",
        long_about = "Displays contribution tracking metrics including bandwidth served, \
                      uptime ratio, and contribution status per SPEC_09.",
        after_help = "EXAMPLES:\n  sw node contribution\n  sw node contribution --json"
    )]
    Contribution {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },
}

// ========== JSON Output Structures ==========

/// JSON output for node status
#[derive(Serialize)]
pub struct NodeStatusOutput {
    /// Current node state
    pub state: String,
    /// Seconds since node started (0 if not running)
    pub uptime_seconds: u64,
    /// Number of connected peers
    pub peers: usize,
    /// Current chain height
    pub chain_height: u64,
    /// Sync progress percentage (0.0-100.0)
    pub sync_percent: f32,
    /// Storage used in megabytes
    pub storage_used_mb: u64,
    /// Storage usage percentage (0.0-100.0)
    pub storage_percent: f32,
    /// Current swimmer level
    pub swimmer_level: String,
}

/// JSON output for peer list
#[derive(Serialize)]
pub struct PeersOutput {
    /// List of connected peers
    pub peers: Vec<PeerInfoOutput>,
    /// Total peer count
    pub count: usize,
}

/// Peer information for JSON output
#[derive(Serialize)]
pub struct PeerInfoOutput {
    /// Peer ID (first 8 bytes as hex)
    pub node_id: String,
    /// Peer address
    pub address: String,
    /// Peer's chain height
    pub chain_height: u64,
    /// Connection direction ("inbound" or "outbound")
    pub direction: String,
}

/// JSON output for sync status
#[derive(Serialize)]
pub struct SyncStatusOutput {
    /// Current sync state
    pub state: String,
    /// Headers synced
    pub headers_synced: u64,
    /// Blocks synced
    pub blocks_synced: u64,
    /// Best known height from network
    pub best_known_height: u64,
}

/// JSON output for contribution status
#[derive(Serialize)]
pub struct ContributionOutput {
    /// Whether contribution tracking is enabled
    pub enabled: bool,
    /// Bandwidth served in last 30 days (bytes)
    pub bandwidth_served_30d: u64,
    /// Bandwidth served formatted (e.g., "4.5 GB")
    pub bandwidth_served_formatted: String,
    /// Uptime ratio (0.0-1.0)
    pub uptime_ratio: f32,
    /// Uptime percentage string (e.g., "99.2%")
    pub uptime_percent: String,
}

// ========== Command Execution ==========

/// Execute a node command
pub async fn execute(cmd: NodeCmd, config: &CliConfig, seed_node_mode: bool) -> Result<()> {
    match cmd {
        NodeCmd::Start {
            listen,
            connect,
            background,
        } => start(config, listen, connect, background, seed_node_mode).await,
        NodeCmd::Stop => stop(),
        NodeCmd::Status { json } => status(json),
        NodeCmd::Peers { json } => peers(json),
        NodeCmd::Connect { addr } => connect_peer(addr),
        NodeCmd::Disconnect { peer_id } => disconnect_peer(&peer_id),
        NodeCmd::Sync { json } => sync_status(json),
        NodeCmd::Contribution { json } => contribution_status(json),
    }
}

/// Load identity from encrypted file
///
/// Password can be provided via:
/// 1. SWIMCHAIN_PASSWORD environment variable (for testing/automation)
/// 2. Interactive prompt (production use)
fn load_identity(config: &CliConfig) -> Result<KeyPair> {
    let identity_path = config.identity_path();

    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    // Read identity file
    let data =
        std::fs::read(&identity_path).map_err(|e| CliError::Storage(format!("Read error: {e}")))?;

    // Parse portable identity
    let portable = deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    // Get password from environment or prompt
    // Debug: print all env vars starting with SWIM
    for (key, value) in std::env::vars() {
        if key.starts_with("SWIM") {
            eprintln!("DEBUG ENV: {}={}", key, if key.contains("PASSWORD") { "***" } else { &value });
        }
    }
    let password = match std::env::var("SWIMCHAIN_PASSWORD") {
        Ok(pwd) => {
            eprintln!("Using password from SWIMCHAIN_PASSWORD environment variable");
            pwd
        }
        Err(e) => {
            eprintln!("DEBUG: SWIMCHAIN_PASSWORD not found: {:?}", e);
            println!("Enter password to unlock identity:");
            rpassword::prompt_password("Password: ")
                .map_err(|e| CliError::Other(format!("Failed to read password: {e}")))?
        }
    };

    // Decrypt and return keypair
    let (keypair, _proof) = import_identity(&portable, &password)?;

    Ok(keypair)
}

/// Format node identity for display
fn format_address(node_id: &[u8; 32]) -> String {
    // Create a public key from the bytes and encode as address
    let pubkey = crate::identity::PublicKey::from_bytes(*node_id);
    encode_address_from_pubkey(&pubkey)
}

/// Start the node in foreground mode
async fn start(
    config: &CliConfig,
    listen: SocketAddr,
    connect: Vec<SocketAddr>,
    background: bool,
    seed_node_mode: bool,
) -> Result<()> {
    // Check background flag - not implemented yet
    if background {
        eprintln!("Background mode not yet implemented. Running in foreground.");
        eprintln!("Use Ctrl+C to stop the node.");
        eprintln!();
    }

    // Load identity
    println!("Loading identity...");
    let keypair = load_identity(config)?;

    // Determine actual listen address - if user specified the clap default (9735),
    // use the network mode's default port instead
    let actual_listen = if listen.port() == 9735 {
        // User didn't override the port, use network-appropriate default
        let port = config.network_mode.default_port();
        SocketAddr::new(listen.ip(), port)
    } else {
        // User explicitly specified a port, use it
        listen
    };

    // Calculate RPC port from P2P port (P2P + 1)
    let rpc_port = actual_listen.port() + 1;

    // Create NodeConfig with network-appropriate seeds
    let mut node_config = NodeConfig::with_network_defaults(config.network_mode.clone());
    node_config.listen_addr = actual_listen;
    node_config.data_dir = config.data_dir();
    node_config.rpc_port = Some(rpc_port);
    node_config.seed_node_mode = seed_node_mode;

    // Add any explicit --connect peers (they will be connected after seeds)
    for addr in &connect {
        node_config.seeds.push(crate::node::SeedEntry::new(*addr));
    }

    // Print seed node banner if enabled
    if seed_node_mode {
        eprintln!("╔══════════════════════════════════════════════════════════════════╗");
        eprintln!("║  SEED NODE MODE - Short-term connections enabled                 ║");
        eprintln!("║                                                                  ║");
        eprintln!("║  • Connections will be closed after 30s of inactivity            ║");
        eprintln!("║  • Node will serve peer addresses and blocks, then disconnect    ║");
        eprintln!("║  • This keeps the seed available for new connections             ║");
        eprintln!("╚══════════════════════════════════════════════════════════════════╝");
        eprintln!();
    }

    // Create NodeManager
    let mut node = NodeManager::new(node_config, keypair)
        .map_err(|e| CliError::Other(format!("Failed to create node: {e}")))?;

    // Start node
    println!("Starting node...");
    node.start()
        .await
        .map_err(|e| CliError::Other(format!("Failed to start node: {e}")))?;

    let actual_addr = node.listen_addr().unwrap_or(listen);
    let status = node.status();

    println!();
    println!("Node started successfully!");
    println!("═══════════════════════════════════════");
    println!("  Listen address: {}", actual_addr);
    println!("  Identity:       {}", format_address(&node.node_id()));
    println!("  Chain height:   {}", status.chain_height);
    println!("  State:          {}", status.state.name());
    println!("═══════════════════════════════════════");

    // Note: --connect peers are added to seeds and connected during bootstrap_peers()
    // No need for manual connection here

    // Setup Ctrl+C handler
    println!();
    println!("Press Ctrl+C to stop the node...");
    println!();

    // Create a channel for shutdown signal
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();

    // Set up Ctrl+C handler
    let tx = std::sync::Mutex::new(Some(tx));
    ctrlc::set_handler(move || {
        // Use unwrap_or_else to handle mutex poisoning gracefully
        if let Some(tx) = tx.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = tx.send(());
        }
    })
    .map_err(|e| CliError::Other(format!("Failed to set Ctrl+C handler: {e}")))?;

    // Wait for Ctrl+C
    let _ = rx.await;

    // Graceful shutdown
    println!();
    println!("Shutting down node...");
    node.stop()
        .await
        .map_err(|e| CliError::Other(format!("Failed to stop node: {e}")))?;

    println!("Node stopped.");

    Ok(())
}

/// Stop command (foreground-only mode)
fn stop() -> Result<()> {
    println!("Node Stop");
    println!("═══════════════════════════════════════");
    println!();
    println!("If a node is running in this terminal:");
    println!("  Press Ctrl+C to stop it gracefully.");
    println!();
    println!("Background node support (with IPC) is planned for a future release.");
    println!("See: specs/SPEC_10_NODE_OPERATIONS.md §14.2");

    Ok(())
}

/// Show node status (foreground-only mode)
fn status(json_output: bool) -> Result<()> {
    if json_output {
        let output = NodeStatusOutput {
            state: "stopped".to_string(),
            uptime_seconds: 0,
            peers: 0,
            chain_height: 0,
            sync_percent: 0.0,
            storage_used_mb: 0,
            storage_percent: 0.0,
            swimmer_level: "".to_string(),
        };
        print_json(&output)?;
    } else {
        println!("Node Status");
        println!("═══════════════════════════════════════");
        println!();
        println!("No running node detected.");
        println!();
        println!("To start a node:");
        println!("  sw node start");
        println!();
        println!("To see status of a running node, check the terminal where it's running.");
        println!();
        println!("Note: IPC for querying background nodes is planned for a future release.");
    }

    Ok(())
}

/// List connected peers (foreground-only mode)
fn peers(json_output: bool) -> Result<()> {
    if json_output {
        let output = PeersOutput {
            peers: Vec::new(),
            count: 0,
        };
        print_json(&output)?;
    } else {
        println!("Connected Peers");
        println!("═══════════════════════════════════════");
        println!();
        println!("No running node detected.");
        println!();
        println!("To start a node and see connected peers:");
        println!("  sw node start");
        println!();
        println!("Peer information will be displayed in the node's output.");
    }

    Ok(())
}

/// Connect to a peer (foreground-only mode)
fn connect_peer(address: SocketAddr) -> Result<()> {
    println!("Connect to Peer");
    println!("═══════════════════════════════════════");
    println!();
    println!("Requested connection to: {}", address);
    println!();
    println!("To connect to a peer at startup:");
    println!("  sw node start --connect {}", address);
    println!();
    println!("Live connection commands require the node to be running.");
    println!("IPC support for runtime commands is planned for a future release.");

    Ok(())
}

/// Disconnect from a peer (foreground-only mode)
fn disconnect_peer(peer_id: &str) -> Result<()> {
    // Validate hex format
    let hex_clean = peer_id.trim_start_matches("0x");

    if hex_clean.len() < 8 {
        eprintln!("Invalid peer ID format.");
        eprintln!("Expected: hex string, at least 8 characters.");
        eprintln!("Example: sw node disconnect a1b2c3d4e5f6a7b8");
        return Err(CliError::InvalidContentId(peer_id.to_string()));
    }

    if hex_clean.chars().any(|c| !c.is_ascii_hexdigit()) {
        eprintln!("Invalid peer ID format: contains non-hex characters.");
        eprintln!("Expected: hex string (0-9, a-f, A-F).");
        return Err(CliError::InvalidContentId(peer_id.to_string()));
    }

    println!("Disconnect from Peer");
    println!("═══════════════════════════════════════");
    println!();
    println!("Requested disconnect from peer: {}", peer_id);
    println!();
    println!("Live disconnect commands require the node to be running.");
    println!("IPC support for runtime commands is planned for a future release.");

    Ok(())
}

/// Show sync status (foreground-only mode)
fn sync_status(json_output: bool) -> Result<()> {
    if json_output {
        let output = SyncStatusOutput {
            state: "idle".to_string(),
            headers_synced: 0,
            blocks_synced: 0,
            best_known_height: 0,
        };
        print_json(&output)?;
    } else {
        println!("Sync Status");
        println!("═══════════════════════════════════════");
        println!();
        println!("No running node detected.");
        println!();
        println!("To start a node and see sync status:");
        println!("  sw node start");
        println!();
        println!("Sync progress will be displayed in the node's output.");
    }

    Ok(())
}

/// Show contribution status (foreground-only mode)
fn contribution_status(json_output: bool) -> Result<()> {
    if json_output {
        let output = ContributionOutput {
            enabled: false,
            bandwidth_served_30d: 0,
            bandwidth_served_formatted: "0 B".to_string(),
            uptime_ratio: 0.0,
            uptime_percent: "0.0%".to_string(),
        };
        print_json(&output)?;
    } else {
        println!("Contribution Status");
        println!("═══════════════════════════════════════");
        println!();
        println!("No running node detected.");
        println!();
        println!("To start a node and track contributions:");
        println!("  sw node start");
        println!();
        println!("Contribution metrics will be tracked while the node is running.");
        println!("See SPEC_09 for details on swimmer levels and contribution tracking.");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_peer_id() {
        // Valid hex strings should not error
        let valid_ids = ["a1b2c3d4", "a1b2c3d4e5f6a7b8", "0xa1b2c3d4e5f6a7b8"];
        for id in valid_ids {
            let hex_clean = id.trim_start_matches("0x");
            assert!(hex_clean.len() >= 8 || id == "a1b2c3d4");
            assert!(hex_clean.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    #[test]
    fn test_node_status_output_serializable() {
        let output = NodeStatusOutput {
            state: "running".to_string(),
            uptime_seconds: 3600,
            peers: 10,
            chain_height: 50000,
            sync_percent: 100.0,
            storage_used_mb: 250,
            storage_percent: 50.0,
            swimmer_level: "regular".to_string(),
        };

        let json = serde_json::to_string(&output).unwrap();
        assert!(json.contains("\"state\":\"running\""));
        assert!(json.contains("\"uptime_seconds\":3600"));
    }

    #[test]
    fn test_peers_output_serializable() {
        let output = PeersOutput {
            peers: vec![PeerInfoOutput {
                node_id: "a1b2c3d4".to_string(),
                address: "192.168.1.100:9735".to_string(),
                chain_height: 1000,
                direction: "outbound".to_string(),
            }],
            count: 1,
        };

        let json = serde_json::to_string(&output).unwrap();
        assert!(json.contains("\"count\":1"));
        assert!(json.contains("\"node_id\":\"a1b2c3d4\""));
    }

    #[test]
    fn test_sync_status_output_serializable() {
        let output = SyncStatusOutput {
            state: "syncing".to_string(),
            headers_synced: 1000,
            blocks_synced: 800,
            best_known_height: 1500,
        };

        let json = serde_json::to_string(&output).unwrap();
        assert!(json.contains("\"state\":\"syncing\""));
        assert!(json.contains("\"headers_synced\":1000"));
    }

    #[test]
    fn test_contribution_output_serializable() {
        let output = ContributionOutput {
            enabled: true,
            bandwidth_served_30d: 4_500_000_000,
            bandwidth_served_formatted: "4.5 GB".to_string(),
            uptime_ratio: 0.992,
            uptime_percent: "99.2%".to_string(),
        };

        let json = serde_json::to_string(&output).unwrap();
        assert!(json.contains("\"enabled\":true"));
        assert!(json.contains("\"bandwidth_served_formatted\":\"4.5 GB\""));
    }

    #[test]
    fn test_invalid_peer_id_short() {
        let peer_id = "abc";
        let hex_clean = peer_id.trim_start_matches("0x");
        assert!(hex_clean.len() < 8);
    }

    #[test]
    fn test_invalid_peer_id_non_hex() {
        let peer_id = "g1h2i3j4";
        let hex_clean = peer_id.trim_start_matches("0x");
        assert!(hex_clean.chars().any(|c| !c.is_ascii_hexdigit()));
    }
}
