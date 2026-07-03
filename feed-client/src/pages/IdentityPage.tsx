/**
 * Identity management page with real PoW mining
 *
 * Features:
 * - Create new identity with PoW mining
 * - Import identity from seed hex
 * - Display name management
 * - Backup prompt before saving
 * - Delete confirmation modal
 * - Node identity support (desktop app mode)
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKeypair } from '../hooks/useKeypair';
import { usePow } from '../hooks/usePow';
import { WasmKeypair, encode_address } from '../wasm/loader';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useIdentityName } from '../hooks/useRpc';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { AddressDisplay } from '../components/AddressDisplay';
import { PowProgress } from '../components/PowProgress';
import { IdentityCard } from '../components/IdentityCard';
import { BackupPromptModal } from '../components/BackupPromptModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { InviteRedemption } from '../components/InviteRedemption';
import { parseInviteInput, type InvitePayload } from '../lib/invite';
import './IdentityPage.css';

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

export function IdentityPage(): JSX.Element {
  const { keypair, address, generate, clear } = useKeypair();
  const { state, solution, mine, cancel, attempts, elapsedMs, reset } = usePow();
  const { identity, setIdentity, clearIdentity, hasValidIdentity } = useIdentityContext();
  const location = useLocation();
  const navigate = useNavigate();

  // Check for node identity (desktop app mode)
  const { identity: nodeIdentity, isLoading: nodeIdentityLoading } = useNodeIdentity();

  // Display name management
  const { name: displayName, loading: nameLoading, saving: nameSaving, error: nameError, updateName } = useIdentityName();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  // Import identity state
  const [importSeed, setImportSeed] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Invite code state (SWIM-INV-2)
  const [inviteInput, setInviteInput] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  // When set, we're redeeming an invite for a freshly saved identity
  const [redeeming, setRedeeming] = useState<{
    invite: InvitePayload;
    seed: string;
    publicKey: string;
  } | null>(null);

  // Auto-fill the invite field when the app is opened with #invite=<token>
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#invite=')) {
      setInviteInput(hash.slice('#invite='.length));
      // Clear the fragment so the token doesn't linger in the address bar
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Validate the invite input as the user types (soft validation)
  const handleInviteChange = useCallback((value: string) => {
    setInviteInput(value);
    if (!value.trim()) {
      setInviteError(null);
      return;
    }
    try {
      parseInviteInput(value);
      setInviteError(null);
    } catch {
      setInviteError("That invite code doesn't look right — double-check you copied the whole link or code.");
    }
  }, []);

  /**
   * Parse the invite input; returns null when empty or malformed.
   * (A malformed code already shows an inline error — identity creation
   * still succeeds, we just skip redemption.)
   */
  const getParsedInvite = useCallback((): InvitePayload | null => {
    try {
      return parseInviteInput(inviteInput);
    } catch {
      return null;
    }
  }, [inviteInput]);

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
  const returnTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/';

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
      // Create the identity object but don't save yet - show backup modal first
      const newIdentity = {
        address,
        publicKey: bytesToHex(keypair.publicKey()),
        seed: bytesToHex(keypair.seed()),
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
      setShowBackupModal(false);
      reset();
      clear();

      // If the user provided a valid invite code, redeem it before moving on
      const invite = getParsedInvite();
      if (invite) {
        setRedeeming({
          invite,
          seed: pendingIdentity.seed,
          publicKey: pendingIdentity.publicKey,
        });
        setPendingIdentity(null);
        return;
      }

      setPendingIdentity(null);
      // Navigate to the original destination after saving
      navigate(returnTo, { replace: true });
    }
  }, [pendingIdentity, setIdentity, reset, clear, navigate, returnTo, getParsedInvite]);

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

      // If the user provided a valid invite code, redeem it before moving on
      const invite = getParsedInvite();
      if (invite) {
        setRedeeming({ invite, seed: cleanSeed, publicKey: publicKeyHex });
        return;
      }

      // Navigate to feed
      navigate('/', { replace: true });
    } catch (error) {
      setImportError(`Failed to import identity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [importSeed, setIdentity, navigate, getParsedInvite]);

  // If node has identity, show that instead of browser identity management
  const hasNodeIdentity = nodeIdentity && nodeIdentity.address;

  // Invite redemption takes over the page after identity creation (SWIM-INV-2)
  if (redeeming) {
    return (
      <div className="identity-page">
        <header className="identity-page__header">
          <h1 className="identity-page__title">Welcome to Swimchain</h1>
        </header>
        <div className="identity-page__content">
          <InviteRedemption
            invite={redeeming.invite}
            seed={redeeming.seed}
            publicKey={redeeming.publicKey}
            onDone={() => {
              setRedeeming(null);
              setInviteInput('');
              navigate(returnTo, { replace: true });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="identity-page">
      <header className="identity-page__header">
        <button
          type="button"
          className="identity-page__back"
          onClick={() => navigate(-1)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
        <h1 className="identity-page__title">Identity</h1>
      </header>

      <div className="identity-page__content">
        {/* Show node identity when running in desktop app mode */}
        {nodeIdentityLoading && (
          <section className="identity-page__section">
            <div className="identity-page__loading">
              <div className="loading-spinner" />
              <p>Loading identity from node...</p>
            </div>
          </section>
        )}

        {!nodeIdentityLoading && hasNodeIdentity && (
          <section className="identity-page__section">
            <h2 className="identity-page__section-title">Your Node Identity</h2>
            <div className="identity-page__card">
              <div className="identity-page__field">
                <label>Address</label>
                <AddressDisplay address={nodeIdentity.address} chars={12} showCopy />
              </div>
              <div className="identity-page__field">
                <label>Public Key</label>
                <code className="identity-page__pubkey">{nodeIdentity.publicKey}</code>
              </div>
            </div>

            {/* Display Name Management for Node Identity */}
            <div className="identity-page__card">
              <h3>Display Name</h3>
              {nameLoading ? (
                <p className="identity-page__loading-text">Loading display name...</p>
              ) : isEditingName ? (
                <div className="identity-page__name-edit">
                  <label htmlFor="display-name-input" className="visually-hidden">Display name</label>
                  <input
                    type="text"
                    id="display-name-input"
                    className="identity-page__input"
                    placeholder="Enter display name (optional)"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    maxLength={64}
                    disabled={nameSaving}
                  />
                  <p className="identity-page__char-count">{editNameValue.length}/64 characters</p>
                  {nameError && <p className="identity-page__error" role="alert">{nameError}</p>}
                  <div className="identity-page__name-actions">
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
                <div className="identity-page__name-view">
                  <p className="identity-page__current-name">
                    {displayName ? (
                      <span className="identity-page__name-value">{displayName}</span>
                    ) : (
                      <span className="identity-page__no-name">No display name set</span>
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
              <p className="identity-page__desc">
                Your display name appears alongside your posts. Leave blank to show only your address.
              </p>
            </div>

            <div className="identity-page__card">
              <h3>About Your Node Identity</h3>
              <p className="identity-page__desc">
                Your identity is managed by your Swimchain node. The private key
                is stored securely in your node's data directory.
              </p>
            </div>
          </section>
        )}

        {/* Only show browser identity management if no node identity */}
        {!nodeIdentityLoading && !hasNodeIdentity && (
          <>
            {/* Show upgrade notice if identity exists but needs upgrade */}
            {identity && !hasValidIdentity && (
              <section className="identity-page__section">
                <div className="identity-page__card identity-page__warning">
                  <h2 className="identity-page__section-title">Identity Upgrade Required</h2>
                  <p className="identity-page__desc">
                    Your existing identity was created with an older version and cannot sign
                    RPC requests. You need to create a new identity to use the app.
                  </p>
                  <p className="identity-page__desc">
                    <strong>Your old address:</strong> {identity.address}
                  </p>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => clearIdentity()}
                  >
                    Delete Old Identity &amp; Create New
                  </button>
                </div>
              </section>
            )}

            {identity && hasValidIdentity && (
              <section className="identity-page__section">
                <h2 className="identity-page__section-title">Your Identity</h2>
                <IdentityCard identity={identity} />

                {/* Display Name Management */}
                <div className="identity-page__card">
                  <h3>Display Name</h3>
                  {nameLoading ? (
                    <p className="identity-page__loading-text">Loading display name...</p>
                  ) : isEditingName ? (
                    <div className="identity-page__name-edit">
                      <label htmlFor="display-name-input-browser" className="visually-hidden">Display name</label>
                      <input
                        type="text"
                        id="display-name-input-browser"
                        className="identity-page__input"
                        placeholder="Enter display name (optional)"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        maxLength={64}
                        disabled={nameSaving}
                      />
                      <p className="identity-page__char-count">{editNameValue.length}/64 characters</p>
                      {nameError && <p className="identity-page__error" role="alert">{nameError}</p>}
                      <div className="identity-page__name-actions">
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
                    <div className="identity-page__name-view">
                      <p className="identity-page__current-name">
                        {displayName ? (
                          <span className="identity-page__name-value">{displayName}</span>
                        ) : (
                          <span className="identity-page__no-name">No display name set</span>
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
                  <p className="identity-page__desc">
                    Your display name appears alongside your posts. Leave blank to show only your address.
                  </p>
                </div>

                <div className="identity-page__actions">
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={handleDeleteIdentity}
                  >
                    Delete Identity
                  </button>
                </div>

                {/* Import section */}
                <div className="identity-page__card">
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
                    <div className="identity-page__import-form">
                      <label htmlFor="import-seed-input" className="identity-page__desc">
                        Enter your 64-character hex seed (private key) to restore an existing identity.
                      </label>
                      <input
                        type="password"
                        id="import-seed-input"
                        className="identity-page__input"
                        placeholder="Enter 64 hex characters (your seed/private key)"
                        value={importSeed}
                        onChange={(e) => setImportSeed(e.target.value)}
                      />
                      {importError && (
                        <p className="identity-page__error" role="alert">{importError}</p>
                      )}
                      <div className="identity-page__import-actions">
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

                <div className="identity-page__card">
                  <h3>About Your Identity</h3>
                  <p className="identity-page__desc">
                    Your identity is stored locally in this browser. The private key
                    never leaves your device.
                  </p>
                  <p className="identity-page__desc">
                    If you clear your browser data or use a different browser, you'll
                    need to import your identity using your backup seed.
                  </p>
                </div>
              </section>
            )}

            {!identity && (
              <section className="identity-page__section">
                <h2 className="identity-page__section-title">Create New Identity</h2>
                <p className="identity-page__desc">
                  Generate a new cryptographic identity to participate in Swimchain.
                  This process includes mining a proof-of-work to prevent spam.
                </p>

                {/* Invite code (optional) - SWIM-INV-2 */}
                <div className="identity-page__card identity-page__invite">
                  <h3>Have an invite code or link?</h3>
                  <label htmlFor="invite-code-input" className="identity-page__desc">
                    If a friend sent you an invite, paste the link or code here (optional).
                    You'll be connected to them automatically once your identity is ready.
                  </label>
                  <input
                    type="text"
                    id="invite-code-input"
                    className="identity-page__input"
                    placeholder="Paste invite link or code"
                    value={inviteInput}
                    onChange={(e) => handleInviteChange(e.target.value)}
                  />
                  {inviteError && (
                    <p className="identity-page__error" role="alert">{inviteError}</p>
                  )}
                  {!inviteError && inviteInput.trim() !== '' && (
                    <p className="identity-page__invite-ok">
                      Invite looks good — it will be redeemed as soon as your identity is created.
                    </p>
                  )}
                </div>

                {state === 'idle' && !keypair && (
                  <div className="identity-page__create-options">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleGenerateAndMine}
                    >
                      Generate New Identity
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setShowImport(true)}
                    >
                      Import Existing Identity
                    </button>
                  </div>
                )}

                {/* Import form when no identity exists */}
                {showImport && state === 'idle' && !keypair && (
                  <div className="identity-page__card">
                    <h3>Import Identity</h3>
                    <label htmlFor="import-seed-new" className="identity-page__desc">
                      Enter your 64-character hex seed (private key) to restore an existing identity.
                    </label>
                    <input
                      type="password"
                      id="import-seed-new"
                      className="identity-page__input"
                      placeholder="Enter 64 hex characters (your seed/private key)"
                      value={importSeed}
                      onChange={(e) => setImportSeed(e.target.value)}
                    />
                    {importError && (
                      <p className="identity-page__error" role="alert">{importError}</p>
                    )}
                    <div className="identity-page__import-actions">
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

                {state === 'idle' && keypair && (
                  <div className="identity-page__card">
                    <p>Keypair generated! Address preview:</p>
                    <AddressDisplay address={address || ''} chars={12} showCopy />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={startMiningIfReady}
                      style={{ marginTop: '1rem' }}
                    >
                      Start Mining PoW
                    </button>
                  </div>
                )}

                {(state === 'initializing' || state === 'mining') && (
                  <div className="identity-page__card">
                    <PowProgress
                      attempts={attempts}
                      elapsedMs={elapsedMs}
                      difficulty={20}
                      onCancel={cancel}
                    />
                  </div>
                )}

                {state === 'complete' && solution && (
                  <div className="identity-page__card">
                    <div className="identity-page__success">
                      Mining complete!
                    </div>
                    <AddressDisplay address={address || ''} chars={12} showCopy />
                    <p className="identity-page__desc">
                      Found in {attempts.toLocaleString()} attempts ({(elapsedMs / 1000).toFixed(1)}s)
                    </p>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveIdentity}
                      style={{ marginTop: '1rem' }}
                    >
                      Save Identity
                    </button>
                  </div>
                )}

                {state === 'cancelled' && (
                  <div className="identity-page__card">
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
                  <div className="identity-page__card">
                    <p className="identity-page__error">An error occurred during mining.</p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { reset(); clear(); }}
                    >
                      Try Again
                    </button>
                  </div>
                )}

                <div className="identity-page__card">
                  <h3>How It Works</h3>
                  <ul className="identity-page__list">
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
      </div>

      {/* Backup Prompt Modal */}
      <BackupPromptModal
        isOpen={showBackupModal && !!pendingIdentity}
        seed={pendingIdentity?.seed || ''}
        address={pendingIdentity?.address || ''}
        onClose={handleBackupModalClose}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        address={identity?.address || ''}
        onConfirm={handleConfirmDelete}
        onClose={handleCancelDelete}
      />
    </div>
  );
}
