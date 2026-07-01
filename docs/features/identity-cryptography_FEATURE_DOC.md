# Identity & Cryptography - Feature Documentation

> **Section**: 1. Identity & Cryptography
> **Owner Areas**: `src/crypto/`, `src/identity/`, `src/types/identity.rs`
> **Specification**: SPEC_01

## Overview

Swimchain's identity system is built on the fundamental principle: **"Identity IS the Keypair"**. There is no username/password system, no password recovery, and no centralized identity provider. Your Ed25519 keypair is your identity, providing full user sovereignty and offline operation capability.

### Core Philosophy

- **No Account Recovery**: By design, losing your private key means losing your identity
- **Full Sovereignty**: Users have complete control over their identity
- **Offline-First**: All identity operations work without network connectivity
- **Sybil Resistance**: Proof-of-Work gates identity creation to prevent mass account creation

## Architecture

```
+------------------+     +-------------------+     +------------------+
|   Key Generation |---->|  PoW Mining       |---->|  Identity Ready  |
|   (Ed25519)      |     |  (SHA-256)        |     |                  |
+------------------+     +-------------------+     +------------------+
         |                                                  |
         v                                                  v
+------------------+     +-------------------+     +------------------+
|  Address Encode  |     |  Signature Ops    |     |  Encrypted       |
|  (Bech32m cs1..) |     |  (Sign/Verify)    |     |  Storage         |
+------------------+     +-------------------+     +------------------+
                                                           |
                                                           v
                                                  +------------------+
                                                  |  Portable Format |
                                                  |  (Export/Import) |
                                                  +------------------+
```

### Component Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| Key Generation | `src/crypto/signature.rs` | Ed25519 keypair creation using secure randomness |
| Signature Operations | `src/crypto/signature.rs` | Sign/verify messages and envelopes |
| Address Encoding | `src/crypto/address.rs` | Bech32m `cs1...` address format |
| Identity PoW | `src/crypto/pow.rs` | SHA-256 mining for Sybil resistance |
| Hash Functions | `src/crypto/hash.rs` | SHA-256, Blake3, leading zeros |
| Encrypted Storage | `src/identity/storage.rs` | Argon2id + ChaCha20-Poly1305 |
| Portable Identity | `src/identity/portable.rs` | Binary export/import format |
| High-Level API | `src/identity/mod.rs` | Convenience functions |
| Type Definitions | `src/types/identity.rs` | Core data structures |

---

## Data Structures

### IdentityId

```rust
pub struct IdentityId(pub [u8; 32]);
```

**Purpose**: Canonical identifier for an identity in the protocol (SHA-256 hash of public key).

**Methods**:
- `from_bytes(bytes: [u8; 32]) -> Self` - Create from raw bytes
- `as_bytes(&self) -> &[u8; 32]` - Get raw bytes
- Implements `Display` (hex format), `Debug`, `Hash`, `Default`, `Clone`, `Copy`, `PartialEq`, `Eq`

**Used by**: Content attribution, reputation tracking, sponsorship trees, storage indexing

---

### PublicKey

```rust
pub struct PublicKey(pub [u8; 32]);
```

**Purpose**: Ed25519 public key (32 bytes) used for signature verification and address encoding.

**Methods**:
- `from_bytes(bytes: [u8; 32]) -> Self` - Create from raw bytes
- `as_bytes(&self) -> &[u8; 32]` - Get raw bytes
- `to_identity_id(&self) -> IdentityId` - Compute SHA-256 hash to derive identity ID

**Used by**: Signature verification, address encoding, identity creation proofs

---

### PrivateKey

```rust
pub struct PrivateKey([u8; 64]);
```

**Purpose**: Ed25519 private key stored as 32-byte seed + 32-byte public key (64 bytes total).

**Security Features**:
- Implements `Drop` with volatile zeroing to prevent key material from lingering in memory
- Uses `compiler_fence(Ordering::SeqCst)` to prevent optimization of the zeroing
- `Debug` implementation shows `[REDACTED]` instead of actual bytes

**Methods**:
- `from_bytes(bytes: [u8; 64]) -> Self` - Create from raw bytes
- `as_bytes(&self) -> &[u8; 64]` - Get raw bytes
- `seed(&self) -> &[u8; 32]` - Get seed portion (first 32 bytes) for signing

**Used by**: Signature creation, encrypted storage

---

### Signature

```rust
pub struct Signature(pub [u8; 64]);
```

**Purpose**: Ed25519 signature (64 bytes).

**Methods**:
- `from_bytes(bytes: [u8; 64]) -> Self` - Create from raw bytes
- `as_bytes(&self) -> &[u8; 64]` - Get raw bytes
- Implements `Default` (all zeros), `Debug` (truncated hex)

**Used by**: Signature envelopes, content signing, identity metadata

---

### KeyPair

```rust
pub struct KeyPair {
    pub public_key: PublicKey,
    pub private_key: PrivateKey,
}
```

**Purpose**: Container holding both public and private keys for an identity.

**Used by**: Identity creation, signing operations, storage

---

### IdentityCreationProof

