//! RPC Authentication
//!
//! Implements multiple authentication methods for RPC access:
//!
//! # Cookie Authentication
//!
//! On startup, the node generates a random 32-byte cookie and writes it to:
//! `<data_dir>/.cookie` with mode 0600 (owner read/write only).
//!
//! The CLI reads this cookie and sends it as HTTP Basic Auth:
//! `Authorization: Basic base64(__cookie__:<cookie_hex>)`
//!
//! This follows the bitcoin core pattern where the username is `__cookie__`.
//!
//! # Credential Authentication
//!
//! Alternatively, credentials can be configured in config:
//! ```toml
//! [rpc]
//! username = "swimchain"
//! password = "your-secure-password"
//! ```
//!
//! The CLI can then use these credentials:
//! `Authorization: Basic base64(username:password)`
//!
//! # Signature Authentication (for browser clients)
//!
//! Browser clients cannot read the cookie file, so they can authenticate
//! by signing requests with their identity keypair. This requires:
//!
//! - `X-CS-Identity`: The user's public key (64 hex chars = 32 bytes)
//! - `X-CS-Timestamp`: Current UNIX timestamp in seconds
//! - `X-CS-Signature`: Ed25519 signature (128 hex chars = 64 bytes) over:
//!   `"swimchain-rpc:" || method || ":" || sha256(params_json) || ":" || timestamp`
//!
//! The timestamp must be within tolerance (past: 1 hour, future: 5 minutes).

use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

use super::error::RpcError;

/// Constant-time string comparison to prevent timing attacks.
///
/// Returns true if both strings are equal, using XOR accumulation
/// to ensure comparison time is independent of where differences occur.
fn constant_time_str_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();

    // Length check - note: this does leak length information, but for
    // credentials of known fixed length (e.g., cookies) this is acceptable.
    // For variable-length secrets, consider hashing first.
    if a_bytes.len() != b_bytes.len() {
        return false;
    }

    let mut diff = 0u8;
    for (x, y) in a_bytes.iter().zip(b_bytes.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
use crate::crypto::signature::verify as ed25519_verify;
use crate::types::constants::{SIGNATURE_FUTURE_TOLERANCE_SECS, SIGNATURE_PAST_TOLERANCE_SECS};
use crate::types::identity::{PublicKey, Signature};

/// Cookie filename
const COOKIE_FILENAME: &str = ".cookie";

/// Magic username for cookie auth (matches bitcoin core convention)
const COOKIE_USERNAME: &str = "__cookie__";

/// Cookie size in bytes
const COOKIE_SIZE: usize = 32;

/// Authentication cookie
#[derive(Debug, Clone)]
pub struct AuthCookie {
    /// Path to cookie file
    path: PathBuf,
    /// Cookie value (hex string)
    value: String,
}

impl AuthCookie {
    /// Generate a new cookie and write to disk
    pub fn generate(data_dir: &Path) -> Result<Self, RpcError> {
        let path = data_dir.join(COOKIE_FILENAME);

        // Generate random cookie
        let mut cookie_bytes = [0u8; COOKIE_SIZE];
        rand::thread_rng().fill_bytes(&mut cookie_bytes);
        let value = hex::encode(cookie_bytes);

        // Write cookie file
        // On Unix, we'd use mode 0600, but for cross-platform we just write
        fs::write(&path, &value)?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&path)?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&path, perms)?;
        }

        log::info!("Generated RPC auth cookie: {}", path.display());

        Ok(Self { path, value })
    }

    /// Load existing cookie from disk
    pub fn load(data_dir: &Path) -> Result<Self, RpcError> {
        let path = data_dir.join(COOKIE_FILENAME);
        let value = fs::read_to_string(&path)?;

        // Validate cookie format (should be hex)
        if value.len() != COOKIE_SIZE * 2 || hex::decode(&value).is_err() {
            return Err(RpcError::AuthenticationFailed("Invalid cookie format".into()));
        }

        Ok(Self {
            path,
            value: value.trim().to_string(),
        })
    }

    /// Get the cookie value
    pub fn value(&self) -> &str {
        &self.value
    }

    /// Get the cookie file path
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Delete cookie file (called on shutdown)
    pub fn delete(&self) -> Result<(), RpcError> {
        if self.path.exists() {
            fs::remove_file(&self.path)?;
            log::info!("Deleted RPC auth cookie");
        }
        Ok(())
    }
}

// NOTE: We intentionally do NOT implement Drop for AuthCookie.
// Cookie cleanup must be explicit (call delete() on shutdown).
// This is because AuthCookie is cloned for the Authenticator,
// and having Drop delete the file would cause premature deletion
// when any clone is dropped.

