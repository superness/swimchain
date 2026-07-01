/**
 * SearchResults Container Component
 *
 * Displays search results with tabs, filters, and pagination.
 */

import { useMemo } from 'react';
import { SearchResult, SearchTab, SearchSortOption, ThreadInfo, ReplyInfo, UserInfo, SpaceInfo } from '../types';
import { ThreadResult } from './ResultCard/ThreadResult';
import { SpaceResult } from './ResultCard/SpaceResult';
import { ReplyResult } from './ResultCard/ReplyResult';
import { UserResult } from './ResultCard/UserResult';
import { SearchFilters } from './SearchFilters';
import { Pagination } from './Pagination';
import { useBlocklist } from '../hooks/useBlocklist';
import './SearchResults.css';

interface SearchResultsProps {
  results: SearchResult[];
  total: number;
  loading: boolean;
  error: string | null;
  took: number;
  query: string;
  activeTab: SearchTab;
  sortBy: SearchSortOption;
  dateRange?: 'any' | 'day' | 'week' | 'month' | 'year';
  onTabChange: (tab: SearchTab) => void;
  onSortChange: (sort: SearchSortOption) => void;
  onDateRangeChange?: (range: 'any' | 'day' | 'week' | 'month' | 'year') => void;
  onLoadMore: () => void;
  hasMore: boolean;
  page: number;
  searchTerms: string[];
  searchPhrases: string[];
}

const TABS: { id: SearchTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'spaces', label: 'Spaces' },
  { id: 'threads', label: 'Threads' },
  { id: 'replies', label: 'Replies' },
  { id: 'users', label: 'Users' },
];

export function SearchResults({
  results,
  total,
  loading,
  error,
  took,
  query,
  activeTab,
  sortBy,
  onTabChange,
  onSortChange,
  onDateRangeChange,
  dateRange,
  onLoadMore,
  hasMore,
  page,
  searchTerms,
  searchPhrases,
}: SearchResultsProps) {
  const { isUserBlocked, isBlocked } = useBlocklist();

  // Filter out blocked results
  const filteredResults = useMemo(() => {
    return results.filter(result => {
      const data = result.data;
      switch (result.type) {
        case 'thread': {
          const t = data as ThreadInfo;
          return !isBlocked(t.contentId, 'post') && !isUserBlocked(t.authorId);
        }
        case 'reply': {
          const r = data as ReplyInfo;
          return !isBlocked(r.contentId, 'reply') && !isUserBlocked(r.authorId);
        }
        case 'user': {
          const u = data as UserInfo;
          return !isUserBlocked(u.identityId);
        }
        case 'space': {
          const s = data as SpaceInfo;
          return !isBlocked(s.spaceId, 'space');
        }
        default:
          return true;
      }
    });
  }, [results, isUserBlocked, isBlocked]);

  // Render result card based on type
  const renderResult = (result: SearchResult) => {
    const key = `${result.type}-${result.id}`;

    switch (result.type) {
      case 'thread':
        return (
          <ThreadResult
            key={key}
            result={result}
            searchTerms={searchTerms}
            searchPhrases={searchPhrases}
          />
        );
      case 'space':
        return (
          <SpaceResult
            key={key}
            result={result}
            searchTerms={searchTerms}
            searchPhrases={searchPhrases}
          />
        );
      case 'reply':
        return (
          <ReplyResult
            key={key}
            result={result}
            searchTerms={searchTerms}
            searchPhrases={searchPhrases}
          />
        );
      case 'user':
        return (
          <UserResult
            key={key}
            result={result}
            searchTerms={searchTerms}
            searchPhrases={searchPhrases}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="search-results">
      {/* Tabs */}
      <nav className="search-tabs" role="tablist" aria-label="Result types">
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`search-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Results count and time */}
      {!loading && !error && filteredResults.length > 0 && (
        <div className="search-meta">
          <span className="result-count">
            About {total.toLocaleString()} result{total !== 1 ? 's' : ''}
          </span>
          <span className="result-time">
            ({(took / 1000).toFixed(2)} seconds)
          </span>
        </div>
      )}

      {/* Filters */}
      <SearchFilters
        sortBy={sortBy}
        onSortChange={onSortChange}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
      />

      {/* Error state */}
      {error && (
        <div className="search-error" role="alert">
          <span className="error-icon">!</span>
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && results.length === 0 && (
        <div className="search-loading" aria-live="polite">
          <div className="loading-spinner" />
          <span>Searching...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredResults.length === 0 && query && (
        <div className="search-empty">
          <p className="empty-title">No results found for "{query}"</p>
          <ul className="empty-suggestions">
            <li>Check your spelling</li>
            <li>Try different keywords</li>
            <li>Try more general terms</li>
            <li>Use fewer filters</li>
          </ul>
        </div>
      )}

      {/* Results list */}
      {filteredResults.length > 0 && (
        <div className="results-list" role="list">
          {filteredResults.map(result => renderResult(result))}
        </div>
      )}

      {/* Load more / Pagination */}
      {hasMore && !loading && (
        <Pagination
          page={page}
          total={total}
          resultsPerPage={20}
          onLoadMore={onLoadMore}
        />
      )}

      {/* Loading more indicator */}
      {loading && filteredResults.length > 0 && (
        <div className="loading-more">
          <div className="loading-spinner small" />
          <span>Loading more...</span>
        </div>
      )}
    </div>
  );
}
