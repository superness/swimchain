//! Fork Genesis types (VISION §5, Whitepaper Definition 5.1-5.4)
//!
//! A fork genesis defines the configuration for creating a new fork.

use std::collections::HashSet;

use crate::types::block::ForkId;

/// Maximum number of excluded identities to prevent DoS via crafted genesis
pub const MAX_EXCLUDED_IDS: usize = 10_000;

/// Maximum number of supporter signatures to prevent DoS via crafted genesis
pub const MAX_SUPPORTERS: usize = 1_000;

/// Content selection mode for fork inheritance
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentSelector {
    /// Inherit all content (except from excluded identities)
    All,
    /// Start fresh with no content
    None,
    /// Selective inheritance based on filters
    Selective {
        /// Only include content from these spaces (None = all spaces)
        space_filter: Option<Vec<String>>,
        /// Only include content newer than this timestamp (None = all time)
        time_filter: Option<u64>,
        /// Only include content from these identities (None = all identities)
        identity_filter: Option<Vec<[u8; 32]>>,
    },
}

impl Default for ContentSelector {
    fn default() -> Self {
        Self::All
    }
}

/// Fork configuration before finalization
#[derive(Debug, Clone)]
pub struct ForkConfig {
    /// Human-readable name for the fork
    pub name: String,
    /// Description of why the fork was created
    pub description: String,
    /// Identities to exclude from the new fork (bad actors)
    pub excluded_ids: HashSet<[u8; 32]>,
    /// Content inheritance mode
    pub content_selector: ContentSelector,
    /// Custom PoW difficulty adjustment (multiplier, 1.0 = same as parent)
    pub pow_multiplier: f64,
    /// Custom decay rate adjustment (multiplier, 1.0 = same as parent)
    pub decay_multiplier: f64,
}

impl Default for ForkConfig {
    fn default() -> Self {
        Self {
            name: String::new(),
            description: String::new(),
            excluded_ids: HashSet::new(),
            content_selector: ContentSelector::default(),
            pow_multiplier: 1.0,
            decay_multiplier: 1.0,
        }
    }
}

impl ForkConfig {
    /// Create a builder for fork configuration
    #[must_use]
    pub fn builder() -> ForkConfigBuilder {
        ForkConfigBuilder::default()
    }
}

/// Builder for fork configuration
#[derive(Debug, Default)]
pub struct ForkConfigBuilder {
    config: ForkConfig,
}

impl ForkConfigBuilder {
    /// Set the fork name
    #[must_use]
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.config.name = name.into();
        self
    }

    /// Set the fork description
    #[must_use]
    pub fn description(mut self, desc: impl Into<String>) -> Self {
        self.config.description = desc.into();
        self
    }

    /// Add an identity to exclude
    #[must_use]
    pub fn exclude_identity(mut self, id: [u8; 32]) -> Self {
        self.config.excluded_ids.insert(id);
        self
    }

    /// Add multiple identities to exclude
    #[must_use]
    pub fn exclude_identities(mut self, ids: impl IntoIterator<Item = [u8; 32]>) -> Self {
        self.config.excluded_ids.extend(ids);
        self
    }

    /// Set the content selection mode
    #[must_use]
    pub fn content_mode(mut self, mode: ContentSelector) -> Self {
        self.config.content_selector = mode;
        self
    }

    /// Set PoW difficulty multiplier (>1.0 = harder, <1.0 = easier)
    #[must_use]
    pub fn pow_multiplier(mut self, mult: f64) -> Self {
        self.config.pow_multiplier = mult.max(0.1).min(10.0); // Clamp to reasonable range
        self
    }

    /// Set decay rate multiplier (>1.0 = faster decay, <1.0 = slower decay)
    #[must_use]
    pub fn decay_multiplier(mut self, mult: f64) -> Self {
        self.config.decay_multiplier = mult.max(0.1).min(10.0);
        self
    }

    /// Build the fork configuration
    #[must_use]
    pub fn build(self) -> ForkConfig {
        self.config
    }
}

/// Fork genesis block (Whitepaper Definition 5.1)
///
/// A fork genesis contains all information needed to create and validate a new fork.
#[derive(Debug, Clone)]
pub struct ForkGenesis {
    /// Protocol version for this fork
    pub version: u32,
    /// Parent fork identifier (zeros for main chain)
    pub parent_fork: ForkId,
    /// Height in parent fork where this fork branches
    pub parent_height: u64,
    /// Block hash at parent_height in parent fork
    pub parent_block: [u8; 32],
    /// Timestamp of fork creation
    pub timestamp: u64,
    /// Human-readable fork name
    pub name: String,
    /// Fork description
    pub description: String,
    /// Custom configuration (serialized ForkConfig)
    pub config: Vec<u8>,
    /// Identities excluded from this fork
    pub excluded_ids: Vec<[u8; 32]>,
    /// Cached HashSet for O(1) exclusion lookups
    excluded_set: HashSet<[u8; 32]>,
    /// Content inheritance mode (serialized ContentSelector)
    pub content_selector_bytes: Vec<u8>,
    /// Creator's public key
    pub creator_id: [u8; 32],
    /// Creator's signature over canonical serialization
    pub creator_sig: [u8; 64],
    /// Supporter signatures (endorsements)
    pub supporter_sigs: Vec<([u8; 32], [u8; 64])>, // (pubkey, signature)
}

