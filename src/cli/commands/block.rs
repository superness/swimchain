//! Block query commands
//!
//! Provides CLI commands to query block and action information from the chain store.

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::storage::chain::ChainStore;
use clap::Subcommand;
use serde::Serialize;

/// Block query commands
#[derive(Subcommand, Debug)]
pub enum BlockCmd {
    /// View a block by height or hash
    #[command(
        about = "View block information by height or hash",
        long_about = "Displays block details including hash, timestamp, and contained actions. \
                      Can query by height (for root blocks) or by hash.",
        after_help = "EXAMPLES:\n  sw block view 42\n  sw block view abc123...\n  sw block view abc123... --json"
    )]
    View {
        /// Block height (number) or hash (hex string)
        #[arg()]
        identifier: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// View an action by hash
    #[command(
        about = "View action information by content hash",
        long_about = "Displays action details including type, actor, timestamp, and PoW work. \
                      Actions are stored in content blocks and indexed by content hash.",
        after_help = "EXAMPLES:\n  sw block action abc123...\n  sw block action abc123... --json"
    )]
    Action {
        /// Action/content hash (hex string)
        #[arg()]
        hash: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Show chain statistics
    #[command(
        about = "Show chain storage statistics",
        long_about = "Displays counts of root blocks, space blocks, and content blocks, \
                      along with the latest height and total storage size."
    )]
    Stats {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// View a content block by hash
    #[command(
        about = "View content block details by hash",
        long_about = "Displays content block details including thread root, space, and all actions \
                      contained within. Use the content block hash from 'block view <height>'.",
        after_help = "EXAMPLES:\n  sw block content 128fbb91c091...\n  sw block content 128fbb91c091... --json"
    )]
    Content {
        /// Content block hash (64 hex chars)
        #[arg()]
        hash: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Debug engagement state (hearts, thumbs up, etc.)
    #[command(
        about = "List engagement actions and reaction counts",
        long_about = "Scans all content blocks for Engage actions and displays aggregated \
                      engagement statistics. Useful for debugging engagement sync across nodes.",
        after_help = "EXAMPLES:\n  sw block engagements\n  sw block engagements --content abc123...\n  sw block engagements --json"
    )]
    Engagements {
        /// Filter by content ID (optional)
        #[arg(long)]
        content: Option<String>,

        /// Show all individual engage actions (not just aggregated)
        #[arg(long)]
        verbose: bool,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },
}

// ============================================================================
// JSON Output Structs
// ============================================================================

#[derive(Serialize)]
struct RootBlockOutput {
    hash: String,
    height: u64,
    timestamp: u64,
    prev_root_hash: String,
    merkle_root: String,
    space_block_count: u32,
    space_block_hashes: Vec<String>,
    total_pow: u64,
    difficulty_target: u64,
}

#[derive(Serialize)]
struct SpaceBlockOutput {
    hash: String,
    space_id: String,
    timestamp: u64,
    prev_space_hash: Option<String>,
    merkle_root: String,
    content_block_count: u32,
    content_block_hashes: Vec<String>,
    total_pow: u64,
}

#[derive(Serialize)]
struct ContentBlockOutput {
    hash: String,
    thread_root_id: String,
    space_id: String,
    timestamp: u64,
    prev_content_hash: Option<String>,
    merkle_root: String,
    action_count: usize,
    actions: Vec<ActionSummary>,
    total_pow: u64,
    branch_path: String,
}

#[derive(Serialize)]
struct ActionSummary {
    hash: String,
    action_type: String,
    actor: String,
    timestamp: u64,
    content_hash: Option<String>,
    parent_id: Option<String>,
    pow_work: u64,
    emoji: Option<String>,
}

#[derive(Serialize)]
struct ActionOutput {
    hash: String,
    action_type: String,
    actor: String,
    timestamp: u64,
    content_hash: Option<String>,
    parent_id: Option<String>,
    pow_nonce: u64,
    pow_work: u64,
    pow_target: String,
    signature: String,
    emoji: Option<String>,
    // Block context
    found_in_block: Option<String>,
    space_id: Option<String>,
}

#[derive(Serialize)]
struct ChainStatsOutput {
    latest_height: Option<u64>,
    root_block_count: u64,
    space_block_count: u64,
    content_block_count: u64,
    total_bytes: u64,
    space_count: u64,
}

#[derive(Serialize)]
struct EngageActionInfo {
    content_hash: String,
    actor: String,
    timestamp: u64,
    pow_work: u64,
    emoji: Option<String>,
    block_hash: String,
}

#[derive(Serialize, Clone)]
struct ContentEngagementStats {
    content_hash: String,
    total_engagements: u32,
    total_pow_work: u64,
    unique_actors: u32,
    emoji_counts: std::collections::HashMap<String, u32>,
}

#[derive(Serialize)]
struct EngagementsOutput {
    total_engage_actions: u32,
    content_stats: Vec<ContentEngagementStats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actions: Option<Vec<EngageActionInfo>>,
}

/// Execute block command
pub fn execute(cmd: BlockCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        BlockCmd::View { identifier, json } => view_block(config, &identifier, json),
        BlockCmd::Action { hash, json } => view_action(config, &hash, json),
        BlockCmd::Stats { json } => show_stats(config, json),
        BlockCmd::Content { hash, json } => view_content_block(config, &hash, json),
        BlockCmd::Engagements {
            content,
            verbose,
            json,
        } => show_engagements(config, content.as_deref(), verbose, json),
    }
}

