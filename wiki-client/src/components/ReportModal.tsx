/**
 * Report Modal - Spam attestation UI (SPEC_12 Section 3)
 *
 * Ported from feed-client's ReportModal.
 * Allows users to report content as spam with PoW proof.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSpamReport, useSpamStatus, type SpamReason } from '../hooks/useRpc';
import { useStoredKeypair } from '@swimchain/frontend';
import './ReportModal.css';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ReportModalProps {
  contentId: string;
  onClose: () => void;
}

const SPAM_REASONS: { value: SpamReason; title: string; desc: string }[] = [
  { value: 'advertising', title: 'Advertising', desc: 'Commercial promotion or spam links' },
  { value: 'repetitive', title: 'Repetitive', desc: 'Duplicate or copy-paste content' },
  { value: 'off_topic', title: 'Off Topic', desc: 'Unrelated to the space/discussion' },
  { value: 'harassment', title: 'Harassment', desc: 'Personal attacks or bullying' },
  { value: 'illegal_content', title: 'Illegal Content', desc: 'Violates law (CSAM, etc.)' },
];

export function ReportModal({ contentId, onClose }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<SpamReason | null>(null);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const { status, refetch: refetchStatus } = useSpamStatus(contentId);
  const { reportSpam, defendContent, submitting, progress, error } = useSpamReport();
  const { keypair, publicKey } = useStoredKeypair();
  const publicKeyHex = useMemo(() => publicKey ? toHex(publicKey) : null, [publicKey]);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  }, []);

  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    const focusableElements = getFocusableElements();
    const firstEl = focusableElements[0];
    if (firstEl) firstEl.focus();
    return () => { previousActiveElement.current?.focus(); };
  }, [getFocusableElements]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) { onClose(); return; }
      if (e.key === 'Tab') {
        const focusableElements = getFocusableElements();
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (!firstElement || !lastElement) return;
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting, getFocusableElements]);

  const handleReport = async () => {
    if (!selectedReason || !keypair || !publicKeyHex) return;
    const signFn = (message: Uint8Array) => keypair.sign(message);
    const { success } = await reportSpam(contentId, selectedReason, publicKeyHex, signFn);
    if (success) { setResult('success'); refetchStatus(); }
    else { setResult('error'); }
  };

  const handleDefend = async () => {
    if (!keypair || !publicKeyHex) return;
    const signFn = (message: Uint8Array) => keypair.sign(message);
    const { success } = await defendContent(contentId, publicKeyHex, signFn);
    if (success) { setResult('success'); refetchStatus(); }
    else { setResult('error'); }
  };

  if (submitting) {
    return (
      <div className="report-modal-overlay" onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}>
        <div className="report-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h3 id="modal-title">Processing Report</h3>
          <div className="report-mining">
            <p>Mining proof of work...</p>
            <div className="mining-progress"><div className="mining-progress-bar" /></div>
            <div className="mining-stats">{progress.attempts.toLocaleString()} attempts ({(progress.elapsedMs / 1000).toFixed(1)}s)</div>
          </div>
        </div>
      </div>
    );
  }

  if (result === 'success') {
    return (
      <div className="report-modal-overlay" onClick={onClose}>
        <div className="report-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="report-success">
            <div className="report-success-icon" aria-hidden="true">&#10003;</div>
            <h4 id="modal-title">Report Submitted</h4>
            <p>Your attestation has been recorded.</p>
            {status && <p>Reports: {status.attestationCount}/{status.spamThreshold} threshold</p>}
          </div>
          <div className="report-modal-actions"><button className="report-cancel" onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="report-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">Report Content</h3>
        {error && <div className="report-error" role="alert">{error}</div>}
        {status && status.attestationCount > 0 && (
          <p>This content has {status.attestationCount} report(s).{status.isFlagged && ' It is currently flagged for accelerated decay.'}</p>
        )}
        <p>Select a reason for reporting this content:</p>
        <fieldset className="report-reasons">
          <legend className="sr-only">Report reason</legend>
          {SPAM_REASONS.map((reason) => (
            <label key={reason.value} className={`reason-option ${selectedReason === reason.value ? 'selected' : ''}`}>
              <input type="radio" name="reason" value={reason.value} checked={selectedReason === reason.value} onChange={() => setSelectedReason(reason.value)} />
              <div className="reason-label">
                <span className="reason-title">{reason.title}</span>
                <span className="reason-desc">{reason.desc}</span>
              </div>
            </label>
          ))}
        </fieldset>
        <div className="report-modal-actions">
          {status && status.isFlagged && (
            <button className="report-cancel defend-btn" onClick={handleDefend} disabled={!keypair} title="Submit counter-attestation to defend this content">Defend</button>
          )}
          <button className="report-cancel" onClick={onClose}>Cancel</button>
          <button className="report-submit" onClick={handleReport} disabled={!selectedReason || !keypair}>Report</button>
        </div>
        {!keypair && <p className="report-identity-hint">Create an identity to report content.</p>}
      </div>
    </div>
  );
}

export function SpamBadge({ contentId }: { contentId: string }) {
  const { status } = useSpamStatus(contentId);
  if (!status || !status.attestationCount || status.attestationCount === 0) return null;
  return <span className={`spam-badge ${status.isFlagged ? 'flagged' : ''}`}>{status.isFlagged ? 'Flagged' : `${status.attestationCount} report(s)`}</span>;
}

export function ReportButton({ onReport }: { onReport: () => void }) {
  return <button className="report-btn" onClick={onReport} title="Report this content">Report</button>;
}
