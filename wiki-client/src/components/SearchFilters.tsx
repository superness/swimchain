/**
 * SearchFilters Component
 *
 * Filter controls for search results (time, space, sort order).
 */

import { SearchSortOption } from '../types';
import './SearchFilters.css';

interface SearchFiltersProps {
  sortBy: SearchSortOption;
  onSortChange: (sort: SearchSortOption) => void;
  dateRange?: 'any' | 'day' | 'week' | 'month' | 'year';
  onDateRangeChange?: (range: 'any' | 'day' | 'week' | 'month' | 'year') => void;
}

const SORT_OPTIONS: { value: SearchSortOption; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'recent', label: 'Most Recent' },
  { value: 'reactions', label: 'Most Reactions' },
  { value: 'replies', label: 'Most Replies' },
];

const DATE_OPTIONS: { value: 'any' | 'day' | 'week' | 'month' | 'year'; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'day', label: 'Past 24 hours' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'year', label: 'Past year' },
];

export function SearchFilters({
  sortBy,
  onSortChange,
  dateRange = 'any',
  onDateRangeChange,
}: SearchFiltersProps) {
  return (
    <div className="search-filters">
      {/* Date range filter */}
      <div className="filter-group">
        <label htmlFor="date-filter" className="filter-label">
          Time:
        </label>
        <select
          id="date-filter"
          className="filter-select"
          value={dateRange}
          onChange={(e) => onDateRangeChange?.(e.target.value as typeof dateRange)}
        >
          {DATE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sort filter */}
      <div className="filter-group">
        <label htmlFor="sort-filter" className="filter-label">
          Sort:
        </label>
        <select
          id="sort-filter"
          className="filter-select"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SearchSortOption)}
        >
          {SORT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
