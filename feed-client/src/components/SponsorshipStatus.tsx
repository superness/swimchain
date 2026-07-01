/**
 * Component showing sponsorship status details for the current user
 */

import { useState } from 'react';
import { useSponsorship } from '../hooks/useSponsorship';
import { useIdentityContext } from '../providers/IdentityProvider';
import './SponsorshipStatus.css';

export function SponsorshipStatus(): JSX.Element {
  const { isSponsored, sponsorPubkey, detail } = useSponsorship();
  const { identity } = useIdentityContext();
  const [copied, setCopied] = useState(false);

  const copyPubkey = async () => {
    if (identity?.publicKey) {
      await navigator.clipboard.writeText(identity.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!identity) {
    return (
      <div className="sponsorship-status">
        <p className="sponsorship-status__empty">No identity loaded.</p>
      </div>
    );
  }

  if (isSponsored) {
    return (
      <div className="sponsorship-status">
        <h3>Sponsorship Status</h3>
        <div className="sponsorship-status__grid">
          <div className="sponsorship-status__row">
            <span className="sponsorship-status__label">Status:</span>
            <span className="sponsorship-status__value sponsorship-status__value--active">Active</span>
          </div>
          {sponsorPubkey && (
            <div className="sponsorship-status__row">
              <span className="sponsorship-status__label">Sponsored by:</span>
              <span className="sponsorship-status__value sponsorship-status__value--mono">
                {sponsorPubkey.substring(0, 8)}...{sponsorPubkey.substring(sponsorPubkey.length - 4)}
              </span>
            </div>
          )}
          {detail && (
            <>
              {detail.isGenesis && (
                <div className="sponsorship-status__row">
                  <span className="sponsorship-status__label">Type:</span>
                  <span className="sponsorship-status__value">Genesis identity</span>
                </div>
              )}
              {detail.probationary && (
                <div className="sponsorship-status__row">
                  <span className="sponsorship-status__label">Probation:</span>
                  <span className="sponsorship-status__value sponsorship-status__value--warn">Active (180-day trial)</span>
                </div>
              )}
              {detail.isUnderPenalty && (
                <div className="sponsorship-status__row">
                  <span className="sponsorship-status__label">Penalty:</span>
                  <span className="sponsorship-status__value sponsorship-status__value--error">Under penalty</span>
                </div>
              )}
              <div className="sponsorship-status__row">
                <span className="sponsorship-status__label">Depth:</span>
                <span className="sponsorship-status__value">{detail.depth}</span>
              </div>
              {detail.createdAt && (
                <div className="sponsorship-status__row">
                  <span className="sponsorship-status__label">Since:</span>
                  <span className="sponsorship-status__value">
                    {new Date(detail.createdAt * 1000).toLocaleDateString()}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sponsorship-status">
      <h3>Sponsorship Status</h3>
      <div className="sponsorship-status__grid">
        <div className="sponsorship-status__row">
          <span className="sponsorship-status__label">Status:</span>
          <span className="sponsorship-status__value sponsorship-status__value--not-sponsored">Not sponsored</span>
        </div>
      </div>

      <div className="sponsorship-status__pubkey-section">
        <p className="sponsorship-status__pubkey-label">Your public key (share this with potential sponsors):</p>
        <div className="sponsorship-status__pubkey-box">
          <code className="sponsorship-status__pubkey-code">{identity.publicKey}</code>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={copyPubkey}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="sponsorship-status__pubkey-hint">
          Share this with an existing member who can sponsor you,
          or browse the "Find a Sponsor" tab to claim an open offer.
        </p>
      </div>
    </div>
  );
}
