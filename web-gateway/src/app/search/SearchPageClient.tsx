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

// Mock data for demonstration
const MOCK_RESULTS: SearchResult[] = [
  {
    contentId: 'post-1',
    spaceId: 'rust-lang',
    spaceName: 'rust-lang',
    authorId: 'cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m',
    title: 'Async traits finally stable in Rust 1.75!',
    body: 'After years of waiting, async traits are now stable in Rust. This is a huge milestone for the ecosystem...',
    createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    lastEngagement: Date.now() - 30 * 60 * 1000,
    replyCount: 47,
    survivalProbability: 0.82,
    isDecayed: false,
    isProtected: false,
    hoursUntilDecay: 168,
    pool: {
      poolId: 'pool-1',
      contributedSeconds: 45,
      requiredSeconds: 60,
      contributorCount: 12,
      timeRemainingMs: 900000,
      progressPercentage: 75,
    },
    scoreBreakdown: {
      textRelevance: 85,
      heatDecay: 82,
      engagementPool: 75,
      recency: 95,
      totalScore: 84.3,
      contributions: {
        textRelevance: 34,
        heatDecay: 20.5,
        engagementPool: 15,
        recency: 14.25,
      },
    },
  },
  {
    contentId: 'post-2',
    spaceId: 'rust-lang',
    spaceName: 'rust-lang',
    authorId: 'cs1qab3cd4ef5gh6ij7kl8mn9op0qr1st2uv3wx4yz5ab',
    title: 'Performance tips for Rust beginners',
    body: 'Here are some tips I wish I knew when I started with Rust performance optimization...',
    createdAt: Date.now() - 8 * 60 * 60 * 1000, // 8 hours ago
    lastEngagement: Date.now() - 2 * 60 * 60 * 1000,
    replyCount: 23,
    survivalProbability: 0.71,
    isDecayed: false,
    isProtected: false,
    hoursUntilDecay: 144,
    pool: {
      poolId: 'pool-2',
      contributedSeconds: 30,
      requiredSeconds: 60,
      contributorCount: 8,
      timeRemainingMs: 1800000,
      progressPercentage: 50,
    },
    scoreBreakdown: {
      textRelevance: 70,
      heatDecay: 71,
      engagementPool: 50,
      recency: 80,
      totalScore: 69.75,
      contributions: {
        textRelevance: 28,
        heatDecay: 17.75,
        engagementPool: 10,
        recency: 12,
      },
    },
  },
  {
    contentId: 'post-3',
    spaceId: 'boston',
    spaceName: 'boston',
    authorId: 'cs1qcd5ef6gh7ij8kl9mn0op1qr2st3uv4wx5yz6ab7cd',
    title: 'Best coffee shops near Kendall Square?',
    body: 'Just moved to the area. Looking for good spots to work from. Bonus points for outdoor seating!',
    createdAt: Date.now() - 4 * 60 * 60 * 1000, // 4 hours ago
    lastEngagement: Date.now() - 1 * 60 * 60 * 1000,
    replyCount: 12,
    survivalProbability: 0.67,
    isDecayed: false,
    isProtected: false,
    hoursUntilDecay: 120,
    pool: {
      poolId: 'pool-3',
      contributedSeconds: 20,
      requiredSeconds: 60,
      contributorCount: 5,
      timeRemainingMs: 2400000,
      progressPercentage: 33,
    },
    scoreBreakdown: {
      textRelevance: 40,
      heatDecay: 67,
      engagementPool: 33,
      recency: 88,
      totalScore: 52.95,
      contributions: {
        textRelevance: 16,
        heatDecay: 16.75,
        engagementPool: 6.6,
        recency: 13.2,
      },
    },
  },
];

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
  const [results, setResults] = useState<SearchResult[]>(MOCK_RESULTS);
  const [isLoading, setIsLoading] = useState(false);
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

  // Perform search
  const performSearch = useCallback(async (searchQuery: string) => {
    setIsLoading(true);

    // In production, this would call the search API
    // For now, filter mock data
    await new Promise(resolve => setTimeout(resolve, 300));

    let filtered = [...MOCK_RESULTS];

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(
        r =>
          r.title.toLowerCase().includes(lowerQuery) ||
          r.body.toLowerCase().includes(lowerQuery)
      );
    }

    if (filters.space) {
      filtered = filtered.filter(r => r.spaceName === filters.space);
    }

    if (filters.minHeat) {
      filtered = filtered.filter(r => r.survivalProbability * 100 >= filters.minHeat!);
    }

    // Sort
    switch (sortBy) {
      case 'heat':
        filtered.sort((a, b) => b.survivalProbability - a.survivalProbability);
        break;
      case 'newest':
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'replies':
        filtered.sort((a, b) => b.replyCount - a.replyCount);
        break;
      default:
        filtered.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore);
    }

    setResults(filtered);
    setIsLoading(false);
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

  // Initial search
  useEffect(() => {
    performSearch(query);
  }, []);

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
        {results.length === 0 && !isLoading && (
          <div className="no-results">
            <p>No results found.</p>
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
