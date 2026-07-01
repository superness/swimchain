//! Sync/network commands
//!
//! Implements network synchronization commands via RPC to running node.

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::output::format_bytes;
use crate::rpc::client::{RpcClient, RpcClientConfig};
use clap::Subcommand;
use serde::Serialize;

/// Sync management commands
#[derive(Subcommand, Debug)]
pub enum SyncCmd {
    /// Show sync status
    #[command(
        about = "Show sync status",
        long_about = "Displays current synchronization status including connected peers, \
                      chain height, and storage usage.",
        after_help = "EXAMPLES:\n  sw sync status\n  sw sync status --json"
    )]
    Status {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Trigger immediate sync
    #[command(
        about = "Trigger immediate sync",
        long_about = "Requests an immediate synchronization with the network.",
        after_help = "EXAMPLES:\n  sw sync now"
    )]
    Now,

    /// List connected peers
    #[command(
        about = "List connected peers",
        long_about = "Shows all currently connected peers with their addresses and status.",
        after_help = "EXAMPLES:\n  sw sync peers\n  sw sync peers --json"
    )]
    Peers {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Connect to a specific peer
    #[command(
        about = "Connect to a specific peer",
        long_about = "Manually connect to a peer by address.",
        after_help = "EXAMPLES:\n  sw sync connect 192.168.1.100:9735"
    )]
    Connect {
        /// Peer address (host:port)
        #[arg()]
        address: String,
    },
}

/// JSON output for sync status
#[derive(Serialize)]
struct SyncStatusOutput {
    connected_peers: usize,
    local_chain_height: u64,
    tip_hash: Option<String>,
    best_known_height: u64,
    storage_used_bytes: u64,
    storage_target_bytes: u64,
    syncing: bool,
    sync_state: String,
    note: String,
    /// Mempool: accumulated PoW (seconds of work)
    mempool_pow: u64,
    /// Mempool: threshold PoW needed for block formation
    mempool_threshold: u64,
    /// Mempool: number of pending actions
    mempool_actions: u64,
    /// Mempool: seconds waiting for block formation
    mempool_waiting_secs: u64,
    /// Leader election: node identity (first 16 hex chars)
    #[serde(skip_serializing_if = "Option::is_none")]
    node_identity: Option<String>,
    /// Leader election: XOR distance from block seed
    #[serde(skip_serializing_if = "Option::is_none")]
    leader_distance: Option<u64>,
    /// Leader election: current eligibility threshold
    #[serde(skip_serializing_if = "Option::is_none")]
    leader_threshold: Option<u64>,
    /// Leader election: whether node is currently eligible
    #[serde(skip_serializing_if = "Option::is_none")]
    leader_eligible: Option<bool>,
    /// Leader election: estimated seconds until eligible
    #[serde(skip_serializing_if = "Option::is_none")]
    leader_eta_secs: Option<u64>,
}

/// JSON output for peer list
#[derive(Serialize)]
struct PeerListOutput {
    peers: Vec<PeerInfo>,
    count: usize,
    note: String,
}

/// Peer information
#[derive(Serialize)]
struct PeerInfo {
    peer_id: String,
    address: String,
    direction: String,
    connected_seconds: u64,
}

/// Execute a sync command
pub fn execute(cmd: SyncCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        SyncCmd::Status { json } => status(config, json),
        SyncCmd::Now => now(config),
        SyncCmd::Peers { json } => peers(config, json),
        SyncCmd::Connect { address } => connect(config, &address),
    }
}

/// Get RPC client for the current config
fn get_rpc_client(config: &CliConfig) -> Result<RpcClient> {
    let data_dir = config.data_dir();

    // Try to read RPC address from node's data directory
    let rpc_config = match RpcClientConfig::from_data_dir(&data_dir) {
        Ok(c) => c,
        Err(_) => {
            // Fall back to network default port
            let network = config.network_mode_str();
            RpcClientConfig::for_network(network)
        }
    };

    // Try to load cookie from data dir
    let rpc_config = match rpc_config.with_cookie_from(&data_dir) {
        Ok(c) => c,
        Err(_) => {
            // No cookie file - node probably not running
            return Err(CliError::NoNodeRunning);
        }
    };

    Ok(RpcClient::new(rpc_config))
}

