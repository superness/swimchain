/**
 * Settings Page - Feed preferences, blocklist, and debug info
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFeedPreferences } from '../hooks/useFeedPreferences';
import { BlocklistManager } from '../components/BlocklistManager';
import { DebugPanel } from '../components/DebugPanel';
import { useToast } from '../components/Toast';
import './Settings.css';

export function Settings(): JSX.Element {
  const { preferences, updateSettings, loading } = useFeedPreferences();
  const { success } = useToast();
  const [showBlocklist, setShowBlocklist] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const handleToggle = (key: 'compactMode' | 'showRepliesInFeed' | 'showEngagementsInFeed', value: boolean) => {
    updateSettings({ [key]: value });
    success(`Setting updated`);
  };

  const handleSortOrderChange = (sortOrder: 'recent' | 'hot') => {
    updateSettings({ sortOrder });
    success(`Default sort changed to ${sortOrder}`);
  };

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <Link to="/" className="settings-page__back" aria-label="Back to feed">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className="settings-page__title">Settings</h1>
      </header>

      <main className="settings-page__content">
        {/* Feed Preferences */}
        <section className="settings-section">
          <h2 className="settings-section__title">Feed Preferences</h2>

          <div className="settings-group">
            <div className="settings-item">
              <div className="settings-item__info">
                <label htmlFor="compact-mode" className="settings-item__label">Compact Mode</label>
                <p className="settings-item__description">Show smaller feed cards with less whitespace</p>
              </div>
              <label className="settings-toggle">
                <input
                  id="compact-mode"
                  type="checkbox"
                  checked={preferences.compactMode}
                  onChange={(e) => handleToggle('compactMode', e.target.checked)}
                  disabled={loading}
                />
                <span className="settings-toggle__slider" />
              </label>
            </div>

            <div className="settings-item">
              <div className="settings-item__info">
                <label htmlFor="show-replies" className="settings-item__label">Show Replies in Feed</label>
                <p className="settings-item__description">Include reply activity in your main feed</p>
              </div>
              <label className="settings-toggle">
                <input
                  id="show-replies"
                  type="checkbox"
                  checked={preferences.showRepliesInFeed}
                  onChange={(e) => handleToggle('showRepliesInFeed', e.target.checked)}
                  disabled={loading}
                />
                <span className="settings-toggle__slider" />
              </label>
            </div>

            <div className="settings-item">
              <div className="settings-item__info">
                <label htmlFor="show-engagements" className="settings-item__label">Show Engagement Activity</label>
                <p className="settings-item__description">Show when people react to posts</p>
              </div>
              <label className="settings-toggle">
                <input
                  id="show-engagements"
                  type="checkbox"
                  checked={preferences.showEngagementsInFeed}
                  onChange={(e) => handleToggle('showEngagementsInFeed', e.target.checked)}
                  disabled={loading}
                />
                <span className="settings-toggle__slider" />
              </label>
            </div>

            <div className="settings-item">
              <div className="settings-item__info">
                <span className="settings-item__label">Default Sort Order</span>
                <p className="settings-item__description">How posts are sorted when you open the feed</p>
              </div>
              <div className="settings-select-group">
                <button
                  type="button"
                  className={`settings-select-btn ${preferences.sortOrder === 'recent' ? 'settings-select-btn--active' : ''}`}
                  onClick={() => handleSortOrderChange('recent')}
                  disabled={loading}
                >
                  Recent
                </button>
                <button
                  type="button"
                  className={`settings-select-btn ${preferences.sortOrder === 'hot' ? 'settings-select-btn--active' : ''}`}
                  onClick={() => handleSortOrderChange('hot')}
                  disabled={loading}
                >
                  Hot
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Moderation */}
        <section className="settings-section">
          <h2 className="settings-section__title">Moderation</h2>

          <div className="settings-group">
            <button
              type="button"
              className="settings-action-btn"
              onClick={() => setShowBlocklist(true)}
            >
              <div className="settings-action-btn__content">
                <span className="settings-action-btn__icon" aria-hidden="true">🚫</span>
                <div className="settings-action-btn__info">
                  <span className="settings-action-btn__label">Manage Blocklist</span>
                  <span className="settings-action-btn__description">
                    View and manage blocked users, posts, and spaces
                  </span>
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </section>

        {/* Developer */}
        <section className="settings-section">
          <h2 className="settings-section__title">Developer</h2>

          <div className="settings-group">
            <button
              type="button"
              className="settings-action-btn"
              onClick={() => setShowDebugPanel(true)}
            >
              <div className="settings-action-btn__content">
                <span className="settings-action-btn__icon" aria-hidden="true">🔧</span>
                <div className="settings-action-btn__info">
                  <span className="settings-action-btn__label">Debug Panel</span>
                  <span className="settings-action-btn__description">
                    View node status, peers, and diagnostic info
                  </span>
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </section>

        {/* About */}
        <section className="settings-section">
          <h2 className="settings-section__title">About</h2>

          <div className="settings-about">
            <div className="settings-about__logo" aria-hidden="true">🌊</div>
            <h3 className="settings-about__name">Swimchain Feed</h3>
            <p className="settings-about__version">Version 0.1.0</p>
            <p className="settings-about__description">
              A decentralized social feed powered by the Swimchain network.
            </p>
            <div className="settings-about__links">
              <a href="https://swimchain.io" target="_blank" rel="noopener noreferrer">
                Website
              </a>
              <a href="https://docs.swimchain.io" target="_blank" rel="noopener noreferrer">
                Documentation
              </a>
              <a href="https://github.com/swimchain" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Blocklist Modal */}
      {showBlocklist && (
        <div className="settings-modal-overlay" onClick={() => setShowBlocklist(false)}>
          <div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="blocklist-title"
          >
            <div className="settings-modal__header">
              <h3 id="blocklist-title">Blocklist Manager</h3>
              <button
                type="button"
                className="settings-modal__close"
                onClick={() => setShowBlocklist(false)}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <BlocklistManager />
          </div>
        </div>
      )}

      {/* Debug Panel */}
      <DebugPanel isOpen={showDebugPanel} onClose={() => setShowDebugPanel(false)} />
    </div>
  );
}

export default Settings;
