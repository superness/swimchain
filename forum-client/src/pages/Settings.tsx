/**
 * Settings and preferences page
 */

import { useState } from 'react';
import { usePreferences } from '../hooks/usePreferences';
import { usePassphraseStore } from '../hooks/usePassphraseStore';
import { DebugPanel } from '../components/DebugPanel';
import { BlocklistManager } from '../components/BlocklistManager';
import { clearDecryptedMediaCache } from '../lib/cache';
import type { Preferences } from '../types';
import './Settings.css';

export function SettingsPage(): JSX.Element {
  const { preferences, updatePreference, resetToDefaults } = usePreferences();
  const { defaultPassphrase, setDefaultPassphrase, hasDefaultPassphrase, clearAll: clearPassphrases } = usePassphraseStore();
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [newPassphrase, setNewPassphrase] = useState('');

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Display</h2>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="threadOrdering">Default Thread Ordering</label>
            <p className="setting-description">
              How threads are sorted by default when viewing a space.
            </p>
          </div>
          <select
            id="threadOrdering"
            value={preferences.threadOrdering}
            onChange={(e) =>
              updatePreference('threadOrdering', e.target.value as Preferences['threadOrdering'])
            }
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="replies">Most Replies</option>
            <option value="active">Most Active</option>
          </select>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="threadsPerPage">Threads Per Page</label>
            <p className="setting-description">
              Number of threads to display per page.
            </p>
          </div>
          <select
            id="threadsPerPage"
            value={preferences.threadsPerPage}
            onChange={(e) =>
              updatePreference('threadsPerPage', parseInt(e.target.value, 10))
            }
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2>Encryption</h2>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="defaultPassphrase">Default Passphrase</label>
            <p className="setting-description">
              Auto-try this passphrase when viewing encrypted content.
            </p>
          </div>
          {hasDefaultPassphrase ? (
            <div className="passphrase-display">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={defaultPassphrase || ''}
                readOnly
                className="passphrase-value"
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowPassphrase(!showPassphrase)}
              >
                {showPassphrase ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setDefaultPassphrase(null)}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="passphrase-input">
              <input
                type="password"
                id="defaultPassphrase"
                placeholder="Enter passphrase..."
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  if (newPassphrase.trim()) {
                    setDefaultPassphrase(newPassphrase.trim());
                    setNewPassphrase('');
                  }
                }}
                disabled={!newPassphrase.trim()}
              >
                Save
              </button>
            </div>
          )}
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <label>Clear All Passphrases</label>
            <p className="setting-description">
              Remove all stored passphrases (default and per-post).
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              if (window.confirm('Clear all stored passphrases? This will also clear any cached decrypted images.')) {
                clearPassphrases();
                await clearDecryptedMediaCache();
              }
            }}
          >
            Clear All
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>Storage</h2>

        <div className="setting-item">
          <div className="setting-info">
            <label htmlFor="storageTargetMB">Storage Target (MB)</label>
            <p className="setting-description">
              Maximum storage to use for caching content locally.
            </p>
          </div>
          <div className="setting-range">
            <input
              type="range"
              id="storageTargetMB"
              min="100"
              max="2000"
              step="100"
              value={preferences.storageTargetMB}
              onChange={(e) =>
                updatePreference('storageTargetMB', parseInt(e.target.value, 10))
              }
            />
            <span className="range-value">{preferences.storageTargetMB} MB</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Keyboard Shortcuts</h2>
        <p className="section-description">
          Press <kbd>?</kbd> anywhere to view all keyboard shortcuts.
        </p>

        <div className="shortcuts-preview">
          <div className="shortcut">
            <kbd>j</kbd> / <kbd>k</kbd>
            <span>Navigate up/down</span>
          </div>
          <div className="shortcut">
            <kbd>Enter</kbd>
            <span>Open selected</span>
          </div>
          <div className="shortcut">
            <kbd>n</kbd>
            <span>New thread</span>
          </div>
          <div className="shortcut">
            <kbd>r</kbd>
            <span>Reply</span>
          </div>
          <div className="shortcut">
            <kbd>/</kbd>
            <span>Focus search</span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2>Blocklist</h2>
        <p className="section-description">
          Manage your blocked users, posts, spaces, and replies.
        </p>
        <BlocklistManager />
      </section>

      <section className="settings-section">
        <h2>Node & Network</h2>
        <p className="section-description">
          Debug information about the node connection and network status.
        </p>
        <DebugPanel />
      </section>

      <section className="settings-section">
        <h2>Reset</h2>
        <p className="section-description">
          Reset all settings to their default values.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            if (window.confirm('Reset all settings to defaults?')) {
              resetToDefaults();
            }
          }}
        >
          Reset to Defaults
        </button>
      </section>
    </div>
  );
}
