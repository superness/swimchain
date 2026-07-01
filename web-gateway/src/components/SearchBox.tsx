'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FormEvent, ChangeEvent, KeyboardEvent } from 'react';

interface SearchBoxProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  suggestions?: string[];
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Search input with debounced autocomplete
 */
export function SearchBox({
  initialQuery = '',
  onSearch,
  suggestions = [],
  placeholder = 'Search Swimchain...',
  autoFocus = false,
}: SearchBoxProps) {
  const [query, setQuery] = useState(initialQuery);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Update query when initialQuery changes
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  // Debounced search callback
  const debouncedSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        onSearch(value);
      }, 300);
    },
    [onSearch]
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowSuggestions(value.length > 0 && suggestions.length > 0);
    setSelectedIndex(-1);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onSearch(query);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;

      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          const selected = suggestions[selectedIndex];
          if (selected) {
            setQuery(selected);
            setShowSuggestions(false);
            onSearch(selected);
          }
        }
        break;

      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    onSearch(suggestion);
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    // Delay hiding to allow click on suggestion
    setTimeout(() => {
      setShowSuggestions(false);
    }, 150);
  };

  return (
    <div className="search-box">
      <form onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(query.length > 0 && suggestions.length > 0)}
            onBlur={handleBlur}
            placeholder={placeholder}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button type="submit" aria-label="Search">
            <SearchIcon />
          </button>
        </div>
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <ul className="search-suggestions" role="listbox">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion}
              role="option"
              aria-selected={index === selectedIndex}
              className={index === selectedIndex ? 'selected' : ''}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .search-box {
          position: relative;
          width: 100%;
          max-width: 600px;
        }

        .search-input-wrapper {
          display: flex;
          align-items: stretch;
        }

        input {
          flex: 1;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 1px solid var(--color-border);
          border-right: none;
          border-radius: 6px 0 0 6px;
          background: var(--color-bg);
          color: var(--color-text);
        }

        input:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        button {
          padding: 0.75rem 1rem;
          background: var(--color-primary);
          border: 1px solid var(--color-primary);
          border-radius: 0 6px 6px 0;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        button:hover {
          background: var(--color-primary-hover);
        }

        .search-suggestions {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 4px;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          list-style: none;
          padding: 0.5rem 0;
          z-index: 100;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .search-suggestions li {
          padding: 0.5rem 1rem;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .search-suggestions li:hover,
        .search-suggestions li.selected {
          background: var(--color-bg-hover);
        }
      `}</style>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
