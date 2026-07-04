/**
 * Hook for managing stored identity in localStorage
 */

import { useState, useCallback, useEffect } from 'react';
import type { StoredIdentity } from '../types';
import { useParentRpcConfig, isInIframe } from './useParentRpcConfig';
import { useNodeIdentity } from './useNodeIdentity';
import { selectIdentityMode } from './identityMode';

const STORAGE_KEY = 'swimchain-identity';

interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}

export function useStoredIdentity(): UseStoredIdentityResult {
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Node mode (embedded in the desktop shell): the node owns the identity, so
  // there is no browser seed. Surface the node's identity in the same shape so
  // display components ("current user") work without a browser keypair. The
  // `seed` is left empty — signing goes through useFeedIdentity's node signer,
  // never through this shape. Standalone (browser) behaviour is unchanged.
  const parentConfig = useParentRpcConfig();
  const mode = selectIdentityMode(parentConfig, isInIframe());
  const node = useNodeIdentity();

  // Load identity from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredIdentity;
        setIdentityState(parsed);
      }
    } catch (error) {
      console.error('Failed to load identity:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setIdentity = useCallback((newIdentity: StoredIdentity) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      setIdentityState(newIdentity);
    } catch (error) {
      console.error('Failed to save identity:', error);
    }
  }, []);

  const clearIdentity = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setIdentityState(null);
    } catch (error) {
      console.error('Failed to clear identity:', error);
    }
  }, []);

  if (mode === 'node') {
    const nodeIdentity: StoredIdentity | null = node.identity
      ? {
          address: node.identity.address,
          publicKey: node.identity.publicKey,
          seed: '', // node holds the private key; browser never sees it
          createdAt: 0,
        }
      : null;
    return {
      identity: nodeIdentity,
      // No-ops in node mode: the node owns the identity lifecycle.
      setIdentity: () => {},
      clearIdentity: () => {},
      isLoading: node.isLoading && node.identity === null,
    };
  }

  return {
    identity,
    setIdentity,
    clearIdentity,
    isLoading,
  };
}
