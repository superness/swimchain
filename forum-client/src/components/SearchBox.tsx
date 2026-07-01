/**
 * Search box component
 * Uses client-side filtering since there's no server search RPC
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './SearchBox.css';

export function SearchBox(): JSX.Element {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) return;

    // Navigate to search results page with query parameter
    const searchParams = new URLSearchParams();
    searchParams.set('q', query.trim());
    navigate(`/search?${searchParams.toString()}`);
  }, [query, navigate]);

  return (
    <form
      className={`search-box ${isFocused ? 'focused' : ''}`}
      onSubmit={handleSubmit}
      role="search"
    >
      <label htmlFor="search-input" className="visually-hidden">
        Search forums
      </label>
      <span className="search-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </span>
      <input
        id="search-input"
        type="search"
        className="search-input"
        placeholder="Search (Press / to focus)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        aria-label="Search forums"
      />
      <kbd className="search-shortcut" aria-hidden="true">/</kbd>
    </form>
  );
}
