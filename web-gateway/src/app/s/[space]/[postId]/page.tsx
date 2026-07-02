import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ContentResponse } from '@/types/gateway';
import { HeatIndicator } from '@/components/HeatIndicator';
import { PoolDisplay } from '@/components/PoolDisplay';
import { AddressDisplay } from '@/components/AddressDisplay';
import { ReadOnlyReplyTree } from '@/components/ReadOnlyReplyTree';
import { StructuredData } from '@/components/StructuredData';
import { getNodeRpc } from '@/lib/node-rpc';

interface PageProps {
  params: Promise<{ space: string; postId: string }>;
}

/**
 * Fetch a single post from the node via RPC.
 */
async function fetchPost(space: string, postId: string): Promise<ContentResponse | null> {
  try {
    const rpc = getNodeRpc();
    const content = await rpc.getContent(postId);
    if (!content) return null;
    // Verify the content belongs to the requested space
    if (content.item.space_id !== space) return null;
    return content;
  } catch (error) {
    console.error(`[PostPage] Failed to fetch post ${postId}:`, error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { space, postId } = await params;
  const post = await fetchPost(space, postId);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  const title = extractTitle(post.item.body_inline);
  const description = createSnippet(post.item.body_inline);

  return {
    title: `${title} - s/${space}`,
    description,
    openGraph: {
      title: `${title} | Swimchain`,
      description,
      type: 'article',
      url: `/s/${space}/${postId}`,
      images: [{ url: '/og-default.png' }],
    },
    twitter: {
      card: 'summary',
      title: `${title} | Swimchain`,
      description,
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { space, postId } = await params;
  const post = await fetchPost(space, postId);

  if (!post) {
    notFound();
  }

  const title = extractTitle(post.item.body_inline);
  const timeAgo = formatTimeAgo(post.item.created_at);
  const replyCount = countReplies(post);
  const heatClass = getHeatClass(post.survival_probability);

  // JSON-LD structured data
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: title,
    author: {
      '@type': 'Person',
      identifier: post.item.author_id,
    },
    datePublished: new Date(post.item.created_at).toISOString(),
    interactionStatistic: {
      '@type': 'InteractionCounter',
      interactionType: 'https://schema.org/ReplyAction',
      userInteractionCount: replyCount,
    },
    'swimchain:heat': post.survival_probability,
    'swimchain:poolProgress': post.pool?.progressPercentage,
  };

  return (
    <div className="post-page">
      <StructuredData data={structuredData} />

      <div className="breadcrumb">
        <a href="/spaces">Spaces</a>
        <span className="separator">/</span>
        <a href={`/spaces/${encodeURIComponent(space)}`}>s/{space}</a>
        <span className="separator">/</span>
        <span>Post</span>
      </div>

      <article className={`post-content ${heatClass}`}>
        <header className="post-header">
          <h1 className="post-title">{title}</h1>

          <div className="post-meta">
            <AddressDisplay
              address={post.item.author_id}
              format="short"
              linkToProfile
              copyable
            />
            <span className="separator">&bull;</span>
            <time dateTime={new Date(post.item.created_at).toISOString()}>
              {timeAgo}
            </time>
          </div>

          <div className="post-indicators">
            <HeatIndicator
              survivalProbability={post.survival_probability}
              isDecayed={post.is_decayed}
              isProtected={post.is_protected}
              hoursUntilDecay={post.hours_until_decay}
              displayMode="bar"
            />
          </div>
        </header>

        <div className="post-body">
          {post.item.body_inline || '[Content unavailable]'}
        </div>

        {post.pool && (
          <div className="post-pool">
            <PoolDisplay pool={post.pool} />
          </div>
        )}

        {/* NO ACTION BUTTONS - READ ONLY GATEWAY */}
      </article>

      <div className="cta-banner">
        <strong>Want to reply or engage?</strong>
        <p>
          This is a read-only gateway. To participate in the discussion:
        </p>
        <ul>
          <li>Reply to posts</li>
          <li>Engage content (help it persist)</li>
          <li>Create your own posts</li>
        </ul>
        <a href="/about#download" className="cta-button">
          Download Swimchain
        </a>
      </div>

      <section className="replies-section">
        <h2>{replyCount} {replyCount === 1 ? 'Reply' : 'Replies'}</h2>

        {post.children && post.children.length > 0 ? (
          <ReadOnlyReplyTree replies={post.children} />
        ) : (
          <p className="no-replies text-muted">No replies yet.</p>
        )}
      </section>
    </div>
  );
}

function extractTitle(body: string | null): string {
  if (!body) return '[No title]';
  const firstLine = body.split('\n')[0]?.replace(/^#+\s*/, '').trim() ?? '';
  if (firstLine.length > 0 && firstLine.length <= 100) return firstLine;
  if (body.length <= 100) return body.trim();
  return body.slice(0, 97).trim() + '...';
}

function createSnippet(body: string | null): string {
  if (!body) return '';
  const text = body.replace(/^#+\s*/gm, '').replace(/\n+/g, ' ').trim();
  if (text.length <= 160) return text;
  return text.slice(0, 157).trim() + '...';
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function countReplies(post: ContentResponse): number {
  let count = post.children?.length ?? 0;
  for (const child of post.children ?? []) {
    count += countReplies(child);
  }
  return count;
}

function getHeatClass(survivalProbability: number): string {
  const heat = survivalProbability * 100;
  if (heat >= 80) return 'content-heat-100';
  if (heat >= 60) return 'content-heat-80';
  if (heat >= 40) return 'content-heat-60';
  if (heat >= 20) return 'content-heat-40';
  if (heat >= 5) return 'content-heat-20';
  return 'content-heat-5';
}
