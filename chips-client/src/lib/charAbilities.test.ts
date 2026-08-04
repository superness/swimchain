/**
 * WHAT CHAR ACTUALLY BUYS.
 *
 * charSpend.test.ts proves you can buy an ability. This proves owning one
 * CHANGES something — the failure mode being that a purchase records itself,
 * costs a grain, and does nothing at all, which is exactly the "I got nothing
 * from that" this whole feature exists to fix.
 *
 * Only the two that touch shared state are here. The Magma is measured through
 * the real tick in scripts/magmareal.mjs (a boolean test would say nothing
 * about whether it is worth 13 grains).
 *
 * Run: npx tsx src/lib/charAbilities.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { projectedCrumbs, soggyLook } from './sogProjection';
import { UPGRADES, deepBandFloor, START_BOWL_CAP, CHAR_ABILITIES } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const HEADER = { v: 1, kind: 'chips-table', name: 't', owner: ME } as ChipsHeader;
let n = 0;
const reply = (body: string): ChipsReply => ({
  content_id: `c${++n}`, author_id: ME, body: `${body}#${1700000000000 + n * 1000}~`,
  created_at: 1700000000000 + n * 1000, block_height: 1,
} as ChipsReply);
const fold = (rs: ChipsReply[]) => foldChips(HEADER, 'T', rs, new Map());

/** Break band 0 (one grain), buy The Crack, and own bowl1 + bowl2. */
function withCrack(): ChipsReply[] {
  return [
    reply(`dip ${deepBandFloor(0) * 1000}`),
    reply('broke 1'),
    reply('spend crack 1'),
    reply('buy bowl1'),
    reply('buy bowl2'),
  ];
}

/* ── THE CRACK — one jar survives the bowl ─────────────────────────────── */
{
  // Without it, a tip naming a jar keeps nothing. This is the control that
  // makes the next block mean something.
  const plain = fold([
    reply(`dip ${deepBandFloor(0) * 1000}`),
    reply('buy bowl1'),
    reply('tip bowl1'),
  ]);
  check('without the crack, a named jar is NOT kept', !plain.owned.has('bowl1'), [...plain.owned]);
  check('...and the bowl is back to the starting cap', plain.bowlCap === START_BOWL_CAP, plain.bowlCap);

  const kept = fold([...withCrack(), reply('tip bowl2')]);
  check('the crack keeps the named jar', kept.owned.has('bowl2'), [...kept.owned]);
  check('and only that one', kept.owned.size === 1, [...kept.owned]);
  // THE POINT: the jar's EFFECT comes with it, not just its name in a list.
  check('its effect comes with it', kept.bowlCap === UPGRADES.bowl2.bowlCap,
    { cap: kept.bowlCap, want: UPGRADES.bowl2.bowlCap });
  check('the run still resets otherwise', kept.lifetimeChips === 0 && kept.crumbs === 0,
    { life: kept.lifetimeChips, crumbs: kept.crumbs });

  // You cannot keep what you never had.
  const cheat = fold([...withCrack(), reply('tip fryer4')]);
  check('a jar you never owned cannot be kept', !cheat.owned.has('fryer4'), [...cheat.owned]);

  // And the ability itself survives, so the NEXT bowl can keep one too.
  check('the crack survives its own tip', kept.charOwned.has('crack'), [...kept.charOwned]);
}

/* ── THE TILE — crumbs stop going soft ─────────────────────────────────── */
{
  const base = fold([reply('dip 5000000')]);
  const DAY = 24 * 3_600_000;
  const later = (base.lastConfirmedAt || 1700000000000) + 3 * DAY;

  check('without the tile, three days of sog eats the bowl',
    projectedCrumbs(base, later) < base.crumbs,
    { was: base.crumbs, now: projectedCrumbs(base, later) });

  const tiled = { ...base, charOwned: new Set([...base.charOwned, 'tile']) };
  check('with the tile, nothing goes soft',
    projectedCrumbs(tiled, later) === tiled.crumbs,
    { was: tiled.crumbs, now: projectedCrumbs(tiled, later) });

  // And it must not LOOK soft either — a pile that slumps while the number
  // never moves reads as a bug.
  check('without it, the pile looks soggy', soggyLook(base, later) > 0.9, soggyLook(base, later));
  check('with it, the pile never slumps', soggyLook(tiled, later) === 0, soggyLook(tiled, later));
}

// ---------------------------------------------------------------------------
// SCOOP ONLY CALLS YOU OVER IF HE HAS SOMETHING YOU CAN TAKE.
//
// The call banner stood on `char > 0`, which is a different question from "can
// you buy anything". The operator finished the table holding 2 grains and
// already owning The Crack (cost 1); the cheapest thing left is The Grain at 3.
// So the banner sat there reading "he is looking at your 2 grains" and pointing
// at a shop with nothing buyable in it — and being a BANNER rather than a modal
// there was nothing to close: "he wants me to buy something, I have 2 grains, I
// can buy nothing - he doesn't close his popup asking me to buy something."
//
// This is the rule every other critter already follows (`dealIds`): a price tag
// appears when you can pay it. Scoop was the one shouting on credit.
{
  const affordable = (char: number, owned: string[]): boolean =>
    Object.values(CHAR_ABILITIES).some((a) => !owned.includes(a.key) && char >= a.cost);

  check('THE REPORTED CASE: 2 grains, owns crack -> no call', affordable(2, ['crack']) === false);
  check('3 grains, owns crack -> the grain is reachable, call', affordable(3, ['crack']) === true);
  check('0 grains -> no call', affordable(0, []) === false);
  check('1 grain, owns nothing -> the crack is reachable, call', affordable(1, []) === true);
  check('everything owned, grains to spare -> no call',
    affordable(99, Object.values(CHAR_ABILITIES).map((a) => a.key)) === false);

  // And the component must ask THAT question, not the old one.
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.tsx'), 'utf8');
  check('the banner is gated on affordability', app.includes('{state && scoopHasDeal && !scoopOpen'));
  check('...and not on char alone', !app.includes('{state && state.char > 0 && !scoopOpen'));
  check('scoopHasDeal weighs owned AND cost',
    app.includes('!state.charOwned.has(a.key) && state.char >= a.cost'));
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
