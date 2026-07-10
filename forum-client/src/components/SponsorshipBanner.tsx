/**
 * Banner shown when identity is not sponsored
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSponsorship } from '../hooks/useSponsorship';
import { useIdentityContext } from '../providers/IdentityProvider';
import './SponsorshipBanner.css';

export function SponsorshipBanner(): JSX.Element | null {
  const { isSponsored, isChecking, pendingClaim } = useSponsorship();
  const { hasValidIdentity } = useIdentityContext();
  const navigate = useNavigate();
  const bannerRef = useRef<HTMLDivElement>(null);

  // All hooks MUST be called before any conditional returns (React rules of hooks)
  const shouldShow = hasValidIdentity && !isChecking && isSponsored === false;

  // Reserve exactly the banner's real height in the content padding so the fixed
  // banner never overlaps/clips content. A previous hardcoded 40px was too short
  // once the text+button wrapped in the narrower desktop frame. Re-measure on the
  // relevant state changes and on resize (wrapping is width-dependent).
  useEffect(() => {
    const setOffset = () => {
      const h = shouldShow && bannerRef.current ? bannerRef.current.offsetHeight : 0;
      document.documentElement.style.setProperty('--banner-offset', `${h}px`);
    };
    setOffset();
    window.addEventListener('resize', setOffset);
    return () => {
      window.removeEventListener('resize', setOffset);
      document.documentElement.style.setProperty('--banner-offset', '0px');
    };
  }, [shouldShow, pendingClaim]);

  // Don't show if no identity or still checking
  if (!hasValidIdentity || isChecking || isSponsored === null) {
    return null;
  }

  // Don't show if sponsored
  if (isSponsored) {
    return null;
  }

  return (
    <div className="sponsorship-banner" role="alert" ref={bannerRef}>
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