impl PartialEq for ForkGenesis {
    fn eq(&self, other: &Self) -> bool {
        self.version == other.version
            && self.parent_fork == other.parent_fork
            && self.parent_height == other.parent_height
            && self.parent_block == other.parent_block
            && self.timestamp == other.timestamp
            && self.name == other.name
            && self.description == other.description
            && self.config == other.config
            && self.excluded_ids == other.excluded_ids
            && self.content_selector_bytes == other.content_selector_bytes
            && self.creator_id == other.creator_id
            && self.creator_sig == other.creator_sig
            && self.supporter_sigs == other.supporter_sigs
    }
}

impl Eq for ForkGenesis {}

impl ForkGenesis {
    /// Create a new fork genesis
    pub fn new(
        parent_fork: ForkId,
        parent_height: u64,
        parent_block: [u8; 32],
        name: String,
        description: String,
        creator_id: [u8; 32],
    ) -> Self {
        Self {
            version: 1,
            parent_fork,
            parent_height,
            parent_block,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            name,
            description,
            config: Vec::new(),
            excluded_ids: Vec::new(),
            excluded_set: HashSet::new(),
            content_selector_bytes: Vec::new(),
            creator_id,
            creator_sig: [0u8; 64],
            supporter_sigs: Vec::new(),
        }
    }

    /// Create a genesis with configuration
    #[must_use]
    pub fn with_config(mut self, config: &ForkConfig) -> Self {
        self.excluded_ids = config.excluded_ids.iter().copied().collect();
        self.excluded_set = config.excluded_ids.clone();
        self.config = serialize_config(config);
        self.content_selector_bytes = serialize_content_selector(&config.content_selector);
        self
    }

    /// Add a supporter signature
    pub fn add_supporter(&mut self, pubkey: [u8; 32], signature: [u8; 64]) {
        self.supporter_sigs.push((pubkey, signature));
    }

    /// Check if an identity is excluded from this fork (O(1) lookup)
    #[must_use]
    pub fn is_excluded(&self, id: &[u8; 32]) -> bool {
        self.excluded_set.contains(id)
    }

    /// Get the number of supporters
    #[must_use]
    pub fn supporter_count(&self) -> usize {
        self.supporter_sigs.len()
    }

    /// Serialize to bytes for hashing/signing (excludes creator_sig and supporter_sigs)
    ///
    /// This is the canonical form that both creator and supporters sign over.
    pub fn to_bytes_for_signing(&self) -> Vec<u8> {
        let mut bytes = Vec::new();

        // Version
        bytes.extend_from_slice(&self.version.to_le_bytes());

        // Parent fork
        bytes.extend_from_slice(self.parent_fork.as_bytes());

        // Parent height
        bytes.extend_from_slice(&self.parent_height.to_le_bytes());

        // Parent block
        bytes.extend_from_slice(&self.parent_block);

        // Timestamp
        bytes.extend_from_slice(&self.timestamp.to_le_bytes());

        // Name length + name
        bytes.extend_from_slice(&(self.name.len() as u32).to_le_bytes());
        bytes.extend_from_slice(self.name.as_bytes());

        // Description length + description
        bytes.extend_from_slice(&(self.description.len() as u32).to_le_bytes());
        bytes.extend_from_slice(self.description.as_bytes());

        // Config length + config
        bytes.extend_from_slice(&(self.config.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&self.config);

        // Excluded IDs count + IDs
        bytes.extend_from_slice(&(self.excluded_ids.len() as u32).to_le_bytes());
        for id in &self.excluded_ids {
            bytes.extend_from_slice(id);
        }

        // Content selector length + bytes
        bytes.extend_from_slice(&(self.content_selector_bytes.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&self.content_selector_bytes);

        // Creator ID
        bytes.extend_from_slice(&self.creator_id);

        // Note: creator_sig and supporter_sigs are NOT included in signed bytes

        bytes
    }

    /// Serialize to bytes for storage (includes all fields)
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = self.to_bytes_for_signing();

        // Creator signature
        bytes.extend_from_slice(&self.creator_sig);

        // Supporter signatures count + data
        bytes.extend_from_slice(&(self.supporter_sigs.len() as u32).to_le_bytes());
        for (pubkey, sig) in &self.supporter_sigs {
            bytes.extend_from_slice(pubkey);
            bytes.extend_from_slice(sig);
        }

        bytes
    }

    /// Deserialize from bytes
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.len() < 4 + 32 + 8 + 32 + 8 + 4 {
            return None;
        }

        let mut pos = 0;

        // Version
        let version = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?);
        pos += 4;

