/**
 * Hook that bridges stored identity (localStorage) with WASM Keypair
 *
 * Creates a Keypair from the stored identity's seed, enabling PoW mining
 * and signing for bridge operations.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Keypair } from '@swimchain/core';
import { useSwimchain } from '@swimchain/react';
import { useStoredIdentity } from './useStoredIdentity';

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
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
 * Hook result type
 */
export interface UseStoredKeypairResult {
  /** The WASM Keypair object (or null if not loaded) */
  keypair: Keypair | null;
  /** The public key as Uint8Array */
  publicKey: Uint8Array | null;
  /** The public key as hex string */
  publicKeyHex: string | null;
  /** The bech32m address */
  address: string | null;
  /** Whether we're still loading */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Sign a message with the keypair */
  sign: (message: Uint8Array) => Uint8Array | null;
  /** Whether identity exists */
  hasIdentity: boolean;
}

/**
 * Hook to get a WASM Keypair from the stored identity
 */
export function useStoredKeypair(): UseStoredKeypairResult {
  const { isLoaded: wasmLoaded } = useSwimchain();
  const { identity, isLoading: identityLoading } = useStoredIdentity();

  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [error, setError] = useState<string | null>(null);
  const keypairRef = useRef<Keypair | null>(null);

  // Cleanup keypair on unmount
  useEffect(() => {
    return () => {
      keypairRef.current?.free();
    };
  }, []);

  // Create keypair when identity is available
  useEffect(() => {
    if (!wasmLoaded) {
      return;
    }

    if (!identity?.seed) {
      setKeypair(null);
      setError(null);
      return;
    }

    try {
      keypairRef.current?.free();

      const seedBytes = hexToBytes(identity.seed);

      if (seedBytes.length !== 32) {
        throw new Error(`Invalid seed length: ${seedBytes.length} (expected 32)`);
      }

      const newKeypair = Keypair.fromSeed(seedBytes);
      keypairRef.current = newKeypair;
      setKeypair(newKeypair);
      setError(null);

      console.log('[useStoredKeypair] Created keypair from stored identity');
    } catch (err) {
      console.error('[useStoredKeypair] Failed to create keypair:', err);
      setError(err instanceof Error ? err.message : 'Failed to create keypair');
      setKeypair(null);
    }
  }, [wasmLoaded, identity?.seed]);

  const sign = useCallback((message: Uint8Array): Uint8Array | null => {
    if (!keypair) {
      console.warn('[useStoredKeypair] Cannot sign - no keypair');
      return null;
    }
    return keypair.sign(message);
  }, [keypair]);

  const publicKey = useMemo(() => keypair?.publicKey() ?? null, [keypair]);
  const publicKeyHex = useMemo(() => publicKey ? bytesToHex(publicKey) : null, [publicKey]);
  const address = useMemo(() => keypair?.address() ?? null, [keypair]);

  return {
    keypair,
    publicKey,
    publicKeyHex,
    address,
    isLoading: !wasmLoaded || identityLoading,
    error,
    sign,
    hasIdentity: identity !== null,
  };
}
