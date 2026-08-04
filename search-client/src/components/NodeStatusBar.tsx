/**
 * Node status bar showing sync state, peer count, and storage usage
 */

import { useNetworkStatus } from '../hooks/useRpc';
import './NodeStatusBar.css';

export function NodeStatusBar(): JSX.Element {
  const { status, loading, error } = useNetworkStatus();

  const getStatusInfo = () => {
    if (loading) return { color: 'var(--color-text-tertiary)', label: 'Connecting...' };
    if (error || !status) return { color: 'var(--color-error)', label: 'Disconnected' };
    switch (status.state) {
      case 'synced': return { color: 'var(--color-success)', label: 'Synced' };
      case 'syncing': return { color: 'var(--color-warning)', label: 'Syncing' };
      case 'behind': return { color: 'var(--color-warning)', label: 'Behind' };
      default: return { color: 'var(--color-error)', label: 'Offline' };
    }
  };

  const info = getStatusInfo();

  // A node still catching its index up serves incomplete results. Left unsaid,
  // a short result list reads as "nothing matched" — so say it plainly. The
  // scan counts as catching up: it can run for minutes and the index may be
  // behind for all of it.
  const phase = status?.searchIndex?.phase ?? 'idle';
  const catchingUp = phase !== 'idle';
  const reindexTarget = status?.searchIndex?.target ?? 0;

  return (
    <div className="node-status-bar" role="status" aria-live="polite">
      <div className="node-status-bar__left">
        <span className="node-status-bar__dot" style={{ backgroundColor: info.color }} />
        <span className="node-status-bar__label">{info.label}</span>
        {catchingUp && (
          <span
            className="node-status-bar__reindex"
            title="The node's search index is still catching up with the chain. Results are incomplete until it finishes."
          >
            {phase === 'scanning' ? 'Checking search index' : 'Building search index'}
            {reindexTarget > 0 ? ` (${reindexTarget.toLocaleString()} items)` : ''}
            {' — results may be incomplete'}
          </span>
        )}
      </div>
      {status && (
        <div className="node-status-bar__right">
          <span className="node-status-bar__item">
            <span className="node-status-bar__key">Sync</span>
            <span className="node-status-bar__value">{Math.round(status.chainPercent)}%</span>
          </span>
          <span className="node-status-bar__item">
            <span className="node-status-bar__key">Peers</span>
            <span className="node-status-bar__value">{status.peerCount}</span>
          </span>
          <span className="node-status-bar__item">
            <span className="node-status-bar__key">Storage</span>
            <span className="node-status-bar__value">{status.storageMB.toFixed(1)} MB</span>
          </span>
        </div>
      )}
    </div>
  );
}
