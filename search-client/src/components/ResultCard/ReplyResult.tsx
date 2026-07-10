/**
 * ReplyResult Component
 *
 * Displays a reply/comment search result card.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { SearchResult, ReplyInfo } from '../../types';
import { highlightToReactParts } from '../../lib/highlighter';
import { BlockButton } from '../BlockButton';
import { ContentStatus } from '../ContentStatus';
import { EncryptedBadge, isEncryptedContent } from '../EncryptedBadge';
import { SponsoredBadge } from '../SponsoredBadge';
import './ResultCard.css';

interface ReplyResultProps {
  result: SearchResult;
  searchTerms: string[];
  searchPhrases: string[];
}

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
  return `${Math.floor(diff / 31536000)} years ago`;
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

export const ReplyResult = memo(function ReplyResult({ result, searchTerms, searchPhrases }: ReplyResultProps) {
  const data = result.data as ReplyInfo;

  const bodyIsEncrypted = isEncryptedContent(data.body);
  const threadTitleIsEncrypted = !!data.threadTitle && isEncryptedContent(data.threadTitle);

  // Never surface raw ciphertext: encrypted private-space bodies show a placeholder.
  const contentParts = highlightToReactParts(
    bodyIsEncrypted ? 'This content is in a private space.' : (result.highlights.content || data.body.slice(0, 200)),
    searchTerms,
    searchPhrases
  );

  return (
    <article className="result-card reply-result" role="listitem">
      <div className="result-type-badge reply">REPLY</div>
      {bodyIsEncrypted && <EncryptedBadge />}
      {data.sponsorshipId && <SponsoredBadge />}

      {/* Context: which thread this reply is in */}
      {data.threadTitle && (
        <div className="reply-context">
          <span className="context-label">in</span>
          <Link to={`/thread/${data.threadId}?space=${data.spaceId}`} className="context-link">
            "{threadTitleIsEncrypted ? 'Encrypted content' : data.threadTitle}"
          </Link>
        </div>
      )}

      <div className="result-meta">
        <span className="meta-author" title={data.authorId}>
          {data.authorName || truncateAddress(data.authorId)}
        </span>
        <span className="meta-separator">-</span>
        <time className="meta-time" dateTime={new Date(data.createdAt * 1000).toISOString()}>
          {formatTimeAgo(data.createdAt)}
        </time>
      </div>

      <p className="result-snippet reply-content">
        {contentParts.map((part, i) => (
          part.isHighlighted
            ? <mark key={i}>{part.text}</mark>
            : <span key={i}>{part.text}</span>
        ))}
        {data.body.length > 200 && '...'}
      </p>

      <div className="result-stats">
        <span className="stat" title="Reactions">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {data.reactionCount}
        </span>
        <ContentStatus createdAt={data.createdAt} />
        <BlockButton id={data.contentId} type="reply" authorId={data.authorId} />
      </div>

      <Link
        to={`/thread/${data.threadId}?space=${data.spaceId}#reply-${data.contentId}`}
        className="view-in-thread"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 10 4 15 9 20" />
          <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </svg>
        View in thread
      </Link>
    </article>
  );
});
