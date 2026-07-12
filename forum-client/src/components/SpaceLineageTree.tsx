/**
 * Space lineage tree browser (SPEC_13, Phase 2 — Lane B).
 *
 * Renders the space discovery list as a navigable lineage tree: root spaces with
 * their behaviorally-formed children nested beneath them, expandable/collapsible,
 * with formation badges. Parents that grew children show a count; children show
 * when they formed.
 *
 * This component is only mounted when lineage edges are known. The caller
 * (SpaceList) falls back to the flat grid otherwise, so there is no separate
 * "empty" state here — an all-flat set never reaches this component.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../utils/time';
import type { Space } from '../types';
import type { SpaceLineageGraph } from '../hooks/useLineage';
import './SpaceLineageTree.css';

interface SpaceLineageTreeProps {
  graph: SpaceLineageGraph;
  isSpaceBlocked?: (id: string) => boolean;
}

interface LineageNodeProps {
  space: Space;
  graph: SpaceLineageGraph;
  level: number;
  isSpaceBlocked?: (id: string) => boolean;
  /** Guards against cycles in malformed lineage data. */
  seen: Set<string>;
}

/** A small pill indicating a space formed out of its parent. */
function FormationBadge({ space }: { space: Space }): JSX.Element | null {
  if (!space.parentId && !space.formedAt && !space.foundingMemberCount) return null;
  const when = space.formedAt ? formatRelativeTime(space.formedAt) : null;
  const members = space.foundingMemberCount;
  return (
    <span className="lineage-badge" title="Grew out of a parent space">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      <span>{when ? `formed ${when}` : 'formed community'}</span>
      {members ? <span className="lineage-badge-members">· {members} founding</span> : null}
    </span>
  );
}

function LineageNode({ space, graph, level, isSpaceBlocked, seen }: LineageNodeProps): JSX.Element | null {
  const children = graph.childrenOf(space.id).filter((c) => !seen.has(c.id));
  const hasChildren = children.length > 0;
  const [expanded, setExpanded] = useState(level < 2); // auto-expand top levels

  if (isSpaceBlocked?.(space.id)) return null;

  const nextSeen = new Set(seen);
  nextSeen.add(space.id);

  return (
    <li className="lineage-node" role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className="lineage-row" style={{ paddingLeft: `${level * 20}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className="lineage-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : (
          <span className="lineage-toggle-spacer" aria-hidden="true" />
        )}

        <Link to={`/spaces/${space.id}`} className="lineage-link">
          <span className="lineage-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
          </span>
          <span className="lineage-name">{space.name}</span>
          <FormationBadge space={space} />
          {hasChildren && (
            <span className="lineage-child-count" title={`${children.length} community grew from this space`}>
              {children.length} {children.length === 1 ? 'offshoot' : 'offshoots'}
            </span>
          )}
          <span className="lineage-post-count" aria-label={`${space.postCount} posts`}>
            {space.postCount}
          </span>
        </Link>
      </div>

      {hasChildren && expanded && (
        <ul className="lineage-children" role="group">
          {children.map((child) => (
            <LineageNode
              key={child.id}
              space={child}
              graph={graph}
              level={level + 1}
              isSpaceBlocked={isSpaceBlocked}
              seen={nextSeen}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SpaceLineageTree({ graph, isSpaceBlocked }: SpaceLineageTreeProps): JSX.Element {
  const roots = graph.roots.filter((s) => !isSpaceBlocked?.(s.id));

  return (
    <nav className="lineage-tree" aria-label="Space lineage">
      <ul className="lineage-root-list" role="tree">
        {roots.map((space) => (
          <LineageNode
            key={space.id}
            space={space}
            graph={graph}
            level={0}
            isSpaceBlocked={isSpaceBlocked}
            seen={new Set()}
          />
        ))}
      </ul>
    </nav>
  );
}
