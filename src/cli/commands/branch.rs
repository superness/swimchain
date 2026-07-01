//! Branch subscription commands (BRANCH_SELECTIVE_SYNC.md)
//!
//! Implements branch-selective sync management commands via RPC to running node.
//! These commands allow users to subscribe/unsubscribe from specific space branches
//! to reduce storage and bandwidth requirements.

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::output::format_bytes;
use crate::rpc::client::{RpcClient, RpcClientConfig};
use clap::Subcommand;
use serde::Serialize;

/// Branch subscription management commands
#[derive(Subcommand, Debug)]
pub enum BranchCmd {
    /// Subscribe to a space/branch for selective sync
    #[command(
        about = "Subscribe to a space/branch",
        long_about = "Subscribes to a specific space and branch path for selective synchronization. \
                      Only content from subscribed branches will be downloaded and stored.",
        after_help = "EXAMPLES:\n  sw branch subscribe --space abc123...\n  sw branch subscribe --space abc123... --branch left/right"
    )]
    Subscribe {
        /// Space ID to subscribe to (hex encoded)
        #[arg(long, short)]
        space: String,

        /// Branch path (e.g., 'left', 'right', 'left/right'). Defaults to root.
        #[arg(long, short, default_value = "")]
        branch: String,
    },

    /// Unsubscribe from a space/branch
    #[command(
        about = "Unsubscribe from a space/branch",
        long_about = "Removes a subscription from a specific space and branch. \
                      Content from this branch will no longer be downloaded.",
        after_help = "EXAMPLES:\n  sw branch unsubscribe --space abc123...\n  sw branch unsubscribe --space abc123... --branch left"
    )]
    Unsubscribe {
        /// Space ID to unsubscribe from (hex encoded)
        #[arg(long, short)]
        space: String,

        /// Branch path to unsubscribe. Defaults to root.
        #[arg(long, short, default_value = "")]
        branch: String,
    },

    /// List current branch subscriptions
    #[command(
        about = "List branch subscriptions",
        long_about = "Shows all currently active branch subscriptions with their storage usage.",
        after_help = "EXAMPLES:\n  sw branch list\n  sw branch list --json"
    )]
    List {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show branch subscription status
    #[command(
        about = "Show branch sync status",
        long_about = "Displays branch-selective sync status including storage budget, \
                      active subscriptions, and peer coverage.",
        after_help = "EXAMPLES:\n  sw branch status\n  sw branch status --json"
    )]
    Status {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Set storage budget for branch sync
    #[command(
        about = "Set storage budget",
        long_about = "Sets the maximum storage budget for branch subscriptions in bytes. \
                      Older/unused subscriptions may be pruned if budget is exceeded.",
        after_help = "EXAMPLES:\n  sw branch budget 10GB\n  sw branch budget 5000000000"
    )]
    Budget {
        /// Storage budget (e.g., '10GB', '5000000000')
        #[arg()]
        size: String,
    },
}

/// JSON output for branch list
#[derive(Serialize)]
struct BranchListOutput {
    subscriptions: Vec<SubscriptionInfo>,
    count: usize,
    total_storage_bytes: u64,
}

/// Subscription info for JSON output
#[derive(Serialize)]
struct SubscriptionInfo {
    space_id: String,
    branch_path: String,
    storage_bytes: u64,
    last_synced_height: u64,
    content_count: u32,
}

/// JSON output for branch status
#[derive(Serialize)]
struct BranchStatusOutput {
    subscription_count: usize,
    storage_used_bytes: u64,
    storage_budget_bytes: u64,
    peers_supporting_branch_sync: usize,
    note: String,
}

