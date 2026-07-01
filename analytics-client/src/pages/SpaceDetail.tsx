/**
 * Space Detail Page
 */

import { useParams, Link } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';
import { HeatHistogram } from '../components/HeatHistogram';
import './SpaceDetail.css';

export function SpaceDetail(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { getSpaceMetrics, recentPosts, refresh, isCollecting } = useMetrics();

  const metrics = spaceId ? getSpaceMetrics(spaceId) : undefined;
  const spacePosts = recentPosts.filter(p => p.spaceId === spaceId);

  const formatPercent = (n: number): string => `${n.toFixed(1)}%`;
  const formatDate = (d: Date): string => d.toLocaleString();

  if (!metrics) {
    return (
      <div className="space-detail-page">
        <header className="detail-header">
          <div className="header-title">
            <Link to="/spaces" className="back-link">← Back to Spaces</Link>
            <h1>Space: {spaceId}</h1>
          </div>
        </header>
        <main className="detail-main">
          <div className="empty-state">
            No metrics available for this space.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="space-detail-page">
      <header className="detail-header">
        <div className="header-title">
          <Link to="/spaces" className="back-link">← Back to Spaces</Link>
          <h1>{metrics.name || metrics.spaceId}</h1>
        </div>
        <div className="header-actions">
          <span className="last-updated">
            Updated: {formatDate(metrics.timestamp)}
          </span>
          <button
            className="btn btn-secondary"
            onClick={refresh}
            disabled={!isCollecting}
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="detail-main">
        <section className="overview-section">
          <div className="stat-cards">
            <div className="stat-card">
              <span className="stat-label">Total Posts</span>
              <span className="stat-value">{metrics.totalPosts}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Posts at Risk</span>
              <span className={`stat-value ${metrics.postsAtRisk > 0 ? 'warning' : ''}`}>
                {metrics.postsAtRisk}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Healthy Posts</span>
              <span className="stat-value success">{metrics.healthyPosts}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Average Heat</span>
              <span className={`stat-value ${metrics.avgHeat < 30 ? 'danger' : metrics.avgHeat > 60 ? 'success' : ''}`}>
                {formatPercent(metrics.avgHeat)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Active Members</span>
              <span className="stat-value">{metrics.activeContributors}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Posts (24h)</span>
              <span className="stat-value">{metrics.postsLast24h}</span>
            </div>
          </div>
        </section>

        <section className="distribution-section">
          <h2>Heat Distribution</h2>
          <div className="distribution-content">
            <HeatHistogram
              buckets={metrics.heatDistribution.buckets.map(b => b.count)}
            />
            <div className="distribution-stats">
              <div className="dist-stat">
                <span className="dist-label">Median Heat</span>
                <span className="dist-value">{formatPercent(metrics.heatDistribution.medianHeat)}</span>
              </div>
              <div className="dist-stat">
                <span className="dist-label">Total Posts Analyzed</span>
                <span className="dist-value">{metrics.heatDistribution.totalPosts}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="posts-section">
          <h2>Recent Posts</h2>
          {spacePosts.length === 0 ? (
            <p className="empty-state">No recent posts available.</p>
          ) : (
            <table className="posts-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Author</th>
                  <th>Heat</th>
                  <th>Engagements</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {spacePosts.map(post => (
                  <tr key={post.id} className={post.isAtRisk ? 'at-risk' : ''}>
                    <td className="col-time">{formatDate(post.createdAt)}</td>
                    <td className="col-author">{post.authorId.slice(0, 12)}...</td>
                    <td className="col-heat">
                      <span className={`heat-badge ${post.heat < 30 ? 'low' : post.heat > 70 ? 'high' : 'med'}`}>
                        {formatPercent(post.heat)}
                      </span>
                    </td>
                    <td className="col-engagements">{post.engagementCount}</td>
                    <td className="col-status">
                      {post.isAtRisk ? (
                        <span className="status-badge at-risk">At Risk</span>
                      ) : (
                        <span className="status-badge healthy">Healthy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