        // Parent fork
        let mut parent_fork_bytes = [0u8; 32];
        parent_fork_bytes.copy_from_slice(&bytes[pos..pos + 32]);
        let parent_fork = ForkId::from_bytes(parent_fork_bytes);
        pos += 32;

        // Parent height
        let parent_height = u64::from_le_bytes(bytes[pos..pos + 8].try_into().ok()?);
        pos += 8;

        // Parent block
        let mut parent_block = [0u8; 32];
        parent_block.copy_from_slice(&bytes[pos..pos + 32]);
        pos += 32;

        // Timestamp
        let timestamp = u64::from_le_bytes(bytes[pos..pos + 8].try_into().ok()?);
        pos += 8;

        // Name
        let name_len = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
        pos += 4;
        if pos + name_len > bytes.len() {
            return None;
        }
        let name = String::from_utf8(bytes[pos..pos + name_len].to_vec()).ok()?;
        pos += name_len;

        // Description
        if pos + 4 > bytes.len() {
            return None;
        }
        let desc_len = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
        pos += 4;
        if pos + desc_len > bytes.len() {
            return None;
        }
        let description = String::from_utf8(bytes[pos..pos + desc_len].to_vec()).ok()?;
        pos += desc_len;

        // Config
        if pos + 4 > bytes.len() {
            return None;
        }
        let config_len = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
        pos += 4;
        if pos + config_len > bytes.len() {
            return None;
        }
        let config = bytes[pos..pos + config_len].to_vec();
        pos += config_len;

        // Excluded IDs
        if pos + 4 > bytes.len() {
            return None;
        }
        let excluded_count = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
        pos += 4;

        // Bounds check to prevent DoS via crafted genesis
        if excluded_count > MAX_EXCLUDED_IDS {
            return None;
        }

        let mut excluded_ids = Vec::with_capacity(excluded_count);
        for _ in 0..excluded_count {
            if pos + 32 > bytes.len() {
                return None;
            }
            let mut id = [0u8; 32];
            id.copy_from_slice(&bytes[pos..pos + 32]);
            excluded_ids.push(id);
            pos += 32;
        }

        // Content selector
        if pos + 4 > bytes.len() {
            return None;
        }
        let selector_len = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
        pos += 4;
        if pos + selector_len > bytes.len() {
            return None;
        }
        let content_selector_bytes = bytes[pos..pos + selector_len].to_vec();
        pos += selector_len;

        // Creator ID
        if pos + 32 > bytes.len() {
            return None;
        }
        let mut creator_id = [0u8; 32];
        creator_id.copy_from_slice(&bytes[pos..pos + 32]);
        pos += 32;

        // Creator signature
        let mut creator_sig = [0u8; 64];
        if pos + 64 <= bytes.len() {
            creator_sig.copy_from_slice(&bytes[pos..pos + 64]);
            pos += 64;
        }

        // Supporter signatures
        let mut supporter_sigs = Vec::new();
        if pos + 4 <= bytes.len() {
            let supporter_count = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
            pos += 4;

            // Bounds check to prevent DoS via crafted genesis
            if supporter_count > MAX_SUPPORTERS {
                return None;
            }

            for _ in 0..supporter_count {
                if pos + 32 + 64 > bytes.len() {
                    // Return None for incomplete data instead of silently truncating (H6 fix)
                    return None;
                }
                let mut pubkey = [0u8; 32];
                pubkey.copy_from_slice(&bytes[pos..pos + 32]);
                pos += 32;

                let mut sig = [0u8; 64];
                sig.copy_from_slice(&bytes[pos..pos + 64]);
                pos += 64;

                supporter_sigs.push((pubkey, sig));
            }
        }

        // Build the HashSet for O(1) lookups
        let excluded_set: HashSet<[u8; 32]> = excluded_ids.iter().copied().collect();

        Some(Self {
            version,
            parent_fork,
            parent_height,
            parent_block,
            timestamp,
            name,
            description,
            config,
            excluded_ids,
            excluded_set,
            content_selector_bytes,
            creator_id,
            creator_sig,
            supporter_sigs,
        })
    }
}

/// Serialize fork config to bytes
fn serialize_config(config: &ForkConfig) -> Vec<u8> {
    let mut bytes = Vec::new();

    // PoW multiplier as u16 (multiplier * 100)
    let pow_mult = (config.pow_multiplier * 100.0) as u16;
    bytes.extend_from_slice(&pow_mult.to_le_bytes());

    // Decay multiplier as u16 (multiplier * 100)
    let decay_mult = (config.decay_multiplier * 100.0) as u16;
    bytes.extend_from_slice(&decay_mult.to_le_bytes());

    bytes
}

