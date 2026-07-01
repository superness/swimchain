# WASM Bindings Feature Documentation

## Overview

The WASM Bindings module (`swimchain-wasm/`) provides WebAssembly bindings for browser-compatible cryptographic operations. It enables client-side identity management, content addressing, proof-of-work mining, and decay calculations without requiring server communication for these core operations.

**Key Capabilities:**
- Ed25519 keypair generation and signing
- Bech32m address encoding/decoding
- SHA-256 hashing and content ID generation
- Identity proof-of-work mining and verification
- Content decay state calculations

**Limitations:**
- No Argon2id support (64 MiB memory requirement impractical in WASM)
- No private key encryption (delegated to JavaScript Web Crypto API)
- Mining operations block the main thread (use Web Worker for non-blocking)

---

## Architecture

The WASM Bindings module provides a browser-compatible subset of Swimchain's core cryptographic functionality:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Browser Environment                              │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────────────┐ │
│  │  React App     │    │  Vanilla JS    │    │  Web Worker            │ │
│  │  (forum-client)│    │  (swimchain-js)│    │  (non-blocking mining) │ │
│  └───────┬────────┘    └───────┬────────┘    └───────────┬────────────┘ │
│          │                     │                         │              │
│          └─────────────────────┴─────────────────────────┘              │
│                                │                                         │
│                    ┌───────────▼───────────┐                            │
│                    │   WASM Loader         │                            │
│                    │   (async init)        │                            │
│                    └───────────┬───────────┘                            │
│                                │                                         │
│  ┌─────────────────────────────▼─────────────────────────────────────┐  │
│  │                    swimchain-wasm (151.5 KB)                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │  │
│  │  │ identity.rs │ │  crypto.rs  │ │   pow.rs    │ │  decay.rs   │  │  │
│  │  │ - Keypair   │ │ - SHA-256   │ │ - Mining    │ │ - Half-life │  │  │
│  │  │ - Address   │ │ - ContentID │ │ - Verify    │ │ - Threshold │  │  │
│  │  │ - Signing   │ │ - LeadZero  │ │ - Estimate  │ │ - Protected │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  NOT in WASM (too resource-intensive):                                   │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  • Argon2id (64 MiB memory)  • Private key encryption            │   │
│  │  • RPC client                • Content storage                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Module Responsibilities:**

| Module | Responsibility | Spec Reference |
|--------|----------------|----------------|
| `identity.rs` | Ed25519 keypairs, Bech32m addresses, signature verification | SPEC_01 §3.3 |
| `crypto.rs` | SHA-256 hashing, content addressing, PoW difficulty checks | SPEC_01 §3.4 |
| `pow.rs` | Identity PoW mining/verification, time estimation | SPEC_01 §6.3 |
| `decay.rs` | Content decay calculations, half-life model | SPEC_02 §4.1 |

---

## Data Structures

### WasmKeypair

```rust
pub struct WasmKeypair {
    secret: SigningKey,    // Ed25519 signing key (not exposed to JS)
    verifying: VerifyingKey, // Ed25519 public key
}
```

**Purpose**: Ed25519 keypair for identity operations including key generation, signing, and address derivation.

**TypeScript Interface:**
```typescript
interface WasmKeypair {
  publicKey(): Uint8Array;  // 32-byte Ed25519 public key
  seed(): Uint8Array;       // 32-byte seed (private key)
  sign(message: Uint8Array): Uint8Array; // 64-byte signature
  address(): string;        // Bech32m address (cs1...)
  free(): void;            // Manual memory cleanup
}
```

**Used by**: Identity management, message signing, address generation

---

### WasmPowSolution

```rust
pub struct WasmPowSolution {
    nonce: u64,           // The nonce that produced valid hash
    attempts: u64,        // Number of hash attempts made
    elapsed_ms: f64,      // Time elapsed in milliseconds
    timestamp: u64,       // Timestamp used (UNIX seconds)
    hash: [u8; 32],       // The resulting hash
}
```