```rust
pub struct IdentityCreationProof {
    pub public_key: PublicKey,     // Public key being registered
    pub timestamp: u64,            // UNIX timestamp when PoW was computed
    pub nonce: u64,                // Nonce that satisfies difficulty requirement
    pub pow_hash: [u8; 32],        // Resulting hash that meets difficulty
}
```

**Purpose**: Proof-of-Work solution for identity creation (Sybil resistance).

**Hash Format**: `SHA-256(pubkey[32] || timestamp_le[8] || nonce_le[8])`

**Verification Rules** (SPEC_01 §6.3):
- V-POW-01: Recompute hash and compare to proof
- V-POW-02: Check leading zeros meet difficulty requirement
- V-POW-03: Timestamp not more than 1h in past (verification tolerance)
- V-POW-04: Timestamp not more than 24h old (anti-stockpile for creation)
- Timestamp not more than 5min in future

**Used by**: Identity registration, sponsorship validation

---

### SignatureEnvelope

```rust
pub struct SignatureEnvelope {
    pub signer: PublicKey,         // Signer's public key
    pub timestamp: u64,            // UNIX timestamp in seconds
    pub action_type: ActionType,   // Type of action being signed
    pub content_hash: [u8; 32],    // Hash of content being signed
    pub signature: Signature,      // The signature
}
```

**Purpose**: Timestamped signature wrapper for all signed actions in the protocol.

**Signed Message Format**: `content_hash[32] || timestamp_le[8]` (40 bytes)

**Timestamp Tolerances** (SPEC_01 §6.2):
- Past tolerance: 3600 seconds (1 hour)
- Future tolerance: 300 seconds (5 minutes)

**Used by**: Content actions (posts, replies), engagement actions, network messages

---

### ActionType

```rust
#[repr(u8)]
pub enum ActionType {
    Post = 0x00,              // Creating a new post
    Reply = 0x01,             // Replying to existing content
    IdentityCreation = 0x02, // Identity creation (first action)
}
```

**Purpose**: Discriminant for first appearance tracking (SPEC_01 §3.7).

**Used by**: Signature envelopes, first appearance records

---

### IdentityAddress

```rust
pub struct IdentityAddress {
    pub hrp: String,          // Human-readable part (always "cs")
    pub version: u8,          // Address version
    pub payload: [u8; 32],    // 32-byte payload (identity ID or public key)
}
```

**Purpose**: Bech32m address representation per SPEC_01 §3.3.

**Format**: `cs1<version><payload>` (~59 characters)

**Used by**: Address display, QR codes, user-facing identity representation

---

### IdentityMetadata

```rust
pub struct IdentityMetadata {
    pub identity: IdentityId,              // Identity this metadata belongs to
    pub display_name: Option<String>,      // Display name (max 64 UTF-8 bytes)
    pub avatar_cid: Option<[u8; 32]>,      // Avatar content hash
    pub bio: Option<String>,               // Biography (max 256 UTF-8 bytes)
    pub updated_at: u64,                   // Last update timestamp (UNIX seconds)
    pub signature: Signature,              // Signature over metadata
}
```

**Purpose**: Optional profile metadata for identities.

**Constraints**:
- `display_name`: Maximum 64 UTF-8 bytes (per `MAX_DISPLAY_NAME_BYTES`)
- `bio`: Maximum 256 UTF-8 bytes (per `MAX_BIO_BYTES`)

**Used by**: User profiles, portable identity export

---

### PortableIdentity

```rust
pub struct PortableIdentity {
    pub version: u8,                                    // Format version (currently 1)
    pub public_key: [u8; 32],                          // Raw 32-byte public key
    pub encrypted_private_key: Vec<u8>,                // Encrypted private key blob
    pub creation_proof: Option<IdentityCreationProof>, // Optional creation proof
    pub metadata: Option<IdentityMetadata>,            // Optional metadata snapshot
}
```

**Purpose**: Portable format for identity export/import between devices.

**Binary Format**:
```
CSID                           4 bytes  magic
version                        1 byte   format version (1)
pubkey                        32 bytes  Ed25519 public key
enc_priv_len                   2 bytes  u16 LE, encrypted private key length
enc_priv                       N bytes  encrypted private key blob
has_proof                      1 byte   0x00=no, 0x01=yes
proof                          ? bytes  if has_proof, serialized proof (80 bytes)
has_meta                       1 byte   0x00=no, 0x01=yes
meta                           ? bytes  if has_meta, serialized metadata
```

**Constants**:
- `PORTABLE_MAGIC`: `b"CSID"` (4 bytes)
- `PORTABLE_VERSION`: `1`

**Used by**: Identity backup, cross-device identity transfer

---

## Public APIs

### Keypair Generation

#### `generate_keypair() -> KeyPair`

```rust
pub fn generate_keypair() -> KeyPair
```

**Location**: `src/crypto/signature.rs:14`

**Purpose**: Generate a new Ed25519 keypair using OS-level secure randomness.

**Implementation**:
1. Creates `SigningKey` using `OsRng`
2. Derives `VerifyingKey` from signing key
3. Constructs private key as `seed[32] || pubkey[32]`

