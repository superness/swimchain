/**
 * Analytics Dashboard
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';
import { useRpc } from '../hooks/useRpc';
import { HealthGauge } from '../components/HealthGauge';
import { AlertBanner } from '../components/AlertBanner';
import { MetricCard } from '../components/MetricCard';
import { HeatHistogram } from '../components/HeatHistogram';
import './Dashboard.css';

export function Dashboard(): JSX.Element {
  const {
    networkHealth,
    healthHistory,
    spaceMetrics,
    unacknowledgedAlerts,
    isCollecting,
    start,
    stop,
    refresh,
    acknowledgeAlert,
  } = useMetrics();

  const { connected, connecting, error } = useRpc();

  const formatNumber = (n: number): string => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  const formatPercent = (n: number): string => `${n.toFixed(1)}%`;

  // Aggregate heat distribution from all spaces (memoized)
  const aggregateHeat = useMemo(() => {
    if (spaceMetrics.length === 0) return [];
    return spaceMetrics.reduce((acc, s) => {
      s.heatDistribution.buckets.forEach((b, i) => {
        acc[i] = (acc[i] || 0) + b.count;
      });
      return acc;
    }, [] as number[]);
  }, [spaceMetrics]);

  return (
    <div className="analytics-dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Network Analytics</h1>
          <span className={`status-badge ${isCollecting ? 'active' : 'paused'}`}>
            {isCollecting ? 'Collecting' : 'Paused'}
          </span>
          <span className={`connection-badge ${connected ? 'connected' : connecting ? 'connecting' : 'disconnected'}`}>
            {connected ? 'Connected' : connecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-ghost"
            onClick={refresh}
            disabled={!isCollecting}
          >
            Refresh
          </button>
          <button
            className="btn btn-secondary"
            onClick={isCollecting ? stop : start}
          >
            {isCollecting ? 'Pause' : 'Resume'}
          </button>
          <Link to="/settings" className="btn btn-ghost">
            Settings
          </Link>
        </div>
      </header>

      {error && (
        <div className="connection-error-banner" role="alert">
          <span className="error-icon">!</span>
          <span className="error-message">Connection Error: {error}</span>
        </div>
      )}

      {unacknowledgedAlerts.length > 0 && (
        <div className="alerts-section">
          {unacknowledgedAlerts.map(alert => (
            <AlertBanner
              key={alert.id}
              alert={alert}
              onDismiss={() => acknowledgeAlert(alert.id)}
            />
          ))}
        </div>
      )}

      <main className="dashboard-main">
        <section className="health-section">
          <HealthGauge health={networkHealth} />

          <div className="health-breakdown">
            <h3>Health Breakdown</h3>
            {networkHealth ? (
              <div className="breakdown-bars">
                <div className="breakdown-item">
                  <span className="breakdown-label">Swimmers</span>
                  <div className="breakdown-bar">
                    <div
                      className="bar-fill swimmers"
                      style={{ width: `${(networkHealth.breakdown.swimmerScore / 30) * 100}%` }}
                    />
                  </div>
                  <span className="breakdown-value">{networkHealth.breakdown.swimmerScore.toFixed(0)}/30</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Risk</span>
                  <div className="breakdown-bar">
                    <div
                      className="bar-fill risk"
                      style={{ width: `${(networkHealth.breakdown.riskScore / 30) * 100}%` }}
                    />
                  </div>
                  <span className="breakdown-value">{networkHealth.breakdown.riskScore.toFixed(0)}/30</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Sync</span>
                  <div className="breakdown-bar">
                    <div
                      className="bar-fill sync"
                      style={{ width: `${(networkHealth.breakdown.syncScore / 20) * 100}%` }}
                    />
                  </div>
                  <span className="breakdown-value">{networkHealth.breakdown.syncScore.toFixed(0)}/20</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Heat</span>
                  <div className="breakdown-bar">
                    <div
                      className="bar-fill heat"
                      style={{ width: `${(networkHealth.breakdown.heatScore / 20) * 100}%` }}
                    />
                  </div>
                  <span className="breakdown-value">{networkHealth.breakdown.heatScore.toFixed(0)}/20</span>
                </div>
              </div>
            ) : (
              <p className="no-data">No health data available</p>
            )}
          </div>
        </section>

        <section className="metrics-grid">
          <MetricCard
            title="Active Swimmers"
            value={networkHealth ? formatNumber(networkHealth.activeSwimmers) : '-'}
            trend={healthHistory.length >= 2 && networkHealth
              ? networkHealth.activeSwimmers - (healthHistory[healthHistory.length - 2]?.activeSwimmers ?? 0)
              : undefined}
            icon="🏊"
          />
          <MetricCard
            title="Posts at Risk"
            value={networkHealth ? formatNumber(networkHealth.postsAtRisk) : '-'}
            trend={healthHistory.length >= 2 && networkHealth
              ? networkHealth.postsAtRisk - (healthHistory[healthHistory.length - 2]?.postsAtRisk ?? 0)
              : undefined}
            invertTrend
            icon="⚠️"
          />
          <MetricCard
            title="Average Heat"
            value={networkHealth ? formatPercent(networkHealth.avgHeat) : '-'}
            trend={healthHistory.length >= 2 && networkHealth
              ? networkHealth.avgHeat - (healthHistory[healthHistory.length - 2]?.avgHeat ?? 0)
              : undefined}
            icon="🔥"
          />
          <MetricCard
            title="Total Spaces"
            value={formatNumber(spaceMetrics.length)}
            icon="📦"
          />
        </section>

        <section className="charts-section">
          <div className="chart-card">
            <h3>Network Heat Distribution</h3>
            {aggregateHeat.length > 0 ? (
              <HeatHistogram buckets={aggregateHeat} />
            ) : (
              <p className="no-data">No heat data available</p>
            )}
          </div>

          <div className="chart-card">
            <h3>Health History (24h)</h3>
            {healthHistory.length > 0 ? (
              <div className="history-chart">
                <svg
                  viewBox="0 0 400 100"
                  className="sparkline"
                  role="img"
                  aria-label={`Health score history chart showing ${healthHistory.length} data points over 24 hours`}
                >
                  <polyline
                    fill="none"
                    stroke="var(--color-accent-primary)"
                    strokeWidth="2"
                    points={healthHistory.map((p, i) => {
                      const x = (i / Math.max(1, healthHistory.length - 1)) * 400;
                      const y = 100 - p.score;
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                </svg>
                <div className="history-labels">
                  <span>24h ago</span>
                  <span>Now</span>
                </div>
              </div>
            ) : (
              <p className="no-data">No history data available</p>
            )}
          </div>
        </section>

        <section className="spaces-section">
          <div className="section-header">
            <h3>Watched Spaces</h3>
            <Link to="/spaces" className="btn btn-sm btn-ghost">View All</Link>
          </div>
          {spaceMetrics.length > 0 ? (
            <div className="spaces-grid">
              {spaceMetrics.slice(0, 6).map(space => (
                <Link
                  key={space.spaceId}
                  to={`/spaces/${space.spaceId}`}
                  className="space-card"
                >
                  <div className="space-header">
                    <span className="space-name">{space.name || space.spaceId}</span>
                    <span className={`space-health ${space.avgHeat >= 50 ? 'healthy' : 'at-risk'}`}>
                      {formatPercent(space.avgHeat)}
                    </span>
                  </div>
                  <div className="space-stats">
                    <span>{space.totalPosts} posts</span>
                    <span>{space.postsAtRisk} at risk</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="no-data">No space metrics available</p>
          )}
        </section>
      </main>
    </div>
  );
}
