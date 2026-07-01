# Security Review: WASM Bindings

## Summary
The WASM Bindings module demonstrates **solid cryptographic implementation** using well-vetted libraries (ed25519-dalek, sha2) with proper input validation on critical paths. However, there is a **critical vulnerability** in private key storage: seeds are stored **unencrypted in localStorage** as hex strings, accessible to any XSS attack. The module also has a documented test failure indicating an address prefix mismatch, and several `expect()` calls that could panic in production.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 22 | 25 | Good signature verification, proper validation |
| Crypto Correctness | 23 | 25 | Correct primitives, good RNG, one constant mismatch |
| Input Validation | 22 | 25 | Comprehensive bounds checking, some expect() paths |
| Data Protection | 15 | 25 | **Critical: Unencrypted seeds in localStorage** |
| **Total** | 82 | 100 | |

## Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| XSS steals private keys from localStorage | High | Critical | **NOT MITIGATED** - seeds stored unencrypted |
| PoW timestamp manipulation | Medium | Low | Uses client-side timestamp, server should verify recency |
| Timing attacks on signature verification | Low | Medium | Uses ed25519-dalek's constant-time ops |
| WASM memory extraction | Low | High | Keys in WASM memory; requires sophisticated attack |
| Malicious nonce reuse | Low | Medium | Nonces are sequential, timestamps from Date.now() |
| DoS via high-difficulty PoW | Medium | Low | Difficulty capped at 64, max_attempts option available |

## Vulnerabilities Found

### Critical (Exploitable)

1. **Vulnerability**: Unencrypted Private Keys in localStorage
   **Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:122-125`
   **Attack**: Any XSS vulnerability allows attacker to read `swimchain-identity` from localStorage containing the hex-encoded seed (private key)
   **Impact**: Complete identity compromise - attacker can impersonate user, sign any action
   **Code**:
   ```typescript
   const saveIdentity = useCallback((newIdentity: StoredIdentity) => {
     localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(newIdentity));
     // newIdentity.seed contains raw hex-encoded private key
   });
   ```
   **Fix**: Encrypt seed with Web Crypto API using user-provided passphrase before storage
   **CVSS**: 9.1 (Critical) - Network/Low/None/Unchanged/High/High/None

2. **Vulnerability**: Address Prefix Mismatch (Test Failure Indicates Production Bug)
   **Location**: `swimchain-wasm/src/identity.rs:13,324`
   **Attack**: Address validation may reject valid addresses or accept invalid ones depending on which prefix is "correct"
   **Impact**: User confusion, potential funds/identity loss if addresses don't match between components
   **Code**:
   ```rust
   const ADDRESS_HRP: &str = "cs";  // Line 13: produces "cs1..."
   assert!(addr.starts_with("sw1")); // Line 324: test expects "sw1..."
   ```
   **Fix**: Determine canonical prefix and update all references consistently
   **CVSS**: 6.5 (Medium)

### High

1. **Vulnerability**: expect() in Production Code Path
   **Location**: `swimchain-wasm/src/identity.rs:143`
   **Attack**: If internal state is corrupted, calling `address()` could panic and crash the WASM module
   **Code**:
   ```rust
   pub fn address(&self) -> String {
       encode_address_internal(&self.verifying.to_bytes())
           .expect("valid public key from keypair")  // Can panic!
   }
   ```
   **Impact**: Application crash, denial of service
   **Fix**: Return `Result<String, JsValue>` instead of unwrapping
   **CVSS**: 5.3 (Medium)

2. **Vulnerability**: Default trait impl uses expect()
   **Location**: `swimchain-wasm/src/identity.rs:149`
   **Attack**: If RNG fails (browser security restrictions, entropy exhaustion), Default::default() panics
   **Code**:
   ```rust
   impl Default for WasmKeypair {
       fn default() -> Self {
           Self::new().expect("keypair generation should not fail")
       }
   }
   ```
   **Impact**: Application crash on keypair generation failure
   **Fix**: Don't implement Default, or implement it differently
   **CVSS**: 4.3 (Medium)

3. **Vulnerability**: HRP parsing uses expect()
   **Location**: `swimchain-wasm/src/identity.rs:180`
   **Code**:
   ```rust
   let hrp = Hrp::parse(ADDRESS_HRP).expect("valid HRP");
   ```
   **Impact**: Panic if ADDRESS_HRP constant is invalid (currently safe but fragile)
   **Fix**: Make this a compile-time check or handle gracefully
   **CVSS**: 2.0 (Low - currently safe)

### Medium

1. **Vulnerability**: PoW Timestamp Not Validated for Recency
   **Location**: `swimchain-wasm/src/pow.rs:156-157`
   **Code**:
   ```rust
   let start = js_sys::Date::now();
   let timestamp = (start / 1000.0) as u64;
   ```
   **Risk**: Client provides timestamp, server must validate it's recent. Pre-computed PoW with old timestamps could be stockpiled.
   **Impact**: PoW anti-stockpile protection depends on server-side validation
   **Mitigation**: Document that servers MUST verify timestamp recency

2. **Vulnerability**: No Seed Zeroing After Use
   **Location**: `swimchain-wasm/src/identity.rs:69-70`
   **Code**:
   ```rust
   let mut seed_array = [0u8; 32];
   seed_array.copy_from_slice(seed);
   // seed_array remains in memory after function returns
   ```
   **Impact**: Sensitive key material may persist in WASM linear memory
   **Fix**: Use `zeroize` crate to clear sensitive data after use
   **CVSS**: 3.7 (Low)

3. **Vulnerability**: Insufficient Documentation on Seed Export Security
   **Location**: `swimchain-wasm/src/identity.rs:89-108`
   **Risk**: The `seed()` method returns the raw private key. Documentation says "Store it securely" but clients store it unencrypted.
   **Impact**: Developers may not understand the security implications
   **Fix**: Add stronger warnings, consider removing seed export or adding encryption helper

### Low

1. **Vulnerability**: Silent Failure in Signature Verification
   **Location**: `swimchain-wasm/src/identity.rs:262`
   **Code**:
   ```rust
   pub fn verify_signature(...) -> bool {
       verify_signature_internal(...).unwrap_or(false)
   }
   ```
   **Risk**: All errors (invalid pubkey, invalid signature format) return `false` - no differentiation
   **Impact**: Debugging signature failures is difficult
   **Fix**: Consider returning optional error info or separate validation function

2. **Vulnerability**: No Rate Limiting on Mining
   **Location**: `swimchain-wasm/src/pow.rs:135-182`
   **Risk**: Mining loop can consume 100% CPU indefinitely
   **Impact**: Battery drain, UI freeze if not in Web Worker
   **Mitigation**: Document Web Worker requirement, consider adding yield points

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Library | Assessment |
|-----------|---------|------------|
| Ed25519 | ed25519-dalek 2.1 | **Excellent** - Well-audited, constant-time |
| SHA-256 | sha2 0.10 | **Excellent** - Standard implementation |
| Bech32m | bech32 0.11 | **Good** - Standard library |

### Key Management
- **Generation**: Uses `rand_core::OsRng` backed by browser CSPRNG via `getrandom` with `js` feature - **Correct**
- **Storage**: Seeds stored as hex in localStorage - **Critical vulnerability**
- **In-memory**: Secret key stored in `WasmKeypair` struct, marked `#[wasm_bindgen(skip)]` to prevent JS access - **Good**

