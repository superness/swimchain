//! Encrypted key storage for identity private keys
//!
//! Uses Argon2id for key derivation and ChaCha20-Poly1305 for encryption,
//! following OWASP recommendations for password-based encryption.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;

use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use rand::RngCore;
use zeroize::Zeroizing;

use crate::types::error::IdentityError;
use crate::types::identity::{KeyPair, PrivateKey, PublicKey};

/// Argon2 time cost (iterations)
const ARGON2_TIME_COST: u32 = 3;

/// Argon2 memory cost in KiB (64 MB)
const ARGON2_MEM_COST: u32 = 65536;

/// Argon2 parallelism (lanes)
const ARGON2_PARALLELISM: u32 = 1;

/// Salt length in bytes
const SALT_LEN: usize = 16;

/// Nonce length for ChaCha20-Poly1305
const NONCE_LEN: usize = 12;

/// Poly1305 authentication tag length
const TAG_LEN: usize = 16;

/// Private key size (seed + public key)
const PRIVATE_KEY_SIZE: usize = 64;

/// File extension for encrypted key files
const KEY_FILE_EXT: &str = ".key";

/// Encrypt a private key with a passphrase
///
/// Returns: salt(16) || nonce(12) || ciphertext(64 + 16 tag)
/// Total: 108 bytes
///
/// # Arguments
/// * `private_key` - The private key to encrypt
/// * `passphrase` - The passphrase to derive the encryption key from
///
/// # Returns
/// The encrypted key blob
pub fn encrypt_private_key(
    private_key: &PrivateKey,
    passphrase: &str,
) -> Result<Vec<u8>, IdentityError> {
    let mut rng = rand::rngs::OsRng;

    // 1. Generate random salt
    let mut salt = [0u8; SALT_LEN];
    rng.fill_bytes(&mut salt);

    // 2. Derive key with Argon2id
    let key = derive_key(passphrase, &salt)?;

    // 3. Generate random nonce
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // 4. Encrypt with ChaCha20-Poly1305
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&*key));
    let ciphertext = cipher
        .encrypt(nonce, private_key.as_bytes().as_ref())
        .map_err(|e| IdentityError::EncryptionError(e.to_string()))?;

    // 5. Assemble output: salt || nonce || ciphertext
    let mut result = Vec::with_capacity(SALT_LEN + NONCE_LEN + ciphertext.len());
    result.extend_from_slice(&salt);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypt a private key with a passphrase
///
/// # Arguments
/// * `encrypted` - The encrypted key blob (salt || nonce || ciphertext)
/// * `passphrase` - The passphrase to derive the decryption key from
///
/// # Returns
/// The decrypted private key
pub fn decrypt_private_key(
    encrypted: &[u8],
    passphrase: &str,
) -> Result<PrivateKey, IdentityError> {
    // Minimum size: salt(16) + nonce(12) + ciphertext(64) + tag(16) = 108
    let min_size = SALT_LEN + NONCE_LEN + PRIVATE_KEY_SIZE + TAG_LEN;
    if encrypted.len() < min_size {
        return Err(IdentityError::DecryptionError(format!(
            "encrypted data too short: {} < {min_size}",
            encrypted.len()
        )));
    }

    // Extract components
    let salt = &encrypted[..SALT_LEN];
    let nonce_bytes = &encrypted[SALT_LEN..SALT_LEN + NONCE_LEN];
    let ciphertext = &encrypted[SALT_LEN + NONCE_LEN..];

    // Derive key
    let key = derive_key(passphrase, salt)?;

    // Decrypt
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&*key));
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|_| {
        IdentityError::DecryptionError("decryption failed (wrong passphrase?)".to_string())
    })?;

    // Verify size
    if plaintext.len() != PRIVATE_KEY_SIZE {
        return Err(IdentityError::DecryptionError(format!(
            "decrypted key wrong size: {} != {PRIVATE_KEY_SIZE}",
            plaintext.len()
        )));
    }

    // Convert to private key
    let mut key_bytes = [0u8; PRIVATE_KEY_SIZE];
    key_bytes.copy_from_slice(&plaintext);
    Ok(PrivateKey::from_bytes(key_bytes))
}

