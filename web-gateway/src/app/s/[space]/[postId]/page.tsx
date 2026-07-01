import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ContentResponse } from '@/types/gateway';
import { HeatIndicator } from '@/components/HeatIndicator';
import { PoolDisplay } from '@/components/PoolDisplay';
import { AddressDisplay } from '@/components/AddressDisplay';
import { ReadOnlyReplyTree } from '@/components/ReadOnlyReplyTree';
import { StructuredData } from '@/components/StructuredData';

interface PageProps {
  params: Promise<{ space: string; postId: string }>;
}

// Mock data
function getMockPost(space: string, postId: string): ContentResponse | null {
  return {
    item: {
      content_id: postId,
      author_id: 'cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m',
      signature: 'mock-signature',
      created_at: Date.now() - 2 * 60 * 60 * 1000,
      last_engagement: Date.now() - 30 * 60 * 1000,
      content_type: 'POST',
      parent_id: null,
      space_id: space,
      body_inline: `# Async traits finally stable in Rust 1.75!

After years of waiting, async traits are now stable in Rust. This is a huge milestone for the ecosystem.

## What this means:

1. No more \`#[async_trait]\` macro needed
2. Better error messages
3. Improved performance
4. Native support in the compiler

This opens up so many possibilities for async Rust development. Tower, Axum, and other frameworks will benefit greatly from this.

What are your thoughts? How will this change your codebases?`,
      content_hash: null,
      content_size: null,
      pow_nonce: 12345678,
      pow_difficulty: 16,
      engagement_count: 47,
    },
    survival_probability: 0.82,
    is_decayed: false,
    is_protected: false,
    hours_until_decay: 168,
    pool: {
      poolId: 'pool-1',
      contributedSeconds: 45,
      requiredSeconds: 60,
      contributorCount: 12,
      timeRemainingMs: 900000,
      progressPercentage: 75,
    },
    children: [
      {
        item: {
          content_id: 'reply-1',
          author_id: 'cs1qab3cd4ef5gh6ij7kl8mn9op0qr1st2uv3wx4yz5ab',
          signature: 'mock-sig',
          created_at: Date.now() - 1 * 60 * 60 * 1000,
          last_engagement: Date.now() - 45 * 60 * 1000,
          content_type: 'REPLY',
          parent_id: postId,
          space_id: space,
          body_inline: 'This is huge! I\'ve been waiting for this for my web server project. The ecosystem implications are massive!',
          content_hash: null,
          content_size: null,
          pow_nonce: 23456789,
          pow_difficulty: 14,
          engagement_count: 8,
        },
        survival_probability: 0.78,
        is_decayed: false,
        is_protected: false,
        hours_until_decay: 144,
        pool: null,
        children: [
          {
            item: {
              content_id: 'reply-1-1',
              author_id: 'cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m',
              signature: 'mock-sig',
              created_at: Date.now() - 45 * 60 * 1000,
              last_engagement: Date.now() - 30 * 60 * 1000,
              content_type: 'REPLY',
              parent_id: 'reply-1',
              space_id: space,
              body_inline: 'Right? I expect we\'ll see major framework updates within weeks.',
              content_hash: null,
              content_size: null,
              pow_nonce: 34567890,
              pow_difficulty: 14,
              engagement_count: 3,
            },
            survival_probability: 0.75,
            is_decayed: false,
            is_protected: false,
            hours_until_decay: 120,
            pool: null,
            children: [],
          },
        ],
      },
      {
        item: {
          content_id: 'reply-2',
          author_id: 'cs1qcd5ef6gh7ij8kl9mn0op1qr2st3uv4wx5yz6ab7cd',
          signature: 'mock-sig',
          created_at: Date.now() - 30 * 60 * 1000,
          last_engagement: Date.now() - 15 * 60 * 1000,
          content_type: 'REPLY',
          parent_id: postId,
          space_id: space,
          body_inline: 'Any benchmarks yet? I\'m curious about the overhead compared to the macro approach.',
          content_hash: null,
          content_size: null,
          pow_nonce: 45678901,
          pow_difficulty: 14,
          engagement_count: 5,
        },
        survival_probability: 0.85,
        is_decayed: false,
        is_protected: false,
        hours_until_decay: 192,
        pool: null,
        children: [],
      },
    ],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { space, postId } = await params;
  const post = getMockPost(space, postId);

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
  const post = getMockPost(space, postId);

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
    // Swimchain-specific (non-standard, for transparency)
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
