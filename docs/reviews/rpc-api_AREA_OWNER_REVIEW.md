# Area Owner Review: RPC API

**Generated**: 2026-01-13
**Overall Health Score**: 76/100
**Status**: Needs Attention

---

## Executive Summary

The RPC API is a functional, well-architected JSON-RPC 2.0 interface with 60+ methods, comprehensive three-tier authentication, and strong anti-spam measures via Argon2id PoW validation. However, four critical gaps require immediate attention: **documentation claims non-existent features** (WebSocket, event broadcasting), **rate limiting is only partially implemented** (abuse risk), **no health check endpoint** (operations/monitoring gap), and **integration tests are severely lacking** (2 test files for 60+ methods). Performance bottlenecks exist in list/search operations (O(n) full-table scans), and the polling-only design creates bandwidth waste. Addressing the critical issues and implementing HTTP keep-alive plus response compression would significantly improve the feature's operational readiness.

---

## Health Dashboard

| Perspective | Score | Status |
|-------------|-------|--------|
| Functionality | 82/100 | 🟢 |
| Performance | 68/100 | 🟡 |
| Vision Alignment | 85/100 | 🟢 |
| User Experience | 75/100 | 🟡 |
| Accessibility | 70/100 | 🟡 |
| Quality | 72/100 | 🟡 |
| Security | 78/100 | 🟡 |
| **Overall** | **76/100** | 🟡 |

Legend: 🟢 80+ | 🟡 50-79 | 🔴 <50

---

## Critical Issues (Must Address)

### 1. Documentation Claims Non-Existent Features
- **Source**: Vision Alignment, Functionality reviews
- **Severity**: Critical
- **Description**: MASTER_FEATURES.md (Section 12) claims "Event Broadcasting: Complete" and mentions WebSocket support, but the actual implementation is HTTP-only with no real-time events. Feature doc references non-existent files `rpc/pow.rs` and `rpc/events.rs`.
- **Impact**: Developers building against documented features discover they don't exist. Creates trust issues and wasted integration effort.
- **Action**: Update MASTER_FEATURES.md to mark Event Broadcasting as "Planned", remove WebSocket claims, and fix file references.
- **Effort**: S
- **Location**: `docs/MASTER_FEATURES.md:652-658`, `docs/features/rpc-api_FEATURE_DOC.md:853-857`

### 2. Rate Limiting Only Partially Implemented
- **Source**: Security, Functionality, Performance reviews
- **Severity**: Critical
- **Description**: Only spam attestation methods have rate limiting. All other 57+ methods have no protection against abuse or resource exhaustion.
- **Impact**: Attackers can flood node with expensive operations (search, list queries), causing DoS. Authentication failures can be brute-forced without throttling.
- **Action**: Implement per-method rate limiting (100 reads/min, 20 writes/min) and auth failure lockout (10 failures = 5-minute lockout).
- **Effort**: M
- **Location**: `src/rpc/server.rs`, `src/rpc/methods.rs`

### 3. No Health Check Endpoint
- **Source**: Quality, Performance reviews
- **Severity**: Critical
- **Description**: No dedicated health check endpoint for load balancer integration or monitoring systems. Checking health requires authenticated `get_info` call.
- **Impact**: Cannot integrate with standard infrastructure monitoring (Kubernetes probes, HAProxy, etc.). Load balancers cannot efficiently check node health.
- **Action**: Add unauthenticated `/health` HTTP endpoint returning `{ "status": "ok", "version": "0.1.0" }`.
- **Effort**: S
- **Location**: `src/rpc/server.rs`

### 4. Integration Tests Severely Lacking
- **Source**: Quality, Security reviews
- **Severity**: Critical
- **Description**: Only 2 test files exist (`rpc_pow_validation.rs`, `spam_attestation_rpc.rs`) for 60+ RPC methods. No integration tests for any authentication method at HTTP level.
- **Impact**: Auth bypass vulnerabilities could go undetected. Regression risk for security-critical code paths. No confidence in correctness.
- **Action**: Add integration tests for: all 3 auth methods, common method workflows, error handling, concurrent requests.
- **Effort**: M
- **Location**: `tests/rpc_*`

---

## High Priority Issues

### 1. No Real-Time Event Support
- **Source**: Performance, UX reviews
- **Severity**: High
- **Description**: Clients must poll for updates. No WebSocket, SSE, or long-polling support.
- **Impact**: A frontend polling every second creates 86,400 requests/day per client. High bandwidth waste, poor UX for real-time features.
- **Action**: Design and implement WebSocket or SSE transport for event subscriptions (new content, sync status, peer changes).
- **Effort**: L
- **Location**: `src/rpc/server.rs`, new `src/rpc/events.rs`

