/**
 * CommunityFormed notification surface (SPEC_09 §7.1, Phase 2 — Lane B).
 *
 * Surfaces graduation notices to founding members: "Your group's conversations
 * earned their own lane." The framing is recognition — an achievement, never an
 * eviction or removal. Each notice links into the new community and can be
 * dismissed (remembered locally).
 *
 * Renders nothing when the node has no notification RPC or there are no
 * CommunityFormed notices, so it is invisible on discovery until a graduation
 * actually happens.
 */

import { Link } from 'react-router-dom';
import { useCommunityNotifications } from '../hooks/useCommunityNotifications';
import './CommunityFormedNotifications.css';

export function CommunityFormedNotifications(): JSX.Element | null {
  const { notifications, dismiss } = useCommunityNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="community-formed-notices" role="status" aria-live="polite">
      {notifications.map((n) => {
        const name = n.name ?? 'your new community';
        return (
          <div key={n.id} className="community-formed-notice">
            <span className="community-formed-badge" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </span>

            <div className="community-formed-body">
              <p className="community-formed-headline">
                Your group's conversations earned their own lane
              </p>
              <p className="community-formed-detail">
                <Link to={`/spaces/${n.community_id}`} className="community-formed-link">{name}</Link>
                {n.parent_name ? <> grew out of <strong>{n.parent_name}</strong>.</> : <> is ready.</>}{' '}
                Everyone's still welcome in both — this is a new home, not a move.
              </p>
              <div className="community-formed-actions">
                <Link to={`/spaces/${n.community_id}`} className="btn btn-primary btn-sm">
                  Visit community
                </Link>
              </div>
            </div>

            <button
              type="button"
              className="community-formed-dismiss"
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
