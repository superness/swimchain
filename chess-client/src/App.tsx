import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keypair } from '@swimchain/core';
import {
  useRpc,
  useStoredIdentity,
  useStoredKeypair,
  createNewIdentity,
} from '@swimchain/react';
import { Board } from './Board';
import {
  CHESS_SPACE,
  createGame,
  listGames,
  loadGame,
  submitMove,
  applyMoveOptimistic,
  playableSide,
  type GameState,
  type GameSummary,
  type Identity,
} from './lib/chessGame';

type Mining = { active: boolean; label: string; attempts: number } | null;

export function App() {
  const { rpc, connected, connecting, error: rpcError } = useRpc();
  const { hasIdentity, saveIdentity, isLoading: idLoading } = useStoredIdentity();
  const { keypair, publicKeyHex, address, sign } = useStoredKeypair();

  const [games, setGames] = useState<GameSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [mining, setMining] = useState<Mining>(null);
  const [error, setError] = useState<string | null>(null);

  // Authenticate RPC requests as this identity once the keypair is ready.
  const { setAuth } = useRpc();
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

  // Reads require signature auth too, so wait until the keypair (publicKeyHex) is
  // ready — otherwise the first fetch races ahead of auth and returns "Authentication
  // required", and never retries.
  const refreshGames = useCallback(async () => {
    if (!rpc || !connected || !publicKeyHex || !CHESS_SPACE) return;
    try {
      setGames(await listGames(rpc, CHESS_SPACE));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to list games');
    }
  }, [rpc, connected, publicKeyHex]);

  const refreshOpen = useCallback(async () => {
    if (!rpc || !connected || !publicKeyHex || !openId) return;
    try {
      const loaded = await loadGame(rpc, openId);
      // Monotonic: never drop below what we're showing, so an optimistic (not-yet-
      // finalized) move isn't clobbered by a poll that reads only finalized replies.
      setState((prev) => (!prev || loaded.moves.length >= prev.moves.length ? loaded : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load game');
    }
  }, [rpc, connected, publicKeyHex, openId]);

  useEffect(() => {
    if (!openId) refreshGames();
  }, [openId, refreshGames]);

  // Poll the open game for the opponent's moves.
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

  async function onNewGame() {
    if (!rpc || !me) return;
    setMining({ active: true, label: 'Creating game', attempts: 0 });
    try {
      const id = await createGame(rpc, me, CHESS_SPACE, (attempts) =>
        setMining({ active: true, label: 'Creating game (proof-of-work)', attempts })
      );
      setMining(null);
      setOpenId(id);
    } catch (e) {
      setMining(null);
      setError(e instanceof Error ? e.message : 'failed to create game');
    }
  }

  async function onMove(san: string) {
    if (!rpc || !me || !openId) return;
    setMining({ active: true, label: `Playing ${san}`, attempts: 0 });
    try {
      await submitMove(rpc, me, openId, san, state?.moves.length ?? 0, (attempts) =>
        setMining({ active: true, label: `Playing ${san} (proof-of-work)`, attempts })
      );
      setMining(null);
      // Show my move immediately; the poll reconciles once it finalizes on-chain.
      setState((prev) => (prev ? applyMoveOptimistic(prev, san, address!) : prev));
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
        <h1>♟ Swimchain Chess</h1>
        <p className="muted">Every move is provably yours, written to the chain. No server, no referee.</p>
        <button className="btn primary" onClick={newIdentity}>Create an identity</button>
        <p className="fine">Your keypair is generated and stored locally in this browser. It never leaves your device.</p>
      </div>
    );
  }

  const mySide = state ? playableSide(state, publicKeyHex!, address!) : null;
  const iAmWhite = !!state && (state.white === publicKeyHex || state.white === address);

  return (
    <div className="app">
      <header>
        <h1>♟ Swimchain Chess</h1>
        <div className="who">
          <span className={`dot ${connected ? 'ok' : 'bad'}`} />
          {connecting ? 'connecting…' : connected ? 'node connected' : 'no node'} ·{' '}
          <code title={address!}>{address!.slice(0, 12)}…</code>{' '}
          <button className="link" onClick={() => navigator.clipboard?.writeText(address!)}>copy address</button>
        </div>
      </header>

      {!CHESS_SPACE && (
        <div className="banner warn">
          No chess space configured. Set <code>VITE_CHESS_SPACE</code> to a <code>sp1…</code> space id and reload.
        </div>
      )}
      {rpcError && <div className="banner warn">Node: {rpcError}</div>}
      {error && <div className="banner warn">{error}</div>}

      {!openId ? (
        <section className="lobby">
          <div className="lobby-head">
            <h2>Games</h2>
            <button className="btn primary" disabled={!connected || !CHESS_SPACE || !!mining} onClick={onNewGame}>
              New game
            </button>
          </div>
          {games.length === 0 && <p className="muted">No games yet. Start one — you'll play White.</p>}
          <ul className="games">
            {games.map((g) => (
              <li key={g.id} onClick={() => setOpenId(g.id)}>
                <span className="title">{g.title}</span>
                <span className="fine">{g.header.white === publicKeyHex ? 'you are White' : 'join as Black'}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        state && (
          <section className="game">
            <button className="link" onClick={() => { setOpenId(null); setState(null); }}>← games</button>
            <Board
              chess={state.chess}
              orientation={iAmWhite ? 'w' : 'b'}
              canMove={!!mySide && mySide === state.turn && !mining}
              onMove={onMove}
            />
            <div className="status">
              {state.result ? (
                <strong>{state.result}</strong>
              ) : (
                <>
                  <div><strong>{state.turn === 'w' ? 'White' : 'Black'} to move.</strong></div>
                  <div className="fine">
                    {mySide === state.turn
                      ? 'Your move — click a piece. It’s signed by your key and mined before it hits the chain.'
                      : 'Waiting for the opponent…'}
                  </div>
                </>
              )}
              <div className="players fine">
                White <code>{state.white.slice(0, 10)}…</code> · Black{' '}
                {state.black ? <code>{state.black.slice(0, 10)}…</code> : <em>open seat</em>}
              </div>
              <div className="moves fine">
                {state.moves.map((m, i) => (
                  <span key={m.contentId}>{i % 2 === 0 ? `${i / 2 + 1}. ` : ''}{m.san} </span>
                ))}
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