### 2. Single TCP Connection Per Request
- **Source**: Performance review
- **Severity**: High
- **Description**: RPC client creates new TCP connection per request. No HTTP keep-alive or connection pooling.
- **Impact**: ~100-200ms overhead per request. For 10 sequential requests = 1-2 seconds of pure overhead.
- **Action**: Enable HTTP/1.1 keep-alive by default. Document connection reuse in client.
- **Effort**: S
- **Location**: `src/rpc/client.rs:144-157`, `src/rpc/server.rs`

### 3. Non-Constant-Time Credential Comparison
- **Source**: Security review
- **Severity**: High
- **Description**: Credential and cookie comparisons use `==` operator, which is timing-vulnerable.
- **Impact**: Theoretical credential recovery via timing attack with statistical analysis.
- **Action**: Use `subtle::ConstantTimeEq` for credential comparison in `auth.rs:199` and `auth.rs:207-210`.
- **Effort**: S
- **Location**: `src/rpc/auth.rs:199, 207-210`

### 4. No TLS Support for Remote Deployment
- **Source**: Security review
- **Severity**: High
- **Description**: No TLS support documented. Binding to non-localhost exposes credentials over plaintext HTTP.
- **Impact**: Authentication tokens stolen via network sniffing when RPC exposed beyond localhost.
- **Action**: Add TLS configuration option with certificate path settings. Reject non-localhost binding without TLS.
- **Effort**: M
- **Location**: `src/rpc/server.rs`, `src/rpc/types.rs`

### 5. No TypeScript Definitions
- **Source**: UX review
- **Severity**: High
- **Description**: No TypeScript type definitions for 60+ RPC request/response structures.
- **Impact**: Frontend developers must manually type or use `any`, leading to runtime errors and poor DX.
- **Action**: Generate TypeScript definitions from Rust types. Publish as `@swimchain/rpc-types`.
- **Effort**: M
- **Location**: New package, or `swimchain-react/src/types/`

### 6. No Response Compression
- **Source**: Performance review
- **Severity**: High
- **Description**: Large list responses returned uncompressed. No gzip/deflate support.
- **Impact**: 3-5x more bandwidth for large JSON responses. Slower load times on mobile networks.
- **Action**: Add Accept-Encoding/Content-Encoding support for gzip on responses >1KB.
- **Effort**: S
- **Location**: `src/rpc/server.rs:395-403`

---

## Medium Priority Issues

### 1. Deprecated Methods Return Confusing Data
- **Source**: Functionality, UX, Vision reviews
- **Severity**: Medium
- **Description**: `get_identity_level` returns placeholder values. Pool methods are deprecated but documented as working.
- **Impact**: Client developers write code against deprecated features. Placeholder data causes incorrect UI display.
- **Action**: Add deprecation warnings in responses. Plan removal timeline. Update documentation with DEPRECATED labels.
- **Effort**: S
- **Location**: `src/rpc/methods.rs`, feature doc

### 2. Input Validation Limits Undocumented
- **Source**: Security review
- **Severity**: Medium
- **Description**: String length limits, integer bounds, and allowed characters not documented for any parameters.
- **Impact**: Potential for injection attacks, buffer issues, or undefined behavior with edge-case inputs.
- **Action**: Document validation rules (max title 256, max body 4096, etc.) and implement server-side validation.
- **Effort**: M
- **Location**: `docs/features/rpc-api_FEATURE_DOC.md`, `src/rpc/methods.rs`

### 3. Signature Replay Within 1-Hour Window
- **Source**: Security, Vision reviews
- **Severity**: Medium
- **Description**: 1-hour timestamp tolerance allows signature replay within window. No nonce tracking.
- **Impact**: Intercepted signed request can be replayed within 1 hour.
- **Action**: Implement request nonce tracking per identity, or reduce tolerance to 5 minutes.
- **Effort**: M
- **Location**: `src/rpc/auth.rs:261-275`

### 4. ASCII Art Diagram Inaccessible
- **Source**: Accessibility review
- **Severity**: Medium
- **Description**: Architecture diagram uses ASCII art which screen readers cannot interpret.
- **Impact**: Visually impaired developers cannot understand system architecture.
- **Action**: Add text description below diagram explaining architecture components.
- **Effort**: S
- **Location**: `docs/features/rpc-api_FEATURE_DOC.md:23-61`

