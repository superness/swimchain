/**
 * Identity management page
 *
 * Shows the node identity. Identity is managed by the node, not the browser.
 */

import { useCallback, useState, useEffect } from 'react';
import { useIdentityName } from '../hooks/useRpc';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { isInIframe } from '../hooks/useParentRpcConfig';
import { logger } from '../lib/logger';
import { AddressDisplay } from '../components/AddressDisplay';
import { BackupPromptModal } from '../components/BackupPromptModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import './Identity.css';

const BACKUP_DISMISSED_KEY = 'swimchain-backup-dismissed';

// Public key display component with copy button
function PubkeyDisplay({ publicKey }: { publicKey: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pubkey-display-wrapper">
      <code className="pubkey-display">{publicKey}</code>
      <button
        type="button"
        className={`pubkey-copy-btn ${copied ? 'copied' : ''}`}
        onClick={handleCopy}
        aria-label={copied ? 'Copied!' : 'Copy public key'}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function IdentityPage(): JSX.Element {
  logger.info('[IdentityPage] ===== PAGE RENDERING =====');

  // Get node identity
  const { identity: nodeIdentity, isLoading: nodeIdentityLoading, error: nodeIdentityError } = useNodeIdentity();

  // Display name management
  const { name: displayName, loading: nameLoading, saving: nameSaving, error: nameError, updateName } = useIdentityName();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);

  // Show backup prompt on first visit when identity exists
  useEffect(() => {
    if (nodeIdentity?.address && !localStorage.getItem(BACKUP_DISMISSED_KEY)) {
      setShowBackupPrompt(true);
    }
  }, [nodeIdentity?.address]);

  // Debug logging
  logger.info('[IdentityPage] STATE:', {
    nodeIdentity: nodeIdentity?.address?.substring(0, 20) || null,
    nodeIdentityLoading,
    nodeIdentityError,
  });

  // Handle saving display name
  const handleSaveDisplayName = useCallback(async () => {
    const trimmed = editNameValue.trim();
    const newName = trimmed || null;
    const success = await updateName(newName);
    if (success) {
      setIsEditingName(false);
    }
  }, [editNameValue, updateName]);

  // Handle starting to edit display name
  const handleStartEditName = useCallback(() => {
    setEditNameValue(displayName || '');
    setIsEditingName(true);
  }, [displayName]);

  // Handle canceling display name edit
  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
    setEditNameValue('');
  }, []);

  const hasNodeIdentity = nodeIdentity && nodeIdentity.address;

  // Node-wide centralized identity (desktop app): the node owns one central identity —
  // no per-client create/unlock/manage. Show WHO you are (address + name) rather than a
  // dead-end placeholder.
  if (isInIframe()) {
    return (
      <div className="identity-page">
        <h1>Your identity</h1>
        <p>
          Managed by the Swimchain app — the node holds your key and signs on your behalf,
          so there&apos;s nothing to create or unlock here.
        </p>
        {displayName && <p><strong>{displayName}</strong></p>}
        {nodeIdentity?.address
          ? <AddressDisplay address={nodeIdentity.address} />
          : <p>Resolving your identity…</p>}
      </div>
    );
  }

  return (
    <div className="identity-page">
      <h1>Identity Management</h1>

      {/* Loading state */}
      {nodeIdentityLoading && (
        <section className="identity-section">
          <div className="identity-loading">
            <div className="loading-spinner" />
            <p>Loading identity from node...</p>
          </div>
        </section>
      )}

      {/* Error state - no node identity */}
      {!nodeIdentityLoading && !hasNodeIdentity && (
        <section className="identity-section">
          <div className="no-identity-card card">
            <h2>No Identity Available</h2>
            <p>
              Your Swimchain node does not have an identity loaded.
              {nodeIdentityError && (
                <span className="error-detail"> Error: {nodeIdentityError}</span>
              )}
            </p>
            <div className="identity-info card">
              <h3>How to Get an Identity</h3>
              <p>
                Your identity is managed by your Swimchain node. Make sure your node
                is running and has an identity configured.
              </p>
              <p>
                The node automatically generates an identity on first run, stored
                in its data directory.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Node identity display */}
      {!nodeIdentityLoading && hasNodeIdentity && (
        <section className="identity-section">
          <h2>Your Node Identity</h2>
          <div className="node-identity-card card">
            <div className="identity-address">
              <label>Address</label>
              <AddressDisplay address={nodeIdentity.address} />
            </div>
            <div className="identity-pubkey">
              <label>Public Key</label>
              <PubkeyDisplay publicKey={nodeIdentity.publicKey} />
            </div>
          </div>

          {/* Display Name Management */}
          <div className="display-name-section card">
            <h3>Display Name</h3>
            {nameLoading ? (
              <p className="loading-text">Loading display name...</p>
            ) : isEditingName ? (
              <div className="display-name-edit">
                <label htmlFor="display-name-input" className="visually-hidden">Display name</label>
                <input
                  type="text"
                  id="display-name-input"
                  className="display-name-input"
                  placeholder="Enter display name (optional)"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  maxLength={64}
                  disabled={nameSaving}
                  aria-describedby="display-name-char-count"
                />
                <p id="display-name-char-count" className="char-count">{editNameValue.length}/64 characters</p>
                {nameError && <p className="error-message" role="alert">{nameError}</p>}
                <div className="display-name-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveDisplayName}
                    disabled={nameSaving}
                  >
                    {nameSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancelEditName}
                    disabled={nameSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="display-name-view">
                <p className="current-name">
                  {displayName ? (
                    <span className="name-value">{displayName}</span>
                  ) : (
                    <span className="no-name">No display name set</span>
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleStartEditName}
                >
                  {displayName ? 'Edit Name' : 'Set Name'}
                </button>
              </div>
            )}
            <p className="display-name-info">
              Your display name appears alongside your posts. Leave blank to show only your address.
            </p>
          </div>

          <div className="identity-info card">
            <h3>About Your Node Identity</h3>
            <p>
              Your identity is managed by your Swimchain node. The private key
              is stored securely in your node's data directory.
            </p>
            <p>
              To change your identity, you would need to manage it through
              the node's configuration.
            </p>
          </div>

          <div className="danger-zone card">
            <h3>Danger Zone</h3>
            <p>Permanently delete your identity from this node. This cannot be undone unless you have a backup.</p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setShowDeleteModal(true)}
            >
              Delete Identity
            </button>
          </div>

          <DeleteConfirmModal
            isOpen={showDeleteModal}
            onClose={() => setShowDeleteModal(false)}
            onConfirm={() => {
              logger.info('[IdentityPage] Identity deletion confirmed');
              setShowDeleteModal(false);
            }}
            address={nodeIdentity.address}
          />

          <BackupPromptModal
            isOpen={showBackupPrompt}
            onClose={() => {
              localStorage.setItem(BACKUP_DISMISSED_KEY, '1');
              setShowBackupPrompt(false);
            }}
            seed={nodeIdentity.publicKey}
            address={nodeIdentity.address}
          />
        </section>
      )}
    </div>
  );
}

// Styles
const styles = `
.identity-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.no-identity-card {
  text-align: center;
  padding: 2rem;
}

.no-identity-card h2 {
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.error-detail {
  display: block;
  color: var(--danger);
  margin-top: 0.5rem;
  font-size: 0.875rem;
}

.display-name-section {
  margin-top: 1.5rem;
}

.display-name-section h3 {
  margin-bottom: 1rem;
}

.display-name-view {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.current-name {
  margin: 0;
}

.name-value {
  font-weight: 600;
  font-size: 1.1rem;
}

.no-name {
  color: var(--text-muted);
  font-style: italic;
}

.display-name-edit {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.display-name-input {
  width: 100%;
  max-width: 300px;
  padding: 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-elevated);
}

.display-name-input:focus {
  outline: none;
  border-color: var(--primary);
}

.display-name-input:disabled {
  opacity: 0.6;
}

.char-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 0;
}

.display-name-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.display-name-info {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-top: 1rem;
  margin-bottom: 0;
}

.loading-text {
  color: var(--text-muted);
  font-style: italic;
}

.node-identity-card {
  margin-bottom: 1.5rem;
}

.node-identity-card .identity-address,
.node-identity-card .identity-pubkey {
  margin-bottom: 1rem;
}

.node-identity-card label {
  display: block;
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.node-identity-card .pubkey-display {
  display: block;
  font-size: 0.75rem;
  word-break: break-all;
  background: var(--bg-secondary);
  padding: 0.5rem;
  border-radius: 4px;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
