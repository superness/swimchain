/**
 * Identity page for analytics-client
 * Read-only display of node identity with display name management
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';
import { AddressDisplay } from '../components/AddressDisplay';
import './Identity.css';

export function Identity(): JSX.Element {
  const { identity, isLoading, error, refetch, displayName, setDisplayName } = useIdentityContext();

  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showPublicKey, setShowPublicKey] = useState(false);

  const handleStartEditName = useCallback(() => {
    setEditNameValue(displayName || '');
    setIsEditingName(true);
    setNameError(null);
  }, [displayName]);

  const handleCancelEditName = useCallback(() => {
    setIsEditingName(false);
    setEditNameValue('');
    setNameError(null);
  }, []);

  const handleSaveDisplayName = useCallback(async () => {
    const trimmed = editNameValue.trim();
    if (trimmed.length > 64) {
      setNameError('Display name must be 64 characters or less');
      return;
    }

    setNameSaving(true);
    setNameError(null);
    const success = await setDisplayName(trimmed || null);
    setNameSaving(false);

    if (success) {
      setIsEditingName(false);
    } else {
      setNameError('Failed to save display name');
    }
  }, [editNameValue, setDisplayName]);

  const handleCopyPublicKey = useCallback(async () => {
    if (!identity?.publicKey) return;
    try {
      await navigator.clipboard.writeText(identity.publicKey);
    } catch (err) {
      console.error('Failed to copy public key:', err);
    }
  }, [identity?.publicKey]);

  if (isLoading) {
    return (
      <div className="identity-page">
        <div className="identity-page__header">
          <Link to="/" className="identity-page__back">&larr; Dashboard</Link>
          <h1>Node Identity</h1>
        </div>
        <div className="identity-page__loading">
          <div className="identity-page__spinner" />
          <p>Connecting to node...</p>
        </div>
      </div>
    );
  }

  if (error || !identity) {
    return (
      <div className="identity-page">
        <div className="identity-page__header">
          <Link to="/" className="identity-page__back">&larr; Dashboard</Link>
          <h1>Node Identity</h1>
        </div>
        <div className="identity-page__error">
          <p>Could not fetch node identity.</p>
          <p className="identity-page__error-detail">{error || 'No identity found on node'}</p>
          <button className="identity-page__btn" onClick={refetch}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="identity-page">
      <div className="identity-page__header">
        <Link to="/" className="identity-page__back">&larr; Dashboard</Link>
        <h1>Node Identity</h1>
      </div>

      <div className="identity-page__card">
        {/* Address */}
        <div className="identity-page__field">
          <label className="identity-page__label">Address</label>
          <div className="identity-page__value">
            <AddressDisplay address={identity.address} chars={8} />
          </div>
        </div>

        {/* Display Name */}
        <div className="identity-page__field">
          <label className="identity-page__label">Display Name</label>
          {isEditingName ? (
            <div className="identity-page__name-edit">
              <input
                type="text"
                className="identity-page__input"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                maxLength={64}
                placeholder="Enter display name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDisplayName();
                  if (e.key === 'Escape') handleCancelEditName();
                }}
              />
              <div className="identity-page__name-actions">
                <button
                  className="identity-page__btn identity-page__btn--primary"
                  onClick={handleSaveDisplayName}
                  disabled={nameSaving}
                >
                  {nameSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  className="identity-page__btn"
                  onClick={handleCancelEditName}
                  disabled={nameSaving}
                >
                  Cancel
                </button>
              </div>
              {nameError && <p className="identity-page__field-error">{nameError}</p>}
              <p className="identity-page__hint">{editNameValue.length}/64 characters</p>
            </div>
          ) : (
            <div className="identity-page__name-display">
              <span className="identity-page__value">
                {displayName || <em className="identity-page__muted">Not set</em>}
              </span>
              <button className="identity-page__btn identity-page__btn--small" onClick={handleStartEditName}>
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Public Key */}
        <div className="identity-page__field">
          <label className="identity-page__label">Public Key</label>
          <div className="identity-page__pubkey-row">
            {showPublicKey ? (
              <code className="identity-page__pubkey">{identity.publicKey}</code>
            ) : (
              <code className="identity-page__pubkey identity-page__pubkey--hidden">
                {'*'.repeat(32)}...
              </code>
            )}
            <button
              className="identity-page__btn identity-page__btn--small"
              onClick={() => setShowPublicKey(!showPublicKey)}
            >
              {showPublicKey ? 'Hide' : 'Show'}
            </button>
            <button
              className="identity-page__btn identity-page__btn--small"
              onClick={handleCopyPublicKey}
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      <div className="identity-page__info">
        <p>
          This identity is managed by your Swimchain node. The analytics client uses it
          for authenticated RPC calls.
        </p>
      </div>
    </div>
  );
}
