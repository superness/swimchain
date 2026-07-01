/**
 * Blocklist Manager - View and manage blocked users, messages, channels, and servers
 */

import { useState } from 'react';
import { useBlocklist, BlockType } from '../hooks/useBlocklist';
import { truncateUserId } from '../lib/avatar';
import './BlocklistManager.css';

type TabType = 'users' | 'messages' | 'channels' | 'servers';

export function BlocklistManager(): JSX.Element {
  const { blocklist, unblock, clearAll } = useBlocklist();
  const [activeTab, setActiveTab] = useState<TabType>('users');

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'users', label: 'Users', count: blocklist.users.length },
    { key: 'messages', label: 'Messages', count: blocklist.messages.length },
    { key: 'channels', label: 'Channels', count: blocklist.channels.length },
    { key: 'servers', label: 'Servers', count: blocklist.servers.length },
  ];

  const totalBlocked = blocklist.users.length + blocklist.messages.length +
    blocklist.channels.length + blocklist.servers.length;

  const activeItems = blocklist[activeTab];
  const blockType: BlockType = activeTab === 'users' ? 'user' :
    activeTab === 'messages' ? 'message' :
    activeTab === 'channels' ? 'channel' : 'server';

  const formatId = (id: string, type: BlockType): string => {
    if (type === 'user') {
      return truncateUserId(id);
    }
    if (id.startsWith('sha256:')) {
      return `${id.slice(0, 15)}...${id.slice(-8)}`;
    }
    if (id.length > 20) {
      return `${id.slice(0, 10)}...${id.slice(-8)}`;
    }
    return id;
  };

  return (
    <div className="blocklist-manager">
      <div className="blocklist-header">
        <h3>Blocked Content</h3>
        <p className="blocklist-description">
          Content you've blocked is hidden from your view. It still exists on the network.
        </p>
      </div>

      {totalBlocked === 0 ? (
        <div className="blocklist-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
          </svg>
          <p>You haven't blocked anything yet.</p>
          <p className="blocklist-hint">
            Use the block button on messages or users to hide content you don't want to see.
          </p>
        </div>
      ) : (
        <>
          <div className="blocklist-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                className={`blocklist-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="blocklist-tab-count">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="blocklist-content">
            {activeItems.length === 0 ? (
              <p className="blocklist-empty-tab">No blocked {activeTab}.</p>
            ) : (
              <ul className="blocklist-items">
                {activeItems.map(item => (
                  <li key={item.id} className="blocklist-item">
                    <div className="blocklist-item-info">
                      <span className="blocklist-item-id" title={item.id}>
                        {formatId(item.id, blockType)}
                      </span>
                      <span className="blocklist-item-date">
                        Blocked {new Date(item.blockedAt).toLocaleDateString()}
                      </span>
                      {item.reason && (
                        <span className="blocklist-item-reason">{item.reason}</span>
                      )}
                    </div>
                    <button
                      className="blocklist-unblock-btn"
                      onClick={() => unblock(item.id, blockType)}
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {totalBlocked > 0 && (
            <div className="blocklist-footer">
              <button
                className="blocklist-clear-btn"
                onClick={() => {
                  if (confirm('Are you sure you want to unblock all content?')) {
                    clearAll();
                  }
                }}
              >
                Clear All Blocks
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
