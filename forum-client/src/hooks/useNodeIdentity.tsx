/**
 * Hook for using the node's identity via RPC
 *
 * This replaces the need for separate browser-side identity management.
 * The node owns the identity keypair and handles signing via RPC.
 *
 * Uses React Context to share identity state across all components.
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
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Context for sharing node identity state
const NodeIdentityContext = createContext<NodeIdentityContextValue | null>(null);


/**
 * Provider component that manages node identity state
 */
export function NodeIdentityProvider({ children }: { children: ReactNode }) {
  const { rpc, connected, setRemoteSigner } = useRpc();
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
      logger.info('[NodeIdentity] RPC result:', result);

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
      logger.info('[NodeIdentity] Waiting for RPC connection...');
      return;
    }

    logger.info('[NodeIdentity] RPC connected, fetching identity...');
    fetchIdentity();

    // Retry a few times in case of race condition
    const retryTimes = [500, 1500, 3000];
    const timeouts: NodeJS.Timeout[] = [];

    retryTimes.forEach((delay) => {
      const timeout = setTimeout(() => {
        // Check current state via closure - only retry if still no identity
        setIdentity(current => {
          if (!current) {
            logger.info(`[NodeIdentity] Retry at ${delay}ms - no identity yet`);
            fetchIdentity();
          }
          return current;
        });
      }, delay);
      timeouts.push(timeout);
    });

    return () => timeouts.forEach(t => clearTimeout(t));
  }, [connected, fetchIdentity]);

  // Set up remote signer when node identity is available
  useEffect(() => {
    if (!identity || !rpc || !connected) {
      return;
    }

    // Create a remote signing function that calls sign_message RPC
    const remoteSignFn = async (messageHex: string): Promise<string | null> => {
      try {
        const result = await rpc.call<{
          signature: string;
          public_key: string;
        }>('sign_message', {
          message: messageHex,
        });
        return result.signature;
      } catch (err) {
        logger.error('[NodeIdentity] Remote sign failed:', err);
        return null;
      }
    };

    // Set up remote signer on the RPC client
    logger.info('[NodeIdentity] Setting up remote signer for node identity');
    setRemoteSigner(identity.publicKey, remoteSignFn);
  }, [identity, rpc, connected, setRemoteSigner]);

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
 * Hook to use the node's identity for posting and signing
 *
 * This eliminates the need for separate browser-side identity management.
 * Users just run a node and the forum-client uses that node's identity.
 */
export function useNodeIdentity(): NodeIdentityContextValue {
  const context = useContext(NodeIdentityContext);

  if (!context) {
    // Return a fallback for components used outside the provider
    // This matches the old behavior before the context was added
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

// Re-export the interface for type usage
export type { NodeIdentity, NodeIdentityContextValue as UseNodeIdentityResult };
