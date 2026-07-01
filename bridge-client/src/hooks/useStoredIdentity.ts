/**
 * Hook for managing stored bridge identity in localStorage
 */

import { useState, useCallback, useEffect } from 'react';
import type { StoredIdentity } from '../types';

const STORAGE_KEY = 'swimchain-bridge-identity';

interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  setIdentity: (identity: StoredIdentity) => void;
  clearIdentity: () => void;
  isLoading: boolean;
}

export function useStoredIdentity(): UseStoredIdentityResult {
  const [identity, setIdentityState] = useState<StoredIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load identity from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredIdentity;
        setIdentityState(parsed);
      }
    } catch (error) {
      console.error('[BridgeIdentity] Failed to load identity:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setIdentity = useCallback((newIdentity: StoredIdentity) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newIdentity));
      setIdentityState(newIdentity);
      console.log('[BridgeIdentity] Identity saved:', newIdentity.address);
    } catch (error) {
      console.error('[BridgeIdentity] Failed to save identity:', error);
    }
  }, []);

  const clearIdentity = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setIdentityState(null);
      console.log('[BridgeIdentity] Identity cleared');
    } catch (error) {
      console.error('[BridgeIdentity] Failed to clear identity:', error);
    }
  }, []);

  return {
    identity,
    setIdentity,
    clearIdentity,
    isLoading,
  };
}

/**
 * Get stored identity directly (for non-React code)
 */
export function getStoredIdentity(): StoredIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredIdentity;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Save identity directly (for non-React code)
 */
export function saveStoredIdentity(identity: StoredIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}
