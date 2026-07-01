/**
 * Address display component with copy functionality
 */

import { useState, useCallback } from 'react';
import './AddressDisplay.css';

interface AddressDisplayProps {
  address: string;
  chars?: number;
  showCopy?: boolean;
  className?: string;
}

export function AddressDisplay({
  address,
  chars = 6,
  showCopy = true,
  className = '',
}: AddressDisplayProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const truncated =
    address.length <= chars * 2 + 3
      ? address
      : `${address.slice(0, chars)}...${address.slice(-chars)}`;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }, [address]);

  return (
    <span className={`address-display ${className}`}>
      <code className="address-display__text" title={address}>
        {truncated}
      </code>
      {showCopy && (
        <button
          className="address-display__copy"
          onClick={handleCopy}
          title={copied ? 'Copied!' : 'Copy address'}
          aria-label={copied ? 'Address copied' : 'Copy address'}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      )}
    </span>
  );
}
