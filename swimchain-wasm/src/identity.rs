//! Identity management for WASM
//!
//! Provides Ed25519 keypair generation, address encoding/decoding,
//! and signature operations. Mirrors src/crypto/address.rs from the main crate.

use bech32::{Bech32m, Hrp};
use ed25519_dalek::{Signer, SigningKey, Verifier, VerifyingKey};
use wasm_bindgen::prelude::*;
use zeroize::Zeroizing;

use crate::error::{invalid_address, invalid_public_key, invalid_signature, WasmError};

/// Human-readable prefix for Bech32m addresses (SPEC_01 §3.3)
const ADDRESS_HRP: &str = "cs";

/// Current address version byte (SPEC_01 §3.3)
const ADDRESS_VERSION: u8 = 0;

/// Ed25519 keypair for identity operations
///
/// Provides key generation, signing, and address derivation.
/// The secret key is stored internally and cannot be exported directly
/// for security reasons.
#[wasm_bindgen]
pub struct WasmKeypair {
    /// Secret signing key (not exposed to JavaScript)
    #[wasm_bindgen(skip)]
    secret: SigningKey,
    /// Public verification key
    verifying: VerifyingKey,
}

#[wasm_bindgen]
impl WasmKeypair {
    /// Generate a new random keypair
    ///
    /// Uses the browser's cryptographically secure random number generator.
    ///
    /// # Example (JavaScript)
    /// ```js
    /// const keypair = new WasmKeypair();
    /// console.log(keypair.address()); // cs1...
    /// ```
    #[wasm_bindgen(constructor)]
    pub fn new() -> Result<WasmKeypair, JsValue> {
        let mut rng = rand_core::OsRng;
        let secret = SigningKey::generate(&mut rng);
        let verifying = secret.verifying_key();
        Ok(WasmKeypair { secret, verifying })
    }

    /// Create a keypair from a 32-byte seed
    ///
    /// The seed must be exactly 32 bytes and should be generated from
    /// a cryptographically secure source.
    ///
    /// # Arguments
    /// * `seed` - 32-byte seed value
    ///
    /// # Returns
    /// A new keypair derived from the seed
    #[wasm_bindgen(js_name = "fromSeed")]
    pub fn from_seed(seed: &[u8]) -> Result<WasmKeypair, JsValue> {
        if seed.len() != 32 {
            return Err(
                invalid_public_key(format!("Seed must be 32 bytes, got {}", seed.len())).into(),
            );
        }

        // Use Zeroizing to ensure the seed copy is zeroed when dropped
        let mut seed_array: Zeroizing<[u8; 32]> = Zeroizing::new([0u8; 32]);
        seed_array.copy_from_slice(seed);

        let secret = SigningKey::from_bytes(&seed_array);
        let verifying = secret.verifying_key();

        Ok(WasmKeypair { secret, verifying })
        // seed_array is zeroed here when Zeroizing<T> is dropped
    }

    /// Get the public key as a 32-byte array
    ///
    /// # Returns
    /// 32-byte Ed25519 public key
    #[wasm_bindgen(js_name = "publicKey")]
    pub fn public_key(&self) -> Vec<u8> {
        self.verifying.to_bytes().to_vec()
    }

    /// Get the seed (private key) as a 32-byte array
    ///
    /// WARNING: The seed IS the private key. Store it securely (encrypted).
    /// Anyone with access to this seed can sign messages as this identity.
    ///
    /// # Returns
    /// 32-byte Ed25519 seed (private key)
    ///
    /// # Example (JavaScript)
    /// ```js
    /// const keypair = new WasmKeypair();
    /// const seed = keypair.seed();
    /// // Encrypt and store the seed securely
    /// localStorage.setItem('identity_seed', encrypt(seed));
    ///
    /// // Later, recreate keypair from seed
    /// const savedSeed = decrypt(localStorage.getItem('identity_seed'));
    /// const restoredKeypair = WasmKeypair.fromSeed(savedSeed);
    /// ```
    pub fn seed(&self) -> Vec<u8> {
        self.secret.to_bytes().to_vec()
    }

