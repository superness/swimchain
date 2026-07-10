//! Node-side private-space encryption — interop-exact with the JS clients.
//!
//! Private spaces are end-to-end encrypted. In the desktop app the node owns the
//! identity seed and never exposes it to the client UIs, so the node must perform the
//! same crypto the browser clients do (`feed-client/src/lib/x25519.ts` and
//! `encryption.ts`). Every scheme here is byte-for-byte compatible with those so a
//! space created/posted on one can be read on the other.
//!
//! ## Schemes (must match the JS exactly)
//!
//! 1. **ed25519 seed → X25519 secret**: `SHA-512(seed)[..32]` then X25519-clamped
//!    (`[0] &= 248; [31] = ([31] & 127) | 64`). Matches libsodium
//!    `crypto_sign_ed25519_sk_to_curve25519`.
//! 2. **ed25519 public → X25519 public**: the Edwards→Montgomery birational map
//!    (`u = (1+y)/(1-y)`), i.e. `curve25519_dalek`'s `to_montgomery()`.
//! 3. **Space-key wrapping (`x25519Box`)**: `nonce(24) || XSalsa20Poly1305(key, nonce)`
//!    where `key` is the **RAW** X25519 Diffie–Hellman output — the JS uses the DH
//!    result directly as the secretbox key and does NOT apply NaCl's HSalsa20 kdf, so
//!    we use `crypto_secretbox` directly, NOT `crypto_box`.
//! 4. **Content / name (space key)**: AES-256-GCM, 12-byte IV, 128-bit tag appended.
//!    Content is framed `[PRIVATE:v1:<base64(iv||ct+tag)>]`; the space name is the raw
//!    `iv||ct+tag` bytes (no framing).

use aes_gcm::aead::Aead as _;
use aes_gcm::{Aes256Gcm, KeyInit as _, Nonce as GcmNonce};
use base64::Engine as _;
use crypto_secretbox::aead::Aead as _;
use crypto_secretbox::{KeyInit as _, XSalsa20Poly1305};
use curve25519_dalek::edwards::CompressedEdwardsY;
use rand::RngCore as _;
use sha2::{Digest as _, Sha512};
use x25519_dalek::{PublicKey as XPublicKey, StaticSecret as XStaticSecret};

/// NaCl box nonce size.
const BOX_NONCE_SIZE: usize = 24;
/// AES-GCM IV size (must match the JS `IV_LENGTH`).
const GCM_IV_SIZE: usize = 12;
/// Poly1305 / GCM tag size.
const TAG_SIZE: usize = 16;

const PRIVATE_PREFIX: &str = "[PRIVATE:v1:";
const PRIVATE_SUFFIX: &str = "]";

/// Errors from private-space crypto. Deliberately coarse — callers map these to RPC
/// errors and must never leak which step failed to a remote peer.
#[derive(Debug, thiserror::Error)]
pub enum PrivateCryptoError {
    #[error("invalid public key (not a valid curve point)")]
    InvalidPublicKey,
    #[error("decryption failed")]
    DecryptionFailed,
    #[error("malformed ciphertext")]
    MalformedCiphertext,
}

/// Derive the X25519 secret scalar from a 32-byte ed25519 seed.
/// `SHA-512(seed)[..32]`, X25519-clamped.
pub fn ed25519_seed_to_x25519_secret(seed: &[u8; 32]) -> [u8; 32] {
    let hash = Sha512::digest(seed);
    let mut sk = [0u8; 32];
    sk.copy_from_slice(&hash[..32]);
    sk[0] &= 248;
    sk[31] = (sk[31] & 127) | 64;
    sk
}

/// X25519 public key for a given secret scalar (Curve25519 base-point mult).
pub fn x25519_public_from_secret(secret: &[u8; 32]) -> [u8; 32] {
    // StaticSecret re-clamps on use; our scalar is already clamped, and clamping is
    // idempotent, so this matches @noble's `x25519.getPublicKey(clampedSecret)`.
    let ss = XStaticSecret::from(*secret);
    *XPublicKey::from(&ss).as_bytes()
}

/// Convert an ed25519 public key to its X25519 (Montgomery) public key.
pub fn ed25519_public_to_x25519(ed_pk: &[u8; 32]) -> Result<[u8; 32], PrivateCryptoError> {
    let point = CompressedEdwardsY(*ed_pk)
        .decompress()
        .ok_or(PrivateCryptoError::InvalidPublicKey)?;
    Ok(point.to_montgomery().to_bytes())
}

