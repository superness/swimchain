# Security Review: Content Decay Engine

## Summary

The Content Decay Engine demonstrates **solid security fundamentals** with proper cryptographic primitives (Ed25519 signatures, SHA-256 hashing, Argon2id PoW), comprehensive input validation at system boundaries, and effective anti-spam mechanisms. However, there are **critical gaps in timestamp validation** during engagement processing that could allow decay timer manipulation, and **missing signature verification on engagement records** at the content manager level. The PoW system is well-designed with anti-stockpile protections.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 20 | 25 | Signature verification exists but gaps in engagement path |
| Crypto Correctness | 23 | 25 | Strong primitives, proper key generation, minor timing concern |
| Input Validation | 19 | 25 | Good bounds checking, missing timestamp validation in engagement |
| Data Protection | 20 | 25 | Content hashing, proper key handling, tombstone data exposure |
| **Total** | **82** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Decay timer manipulation via future timestamps | High | Medium | **NOT MITIGATED** - engagement timestamps accepted without validation |
| PoW stockpiling attack | Low | Low | 24-hour anti-stockpile limit (POW_MAX_AGE_SECS) |
| Sybil engagement flooding | Low | Medium | PoW requirement per engagement (Argon2id, difficulty 16) |
| Storage exhaustion DoS | Low | Medium | Adaptive half-life adjusts to storage pressure |
| Content hash collision | Very Low | High | SHA-256 collision resistance (2^128 security) |
| Signature forgery | Very Low | Critical | Ed25519 (128-bit security), proper verification |
| Spam flag abuse | Medium | Medium | 3 attestations required, rate limiting (10/hour), counter-attestations |
| Timestamp replay attack | Medium | Low | 10-minute challenge validity, 1-hour signature tolerance |
| Tombstone information leakage | Low | Low | Summary hash could reveal partial content |

## Vulnerabilities Found

### Critical (Exploitable)

1. **Timestamp Validation Missing in Engagement Processing**

   **Location**: `src/content/engagement.rs:56-84`

   **Attack**: An attacker can submit engagements with future timestamps, causing `content.last_engagement` to be set far in the future, effectively making content immortal or extending its lifetime indefinitely.

   **Code**:
   ```rust
   // Line 73 - timestamp directly assigned without validation
   content.last_engagement = engagement.timestamp;
   ```

   **Impact**: Decay mechanism bypass - content can be kept alive indefinitely by submitting engagements with timestamps far in the future. This undermines the entire organic moderation model.

   **Fix**: Add timestamp validation before updating `last_engagement`:
   ```rust
   // Validate timestamp is not in future and not too old
   if engagement.timestamp > current_time_ms + TIMESTAMP_FUTURE_TOLERANCE_MS {
       return EngagementResult::Rejected(EngagementRejection::InvalidTimestamp);
   }
   content.last_engagement = engagement.timestamp.min(current_time_ms);
   ```

   **CVSS**: 7.5 (High) - Network exploitable, no auth required, integrity impact

### High

1. **Missing Signature Verification on Engagement Records**

   **Location**: `src/content/lifecycle.rs:150-174`

   **Attack**: The `ContentManager::process_engagement()` method accepts `EngagementRecord` structs but does not verify the `signature` field. While RPC layer may verify, internal calls bypass this check.

   **Impact**: If engagement records are constructed internally or from untrusted sync data, spoofed engagements could manipulate decay timers.

   **Fix**: Add signature verification in `process_engagement()`:
   ```rust
   // Verify signature before processing
   if !verify_engagement_signature(&engagement) {
       return Err(ContentError::InvalidSignature);
   }
   ```

   **CVSS**: 6.5 (Medium-High)

2. **`expect()` Calls in Production Paths**

   **Location**: `src/content/addressing.rs:131-133, 178-180`

   **Attack**: If manifest serialization fails (edge case with malformed data), the node panics.

   **Code**:
   ```rust
   let manifest_hash = manifest
       .compute_hash()
       .expect("manifest serialization should work");
   ```

   **Impact**: DoS via specially crafted content that triggers serialization failure.

   **Fix**: Replace with proper error handling:
   ```rust
   let manifest_hash = manifest.compute_hash()?;
   ```

   **CVSS**: 5.3 (Medium)

### Medium

1. **Tombstone Summary Hash Information Leakage**

   **Location**: `src/content/pruning.rs:132-140`

   **Attack**: The `summary_hash` in tombstones is computed from the first 256 bytes of content body, which could reveal partial information about deleted content.

   **Impact**: Privacy concern - partial content recovery possible for forensic analysis.

   **Fix**: Use a salted hash or remove summary_hash entirely since thread coherence is maintained by content_id alone.

   **CVSS**: 3.7 (Low)

2. **No Timestamp Bounds on Created Content**

   **Location**: `src/content/lifecycle.rs:71-99`

   **Attack**: `create_content()` accepts content with any `created_at` timestamp, allowing backdated content to bypass the 48-hour decay floor or pre-dated content to appear older than it is.

   **Impact**: Manipulation of content age and protection period.

   **Fix**: Validate `created_at` is within acceptable bounds of current time.

   **CVSS**: 4.3 (Medium)

3. **Engagement Count Integer Saturation**

   **Location**: `src/content/engagement.rs:72, 79`

   **Attack**: While `saturating_add` prevents overflow, an attacker could flood engagements to max out the counter (u32::MAX), making engagement count meaningless.

   **Impact**: Denial of accurate engagement tracking, though PoW makes this expensive.

   **Fix**: Already uses saturating_add - acceptable given PoW cost.

   **CVSS**: 2.8 (Low)

### Low

