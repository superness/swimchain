//! Space management commands
//!
//! Implements create, join, leave, and list operations for spaces.
//!
//! Space creation is gated by PoW only (level system removed).

use crate::cli::commands::require_running_node_for_config;
use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::output::short_address;
use crate::cli::progress::PowProgress;
use crate::content::decay::calculate_decay_state;
use crate::crypto::action_pow::{difficulty, ActionType, ForkPoWConfig, PoWChallenge};
use crate::network::NetworkContext;
use crate::rpc::{RpcClient, RpcClientConfig, ListSpaceContentParams};
use crate::storage::content::PersistentContentStore;
use crate::types::constants::HALF_LIFE_SECS;
use crate::types::content::{ContentType, SpaceId};
use bech32::{Bech32m, Hrp};
use clap::Subcommand;
use serde::Serialize;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

/// Space ID prefix
const SPACE_HRP: &str = "sp";

/// Create an RPC client for the running node
fn create_rpc_client(config: &CliConfig) -> Result<RpcClient> {
    let data_dir = config.data_dir();

    // Try to read RPC address from node's data directory
    let rpc_config = match RpcClientConfig::from_data_dir(&data_dir) {
        Ok(c) => c,
        Err(_) => {
            // Fall back to network default port
            let network_mode = NetworkContext::mode();
            let rpc_port = network_mode.default_rpc_port();
            let addr = format!("127.0.0.1:{}", rpc_port).parse()
                .map_err(|e| CliError::Other(format!("Invalid RPC address: {}", e)))?;
            RpcClientConfig {
                addr,
                ..Default::default()
            }
        }
    };

    let cookie = fs::read_to_string(data_dir.join(".cookie"))
        .map_err(|e| CliError::Other(format!("Failed to read RPC cookie: {}. Is the node running?", e)))?;

    let rpc_config = RpcClientConfig {
        cookie: Some(cookie),
        ..rpc_config
    };

    Ok(RpcClient::new(rpc_config))
}

/// Space management commands
#[derive(Subcommand, Debug)]
pub enum SpaceCmd {
    /// Create a new space
    #[command(
        about = "Create a new space",
        long_about = "Creates a new space with proof-of-work. This operation takes approximately \
                      60 seconds due to the PoW requirement for Sybil resistance.",
        after_help = "EXAMPLES:\n  sw space create --name \"Rust Programming\"\n  \
                      sw --regtest space create --name \"Test Space\""
    )]
    Create {
        /// Space name (for display purposes)
        #[arg(long)]
        name: String,

        /// Skip PoW for faster creation (regtest only)
        #[arg(long, hide = true)]
        no_pow: bool,
    },

    /// Join a space (add to followed list)
    #[command(
        about = "Join a space",
        long_about = "Adds a space to your followed spaces list. Content from followed spaces \
                      will be prioritized for syncing.",
        after_help = "EXAMPLES:\n  sw space join sp1xxxxx..."
    )]
    Join {
        /// Space ID to join
        #[arg()]
        space_id: String,
    },

    /// Leave a space (remove from followed list)
    #[command(
        about = "Leave a space",
        long_about = "Removes a space from your followed spaces list.",
        after_help = "EXAMPLES:\n  sw space leave sp1xxxxx..."
    )]
    Leave {
        /// Space ID to leave
        #[arg()]
        space_id: String,
    },

    /// List followed spaces
    #[command(
        about = "List followed spaces",
        long_about = "Shows all spaces you are currently following.",
        after_help = "EXAMPLES:\n  sw space list\n  sw space list --json"
    )]
    List {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Browse all spaces on the chain
    #[command(
        about = "Browse all spaces on the chain",
        long_about = "Lists all spaces registered on the blockchain. Requires a running node.",
        after_help = "EXAMPLES:\n  sw space browse\n  sw space browse --json"
    )]
    Browse {
        /// Maximum number of spaces to show
        #[arg(long, default_value = "50")]
        limit: usize,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// View content in a space
    #[command(
        about = "View content in a space",
        long_about = "Lists posts in a space. Shows local content by default, \
                      or fetches from network with --fetch flag.",
        after_help = "EXAMPLES:\n  sw space view sp1xxx...\n  sw space view sp1xxx... --fetch"
    )]
    View {
        /// Space ID to view
        #[arg()]
        space_id: String,

        /// Fetch from network if not found locally (requires running node)
        #[arg(long)]
        fetch: bool,

        /// Maximum number of posts to show
        #[arg(long, default_value = "20")]
        limit: usize,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },
}

