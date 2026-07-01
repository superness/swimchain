# Area Owner Review: Client Applications

**Generated**: 2026-01-12
**Overall Health Score**: 65/100
**Status**: Needs Attention

## Executive Summary

The Client Applications suite provides 8 specialized web clients with solid architectural foundations - consistent provider stacks, modern cryptographic primitives (AES-256-GCM, X25519, Ed25519, Argon2id), and well-designed shared infrastructure. However, **4 critical security vulnerabilities** and **2 critical functionality bugs** require immediate attention: InviteModal bypasses PoW entirely enabling spam attacks, AutoEngageEngine simulates rather than performs actual PoW (breaking content preservation), private keys are stored in plaintext localStorage (XSS = complete identity theft), and a potential X25519 modular inverse bug could produce invalid encryption keys. Test coverage is virtually non-existent (2 test files across ~200 source files), and accessibility has multiple WCAG AA violations. The code is functional but not production-ready.

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 83/100 | 🟢 |
| Performance | 75/100 | 🟡 |
| Vision Alignment | 83/100 | 🟢 |
| User Experience | 67/100 | 🟡 |
| Accessibility | 62/100 | 🟡 |
| Quality | 45/100 | 🔴 |
| Security | 62/100 | 🟡 |
| **Overall** | **65/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

## Critical Issues (Must Address)

### 1. Private Keys Stored in Plaintext localStorage
- **Source**: Security Review
- **Severity**: Critical
- **Description**: Identity seed (private key material) stored unencrypted in localStorage at `forum-client/src/hooks/useStoredIdentity.ts:24-41`. Any XSS vulnerability enables complete identity theft.
- **Impact**: Attacker can impersonate user permanently; irrecoverable since "identity IS the keypair" - no password reset exists
- **Action**: Encrypt seed with user passphrase using PBKDF2/Argon2id before storage. Require passphrase on session start.
- **Effort**: M

### 2. InviteModal PoW Bypass
- **Source**: Functionality Review, Security Review, Vision Review
- **Severity**: Critical
- **Description**: `forum-client/src/components/InviteModal.tsx:86-97` uses `powNonce: 0, difficulty: 0` placeholder values instead of actual PoW mining. Comment says "TODO: Add proper PoW mining"
- **Impact**: Enables unlimited spam invites to private spaces without computational cost, violating SPEC_03 §1.1 "ALL actions MUST require computational cost"
- **Action**: Integrate `useActionPow` hook with progress UI; add `computePow()` call before invite submission
- **Effort**: S

### 3. AutoEngageEngine Simulates PoW
- **Source**: Functionality Review, Vision Review
- **Severity**: Critical
- **Description**: `archiver-client/src/services/AutoEngageEngine.ts:141-149` uses `setTimeout(resolve, 1000)` instead of actual PoW computation. Comment says "TODO: Call @swimchain/react usePow() or similar API"
- **Impact**: Content preservation feature is completely non-functional; archiver cannot contribute meaningful engagement to save at-risk content
- **Action**: Replace setTimeout simulation with actual `computePow()` and RPC `submitEngagement()` calls
- **Effort**: M

### 4. X25519 Modular Inverse Bug
- **Source**: Security Review
- **Severity**: Critical
- **Description**: `forum-client/src/lib/x25519.ts:116-128` implements modular inverse with potential issues for edge case inputs
- **Impact**: Could produce invalid X25519 keys for certain Ed25519 public keys, breaking private space encryption
- **Action**: Replace with proven implementation from audited library (e.g., tweetnacl-util) or add comprehensive edge case validation
- **Effort**: S

### 5. Missing Test Coverage
- **Source**: Quality Review
- **Severity**: Critical
- **Description**: Only 2 test files (`time.test.ts`, `types.test.ts`) exist across ~200+ source files. Zero tests for RPC, encryption, PoW, or React components.
- **Impact**: No regression protection; cannot verify correctness of critical cryptographic operations; unsafe to refactor
- **Action**: Add vitest configuration and tests for: RPC client auth, encryption roundtrip, PoW challenge serialization, DM space ID generation
- **Effort**: L (16+ hours for 60% coverage)

## High Priority Issues

