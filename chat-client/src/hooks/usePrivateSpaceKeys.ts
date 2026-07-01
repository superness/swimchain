/**
 * Private Space Key Storage Hook
 *
 * Stores and retrieves space keys for private channels.
 * Keys are stored in IndexedDB for persistence.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { bytesToHex, hexToBytes } from '@swimchain/frontend';

const DB_NAME = 'swimchain-private-channels';
const DB_VERSION = 1;
const STORE_NAME = 'channel-keys';

export interface PrivateChannelKey {
  channelId: string;
  channelKey: Uint8Array;
  keyVersion: number;
  joinedAt: number;
  invitedBy: string;
  channelName?: string;
}

interface StoredChannelKey {
  channelId: string;
  channelKeyHex: string;
  keyVersion: number;
  joinedAt: number;
  invitedBy: string;
  channelName?: string;
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

      // Create object store for channel keys
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'channelId' });
        store.createIndex('joinedAt', 'joinedAt', { unique: false });
        store.createIndex('invitedBy', 'invitedBy', { unique: false });
      }
    };
  });
}

/**
 * Hook for managing private channel keys
 */
export function usePrivateChannelKeys(userPublicKey?: string) {
  const [keys, setKeys] = useState<Map<string, PrivateChannelKey>>(new Map());
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
          const stored: StoredChannelKey[] = request.result;
          const keyMap = new Map<string, PrivateChannelKey>();

          for (const item of stored) {
            keyMap.set(item.channelId, {
              channelId: item.channelId,
              channelKey: hexToBytes(item.channelKeyHex),
              keyVersion: item.keyVersion,
              joinedAt: item.joinedAt,
              invitedBy: item.invitedBy,
              channelName: item.channelName,
            });
          }

          setKeys(keyMap);
          setLoading(false);
        };

        request.onerror = () => {
          setError('Failed to load channel keys');
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
   * Get the key for a specific channel
   */
  const getChannelKey = useCallback((channelId: string): Uint8Array | null => {
    const entry = keys.get(channelId);
    return entry?.channelKey || null;
  }, [keys]);

  /**
   * Get full key info for a channel
   */
  const getChannelKeyInfo = useCallback((channelId: string): PrivateChannelKey | null => {
    return keys.get(channelId) || null;
  }, [keys]);

  /**
   * Store a new channel key
   */
  const storeChannelKey = useCallback(async (
    channelId: string,
    channelKey: Uint8Array,
    invitedBy: string,
    keyVersion: number = 0,
    channelName?: string
  ): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: StoredChannelKey = {
        channelId,
        channelKeyHex: bytesToHex(channelKey),
        keyVersion,
        joinedAt: Date.now(),
        invitedBy,
        channelName,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update local state
      setKeys(prev => {
        const next = new Map(prev);
        next.set(channelId, {
          channelId,
          channelKey,
          keyVersion,
          joinedAt: entry.joinedAt,
          invitedBy,
          channelName,
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to store channel key:', err);
      throw err;
    }
  }, []);

  /**
   * Update a channel key (after key rotation)
   */
  const updateChannelKey = useCallback(async (
    channelId: string,
    newChannelKey: Uint8Array,
    newKeyVersion: number
  ): Promise<void> => {
    const existing = keys.get(channelId);
    if (!existing) {
      throw new Error('Channel key not found');
    }

    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const entry: StoredChannelKey = {
        channelId,
        channelKeyHex: bytesToHex(newChannelKey),
        keyVersion: newKeyVersion,
        joinedAt: existing.joinedAt,
        invitedBy: existing.invitedBy,
        channelName: existing.channelName,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(entry);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update local state
      setKeys(prev => {
        const next = new Map(prev);
        next.set(channelId, {
          ...existing,
          channelKey: newChannelKey,
          keyVersion: newKeyVersion,
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to update channel key:', err);
      throw err;
    }
  }, [keys]);

  /**
   * Remove a channel key (after leaving a channel)
   */
  const removeChannelKey = useCallback(async (channelId: string): Promise<void> => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(channelId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update local state
      setKeys(prev => {
        const next = new Map(prev);
        next.delete(channelId);
        return next;
      });
    } catch (err) {
      console.error('Failed to remove channel key:', err);
      throw err;
    }
  }, []);

  /**
   * Check if user has key for a channel
   */
  const hasChannelKey = useCallback((channelId: string): boolean => {
    return keys.has(channelId);
  }, [keys]);

  /**
   * List all private channels the user is a member of
   */
  const listMyPrivateChannels = useMemo((): PrivateChannelKey[] => {
    return Array.from(keys.values()).sort((a, b) => b.joinedAt - a.joinedAt);
  }, [keys]);

  /**
   * Get channel count
   */
  const channelCount = useMemo(() => keys.size, [keys]);

  return {
    // State
    loading,
    error,
    channelCount,

    // Key operations
    getChannelKey,
    getChannelKeyInfo,
    storeChannelKey,
    updateChannelKey,
    removeChannelKey,
    hasChannelKey,
    listMyPrivateChannels,
  };
}

export default usePrivateChannelKeys;
