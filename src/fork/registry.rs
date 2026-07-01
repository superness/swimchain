//! Fork registry for managing fork operations

use std::sync::{Arc, RwLock};

use crate::storage::ChainStore;
use crate::types::block::ForkId;
use crate::types::identity::KeyPair;

use super::storage::{ForkStore, ForkStoreError};
use super::{calculate_fork_id, ContentSelector, ForkConfig, ForkGenesis};

/// Simple identity wrapper for fork operations
#[derive(Clone)]
pub struct Identity {
    keypair: KeyPair,
}

impl Identity {
    /// Create identity from a 32-byte secret key (seed)
    pub fn from_secret_key(seed: &[u8; 32]) -> Result<Self, String> {
        // Create keypair from seed using ed25519-dalek
        let signing_key = ed25519_dalek::SigningKey::from_bytes(seed);
        let verifying_key = signing_key.verifying_key();

        // Private key format: 32-byte seed || 32-byte public key
        let mut private_bytes = [0u8; 64];
        private_bytes[..32].copy_from_slice(&signing_key.to_bytes());
        private_bytes[32..].copy_from_slice(verifying_key.as_bytes());

        Ok(Self {
            keypair: KeyPair {
                public_key: crate::types::identity::PublicKey::from_bytes(*verifying_key.as_bytes()),
                private_key: crate::types::identity::PrivateKey::from_bytes(private_bytes),
            },
        })
    }

    /// Generate a new random identity
    pub fn generate() -> Result<Self, String> {
        let keypair = crate::identity::generate_keypair();
        Ok(Self { keypair })
    }

    /// Get the public key bytes
    pub fn public_key(&self) -> [u8; 32] {
        *self.keypair.public_key.as_bytes()
    }

    /// Sign a message
    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        let sig = crate::identity::sign(&self.keypair.private_key, message);
        *sig.as_bytes()
    }
}

/// Error types for fork operations
#[derive(Debug, thiserror::Error)]
pub enum ForkError {
    #[error("Storage error: {0}")]
    Storage(#[from] ForkStoreError),
    #[error("Fork not found: {0:?}")]
    NotFound(ForkId),
    #[error("Fork already exists: {0:?}")]
    AlreadyExists(ForkId),
    #[error("Invalid fork configuration: {0}")]
    InvalidConfig(String),
    #[error("Signature error: {0}")]
    SignatureError(String),
    #[error("Chain error: {0}")]
    ChainError(String),
    #[error("Identity required for fork creation")]
    IdentityRequired,
}

/// Fork creation result
#[derive(Debug)]
pub struct ForkCreationResult {
    /// The new fork's ID
    pub fork_id: ForkId,
    /// The genesis block
    pub genesis: ForkGenesis,
    /// Number of content items that will be inherited
    pub inherited_content_count: u64,
    /// Number of identities excluded
    pub excluded_count: usize,
}

/// Fork registry manages fork creation, switching, and discovery
pub struct ForkRegistry {
    /// Fork storage
    store: Arc<ForkStore>,
    /// Chain store for accessing current chain state
    chain_store: Option<Arc<ChainStore>>,
    /// Current active fork (cached)
    active_fork: RwLock<ForkId>,
}

impl ForkRegistry {
    /// Create a new fork registry
    pub fn new(store: Arc<ForkStore>, chain_store: Option<Arc<ChainStore>>) -> Self {
        let active_fork = store
            .get_active_fork()
            .unwrap_or_else(|_| ForkId::main_chain());

        Self {
            store,
            chain_store,
            active_fork: RwLock::new(active_fork),
        }
    }