**Security**: Uses `rand::rngs::OsRng` for cryptographically secure random number generation.

**Called from**: `create_identity()`, `create_identity_with_difficulty()`, tests

---

#### `generate_keypair_from_seed(seed: [u8; 32]) -> KeyPair`

```rust
#[cfg(any(test, feature = "test-vectors"))]
pub fn generate_keypair_from_seed(seed: [u8; 32]) -> KeyPair
```

**Location**: `src/crypto/signature.rs:120`

**Purpose**: Generate deterministic keypair from seed (SPEC_01 test vectors only).

**Warning**: Only available with `test` or `test-vectors` feature. Never use in production.

---

### Signing Operations

#### `sign(private_key: &PrivateKey, message: &[u8]) -> Signature`

```rust
pub fn sign(private_key: &PrivateKey, message: &[u8]) -> Signature
```

**Location**: `src/crypto/signature.rs:31`

**Purpose**: Sign arbitrary message with private key.

**Implementation**:
1. Extracts 32-byte seed from private key
2. Constructs `SigningKey` from seed
3. Signs message using Ed25519
4. Returns 64-byte signature

**Called from**: `sign_content()`, content creation, RPC methods

---

#### `sign_content(private_key: &PrivateKey, content_hash: &[u8; 32], timestamp: u64) -> Signature`

```rust
pub fn sign_content(
    private_key: &PrivateKey,
    content_hash: &[u8; 32],
    timestamp: u64,
) -> Signature
```

**Location**: `src/crypto/signature.rs:54`

**Purpose**: Create timestamped signature for content (signature envelope format).

**Signed Message Format**: `content_hash[32] || timestamp_le[8]` (40 bytes)

**Called from**: Content actions, engagement actions

---

### Verification Operations

#### `verify(public_key: &PublicKey, message: &[u8], signature: &Signature) -> bool`

```rust
pub fn verify(public_key: &PublicKey, message: &[u8], signature: &Signature) -> bool
```

**Location**: `src/crypto/signature.rs:42`

**Purpose**: Verify signature against message and public key.

**Returns**: `true` if signature is valid, `false` otherwise (including malformed keys).

**Called from**: `verify_envelope()`, content validation, network message verification

---

#### `verify_envelope(envelope: &SignatureEnvelope, current_time: u64) -> Result<bool, SerializeError>`

```rust
pub fn verify_envelope(
    envelope: &SignatureEnvelope,
    current_time: u64,
) -> Result<bool, SerializeError>
```

**Location**: `src/crypto/signature.rs:70`

**Purpose**: Verify signature envelope with timestamp tolerance checking.

**Validation Steps**:
1. Check timestamp is not more than 3600s (1 hour) in the past
2. Check timestamp is not more than 300s (5 minutes) in the future
3. Construct signed message: `content_hash[32] || timestamp_le[8]`
4. Verify signature against message

**Errors**:
- `SerializeError::TimestampTooOld` - Timestamp exceeds past tolerance
- `SerializeError::TimestampTooNew` - Timestamp exceeds future tolerance

**Called from**: Content validation, action verification

---

### Address Encoding/Decoding

#### `encode_address(identity_id: &IdentityId) -> String`

```rust
pub fn encode_address(identity_id: &IdentityId) -> String
```

**Location**: `src/crypto/address.rs:24`

**Purpose**: Encode identity ID as Bech32m address.

**Format**: `cs1<version><identity_id>` (~59 characters)

**Note**: This encodes the `IdentityId` (SHA-256 of pubkey). For SPEC_01-compliant addresses that encode the raw public key, use `encode_address_from_pubkey`.

---

#### `encode_address_from_pubkey(public_key: &PublicKey) -> String`

```rust
pub fn encode_address_from_pubkey(public_key: &PublicKey) -> String
```

**Location**: `src/crypto/address.rs:40`

**Purpose**: Encode public key directly as Bech32m address (SPEC_01 canonical format).

**Format**: `cs1<version><pubkey>` (~59 characters)

**Called from**: User-facing address display, portable identity

---

#### `decode_address(address: &str) -> Result<IdentityId, AddressError>`

```rust
pub fn decode_address(address: &str) -> Result<IdentityId, AddressError>
```

**Location**: `src/crypto/address.rs:54`

**Purpose**: Decode Bech32m address to identity ID.

**Validation**:
- HRP must be "cs"
- Version byte must be 0
- Payload must be 32 bytes

**Errors**:
- `AddressError::InvalidHrp` - Wrong human-readable prefix
- `AddressError::UnsupportedVersion` - Unknown version byte
- `AddressError::InvalidLength` - Payload wrong size
- `AddressError::Bech32Error` - Invalid encoding/checksum

---

#### `decode_address_to_pubkey(address: &str) -> Result<PublicKey, AddressError>`

```rust
pub fn decode_address_to_pubkey(address: &str) -> Result<PublicKey, AddressError>
```

**Location**: `src/crypto/address.rs:93`

**Purpose**: Decode Bech32m address to public key (inverse of `encode_address_from_pubkey`).

---

#### `is_valid_address(address: &str) -> bool`