/// Serialize content selector to bytes
fn serialize_content_selector(selector: &ContentSelector) -> Vec<u8> {
    let mut bytes = Vec::new();

    match selector {
        ContentSelector::All => {
            bytes.push(0);
        }
        ContentSelector::None => {
            bytes.push(1);
        }
        ContentSelector::Selective {
            space_filter,
            time_filter,
            identity_filter,
        } => {
            bytes.push(2);

            // Space filter
            if let Some(spaces) = space_filter {
                bytes.push(1);
                bytes.extend_from_slice(&(spaces.len() as u32).to_le_bytes());
                for space in spaces {
                    bytes.extend_from_slice(&(space.len() as u32).to_le_bytes());
                    bytes.extend_from_slice(space.as_bytes());
                }
            } else {
                bytes.push(0);
            }

            // Time filter
            if let Some(ts) = time_filter {
                bytes.push(1);
                bytes.extend_from_slice(&ts.to_le_bytes());
            } else {
                bytes.push(0);
            }

            // Identity filter
            if let Some(ids) = identity_filter {
                bytes.push(1);
                bytes.extend_from_slice(&(ids.len() as u32).to_le_bytes());
                for id in ids {
                    bytes.extend_from_slice(id);
                }
            } else {
                bytes.push(0);
            }
        }
    }

    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fork_config_builder() {
        let attacker1 = [1u8; 32];
        let attacker2 = [2u8; 32];

        let config = ForkConfig::builder()
            .name("safe-fork")
            .description("Escaping bad actors")
            .exclude_identity(attacker1)
            .exclude_identity(attacker2)
            .pow_multiplier(1.5)
            .decay_multiplier(0.8)
            .build();

        assert_eq!(config.name, "safe-fork");
        assert_eq!(config.excluded_ids.len(), 2);
        assert!(config.excluded_ids.contains(&attacker1));
        assert!(config.excluded_ids.contains(&attacker2));
        assert_eq!(config.pow_multiplier, 1.5);
        assert_eq!(config.decay_multiplier, 0.8);
    }

    #[test]
    fn test_fork_genesis_serialization() {
        let genesis = ForkGenesis::new(
            ForkId::main_chain(),
            100,
            [0xAB; 32],
            "test-fork".into(),
            "A test fork".into(),
            [0xCD; 32],
        );

        let bytes = genesis.to_bytes();
        let restored = ForkGenesis::from_bytes(&bytes).expect("Should deserialize");

        assert_eq!(restored.version, genesis.version);
        assert_eq!(restored.parent_fork, genesis.parent_fork);
        assert_eq!(restored.parent_height, genesis.parent_height);
        assert_eq!(restored.parent_block, genesis.parent_block);
        assert_eq!(restored.name, genesis.name);
        assert_eq!(restored.description, genesis.description);
        assert_eq!(restored.creator_id, genesis.creator_id);
    }

    #[test]
    fn test_fork_genesis_with_excluded() {
        let config = ForkConfig::builder()
            .name("clean-fork")
            .exclude_identity([1u8; 32])
            .exclude_identity([2u8; 32])
            .build();

        let genesis = ForkGenesis::new(
            ForkId::main_chain(),
            0,
            [0u8; 32],
            "clean-fork".into(),
            "".into(),
            [0u8; 32],
        )
        .with_config(&config);

        assert!(genesis.is_excluded(&[1u8; 32]));
        assert!(genesis.is_excluded(&[2u8; 32]));
        assert!(!genesis.is_excluded(&[3u8; 32]));
    }

    #[test]
    fn test_content_selector_default() {
        let selector = ContentSelector::default();
        assert!(matches!(selector, ContentSelector::All));
    }

    #[test]
    fn test_content_selector_selective() {
        let selector = ContentSelector::Selective {
            space_filter: Some(vec!["gardening".into(), "cooking".into()]),
            time_filter: Some(1_700_000_000),
            identity_filter: None,
        };

        if let ContentSelector::Selective {
            space_filter,
            time_filter,
            identity_filter,
        } = selector
        {
            assert_eq!(space_filter.as_ref().unwrap().len(), 2);
            assert_eq!(time_filter, Some(1_700_000_000));
            assert!(identity_filter.is_none());
        } else {
            panic!("Expected Selective");
        }
    }

    #[test]
    fn test_pow_multiplier_clamping() {
        let config = ForkConfig::builder().pow_multiplier(100.0).build();
        assert_eq!(config.pow_multiplier, 10.0); // Clamped to max

        let config = ForkConfig::builder().pow_multiplier(0.01).build();
        assert_eq!(config.pow_multiplier, 0.1); // Clamped to min
    }
}