    /// Get the current active fork
    #[must_use]
    pub fn active_fork(&self) -> ForkId {
        *self
            .active_fork
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Create a new fork from the current chain state
    pub fn create_fork(
        &self,
        config: ForkConfig,
        identity: &Identity,
    ) -> Result<ForkCreationResult, ForkError> {
        // Validate config
        if config.name.is_empty() {
            return Err(ForkError::InvalidConfig("Fork name is required".into()));
        }

        if config.name.len() > 64 {
            return Err(ForkError::InvalidConfig(
                "Fork name too long (max 64 chars)".into(),
            ));
        }

        if config.description.len() > 4096 {
            return Err(ForkError::InvalidConfig(
                "Fork description too long (max 4096 chars)".into(),
            ));
        }

        // Get current chain state
        let (parent_height, parent_block) = if let Some(ref chain_store) = self.chain_store {
            let height = chain_store.get_latest_height().ok().flatten().unwrap_or(0);
            let block = if let Ok(Some(hash)) = chain_store.get_root_hash_at_height(height) {
                let bytes: &[u8] = hash.as_ref();
                let mut arr = [0u8; 32];
                if bytes.len() >= 32 {
                    arr.copy_from_slice(&bytes[..32]);
                }
                arr
            } else {
                [0u8; 32]
            };
            (height, block)
        } else {
            (0, [0u8; 32])
        };

        // Create genesis
        let mut genesis = ForkGenesis::new(
            self.active_fork(),
            parent_height,
            parent_block,
            config.name.clone(),
            config.description.clone(),
            identity.public_key(),
        )
        .with_config(&config);

        // Sign the genesis (use signing bytes that exclude signatures)
        let bytes = genesis.to_bytes_for_signing();
        let signature = identity.sign(&bytes);
        genesis.creator_sig = signature;

        // Calculate fork ID
        let fork_id = calculate_fork_id(&genesis);

        // Check if fork already exists
        if self.store.contains(&fork_id)? {
            return Err(ForkError::AlreadyExists(fork_id));
        }

        // Calculate inherited content count (estimation)
        let inherited_content_count = match &config.content_selector {
            ContentSelector::All => {
                // Estimate based on chain height
                parent_height.saturating_mul(10) // Rough estimate
            }
            ContentSelector::None => 0,
            ContentSelector::Selective { time_filter, .. } => {
                // Estimate based on time window
                if let Some(since) = time_filter {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let window = now.saturating_sub(*since);
                    // Rough estimate: 1 action per minute
                    window / 60
                } else {
                    parent_height.saturating_mul(5)
                }
            }
        };

        // Store the fork
        self.store.store_genesis(&fork_id, &genesis)?;

        Ok(ForkCreationResult {
            fork_id,
            genesis,
            inherited_content_count,
            excluded_count: config.excluded_ids.len(),
        })
    }

    /// Switch to a different fork
    pub fn switch_fork(&self, fork_id: ForkId) -> Result<(), ForkError> {
        // Main chain is always valid
        if fork_id == ForkId::main_chain() {
            self.store.set_active_fork(&fork_id)?;
            *self
                .active_fork
                .write()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = fork_id;
            return Ok(());
        }

        // Check fork exists
        if !self.store.contains(&fork_id)? {
            return Err(ForkError::NotFound(fork_id));
        }

        // Switch
        self.store.set_active_fork(&fork_id)?;
        *self
            .active_fork
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = fork_id;

        Ok(())
    }

    /// Get fork genesis by ID
    pub fn get_fork(&self, fork_id: &ForkId) -> Result<Option<ForkGenesis>, ForkError> {
        Ok(self.store.get_genesis(fork_id)?)
    }

    /// List all known forks
    pub fn list_forks(&self) -> Result<Vec<ForkId>, ForkError> {
        Ok(self.store.list_known_forks()?)
    }

    /// Get fork information summary
    pub fn get_fork_info(&self, fork_id: &ForkId) -> Result<ForkInfo, ForkError> {
        if *fork_id == ForkId::main_chain() {
            return Ok(ForkInfo {
                fork_id: *fork_id,
                name: "main".into(),
                description: "Main Swimchain network".into(),
                parent_fork: None,
                parent_height: 0,
                creator: [0u8; 32],
                timestamp: 0,
                excluded_count: 0,
                supporter_count: 0,
            });
        }

        let genesis = self
            .store
            .get_genesis(fork_id)?
            .ok_or_else(|| ForkError::NotFound(*fork_id))?;

        Ok(ForkInfo {
            fork_id: *fork_id,
            name: genesis.name,
            description: genesis.description,
            parent_fork: Some(genesis.parent_fork),
            parent_height: genesis.parent_height,
            creator: genesis.creator_id,
            timestamp: genesis.timestamp,
            excluded_count: genesis.excluded_ids.len(),
            supporter_count: genesis.supporter_sigs.len(),
        })
    }

    /// Check if an identity is excluded from the current fork
    pub fn is_excluded(&self, identity: &[u8; 32]) -> Result<bool, ForkError> {
        let active = self.active_fork();

        if active == ForkId::main_chain() {
            return Ok(false); // Main chain has no exclusions
        }

        if let Some(genesis) = self.store.get_genesis(&active)? {
            Ok(genesis.is_excluded(identity))
        } else {
            Ok(false)
        }
    }

    /// Add a support signature to a fork
    pub fn add_fork_support(
        &self,
        fork_id: &ForkId,
        supporter_pubkey: [u8; 32],
        signature: [u8; 64],
    ) -> Result<(), ForkError> {
        let mut genesis = self
            .store
            .get_genesis(fork_id)?
            .ok_or_else(|| ForkError::NotFound(*fork_id))?;

        // Get genesis bytes for signature verification (excluding supporter_sigs)
        let bytes = genesis.to_bytes_for_signing();

        // Verify supporter signature before storing
        let pubkey = crate::types::identity::PublicKey::from_bytes(supporter_pubkey);
        let sig = crate::types::identity::Signature(signature);
        if !crate::crypto::signature::verify(&pubkey, &bytes, &sig) {
            return Err(ForkError::SignatureError(
                "Invalid supporter signature".into(),
            ));
        }

        genesis.add_supporter(supporter_pubkey, signature);

        // Update storage
        self.store.store_genesis(fork_id, &genesis)?;

        Ok(())
    }

    /// Delete a fork (only non-active forks)
    pub fn delete_fork(&self, fork_id: &ForkId) -> Result<(), ForkError> {
        if *fork_id == self.active_fork() {
            return Err(ForkError::InvalidConfig(
                "Cannot delete active fork".into(),
            ));
        }

        self.store.delete_fork(fork_id)?;
        Ok(())
    }

    /// Get the number of known forks
    pub fn fork_count(&self) -> Result<usize, ForkError> {
        Ok(self.store.fork_count()?)
    }
}

/// Fork information summary
#[derive(Debug, Clone)]
pub struct ForkInfo {
    /// Fork ID
    pub fork_id: ForkId,
    /// Fork name
    pub name: String,
    /// Fork description
    pub description: String,
    /// Parent fork (None for main chain)
    pub parent_fork: Option<ForkId>,
    /// Height in parent where fork occurred
    pub parent_height: u64,
    /// Creator's public key
    pub creator: [u8; 32],
    /// Creation timestamp
    pub timestamp: u64,
    /// Number of excluded identities
    pub excluded_count: usize,
    /// Number of supporters
    pub supporter_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_registry() -> (ForkRegistry, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db = sled::open(dir.path()).unwrap();
        let store = ForkStore::open(Arc::new(db)).unwrap();
        let registry = ForkRegistry::new(Arc::new(store), None);
        (registry, dir)
    }

