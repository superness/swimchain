/**
 * Space view page showing threads in a space
 * Uses RPC to fetch real threads from the node
 */

import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSpaceThreads, useSpaces, usePrivateContent, usePrivateSpaceIds, isPrivateCiphertext, stripTitleSeparator } from '../hooks/useRpc';
import { humanizeRpcError } from '../lib/rpc';
import { useIdentityContext } from '../providers/IdentityProvider';
import { useBlocklist } from '../hooks/useBlocklist';
import { InviteModal } from '../components/InviteModal';
import type { Thread } from '../types';
import './SpaceView.css';

/** Split a decrypted `title\n\nbody` payload back into title + body. */
function splitPrivate(decrypted: string): { title: string; body: string } {
  const i = decrypted.indexOf('\n\n');
  return i === -1 ? { title: '', body: decrypted } : { title: decrypted.slice(0, i), body: decrypted.slice(i + 2) };
}

type SortOption = 'newest' | 'oldest' | 'active' | 'replies';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function ThreadCard({ thread, decrypted }: { thread: Thread; decrypted?: { title: string; body: string } }): JSX.Element {
  const decayClass = thread.decay?.state === 'protected' ? 'thread-card--protected' :
                     thread.decay?.state === 'stale' ? 'thread-card--stale' :
                     thread.decay?.state === 'decayed' ? 'thread-card--decayed' : '';

  // Prefer node-decrypted content for private posts; fall back to raw fields.
  const displayTitle = decrypted?.title || thread.title;
  // The node stores bodies as `title\n\nbody`; strip the prefix or the title
  // renders twice (once as the card header, again as the excerpt's first line).
  const displayBody = decrypted?.body ?? stripTitleSeparator(thread.content ?? '');
  const stillEncrypted = !decrypted && isPrivateCiphertext(thread.content);

  return (
    <Link
      to={`/post/${thread.id}`}
      className={`thread-card ${decayClass}`}
    >
      <div className="thread-card__content">
        <h3 className="thread-card__title">
          {displayTitle || (stillEncrypted ? '🔒 Encrypted' : '(Untitled)')}
        </h3>
        {displayBody && !stillEncrypted && (
          <p className="thread-card__excerpt">
            {displayBody.length > 150
              ? displayBody.substring(0, 150) + '...'
              : displayBody
            }
          </p>
        )}
        {thread.pending && (
          <span className="thread-card__pending">Pending</span>
        )}
      </div>
      <div className="thread-card__meta">
        <span className="thread-card__author">
          {thread.displayName || thread.author.substring(0, 8) + '...'}
        </span>
        <span className="thread-card__time">{formatTimeAgo(thread.createdAt)}</span>
        <span className="thread-card__replies">
          {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
        </span>
      </div>
    </Link>
  );
}

export function SpaceView(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { spaces } = useSpaces();
  const { mode, identity } = useIdentityContext();
  const { decryptForSpace } = usePrivateContent();
  const privateSpaceIds = usePrivateSpaceIds(identity?.publicKey);
  const isPrivate = mode === 'node' && !!spaceId && privateSpaceIds.has(spaceId);

  const { isPostBlocked, isUserBlocked } = useBlocklist();

  // Node-decrypted private posts, keyed by thread id (node-managed mode only).
  const [decryptedThreads, setDecryptedThreads] = useState<Record<string, { title: string; body: string }>>({});
  const [showInvite, setShowInvite] = useState(false);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const threadsPerPage = 20;

  // Calculate offset for server-side pagination
  const offset = (page - 1) * threadsPerPage;

  // Fetch threads with server-side pagination
  const { threads: rpcThreads, loading, error, fetching, total, refetch } = useSpaceThreads(
    spaceId || '',
    { offset, limit: threadsPerPage }
  );

  // Filter blocked threads and sort (client-side sorting within the page)
  const threads = useMemo(() => {
    if (!rpcThreads || rpcThreads.length === 0) return [];

    return [...rpcThreads]
      .filter(t => !isPostBlocked(t.id) && !isUserBlocked(t.author))
      .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.createdAt - a.createdAt;
        case 'oldest':
          return a.createdAt - b.createdAt;
        case 'replies':
          return b.replyCount - a.replyCount;
        case 'active':
          return b.lastEngagement - a.lastEngagement;
        default:
          return b.createdAt - a.createdAt;
      }
    });
  }, [rpcThreads, sortBy, isPostBlocked, isUserBlocked]);

  // Decrypt private-space posts via the node (node-managed mode). Runs whenever new
  // encrypted threads appear; each result is cached by thread id so we don't re-decrypt.
  useEffect(() => {
    if (mode !== 'node' || !spaceId) return;
    const pending = threads.filter(t => isPrivateCiphertext(t.content) && !decryptedThreads[t.id]);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { title: string; body: string }> = {};
      for (const t of pending) {
        const plain = await decryptForSpace(spaceId, stripTitleSeparator(t.content as string));
        if (plain != null) updates[t.id] = splitPrivate(plain);
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setDecryptedThreads(prev => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
  }, [threads, mode, spaceId, decryptForSpace, decryptedThreads]);

  // Use server-side total for pagination
  const totalPages = Math.ceil(total / threadsPerPage);

  // Get space name from spaces list, fallback to truncated ID
  const spaceName = useMemo(() => {
    if (!spaceId) return 'Unknown Space';
    const space = spaces.find(s => s.id === spaceId);
    return space?.name ?? `Space ${spaceId.substring(0, 12)}...`;
  }, [spaceId, spaces]);

  if (loading) {
    return (
      <div className="space-view">
        <div className="space-view__loading">Loading threads...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-view">
        <div className="space-view__error">
          <h1>Couldn't load this space</h1>
          <p>{humanizeRpcError(error)}</p>
          <button onClick={() => refetch()} className="btn btn-primary">
            Retry
          </button>
          <Link to="/discover" className="btn btn-secondary" style={{ marginLeft: '1rem' }}>
            Browse Spaces
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-view">
      <header className="space-view__header">
        <div className="space-view__info">
          <h1>{spaceName}</h1>
          <p className="space-view__description">
            {total} post{total !== 1 ? 's' : ''} in this space
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isPrivate && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowInvite(true)}
            >
              Invite
            </button>
          )}
          <Link
            to={`/compose?space=${spaceId}`}
            className="btn btn-primary"
          >
            New Post
          </Link>
        </div>
      </header>

      {isPrivate && (
        <InviteModal
          isOpen={showInvite}
          onClose={() => setShowInvite(false)}
          spaceId={spaceId || ''}
          spaceName={spaceName}
        />
      )}

      <div className="space-view__controls">
        <div className="space-view__sort">
          <label htmlFor="sort-select">Sort by:</label>
          <select
            id="sort-select"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              setPage(1);
            }}
            className="space-view__sort-select"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="active">Most Active</option>
            <option value="replies">Most Replies</option>
          </select>
        </div>
        <span className="space-view__count">
          {threads.length} thread{threads.length !== 1 ? 's' : ''}
          {fetching && <span className="space-view__fetching"> (fetching from network...)</span>}
        </span>
      </div>

      {threads.length > 0 ? (
        <>
          <div className="space-view__threads">
            {threads.map(thread => (
              <ThreadCard key={thread.id} thread={thread} decrypted={decryptedThreads[thread.id]} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="space-view__pagination">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <span className="space-view__page-info">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="space-view__empty">
          <p>No threads in this space yet.</p>
          <p>Be the first to start a discussion!</p>
          <Link to={`/compose?space=${spaceId}`} className="btn btn-primary">
            Create Thread
          </Link>
        </div>
      )}
    </div>
  );
}
