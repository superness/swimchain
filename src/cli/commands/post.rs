//! Post/content management commands
//!
//! Implements create, view, and reply operations for posts.

use crate::cli::commands::{identity::prompt_password, require_running_node_for_config};
use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::cli::output::short_address;
use crate::cli::progress::PowProgress;
use crate::content::decay::calculate_decay_state;
use crate::crypto::action_pow::{difficulty, ActionType, ForkPoWConfig, PoWChallenge};
use crate::crypto::signature::sign_content;
use crate::identity::decrypt_private_key;
use crate::network::NetworkContext;
use crate::rpc::{RpcClient, RpcClientConfig, SubmitPostParams, SubmitReplyParams, SubmitEngagementParams};
use crate::storage::blob::ContentBlobHash;
use crate::storage::content::PersistentContentStore;
use crate::types::constants::HALF_LIFE_SECS;
use crate::types::content::{ContentId, ContentItem, ContentType, SpaceId};
use crate::types::identity::IdentityId;
use clap::Subcommand;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Post management commands
#[derive(Subcommand, Debug)]
pub enum PostCmd {
    /// Create a new post
    #[command(
        about = "Create a new post in a space",
        long_about = "Creates a new post with proof-of-work. This operation takes approximately \
                      30 seconds due to the PoW requirement for spam resistance.",
        after_help = "EXAMPLES:\n  sw post create --space sp1xxx --title \"Hello\" --body \"World\""
    )]
    Create {
        /// Space ID to post in
        #[arg(long)]
        space: String,

        /// Post title
        #[arg(long)]
        title: String,

        /// Post body content
        #[arg(long)]
        body: String,

        /// Skip PoW for faster creation (testing only)
        #[arg(long, hide = true)]
        no_pow: bool,
    },

    /// Reply to a post
    #[command(
        about = "Reply to an existing post",
        long_about = "Creates a reply to an existing post with proof-of-work. \
                      This operation takes approximately 15 seconds.",
        after_help = "EXAMPLES:\n  sw post reply --parent sha256:xxx --body \"Great post!\""
    )]
    Reply {
        /// Parent content ID to reply to
        #[arg(long)]
        parent: String,

        /// Reply body content
        #[arg(long)]
        body: String,

        /// Skip PoW for faster creation (testing only)
        #[arg(long, hide = true)]
        no_pow: bool,
    },

    /// View a post by content ID
    #[command(
        about = "View a post by its content ID",
        long_about = "Displays a post's content, metadata, and engagement information. \
                      Use --fetch to retrieve content from the network if not stored locally.",
        after_help = "EXAMPLES:\n  sw post view sha256:abc123...\n  sw post view sha256:abc123... --fetch"
    )]
    View {
        /// Content ID to view
        #[arg()]
        content_id: String,

        /// Fetch from network if not found locally (requires running node)
        #[arg(long)]
        fetch: bool,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// Engage a post to help it persist
    #[command(
        about = "Contribute PoW to help content persist",
        long_about = "Mines proof-of-work and contributes to a post's engagement pool. \
                      The pool needs 60s total PoW to persist content past decay. \
                      Optionally add an emoji reaction: heart, thumbsup, thumbsdown, laugh, thinking, mindblown, fire, swimming.",
        after_help = "EXAMPLES:\n  sw post engage sha256:xxx --seconds 5\n  sw post engage sha256:xxx --emoji heart"
    )]
    Engage {
        /// Content ID to engage
        #[arg()]
        content_id: String,

        /// Seconds of PoW to contribute (5, 15, or 30)
        #[arg(long, default_value = "5")]
        seconds: u8,

        /// Emoji reaction to add (heart, thumbsup, thumbsdown, laugh, thinking, mindblown, fire, swimming)
        #[arg(long)]
        emoji: Option<String>,

        /// Skip PoW for faster execution (testing only)
        #[arg(long, hide = true)]
        no_pow: bool,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// List all local content
    #[command(
        about = "List all content stored locally",
        long_about = "Lists all posts, replies, and quotes stored in the local content store. \
                      Shows content ID, type, author, title, and heat.",
        after_help = "EXAMPLES:\n  sw post list\n  sw post list --limit 50\n  sw post list --json"
    )]
    List {
        /// Maximum number of items to show
        #[arg(long, default_value = "20")]
        limit: usize,

        /// Filter by content type (post, reply, quote)
        #[arg(long)]
        content_type: Option<String>,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },
}

/// JSON output for post create
#[derive(Serialize)]
struct PostCreateOutput {
    content_id: String,
    space_id: String,
    title: String,
}

/// JSON output for post view
#[derive(Serialize)]
struct PostViewOutput {
    content_id: String,
    space_id: String,
    author: String,
    title: String,
    body: String,
    timestamp: u64,
    heat: f64,
    replies: u32,
    pool_seconds: u32,
    pool_contributors: u32,
}

/// JSON output for post engage
#[derive(Serialize)]
struct EngageOutput {
    content_id: String,
    contributed_seconds: u8,
    pool_total_seconds: u32,
    pool_required_seconds: u32,
    pool_contributors: u32,
}

/// JSON output for content list item
#[derive(Serialize)]
struct ContentListItem {
    content_id: String,
    content_type: String,
    space_id: String,
    author: String,
    title: String,
    created_at: u64,
    heat: f64,
}

/// JSON output for content list
#[derive(Serialize)]
struct ContentListOutput {
    total: usize,
    items: Vec<ContentListItem>,
}

