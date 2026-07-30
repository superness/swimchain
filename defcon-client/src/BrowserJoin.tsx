import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Keypair } from '@swimchain/core';
import {
  useRpc,
  useStoredIdentity,
  useStoredKeypair,
  createNewIdentity,
  ensureSponsored,
  type SponsorableIdentity,
} from '@swimchain/react';
import { DEFCON_SPONSOR, DEFCON_SPACE, IS_CONFIGURED } from './lib/config';

/** Friendlier text for ensureSponsored's onProgress phases (checking → mining
 * → claiming → waiting for the gatekeeper). `ensureSponsored` only exposes
 * three progress checkpoints — the mine and the claim RPC share one callback
 * — so "mining" and "claiming" are combined into a single label rather than
 * inventing a fourth checkpoint the underlying helper doesn't actually have. */
const PHASE_LABEL: Record<string, string> = {
  'Finding a sponsor': 'checking for an open gate…',
  'Requesting sponsorship (proof-of-work)': 'mining a small proof-of-work and claiming…',
  'Waiting for approval': 'waiting for the gatekeeper…',
};

const JOIN_TIMEOUT_MS = 90_000;

export function BrowserJoin({ onJoined }: { onJoined: () => void }) {
  const { rpc, connected, setAuth } = useRpc();
  const { saveIdentity } = useStoredIdentity();
  const { keypair, publicKeyHex } = useStoredKeypair();

  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const checkedOnLoadRef = useRef(false);

  // Authenticate RPC requests as this identity once a keypair exists —
  // exact reef-client/src/App.tsx:268-280 pattern.
  useEffect(() => {
    if (keypair && publicKeyHex) {
      setAuth({
        publicKey: publicKeyHex,
        sign: (m: Uint8Array) => {
          const s = keypair.sign(m);
          if (!s) throw new Error('signing failed');
          return s;
        },
      });
    }
  }, [keypair, publicKeyHex, setAuth]);

  // Returning visitor: an identity from a previous successful join is still
  // in localStorage. Check once whether it's already sponsored so they don't
  // have to retype the code to see the wall again.
  useEffect(() => {
    if (!rpc || !connected || !publicKeyHex || checkedOnLoadRef.current) return;
    checkedOnLoadRef.current = true;
    rpc
      .call<{ has_sponsorship?: boolean; is_sponsored?: boolean }>('get_sponsorship_status', {
        identity: publicKeyHex,
      })
      .then((st) => {
        if (st.has_sponsorship ?? st.is_sponsored) onJoined();
      })
      .catch(() => {
        // Not sponsored (or a transient read failure) — stay on the code form.
      });
  }, [rpc, connected, publicKeyHex, onJoined]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rpc || !connected) {
      setError('Not connected to a node yet — try again in a moment.');
      return;
    }
    if (!code.trim()) {
      setError('Enter the code from your sticker first.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setPhase('checking your code…');

    // If there's already a stored identity+keypair (from the hook), use it —
    // signing happens through the SAME object the hook manages, so it stays
    // in sync with everything else on the page. Only when there is genuinely
    // no identity yet do we mint one here: the exact reef-client/src/App.tsx
    // :581-590 pattern (random seed -> Keypair.fromSeed -> save -> free),
    // except the keypair is kept alive (not freed) until this submit's async
    // chain (mine -> claim -> wait) is completely done signing with it —
    // freeing it right after saveIdentity, as the reef pattern does for its
    // separate "create identity" button, would pull the WASM object out from
    // under the signature this same call still needs to produce.
    let activeIdentity: SponsorableIdentity;
    let freshKeypair: Keypair | null = null;
    if (keypair && publicKeyHex) {
      activeIdentity = {
        publicKeyHex,
        sign: (m: Uint8Array) => {
          const s = keypair.sign(m);
          if (!s) throw new Error('signing failed');
          return s;
        },
      };
    } else {
      const seed = new Uint8Array(32);
      crypto.getRandomValues(seed);
      const kp = Keypair.fromSeed(seed);
      freshKeypair = kp;
      const newIdentity = createNewIdentity(kp);
      saveIdentity(newIdentity);
      activeIdentity = {
        publicKeyHex: newIdentity.publicKey,
        sign: (m: Uint8Array) => kp.sign(m),
      };
      setAuth({ publicKey: newIdentity.publicKey, sign: (m: Uint8Array) => kp.sign(m) });
    }

    try {
      await ensureSponsored(rpc, activeIdentity, {
        applicationText: code,
        allowManualOffers: true,
        requireExactScope: true,
        preferredSponsorHex: DEFCON_SPONSOR,
        strictPreferred: true,
        requiredSpaceId: DEFCON_SPACE,
        timeoutMs: JOIN_TIMEOUT_MS,
        onProgress: (p) => setPhase(PHASE_LABEL[p] ?? p),
      });
      setPhase(null);
      onJoined();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // ensureSponsored's own timeout message ("Sponsorship is taking longer
      // than expected…") is what a wrong/mismatched code looks like from the
      // outside — the keeper silently leaves a bad-code claim pending forever
      // rather than telling the browser it was rejected. Any other message
      // (no offer configured, signing failed, PoW exhausted) is a real
      // problem worth showing verbatim rather than masking.
      setError(
        msg.includes('taking longer than expected')
          ? "The gatekeeper didn't wave you through — check the code and try again."
          : msg
      );
      setPhase(null);
    } finally {
      freshKeypair?.free();
      setSubmitting(false);
    }
  }

  return (
    <section className="browser-join">
      <p className="eyebrow">Or join from the browser</p>
      <h2>Sandboxed to @defcon34 — but you're in in under a minute.</h2>
      <form onSubmit={handleSubmit}>
        <label htmlFor="gate-code">Code from your sticker</label>
        <div className="join-row">
          <input
            id="gate-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={submitting}
            placeholder="e.g. SW-XXXX-XXXX"
          />
          <button className="btn primary" type="submit" disabled={submitting || !IS_CONFIGURED}>
            {submitting ? 'Joining…' : 'Join'}
          </button>
        </div>
        {!IS_CONFIGURED && (
          <p className="status warn">This page isn't configured yet — no sponsor/space set.</p>
        )}
        {phase && <p className="status">{phase}</p>}
        {error && <p className="status error">{error}</p>}
      </form>
    </section>
  );
}
