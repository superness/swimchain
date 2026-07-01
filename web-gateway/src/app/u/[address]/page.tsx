import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReputationSummary } from '@/types/gateway';
import type { SearchResult } from '@/types/search';
import { IdentityCard } from '@/components/IdentityCard';
import { SearchResultCard } from '@/components/SearchResultCard';
import { isValidAddress, formatAddress } from '@/lib/address';

interface PageProps {
  params: Promise<{ address: string }>;
}

// Mock data
function getMockIdentity(address: string): ReputationSummary {
  return {
    identity: address,
    first_block: 12345,
    post_count: 42,
    reply_count: 128,
    received_replies: 89,
    age_seconds: 180 * 24 * 60 * 60, // 180 days
  };
}

const MOCK_POSTS: SearchResult[] = [
  {
    contentId: 'post-1',
    spaceId: 'rust-lang',
    spaceName: 'rust-lang',
    authorId: 'cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m',
    title: 'Async traits finally stable in Rust 1.75!',
    body: 'After years of waiting, async traits are now stable...',
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
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  const shortAddress = formatAddress(address, 'short');

  return {
    title: shortAddress,
    description: `View posts and reputation for ${shortAddress} on Swimchain`,
    openGraph: {
      title: `${shortAddress} | Swimchain`,
      description: `View posts and reputation for ${shortAddress}`,
      url: `/u/${address}`,
    },
  };
}

export default async function IdentityPage({ params }: PageProps) {
  const { address } = await params;
  const decodedAddress = decodeURIComponent(address);

  // Validate address format
  if (!isValidAddress(decodedAddress)) {
    notFound();
  }

  // In production, fetch from node
  const identity = getMockIdentity(decodedAddress);
  const posts = MOCK_POSTS.filter(p => p.authorId === decodedAddress || true); // Show mock data

  // Sort by recency
  const sortedPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="identity-page">
      <header className="page-header">
        <h1>Identity Profile</h1>
      </header>

      <IdentityCard identity={identity} showFullAddress />

      <section className="posts-section">
        <h2>Recent Posts</h2>
        <p className="section-description">
          Posts by this identity, sorted by recency.
        </p>

        <div className="posts-list">
          {sortedPosts.map(post => (
            <SearchResultCard key={post.contentId} result={post} />
          ))}
        </div>

        {sortedPosts.length === 0 && (
          <div className="no-posts">
            <p>No active posts from this identity.</p>
            <p className="text-muted">
              All content may have decayed or the identity has not posted yet.
            </p>
          </div>
        )}
      </section>

      <div className="info-section">
        <h3>About Identity Addresses</h3>
        <p>
          Swimchain uses cryptographic identities. The address above is a
          Bech32m-encoded Ed25519 public key. It uniquely identifies this user
          without revealing any personal information.
        </p>
        <p>
          <a href="/about#identity">Learn more about Swimchain identities</a>
        </p>
      </div>
    </div>
  );
}
