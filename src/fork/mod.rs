//! Fork mechanics for community escape (VISION §5 Fork-Friendly Chain Ecosystem)
//!
//! Provides the ability for communities to fork away from captured chains while
//! preserving identity, social graph, and optionally content.
//!
//! # Core Concepts
//!
//! - **Fork Genesis**: Configuration for a new fork (parent, exclusions, content selector)
//! - **Fork Identity Preservation**: Keys work across all forks (Theorem 5.1 in whitepaper)
//! - **Content Inheritance**: Selective content migration based on mode (All/None/Selective)
//! - **Exclusion Lists**: Bad actors can be excluded from new fork
//!
//! # Usage
//!
//! ```ignore
//! use swimchain::fork::{ForkConfig, ContentSelector, ForkRegistry};
//!
//! // Create a new fork from current chain
//! let config = ForkConfig::builder()
//!     .name("community-v2")
//!     .description("Fork away from hostile takeover")
//!     .exclude_identity(attacker_pubkey)
//!     .content_mode(ContentSelector::Selective {
//!         space_filter: Some(vec!["gardening".into()]),
//!         time_filter: Some(last_30_days),
//!         identity_filter: None,
//!     })
//!     .build();
//!
//! let fork_id = fork_registry.create_fork(config)?;
//! ```

mod genesis;
mod registry;
mod storage;

pub use genesis::{ContentSelector, ForkConfig, ForkGenesis};
pub use registry::{ForkRegistry, Identity};
pub use storage::ForkStore;

use crate::types::block::ForkId;

/// Calculate fork ID from genesis (SHA-256 of canonical serialization)
pub fn calculate_fork_id(genesis: &ForkGenesis) -> ForkId {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(&genesis.to_bytes());
    let result = hasher.finalize();

    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&result);
    ForkId::from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fork_id_deterministic() {
        let genesis = ForkGenesis::new(
            ForkId::main_chain(),
            0,
            [0u8; 32],
            "test-fork".into(),
            "Test fork".into(),
            [1u8; 32],
        );

        let id1 = calculate_fork_id(&genesis);
        let id2 = calculate_fork_id(&genesis);

        assert_eq!(id1, id2);
    }

    #[test]
    fn test_different_genesis_different_id() {
        let genesis1 = ForkGenesis::new(
            ForkId::main_chain(),
            0,
            [0u8; 32],
            "fork-1".into(),
            "First fork".into(),
            [1u8; 32],
        );

        let genesis2 = ForkGenesis::new(
            ForkId::main_chain(),
            0,
            [0u8; 32],
            "fork-2".into(),
            "Second fork".into(),
            [1u8; 32],
        );

        let id1 = calculate_fork_id(&genesis1);
        let id2 = calculate_fork_id(&genesis2);

        assert_ne!(id1, id2);
    }
}
