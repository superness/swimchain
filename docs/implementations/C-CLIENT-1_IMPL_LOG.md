# C-CLIENT-1: Private Keys Stored Unencrypted in localStorage

**Issue ID**: C-CLIENT-1
**Priority**: Critical
**Status**: IMPLEMENTED
**Date**: 2026-01-13

## Problem

Private keys (seeds) were stored as plaintext in localStorage. An XSS vulnerability could expose all user private keys, enabling:
- Identity theft
- Unauthorized message signing
- Complete account takeover

## Solution

Implemented passphrase-based encryption for private keys using Argon2id key derivation and AES-256-GCM encryption.

### Changes

#### New File: `forum-client/src/lib/identity-encryption.ts`

Created encryption module with:
- `encryptSeed(seedHex, passphrase)` - Encrypts a 32-byte seed
- `decryptSeed(encryptedSeed, passphrase)` - Decrypts seed, returns null on wrong passphrase
- `isEncryptedSeed(seed)` - Checks if seed is in encrypted format
- `validatePassphrase(passphrase)` - Validates passphrase strength (min 8 chars)

**Encryption format**: `[IDENTITY:v1:<base64(salt:iv:ciphertext)>]`

**Argon2id parameters** (tuned for browser):
- Memory: 16 MiB
- Iterations: 3 (OWASP minimum)
- Parallelism: 1 (web worker compatible)
- Hash length: 32 bytes (AES-256 key)

#### Modified File: `forum-client/src/hooks/useStoredIdentity.ts`

Extended hook interface with:
- `hasStoredIdentity: boolean` - Whether any identity exists
- `isEncrypted: boolean` - Whether stored identity is encrypted
- `needsPassphrase: boolean` - Whether unlock is required
- `setIdentity(identity, passphrase)` - Save with encryption (async)
- `unlockIdentity(passphrase)` - Decrypt and load identity
- `lockIdentity()` - Clear in-memory seed
- `migrateToEncrypted(passphrase)` - Convert legacy unencrypted identity

### Backward Compatibility

- Legacy unencrypted identities are detected via `isEncryptedSeed()` check
- Unencrypted identities still load and work (for migration period)
- `migrateToEncrypted()` allows user-initiated migration
- No automatic migration to avoid breaking existing sessions

### Storage Format

Before (vulnerable):
```json
{
  "address": "cs1...",
  "publicKey": "abc123...",
  "seed": "deadbeef...",
  "createdAt": 1234567890
}
```

After (encrypted):
```json
{
  "address": "cs1...",
  "publicKey": "abc123...",
  "seed": "[IDENTITY:v1:base64...]",
  "createdAt": 1234567890
}
```

## Verification

- TypeScript compilation: PASSED (`npx tsc --noEmit`)
- Uses existing `hash-wasm` dependency (already in package.json, version ^4.12.0)
- Follows patterns from `forum-client/src/lib/encryption.ts`
- StoredIdentity type compatibility: VERIFIED
- Re-validated: 2026-01-13

## Security Considerations

1. **Argon2id vs PBKDF2**: Argon2id is memory-hard, making GPU/ASIC attacks expensive
2. **Key never leaves memory**: Decrypted seed only exists in React state
3. **Session-based locking**: `lockIdentity()` clears in-memory key
4. **Salt per identity**: Each encryption uses fresh random salt
5. **Auth tag validation**: AES-GCM ensures integrity and authenticity

## Future Work

- UI component for passphrase prompt (not part of this issue)
- Auto-lock on inactivity timeout
- Biometric unlock for mobile

---

## Implementation Status

| Step | Status | Notes |
|------|--------|-------|
| Create encryption module | ✅ COMPLETE | `forum-client/src/lib/identity-encryption.ts` (254 lines) |
| Modify useStoredIdentity hook | ✅ COMPLETE | Added encryption support (226 lines) |
| TypeScript compilation | ✅ PASSED | No errors |
| Build validation | ✅ PASSED | Vite build successful |
| Dependency verification | ✅ PASSED | hash-wasm@4.12.0 present |
| Documentation | ✅ COMPLETE | This file |

**Final Status**: IMPLEMENTED AND VALIDATED

**Completion Date**: 2026-01-13