### 5. No Getting Started Guide
- **Source**: UX review
- **Severity**: Medium
- **Description**: 60+ methods with no quick-start guide. Developers must read 879 lines of documentation.
- **Impact**: Higher barrier to entry, slower developer onboarding.
- **Action**: Create "RPC API in 5 Minutes" section with 5 common workflows and copy-paste examples.
- **Effort**: S
- **Location**: `docs/features/rpc-api_FEATURE_DOC.md`

### 6. Debug Logging Leaks Authentication Data
- **Source**: Security review
- **Severity**: Medium
- **Description**: Signature prefixes logged in debug mode. May reveal credential patterns.
- **Impact**: Log access reveals partial authentication data useful for targeted attacks.
- **Action**: Log only presence/absence of auth headers, never values.
- **Effort**: S
- **Location**: `src/rpc/server.rs:298-304`

---

## Quick Wins (Low Effort, High Impact)

1. **Fix documentation drift** - Update MASTER_FEATURES.md to reflect actual implementation - **S**
2. **Add health endpoint** - Unauthenticated `/health` for monitoring - **S**
3. **Enable HTTP keep-alive** - Dramatically reduce per-request overhead - **S**
4. **Add gzip compression** - 70% bandwidth reduction for large responses - **S**
5. **Constant-time comparisons** - Add `subtle::ConstantTimeEq` to auth.rs - **S**
6. **Add deprecation warnings** - Mark deprecated methods in responses - **S**
7. **Add text alt for diagram** - Screen reader accessibility fix - **S**
8. **Create quick-start guide** - Reduce onboarding friction - **S**

---

## Strengths to Preserve

- **Comprehensive Method Coverage**: 60+ methods cover all functional areas (node, content, identity, private spaces, sponsorship)
- **Three-Tier Authentication**: Cookie (CLI), credential (configured), signature (browser) covers all client types without forcing single approach
- **Strong Anti-Spam**: Argon2id PoW with 64 MiB memory requirement, network-adjusted difficulty, 10-minute validity window
- **Sponsorship Chain Enforcement**: Hierarchical trust model correctly implemented per SPEC_11
- **Vision Alignment**: Local-first (localhost default), identity-is-keypair (no recovery), community-driven spam attestation
- **Clean Module Separation**: server.rs, methods.rs, auth.rs, types.rs, error.rs, client.rs with clear responsibilities
- **Comprehensive Error System**: 19 error codes following JSON-RPC 2.0 with semantic meaning
- **CORS Support**: Full browser support with custom X-CS-* headers enables frontend development

---

## Action Plan for Area Owner

### Immediate (This Sprint)
- [ ] Fix MASTER_FEATURES.md documentation drift (Event Broadcasting = "Planned")
- [ ] Add `/health` endpoint for monitoring integration
- [ ] Add integration tests for cookie, credential, and signature authentication
- [ ] Implement constant-time comparison for credentials/cookies

### Short Term (Next 2-4 Weeks)
- [ ] Implement comprehensive rate limiting (per-IP and per-method)
- [ ] Enable HTTP keep-alive in server and client
- [ ] Add gzip response compression
- [ ] Generate and publish TypeScript definitions
- [ ] Create quick-start documentation guide
- [ ] Add deprecation warnings to deprecated methods

### Long Term (Backlog)
- [ ] Design WebSocket/SSE event subscription architecture
- [ ] Implement real-time event transport
- [ ] Add TLS configuration option
- [ ] Split methods.rs into domain-specific modules
- [ ] Implement request nonce tracking for replay protection
- [ ] Add full-text search index (tantivy) for O(log n) search
- [ ] Migrate to cursor-based pagination

---

## Technical Debt Inventory

| Item | Effort | Impact | Priority |
|------|--------|--------|----------|
| methods.rs domain splitting (383KB+ monolith) | M | High | 2 |
| Integration test coverage (60+ untested methods) | M | Critical | 1 |
| HashMap method dispatch (O(63) → O(1)) | S | Low | 4 |
| Error retry classification | S | Medium | 3 |
| Request correlation ID support | S | Medium | 3 |
| Deprecated method cleanup | S | Medium | 3 |
| Inconsistent content_id format | S | Low | 4 |
| Reply counting optimization (O(a²) → O(1)) | M | Medium | 3 |
| Space stats cache (list_spaces O(n) → O(1)) | M | High | 2 |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DoS via unrate-limited expensive operations | High | Medium | Implement comprehensive rate limiting |
| Credential brute force attack | Medium | High | Add auth failure rate limiting with lockout |
| Signature replay attack | Medium | Medium | Implement nonce tracking or reduce window |
| Network credential sniffing | Medium | High | Add TLS support, document security requirements |
| Test regression on security code | High | High | Add integration tests for all auth flows |
| Documentation trust erosion | Medium | Medium | Audit and fix all doc/implementation gaps |
| Regtest accidental production deployment | Low | Critical | Add startup warning banner in regtest mode |
| Memory exhaustion on large requests | Low | Medium | Enforce body size limit before full read |

