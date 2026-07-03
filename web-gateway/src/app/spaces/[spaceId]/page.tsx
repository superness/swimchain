import { withBase } from '@/lib/base-path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { SearchResultCard } from '@/components/SearchResultCard';
import { NodeOfflineNotice } from '@/components/NodeOfflineNotice';
import { fetchSpaceWithPosts } from '@/lib/node-service';

interface PageProps {
  params: Promise<{ spaceId: string }>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Deduplicate the fetch between generateMetadata and the page render
const getSpace = cache(async (spaceId: string) =>
  fetchSpaceWithPosts(spaceId)
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { spaceId } = await params;
  const result = await getSpace(decodeURIComponent(spaceId));

  if (result.status !== 'ok') {
    return {
      title: result.status === 'offline' ? 'Space (node offline)' : 'Space Not Found',
    };
  }

  const space = result.data.space;
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
  const result = await getSpace(decodeURIComponent(spaceId));

  if (result.status === 'not-found') {
    notFound();
  }

  if (result.status === 'offline') {
    return (
      <div className="space-page">
        <header className="space-header">
          <h1>Space</h1>
        </header>
        <NodeOfflineNotice context="this space" />
      </div>
    );
  }

  const { space, posts } = result.data;

  // Sort by heat
  const sortedPosts = [...posts].sort(
    (a, b) => b.survivalProbability - a.survivalProbability
  );

  return (
    <div className="space-page">
      <header className="space-header">
        <h1>s/{space.space_name}</h1>
        <span className="space-id font-mono text-subtle">
          {space.space_id}
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
        <a href={withBase('/about#download')} className="cta-button">
          Download Swimchain
        </a>
      </div>
    </div>
  );
}
