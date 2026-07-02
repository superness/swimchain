import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStoredKeypair } from '../hooks/useStoredKeypair';
import { usePrivateSpaces, usePendingDMRequests, useAcceptDM, useDeclineDM } from '../hooks/useRpc';
import { bytesToHex } from '../lib/x25519';
import './DmInbox.css';

function truncateAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return Math.floor(diff / 604800) + 'w ago';
}

export function DmInbox() {
  const navigate = useNavigate();
  const { publicKey } = useStoredKeypair();
  const userPublicKeyHex = useMemo(() => publicKey ? bytesToHex(publicKey) : null, [publicKey]);
  const { spaces: allPrivateSpaces, loading: spacesLoading } = usePrivateSpaces(userPublicKeyHex ?? undefined);
  const { requests: pendingRequests, refetch: refetchRequests } = usePendingDMRequests(userPublicKeyHex ?? undefined);
  const { accept, accepting } = useAcceptDM();
  const { decline, declining } = useDeclineDM();

  const dmSpaces = useMemo(() => {
    return (allPrivateSpaces ?? []).filter(s => s.memberCount <= 2 || (s.encryptedName ?? '').indexOf('<>') >= 0);
  }, [allPrivateSpaces]);

  const handleAcceptDm = async (requester: string) => {
    if (!userPublicKeyHex) return;
    const timestamp = Math.floor(Date.now() / 1000);
    const result = await accept({ requester, acceptor: userPublicKeyHex, keyShare: '', signature: '', timestamp });
    if (result) { refetchRequests(); navigate('/dm/' + result.spaceId); }
  };

  const handleDeclineDm = async (requester: string) => {
    if (!userPublicKeyHex) return;
    const timestamp = Math.floor(Date.now() / 1000);
    await decline({ requester, decliner: userPublicKeyHex, signature: '', timestamp });
    refetchRequests();
  };

  return (
    <div className="dm-inbox">
      <header className="dm-inbox__header">
        <h1 className="dm-inbox__title">Messages</h1>
        <Link to="/dm/new" className="btn btn-primary btn-sm">New Message</Link>
      </header>
      {pendingRequests.length > 0 && (
        <section className="dm-inbox__section">
          <h2 className="dm-inbox__section-title">Pending Requests (' + pendingRequests.length + ')</h2>
          <div className="dm-inbox__list">
            {pendingRequests.map(req => (
              <div key={req.requestHash} className="dm-inbox__item dm-inbox__item--pending">
                <div className="dm-inbox__item-avatar">{req.requester.substring(0, 2).toUpperCase()}</div>
                <div className="dm-inbox__item-info">
                  <span className="dm-inbox__item-name">{truncateAddr(req.requester)}</span>
                  <span className="dm-inbox__item-preview">Wants to start a conversation</span>
                </div>
                <div className="dm-inbox__item-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => handleAcceptDm(req.requester)} disabled={accepting}>Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDeclineDm(req.requester)} disabled={declining}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="dm-inbox__section">
        <h2 className="dm-inbox__section-title">Conversations (' + dmSpaces.length + ')</h2>
        {spacesLoading ? (<div className="dm-inbox__loading">Loading...</div>)
          : dmSpaces.length === 0 ? (
          <div className="dm-inbox__empty">
            <h3>No conversations yet</h3>
            <p>Search for users in Discover to start a conversation.</p>
            <Link to="/discover" className="btn btn-primary">Find Users</Link>
          </div>
        ) : (
          <div className="dm-inbox__list">
            {dmSpaces.map(space => (
              <Link key={space.spaceId} to={'/dm/' + space.spaceId} className="dm-inbox__item">
                <div className="dm-inbox__item-avatar">#</div>
                <div className="dm-inbox__item-info">
                  <span className="dm-inbox__item-name">{space.encryptedName ? truncateAddr(space.encryptedName) : 'Space ' + truncateAddr(space.spaceId)}</span>
                  <span className="dm-inbox__item-preview">{space.memberCount} member(s) Joined {formatTimeAgo(space.joinedAt)}</span>
                </div>
                <span className="dm-inbox__item-arrow">&rsaquo;</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
