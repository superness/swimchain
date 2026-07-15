import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keypair } from '@swimchain/core';
import {
  useRpc,
  useStoredIdentity,
  useStoredKeypair,
  createNewIdentity,
} from '@swimchain/react';
import { Reef } from './Reef';
import { useUrlRoom, roomLink } from './lib/useUrlRoom';
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
  SEASON_EPOCHS,
  type Intent,
  type ReefState,
  type RegionSummary,
  type SeasonResult,
  type TideSummary,
  type Identity,
} from './lib/reefEngine';

// `cell` is the tile a move is taking root on (absent while founding a reef),
// so the board can animate the growth in place instead of blocking the screen.
type Mining = {
  active: boolean;
  label: string;
  flavor: string;
  cell?: { x: number; y: number };
} | null;

// Ambient lines shown while a move takes hold (the few seconds of PoW). The
// player is growing coral, not mining hashes — so we give them the reef, not a
// counter. One is picked at random each time.
const GROW_FLAVOR = [
  'The current carries your spore into place…',
  'Coral reaches for the seabed…',
  'Roots feel for a hold in the reef…',
  'The tide weighs your claim…',
  'Polyps stir and begin to build…',
];
const FOUND_FLAVOR = [
  'A new reef stirs to life…',
  'The seabed clears for open water…',
];
const pickFlavor = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)];

