//! Blocklist administration commands (operator-only).
//!
//! Seeds and inspects the local CSAM/illegal-content blocklist (SPEC_12). The
//! import path bulk-loads entries from an external hash-list file with
//! `ExternalList`-family provenance. All operations route through the running
//! node's cookie-authenticated RPC, so only an operator with filesystem access
//! to the node's data directory (and thus the `.cookie`) can run them.

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};
use crate::rpc::{RpcClient, RpcClientConfig};
use clap::Subcommand;

/// Blocklist administration commands
#[derive(Subcommand, Debug)]
pub enum BlocklistCmd {
    /// Import external hash-list entries into the blocklist
    #[command(
        about = "Bulk-import a hash list into the blocklist (operator-only)",
        long_about = "Reads a hash-list file and seeds the blocklist with ExternalList-family \
                      entries. Each line is `<digest-spec> [reason]`, where digest-spec is one or \
                      more comma-separated `type:hex` tokens (sha256/sha1/md5) or a bare hex \
                      digest, and reason is csam, terrorism, or external_list (default). \
                      Requires a running node (routes via cookie-authed RPC). \
                      Use synthetic test hashes only.",
        after_help = "EXAMPLES:\n  sw blocklist import known-hashes.txt\n  \
                      sw --regtest blocklist import test-list.txt --json"
    )]
    Import {
        /// Path to the hash-list file to import
        #[arg()]
        file: String,

        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },

    /// List current blocklist entries
    #[command(
        about = "List current blocklist entries",
        after_help = "EXAMPLES:\n  sw blocklist list\n  sw blocklist list --json"
    )]
    List {
        /// Output in JSON format
        #[arg(long)]
        json: bool,
    },
}

/// Execute a blocklist command.
pub fn execute(cmd: BlocklistCmd, config: &CliConfig) -> Result<()> {
    match cmd {
        BlocklistCmd::Import { file, json } => import(config, &file, json),
        BlocklistCmd::List { json } => list(config, json),
    }
}

/// Build an RPC client for the running node, or a helpful error.
fn rpc_client(config: &CliConfig) -> Result<RpcClient> {
    let data_dir = config.data_dir();
    let rpc_config = RpcClientConfig::from_data_dir(&data_dir)
        .and_then(|c| c.with_cookie_from(&data_dir))
        .map_err(|_| {
            CliError::Other(
                "Cannot reach the node RPC. Start the node first (blocklist import requires a \
                 running node so entries take effect immediately)."
                    .to_string(),
            )
        })?;
    Ok(RpcClient::new(rpc_config))
}

fn import(config: &CliConfig, file: &str, json_output: bool) -> Result<()> {
    let body = std::fs::read_to_string(file)
        .map_err(|e| CliError::Other(format!("Failed to read '{}': {}", file, e)))?;

    // Parse locally first so format errors are reported without a round-trip.
    let records = crate::blocklist::parse_import(&body)
        .map_err(|e| CliError::Other(format!("Invalid list file: {}", e)))?;
    if records.is_empty() {
        return Err(CliError::Other(
            "List file contains no records (only comments/blank lines?)".to_string(),
        ));
    }

    let mut client = rpc_client(config)?;
    let response = client
        .call("import_blocklist", serde_json::json!({ "list": body }))
        .map_err(|e| CliError::Other(format!("RPC error: {}", e)))?;

    if let Some(err) = response.error {
        return Err(CliError::Other(format!("{} ({})", err.message, err.code)));
    }
    let result = response
        .result
        .ok_or_else(|| CliError::Other("No result in response".to_string()))?;

    if json_output {
        crate::cli::output::print_json_pretty(&result)?;
    } else {
        let added = result
            .get("sha256_added")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let skipped = result
            .get("sha256_skipped")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let sha1 = result
            .get("sha1_indexed")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let md5 = result
            .get("md5_indexed")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let count = result.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
        println!("Blocklist import complete");
        println!("=========================");
        println!("Records parsed:     {}", records.len());
        println!("SHA-256 added:      {}", added);
        println!("SHA-256 skipped:    {} (already present)", skipped);
        println!("SHA-1 indexed:      {}", sha1);
        println!("MD5 indexed:        {}", md5);
        println!("Total entries now:  {}", count);
    }
    Ok(())
}

fn list(config: &CliConfig, json_output: bool) -> Result<()> {
    let mut client = rpc_client(config)?;
    let response = client
        .call("list_blocklist", serde_json::json!({}))
        .map_err(|e| CliError::Other(format!("RPC error: {}", e)))?;

    if let Some(err) = response.error {
        return Err(CliError::Other(format!("{} ({})", err.message, err.code)));
    }
    let result = response
        .result
        .ok_or_else(|| CliError::Other("No result in response".to_string()))?;

    if json_output {
        crate::cli::output::print_json_pretty(&result)?;
    } else {
        let count = result.get("count").and_then(|v| v.as_u64()).unwrap_or(0);
        let root = result
            .get("merkle_root")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        println!("Blocklist ({} entries)", count);
        println!("Merkle root: {}", root);
        if let Some(entries) = result.get("entries").and_then(|v| v.as_array()) {
            for e in entries {
                let hash = e.get("content_hash").and_then(|v| v.as_str()).unwrap_or("");
                let reason = e.get("reason").and_then(|v| v.as_str()).unwrap_or("");
                let short = &hash[..hash.len().min(16)];
                println!("  {}...  {}", short, reason);
            }
        }
    }
    Ok(())
}
