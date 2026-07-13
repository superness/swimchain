import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keypair } from '@swimchain/core';
import {
  useRpc,
  useStoredIdentity,
  useStoredKeypair,
  createNewIdentity,
} from '@swimchain/react';
import { Reef } from './Reef';
import {
  REEF_SPACE,
  createRegion,
  listRegions,
  loadRegion,
  submitReefMove,
  applyMoveOptimistic,
  ownerHue,
  EPOCH_MOVES,
  type Intent,
  type ReefState,
  type RegionSummary,
  type Identity,
} from './lib/reefEngine';

type Mining = { active: boolean; label: string; attempts: number } | null;

export function App() {
  const { rpc, connected, connecting, error: rpcError, setAuth } = useRpc();
  const { hasIdentity, saveIdentity, isLoading: idLoading } = useStoredIdentity();
  const { keypair, publicKeyHex, address, sign } = useStoredKeypair();

  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, setState] = useState<ReefState | null>(null);
  const [mining, setMining] = useState<Mining>(null);
  const [error, setError] = useState<string | null>(null);

  // Authenticate RPC requests as this identity once the keypair is ready.
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

  const me: Identity | null = useMemo(
    () =>
      publicKeyHex && address
        ? { publicKeyHex, address, sign: (m: Uint8Array) => sign(m) }
        : null,
    [publicKeyHex, address, sign]
  );

  // Reads require signature auth too, so wait until the keypair is ready — otherwise the
  // first fetch races ahead of auth and returns "Authentication required".
  const refreshRegions = useCallback(async () => {
    if (!rpc || !connected || !publicKeyHex || !REEF_SPACE) return;
    try {
      setRegions(await listRegions(rpc, REEF_SPACE));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to list regions');
    }
  }, [rpc, connected, publicKeyHex]);

  const refreshOpen = useCallback(async () => {
    if (!rpc || !connected || !publicKeyHex || !openId) return;
    try {
      const loaded = await loadRegion(rpc, openId);
      // Monotonic: never drop below what we're showing, so an optimistic move isn't
      // clobbered by a poll that reads only finalized replies.
      setState((prev) => (!prev || loaded.moves.length >= prev.moves.length ? loaded : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load region');
    }
  }, [rpc, connected, publicKeyHex, openId]);

  useEffect(() => {
    if (!openId) refreshRegions();
  }, [openId, refreshRegions]);

  // Poll the open region for everyone's growth.
  useEffect(() => {
    if (!openId) return;
    refreshOpen();
    const t = setInterval(refreshOpen, 1500);
    return () => clearInterval(t);
  }, [openId, refreshOpen]);

  function newIdentity() {
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    const kp = Keypair.fromSeed(seed);
    try {
      saveIdentity(createNewIdentity(kp));
    } finally {
      kp.free();
    }
  }

  async function onNewRegion() {
    if (!rpc || !me) return;
    setMining({ active: true, label: 'Founding a reef', attempts: 0 });
    try {
      const id = await createRegion(rpc, me, REEF_SPACE, (attempts) =>
        setMining({ active: true, label: 'Founding a reef (proof-of-work)', attempts })
      );
      setMining(null);
      setOpenId(id);
    } catch (e) {
      setMining(null);
      setError(e instanceof Error ? e.message : 'failed to found a reef');
    }
  }

  async function onAct(x: number, y: number, intent: Intent) {
    if (!rpc || !me || !openId || !state || !intent) return;
    const verb =
      intent.kind === 'seed'
        ? 'Seeding'
        : intent.kind === 'spread'
          ? 'Growing'
          : intent.kind === 'contest'
            ? 'Contesting'
            : 'Tending';
    const where = `(${x},${y})`;
    setMining({ active: true, label: `${verb} ${where}`, attempts: 0 });
    try {
      await submitReefMove(rpc, me, openId, intent.op, x, y, state.moves.length, (attempts) =>
        setMining({ active: true, label: `${verb} ${where} (proof-of-work)`, attempts })
      );
      setMining(null);
      // Show my growth immediately; the poll reconciles once it seals on-chain.
      setState((prev) => (prev ? applyMoveOptimistic(prev, publicKeyHex!, intent.op, x, y) : prev));
    } catch (e) {
      setMining(null);
      setError(e instanceof Error ? e.message : 'failed to submit move');
    }
  }

  // --- render ---

  if (idLoading) return <div className="center muted">Loading…</div>;

  if (!hasIdentity || !me) {
    return (
      <div className="center col">
        <h1>🪸 The Reef</h1>
        <p className="muted">
          A slow, shared world on Swimchain. Grow coral; tend it or it recedes. No server runs
          it — the chain is the world, and no one can take it down.
        </p>
        <button className="btn primary" onClick={newIdentity}>Create an identity</button>
        <p className="fine">Your keypair is generated and stored locally in this browser. It never leaves your device.</p>
      </div>
    );
  }

  const myCells = state
    ? [...state.cells.values()].filter((c) => c.owner === publicKeyHex || c.owner === address).length
    : 0;
  const movesToEpoch = state ? EPOCH_MOVES - (state.moves.filter((m) => m.ok).length % EPOCH_MOVES) : EPOCH_MOVES;

  return (
    <div className="app">
      <header>
        <h1>🪸 The Reef</h1>
        <div className="who">
          <span className={`dot ${connected ? 'ok' : 'bad'}`} />
          {connecting ? 'connecting…' : connected ? 'node connected' : 'no node'} ·{' '}
          <code title={address!}>{address!.slice(0, 12)}…</code>{' '}
          <button className="link" onClick={() => navigator.clipboard?.writeText(address!)}>copy address</button>
        </div>
      </header>

      {!REEF_SPACE && (
        <div className="banner warn">
          No reef space configured. Set <code>VITE_REEF_SPACE</code> to a <code>sp1…</code> space id and reload.
        </div>
      )}
      {rpcError && <div className="banner warn">Node: {rpcError}</div>}
      {error && <div className="banner warn">{error}</div>}

      {!openId ? (
        <section className="lobby">
          <div className="lobby-head">
            <h2>Reefs</h2>
            <button className="btn primary" disabled={!connected || !REEF_SPACE || !!mining} onClick={onNewRegion}>
              Found a reef
            </button>
          </div>
          {regions.length === 0 && <p className="muted">No reefs yet. Found one — then seed your first coral anywhere.</p>}
          <ul className="games">
            {regions.map((r) => (
              <li key={r.id} onClick={() => { setState(null); setOpenId(r.id); }}>
                <span className="title">{r.title}</span>
                <span className="fine">{r.header.w}×{r.header.h} · enter →</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        state && (
          <section className="game">
            <button className="link" onClick={() => { setOpenId(null); setState(null); }}>← reefs</button>
            <Reef
              state={state}
              myPubkeyHex={publicKeyHex!}
              myAddress={address!}
              canAct={!mining}
              onAct={onAct}
            />
            <div className="status">
              <div className="legend">
                {state.owners.length === 0 && <span className="fine">Open water. Seed your first coral anywhere.</span>}
                {state.owners.map((o) => {
                  const mine = o === publicKeyHex || o === address;
                  return (
                    <span key={o} className="legend-item">
                      <span className="swatch" style={{ background: `hsl(${ownerHue(o)} 68% 52%)` }} />
                      <code>{o.slice(0, 8)}…</code>{mine ? ' (you)' : ''}
                    </span>
                  );
                })}
              </div>
              <div className="fine">
                Epoch {state.epoch} · your coral: {myCells} · {movesToEpoch} move{movesToEpoch === 1 ? '' : 's'} until the tide (decay tick)
              </div>
              <div className="fine">
                Click open water next to your coral to <strong>grow</strong>, your own coral to <strong>tend</strong> it,
                or an enemy border cell to <strong>contest</strong>. Every move is signed by your key and mined before it hits the chain.
              </div>
            </div>
          </section>
        )
      )}

      {mining?.active && (
        <div className="overlay">
          <div className="mining">
            <div className="spinner" />
            <div>{mining.label}…</div>
            {mining.attempts > 0 && <div className="fine">{mining.attempts} attempts</div>}
          </div>
        </div>
      )}
    </div>
  );
}
