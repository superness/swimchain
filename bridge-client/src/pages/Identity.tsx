/**
 * Identity page for bridge-client
 *
 * Shows current bridge identity (localStorage-based).
 * Allows syncing identity from the connected Swimchain node,
 * or deleting the stored identity.
 */

import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useIdentityContext } from '../providers/IdentityProvider';
import { AddressDisplay } from '../components/AddressDisplay';
import { LOCAL_CONFIG } from '../lib/rpc';
import type { StoredIdentity } from '../types';
import './Identity.css';

function getRpcUrl(): string {
  const protocol = LOCAL_CONFIG.protocol ?? 'http';
  return `${protocol}://${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}`;
}

export function Identity(): JSX.Element {
  const { identity, setIdentity, clearIdentity, isLoading } = useIdentityContext();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showPublicKey, setShowPublicKey] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSyncFromNode = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const rpcUrl = getRpcUrl();
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'get_identity_info', params: {}, id: 1 }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const result = data.result as { address: string; public_key: string; seed?: string };

      const newIdentity: StoredIdentity = {
        address: result.address,
        publicKey: result.public_key,
        seed: result.seed || '',
        createdAt: Math.floor(Date.now() / 1000),
      };

      setIdentity(newIdentity);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to sync from node');
    } finally {
      setSyncing(false);
    }
  }, [setIdentity]);

  const handleDelete = useCallback(() => {
    clearIdentity();
    setShowDeleteConfirm(false);
  }, [clearIdentity]);

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
          <Link to="/dashboard" className="identity-page__back">&larr; Dashboard</Link>
          <h1>Bridge Identity</h1>
        </div>
        <div className="identity-page__loading">
          <div className="identity-page__spinner" />
          <p>Loading identity...</p>
        </div>
      </div>
    );
  }

  // No identity — show creation / sync UI
  if (!identity) {
    return (
      <div className="identity-page">
        <div className="identity-page__header">
          <Link to="/dashboard" className="identity-page__back">&larr; Dashboard</Link>
          <h1>Bridge Identity</h1>
        </div>

        <div className="identity-page__card">
          <div className="identity-page__empty">
            <p>No bridge identity configured.</p>
            <p className="identity-page__hint">
              Sync your identity from the connected Swimchain node to enable authenticated bridging.
            </p>
          </div>

          <button
            className="identity-page__btn identity-page__btn--primary identity-page__btn--full"
            onClick={handleSyncFromNode}
            disabled={syncing}
          >
            {syncing ? 'Syncing from node...' : 'Sync Identity from Node'}
          </button>

          {syncError && (
            <p className="identity-page__field-error">{syncError}</p>
          )}
        </div>
      </div>
    );
  }

  // Has identity — show details
  return (
    <div className="identity-page">
      <div className="identity-page__header">
        <Link to="/dashboard" className="identity-page__back">&larr; Dashboard</Link>
        <h1>Bridge Identity</h1>
      </div>

      <div className="identity-page__card">
        {/* Address */}
        <div className="identity-page__field">
          <label className="identity-page__label">Address</label>
          <div className="identity-page__value">
            <AddressDisplay address={identity.address} chars={8} />
          </div>
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

        {/* Created At */}
        <div className="identity-page__field">
          <label className="identity-page__label">Stored Since</label>
          <div className="identity-page__value">
            {new Date(identity.createdAt * 1000).toLocaleString()}
          </div>
        </div>

        {/* Actions */}
        <div className="identity-page__actions">
          <button
            className="identity-page__btn"
            onClick={handleSyncFromNode}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Re-sync from Node'}
          </button>

          {!showDeleteConfirm ? (
            <button
              className="identity-page__btn identity-page__btn--danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Identity
            </button>
          ) : (
            <div className="identity-page__delete-confirm">
              <span className="identity-page__delete-warn">Are you sure?</span>
              <button
                className="identity-page__btn identity-page__btn--danger"
                onClick={handleDelete}
              >
                Yes, Delete
              </button>
              <button
                className="identity-page__btn"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {syncError && (
          <p className="identity-page__field-error">{syncError}</p>
        )}
      </div>

      <div className="identity-page__info">
        <p>
          This identity is stored in your browser and used to sign bridged content.
          It should match your Swimchain node identity for proper authentication.
        </p>
      </div>
    </div>
  );
}
