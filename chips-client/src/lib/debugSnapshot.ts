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
import type { DipNote } from './dipRing';
import type { MoveEvent } from './moveJournal';
import type { FoldRegression } from './foldWatch';

export const SNAPSHOT_V = 3;

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
  /** EVERY MOVE'S LIFECYCLE — queued / sent / confirmed / expired. The client's
   *  side of a discrepancy, in the same shape as the chain's, so the two can be
   *  lined up instead of reconciled by arithmetic. See moveJournal.ts. */
  journal: readonly MoveEvent[];
  /** Invariants that went BACKWARDS. See foldWatch.ts. */
  regressions: readonly FoldRegression[];
  /** Replies a poll omitted that the base already held — each one WOULD have
   *  been a visible regression before confirmedBase.ts held the line. */
  pollGaps: number;
  /** THE DIPS, as the client computed them. The rack and the fold are both
   *  states AFTER the fact; a dip is destructive, so without this the pot that
   *  was actually dipped is unrecoverable. See dipRing.ts. */
  dips: readonly DipNote[];
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

    // FIRST, BECAUSE THEY ARE THE ANSWER. A snapshot of state cannot show a
    // discrepancy — only a record of what the client DID can be diffed against
    // the chain. Operator, 2026-07-29: "we are trying to find discrepancies
    // between client and on the chain, so we need to be tracking what HAPPENED
    // ON THE CLIENT."
    //
    // `expired` entries are the headline: each one is a move the client sent,
    // never saw land, and then deleted — taking with it credit the player had
    // already been shown. That is a lost upgrade, in writing.
    lostMoves: i.journal.filter((e) => e.phase === 'expired').length,
    // Non-zero means the endpoint really does omit replies it already served,
    // and the monotonic base is the only reason it did not show. Zero over a
    // long session means that theory is wrong and the cause is elsewhere.
    pollGaps: i.pollGaps,
    regressions: i.regressions,
    journal: i.journal,

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
      // THE DESCENT. Omitted until 2026-07-29, which is why a report could not
      // rule out "you were in a boss fight, where a chip pays nothing on
      // purpose" — the single most likely innocent explanation for the
      // complaint the report exists to answer.
      broken: s.broken,
      bossDamage: s.bossDamage,
      // THE BAR THE FOLD IS ACTUALLY SCORING AGAINST, and `deepest`, the
      // watermark. Omitted until 2026-08-04, which is why a report could not
      // settle "I beat the chip from 1974 and it went back to 0": the HP is
      // frozen from `lifetimeChips` AT THE FIGHT'S FIRST BLOW, so an optimistic
      // fold and a confirmed one can freeze DIFFERENT bars for the same fight
      // (pending replies sort by now, confirmed ones by their real time — so an
      // in-flight dip lands on the far side of that first blow, then the near
      // side). A client that froze the lower bar kills the band early and shows
      // you the NEXT boss; when the chain's own kill lands, it snaps back. Both
      // numbers are needed to tell that apart from a simple lost move, and
      // neither is derivable from anything else in this report.
      bossHpFrozen: s.bossHpFrozen,
      deepest: s.deepest,
      paidToBosses: s.paidToBosses,
      charOwned: [...(s.charOwned ?? [])].sort(),
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

    // WHAT EACH DIP THOUGHT IT PAID. The whole point of the report is to get
    // what the client thinks, and until now it could show every state around a
    // dip but not the dip. Ordered oldest-first; the last one is the one the
    // player is complaining about.
    dips: i.dips.map((d) => ({
      // FIRST, because it is the answer. Anything but 'dip' means the tap was
      // routed away and paid nothing on purpose.
      route: d.route,
      // `at` is the tap; `ms` is the chip's BIRTH. They differ by the cook, and
      // reading ms as the tap time is what derailed 2026-07-29 — so the gap is
      // spelled out here rather than left to be re-derived.
      // `wireMs` is what the move carries on chain, so a report can be joined
      // to `dip <amount>#<ms>~` directly. It tracks `at`, not `ms` — the two
      // came apart when the dip stopped being stamped with its chip's birthday
      // (cooking.ts's dipFor).
      at: d.at, ms: d.ms, wireMs: d.wireMs, cookedForMs: d.at - d.ms, cookedMs: d.cookedMs,
      index: d.index,
      pot: d.pot, crackles: d.crackles,
      raw: d.raw, amount: d.amount, doubled: d.doubled,
      // A huge `amount` with `credited: 0` is a full bowl, not a lost dip —
      // the distinction that cost an hour on 2026-07-29.
      bowlCap: d.bowlCap, crumbsBefore: d.crumbsBefore, room: d.room,
      credited: d.credited, spilled: d.spilled,
      queuedId: d.queuedId,
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
