/**
 * Settings Page - Archiver Client
 *
 * Configure archiver behavior and preferences.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ArchiverConfig } from '../types';
import { getDefaultConfig } from '../types';
import { STORAGE_KEYS, MIN_STORAGE_BUDGET_GB, MAX_STORAGE_BUDGET_GB } from '../types/constants';
import { useBlocklist } from '../hooks/useBlocklist';
import './Settings.css';

export function Settings(): JSX.Element {
  const [config, setConfig] = useState<ArchiverConfig>(getDefaultConfig());
  const [saved, setSaved] = useState(false);
  const [spaceInput, setSpaceInput] = useState('');
  const [blockInput, setBlockInput] = useState('');
  const { getBlocked, block, unblock } = useBlocklist();

  // Load config on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (stored) {
        setConfig({ ...getDefaultConfig(), ...JSON.parse(stored) });
      }
    } catch {
      // Use defaults
    }
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  };

  const handleAddSpace = () => {
    if (spaceInput.trim() && !config.targetSpaces.includes(spaceInput.trim())) {
      setConfig((c) => ({
        ...c,
        targetSpaces: [...c.targetSpaces, spaceInput.trim()],
      }));
      setSpaceInput('');
    }
  };

  const handleRemoveSpace = (space: string) => {
    setConfig((c) => ({
      ...c,
      targetSpaces: c.targetSpaces.filter((s) => s !== space),
    }));
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults?')) {
      setConfig(getDefaultConfig());
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div className="header-title">
          <Link to="/dashboard" className="back-link">
            \u2190 Back
          </Link>
          <h1>Settings</h1>
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
          {/* Target Spaces */}
          <section className="settings-section">
            <h2>Target Spaces</h2>
            <p className="section-description">
              Spaces to monitor for decaying content.
            </p>

            <div className="space-list">
              {config.targetSpaces.length === 0 ? (
                <p className="empty-spaces">No spaces configured.</p>
              ) : (
                config.targetSpaces.map((space) => (
                  <div key={space} className="space-tag">
                    <span>{space}</span>
                    <button
                      type="button"
                      className="remove-space"
                      onClick={() => handleRemoveSpace(space)}
                      aria-label={`Remove ${space}`}
                    >
                      \u00D7
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-space-group">
              <input
                type="text"
                placeholder="Space ID (e.g., sp1general)"
                value={spaceInput}
                onChange={(e) => setSpaceInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSpace())}
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddSpace}>
                Add Space
              </button>
            </div>
          </section>

          {/* Thresholds */}
          <section className="settings-section">
            <h2>Thresholds</h2>

            <div className="form-group">
              <label htmlFor="archiveThreshold">
                Archive Threshold (%)
                <span className="help-text">
                  Archive content when heat falls below this value.
                </span>
              </label>
              <input
                id="archiveThreshold"
                type="number"
                min="1"
                max="50"
                step="1"
                value={Math.round(config.minHeatBeforeArchiving * 100)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    minHeatBeforeArchiving: parseInt(e.target.value) / 100,
                  }))
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="engageThreshold">
                Auto-Engage Threshold (%)
                <span className="help-text">
                  Automatically engage when heat falls below this value.
                </span>
              </label>
              <input
                id="engageThreshold"
                type="number"
                min="1"
                max="50"
                step="1"
                value={Math.round(config.autoEngageThreshold * 100)}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    autoEngageThreshold: parseInt(e.target.value) / 100,
                  }))
                }
              />
            </div>
          </section>

          {/* Budgets */}
          <section className="settings-section">
            <h2>Budgets</h2>

            <div className="form-group">
              <label htmlFor="storageBudget">
                Storage Budget (GB)
                <span className="help-text">
                  Maximum storage to use for archived content.
                </span>
              </label>
              <input
                id="storageBudget"
                type="number"
                min={MIN_STORAGE_BUDGET_GB}
                max={MAX_STORAGE_BUDGET_GB}
                step="1"
                value={config.storageBudgetGB}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    storageBudgetGB: parseInt(e.target.value),
                  }))
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="powBudget">
                Daily PoW Budget (seconds)
                <span className="help-text">
                  Maximum PoW seconds to spend per day on engagement.
                </span>
              </label>
              <input
                id="powBudget"
                type="number"
                min="60"
                max="28800"
                step="60"
                value={config.dailyPowBudgetSeconds}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    dailyPowBudgetSeconds: parseInt(e.target.value),
                  }))
                }
              />
            </div>
          </section>

          {/* Auto-Engage */}
          <section className="settings-section">
            <h2>Auto-Engage</h2>

            <div className="form-group checkbox-group">
              <label htmlFor="enableAutoEngage">
                <input
                  id="enableAutoEngage"
                  type="checkbox"
                  checked={config.enableAutoEngage}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      enableAutoEngage: e.target.checked,
                    }))
                  }
                />
                Enable automatic engagement
                <span className="help-text">
                  Automatically contribute PoW to at-risk content.
                </span>
              </label>
            </div>
          </section>

          {/* Blocked Authors */}
          <section className="settings-section">
            <h2>Blocked Authors</h2>
            <p className="section-description">
              Content from blocked authors will be excluded from at-risk monitoring and auto-engagement.
            </p>

            <div className="space-list">
              {getBlocked('user').length === 0 ? (
                <p className="empty-spaces">No blocked authors.</p>
              ) : (
                getBlocked('user').map((item) => (
                  <div key={item.id} className="space-tag">
                    <span>{item.id.length > 20 ? `${item.id.slice(0, 10)}...${item.id.slice(-6)}` : item.id}</span>
                    <button
                      type="button"
                      className="remove-space"
                      onClick={() => unblock(item.id, 'user')}
                      aria-label={`Unblock ${item.id}`}
                    >
                      {'\u00D7'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-space-group">
              <input
                type="text"
                placeholder="Author address (e.g., cs1...)"
                value={blockInput}
                onChange={(e) => setBlockInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (blockInput.trim()) {
                      block(blockInput.trim(), 'user');
                      setBlockInput('');
                    }
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (blockInput.trim()) {
                    block(blockInput.trim(), 'user');
                    setBlockInput('');
                  }
                }}
              >
                Block Author
              </button>
            </div>
          </section>

          {/* Actions */}
          <div className="settings-actions">
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
