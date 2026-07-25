/**
 * Chips & Dip — the shop.
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
import { createBrowserHost, bankBody, buyBody, type ChipsHost, type Identity } from './lib/host';
import { foldChips, type ChipsHeader, type ChipsState } from './lib/chipsEngine';
import { verifyReplies } from './lib/chipsVerify';
import { useFryers } from './lib/useFryers';
import { projectedCrumbs } from './lib/sogProjection';
import { DIP_TIERS, UPGRADES } from './lib/chipsConst';
import { Kitchen } from './Kitchen';
import { Bowl, Shelf, DipBed, DipChange } from './Bowl';
import { Boards, useBoards } from './Boards';
import { compact } from './lib/format';

const NAME_KEY = 'chips.cookname.v1';
const POLL_MS = 15_000;

/** A chip pulled from the oil that has not yet reached the chain. The `nonce`
 *  here is the ONLY surviving copy of that proof — `bank()` is destructive and
 *  will never hand it back. Losing this object throws away CPU the player
 *  already spent, so it is held until the submit genuinely lands. */
interface NapkinChip {
  ms: number;
  bits: number;
  nonce: bigint;
  failed: boolean;
  why?: string;
}

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
const BANK_LINES = [
  'tipping it into the bowl…',
  'the chip goes over the rail…',
  'salt, then bowl…',
  'shaking off the oil…',
];
const BUY_LINES = [
  'reaching up to the shelf…',
  'the jar comes down…',
  'signing for it on the pad…',
];
const pick = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)];

/** Dev-only breadcrumbs for the opening sequence — sponsorship and table
 *  creation are minutes of silent network + PoW, and when one of them stalls
 *  there is otherwise nothing at all to look at. Compiled out of production. */
const trace: (msg: string) => void = import.meta.env.DEV
  ? (msg) => console.debug('[chips]', msg)
  : () => { /* no-op */ };

