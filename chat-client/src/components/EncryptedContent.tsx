/**
 * Component for viewing encrypted content in chat messages
 *
 * Shows a locked state with passphrase input, then decrypted content once unlocked.
 * Adapted from forum-client EncryptedContent for chat-client context.
 */

import { useState, useEffect, useCallback } from 'react';
import { isEncrypted, decryptContent } from '../lib/encryption';
import './EncryptedContent.css';

// Simple localStorage-based passphrase store for chat-client
const PASSPHRASE_KEY = 'swimchain-chat-passphrases';

function getStoredPassphrases(): { perContent: Record<string, string>; defaultPassphrase: string | null } {
  try {
    const raw = localStorage.getItem(PASSPHRASE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { perContent: {}, defaultPassphrase: null };
}

function savePassphrase(contentId: string, passphrase: string): void {
  const store = getStoredPassphrases();
  store.perContent[contentId] = passphrase;
  localStorage.setItem(PASSPHRASE_KEY, JSON.stringify(store));
}

function setDefaultPassphrase(passphrase: string): void {
  const store = getStoredPassphrases();
  store.defaultPassphrase = passphrase;
  localStorage.setItem(PASSPHRASE_KEY, JSON.stringify(store));
}

function getPassphrasesToTry(contentId: string): string[] {
  const store = getStoredPassphrases();
  const results: string[] = [];
  if (store.perContent[contentId]) results.push(store.perContent[contentId]);
  if (store.defaultPassphrase) results.push(store.defaultPassphrase);
  return results;
}

interface EncryptedContentProps {
  contentId: string;
  encryptedBody: string;
  encryptedTitle: string;
  onDecrypted?: (title: string, body: string) => void;
  onLocked?: () => void;
}

export function EncryptedContent({
  contentId,
  encryptedBody,
  encryptedTitle,
  onDecrypted,
  onLocked,
}: EncryptedContentProps): JSX.Element {
  const [passphrase, setPassphrase] = useState('');
  const [decryptedTitle, setDecryptedTitle] = useState<string | null>(null);
  const [decryptedBody, setDecryptedBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [rememberPassphrase, setRememberPassphrase] = useState(true);
  const [setAsDefault, setSetAsDefault] = useState(false);

  const isLocked = decryptedBody === null;

  // Try to auto-decrypt with stored passphrases
  useEffect(() => {
    if (!isEncrypted(encryptedBody)) return;

    const tryPassphrases = async () => {
      const passphrases = getPassphrasesToTry(contentId);
      for (const pass of passphrases) {
        const result = await decryptContent(encryptedBody, pass);
        if (result) {
          setDecryptedTitle(encryptedTitle);
          setDecryptedBody(result);
          onDecrypted?.(encryptedTitle, result);
          return;
        }
      }
    };

    tryPassphrases();
  }, [contentId, encryptedBody, onDecrypted]);

  const handleDecrypt = useCallback(async (pass: string) => {
    if (!pass.trim()) {
      setError('Please enter a passphrase');
      return;
    }

    setDecrypting(true);
    setError(null);

    try {
      const result = await decryptContent(encryptedBody, pass);

      if (result) {
        setDecryptedTitle(encryptedTitle);
        setDecryptedBody(result);

        if (rememberPassphrase) {
          savePassphrase(contentId, pass);
        }
        if (setAsDefault) {
          setDefaultPassphrase(pass);
        }

        onDecrypted?.(encryptedTitle, result);
      } else {
        setError('Incorrect passphrase');
      }
    } catch {
      setError('Decryption failed');
    } finally {
      setDecrypting(false);
    }
  }, [contentId, encryptedBody, rememberPassphrase, setAsDefault, onDecrypted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleDecrypt(passphrase);
  };

  const handleLock = () => {
    setDecryptedTitle(null);
    setDecryptedBody(null);
    setPassphrase('');
    onLocked?.();
  };

  // Not encrypted - show as normal
  if (!isEncrypted(encryptedBody)) {
    return (
      <div className="encrypted-content">
        <h1>{encryptedTitle}</h1>
        <p>{encryptedBody}</p>
      </div>
    );
  }

  // Locked state
  if (isLocked) {
    return (
      <div className="encrypted-content locked">
        <div className="encrypted-lock-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h2>Encrypted Content</h2>
        <p className="encrypted-description">
          This message is encrypted. Enter the passphrase to view it.
        </p>

        <form className="encrypted-form" onSubmit={handleSubmit}>
          <div className="encrypted-input-group">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter passphrase..."
              className="encrypted-input"
              disabled={decrypting}
              autoFocus
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={decrypting || !passphrase.trim()}
            >
              {decrypting ? 'Decrypting...' : 'Unlock'}
            </button>
          </div>

          <label className="encrypted-remember">
            <input
              type="checkbox"
              checked={rememberPassphrase}
              onChange={(e) => setRememberPassphrase(e.target.checked)}
            />
            <span>Remember for this message</span>
          </label>

          <label className="encrypted-remember">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
            />
            <span>Set as default passphrase</span>
          </label>

          {error && <p className="encrypted-error">{error}</p>}
        </form>
      </div>
    );
  }

  // Unlocked state
  return (
    <div className="encrypted-content unlocked">
      <div className="encrypted-header">
        <span className="encrypted-badge unlocked">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
          Decrypted
        </span>
        <button
          className="encrypted-lock-btn"
          onClick={handleLock}
          title="Lock content"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Lock
        </button>
      </div>
      <h1>{decryptedTitle}</h1>
      <div className="encrypted-body">
        <p>{decryptedBody}</p>
      </div>
    </div>
  );
}

/**
 * Badge to indicate content is encrypted
 */
export function EncryptedBadge(): JSX.Element {
  return (
    <span className="encrypted-badge" title="This content is encrypted">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Encrypted
    </span>
  );
}

/**
 * Badge to indicate content was decrypted
 */
export function DecryptedBadge(): JSX.Element {
  return (
    <span className="encrypted-badge unlocked" title="Decrypted with your passphrase">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    </span>
  );
}
