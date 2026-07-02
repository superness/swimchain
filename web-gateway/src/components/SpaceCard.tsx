'use client';

import type { SpaceActivitySummary } from '@/types/gateway';

interface SpaceCardProps {
  space: SpaceActivitySummary;
}

/**
 * Display a space in card format
 */
export function SpaceCard({ space }: SpaceCardProps) {
  const healthPercentage = space.decay_health;
  const healthClass = getHealthClass(healthPercentage);
  const lastActivityAgo =
    space.last_activity > 0 ? formatTimeAgo(space.last_activity) : 'unknown';
  const createdDate =
    space.created_at > 0
      ? new Date(space.created_at).toLocaleDateString()
      : 'unknown';

  return (
    <article className="space-card">
      <a href={`/spaces/${encodeURIComponent(space.space_id)}`} className="space-link">
        <header className="space-header">
          <h3 className="space-name">s/{space.space_name}</h3>
          <span className="space-id font-mono text-subtle">{formatSpaceId(space.space_id)}</span>
        </header>

        {space.description && (
          <p className="space-description">{space.description}</p>
        )}

        <div className="space-stats">
          <span className="stat">
            <strong>{space.post_count}</strong> posts
          </span>
          <span className="separator">&bull;</span>
          <span className="stat">
            <strong>{space.active_posts}</strong> active
          </span>
          <span className="separator">&bull;</span>
          <span className="stat">
            <strong>{space.unique_participants}</strong> participants
          </span>
        </div>

        <div className="space-meta">
          <span>Created: {createdDate}</span>
          <span>Last activity: {lastActivityAgo}</span>
        </div>

        <div className="space-health">
          <span className="health-label">Health:</span>
          <div className="health-bar">
            <div
              className={`health-fill ${healthClass}`}
              style={{ width: `${healthPercentage}%` }}
            />
          </div>
          <span className="health-value">{healthPercentage}%</span>
        </div>
      </a>

      <style jsx>{`
        .space-card {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          transition: border-color 0.15s;
        }

        .space-card:hover {
          border-color: var(--color-text-subtle);
        }

        .space-link {
          display: block;
          padding: 1.25rem;
          text-decoration: none;
          color: inherit;
        }

        .space-header {
          margin-bottom: 0.75rem;
        }

        .space-name {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: 0.25rem;
        }

        .space-link:hover .space-name {
          color: var(--color-primary);
        }

        .space-id {
          font-size: 0.75rem;
        }

        .space-description {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 0.75rem;
        }

        .space-stats {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--color-text-muted);
          margin-bottom: 0.5rem;
        }

        .stat strong {
          color: var(--color-text);
        }

        .separator {
          color: var(--color-text-subtle);
        }

        .space-meta {
          display: flex;
          gap: 1rem;
          font-size: 0.8rem;
          color: var(--color-text-subtle);
          margin-bottom: 0.75rem;
        }

        .space-health {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .health-label {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }

        .health-bar {
          flex: 1;
          max-width: 150px;
          height: 8px;
          background: var(--color-bg);
          border-radius: 4px;
          overflow: hidden;
        }

        .health-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s;
        }

        .health-fill.health-good {
          background: var(--color-success);
        }

        .health-fill.health-moderate {
          background: var(--color-warning);
        }

        .health-fill.health-low {
          background: var(--color-error);
        }

        .health-value {
          font-size: 0.8rem;
          font-family: var(--font-mono);
          color: var(--color-text-muted);
          min-width: 3ch;
        }
      `}</style>
    </article>
  );
}

function getHealthClass(health: number): string {
  if (health >= 70) return 'health-good';
  if (health >= 40) return 'health-moderate';
  return 'health-low';
}

function formatSpaceId(spaceId: string): string {
  if (spaceId.length <= 20) return spaceId;
  return `sp1${spaceId.slice(0, 8)}...${spaceId.slice(-4)}`;
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
