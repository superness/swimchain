/**
 * Discover - Find new spaces and users to follow
 *
 * Shows trending spaces, suggested users, and search functionality.
 */

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSpaces } from '../hooks/useRpc';
import { useFeedPreferences, useFollowSpace, useFollowUser } from '../hooks/useFeedPreferences';
import { useActiveAuthors } from '../hooks/useActiveAuthors';
import { useStoredIdentity } from '../hooks/useStoredIdentity';
import { FollowButton } from '../components/FollowButton';
import { PrivateSpaceList } from '../components/PrivateSpaceList';
import './Discover.css';

interface SpaceCardProps {
  spaceId: string;
  name: string | null;
  postCount: number;
  lastActivity: number | null;
}

function SpaceCard({ spaceId, name, postCount, lastActivity }: SpaceCardProps): JSX.Element {
  const { isFollowing, isMuted, toggle, toggleMute, loading } = useFollowSpace(spaceId);

  const displayName = name ?? spaceId.substring(0, 12) + '...';
  const activityText = lastActivity
    ? `Last active ${formatTimeAgo(lastActivity)}`
    : 'No recent activity';

  return (
    <div className="space-card">
      <div className="space-card__icon" aria-hidden="true">
        #
      </div>
      <div className="space-card__info">
        <Link to={`/space/${spaceId}`} className="space-card__name">
          {displayName}
        </Link>
        <div className="space-card__stats">
          <span className="space-card__stat">{postCount} posts</span>
          <span className="space-card__separator">·</span>
          <span className="space-card__stat">{activityText}</span>
        </div>
      </div>
      <FollowButton
        isFollowing={isFollowing}
        isMuted={isMuted}
        loading={loading}
        onToggleFollow={toggle}
        onToggleMute={toggleMute}
        size="small"
      />
    </div>
  );
}

interface UserCardProps {
  userPk: string;
  postCount: number;
  lastActive: number;
  spaceCount: number;
}

function UserCard({ userPk, postCount, lastActive, spaceCount }: UserCardProps): JSX.Element {
  const { isFollowing, isMuted, toggle, toggleMute, loading } = useFollowUser(userPk);

  const displayName = userPk.substring(0, 10) + '...' + userPk.substring(userPk.length - 4);

  return (
    <div className="space-card">
      <div className="space-card__icon" aria-hidden="true">
        {userPk.substring(0, 2).toUpperCase()}
      </div>
      <div className="space-card__info">
        <Link to={`/profile/${userPk}`} className="space-card__name">
          {displayName}
        </Link>
        <div className="space-card__stats">
          <span className="space-card__stat">{postCount} recent posts</span>
          <span className="space-card__separator">·</span>
          <span className="space-card__stat">
            {spaceCount} {spaceCount === 1 ? 'space' : 'spaces'}
          </span>
          <span className="space-card__separator">·</span>
          <span className="space-card__stat">Active {formatTimeAgo(lastActive)}</span>
        </div>
      </div>
      <FollowButton
        isFollowing={isFollowing}
        isMuted={isMuted}
        loading={loading}
        onToggleFollow={toggle}
        onToggleMute={toggleMute}
        size="small"
      />
    </div>
  );
}

