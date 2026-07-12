/**
 * "Recently formed" rail (SPEC_13, Phase 2 — Lane B).
 *
 * A small discovery section highlighting communities that recently grew their
 * own space out of a parent. This is the anti-segregation guarantee made
 * visible: new lanes surface in discovery with their lineage on display rather
 * than being tucked away.
 *
 * Renders nothing when no formed communities are known, so it is invisible until
 * behavioral branching produces one.
 */

import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../utils/time';
import type { SpaceLineageGraph } from '../hooks/useLineage';
import './RecentlyFormedRail.css';

interface RecentlyFormedRailProps {
  graph: SpaceLineageGraph;
  limit?: number;
  isSpaceBlocked?: (id: string) => boolean;
}

export function RecentlyFormedRail({ graph, limit = 8, isSpaceBlocked }: RecentlyFormedRailProps): JSX.Element | null {
  const items = graph.recentlyFormed
    .filter((s) => !isSpaceBlocked?.(s.id))
    .slice(0, limit);

  if (items.length === 0) return null;

  return (
    <section className="recently-formed" aria-label="Recently formed communities">
      <div className="recently-formed-header">
        <h2 className="recently-formed-title">New communities</h2>
        <p className="recently-formed-sub">Groups whose conversations recently earned their own lane</p>
      </div>

      <div className="recently-formed-rail">
        {items.map((space) => {
          const parent = graph.parentOf(space.id);
          return (
            <Link key={space.id} to={`/spaces/${space.id}`} className="recently-formed-card">
              <div className="recently-formed-card-top">
                <span className="recently-formed-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                </span>
                {space.formedAt ? (
                  <span className="recently-formed-when">formed {formatRelativeTime(space.formedAt)}</span>
                ) : (
                  <span className="recently-formed-when">new</span>
                )}
              </div>
              <span className="recently-formed-name">{space.name}</span>
              {parent && (
                <span className="recently-formed-parent">from {parent.name}</span>
              )}
              {space.foundingMemberCount ? (
                <span className="recently-formed-members">{space.foundingMemberCount} founding members</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
