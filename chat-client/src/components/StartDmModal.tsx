import { useState, useCallback } from 'react';
import { useIdentityContext } from '@swimchain/frontend';
import { useDm } from '../hooks/useDm';
import './StartDmModal.css';

interface StartDmModalProps {
  onClose: () => void;
}

export function StartDmModal({ onClose }: StartDmModalProps): JSX.Element {
  const { identity } = useIdentityContext();
  const { sendRequest, activeDms } = useDm();
  const [targetPk, setTargetPk] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPk.trim() || !identity?.seed) return;
    const cleaned = targetPk.trim().toLowerCase();
    if (!cleaned.startsWith('cs1') && cleaned.length < 16) { setError('Enter a valid Swimchain address (cs1...)'); return; }
    if (cleaned === identity.publicKey.toLowerCase()) { setError('You cannot DM yourself'); return; }
    if (activeDms.some(d => d.otherPk.toLowerCase() === cleaned)) { setError('DM already exists'); return; }
    setSending(true); setError(null);
    const ok = await sendRequest(cleaned);
    if (ok) { setSuccess(true); setTimeout(onClose, 1000); }
    else setError('Failed to send request');
    setSending(false);
  }, [targetPk, identity, activeDms, sendRequest, onClose]);

  return (
    <div className="dm-modal-overlay" onClick={onClose} role="presentation">
      <div className="dm-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="New DM">
        <div className="dm-modal-header">
          <h2>New Direct Message</h2>
          <button className="dm-modal-close" onClick={onClose} type="button">✕</button>
        </div>
        {success ? (
          <div className="dm-modal-success"><p>Request sent!</p></div>
        ) : (
          <form onSubmit={handleSubmit} className="dm-modal-form">
            <label htmlFor="dm-target">Enter Swimchain address:</label>
            <input id="dm-target" type="text" placeholder="cs1..." value={targetPk}
              onChange={e => setTargetPk(e.target.value)} autoFocus disabled={sending} />
            {error && <p className="dm-modal-error">{error}</p>}
            <div className="dm-modal-actions">
              <button type="button" onClick={onClose} disabled={sending}>Cancel</button>
              <button type="submit" disabled={sending || !targetPk.trim()}>
                {sending ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
