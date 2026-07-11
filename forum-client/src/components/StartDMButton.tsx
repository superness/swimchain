/**
 * Start DM Button
 *
 * DMs live in the chat client, so from the forum we ask the node to set up the DM
 * (request_dm_managed — the node holds the key, does the crypto + PoW, and accepts a
 * cs1 address or hex) and then hand off to the chat client via the desktop shell's
 * SWIMCHAIN_NAVIGATE message. (The old browser-mode crypto flow never worked in the
 * desktop, where the node — not the browser — owns the identity.)
 */

import { useState, useCallback } from 'react';
import { useRpc } from '../hooks/useRpc';
import { useSponsorship } from '../hooks/useSponsorship';
import './StartDMButton.css';

interface StartDMButtonProps {
  recipientPk: string;
  recipientName?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function StartDMButton({
  recipientPk,
  recipientName,
  variant = 'primary',
  size = 'md',
  showIcon = true,
  className = '',
}: StartDMButtonProps): JSX.Element | null {
  const { rpc, connected } = useRpc();
  const { isSponsored } = useSponsorship();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setError(null);
    // DMs are participation — same sponsorship gate as posting.
    if (isSponsored === false) {
      setError('You need a sponsor before you can DM.');
      return;
    }
    if (!rpc || !connected) {
      setError('Not connected to a node.');
      return;
    }
    setLoading(true);
    try {
      const res = (await rpc.call('request_dm_managed', { recipient: recipientPk })) as {
        space_id: string;
      };
      // Hand off to the chat client (where DMs live) via the desktop shell.
      window.parent.postMessage(
        { type: 'SWIMCHAIN_NAVIGATE', client: 'chat', path: `/channels/@me/${res.space_id}` },
        '*'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start DM');
    } finally {
      setLoading(false);
    }
  }, [loading, isSponsored, rpc, connected, recipientPk]);

  const label = loading ? 'Opening…' : `Message${recipientName ? ` ${recipientName}` : ''}`;

  return (
    <button
      type="button"
      className={`start-dm-button ${variant} ${size} ${className}`}
      onClick={handleClick}
      disabled={loading}
      title={error || `Message ${recipientName || recipientPk.slice(0, 10)}…`}
    >
      {showIcon && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="dm-icon">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      <span>{error ? error : label}</span>
    </button>
  );
}

export default StartDMButton;
