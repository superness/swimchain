/**
 * Address display component with truncation
 * Format: DisplayName (cs1abc...xyz) or just cs1abc...xyz if no name
 * Optionally shows avatar and links to profile
 */

import { Link } from 'react-router-dom';
import './AddressDisplay.css';
import { StartDMButton } from './StartDMButton';
import { UserAvatar, AvatarSize } from './UserAvatar';
import { AvatarInfo } from '../lib/profile';

interface AddressDisplayProps {
  address: string;
  displayName?: string;
  full?: boolean;
  className?: string;
  showDM?: boolean;
  showAvatar?: boolean;
  avatarSize?: AvatarSize;
  avatar?: AvatarInfo | null;
  linkToProfile?: boolean;
}

/**
 * Truncate an address for display
 */
export function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AddressDisplay({
  address,
  displayName,
  full = false,
  className = '',
  showDM = false,
  showAvatar = false,
  avatarSize = 'sm',
  avatar,
  linkToProfile = false,
}: AddressDisplayProps): JSX.Element {
  const displayAddress = full ? address : truncateAddress(address);

  // Content to display (name + address)
  const content = (
    <>
      {showAvatar && (
        <UserAvatar
          userPk={address}
          displayName={displayName}
          avatar={avatar}
          size={avatarSize}
          className="address-avatar"
        />
      )}
      {displayName ? (
        <>
          <span className="display-name">{displayName}</span>
          <code className="address-text address-secondary">({displayAddress})</code>
        </>
      ) : (
        <code className="address-text">{displayAddress}</code>
      )}
    </>
  );

  return (
    <span
      className={`address-display ${showAvatar ? 'with-avatar' : ''} ${className}`}
      title={address}
      aria-label={displayName ? `${displayName} (${address})` : `Address: ${address}`}
    >
      {linkToProfile ? (
        <Link to={`/profile/${address}`} className="address-profile-link">
          {content}
        </Link>
      ) : (
        content
      )}
      {!full && (
        <button
          type="button"
          className="address-copy"
          onClick={() => navigator.clipboard.writeText(address)}
          aria-label="Copy full address"
          title="Copy to clipboard"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      )}
      {showDM && (
        <StartDMButton
          recipientPk={address}
          recipientName={displayName}
          variant="ghost"
          size="sm"
          showIcon={true}
          className="address-dm-button"
        />
      )}
    </span>
  );
}
