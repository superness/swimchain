/**
 * JoinPrivateSpace — redeem a `swiminv1:...` invite code to join a private space.
 *
 * Node-managed only (desktop shell): the node unwraps the space key from the blob and
 * stores membership locally, so the space then works like any private space the user
 * created. Gated on isInIframe(); hidden in the standalone browser build.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpaceInvites } from '../hooks/useRpc';
import { isInIframe } from '../hooks/useParentRpcConfig';

export function JoinPrivateSpace(): JSX.Element | null {
  const { redeem } = useSpaceInvites();
  const navigate = useNavigate();
  const [blob, setBlob] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    const code = blob.trim();
    if (!code) return;
    setJoining(true);
    setError(null);
    try {
      const { spaceId, spaceIdBech32 } = await redeem(code);
      setBlob('');
      // ChatView (/chat/:spaceId) resolves either form from the node's space list.
      navigate(`/chat/${spaceIdBech32 ?? spaceId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not redeem this invite');
    } finally {
      setJoining(false);
    }
  }, [blob, redeem, navigate]);

  // Only meaningful in the desktop (node-managed) app.
  if (!isInIframe()) return null;

  return (
    <section className="join-private-space card">
      <h2>Join a private space</h2>
      <p className="form-hint" style={{ marginBottom: '0.5rem' }}>
        Paste an invite code (starts with <code>swiminv1:</code>) someone shared with you.
      </p>
      <textarea
        className="form-textarea"
        value={blob}
        onChange={(e) => setBlob(e.target.value)}
        placeholder="swiminv1:…"
        rows={3}
        disabled={joining}
        style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', width: '100%' }}
      />
      {error && <p className="error-message">{error}</p>}
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleJoin}
        disabled={joining || !blob.trim()}
        style={{ marginTop: '0.5rem' }}
      >
        {joining ? 'Joining…' : 'Join'}
      </button>
    </section>
  );
}

export default JoinPrivateSpace;
