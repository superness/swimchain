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
// ── MAINNET genesis ─────────────────────────────────────────────────────────
// The mainnet sponsor root. Regenerated 2026-07-22 (the 2026-07-16 key's seed was
// never durably saved and is unrecoverable; since mainnet had zero content it was
// reminted). Its SEED and PASSWORD are NOT in this repo and never should be — they
// live in the operator's secrets vault (see docs/MAINNET_LAUNCH_READINESS.md B1).
// Only the PUBLIC key appears here. This list is network-gated so the testnet
// genesis (whose secret is public in project files) can NEVER be a mainnet sponsor.
// Public key: 994fd0af22ebc66fcc5da4cdc1cdb94500d18d2dcec514415edeb975a84809e3
// Address: cs1qzv5l590yt4uvm7vtkjvmswdh9zsp5vd9h8v29zptm0tjadgfqy7xccn5ac
const MAINNET_GENESIS_LIST: &[(PublicKey, GenesisDistributionCategory)] = &[(
    PublicKey::from_bytes([
        0x99, 0x4f, 0xd0, 0xaf, 0x22, 0xeb, 0xc6, 0x6f, 0xcc, 0x5d, 0xa4, 0xcd, 0xc1, 0xcd, 0xb9,
        0x45, 0x00, 0xd1, 0x8d, 0x2d, 0xce, 0xc5, 0x14, 0x41, 0x5e, 0xde, 0xb9, 0x75, 0xa8, 0x48,
        0x09, 0xe3,
    ]),
    GenesisDistributionCategory::TeamMember,
)];

// ── TESTNET / dev genesis ───────────────────────────────────────────────────
// These identities' secrets ARE known within the project (demos, faucet). That
// is fine for testnet and regtest and is EXACTLY why they must never be mainnet
// sponsors — the network gate below enforces that.
const TESTNET_GENESIS_LIST: &[(PublicKey, GenesisDistributionCategory)] = &[
    // Primary (legacy) dev genesis identity.
    // Public key: 64f2875ac6e9b41dbdd0ff0e0add3a71c75e441a115a0853e3188bdaf16e812f
    (
        PublicKey::from_bytes([
            0x64, 0xf2, 0x87, 0x5a, 0xc6, 0xe9, 0xb4, 0x1d, 0xbd, 0xd0, 0xff, 0x0e, 0x0a, 0xdd,
            0x3a, 0x71, 0xc7, 0x5e, 0x44, 0x1a, 0x11, 0x5a, 0x08, 0x53, 0xe3, 0x18, 0x8b, 0xda,
            0xf1, 0x6e, 0x81, 0x2f,
        ]),
        GenesisDistributionCategory::TeamMember,
    ),
    // Testnet genesis identity (created 2026-01-30). Secret is documented in
    // project files (GENESIS_IDENTITY.md); testnet-only for that reason.
    // Public key: 9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420
    (
        PublicKey::from_bytes([
            0x9e, 0xc9, 0x66, 0x1d, 0x3a, 0x97, 0x5a, 0xd1, 0x41, 0xca, 0xa5, 0xdf, 0x9f, 0x14,
            0xb3, 0xc4, 0x6c, 0xf7, 0x25, 0x50, 0x9e, 0x7f, 0xa0, 0x44, 0xc1, 0x9d, 0x26, 0xfe,
            0x76, 0xbd, 0x04, 0x20,
        ]),
        GenesisDistributionCategory::TeamMember,
    ),
];

/// The genesis list for the ACTIVE network. Mainnet gets ONLY the securely-held
/// mainnet genesis; testnet/regtest get the dev identities. This gate is what
/// keeps a publicly-known dev key from holding sponsor root on mainnet.
#[must_use]
pub fn active_genesis_list() -> &'static [(PublicKey, GenesisDistributionCategory)] {
    match crate::network::NetworkContext::mode() {
        crate::network::NetworkMode::Mainnet => MAINNET_GENESIS_LIST,
        _ => TESTNET_GENESIS_LIST,
    }
}

/// Check if pubkey is a genesis identity on the ACTIVE network.
#[must_use]
pub fn is_in_hardcoded_genesis_list(pubkey: &PublicKey) -> bool {
    active_genesis_list().iter().any(|(pk, _)| pk == pubkey)
}

/// Operator-designated mainnet GAME sponsor identities (pubkey hex). These — and
/// ONLY these — may run capped auto-approve onboarding offers on mainnet: the
/// sanctioned reef/chess exception to the general faucet-off. Their onboarding
/// path roots at the sponsor's own subtree (contained by tree-poisoning), not a
/// general genesis-rooted faucet. Add a game sponsor's pubkey here to bless it.
const MAINNET_GAME_SPONSORS: &[&str] = &[
    // reef/chess game bot (mainnet node on 165.22.47.107), genesis-sponsored.
    "0530df507ad26a2ee6d0c61ef1e37e4e08abae087c1755467d98e3435ecd2984",
];

/// True if `sponsor_pubkey_hex` is an operator-designated mainnet game sponsor
/// allowed to run auto-approve onboarding offers on mainnet.
#[must_use]
pub fn is_mainnet_game_sponsor(sponsor_pubkey_hex: &str) -> bool {
    MAINNET_GAME_SPONSORS.contains(&sponsor_pubkey_hex)
}

/// Get the genesis list for the active network (for testing/debugging).
#[must_use]
pub fn get_hardcoded_genesis_list() -> &'static [(PublicKey, GenesisDistributionCategory)] {
    active_genesis_list()
}

/// Get category for a genesis identity on the active network.
#[must_use]
pub fn get_genesis_category(pubkey: &PublicKey) -> Option<GenesisDistributionCategory> {
    active_genesis_list()
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