### 1. Space Keys Stored Unencrypted in IndexedDB
- **Source**: Security Review
- **Severity**: High
- **Description**: Private space symmetric keys stored in plaintext in IndexedDB `swimchain-private-spaces` at `forum-client/src/hooks/usePrivateSpaceKeys.ts:140-147`
- **Impact**: XSS attack exposes all private space content the user has access to
- **Action**: Encrypt space keys with derived key from user passphrase before IndexedDB storage
- **Effort**: M

### 2. Modal Dialogs Lack Focus Trapping (WCAG 2.1.2)
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: `ReportModal.tsx:82-94`, `InviteModal.tsx:135-215`, `KeyboardShortcutsModal` allow Tab to escape to background content
- **Impact**: Keyboard-only users can Tab into background while modal open, causing disorientation
- **Action**: Implement focus trap using `focus-trap-react` library in all modal components
- **Effort**: S

### 3. Missing `lang` Attribute on HTML Element (WCAG 3.1.1)
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: Root `<html>` element missing `lang="en"` attribute across all 8 clients
- **Impact**: Screen readers may use incorrect pronunciation rules for entire application
- **Action**: Add `lang="en"` to `index.html` for each client (8 one-line fixes)
- **Effort**: S

### 4. ActionType Enum Missing SpamAttestation
- **Source**: Functionality Review, Vision Review
- **Severity**: High
- **Description**: `forum-client/src/lib/action-pow.ts:16-23` is missing `SpamAttestation = 0x08` per SPEC_12 §3.2
- **Impact**: Type safety gap; potential incorrect PoW challenge serialization for spam attestations
- **Action**: Add `SpamAttestation = 0x08` to ActionType enum
- **Effort**: S

### 5. Emoji Picker Not Keyboard Accessible (WCAG 2.1.1)
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: `forum-client/src/components/ContentStatus.tsx:106-118` emoji picker requires mouse; no keyboard navigation
- **Impact**: Keyboard users cannot react to content; feature is inaccessible
- **Action**: Add `role="menu"` with arrow key navigation and Enter to select
- **Effort**: M

### 6. Color-Only Status Indicators (WCAG 1.4.1)
- **Source**: Accessibility Review
- **Severity**: High
- **Description**: Presence indicators (green/yellow/gray dots in `globals.css:71-73`) and heat states (`globals.css:64-68`) conveyed by color alone
- **Impact**: ~8% of male users (color blindness) cannot distinguish online/away/offline or content health states
- **Action**: Add text labels ("Online", "Away", "Offline") or distinct icon shapes alongside color indicators
- **Effort**: S

### 7. Identity Loss Without Adequate Warning
- **Source**: UX Review
- **Severity**: High
- **Description**: `forum-client/src/pages/Identity.tsx:269-279` mentions seed loss in passing ("If you clear your browser data...") but no forced backup flow
- **Impact**: Users can permanently lose their identity by clearing browser data with no recovery option
- **Action**: Add forced seed phrase backup flow with acknowledgment checkbox before first content action; red warning banner
- **Effort**: M

### 8. Matrix Access Token Unencrypted
- **Source**: Security Review
- **Severity**: High
- **Description**: Matrix access token stored in localStorage without encryption in bridge-client
- **Impact**: Token exposure via XSS enables Matrix account compromise
- **Action**: Encrypt with derived key or store in memory only with session-based re-auth
- **Effort**: S

## Medium Priority Issues

### 1. ContentMonitor Sequential RPC Calls
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `archiver-client/src/services/ContentMonitor.ts:120-153` makes sequential RPC calls for each space in `for` loop
- **Impact**: Scan time grows linearly; 10 spaces at 200ms each = 2+ seconds minimum, may exceed 60s polling interval
- **Action**: Parallelize with `Promise.all(spaces.map(s => this.rpcClient.listSpaceContent(s)))`
- **Effort**: S

### 2. EchoTracker O(n) Lookup
- **Source**: Performance Review, Functionality Review
- **Severity**: Medium
- **Description**: `bridge-client/src/services/EchoTracker.ts:77-93` iterates entire Map for `wasBridgedTo()` check
- **Impact**: Poor scaling with bridge traffic; 1000 entries × 100 messages/sec = 100k iterations/sec
- **Action**: Add reverse index `Map<targetId, key>` for O(1) lookups
- **Effort**: S

