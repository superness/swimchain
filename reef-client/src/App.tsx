import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ensureReefSponsored,
  listRegions,
  loadRegion,
  submitReefMove,
  applyMoveOptimistic,
  ownerHue,
  myBudget,
  myTendsLeft,
  MAX_BUDGET,
  COST_GROW,
  COST_CONTEST,
  TEND_CAP,
  BLOCKS_PER_EPOCH,
  type Intent,
  type ReefState,
  type RegionSummary,
  type SeasonResult,
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
  const [banner, setBanner] = useState<SeasonResult | null>(null);
  const lastSeenSeason = useRef<number | null>(null);
  // Onboarding: a brand-new identity must be sponsored before it can post/move.
  // We claim a standing auto-approve offer automatically (one-click play).
  const [sponsored, setSponsored] = useState(false);
  const [sponsorPhase, setSponsorPhase] = useState<string | null>(null);
  const sponsoringRef = useRef(false);

  // Flash a champion banner when a season actually closes (not on first entry).
  useEffect(() => {
    lastSeenSeason.current = null; // reset when switching reefs
    setBanner(null);
  }, [openId]);
  useEffect(() => {
    if (!state) return;
    const idx = state.justCrownedSeason?.index ?? -1;
    if (lastSeenSeason.current === null) {
      lastSeenSeason.current = idx; // initialize without flashing
      return;
    }
    if (idx > lastSeenSeason.current) {
      lastSeenSeason.current = idx;
      setBanner(state.justCrownedSeason);
      const t = setTimeout(() => setBanner(null), 6000);
      return () => clearTimeout(t);
    }
  }, [state]);

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

  // Auto-sponsor once the keypair is ready: return early if already sponsored,
  // otherwise claim a standing auto-approve offer and wait for the chain to
  // record it. Runs once per identity (guarded by a ref).
  useEffect(() => {
    if (!rpc || !connected || !me || sponsored || sponsoringRef.current) return;
    sponsoringRef.current = true;
    setSponsorPhase('Checking your access…');
    ensureReefSponsored(rpc, me, (phase) => setSponsorPhase(phase))
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
      // Keep our own not-yet-sealed optimistic moves visible until the chain
      // fold actually reflects them. Gate on MY move count, not the global one:
      // the region is shared, so other players' moves bump `moves.length`
      // independently — comparing the global count let an unrelated move seal
      // and clobber our still-in-flight growth (the grid "rubberbanded" back).
      // Once our moves seal, `loaded` counts them too and we adopt the exact
      // chain state (picking up everyone else's moves and any decay).
      setState((prev) => {
        if (!prev) return loaded;
        const mine = (s: ReefState) =>
          s.moves.reduce((n, m) => (m.author === publicKeyHex ? n + 1 : n), 0);
        return mine(loaded) >= mine(prev) ? loaded : prev;
      });
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

  // Identity exists but isn't sponsored yet — auto-sponsor is running (or hit a
  // snag). The game needs sponsorship to post/move, so gate on it here rather
  // than letting the first move fail with a raw node error.
  if (!sponsored) {
    return (
      <div className="center col">
        <h1>🪸 The Reef</h1>
        {sponsorPhase && !error ? (
          <>
            <p className="muted">🌊 {sponsorPhase}…</p>
            <p className="fine">
              Getting you connected to the network so your coral is provably yours. One time only.
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

  const budget = state ? myBudget(state, publicKeyHex!, address!) : 0;
  const tendsLeft = state ? myTendsLeft(state, publicKeyHex!, address!) : TEND_CAP;
  const isMine = (o: string) => o === publicKeyHex || o === address;
  const myCareer = state?.standings.find((s) => isMine(s.owner)) ?? null;

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
            {banner && (
              <div className="champion-banner">
                👑 Season {banner.index} champion:{' '}
                {banner.winner ? (
                  <>
                    <span className="swatch" style={{ background: `hsl(${ownerHue(banner.winner)} 68% 52%)` }} />
                    <code>{banner.winner.slice(0, 8)}…</code>
                    {isMine(banner.winner) ? ' — that’s you!' : ''}
                  </>
                ) : 'nobody'}{' '}
                <span className="fine">({banner.points} pts) · new season begins</span>
              </div>
            )}
            <Reef
              state={state}
              myPubkeyHex={publicKeyHex!}
              myAddress={address!}
              canAct={!mining}
              onAct={onAct}
            />
            <div className="status">
              <div className="season">
                <strong>Season {state.season}</strong> · {state.epochsLeftInSeason} epoch{state.epochsLeftInSeason === 1 ? '' : 's'} to the reckoning
                <span className="fine"> · tide {state.epoch} (every {BLOCKS_PER_EPOCH} blocks)</span>
                {state.tentative > 0 && (
                  <span className="fine tentative"> · {state.tentative} move{state.tentative === 1 ? '' : 's'} pending ⟳</span>
                )}
              </div>

              <div className="budget">
                <span className="fine">budget</span>
                <span className="pips">
                  {Array.from({ length: MAX_BUDGET }, (_, i) => (
                    <span key={i} className={`bpip${i < budget ? ' on' : ''}`} />
                  ))}
                </span>
                <span className="fine"><strong>{budget}</strong>/{MAX_BUDGET}</span>
                <span className="tends fine">
                  tends this tide{' '}
                  <span className="pips">
                    {Array.from({ length: TEND_CAP }, (_, i) => (
                      <span key={i} className={`tpip${i < tendsLeft ? ' on' : ''}`} />
                    ))}
                  </span>
                  <strong> {tendsLeft}</strong>/{TEND_CAP}
                </span>
                <span className="fine costs">grow −{COST_GROW} · contest −{COST_CONTEST} · tend free but only {TEND_CAP}/tide · budget regens each epoch</span>
              </div>

              <div className="board-scores">
                {state.standings.length === 0 && <span className="fine">Open water. Seed your first coral anywhere — it's free-form until budgets bite.</span>}
                {state.standings.map((s, i) => (
                  <div key={s.owner} className={`row${isMine(s.owner) ? ' me' : ''}`}>
                    <span className="rank">{i + 1}</span>
                    <span className="swatch" style={{ background: `hsl(${ownerHue(s.owner)} 68% 52%)` }} />
                    <code>{s.owner.slice(0, 8)}…</code>
                    {s.crowns > 0 && <span className="crowns" title={`${s.crowns} season${s.crowns === 1 ? '' : 's'} won`}>{'👑'.repeat(Math.min(s.crowns, 5))}</span>}
                    {isMine(s.owner) && <span className="you">you</span>}
                    <span className="pts"><strong>{s.seasonPoints}</strong> pts</span>
                    <span className="terr fine">{s.territory} cells</span>
                  </div>
                ))}
              </div>

              {myCareer && (myCareer.crowns > 0 || myCareer.peak > 0 || myCareer.conquests > 0) && (
                <div className="career">
                  <span className="fine">your reef legend</span>
                  <span className="stat" title="seasons won">👑 {myCareer.crowns}</span>
                  <span className="stat" title="largest empire ever held">▣ {myCareer.peak} peak</span>
                  <span className="stat" title="enemy cells captured">⚔ {myCareer.conquests} taken</span>
                </div>
              )}

              {state.seasons.length > 0 && (
                <div className="past fine">
                  {state.seasons.slice(-3).map((sr) => (
                    <span key={sr.index} className="past-item">
                      Season {sr.index}: {sr.winner ? <code>{sr.winner.slice(0, 8)}…</code> : 'nobody'} won ({sr.points})
                    </span>
                  ))}
                </div>
              )}

              <div className="fine hint">
                Click open water by your coral to <strong>grow</strong>, your own to <strong>tend</strong>, an enemy border to <strong>contest</strong>.
                Score is the vitality you keep alive each epoch — sprawl you can't tend just feeds the tide. Every move is signed and mined onto the chain.
              </div>
              <div className="fine viskey">
                Coral <strong>shrinks as it fades</strong> · your reef has a <span className="k-mine">bright ring</span> ·
                a <span className="k-warn">warning ring</span> means it recedes within two tides · a <span className="k-warn">pulsing</span> cell is gone next tide — tend it.
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