/// Execute a branch command
pub fn execute(cmd: BranchCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        BranchCmd::Subscribe { space, branch } => subscribe(config, &space, &branch),
        BranchCmd::Unsubscribe { space, branch } => unsubscribe(config, &space, &branch),
        BranchCmd::List { json } => list(config, json),
        BranchCmd::Status { json } => status(config, json),
        BranchCmd::Budget { size } => budget(config, &size),
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

/// Parse space ID from hex string
fn parse_space_id(space: &str) -> Result<[u8; 32]> {
    let space_trimmed = space.trim_start_matches("0x");

    if space_trimmed.len() != 64 {
        eprintln!("Error: Space ID must be 64 hex characters (32 bytes)");
        return Err(CliError::InvalidSpaceId("must be 64 hex characters".to_string()));
    }

    let mut bytes = [0u8; 32];
    hex::decode_to_slice(space_trimmed, &mut bytes)
        .map_err(|_| CliError::InvalidSpaceId("must be valid hex".to_string()))?;

    Ok(bytes)
}

/// Parse storage size string (e.g., "10GB", "500MB", "1000000000")
fn parse_storage_size(size: &str) -> Result<u64> {
    let size = size.trim().to_uppercase();

    if let Ok(bytes) = size.parse::<u64>() {
        return Ok(bytes);
    }

    // Parse with suffix
    if size.ends_with("GB") {
        let num: f64 = size.trim_end_matches("GB").parse()
            .map_err(|_| CliError::InvalidConfig("Invalid size format".to_string()))?;
        return Ok((num * 1_000_000_000.0) as u64);
    }

    if size.ends_with("MB") {
        let num: f64 = size.trim_end_matches("MB").parse()
            .map_err(|_| CliError::InvalidConfig("Invalid size format".to_string()))?;
        return Ok((num * 1_000_000.0) as u64);
    }

    if size.ends_with("KB") {
        let num: f64 = size.trim_end_matches("KB").parse()
            .map_err(|_| CliError::InvalidConfig("Invalid size format".to_string()))?;
        return Ok((num * 1_000.0) as u64);
    }

    Err(CliError::InvalidConfig("Invalid size format. Use bytes or suffix (KB, MB, GB)".to_string()))
}

/// Subscribe to a branch
fn subscribe(config: &CliConfig, space: &str, branch: &str) -> Result<()> {
    let space_id = parse_space_id(space)?;
    let mut client = get_rpc_client(config)?;

    println!("Subscribing to space {} branch '{}'...",
             &space[..16.min(space.len())],
             if branch.is_empty() { "root" } else { branch }
    );

    match client.call("branch_subscribe", serde_json::json!({
        "space_id": hex::encode(space_id),
        "branch_path": branch,
    })) {
        Ok(response) => {
            if response.is_error() {
                eprintln!("Subscription failed: {:?}", response.error);
            } else {
                println!("Successfully subscribed.");
                println!();
                println!("Content from this branch will now be synced automatically.");
                println!("Use 'sw branch list' to see all subscriptions.");
            }
        }
        Err(e) => {
            eprintln!("RPC error: {}", e);
            println!();
            println!("Note: Branch subscription requires the node to be running.");
            println!("Start with: sw node start");
        }
    }

    Ok(())
}

/// Unsubscribe from a branch
fn unsubscribe(config: &CliConfig, space: &str, branch: &str) -> Result<()> {
    let space_id = parse_space_id(space)?;
    let mut client = get_rpc_client(config)?;

    println!("Unsubscribing from space {} branch '{}'...",
             &space[..16.min(space.len())],
             if branch.is_empty() { "root" } else { branch }
    );

    match client.call("branch_unsubscribe", serde_json::json!({
        "space_id": hex::encode(space_id),
        "branch_path": branch,
    })) {
        Ok(response) => {
            if response.is_error() {
                eprintln!("Unsubscription failed: {:?}", response.error);
            } else {
                println!("Successfully unsubscribed.");
                println!();
                println!("Content from this branch will no longer be synced.");
            }
        }
        Err(e) => {
            eprintln!("RPC error: {}", e);
        }
    }

    Ok(())
}

/// List branch subscriptions
fn list(config: &CliConfig, json_output: bool) -> Result<()> {
    let (subscriptions, total_storage, rpc_available) = match get_rpc_client(config) {
        Ok(mut client) => {
            match client.call("branch_list_subscriptions", serde_json::json!({})) {
                Ok(response) => {
                    if let Some(result) = response.result {
                        let subs: Vec<SubscriptionInfo> = result
                            .get("subscriptions")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter().filter_map(|v| {
                                    Some(SubscriptionInfo {
                                        space_id: v.get("space_id")?.as_str()?.to_string(),
                                        branch_path: v.get("branch_path")?.as_str()?.to_string(),
                                        storage_bytes: v.get("storage_bytes")?.as_u64()?,
                                        last_synced_height: v.get("last_synced_height")?.as_u64().unwrap_or(0),
                                        content_count: v.get("content_count")?.as_u64().unwrap_or(0) as u32,
                                    })
                                }).collect()
                            })
                            .unwrap_or_default();
                        let total = result.get("total_storage_bytes")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0);
                        (subs, total, true)
                    } else {
                        (Vec::new(), 0, true)
                    }
                }
                Err(_) => (Vec::new(), 0, false),
            }
        }
        Err(_) => (Vec::new(), 0, false),
    };

    if json_output {
        let output = BranchListOutput {
            count: subscriptions.len(),
            subscriptions,
            total_storage_bytes: total_storage,
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("Branch Subscriptions");
        println!("═══════════════════════════════════════");
        println!();

        if !rpc_available {
            println!("Node not running.");
            println!();
            println!("Start with: sw node start");
            return Ok(());
        }

        if subscriptions.is_empty() {
            println!("No active subscriptions.");
            println!();
            println!("Subscribe to a branch with:");
            println!("  sw branch subscribe --space <space_id>");
        } else {
            for sub in &subscriptions {
                let branch_display = if sub.branch_path.is_empty() {
                    "root".to_string()
                } else {
                    sub.branch_path.clone()
                };
                println!(
                    "  {}... / {} ({}, height {})",
                    &sub.space_id[..16],
                    branch_display,
                    format_bytes(sub.storage_bytes),
                    sub.last_synced_height
                );
            }
            println!();
            println!("{} subscription(s), total storage: {}",
                     subscriptions.len(),
                     format_bytes(total_storage)
            );
        }
    }

    Ok(())
}

