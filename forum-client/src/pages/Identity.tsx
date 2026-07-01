/**
 * Identity management page
 */

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKeypair } from '../hooks/useKeypair';
import { usePow } from '../hooks/usePow';
import { WasmKeypair, encode_address } from '../wasm/loader';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useIdentityName } from '../hooks/useRpc';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { logger } from '../lib/logger';
import { AddressDisplay } from '../components/AddressDisplay';
import { PowProgress } from '../components/PowProgress';
import { IdentityCard } from '../components/IdentityCard';
import { BackupPromptModal } from '../components/BackupPromptModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import './Identity.css';

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Helper: Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

  const { keypair, address, generate, clear } = useKeypair();
  const { state, solution, mine, cancel, attempts, elapsedMs, reset } = usePow();
  const { identity, setIdentity, clearIdentity, hasValidIdentity } = useIdentityContext();
  const location = useLocation();
  const navigate = useNavigate();

  // Check for node identity (desktop app mode)
  const { identity: nodeIdentity, isLoading: nodeIdentityLoading, error: nodeIdentityError } = useNodeIdentity();

  // Debug logging
  logger.info('[IdentityPage] STATE:', {
    hasKeypair: !!keypair,
    address: address?.substring(0, 20),
    hasIdentity: !!identity,
    identityAddress: identity?.address?.substring(0, 20),
    hasValidIdentity,
    nodeIdentity: nodeIdentity?.address?.substring(0, 20) || null,
    nodeIdentityLoading,
    nodeIdentityError,
    locationState: location.state,
  });

  // Display name management
  const { name: displayName, loading: nameLoading, saving: nameSaving, error: nameError, updateName } = useIdentityName();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  // Import identity state
  const [importSeed, setImportSeed] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Backup prompt modal state
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [pendingIdentity, setPendingIdentity] = useState<{
    address: string;
    publicKey: string;
    seed: string;
    createdAt: number;
    powSolution?: {
      nonce: string;
      timestamp: string;
      difficulty: number;
    };
  } | null>(null);

  // Get the path to return to after identity is created
  const returnTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/spaces';

  // When keypair is generated, start mining
  const handleGenerateAndMine = useCallback(() => {
    generate();
  }, [generate]);

  // Effect to start mining after keypair is generated
  const startMiningIfReady = useCallback(() => {
    if (keypair && state === 'idle') {
      const publicKey = keypair.publicKey();
      mine(publicKey, 20);
    }
  }, [keypair, state, mine]);

  // Save identity when mining completes - show backup modal first
  const handleSaveIdentity = useCallback(() => {
    if (keypair && solution && address) {
      // Convert Uint8Array to hex string helper
      const toHex = (bytes: Uint8Array): string =>
        Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

      // Create the identity object but don't save yet - show backup modal first
      const newIdentity = {
        address,
        publicKey: toHex(keypair.publicKey()),
        seed: toHex(keypair.seed()),
        createdAt: Math.floor(Date.now() / 1000),
        powSolution: {
          nonce: solution.nonce.toString(),
          timestamp: solution.timestamp.toString(),
          difficulty: 20,
        },
      };

      setPendingIdentity(newIdentity);
      setShowBackupModal(true);
    }
  }, [keypair, solution, address]);

  // Called when user dismisses the backup modal
  const handleBackupModalClose = useCallback(() => {
    if (pendingIdentity) {
      setIdentity(pendingIdentity);
      setPendingIdentity(null);
      setShowBackupModal(false);
      reset();
      clear();

      // Navigate to the original destination after saving
      navigate(returnTo, { replace: true });
    }
  }, [pendingIdentity, setIdentity, reset, clear, navigate, returnTo]);

  const handleDeleteIdentity = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    clearIdentity();
    setShowDeleteModal(false);
  }, [clearIdentity]);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteModal(false);
  }, []);

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

  // Handle importing an identity from a seed hex
  const handleImportIdentity = useCallback(() => {
    setImportError(null);

    // Validate seed format
    const cleanSeed = importSeed.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleanSeed)) {
      setImportError('Invalid seed: must be 64 hex characters (32 bytes)');
      return;
    }

    try {
      // Create keypair from seed
      const seedBytes = hexToBytes(cleanSeed);
      const kp = WasmKeypair.fromSeed(seedBytes);

      // Get public key and address
      const publicKey = kp.publicKey();
      const publicKeyHex = bytesToHex(publicKey);
      const importedAddress = encode_address(publicKey);

      // Save the identity
      setIdentity({
        address: importedAddress,
        publicKey: publicKeyHex,
        seed: cleanSeed,
        createdAt: Math.floor(Date.now() / 1000),
        // No PoW solution for imported identities
      });

      // Clean up
      kp.free();
      setImportSeed('');
      setShowImport(false);

      // Navigate to spaces
      navigate('/spaces', { replace: true });
    } catch (error) {
      setImportError(`Failed to import identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [importSeed, setIdentity, navigate]);

  // If node has identity, show that instead of browser identity management
  const hasNodeIdentity = nodeIdentity && nodeIdentity.address;

  return (
    <div className="identity-page">
      <h1>Identity Management</h1>

      {/* Show node identity when running in desktop app mode */}
      {nodeIdentityLoading && (
        <section className="identity-section">
          <div className="identity-loading">
            <div className="loading-spinner" />
            <p>Loading identity from node...</p>
          </div>
        </section>
      )}

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

          <div className="import-section card">
            <h3>Use a Different Identity?</h3>
            {!showImport ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImport(true)}
              >
                Import Identity
              </button>
            ) : (
              <div className="import-form">
                <label htmlFor="import-seed-input-node" className="import-description">
                  Enter your 64-character hex seed (private key) to use a browser-stored identity instead of the node identity.
                </label>
                <input
                  type="password"
                  id="import-seed-input-node"
                  className="import-input"
                  placeholder="Enter 64 hex characters (your seed/private key)"
                  value={importSeed}
                  onChange={(e) => setImportSeed(e.target.value)}
                  aria-describedby={importError ? "import-error-node" : undefined}
                />
                {importError && (
                  <p id="import-error-node" className="error-message" role="alert">{importError}</p>
                )}
                <div className="import-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImportIdentity}
                    disabled={!importSeed.trim()}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowImport(false);
                      setImportSeed('');
                      setImportError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
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
        </section>
      )}

      {/* Only show browser identity management if no node identity */}
      {!nodeIdentityLoading && !hasNodeIdentity && (
        <>
      {/* Show upgrade notice if identity exists but needs upgrade */}
      {identity && !hasValidIdentity && (
        <section className="identity-upgrade-notice">
          <div className="notice-card warning">
            <h2>Identity Upgrade Required</h2>
            <p>
              Your existing identity was created with an older version and cannot sign
              RPC requests. You need to create a new identity to use the forum.
            </p>
            <p>
              <strong>Your old address:</strong> {identity.address}
            </p>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                clearIdentity();
              }}
            >
              Delete Old Identity &amp; Create New
            </button>
          </div>
        </section>
      )}

      {identity && hasValidIdentity && (
        // Show existing valid identity
        <section className="identity-section">
          <h2>Your Identity</h2>
          <IdentityCard identity={identity} />

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

          <div className="identity-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDeleteIdentity}
            >
              Delete Identity
            </button>
          </div>

          <div className="import-section card">
            <h3>Replace with Existing Identity?</h3>
            {!showImport ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImport(true)}
              >
                Import Identity
              </button>
            ) : (
              <div className="import-form">
                <label htmlFor="import-seed-input-existing" className="import-description">
                  Enter your 64-character hex seed (private key) to replace your current identity.
                </label>
                <input
                  type="password"
                  id="import-seed-input-existing"
                  className="import-input"
                  placeholder="Enter 64 hex characters (your seed/private key)"
                  value={importSeed}
                  onChange={(e) => setImportSeed(e.target.value)}
                  aria-describedby={importError ? "import-error-existing" : undefined}
                />
                {importError && (
                  <p id="import-error-existing" className="error-message" role="alert">{importError}</p>
                )}
                <div className="import-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImportIdentity}
                    disabled={!importSeed.trim()}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowImport(false);
                      setImportSeed('');
                      setImportError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="identity-info card">
            <h3>About Your Identity</h3>
            <p>
              Your identity is stored locally in this browser. The private key
              never leaves your device.
            </p>
            <p>
              If you clear your browser data or use a different browser, you'll
              need to create a new identity.
            </p>
          </div>
        </section>
      )}

      {!identity && (
        // Create new identity (only when no identity at all)
        <section className="identity-section">
          <h2 id="create-identity">Create New Identity</h2>
          <p className="section-description">
            Generate a new cryptographic identity to participate in Swimchain.
            This process includes mining a proof-of-work to prevent spam.
          </p>

          {state === 'idle' && !keypair && (
            <button
              type="button"
              className="btn btn-primary btn-large"
              onClick={handleGenerateAndMine}
            >
              Generate Identity
            </button>
          )}

          {state === 'idle' && keypair && (
            <div className="keypair-generated">
              <p>Keypair generated! Address preview:</p>
              <AddressDisplay address={address || ''} />
              <button
                type="button"
                className="btn btn-primary"
                onClick={startMiningIfReady}
              >
                Start Mining PoW
              </button>
            </div>
          )}

          {(state === 'initializing' || state === 'mining') && (
            <div className="mining-section">
              <PowProgress
                attempts={attempts}
                elapsedMs={elapsedMs}
                difficulty={20}
                onCancel={cancel}
              />
            </div>
          )}

          {state === 'complete' && solution && (
            <div className="mining-complete">
              <div className="success-message">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>Mining complete!</span>
              </div>
              <AddressDisplay address={address || ''} />
              <p className="mining-stats">
                Found in {attempts.toLocaleString()} attempts ({(elapsedMs / 1000).toFixed(1)}s)
              </p>
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={handleSaveIdentity}
              >
                Save Identity
              </button>
            </div>
          )}

          {state === 'cancelled' && (
            <div className="mining-cancelled">
              <p>Mining was cancelled.</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { reset(); clear(); }}
              >
                Start Over
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="mining-error">
              <p className="error-message" role="alert">An error occurred during mining.</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { reset(); clear(); }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Import existing identity - shown above "How It Works" for discoverability */}
          <div className="import-section card">
            <h3>Have an Existing Identity?</h3>
            {!showImport ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImport(true)}
              >
                Import Identity
              </button>
            ) : (
              <div className="import-form">
                <label htmlFor="import-seed-input" className="import-description">
                  Enter your 64-character hex seed (private key) to restore your identity.
                </label>
                <input
                  type="password"
                  id="import-seed-input"
                  className="import-input"
                  placeholder="Enter 64 hex characters (your seed/private key)"
                  value={importSeed}
                  onChange={(e) => setImportSeed(e.target.value)}
                  aria-describedby={importError ? "import-error" : undefined}
                />
                {importError && (
                  <p id="import-error" className="error-message" role="alert">{importError}</p>
                )}
                <div className="import-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImportIdentity}
                    disabled={!importSeed.trim()}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowImport(false);
                      setImportSeed('');
                      setImportError(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="identity-info card">
            <h3>How It Works</h3>
            <ul>
              <li>A cryptographic keypair is generated in your browser</li>
              <li>Proof-of-work is mined to validate your identity</li>
              <li>Your private key stays on your device</li>
              <li>Your public address (cs1...) is used to identify you</li>
            </ul>
          </div>
        </section>
      )}
        </>
      )}

      {/* Backup prompt modal - shown after identity creation */}
      {pendingIdentity && (
        <BackupPromptModal
          isOpen={showBackupModal}
          onClose={handleBackupModalClose}
          seed={pendingIdentity.seed}
          address={pendingIdentity.address}
        />
      )}

      {/* Delete confirmation modal - shown when user clicks Delete Identity */}
      {identity && (
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={handleCancelDelete}
          onConfirm={handleConfirmDelete}
          address={identity.address}
        />
      )}
    </div>
  );
}

// Add styles for identity upgrade notice
const styles = `
.identity-upgrade-notice .notice-card.warning {
  background: #fef3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}

.identity-upgrade-notice .notice-card.warning h2 {
  color: #856404;
  margin-bottom: 1rem;
}

.identity-upgrade-notice .notice-card.warning p {
  color: #856404;
  margin-bottom: 0.5rem;
}

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

.import-section {
  margin-top: 2rem;
}

.import-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.import-description {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.import-input {
  width: 100%;
  padding: 0.75rem;
  font-family: monospace;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-elevated);
}

.import-input:focus {
  outline: none;
  border-color: var(--primary);
}

.import-actions {
  display: flex;
  gap: 0.5rem;
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
