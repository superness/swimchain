/**
 * Space view page showing threads in a space
 * Uses RPC to fetch real threads from the node
 */

import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSpaceThreads, useSpaces } from '../hooks/useRpc';
import { useBlocklist } from '../hooks/useBlocklist';
import type { Thread } from '../types';
import './SpaceView.css';

type SortOption = 'newest' | 'oldest' | 'active' | 'replies';

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function ThreadCard({ thread }: { thread: Thread }): JSX.Element {
  const decayClass = thread.decay?.state === 'protected' ? 'thread-card--protected' :
                     thread.decay?.state === 'stale' ? 'thread-card--stale' :
                     thread.decay?.state === 'decayed' ? 'thread-card--decayed' : '';

  return (
    <Link
      to={`/post/${thread.id}`}
      className={`thread-card ${decayClass}`}
    >
      <div className="thread-card__content">
        <h3 className="thread-card__title">
          {thread.title || '(Untitled)'}
        </h3>
        {thread.content && (
          <p className="thread-card__excerpt">
            {thread.content.length > 150
              ? thread.content.substring(0, 150) + '...'
              : thread.content
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

  const { isPostBlocked, isUserBlocked } = useBlocklist();

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
          <h1>Error Loading Space</h1>
          <p>{error}</p>
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
        <Link
          to={`/compose?space=${spaceId}`}
          className="btn btn-primary"
        >
          New Post
        </Link>
      </header>

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
              <ThreadCard key={thread.id} thread={thread} />
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