/// JSON output for space list
#[derive(Serialize)]
struct SpaceListOutput {
    spaces: Vec<String>,
    count: usize,
}

/// JSON output for space create
#[derive(Serialize)]
struct SpaceCreateOutput {
    space_id: String,
    name: String,
}

/// JSON output for space view content item
#[derive(Serialize)]
struct SpaceContentItem {
    content_id: String,
    content_type: String,
    author: String,
    title: String,
    preview: String,
    created_at: u64,
    heat: f64,
}

/// JSON output for space view
#[derive(Serialize)]
struct SpaceViewOutput {
    space_id: String,
    total: usize,
    items: Vec<SpaceContentItem>,
}

/// Validate a space ID format
fn validate_space_id(id: &str) -> Result<[u8; 16]> {
    if !id.starts_with("sp1") {
        return Err(CliError::InvalidSpaceId(id.into()));
    }

    let (hrp, data) = bech32::decode(id).map_err(|_| CliError::InvalidSpaceId(id.into()))?;

    if hrp.as_str() != SPACE_HRP {
        return Err(CliError::InvalidSpaceId(id.into()));
    }

    // Skip version byte, get the 16-byte space ID
    if data.len() < 17 {
        return Err(CliError::InvalidSpaceId(id.into()));
    }

    let mut space_bytes = [0u8; 16];
    space_bytes.copy_from_slice(&data[1..17]);
    Ok(space_bytes)
}

/// Encode a space ID from bytes
fn encode_space_id(bytes: &[u8; 16]) -> String {
    let hrp = Hrp::parse(SPACE_HRP).expect("valid HRP");
    let mut data = Vec::with_capacity(17);
    data.push(0); // version byte
    data.extend_from_slice(bytes);
    bech32::encode::<Bech32m>(hrp, &data).expect("valid encoding")
}

/// Execute a space command
pub fn execute(cmd: SpaceCmd, config: &mut CliConfig) -> Result<()> {
    match cmd {
        SpaceCmd::Create { name, no_pow } => create(config, &name, no_pow),
        SpaceCmd::Join { space_id } => join(config, &space_id),
        SpaceCmd::Leave { space_id } => leave(config, &space_id),
        SpaceCmd::List { json } => list(config, json),
        SpaceCmd::Browse { limit, json } => browse(config, limit, json),
        SpaceCmd::View { space_id, fetch, limit, json } => view(config, &space_id, fetch, limit, json),
    }
}

