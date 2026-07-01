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

export function DebugPanel(): JSX.Element {
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
    fetchDebugInfo();

    if (autoRefresh) {
      const interval = setInterval(fetchDebugInfo, 5000);
      return () => clearInterval(interval);
    }
  }, [fetchDebugInfo, autoRefresh]);

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

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>Node Debug Info</h3>
        <div className="debug-controls">
          <label className="auto-refresh-toggle">
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
        </div>
      </div>

      {error && (
        <div className="debug-error">{error}</div>
      )}

      <div className="debug-grid">
        {/* Connection Status */}
        <div className="debug-item">
          <span className="debug-label">RPC Connected</span>
          <span className={`debug-value ${connected ? 'status-ok' : 'status-error'}`}>
            {connected ? 'Yes' : 'No'}
          </span>
        </div>

        {/* Sync State */}
        <div className="debug-item">
          <span className="debug-label">Sync State</span>
          <span
            className="debug-value"
            style={{ color: getStateColor(status?.state ?? 'offline') }}
          >
            {status?.state ?? 'offline'}
          </span>
        </div>

        {/* Chain Height */}
        <div className="debug-item">
          <span className="debug-label">Chain Height</span>
          <span className="debug-value">{status?.chainHeight ?? 0}</span>
        </div>

        {/* Peer Count */}
        <div className="debug-item">
          <span className="debug-label">Peer Count</span>
          <span className={`debug-value ${(status?.peerCount ?? 0) === 0 ? 'status-error' : 'status-ok'}`}>
            {status?.peerCount ?? 0}
          </span>
        </div>

        {/* Storage */}
        <div className="debug-item">
          <span className="debug-label">Storage Used</span>
          <span className="debug-value">{status?.storageMB?.toFixed(1) ?? 0} MB</span>
        </div>

        {/* Last Block */}
        <div className="debug-item">
          <span className="debug-label">Last Block</span>
          <span className="debug-value">{formatTime(status?.lastBlockTime ?? 0)}</span>
        </div>

        {/* Node ID */}
        <div className="debug-item full-width">
          <span className="debug-label">Node ID</span>
          <span className="debug-value mono">{formatPeerId(status?.nodeId ?? 'unknown')}</span>
        </div>

        {/* Version */}
        <div className="debug-item">
          <span className="debug-label">Node Version</span>
          <span className="debug-value">{status?.version ?? 'unknown'}</span>
        </div>
      </div>

      {/* Peer List Toggle */}
      <div className="debug-section">
        <button
          type="button"
          className="debug-section-toggle"
          onClick={() => setShowPeers(!showPeers)}
          aria-expanded={showPeers}
          aria-controls="peer-list-content"
        >
          <span aria-hidden="true">{showPeers ? '▼' : '▶'}</span>
          Connected Peers ({peers.length})
        </button>

        {showPeers && (
          <div id="peer-list-content" className="peer-list">
            {peers.length === 0 ? (
              <div className="no-peers">
                No peers connected. Check your network connection and firewall settings.
                <br />
                <small>Seeds: seeds.swimchain.io:19735 (testnet)</small>
              </div>
            ) : (
              <table className="peer-table">
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
                      <td className="mono">{formatPeerId(peer.peer_id)}</td>
                      <td className="mono">{peer.address}</td>
                      <td>{peer.direction}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Logs Toggle (placeholder for future) */}
      <div className="debug-section">
        <button
          type="button"
          className="debug-section-toggle"
          onClick={() => setShowLogs(!showLogs)}
          aria-expanded={showLogs}
          aria-controls="logs-content"
        >
          <span aria-hidden="true">{showLogs ? '▼' : '▶'}</span>
          Node Logs
        </button>

        {showLogs && (
          <div id="logs-content" className="log-viewer">
            <div className="log-placeholder">
              Node logs are written to the data directory.
              <br />
              <code>~/.swimchain/testnet/node.log</code>
            </div>
          </div>
        )}
      </div>

      {/* Network Tips */}
      {(status?.peerCount ?? 0) === 0 && connected && (
        <div className="debug-tips">
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
  );
}
