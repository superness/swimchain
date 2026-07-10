/**
 * SponsorshipBanner — persistent notice shown when the current identity is NOT
 * sponsored. An unsponsored identity cannot create or edit wiki pages (SPEC_11);
 * the node rejects such writes, so without this banner an unsponsored user only
 * discovers the problem as a cryptic failure when they try to save a page.
 *
 * Mirrors the pattern in forum-client / feed-client (their SponsorshipBanner),
 * adapted to wiki's LIGHT theme and to wiki's identity/RPC hooks. Wiki has no
 * dedicated /sponsorship page, so the "get sponsored" affordance is inline: it
 * explains how sponsorship works and surfaces the user's public key to share
 * with an existing member. Works in both node (desktop) and browser modes —
 * the public key is available from useWikiIdentity in either mode.
 */

import { useState } from 'react';
import { useIsSponsored } from '../hooks/useIsSponsored';
import { useWikiIdentity } from '../hooks/useWikiIdentity';
import './SponsorshipBanner.css';

export function SponsorshipBanner(): JSX.Element | null {
  const isSponsored = useIsSponsored();
  const { hasIdentity, isLoading, publicKey } = useWikiIdentity();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Only show once we have a usable identity, the identity/mode is resolved, and
  // the node has told us the identity is definitively NOT sponsored. `null` means
  // unknown (still checking or RPC unavailable) — stay quiet, the node remains the
  // authoritative gate.
  const shouldShow = hasIdentity && !isLoading && isSponsored === false;
  if (!shouldShow) {
    return null;
  }

  const handleCopy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (insecure context) — ignore silently.
    }
  };

  return (
    <div className="wiki-sponsor-banner" role="alert">
      <div className="wiki-sponsor-banner__row">
        <svg
          className="wiki-sponsor-banner__icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="wiki-sponsor-banner__text">
          <strong>Your identity is not sponsored.</strong>{' '}
          <span>
            You need sponsorship from an existing member before you can create or
            edit pages.
          </span>
        </div>
        <button
          type="button"
          className="wiki-sponsor-banner__action"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide' : 'Get Sponsored'}
        </button>
      </div>

      {expanded && (
        <div className="wiki-sponsor-banner__details">
          <ol className="wiki-sponsor-banner__steps">
            <li>Share your public key (below) with an existing sponsored member.</li>
            <li>They create a sponsorship offer or invite for your key.</li>
            <li>
              Once your identity is recorded on-chain you can create and edit wiki
              pages — no proof-of-work is spent until then.
            </li>
          </ol>
          {publicKey && (
            <div className="wiki-sponsor-banner__pubkey">
              <span className="wiki-sponsor-banner__pubkey-label">
                Your public key:
              </span>
              <code className="wiki-sponsor-banner__pubkey-code">{publicKey}</code>
              <button
                type="button"
                className="wiki-sponsor-banner__copy"
                onClick={handleCopy}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