/// Create a new space
fn create(config: &mut CliConfig, name: &str, no_pow: bool) -> Result<()> {
    // Require a running node - no ephemeral clients allowed
    require_running_node_for_config(config)?;

    // Verify identity exists
    let identity_path = config.identity_path();
    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    // Read identity to get public key
    let data = fs::read(&identity_path)?;
    let portable = crate::identity::deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    // Space creation is PoW-gated only (level system removed)

    // Determine difficulty based on network mode
    // Mainnet: full difficulty (22 bits, ~60 seconds)
    // Testnet: reduced difficulty (12 bits, ~instant)
    // Regtest: minimal difficulty (4 bits, instant)
    let network_mode = NetworkContext::mode();
    let base_difficulty = if no_pow || cfg!(feature = "cli-testing") {
        4 // Very low for testing
    } else {
        difficulty::SPACE_CREATION // 22 bits per SPEC_03
    };
    let pow_difficulty = network_mode.adjusted_difficulty(base_difficulty);

    println!(
        "Creating space \"{}\"... (difficulty: {} bits, network: {})",
        name,
        pow_difficulty,
        network_mode.name()
    );

    // Create space ID from hash of name + random bytes
    let mut space_id_bytes = [0u8; 16];
    {
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut space_id_bytes);
    }

    // Create PoW challenge
    let challenge = PoWChallenge::generate(
        ActionType::SpaceCreation,
        name.as_bytes(),
        &portable.public_key,
        pow_difficulty,
    );

    // Get PoW config based on network mode and settings
    // Regtest and testnet use lighter configs for faster testing
    let pow_config = match network_mode {
        crate::network::NetworkMode::Regtest => {
            ForkPoWConfig::test() // 1 MiB, 1 iteration - instant
        }
        crate::network::NetworkMode::Testnet => {
            ForkPoWConfig::testnet() // 8 MiB, 1 iteration - fast for testing
        }
        crate::network::NetworkMode::Mainnet => {
            match config.pow_parallelism {
                2 => ForkPoWConfig::mobile(),
                4 => ForkPoWConfig::production(),
                _ => ForkPoWConfig::production(),
            }
        }
    };

    // Mine PoW with cancellation support
    let solution = if pow_difficulty >= 16 {
        // High difficulty - show progress and support cancellation
        let progress = PowProgress::new("Creating space", 60);

        let result = crate::crypto::action_pow::compute_pow_cancellable(
            &challenge,
            &pow_config,
            |nonce| {
                progress.update(nonce);
            },
            || progress.is_cancelled(),
        );

        match result {
            Ok(solution) => {
                progress.finish_success("Space created");
                solution
            }
            Err(crate::types::error::ActionPowError::Cancelled) => {
                progress.finish_cancelled();
                return Err(CliError::PowCancelled);
            }
            Err(e) => {
                progress.finish_error(&e.to_string());
                return Err(CliError::Other(e.to_string()));
            }
        }
    } else {
        // Low difficulty (regtest/testnet) - just run directly
        crate::crypto::action_pow::compute_pow(&challenge, &pow_config)
            .map_err(|e| CliError::Other(e.to_string()))?
    };

    // Use the PoW hash as part of the space ID for uniqueness
    space_id_bytes.copy_from_slice(&solution.hash[..16]);

    let space_id = encode_space_id(&space_id_bytes);

    // Use the timestamp from the PoW challenge (NOT current time)
    // This is critical: the verifier needs the exact same timestamp to recompute the hash
    let challenge_timestamp = solution.challenge.timestamp;

    // Sign the space creation (space_id || name || timestamp)
    let mut message = Vec::with_capacity(16 + name.len() + 8);
    message.extend_from_slice(&space_id_bytes);
    message.extend_from_slice(name.as_bytes());
    message.extend_from_slice(&challenge_timestamp.to_be_bytes());

    // Get password and decrypt private key for signing
    let password = crate::cli::commands::identity::prompt_password(false)?;
    let private_key = crate::identity::decrypt_private_key(&portable.encrypted_private_key, &password)
        .map_err(|e| CliError::Other(format!("Failed to decrypt identity: {e}")))?;
    let signature = crate::identity::sign(&private_key, &message);

    // Call RPC to register space on-chain
    let mut rpc_client = create_rpc_client(config)?;

    let rpc_params = serde_json::json!({
        "name": name,
        "creator_id": hex::encode(portable.public_key),
        "pow_nonce": solution.nonce,
        "pow_difficulty": pow_difficulty,
        "pow_nonce_space": hex::encode(solution.challenge.nonce_space),
        "pow_hash": hex::encode(solution.hash),
        "signature": hex::encode(signature.as_bytes()),
        "timestamp": challenge_timestamp,
    });

    let response = rpc_client.call("create_space", rpc_params)
        .map_err(|e| CliError::RpcError(e.to_string()))?;

    if let Some(err) = response.error {
        return Err(CliError::RpcError(format!("{} ({})", err.message, err.code)));
    }

    // Auto-join the space the user just created and store the name locally
    if !config.followed_spaces.contains(&space_id) {
        config.followed_spaces.push(space_id.clone());
    }
    config.space_names.insert(space_id.clone(), name.to_string());
    config.save()?;

    println!();
    println!("Space created successfully!");
    println!("Space ID: {space_id}");
    println!("Name: {name}");
    println!();
    println!("Share this Space ID with others so they can join.");

    Ok(())
}

