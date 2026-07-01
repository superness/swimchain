/**
 * Moderation Page - Analytics Client
 *
 * View and manage blocked users/spaces, and see moderation stats.
 */

import { useState } from 'react';
import { useBlocklist, BlockType } from '../hooks/useBlocklist';
import './Moderation.css';

const TABS: { id: BlockType; label: string }[] = [
  { id: 'user', label: 'Users' },
  { id: 'space', label: 'Spaces' },
  { id: 'post', label: 'Posts' },
];

function truncateAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function Moderation(): JSX.Element {
  const { getBlocked, unblock, block, clearAll, blocklist } = useBlocklist();
  const [activeTab, setActiveTab] = useState<BlockType>('user');
  const [addInput, setAddInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const items = getBlocked(activeTab);
  const totalBlocked = blocklist.users.length + blocklist.spaces.length + blocklist.posts.length + blocklist.replies.length;

  const handleAdd = () => {
    const id = addInput.trim();
    if (id) {
      block(id, activeTab);
      setAddInput('');
    }
  };

  const handleClearAll = () => {
    clearAll();
    setShowConfirm(false);
  };

  return (
    <div className="moderation-page">
      <header className="moderation-header">
        <div className="header-title">
          <h1>Moderation</h1>
          <span className="moderation-badge">{totalBlocked} blocked</span>
        </div>
      </header>

      <main className="moderation-main">
        {/* Stats Summary */}
        <section className="moderation-stats">
          <div className="stat-card">
            <span className="stat-value">{blocklist.users.length}</span>
            <span className="stat-label">Blocked Users</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{blocklist.spaces.length}</span>
            <span className="stat-label">Blocked Spaces</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{blocklist.posts.length}</span>
            <span className="stat-label">Blocked Posts</span>
          </div>
        </section>

        {/* Blocklist Manager */}
        <section className="moderation-section">
          <div className="section-head">
            <h2>Blocklist</h2>
            {totalBlocked > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowConfirm(true)}
              >
                Clear All
              </button>
            )}
          </div>

          {/* Tabs */}
          <nav className="moderation-tabs" role="tablist">
            {TABS.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={`moderation-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                <span className="tab-count">{getBlocked(tab.id).length}</span>
              </button>
            ))}
          </nav>

          {/* Add new block */}
          <div className="add-block-group">
            <input
              type="text"
              placeholder={`Enter ${activeTab} ID to block...`}
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <button className="btn btn-secondary" onClick={handleAdd} disabled={!addInput.trim()}>
              Block
            </button>
          </div>

          {/* Blocked items list */}
          {items.length === 0 ? (
            <p className="empty-blocklist">No blocked {activeTab}s.</p>
          ) : (
            <ul className="blocked-list" role="list">
              {items.map(item => (
                <li key={item.id} className="blocked-item">
                  <div className="blocked-item-info">
                    <code className="blocked-id" title={item.id}>
                      {truncateAddress(item.id)}
                    </code>
                    <time className="blocked-time">
                      {new Date(item.blockedAt).toLocaleDateString()}
                    </time>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm unblock-btn"
                    onClick={() => unblock(item.id, activeTab)}
                  >
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="moderation-note">
          Blocked items are hidden from analytics views. Blocklist is stored locally and does not affect the network.
        </p>
      </main>

      {/* Confirm clear dialog */}
      {showConfirm && (
        <div className="moderation-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="moderation-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>Are you sure you want to unblock all items?</p>
            <div className="moderation-confirm-actions">
              <button className="btn btn-danger" onClick={handleClearAll}>
                Yes, Clear All
              </button>
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
