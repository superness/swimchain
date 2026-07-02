import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { SpaceActivitySummary, ContentResponse } from '@/types/gateway';
import { SearchResultCard } from '@/components/SearchResultCard';
import { getNodeRpc } from '@/lib/node-rpc';

interface PageProps {
  params: Promise<{ spaceId: string }>;
}

/**
 * Fetch space info from the node via RPC.
 */
async function fetchSpace(spaceId: string): Promise<SpaceActivitySummary | null> {
  try {
    const rpc = getNodeRpc();
    return await rpc.getSpaceInfo(spaceId);
  } catch (error) {
    console.error(`[SpacePage] Failed to fetch space ${spaceId}:`, error);
    return null;
  }
}

/**
 * Fetch posts in a space from the node.
 */
async function fetchSpacePosts(spaceId: string): Promise<ContentResponse[]> {
  try {
    const rpc = getNodeRpc();
    return await rpc.getSpaceContent(spaceId, 50, 0);
  } catch (error) {
    console.error(`[SpacePage] Failed to fetch posts for ${spaceId}:`, error);
    return [];
  }
}

/**
 * Convert ContentResponse to a simplified card format for rendering.
 */
function contentToCard(post: ContentResponse) {
  const body = post.item.body_inline || '';
  const snippet = body.length > 200 ? body.slice(0, 197) + '...' : body;
  const title = extractTitle(body);

  return {
    contentId: post.item.content_id,
    spaceId: post.item.space_id,
    spaceName: post.item.space_id,
    authorId: post.item.author_id,
    title,
    body: snippet,
    createdAt: post.item.created_at,
    lastEngagement: post.item.last_engagement,
    replyCount: countReplies(post),
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

function extractTitle(body: string): string {
  const firstLine = body.split('\n')[0]?.replace(/^#+\s*/, '').trim() ?? '';
  if (firstLine.length > 0 && firstLine.length <= 100) return firstLine;
  if (body.length <= 100) return body.trim();
  return body.slice(0, 97).trim() + '...';
}

function countReplies(post: ContentResponse): number {
  let count = post.children?.length ?? 0;
  for (const child of post.children ?? []) {
    count += countReplies(child);
  }
  return count;
}

function normalizeRecency(createdAt: number): number {
  const ageMs = Date.now() - createdAt;
  if (ageMs <= 0) return 100;
  const hoursOld = ageMs / (1000 * 60 * 60);
  return Math.max(0, 100 * Math.exp(-hoursOld / 24));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { spaceId } = await params;
  const space = await fetchSpace(spaceId);

  if (!space) {
    return {
      title: 'Space Not Found',
    };
  }

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
  const [space, posts] = await Promise.all([
    fetchSpace(spaceId),
    fetchSpacePosts(spaceId),
  ]);

  if (!space) {
    notFound();
  }

  const cards = posts.map(contentToCard);
  // Sort by survival probability descending (heat)
  const sortedCards = [...cards].sort((a, b) => b.survivalProbability - a.survivalProbability);

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
          {sortedCards.map(post => (
            <SearchResultCard key={post.contentId} result={post} />
          ))}
        </div>

        {sortedCards.length === 0 && (
          <div className="no-posts">
            <p>No active posts in this space.</p>
            <p className="text-muted">
              All content may have decayed or the node is unreachable.
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
