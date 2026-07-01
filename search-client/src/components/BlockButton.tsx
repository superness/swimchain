/**
 * Block button component for search results - allows blocking users/content
 */

import { useState, useRef, useEffect } from 'react';
import { useBlocklist, BlockType } from '../hooks/useBlocklist';
import './BlockButton.css';

interface BlockButtonProps {
  id: string;
  type: BlockType;
  authorId?: string;
}

export function BlockButton({ id, type, authorId }: BlockButtonProps): JSX.Element {
  const { isBlocked, block, unblock, isUserBlocked } = useBlocklist();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const itemBlocked = isBlocked(id, type);
  const authorBlocked = authorId ? isUserBlocked(authorId) : false;

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

  const typeLabel = type === 'post' ? 'thread' : type;

  return (
    <div className="block-button-container" ref={menuRef}>
      <button
        className="block-button"
        onClick={() => setShowMenu(!showMenu)}
        title="Block options"
        aria-label="Block options"
        aria-expanded={showMenu}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </button>

      {showMenu && (
        <div className="block-menu">
          <button className="block-menu-item" onClick={handleBlockItem}>
            {itemBlocked ? `Unblock this ${typeLabel}` : `Block this ${typeLabel}`}
          </button>
          {authorId && (
            <button className="block-menu-item" onClick={handleBlockAuthor}>
              {authorBlocked ? 'Unblock this user' : 'Block this user'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
