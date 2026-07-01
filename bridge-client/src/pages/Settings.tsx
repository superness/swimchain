/**
 * Bridge Settings Page
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBridgeEngine } from '../services/BridgeEngine';
import type { BridgeConfig } from '../types';
import { getDefaultConfig } from '../types';
import './ConfigPage.css';

export function Settings(): JSX.Element {
  const engine = getBridgeEngine();
  const [config, setConfig] = useState<BridgeConfig>(engine.getConfig());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(engine.getConfig());
  }, []);

  const handleSave = () => {
    engine.updateConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm('Reset all bridge settings to defaults?')) {
      const defaults = getDefaultConfig();
      setConfig(defaults);
      engine.updateConfig(defaults);
    }
  };

  return (
    <div className="config-page">
      <header className="config-header">
        <div className="header-title">
          <Link to="/dashboard" className="back-link">\u2190 Back</Link>
          <h1>Bridge Settings</h1>
        </div>
      </header>

      <main id="main-content" className="config-main">
        <form
          className="config-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <section className="config-section">
            <h2>General</h2>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                />
                Enable bridge
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="targetSpace">
                Target Space
                <span className="help-text">
                  Swimchain space to bridge content to/from.
                </span>
              </label>
              <input
                id="targetSpace"
                type="text"
                placeholder="sp1example..."
                value={config.targetSpace}
                onChange={(e) => setConfig((c) => ({ ...c, targetSpace: e.target.value }))}
              />
            </div>
          </section>

          <section className="config-section">
            <h2>Rate Limits</h2>

            <div className="form-group">
              <label htmlFor="maxPosts">
                Max Posts per Hour
                <span className="help-text">
                  Maximum messages to bridge per hour per space.
                </span>
              </label>
              <input
                id="maxPosts"
                type="number"
                min="1"
                max="100"
                value={config.maxPostsPerHour}
                onChange={(e) => setConfig((c) => ({ ...c, maxPostsPerHour: parseInt(e.target.value) }))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="powBudget">
                Daily PoW Budget (seconds)
                <span className="help-text">
                  Maximum PoW seconds to spend per day.
                </span>
              </label>
              <input
                id="powBudget"
                type="number"
                min="60"
                max="28800"
                step="60"
                value={config.dailyPowBudgetSeconds}
                onChange={(e) => setConfig((c) => ({ ...c, dailyPowBudgetSeconds: parseInt(e.target.value) }))}
              />
            </div>
          </section>

          <div className="config-actions">
            <button type="submit" className="btn btn-primary">
              {saved ? '\u2713 Saved' : 'Save Settings'}
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
