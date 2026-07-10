/**
 * Identity management page with real PoW mining
 */

import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  useKeypair,
  usePow,
  useIdentityContext,
  AddressDisplay,
  PowProgress,
  IdentityCard,
} from '@swimchain/frontend';
import { useWikiIdentity } from '../hooks/useWikiIdentity';
import './IdentityPage.css';

export function IdentityPage(): JSX.Element {
  const { keypair, address, generate, clear } = useKeypair();
  const { state, solution, mine, cancel, attempts, elapsedMs, reset } = usePow();
  const { identity, setIdentity, clearIdentity, hasValidIdentity } = useIdentityContext();
  const location = useLocation();
  const navigate = useNavigate();
  // Node-wide centralized identity: when embedded in the desktop shell the node
  // owns the single identity — there is no per-client identity to create/manage, but
  // we DO show who you are (address + name) rather than a useless placeholder.
  const { mode, address: nodeAddress, displayName: nodeDisplayName } = useWikiIdentity();

  if (mode === 'node') {
    return (
      <div className="identity-page">
        <div className="identity-page__content">
          <section className="identity-page__section">
            <h2 className="identity-page__section-title">Your identity</h2>
            <p className="identity-page__desc">
              Managed by the Swimchain app — the node holds your key and signs on your
              behalf, so there's nothing to create or unlock here.
            </p>
            {nodeDisplayName && (
              <p className="identity-page__desc">
                <strong>{nodeDisplayName}</strong>
              </p>
            )}
            {nodeAddress ? (
              <AddressDisplay address={nodeAddress} />
            ) : (
              <p className="identity-page__desc">Resolving your identity…</p>
            )}
          </section>
        </div>
      </div>
    );
  }

  // Get the path to return to after identity is created
  const returnTo = (location.state as { from?: { pathname: string } } | null)?.from?.pathname || '/';

  // When keypair is generated, start mining
  const handleGenerateAndMine = useCallback(() => {
    generate();
  }, [generate]);

  // Effect to start mining after keypair is generated
  const startMiningIfReady = useCallback(() => {
    if (keypair && state === 'idle') {
      const publicKey = keypair.publicKey();
      mine(publicKey, 20);
    }
  }, [keypair, state, mine]);

  // Save identity when mining completes
  const handleSaveIdentity = useCallback(() => {
    if (keypair && solution && address) {
      // Convert Uint8Array to hex string helper
      const toHex = (bytes: Uint8Array): string =>
        Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

      setIdentity({
        address,
        publicKey: toHex(keypair.publicKey()),
        seed: toHex(keypair.seed()), // Store seed for signing RPC requests
        createdAt: Math.floor(Date.now() / 1000),
        powSolution: {
          nonce: solution.nonce.toString(),
          timestamp: solution.timestamp.toString(),
          difficulty: 20,
        },
      });
      reset();
      clear();

      // Navigate to the original destination after saving
      navigate(returnTo, { replace: true });
    }
  }, [keypair, solution, address, setIdentity, reset, clear, navigate, returnTo]);

  const handleDeleteIdentity = useCallback(() => {
    if (window.confirm('Are you sure you want to delete your identity? This cannot be undone.')) {
      clearIdentity();
    }
  }, [clearIdentity]);

  return (
    <div className="identity-page">
      <header className="identity-page__header">
        <button
          type="button"
          className="identity-page__back"
          onClick={() => navigate(-1)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
        <h1 className="identity-page__title">Identity</h1>
      </header>

      <div className="identity-page__content">
        {/* Show upgrade notice if identity exists but needs upgrade */}
        {identity && !hasValidIdentity && (
          <section className="identity-page__section">
            <div className="identity-page__card identity-page__warning">
              <h2 className="identity-page__section-title">Identity Upgrade Required</h2>
              <p className="identity-page__desc">
                Your existing identity was created with an older version and cannot sign
                RPC requests. You need to create a new identity to use the app.
              </p>
              <p className="identity-page__desc">
                <strong>Your old address:</strong> {identity.address}
              </p>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => clearIdentity()}
              >
                Delete Old Identity &amp; Create New
              </button>
            </div>
          </section>
        )}

        {identity && hasValidIdentity && (
          <section className="identity-page__section">
            <h2 className="identity-page__section-title">Your Identity</h2>
            <IdentityCard identity={identity} />

            <div className="identity-page__actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteIdentity}
              >
                Delete Identity
              </button>
            </div>

            <div className="identity-page__card">
              <h3>About Your Identity</h3>
              <p className="identity-page__desc">
                Your identity is stored locally in this browser. The private key
                never leaves your device.
              </p>
              <p className="identity-page__desc">
                If you clear your browser data or use a different browser, you'll
                need to create a new identity.
              </p>
            </div>
          </section>
        )}

        {!identity && (
          <section className="identity-page__section">
            <h2 className="identity-page__section-title">Create New Identity</h2>
            <p className="identity-page__desc">
              Generate a new cryptographic identity to participate in Swimchain.
              This process includes mining a proof-of-work to prevent spam.
            </p>

            {state === 'idle' && !keypair && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleGenerateAndMine}
              >
                Generate Identity
              </button>
            )}

            {state === 'idle' && keypair && (
              <div className="identity-page__card">
                <p>Keypair generated! Address preview:</p>
                <AddressDisplay address={address || ''} chars={12} showCopy />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={startMiningIfReady}
                  style={{ marginTop: '1rem' }}
                >
                  Start Mining PoW
                </button>
              </div>
            )}

            {(state === 'initializing' || state === 'mining') && (
              <div className="identity-page__card">
                <PowProgress
                  attempts={attempts}
                  elapsedMs={elapsedMs}
                  difficulty={20}
                  onCancel={cancel}
                />
              </div>
            )}

            {state === 'complete' && solution && (
              <div className="identity-page__card">
                <div className="identity-page__success">
                  Mining complete!
                </div>
                <AddressDisplay address={address || ''} chars={12} showCopy />
                <p className="identity-page__desc">
                  Found in {attempts.toLocaleString()} attempts ({(elapsedMs / 1000).toFixed(1)}s)
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveIdentity}
                  style={{ marginTop: '1rem' }}
                >
                  Save Identity
                </button>
              </div>
            )}

            {state === 'cancelled' && (
              <div className="identity-page__card">
                <p>Mining was cancelled.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { reset(); clear(); }}
                >
                  Start Over
                </button>
              </div>
            )}

            {state === 'error' && (
              <div className="identity-page__card">
                <p className="identity-page__error">An error occurred during mining.</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { reset(); clear(); }}
                >
                  Try Again
                </button>
              </div>
            )}

            <div className="identity-page__card">
              <h3>How It Works</h3>
              <ul className="identity-page__list">
                <li>A cryptographic keypair is generated in your browser</li>
                <li>Proof-of-work is mined to validate your identity</li>
                <li>Your private key stays on your device</li>
                <li>Your public address (cs1...) is used to identify you</li>
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
