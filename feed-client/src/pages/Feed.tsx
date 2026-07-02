/**
 * Feed - Main feed view page
 *
 * Displays the aggregated feed from followed spaces and users.
 * Includes sorting options, search, and the create post FAB.
 */

import { useState, useCallback } from 'react';
import { FeedList } from '../components/FeedList';
import { CreatePostFAB } from '../components/CreatePostFAB';
import { SearchBar } from '../components/SearchBar';
import { useFeed } from '../hooks/useFeed';
import { useFeedPreferences } from '../hooks/useFeedPreferences';
import { useNewPostsIndicator } from '../hooks/useNewPostsIndicator';
import './Feed.css';

type SortOrder = 'recent' | 'hot';
type FilterType = 'all' | 'spaces' | 'users';

export function Feed(): JSX.Element {
  const [sortOrder, setSortOrder] = useState<SortOrder>('recent');
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    items,
    loading,
    refreshing,
    error,
    hasMore,
    loadMore,
    refresh,
    hasFollows,
  } = useFeed({ sortOrder, filter, searchQuery });

  const {
    savePost,
    unsavePost,
    savedPostIds,
  } = useFeedPreferences();

  const handleSavePost = useCallback((postId: string) => {
    savePost(postId);
  }, [savePost]);

  const handleUnsavePost = useCallback((postId: string) => {
    unsavePost(postId);
  }, [unsavePost]);

  // Real-time "N new posts" indicator (node WebSocket events)
  const { newPostsCount, clearNewPosts } = useNewPostsIndicator(hasFollows);

  const handleShowNewPosts = useCallback(() => {
    clearNewPosts();
    // Refetch in place; never force-scroll the reader
    refresh();
  }, [clearNewPosts, refresh]);

  // Determine empty state type
  const emptyStateType = !hasFollows ? 'no-follows' : 'no-posts';

  return (
    <div className="feed-page">
      {/* Header with controls */}
      <header className="feed-page__header">
        <div className="feed-page__title-row">
          <h1 className="feed-page__title">Your Feed</h1>
          <button
            className="feed-page__refresh-btn"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh feed"
            type="button"
          >
            <span className={`feed-page__refresh-icon ${refreshing ? 'feed-page__refresh-icon--spinning' : ''}`}>
              ↻
            </span>
          </button>
        </div>

        {/* Search bar */}
        <div className="feed-page__search">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search posts, authors..."
          />
          {searchQuery && items.length === 0 && !loading && (
            <p className="feed-page__search-empty">
              No results for "{searchQuery}"
            </p>
          )}
        </div>

        <div className="feed-page__controls">
          {/* Sort selector */}
          <div className="feed-page__sort">
            <button
              className={`feed-page__sort-btn ${sortOrder === 'recent' ? 'feed-page__sort-btn--active' : ''}`}
              onClick={() => setSortOrder('recent')}
              type="button"
            >
              Recent
            </button>
            <button
              className={`feed-page__sort-btn ${sortOrder === 'hot' ? 'feed-page__sort-btn--active' : ''}`}
              onClick={() => setSortOrder('hot')}
              type="button"
            >
              Hot
            </button>
          </div>

          {/* Filter selector */}
          <div className="feed-page__filter">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterType)}
              className="feed-page__filter-select"
              aria-label="Filter feed by"
            >
              <option value="all">All</option>
              <option value="spaces">Spaces only</option>
              <option value="users">Users only</option>
            </select>
          </div>
        </div>
      </header>

      {/* New posts pill (real-time indicator) */}
      {newPostsCount > 0 && (
        <div className="feed-page__new-posts">
          <button
            className="feed-page__new-posts-pill"
            onClick={handleShowNewPosts}
            type="button"
          >
            {newPostsCount === 1 ? '1 new post' : `${newPostsCount} new posts`}
          </button>
        </div>
      )}

      {/* Feed content */}
      <main className="feed-page__content">
        <FeedList
          items={items}
          loading={loading}
          error={error}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onSavePost={handleSavePost}
          onUnsavePost={handleUnsavePost}
          savedPosts={savedPostIds}
          emptyStateType={emptyStateType}
        />
      </main>

      {/* Create post FAB */}
      <CreatePostFAB to="/compose" />
    </div>
  );
}