function defaultName(): string {
  const a = ['Night', 'Corner', 'Back', 'Second', 'Late', 'Salt', 'Oil', 'Counter'];
  const b = ['Cook', 'Fryer', 'Hand', 'Shift', 'Station', 'Rail'];
  const n = Math.floor(Math.random() * 900 + 100);
  return `${a[Math.floor(Math.random() * a.length)]} ${b[Math.floor(Math.random() * b.length)]} ${n}`;
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
  const [counting, setCounting] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState<null | { pool: string[]; label: string }>(null);
  const [napkin, setNapkin] = useState<NapkinChip[]>([]);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [seated, setSeated] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

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

  // A wall clock for the sog projection. One second is plenty — the pile is
  // meant to look like it is going soft, not to tick.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
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
        const name = (cookName || defaultName()).slice(0, 80);
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
  const refresh = useCallback(async (): Promise<void> => {
    if (!host || !tableId || !me) return;
    const replies = await host.loadTable(tableId);
    const verified = await verifyReplies(
      tableId, me.publicKeyHex, replies,
      (done, total) => setCounting(total > 0 && done < total ? { done, total } : null)
    );
    const header: ChipsHeader = { v: 1, kind: 'chips-table', name: cookName, owner: me.publicKeyHex };
    setState(foldChips(header, tableId, replies, verified));
    setCounting(null);
  }, [host, tableId, me, cookName]);

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
    };
  }, []);

  /* ── moves ────────────────────────────────────────────────────────────── */
  const submitBank = useCallback(async (chip: { ms: number; bits: number; nonce: bigint }): Promise<void> => {
    if (!host || !me || !tableId) throw new Error('not open yet');
    await host.submitMove(me, tableId, bankBody(chip.bits, chip.nonce, chip.ms));
  }, [host, me, tableId]);

  async function onBank(index: number): Promise<void> {
    if (!host || !me || !tableId || busy) return;
    // DESTRUCTIVE. After this line the basket has already moved on and started
    // a new chip; `chip` is the only reference to this proof that exists
    // anywhere. Calling bank(index) again does NOT give it back.
    const chip = bank(index);
    if (!chip) return;

    // Park it on the napkin BEFORE the network is involved, so no throw path —
    // including a synchronous body assert — can drop it on the floor.
    setNapkin((n) => [...n, { ms: chip.ms, bits: chip.bits, nonce: chip.nonce, failed: false }]);
    setBusy({ pool: BANK_LINES, label: 'banking' });
    try {
      await submitBank(chip);
      setNapkin((n) => n.filter((c) => c.ms !== chip.ms));
      await refresh();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      setNapkin((n) => n.map((c) => (c.ms === chip.ms ? { ...c, failed: true, why } : c)));
      setNotice('that one did not make it to the bowl — it is on the napkin, still good');
    } finally {
      setBusy(null);
    }
  }

  async function onRetry(ms: number): Promise<void> {
    if (busy) return;
    const chip = napkin.find((c) => c.ms === ms);
    if (!chip) return;
    setNapkin((n) => n.map((c) => (c.ms === ms ? { ...c, failed: false, why: undefined } : c)));
    setBusy({ pool: BANK_LINES, label: 'banking' });
    try {
      // The SAME proof, never re-mined: a mined chip does not expire, and the
      // fold never compares the body's authoring-ms against created_at.
      await submitBank(chip);
      setNapkin((n) => n.filter((c) => c.ms !== ms));
      await refresh();
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      setNapkin((n) => n.map((c) => (c.ms === ms ? { ...c, failed: true, why } : c)));
    } finally {
      setBusy(null);
    }
  }

  async function onBuy(key: string): Promise<void> {
    if (!host || !me || !tableId || busy) return;
    setBusy({ pool: BUY_LINES, label: 'buying' });
    try {
      await host.submitMove(me, tableId, buyBody(key, Date.now()));
      await refresh();
      setNotice(`${UPGRADES[key]?.label ?? key} — down off the shelf`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'the shelf would not give it up');
    } finally {
      setBusy(null);
    }
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
      const t = setTimeout(() => setDipFanfare(null), 5200);
      return () => clearTimeout(t);
    }
    lastDip.current = state.dipIndex;
  }, [state]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const { rows, hosting } = useBoards(host, tableId);
  const seatLine = useFlavour(SEAT_LINES, Boolean(me) && !seated);
  const tableLine = useFlavour(TABLE_LINES, seated && !tableId);
  const busyLine = useFlavour(busy?.pool ?? BANK_LINES, Boolean(busy));

  /* ── screens ──────────────────────────────────────────────────────────── */

  function openShop() {
    const name = nameDraft.trim().slice(0, 80).replace(/[\r\n]/g, ' ') || defaultName();
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
    setCookName(name);
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
    return <Doorway dipIndex={0} title="Chips &amp; Dip"><p className="lede">the lights are coming on…</p></Doorway>;
  }

  if (!hasIdentity || !me) {
    return (
      <Doorway dipIndex={0} title="Chips &amp; Dip">
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
        <p className="fine">Makes a key that lives only in this browser. No account, no email.</p>
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
    return <Doorway dipIndex={0} title="Chips &amp; Dip"><p className="lede">{seatLine}</p><Spinner /></Doorway>;
  }
  if (!tableId) {
    return <Doorway dipIndex={0} title="Chips &amp; Dip"><p className="lede">{tableLine}</p><Spinner /></Doorway>;
  }

  const dipIndex = state?.dipIndex ?? 0;
  const tier = DIP_TIERS[Math.min(DIP_TIERS.length - 1, dipIndex)];
  const crumbsNow = state ? projectedCrumbs(state, nowMs) : 0;
  const unverified = (state?.unverifiedBanks ?? 0) > 0;
  const stillCounting = counting !== null || unverified || !state;

  return (
    <div className="shop" data-dip={tier.key}>
      <DipBed dipIndex={dipIndex} />

      <header className="hood">
        <div className="hood-plate">
          <span className="shop-name">CHIPS &amp; DIP</span>
          <span className="cook">{cookName}</span>
        </div>
        <div className="hood-dip">
          <span className="in-the-bowl">in the bowl tonight</span>
          <strong>{tier.label}</strong>
        </div>
        <div className="hood-crunch">
          <span className="in-the-bowl">lifetime crunch</span>
          <strong>{state ? compact(state.lifetimeChips) : '—'}</strong>
        </div>
      </header>

      <main className="stage">
        <Kitchen
          chips={chips}
          goldenBits={goldenBits}
          busy={Boolean(busy)}
          onBank={(i) => void onBank(i)}
          napkin={napkin.map((n) => ({ ms: n.ms, bits: n.bits, failed: n.failed }))}
          onRetry={(ms) => void onRetry(ms)}
        />

        <aside className="counter">
          {state && (
            <Bowl state={state} nowMs={nowMs} counting={stillCounting} countProgress={counting} />
          )}
          {state && (
            <Shelf state={state} crumbsNow={crumbsNow} busy={Boolean(busy)} onBuy={(k) => void onBuy(k)} />
          )}
        </aside>
      </main>

      <Boards rows={rows} hosting={hosting} open={boardsOpen} onToggle={() => setBoardsOpen((o) => !o)} />

      {busy && (
        <div className="working" role="status">
          <span className="working-oil" aria-hidden="true" />
          <span>{busyLine}</span>
        </div>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
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