/// Raw X25519 Diffie–Hellman output (NOT hashed) — used directly as the secretbox key,
/// matching the JS `x25519.getSharedSecret`.
fn x25519_shared_secret(my_secret: &[u8; 32], their_public: &[u8; 32]) -> [u8; 32] {
    let ss = XStaticSecret::from(*my_secret);
    let their = XPublicKey::from(*their_public);
    *ss.diffie_hellman(&their).as_bytes()
}

/// Random 32-byte space key (AES-256-GCM key), matching JS `generateSpaceKey`.
pub fn generate_space_key() -> [u8; 32] {
    let mut k = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut k);
    k
}

// ---------------------------------------------------------------------------
// Space-key wrapping (NaCl box with RAW DH key)
// ---------------------------------------------------------------------------

/// `x25519Box` with an explicit nonce — exposed for deterministic interop tests.
fn x25519_box_with_nonce(
    message: &[u8],
    recipient_public: &[u8; 32],
    sender_secret: &[u8; 32],
    nonce: &[u8; BOX_NONCE_SIZE],
) -> Vec<u8> {
    let shared = x25519_shared_secret(sender_secret, recipient_public);
    let cipher = XSalsa20Poly1305::new((&shared).into());
    let ct = cipher
        .encrypt(nonce.as_ref().into(), message)
        .expect("xsalsa20poly1305 encryption is infallible for valid keys/nonces");
    let mut out = Vec::with_capacity(BOX_NONCE_SIZE + ct.len());
    out.extend_from_slice(nonce);
    out.extend_from_slice(&ct);
    out
}

/// Encrypt `message` for `recipient_public` using `sender_secret`.
/// Returns `nonce(24) || ciphertext(+16 tag)`.
pub fn x25519_box(message: &[u8], recipient_public: &[u8; 32], sender_secret: &[u8; 32]) -> Vec<u8> {
    let mut nonce = [0u8; BOX_NONCE_SIZE];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    x25519_box_with_nonce(message, recipient_public, sender_secret, &nonce)
}

/// Decrypt a `nonce(24) || ciphertext` box from `sender_public` using `recipient_secret`.
pub fn x25519_unbox(
    boxed: &[u8],
    sender_public: &[u8; 32],
    recipient_secret: &[u8; 32],
) -> Result<Vec<u8>, PrivateCryptoError> {
    if boxed.len() < BOX_NONCE_SIZE + TAG_SIZE {
        return Err(PrivateCryptoError::MalformedCiphertext);
    }
    let (nonce, ct) = boxed.split_at(BOX_NONCE_SIZE);
    let shared = x25519_shared_secret(recipient_secret, sender_public);
    let cipher = XSalsa20Poly1305::new((&shared).into());
    cipher
        .decrypt(nonce.into(), ct)
        .map_err(|_| PrivateCryptoError::DecryptionFailed)
}

// ---------------------------------------------------------------------------
// Content / name encryption (AES-256-GCM with the space key)
// ---------------------------------------------------------------------------

/// AES-256-GCM encrypt with an explicit IV — exposed for deterministic interop tests.
/// Returns `iv(12) || ciphertext(+16 tag)`.
fn aes_gcm_encrypt_with_iv(plaintext: &[u8], key: &[u8; 32], iv: &[u8; GCM_IV_SIZE]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(key.into());
    let ct = cipher
        .encrypt(GcmNonce::from_slice(iv), plaintext)
        .expect("aes-256-gcm encryption is infallible for valid keys/nonces");
    let mut out = Vec::with_capacity(GCM_IV_SIZE + ct.len());
    out.extend_from_slice(iv);
    out.extend_from_slice(&ct);
    out
}

/// AES-256-GCM encrypt with a random IV. Returns `iv(12) || ciphertext(+16 tag)`.
fn aes_gcm_encrypt(plaintext: &[u8], key: &[u8; 32]) -> Vec<u8> {
    let mut iv = [0u8; GCM_IV_SIZE];
    rand::rngs::OsRng.fill_bytes(&mut iv);
    aes_gcm_encrypt_with_iv(plaintext, key, &iv)
}

/// AES-256-GCM decrypt `iv(12) || ciphertext` with the space key.
fn aes_gcm_decrypt(blob: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, PrivateCryptoError> {
    if blob.len() < GCM_IV_SIZE + TAG_SIZE {
        return Err(PrivateCryptoError::MalformedCiphertext);
    }
    let (iv, ct) = blob.split_at(GCM_IV_SIZE);
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt(GcmNonce::from_slice(iv), ct)
        .map_err(|_| PrivateCryptoError::DecryptionFailed)
}

/// Encrypt content with a space key into the `[PRIVATE:v1:<base64>]` framing the JS uses.
pub fn encrypt_content_with_space_key(plaintext: &str, key: &[u8; 32]) -> String {
    let blob = aes_gcm_encrypt(plaintext.as_bytes(), key);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&blob);
    format!("{PRIVATE_PREFIX}{b64}{PRIVATE_SUFFIX}")
}

