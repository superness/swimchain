/**
 * Bridge Settings Page
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBridgeEngine } from '../services/BridgeEngine';
import type { BridgeConfig } from '../types';
import { getDefaultConfig } from '../types';
import { useBlocklist } from '../hooks/useBlocklist';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import './ConfigPage.css';

export function Settings(): JSX.Element {
  const engine = getBridgeEngine();
  const [config, setConfig] = useState<BridgeConfig>(engine.getConfig());
  const [saved, setSaved] = useState(false);
  const [blockInput, setBlockInput] = useState('');
  const { getBlocked, block, unblock } = useBlocklist();
  const { listPrivateSpaces, storeSpaceKey, removeSpaceKey } = usePrivateSpaceKeys();
  const [newSpaceId, setNewSpaceId] = useState('');
  const [newSpaceKey, setNewSpaceKey] = useState('');
  const [newSpaceName, setNewSpaceName] = useState('');

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

          <section className="config-section">
            <h2>Blocked Users</h2>
            <p className="help-text" style={{ marginBottom: 'var(--spacing-md)' }}>
              Content from blocked users will not be bridged to external platforms.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
              {getBlocked('user').length === 0 ? (
                <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic' }}>No blocked users.</p>
              ) : (
                getBlocked('user').map((item) => (
                  <span
                    key={item.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-xs)',
                      padding: 'var(--spacing-xs) var(--spacing-sm)',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-sm)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {item.id.length > 20 ? `${item.id.slice(0, 10)}...${item.id.slice(-6)}` : item.id}
                    <button
                      type="button"
                      onClick={() => unblock(item.id, 'user')}
                      aria-label={`Unblock ${item.id}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-lg)',
                        lineHeight: 1,
                      }}
                    >
                      {'\u00D7'}
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="form-group" style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              <input
                type="text"
                placeholder="User address (e.g., cs1...)"
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
                style={{ flex: 1 }}
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
                Block
              </button>
            </div>
          </section>

          <section className="config-section">
            <h2>Private Spaces</h2>
            <p className="help-text" style={{ marginBottom: 'var(--spacing-md)' }}>
              Add AES-256-GCM keys for private spaces to decrypt content before bridging.
              Content from private spaces will be decrypted and bridged as plaintext.
            </p>

            {listPrivateSpaces.length === 0 ? (
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)', fontStyle: 'italic', marginBottom: 'var(--spacing-md)' }}>
                No private space keys configured.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
                {listPrivateSpaces.map((space) => (
                  <div
                    key={space.spaceId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {space.spaceName || `Space ${space.spaceId.substring(0, 16)}...`}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                        {space.spaceId.substring(0, 20)}...
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: 'var(--spacing-xs) var(--spacing-sm)', fontSize: 'var(--font-size-sm)' }}
                      onClick={() => removeSpaceKey(space.spaceId)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              <div className="form-group">
                <label htmlFor="privateSpaceId">Space ID</label>
                <input
                  id="privateSpaceId"
                  type="text"
                  placeholder="sp1..."
                  value={newSpaceId}
                  onChange={(e) => setNewSpaceId(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="privateSpaceKey">
                  AES Key (64 hex characters)
                  <span className="help-text">The 32-byte AES-256-GCM key for this space, hex-encoded.</span>
                </label>
                <input
                  id="privateSpaceKey"
                  type="password"
                  placeholder="Hex-encoded key..."
                  value={newSpaceKey}
                  onChange={(e) => setNewSpaceKey(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="privateSpaceName">Space Name (optional)</label>
                <input
                  id="privateSpaceName"
                  type="text"
                  placeholder="My Private Space"
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!newSpaceId.trim() || !newSpaceKey.trim() || newSpaceKey.trim().length !== 64}
                onClick={() => {
                  storeSpaceKey(newSpaceId.trim(), newSpaceKey.trim(), newSpaceName.trim() || undefined);
                  setNewSpaceId('');
                  setNewSpaceKey('');
                  setNewSpaceName('');
                }}
              >
                Add Private Space Key
              </button>
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