**Purpose**: Contains the result of successful identity proof-of-work mining.

**TypeScript Interface:**
```typescript
interface WasmPowSolution {
  readonly nonce: bigint;
  readonly attempts: bigint;
  readonly timestamp: bigint;
  elapsedMs: number;
  hash(): Uint8Array;
  leadingZeros(): number;
  hashRate(): number;
  free(): void;
}
```

**Used by**: Identity registration, PoW verification

---

### WasmDecayState

```rust
pub struct WasmDecayState {
    current_heat: f64,           // Survival probability (0.0 to 1.0)
    is_decayed: bool,            // Below threshold?
    is_protected: bool,          // Within floor period?
    half_lives_elapsed: f64,     // Number of half-lives elapsed
    age_seconds: u64,            // Content age
    time_since_engagement: u64,  // Time since last engagement
}
```

**Purpose**: Contains all information about the current decay state of content.

**TypeScript Interface:**
```typescript
interface WasmDecayState {
  readonly currentHeat: number;
  readonly isDecayed: boolean;
  readonly isProtected: boolean;
  readonly halfLivesElapsed: number;
  readonly ageSeconds: bigint;
  readonly timeSinceEngagement: bigint;
  decayPercent(): number;
  description(): string;
  timeUntilDecay(): bigint;
  free(): void;
}
```

**Used by**: Content lifecycle management, UI decay indicators

---

### WasmError

```rust
pub enum WasmError {
    InvalidAddress { reason: String },
    InvalidPublicKey { reason: String },
    InvalidSignature { reason: String },
    PowFailed { difficulty: u8, attempts: u64 },
    InvalidDifficulty { min: u8, max: u8, provided: u8 },
    DecayCalculationError { reason: String },
    InvalidInput { reason: String },
}
```

**Purpose**: Error types that convert cleanly to JavaScript exceptions.

**Used by**: All WASM functions that can fail

---

## Public APIs

### Module Initialization

#### init()
```rust
#[wasm_bindgen(start)]
pub fn init()
```
**Purpose**: Initialize the WASM module with panic hook for better error messages.
**Called from**: Automatically on module load via `#[wasm_bindgen(start)]`
**Side effects**: Sets up `console_error_panic_hook` for browser console debugging

#### version()
```rust
#[wasm_bindgen]
pub fn version() -> String
```
**Purpose**: Returns the library version from Cargo.toml
**Returns**: Version string (e.g., "0.1.0")

---

### Cryptographic Functions

#### sha256()
```rust
#[wasm_bindgen]
pub fn sha256(data: &[u8]) -> Vec<u8>
```
**Purpose**: Compute SHA-256 hash of data
**Returns**: 32-byte hash as Uint8Array
**Example (JS):**
```javascript
const hash = sha256(new Uint8Array([1, 2, 3]));
console.log(hash.length); // 32
```

#### double_sha256()
```rust
#[wasm_bindgen]
pub fn double_sha256(data: &[u8]) -> Vec<u8>
```
**Purpose**: Compute SHA-256(SHA-256(data)) for Bitcoin-style protocols
**Returns**: 32-byte hash

#### leading_zeros()
```rust
#[wasm_bindgen]
pub fn leading_zeros(hash: &[u8]) -> u32
```
**Purpose**: Count leading zero bits in a hash for PoW verification
**Returns**: Number of leading zero bits (0-256 for 32-byte hash)
**Example (JS):**
```javascript
const hash = new Uint8Array(32);
hash[0] = 0x0F; // 4 leading zeros
console.log(leading_zeros(hash)); // 4
```

#### verify_pow_difficulty()
```rust
#[wasm_bindgen]
pub fn verify_pow_difficulty(hash: &[u8], difficulty: u8) -> bool
```
**Purpose**: Verify that a hash meets the required PoW difficulty
**Returns**: true if hash has at least `difficulty` leading zero bits

