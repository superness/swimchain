//! Peer discovery and address management (SPEC_06 §4.1)
//!
//! This module implements the six-layer discovery stack:
//! - Layer 0: Cached peers (persistent storage, checked first)
//! - Layer 1: mDNS (LAN discovery via `_swimchain._tcp.local`)
//! - Layer 2: Social (QR codes, links - handled externally)
//! - Layer 3: Introduction points (seed nodes)
//! - Layer 4: DHT (future)
//! - Layer 5: Peer exchange (GETADDR/ADDR)
//!
//! # Key Types
//!
//! - [`PeerKey`]: Unique identifier for a peer (67 bytes)
//! - [`PeerEntry`]: Extended peer data with scoring (95 bytes)
//! - [`PeerStore`]: Persistent sled-backed peer cache
//! - [`AddrHandler`]: GETADDR/ADDR message processing with rate limiting
//! - [`PeerExchange`]: Peer exchange decision logic
//! - [`DiscoveryManager`]: Unified coordinator
//!
//! # Example
//!
//! ```no_run
//! use std::path::Path;
//! use swimchain::discovery::DiscoveryManager;
//!
//! let manager = DiscoveryManager::new(Path::new("/tmp/peers")).unwrap();
//!
//! // Bootstrap: get initial peers to connect to
//! let peers = manager.bootstrap().unwrap();
//! for peer in peers {
//!     println!("Connect to {:?}:{}", peer.address, peer.port);
//! }
//! ```

pub mod addr_handler;
pub mod error;
pub mod manager;
pub mod mdns;
pub mod peer_branches;
pub mod peer_entry;
pub mod peer_exchange;
pub mod peer_key;
pub mod peer_store;
pub mod seed_list;

pub use addr_handler::AddrHandler;
pub use error::DiscoveryError;
pub use manager::{DiscoveryManager, MaintenanceStats};
pub use mdns::{MdnsDiscoveredPeer, MdnsDiscovery, MDNS_SERVICE_NAME};
pub use peer_branches::{BranchCoverageSummary, PeerBranchInfo, PeerBranchTracker};
pub use peer_entry::PeerEntry;
pub use peer_exchange::PeerExchange;
pub use peer_key::PeerKey;
pub use peer_store::PeerStore;
pub use seed_list::{default_dev_seeds, default_mainnet_seeds, SeedEntry, TransportType};
