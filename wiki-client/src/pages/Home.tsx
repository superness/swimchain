/**
 * Home Page - Search Homepage
 *
 * Google-style search page with large centered search bar,
 * trending searches, and recent search history.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';
import { useSearchHistory } from '../hooks/useSearchHistory';
import { useTrendingSearches } from '../hooks/useSearchSuggestions';
import './Home.css';

export function Home() {
  const navigate = useNavigate();
  const { history, clearHistory } = useSearchHistory();
  const { trending } = useTrendingSearches();

  const handleSearch = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  const handleTrendingClick = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  const handleHistoryClick = useCallback((query: string) => {
    navigate(`/search?q=${encodeURIComponent(query)}`);
  }, [navigate]);

  return (
    <div className="home-page">
      {/* Skip to main content link for keyboard accessibility (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      {/* Header */}
      <header className="home-header">
        <div className="logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span className="logo-text">Swimchain Search</span>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="home-main">
        {/* Logo and title */}
        <div className="home-logo">
          <svg width="120" height="40" viewBox="0 0 120 40" fill="none">
            <text x="0" y="32" fontSize="32" fontWeight="300" fill="currentColor">
              Search
            </text>
          </svg>
          <p className="home-tagline">Discover content across the decentralized network</p>
        </div>

        {/* Search bar */}
        <div className="home-search">
          <SearchBar
            onSearch={handleSearch}
            placeholder="Search posts, spaces, users..."
            large
            autoFocus
          />
        </div>

        {/* Quick tips */}
        <div className="search-tips">
          <span className="tip-label">Try:</span>
          <code>author:alice</code>
          <code>type:thread</code>
          <code>"exact phrase"</code>
          <code>after:2024-01-01</code>
        </div>

        {/* Trending / suggested searches */}
        {trending.length > 0 && (
          <section className="home-section">
            <h2 className="section-title">Suggested Searches</h2>
            <ul className="trending-list">
              {trending.map((query, index) => (
                <li key={index}>
                  <button
                    className="trending-item"
                    onClick={() => handleTrendingClick(query)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                    {query}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recent searches */}
        {history.length > 0 && (
          <section className="home-section">
            <div className="section-header">
              <h2 className="section-title">Recent Searches</h2>
              <button className="clear-history" onClick={clearHistory}>
                Clear History
              </button>
            </div>
            <ul className="history-list">
              {history.slice(0, 8).map((query, index) => (
                <li key={index}>
                  <button
                    className="history-item"
                    onClick={() => handleHistoryClick(query)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {query}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="home-footer">
        <div className="footer-info">
          <p>Powered by Swimchain - Decentralized Content Network</p>
        </div>
      </footer>
    </div>
  );
}