#### content_id()
```rust
#[wasm_bindgen]
pub fn content_id(data: &[u8]) -> String
```
**Purpose**: Generate content-addressed ID from data
**Returns**: String in format `"sha256:<64_hex_chars>"`
**Example (JS):**
```javascript
const data = new TextEncoder().encode("Hello, World!");
const id = content_id(data);
console.log(id.startsWith("sha256:")); // true
```

---

### Identity Functions

#### WasmKeypair::new()
```rust
#[wasm_bindgen(constructor)]
pub fn new() -> Result<WasmKeypair, JsValue>
```
**Purpose**: Generate a new random Ed25519 keypair using browser CSPRNG
**Example (JS):**
```javascript
const keypair = new WasmKeypair();
console.log(keypair.address()); // cs1...
```

#### WasmKeypair::fromSeed()
```rust
#[wasm_bindgen(js_name = "fromSeed")]
pub fn from_seed(seed: &[u8]) -> Result<WasmKeypair, JsValue>
```
**Purpose**: Create a deterministic keypair from a 32-byte seed
**Errors**: If seed is not exactly 32 bytes
**Example (JS):**
```javascript
const seed = new Uint8Array(32); // Fill with secure random bytes
const keypair = WasmKeypair.fromSeed(seed);
```

#### WasmKeypair::publicKey()
```rust
#[wasm_bindgen(js_name = "publicKey")]
pub fn public_key(&self) -> Vec<u8>
```
**Purpose**: Get the 32-byte Ed25519 public key
**Returns**: Uint8Array of 32 bytes

#### WasmKeypair::seed()
```rust
pub fn seed(&self) -> Vec<u8>
```
**Purpose**: Get the 32-byte seed (private key) for storage
**Returns**: Uint8Array of 32 bytes
**Warning**: This IS the private key - store encrypted!

#### WasmKeypair::sign()
```rust
pub fn sign(&self, message: &[u8]) -> Vec<u8>
```
**Purpose**: Sign a message with this keypair
**Returns**: 64-byte Ed25519 signature

#### WasmKeypair::address()
```rust
pub fn address(&self) -> String
```
**Purpose**: Get the Bech32m address for this keypair
**Returns**: Address string starting with "cs1"

#### encode_address()
```rust
#[wasm_bindgen]
pub fn encode_address(public_key: &[u8]) -> Result<String, JsValue>
```
**Purpose**: Encode a 32-byte public key as a Bech32m address
**Returns**: Address string starting with "cs1"
**Errors**: If public key is not 32 bytes

#### decode_address()
```rust
#[wasm_bindgen]
pub fn decode_address(address: &str) -> Result<Vec<u8>, JsValue>
```
**Purpose**: Decode a Bech32m address to extract the public key
**Returns**: 32-byte public key
**Errors**: Invalid address, wrong prefix, unsupported version, wrong length

#### verify_signature()
```rust
#[wasm_bindgen]
pub fn verify_signature(pubkey: &[u8], message: &[u8], signature: &[u8]) -> bool
```
**Purpose**: Verify an Ed25519 signature
**Returns**: true if signature is valid
**Note**: Returns false (not error) for malformed inputs

#### is_valid_address()
```rust
#[wasm_bindgen]
pub fn is_valid_address(address: &str) -> bool
```
**Purpose**: Check if a string is a valid Swimchain address
**Returns**: true if address is valid and decodable

---

### Proof-of-Work Functions

#### mine_identity_pow()
```rust
#[wasm_bindgen]
pub fn mine_identity_pow(public_key: &[u8], difficulty: u8) -> Result<WasmPowSolution, JsValue>
```
**Purpose**: Find a nonce where SHA-256(pubkey || timestamp || nonce) has required leading zeros
**Algorithm**: SHA-256 based (not Argon2id)
**Errors**: Invalid pubkey length, difficulty out of range (1-64)
**Warning**: Blocks main thread! Use Web Worker for production.
**Example (JS):**
```javascript
const keypair = new WasmKeypair();
const solution = mine_identity_pow(keypair.publicKey(), 8);
console.log(solution.elapsedMs);
```

