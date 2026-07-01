/**
 * FollowButton - Follow/Unfollow button for spaces and users
 *
 * Displays different states:
 * - Not following: "+ Follow"
 * - Following: "Following" with dropdown for Mute/Unfollow
 * - Muted: "Muted" with dropdown for Unmute/Unfollow
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import './FollowButton.css';

interface FollowButtonProps {
  /** Whether currently following */
  isFollowing: boolean;
  /** Whether currently muted (only relevant if following) */
  isMuted?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Called when follow/unfollow is clicked */
  onToggleFollow: () => void;
  /** Called when mute/unmute is clicked */
  onToggleMute?: () => void;
  /** Button size */
  size?: 'small' | 'medium' | 'large';
  /** Variant style */
  variant?: 'default' | 'outline';
  /** Additional class name */
  className?: string;
}

export function FollowButton({
  isFollowing,
  isMuted = false,
  loading = false,
  onToggleFollow,
  onToggleMute,
  size = 'medium',
  variant = 'default',
  className = '',
}: FollowButtonProps): JSX.Element {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setDropdownOpen(false);
    }
  }, []);

  const handleMainClick = useCallback(() => {
    if (loading) return;

    if (!isFollowing) {
      // Not following - click to follow
      onToggleFollow();
    } else {
      // Following - toggle dropdown
      setDropdownOpen(prev => !prev);
    }
  }, [isFollowing, loading, onToggleFollow]);

  const handleUnfollow = useCallback(() => {
    setDropdownOpen(false);
    onToggleFollow();
  }, [onToggleFollow]);

  const handleToggleMute = useCallback(() => {
    setDropdownOpen(false);
    onToggleMute?.();
  }, [onToggleMute]);

  // Determine button text and style
  let buttonText: string;
  let buttonClass: string;

  if (!isFollowing) {
    buttonText = '+ Follow';
    buttonClass = 'follow-btn--not-following';
  } else if (isMuted) {
    buttonText = 'Muted';
    buttonClass = 'follow-btn--muted';
  } else {
    buttonText = isHovered ? 'Following' : 'Following';
    buttonClass = 'follow-btn--following';
  }

  return (
    <div
      ref={buttonRef}
      className={`follow-btn-container ${className}`}
      onKeyDown={handleKeyDown}
    >
      <button
        className={`follow-btn follow-btn--${size} follow-btn--${variant} ${buttonClass} ${loading ? 'follow-btn--loading' : ''}`}
        onClick={handleMainClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        disabled={loading}
        type="button"
        aria-expanded={isFollowing ? dropdownOpen : undefined}
        aria-haspopup={isFollowing ? 'menu' : undefined}
      >
        {loading ? (
          <span className="follow-btn__spinner" aria-hidden="true" />
        ) : (
          <>
            <span className="follow-btn__text">{buttonText}</span>
            {isFollowing && (
              <span className="follow-btn__arrow" aria-hidden="true">
                {dropdownOpen ? '▲' : '▼'}
              </span>
            )}
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {isFollowing && dropdownOpen && (
        <div className="follow-btn__dropdown" role="menu">
          {onToggleMute && (
            <button
              className="follow-btn__dropdown-item"
              onClick={handleToggleMute}
              role="menuitem"
              type="button"
            >
              <span className="follow-btn__dropdown-icon" aria-hidden="true">
                {isMuted ? '🔊' : '🔇'}
              </span>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button
            className="follow-btn__dropdown-item follow-btn__dropdown-item--danger"
            onClick={handleUnfollow}
            role="menuitem"
            type="button"
          >
            <span className="follow-btn__dropdown-icon" aria-hidden="true">✕</span>
            Unfollow
          </button>
        </div>
      )}
    </div>
  );
}
