import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveAuth, nodeIdentity, rpcCall, type RpcAuth, type NodeIdentity } from './lib/nodeRpc';
import { ensureTrenchSponsored, foundClaim, submitTrenchMove, loadClaim, listClaims, requestClaimContent } from './lib/trenchNet';
import {
  CLAIM_MIN_SPACING,
  COST_FARM,
  COST_STOREHOUSE,
  COST_BEACON,
  HB_CAP_PER_DAY,
  chebyshev,
  expeditionRange,
  utcDay,
  project,
  type ClaimState,
  type MapClaim,
  type StructureKind,
} from './lib/trenchEngine';
import { TrenchMap } from './TrenchMap';
import { Homestead } from './Homestead';
import { HowToPlay } from './HowToPlay';
import { CoachCard, hasSeenCoach, markCoachSeen, type CoachKind } from './CoachCard';

const BUILD_COSTS: Record<StructureKind, number> = { farm: COST_FARM, storehouse: COST_STOREHOUSE, beacon: COST_BEACON };

/** Plain-language structure names for the ruin-ceremony toast (App-local —
 *  Homestead.tsx's BUILD_INFO isn't exported and this is the only place
 *  outside it that needs a label). */
const STRUCT_LABEL: Record<StructureKind, string> = { farm: 'kelp farm', storehouse: 'storehouse', beacon: 'beacon' };

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 60 * 1000; // "at most once every 4 hours" (Global Constraints)
const OWN_POLL_MS = 5_000;
const MAP_POLL_MS = 30_000;
const SELECTED_POLL_MS = 10_000;
const HEARTBEAT_CHECK_MS = 10 * 60 * 1000; // "every 10 min check" (brief)

// Ambient, in-world dressing for the move-float — the player is signaling a
// lantern network, not watching a hash counter (mirrors reef/chess's flavor
// pools). Purely cosmetic; never affects timing or outcome.
const FLAVOR: Record<string, string[]> = {
  heartbeat: ['The current carries your signal upward…', 'Your lantern flares once, unseen in the dark…'],
  build: ['The seafloor accepts new stone…', 'Kelp roots test the silt…'],
  tend: ['Old timbers take a fresh seal…'],
  expedition: ["Your beacon's light finds a stranger's claim…"],
  found: ['A light blooms in the lightless deep…'],
  harvest: ['The tally settles into the ledger…'],
};
const pickFlavor = (pool: string[]): string => pool[Math.floor(Math.random() * pool.length)];

/** `expedition <target16hex> <tx> <ty>` — the target identifier is just a
 *  stable dedup key (per-target daily cap), derived from the claim's own
 *  content id (`<scheme>:<hex>`), mirroring `salvageRoll`'s own prefix-strip. */
function targetPrefix(claimId: string): string {
  const colon = claimId.indexOf(':');
  const hashPart = colon >= 0 ? claimId.slice(colon + 1) : claimId;
  return hashPart.slice(0, 16);
}

type MoveStatus = { label: string; flavor: string } | null;

/** Ambient abyss scene behind every screen: near-black depth gradient, sparse
 *  bioluminescent motes (teal + violet), a pressure vignette. Pure CSS, fixed
 *  and non-interactive — we're below the reef's light shafts, on the floor of
 *  the world. Honors prefers-reduced-motion (see styles.css). */
function Abyss() {
  return (
    <div className="abyss" aria-hidden="true">
      <span className="mote teal m1" />
      <span className="mote violet m2" />
      <span className="mote teal m3" />
      <span className="vignette" />
    </div>
  );
}