/// Derive an encryption key from a passphrase using Argon2id
fn derive_key(passphrase: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, IdentityError> {
    let argon2 = Argon2::new(
        argon2::Algorithm::Argon2id,
        argon2::Version::V0x13,
        argon2::Params::new(
            ARGON2_MEM_COST,
            ARGON2_TIME_COST,
            ARGON2_PARALLELISM,
            Some(32),
        )
        .map_err(|e| IdentityError::KeyDerivationError(e.to_string()))?,
    );

    let mut key = Zeroizing::new([0u8; 32]);
    argon2
        .hash_password_into(passphrase.as_bytes(), salt, key.as_mut_slice())
        .map_err(|e| IdentityError::KeyDerivationError(e.to_string()))?;

    Ok(key)
}

/// File-based key storage
///
/// Stores encrypted private keys on disk, indexed by public key.
pub struct KeyStorage {
    /// Base directory for key storage
    base_path: PathBuf,
}

impl KeyStorage {
    /// Create a new key storage at the given path
    ///
    /// Creates the directory if it doesn't exist.
    pub fn new(base_path: impl Into<PathBuf>) -> Result<Self, IdentityError> {
        let base_path = base_path.into();
        fs::create_dir_all(&base_path).map_err(|e| {
            IdentityError::StorageError(format!("failed to create storage directory: {e}"))
        })?;
        Ok(Self { base_path })
    }

    /// Get the file path for a public key
    fn key_path(&self, public_key: &PublicKey) -> PathBuf {
        let hex = hex_encode(public_key.as_bytes());
        self.base_path.join(format!("{hex}{KEY_FILE_EXT}"))
    }

    /// Save a keypair with passphrase encryption
    pub fn save(&self, keypair: &KeyPair, passphrase: &str) -> Result<(), IdentityError> {
        let encrypted = encrypt_private_key(&keypair.private_key, passphrase)?;
        let path = self.key_path(&keypair.public_key);

        let mut file = File::create(&path)
            .map_err(|e| IdentityError::StorageError(format!("failed to create key file: {e}")))?;

        file.write_all(&encrypted)
            .map_err(|e| IdentityError::StorageError(format!("failed to write key file: {e}")))?;

        // Sync to ensure durability
        file.sync_all()
            .map_err(|e| IdentityError::StorageError(format!("failed to sync key file: {e}")))?;

        Ok(())
    }

    /// Load a keypair by public key
    pub fn load(&self, public_key: &PublicKey, passphrase: &str) -> Result<KeyPair, IdentityError> {
        let path = self.key_path(public_key);

        let mut file = File::open(&path)
            .map_err(|e| IdentityError::StorageError(format!("failed to open key file: {e}")))?;

        let mut encrypted = Vec::new();
        file.read_to_end(&mut encrypted)
            .map_err(|e| IdentityError::StorageError(format!("failed to read key file: {e}")))?;

        let private_key = decrypt_private_key(&encrypted, passphrase)?;

        Ok(KeyPair {
            public_key: *public_key,
            private_key,
        })
    }

    /// Check if a key exists
    #[must_use]
    pub fn exists(&self, public_key: &PublicKey) -> bool {
        self.key_path(public_key).exists()
    }

    /// List all stored public keys
    pub fn list(&self) -> Result<Vec<PublicKey>, IdentityError> {
        let mut keys = Vec::new();

        let entries = fs::read_dir(&self.base_path).map_err(|e| {
            IdentityError::StorageError(format!("failed to read storage directory: {e}"))
        })?;

        for entry in entries {
            let entry = entry.map_err(|e| {
                IdentityError::StorageError(format!("failed to read directory entry: {e}"))
            })?;
            let path = entry.path();

            if let Some(ext) = path.extension() {
                if ext == KEY_FILE_EXT.trim_start_matches('.') {
                    if let Some(stem) = path.file_stem() {
                        if let Some(stem_str) = stem.to_str() {
                            if let Some(bytes) = hex_decode(stem_str) {
                                if bytes.len() == 32 {
                                    let mut arr = [0u8; 32];
                                    arr.copy_from_slice(&bytes);
                                    keys.push(PublicKey::from_bytes(arr));
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(keys)
    }

    /// Delete a stored key
    pub fn delete(&self, public_key: &PublicKey) -> Result<(), IdentityError> {
        let path = self.key_path(public_key);

        if !path.exists() {
            return Err(IdentityError::StorageError("key not found".to_string()));
        }

        fs::remove_file(&path)
            .map_err(|e| IdentityError::StorageError(format!("failed to delete key file: {e}")))?;

        Ok(())
    }
}

// Simple hex encoding/decoding helpers to avoid additional dependencies

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }

    let mut bytes = Vec::with_capacity(s.len() / 2);
    for i in (0..s.len()).step_by(2) {
        let byte = u8::from_str_radix(&s[i..i + 2], 16).ok()?;
        bytes.push(byte);
    }
    Some(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::signature::generate_keypair;
    use tempfile::tempdir;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let keypair = generate_keypair();
        let passphrase = "test-password-123";

        let encrypted = encrypt_private_key(&keypair.private_key, passphrase).unwrap();
        let decrypted = decrypt_private_key(&encrypted, passphrase).unwrap();

        assert_eq!(decrypted.as_bytes(), keypair.private_key.as_bytes());
    }

    #[test]
    fn test_wrong_passphrase_fails() {
        let keypair = generate_keypair();

        let encrypted = encrypt_private_key(&keypair.private_key, "correct").unwrap();
        let result = decrypt_private_key(&encrypted, "wrong");

        assert!(matches!(result, Err(IdentityError::DecryptionError(_))));
    }

    #[test]
    fn test_encrypted_size() {
        let keypair = generate_keypair();
        let encrypted = encrypt_private_key(&keypair.private_key, "pass").unwrap();

        // salt(16) + nonce(12) + ciphertext(64) + tag(16) = 108
        assert_eq!(encrypted.len(), 108);
    }

    #[test]
    fn test_storage_save_load() {
        let dir = tempdir().unwrap();
        let storage = KeyStorage::new(dir.path()).unwrap();

        let keypair = generate_keypair();
        let passphrase = "storage-test";

        storage.save(&keypair, passphrase).unwrap();
        assert!(storage.exists(&keypair.public_key));

        let loaded = storage.load(&keypair.public_key, passphrase).unwrap();
        assert_eq!(
            loaded.private_key.as_bytes(),
            keypair.private_key.as_bytes()
        );
    }

    #[test]
    fn test_storage_list() {
        let dir = tempdir().unwrap();
        let storage = KeyStorage::new(dir.path()).unwrap();

        let kp1 = generate_keypair();
        let kp2 = generate_keypair();

        storage.save(&kp1, "pass1").unwrap();
        storage.save(&kp2, "pass2").unwrap();

        let keys = storage.list().unwrap();
        assert_eq!(keys.len(), 2);
    }

    #[test]
    fn test_storage_delete() {
        let dir = tempdir().unwrap();
        let storage = KeyStorage::new(dir.path()).unwrap();

        let keypair = generate_keypair();
        storage.save(&keypair, "pass").unwrap();

        assert!(storage.exists(&keypair.public_key));
        storage.delete(&keypair.public_key).unwrap();
        assert!(!storage.exists(&keypair.public_key));
    }

    #[test]
    fn test_corrupted_data_fails() {
        let keypair = generate_keypair();
        let mut encrypted = encrypt_private_key(&keypair.private_key, "pass").unwrap();

        // Corrupt the ciphertext
        encrypted[50] ^= 0xFF;

        let result = decrypt_private_key(&encrypted, "pass");
        assert!(matches!(result, Err(IdentityError::DecryptionError(_))));
    }

    #[test]
    fn test_truncated_data_fails() {
        let keypair = generate_keypair();
        let encrypted = encrypt_private_key(&keypair.private_key, "pass").unwrap();

        // Truncate
        let result = decrypt_private_key(&encrypted[..50], "pass");
        assert!(matches!(result, Err(IdentityError::DecryptionError(_))));
    }
}
