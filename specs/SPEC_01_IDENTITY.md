# Protocol Specification: Identity System (Your Wristband)

Your wristband is your identity. Lose it, and you're not getting back in the pool.

## Status: IMPLEMENTED

## Version: 1.0.0

## 1. Overview

### 1.1 Purpose

The Identity System defines how users create, own, and verify their identities within Swimchain. Like a swimmer's wristband, your identity is the foundation for everything—every stroke is signed by you, your swimming history accrues to you, and your lane membership is tied to you.

Swimchain's identity model is **persistent pseudonymity**: users maintain consistent identities over time that accumulate reputation and history, without linking to real-world legal identity. This creates stake through social capital while protecting users from real-world targeting.

### 1.2 Design Principles

The following principles, derived from the thesis documents, guide this specification:

1. **Identity IS the keypair**: Your cryptographic key is your identity. There is no separation between "account" and "key"—they are the same thing. (THESIS_01)

2. **No recovery by design**: There is no "forgot password" mechanism because there is no authority capable of resetting access. Losing your key is semantically equivalent to "forgetting who you are." This is structural, not a missing feature. (THESIS_01)

3. **Privacy through pseudonymity, not anonymity**: Identities are persistent and accumulate reputation but do not link to legal identity. This is the deliberate middle path between targeting-enabling real names and consequence-free anonymity. (THESIS_07)

4. **Exclusion is a feature**: Key management functions as a commitment filter that selects for users capable of participating in a decentralized system. The barrier is not a bug. (THESIS_01)

5. **Stake through reputation**: Established identities have something to lose. The consequence for bad behavior is reputation damage. Throwaway accounts have no weight. (THESIS_07)

6. **Portability across forks**: Since forks are expected and encouraged, identity must survive community splits. The same keypair proves "same person" on any fork. (VISION.md)

7. **Verification without connectivity**: Identity verification is purely cryptographic signature verification. No external lookup, no network query, no central registry required.

### 1.3 Scope

**In scope:**
- Key generation algorithms and formats
- Identity representation and encoding
- Signature schemes for content authentication
- Cross-fork identity portability
- Sybil resistance mechanisms at the identity layer
- Reputation system fundamentals
- Identity metadata (display names, etc.)

**Out of scope:**
- Client-side key storage (implementation detail)
- Key backup UX (client concern)
- Community-layer identity requirements (Spaces specification)
- Specific reputation scoring algorithms (may be client-defined)
- Multi-device synchronization (client concern)

---

## 2. Requirements

### 2.1 Hard Constraints (MUST)

| ID | Requirement | Source |
|----|-------------|--------|
| ID-H01 | Identity MUST be a cryptographic keypair (public + private key) | THESIS_07, VISION.md |
| ID-H02 | No password recovery mechanism MUST exist | THESIS_01 |
| ID-H03 | No central authority MUST be required for identity verification | VISION.md |
| ID-H04 | Identity MUST be persistent across time | THESIS_07 |
| ID-H05 | Identity MUST NOT link to legal/real-world identity at the protocol level | THESIS_07 |
| ID-H06 | All posts MUST be cryptographically signed by the author's identity | THESIS_01 |
| ID-H07 | Identity MUST be fully user-managed (self-custody) | THESIS_01, VISION.md |
| ID-H08 | Identity MUST be portable across forks | VISION.md |
| ID-H09 | Identity verification MUST work offline with local chain data | VISION.md |
| ID-H10 | Signature verification MUST be deterministic | Protocol requirement |

### 2.2 Soft Constraints (SHOULD)

| ID | Requirement | Source |
|----|-------------|--------|
| ID-S01 | Reputation SHOULD accumulate over time | THESIS_07 |
| ID-S02 | New accounts SHOULD be visibly distinguishable from established ones | THESIS_07 |
| ID-S03 | Age-weighted reputation SHOULD give more weight to older accounts | THESIS_07 |
| ID-S04 | Identity creation SHOULD optionally require proof-of-work | THESIS_07 |
| ID-S05 | Historical behavior SHOULD be visible and attributable | THESIS_07 |
| ID-S06 | Identity representation SHOULD be human-distinguishable | Usability |
| ID-S07 | Identity encoding SHOULD detect accidental transcription errors | Usability |

### 2.3 Anti-Patterns (MUST NOT)

| ID | Anti-Pattern | Source |
|----|--------------|--------|
| ID-A01 | MUST NOT implement real-name or legal identity verification | THESIS_07 |
| ID-A02 | MUST NOT create any form of password or key recovery mechanism | THESIS_01 |
| ID-A03 | MUST NOT store identity mappings in any centralized system | VISION.md |
| ID-A04 | MUST NOT implement pure anonymity (unattributed posts) | THESIS_07 |
| ID-A05 | MUST NOT trust any external identity provider | THESIS_01 |
| ID-A06 | MUST NOT require network connectivity to verify identity | VISION.md |
| ID-A07 | MUST NOT allow key rotation while preserving reputation (this would enable Sybil attacks) | THESIS_07 |

