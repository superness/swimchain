'use client';

import type { SearchFilters as SearchFiltersType, SortOption } from '@/types/search';

interface SearchFiltersProps {
  filters: SearchFiltersType;
  onFiltersChange: (filters: SearchFiltersType) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

/**
 * Advanced search filters matching CLIENT_DESIGN.md Section 7.3
 */
export function SearchFilters({
  filters,
  onFiltersChange,
  sortBy,
  onSortChange,
}: SearchFiltersProps) {
  const updateFilter = <K extends keyof SearchFiltersType>(
    key: K,
    value: SearchFiltersType[K]
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="search-filters">
      <div className="filter-group">
        <label htmlFor="sort">Sort by</label>
        <select
          id="sort"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
        >
          <option value="relevance">Relevance</option>
          <option value="heat">Heat</option>
          <option value="engagement">Engagement</option>
          <option value="newest">Newest</option>
          <option value="replies">Most Replies</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="minHeat">Minimum Heat</label>
        <select
          id="minHeat"
          value={filters.minHeat ?? 0}
          onChange={(e) =>
            updateFilter('minHeat', parseInt(e.target.value, 10) as 0 | 25 | 50 | 75 | 90)
          }
        >
          <option value="0">Any</option>
          <option value="25">&gt; 25%</option>
          <option value="50">&gt; 50%</option>
          <option value="75">&gt; 75%</option>
          <option value="90">&gt; 90%</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="minEngagement">Engagement</label>
        <select
          id="minEngagement"
          value={filters.minEngagement ?? 0}
          onChange={(e) =>
            updateFilter('minEngagement', parseInt(e.target.value, 10) as 0 | 20 | 40 | 60)
          }
        >
          <option value="0">Any</option>
          <option value="20">&gt; 20s</option>
          <option value="40">&gt; 40s</option>
          <option value="60">Complete (60s)</option>
        </select>
      </div>

      <div className="filter-group">
        <label htmlFor="timeRange">Time Period</label>
        <select
          id="timeRange"
          value={filters.timeRange ?? 'all'}
          onChange={(e) =>
            updateFilter(
              'timeRange',
              e.target.value as 'day' | 'week' | 'month' | 'year' | 'all'
            )
          }
        >
          <option value="all">All Time</option>
          <option value="day">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
      </div>

      <div className="filter-group checkbox">
        <label>
          <input
            type="checkbox"
            checked={filters.includeDecaying ?? false}
            onChange={(e) => updateFilter('includeDecaying', e.target.checked)}
          />
          Include decaying (&lt;20% heat)
        </label>
      </div>

      {filters.space && (
        <div className="filter-tag">
          <span>Space: {filters.space}</span>
          <button
            onClick={() => updateFilter('space', undefined)}
            aria-label="Remove space filter"
          >
            &times;
          </button>
        </div>
      )}

      {filters.author && (
        <div className="filter-tag">
          <span>Author: {filters.author.slice(0, 12)}...</span>
          <button
            onClick={() => updateFilter('author', undefined)}
            aria-label="Remove author filter"
          >
            &times;
          </button>
        </div>
      )}

      <style jsx>{`
        .search-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1rem;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }

        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .filter-group label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .filter-group select {
          padding: 0.5rem 0.75rem;
          font-size: 0.9rem;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 4px;
          color: var(--color-text);
          cursor: pointer;
        }

        .filter-group select:focus {
          outline: none;
          border-color: var(--color-primary);
        }

        .filter-group.checkbox {
          flex-direction: row;
          align-items: center;
        }

        .filter-group.checkbox label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          text-transform: none;
          color: var(--color-text);
          cursor: pointer;
        }

        .filter-group.checkbox input {
          width: 1rem;
          height: 1rem;
          cursor: pointer;
        }

        .filter-tag {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.5rem;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .filter-tag button {
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: 1.2rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
        }

        .filter-tag button:hover {
          color: var(--color-text);
        }

        @media (max-width: 768px) {
          .search-filters {
            flex-direction: column;
          }

          .filter-group {
            width: 100%;
          }

          .filter-group select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
