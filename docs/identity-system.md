# Identity System

This document describes the identity system implementation for Swimchain,
following [SPEC_01_IDENTITY.md](../specs/SPEC_01_IDENTITY.md).

## Overview

Swimchain uses a fundamentally different approach to identity than traditional
social networks. Instead of username/password pairs managed by a central authority:

> **"Identity IS the Keypair"**

Your Ed25519 cryptographic keypair is your identity. There are no usernames,
no passwords, and no password recovery. You have complete sovereignty over
your identity, but also complete responsibility.

## Quick Start

```rust
use swimchain::identity::{
    create_identity_with_difficulty,
    encode_address_from_pubkey,
    sign, verify,
    KeyStorage,
};

// Create a new identity (use difficulty 4 for testing, 20 for production)
let (keypair, proof) = create_identity_with_difficulty(4);

// Your human-readable address
let address = encode_address_from_pubkey(&keypair.public_key);
println!("Your address: {}", address);
// Output: cs1q7k2x3...

// Sign a message
let message = b"Hello, Swimchain!";
let signature = sign(&keypair.private_key, message);

// Anyone can verify with just your public key
assert!(verify(&keypair.public_key, message, &signature));
```

## Key Concepts

### Keypair Generation

```rust
use swimchain::identity::generate_keypair;

let keypair = generate_keypair();
// keypair.public_key - 32 bytes, safe to share
// keypair.private_key - 64 bytes, NEVER share
```

Uses Ed25519 via the `ed25519-dalek` crate with OS-provided randomness.

### Proof-of-Work (Identity Creation)

To prevent Sybil attacks (mass creation of fake identities), creating an
identity requires a proof-of-work:

```rust
use swimchain::identity::{
    create_identity,  // Uses default difficulty (20)
    create_identity_with_difficulty,
    create_identity_with_callback,
};

// Production identity (takes ~10-30 seconds)
let (keypair, proof) = create_identity();

// Testing identity (near-instant)
let (keypair, proof) = create_identity_with_difficulty(4);

// With progress reporting
let (keypair, proof) = create_identity_with_callback(20, |nonce| {
    println!("Tried {} million hashes...", nonce / 1_000_000);
});
```

**Difficulty levels:**
- 4: Testing only (~16 attempts average)
- 8: Development (~256 attempts)
- 12: Light (~4K attempts)
- 16: Medium (~65K attempts)
- 20: **Production default** (~1M attempts, 10-30s on desktop)

### Address Encoding

Addresses use Bech32m encoding (like Bitcoin Taproot):

```rust
use swimchain::identity::{
    encode_address_from_pubkey,
    decode_address_to_pubkey,
};

let address = encode_address_from_pubkey(&keypair.public_key);
// cs1q7k2x3y4z5a6b7c8d9e0f... (59 characters)

let pubkey = decode_address_to_pubkey(&address)?;
```

Format: `cs1q` + version(1 byte) + public_key(32 bytes) encoded in Bech32m

### Signing and Verification

```rust
use swimchain::identity::{sign, verify, sign_content, verify_envelope};

// Simple signing
let sig = sign(&keypair.private_key, message);
assert!(verify(&keypair.public_key, message, &sig));

// Content signing with timestamp (for posts/replies)
let content_hash = sha256(content);
let timestamp = current_timestamp();
let sig = sign_content(&keypair.private_key, &content_hash, timestamp);
```

## Key Storage

Private keys are encrypted at rest using:
- **Argon2id** for passphrase-based key derivation (OWASP recommended)
- **ChaCha20-Poly1305** for authenticated encryption

```rust
use swimchain::identity::KeyStorage;

// Create storage
let storage = KeyStorage::new("/path/to/keys")?;

// Save keypair (encrypted with passphrase)
storage.save(&keypair, "my-secure-passphrase")?;

// Load keypair later
let keypair = storage.load(&public_key, "my-secure-passphrase")?;

// List all stored keys
let keys = storage.list()?;

// Delete a key
storage.delete(&public_key)?;
```

### Encryption Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| Argon2 time cost | 3 | iterations |
| Argon2 memory cost | 64 MB | RAM required |
| Argon2 parallelism | 1 | single-threaded |
| ChaCha20-Poly1305 | 256-bit key | with Poly1305 tag |
| Salt | 16 bytes | random per key |
| Nonce | 12 bytes | random per encryption |

## Portable Identity

Export and import identities between devices:

```rust
use swimchain::identity::{
    export_identity, import_identity,
    to_base64, from_base64,
};

// Export (encrypted)
let portable = export_identity(&keypair, Some(&proof), "backup-password")?;

// As base64 for easy copying
let base64 = to_base64(&portable);
// Copy this string to your other device...

// Import on another device
let portable = from_base64(&base64)?;
let (keypair, proof) = import_identity(&portable, "backup-password")?;
```

### Binary Format

```
CSID                4 bytes   magic bytes
version             1 byte    format version (1)
pubkey             32 bytes   Ed25519 public key
enc_len             2 bytes   u16 LE encrypted key length
encrypted           N bytes   salt(16) || nonce(12) || ciphertext(64+16)
has_proof           1 byte    0x00 or 0x01
proof              80 bytes   (if has_proof) pubkey || timestamp || nonce || hash
has_meta            1 byte    0x00 or 0x01
metadata            ? bytes   (if has_meta) serialized metadata
```

## Security Considerations

### Private Key Handling

- **Never log private keys** - Debug output shows `[REDACTED]`
- **Never transmit unencrypted** - Always use export/import functions
- **Memory zeroing** - Private keys are zeroed on drop using `zeroize`
- **No key derivation from passwords** - Identity IS the keypair

### PoW Anti-Stockpiling

Proof-of-work timestamps are validated:
- **V-POW-03**: Verification tolerance of 1 hour past
- **V-POW-04**: Anti-stockpile limit of 24 hours

This prevents attackers from pre-computing proofs in bulk.

### Signature Timestamp Tolerance

Signed content timestamps are validated:
- Past tolerance: 1 hour (3600 seconds)
- Future tolerance: 5 minutes (300 seconds)

### No Recovery Possible

By design, there is no password recovery mechanism. If you lose your
private key, your identity is gone forever. This is a feature, not a bug:
it ensures true user sovereignty with no backdoors.

**Recommended practices:**
1. Use the portable identity export for backups
2. Store backups in multiple secure locations
3. Use a strong passphrase for encryption

## API Reference

Full API documentation is available via `cargo doc`:

```bash
cargo doc --open
```

Key modules:
- `swimchain::identity` - High-level identity operations
- `swimchain::crypto::signature` - Low-level signing
- `swimchain::crypto::address` - Address encoding
- `swimchain::crypto::pow` - Proof-of-work

## Performance

Typical performance on modern hardware:

| Operation | Time |
|-----------|------|
| Keypair generation | ~20 μs |
| Sign (32 bytes) | ~15 μs |
| Verify signature | ~45 μs |
| Encode address | ~2 μs |
| Decode address | ~3 μs |
| PoW difficulty 8 | ~1 ms |
| PoW difficulty 12 | ~16 ms |
| PoW difficulty 16 | ~260 ms |
| PoW difficulty 20 | ~4-30 s |
| Key encryption | ~200 ms |
| Key decryption | ~200 ms |

Run benchmarks with:
```bash
cargo bench
```
