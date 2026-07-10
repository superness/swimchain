/**
 * SponsorshipBanner — persistent warning shown when the current identity is NOT
 * sponsored, mirroring forum-client / feed-client's onboarding pattern.
 *
 * An identity must be sponsored (SPEC_11) before the node accepts posts, replies,
 * or reactions. Without this banner an unsponsored chat user only sees cryptic
 * rejections. Here we surface the state up-front and offer a "Find a Sponsor"
 * action (GetSponsoredModal) that lists open offers and claims one.
 *
 * Detection uses the existing useIsSponsored() hook (get_sponsorship_info by
 * identity_pubkey), which works in both node (desktop) and browser modes.
 */

import { useState } from 'react';
import { useIsSponsored } from '../hooks/useIsSponsored';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { GetSponsoredModal } from './GetSponsoredModal';
import './SponsorshipBanner.css';

export function SponsorshipBanner(): JSX.Element | null {
  const isSponsored = useIsSponsored();
  const { hasIdentity } = useChatIdentity();
  const [modalOpen, setModalOpen] = useState(false);
  // Optimistically hide the banner after an auto-approved claim, since
  // useIsSponsored won't re-poll until its identity dependency changes.
  const [justSponsored, setJustSponsored] = useState(false);

  // Only show for a usable identity that the node reports as NOT sponsored.
  // `null` (unknown / still checking) and `true` (sponsored) render nothing.
  if (!hasIdentity || isSponsored !== false || justSponsored) {
    return null;
  }

  return (
    <>
      <div className="sponsorship-banner" role="alert">
        <svg
          className="sponsorship-banner-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="sponsorship-banner-text">
          <strong>Your identity is not sponsored.</strong>
          <span>You need sponsorship from an existing member to post, reply, or react.</span>
        </div>
        <button
          type="button"
          className="sponsorship-banner-action"
          onClick={() => setModalOpen(true)}
        >
          Find a Sponsor
        </button>
      </div>

      <GetSponsoredModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onClaimed={(sponsored) => {
          if (sponsored) setJustSponsored(true);
        }}
      />
    </>
  );
}
