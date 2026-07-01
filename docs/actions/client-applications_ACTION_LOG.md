# Action Log: Client Applications

**Generated**: 2026-01-13
**Review Source**: /mnt/c/github/swimchain/docs/reviews/client-applications_AREA_OWNER_REVIEW.md
**Overall Score**: 65/100
**Status**: Needs Attention

---

## Summary

- **Total Issues Identified**: 24 (5 CRITICAL, 8 HIGH, 11 MEDIUM)
- **Auto-fixed (S effort)**: 5
- **Already Fixed (prior to this review)**: 4
- **Flagged for Human Review (M/L effort)**: 15

---

## CRITICAL Issues (5)

### C1: Private Keys Stored in Plaintext localStorage
- **Location**: `forum-client/src/hooks/useStoredIdentity.ts:24-41`
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: M - requires passphrase flow design and migration strategy
- Scope: Significant UX implications - requires user passphrase on session start
- Risk: Breaking change for existing users; requires migration path for stored identities

#### Recommended Implementation Plan
1. Create `forum-client/src/lib/identity-encryption.ts` with:
   - `encryptSeed(seed: Uint8Array, passphrase: string): Promise<string>` using PBKDF2/Argon2id
   - `decryptSeed(encrypted: string, passphrase: string): Promise<Uint8Array>`
2. Add passphrase prompt component for session start
3. Modify `useStoredIdentity` hook to encrypt before storage and decrypt on load
4. Add migration logic to detect unencrypted legacy identities and prompt for encryption
5. Add "Forgot passphrase" flow showing seed phrase for backup

#### Files Involved
- `forum-client/src/hooks/useStoredIdentity.ts` (encrypt/decrypt on storage)
- `forum-client/src/lib/identity-encryption.ts` (new file)
- `forum-client/src/components/PassphrasePrompt.tsx` (new component)
- `forum-client/src/pages/Identity.tsx` (add migration prompt)

#### Estimated Effort
4-6 hours including UX design and migration logic

---

### C2: InviteModal PoW Bypass
- **Location**: `forum-client/src/components/InviteModal.tsx:86-97`
- **Effort**: S (marked) but actually M
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: M - requires significant component restructuring
- Scope: Requires adding mining state, progress UI, and async flow
- Risk: Changes user experience flow significantly

#### Recommended Implementation Plan
1. Import `useActionPow` hook and add to InviteModal
2. Add mining state and progress UI between form submission and API call
3. Replace placeholder `powNonce: 0, powDifficulty: 0` with actual mined solution
4. Add cancel button during mining
5. Update loading states to reflect mining vs sending

#### Files Involved
- `forum-client/src/components/InviteModal.tsx` (integrate useActionPow, add progress UI)
- `forum-client/src/hooks/useActionPow.ts` (add `mineInvite` helper function)

#### Estimated Effort
2-3 hours

---

### C3: AutoEngageEngine Simulates PoW
- **Location**: `archiver-client/src/services/AutoEngageEngine.ts:141-149`
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: M - requires integration with PoW library and RPC client
- Scope: Service-level change with async complexity
- Risk: Core archiver functionality - must work correctly

#### Recommended Implementation Plan
1. Add PoW computation import from `@swimchain/react` or local lib
2. Replace `setTimeout(resolve, 1000)` with actual `computePow()` call
3. Add RPC client reference to call `submitEngagement()`
4. Handle PoW cancellation on service stop
5. Update budget tracking to use actual PoW time

#### Files Involved
- `archiver-client/src/services/AutoEngageEngine.ts` (replace simulation)
- `archiver-client/src/lib/action-pow.ts` (may need to copy from forum-client)

#### Estimated Effort
3-4 hours

---

### C4: X25519 Modular Inverse Bug
- **Location**: `forum-client/src/lib/x25519.ts:116-128`
- **Effort**: S (marked) but should be M for proper audit
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: M - requires cryptographic audit or library replacement
- Scope: Core crypto code affecting private space security
- Risk: High - incorrect implementation could break encryption

