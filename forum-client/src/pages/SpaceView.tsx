/**
 * Space view page showing threads in a space
 * Uses RPC to fetch real threads from the node
 */

import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePreferences } from '../hooks/usePreferences';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useSpaceThreads, useSpaces } from '../hooks/useRpc';
import { useSpaceLineage } from '../hooks/useLineage';
import { ThreadList } from '../components/ThreadList';
import { ThreadSortControls } from '../components/ThreadSortControls';
import { Pagination } from '../components/Pagination';
import { LineageBreadcrumbs } from '../components/LineageBreadcrumbs';
import { GrewOutOfNote } from '../components/ContinuityBanner';
import type { ThreadSortOption } from '../types';
import './SpaceView.css';

export function SpaceView(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const { spaces } = useSpaces();
  const { preferences, updatePreference } = usePreferences();
  const { setItems } = useKeyboardNavigation();

  // Behavioral-branching lineage for this space (SPEC_13, Phase 2). Empty/absent
  // when the space has no parent/children — breadcrumbs & pointers stay hidden.
  const lineage = useSpaceLineage(spaceId);

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<ThreadSortOption>(preferences.threadOrdering);

  // Calculate offset for server-side pagination
  const offset = (page - 1) * preferences.threadsPerPage;
  const limit = preferences.threadsPerPage;

  // Fetch threads with server-side pagination
  const { threads: rpcThreads, loading, error, fetching, total, refetch } = useSpaceThreads(
    spaceId || '',
    { offset, limit }
  );

  // Sort threads from RPC (client-side sorting within the page)
  const threads = useMemo(() => {
    if (!rpcThreads || rpcThreads.length === 0) return [];

    return [...rpcThreads].sort((a, b) => {
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
          return b.createdAt - a.createdAt; // Default to newest
      }
    });
  }, [rpcThreads, sortBy]);

  // Use server-side total for pagination
  const totalPages = Math.ceil(total / preferences.threadsPerPage);

  // Update keyboard navigation items
  useEffect(() => {
    if (spaceId) {
      setItems(
        threads.map((t) => `/spaces/${spaceId}/thread/${t.id}`)
      );
    }
  }, [threads, spaceId, setItems]);

  // Handle sort change
  const handleSortChange = (newSort: ThreadSortOption) => {
    setSortBy(newSort);
    updatePreference('threadOrdering', newSort);
    setPage(1);
  };

  // Get space name from spaces list, fallback to truncated ID
  const spaceName = useMemo(() => {
    if (!spaceId) return 'Unknown Space';
    const space = spaces.find(s => s.id === spaceId);
    return space?.name ?? `Space ${spaceId.substring(0, 12)}...`;
  }, [spaceId, spaces]);

  if (loading) {
    return (
      <div className="space-view">
        <div className="loading-state">Loading threads...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-view">
        <div className="error-state">
          <h1>Error Loading Space</h1>
          <p>{error}</p>
          <button onClick={refetch} className="btn btn-primary">
            Retry
          </button>
          <Link to="/spaces" className="btn btn-secondary" style={{ marginLeft: '1rem' }}>
            Browse Spaces
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-view">
      <header className="space-header">
        <div className="space-info">
          <LineageBreadcrumbs ancestors={lineage.ancestors} currentName={spaceName} />
          <h1>{spaceName}</h1>
          {lineage.parent && (
            <GrewOutOfNote parentSpaceId={lineage.parent.id} parentSpaceName={lineage.parent.name} />
          )}
          <p className="space-description">
            {total} post{total !== 1 ? 's' : ''} in this space
          </p>
        </div>
        <Link
          to={`/spaces/${spaceId}/new`}
          className="btn btn-primary"
          id="new-thread-button"
        >
          New Thread
        </Link>
      </header>

      <div className="space-controls">
        <ThreadSortControls value={sortBy} onChange={handleSortChange} />
        <span className="thread-count">
          {threads.length} thread{threads.length !== 1 ? 's' : ''}
          {fetching && <span className="fetching-indicator"> (fetching from network...)</span>}
        </span>
      </div>

      {threads.length > 0 ? (
        <>
          <ThreadList threads={threads} spaceId={spaceId || ''} movedThreads={lineage.movedThreads} />
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
            />
          )}
        </>
      ) : (
        <div className="no-threads card">
          <p>No threads in this space yet.</p>
          <p>Be the first to start a discussion!</p>
        </div>
      )}
    </div>
  );
}
