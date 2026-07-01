# Security Review: Analytics Client

## Summary

The Analytics Client is a **read-only monitoring dashboard** with a minimal attack surface. Its design philosophy of "observe without modify" significantly limits security risks. No cryptographic operations occur (no signing, no key management), and no authentication is required. The primary security concerns are: hard-coded RPC endpoint preventing HTTPS usage in production, missing RPC response validation, and potential information disclosure through localStorage. Overall security posture is **good** for a read-only client, with moderate improvements needed before production deployment.

## Scores

| Area | Score | Max | Notes |
|------|-------|-----|-------|
| Auth & Authz | 22 | 25 | Read-only design negates most auth concerns; no auth required appropriately |
| Crypto Correctness | 23 | 25 | No crypto operations; WASM headers correct for isolation |
| Input Validation | 17 | 25 | URL encoding present; missing response schema validation |
| Data Protection | 18 | 25 | No sensitive data; localStorage config visible; no HTTPS enforcement |
| **Total** | **80** | **100** | |

## Threat Model

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Malicious RPC Node Response | Medium | Medium | **Gap**: No response schema validation; attacker-controlled node could inject malformed data |
| XSS via Space/Content Names | Low | Medium | **Mitigated**: React JSX escaping; no `dangerouslySetInnerHTML` |
| Man-in-the-Middle on HTTP | Medium | Low | **Gap**: Hard-coded HTTP localhost; no HTTPS option configured |
| localStorage Config Tampering | Low | Low | **Partial**: Config validated at load but no integrity check |
| DoS via Polling Flood | Low | Low | **Gap**: No rate limiting on RPC calls |
| Information Disclosure | Low | Low | **Accepted**: Analytics data is inherently public network state |
| Prototype Pollution | Very Low | High | **Mitigated**: TypeScript strict mode; no dynamic property access |
| ReDoS in Input Processing | Very Low | Medium | **Mitigated**: No regex on user input; ID validation is simple string ops |

## Vulnerabilities Found

### Critical (Exploitable)
*None identified*

### High

1. **Vulnerability**: No RPC Response Schema Validation
   **Location**: `analytics-client/src/lib/rpc.ts:131-165`
   **Attack**: A malicious or compromised Swimchain node could return malformed JSON that doesn't match expected types. Since TypeScript types are erased at runtime, the client will process arbitrary data.
   ```typescript
   // Current code trusts response shape completely
   async getSyncStatus(): Promise<SyncStatus> {
     const response = await fetch(`${this.baseUrl}/sync/status`);
     return response.json();  // No validation
   }
   ```
   **Impact**: Could cause runtime exceptions, incorrect health calculations, or render unexpected content if node returns crafted payloads.
   **Fix**: Add runtime schema validation using Zod or similar:
   ```typescript
   import { z } from 'zod';
   const SyncStatusSchema = z.object({
     chain_percent: z.number(),
     peer_count: z.number(),
     // ... other fields
   });
   return SyncStatusSchema.parse(await response.json());
   ```
   **CVSS**: 5.3 (Medium)

### Medium

1. **Vulnerability**: Hard-coded HTTP Endpoint Prevents HTTPS
   **Location**: `analytics-client/src/lib/rpc.ts:16-20`
   ```typescript
   export const LOCAL_CONFIG: RpcConfig = {
     host: 'localhost',
     port: 3030,
     protocol: 'http',  // Hard-coded, not configurable
   };
   ```
   **Attack**: In production deployments where analytics client connects to remote nodes, traffic is unencrypted, enabling MitM attacks to observe or modify responses.
   **Impact**: An attacker on the network path could inject false health metrics, trigger misleading alerts, or harvest network topology information.
   **Fix**: Use environment variables as documented:
   ```typescript
   const config: RpcConfig = {
     host: import.meta.env.VITE_RPC_HOST || 'localhost',
     port: parseInt(import.meta.env.VITE_RPC_PORT || '3030'),
     protocol: (import.meta.env.VITE_RPC_PROTOCOL as 'http' | 'https') || 'http',
   };
   ```
   **CVSS**: 4.3 (Medium)

