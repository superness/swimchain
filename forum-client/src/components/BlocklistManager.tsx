/**
 * Blocklist Manager - View and manage blocked users, posts, spaces, and replies
 */

import { useState } from 'react';
import { useBlocklist, BlockType } from '../hooks/useBlocklist';
import { truncateAddress } from './AddressDisplay';
import './BlocklistManager.css';

type TabType = 'users' | 'posts' | 'spaces' | 'replies';

export function BlocklistManager(): JSX.Element {
  const { blocklist, unblock, clearAll } = useBlocklist();
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [showConfirm, setShowConfirm] = useState(false);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'users', label: 'Users', count: blocklist.users.length },
    { key: 'posts', label: 'Posts', count: blocklist.posts.length },
    { key: 'spaces', label: 'Spaces', count: blocklist.spaces.length },
    { key: 'replies', label: 'Replies', count: blocklist.replies.length },
  ];

  const totalBlocked = blocklist.users.length + blocklist.posts.length +
    blocklist.spaces.length + blocklist.replies.length;

  const activeItems = blocklist[activeTab];
  const blockType: BlockType = activeTab === 'users' ? 'user' :
    activeTab === 'posts' ? 'post' :
    activeTab === 'spaces' ? 'space' : 'reply';

  const formatId = (id: string, type: BlockType): string => {
    if (type === 'user') {
      return truncateAddress(id);
    }
    if (id.startsWith('sha256:')) {
      return `${id.slice(0, 15)}...${id.slice(-8)}`;
    }
    if (id.startsWith('sp1')) {
      return `${id.slice(0, 8)}...${id.slice(-6)}`;
    }
    return id.length > 20 ? `${id.slice(0, 10)}...${id.slice(-8)}` : id;
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
          {/* Shield with checkmark icon - indicates protected/clean state */}
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <p>You haven't blocked anything yet.</p>
          <p className="blocklist-hint">
            Use the block button on posts or users to hide content you don't want to see.
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
                onClick={() => setShowConfirm(true)}
              >
                Clear All Blocks
              </button>
            </div>
          )}
        </>
      )}
      {showConfirm && (
        <div className="blocklist-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="blocklist-confirm-dialog" onClick={e => e.stopPropagation()}>
            <p>Are you sure you want to unblock all content?</p>
            <div className="blocklist-confirm-actions">
              <button
                className="blocklist-confirm-yes"
                onClick={() => { clearAll(); setShowConfirm(false); }}
              >
                Yes, Unblock All
              </button>
              <button
                className="blocklist-confirm-cancel"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
