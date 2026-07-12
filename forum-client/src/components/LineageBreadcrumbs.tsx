/**
 * Lineage breadcrumbs (SPEC_13, Phase 2 — Lane B).
 *
 * Shows the ancestor path for a space that grew out of a parent, e.g.
 *   general / general/community-1a2b3c
 * Each segment links to that space. Renders nothing when the space has no known
 * lineage (a normal top-level space), so it is invisible until behavioral
 * branching produces a parent/child relationship.
 */

import { Link } from 'react-router-dom';
import type { Space } from '../types';
import './LineageBreadcrumbs.css';

interface LineageBreadcrumbsProps {
  /** Ancestor chain, root-first (from useSpaceLineage().ancestors). */
  ancestors: Space[];
  /** The current space's display name (rendered as the final, non-link crumb). */
  currentName: string;
}

export function LineageBreadcrumbs({ ancestors, currentName }: LineageBreadcrumbsProps): JSX.Element | null {
  if (ancestors.length === 0) return null;

  return (
    <nav className="lineage-breadcrumbs" aria-label="Space lineage">
      {ancestors.map((a) => (
        <span key={a.id} className="lineage-crumb">
          <Link to={`/spaces/${a.id}`} className="lineage-crumb-link">{a.name}</Link>
          <span className="lineage-crumb-sep" aria-hidden="true">/</span>
        </span>
      ))}
      <span className="lineage-crumb lineage-crumb-current" aria-current="page">{currentName}</span>
    </nav>
  );
}