/// Validate content ID format (sha256:<64-hex>)
fn validate_content_id(id: &str) -> Result<[u8; 32]> {
    if !id.starts_with("sha256:") {
        return Err(CliError::InvalidContentId(format!(
            "{id} (expected sha256:<64-hex>)"
        )));
    }

    if id.len() != 71 {
        return Err(CliError::InvalidContentId(format!(
            "{id} (expected 71 characters)"
        )));
    }

    let hex_part = &id[7..];
    let bytes = hex::decode(hex_part)
        .map_err(|_| CliError::InvalidContentId(format!("{id} (invalid hex)")))?;

    if bytes.len() != 32 {
        return Err(CliError::InvalidContentId(format!(
            "{id} (expected 32 bytes)"
        )));
    }

    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// Generate content ID from data
fn generate_content_id(data: &[u8]) -> String {
    let hash = crate::crypto::sha256(data);
    format!("sha256:{}", hex::encode(hash))
}

/// Get the content store path for the current data directory
fn open_content_store(config: &CliConfig) -> Result<PersistentContentStore> {
    let data_dir = config.data_dir();
    let db_path = data_dir.join("content_db");
    let blob_path = data_dir.join("content_blobs");

    // Create directories if they don't exist
    fs::create_dir_all(&db_path)?;
    fs::create_dir_all(&blob_path)?;

    PersistentContentStore::open(&db_path, &blob_path)
        .map_err(|e| CliError::Other(format!("Failed to open content store: {e}")))
}

/// Get the sync store directory path
///
/// This stores serialized ContentItem objects that can be served to peers.
/// Uses BlobStore sharded directory structure for compatibility with node.
pub fn get_sync_store_path(config: &CliConfig) -> PathBuf {
    config.data_dir().join("sync_blobs")
}

/// Store content in sync store by content_id
///
/// Stores data in a sharded directory structure matching what
/// BlobStore expects: `<prefix>/<suffix>` where prefix is first 2 hex chars
/// and suffix is remaining 62 hex chars.
///
/// WARNING: This was previously used to store serialized ContentItem under
/// the body's content_hash, which broke content retrieval (hash mismatch).
/// The RPC submit_post/submit_reply now correctly store the raw body.
/// Keeping this function for potential debugging/testing but marking unused.
#[allow(dead_code)]
pub fn store_in_sync(config: &CliConfig, content_id: &[u8; 32], data: &[u8]) -> Result<()> {
    let sync_path = get_sync_store_path(config);
    fs::create_dir_all(&sync_path)?;

    // Create sharded path matching BlobStore format
    let hash = ContentBlobHash::from_bytes(*content_id);
    let prefix_dir = sync_path.join(hash.prefix());
    fs::create_dir_all(&prefix_dir)?;

    let file_path = prefix_dir.join(hash.suffix());
    fs::write(&file_path, data)
        .map_err(|e| CliError::Other(format!("Failed to write sync file: {e}")))
}

/// Get content from sync store by content_id
pub fn get_from_sync(config: &CliConfig, content_id: &[u8; 32]) -> Result<Option<Vec<u8>>> {
    let sync_path = get_sync_store_path(config);

    // Try sharded format first (new format matching BlobStore)
    let hash = ContentBlobHash::from_bytes(*content_id);
    let sharded_path = sync_path.join(hash.prefix()).join(hash.suffix());
    if sharded_path.exists() {
        return fs::read(&sharded_path)
            .map(Some)
            .map_err(|e| CliError::Other(format!("Failed to read sync file: {e}")));
    }

    // Fallback to flat file format for backwards compatibility
    let filename = hex::encode(content_id);
    let file_path = sync_path.join(&filename);

    if !file_path.exists() {
        return Ok(None);
    }

    fs::read(&file_path)
        .map(Some)
        .map_err(|e| CliError::Other(format!("Failed to read sync file: {e}")))
}

/// Import content from the sync store to the persistent content store
///
/// This is called when content is received from the network and needs to be
/// viewable via `post view`.
pub fn import_synced_content(config: &CliConfig, content_id: &[u8; 32]) -> Result<bool> {
    let content_store = open_content_store(config)?;

    // Check if we have it in sync store
    let serialized = match get_from_sync(config, content_id)? {
        Some(data) => data,
        None => return Ok(false), // Not in sync store
    };

    // Deserialize
    let content_item: ContentItem = bincode::deserialize(&serialized)
        .map_err(|e| CliError::Other(format!("Failed to deserialize synced content: {e}")))?;

    // Store in persistent content store (ignore already exists)
    match content_store.put(&content_item) {
        Ok(()) => {
            content_store.flush()
                .map_err(|e| CliError::Other(format!("Failed to flush content store: {e}")))?;
            Ok(true)
        }
        Err(e) if e.to_string().contains("already exists") => Ok(false),
        Err(e) => Err(CliError::Other(format!("Failed to import synced content: {e}"))),
    }
}

/// Get current timestamp as u64
fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

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

/// Parse space ID from string
fn parse_space_id(space: &str) -> Result<SpaceId> {
    // Remove "sp1" prefix and decode
    if !space.starts_with("sp1") {
        return Err(CliError::InvalidSpaceId(space.into()));
    }
    // For now, just hash the space ID string to get 32 bytes
    let hash = crate::crypto::sha256(space.as_bytes());
    Ok(SpaceId::from_bytes(hash))
}

/// Execute a post command
pub fn execute(cmd: PostCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        PostCmd::Create {
            space,
            title,
            body,
            no_pow,
        } => create(config, &space, &title, &body, no_pow),
        PostCmd::Reply {
            parent,
            body,
            no_pow,
        } => reply(config, &parent, &body, no_pow),
        PostCmd::View { content_id, fetch, json } => view(config, &content_id, fetch, json),
        PostCmd::Engage {
            content_id,
            seconds,
            emoji,
            no_pow,
            json,
        } => engage(config, &content_id, seconds, emoji.as_deref(), no_pow, json),
        PostCmd::List {
            limit,
            content_type,
            json,
        } => list_content(config, limit, content_type.as_deref(), json),
    }
}

