/**
 * SpaceResult Component
 *
 * Displays a space/community search result card.
 */

import { memo } from 'react';
import { SearchResult, SpaceInfo } from '../../types';
import { highlightToReactParts } from '../../lib/highlighter';
import './ResultCard.css';

interface SpaceResultProps {
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

export const SpaceResult = memo(function SpaceResult({ result, searchTerms, searchPhrases }: SpaceResultProps) {
  const data = result.data as SpaceInfo;

  // Highlight name and description
  const nameParts = highlightToReactParts(
    result.highlights.name || data.name,
    searchTerms,
    searchPhrases
  );

  const descParts = data.description
    ? highlightToReactParts(
        result.highlights.content || data.description,
        searchTerms,
        searchPhrases
      )
    : [];

  return (
    <article className="result-card space-result" role="listitem">
      <div className="result-type-badge space">SPACE</div>

      <h3 className="result-title">
        <a href={`/space/${data.spaceId}`}>
          {nameParts.map((part, i) => (
            part.isHighlighted
              ? <mark key={i}>{part.text}</mark>
              : <span key={i}>{part.text}</span>
          ))}
        </a>
      </h3>

      <div className="result-meta">
        <span className="meta-id" title={data.spaceId}>
          {truncateAddress(data.spaceId)}
        </span>
      </div>

      {descParts.length > 0 && (
        <p className="result-snippet">
          {descParts.map((part, i) => (
            part.isHighlighted
              ? <mark key={i}>{part.text}</mark>
              : <span key={i}>{part.text}</span>
          ))}
        </p>
      )}

      <div className="result-stats">
        <span className="stat" title="Threads">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          {formatNumber(data.threadCount)} threads
        </span>
        <span className="stat" title="Members">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {formatNumber(data.memberCount)} members
        </span>
        {data.isActive && (
          <span className="stat active-badge">
            <span className="active-dot" />
            Active
          </span>
        )}
      </div>

      <div className="space-actions">
        <a href={`/space/${data.spaceId}`} className="action-button primary">
          View Space
        </a>
      </div>
    </article>
  );
});
