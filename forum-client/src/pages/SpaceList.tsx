/**
 * Space list page showing all available spaces
 */

import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSpaces, useRpc } from '../hooks/useRpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useBlocklist } from '../hooks/useBlocklist';
import { useSpaceCreationPow } from '../hooks/useActionPow';
import { useSponsorship } from '../hooks/useSponsorship';
import { useSign } from '../hooks/useSign';
import { PowProgress } from '../components/PowProgress';
import { logger } from '../lib/logger';
import { formatErrorMessage, getErrorAction, isAuthenticationError } from '../lib/errorMessages';
import './SpaceList.css';

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
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function SpaceList(): JSX.Element {
  logger.info('[SpaceList] ===== COMPONENT MOUNTED =====');

  const { spaces, loading, error, refetch } = useSpaces();
  const { identity } = useIdentityContext();
  const { rpc } = useRpc();
  const { isSponsored } = useSponsorship();
  const { isSpaceBlocked } = useBlocklist();
  const { sign } = useSign();
  const navigate = useNavigate();

  // Log on every render
  logger.info('[SpaceList] RENDER:', {
    hasIdentity: !!identity,
    identityPubKey: identity?.publicKey?.substring(0, 20),
    willShowButton: !!identity,
  });

  // Log identity state for debugging
  useEffect(() => {
    logger.info('[SpaceList] useEffect - Identity state changed:', {
      hasIdentity: !!identity,
      identityPubKey: identity?.publicKey?.substring(0, 16),
    });
  }, [identity]);

  // Space creation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // PoW mining for space creation
  const {
    state: miningState,
    progress,
    solution,
    cancel: cancelMining,
    reset: resetMining,
    getRpcParams,
    mineSpaceCreation,
  } = useSpaceCreationPow();

  // Log mining state changes
  useEffect(() => {
    logger.info('[SpaceList] MINING STATE CHANGED:', {
      miningState,
      hasSolution: !!solution,
      isCreating,
      attempts: progress.attempts,
      elapsedMs: progress.elapsedMs,
    });
  }, [miningState, solution, isCreating, progress.attempts, progress.elapsedMs]);

  // Handle creating a space
  const handleCreateSpace = useCallback(async () => {
    logger.info('[SpaceList] handleCreateSpace CLICKED!', {
      hasIdentity: !!identity,
      hasRpc: !!rpc,
      spaceName,
      spaceNameTrimmed: spaceName.trim(),
    });

    if (!identity || !rpc || !spaceName.trim()) {
      logger.error('[SpaceList] handleCreateSpace BLOCKED - missing requirements:', {
        hasIdentity: !!identity,
        hasRpc: !!rpc,
        hasSpaceName: !!spaceName.trim(),
      });
      return;
    }

    logger.info('[SpaceList] Starting space creation process...');
    setCreateError(null);
    setIsCreating(true);

    try {
      // Start PoW mining
      const authorPubkey = hexToBytes(identity.publicKey);
      logger.info('[SpaceList] Starting PoW mining for space:', spaceName);
      await mineSpaceCreation(spaceName, authorPubkey, true);
      logger.info('[SpaceList] mineSpaceCreation returned (mining started or complete)');
    } catch (err) {
      logger.error('[SpaceList] mineSpaceCreation threw error:', err);
      if (err instanceof Error && !err.message.includes('cancelled')) {
        setCreateError(err.message);
      }
      setIsCreating(false);
    }
  }, [identity, rpc, spaceName, mineSpaceCreation]);

  // When mining completes, submit to RPC
  const handleMiningComplete = useCallback(async () => {
    if (!identity || !rpc || !solution) return;

    const params = getRpcParams();
    if (!params) {
      setCreateError('Failed to get PoW params');
      setIsCreating(false);
      return;
    }

    try {
      // Sign the space creation request with the node's identity
      const signatureMessage = new TextEncoder().encode(
        `create_space:${spaceName}:${identity.publicKey}:${params.timestamp}`
      );
      const signatureBytes = await sign(signatureMessage);
      if (!signatureBytes) {
        setCreateError('Failed to sign space creation request');
        setIsCreating(false);
        return;
      }
      const signature = bytesToHex(signatureBytes);

      logger.info('[SpaceList] Calling createSpace RPC with:', {
        name: spaceName,
        creatorId: identity.publicKey?.substring(0, 20),
        powNonce: params.pow_nonce,
        powDifficulty: params.pow_difficulty,
      });

      const result = await rpc.createSpace({
        name: spaceName,
        creatorId: identity.publicKey,
        powNonce: params.pow_nonce,
        powDifficulty: params.pow_difficulty,
        powNonceSpace: params.pow_nonce_space,
        powHash: params.pow_hash,
        signature,
        timestamp: params.timestamp,
      });

      logger.info('[SpaceList] createSpace RPC result:', result);

      if (result.success) {
        logger.info('[SpaceList] Space created! Navigating to:', `/spaces/${result.space_id}`);
        // Reset form and refresh spaces
        setSpaceName('');
        setShowCreateForm(false);
        resetMining();
        refetch();
        // Navigate to the new space
        navigate(`/spaces/${result.space_id}`);
      } else {
        logger.error('[SpaceList] Space creation failed - result.success was false:', result);
        setCreateError('Space creation failed');
      }
    } catch (err) {
      logger.error('[SpaceList] createSpace threw error:', err);
      // Make error message user-friendly
      const errorMsg = err instanceof Error ? err.message : 'Failed to create space';
      if (errorMsg.includes('not sponsored')) {
        setCreateError('Your identity needs to be sponsored before you can create content. Ask an existing member to sponsor you.');
      } else {
        setCreateError(errorMsg);
      }
      // Reset mining state so the form shows again with the error
      resetMining();
    } finally {
      setIsCreating(false);
    }
  }, [identity, rpc, solution, spaceName, getRpcParams, resetMining, refetch, navigate, sign]);

  // Auto-submit when mining completes
  if (miningState === 'complete' && solution && isCreating) {
    handleMiningComplete();
  }

  return (
    <div className="space-list-page">
      <header className="page-header">
        <h1>Spaces</h1>
        <p className="page-description">
          Browse discussion spaces or select one from the sidebar.
        </p>
        {identity && !showCreateForm && isSponsored && (
          <button
            type="button"
            className="btn btn-primary create-space-btn"
            onClick={() => {
              logger.info('[SpaceList] USER CLICKED "+ Create Space" BUTTON');
              setShowCreateForm(true);
            }}
          >
            + Create Space
          </button>
        )}
      </header>

      {/* Create space form */}
      {showCreateForm && identity && (
        <div className="create-space-form card">
          <h2>Create New Space</h2>
          <p className="form-description">
            Creating a space requires proof-of-work to prevent spam.
            This may take a few seconds.
          </p>

          {miningState === 'idle' && (
            <>
              <div className="form-group">
                <label htmlFor="space-name">Space Name</label>
                <input
                  id="space-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g., General Discussion"
                  value={spaceName}
                  onChange={(e) => setSpaceName(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              {createError && (
                <p className="error-message">{createError}</p>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    logger.info('[SpaceList] USER CLICKED "Create Space" SUBMIT BUTTON');
                    handleCreateSpace();
                  }}
                  disabled={!spaceName.trim() || isCreating}
                >
                  Create Space
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    logger.info('[SpaceList] USER CLICKED "Cancel" BUTTON');
                    setShowCreateForm(false);
                    setSpaceName('');
                    setCreateError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {miningState === 'mining' && (
            <div className="mining-section">
              <PowProgress
                attempts={progress.attempts}
                elapsedMs={progress.elapsedMs}
                difficulty={12} // Testnet difficulty
                onCancel={() => {
                  cancelMining();
                  setIsCreating(false);
                }}
              />
            </div>
          )}

          {miningState === 'complete' && isCreating && (
            <div className="creating-state">
              <p>Mining complete! Creating space...</p>
            </div>
          )}

          {(miningState === 'cancelled' || miningState === 'error') && (
            <div className="mining-failed">
              <p>{miningState === 'cancelled' ? 'Mining was cancelled.' : 'Mining failed.'}</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetMining();
                  setCreateError(null);
                }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="loading-state">Loading spaces...</div>
      )}

      {error && (
        <div className="error-state card">
          <div className="error-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Unable to Load Spaces</h2>
          <p className="error-message">{formatErrorMessage(error)}</p>
          {getErrorAction(error) && (
            <p className="error-action">{getErrorAction(error)}</p>
          )}
          <div className="error-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => refetch()}
            >
              Try Again
            </button>
            {isAuthenticationError(error) && (
              <Link to="/identity" className="btn btn-primary">
                Set Up Identity
              </Link>
            )}
          </div>
        </div>
      )}

      {!loading && spaces.length === 0 && !error && (
        <div className="empty-state card">
          <h2>No Spaces Yet</h2>
          <p>
            This node hasn't discovered any spaces yet.
            {identity ? ' Create a space to get started!' : ' Create an identity to get started!'}
          </p>
        </div>
      )}

      {spaces.length > 0 && (
        <div className="spaces-grid">
          {spaces.filter((space) => !isSpaceBlocked(space.id)).map((space) => (
            <Link
              key={space.id}
              to={`/spaces/${space.id}`}
              className="space-card card"
            >
              <div className="space-card-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </svg>
              </div>

              <div className="space-card-content">
                <h2 className="space-card-name">{space.name}</h2>
                <p className="space-card-description">{space.description}</p>
              </div>

              <div className="space-card-stats">
                <span className="stat">
                  <strong>{space.activePostCount}</strong>
                  <span>active</span>
                </span>
                <span className="stat">
                  <strong>{space.postCount}</strong>
                  <span>total</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!identity && (
        <section className="getting-started card">
          <h2>Getting Started</h2>
          <p>
            Swimchain is a decentralized discussion platform where content
            naturally fades unless the community engages with it.
          </p>
          <ul>
            <li>Browse spaces to find topics that interest you</li>
            <li>Create an identity to participate in discussions</li>
            <li>Engage with content to help it persist longer</li>
            <li>Post new threads using proof-of-work</li>
          </ul>
          <Link to="/identity" className="btn btn-primary">
            Create Your Identity
          </Link>
        </section>
      )}
    </div>
  );
}
