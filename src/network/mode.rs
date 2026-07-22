//! Network mode configuration
//!
//! Defines the different network modes for Swimchain, following Bitcoin's model:
//! - Mainnet: Production network with full rules
//! - Testnet: Public test network with relaxed rules
//! - Regtest: Local regression testing with minimal rules
//!
//! # Example
//!
//! ```
//! use swimchain::network::NetworkMode;
//!
//! let mode = NetworkMode::Regtest;
//! assert!(mode.allows_skip_level_check());
//! assert_eq!(mode.default_port(), 19735);
//! ```

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU8, Ordering};

/// Global network mode for the current process.
/// This is set once at startup and used by all components.
static ACTIVE_NETWORK_MODE: AtomicU8 = AtomicU8::new(0); // 0 = Mainnet

/// Network context for accessing the current network mode and its properties.
///
/// This provides a centralized way for all components to access network-specific
/// configuration like magic bytes, data directories, and validation rules.
pub struct NetworkContext;

impl NetworkContext {
    /// Set the active network mode for this process.
    /// Should be called once at startup, before any networking operations.
    pub fn set_mode(mode: NetworkMode) {
        ACTIVE_NETWORK_MODE.store(mode.to_u8(), Ordering::SeqCst);
    }

    /// Get the current network mode.
    #[must_use]
    pub fn mode() -> NetworkMode {
        NetworkMode::from_u8(ACTIVE_NETWORK_MODE.load(Ordering::SeqCst))
    }

    /// Get the magic bytes for the current network.
    /// Used for message framing and network isolation.
    #[must_use]
    pub fn magic_bytes() -> [u8; 4] {
        Self::mode().magic_bytes()
    }

    /// Check if a set of magic bytes matches the current network.
    #[must_use]
    pub fn validate_magic(magic: [u8; 4]) -> bool {
        magic == Self::magic_bytes()
    }

    /// Get the data directory suffix for the current network.
    /// Returns empty string for mainnet, "-testnet" or "-regtest" for others.
    #[must_use]
    pub fn data_dir_suffix() -> &'static str {
        match Self::mode() {
            NetworkMode::Mainnet => "",
            NetworkMode::Testnet => "-testnet",
            NetworkMode::Regtest => "-regtest",
        }
    }

    /// Get the expected magic bytes for a specific network mode.
    /// Useful for error messages explaining which network was expected.
    #[must_use]
    pub fn expected_magic_display() -> String {
        let m = Self::magic_bytes();
        format!(
            "{} (0x{:02X}{:02X}{:02X}{:02X})",
            Self::mode().name(),
            m[0],
            m[1],
            m[2],
            m[3]
        )
    }
}

/// Network mode determines which network the node participates in
/// and what rules apply.
///
/// Following Bitcoin's model:
/// - Mainnet: Production network, full rules enforced
/// - Testnet: Public test network, relaxed rules for testing
/// - Regtest: Local testing, minimal rules for rapid development
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum NetworkMode {
    /// Production network
    ///
    /// Full rules enforced:
    /// - Level gating for spaces, images, attestations
    /// - Full PoW requirements
    /// - Sponsorship required for identity
    /// - Real decay mechanics
    #[default]
    Mainnet,

    /// Public test network
    ///
    /// Relaxed rules for testing:
    /// - Reduced PoW difficulty (1/10th)
    /// - Faster decay (1/10th time)
    /// - Level gating still enforced
    /// - Separate network from mainnet
    Testnet,

    /// Local regression testing
    ///
    /// Minimal rules for development:
    /// - Level checks bypassed (all users treated as Pool Keeper)
    /// - Minimal PoW (near-instant)
    /// - Rapid decay (seconds instead of days)
    /// - Self-sponsorship allowed
    /// - Single-node operation supported
    Regtest,
}

impl NetworkMode {
    /// Get the default P2P port for this network mode
    ///
    /// - Mainnet: 9735
    /// - Testnet: 19735
    /// - Regtest: 29735
    pub fn default_port(&self) -> u16 {
        match self {
            NetworkMode::Mainnet => 9735,
            NetworkMode::Testnet => 19735,
            NetworkMode::Regtest => 29735,
        }
    }

    /// Get the default RPC port for this network mode
    ///
    /// RPC port is P2P port + 1:
    /// - Mainnet: 9736
    /// - Testnet: 19736
    /// - Regtest: 29736
    pub fn default_rpc_port(&self) -> u16 {
        self.default_port() + 1
    }

    /// Get the magic bytes for network message identification
    ///
    /// Prevents cross-network message pollution.
    pub fn magic_bytes(&self) -> [u8; 4] {
        match self {
            NetworkMode::Mainnet => [0x53, 0x57, 0x49, 0x4D], // "SWIM"
            NetworkMode::Testnet => [0x54, 0x45, 0x53, 0x34], // "TES4" (re-bump: action-signature enforcement fork)
            NetworkMode::Regtest => [0x52, 0x45, 0x47, 0x54], // "REGT"
        }
    }

