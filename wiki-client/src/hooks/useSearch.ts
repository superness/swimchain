/**
 * Main search hook with pagination support
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRpc } from './useRpc';
import { useSearchHistory } from './useSearchHistory';
import { parseQuery, buildQueryString as _buildQueryString } from '../lib/queryParser';
import type {
  SearchResult,
  SearchFilters,
  SearchTab,
  SearchSortOption,
  SearchParams,
  ParsedQuery,
} from '../types';

const RESULTS_PER_PAGE = 20;

type DateRange = 'any' | 'day' | 'week' | 'month' | 'year';

interface UseSearchResult {
  // Results
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  took: number;

  // Current search state
  query: string;
  parsedQuery: ParsedQuery | null;
  filters: SearchFilters;
  activeTab: SearchTab;
  sortBy: SearchSortOption;
  dateRange: DateRange;

  // Actions
  search: (query: string, filters?: SearchFilters) => Promise<void>;
  setActiveTab: (tab: SearchTab) => void;
  setSortBy: (sort: SearchSortOption) => void;
  setDateRange: (range: DateRange) => void;
  loadMore: () => Promise<void>;
  clear: () => void;

  // Pagination
  hasMore: boolean;
  page: number;
}

export function useSearch(): UseSearchResult {
  const { rpc, connected } = useRpc();
  const { addToHistory } = useSearchHistory();

  // Results state
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [took, setTook] = useState(0);

  // Search state
  const [query, setQuery] = useState('');
  const [parsedQuery, setParsedQuery] = useState<ParsedQuery | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [activeTab, setActiveTabState] = useState<SearchTab>('all');
  const [sortBy, setSortByState] = useState<SearchSortOption>('relevance');
  const [offset, setOffset] = useState(0);

  // Abort controller for cancelling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Build RPC params from parsed query and filters
   */
  const buildSearchParams = useCallback((
    parsed: ParsedQuery,
    currentFilters: SearchFilters,
    tab: SearchTab,
    sort: SearchSortOption,
    currentOffset: number
  ): SearchParams => {
    const params: SearchParams = {
      query: [
        ...parsed.terms,
        ...parsed.phrases.map(p => `"${p}"`),
      ].join(' '),
      sortBy: sort,
      limit: RESULTS_PER_PAGE,
      offset: currentOffset,
    };

    // Type filter from tab or parsed query
    if (tab !== 'all') {
      params.types = [tab === 'spaces' ? 'space' :
                     tab === 'threads' ? 'thread' :
                     tab === 'replies' ? 'reply' : 'user'];
    } else if (parsed.type) {
      params.types = [parsed.type];
    } else if (currentFilters.types && currentFilters.types.length > 0) {
      params.types = currentFilters.types;
    }

    // Author filter
    if (parsed.author) {
      params.author = parsed.author;
    } else if (currentFilters.author) {
      params.author = currentFilters.author;
    }

    // Space filter
    if (parsed.space) {
      params.spaceId = parsed.space;
    } else if (currentFilters.spaceId) {
      params.spaceId = currentFilters.spaceId;
    }

    // Date range filters
    if (parsed.after) {
      params.afterTimestamp = parsed.after;
    }
    if (parsed.before) {
      params.beforeTimestamp = parsed.before;
    }

    // Date range from UI filter
    if (currentFilters.dateRange && currentFilters.dateRange !== 'any') {
      const now = Math.floor(Date.now() / 1000);
      switch (currentFilters.dateRange) {
        case 'day':
          params.afterTimestamp = now - (24 * 60 * 60);
          break;
        case 'week':
          params.afterTimestamp = now - (7 * 24 * 60 * 60);
          break;
        case 'month':
          params.afterTimestamp = now - (30 * 24 * 60 * 60);
          break;
        case 'year':
          params.afterTimestamp = now - (365 * 24 * 60 * 60);
          break;
      }
    }

    // Other filters
    if (parsed.hasMedia !== undefined) {
      params.hasMedia = parsed.hasMedia;
    }
    if (parsed.minReplies !== undefined) {
      params.minReplies = parsed.minReplies;
    }
    if (parsed.minReactions !== undefined) {
      params.minReactions = parsed.minReactions;
    }
    if (parsed.excludeTerms.length > 0) {
      params.excludeTerms = parsed.excludeTerms;
    }

    return params;
  }, []);

  /**
   * Execute search
   */
  const search = useCallback(async (
    searchQuery: string,
    newFilters?: SearchFilters
  ): Promise<void> => {
    if (!rpc || !connected) {
      setError('Not connected to node');
      return;
    }

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setResults([]);
      setTotal(0);
      setQuery('');
      setParsedQuery(null);
      return;
    }

    // Cancel any pending request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    setQuery(trimmedQuery);
    setOffset(0);

    const currentFilters = newFilters ?? filters;
    if (newFilters) {
      setFilters(newFilters);
    }

    try {
      // Parse the query
      const parsed = parseQuery(trimmedQuery);
      setParsedQuery(parsed);

      // Build search params
      const params = buildSearchParams(
        parsed,
        currentFilters,
        activeTab,
        sortBy,
        0
      );

      // Execute search
      const response = await rpc.search(params);

      setResults(response.results);
      setTotal(response.total);
      setTook(response.took_ms);

      // Add to search history
      addToHistory(trimmedQuery);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, filters, activeTab, sortBy, buildSearchParams, addToHistory]);

  /**
   * Load more results (pagination)
   */
  const loadMore = useCallback(async (): Promise<void> => {
    if (!rpc || !connected || !parsedQuery || loading) {
      return;
    }

    const newOffset = offset + RESULTS_PER_PAGE;
    if (newOffset >= total) {
      return;
    }

    setLoading(true);

    try {
      const params = buildSearchParams(
        parsedQuery,
        filters,
        activeTab,
        sortBy,
        newOffset
      );

      const response = await rpc.search(params);

      setResults(prev => [...prev, ...response.results]);
      setOffset(newOffset);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more results');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected, parsedQuery, filters, activeTab, sortBy, offset, total, loading, buildSearchParams]);

  /**
   * Change active tab and re-search
   */
  const setActiveTab = useCallback((tab: SearchTab) => {
    setActiveTabState(tab);
    if (query) {
      // Trigger re-search with new tab
      setOffset(0);
    }
  }, [query]);

  // Re-search when tab or sort changes
  useEffect(() => {
    if (!query || !parsedQuery || !rpc) {
      return;
    }

    const abortController = new AbortController();

    const doSearch = async () => {
      setLoading(true);
      try {
        const params = buildSearchParams(parsedQuery, filters, activeTab, sortBy, 0);
        const response = await rpc.search(params);
        // Check if aborted before updating state
        if (abortController.signal.aborted) {
          return;
        }
        if (response) {
          setResults(response.results);
          setTotal(response.total);
          setTook(response.took_ms);
          setOffset(0);
        }
      } catch (err) {
        if (abortController.signal.aborted) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };
    doSearch();

    // Cleanup: abort pending request when tab/sort changes again
    return () => {
      abortController.abort();
    };
  }, [activeTab, sortBy, query, parsedQuery, filters, rpc, buildSearchParams]);

  /**
   * Change sort order and re-search
   */
  const setSortBy = useCallback((sort: SearchSortOption) => {
    setSortByState(sort);
  }, []);

  /**
   * Change date range filter and re-search
   */
  const setDateRange = useCallback((range: DateRange) => {
    setFilters(prev => ({ ...prev, dateRange: range }));
  }, []);

  /**
   * Clear search results
   */
  const clear = useCallback(() => {
    abortControllerRef.current?.abort();
    setResults([]);
    setTotal(0);
    setQuery('');
    setParsedQuery(null);
    setError(null);
    setOffset(0);
    setTook(0);
  }, []);

  const hasMore = results.length < total;
  const page = Math.floor(offset / RESULTS_PER_PAGE) + 1;

  const dateRange: DateRange = (filters.dateRange as DateRange) || 'any';

  return {
    results,
    total,
    loading,
    error,
    took,
    query,
    parsedQuery,
    filters,
    activeTab,
    sortBy,
    dateRange,
    search,
    setActiveTab,
    setSortBy,
    setDateRange,
    loadMore,
    clear,
    hasMore,
    page,
  };
}
