# Security Review: Desktop Platform

## Summary

The Desktop Platform has a **moderate security posture** with several concerning gaps. While cryptographic primitives appear to be used correctly (Ed25519 keys, SHA256 hashing, proper cookie-based authentication), the application has multiple vulnerabilities: Content Security Policy (CSP) is disabled, iframe communication uses unrestricted `postMessage` with `*` origin, the sandbox attribute allows `same-origin` (defeating sandbox protections), and there's no validation of postMessage origins in client apps. Password handling via environment variables is acceptable but cookie file permissions and timing-safe comparisons are not verified.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 18 | 25 | Cookie auth good; no origin validation on postMessage |
| Crypto Correctness | 21 | 25 | Ed25519 + SHA256 correct; no key derivation verification |
| Input Validation | 14 | 25 | Basic form validation; no sanitization, no bounds on many inputs |
| Data Protection | 15 | 25 | Keys encrypted at rest; CSP disabled, postMessage leaks credentials |
| **Total** | 68 | 100 | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Malicious iframe injection | Medium | High | CSP disabled - NOT mitigated |
| postMessage credential theft | Medium | High | `*` origin - NOT mitigated |
| Cookie file read by other apps | Low | Medium | File permissions (OS-dependent) |
| Password brute force | Low | Medium | 8-char minimum, encrypted storage |
| Process injection via env vars | Low | Medium | Password in env not cmdline - partial |
| XSS via embedded clients | Medium | High | sandbox allows same-origin - limited mitigation |
| Man-in-the-middle on RPC | Very Low | High | localhost-only RPC - mitigated |
| Identity file tampering | Low | Medium | Magic byte + length check - partial |

## Vulnerabilities Found

### Critical (Exploitable)

1. **Vulnerability**: Content Security Policy (CSP) Disabled
   **Location**: `src-tauri/tauri.conf.json:24-26`
   **Attack**: CSP is explicitly set to `null`, allowing arbitrary script injection, inline scripts, and loading resources from any origin
   **Impact**: XSS attacks can execute arbitrary code in the application context, steal credentials, or manipulate the UI
   **Fix**: Configure restrictive CSP:
   ```json
   "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:*"
   ```
   **CVSS**: 7.5 (High)

2. **Vulnerability**: Unrestricted postMessage Origin
   **Location**: `src/components/ClientFrame.tsx:23-27`
   **Attack**: postMessage sends RPC credentials (including auth token) with `'*'` target origin. Any page that could be loaded in the iframe could receive these credentials.
   **Impact**: Credential theft if a malicious page is loaded or if there's a navigation vulnerability
   **Fix**: Restrict to specific origin:
   ```typescript
   iframe.contentWindow?.postMessage(config, window.location.origin);
   ```
   **CVSS**: 6.5 (Medium-High)

3. **Vulnerability**: No postMessage Origin Validation
   **Location**: `forum-client/src/hooks/useParentRpcConfig.ts:25-41`
   **Attack**: The client accepts postMessage from ANY origin without validating `event.origin`. A malicious parent window could inject fake RPC config pointing to an attacker-controlled server.
   **Impact**: All RPC traffic redirected to attacker, credential theft, data manipulation
   **Fix**: Validate origin matches expected parent:
   ```typescript
   if (event.origin !== 'tauri://localhost' && event.origin !== window.location.origin) return;
   ```
   **CVSS**: 7.0 (High)

### High

1. **Vulnerability**: Sandbox with `allow-same-origin` Defeats Protection
   **Location**: `src/components/ClientFrame.tsx:65`
   **Attack**: `sandbox="allow-scripts allow-same-origin"` combination allows the iframe to remove its own sandbox attribute via DOM manipulation
   **Impact**: Full escape from sandbox, access to parent window, storage, and all browser APIs
   **Fix**: Either remove `allow-same-origin` (breaking functionality) or implement strict CSP and origin checking
   **CVSS**: 6.0 (Medium)

2. **Vulnerability**: Unsafe Process ID Cast in SIGTERM Handler
   **Location**: `src-tauri/src/node_manager.rs:148-150`
   **Attack**: `process.id().unwrap() as i32` - unwrap on Option<u32> could panic if process already exited; i32 cast is safe on most systems but technically undefined for very large PIDs
   **Impact**: Application crash during shutdown
   **Fix**: Use `if let Some(pid) = process.id()` (already done elsewhere in Drop impl)
   **CVSS**: 3.0 (Low)

### Medium