```rust
pub fn is_valid_address(address: &str) -> bool
```

**Location**: `src/crypto/address.rs:125`

**Purpose**: Check if string is a valid Swimchain address.

---

### Identity PoW Operations

#### `mine_identity_pow(keypair: &KeyPair, difficulty: u8) -> IdentityCreationProof`

```rust
pub fn mine_identity_pow(keypair: &KeyPair, difficulty: u8) -> IdentityCreationProof
```

**Location**: `src/crypto/pow.rs:52`

**Purpose**: Mine proof-of-work for identity creation.

**Algorithm**:
1. Get current timestamp
2. Build data: `pubkey[32] || timestamp_le[8] || nonce_le[8]`
3. Compute `SHA-256(data)`
4. Check if hash has `difficulty` leading zero bits
5. If not, increment nonce and repeat

**Called from**: `create_identity()`, `create_identity_with_difficulty()`

---

#### `mine_identity_pow_with_callback<F>(keypair: &KeyPair, difficulty: u8, callback: F) -> IdentityCreationProof`

```rust
pub fn mine_identity_pow_with_callback<F>(
    keypair: &KeyPair,
    difficulty: u8,
    callback: F,
) -> IdentityCreationProof
where
    F: FnMut(u64),
```

**Location**: `src/crypto/pow.rs:70`

**Purpose**: Mine with progress callback (called every ~1M hashes).

**Callback Interval**: `CALLBACK_INTERVAL = 1_000_000` hashes

---

#### `verify_identity_pow(proof: &IdentityCreationProof, difficulty: u8, current_time: u64) -> Result<(), IdentityError>`

```rust
pub fn verify_identity_pow(
    proof: &IdentityCreationProof,
    difficulty: u8,
    current_time: u64,
) -> Result<(), IdentityError>
```

**Location**: `src/crypto/pow.rs:183`

**Purpose**: Verify identity PoW with 24-hour anti-stockpile tolerance.

**Validation Rules**:
- V-POW-01: Recompute hash matches proof
- V-POW-02: Leading zeros >= difficulty
- V-POW-04: Timestamp not more than 24h old (anti-stockpile)
- Timestamp not more than 5min in future

**Errors**:
- `IdentityError::PowDifficultyNotMet` - Hash doesn't meet difficulty
- `IdentityError::PowTimestampStockpile` - Proof too old (>24h)
- `IdentityError::PowTimestampFuture` - Timestamp in future (>5min)

---

#### `verify_identity_pow_strict(proof: &IdentityCreationProof, difficulty: u8, current_time: u64) -> Result<(), IdentityError>`

```rust
pub fn verify_identity_pow_strict(
    proof: &IdentityCreationProof,
    difficulty: u8,
    current_time: u64,
) -> Result<(), IdentityError>
```

**Location**: `src/crypto/pow.rs:248`

**Purpose**: Verify with strict 1-hour tolerance (for post-creation verification).

**Difference from `verify_identity_pow`**: Uses 1-hour past tolerance instead of 24-hour.

**Errors**:
- `IdentityError::PowTimestampExpired` - Proof too old (>1h)

---

### Encrypted Key Storage

#### `encrypt_private_key(private_key: &PrivateKey, passphrase: &str) -> Result<Vec<u8>, IdentityError>`

```rust
pub fn encrypt_private_key(
    private_key: &PrivateKey,
    passphrase: &str,
) -> Result<Vec<u8>, IdentityError>
```

**Location**: `src/identity/storage.rs:56`

**Purpose**: Encrypt private key with passphrase for secure storage.

**Output Format**: `salt[16] || nonce[12] || ciphertext[64] || tag[16]` = 108 bytes

**Algorithm**:
1. Generate random 16-byte salt using `OsRng`
2. Derive 32-byte key using Argon2id (see parameters below)
3. Generate random 12-byte nonce
4. Encrypt private key using ChaCha20-Poly1305
5. Return concatenated result

**Called from**: `export_identity()`, `KeyStorage::save()`

---

#### `decrypt_private_key(encrypted: &[u8], passphrase: &str) -> Result<PrivateKey, IdentityError>`

```rust
pub fn decrypt_private_key(
    encrypted: &[u8],
    passphrase: &str,
) -> Result<PrivateKey, IdentityError>
```

**Location**: `src/identity/storage.rs:97`

**Purpose**: Decrypt private key from encrypted blob.

**Validation**:
- Minimum size: 108 bytes (salt + nonce + ciphertext + tag)
- Decrypted key must be exactly 64 bytes

**Errors**:
- `IdentityError::DecryptionError` - Wrong passphrase or corrupted data

**Called from**: `import_identity()`, `KeyStorage::load()`

---

### KeyStorage Class

```rust
pub struct KeyStorage {
    base_path: PathBuf,
}
```

**Location**: `src/identity/storage.rs:164`

**Purpose**: File-based encrypted key storage indexed by public key.

**File Naming**: `<hex(public_key)>.key`

#### Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| `new` | `fn new(base_path: impl Into<PathBuf>) -> Result<Self, IdentityError>` | Create storage, creating directory if needed |
| `save` | `fn save(&self, keypair: &KeyPair, passphrase: &str) -> Result<(), IdentityError>` | Save encrypted keypair |
| `load` | `fn load(&self, public_key: &PublicKey, passphrase: &str) -> Result<KeyPair, IdentityError>` | Load and decrypt keypair |
| `exists` | `fn exists(&self, public_key: &PublicKey) -> bool` | Check if key exists |
| `list` | `fn list(&self) -> Result<Vec<PublicKey>, IdentityError>` | List all stored public keys |
| `delete` | `fn delete(&self, public_key: &PublicKey) -> Result<(), IdentityError>` | Delete stored key |

---

### High-Level Identity Functions

#### `create_identity() -> (KeyPair, IdentityCreationProof)`

```rust
pub fn create_identity() -> (KeyPair, IdentityCreationProof)
```

**Location**: `src/identity/mod.rs:100`

**Purpose**: Create new identity with default PoW difficulty (20 bits).

**Expected Duration**: ~10-30 seconds on desktop hardware.

---

#### `create_identity_with_difficulty(difficulty: u8) -> (KeyPair, IdentityCreationProof)`

```rust
pub fn create_identity_with_difficulty(difficulty: u8) -> (KeyPair, IdentityCreationProof)
```

**Location**: `src/identity/mod.rs:125`

**Purpose**: Create identity with specified PoW difficulty.

**Recommended**:
- Testing: difficulty 4-8 (fast)
- Production: difficulty 20 (default)

---

#### `create_identity_with_callback<F>(difficulty: u8, callback: F) -> (KeyPair, IdentityCreationProof)`

```rust
pub fn create_identity_with_callback<F>(
    difficulty: u8,
    callback: F,
) -> (KeyPair, IdentityCreationProof)
where
    F: FnMut(u64),
```

**Location**: `src/identity/mod.rs:143`

**Purpose**: Create identity with progress reporting.

---

#### `export_identity(keypair: &KeyPair, proof: Option<&IdentityCreationProof>, passphrase: &str) -> Result<PortableIdentity, IdentityError>`

```rust
pub fn export_identity(
    keypair: &KeyPair,
    proof: Option<&IdentityCreationProof>,
    passphrase: &str,
) -> Result<PortableIdentity, IdentityError>
```

**Location**: `src/identity/mod.rs:167`

**Purpose**: Export identity to portable format for backup/transfer.

---

#### `import_identity(portable: &PortableIdentity, passphrase: &str) -> Result<(KeyPair, Option<IdentityCreationProof>), IdentityError>`

```rust
pub fn import_identity(
    portable: &PortableIdentity,
    passphrase: &str,
) -> Result<(KeyPair, Option<IdentityCreationProof>), IdentityError>
```

**Location**: `src/identity/mod.rs:193`

**Purpose**: Import identity from portable format.

---

### Portable Identity Serialization

#### `serialize_portable(identity: &PortableIdentity) -> Vec<u8>`

```rust
pub fn serialize_portable(identity: &PortableIdentity) -> Vec<u8>
```

**Location**: `src/identity/portable.rs:76`

**Purpose**: Serialize portable identity to binary format.

---

#### `deserialize_portable(data: &[u8]) -> Result<PortableIdentity, IdentityError>`

```rust
pub fn deserialize_portable(data: &[u8]) -> Result<PortableIdentity, IdentityError>
```

**Location**: `src/identity/portable.rs:122`

**Purpose**: Deserialize portable identity from binary.

**Minimum Size**: 41 bytes (magic + version + pubkey + enc_len + flags)

---

#### `to_base64(identity: &PortableIdentity) -> String`

```rust
pub fn to_base64(identity: &PortableIdentity) -> String
```

**Location**: `src/identity/portable.rs:214`

**Purpose**: Encode portable identity as base64 for text transport.

---

#### `from_base64(encoded: &str) -> Result<PortableIdentity, IdentityError>`

```rust
pub fn from_base64(encoded: &str) -> Result<PortableIdentity, IdentityError>
```

**Location**: `src/identity/portable.rs:221`

**Purpose**: Decode portable identity from base64.

---

### Hash Functions

#### `sha256(data: &[u8]) -> [u8; 32]`

```rust
pub fn sha256(data: &[u8]) -> [u8; 32]
```

**Location**: `src/crypto/hash.rs:15`

**Purpose**: Compute SHA-256 hash.

---

#### `pow_hash(data: &[u8]) -> [u8; 32]`

```rust
pub fn pow_hash(data: &[u8]) -> [u8; 32]
```

**Location**: `src/crypto/hash.rs:37`

**Purpose**: Compute PoW hash (SHA-256 per SPEC_01 §3.4).

---

#### `leading_zeros(hash: &[u8; 32]) -> u32`

```rust
pub fn leading_zeros(hash: &[u8; 32]) -> u32
```

**Location**: `src/crypto/hash.rs:88`

**Purpose**: Count leading zero bits in hash for PoW verification.

---

#### `verify_pow_difficulty(hash: &[u8; 32], difficulty: u8) -> bool`

```rust
pub fn verify_pow_difficulty(hash: &[u8; 32], difficulty: u8) -> bool
```