### 3. PBKDF2 Blocks Main Thread
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `forum-client/src/lib/encryption.ts:47-69` runs 100k PBKDF2 iterations on main thread
- **Impact**: UI blocks for 100-500ms per decryption; compounds when loading private space content lists
- **Action**: Move `crypto.subtle.deriveKey` to Web Worker
- **Effort**: M

### 4. Query Parser Regex Re-compilation
- **Source**: Performance Review
- **Severity**: Medium
- **Description**: `search-client/src/lib/queryParser.ts:33-86` compiles regexes fresh on every `parseQuery()` call
- **Impact**: Wasted CPU on search-as-you-type; 5 keystrokes at 200ms debounce = 5 compilations
- **Action**: Pre-compile regexes as module-level constants
- **Effort**: S

### 5. Crypto Decryption Returns Null Without Details
- **Source**: Quality Review
- **Severity**: Medium
- **Description**: `forum-client/src/lib/encryption.ts:146-150` returns null on failure without distinguishing error types
- **Impact**: Caller cannot distinguish wrong passphrase from corrupted data from key mismatch
- **Action**: Return structured error `{ success: false, error: 'wrong_passphrase' | 'invalid_format' | 'corrupted' }`
- **Effort**: S

### 6. PoW Progress Lacks Time Estimates
- **Source**: UX Review
- **Severity**: Medium
- **Description**: Mining progress shows raw "12,345 attempts (42.3s)" instead of user-friendly estimate
- **Impact**: Users have no mental model for completion; anxiety during 60+ second waits
- **Action**: Replace with "About 30 seconds remaining" countdown based on statistical estimation
- **Effort**: S

### 7. Feed Client Placeholder Pages
- **Source**: Functionality Review, UX Review
- **Severity**: Medium
- **Description**: 7 of 10 Feed Client routes show "Coming Soon" placeholders (Saved Posts, Compose, Profile, etc.)
- **Impact**: Broken user experience; users navigate to non-functional pages
- **Action**: Either implement pages or remove from navigation until ready
- **Effort**: L (if implementing) or S (if hiding)

### 8. No Skip Links (WCAG 2.4.1)
- **Source**: Accessibility Review
- **Severity**: Medium
- **Description**: Missing "Skip to main content" links across all 8 clients
- **Impact**: Screen reader users must navigate through repeated navigation on every page
- **Action**: Add skip link at top of each client's layout component
- **Effort**: S

### 9. Analytics engagementsLast24h Not Implemented
- **Source**: Functionality Review
- **Severity**: Medium
- **Description**: `SpaceMetrics.engagementsLast24h` field always returns 0 (documented at line 377 of feature doc)
- **Impact**: Analytics dashboard shows incomplete data for space engagement metrics
- **Action**: Wire up actual engagement tracking from RPC endpoint
- **Effort**: S

### 10. IRC Requires External WebSocket Proxy
- **Source**: Functionality Review, UX Review
- **Severity**: Medium
- **Description**: `IrcConfig.proxyUrl` is required but no reference implementation or deployment guide provided
- **Impact**: IRC bridging feature inaccessible to non-technical users; browsers cannot connect directly to IRC servers
- **Action**: Provide reference proxy implementation or bundled solution with deployment documentation
- **Effort**: M

### 11. Challenge Format Discrepancy
- **Source**: Vision Review
- **Severity**: Medium
- **Description**: Feature doc specifies 82-byte challenge format while SPEC_03 §4.2 defines 75-byte canonical format
- **Impact**: Potential interoperability issues with other implementations or future node versions
- **Action**: Document canonical format; align implementation with spec or update spec
- **Effort**: S

## Quick Wins (Low Effort, High Impact)

