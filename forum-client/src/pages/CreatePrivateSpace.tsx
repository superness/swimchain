/**
 * Create Private Space Page
 *
 * Form for creating a new encrypted private space.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { useNodeIdentity } from '../hooks/useNodeIdentity';
import { isInIframe } from '../hooks/useParentRpcConfig';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useCreatePrivateSpace } from '../hooks/useRpc';
import { useSpaceCreationPow } from '../hooks/useActionPow';
import { solutionToRpcParams } from '../lib/action-pow';
import { generateSpaceKey, encryptSpaceKeyForRecipient, deriveX25519Keys, bytesToHex } from '../lib/x25519';
import { encryptSpaceName } from '../lib/encryption';
import { logger } from '../lib/logger';
import './CreatePrivateSpace.css';

export function CreatePrivateSpace(): JSX.Element {
  logger.info('[CreatePrivateSpace] ===== COMPONENT MOUNTED =====');

  const navigate = useNavigate();
  const { publicKey, keypair } = useStoredKeypair();
  const { identity: nodeIdentity } = useNodeIdentity();
  const userPublicKeyHex = publicKey ? bytesToHex(publicKey) : (nodeIdentity?.publicKey || undefined);
  const { storeSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);
  const { createSpace, createSpaceManaged, creating: rpcCreating } = useCreatePrivateSpace();
  const embedded = isInIframe();
  const { mineSpaceCreation, state: miningState, progress: miningProgress, cancel: cancelMining } = useSpaceCreationPow();

  // Log on every render
  logger.info('[CreatePrivateSpace] RENDER:', {
    hasPublicKey: !!publicKey,
    hasKeypair: !!keypair,
    hasNodeIdentity: !!nodeIdentity,
    nodeIdentityPubKey: nodeIdentity?.publicKey?.substring(0, 20),
    userPublicKeyHex: userPublicKeyHex?.substring(0, 20),
  });

  useEffect(() => {
    logger.info('[CreatePrivateSpace] useEffect - State:', {
      publicKey: publicKey ? 'exists' : 'null',
      keypair: keypair ? 'exists' : 'null',
      nodeIdentity: nodeIdentity ? nodeIdentity.publicKey?.substring(0, 20) : 'null',
    });
  }, [publicKey, keypair, nodeIdentity]);

  const [spaceName, setSpaceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state
  const isMining = miningState === 'mining';
  const isCreating = creating || rpcCreating || isMining;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    logger.info('[CreatePrivateSpace] handleSubmit called!');
    logger.info('[CreatePrivateSpace] Submit state:', {
      hasKeypair: !!keypair,
      hasPublicKey: !!publicKey,
      userPublicKeyHex: userPublicKeyHex?.substring(0, 20),
      spaceName,
    });

    const name = spaceName.trim();

    // Node-managed mode (desktop shell): the node holds the seed and performs all the
    // crypto + PoW + signing. Send only the plaintext name — no local keypair/seed
    // needed. (This is what was throwing "Seed is not available" before.)
    if (embedded) {
      if (!name) {
        setError('Please enter a space name');
        return;
      }
      setCreating(true);
      setError(null);
      try {
        const result = await createSpaceManaged({ name });
        if (!result?.spaceId) {
          throw new Error('Space creation failed: no space ID returned');
        }
        navigate(`/chat/${result.spaceIdBech32 || result.spaceId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create space');
      } finally {
        setCreating(false);
      }
      return;
    }

    if (!keypair || !publicKey || !userPublicKeyHex) {
      logger.error('[CreatePrivateSpace] No identity available - blocking submit');
      setError('No identity available');
      return;
    }

    if (!name) {
      setError('Please enter a space name');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Generate a new space key
      const spaceKey = generateSpaceKey();

      // Generate a unique space ID (hash of creator + timestamp + random)
      const timestamp = Date.now();
      const randomBytes = new Uint8Array(8);
      crypto.getRandomValues(randomBytes);
      const spaceIdPreimage = `private:${userPublicKeyHex}:${timestamp}:${bytesToHex(randomBytes)}`;
      const spaceIdHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(spaceIdPreimage));
      const spaceId = bytesToHex(new Uint8Array(spaceIdHash).slice(0, 16));

      // Derive our X25519 keys
      const seed = keypair.seed();
      const { secretKey: myX25519SecretKey, publicKey: myX25519PublicKey } = deriveX25519Keys(seed);

      // Encrypt space key for ourselves
      const encryptedKeyForSelf = encryptSpaceKeyForRecipient(
        spaceKey,
        myX25519PublicKey,
        myX25519SecretKey
      );

      // Encrypt the space name
      const encryptedName = await encryptSpaceName(name, spaceKey);

      // Sign the create space request
      const signatureMessage = new TextEncoder().encode(
        `create_private_space:${userPublicKeyHex}:${timestamp}`
      );
      const signature = keypair.sign(signatureMessage);

      // Mine PoW for space creation
      logger.info('[CreatePrivateSpace] Mining PoW for space creation...');
      const powSolution = await mineSpaceCreation(name, publicKey, true);
      const powParams = solutionToRpcParams(powSolution);
      logger.info('[CreatePrivateSpace] PoW complete, nonce:', powSolution.nonce.toString());

      // Call create_private_space RPC
      const result = await createSpace({
        name: bytesToHex(encryptedName),
        creator: userPublicKeyHex,
        creatorEncryptedKey: bytesToHex(encryptedKeyForSelf),
        signature: bytesToHex(signature),
        powNonce: powParams.pow_nonce,
        powDifficulty: powParams.pow_difficulty,
        powNonceSpace: powParams.pow_nonce_space,
        powHash: powParams.pow_hash,
        timestamp: Math.floor(timestamp / 1000),
      });

      if (result) {
        console.log('Private space created:', result.spaceId);

        // Store the space key locally
        await storeSpaceKey(
          result.spaceId,
          spaceKey,
          userPublicKeyHex, // creator is the inviter
          0,
          name
        );

        // Navigate to the new space
        navigate(`/chat/${result.spaceIdBech32 || result.spaceId}`);
      } else {
        // Fallback: store locally if RPC fails
        console.warn('RPC failed, storing locally with generated ID');
        await storeSpaceKey(
          spaceId,
          spaceKey,
          userPublicKeyHex,
          0,
          name
        );
        navigate(`/chat/${spaceId}`);
      }

    } catch (err) {
      console.error('Failed to create private space:', err);
      setError(err instanceof Error ? err.message : 'Failed to create space');
    } finally {
      setCreating(false);
    }
  }, [embedded, keypair, publicKey, userPublicKeyHex, spaceName, storeSpaceKey, navigate, createSpace, createSpaceManaged, mineSpaceCreation]);

  // Standalone browser without an identity: needs a local one. In node mode (embedded)
  // the node owns the identity and does the crypto, so we render the form regardless of
  // the (absent) local keypair and create via the managed RPC.
  if (!publicKey && !embedded) {
    return (
      <div className="create-private-space">
        <div className="no-identity">
          <h1>Create Private Space</h1>
          <p>You need an identity to create private spaces.</p>
          <Link to="/identity" className="btn btn-primary">
            Create Identity
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="create-private-space">
      <header className="page-header">
        <Link to="/spaces" className="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </Link>
        <h1>Create Private Space</h1>
      </header>

      <form onSubmit={handleSubmit} className="create-form">
        <div className="form-group">
          <label htmlFor="spaceName">Space Name</label>
          <input
            type="text"
            id="spaceName"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            placeholder="e.g., Project Team, Gaming Group..."
            className="form-input"
            disabled={isCreating}
            autoFocus
            maxLength={100}
          />
          <small className="form-hint">
            Only members can see the space name (encrypted)
          </small>
        </div>

        <div className="privacy-notice">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            <strong>End-to-end encrypted</strong>
            <p>All content in this space will be encrypted with a key only members have access to.</p>
          </div>
        </div>

        {isMining && (
          <div className="mining-status" role="status" aria-live="polite">
            <div className="mining-spinner" />
            <p>Mining proof of work...</p>
            {miningProgress && (
              <div className="mining-stats">
                <span>Attempts: {miningProgress.attempts.toLocaleString()}</span>
                <span>Time: {(miningProgress.elapsedMs / 1000).toFixed(1)}s</span>
              </div>
            )}
            <button type="button" className="btn btn-ghost" onClick={cancelMining}>
              Cancel Mining
            </button>
          </div>
        )}

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        <div className="form-actions">
          <Link to="/spaces" className="btn btn-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isCreating || !spaceName.trim()}
          >
            {isMining ? 'Mining...' : isCreating ? 'Creating...' : 'Create Space'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreatePrivateSpace;