1. **Vulnerability**: No Timeout on RPC Requests
   **Location**: `src-tauri/src/node_manager.rs:192-204`
   **Attack**: HTTP request to `get_peers` has no timeout. Malicious or hung node could cause indefinite hang.
   **Impact**: UI becomes unresponsive, potential denial of service
   **Fix**: Add timeout:
   ```rust
   let client = reqwest::Client::builder()
       .timeout(Duration::from_secs(10))
       .build()?;
   ```
   **CVSS**: 4.0 (Medium)

2. **Vulnerability**: Password in React State Not Cleared
   **Location**: `src/App.tsx:43-44`
   **Attack**: Password stored in React state remains in memory. If application is debugged or memory is dumped, password could be recovered.
   **Impact**: Password disclosure
   **Fix**: Clear password state immediately after use:
   ```typescript
   setPassword('');
   setConfirmPassword('');
   ```
   **CVSS**: 3.5 (Low-Medium)

3. **Vulnerability**: Identity File Magic Bytes Only Validation
   **Location**: `src-tauri/src/main.rs:82-88`
   **Attack**: Only checks `CSID` magic and minimum length of 37 bytes. No checksum or integrity verification.
   **Impact**: Corrupted identity file could cause unexpected behavior, potential crash or malformed address derivation
   **Fix**: Add checksum verification of identity file, or catch and handle all parsing errors gracefully
   **CVSS**: 3.5 (Low-Medium)

4. **Vulnerability**: Cookie File Race Condition
   **Location**: `src-tauri/src/main.rs:51-58`
   **Attack**: Cookie file checked for existence then read in two operations. File could be modified between check and read.
   **Impact**: Denial of service or use of stale/incorrect auth
   **Fix**: Single atomic read operation with error handling, no existence check:
   ```rust
   let cookie = std::fs::read_to_string(&cookie_path)
       .map_err(|_| "Cookie file not found or unreadable")?;
   ```
   **CVSS**: 2.5 (Low)

### Low

1. **Vulnerability**: Hardcoded Network Selection
   **Location**: `src-tauri/src/main.rs:204`
   **Attack**: Network hardcoded to `"testnet"`. User cannot switch networks without rebuilding.
   **Impact**: Limited flexibility, potential for confusion between environments
   **Fix**: Add network selection UI or config file
   **CVSS**: 1.0 (Info)

2. **Vulnerability**: No Rate Limiting on Password Attempts
   **Location**: `src/App.tsx:88-102`
   **Attack**: No rate limiting or lockout on failed password attempts
   **Impact**: Brute force attacks on password (though key derivation should be slow)
   **Fix**: Implement exponential backoff after failed attempts
   **CVSS**: 2.5 (Low)

3. **Vulnerability**: Verbose Error Messages
   **Location**: `src-tauri/src/main.rs:144-146`
   **Attack**: Full stderr/stdout exposed to user on identity creation failure
   **Impact**: Information disclosure about system paths, binary behavior
   **Fix**: Sanitize error messages before displaying
   **CVSS**: 2.0 (Low)

## Cryptographic Assessment

### Algorithms Used
| Algorithm | Usage | Assessment |
|-----------|-------|------------|
| Ed25519 | Identity keypairs | Correct - modern, secure |
| SHA256 | Address derivation from pubkey | Correct - appropriate for this use |
| Base64 | Auth header encoding | Correct - standard HTTP Basic |
| AES-GCM (assumed) | Identity file encryption | Not verified - relies on CLI |

### Key Management
- **Private keys**: Encrypted at rest in `identity.enc` file
- **Password handling**: Via environment variable (not command line) - acceptable
- **Key derivation**: Delegated to CLI binary - not verified in desktop code
- **Key material in memory**: Password kept in React state longer than necessary

### Random Number Generation
- **Identity creation**: Delegated to CLI binary using `sw identity create`
- **Desktop app**: No direct RNG usage observed

### Nonce Handling
- **Cookie auth**: Node generates cookie, desktop reads - no nonce needed
- **No explicit nonces** in desktop code

## Attack Surface

### External Inputs
| Input | Source | Validation |
|-------|--------|------------|
| Password | User form | Length >= 8 characters only |
| Display name | User form | Length >= 1 character only |
| Client selection | Dropdown | Enum validation implicit |
| postMessage data | Parent/child frames | **NONE - Critical gap** |
| Cookie file | Filesystem | Existence check, trim only |
| Identity file | Filesystem | Magic bytes + length only |
| RPC responses | Node process | JSON parse only |

