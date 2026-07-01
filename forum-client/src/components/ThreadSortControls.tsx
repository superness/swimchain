/**
 * Thread sort controls component
 */

import type { ThreadSortOption } from '../types';
import './ThreadSortControls.css';

interface ThreadSortControlsProps {
  value: ThreadSortOption;
  onChange: (value: ThreadSortOption) => void;
}

const SORT_OPTIONS: { value: ThreadSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'replies', label: 'Most Replies' },
  { value: 'active', label: 'Most Active' },
];

export function ThreadSortControls({
  value,
  onChange,
}: ThreadSortControlsProps): JSX.Element {
  return (
    <div className="thread-sort-controls" role="group" aria-label="Sort threads">
      <span className="sort-label">Sort by:</span>
      <div className="sort-buttons">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`sort-button ${value === option.value ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
