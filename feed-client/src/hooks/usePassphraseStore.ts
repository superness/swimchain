/**
 * Hook for storing passphrases locally
 *
 * Stores passphrases in localStorage so users don't have to re-enter them
 * for content they've already unlocked.
 *
 * Supports a "default passphrase" that is tried automatically for all
 * encrypted content - useful if you use the same passphrase frequently.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'swimchain-feed-passphrases';
const DEFAULT_PASSPHRASE_KEY = 'swimchain-feed-default-passphrase';

interface PassphraseEntry {
  contentId: string;
  passphrase: string;
  savedAt: number;
}

interface UsePassphraseStoreResult {
  /** Get stored passphrase for a content ID (tries default if no specific one) */
  getPassphrase: (contentId: string) => string | null;
  /** Get all passphrases to try (content-specific first, then default) */
  getPassphrasesToTry: (contentId: string) => string[];
  /** Store passphrase for a content ID */
  savePassphrase: (contentId: string, passphrase: string) => void;
  /** Remove stored passphrase */
  removePassphrase: (contentId: string) => void;
  /** Check if passphrase is stored */
  hasPassphrase: (contentId: string) => boolean;
  /** Clear all stored passphrases */
  clearAll: () => void;
  /** Get all stored content IDs */
  getStoredIds: () => string[];
  /** Get the default passphrase */
  defaultPassphrase: string | null;
  /** Set the default passphrase (used for all encrypted content) */
  setDefaultPassphrase: (passphrase: string | null) => void;
  /** Check if default passphrase is set */
  hasDefaultPassphrase: boolean;
}

export function usePassphraseStore(): UsePassphraseStoreResult {
  const [store, setStore] = useState<Map<string, PassphraseEntry>>(new Map());
  const [defaultPassphrase, setDefaultPassphraseState] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      // Load per-content passphrases
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const entries = JSON.parse(stored) as PassphraseEntry[];
        const map = new Map(entries.map(e => [e.contentId, e]));
        setStore(map);
      }

      // Load default passphrase
      const defaultPass = localStorage.getItem(DEFAULT_PASSPHRASE_KEY);
      if (defaultPass) {
        setDefaultPassphraseState(defaultPass);
      }
    } catch (error) {
      console.error('[PassphraseStore] Failed to load:', error);
    }
  }, []);

  // Save per-content passphrases to localStorage
  const saveToStorage = useCallback((map: Map<string, PassphraseEntry>) => {
    try {
      const entries = Array.from(map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('[PassphraseStore] Failed to save:', error);
    }
  }, []);

  // Get passphrase for content (returns content-specific or default)
  const getPassphrase = useCallback((contentId: string): string | null => {
    return store.get(contentId)?.passphrase ?? defaultPassphrase;
  }, [store, defaultPassphrase]);

  // Get all passphrases to try (content-specific first, then default)
  const getPassphrasesToTry = useCallback((contentId: string): string[] => {
    const passphrases: string[] = [];
    const contentSpecific = store.get(contentId)?.passphrase;
    if (contentSpecific) {
      passphrases.push(contentSpecific);
    }
    if (defaultPassphrase && defaultPassphrase !== contentSpecific) {
      passphrases.push(defaultPassphrase);
    }
    return passphrases;
  }, [store, defaultPassphrase]);

  const savePassphrase = useCallback((contentId: string, passphrase: string) => {
    const newStore = new Map(store);
    newStore.set(contentId, {
      contentId,
      passphrase,
      savedAt: Date.now(),
    });
    setStore(newStore);
    saveToStorage(newStore);
  }, [store, saveToStorage]);

  const removePassphrase = useCallback((contentId: string) => {
    const newStore = new Map(store);
    newStore.delete(contentId);
    setStore(newStore);
    saveToStorage(newStore);
  }, [store, saveToStorage]);

  const hasPassphrase = useCallback((contentId: string): boolean => {
    return store.has(contentId) || defaultPassphrase !== null;
  }, [store, defaultPassphrase]);

  const clearAll = useCallback(() => {
    setStore(new Map());
    setDefaultPassphraseState(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEFAULT_PASSPHRASE_KEY);
  }, []);

  const getStoredIds = useCallback((): string[] => {
    return Array.from(store.keys());
  }, [store]);

  const setDefaultPassphrase = useCallback((passphrase: string | null) => {
    setDefaultPassphraseState(passphrase);
    if (passphrase) {
      localStorage.setItem(DEFAULT_PASSPHRASE_KEY, passphrase);
    } else {
      localStorage.removeItem(DEFAULT_PASSPHRASE_KEY);
    }
  }, []);

  return {
    getPassphrase,
    getPassphrasesToTry,
    savePassphrase,
    removePassphrase,
    hasPassphrase,
    clearAll,
    getStoredIds,
    defaultPassphrase,
    setDefaultPassphrase,
    hasDefaultPassphrase: defaultPassphrase !== null,
  };
}
