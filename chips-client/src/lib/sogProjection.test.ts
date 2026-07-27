/**
 * The display projection must agree with the REAL fold, exactly.
 *
 * A bowl render that drifts from `applySog` is a UI that lies about the
 * player's balance, and it drifts silently — nothing crashes, the number is
 * just wrong. So the load-bearing assertion here is not "the arithmetic is
 * 97/100"; it is "fold a gap, and project the same gap, and get the SAME
 * integer." Restating the formula would pass even if `applySog` changed.
 *
 * Run: npx tsx src/lib/sogProjection.test.ts
 */
import { foldChips, parseMove, type ChipsReply, type ChipsHeader, type ChipsState } from './chipsEngine';
import { projectedCrumbs, soggyLook } from './sogProjection';
import { proofKey } from './proofKey';
import { SOG_MAX_HOURS, DIP_TIERS, START_BOWL_CAP } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const HOUR = 3_600_000;
const T0 = 1_700_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

let nonceSeq = 0;
const bank = (bits: number, cid: string, at: number): ChipsReply => ({
  author_id: A, body: `bank ${bits} ${(++nonceSeq).toString(16)}#${at}~`,
  block_height: 1, content_id: cid, created_at: at,
});
/**
 * A confirmed move that advances the decay clock without changing crumbs:
 * `season5` costs 50M and is chain-gated behind season1..4, so it always folds
 * as a rejection — but the clock advance in foldChips happens BEFORE the buy is
 * evaluated, so the sog still runs. That is what lets us read the fold's own
 * decay of a known bowl over a known gap.
 */
const clockOnly = (cid: string, at: number): ChipsReply => ({
  author_id: A, body: `buy season5#${at}~`,
  block_height: 2, content_id: cid, created_at: at,
});
/** proofKey for a single-chip (v1) fixture reply, derived from its own body. */
const keyFor = (r: ChipsReply): string => {
  const p = parseMove(r.body);
  if (p?.kind !== 'bank') throw new Error('keyFor: not a bank reply: ' + r.body);
  return proofKey(TABLE, r.author_id, p.chips[0].ms, p.chips[0].nonce);
};
const vAll = (rs: ChipsReply[], bits: number) =>
  new Map(rs.filter((r) => r.body.startsWith('bank')).map((r) => [keyFor(r), bits]));

// 1) THE LINKAGE TEST: project a gap, fold the same gap, demand the same integer.
for (const gapHours of [1, 5, 50, 200]) {
  const b = bank(14, `g${gapHours}a`, T0);
  const before = foldChips(H, TABLE, [b], vAll([b], 14));
  const after = foldChips(H, TABLE, [b, clockOnly(`g${gapHours}b`, T0 + gapHours * HOUR)], vAll([b], 14));
  const projected = projectedCrumbs(before, T0 + gapHours * HOUR);
  check(
    `projection matches the fold over ${gapHours}h`,
    projected === after.crumbs,
    { projected, folded: after.crumbs, from: before.crumbs }
  );
  // Guard against a vacuous pass: the gap must actually have decayed something.
  check(`${gapHours}h gap actually decayed`, after.crumbs < before.crumbs, { before: before.crumbs, after: after.crumbs });
}

// 2) Sub-hour gaps are a no-op in both, and so is a backwards clock.
{
  const b = bank(14, 'h1', T0);
  const before = foldChips(H, TABLE, [b], vAll([b], 14));
  check('59 minutes projects unchanged', projectedCrumbs(before, T0 + HOUR - 1) === before.crumbs);
  check('a clock behind lastConfirmedAt projects unchanged', projectedCrumbs(before, T0 - 5 * HOUR) === before.crumbs);
}

// 3) THE BUG THE BRIEF'S DRAFT HAD: with no confirmed move there is no clock, so
//    the fold applies no decay — the projection must not invent one from epoch 0.
{
  const pending: ChipsReply = {
    author_id: A, body: `bank 14 abc#${T0}~`,
    block_height: null, content_id: 'p1', created_at: T0,
  };
  const s = foldChips(H, TABLE, [pending], new Map([[keyFor(pending), 14]]));
  check('pending-only bank leaves the clock at 0', s.lastConfirmedAt === 0, s.lastConfirmedAt);
  check('pending-only bank has crumbs', s.crumbs > 0, s.crumbs);
  check(
    'no confirmed clock projects unchanged (not clamped away to nothing)',
    projectedCrumbs(s, Date.now()) === s.crumbs,
    { projected: projectedCrumbs(s, Date.now()), crumbs: s.crumbs }
  );
}

