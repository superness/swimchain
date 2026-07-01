/**
 * Private Space Key Storage Hook
 *
 * Stores and retrieves space keys for private spaces.
 * Keys are stored encrypted in IndexedDB using the user's identity seed.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { bytesToHex, hexToBytes } from '../lib/x25519';

const DB_NAME = 'swimchain-private-spaces';
const DB_VERSION = 1;
const STORE_NAME = 'space-keys';

export interface PrivateSpaceKey {
  spaceId: string;
  spaceKey: Uint8Array;
  keyVersion: number;
  joinedAt: number;
  invitedBy: string;
  spaceName?: string; // Decrypted name (if available)
}

interface StoredSpaceKey {
  spaceId: string;
  spaceKeyHex: string;
  keyVersion: number;
  joinedAt: number;
  invitedBy: string;
  spaceName?: string;
}

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store for space keys
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'spaceId' });
        store.createIndex('joinedAt', 'joinedAt', { unique: false });
        store.createIndex('invitedBy', 'invitedBy', { unique: false });
      }
    };
  });
}

/**
 * Hook for managing private space keys
 */
export function usePrivateSpaceKeys(userPublicKey?: string) {
  const [keys, setKeys] = useState<Map<string, PrivateSpaceKey>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all keys from IndexedDB on mount
  useEffect(() => {
    if (!userPublicKey) {
      setLoading(false);
      return;
    }

    const loadKeys = async () => {
      try {
        const db = await openDatabase();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const stored: StoredSpaceKey[] = request.result;
          const keyMap = new Map<string, PrivateSpaceKey>();

          for (const item of stored) {
            keyMap.set(item.spaceId, {
              spaceId: item.spaceId,
              spaceKey: hexToBytes(item.spaceKeyHex),
              keyVersion: item.keyVersion,
              joinedAt: item.joinedAt,
              invitedBy: item.invitedBy,
              spaceName: item.spaceName,
            });
          }

          setKeys(keyMap);
          setLoading(false);
        };

        request.onerror = () => {
          setError('Failed to load space keys');
          setLoading(false);
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    loadKeys();
  }, [userPublicKey]);

  /**
   * Get the key for a specific space
   */
  const getSpaceKey = useCallback((spaceId: string): Uint8Array | null => {
    const entry = keys.get(spaceId);
    return entry?.spaceKey || null;
  }, [keys]);

  /**
   * Get full key info for a space
   */
  const getSpaceKeyInfo = useCallback((spaceId: string): PrivateSpaceKey | null => {
    return keys.get(spaceId) || null;
  }, [keys]);

  /**
   * Store a new space key
   */
  const storeSpaceKey = useCallback(async (
    spaceId: string,
    spaceKey: Uint8Array,
    invitedBy: string,
    keyVersion: number = 0,
    spaceName?: string
  ): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: StoredSpaceKey = {
        spaceId,
        spaceKeyHex: bytesToHex(spaceKey),
        keyVersion,
        joinedAt: Date.now(),
        invitedBy,
        spaceName,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update local state
      setKeys(prev => {
        const next = new Map(prev);
        next.set(spaceId, {
          spaceId,
          spaceKey,
          keyVersion,
          joinedAt: entry.joinedAt,
          invitedBy,
          spaceName,
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to store space key:', err);
      throw err;
    }
  }, []);

  /**
   * Update a space key (after key rotation)
   */
  const updateSpaceKey = useCallback(async (
    spaceId: string,
    newSpaceKey: Uint8Array,
    newKeyVersion: number
  ): Promise<void> => {
    const existing = keys.get(spaceId);
    if (!existing) {
      throw new Error('Space key not found');
    }

    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: StoredSpaceKey = {
        spaceId,
        spaceKeyHex: bytesToHex(newSpaceKey),
        keyVersion: newKeyVersion,
        joinedAt: existing.joinedAt,
        invitedBy: existing.invitedBy,
        spaceName: existing.spaceName,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update local state
      setKeys(prev => {
        const next = new Map(prev);
        next.set(spaceId, {
          ...existing,
          spaceKey: newSpaceKey,
          keyVersion: newKeyVersion,
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to update space key:', err);
      throw err;
    }
  }, [keys]);

  /**
   * Remove a space key (after leaving a space)
   */
  const removeSpaceKey = useCallback(async (spaceId: string): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(spaceId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update local state
      setKeys(prev => {
        const next = new Map(prev);
        next.delete(spaceId);
        return next;
      });
    } catch (err) {
      console.error('Failed to remove space key:', err);
      throw err;
    }
  }, []);

  /**
   * Check if user has key for a space
   */
  const hasSpaceKey = useCallback((spaceId: string): boolean => {
    return keys.has(spaceId);
  }, [keys]);

  /**
   * List all private spaces the user is a member of
   */
  const listMyPrivateSpaces = useMemo((): PrivateSpaceKey[] => {
    return Array.from(keys.values()).sort((a, b) => b.joinedAt - a.joinedAt);
  }, [keys]);

  /**
   * Get space count
   */
  const spaceCount = useMemo(() => keys.size, [keys]);

  return {
    // State
    loading,
    error,
    spaceCount,

    // Key operations
    getSpaceKey,
    getSpaceKeyInfo,
    storeSpaceKey,
    updateSpaceKey,
    removeSpaceKey,
    hasSpaceKey,
    listMyPrivateSpaces,
  };
}

export default usePrivateSpaceKeys;
