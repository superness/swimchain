/**
 * ONE BUTTON, EVERYTHING THE CLIENT KNOWS.
 *
 * Built after a 4.1M dip paid nothing on a phone and the chain could only
 * prove a negative: no such dip was ever submitted. The reason was entirely
 * client-side — a queue that never sent, a worth that disagreed with its
 * payload, an exception in a worker — and every one of those is invisible
 * from the outside and unreachable on a device with no console.
 *
 * So: the player presses one thing, at the moment it happens, and gets a
 * paste-able record of the whole client. The snapshot is deliberately a PURE
 * function of state that is handed to it — no reading globals, no I/O — so it
 * is testable and so it cannot itself fail while capturing a failure.
 *
 * WHAT IT MAY NOT CONTAIN: anything that is not already public. The author's
 * public key and the table id are both on-chain in the clear, so they are
 * fine and they are what makes a report actionable. Nothing here touches the
 * identity's secret key, the password, or storage beyond the game's own queue.
 */
import type { ChipsState } from './chipsEngine';
import type { QueuedMove } from './chipsQueue';
import type { CookingChip } from './cooking';
import type { RingEntry } from './errorRing';

export const SNAPSHOT_V = 1;

export interface SnapshotInput {
  at: number;
  tableId: string | null;
  tableName: string | null;
  author: string | null;
  state: ChipsState | null;
  /** The whole pending queue — the single most useful thing in here, because
   *  a move that never left the client shows up nowhere else at all. */
  queue: readonly QueuedMove[];
  chips: readonly CookingChip[];
  ceiling: number;
  seasoning: number;
  crackleHaste: number;
  errors: readonly RingEntry[];
  /** `import.meta.env` bits worth knowing: which bundle, which endpoint. */
  build: { rpc?: string; space?: string; mode?: string };
  viewport: { w: number; h: number; dpr: number };
  ua: string;
}

/** What a move looks like in a report — enough to identify it on chain. */
function moveOf(m: QueuedMove): Record<string, unknown> {
  const base: Record<string, unknown> = { kind: m.kind, id: m.id, sentAt: m.sentAt ?? null };
  if (m.kind === 'dip') return { ...base, ms: m.ms, amount: m.amount };
  if (m.kind === 'buy') return { ...base, key: m.key };
  if (m.kind === 'tip') return { ...base, ms: m.ms };
  return { ...base, ms: (m as { chip?: { ms?: number } }).chip?.ms ?? null };
}

/**
 * The report. Flat, small, and ordered so the useful things are first when it
 * is read in a chat window on a phone.
 */
export function buildSnapshot(i: SnapshotInput): Record<string, unknown> {
  const s = i.state;
  return {
    v: SNAPSHOT_V,
    at: i.at,
    table: { id: i.tableId, name: i.tableName, author: i.author },

    // THE FOLD'S VIEW — what the chain says you have.
    fold: s ? {
      crumbs: s.crumbs,
      bowlCap: s.bowlCap,
      lifetimeChips: s.lifetimeChips,
      dipIndex: s.dipIndex,
      oldSalt: s.oldSalt,
      fryers: s.fryers,
      seasoning: `${s.seasoningNum}/${s.seasoningDen}`,
      owned: [...s.owned].sort(),
      moves: s.moves.length,
      // Only the tail: the whole history can be thousands of entries and the
      // last handful is what a just-now bug is about.
      recent: s.moves.slice(-12).map((m) => ({ ms: m.ms, outcome: m.outcome, key: m.upgradeKey ?? null })),
    } : null,

    // THE CLIENT'S VIEW — what it is still trying to tell the chain. A dip
    // that vanished is either here (never sent) or nowhere (lost), and those
    // are different bugs with different fixes.
    queue: i.queue.map(moveOf),

    // THE RACK, right now. A payout that disagrees with what the player saw
    // is provable from this and nothing else.
    rack: i.chips.map((c, index) => ({
      index, ms: c.ms, pot: c.pot, crackles: c.crackles,
      worth: c.pot * 2 ** c.crackles,
      cookedMs: c.cookedMs,
    })),

    tuning: { ceiling: i.ceiling, seasoning: i.seasoning, crackleHaste: i.crackleHaste },
    errors: i.errors.map((e) => ({ at: e.at, kind: e.kind, text: e.text })),
    env: { ...i.build, ...i.viewport, ua: i.ua },
  };
}

/** Pretty, because it will be read by a human in a chat window. */
export function snapshotText(i: SnapshotInput): string {
  return JSON.stringify(buildSnapshot(i), null, 2);
}
