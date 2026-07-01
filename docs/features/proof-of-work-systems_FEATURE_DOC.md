# Proof-of-Work Systems - Feature Documentation

## Overview

Swimchain implements two distinct Proof-of-Work (PoW) systems to prevent spam and Sybil attacks:

1. **Identity PoW (SHA-256)**: A one-time computational cost required to create an identity, providing anti-Sybil protection by making bulk identity creation expensive.

2. **Action PoW (Argon2id)**: A per-action computational cost required for posting, replying, engaging, and other actions. Uses memory-hard Argon2id to resist ASIC/GPU optimization.

Both systems use leading-zero-bit difficulty targets, where a hash must have a minimum number of leading zero bits to be considered valid.

## Architecture

```
+---------------------------------------------------------------+
|                   Swimchain PoW Architecture                   |
+---------------------------------------------------------------+
|                                                               |
|  +---------------------+       +---------------------------+  |
|  |   Identity PoW      |       |        Action PoW         |  |
|  |   (SHA-256)         |       |        (Argon2id)         |  |
|  +---------------------+       +---------------------------+  |
|  | - One-time per ID   |       | - Per-action (post/reply) |  |
|  | - 20 bits default   |       | - 16-22 bits by action    |  |
|  | - ~10-30 seconds    |       | - Memory-hard (64 MiB)    |  |
|  | - Anti-Sybil        |       | - Anti-spam               |  |
|  +----------+----------+       +--------------+------------+  |
|             |                                 |                |
|             v                                 v                |
|  +---------------------+       +---------------------------+  |
|  |  src/crypto/pow.rs  |       |  src/crypto/action_pow.rs |  |
|  +---------------------+       +---------------------------+  |
|             |                                 |                |
|             +---------------+-----------------+                |
|                             v                                 |
|               +---------------------------+                   |
|               |     src/crypto/hash.rs    |                   |
|               |  - leading_zeros()        |                   |
|               |  - sha256() / pow_hash()  |                   |
|               +---------------------------+                   |
|                                                               |
|  Browser/WASM:                                                |
|  +-----------------------------------------------------------+|
|  | swimchain-wasm/src/pow.rs   | forum-client/src/lib/       ||
|  | (Identity PoW only)          | action-pow.ts (hash-wasm)  ||
|  +-----------------------------------------------------------+|
+---------------------------------------------------------------+
```

## Data Structures

### IdentityCreationProof

Proof-of-work solution for identity creation (SPEC_01 §3.4).

| Field | Type | Description |
|-------|------|-------------|
| `public_key` | `PublicKey` | 32-byte Ed25519 public key being registered |
| `timestamp` | `u64` | UNIX timestamp (seconds) when PoW was computed |
| `nonce` | `u64` | The nonce that satisfies the difficulty requirement |
| `pow_hash` | `[u8; 32]` | Resulting SHA-256 hash that meets difficulty |

**Location**: `src/types/identity.rs:263-274`

### ActionType

Discriminator for action types in Action PoW (SPEC_03 §3.1).

| Variant | Value | Description |
|---------|-------|-------------|
| `SpaceCreation` | `0x01` | Creating a new space (highest difficulty) |
| `Post` | `0x02` | Creating a new post |
| `Reply` | `0x03` | Replying to a post |
| `Engage` | `0x04` | Engaging with content (likes, etc.) |
| `IdentityUpdate` | `0x05` | Updating identity metadata |
| `Edit` | `0x06` | Editing existing content |

**Location**: `src/crypto/action_pow.rs:42-57`

### PoWChallenge

Challenge structure that must be solved for Action PoW (SPEC_03 §3.1).

| Field | Type | Description |
|-------|------|-------------|
| `action_type` | `ActionType` | Type of action being performed |
| `content_hash` | `[u8; 32]` | SHA-256 hash of the content |
| `author_id` | `[u8; 32]` | Author's public key bytes |
| `timestamp` | `u64` | Unix timestamp in seconds |
| `difficulty` | `u8` | Number of leading zero bits required |
| `nonce_space` | `[u8; 8]` | Random bytes for challenge uniqueness |

**Serialized Size**: 82 bytes

**Serialization Layout** (SPEC_03 §4.2):

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | `action_type` |
| 1-32 | 32 | `content_hash` |
| 33-64 | 32 | `author_id` |
| 65-72 | 8 | `timestamp` (big-endian u64) |
| 73 | 1 | `difficulty` |
| 74-81 | 8 | `nonce_space` |

