'use client';

import type { ContentResponse } from '@/types/gateway';
import { HeatIndicator } from './HeatIndicator';
import { AddressDisplay } from './AddressDisplay';
import { PostBody } from './PostBody';

interface ReadOnlyReplyTreeProps {
  replies: ContentResponse[];
  depth?: number;
  maxDepth?: number;
}

/**
 * Read-only reply tree component
 *
 * CRITICAL: This is a READ-ONLY component
 * - NO reply buttons
 * - NO engage buttons
 * - NO action buttons of any kind
 *
 * Users must download the full client to participate.
 */
export function ReadOnlyReplyTree({
  replies,
  depth = 0,
  maxDepth = 10,
}: ReadOnlyReplyTreeProps) {
  if (depth > maxDepth || replies.length === 0) {
    return null;
  }

  return (
    <div className="reply-tree" data-depth={depth}>
      {replies.map(reply => (
        <ReplyNode key={reply.item.content_id} reply={reply} depth={depth} maxDepth={maxDepth} />
      ))}

      <style jsx>{`
        .reply-tree {
          margin-left: ${depth > 0 ? '1.5rem' : '0'};
        }

        .reply-tree[data-depth="0"] {
          margin-left: 0;
        }
      `}</style>
    </div>
  );
}

interface ReplyNodeProps {
  reply: ContentResponse;
  depth: number;
  maxDepth: number;
}

function ReplyNode({ reply, depth, maxDepth }: ReplyNodeProps) {
  const heatClass = getHeatClass(reply.survival_probability);
  const isDecayed = reply.is_decayed;

  if (isDecayed) {
    return (
      <div className="reply-node decayed">
        <div className="reply-placeholder">
          [This content has decayed]
        </div>

        <style jsx>{`
          .reply-node.decayed {
            padding: 0.75rem 1rem;
            margin: 0.5rem 0;
            background: var(--color-bg);
            border-left: 2px solid var(--color-border);
            color: var(--color-text-subtle);
            font-style: italic;
          }
        `}</style>
      </div>
    );
  }

  const timeAgo = formatTimeAgo(reply.item.created_at);

  return (
    <div className={`reply-node ${heatClass}`}>
      <div className="reply-header">
        <AddressDisplay
          address={reply.item.author_id}
          format="short"
          linkToProfile
        />
        <span className="separator">&bull;</span>
        <time dateTime={new Date(reply.item.created_at).toISOString()}>
          {timeAgo}
        </time>
        <span className="separator">&bull;</span>
        <HeatIndicator
          survivalProbability={reply.survival_probability}
          isDecayed={reply.is_decayed}
          isProtected={reply.is_protected}
          hoursUntilDecay={reply.hours_until_decay}
          displayMode="numeric"
        />
      </div>

      <PostBody body={reply.item.body_inline} className="reply-body" />

      {/* NO ACTION BUTTONS - READ ONLY */}

      {reply.children && reply.children.length > 0 && (
        <ReadOnlyReplyTree
          replies={reply.children}
          depth={depth + 1}
          maxDepth={maxDepth}
        />
      )}

      <style jsx>{`
        .reply-node {
          padding: 0.75rem 1rem;
          margin: 0.5rem 0;
          background: var(--color-bg-elevated);
          border-left: 2px solid var(--color-primary);
          border-radius: 0 4px 4px 0;
        }

        .reply-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: var(--color-text-muted);
          margin-bottom: 0.5rem;
        }

        .separator {
          color: var(--color-text-subtle);
        }

        .reply-body {
          font-size: 0.95rem;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </div>
  );
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
