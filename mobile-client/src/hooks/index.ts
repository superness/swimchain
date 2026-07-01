/**
 * Hooks exports for Swimchain Mobile
 */

// Mobile-specific PoW hook
export { useMobilePow, type PowState, type UseMobilePowResult } from './useMobilePow';

// Memory management hook
export { useMemoryWarning } from './useMemoryWarning';

// RPC hooks
export {
  useRpcConnection,
  useSpaces,
  useSpaceThreads,
  useThread,
  useRecentContent,
  usePoolsAtRisk,
} from './useRpc';

// Identity hooks
export {
  useStoredIdentity,
  getStoredIdentity,
  saveStoredIdentity,
  type StoredIdentity,
  type UseStoredIdentityResult,
} from './useStoredIdentity';

// Keypair hooks
export {
  useKeypair,
  type KeypairLike,
  type UseKeypairResult,
} from './useKeypair';
