/**
 * Bridge Dashboard Page
 *
 * Main dashboard showing connection status and bridge activity.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBridgeEngine, BridgeEngine } from '../services/BridgeEngine';
import { useBridgeEngineRpc } from '../hooks/useBridgeEngine';
import type { PlatformStatus, ActivityLogEntry } from '../types';
import './Dashboard.css';

export function Dashboard(): JSX.Element {
  // Connect BridgeEngine to RPC
  useBridgeEngineRpc();

  const [engine] = useState<BridgeEngine>(() => getBridgeEngine());
  const [statuses, setStatuses] = useState<PlatformStatus[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLogEntry[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Initial load
    setStatuses(engine.getAllPlatformStatuses());
    setRecentActivity(engine.getActivityLog().slice(0, 10));

    // Subscribe to activity
    const unsubscribe = engine.onActivity((entry) => {
      setRecentActivity((prev) => [entry, ...prev].slice(0, 10));
    });

    // Refresh statuses periodically
    const interval = setInterval(() => {
      setStatuses(engine.getAllPlatformStatuses());
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [engine]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await engine.initialize();
      await engine.connect();
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      setIsConnecting(false);
      setStatuses(engine.getAllPlatformStatuses());
    }
  };

  const handleDisconnect = () => {
    engine.disconnect();
    setStatuses(engine.getAllPlatformStatuses());
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'connected':
        return 'var(--color-success)';
      case 'connecting':
        return 'var(--color-warning)';
      case 'error':
        return 'var(--color-error)';
      default:
        return 'var(--color-text-tertiary)';
    }
  };

  const formatTime = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString();
  };

  const isAnyConnected = statuses.some((s) => s.status === 'connected');

  return (
    <div className="bridge-dashboard">
      <div className="dashboard-main">
        {/* Connection Controls */}
        <section className="controls-section">
          <div className="connection-controls">
            {!isAnyConnected ? (
              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Bridge'}
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={handleDisconnect}>
                Disconnect
              </button>
            )}
          </div>
          <div className="budget-display">
            <span className="budget-label">Daily PoW Budget:</span>
            <span className="budget-value">
              {Math.floor(engine.getRemainingPowBudget() / 60)}m remaining
            </span>
          </div>
        </section>

        {/* Platform Status Cards */}
        <section className="status-section">
          <h2>Platform Status</h2>
          <div className="status-grid">
            {statuses.map((status) => (
              <div key={status.platform} className="status-card">
                <div className="status-header">
                  <span className={`platform-badge platform-${status.platform}`}>
                    {status.platform.toUpperCase()}
                  </span>
                  <div className="connection-status">
                    <span
                      className="status-dot"
                      style={{ backgroundColor: getStatusColor(status.status) }}
                      aria-hidden="true"
                    />
                    <span className="status-text">{status.status}</span>
                    <span className="visually-hidden">
                      {status.status === 'connected' ? 'Connected' :
                       status.status === 'connecting' ? 'Connecting' :
                       status.status === 'error' ? 'Error' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                <div className="status-body">
                  <div className="stat">
                    <span className="stat-label">Bridged Today</span>
                    <span className="stat-value">{status.messagesBridgedToday}</span>
                  </div>
                  {status.lastSync && (
                    <div className="stat">
                      <span className="stat-label">Last Sync</span>
                      <span className="stat-value">{formatTime(status.lastSync)}</span>
                    </div>
                  )}
                  {status.lastError && (
                    <div className="status-error">{status.lastError}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="activity-section">
          <div className="section-header">
            <h2>Recent Activity</h2>
            <Link to="/activity" className="view-all-link">View All</Link>
          </div>
          <div aria-live="polite" aria-atomic="false">
            {recentActivity.length === 0 ? (
              <div className="empty-state">No recent activity</div>
            ) : (
              <ul className="activity-list">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className={`activity-item activity-${entry.type}`}>
                    <span className="activity-time">{formatTime(entry.timestamp)}</span>
                    <span className="activity-type">{entry.type.replace('_', ' ')}</span>
                    <span className="activity-desc">{entry.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
