/**
 * THE MS A DIP CARRIES ON THE WIRE IS THE MOMENT IT WAS DIPPED, NEVER THE
 * MOMENT ITS CHIP WAS BORN. Run: npx tsx src/lib/cooking.dipms.test.ts
 *
 * `orderReplies` sorts on block_height first and falls back to the body's
 * authoring-ms — so for the whole window before a move is sealed, that ms IS
 * the fold's ordering key. Stamping it at chip birth replays a dip as though
 * it happened when the chip was CAST ON, i.e. before every upgrade bought
 * while it cooked. The longer the cook the further back it lands, so the
 * biggest dips are the ones that fold into a pre-upgrade bowl cap and are
 * silently eaten.
 *
 * Measured on mainnet table 5425dfcd (2026-08-02): two dips worth 5,857,616
 * and 1,376,288 folded to ZERO against a 3,000,000 cap that the player had
 * already raised to 200,000,000 — the app showed 636,369 where the sealed
 * chain says 7,870,273. Re-folding that table's real replies with every
 * block_height nulled reproduces 636,369 exactly.
 *
 * createMsAllocator (2026-07-27, #143) already made these values track the
 * wall clock for exactly this reason; the basket dip path just never took a
 * fresh one, while `broke`, `spend`, `burn` and the crew payouts all do.
 */
import { dipFor, freshChip, createMsAllocator, type CookingChip } from './cooking';
import { foldChips, type ChipsReply, type ChipsHeader } from './chipsEngine';
import { dipBody, buyBody } from './chipsBody';
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

/** UNSEALED, deliberately: block_height null is the whole bug window. Every
 *  reply shares one bucket, so authoring-ms alone decides the order. */
let seq = 0;
const pending = (body: string): ChipsReply => ({
  author_id: A, body, block_height: null, content_id: `c${++seq}`, created_at: T0,
});

// ── 1) The contract: the wire ms comes from the allocator, not the chip ──────
{
  const chip: CookingChip = { ms: T0, pot: 500, crackles: 0, cookedMs: 900_000 };
  const DIPPED_AT = T0 + 900_000;
  const r = dipFor(chip, 0, () => 1, () => DIPPED_AT);
  check('the wire ms is the moment of the dip', r.ms === DIPPED_AT, { got: r.ms, want: DIPPED_AT });
  check('the chip birth ms is still reported, for cook duration', r.chipMs === T0, r.chipMs);
  check('a long cook makes them differ', r.ms !== r.chipMs);
  check('pot and cookedMs still ride along', r.pot === 500 && r.cookedMs === 900_000, r);
}

// ── 2) A newborn dipped instantly still gets a sane, non-decreasing ms ──────
{
  const alloc = createMsAllocator(T0);
  const chip = freshChip(alloc());
  const r = dipFor({ ...chip, pot: 10 }, 0, () => 1, alloc);
  check('wire ms is strictly after the birth ms even with no cook', r.ms > r.chipMs, r);
}

// ── 3) THE REGRESSION, end to end through the real body builder and fold ────
// A chip cast on at T0, a Bigger Bowl bought ten minutes later, and the chip
// dipped five minutes after THAT. The dip must land after the upgrade.
{
  const CAST_ON = T0;
  const BOUGHT_BOWL = T0 + 600_000;
  const DIPPED = T0 + 900_000;
  const BIG = 2_000_000;             // more than START_BOWL_CAP, less than bowl1's

  const chip: CookingChip = { ms: CAST_ON, pot: BIG, crackles: 0, cookedMs: 900_000 };
  const r = dipFor(chip, 0, () => 1, () => DIPPED);

  const replies = [
    // Fill the bowl to just under the starting cap first, so a dip folded
    // before the upgrade has nowhere to go and is clamped away.
    pending(dipBody(900_000, T0 - 1_000)),
    pending(buyBody('bowl1', BOUGHT_BOWL)),
    pending(dipBody(r.amount, r.ms)),
  ];
  const s = foldChips(H, TABLE, replies, new Map());

  const afterFill = Math.min(900_000, START_BOWL_CAP);
  const want = afterFill - UPGRADES.bowl1.cost + BIG;
  check('the long-cooked dip is credited in full, not eaten by the old cap',
    s.crumbs === want, { got: s.crumbs, want });
  check('the bowl really was raised before it landed', s.bowlCap === UPGRADES.bowl1.bowlCap, s.bowlCap);
  check('nothing was rejected', s.moves.every((m) => !m.outcome.startsWith('rejected')),
    s.moves.map((m) => m.outcome));

  // The bug this pins: stamping the body with the CHIP'S BIRTH instead sorts
  // the dip ahead of the upgrade and the cap eats it.
  const buggy = foldChips(H, TABLE, [
    pending(dipBody(900_000, T0 - 1_000)),
    pending(buyBody('bowl1', BOUGHT_BOWL)),
    pending(dipBody(r.amount, chip.ms)),   // <- birth-ms stamping
  ], new Map());
  check('(control) birth-ms stamping really does lose it',
    buggy.crumbs === START_BOWL_CAP - UPGRADES.bowl1.cost,
    { got: buggy.crumbs, lost: want - buggy.crumbs });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
