/**
 * Activity Log Page
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getBridgeEngine } from '../services/BridgeEngine';
import { ContentStatus } from '../components/ContentStatus';
import type { ActivityLogEntry } from '../types';
import './ActivityLog.css';

export function ActivityLog(): JSX.Element {
  const engine = getBridgeEngine();
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    setEntries(engine.getActivityLog());

    const unsubscribe = engine.onActivity(() => {
      setEntries(engine.getActivityLog());
    });

    return unsubscribe;
  }, []);

  const filteredEntries = useMemo(() =>
    filter === 'all'
      ? entries
      : entries.filter((e) => e.type === filter),
    [entries, filter]
  );

  const formatTime = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  return (
    <div className="activity-page">
      <header className="activity-header">
        <div className="header-title">
          <Link to="/dashboard" className="back-link">\u2190 Back</Link>
          <h1>Activity Log</h1>
        </div>
        <div className="header-controls">
          <label htmlFor="activity-filter" className="visually-hidden">Filter activities</label>
          <select
            id="activity-filter"
            className="filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Activities</option>
            <option value="message_bridged">Messages Bridged</option>
            <option value="error">Errors</option>
            <option value="connection">Connections</option>
            <option value="rate_limited">Rate Limited</option>
            <option value="spam_blocked">Spam Blocked</option>
          </select>
        </div>
      </header>

      <main id="main-content" className="activity-main">
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            No activity entries found.
          </div>
        ) : (
          <table className="activity-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Type</th>
                <th scope="col">Decay</th>
                <th scope="col">Direction</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id} className={`row-${entry.type}`}>
                  <td className="col-time">{formatTime(entry.timestamp)}</td>
                  <td className="col-type">
                    <span className={`type-badge type-${entry.type}`}>
                      {entry.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="col-decay">
                    {entry.type === 'message_bridged' && (
                      <ContentStatus createdAt={typeof entry.timestamp === 'string' ? new Date(entry.timestamp) : entry.timestamp} />
                    )}
                  </td>
                  <td className="col-direction">
                    {entry.direction && (
                      <span className={`direction-badge direction-${entry.direction}`}>
                        {entry.direction === 'inbound' ? '\u2192 CS' : 'CS \u2192'}
                      </span>
                    )}
                    {entry.sourcePlatform && entry.targetPlatform && (
                      <span className="platform-info">
                        {entry.sourcePlatform} \u2192 {entry.targetPlatform}
                      </span>
                    )}
                  </td>
                  <td className="col-desc">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
