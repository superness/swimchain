/**
 * Community view (SPEC_13, Phase 2 — Lane B).
 *
 * Communities are deliberately NOT top-level spaces: their threads physically
 * live in the parent space (thread pointers were reassigned by the fracture;
 * block data never moved). This view renders the community as the PARENT
 * space's thread list filtered to the community's moved_threads (from
 * get_space_lineage), titled with the community's full_name, with a
 * "grew out of <parent>" note. Route: /spaces/:spaceId/community/:communityId
 * where :spaceId is the parent.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRpc, useThreadsByIds } from '../hooks/useRpc';
import { isMethodNotFoundError, type SpaceChildInfo } from '../lib/rpc';
import { ThreadList } from '../components/ThreadList';
import { LineageBreadcrumbs } from '../components/LineageBreadcrumbs';
import { GrewOutOfNote } from '../components/ContinuityBanner';
import { formatRelativeTime } from '../utils/time';
import { logger } from '../lib/logger';
import './CommunityView.css';

export function CommunityView(): JSX.Element {
  const { spaceId, communityId } = useParams<{ spaceId: string; communityId: string }>();
  const { rpc, connected, authReady } = useRpc();

  const [community, setCommunity] = useState<SpaceChildInfo | null>(null);
  const [parentName, setParentName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!rpc || !connected || !authReady || !spaceId || !communityId) return;
    let cancelled = false;
    setLoading(true);
    setUnavailable(false);

    (async () => {
      try {
        const res = await rpc.getSpaceLineage(spaceId);
        if (cancelled) return;
        setParentName(res.name);
        const match = (res.children ?? []).find((c) => c.community_id === communityId) ?? null;
        setCommunity(match);
        if (!match) {
          logger.warn('[CommunityView] Community not found in parent lineage', { spaceId, communityId });
        }
      } catch (err) {
        if (cancelled) return;
        if (isMethodNotFoundError(err)) {
          logger.info('[CommunityView] get_space_lineage not available on this node');
        } else {
          logger.warn('[CommunityView] get_space_lineage failed', err);
        }
        setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, authReady, spaceId, communityId]);

  const movedThreadIds = useMemo(() => community?.moved_threads ?? [], [community]);
  const { threads, loading: threadsLoading } = useThreadsByIds(movedThreadIds);

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => b.lastEngagement - a.lastEngagement),
    [threads],
  );

  if (loading) {
    return (
      <div className="community-view">
        <div className="loading-state">Loading community...</div>
      </div>
    );
  }

  if (unavailable || !community || !spaceId) {
    return (
      <div className="community-view">
        <div className="community-missing card">
          <h1>Community not found</h1>
          <p>
            This community isn't known to your node yet — it may still be syncing.
            Its conversations remain fully available in the parent space.
          </p>
          <Link to={spaceId ? `/spaces/${spaceId}` : '/spaces'} className="btn btn-primary">
            {spaceId ? 'Open parent space' : 'Browse spaces'}
          </Link>
        </div>
      </div>
    );
  }

  const title = community.full_name || community.name;

  return (
    <div className="community-view">
      <header className="space-header">
        <div className="space-info">
          <LineageBreadcrumbs
            ancestors={[{ id: spaceId, name: parentName || 'parent space' }]}
            currentName={title}
          />
          <h1>{title}</h1>
          <GrewOutOfNote parentSpaceId={spaceId} parentSpaceName={parentName || 'its parent space'} />
          <p className="space-description">
            {community.formed_at ? <>Formed {formatRelativeTime(community.formed_at)} · </> : null}
            {community.founding_member_count} founding member{community.founding_member_count !== 1 ? 's' : ''}
            {typeof community.thread_count === 'number'
              ? <> · {community.thread_count} thread{community.thread_count !== 1 ? 's' : ''}</>
              : null}
          </p>
        </div>
      </header>

      {threadsLoading && sortedThreads.length === 0 ? (
        <div className="loading-state">Loading threads...</div>
      ) : sortedThreads.length > 0 ? (
        // Threads live in the PARENT space, so links route through it.
        <ThreadList threads={sortedThreads} spaceId={spaceId} />
      ) : (
        <div className="no-threads card">
          <p>No threads to show here yet.</p>
          <p>
            This community's conversations live in{' '}
            <Link to={`/spaces/${spaceId}`}>{parentName || 'the parent space'}</Link> and will
            appear here as your node syncs them.
          </p>
        </div>
      )}
    </div>
  );
}
