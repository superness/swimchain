import type { Metadata } from 'next';
import type { SpaceActivitySummary, ContentResponse } from '@/types/gateway';
import { SearchResultCard } from '@/components/SearchResultCard';
import type { SearchResult } from '@/types/search';

interface PageProps {
  params: Promise<{ spaceId: string }>;
}

// Mock data
const MOCK_SPACE: SpaceActivitySummary = {
  space_id: 'abcd1234efgh5678',
  space_name: 'rust-lang',
  description: 'The Rust programming language community. Share code, ask questions, discuss features.',
  post_count: 892,
  active_posts: 42,
  unique_participants: 234,
  last_activity: Date.now() - 2 * 60 * 60 * 1000,
  decay_health: 82,
  created_at: Date.parse('2024-01-15'),
};

const MOCK_POSTS: SearchResult[] = [
  {
    contentId: 'post-1',
    spaceId: 'rust-lang',
    spaceName: 'rust-lang',
    authorId: 'cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m',
    title: 'Async traits finally stable in Rust 1.75!',
    body: 'After years of waiting, async traits are now stable in Rust...',
    createdAt: Date.now() - 2 * 60 * 60 * 1000,
    lastEngagement: Date.now() - 30 * 60 * 1000,
    replyCount: 47,
    survivalProbability: 0.82,
    isDecayed: false,
    isProtected: false,
    hoursUntilDecay: 168,
    pool: {
      poolId: 'pool-1',
      contributedSeconds: 45,
      requiredSeconds: 60,
      contributorCount: 12,
      timeRemainingMs: 900000,
      progressPercentage: 75,
    },
    scoreBreakdown: {
      textRelevance: 0,
      heatDecay: 82,
      engagementPool: 75,
      recency: 95,
      totalScore: 55.55,
      contributions: { textRelevance: 0, heatDecay: 20.5, engagementPool: 15, recency: 14.25 },
    },
  },
  {
    contentId: 'post-2',
    spaceId: 'rust-lang',
    spaceName: 'rust-lang',
    authorId: 'cs1qab3cd4ef5gh6ij7kl8mn9op0qr1st2uv3wx4yz5ab',
    title: 'Performance tips for Rust beginners',
    body: 'Here are some tips I wish I knew when I started...',
    createdAt: Date.now() - 8 * 60 * 60 * 1000,
    lastEngagement: Date.now() - 2 * 60 * 60 * 1000,
    replyCount: 23,
    survivalProbability: 0.71,
    isDecayed: false,
    isProtected: false,
    hoursUntilDecay: 144,
    pool: {
      poolId: 'pool-2',
      contributedSeconds: 30,
      requiredSeconds: 60,
      contributorCount: 8,
      timeRemainingMs: 1800000,
      progressPercentage: 50,
    },
    scoreBreakdown: {
      textRelevance: 0,
      heatDecay: 71,
      engagementPool: 50,
      recency: 80,
      totalScore: 49.75,
      contributions: { textRelevance: 0, heatDecay: 17.75, engagementPool: 10, recency: 12 },
    },
  },
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { spaceId } = await params;
  // In production, fetch space data
  const space = MOCK_SPACE;

  return {
    title: `s/${space.space_name}`,
    description: space.description || `Browse content in ${space.space_name}`,
    openGraph: {
      title: `s/${space.space_name} | Swimchain`,
      description: space.description || `Browse content in ${space.space_name}`,
      url: `/spaces/${spaceId}`,
    },
  };
}

export default async function SpacePage({ params }: PageProps) {
  const { spaceId } = await params;
  // In production, fetch from node
  const space = MOCK_SPACE;
  const posts = MOCK_POSTS;

  // Sort by heat
  const sortedPosts = [...posts].sort((a, b) => b.survivalProbability - a.survivalProbability);

  return (
    <div className="space-page">
      <header className="space-header">
        <h1>s/{space.space_name}</h1>
        <span className="space-id font-mono text-subtle">
          sp1{space.space_id.slice(0, 8)}...{space.space_id.slice(-4)}
        </span>

        {space.description && (
          <p className="space-description">{space.description}</p>
        )}

        <div className="space-stats">
          <div className="stat">
            <span className="stat-value">{space.post_count}</span>
            <span className="stat-label">Total Posts</span>
          </div>
          <div className="stat">
            <span className="stat-value">{space.active_posts}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat">
            <span className="stat-value">{space.unique_participants}</span>
            <span className="stat-label">Participants</span>
          </div>
          <div className="stat">
            <span className="stat-value">{space.decay_health}%</span>
            <span className="stat-label">Health</span>
          </div>
        </div>
      </header>

      <div className="posts-section">
        <h2>Active Posts</h2>
        <p className="section-description">
          Sorted by heat. Posts with more engagement persist longer.
        </p>

        <div className="posts-list">
          {sortedPosts.map(post => (
            <SearchResultCard key={post.contentId} result={post} />
          ))}
        </div>

        {sortedPosts.length === 0 && (
          <div className="no-posts">
            <p>No active posts in this space.</p>
            <p className="text-muted">
              All content has decayed due to lack of engagement.
            </p>
          </div>
        )}
      </div>

      <div className="cta-section">
        <h2>Want to post in this space?</h2>
        <p>This is a read-only gateway. Download a full client to participate.</p>
        <a href="/about#download" className="cta-button">
          Download Swimchain
        </a>
      </div>
    </div>
  );
}
