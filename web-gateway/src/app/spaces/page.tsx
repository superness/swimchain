import type { Metadata } from 'next';
import { SpaceCard } from '@/components/SpaceCard';
import { NodeOfflineNotice } from '@/components/NodeOfflineNotice';
import { fetchAllSpaces } from '@/lib/node-service';

export const metadata: Metadata = {
  title: 'Spaces',
  description: 'Browse Swimchain spaces - decentralized communities with organic moderation.',
  openGraph: {
    title: 'Swimchain Spaces',
    description: 'Browse decentralized communities with organic moderation.',
    url: '/spaces',
  },
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SpacesPage() {
  const spaces = await fetchAllSpaces();

  // Sort by decay_health descending
  const sortedSpaces = spaces
    ? [...spaces].sort((a, b) => b.decay_health - a.decay_health)
    : [];

  return (
    <div className="spaces-page">
      <header className="page-header">
        <h1>Spaces</h1>
        <p className="page-description">
          Browse Swimchain spaces - decentralized communities with organic moderation.
          Content persists through community engagement, not moderator decisions.
        </p>
      </header>

      {spaces === null ? (
        <NodeOfflineNotice context="the space directory" />
      ) : (
        <>
          <div className="spaces-stats">
            <span>{spaces.length} spaces</span>
            <span className="separator">&bull;</span>
            <span>{spaces.reduce((sum, s) => sum + s.active_posts, 0)} active posts</span>
            <span className="separator">&bull;</span>
            <span>{spaces.reduce((sum, s) => sum + s.unique_participants, 0)} participants</span>
          </div>

          <div className="spaces-grid">
            {sortedSpaces.map(space => (
              <SpaceCard key={space.space_id} space={space} />
            ))}
          </div>

          {sortedSpaces.length === 0 && (
            <div className="no-posts">
              <p>No spaces found on the network yet.</p>
              <p className="text-muted">
                Spaces appear here once they are created on chain.
              </p>
            </div>
          )}
        </>
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
