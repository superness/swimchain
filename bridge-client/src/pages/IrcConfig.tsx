/**
 * IRC Configuration Page
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getBridgeEngine } from '../services/BridgeEngine';
import type { IrcConfig } from '../types';
import './ConfigPage.css';

export function IrcConfig(): JSX.Element {
  const engine = getBridgeEngine();
  const [config, setConfig] = useState<IrcConfig>(engine.getConfig().irc);
  const [saved, setSaved] = useState(false);
  const [channelInput, setChannelInput] = useState('');

  useEffect(() => {
    setConfig(engine.getConfig().irc);
  }, []);

  const handleSave = () => {
    engine.updateConfig({ irc: config });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddChannel = () => {
    let channel = channelInput.trim();
    if (channel && !channel.startsWith('#')) {
      channel = '#' + channel;
    }
    if (channel && !config.channels.includes(channel)) {
      setConfig((c) => ({
        ...c,
        channels: [...c.channels, channel],
      }));
      setChannelInput('');
    }
  };

  const handleRemoveChannel = (channel: string) => {
    setConfig((c) => ({
      ...c,
      channels: c.channels.filter((ch) => ch !== channel),
    }));
  };

  return (
    <div className="config-page">
      <header className="config-header">
        <div className="header-title">
          <Link to="/dashboard" className="back-link">\u2190 Back</Link>
          <h1>IRC Configuration</h1>
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
                Enable IRC bridging
              </label>
            </div>

            <div className="form-group">
              <label htmlFor="server">Server</label>
              <input
                id="server"
                type="text"
                placeholder="irc.libera.chat"
                value={config.server}
                onChange={(e) => setConfig((c) => ({ ...c, server: e.target.value }))}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="port">Port</label>
                <input
                  id="port"
                  type="number"
                  min="1"
                  max="65535"
                  value={config.port}
                  onChange={(e) => setConfig((c) => ({ ...c, port: parseInt(e.target.value) }))}
                />
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={config.tls}
                    onChange={(e) => setConfig((c) => ({ ...c, tls: e.target.checked }))}
                  />
                  Use TLS
                </label>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="nickname">Nickname</label>
              <input
                id="nickname"
                type="text"
                placeholder="swimchain-bridge"
                value={config.nickname}
                onChange={(e) => setConfig((c) => ({ ...c, nickname: e.target.value }))}
              />
            </div>

            <div className="form-group">
              <label htmlFor="proxyUrl">
                WebSocket Proxy URL
                <span className="help-text">
                  IRC requires a WebSocket-to-IRC proxy. See docs for setup.
                </span>
              </label>
              <input
                id="proxyUrl"
                type="url"
                placeholder="ws://localhost:8080"
                value={config.proxyUrl}
                onChange={(e) => setConfig((c) => ({ ...c, proxyUrl: e.target.value }))}
              />
            </div>
          </section>

          <section className="config-section">
            <h2>Channels to Bridge</h2>
            <p className="section-description">
              Add IRC channels to bridge messages from.
            </p>

            <div className="item-list">
              {config.channels.length === 0 ? (
                <p className="empty-items">No channels configured.</p>
              ) : (
                config.channels.map((channel) => (
                  <div key={channel} className="item-tag">
                    <span>{channel}</span>
                    <button
                      type="button"
                      className="remove-item"
                      onClick={() => handleRemoveChannel(channel)}
                      aria-label={`Remove channel ${channel}`}
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
                placeholder="#channel"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChannel())}
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddChannel}>
                Add Channel
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
