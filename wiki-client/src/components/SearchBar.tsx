/**
 * SearchBar Component
 *
 * Main search input with icon, suggestions dropdown, and keyboard navigation.
 * Google-style clean design.
 */

import { useState, useRef, useEffect, useCallback, KeyboardEvent, FormEvent } from 'react';
import { useSearchSuggestions } from '../hooks/useSearchSuggestions';
import { useSearchHistory } from '../hooks/useSearchHistory';
import './SearchBar.css';

interface SearchBarProps {
  /** Initial search query */
  initialQuery?: string;
  /** Called when search is submitted */
  onSearch: (query: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to show the large homepage style */
  large?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function SearchBar({
  initialQuery = '',
  onSearch,
  placeholder = 'Search posts, spaces, users...',
  large = false,
  autoFocus = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get suggestions
  const { suggestions } = useSearchSuggestions(query);
  const { history } = useSearchHistory();

  // Combined suggestions: history first (if query is empty), then suggestions
  const displayItems = query.length < 2
    ? history.slice(0, 5)
    : suggestions;

  // Handle click outside to close suggestions
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle form submission
  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowSuggestions(false);
    }
  }, [query, onSearch]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || displayItems.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (query.trim()) {
          onSearch(query.trim());
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < displayItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : displayItems.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < displayItems.length) {
          const selected = displayItems[selectedIndex];
          if (selected) {
            setQuery(selected);
            onSearch(selected);
            setShowSuggestions(false);
          }
        } else if (query.trim()) {
          onSearch(query.trim());
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
      case 'Tab':
        if (selectedIndex >= 0 && selectedIndex < displayItems.length) {
          e.preventDefault();
          const selected = displayItems[selectedIndex];
          if (selected) {
            setQuery(selected);
          }
        }
        break;
    }
  }, [showSuggestions, displayItems, selectedIndex, query, onSearch]);

  // Select suggestion by click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setQuery(suggestion);
    onSearch(suggestion);
    setShowSuggestions(false);
  }, [onSearch]);

  // Clear input
  const handleClear = useCallback(() => {
    setQuery('');
    inputRef.current?.focus();
    setShowSuggestions(false);
  }, []);

  // Focus handler
  const handleFocus = useCallback(() => {
    if (query.length < 2 && history.length > 0) {
      setShowSuggestions(true);
    } else if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  }, [query, history, suggestions]);

  // Input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);

    if (value.length >= 2 || (value.length < 2 && history.length > 0)) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [history]);

  return (
    <div
      className={`search-bar-container ${large ? 'search-bar-large' : ''}`}
      ref={containerRef}
    >
      <form onSubmit={handleSubmit} className="search-bar">
        <span className="search-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </span>

        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={showSuggestions}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls="search-suggestions-listbox"
          aria-activedescendant={selectedIndex >= 0 ? `search-suggestion-${selectedIndex}` : undefined}
        />

        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        <button type="submit" className="search-submit" aria-label="Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
      </form>

      {/* Suggestions dropdown */}
      {showSuggestions && displayItems.length > 0 && (
        <ul className="search-suggestions" role="listbox" id="search-suggestions-listbox">
          {displayItems.map((item, index) => (
            <li
              key={item}
              id={`search-suggestion-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSuggestionClick(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="suggestion-icon">
                {query.length < 2 ? (
                  // History icon
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                ) : (
                  // Search icon
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                )}
              </span>
              <span className="suggestion-text">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