    /// Get the human-readable network name
    pub fn name(&self) -> &'static str {
        match self {
            NetworkMode::Mainnet => "mainnet",
            NetworkMode::Testnet => "testnet",
            NetworkMode::Regtest => "regtest",
        }
    }

    /// Get the human-readable display name
    pub fn display_name(&self) -> &'static str {
        match self {
            NetworkMode::Mainnet => "Swimchain Mainnet",
            NetworkMode::Testnet => "Swimchain Testnet",
            NetworkMode::Regtest => "Swimchain Regtest",
        }
    }

    /// Whether level checks should be bypassed
    ///
    /// In regtest mode, all users are treated as having Pool Keeper level
    /// to allow rapid testing without earning contribution credits.
    pub fn allows_skip_level_check(&self) -> bool {
        matches!(self, NetworkMode::Regtest)
    }

    /// Whether self-sponsorship is allowed
    ///
    /// In regtest mode, users can create identities without a sponsor.
    pub fn allows_self_sponsorship(&self) -> bool {
        matches!(self, NetworkMode::Regtest)
    }

    /// Get the PoW difficulty multiplier
    ///
    /// - Mainnet: 1.0 (full difficulty)
    /// - Testnet: 0.1 (10% of mainnet)
    /// - Regtest: 0.001 (0.1% of mainnet, near-instant)
    pub fn pow_difficulty_multiplier(&self) -> f64 {
        match self {
            NetworkMode::Mainnet => 1.0,
            NetworkMode::Testnet => 0.1,
            NetworkMode::Regtest => 0.001,
        }
    }

    /// Scale a root-block formation difficulty target by this network's PoW multiplier.
    ///
    /// Per-action PoW is scaled by `pow_difficulty_multiplier()` (mainnet 1.0,
    /// testnet 0.1, regtest 0.001), so each action contributes proportionally less
    /// PoW-seconds toward a root block. The block-formation threshold MUST be scaled
    /// by the same factor, otherwise low-traffic testnet/regtest chains never seal a
    /// block and content sits `pending` forever (SWIM-BLOCK-THRESHOLD).
    ///
    /// The result is floored at 1 so regtest (30 * 0.001 = 0.03 -> 1) requires at
    /// least a single small action to seal a block, rather than 0 which would allow
    /// instant/empty-block spam.
    ///
    /// # Consensus
    ///
    /// The scaled value is stamped into `RootBlock.difficulty_target` at formation and
    /// is part of the block hash. Validation (`RootBlock::verify_difficulty`) checks
    /// `total_pow >= self.difficulty_target` against the block's OWN field, so all
    /// nodes on a given network agree without any external constant. All formation on
    /// a network must use this same scaled value.
    ///
    /// # Examples
    ///
    /// ```
    /// use swimchain::network::NetworkMode;
    ///
    /// assert_eq!(NetworkMode::Mainnet.scaled_block_difficulty(30), 30);
    /// assert_eq!(NetworkMode::Testnet.scaled_block_difficulty(30), 3);
    /// assert_eq!(NetworkMode::Regtest.scaled_block_difficulty(30), 1); // floored
    /// ```
    #[must_use]
    pub fn scaled_block_difficulty(&self, base_difficulty: u64) -> u64 {
        let scaled = (base_difficulty as f64 * self.pow_difficulty_multiplier()).round();
        (scaled as u64).max(1)
    }

    /// Get the decay time multiplier
    ///
    /// - Mainnet: 1.0 (normal decay)
    /// - Testnet: 0.1 (10x faster decay)
    /// - Regtest: 0.001 (1000x faster, seconds instead of days)
    pub fn decay_time_multiplier(&self) -> f64 {
        match self {
            NetworkMode::Mainnet => 1.0,
            NetworkMode::Testnet => 0.1,
            NetworkMode::Regtest => 0.001,
        }
    }

    /// Get adjusted PoW difficulty for this network mode.
    ///
    /// Reduces the base difficulty bits based on the network mode multiplier.
    /// The SPEC_03 base constants encode RELATIVE cost; they are shifted down
    /// per network to land at a usable wall-clock for that network's Argon2id
    /// config (mainnet 64 MiB ~94 ms/hash, testnet 8 MiB ~5 ms/hash):
    /// - Mainnet: base - 13 (e.g., 22 -> 9 bits ≈ 48 s at 64 MiB)
    /// - Testnet: base - 10 (e.g., 22 -> 12 bits ≈ a few s at 8 MiB)
    /// - Regtest: 4 bits (near-instant)
    ///
    /// # Examples
    ///
    /// ```
    /// use swimchain::network::NetworkMode;
    ///
    /// // Space creation (22 bits base)
    /// assert_eq!(NetworkMode::Mainnet.adjusted_difficulty(22), 9);
    /// assert_eq!(NetworkMode::Testnet.adjusted_difficulty(22), 12);
    /// assert_eq!(NetworkMode::Regtest.adjusted_difficulty(22), 4);
    /// ```
    #[must_use]
    pub fn adjusted_difficulty(&self, base_difficulty: u8) -> u8 {
        match self {
            NetworkMode::Mainnet => {
                // The SPEC_03 base constants (Space 22 / Post 20 / Reply 18 /
                // Engage 16) predate the memory-hard Argon2id config: at the
                // production 64 MiB params (~94 ms/hash, measured), 20 bits is
                // ~2^20 * 94 ms ≈ 27 HOURS — unusable. The base numbers encode
                // relative cost, not absolute bits for this config. Shift them
                // down by 13 bits so mainnet lands at usable, still memory-hard,
                // still anti-spam wall-clock (single-thread, desktop-class):
                //   Space  9 bits ≈ 48 s
                //   Post   7 bits ≈ 12 s
                //   Reply  5 bits ≈  3 s
                //   Engage 4 bits ≈  1.5 s (floor)
                // The 64 MiB memory-hardness (not the bit count) is what denies
                // cheap GPU/ASIC farming; the bits set the honest wall-clock.
                base_difficulty.saturating_sub(13).max(4)
            }
            NetworkMode::Testnet => {
                // Reduce by ~10 bits for testnet (1/1024 the work)
                base_difficulty.saturating_sub(10).max(4)
            }
            NetworkMode::Regtest => {
                // Use minimum difficulty (4 bits = ~16 attempts)
                4
            }
        }
    }

    /// Get the address prefix for this network
    ///
    /// - Mainnet: "sw1"
    /// - Testnet: "st1"
    /// - Regtest: "sr1"
    pub fn address_prefix(&self) -> &'static str {
        match self {
            NetworkMode::Mainnet => "sw1",
            NetworkMode::Testnet => "st1",
            NetworkMode::Regtest => "sr1",
        }
    }

    /// Get minimum peers required to start operations
    ///
    /// - Mainnet: 8 (need diverse peers for security)
    /// - Testnet: 4 (relaxed for testing)
    /// - Regtest: 0 (single-node operation allowed)
    pub fn min_peers(&self) -> usize {
        match self {
            NetworkMode::Mainnet => 8,
            NetworkMode::Testnet => 4,
            NetworkMode::Regtest => 0,
        }
    }

    /// Whether this is a development/testing mode
    pub fn is_dev_mode(&self) -> bool {
        !matches!(self, NetworkMode::Mainnet)
    }

    /// Parse network mode from string
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "mainnet" | "main" => Some(NetworkMode::Mainnet),
            "testnet" | "test" => Some(NetworkMode::Testnet),
            "regtest" | "reg" | "dev" | "local" => Some(NetworkMode::Regtest),
            _ => None,
        }
    }

    /// Convert to u8 for atomic storage
    #[must_use]
    pub const fn to_u8(self) -> u8 {
        match self {
            NetworkMode::Mainnet => 0,
            NetworkMode::Testnet => 1,
            NetworkMode::Regtest => 2,
        }
    }

    /// Convert from u8 (from atomic storage)
    #[must_use]
    pub const fn from_u8(value: u8) -> Self {
        match value {
            1 => NetworkMode::Testnet,
            2 => NetworkMode::Regtest,
            _ => NetworkMode::Mainnet, // Default to mainnet for invalid values
        }
    }
}