/// Create a new post
fn create(config: &CliConfig, space: &str, title: &str, body: &str, no_pow: bool) -> Result<()> {
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

    // Get password and decrypt private key for signing
    let password = prompt_password(false)?;
    let private_key = decrypt_private_key(&portable.encrypted_private_key, &password)
        .map_err(|e| CliError::Other(format!("Failed to decrypt identity: {e}")))?;

    // Validate space ID (basic check)
    if !space.starts_with("sp1") {
        return Err(CliError::InvalidSpaceId(space.into()));
    }

    // Determine difficulty based on network mode
    let network_mode = NetworkContext::mode();
    let base_difficulty = if no_pow || cfg!(feature = "cli-testing") {
        4 // Very low for testing
    } else {
        difficulty::POST // 20 bits per SPEC_03
    };
    let pow_difficulty = network_mode.adjusted_difficulty(base_difficulty);

    println!(
        "Creating post in space {}... (difficulty: {} bits)",
        short_address(space),
        pow_difficulty
    );

    // Build post content
    let post_content = format!("{}\n\n{}", title, body);

    // Create PoW challenge
    let challenge = PoWChallenge::generate(
        ActionType::Post,
        post_content.as_bytes(),
        &portable.public_key,
        pow_difficulty,
    );

    // Get PoW config based on network mode
    let pow_config = match network_mode {
        crate::network::NetworkMode::Regtest => ForkPoWConfig::test(),
        crate::network::NetworkMode::Testnet => ForkPoWConfig::testnet(),
        crate::network::NetworkMode::Mainnet => {
            match config.pow_parallelism {
                2 => ForkPoWConfig::mobile(),
                4 => ForkPoWConfig::production(),
                _ => ForkPoWConfig::production(),
            }
        }
    };

    // Mine PoW with cancellation support
    let _solution = if pow_difficulty >= 16 {
        let progress = PowProgress::new("Creating post", 30);

        let result = crate::crypto::action_pow::compute_pow_cancellable(
            &challenge,
            &pow_config,
            |nonce| progress.update(nonce),
            || progress.is_cancelled(),
        );

        match result {
            Ok(solution) => {
                progress.finish_success("Post created");
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
        crate::crypto::action_pow::compute_pow(&challenge, &pow_config)
            .map_err(|e| CliError::Other(e.to_string()))?
    };

    // Generate content ID from the post content
    let content_hash = crate::crypto::sha256(post_content.as_bytes());
    let content_id_str = format!("sha256:{}", hex::encode(content_hash));

    // Create ContentItem to store
    let space_id = parse_space_id(space)?;
    let author_id = IdentityId::from_bytes(portable.public_key);
    let now = current_timestamp();

    // Sign the content (content_hash + timestamp)
    let signature = sign_content(&private_key, &content_hash, now);

    let content_item = ContentItem {
        content_id: ContentId::from_bytes(content_hash),
        author_id,
        content_type: ContentType::Post,
        space_id,
        parent_id: None,
        created_at: now,
        last_engagement: now,
        body_inline: Some(post_content.clone()),
        content_hash: None,
        content_size: Some(post_content.len() as u32),
        content_type_mime: Some("text/plain".to_string()),
        media_refs: vec![],
        pin_state: None,
        engagement_count: 0,
        signature,
        pow_nonce: _solution.nonce,
        pow_difficulty,
        preservation_pow: None,
        display_name: None, // Set by RPC from node config
    };

    // Store in persistent content store
    let store = open_content_store(config)?;
    match store.put(&content_item) {
        Ok(()) => {
            store
                .flush()
                .map_err(|e| CliError::Other(format!("Failed to flush content store: {e}")))?;

            // Note: We don't write to sync_blobs here - the RPC submit_post call
            // stores the raw body under the content_hash, which is correct.
            // Previously we were overwriting with serialized ContentItem which broke retrieval.

            // Submit to node via RPC for network broadcast
            let mut rpc_client = create_rpc_client(config)?;
            let submit_params = SubmitPostParams {
                space_id: space.to_string(),
                title: title.to_string(),
                body: body.to_string(),
                author_id: hex::encode(portable.public_key),
                pow_nonce: _solution.nonce,
                pow_difficulty,
                pow_nonce_space: hex::encode(_solution.challenge.nonce_space),
                pow_hash: hex::encode(_solution.hash),
                signature: hex::encode(signature.as_bytes()),
                timestamp: _solution.challenge.timestamp,  // Use PoW challenge timestamp
                media_refs: vec![],  // CLI doesn't support media attachments yet
                replaces_pending: None,  // CLI doesn't support RIM yet
            };

            match rpc_client.call("submit_post", serde_json::to_value(&submit_params).map_err(|e| CliError::Other(format!("JSON serialization error: {}", e)))?) {
                Ok(response) => {
                    if response.is_error() {
                        println!();
                        println!("Post stored locally but broadcast failed:");
                        if let Some(err) = response.error {
                            println!("  {}", err.message);
                        }
                    } else {
                        let recipients = response.result
                            .and_then(|r| r.get("recipients").and_then(|v| v.as_u64()))
                            .unwrap_or(0);
                        println!();
                        println!("Post created and broadcast successfully!");
                        println!("Content ID: {content_id_str}");
                        println!("Space: {space}");
                        println!("Title: {title}");
                        println!("Broadcast to: {} peers", recipients);
                    }
                }
                Err(e) => {
                    println!();
                    println!("Post stored locally but broadcast failed: {e}");
                    println!("Content ID: {content_id_str}");
                    println!();
                    println!("The post will be broadcast when you restart the node.");
                }
            }
        }
        Err(e) if e.to_string().contains("already exists") => {
            println!();
            println!("This content already exists (identical post detected).");
            println!("Content ID: {content_id_str}");
            println!();
            println!("Swimchain uses content-addressed storage: identical content = identical ID.");
            println!("Your existing post is already stored. Use 'sw post view {content_id_str}'");
        }
        Err(e) => {
            return Err(CliError::Other(format!("Failed to store content: {e}")));
        }
    }

    Ok(())
}

/// Reply to a post
fn reply(config: &CliConfig, parent: &str, body: &str, no_pow: bool) -> Result<()> {
    // Require a running node - no ephemeral clients allowed
    require_running_node_for_config(config)?;

    // Verify identity exists
    let identity_path = config.identity_path();
    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    // Read identity
    let data = fs::read(&identity_path)?;
    let portable = crate::identity::deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    // Get password and decrypt private key for signing
    let password = prompt_password(false)?;
    let private_key = decrypt_private_key(&portable.encrypted_private_key, &password)
        .map_err(|e| CliError::Other(format!("Failed to decrypt identity: {e}")))?;

    // Validate parent content ID
    let _ = validate_content_id(parent)?;

    // Determine difficulty based on network mode
    let network_mode = NetworkContext::mode();
    let base_difficulty = if no_pow || cfg!(feature = "cli-testing") {
        4 // Very low for testing
    } else {
        difficulty::REPLY // 18 bits per SPEC_03
    };
    let pow_difficulty = network_mode.adjusted_difficulty(base_difficulty);

    println!(
        "Creating reply to {}... (difficulty: {} bits)",
        short_address(parent),
        pow_difficulty
    );

    // Create PoW challenge
    let challenge = PoWChallenge::generate(
        ActionType::Reply,
        body.as_bytes(),
        &portable.public_key,
        pow_difficulty,
    );

    // Get PoW config based on network mode
    let pow_config = match network_mode {
        crate::network::NetworkMode::Regtest => ForkPoWConfig::test(),
        crate::network::NetworkMode::Testnet => ForkPoWConfig::testnet(),
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
        let progress = PowProgress::new("Creating reply", 15);

        let result = crate::crypto::action_pow::compute_pow_cancellable(
            &challenge,
            &pow_config,
            |nonce| progress.update(nonce),
            || progress.is_cancelled(),
        );

        match result {
            Ok(solution) => {
                progress.finish_success("Reply created");
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
        crate::crypto::action_pow::compute_pow(&challenge, &pow_config)
            .map_err(|e| CliError::Other(e.to_string()))?
    };

    // Parse parent content ID
    let parent_bytes = validate_content_id(parent)?;

    // Create content item for the reply
    let now = current_timestamp();
    let content_hash = Sha256::digest(body.as_bytes());
    let content_hash_array: [u8; 32] = content_hash.into();
    let content_id_str = format!("sha256:{}", hex::encode(content_hash_array));

    // Sign the content (content_hash + timestamp)
    let signature = sign_content(&private_key, &content_hash_array, now);

    let content_item = ContentItem {
        content_id: ContentId::from_bytes(content_hash_array),
        content_type: ContentType::Reply,
        author_id: IdentityId::from_bytes(portable.public_key),
        space_id: SpaceId::from_bytes([0u8; 32]),  // Replies inherit space from parent
        parent_id: Some(ContentId::from_bytes(parent_bytes)),
        created_at: now,
        last_engagement: now,
        body_inline: Some(body.to_string()),
        content_hash: None,
        content_size: Some(body.len() as u32),
        content_type_mime: Some("text/plain".to_string()),
        media_refs: vec![],
        pin_state: None,
        engagement_count: 0,
        signature,
        pow_nonce: solution.nonce,
        pow_difficulty,
        preservation_pow: None,
        display_name: None, // Set by RPC from node config
    };

    // Store in persistent content store
    let store = open_content_store(config)?;
    match store.put(&content_item) {
        Ok(()) => {
            store.flush()
                .map_err(|e| CliError::Other(format!("Failed to flush content store: {e}")))?;

            // Note: We don't write to sync_blobs here - the RPC submit_reply call
            // stores the raw body under the content_hash, which is correct.
            // Previously we were overwriting with serialized ContentItem which broke retrieval.

            // Submit to node via RPC for network broadcast
            let mut rpc_client = create_rpc_client(config)?;
            let submit_params = SubmitReplyParams {
                parent_id: parent.to_string(),
                body: body.to_string(),
                author_id: hex::encode(portable.public_key),
                pow_nonce: solution.nonce,
                pow_difficulty,
                pow_nonce_space: hex::encode(solution.challenge.nonce_space),
                pow_hash: hex::encode(solution.hash),
                signature: hex::encode(signature.as_bytes()),
                timestamp: solution.challenge.timestamp,  // Use PoW challenge timestamp
                replaces_pending: None,  // CLI doesn't support RIM yet
            };

            match rpc_client.call("submit_reply", serde_json::to_value(&submit_params).map_err(|e| CliError::Other(format!("JSON serialization error: {}", e)))?) {
                Ok(response) => {
                    if response.is_error() {
                        println!();
                        println!("Reply stored locally but broadcast failed:");
                        if let Some(err) = response.error {
                            println!("  {}", err.message);
                        }
                    } else {
                        let recipients = response.result
                            .and_then(|r| r.get("recipients").and_then(|v| v.as_u64()))
                            .unwrap_or(0);
                        println!();
                        println!("Reply created and broadcast successfully!");
                        println!("Content ID: {content_id_str}");
                        println!("Parent: {parent}");
                        println!("Broadcast to: {} peers", recipients);
                    }
                }
                Err(e) => {
                    println!();
                    println!("Reply stored locally but broadcast failed: {e}");
                    println!("Content ID: {content_id_str}");
                    println!();
                    println!("The reply will be broadcast when you restart the node.");
                }
            }
        }
        Err(e) if e.to_string().contains("already exists") => {
            println!();
            println!("This reply already exists (identical content detected).");
            println!("Content ID: {content_id_str}");
        }
        Err(e) => {
            return Err(CliError::Other(format!("Failed to store reply: {e}")));
        }
    }

    Ok(())
}

/// Fetch content from network and then view it
fn fetch_and_view(
    config: &CliConfig,
    content_id: &str,
    content_bytes: &[u8; 32],
    json_output: bool,
) -> Result<()> {
    use std::thread;
    use std::time::Duration;

    println!("Content not found locally. Fetching from network...");

    // Create RPC client to communicate with running node
    let mut rpc_client = match create_rpc_client(config) {
        Ok(c) => c,
        Err(e) => {
            return Err(CliError::Other(format!(
                "Cannot fetch: no running node. Start with 'sw node start'. Error: {e}"
            )));
        }
    };

    // Request content from network
    let request_params = crate::rpc::RequestContentParams {
        content_id: content_id.to_string(),
    };

    let response = rpc_client
        .call("request_content", serde_json::to_value(&request_params).map_err(|e| CliError::Other(format!("JSON serialization error: {}", e)))?)
        .map_err(|e| CliError::Other(format!("RPC error: {e}")))?;

    if response.is_error() {
        if let Some(err) = response.error {
            return Err(CliError::Other(format!("Network request failed: {}", err.message)));
        }
        return Err(CliError::Other("Network request failed".to_string()));
    }

    // Check the status from the response
    let status = response
        .result
        .as_ref()
        .and_then(|r| r.get("status"))
        .and_then(|s| s.as_str())
        .unwrap_or("unknown");

    match status {
        "found_locally" => {
            // Content was already there (maybe another process added it)
            println!("Content found!");
        }
        "requested" | "discovering" => {
            // Wait for content to arrive with polling
            println!("Request sent to {} peers. Waiting for response...",
                response.result
                    .as_ref()
                    .and_then(|r| r.get("recipients"))
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
            );

            // Poll for content arrival (up to 30 seconds, checking every 500ms)
            let max_attempts = 60;
            let poll_interval = Duration::from_millis(500);

            for attempt in 0..max_attempts {
                // Try to import from sync store
                if import_synced_content(config, content_bytes)? {
                    println!("Content received!");
                    break;
                }

                // Check if content is now in the content store
                let store = open_content_store(config)?;
                let cid = ContentId::from_bytes(*content_bytes);
                if store.get(&cid).ok().flatten().is_some() {
                    println!("Content received!");
                    break;
                }

                if attempt == max_attempts - 1 {
                    return Err(CliError::Other(
                        "Timeout: Content not received from network after 30 seconds. \
                         The content may not be available, or peers may not have it."
                            .to_string(),
                    ));
                }

                // Show progress dots every 2 seconds
                if attempt % 4 == 0 && attempt > 0 {
                    print!(".");
                    use std::io::Write;
                    std::io::stdout().flush().ok();
                }

                thread::sleep(poll_interval);
            }
            println!();
        }
        _ => {
            return Err(CliError::Other(format!("Unexpected response status: {}", status)));
        }
    }

    // Now try to view the content
    let _ = import_synced_content(config, content_bytes);
    let store = open_content_store(config)?;
    let cid = ContentId::from_bytes(*content_bytes);

    let content = store
        .get(&cid)
        .map_err(|e| CliError::Other(format!("Failed to read content store: {e}")))?;

    let content = match content {
        Some(c) => c,
        None => {
            return Err(CliError::Other(
                "Content was requested but not stored properly. This may be a bug.".to_string(),
            ));
        }
    };

    // Display the content (same logic as regular view)
    display_content(content_id, &content, json_output)
}

/// Display content item (shared by view and fetch_and_view)
fn display_content(content_id: &str, content: &ContentItem, json_output: bool) -> Result<()> {
    // Extract title and body from the stored content
    let body_text = content.body_inline.as_deref().unwrap_or("");
    let (title, body) = if let Some(idx) = body_text.find("\n\n") {
        (&body_text[..idx], &body_text[idx + 2..])
    } else {
        (body_text, "")
    };

    // Format author ID
    let author_hex = hex::encode(content.author_id.as_bytes());
    let author_short = format!("sw1{}...{}", &author_hex[..4], &author_hex[author_hex.len() - 4..]);

    // Calculate time ago
    let now = current_timestamp();
    let age_secs = now.saturating_sub(content.created_at);
    let time_ago = if age_secs < 60 {
        "just now".to_string()
    } else if age_secs < 3600 {
        format!("{}m ago", age_secs / 60)
    } else if age_secs < 86400 {
        format!("{}h ago", age_secs / 3600)
    } else {
        format!("{}d ago", age_secs / 86400)
    };

    // Calculate heat (survival probability) based on decay
    let current_time_ms = now;
    let decay_state = calculate_decay_state(content, current_time_ms, HALF_LIFE_SECS);
    let heat = decay_state.survival_probability * 100.0;

    // Get engagement pool stats
    let pool_seconds = content.engagement_count as u32;
    let pool_contributors = if content.engagement_count > 0 { 1 } else { 0 };

    if json_output {
        let output = PostViewOutput {
            content_id: content_id.to_string(),
            space_id: format!("sp1{}", hex::encode(&content.space_id.as_bytes()[..16])),
            author: format!("sw1{}", author_hex),
            title: title.to_string(),
            body: body.to_string(),
            timestamp: content.created_at,
            heat,
            replies: 0, // Can't get replies without store reference
            pool_seconds,
            pool_contributors,
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("{}", title);
        println!("═══════════════════════════════════════");
        println!("{} • {} • Heat: {:.0}%", author_short, time_ago, heat);
        println!();
        if !body.is_empty() {
            println!("{}", body);
            println!();
        }
        if pool_seconds > 0 {
            println!("Pool: {}s from {} contributors", pool_seconds, pool_contributors);
        }
        println!("Created: {}", content.created_at);
    }

    Ok(())
}

/// View a post
fn view(config: &CliConfig, content_id: &str, fetch: bool, json_output: bool) -> Result<()> {
    // Validate content ID
    let content_bytes = validate_content_id(content_id)?;

    // Check if node is running (RPC available)
    if is_node_running(config) {
        // Use RPC for everything when node is running
        match try_rpc_get_content(config, content_id, fetch) {
            Ok(result) => {
                if json_output {
                    crate::cli::output::print_json_pretty(&result)?;
                } else {
                    println!("{}", result.title.as_deref().unwrap_or("(no title)"));
                    println!("═══════════════════════════════════════");
                    println!("Author: {} • Space: {}", result.author_id, result.space_id);
                    println!();
                    if let Some(body) = &result.body {
                        if !body.is_empty() {
                            println!("{}", body);
                            println!();
                        }
                    }
                    println!("Content ID: {}", content_id);
                    println!("Created: {}", result.created_at);
                }
                return Ok(());
            }
            Err(_) => {
                if fetch {
                    return Err(CliError::Other(
                        "Content not found. The request was sent to the network - try again in a few seconds.".to_string()
                    ));
                } else {
                    return Err(CliError::ContentNotFound(content_id.to_string()));
                }
            }
        }
    }

    // Node not running - use direct DB access
    // Try to import from sync store first (in case it was synced from network)
    let _ = import_synced_content(config, &content_bytes);

    // Open content store and look up the content
    let store = open_content_store(config)?;
    let cid = ContentId::from_bytes(content_bytes);

    let content = store
        .get(&cid)
        .map_err(|e| CliError::Other(format!("Failed to read content store: {e}")))?;

    let content = match content {
        Some(c) => c,
        None => {
            // Not found locally - try fetching from network if requested
            if fetch {
                return fetch_and_view(config, content_id, &content_bytes, json_output);
            }
            return Err(CliError::ContentNotFound(content_id.to_string()));
        }
    };

    // Extract title and body from the stored content
    let body_text = content.body_inline.as_deref().unwrap_or("");
    let (title, body) = if let Some(idx) = body_text.find("\n\n") {
        (&body_text[..idx], &body_text[idx + 2..])
    } else {
        (body_text, "")
    };

    // Format author ID
    let author_hex = hex::encode(content.author_id.as_bytes());
    let author_short = format!("sw1{}...{}", &author_hex[..4], &author_hex[author_hex.len() - 4..]);

    // Calculate time ago
    let now = current_timestamp();
    let age_secs = now.saturating_sub(content.created_at);
    let time_ago = if age_secs < 60 {
        "just now".to_string()
    } else if age_secs < 3600 {
        format!("{}m ago", age_secs / 60)
    } else if age_secs < 86400 {
        format!("{}h ago", age_secs / 3600)
    } else {
        format!("{}d ago", age_secs / 86400)
    };

    // Get children (replies) count
    let replies = store
        .get_children(&cid)
        .map(|c| c.len() as u32)
        .unwrap_or(0);

    // Calculate heat (survival probability) based on decay
    let current_time_ms = now;
    let decay_state = calculate_decay_state(&content, current_time_ms, HALF_LIFE_SECS);
    let heat = decay_state.survival_probability * 100.0;

    // Get engagement pool stats (currently only local engagement count)
    let pool_seconds = content.engagement_count as u32;
    let pool_contributors = if content.engagement_count > 0 { 1 } else { 0 };

    if json_output {
        let output = PostViewOutput {
            content_id: content_id.to_string(),
            space_id: format!("sp1{}", hex::encode(&content.space_id.as_bytes()[..16])),
            author: format!("sw1{}", author_hex),
            title: title.to_string(),
            body: body.to_string(),
            timestamp: content.created_at,
            heat,
            replies,
            pool_seconds,
            pool_contributors,
        };
        crate::cli::output::print_json(&output)?;
    } else {
        println!("{}", title);
        println!("═══════════════════════════════════════");
        println!("{} • {} • Heat: {:.0}%", author_short, time_ago, heat);
        println!();
        if !body.is_empty() {
            println!("{}", body);
            println!();
        }
        println!("Replies: {}", replies);
        if pool_seconds > 0 {
            println!("Pool: {}s from {} contributors", pool_seconds, pool_contributors);
        }
        println!("Created: {}", content.created_at);
    }

    Ok(())
}

/// Parse emoji name to u8 value (1-8)
fn parse_emoji(emoji: &str) -> Option<u8> {
    match emoji.to_lowercase().as_str() {
        "heart" | "❤️" | "❤" => Some(1),
        "thumbsup" | "👍" => Some(2),
        "thumbsdown" | "👎" => Some(3),
        "laugh" | "😂" => Some(4),
        "thinking" | "🤔" => Some(5),
        "mindblown" | "🤯" => Some(6),
        "fire" | "🔥" => Some(7),
        "swimming" | "🏊" => Some(8),
        _ => None,
    }
}

/// Engage a post with PoW contribution
fn engage(
    config: &CliConfig,
    content_id: &str,
    seconds: u8,
    emoji: Option<&str>,
    no_pow: bool,
    json_output: bool,
) -> Result<()> {
    // Require a running node - no ephemeral clients allowed
    require_running_node_for_config(config)?;

    // Verify identity exists
    let identity_path = config.identity_path();
    if !identity_path.exists() {
        return Err(CliError::NoIdentity);
    }

    // Read identity to get public key and encrypted private key
    let data = fs::read(&identity_path)?;
    let portable = crate::identity::deserialize_portable(&data)
        .map_err(|e| CliError::InvalidIdentityFile(e.to_string()))?;

    // Validate content ID
    let content_bytes = validate_content_id(content_id)?;

    // Parse emoji if provided
    let emoji_value: Option<u8> = if let Some(e) = emoji {
        match parse_emoji(e) {
            Some(val) => Some(val),
            None => {
                return Err(CliError::Other(format!(
                    "Invalid emoji: {}. Valid options: heart, thumbsup, thumbsdown, laugh, thinking, mindblown, fire, swimming",
                    e
                )));
            }
        }
    } else {
        None
    };

    // Validate seconds (must be 5, 15, or 30)
    let valid_seconds = [5, 15, 30];
    if !valid_seconds.contains(&seconds) {
        return Err(CliError::Other(format!(
            "Invalid seconds value: {seconds}. Must be 5, 15, or 30."
        )));
    }

    // Determine difficulty based on network mode
    // Map seconds to base difficulty: 5s=16 bits, 15s=18 bits, 30s=20 bits
    let network_mode = NetworkContext::mode();
    let base_difficulty = if no_pow || cfg!(feature = "cli-testing") {
        4 // Very low for testing
    } else {
        match seconds {
            5 => 16,
            15 => 18,
            30 => 20,
            _ => 16,
        }
    };
    let pow_difficulty = network_mode.adjusted_difficulty(base_difficulty);

    let emoji_display = emoji_value.map(|v| match v {
        1 => "❤️",
        2 => "👍",
        3 => "👎",
        4 => "😂",
        5 => "🤔",
        6 => "🤯",
        7 => "🔥",
        8 => "🏊",
        _ => "?",
    });

    if let Some(e) = emoji_display {
        println!(
            "Engaging {} with {} for {}s... (difficulty: {} bits)",
            crate::cli::output::short_address(content_id),
            e,
            seconds,
            pow_difficulty
        );
    } else {
        println!(
            "Engaging {} for {}s... (difficulty: {} bits)",
            crate::cli::output::short_address(content_id),
            seconds,
            pow_difficulty
        );
    }

    // Create PoW challenge for engagement
    // Use generate_with_hash since content_bytes is already the content hash
    // (from sha256:xxx format) - don't hash it again
    let challenge = PoWChallenge::generate_with_hash(
        ActionType::Engage,
        content_bytes,
        &portable.public_key,
        pow_difficulty,
    );

    // Get PoW config based on network mode
    let pow_config = match network_mode {
        crate::network::NetworkMode::Regtest => ForkPoWConfig::test(),
        crate::network::NetworkMode::Testnet => ForkPoWConfig::testnet(),
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
        let progress = PowProgress::new("Engaging", u64::from(seconds));

        let result = crate::crypto::action_pow::compute_pow_cancellable(
            &challenge,
            &pow_config,
            |nonce| progress.update(nonce),
            || progress.is_cancelled(),
        );

        match result {
            Ok(solution) => {
                progress.finish_success("PoW complete");
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
        crate::crypto::action_pow::compute_pow(&challenge, &pow_config)
            .map_err(|e| CliError::Other(e.to_string()))?
    };

    // Use the challenge's timestamp (not a new one) to ensure hash matches
    let timestamp = challenge.timestamp;

    // Decrypt private key and sign the engagement
    let password = prompt_password(false)?;
    let signing_key = decrypt_private_key(&portable.encrypted_private_key, &password)
        .map_err(|_| CliError::Other("Invalid passphrase".to_string()))?;

    // Create signature over content_id + timestamp (matching sign_content format)
    let signature = sign_content(&signing_key, &content_bytes, timestamp);

    // Create RPC client and submit engagement
    let mut rpc_client = create_rpc_client(config)?;

    let submit_params = SubmitEngagementParams {
        content_id: content_id.to_string(),
        author_id: hex::encode(portable.public_key),
        pow_nonce: solution.nonce,
        pow_difficulty,
        pow_nonce_space: hex::encode(challenge.nonce_space),
        pow_hash: hex::encode(solution.hash),
        signature: hex::encode(signature.as_bytes()),
        timestamp,
        emoji: emoji_value,
    };

    let result = rpc_client.call("submit_engagement", serde_json::to_value(&submit_params).map_err(|e| CliError::Other(format!("JSON serialization error: {}", e)))?);

    match result {
        Ok(response) => {
            if response.is_error() {
                if let Some(err) = response.error {
                    return Err(CliError::Other(format!("RPC error: {}", err.message)));
                }
            }

            // Extract values from response result
            let (engaged, reaction_stored) = if let Some(result) = response.result {
                let engaged = result.get("engaged").and_then(|v| v.as_bool()).unwrap_or(false);
                let reaction_stored = result.get("reaction_stored").and_then(|v| v.as_bool()).unwrap_or(false);
                (engaged, reaction_stored)
            } else {
                (false, false)
            };

            if json_output {
                let output = EngageOutput {
                    content_id: content_id.to_string(),
                    contributed_seconds: seconds,
                    pool_total_seconds: u32::from(seconds),
                    pool_required_seconds: 60,
                    pool_contributors: 1,
                };
                crate::cli::output::print_json(&output)?;
            } else {
                println!();
                println!("Engagement complete!");
                println!(
                    "Content:      {}",
                    crate::cli::output::short_address(content_id)
                );
                println!("Contributed:  {}s", seconds);
                if let Some(e) = emoji_display {
                    println!("Reaction:     {} {}", e, if reaction_stored { "(stored)" } else { "(already exists)" });
                }
                println!("Decay timer:  {}", if engaged { "reset" } else { "unchanged" });
            }
        }
        Err(e) => {
            return Err(CliError::Other(format!("Failed to submit engagement: {}", e)));
        }
    }

    Ok(())
}

/// List all local content
fn list_content(config: &CliConfig, limit: usize, content_type_filter: Option<&str>, json_output: bool) -> Result<()> {
    // Get current timestamp
    let now = current_timestamp();

    // Open content store
    let store = open_content_store(config)?;

    // Parse content type filter if provided
    let type_filter = match content_type_filter {
        Some("post") => Some(ContentType::Post),
        Some("reply") => Some(ContentType::Reply),
        Some("quote") => Some(ContentType::Quote),
        Some(other) => {
            return Err(CliError::Other(format!(
                "Invalid content type: {}. Valid values: post, reply, quote",
                other
            )));
        }
        None => None,
    };

    // Collect content items
    let mut items: Vec<ContentListItem> = Vec::new();
    let mut total = 0usize;

    for result in store.iter_content() {
        if let Ok(item) = result {
            // Apply type filter if set
            if let Some(filter_type) = type_filter {
                if item.content_type != filter_type {
                    continue;
                }
            }

            total += 1;

            if items.len() >= limit {
                continue;
            }

            // Extract title from body
            let body_text = item.body_inline.as_deref().unwrap_or("");
            let title = if let Some(idx) = body_text.find("\n\n") {
                &body_text[..idx]
            } else {
                body_text
            };

            // Truncate title if too long
            let title = if title.len() > 50 {
                format!("{}...", &title[..50])
            } else {
                title.to_string()
            };

            // Format author ID
            let author_hex = hex::encode(item.author_id.as_bytes());
            let author_short = format!("sw1{}...{}", &author_hex[..4], &author_hex[author_hex.len() - 4..]);

            // Calculate heat
            let decay_state = calculate_decay_state(&item, now, HALF_LIFE_SECS);
            let heat = decay_state.survival_probability * 100.0;

            // Content type string
            let content_type_str = match item.content_type {
                ContentType::Post => "Post",
                ContentType::Reply => "Reply",
                ContentType::Quote => "Quote",
                ContentType::Edit => "Edit",
            };

            // Format space ID
            let space_hex = hex::encode(&item.space_id.as_bytes()[..16]);
            let space_id = format!("sp1{}", &space_hex[..16]);

            items.push(ContentListItem {
                content_id: format!("sha256:{}", hex::encode(item.content_id.as_bytes())),
                content_type: content_type_str.to_string(),
                space_id,
                author: author_short,
                title,
                created_at: item.created_at,
                heat,
            });
        }
    }

    // Output results
    if json_output {
        let output = ContentListOutput { total, items };
        crate::cli::output::print_json(&output)?;
    } else {
        if items.is_empty() {
            println!("No content stored locally.");
            println!();
            println!("Create a post with: sw post create --space <space_id> --title \"Title\" --body \"Body\"");
        } else {
            println!("Local content ({} total, showing {}):", total, items.len());
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
                    _ => "[Post] ",
                };

                println!("{}{}", type_badge, item.title);
                println!("  {} • {} • Heat: {:.0}%", item.author, time_ago, item.heat);
                println!("  Space: {} • ID: {}", short_address(&item.space_id), short_address(&item.content_id));
                println!();
            }
        }
    }

    Ok(())
}

/// Try to get content via RPC (when node is running)
fn try_rpc_get_content(config: &CliConfig, content_id: &str, fetch: bool) -> std::result::Result<crate::rpc::types::GetContentResult, ()> {
    use crate::rpc::{RpcClient, RpcClientConfig};

    // Try to create config from data dir (reads .rpc_addr file)
    let data_dir = config.data_dir();
    let rpc_config = RpcClientConfig::from_data_dir(&data_dir)
        .and_then(|c| c.with_cookie_from(&data_dir))
        .map_err(|_| ())?;

    // Create RPC client
    let mut client = RpcClient::new(rpc_config);

    // If fetch is requested, first request the content from network
    if fetch {
        let _ = client.request_content(content_id);
        // Wait a bit for the content to arrive
        std::thread::sleep(std::time::Duration::from_secs(2));
    }

    // Get the content
    client.get_content(content_id).map_err(|_| ())
}

/// Check if node is running (RPC available)
fn is_node_running(config: &CliConfig) -> bool {
    let data_dir = config.data_dir();
    let rpc_addr_file = data_dir.join(".rpc_addr");
    rpc_addr_file.exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_content_id() {
        let valid = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
        assert!(validate_content_id(valid).is_ok());

        assert!(validate_content_id("invalid").is_err());
        assert!(validate_content_id("sha256:short").is_err());
        assert!(validate_content_id(
            "md5:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )
        .is_err());
    }

    #[test]
    fn test_generate_content_id() {
        let id = generate_content_id(b"test");
        assert!(id.starts_with("sha256:"));
        assert_eq!(id.len(), 71);
    }
}