/// RPC authenticator
#[derive(Debug)]
pub struct Authenticator {
    /// Cookie authentication
    cookie: Option<AuthCookie>,
    /// Credential authentication (username, password hash)
    credentials: Option<(String, String)>,
}

impl Authenticator {
    /// Create authenticator with cookie auth only
    pub fn with_cookie(cookie: AuthCookie) -> Self {
        Self {
            cookie: Some(cookie),
            credentials: None,
        }
    }

    /// Create authenticator with credentials
    pub fn with_credentials(username: String, password: String) -> Self {
        Self {
            cookie: None,
            credentials: Some((username, password)),
        }
    }

    /// Create authenticator with both cookie and credentials
    pub fn with_both(cookie: AuthCookie, username: String, password: String) -> Self {
        Self {
            cookie: Some(cookie),
            credentials: Some((username, password)),
        }
    }

    /// Validate Authorization header
    ///
    /// Expected format: `Basic base64(username:password)`
    pub fn validate(&self, auth_header: Option<&str>) -> Result<(), RpcError> {
        let auth_header = auth_header.ok_or(RpcError::AuthenticationRequired)?;

        // Parse Basic auth
        let auth_header = auth_header
            .strip_prefix("Basic ")
            .ok_or_else(|| RpcError::AuthenticationFailed("Invalid auth scheme".into()))?;

        // Decode base64
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(auth_header)
            .map_err(|_| RpcError::AuthenticationFailed("Invalid base64".into()))?;

        let decoded_str = String::from_utf8(decoded)
            .map_err(|_| RpcError::AuthenticationFailed("Invalid UTF-8".into()))?;

        // Parse username:password
        let (username, password) = decoded_str
            .split_once(':')
            .ok_or_else(|| RpcError::AuthenticationFailed("Invalid auth format".into()))?;

        // Try cookie auth first
        if username == COOKIE_USERNAME {
            if let Some(ref cookie) = self.cookie {
                // Use constant-time comparison to prevent timing attacks
                if constant_time_str_eq(password, cookie.value()) {
                    return Ok(());
                }
            }
            return Err(RpcError::AuthenticationFailed("Invalid cookie".into()));
        }

        // Try credential auth
        if let Some((ref expected_user, ref expected_pass)) = self.credentials {
            // Use constant-time comparison for both username and password
            // to prevent timing attacks on credential validation
            if constant_time_str_eq(username, expected_user)
                && constant_time_str_eq(password, expected_pass)
            {
                return Ok(());
            }
        }

        Err(RpcError::AuthenticationFailed("Invalid credentials".into()))
    }

    /// Validate signature-based authentication
    ///
    /// Browser clients sign each request with their identity keypair.
    /// The signed message is: "swimchain-rpc:" + method + ":" + sha256(params_json) + ":" + timestamp
    ///
    /// # Arguments
    /// * `identity` - The user's public key (64 hex chars = 32 bytes)
    /// * `timestamp` - UNIX timestamp string (must be within tolerance)
    /// * `signature` - Ed25519 signature (128 hex chars = 64 bytes)
    /// * `method` - The RPC method name
    /// * `params_json` - The JSON-encoded params (for hashing)
    pub fn validate_signature(
        &self,
        identity: Option<&str>,
        timestamp: Option<&str>,
        signature: Option<&str>,
        method: &str,
        params_json: &[u8],
    ) -> Result<(), RpcError> {
        // All three headers are required
        let identity_hex = identity.ok_or(RpcError::AuthenticationRequired)?;
        let timestamp_str = timestamp.ok_or(RpcError::AuthenticationRequired)?;
        let signature_hex = signature.ok_or(RpcError::AuthenticationRequired)?;

        // Parse public key (64 hex chars = 32 bytes)
        let pubkey_bytes = hex::decode(identity_hex)
            .map_err(|_| RpcError::AuthenticationFailed("Invalid identity hex".into()))?;
        if pubkey_bytes.len() != 32 {
            return Err(RpcError::AuthenticationFailed("Identity must be 32 bytes".into()));
        }
        let mut pubkey_arr = [0u8; 32];
        pubkey_arr.copy_from_slice(&pubkey_bytes);
        let public_key = PublicKey(pubkey_arr);

        let bech32_addr = crate::identity::encode_address_from_pubkey(&public_key);
        log::info!("Authenticating identity: {} ({})", identity_hex, bech32_addr);

        // Parse timestamp
        let timestamp: u64 = timestamp_str
            .parse()
            .map_err(|_| RpcError::AuthenticationFailed("Invalid timestamp".into()))?;

        // Check timestamp is within tolerance
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time before UNIX epoch")
            .as_secs();

        if timestamp < now {
            let age = now - timestamp;
            if age > SIGNATURE_PAST_TOLERANCE_SECS {
                return Err(RpcError::AuthenticationFailed(
                    format!("Timestamp too old: {} seconds (max {})", age, SIGNATURE_PAST_TOLERANCE_SECS)
                ));
            }
        } else {
            let ahead = timestamp - now;
            if ahead > SIGNATURE_FUTURE_TOLERANCE_SECS {
                return Err(RpcError::AuthenticationFailed(
                    format!("Timestamp too far in future: {} seconds (max {})", ahead, SIGNATURE_FUTURE_TOLERANCE_SECS)
                ));
            }
        }

        // Parse signature (128 hex chars = 64 bytes)
        let sig_bytes = hex::decode(signature_hex)
            .map_err(|_| RpcError::AuthenticationFailed("Invalid signature hex".into()))?;
        if sig_bytes.len() != 64 {
            return Err(RpcError::AuthenticationFailed("Signature must be 64 bytes".into()));
        }
        let mut sig_arr = [0u8; 64];
        sig_arr.copy_from_slice(&sig_bytes);
        let signature = Signature(sig_arr);

        // Construct the signed message:
        // "swimchain-rpc:" + method + ":" + sha256(params_json_hex) + ":" + timestamp
        let params_hash = Sha256::digest(params_json);
        let params_hash_hex = hex::encode(params_hash);
        let message = format!("swimchain-rpc:{}:{}:{}", method, params_hash_hex, timestamp_str);

        // Security: Log only non-sensitive verification info (avoid leaking signatures)
        log::debug!("Signature verification for method: {} at timestamp: {}", method, timestamp_str);

        // Verify the signature
        if !ed25519_verify(&public_key, message.as_bytes(), &signature) {
            log::warn!("Signature verification FAILED for identity: {}", identity_hex);
            return Err(RpcError::AuthenticationFailed("Invalid signature".into()));
        }

        log::info!("Authenticated via signature: {}", identity_hex);
        Ok(())
    }

