import React, { useEffect, useState } from "react";
import { useSwimchain } from "../context/SwimchainContext";

interface Post {
  id: string;
  space_id: string;
  author: string;
  title: string;
  body: string;
  timestamp: number;
  decay_score: number;
  reply_count: number;
}

interface Props {
  spaceId: string;
}

export function SpaceView({ spaceId }: Props) {
  const { spaces, getSpaceContent } = useSwimchain();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const space = spaces.find((s) => s.id === spaceId);

  useEffect(() => {
    const loadPosts = async () => {
      setLoading(true);
      const content = await getSpaceContent(spaceId);
      setPosts(content);
      setLoading(false);
    };

    loadPosts();
  }, [spaceId, getSpaceContent]);

  if (!space) {
    return <div className="space-view">Space not found</div>;
  }

  return (
    <div className="space-view">
      <div className="space-header">
        <h1>{space.name}</h1>
        <p className="space-description">{space.description}</p>
        <div className="space-stats">
          <span>{space.post_count} posts</span>
          <span>{space.subscriber_count} subscribers</span>
        </div>
      </div>

      <div className="post-list">
        {loading ? (
          <div className="loading-posts">Loading posts...</div>
        ) : posts.length === 0 ? (
          <div className="no-posts">
            <p>No posts in this space yet.</p>
            <p className="hint">Be the first to post!</p>
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="post-card">
              <div className="post-header">
                <span className="post-author">{formatAuthor(post.author)}</span>
                <span className="post-time">{formatTime(post.timestamp)}</span>
                <span className="post-decay" title="Decay score">
                  {formatDecay(post.decay_score)}
                </span>
              </div>
              <h2 className="post-title">{post.title}</h2>
              <p className="post-body">{post.body}</p>
              <div className="post-footer">
                <span className="reply-count">{post.reply_count} replies</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function formatAuthor(author: string): string {
  if (author.length > 16) {
    return author.slice(0, 8) + "..." + author.slice(-4);
  }
  return author;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}

function formatDecay(score: number): string {
  if (score >= 0.9) return "🔥"; // Hot
  if (score >= 0.7) return "✨"; // Fresh
  if (score >= 0.4) return "📄"; // Normal
  if (score >= 0.1) return "📜"; // Aging
  return "💀"; // Almost gone
}