#### Recommended Implementation Plan
1. **Option A (Preferred)**: Use `@noble/curves` internal conversion if available
2. **Option B**: Add comprehensive test suite for edge cases:
   - y = 0 (denominator = 1, should return 1)
   - y = 1 (denominator = 0, needs special handling)
   - y = p-1 (edge case near field boundary)
3. Add validation after conversion to ensure result is on curve
4. Consider using `crypto_sign_ed25519_pk_to_curve25519` from libsodium-wrappers if available

#### Files Involved
- `forum-client/src/lib/x25519.ts` (audit modInverse, add validation)
- `forum-client/src/lib/x25519.test.ts` (new test file for edge cases)

#### Estimated Effort
2-4 hours for proper cryptographic audit

---

### C5: Missing Test Coverage
- **Location**: All clients
- **Effort**: L (16+ hours)
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: L - extensive work across multiple clients
- Scope: ~200+ source files with only 2 test files
- Risk: Too large for automation

#### Recommended Implementation Plan
1. Set up vitest configuration for each client
2. Add CI integration for test runs
3. Priority test targets:
   - RPC client auth flow
   - Encryption/decryption roundtrip
   - PoW challenge serialization
   - DM space ID generation
   - X25519 key derivation

#### Estimated Effort
16+ hours for 60% coverage target

---

## HIGH Priority Issues (8)

### H1: Space Keys Stored Unencrypted in IndexedDB
- **Location**: `forum-client/src/hooks/usePrivateSpaceKeys.ts:140-147`
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

Similar to C1, requires passphrase flow integration.

---

### H2: Modal Dialogs Lack Focus Trapping (WCAG 2.1.2)
- **Location**: `ReportModal.tsx`, `InviteModal.tsx`, `KeyboardShortcutsModal`
- **Effort**: S
- **Status**: FIXED

#### Changes Made
- Added focus trapping to InviteModal following ReportModal pattern
- Added `modalRef` and `previousActiveElement` refs for focus management
- Added `getFocusableElements` callback to query focusable elements within modal
- Added useEffect for focus management (focus first element on open, restore on close)
- Added useEffect for keyboard handling (Escape to close, Tab trapping)
- Added `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` to modal div
- Added `id="invite-modal-title"` to modal header h2

#### Files Modified
- `forum-client/src/components/InviteModal.tsx:7` (added useRef, useEffect imports)
- `forum-client/src/components/InviteModal.tsx:33-93` (added focus trap logic)
- `forum-client/src/components/InviteModal.tsx:195-204` (added ref and ARIA attributes)

**Note**: ReportModal.tsx already had focus trapping (lines 41-93). KeyboardShortcutsModal should also be reviewed.

---

### H3: Missing `lang` Attribute on HTML Element (WCAG 3.1.1)
- **Location**: All 8 client index.html files
- **Effort**: S
- **Status**: ALREADY_FIXED

**Note**: All 8 client index.html files already have `lang="en"` attribute.

---

### H4: ActionType Enum Missing SpamAttestation
- **Location**: `forum-client/src/lib/action-pow.ts:16-23`
- **Effort**: S
- **Status**: FIXED

#### Changes Made
- Added `Invite = 0x07` to ActionType enum
- Added `SpamAttestation = 0x08` to ActionType enum (per SPEC_12 §3.2)
- Added corresponding entries in DIFFICULTY and TESTNET_DIFFICULTY objects
- Added type annotation `Record<ActionType, number>` to DIFFICULTY objects

#### Files Modified
- `forum-client/src/lib/action-pow.ts:16-25` (added enum values)
- `forum-client/src/lib/action-pow.ts:28-49` (added difficulty entries)

---

### H5: Emoji Picker Not Keyboard Accessible (WCAG 2.1.1)
- **Location**: `forum-client/src/components/ContentStatus.tsx:106-118`
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

Requires significant component work for arrow key navigation.

---

