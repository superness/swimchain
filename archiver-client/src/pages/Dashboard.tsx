/**
 * Archiver Dashboard Page
 *
 * Main dashboard showing at-risk content, status, and quick actions.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContentMonitor } from '../hooks/useContentMonitor';
import { useArchiveStorage } from '../hooks/useArchiveStorage';
import { StatusCard } from '../components/StatusCard';
import { AtRiskList } from '../components/AtRiskList';
import { BudgetMeter } from '../components/BudgetMeter';
import { useRpc } from '../hooks/useRpc';
import { useBlocklist } from '../hooks/useBlocklist';
import { STORAGE_KEYS } from '../types/constants';
import type { ArchiverConfig } from '../types';
import { getDefaultConfig } from '../types';
import './Dashboard.css';

/**
 * Load target spaces from localStorage config.
 * Returns empty array if no spaces configured (prompts user to configure in Settings).
 */
function loadTargetSpaces(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (stored) {
      const config = JSON.parse(stored) as Partial<ArchiverConfig>;
      if (Array.isArray(config.targetSpaces)) {
        return config.targetSpaces;
      }
    }
  } catch {
    // Corrupted config - use defaults
  }
  return getDefaultConfig().targetSpaces;
}

export function Dashboard(): JSX.Element {
  const [targetSpaces, setTargetSpaces] = useState<string[]>(loadTargetSpaces);
  const { connected, connecting } = useRpc();

  // Reload spaces when returning from Settings
  useEffect(() => {
    const handleStorageChange = () => {
      setTargetSpaces(loadTargetSpaces());
    };
    window.addEventListener('storage', handleStorageChange);
    // Also check on focus (for same-tab changes)
    const handleFocus = () => setTargetSpaces(loadTargetSpaces());
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const {
    atRiskContent,
    isLoading: isLoadingContent,
    lastChecked,
    criticalCount,
    warningCount,
    refresh: refreshContent,
  } = useContentMonitor(targetSpaces);

  const {
    stats,
    formatBytes,
  } = useArchiveStorage();

  const { isUserBlocked } = useBlocklist();
  const [selectedSpace, setSelectedSpace] = useState<string>('all');

  // Filter by selected space AND exclude blocked authors
  const filteredContent = useMemo(() => {
    return atRiskContent.filter((c) => {
      if (isUserBlocked(c.author)) return false;
      if (selectedSpace !== 'all' && c.spaceId !== selectedSpace) return false;
      return true;
    });
  }, [atRiskContent, selectedSpace, isUserBlocked]);

  // Connection status message
  const connectionStatus = connecting
    ? 'Connecting to node...'
    : !connected
      ? 'Disconnected from node'
      : null;

  return (
    <div className="dashboard">
      {/* Connection Status Banner */}
      {connectionStatus && (
        <div
          className={`connection-banner ${connected ? '' : 'connection-banner--warning'}`}
          role="status"
          aria-live="polite"
        >
          {connectionStatus}
        </div>
      )}

      <header className="dashboard-header">
        <div className="header-title">
          <h1>Swimchain Archiver</h1>
          <p className="header-subtitle">Preserving valuable content</p>
        </div>
        <nav className="header-nav">
          <Link to="/archived" className="nav-link">
            Archived Content
          </Link>
          <Link to="/settings" className="nav-link">
            Settings
          </Link>
        </nav>
      </header>

      <main className="dashboard-main">
        {/* Identity requirement notice */}
        {connected && (
          <div
            className="connection-banner"
            role="note"
            style={{ background: '#1a3a4a', color: '#7ec8e3', marginBottom: '12px' }}
          >
            Auto-engage requires a node identity for PoW mining. Ensure your Swimchain node has an identity registered via the CLI (<code>sw identity create</code>).
          </div>
        )}

        {/* Status Cards Row */}
        <section
          className={`status-section${!connected && !connecting ? ' status-section--offline' : ''}`}
          aria-label="Status Overview"
        >
          {!connected && !connecting && (
            <div className="status-offline-badge" role="status">
              Offline — metrics may be stale
            </div>
          )}
          <StatusCard
            label="Spaces Monitored"
            value={targetSpaces.length}
            icon="eye"
          />
          <StatusCard
            label="Critical"
            value={criticalCount}
            icon="alert"
            variant="critical"
          />
          <StatusCard
            label="Warning"
            value={warningCount}
            icon="warning"
            variant="warning"
          />
          <StatusCard
            label="Archived"
            value={stats?.entryCount ?? 0}
            icon="archive"
          />
          <StatusCard
            label="Storage Used"
            value={stats ? formatBytes(stats.bytesUsed) : '0 B'}
            icon="database"
          />
        </section>

        {/* Budget and Controls */}
        <section className="controls-section">
          <div className="budget-container">
            <BudgetMeter />
          </div>
          <div className="filter-controls">
            <label htmlFor="space-filter" className="filter-label">
              Filter by space:
            </label>
            <select
              id="space-filter"
              className="space-select"
              value={selectedSpace}
              onChange={(e) => setSelectedSpace(e.target.value)}
            >
              <option value="all">All Spaces</option>
              {targetSpaces.map((space) => (
                <option key={space} value={space}>
                  {space}
                </option>
              ))}
            </select>
            <button
              className="btn btn-secondary refresh-btn"
              onClick={refreshContent}
              disabled={isLoadingContent}
            >
              {isLoadingContent ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </section>

        {/* At-Risk Content List */}
        <section className="content-section" aria-label="At-Risk Content">
          <div className="section-header">
            <h2>At-Risk Content</h2>
            {lastChecked && (
              <span className="last-checked">
                Last checked: {lastChecked.toLocaleTimeString()}
              </span>
            )}
          </div>

          {targetSpaces.length === 0 ? (
            <div className="empty-state">
              <p>No spaces configured for monitoring.</p>
              <p className="empty-hint">
                <Link to="/settings">Configure spaces in Settings</Link> to start monitoring content.
              </p>
            </div>
          ) : isLoadingContent ? (
            <div className="loading-state">
              <div className="loading-spinner" aria-hidden="true"></div>
              <p>Scanning for at-risk content...</p>
            </div>
          ) : filteredContent.length === 0 ? (
            <div className="empty-state">
              <p>No at-risk content found in monitored spaces.</p>
              <p className="empty-hint">
                Content with heat below 10% will appear here.
              </p>
            </div>
          ) : (
            <AtRiskList content={filteredContent} />
          )}
        </section>
      </main>

      <footer className="dashboard-footer">
        <p>
          Swimchain Archiver v0.1.0 | Storage:{' '}
          {stats ? `${stats.usagePercent.toFixed(1)}%` : '0%'} of budget
        </p>
      </footer>
    </div>
  );
}
