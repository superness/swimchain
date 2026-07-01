'use client';

import type { SearchResult } from '@/types/search';
import { HeatIndicator } from './HeatIndicator';
import { AddressDisplay } from './AddressDisplay';

interface SearchResultCardProps {
  result: SearchResult;
  showScoreBreakdown?: boolean;
}

/**
 * Display a single search result
 */
export function SearchResultCard({
  result,
  showScoreBreakdown = false,
}: SearchResultCardProps) {
  const heatClass = getHeatClass(result.survivalProbability);
  const timeAgo = formatTimeAgo(result.createdAt);

  return (
    <article className={`result-card ${heatClass}`}>
      <div className="result-header">
        <a href={`/spaces/${encodeURIComponent(result.spaceId)}`} className="space-link">
          s/{result.spaceName}
        </a>
        <span className="separator">&bull;</span>
        <AddressDisplay address={result.authorId} format="short" linkToProfile />
        <span className="separator">&bull;</span>
        <time dateTime={new Date(result.createdAt).toISOString()}>{timeAgo}</time>
      </div>

      <a href={`/s/${encodeURIComponent(result.spaceId)}/${encodeURIComponent(result.contentId)}`} className="result-link">
        <h3 className="result-title">{result.title}</h3>
        {result.body && <p className="result-body">{result.body}</p>}
      </a>

      <div className="result-footer">
        <div className="result-stats">
          <span className="stat">
            <HeatIndicator
              survivalProbability={result.survivalProbability}
              isDecayed={result.isDecayed}
              isProtected={result.isProtected}
              hoursUntilDecay={result.hoursUntilDecay}
              displayMode="numeric"
            />
          </span>

          {result.pool && (
            <span className="stat">
              <PoolIcon />
              {result.pool.contributedSeconds}s/{result.pool.requiredSeconds}s
            </span>
          )}

          <span className="stat">
            <ReplyIcon />
            {result.replyCount} {result.replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </div>

        {showScoreBreakdown && (
          <div className="score-breakdown">
            <span className="score-total">
              Score: {result.scoreBreakdown.totalScore.toFixed(1)}
            </span>
            <details>
              <summary>Details</summary>
              <div className="breakdown-details">
                <div>Text: {result.scoreBreakdown.textRelevance.toFixed(0)}% &times; 40% = {result.scoreBreakdown.contributions.textRelevance.toFixed(1)}</div>
                <div>Heat: {result.scoreBreakdown.heatDecay.toFixed(0)}% &times; 25% = {result.scoreBreakdown.contributions.heatDecay.toFixed(1)}</div>
                <div>Engagement: {result.scoreBreakdown.engagementPool.toFixed(0)}% &times; 20% = {result.scoreBreakdown.contributions.engagementPool.toFixed(1)}</div>
                <div>Recency: {result.scoreBreakdown.recency.toFixed(0)}% &times; 15% = {result.scoreBreakdown.contributions.recency.toFixed(1)}</div>
              </div>
            </details>
          </div>
        )}
      </div>

      <style jsx>{`
        .result-card {
          padding: 1rem 1.25rem;
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          margin-bottom: 0.75rem;
          transition: border-color 0.15s;
        }

        .result-card:hover {
          border-color: var(--color-text-subtle);
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: var(--color-text-muted);
          margin-bottom: 0.5rem;
        }

        .space-link {
          color: var(--color-primary);
        }

        .separator {
          color: var(--color-text-subtle);
        }

        .result-link {
          color: inherit;
          text-decoration: none;
          display: block;
        }

        .result-link:hover .result-title {
          color: var(--color-primary);
        }

        .result-title {
          font-size: 1.1rem;
          font-weight: 500;
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }

        .result-body {
          font-size: 0.9rem;
          color: var(--color-text-muted);
          line-height: 1.5;
          margin-bottom: 0.75rem;
        }

        .result-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .result-stats {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }

        .score-breakdown {
          font-size: 0.75rem;
          color: var(--color-text-subtle);
        }

        .score-total {
          font-family: var(--font-mono);
        }

        details summary {
          cursor: pointer;
          color: var(--color-primary);
        }

        .breakdown-details {
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: var(--color-bg);
          border-radius: 4px;
          font-family: var(--font-mono);
          line-height: 1.6;
        }
      `}</style>
    </article>
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

function PoolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
