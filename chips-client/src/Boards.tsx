/**
 * The two boards on the wall.
 *
 * RENDERING THESE IS THE HOSTING DRIVER. Nodes fetch content on demand only;
 * nothing keeps another player's table alive on this node except somebody
 * asking for it. This loop is that somebody. It is not a config flag or a
 * "follow" setting — the act of showing the boards is what hosts the game.
 * If this loop stops, other people's tables start falling off this node.
 *
 * TWO boards, labelled honestly, because they measure two different things and
 * only one of them is winnable from a browser tab:
 *   - TOTAL CRUNCH is a marathon over lifetime work. A desktop that fries all
 *     night will out-work a tab, and no amount of skill closes that. Say so.
 *   - CRISPEST CHIP is a sprint: the single crispiest proof anyone ever banked.
 *     One lucky basket wins it. That one is anybody's.
 */
import { useEffect, useRef, useState } from 'react';
import type { ChipsHost } from './lib/host';
import { foldChips, type ChipsHeader } from './lib/chipsEngine';
import { verifyReplies } from './lib/chipsVerify';
import { planBoardsPass } from './lib/boardsPass';
import { DIP_TIERS } from './lib/chipsConst';
import { compact } from './lib/format';

/**
 * A folded table, CACHED ACROSS PASSES. It deliberately carries no "is this
 * mine" flag: whose table it is depends on state that arrives later than the
 * fold (see `Board`), and a cached row would pin the wrong answer.
 */
export interface BoardRow {
  tableId: string;
  name: string;
  total: number;
  crispest: number;
  dipIndex: number;
}

const PASS_INTERVAL_MS = 60_000;

/**
 * How many tables get FOLDED per pass. Every table is still `requestContent`'d
 * every pass — that call is the hosting driver and is a cheap RPC, so it is
 * never capped. Folding is the expensive half: a cold browser pays one real
 * Argon2id-8MiB hash per bank per table.
 *
 * Those hashes no longer run on the UI thread (chipsVerify.worker.ts), so this
 * cap is not what keeps the tab alive — it is what keeps a first load with a
 * full board from monopolising the single verify worker for minutes while the
 * player's OWN table waits behind it in the queue. The window rotates, so
 * every table is still reached, just over several passes.
 */
const TABLES_FOLDED_PER_PASS = 6;

/**
 * `foldReady` gates the EXPENSIVE half only — hosting still runs from the first
 * pass, because that is this browser's contribution to keeping other people's
 * tables alive and it is only a name lookup.
 *
 * Measured on a Pixel, 2026-08-02: with no gate, a first load folds six foreign
 * tables through the single verify worker before the player's own table reaches
 * it — an Argon2id-8MiB hash per bank per table, for a board panel that is
 * CLOSED by default. The player waits on a leaderboard they cannot see. Passing
 * `state !== null` here puts their own game first; the teaser strip fills in on
 * the pass that follows instead of the one that blocks.
 */
export function useBoards(host: ChipsHost | null, foldReady: boolean): {
  rows: BoardRow[];
  hosting: boolean;
  /** Tables this browser asked for by name on the last pass. NOT `rows.length`:
   *  folding is windowed, hosting is not, so the honest count is this one. */
  hosted: number;
} {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [hosting, setHosting] = useState(false);
  const [hosted, setHosted] = useState(0);
  // Folded rows survive across passes, because each pass only re-folds a
  // rotating window of the board (see TABLES_FOLDED_PER_PASS). Without this the
  // boards would show six rows at a time and flicker the rest away.
  const knownRef = useRef<Map<string, BoardRow>>(new Map());
  const cursorRef = useRef(0);
  // Read at the fold step rather than at pass entry, so a pass already in
  // flight when the player's own table lands still folds on this pass instead
  // of idling until the next one.
  const foldRef = useRef(foldReady);
  foldRef.current = foldReady;
  const passRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    let running = false;

    async function pass(): Promise<void> {
      if (!host || running || cancelled) return;
      running = true;
      setHosting(true);
      try {
        const tables = await host.listTables();
        const byId = new Map(tables.map((t) => [t.tableId, t]));

        // What this pass will do. Pure arithmetic, and tested in
        // boardsPass.test.ts — including the two ways this is easy to get
        // wrong: gating hosting along with folding, and burning the fold
        // window on a pass that folded nothing.
        const plan = planBoardsPass(
          tables.map((t) => t.tableId),
          foldRef.current,
          cursorRef.current,
          TABLES_FOLDED_PER_PASS,
        );

        // THE HOSTING CALLS. Every table, every pass, uncapped: this loop is
        // the only reason anyone else's table stays on this node, and asking
        // for content by name is cheap. Everything below is just arithmetic.
        for (const id of plan.host) {
          if (cancelled) return;
          try { await host.requestContent(id); } catch { /* next pass */ }
        }
        if (!cancelled) setHosted(plan.host.length);

        // Drop rows for tables that have fallen off the board entirely.
        const live = new Set(tables.map((t) => t.tableId));
        for (const id of [...knownRef.current.keys()]) {
          if (!live.has(id)) knownRef.current.delete(id);
        }

        // THE EXPENSIVE HALF — one real Argon2id-8MiB hash per bank. `plan.fold`
        // is empty until the player's own table has folded, so a first load can
        // no longer queue six foreign boards ahead of the player's own game.
        for (const id of plan.fold) {
          if (cancelled) return;
          const t = byId.get(id);
          if (!t) continue;
          try {
            const replies = await host.loadTable(t.tableId);
            const verified = await verifyReplies(t.tableId, t.authorId, replies);
            const header: ChipsHeader = { v: 1, kind: 'chips-table', name: t.name, owner: t.authorId };
            const s = foldChips(header, t.tableId, replies, verified);
            knownRef.current.set(t.tableId, {
              tableId: t.tableId, name: t.name,
              total: s.lifetimeChips, crispest: s.crispest,
              dipIndex: s.dipIndex,
            });
          } catch {
            // One unreachable or malformed table must not stop us hosting the rest.
          }
          if (!cancelled) setRows([...knownRef.current.values()]);
        }
        cursorRef.current = plan.nextCursor;
      } catch {
        /* the whole listing failed — try again next pass */
      } finally {
        running = false;
        if (!cancelled) setHosting(false);
      }
    }

    passRef.current = pass;
    void pass();
    const iv = setInterval(() => void pass(), PASS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
      passRef.current = null;
    };
  }, [host]);

  // The pass that was skipped while the player's own table folded must not cost
  // them a full PASS_INTERVAL_MS of empty boards — run one the moment the gate
  // opens. If a pass is already in flight it will fold on its own, because the
  // fold step reads `foldRef` rather than a value captured at pass entry.
  useEffect(() => {
    if (foldReady) void passRef.current?.();
  }, [foldReady]);

  return { rows, hosting, hosted };
}

