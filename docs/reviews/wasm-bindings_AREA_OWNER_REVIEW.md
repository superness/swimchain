# Area Owner Review: WASM Bindings

**Generated**: 2026-01-13
**Overall Health Score**: 82/100
**Status**: Needs Attention

## Executive Summary

The WASM Bindings module provides a solid foundation for client-side cryptographic operations with excellent vision alignment and spec compliance. However, **two critical issues require immediate attention**: (1) private keys are stored **unencrypted in localStorage**, exposing users to XSS-based identity theft with CVSS 9.1, and (2) there is an **address prefix mismatch** between code (`cs1`) and tests/docs (`sw1`) that must be resolved. Additionally, the lack of a key backup/export UI means users cannot protect their permanent, non-recoverable identities. The mining experience is well-designed but blocks the main thread pending Web Worker implementation.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 87/100 | :yellow_circle: |
| Performance | 82/100 | :yellow_circle: |
| Vision Alignment | 91/100 | :green_circle: |
| User Experience | 78/100 | :yellow_circle: |
| Accessibility | 81/100 | :yellow_circle: |
| Quality | 77/100 | :yellow_circle: |
| Security | 82/100 | :yellow_circle: |
| **Overall** | **82/100** | :yellow_circle: |

Legend: :green_circle: 80+ | :yellow_circle: 50-79 | :red_circle: <50

## Critical Issues (Must Address)

### 1. Unencrypted Private Keys in localStorage
- **Source**: Security Review
- **Severity**: Critical (CVSS 9.1)
- **Description**: User seeds (private keys) are stored as unencrypted hex strings in `localStorage` at key `swimchain-identity`. Any XSS vulnerability allows an attacker to steal all user identities.
- **Location**: `swimchain-react/src/hooks/useStoredIdentity.ts:122-125`
- **Impact**: Complete identity compromise - attackers can impersonate users, sign any action, steal reputation/content ownership permanently
- **Action**: Encrypt seeds using Web Crypto API with PBKDF2 key derivation and AES-GCM encryption before storage
- **Effort**: M (2-4 hours implementation + migration strategy)

### 2. Address Prefix Documentation/Test Mismatch
- **Source**: Functionality Review, Security Review, Quality Review
- **Severity**: Critical
- **Description**: `ADDRESS_HRP = "cs"` in code produces `cs1...` addresses, but test at `identity.rs:324` asserts `starts_with("sw1")`. Documentation comments also reference "sw1" in several places.
- **Location**: `swimchain-wasm/src/identity.rs:13,141,159,165,324`
- **Impact**: Developer confusion, potential address validation failures if clients expect different prefixes, user confusion about valid address format
- **Action**: Determine canonical prefix and update ALL references consistently (constants, tests, comments, docs)
- **Effort**: S (30-60 minutes)

### 3. No Key Backup/Export UI
- **Source**: UX Review
- **Severity**: Critical (User Safety)
- **Description**: The `seed()` method exists in WASM to export private keys, but no UI exposes this functionality. Users cannot backup their identity, which is permanent and non-recoverable.
- **Location**: Missing from `forum-client/src/pages/Identity.tsx`
- **Impact**: Users lose access forever if they clear browser data, switch devices, or experience data loss
- **Action**: Add "Export Seed" button with confirmation checkboxes; show seed during identity creation; optionally support encrypted backup file
- **Effort**: M (2-3 hours)

## High Priority Issues

### 1. expect() Calls in Production Paths
- **Source**: Security Review, Quality Review
- **Severity**: High
- **Description**: Three `expect()` calls can panic and crash the WASM instance: `WasmKeypair::address()` (line 143), `Default` impl (line 149), `Hrp::parse()` (line 180)
- **Impact**: Application crash, denial of service
- **Action**: Return `Result<String, JsValue>` from `address()`, remove or rework `Default` impl
- **Effort**: S (1 hour)

