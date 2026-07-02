import { useState, useCallback } from 'react';
import { useDm } from '../hooks/useDm';
import { truncateAddress } from '../lib/dm';
import './DmPanel.css';

interface DmPanelProps {
  onSelectDm: (spaceId: string, otherPk: string) => void;
  onStartDm: () => void;
}

export function DmPanel({ onSelectDm, onStartDm }: DmPanelProps): JSX.Element {
  const { pendingReceived, activeDms, pendingSent, totalUnread, acceptRequest, declineRequest, markRead } = useDm();
  const [collapsed, setCollapsed] = useState(false);

  const handleSelect = useCallback((entry: typeof activeDms[number]) => {
    markRead(entry.spaceId);
    onSelectDm(entry.spaceId, entry.otherPk);
  }, [markRead, onSelectDm]);

  return (
    <div className="dm-panel">
      <div className="dm-panel-header" onClick={() => setCollapsed(!collapsed)} role="button" tabIndex={0}>
        <span className="dm-panel-title">
          Direct Messages
          {totalUnread > 0 && <span className="dm-unread-badge">{totalUnread}</span>}
        </span>
        <span className={`dm-collapse-icon ${collapsed ? 'collapsed' : ''}`}>▼</span>
      </div>
      {!collapsed && (
        <div className="dm-panel-body">
          <button className="dm-new-btn" onClick={onStartDm} type="button">+ New DM</button>
          {pendingReceived.length > 0 && (
            <div className="dm-section">
              <span className="dm-section-label">Pending Requests</span>
              {pendingReceived.map(entry => (
                <div key={entry.otherPk} className="dm-request-item">
                  <span className="dm-request-name">{truncateAddress(entry.otherPk)}</span>
                  <div className="dm-request-actions">
                    <button className="dm-accept-btn" onClick={() => acceptRequest(entry.spaceId, entry.otherPk)} type="button" title="Accept">✓</button>
                    <button className="dm-decline-btn" onClick={() => declineRequest(entry.spaceId, entry.otherPk)} type="button" title="Decline">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeDms.length > 0 && (
            <div className="dm-section">
              {activeDms.map(entry => (
                <div key={entry.otherPk} className={`dm-conversation-item ${entry.unreadCount > 0 ? 'dm-unread' : ''}`}
                  onClick={() => handleSelect(entry)} role="button" tabIndex={0}>
                  <span className="dm-conversation-name">
                    {truncateAddress(entry.otherPk)}
                    {entry.unreadCount > 0 && <span className="dm-unread-dot" />}
                  </span>
                  {entry.lastActivity && <span className="dm-conversation-time">{formatDmTime(entry.lastActivity)}</span>}
                </div>
              ))}
            </div>
          )}
          {pendingSent.length > 0 && (
            <div className="dm-section">
              <span className="dm-section-label">Sent Requests</span>
              {pendingSent.map(entry => (
                <div key={entry.otherPk} className="dm-conversation-item dm-pending-sent">
                  <span className="dm-conversation-name">{truncateAddress(entry.otherPk)}</span>
                  <span className="dm-pending-label">Pending</span>
                </div>
              ))}
            </div>
          )}
          {activeDms.length === 0 && pendingReceived.length === 0 && pendingSent.length === 0 && (
            <div className="dm-empty"><p>No DMs yet. Start one above!</p></div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDmTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}
