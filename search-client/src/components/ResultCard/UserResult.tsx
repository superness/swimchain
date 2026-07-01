/**
 * UserResult Component
 *
 * Displays a user/identity search result card.
 */

import { memo } from 'react';
import { SearchResult, UserInfo } from '../../types';
import { highlightToReactParts } from '../../lib/highlighter';
import { BlockButton } from '../BlockButton';
import './ResultCard.css';

interface UserResultProps {
  result: SearchResult;
  searchTerms: string[];
  searchPhrases: string[];
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

/** Deterministic color from an address string */
function avatarColor(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}

/** First 2 meaningful chars of address for initials (skip 'cs1' prefix) */
function avatarInitials(address: string): string {
  const stripped = address.startsWith('cs1') ? address.slice(3) : address;
  return stripped.slice(0, 2).toUpperCase();
}

export const UserResult = memo(function UserResult({ result, searchTerms, searchPhrases }: UserResultProps) {
  const data = result.data as UserInfo;

  // Highlight display name
  const nameParts = data.displayName
    ? highlightToReactParts(
        result.highlights.name || data.displayName,
        searchTerms,
        searchPhrases
      )
    : [];

  const bioParts = data.bio
    ? highlightToReactParts(
        result.highlights.content || data.bio,
        searchTerms,
        searchPhrases
      )
    : [];

  return (
    <article className="result-card user-result" role="listitem">
      <div className="result-type-badge user">USER</div>

      <div className="user-header">
        <div
          className="user-avatar"
          style={{ background: avatarColor(data.identityId), color: '#fff', fontWeight: 600, fontSize: '16px' }}
        >
          {avatarInitials(data.identityId)}
        </div>

        <div className="user-info">
          <h3 className="result-title user-name">
            <a href={`/user/${data.identityId}`}>
              {nameParts.length > 0 ? (
                nameParts.map((part, i) => (
                  part.isHighlighted
                    ? <mark key={i}>{part.text}</mark>
                    : <span key={i}>{part.text}</span>
                ))
              ) : (
                truncateAddress(data.identityId)
              )}
            </a>
            {data.isVerified && (
              <span className="verified-badge" title="Verified">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </span>
            )}
          </h3>
          <div className="result-meta">
            <span className="meta-id" title={data.identityId}>
              {truncateAddress(data.identityId)}
            </span>
          </div>
        </div>
      </div>

      {bioParts.length > 0 && (
        <p className="result-snippet user-bio">
          {bioParts.map((part, i) => (
            part.isHighlighted
              ? <mark key={i}>{part.text}</mark>
              : <span key={i}>{part.text}</span>
          ))}
        </p>
      )}

      <div className="result-stats user-stats">
        <span className="stat" title="Posts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          {formatNumber(data.postCount)} posts
        </span>
        <span className="stat" title="Replies">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          {formatNumber(data.replyCount)} replies
        </span>
        <span className="stat" title="Reactions received">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          {formatNumber(data.reactionsReceived)}
        </span>
      </div>

      <div className="user-actions">
        <a href={`/user/${data.identityId}`} className="action-button primary">
          View Profile
        </a>
        <BlockButton id={data.identityId} type="user" />
      </div>
    </article>
  );
});
