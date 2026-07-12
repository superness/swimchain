/**
 * Banner shown when identity is not sponsored
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSponsorship } from '../hooks/useSponsorship';
import { useIdentityContext } from '../providers/IdentityProvider';
import { logger } from '../lib/logger';
import './SponsorshipBanner.css';

export function SponsorshipBanner(): JSX.Element | null {
  const { isSponsored, isChecking, pendingClaim } = useSponsorship();
  const { hasValidIdentity } = useIdentityContext();
  const navigate = useNavigate();

  // All hooks MUST be called before any conditional returns (React rules of hooks).
  // Gate on the KNOWN sponsorship state only — NOT on isChecking. isChecking flips
  // true on every background re-poll (~10s); keying visibility off it made the banner
  // (and its 40px content offset) flicker on each poll, jarring the viewport.
  const shouldShow = hasValidIdentity && isSponsored === false;

  // Set CSS variable so content-area can add padding for the banner
  useEffect(() => {
    if (shouldShow) {
      document.documentElement.style.setProperty('--banner-offset', '40px');
    } else {
      document.documentElement.style.setProperty('--banner-offset', '0px');
    }
    return () => {
      document.documentElement.style.setProperty('--banner-offset', '0px');
    };
  }, [shouldShow]);

  logger.info('[SponsorshipBanner] Render check:', {
    hasValidIdentity,
    isSponsored,
    isChecking,
    willShow: shouldShow,
  });

  // Don't show until we have a determinate answer. Once isSponsored is known,
  // a background re-check (isChecking) must NOT hide the banner — that caused
  // the periodic flicker/viewport jump.
  if (!hasValidIdentity || isSponsored === null) {
    return null;
  }

  // Don't show if sponsored
  if (isSponsored) {
    return null;
  }

  return (
    <div className="sponsorship-banner" role="alert">
      <div className="sponsorship-banner-content">
        <svg className="sponsorship-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="sponsorship-banner-text">
          <strong>Your identity is not sponsored.</strong>
          {pendingClaim ? (
            <span>Your claim is pending review. </span>
          ) : (
            <span>You need sponsorship from an existing member to post, reply, or vote. </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-sm sponsorship-banner-action"
          onClick={() => navigate('/sponsorship')}
        >
          {pendingClaim ? 'View Status' : 'Find a Sponsor'}
        </button>
      </div>
    </div>
  );
}
