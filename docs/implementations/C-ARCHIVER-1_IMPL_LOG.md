# C-ARCHIVER-1: PoW Engagement Completely Mocked

**Status**: IMPLEMENTED
**Date**: 2026-01-14
**Effort**: L (actual: ~2 hours)

## Problem

The archiver-client used mocked PoW engagement with `setTimeout(resolve, 1000)` instead of actual Argon2id proof-of-work. This meant:

1. `AutoEngageEngine.ts:140-148` - `engage()` method simulated PoW with a 1-second delay
2. `EngageButton.tsx:47-50` - Component used mock progress animation and fake delays

## Solution

Integrated real Argon2id PoW mining from `@swimchain/react`'s action-pow library.

### Files Changed

1. **archiver-client/src/lib/engagement-pow.ts** (NEW)
   - Wrapper around `@swimchain/react`'s action-pow exports
   - `mineEngagementPow()` function for engagement-specific PoW
   - `estimateEngagementMiningTime()` helper
   - Uses `createEngageChallenge()` and `computePow()` from @swimchain/react

2. **archiver-client/src/services/AutoEngageEngine.ts**
   - Added import for `mineEngagementPow`
   - Added `EngagementProgressCallback` type export
   - Added class properties:
     - `isCancelled: boolean` - for cancellation support
     - `authorPubkeyHex: string | null` - required for PoW mining
     - `isTestnet: boolean` - network mode selection
   - Added methods:
     - `setAuthorPubkey(pubkeyHex)` - set author's public key for mining
     - `setTestnetMode(isTestnet)` - set network difficulty mode
     - `cancelEngagement()` - cancel ongoing mining
   - Updated `engage()` method:
     - Now requires author pubkey to be set
     - Uses `mineEngagementPow()` for real Argon2id PoW
     - Supports progress callback parameter
     - Supports cancellation via `isCancelled` flag

3. **archiver-client/src/components/EngageButton.tsx**
   - Added `hashRate` state for displaying mining speed
   - Added `handleCancel` callback for cancellation
   - Updated `handleClick` to:
     - Create minimal `AtRiskContent` object for engine
     - Pass progress callback to `engine.engage()`
     - Display real hash rate during mining
   - Button now toggles between start/cancel on click
   - Added `'cancelled'` state to ButtonState type
   - Updated progress display to show real hash rate

### Technical Details

**PoW Configuration (per SPEC_03):**
- Testnet: difficulty 6, 8 MiB memory, 1 iteration, 2 parallelism
- Mainnet: difficulty 16, 64 MiB memory, 3 iterations, 4 parallelism

**Expected Mining Time:**
- Testnet: ~64 attempts expected (2^6), typically < 1 minute with modern hardware
- Mainnet: ~65,536 attempts expected (2^16), can take several minutes

**Integration Requirements:**
Before using the engine, callers must:
```typescript
const engine = getAutoEngageEngine();
engine.setAuthorPubkey(myPublicKeyHex); // 64-char hex string
engine.setTestnetMode(true); // or false for mainnet
```

### Validation

| Check | Command | Result |
|-------|---------|--------|
| Type checking | `npx tsc --noEmit` | ✅ PASS |
| Production build | `npm run build` | ✅ PASS (107 modules, 233KB + WASM) |
| Unused variables | `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` | ✅ PASS |

- All existing exports preserved (backward compatible)
- All imports from `@swimchain/react` verified against index.ts exports

### Notes

- The archiver-client already had `@swimchain/react` and `hash-wasm` as dependencies
- Real PoW is compute-intensive; UI shows progress and supports cancellation
- Budget tracking (seconds) is separate from actual mining time
- The engine now properly blocks concurrent engagements