impl std::fmt::Display for NetworkMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.name())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_is_mainnet() {
        assert_eq!(NetworkMode::default(), NetworkMode::Mainnet);
    }

    #[test]
    fn mainnet_action_difficulties_are_usable() {
        // SPEC_03 base constants: Space 22 / Post 20 / Reply 18 / Engage 16.
        // Mainnet shifts down by 13 (floor 4) to land at usable, memory-hard
        // wall-clock at the 64 MiB config (~94 ms/hash): Space ≈48s, Post ≈12s,
        // Reply ≈3s, Engage ≈1.5s. Regression guard against a re-broken 27h
        // mainnet Post.
        let m = NetworkMode::Mainnet;
        assert_eq!(m.adjusted_difficulty(22), 9, "space");
        assert_eq!(m.adjusted_difficulty(20), 7, "post");
        assert_eq!(m.adjusted_difficulty(18), 5, "reply");
        assert_eq!(m.adjusted_difficulty(16), 4, "engage (floor)");
        // Never below the network floor.
        assert_eq!(m.adjusted_difficulty(4), 4);
        assert_eq!(m.adjusted_difficulty(0), 4);
    }

    #[test]
    fn test_ports() {
        assert_eq!(NetworkMode::Mainnet.default_port(), 9735);
        assert_eq!(NetworkMode::Testnet.default_port(), 19735);
        assert_eq!(NetworkMode::Regtest.default_port(), 29735);
    }

    #[test]
    fn test_magic_bytes_unique() {
        let mainnet = NetworkMode::Mainnet.magic_bytes();
        let testnet = NetworkMode::Testnet.magic_bytes();
        let regtest = NetworkMode::Regtest.magic_bytes();

        assert_ne!(mainnet, testnet);
        assert_ne!(mainnet, regtest);
        assert_ne!(testnet, regtest);
    }

    #[test]
    fn test_level_check_bypass() {
        assert!(!NetworkMode::Mainnet.allows_skip_level_check());
        assert!(!NetworkMode::Testnet.allows_skip_level_check());
        assert!(NetworkMode::Regtest.allows_skip_level_check());
    }

    #[test]
    fn test_self_sponsorship() {
        assert!(!NetworkMode::Mainnet.allows_self_sponsorship());
        assert!(!NetworkMode::Testnet.allows_self_sponsorship());
        assert!(NetworkMode::Regtest.allows_self_sponsorship());
    }

    #[test]
    fn test_pow_difficulty() {
        assert_eq!(NetworkMode::Mainnet.pow_difficulty_multiplier(), 1.0);
        assert_eq!(NetworkMode::Testnet.pow_difficulty_multiplier(), 0.1);
        assert_eq!(NetworkMode::Regtest.pow_difficulty_multiplier(), 0.001);
    }

    #[test]
    fn test_scaled_block_difficulty() {
        // SWIM-BLOCK-THRESHOLD: root-block formation threshold must be scaled by the
        // same multiplier as per-action PoW, else low-traffic testnet/regtest never seal.
        assert_eq!(NetworkMode::Mainnet.scaled_block_difficulty(30), 30);
        assert_eq!(NetworkMode::Testnet.scaled_block_difficulty(30), 3);
        // regtest: 30 * 0.001 = 0.03 -> rounds to 0 -> floored to 1
        assert_eq!(NetworkMode::Regtest.scaled_block_difficulty(30), 1);
    }

    #[test]
    fn test_scaled_block_difficulty_floor() {
        // Floor at 1 for any tiny base so a single action can still seal a block.
        assert_eq!(NetworkMode::Regtest.scaled_block_difficulty(1), 1);
        assert_eq!(NetworkMode::Regtest.scaled_block_difficulty(0), 1);
        assert_eq!(NetworkMode::Mainnet.scaled_block_difficulty(0), 1);
    }

    #[test]
    fn test_min_peers() {
        assert_eq!(NetworkMode::Mainnet.min_peers(), 8);
        assert_eq!(NetworkMode::Testnet.min_peers(), 4);
        assert_eq!(NetworkMode::Regtest.min_peers(), 0);
    }

    #[test]
    fn test_address_prefix() {
        assert_eq!(NetworkMode::Mainnet.address_prefix(), "sw1");
        assert_eq!(NetworkMode::Testnet.address_prefix(), "st1");
        assert_eq!(NetworkMode::Regtest.address_prefix(), "sr1");
    }

    #[test]
    fn test_is_dev_mode() {
        assert!(!NetworkMode::Mainnet.is_dev_mode());
        assert!(NetworkMode::Testnet.is_dev_mode());
        assert!(NetworkMode::Regtest.is_dev_mode());
    }

    #[test]
    fn test_from_str() {
        assert_eq!(NetworkMode::from_str("mainnet"), Some(NetworkMode::Mainnet));
        assert_eq!(NetworkMode::from_str("main"), Some(NetworkMode::Mainnet));
        assert_eq!(NetworkMode::from_str("testnet"), Some(NetworkMode::Testnet));
        assert_eq!(NetworkMode::from_str("test"), Some(NetworkMode::Testnet));
        assert_eq!(NetworkMode::from_str("regtest"), Some(NetworkMode::Regtest));
        assert_eq!(NetworkMode::from_str("dev"), Some(NetworkMode::Regtest));
        assert_eq!(NetworkMode::from_str("local"), Some(NetworkMode::Regtest));
        assert_eq!(NetworkMode::from_str("invalid"), None);
    }

    #[test]
    fn test_display() {
        assert_eq!(format!("{}", NetworkMode::Mainnet), "mainnet");
        assert_eq!(format!("{}", NetworkMode::Testnet), "testnet");
        assert_eq!(format!("{}", NetworkMode::Regtest), "regtest");
    }
}
