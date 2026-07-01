# Security Review: Archiver Client

## Summary

The Archiver Client presents a **low-to-moderate risk profile** appropriate for a local-first, read-heavy monitoring application. The client does not handle user authentication, private keys, or signing operations - it operates purely as a passive content observer with local storage. The primary security concerns are input validation gaps in settings persistence, lack of RPC timeouts (DoS vector), and race conditions in singleton initialization. No critical exploitable vulnerabilities were identified.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 20 | 25 | No auth needed for read-only; lacks RPC auth headers |
| Crypto Correctness | 22 | 25 | No crypto operations; relies on WASM for PoW (mocked) |
| Input Validation | 17 | 25 | Gaps in settings validation, JSON parse without try/catch in some places |
| Data Protection | 23 | 25 | No secrets stored; appropriate use of localStorage/IndexedDB |
| **Total** | **82** | **100** | Low-risk client with minor gaps |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| XSS via content display | Low | Medium | Content from node is displayed as text, not HTML; React escapes by default |
| localStorage tampering | Low | Low | Config/budget tampered by local scripts; no security impact |
| RPC timeout DoS | Medium | Medium | Fetch calls have no timeout; node unavailability hangs UI |
| Race condition in singleton init | Low | Low | `getArchiveStorage()` async init can race; may init twice |
| Malicious space IDs in config | Low | Low | Space IDs not validated; could cause RPC errors |
| IndexedDB quota exhaustion | Low | Low | Quota enforced but relies on metadata accuracy |

## Vulnerabilities Found

### Critical (Exploitable)
None identified.

### High

1. **Vulnerability**: No timeout on fetch requests
   **Location**: `src/lib/rpc.ts:93-112`, all fetch calls
   **Attack**: Malicious or slow node can hang the client indefinitely
   **Impact**: UI becomes unresponsive; user must force-close application
   **Fix**: Add AbortController with 10-30 second timeout to all fetch calls
   **CVSS**: 5.3 (Medium - Availability impact)

```typescript
// Current (vulnerable)
const response = await fetch(`${this.baseUrl}/info`, {
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },
});

// Recommended fix
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);
try {
  const response = await fetch(`${this.baseUrl}/info`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}
```

### Medium

1. **Vulnerability**: Race condition in async singleton initialization
   **Location**: `src/services/ArchiveStorage.ts:406-412`
   **Attack**: Concurrent calls to `getArchiveStorage()` may initialize multiple instances
   **Impact**: Potential IndexedDB connection leaks; inconsistent state
   **Fix**: Use promise-based initialization lock
   **CVSS**: 4.0 (Medium - Integrity impact)

```typescript
// Current (vulnerable)
export async function getArchiveStorage(): Promise<ArchiveStorage> {
  if (!_instance) {
    _instance = new ArchiveStorage();
    await _instance.init();  // Race window here
  }
  return _instance;
}

// Recommended fix
let _initPromise: Promise<ArchiveStorage> | null = null;

export function getArchiveStorage(): Promise<ArchiveStorage> {
  if (!_initPromise) {
    _initPromise = (async () => {
      const instance = new ArchiveStorage();
      await instance.init();
      return instance;
    })();
  }
  return _initPromise;
}
```

2. **Vulnerability**: JSON.parse without validation in settings load
   **Location**: `src/pages/Settings.tsx:22-28`
   **Attack**: Corrupted localStorage causes crash; malformed config bypasses validation
   **Impact**: Application crash on load; invalid thresholds applied
   **Fix**: Validate parsed config against schema before use
   **CVSS**: 3.7 (Low - Availability impact)

3. **Vulnerability**: Missing bounds validation on numeric inputs
   **Location**: `src/pages/Settings.tsx:142-147, 165-170, 193-198, 215-220`
   **Attack**: User enters extreme values (e.g., NaN, Infinity, negative)
   **Impact**: Application may behave unexpectedly; division by zero possible
   **Fix**: Clamp values in handlers; validate with `Number.isFinite()`
   **CVSS**: 3.1 (Low - Integrity impact)

```typescript
// Current (vulnerable)
onChange={(e) =>
  setConfig((c) => ({
    ...c,
    minHeatBeforeArchiving: parseInt(e.target.value) / 100,
  }))
}

// Recommended fix
onChange={(e) => {
  const raw = parseInt(e.target.value, 10);
  const clamped = Math.max(1, Math.min(50, Number.isFinite(raw) ? raw : 5));
  setConfig((c) => ({ ...c, minHeatBeforeArchiving: clamped / 100 }));
}}
```

### Low