1. **Add `lang="en"` to HTML root**: 8 one-line fixes, immediate WCAG 3.1.1 compliance - S effort
2. **Add SpamAttestation to ActionType enum**: Single line `SpamAttestation = 0x08`, type safety - S effort
3. **Pre-compile query parser regexes**: Move to module scope, compile once - S effort
4. **Add `role="alert"` to error messages**: `InviteModal.tsx:184`, `ReportModal.tsx:127` - S effort
5. **Parallelize ContentMonitor RPC calls**: Replace `for` loop with `Promise.all()` - S effort
6. **Fix InviteModal PoW bypass**: Integrate existing `useActionPow` hook - S effort
7. **Add reverse index to EchoTracker**: O(1) vs O(n) lookup improvement - S effort
8. **Consolidate duplicate hex utilities**: Single `lib/hex.ts` module from 4 duplicates - S effort
9. **Memoize PresenceContext sort**: Wrap `sortedUsers` in `useMemo` - S effort
10. **Hide Feed Client placeholder routes**: Remove from navigation until implemented - S effort

## Strengths to Preserve

- **Layered Provider Architecture**: Consistent `SwimchainProvider > RpcProvider > IdentityProvider > KeyboardNavProvider > PreferencesProvider` pattern enables knowledge transfer and maintainability across 8 clients
- **Robust Cryptographic Primitives**: Modern algorithms (AES-256-GCM, X25519, Ed25519, Argon2id) with correct parameters (100k PBKDF2 iterations, 12-byte IV, proper salt handling)
- **Deterministic DM Space IDs**: Elegant `SHA256("dm:v1:" + sorted(pk1, pk2))[0:16]` enables private conversations without central coordination
- **Advanced Search Query Parser**: Google-like syntax (`author:alice after:7d "exact phrase"`) with date parsing (ISO, relative `7d`, named `today`)
- **Counter-Attestation Pattern**: "Defend" button prevents malicious flagging abuse per SPEC_12 §3
- **Replace-In-Mempool (RIM) Support**: Full action hash computation for pending action replacement within 30-second window
- **Vim-Style Keyboard Navigation**: j/k/Enter shortcuts enable efficient power user navigation
- **Echo Prevention in Bridge**: TTL-based tracking with `markBridged()`/`wasBridgedTo()` prevents message loops
- **Multi-Layer Cache Design**: Memory + IndexedDB + localStorage separation with appropriate TTL strategies

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] **CRITICAL**: Encrypt identity seed with user passphrase before localStorage storage
- [ ] **CRITICAL**: Fix InviteModal to use actual PoW via `useActionPow` hook
- [ ] **CRITICAL**: Replace AutoEngageEngine setTimeout simulation with real PoW
- [ ] **CRITICAL**: Audit/replace X25519 modular inverse implementation
- [ ] Add `lang="en"` to all 8 client index.html files
- [ ] Add `SpamAttestation = 0x08` to ActionType enum
- [ ] Add focus trap to ReportModal, InviteModal, KeyboardShortcutsModal
- [ ] Add identity loss warning banner with forced seed export acknowledgment

### Short Term (Next 2-4 Weeks)
- [ ] Set up vitest infrastructure with CI integration
- [ ] Add tests for RPC client (connection, auth signing, error handling)
- [ ] Add tests for encryption roundtrip (encryptContent → decryptContent)
- [ ] Add tests for PoW challenge serialization (82-byte format)
- [ ] Add tests for DM space ID generation (deterministic)
- [ ] Encrypt space keys in IndexedDB with user-derived key
- [ ] Encrypt Matrix access token or move to session memory
- [ ] Parallelize ContentMonitor RPC calls with Promise.all
- [ ] Add skip links to all client layouts
- [ ] Add text labels to presence indicators (online/away/offline)
- [ ] Add heat/decay visualization badge to thread cards
- [ ] Replace PoW progress technical metrics with time estimates