/// Show branch sync status
fn status(config: &CliConfig, json_output: bool) -> Result<()> {
    let (sub_count, storage_used, storage_budget, peer_count, rpc_available) =
        match get_rpc_client(config) {
            Ok(mut client) => {
                match client.call("branch_sync_status", serde_json::json!({})) {
                    Ok(response) => {
                        if let Some(result) = response.result {
                            (
                                result.get("subscription_count").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                                result.get("storage_used_bytes").and_then(|v| v.as_u64()).unwrap_or(0),
                                result.get("storage_budget_bytes").and_then(|v| v.as_u64()).unwrap_or(0),
                                result.get("peers_supporting_branch_sync").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                                true,
                            )
                        } else {
                            (0, 0, 0, 0, true)
                        }
                    }
                    Err(_) => (0, 0, 0, 0, false),
                }
            }
            Err(_) => (0, 0, 0, 0, false),
        };

    if json_output {
        let output = BranchStatusOutput {
            subscription_count: sub_count,
            storage_used_bytes: storage_used,
            storage_budget_bytes: storage_budget,
            peers_supporting_branch_sync: peer_count,
            note: if rpc_available {
                "Connected to node via RPC.".to_string()
            } else {
                "Node not running. Start with: sw node start".to_string()
            },
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("Branch Sync Status");
        println!("═══════════════════════════════════════");
        println!();

        if !rpc_available {
            println!("Node not running.");
            println!();
            println!("Start with: sw node start");
            return Ok(());
        }

        println!("Subscriptions:      {}", sub_count);
        println!("Storage used:       {}", format_bytes(storage_used));
        println!("Storage budget:     {}", format_bytes(storage_budget));
        println!(
            "Usage:              {:.1}%",
            if storage_budget > 0 {
                (storage_used as f64 / storage_budget as f64) * 100.0
            } else {
                0.0
            }
        );
        println!();
        println!("Peers with branch sync:  {}", peer_count);
    }

    Ok(())
}

/// Set storage budget
fn budget(config: &CliConfig, size: &str) -> Result<()> {
    let budget_bytes = parse_storage_size(size)?;
    let mut client = get_rpc_client(config)?;

    println!("Setting storage budget to {}...", format_bytes(budget_bytes));

    match client.call("branch_set_budget", serde_json::json!({
        "budget_bytes": budget_bytes,
    })) {
        Ok(response) => {
            if response.is_error() {
                eprintln!("Failed to set budget: {:?}", response.error);
            } else {
                println!("Storage budget updated.");
                println!();
                println!("Note: Subscriptions may be pruned if current usage exceeds budget.");
            }
        }
        Err(e) => {
            eprintln!("RPC error: {}", e);
        }
    }

    Ok(())
}