    /// Sign a message with this keypair
    ///
    /// # Arguments
    /// * `message` - The message to sign
    ///
    /// # Returns
    /// 64-byte Ed25519 signature
    ///
    /// # Example (JavaScript)
    /// ```js
    /// const keypair = new WasmKeypair();
    /// const message = new TextEncoder().encode("Hello");
    /// const signature = keypair.sign(message);
    /// console.log(signature.length); // 64
    /// ```
    pub fn sign(&self, message: &[u8]) -> Vec<u8> {
        self.secret.sign(message).to_bytes().to_vec()
    }

    /// Get the Bech32m address for this keypair
    ///
    /// Returns an address in the format "cs1..." (Swimchain addresses).
    ///
    /// # Returns
    /// Bech32m-encoded address string
    ///
    /// # Example (JavaScript)
    /// ```js
    /// const keypair = new WasmKeypair();
    /// const addr = keypair.address();
    /// console.log(addr.startsWith("cs1")); // true
    /// ```
    ///
    /// # Panics
    /// This method should never panic as it uses the keypair's own valid public key.
    /// If it does panic, it indicates a bug in the cryptographic library.
    pub fn address(&self) -> String {
        encode_address_internal(&self.verifying.to_bytes())
            .unwrap_or_else(|e| panic!("BUG: Failed to encode address from valid keypair: {}", e))
    }
}

impl Default for WasmKeypair {
    /// Creates a new random keypair using the OS random number generator.
    ///
    /// # Panics
    /// Panics if the OS random number generator fails, which should never happen
    /// on a properly functioning system. This uses `OsRng` from `rand_core`.
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| panic!("BUG: Keypair generation failed: {:?}", e))
    }
}

/// Encode a public key as a Bech32m address
///
/// # Arguments
/// * `public_key` - 32-byte Ed25519 public key
///
/// # Returns
/// Bech32m-encoded address string starting with "cs1"
///
/// # Example (JavaScript)
/// ```js
/// const pubkey = keypair.publicKey();
/// const address = encode_address(pubkey);
/// console.log(address.startsWith("cs1")); // true
/// ```
#[wasm_bindgen]
pub fn encode_address(public_key: &[u8]) -> Result<String, JsValue> {
    encode_address_internal(public_key).map_err(|e| e.into())
}

fn encode_address_internal(public_key: &[u8]) -> Result<String, WasmError> {
    if public_key.len() != 32 {
        return Err(invalid_public_key(format!(
            "Public key must be 32 bytes, got {}",
            public_key.len()
        )));
    }

    let hrp = Hrp::parse(ADDRESS_HRP).map_err(|e| invalid_address(format!("Invalid HRP: {}", e)))?;
    let mut data = Vec::with_capacity(33);
    data.push(ADDRESS_VERSION);
    data.extend_from_slice(public_key);

    bech32::encode::<Bech32m>(hrp, &data)
        .map_err(|e| invalid_address(format!("Encoding failed: {}", e)))
}

/// Decode a Bech32m address to a public key
///
/// # Arguments
/// * `address` - Bech32m-encoded address string
///
/// # Returns
/// 32-byte Ed25519 public key
///
/// # Errors
/// Returns an error if the address is invalid, has wrong prefix,
/// unsupported version, or wrong length.
///
/// # Example (JavaScript)
/// ```js
/// const pubkey = decode_address("cs1qqqq...");
/// console.log(pubkey.length); // 32
/// ```
#[wasm_bindgen]
pub fn decode_address(address: &str) -> Result<Vec<u8>, JsValue> {
    decode_address_internal(address).map_err(|e| e.into())
}

fn decode_address_internal(address: &str) -> Result<Vec<u8>, WasmError> {
    let (hrp, data) =
        bech32::decode(address).map_err(|e| invalid_address(format!("Bech32 error: {}", e)))?;

    // Check HRP
    if hrp.as_str() != ADDRESS_HRP {
        return Err(invalid_address(format!(
            "Invalid prefix: expected '{}', got '{}'",
            ADDRESS_HRP,
            hrp.as_str()
        )));
    }

    // Check minimum length (version + 32 bytes)
    if data.is_empty() {
        return Err(invalid_address("Empty address data"));
    }

    // Check version
    if data[0] != ADDRESS_VERSION {
        return Err(invalid_address(format!("Unsupported version: {}", data[0])));
    }

    // Check payload length
    if data.len() != 33 {
        return Err(invalid_address(format!(
            "Invalid length: expected 33 bytes, got {}",
            data.len()
        )));
    }

    // Extract public key
    Ok(data[1..].to_vec())
}

