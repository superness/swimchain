# Security Review: Fork System

## Summary
The Fork System has **critical security gaps** in signature verification: supporter signatures are stored but never cryptographically verified, and creator signatures are not validated when loading forks from storage. The system correctly uses Ed25519 and SHA-256 primitives, but fails to verify signatures at trust boundaries. Additionally, there are **unbounded input vulnerabilities** (excluded_ids list, supporter_sigs) that could enable memory exhaustion attacks, and the CLI fails to pass secret_key to RPC making fork creation impossible via CLI.

## Scores
| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 12 | 25 | Supporter signatures stored but never verified |
| Crypto Correctness | 18 | 25 | Good primitives, but verification missing |
| Input Validation | 14 | 25 | Length limits missing, DoS vectors present |
| Data Protection | 20 | 25 | Secret key over RPC is concerning |
| **Total** | **64** | **100** | Critical verification gaps |

## Threat Model
| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Fake supporter endorsements | High | Medium | **UNMITIGATED** - signatures not verified |
| Memory exhaustion via excluded_ids | Medium | High | **UNMITIGATED** - no bounds check |
| Fork ID collision/preimage | Low | Critical | Mitigated via SHA-256 |
| Secret key exposure in RPC | Medium | Critical | Over HTTP/localhost, needs transport security |
| Race condition in fork switch | Medium | Medium | **UNMITIGATED** - storage/cache update not atomic |
| Malformed genesis deserialization | Medium | Medium | Partial - basic bounds checking exists |

## Vulnerabilities Found

### Critical (Exploitable)

#### 1. Supporter Signature Verification Missing
**Vulnerability**: Signatures from supporters are stored but never cryptographically verified. An attacker can add arbitrary endorsements with fabricated signatures.

**Location**: `src/fork/registry.rs:291-311`

**Code**:
```rust
pub fn add_fork_support(
    &self,
    fork_id: &ForkId,
    identity: &Identity,
) -> Result<(), ForkError> {
    let mut genesis = self.store.get_genesis(fork_id)?
        .ok_or_else(|| ForkError::NotFound(*fork_id))?;

    // Sign the genesis
    let bytes = genesis.to_bytes();
    let signature = identity.sign(&bytes);

    genesis.add_supporter(identity.public_key(), signature);  // NO VERIFICATION

    // Update storage
    self.store.store_genesis(fork_id, &genesis)?;
    Ok(())
}
```

**Attack**: Attacker can call `add_fork_support()` with any identity/signature pair. Even without the private key, arbitrary (pubkey, invalid_sig) tuples are accepted and persisted.

**Impact**: Fork legitimacy can be faked by claiming endorsements from influential identities. Social engineering attack vector.

**Fix**: Add signature verification before storing:
```rust
// Verify signature
let verifying_key = ed25519_dalek::VerifyingKey::from_bytes(&identity.public_key())
    .map_err(|e| ForkError::SignatureError(e.to_string()))?;
verifying_key.verify_strict(&bytes, &ed25519_dalek::Signature::from_bytes(&signature))
    .map_err(|e| ForkError::SignatureError(e.to_string()))?;
```

**CVSS**: 7.5 (High) - Network-exploitable, no authentication required

#### 2. Creator Signature Never Verified on Load
**Vulnerability**: When loading a fork genesis from storage or receiving it over the network, the creator_sig is never validated against creator_id and the genesis bytes.

**Location**: `src/fork/storage.rs:66-73` and `src/fork/registry.rs:232-235`

**Attack**: Attacker with storage access (or crafting network messages) can modify fork genesis data while keeping the original signature.

**Impact**: Fork genesis could be tampered with (change excluded_ids, content_selector, etc.) without detection.

**Fix**: Add verification in `get_genesis()` and when receiving forks over network.

**CVSS**: 6.5 (Medium) - Requires storage access or network MITM

### High

#### 3. Unbounded excluded_ids List (Memory Exhaustion)
**Vulnerability**: No limit on the number of excluded identities in a fork configuration. Deserialization allocates memory based on untrusted count.

