'use client';

import type { IdentitySummary } from '@/lib/node-service';
import { AddressDisplay } from './AddressDisplay';
import { addressToColor } from '@/lib/address';

interface IdentityCardProps {
  identity: IdentitySummary;
  showFullAddress?: boolean;
}

/**
 * Display identity information card (live profile + activity stats)
 */
export function IdentityCard({
  identity,
  showFullAddress = false,
}: IdentityCardProps) {
  const identityColor = addressToColor(identity.address);
  const ageText =
    identity.firstSeen != null
      ? formatAge(Math.floor((Date.now() - identity.firstSeen) / 1000))
      : 'No recorded activity';
  const firstSeenText =
    identity.firstSeen != null
      ? new Date(identity.firstSeen).toLocaleDateString()
      : 'Never active';

  return (
    <div className="identity-card">
      <div className="identity-header">
        <div className="identity-avatar" style={{ backgroundColor: identityColor }}>
          <span className="avatar-letter">
            {identity.address.slice(-2).toUpperCase()}
          </span>
        </div>

        <div className="identity-info">
          {identity.displayName && (
            <span className="identity-display-name">{identity.displayName}</span>
          )}
          <AddressDisplay
            address={identity.address}
            format={showFullAddress ? 'full' : 'short'}
            copyable
          />
          <span className="identity-age">{ageText}</span>
        </div>
      </div>

      {identity.bio && <p className="identity-bio">{identity.bio}</p>}

      <div className="identity-stats">
        <div className="stat">
          <span className="stat-value">{identity.postCount}</span>
          <span className="stat-label">Posts</span>
        </div>
        <div className="stat">
          <span className="stat-value">{identity.replyCount}</span>
          <span className="stat-label">Replies</span>
        </div>
      </div>

      <div className="identity-meta">
        <span>First seen: {firstSeenText}</span>
        {identity.website && (
          <span className="identity-website">
            <a href={identity.website} rel="nofollow noopener noreferrer" target="_blank">
              {identity.website}
            </a>
          </span>
        )}
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

        .identity-display-name {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .identity-age {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }

        .identity-bio {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 1rem;
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
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
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
