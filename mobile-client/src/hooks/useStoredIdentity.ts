/**
 * useStoredIdentity - Manage identity stored in AsyncStorage
 *
 * Stores and retrieves the user's identity (address and seed).
 */

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const IDENTITY_KEY = '@swimchain/identity';

export interface StoredIdentity {
  address: string;
  publicKey: string;
  seed: string;
  createdAt: number;
}

export interface UseStoredIdentityResult {
  identity: StoredIdentity | null;
  loading: boolean;
  save: (identity: StoredIdentity) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing stored identity
 */
export function useStoredIdentity(): UseStoredIdentityResult {
  const [identity, setIdentity] = useState<StoredIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await AsyncStorage.getItem(IDENTITY_KEY);
      if (data) {
        setIdentity(JSON.parse(data));
      } else {
        setIdentity(null);
      }
    } catch (error) {
      console.error('Failed to load identity:', error);
      setIdentity(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback(async (newIdentity: StoredIdentity) => {
    try {
      await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(newIdentity));
      setIdentity(newIdentity);
    } catch (error) {
      console.error('Failed to save identity:', error);
      throw error;
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(IDENTITY_KEY);
      setIdentity(null);
    } catch (error) {
      console.error('Failed to clear identity:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    identity,
    loading,
    save,
    clear,
    refresh: load,
  };
}

/**
 * Synchronously get stored identity (for non-hook contexts)
 */
export async function getStoredIdentity(): Promise<StoredIdentity | null> {
  try {
    const data = await AsyncStorage.getItem(IDENTITY_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Synchronously save identity (for non-hook contexts)
 */
export async function saveStoredIdentity(identity: StoredIdentity): Promise<void> {
  await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
}

export default useStoredIdentity;