function Board({
  title, kind, note, rows, valueOf, unit, myTableId,
}: {
  title: string;
  kind: 'marathon' | 'sprint';
  note: string;
  rows: BoardRow[];
  valueOf: (r: BoardRow) => number;
  unit: string;
  myTableId: string | null;
}) {
  const ranked = rows
    .filter((r) => valueOf(r) > 0)
    // Code-unit compare, NOT `localeCompare`. This tiebreak decides visible
    // rank between two equal scores, so a locale-sensitive collation would show
    // two players in different locales a different leaderboard for the same
    // data. Same comparison the fold uses for its content_id tiebreak
    // (chipsEngine.ts's `orderReplies`).
    .sort((a, b) => valueOf(b) - valueOf(a) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 10);

  return (
    <div className={`board board-${kind}`}>
      <h3>{title}</h3>
      <p className="board-kind">{kind === 'marathon' ? 'a marathon' : 'a sprint'}</p>
      <p className="board-note">{note}</p>
      {ranked.length === 0 ? (
        <p className="board-empty">nobody has put anything up here yet</p>
      ) : (
        <ol>
          {ranked.map((r, i) => (
            // `mine` is computed HERE, at render, never stamped into the cached
            // row. Folding happens in a rotating window of six tables per pass
            // and the first pass runs before onboarding has resolved this
            // browser's table id, so a row folded early would cache
            // `mine: false` and keep showing the player as a stranger on their
            // own board for up to ceil(N/6) passes.
            <li key={r.tableId} className={r.tableId === myTableId ? 'me' : undefined}>
              <span className="pos">{i + 1}</span>
              <span className="who">{r.name}</span>
              {/* NOT `dip` — that class is the full-screen dip bed
                  (`position: fixed; inset: 0`), and reusing it here threw this
                  little label into the top-left corner of the viewport, on top
                  of everything, on every board row. */}
              <span className="dip-tier">{DIP_TIERS[Math.min(DIP_TIERS.length - 1, r.dipIndex)].label}</span>
              <span className="val">{compact(valueOf(r))}<em>{unit}</em></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Boards({ rows, hosting, hosted, open, onToggle, myTableId }: {
  rows: BoardRow[];
  hosting: boolean;
  hosted: number;
  open: boolean;
  onToggle: () => void;
  /** Live, from App — NOT baked into `rows`. See the `me` class below. */
  myTableId: string | null;
}) {
  const topRich = rows.reduce<BoardRow | null>((best, r) => (!best || r.total > best.total ? r : best), null);

  return (
    <>
      <button type="button" className={`wallboard${open ? ' open' : ''}`} onClick={onToggle}
        aria-expanded={open} aria-label="the boards">
        <span className="chalk-title">THE BOARDS</span>
        <span className="chalk-line">
          {topRich && topRich.total > 0
            ? `deepest dipper: ${topRich.name}`
            : 'nothing up yet'}
        </span>
        <span className={`hosting${hosting ? ' live' : ''}`}>
          {hosting ? 'keeping tables warm…' : `hosting ${hosted} ${hosted === 1 ? 'table' : 'tables'}`}
        </span>
      </button>

      {open && (
        <div className="boards-panel" role="dialog" aria-label="the boards">
          <button type="button" className="boards-close" onClick={onToggle} aria-label="close the boards">×</button>
          <div className="boards-grid">
            <Board
              title="TOTAL CRUNCH" kind="marathon" unit=" chips"
              note="Lifetime work, never multiplied, never lost. A machine that fries all night will out-work a browser tab — that is what this board measures, and no amount of luck closes it."
              rows={rows} valueOf={(r) => r.total} myTableId={myTableId}
            />
            <Board
              title="CRISPEST CHIP" kind="sprint" unit=" bits"
              note="The single crispiest proof anyone has ever banked. One basket, one lucky run — a tab left open can take this off a machine that has been frying for a week."
              rows={rows} valueOf={(r) => r.crispest} myTableId={myTableId}
            />
          </div>
          <p className="boards-foot">
            Every table on these boards is one this browser is asking for by name.
            Showing them is what keeps them on this node.
          </p>
        </div>
      )}
    </>
  );
}
