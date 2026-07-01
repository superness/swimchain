//! RPC Server Module
//!
//! Provides JSON-RPC 2.0 over HTTP interface for node control and content submission.
//!
//! # Architecture
//!
//! The RPC server is a separate component that runs alongside the P2P server:
//! - P2P Server (0.0.0.0:9735) - Network peer communication
//! - RPC Server (127.0.0.1:9736) - Local CLI/API access
//!
//! # Authentication
//!
//! All RPC requests require authentication via cookie or credentials:
//! - Cookie: Node generates random cookie at startup, writes to `<data_dir>/.cookie`
//! - Credentials: Optional username/password from config file
//!
//! # Protocol
//!
//! JSON-RPC 2.0 over HTTP POST:
//! ```text
//! POST / HTTP/1.1
//! Authorization: Basic <base64(user:cookie)>
//! Content-Type: application/json
//!
//! {"jsonrpc":"2.0","method":"get_info","params":{},"id":1}
//! ```
//!
//! # Methods
//!
//! ## Node Status
//! - `get_info` - Node version, network, uptime
//! - `get_peers` - Connected peer list
//! - `get_sync_status` - Sync progress
//! - `stop` - Graceful shutdown
//!
//! ## Peer Management
//! - `add_peer` - Connect to peer
//! - `remove_peer` - Disconnect peer
//!
//! ## Content Submission
//! - `submit_post` - Create new post
//! - `submit_reply` - Reply to content
//! - `submit_engagement` - Engage with content
//! - `submit_space` - Create space
//!
//! ## Content Query
//! - `get_content` - Get content by ID
//! - `list_space_content` - List content in space
//! - `request_content` - Request content from network

pub mod auth;
pub mod client;
pub mod error;
pub mod events;
pub mod methods;
pub mod rate_limiter;
pub mod server;
pub mod types;

pub use auth::{AuthCookie, Authenticator};
pub use client::{RpcClient, RpcClientConfig};
pub use error::RpcError;
pub use events::{Event, EventManager, EventType};
pub use methods::{NodeRef, RpcMethods};
pub use rate_limiter::{MethodCategory, RateLimitConfig, RateLimitResult, RpcRateLimiter};
pub use server::{RpcServer, RpcServerConfig, TlsConfig};
pub use types::*;

/// Default RPC port offset from P2P port
pub const RPC_PORT_OFFSET: u16 = 1;

/// Get RPC port for a given P2P port
pub fn rpc_port_for_p2p(p2p_port: u16) -> u16 {
    p2p_port + RPC_PORT_OFFSET
}
