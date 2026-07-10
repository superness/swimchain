/**
 * JoinPrivateSpace — redeem a `swiminv1:...` invite code to join a private space.
 *
 * Node-managed only: the node unwraps the space key from the blob (proving the invite
 * is for this identity) and stores membership locally, so the space then works like any
 * private space the user created. Shown in Discover.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useSpaceInvites } from '../hooks/useRpc';
import { useToast } from './Toast';

export function JoinPrivateSpace(): JSX.Element | null {
  const { mode } = useIdentityContext();
  const { redeem } = useSpaceInvites();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const [blob, setBlob] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = useCallback(async () => {
    const code = blob.trim();
    if (!code) return;
    setJoining(true);
    try {
      const { spaceId, name } = await redeem(code);
      success(`Joined ${name || 'private space'}`);
      setBlob('');
      navigate(`/space/${spaceId}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not redeem this invite');
    } finally {
      setJoining(false);
    }
  }, [blob, redeem, navigate, success, showError]);

  // Only meaningful in the desktop (node-managed) app; browser invites use their own flow.
  if (mode !== 'node') return null;

  return (
    <section className="discover-section">
      <h2 className="discover-section__title">Join a private space</h2>
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
        style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
      />
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
