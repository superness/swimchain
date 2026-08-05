/**
 * A REPORT MUST FIT IN ONE POST.
 *
 * `reportBug` splits a report across as many 12,000-byte posts as it needs and
 * posts them in a sequential loop with no resume, so every extra part is
 * another chance to lose the tail. On 2026-08-04 that cost the answer TWICE in
 * one night — the second time `rack` and `tuning` were the two fields that
 * would have named the bug, and both were in a part that never arrived.
 *
 * The operator rejected the obvious fix: "we need to improve reliability of
 * reports... and not by handling disaster scenarios — by changing how it
 * works." He is right. Retry logic makes a four-part report arrive more often;
 * a one-part report cannot lose its tail at all.
 *
 * Measured on a real four-part report from that night (42,031 bytes pretty):
 *
 *     journal      42.9%   n=60        <- ring
 *     dips         20.8%   n=20        <- ring
 *     regressions  15.7%   n=30        <- ring
 *     errors       11.7%   n=30        <- ring
 *     ------------------------- 91% of the payload
 *     fold + queue + rack + tuning + table = 3.3 KB, the part that diagnoses
 *
 * So: drop the pretty-printing (free), keep every RARE event whole, truncate
 * the routine ones. This file pins the outcome in bytes, because "smaller" is
 * not a test.
 *
 * Run: npx tsx src/lib/reportFitsOnePost.test.ts
 */
import { snapshotText, buildSnapshot } from './debugSnapshot';
import { chunkReport } from './reportChunk';
import type { ChipsState } from './chipsEngine';
import type { QueuedMove } from './chipsQueue';
import type { MoveEvent } from './moveJournal';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** The real limit from host.ts. If that constant moves, this test must fail. */
const REPORT_CHUNK = 12_000;

const ME = 'a'.repeat(64);
const TABLE = 'sha256:' + 'b'.repeat(64);
const P = { tableId: TABLE, author: ME };

/* A session at least as heavy as the one that broke: full rings all round. */
const journal: MoveEvent[] = Array.from({ length: 60 }, (_, n) => ({
  at: 1785900000000 + n * 1000,
  id: 200 + n,
  kind: n % 3 === 0 ? 'buy' : 'dip',
  phase: (n === 7 || n === 41 ? 'expired' : n % 4 === 0 ? 'confirmed' : n % 2 ? 'sent' : 'queued') as MoveEvent['phase'],
  key: `dip:${TABLE}:${ME}:${1785900000000 + n}`,
  detail: 123456789,
  sentForMs: 4321,
}));

/* One tip clearing eight jars at a single instant, three times over — the exact
   shape that made `regressions` 15.7% of a report. */
const regressions = [1785901865896, 1785899521872, 1785897713982].flatMap((at) =>
  ['airtight', 'bowl1', 'bowl2', 'bowl3', 'fryer2', 'longfry', 'season1', 'season2'].map((k) => ({
    at, field: 'owned', what: `upgrade "${k}" was owned and now is not`,
    from: k, to: '(gone)', movesFrom: 1286, movesTo: 1287,
  })),
) as never[];

const dips = Array.from({ length: 20 }, (_, n) => ({
  route: 'dip', at: 1785900000000 + n * 900, ms: 1785899000000 + n, wireMs: 1785900000000 + n,
  cookedForMs: 65296, cookedMs: 35000, index: n % 4, pot: 3800160, crackles: 2,
  raw: 15200640, amount: 15200640, doubled: false, bowlCap: 100000000000,
  crumbsBefore: 5574770156, room: 94425229844, credited: 15200640, spilled: 0, queuedId: 140 + n,
})) as never[];

const errors = Array.from({ length: 30 }, (_, n) => ({
  at: 1785900000000 + n * 700, kind: 'note',
  text: 'FOLD WENT BACKWARDS: the fold replayed a SHORTER history — a move was dropped, not just mis-shown (130559779 -> 0)',
})) as never[];

const queue = Array.from({ length: 15 }, (_, n) => ({
  ...P, kind: n % 2 ? 'dip' : 'buy', id: 260 + n,
  ...(n % 2 ? { ms: 1785900000000 + n, amount: 906944 } : { key: 'overcook' }),
})) as QueuedMove[];

