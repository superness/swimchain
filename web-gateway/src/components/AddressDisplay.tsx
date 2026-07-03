'use client';

import { withBase } from '@/lib/base-path';
import { useState } from 'react';

type AddressFormat = 'full' | 'short' | 'veryShort';

interface AddressDisplayProps {
  address: string;
  format?: AddressFormat;
  copyable?: boolean;
  linkToProfile?: boolean;
}

/**
 * Format cs1-prefixed address for display
 *
 * Formats from SPEC_01:
 * - Full: cs1q9x7yf8z3k4n5m6p7q8r9s0t1u2v3w4x5y6z7a8b2k4m (62 chars)
 * - Short: cs1q9x7...2k4m (15 chars)
 * - Very short: ...2k4m (7 chars)
 */
function formatAddress(address: string, format: AddressFormat): string {
  if (!address || address.length < 10) {
    return address;
  }

  switch (format) {
    case 'full':
      return address;
    case 'short':
      return `${address.slice(0, 8)}...${address.slice(-4)}`;
    case 'veryShort':
      return `...${address.slice(-4)}`;
    default:
      return address;
  }
}

/**
 * Display a Swimchain address with optional copy and link functionality
 */
export function AddressDisplay({
  address,
  format = 'short',
  copyable = false,
  linkToProfile = false,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const displayText = formatAddress(address, format);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const content = (
    <span className="address-display" title={address}>
      <span className="address-text font-mono">{displayText}</span>
      {copyable && (
        <button
          className="copy-button"
          onClick={handleCopy}
          aria-label="Copy full address"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      )}

      <style jsx>{`
        .address-display {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        .address-text {
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }

        .copy-button {
          background: none;
          border: none;
          padding: 0.125rem;
          cursor: pointer;
          color: var(--color-text-subtle);
          display: flex;
          align-items: center;
          transition: color 0.15s;
        }

        .copy-button:hover {
          color: var(--color-text);
        }
      `}</style>
    </span>
  );

  if (linkToProfile) {
    return (
      <a href={withBase(`/u/${encodeURIComponent(address)}`)} className="address-link">
        {content}
        <style jsx>{`
          .address-link {
            text-decoration: none;
          }
          .address-link:hover {
            text-decoration: underline;
          }
        `}</style>
      </a>
    );
  }

  return content;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