/// Join a space
fn join(config: &mut CliConfig, space_id: &str) -> Result<()> {
    // Validate space ID format
    let _ = validate_space_id(space_id)?;

    // Check if already following
    if config.followed_spaces.contains(&space_id.to_string()) {
        println!("Already following space: {space_id}");
        return Ok(());
    }

    // Add to followed spaces
    config.followed_spaces.push(space_id.to_string());
    config.save()?;

    println!("Joined space: {space_id}");
    Ok(())
}

/// Leave a space
fn leave(config: &mut CliConfig, space_id: &str) -> Result<()> {
    // Validate space ID format
    let _ = validate_space_id(space_id)?;

    // Check if following
    let pos = config.followed_spaces.iter().position(|s| s == space_id);
    match pos {
        Some(i) => {
            config.followed_spaces.remove(i);
            config.save()?;
            println!("Left space: {space_id}");
        }
        None => {
            println!("Not following space: {space_id}");
        }
    }

    Ok(())
}

/// List followed spaces
fn list(config: &CliConfig, json: bool) -> Result<()> {
    if json {
        let output = SpaceListOutput {
            count: config.followed_spaces.len(),
            spaces: config.followed_spaces.clone(),
        };
        crate::cli::output::print_json(&output)?;
    } else {
        if config.followed_spaces.is_empty() {
            println!("Not following any spaces.");
            println!();
            println!("Use 'sw space join <space_id>' to follow a space.");
        } else {
            println!("Followed spaces ({}):", config.followed_spaces.len());
            for space in &config.followed_spaces {
                println!("  {space}");
            }
        }
    }

    Ok(())
}

/// Browse all spaces on the chain via RPC
fn browse(config: &CliConfig, limit: usize, json_output: bool) -> Result<()> {
    let mut rpc_client = create_rpc_client(config)?;

    let response = rpc_client.call("list_spaces", serde_json::json!({
        "limit": limit,
        "offset": 0
    })).map_err(|e| CliError::RpcError(e.to_string()))?;

    if response.is_error() {
        if let Some(err) = response.error {
            return Err(CliError::RpcError(format!("{} ({})", err.message, err.code)));
        }
    }

    let result = response.result.ok_or_else(|| {
        CliError::RpcError("No result in response".to_string())
    })?;

    let spaces = result.get("spaces").and_then(|v| v.as_array());
    let total = result.get("total").and_then(|v| v.as_u64()).unwrap_or(0);

    if json_output {
        crate::cli::output::print_json_pretty(&result)?;
    } else {
        if let Some(spaces) = spaces {
            if spaces.is_empty() {
                println!("No spaces found on chain.");
            } else {
                println!("Spaces on chain ({} total):", total);
                println!("════════════════════════════════════════════════════════════");
                println!();

                for space in spaces {
                    let space_id = space.get("space_id").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let name = space.get("name").and_then(|v| v.as_str());
                    let post_count = space.get("post_count").and_then(|v| v.as_u64()).unwrap_or(0);

                    if let Some(name) = name {
                        println!("  {} \"{}\"", space_id, name);
                    } else {
                        println!("  {}", space_id);
                    }
                    println!("    Posts: {}", post_count);
                    println!();
                }
            }
        } else {
            println!("No spaces found on chain.");
        }
    }

    Ok(())
}

