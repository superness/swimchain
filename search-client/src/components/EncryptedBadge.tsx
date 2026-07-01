/**
 * EncryptedBadge Component
 *
 * Shows a small badge indicating content is from a private/encrypted space.
 * Used in search result cards (ThreadResult, ReplyResult) to flag encrypted content.
 */

import { memo } from 'react';

const ENCRYPTED_PREFIX = '[ENCRYPTED:v1:';
const PRIVATE_PREFIX = '[PRIVATE:v1:';

/**
 * Check if content string is encrypted
 */
export function isEncryptedContent(content: string): boolean {
  return content.startsWith(ENCRYPTED_PREFIX) || content.startsWith(PRIVATE_PREFIX);
}

/**
 * Badge indicating encrypted content
 */
export const EncryptedBadge = memo(function EncryptedBadge(): JSX.Element {
  return (
    <span className="encrypted-badge" title="This content is encrypted">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Encrypted
    </span>
  );
});

/**
 * Badge indicating private space content
 */
export const PrivateBadge = memo(function PrivateBadge(): JSX.Element {
  return (
    <span className="private-badge" title="This content is from a private space">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Private
    </span>
  );
});