/// Open the chain store for the current config.
///
/// If a running node holds the sled lock, translate the cryptic OS error into
/// an actionable message pointing the user at RPC-routed commands.
fn open_chain_store(config: &CliConfig) -> Result<ChainStore> {
    let chain_path = config.data_dir().join("chain");
    ChainStore::open(&chain_path).map_err(|e| {
        let msg = e.to_string();
        let is_lock = msg.contains("could not acquire lock")
            || msg.contains("Resource temporarily unavailable")
            || msg.contains("another process has locked");
        if is_lock {
            CliError::Other(
                "Cannot open chain DB directly: a node is running and holds the database lock.\n\
                 Use RPC-routed commands instead:\n  \
                 sw block view <height>\n  \
                 sw block stats\n  \
                 sw block content <content-block-hash>\n  \
                 sw space browse\n\
                 Or stop the running node first."
                    .to_string(),
            )
        } else {
            CliError::Storage(msg)
        }
    })
}

/// Parse a hex string to bytes
fn parse_hex(s: &str) -> Result<Vec<u8>> {
    // Remove 0x prefix if present
    let clean = s.strip_prefix("0x").unwrap_or(s);
    hex::decode(clean).map_err(|e| CliError::Other(format!("Invalid hex: {}", e)))
}

/// Parse identifier as either height (number) or hash (hex)
fn parse_block_identifier(s: &str) -> Result<BlockIdentifier> {
    // Try parsing as a number first
    if let Ok(height) = s.parse::<u64>() {
        return Ok(BlockIdentifier::Height(height));
    }

    // Otherwise, treat as hex hash
    let bytes = parse_hex(s)?;
    if bytes.len() != 32 {
        return Err(CliError::Other(format!(
            "Block hash must be 32 bytes (64 hex chars), got {} bytes",
            bytes.len()
        )));
    }

    let mut hash = [0u8; 32];
    hash.copy_from_slice(&bytes);
    Ok(BlockIdentifier::Hash(hash))
}

enum BlockIdentifier {
    Height(u64),
    Hash([u8; 32]),
}

/// View block information
fn view_block(config: &CliConfig, identifier: &str, json_output: bool) -> Result<()> {
    let id = parse_block_identifier(identifier)?;

    // Try RPC first for height-based queries (when node is running)
    if let BlockIdentifier::Height(height) = &id {
        if let Ok(block) = try_rpc_get_block(config, *height) {
            if json_output {
                crate::cli::output::print_json_pretty(&block)?;
            } else {
                println!("Root Block (via RPC)");
                println!("====================");
                println!("Hash:             {}", block.hash);
                println!("Height:           {}", block.height);
                println!("Timestamp:        {}", block.timestamp);
                println!("Prev Root:        {}", block.prev_hash);
                println!("Total PoW:        {} seconds", block.total_pow);
                println!("Space Blocks:     {}", block.space_blocks.len());
                for (i, sb) in block.space_blocks.iter().enumerate() {
                    println!("\n  Space Block #{}", i);
                    println!("  Hash:           {}", sb.hash);
                    println!("  Space ID:       {}", sb.space_id);
                    println!("  Content Blocks: {}", sb.content_block_count);
                    for ch in &sb.content_hashes {
                        println!("    - {}", ch);
                    }
                }
            }
            return Ok(());
        }
    }

    // Fall back to direct DB access
    let store = open_chain_store(config)?;

    // Try to find the block
    match id {
        BlockIdentifier::Height(height) => {
            // Look up root block by height
            if let Some(hash) = store
                .get_root_hash_at_height(height)
                .map_err(|e| CliError::Storage(e.to_string()))?
            {
                if let Some(block) = store
                    .get_root_block(&hash)
                    .map_err(|e| CliError::Storage(e.to_string()))?
                {
                    print_root_block(&hash, &block, json_output);
                    return Ok(());
                }
            }
            Err(CliError::Other(format!(
                "No root block found at height {}",
                height
            )))
        }
        BlockIdentifier::Hash(hash) => {
            // Try root block first
            if let Some(block) = store
                .get_root_block(&hash)
                .map_err(|e| CliError::Storage(e.to_string()))?
            {
                print_root_block(&hash, &block, json_output);
                return Ok(());
            }

            // Try space block
            if let Some(block) = store
                .get_space_block(&hash)
                .map_err(|e| CliError::Storage(e.to_string()))?
            {
                print_space_block(&hash, &block, json_output);
                return Ok(());
            }

            // Try content block
            if let Some(block) = store
                .get_content_block(&hash)
                .map_err(|e| CliError::Storage(e.to_string()))?
            {
                print_content_block(&hash, &block, json_output);
                return Ok(());
            }

            Err(CliError::Other(format!(
                "No block found with hash {}",
                hex::encode(hash)
            )))
        }
    }
}

