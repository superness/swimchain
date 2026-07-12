//! Fork storage using sled database

use sled::{Db, Tree};
use std::sync::Arc;

use crate::types::block::ForkId;

use super::ForkGenesis;

/// Error types for fork storage
#[derive(Debug, thiserror::Error)]
pub enum ForkStoreError {
    #[error("Storage error: {0}")]
    Storage(#[from] sled::Error),
    #[error("Fork not found: {0:?}")]
    NotFound(ForkId),
    #[error("Fork already exists: {0:?}")]
    AlreadyExists(ForkId),
    #[error("Deserialization error")]
    DeserializationError,
    #[error("Creator signature verification failed")]
    SignatureVerificationFailed,
}

/// Persistent storage for fork metadata
pub struct ForkStore {
    /// Sled database
    _db: Arc<Db>,
    /// Tree for fork genesis data: fork_id -> ForkGenesis bytes
    genesis_tree: Tree,
    /// Tree for known forks: "known" -> list of fork IDs
    known_tree: Tree,
    /// Tree for active fork: "active" -> fork_id
    active_tree: Tree,
}

impl ForkStore {
    /// Open or create fork storage
    pub fn open(db: Arc<Db>) -> Result<Self, ForkStoreError> {
        let genesis_tree = db.open_tree("fork_genesis")?;
        let known_tree = db.open_tree("fork_known")?;
        let active_tree = db.open_tree("fork_active")?;

        Ok(Self {
            _db: db,
            genesis_tree,
            known_tree,
            active_tree,
        })
    }

    /// Store a fork genesis
    pub fn store_genesis(
        &self,
        fork_id: &ForkId,
        genesis: &ForkGenesis,
    ) -> Result<(), ForkStoreError> {
        let bytes = genesis.to_bytes();
        self.genesis_tree.insert(fork_id.as_bytes(), bytes)?;

        // Add to known forks
        self.add_known_fork(fork_id)?;

        Ok(())
    }

    /// Get a fork genesis by ID
    ///
    /// Verifies the creator signature on load for integrity.
    pub fn get_genesis(&self, fork_id: &ForkId) -> Result<Option<ForkGenesis>, ForkStoreError> {
        if let Some(bytes) = self.genesis_tree.get(fork_id.as_bytes())? {
            let genesis =
                ForkGenesis::from_bytes(&bytes).ok_or(ForkStoreError::DeserializationError)?;

            // Verify creator signature on load
            if !Self::verify_creator_signature(&genesis) {
                return Err(ForkStoreError::SignatureVerificationFailed);
            }

            Ok(Some(genesis))
        } else {
            Ok(None)
        }
    }

    /// Verify the creator's signature on a genesis block
    fn verify_creator_signature(genesis: &ForkGenesis) -> bool {
        let bytes = genesis.to_bytes_for_signing();
        let pubkey = crate::types::identity::PublicKey::from_bytes(genesis.creator_id);
        let sig = crate::types::identity::Signature(genesis.creator_sig);
        crate::crypto::signature::verify(&pubkey, &bytes, &sig)
    }

    /// Check if a fork exists
    pub fn contains(&self, fork_id: &ForkId) -> Result<bool, ForkStoreError> {
        Ok(self.genesis_tree.contains_key(fork_id.as_bytes())?)
    }

    /// Get all known fork IDs
    pub fn list_known_forks(&self) -> Result<Vec<ForkId>, ForkStoreError> {
        let mut forks = Vec::new();

        if let Some(bytes) = self.known_tree.get("known")? {
            let count = bytes.len() / 32;
            for i in 0..count {
                let start = i * 32;
                let end = start + 32;
                if end <= bytes.len() {
                    let mut id_bytes = [0u8; 32];
                    id_bytes.copy_from_slice(&bytes[start..end]);
                    forks.push(ForkId::from_bytes(id_bytes));
                }
            }
        }

        Ok(forks)
    }

    /// Add a fork to known list
    fn add_known_fork(&self, fork_id: &ForkId) -> Result<(), ForkStoreError> {
        let mut known = self.known_tree.get("known")?.unwrap_or_default().to_vec();

        // Check if already present
        let existing_count = known.len() / 32;
        for i in 0..existing_count {
            let start = i * 32;
            if &known[start..start + 32] == fork_id.as_bytes() {
                return Ok(()); // Already known
            }
        }

        // Add new fork ID
        known.extend_from_slice(fork_id.as_bytes());
        self.known_tree.insert("known", known)?;

        Ok(())
    }

    /// Set the active fork
    pub fn set_active_fork(&self, fork_id: &ForkId) -> Result<(), ForkStoreError> {
        if !self.contains(fork_id)? && *fork_id != ForkId::main_chain() {
            return Err(ForkStoreError::NotFound(*fork_id));
        }

        self.active_tree
            .insert("active", fork_id.as_bytes().as_ref())?;
        Ok(())
    }

