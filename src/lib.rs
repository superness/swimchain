//! Swimchain - Decentralized social media protocol
//!
//! See VISION.md for design philosophy and SPEC_01_IDENTITY.md for identity system.

pub mod achievement;
pub mod api;
pub mod attribution;
pub mod blocklist;
pub mod blocks;
pub mod branch;
pub mod cli;
pub mod content;
pub mod crypto;
pub mod device_constraints;
pub mod dht;
pub mod discovery;
pub mod engagement_graph;
pub mod fork;
pub mod identity;
pub mod network;
pub mod node;
pub mod notification;
pub mod reputation;
pub mod rpc;
pub mod seeding;
pub mod space_health;
pub mod spam_attestation;
pub mod spam_heuristics;
pub mod sponsorship;
pub mod storage;
pub mod sync;
pub mod transport;
pub mod types;

/// Protocol version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Returns true if the protocol is initialized (placeholder for actual initialization)
pub fn is_initialized() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_exists() {
        assert!(!VERSION.is_empty());
        assert!(VERSION.starts_with("0."));
    }

    #[test]
    fn test_initialization_placeholder() {
        assert!(is_initialized());
    }
}