#### mineIdentityPowWithLimit()
```rust
#[wasm_bindgen(js_name = "mineIdentityPowWithLimit")]
pub fn mine_identity_pow_with_limit(
    public_key: &[u8],
    difficulty: u8,
    max_attempts: u64
) -> Result<WasmPowSolution, JsValue>
```
**Purpose**: Mine with a maximum attempts limit for batched mining
**Used for**: Non-blocking mining via batching with setTimeout
**Errors**: Throws when max_attempts exceeded without finding solution

#### verify_identity_pow()
```rust
#[wasm_bindgen]
pub fn verify_identity_pow(pubkey: &[u8], timestamp: u64, nonce: u64, difficulty: u8) -> bool
```
**Purpose**: Verify that a PoW proof is valid
**Returns**: true if SHA-256(pubkey || timestamp || nonce) has required leading zeros

#### verifyIdentityPowWithHash()
```rust
#[wasm_bindgen(js_name = "verifyIdentityPowWithHash")]
pub fn verify_identity_pow_with_hash(
    pubkey: &[u8],
    timestamp: u64,
    nonce: u64,
    difficulty: u8
) -> Option<Vec<u8>>
```
**Purpose**: Verify PoW and return the computed hash
**Returns**: Hash if valid, null if invalid

#### getDefaultIdentityPowDifficulty()
```rust
#[wasm_bindgen(js_name = "getDefaultIdentityPowDifficulty")]
pub fn get_default_identity_pow_difficulty() -> u8
```
**Purpose**: Get the default identity PoW difficulty
**Returns**: 20 (per SPEC_01 section 12.1)

#### estimateMiningTime()
```rust
#[wasm_bindgen(js_name = "estimateMiningTime")]
pub fn estimate_mining_time(difficulty: u8, hash_rate: Option<f64>) -> f64
```
**Purpose**: Estimate time to mine at given difficulty
**Formula**: 2^difficulty / hash_rate
**Default hash_rate**: 500,000 hashes/second
**Returns**: Estimated time in seconds

---

### Decay Functions

#### calculate_decay()
```rust
#[wasm_bindgen]
pub fn calculate_decay(
    created_at_secs: u64,
    last_engagement_secs: u64,
    now_secs: u64
) -> WasmDecayState
```
**Purpose**: Calculate content decay state using default parameters
**Implements**: SPEC_02 section 4.1 half-life decay model
**Example (JS):**
```javascript
const nowSecs = Math.floor(Date.now() / 1000);
const createdSecs = nowSecs - 86400; // 1 day ago
const state = calculate_decay(createdSecs, createdSecs, nowSecs);
console.log(state.isProtected); // true (within 48h floor)
```

#### calculateDecayWithHalfLife()
```rust
#[wasm_bindgen(js_name = "calculateDecayWithHalfLife")]
pub fn calculate_decay_with_half_life(
    created_at_secs: u64,
    last_engagement_secs: u64,
    now_secs: u64,
    half_life_secs: Option<u64>
) -> WasmDecayState
```
**Purpose**: Calculate decay with custom half-life parameter

#### getDecayFloorSecs()
```rust
#[wasm_bindgen(js_name = "getDecayFloorSecs")]
pub fn get_decay_floor_secs() -> u64
```
**Purpose**: Get the decay floor period
**Returns**: 172,800 seconds (48 hours)

#### getHalfLifeSecs()
```rust
#[wasm_bindgen(js_name = "getHalfLifeSecs")]
pub fn get_half_life_secs() -> u64
```
**Purpose**: Get the default decay half-life
**Returns**: 604,800 seconds (7 days)

#### getDecayThreshold()
```rust
#[wasm_bindgen(js_name = "getDecayThreshold")]
pub fn get_decay_threshold() -> f64
```
**Purpose**: Get the decay expiration threshold
**Returns**: 0.0625 (6.25%)

---

## Behaviors

### Identity Generation