**Location**: `src/crypto/action_pow.rs:103-118`

### PoWSolution

Complete solution to an Action PoW challenge (SPEC_03 §3.2).

| Field | Type | Description |
|-------|------|-------------|
| `challenge` | `PoWChallenge` | The challenge that was solved |
| `nonce` | `u64` | The nonce that produces a valid hash |
| `hash` | `[u8; 32]` | The Argon2id hash result |

**Location**: `src/crypto/action_pow.rs:229-238`

### ForkPoWConfig

Fork-level Argon2id configuration parameters (SPEC_03 §3.3).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `memory_kib` | `u32` | 65536 | Memory cost in KiB (64 MiB default) |
| `iterations` | `u32` | 3 | Number of iterations (time cost) |
| `parallelism` | `u8` | 4 | Degree of parallelism |

**Location**: `src/crypto/action_pow.rs:240-249`

### WasmPowSolution

Browser-compatible PoW solution returned by WASM mining.

| Field | Type | Description |
|-------|------|-------------|
| `nonce` | `u64` | The nonce that produced a valid hash |
| `attempts` | `u64` | Number of hash attempts made |
| `elapsed_ms` | `f64` | Time elapsed in milliseconds |
| `timestamp` | `u64` | Timestamp used in the PoW |
| `hash` | `[u8; 32]` | The resulting hash |

**Location**: `swimchain-wasm/src/pow.rs:25-39`

## Core APIs

### Identity PoW Mining

#### mine_identity_pow()

**Signature**: `fn mine_identity_pow(keypair: &KeyPair, difficulty: u8) -> IdentityCreationProof`

**Purpose**: Mine identity proof-of-work using SHA-256. Finds a nonce such that `SHA-256(pubkey || timestamp || nonce)` has at least `difficulty` leading zero bits.

**Parameters**:
- `keypair`: The keypair to create a proof for
- `difficulty`: Number of leading zero bits required (default: 20)

**Returns**: A valid `IdentityCreationProof` that can be used to register an identity.

**Location**: `src/crypto/pow.rs:40-55`

**Example**:
```rust
use swimchain::crypto::pow::{mine_identity_pow, DEFAULT_IDENTITY_POW_DIFFICULTY};
use swimchain::crypto::signature::generate_keypair;

let keypair = generate_keypair();
let proof = mine_identity_pow(&keypair, DEFAULT_IDENTITY_POW_DIFFICULTY);
println!("Mined with nonce: {}", proof.nonce);
```

#### mine_identity_pow_with_callback()

**Signature**: `fn mine_identity_pow_with_callback<F>(keypair: &KeyPair, difficulty: u8, callback: F) -> IdentityCreationProof where F: FnMut(u64)`

**Purpose**: Mine identity PoW with progress reporting. Calls the callback approximately every 1 million hashes.

**Parameters**:
- `keypair`: The keypair to create a proof for
- `difficulty`: Number of leading zero bits required
- `callback`: Called every ~1M hashes with the current nonce count

**Returns**: A valid `IdentityCreationProof`.

**Location**: `src/crypto/pow.rs:57-120`

**Example**:
```rust
let proof = mine_identity_pow_with_callback(&keypair, 20, |nonce| {
    println!("Tried {} million hashes...", nonce / 1_000_000);
});
```

### Identity PoW Verification

#### verify_identity_pow()

**Signature**: `fn verify_identity_pow(proof: &IdentityCreationProof, difficulty: u8, current_time: u64) -> Result<(), IdentityError>`

**Purpose**: Verify an identity proof-of-work per SPEC_01 §6.3. Uses 24-hour anti-stockpile window for new identity creation.

**Validation Steps** (per SPEC_01 §6.3):
1. V-POW-01: Recompute hash and compare to proof
2. V-POW-02: Check leading zeros meet difficulty
3. V-POW-03: Check timestamp not more than 1h in past
4. V-POW-04: Check timestamp not more than 24h old (anti-stockpile)
5. Check timestamp not more than 5min in future

**Parameters**:
- `proof`: The proof to verify
- `difficulty`: Required number of leading zero bits
- `current_time`: Current UNIX timestamp for time checks

**Returns**: `Ok(())` if valid, `Err(IdentityError)` with specific failure reason.

**Location**: `src/crypto/pow.rs:166-233`

#### verify_identity_pow_strict()