/**
 * Format relative time
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

export function Discover(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'spaces' | 'users'>('spaces');
  const { spaces, loading, error, refetch: refresh } = useSpaces();
  const { preferences } = useFeedPreferences();
  const { identity } = useStoredIdentity();

  // Users tab: source authors from followed spaces, falling back to the
  // most active public spaces when nothing is followed yet.
  const authorSourceSpaceIds = useMemo(() => {
    const followed = preferences.followedSpaces
      .filter(s => s.id && !s.muted)
      .map(s => s.id);
    if (followed.length > 0) return followed;
    return [...spaces]
      .sort((a, b) => b.postCount - a.postCount)
      .slice(0, 5)
      .map(s => s.id);
  }, [preferences.followedSpaces, spaces]);

  const {
    authors,
    loading: authorsLoading,
    error: authorsError,
    refetch: refetchAuthors,
  } = useActiveAuthors(authorSourceSpaceIds, identity?.publicKey ?? null);

  // Filter authors by search query
  const filteredAuthors = authors.filter(author => {
    if (!searchQuery) return true;
    return author.userPk.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Filter spaces by search query
  const filteredSpaces = spaces.filter(space => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = (space.name ?? '').toLowerCase();
    const id = space.id.toLowerCase();
    return name.includes(query) || id.includes(query);
  });

  // Sort by post count (most active first)
  const sortedSpaces = [...filteredSpaces].sort((a, b) => b.postCount - a.postCount);

  // Split into followed and not followed
  const followedSpaceIds = new Set(preferences.followedSpaces.map(s => s.id));
  const suggestedSpaces = sortedSpaces.filter(s => !followedSpaceIds.has(s.id));
  const followedSpaces = sortedSpaces.filter(s => followedSpaceIds.has(s.id));

  return (
    <div className="discover-page">
      <header className="discover-page__header">
        <h1 className="discover-page__title">Discover</h1>
        <p className="discover-page__subtitle">
          Find spaces and users to follow
        </p>
      </header>

      {/* Search */}
      <div className="discover-page__search">
        <input
          type="search"
          placeholder="Search spaces and users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="discover-page__search-input"
          aria-label="Search spaces and users"
        />
      </div>

      {/* Tabs */}
      <div className="discover-page__tabs">
        <button
          className={`discover-page__tab ${activeTab === 'spaces' ? 'discover-page__tab--active' : ''}`}
          onClick={() => setActiveTab('spaces')}
          type="button"
        >
          Spaces
        </button>
        <button
          className={`discover-page__tab ${activeTab === 'users' ? 'discover-page__tab--active' : ''}`}
          onClick={() => setActiveTab('users')}
          type="button"
        >
          Users
        </button>
      </div>

      {/* Private Spaces */}
      <PrivateSpaceList />

      {/* Content */}
      <main className="discover-page__content">
        {activeTab === 'spaces' && (
          <>
            {loading && (
              <div className="discover-page__loading">
                <div className="discover-page__spinner" />
                <span>Loading spaces...</span>
              </div>
            )}

            {error && (
              <div className="discover-page__error" role="alert">
                <span>Failed to load spaces</span>
                <button onClick={refresh} type="button">Retry</button>
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Suggested spaces */}
                {suggestedSpaces.length > 0 && (
                  <section className="discover-page__section">
                    <h2 className="discover-page__section-title">
                      Suggested Spaces
                    </h2>
                    <div className="discover-page__grid">
                      {suggestedSpaces.map(space => (
                        <SpaceCard
                          key={space.id}
                          spaceId={space.id}
                          name={space.name}
                          postCount={space.postCount}
                          lastActivity={space.createdAt}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Already following */}
                {followedSpaces.length > 0 && (
                  <section className="discover-page__section">
                    <h2 className="discover-page__section-title">
                      Following ({followedSpaces.length})
                    </h2>
                    <div className="discover-page__grid">
                      {followedSpaces.map(space => (
                        <SpaceCard
                          key={space.id}
                          spaceId={space.id}
                          name={space.name}
                          postCount={space.postCount}
                          lastActivity={space.createdAt}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Empty state */}
                {spaces.length === 0 && (
                  <div className="discover-page__empty">
                    <div className="discover-page__empty-icon" aria-hidden="true">📡</div>
                    <h2>No spaces found</h2>
                    <p>There are no spaces on the network yet.</p>
                  </div>
                )}

                {/* No results */}
                {spaces.length > 0 && filteredSpaces.length === 0 && (
                  <div className="discover-page__empty">
                    <div className="discover-page__empty-icon" aria-hidden="true">🔍</div>
                    <h2>No matches</h2>
                    <p>No spaces match "{searchQuery}"</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'users' && (
          <>
            {authorsLoading && (
              <div className="discover-page__loading">
                <div className="discover-page__spinner" />
                <span>Loading users...</span>
              </div>
            )}

            {authorsError && !authorsLoading && (
              <div className="discover-page__error" role="alert">
                <span>Failed to load users</span>
                <button onClick={refetchAuthors} type="button">Retry</button>
              </div>
            )}

            {!authorsLoading && !authorsError && filteredAuthors.length > 0 && (
              <section className="discover-page__section">
                <h2 className="discover-page__section-title">
                  Active Authors
                </h2>
                <div className="discover-page__grid">
                  {filteredAuthors.map(author => (
                    <UserCard
                      key={author.userPk}
                      userPk={author.userPk}
                      postCount={author.postCount}
                      lastActive={author.lastActive}
                      spaceCount={author.spaceCount}
                    />
                  ))}
                </div>
              </section>
            )}

            {!authorsLoading && !authorsError && authors.length > 0 && filteredAuthors.length === 0 && (
              <div className="discover-page__empty">
                <div className="discover-page__empty-icon" aria-hidden="true">🔍</div>
                <h2>No matches</h2>
                <p>No users match "{searchQuery}"</p>
              </div>
            )}

            {!authorsLoading && !authorsError && authors.length === 0 && (
              <div className="discover-page__empty">
                <div className="discover-page__empty-icon" aria-hidden="true">👥</div>
                <h2>No users to show</h2>
                <p>
                  Users appear here once there is recent activity in spaces.
                  Follow spaces to see their active authors.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