/// Decrypt `[PRIVATE:v1:<base64>]<suffix>` content with a space key. Mirrors the JS,
/// including appending any trailing text after the `]`.
pub fn decrypt_content_with_space_key(
    content: &str,
    key: &[u8; 32],
) -> Result<String, PrivateCryptoError> {
    let rest = content
        .strip_prefix(PRIVATE_PREFIX)
        .ok_or(PrivateCryptoError::MalformedCiphertext)?;
    let end = rest
        .find(PRIVATE_SUFFIX)
        .ok_or(PrivateCryptoError::MalformedCiphertext)?;
    let payload = &rest[..end];
    let suffix = &rest[end + PRIVATE_SUFFIX.len()..];
    let blob = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|_| PrivateCryptoError::MalformedCiphertext)?;
    let plaintext = aes_gcm_decrypt(&blob, key)?;
    let mut s = String::from_utf8(plaintext).map_err(|_| PrivateCryptoError::DecryptionFailed)?;
    s.push_str(suffix);
    Ok(s)
}

/// Encrypt a space name with the space key — raw `iv(12) || ct+tag` bytes (no framing),
/// matching JS `encryptSpaceName`.
pub fn encrypt_space_name(name: &str, key: &[u8; 32]) -> Vec<u8> {
    aes_gcm_encrypt(name.as_bytes(), key)
}

/// Decrypt a raw `iv(12) || ct+tag` space name with the space key.
pub fn decrypt_space_name(blob: &[u8], key: &[u8; 32]) -> Result<String, PrivateCryptoError> {
    let plaintext = aes_gcm_decrypt(blob, key)?;
    String::from_utf8(plaintext).map_err(|_| PrivateCryptoError::DecryptionFailed)
}

// ---------------------------------------------------------------------------
// Node-managed helpers: wrap/unwrap a space key using the node's identity seed.
//
// The node never stores raw space keys at rest — it derives them on demand from the
// per-member `encrypted_space_key` in the membership store (which IS persisted, wrapped
// to the member's key). `invited_by` names the ed25519 pubkey that wrapped the key
// (zeroed for the creator's self-wrap).
// ---------------------------------------------------------------------------

/// The node's X25519 (secret, public) keypair, derived from its ed25519 identity seed.
pub fn node_x25519_keys(ed25519_seed: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let sk = ed25519_seed_to_x25519_secret(ed25519_seed);
    let pk = x25519_public_from_secret(&sk);
    (sk, pk)
}

/// Wrap a space key for a recipient identified by their ed25519 public key, signed by
/// the holder of `my_seed`. For a self-wrap, pass the node's own ed25519 pubkey.
pub fn wrap_space_key_for(
    space_key: &[u8; 32],
    recipient_ed25519_pubkey: &[u8; 32],
    my_seed: &[u8; 32],
) -> Result<Vec<u8>, PrivateCryptoError> {
    let my_x_sk = ed25519_seed_to_x25519_secret(my_seed);
    let recipient_x_pk = ed25519_public_to_x25519(recipient_ed25519_pubkey)?;
    Ok(x25519_box(space_key, &recipient_x_pk, &my_x_sk))
}

