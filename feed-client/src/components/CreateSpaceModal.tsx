/**
 * CreateSpaceModal - create a public space from the feed client.
 *
 * Public spaces were previously only creatable via the CLI / other clients;
 * the feed had no UI. Flow: sponsorship gate → SpaceCreation PoW (Argon2id) →
 * sign `space:<name>:<timestamp>` → create_space RPC. Mirrors publish-demo.js.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRpc } from '../hooks/useRpc';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { useSponsorship } from '../hooks/useSponsorship';
import { useActionPow, ActionType } from '../hooks/useActionPow';
import { solutionToRpcParams } from '../lib/action-pow';
import { PowProgress } from './PowProgress';
import { useToast } from './Toast';
import './CreateSpaceModal.css';

interface CreateSpaceModalProps {
  onClose: () => void;
  onCreated?: (spaceId: string) => void;
}

export function CreateSpaceModal({ onClose, onCreated }: CreateSpaceModalProps): JSX.Element {
  const navigate = useNavigate();
  const { rpc } = useRpc();
  const { publicKey, sign } = useFeedIdentity();
  const { isSponsored } = useSponsorship();
  const { mine, state: powState, progress, cancel, reset } = useActionPow();
  const { success, error: showError } = useToast();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setErr('Please enter a space name');
      return;
    }
    if (!publicKey || !sign) {
      setErr('No identity available');
      return;
    }
    if (isSponsored === false) {
      setErr('You need a sponsor before you can create a space — no proof-of-work is spent until then.');
      return;
    }

    setErr(null);
    setBusy(true);
    try {
      const pubkeyBytes = new Uint8Array(publicKey.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
      // Node computes content_hash = sha256(name); mine over the raw name.
      const solution = await mine(ActionType.SpaceCreation, new TextEncoder().encode(trimmed), pubkeyBytes, true);
      const pow = solutionToRpcParams(solution);

      // Sign the canonical create-space message (publish-demo.js contract).
      const sigBytes = await sign(new TextEncoder().encode(`space:${trimmed}:${pow.timestamp}`));
      if (!sigBytes) throw new Error('Failed to sign');
      const signatureHex = Array.from(sigBytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const result = await rpc!.createSpace({
        name: trimmed,
        creatorId: publicKey,
        powNonce: pow.pow_nonce,
        powDifficulty: pow.pow_difficulty,
        powNonceSpace: pow.pow_nonce_space,
        powHash: pow.pow_hash,
        signature: signatureHex,
        timestamp: pow.timestamp,
      });

      if (!result?.success || !result.space_id) {
        throw new Error('Space creation failed');
      }
      success(`Space "${trimmed}" created!`);
      onCreated?.(result.space_id);
      navigate(`/space/${result.space_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create space';
      setErr(msg);
      showError(msg);
    } finally {
      setBusy(false);
      reset();
    }
  }, [name, publicKey, sign, isSponsored, mine, rpc, success, showError, onCreated, navigate, reset]);

  return (
    <div className="create-space-overlay" onClick={onClose}>
      <div className="create-space-modal" onClick={e => e.stopPropagation()}>
        <h2 className="create-space-modal__title">Create a Space</h2>
        <p className="create-space-modal__hint">
          Public spaces are visible to everyone. Creating one requires a small
          proof-of-work.
        </p>

        <input
          type="text"
          className="create-space-modal__input"
          placeholder="Space name"
          value={name}
          maxLength={64}
          disabled={busy}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          autoFocus
        />

        {err && <div className="create-space-modal__error">{err}</div>}

        {powState === 'mining' ? (
          <PowProgress
            attempts={progress.attempts}
            elapsedMs={progress.elapsedMs}
            difficulty={0}
            onCancel={cancel}
          />
        ) : (
          <div className="create-space-modal__actions">
            <button type="button" className="create-space-modal__btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="create-space-modal__btn create-space-modal__btn--primary"
              onClick={handleCreate}
              disabled={busy || !name.trim()}
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