### 2. Mining Blocks Main Thread
- **Source**: Performance Review, UX Review, Accessibility Review
- **Severity**: High
- **Description**: PoW mining loop runs on main thread with setTimeout batching. At difficulty 20, causes ~20s of micro-freezes affecting UI responsiveness.
- **Location**: `swimchain-wasm/src/pow.rs:165-179`, `forum-client/src/hooks/usePow.ts`
- **Impact**: Poor UX, accessibility issues (users can't navigate during mining), violates WCAG 2.2.1
- **Action**: Implement Web Worker integration (already planned per feature doc)
- **Effort**: L (4-8 hours)

### 3. HeatIndicator Uses Color Alone
- **Source**: Accessibility Review
- **Severity**: High (WCAG 1.4.1 Violation)
- **Description**: Mobile HeatIndicator uses color alone to convey decay status without text alternatives
- **Location**: `mobile-client/src/components/HeatIndicator.tsx:65-75`
- **Impact**: Color-blind users cannot distinguish heat levels
- **Action**: Add text labels/accessibility props: `accessibilityLabel={`Content heat: ${heatLevel}`}`
- **Effort**: S (30 minutes)

### 4. Identity Deletion Too Easy
- **Source**: UX Review, Accessibility Review
- **Severity**: High
- **Description**: Simple `window.confirm()` for deleting permanent identity. No seed backup requirement.
- **Location**: `forum-client/src/pages/Identity.tsx:94-98`
- **Impact**: Accidental permanent identity loss
- **Action**: Require typing address or "DELETE" to confirm; show seed with copy button first; add explicit "cannot be undone" warning with `aria-live="assertive"`
- **Effort**: S (1-2 hours)

### 5. No prefers-reduced-motion Support
- **Source**: Accessibility Review
- **Severity**: High (WCAG 2.2.2 Violation)
- **Description**: Mining cube animation cannot be paused or disabled
- **Location**: `forum-client/src/components/PowProgress.css:41-44`
- **Impact**: Users with vestibular disorders or motion sensitivity cannot disable animation
- **Action**: Add `@media (prefers-reduced-motion: reduce) { .spinner-cube { animation: none; } }`
- **Effort**: S (15 minutes)

## Medium Priority Issues

### 1. No Browser Integration Tests
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: `wasm-bindgen-test` dependency exists but no test files in `swimchain-wasm/tests/`
- **Impact**: No verification that WASM works correctly in actual browser environment
- **Action**: Create `swimchain-wasm/tests/web.rs` with `#[wasm_bindgen_test]` tests
- **Effort**: M (3-4 hours)

### 2. No Seed Zeroing After Use
- **Source**: Security Review
- **Severity**: Medium
- **Description**: Seed bytes copied into array but not zeroed after use, persisting in WASM memory
- **Location**: `swimchain-wasm/src/identity.rs:69-70`
- **Impact**: Sensitive key material may be extractable from memory
- **Action**: Add `zeroize` crate dependency and use `Zeroizing<[u8; 32]>` wrapper
- **Effort**: S (1 hour)

### 3. Inconsistent Hash Rate Constants
- **Source**: UX Review, Performance Review
- **Severity**: Medium
- **Description**: `PowProgress.tsx` uses 50,000 h/s, WASM uses 500,000 h/s default
- **Location**: `forum-client/src/components/PowProgress.tsx:14` vs `pow.rs:425-429`
- **Impact**: Inconsistent time estimates (10x difference)
- **Action**: Use single source of truth; expose hash rate from WASM or calibrate per device
- **Effort**: S (30 minutes)

### 4. Inconsistent HeatIndicator Implementations
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Mobile uses `decayPercentage (0-100)`, web uses `survivalProbability (0.0-1.0)`
- **Impact**: Maintenance burden, potential bugs when refactoring
- **Action**: Standardize on 0.0-1.0 probability; create shared component in swimchain-react
- **Effort**: M (2-3 hours)

### 5. Error Messages Not Structured
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: `WasmError` converts to plain strings, forcing JS to parse errors for handling
- **Location**: `swimchain-wasm/src/error.rs:56-58`
- **Impact**: Difficult programmatic error handling
- **Action**: Return JS objects with `{code, message, details}` structure
- **Effort**: M (2-3 hours)

### 6. No WASM Loading Retry Logic
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: WASM load failures have no automatic retry with backoff
- **Impact**: Transient network issues cause permanent failure
- **Action**: Add exponential backoff retry to `initWasm()`
- **Effort**: S (1-2 hours)

### 7. Missing Symbol.dispose Support
- **Source**: Functionality Review, UX Review
- **Severity**: Medium
- **Description**: WASM objects require manual `.free()` calls; no TypeScript `using` keyword support
- **Impact**: Memory leaks if developers forget cleanup
- **Action**: Implement `[Symbol.dispose]` on WasmKeypair, WasmPowSolution, WasmDecayState
- **Effort**: S (1 hour)

## Quick Wins (Low Effort, High Impact)

1. **Fix address prefix test**: Update `identity.rs:324` to assert `starts_with("cs1")` - 15 min
2. **Add prefers-reduced-motion CSS**: Single media query block - 15 min
3. **Add accessibilityLabel to mobile HeatIndicator**: One prop per View - 30 min
4. **Add scope to shortcut table headers**: `scope="col"` attributes - 15 min
5. **Standardize hash rate constant**: Export from WASM, use in JS - 30 min
6. **Add clipboard feedback live region**: Screen reader announcement on copy - 30 min

## Strengths to Preserve

- **Vision Alignment (91/100)**: The module perfectly embodies "Identity IS the Keypair" principle with no account abstraction or custodial layer
- **Spec Compliance**: All cryptographic constants (decay floor, half-life, threshold, difficulty) match SPEC_01 and SPEC_02 exactly
- **Excellent Cryptographic Choices**: Ed25519, SHA-256, Bech32m via well-audited crates (ed25519-dalek, sha2, bech32)
- **Binary Size Optimization**: 151.5 KB WASM with proper optimization flags (opt-level "z", LTO, panic abort)
- **Mining UX**: Progress bar, time estimates, educational tips, cancel option, 3D cube animation
- **Accessibility Foundation**: Skip links, focus indicators, 44px touch targets, live regions, proper ARIA roles
- **Clean Module Structure**: Single-responsibility modules, internal test functions, good doc coverage (~90%)

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] **P0**: Fix address prefix mismatch in test and comments (30 min)
- [ ] **P0**: Add prefers-reduced-motion CSS media query (15 min)
- [ ] **P0**: Design seed encryption strategy (PBKDF2 + AES-GCM with Web Crypto API)
- [ ] **P0**: Add accessibilityLabel to mobile HeatIndicator (30 min)
- [ ] **P1**: Replace expect() with Result returns in WasmKeypair::address() (1 hr)
- [ ] **P1**: Add key export UI to Identity page with safety checkboxes (2-3 hrs)
- [ ] **P1**: Enhance identity deletion with confirmation and seed display (1-2 hrs)

