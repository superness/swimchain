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
import { noteDip, noteTapAway, dipEntries, clearDipRing, DIP_RING_MAX, type DipNote } from './dipRing';

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
    broken: 2, bossDamage: 44_000, paidToBosses: 610_000,
    charOwned: new Set(['crack', 'grain']),
    moves: [
      { content_id: 'a', ms: 1, outcome: 'dipped' },
      { content_id: 'b', ms: 2, outcome: 'rejected-cost', upgradeKey: 'autodip' },
    ],
  } as unknown as SnapshotInput['state'],
  queue: [
    { kind: 'dip', id: 7, ms: 1785277999000, amount: 4_100_000, tableId: 'sha256:abc', author: 'deadbeef' },
  ] as unknown as SnapshotInput['queue'],
  chips: [{ ms: 99, pot: 128_125, crackles: 5, cookedMs: 60_000 }],
  // The 2026-07-29 case, encoded: a 4.1M dip that credited ZERO because the
  // bowl was already at its rim. Everything about it looks like a lost dip
  // unless the cap numbers travel WITH it.
  dips: [{
    at: 1785277999500, route: 'dip', index: 1, ms: 1785277999000, cookedMs: 500,
    pot: 128_125, crackles: 5,
    raw: 2_050_000, amount: 4_100_000, doubled: true,
    bowlCap: 4_000_000, crumbsBefore: 4_000_000, room: 0,
    credited: 0, spilled: 4_100_000,
    queuedId: 7,
  }],
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
    out = snapshotText(input({ state: null, queue: [], chips: [], dips: [], errors: [] }));
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

// 6b) THE DIPS. The report's whole job is to say what the CLIENT thinks, and
//     until 2026-07-29 it could show every state surrounding a dip and not the
//     dip. Each check below is a question that hour could not answer.
{
  const s = buildSnapshot(input()) as { dips: Record<string, unknown>[] };
  check('the dip ring is captured at all', s.dips.length === 1, s.dips);
  // `?? {}` so that a snapshot which drops `dips` entirely produces clean
  // FAILs for every check below instead of a TypeError that hides them — a
  // throwing test file reports one problem and conceals eight.
  const d = s.dips[0] ?? {};

  //   "what was actually in the basket" — a dip is destructive and restarts a
  //   fresh chip in the same tick, so the rack can NEVER answer this.
  check('a dip records the pot it actually dipped', d.pot === 128_125, d);
  check('and its crackles, so worth is recomputable', d.crackles === 5, d);

  //   "did the multipliers apply" — raw and final must BOTH survive, or a
  //   missing x2 is indistinguishable from a small chip.
  check('raw and multiplied amounts are both kept', d.raw === 2_050_000 && d.amount === 4_100_000, d);
  check('and whether the double-dip procced', d.doubled === true, d);

  //   THE LOAD-BEARING ONE. A 4.1M dip that paid nothing is either a lost dip
  //   or a full bowl, and those are opposite conclusions. All four numbers
  //   must be present together — any one of them alone proves nothing.
  check('a spilled dip is legible without any other source',
    d.amount === 4_100_000 && d.credited === 0 && d.spilled === 4_100_000
    && d.room === 0 && d.bowlCap === 4_000_000 && d.crumbsBefore === 4_000_000, d);

  //   "did it reach the queue" — the id joins this note to the queue entry
  //   above and to `dip <amount>#<ms>` on chain.
  check('the queue id links the dip to its move', d.queuedId === 7, d);
  const q = (buildSnapshot(input()) as { queue: Record<string, unknown>[] }).queue[0];
  check('and that id is the SAME one the queue reports', d.queuedId === q.id, { d: d.queuedId, q: q.id });

  //   "was this even a dip" — three other routes eat the chip and pay nothing
  //   BY DESIGN, and on a phone they are the same gesture.
  check('every note says which route the tap took', d.route === 'dip', d);

  //   THE TIMESTAMP TRAP. `ms` is the chip's BIRTH; reading it as the moment of
  //   the dip is what produced a wrong diagnosis on 2026-07-29. The report must
  //   spell the gap out rather than leave it to be re-derived.
  check('the tap time and the chip birth are separate fields', d.at === 1785277999500 && d.ms === 1785277999000, d);
  check('and the gap between them is stated outright', d.cookedForMs === 500, d);
}

// 6c) THE ROUTES THAT PAY NOTHING. Each is a fat chip gone for zero crumbs,
//     which is the complaint verbatim — so each must be legible as ITSELF and
//     never mistakable for a lost dip.
{
  clearDipRing();
  const chip = { ms: 1785277000000, pot: 50_000, crackles: 5, cookedMs: 120_000 };
  noteTapAway('hermit', 1785277120000, 0, chip);
  noteTapAway('boss', 1785277120001, 1, chip);
  const s = buildSnapshot(input({ dips: dipEntries() })) as { dips: Record<string, unknown>[] };
  check('a tap routed away is recorded at all', s.dips.length === 2, s.dips);
  check('and names its route', s.dips[0].route === 'hermit' && s.dips[1].route === 'boss', s.dips);
  check('and records the worth that was spent', s.dips[0].amount === 50_000 * 32, s.dips[0]);
  check('and credits nothing, because it did not',
    s.dips[0].credited === 0 && s.dips[0].queuedId === null, s.dips[0]);
  clearDipRing();
}

// 6d) THE DESCENT. A chip pays nothing during a boss fight ON PURPOSE. Without
//     these fields a report cannot rule that out, which is the first thing you
//     want ruled out.
{
  const s = buildSnapshot(input()) as { fold: Record<string, unknown> };
  check('how far down you are is captured', s.fold.broken === 2, s.fold.broken);
  check('and the damage banked against the current boss', s.fold.bossDamage === 44_000, s.fold.bossDamage);
  check('and what has been paid to bosses in total', s.fold.paidToBosses === 610_000, s.fold.paidToBosses);
  check('and which abilities are owned', Array.isArray(s.fold.charOwned) && (s.fold.charOwned as string[])[0] === 'crack', s.fold.charOwned);
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

// 9) The dip ring, like the error ring, must be bounded and must keep the
//    NEWEST — the dip a player is complaining about is the last one.
{
  clearDipRing();
  const mk = (i: number): DipNote => ({
    at: 1000 + i, route: 'dip', index: 0, ms: 5000 + i, cookedMs: 0, pot: 1, crackles: 0,
    raw: i, amount: i, doubled: false,
    bowlCap: 9, crumbsBefore: 0, room: 9, credited: i, spilled: 0, queuedId: i,
  });
  for (let i = 0; i < DIP_RING_MAX + 9; i++) noteDip(mk(i));
  const e = dipEntries();
  check('the dip ring is bounded', e.length === DIP_RING_MAX, e.length);
  check('and keeps the NEWEST dip', e[e.length - 1].amount === DIP_RING_MAX + 8, e[e.length - 1]);
  check('dipEntries() hands back a copy',
    (dipEntries().push(mk(0)), dipEntries().length === DIP_RING_MAX));
  clearDipRing();
  check('and it can be emptied', dipEntries().length === 0);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
