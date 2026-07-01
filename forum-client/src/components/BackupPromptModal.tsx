/**
 * Backup Prompt Modal Component
 *
 * Shows after identity creation to prompt users to backup their seed.
 * Blocks navigation until dismissed to prevent accidental key loss.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import './BackupPromptModal.css';

interface BackupPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  seed: string;
  address: string;
}

export function BackupPromptModal({ isOpen, onClose, seed, address }: BackupPromptModalProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

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
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement;
    const focusableElements = getFocusableElements();
    const firstEl = focusableElements[0];
    if (firstEl) {
      firstEl.focus();
    }
    return () => {
      previousActiveElement.current?.focus();
    };
  }, [isOpen, getFocusableElements]);

  // Keyboard handling: Tab trapping (no Escape - must acknowledge)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [isOpen, getFocusableElements]);

  const handleCopySeed = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(seed);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy seed:', err);
    }
  }, [seed]);

  const handleDownload = useCallback(() => {
    const content = `Swimchain Identity Backup
========================

Address: ${address}
Seed (Private Key): ${seed}

IMPORTANT: Keep this file secure and never share your seed with anyone.
Anyone with access to your seed can control your identity.

Generated: ${new Date().toISOString()}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swimchain-backup-${address.slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [seed, address]);

  const handleContinue = useCallback(() => {
    if (acknowledged) {
      onClose();
    }
  }, [acknowledged, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay backup-modal-overlay">
      <div
        className="modal-content backup-modal"
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="backup-modal-title"
        aria-describedby="backup-modal-description"
      >
        <header className="modal-header backup-modal-header">
          <div className="backup-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 id="backup-modal-title">Backup Your Identity</h2>
        </header>

        <div className="backup-modal-body">
          <p id="backup-modal-description" className="backup-warning">
            Your identity has been created. <strong>Save your backup key now</strong> -
            if you lose it, you will permanently lose access to your identity.
          </p>

          <div className="backup-seed-section">
            <label htmlFor="seed-display">Your Backup Key (Seed)</label>
            <div className="seed-display-wrapper">
              <input
                type={showSeed ? 'text' : 'password'}
                id="seed-display"
                className="seed-display"
                value={seed}
                readOnly
                aria-describedby="seed-security-note"
              />
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setShowSeed(!showSeed)}
                aria-label={showSeed ? 'Hide seed' : 'Show seed'}
              >
                {showSeed ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <p id="seed-security-note" className="seed-note">
              This 64-character key is the only way to recover your identity.
            </p>
          </div>

          <div className="backup-actions">
            <button
              type="button"
              className="btn btn-secondary backup-action-btn"
              onClick={handleCopySeed}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button
              type="button"
              className="btn btn-secondary backup-action-btn"
              onClick={handleDownload}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Backup File
            </button>
          </div>

          <div className="backup-acknowledgment">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>I have saved my backup key and understand that losing it means permanent loss of my identity</span>
            </label>
          </div>
        </div>

        <div className="modal-actions backup-modal-actions">
          <button
            type="button"
            className="btn btn-primary btn-large"
            onClick={handleContinue}
            disabled={!acknowledged}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default BackupPromptModal;