// 4) The clamp: past SOG_MAX_HOURS nothing more rots. Observable only where a
//    positive remainder survives 720 hours — `airtight` (99/100) does, the base
//    rate does not (see chipsEngine.sog.test.ts block 2's note).
{
  const s: ChipsState = {
    crumbs: 1_000_000_000, lifetimeChips: 0, crispest: 0, owned: new Set(['airtight']),
    bowlCap: 5_000_000_000, seasoningNum: 1, seasoningDen: 1, fryers: 1,
    goldenBits: 16, airtight: true, sogBonus: 0, doubleDipMod: 0, dipIndex: 0,
    lastConfirmedAt: T0, lastBankAt: T0, unverifiedBanks: 0, moves: [],
  };
  const atClamp = projectedCrumbs(s, T0 + SOG_MAX_HOURS * HOUR);
  const past = projectedCrumbs(s, T0 + (SOG_MAX_HOURS + 500) * HOUR);
  check('clamp leaves a positive remainder (so this is not vacuous)', atClamp > 0, atClamp);
  check('nothing rots past SOG_MAX_HOURS', past === atClamp, { atClamp, past });
  check('one hour short of the clamp is still rotting', projectedCrumbs(s, T0 + (SOG_MAX_HOURS - 1) * HOUR) > atClamp);
}

// 5) The dip tier sets the base numerator, airtight then adds — same fixed order
//    as the fold's `sogNum`. Guacamole rots faster (96) than Plain Salsa (97).
{
  const base = (dipIndex: number, airtight: boolean): ChipsState => ({
    crumbs: START_BOWL_CAP, lifetimeChips: 0, crispest: 0, owned: new Set(),
    bowlCap: START_BOWL_CAP, seasoningNum: 1, seasoningDen: 1, fryers: 1,
    goldenBits: 16, airtight, sogBonus: 0, doubleDipMod: 0, dipIndex, lastConfirmedAt: T0, lastBankAt: T0,
    unverifiedBanks: 0, moves: [],
  });
  check('guacamole really does declare a faster sog', DIP_TIERS[1].sogNum === 96, DIP_TIERS[1].sogNum);
  const salsa = projectedCrumbs(base(0, false), T0 + 10 * HOUR);
  const guac = projectedCrumbs(base(1, false), T0 + 10 * HOUR);
  check('guacamole rots faster than plain salsa', guac < salsa, { salsa, guac });
  const sealed = projectedCrumbs(base(0, true), T0 + 10 * HOUR);
  check('airtight rots slower than open', sealed > salsa, { salsa, sealed });
}

// 6) The look is continuous where the count is quantised — that is the whole
//    point of having a separate signal for it.
{
  const s: ChipsState = {
    crumbs: 10_000, lifetimeChips: 0, crispest: 0, owned: new Set(),
    bowlCap: START_BOWL_CAP, seasoningNum: 1, seasoningDen: 1, fryers: 1,
    goldenBits: 16, airtight: false, sogBonus: 0, doubleDipMod: 0, dipIndex: 0, lastConfirmedAt: T0,
    lastBankAt: T0, unverifiedBanks: 0, moves: [],
  };
  check('freshly moved looks crisp', soggyLook(s, T0) === 0);
  const halfHour = soggyLook(s, T0 + HOUR / 2);
  check('the pile looks softer before the first hour boundary', halfHour > 0, halfHour);
  check('...while the count has not moved yet', projectedCrumbs(s, T0 + HOUR / 2) === s.crumbs);
  check('the look saturates at 1', soggyLook(s, T0 + 1000 * HOUR) === 1);
  check('the look is monotonic', soggyLook(s, T0 + 5 * HOUR) > soggyLook(s, T0 + 4 * HOUR));
}

console.log(failures === 0 ? '\nsogProjection: PASS' : `\nsogProjection: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