2. **Vulnerability**: No Fetch Timeout / AbortController
   **Location**: `analytics-client/src/lib/rpc.ts:93-112` (all fetch calls)
   ```typescript
   async connect(): Promise<boolean> {
     const response = await fetch(`${this.baseUrl}/info`);  // No timeout
     // ...
   }
   ```
   **Attack**: A slow-loris style attack or unresponsive node causes the fetch to hang indefinitely, blocking the MetricsCollector polling loop.
   **Impact**: Denial of service for the analytics UI; user sees stale/frozen data with no indication of failure.
   **Fix**: Add AbortController with timeout:
   ```typescript
   async connect(): Promise<boolean> {
     const controller = new AbortController();
     const timeoutId = setTimeout(() => controller.abort(), 10000);
     try {
       const response = await fetch(`${this.baseUrl}/info`, {
         signal: controller.signal,
       });
       // ...
     } finally {
       clearTimeout(timeoutId);
     }
   }
   ```
   **CVSS**: 4.0 (Medium)

3. **Vulnerability**: localStorage Data Not Validated on Load
   **Location**: `analytics-client/src/services/MetricsCollector.ts:95-108`
   ```typescript
   private loadHistory(): HealthHistoryPoint[] {
     try {
       const stored = localStorage.getItem(STORAGE_KEY_HISTORY);
       if (stored) {
         const data = JSON.parse(stored);
         return data.map((p: Record<string, unknown>) => ({  // Weak typing
           ...p,
           timestamp: new Date(p.timestamp as string),
         }));
       }
     } catch (e) {
       console.error('Failed to load history:', e);
     }
     return [];
   }
   ```
   **Attack**: An attacker with access to the user's browser (XSS elsewhere, physical access, browser extension) could inject malformed history data that causes rendering issues or calculation errors.
   **Impact**: Low - only affects local user, but could cause confusing UI behavior or NaN values in charts.
   **Fix**: Add schema validation on localStorage load:
   ```typescript
   const HistoryPointSchema = z.object({
     timestamp: z.string().datetime(),
     score: z.number().min(0).max(100),
     activeSwimmers: z.number().min(0),
     postsAtRisk: z.number().min(0),
     avgHeat: z.number().min(0).max(100),
   });
   ```
   **CVSS**: 3.3 (Low)

### Low

1. **Vulnerability**: No Content Security Policy
   **Location**: Missing from `index.html` and `vite.config.ts`
   **Attack**: If an XSS vulnerability is introduced (e.g., through a dependency), there's no CSP to limit damage.
   **Impact**: Reduced defense-in-depth; XSS would have full page access.
   **Fix**: Add CSP meta tag or headers:
   ```html
   <meta http-equiv="Content-Security-Policy"
         content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://localhost:* https://*;">
   ```
   **CVSS**: 2.0 (Low)

2. **Vulnerability**: Unbounded Alert Array (Memory Exhaustion)
   **Location**: `analytics-client/src/services/MetricsCollector.ts:340-348`
   ```typescript
   for (const alert of newAlerts) {
     if (!isDuplicate) {
       this.alerts.push(alert);  // No upper bound
       // ...
     }
   }
   ```
   **Attack**: Over extended operation, alert array grows unbounded (one alert per type per poll if conditions persist).
   **Impact**: Memory exhaustion in long-running sessions; browser tab crash.
   **Fix**: Implement FIFO eviction:
   ```typescript
   const MAX_ALERTS = 100;
   if (this.alerts.length >= MAX_ALERTS) {
     this.alerts = this.alerts.slice(-MAX_ALERTS + 1);
   }
   ```
   **CVSS**: 2.4 (Low)

3. **Vulnerability**: Error Messages May Leak Internal Details
   **Location**: Multiple catch blocks expose raw error messages:
   ```typescript
   // src/hooks/useRpc.tsx:64-66
   setError(err instanceof Error ? err.message : 'Unknown error');
   ```
   **Attack**: Detailed error messages from RPC could reveal internal server paths, versions, or configurations.
   **Impact**: Information disclosure to assist further attacks.
   **Fix**: Use generic user-facing messages; log detailed errors to console:
   ```typescript
   console.error('[RPC] Connection error:', err);
   setError('Unable to connect to Swimchain node');
   ```
   **CVSS**: 2.0 (Low)

## Cryptographic Assessment

### Algorithms Used
- **None in application code**: The analytics client performs no cryptographic operations.
- **WASM Isolation**: Correct Cross-Origin headers configured for WASM:
  ```typescript
  // vite.config.ts
  'Cross-Origin-Opener-Policy': 'same-origin'
  'Cross-Origin-Embedder-Policy': 'require-corp'
  ```

### Key Management
- **Not applicable**: No private keys are handled or stored.
- No identity operations or signing.
- No encrypted content decryption.

### Random Number Generation
- **Not applicable**: No random number generation for security purposes.
- `alertIdCounter` is a simple incrementing counter (not security-relevant).

### Nonce Handling
- **Not applicable**: No cryptographic nonces used.