    /// Get the cookie (for cleanup)
    pub fn take_cookie(&mut self) -> Option<AuthCookie> {
        self.cookie.take()
    }
}

/// Format credentials for Authorization header
pub fn format_auth_header(username: &str, password: &str) -> String {
    let credentials = format!("{}:{}", username, password);
    let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
    format!("Basic {}", encoded)
}

/// Format cookie for Authorization header
pub fn format_cookie_auth(cookie: &str) -> String {
    format_auth_header(COOKIE_USERNAME, cookie)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_cookie_generation() {
        let temp_dir = TempDir::new().unwrap();
        let cookie = AuthCookie::generate(temp_dir.path()).unwrap();

        // Cookie should be 64 hex chars (32 bytes)
        assert_eq!(cookie.value().len(), 64);
        assert!(hex::decode(cookie.value()).is_ok());

        // File should exist
        assert!(cookie.path().exists());
    }

    #[test]
    fn test_cookie_load() {
        let temp_dir = TempDir::new().unwrap();
        let cookie1 = AuthCookie::generate(temp_dir.path()).unwrap();
        let value = cookie1.value().to_string();
        let path = cookie1.path().to_path_buf();

        // Prevent auto-delete
        std::mem::forget(cookie1);

        // Load should succeed
        let cookie2 = AuthCookie::load(temp_dir.path()).unwrap();
        assert_eq!(cookie2.value(), value);

        // Cleanup
        fs::remove_file(path).ok();
    }

    #[test]
    fn test_authenticator_cookie() {
        let temp_dir = TempDir::new().unwrap();
        let cookie = AuthCookie::generate(temp_dir.path()).unwrap();
        let cookie_value = cookie.value().to_string();
        let auth = Authenticator::with_cookie(cookie);

        // Valid cookie should work
        let header = format_cookie_auth(&cookie_value);
        assert!(auth.validate(Some(&header)).is_ok());

        // Invalid cookie should fail
        let header = format_cookie_auth("0000000000000000000000000000000000000000000000000000000000000000");
        assert!(auth.validate(Some(&header)).is_err());

        // No header should fail
        assert!(auth.validate(None).is_err());
    }

    #[test]
    fn test_authenticator_credentials() {
        let auth = Authenticator::with_credentials("admin".into(), "secret".into());

        // Valid creds should work
        let header = format_auth_header("admin", "secret");
        assert!(auth.validate(Some(&header)).is_ok());

        // Wrong password should fail
        let header = format_auth_header("admin", "wrong");
        assert!(auth.validate(Some(&header)).is_err());

        // Wrong username should fail
        let header = format_auth_header("user", "secret");
        assert!(auth.validate(Some(&header)).is_err());
    }
}
