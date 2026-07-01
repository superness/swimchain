/**
 * Debug Panel - Shows node status, peers, and diagnostic info
 */

import { useState, useEffect, useCallback } from 'react';
import { useRpc } from '../hooks/useRpc';
import './DebugPanel.css';

interface PeerInfo {
  peer_id: string;
  address: string;
  direction: string;
}

interface NodeStatus {
  connected: boolean;
  chainHeight: number;
  peerCount: number;
  state: string;
  storageMB: number;
  lastBlockTime: number;
  nodeId: string;
  version: string;
}

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DebugPanel({ isOpen, onClose }: DebugPanelProps): JSX.Element | null {
  const { rpc, connected } = useRpc();
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPeers, setShowPeers] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDebugInfo = useCallback(async () => {
    if (!rpc) {
      setStatus(null);
      setPeers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch node info and sync status in parallel
      const [info, syncStatus, peerList] = await Promise.all([
        rpc.getInfo().catch(() => null),
        rpc.getSyncStatus().catch(() => null),
        rpc.getPeers().catch(() => []),
      ]);

      setStatus({
        connected,
        chainHeight: info?.block_height ?? 0,
        peerCount: syncStatus?.peer_count ?? 0,
        state: syncStatus?.state ?? 'unknown',
        storageMB: syncStatus?.storage_mb ?? 0,
        lastBlockTime: syncStatus?.last_block_time ?? 0,
        nodeId: info?.node_id ?? 'unknown',
        version: info?.version ?? 'unknown',
      });

      setPeers(peerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch debug info');
    } finally {
      setLoading(false);
    }
  }, [rpc, connected]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    if (!isOpen) return;

    fetchDebugInfo();

    if (autoRefresh) {
      const interval = setInterval(fetchDebugInfo, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchDebugInfo, autoRefresh, isOpen]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const formatTime = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const formatPeerId = (id: string): string => {
    if (id.length > 16) {
      return `${id.slice(0, 8)}...${id.slice(-8)}`;
    }
    return id;
  };

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'synced': return 'var(--color-success)';
      case 'syncing': return 'var(--color-warning)';
      case 'behind': return 'var(--color-warning)';
      default: return 'var(--color-error)';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="debug-panel__overlay" onClick={onClose}>
      <div
        className="debug-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debug-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="debug-panel__header">
          <h3 id="debug-panel-title">Node Debug Info</h3>
          <div className="debug-panel__controls">
            <label className="debug-panel__auto-refresh">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={fetchDebugInfo}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              className="debug-panel__close"
              onClick={onClose}
              aria-label="Close debug panel"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="debug-panel__error" role="alert">{error}</div>
        )}

        <div className="debug-panel__grid">
          {/* Connection Status */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">RPC Connected</span>
            <span className={`debug-panel__value ${connected ? 'debug-panel__value--ok' : 'debug-panel__value--error'}`}>
              {connected ? 'Yes' : 'No'}
            </span>
          </div>

          {/* Sync State */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">Sync State</span>
            <span
              className="debug-panel__value"
              style={{ color: getStateColor(status?.state ?? 'offline') }}
            >
              {status?.state ?? 'offline'}
            </span>
          </div>

          {/* Chain Height */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">Chain Height</span>
            <span className="debug-panel__value">{status?.chainHeight?.toLocaleString() ?? 0}</span>
          </div>

          {/* Peer Count */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">Peer Count</span>
            <span className={`debug-panel__value ${(status?.peerCount ?? 0) === 0 ? 'debug-panel__value--error' : 'debug-panel__value--ok'}`}>
              {status?.peerCount ?? 0}
            </span>
          </div>

          {/* Storage */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">Storage Used</span>
            <span className="debug-panel__value">{status?.storageMB?.toFixed(1) ?? 0} MB</span>
          </div>

          {/* Last Block */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">Last Block</span>
            <span className="debug-panel__value">{formatTime(status?.lastBlockTime ?? 0)}</span>
          </div>

          {/* Node ID */}
          <div className="debug-panel__item debug-panel__item--full">
            <span className="debug-panel__label">Node ID</span>
            <span className="debug-panel__value debug-panel__value--mono">{formatPeerId(status?.nodeId ?? 'unknown')}</span>
          </div>

          {/* Version */}
          <div className="debug-panel__item">
            <span className="debug-panel__label">Node Version</span>
            <span className="debug-panel__value">{status?.version ?? 'unknown'}</span>
          </div>
        </div>

        {/* Peer List Toggle */}
        <div className="debug-panel__section">
          <button
            type="button"
            className="debug-panel__section-toggle"
            onClick={() => setShowPeers(!showPeers)}
            aria-expanded={showPeers}
            aria-controls="peer-list-content"
          >
            <span aria-hidden="true">{showPeers ? '▼' : '▶'}</span>
            Connected Peers ({peers.length})
          </button>

          {showPeers && (
            <div id="peer-list-content" className="debug-panel__peer-list">
              {peers.length === 0 ? (
                <div className="debug-panel__no-peers">
                  No peers connected. Check your network connection and firewall settings.
                  <br />
                  <small>Seeds: seeds.swimchain.io:19735 (testnet)</small>
                </div>
              ) : (
                <table className="debug-panel__peer-table">
                  <thead>
                    <tr>
                      <th scope="col">Peer ID</th>
                      <th scope="col">Address</th>
                      <th scope="col">Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peers.map((peer) => (
                      <tr key={peer.peer_id}>
                        <td className="debug-panel__value--mono">{formatPeerId(peer.peer_id)}</td>
                        <td className="debug-panel__value--mono">{peer.address}</td>
                        <td>{peer.direction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Logs Toggle */}
        <div className="debug-panel__section">
          <button
            type="button"
            className="debug-panel__section-toggle"
            onClick={() => setShowLogs(!showLogs)}
            aria-expanded={showLogs}
            aria-controls="logs-content"
          >
            <span aria-hidden="true">{showLogs ? '▼' : '▶'}</span>
            Node Logs
          </button>

          {showLogs && (
            <div id="logs-content" className="debug-panel__log-viewer">
              <div className="debug-panel__log-placeholder">
                Node logs are written to the data directory.
                <br />
                <code>~/.swimchain/testnet/node.log</code>
              </div>
            </div>
          )}
        </div>

        {/* Network Tips */}
        {(status?.peerCount ?? 0) === 0 && connected && (
          <div className="debug-panel__tips">
            <h4>Connection Troubleshooting</h4>
            <ul>
              <li>Ensure port 19735 (testnet) is open in your firewall</li>
              <li>Check if your router allows outbound connections</li>
              <li>Try restarting the node</li>
              <li>Verify seed nodes are reachable: <code>seeds.swimchain.io</code></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default DebugPanel;