export function App() {
  const { rpc, connected, connecting, error: rpcError, setAuth } = useRpc();
  const { hasIdentity, saveIdentity, isLoading: idLoading } = useStoredIdentity();
  const { keypair, publicKeyHex, address, sign } = useStoredKeypair();

  const [regions, setRegions] = useState<RegionSummary[]>([]);
  // The open reef lives in the URL (?r=<id>): Back/Forward return to the reef
  // list, and the URL is a shareable link to invite others into this reef.
  const [openId, setOpenId] = useUrlRoom('r');
  const [state, setState] = useState<ReefState | null>(null);
  const [copied, setCopied] = useState(false);
  // Consecutive polls where we held optimistic state because the chain fold
  // hadn't caught up to our own moves. Bounded so a move that never seals
  // (e.g. a dedup-collided body) can't strand the grid on a phantom forever.
  const staleHoldsRef = useRef(0);
  const [mining, setMining] = useState<Mining>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<SeasonResult | null>(null);
  const lastSeenSeason = useRef<number | null>(null);
  // Content-ids of moves WE submitted this session, so we can explain their
  // settled outcome (tie-lost/refunded, contested, rejected) exactly once —
  // without spamming a notice for every historical move on region open.
  const mySubmittedRef = useRef<Set<string>>(new Set());
  const notifiedRef = useRef<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  // End-of-round report: when the tide turns, we pause the reef and show the
  // player a real summary of what happened (decay, points banked, territory
  // change) that they must acknowledge — the game's "round over" beat.
  const [tideReport, setTideReport] = useState<{ summary: TideSummary; tidesPassed: number } | null>(null);
  const prevTideEpoch = useRef<number | null>(null);
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
        if (!prev) {
          staleHoldsRef.current = 0;
          return loaded;
        }
        const mineOf = (s: ReefState) =>
          s.moves.reduce((n, m) => (m.author === publicKeyHex ? n + 1 : n), 0);
        // Hold our optimistic view until the chain fold reflects our own moves
        // (gate on OUR move count, not the global one — other players bump the
        // global count independently). But never hold indefinitely: if the fold
        // hasn't caught up after STALE_HOLD_LIMIT polls, the move almost
        // certainly won't seal (dedup/drop), so adopt the chain truth and clear
        // the phantom rather than strand the grid forever.
        const STALE_HOLD_LIMIT = 6; // ~9s at the 1500ms poll
        const caughtUp = mineOf(loaded) >= mineOf(prev);
        if (caughtUp) staleHoldsRef.current = 0;
        else staleHoldsRef.current += 1;
        const forceAdopt = staleHoldsRef.current >= STALE_HOLD_LIMIT;
        if (forceAdopt) staleHoldsRef.current = 0;
        return caughtUp || forceAdopt ? loaded : prev;
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

  // Reset per-region notice tracking when switching reefs.
  useEffect(() => {
    mySubmittedRef.current = new Set();
    notifiedRef.current = new Set();
    setNotice(null);
    prevTideEpoch.current = null;
    setTideReport(null);
    setCopied(false);
    // Clear the board when the open reef changes (incl. via Back/Forward or a deep
    // link), so one reef's grid never briefly shows under another.
    setState(null);
  }, [openId]);

  // The tide report: when the fold's epoch advances, pause and show the player
  // what the tide did. We init prevTideEpoch on first load so opening a region
  // mid-history never pops a report; only a live tide-turn does. If several
  // tides passed in one poll (idle catch-up), we report the latest and note how
  // many. Coalesces naturally: a fresh tide while the modal is open just swaps
  // in the newer summary instead of stacking.
  useEffect(() => {
    if (!state || !publicKeyHex) return;
    const epoch = state.epoch;
    const prev = prevTideEpoch.current;
    if (prev === null) {
      prevTideEpoch.current = epoch; // initialize silently on region open
      return;
    }
    if (epoch <= prev) return;
    const tidesPassed = epoch - prev;
    prevTideEpoch.current = epoch;
    const summary = state.lastTide;
    if (!summary) return;
    // Only interrupt for a tide the player has a stake in — they held coral
    // going in or coming out, or a season just closed. Pure spectators (and the
    // empty-lobby case) are never stopped by a modal.
    const mine = summary.byOwner.get(publicKeyHex);
    const hasStake = !!mine && (mine.territoryBefore > 0 || mine.territoryAfter > 0);
    if (!hasStake && !summary.crownedSeason) return;
    setTideReport({ summary, tidesPassed });
  }, [state, publicKeyHex]);

  // Explain the settled outcome of OUR OWN moves exactly once. Only moves we
  // submitted this session (tracked by content-id) are eligible, so opening a
  // region with lots of history never spams. Successful grows/tends stay silent
  // (the grid already shows them); we only speak up when something surprising
  // happened to a move the player made.
  useEffect(() => {
    if (!state || !publicKeyHex) return;
    for (const m of state.moves) {
      if (m.author !== publicKeyHex) continue;
      if (!mySubmittedRef.current.has(m.contentId)) continue;
      if (notifiedRef.current.has(m.contentId)) continue;
      let msg: string | null = null;
      switch (m.outcome) {
        case 'tie-lost':
          msg = `Another swimmer reached (${m.x},${m.y}) first — your energy drifts back to you.`;
          break;
        case 'contested':
          msg = `You struck the coral at (${m.x},${m.y}), but it held. Strike again to break it.`;
          break;
        case 'rejected-unaffordable':
          msg = `Not enough energy to grow at (${m.x},${m.y}) — the tide will replenish you.`;
          break;
        case 'rejected-invalid':
          msg = `Coral can only spread from your own reef — (${m.x},${m.y}) is out of reach.`;
          break;
        case 'rejected-capped':
          msg = `You've tended all you can this tide — (${m.x},${m.y}) will have to wait.`;
          break;
        default:
          msg = null; // grew / tended / captured: no news is good news
      }
      notifiedRef.current.add(m.contentId);
      if (msg) setNotice(msg);
    }
  }, [state, publicKeyHex]);

  // Auto-dismiss a notice after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

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
    // The wait is real (the coral takes its time) and deliberate — it paces the
    // game. Dress it as the reef, not a hash counter; no per-attempt updates.
    setMining({ active: true, label: 'Seeding a new reef', flavor: pickFlavor(FOUND_FLAVOR) });
    try {
      const id = await createRegion(rpc, me, REEF_SPACE);
      setMining(null);
      setOpenId(id);
    } catch (e) {
      setMining(null);
      setError(e instanceof Error ? e.message : 'the reef would not take — try again');
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
    setMining({ active: true, label: `${verb} at (${x},${y})`, flavor: pickFlavor(GROW_FLAVOR), cell: { x, y } });
    try {
      const cid = await submitReefMove(rpc, me, openId, intent.op, x, y);
      // Track our own move so we can explain its settled outcome once it folds.
      if (cid) mySubmittedRef.current.add(cid);
      setMining(null);
      // Show the growth immediately; the reef reconciles it as the move settles.
      setState((prev) => (prev ? applyMoveOptimistic(prev, publicKeyHex!, intent.op, x, y) : prev));
    } catch (e) {
      setMining(null);
      setError(e instanceof Error ? e.message : 'the coral would not take — try again');
    }
  }

  function copyInvite() {
    if (!openId) return;
    navigator.clipboard?.writeText(roomLink('r', openId));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      {notice && <div className="banner notice" role="status">{notice}</div>}

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
            <div className="game-bar">
              <button className="link" onClick={() => { setOpenId(null); setState(null); }}>← reefs</button>
              <button className="link" onClick={copyInvite}>{copied ? 'link copied ✓' : 'copy invite link'}</button>
            </div>
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
              canAct={!mining && !tideReport}
              growingCell={mining?.cell ?? null}
              onAct={onAct}
            />
            <div className="status">
              <div className="season">
                <strong>Season {state.season}</strong> · {state.epochsLeftInSeason} tide{state.epochsLeftInSeason === 1 ? '' : 's'} to the reckoning
                <span className="fine"> · tide {state.epoch}</span>
                {mining?.cell ? (
                  <span className="fine growing-status">
                    {' '}· <span className="dot" /> {mining.label} — <em>{mining.flavor}</em>
                  </span>
                ) : state.tentative > 0 ? (
                  <span className="fine tentative"> · {state.tentative} growth{state.tentative === 1 ? '' : 's'} drifting in…</span>
                ) : null}
              </div>

              <div className="budget">
                <span className="fine">energy</span>
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
                <span className="fine costs">grow −{COST_GROW} · contest −{COST_CONTEST} · tend free ({TEND_CAP}/tide) · energy returns with each tide</span>
              </div>

              <div className="board-scores">
                {state.standings.length === 0 && <span className="fine">Open water. Seed your first coral anywhere — it's free until your energy starts to matter.</span>}
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
                You score the vitality you keep alive each tide — sprawl you can't tend just feeds the current. Every coral you grow is provably, only ever yours.
              </div>
              <div className="fine viskey">
                Coral <strong>shrinks as it fades</strong> · your reef has a <span className="k-mine">bright ring</span> ·
                a <span className="k-warn">warning ring</span> means it recedes within two tides · a <span className="k-warn">pulsing</span> cell is gone next tide — tend it.
              </div>
            </div>
          </section>
        )
      )}

      {/* Founding a reef has no board to animate on yet, so it keeps a light
          loader. In-reef moves animate on the tile itself (see growingCell) —
          no blocking overlay. */}
      {mining?.active && !mining.cell && (
        <div className="overlay">
          <div className="mining">
            <div className="spinner" />
            <div>{mining.label}…</div>
            <div className="fine flavor">{mining.flavor}</div>
          </div>
        </div>
      )}

      {tideReport && (
        <TideReport
          report={tideReport}
          myPubkeyHex={publicKeyHex!}
          onClose={() => setTideReport(null)}
        />
      )}
    </div>
  );
}

