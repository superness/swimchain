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
import { DIP_TIERS } from './lib/chipsConst';
import { compact } from './lib/format';

export interface BoardRow {
  tableId: string;
  name: string;
  total: number;
  crispest: number;
  dipIndex: number;
  mine: boolean;
}

const PASS_INTERVAL_MS = 60_000;

export function useBoards(host: ChipsHost | null, myTableId: string | null): {
  rows: BoardRow[];
  hosting: boolean;
} {
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [hosting, setHosting] = useState(false);
  // Keep the newest table id available to the loop without restarting the loop
  // (and therefore without dropping every table off this node) each time it
  // changes.
  const mineRef = useRef<string | null>(myTableId);
  mineRef.current = myTableId;

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
        const out: BoardRow[] = [];
        for (const t of tables) {
          if (cancelled) return;
          try {
            // THE HOSTING CALL. Everything after it is just arithmetic; this is
            // the line that keeps `t` alive on this node.
            await host.requestContent(t.tableId);
            const replies = await host.loadTable(t.tableId);
            const verified = await verifyReplies(t.tableId, t.authorId, replies);
            const header: ChipsHeader = { v: 1, kind: 'chips-table', name: t.name, owner: t.authorId };
            const s = foldChips(header, t.tableId, replies, verified);
            out.push({
              tableId: t.tableId, name: t.name,
              total: s.lifetimeChips, crispest: s.crispest,
              dipIndex: s.dipIndex, mine: t.tableId === mineRef.current,
            });
          } catch {
            // One unreachable or malformed table must not stop us hosting the rest.
          }
          if (!cancelled) setRows(out.slice());
        }
      } catch {
        /* the whole listing failed — try again next pass */
      } finally {
        running = false;
        if (!cancelled) setHosting(false);
      }
    }

    void pass();
    const iv = setInterval(() => void pass(), PASS_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [host]);

  return { rows, hosting };
}

function Board({
  title, kind, note, rows, valueOf, unit,
}: {
  title: string;
  kind: 'marathon' | 'sprint';
  note: string;
  rows: BoardRow[];
  valueOf: (r: BoardRow) => number;
  unit: string;
}) {
  const ranked = rows
    .filter((r) => valueOf(r) > 0)
    .sort((a, b) => valueOf(b) - valueOf(a) || a.name.localeCompare(b.name))
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
            <li key={r.tableId} className={r.mine ? 'me' : undefined}>
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

export function Boards({ rows, hosting, open, onToggle }: {
  rows: BoardRow[];
  hosting: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const topCrisp = rows.reduce<BoardRow | null>((best, r) => (!best || r.crispest > best.crispest ? r : best), null);

  return (
    <>
      <button type="button" className={`wallboard${open ? ' open' : ''}`} onClick={onToggle}
        aria-expanded={open} aria-label="the boards">
        <span className="chalk-title">THE BOARDS</span>
        <span className="chalk-line">
          {topCrisp && topCrisp.crispest > 0
            ? `crispest: ${topCrisp.name} @ ${topCrisp.crispest} bits`
            : 'nothing up yet'}
        </span>
        <span className={`hosting${hosting ? ' live' : ''}`}>
          {hosting ? 'keeping tables warm…' : `hosting ${rows.length} ${rows.length === 1 ? 'table' : 'tables'}`}
        </span>
      </button>

      {open && (
        <div className="boards-panel" role="dialog" aria-label="the boards">
          <button type="button" className="boards-close" onClick={onToggle} aria-label="close the boards">×</button>
          <div className="boards-grid">
            <Board
              title="TOTAL CRUNCH" kind="marathon" unit=" chips"
              note="Lifetime work, never multiplied, never lost. A machine that fries all night will out-work a browser tab — that is what this board measures, and no amount of luck closes it."
              rows={rows} valueOf={(r) => r.total}
            />
            <Board
              title="CRISPEST CHIP" kind="sprint" unit=" bits"
              note="The single crispiest proof anyone has ever banked. One basket, one lucky run — a tab left open can take this off a machine that has been frying for a week."
              rows={rows} valueOf={(r) => r.crispest}
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
