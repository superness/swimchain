/**
 * Settings page for chat preferences
 */

import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { ChatPreferences } from '../types';
import { DEFAULT_CHAT_PREFERENCES } from '../types';
import { BlocklistManager } from '../components/BlocklistManager';
import { DebugPanel } from '../components/DebugPanel';
import { useRpc } from '../hooks/useRpc';
import './SettingsPage.css';

const STORAGE_KEY = 'swimchain-chat-preferences';

export function SettingsPage(): JSX.Element {
  const [preferences, setPreferences] = useState<ChatPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_CHAT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_CHAT_PREFERENCES;
  });

  const [saved, setSaved] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Display name management
  const { rpc, connected } = useRpc();
  const [displayName, setDisplayName] = useState('');
  const [displayNameLoading, setDisplayNameLoading] = useState(false);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameStatus, setDisplayNameStatus] = useState<string | null>(null);

  // Fetch current display name on mount
  useEffect(() => {
    if (!rpc || !connected) return;
    setDisplayNameLoading(true);
    rpc.call('get_identity_name', {})
      .then((result: unknown) => {
        const r = result as { identity_name?: string | null };
        setDisplayName(r.identity_name ?? '');
      })
      .catch(() => { /* RPC may not be available */ })
      .finally(() => setDisplayNameLoading(false));
  }, [rpc, connected]);

  const handleSaveDisplayName = useCallback(async () => {
    if (!rpc || !connected) return;
    setDisplayNameSaving(true);
    setDisplayNameStatus(null);
    try {
      const result = await rpc.call('set_identity_name', {
        name: displayName.trim() || null,
      }) as { success?: boolean };
      if (result.success) {
        setDisplayNameStatus('Display name saved');
        setTimeout(() => setDisplayNameStatus(null), 2000);
      } else {
        setDisplayNameStatus('Failed to save');
      }
    } catch {
      setDisplayNameStatus('Failed to save');
    } finally {
      setDisplayNameSaving(false);
    }
  }, [rpc, connected, displayName]);

  // Save preferences when they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    setSaved(true);
    const timeout = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(timeout);
  }, [preferences]);

  const handleToggle = useCallback(
    (key: keyof ChatPreferences) => {
      setPreferences((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    []
  );

  return (
    <div className="settings-page">
      <header className="settings-page__header">
        <Link to="/channels/@me" className="settings-page__back">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back to Chat
        </Link>
        <h1 className="settings-page__title">Settings</h1>
        {saved && (
          <span className="settings-page__saved">Settings saved</span>
        )}
      </header>

      <div className="settings-page__content">
        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Display Name</h2>
          <p className="settings-page__option-desc" style={{ marginBottom: '12px' }}>
            Set a display name that appears alongside your messages
          </p>
          <div className="settings-page__display-name-row">
            <input
              type="text"
              className="settings-page__display-name-input"
              placeholder={displayNameLoading ? 'Loading...' : 'Enter display name'}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              disabled={displayNameLoading || displayNameSaving}
            />
            <button
              type="button"
              className="settings-page__display-name-save"
              onClick={handleSaveDisplayName}
              disabled={displayNameLoading || displayNameSaving}
            >
              {displayNameSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {displayNameStatus && (
            <p className="settings-page__display-name-status">{displayNameStatus}</p>
          )}
        </section>

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Chat Preferences</h2>

          <div className="settings-page__option">
            <div className="settings-page__option-info">
              <label
                htmlFor="showTyping"
                className="settings-page__option-label"
              >
                Show Typing Indicators
              </label>
              <p className="settings-page__option-desc">
                See when others are typing in the chat
              </p>
            </div>
            <button
              id="showTyping"
              role="switch"
              aria-checked={preferences.showTypingIndicators}
              className={`settings-page__toggle ${
                preferences.showTypingIndicators ? 'settings-page__toggle--on' : ''
              }`}
              onClick={() => handleToggle('showTypingIndicators')}
            >
              <span className="settings-page__toggle-knob" />
            </button>
          </div>

          <div className="settings-page__option">
            <div className="settings-page__option-info">
              <label
                htmlFor="showPresence"
                className="settings-page__option-label"
              >
                Show Presence Indicators
              </label>
              <p className="settings-page__option-desc">
                Display online/away/offline status of users
              </p>
            </div>
            <button
              id="showPresence"
              role="switch"
              aria-checked={preferences.showPresence}
              className={`settings-page__toggle ${
                preferences.showPresence ? 'settings-page__toggle--on' : ''
              }`}
              onClick={() => handleToggle('showPresence')}
            >
              <span className="settings-page__toggle-knob" />
            </button>
          </div>

          <div className="settings-page__option">
            <div className="settings-page__option-info">
              <label
                htmlFor="sounds"
                className="settings-page__option-label"
              >
                Notification Sounds
              </label>
              <p className="settings-page__option-desc">
                Play sounds for new messages
              </p>
            </div>
            <button
              id="sounds"
              role="switch"
              aria-checked={preferences.notificationSounds}
              className={`settings-page__toggle ${
                preferences.notificationSounds ? 'settings-page__toggle--on' : ''
              }`}
              onClick={() => handleToggle('notificationSounds')}
            >
              <span className="settings-page__toggle-knob" />
            </button>
          </div>
        </section>

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Blocked Content</h2>
          <p className="settings-page__option-desc" style={{ marginBottom: '16px' }}>
            Manage users, messages, and channels you've blocked
          </p>
          <BlocklistManager />
        </section>

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">Developer</h2>
          <p className="settings-page__option-desc" style={{ marginBottom: '16px' }}>
            Advanced tools for debugging and diagnostics
          </p>
          <button
            type="button"
            className="settings-page__debug-btn"
            onClick={() => setShowDebug(true)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <path d="M12 6v6l4 2" />
            </svg>
            Open Debug Panel
          </button>
        </section>

        <section className="settings-page__section">
          <h2 className="settings-page__section-title">About</h2>
          <p className="settings-page__about-text">
            Swimchain Chat Client v0.1.0
          </p>
          <p className="settings-page__about-text">
            A Discord-like real-time chat experience powered by proof-of-work
          </p>
        </section>
      </div>

      {/* Debug Panel Modal */}
      <DebugPanel isOpen={showDebug} onClose={() => setShowDebug(false)} />
    </div>
  );
}