1. **Recursive Child Check Stack Depth**

   **Location**: `src/content/pruning.rs:112-129`

   **Attack**: `has_non_decayed_children()` uses unbounded recursion. Deep thread hierarchies could cause stack overflow.

   **Impact**: DoS during pruning operation.

   **Fix**: Add depth limit or convert to iterative approach.

   **CVSS**: 3.1 (Low)

2. **Grace Period Bypass via Clock Skew**

   **Location**: `src/content/pruning.rs:62-68`

   **Attack**: Node with skewed clock could prune content early or delay pruning.

   **Impact**: Inconsistent content availability across nodes.

   **Fix**: Use network time consensus for pruning decisions.

   **CVSS**: 2.5 (Low)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Purpose | Assessment |
|-----------|---------|------------|
| Ed25519 | Signatures | **Secure** - 128-bit security, deterministic, constant-time implementation via `ed25519-dalek` |
| SHA-256 | Content hashing, PoW | **Secure** - Standard choice, collision-resistant |
| Argon2id | Action PoW | **Secure** - Memory-hard, ASIC-resistant, properly parameterized |

### Key Management
- **Key Generation**: Uses `OsRng` (OS cryptographic randomness) - **Secure**
- **Key Storage**: Private keys stored in 64-byte format (seed || public_key) - **Acceptable**
- **Key Derivation**: Ed25519 from seed, no custom derivation - **Secure**

### Random Number Generation
- **Nonce Generation**: `rand::thread_rng().fill_bytes()` for PoW nonce_space - **Secure**
- **Test Vectors**: Deterministic seed generation guarded by `#[cfg(test)]` - **Secure**

### Nonce Handling
- **PoW Nonces**: Incremental search with wrap detection - **Secure**
- **Challenge Nonce Space**: 8-byte random per challenge - **Secure**
- **Anti-Replay**: 10-minute challenge validity window - **Effective**

## Attack Surface

### External Inputs
| Input | Entry Point | Validation |
|-------|-------------|------------|
| Content body | `create_content()` | Size limits (4KB max), inline threshold |
| Engagement records | `process_engagement()` | PoW verified at RPC, **timestamp NOT validated** |
| PoW proofs | RPC methods | Full Argon2id verification, timestamp checks |
| Content hash | Various | SHA-256 verified on retrieval |
| Signatures | RPC, blocks | Ed25519 verification |
| Spam attestations | RPC | Signature + PoW + rate limit |

### Trust Boundaries
1. **RPC Layer → Content Manager**: PoW and signature verified at RPC, but internal ContentManager trusts engagement records
2. **Sync Layer → Content Store**: Synced content should be re-validated
3. **User → Node**: All user input validated at RPC boundary
4. **Peer → Node**: Block validation includes signature and PoW checks

### Privileged Operations
| Operation | Required Privilege | Protection |
|-----------|-------------------|------------|
| Content creation | PoW + Signature | Argon2id difficulty 18-22 |
| Engagement | PoW + Signature | Argon2id difficulty 16 |
| Spam attestation | PoW + Signature + Rate limit | SHA-256 PoW, 10/hour limit |
| Counter-attestation | Same as attestation | Same protections |
| Pruning | Node operator | Internal operation only |

## Recommendations

### Priority 1 (Critical - Fix Before Release)
1. **Add timestamp validation in engagement processing** (`engagement.rs:56`)
   - Reject future timestamps beyond tolerance
   - Use `min(engagement.timestamp, current_time_ms)` for `last_engagement`

### Priority 2 (High - Fix Soon)
2. **Add signature verification in ContentManager::process_engagement()**
   - Verify EngagementRecord signature before processing
   - Consider moving verification from RPC to ContentManager for defense-in-depth

3. **Replace expect() with proper error handling** (`addressing.rs:131,180`)
   - Propagate errors instead of panicking

### Priority 3 (Medium - Address in Next Sprint)
4. **Add timestamp validation for content creation**
   - Validate `created_at` within acceptable window

5. **Add recursion depth limit to has_non_decayed_children()**
   - Prevent stack overflow on deep hierarchies

6. **Consider removing or salting tombstone summary_hash**
   - Reduce information leakage from deleted content

### Priority 4 (Low - Track in Backlog)
7. **Implement network time consensus for pruning**
   - Reduce clock skew effects

8. **Add engagement signature to ContentItem struct**
   - Enable offline verification of engagement history

## Security Best Practices Check

- [x] No hardcoded secrets - Keys generated from OS randomness
- [x] Timing-safe comparisons - Ed25519 verification via constant-time library
- [x] Secure defaults - Production PoW config requires 64MB memory
- [x] Principle of least privilege - Separate difficulty levels per action type
- [x] Input size limits - 4KB content, 1GB max file, 1MB chunks
- [x] Rate limiting - Spam attestations limited to 10/hour
- [ ] **Timestamp validation** - **MISSING** in engagement processing
- [x] Anti-replay - Challenge validity windows, signature timestamps
- [x] Anti-stockpile - 24-hour PoW age limit

## Swimchain-Specific Security Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| PoW validation (anti-stockpile) | **PASS** | 24-hour limit enforced |
| Signature verification on all actions | **PARTIAL** | RPC verifies, ContentManager trusts |
| Spam attestation thresholds | **PASS** | 3 attestations to flag, 5 to clear |
| Private space encryption | N/A | Not in scope of Content Decay Engine |
| Identity key protection | **PASS** | OS randomness, proper storage format |

---

*Security Review completed: 2026-01-12*
*Reviewer: Claude Security Reviewer*
*Scope: Content Decay Engine (`src/content/`, `src/types/content.rs`)*
*Risk Level: **Medium-High** (due to timestamp validation gap)*
