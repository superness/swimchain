//! Hardcoded genesis identity list for network bootstrap
//!
//! Genesis identities are selected via hybrid approach:
//! - Team members (protocol developers)
//! - Contributors (significant pre-launch contributors)
//! - Community selected (governance process)
//!
//! Reference: SPEC_11 Section 3.9, RESEARCH_07
//!
//! ## Adding Genesis Identities
//!
//! 1. Generate identity: `sw identity create`
//! 2. Get public key: `sw identity show --format json`
//! 3. Convert to byte array and add to HARDCODED_GENESIS_LIST below
//! 4. Rebuild and deploy

use crate::types::identity::PublicKey;

/// Category of genesis identity selection
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GenesisDistributionCategory {
    /// Protocol developers and core team
    TeamMember,
    /// Significant pre-launch contributors
    Contributor,
    /// Selected through community governance
    CommunitySelected,
}

/// Hardcoded genesis public keys with their categories
///
/// IMPORTANT: Add your public key here before testnet/mainnet launch!
///
/// To add a genesis identity:
/// 1. Run: sw identity create
/// 2. Run: sw identity show --format json
/// 3. Take the public_key hex string
/// 4. Convert to bytes using: https://codebeautify.org/hex-to-bytes
/// 5. Add entry below
///
/// Example entry:
/// ```ignore
/// (
///     PublicKey::from_bytes([
///         0xab, 0xcd, 0xef, 0x12, 0x34, 0x56, 0x78, 0x9a,
///         0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a,
///         0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a,
///         0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a,
///     ]),
///     GenesisDistributionCategory::TeamMember,
/// ),
/// ```
const HARDCODED_GENESIS_LIST: &[(PublicKey, GenesisDistributionCategory)] = &[
    // Primary genesis identity
    // Public key: 64f2875ac6e9b41dbdd0ff0e0add3a71c75e441a115a0853e3188bdaf16e812f
    // Address: cs1qpj09p66cm5mg8da6rlsuzka8fcuwhjyrgg45zznuvvghkh3d6qj7qhmq6a
    (
        PublicKey::from_bytes([
            0x64, 0xf2, 0x87, 0x5a, 0xc6, 0xe9, 0xb4, 0x1d,
            0xbd, 0xd0, 0xff, 0x0e, 0x0a, 0xdd, 0x3a, 0x71,
            0xc7, 0x5e, 0x44, 0x1a, 0x11, 0x5a, 0x08, 0x53,
            0xe3, 0x18, 0x8b, 0xda, 0xf1, 0x6e, 0x81, 0x2f,
        ]),
        GenesisDistributionCategory::TeamMember,
    ),
    // New testnet genesis identity (created 2026-01-30)
    // Public key: 9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420
    // Address: cs1qz0vjesa82t4452pe2jal8c5k0zxeae92z08lgzycxwjdlnkh5zzqed2kj7
    // Password: testpass123
    // Seed backed up to: ~/.claude/skills/swimchain-services/GENESIS_SEED.txt
    (
        PublicKey::from_bytes([
            0x9e, 0xc9, 0x66, 0x1d, 0x3a, 0x97, 0x5a, 0xd1,
            0x41, 0xca, 0xa5, 0xdf, 0x9f, 0x14, 0xb3, 0xc4,
            0x6c, 0xf7, 0x25, 0x50, 0x9e, 0x7f, 0xa0, 0x44,
            0xc1, 0x9d, 0x26, 0xfe, 0x76, 0xbd, 0x04, 0x20,
        ]),
        GenesisDistributionCategory::TeamMember,
    ),
];

/// Check if pubkey is in the hardcoded genesis list
#[must_use]
pub fn is_in_hardcoded_genesis_list(pubkey: &PublicKey) -> bool {
    HARDCODED_GENESIS_LIST.iter().any(|(pk, _)| pk == pubkey)
}

/// Get the full hardcoded genesis list (for testing/debugging)
#[must_use]
pub fn get_hardcoded_genesis_list() -> &'static [(PublicKey, GenesisDistributionCategory)] {
    HARDCODED_GENESIS_LIST
}

/// Get category for a genesis identity
#[must_use]
pub fn get_genesis_category(pubkey: &PublicKey) -> Option<GenesisDistributionCategory> {
    HARDCODED_GENESIS_LIST
        .iter()
        .find(|(pk, _)| pk == pubkey)
        .map(|(_, category)| *category)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_genesis_list_has_entries() {
        // Genesis list should have at least one entry for testnet
        assert!(!get_hardcoded_genesis_list().is_empty());
    }

    #[test]
    fn test_not_in_genesis_list() {
        let random_key = PublicKey::from_bytes([42u8; 32]);
        assert!(!is_in_hardcoded_genesis_list(&random_key));
    }

    #[test]
    fn test_get_genesis_category_not_found() {
        let random_key = PublicKey::from_bytes([42u8; 32]);
        assert!(get_genesis_category(&random_key).is_none());
    }

    #[test]
    fn test_genesis_distribution_category_derives() {
        // Test that Clone, Copy, PartialEq, Eq work
        let cat1 = GenesisDistributionCategory::TeamMember;
        let cat2 = cat1;
        assert_eq!(cat1, cat2);
        assert_eq!(format!("{:?}", cat1), "TeamMember");
    }
}

#[cfg(test)]
pub mod test_helpers {
    use super::*;
    use std::sync::Mutex;

    /// Test-only genesis list for unit testing
    static TEST_GENESIS_LIST: Mutex<Vec<PublicKey>> = Mutex::new(Vec::new());

    /// Set the test genesis list (for testing only)
    pub fn set_test_genesis_list(keys: Vec<PublicKey>) {
        let mut list = TEST_GENESIS_LIST.lock().unwrap();
        *list = keys;
    }

    /// Clear the test genesis list
    pub fn clear_test_genesis_list() {
        let mut list = TEST_GENESIS_LIST.lock().unwrap();
        list.clear();
    }

    /// Check if pubkey is in the test genesis list
    pub fn is_in_test_genesis_list(pubkey: &PublicKey) -> bool {
        let list = TEST_GENESIS_LIST.lock().unwrap();
        list.contains(pubkey)
    }
}

#[cfg(test)]
pub use test_helpers::*;
