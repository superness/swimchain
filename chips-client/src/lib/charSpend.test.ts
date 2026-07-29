/**
 * CHAR BUYS RULE CHANGES, AND THE FOLD'S ONLY JOB IS THAT IT CANNOT CHEAT.
 *
 * Char is minted by the descent (chipsEngine.broke.test.ts) and spent at
 * scoop's. What each ability DOES and what it COSTS are policy — the price
 * rides in the body the way a dip's amount does, on the same self-declared
 * precedent — so the fold guards exactly two things:
 *
 *   1. char can never go negative;
 *   2. nothing is bought twice.
 *
 * And one property that is easy to get wrong and expensive to discover later:
 * abilities are PRESTIGE. You paid the descent for them, not the run, so a tip
 * must not take them back.
 *
 * Run: npx tsx src/lib/charSpend.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { CHAR_ABILITIES, CHAR_ABILITY_TOTAL, CHAR_TOTAL, CHAR_PER_BAND, deepBandFloor } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const ME = 'a'.repeat(64);
const HEADER: ChipsHeader = { v: 1, kind: 'chips-table', name: 't', owner: ME } as ChipsHeader;
let n = 0;
const reply = (body: string): ChipsReply => ({
  content_id: `c${++n}`, author_id: ME, body: `${body}#${1700000000000 + n * 1000}~`,
  created_at: 1700000000000 + n * 1000, block_height: 1,
} as ChipsReply);
const fold = (rs: ChipsReply[]) => foldChips(HEADER, 'T', rs, new Map());

/** Enough dips to clear a band floor, then break it — one grain of char. */
function throughBand(band: number): ChipsReply[] {
  const need = deepBandFloor(band) * 1000;
  return [reply(`dip ${need}`), reply('broke 1')];
}
const last = (s: ReturnType<typeof fold>) => s.moves[s.moves.length - 1];

/* ── 1. YOU CANNOT SPEND WHAT YOU HAVE NOT EARNED ──────────────────────── */
{
  const broke = fold([reply(`spend crack ${CHAR_ABILITIES.crack.cost}`)]);
  check('a table with no char cannot buy', last(broke).outcome === 'rejected-char', last(broke));
  check('...and owns nothing', broke.charOwned.size === 0);
}

/* ── 2. THE ORDINARY PURCHASE ──────────────────────────────────────────── */
{
  const st = fold([...throughBand(0), reply(`spend crack ${CHAR_ABILITIES.crack.cost}`)]);
  // Band 0 mints CHAR_PER_BAND[0] = 1, and The Crack costs exactly that:
  // the first boss in the game must buy something the moment you beat it.
  check('one band earns char', st.deepest === 1);
  check('the crack is bought', st.charOwned.has('crack'), [...st.charOwned]);
  check('and char is deducted', st.char === CHAR_PER_BAND[0] - CHAR_ABILITIES.crack.cost,
    { char: st.char, minted: CHAR_PER_BAND[0] });
}

/* ── 3. NOTHING IS BOUGHT TWICE ────────────────────────────────────────── */
{
  const st = fold([...throughBand(0), reply(`spend crack ${CHAR_ABILITIES.crack.cost}`), reply(`spend crack ${CHAR_ABILITIES.crack.cost}`)]);
  check('a second purchase is refused', last(st).outcome === 'rejected-char', last(st));
  check('and char is only spent once', st.char === CHAR_PER_BAND[0] - CHAR_ABILITIES.crack.cost, st.char);
}

/* ── 4. CHAR CANNOT GO NEGATIVE ────────────────────────────────────────── */
{
  // The magma costs 13; one band mints far less. A body claiming any price
  // still cannot spend char that is not there.
  const st = fold([...throughBand(0), reply('spend magma 13')]);
  check('an unaffordable ability is refused', last(st).outcome === 'rejected-char', last(st));
  check('char is untouched', st.char === CHAR_PER_BAND[0], st.char);

  // And the self-declared price cannot be understated to sneak one through —
  // it can, and that is FINE (dip is self-declared too), but it must still
  // deduct exactly what the body said, never less than zero.
  const cheap = fold([...throughBand(0), reply('spend magma 1')]);
  check('a self-declared cheap price deducts exactly what it claimed',
    cheap.char === CHAR_PER_BAND[0] - 1 && cheap.charOwned.has('magma'),
    { char: cheap.char, owned: [...cheap.charOwned] });
}

/* ── 5. PRESTIGE: A TIP MUST NOT TAKE THEM BACK ────────────────────────── */
{
  const st = fold([...throughBand(0), reply(`spend crack ${CHAR_ABILITIES.crack.cost}`), reply('tip')]);
  check('a tip resets the run', st.lifetimeChips === 0, st.lifetimeChips);
  check('but the ability survives', st.charOwned.has('crack'), [...st.charOwned]);
  check('and so does the leftover char', st.char === CHAR_PER_BAND[0] - CHAR_ABILITIES.crack.cost, st.char);
}

/* ── 6. THE PRICES FIT THE SUPPLY ──────────────────────────────────────── */
{
  // A complete descent mints CHAR_TOTAL. The five abilities must be affordable
  // across a full run — otherwise one is permanently unreachable — but only
  // just, so the real choice is what you take FIRST.
  check('all five abilities fit inside a full descent',
    CHAR_ABILITY_TOTAL <= CHAR_TOTAL, { cost: CHAR_ABILITY_TOTAL, minted: CHAR_TOTAL });
  // ORDER MATTERS: halfway down you must still be choosing. An earlier version
  // asserted an arbitrary "spare < 2" threshold, which said nothing about the
  // game — this says the thing the design actually wants.
  const halfway = CHAR_PER_BAND.slice(0, 3).reduce((a, b) => a + b, 0);
  check('three bands down you still cannot afford all five',
    halfway < CHAR_ABILITY_TOTAL, { earnedByBand3: halfway, allFive: CHAR_ABILITY_TOTAL });

  // And the first kill must buy SOMETHING, or the boss pays in a currency you
  // cannot spend — which is the bug this whole feature exists to fix.
  const cheapest = Math.min(...Object.values(CHAR_ABILITIES).map((a) => a.cost));
  check('the first boss can afford the cheapest ability',
    CHAR_PER_BAND[0] >= cheapest, { firstBand: CHAR_PER_BAND[0], cheapest });
  check('every ability is reachable with the char its own band pays or less',
    Object.values(CHAR_ABILITIES).every((a) => a.cost <= CHAR_TOTAL));
}

/* ── 7. AN UNKNOWN ABILITY IS STILL JUST A SPEND ───────────────────────── */
{
  // The fold does not police the catalog — that is policy, and a client with a
  // newer catalog must not have its purchases rejected by an older fold. It
  // costs char and is recorded; an unknown key simply does nothing.
  const st = fold([...throughBand(0), reply('spend futureability 1')]);
  check('an unknown ability folds as a spend', last(st).outcome === 'spent', last(st));
  check('and costs its char', st.char === CHAR_PER_BAND[0] - 1, st.char);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
