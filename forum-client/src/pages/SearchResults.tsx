/**
 * Search results page
 * Uses server-side search via RPC
 */

import { useState, FormEvent } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useSpaces, useSearch } from '../hooks/useRpc';
import './SearchResults.css';

export function SearchResults(): JSX.Element {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { spaces, loading: spacesLoading } = useSpaces();
  const { results, total, loading: searchLoading, error: searchError } = useSearch(query);
  const navigate = useNavigate();

  // Local state for the search input
  const [searchInput, setSearchInput] = useState(query);

  // Handle search form submission
  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  // Format timestamp to relative time
  const formatTime = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  // Truncate text to max length
  const truncate = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Get space name by ID
  const getSpaceName = (spaceId: string): string => {
    const space = spaces.find(s => s.id === spaceId);
    return space?.name || spaceId.substring(0, 12) + '...';
  };

  if (!query.trim()) {
    return (
      <div className="search-results">
        <div className="search-header">
          <h1>Search</h1>
          <p>Find threads across all spaces.</p>
        </div>

        {/* Search input form */}
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              className="search-input"
              placeholder="Search threads, topics, or keywords..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search query"
              autoFocus
            />
            <button type="submit" className="btn btn-primary search-btn" disabled={!searchInput.trim()}>
              Search
            </button>
          </div>
        </form>

        {/* Empty state with browse spaces */}
        <div className="search-empty">
          <div className="search-empty-icon" aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <p className="search-empty-text">Enter a search query above to find content</p>
          <p className="search-empty-hint">Or browse spaces to discover discussions</p>
        </div>

        <div className="search-spaces">
          <h2>Browse Spaces</h2>
          {spacesLoading ? (
            <p>Loading spaces...</p>
          ) : spaces.length === 0 ? (
            <p className="spaces-empty">No spaces available yet. Sync with the network to discover content.</p>
          ) : (
            <ul className="space-list">
              {spaces.map((space) => (
                <li key={space.id}>
                  <Link to={`/spaces/${space.id}`} className="space-link">
                    {space.name}
                    <span className="space-count">{space.postCount} posts</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="search-header">
        <h1>Search Results</h1>
        <p className="search-query">
          Results for: <strong>"{query}"</strong>
          {!searchLoading && <span className="search-count"> ({total} found)</span>}
        </p>
      </div>

      {/* Search input form for new searches */}
      <form className="search-form" onSubmit={handleSearch}>
        <div className="search-input-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            className="search-input"
            placeholder="Search threads, topics, or keywords..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search query"
          />
          <button type="submit" className="btn btn-primary search-btn" disabled={!searchInput.trim()}>
            Search
          </button>
        </div>
      </form>

      {/* Loading state */}
      {searchLoading && (
        <div className="search-loading">
          <div className="search-loading-spinner" />
          <p>Searching...</p>
        </div>
      )}

      {/* Error state */}
      {searchError && (
        <div className="search-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>Search failed: {searchError}</p>
        </div>
      )}

      {/* Results */}
      {!searchLoading && !searchError && results.length > 0 && (
        <div className="search-results-list">
          {results.map((result) => (
            <div key={result.id} className={`search-result-card search-result-${result.type}`}>
              {result.type === 'space' ? (
                // Space result
                <Link to={`/spaces/${result.data.spaceId}`} className="search-result-link">
                  <div className="search-result-type">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    </svg>
                    <span>Space</span>
                  </div>
                  <h3 className="search-result-title">{result.data.name || 'Unnamed Space'}</h3>
                  {result.data.description && (
                    <p className="search-result-snippet">{truncate(result.data.description, 200)}</p>
                  )}
                  <div className="search-result-meta">
                    <span>{result.data.threadCount || 0} threads</span>
                  </div>
                </Link>
              ) : (
                // Thread result
                <Link to={`/spaces/${result.data.spaceId}/thread/${result.data.contentId}`} className="search-result-link">
                  <div className="search-result-type">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>Thread</span>
                  </div>
                  <h3 className="search-result-title">
                    {result.data.title || truncate(result.data.body || 'Untitled', 80)}
                  </h3>
                  {result.data.body && (
                    <p className="search-result-snippet">{truncate(result.data.body, 200)}</p>
                  )}
                  <div className="search-result-meta">
                    <span className="search-result-space">{getSpaceName(result.data.spaceId || '')}</span>
                    <span>{result.data.replyCount || 0} replies</span>
                    {result.data.createdAt && <span>{formatTime(result.data.createdAt)}</span>}
                  </div>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {!searchLoading && !searchError && results.length === 0 && (
        <div className="search-no-results">
          <div className="search-empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <p className="search-empty-text">No results found for "{query}"</p>
          <p className="search-empty-hint">Try different keywords or browse spaces below</p>
        </div>
      )}

      {/* Browse spaces fallback */}
      <div className="search-spaces">
        <h2>Browse Spaces</h2>
        {spacesLoading ? (
          <p>Loading spaces...</p>
        ) : spaces.length === 0 ? (
          <p className="spaces-empty">No spaces available. Connect to a node with synced content.</p>
        ) : (
          <ul className="space-list">
            {spaces.map((space) => (
              <li key={space.id}>
                <Link to={`/spaces/${space.id}`} className="space-link">
                  {space.name}
                  <span className="space-count">{space.postCount} posts</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
