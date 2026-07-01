/**
 * Unified signing hook that works with both:
 * - Stored keypair (browser identity with seed)
 * - Node identity (signing via RPC)
 *
 * This hook provides a consistent async signing interface regardless of
 * which identity source is being used.
 */

import { useCallback } from 'react';
import { useStoredKeypair } from './useStoredKeypair';
import { useNodeIdentity } from './useNodeIdentity';
import { logger } from '../lib/logger';

interface UseSignResult {
  /**
   * Sign a message asynchronously.
   * Returns the signature bytes or null if signing failed.
   */
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
  /**
   * Whether signing is available (either stored keypair or node identity)
   */
  canSign: boolean;
  /**
   * The source of signing capability
   */
  signSource: 'stored' | 'node' | 'none';
}

/**
 * Hook that provides unified signing capability.
 *
 * Priority:
 * 1. If stored keypair has a seed, use that (synchronous, faster)
 * 2. Otherwise, if node identity is available, use RPC signing
 * 3. If neither, signing is not available
 */
export function useSign(): UseSignResult {
  const { sign: storedSign, keypair } = useStoredKeypair();
  const { sign: nodeSign, identity: nodeIdentity } = useNodeIdentity();

  // Determine which source to use
  const hasStoredKeypair = Boolean(keypair);
  const hasNodeIdentity = Boolean(nodeIdentity);

  const signSource: 'stored' | 'node' | 'none' = hasStoredKeypair
    ? 'stored'
    : hasNodeIdentity
    ? 'node'
    : 'none';

  const canSign = signSource !== 'none';

  // Log sign capability for debugging
  logger.debug('[useSign] Sign capability:', {
    hasStoredKeypair,
    hasNodeIdentity,
    signSource,
    canSign,
    nodeIdentityPubkey: nodeIdentity?.publicKey?.substring(0, 16),
  });

  const sign = useCallback(
    async (message: Uint8Array): Promise<Uint8Array | null> => {
      // Try stored keypair first (sync, faster)
      if (hasStoredKeypair && storedSign) {
        logger.debug('[useSign] Using stored keypair for signing');
        const result = storedSign(message);
        return result;
      }

      // Fall back to node identity (async, via RPC)
      if (hasNodeIdentity && nodeSign) {
        logger.debug('[useSign] Using node identity RPC for signing');
        return nodeSign(message);
      }

      logger.warn('[useSign] No signing capability available');
      return null;
    },
    [hasStoredKeypair, hasNodeIdentity, storedSign, nodeSign]
  );

  return {
    sign,
    canSign,
    signSource,
  };
}
