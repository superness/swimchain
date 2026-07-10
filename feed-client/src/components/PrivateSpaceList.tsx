/**
 * Private Space List Component
 *
 * Displays private spaces the user is a member of, with links to view them.
 * Shows pending invites and provides create/invite actions.
 */

import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePrivateSpaceKeys } from '../hooks/usePrivateSpaceKeys';
import { usePrivateSpaces } from '../hooks/useRpc';
import { useFeedIdentity } from '../hooks/useFeedIdentity';
import { useIdentityContext } from '../providers/IdentityProvider';
import './PrivateSpaceList.css';

export function PrivateSpaceList(): JSX.Element | null {
  const { identity } = useIdentityContext();
  const { mode, publicKey: nodePublicKey } = useFeedIdentity();
  const nodeMode = mode === 'node';

  // Source of truth differs by mode: in node mode the node holds membership
  // (managed create/redeem never touch IndexedDB), so read it from the node RPC.
  // In browser mode the space keys + names live in IndexedDB. Both hooks are
  // called unconditionally (rules of hooks); each bails when its id is absent.
  const { listMyPrivateSpaces, loading: browserLoading } = usePrivateSpaceKeys(nodeMode ? undefined : identity?.publicKey);
  const { spaces: nodeSpaces, loading: nodeLoading } = usePrivateSpaces(nodeMode ? (nodePublicKey ?? undefined) : undefined);
  const location = useLocation();

  const loading = nodeMode ? nodeLoading : browserLoading;

  // Map spaces with display names. Node mode: name is node-decrypted; navigate by
  // the hex space id (the node accepts it for list + decrypt). Browser mode: the
  // decrypted spaceName is stored in IndexedDB.
  const spaces = useMemo(() => {
    if (nodeMode) {
      return nodeSpaces.map((s) => ({
        spaceId: s.spaceId,
        name: s.name || `Space ${s.spaceId.substring(0, 12)}...`,
        joinedAt: s.joinedAt,
        invitedBy: '',
      }));
    }
    return listMyPrivateSpaces.map((space) => ({
      spaceId: space.spaceId,
      name: space.spaceName || `Space ${space.spaceId.substring(0, 12)}...`,
      joinedAt: space.joinedAt,
      invitedBy: space.invitedBy,
    }));
  }, [nodeMode, nodeSpaces, listMyPrivateSpaces]);

  // Don't render if there's no usable identity in the active mode.
  if (nodeMode ? !nodePublicKey : !identity) return null;

  if (loading) {
    return (
      <div className="private-space-list">
        <div className="private-space-list-loading">Loading private spaces...</div>
      </div>
    );
  }

  return (
    <div className="private-space-list">
      <div className="section-header">
        <h3 className="section-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Private Spaces
        </h3>
        <Link to="/create-private-space" className="btn-create-space" title="Create Private Space">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </Link>
      </div>

      {spaces.length === 0 ? (
        <div className="spaces-empty">
          <p>No private spaces yet.</p>
          <Link to="/create-private-space" className="btn btn-sm btn-primary">
            Create One
          </Link>
        </div>
      ) : (
        <ul className="space-list">
          {spaces.map((space) => (
            <li key={space.spaceId} className="space-item">
              <Link
                to={`/space/${space.spaceId}`}
                className={`space-link ${location.pathname === `/space/${space.spaceId}` ? 'active' : ''}`}
              >
                <span className="space-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <span className="space-name">{space.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
