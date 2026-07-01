/**
 * FeedList - Scrollable feed container with infinite scroll
 *
 * Renders a list of FeedCard components with loading states,
 * empty states, and infinite scroll support.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FeedCard } from './FeedCard';
import type { FeedItem } from '../types/feed';
import './FeedList.css';

interface FeedListProps {
  items: FeedItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  compact?: boolean;
  onLoadMore: () => void;
  onSavePost?: (postId: string) => void;
  onUnsavePost?: (postId: string) => void;
  savedPosts?: Set<string>;
  emptyStateType?: 'no-follows' | 'no-posts' | 'error';
}

/**
 * Skeleton loader for feed items
 */
function FeedSkeleton(): JSX.Element {
  return (
    <div className="feed-skeleton" aria-hidden="true">
      <div className="feed-skeleton__header">
        <div className="feed-skeleton__avatar" />
        <div className="feed-skeleton__meta">
          <div className="feed-skeleton__line feed-skeleton__line--short" />
          <div className="feed-skeleton__line feed-skeleton__line--tiny" />
        </div>
      </div>
      <div className="feed-skeleton__content">
        <div className="feed-skeleton__line" />
        <div className="feed-skeleton__line" />
        <div className="feed-skeleton__line feed-skeleton__line--medium" />
      </div>
      <div className="feed-skeleton__actions">
        <div className="feed-skeleton__action" />
        <div className="feed-skeleton__action" />
        <div className="feed-skeleton__action" />
      </div>
    </div>
  );
}

/**
 * Empty state when no content
 */
function EmptyFeed({ type }: { type: 'no-follows' | 'no-posts' | 'error' }): JSX.Element {
  if (type === 'no-follows') {
    return (
      <div className="feed-empty" role="status">
        <div className="feed-empty__icon" aria-hidden="true">📭</div>
        <h2 className="feed-empty__title">Your feed is empty</h2>
        <p className="feed-empty__message">
          Start by following some spaces or users to see their posts here.
        </p>
        <div className="feed-empty__actions">
          <Link to="/discover" className="btn btn-primary">
            Explore Spaces
          </Link>
        </div>
      </div>
    );
  }

  if (type === 'no-posts') {
    return (
      <div className="feed-empty" role="status">
        <div className="feed-empty__icon" aria-hidden="true">🌱</div>
        <h2 className="feed-empty__title">Nothing new yet</h2>
        <p className="feed-empty__message">
          The spaces and users you follow haven't posted recently.
          Check back later!
        </p>
        <div className="feed-empty__actions">
          <Link to="/discover" className="btn btn-secondary">
            Explore More
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="feed-empty feed-empty--error" role="alert">
      <div className="feed-empty__icon" aria-hidden="true">⚠️</div>
      <h2 className="feed-empty__title">Failed to load feed</h2>
      <p className="feed-empty__message">
        Something went wrong while loading your feed.
        Please try again.
      </p>
      <div className="feed-empty__actions">
        <button
          className="btn btn-primary"
          onClick={() => window.location.reload()}
          type="button"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export function FeedList({
  items,
  loading,
  error,
  hasMore,
  compact = false,
  onLoadMore,
  onSavePost,
  onUnsavePost,
  savedPosts = new Set(),
  emptyStateType = 'no-follows',
}: FeedListProps): JSX.Element {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Set up intersection observer for infinite scroll
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry?.isIntersecting && hasMore && !loading) {
        onLoadMore();
      }
    },
    [hasMore, loading, onLoadMore]
  );

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;

    observerRef.current = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: '200px', // Load more when 200px from bottom
      threshold: 0,
    });

    observerRef.current.observe(target);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [observerCallback]);

  // Show error state
  if (error && items.length === 0) {
    return <EmptyFeed type="error" />;
  }

  // Show empty state when not loading and no items
  if (!loading && items.length === 0) {
    return <EmptyFeed type={emptyStateType} />;
  }

  return (
    <div className="feed-list" role="feed" aria-busy={loading}>
      {/* Feed items */}
      {items.map((item, index) => (
        <FeedCard
          key={item.id}
          item={item}
          compact={compact}
          onSave={onSavePost}
          onUnsave={onUnsavePost}
          isSaved={savedPosts.has(item.id)}
          aria-posinset={index + 1}
          aria-setsize={hasMore ? -1 : items.length}
        />
      ))}

      {/* Loading indicator */}
      {loading && (
        <div className="feed-list__loading" aria-label="Loading more posts">
          <FeedSkeleton />
          <FeedSkeleton />
          <FeedSkeleton />
        </div>
      )}

      {/* Load more trigger */}
      <div ref={loadMoreRef} className="feed-list__load-more" aria-hidden="true" />

      {/* End of feed message */}
      {!hasMore && items.length > 0 && (
        <div className="feed-list__end" role="status">
          <span>You're all caught up!</span>
        </div>
      )}

      {/* Error banner (when error but has items) */}
      {error && items.length > 0 && (
        <div className="feed-list__error" role="alert">
          <span>Failed to load more posts.</span>
          <button onClick={onLoadMore} type="button">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
