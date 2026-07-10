/**
 * Create Private Channel Page
 *
 * Form for creating a new encrypted private channel (Discord-style).
 * Uses E2E encryption with X25519 key exchange.
 */

import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  useIdentityContext,
  wasm,
  generateSpaceKey,
  encryptSpaceKeyForRecipient,
  deriveX25519Keys,
  bytesToHex,
  hexToBytes,
  encryptSpaceName,
  solutionToRpcParams,
} from '@swimchain/frontend';
import { usePrivateChannelKeys } from '../hooks/usePrivateSpaceKeys';
import { useCreatePrivateChannel } from '../hooks/useRpc';
import { useChannelCreationPow } from '../hooks/useActionPow';
import { useToast } from '../components/Toast';
import { useChatIdentity } from '../hooks/useChatIdentity';
import './CreatePrivateChannel.css';

export function CreatePrivateChannel(): JSX.Element {
  const navigate = useNavigate();
  const { identity, hasValidIdentity } = useIdentityContext();
  // Node-wide centralized identity: in embedded (node) mode the seed lives in
  // the node and is never exposed to the client, so E2E private channels can't
  // work here. Standalone (browser) mode is unchanged.
  const { mode } = useChatIdentity();
  const userPublicKeyHex = identity?.publicKey;
  const { storeChannelKey } = usePrivateChannelKeys(userPublicKeyHex);
  const { createChannel, createChannelManaged, creating: rpcCreating, error: rpcError } = useCreatePrivateChannel();
  const { mineChannelCreation, state: miningState, progress: miningProgress, reset: resetMining } = useChannelCreationPow();
  const toast = useToast();

  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combined loading state
  const isCreating = creating || rpcCreating || miningState === 'mining';
  const displayError = error || rpcError;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const name = channelName.trim();
    if (!name) {
      setError('Please enter a channel name');
      return;
    }

    // Node-managed mode (desktop app): a private channel IS a private space, and the
    // node holds the seed and does all the crypto + PoW + signing. We send only the
    // plaintext name — no client-side keypair or E2E key handling needed.
    if (mode === 'node') {
      setCreating(true);
      setError(null);
      try {
        const result = await createChannelManaged({ name });
        if (!result?.channelId) {
          throw new Error('Channel creation failed: no channel ID returned');
        }
        toast.success('Private channel created successfully!');
        navigate(`/channels/${result.channelId}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create channel';
        setError(errorMsg);
        toast.error(errorMsg);
      } finally {
        setCreating(false);
      }
      return;
    }

    if (!identity?.seed || !userPublicKeyHex || !hasValidIdentity) {
      setError('No identity available');
      return;
    }

    setCreating(true);
    setError(null);
    resetMining();

    try {
      // Generate a new channel key (32-byte random key for AES-GCM)
      const channelKey = generateSpaceKey();

      // Generate a unique channel ID (hash of creator + timestamp + random)
      const timestamp = Date.now();
      const randomBytes = new Uint8Array(8);
      crypto.getRandomValues(randomBytes);
      const channelIdPreimage = `private:${userPublicKeyHex}:${timestamp}:${bytesToHex(randomBytes)}`;
      const channelIdHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(channelIdPreimage));
      const channelId = bytesToHex(new Uint8Array(channelIdHash).slice(0, 16));

      // Derive X25519 keys from Ed25519 seed
      const seedBytes = hexToBytes(identity.seed);
      const { secretKey: myX25519SecretKey, publicKey: myX25519PublicKey } = deriveX25519Keys(seedBytes);

      // Encrypt channel key for ourselves (so we can decrypt messages later)
      const encryptedKeyForSelf = encryptSpaceKeyForRecipient(
        channelKey,
        myX25519PublicKey,
        myX25519SecretKey
      );

      // Encrypt the channel name using the channel key
      const encryptedName = await encryptSpaceName(name, channelKey);

      // Mine PoW for channel creation
      const authorPubkeyBytes = hexToBytes(userPublicKeyHex);
      const powSolution = await mineChannelCreation(name, authorPubkeyBytes, true);
      const powParams = solutionToRpcParams(powSolution);

      // Sign the create channel request
      const keypair = wasm.WasmKeypair.fromSeed(seedBytes);
      const signatureMessage = new TextEncoder().encode(
        `create_private_space:${userPublicKeyHex}:${Math.floor(timestamp / 1000)}`
      );
      const signature = keypair.sign(signatureMessage);

      // Call create_private_space RPC
      const result = await createChannel({
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
        // Store the channel key locally for decryption
        await storeChannelKey(
          result.channelId,
          channelKey,
          userPublicKeyHex, // creator is the inviter
          0, // key version
          name
        );

        toast.success('Private channel created successfully!');
        // Navigate to the new channel
        navigate(`/chat/${result.channelIdBech32 || result.channelId}`);
      } else {
        // Fallback: store locally if RPC fails
        console.warn('[CreatePrivateChannel] RPC failed, storing locally with generated ID');
        await storeChannelKey(
          channelId,
          channelKey,
          userPublicKeyHex,
          0,
          name
        );
        toast.success('Private channel created locally.');
        navigate(`/chat/${channelId}`);
      }

    } catch (err) {
      console.error('[CreatePrivateChannel] Failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create channel';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setCreating(false);
    }
  }, [mode, identity, userPublicKeyHex, hasValidIdentity, channelName, storeChannelKey, navigate, createChannel, createChannelManaged, mineChannelCreation, resetMining, toast]);

  // No identity - prompt to create one (browser mode only). In node mode the node
  // holds the identity, so we skip this gate and render the form directly.
  if (mode !== 'node' && (!identity || !hasValidIdentity)) {
    return (
      <div className="create-private-channel">
        <div className="no-identity">
          <h1>Create Private Channel</h1>
          <p>You need an identity to create private channels.</p>
          <Link to="/identity" className="btn btn-primary">
            Create Identity
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="create-private-channel">
      <header className="page-header">
        <Link to="/" className="back-link">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </Link>
        <h1>Create Private Channel</h1>
      </header>

      <form onSubmit={handleSubmit} className="create-form">
        <div className="form-group">
          <label htmlFor="channelName">Channel Name</label>
          <input
            type="text"
            id="channelName"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="e.g., project-team, gaming-squad..."
            className="form-input"
            disabled={isCreating}
            autoFocus
            maxLength={100}
          />
          <small className="form-hint">
            Only members can see the channel name (encrypted)
          </small>
        </div>

        <div className="privacy-notice">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            <strong>End-to-end encrypted</strong>
            <p>All messages in this channel will be encrypted. Only members with the key can read them.</p>
          </div>
        </div>

        {miningState === 'mining' && (
          <div className="mining-progress">
            <div className="mining-spinner" />
            <span>Mining proof of work... ({miningProgress.attempts.toLocaleString()} attempts)</span>
          </div>
        )}

        {displayError && (
          <div className="form-error">
            {displayError}
          </div>
        )}

        <div className="form-actions">
          <Link to="/" className="btn btn-ghost">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isCreating || !channelName.trim()}
          >
            {isCreating ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreatePrivateChannel;
