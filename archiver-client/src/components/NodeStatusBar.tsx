import { useRpc } from '../hooks/useRpc';
import './NodeStatusBar.css';

export function NodeStatusBar(): JSX.Element {
  const { connected, connecting, error, nodeInfo } = useRpc();

  const getStatusInfo = () => {
    if (connecting) return { color: 'var(--color-text-tertiary)', label: 'Connecting...' };
    if (error || !connected) return { color: 'var(--color-error)', label: 'Disconnected' };
    return { color: 'var(--color-success)', label: 'Connected' };
  };

  const info = getStatusInfo();

  return (
    <div className="node-status-bar" role="status" aria-live="polite">
      <div className="node-status-bar__left">
        <span className="node-status-bar__dot" style={{ backgroundColor: info.color }} />
        <span className="node-status-bar__label">{info.label}</span>
      </div>
      {nodeInfo && (
        <div className="node-status-bar__right">
          <span className="node-status-bar__item">
            <span className="node-status-bar__key">Network</span>
            <span className="node-status-bar__value">{nodeInfo.network}</span>
          </span>
          <span className="node-status-bar__item">
            <span className="node-status-bar__key">Peers</span>
            <span className="node-status-bar__value">{nodeInfo.peerCount}</span>
          </span>
          <span className="node-status-bar__item">
            <span className="node-status-bar__key">Version</span>
            <span className="node-status-bar__value">{nodeInfo.version}</span>
          </span>
        </div>
      )}
    </div>
  );
}
