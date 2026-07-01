'use client';

import type { ReputationSummary } from '@/types/gateway';
import { AddressDisplay } from './AddressDisplay';
import { addressToColor } from '@/lib/address';

interface IdentityCardProps {
  identity: ReputationSummary;
  showFullAddress?: boolean;
}

/**
 * Display identity information card
 */
export function IdentityCard({
  identity,
  showFullAddress = false,
}: IdentityCardProps) {
  const identityColor = addressToColor(identity.identity);
  const ageText = formatAge(identity.age_seconds);
  const firstBlockText = identity.first_block > 0 ? `Block #${identity.first_block}` : 'Never active';

  return (
    <div className="identity-card">
      <div className="identity-header">
        <div className="identity-avatar" style={{ backgroundColor: identityColor }}>
          <span className="avatar-letter">
            {identity.identity.slice(-2).toUpperCase()}
          </span>
        </div>

        <div className="identity-info">
          <AddressDisplay
            address={identity.identity}
            format={showFullAddress ? 'full' : 'short'}
            copyable
          />
          <span className="identity-age">{ageText}</span>
        </div>
      </div>

      <div className="identity-stats">
        <div className="stat">
          <span className="stat-value">{identity.post_count}</span>
          <span className="stat-label">Posts</span>
        </div>
        <div className="stat">
          <span className="stat-value">{identity.reply_count}</span>
          <span className="stat-label">Replies</span>
        </div>
        <div className="stat">
          <span className="stat-value">{identity.received_replies}</span>
          <span className="stat-label">Received</span>
        </div>
      </div>

      <div className="identity-meta">
        <span>First seen: {firstBlockText}</span>
      </div>

      <style jsx>{`
        .identity-card {
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
        }

        .identity-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .identity-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .avatar-letter {
          font-size: 1.2rem;
          font-weight: 600;
          color: white;
          font-family: var(--font-mono);
        }

        .identity-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .identity-age {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }

        .identity-stats {
          display: flex;
          gap: 2rem;
          padding: 1rem 0;
          border-top: 1px solid var(--color-border);
          border-bottom: 1px solid var(--color-border);
        }

        .stat {
          display: flex;
          flex-direction: column;
        }

        .stat-value {
          font-size: 1.5rem;
          font-weight: 600;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .identity-meta {
          margin-top: 1rem;
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) {
    return 'New identity';
  }

  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(seconds / 86400);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return `${years} year${years !== 1 ? 's' : ''} old`;
  }
  if (months > 0) {
    return `${months} month${months !== 1 ? 's' : ''} old`;
  }
  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''} old`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} old`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''} old`;
}
