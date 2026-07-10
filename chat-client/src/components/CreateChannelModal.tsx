/**
 * CreateChannelModal — create a channel (thread) inside a server (space).
 *
 * In Swimchain terms a "channel" is a top-level Post in the space and messages are
 * replies to it, so a freshly created private space has no channel to talk in until
 * one is made here. Works in BOTH modes: it mines the Post PoW client-side and signs
 * via the unified `useChatIdentity().sign` (the node's sign_message RPC in node mode,
 * the local keypair in browser mode). The node accepts either space-id form.
 */

import { useState, useCallback } from 'react';
import { hexToBytes, solutionToRpcParams } from '@swimchain/frontend';
import { useCreateChannel } from '../hooks/useChannels';
import { usePostPow } from '../hooks/useActionPow';
import { useChatIdentity } from '../hooks/useChatIdentity';
import { useIsSponsored } from '../hooks/useIsSponsored';
import { useToast } from './Toast';
import './InviteModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  onCreated: (channelId: string) => void;
}

export function CreateChannelModal({ isOpen, onClose, serverId, onCreated }: CreateChannelModalProps): JSX.Element | null {
  const { identity, sign, publicKeyBytes, hasIdentity } = useChatIdentity();
  const { createChannel, creating } = useCreateChannel();
  const { minePost, state: miningState, progress, cancel } = usePostPow();
  const isSponsored = useIsSponsored();
  const toast = useToast();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = creating || miningState === 'mining';

  const handleClose = useCallback(() => {
    if (busy) return;
    setName('');
    setError(null);
    onClose();
  }, [busy, onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const channelName = name.trim();
    if (!channelName) {
      setError('Please enter a channel name');
      return;
    }
    if (!hasIdentity || !identity?.publicKey) {
      setError('No identity available');
      return;
    }
    // Gate on sponsorship BEFORE mining — the node rejects channel creation from
    // unsponsored identities (SPEC_11), so mining first only wastes the user's time.
    if (isSponsored === false) {
      setError('You need a sponsor before you can create a channel. Redeem an invite or request sponsorship first — no proof-of-work is spent until then.');
      return;
    }
    setError(null);
    try {
      const authorPubkey = publicKeyBytes ?? hexToBytes(identity.publicKey);
      // A channel is a Post with title=name and an empty body. The node binds PoW to
      // sha256(`${title}\n\n${body}`), so mine over exactly that content.
      const solution = await minePost(`${channelName}\n\n`, authorPubkey, true);
      const powParams = solutionToRpcParams(solution);
      // The unified signer may resolve null if signing is unavailable; surface that
      // as an error rather than submitting an unsigned channel.
      const signOrThrow = async (msg: Uint8Array): Promise<Uint8Array> => {
        const sig = await sign(msg);
        if (!sig) throw new Error('Signing is unavailable — is your identity ready?');
        return sig;
      };
      const result = await createChannel(serverId, channelName, identity.publicKey, signOrThrow, powParams);
      if (result.success && result.channelId) {
        toast.success('Channel created');
        setName('');
        onCreated(result.channelId);
        onClose();
      } else {
        setError('Could not create the channel. You may need a sponsor before you can post.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    }
  }, [name, hasIdentity, identity, publicKeyBytes, isSponsored, minePost, createChannel, serverId, sign, toast, onCreated, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-content invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-channel-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="create-channel-title">Create a channel</h2>
          <button type="button" className="modal-close" onClick={handleClose} aria-label="Close" disabled={busy}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <form className="invite-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="create-channel-name">Channel name</label>
            <input
              id="create-channel-name"
              className="form-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="general"
              maxLength={64}
              autoFocus
              disabled={busy}
            />
          </div>

          {miningState === 'mining' && (
            <p className="form-hint">Mining proof-of-work… {Math.round(progress.elapsedMs / 1000)}s</p>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="modal-actions">
            {miningState === 'mining' ? (
              <button type="button" className="btn btn-secondary" onClick={cancel}>
                Cancel mining
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Create'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