**Signature**: `fn verify_identity_pow_strict(proof: &IdentityCreationProof, difficulty: u8, current_time: u64) -> Result<(), IdentityError>`

**Purpose**: Verify identity PoW with strict 1-hour tolerance. Used for post-creation verification of existing identities.

**Location**: `src/crypto/pow.rs:248-293`

### Action PoW Mining

#### compute_pow()

**Signature**: `fn compute_pow(challenge: &PoWChallenge, config: &ForkPoWConfig) -> Result<PoWSolution, ActionPowError>`

**Purpose**: Compute an Action PoW solution. Iterates through nonces until finding one that produces an Argon2id hash with sufficient leading zeros.

**Parameters**:
- `challenge`: The challenge to solve
- `config`: Argon2id configuration (memory, iterations, parallelism)

**Returns**: `PoWSolution` containing the winning nonce and hash.

**Location**: `src/crypto/action_pow.rs:369-416`

**Example**:
```rust
use swimchain::crypto::action_pow::{
    ActionType, PoWChallenge, ForkPoWConfig, compute_pow,
};

let config = ForkPoWConfig::production();
let challenge = PoWChallenge::generate(
    ActionType::Post,
    b"Hello, world!",
    &author_pubkey,
    config.get_difficulty(ActionType::Post),
);

let solution = compute_pow(&challenge, &config)?;
println!("Found nonce: {}", solution.nonce);
```

#### compute_pow_with_callback()

**Signature**: `fn compute_pow_with_callback<F>(challenge: &PoWChallenge, config: &ForkPoWConfig, callback: F) -> Result<PoWSolution, ActionPowError> where F: FnMut(u64)`

**Purpose**: Compute Action PoW with progress reporting. Calls callback every 100 attempts (Argon2id is slow).

**Location**: `src/crypto/action_pow.rs:418-465`

#### compute_pow_cancellable()

**Signature**: `fn compute_pow_cancellable<F, C>(challenge: &PoWChallenge, config: &ForkPoWConfig, callback: F, is_cancelled: C) -> Result<PoWSolution, ActionPowError> where F: FnMut(u64), C: Fn() -> bool`

**Purpose**: Compute Action PoW with cancellation support. Checks cancellation every iteration for responsiveness.

**Parameters**:
- `challenge`: The challenge to solve
- `config`: Argon2id configuration
- `callback`: Progress callback (every 10 attempts)
- `is_cancelled`: Function that returns true to cancel mining

**Returns**: `Err(ActionPowError::Cancelled)` if cancelled.

**Location**: `src/crypto/action_pow.rs:467-522`

### Action PoW Verification

#### verify_pow()

**Signature**: `fn verify_pow(solution: &PoWSolution, config: &ForkPoWConfig, current_time: u64) -> Result<(), ActionPowError>`

**Purpose**: Verify an Action PoW solution per SPEC_03 §4.5.

**Validation Steps**:
1. Check challenge timestamp within 10-minute validity window
2. Recompute Argon2id hash with same parameters
3. Verify hash matches provided hash
4. Verify hash meets difficulty requirement

**Note**: Verification takes ~50-200ms due to Argon2id computation.

**Location**: `src/crypto/action_pow.rs:524-585`

#### verify_content_binding()

**Signature**: `fn verify_content_binding(solution: &PoWSolution, content: &[u8], author_pubkey: &[u8; 32]) -> Result<(), ActionPowError>`

**Purpose**: Verify that a PoW solution is bound to specific content and author per SPEC_03 §6.3. Prevents reuse of PoW for different content.

**Location**: `src/crypto/action_pow.rs:587-613`

### Hash Utilities

#### leading_zeros()

**Signature**: `fn leading_zeros(hash: &[u8; 32]) -> u32`

**Purpose**: Count leading zero bits in a 32-byte hash.

**Location**: `src/crypto/hash.rs:84-99`

#### pow_hash()

**Signature**: `fn pow_hash(data: &[u8]) -> [u8; 32]`

**Purpose**: Compute SHA-256 hash for PoW verification.

**Location**: `src/crypto/hash.rs:33-39`

### WASM Functions

#### mine_identity_pow (WASM)

**Signature**: `fn mine_identity_pow(public_key: &[u8], difficulty: u8) -> Result<WasmPowSolution, JsValue>`

**Purpose**: Mine identity PoW in the browser.

**Note**: Only identity PoW (SHA-256) is available in WASM. Action PoW (Argon2id) requires 64 MiB memory which is impractical in browser WASM environments. Browser clients use the `hash-wasm` library for Argon2id instead.

