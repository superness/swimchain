/**
 * Hook for using the node's identity via RPC.
 *
 * When wiki-client runs embedded in the desktop shell, the NODE owns the
 * identity keypair. This provider fetches that identity (get_identity_info) and
 * signs via the node's localhost-exempt `sign_message` RPC — the browser never
 * holds a keypair or seed. Mirrors forum-client's useNodeIdentity and the feed
 * node-identity work (PR #64).
 *
 * Uses React Context so the identity is fetched once and shared.
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { useRpc } from './useRpc';
import { logger } from '../lib/logger';

interface NodeIdentity {
  publicKey: string;  // Hex-encoded 32-byte public key
  address: string;    // cs1... bech32m address
}

interface NodeIdentityContextValue {
  /** The node's identity (or null if not loaded/available) */
  identity: NodeIdentity | null;
  /** Whether we're loading the identity */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Sign a message using the node's keypair */
  sign: (message: Uint8Array) => Promise<Uint8Array | null>;
  /** Refetch identity from node */
  refetch: () => void;
}

/** Convert hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert Uint8Array to hex string */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Context for sharing node identity state
const NodeIdentityContext = createContext<NodeIdentityContextValue | null>(null);

/**
 * Provider component that manages node identity state.
 */
export function NodeIdentityProvider({ children }: { children: ReactNode }) {
  const { rpc, connected } = useRpc();
  const [identity, setIdentity] = useState<NodeIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIdentity = useCallback(async () => {
    if (!rpc || !connected) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      logger.info('[NodeIdentity] Calling get_identity_info RPC...');
      const result = await rpc.call<{
        has_identity: boolean;
        public_key: string | null;
        address: string | null;
      }>('get_identity_info', {});

      if (result.has_identity && result.public_key && result.address) {
        setIdentity({
          publicKey: result.public_key,
          address: result.address,
        });
        logger.info('[NodeIdentity] Identity set:', result.address);
      } else {
        setIdentity(null);
        setError('Node has no identity loaded');
        logger.warn('[NodeIdentity] Node has no identity');
      }
    } catch (err) {
      logger.error('[NodeIdentity] Failed to fetch identity:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch identity');
      setIdentity(null);
    } finally {
      setIsLoading(false);
    }
  }, [rpc, connected]);

  // Fetch identity when RPC connects
  useEffect(() => {
    if (!connected) {
      return;
    }

    fetchIdentity();

    // Retry a few times in case of race condition
    const retryTimes = [500, 1500, 3000];
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    retryTimes.forEach((delay) => {
      const timeout = setTimeout(() => {
        setIdentity(current => {
          if (!current) {
            fetchIdentity();
          }
          return current;
        });
      }, delay);
      timeouts.push(timeout);
    });

    return () => timeouts.forEach(t => clearTimeout(t));
  }, [connected, fetchIdentity]);

  // Sign function that calls the node's sign_message RPC
  const sign = useCallback(async (message: Uint8Array): Promise<Uint8Array | null> => {
    if (!rpc || !connected) {
      logger.warn('[NodeIdentity] Cannot sign - RPC not connected');
      return null;
    }
    if (!identity) {
      logger.warn('[NodeIdentity] Cannot sign - no identity');
      return null;
    }

    try {
      const result = await rpc.call<{
        signature: string;
        public_key: string;
      }>('sign_message', {
        message: bytesToHex(message),
      });

      return hexToBytes(result.signature);
    } catch (err) {
      logger.error('[NodeIdentity] Failed to sign message:', err);
      return null;
    }
  }, [rpc, connected, identity]);

  const value: NodeIdentityContextValue = {
    identity,
    isLoading,
    error,
    sign,
    refetch: fetchIdentity,
  };

  return (
    <NodeIdentityContext.Provider value={value}>
      {children}
    </NodeIdentityContext.Provider>
  );
}

/**
 * Hook to use the node's identity for posting and signing.
 */
export function useNodeIdentity(): NodeIdentityContextValue {
  const context = useContext(NodeIdentityContext);

  if (!context) {
    // Fallback for components used outside the provider.
    return {
      identity: null,
      isLoading: true,
      error: 'NodeIdentityProvider not found',
      sign: async () => null,
      refetch: () => {},
    };
  }

  return context;
}

export type { NodeIdentity, NodeIdentityContextValue as UseNodeIdentityResult };