### Random Number Generation
- Uses `getrandom` crate with `js` feature for browser CSPRNG
- Backed by `crypto.getRandomValues()` in browsers
- **Assessment**: Correct and secure for cryptographic use

### Nonce Handling
- PoW nonces: Sequential starting from 0 - **Acceptable** for PoW, unique per pubkey+timestamp
- No reuse risk since combined with timestamp and pubkey

## Attack Surface

### External Inputs
| Input | Validation | Risk |
|-------|------------|------|
| `public_key` byte slice | Length checked (32 bytes) | Low |
| `seed` byte slice | Length checked (32 bytes) | Low |
| `signature` byte slice | Length checked (64 bytes) | Low |
| `address` string | Bech32 checksum, prefix, version | Low |
| `difficulty` u8 | Range checked (1-64) | Low |
| `timestamp` u64 | No validation | Medium - server must verify |
| `max_attempts` u64 | None needed | Low |

### Trust Boundaries
1. **JS to WASM**: All inputs from JavaScript are untrusted - validation in place
2. **WASM to JS**: Errors converted to JsValue strings, no sensitive data leaked
3. **localStorage**: Treated as secure (incorrectly) - seeds unencrypted

### Privileged Operations
1. Private key generation (`WasmKeypair::new()`)
2. Private key export (`WasmKeypair::seed()`)
3. Message signing (`WasmKeypair::sign()`)

## Recommendations

### Priority 1 (Critical)
1. **Encrypt seeds in localStorage** using Web Crypto API with user passphrase
   - Use PBKDF2/Argon2id for key derivation
   - Use AES-GCM for encryption
   - Document the security model

### Priority 2 (High)
2. **Fix address prefix inconsistency** - determine canonical prefix (cs1 vs sw1) and update all code/tests
3. **Replace expect() with proper error handling** in `address()`, `Default` impl, and `Hrp::parse()`
4. **Add zeroize dependency** to clear sensitive key material after use

### Priority 3 (Medium)
5. **Document PoW timestamp validation requirements** for servers
6. **Add encryption helpers** to the WASM module for seed protection
7. **Consider removing seed() export** or requiring explicit acknowledgment

### Priority 4 (Low)
8. **Add differentiated signature verification errors** for debugging
9. **Document mining CPU impact** and Web Worker requirement
10. **Add Symbol.dispose support** for automatic cleanup (modern browsers)

## Security Best Practices Check
- [x] No hardcoded secrets (uses CSPRNG)
- [x] Timing-safe comparisons (via ed25519-dalek)
- [ ] Secure defaults - **FAIL: Seeds stored unencrypted**
- [x] Principle of least privilege (secret key not exposed to JS)
- [ ] No sensitive data logged - **N/A: No logging implemented**
- [x] Input validation on all public APIs
- [ ] Secure key storage - **FAIL: localStorage without encryption**

## Swimchain-Specific Security

### PoW Validation (Anti-Stockpile)
- **Mining**: Uses current timestamp from `Date.now()`
- **Verification**: Accepts any timestamp (server must validate recency)
- **Recommendation**: Document server-side timestamp freshness requirements

### Signature Verification on Actions
- `verify_signature()` correctly implements Ed25519 verification
- Returns boolean to avoid oracle attacks
- **Assessment**: Correct implementation

### Identity Key Protection
- Secret key marked `#[wasm_bindgen(skip)]` - not directly accessible from JS
- `seed()` method intentionally exposes private key for backup
- **Critical Issue**: Downstream storage is unencrypted

---

**Review Date**: 2026-01-13
**Reviewer**: Security Review Agent
**Files Reviewed**:
- `swimchain-wasm/src/lib.rs`
- `swimchain-wasm/src/identity.rs`
- `swimchain-wasm/src/crypto.rs`
- `swimchain-wasm/src/pow.rs`
- `swimchain-wasm/src/decay.rs`
- `swimchain-wasm/src/error.rs`
- `swimchain-react/src/hooks/useStoredIdentity.ts`
- Various client implementations