/// View action information by content hash
fn view_action(config: &CliConfig, hash_str: &str, json_output: bool) -> Result<()> {
    let store = open_chain_store(config)?;

    let bytes = parse_hex(hash_str)?;
    if bytes.len() != 32 {
        return Err(CliError::Other(format!(
            "Action hash must be 32 bytes (64 hex chars), got {} bytes",
            bytes.len()
        )));
    }

    let mut hash = [0u8; 32];
    hash.copy_from_slice(&bytes);

    // Look up content metadata first
    if let Some(metadata) = store
        .get_content_metadata(&hash)
        .map_err(|e| CliError::Storage(e.to_string()))?
    {
        // We found metadata - search for the full action in content blocks
        // This is a bit expensive but gives us full action details
        for block_result in store.iter_content_blocks() {
            let block = block_result.map_err(|e| CliError::Storage(e.to_string()))?;
            for action in &block.actions {
                if action.content_hash == Some(hash) {
                    print_action(action, Some(&block), json_output);
                    return Ok(());
                }
            }
        }

        // Metadata exists but full action not found - show what we have
        print_action_from_metadata(&hash, &metadata, json_output);
        return Ok(());
    }

    Err(CliError::Other(format!(
        "No action found with content hash {}",
        hex::encode(hash)
    )))
}

/// Show chain statistics
fn show_stats(config: &CliConfig, json_output: bool) -> Result<()> {
    // Try RPC first (for when node is running)
    if let Ok(stats) = try_rpc_chain_stats(config) {
        if json_output {
            let output = ChainStatsOutput {
                latest_height: stats.latest_height,
                root_block_count: stats.root_blocks,
                space_block_count: stats.space_blocks,
                content_block_count: stats.content_blocks,
                total_bytes: stats.total_storage_bytes,
                space_count: stats.registered_spaces,
            };
            crate::cli::output::print_json_pretty(&output)?;
        } else {
            println!("Chain Statistics (via RPC)");
            println!("==========================");
            if let Some(h) = stats.latest_height {
                println!("Latest height:       {}", h);
            } else {
                println!("Latest height:       (no blocks)");
            }
            println!("Root blocks:         {}", stats.root_blocks);
            println!("Space blocks:        {}", stats.space_blocks);
            println!("Content blocks:      {}", stats.content_blocks);
            println!("Registered spaces:   {}", stats.registered_spaces);
            println!(
                "Total storage:       {} bytes ({:.2} MB)",
                stats.total_storage_bytes,
                stats.total_storage_bytes as f64 / 1_048_576.0
            );
        }
        return Ok(());
    }

    // Fall back to direct DB access
    let store = open_chain_store(config)?;

    let latest_height = store
        .get_latest_height()
        .map_err(|e| CliError::Storage(e.to_string()))?;
    let root_count = store
        .root_block_count()
        .map_err(|e| CliError::Storage(e.to_string()))?;
    let space_count = store
        .space_block_count()
        .map_err(|e| CliError::Storage(e.to_string()))?;
    let content_count = store
        .content_block_count()
        .map_err(|e| CliError::Storage(e.to_string()))?;
    let total_bytes = store.total_bytes();
    let registered_spaces = store
        .space_count()
        .map_err(|e| CliError::Storage(e.to_string()))?;

    if json_output {
        let output = ChainStatsOutput {
            latest_height,
            root_block_count: root_count,
            space_block_count: space_count,
            content_block_count: content_count,
            total_bytes,
            space_count: registered_spaces,
        };
        crate::cli::output::print_json_pretty(&output)?;
    } else {
        println!("Chain Statistics");
        println!("================");
        if let Some(h) = latest_height {
            println!("Latest height:       {}", h);
        } else {
            println!("Latest height:       (no blocks)");
        }
        println!("Root blocks:         {}", root_count);
        println!("Space blocks:        {}", space_count);
        println!("Content blocks:      {}", content_count);
        println!("Registered spaces:   {}", registered_spaces);
        println!(
            "Total storage:       {} bytes ({:.2} MB)",
            total_bytes,
            total_bytes as f64 / 1_048_576.0
        );
    }

    Ok(())
}

