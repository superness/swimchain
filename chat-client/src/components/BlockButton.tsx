/**
 * Block button component - allows users to block content or users
 */

import { useState, useRef, useEffect } from 'react';
import { useBlocklist, BlockType } from '../hooks/useBlocklist';
import './BlockButton.css';

interface BlockButtonProps {
  /** ID of the item to block */
  id: string;
  /** Type of item */
  type: BlockType;
  /** Optional author ID - allows blocking the author too */
  authorId?: string;
  /** Display style */
  variant?: 'icon' | 'text' | 'menu-item';
}

export function BlockButton({ id, type, authorId, variant = 'icon' }: BlockButtonProps): JSX.Element {
  const { isBlocked, block, unblock, isUserBlocked } = useBlocklist();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const itemBlocked = isBlocked(id, type);
  const authorBlocked = authorId ? isUserBlocked(authorId) : false;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const handleBlockItem = () => {
    if (itemBlocked) {
      unblock(id, type);
    } else {
      block(id, type);
    }
    setShowMenu(false);
  };

  const handleBlockAuthor = () => {
    if (!authorId) return;
    if (authorBlocked) {
      unblock(authorId, 'user');
    } else {
      block(authorId, 'user');
    }
    setShowMenu(false);
  };

  const typeLabel = type === 'message' ? 'message' : type;

  if (variant === 'menu-item') {
    return (
      <div className="block-menu-items">
        <button
          className="block-menu-item"
          onClick={handleBlockItem}
        >
          {itemBlocked ? `Unblock this ${typeLabel}` : `Block this ${typeLabel}`}
        </button>
        {authorId && (
          <button
            className="block-menu-item"
            onClick={handleBlockAuthor}
          >
            {authorBlocked ? 'Unblock this user' : 'Block this user'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="block-button-container" ref={menuRef}>
      <button
        className={`block-button ${variant}`}
        onClick={() => setShowMenu(!showMenu)}
        title="Block options"
        aria-label="Block options"
        aria-expanded={showMenu}
      >
        {variant === 'text' ? (
          'Block'
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        )}
      </button>

      {showMenu && (
        <div className="block-menu">
          <button
            className="block-menu-item"
            onClick={handleBlockItem}
          >
            {itemBlocked ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
                Unblock this {typeLabel}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                Block this {typeLabel}
              </>
            )}
          </button>

          {authorId && (
            <button
              className="block-menu-item"
              onClick={handleBlockAuthor}
            >
              {authorBlocked ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="18" y1="8" x2="23" y2="13" />
                    <line x1="23" y1="8" x2="18" y2="13" />
                  </svg>
                  Unblock this user
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <circle cx="20" cy="11" r="5" />
                    <line x1="17" y1="8" x2="23" y2="14" />
                  </svg>
                  Block this user
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Indicator shown on blocked content (if we choose to show it greyed out instead of hiding)
 */
export function BlockedIndicator({ type }: { type: BlockType }): JSX.Element {
  return (
    <div className="blocked-indicator">
      <span>This {type} is blocked</span>
    </div>
  );
}
