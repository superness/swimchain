/**
 * Node Status Bar - Shows node status at top of app
 * Only visible when running in Tauri desktop app
 */

import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import './NodeStatusBar.css';

interface NodeStatus {
  running: boolean;
  rpc_port: number;
  peer_count: number;
  network: string;
}

interface NodeStatusBarProps {
  onSettingsClick?: () => void;
}

/**
 * Check if running inside Tauri (works with v1 and v2)
 */
export function isInTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window || '__TAURI__' in window;
}

export function NodeStatusBar({ onSettingsClick }: NodeStatusBarProps): JSX.Element | null {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [isTauriAvailable, setIsTauriAvailable] = useState<boolean | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchStatus = useCallback(async () => {
    // Check if Tauri is available
    if (!isInTauri()) {
      setIsTauriAvailable(false);
      return;
    }

    try {
      // Dynamic import for Tauri API
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<NodeStatus>('get_node_status');
      setStatus(result);
      setError(null);
      setIsTauriAvailable(true);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('not a function') || errMsg.includes('__TAURI')) {
        setIsTauriAvailable(false);
      } else {
        setError(errMsg);
        setIsTauriAvailable(true);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Close dropdown on click outside or Escape key
  useEffect(() => {
    if (!showControls) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setShowControls(false);
        setFocusedIndex(-1);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowControls(false);
        setFocusedIndex(-1);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showControls]);

  // Focus management for dropdown items
  useEffect(() => {
    if (showControls && focusedIndex >= 0 && dropdownRef.current) {
      const buttons = dropdownRef.current.querySelectorAll('button:not(:disabled)');
      (buttons[focusedIndex] as HTMLButtonElement)?.focus();
    }
  }, [showControls, focusedIndex]);

  const handleStop = async () => {
    setLoading(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('stop_node');
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      setError('Restart requires re-entering password. Please restart the app.');
    } finally {
      setLoading(false);
    }
  };

  const handleDropdownKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!dropdownRef.current) return;
    const buttons = dropdownRef.current.querySelectorAll('button:not(:disabled)');
    const count = buttons.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + count) % count);
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(count - 1);
        break;
      case 'Tab':
        setShowControls(false);
        setFocusedIndex(-1);
        break;
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setShowControls(true);
      setFocusedIndex(0);
    }
  };

  // Don't render if not in Tauri or still checking
  if (isTauriAvailable === false) {
    return null;
  }

  const getStatusIndicator = () => {
    if (isTauriAvailable === null) {
      return { color: 'var(--color-text-tertiary)', text: 'Checking...', icon: '○', ariaLabel: 'Checking node status' };
    }
    if (!status?.running) {
      return { color: 'var(--color-error)', text: 'Stopped', icon: '✕', ariaLabel: 'Node stopped' };
    }
    if (status.peer_count === 0) {
      return { color: 'var(--color-warning)', text: 'Connecting...', icon: '↻', ariaLabel: 'Node connecting to peers' };
    }
    return { color: 'var(--color-success)', text: 'Running', icon: '✓', ariaLabel: 'Node running' };
  };

  const indicator = getStatusIndicator();

  return (
    <div className="node-status-bar">
      <div className="node-status-bar__left">
        <div className="node-status-bar__indicator" role="status" aria-live="polite" aria-label={indicator.ariaLabel}>
          <span
            className="node-status-bar__dot"
            style={{ backgroundColor: indicator.color }}
            aria-hidden="true"
          >
            {indicator.icon}
          </span>
          <span className="node-status-bar__text">{indicator.text}</span>
        </div>

        {status?.running && (
          <>
            <div className="node-status-bar__item">
              <span className="node-status-bar__label">Peers</span>
              <span className={`node-status-bar__value ${status.peer_count === 0 ? 'node-status-bar__value--warning' : ''}`}>
                {status.peer_count}
              </span>
            </div>
            <div className="node-status-bar__item">
              <span className="node-status-bar__label">Network</span>
              <span className="node-status-bar__value">{status.network}</span>
            </div>
            <div className="node-status-bar__item">
              <span className="node-status-bar__label">RPC</span>
              <span className="node-status-bar__value node-status-bar__value--mono">:{status.rpc_port}</span>
            </div>
          </>
        )}
      </div>

      <div className="node-status-bar__right">
        {error && (
          <span className="node-status-bar__error" title={error} role="img" aria-label={`Warning: ${error}`}>
            ⚠
          </span>
        )}

        <button
          ref={triggerRef}
          type="button"
          className="node-status-bar__control-btn"
          onClick={() => setShowControls(!showControls)}
          onKeyDown={handleTriggerKeyDown}
          aria-haspopup="menu"
          aria-expanded={showControls}
          aria-label="Node controls"
        >
          ⚙
        </button>

        {showControls && (
          <div
            ref={dropdownRef}
            className="node-status-bar__dropdown"
            role="menu"
            aria-label="Node control options"
            onKeyDown={handleDropdownKeyDown}
          >
            {status?.running ? (
              <>
                <button role="menuitem" onClick={handleStop} disabled={loading}>
                  {loading ? 'Stopping...' : 'Stop Node'}
                </button>
                <button role="menuitem" onClick={handleRestart} disabled={loading}>
                  Restart Node
                </button>
              </>
            ) : (
              <button role="menuitem" disabled>
                Node Stopped (Restart App)
              </button>
            )}
            <hr />
            <button role="menuitem" onClick={onSettingsClick}>
              Settings
            </button>
            <button role="menuitem" onClick={() => window.open('https://docs.swimchain.io', '_blank')}>
              Documentation
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
