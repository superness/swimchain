/**
 * The `dip` verb — the pot-x-multi game's self-declared cash-out — through
 * the REAL parse and fold. Run: npx tsx src/lib/chipsEngine.dipverb.test.ts
 *
 * Cookie-Clicker honesty is the DESIGN (operator decision, 2026-07-27), so
 * these tests pin what little the fold still enforces: parse bounds, the
 * bowl-cap clamp, lifetime pacing, coexistence with legacy banks, and the
 * settling identity that retires a queued dip when its confirmed twin lands.
 */
import { foldChips, parseMove, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { dipBody } from './chipsBody';
import { moveKey, confirmedMoveKeys } from './chipsSettling';
import { proofKey } from './proofKey';
import { START_BOWL_CAP, UPGRADES } from './chipsConst';

const A = 'a'.repeat(64);
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: A };
const TABLE = 'sha256:table';
const T0 = 1_700_000_000_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

let seq = 0;
const reply = (body: string, at: number): ChipsReply => ({
  author_id: A, body, block_height: 1, content_id: `c${++seq}`, created_at: at,
});
const dip = (amount: number, ms: number, at: number): ChipsReply => reply(dipBody(amount, ms), at);

// 1) PARSE: round-trips through dipBody, and the bounds hold.
{
  const p = parseMove(dipBody(56_000, 12345));
  check('dip parses to its declared amount and ms',
    p?.kind === 'dip' && p.amount === 56_000 && p.ms === 12345, p);
  check('a 16-digit amount is rejected at parse', parseMove('dip 1234567890123456#5~') === null);
  check('a negative amount never parses', parseMove('dip -5#5~') === null);
  check('a non-numeric amount never parses', parseMove('dip abc#5~') === null);
}

// 2) FOLD: crumbs land, capped by the bowl; lifetime paces on chip-equivalents.
{
  const s = foldChips(H, TABLE, [dip(56_000, 1, T0)], new Map());
  check('a dip credits its amount', s.crumbs === 56_000, s.crumbs);
  check('lifetime advances by amount/1000', s.lifetimeChips === 56, s.lifetimeChips);
  check("the move records outcome 'dipped' with the amount",
    s.moves[0].outcome === 'dipped' && s.moves[0].crumbs === 56_000 && s.moves[0].ms === 1, s.moves[0]);

  const big = foldChips(H, TABLE, [dip(999_999_999_999_999, 2, T0)], new Map());
  check('the bowl cap clamps storage (Cookie Clicker, not infinite-money glitch)',
    big.crumbs === START_BOWL_CAP, big.crumbs);
  check('a tiny dip still counts one chip of lifetime',
    foldChips(H, TABLE, [dip(3, 3, T0)], new Map()).lifetimeChips === 1);
}

// 3) COEXISTENCE: legacy verified banks and new dips fold in one table.
{
  const bank = reply(`bank 10 ff#${T0}~`, T0);
  const v = new Map([[proofKey(TABLE, A, T0, 0xffn), 10]]);
  // The dip's ms must sort AFTER the bank's authoring ms (orderReplies ties
  // on authoring ms) — a tiny ms like 7 would fold the dip FIRST.
  const s = foldChips(H, TABLE, [bank, dip(5_000, T0 + 500, T0 + 1000)], v);
  check('legacy bank still pays under the old rules', s.moves[0].outcome === 'banked' && s.moves[0].crumbs === 4_000, s.moves[0]);
  check('the dip stacks on top', s.crumbs === 9_000, s.crumbs);
}

// 4) A dip can buy — the whole point of the amount being real crumbs.
{
  const s = foldChips(H, TABLE, [dip(20_000, 1, T0), reply(`buy season1#${T0 + 1}~`, T0 + 1)], new Map());
  check('a dip funds a purchase', s.owned.has('season1') && s.crumbs === 20_000 - UPGRADES.season1.cost, { crumbs: s.crumbs });
}

// 5) SETTLING IDENTITY: a queued dip's key matches its confirmed twin's, so
//    the settling machinery retires it (and only it).
{
  const qd = { id: 1, tableId: TABLE, author: A, kind: 'dip' as const, amount: 56_000, ms: 4242 };
  const confirmed = confirmedMoveKeys([dip(56_000, 4242, T0)], TABLE, A);
  check('queued dip key matches its confirmed reply', confirmed.has(moveKey(qd)));
  const other = confirmedMoveKeys([dip(56_000, 999, T0)], TABLE, A);
  check('a different ms does NOT match', !other.has(moveKey(qd)));
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
