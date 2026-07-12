/**
 * Continuity banners (SPEC_13, Phase 2 — Lane B).
 *
 * When a group's conversations earn their own community, nothing is removed:
 * the community is an addition and the original threads keep living in the
 * parent space. These banners make that continuity visible in both directions.
 *
 *   - MovedThreadBanner: shown in the PARENT space on a thread whose discussion
 *     grew into a community. Links to the community VIEW (the parent's thread
 *     list filtered to that community) — never a bare space view of the
 *     community's own space id, which would be empty.
 *   - GrewOutOfNote: a subtle note at the top of a community view, linking back
 *     to the parent it grew out of.
 *
 * Copy is deliberately recognition-framed ("grew into its own space", "continues
 * here") and never implies removal or eviction.
 */

import { Link } from 'react-router-dom';
import { communityPath } from '../hooks/useLineage';
import './ContinuityBanner.css';

interface MovedThreadBannerProps {
  /** Parent space (sp1) whose thread list the community filters. */
  parentSpaceId: string;
  /** Community id (64-hex). */
  communityId: string;
  communityName?: string;
}

/** Parent-side pointer: this thread's conversation grew into a community. */
export function MovedThreadBanner({ parentSpaceId, communityId, communityName }: MovedThreadBannerProps): JSX.Element {
  return (
    <Link to={communityPath(parentSpaceId, communityId)} className="continuity-banner continuity-banner--grew-into">
      <span className="continuity-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      </span>
      <span className="continuity-text">
        This conversation grew into its own space
        {communityName ? <> · <strong>{communityName}</strong></> : null}
        <span className="continuity-hint"> — it lives on here too, and now has a dedicated home</span>
      </span>
      <span className="continuity-arrow" aria-hidden="true">→</span>
    </Link>
  );
}

interface GrewOutOfNoteProps {
  parentSpaceId: string;
  parentSpaceName: string;
}

/** Child-side note: this space grew out of its parent. */
export function GrewOutOfNote({ parentSpaceId, parentSpaceName }: GrewOutOfNoteProps): JSX.Element {
  return (
    <div className="continuity-note">
      <span className="continuity-icon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      </span>
      <span>
        Grew out of{' '}
        <Link to={`/spaces/${parentSpaceId}`} className="continuity-note-link">{parentSpaceName}</Link>
      </span>
    </div>
  );
}
