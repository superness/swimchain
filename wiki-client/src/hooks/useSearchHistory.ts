/**
 * Hook for managing local search history
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'search-history';
const MAX_HISTORY_ITEMS = 20;

interface UseSearchHistoryResult {
  history: string[];
  addToHistory: (query: string) => void;
  removeFromHistory: (query: string) => void;
  clearHistory: () => void;
}

export function useSearchHistory(): UseSearchHistoryResult {
  const [history, setHistory] = useState<string[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, []);

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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save search history:', error);
      }

      return updated;
    });
  }, []);

  /**
   * Remove a specific query from history
   */
  const removeFromHistory = useCallback((query: string) => {
    setHistory(prev => {
      const filtered = prev.filter(q => q !== query);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      } catch (error) {
        console.error('Failed to save search history:', error);
      }

      return filtered;
    });
  }, []);

  /**
   * Clear all search history
   */
  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
    setHistory([]);
  }, []);

  return {
    history,
    addToHistory,
    removeFromHistory,
    clearHistory,
  };
}
