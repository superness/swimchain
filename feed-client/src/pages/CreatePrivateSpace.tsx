/**
 * Create Private Space Page
 *
 * Form for creating a new encrypted private space for the feed.
 */

import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { useCreatePrivateSpace } from '../hooks/useRpc';
import { useToast } from '../components/Toast';
import { generateSpaceKey, encryptSpaceKeyForRecipient, deriveX25519Keys, bytesToHex, hexToBytes } from '../lib/x25519';
import { encryptSpaceName } from '../lib/encryption';
import { useActionPow } from '../hooks/useActionPow';
import { ActionType } from '../lib/action-pow';
import './CreatePrivateSpace.css';

export function CreatePrivateSpace(): JSX.Element {
  const navigate = useNavigate();
  const { publicKey, keypair } = useStoredKeypair();
  const userPublicKeyHex = publicKey ? bytesToHex(publicKey) : undefined;
  const { storeSpaceKey } = usePrivateSpaceKeys(userPublicKeyHex);
  const { createSpace, creating: rpcCreating } = useCreatePrivateSpace();
  const { mine: minePow } = useActionPow();
  const { success, error: showError } = useToast();

  const [spaceName, setSpaceName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state
  const isCreating = creating || rpcCreating;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!keypair || !publicKey || !userPublicKeyHex) {
      setError('No identity available');
      return;
    }

    const name = spaceName.trim();
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

      // Mine real PoW for space creation
      const powContent = new TextEncoder().encode(
        `create_private_space:${userPublicKeyHex}:${timestamp}`
      );
      const authorPubkey = hexToBytes(userPublicKeyHex);
      const powSolution = await minePow(ActionType.SpaceCreation, powContent, authorPubkey, true);

      const powParams = {
        pow_nonce: Number(powSolution.nonce),
        pow_difficulty: powSolution.challenge.difficulty,
        pow_nonce_space: Array.from(powSolution.challenge.nonceSpace)
          .map((b: number) => b.toString(16).padStart(2, '0')).join(''),
        pow_hash: Array.from(powSolution.hash)
          .map((b: number) => b.toString(16).padStart(2, '0')).join(''),
        timestamp: powSolution.challenge.timestamp,
      };

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
        timestamp: powParams.timestamp,
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

        success('Private space created!');
        // Navigate to the new space
        navigate(`/space/${result.spaceId}`);
      } else {
        throw new Error('RPC returned empty result - private space creation failed');
      }

    } catch (err) {
      console.error('Failed to create private space:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to create space';
      setError(errMsg);
      showError(errMsg);
    } finally {
      setCreating(false);
    }
  }, [keypair, publicKey, userPublicKeyHex, spaceName, storeSpaceKey, navigate, createSpace, success, showError]);

  if (!publicKey) {
    return (
      <div className="create-private-space">
        <div className="no-identity">
          <div className="no-identity__icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
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
        <Link to="/discover" className="back-link">
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

        <div className="form-group">
          <label htmlFor="description">Description (optional)</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this space for?"
            className="form-textarea"
            disabled={isCreating}
            rows={3}
            maxLength={500}
          />
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

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        <div className="form-actions">
          <Link to="/discover" className="btn btn-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isCreating || !spaceName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Space'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreatePrivateSpace;
