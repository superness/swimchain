/**
 * Delete Confirmation Modal Component
 *
 * Generic delete confirmation for identity, posts, and replies.
 * Requires user to type "DELETE" to confirm identity deletion.
 * Posts/replies only need a single click (they hide locally since no remove RPC exists).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import './DeleteConfirmModal.css';

type DeleteType = 'identity' | 'post' | 'reply';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  address: string;
  type?: DeleteType;
}

const CONFIRMATION_TEXT = 'DELETE';

const DELETE_CONFIG: Record<DeleteType, { title: string; description: string; itemLabel: string; buttonLabel: string }> = {
  identity: {
    title: 'Delete Identity Permanently?',
    description: 'Your identity and all associated data will be permanently deleted. You will not be able to recover your account unless you have a backup of your seed.',
    itemLabel: 'Identity to delete:',
    buttonLabel: 'Delete Identity',
  },
  post: {
    title: 'Hide Post?',
    description: 'This post will be hidden from your local view. On a decentralized network, other nodes may still retain a copy until it naturally decays.',
    itemLabel: 'Post to hide:',
    buttonLabel: 'Hide Post',
  },
  reply: {
    title: 'Hide Reply?',
    description: 'This reply will be hidden from your local view. On a decentralized network, other nodes may still retain a copy until it naturally decays.',
    itemLabel: 'Reply to hide:',
    buttonLabel: 'Hide Reply',
  },
};

export function DeleteConfirmModal({ isOpen, onClose, onConfirm, address, type = 'identity' }: DeleteConfirmModalProps): JSX.Element | null {
  const [inputValue, setInputValue] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const config = DELETE_CONFIG[type];
  const requiresTypedConfirm = type === 'identity';
  const isConfirmEnabled = requiresTypedConfirm ? inputValue === CONFIRMATION_TEXT : true;

  // Reset input when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setInputValue('');
    }
  }, [isOpen]);

  // Focus trap: get all focusable elements within the modal
  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
  }, []);

  // Focus management: move focus to input on open, restore on close
  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement;
    setTimeout(() => {
      if (requiresTypedConfirm) {
        inputRef.current?.focus();
      }
    }, 0);
    return () => {
      previousActiveElement.current?.focus();
    };
  }, [isOpen, requiresTypedConfirm]);

  // Keyboard handling: Escape to close, Tab trapping
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

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
  }, [isOpen, onClose, getFocusableElements]);

  const handleConfirm = useCallback(() => {
    if (isConfirmEnabled) {
      onConfirm();
      setInputValue('');
    }
  }, [isConfirmEnabled, onConfirm]);

  const handleCancel = useCallback(() => {
    setInputValue('');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay delete-modal-overlay"
      onClick={handleCancel}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCancel(); }}
      role="button"
      tabIndex={-1}
      aria-label="Close modal"
    >
      <div
        className="modal-content delete-modal"
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-description"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header className="modal-header delete-modal-header">
          <div className="delete-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 id="delete-modal-title">{config.title}</h2>
        </header>

        <div className="delete-modal-body">
          <p id="delete-modal-description" className="delete-warning">
            <strong>{requiresTypedConfirm ? 'This action cannot be undone.' : 'Are you sure?'}</strong> {config.description}
          </p>

          <div className="delete-address-info">
            <span className="address-label">{config.itemLabel}</span>
            <code className="address-value">{address}</code>
          </div>

          {requiresTypedConfirm && (
            <div className="delete-confirmation-section">
              <label htmlFor="delete-confirm-input">
                Type <strong>{CONFIRMATION_TEXT}</strong> to confirm deletion:
              </label>
              <input
                type="text"
                id="delete-confirm-input"
                ref={inputRef}
                className="delete-confirm-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                placeholder={CONFIRMATION_TEXT}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        <div className="modal-actions delete-modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
          >
            {config.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;