### H6: Color-Only Status Indicators (WCAG 1.4.1)
- **Location**: `chat-client/src/styles/globals.css:70-73`, `forum-client/src/components/UserAvatar.css:80-86`
- **Effort**: M (originally marked S, but requires component changes in 4+ files)
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: M - requires changes to 4+ component files, not just CSS
- Scope: Presence dots rendered in ThreadPanel.tsx, OnlineUsers.tsx, UserAvatar.tsx, MessageBubble.tsx
- Risk: Each component needs visually-hidden text alongside color indicator

#### Recommended Fix
Add visually-hidden `<span>` with status text ("Online", "Away", "Offline") inside each presence indicator component:
```tsx
<span className="presence-dot presence-dot--online">
  <span className="visually-hidden">Online</span>
</span>
```

#### Files Involved
- `chat-client/src/components/ThreadPanel.tsx:67`
- `chat-client/src/components/OnlineUsers.tsx:82`
- `chat-client/src/components/MessageBubble.tsx:99`
- `forum-client/src/components/UserAvatar.tsx:104`

---

### H7: Identity Loss Without Adequate Warning
- **Location**: `forum-client/src/pages/Identity.tsx:269-279`
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

Requires new UI flow design with forced seed backup.

---

### H8: Matrix Access Token Unencrypted
- **Location**: `bridge-client/src/services/BridgeEngine.ts:633` (saveConfig stores full config including accessToken)
- **Effort**: M (originally marked S, but requires encryption infrastructure)
- **Status**: NEEDS_HUMAN_REVIEW

#### Why Not Auto-Implemented
- Effort: M - requires encryption infrastructure similar to C1
- Scope: Config saved via `localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(this.config))` includes unencrypted `accessToken`
- Risk: Either encrypt token before storage OR switch to session-only memory storage

#### Recommended Fix
Option A: Encrypt accessToken field before saving config
Option B: Remove accessToken from persistent config, require re-auth on each session

#### Files Involved
- `bridge-client/src/services/BridgeEngine.ts:616-637` (loadConfig/saveConfig)
- `bridge-client/src/types/index.ts:62` (MatrixConfig.accessToken field)

---

## MEDIUM Priority Issues (11)

### M1: ContentMonitor Sequential RPC Calls
- **Location**: `archiver-client/src/services/ContentMonitor.ts:120-153`
- **Effort**: S
- **Status**: ALREADY_FIXED

**Note**: Code already uses `Promise.all()` for parallel RPC calls (line 119).

---

### M2: EchoTracker O(n) Lookup
- **Location**: `bridge-client/src/services/EchoTracker.ts:77-93`
- **Effort**: S
- **Status**: ALREADY_FIXED

**Note**: Code already has `reverseIndex` Map (line 15) for O(1) lookups in `wasBridgedTo()`.

---

### M3: PBKDF2 Blocks Main Thread
- **Location**: `forum-client/src/lib/encryption.ts:47-69`
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

Requires Web Worker implementation - significant architectural change.

---

### M4: Query Parser Regex Re-compilation
- **Location**: `search-client/src/lib/queryParser.ts:33-86`
- **Effort**: S
- **Status**: FIXED

#### Changes Made
- Pre-compiled regexes as module-level constants:
  - `PHRASE_REGEX = /"([^"]+)"/g`
  - `OPERATOR_REGEX = /(\w+):(\S+)/g`
  - `EXCLUDE_REGEX = /-(\S+)/g`
  - `OR_REGEX = /\bOR\b/gi`
  - `WHITESPACE_REGEX = /\s+/`
- Added `lastIndex = 0` reset for global regex reuse safety
- Updated all regex usages in `parseQuery()` to use pre-compiled constants

#### Files Modified
- `search-client/src/lib/queryParser.ts:20-25` (added constants)
- `search-client/src/lib/queryParser.ts:39-42` (added lastIndex resets)
- `search-client/src/lib/queryParser.ts:46-104` (updated to use constants)

---

### M5: Crypto Decryption Returns Null Without Details
- **Location**: `forum-client/src/lib/encryption.ts:146-150`
- **Effort**: S
- **Status**: NEEDS_HUMAN_REVIEW