### Short Term (Next 2-4 Weeks)
- [ ] Implement seed encryption in useStoredIdentity hook
- [ ] Create Web Worker module for non-blocking mining
- [ ] Add browser integration tests with wasm-bindgen-test
- [ ] Unify HeatIndicator component across mobile and web clients
- [ ] Add zeroize for sensitive data cleanup
- [ ] Add WASM loading retry logic with exponential backoff
- [ ] Implement Symbol.dispose for automatic memory cleanup

### Long Term (Backlog)
- [ ] Add streaming hash API (Sha256Hasher class) for large files
- [ ] Implement hash rate calibration (benchmark_hash_rate function)
- [ ] Add SIMD SHA-256 when browser support matures
- [ ] Consider BIP-39 mnemonic support for human-readable backup
- [ ] Add batch signature verification API
- [ ] Extract shared algorithm implementations to swimchain-core crate

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| Address prefix mismatch (test/docs) | S | H | 1 |
| expect() in production paths (3 instances) | S | H | 1 |
| Unencrypted seed storage | M | H | 1 |
| No browser WASM tests | M | M | 2 |
| Duplicated decay/PoW constants (WASM vs main crate) | M | M | 3 |
| String error messages (not structured) | M | M | 3 |
| No streaming hash API | M | L | 4 |
| No retry logic for WASM load | S | M | 3 |
| Hash rate constant inconsistency | S | L | 4 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| XSS leads to mass identity theft | Medium | Critical | Encrypt seeds with user passphrase before localStorage |
| Users lose identity (no backup) | High | High | Add key export UI immediately; prompt during creation |
| Address confusion (cs1 vs sw1) | Low | Medium | Fix all references to canonical prefix; add validation |
| WASM panic crashes app | Low | Medium | Replace expect() with Result; add error boundary |
| Mining causes UI freeze | Medium | Medium | Implement Web Worker; already planned |
| Memory leaks from forgotten free() | Medium | Low | Implement Symbol.dispose; document clearly |
| Argon2id unavailable in browser | Certain | Low | Already mitigated - documented limitation, server-side fallback |

