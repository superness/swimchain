/**
 * Hook for managing local search history
 */

import { useState, useCallback, useEffect } from 'react';
import { useSearchIdentity, storageKeyFor } from './useSearchIdentity';

const STORAGE_KEY_BASE = 'search-history';
const MAX_HISTORY_ITEMS = 20;

interface UseSearchHistoryResult {
  history: string[];
  addToHistory: (query: string) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
}

export function useSearchHistory(): UseSearchHistoryResult {
  const [history, setHistory] = useState<string[]>([]);
  // Key history on the node address when embedded (node owns the identity), so
  // it is stable per identity and consistent with the other clients. Standalone
  // browser tabs keep the base key unchanged.
  const { nodeAddress } = useSearchIdentity();
  const storageKey = storageKeyFor(STORAGE_KEY_BASE, nodeAddress);

  // Load history from localStorage when the active storage key resolves
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
          return;
        }
      }
      setHistory([]);
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, [storageKey]);

  /**
   * Add a query to search history
   * - Removes duplicates (moves existing entry to top)
   * - Limits to MAX_HISTORY_ITEMS
   */
  const addToHistory = useCallback((query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setHistory(prev => {
      // Remove existing instance if present
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      // Add to front
      const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);

      // Persist to localStorage
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save search history:', error);
      }

      return updated;
    });
  }, [storageKey]);

  /**
   * Remove a specific query from history
   */
  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const filtered = prev.filter(q => q !== query);

      try {
        localStorage.setItem(storageKey, JSON.stringify(filtered));
      } catch (error) {
        console.error('Failed to save search history:', error);
      }

      return filtered;
    });
  }, [storageKey]);

  /**
   * Clear all search history
   */
  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
    setHistory([]);
  }, [storageKey]);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
