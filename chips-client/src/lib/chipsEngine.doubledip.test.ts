/**
 * The double dip, the cellar, the nose, and chain-append safety.
 * Run: npx tsx src/lib/chipsEngine.doubledip.test.ts
 *
 * The load-bearing claims:
 *   1. A chip double-dips exactly when the modulus divides its nonce AND the
 *      upgrade is owned — and the payout is exactly 2x payoutFor, never a
 *      restated formula (linkage, like sogProjection.test.ts).
 *   2. lifetimeChips is NOT doubled — tiers measure work, not luck.
 *   3. The new rungs are chain-gated, and APPENDING them changed nothing
 *      about how the historical prefix folds (the re-scoring safety pin).
 *   4. cellar's sogBonus stacks with airtight inside the REAL fold's decay.
 */
import { foldChips, payoutFor, sogNum, parseMove, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { proofKey } from './proofKey';
import { UPGRADES, SOG_BASE_NUM, AIRTIGHT_BONUS, SOG_DEN } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

let seq = 0;
/** A bank reply with an EXPLICIT nonce — the double dip keys on it. */
const bank = (bits: number, nonce: bigint, at: number): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${nonce.toString(16)}#${++seq}~`,
  block_height: 1, content_id: `c${seq}`, created_at: at,
});
const buy = (key: string, at: number): ChipsReply => ({
  author_id: A, body: `buy ${key}#${++seq}~`,
  block_height: 1, content_id: `c${seq}`, created_at: at,
});
const verify = (rs: ChipsReply[]) => {
  const m = new Map<string, number>();
  for (const r of rs) {
    const p = parseMove(r.body);
    if (p?.kind === 'bank') for (const c of p.chips) m.set(proofKey(TABLE, A, c.ms, c.nonce), c.bits);
  }
  return m;
};
const fold = (rs: ChipsReply[]) => foldChips(H, TABLE, rs, verify(rs));

// Funding preamble: enough crumbs to buy doubledip1 (600k) under bowl1's cap.
// bits 17 pays 1000*2^9 = 512,000 golden x2.5 = 1,280,000 — over the 100k
// starting cap, so bowl1 goes first on smaller banks.
const fund: ChipsReply[] = [
  bank(14, 1n, T0),            // 64,000
  buy('bowl1', T0 + 1),        // cap 3M, crumbs 4,000
  bank(17, 3n, T0 + 2),        // +1,280,000 (nonce 3: never procs anything)
];

// 1) LINKAGE + GATING: same bits, procing vs non-procing nonce, with dd1.
{
  const base = fold([...fund, buy('doubledip1', T0 + 3), bank(10, 5n, T0 + 4)]);
  const proc = fold([...fund, buy('doubledip1', T0 + 3), bank(10, 8n, T0 + 4)]);
  const b = base.moves[base.moves.length - 1], p = proc.moves[proc.moves.length - 1];
  check('non-procing nonce pays single', b.outcome === 'banked' && b.doubleDip === undefined, b);
  check('nonce % 4 == 0 pays EXACTLY double the single payout',
    p.outcome === 'banked' && p.crumbs === (b.crumbs ?? 0) * 2 && (b.crumbs ?? 0) > 0,
    { single: b.crumbs, doubled: p.crumbs });
  check('the doubled move is flagged doubleDip', p.doubleDip === true);
  check('lifetimeChips identical either way — luck mints no chips',
    base.lifetimeChips === proc.lifetimeChips, { base: base.lifetimeChips, proc: proc.lifetimeChips });
}

// 2) UNOWNED: the same procing nonce pays single without the upgrade.
{
  const s = fold([...fund, bank(10, 8n, T0 + 4)]);
  const m = s.moves[s.moves.length - 1];
  const expected = (() => {
    const pre = fold(fund);
    return payoutFor(pre, 10, T0 + 4);
  })();
  check('nonce % 4 == 0 without the upgrade pays single (payoutFor-linked)',
    m.outcome === 'banked' && m.crumbs === expected && m.doubleDip === undefined,
    { got: m.crumbs, expected });
}

// 3) DEEP DOUBLE DIP: mod 2 — evens proc (including multiples of 4), odds don't.
{
  // funding for dd2 (20M): a golden bits-21 chip pays 1000*2^13*5/2 = 10.24M
  // under bowl2's 200M cap.
  const fund2: ChipsReply[] = [
    ...fund, buy('doubledip1', T0 + 3),
    bank(21, 5n, T0 + 4), buy('bowl2', T0 + 5), bank(21, 7n, T0 + 6), bank(21, 9n, T0 + 7),
  ];
  const owned = fold([...fund2, buy('doubledip2', T0 + 8)]);
  check('doubledip2 bought after doubledip1', owned.moves[owned.moves.length - 1].outcome === 'bought');
  const even = fold([...fund2, buy('doubledip2', T0 + 8), bank(10, 6n, T0 + 9)]);
  const odd = fold([...fund2, buy('doubledip2', T0 + 8), bank(10, 7n, T0 + 9)]);
  const e = even.moves[even.moves.length - 1], o = odd.moves[odd.moves.length - 1];
  check('mod 2: even nonce procs', e.doubleDip === true && e.crumbs === (o.crumbs ?? 0) * 2, { e: e.crumbs, o: o.crumbs });
  check('mod 2: odd nonce does not', o.doubleDip === undefined);
}

