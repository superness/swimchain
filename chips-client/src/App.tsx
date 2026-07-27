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
import { useRpc, useStoredIdentity, useStoredKeypair, createNewIdentity } from '@swimchain/react';
import { createBrowserHost, type ChipsHost, type Identity } from './lib/host';
import { foldChips, type ChipsHeader, type ChipsState, type ChipsReply } from './lib/chipsEngine';
import { verifyReplies } from './lib/chipsVerify';
import { withPending } from './lib/chipsPending';
import { planSend, afterSubmit } from './lib/chipsSender';
import { enqueue, loadQueue, saveQueue, clearQueue, nextIdAfter, activeFor, type QueuedMove } from './lib/chipsQueue';
import { retireSettled, confirmedMoveKeys } from './lib/chipsSettling';
import { canAffordBuy, pendingBuyCost, isBuyMove } from './lib/chipsAfford';
import { useFryers } from './lib/useFryers';
import { projectedCrumbs } from './lib/sogProjection';
import { newBankedMoves, actualGains } from './lib/chipsPayoutDisplay';
import { DIP_TIERS, UPGRADES } from './lib/chipsConst';
import { Kitchen, DipFlight, type DipFlightState } from './Kitchen';
import { TunnelBed, TunnelRead, DigFront, Shelf, DipBed, DipChange, GainFloats, type GainFloat } from './Tunnel';
import { Boards, useBoards } from './Boards';
import { compact } from './lib/format';
import { sfx } from './lib/sound';

const NAME_KEY = 'chips.cookname.v1';
/** Module-scope so the expiry tick below passes a referentially stable empty
 *  set rather than allocating one every second. */