    #[test]
    fn test_create_fork() {
        let (registry, _dir) = create_test_registry();

        // Create identity for signing
        let identity = Identity::generate().unwrap();

        let config = ForkConfig::builder()
            .name("test-fork")
            .description("A test fork")
            .build();

        let result = registry.create_fork(config, &identity).unwrap();

        assert!(!result.fork_id.as_bytes().iter().all(|&b| b == 0));
        assert_eq!(result.genesis.name, "test-fork");
    }

    #[test]
    fn test_switch_fork() {
        let (registry, _dir) = create_test_registry();
        let identity = Identity::generate().unwrap();

        // Create a fork
        let config = ForkConfig::builder().name("switchable-fork").build();
        let result = registry.create_fork(config, &identity).unwrap();

        // Initially on main chain
        assert_eq!(registry.active_fork(), ForkId::main_chain());

        // Switch to new fork
        registry.switch_fork(result.fork_id).unwrap();
        assert_eq!(registry.active_fork(), result.fork_id);

        // Switch back to main
        registry.switch_fork(ForkId::main_chain()).unwrap();
        assert_eq!(registry.active_fork(), ForkId::main_chain());
    }

    #[test]
    fn test_list_forks() {
        let (registry, _dir) = create_test_registry();
        let identity = Identity::generate().unwrap();

        // Create multiple forks
        for i in 1..=3 {
            let config = ForkConfig::builder()
                .name(format!("fork-{}", i))
                .build();
            registry.create_fork(config, &identity).unwrap();
        }

        let forks = registry.list_forks().unwrap();
        assert_eq!(forks.len(), 3);
    }