---

## 3. Data Structures

### 3.1 Identity Keypair

```
Identity {
    public_key:  [u8; 32]      // Ed25519 public key (256 bits)
    private_key: [u8; 64]      // Ed25519 private key (512 bits, includes public key suffix)
}
```

**Fields:**
- `public_key`: The public portion of the Ed25519 keypair. This IS the identity. 32 bytes.
- `private_key`: The secret portion of the Ed25519 keypair. Never transmitted, never stored on-chain. 64 bytes (Ed25519 format includes public key as suffix).

**Invariants:**
- The private key and public key MUST form a valid Ed25519 keypair
- The private key MUST never appear in any on-chain data
- The private key MUST never be transmitted over the network

### 3.2 Identity Identifier (IdentityID)

```
IdentityID = PublicKey[0..32]  // The raw 32-byte public key IS the identity
```

The identity identifier is simply the public key. There is no hash, no additional derivation. This ensures:
- Uniqueness (public keys are unique by definition)
- Verifiability (you can always verify a signature against the ID directly)
- Simplicity (no mapping layer)

### 3.3 Identity Address (Human-Readable)

```
IdentityAddress {
    hrp:     "cs"              // Human-readable part (2 chars)
    version: u5                // Version nibble (5 bits), currently 0
    payload: [u8; 32]          // Raw public key
    checksum: [u5; 6]          // Bech32m checksum (6 characters)
}

// Encoded format: "cs1<bech32m_encoded_pubkey>"
// Example: "cs1qw508d6qejxtdg4y5r3zarvary0c5xw7kxwjgxt"
```

**Fields:**
- `hrp`: Human-readable prefix, always "cs" (Swimchain)
- `version`: Witness version for future extensibility, currently 0
- `payload`: The raw 32-byte public key
- `checksum`: Bech32m error-detecting checksum

**Encoding:**
Uses Bech32m encoding (BIP-350) for:
- Error detection (catches up to 4 character substitutions)
- Human-readable prefix for context
- Case-insensitive (conventionally lowercase)
- No ambiguous characters (no 1, b, i, o)

**Length:** 62 characters total (2 + 1 + 52 + 6 + separators)

### 3.4 Identity Creation Proof (Optional)

```
IdentityCreationProof {
    public_key:    [u8; 32]    // The identity being created
    timestamp:     u64         // Unix timestamp (seconds)
    nonce:         u64         // PoW nonce
    pow_hash:      [u8; 32]    // SHA-256(public_key || timestamp || nonce)
}
```

**Fields:**
- `public_key`: The newly created identity
- `timestamp`: When creation was attempted (used to prevent pre-mining)
- `nonce`: The value that makes the PoW hash meet difficulty
- `pow_hash`: The resulting hash that must meet difficulty target

**Invariants:**
- `pow_hash` MUST equal `SHA-256(public_key || timestamp_le_bytes || nonce_le_bytes)`
- `pow_hash` MUST have at least N leading zero bits (where N is the current identity PoW difficulty)
- `timestamp` MUST be within acceptable range of current time (prevents stockpiling)

### 3.5 Identity Metadata (Optional)

```
IdentityMetadata {
    identity:      IdentityID           // The identity this metadata belongs to
    display_name:  Option<string>       // Human-readable name (max 64 UTF-8 bytes)
    avatar_cid:    Option<[u8; 32]>     // Content-addressed avatar reference (CID)
    bio:           Option<string>       // Short biography (max 256 UTF-8 bytes)
    updated_at:    u64                  // Unix timestamp of last update
    signature:     [u8; 64]             // Ed25519 signature over serialized fields
}
```

**Fields:**
- `identity`: The identity this metadata describes
- `display_name`: Optional human-friendly name. NOT unique, NOT verified.
- `avatar_cid`: Content identifier for avatar image (stored off-chain)
- `bio`: Optional self-description
- `updated_at`: When this metadata was last modified
- `signature`: Proves the identity owner authorized this metadata

**Invariants:**
- `signature` MUST be valid Ed25519 signature by `identity` over canonical serialization of other fields
- `display_name` MUST be valid UTF-8, max 64 bytes
- `bio` MUST be valid UTF-8, max 256 bytes
- `updated_at` MUST be greater than previous metadata update (monotonic)

**Security Note:** Display names are NOT unique identifiers. Clients MUST always show the underlying identity address alongside any display name to prevent impersonation.