const NO_CONFIRMED: ReadonlySet<string> = new Set<string>();
const POLL_MS = 15_000;

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
  const { rpc, connected, connecting, error: rpcError, setAuth } = useRpc();
  const { hasIdentity, saveIdentity, isLoading: idLoading } = useStoredIdentity();
  const { keypair, publicKeyHex, address, sign } = useStoredKeypair();

  const [cookName, setCookName] = useState<string>(() => readName());
  const [nameDraft, setNameDraft] = useState<string>(() => readName() || defaultName());

  const [tableId, setTableId] = useState<string | null>(null);
  const [state, setState] = useState<ChipsState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flight, setFlight] = useState<DipFlightState | null>(null);
  const [gains, setGains] = useState<GainFloat[]>([]);
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

  // Reads are signature-authenticated too, so this must be set before any RPC.
  useEffect(() => {
    if (!keypair || !publicKeyHex) return;
    setAuth({
      publicKey: publicKeyHex,
      sign: (m: Uint8Array) => {
        const s = keypair.sign(m);
        if (!s) throw new Error('signing failed');
        return s;
      },
    });
  }, [keypair, publicKeyHex, setAuth]);

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
  const confirmedRef = useRef<{ replies: ChipsReply[]; verified: Map<string, number> }>({ replies: [], verified: new Map() });

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
        trace('sponsor: asking for a seat');
        await host.sponsor(me);
        trace('sponsor: seated');
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
        const name = (cookName || nameFromKey(me.publicKeyHex)).slice(0, 80);
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
    confirmedRef.current = { replies: confirmed, verified };
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

  /* ── the fryers ───────────────────────────────────────────────────────── */
  // DEV-only override so the worker lifecycle (teardown on a fryer-count
  // change, and on unmount) can actually be exercised in a browser without
  // first grinding 400,000 crumbs. `import.meta.env.DEV` is statically false in
  // a production build, so this and the effect below vanish from the bundle.
  const [fryerOverride, setFryerOverride] = useState<number | null>(null);
  const fryerCount = fryerOverride ?? state?.fryers ?? 0;
  const goldenBits = state?.goldenBits ?? 16;

  const { chips, bank } = useFryers(fryerCount, publicKeyHex ?? '', tableId ?? '');

  const chipsRef = useRef(chips);
  chipsRef.current = chips;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__chips = {
      setFryers: (n: number) => setFryerOverride(n),
      clearFryers: () => setFryerOverride(null),
      /** Holes check: a sparse array reports holes here, a dense one never does. */
      holes: () => {
        const c = chipsRef.current;
        const missing: number[] = [];
        for (let i = 0; i < c.length; i++) if (c[i] === undefined) missing.push(i);
        return { length: c.length, holes: missing, bits: c.map((x) => x?.bits ?? 'HOLE') };
      },
      /** Show a notice without needing a failing bank — the notice is a layout
       *  row, so this is how you check the scene shifts rather than gets covered. */
      setNotice: (msg: string | null) => setNotice(msg),
      /** Inspect the pending-move queue without needing to bank for real. */
      queue: () => queue,
    };
  }, [queue]);

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

  function onBank(index: number): void {
    if (!host || !me || !tableId) return;
    // DESTRUCTIVE. After this line the basket has already moved on and started
    // a new chip; `chip` is the only reference to this proof that exists
    // anywhere. Calling bank(index) again does NOT give it back.
    const chip = bank(index);        // still destructive; still the only reference
    if (!chip) return;
    // The SAME test the fold will apply (chipsEngine.ts's double dip) — the
    // nonce is fixed the moment the chip is lifted, so the celebration can be
    // honest immediately rather than waiting a fold.
    const double = Boolean(state && state.doubleDipMod > 0 && chip.nonce % BigInt(state.doubleDipMod) === 0n);
    launchDip(index, chip, double);  // the animation is the feedback now
    sfx.dip(double);                 // grab / plop(s) / splash, timed to the flight
    // Every queued entry carries the table/identity it was mined for — see
    // chipsQueue.ts's file header on why (a queue entry with no provenance is
    // how a stale entry from an earlier identity ends up crediting a table it
    // has nothing to do with).
    setQueue((q) => enqueue(
      q, { tableId, author: me.publicKeyHex, kind: 'bank', chip: { ms: chip.ms, bits: chip.bits, nonce: chip.nonce } },
      nextId.current++
    ));
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
      if (activeBuys.some((m) => m.key === key)) return q; // exact duplicate — already queued
      const cost = UPGRADES[key]?.cost;
      if (cost === undefined) return q;
      const committed = pendingBuyCost(activeBuys, foldedIdsRef.current, (k) => UPGRADES[k]?.cost);
      if (!canAffordBuy(crumbsNow, committed, cost)) return q; // not affordable once unfolded queued buys are accounted for
      return enqueue(q, { tableId: table, author, kind: 'buy', key }, nextId.current++);
    });
  }

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
      const t = setTimeout(() => setDipFanfare(null), 5200);
      return () => clearTimeout(t);
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

  const { rows, hosting, hosted } = useBoards(host);
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
  if (idLoading || (hasIdentity && !me) || (!rpc && connecting)) {
    return <Doorway dipIndex={0} title="Dippin' Chips"><p className="lede">the lights are coming on…</p></Doorway>;
  }

  if (!hasIdentity || !me) {
    return (
      <Doorway dipIndex={0} title="Dippin' Chips">
        <p className="lede">
          Grind a chip until it is crisp. Bank it before you get greedy. Spend the crumbs
          before they go soft. Nobody runs this shop — it lives on the network.
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

  const dipIndex = state?.dipIndex ?? 0;
  const tier = DIP_TIERS[Math.min(DIP_TIERS.length - 1, dipIndex)];
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

  return (
    <div className="shop" data-dip={tier.key}>
      <TunnelBed state={state} />

      <header className="hood">
        <div className="hood-plate">
          <span className="shop-name">DIPPIN&apos; CHIPS</span>
          <span className="cook">{cookName}</span>
        </div>
        <div className="hood-dip">
          <span className="in-the-bowl">the layer you&apos;re in</span>
          <strong>{tier.label}</strong>
        </div>
        <div className="hood-crunch">
          <span className="in-the-bowl">lifetime crunch</span>
          {/* Gated on the SAME condition as the bowl. The fold skips banks it
              has no verification for (chipsEngine.ts's `rejected-unverified`),
              so while chips are still being counted this figure is understated
              by exactly as much as `crumbs` is. The bowl says so; showing a
              confident number next to it would just make the bowl look wrong. */}
          <strong>{state && !stillCounting ? compact(state.lifetimeChips) : '—'}</strong>
        </div>
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


      <main className="stage">
        <Kitchen
          chips={chips}
          goldenBits={goldenBits}
          onBank={onBank}
          state={state}
          nowMs={nowMs}
        />

        <aside className="counter">
          {state && (
            <TunnelRead state={state} nowMs={nowMs} counting={stillCounting} countProgress={counting} />
          )}
          {state && (
            <Shelf state={state} crumbsNow={crumbsNow} committed={pendingCommitted} onBuy={onBuy} />
          )}
        </aside>
      </main>

      {/* The pile on the dig floor — fixed at the bed's own 76vh floor line,
          outside the stage's flow entirely (the flight measures it). */}
      {state && <DigFront state={state} nowMs={nowMs} counting={stillCounting} />}

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
        {notice && <p className="notice" role="status">{notice}</p>}
        <Boards rows={rows} hosting={hosting} hosted={hosted} myTableId={tableId}
          open={boardsOpen} onToggle={() => setBoardsOpen((o) => !o)} />
      </div>

      <DipFlight flight={flight} goldenBits={goldenBits} />
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
    </div>
  );
}