### Trust Boundaries
```
┌─────────────────────────────────────────────────────────────┐
│                      TRUSTED ZONE                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Tauri Rust Backend                                      │ │
│  │ - NodeManager                                           │ │
│  │ - File operations                                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                │
│                     invoke/IPC                              │
│                            ▼                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ React Frontend (webview)                                │ │
│  │ - App state machine                                     │ │
│  │ - Password in memory                                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                      postMessage (*)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   SEMI-TRUSTED ZONE                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Embedded Client iframes (forum, chat, etc.)             │ │
│  │ - Receives RPC credentials                              │ │
│  │ - sandbox="allow-scripts allow-same-origin" ⚠️         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                     HTTP (localhost)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      TRUSTED ZONE                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Local Node Process (sw binary)                          │ │
│  │ - Cookie authentication                                 │ │
│  │ - JSON-RPC interface                                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Privileged Operations
| Operation | Access Control | Risk |
|-----------|----------------|------|
| Identity creation | Password only | Medium - creates signing keys |
| Node start | Password only | Low - local process |
| Node stop | None (window close) | Low - graceful shutdown |
| RPC requests | Cookie auth | Low - localhost only |
| File read (identity.enc) | OS permissions | Medium - contains keys |
| File read (.cookie) | OS permissions | Medium - auth credential |

## Recommendations

### Priority 1 - Critical (Immediate Fix Required)

1. **Enable Content Security Policy**
   ```json
   "csp": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:*; img-src 'self' data: blob:"
   ```

2. **Add postMessage Origin Validation in Clients**
   ```typescript
   window.addEventListener('message', (event) => {
     // Validate origin - tauri uses tauri:// scheme
     const validOrigins = ['tauri://localhost', window.location.origin];
     if (!validOrigins.includes(event.origin)) {
       console.warn('Rejected message from untrusted origin:', event.origin);
       return;
     }
     // ... rest of handler
   });
   ```

3. **Restrict postMessage Target Origin**
   ```typescript
   // In ClientFrame.tsx, specify exact origin instead of '*'
   iframe.contentWindow?.postMessage(config, window.location.origin);
   ```

### Priority 2 - High (Fix Soon)

4. **Clear Password from State After Use**
   ```typescript
   // In handleUnlock and handleCreateIdentity
   setPassword('');
   setConfirmPassword('');
   ```

5. **Add RPC Request Timeout**
   ```rust
   let client = reqwest::Client::builder()
       .timeout(Duration::from_secs(10))
       .build()?;
   ```

6. **Fix unsafe unwrap in SIGTERM**
   ```rust
   if let Some(pid) = process.id() {
       unsafe { libc::kill(pid as i32, libc::SIGTERM); }
   }
   ```

### Priority 3 - Medium (Plan for Next Release)

7. **Add password attempt rate limiting** - Exponential backoff after 3 failures
8. **Implement identity file checksum** - Add integrity verification
9. **Sanitize error messages** - Remove system paths and internal details
10. **Remove `allow-same-origin` from sandbox** - Or implement compensating controls

## Security Best Practices Check

- [x] No hardcoded secrets
- [ ] Timing-safe comparisons (not verified in cookie comparison)
- [ ] Secure defaults (CSP disabled)
- [x] Principle of least privilege (Tauri commands are minimal)
- [ ] Input validation (postMessage has none)
- [x] Encrypted at rest (identity.enc encrypted)
- [x] No credentials in logs (password via env, not logged)
- [ ] Origin validation (postMessage uses '*')
- [x] Cookie-based auth (proper implementation)
- [x] Localhost-only RPC (no network exposure)

## Swimchain-Specific Security

### PoW Validation
- **Not implemented in desktop app** - Delegated to embedded node and client apps
- Desktop app only manages lifecycle, doesn't validate content

### Signature Verification
- **Not implemented in desktop app** - Desktop doesn't process actions
- Relies on node for all signature verification

### Spam Attestation
- **Not applicable** - Desktop is just a shell for node + clients

### Private Space Encryption
- **Not implemented in desktop app** - Handled by clients (forum-client, etc.)
- Desktop passes RPC config but doesn't handle encryption

### Identity Key Protection
- **Partially implemented**:
  - Keys encrypted at rest in identity.enc
  - Password via environment variable (acceptable)
  - Password in React state too long (should clear immediately)
  - No HSM/secure enclave support (expected for v0.1)

---

*Review conducted: 2026-01-12*
*Reviewer: Security Review Agent*
*Code version: Based on main branch*