**Location**: `src/crypto/hash.rs:105`

**Purpose**: Verify hash meets required PoW difficulty.

---

## Behaviors

### Identity Creation Flow

**Trigger**: User initiates identity creation

**Process**:
1. Generate Ed25519 keypair using OS secure randomness
2. Get current UNIX timestamp
3. Initialize nonce to 0
4. **Mining Loop**:
   - Build data: `pubkey[32] || timestamp_le[8] || nonce_le[8]`
   - Compute SHA-256 hash
   - Count leading zero bits
   - If zeros >= difficulty, stop
   - Otherwise, increment nonce and repeat
5. Return keypair and proof containing public key, timestamp, nonce, and hash

**Outcome**: User has a keypair and valid creation proof ready for network registration

**Performance**: Difficulty 20 targets ~10-30 seconds on desktop hardware (2^20 expected attempts)

---

### Signature Envelope Verification

**Trigger**: Receiving an action with signature envelope

**Process**:
1. Extract timestamp from envelope
2. Compare to current time:
   - If timestamp is in the past, check age <= 3600s
   - If timestamp is in the future, check ahead <= 300s
3. Construct signed message: `content_hash[32] || timestamp_le[8]`
4. Verify Ed25519 signature against message using signer's public key

**Outcome**:
- `Ok(true)` - Valid signature
- `Ok(false)` - Invalid signature (wrong key or tampered)
- `Err(TimestampTooOld)` - Signature expired (>1h old)
- `Err(TimestampTooNew)` - Signature from future (>5min ahead)

---

### Identity PoW Verification

**Trigger**: New identity registration or existing identity validation

**Process**:
1. Recompute hash from proof data: `pubkey || timestamp || nonce`
2. Compare computed hash to proof's `pow_hash`
3. Count leading zeros in hash
4. Verify zeros >= required difficulty
5. Check timestamp bounds:
   - For creation: Not more than 24h old (anti-stockpile)
   - For verification: Not more than 1h old (strict mode)
   - Not more than 5min in future

**Outcome**:
- `Ok(())` - Proof is valid
- `Err(PowDifficultyNotMet)` - Hash doesn't meet difficulty
- `Err(PowTimestampStockpile)` - Pre-computed proof (>24h old)
- `Err(PowTimestampExpired)` - Proof too old for verification (>1h)
- `Err(PowTimestampFuture)` - Invalid future timestamp

---

### Encrypted Key Storage Flow

**Encryption (Save)**:
1. Generate random 16-byte salt
2. Derive 32-byte encryption key from passphrase using Argon2id
3. Generate random 12-byte nonce
4. Encrypt 64-byte private key with ChaCha20-Poly1305
5. Write `salt || nonce || ciphertext || tag` (108 bytes) to file

**Decryption (Load)**:
1. Read encrypted blob from file
2. Extract salt (first 16 bytes)
3. Derive key from passphrase using Argon2id with extracted salt
4. Extract nonce (next 12 bytes)
5. Decrypt remaining ciphertext with ChaCha20-Poly1305
6. Return 64-byte private key

---

### Address Encoding/Decoding

**Encoding**:
1. Prepare data: `version_byte[1] || payload[32]` (33 bytes)
2. Encode using Bech32m with HRP "cs"
3. Result: `cs1...` (~59 characters, lowercase)

**Decoding**:
1. Parse Bech32m to get HRP and data
2. Validate HRP is "cs"
3. Validate first byte is version 0
4. Validate remaining data is 32 bytes
5. Return payload as IdentityId or PublicKey

---

## Configuration Options

### Protocol Constants (from `src/types/constants.rs`)

| Constant | Value | Description |
|----------|-------|-------------|
| `ADDRESS_HRP` | `"cs"` | Bech32m human-readable prefix |
| `ADDRESS_VERSION` | `0` | Current address version byte |
| `IDENTITY_POW_DIFFICULTY` | `20` | Default PoW difficulty (bits) |
| `SIGNATURE_PAST_TOLERANCE_SECS` | `3600` | 1 hour past tolerance for signatures |
| `SIGNATURE_FUTURE_TOLERANCE_SECS` | `300` | 5 minute future tolerance for signatures |
| `POW_TIMESTAMP_MAX_AGE_SECS` | `86400` | 24 hour anti-stockpile limit |
| `MAX_DISPLAY_NAME_BYTES` | `64` | Maximum display name length |
| `MAX_BIO_BYTES` | `256` | Maximum bio length |

