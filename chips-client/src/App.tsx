/**
 * Dippin' Chips — the shop.
 *
 * The whole screen is the game: a fry station over a bowl of dip, boards on the
 * wall. No dashboard, no panels of statistics, no chrome. Numbers exist (a cook
 * does count crumbs) but they are never how you understand your own state —
 * you understand it by looking at the chip, the pile and the dip.
 *
 * State comes from exactly one place: the fold over your own table's replies
 * (chipsEngine.ts). Nothing on this screen is authoritative; everything is a
 * render of that fold, plus a display-only sog projection for the gap between
 * moves (lib/sogProjection.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Keypair } from '@swimchain/core';
import { useRpc, useGameIdentity, useStoredIdentity, createNewIdentity } from '@swimchain/react';
import { createBrowserHost, CAN_FILE_REPORTS, HAS_THE_BOTTOM, type ChipsHost, type Identity } from './lib/host';
import { foldChips, saltFor, SALT_TICK_BONUS, type ChipsHeader, type ChipsState, type ChipsReply } from './lib/chipsEngine';
import { verifyReplies } from './lib/chipsVerify';
import { withPending } from './lib/chipsPending';
import { planSend, afterSubmit } from './lib/chipsSender';
import { enqueue, loadQueue, saveQueue, clearQueue, nextIdAfter, activeFor, type QueuedMove } from './lib/chipsQueue';
import { retireSettled, confirmedMoveKeys } from './lib/chipsSettling';
import { canAffordBuy, pendingBuyCost, isBuyMove } from './lib/chipsAfford';
import { useCooking, type CookEvent } from './lib/useCooking';
import { isGolden, worthOf, MAX_CRACKLES, LONG_FRY_CRACKLES, type TickMods } from './lib/cooking';
import { toggleOvercook, overcookOff } from './lib/overcook';
import { isInAppBrowser, buildCarryUrl } from './lib/apronCarry';
import { sousTakes } from './lib/souschef';
import { CREW, crewFor, recruitsAt, vendorOf, openJarsOf, type CrewMember } from './lib/crew';
import {
  freshRat, freshAngel, ratTick, angelTick, ratAbsorb, ratAte, gorgeOf,
  shooRat, spendBlessing, JOBS_MIN_DIP_INDEX, type RatState, type AngelState,
  freshWing, wingTick, callWing, freshVote, voteTick, lobby, motionBonus,
  wingAtDepth, oracleAtDepth, voteAtDepth, hermitAtDepth, ratAtDepth, angelAtDepth,
  freshHermit, hermitTick, giveHermit, freshOracle, oracleTick,
  dipBonusFor, JOB_LAYER,
  type WingState, type VoteState, type HermitState, type OracleState,
} from './lib/crewJobs';
import { CrewRow, FeedBanner, DipTicker, CritterArt, type CrewBubble } from './Crew';
import { BowlReveal, TipCeremony, BowlTicket, BOWL_LINES, WELCOME_BACK } from './Bowl';
import { PorcelainFight } from './Porcelain';
import { ScoopShop } from './Scoop';
import { DeepFightScreen } from './DeepFight';
import { TheBottom } from './TheBottom';
import { parseMark, wall, markBody, hasBeenThere, type Mark } from './lib/theBottom';
import { fightAt, ready as deepReady, bestBlow, type DeepFight } from './lib/deepBoss';
import { freshPolish, polishMult, advance as advancePolish, polishLook, type Polish } from './lib/polish';
import { porcelainInReach, readiness, cracks } from './lib/porcelain';
import { bowlReady, bowlOfferVisible } from './lib/bowlGate';
import { visualFor } from './Kitchen';
import { projectedCrumbs } from './lib/sogProjection';
import { newBankedMoves, actualGains } from './lib/chipsPayoutDisplay';
import { DIP_TIERS, UPGRADES, UPGRADE_CHAINS, BURN_REFUND_NUM, BURN_REFUND_DEN, forfeitsOnRefuse, CHAR_ABILITIES } from './lib/chipsConst';
import { tunnelDepth, bandAt } from './lib/tunnelDepth';
import { Kitchen, DipFlight, type DipFlightState } from './Kitchen';
import { TunnelBed, TunnelRead, DigFront, StallSheet, DipBed, DipChange, GainFloats, type GainFloat } from './Tunnel';
import { Boards, useBoards } from './Boards';
import { Tutorial } from './Tutorial';
import { compact } from './lib/format';
import { measureDock, measureStack, DOCKED_SELECTORS } from './lib/dock';
import { queuedBuyKeys as queuedBuyKeysOf } from './lib/chipsAfford';
import { prunePending } from './lib/buyGuard';
import { sfx } from './lib/sound';
import { snapshotText, dipsUnpaid, disagreementLine } from './lib/debugSnapshot';
import { clearRack } from './lib/rackStore';
import { attachErrorRing, entries as ringEntries, note as ringNote } from './lib/errorRing';
import { noteDip, noteTapAway, dipEntries } from './lib/dipRing';
import { moveEvents } from './lib/moveJournal';
import { watchFold, foldRegressions, type FoldFacts } from './lib/foldWatch';
import { mergeConfirmed, droppedByPoll, EMPTY_BASE } from './lib/confirmedBase';

const NAME_KEY = 'chips.cookname.v1';
/** Whether the Sous Chef is on duty. A client-side PREFERENCE, never a fold
 *  fact — the chain records that the jar was bought and nothing else, so this
 *  can flip freely without re-scoring a thing. */
const SOUS_KEY = 'chips.souschef.v1';
/** The Sous Chef upgrade (catalog key 'autodip') dips GOLDEN chips for its
 *  owner — automation is bought, never default (operator decision). */
/** Module-scope so the expiry tick below passes a referentially stable empty
 *  set rather than allocating one every second. */
const NO_CONFIRMED: ReadonlyMap<string, number> = new Map();
const POLL_MS = 15_000;
/** The hermit's trade rides the vendor feed flow but buys NOTHING — this
 *  sentinel marks a feed whose payoff is his return, not a jar. */
const HERMIT_TRADE = '__hermit-trade__';

const SEAT_LINES = [
  'getting you a seat at the table…',
  'somebody is finding you an apron…',
  'the manager is nodding at the fryer…',
  'they are clearing a spot on the rail for you…',
];
const TABLE_LINES = [
  'chalking your name on a basket…',
  'claiming you a fryer…',
  'clearing you a stretch of counter…',
];
const pick = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)];

/** Dev-only breadcrumbs for the opening sequence — sponsorship and table
 *  creation are minutes of silent network + PoW, and when one of them stalls
 *  there is otherwise nothing at all to look at. Compiled out of production. */
const trace: (msg: string) => void = import.meta.env.DEV
  ? (msg) => console.debug('[chips]', msg)
  : () => { /* no-op */ };

const NAME_A = ['Night', 'Corner', 'Back', 'Second', 'Late', 'Salt', 'Oil', 'Counter'];
const NAME_B = ['Cook', 'Fryer', 'Hand', 'Shift', 'Station', 'Rail'];

/** A random suggestion for the apron field. The player sees it and can edit it
 *  before anything is published, so randomness is fine HERE and only here. */
function defaultName(): string {
  const n = Math.floor(Math.random() * 900 + 100);
  return `${NAME_A[Math.floor(Math.random() * NAME_A.length)]} ${NAME_B[Math.floor(Math.random() * NAME_B.length)]} ${n}`;
}

/**
 * The name to fall back on when we are about to create a table and have no
 * stored one. DETERMINISTIC in the pubkey, never random.
 *
 * `defaultName()` draws from 8x6x900 = 43,200 combinations. Using it here means
 * that if `localStorage` is cleared (or was never written) AND the reclaim scan
 * misses this identity's existing table — peer views of a space are known to be
 * partial, so `listTables` can legitimately come back short — the client mints a
 * table under a name the player has never seen, silently abandoning their bowl
 * and their whole lifetime crunch. Deriving from the pubkey means a repeat of
 * that situation reproduces the SAME name and therefore the same table content,
 * which dedupes to the same content_id and the same table rather than a fresh
 * fork each time. (It cannot undo a fork that already happened — it stops the
 * client manufacturing a new one on every reload.)
 */
