/**
 * useKeypair - Ed25519 keypair management for signing
 *
 * Uses stored identity seed to derive keypair for signing operations.
 * Falls back to native crypto module for React Native environment.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStoredIdentity, StoredIdentity } from './useStoredIdentity';
import { getRpcClient } from '../services/SwimchainRpc';

// Simple Ed25519 keypair interface
export interface KeypairLike {
  publicKey: Uint8Array;
  sign: (message: Uint8Array) => Uint8Array;
}

export interface UseKeypairResult {
  keypair: KeypairLike | null;
  publicKeyHex: string | null;
  address: string | null;
  loading: boolean;
  error: string | null;
  sign: (message: Uint8Array) => Uint8Array | null;
  isReady: boolean;
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hook to manage keypair from stored identity
 */
export function useKeypair(): UseKeypairResult {
  const { identity, loading: identityLoading } = useStoredIdentity();
  const [keypair, setKeypair] = useState<KeypairLike | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load keypair when identity changes
  useEffect(() => {
    if (identityLoading) {
      return;
    }

    if (!identity) {
      setKeypair(null);
      setLoading(false);
      return;
    }

    // Try to load keypair from identity
    try {
      const seedBytes = hexToBytes(identity.seed);
      const publicKeyBytes = hexToBytes(identity.publicKey);

      // For now, create a stub keypair
      // In production, this would use a native Ed25519 module or @swimchain/core
      const kp: KeypairLike = {
        publicKey: publicKeyBytes,
        sign: (_message: Uint8Array): Uint8Array => {
          // Placeholder - actual signing would use native module
          console.warn('Signing not implemented - using stub');
          return new Uint8Array(64);
        },
      };

      setKeypair(kp);

      // Register with RPC client for signed requests
      const rpc = getRpcClient();
      rpc.setIdentity(identity.publicKey, kp.sign);

      setError(null);
    } catch (err) {
      console.error('Failed to load keypair:', err);
      setError(err instanceof Error ? err.message : 'Failed to load keypair');
      setKeypair(null);
    } finally {
      setLoading(false);
    }
  }, [identity, identityLoading]);

  // Sign function
  const sign = useCallback((message: Uint8Array): Uint8Array | null => {
    if (!keypair) {
      console.error('Cannot sign: no keypair available');
      return null;
    }
    return keypair.sign(message);
  }, [keypair]);

  // Derived values
  const publicKeyHex = useMemo(() =>
    keypair ? bytesToHex(keypair.publicKey) : null,
    [keypair]
  );

  const address = useMemo(() =>
    identity?.address ?? null,
    [identity]
  );

  const isReady = useMemo(() =>
    !loading && keypair !== null && !error,
    [loading, keypair, error]
  );

  return {
    keypair,
    publicKeyHex,
    address,
    loading,
    error,
    sign,
    isReady,
  };
}

export default useKeypair;