- **Trigger**: `new WasmKeypair()` or `WasmKeypair.fromSeed()`
- **Process**:
  1. Generate/use 32-byte seed
  2. Derive Ed25519 signing key from seed
  3. Derive verifying (public) key from signing key
- **Outcome**: Deterministic keypair from seed, random keypair from constructor

### Address Encoding

- **Trigger**: `encode_address()` or `keypair.address()`
- **Process**:
  1. Validate public key is 32 bytes
  2. Prepend version byte (0)
  3. Encode with Bech32m using "cs" HRP
- **Outcome**: Address string like `cs1qpzry9x8gf2tvdw0s3jn54khce6mua7l`

### Identity PoW Mining

- **Trigger**: `mine_identity_pow()` or `mineIdentityPowWithLimit()`
- **Process**:
  1. Validate inputs (pubkey 32 bytes, difficulty 1-64)
  2. Get current timestamp
  3. Build data: `pubkey(32) || timestamp_le(8) || nonce_le(8)`
  4. Loop: hash data, check leading zeros, increment nonce
  5. Return on success or max_attempts reached
- **Outcome**: `WasmPowSolution` with nonce, timestamp, hash, and stats

### Decay Calculation

- **Trigger**: `calculate_decay()` or `calculateDecayWithHalfLife()`
- **Process**:
  1. Calculate content age
  2. If age < 48 hours: return protected state (heat=1.0)
  3. Calculate effective decay time: `time_since_engagement - floor`
  4. Calculate half-lives: `effective_decay_time / half_life`
  5. Calculate survival: `0.5^half_lives`
  6. Check if below threshold (6.25%)
- **Outcome**: `WasmDecayState` with heat, decay status, and projections

---

## Configuration Options

### Build Configuration (Cargo.toml profile.release)

| Option | Value | Description |
|--------|-------|-------------|
| opt-level | "z" | Optimize for smallest binary size |
| lto | true | Link-time optimization enabled |
| panic | "abort" | Abort on panic (no unwinding) |
| codegen-units | 1 | Single codegen unit for better optimization |

### crate-type

| Type | Purpose |
|------|---------|
| cdylib | WASM compilation target |
| rlib | Native Rust library for tests |

---

## Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ADDRESS_HRP` | `"cs"` | Bech32m human-readable prefix |
| `ADDRESS_VERSION` | `0` | Address format version byte |
| `MIN_DIFFICULTY` | `1` | Minimum PoW difficulty |
| `MAX_DIFFICULTY` | `64` | Maximum PoW difficulty |
| `DEFAULT_IDENTITY_POW_DIFFICULTY` | `20` | Default identity creation difficulty |
| `DECAY_FLOOR_SECS` | `172,800` | 48-hour protection period |
| `HALF_LIFE_SECS` | `604,800` | 7-day decay half-life |
| `DECAY_THRESHOLD` | `0.0625` | 6.25% expiration threshold |

---

## Integration Points

### JavaScript/TypeScript Integration

**WASM Loader Pattern:**
```typescript
// swimchain-js/src/wasm-loader.ts
let wasmModule: WasmModule | null = null;

export async function initWasm(): Promise<WasmModule> {
  if (wasmModule) return wasmModule;
  const wasm = await import("../pkg/swimchain_wasm.js");
  await wasm.default();
  wasmModule = wasm as WasmModule;
  return wasmModule;
}

export function getWasm(): WasmModule {
  if (!wasmModule) throw new Error("WASM not initialized");
  return wasmModule;
}
```

### React Integration

**usePow Hook Pattern (forum-client):**
```typescript
export function usePow(): UsePowResult {
  // Uses batched mining with setTimeout for non-blocking UI
  const BATCH_SIZE = 10000n;

  const mineNextBatch = () => {
    try {
      const result = mineIdentityPowWithLimit(publicKey, difficulty, BATCH_SIZE);
      // Found solution!
      setState('complete');
    } catch (err) {
      // Batch limit reached - continue
      setTimeout(mineNextBatch, 0);
    }
  };
}
```

