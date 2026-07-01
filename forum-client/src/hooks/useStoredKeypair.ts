/**
 * Hook that provides a keypair-like interface for signing
 *
 * Uses node identity for signing via RPC. The keypair object provides
 * publicKey() and sign() methods compatible with the old WASM Keypair API.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNodeIdentity } from './useNodeIdentity';
import { useIdentityContext } from '../providers/IdentityProvider';
import { logger } from '../lib/logger';

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length (${hex.length})`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Keypair-like object that wraps node signing
 */
interface NodeKeypair {
  /** Get the public key as Uint8Array */
  publicKey(): Uint8Array;
  /** Get the bech32m address */
  address(): string;
  /** Sign a message - wraps async node signing */
  sign(message: Uint8Array): Uint8Array;
  /** Get seed - not available with node identity */
  seed(): Uint8Array;
  /** Compatibility method - no-op since we don't own memory */
  free(): void;
}

/**
 * Hook result type
 */
export interface UseStoredKeypairResult {
  /** The keypair object (or null if not loaded) */
  keypair: NodeKeypair | null;
  /** The public key as Uint8Array */
  publicKey: Uint8Array | null;
  /** The bech32m address */
  address: string | null;
  /** Whether we're still loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Sign a message with the keypair (async version) */
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
}

/**
 * Hook to get a keypair-like object from node identity
 *
 * This wraps the node's signing capability in an interface compatible
 * with the old WASM Keypair API.
 */
export function useStoredKeypair(): UseStoredKeypairResult {
  const { identity } = useIdentityContext();
  const { sign: nodeSign, isLoading: nodeLoading } = useNodeIdentity();

  const [error, setError] = useState<string | null>(null);

  // Log what we're getting
  logger.info('[useStoredKeypair] Using node identity:', {
    hasIdentity: !!identity,
    address: identity?.address || null,
    nodeLoading,
  });

  // Create a keypair-like object that uses node signing
  // Note: The sign() method here is SYNCHRONOUS for API compatibility,
  // but it will throw if called directly. Use the async sign() from the hook result.
  const keypair = useMemo((): NodeKeypair | null => {
    if (!identity?.publicKey) {
      return null;
    }

    try {
      const pubKeyBytes = hexToBytes(identity.publicKey);

      return {
        publicKey: () => pubKeyBytes,
        address: () => identity.address,
        // Synchronous sign for compatibility - throws because node signing is async
        sign: (_message: Uint8Array): Uint8Array => {
          throw new Error('Use the async sign() from useStoredKeypair result instead of keypair.sign()');
        },
        // Seed is not available with node identity - private key is on the node
        seed: (): Uint8Array => {
          throw new Error('Seed is not available - identity private key is managed by the node. Private spaces require node-side key derivation (not yet implemented).');
        },
        free: () => {
          // No-op - we don't own any WASM memory
        },
      };
    } catch (err) {
      console.error('[useStoredKeypair] Failed to create keypair:', err);
      setError(err instanceof Error ? err.message : 'Failed to create keypair');
      return null;
    }
  }, [identity?.publicKey, identity?.address]);

  // Async sign function that uses node signing
  const sign = useCallback(async (message: Uint8Array): Promise<Uint8Array | null> => {
    if (!identity) {
      console.warn('[useStoredKeypair] Cannot sign - no identity');
      return null;
    }
    return nodeSign(message);
  }, [identity, nodeSign]);

  // Derived values
  const publicKey = useMemo(() => {
    if (!identity?.publicKey) return null;
    try {
      return hexToBytes(identity.publicKey);
    } catch {
      return null;
    }
  }, [identity?.publicKey]);

  const address = identity?.address ?? null;

  return {
    keypair,
    publicKey,
    address,
    isLoading: nodeLoading,
    error,
    sign,
  };
}