    #[test]
    fn test_exclusion_check() {
        let (registry, _dir) = create_test_registry();
        let identity = Identity::generate().unwrap();

        let bad_actor = [0xBA; 32];

        let config = ForkConfig::builder()
            .name("clean-fork")
            .exclude_identity(bad_actor)
            .build();

        let result = registry.create_fork(config, &identity).unwrap();
        registry.switch_fork(result.fork_id).unwrap();

        assert!(registry.is_excluded(&bad_actor).unwrap());
        assert!(!registry.is_excluded(&[0x00; 32]).unwrap());
    }

    #[test]
    fn test_fork_info() {
        let (registry, _dir) = create_test_registry();
        let identity = Identity::generate().unwrap();

        let config = ForkConfig::builder()
            .name("info-test")
            .description("A fork for testing info")
            .exclude_identity([1u8; 32])
            .build();

        let result = registry.create_fork(config, &identity).unwrap();
        let info = registry.get_fork_info(&result.fork_id).unwrap();

        assert_eq!(info.name, "info-test");
        assert_eq!(info.description, "A fork for testing info");
        assert_eq!(info.excluded_count, 1);
        assert_eq!(info.creator, identity.public_key());
    }

    #[test]
    fn test_main_chain_info() {
        let (registry, _dir) = create_test_registry();

        let info = registry.get_fork_info(&ForkId::main_chain()).unwrap();

        assert_eq!(info.name, "main");
        assert!(info.parent_fork.is_none());
    }

    #[test]
    fn test_fork_name_validation() {
        let (registry, _dir) = create_test_registry();
        let identity = Identity::generate().unwrap();

        // Empty name should fail
        let config = ForkConfig::builder().name("").build();
        let result = registry.create_fork(config, &identity);
        assert!(result.is_err());

        // Too long name should fail
        let config = ForkConfig::builder().name("a".repeat(100)).build();
        let result = registry.create_fork(config, &identity);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_fork_support() {
        let (registry, _dir) = create_test_registry();
        let creator = Identity::generate().unwrap();
        let supporter = Identity::generate().unwrap();

        let config = ForkConfig::builder().name("supported-fork").build();
        let result = registry.create_fork(config, &creator).unwrap();

        // Get genesis to sign
        let genesis = registry.get_fork(&result.fork_id).unwrap().unwrap();
        let bytes = genesis.to_bytes_for_signing();
        let signature = supporter.sign(&bytes);

        // Add supporter with valid signature
        registry
            .add_fork_support(&result.fork_id, supporter.public_key(), signature)
            .unwrap();

        let info = registry.get_fork_info(&result.fork_id).unwrap();
        assert_eq!(info.supporter_count, 1);
    }

    #[test]
    fn test_add_fork_support_invalid_signature() {
        let (registry, _dir) = create_test_registry();
        let creator = Identity::generate().unwrap();
        let supporter = Identity::generate().unwrap();

        let config = ForkConfig::builder().name("supported-fork-2").build();
        let result = registry.create_fork(config, &creator).unwrap();

        // Create invalid signature (sign wrong data)
        let fake_signature = supporter.sign(b"wrong data");

        // Should fail with invalid signature
        let err = registry
            .add_fork_support(&result.fork_id, supporter.public_key(), fake_signature)
            .unwrap_err();
        assert!(matches!(err, ForkError::SignatureError(_)));
    }
}
