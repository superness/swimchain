/**
 * Spaces List Page
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';
import './Spaces.css';

export function Spaces(): JSX.Element {
  const { spaceMetrics, isCollecting, refresh } = useMetrics();

  const formatPercent = (n: number): string => `${n.toFixed(1)}%`;

  // Memoize sorted spaces to avoid re-sorting on every render
  const sortedSpaces = useMemo(() => {
    return [...spaceMetrics].sort((a, b) => {
      // Sort by risk (most at-risk first)
      return b.postsAtRisk - a.postsAtRisk;
    });
  }, [spaceMetrics]);

  return (
    <div className="spaces-page">
      <header className="spaces-header">
        <div className="header-title">
          <Link to="/" className="back-link">← Back</Link>
          <h1>All Spaces</h1>
        </div>
        <div className="header-actions">
          <span className="space-count">{spaceMetrics.length} spaces monitored</span>
          <button
            className="btn btn-secondary"
            onClick={refresh}
            disabled={!isCollecting}
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="spaces-main">
        {sortedSpaces.length === 0 ? (
          <div className="empty-state">
            No space metrics available. Metrics will appear once collection starts.
          </div>
        ) : (
          <div className="spaces-list">
            {sortedSpaces.map(space => (
              <Link
                key={space.spaceId}
                to={`/spaces/${space.spaceId}`}
                className="space-row"
              >
                <div className="space-info">
                  <span className="space-name">{space.name || space.spaceId}</span>
                  <span className="space-id">{space.spaceId}</span>
                </div>

                <div className="space-metrics">
                  <div className="metric">
                    <span className="metric-label">Posts</span>
                    <span className="metric-value">{space.totalPosts}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">At Risk</span>
                    <span className={`metric-value ${space.postsAtRisk > 0 ? 'warning' : ''}`}>
                      {space.postsAtRisk}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Avg Heat</span>
                    <span className={`metric-value ${space.avgHeat < 30 ? 'danger' : space.avgHeat > 60 ? 'success' : ''}`}>
                      {formatPercent(space.avgHeat)}
                    </span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Members</span>
                    <span className="metric-value">{space.activeContributors}</span>
                  </div>
                </div>

                <div className="space-health">
                  <div
                    className="health-bar"
                    style={{ '--health': `${space.avgHeat}%` } as React.CSSProperties}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
