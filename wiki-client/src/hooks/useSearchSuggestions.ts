/**
 * Hook for search autocomplete suggestions
 */

import { useState, useEffect, useRef } from 'react';
import { useRpc } from './useRpc';
import { useSearchHistory } from './useSearchHistory';

interface UseSearchSuggestionsResult {
  suggestions: string[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to get autocomplete suggestions for search input
 *
 * @param prefix - The current search input text
 * @param debounceMs - Debounce delay in milliseconds (default 200)
 * @param minLength - Minimum prefix length to trigger suggestions (default 2)
 */
export function useSearchSuggestions(
  prefix: string,
  debounceMs = 200,
  minLength = 2
): UseSearchSuggestionsResult {
  const { rpc, connected } = useRpc();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest prefix to avoid stale updates
  const latestPrefixRef = useRef(prefix);

  useEffect(() => {
    latestPrefixRef.current = prefix;

    // Clear suggestions if prefix is too short
    if (prefix.length < minLength) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Don't fetch if not connected
    if (!rpc || !connected) {
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await rpc.searchSuggest(prefix, 8);

        // Only update if this is still the latest request
        if (latestPrefixRef.current === prefix) {
          setSuggestions(results);
          setLoading(false);
        }
      } catch (err) {
        if (latestPrefixRef.current === prefix) {
          setError(err instanceof Error ? err.message : 'Failed to get suggestions');
          setSuggestions([]);
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [prefix, debounceMs, minLength, rpc, connected]);

  return { suggestions, loading, error };
}

/**
 * Hook to get trending searches
 */
export function useTrendingSearches(): {
  trending: string[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { rpc, connected } = useRpc();
  const { history } = useSearchHistory();
  const [trending, setTrending] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = async () => {
    if (!rpc || !connected) {
      // Fall back to user's recent search history
      setTrending(history.slice(0, 8));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await rpc.trendingSearches(10);
      setTrending(results);
    } catch {
      // RPC trending not available — show user's recent searches instead
      setTrending(history.slice(0, 8));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrending();
  }, [rpc, connected]);

  return { trending, loading, error, refresh: fetchTrending };
}