## Appendix: Detailed Review Summaries

### Functionality
**Score: 87/100**

Strengths:
- Complete implementation of Ed25519 keypairs, Bech32m addresses, SHA-256 hashing, PoW mining/verification
- Well-documented code with JSDoc examples in every public function
- Clean error handling via dedicated WasmError type
- Spec-compliant with SPEC_01 and SPEC_02
- Size-optimized build (151.5 KB)

Key Issues:
- Critical address prefix mismatch (cs1 vs sw1)
- Missing progress callback for mining
- Missing Symbol.dispose for memory management
- from_seed uses wrong error type

### Performance
**Score: 82/100**

Strengths:
- Clean O(1) and O(n) operations; mining is O(2^d) as expected
- Minimal memory footprint (~48 bytes per hash)
- Mobile-friendly binary size
- Appropriate build optimization flags

Key Issues:
- Main thread blocking during PoW mining
- No SIMD optimization yet
- No device-specific hash rate calibration
- Some Vec copies in hot paths

### Vision Alignment
**Score: 91/100**

Strengths:
- Embodies "Identity IS the Keypair" principle perfectly
- All operations purely local (no central authority)
- User sovereignty via seed() method
- Sybil resistance via PoW with spec-compliant difficulty
- Browser-first architecture supporting true decentralization

Key Issues:
- Main thread blocking conflicts with "active participation" if it frustrates users
- No Argon2id means action PoW differs from identity PoW (documented, justified)

### User Experience
**Score: 78/100**

Strengths:
- Mining tips system reduces perceived wait time
- Clean state machine for mining operations
- Address display with copy functionality
- Heat state labels are human-readable and actionable

Key Issues:
- **No key backup/export UI** - critical gap
- Identity deletion too easy
- Mining blocks main thread
- Inconsistent decay visualization across clients
- Progress tracking relies on exception catching

### Accessibility
**Score: 81/100**

Strengths:
- Good color contrast (15:1, 8:1, 5:1 ratios declared)
- Keyboard navigation with j/k, Enter, Escape, ? shortcuts
- Skip links, focus indicators, 44px touch targets
- Live regions for mining progress
- Proper progressbar roles with ARIA attributes

Key Issues:
- HeatIndicator uses color alone (WCAG 1.4.1 fail)
- Mining animations cannot be paused (WCAG 2.2.2 fail)
- Mobile components lack accessibility props
- Identity deletion needs stronger safeguards for AT users

### Quality
**Score: 77/100**

Strengths:
- Clean module separation (identity, crypto, pow, decay, error)
- Good test/code ratio (~0.67)
- TypeScript definitions include JSDoc from Rust
- ~90% doc coverage

Key Issues:
- Address prefix test/doc mismatch
- expect() in 3 production paths
- No browser WASM tests
- No retry logic for transient failures
- String error messages (not structured for programmatic handling)

### Security
**Score: 82/100**

Strengths:
- Well-vetted cryptographic libraries (ed25519-dalek, sha2)
- Proper CSPRNG usage via getrandom with js feature
- Secret key marked wasm_bindgen(skip) to prevent JS access
- Comprehensive input validation on all public APIs

Critical Vulnerabilities:
- **Unencrypted seeds in localStorage** (CVSS 9.1)
- Address prefix mismatch between code and tests
- expect() calls can panic in production
- No seed zeroing after use

---

*Synthesized by Area Owner Review Agent*
*Review Date: 2026-01-13*
*Feature Version: 0.1.0*
