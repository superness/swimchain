/**
 * Matrix Configuration Page
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBridgeEngine } from '../services/BridgeEngine';
import type { MatrixConfig } from '../types';
import './ConfigPage.css';

export function MatrixConfig(): JSX.Element {
  const engine = getBridgeEngine();
  const [config, setConfig] = useState<MatrixConfig>(engine.getConfig().matrix);
  const [saved, setSaved] = useState(false);
  const [roomInput, setRoomInput] = useState('');

  useEffect(() => {
    setConfig(engine.getConfig().matrix);
  }, []);

  const handleSave = () => {
    engine.updateConfig({ matrix: config });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddRoom = () => {
    if (roomInput.trim() && !config.roomIds.includes(roomInput.trim())) {
      setConfig((c) => ({
        ...c,
        roomIds: [...c.roomIds, roomInput.trim()],
      }));
      setRoomInput('');
    }
  };

  const handleRemoveRoom = (room: string) => {
    setConfig((c) => ({
      ...c,
      roomIds: c.roomIds.filter((r) => r !== room),
    }));
  };

  return (
    <div className="config-page">
      <header className="config-header">
        <div className="header-title">
          <Link to="/dashboard" className="back-link">\u2190 Back</Link>
          <h1>Matrix Configuration</h1>
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
            <h2>Connection</h2>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
                />
                Enable Matrix bridging
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="homeserver">Homeserver URL</label>
              <input
                id="homeserver"
                type="url"
                placeholder="https://matrix.org"
                value={config.homeserverUrl}
                onChange={(e) => setConfig((c) => ({ ...c, homeserverUrl: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="userId">User ID</label>
              <input
                id="userId"
                type="text"
                placeholder="@user:matrix.org"
                value={config.userId}
                onChange={(e) => setConfig((c) => ({ ...c, userId: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="accessToken">
                Access Token
                <span className="help-text">
                  Get this from Element: Settings &rarr; Help & About &rarr; Advanced &rarr; Access Token
                </span>
              </label>
              <input
                id="accessToken"
                type="password"
                placeholder="syt_..."
                value={config.accessToken}
                onChange={(e) => setConfig((c) => ({ ...c, accessToken: e.target.value }))}
              />
            </div>
          </section>

          <section className="config-section">
            <h2>Rooms to Bridge</h2>
            <p className="section-description">
              Add Matrix room IDs to bridge messages from.
            </p>

            <div className="item-list">
              {config.roomIds.length === 0 ? (
                <p className="empty-items">No rooms configured.</p>
              ) : (
                config.roomIds.map((room) => (
                  <div key={room} className="item-tag">
                    <span>{room}</span>
                    <button
                      type="button"
                      className="remove-item"
                      onClick={() => handleRemoveRoom(room)}
                      aria-label={`Remove room ${room}`}
                    >
                      \u00D7
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-item-group">
              <input
                type="text"
                placeholder="!room:matrix.org"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRoom())}
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddRoom}>
                Add Room
              </button>
            </div>
          </section>

          <div className="config-actions">
            <button type="submit" className="btn btn-primary">
              {saved ? '\u2713 Saved' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