### Web Worker Integration

**Non-blocking mining via Web Worker:**
```typescript
// pow.worker.ts
self.onmessage = async (event) => {
  if (event.data.type === 'mine') {
    const result = wasm.mine_identity_pow(publicKey, difficulty);
    self.postMessage({ type: 'complete', solution: toPowSolution(result) });
  }
};
```

### Client Usage

| Client | Integration Method |
|--------|-------------------|
| `forum-client` | Local WASM copy in `src/wasm/`, batched mining hook |
| `swimchain-js` | `@swimchain/core` npm package, WASM loader |
| `swimchain-react` | React provider with WASM context |
| `feed-client`, `chat-client` | SwimchainProvider for WASM initialization |

---

## Dependencies

### External Crates

| Crate | Version | Purpose |
|-------|---------|---------|
| `wasm-bindgen` | 0.2 | JS/WASM interop bindings |
| `js-sys` | 0.3 | JS types (Date, BigInt) |
| `getrandom` | 0.2 (js feature) | Browser CSPRNG access |
| `rand_core` | 0.6 (getrandom feature) | RNG traits |
| `ed25519-dalek` | 2.1 (minimal) | Ed25519 signatures |
| `sha2` | 0.10 (minimal) | SHA-256 hashing |
| `bech32` | 0.11 | Address encoding |
| `serde` | 1.0 | Serialization |
| `serde-wasm-bindgen` | 0.6 | JS serialization |
| `console_error_panic_hook` | 0.1 | Better panic messages |
| `hex` | 0.4 | Content ID hex encoding |

---

## Memory Management

**Important**: WASM objects returned to JavaScript must be manually freed to prevent memory leaks.

```javascript
// Correct usage
const keypair = new WasmKeypair();
const address = keypair.address();
keypair.free(); // REQUIRED!

// With Symbol.dispose (TypeScript 5.2+)
{
  using keypair = new WasmKeypair();
  const address = keypair.address();
} // Automatically freed
```

**Objects requiring `.free()`:**
- `WasmKeypair`
- `WasmPowSolution`
- `WasmDecayState`

---

## Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 89+ | Full support |
| Firefox | 89+ | Full support |
| Safari | 15+ | Full support |
| Edge | 89+ | Full support |

---

## Binary Size

| File | Size | Notes |
|------|------|-------|
| `swimchain_wasm_bg.wasm` | 151.5 KB | Uncompressed |
| `swimchain_wasm.js` | 39 KB | Generated JS bindings |
| `swimchain_wasm.d.ts` | ~16 KB | TypeScript definitions |

**Size optimizations applied:**
- `opt-level = "z"` for smallest binary
- `lto = true` for dead code elimination
- `panic = "abort"` to remove unwinding code
- Minimal dependency features (`default-features = false`)

---

## Quality Checklist

| Item | Status | Notes |
|------|--------|-------|
| WASM size optimized | Yes | 151.5 KB (target <500KB gzipped) |
| Panic hook installed | Yes | `console_error_panic_hook::set_once()` |
| Memory management | Partial | Must call `.free()` on returned objects |
| Works in all browsers | Yes | Chrome/Firefox/Safari/Edge 89+ |
| No blocking main thread | No | Mining blocks; use Web Worker |

---

## Error Handling

All WASM errors are converted to JavaScript exceptions via `JsValue`. The error types are:

| Error Type | Cause | Resolution |
|------------|-------|------------|
| `InvalidAddress` | Malformed Bech32m, wrong prefix ("cs"), wrong version, wrong length | Validate address format before use; check for typos |
| `InvalidPublicKey` | Public key not 32 bytes | Ensure Ed25519 public key is exactly 32 bytes |
| `InvalidSignature` | Signature not 64 bytes or verification failed | Check signature format; verify correct pubkey/message pair |
| `PowFailed` | Max attempts exceeded without finding valid nonce | Increase max_attempts or reduce difficulty |
| `InvalidDifficulty` | Difficulty outside range [1, 64] | Use difficulty within valid range |
| `DecayCalculationError` | Invalid timestamps (future dates, negative values) | Ensure timestamps are valid UNIX seconds |
| `InvalidInput` | Generic input validation failure | Check function documentation for input requirements |

