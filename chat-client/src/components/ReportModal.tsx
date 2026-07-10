/**
 * Report Modal - Spam reporting UI
 *
 * Allows users to report content as spam.
 * Simplified version for chat-client.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './ReportModal.css';

export type SpamReason = 'advertising' | 'repetitive' | 'off_topic' | 'harassment' | 'illegal_content';

interface ReportModalProps {
  contentId: string;
  onClose: () => void;
  onSubmit?: (contentId: string, reason: SpamReason) => Promise<boolean>;
}

const SPAM_REASONS: { value: SpamReason; title: string; desc: string }[] = [
  { value: 'advertising', title: 'Advertising', desc: 'Commercial promotion or spam links' },
  { value: 'repetitive', title: 'Repetitive', desc: 'Duplicate or copy-paste content' },
  { value: 'off_topic', title: 'Off Topic', desc: 'Unrelated to the channel/discussion' },
  { value: 'harassment', title: 'Harassment', desc: 'Personal attacks or bullying' },
  { value: 'illegal_content', title: 'Illegal Content', desc: 'Violates law (CSAM, etc.)' },
];

export function ReportModal({ contentId, onClose, onSubmit }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<SpamReason | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus trap: get all focusable elements within the modal
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  }, []);

  // Focus management: move focus to modal on open, restore on close
  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    const focusableElements = getFocusableElements();
    const firstEl = focusableElements[0];
    if (firstEl) {
      firstEl.focus();
    }
    return () => {
      previousActiveElement.current?.focus();
    };
  }, [getFocusableElements]);

  // Keyboard handling: Escape to close, Tab trapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
        return;
      }

      // Focus trap: cycle through focusable elements
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
    if (!selectedReason) return;

    setSubmitting(true);
    setError(null);

    try {
      if (onSubmit) {
        const success = await onSubmit(contentId, selectedReason);
        if (success) {
          setResult('success');
        } else {
          setResult('error');
          setError('Failed to submit report');
        }
      } else {
        // No submit handler - just show success for now
        setResult('success');
      }
    } catch (err) {
      setResult('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  // Show submitting state
  if (submitting) {
    return (
      <div className="report-modal-overlay" onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}>
        <div className="report-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h3>Processing Report</h3>
          <div className="report-mining">
            <p>Submitting report...</p>
            <div className="mining-progress">
              <div className="mining-progress-bar" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show success
  if (result === 'success') {
    return (
      <div className="report-modal-overlay" onClick={onClose}>
        <div className="report-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="report-success">
            <div className="report-success-icon">&#10003;</div>
            <h4>Report Submitted</h4>
            <p>Thank you for your report. We'll review this content.</p>
          </div>
          <div className="report-modal-actions">
            <button className="report-cancel" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="report-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">Report Content</h3>

        {error && (
          <div className="report-error" role="alert">{error}</div>
        )}

        <p>Select a reason for reporting this content:</p>

        <div className="report-reasons">
          {SPAM_REASONS.map((reason) => (
            <label
              key={reason.value}
              className={`reason-option ${selectedReason === reason.value ? 'selected' : ''}`}
            >
              <input
                type="radio"
                name="reason"
                value={reason.value}
                checked={selectedReason === reason.value}
                onChange={() => setSelectedReason(reason.value)}
              />
              <div className="reason-label">
                <span className="reason-title">{reason.title}</span>
                <span className="reason-desc">{reason.desc}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="report-modal-actions">
          <button className="report-cancel" onClick={onClose}>Cancel</button>
          <button
            className="report-submit"
            onClick={handleReport}
            disabled={!selectedReason}
          >
            Report
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Report button component
 * Small button to open the report modal
 */
export function ReportButton({ onReport }: { onReport: () => void }) {
  return (
    <button className="report-btn" onClick={onReport} title="Report this content">
      Report
    </button>
  );
}
