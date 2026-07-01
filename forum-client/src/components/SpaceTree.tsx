/**
 * Hierarchical space navigation tree
 */

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSpaces } from '../hooks/useRpc';
import { formatErrorMessage } from '../lib/errorMessages';
import type { Space } from '../types';
import './SpaceTree.css';

interface SpaceNodeProps {
  space: Space;
  level: number;
}

function SpaceNode({ space, level }: SpaceNodeProps): JSX.Element {
  // TODO: Implement hierarchical spaces - for now, all spaces are flat

  return (
    <li className="space-node">
      <div
        className="space-item"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Placeholder for expand/collapse when hierarchical spaces are added */}
        <span className="space-toggle-placeholder" aria-hidden="true" />

        <NavLink
          to={`/spaces/${space.id}`}
          className={({ isActive }) =>
            `space-link ${isActive ? 'active' : ''}`
          }
        >
          <span className="space-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </span>
          <span className="space-name">{space.name}</span>
          <span className="space-count" aria-label={`${space.activePostCount} active posts`}>
            {space.activePostCount}
          </span>
        </NavLink>
      </div>

      {/* TODO: Add children rendering when hierarchical spaces are implemented */}
    </li>
  );
}

export function SpaceTree(): JSX.Element {
  const { spaces, loading, error, refetch } = useSpaces();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refetch();
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return (
      <nav className="space-tree" aria-label="Spaces">
        <div className="space-tree-loading">Loading spaces...</div>
      </nav>
    );
  }

  if (error) {
    const friendlyError = formatErrorMessage(error);
    return (
      <nav className="space-tree" aria-label="Spaces">
        <div className="space-tree-error">
          <div className="space-tree-error-message">
            <svg className="space-tree-error-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{friendlyError}</span>
          </div>
          <button
            type="button"
            className="space-tree-retry-btn"
            onClick={handleRetry}
            disabled={retrying}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </nav>
    );
  }

  if (spaces.length === 0) {
    return (
      <nav className="space-tree" aria-label="Spaces">
        <div className="space-tree-empty">No spaces yet</div>
      </nav>
    );
  }

  return (
    <nav className="space-tree" aria-label="Spaces">
      <ul className="space-list" role="tree">
        {spaces.map((space) => (
          <SpaceNode key={space.id} space={space} level={0} />
        ))}
      </ul>
    </nav>
  );
}