**Location**: `swimchain-wasm/src/pow.rs:107-110`

**JavaScript Example**:
```javascript
import { mine_identity_pow } from 'swimchain-wasm';

const keypair = new WasmKeypair();
const solution = mine_identity_pow(keypair.publicKey(), 20);
console.log(`Mined in ${solution.elapsedMs}ms`);
console.log(`Hash rate: ${solution.hashRate()} H/s`);
```

#### mineIdentityPowWithLimit (WASM)

**Signature**: `fn mine_identity_pow_with_limit(public_key: &[u8], difficulty: u8, max_attempts: u64) -> Result<WasmPowSolution, JsValue>`

**Purpose**: Mine identity PoW with maximum attempt limit. Useful for showing progress or implementing timeout.

**Location**: `swimchain-wasm/src/pow.rs:126-133`

#### estimateMiningTime (WASM)

**Signature**: `fn estimate_mining_time(difficulty: u8, hash_rate: Option<f64>) -> f64`

**Purpose**: Estimate time to mine at a given difficulty based on expected attempts (2^difficulty).

**Parameters**:
- `difficulty`: Number of leading zero bits required
- `hash_rate`: Estimated hashes per second (default: 500,000)

**Returns**: Estimated time in seconds.

**Location**: `swimchain-wasm/src/pow.rs:269-274`

## Behaviors

### Identity PoW Mining Flow

1. **Input Preparation**: Concatenate `pubkey(32) || timestamp_le(8) || nonce_le(8)` = 48 bytes
2. **Hash Computation**: Compute SHA-256 of the 48-byte input
3. **Difficulty Check**: Count leading zero bits; if >= difficulty, solution found
4. **Nonce Increment**: If not enough zeros, increment nonce and repeat
5. **Progress Reporting**: Optional callback every 1M hashes

**Expected Time** (difficulty 20, desktop hardware):
- Average: ~10-30 seconds
- Expected attempts: 2^20 ~ 1,048,576

### Identity PoW Verification Flow

1. **Hash Recomputation**: Rebuild input from proof fields and compute SHA-256
2. **Hash Match**: Verify computed hash equals `proof.pow_hash`
3. **Difficulty Check**: Verify leading zeros >= required difficulty
4. **Timestamp Checks**:
   - Not more than 5 minutes in future (clock drift tolerance)
   - Not more than 24 hours old (anti-stockpile)
   - For strict mode: not more than 1 hour old

### Action PoW Mining Flow

1. **Challenge Creation**: Generate challenge with content hash, author ID, timestamp, difficulty, and random nonce_space
2. **Input Serialization**: Serialize challenge to 82 bytes + 8-byte nonce = 90 bytes
3. **Argon2id Computation**: Compute memory-hard hash with configured parameters
4. **Difficulty Check**: Count leading zero bits in result
5. **Solution Return**: Return challenge, winning nonce, and hash

**Memory Usage**: 64 MiB (production), 8 MiB (testnet), 1 MiB (test)

### Content Binding Verification

Ensures PoW is bound to specific content (SPEC_03 §6.3):

1. Compute `SHA-256(content)` and compare to `challenge.content_hash`
2. Compare `challenge.author_id` to provided author public key
3. Reject if either mismatches (prevents PoW reuse)

## Configuration

### Identity PoW Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_IDENTITY_POW_DIFFICULTY` | 20 | Default difficulty (~10-30 seconds) |
| `POW_MAX_AGE_SECS` | 86400 | 24-hour anti-stockpile window |
| `POW_PAST_TOLERANCE_SECS` | 3600 | 1-hour strict verification tolerance |
| `POW_FUTURE_TOLERANCE_SECS` | 300 | 5-minute clock drift tolerance |

**Location**: `src/crypto/pow.rs:13-35`

### Action PoW Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `CHALLENGE_VALIDITY_SECS` | 600 | 10-minute challenge window |
| `CHALLENGE_FUTURE_TOLERANCE_SECS` | 60 | 1-minute clock drift tolerance |
| `MIN_MEMORY_KIB` | 32768 | 32 MiB ASIC resistance minimum |
| `CHALLENGE_SERIALIZED_SIZE` | 82 | Serialized challenge size in bytes |

**Location**: `src/crypto/action_pow.rs:75-86`

### Difficulty by Action Type

