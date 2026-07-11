/**
 * User Avatar Component
 *
 * Displays a user's avatar. If the user has uploaded an avatar,
 * it shows their image. Otherwise, displays a generated avatar
 * with a color derived from their user ID and their initials.
 */

import { useState, useMemo } from 'react';
import { getAvatarColor, getAvatarInitials, AvatarInfo } from '../lib/avatar';
import './UserAvatar.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface UserAvatarProps {
  /** User's ID (required for generated avatar) */
  userId: string;
  /** Display name (optional, used for initials) */
  displayName?: string;
  /** Avatar info if already fetched */
  avatar?: AvatarInfo | null;
  /** A ready-to-use image URL (e.g. a data: URL fetched via get_media). Takes
   *  precedence over `avatar.contentId` — chat has no /api/content route. */
  imageUrl?: string | null;
  /** Size of the avatar */
  size?: AvatarSize;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Click handler */
  onClick?: () => void;
  /** Show online indicator */
  showOnline?: boolean;
  /** Is user online */
  isOnline?: boolean;
}

/** Size in pixels for each size variant */
const sizeMap: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

export function UserAvatar({
  userId,
  displayName,
  avatar,
  imageUrl: imageUrlProp,
  size = 'md',
  className = '',
  style,
  onClick,
  showOnline = false,
  isOnline = false,
}: UserAvatarProps): JSX.Element {
  const [imageError, setImageError] = useState(false);

  // Generate default avatar properties
  const { color, initials } = useMemo(() => ({
    color: getAvatarColor(userId),
    initials: getAvatarInitials(displayName, userId),
  }), [userId, displayName]);

  // Prefer an explicit URL (data: URL from get_media); fall back to a content id.
  const resolvedUrl = imageUrlProp ?? (avatar?.contentId ? `/api/content/${avatar.contentId}` : undefined);
  const showImage = !!resolvedUrl && !imageError;
  const imageUrl = showImage ? resolvedUrl : undefined;

  const pixelSize = sizeMap[size];

  return (
    <div
      className={`user-avatar user-avatar-${size} ${onClick ? 'clickable' : ''} ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        backgroundColor: showImage ? undefined : color,
        ...style,
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={displayName || 'User avatar'}
          className="user-avatar-image"
          onError={() => setImageError(true)}
          loading="lazy"
        />
      ) : (
        <span className="user-avatar-initials">{initials}</span>
      )}

      {showOnline && (
        <span className={`user-avatar-status ${isOnline ? 'online' : 'offline'}`} />
      )}
    </div>
  );
}

/**
 * Avatar group for showing multiple users (e.g., channel members)
 */
interface AvatarGroupProps {
  users: Array<{
    userId: string;
    displayName?: string;
    avatar?: AvatarInfo | null;
  }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({
  users,
  max = 4,
  size = 'sm',
  className = '',
}: AvatarGroupProps): JSX.Element {
  const visible = users.slice(0, max);
  const overflow = users.length - max;

  return (
    <div className={`avatar-group ${className}`}>
      {visible.map((user, index) => (
        <UserAvatar
          key={user.userId}
          userId={user.userId}
          displayName={user.displayName}
          avatar={user.avatar}
          size={size}
          className="avatar-group-item"
          style={{ zIndex: visible.length - index }}
        />
      ))}
      {overflow > 0 && (
        <div
          className={`avatar-group-overflow user-avatar-${size}`}
          style={{
            width: sizeMap[size],
            height: sizeMap[size],
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

export default UserAvatar;
