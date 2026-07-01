/**
 * Card displaying a sponsorship offer for browsing or management
 */

import type { SponsorshipOfferSummary } from '../lib/rpc';
import { useDisplayName } from '../hooks/useDisplayName';
import './SponsorshipOfferCard.css';

interface SponsorshipOfferCardProps {
  offer: SponsorshipOfferSummary;
  onClaim?: (offerId: string) => void;
  onCancel?: (offerId: string) => void;
  onViewClaims?: (offerId: string) => void;
  pendingClaimsCount?: number;
  isOwner?: boolean;
  claimDisabled?: boolean;
}

function formatTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;
  if (diff <= 0) return 'expired';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h`;
  return `in ${Math.floor(diff / 60)}m`;
}

export function SponsorshipOfferCard({
  offer,
  onClaim,
  onCancel,
  onViewClaims,
  pendingClaimsCount,
  isOwner = false,
  claimDisabled = false,
}: SponsorshipOfferCardProps): JSX.Element {
  const isExpired = offer.expires_at < Math.floor(Date.now() / 1000);
  const typeLabel = offer.offer_type === 'probationary'
    ? 'Probationary (180-day trial)'
    : offer.offer_type === 'open'
    ? 'Open (full sponsorship)'
    : 'Conditional';

  // Resolve sponsor display name
  const { displayName: sponsorName, loading: nameLoading } = useDisplayName(offer.sponsor_pubkey);

  return (
    <div className={`offer-card ${isExpired ? 'offer-card-expired' : ''}`}>
      <div className="offer-card-header">
        <span className="offer-card-sponsor" title={offer.sponsor_pubkey}>
          Sponsor: {nameLoading ? '...' : sponsorName}
        </span>
        <span className={`offer-card-type offer-card-type-${offer.offer_type}`}>
          {typeLabel}
        </span>
      </div>

      <div className="offer-card-details">
        <div className="offer-card-row">
          <span className="offer-card-label">Slots:</span>
          <span className="offer-card-value">
            {offer.slots_remaining} of {offer.slots_total} remaining
          </span>
        </div>
        <div className="offer-card-row">
          <span className="offer-card-label">Expires:</span>
          <span className="offer-card-value">{formatTimeRemaining(offer.expires_at)}</span>
        </div>
        {offer.requirements.application_required && (
          <div className="offer-card-row">
            <span className="offer-card-label">Requirements:</span>
            <span className="offer-card-value">Application required</span>
          </div>
        )}
        {offer.requirements.min_pow_difficulty > 0 && (
          <div className="offer-card-row">
            <span className="offer-card-label">Min PoW:</span>
            <span className="offer-card-value">{offer.requirements.min_pow_difficulty}</span>
          </div>
        )}
        {isOwner && pendingClaimsCount !== undefined && pendingClaimsCount > 0 && (
          <div className="offer-card-row">
            <span className="offer-card-label">Pending claims:</span>
            <span className="offer-card-value offer-card-pending">{pendingClaimsCount}</span>
          </div>
        )}
      </div>

      <div className="offer-card-actions">
        {!isOwner && onClaim && !isExpired && offer.slots_remaining > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onClaim(offer.offer_id)}
            disabled={claimDisabled}
          >
            Claim This Offer
          </button>
        )}
        {isOwner && onViewClaims && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onViewClaims(offer.offer_id)}
          >
            View Claims{pendingClaimsCount ? ` (${pendingClaimsCount})` : ''}
          </button>
        )}
        {isOwner && onCancel && (
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={() => onCancel(offer.offer_id)}
          >
            Cancel Offer
          </button>
        )}
        {isExpired && (
          <span className="offer-card-expired-label">Expired</span>
        )}
        {!isExpired && offer.slots_remaining === 0 && !isOwner && (
          <span className="offer-card-full-label">Fully claimed</span>
        )}
      </div>
    </div>
  );
}