1. **Vulnerability**: Space ID input not validated
   **Location**: `src/pages/Settings.tsx:41-49`
   **Attack**: Invalid space IDs (wrong format, special characters) added to config
   **Impact**: RPC errors when monitoring invalid spaces
   **Fix**: Validate bech32m format before adding
   **CVSS**: 2.0 (Low)

2. **Vulnerability**: Error messages exposed in production
   **Location**: `src/components/ErrorBoundary.tsx:60`
   **Attack**: Error messages may reveal internal paths or stack traces
   **Impact**: Information disclosure (minor)
   **Fix**: Show generic error in production, details only in dev
   **CVSS**: 2.0 (Low)

3. **Vulnerability**: Console logging in production
   **Location**: Multiple files (AutoEngageEngine.ts:143-145, ContentMonitor.ts:111, etc.)
   **Attack**: Sensitive operation details logged to console
   **Impact**: Information disclosure via browser console
   **Fix**: Use conditional logging or remove in production builds
   **CVSS**: 1.5 (Informational)

## Cryptographic Assessment

| Aspect | Assessment |
|--------|------------|
| **Algorithms used** | None directly - PoW delegated to `@swimchain/react` WASM (currently mocked) |
| **Key management** | No keys handled - archiver is read-only |
| **Random number generation** | Not applicable |
| **Nonce handling** | Not applicable |
| **Hash usage** | Content hashes (sha256:...) are identifiers only, not verified |

**Note**: When actual PoW integration is implemented via `@swimchain/react usePow()`, the following should be verified:
- WASM PoW uses secure hash algorithms (SHA-256 or Blake3)
- Anti-stockpile validation is enforced server-side
- PoW submissions are signed (if required by protocol)

## Attack Surface

### External Inputs
| Input | Source | Validation | Risk |
|-------|--------|------------|------|
| RPC responses | localhost:3030 | None (trusted local node) | Low |
| Settings form values | User input | Partial (HTML min/max only) | Medium |
| Space IDs | User input | None (format not validated) | Low |
| Search queries | User input | Trimmed, case-normalized | Low |

### Trust Boundaries
1. **Local Node RPC** (localhost:3030) - Trusted
2. **localStorage** - Trusted (same-origin policy)
3. **IndexedDB** - Trusted (same-origin policy)
4. **User Input** - Untrusted (requires validation)

### Privileged Operations
1. **IndexedDB writes** - Quota-limited, user-controllable
2. **localStorage writes** - Standard, no sensitive data
3. **PoW computation** - CPU-intensive but capped by daily budget

## Swimchain-Specific Security Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| PoW validation (anti-stockpile) | N/A | PoW currently mocked; node validates on submission |
| Signature verification on actions | N/A | Read-only client; no action signing |
| Spam attestation thresholds | N/A | Not applicable to archiver |
| Private space encryption | N/A | Archiver monitors public spaces only |
| Identity key protection | PASS | No identity keys stored or used |

## Recommendations

### Priority 1 (High)
1. **Add fetch timeouts** - Implement AbortController with 10-30 second timeouts on all RPC calls
2. **Fix singleton race condition** - Use promise-based initialization lock for `getArchiveStorage()`

### Priority 2 (Medium)
3. **Validate parsed JSON** - Add schema validation for localStorage config loading
4. **Clamp numeric inputs** - Validate and clamp all numeric form inputs with `Number.isFinite()`
5. **Validate space ID format** - Check bech32m pattern before adding spaces

### Priority 3 (Low)
6. **Conditional logging** - Remove or gate console.log statements for production
7. **Generic error messages** - Don't expose error.message in production ErrorBoundary

## Security Best Practices Check

- [x] No hardcoded secrets
- [ ] Timing-safe comparisons (N/A - no auth comparisons)
- [x] Secure defaults (conservative budgets, no auto-actions by default)
- [x] Principle of least privilege (read-only access to node)
- [x] No innerHTML or dangerouslySetInnerHTML usage
- [x] React escapes content by default (XSS protected)
- [x] CSP compatible (no inline scripts in source)
- [ ] Input validation complete (gaps in settings)
- [ ] RPC timeout protection (missing)
- [x] No PII stored (only public content)

## Conclusion

The Archiver Client is appropriately designed as a low-privilege, local-first application. The security posture is adequate for its threat model (local browser environment, trusted node). The main areas for improvement are:

1. **Reliability** - Add timeouts to prevent UI hangs
2. **Robustness** - Fix race condition and validate inputs
3. **Production-readiness** - Clean up logging and error exposure

When actual PoW integration is implemented, a follow-up security review should verify the WASM-based cryptographic operations and any signing requirements.

---

**Reviewer**: Claude Security Reviewer
**Date**: 2026-01-12
**Scope**: archiver-client source code
**Version**: Based on CLIENT_DOC.md documentation
