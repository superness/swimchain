# M-FORUM-2 Implementation Log

**Issue**: Argon2id Blocks Main Thread
**Priority**: Medium
**Effort**: M (4-6 hours estimated, ~1 hour actual)
**Status**: **IMPLEMENTED** - 2026-01-14

## Problem

The `useActionPow` hook in forum-client performs Argon2id PoW mining on the main thread, blocking the UI for 15-60 seconds during post/reply/engagement submissions. This causes:
- UI freezes during mining
- Unresponsive browser warnings
- Poor user experience

## Solution

Moved Argon2id computation to a dedicated Web Worker, following the same pattern established in M-CLIENT-1 for PBKDF2 offloading.

## Files Changed

### New Files
- `forum-client/src/lib/action-pow-worker.ts` - Web Worker for Argon2id mining

### Modified Files
- `forum-client/src/lib/action-pow.ts` - Added worker management and `computePowViaWorker` function
- `forum-client/src/hooks/useActionPow.ts` - Updated to use worker-based mining

## Implementation Details

### 1. action-pow-worker.ts (New)

Created a dedicated Web Worker that:
- Imports `argon2id` from `hash-wasm`
- Accepts `MineRequest` messages with challenge, config, and start nonce
- Sends `ProgressUpdate` messages every 10 hash attempts
- Sends `MineResult` on success or cancellation
- Tracks cancelled request IDs to support cancellation

```typescript
export interface MineRequest {
  type: 'mine';
  id: string;
  serializedChallenge: Uint8Array;
  nonceSpace: Uint8Array;
  difficulty: number;
  config: PoWConfig;
  startNonce: bigint;
}
```

### 2. action-pow.ts (Modified)

Added worker management code following the encryption.ts pattern:
- Lazy worker initialization via `getWorker()`
- Request tracking via `pendingMines` Map
- `computePowViaWorker()` function that returns `{ promise, requestId }`
- `cancelMining(requestId)` function for cancellation
- Automatic fallback to main thread if Worker unavailable

### 3. useActionPow.ts (Modified)

Updated the hook to:
- Import `computePowViaWorker` and `cancelMining`
- Track `requestIdRef` for the current mining operation
- Use `computePowViaWorker` instead of `computePow`
- Call `cancelMining(requestIdRef.current)` in the `cancel` callback
- Clear `requestIdRef` on reset

## Validation

**Validated**: 2026-01-14

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |

**Build Output:**
- Worker: `dist/assets/action-pow-worker-CtS_67lU.js` (29.43 kB)
- Main bundle: `dist/assets/index-fl6Cpaxr.js` (483.98 kB, gzipped: 150.59 kB)
- Build time: 5.19s

## Technical Notes

1. **Pattern Consistency**: Follows the same Web Worker pattern as M-CLIENT-1 (encryption-worker.ts)
2. **Fallback**: Automatically falls back to main thread if Worker is unavailable
3. **Cancellation**: Supports cancellation via message passing to worker
4. **Progress Tracking**: Maintains real-time hash rate and attempt tracking
5. **Worker Size**: 29.43 kB due to bundled Argon2id WASM

## API Changes

No breaking changes. The `useActionPow` hook maintains the same interface:
- `mine(actionType, content, authorPubkey, isTestnet)` - starts mining
- `cancel()` - cancels mining (now properly cancels worker)
- `reset()` - resets state
- `state`, `progress`, `solution`, `error` - unchanged

## Testing Notes

Manual testing recommended:
1. Submit a post and verify UI remains responsive during mining
2. Cancel mining mid-operation and verify worker stops
3. Verify progress updates display correctly
4. Test fallback by blocking Worker creation (e.g., in non-HTTPS context)
