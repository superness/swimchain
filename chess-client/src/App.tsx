import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ensureChessSponsored,
  listGames,
  loadGame,
  submitMove,
  applyMoveOptimistic,
  playableSide,
  gameStatus,
  type GameState,
  type GameSummary,
  type Identity,
} from './lib/chessGame';
import { useUrlRoom, roomLink } from './lib/useUrlRoom';

type Mining = { active: boolean; label: string; attempts: number } | null;

export function App() {
  const { rpc, connected, connecting, error: rpcError } = useRpc();
  const { hasIdentity, saveIdentity, isLoading: idLoading } = useStoredIdentity();
  const { keypair, publicKeyHex, address, sign } = useStoredKeypair();

  const [games, setGames] = useState<GameSummary[]>([]);
  // Folded state per listed game, so the lobby can segregate open / in-progress /
  // finished. Keyed by game id. Games not yet folded are simply absent.
  const [gameStates, setGameStates] = useState<Map<string, GameState>>(new Map());
  // The open game lives in the URL (?g=<id>): Back/Forward return to the lobby,
  // and the URL is a shareable invite link.
  const [openId, setOpenId] = useUrlRoom('g');
  const [state, setState] = useState<GameState | null>(null);
  const [mining, setMining] = useState<Mining>(null);
  const [error, setError] = useState<string | null>(null);
  // New-game modal.
  const [showCreate, setShowCreate] = useState(false);
  const [gameName, setGameName] = useState('');
  const [vsBot, setVsBot] = useState(false);
  const [unlisted, setUnlisted] = useState(false);
  const [copied, setCopied] = useState(false);
  // Onboarding: a brand-new identity must be sponsored before it can post/move.
  const [sponsored, setSponsored] = useState(false);
  const [sponsorPhase, setSponsorPhase] = useState<string | null>(null);
  const sponsoringRef = useRef(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicKeyHex, address, sign]
  );

  // Auto-sponsor once the keypair is ready (one-click play): return early if
  // already sponsored, otherwise claim a standing auto-approve offer and wait.
  useEffect(() => {
    if (!rpc || !connected || !me || sponsored || sponsoringRef.current) return;
    sponsoringRef.current = true;
    setSponsorPhase('Checking your access…');
    ensureChessSponsored(rpc, me, (phase) => setSponsorPhase(phase))
      .then(() => {
        setSponsored(true);
        setSponsorPhase(null);
        setError(null);
      })
      .catch((e) => {
        setSponsorPhase(null);
        setError(e instanceof Error ? e.message : 'sponsorship failed');
      })
      .finally(() => {
        sponsoringRef.current = false;
      });
  }, [rpc, connected, me, sponsored]);

  // Reads require signature auth too, so wait until the keypair (publicKeyHex) is
  // ready — otherwise the first fetch races ahead of auth and returns "Authentication
  // required", and never retries.
  const refreshGames = useCallback(async () => {
    if (!rpc || !connected || !publicKeyHex || !CHESS_SPACE) return;
    try {
      const list = await listGames(rpc, CHESS_SPACE);
      setGames(list);
      setError(null);
      // Fold each game's chain so the lobby can bucket open vs in-progress vs
      // finished. Bounded + best-effort: a game that fails to fold just won't be
      // classified this pass (it still lists). Cap keeps a large lobby cheap.
      const states = new Map<string, GameState>();
      await Promise.all(
        list.slice(0, 60).map(async (g) => {
          try {
            states.set(g.id, await loadGame(rpc, g.id));
          } catch {
            /* skip — unclassified this pass */
          }
        })
      );
      setGameStates(states);
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

  // Clear the board whenever the open game changes (including via Back/Forward or a
  // deep link), so one game's position never briefly shows under another.
  useEffect(() => {
    setState(null);
    setCopied(false);
  }, [openId]);

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
    setShowCreate(false);
    setMining({ active: true, label: 'Creating game', attempts: 0 });
    try {
      const id = await createGame(
        rpc,
        me,
        CHESS_SPACE,
        { name: gameName, vsBot, unlisted },
        (attempts) => setMining({ active: true, label: 'Creating game (proof-of-work)', attempts })
      );
      setMining(null);
      setGameName('');
      setVsBot(false);
      setUnlisted(false);
      setOpenId(id);
    } catch (e) {
      setMining(null);
      setError(e instanceof Error ? e.message : 'failed to create game');
    }
  }

  function copyInvite() {
    if (!openId) return;
    navigator.clipboard?.writeText(roomLink('g', openId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  // Identity exists but isn't sponsored yet — auto-sponsor is running (or hit a
  // snag). Moves need sponsorship, so gate on it rather than letting the first
  // move fail with a raw node error.
  if (!sponsored) {
    return (
      <div className="center col">
        <h1>♟ Swimchain Chess</h1>
        {sponsorPhase && !error ? (
          <>
            <p className="muted">♟ {sponsorPhase}…</p>
            <p className="fine">
              Getting you connected to the network so your moves are provably yours. One time only.
            </p>
          </>
        ) : (
          <>
            <p className="muted">{error ?? 'Setting up your access…'}</p>
            <button
              className="btn primary"
              onClick={() => {
                setError(null);
                setSponsored(false);
                sponsoringRef.current = false;
                setSponsorPhase('Retrying…');
              }}
            >
              Try again
            </button>
          </>
        )}
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
            <button
              className="btn primary"
              disabled={!connected || !CHESS_SPACE || !!mining}
              onClick={() => setShowCreate(true)}
            >
              New game
            </button>
          </div>

          {(() => {
            // Unlisted games never appear in the public lobby — only via invite link.
            const listed = games.filter((g) => !g.header.unlisted);
            // Bucket by folded status. A game not yet folded defaults to "open"
            // (it has no Black move we can see), so it still surfaces in the funnel.
            const statusOf = (g: GameSummary) => {
              const st = gameStates.get(g.id);
              return st ? gameStatus(st) : 'open';
            };
            const open = listed.filter((g) => statusOf(g) === 'open');
            const active = listed.filter((g) => statusOf(g) === 'active');
            const finished = listed.filter((g) => statusOf(g) === 'finished');

            const row = (g: GameSummary, note: string) => (
              <li key={g.id} onClick={() => setOpenId(g.id)}>
                <span className="title">
                  {g.header.name || g.title}
                  {g.header.bot && <span className="badge bot">vs computer</span>}
                </span>
                <span className="fine">{note}</span>
              </li>
            );
            const iAmWhiteOf = (g: GameSummary) => g.header.white === publicKeyHex;

            return (
              <>
                <h3 className="lobby-section">Open games</h3>
                {open.length === 0 ? (
                  <p className="muted">No open games. Start one — you'll play White.</p>
                ) : (
                  <ul className="games">
                    {open.map((g) =>
                      row(g, iAmWhiteOf(g) ? 'you are White · waiting for Black' : 'join as Black')
                    )}
                  </ul>
                )}

                {active.length > 0 && (
                  <>
                    <h3 className="lobby-section">In progress</h3>
                    <ul className="games">
                      {active.map((g) => {
                        const st = gameStates.get(g.id);
                        const mine = st && (iAmWhiteOf(g) || playableSide(st, publicKeyHex!, address!) === 'b');
                        return row(g, mine ? 'your game — continue' : 'both seats filled · watch');
                      })}
                    </ul>
                  </>
                )}

                {finished.length > 0 && (
                  <>
                    <h3 className="lobby-section">History</h3>
                    <ul className="games history">
                      {finished.map((g) => row(g, gameStates.get(g.id)?.result || 'finished'))}
                    </ul>
                  </>
                )}
              </>
            );
          })()}
        </section>
      ) : !state ? (
        <div className="center col">
          <button className="link" onClick={() => setOpenId(null)}>← games</button>
          <p className="muted">Loading game…</p>
        </div>
      ) : (
        state && (
          <section className="game">
            <div className="game-bar">
              <button className="link" onClick={() => setOpenId(null)}>← games</button>
              <span className="game-name">
                {state.header.name || 'Chess game'}
                {state.header.bot && <span className="badge bot">vs computer</span>}
                {state.header.unlisted && <span className="badge priv">private</span>}
              </span>
              <button className="link" onClick={copyInvite}>{copied ? 'link copied ✓' : 'copy invite link'}</button>
            </div>
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

      {showCreate && (
        <div className="overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>New game</h3>
            <input
              className="name-input"
              type="text"
              placeholder="Room name (optional)"
              maxLength={60}
              autoFocus
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onNewGame()}
            />
            <label className="opt">
              <input type="checkbox" checked={vsBot} onChange={(e) => setVsBot(e.target.checked)} />
              Play the computer
            </label>
            <label className="opt">
              <input type="checkbox" checked={unlisted} onChange={(e) => setUnlisted(e.target.checked)} />
              Private (invite-only)
            </label>
            {unlisted && (
              <p className="fine">Hidden from the lobby — you'll get an invite link to share once it's created.</p>
            )}
            <div className="modal-actions">
              <button className="link" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn primary" disabled={!connected || !CHESS_SPACE} onClick={onNewGame}>
                Create game
              </button>
            </div>
          </div>
        </div>
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