### PoW Constants (from `src/crypto/pow.rs`)

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_IDENTITY_POW_DIFFICULTY` | `20` | Default difficulty (targets ~10-30s) |
| `POW_MAX_AGE_SECS` | `86400` | 24h anti-stockpile limit |
| `POW_PAST_TOLERANCE_SECS` | `3600` | 1h strict verification tolerance |
| `POW_FUTURE_TOLERANCE_SECS` | `300` | 5min future timestamp tolerance |
| `CALLBACK_INTERVAL` | `1000000` | Progress callback frequency (1M hashes) |

### Key Storage Constants (from `src/identity/storage.rs`)

| Constant | Value | Description |
|----------|-------|-------------|
| `ARGON2_TIME_COST` | `3` | Argon2id iterations |
| `ARGON2_MEM_COST` | `65536` | Argon2id memory in KiB (64 MB) |
| `ARGON2_PARALLELISM` | `1` | Argon2id lanes |
| `SALT_LEN` | `16` | Salt length in bytes |
| `NONCE_LEN` | `12` | ChaCha20-Poly1305 nonce length |
| `TAG_LEN` | `16` | Poly1305 tag length |
| `PRIVATE_KEY_SIZE` | `64` | Private key size (seed + pubkey) |
| `KEY_FILE_EXT` | `".key"` | File extension for key files |

### Portable Format Constants (from `src/identity/portable.rs`)

| Constant | Value | Description |
|----------|-------|-------------|
| `PORTABLE_MAGIC` | `b"CSID"` | Magic bytes for portable identity |
| `PORTABLE_VERSION` | `1` | Current format version |

---

## Error Types

### `IdentityError`

| Variant | Description |
|---------|-------------|
| `PowDifficultyNotMet { required, actual }` | Hash doesn't meet difficulty requirement |
| `PowTimestampStockpile { age_secs }` | PoW too old for creation (>24h) |
| `PowTimestampExpired { age_secs }` | PoW too old for verification (>1h) |
| `PowTimestampFuture { ahead_secs }` | PoW timestamp in future (>5min) |
| `InvalidKeyFormat { reason }` | Invalid key structure |
| `EncryptionError(String)` | Encryption operation failed |
| `DecryptionError(String)` | Decryption failed (wrong passphrase) |
| `KeyDerivationError(String)` | Argon2id key derivation failed |
| `StorageError(String)` | File I/O error |
| `InvalidPortableFormat { reason }` | Portable identity format invalid |

### `AddressError`

| Variant | Description |
|---------|-------------|
| `InvalidHrp(String)` | Wrong HRP (expected "cs") |
| `InvalidChecksum` | Bech32 checksum failed |
| `InvalidLength(usize)` | Payload wrong size |
| `InvalidCharacter(usize)` | Invalid character at position |
| `UnsupportedVersion(u8)` | Unknown version byte |
| `Bech32Error(String)` | Generic Bech32 error |

### `SerializeError`

| Variant | Description |
|---------|-------------|
| `TimestampTooOld { age_secs, tolerance_secs }` | Signature timestamp expired |
| `TimestampTooNew { ahead_secs, tolerance_secs }` | Signature timestamp in future |

---

## Integration Points

### RPC Methods (from `src/rpc/methods.rs`)

| Method | Description |
|--------|-------------|
| `get_identity_info` | Returns public key and address for node identity |
| `sign_message` | Signs message with node keypair |
| `get_identity_level` | Gets swimmer level for identity |
| `get_identity_name` | Gets display name for identity |
| `set_identity_name` | Sets display name for identity |
| `register_genesis_identity` | Registers genesis trust root identity |
| `register_sponsored_identity` | Registers sponsored newcomer identity |

### CLI Commands (from `src/cli/commands/identity.rs`)

| Command | Description |
|---------|-------------|
| `cs identity create` | Create new identity with PoW |
| `cs identity show` | Display identity info (optionally with seed) |
| `cs identity export` | Export encrypted backup |
| `cs identity import` | Import from backup |

### Network Messages

All content actions include `SignatureEnvelope` with:
- Signer's public key
- Timestamp
- Action type
- Content hash
- Ed25519 signature

### WASM Bindings (from `swimchain-wasm/`)

| Export | Description |
|--------|-------------|
| `WasmKeypair` | Keypair wrapper for browser |
| `encode_address()` | Address encoding |
| `decode_address()` | Address decoding |
| `verify_signature()` | Signature verification |
| `mine_identity_pow()` | Browser PoW mining |
| `verify_identity_pow()` | Browser PoW verification |
| `WasmPowSolution` | PoW solution wrapper |

---

## Dependencies

### External Crates

| Crate | Version | Purpose |
|-------|---------|---------|
| `ed25519_dalek` | - | Ed25519 signatures |
| `bech32` | - | Bech32m address encoding |
| `sha2` | - | SHA-256 hashing |
| `argon2` | - | Argon2id key derivation |
| `chacha20poly1305` | - | Authenticated encryption |
| `rand` / `rand_core` | - | Secure random generation (OsRng) |
| `zeroize` | - | Memory zeroing on drop |
| `base64` | - | Base64 encoding for portable format |
| `blake3` | - | Fast hashing (internal operations) |

### Internal Modules

| Module | Purpose |
|--------|---------|
| `crate::types::identity` | Type definitions |
| `crate::types::constants` | Protocol constants |
| `crate::types::error` | Error types |
| `crate::sponsorship` | Sponsorship validation |

---

## Test Coverage

### Unit Tests Location

| File | Test Coverage |
|------|---------------|
| `src/crypto/signature.rs` | Keypair generation, sign/verify roundtrip, wrong key fails, envelope verification, timestamp tolerances |
| `src/crypto/address.rs` | Encode/decode roundtrip, cs1 prefix, lowercase, invalid HRP/version/length, checksum |
| `src/crypto/pow.rs` | Mining, verification, timestamp tolerances (stockpile, future, strict) |
| `src/crypto/hash.rs` | SHA-256 vectors, leading zeros, merkle root, PoW difficulty |
| `src/identity/storage.rs` | Encrypt/decrypt roundtrip, wrong passphrase, corrupted data, storage save/load/list/delete |
| `src/identity/portable.rs` | Portable format roundtrip, base64, invalid magic/version, truncated data |
| `src/identity/mod.rs` | Create identity, export/import roundtrip, address encoding |

### Integration Tests

| File | Coverage |
|------|----------|
| `tests/spec_vectors.rs` | SPEC_01 test vectors for key generation, address encoding, signing, PoW |
| `tests/types_tests.rs` | Identity types, serialization, hash functions |
| `tests/e2e_flows/flow1_identity_post.rs` | End-to-end identity creation and content propagation |

---

## Security Considerations

### Key Generation
- Uses `rand::rngs::OsRng` for cryptographically secure randomness
- Ed25519 provides 128-bit security level

### Key Storage
- Argon2id parameters (64MB memory, 3 iterations) provide ASIC resistance
- ChaCha20-Poly1305 provides authenticated encryption
- Random salt prevents rainbow table attacks
- Random nonce ensures unique ciphertext

### Memory Safety
- Private keys are zeroed on drop using volatile writes
- `zeroize` crate used for secure memory handling
- Debug output shows `[REDACTED]` instead of key material

### Timing Safety
- Ed25519 signature verification is constant-time in `ed25519_dalek`
- Argon2 is designed to be memory-hard and timing-resistant

### Anti-Spam
- 20-bit PoW difficulty prevents mass identity creation
- 24-hour anti-stockpile prevents pre-computing identities
- Timestamp tolerances prevent replay attacks

---

## Specification Compliance

This implementation follows **SPEC_01** sections:
- §3.3: Bech32m address encoding with "cs" HRP
- §3.4: SHA-256 PoW for identity creation
- §3.5: Identity metadata (display_name, bio limits)
- §3.7: Action types for first appearance
- §3.9: Signature envelope format
- §6.2: Signature timestamp tolerances (1h past, 5min future)
- §6.3: PoW verification rules (V-POW-01 through V-POW-04)
- §12.1: Default difficulty of 20 bits

---

## Testing

### Run Unit Tests

```bash
# All identity-related tests
cargo test identity

