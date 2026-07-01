/**
 * Status bar showing sync status, peer count, and storage
 */

import { useSyncStatus } from '../hooks/useSyncStatus';
import './StatusBar.css';

export function StatusBar(): JSX.Element {
  const { syncStatus } = useSyncStatus();

  const getStateIcon = (state: typeof syncStatus.state) => {
    switch (state) {
      case 'synced':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case 'syncing':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="spin">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        );
      case 'behind':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'offline':
        return (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        );
    }
  };

  const getStateLabel = (state: typeof syncStatus.state) => {
    switch (state) {
      case 'synced': return 'Synced';
      case 'syncing': return `Syncing ${syncStatus.chainPercent}%`;
      case 'behind': return 'Behind';
      case 'offline': return 'Offline';
    }
  };

  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <div className="status-bar-content">
        <span
          className={`sync-status sync-${syncStatus.state}`}
          aria-label={`Sync status: ${getStateLabel(syncStatus.state)}`}
        >
          {getStateIcon(syncStatus.state)}
          <span className="sync-label">{getStateLabel(syncStatus.state)}</span>
        </span>

        <span className="status-divider" aria-hidden="true" />

        <span className="peer-status" aria-label={`${syncStatus.peerCount} peers connected`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>{syncStatus.peerCount} peers</span>
        </span>

        <span className="status-divider" aria-hidden="true" />

        <span className="storage-status" aria-label={`Storage: ${syncStatus.storageMB} of ${syncStatus.storageTargetMB} MB`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span>{syncStatus.storageMB}/{syncStatus.storageTargetMB} MB</span>
        </span>

        <span className="status-spacer" />

        <button
          type="button"
          className="shortcuts-hint"
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}
          aria-label="Show keyboard shortcuts (press ?)"
        >
          <kbd>?</kbd> Shortcuts
        </button>
      </div>
    </footer>
  );
}
