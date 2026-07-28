/**
 * The snapshot has one job: contain the things that would have answered the
 * question. Every check below names a real question the chain could not
 * answer on 2026-07-28 — "was the dip ever queued", "what was the chip
 * actually worth", "did anything throw" — so a snapshot that silently stopped
 * carrying one of them would be a snapshot that is no use the next time.
 *
 * Run: npx tsx src/lib/debugSnapshot.test.ts
 */
import { buildSnapshot, snapshotText, SNAPSHOT_V, type SnapshotInput } from './debugSnapshot';
import { note, entries, clearRing, describe, RING_MAX } from './errorRing';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const input = (over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  at: 1785278000000,
  tableId: 'sha256:abc', tableName: 'Corner Rail 684', author: 'deadbeef',
  state: {
    crumbs: 3_094_206, bowlCap: 200_000_000, lifetimeChips: 6_760, dipIndex: 3,
    oldSalt: 464, fryers: 2, seasoningNum: 3, seasoningDen: 1,
    owned: new Set(['season1', 'bowl1']),
    moves: [
      { content_id: 'a', ms: 1, outcome: 'dipped' },
      { content_id: 'b', ms: 2, outcome: 'rejected-cost', upgradeKey: 'autodip' },
    ],
  } as unknown as SnapshotInput['state'],
  queue: [
    { kind: 'dip', id: 7, ms: 1785277999000, amount: 4_100_000, tableId: 'sha256:abc', author: 'deadbeef' },
  ] as unknown as SnapshotInput['queue'],
  chips: [{ ms: 99, pot: 128_125, crackles: 5, cookedMs: 60_000 }],
  ceiling: 6, seasoning: 3, crackleHaste: 1,
  errors: [{ at: 1785277990000, kind: 'error', text: 'boom' }],
  build: { rpc: 'https://swimchain.io/rpc', space: 'sp1...', mode: 'production' },
  viewport: { w: 390, h: 844, dpr: 3 }, ua: 'Mozilla/5.0 (Linux; Android)',
  ...over,
});

// 1) THE QUEUE. The 4.1M dip existed nowhere on chain. If it was sitting
//    unsent in the client, only this can say so — and it must carry the
//    AMOUNT, or the report cannot be matched against what the player saw.
{
  const s = buildSnapshot(input()) as { queue: Record<string, unknown>[] };
  check('the pending queue is captured', s.queue.length === 1, s.queue);
  check('a queued dip carries its amount', s.queue[0].amount === 4_100_000, s.queue[0]);
  check('and its authoring ms, which is its chain identity', s.queue[0].ms === 1785277999000);
  check('and whether it was ever sent', 'sentAt' in s.queue[0], s.queue[0]);
}

// 2) THE RACK. "It said 4.1m and paid nothing" is only provable if the
//    snapshot records what each chip was WORTH, not just its pot — the two
//    differ by 2^crackles and that factor is the whole bug class.
{
  const s = buildSnapshot(input()) as { rack: Record<string, unknown>[] };
  check('the rack is captured', s.rack.length === 1);
  check('each chip carries pot AND crackles', s.rack[0].pot === 128_125 && s.rack[0].crackles === 5);
  check('and the derived worth, pot x 2^crackles', s.rack[0].worth === 128_125 * 32, s.rack[0].worth);
}

// 3) THE FOLD. A cap that ate the payout is invisible without both numbers.
{
  const s = buildSnapshot(input()) as { fold: Record<string, unknown> };
  check('crumbs and cap are both present', s.fold.crumbs === 3_094_206 && s.fold.bowlCap === 200_000_000);
  check('owned is a sorted plain array (a Set does not survive JSON)',
    Array.isArray(s.fold.owned) && (s.fold.owned as string[])[0] === 'bowl1');
  check('recent outcomes come along', (s.fold.recent as unknown[]).length === 2);
}

// 4) ERRORS. The reason lived in a console nobody could open.
{
  const s = buildSnapshot(input()) as { errors: unknown[] };
  check('the error ring is carried', s.errors.length === 1, s.errors);
}

// 5) IT MUST SURVIVE AN EMPTY / BROKEN WORLD. A snapshot is taken when things
//    have gone wrong, so a null state is the LIKELY case, not the edge one —
//    and a capture that throws is worse than no capture at all.
{
  let threw = false;
  let out = '';
  try {
    out = snapshotText(input({ state: null, queue: [], chips: [], errors: [] }));
  } catch { threw = true; }
  check('a null fold does not throw', !threw);
  check('and still produces JSON', out.length > 0 && JSON.parse(out).v === SNAPSHOT_V);
  check('with fold explicitly null rather than missing', JSON.parse(out).fold === null);
}

// 6) IT MUST BE SERIALISABLE. The whole point is pasting it somewhere.
{
  const t = snapshotText(input());
  check('round-trips through JSON', JSON.parse(t).table.name === 'Corner Rail 684');
  check('is small enough to paste', t.length < 20_000, t.length);
}

/* ── the ring itself ──────────────────────────────────────────────────── */

// 7) It must not grow without bound, and it must keep the NEWEST entries —
//    a ring that drops the last thing that happened is the wrong ring.
{
  clearRing();
  for (let i = 0; i < RING_MAX + 15; i++) note('note', `entry ${i}`, 1000 + i);
  const e = entries();
  check('the ring is bounded', e.length === RING_MAX, e.length);
  check('and keeps the NEWEST, not the oldest',
    e[e.length - 1].text === `entry ${RING_MAX + 14}`, e[e.length - 1].text);
  check('entries() hands back a copy', (entries().push({ at: 0, kind: 'note', text: 'x' }), entries().length === RING_MAX));
}

// 8) `describe` is called on whatever a rejected promise happened to carry.
//    It may never throw: it runs inside the error path.
{
  const nasty: Record<string, unknown> = {};
  nasty.self = nasty;                          // circular — JSON.stringify throws
  check('an Error becomes name: message', describe(new TypeError('bad')) === 'TypeError: bad');
  check('a string passes through', describe('plain') === 'plain');
  check('undefined does not throw', describe(undefined) === 'undefined');
  let threw = false;
  try { describe(nasty); } catch { threw = true; }
  check('a circular object does not throw', !threw);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