/// View content in a space via RPC (when node is running)
fn view_via_rpc(config: &CliConfig, space_id: &str, limit: usize, json: bool) -> Result<()> {
    let mut rpc_client = create_rpc_client(config)?;

    let params = ListSpaceContentParams {
        space_id: space_id.to_string(),
        limit,
        offset: 0,
        sort: "recent".to_string(),
        content_type: None,
    };

    let response = rpc_client.call("list_space_content", serde_json::to_value(&params).map_err(|e| CliError::Other(format!("JSON serialization error: {}", e)))?)
        .map_err(|e| CliError::RpcError(e.to_string()))?;

    if response.is_error() {
        if let Some(err) = response.error {
            return Err(CliError::RpcError(format!("{} ({})", err.message, err.code)));
        }
    }

    let result = response.result.ok_or_else(|| {
        CliError::RpcError("No result in response".to_string())
    })?;

    // Parse items from RPC response
    let content_items = result.get("items").and_then(|v| v.as_array());
    let total = result.get("total").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut items: Vec<SpaceContentItem> = Vec::new();

    if let Some(content_items) = content_items {
        for item in content_items {
            let content_id = item.get("content_id").and_then(|v| v.as_str()).unwrap_or("");
            let content_type = item.get("content_type").and_then(|v| v.as_str()).unwrap_or("Post");
            let author_id = item.get("author_id").and_then(|v| v.as_str()).unwrap_or("");
            let body = item.get("body").and_then(|v| v.as_str()).unwrap_or("");
            let body_preview = item.get("body_preview").and_then(|v| v.as_str()).unwrap_or(body);
            let title = item.get("title").and_then(|v| v.as_str());
            let created_at = item.get("created_at").and_then(|v| v.as_u64()).unwrap_or(0);
            let survival = item.get("survival_probability").and_then(|v| v.as_f64()).unwrap_or(1.0);

            // Use title if present, otherwise extract from body_preview
            let (display_title, preview) = if let Some(t) = title {
                (t.to_string(), body_preview.to_string())
            } else if let Some(idx) = body_preview.find("\n\n") {
                (body_preview[..idx].to_string(), body_preview[idx + 2..].to_string())
            } else {
                (body_preview.to_string(), String::new())
            };

            // Truncate preview
            let preview = if preview.len() > 100 {
                format!("{}...", &preview[..100])
            } else {
                preview
            };

            items.push(SpaceContentItem {
                content_id: content_id.to_string(),
                content_type: content_type.to_string(),
                author: short_address(author_id),
                title: display_title,
                preview,
                created_at,
                heat: survival * 100.0,
            });
        }
    }

    // Output results
    if json {
        let output = SpaceViewOutput {
            space_id: space_id.to_string(),
            total,
            items,
        };
        crate::cli::output::print_json(&output)?;
    } else {
        if items.is_empty() {
            println!("No content in space: {}", short_address(space_id));
            println!();
            println!("This space has no content on the network yet.");
        } else {
            println!("Space: {} ({} posts)", short_address(space_id), total);
            println!("═══════════════════════════════════════════════════════════════");
            println!();

            for item in items {
                // Calculate time ago
                let age_secs = now.saturating_sub(item.created_at);
                let time_ago = if age_secs < 60 {
                    "just now".to_string()
                } else if age_secs < 3600 {
                    format!("{}m ago", age_secs / 60)
                } else if age_secs < 86400 {
                    format!("{}h ago", age_secs / 3600)
                } else {
                    format!("{}d ago", age_secs / 86400)
                };

                let type_badge = match item.content_type.as_str() {
                    "Reply" => "[Reply] ",
                    "Quote" => "[Quote] ",
                    _ => "",
                };

                println!("{}{}", type_badge, item.title);
                println!("  {} • {} • Heat: {:.0}%", item.author, time_ago, item.heat);
                if !item.preview.is_empty() {
                    println!("  {}", item.preview);
                }
                println!("  ID: {}", short_address(&item.content_id));
                println!();
            }
        }
    }

    Ok(())
}

