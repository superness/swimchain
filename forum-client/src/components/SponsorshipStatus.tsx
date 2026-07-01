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
        <p className="status-empty">No identity loaded.</p>
      </div>
    );
  }

  if (isSponsored) {
    return (
      <div className="sponsorship-status">
        <h3>Sponsorship Status</h3>
        <div className="status-grid">
          <div className="status-row">
            <span className="status-label">Status:</span>
            <span className="status-value status-active">Active</span>
          </div>
          {sponsorPubkey && (
            <div className="status-row">
              <span className="status-label">Sponsored by:</span>
              <span className="status-value status-mono">
                {sponsorPubkey.substring(0, 8)}...{sponsorPubkey.substring(sponsorPubkey.length - 4)}
              </span>
            </div>
          )}
          {detail && (
            <>
              {detail.isGenesis && (
                <div className="status-row">
                  <span className="status-label">Type:</span>
                  <span className="status-value">Genesis identity</span>
                </div>
              )}
              {detail.probationary && (
                <div className="status-row">
                  <span className="status-label">Probation:</span>
                  <span className="status-value status-warn">Active (180-day trial)</span>
                </div>
              )}
              {detail.isUnderPenalty && (
                <div className="status-row">
                  <span className="status-label">Penalty:</span>
                  <span className="status-value status-error">Under penalty</span>
                </div>
              )}
              <div className="status-row">
                <span className="status-label">Depth:</span>
                <span className="status-value">{detail.depth}</span>
              </div>
              {detail.createdAt && (
                <div className="status-row">
                  <span className="status-label">Since:</span>
                  <span className="status-value">
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
      <div className="status-grid">
        <div className="status-row">
          <span className="status-label">Status:</span>
          <span className="status-value status-not-sponsored">Not sponsored</span>
        </div>
      </div>

      <div className="status-pubkey-section">
        <p className="status-pubkey-label">Your public key (share this with potential sponsors):</p>
        <div className="status-pubkey-box">
          <code className="status-pubkey-code">{identity.publicKey}</code>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={copyPubkey}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="status-pubkey-hint">
          Share this with an existing member who can sponsor you,
          or browse the "Find a Sponsor" tab to claim an open offer.
        </p>
      </div>
    </div>
  );
}