**Location**: `src/fork/genesis.rs:348-358`

**Code**:
```rust
let excluded_count = u32::from_le_bytes(bytes[pos..pos + 4].try_into().ok()?) as usize;
pos += 4;
let mut excluded_ids = Vec::with_capacity(excluded_count);  // UNBOUNDED ALLOCATION
for _ in 0..excluded_count {
    // ...
}
```

**Attack**: Craft genesis with `excluded_count = 0xFFFFFFFF` (4 billion entries). This requests 128GB of memory allocation.

**Impact**: Node crashes with OOM, denial of service.

**Fix**: Add reasonable bound (e.g., 10,000 max excluded identities):
```rust
const MAX_EXCLUDED_IDS: usize = 10_000;
if excluded_count > MAX_EXCLUDED_IDS {
    return None;
}
```

**CVSS**: 7.5 (High) - Remote DoS via crafted message

#### 4. Unbounded supporter_sigs List
**Vulnerability**: Same as above for supporter signatures.

**Location**: `src/fork/genesis.rs:388-407`

**Fix**: Add max supporter limit (e.g., 1,000).

**CVSS**: 7.5 (High) - Remote DoS

#### 5. CLI Doesn't Pass secret_key to RPC
**Vulnerability**: The CLI `create_fork` command never passes the `secret_key` parameter to RPC, but RPC requires it.

**Location**: `src/cli/commands/fork.rs:196-202`

**Code**:
```rust
let params = json!({
    "name": name,
    "description": description,
    "excluded_ids": excluded_ids,
    "content_mode": content_mode,
    // NOTE: secret_key is missing!
});
```

**Impact**: Fork creation via CLI will always fail with "secret_key is required" error.

**Fix**: Read identity from config and include in RPC call.

**CVSS**: 3.3 (Low) - Functionality broken, not a direct security vuln

### Medium

#### 6. Secret Key Transmitted Over RPC
**Vulnerability**: The `create_fork` RPC method accepts a raw 32-byte secret key as a hex parameter.

**Location**: `src/rpc/methods.rs:5962-5971`

**Risk**: If RPC is exposed over network (not just localhost), secret keys could be intercepted. Even on localhost, the key may appear in logs, shell history, or process listings.

**Mitigation**:
- Ensure RPC only binds to localhost (verify this)
- Consider signing the request client-side instead of sending secret key
- Add warning in documentation

**CVSS**: 5.3 (Medium) - Depends on deployment

#### 7. Race Condition in switch_fork()
**Vulnerability**: Storage and in-memory cache are updated non-atomically.

**Location**: `src/fork/registry.rs:225-227`

**Code**:
```rust
self.store.set_active_fork(&fork_id)?;  // Step 1: Update storage
*self.active_fork.write().unwrap() = fork_id;  // Step 2: Update cache
```

**Attack**: If crash occurs between steps, storage and cache are inconsistent on restart.

**Impact**: Node may operate on different fork than persisted.

**CVSS**: 4.3 (Medium) - Requires crash at specific timing

#### 8. RwLock Panic Propagation
**Vulnerability**: Using `unwrap()` on RwLock guards in production code.

**Location**: `src/fork/registry.rs:115, 216, 227`

**Impact**: If any thread panics while holding the lock, all subsequent accesses panic.

**Fix**: Use `read().ok()` and `write().ok()` with proper error handling.

**CVSS**: 4.3 (Medium)

### Low

#### 9. Fork Name Not Sanitized
**Vulnerability**: Fork name is stored and displayed without sanitization. Could contain control characters or malicious unicode.

**Location**: `src/fork/genesis.rs:80-83`

**Impact**: Potential for log injection, terminal escape sequences.

**Fix**: Sanitize to alphanumeric + limited special chars.

**CVSS**: 3.1 (Low)

#### 10. Timestamp from SystemTime Can Be Manipulated
**Vulnerability**: Fork genesis timestamp uses local system time.

