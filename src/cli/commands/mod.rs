//! CLI command implementations
//!
//! Each submodule implements a command group for the CLI.

pub mod block;
pub mod blocklist;
pub mod branch;
pub mod completions;
pub mod config;
pub mod fork;
pub mod identity;
pub mod node;
pub mod post;
pub mod search;
pub mod space;
pub mod sponsor;
pub mod sync;
pub mod test;

use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use crate::cli::config::CliConfig;
use crate::cli::error::{CliError, Result};

/// Check if a node is running on the given address.
///
/// Attempts a TCP connection with a short timeout to detect if a node
/// is listening. This is used to enforce the "no ephemeral clients" policy -
/// content operations require a running node.
pub fn require_running_node(addr: SocketAddr) -> Result<()> {
    let timeout = Duration::from_millis(500);

    match TcpStream::connect_timeout(&addr, timeout) {
        Ok(_) => Ok(()),
        Err(_) => Err(CliError::NoNodeRunning),
    }
}

/// Check if a node is running for the current config.
///
/// First checks for the .rpc_addr file (works with non-default ports),
/// then falls back to checking the default port.
pub fn require_running_node_for_config(config: &CliConfig) -> Result<()> {
    let data_dir = config.data_dir();

    // First, try to read the RPC address file (preferred - works with any port)
    let rpc_addr_file = data_dir.join(".rpc_addr");
    if rpc_addr_file.exists() {
        if let Ok(addr_str) = std::fs::read_to_string(&rpc_addr_file) {
            if let Ok(addr) = addr_str.trim().parse::<SocketAddr>() {
                // Try to connect to the RPC port
                return require_running_node(addr);
            }
        }
    }

    // Fall back to checking the P2P default port
    let port = config.network_mode.default_port();
    let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();
    require_running_node(addr)
}