---

## Appendix: Detailed Review Summaries

### Functionality (82/100) 🟢

**Strengths:**
- 60+ methods covering all functional areas with complete implementations
- Three-tier authentication following Bitcoin Core patterns
- Strong PoW validation with network-aware difficulty adjustments
- Clean module separation (server, methods, auth, types, error, client)
- Full CORS support with custom X-CS-* headers for browser clients
- Type-safe request/response definitions for all methods

**Weaknesses:**
- Deprecated features return confusing placeholder data
- No batch request support (JSON-RPC 2.0 feature)
- Missing real-time event capabilities
- Rate limiting only partial (spam attestation only)
- methods.rs is 383KB+ monolith
- No health check endpoint

### Performance (68/100) 🟡

**Strengths:**
- Async architecture (hyper/tokio) for efficient concurrent handling
- Indexed storage queries for space content
- PoW verification is constant time
- 7MB body limit prevents memory exhaustion

**Weaknesses:**
- O(n) full-table scans in `list_spaces` (4 scans), `search`
- New TCP connection per request (~100-200ms overhead)
- No response compression (3-5x bandwidth waste)
- Polling-only design creates bandwidth waste
- Reply counting can be O(a²) with large mempools

**Key Bottlenecks:**
1. `list_spaces`: 4 full-table scans - 1000 spaces becomes multi-second
2. `search`: Linear scan, no FTS index
3. Connection overhead: 100-200ms per request without keep-alive

### Vision Alignment (85/100) 🟢

**Strengths:**
- Decentralization: localhost default, each node runs own RPC server
- Identity IS keypair: No recovery mechanism (correct per vision)
- PoW anti-spam: Argon2id 64 MiB, network-adjusted difficulty
- Sponsorship chain: Hierarchical trust correctly implemented
- Privacy: Private space encryption support
- Community governance: Spam attestation system

**Concerns:**
- Documentation claims false features (WebSocket, event broadcasting)
- Signature auth has 1-hour replay window
- methods.rs is oversized monolith

### User Experience (75/100) 🟡

**Strengths:**
- Standard JSON-RPC 2.0 structure familiar to developers
- Comprehensive 19-code error system with clear names
- CLI command mapping table helps discovery
- Network-specific port defaults reduce configuration
- curl examples for testing

**Weaknesses:**
- 60+ methods with no quick-start guide
- No TypeScript definitions for frontend developers
- Deprecated features return confusing data
- No error retry classification
- PoW generation not documented
- Polling required for all updates
- Multi-call workflows for common tasks

### Accessibility (70/100) 🟡

**Strengths:**
- Structured JSON responses support programmatic AT integration
- Error codes have semantic meaning for client-side localization
- Documentation follows logical heading hierarchy
- Tables use proper headers

**Issues (WCAG Violations):**
- ASCII art diagram has no text alternative (1.1.1)
- Client dropdown not keyboard accessible (2.1.1)
- Color alone used for status indication (1.4.1)
- No language attribute on HTML elements (3.1.1)
- Error messages English-only, no i18n

### Quality & Reliability (72/100) 🟡

**Strengths:**
- Clean module separation with single responsibility
- Proper graceful shutdown with cookie cleanup
- Error types implement `thiserror::Error`
- Async architecture handles concurrent requests

**Weaknesses:**
- Only 2 test files for 60+ methods
- No authentication integration tests
- methods.rs is 383KB+ monolith
- No retry classification in errors
- Race conditions possible in block formation
- No circuit breaker for failing subsystems

### Security (78/100) 🟡

**Strengths:**
- Ed25519 signatures correctly implemented
- Argon2id PoW with 64 MiB memory (ASIC-resistant)
- Cookie file permissions 0600
- Signature timestamp bounds enforced
- PoW anti-stockpile via 10-minute validity
- Sponsorship chain enforcement on testnet/mainnet
- Blocklist checking before content storage

**Vulnerabilities:**
- Non-constant-time credential comparison (timing attack)
- Missing rate limiting on auth failures (brute force)
- No TLS support (credential sniffing)
- Debug logging leaks auth data
- Signature replay within 1-hour window
- Input validation limits undocumented

---

*Review conducted: 2026-01-13*
*Next review recommended: After Critical issues addressed*
*Reviewers: Multi-perspective automated review (Functionality, Performance, Vision, UX, Accessibility, Quality, Security)*
