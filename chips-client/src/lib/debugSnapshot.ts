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
  if (m.kind === 'burn') return { ...base, ms: m.ms, key: m.key };
  if (m.kind === 'broke') return { ...base, ms: m.ms, paid: m.paid };
  if (m.kind === 'spend') return { ...base, ability: m.ability };
  return { ...base, ms: (m as { chip?: { ms?: number } }).chip?.ms ?? null };
}

/**
 * EVERY MOVE THE FOLD REFUSED, WITH ITS REASON.
 *
 * Added 2026-08-04 after an evening in which the answer was present in the fold
 * and absent from the report. The operator: "it currently offering from avo the
 * unripe an upgrade that I can't actually buy — just does nothing when I click
 * it". The fold knew exactly why (`rejected-order season2`: its prefix was not
 * owned at that point in the replay) and the report only carried the last
 * twelve moves, which that rejection had already fallen out of.
 *
 * A rejected buy has no UI path — the jar simply never sticks and the vendor
 * offers it again — so this list is the ONLY place the reason is written down.
 * Kept to the tail because a long-lived table can hold thousands.
 */
function rejectsOf(s: ChipsState | null): Record<string, unknown>[] {
  if (!s) return [];
  return s.moves
    .filter((m) => typeof m.outcome === 'string' && m.outcome.startsWith('rejected-'))
    .slice(-12)
    .map((m) => ({ ms: m.ms, outcome: m.outcome, key: m.upgradeKey ?? null }));
}

/**
 * QUEUE ENTRIES THAT NAME THE SAME MOVE TWICE.
 *
 * Observed the same evening: `id 263 buy fryer2` alongside `id 264 buy fryer2`,
 * and `id 260 buy season1` alongside `id 268 buy season1`. A jar can only be
 * bought once a run, so the second is guaranteed to fold `rejected-unowned` or
 * `rejected-duplicate` — it spends a real action PoW and a chain write to be
 * thrown away, and to the player it looks like the purchase "didn't take".
 *
 * Computed here rather than left for the reader: the queue is the one place
 * this is cheap to see, and nobody spots it by eye in a fifteen-row dump.
 */
function dupesOf(q: readonly QueuedMove[]): Record<string, unknown>[] {
  const seen = new Map<string, number[]>();
  for (const m of q) {
    const k = m.kind === 'buy' ? `buy:${m.key}`
      : m.kind === 'dip' ? `dip:${m.ms}`
        : m.kind === 'spend' ? `spend:${m.ability}`
          : `${m.kind}:${(m as { ms?: number }).ms ?? m.id}`;
    seen.set(k, [...(seen.get(k) ?? []), m.id]);
  }
  return [...seen.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids }));
}

/* ── KEEP WHAT IS RARE, TRUNCATE WHAT IS ROUTINE ───────────────────────────
   A report is split across as many 12,000-byte posts as it needs, and
   `reportBug` posts them in a loop with no resume — so a report that needs four
   posts is a report that usually arrives as one or two. On 2026-08-04 that cost
   the answer TWICE in one night: the second time, `rack` and `tuning` were the
   two fields that would have named the bug and they were both in the part that
   never came.

   The instinct is to make chunking reliable. The operator's correction is
   better: "not by handling disaster scenarios — by changing how it works."

   Measured on a real four-part report from that night, 42,031 bytes:

       journal      42.9%   n=60
       dips         20.8%   n=20
       regressions  15.7%   n=30
       errors       11.7%   n=30
       ------------------------- 91% of the payload
       fold + queue + rack + tuning + table = 3.3 KB, the part that diagnoses

   So the bulk is four ring buffers, and they are mostly repetition — the 30
   "regressions" were one tip's eight jars at a SINGLE timestamp, written out
   eight times over. Nothing there needed to be sent in full.

   Two structural changes, no retry logic:
     - stop pretty-printing (42,031 -> 30,996 for free), and
     - send every RARE event whole while truncating the routine ones.
   A report that fits one post cannot lose its tail. */

/** How many routine entries to keep once the rare ones are safe. */
const KEEP_ROUTINE = 8;

