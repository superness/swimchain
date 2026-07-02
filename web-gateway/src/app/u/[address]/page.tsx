import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReputationSummary, ContentResponse } from '@/types/gateway';
import { IdentityCard } from '@/components/IdentityCard';
import { SearchResultCard } from '@/components/SearchResultCard';
import { isValidAddress, formatAddress } from '@/lib/address';
import { getNodeRpc } from '@/lib/node-rpc';

interface PageProps {
  params: Promise<{ address: string }>;
}

/**
 * Fetch identity reputation from the node via RPC.
 */
async function fetchIdentity(address: string): Promise<ReputationSummary | null> {
  try {
    const rpc = getNodeRpc();
    return await rpc.getIdentityReputation(address);
  } catch (error) {
    console.error(`[IdentityPage] Failed to fetch identity ${address}:`, error);
    return null;
  }
}

/**
 * Fetch recent posts by an identity from the node.
 */
async function fetchIdentityPosts(address: string): Promise<ContentResponse[]> {
  try {
    const rpc = getNodeRpc();
    return await rpc.getContentByIdentity(address, 50, 0);
  } catch (error) {
    console.error(`[IdentityPage] Failed to fetch posts for ${address}:`, error);
    return [];
  }
}

/**
 * Convert ContentResponse to card format for rendering.
 */
function contentToCard(post: ContentResponse) {
  const body = post.item.body_inline || '';
  const snippet = body.length > 200 ? body.slice(0, 197) + '...' : body;
  const firstLine = body.split('\n')[0]?.replace(/^#+\s*/, '').trim() ?? '';
  const title = firstLine.length > 0 && firstLine.length <= 100 ? firstLine
    : body.length <= 100 ? body.trim()
    : body.slice(0, 97).trim() + '...';

  return {
    contentId: post.item.content_id,
    spaceId: post.item.space_id,
    spaceName: post.item.space_id,
    authorId: post.item.author_id,
    title,
    body: snippet,
    createdAt: post.item.created_at,
    lastEngagement: post.item.last_engagement,
    replyCount: post.children?.length ?? 0,
    survivalProbability: post.survival_probability,
    isDecayed: post.is_decayed,
    isProtected: post.is_protected,
    hoursUntilDecay: post.hours_until_decay,
    pool: post.pool,
    scoreBreakdown: {
      textRelevance: 0,
      heatDecay: post.survival_probability * 100,
      engagementPool: post.pool ? (post.pool.contributedSeconds / 60) * 100 : 0,
      recency: normalizeRecency(post.item.created_at),
      totalScore: 0,
      contributions: { textRelevance: 0, heatDecay: 0, engagementPool: 0, recency: 0 },
    },
  };
}

function normalizeRecency(createdAt: number): number {
  const ageMs = Date.now() - createdAt;
  if (ageMs <= 0) return 100;
  const hoursOld = ageMs / (1000 * 60 * 60);
  return Math.max(0, 100 * Math.exp(-hoursOld / 24));
}

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

  const [identity, posts] = await Promise.all([
    fetchIdentity(decodedAddress),
    fetchIdentityPosts(decodedAddress),
  ]);

  if (!identity) {
    // Identity not found on node — still show the page with empty state
    // (the address is valid, the node just doesn't know about it yet)
  }

  const cards = posts.map(contentToCard);
  // Sort by recency
  const sortedCards = [...cards].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="identity-page">
      <header className="page-header">
        <h1>Identity Profile</h1>
      </header>

      {identity ? (
        <IdentityCard identity={identity} showFullAddress />
      ) : (
        <div className="identity-unknown">
          <p className="font-mono">{formatAddress(decodedAddress, 'full')}</p>
          <p className="text-muted">
            This identity has no on-chain activity yet, or the node is unreachable.
          </p>
        </div>
      )}

      <section className="posts-section">
        <h2>Recent Posts</h2>
        <p className="section-description">
          Posts by this identity, sorted by recency.
        </p>

        <div className="posts-list">
          {sortedCards.map(post => (
            <SearchResultCard key={post.contentId} result={post} />
          ))}
        </div>

        {sortedCards.length === 0 && (
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