/// Unwrap the space key from a member's `encrypted_space_key`. `invited_by` is the
/// ed25519 pubkey of whoever wrapped it (all-zero => the member wrapped it for
/// themselves, so the sender is the member). `my_*` identify the unwrapping member.
pub fn unwrap_space_key(
    encrypted_space_key: &[u8],
    invited_by: &[u8; 32],
    my_ed25519_pubkey: &[u8; 32],
    my_seed: &[u8; 32],
) -> Result<[u8; 32], PrivateCryptoError> {
    let my_x_sk = ed25519_seed_to_x25519_secret(my_seed);
    let sender_ed = if invited_by == &[0u8; 32] {
        my_ed25519_pubkey
    } else {
        invited_by
    };
    let sender_x_pk = ed25519_public_to_x25519(sender_ed)?;
    let key = x25519_unbox(encrypted_space_key, &sender_x_pk, &my_x_sk)?;
    key.try_into().map_err(|_| PrivateCryptoError::DecryptionFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The node creates a space (self-wrap, invited_by = 0), then reads it back by
    // unwrapping its own membership key — the exact create->read local flow. This also
    // proves the identity `ed_pubkey->x25519` and `seed->x25519` paths land on the SAME
    // X25519 key (they must, or a self-wrap could never be self-unwrapped).
    #[test]
    fn node_self_wrap_unwrap_round_trips() {
        use crate::crypto::signature::generate_keypair;
        let me = generate_keypair();
        let my_seed: [u8; 32] = me.private_key.seed()[..32].try_into().unwrap();
        let space_key = generate_space_key();
        // create: self-wrap using my own ed pubkey as the recipient
        let wrapped = wrap_space_key_for(&space_key, &me.public_key.0, &my_seed).unwrap();
        // read: unwrap with invited_by = 0 (self)
        let got = unwrap_space_key(&wrapped, &[0u8; 32], &me.public_key.0, &my_seed).unwrap();
        assert_eq!(got, space_key);
    }

    #[test]
    fn node_invite_wrap_unwrap_round_trips() {
        // Inviter wraps for an invitee; invitee unwraps using inviter's ed pubkey.
        use crate::crypto::signature::generate_keypair;
        let inviter = generate_keypair();
        let invitee = generate_keypair();
        let inviter_seed: [u8; 32] = inviter.private_key.seed()[..32].try_into().unwrap();
        let invitee_seed: [u8; 32] = invitee.private_key.seed()[..32].try_into().unwrap();
        let space_key = generate_space_key();

        let wrapped = wrap_space_key_for(&space_key, &invitee.public_key.0, &inviter_seed).unwrap();
        let got = unwrap_space_key(
            &wrapped,
            &inviter.public_key.0,
            &invitee.public_key.0,
            &invitee_seed,
        )
        .unwrap();
        assert_eq!(got, space_key);
    }

    // Round-trip: everything the node encrypts, the node can decrypt.
    #[test]
    fn box_round_trips() {
        let seed_a = [7u8; 32];
        let seed_b = [9u8; 32];
        let sk_a = ed25519_seed_to_x25519_secret(&seed_a);
        let pk_a = x25519_public_from_secret(&sk_a);
        let sk_b = ed25519_seed_to_x25519_secret(&seed_b);
        let pk_b = x25519_public_from_secret(&sk_b);

        let space_key = generate_space_key();
        // A wraps the space key for B.
        let boxed = x25519_box(&space_key, &pk_b, &sk_a);
        // B unwraps it (needs A's public key).
        let out = x25519_unbox(&boxed, &pk_a, &sk_b).expect("unbox");
        assert_eq!(out, space_key.to_vec());
    }

    #[test]
    fn self_box_round_trips() {
        // Creator wraps the space key for themselves (creator == recipient).
        let seed = [3u8; 32];
        let sk = ed25519_seed_to_x25519_secret(&seed);
        let pk = x25519_public_from_secret(&sk);
        let space_key = generate_space_key();
        let boxed = x25519_box(&space_key, &pk, &sk);
        let out = x25519_unbox(&boxed, &pk, &sk).expect("self unbox");
        assert_eq!(out, space_key.to_vec());
    }

    #[test]
    fn content_round_trips_with_suffix() {
        let key = [42u8; 32];
        let framed = encrypt_content_with_space_key("hello\n\nworld", &key);
        assert!(framed.starts_with(PRIVATE_PREFIX));
        let out = decrypt_content_with_space_key(&framed, &key).expect("decrypt");
        assert_eq!(out, "hello\n\nworld");
        // Trailing suffix after `]` is preserved, like the JS.
        let with_suffix = format!("{framed}TAIL");
        assert_eq!(
            decrypt_content_with_space_key(&with_suffix, &key).unwrap(),
            "hello\n\nworldTAIL"
        );
    }

    #[test]
    fn name_round_trips() {
        let key = [11u8; 32];
        let blob = encrypt_space_name("Project Team", &key);
        assert_eq!(decrypt_space_name(&blob, &key).unwrap(), "Project Team");
    }

    #[test]
    fn wrong_key_fails_cleanly() {
        let key = [1u8; 32];
        let other = [2u8; 32];
        let framed = encrypt_content_with_space_key("secret", &key);
        assert!(decrypt_content_with_space_key(&framed, &other).is_err());
    }

    // ---- Interop vectors generated from the JS clients (@noble + WebCrypto). ----
    // See tools/private-space-vectors/gen.mjs. These lock the Rust impl to the exact
    // byte formats the browser clients produce/consume.
    include!("private_space_vectors.rs");
}