/// View content in a space
fn view(config: &CliConfig, space_id: &str, fetch: bool, limit: usize, json: bool) -> Result<()> {
    // Validate space ID format
    let space_bytes = validate_space_id(space_id)?;

    // Check if node is running - if so, use RPC
    let data_dir = config.data_dir();
    if data_dir.join(".rpc_addr").exists() {
        return view_via_rpc(config, space_id, limit, json);
    }

    // Node not running - use direct DB access
    // Get current timestamp
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // First try to list local content
    let db_path = data_dir.join("content_db");
    let blob_path = data_dir.join("content_blobs");

    // Create directories if they don't exist
    fs::create_dir_all(&db_path)?;
    fs::create_dir_all(&blob_path)?;

    let store = PersistentContentStore::open(&db_path, &blob_path)
        .map_err(|e| CliError::Other(format!("Failed to open content store: {e}")))?;

    // Build space ID to match against
    // The space_id bytes from bech32 are 16 bytes, but SpaceId is 32 bytes
    // Need to match on the prefix
    let mut full_space_id = [0u8; 32];
    full_space_id[..16].copy_from_slice(&space_bytes);

    // Collect matching content
    let mut items: Vec<SpaceContentItem> = Vec::new();
    let mut total = 0usize;

    for result in store.iter_content() {
        if let Ok(item) = result {
            // Check if space matches (first 16 bytes)
            let item_space = item.space_id.as_bytes();
            if item_space[..16] == space_bytes[..] {
                total += 1;

                if items.len() >= limit {
                    continue;
                }

                // Extract title and preview from body
                let body_text = item.body_inline.as_deref().unwrap_or("");
                let (title, preview) = if let Some(idx) = body_text.find("\n\n") {
                    (&body_text[..idx], &body_text[idx + 2..])
                } else {
                    (body_text, "")
                };

                // Truncate preview
                let preview = if preview.len() > 100 {
                    format!("{}...", &preview[..100])
                } else {
                    preview.to_string()
                };

                // Format author ID
                let author_hex = hex::encode(item.author_id.as_bytes());
                let author_short = format!("sw1{}...{}", &author_hex[..4], &author_hex[author_hex.len() - 4..]);

                // Calculate heat
                let decay_state = calculate_decay_state(&item, now, HALF_LIFE_SECS);
                let heat = decay_state.survival_probability * 100.0;

                // Content type string
                let content_type = match item.content_type {
                    ContentType::Post => "Post",
                    ContentType::Reply => "Reply",
                    ContentType::Quote => "Quote",
                    ContentType::Edit => "Edit",
                };

                items.push(SpaceContentItem {
                    content_id: format!("sha256:{}", hex::encode(item.content_id.as_bytes())),
                    content_type: content_type.to_string(),
                    author: author_short,
                    title: title.to_string(),
                    preview,
                    created_at: item.created_at,
                    heat,
                });
            }
        }
    }

    // If no local content and fetch is enabled, try to get from network
    if total == 0 && fetch {
        println!("No local content for this space. Fetching from network...");

        // Create RPC client
        let data_dir = config.data_dir();
        let rpc_config = match RpcClientConfig::from_data_dir(&data_dir) {
            Ok(c) => c,
            Err(_) => {
                let network_mode = NetworkContext::mode();
                let rpc_port = network_mode.default_rpc_port();
                let addr = format!("127.0.0.1:{}", rpc_port).parse()
                    .map_err(|e| CliError::Other(format!("Invalid RPC address: {}", e)))?;
                RpcClientConfig {
                    addr,
                    ..Default::default()
                }
            }
        };

        let cookie = fs::read_to_string(data_dir.join(".cookie"))
            .map_err(|_| CliError::Other("No running node. Start with 'sw node start'".to_string()))?;

        let rpc_config = RpcClientConfig {
            cookie: Some(cookie),
            ..rpc_config
        };

        let mut rpc_client = RpcClient::new(rpc_config);

        // Call list_space_content RPC
        let params = ListSpaceContentParams {
            space_id: space_id.to_string(),
            limit,
            offset: 0,
            sort: "recent".to_string(),
            content_type: None,
        };

        match rpc_client.call("list_space_content", serde_json::to_value(&params).map_err(|e| CliError::Other(format!("JSON serialization error: {}", e)))?) {
            Ok(response) => {
                if response.is_error() {
                    if let Some(err) = response.error {
                        return Err(CliError::Other(format!("RPC error: {}", err.message)));
                    }
                } else if let Some(result) = response.result {
                    // Parse result and display
                    let content_items = result.get("items").and_then(|v| v.as_array());
                    let result_total = result.get("total").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                    if let Some(content_items) = content_items {
                        total = result_total;
                        for item in content_items {
                            let content_id = item.get("content_id").and_then(|v| v.as_str()).unwrap_or("");
                            let content_type = item.get("content_type").and_then(|v| v.as_str()).unwrap_or("Post");
                            let author_id = item.get("author_id").and_then(|v| v.as_str()).unwrap_or("");
                            let body_preview = item.get("body_preview").and_then(|v| v.as_str()).unwrap_or("");
                            let created_at = item.get("created_at").and_then(|v| v.as_u64()).unwrap_or(0);

                            // Parse title from preview
                            let (title, preview) = if let Some(idx) = body_preview.find("\n\n") {
                                (&body_preview[..idx], &body_preview[idx + 2..])
                            } else {
                                (body_preview, "")
                            };

                            items.push(SpaceContentItem {
                                content_id: content_id.to_string(),
                                content_type: content_type.to_string(),
                                author: short_address(author_id),
                                title: title.to_string(),
                                preview: preview.to_string(),
                                created_at,
                                heat: 100.0, // Unknown from RPC
                            });
                        }
                    }
                }
            }
            Err(e) => {
                return Err(CliError::Other(format!("RPC error: {}", e)));
            }
        }
    }

    // Output results
    if json {
        let output = SpaceViewOutput {
            space_id: space_id.to_string(),
            total,
            items,
        };
        crate::cli::output::print_json(&output)?;
    } else {
        if items.is_empty() {
            println!("No content in space: {}", short_address(space_id));
            println!();
            if !fetch {
                println!("Use --fetch to check the network for content.");
            } else {
                println!("This space has no content on the network yet.");
            }
        } else {
            println!("Space: {} ({} posts)", short_address(space_id), total);
            println!("═══════════════════════════════════════════════════════════════");
            println!();

            for item in items {
                // Calculate time ago
                let age_secs = now.saturating_sub(item.created_at);
                let time_ago = if age_secs < 60 {
                    "just now".to_string()
                } else if age_secs < 3600 {
                    format!("{}m ago", age_secs / 60)
                } else if age_secs < 86400 {
                    format!("{}h ago", age_secs / 3600)
                } else {
                    format!("{}d ago", age_secs / 86400)
                };

                let type_badge = match item.content_type.as_str() {
                    "Reply" => "[Reply] ",
                    "Quote" => "[Quote] ",
                    _ => "",
                };

                println!("{}{}", type_badge, item.title);
                println!("  {} • {} • Heat: {:.0}%", item.author, time_ago, item.heat);
                if !item.preview.is_empty() {
                    println!("  {}", item.preview);
                }
                println!("  ID: {}", short_address(&item.content_id));
                println!();
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_space_id() {
        let bytes = [0x12u8; 16];
        let encoded = encode_space_id(&bytes);
        assert!(encoded.starts_with("sp1"));

        let decoded = validate_space_id(&encoded).unwrap();
        assert_eq!(decoded, bytes);
    }

    #[test]
    fn test_invalid_space_id() {
        assert!(validate_space_id("invalid").is_err());
        assert!(validate_space_id("cs1qqqqq").is_err()); // wrong prefix
    }
}
