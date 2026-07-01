/**
 * Analytics Settings Page
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMetricsCollector } from '../services/MetricsCollector';
import type { AnalyticsConfig } from '../types';
import { getDefaultConfig, METRICS_POLL_INTERVAL_MS } from '../types';
import './Settings.css';

export function Settings(): JSX.Element {
  const collector = getMetricsCollector();
  const [config, setConfig] = useState<AnalyticsConfig>(collector.getConfig());
  const [saved, setSaved] = useState(false);
  const [spaceInput, setSpaceInput] = useState('');

  useEffect(() => {
    setConfig(collector.getConfig());
  }, []);

  const handleSave = () => {
    collector.updateConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm('Reset all analytics settings to defaults?')) {
      const defaults = getDefaultConfig();
      setConfig(defaults);
      collector.updateConfig(defaults);
    }
  };

  const handleAddSpace = () => {
    const space = spaceInput.trim();
    if (space && !config.watchedSpaces.includes(space)) {
      setConfig(c => ({
        ...c,
        watchedSpaces: [...c.watchedSpaces, space],
      }));
      setSpaceInput('');
    }
  };

  const handleRemoveSpace = (spaceId: string) => {
    setConfig(c => ({
      ...c,
      watchedSpaces: c.watchedSpaces.filter(s => s !== spaceId),
    }));
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="header-title">
          <Link to="/" className="back-link">← Back</Link>
          <h1>Analytics Settings</h1>
        </div>
      </header>

      <main className="settings-main">
        <form
          className="settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <section className="settings-section">
            <h2>General</h2>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig(c => ({ ...c, enabled: e.target.checked }))}
                />
                Enable metrics collection
              </label>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enableAlerts}
                  onChange={(e) => setConfig(c => ({ ...c, enableAlerts: e.target.checked }))}
                />
                Enable alert notifications
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="pollInterval">
                Poll Interval (seconds)
                <span className="help-text">
                  How often to fetch new metrics. Default: {METRICS_POLL_INTERVAL_MS / 1000}s
                </span>
              </label>
              <input
                id="pollInterval"
                type="number"
                min="10"
                max="300"
                value={config.pollIntervalMs / 1000}
                onChange={(e) => setConfig(c => ({
                  ...c,
                  pollIntervalMs: parseInt(e.target.value) * 1000,
                }))}
              />
            </div>
          </section>

          <section className="settings-section">
            <h2>Watched Spaces</h2>
            <p className="section-description">
              Add specific spaces to monitor. Leave empty to monitor all accessible spaces.
            </p>

            <div className="item-list">
              {config.watchedSpaces.length === 0 ? (
                <p className="empty-items">Monitoring all accessible spaces.</p>
              ) : (
                config.watchedSpaces.map((spaceId) => (
                  <div key={spaceId} className="item-tag">
                    <span>{spaceId}</span>
                    <button
                      type="button"
                      className="remove-item"
                      onClick={() => handleRemoveSpace(spaceId)}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-item-group">
              <input
                type="text"
                placeholder="sp1example..."
                value={spaceInput}
                onChange={(e) => setSpaceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSpace())}
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddSpace}>
                Add Space
              </button>
            </div>
          </section>

          <div className="settings-actions">
            <button type="submit" className="btn btn-primary">
              {saved ? '✓ Saved' : 'Save Settings'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleReset}>
              Reset to Defaults
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
