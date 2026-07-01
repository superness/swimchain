//! Kademlia DHT Implementation (SPEC_06 §3.8, RESEARCH_02)
//!
//! This module implements a Kademlia-based Distributed Hash Table for SwimChain.
//! The DHT is used for:
//!
//! 1. **Content Provider Discovery** - Find nodes that have specific content
//! 2. **Peer Discovery** - Find peers in the network by node ID
//!
//! # Key Design Decisions
//!
//! - **PoW-gated Node IDs**: Node IDs are derived from Ed25519 public keys with PoW,
//!   providing natural Sybil resistance (from RESEARCH_02)
//! - **Provider Records**: Content availability is stored as provider records
//!   (content_hash → list of nodes that have it)
//! - **K=8, α=3**: Standard Kademlia parameters (8 nodes per bucket, 3 parallel lookups)
//!
//! # Protocol Messages
//!
//! - `PING` (0x40): Liveness check
//! - `FIND_NODE` (0x41): Find k-closest nodes to a target ID
//! - `FIND_VALUE` (0x42): Find providers for a content hash
//! - `STORE` (0x43): Announce content availability
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                        DhtManager                            │
//! │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
//! │  │ RoutingTable│  │ ProviderStore│  │   LookupCoordinator │ │
//! │  │ (k-buckets) │  │  (content →  │  │ (iterative lookups) │ │
//! │  │             │  │   providers) │  │                     │ │
//! │  └─────────────┘  └─────────────┘  └─────────────────────┘ │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! # Example
//!
//! ```no_run
//! use swimchain::dht::{DhtManager, NodeId};
//!
//! // Create DHT manager with our node ID
//! let node_id = NodeId::from_public_key(&public_key);
//! let dht = DhtManager::new(node_id);
//!
//! // Find who has a piece of content
//! let content_hash = [0xab; 32];
//! let providers = dht.find_providers(&content_hash).await;
//!
//! // Announce that we have content
//! dht.announce_provider(&content_hash).await;
//! ```

pub mod constants;
pub mod error;
pub mod node_id;
pub mod provider_store;
pub mod routing_table;
pub mod manager;
pub mod lookup;
pub mod messages;
pub mod store_rate_limiter;
pub mod persistence;

pub use constants::*;
pub use error::{DhtError, DhtResult};
pub use node_id::NodeId;
pub use provider_store::{ProviderRecord, ProviderStore};
pub use routing_table::{KBucket, RoutingTable};
pub use manager::DhtManager;
pub use lookup::LookupCoordinator;
pub use messages::{AuthenticatedDhtMessage, DhtMessage, DhtMessageType, NodeInfo, SignedProviderInfo, MESSAGE_MAX_AGE_MS};
pub use store_rate_limiter::{StoreRateLimiter, StoreCheckResult};
pub use persistence::{DhtPersistence, DhtPersistenceStats};
