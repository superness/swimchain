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

/**
 * Perform a search via the node RPC endpoint.
 * Falls back to the internal search API if direct node access fails.
 */
async function performRpcSearch(query: string, filters: SearchFiltersType, sortBy: SortOption): Promise<{ results: SearchResult[]; totalCount: number }> {
  try {
    // Call the node RPC endpoint directly for search
    const rpcUrl = getRpcEndpoint();
    const searchResponse = await fetch(`${rpcUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'search',
        params: {
          query,
          space_id: filters.space,
          author: filters.author,
          sort_by: sortBy === 'relevance' ? 'relevance' : sortBy,
          limit: 50,
          offset: 0,
        },
        id: 1,
      }),
    });

    if (!searchResponse.ok) {
      throw new Error(`RPC search failed: ${searchResponse.status}`);
    }

    const rpcResult = await searchResponse.json();
    if (rpcResult.error) {
      throw new Error(`RPC search error: ${rpcResult.error.message}`);
    }

    const rawResults: RawContentResponse[] = rpcResult.result || [];
    const nowMs = Date.now();

    const results: SearchResult[] = rawResults.map(raw => {
      const body = raw.item.body_inline || '';
      const title = extractTitle(body);
      const snippet = body.length > 200 ? body.slice(0, 197) + '...' : body;
      const replyCount = countReplies(raw);
      const textRelevanceScore = query ? 70 : 0; // approximate when no lunr available client-side

      return {
        contentId: raw.item.content_id,
        spaceId: raw.item.space_id,
        spaceName: raw.item.space_id,
        authorId: raw.item.author_id,
        title,
        body: snippet,
        createdAt: raw.item.created_at,
        lastEngagement: raw.item.last_engagement,
        replyCount,
        survivalProbability: raw.survival_probability,
        isDecayed: raw.is_decayed,
        isProtected: raw.is_protected,
        hoursUntilDecay: raw.hours_until_decay,
        pool: raw.pool ? {
          poolId: raw.pool.poolId,
          contributedSeconds: raw.pool.contributedSeconds,
          requiredSeconds: raw.pool.requiredSeconds,
          contributorCount: raw.pool.contributorCount,
          timeRemainingMs: raw.pool.timeRemainingMs,
          progressPercentage: raw.pool.progressPercentage,
        } : null,
        scoreBreakdown: calculateScore(textRelevanceScore, raw, nowMs),
      };
    });

    return { results, totalCount: results.length };
  } catch (error) {
    console.error('[Search] RPC search failed, falling back to API:', error);
    // Fallback: try the internal search API
    try {
      const params = new URLSearchParams({ q: query });
      if (filters.space) params.set('space', filters.space);
      if (filters.author) params.set('author', filters.author);
      params.set('sort', sortBy);

      const response = await fetch(`/api/search?${params.toString()}`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Both failed
    }
    return { results: [], totalCount: 0 };
  }
}

/**
 * Get the RPC endpoint URL (works both client and server side)
 */
function getRpcEndpoint(): string {
  if (typeof window !== 'undefined') {
    // Client-side: read from meta tag or env
    const meta = document.querySelector('meta[name="node-rpc-url"]');
    if (meta) return meta.getAttribute('content') || '';
  }
  return process.env.NEXT_PUBLIC_NODE_RPC_URL || 'http://127.0.0.1:19736';
}

// Raw content response from node (matches node-rpc.ts)
interface RawContentResponse {
  item: {
    content_id: string;
    author_id: string;
    signature: string;
    created_at: number;
    last_engagement: number;
    content_type: string;
    parent_id: string | null;
    space_id: string;
    body_inline: string | null;
    content_hash: string | null;
    content_size: number | null;
    pow_nonce: number;
    pow_difficulty: number;
    engagement_count: number;
  };
  survival_probability: number;
  is_decayed: boolean;
  is_protected: boolean;
  hours_until_decay: number | null;
  pool: {
    poolId: string;
    contributedSeconds: number;
    requiredSeconds: number;
    contributorCount: number;
    timeRemainingMs: number | null;
    progressPercentage: number;
  } | null;
  children?: RawContentResponse[];
}

interface ScoreBreakdown {
  textRelevance: number;
  heatDecay: number;
  engagementPool: number;
  recency: number;
  totalScore: number;
  contributions: {
    textRelevance: number;
    heatDecay: number;
    engagementPool: number;
    recency: number;
  };
}

function calculateScore(textScore: number, content: RawContentResponse, nowMs: number): ScoreBreakdown {
  const textRelevance = Math.min(100, Math.max(0, textScore));
  const heatDecay = Math.min(100, Math.max(0, content.survival_probability * 100));
  const engagementPool = content.pool ? Math.min(100, Math.max(0, (content.pool.contributedSeconds / 60) * 100)) : 0;

  const ageMs = nowMs - content.item.created_at;
  const hoursOld = ageMs > 0 ? ageMs / (1000 * 60 * 60) : 0;
  const recency = Math.max(0, 100 * Math.exp(-hoursOld / 24));

  const contributions = {
    textRelevance: textRelevance * 0.40,
    heatDecay: heatDecay * 0.25,
    engagementPool: engagementPool * 0.20,
    recency: recency * 0.15,
  };

  return {
    textRelevance,
    heatDecay,
    engagementPool,
    recency,
    totalScore: contributions.textRelevance + contributions.heatDecay + contributions.engagementPool + contributions.recency,
    contributions,
  };
}

function extractTitle(body: string | null): string {
  if (!body) return '[No title]';
  const firstLine = body.split('\n')[0]?.replace(/^#+\s*/, '').trim() ?? '';
  if (firstLine.length > 0 && firstLine.length <= 100) return firstLine;
  if (body.length <= 100) return body.trim();
  return body.slice(0, 97).trim() + '...';
}

function countReplies(content: RawContentResponse): number {
  let count = content.children?.length ?? 0;
  for (const child of content.children ?? []) {
    count += countReplies(child);
  }
  return count;
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
  const [totalCount, setTotalCount] = useState(0);
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

  // Perform search via RPC
  const performSearch = useCallback(async (searchQuery: string) => {
    setIsLoading(true);

    try {
      const { results: searchResults, totalCount: count } = await performRpcSearch(
        searchQuery,
        filters,
        sortBy
      );
      setResults(searchResults);
      setTotalCount(count);
    } catch (error) {
      console.error('[Search] Search failed:', error);
      setResults([]);
      setTotalCount(0);
    }

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
          {isLoading ? 'Searching...' : `${totalCount} results`}
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