    /// Get the active fork (None = main chain)
    pub fn get_active_fork(&self) -> Result<ForkId, ForkStoreError> {
        if let Some(bytes) = self.active_tree.get("active")? {
            let mut id_bytes = [0u8; 32];
            if bytes.len() >= 32 {
                id_bytes.copy_from_slice(&bytes[..32]);
                Ok(ForkId::from_bytes(id_bytes))
            } else {
                Ok(ForkId::main_chain())
            }
        } else {
            Ok(ForkId::main_chain())
        }
    }

    /// Delete a fork (only works for non-active forks)
    pub fn delete_fork(&self, fork_id: &ForkId) -> Result<(), ForkStoreError> {
        let active = self.get_active_fork()?;
        if active == *fork_id {
            return Err(ForkStoreError::Storage(sled::Error::Io(
                std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "Cannot delete active fork",
                ),
            )));
        }

        self.genesis_tree.remove(fork_id.as_bytes())?;

        // Remove from known list
        if let Some(known) = self.known_tree.get("known")? {
            let mut new_known = Vec::new();
            let count = known.len() / 32;
            for i in 0..count {
                let start = i * 32;
                if &known[start..start + 32] != fork_id.as_bytes() {
                    new_known.extend_from_slice(&known[start..start + 32]);
                }
            }
            self.known_tree.insert("known", new_known)?;
        }

        Ok(())
    }

    /// Get fork count
    pub fn fork_count(&self) -> Result<usize, ForkStoreError> {
        Ok(self.list_known_forks()?.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn create_test_store() -> (ForkStore, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db = sled::open(dir.path()).unwrap();
        let store = ForkStore::open(Arc::new(db)).unwrap();
        (store, dir)
    }

    /// Create a properly signed genesis for testing
    fn create_signed_genesis(name: &str, description: &str) -> (ForkGenesis, [u8; 32]) {
        let keypair = crate::identity::generate_keypair();
        let creator_id = *keypair.public_key.as_bytes();

        let mut genesis = ForkGenesis::new(
            ForkId::main_chain(),
            0,
            [0u8; 32],
            name.into(),
            description.into(),
            creator_id,
        );

        // Sign the genesis
        let bytes = genesis.to_bytes_for_signing();
        let sig = crate::identity::sign(&keypair.private_key, &bytes);
        genesis.creator_sig = *sig.as_bytes();

        (genesis, creator_id)
    }

    #[test]
    fn test_store_and_retrieve_genesis() {
        let (store, _dir) = create_test_store();

        let (genesis, _creator_id) = create_signed_genesis("test-fork", "Test fork description");

        let fork_id = super::super::calculate_fork_id(&genesis);

        store.store_genesis(&fork_id, &genesis).unwrap();

        let retrieved = store.get_genesis(&fork_id).unwrap().unwrap();
        assert_eq!(retrieved.name, "test-fork");
        assert_eq!(retrieved.description, "Test fork description");
    }

    #[test]
    fn test_list_known_forks() {
        let (store, _dir) = create_test_store();

        let (genesis1, _) = create_signed_genesis("fork-1", "");
        let (genesis2, _) = create_signed_genesis("fork-2", "");

        let id1 = super::super::calculate_fork_id(&genesis1);
        let id2 = super::super::calculate_fork_id(&genesis2);

        store.store_genesis(&id1, &genesis1).unwrap();
        store.store_genesis(&id2, &genesis2).unwrap();

        let known = store.list_known_forks().unwrap();
        assert_eq!(known.len(), 2);
        assert!(known.contains(&id1));
        assert!(known.contains(&id2));
    }

    #[test]
    fn test_active_fork() {
        let (store, _dir) = create_test_store();

        // Default is main chain
        assert_eq!(store.get_active_fork().unwrap(), ForkId::main_chain());

        // Create and switch to a fork
        let (genesis, _) = create_signed_genesis("new-fork", "");

        let fork_id = super::super::calculate_fork_id(&genesis);
        store.store_genesis(&fork_id, &genesis).unwrap();
        store.set_active_fork(&fork_id).unwrap();

        assert_eq!(store.get_active_fork().unwrap(), fork_id);
    }

    #[test]
    fn test_delete_non_active_fork() {
        let (store, _dir) = create_test_store();

        let (genesis, _) = create_signed_genesis("deletable-fork", "");

        let fork_id = super::super::calculate_fork_id(&genesis);
        store.store_genesis(&fork_id, &genesis).unwrap();

        assert!(store.contains(&fork_id).unwrap());
        store.delete_fork(&fork_id).unwrap();
        assert!(!store.contains(&fork_id).unwrap());
    }

    #[test]
    fn test_cannot_delete_active_fork() {
        let (store, _dir) = create_test_store();

        let (genesis, _) = create_signed_genesis("active-fork", "");

        let fork_id = super::super::calculate_fork_id(&genesis);
        store.store_genesis(&fork_id, &genesis).unwrap();
        store.set_active_fork(&fork_id).unwrap();

        let result = store.delete_fork(&fork_id);
        assert!(result.is_err());
    }

    #[test]
    fn test_cannot_switch_to_unknown_fork() {
        let (store, _dir) = create_test_store();

        let unknown_fork = ForkId::from_bytes([0xAB; 32]);
        let result = store.set_active_fork(&unknown_fork);
        assert!(result.is_err());
    }
}