**Error Handling Example (JavaScript):**
```javascript
try {
  const address = decode_address(userInput);
} catch (error) {
  // error is a string from WasmError::to_string()
  console.error('Invalid address:', error);
  // Example: "Invalid address: Invalid prefix: expected 'cs', got 'bc'"
}
```

**Silent Failures (return false instead of throwing):**
- `verify_signature()` - Returns `false` for malformed inputs
- `verify_identity_pow()` - Returns `false` for invalid proofs
- `verify_pow_difficulty()` - Returns `false` for insufficient difficulty
- `is_valid_address()` - Returns `false` for invalid addresses

---

## Known Limitations

1. **No Argon2id**: Memory-hard PoW requires 64 MiB which is impractical in WASM. Action PoW uses Argon2id on native side only.

2. **No Private Key Encryption**: WASM does not implement key encryption. Use JavaScript Web Crypto API:
   ```javascript
   const encryptedSeed = await crypto.subtle.encrypt(
     { name: 'AES-GCM', iv },
     key,
     keypair.seed()
   );
   ```

3. **Mining Blocks Main Thread**: `mine_identity_pow()` is synchronous. Solutions:
   - Use `mineIdentityPowWithLimit()` with setTimeout batching
   - Use Web Worker for true non-blocking

4. **BigInt Required**: Timestamps and nonces use `bigint` in TypeScript, not `number`.

---

## Test Coverage

All modules have inline `#[cfg(test)]` tests:

| Module | Test Coverage |
|--------|---------------|
| `crypto.rs` | SHA-256 vectors, leading zeros, content_id format |
| `identity.rs` | Keypair generation, address roundtrip, signatures, seed determinism |
| `pow.rs` | PoW verification, invalid inputs, time estimation |
| `decay.rs` | Floor protection, 32-day decay, engagement reset, custom half-life |

Run tests: `cargo test -p swimchain-wasm`

### Integration Testing

Test WASM in browser:
```bash
# Build WASM package
wasm-pack build swimchain-wasm --target web

# Run browser tests
wasm-pack test --headless --chrome swimchain-wasm
```

Test React integration:
```bash
cd forum-client
npm run dev
# Navigate to identity page and test mining
```

---

## Future Work

Based on gap analysis and implementation review:

1. **Web Worker Helper Module**
   - Built-in Web Worker wrapper for mining operations
   - Progress callbacks during long mining operations
   - Automatic batch size tuning based on device performance

2. **Streaming Hash API**
   - `Sha256Hasher` class for incremental hashing of large data
   - Useful for content ID generation of large files

3. **Address Book / Contact Management**
   - `verify_multiple_addresses()` batch validation
   - Address checksum recovery suggestions

4. **Performance Monitoring**
   - `benchmark_hash_rate()` function for device calibration
   - More accurate `estimateMiningTime()` based on actual performance

5. **Key Derivation**
   - BIP-39 mnemonic support (optional feature flag)
   - HD key derivation for multi-identity management

6. **SIMD Optimization**
   - SHA-256 SIMD acceleration when browser support matures
   - Potential 2-4x mining speedup

---

## Related Sections

- **SPEC_01 Section 3.3**: Address encoding specification
- **SPEC_01 Section 3.4**: Identity PoW specification
- **SPEC_02 Section 4.1**: Content decay model
- **Section 2**: Proof-of-Work Systems (Argon2id action PoW, not in WASM)
- **Section 14**: Frontend SDK integration
- **Section 15**: React SDK hooks

---

## Changelog

| Version | Changes |
|---------|---------|
| 0.1.0 | Initial release with identity, crypto, decay, and PoW modules |