#### Recommended Fix
Change return type to structured error:
```typescript
type DecryptResult =
  | { success: true; content: string }
  | { success: false; error: 'wrong_passphrase' | 'invalid_format' | 'corrupted' };
```

Requires updating all callers - scope creep from S to M.

---

### M6: PoW Progress Lacks Time Estimates
- **Location**: PoW progress UI components
- **Effort**: S
- **Status**: NEEDS_HUMAN_REVIEW

Requires statistical estimation logic based on difficulty and hash rate.

---

### M7: Feed Client Placeholder Pages
- **Location**: feed-client routes
- **Effort**: L (if implementing) or S (if hiding)
- **Status**: NEEDS_HUMAN_REVIEW

Recommend hiding placeholder routes from navigation until implemented.

---

### M8: No Skip Links (WCAG 2.4.1)
- **Location**: All client layout components
- **Effort**: S
- **Status**: NEEDS_HUMAN_REVIEW

**Note**: bridge-client/index.html already has skip link. Need to add to other 7 clients.

---

### M9: Analytics engagementsLast24h Not Implemented
- **Location**: analytics-client SpaceMetrics
- **Effort**: S
- **Status**: NEEDS_HUMAN_REVIEW

Requires wiring up RPC endpoint data.

---

### M10: IRC Requires External WebSocket Proxy
- **Location**: bridge-client IRC configuration
- **Effort**: M
- **Status**: NEEDS_HUMAN_REVIEW

Requires reference proxy implementation or bundled solution.

---

### M11: Challenge Format Discrepancy
- **Location**: PoW challenge serialization code
- **Effort**: S
- **Status**: NEEDS_HUMAN_REVIEW

Feature doc specifies 82 bytes, SPEC_03 §4.2 defines 75 bytes. Needs clarification.

---

## LOW Priority Issues (Quick Wins)

### L1: Duplicate Hex Utilities
- **Status**: NEEDS_HUMAN_REVIEW
- Consolidate `hexToBytes`/`bytesToHex` into single shared module

### L2: Memoize PresenceContext Sort
- **Status**: NEEDS_HUMAN_REVIEW
- Wrap `sortedUsers` in `useMemo`

### L3: Add `role="alert"` to Error Messages
- **Location**: `InviteModal.tsx:184`, `ReportModal.tsx:127`
- **Effort**: S
- **Status**: FIXED

#### Changes Made
- Added `role="alert"` to error message div in InviteModal
- Added `role="alert"` to error message div in ReportModal

#### Files Modified
- `forum-client/src/components/InviteModal.tsx:184` (added role="alert")
- `forum-client/src/components/ReportModal.tsx:172` (added role="alert")

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `forum-client/src/lib/action-pow.ts` | Added SpamAttestation and Invite to ActionType enum with difficulties |
| `forum-client/src/components/InviteModal.tsx` | Added focus trapping (H2), role="alert" (L3), ARIA attributes |
| `forum-client/src/components/ReportModal.tsx` | Added role="alert" to error message |
| `search-client/src/lib/queryParser.ts` | Pre-compiled regexes as module constants |

---

## Validation Status

- [x] TypeScript type checking (`npx tsc --noEmit --skipLibCheck`) - PASSED
- [ ] Build verification (`npm run build`)
- [ ] Unit test run (if available)

---

## Next Steps for Human Review

### Immediate Priority (This Sprint)
1. **C1**: Design passphrase flow for identity encryption
2. **C2**: Integrate useActionPow into InviteModal
3. **C3**: Replace AutoEngageEngine PoW simulation
4. **C4**: Audit X25519 modular inverse implementation

### Short Term (2-4 Weeks)
1. Set up vitest infrastructure
2. ~~Add focus trapping to InviteModal~~ (DONE - use ReportModal pattern)
3. Add skip links to remaining 7 clients
4. Add text labels to presence/heat indicators (H6 - requires 4 component files)

### Long Term (Backlog)
1. Web Worker for PBKDF2
2. Complete Feed Client pages or hide navigation
3. IRC WebSocket proxy implementation

---

*Generated by Issue Implementer - Client Applications*