### Long Term (Backlog)
- [ ] Add Web Worker for PBKDF2 key derivation
- [ ] Implement Feed Client placeholder pages or hide from nav
- [ ] Add circuit breaker pattern to RPC client with configurable threshold
- [ ] Add exponential backoff to reconnection attempts
- [ ] Implement key rotation for private spaces post-member-removal
- [ ] Add offline mode with IndexedDB caching for forum-client
- [ ] Migrate debug-dashboard from single HTML file to React components
- [ ] Provide IRC WebSocket proxy reference implementation
- [ ] Implement `engagementsLast24h` metric for analytics
- [ ] Add list virtualization for 1000+ item thread/message lists
- [ ] Add desktop notification support via Notification API
- [ ] Add WebSocket support to replace polling for real-time updates

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| InviteModal PoW bypass (`powNonce: 0`) | S | H | 1 |
| AutoEngageEngine PoW simulation (`setTimeout`) | M | H | 1 |
| Identity seed unencrypted in localStorage | M | H | 1 |
| X25519 modular inverse edge case | S | H | 1 |
| Missing test coverage (2 files / ~200 source) | L | H | 2 |
| Space keys unencrypted in IndexedDB | M | H | 2 |
| PBKDF2 main thread blocking (100-500ms) | M | M | 3 |
| ContentMonitor sequential RPC O(n) | S | M | 3 |
| EchoTracker O(n) lookup | S | M | 3 |
| Duplicate hex utilities (4+ files) | S | L | 4 |
| Query parser regex re-compilation | S | L | 4 |
| Mock data coupling in TypingContext/PresenceContext | S | L | 5 |
| Debug dashboard single-file architecture | L | L | 5 |
| No RPC versioning scheme | M | M | 4 |
| Challenge format discrepancy (82 vs 75 bytes) | S | M | 4 |
| Unbounded presence map growth | S | M | 3 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| XSS-based identity theft (localStorage) | High | Critical | Encrypt identity seed with user passphrase |
| Spam attack via InviteModal bypass | High | High | Integrate actual PoW validation |
| Content loss - broken archiver feature | Medium | High | Implement real PoW in AutoEngageEngine |
| Private space exposure via XSS | Medium | High | Encrypt space keys in IndexedDB |
| Crypto failure from X25519 bug | Low | High | Audit/replace with proven library |
| Test regression during refactor | High | Medium | Add test suite for critical paths |
| Accessibility lawsuit/complaint | Low | High | Fix WCAG AA violations |
| Performance degradation at scale | Medium | Medium | Parallelize RPC, add virtualization, WebSocket |
| User identity loss - no backup | High | High | Forced seed backup flow with acknowledgment |
| Feed Client trust erosion | Medium | Low | Hide placeholders or complete feature |
| IRC feature unusable | High | Low | Provide proxy documentation/reference impl |

## Appendix: Detailed Review Summaries

### Functionality (83/100)
Core functionality is robust with strong cryptographic foundations and innovative features. All 8 clients share consistent provider-based architecture with well-designed WASM integration. Strengths include deterministic DM space IDs, Google-like search syntax, and echo prevention for bridging.

**Critical gaps:**
- InviteModal bypasses PoW entirely (`powNonce: 0`, line 86-97)
- AutoEngageEngine simulates engagement with `setTimeout` (line 141-149)
- ActionType enum missing `SpamAttestation = 0x08`
- Feed Client has 7/10 placeholder routes
- IRC requires external WebSocket proxy with no reference implementation
- `engagementsLast24h` always returns 0

**Minor issues:**
- Duplicate `hexToBytes`/`bytesToHex` in 4+ files
- DM space name shows truncated hex instead of display names
- Query parser `parseComparison()` ignores operator type (>/<)

### Performance (75/100)
Sound caching architecture with memory + IndexedDB + localStorage layers and appropriate TTL strategies. PoW mining intentionally CPU-intensive per design.

**Bottlenecks identified:**
- ContentMonitor sequential RPC calls: O(s×c) where s=spaces, c=content
- MetricsCollector nested loops: O(s×c) for network stats
- PBKDF2 100k iterations blocks main thread 100-500ms
- EchoTracker `wasBridgedTo()` full map scan: O(n)
- Query parser compiles regexes on every call

**Scalability concerns:**
- Polling architecture (30-60s intervals) vs WebSocket
- Unbounded presence map growth without eviction
- No list virtualization for large datasets
- Single-thread crypto operations compound

**Memory estimates:**
- Typical: 50-100MB (React + WASM + cache)
- Heavy usage: 200-300MB with 1000+ cached items

### Vision Alignment (83/100)
Strong alignment with Swimchain's core principles: decentralization, PoW friction, organic moderation, identity-as-keypair, and fork-as-exit.

