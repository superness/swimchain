/**
 * Status bar showing sync status, peers, and storage
 */

import './StatusBar.css';

interface StatusBarProps {
  chainPercent: number;
  peerCount: number;
  storageMB: number;
  state: 'synced' | 'syncing' | 'behind' | 'offline';
}

export function StatusBar({
  chainPercent,
  peerCount,
  storageMB,
  state,
}: StatusBarProps): JSX.Element {
  const getStateIndicator = () => {
    switch (state) {
      case 'synced':
        return { color: 'var(--color-accent-success)', text: 'Synced' };
      case 'syncing':
        return { color: 'var(--color-accent-warning)', text: `Syncing ${chainPercent}%` };
      case 'behind':
        return { color: 'var(--color-accent-warning)', text: 'Behind' };
      case 'offline':
        return { color: 'var(--color-accent-error)', text: 'Offline' };
    }
  };

  const indicator = getStateIndicator();

  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <div className="status-bar__left">
        <span
          className="status-bar__indicator"
          style={{ background: indicator.color }}
          aria-hidden="true"
        />
        <span className="status-bar__text">{indicator.text}</span>
      </div>

      <div className="status-bar__center">
        <span className="status-bar__item">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {peerCount} peers
        </span>
      </div>

      <div className="status-bar__right">
        <span className="status-bar__item">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          {storageMB.toFixed(1)} MB
        </span>
      </div>
    </footer>
  );
}
