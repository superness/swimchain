import type { Metadata } from 'next';
import type { SpaceActivitySummary } from '@/types/gateway';
import { SpaceCard } from '@/components/SpaceCard';

export const metadata: Metadata = {
  title: 'Spaces',
  description: 'Browse Swimchain spaces - decentralized communities with organic moderation.',
  openGraph: {
    title: 'Swimchain Spaces',
    description: 'Browse decentralized communities with organic moderation.',
    url: '/spaces',
  },
};

// Mock data for demonstration
const MOCK_SPACES: SpaceActivitySummary[] = [
  {
    space_id: 'abcd1234efgh5678',
    space_name: 'rust-lang',
    description: 'The Rust programming language community. Share code, ask questions, discuss features.',
    post_count: 892,
    active_posts: 42,
    unique_participants: 234,
    last_activity: Date.now() - 2 * 60 * 60 * 1000,
    decay_health: 82,
    created_at: Date.parse('2024-01-15'),
  },
  {
    space_id: 'ijkl9012mnop3456',
    space_name: 'boston',
    description: 'Boston local community. Events, recommendations, discussions.',
    post_count: 567,
    active_posts: 28,
    unique_participants: 156,
    last_activity: Date.now() - 4 * 60 * 60 * 1000,
    decay_health: 71,
    created_at: Date.parse('2024-02-01'),
  },
  {
    space_id: 'qrst5678uvwx9012',
    space_name: 'woodworking',
    description: 'Share your projects, get advice, discuss tools and techniques.',
    post_count: 345,
    active_posts: 15,
    unique_participants: 89,
    last_activity: Date.now() - 8 * 60 * 60 * 1000,
    decay_health: 58,
    created_at: Date.parse('2024-03-10'),
  },
  {
    space_id: 'yzab3456cdef7890',
    space_name: 'tech-projects',
    description: 'Show off your tech projects, get feedback, collaborate.',
    post_count: 234,
    active_posts: 12,
    unique_participants: 67,
    last_activity: Date.now() - 12 * 60 * 60 * 1000,
    decay_health: 45,
    created_at: Date.parse('2024-04-05'),
  },
  {
    space_id: 'ghij1234klmn5678',
    space_name: 'fishing',
    description: 'Fishing spots, gear, techniques, and catch reports.',
    post_count: 123,
    active_posts: 5,
    unique_participants: 34,
    last_activity: Date.now() - 3 * 24 * 60 * 60 * 1000,
    decay_health: 28,
    created_at: Date.parse('2024-05-20'),
  },
];

export default async function SpacesPage() {
  // In production, fetch from node
  const spaces = MOCK_SPACES;

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