// 4) CHAIN GATING for every new rung.
{
  const s = fold([...fund, buy('doubledip2', T0 + 3)]);
  check('doubledip2 before doubledip1 is rejected-order',
    s.moves[s.moves.length - 1].outcome === 'rejected-order');
  const d = fold([...fund, bank(21, 5n, T0 + 4), buy('detector2', T0 + 5)]);
  check('detector2 before detector is rejected-order',
    d.moves[d.moves.length - 1].outcome === 'rejected-order');
  const s6 = fold([...fund, bank(21, 5n, T0 + 4), buy('season1', T0 + 5), buy('season6', T0 + 6)]);
  check('season6 straight after season1 is rejected-order',
    s6.moves[s6.moves.length - 1].outcome === 'rejected-order');
}

// 5) APPEND SAFETY: the historical prefix folds exactly as before the append —
//    season1..season5 in order all still buy. This is the re-scoring pin: if
//    appending season6 (or chaining detector) had disturbed prefix validation,
//    THIS is the test that fails.
{
  const rs: ChipsReply[] = [
    ...fund,
    bank(21, 5n, T0 + 4), buy('bowl2', T0 + 5),
    bank(24, 7n, T0 + 6),                       // 1000*2^16*5/2 = 163.84M -> capped at 200M w/ prior
    buy('season1', T0 + 7), buy('season2', T0 + 8), buy('season3', T0 + 9),
    buy('season4', T0 + 10), buy('season5', T0 + 11),
    buy('detector', T0 + 12),
  ];
  const s = fold(rs);
  const outcomes = s.moves.filter((m) => m.upgradeKey).map((m) => `${m.upgradeKey}:${m.outcome}`);
  check('the pre-append purchase history still folds clean',
    outcomes.every((o) => o.endsWith(':bought')), outcomes);
  check('season5 still lands its multiplier', s.seasoningNum === 6 && s.seasoningDen === 1);

  // and the new tail rungs work when taken in order, with their effects
  const s2 = fold([...rs, bank(24, 9n, T0 + 13), buy('season6', T0 + 14), buy('detector2', T0 + 15)]);
  const tail = s2.moves.filter((m) => m.upgradeKey === 'season6' || m.upgradeKey === 'detector2');
  check('season6 and detector2 buy in order at the tail',
    tail.every((m) => m.outcome === 'bought'), tail);
  check('season6 applies x9', s2.seasoningNum === 9);
  check('detector2 lowers golden to 14', s2.goldenBits === 14);
}

// 6) CELLAR: sogBonus stacks with airtight inside the real fold's decay.
{
  const rs: ChipsReply[] = [
    ...fund,
    bank(21, 5n, T0 + 4),                        // 10.24M banked -> can afford cellar under 3M cap? no —
    buy('bowl2', T0 + 5),                        // widen first (2M), then re-fund
    bank(21, 7n, T0 + 6),
    buy('airtight', T0 + 7), buy('cellar', T0 + 8),
  ];
  const s = fold(rs);
  check('cellar bought', s.moves[s.moves.length - 1].outcome === 'bought');
  check('sogNum = base + airtight + cellar', sogNum(s) === SOG_BASE_NUM + AIRTIGHT_BONUS + 2, sogNum(s));

  // one decay hour through the REAL fold: a clock-advancing rejected buy
  const before = s.crumbs;
  const after = fold([...rs, { author_id: A, body: `buy nosuch#${++seq}~`, block_height: 1, content_id: `c${seq}`, created_at: T0 + 8 + HOUR } as ChipsReply]);
  const expected = Math.floor((before * (SOG_BASE_NUM + AIRTIGHT_BONUS + 2)) / SOG_DEN);
  check('one fold hour decays at the stacked numerator', after.crumbs === expected, { got: after.crumbs, expected, before });
}

// 6b) sogBonus ADDITIVITY. Only one sogBonus upgrade exists today, so "+=" vs
//     "=" is unobservable through the real catalog — this pins the documented
//     stacking contract against the day a second one ships, by registering a
//     synthetic second source for the duration of this block. Each test file
//     runs in its own process, so the mutation cannot leak.
{
  (UPGRADES as Record<string, (typeof UPGRADES)[string]>)['testshelf'] =
    { key: 'testshelf', label: 'Test Shelf', cost: 1, sogBonus: 3 };
  const s = fold([
    ...fund,
    bank(21, 5n, T0 + 4), buy('bowl2', T0 + 5), bank(21, 7n, T0 + 6),
    buy('cellar', T0 + 7), buy('testshelf', T0 + 8),
  ]);
  delete (UPGRADES as Record<string, unknown>)['testshelf'];
  check('two sogBonus sources STACK (2 + 3), not replace', s.sogBonus === 5, s.sogBonus);
}

// 7) The constants themselves: mods are what the design says.
check('doubledip1 procs one chip in four', UPGRADES['doubledip1'].doubleDipMod === 4);
check('doubledip2 procs every other chip', UPGRADES['doubledip2'].doubleDipMod === 2);

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
