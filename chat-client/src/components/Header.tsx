/**
 * Chat header with space name and controls
 */

import type { Space } from '../types';
import './Header.css';

interface HeaderProps {
  space: Space | null;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
}

export function Header({
  space,
  onMenuClick,
  onSearchClick,
}: HeaderProps): JSX.Element {
  return (
    <header className="chat-header">
      <div className="chat-header__left">
        <button
          className="chat-header__menu-btn btn btn-ghost btn-icon"
          onClick={onMenuClick}
          aria-label="Open navigation"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {space ? (
          <div className="chat-header__space-info">
            <span className="chat-header__space-icon">{space.icon}</span>
            <h1 className="chat-header__space-name">{space.name}</h1>
            <span className="chat-header__member-count">
              {space.memberCount.toLocaleString()} members
            </span>
          </div>
        ) : (
          <h1 className="chat-header__title">Swimchain Chat</h1>
        )}
      </div>

      <div className="chat-header__right">
        <button
          className="chat-header__search-btn btn btn-ghost btn-icon"
          onClick={onSearchClick}
          aria-label="Search"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        <button
          className="chat-header__members-btn btn btn-ghost btn-icon"
          aria-label="Show members"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
      </div>
    </header>
  );
}