function nameFromKey(pubkeyHex: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < pubkeyHex.length; i++) {
    h ^= pubkeyHex.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${NAME_A[h % NAME_A.length]} ${NAME_B[(h >>> 5) % NAME_B.length]} ${100 + ((h >>> 11) % 900)}`;
}

function readName(): string {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

/** A rotating diegetic line, so a long wait never looks like a frozen tab. */
function useFlavour(pool: string[], active: boolean): string {
  const [line, setLine] = useState(() => pool[0]);
  useEffect(() => {
    if (!active) return;
    setLine(pick(pool));
    const t = setInterval(() => setLine(pick(pool)), 4200);
    return () => clearInterval(t);
    // `pool` is a module constant; re-running on identity would reset the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return line;
}

export function App() {
  const { rpc, connected, connecting, error: rpcError } = useRpc();
  // Identity source: the node's identity when embedded (Surf/desktop), a
  // localStorage-backed browser keypair when standalone. The hook owns
  // `setAuth` entirely — see its module docstring (SEAM 1 vs SEAM 2) — so
  // chips must not call `setAuth` itself (that old effect used to live here).
  const { mode, identity, hasIdentity, isLoading, sign, saveIdentity } = useGameIdentity();
  const publicKeyHex = identity?.publicKeyHex;
  const address = identity?.address;
  // The apron-carry pop-out (below) ships the BROWSER keypair — seed and all —
  // out of a sandboxed in-app browser via URL fragment. That's a browser-mode
  // feature by nature: a node identity has no seed to carry, and there's no
  // in-app-browser sandbox when embedded. So read the raw browser StoredIdentity
  // (which carries seed/createdAt) directly, and gate the pop-out on browser mode.
  const { identity: browserIdentity } = useStoredIdentity();

  const [cookName, setCookName] = useState<string>(() => readName());
  const [nameDraft, setNameDraft] = useState<string>(() => readName() || defaultName());

  const [tableId, setTableId] = useState<string | null>(null);
  const [state, setState] = useState<ChipsState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* ── the apron carry (lib/apronCarry.ts) ──────────────────────────────
     Whether this is a known in-app browser (Messenger, Instagram, …) whose
     localStorage is sandboxed from the phone's real browser. Computed once —
     a UA does not change mid-session. */
  const inAppBrowser = useMemo(() => isInAppBrowser(navigator.userAgent), []);
  // Greet an apron that just arrived via the pop-out (main.tsx did the
  // import before render; the flag is one-shot so a reload stays quiet).
  useEffect(() => {
    try {
      const carried = sessionStorage.getItem('chips.apron.carried');
      if (carried) {
        sessionStorage.removeItem('chips.apron.carried');
        setNotice('your apron made it over — this kitchen is home now');
      }
    } catch { /* private mode */ }
  }, []);
  const [flight, setFlight] = useState<DipFlightState | null>(null);
  const [gains, setGains] = useState<GainFloat[]>([]);
  // The DOUBLE DIP splash — keyed per proc so back-to-back procs each slam.
  const [ddSplash, setDdSplash] = useState<number | null>(null);

  /* ── the crew (lib/crew.ts roster, lib/crewJobs.ts jobs) ─────────────── */
  const [rat, setRat] = useState<RatState>(freshRat);
  const [angel, setAngel] = useState<AngelState>(freshAngel);
  // The deep jobs (lib/crewJobs.ts). Each unlocks with its character.
  const [wing, setWing] = useState<WingState>(freshWing);
  const [vote, setVote] = useState<VoteState>(freshVote);
  const [hermit, setHermit] = useState<HermitState>(freshHermit);
  const [oracle, setOracle] = useState<OracleState>(freshOracle);
  const wingRef = useRef(wing); wingRef.current = wing;
  const oracleRef = useRef(oracle); oracleRef.current = oracle;
  const hermitRef = useRef(hermit); hermitRef.current = hermit;
  // Keys the "ate the crackle" flash on the rat's perch.
  const [ratChomp, setRatChomp] = useState<number | null>(null);
  // The angel's mark on the fryer she just blessed — the visible tie between
  // her click and the crackle that follows.
  const [blessFx, setBlessFx] = useState<{ index: number; at: number } | null>(null);
  // Feed mode: a vendor is armed and waiting to be paid in chips.
  const [feeding, setFeeding] = useState<{ vendor: CrewMember; jarKey: string } | null>(null);
  /** A refused whistle tap: which basket, and when — keys the shake. Cleared
   *  by nothing; a stale value is harmless because the key only ever replays
   *  an animation, and the next refusal supersedes it. */
  const [wingNope, setWingNope] = useState<{ index: number; at: number } | null>(null);
  /** Is the Sous Chef on duty? Defaults ON, so nobody who bought him loses
   *  him to this change. */
  const [sousOn, setSousOn] = useState(() => {
    try { return localStorage.getItem(SOUS_KEY) !== 'off'; } catch { return true; }
  });
  /** The porcelain takeover is open. Client-only: you choose when it starts. */
  const [porcOpen, setPorcOpen] = useState(false);
  const [scoopOpen, setScoopOpen] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  /* ── THE BOTTOM OF THE BOWL ──────────────────────────────────────────────
     A MOMENT, NOT A PAGE. Opened only by `bowls` rising — never from a menu,
     never twice for the same arrival. `bottomSeenAt` remembers which arrival
     has already been shown so a re-fold (a poll, a reconnect) cannot reopen it.
     Operator: "it should stay only an ephemeral moment for people who got there
     to see at all." */
  const [bottomOpen, setBottomOpen] = useState(false);
  const [bottomMarks, setBottomMarks] = useState<Mark[]>([]);
  const [bottomLoading, setBottomLoading] = useState(false);
  const [bottomSigned, setBottomSigned] = useState(false);
  const bottomSeenAt = useRef<number | null>(null);
  /** Set for the beat after a band gives, so the screen can say so before it
   *  closes — the same courtesy the porcelain's breakthrough gets. */
  const [deepBroke, setDeepBroke] = useState(false);
  /* THE BAND THAT JUST FELL, FROZEN AT THE WINNING BLOW.
     The victory card cannot be drawn from live state: the blow enqueues a
     `broke`, the optimistic fold advances `broken`, and `fightAt` then
     describes the NEXT band — so the card announced the boss you were about
     to meet as the one that just died ("THE CHIP FROM 1974 GIVES" when it was
     the table), and the fresh 0/131B bar underneath read as the kill being
     taken back. Worse, when you are not deep enough for the next band
     `fightAt` returns null and the whole screen unmounts mid-celebration.
     Freezing the fallen fight fixes both: the card outlives the state that
     produced it. */
  const [deepBrokeFight, setDeepBrokeFight] = useState<DeepFight | null>(null);
  /** THE GRAIN's streak. State so the basket's shine re-renders; a ref too
   *  because onDip reads it synchronously in the same tick it updates it. */
  const [polish, setPolish] = useState<Polish>(freshPolish);
  const polishRef = useRef(polish);
  useEffect(() => { polishRef.current = polish; }, [polish]);

  /**
   * THE FOLD MUST NOT GO BACKWARDS — and if it does, catch it AS IT HAPPENS.
   *
   * A ⚑ report is a photograph, and an upgrade that appears, vanishes and comes
   * back leaves no trace in one: every snapshot taken during the whiplash is
   * individually plausible. This diffs consecutive folds instead, so the moment
   * `owned` loses a member or `lifetimeChips` drops the event is written down.
   * Operator, 2026-07-29: "lost a fryer, lost queso angel upgrade. things are
   * whiplashing around."
   */
  const prevFold = useRef<FoldFacts | null>(null);
  useEffect(() => {
    if (!state) return;
    const facts: FoldFacts = {
      crumbs: state.crumbs, lifetimeChips: state.lifetimeChips, fryers: state.fryers,
      bowlCap: state.bowlCap, broken: state.broken, paidToBosses: state.paidToBosses,
      moves: state.moves.length, owned: state.owned, charOwned: state.charOwned,
    };
    const back = watchFold(prevFold.current, facts, Date.now());
    prevFold.current = facts;
    // Say it out loud. This used to be entirely silent, which is why it cost an
    // evening: SETTLE_TTL_MS expiring is CORRECT (the chain's silence wins) but
    // a player watching an upgrade un-buy itself with no explanation has every
    // reason to think the game is broken.
    for (const r of back) ringNote('note', `FOLD WENT BACKWARDS: ${r.what} (${r.from} -> ${r.to})`);
    if (back.length > 0) setNotice(back[0].what);
  }, [state]);
  const [porcBroke, setPorcBroke] = useState(false);
  /** Which fryer is overcooking — client-only, never persisted. */
  const [overcookAt, setOvercookAt] = useState<number | null>(null);
  const overcookRef = useRef(overcookAt);
  overcookRef.current = overcookAt;
  // The open stall sheet (a critter or a stall nameplate was tapped).
  const [sheetId, setSheetId] = useState<string | null>(null);
  // THE BOTTOM OF THE BOWL: the reveal (once, on striking it), the standing
  // offer thereafter, and the tip ceremony.
  const [bowlOpen, setBowlOpen] = useState(false);
  const [tipFanfare, setTipFanfare] = useState<{ salt: number; total: number; taken: number } | null>(null);
  const struckRef = useRef(false);
  const bowlOpenRef = useRef(false);
  // One speech bubble at a time, app-wide — chatter is seasoning, not soup.
  const [bubble, setBubble] = useState<CrewBubble | null>(null);
  const ratRef = useRef(rat);
  ratRef.current = rat;
  const feedingRef = useRef(feeding);
  feedingRef.current = feeding;
  /** The angel's armed blessing: the fryer index to force-crackle on its next
   *  tick. A ref, not state — it is read by the cooking interval's modsFor and
   *  consumed the tick it fires; nothing renders from it. */
  const blessRef = useRef<number | null>(null);
  /** The top of the crackle ladder for THIS player: MAX_CRACKLES normally,
   *  LONG_FRY_CRACKLES once The Long Fry is bought. A ref for the same reason
   *  as the others — `modsFor` must keep a stable identity or the cooking
   *  interval restarts and every fryer's clock resets (see useCooking). */
  const ceilingRef = useRef(MAX_CRACKLES);
  const fryersRef = useRef(0);
  const dipIndexRef = useRef(0);
  const bubbleTimer = useRef<number | null>(null);

  const say = useCallback((id: string, line: string, holdMs = 7000) => {
    setBubble({ id, line, key: Date.now() });
    if (bubbleTimer.current !== null) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), holdMs);
  }, []);

  // Per-critter last-line memory, so nobody repeats themselves back to back —
  // the review heard "that chip looks heavy…" three times in ten minutes.
  const lastLineRef = useRef<Record<string, string>>({});
  const pickLine = useCallback((id: string, pool: string[]): string => {
    if (pool.length === 0) return '';
    let line = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && line === lastLineRef.current[id]) {
      line = pool[(pool.indexOf(line) + 1) % pool.length];
    }
    lastLineRef.current[id] = line;
    return line;
  }, []);

  // The crew's reach into the clock: rat siphons + eats on his fryer, the
  // angel's blessing forces a crackle. Read per tick through refs.
  /** THE BURROW, owned. Ref for the same reason as the magma below. */
  const burrowRef = useRef(false);
  useEffect(() => { burrowRef.current = state?.charOwned.has('burrow') ?? false; },
    [state?.charOwned]);

  /** THE MAGMA, owned. Read by the cooking interval via `modsFor`, so it has
   *  to be a ref rather than state — see modsFor's comment. */
  const magmaRef = useRef(false);
  useEffect(() => { magmaRef.current = state?.charOwned.has('magma') ?? false; },
    [state?.charOwned]);

  const modsFor = useCallback((index: number): TickMods => {
    const mods: TickMods = {};
    if (ratRef.current.latched === index) {
      // THE BURROW (char): the rat works FOR you. He still latches, still
      // fattens, still pays out on a shoo — he simply stops taking it from
      // your pot and stops eating your crackles. The tension he was built for
      // ("pure profit on a x1 chip, a disaster on a cooked x8") is exactly
      // what the ability BUYS OUT, which is why it costs a whole 8 grains.
      if (!burrowRef.current) {
        mods.divertPot = true;
        mods.eatCrackle = true;
      }
    }
    if (blessRef.current === index) mods.forceCrackle = true;
    if (overcookRef.current === index) mods.overcook = true;
    // THE MAGMA — overcook stops draining the pot. A ref for the same reason
    // the others are: `modsFor` must keep a stable identity or the cooking
    // interval tears down and restarts on every render.
    if (magmaRef.current) mods.magma = true;
    mods.ceiling = ceilingRef.current;
    return mods;
  }, []);
  const [counting, setCounting] = useState<{ done: number; total: number } | null>(null);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [seated, setSeated] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Read inside the gain-detection effect below without making it re-run on
  // every clock tick — that effect's own deps are `[state]` only, on purpose
  // (see its comment): it must fire once per FOLD, not once per second.
  const nowMsRef = useRef(nowMs);
  nowMsRef.current = nowMs;

  // The host throws at construction if the build was never given an endpoint or
  // a space — surface that as a screen rather than a white page.
  const hostOrError = useMemo((): { host: ChipsHost | null; error: string | null } => {
    if (!rpc) return { host: null, error: null };
    try { return { host: createBrowserHost(rpc), error: null }; }
    catch (e) { return { host: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [rpc]);
  const host = hostOrError.host;
  const configError = hostOrError.error;

  const me: Identity | null = useMemo(
    () => (publicKeyHex && address ? { publicKeyHex, address, sign: (m: Uint8Array) => sign(m) } : null),
    [publicKeyHex, address, sign]
  );

  // Transport auth (SEAM 1: signature headers on every RPC call) is owned
  // entirely by useGameIdentity — it calls setAuth in browser mode and
  // clears it on the browser→node flip, and never calls it in node mode
  // (transport = the node's cookie). chips must not set up its own setAuth
  // effect; `sign` above is SEAM 2 (action-payload signing) only.

  // The pending-move queue. `loadQueue()` is the lazy useState initializer, so
  // it runs once, synchronously, before the first render — a chip mined and
  // queued in a previous tab session is on screen (via `withPending` below)
  // from the very first frame, not after some later effect catches up.
  //
  // The queue is global to the browser origin — scoped to neither identity nor
  // table (see chipsQueue.ts's file header) — so it can outlive the identity
  // that queued it (a new "tie on the apron" mints a fresh identity but does
  // not touch this store). `withPending`/`planSend` both filter to
  // `activeFor(queue, tableId, me)` before folding or sending, which is what
  // makes a leftover entry from an earlier identity/table inert rather than
  // phantom-crediting the new one.
  const [queue, setQueue] = useState<QueuedMove[]>(loadQueue);
  const [queueTick, setQueueTick] = useState(0);
  const nextId = useRef(nextIdAfter(queue));

  // Every queue change is written straight through: each queued bank is a
  // mined proof, i.e. CPU the player has already spent and cannot get back.
  useEffect(() => { saveQueue(queue); }, [queue]);

  /**
   * The last confirmed fold input (replies + verification map), refreshed
   * from the network in the background. `foldNow` below re-folds this
   * synchronously against the CURRENT queue — no network wait — so a dip
   * credits and a buy debits in the same render the click produced, online or
   * not. `refresh()` updates this ref and then calls `foldNow`, so the
   * network path and the instant-local path are the same fold call over
   * different inputs, never two different code paths computing state.
   */
  const confirmedRef = useRef<{ replies: ChipsReply[]; verified: Map<string, number> }>(EMPTY_BASE);

  /** Bumped by `refresh` whenever `confirmedRef` is replaced, so anything that
   *  must read the CHAIN rather than the optimistic fold has a dependency it
   *  can actually observe (a ref write is invisible to React). */
  const [confirmedTick, setConfirmedTick] = useState(0);

  /** How many replies polls have omitted that the base already held. Every one
   *  of these used to be a visible fold regression; see confirmedBase.ts. */
  const [pollGaps, setPollGaps] = useState(0);

  /**
   * The queue-entry ids the LAST COMPLETED fold actually consumed (i.e. the
   * ids `activeFor(queue, tableId, me)` held at that moment) — set inside
   * `foldNow` itself, synchronously with the `state` it produces, never from
   * inside a `setQueue` updater (see the `sentAt` comment further down on why
   * an updater must stay pure).
   *
   * This is what `onBuy` uses to tell "a buy `crumbsNow` has already charged
   * for" apart from "a buy queued after/alongside this fold that `crumbsNow`
   * hasn't seen yet" — see chipsAfford.ts's file header for the double-charge
   * bug this closes.
   */
  const foldedIdsRef = useRef<ReadonlySet<number>>(new Set());

  /** Jars this client has ASKED FOR and not yet seen granted.
   *
   *  The queue alone is not the window. Report 23b527be-30565 caught the rest
   *  of it live: `detector3` was bought as move 201 AND again as move 206, both
   *  confirmed — the second one folds `rejected-owned`, so the chip that paid
   *  for it bought nothing. Move 201 had already left the queue by then, so a
   *  queue-only guard waves the second purchase straight through.
   *
   *  The true window is the whole pipeline — queued, sent, confirmed, and not
   *  yet reflected in `owned` — because `owned` is what the shop reads. A key
   *  goes in when the buy is enqueued and comes out only when the fold has
   *  actually granted the jar, or has rejected the attempt (which frees the
   *  player to try again). */
  /* KEY -> THE ms AT WHICH THIS ATTEMPT WAS MADE, not a bare Set.
     The timestamp is the whole fix. Pruning used to read
       state.moves.some(m => m.upgradeKey === key && m.outcome.startsWith('rejected'))
     over the WHOLE history, so a `rejected-order season4` from 1:44 PM freed
     the guard for a season4 bought at 11:51 PM — nine hours and four bowls
     later. The key went out of the set the instant it went in, the guard went
     blind, and a second copy of the same buy queued: two chain writes and two
     action PoWs for one jar, the second folding `rejected-owned`. That is the
     `id 263/264 buy fryer2` and `id 260/268 buy season1` pairs in the
     operator's report, and it is why a successful purchase can appear in the
     new `rejects` list looking like a failure.

     Only a rejection NEWER than the attempt says anything about the attempt.
     Same family as the boss bar and the queue reconcile: a rule that searches
     all of history for a key that is not unique in time will always find an
     answer to a question nobody asked. */
  const boughtPendingRef = useRef<Map<string, number>>(new Map());

  const foldNow = useCallback((): void => {
    if (!tableId || !me) return;
    const { replies: confirmed, verified } = confirmedRef.current;
    foldedIdsRef.current = new Set(activeFor(queue, tableId, me.publicKeyHex).map((m) => m.id));
    const merged = withPending(confirmed, verified, queue, me.publicKeyHex, tableId);
    const header: ChipsHeader = { v: 1, kind: 'chips-table', name: cookName, owner: me.publicKeyHex };
    setState(foldChips(header, tableId, merged.replies, merged.verified));
  }, [tableId, me, cookName, queue]);

  // Re-fold locally the instant the queue (or the identity/table it's read
  // against) changes — this is what makes a dip or a buy credit immediately,
  // with zero network round trip, per the task's whole point.
  useEffect(() => { foldNow(); }, [foldNow]);

  // A jar leaves the pending set the moment the fold has SETTLED it, either
  // way: granted (it is in `owned`, so the ordinary guard covers it from here)
  // or refused (the player must be free to try again). Anything still in the
  // set is a purchase in flight, and arming it again would cost a chip for a
  // buy the fold is going to reject.
  useEffect(() => {
    if (!state) return;
    prunePending(boughtPendingRef.current, state.owned, state.moves);
  }, [state]);

  // Always the latest `foldNow`, updated unconditionally every render (same
  // pattern as `chipsRef` further down) — `refresh` below reads THROUGH this
  // ref rather than closing over `foldNow` directly, specifically so
  // `refresh`'s OWN identity does not change every time `queue` changes.
  // `foldNow` depends on `queue`; if `refresh` depended on `foldNow` (and
  // therefore transitively on `queue`), then the polling effect further down
  // — which depends on `refresh` and calls it immediately on every dependency
  // change — would fire a FULL network `loadTable` + `verifyReplies` round
  // trip on every single dip or buy, on top of the one the sender loop
  // already does after a successful submit.
  const foldNowRef = useRef(foldNow);
  foldNowRef.current = foldNow;

  /* ── sound ────────────────────────────────────────────────────────────── */
  const [soundOn, setSoundOn] = useState(() => !sfx.muted());

  // The AudioContext can only exist after a user gesture (autoplay policy);
  // unlock() is idempotent, so hanging it off every pointerdown/keydown costs
  // nothing and catches whichever gesture comes first.
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // A wall clock for the sog projection. One second is plenty — the pile is
  // meant to look like it is going soft, not to tick.
  //
  // It also drives EXPIRY for settling moves (chipsSettling.ts). Retirement on
  // the confirmed twin's arrival happens in `refresh` below and is the normal
  // path; expiry needs its own clock because it must fire when the twin never
  // comes — which is exactly the case where no refresh ever brings news. An
  // empty key set here means this tick only ever expires, never retires-as-
  // confirmed: parsing every confirmed reply once a second would be waste.
  //
  // `retireSettled` returns the SAME array when nothing is retired, and React
  // skips a re-render when a setState produces the identical value, so this
  // costs one array scan a second and nothing else — no refold, no
  // `saveQueue` write.
  // The error ring starts collecting before anything else can go wrong.
  useEffect(() => { attachErrorRing(); }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setNowMs(Date.now());
      setQueue((q) => retireSettled(q, NO_CONFIRMED, Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  /* ── onboarding: seat, then table ─────────────────────────────────────── */
  /**
   * Runs exactly once per page load, guarded by a ref.
   *
   * It deliberately does NOT abort on effect cleanup, and that is the whole
   * point of the comment. StrictMode mounts, tears down and remounts; the deps
   * here all flip asynchronously. A `cancelled` flag captured by the first run
   * would abandon the pipeline mid-flight while the ref guard stops the second
   * run from ever restarting it — and the game sits on "getting you a seat at
   * the table" forever, with no error, no console output and no network
   * traffic. (Observed exactly that during the browser pass.) Every step here
   * is either idempotent (sponsor, listTables) or something we would never want
   * to throw away anyway: createTable spends a full Argon2id grind, and
   * abandoning it AFTER it lands strands a table on-chain that this client will
   * then never claim, because the next attempt would create a second one.
   */
  const onboardRef = useRef(false);
  useEffect(() => {
    if (!host || !connected || !me || onboardRef.current) return;
    onboardRef.current = true;
    void (async () => {
      try {
        // D1: in node mode `me` is the player's REAL phone identity and Surf
        // has already gated the whole set on a full, unscoped sponsorship.
        // host.sponsor() claims the CHIPS-SCOPED offer (host.ts), which would
        // give that identity a chips-only grant and burn a slot on every Surf
        // install. Standalone browser play is untouched.
        if (mode === 'node') {
          const st = await host.rpc
            .call<{ has_sponsorship?: boolean }>('get_sponsorship_status', {
              identity: me.publicKeyHex,
            })
            .catch(() => null);
          if (!st?.has_sponsorship) {
            throw new Error('this set is not sponsored yet — Surf handles sponsorship');
          }
          trace('sponsor: node identity already sponsored');
        } else {
          trace('sponsor: asking for a seat');
          await host.sponsor(me);
          trace('sponsor: seated');
        }
        setSeated(true);
        const tables = await host.listTables();
        trace(`tables: ${tables.length} on the board`);
        const mine = tables.find((t) => t.authorId === me.publicKeyHex);
        if (mine) {
          if (mine.name && mine.name !== cookName) {
            setCookName(mine.name);
            try { localStorage.setItem(NAME_KEY, mine.name); } catch { /* private mode */ }
          }
          trace(`table: reclaimed ${mine.tableId.slice(0, 12)}`);
          setTableId(mine.tableId);
          return;
        }
        // Name precedence: an already-set cookName (typed at the apron, browser
        // mode only) wins; otherwise the node identity's displayName (finding
        // #4 — `get_identity_info` returns no name, so this comes from the
        // shell's `nodeDisplayName`, empty in Surf today); otherwise the
        // deterministic pubkey-derived name. This table is PERMANENT and
        // PUBLIC — a blank name must never be chalked onto it.
        const name = (cookName || identity?.displayName?.trim() || nameFromKey(me.publicKeyHex)).slice(0, 80);
        trace(`table: creating "${name}" (this mines an action PoW)`);
        const id = await host.createTable(me, name);
        setCookName(name);
        try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
        trace(`table: created ${id.slice(0, 12)}`);
        setTableId(id);
      } catch (e) {
        onboardRef.current = false; // let "knock again" retry
        // Keep the stack: onboarding failures come from deep inside sponsorship
        // or PoW, and the message alone is rarely enough to place them.
        console.error('[chips] could not open the kitchen', e);
        setFatal(e instanceof Error ? e.message : 'the kitchen would not open');
      }
    })();
    // cookName is read, not tracked: re-running this on a rename would try to
    // create a SECOND table for the same identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, connected, me]);

  /* ── the fold ─────────────────────────────────────────────────────────── */
  // Fetches confirmed replies over the network, then folds via the SAME
  // `foldNow` the instant-local path uses (through `foldNowRef` — see its
  // comment above for why not a direct closure) — updating `confirmedRef`
  // first is what lets a synthetic pending entry drop out and the real one
  // take over without a second accounting path. Deliberately NOT dependent on
  // `queue`/`cookName`: this function's identity must stay stable across a
  // queue change, or the polling effect below (which depends on it) fires an
  // extra network round trip on every dip.
  const refresh = useCallback(async (): Promise<void> => {
    if (!host || !tableId || !me) return;
    const confirmed = await host.loadTable(tableId);
    const verified = await verifyReplies(
      tableId, me.publicKeyHex, confirmed,
      (done, total) => setCounting(total > 0 && done < total ? { done, total } : null)
    );
    // THE BASE ONLY GROWS. Replacing it wholesale here is what let a single
    // poll that arrived one reply short un-credit a dip — measured 8 times in
    // 3 minutes on 2026-07-29, always movesFrom-1, always recovering on the
    // next poll. A verified reply stays verified; see confirmedBase.ts.
    const missed = droppedByPoll(confirmedRef.current, confirmed);
    if (missed > 0) {
      // Loud, because before this module existed each one of these WAS a
      // visible regression. If this line never appears, the theory was wrong.
      ringNote('note', `poll omitted ${missed} reply(s) the base already had — held`);
      setPollGaps((n) => n + missed);
    }
    confirmedRef.current = mergeConfirmed(confirmedRef.current, confirmed, verified);
    // The reveal gate reads this ref, and a ref write does not re-render —
    // this is what tells it the chain moved (see `chainReady` below).
    setConfirmedTick((n) => n + 1);
    // Retire settling moves the chain has now supplied — the NORMAL end of a
    // settling move's life, and the common one; expiry (on the clock tick
    // above) is the failure path. Done here, against the freshly loaded
    // CONFIRMED replies only, never the merged optimistic set: a move that
    // could see its own synthetic copy would retire itself instantly, which is
    // the delete-on-ack flicker with extra steps.
    //
    // The functional-updater form is what keeps `refresh` independent of
    // `queue` — this callback's identity must stay stable across a queue
    // change or the polling effect fires an extra network round trip per dip.
    // Nothing is assigned inside the updater and read outside it; the updater
    // is pure and its result is used only by React.
    setQueue((q) => retireSettled(q, confirmedMoveKeys(confirmed, tableId, me.publicKeyHex), Date.now()));
    foldNowRef.current();
    setCounting(null);
  }, [host, tableId, me]);

  useEffect(() => {
    if (!host || !tableId || !me) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try { await refresh(); } catch { /* transient — next poll */ }
      finally { inFlight = false; }
    };
    void tick();
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => { cancelled = true; clearInterval(iv); };
  }, [host, tableId, me, refresh]);

  /**
   * One flight at a time, strict FIFO, take whatever is queued (filtered to
   * the identity/table currently in play — see `planSend`).
   *
   * Batch size self-clocks: an idle player's chip goes out alone; a busy
   * kitchen accumulates during each ~5.4s action PoW and the next batch grows
   * to match. No timing constants to pick or retune.
   *
   * A failing head BLOCKS the queue on purpose — it must not be overtaken.
   */
  const sending = useRef(false);
  const backoff = useRef(0);

  useEffect(() => {
    if (sending.current || !host || !me || !tableId || queue.length === 0) return;
    let cancelled = false;

    (async () => {
      sending.current = true;
      try {
        // `planSend` calls the THROWING `bankBatchBody`/`buyBody` (it filters
        // most bad rows out itself, but stays inside this `try` regardless —
        // a call that can throw must never sit between `sending.current =
        // true` and the `try`, or an exception here escapes as an unhandled
        // rejection and stalls the single-flight lock at `true` PERMANENTLY:
        // `finally` never runs, so no notice, no backoff, no further
        // submission for the rest of the session, and a reload just restores
        // the same row and re-bricks it. (This happened: `loadQueue` range-checks
        // neither `bits` nor `nonce`, so a corrupt/hand-edited row can survive
        // persistence and reach here.)
        const plan = planSend(queue, tableId, me.publicKeyHex, Date.now());
        if (!plan) { return; }
        await host.submitMove(me, tableId, plan.body);
        backoff.current = 0;
        // The ack MARKS these moves as settling; it no longer deletes them
        // (chipsSettling.ts). Deleting was what made a purchase flicker: the
        // optimistic entry vanished the instant the submit was acknowledged,
        // while the confirmed twin that replaces it is not available until the
        // node serves it — a poll or more later. Traced live 2026-07-26, a real
        // `buy:season2` lost `owned` for 38 ms across that gap, and it is far
        // longer whenever the reply takes a moment to become visible. Marked
        // instead, the move keeps crediting until its twin actually arrives
        // (retired in `refresh`) or it expires; `planSend` skips it either way,
        // so it is never resubmitted.
        //
        // The mark now runs BEFORE refresh, not after. A reload landing in the
        // gap between a landed submit and this mark used to see an
        // already-settled batch still looking unsent (persisted queue, no
        // `sentAt` yet) and would resubmit it on the next session — folding
        // `rejected-duplicate` and burning one real action PoW for nothing.
        // Marking first narrows that window from however long `refresh` takes
        // to ~0; `sentAt` simply starts a hair earlier. This does NOT disturb
        // `refresh`'s own ordering guarantee (inside it, `confirmedRef` is
        // always updated before the settling set is retired against it,
        // chipsSettling.ts's "confirmed base before the fold can lose sight of
        // a move") — that invariant lives entirely inside `refresh` and does
        // not depend on when its caller happens to invoke it.
        //
        // The ack stays UNCONDITIONAL on a successful submit:
        //   - `cancelled` (a newer attempt superseded this one in flight, e.g.
        //     the player dipped again) suppresses only the refresh, never the
        //     mark;
        //   - a FAILING refresh is swallowed. The batch landed; the queue must
        //     be told so. Leaving it unmarked would have it resubmit itself for
        //     ever — harmless to the fold, which dedupes, but a real action PoW
        //     and a chain write wasted on every retry.
        //
        // `sentAt` is read HERE, not inside the updater: nothing may be
        // assigned inside a React updater and read outside it, and an updater
        // must be pure — React can (and under StrictMode does) invoke it more
        // than once, so a `Date.now()` in there would stamp a different expiry
        // clock on each invocation.
        const sentAt = Date.now();
        // `shouldRefresh` is exactly `!cancelled` (chipsSender.ts) and does not
        // depend on the queue array at all, so computing it against the outer
        // `queue` closure here — rather than inside the functional updater
        // below, which must stay pure — is exact, not an approximation.
        const { shouldRefresh } = afterSubmit(queue, plan.moves, cancelled, sentAt);
        setQueue((q) => afterSubmit(q, plan.moves, cancelled, sentAt).queue);
        if (shouldRefresh) {
          try { await refresh(); } catch { /* the batch landed; mark it anyway and let the poll catch up */ }
        }
        // Re-arm explicitly. The mark above already changes `queue`'s
        // reference (`markSent` returns a NEW array whenever it actually
        // changes something — chipsQueue.ts — and it always does here, since
        // `plan.moves` are, by construction, entries this same queue still
        // holds unmarked), which alone re-triggers this effect in the
        // ordinary case — but a move enqueued mid-flight is easy to reason
        // about wrong under concurrent async updates, so this is deliberate
        // insurance rather than reliance on that alone. Bumping `queueTick`
        // when the queue is now empty is a harmless no-op — the effect's own
        // `queue.length === 0` guard bails immediately.
        setQueueTick((t) => t + 1);
      } catch (e) {
        console.error('[chips] a batch failed to submit', e);
        // The chip/upgrade is safe — it stays in the queue and will retry.
        // Silence here is the bug this message exists to fix: offline, a
        // revoked sponsorship, or a down node otherwise tells the player
        // nothing at all while their queue quietly grows.
        setNotice('the kitchen can\'t hear the counter right now — it\'s still in the queue and will go in once it can');
        // Keep it queued and try again. Capped so a long offline spell does not
        // decay into one attempt an hour.
        backoff.current = Math.min(backoff.current === 0 ? 2000 : backoff.current * 2, 60_000);
        // NOT guarded by `cancelled`, unlike an earlier version of this line.
        // This effect's own top guard (`if (sending.current || ...) return;`)
        // bails BEFORE reaching `let cancelled = false` whenever a send is
        // already in flight — so a queue change that arrives while THIS
        // attempt is still awaiting the network gets its OWN effect run
        // short-circuited with no new cleanup registered, while the ORIGINAL
        // run's `cancelled` (captured by the run that started the request) is
        // flipped true by the cleanup of the run being superseded. If this
        // catch block then honoured that `cancelled`, the retry it schedules
        // would silently never fire: the sender goes idle with a non-empty
        // queue until the player's next unrelated bank or buy happens to bump
        // `queue`/`queueTick` again. Nothing is lost — the queue is persisted
        // either way — but a real failure then sits silently un-retried,
        // which is worse than a spurious extra check. `setQueueTick` is a pure
        // nudge: whichever effect run it wakes re-reads the CURRENT
        // queue/host/table fresh and bails cleanly on its own if there is
        // nothing to do, so firing it after a supersession is harmless —
        // exactly like the unguarded `setQueue`/`setQueueTick` calls on the
        // success path above.
        setTimeout(() => setQueueTick((t) => t + 1), backoff.current);
      } finally {
        sending.current = false;
      }
    })();

    return () => { cancelled = true; };
    // `refresh` is not listed as a dep of ITS OWN accord: every one of
    // `refresh`'s deps (`host`, `tableId`, `me`) is already in this effect's
    // dep list below, so `refresh`'s identity can only change when something
    // already tracked here changes — adding it would not change when this
    // effect reruns, only churn the lint suppression needed to justify
    // omitting it syntactically (eslint's exhaustive-deps rule can't infer
    // "already covered transitively" on its own).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, queueTick, host, me, tableId]);

  /* ── the fryers (designer-paced — lib/cooking.ts holds the locked spec) ── */
  const fryerCount = state?.fryers ?? 0;
  /**
   * The depth the CREW sees — normally the fold's dipIndex, but a dev build
   * honours `?crew=N` so a screen review can meet the queso jobs without six
   * hours of digging. Display/policy only (roster, stalls, ticker, jobs
   * gate); the fold, the tutorial and the tier ceremony never read it, and
   * `import.meta.env.DEV` compiles the whole branch out of production.
   */
  const crewDip = ((): number => {
    const real = state?.dipIndex ?? 0;
    if (!import.meta.env.DEV) return real;
    const q = new URLSearchParams(window.location.search).get('crew');
    if (q === null) return real;
    const n = Number(q);
    return Number.isInteger(n) && n >= 0 && n < DIP_TIERS.length ? n : real;
  })();
  dipIndexRef.current = crewDip;

  /* ── JOBS, AS THEY APPLY AT THIS DEPTH ──────────────────────────────────
     Every read of a job's EFFECT goes through these, never through the raw
     state. The tick gates stop a job advancing too shallow; they do nothing
     about one already running when the depth drops, and a tip drops it to
     zero — which left the wing perched and paying x2 four tiers below its
     layer (see crewJobs.ts `wingAtDepth`). A gate on advance is not a gate
     on effect, and the effect is what pays. */
  const wingNow = wingAtDepth(wing, crewDip);
  const oracleNow = oracleAtDepth(oracle, crewDip);
  const voteNow = voteAtDepth(vote, crewDip);
  const hermitNow = hermitAtDepth(hermit, crewDip);
  const ratNow = ratAtDepth(rat, crewDip);
  const angelNow = angelAtDepth(angel, crewDip);
  const wingNowRef = useRef(wingNow); wingNowRef.current = wingNow;
  const oracleNowRef = useRef(oracleNow); oracleNowRef.current = oracleNow;

  // OLD SALT fattens every tick, forever — the one thing a tipped bowl
  // keeps. It multiplies the seasoning rather than the pot so it compounds
  // with everything the run rebuilds.
  const saltBonus = 1 + (state?.oldSalt ?? 0) * SALT_TICK_BONUS;
  const seasoning = (state ? state.seasoningNum / state.seasoningDen : 1) * saltBonus * motionBonus(voteNow);
  // The detector chain, remapped in game terms: crackles come sooner.
  const crackleHaste = state?.owned.has('detector2') ? 0.6 : state?.owned.has('detector') ? 0.75 : 1;

  // Per-basket crackle timestamps — key the flash so every crackle replays it.
  const [crackleAt, setCrackleAt] = useState<(number | null)[]>([]);
  // Per-basket tick floaters ("+500" on every tick — the pot must PERFORM,
  // not just change; designer review called the bare swap "a bored odometer").
  const [tickAt, setTickAt] = useState<({ at: number; amount: number } | null)[]>([]);
  const onCookEvents = useCallback((events: CookEvent[]) => {
    // The crew's heartbeat rides the cook clock (one call per tick, always —
    // the pot always gains). A fired blessing is consumed; diverted ticks
    // land in the rat's cheeks; an eaten crackle is his outrage to perform.
    if (blessRef.current !== null && events.some((e) => e.index === blessRef.current)) {
      blessRef.current = null;
    }
    for (const e of events) {
      if (e.diverted) setRat((r) => ratAbsorb(r, e.gained));
      if (e.crackleEaten) {
        setRat(ratAte);
        setRatChomp(Date.now());
        sfx.pop();
      }
    }
    if (dipIndexRef.current >= JOBS_MIN_DIP_INDEX) {
      setRat((r) => ratTick(r, fryersRef.current, Math.random));
      setAngel((a) => angelTick(a, Math.random));
    }
    // The deep jobs, each gated on its own character's layer.
    const depth = dipIndexRef.current;
    if (depth >= JOB_LAYER.wing) setWing((w) => wingTick(w, fryersRef.current, Date.now(), Math.random));
    if (depth >= JOB_LAYER.committee) setVote((v) => voteTick(v, Math.random));
    if (depth >= JOB_LAYER.hermit) setHermit((h) => hermitTick(h, Math.random));
    if (depth >= JOB_LAYER.oracle) setOracle((o) => oracleTick(o, fryersRef.current, Math.random));

    setTickAt((prev) => {
      const next = prev.slice();
      for (const e of events) next[e.index] = { at: Date.now() + e.index, amount: e.gained };
      return next;
    });
    const crackled = events.filter((e) => e.crackled);
    if (crackled.length === 0) return;
    setCrackleAt((prev) => {
      const next = prev.slice();
      for (const e of crackled) next[e.index] = Date.now() + e.index; // +index: two same-instant crackles still get distinct keys
      return next;
    });
    for (const e of crackled) {
      if (e.wentGolden) sfx.golden();
      else sfx.crackle();
    }
  }, []);

  /** Where the rack is kept across reloads. Memoised so the restore effect
   *  does not re-fire on every render. */
  const rackKey = useMemo(
    () => (tableId && me ? { tableId, author: me.publicKeyHex } : null),
    [tableId, me]
  );
  const { chips, dip, take, resetAll, allocMs } = useCooking(
    fryerCount, seasoning, crackleHaste,
    Boolean(host && me && tableId && state), onCookEvents, modsFor, rackKey
  );
  fryersRef.current = fryerCount;
  /* ── THE PORCELAIN ──────────────────────────────────────────────────── */
  const porcReach = state ? porcelainInReach(state.lifetimeChips, state.broken) : false;
  /** The deep boss in front of you, if any — bands 1-5, health-based. */
  const deepFight = state ? fightAt(state.broken, state.lifetimeChips, state.bossDamage, state.bossHpFrozen) : null;
  const porcReady = readiness(chips, state?.lifetimeChips ?? 0);

  /** The Long Fry: one more crackle past golden. Ownership only — the fold
   *  records the jar, the ceiling itself never touches the chain. */
  const ceiling = state?.owned.has('longfry') ? LONG_FRY_CRACKLES : MAX_CRACKLES;
  ceilingRef.current = ceiling;


  /* ── moves ────────────────────────────────────────────────────────────── */
  /**
   * Send the banked chip arcing into the tunnel.
   *
   * Measured from the live DOM rather than guessed, because the rack reflows
   * with the fryer count and the tunnel moves with the viewport. Purely a
   * flourish over the scene — it is fixed-position and takes part in no
   * layout, which is the whole reason it replaced the in-flight panel.
   */
  function launchDip(index: number, chip: { ms: number; bits: number }, double: boolean): void {
    const basket = document.querySelector(`.rack .basket[data-fryer="${index}"] .basket-chip`);
    const wrap = document.querySelector('.tunnel-wrap');
    if (!basket || !wrap) return;
    const a = basket.getBoundingClientRect();
    // The chip plunges in AT THE DIG FRONT — the pile element the Tunnel
    // renders unconditionally (see its comment) — so the entry point tracks
    // the front even as the strata scroll. The wrap is only the fallback.
    const front = document.querySelector('.tunnel-front') ?? wrap;
    const b = front.getBoundingClientRect();
    const size = Math.max(30, Math.min(a.width || 56, 76));
    // The crumb burst's destination: the crumb counter itself if the DOM has
    // one, else the tunnel it sits under — either way, somewhere on the
    // counter, not into empty space.
    const counter = document.querySelector('.tunnel-crumbs') ?? wrap;
    const cRect = counter.getBoundingClientRect();
    setFlight({
      key: chip.ms, ms: chip.ms, bits: chip.bits, size, double,
      x0: a.left + a.width / 2 - size / 2,
      y0: a.top + a.height / 2 - size / 2,
      x1: b.left + b.width / 2 - size / 2,
      y1: b.top + b.height * 0.6 - size / 2,
      cx1: cRect.left + cRect.width / 2,
      cy1: cRect.top + cRect.height / 2,
    });
    // 1400ms, not the ~1.25s the CSS animation runs: the crumb burst's last
    // piece fires at animation-delay .78s + 6*.012s and takes .5s itself, so
    // the flight must outlive ~1.35s of animation or the last few crumbs are
    // yanked from the DOM mid-flight.
    window.setTimeout(() => setFlight((f) => (f && f.key === chip.ms ? null : f)), 1400);
  }

  function onDip(index: number): void {
    if (!host || !me || !tableId) return;
    // Feed mode reroutes the basket click entirely: the chip goes to the
    // vendor, not the dip. Nothing below runs.
    if (feedingRef.current) { onFeed(index); return; }
    // DESTRUCTIVE like the old bank(): the result is the only copy of this
    // dip; the basket restarts a fresh chip immediately.
    const res = dip(index, state?.doubleDipMod ?? 0);
    if (!res) return;
    // Before the multipliers below rewrite res.amount in place. "the chip was
    // worth less than it looked" and "the multipliers didn't apply" are
    // different bugs and only the pair can tell them apart.
    const rawAmount = res.amount;
    // The wing sits where it hurts and the strings do not lie: a basket one
    // of them is watching pays more, and both at once STACK.
    const watchBonus = dipBonusFor(index, wingNowRef.current, oracleNowRef.current);
    if (watchBonus > 1) {
      res.amount = Math.floor(res.amount * watchBonus);
      const who = wingNowRef.current.at === index && oracleNowRef.current.at === index ? 'wing'
        : wingNowRef.current.at === index ? 'wing' : 'oracle';
      say(who, who === 'wing'
        ? 'DOUBLE. that’s what happens when you listen to a wing.'
        : 'the strings do not lie. take your reward and pretend you decided that.', 6000);
    }
    // THE GRAIN (char): consecutive dips in the SAME basket escalate. Applied
    // after the wing/oracle bonus and multiplicatively with it — both are
    // reasons this particular dip is worth more, and neither is a tick rate.
    // Read before advancing, so the dip that STARTS a streak pays x1.
    if (state?.charOwned.has('grain')) {
      const pm = polishMult(polishRef.current, index);
      if (pm > 1) res.amount = Math.floor(res.amount * pm);
      setPolish((p) => advancePolish(p, index));
    }

    const crackles = Math.round(Math.log2(res.multi));
    // chipMs, not the wire ms: a chip's silhouette is seeded from its authoring
    // ms (Kitchen's xorshift32), so the chip that flies out of the basket has to
    // carry the same one it wore while it sat there.
    launchDip(index, { ms: res.chipMs, bits: visualFor({ ms: res.chipMs, crackles }).bits }, res.doubled);
    sfx.dip(res.doubled);
    if (res.doubled) {
      // EXTREMELY celebrated, per the owner: a proc is the game's slot-machine
      // payoff and a meek "x2" suffix buried it. Full-screen stamp + sting.
      setDdSplash(Date.now());
      sfx.doubleDip();
      window.setTimeout(() => setDdSplash((v) => (v && Date.now() - v >= 2100 ? null : v)), 2300);
    }
    // The payout float, announced HERE at the moment of the dip — and HONEST
    // about the bowl cap: the fold clamps storage, so a rim-bound dip must
    // say what actually landed and what spilled, never a number the counter
    // will not move for (designer review: 78k burned silently).
    const room = state ? Math.max(0, state.bowlCap - crumbsNow) : res.amount;
    const credited = Math.min(res.amount, room);
    const spilled = res.amount - credited;
    const counter = document.querySelector('.tunnel-crumbs') ?? document.querySelector('.tunnel-wrap');
    if (counter) {
      const r = counter.getBoundingClientRect();
      const born: GainFloat = {
        key: res.ms,
        text: spilled > 0
          ? (credited > 0 ? `+${compact(credited)} — ${compact(spilled)} spilled!` : `bowl full — ${compact(spilled)} spilled!`)
          : `+${compact(res.amount)}${res.doubled ? ' x2' : ''}`,
        golden: crackles >= MAX_CRACKLES,
        doubled: res.doubled,
        empty: credited <= 0,
        x: r.left + r.width / 2, y: r.top + r.height / 2,
        dx: ((res.ms % 7) - 3) * 9,
        delay: 0.95,
      };
      setGains((g) => [...g, born]);
      window.setTimeout(() => setGains((g) => g.filter((f) => f.key !== res.ms)), 2400);
      if (credited > 0) sfx.gain(born.golden, 0.95);
    }
    // WHAT THIS DIP THOUGHT IT PAID, on the record. A dip is destructive —
    // the basket restarted a fresh chip above — so this is the only surviving
    // copy of the pot that was actually dipped. Recorded BEFORE the enqueue so
    // a dip that dies on the way to the queue is still described. See
    // dipRing.ts for the four different bugs this separates.
    const dipId = nextId.current++;
    noteDip({
      // `ms` is the chip's BIRTH so `at - ms` still reads as the cook duration;
      // `wireMs` is what went on chain. They are the same number only for a
      // chip dipped the instant it was cast on. See cooking.ts's dipFor.
      at: Date.now(), route: 'dip', index, ms: res.chipMs, wireMs: res.ms,
      cookedMs: res.cookedMs, pot: res.pot, crackles,
      raw: rawAmount, amount: res.amount, doubled: res.doubled,
      bowlCap: state?.bowlCap ?? 0, crumbsBefore: crumbsNow,
      room, credited, spilled,
      queuedId: dipId,
    });
    // Every queued entry carries the table/identity it was made for — see
    // chipsQueue.ts's file header on provenance.
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'dip', amount: res.amount, ms: res.ms },
      dipId
    ));
    // The dog watched that chip go into the dip instead of into him. He has
    // notes. Occasional, and never over someone else's bubble.
    if (!bubble && Math.random() < 0.07) {
      const scoop = CREW[0];
      if (scoop.dipLines && scoop.dipLines.length > 0) say('scoop', pickLine('scoop', scoop.dipLines), 6000);
    }
  }

  function onBuy(key: string): void {
    if (!host || !me || !tableId) return;
    // Cheap pre-bail against the LAST rendered fold — already-owned doesn't
    // need same-tick precision (nobody buys the same upgrade from two racing
    // code paths in a way this misses).
    if (state?.owned.has(key)) return;
    // The jar is disabled when unaffordable, so a click that gets this far is
    // a real purchase in all but a same-tick race — a pop on that rare
    // rejection is a harmless false positive, not a lie about state.
    sfx.pop();
    const table = tableId;
    const author = me.publicKeyHex;
    // Everything that DOES need same-tick precision lives inside the
    // functional updater, not out here. `crumbsNow` is a snapshot from the
    // last render — fine for ONE buy, but two DIFFERENT jars clicked in the
    // same tick (before any re-render) would each check it independently and
    // both could pass, even though only one is actually affordable once the
    // other's cost is committed. React guarantees a functional updater sees
    // the result of every earlier update already applied in this same batch,
    // so computing "what's already committed" from `q` HERE — not from the
    // outer `queue` closure — is what makes the second click in a same-tick
    // pair correctly see the first's cost already spoken for.
    //
    // `foldedIdsRef` (not `q` itself) is what tells same-tick "not yet folded"
    // apart from "already folded, and therefore already subtracted from
    // `crumbsNow`" — see chipsAfford.ts and the ref's own comment above. Using
    // the SAME `canAffordBuy` predicate the Shelf's `afford` uses is what
    // guarantees a lit jar and this guard never disagree.
    setQueue((q) => {
      const activeBuys = activeFor(q, table, author).filter(isBuyMove);
      // Same predicate the chip-eating gates use — see queuedBuyKeys' note.
      if (queuedBuyKeysOf(activeFor(q, table, author)).has(key)) return q;
      const cost = UPGRADES[key]?.cost;
      if (cost === undefined) return q;
      const committed = pendingBuyCost(activeBuys, foldedIdsRef.current, (k) => UPGRADES[k]?.cost);
      if (!canAffordBuy(crumbsNow, committed, cost)) return q; // not affordable once unfolded queued buys are accounted for
      // In flight from here until the fold grants or refuses it — see
      // boughtPendingRef. This is the only place a buy is born, so it is the
      // only place the set can be kept honest.
      boughtPendingRef.current.set(key, allocMs());
      return enqueue(q, { tableId: table, author, kind: 'buy', key }, nextId.current++);
    });
  }

  /* ── the stalls: pay the critter in chips ─────────────────────────────── */
  /** Clicking a jar ARMS the vendor rather than buying: the critter steps up
   *  and waits to be fed a chip off the fryer. The crumb price is unchanged
   *  fold business (`onBuy`); the chip is the ritual on top. */
  /** THE FOLD WILL REJECT THIS, SO DO NOT EAT A CHIP FOR IT.
   *
   *  A chained jar needs every rung below it OWNED — `applyBuy` answers
   *  `rejected-order` otherwise, and because the vendor path takes the chip
   *  BEFORE the buy is queued, that refusal costs a chip and returns nothing.
   *
   *  Read off the operator's own table on 2026-08-04: `season3` has no buy on
   *  chain in the current run, and `season4` through `season7` were attempted
   *  five times over — 17:23, 17:44, 18:11, 20:44 — every one `rejected-order`,
   *  every one paid for with a chip. "I have bought them like 3 times this
   *  keeps happening."
   *
   *  `openJarsOf` already applies this rule to the SHELF, against the same
   *  `owned` set. This applies it at the moment of paying, against the folded
   *  state, so a shelf that has drifted out of step with the chain cannot
   *  charge you for a move the chain will not take. */
  function prefixMissing(key: string): string | null {
    const chain = UPGRADE_CHAINS.find((c) => c.includes(key));
    if (!chain || !state) return null;
    const idx = chain.indexOf(key);
    for (let i = 0; i < idx; i++) if (!state.owned.has(chain[i])) return chain[i];
    return null;
  }

  function onJar(key: string): void {
    if (!host || !me || !tableId) return;
    if (state?.owned.has(key)) return;
    // Paid for, just not confirmed yet. Arming again is how a chip got eaten
    // for nothing — say so instead, because "nothing happens" is what made the
    // player try again in the first place.
    if (queuedBuyKeys.has(key) || boughtPendingRef.current.has(key)) {
      setNotice('that one is already bought — it is still going through');
      return;
    }
    const need = prefixMissing(key);
    if (need !== null) {
      setNotice(`${UPGRADES[need]?.label ?? need} has to come first`);
      return;
    }
    const vendor = vendorOf(key);
    if (!vendor) return;
    if (feeding && feeding.jarKey === key) { setFeeding(null); setBubble(null); return; }
    sfx.pop();
    setFeeding({ vendor, jarKey: key });
    // Arming means "go click a chip" — the sheet would be covering the very
    // fryers it just asked for, so it steps out of the way.
    setSheetId(null);
    say(vendor.id, pickLine(vendor.id, vendor.armLines), 9000);
  }

  /** The armed vendor is fed basket `index`. A refused chip (the angel takes
   *  only goldens) keeps the mode armed; an accepted one is consumed off the
   *  fryer — its pot is the price — and the guarded buy goes through. */
  function onFeed(index: number): void {
    const f = feedingRef.current;
    if (!f || !host || !me || !tableId) return;
    const chip = chips[index];
    if (!chip || chip.pot <= 0) return;
    if (f.vendor.feed === 'golden' && !isGolden(chip)) {
      say(f.vendor.id, pickLine(f.vendor.id, f.vendor.armLines), 6000);
      return;
    }
    // THE HERMIT'S TRADE: no jar, no crumb price — he takes the chip's whole
    // worth down into the celery and either brings it back tripled or does
    // not. Handled before the purchase path because there is nothing to buy.
    if (f.jarKey === HERMIT_TRADE) {
      const worth = chip.pot * (2 ** chip.crackles);
      const takenChip = take(index);
      if (!takenChip) return;
      // THE ROUTE THAT LEAVES NO TRACE. No queue entry, no chain move, no
      // crumbs — so unless it is recorded HERE it is indistinguishable from a
      // dip that was lost, which is exactly how it read twice on 2026-07-29.
      noteTapAway('hermit', Date.now(), index, chip);
      setHermit((h) => giveHermit(h, worth));
      launchFeed(index, takenChip, 'hermit');
      say('hermit', 'i take it down. i bring it back bigger. that’s the whole arrangement. no receipt.', 8000);
      setFeeding(null);
      return;
    }
    // The crumbs must still be there — the jar could have been armed a while
    // ago (she waits for a golden). A short bowl calls the deal off BEFORE
    // the chip is eaten, never after.
    const cost = UPGRADES[f.jarKey]?.cost;
    if (cost === undefined || !canAffordBuy(crumbsNow, pendingCommitted, cost)) {
      setFeeding(null);
      setNotice('the crumbs came up short — the deal is off');
      return;
    }
    // THE CHIP IS EATEN ON THE NEXT LINE AND CANNOT BE PUT BACK, so every
    // reason `onBuy` might refuse has to be settled BEFORE it. `onBuy` refuses
    // a jar it already has queued — and it does so with a bare `return q`,
    // which is invisible. That combination is what turned a mistimed second
    // feed into a chip that simply vanished.
    if (queuedBuyKeys.has(f.jarKey) || boughtPendingRef.current.has(f.jarKey)) {
      setFeeding(null);
      setNotice('that one is already bought — it is still going through');
      return;
    }
    const missing = prefixMissing(f.jarKey);
    if (missing !== null) {
      setFeeding(null);
      setNotice(`${UPGRADES[missing]?.label ?? missing} has to come first`);
      return;
    }
    const taken = take(index);
    if (!taken) return;
    noteTapAway('jar', Date.now(), index, chip);
    launchFeed(index, taken, f.vendor.id);
    say(f.vendor.id, pickLine(f.vendor.id, f.vendor.munchLines), 8000);
    onBuy(f.jarKey);
    setFeeding(null);
  }

  /** The fed chip flies from its fryer to the vendor — same flight machinery
   *  as the dip, pointed at a critter instead of the dig front. */
  function launchFeed(index: number, chip: { ms: number; crackles: number }, vendorId: string): void {
    const basket = document.querySelector(`.rack .basket[data-fryer="${index}"] .basket-chip`);
    const target = document.querySelector(`.critter-${vendorId}`)
      ?? document.querySelector('.tunnel-front') ?? document.querySelector('.tunnel-wrap');
    if (!basket || !target) return;
    const a = basket.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const size = Math.max(30, Math.min(a.width || 56, 76));
    setFlight({
      key: chip.ms, ms: chip.ms,
      bits: visualFor({ ms: chip.ms, crackles: chip.crackles }).bits,
      size, double: false,
      x0: a.left + a.width / 2 - size / 2,
      y0: a.top + a.height / 2 - size / 2,
      x1: b.left + b.width / 2 - size / 2,
      y1: b.top + b.height * 0.35 - size / 2,
      cx1: b.left + b.width / 2,
      cy1: b.top + b.height * 0.3,
    });
    window.setTimeout(() => setFlight((fl) => (fl && fl.key === chip.ms ? null : fl)), 1400);
  }

  /* ── crew jobs: shoo and bless ────────────────────────────────────────── */
  function onShoo(): void {
    if (!host || !me || !tableId) return;
    const { payout, rat: fresh } = shooRat(ratRef.current);
    setRat(fresh);
    sfx.pop();
    const ratMember = CREW.find((c) => c.id === 'rat');
    if (ratMember) say('rat', pickLine('rat', ratMember.lines), 5000);
    if (payout <= 0) return;
    const ms = allocMs();
    // Same honest cap-room accounting as a dip — his payout can spill too.
    const room = state ? Math.max(0, state.bowlCap - crumbsNow) : payout;
    const credited = Math.min(payout, room);
    const spilled = payout - credited;
    const counter = document.querySelector('.tunnel-crumbs') ?? document.querySelector('.tunnel-wrap');
    if (counter) {
      const r = counter.getBoundingClientRect();
      const born: GainFloat = {
        key: ms,
        text: spilled > 0
          ? (credited > 0 ? `+${compact(credited)} from the rat — ${compact(spilled)} spilled!` : `bowl full — ${compact(spilled)} spilled!`)
          : `+${compact(payout)} from the rat`,
        golden: false, doubled: false, empty: credited <= 0,
        x: r.left + r.width / 2, y: r.top + r.height / 2,
        dx: ((ms % 7) - 3) * 9,
        delay: 0.15,
      };
      setGains((g) => [...g, born]);
      window.setTimeout(() => setGains((g) => g.filter((fl) => fl.key !== ms)), 2400);
      if (credited > 0) sfx.gain(false, 0.15);
    }
    // His hoard rides the ordinary self-declared dip verb — no new grammar.
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'dip', amount: payout, ms },
      nextId.current++
    ));
  }

  /**
   * THE REPORT BUTTON. One press, at the moment it happens, and everything
   * the client knows goes to the clipboard.
   *
   * Built because a 4.1M dip paid nothing on a phone and the chain could only
   * prove a negative — no such dip was ever submitted. The answer was
   * client-side (an unsent queue entry, a worth that disagreed with its
   * payload, a throw in a worker) and every one of those is invisible from
   * outside and unreachable on a device with no console.
   *
   * Clipboard first because on a phone that is the shortest path from "it
   * happened" to somebody reading it. `VITE_CHIPS_DEBUG_SPACE` posts the same
   * text to a space as well when one is configured, for the durable version.
   */
  async function onReport(): Promise<void> {
    /* SAY WHY, AT THE MOMENT THEY PRESS IT. Operator, 2026-08-05: "if I press
       the button and it disagrees then say why (lifetime change \ crumb score
       change etc)". The report is what an engineer reads hours later; the
       player is standing here NOW and is the only one who can say "no, that is
       not what I saw". Silent when the client and the chain agree. */
    const unpaid = dipsUnpaid(dipEntries(), state ?? null, queue, Date.now());
    const why = disagreementLine(unpaid, state ?? null);

    let text: string;
    try {
      text = snapshotText({
        at: Date.now(),
        tableId, tableName: cookName || null, author: me?.publicKeyHex ?? null,
        state: state ?? null, queue, chips,
        dips: dipEntries(),
        journal: moveEvents(), regressions: foldRegressions(), pollGaps,
        ceiling, seasoning, crackleHaste,
        errors: ringEntries(),
        build: {
          rpc: import.meta.env.VITE_CHIPS_RPC,
          space: import.meta.env.VITE_CHIPS_SPACE,
          mode: import.meta.env.MODE,
        },
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
        ua: navigator.userAgent,
      });
    } catch (e) {
      // A capture that dies during a failure is worse than none — say so
      // rather than leaving the player pressing a dead button.
      setNotice('could not build the report');
      ringNote('note', `snapshot failed: ${String(e)}`);
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // Safari/iOS refuse the clipboard outside a trusted gesture chain, and
      // http origins have no clipboard at all. Fall back to something the
      // player can still get at rather than failing silently.
      ringNote('note', 'clipboard refused; falling back to console');
      console.log(text);
    }
    sfx.pop();
    setNotice(copied ? 'report copied — paste it somewhere' : 'report is in the console (clipboard refused)');

    /* AND ON THE RECORD. The clipboard is the fastest path off a phone, but it
       is also one Ctrl-C from gone — the operator filed a report mid-bug and
       the state at the moment of the bug survived only as long as they copied
       nothing else. The durable copy is a post in the debug space.

       AFTER the clipboard, never before: this mines a post PoW and takes real
       seconds, and the player must not be made to wait to get their own report
       out. A failure here changes nothing they can see beyond the notice —
       they still have the text. */
    if (!host || !me || !CAN_FILE_REPORTS) return;
    try {
      const cid = await host.reportBug(me, text);
      // The disagreement outranks the filing confirmation: "it filed" is
      // housekeeping, "three dips paid you 4.2M the chain never saw" is the
      // thing they pressed the button about.
      if (cid) setNotice(why ?? (copied ? 'report copied — and filed' : 'report filed'));
    } catch (e) {
      // NO LONGER QUIET. It was, on the reasoning that the clipboard copy is
      // the one that matters — but the on-chain copy is the one anyone
      // debugging actually reads, and a partial file is indistinguishable from
      // a whole one until somebody goes looking and finds the tail missing.
      // The player is the only one who can retry, so the player has to be told.
      ringNote('note', `report post failed: ${String(e)}`);
      setNotice(copied ? 'report copied — but filing it failed' : 'filing the report failed');
    }
  }

  /**
   * SWING IT. The porcelain has one move and it is the move you already know:
   * an ordinary dip. If it clears the bar the band breaks, which is a `broke`
   * on the chain and the char that comes with it.
   *
   * The dip is enqueued FIRST. It has to land before the break for the fold
   * to agree with what the player saw — `broke` checks lifetime, and the dip
   * is what pushes lifetime over.
   */
  function onPorcelainSwing(index: number): void {
    if (!host || !me || !tableId || !state) return;
    const chip = chips[index];
    if (!chip || chip.pot <= 0) return;
    const paid = worthOf(chip);
    const willCrack = cracks(paid, state.lifetimeChips);
    if (!willCrack) {
      // A failed swing is an ordinary dip: you keep what the chip was worth,
      // which is what makes retries free (design: "free retries, but only if
      // they are prepared").
      onDip(index);
      return;
    }
    // A WINNING swing FEEDS the chip to the boss. `take` removes it from the
    // rack without paying — the same primitive a vendor feed uses — so the
    // chip buys the band and nothing else. Dipping it here as well is what
    // sent one player past five unfought bands in a single move.
    noteTapAway('porcelain', Date.now(), index, chip);
    take(index);
    setPorcBroke(true);
    sfx.breakthrough();
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'broke', paid, ms: allocMs() },
      nextId.current++
    ));
    window.setTimeout(() => { setPorcOpen(false); setPorcBroke(false); }, 5200);
  }

  /** Tap a fryer's flame. Refused without the jar, so the button can never
   *  light something the player has not bought. */
  function onOvercook(index: number): void {
    if (!state?.owned.has('overcook')) return;
    sfx.pop();
    setOvercookAt((lit) => toggleOvercook(lit, index));
  }

  /**
   * Can the armed jar be refused, and for how much? Null when it cannot —
   * the hermit's trade is not a jar at all, and a chain rung whose prefix is
   * unowned is something the fold would reject anyway.
   */
  function refusableNow(jarKey: string): { crumbs: string; forfeits: string[]; onRefuse: () => void } | null {
    const jar = UPGRADES[jarKey];
    if (!jar || !state || state.owned.has(jarKey) || state.declined.has(jarKey)) return null;
    const chain = UPGRADE_CHAINS.find((c) => c.includes(jarKey));
    if (chain && chain.slice(0, chain.indexOf(jarKey)).some((p) => !state.owned.has(p))) return null;
    return {
      crumbs: compact(Math.floor(jar.cost * BURN_REFUND_NUM / BURN_REFUND_DEN)),
      // What the press really costs. The refund was the only number on the
      // button, which made an irreversible ladder-ending choice read as a
      // small one.
      forfeits: forfeitsOnRefuse(jarKey, state.owned),
      onRefuse: () => { setFeeding(null); setBubble(null); onDecline(jarKey); },
    };
  }

  /* ── THE MOMENT OPENS ITSELF ─────────────────────────────────────────────
     Fires when `bowls` rises, which happens exactly once per arrival: the fold
     increments it on coming up through the bottom. Guarded by `bottomSeenAt` so
     a re-fold of the same chain cannot show it twice — the moment is supposed to
     be unrepeatable, and a poll that reopened it would make it a page. */
  useEffect(() => {
    if (!state || !HAS_THE_BOTTOM || !host) return;
    if (!hasBeenThere(state.bowls)) return;
    if (bottomSeenAt.current === state.bowls) return;
    bottomSeenAt.current = state.bowls;
    setBottomSigned(false);
    setBottomOpen(true);
    setBottomLoading(true);
    // Read the wall fresh. Never cached: it should be whoever has been there as
    // of THIS moment, and a client must not pretend to know while offline.
    host.readTheBottom()
      .then((posts) => {
        const marks = posts
          .map((x) => parseMark(x.body, x.at))
          .filter((m): m is Mark => m !== null);
        setBottomMarks(wall(marks));
      })
      .catch((e) => { ringNote('note', `the bottom would not load: ${String(e)}`); })
      .finally(() => setBottomLoading(false));
  }, [state?.bowls, host]);

  /** Leave a mark on the wall. One post, then the form closes for good. */
  function onSignBottom(who: string): void {
    if (!host || !me || !state) return;
    let body: string;
    try {
      body = markBody(who, state.bowls);
    } catch {
      return;   // sanitised to nothing — the button is disabled for this anyway
    }
    setBottomSigned(true);
    sfx.pop();
    host.signTheBottom(me, body).catch((e) => {
      // Quiet: the moment is folklore, not a transaction. Losing a mark is a
      // shame, not a failure the player can do anything about.
      ringNote('note', `mark did not land: ${String(e)}`);
    });
  }

  /**
   * CHIP AT A DEEP BOSS. One blow: feed a basket, it does its worth in damage.
   *
   * The chip is FED, not dipped (`take`, the vendor primitive) — the fold spends
   * it rather than banking it, which is what lets a fight span sessions without
   * the value being collected twice. A blow that does not finish is progress,
   * and the fold reports it as `chipped`.
   */
  function onDeepHit(index: number): void {
    if (!host || !me || !tableId || !state) return;
    const fight = fightAt(state.broken, state.lifetimeChips, state.bossDamage, state.bossHpFrozen);
    if (!fight) return;
    const chip = chips[index];
    if (!chip || chip.pot <= 0) return;

    const paid = worthOf(chip);
    const willFinish = fight.done + paid >= fight.hp;
    // The `broke` move below carries a FRESH allocMs(), not this chip's ms, so
    // the chain cannot be joined back to the basket that paid for it. This note
    // is the only place the two are ever written down together.
    noteTapAway('boss', Date.now(), index, chip);
    take(index);
    if (willFinish) {
      // Freeze THIS band as the one that gave, before the fold moves on.
      setDeepBrokeFight({ ...fight, done: fight.hp, left: 0, frac: 1 });
      setDeepBroke(true);
      sfx.breakthrough();
      window.setTimeout(() => {
        setDeepOpen(false); setDeepBroke(false); setDeepBrokeFight(null);
      }, 5200);
    } else {
      sfx.pop();
      setNotice(`${compact(paid)} off ${fight.label}. it remembers.`);
    }
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'broke', paid, ms: allocMs() },
      nextId.current++
    ));
  }

  /**
   * BUY A RULE CHANGE FROM SCOOP.
   *
   * The cost travels in the body (policy, retunable); the fold's only job is
   * that char cannot go negative and nothing is bought twice. Guarded here too
   * so the button can never send something the chain would reject.
   */
  function onSpendChar(a: { key: string; cost: number }): void {
    if (!host || !me || !tableId || !state) return;
    if (state.charOwned.has(a.key) || state.char < a.cost) return;
    sfx.pop();
    setNotice(`scoop takes ${a.cost} ${a.cost === 1 ? 'grain' : 'grains'}. the rules change.`);
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'spend', ability: a.key, cost: a.cost, ms: allocMs() },
      nextId.current++
    ));
  }

  /**
   * REFUSE A JAR and take BURN_REFUND of its price in crumbs.
   *
   * Not a sale — the jar is never owned. It is given up for the run, and for
   * a chain rung that forfeits everything above it too, because a buy still
   * needs its prefix. The fold owns both rules; this only stops the button
   * offering something the chain would reject.
   */
  function onDecline(key: string): void {
    if (!host || !me || !tableId || !state) return;
    if (state.owned.has(key) || state.declined.has(key)) return;
    const chain = UPGRADE_CHAINS.find((c) => c.includes(key));
    if (chain && chain.slice(0, chain.indexOf(key)).some((p) => !state.owned.has(p))) return;
    sfx.pop();
    setNotice(`refused — ${compact(Math.floor(UPGRADES[key].cost * BURN_REFUND_NUM / BURN_REFUND_DEN))} crumbs, and it is gone for this bowl`);
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'burn', key, ms: allocMs() },
      nextId.current++
    ));
  }

  /** A REASON: whistle the wing onto a basket. Refused without the jar and
   *  refused while it is still cooling (callWing owns both rules) — the
   *  ownership guard is repeated here rather than trusted to the call site,
   *  because a control that renders for a non-owner has been this client's
   *  most-repeated bug.
   *
   *  EVERY REFUSAL ANSWERS. The first cut returned silently on the cooldown
   *  branch and the button was `disabled` on top of that, so a tap produced
   *  nothing at all — no sound, no motion, no words (operator: "just nothing
   *  happens"). A rule the player cannot perceive is indistinguishable from a
   *  broken control, and they will conclude the 300M jar does not work. */
  function onWingCall(index: number): void {
    if (!state?.owned.has('wingcall')) return;
    const now = Date.now();
    if (now < wingNowRef.current.readyAt) {
      const left = Math.ceil((wingNowRef.current.readyAt - now) / 1000);
      sfx.tap();                                   // the dull "no" poke
      setWingNope({ index, at: now });             // keys the shake
      say('wing', `i am NOT listening. ${left}s. there was never a bird and there is never a hurry.`, 4000);
      return;
    }
    // Tapping the basket it already sits on is a no-op in callWing, and
    // saying so is friendlier than a shake that implies you did wrong.
    if (wingNowRef.current.at === index) {
      say('wing', 'i am ALREADY here. look at me. LOOK at me.', 4000);
      return;
    }
    sfx.pop();
    setWing((w) => callWing(w, index, fryersRef.current, now));
    say('wing', pickLine('wing', ['THIS ONE. i have chosen it and i will not be explaining why.']), 5000);
  }

  function onBless(): void {
    if (!angelNow.glowing || blessRef.current !== null) return;
    // The fattest pot that can still crackle, skipping the rat's fryer — he
    // eats blessings too (cooking.ts), so she never wastes one on him.
    //
    // "CAN STILL CRACKLE" IS THE CEILING, NOT GOLDEN. This read `isGolden(c)`,
    // which was the same number until The Long Fry shipped; after it, she
    // refused to bless the one chip in the rack with a x64 still ahead of it
    // and spent the blessing on a shallower pot instead. Same golden-vs-
    // ceiling confusion as the Sous Chef's (lib/souschef.ts), found by
    // following it — a forced crackle at the ceiling would be wasted, one
    // below it never is.
    let best = -1;
    let bestPot = -1;
    chips.forEach((c, i) => {
      if (c.crackles >= ceiling) return;
      if (ratRef.current.latched === i) return;
      if (c.pot > bestPot) { bestPot = c.pot; best = i; }
    });
    if (best < 0) {
      // Nothing blessable (the rat on the only fryer, or everything already
      // golden). The glow keeps — but SAY SO: the review clicked a glowing
      // angel four times and concluded she was broken, because this branch
      // was silent.
      say('angel', 'nothing here is ready to be witnessed. cook on, child.', 6000);
      return;
    }
    blessRef.current = best;
    // The mark on the blessed fryer — the crackle lands within one tick, and
    // this is what ties it to HER (review: a x4 crackle eventually happened
    // and "nothing on screen connected it to her").
    setBlessFx({ index: best, at: Date.now() });
    window.setTimeout(() => setBlessFx((b) => (b && Date.now() - b.at >= 5800 ? null : b)), 6000);
    setAngel(spendBlessing);
    sfx.golden();
    say('angel', 'you have been witnessed.', 5000);
  }

  /**
   * Tapping a critter OPENS THEIR STALL (operator: "clicking the critters
   * should open each of their respective upgrades — a slick combo for the
   * ux and readability"). Two things still outrank the stall, because both
   * are time-sensitive and the critter is their only control: a glowing
   * angel spends her blessing, and an armed vendor cancels.
   */
  function onCritterClick(id: string): void {
    if (feeding && feeding.vendor.id === id) { setFeeding(null); setBubble(null); return; }
    if (id === 'angel' && angelNow.glowing) { onBless(); return; }
    // SCOOP IS A DOOR LIKE EVERY OTHER CRITTER. He was the one who wasn't:
    // his shop could be reached ONLY from the `.scoop-call` banner, which is
    // why that banner had to stay up for the rest of the game once you had
    // bought anything — removing it would have sealed the shop. So it sat
    // there forever advertising an offer that was already spent (operator,
    // 2026-08-04: "scoop's shop offer never goes away even after I have spent
    // my one point on him"). With the dog himself as the entrance, the banner
    // is free to be what it looks like: a call you can answer and be done with.
    // SCOOP SHOPS FIRST. Opening the char shop unconditionally made his STALL
    // unreachable — and he sells season1/bowl1/airtight/fryer2, i.e. exactly
    // the four jars you must re-buy after a tip. Operator: "i cant buy scoops
    // upgrades after a tip becauase he only shows the new shop." Same mistake
    // the hermit's gamble made and the same fix as its note below: a tap on a
    // critter shops, and the other thing gets its own entrance (the
    // `.scoop-call` banner, which only appears when char can actually buy
    // something — see `scoopHasDeal`). The char shop is still one tap away
    // once he has no jars left for you.
    if (id === 'scoop' && state && openJarsOf('scoop', state.owned, crewDip, state.declined, pendingBuyKeys).length === 0) {
      setScoopOpen(true); sfx.pop(); return;
    }
    // A committee with the floor open wants lobbying, not shopping.
    if (id === 'committee' && vote.phase === 'open' && !vote.lobbied) {
      setVote(lobby);
      sfx.pop();
      // Was "the guacamole layer was persuaded. nobody asks how." — a claim
      // of VICTORY, fired on the click, while the banner beside it announced
      // defeat and the actual result was still 25 seconds away. It now says
      // what lobbying really buys (one layer, not the room) and names the
      // reason it can still fail, so a lost vote is not a surprise.
      say('committee', 'guacamole is persuaded. nobody asks how. the olives are another matter.', 6000);
      return;
    }
    setSheetId(id);
  }

  /* The hermit's gamble. It used to HIJACK the tap on the critter, so while he
     was offering there was no way to reach his stall at all — survivable when
     he sold one seasoning jar, a hard wall now that he holds Bigger Bowl III
     (the only bowl on sale at Buffalo). It gets its own button, the same shape
     as the committee's "lobby them"; tapping the hermit always shops. */
  function onHermitTake(): void {
    if (hermitRef.current.phase !== 'offering') return;
    const m = CREW.find((c) => c.id === 'hermit');
    if (!m) return;
    setFeeding({ vendor: m, jarKey: HERMIT_TRADE });
    say('hermit', pickLine('hermit', m.lines), 9000);
  }

  // Idle chatter: every ~26s somebody says their line — unless a vendor is
  // armed, in which case the bubble is theirs.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (feedingRef.current || bowlOpenRef.current) return;
      const crew = crewFor(dipIndexRef.current);
      if (crew.length === 0) return;
      const m = crew[Math.floor(Math.random() * crew.length)];
      // Once the floor has been struck, whoever has an opinion about it
      // sometimes says that instead — the twist keeps living in the room.
      const bowlLine = struckRef.current ? BOWL_LINES[m.id] : undefined;
      if (bowlLine && Math.random() < 0.35) { say(m.id, bowlLine, 8000); return; }
      if (m.lines.length === 0) return;
      say(m.id, pickLine(m.id, m.lines));
    }, 26_000);
    return () => window.clearInterval(t);
  }, [say, pickLine]);

  // Escape backs out of feed mode and closes an open stall sheet.
  useEffect(() => {
    if (!feeding && sheetId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSheetId(null);
      setFeeding(null);
      setBubble(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feeding, sheetId]);

  /* ── the Sous Chef: bought automation, never default, now switchable ──── */
  // Owning 'autodip' cashes a finished chip for you. He used to fire on
  // `isGolden` — five crackles — on the rationale that "a golden chip's multi
  // can no longer grow, so cashing it is pure upside". That was true until
  // The Long Fry raised the ceiling to six, at which point he was cashing out
  // at x32 immediately before the x64 the player had paid 1.2B for could
  // land: a 2M automation quietly vetoing the deepest jar in the game
  // (operator: "sous chef is probably just taking them from me").
  //
  // FIXED AT THE SOURCE (operator: "did you increase their limit to 6 to
  // auto-cull it when it is unlocked? we should do that"). He now cashes at
  // the player's CEILING (`sousTakes`, lib/souschef.ts) rather than at
  // golden, so buying The Long Fry moves him up with it instead of leaving
  // two jars fighting. The off switch stays — it is now a preference about
  // automation, not a workaround for a rule that was wrong.
  //
  // The stand-down rules that concern the whole screen rather than one chip
  // stay here, out of the pure predicate: he pauses entirely while a vendor
  // is armed (the angel may be waiting for exactly the chip he would take)
  // and REFUSES to touch a fryer with a rat on it — house rule.
  useEffect(() => {
    if (!sousOn) return;
    if (!state?.owned.has('autodip') || !host || !me || !tableId || feeding) return;
    for (let i = 0; i < chips.length; i++) {
      if (ratRef.current.latched === i) continue;
      if (sousTakes(chips[i], ceiling)) onDip(i);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chips, state, host, me, tableId, feeding, sousOn, ceiling]);

  // The flame puts itself out when the chip tops out — nothing left to hurry,
  // and a lit fryer at the ceiling is burning the pot for nothing. With The
  // Long Fry that ceiling is one crackle PAST golden, which is exactly the
  // stretch the burner is for.
  useEffect(() => {
    setOvercookAt((lit) => overcookOff(lit, chips, ceiling));
  }, [chips, ceiling]);

  /* ── the bottom of the bowl ───────────────────────────────────────────── */
  /**
   * The reveal fires ONCE per run, the first time it is deep enough to tip,
   * and is LATCHED IN STORAGE rather than derived live — the same lesson the
   * tutorial learned the hard way: a derived condition re-fires on every
   * reload and turns the game's one twist into a nag. A tip resets the latch
   * so the next run gets its own reveal.
   */
  bowlOpenRef.current = bowlOpen;
  const tipSalt = state ? saltFor(state.lifetimeChips) : 0;
  /**
   * The offer is the ONE thing in this app that does not run on the optimistic
   * fold — see lib/bowlGate.ts for why a revocable credit must not be allowed
   * to spend the reveal's single showing. Recomputed only when the chain moves
   * (`confirmedTick`, bumped in `refresh`), not on every dip: it folds the
   * confirmed set a second time and there is no reason to pay that per click.
   */
  const chainReady = useMemo(() => {
    if (!tableId || !me) return false;
    const { replies, verified } = confirmedRef.current;
    const header: ChipsHeader = { v: 1, kind: 'chips-table', name: cookName, owner: me.publicKeyHex };
    // `queue` is passed and deliberately unused (bowlGate.ts) — it is NOT a
    // dependency for the same reason: nothing here reads it.
    return bowlReady(header, tableId, replies, verified, queue, me.publicKeyHex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedTick, tableId, me, cookName]);
  const struck = bowlOfferVisible(chainReady, tipSalt);
  useEffect(() => {
    if (!struck || struckRef.current || !tableId) return;
    struckRef.current = true;
    const key = `chips.bowl.v1:${tableId}:${state?.tips ?? 0}`;
    let seen = false;
    try { seen = localStorage.getItem(key) === 'seen'; } catch { /* private mode */ }
    if (seen) return;
    try { localStorage.setItem(key, 'seen'); } catch { /* private mode */ }
    setBowlOpen(true);
    sfx.breakthrough();
  }, [struck, tableId, state?.tips]);

  /** Tip the bowl. The salt is the FOLD's to compute — the body carries no
   *  amount at all (chipsEngine.parseMove) — so this only has to ask. */
  function onTip(keep?: string): void {
    if (!host || !me || !tableId || !state || tipSalt <= 0) return;
    setBowlOpen(false);
    struckRef.current = false;
    // What the fryers still held. Captured BEFORE `resetAll` empties them, so
    // the ceremony can name it — see TipCeremony.
    const taken = chips.reduce((sum, c) => sum + worthOf(c), 0);
    setTipFanfare({ salt: tipSalt, total: state.oldSalt + tipSalt, taken });
    sfx.breakthrough();
    // THE RACK EMPTIES WITH THE BOWL. Without this the resize effect in
    // useCooking carries chip 0 across the tip — old pot, old multiplier —
    // into a bowl whose cap has just reset to 1,000,000, so the first dip of
    // every run was silently clamped. Scoop takes it instead, which is a
    // thing the player can SEE, and which the descent already turns out to
    // be about: one more chip is what empties a bowl.
    resetAll();
    // The stored rack goes over with the bowl; leaving it would restore
    // pots scoop has already taken on the next load.
    clearRack(window.localStorage);
    window.setTimeout(() => setTipFanfare(null), 6200);
    // AFTER the hush, and FIRST in the queue. These fired at 1200ms — while
    // the ceremony still had the crew row at opacity 0 — and the welcome-back
    // then replaced the bubble at 6400ms, because there is one bubble
    // app-wide. The thanks was never seen by anybody.
    window.setTimeout(() => say('scoop', 'see you at the bottom.', 8000), 6400);
    window.setTimeout(() => say('scoop', WELCOME_BACK[3], 9000), 15_000);
    setQueue((q) => enqueue(
      q, {
        tableId, author: me.publicKeyHex, kind: 'tip',
        // THE CRACK: one jar rides through the bowl. Sent only when the
        // ability is owned AND the jar actually is — the fold checks both
        // again, but a button should never send something it knows is void.
        ...(keep && state?.charOwned.has('crack') && state.owned.has(keep) ? { keep } : {}),
        ms: allocMs(),
      },
      nextId.current++
    ));
  }

  /* ── the hermit settles up ────────────────────────────────────────────── */
  // `phase` flips to 'returned'/'ate' on a cook tick; this effect turns that
  // into crumbs (through the ordinary dip verb) and a line, exactly once per
  // trade — keyed on the phase transition, not on a live condition.
  const hermitPhaseRef = useRef(hermit.phase);
  useEffect(() => {
    const was = hermitPhaseRef.current;
    hermitPhaseRef.current = hermit.phase;
    if (was === hermit.phase) return;
    if (hermit.phase === 'ate') {
      sfx.pop();
      say('hermit', 'there was no chip. there was never a chip. you have no proof.', 8000);
      return;
    }
    if (hermit.phase !== 'returned' || hermit.payout <= 0) return;
    if (!host || !me || !tableId) return;
    say('hermit', 'here. heavier than you left it. don’t ask what it ate down there.', 8000);
    const ms = allocMs();
    const counter = document.querySelector('.tunnel-crumbs') ?? document.querySelector('.tunnel-wrap');
    if (counter) {
      const r = counter.getBoundingClientRect();
      setGains((g) => [...g, {
        key: ms, text: `+${compact(hermit.payout)} back from the celery`,
        golden: true, doubled: false, empty: false,
        x: r.left + r.width / 2, y: r.top + r.height / 2,
        dx: ((ms % 7) - 3) * 9, delay: 0.15,
      }]);
      window.setTimeout(() => setGains((g) => g.filter((f) => f.key !== ms)), 2600);
      sfx.gain(true, 0.15);
    }
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'dip', amount: hermit.payout, ms },
      nextId.current++
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hermit.phase, hermit.payout]);

  /* ── the dip ladder ceremony ──────────────────────────────────────────── */
  const lastDip = useRef<number | null>(null);
  const [dipFanfare, setDipFanfare] = useState<number | null>(null);
  useEffect(() => {
    if (!state) return;
    if (lastDip.current === null) { lastDip.current = state.dipIndex; return; }
    if (state.dipIndex > lastDip.current) {
      lastDip.current = state.dipIndex;
      setDipFanfare(state.dipIndex);
      sfx.breakthrough();
      // The recruits don't just appear — one of them SAYS HELLO as the flood
      // clears, so the "joins your crew" line has a body attached (review:
      // avo and limewedge were "simply present afterward").
      const joined = recruitsAt(state.dipIndex);
      const hello = joined.length > 0
        ? window.setTimeout(() => say(joined[0].id, pickLine(joined[0].id, joined[0].lines), 8000), 5400)
        : null;
      const t = setTimeout(() => setDipFanfare(null), 5200);
      return () => { clearTimeout(t); if (hello !== null) window.clearTimeout(hello); };
    }
    lastDip.current = state.dipIndex;
  }, [state]);

  /* ── what did I just get ─────────────────────────────────────────────── */
  /**
   * `null` means "no fold seen yet for this table" — the seed-and-say-nothing
   * state, distinct from `new Set()` (a fold WAS seen and it banked nothing).
   * `announcedRef` is a plain Set so its size is unbounded across a very long
   * session, but its entries are just numbers (chip `ms` values); the memory
   * cost of even tens of thousands of them is trivial next to a page that
   * already carries a `moves` array of the same order of magnitude.
   */
  const announcedRef = useRef<Set<number> | null>(null);
  const prevStateRef = useRef<ChipsState | null>(null);

  // A different table (a fresh identity via `openShop`, or simply the very
  // first table this browser has ever seen) must reseed from scratch — an
  // announced-ms set from a DIFFERENT owner's fold means nothing here, and a
  // stale `prevStateRef` would make the very next bank's `beforeCrumbs`
  // baseline come from the wrong player's bowl.
  useEffect(() => {
    announcedRef.current = null;
    prevStateRef.current = null;
  }, [tableId]);

  /* THE COUNTER COLUMN STOPS SHORT OF WHATEVER IS ACTUALLY DOCKED.
     It used to stop short of the number 240, which is not a description of
     anything: the phone's bottom stack is a boards pill, a bench sized by a
     viewport clamp, a chat strip as tall as the line somebody wrote, and a
     tutorial banner that comes and goes. 240 was right by luck at some line
     lengths and wrong at others — which is how the crumbs readout and the
     bottom-of-the-bowl ticket, both CARDS IN THAT COLUMN rather than overlays,
     ended up underneath the chatter with no way to get out from under it.
     Measured here, published as `--dock-h`, consumed by `.counter`; the CSS
     keeps 240px purely as the before-first-measurement fallback.
     `lib/dock.ts` holds the rules and the trap they exist for. */
  useEffect(() => {
    let raf = 0;
    const publish = () => {
      raf = 0;
      const h = measureDock(document, window.innerHeight);
      const root = document.documentElement;
      // Clearing rather than writing 0: an unset var lets the CSS fallback
      // take over, which is the correct behaviour when nothing is docked.
      if (h === null) root.style.removeProperty('--dock-h');
      else root.style.setProperty('--dock-h', `${h}px`);

      // EACH RUNG SITS ON THE ONE BELOW IT, at the height it really is. See
      // measureStack — the constant these replace was 49px against a bench
      // that measures 91px, which is why the chat strip sat on the critters
      // and the banners sat on the strip.
      const stack = measureStack(document);
      if (stack.bench > 0) root.style.setProperty('--bench-real', `${stack.bench}px`);
      else root.style.removeProperty('--bench-real');
      root.style.setProperty('--toast-real', `${stack.toast}px`);
    };
    const schedule = () => { if (raf === 0) raf = requestAnimationFrame(publish); };

    publish();
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    // The dock's contents mount and unmount with the game's own state (a line
    // of chatter, a banner) and RESIZE without remounting (a longer line
    // wrapping to a third row), so both kinds of change have to be watched.
    const ro = new ResizeObserver(schedule);
    const mo = new MutationObserver(() => {
      ro.disconnect();
      for (const sel of DOCKED_SELECTORS) {
        for (const el of Array.from(document.querySelectorAll(sel))) ro.observe(el);
      }
      schedule();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    for (const sel of DOCKED_SELECTORS) {
      for (const el of Array.from(document.querySelectorAll(sel))) ro.observe(el);
    }

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      ro.disconnect();
      mo.disconnect();
      document.documentElement.style.removeProperty('--dock-h');
      document.documentElement.style.removeProperty('--bench-real');
      document.documentElement.style.removeProperty('--toast-real');
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    if (announcedRef.current === null) {
      // First fold this component has seen for this table: seed silently.
      // Every bank this player ever made is already in `state.moves` the very
      // first time a table loads — announcing all of history on page load
      // would be exactly the wrong kind of surprise.
      announcedRef.current = new Set(
        state.moves.filter((m) => m.outcome === 'banked').map((m) => m.ms)
      );
      prevStateRef.current = state;
      return;
    }

    // Keyed on the chip's own `ms` — never on array position or length, since
    // a queued chip is folded once as a synthetic pending reply and again,
    // later, as the confirmed reply that replaces it (see
    // chipsPayoutDisplay.ts's `newBankedMoves` for why `ms` is the one field
    // that is identical across that transition).
    const fresh = newBankedMoves(state.moves, announcedRef.current);
    if (fresh.length > 0) {
      for (const m of fresh) announcedRef.current.add(m.ms);

      // The bowl's level immediately before THIS batch, decay-projected the
      // exact same way the bowl itself is rendered (`projectedCrumbs`) — never
      // a diff of the displayed number, which decays and hour-quantises and
      // would read that noise as part of the gain.
      const before = prevStateRef.current ? projectedCrumbs(prevStateRef.current, nowMsRef.current) : 0;
      // Replays the fold's own bowl-cap clamp over the fold's own recorded
      // payouts — so a full bowl is credited as gaining 0, never the notional
      // payout a full bowl would clip (see actualGains's doc).
      const events = actualGains(before, state.bowlCap, fresh);

      // Same destination the crumb burst already flies to — falls back to the
      // tunnel itself exactly like `launchDip` does, for the same reason:
      // while any proof is still being verified, Tunnel.tsx renders "still
      // counting" instead of the `.tunnel-crumbs` paragraph.
      const counter = document.querySelector('.tunnel-crumbs') ?? document.querySelector('.tunnel-wrap');
      if (counter) {
        const r = counter.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const born: GainFloat[] = events.map((e, i) => ({
          key: e.ms,
          text: e.gained > 0 ? `+${compact(e.gained)}${e.doubleDip ? ' x2' : ''}` : '+0',
          golden: e.bits >= state.goldenBits,
          doubled: e.doubleDip,
          empty: e.gained <= 0,
          x, y,
          // A small deterministic spread (never random — see the app's other
          // seeded scatters) so two chips landing within the same breath don't
          // print on top of each other and become illegible.
          dx: ((e.ms % 7) - 3) * 9,
          // `GainFloats` sets this INLINE (`style={{ animationDelay: ... }}`)
          // so it can stagger a batch — but an inline style always wins over
          // the stylesheet, full stop, which means it must carry the base
          // `.95s` sync-with-crumb-land delay itself or a single-chip bank
          // (the overwhelmingly common case, `i === 0`) gets `animationDelay:
          // "0s"` and the figure pops up instantly instead of landing with
          // the crumb burst. Caught live: without the `+ 0.95`, the floater
          // appeared within ~150ms of the click instead of at ~1s. Keep this
          // in sync with `.gain-float`'s own `animation-delay: .95s` in
          // styles.css, which exists as the documented default and is never
          // actually read once this inline value is present.
          delay: 0.95 + i * 0.12,
        }));
        setGains((g) => [...g, ...born]);
        // The chime lands WITH each figure, sharing its stagger. An empty
        // "+0" gets no chime — a full bowl earning nothing should not ring.
        events.forEach((e, i) => {
          if (e.gained > 0) sfx.gain(e.bits >= state.goldenBits, 0.95 + i * 0.12);
          window.setTimeout(() => setGains((g) => g.filter((f) => f.key !== e.ms)), 2300 + i * 120);
        });
      }
    }
    prevStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Boards fold AFTER this player's own table does — see useBoards(`foldReady`).
  // `state` is null until the player's own fold completes, which is exactly the
  // window where six foreign Argon2id folds used to get in front of them.
  const { rows, hosting, hosted } = useBoards(host, state !== null);
  const seatLine = useFlavour(SEAT_LINES, Boolean(me) && !seated);
  const tableLine = useFlavour(TABLE_LINES, seated && !tableId);

  /* ── screens ──────────────────────────────────────────────────────────── */

  function openShop() {
    const name = nameDraft.trim().slice(0, 80).replace(/[\r\n]/g, ' ') || defaultName();
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
    setCookName(name);
    // This screen is only reachable with NO usable identity in this browser
    // (`!hasIdentity`, checked at the call site below) — so any queue entry
    // already sitting in storage belongs to an identity we're about to
    // overwrite and can never sign for again. The provenance filter
    // (`activeFor`) already makes such an entry permanently inert either way
    // (its `author` can never match this brand-new identity), so this is a
    // deliberate cleanup, not a correctness fix: clear it here, at the one
    // moment this browser is unambiguously moving on, rather than let it sit
    // in storage forever as dead weight.
    clearQueue();
    setQueue([]);
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    const kp = Keypair.fromSeed(seed);
    try { saveIdentity(createNewIdentity(kp, name)); } finally { kp.free(); }
  }

  if (configError) {
    return (
      <Doorway dipIndex={0} title="the shop is not wired up">
        <p className="lede">{configError}</p>
        <p className="fine">This build was made without an endpoint or a space. Nothing to fry.</p>
      </Doorway>
    );
  }

  // `hasIdentity && !me` is a RETURNING player whose keypair has not finished
  // being rebuilt from the stored seed yet (the WASM Keypair is created in an
  // effect, so it is null for at least one render, and longer if WASM is still
  // loading). Falling through to the apron screen there would offer an existing
  // player a "tie on the apron" button that MINTS A SECOND IDENTITY — orphaning
  // their table, their crumbs and their whole lifetime crunch, irreversibly,
  // for one impatient click. Wait instead.
  if (isLoading || (hasIdentity && !me) || (!rpc && connecting)) {
    return <Doorway dipIndex={0} title="Dippin' Chips"><p className="lede">the lights are coming on…</p></Doorway>;
  }

  // The apron gate ("tie on the apron" → creates a localStorage keypair) is a
  // BROWSER-ONLY path — `openShop()` calls `saveIdentity()`, which
  // useGameIdentity makes a no-op outside browser mode, so showing this gate
  // while embedded would be a dead button that also never lets the node
  // identity's real name through. Gate it on mode, not just hasIdentity/me.
  if (mode === 'browser' && (!hasIdentity || !me)) {
    return (
      <Doorway dipIndex={0} title="Dippin' Chips">
        <p className="lede">
          Cook a chip and watch its pot climb. When it crackles, everything doubles —
          hold your nerve or dip it and cash out. Nobody runs this shop — it lives on the network.
        </p>
        <label className="apron-name">
          <span>what should the board call you?</span>
          <input
            value={nameDraft}
            maxLength={80}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') openShop(); }}
            aria-label="your name on the board"
          />
        </label>
        <button className="big" onClick={openShop}>tie on the apron</button>
        {/* Honest about BOTH halves. The key really does stay in this browser —
            but the same click also claims a seat and chalks this name up on a
            table anyone on the network can read, and posts do not come back
            down. Saying only the local half would be describing half the
            button. */}
        <p className="fine">
          Makes a key that lives only in this browser — no account, no email.
          It then chalks that name onto a table on the public network, where it stays.
        </p>
        {/* BEFORE the key exists is the cheapest moment to catch the in-app
            trap: nothing to carry yet, so a plain link out is a clean start.
            (After the key exists, the carry pill below handles it.) */}
        {inAppBrowser && (
          <p className="fine carry-warn">
            heads up — this is an app&apos;s built-in browser, and a kitchen made here
            stays stuck in here.{' '}
            <a href={window.location.href} target="_blank" rel="noopener noreferrer">
              open in your real browser first
            </a>.
          </p>
        )}
      </Doorway>
    );
  }

  // Embedded (node/pending mode) but past isLoading with no usable identity:
  // the node's get_identity_info fetch ran out of retries (or the node has no
  // identity loaded). Not the loading window, not browser mode — so neither
  // gate above fires. Say so plainly rather than falling through to the
  // browser-key apron gate or the shop itself with no identity.
  if (mode !== 'browser' && (!hasIdentity || !me)) {
    return (
      <Doorway dipIndex={0} title="Dippin' Chips">
        <p className="lede">Couldn't reach your node identity — retrying…</p>
        <p className="fine">Make sure the app is connected to your node, then reopen the shop.</p>
      </Doorway>
    );
  }

  if (rpcError && !state) {
    return (
      <Doorway dipIndex={0} title="the line is down">
        <p className="lede">{rpcError}</p>
        <p className="fine">The shop is here; this browser just cannot reach the network.</p>
      </Doorway>
    );
  }

  if (fatal && !tableId) {
    return (
      <Doorway dipIndex={0} title="they would not let you in">
        <p className="lede">{fatal}</p>
        <button className="big" onClick={() => { setFatal(null); onboardRef.current = false; setSeated(false); }}>
          knock again
        </button>
      </Doorway>
    );
  }

  if (!seated) {
    return <Doorway dipIndex={0} title="Dippin' Chips"><p className="lede">{seatLine}</p><Spinner /></Doorway>;
  }
  if (!tableId) {
    return <Doorway dipIndex={0} title="Dippin' Chips"><p className="lede">{tableLine}</p><Spinner /></Doorway>;
  }

  // The critter whose stall sheet is open, if any.
  const sheetVendor = sheetId !== null ? CREW.find((c) => c.id === sheetId) ?? null : null;

  const dipIndex = state?.dipIndex ?? 0;
  const tier = DIP_TIERS[Math.min(DIP_TIERS.length - 1, dipIndex)];

  /** WHERE YOU ARE STANDING, named the way the shaft behind you names it.
   *
   *  The header read `tier.label`, i.e. `DIP_TIERS[dipIndex]` — and `dipIndex`
   *  stops at the last tier. So the moment you reach The Abyssal Dip that
   *  readout freezes forever, while `tunnelDepth` keeps walking you down the
   *  same shaft: past the dip tiers the ordinals continue into The Porcelain,
   *  The Table, The Floor, The Dirt, The Lava, and `broken` pins you to the
   *  face of the band you are about to fight. The background has been drawing
   *  that correctly the whole time.
   *
   *  So the strata said one thing and the header said another, which is a
   *  confusing thing to do to somebody who has just beaten a boss (operator:
   *  "it does show me tableloor\dirt in the background so like I SEE that
   *  but then I also see 'abyssal dip' and I'm like huh confused").
   *
   *  `bandAt` is the same function the bed uses, and it covers the whole
   *  ladder — dip tiers early, descent bands later — so there is now one
   *  answer to "which layer am I in" instead of two. */
  const standing = state
    ? bandAt(tunnelDepth(state.dipIndex, state.lifetimeChips, state.broken).layer)
    : null;
  const crumbsNow = state ? projectedCrumbs(state, nowMs) : 0;
  const unverified = (state?.unverifiedBanks ?? 0) > 0;
  const stillCounting = counting !== null || unverified || !state;
  // Same predicate, same numbers `onBuy`'s guard uses (see chipsAfford.ts) —
  // this is what keeps a lit jar and a click from ever disagreeing. In
  // practice this is 0 on every render that follows a completed fold; it is
  // only ever nonzero for the same-tick race `onBuy`'s own comment describes,
  // which this component never observes mid-batch either way.
  const pendingCommitted = tableId && me
    ? pendingBuyCost(activeFor(queue, tableId, me.publicKeyHex).filter(isBuyMove), foldedIdsRef.current, (k) => UPGRADES[k]?.cost)
    : 0;

  /** Jars with a buy ALREADY QUEUED and not yet folded.
   *
   *  A jar you have just paid for does not enter `owned` until the chain
   *  confirms it, and on the operator's phone that took a median of 14s and up
   *  to 44s (report 23b527be-41723). For that whole window the game looks
   *  exactly as it did before you bought — so you arm the vendor and feed it a
   *  second chip. `onFeed` ate that chip, then `onBuy`'s duplicate guard
   *  dropped the buy with `return q` and said nothing: the chip was gone and
   *  nothing came back. Operator, 2026-08-04: "I am buying upgrades but it
   *  keeps not giving me them - but it takes my chip."
   *
   *  Checked BEFORE the chip is eaten, in the two places that eat one. */
  const queuedBuyKeys = tableId && me
    ? queuedBuyKeysOf(activeFor(queue, tableId, me.publicKeyHex))
    : new Set<string>();

  /** EVERY JAR ALREADY ON ITS WAY — queued, or submitted and not yet folded.
   *  The union `onBuy` and `onFeed` have always guarded with; the SHELF did not
   *  know it, so the shop offered jars every one of those gates would refuse.
   *  Operator: "ok so just dont show me the option to buy it?" */
  const pendingBuyKeys = new Set<string>([
    ...queuedBuyKeys, ...boughtPendingRef.current.keys(),
  ]);

  /** Critters with at least one jar you can afford this instant. The shop
   *  has no other entrance now, so this badge is the ONLY thing telling a
   *  player their crumbs will buy something.
   *
   *  DELIBERATELY NOT a useMemo: this sits below the component's early
   *  `return <Doorway/>` paths, and a hook after a conditional return
   *  changes the hook COUNT between renders — React throws "rendered more
   *  hooks than during the previous render" and the whole app goes black
   *  (it did, exactly here). It is a loop over ~11 crew members; the memo
   *  was never worth a hook. */
  /** Scoop is only calling you over if he has something you can actually take.
   *
   *  The banner used to stand on `char > 0`, which is not the same question.
   *  The operator finished the table with 2 grains, already owning The Crack
   *  (1), against a cheapest remaining ability of 3 — so the banner sat there
   *  saying "he is looking at your 2 grains" and offering a shop with nothing
   *  buyable in it, with no way to dismiss it because it is a banner and there
   *  is nothing to dismiss. "he wants me to buy something, I have 2 grains, I
   *  can buy nothing - he doesn't close his popup asking me to buy something."
   *
   *  This is the same rule `dealIds` applies to every other critter: a price
   *  tag appears when you can pay it. Scoop was the one shouting on credit. */
  const scoopHasDeal = state !== null
    && Object.values(CHAR_ABILITIES).some((a) => !state.charOwned.has(a.key) && state.char >= a.cost);

  const dealIds = ((): Set<string> => {
    const out = new Set<string>();
    if (!state) return out;
    for (const m of crewFor(crewDip)) {
      if (openJarsOf(m.id, state.owned, crewDip, state.declined, pendingBuyKeys).some((u) => canAffordBuy(crumbsNow, pendingCommitted, u.cost))) {
        out.add(m.id);
      }
    }
    return out;
  })();


  return (
    <div className={`shop${bowlOpen || tipFanfare ? ' hushed' : ''}`} data-dip={tier.key}>
      <TunnelBed state={state} />

      <header className="hood">
        <div className="hood-plate">
          <span className="shop-name">DIPPIN&apos; CHIPS</span>
          <span className="cook">{cookName}</span>
        </div>
        <div className="hood-dip">
          <span className="in-the-bowl">the layer you&apos;re in</span>
          <strong>{standing?.label ?? tier.label}</strong>
        </div>
        <div className="hood-crunch">
          <span className="in-the-bowl">lifetime dipped</span>
          {/* Gated on the SAME condition as the bowl. The fold skips banks it
              has no verification for (chipsEngine.ts's `rejected-unverified`),
              so while chips are still being counted this figure is understated
              by exactly as much as `crumbs` is. The bowl says so; showing a
              confident number next to it would just make the bowl look wrong. */}
          <strong>{state && !stillCounting ? compact(state.lifetimeChips * 1000) : '—'}</strong>
        </div>
        {(state?.oldSalt ?? 0) > 0 && (
          <div className="hood-salt" title="salt that has been through a bowl. it does not dissolve and it does not forget.">
            <span className="in-the-bowl">old salt</span>
            <strong>{compact(state!.oldSalt)}</strong>
            <em>+{Math.round((saltBonus - 1) * 100)}% every tick</em>
          </div>
        )}
        {/* CHAR — WHAT THE DESCENT PAYS. The fold has minted this since the
            descent shipped and NOTHING rendered it: a player beat the porcelain,
            earned a grain, and had no way to learn it existed. Operator: "if I
            got a char I didn't know it and it's not shown." A currency the game
            does not show is a currency the game did not give you. */}
        {(state?.char ?? 0) > 0 && (
          <div className="hood-char" title="char. scraped off the bottom of a bowl you broke. it buys rule changes, not numbers.">
            <span className="in-the-bowl">char</span>
            <strong>{state!.char}</strong>
            <em>{state!.char === 1 ? 'one grain' : `${state!.char} grains`}</em>
          </div>
        )}
        <button
          type="button"
          className="report-toggle"
          title="copy a debug report of everything the client knows"
          aria-label="copy a debug report"
          onClick={onReport}
        >
          <span aria-hidden="true">⚑</span>
        </button>
        <button
          type="button"
          className="sound-toggle"
          aria-pressed={soundOn}
          title={soundOn ? 'mute the shop' : 'unmute the shop'}
          onClick={() => {
            const next = !soundOn;
            // The click IS a gesture — the one moment unlock always succeeds.
            sfx.unlock();
            sfx.setMuted(!next);
            setSoundOn(next);
          }}
        >
          {soundOn ? '♪ on' : '♪ off'}
        </button>
      </header>


      <DipTicker dipIndex={crewDip} />

      <main className="stage">
        <Kitchen
          polishOf={state?.charOwned.has('grain') ? (i) => polishLook(polish, i) : undefined}
          chips={chips} onDip={onDip} crackles={crackleAt} ticks={tickAt}
          capRoom={state ? Math.max(0, state.bowlCap - crumbsNow) : Number.MAX_SAFE_INTEGER}
          ratAt={ratNow.latched}
          ratPerch={ratNow.latched !== null ? { gorge: gorgeOf(ratNow), hoard: ratNow.hoard, chompKey: ratChomp } : null}
          onShoo={onShoo}
          feedMode={feeding ? feeding.vendor.feed : null}
          blessAt={blessFx}
          wingIndex={wingNow.at}
          wingSince={wingNow.since}
          oracleIndex={oracleNow.at}
          overcookAt={overcookAt}
          onOvercook={state?.owned.has('overcook') ? onOvercook : null}
          ceiling={ceiling}
          onWingCall={state?.owned.has('wingcall') ? onWingCall : null}
          wingCoolS={Math.max(0, Math.ceil((wingNow.readyAt - nowMs) / 1000))}
          wingNope={wingNope}
          /* THE CRUMB READOUT MOVED UNDER THE RACK. It was the first card in
             the counter column, which on a phone stacks into the bottom of the
             screen alongside the crew bench and their chatter — so the one
             number the whole game is about kept getting sat on by a toast.
             Under the fryers it is both out of that stack entirely and in the
             room THE PLATE vacated (Kitchen.tsx). The dip-flight animations
             find it by `document.querySelector('.tunnel-crumbs')`, so the
             crumbs still fly to wherever the counter actually is. */
          readout={state && (
            <TunnelRead state={state} nowMs={nowMs} counting={stillCounting} countProgress={counting} />
          )}
        />

        <aside className="counter">
          {/* The standing offer sits ON THE COUNTER, in the column's flow,
              directly under the readout — not floated over it. It was a
              `position: fixed` overlay with hand-tuned offsets, which put it
              on top of the depth/crumbs panel it was supposed to sit beside
              (measured live: ticket 103-144px over a counter starting at
              120px, and clipping the ticker above). The third hand-tuned
              bottom-stack offset in two days (#155, #156) was the tell: a
              column child cannot collide with its own column. */}
          {state && struck && !bowlOpen && tipFanfare === null && (
            <BowlTicket salt={tipSalt} onOpen={() => setBowlOpen(true)} />
          )}
          {/* NO SHELF COLUMN. Operator 2026-07-27: "just remove the upgrade
              button / bowls sections in the main view and only use the
              popups from tapping the critters." The crew ARE the shop now —
              a critter with something you can afford wears a price tag
              (Crew.tsx `hasDeal`), and tapping them opens their stall. This
              is what finally un-crowds the room, and it retires the column
              that caused the cramping, the hidden-tier scrolling and the
              "bowls of salsa" misread in one move. */}
        </aside>
      </main>

      {/* The pile on the dig floor — fixed at the bed's own 76vh floor line,
          outside the stage's flow entirely (the flight measures it). */}
      {state && <DigFront state={state} nowMs={nowMs} counting={stillCounting} />}

      {/* The crew, loitering on that same floor. The rat leaves the row while
          he is up on a fryer (Kitchen renders him there). */}
      {state && (
        <CrewRow
          crew={crewFor(crewDip)} bubble={bubble} dealIds={dealIds}
          feedingId={feeding?.vendor.id ?? null}
          angel={angel} ratAway={rat.latched !== null}
          onCritterClick={onCritterClick}
        />
      )}
      {state && bowlOpen && (
        <BowlReveal
          salt={tipSalt}
          layerLabel={tier.label}
          jarCount={state.owned.size}
          depth={DIP_TIERS[Math.min(DIP_TIERS.length - 1, state.dipIndex)].label}
          keepable={
            // THE CRACK: what this bowl could carry through. Empty without the
            // ability, which is how the picker stays invisible until earned.
            state?.charOwned.has('crack')
              ? [...state.owned].map((k) => UPGRADES[k]).filter(Boolean)
                  .map((u) => ({ key: u.key, label: u.label }))
              : []
          }
          onTip={onTip}
          onClose={() => setBowlOpen(false)}
        />
      )}
      {porcOpen && (
        <PorcelainFight
          ready={porcReady.ready}
          bar={porcReady.bar}
          best={porcReady.best}
          broken={porcBroke}
          onDip={onPorcelainSwing}
          onLeave={() => setPorcOpen(false)}
        />
      )}
      {tipFanfare && <TipCeremony salt={tipFanfare.salt} total={tipFanfare.total} taken={tipFanfare.taken} />}
      {sheetVendor && state && (
        <StallSheet
          vendor={sheetVendor}
          jars={openJarsOf(sheetVendor.id, state.owned, crewDip, state.declined, pendingBuyKeys)}
          owned={state.owned}
          declined={state.declined}
          pending={pendingBuyKeys}
          dipIndex={crewDip}
          crumbsNow={crumbsNow}
          committed={pendingCommitted}
          bowlCap={state.bowlCap}
          armedKey={feeding?.jarKey ?? null}
          onJar={onJar}
          onClose={() => setSheetId(null)}
          switches={sheetVendor.id === 'angel' && state.owned.has('autodip') ? [{
            key: 'autodip',
            label: 'Sous Chef',
            // The hint names the actual conflict when — and only when — the
            // player owns the jar it conflicts with. Telling everyone else
            // about a x64 they cannot reach yet would just be noise.
            hint: state.owned.has('longfry')
              ? 'dips a chip the moment it tops out at ×64 — he waits for the long fry now'
              : 'dips your golden chips for you, the moment they turn',
            on: sousOn,
            onToggle: () => setSousOn((v) => {
              const next = !v;
              try { localStorage.setItem(SOUS_KEY, next ? 'on' : 'off'); } catch { /* private mode */ }
              sfx.pop();
              say('angel', next
                ? 'he returns to the pass. nothing is unwitnessed.'
                : 'he sets down the tongs. the waiting is yours again, child.', 6000);
              return next;
            }),
          }] : undefined}
        />
      )}
      {/* THE COMMITTEE SAYS WHAT IT IS DOING AT EVERY STAGE. It used to say
          "you have made your case. the olives are unmoved." the moment you
          lobbied — which reads as the VERDICT, and a rejection — and then
          carried the motion anyway 65% of the time. Meanwhile the critter row
          fired "the guacamole layer was persuaded" on the same click, so two
          messages announced opposite outcomes simultaneously, neither of them
          the actual result. Operator: "the stuff from the council is a little
          weird?" The lobbied line is now plainly a WAITING state; the olives
          keep their joke for the resolution, where it belongs. */}
      {/* THE CRIER. Every one of these used to be `position: fixed` at its own
          hand-picked `top`, which is fine for exactly one at a time and wrong
          the moment two are up — the hermit's 120-second hold overlaps a vote
          easily, and the operator watched "under the celery" and "motion
          carries" land on top of each other. Hand-tuning the offsets again
          would only push the collision to the next pair (the same lesson the
          bowl ticket taught in #155/#156, and the burner in #168).

          One stack, laid out in flow: N banners can never overlap because the
          column places them. Order is by urgency — the thing waiting on YOU
          first, the thing merely happening last. The wrapper is
          click-through; only the buttons inside take pointer events. */}
      <div className="crier">
      {voteNow.phase === 'open' && (
        <div className="vote-banner" role="status">
          <span className="vote-text">
            <strong>the committee has called a vote.</strong>{' '}
            {voteNow.lobbied ? 'your case is heard. the beans are conferring.' : 'the subject is your fryers. attendance is mandatory.'}
          </span>
          {!voteNow.lobbied && (
            <button type="button" className="vote-lobby" onClick={() => onCritterClick('committee')}>lobby them</button>
          )}
        </div>
      )}
      {voteNow.phase === 'carried' && (
        <div className="vote-carried" role="status">motion carries — every fryer runs hot</div>
      )}
      {/* A LOST VOTE SAID NOTHING AT ALL. `voteTick` has always produced a
          'failed' phase and held it for six seconds, and nothing rendered it
          — the banner simply vanished. So a player learned the rule "lobbying
          is what carries a motion" only from the times they won, which is to
          say never. The two failures read differently on purpose: one is the
          dice, the other is you not turning up. */}
      {voteNow.phase === 'failed' && (
        <div className="vote-failed" role="status">
          {voteNow.lobbied
            ? 'motion fails. the olives abstain. they always abstain.'
            : 'nobody spoke for the motion. it dies on the floor. attendance was mandatory.'}
        </div>
      )}
      {hermitNow.phase === 'offering' && !feeding && (
        <div className="hermit-offer" role="status">
          <span className="vote-text">
            <strong>the hermit wants a chip.</strong>{' '}
            he takes it under the celery and brings it back triple. sometimes he does not bring it back.
          </span>
          <button type="button" className="hermit-take" onClick={onHermitTake}>hand it over</button>
        </div>
      )}
      {/* THE WAY IN. It waits at the band until you take it — nobody is
          ambushed by a takeover, and arriving with cold pots is a worse
          decision than the game should force on you (design doc, 3). */}
      {porcReach && !porcOpen && (
        <div className="porc-call" role="status">
          <span className="vote-text">
            <strong>there is something under the dip.</strong>{' '}
            it is smooth, and it is cold, and it goes on in every direction.
          </span>
          <button type="button" className="porc-go" onClick={() => setPorcOpen(true)}>go down</button>
        </div>
      )}
      {/* SCOOP IS OPEN FOR BUSINESS. He has asked for one more chip since the
          first frame; the moment you break something he finally says what for.
          Shown whenever there is char to spend or anything already bought, so
          a player who owns the lot can still go and look at it. */}
      {/* ONLY while there is char to spend. It used to also stand whenever
          `charOwned.size > 0` — i.e. permanently, from the first purchase on —
          because it was the shop's only door. Tapping scoop is that door now,
          so this can go back to meaning what it says. */}
      {state && scoopHasDeal && !scoopOpen && !porcOpen && (
        <div className="scoop-call" role="status">
          <span className="scoop-call-art" aria-hidden="true"><CritterArt id="scoop" /></span>
          <span className="vote-text">
            <strong>scoop has stopped begging.</strong>{' '}
            {state.char > 0
              ? `he is looking at your ${state.char === 1 ? 'grain' : `${state.char} grains`}.`
              : 'he is looking at you.'}
          </span>
          <button type="button" className="scoop-go" onClick={() => setScoopOpen(true)}>
            {state.char > 0 ? 'see what he wants' : "see what you've got"}
          </button>
        </div>
      )}
      {/* A DEEP BOSS IS IN FRONT OF YOU. Unlike the porcelain this one keeps
          what you have already done to it, so the call says so — a player who
          left mid-fight needs to know the damage is still there. */}
      {deepFight && !deepOpen && !porcOpen && !scoopOpen && (
        <div className="deep-call" role="status">
          <span className="vote-text">
            <strong>{deepFight.flavour.boss} is in the way.</strong>{' '}
            {deepFight.done > 0
              ? `you have taken ${Math.round(deepFight.frac * 100)}% of it.`
              : 'it is not going to move on its own.'}
          </span>
          <button type="button" className="deep-go" onClick={() => setDeepOpen(true)}>
            {deepFight.done > 0 ? 'back to it' : 'have a go'}
          </button>
        </div>
      )}
      {hermitNow.phase === 'holding' && (
        <div className="hermit-holding" role="status">the hermit has your chip. he has gone under the celery.</div>
      )}
      {feeding && (
        <FeedBanner
          vendor={feeding.vendor}
          jarLabel={UPGRADES[feeding.jarKey]?.label ?? 'jar'}
          onCancel={() => { setFeeding(null); setBubble(null); }}
          refuse={refusableNow(feeding.jarKey)}
        />
      )}
      </div>

      {/* ── TAKEOVERS LIVE OUTSIDE THE CRIER ─────────────────────────────────
          These three were children of `.crier`, and `.crier` carries
          `translate: -50% 0`. The individual `translate` property makes an
          element a CONTAINING BLOCK for `position: fixed` descendants, exactly
          as `transform` does — so `inset: 0` on a takeover stopped meaning "the
          viewport" and started meaning "the crier's column". Measured at
          448x899: `.deep-screen` inside the crier computed to 412x40 at
          (18,744) — a forty-pixel sliver — against 448x899 at (0,0) outside it.

          Which is why the deep fight looked like it had no background at all
          (operator, 2026-08-04: "the background is just transparent? very hard
          to read"), and why scoop's shop was clipped AND could not be dismissed
          by tapping outside it: `.sheet-backdrop` was confined the same way, so
          outside the shop there was no backdrop left to take the tap. The
          `88vh -> 84dvh` change in #290 treated a symptom of this; this is the
          cause.

          The crier keeps what it is for — the CALL banners (`.deep-call`,
          `.scoop-call`, `.porc-call`, the feed banner). A thing that covers the
          screen is not a banner. */}
      {scoopOpen && state && (
        <ScoopShop
          char={state.char}
          owned={state.charOwned}
          broken={state.deepest}
          onBuy={(a) => { onSpendChar(a); setScoopOpen(false); }}
          onClose={() => setScoopOpen(false)}
        />
      )}
      {/* THE BOTTOM OF THE BOWL. No call-to-action anywhere: this cannot be
          opened, only arrived at. */}
      {bottomOpen && state && (
        <TheBottom
          bowls={state.bowls}
          marks={bottomMarks}
          loading={bottomLoading}
          signed={bottomSigned}
          onSign={onSignBottom}
          onClose={() => setBottomOpen(false)}
        />
      )}
      {deepOpen && (deepBrokeFight ?? deepFight) && (
        <DeepFightScreen
          fight={(deepBrokeFight ?? deepFight)!}
          best={bestBlow(chips)}
          ready={deepReady(chips)}
          onHit={onDeepHit}
          onLeave={() => setDeepOpen(false)}
          broke={deepBroke}
        />
      )}

      {/*
        The shop-chatter corner. Both of these are asides, so they share one
        bottom-anchored column: the boards sit on the floor, a message rises
        above them.

        A column rather than a hardcoded offset, because the wallboard's height
        changes with its text and any fixed `bottom` would eventually overlap it.

        Deliberately NO z-index on the wrapper: `position: fixed` with
        `z-index: auto` creates no stacking context, so the expanded boards
        panel inside keeps its own z-20 against the page instead of being
        trapped beneath this container.
      */}
      <div className="corner">
        {/* The pop-out. Shown only inside known in-app browsers (Messenger,
            Instagram, …), whose storage is sandboxed from the real browser on
            the same phone — leave without this and the apron stays behind.
            The link carries the identity in the #fragment (lib/apronCarry.ts;
            fragments never reach the server). If the WebView opens it in
            place, the import no-ops against the same identity — harmless —
            which is why the hint about the ⋯ menu stays visible. */}
        {mode === 'browser' && inAppBrowser && browserIdentity && (
          <div className="carry-pill" role="note">
            <span>you&apos;re in an app&apos;s built-in browser — your kitchen lives only here.</span>
            <a
              className="carry-btn"
              href={buildCarryUrl(window.location.origin + window.location.pathname, browserIdentity)}
              target="_blank" rel="noopener noreferrer"
            >
              pop out &amp; take the apron
            </a>
            <span className="carry-hint">if it opens right back here, use the app&apos;s ⋯ menu → open in browser — that link carries your apron too.</span>
          </div>
        )}
        {notice && <p className="notice" role="status">{notice}</p>}
        <Boards rows={rows} hosting={hosting} hosted={hosted} myTableId={tableId}
          open={boardsOpen} onToggle={() => setBoardsOpen((o) => !o)} />
      </div>

      {state && <Tutorial state={state} chips={chips} />}
      {ddSplash !== null && (
        <div key={ddSplash} className="dd-splash" aria-hidden="true">
          <span className="dd-word">DOUBLE</span>
          <span className="dd-word dd-word2">DIP!</span>
        </div>
      )}
      <DipFlight flight={flight} />
      <GainFloats floats={gains} />
      {dipFanfare !== null && <DipChange dipIndex={dipFanfare} />}
    </div>
  );
}

function Spinner() {
  return (
    <span className="fry-spinner" aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}

function Doorway({ dipIndex, title, children }: { dipIndex: number; title: string; children: ReactNode }) {
  return (
    <div className="shop doorway">
      <DipBed dipIndex={dipIndex} />
      <div className="doorway-card">
        <h1>{title}</h1>
        {children}
      </div>
      {/* The dog is at the door before the shop even opens — "present from
          the very first frame" now includes the waits, which is where a
          long seat/table grind most needs somebody to look at. */}
      <div className="door-dog" aria-hidden="true">
        <CritterArt id="scoop" />
        <span className="say">i&apos;m not begging. this is a business meeting.</span>
      </div>
    </div>
  );
}
