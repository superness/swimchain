/**
 * Engagement pool visualization component
 * Per CLIENT_DESIGN.md Section 2.2
 */

import type { PoolState } from '../types';
import './EngagementPool.css';

interface EngagementPoolProps {
  pool: PoolState;
  onContribute?: (seconds: number) => void;
  isContributing?: boolean;
  contributionProgress?: number;
}

export function EngagementPool({
  pool,
  onContribute,
  isContributing = false,
  contributionProgress = 0,
}: EngagementPoolProps): JSX.Element {
  const remaining = pool.requiredSeconds - pool.contributedSeconds;
  const percent = Math.round((pool.contributedSeconds / pool.requiredSeconds) * 100);
  const isComplete = pool.status === 'complete' || pool.status === 'locked';

  return (
    <div className="engagement-pool" role="group" aria-labelledby="pool-label">
      <h3 id="pool-label" className="visually-hidden">Engagement Pool</h3>

      <div className="pool-header">
        <span className="pool-title">Engagement Pool</span>
        {isComplete && (
          <span className="pool-complete badge badge-success">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Persisted
          </span>
        )}
      </div>

      <div
        className="pool-progress"
        role="progressbar"
        aria-valuenow={pool.contributedSeconds}
        aria-valuemin={0}
        aria-valuemax={pool.requiredSeconds}
        aria-label={`${pool.contributedSeconds} of ${pool.requiredSeconds} seconds contributed`}
      >
        <div
          className={`pool-fill ${isComplete ? 'complete' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="pool-stats">
        <span className="pool-time">
          <strong>{pool.contributedSeconds}s</strong> / {pool.requiredSeconds}s
        </span>
        <span className="pool-contributors">
          {pool.contributorCount} contributor{pool.contributorCount !== 1 ? 's' : ''}
        </span>
        {!isComplete && remaining > 0 && (
          <span className="pool-remaining">
            Need {remaining}s more
          </span>
        )}
      </div>

      {onContribute && !isComplete && (
        <div className="pool-actions" role="group" aria-label="Contribute">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onContribute(5)}
            disabled={isContributing}
            aria-label="Contribute 5 seconds"
          >
            +5s Quick
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onContribute(15)}
            disabled={isContributing}
            aria-label="Contribute 15 seconds"
          >
            +15s Standard
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onContribute(30)}
            disabled={isContributing}
            aria-label="Contribute 30 seconds"
          >
            +30s Champion
          </button>
        </div>
      )}

      {isContributing && (
        <div className="pool-contributing">
          <div className="contributing-progress">
            <div
              className="contributing-fill"
              style={{ width: `${contributionProgress}%` }}
            />
          </div>
          <span>Mining contribution...</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact pool badge for use in lists
 */
export function EngagementPoolBadge({ pool }: { pool: PoolState }): JSX.Element {
  const percent = Math.round((pool.contributedSeconds / pool.requiredSeconds) * 100);

  return (
    <span
      className={`pool-badge pool-badge-${pool.status}`}
      title={`${pool.contributedSeconds}/${pool.requiredSeconds}s - ${pool.contributorCount} contributors`}
    >
      {pool.status === 'complete' || pool.status === 'locked' ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <span className="pool-badge-percent">{percent}%</span>
      )}
    </span>
  );
}