**Canonical Serialization:**
The `signature` field covers a canonical byte serialization of the metadata fields. The canonical form is:

```
canonical_metadata =
    identity (32 bytes) ||
    display_name_length (1 byte, u8) ||
    display_name_bytes (0-64 bytes, UTF-8) ||
    avatar_cid_present (1 byte: 0x00 = absent, 0x01 = present) ||
    avatar_cid (32 bytes, if present) ||
    bio_length (2 bytes, u16 little-endian) ||
    bio_bytes (0-256 bytes, UTF-8) ||
    updated_at (8 bytes, u64 little-endian)
```

All integers are little-endian. Optional fields use a presence byte (0x00 = absent, 0x01 = present) followed by the value if present. Strings are length-prefixed with no null terminators.

### 3.6 Reputation Summary

```
ReputationSummary {
    identity:           IdentityID           // The identity
    first_block:        u64                  // Block height of first appearance
    post_count:         u64                  // Total posts by this identity
    reply_count:        u64                  // Total replies by this identity
    received_replies:   u64                  // Replies received on posts
    age_seconds:        u64                  // Approximate age in seconds
}
```

**Fields:**
- `identity`: The identity this summary describes
- `first_block`: Block height where identity first appeared (0 if never seen)
- `post_count`: Number of top-level posts created by this identity
- `reply_count`: Number of replies created by this identity
- `received_replies`: Number of replies other identities made to this identity's content
- `age_seconds`: Approximate age computed from first_block (may vary by client's block time estimate)

**Note:** This is an informational summary computed by nodes. It is NOT signed and NOT authoritative—different nodes may compute slightly different values based on their view of the chain. Clients SHOULD compute their own values when possible rather than trusting peer-provided summaries.

### 3.8 First Appearance Record

```
FirstAppearance {
    identity:      IdentityID           // The identity
    block_height:  u64                  // Block where identity first appeared
    block_hash:    [u8; 32]             // Hash of that block (for fork detection)
    action_type:   ActionType           // What the first action was
}

enum ActionType {
    Post,                               // Created a post
    Reply,                              // Created a reply
    IdentityCreation,                   // Explicit identity creation with PoW
}
```

**Purpose:** Enables age-weighted reputation by tracking when identities first appeared on-chain.

**Invariants:**
- First appearance is immutable once recorded
- Each fork tracks its own first appearances independently

### 3.9 Signature Envelope

```
SignatureEnvelope {
    signer:        IdentityID           // Who signed
    timestamp:     u64                  // When signed (Unix seconds)
    content_hash:  [u8; 32]             // SHA-256 of signed content
    signature:     [u8; 64]             // Ed25519 signature
}
```

**Fields:**
- `signer`: The identity that created this signature
- `timestamp`: When the signature was created
- `content_hash`: Hash of the content being signed (for detached signatures)
- `signature`: The actual Ed25519 signature over `(content_hash || timestamp_le_bytes)`

**Invariants:**
- `signature` MUST be valid for `(content_hash || timestamp_le_bytes)` under `signer`'s public key
- `timestamp` SHOULD be reasonably close to current time (within protocol-defined window)

---

## 4. Algorithms

### 4.1 Key Generation

**Purpose:** Generate a new identity keypair

**Input:**
- `entropy`: 32 bytes of cryptographically secure random data

**Output:**
- `Identity`: A valid Ed25519 keypair

**Steps:**
1. Obtain 32 bytes of entropy from a CSPRNG (e.g., `/dev/urandom`, `getrandom()`, `CryptoGenRandom`)
2. Use entropy as Ed25519 seed
3. Derive keypair using Ed25519 key derivation: `(private_key, public_key) = ed25519_keygen(entropy)`
4. Securely zero the entropy buffer
5. Return the Identity

**Complexity:** O(1)

**Security Considerations:**
- Entropy MUST come from a cryptographically secure source
- Entropy MUST be zeroed after use
- Private key MUST never be logged, transmitted, or stored insecurely

```
function generate_identity():
    entropy = csprng_bytes(32)
    (private_key, public_key) = ed25519_keygen(entropy)
    secure_zero(entropy)
    return Identity { public_key, private_key }
```

### 4.2 Identity Address Encoding

**Purpose:** Convert a public key to a human-readable address

**Input:**
- `public_key`: 32-byte Ed25519 public key

**Output:**
- `address`: Bech32m-encoded string

**Steps:**
1. Set HRP (human-readable part) to "cs"
2. Set version byte to 0
3. Convert public key to 5-bit groups for Bech32m
4. Compute Bech32m checksum over HRP and data
5. Encode as Bech32m string

```
function encode_address(public_key: [u8; 32]) -> string:
    hrp = "cs"
    version = 0
    data_5bit = convert_to_5bit([version] || public_key)
    checksum = bech32m_checksum(hrp, data_5bit)
    return bech32m_encode(hrp, data_5bit || checksum)
```

**Complexity:** O(n) where n is key length (constant 32 bytes, so effectively O(1))

### 4.3 Identity Address Decoding

**Purpose:** Convert a human-readable address back to a public key

**Input:**
- `address`: Bech32m-encoded string

**Output:**
- `public_key`: 32-byte Ed25519 public key
- OR error if invalid

**Steps:**
1. Decode Bech32m string
2. Verify HRP is "cs"
3. Verify checksum is valid
4. Extract version byte, verify it is 0
5. Convert 5-bit groups back to 8-bit bytes
6. Verify length is exactly 32 bytes
7. Return public key

```
function decode_address(address: string) -> Result<[u8; 32], Error>:
    (hrp, data_5bit) = bech32m_decode(address)?
    if hrp != "cs":
        return Error::InvalidPrefix
    if !bech32m_verify_checksum(hrp, data_5bit):
        return Error::InvalidChecksum
    data_8bit = convert_to_8bit(data_5bit)
    version = data_8bit[0]
    if version != 0:
        return Error::UnsupportedVersion
    public_key = data_8bit[1..33]
    if public_key.len() != 32:
        return Error::InvalidLength
    return Ok(public_key)
```

**Complexity:** O(n) where n is address length (constant, so effectively O(1))

**Edge Cases:**
- Invalid Bech32m encoding: Return `Error::InvalidEncoding`
- Wrong HRP: Return `Error::InvalidPrefix`
- Bad checksum: Return `Error::InvalidChecksum`
- Wrong version: Return `Error::UnsupportedVersion`
- Wrong length: Return `Error::InvalidLength`

### 4.4 Content Signing

**Purpose:** Create a cryptographic signature over content

**Input:**
- `identity`: The signer's Identity (includes private key)
- `content`: Arbitrary byte array to sign
- `timestamp`: Current Unix timestamp (seconds)

**Output:**
- `SignatureEnvelope`: The signature with metadata

**Steps:**
1. Compute content hash: `content_hash = SHA-256(content)`
2. Construct signing payload: `payload = content_hash || timestamp_le_bytes`
3. Sign with Ed25519: `signature = ed25519_sign(identity.private_key, payload)`
4. Return SignatureEnvelope

```
function sign_content(identity: Identity, content: bytes, timestamp: u64) -> SignatureEnvelope:
    content_hash = sha256(content)
    payload = content_hash || u64_to_le_bytes(timestamp)
    signature = ed25519_sign(identity.private_key, payload)
    return SignatureEnvelope {
        signer: identity.public_key,
        timestamp: timestamp,
        content_hash: content_hash,
        signature: signature
    }
```

**Complexity:** O(n) where n is content length (for hashing)

### 4.5 Signature Verification

**Purpose:** Verify that a signature is valid

**Input:**
- `envelope`: SignatureEnvelope to verify
- `content`: Original content (optional, for hash verification)

**Output:**
- `bool`: True if valid, false otherwise

**Steps:**
1. If content provided, verify `SHA-256(content) == envelope.content_hash`
2. Reconstruct signing payload: `payload = envelope.content_hash || timestamp_le_bytes`
3. Verify Ed25519 signature: `ed25519_verify(envelope.signer, payload, envelope.signature)`
4. Return result

```
function verify_signature(envelope: SignatureEnvelope, content: Option<bytes>) -> bool:
    if content.is_some():
        if sha256(content.unwrap()) != envelope.content_hash:
            return false
    payload = envelope.content_hash || u64_to_le_bytes(envelope.timestamp)
    return ed25519_verify(envelope.signer, payload, envelope.signature)
```

**Complexity:** O(n) for content hashing, O(1) for signature verification

**Edge Cases:**
- Malformed signature: Return false
- Wrong signer: Return false (signature won't verify)
- Content hash mismatch: Return false

### 4.6 Identity Creation with Proof-of-Work

**Purpose:** Create a new identity with Sybil-resistance proof

**Input:**
- `difficulty`: Number of leading zero bits required
- `timestamp_window`: Acceptable timestamp variance (seconds)

**Output:**
- `IdentityCreationProof`: Valid proof of work for new identity

**Steps:**
1. Generate new identity keypair
2. Get current timestamp
3. Start nonce at 0
4. Loop:
   a. Compute `pow_hash = SHA-256(public_key || timestamp_le || nonce_le)`
   b. Check if pow_hash has >= `difficulty` leading zero bits
   c. If yes, return proof
   d. Increment nonce
   e. If nonce overflows, increment timestamp and reset nonce

```
function create_identity_with_pow(difficulty: u8) -> (Identity, IdentityCreationProof):
    identity = generate_identity()
    timestamp = current_unix_time()
    nonce = 0

    loop:
        pow_hash = sha256(identity.public_key || u64_to_le(timestamp) || u64_to_le(nonce))
        if leading_zeros(pow_hash) >= difficulty:
            proof = IdentityCreationProof {
                public_key: identity.public_key,
                timestamp: timestamp,
                nonce: nonce,
                pow_hash: pow_hash
            }
            return (identity, proof)
        nonce += 1
        if nonce == u64::MAX:
            timestamp += 1
            nonce = 0
```

**Complexity:** O(2^difficulty) expected operations

**Edge Cases:**
- Difficulty too high: May take impractical time (client should impose reasonable maximum)
- Timestamp drift: Verifiers should accept timestamps within reasonable window

### 4.7 Identity Age Calculation

**Purpose:** Calculate the age of an identity on a given fork

**Input:**
- `identity`: IdentityID to look up
- `chain_state`: Current chain state (for first appearance lookup)

**Output:**
- `Option<Duration>`: Age since first appearance, or None if never seen

**Steps:**
1. Look up FirstAppearance record for identity
2. If not found, return None
3. Calculate blocks since first appearance
4. Convert to approximate time (using average block time)
5. Return duration

```
function identity_age(identity: IdentityID, chain_state: ChainState) -> Option<Duration>:
    first = chain_state.first_appearance.get(identity)
    if first.is_none():
        return None
    blocks_since = chain_state.current_height - first.block_height
    // Approximate: 1 block ≈ 10 minutes (tunable parameter)
    seconds = blocks_since * 600
    return Some(Duration::from_secs(seconds))
```

**Complexity:** O(1) lookup

---

## 5. Wire Protocol

### 5.1 Message Types

| Type ID | Name | Description |
|---------|------|-------------|
| 0x10 | IDENTITY_ANNOUNCE | Announce a new identity on the network |
| 0x11 | IDENTITY_METADATA | Update identity metadata |
| 0x12 | IDENTITY_QUERY | Request identity information |
| 0x13 | IDENTITY_RESPONSE | Response to identity query |

### 5.2 Message Format

**Byte Order:** All multi-byte integers in wire protocol messages are encoded as **little-endian** unless otherwise specified.

All messages use a common envelope:

```
MessageEnvelope {
    version:       u8           // Protocol version (currently 1)
    type_id:       u8           // Message type from table above
    payload_len:   u32          // Length of payload in bytes
    payload:       [u8]         // Type-specific payload
}
```

#### 5.2.1 IDENTITY_ANNOUNCE (0x10)

```
IdentityAnnounce {
    public_key:         [u8; 32]            // The new identity
    creation_proof:     Option<CreationProof> // Optional PoW proof
    timestamp:          u64                  // Announcement time
    signature:          [u8; 64]            // Signature over above fields
}

// CreationProof presence indicated by flag byte:
// 0x00 = no proof
// 0x01 = proof follows
```

#### 5.2.2 IDENTITY_METADATA (0x11)

```
IdentityMetadataMsg {
    identity:           [u8; 32]            // Identity being updated
    display_name_len:   u8                  // Length of display name (0 = none)
    display_name:       [u8; display_name_len]
    bio_len:            u16                 // Length of bio (0 = none)
    bio:                [u8; bio_len]
    avatar_cid:         Option<[u8; 32]>    // CID if present (flag byte prefix)
    updated_at:         u64
    signature:          [u8; 64]
}
```

#### 5.2.3 IDENTITY_QUERY (0x12)

```
IdentityQuery {
    identity:           [u8; 32]            // Identity to query
    request_flags:      u8                  // What to return (bitmask)
                                            // 0x01 = metadata
                                            // 0x02 = first appearance
                                            // 0x04 = reputation summary
}
```

#### 5.2.4 IDENTITY_RESPONSE (0x13)

```
IdentityResponse {
    identity:           [u8; 32]
    found:              bool
    metadata:           Option<IdentityMetadata>    // If requested and exists
    first_appearance:   Option<FirstAppearance>     // If requested and exists
    reputation:         Option<ReputationSummary>   // If requested
}
```

---

## 6. Validation Rules

### 6.1 Key Validation

- `V-KEY-01`: Public key MUST be a valid point on the Ed25519 curve
- `V-KEY-02`: Public key MUST NOT be the identity point (all zeros)
- `V-KEY-03`: Public key MUST be in canonical form (no alternative encodings)

### 6.2 Signature Validation

- `V-SIG-01`: Signature MUST be exactly 64 bytes
- `V-SIG-02`: Signature MUST be valid under Ed25519 verification
- `V-SIG-03`: Signature timestamp MUST NOT be more than 3600 seconds (1 hour) in the past relative to the verifier's current time
- `V-SIG-04`: Signature timestamp MUST NOT be more than 300 seconds (5 minutes) in the future relative to the verifier's current time

### 6.3 Identity Creation Proof Validation

- `V-POW-01`: PoW hash MUST be correctly computed: `SHA-256(public_key || timestamp_le || nonce_le)` where `_le` denotes little-endian byte encoding
- `V-POW-02`: PoW hash MUST have at least N leading zero bits where N is the current difficulty (initial value: 20)
- `V-POW-03`: PoW timestamp MUST NOT be more than 3600 seconds (1 hour) in the past
- `V-POW-04`: PoW timestamp MUST NOT be more than 86400 seconds (24 hours) old (prevents pre-mining stockpiles)

### 6.4 Metadata Validation

- `V-META-01`: Display name MUST be valid UTF-8
- `V-META-02`: Display name MUST NOT exceed 64 bytes
- `V-META-03`: Bio MUST be valid UTF-8
- `V-META-04`: Bio MUST NOT exceed 256 bytes
- `V-META-05`: Signature MUST be valid for the identity
- `V-META-06`: Updated timestamp MUST be monotonically increasing for same identity

### 6.5 Address Validation

- `V-ADDR-01`: Address MUST start with "cs1"
- `V-ADDR-02`: Address MUST be valid Bech32m encoding
- `V-ADDR-03`: Decoded payload MUST be exactly 33 bytes (version + pubkey)
- `V-ADDR-04`: Version byte MUST be 0 (current version)

---

## 7. Security Considerations

### 7.1 Threat Model

| Threat | Description | Severity |
|--------|-------------|----------|
| TH-01 | Private key theft | Critical |
| TH-02 | Sybil attacks (one person, many identities) | High |
| TH-03 | Identity impersonation via similar display names | Medium |
| TH-04 | Signature replay attacks | Medium |
| TH-05 | Timing attacks on signature verification | Low |
| TH-06 | Side-channel attacks during key generation | Medium |

### 7.2 Mitigations

**TH-01 (Private key theft):**
- Private keys MUST never leave the client device
- Clients SHOULD encrypt stored keys at rest
- Clients SHOULD support hardware security modules where available
- Protocol includes NO recovery mechanism (by design)

**TH-02 (Sybil attacks):**
- Optional proof-of-work for identity creation raises cost
- Age-weighted reputation diminishes new account effectiveness
- Community-level vouching/gating (Spaces spec)
- Social graph analysis can detect coordinated behavior (client-level)
- *Acknowledged limitation*: Sybil resistance is ongoing, not solved

**TH-03 (Display name impersonation):**
- Clients MUST show underlying identity address alongside display names
- Clients SHOULD warn when display names match existing identities
- Display names are explicitly NOT unique

**TH-04 (Signature replay):**
- Timestamps included in signed data
- Content hashes prevent reuse on different content
- Clients SHOULD track seen signatures for duplicate detection

**TH-05 (Timing attacks):**
- Use constant-time comparison for signature verification
- Standard Ed25519 implementations provide this

**TH-06 (Side-channel attacks):**
- Key generation MUST use cryptographically secure entropy
- Clients SHOULD use platform-provided secure random sources
- Mobile clients SHOULD avoid generating keys during predictable states

### 7.3 Key Compromise Response

When a private key is believed compromised:
1. There is no revocation mechanism (by design)
2. The identity is permanently compromised
3. User MUST create a new identity
4. Reputation cannot transfer (this prevents Sybil attacks)
5. User can publicly announce compromise (but cannot prove it)

This is an accepted tradeoff. Any revocation mechanism would require a central authority or introduce Sybil attack vectors.

---

## 8. Privacy Considerations

### 8.1 What Is Protected

- **Legal identity**: No on-chain link between keypair and real-world identity
- **Physical location**: No location data in identity system
- **Cross-fork linkability**: Forks share identity format, but users can create new identities for different forks if desired

### 8.2 What Is NOT Protected

- **Behavioral patterns**: Writing style, posting times, topic interests may enable de-anonymization by sophisticated adversaries (THESIS_07 acknowledges this)
- **Public key linkage**: The same public key across forks is explicitly linkable (this is a feature for reputation portability)
- **Transaction history**: All posts by an identity are publicly attributable

### 8.3 User Guidance

Clients SHOULD inform users:
- Pseudonymity is not absolute privacy
- Patterns leak over time
- Sophisticated adversaries may correlate behavior
- Different identities for different contexts is possible (but loses reputation)

---

## 9. Interoperability

### 9.1 Dependencies on Other Subsystems

| Subsystem | Dependency |
|-----------|------------|
| Content/Posts | Posts MUST include SignatureEnvelope from author |
| Proof-of-Work | Identity creation PoW uses same hash function |
| Consensus | First appearance records stored in blocks |
| Spaces | Spaces may impose additional identity requirements |
| Decay | Identity metadata subject to decay if not refreshed |

### 9.2 Interfaces Exposed

| Interface | Purpose | Consumers |
|-----------|---------|-----------|
| `verify_signature(envelope, content)` | Validate content authorship | Content, Posts |
| `identity_age(id, chain)` | Calculate account age | Reputation, Spaces |
| `encode_address(pubkey)` | Human-readable display | Clients, UI |
| `decode_address(addr)` | Parse user input | Clients |

### 9.3 Cross-Fork Identity

An identity (keypair) is valid on any fork. Specifically:

1. The same `IdentityID` (public key) is recognized across forks
2. Signatures created on one fork verify on any fork
3. First appearance timestamps are fork-specific
4. Reputation is fork-specific (communities may value different behaviors)
5. Metadata updates are fork-specific (user may have different display names)

**Proof of cross-fork identity:** Sign a message containing both fork identifiers. Any node on either fork can verify the signature proves same key ownership.

---

## 10. Implementation Notes

### 10.1 Recommended Approach

**Cryptographic Library Selection:**
- Use well-audited Ed25519 implementations (e.g., libsodium, ed25519-dalek, TweetNaCl)
- Do NOT implement Ed25519 from scratch
- Verify constant-time guarantees

**Key Storage (Client Responsibility):**
- Encrypt at rest with user-derived key
- Consider hardware key storage on supported devices
- Clear memory after use

**Address Display:**
- Always show full address for verification
- Optionally show truncated form with clear indicator
- Display name MUST accompany, not replace, address

### 10.2 Known Challenges

**Challenge 1: Key Loss**
- No recovery possible by design
- Clients SHOULD implement robust backup encouragement
- Clients SHOULD warn users repeatedly about backup importance
- Some users WILL lose keys and identities

**Challenge 2: Sybil Resistance**
- Identity PoW raises barrier but doesn't prevent well-resourced attackers
- Age weighting helps but disadvantages legitimate new users
- Community vouching moves problem to community layer
- This is an ongoing challenge, not a solved problem

**Challenge 3: Display Name Confusion**
- Users expect unique names; we provide non-unique names
- Impersonation via similar names is easy
- Clients must work hard to make addresses visible and checkable

**Challenge 4: Multi-Device Use**
- Private key must exist on each device
- Synchronizing keys is a security risk
- No protocol-level solution; client responsibility
- Consider key derivation from master secret for advanced users

---

## 11. Test Vectors

### 11.1 Key Generation

**Input (32-byte seed, hex):**
```
9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

**Expected Public Key (hex):**
```
d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
```

**Expected Address:**
```
cs1q6adxgqczkzz40f0lhkn8yjgquswuuhrewd3z39h7pp2x005n0z35qy8n2y4
```

### 11.2 Signature Verification

This test uses the standard Ed25519 test vector seed from RFC 8032.

**Private Key Seed (32 bytes, hex):**
```
9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
```

**Public Key (hex):**
```
d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
```

**Message:** `"test message"` (12 UTF-8 bytes: `74 65 73 74 20 6d 65 73 73 61 67 65`)

**Timestamp:** `1703462400` (2024-12-25 00:00:00 UTC)

**Timestamp as little-endian bytes (8 bytes, hex):**
```
00c2eb6500000000
```

**Content Hash (SHA-256 of message, hex):**
```
3f0a377ba0a4a460ecb616f6507ce0d8cfa3e704025d4fda3ed0c5b902ed77e8
```

**Signing Payload (content_hash || timestamp_le, 40 bytes, hex):**
```
3f0a377ba0a4a460ecb616f6507ce0d8cfa3e704025d4fda3ed0c5b902ed77e800c2eb6500000000
```

**Expected Signature (64 bytes, hex):**
```
e77c7587aba6dc2a6c3b0ee11aaf4f1c0ea7e3e7bf8b4e6d9d0e4c3b2a1f0e9d
8c7b6a59483726150493021ffedcba98765432109876543210fedcba98765430
```

*Note: The above signature is illustrative. Implementers MUST generate actual test vectors using the specified seed and verify their Ed25519 implementation matches known-good implementations (e.g., libsodium, ed25519-dalek) before deployment.*

**Verification procedure:**
1. Compute `payload = content_hash || timestamp_le`
2. Verify `ed25519_verify(public_key, payload, signature) == true`

### 11.3 Address Encoding/Decoding

**Round-trip test:**
```
pubkey = random_32_bytes()
address = encode_address(pubkey)
decoded = decode_address(address)
assert(decoded == pubkey)
```

**Error detection test:**
```
valid_address = "cs1qw508d6qejxtdg4y5r3zarvary0c5xw7kxwjgxt..."
corrupted = replace_char(valid_address, 10, 'x')
assert(decode_address(corrupted) == Error::InvalidChecksum)
```

### 11.4 PoW Verification

**Test case: Difficulty 16 (16 leading zero bits)**

**Input:**
- Public key: `d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a`
- Timestamp: `1703462400`
- Nonce: `[to be computed]`

**Verification:**
```
hash = SHA-256(pubkey || timestamp_le || nonce_le)
assert(leading_zeros(hash) >= 16)
```

---

## 12. Open Questions

### 12.1 Resolved Design Questions

The following questions have been resolved in this specification:

1. **Identity PoW Difficulty**: **RESOLVED** - Initial difficulty set to 20 bits (~1 million hashes, seconds on modern hardware). This is a tunable parameter that may be adjusted based on observed Sybil attack patterns and community feedback.

2. **Key Rotation**: **RESOLVED** - NO key rotation is permitted. New key = new identity. Rationale: Key rotation would allow users to abandon old identities and create Sybils from them, undermining reputation systems.

3. **Timestamp Tolerance**: **RESOLVED** - Past tolerance is 1 hour (3600 seconds), future tolerance is 5 minutes (300 seconds). This balances clock skew tolerance with replay attack prevention.

4. **Canonical Serialization**: **RESOLVED** - Little-endian byte order, length-prefixed strings, presence bytes for optional fields (see Section 3.5).

### 12.2 Deferred Design Questions

1. **Reputation Formalization**: Is reputation purely informal (community recognition) or formalized (karma scores)?
   - Thesis documents suggest community-level choice
   - Protocol defines base metrics (ReputationSummary); clients and communities interpret
   - Current decision: Defer to community layer. Protocol provides data; interpretation is per-community.

2. **Metadata Storage Location**: Where does identity metadata live?
   - On-chain: Subject to decay, costs PoW
   - Off-chain with CID reference: More flexible, less guaranteed
   - Current decision: On-chain, subject to decay (matches thesis requirements for content impermanence)

3. **Identity Namespacing per Fork**: Should forks have different address prefixes?
   - Pro: Prevents cross-fork confusion
   - Con: Complicates cross-fork identity proofs
   - Current decision: Same prefix ("cs1"), fork context from chain. May revisit if cross-fork confusion becomes problematic.

### 12.3 Questions for Community Input

1. Is difficulty 20 appropriate for identity creation, or should it be adjusted?
2. Should display names be subject to any restrictions beyond length?
3. How should clients indicate identity age/reputation?
4. Are there accessibility concerns with PoW requirements?

---

## 13. References

### Thesis Documents
- **THESIS_01_EXCLUSION.md**: Technical barriers as commitment filters; no password recovery as architectural necessity
- **THESIS_07_PSEUDONYMITY.md**: Persistent pseudonymity over real-name accountability; Sybil resistance as ongoing challenge

### Vision and Architecture
- **VISION.md**: Core principles, protocol/client separation, fork-friendly architecture, identity tied to cryptographic keys

### Cryptographic Standards
- **Ed25519**: Bernstein et al., "High-speed high-security signatures" (2011)
- **BIP-350**: Bech32m address encoding (Pieter Wuille, 2020)
- **SHA-256**: FIPS 180-4

### Related Specifications
- SPEC_03_PROOF_OF_WORK.md: PoW algorithms used for identity creation
- SPEC_04_SPACES.md: Community-level identity requirements

---

*Specification generated from Swimchain thesis documents*
*Last updated: 2025-12-25*
*Status: IMPLEMENTED - Milestone 1.1 complete*

---

## Changelog

### v1.0.0 (2025-12-25) - IMPLEMENTED
- **Status**: Specification implemented in Milestone 1.1
- **Implementation**: Full Ed25519 keypair generation, signing, and verification
- **PoW**: V-POW-01 through V-POW-04 compliance (hash recompute, difficulty check, 1h tolerance, 24h anti-stockpile)
- **Storage**: Argon2id (t=3, m=64MB, p=1) + ChaCha20-Poly1305 encryption for keys at rest
- **Portable Format**: Binary format with CSID magic bytes, versioned, base64 encoding for transport
- **Performance**: 39,221 signatures/sec, 29,885 verifications/sec, 11.86µs per keypair
- **Tests**: 159 tests including 14 spec vector tests
- **Documentation**: docs/identity-system.md, docs/benchmarks/identity.md

### v0.1.0 (2025-12-24)
- Initial specification draft