/**
 * The journal, minus the noise.
 *
 * `queued`/`sent`/`confirmed` are the happy path and there are hundreds; the
 * live queue already says what is outstanding. `expired` and `reconciled` are
 * the ones that mean something went wrong — an `expired` is a move the client
 * sent, never saw land, and deleted, taking credit the player had already been
 * shown. Those are kept in FULL however many there are; the routine ones keep
 * their tail so the recent sequence is still readable.
 */
function journalDigest(journal: readonly MoveEvent[]): MoveEvent[] {
  const rare = journal.filter((e) => e.phase === 'expired' || e.phase === 'reconciled');
  const routine = journal.filter((e) => e.phase !== 'expired' && e.phase !== 'reconciled');
  return [...rare, ...routine.slice(-KEEP_ROUTINE)].sort((a, b) => a.at - b.at);
}

/**
 * Fold regressions, collapsed per instant.
 *
 * A tip clears every jar at once, so one legitimate tip emits one regression
 * PER UPGRADE — eight lines saying the same thing at the same millisecond. The
 * instant and the fields are what a reader needs; eight copies of the sentence
 * are not.
 */
function foldRegressions(regs: readonly FoldRegression[]): Record<string, unknown>[] {
  const byInstant = new Map<number, FoldRegression[]>();
  for (const r of regs) byInstant.set(r.at, [...(byInstant.get(r.at) ?? []), r]);
  return [...byInstant.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-KEEP_ROUTINE)
    .map(([at, group]) => {
      const first = group[0] as unknown as Record<string, unknown>;
      return group.length === 1 ? first : {
        at,
        // `movesFrom > movesTo` is the signal that history got SHORTER — a move
        // was deleted, not mis-shown. It named two of the five bugs on
        // 2026-08-04, so it survives collapsing verbatim.
        movesFrom: first.movesFrom, movesTo: first.movesTo,
        fields: group.map((g) => `${g.field}: ${String(g.from)} -> ${String(g.to)}`),
        what: first.what,
      };
    });
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
    // WHY A MOVE DID NOT STICK. See `rejectsOf` — a refused buy is silent in
    // the UI, so without this the player's "I clicked it and nothing happened"
    // and the fold's `rejected-order` are two facts that never meet.
    rejects: rejectsOf(s),
    // The same move queued twice. See `dupesOf`.
    queueDupes: dupesOf(i.queue),
    // Non-zero means the endpoint really does omit replies it already served,
    // and the monotonic base is the only reason it did not show. Zero over a
    // long session means that theory is wrong and the cause is elsewhere.
    pollGaps: i.pollGaps,
    regressions: foldRegressions(i.regressions),
    journal: journalDigest(i.journal),

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
    dips: i.dips.slice(-KEEP_ROUTINE).map((d) => ({
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
      pot: d.pot, crackles: d.crackles,
      raw: d.raw, amount: d.amount, doubled: d.doubled,
      // A huge `amount` with `credited: 0` is a full bowl, not a lost dip —
      // the distinction that cost an hour on 2026-07-29.
      bowlCap: d.bowlCap, crumbsBefore: d.crumbsBefore, room: d.room,
      credited: d.credited, spilled: d.spilled,
      queuedId: d.queuedId,
    })),

    tuning: { ceiling: i.ceiling, seasoning: i.seasoning, crackleHaste: i.crackleHaste },
    errors: i.errors.slice(-KEEP_ROUTINE).map((e) => ({ at: e.at, kind: e.kind, text: e.text })),
    env: { ...i.build, ...i.viewport, ua: i.ua },
  };
}

/**
 * COMPACT, NOT PRETTY. It is read by a human, but it is READ AT ALL only if it
 * arrives: two-space indentation cost 11,035 bytes on a real report from
 * 2026-08-04 — an entire extra post out of four, for whitespace. `reportBug`
 * posts parts in a loop with no resume, so every part is a chance to lose the
 * tail, and the tail is where `rack` and `tuning` live. Anyone reading one can
 * pipe it through `jq .`; nobody can recover a part that was never posted.
 */
export function snapshotText(i: SnapshotInput): string {
  return JSON.stringify(buildSnapshot(i));
}