| Action Type | Mainnet | Testnet | Expected Time |
|-------------|---------|---------|---------------|
| SpaceCreation | 22 | 12 | ~60 seconds |
| Post | 20 | 10 | ~30 seconds |
| Reply | 18 | 8 | ~15 seconds |
| Engage | 16 | 6 | ~5-60 seconds (pooled) |
| IdentityUpdate | 20 | 10 | ~30 seconds |
| Edit | 18 | 8 | ~15 seconds |

**Location**: `src/crypto/action_pow.rs:87-101`

### ForkPoWConfig Presets

| Preset | Memory | Iterations | Parallelism | Use Case |
|--------|--------|------------|-------------|----------|
| `production()` | 64 MiB | 3 | 4 | Mainnet deployment |
| `mobile()` | 64 MiB | 3 | 2 | Mobile devices (heat management) |
| `testnet()` | 8 MiB | 1 | 2 | Public testnet |
| `test()` | 1 MiB | 1 | 1 | Unit tests |

**Location**: `src/crypto/action_pow.rs:257-303`

### TypeScript/Browser Constants

```typescript
// forum-client/src/lib/action-pow.ts

// Production config (mainnet)
const PRODUCTION_CONFIG = { memoryKib: 65536, iterations: 3, parallelism: 4 };

// Testnet config (browser-friendly)
const TESTNET_CONFIG = { memoryKib: 8192, iterations: 1, parallelism: 2 };

// Testnet difficulty (reduced ~10 bits)
const TESTNET_DIFFICULTY = {
  SpaceCreation: 12, Post: 10, Reply: 8,
  Engage: 6, IdentityUpdate: 10, Edit: 8
};
```

## RPC Methods

Action PoW parameters are passed to RPC methods via these fields:

### Common PoW Parameters

```json
{
  "pow_nonce": 12345,
  "pow_difficulty": 20,
  "pow_nonce_space": "deadbeefcafebabe",
  "pow_hash": "00000abc...",
  "timestamp": 1703891072
}
```

### Example: Submit Post with PoW

**Request**:
```json
{
  "jsonrpc": "2.0",
  "method": "submit_post",
  "params": {
    "space_id": "sha256:abc123...",
    "body": "Hello, Swimchain!",
    "pow_nonce": 42,
    "pow_difficulty": 20,
    "pow_nonce_space": "deadbeefcafebabe",
    "pow_hash": "00000...",
    "timestamp": 1703891072,
    "signature": "..."
  },
  "id": 1
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content_id": "sha256:def456...",
    "status": "accepted"
  },
  "id": 1
}
```

## CLI Commands

### cs mine-identity

```bash
cs mine-identity --difficulty 20
```

Mines an identity PoW for a new keypair. Shows progress and elapsed time.

### cs verify-pow

```bash
cs verify-pow --pubkey <hex> --timestamp <unix> --nonce <nonce> --difficulty <bits>
```

Verifies an identity PoW manually.

## React Hooks

The forum client provides React hooks for Action PoW mining:

### useActionPow

Base hook for mining any action type.

```typescript
import { useActionPow, ActionType } from '../hooks/useActionPow';

function PostForm() {
  const { state, progress, mine, cancel } = useActionPow();

  const handleSubmit = async (body: string) => {
    const solution = await mine(
      ActionType.Post,
      new TextEncoder().encode(body),
      authorPubkey,
      true // isTestnet
    );
    // Use solution.getRpcParams() for RPC call
  };

  return (
    <div>
      {state === 'mining' && (
        <p>Mining... {progress.attempts} attempts, {progress.hashRate.toFixed(1)} H/s</p>
      )}
      <button onClick={cancel}>Cancel</button>
    </div>
  );
}
```

### Specialized Hooks

| Hook | Purpose |
|------|---------|
| `usePostPow()` | Mining for new posts |
| `useReplyPow()` | Mining for replies |
| `useEditPow()` | Mining for edits |
| `useEngagementPow()` | Mining for engagements |
| `useSpaceCreationPow()` | Mining for space creation |

**Location**: `forum-client/src/hooks/useActionPow.ts:161-261`

## Error Handling

### Identity PoW Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `PowDifficultyNotMet` | Hash doesn't have enough leading zeros | Re-mine with correct difficulty |
| `PowTimestampStockpile` | PoW is older than 24 hours | Mine fresh PoW |
| `PowTimestampExpired` | PoW is older than 1 hour (strict mode) | Mine fresh PoW |
| `PowTimestampFuture` | PoW timestamp is >5 min in future | Check system clock |

