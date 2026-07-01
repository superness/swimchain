/**
 * Space sidebar with collapsible category folders
 * Discord-like channel navigation
 */

import { useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SpaceCategory, Space } from '../types';
import './SpaceSidebar.css';

interface SpaceSidebarProps {
  categories: SpaceCategory[];
  onSpaceClick?: (space: Space) => void;
}

export function SpaceSidebar({
  categories,
  onSpaceClick,
}: SpaceSidebarProps): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set()
  );

  const toggleCategory = useCallback((categoryName: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  }, []);

  const handleSpaceClick = useCallback(
    (space: Space) => {
      onSpaceClick?.(space);
    },
    [onSpaceClick]
  );

  return (
    <nav className="space-sidebar" aria-label="Spaces">
      <div className="space-sidebar__header">
        <h2 className="space-sidebar__title">Spaces</h2>
      </div>

      <div className="space-sidebar__content">
        {categories.map((category) => {
          const isCollapsed = collapsedCategories.has(category.name);

          return (
            <div key={category.name} className="space-sidebar__category">
              <button
                className="space-sidebar__category-header"
                onClick={() => toggleCategory(category.name)}
                aria-expanded={!isCollapsed}
              >
                <span className="space-sidebar__category-icon">
                  {isCollapsed ? '▶' : '▼'}
                </span>
                <span className="space-sidebar__category-name">
                  {category.name.toUpperCase()}
                </span>
              </button>

              {!isCollapsed && (
                <ul className="space-sidebar__space-list">
                  {category.spaces.map((space) => {
                    const isActive = space.id === spaceId;
                    const hasUnread = space.unreadCount > 0;

                    return (
                      <li key={space.id}>
                        <Link
                          to={`/s/${space.id}`}
                          className={`space-sidebar__space-item ${
                            isActive ? 'space-sidebar__space-item--active' : ''
                          } ${
                            hasUnread
                              ? 'space-sidebar__space-item--unread'
                              : ''
                          }`}
                          onClick={() => handleSpaceClick(space)}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          <span className="space-sidebar__space-icon">
                            {space.icon}
                          </span>
                          <span className="space-sidebar__space-name">
                            {space.name}
                          </span>
                          {hasUnread && (
                            <span
                              className="space-sidebar__unread-badge"
                              aria-label={`${space.unreadCount} unread messages`}
                            >
                              {space.unreadCount > 99
                                ? '99+'
                                : space.unreadCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-sidebar__footer">
        <Link to="/settings" className="space-sidebar__footer-link">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </Link>
      </div>
    </nav>
  );
}