**Correctly implements:**
- Configurable RPC endpoints (fork-as-exit preserved)
- Ed25519 keypairs with no recovery path (by design)
- Argon2id PoW with proper memory-hard parameters
- X25519 + AES-256-GCM for privacy
- Counter-attestation pattern (SPEC_12 §3)
- Decay constants (HALF_LIFE, DECAY_FLOOR, DECAY_THRESHOLD)

**Vision violations:**
- InviteModal bypasses PoW (violates SPEC_03 §1.1)
- AutoEngageEngine simulation (violates SPEC_03 §7)
- No Resident-level check before spam attestation UI (SPEC_12 §2.1.2)

**Spec deviations:**
- Challenge size: 82 bytes documented vs 75 bytes in SPEC_03
- SpamAttestation (0x08) missing from ActionType enum

### User Experience (67/100)
Functional but unpolished. Shared architecture creates learnable system across 8 clients. Vim shortcuts delight power users.

**Critical friction:**
- Identity loss is irreversible with inadequate warning
- PoW shows raw technical metrics ("12,345 attempts") not time estimates
- 64-character hex required for DM initiation
- Feed Client presents broken placeholder pages

**Positive elements:**
- Vim-style j/k/Enter navigation
- 3D mining cube animation
- Counter-attestation "Defend" button
- Deterministic DM space IDs
- Image compression prompt with clear choice
- Encryption toggle with passphrase generator

**Missing features:**
- No decay visualization (heat meter)
- Keyboard shortcuts undiscoverable until `?` pressed
- Engage shortcuts (e/E) non-functional (TODO in code)

### Accessibility (62/100)
Foundational awareness with semantic HTML, ARIA attributes on key components, and keyboard shortcut support.

**WCAG violations:**
- 2.1.2 No Keyboard Trap: Modals lack focus trapping
- 3.1.1 Language of Page: Missing `lang="en"`
- 2.1.1 Keyboard: Emoji picker requires mouse
- 1.4.1 Use of Color: Presence and heat indicators color-only
- 2.4.1 Bypass Blocks: No skip links
- 4.1.3 Status Messages: PoW progress not announced

**Positive elements:**
- `role="progressbar"` with aria-valuenow on PoW progress
- `aria-hidden="true"` on decorative mining cube
- `autoFocus` on modal close buttons
- `.visually-hidden` class defined (chat-client)

### Quality (45/100)
Good code organization with consistent provider architecture. Critical test deficiency.

**Test coverage:**
- Only 2 test files exist: `time.test.ts`, `types.test.ts`
- Zero tests for: RPC client, encryption, PoW, hooks, components, services

**Missing tests for critical paths:**
- RPC authentication flow
- Encryption/decryption roundtrip
- PoW challenge serialization
- DM space ID generation
- X25519 key derivation
- ContentMonitor survival calculation

**Error handling issues:**
- Crypto decryption returns null without error type
- RPC signature auth failure silently falls through
- localStorage failures swallowed
- WebSocket JSON parse without try-catch
- No timeout on ContentMonitor RPC calls

**Reliability concerns:**
- Race conditions in BridgeEngine and AutoEngageEngine
- No circuit breaker for failing endpoints
- No exponential backoff on reconnect
- Unbounded state growth

### Security (62/100)
Modern cryptographic primitives correctly implemented. Critical key storage vulnerabilities.

**Critical vulnerabilities:**
- Private key plaintext in localStorage (XSS → identity theft)
- InviteModal PoW bypass (spam attacks)
- AutoEngageEngine fake PoW (feature non-functional)
- X25519 modular inverse edge case bug

**High severity:**
- Space keys unencrypted in IndexedDB
- Matrix access token unencrypted
- 1-second timestamp replay window

**Positive security:**
- AES-256-GCM with 12-byte random IV
- X25519 for key exchange
- Ed25519 for signatures
- Argon2id for PoW
- 100k PBKDF2 iterations
- Rate limiting in bridge client

---

*Review synthesized from 7 expert perspectives: Functionality, Performance, Vision Alignment, User Experience, Accessibility, Quality, and Security. Prioritization based on severity × impact × effort considerations.*

*Area Owner: Client Applications Team (forum-client/, chat-client/, search-client/, feed-client/, analytics-client/, archiver-client/, bridge-client/, debug-dashboard/)*
