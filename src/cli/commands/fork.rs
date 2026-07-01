//! Fork management commands
//!
//! Implements create, list, switch, and info operations for forks.
//!
//! Forks allow communities to escape captured chains while preserving
//! identity and optionally content (VISION §5).

use crate::cli::commands::require_running_node_for_config;
use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::identity::{deserialize_portable, import_identity, KeyPair};
use crate::rpc::{RpcClient, RpcClientConfig};
use clap::Subcommand;
use serde::Serialize;
use serde_json::{json, Value};

/// Fork management commands
#[derive(Subcommand, Debug)]
pub enum ForkCmd {
    /// Create a new fork from the current chain
    #[command(
        about = "Create a new fork from the current chain",
        long_about = "Creates a new fork from the current chain state. This allows a community \
                      to escape a captured or hostile chain while preserving identities.\n\n\
                      Forks inherit the identity namespace (keys work across all forks per VISION §5) \
                      and can optionally inherit content based on the content mode.",
        after_help = "EXAMPLES:\n  sw fork create --name \"community-v2\" --description \"Fork away from spam\"\n  \
                      sw fork create --name \"clean-fork\" --exclude cs1badactor..."
    )]
    Create {
        /// Fork name (required)
        #[arg(long)]
        name: String,

        /// Fork description
        #[arg(long, default_value = "")]
        description: String,

        /// Identity to exclude from the fork (can specify multiple times)
        #[arg(long = "exclude")]
        excluded_ids: Vec<String>,

        /// Content inheritance mode: all, none, or selective
        #[arg(long, default_value = "all")]
        content_mode: String,
    },

    /// List all known forks
    #[command(
        about = "List all known forks",
        long_about = "Shows all forks known to this node, including the main chain \
                      and any community forks.",
        after_help = "EXAMPLES:\n  sw fork list\n  sw fork list --json"
    )]
    List {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Switch to a different fork
    #[command(
        about = "Switch to a different fork",
        long_about = "Changes the active fork for this node. Content and operations \
                      will be isolated to the selected fork.",
        after_help = "EXAMPLES:\n  sw fork switch main\n  sw fork switch fk1abc123..."
    )]
    Switch {
        /// Fork ID to switch to (or 'main' for main chain)
        #[arg()]
        fork_id: String,
    },

    /// Get information about a fork
    #[command(
        about = "Get fork information",
        long_about = "Shows detailed information about a specific fork including \
                      creation time, parent, and exclusion count.",
        after_help = "EXAMPLES:\n  sw fork info fk1abc123...\n  sw fork info main"
    )]
    Info {
        /// Fork ID to get info for (or 'main' for main chain)
        #[arg()]
        fork_id: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show the currently active fork
    #[command(
        about = "Show the currently active fork",
        long_about = "Displays which fork is currently active on this node.",
        after_help = "EXAMPLES:\n  sw fork active"
    )]
    Active {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },
}

/// JSON output for fork list
#[derive(Serialize)]
struct ForkListOutput {
    forks: Vec<ForkListItem>,
    count: usize,
    active: String,
}

#[derive(Serialize)]
struct ForkListItem {
    fork_id: String,
    name: String,
    is_active: bool,
}

/// JSON output for fork info
#[derive(Serialize)]
struct ForkInfoOutput {
    fork_id: String,
    name: String,
    description: String,
    parent_fork: Option<String>,
    parent_height: u64,
    creator: String,
    timestamp: u64,
    excluded_count: usize,
    supporter_count: usize,
}

/// JSON output for fork create
#[derive(Serialize)]
struct ForkCreateOutput {
    fork_id: String,
    name: String,
    description: String,
    inherited_content_count: u64,
    excluded_count: usize,
}

/// Execute a fork command
pub fn execute(cmd: ForkCmd, config: &mut CliConfig) -> Result<()> {
    match cmd {
        ForkCmd::Create {
            name,
            description,
            excluded_ids,
            content_mode,
        } => create(config, &name, &description, excluded_ids, &content_mode),
        ForkCmd::List { json } => list(config, json),
        ForkCmd::Switch { fork_id } => switch(config, &fork_id),
        ForkCmd::Info { fork_id, json } => info(config, &fork_id, json),
        ForkCmd::Active { json } => active(config, json),
    }
}