/** The end-of-round beat: a real, must-acknowledge summary of the tide that just
 *  turned — how much coral the tide claimed, what the player banked, how their
 *  reef changed, and any season crown — framed as the reef's story, not a stat dump. */
function TideReport({
  report,
  myPubkeyHex,
  onClose,
}: {
  report: { summary: TideSummary; tidesPassed: number };
  myPubkeyHex: string;
  onClose: () => void;
}) {
  const { summary, tidesPassed } = report;
  const mine = summary.byOwner.get(myPubkeyHex);
  const terrDelta = mine ? mine.territoryAfter - mine.territoryBefore : 0;
  const banked = mine?.pointsBanked ?? 0;
  const lost = mine ? Math.max(0, mine.territoryBefore - mine.territoryAfter) : 0;
  const gained = mine ? Math.max(0, mine.territoryAfter - mine.territoryBefore) : 0;
  const tidesToReckoning = SEASON_EPOCHS - (summary.epoch % SEASON_EPOCHS);
  const crown = summary.crownedSeason;
  const iWon = crown?.winner === myPubkeyHex;

  // Dismiss on Enter/Escape too — this is a "press to continue" moment.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay tide-report-overlay" onClick={onClose}>
      <div className="tide-report" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="tr-wave" aria-hidden="true" />
        <header className="tr-head">
          <div className="tr-kicker">🌊 The tide turns{tidesPassed > 1 ? ` · ${tidesPassed} tides passed` : ''}</div>
          <h2>Tide {summary.epoch}</h2>
        </header>

        {crown && (
          <div className={`tr-crown${iWon ? ' won' : ''}`}>
            👑 Season {crown.index} closed —{' '}
            {crown.winner ? (
              iWon ? <strong>you took the crown!</strong> : <>champion <code>{crown.winner.slice(0, 8)}…</code></>
            ) : (
              'no champion'
            )}
            <span className="fine"> ({crown.points} pts) · a new season opens</span>
          </div>
        )}

        <div className="tr-hero">
          <div className={`tr-stat ${banked > 0 ? 'good' : 'flat'}`}>
            <span className="tr-num">+{banked}</span>
            <span className="tr-lbl">points banked</span>
            <span className="tr-sub">vitality you kept alive this tide</span>
          </div>
          <div className={`tr-stat ${terrDelta > 0 ? 'good' : terrDelta < 0 ? 'bad' : 'flat'}`}>
            <span className="tr-num">
              {mine?.territoryBefore ?? 0}
              <span className="tr-arrow">→</span>
              {mine?.territoryAfter ?? 0}
            </span>
            <span className="tr-lbl">your reef</span>
            <span className="tr-sub">
              {gained > 0 && lost === 0 && `grew by ${gained} coral`}
              {lost > 0 && gained === 0 && `${lost} coral receded`}
              {gained > 0 && lost > 0 && `+${gained} grew · −${lost} receded`}
              {gained === 0 && lost === 0 && 'held the line'}
            </span>
          </div>
        </div>

        <div className="tr-world">
          {summary.decayedGlobal > 0 ? (
            <>The tide claimed <strong>{summary.decayedGlobal}</strong> coral across the reef.</>
          ) : (
            <>The reef held fast — no coral lost to this tide.</>
          )}{' '}
          <span className="fine">{summary.survivorsGlobal} coral still standing.</span>
        </div>

        <div className="tr-season fine">
          {mine ? <>Your season tally: <strong>{mine.seasonPointsAfter}</strong> pts · </> : null}
          {tidesToReckoning} tide{tidesToReckoning === 1 ? '' : 's'} to the reckoning.
        </div>

        <button className="btn primary tr-continue" onClick={onClose} autoFocus>
          Ride the tide →
        </button>
      </div>
    </div>
  );
}
