/**
 * Card displaying a sponsorship offer for browsing or management
 */

import type { SponsorshipOfferSummary } from '../lib/rpc';
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

function formatAddress(pubkey: string): string {
  if (pubkey.length <= 16) return pubkey;
  return `${pubkey.substring(0, 8)}...${pubkey.substring(pubkey.length - 4)}`;
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

  return (
    <div className={`offer-card ${isExpired ? 'offer-card--expired' : ''}`}>
      <div className="offer-card__header">
        <span className="offer-card__sponsor">
          Sponsor: {formatAddress(offer.sponsor_pubkey)}
        </span>
        <span className={`offer-card__type offer-card__type--${offer.offer_type}`}>
          {typeLabel}
        </span>
      </div>

      <div className="offer-card__details">
        <div className="offer-card__row">
          <span className="offer-card__label">Slots:</span>
          <span className="offer-card__value">
            {offer.slots_remaining} of {offer.slots_total} remaining
          </span>
        </div>
        <div className="offer-card__row">
          <span className="offer-card__label">Expires:</span>
          <span className="offer-card__value">{formatTimeRemaining(offer.expires_at)}</span>
        </div>
        {offer.requirements.application_required && (
          <div className="offer-card__row">
            <span className="offer-card__label">Requirements:</span>
            <span className="offer-card__value">Application required</span>
          </div>
        )}
        {offer.requirements.min_pow_difficulty > 0 && (
          <div className="offer-card__row">
            <span className="offer-card__label">Min PoW:</span>
            <span className="offer-card__value">{offer.requirements.min_pow_difficulty}</span>
          </div>
        )}
        {isOwner && pendingClaimsCount !== undefined && pendingClaimsCount > 0 && (
          <div className="offer-card__row">
            <span className="offer-card__label">Pending claims:</span>
            <span className="offer-card__value offer-card__value--pending">{pendingClaimsCount}</span>
          </div>
        )}
      </div>

      <div className="offer-card__actions">
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
          <span className="offer-card__expired-label">Expired</span>
        )}
        {!isExpired && offer.slots_remaining === 0 && !isOwner && (
          <span className="offer-card__full-label">Fully claimed</span>
        )}
      </div>
    </div>
  );
}