### Assessment Summary
**Cryptographic Risk: Very Low** - The read-only design eliminates cryptographic attack surface. The only crypto-adjacent code is WASM isolation headers, which are correctly configured.

## Attack Surface

### External Inputs
| Input Source | Type | Validation | Risk |
|--------------|------|------------|------|
| RPC `/info` | JSON | None (type assertion only) | Medium |
| RPC `/sync/status` | JSON | None | Medium |
| RPC `/peers` | JSON | None | Medium |
| RPC `/spaces` | JSON | None | Medium |
| RPC `/spaces/:id/content` | JSON | None | Medium |
| URL route params (`:spaceId`) | String | `encodeURIComponent` | Low |
| localStorage config | JSON | Parse only, no schema | Low |
| localStorage history | JSON | Parse only, weak typing | Low |
| User input (Settings form) | Form data | TypeScript types, bounds check on pollInterval | Low |

### Trust Boundaries
```
[Browser] <--localStorage--> [User Device Storage]
     |
     | (HTTP/HTTPS)
     v
[Swimchain Node RPC] (Trusted localhost assumption)
```

**Key Trust Assumption**: The analytics client trusts the local Swimchain node implicitly. This is reasonable for localhost deployments but breaks down for remote node connections.

### Privileged Operations
- **None**: Read-only client performs no privileged operations.
- No chain modifications
- No key access
- No authentication tokens

## Recommendations

### P0 (Critical - Before Production)

1. **Add RPC Response Validation**
   - Implement Zod schemas for all RPC response types
   - Fail gracefully with user-friendly error on schema mismatch
   - Log detailed validation errors for debugging

2. **Environment-Based RPC Configuration**
   - Use `VITE_RPC_*` environment variables
   - Default to localhost for development
   - Enable HTTPS for production deployments

3. **Add Fetch Timeouts**
   - 10-second timeout for all RPC calls
   - AbortController implementation
   - Clear timeout indication in UI

### P1 (High - Before Beta)

4. **Add Content Security Policy**
   - Restrict script sources to 'self' and WASM
   - Restrict connect-src to known RPC endpoints
   - Implement as meta tag or server headers

5. **Sanitize Error Messages**
   - Generic user-facing errors
   - Detailed logging to console
   - No internal paths or versions exposed

6. **Bound Alert Array**
   - Maximum 100 alerts
   - FIFO eviction of oldest
   - Auto-clean acknowledged alerts >24h old

### P2 (Medium - Post-Beta)

7. **Add Rate Limiting**
   - Client-side rate limiter for RPC calls
   - Exponential backoff on failures
   - Maximum 10 requests/second

8. **Validate localStorage Data**
   - Schema validation on load
   - Clear corrupted data gracefully
   - Notify user of data reset

## Security Best Practices Check

- [x] No hardcoded secrets
- [x] No private keys in code or storage
- [x] No dangerouslySetInnerHTML
- [x] URL parameters encoded (encodeURIComponent)
- [x] CORS headers for WASM isolation
- [x] TypeScript strict mode enabled
- [ ] Timing-safe comparisons (N/A - no auth)
- [ ] Secure defaults (HTTP hard-coded - should be configurable)
- [x] Principle of least privilege (read-only design)
- [ ] Response schema validation (missing)
- [ ] CSP headers (missing)
- [ ] Fetch timeouts (missing)

## Swimchain-Specific Security Analysis

### PoW Validation
- **Not applicable**: Analytics client doesn't submit actions requiring PoW.

### Signature Verification
- **Not applicable**: Analytics client only reads data; no signed actions are submitted or verified.

### Spam Attestation Thresholds
- **Observation only**: Client displays attestation metrics but doesn't participate in attestation.

### Private Space Encryption
- **Not applicable**: Analytics client only monitors public space metrics. Private spaces would require decryption keys not available to this client.

### Identity Key Protection
- **Not applicable**: No identity keys are handled. The client is anonymous/unauthenticated.

## Conclusion

The Analytics Client has a **fundamentally secure design** due to its read-only nature. The main security improvements needed are:

1. **Response validation** to defend against malicious/compromised nodes
2. **HTTPS configuration** for production deployments
3. **Fetch timeouts** to prevent hanging on unresponsive nodes

These are moderate-effort fixes that should be completed before production deployment. The overall security posture is appropriate for a monitoring dashboard that handles no sensitive data.

**Risk Rating: Low-Medium**
**Deployment Recommendation: Safe for internal/beta use; address P0 items before public production deployment**

---

*Security Review Date: 2026-01-12*
*Reviewer: Security Perspective Agent*
*Next Review: Post-P0 remediation*
