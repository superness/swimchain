/**
 * Private Space Key Storage Hook for Bridge Client
 *
 * Manages AES-256-GCM keys for private spaces that can be bridged.
 * Keys are stored in localStorage for persistence.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

const STORAGE_KEY = 'swimchain-bridge-private-keys';

export interface PrivateSpaceKey {
  spaceId: string;
  keyHex: string;
  addedAt: number;
  spaceName?: string;
}

function loadKeys(): Map<string, PrivateSpaceKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: Record<string, PrivateSpaceKey> = JSON.parse(raw);
      return new Map(Object.entries(parsed));
    }
  } catch { /* ignore */ }
  return new Map();
}

function persistKeys(keys: Map<string, PrivateSpaceKey>): void {
  const obj: Record<string, PrivateSpaceKey> = {};
  keys.forEach((v, k) => { obj[k] = v; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

/**
 * Hook for managing private space keys in the bridge
 */
export function usePrivateSpaceKeys() {
  const [keys, setKeys] = useState<Map<string, PrivateSpaceKey>>(() => loadKeys());

  // Sync with localStorage on changes
  useEffect(() => {
    persistKeys(keys);
  }, [keys]);

  const getSpaceKey = useCallback((spaceId: string): string | null => {
    return keys.get(spaceId)?.keyHex || null;
  }, [keys]);

  const getSpaceKeyBytes = useCallback((spaceId: string): Uint8Array | null => {
    const hex = keys.get(spaceId)?.keyHex;
    if (!hex) return null;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }, [keys]);

  const storeSpaceKey = useCallback((
    spaceId: string,
    keyHex: string,
    spaceName?: string
  ): void => {
    setKeys(prev => {
      const next = new Map(prev);
      next.set(spaceId, {
        spaceId,
        keyHex,
        addedAt: Date.now(),
        spaceName,
      });
      return next;
    });
  }, []);

  const removeSpaceKey = useCallback((spaceId: string): void => {
    setKeys(prev => {
      const next = new Map(prev);
      next.delete(spaceId);
      return next;
    });
  }, []);

  const hasSpaceKey = useCallback((spaceId: string): boolean => {
    return keys.has(spaceId);
  }, [keys]);

  const listPrivateSpaces = useMemo((): PrivateSpaceKey[] => {
    return Array.from(keys.values()).sort((a, b) => b.addedAt - a.addedAt);
  }, [keys]);

  const spaceCount = useMemo(() => keys.size, [keys]);

  return {
    getSpaceKey,
    getSpaceKeyBytes,
    storeSpaceKey,
    removeSpaceKey,
    hasSpaceKey,
    listPrivateSpaces,
    spaceCount,
  };
}
