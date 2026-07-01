/**
 * Wiki Search - Search results page using useWikiSearch hook.
 * Shows results with page title, snippet, namespace, date, and relevance.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useWikiSearch } from '../hooks/useWikiSearch';
import { useWikiNamespaces } from '../hooks/useWikiNamespaces';
import type { WikiPage } from '../types/wiki';
import './WikiSearch.css';

function truncateAddress(addr: string): string {
  if (addr.length <= 16) return addr;
  return addr.substring(0, 8) + '...' + addr.substring(addr.length - 6);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function makeSnippet(content: string, query: string, maxLen = 200): string {
  if (!content) return '';
  const lower = content.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);

  let start: number;
  if (idx >= 0) {
    start = Math.max(0, idx - 60);
  } else {
    start = 0;
  }

  let snippet = content.substring(start, start + maxLen);
  if (start > 0) snippet = '...' + snippet;
  if (start + maxLen < content.length) snippet = snippet + '...';
  return snippet;
}

export function WikiSearch(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') ?? '';

  const [inputValue, setInputValue] = useState(queryParam);
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');

  const { data: results, loading, error, refetch } = useWikiSearch(queryParam);
  const { data: namespaces } = useWikiNamespaces();

  // Sync input when URL changes
  useEffect(() => {
    setInputValue(queryParam);
  }, [queryParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      setSearchParams({ q: trimmed });
    }
  };

  // Build namespace lookup
  const nsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ns of namespaces) {
      map.set(ns.id, ns.name);
    }
    return map;
  }, [namespaces]);

  // Filter by namespace
  const filteredResults = useMemo(() => {
    if (namespaceFilter === 'all') return results;
    return results.filter(r => r.namespaceId === namespaceFilter);
  }, [results, namespaceFilter]);

  // Get unique namespaces from results for filter dropdown
  const resultNamespaces = useMemo(() => {
    const ids = new Set<string>();
    for (const r of results) {
      ids.add(r.namespaceId);
    }
    return Array.from(ids);
  }, [results]);

  return (
    <div className="wiki-search-page">
      <div className="wiki-breadcrumbs">
        <Link to="/">Home</Link>
        <span className="wiki-breadcrumbs__separator">&gt;</span>
        <span>Search</span>
      </div>

      <h1 className="wiki-page-title">Search</h1>

      <form onSubmit={handleSearch} className="ws-search-form">
        <input
          className="wiki-search-input"
          type="text"
          placeholder="Search wiki pages..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          autoFocus
        />
        <button type="submit" className="wiki-btn wiki-btn--primary">
          Search
        </button>
      </form>

      {queryParam && !loading && !error && (
        <div className="ws-results-header">
          <span className="ws-results-count">
            {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} for &ldquo;{queryParam}&rdquo;
          </span>

          {resultNamespaces.length > 1 && (
            <select
              className="ws-ns-filter"
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
            >
              <option value="all">All namespaces</option>
              {resultNamespaces.map(nsId => (
                <option key={nsId} value={nsId}>
                  {nsMap.get(nsId) ?? nsId.substring(0, 12)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {loading && <div className="wiki-loading">Searching...</div>}

      {error && (
        <div className="ws-error">
          <p>{error}</p>
          <button className="wiki-btn" onClick={refetch}>Retry</button>
        </div>
      )}

      {queryParam && !loading && !error && filteredResults.length === 0 && (
        <div className="wiki-empty">
          <div className="wiki-empty__title">No results found</div>
          <p>Try different keywords or check your spelling.</p>
        </div>
      )}

      {!queryParam && !loading && (
        <div className="wiki-empty">
          <div className="wiki-empty__title">Enter a search query</div>
          <p>Search across all wiki pages and namespaces.</p>
        </div>
      )}

      {filteredResults.length > 0 && (
        <div className="ws-results">
          {filteredResults.map((page: WikiPage) => (
            <div key={page.id} className="ws-result">
              <div className="ws-result__title">
                <Link to={`/ns/${page.namespaceId}/page/${page.id}`}>
                  {page.title}
                </Link>
              </div>
              <div className="ws-result__meta">
                <span className="ws-result__ns">
                  <Link to={`/ns/${page.namespaceId}`}>
                    {nsMap.get(page.namespaceId) ?? page.namespaceId.substring(0, 12)}
                  </Link>
                </span>
                <span className="ws-result__date">
                  Last edited: {formatDate(page.lastEdited)}
                </span>
                <span className="ws-result__author" title={page.authorAddress}>
                  by {truncateAddress(page.authorAddress)}
                </span>
              </div>
              <div className="ws-result__snippet">
                {makeSnippet(page.content, queryParam)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