export function App() {
  // ── boot: auth → node status → identity → sponsorship ──────────────────────
  const [auth, setAuth] = useState<RpcAuth | null>(null);
  const [connected, setConnected] = useState(false);
  // Lantern telemetry, diegetic labels (spec §4): "neighbors in reach" /
  // "depth mark" — null until the first status poll resolves.
  const [peerCount, setPeerCount] = useState<number | null>(null);
  const [blockHeight, setBlockHeight] = useState<number | null>(null);
  const [identity, setIdentity] = useState<NodeIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [sponsored, setSponsored] = useState(false);
  const [sponsorPhase, setSponsorPhase] = useState<string | null>(null);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [sponsorRetryTick, setSponsorRetryTick] = useState(0);
  const sponsoringRef = useRef(false);

  // ── the shared map + this identity's own claim ──────────────────────────────
  const [mapClaims, setMapClaims] = useState<MapClaim[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [ownState, setOwnState] = useState<ClaimState | null>(null);
  const [loadedStates, setLoadedStates] = useState<Map<string, ClaimState>>(new Map());
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  // ── founding flow ────────────────────────────────────────────────────────────
  const [foundName, setFoundName] = useState('');
  const [foundPos, setFoundPos] = useState<{ x: number; y: number } | null>(null);

  // ── transient UI: move status, lantern pulse, notices, errors, help panel ──
  const [moveStatus, setMoveStatus] = useState<MoveStatus>(null);
  const [lanternPulse, setLanternPulse] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [coachTick, setCoachTick] = useState(0);

  // ── landing invitation gate (visual only — every effect above already
  //    resolves in the background regardless; this just decides what renders) ──
  const [landingDismissed, setLandingDismissed] = useState(false);

  // ── ceremony beats (Task 3b, visual layer only): one-shot classes toggled
  //    by existing state transitions, cleaned up on a timer matching their
  //    CSS animation duration — reef's ghost/tide-turn pattern (Reef.tsx). ──
  const [claimBloom, setClaimBloom] = useState(false);
  const [ruinFlashIdx, setRuinFlashIdx] = useState<Set<number>>(new Set());
  const [tierShift, setTierShift] = useState(false);

  const busyRef = useRef(false);
  const submittedCountRef = useRef(0);
  const ownHoldRef = useRef(0);
  const ownStateRef = useRef<ClaimState | null>(null);
  const mySubmittedRef = useRef<Set<string>>(new Set());
  const notifiedRef = useRef<Set<string>>(new Set());
  const sessionStartRef = useRef(Date.now());
  const lastCoachRef = useRef<CoachKind | null>(null);

  // ── resolve where/how to reach the node ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    resolveAuth()
      .then((a) => {
        if (!cancelled) setAuth(a);
      })
      .catch(() => {
        /* resolveAuth never rejects (falls back to a bare localhost guess);
           defensive only — degrade gracefully means never blocking boot. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── optional node status poll: best-effort, never blocks anything else ─────
  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const info = await rpcCall<{ peer_count?: number; block_height?: number }>(auth, 'get_info', {});
        if (!cancelled) {
          setConnected(true);
          if (typeof info.peer_count === 'number') setPeerCount(info.peer_count);
          if (typeof info.block_height === 'number') setBlockHeight(info.block_height);
        }
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    poll();
    const t = setInterval(poll, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [auth]);

  // ── adopt the node's own identity, retrying until the node is up ───────────
  useEffect(() => {
    if (!auth || identity) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tryOnce = async () => {
      try {
        const id = await nodeIdentity(auth);
        if (!cancelled) {
          setIdentity(id);
          setIdentityError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setIdentityError(e instanceof Error ? e.message : 'waiting for your node…');
          timer = setTimeout(tryOnce, 4000);
        }
      }
    };
    tryOnce();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [auth, identity]);

  // ── one-click auto-sponsor (phased copy, reef pattern) ──────────────────────
  useEffect(() => {
    if (!auth || !identity || sponsored || sponsoringRef.current) return;
    sponsoringRef.current = true;
    setSponsorPhase('Checking your access…');
    setSponsorError(null);
    ensureTrenchSponsored(auth, identity, (p) => setSponsorPhase(p))
      .then(() => {
        setSponsored(true);
        setSponsorPhase(null);
      })
      .catch((e) => {
        setSponsorPhase(null);
        setSponsorError(e instanceof Error ? e.message : 'sponsorship failed');
      })
      .finally(() => {
        sponsoringRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, identity, sponsored, sponsorRetryTick]);

  // ── the shared map: display/driver input only, never a balance source ──────
  const refreshMap = useCallback(async () => {
    if (!auth) return;
    try {
      const list = await listClaims(auth);
      setMapClaims(list);
      setMapLoaded(true);
      setNetError(null);
    } catch (e) {
      setNetError(e instanceof Error ? e.message : 'the depths flicker — reconnecting…');
    }
  }, [auth]);

  useEffect(() => {
    if (!auth || !sponsored) return;
    refreshMap();
    const t = setInterval(refreshMap, MAP_POLL_MS);
    return () => clearInterval(t);
  }, [auth, sponsored, refreshMap]);

  const myClaim = useMemo<MapClaim | null>(() => {
    if (!identity) return null;
    return mapClaims.find((c) => c.accepted && c.owner === identity.address) ?? null;
  }, [mapClaims, identity]);

  // ── own claim: fold + reconcile, holding the last-known state until the
  //    fold's own move count catches up with what we've submitted (reef's
  //    monotonic-hold pattern, simplified — bounded 6 polls). ─────────────────
  const refreshOwn = useCallback(async () => {
    if (!auth || !myClaim) return;
    try {
      const { state: loaded } = await loadClaim(auth, myClaim.claimId);
      setOwnState((prev) => {
        if (!prev) {
          ownHoldRef.current = 0;
          return loaded;
        }
        const HOLD_LIMIT = 6;
        const caughtUp = loaded.moves.length >= submittedCountRef.current;
        if (caughtUp) ownHoldRef.current = 0;
        else ownHoldRef.current += 1;
        const forceAdopt = ownHoldRef.current >= HOLD_LIMIT;
        if (forceAdopt) ownHoldRef.current = 0;
        return caughtUp || forceAdopt ? loaded : prev;
      });
      setNetError(null);
    } catch (e) {
      setNetError(e instanceof Error ? e.message : 'the depths flicker — reconnecting…');
    }
  }, [auth, myClaim]);

  useEffect(() => {
    if (!myClaim) {
      setOwnState(null);
      return;
    }
    submittedCountRef.current = 0;
    refreshOwn();
    const t = setInterval(refreshOwn, OWN_POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myClaim?.claimId]);

  useEffect(() => {
    ownStateRef.current = ownState;
  }, [ownState]);

  // Fold glow isolation: the leaderboard only ever ranks claims THIS session
  // has actually loaded (own + visited) — own claim always counts.
  useEffect(() => {
    if (!ownState) return;
    setLoadedStates((prev) => {
      const next = new Map(prev);
      next.set(ownState.claimId, ownState);
      return next;
    });
  }, [ownState]);

  // ── selected claim: load on selection, poll every 10s, and drive hosting
  //    via request_content — expeditions/visits ARE the retention mechanic. ──
  useEffect(() => {
    if (!auth || !selectedClaimId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { state } = await loadClaim(auth, selectedClaimId);
        if (!cancelled) {
          setLoadedStates((prev) => new Map(prev).set(selectedClaimId, state));
        }
      } catch {
        /* transient — next poll retries */
      }
    };
    load();
    requestClaimContent(auth, selectedClaimId).catch(() => {
      /* best-effort hosting request */
    });
    const t = setInterval(load, SELECTED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [auth, selectedClaimId]);

  // ── heartbeat scheduler: runs while the app runs, never blocks the UI ──────
  // Hoisted to a stable callback (rather than an effect-local closure) so a
  // SECOND effect (below) can also fire it the moment `ownState` first loads
  // — closing the race where this effect's own "check immediately" call
  // fires before `refreshOwn`'s first poll has resolved, so `ownStateRef` is
  // still null and the immediate check silently no-ops (finding #6).
  const heartbeatTick = useCallback(() => {
    if (!auth || !identity || !myClaim) return;
    const state = ownStateRef.current;
    if (!state || busyRef.current) return;
    const today = utcDay(Date.now());
    const acceptedToday = state.heartbeatDays.get(today) ?? 0;
    if (acceptedToday >= HB_CAP_PER_DAY) return;
    let lastOkMs = -Infinity;
    for (const m of state.moves) {
      if (m.op === 'heartbeat' && m.outcome === 'ok' && m.ms > lastOkMs) lastOkMs = m.ms;
    }
    if (Date.now() - lastOkMs < HEARTBEAT_INTERVAL_MS) return;

    busyRef.current = true;
    setLanternPulse(true);
    setMoveStatus({ label: 'Your lantern signals into the deep', flavor: pickFlavor(FLAVOR.heartbeat) });
    submitTrenchMove(auth, identity, myClaim.claimId, 'heartbeat')
      .then((cid) => {
        mySubmittedRef.current.add(cid);
        submittedCountRef.current = (ownStateRef.current?.moves.length ?? 0) + 1;
      })
      .catch(() => {
        /* failures retry next tick — never surfaced as a hard error */
      })
      .finally(() => {
        busyRef.current = false;
        setLanternPulse(false);
        setMoveStatus(null);
      });
  }, [auth, identity, myClaim]);

  useEffect(() => {
    if (!auth || !identity || !myClaim) return;
    heartbeatTick(); // check immediately on entering play, not just after the first 10 minutes
    const t = setInterval(heartbeatTick, HEARTBEAT_CHECK_MS);
    return () => clearInterval(t);
  }, [auth, identity, myClaim, heartbeatTick]);

  // Own claim state loads asynchronously AFTER `myClaim` first becomes
  // truthy (refreshOwn's first poll), so the interval effect's own
  // "immediate" tick above usually fires while `ownStateRef` is still null
  // and no-ops — the first real heartbeat then waited up to
  // HEARTBEAT_CHECK_MS. Fire exactly one extra tick the moment `ownState`
  // transitions from null to loaded, closing that gap (finding #6).
  const ownStateEverLoadedRef = useRef(false);
  useEffect(() => {
    if (ownState) {
      if (!ownStateEverLoadedRef.current) {
        ownStateEverLoadedRef.current = true;
        heartbeatTick();
      }
    } else {
      ownStateEverLoadedRef.current = false; // reset when leaving/switching claims
    }
  }, [ownState, heartbeatTick]);

  // ── explain the settled outcome of OUR OWN moves, once, when it's not "ok" ──
  useEffect(() => {
    if (!ownState) return;
    for (const m of ownState.moves) {
      if (!mySubmittedRef.current.has(m.contentId)) continue;
      if (notifiedRef.current.has(m.contentId)) continue;
      notifiedRef.current.add(m.contentId);
      let msg: string | null = null;
      switch (m.outcome) {
        case 'rejected-unaffordable':
          msg = 'Not enough in your stores for that — the depths will have to wait.';
          break;
        case 'rejected-capped':
          msg = `Your lantern already signaled ${HB_CAP_PER_DAY} times today.`;
          break;
        case 'rejected-ruined':
          msg = 'That structure is already a ruin — it can only be replaced, not tended.';
          break;
        case 'rejected-unknown-structure':
          msg = "There's no such structure to tend.";
          break;
        case 'rejected-out-of-range':
          msg = "That claim lies beyond your beacon's reach.";
          break;
        case 'rejected-day-gate':
          msg = 'You already sent an expedition there today.';
          break;
        case 'rejected-malformed':
          msg = 'That signal was lost in the dark.';
          break;
        default:
          msg = null; // ok: no news is good news, the HUD already shows it
      }
      if (msg) setNotice(msg);
    }
  }, [ownState]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // ── ceremony: a structure ruining, and a brightness-tier change — derived
  //    from a diff of the PREVIOUS fold against the newly-adopted one, exactly
  //    like reef's prevEpoch/prevCells diff (Reef.tsx:36-77). No new polling —
  //    this only reacts to `ownState` already changing via refreshOwn above. ──
  const prevOwnCeremonyRef = useRef<ClaimState | null>(null);
  useEffect(() => {
    const prev = prevOwnCeremonyRef.current;
    prevOwnCeremonyRef.current = ownState;
    // No ceremony on first load, or when the fold switched to a different claim.
    if (!prev || !ownState || prev.claimId !== ownState.claimId) return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    const newlyRuined: number[] = [];
    ownState.structures.forEach((s, i) => {
      const before = prev.structures[i];
      if (before && !before.ruined && s.ruined) newlyRuined.push(i);
    });
    if (newlyRuined.length > 0) {
      setRuinFlashIdx((cur) => {
        const next = new Set(cur);
        newlyRuined.forEach((i) => next.add(i));
        return next;
      });
      setNotice(`the abyss takes the ${STRUCT_LABEL[ownState.structures[newlyRuined[0]].kind]}`);
      timers.push(
        setTimeout(() => {
          setRuinFlashIdx((cur) => {
            const next = new Set(cur);
            newlyRuined.forEach((i) => next.delete(i));
            return next;
          });
        }, 1200) // matches .ruin-collapsing's animation duration
      );
    }

    if (prev.brightness !== ownState.brightness) {
      setTierShift(true);
      timers.push(setTimeout(() => setTierShift(false), 1600)); // matches .tier-shift's animation duration
    }

    return () => timers.forEach(clearTimeout);
  }, [ownState]);

  // ── founding-flow derivations ────────────────────────────────────────────────
  const acceptedClaims = useMemo(() => mapClaims.filter((c) => c.accepted), [mapClaims]);
  const spacingOk = useMemo(() => {
    if (!foundPos) return false;
    return acceptedClaims.every((c) => chebyshev(c.header.x, c.header.y, foundPos.x, foundPos.y) >= CLAIM_MIN_SPACING);
  }, [foundPos, acceptedClaims]);

  // ── selected-claim / expedition derivations ─────────────────────────────────
  const selectedEntry = useMemo(
    () => (selectedClaimId ? mapClaims.find((c) => c.claimId === selectedClaimId) ?? null : null),
    [selectedClaimId, mapClaims]
  );
  const selectedState = selectedClaimId ? loadedStates.get(selectedClaimId) : undefined;
  const expedition = useMemo(() => {
    if (!ownState || !selectedEntry || selectedEntry.claimId === ownState.claimId) {
      return { eligible: false, reason: null as string | null };
    }
    const range = expeditionRange(ownState);
    const dist = chebyshev(ownState.header.x, ownState.header.y, selectedEntry.header.x, selectedEntry.header.y);
    if (dist > range) {
      return { eligible: false, reason: `out of range (${dist} > ${range}) — a beacon widens your reach` };
    }
    const key = targetPrefix(selectedEntry.claimId);
    if (ownState.expeditionDays.get(key) === utcDay(Date.now())) {
      return { eligible: false, reason: 'already visited today — try again tomorrow' };
    }
    return { eligible: true, reason: null as string | null };
  }, [ownState, selectedEntry]);

  // ── live display projection: never banks, just keeps the HUD fresh ─────────
  const view = useMemo(() => (ownState ? project(ownState, Date.now()) : null), [ownState]);

  // ── which coach card (if any) occupies the one floating slot ───────────────
  const coachKind = useMemo<CoachKind | null>(() => {
    if (moveStatus) return null; // never stack the move-float and a coach card
    if (!myClaim && mapLoaded && sponsored) return hasSeenCoach('found') ? null : 'found';
    if (myClaim && ownState) {
      if (!hasSeenCoach('lantern')) return 'lantern';
      if (selectedClaimId && selectedClaimId !== myClaim.claimId && !hasSeenCoach('expedition')) return 'expedition';
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveStatus, myClaim, mapLoaded, sponsored, ownState, selectedClaimId, coachTick]);
  if (coachKind) lastCoachRef.current = coachKind;
  const slotCoach = coachKind ?? lastCoachRef.current;

  // ── action handlers ───────────────────────────────────────────────────────
  const doMove = useCallback(
    async (body: string, label: string, flavorPool: string[], lantern?: boolean) => {
      if (!auth || !identity || !myClaim || busyRef.current) return;
      busyRef.current = true;
      if (lantern) setLanternPulse(true);
      setMoveStatus({ label, flavor: pickFlavor(flavorPool) });
      try {
        const cid = await submitTrenchMove(auth, identity, myClaim.claimId, body);
        mySubmittedRef.current.add(cid);
        submittedCountRef.current = (ownStateRef.current?.moves.length ?? 0) + 1;
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'the depths swallowed that signal — try again');
      } finally {
        busyRef.current = false;
        if (lantern) setLanternPulse(false);
        setMoveStatus(null);
      }
    },
    [auth, identity, myClaim]
  );

  const onBuild = useCallback(
    (kind: StructureKind) => {
      const label = kind === 'farm' ? 'Building the kelp farm' : kind === 'storehouse' ? 'Building the storehouse' : 'Raising the beacon';
      void doMove(`build ${kind}`, label, FLAVOR.build);
    },
    [doMove]
  );
  const onTend = useCallback((idx: number) => void doMove(`tend ${idx}`, 'Tending the structure', FLAVOR.tend), [doMove]);
  const onHarvest = useCallback(() => void doMove('harvest', 'Harvest — banking your projected growth', FLAVOR.harvest), [doMove]);
  const onExpedition = useCallback(() => {
    if (!selectedEntry) return;
    void doMove(
      `expedition ${targetPrefix(selectedEntry.claimId)} ${selectedEntry.header.x} ${selectedEntry.header.y}`,
      'Sending an expedition',
      FLAVOR.expedition,
      true
    );
    // The hosting driver: visiting a claim makes YOUR node responsible for
    // keeping it retrievable (design law: content-getting needs a driver).
    // Fired alongside the move itself, not gated on it landing — a
    // retention nudge, not a correctness gate — and the selection effect
    // above already fires this once on select, so this is a second nudge
    // timed to the actual expedition rather than just the click-to-view.
    if (auth) {
      requestClaimContent(auth, selectedEntry.claimId).catch(() => {
        /* best-effort hosting request */
      });
    }
  }, [doMove, selectedEntry, auth]);

  const onSelectClaim = useCallback((claimId: string) => setSelectedClaimId((prev) => (prev === claimId ? null : claimId)), []);

  const onFound = useCallback(async () => {
    if (!auth || !identity || !foundPos || !spacingOk || !foundName.trim() || busyRef.current) return;
    busyRef.current = true;
    setMoveStatus({ label: 'Founding your homestead', flavor: pickFlavor(FLAVOR.found) });
    try {
      await foundClaim(auth, identity, foundName.trim(), foundPos.x, foundPos.y);
      await refreshMap();
      setError(null);
      // Ceremony: a light blooms outward from the new claim (reef's claim-wave
      // pattern) — one-shot, cleaned up on a timer matching the CSS animation.
      setClaimBloom(true);
      setTimeout(() => setClaimBloom(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the ground would not hold — try again');
    } finally {
      busyRef.current = false;
      setMoveStatus(null);
    }
  }, [auth, identity, foundPos, spacingOk, foundName, refreshMap]);

  // ── shared header ────────────────────────────────────────────────────────
  const header = identity && (
    <header>
      <h1>🏮 The Trench</h1>
      <div className="who">
        <span className={`dot ${connected ? 'ok' : 'bad'}`} />
        {connected ? 'connected' : 'adrift — reconnecting…'} · <code title={identity.address}>{identity.address.slice(0, 12)}…</code>
        {!showHelp && (
          <button className="link help-link" onClick={() => setShowHelp(true)}>
            ? how to play
          </button>
        )}
      </div>
    </header>
  );

  // --- render ---

  // The landing invitation: a lantern in the dark, one pulsing Play. Purely a
  // visual gate — every effect above already resolves in the background
  // regardless of what's on screen, so dismissing it never delays boot.
  if (!landingDismissed) {
    return (
      <div className="center col landing">
        <Abyss />
        <h1>🏮 The Trench</h1>
        <p className="muted">Homestead the lightless seafloor. While The Trench runs, your lantern burns.</p>
        <button className="btn primary" onClick={() => setLandingDismissed(true)}>
          Play
        </button>
        <p className="fine">
          Your homestead's key lives only on this machine — no account, no email, no cloud.
        </p>
      </div>
    );
  }

  if (!identity) {
    return (
      <div className="center col">
        <Abyss />
        <h1>🏮 The Trench</h1>
        <p className="muted">Finding your lantern…</p>
        {identityError && <p className="fine">still searching — retrying…</p>}
      </div>
    );
  }

  if (sponsorError) {
    return (
      <div className="center col">
        <Abyss />
        <h1>🏮 The Trench</h1>
        <p className="muted">First light is slow to catch — try again shortly.</p>
        <button
          className="btn primary"
          onClick={() => {
            setSponsorError(null);
            setSponsorRetryTick((t) => t + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!sponsored) {
    return (
      <div className="center col">
        <Abyss />
        <h1>🏮 The Trench</h1>
        <p className="muted">🏮 {sponsorPhase ?? 'Kindling your lantern…'}</p>
        <p className="fine">One time only.</p>
      </div>
    );
  }

  if (!mapLoaded) {
    return (
      <div className="center col">
        <Abyss />
        <h1>🏮 The Trench</h1>
        <p className="muted">Charting the trench…</p>
      </div>
    );
  }

  if (!myClaim) {
    return (
      <div className="app">
        <Abyss />
        {header}
        {(error || netError) && (
          <div className="banner-stack" aria-live="polite">
            {error && <div className="banner warn">{error}</div>}
            {netError && <div className="banner warn fine">{netError}</div>}
          </div>
        )}
        <section className="game">
          <div className="game-cols">
            <div className="board-col">
              <div className="board-stage map-stage">
                <TrenchMap
                  claims={mapClaims}
                  loadedStates={loadedStates}
                  ownClaimId={null}
                  selectedClaimId={null}
                  onSelect={() => {}}
                  foundingMode
                  previewPos={foundPos}
                  previewOk={spacingOk}
                  onPickFoundingSpot={(x, y) => setFoundPos({ x, y })}
                />
                <div className={`move-float${moveStatus ? ' open' : ''}`} aria-live="polite">
                  {moveStatus && (
                    <span className="move-float-body">
                      <span className="spinner sm" /> {moveStatus.label} — <em>{moveStatus.flavor}</em>
                    </span>
                  )}
                </div>
                <div className={`tut-float${coachKind ? ' open' : ''}`} aria-live="polite">
                  {slotCoach && !moveStatus && (
                    <CoachCard
                      kind={slotCoach}
                      onGotIt={() => {
                        markCoachSeen(slotCoach);
                        setCoachTick((t) => t + 1);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <aside className="status">
              <div className="panel-title fine">Found your homestead</div>
              <input
                className="name-input"
                type="text"
                placeholder="Name your claim"
                maxLength={40}
                value={foundName}
                onChange={(e) => setFoundName(e.target.value)}
              />
              <p className="fine">
                {foundPos
                  ? `(${foundPos.x}, ${foundPos.y}) — ${spacingOk ? `at least ${CLAIM_MIN_SPACING} units from every neighbor` : `too close to a neighbor (need ≥${CLAIM_MIN_SPACING})`}`
                  : 'Click the map to choose a spot.'}
              </p>
              <button
                className="btn primary"
                disabled={!foundPos || !spacingOk || !foundName.trim() || !!moveStatus}
                onClick={onFound}
              >
                Found claim
              </button>
              <p className="fine chain-note">
                Founding takes a few moments — the deep accepts your claim, and it is yours.
              </p>
            </aside>
          </div>
        </section>
        {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
      </div>
    );
  }

  if (!ownState || !view) {
    return (
      <div className="center col">
        <Abyss />
        {header}
        <p className="muted">Loading your homestead…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Abyss />
      {header}
      {(error || netError) && (
        <div className="banner-stack" aria-live="polite">
          {error && <div className="banner warn">{error}</div>}
          {netError && <div className="banner warn fine">{netError}</div>}
        </div>
      )}
      {notice && <div className="banner notice" role="status">{notice}</div>}
      <section className="game">
        <div className="game-cols">
          <div className="board-col">
            <div className="board-stage map-stage">
              <TrenchMap
                claims={mapClaims}
                loadedStates={loadedStates}
                ownClaimId={ownState.claimId}
                selectedClaimId={selectedClaimId}
                onSelect={onSelectClaim}
                justFounded={claimBloom}
              />
              <div className={`move-float${moveStatus ? ' open' : ''}`} aria-live="polite">
                {moveStatus && (
                  <span className="move-float-body">
                    <span className="spinner sm" /> {moveStatus.label} — <em>{moveStatus.flavor}</em>
                  </span>
                )}
              </div>
              <div className={`tut-float${coachKind ? ' open' : ''}`} aria-live="polite">
                {slotCoach && !moveStatus && (
                  <CoachCard
                    kind={slotCoach}
                    onGotIt={() => {
                      markCoachSeen(slotCoach);
                      setCoachTick((t) => t + 1);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
          <aside className="status">
            <Homestead
              connected={connected}
              peerCount={peerCount}
              blockHeight={blockHeight}
              ownState={ownState}
              viewBiomass={view.biomass}
              viewStructures={view.structures}
              viewBrightness={view.brightness}
              lanternPulse={lanternPulse}
              tierShift={tierShift}
              ruinFlashIdx={ruinFlashIdx}
              busy={!!moveStatus}
              sessionStartMs={sessionStartRef.current}
              costs={BUILD_COSTS}
              loadedStates={loadedStates}
              selectedClaimId={selectedClaimId}
              selectedEntry={selectedEntry}
              selectedState={selectedState}
              expeditionEligible={expedition.eligible}
              expeditionReason={expedition.reason}
              onBuild={onBuild}
              onTend={onTend}
              onHarvest={onHarvest}
              onExpedition={onExpedition}
            />
          </aside>
        </div>
      </section>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
