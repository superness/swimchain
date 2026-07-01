'use client';

import type { PoolSummary } from '@/types/gateway';

interface PoolDisplayProps {
  pool: PoolSummary;
  showContributors?: boolean;
}

/**
 * Display engagement pool progress
 */
export function PoolDisplay({
  pool,
  showContributors = true,
}: PoolDisplayProps) {
  const progress = pool.progressPercentage;
  const isComplete = pool.contributedSeconds >= pool.requiredSeconds;

  return (
    <div className="pool-display">
      <div className="pool-header">
        <span className="pool-title">Engagement Pool</span>
        {isComplete && <span className="pool-complete">Complete</span>}
      </div>

      <div className="pool-bar-container">
        <div
          className="pool-bar-fill"
          style={{ width: `${progress}%` }}
          data-complete={isComplete}
        />
      </div>

      <div className="pool-stats">
        <span className="pool-progress">
          {pool.contributedSeconds}s / {pool.requiredSeconds}s
        </span>

        {showContributors && (
          <span className="pool-contributors">
            {pool.contributorCount} contributor{pool.contributorCount !== 1 ? 's' : ''}
          </span>
        )}

        {!isComplete && (
          <span className="pool-remaining">
            Need {pool.requiredSeconds - pool.contributedSeconds}s more to persist
          </span>
        )}
      </div>

      <div className="pool-info">
        <span className="info-icon">ℹ</span>
        <span>
          {isComplete
            ? 'This content has enough engagement to persist.'
            : 'Content needs engagement to persist. Download a full client to contribute.'}
        </span>
      </div>

      <style jsx>{`
        .pool-display {
          padding: 1rem;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: 6px;
        }

        .pool-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }

        .pool-title {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--color-text);
        }

        .pool-complete {
          font-size: 0.75rem;
          color: var(--color-success);
          background: rgba(34, 197, 94, 0.1);
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
        }

        .pool-bar-container {
          height: 8px;
          background: var(--color-bg-elevated);
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .pool-bar-fill {
          height: 100%;
          background: var(--color-warning);
          border-radius: 4px;
          transition: width 0.3s ease;
        }

        .pool-bar-fill[data-complete="true"] {
          background: var(--color-success);
        }

        .pool-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
          font-size: 0.8rem;
          color: var(--color-text-muted);
          margin-bottom: 0.75rem;
        }

        .pool-progress {
          font-family: var(--font-mono);
        }

        .pool-remaining {
          color: var(--color-warning);
        }

        .pool-info {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: var(--color-text-subtle);
          padding-top: 0.5rem;
          border-top: 1px solid var(--color-border);
        }

        .info-icon {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
