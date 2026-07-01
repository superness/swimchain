/**
 * SponsoredBadge Component
 *
 * Shows a small badge indicating content was posted via a sponsorship offer.
 * Used in search result cards (ThreadResult, ReplyResult) to flag sponsored content.
 */

import { memo } from 'react';

/**
 * Badge indicating sponsored content
 */
export const SponsoredBadge = memo(function SponsoredBadge(): JSX.Element {
  return (
    <span className="sponsored-badge" title="Posted via sponsorship">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.78.77 7.64 7.65 7.65-7.65.77-.77a5.4 5.4 0 0 0 0-7.65z" />
      </svg>
      Sponsored
    </span>
  );
});