### Action PoW Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `DifficultyNotMet` | Hash doesn't have enough leading zeros | Re-mine with correct difficulty |
| `ChallengeExpired` | Challenge is older than 10 minutes | Create new challenge and re-mine |
| `ChallengeFuture` | Challenge timestamp >1 min in future | Check system clock |
| `HashMismatch` | Computed hash doesn't match proof | Ensure solution wasn't tampered |
| `ContentMismatch` | PoW was mined for different content | Mine new PoW for this content |
| `MemoryTooLow` | Config memory < 32 MiB | Use production or mobile config |
| `Cancelled` | User cancelled mining | Allow user to restart |

## Testing

### Run PoW Tests

```bash
# Run all crypto tests
cargo test --package swimchain --lib crypto::

# Run specifically PoW tests
cargo test --package swimchain --lib crypto::pow::tests
cargo test --package swimchain --lib crypto::action_pow::tests

# Run with output
cargo test pow -- --nocapture
```

### Test Low Difficulty

For testing, use difficulty 4-8 for fast completion:

```rust
let config = ForkPoWConfig::test();
let challenge = PoWChallenge {
    action_type: ActionType::Post,
    content_hash: sha256(b"test"),
    author_id: [0; 32],
    timestamp: current_timestamp(),
    difficulty: 4, // Very low for testing
    nonce_space: [0; 8],
};
let solution = compute_pow(&challenge, &config)?;
```

### WASM Testing

```bash
# Build WASM package
cd swimchain-wasm
wasm-pack build --target web

# Run WASM tests
wasm-pack test --headless --chrome
```

## Known Limitations

1. **No Swimmer Level Difficulty Scaling**: The MASTER_FEATURES document mentions difficulty scaling based on swimmer level (Guppy -> Anchor). This is **not currently implemented**. The `get_adjusted_difficulty()` function at `src/crypto/action_pow.rs:619-631` returns static values regardless of swimmer level.

2. **WASM Action PoW Memory**: Native WASM Argon2id with 64 MiB memory is impractical in browsers. Browser clients use `hash-wasm` library which provides JavaScript Argon2id with similar parameters.

3. **Verification Time**: Action PoW verification takes ~50-200ms due to Argon2id recomputation. This is not instant like SHA-256 verification.

4. **Challenge Validity Window**: If network latency pushes a challenge beyond the 10-minute window during submission, it will be rejected. Clients should mine close to submission time.

5. **No GPU Acceleration**: While Argon2id is memory-hard, the current implementation doesn't leverage GPU parallelism. Mining is CPU-bound.

6. **Edit ActionType Undocumented**: The `ActionType::Edit` (0x06) exists in code but is not mentioned in the MASTER_FEATURES difficulty table.

## Future Work

1. **Swimmer Level Integration**: Implement the documented difficulty scaling based on swimmer level progression (see MASTER_FEATURES Section 11).

2. **Adaptive Difficulty**: Add network-wide difficulty adjustment based on block formation rate (SPEC_03 SC-5 notes this should not be needed).

3. **Mobile Optimization**: Further optimize mobile PoW with better heat management and battery consideration.

4. **Hardware Acceleration**: Investigate WebGPU for browser-based Argon2id acceleration.

5. **PoW Delegation**: Allow trusted relays to perform PoW on behalf of lightweight clients.

## Related Features

- [Identity & Cryptography](./identity_FEATURE_DOC.md) - Keypair generation and identity creation
- [Block Formation](./block-formation-consensus_FEATURE_DOC.md) - How PoW-validated actions become blocks
- [Engagement & Social](./engagement_FEATURE_DOC.md) - Swimmer levels (planned PoW difficulty integration)
- [RPC API](./rpc-api_FEATURE_DOC.md) - RPC methods that accept PoW parameters
- [WASM Bindings](./wasm-bindings_FEATURE_DOC.md) - Browser-compatible PoW mining

## References

- SPEC_01: Identity specification (§3.4 Identity PoW, §6.3 Verification)
- SPEC_03: Action PoW specification (§3.1-§3.3 Structures, §4.2 Serialization, §6.1 Validity)

---

*Generated: 2026-01-11*
*Source: src/crypto/pow.rs, src/crypto/action_pow.rs, swimchain-wasm/src/pow.rs, forum-client/src/lib/action-pow.ts, forum-client/src/hooks/useActionPow.ts*