# Specific module tests
cargo test crypto::signature
cargo test crypto::address
cargo test crypto::pow
cargo test identity::storage
cargo test identity::portable
```

### Test with Low Difficulty

For faster testing, use difficulty 4 instead of 20:

```rust
use swimchain::identity::create_identity_with_difficulty;

// Fast for testing (~instant)
let (keypair, proof) = create_identity_with_difficulty(4);
```

### CLI Testing

```bash
# Set password via environment variable for testing
export SWIMCHAIN_PASSWORD="test-password"

# Create identity with reduced PoW (hidden flag)
cs identity create --no-pow

# Show identity
cs identity show --json

# Export and import roundtrip
cs identity export backup.dat
cs identity import backup.dat
```

### Spec Test Vectors

```bash
# Run SPEC_01 compliance tests
cargo test spec_vectors
```

---

## Known Limitations

- **No Key Recovery**: Lost keys cannot be recovered by design; users must backup
- **Single Key Per Identity**: No hierarchical deterministic (HD) key derivation support
- **No Key Rotation**: Identity is permanently tied to original keypair
- **Memory-Hard PoW**: Only SHA-256 for identity PoW; action PoW uses Argon2id separately
- **Display Name Limit**: 64 bytes constant may differ from 31-byte limit in action serialization - needs reconciliation
- **No Hardware Wallet Support**: Keys must be stored in software

---

## Future Work

- **HD Key Derivation**: Support for BIP-32 style key hierarchy
- **Multi-Signature Support**: Threshold signatures for shared identity control
- **Key Rotation Protocol**: Mechanism to rotate identity keys while maintaining reputation
- **Hardware Wallet Integration**: Support for Ledger/Trezor devices
- **Social Recovery**: Optional trusted contacts recovery mechanism
- **WebAuthn/Passkeys**: Browser-native credential support

---

## Related Features

- [Proof-of-Work Systems](./proof-of-work-systems_FEATURE_DOC.md) - Action PoW using Argon2id
- [Private Spaces & Encryption](./private-spaces-encryption_FEATURE_DOC.md) - X25519 key exchange derived from Ed25519
- [Sponsorship & Sybil Resistance](./sponsorship-sybil-resistance_FEATURE_DOC.md) - Genesis identities and trust trees
- [React SDK](./react-sdk_FEATURE_DOC.md) - Identity hooks (`useKeypair`, `useStoredIdentity`)
- [RPC API](./rpc-api_FEATURE_DOC.md) - Identity-related RPC methods

---

## Document Version

- **Generated**: 2026-01-12
- **Source Commit**: 52804af
- **Specification**: SPEC_01