/// Show sync status
fn status(config: &CliConfig, json_output: bool) -> Result<()> {
    // Calculate storage usage
    let data_dir = config.data_dir();
    let storage_used = if data_dir.exists() {
        estimate_dir_size(&data_dir).unwrap_or(0)
    } else {
        0
    };
    let storage_target = config.storage_target_mb * 1_000_000;

    // Try to get status from node via RPC
    let (connected_peers, local_height, tip_hash, sync_state, syncing, rpc_available, mempool_pow, mempool_threshold, mempool_actions, mempool_waiting_secs, node_identity, leader_distance, leader_threshold, leader_eligible, leader_eta_secs) =
        match get_rpc_client(config) {
            Ok(mut client) => {
                match (client.get_info(), client.get_sync_status()) {
                    (Ok(info), Ok(sync)) => (
                        info.peer_count,
                        info.block_height,
                        sync.tip_hash.clone(),
                        sync.state.clone(),
                        sync.chain_percent < 100 && sync.state != "synced",
                        true,
                        sync.mempool_pow,
                        sync.mempool_threshold,
                        sync.mempool_actions,
                        sync.mempool_waiting_secs,
                        sync.node_identity.clone(),
                        sync.leader_distance,
                        sync.leader_threshold,
                        sync.leader_eligible,
                        sync.leader_eta_secs,
                    ),
                    _ => (0, 0, None, "Unknown".to_string(), false, false, 0, 0, 0, 0, None, None, None, None, None),
                }
            }
            Err(_) => (0, 0, None, "Idle".to_string(), false, false, 0, 0, 0, 0, None, None, None, None, None),
        };

    if json_output {
        let output = SyncStatusOutput {
            connected_peers,
            local_chain_height: local_height,
            tip_hash,
            best_known_height: 0, // Not tracked in current sync state
            storage_used_bytes: storage_used,
            storage_target_bytes: storage_target,
            syncing,
            sync_state: sync_state.clone(),
            note: if rpc_available {
                "Connected to node via RPC.".to_string()
            } else {
                "Node not running. Start with: sw node start".to_string()
            },
            mempool_pow,
            mempool_threshold,
            mempool_actions,
            mempool_waiting_secs,
            node_identity,
            leader_distance,
            leader_threshold,
            leader_eligible,
            leader_eta_secs,
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("Sync Status");
        println!("═══════════════════════════════════════");
        println!();
        println!("Network:");
        if rpc_available {
            println!("  Connected peers:    {}", connected_peers);
            println!("  Sync state:         {}", sync_state);
        } else {
            println!("  Status:             Node not running");
            println!("  Start with:         sw node start");
        }
        println!("  Chain height:       {}", local_height);
        println!(
            "  Syncing:            {}",
            if syncing { "yes" } else { "no" }
        );
        println!();
        println!("Storage:");
        println!(
            "  Used:               {} / {}",
            format_bytes(storage_used),
            format_bytes(storage_target)
        );
        println!(
            "  Usage:              {:.1}%",
            if storage_target > 0 {
                (storage_used as f64 / storage_target as f64) * 100.0
            } else {
                0.0
            }
        );
    }

    Ok(())
}

/// Trigger immediate sync
fn now(config: &CliConfig) -> Result<()> {
    let mut client = get_rpc_client(config)?;

    println!("Requesting sync...");

    // Get current status first
    match client.get_sync_status() {
        Ok(status) => {
            println!();
            println!("Current sync state: {}", status.state);
            println!("Progress: {}%", status.chain_percent);
            println!("Peers: {}", status.peer_count);
            println!("Storage: {}/{} MB", status.storage_mb, status.storage_target_mb);
            println!();
            println!("Note: Continuous sync runs automatically while node is running.");
            println!("Content is synced via gossip protocol with connected peers.");
        }
        Err(e) => {
            eprintln!("Failed to get sync status: {}", e);
        }
    }

    Ok(())
}

/// List connected peers
fn peers(config: &CliConfig, json_output: bool) -> Result<()> {
    let (peer_list, rpc_available) = match get_rpc_client(config) {
        Ok(mut client) => {
            match client.get_peers() {
                Ok(peers) => {
                    let converted: Vec<PeerInfo> = peers
                        .into_iter()
                        .map(|p| PeerInfo {
                            peer_id: p.peer_id,
                            address: p.address,
                            direction: p.direction,
                            connected_seconds: p.connected_seconds,
                        })
                        .collect();
                    (converted, true)
                }
                Err(_) => (Vec::new(), false),
            }
        }
        Err(_) => (Vec::new(), false),
    };

    if json_output {
        let output = PeerListOutput {
            count: peer_list.len(),
            peers: peer_list,
            note: if rpc_available {
                "Connected to node via RPC.".to_string()
            } else {
                "Node not running. Start with: sw node start".to_string()
            },
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("Connected Peers");
        println!("═══════════════════════════════════════");
        println!();

        if !rpc_available {
            println!("Node not running.");
            println!();
            println!("Start with: sw node start");
            return Ok(());
        }

        if peer_list.is_empty() {
            println!("No peers connected.");
            println!();
            println!("Connect to peers with: sw sync connect <address>");
        } else {
            for peer in &peer_list {
                println!(
                    "  {} ({}) - {} for {}s",
                    &peer.peer_id[..16], peer.address, peer.direction, peer.connected_seconds
                );
            }
            println!();
            println!("{} peer(s) connected", peer_list.len());
        }
    }

    Ok(())
}

/// Connect to a specific peer
fn connect(config: &CliConfig, address: &str) -> Result<()> {
    // Validate address format
    if !address.contains(':') {
        eprintln!("Invalid address format. Expected host:port (e.g., 192.168.1.100:9735)");
        return Ok(());
    }

    let mut client = get_rpc_client(config)?;

    println!("Connecting to {}...", address);

    // RPC add_peer would be called here
    // For now, just show instructions since RPC integration is partial
    match client.call("add_peer", serde_json::json!({"address": address})) {
        Ok(response) => {
            if response.is_error() {
                eprintln!("Connection failed: {:?}", response.error);
            } else {
                println!("Connection initiated.");
                println!();
                println!("Use 'sw sync peers' to check connection status.");
            }
        }
        Err(e) => {
            eprintln!("RPC error: {}", e);
        }
    }

    Ok(())
}

/// Estimate directory size (simple recursive sum)
fn estimate_dir_size(path: &std::path::Path) -> std::io::Result<u64> {
    let mut size = 0;
    if path.is_dir() {
        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                size += entry.metadata()?.len();
            } else if path.is_dir() {
                size += estimate_dir_size(&path)?;
            }
        }
    }
    Ok(size)
}
