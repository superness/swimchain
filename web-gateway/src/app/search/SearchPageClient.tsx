'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SearchBox } from '@/components/SearchBox';
import { SearchFilters } from '@/components/SearchFilters';
import { SearchResultCard } from '@/components/SearchResultCard';
import type { SearchFilters as SearchFiltersType, SortOption, SearchResult } from '@/types/search';

interface SearchPageClientProps {
  initialQuery: string;
  initialSpace?: string;
  initialAuthor?: string;
  initialMinHeat?: string;
  initialMinEngagement?: string;
  initialTimeRange?: string;
  initialSort?: string;
  initialDecaying?: boolean;
  initialPage?: number;
}

/**
 * Parse search params from URLSearchParams into initial state.
 * Used for deep-link support when navigating back/forward.
 */
function parseFiltersFromParams(sp: URLSearchParams) {
  return {
    space: sp.get('space') || undefined,
    author: sp.get('author') || undefined,
    minHeat: sp.get('minHeat') ? (parseInt(sp.get('minHeat')!, 10) as 0 | 25 | 50 | 75 | 90) : undefined,
    minEngagement: sp.get('minEngagement') ? (parseInt(sp.get('minEngagement')!, 10) as 0 | 20 | 40 | 60) : undefined,
    timeRange: (sp.get('time') || 'all') as SearchFiltersType['timeRange'],
    includeDecaying: sp.get('decaying') === 'true',
  };
}

export function SearchPageClient({
  initialQuery,
  initialSpace,
  initialAuthor,
  initialMinHeat,
  initialMinEngagement,
  initialTimeRange,
  initialSort,
  initialDecaying,
  initialPage = 1,
}: SearchPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  // Sync state from URL search params for deep-link support
  const [query, setQuery] = useState(() => {
    const urlQ = searchParams?.get('q');
    return urlQ ?? initialQuery;
  });
  const [filters, setFilters] = useState<SearchFiltersType>(() => {
    const urlFilters = searchParams ? parseFiltersFromParams(searchParams) : null;
    if (urlFilters && (urlFilters.space || urlFilters.author || urlFilters.minHeat || urlFilters.timeRange !== 'all')) {
      return urlFilters;
    }
    return {
      space: initialSpace,
      author: initialAuthor,
      minHeat: initialMinHeat ? (parseInt(initialMinHeat, 10) as 0 | 25 | 50 | 75 | 90) : undefined,
      minEngagement: initialMinEngagement ? (parseInt(initialMinEngagement, 10) as 0 | 20 | 40 | 60) : undefined,
      timeRange: initialTimeRange as SearchFiltersType['timeRange'],
      includeDecaying: initialDecaying,
    };
  });
  const [sortBy, setSortBy] = useState<SortOption>(
    (initialSort as SortOption) || 'relevance'
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [nodeOffline, setNodeOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Update URL when filters change
  const updateURL = useCallback(() => {
    const params = new URLSearchParams();

    if (query) params.set('q', query);
    if (filters.space) params.set('space', filters.space);
    if (filters.author) params.set('author', filters.author);
    if (filters.minHeat) params.set('minHeat', String(filters.minHeat));
    if (filters.minEngagement) params.set('minEngagement', String(filters.minEngagement));
    if (filters.timeRange && filters.timeRange !== 'all') params.set('time', filters.timeRange);
    if (sortBy !== 'relevance') params.set('sort', sortBy);
    if (filters.includeDecaying) params.set('decaying', 'true');

    const newURL = params.toString() ? `/search?${params.toString()}` : '/search';
    router.push(newURL, { scroll: false });
  }, [query, filters, sortBy, router]);

  // Sync state when URL changes (browser back/forward)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const q = searchParams?.get('q') ?? '';
    const parsedFilters = searchParams ? parseFiltersFromParams(searchParams) : null;
    if (q !== query) setQuery(q);
    if (parsedFilters) setFilters(parsedFilters);
  }, [searchParams?.toString()]);

  // Perform search against live node content via the gateway search API
  const performSearch = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (filters.space) params.set('space', filters.space);
      if (filters.author) params.set('author', filters.author);
      if (filters.minHeat) params.set('minHeat', String(filters.minHeat));
      if (filters.minEngagement) params.set('minEngagement', String(filters.minEngagement));
      if (filters.timeRange && filters.timeRange !== 'all') params.set('time', filters.timeRange);
      if (filters.includeDecaying) params.set('decaying', 'true');
      params.set('sort', sortBy);
      params.set('pageSize', '50');

      const response = await fetch(`/api/search/query?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Search request failed (HTTP ${response.status})`);
      }
      const data = await response.json();
      setResults(Array.isArray(data.results) ? data.results : []);
      setNodeOffline(Boolean(data.nodeOffline));
    } catch {
      setResults([]);
      setNodeOffline(true);
      setError('Search is unavailable right now.');
    } finally {
      setIsLoading(false);
    }
  }, [filters, sortBy]);

  // Handle search
  const handleSearch = useCallback((newQuery: string) => {
    setQuery(newQuery);
    performSearch(newQuery);
  }, [performSearch]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: SearchFiltersType) => {
    setFilters(newFilters);
  }, []);

  // Handle sort changes
  const handleSortChange = useCallback((newSort: SortOption) => {
    setSortBy(newSort);
  }, []);

  // Update URL when state changes
  useEffect(() => {
    updateURL();
  }, [query, filters, sortBy]);

  // Re-run search when query, filters, or sort change
  useEffect(() => {
    performSearch(query);
  }, [performSearch, query]);

  return (
    <div className="search-page-client">
      <SearchBox
        initialQuery={query}
        onSearch={handleSearch}
        placeholder="Search posts, spaces, or identities..."
        autoFocus
      />

      <SearchFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
      />

      {nodeOffline && (
        <div className="node-offline-notice" role="status">
          <strong>Node offline</strong>
          <p>
            The gateway could not reach its Swimchain node. Search results are
            temporarily unavailable — please try again shortly.
          </p>
        </div>
      )}

      <div className="results-header">
        <span className="results-count">
          {isLoading ? 'Searching...' : `${results.length} results`}
        </span>
        <label className="breakdown-toggle">
          <input
            type="checkbox"
            checked={showBreakdown}
            onChange={(e) => setShowBreakdown(e.target.checked)}
          />
          Show ranking breakdown
        </label>
      </div>

      <div className="results-list">
        {results.length === 0 && !isLoading && !nodeOffline && (
          <div className="no-results">
            <p>{error ?? 'No results found.'}</p>
            <p className="text-muted">Try adjusting your search or filters.</p>
          </div>
        )}

        {results.map(result => (
          <SearchResultCard
            key={result.contentId}
            result={result}
            showScoreBreakdown={showBreakdown}
          />
        ))}
      </div>

      <style jsx>{`
        .search-page-client {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--color-border);
        }

        .results-count {
          font-size: 0.9rem;
          color: var(--color-text-muted);
        }

        .breakdown-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--color-text-muted);
          cursor: pointer;
        }

        .results-list {
          margin-top: 1rem;
        }

        .no-results {
          text-align: center;
          padding: 3rem 1rem;
        }
      `}</style>
    </div>
  );
}
