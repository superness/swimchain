/**
 * Component for viewing encrypted content in the feed
 *
 * Shows a locked state with passphrase input, then decrypted content once unlocked.
 */

import { useState, useEffect, useCallback } from 'react';
import { isEncrypted, decryptPost } from '../lib/encryption';
import { usePassphraseStore } from '../hooks/usePassphraseStore';
import './EncryptedContent.css';

interface EncryptedContentProps {
  /** Content ID for passphrase storage */
  contentId: string;
  /** The encrypted body content */
  encryptedBody: string;
  /** Original title (usually "[Encrypted Post]") */
  encryptedTitle: string;
  /** Callback when content is decrypted */
  onDecrypted?: (title: string, body: string) => void;
  /** Callback when content is locked (user clicks lock button) */
  onLocked?: () => void;
}

export function EncryptedContent({
  contentId,
  encryptedBody,
  encryptedTitle,
  onDecrypted,
  onLocked,
}: EncryptedContentProps): JSX.Element {
  const { getPassphrasesToTry, savePassphrase, setDefaultPassphrase, hasDefaultPassphrase } = usePassphraseStore();
  const [passphrase, setPassphrase] = useState('');
  const [decryptedTitle, setDecryptedTitle] = useState<string | null>(null);
  const [decryptedBody, setDecryptedBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [rememberPassphrase, setRememberPassphrase] = useState(true);
  const [setAsDefault, setSetAsDefault] = useState(!hasDefaultPassphrase);

  const isLocked = decryptedBody === null;

  // Try to auto-decrypt with stored passphrases (content-specific first, then default)
  useEffect(() => {
    if (!isEncrypted(encryptedBody)) return;

    const tryPassphrases = async () => {
      const passphrases = getPassphrasesToTry(contentId);
      for (const pass of passphrases) {
        const result = await decryptPost(encryptedBody, pass);
        if (result) {
          setDecryptedTitle(result.title);
          setDecryptedBody(result.body);
          onDecrypted?.(result.title, result.body);
          return;
        }
      }
    };

    tryPassphrases();
  }, [contentId, encryptedBody, getPassphrasesToTry, onDecrypted]);

  const handleDecrypt = useCallback(async (pass: string, isManual: boolean) => {
    if (!pass.trim()) {
      setError('Please enter a passphrase');
      return;
    }

    setDecrypting(true);
    setError(null);

    try {
      const result = await decryptPost(encryptedBody, pass);

      if (result) {
        setDecryptedTitle(result.title);
        setDecryptedBody(result.body);

        if (isManual) {
          if (rememberPassphrase) {
            savePassphrase(contentId, pass);
          }
          if (setAsDefault) {
            setDefaultPassphrase(pass);
          }
        }

        onDecrypted?.(result.title, result.body);
      } else {
        setError('Incorrect passphrase');
        setDecryptedTitle(null);
        setDecryptedBody(null);
      }
    } catch (err) {
      setError('Decryption failed');
      console.error('[EncryptedContent] Decrypt error:', err);
    } finally {
      setDecrypting(false);
    }
  }, [contentId, encryptedBody, rememberPassphrase, setAsDefault, savePassphrase, setDefaultPassphrase, onDecrypted]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleDecrypt(passphrase, true);
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
          This post is encrypted. Enter the passphrase to view it.
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
            <span>Remember for this post</span>
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
 * Badge to indicate content was encrypted but is now decrypted
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

/**
 * Inline passphrase input for unlocking in feed lists
 */
export function InlineUnlock({
  contentId,
  encryptedBody,
  onDecrypted,
}: {
  contentId: string;
  encryptedBody: string;
  onDecrypted: (title: string, body: string) => void;
}): JSX.Element {
  const { getPassphrase, savePassphrase } = usePassphraseStore();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState(false);

  // Try stored passphrase
  useEffect(() => {
    const stored = getPassphrase(contentId);
    if (stored) {
      decryptPost(encryptedBody, stored).then(result => {
        if (result) {
          onDecrypted(result.title, result.body);
        }
      });
    }
  }, [contentId, encryptedBody, getPassphrase, onDecrypted]);

  const handleUnlock = async () => {
    const result = await decryptPost(encryptedBody, passphrase);
    if (result) {
      savePassphrase(contentId, passphrase);
      onDecrypted(result.title, result.body);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="inline-unlock">
      <input
        type="password"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        placeholder="Passphrase..."
        className={`inline-unlock-input ${error ? 'error' : ''}`}
        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
      />
      <button onClick={handleUnlock} className="inline-unlock-btn">
        Unlock
      </button>
    </div>
  );
}

/**
 * Compact encrypted indicator for FeedCard
 */
export function EncryptedIndicator({
  isDecrypted = false,
}: {
  isDecrypted?: boolean;
}): JSX.Element {
  if (isDecrypted) {
    return <DecryptedBadge />;
  }
  return <EncryptedBadge />;
}
