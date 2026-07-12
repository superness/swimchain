//! Blocklist Gossip Protocol for Swimchain
//!
//! This module implements SPEC_12 Sections 3.6, 4.4, 4.6, 5.4-5.5:
//! Distributed blocklist for illegal content (CSAM, terrorism).
//!
//! # Key Features
//!
//! - **BlocklistEntry**: Hash-based identification of blocked content
//! - **BlocklistGossip**: Gossip protocol for blocklist propagation
//! - **Merkle Sync**: Eventual consistency via Merkle root exchange
//! - **Sled Storage**: Persistent local blocklist storage
//!
//! # Protocol Overview
//!
//! 1. When 3+ independent sponsor trees attest content as illegal,
//!    the reporting node creates a BlocklistUpdate message.
//!
//! 2. BlocklistUpdate messages propagate via gossip to all peers.
//!
//! 3. Nodes validate attestations and add to local blocklist.
//!
//! 4. Periodic Merkle root exchange ensures eventual consistency.
//!
//! 5. Content matching blocklist is rejected on storage and retrieval.
//!
//! # Wire Protocol Messages
//!
//! - `0x55 MSG_BLOCKLIST_UPDATE`: Add/remove hash from blocklist
//! - `0x58 MSG_BLOCKLIST_SYNC`: Merkle root exchange for sync
//! - `0x59 MSG_BLOCKLIST_REQUEST`: Request specific blocklist entries
//!
//! # Removal Requirements
//!
//! Removing content from the blocklist requires 5 Anchor-level (Level 4+)
//! counter-attestations to prevent abuse of the removal process.
//!
//! See RESEARCH_08 (Attestation Mechanisms) for prior art analysis.

pub mod bundle;
pub mod error;
pub mod gossip;
pub mod import;
pub mod merkle;
pub mod storage;
pub mod types;

pub use error::{BlocklistError, BlocklistResult};
pub use import::{parse_import, ImportParseError, ImportRecord};
pub use gossip::{
    entry_from_update, parse_blocklist_message, BlocklistGossip, BlocklistMessage,
    BLOCKLIST_UPDATE_MAX_AGE_SECS, MSG_BLOCKLIST_REQUEST, MSG_BLOCKLIST_SYNC, MSG_BLOCKLIST_UPDATE,
};
pub use merkle::{
    build_proof, compute_diff, compute_merkle_root, IncrementalMerkleTree, MerkleProof, SyncState,
};
pub use storage::{BlocklistStats, BlocklistStore, MemoryBlocklistStore};
pub use types::{
    BlocklistEntry, BlocklistReason, BlocklistRequest, BlocklistSync, BlocklistUpdate,
    BlocklistUpdateType, BLOCKLIST_REMOVAL_THRESHOLD, BLOCKLIST_SYNC_INTERVAL_SECS,
    ILLEGAL_CONTENT_ATTESTATION_THRESHOLD, MIN_BLOCKLIST_CONFIRMATIONS,
};
