/**
 * User Profile Modal
 *
 * Displays user profile information when clicking on a user's avatar or name.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserProfile } from '../hooks/useUserProfile';
import { UserAvatar } from './UserAvatar';
import { useBlocklist } from '../hooks/useBlocklist';
import { useDm } from '../hooks/useDm';
import { useChatIdentity } from '../hooks/useChatIdentity';
import './UserProfileModal.css';

interface UserProfileModalProps {
  /** User ID to display profile for */
  userId: string;
  /** Optional display name (used while loading) */
  displayName?: string;
  /** Close the modal */
  onClose: () => void;
  /** Position the modal near this element */
  anchorElement?: HTMLElement | null;
}

/**
 * Truncate user ID for display
 */
function truncateUserId(userId: string): string {
  if (userId.startsWith('sw1') || userId.startsWith('cs1')) {
    return userId.slice(0, 8) + '...' + userId.slice(-4);
  }
  return userId.slice(0, 16) + '...';
}

export function UserProfileModal({
  userId,
  displayName,
  onClose,
  anchorElement,
}: UserProfileModalProps): JSX.Element {
  const { profile, loading } = useUserProfile(userId);
  const { isUserBlocked, block, unblock } = useBlocklist();
  const { sendRequest } = useDm();
  const { identity } = useChatIdentity();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const isBlocked = isUserBlocked(userId);
  // Don't offer "Message" on your own profile.
  const ul = userId.toLowerCase();
  const isSelf =
    ul === identity?.publicKey?.toLowerCase() || ul === identity?.address?.toLowerCase();

  const handleMessage = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    const spaceId = await sendRequest(userId);
    setStarting(false);
    if (spaceId) {
      onClose();
      navigate('/channels/@me/' + spaceId);
    }
  }, [starting, sendRequest, userId, onClose, navigate]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to prevent immediate close
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Position modal near anchor element
  useEffect(() => {
    if (!modalRef.current || !anchorElement) return;

    const rect = anchorElement.getBoundingClientRect();
    const modal = modalRef.current;
    const modalRect = modal.getBoundingClientRect();

    // Position to the right of the anchor, or left if not enough space
    let left = rect.right + 8;
    if (left + modalRect.width > window.innerWidth - 16) {
      left = rect.left - modalRect.width - 8;
    }

    // Center vertically relative to anchor
    let top = rect.top + rect.height / 2 - modalRect.height / 2;
    if (top < 16) top = 16;
    if (top + modalRect.height > window.innerHeight - 16) {
      top = window.innerHeight - modalRect.height - 16;
    }

    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;
  }, [anchorElement]);

  const handleBlock = useCallback(() => {
    if (isBlocked) {
      unblock(userId, 'user');
    } else {
      block(userId, 'user');
    }
  }, [userId, isBlocked, block, unblock]);

  const name = profile?.info?.displayName || displayName || truncateUserId(userId);

  return (
    <div className="user-profile-modal" ref={modalRef} role="dialog" aria-modal="true">
      {/* Header with avatar */}
      <div className="profile-modal-header">
        <UserAvatar
          userId={userId}
          displayName={name}
          size="lg"
        />
        <div className="profile-modal-name">
          <h3>{name}</h3>
          <span className="profile-modal-id" title={userId}>
            {truncateUserId(userId)}
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="profile-modal-loading">
          <div className="loading-spinner-small" />
        </div>
      )}

      {/* Bio */}
      {profile?.info?.bio && (
        <div className="profile-modal-section">
          <h4>About</h4>
          <p>{profile.info.bio}</p>
        </div>
      )}

      {/* Website */}
      {profile?.info?.website && (
        <div className="profile-modal-section">
          <h4>Website</h4>
          <a
            href={profile.info.website}
            target="_blank"
            rel="noopener noreferrer"
            className="profile-modal-link"
          >
            {profile.info.website.replace(/^https?:\/\//, '')}
          </a>
        </div>
      )}

      {/* No profile message */}
      {!loading && !profile?.exists && (
        <div className="profile-modal-empty">
          <p>This user hasn't set up a profile yet.</p>
        </div>
      )}

      {/* Actions */}
      <div className="profile-modal-actions">
        {!isSelf && (
          <button
            className="profile-action-btn message"
            onClick={handleMessage}
            disabled={starting}
          >
            {starting ? 'Starting…' : '💬 Message'}
          </button>
        )}
        <button
          className={`profile-action-btn ${isBlocked ? 'unblock' : 'block'}`}
          onClick={handleBlock}
        >
          {isBlocked ? 'Unblock User' : 'Block User'}
        </button>
      </div>
    </div>
  );
}