/// Get RPC client for the current config
fn get_rpc_client(config: &CliConfig) -> RpcClient {
    let rpc_config = if let Some(ref data_dir) = config.data_dir {
        RpcClientConfig::from_data_dir(data_dir).unwrap_or_else(|_| {
            RpcClientConfig::for_network(config.network_mode.name())
        })
    } else {
        RpcClientConfig::for_network(config.network_mode.name())
    };
    RpcClient::new(rpc_config)
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
    let password = match std::env::var("SWIMCHAIN_PASSWORD") {
        Ok(pwd) => {
            eprintln!("Using password from SWIMCHAIN_PASSWORD environment variable");
            pwd
        }
        Err(_) => {
            println!("Enter password to unlock identity:");
            rpassword::prompt_password("Password: ")
                .map_err(|e| CliError::Other(format!("Failed to read password: {e}")))?
        }
    };

    // Decrypt and return keypair
    let (keypair, _proof) = import_identity(&portable, &password)?;

    Ok(keypair)
}

/// Create a new fork
fn create(
    config: &mut CliConfig,
    name: &str,
    description: &str,
    excluded_ids: Vec<String>,
    content_mode: &str,
) -> Result<()> {
    require_running_node_for_config(config)?;

    // Load and decrypt identity
    println!("Loading identity...");
    let keypair = load_identity(config)?;

    // Extract secret key (32-byte seed from private key)
    let secret_key_hex = hex::encode(keypair.private_key.seed());

    // Validate content mode
    if !["all", "none", "selective"].contains(&content_mode) {
        return Err(CliError::Other(format!(
            "Invalid content mode: {}. Must be 'all', 'none', or 'selective'",
            content_mode
        )));
    }

    println!("Creating fork \"{}\"...", name);

    // Build RPC params with secret_key for signing
    let params = json!({
        "name": name,
        "description": description,
        "excluded_ids": excluded_ids,
        "content_mode": content_mode,
        "secret_key": secret_key_hex,
    });

    let mut rpc_client = get_rpc_client(config);
    let response = rpc_client
        .call("create_fork", params)
        .map_err(|e| CliError::NetworkError(e.to_string()))?;

    if response.is_error() {
        let msg = response
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(CliError::Other(msg));
    }

    if let Some(result) = response.result {
        let fork_id = result
            .get("fork_id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        let inherited = result
            .get("inherited_content_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let excluded = result
            .get("excluded_count")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        println!();
        println!("Fork created successfully!");
        println!("Fork ID: {}", fork_id);
        println!("Name: {}", name);
        if !description.is_empty() {
            println!("Description: {}", description);
        }
        println!(
            "Estimated inherited content: ~{} (content migration not yet implemented)",
            inherited
        );
        if excluded > 0 {
            println!("Excluded identities: {}", excluded);
        }
        println!();
        println!("To switch to this fork: sw fork switch {}", fork_id);
    }

    Ok(())
}

/// List all known forks
fn list(config: &CliConfig, json_output: bool) -> Result<()> {
    require_running_node_for_config(config)?;

    let mut rpc_client = get_rpc_client(config);
    let response = rpc_client
        .call("list_forks", Value::Null)
        .map_err(|e| CliError::NetworkError(e.to_string()))?;

    if response.is_error() {
        let msg = response
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(CliError::Other(msg));
    }

    if let Some(result) = response.result {
        let forks = result
            .get("forks")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let active = result
            .get("active_fork")
            .and_then(|v| v.as_str())
            .unwrap_or("main");

        if json_output {
            let items: Vec<ForkListItem> = forks
                .iter()
                .map(|f| ForkListItem {
                    fork_id: f
                        .get("fork_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    name: f
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    is_active: f
                        .get("fork_id")
                        .and_then(|v| v.as_str())
                        .map(|id| id == active)
                        .unwrap_or(false),
                })
                .collect();

            let output = ForkListOutput {
                count: items.len(),
                active: active.to_string(),
                forks: items,
            };
            crate::cli::output::print_json(&output)?;
        } else {
            println!("Known forks ({}):", forks.len());
            println!("  Active: {}", active);
            println!();
            for fork in &forks {
                let id = fork
                    .get("fork_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let name = fork
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unnamed");
                let marker = if id == active { " *" } else { "" };
                println!("  {} ({}){}", name, id, marker);
            }
        }
    }

    Ok(())
}

/// Switch to a different fork
fn switch(config: &CliConfig, fork_id: &str) -> Result<()> {
    require_running_node_for_config(config)?;

    // Normalize fork ID
    let target_id = if fork_id == "main" {
        "0000000000000000000000000000000000000000000000000000000000000000"
    } else {
        fork_id
    };

    let params = json!({
        "fork_id": target_id,
    });

    let mut rpc_client = get_rpc_client(config);
    let response = rpc_client
        .call("switch_fork", params)
        .map_err(|e| CliError::NetworkError(e.to_string()))?;

    if response.is_error() {
        let msg = response
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(CliError::Other(msg));
    }

    println!("Switched to fork: {}", fork_id);
    Ok(())
}

/// Get information about a fork
fn info(config: &CliConfig, fork_id: &str, json_output: bool) -> Result<()> {
    require_running_node_for_config(config)?;

    // Normalize fork ID
    let target_id = if fork_id == "main" {
        "0000000000000000000000000000000000000000000000000000000000000000"
    } else {
        fork_id
    };

    let params = json!({
        "fork_id": target_id,
    });

    let mut rpc_client = get_rpc_client(config);
    let response = rpc_client
        .call("get_fork_info", params)
        .map_err(|e| CliError::NetworkError(e.to_string()))?;

    if response.is_error() {
        let msg = response
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(CliError::Other(msg));
    }

    if let Some(result) = response.result {
        if json_output {
            let output = ForkInfoOutput {
                fork_id: result
                    .get("fork_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                name: result
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                description: result
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                parent_fork: result
                    .get("parent_fork")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                parent_height: result
                    .get("parent_height")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                creator: result
                    .get("creator")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string(),
                timestamp: result
                    .get("timestamp")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0),
                excluded_count: result
                    .get("excluded_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize,
                supporter_count: result
                    .get("supporter_count")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as usize,
            };
            crate::cli::output::print_json(&output)?;
        } else {
            let name = result
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let desc = result
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let parent = result
                .get("parent_fork")
                .and_then(|v| v.as_str());
            let parent_height = result
                .get("parent_height")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let creator = result
                .get("creator")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let excluded = result
                .get("excluded_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let supporters = result
                .get("supporter_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            println!("Fork: {} ({})", name, fork_id);
            if !desc.is_empty() {
                println!("Description: {}", desc);
            }
            if let Some(p) = parent {
                println!("Parent fork: {}", p);
                println!("Parent height: {}", parent_height);
            } else {
                println!("Parent: (none - this is the main chain)");
            }
            println!("Creator: {}", creator);
            println!("Excluded identities: {}", excluded);
            println!("Supporters: {}", supporters);
        }
    }

    Ok(())
}

/// Show the currently active fork
fn active(config: &CliConfig, json_output: bool) -> Result<()> {
    require_running_node_for_config(config)?;

    let mut rpc_client = get_rpc_client(config);
    let response = rpc_client
        .call("list_forks", Value::Null)
        .map_err(|e| CliError::NetworkError(e.to_string()))?;

    if response.is_error() {
        let msg = response
            .error
            .map(|e| e.message)
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(CliError::Other(msg));
    }

    if let Some(result) = response.result {
        let active = result
            .get("active_fork")
            .and_then(|v| v.as_str())
            .unwrap_or("main");

        if json_output {
            let output = json!({
                "active_fork": active,
            });
            crate::cli::output::print_json_pretty(&output)?;
        } else {
            println!("Active fork: {}", active);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_content_mode_validation() {
        // These should be valid
        assert!(["all", "none", "selective"].contains(&"all"));
        assert!(["all", "none", "selective"].contains(&"none"));
        assert!(["all", "none", "selective"].contains(&"selective"));

        // This should be invalid
        assert!(!["all", "none", "selective"].contains(&"invalid"));
    }
}
