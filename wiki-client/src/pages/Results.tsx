/**
 * Results Page - Search Results
 *
 * Displays search results with tabs, filters, and pagination.
 * Search query is stored in URL query params for shareability.
 */

import { useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { SearchResults } from '../components/SearchResults';
import { useSearch } from '../hooks/useSearch';
import { getHighlightTerms } from '../lib/queryParser';
import './Results.css';

export function Results() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get('q') || '';

  const {
    results,
    total,
    loading,
    error,
    took,
    query,
    parsedQuery,
    activeTab,
    sortBy,
    dateRange,
    search,
    setActiveTab,
    setSortBy,
    setDateRange,
    loadMore,
    hasMore,
    page,
  } = useSearch();

  // Execute search when query param changes
  useEffect(() => {
    if (queryParam && queryParam !== query) {
      search(queryParam);
    }
  }, [queryParam, query, search]);

  // Handle new search
  const handleSearch = useCallback((newQuery: string) => {
    navigate(`/search?q=${encodeURIComponent(newQuery)}`);
  }, [navigate]);

  // Handle logo click - go to home
  const handleLogoClick = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // Get highlight terms from parsed query
  const { terms, phrases } = parsedQuery
    ? getHighlightTerms(parsedQuery)
    : { terms: [], phrases: [] };

  return (
    <div className="results-page">
      {/* Skip to main content link for keyboard accessibility (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      {/* Header with search bar */}
      <header className="results-header">
        <button className="header-logo" onClick={handleLogoClick}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span>Search</span>
        </button>

        <div className="header-search">
          <SearchBar
            initialQuery={queryParam}
            onSearch={handleSearch}
            placeholder="Search..."
          />
        </div>

        <div className="header-actions" />
      </header>

      {/* Main content */}
      <main id="main-content" className="results-main">
        <SearchResults
          results={results}
          total={total}
          loading={loading}
          error={error}
          took={took}
          query={query}
          activeTab={activeTab}
          sortBy={sortBy}
          dateRange={dateRange}
          onTabChange={setActiveTab}
          onSortChange={setSortBy}
          onDateRangeChange={setDateRange}
          onLoadMore={loadMore}
          hasMore={hasMore}
          page={page}
          searchTerms={terms}
          searchPhrases={phrases}
        />
      </main>

      {/* Footer */}
      <footer className="results-footer">
        <div className="footer-content">
          <a href="/">Swimchain Search</a>
        </div>
      </footer>
    </div>
  );
}