/// Show engagement state across the chain
fn show_engagements(
    config: &CliConfig,
    content_filter: Option<&str>,
    verbose: bool,
    json_output: bool,
) -> Result<()> {
    // Try RPC first (when node is running)
    if let Ok(result) = try_rpc_get_engagements(config, content_filter, verbose) {
        return display_engagements_result(&result, verbose, json_output);
    }

    // Fall back to direct DB access
    use std::collections::{HashMap, HashSet};

    let store = open_chain_store(config)?;

    // Parse content filter if provided
    let filter_bytes: Option<[u8; 32]> = if let Some(filter) = content_filter {
        let clean = filter.strip_prefix("sha256:").unwrap_or(filter);
        let bytes = parse_hex(clean)?;
        if bytes.len() != 32 {
            return Err(CliError::Other(format!(
                "Content hash must be 32 bytes (64 hex chars), got {} bytes",
                bytes.len()
            )));
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        Some(arr)
    } else {
        None
    };

    // Collect all Engage actions
    let mut actions: Vec<EngageActionInfo> = Vec::new();
    let mut content_stats: HashMap<[u8; 32], (u32, u64, HashSet<[u8; 32]>, HashMap<String, u32>)> =
        HashMap::new();

    for block_result in store.iter_content_blocks() {
        let block = block_result.map_err(|e| CliError::Storage(e.to_string()))?;
        let block_hash = hex::encode(block.hash());

        for action in &block.actions {
            if action.action_type != crate::blocks::ActionType::Engage {
                continue;
            }

            // Get target content (stored in content_hash field for Engage actions)
            let target = match action.content_hash {
                Some(h) => h,
                None => continue,
            };

            // Apply filter if set
            if let Some(filter) = filter_bytes {
                if target != filter {
                    continue;
                }
            }

            // Build emoji string
            let emoji_str = action.emoji.map(|e| format_emoji(e));

            // Add to actions list if verbose
            actions.push(EngageActionInfo {
                content_hash: hex::encode(target),
                actor: hex::encode(action.actor),
                timestamp: action.timestamp,
                pow_work: action.pow_work,
                emoji: emoji_str.clone(),
                block_hash: block_hash.clone(),
            });

            // Update aggregated stats
            let entry = content_stats
                .entry(target)
                .or_insert_with(|| (0, 0, HashSet::new(), HashMap::new()));
            entry.0 += 1; // total engagements
            entry.1 += action.pow_work; // total pow work
            entry.2.insert(action.actor); // unique actors

            // Emoji counts
            if let Some(emoji) = action.emoji {
                let emoji_key = format_emoji(emoji);
                *entry.3.entry(emoji_key).or_insert(0) += 1;
            }
        }
    }

    // Build output
    let mut stats_list: Vec<ContentEngagementStats> = content_stats
        .into_iter()
        .map(
            |(hash, (count, pow, actors, emojis))| ContentEngagementStats {
                content_hash: hex::encode(hash),
                total_engagements: count,
                total_pow_work: pow,
                unique_actors: actors.len() as u32,
                emoji_counts: emojis,
            },
        )
        .collect();

    // Sort by total engagements (highest first)
    stats_list.sort_by(|a, b| b.total_engagements.cmp(&a.total_engagements));

    let total_count = actions.len() as u32;

    if json_output {
        let output = EngagementsOutput {
            total_engage_actions: total_count,
            content_stats: stats_list,
            actions: if verbose { Some(actions) } else { None },
        };
        crate::cli::output::print_json_pretty(&output)?;
    } else {
        println!("Engagement State");
        println!("================");
        println!("Total Engage actions: {}", total_count);
        println!("Content with engagements: {}", stats_list.len());
        println!();

        if stats_list.is_empty() {
            println!("No engagements found on this node.");
            println!();
            println!("To engage with content:");
            println!("  sw post engage sha256:<content_id> --emoji heart");
        } else {
            println!("Engagement by content:");
            println!("----------------------");

            for stats in &stats_list {
                let short_hash = &stats.content_hash[..16];
                println!();
                println!("Content: {}...", short_hash);
                println!(
                    "  Engagements: {} ({} unique users)",
                    stats.total_engagements, stats.unique_actors
                );
                println!("  Total PoW:   {} seconds", stats.total_pow_work);

                if !stats.emoji_counts.is_empty() {
                    let emoji_str: Vec<String> = stats
                        .emoji_counts
                        .iter()
                        .map(|(emoji, count)| {
                            format!("{}: {}", emoji.split(' ').next().unwrap_or(emoji), count)
                        })
                        .collect();
                    println!("  Reactions:   {}", emoji_str.join(", "));
                }
            }

            if verbose {
                println!();
                println!("Individual Actions:");
                println!("-------------------");
                for (i, action) in actions.iter().enumerate() {
                    let emoji_display = action.emoji.as_deref().unwrap_or("(none)");
                    println!(
                        "[{}] {} on {}...",
                        i,
                        emoji_display,
                        &action.content_hash[..16]
                    );
                    println!("    Actor: {}...", &action.actor[..16]);
                    println!(
                        "    PoW: {}s, Time: {}",
                        action.pow_work,
                        format_timestamp(action.timestamp)
                    );
                }
            }
        }
    }

    Ok(())
}

/// Try to get chain stats via RPC (when node is running)
fn try_rpc_chain_stats(
    config: &CliConfig,
) -> std::result::Result<crate::rpc::types::GetChainStatsResult, ()> {
    use crate::rpc::{RpcClient, RpcClientConfig};

    // Try to create config from data dir (reads .rpc_addr file)
    let data_dir = config.data_dir();
    let rpc_config = RpcClientConfig::from_data_dir(&data_dir)
        .and_then(|c| c.with_cookie_from(&data_dir))
        .map_err(|_| ())?;

    // Create RPC client and call get_chain_stats
    let mut client = RpcClient::new(rpc_config);
    client.get_chain_stats().map_err(|_| ())
}

/// Try to get block via RPC (when node is running)
fn try_rpc_get_block(
    config: &CliConfig,
    height: u64,
) -> std::result::Result<crate::rpc::types::GetBlockResult, ()> {
    use crate::rpc::{RpcClient, RpcClientConfig};

    // Try to create config from data dir (reads .rpc_addr file)
    let data_dir = config.data_dir();
    let rpc_config = RpcClientConfig::from_data_dir(&data_dir)
        .and_then(|c| c.with_cookie_from(&data_dir))
        .map_err(|_| ())?;

    // Create RPC client and call get_block
    let mut client = RpcClient::new(rpc_config);
    client.get_block(height).map_err(|_| ())
}

/// Try to get content block via RPC (when node is running)
fn try_rpc_get_content_block(
    config: &CliConfig,
    hash: &str,
) -> std::result::Result<crate::rpc::types::GetContentBlockResult, String> {
    use crate::rpc::{RpcClient, RpcClientConfig};

    // Try to create config from data dir (reads .rpc_addr file)
    let data_dir = config.data_dir();
    let rpc_config = RpcClientConfig::from_data_dir(&data_dir)
        .and_then(|c| c.with_cookie_from(&data_dir))
        .map_err(|e| e.to_string())?;

    // Create RPC client and call get_content_block
    let mut client = RpcClient::new(rpc_config);
    let response = client
        .call("get_content_block", serde_json::json!({"hash": hash}))
        .map_err(|e| e.to_string())?;

    if let Some(err) = response.error {
        return Err(format!("{} ({})", err.message, err.code));
    }

    let result = response.result.ok_or("No result in response")?;
    serde_json::from_value(result).map_err(|e| e.to_string())
}

/// Try to get chain engagements via RPC (when node is running)
fn try_rpc_get_engagements(
    config: &CliConfig,
    content_filter: Option<&str>,
    verbose: bool,
) -> std::result::Result<crate::rpc::types::GetChainEngagementsResult, String> {
    use crate::rpc::{RpcClient, RpcClientConfig};

    // Try to create config from data dir (reads .rpc_addr file)
    let data_dir = config.data_dir();
    let rpc_config = RpcClientConfig::from_data_dir(&data_dir)
        .and_then(|c| c.with_cookie_from(&data_dir))
        .map_err(|e| e.to_string())?;

    // Create RPC client and call get_chain_engagements
    let mut client = RpcClient::new(rpc_config);
    let response = client
        .call(
            "get_chain_engagements",
            serde_json::json!({
                "content_id": content_filter,
                "verbose": verbose
            }),
        )
        .map_err(|e| e.to_string())?;

    if let Some(err) = response.error {
        return Err(format!("{} ({})", err.message, err.code));
    }

    let result = response.result.ok_or("No result in response")?;
    serde_json::from_value(result).map_err(|e| e.to_string())
}

/// Display engagements result (shared between RPC and direct DB paths)
fn display_engagements_result(
    result: &crate::rpc::types::GetChainEngagementsResult,
    verbose: bool,
    json_output: bool,
) -> Result<()> {
    if json_output {
        crate::cli::output::print_json_pretty(&result)?;
    } else {
        println!("Engagement State (via RPC)");
        println!("==========================");
        println!("Total Engage actions: {}", result.total_engage_actions);
        println!("Content with engagements: {}", result.content_stats.len());
        println!();

        if result.content_stats.is_empty() {
            println!("No engagements found on this node.");
            println!();
            println!("To engage with content:");
            println!("  sw post engage sha256:<content_id> --emoji heart");
        } else {
            println!("Engagement by content:");
            println!("----------------------");

            for stats in &result.content_stats {
                let short_hash = &stats.content_hash[..16.min(stats.content_hash.len())];
                println!();
                println!("Content: {}...", short_hash);
                println!(
                    "  Engagements: {} ({} unique users)",
                    stats.total_engagements, stats.unique_actors
                );
                println!("  Total PoW:   {} seconds", stats.total_pow_work);

                if !stats.emoji_counts.is_empty() {
                    let emoji_str: Vec<String> = stats
                        .emoji_counts
                        .iter()
                        .map(|(emoji, count)| {
                            format!("{}: {}", emoji.split(' ').next().unwrap_or(emoji), count)
                        })
                        .collect();
                    println!("  Reactions:   {}", emoji_str.join(", "));
                }
            }

            if verbose {
                if let Some(actions) = &result.actions {
                    println!();
                    println!("Individual Actions:");
                    println!("-------------------");
                    for (i, action) in actions.iter().enumerate() {
                        let emoji_display = action.emoji.as_deref().unwrap_or("(none)");
                        let short_hash = &action.content_hash[..16.min(action.content_hash.len())];
                        println!("[{}] {} on {}...", i, emoji_display, short_hash);
                        println!(
                            "    Actor: {}...",
                            &action.actor[..16.min(action.actor.len())]
                        );
                        println!(
                            "    PoW: {}s, Time: {}",
                            action.pow_work,
                            format_timestamp(action.timestamp)
                        );
                    }
                }
            }
        }
    }

    Ok(())
}

/// View content block by hash
fn view_content_block(config: &CliConfig, hash: &str, json_output: bool) -> Result<()> {
    // Validate hash format
    if hash.len() != 64 || hex::decode(hash).is_err() {
        return Err(CliError::Other(
            "Content block hash must be 64 hex characters".into(),
        ));
    }

    // Try RPC first (when node is running)
    match try_rpc_get_content_block(config, hash) {
        Ok(result) => {
            if json_output {
                crate::cli::output::print_json_pretty(&result)?;
            } else {
                println!("Content Block (via RPC)");
                println!("=======================");
                println!("Hash:             {}", result.hash);
                println!("Thread Root:      {}", result.thread_root_id);
                println!("Space:            {}", result.space_id);
                println!("Timestamp:        {}", result.timestamp);
                println!("Total PoW:        {} seconds", result.total_pow);
                println!("Merkle Root:      {}", result.merkle_root);
                if let Some(ref prev) = result.prev_content_hash {
                    println!("Prev Block:       {}", prev);
                }
                println!("Actions:          {}", result.action_count);
                println!();

                for (i, action) in result.actions.iter().enumerate() {
                    let emoji_str = action
                        .emoji
                        .map(|e| format!(" (emoji: {})", emoji_to_char(e)))
                        .unwrap_or_default();
                    println!(
                        "  [{}] {} {}{}",
                        i, action.action_type, action.actor_address, emoji_str
                    );
                    if let Some(ref content_id) = action.content_id {
                        println!("      Content: {}", content_id);
                    }
                    if let Some(ref parent_id) = action.parent_id {
                        println!("      Parent:  {}", parent_id);
                    }
                    println!("      PoW:     {} seconds", action.pow_work);
                }
            }
            Ok(())
        }
        Err(e) => {
            // If RPC failed, try direct DB access (when node is not running)
            let store = open_chain_store(config)?;
            let hash_bytes: [u8; 32] = hex::decode(hash)
                .map_err(|e| CliError::Other(e.to_string()))?
                .try_into()
                .map_err(|_| CliError::Other("Invalid hash length".into()))?;

            match store.get_content_block(&hash_bytes) {
                Ok(Some(block)) => {
                    print_content_block(&hash_bytes, &block, json_output);
                    Ok(())
                }
                Ok(None) => Err(CliError::Other(format!(
                    "Content block not found: {}",
                    hash
                ))),
                Err(storage_err) => Err(CliError::Other(format!(
                    "RPC error: {}. Direct DB error: {}",
                    e, storage_err
                ))),
            }
        }
    }
}

/// Convert emoji code to character
fn emoji_to_char(code: u8) -> char {
    match code {
        1 => '❤',
        2 => '👍',
        3 => '👎',
        4 => '😂',
        5 => '🤔',
        6 => '🤯',
        7 => '🔥',
        8 => '🏊',
        _ => '?',
    }
}

// ============================================================================
// Print Functions
// ============================================================================

fn print_root_block(hash: &[u8; 32], block: &crate::blocks::RootBlock, json_output: bool) {
    if json_output {
        let output = RootBlockOutput {
            hash: hex::encode(hash),
            height: block.height,
            timestamp: block.timestamp,
            prev_root_hash: hex::encode(block.prev_root_hash),
            merkle_root: hex::encode(block.merkle_root),
            space_block_count: block.space_block_count,
            space_block_hashes: block.space_block_hashes.iter().map(hex::encode).collect(),
            total_pow: block.total_pow,
            difficulty_target: block.difficulty_target,
        };
        if let Err(e) = crate::cli::output::print_json_pretty(&output) {
            eprintln!("JSON serialization error: {}", e);
        }
    } else {
        println!("Root Block");
        println!("==========");
        println!("Hash:             {}", hex::encode(hash));
        println!("Height:           {}", block.height);
        println!(
            "Timestamp:        {} ({})",
            block.timestamp,
            format_timestamp(block.timestamp)
        );
        println!("Prev Root:        {}", hex::encode(block.prev_root_hash));
        println!("Merkle Root:      {}", hex::encode(block.merkle_root));
        println!("Space Blocks:     {}", block.space_block_count);
        println!("Total PoW:        {} seconds", block.total_pow);
        println!("Difficulty:       {}", block.difficulty_target);

        if !block.space_block_hashes.is_empty() {
            println!("\nSpace Block Hashes:");
            for (i, h) in block.space_block_hashes.iter().enumerate() {
                println!("  [{}] {}", i, hex::encode(h));
            }
        }
    }
}

fn print_space_block(hash: &[u8; 32], block: &crate::blocks::SpaceBlock, json_output: bool) {
    if json_output {
        let output = SpaceBlockOutput {
            hash: hex::encode(hash),
            space_id: hex::encode(block.space_id),
            timestamp: block.timestamp,
            prev_space_hash: block.prev_space_hash.map(|h| hex::encode(h)),
            merkle_root: hex::encode(block.merkle_root),
            content_block_count: block.content_block_count,
            content_block_hashes: block.content_block_hashes.iter().map(hex::encode).collect(),
            total_pow: block.total_pow,
        };
        if let Err(e) = crate::cli::output::print_json_pretty(&output) {
            eprintln!("JSON serialization error: {}", e);
        }
    } else {
        println!("Space Block");
        println!("===========");
        println!("Hash:             {}", hex::encode(hash));
        println!("Space ID:         {}", hex::encode(block.space_id));
        println!(
            "Timestamp:        {} ({})",
            block.timestamp,
            format_timestamp(block.timestamp)
        );
        if let Some(prev) = block.prev_space_hash {
            println!("Prev Space:       {}", hex::encode(prev));
        }
        println!("Merkle Root:      {}", hex::encode(block.merkle_root));
        println!("Content Blocks:   {}", block.content_block_count);
        println!("Total PoW:        {} seconds", block.total_pow);

        if !block.content_block_hashes.is_empty() {
            println!("\nContent Block Hashes:");
            for (i, h) in block.content_block_hashes.iter().enumerate() {
                println!("  [{}] {}", i, hex::encode(h));
            }
        }
    }
}

fn print_content_block(hash: &[u8; 32], block: &crate::blocks::ContentBlock, json_output: bool) {
    let actions: Vec<ActionSummary> = block
        .actions
        .iter()
        .map(|a| ActionSummary {
            hash: hex::encode(a.hash()),
            action_type: format_action_type(a.action_type),
            actor: hex::encode(a.actor),
            timestamp: a.timestamp,
            content_hash: a.content_hash.map(|h| hex::encode(h)),
            parent_id: a.parent_id.map(|h| hex::encode(h)),
            pow_work: a.pow_work,
            emoji: a.emoji.map(format_emoji),
        })
        .collect();

    if json_output {
        let output = ContentBlockOutput {
            hash: hex::encode(hash),
            thread_root_id: hex::encode(block.thread_root_id),
            space_id: hex::encode(block.space_id),
            timestamp: block.timestamp,
            prev_content_hash: block.prev_content_hash.map(|h| hex::encode(h)),
            merkle_root: hex::encode(block.merkle_root),
            action_count: block.actions.len(),
            actions,
            total_pow: block.total_pow,
            branch_path: format!("{:?}", block.branch_path),
        };
        if let Err(e) = crate::cli::output::print_json_pretty(&output) {
            eprintln!("JSON serialization error: {}", e);
        }
    } else {
        println!("Content Block");
        println!("=============");
        println!("Hash:             {}", hex::encode(hash));
        println!("Thread Root:      {}", hex::encode(block.thread_root_id));
        println!("Space ID:         {}", hex::encode(block.space_id));
        println!(
            "Timestamp:        {} ({})",
            block.timestamp,
            format_timestamp(block.timestamp)
        );
        if let Some(prev) = block.prev_content_hash {
            println!("Prev Content:     {}", hex::encode(prev));
        }
        println!("Merkle Root:      {}", hex::encode(block.merkle_root));
        println!("Total PoW:        {} seconds", block.total_pow);
        println!("Branch Path:      {:?}", block.branch_path);
        println!("Actions:          {}", block.actions.len());

        if !block.actions.is_empty() {
            println!("\nActions:");
            for (i, a) in block.actions.iter().enumerate() {
                println!(
                    "  [{}] {} by {} at {}",
                    i,
                    format_action_type(a.action_type),
                    &hex::encode(a.actor)[..16],
                    format_timestamp(a.timestamp)
                );
                if let Some(ch) = a.content_hash {
                    println!("      Content: {}", hex::encode(ch));
                }
                if let Some(p) = a.parent_id {
                    println!("      Parent:  {}", hex::encode(p));
                }
                println!("      PoW:     {} seconds", a.pow_work);
                if let Some(e) = a.emoji {
                    println!("      Emoji:   {}", format_emoji(e));
                }
            }
        }
    }
}

fn print_action(
    action: &crate::blocks::Action,
    block: Option<&crate::blocks::ContentBlock>,
    json_output: bool,
) {
    if json_output {
        let output = ActionOutput {
            hash: hex::encode(action.hash()),
            action_type: format_action_type(action.action_type),
            actor: hex::encode(action.actor),
            timestamp: action.timestamp,
            content_hash: action.content_hash.map(|h| hex::encode(h)),
            parent_id: action.parent_id.map(|h| hex::encode(h)),
            pow_nonce: action.pow_nonce,
            pow_work: action.pow_work,
            pow_target: hex::encode(action.pow_target),
            signature: hex::encode(action.signature),
            emoji: action.emoji.map(format_emoji),
            found_in_block: block.map(|b| hex::encode(b.hash())),
            space_id: block.map(|b| hex::encode(b.space_id)),
        };
        if let Err(e) = crate::cli::output::print_json_pretty(&output) {
            eprintln!("JSON serialization error: {}", e);
        }
    } else {
        println!("Action");
        println!("======");
        println!("Hash:             {}", hex::encode(action.hash()));
        println!(
            "Type:             {}",
            format_action_type(action.action_type)
        );
        println!("Actor:            {}", hex::encode(action.actor));
        println!(
            "Timestamp:        {} ({})",
            action.timestamp,
            format_timestamp(action.timestamp)
        );
        if let Some(ch) = action.content_hash {
            println!("Content Hash:     {}", hex::encode(ch));
        }
        if let Some(p) = action.parent_id {
            println!("Parent ID:        {}", hex::encode(p));
        }
        println!("PoW Nonce:        {}", action.pow_nonce);
        println!("PoW Work:         {} seconds", action.pow_work);
        println!("PoW Target:       {}", hex::encode(action.pow_target));
        println!(
            "Signature:        {}...",
            &hex::encode(action.signature)[..32]
        );
        if let Some(e) = action.emoji {
            println!("Emoji:            {}", format_emoji(e));
        }
        if let Some(b) = block {
            println!("\nBlock Context:");
            println!("  Block Hash:     {}", hex::encode(b.hash()));
            println!("  Space ID:       {}", hex::encode(b.space_id));
        }
    }
}

fn print_action_from_metadata(
    hash: &[u8; 32],
    metadata: &crate::storage::chain::ContentIndexEntry,
    json_output: bool,
) {
    let action_type = match metadata.content_type {
        0 => "Post",
        1 => "Reply",
        2 => "Engage",
        3 => "CreateSpace",
        _ => "Unknown",
    };

    if json_output {
        let output = serde_json::json!({
            "content_hash": hex::encode(hash),
            "action_type": action_type,
            "actor": hex::encode(metadata.author),
            "timestamp": metadata.timestamp,
            "parent_hash": if metadata.parent_hash == [0u8; 32] { None } else { Some(hex::encode(metadata.parent_hash)) },
            "space_id": hex::encode(metadata.space_id),
            "note": "Full action data not found in content blocks"
        });
        if let Err(e) = crate::cli::output::print_json_pretty(&output) {
            eprintln!("JSON serialization error: {}", e);
        }
    } else {
        println!("Action (from metadata index)");
        println!("============================");
        println!("Content Hash:     {}", hex::encode(hash));
        println!("Type:             {}", action_type);
        println!("Actor:            {}", hex::encode(metadata.author));
        println!(
            "Timestamp:        {} ({})",
            metadata.timestamp,
            format_timestamp(metadata.timestamp)
        );
        if metadata.parent_hash != [0u8; 32] {
            println!("Parent:           {}", hex::encode(metadata.parent_hash));
        }
        println!("Space ID:         {}", hex::encode(metadata.space_id));
        println!("\nNote: Full action data not found in content blocks");
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

fn format_action_type(t: crate::blocks::ActionType) -> String {
    match t {
        crate::blocks::ActionType::CreateSpace => "CreateSpace".to_string(),
        crate::blocks::ActionType::Post => "Post".to_string(),
        crate::blocks::ActionType::Reply => "Reply".to_string(),
        crate::blocks::ActionType::Engage => "Engage".to_string(),
        crate::blocks::ActionType::Edit => "Edit".to_string(),
        // Private space actions
        crate::blocks::ActionType::Invite => "Invite".to_string(),
        crate::blocks::ActionType::Leave => "Leave".to_string(),
        crate::blocks::ActionType::Kick => "Kick".to_string(),
        crate::blocks::ActionType::RevokeInvite => "RevokeInvite".to_string(),
        crate::blocks::ActionType::KeyRotation => "KeyRotation".to_string(),
        crate::blocks::ActionType::DMRequest => "DMRequest".to_string(),
        crate::blocks::ActionType::AcceptDM => "AcceptDM".to_string(),
        crate::blocks::ActionType::DeclineDM => "DeclineDM".to_string(),
        // Sponsorship actions
        crate::blocks::ActionType::Sponsor => "Sponsor".to_string(),
        crate::blocks::ActionType::GenesisRegister => "GenesisRegister".to_string(),
        // Space metadata actions
        crate::blocks::ActionType::RenameSpace => "RenameSpace".to_string(),
        // Network isolation actions
        crate::blocks::ActionType::FrequencyDrift => "FrequencyDrift".to_string(),
    }
}

fn format_emoji(e: u8) -> String {
    match e {
        1 => "❤️ (heart)".to_string(),
        2 => "👍 (thumbsup)".to_string(),
        3 => "👎 (thumbsdown)".to_string(),
        4 => "😂 (laugh)".to_string(),
        5 => "🤔 (thinking)".to_string(),
        6 => "🤯 (mindblown)".to_string(),
        7 => "🔥 (fire)".to_string(),
        8 => "🏊 (swimming)".to_string(),
        _ => format!("(unknown: {})", e),
    }
}

fn format_timestamp(ts: u64) -> String {
    use std::time::{Duration, UNIX_EPOCH};

    let datetime = UNIX_EPOCH + Duration::from_secs(ts);
    if let Ok(d) = datetime.duration_since(UNIX_EPOCH) {
        // Format as ISO-8601 ish
        let secs = d.as_secs();
        let days = secs / 86400;
        let years = days / 365 + 1970;
        let remaining_days = days % 365;
        let months = remaining_days / 30 + 1;
        let day = remaining_days % 30 + 1;
        let hours = (secs % 86400) / 3600;
        let mins = (secs % 3600) / 60;
        let s = secs % 60;
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
            years, months, day, hours, mins, s
        )
    } else {
        "invalid".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_block_identifier_height() {
        let id = parse_block_identifier("42").unwrap();
        match id {
            BlockIdentifier::Height(h) => assert_eq!(h, 42),
            _ => panic!("Expected height"),
        }
    }

    #[test]
    fn test_parse_block_identifier_hash() {
        let hash_hex = "0".repeat(64);
        let id = parse_block_identifier(&hash_hex).unwrap();
        match id {
            BlockIdentifier::Hash(h) => assert_eq!(h, [0u8; 32]),
            _ => panic!("Expected hash"),
        }
    }

    #[test]
    fn test_parse_block_identifier_hash_with_prefix() {
        let hash_hex = format!("0x{}", "ab".repeat(32));
        let id = parse_block_identifier(&hash_hex).unwrap();
        match id {
            BlockIdentifier::Hash(h) => assert_eq!(h, [0xab; 32]),
            _ => panic!("Expected hash"),
        }
    }

    #[test]
    fn test_format_emoji() {
        assert!(format_emoji(1).contains("heart"));
        assert!(format_emoji(2).contains("thumbsup"));
        assert!(format_emoji(8).contains("swimming"));
    }
}