/// Verify a signature against a message and public key
///
/// # Arguments
/// * `pubkey` - 32-byte Ed25519 public key
/// * `message` - The message that was signed
/// * `signature` - 64-byte Ed25519 signature
///
/// # Returns
/// `true` if the signature is valid, `false` otherwise
///
/// # Example (JavaScript)
/// ```js
/// const isValid = verify_signature(pubkey, message, signature);
/// ```
#[wasm_bindgen]
pub fn verify_signature(pubkey: &[u8], message: &[u8], signature: &[u8]) -> bool {
    verify_signature_internal(pubkey, message, signature).unwrap_or(false)
}

fn verify_signature_internal(
    pubkey: &[u8],
    message: &[u8],
    signature: &[u8],
) -> Result<bool, WasmError> {
    if pubkey.len() != 32 {
        return Err(invalid_public_key(format!(
            "Public key must be 32 bytes, got {}",
            pubkey.len()
        )));
    }

    if signature.len() != 64 {
        return Err(invalid_signature(format!(
            "Signature must be 64 bytes, got {}",
            signature.len()
        )));
    }

    let mut pubkey_bytes = [0u8; 32];
    pubkey_bytes.copy_from_slice(pubkey);

    let mut sig_bytes = [0u8; 64];
    sig_bytes.copy_from_slice(signature);

    let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)
        .map_err(|e| invalid_public_key(format!("Invalid public key: {}", e)))?;

    let sig = ed25519_dalek::Signature::from_bytes(&sig_bytes);

    Ok(verifying_key.verify(message, &sig).is_ok())
}

/// Check if a string is a valid Swimchain address
///
/// # Arguments
/// * `address` - The address string to validate
///
/// # Returns
/// `true` if the address is valid, `false` otherwise
#[wasm_bindgen]
pub fn is_valid_address(address: &str) -> bool {
    decode_address_internal(address).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let kp = WasmKeypair::new().unwrap();
        assert_eq!(kp.public_key().len(), 32);
    }

    #[test]
    fn test_address_starts_with_cs1() {
        let kp = WasmKeypair::new().unwrap();
        let addr = kp.address();
        assert!(addr.starts_with("cs1"));
    }

    #[test]
    fn test_address_roundtrip() {
        let kp = WasmKeypair::new().unwrap();
        let pk = kp.public_key();
        let addr = encode_address(&pk).unwrap();
        let decoded = decode_address(&addr).unwrap();
        assert_eq!(pk, decoded);
    }

    #[test]
    fn test_signature_verification() {
        let kp = WasmKeypair::new().unwrap();
        let message = b"test message";
        let sig = kp.sign(message);

        assert!(verify_signature(&kp.public_key(), message, &sig));

        // Wrong message should fail
        let wrong_message = b"wrong message";
        assert!(!verify_signature(&kp.public_key(), wrong_message, &sig));
    }

    #[test]
    fn test_from_seed_deterministic() {
        let seed = [42u8; 32];
        let kp1 = WasmKeypair::from_seed(&seed).unwrap();
        let kp2 = WasmKeypair::from_seed(&seed).unwrap();
        assert_eq!(kp1.public_key(), kp2.public_key());
    }

    #[test]
    fn test_decode_invalid_address() {
        assert!(decode_address_internal("invalid").is_err());
        assert!(decode_address_internal("bc1qqqq").is_err()); // Wrong prefix
    }

    #[test]
    fn test_is_valid_address() {
        let kp = WasmKeypair::new().unwrap();
        let addr = kp.address();
        assert!(is_valid_address(&addr));
        assert!(!is_valid_address("invalid"));
    }
}
