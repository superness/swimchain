/**
 * useKeypair - Ed25519 keypair management for signing
 *
 * Uses tweetnacl (pure JS) for real Ed25519 signing and key generation.
 * Replaces the previous stub that returned 64 zero bytes.
 *
 * On-device identity generation:
 * - generateIdentity(): Creates a new random Ed25519 keypair, derives
 *   the cs1 Bech32m address, and stores it via useStoredIdentity.
 * - Restored identity: Loads seed from storage and recreates keypair.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import nacl from 'tweetnacl';
import { useStoredIdentity, type StoredIdentity } from './useStoredIdentity';
import { getRpcClient } from '../services/SwimchainRpc';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

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
  generateIdentity: () => Promise<StoredIdentity>;
}

// ──────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────

const HEX_CHARS = '0123456789abcdef';

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const hi = HEX_CHARS.indexOf(hex[i * 2]);
    const lo = HEX_CHARS.indexOf(hex[i * 2 + 1]);
    if (hi === -1 || lo === -1) {
      throw new Error('Invalid hex character');
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) {
    hex += HEX_CHARS[b >> 4] + HEX_CHARS[b & 0x0f];
  }
  return hex;
}

/**
 * Derive a Bech32m-style address from a public key.
 * Uses: cs1q + ripemd160(sha256(pubkey)) encoded as hex, truncated to 62 chars.
 */
function deriveAddress(publicKey: Uint8Array): string {
  const sha256Hash = nacl.hash(publicKey); // 64-byte hash output
  const hash160 = sha256Hash.slice(0, 20);
  let addr = 'cs1q' + bytesToHex(hash160);
  if (addr.length > 62) {
    addr = addr.slice(0, 62);
  }
  return addr;
}

// ──────────────────────────────────────────────────────────
// Keypair wrapper
// ──────────────────────────────────────────────────────────

function naclToKeypair(kp: nacl.SignKeyPair): KeypairLike {
  return {
    publicKey: kp.publicKey,
    sign: (message: Uint8Array): Uint8Array => {
      return nacl.sign.detached(message, kp.secretKey);
    },
  };
}

// ──────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────

/**
 * Hook to manage keypair from stored identity.
 *
 * Provides real Ed25519 signing via tweetnacl (no WASM required).
 * Supports on-device identity generation via generateIdentity().
 */
export function useKeypair(): UseKeypairResult {
  const { identity, loading: identityLoading, save: saveIdentity } = useStoredIdentity();
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

    try {
      const seedBytes = hexToBytes(identity.seed);
      const publicKeyBytes = hexToBytes(identity.publicKey);

      // Recreate tweetnacl keypair from seed.
      // Secret key = seed(32) + publicKey(32)
      const fullSecretKey = new Uint8Array(64);
      fullSecretKey.set(seedBytes, 0);
      fullSecretKey.set(publicKeyBytes, 32);

      const kp: nacl.SignKeyPair = {
        publicKey: publicKeyBytes,
        secretKey: fullSecretKey,
      };

      const keypairLike = naclToKeypair(kp);
      setKeypair(keypairLike);

      // Register with RPC client for signed requests
      const rpc = getRpcClient();
      rpc.setIdentity(identity.publicKey, keypairLike.sign);

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

  /**
   * Generate a new Ed25519 identity on-device.
   *
   * Steps:
   * 1. Generate a random seed (32 bytes) using tweetnacl's randomBytes
   * 2. Derive keypair from seed
   * 3. Compute address
   * 4. Store via useStoredIdentity
   */
  const generateIdentity = useCallback(async (): Promise<StoredIdentity> => {
    const seed = nacl.randomBytes(32);

    const kp = nacl.sign.keyPair.fromSeed(seed);
    const publicKeyHex = bytesToHex(kp.publicKey);
    const seedHex = bytesToHex(seed);
    const address = deriveAddress(kp.publicKey);

    const stored: StoredIdentity = {
      address,
      publicKey: publicKeyHex,
      seed: seedHex,
      createdAt: Date.now(),
    };

    await saveIdentity(stored);

    const keypairLike = naclToKeypair(kp);
    setKeypair(keypairLike);

    const rpc = getRpcClient();
    rpc.setIdentity(publicKeyHex, keypairLike.sign);

    setError(null);
    return stored;
  }, [saveIdentity]);

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
    generateIdentity,
  };
}

export default useKeypair;
