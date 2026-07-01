/**
 * UserProfileModal - Quick profile preview popup
 *
 * Shows a compact profile preview when clicking on a user's avatar or name.
 * Provides quick access to view profile, follow, or view posts.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserProfile } from '../hooks/useUserProfile';
import { getAvatarColor, getAvatarInitials, truncateAddress } from '../lib/profile';
import './UserProfileModal.css';

interface UserProfileModalProps {
  /** User's public key (hex) */
  userPk: string;
  /** Position to anchor the modal */
  anchorPosition: { x: number; y: number };
  /** Called when modal should close */
  onClose: () => void;
  /** Optional: display name if already known */
  displayName?: string;
}

export function UserProfileModal({
  userPk,
  anchorPosition,
  onClose,
  displayName: knownDisplayName,
}: UserProfileModalProps): JSX.Element {
  const modalRef = useRef<HTMLDivElement>(null);
  const { profile, loading } = useUserProfile(userPk);

  const displayName = profile?.info?.displayName || knownDisplayName || truncateAddress(userPk);
  const avatarColor = getAvatarColor(userPk);
  const initials = getAvatarInitials(profile?.info?.displayName, userPk);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Close on escape
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Calculate position to keep modal in viewport
  const getPosition = useCallback(() => {
    const modalWidth = 280;
    const modalHeight = 200;
    const padding = 16;

    let x = anchorPosition.x;
    let y = anchorPosition.y + 8; // Offset below anchor

    // Check right boundary
    if (x + modalWidth > window.innerWidth - padding) {
      x = window.innerWidth - modalWidth - padding;
    }

    // Check left boundary
    if (x < padding) {
      x = padding;
    }

    // Check bottom boundary - show above if not enough space
    if (y + modalHeight > window.innerHeight - padding) {
      y = anchorPosition.y - modalHeight - 8;
    }

    return { left: x, top: y };
  }, [anchorPosition]);

  const position = getPosition();

  return (
    <div
      ref={modalRef}
      className="user-profile-modal"
      style={{ left: position.left, top: position.top }}
      role="dialog"
      aria-label={`Profile preview for ${displayName}`}
    >
      {loading ? (
        <div className="user-profile-modal__loading">
          <div className="user-profile-modal__loading-spinner" />
        </div>
      ) : (
        <>
          {/* Header with avatar and name */}
          <div className="user-profile-modal__header">
            <div
              className="user-profile-modal__avatar"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>
            <div className="user-profile-modal__info">
              <div className="user-profile-modal__name">{displayName}</div>
              <div className="user-profile-modal__address">
                <code>{userPk.slice(0, 8)}...{userPk.slice(-6)}</code>
              </div>
            </div>
          </div>

          {/* Bio if available */}
          {profile?.info?.bio && (
            <p className="user-profile-modal__bio">
              {profile.info.bio.length > 100
                ? profile.info.bio.slice(0, 100) + '...'
                : profile.info.bio}
            </p>
          )}

          {/* Actions */}
          <div className="user-profile-modal__actions">
            <Link
              to={`/profile/${userPk}`}
              className="user-profile-modal__action user-profile-modal__action--primary"
              onClick={onClose}
            >
              View Profile
            </Link>
            <Link
              to={`/?author=${userPk}`}
              className="user-profile-modal__action"
              onClick={onClose}
            >
              View Posts
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Hook to manage UserProfileModal state
 */
export function useProfileModal() {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    userPk: string | null;
    position: { x: number; y: number };
    displayName?: string;
  }>({
    isOpen: false,
    userPk: null,
    position: { x: 0, y: 0 },
  });

  const openModal = useCallback((
    userPk: string,
    event: React.MouseEvent,
    displayName?: string
  ) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setModalState({
      isOpen: true,
      userPk,
      position: { x: rect.left, y: rect.bottom },
      displayName,
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isOpen: false, userPk: null }));
  }, []);

  return {
    modalState,
    openModal,
    closeModal,
  };
}