**Location**: `src/fork/genesis.rs:182-185`

**Impact**: Attacker with system access could set clock to create forks with false timestamps. Affects fork ID determinism.

**CVSS**: 2.4 (Low)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Purpose | Assessment |
|-----------|---------|------------|
| Ed25519 | Signatures | **GOOD** - Standard, secure |
| SHA-256 | Fork ID derivation | **GOOD** - Collision resistant |
| ed25519-dalek | Implementation | **GOOD** - Well-audited crate |

### Key Management
- **Identity creation**: Properly derives verifying key from signing key
- **Key storage**: Keys are in memory only during operation (good)
- **Secret key over RPC**: **CONCERN** - Should sign client-side

### Random Number Generation
- `Identity::generate()` uses `crate::identity::generate_keypair()` - needs verification this uses CSPRNG
- No explicit nonce usage in fork system (not needed for Ed25519 deterministic signatures)

### Nonce Handling
N/A - Ed25519 uses deterministic nonces per RFC 8032.

## Attack Surface

### External Inputs
1. **RPC Parameters**: `name`, `description`, `excluded_ids`, `content_mode`, `secret_key`, `fork_id`
2. **Network Messages**: ForkAnnounce (0x53), ForkQuery (0x54), ForkInfo (0x55)
3. **CLI Arguments**: `--name`, `--description`, `--exclude`, `--content-mode`
4. **Storage**: Fork genesis bytes from sled database

### Trust Boundaries
1. **RPC Interface**: External clients -> Node (partially trusted)
2. **Network Protocol**: Peer nodes -> Node (untrusted)
3. **Storage Layer**: Disk -> Memory (partially trusted)
4. **CLI -> RPC**: Local user -> Node (trusted)

### Privileged Operations
1. `create_fork()` - Creates new chain, requires valid identity
2. `switch_fork()` - Changes node's active chain
3. `delete_fork()` - Removes fork from storage
4. `add_fork_support()` - Modifies fork endorsements

## Recommendations

### P0 (Critical - Fix Immediately)
1. **Implement supporter signature verification** in `add_fork_support()`
2. **Add creator signature verification** when loading fork genesis
3. **Add bounds checking** on `excluded_ids` (max 10,000) and `supporter_sigs` (max 1,000) during deserialization

### P1 (High - Fix Before Production)
4. **Fix CLI to pass secret_key** to RPC or implement client-side signing
5. **Make fork switch atomic** by using single transaction or write-ahead log
6. **Replace unwrap() on RwLock** with proper error handling

### P2 (Medium - Fix Soon)
7. **Consider client-side signing** for RPC instead of transmitting secret keys
8. **Add fork name sanitization** (alphanumeric + limited special chars)
9. **Verify RPC binds only to localhost** by default
10. **Add integration tests** for signature verification

### P3 (Low - Nice to Have)
11. **Log suppression for secret key** - ensure no key material in logs
12. **Rate limit fork creation** to prevent spam

## Security Best Practices Check
- [x] No hardcoded secrets
- [ ] Timing-safe comparisons - **NOT CHECKED** (signature comparison should use constant-time)
- [ ] Secure defaults - **PARTIAL** (content_mode defaults to "all" which may leak data)
- [ ] Principle of least privilege - **OK** (identity required for creation)
- [x] Cryptographic primitives are standard
- [ ] All signatures verified - **FAILED**
- [ ] Input bounds validated - **FAILED**
- [ ] Error messages don't leak sensitive info - **OK**

## Conclusion

The Fork System has a solid cryptographic foundation with Ed25519 and SHA-256, but **fails to verify signatures at critical trust boundaries**. The supporter signature vulnerability is immediately exploitable and could undermine the legitimacy of forks. Combined with unbounded input vulnerabilities, this system is **not safe for production use** until P0 items are addressed.

**Security Grade: D (64/100)** - Critical vulnerabilities must be fixed.

---

*Security Review performed on 2026-01-12*
*Reviewer: Security Perspective Agent*
