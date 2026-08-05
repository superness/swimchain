/**
 * A REPORT MUST ANSWER "WHY DIDN'T THAT STICK?" WITHOUT A CHAIN DUMP.
 *
 * 2026-08-04, after an evening where every answer existed in the fold and none
 * of them survived into the report. Operator: "the reports need to be enough to
 * debug all this stuff."
 *
 * Two questions the report could NOT answer that night, both pinned here:
 *
 *   1. "avo the unripe is offering an upgrade I can't actually buy — just does
 *      nothing when I click it". The fold knew: `rejected-order season2`, its
 *      prefix was not owned at that point in the replay. A refused buy has NO
 *      UI path — the jar never sticks and the vendor offers it again — so the
 *      fold's outcome is the only record. `recent` carried the last twelve
 *      moves and the rejection had already fallen out.
 *
 *   2. The same jar queued twice (`id 263 buy fryer2` beside `id 264 buy
 *      fryer2`). The second is guaranteed to fold rejected, spending a real
 *      action PoW to be thrown away, and to the player it reads as the purchase
 *      not taking. Fifteen rows of queue dump and nobody sees it by eye.
 *
 * Run: npx tsx src/lib/debugSnapshot.rejects.test.ts
 */
import { buildSnapshot } from './debugSnapshot';
import type { ChipsState } from './chipsEngine';
import type { QueuedMove } from './chipsQueue';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const TABLE = 'sha256:' + 'b'.repeat(64);
const P = { tableId: TABLE, author: ME };

/* A fold whose tail holds the operator's real rejection, buried behind enough
   later moves that a last-12 window would drop it. */
const moves: ChipsState['moves'] = [
  { content_id: 'x0', ms: 1000, outcome: 'rejected-order', upgradeKey: 'season2' },
  ...Array.from({ length: 20 }, (_, i) => ({
    content_id: `d${i}`, ms: 2000 + i, outcome: 'dipped' as const, crumbs: 10,
  })),
] as ChipsState['moves'];

const state = {
  crumbs: 325_000, bowlCap: 3_000_000, lifetimeChips: 135_985, dipIndex: 5,
  oldSalt: 0, fryers: 2, seasoningNum: 3, seasoningDen: 2,
  owned: new Set(['season1']), broken: 0, bossDamage: 0, bossHpFrozen: 0,
  deepest: 2, paidToBosses: 0, charOwned: new Set<string>(), moves,
} as unknown as ChipsState;

/* The queue as reported: fryer2 and season1 each queued twice. */
const queue: QueuedMove[] = [
  { ...P, kind: 'buy', id: 260, key: 'season1', sentAt: 1 },
  { ...P, kind: 'buy', id: 263, key: 'fryer2' },
  { ...P, kind: 'buy', id: 264, key: 'fryer2' },
  { ...P, kind: 'buy', id: 268, key: 'season1' },
  { ...P, kind: 'dip', id: 269, ms: 5555, amount: 906_944 },
] as QueuedMove[];

const INPUT = {
  at: 1785900536000, tableId: TABLE, tableName: 'Counter Fryer 303', author: ME,
  state, queue, chips: [], journal: [], regressions: [], pollGaps: 0, dips: [],
  ceiling: 6, seasoning: 1, crackleHaste: 1, errors: [],
  build: { rpc: '', space: '', mode: 'test' },
  viewport: { w: 1, h: 1, dpr: 1 }, ua: '',
};
const snap = buildSnapshot(INPUT as never) as Record<string, unknown>;

/* ── 1. THE REJECTION SURVIVES, EVEN BURIED ────────────────────────────── */
{
  const rejects = snap.rejects as { outcome: string; key: string | null }[];
  check('the report carries a rejects list', Array.isArray(rejects), rejects);
  check('the buried rejected-order is IN it',
    rejects.some((r) => r.outcome === 'rejected-order' && r.key === 'season2'), rejects);

  // The whole point: `recent` is a last-12 window and would have lost it.
  const recent = (snap.fold as { recent: unknown[] }).recent;
  check('...while the last-12 window has already dropped it',
    !JSON.stringify(recent).includes('season2'), recent);
}

/* ── 2. THE DOUBLE-QUEUED JARS ARE NAMED ───────────────────────────────── */
{
  const dupes = snap.queueDupes as { key: string; ids: number[] }[];
  check('fryer2 is reported as queued twice',
    dupes.some((d) => d.key === 'buy:fryer2' && d.ids.length === 2), dupes);
  check('season1 too', dupes.some((d) => d.key === 'buy:season1'), dupes);
  check('...and the singleton dip is NOT flagged',
    !dupes.some((d) => d.key.startsWith('dip:')), dupes);
}

/* ── 3. STILL SAFE ON AN EMPTY / PRE-FOLD REPORT ───────────────────────── */
{
  const empty = buildSnapshot({
    ...INPUT, at: 1, state: null, queue: [],
  } as never) as Record<string, unknown>;
  check('a report with no fold yet still builds',
    Array.isArray(empty.rejects) && (empty.rejects as unknown[]).length === 0);
  check('...and reports no dupes', (empty.queueDupes as unknown[]).length === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