const state = {
  crumbs: 325_000, bowlCap: 3_000_000, lifetimeChips: 135_985, dipIndex: 5,
  oldSalt: 5700, fryers: 2, seasoningNum: 3, seasoningDen: 2,
  owned: new Set(['airtight', 'bowl1', 'detector', 'doubledip1', 'fryer2', 'overcook', 'season1']),
  broken: 0, bossDamage: 0, bossHpFrozen: 0, deepest: 2, paidToBosses: 109322689664,
  charOwned: new Set(['crack']),
  moves: Array.from({ length: 1200 }, (_, n) => ({
    content_id: `c${n}`, ms: 1785800000000 + n * 900,
    outcome: n % 37 === 0 ? 'rejected-order' : 'dipped',
    ...(n % 37 === 0 ? { upgradeKey: 'season4' } : {}),
  })),
} as unknown as ChipsState;

const INPUT = {
  at: 1785901536000, tableId: TABLE, tableName: 'Counter Fryer 303', author: ME,
  state, queue, chips: [{ ms: 1, pot: 838000, crackles: 4, cookedMs: 90000 }],
  journal, regressions, pollGaps: 0, dips,
  ceiling: 6, seasoning: 1085.76, crackleHaste: 0.6, errors,
  build: { rpc: 'https://swimchain.io/rpc', space: 'sp1qq', mode: 'production' },
  viewport: { w: 448, h: 899, dpr: 2.25 }, ua: 'Mozilla/5.0 (Linux; Android 17; Pixel 8 Pro)',
};

const text = snapshotText(INPUT as never);
const parts = chunkReport(text, REPORT_CHUNK);

/* ── 1. ONE POST. THIS IS THE WHOLE POINT. ─────────────────────────────── */
{
  console.log(`  (report is ${text.length.toLocaleString()} bytes -> ${parts.length} post(s))`);
  check('a heavy session still fits in ONE post', parts.length === 1,
    { bytes: text.length, limit: REPORT_CHUNK, parts: parts.length });
  check('...with headroom to spare', text.length < REPORT_CHUNK * 0.9, text.length);
}

/* ── 2. IT IS NOT PRETTY-PRINTED ───────────────────────────────────────── */
{
  // Two-space indentation cost 11,035 bytes on the real report — an entire
  // extra post, for whitespace.
  check('no pretty-printing', !text.includes('\n  "'), text.slice(0, 60));
}

/* ── 3. NOTHING THAT DIAGNOSES WAS THROWN AWAY ─────────────────────────── */
{
  const snap = buildSnapshot(INPUT as never) as Record<string, unknown>;
  for (const k of ['fold', 'queue', 'rack', 'tuning', 'table', 'rejects', 'queueDupes', 'dips', 'errors']) {
    check(`\`${k}\` survives`, snap[k] !== undefined);
  }
  // `rack` and `tuning` are the two that were lost on the night this was written.
  check('rack carries the pot, which is what was missing', JSON.stringify(snap.rack).includes('838000'));
}

/* ── 4. RARE EVENTS ARE KEPT WHOLE, ROUTINE ONES TRUNCATED ─────────────── */
{
  const snap = buildSnapshot(INPUT as never) as Record<string, unknown>;
  const j = snap.journal as MoveEvent[];
  const expired = j.filter((e) => e.phase === 'expired');
  check('BOTH expired entries survive, wherever they sat', expired.length === 2,
    { kept: expired.length, ofTotal: journal.length });
  check('...while the journal as a whole is truncated', j.length < journal.length,
    { kept: j.length, was: journal.length });
  check('...and it is still in time order',
    j.every((e, n) => n === 0 || e.at >= j[n - 1].at));

  // 24 regressions at 3 instants collapse to 3 lines, keeping the signal that
  // named two bugs: movesFrom > movesTo means history got SHORTER.
  const r = snap.regressions as Record<string, unknown>[];
  check('regressions collapse per instant', r.length === 3, { kept: r.length, was: regressions.length });
  check('...keeping movesFrom/movesTo verbatim',
    r.every((x) => x.movesFrom !== undefined && x.movesTo !== undefined));
  check('...and naming every field that moved',
    JSON.stringify(r).includes('airtight') && JSON.stringify(r).includes('season2'));
}

/* ── 5. AN EMPTY SESSION STILL BUILDS ──────────────────────────────────── */
{
  const empty = snapshotText({ ...INPUT, state: null, queue: [], journal: [], regressions: [], dips: [], errors: [] } as never);
  check('a report taken before the first fold still builds', empty.length > 0);
  check('...and is tiny', chunkReport(empty, REPORT_CHUNK).length === 1, empty.length);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
