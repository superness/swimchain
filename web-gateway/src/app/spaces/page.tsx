import type { Metadata } from 'next';
import type { SpaceActivitySummary } from '@/types/gateway';
import { SpaceCard } from '@/components/SpaceCard';
import { getNodeRpc } from '@/lib/node-rpc';

export const metadata: Metadata = {
  title: 'Spaces',
  description: 'Browse Swimchain spaces - decentralized communities with organic moderation.',
  openGraph: {
    title: 'Swimchain Spaces',
    description: 'Browse decentralized communities with organic moderation.',
    url: '/spaces',
  },
};

/**
 * Fetch spaces from the node via RPC.
 * Falls back gracefully to empty array if node is unreachable.
 */
async function fetchSpaces(): Promise<SpaceActivitySummary[]> {
  try {
    const rpc = getNodeRpc();
    const spaces = await rpc.getAllSpaces();
    return spaces;
  } catch (error) {
    console.error('[SpacesPage] Failed to fetch spaces:', error);
    return [];
  }
}

export default async function SpacesPage() {
  const spaces = await fetchSpaces();

  // Sort by decay_health descending
  const sortedSpaces = [...spaces].sort((a, b) => b.decay_health - a.decay_health);

  return (
    <div className="spaces-page">
      <header className="page-header">
        <h1>Spaces</h1>
        <p className="page-description">
          Browse Swimchain spaces - decentralized communities with organic moderation.
          Content persists through community engagement, not moderator decisions.
        </p>
      </header>

      <div className="spaces-stats">
        <span>{spaces.length} spaces</span>
        {spaces.length > 0 && (
          <>
            <span className="separator">&bull;</span>
            <span>{spaces.reduce((sum, s) => sum + s.active_posts, 0)} active posts</span>
            <span className="separator">&bull;</span>
            <span>{spaces.reduce((sum, s) => sum + s.unique_participants, 0)} participants</span>
          </>
        )}
      </div>

      {sortedSpaces.length > 0 ? (
        <div className="spaces-grid">
          {sortedSpaces.map(space => (
            <SpaceCard key={space.space_id} space={space} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No spaces found.</p>
          <p className="text-muted">
            The gateway could not reach a Swimchain node. Try again later or{' '}
            <a href="/about#download">run your own node</a>.
          </p>
        </div>
      )}

      <div className="cta-section">
        <h2>Want to create a space?</h2>
        <p>
          Spaces can only be created with a full Swimchain client.
          The gateway is read-only.
        </p>
        <a href="/about#download" className="cta-button">
          Download Swimchain
        </a>
      </div>

    </div>
  );
}
