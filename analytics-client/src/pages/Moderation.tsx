/**
 * Moderation Page - Analytics Client
 *
 * View and manage blocked users/spaces, and see moderation stats.
 * Supports both local blocklist (client-side) and on-chain spam attestation (SPEC_12).
 */

import { useState } from 'react';
import { useBlocklist, BlockType } from '../hooks/useBlocklist';
import { useRpc } from '../hooks/useRpc';
import './Moderation.css';

const TABS: { id: BlockType; label: string }[] = [
  { id: 'user', label: 'Users' },
  { id: 'space', label: 'Spaces' },
  { id: 'post', label: 'Posts' },
];

const ATTESTATION_REASONS = [
  { value: 'advertising', label: 'Advertising' },
  { value: 'repetitive', label: 'Repetitive' },
  { value: 'off_topic', label: 'Off Topic' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'illegal_content', label: 'Illegal Content' },
];

function truncateAddress(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function Moderation(): JSX.Element {
  const { connected, nodeInfo } = useRpc();
  const {
    getBlocked, unblock, block, clearAll, blocklist,
    submitAttestation, submitCounterAttestation, checkSpamStatus,
    attestationPending, attestationResult, clearAttestationResult,
  } = useBlocklist();

  const [activeTab, setActiveTab] = useState<BlockType>('user');
  const [addInput, setAddInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Attestation form state
  const [showAttestationForm, setShowAttestationForm] = useState(false);
  const [attestContentId, setAttestContentId] = useState('');
  const [attestReason, setAttestReason] = useState('advertising');
  const [attestIsCounter, setAttestIsCounter] = useState(false);
  const [spamStatus, setSpamStatus] = useState<{ contentId: string; isFlagged: boolean; count: number } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

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

  const handleSubmitAttestation = async () => {
    const id = attestContentId.trim();
    if (!id || !connected) return;

    await (attestIsCounter
      ? submitCounterAttestation(id, nodeInfo?.version ?? 'analytics-client', attestReason, 'auto', 0)
      : submitAttestation(id, nodeInfo?.version ?? 'analytics-client', attestReason, 'auto', 0));

    setAttestContentId('');
  };

  const handleCheckSpamStatus = async () => {
    const id = attestContentId.trim();
    if (!id) return;

    setCheckingStatus(true);
    try {
      const status = await checkSpamStatus(id);
      if (status) {
        setSpamStatus({
          contentId: id,
          isFlagged: status.is_flagged,
          count: status.attestation_count,
        });
      } else {
        setSpamStatus({ contentId: id, isFlagged: false, count: 0 });
      }
    } finally {
      setCheckingStatus(false);
    }
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
          <div className="stat-card">
            <span className={`stat-value ${connected ? 'stat-connected' : 'stat-disconnected'}`}>
              {connected ? 'Live' : 'Offline'}
            </span>
            <span className="stat-label">On-Chain RPC</span>
          </div>
        </section>

        {/* On-Chain Attestation Section */}
        <section className="moderation-section">
          <div className="section-head">
            <h2>On-Chain Attestation</h2>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAttestationForm(!showAttestationForm)}
            >
              {showAttestationForm ? 'Hide' : 'Report Content'}
            </button>
          </div>

          {showAttestationForm && (
            <div className="attestation-form">
              <p className="attestation-description">
                Submit an on-chain spam attestation for content. Requires a connected node.
                {!connected && <span className="attestation-warning"> (not connected — form disabled)</span>}
              </p>

              <div className="attestation-input-group">
                <div className="attestation-field">
                  <label htmlFor="attest-content-id">Content ID</label>
                  <input
                    id="attest-content-id"
                    type="text"
                    placeholder="sha256:... or hex content ID"
                    value={attestContentId}
                    onChange={(e) => setAttestContentId(e.target.value)}
                    disabled={!connected}
                  />
                </div>

                <div className="attestation-field">
                  <label htmlFor="attest-reason">Reason</label>
                  <select
                    id="attest-reason"
                    value={attestReason}
                    onChange={(e) => setAttestReason(e.target.value)}
                    disabled={!connected}
                  >
                    {ATTESTATION_REASONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className="attestation-checkbox">
                  <label>
                    <input
                      type="checkbox"
                      checked={attestIsCounter}
                      onChange={(e) => setAttestIsCounter(e.target.checked)}
                      disabled={!connected}
                    />
                    This is a <strong>counter-attestation</strong> (vouch content is NOT spam)
                  </label>
                </div>
              </div>

              <div className="attestation-actions">
                <button
                  className="btn btn-danger"
                  onClick={handleSubmitAttestation}
                  disabled={!connected || !attestContentId.trim() || attestationPending !== null}
                >
                  {attestationPending !== null
                    ? 'Submitting...'
                    : attestIsCounter
                      ? 'Submit Counter-Attestation'
                      : 'Submit Spam Attestation'
                  }
                </button>

                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleCheckSpamStatus}
                  disabled={!connected || !attestContentId.trim() || checkingStatus}
                >
                  {checkingStatus ? 'Checking...' : 'Check Status'}
                </button>
              </div>

              {/* Spam status result */}
              {spamStatus && (
                <div className={`attestation-status ${spamStatus.isFlagged ? 'status-flagged' : 'status-clean'}`}>
                  <strong>{spamStatus.isFlagged ? '⚠ Flagged' : '✓ Clean'}</strong>
                  {' — '}{spamStatus.count} attestation{spamStatus.count !== 1 ? 's' : ''} on record
                </div>
              )}

              {/* Attestation result toast */}
              {attestationResult && (
                <div className={`attestation-result ${attestationResult.success ? 'result-success' : 'result-error'}`}>
                  <span>
                    {attestationResult.success ? '✓ ' : '✗ '}
                    {attestationResult.message}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={clearAttestationResult}>✕</button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Blocklist Manager */}
        <section className="moderation-section">
          <div className="section-head">
            <h2>Local Blocklist</h2>
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
          <strong>Local</strong> — items hidden from analytics views. Does not affect the network.
          <br />
          <strong>On-chain</strong> — spam attestations recorded on the blockchain. Requires a connected node.
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
