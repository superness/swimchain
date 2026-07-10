/**
 * ThreadResult Component
 *
 * Displays a thread/post search result card.
 */

import { memo } from 'react';
import { Link } from 'react-router-dom';
import { SearchResult, ThreadInfo } from '../../types';
import { highlightToReactParts } from '../../lib/highlighter';
import { BlockButton } from '../BlockButton';
import { ContentStatus } from '../ContentStatus';
import { EncryptedBadge, isEncryptedContent } from '../EncryptedBadge';
import { SponsoredBadge } from '../SponsoredBadge';
import './ResultCard.css';

interface ThreadResultProps {
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

export const ThreadResult = memo(function ThreadResult({ result, searchTerms, searchPhrases }: ThreadResultProps) {
  const data = result.data as ThreadInfo;

  const bodyIsEncrypted = isEncryptedContent(data.body);
  const titleIsEncrypted = isEncryptedContent(data.title);

  // Never surface raw ciphertext in results: private-space content the searcher
  // can't decrypt shows a placeholder instead of the [PRIVATE:…]/[ENCRYPTED:…] blob.
  const titleParts = highlightToReactParts(
    titleIsEncrypted ? 'Encrypted content' : (result.highlights.title || data.title),
    searchTerms,
    searchPhrases
  );

  const contentParts = highlightToReactParts(
    bodyIsEncrypted ? 'This content is in a private space.' : (result.highlights.content || data.body.slice(0, 200)),
    searchTerms,
    searchPhrases
  );

  return (
    <article className="result-card thread-result" role="listitem">
      <div className="result-type-badge thread">THREAD</div>
      {(bodyIsEncrypted || titleIsEncrypted) && <EncryptedBadge />}
      {data.sponsorshipId && <SponsoredBadge />}

      <h3 className="result-title">
        <Link to={`/thread/${data.contentId}?space=${data.spaceId}`}>
          {titleParts.map((part, i) => (
            part.isHighlighted
              ? <mark key={i}>{part.text}</mark>
              : <span key={i}>{part.text}</span>
          ))}
        </Link>
      </h3>

      <div className="result-meta">
        <span className="meta-space" title={data.spaceId}>
          {data.spaceName || truncateAddress(data.spaceId)}
        </span>
        <span className="meta-separator">-</span>
        <span className="meta-author" title={data.authorId}>
          {data.authorName || truncateAddress(data.authorId)}
        </span>
        <span className="meta-separator">-</span>
        <time className="meta-time" dateTime={new Date(data.createdAt * 1000).toISOString()}>
          {formatTimeAgo(data.createdAt)}
        </time>
      </div>

      <p className="result-snippet">
        {contentParts.map((part, i) => (
          part.isHighlighted
            ? <mark key={i}>{part.text}</mark>
            : <span key={i}>{part.text}</span>
        ))}
        {data.body.length > 200 && '...'}
      </p>

      <div className="result-stats">
        <span className="stat" title="Replies">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {data.replyCount}
        </span>
        <span className="stat" title="Reactions">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {data.reactionCount}
        </span>
        {data.hasMedia && (
          <span className="stat has-media" title="Has media">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </span>
        )}
        <ContentStatus createdAt={data.createdAt} />
        <BlockButton id={data.contentId} type="post" authorId={data.authorId} />
      </div>
    </article>
  );
});
