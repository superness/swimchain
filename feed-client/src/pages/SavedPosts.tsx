/**
 * Saved Posts page
 *
 * Shows posts the user has saved via useFeedPreferences.
 * Fetches each saved post by ID via RPC.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFeedPreferences } from '../hooks/useFeedPreferences';
import { useRpc } from '../hooks/useRpc';
function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const ts = timestamp < 1e12 ? timestamp : Math.floor(timestamp / 1000);
  const diff = now - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface SavedPost {
  id: string;
  title?: string;
  body?: string;
  author?: string;
  spaceId?: string;
  createdAt?: number;
}

export function SavedPosts(): JSX.Element {
  const { rpc, connected } = useRpc();
  const { preferences, unsavePost } = useFeedPreferences();
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rpc || !connected || preferences.savedPosts.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const fetched: SavedPost[] = [];
      for (const postId of preferences.savedPosts) {
        try {
          const content = await rpc.getContent(postId);
          if (content && !cancelled) {
            fetched.push({
              id: postId,
              title: content.title ?? undefined,
              body: content.body ?? undefined,
              author: content.author_id,
              spaceId: content.space_id,
              createdAt: content.created_at,
            });
          }
        } catch {
          // Post may have decayed or be unavailable — skip it
          if (!cancelled) {
            fetched.push({ id: postId, title: '(Content unavailable)' });
          }
        }
      }
      if (!cancelled) {
        setPosts(fetched);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rpc, connected, preferences.savedPosts]);

  const handleUnsave = (postId: string) => {
    unsavePost(postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
  };

  return (
    <div className="saved-posts-page" style={{ maxWidth: 700, margin: '0 auto', padding: '2rem 1rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <Link to="/" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
          &larr; Back to Feed
        </Link>
        <h1 style={{ marginTop: '0.5rem' }}>Saved Posts</h1>
      </header>

      {loading && <p>Loading saved posts...</p>}

      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {!loading && posts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
          <p>No saved posts yet.</p>
          <p>Save posts from your feed to find them here later.</p>
        </div>
      )}

      {posts.map(post => (
        <article
          key={post.id}
          style={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '0.75rem',
          }}
        >
          <Link
            to={`/post/${post.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <h3 style={{ margin: '0 0 0.5rem' }}>
              {post.title || 'Untitled'}
            </h3>
            {post.body && (
              <p style={{ margin: '0 0 0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                {post.body.length > 200 ? post.body.slice(0, 200) + '...' : post.body}
              </p>
            )}
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            <span>
              {post.createdAt ? formatRelativeTime(post.createdAt) : ''}
            </span>
            <button
              onClick={() => handleUnsave(post.id)}
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                fontSize: '0.8rem',
              }}
            >
              Unsave
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
