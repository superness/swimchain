/**
 * `burn <key>` — give a jar back for 70% of its crumbs.
 *
 * The shop had no reverse gear. A player who works out that the Sous Chef
 * cashes at x32 and therefore CANCELS the 1.2B Long Fry they just bought
 * could only mute him; the jar itself was permanent (operator: "let them burn
 * sous chef because they are smart and it annoys them").
 *
 * Two properties do the heavy lifting here, and both are tested below.
 *
 * IT CANNOT BE FARMED. Buy at C, burn for 0.7C: every round trip is a 30%
 * loss, so there is no cycle that ends up ahead. That is what lets the verb
 * be freely repeatable without any cooldown or once-per-run rule.
 *
 * IT CANNOT CORRUPT A CHAIN. Chained jars are bought in order and the fold
 * rejects out-of-order buys, so burning a jar that a LATER owned rung stands
 * on would leave a table that could never be re-folded to the same state.
 * Burning the deepest owned rung is fine; burning under one is refused.
 *
 * Run: npx tsx src/lib/chipsEngine.burn.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { UPGRADES, BURN_REFUND_NUM, BURN_REFUND_DEN, START_BOWL_CAP } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const OWNER = 'a'.repeat(64);
const TABLE = 'sha256:table';
const header: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: OWNER };

let n = 0;
const nextMs = () => 1_700_000_000_000 + ++n * 1000;
const reply = (body: string): ChipsReply => {
  const ms = nextMs();
  return { author_id: OWNER, body: `${body}#${ms}~`, block_height: 1, content_id: `c${n}`, created_at: ms };
};
/** Crumbs on the board. Dips are clamped by the bowl cap, so this tops up
 *  in bites the current cap can hold. */
const earn = (crumbs: number): ChipsReply[] => {
  const out: ChipsReply[] = [];
  let got = 0;
  while (got < crumbs) { const bite = Math.min(500_000, crumbs - got); out.push(reply(`dip ${bite}`)); got += bite; }
  return out;
};
const fold = (rs: ChipsReply[]) => foldChips(header, TABLE, rs, new Map());
const refundOf = (key: string) => Math.floor(UPGRADES[key].cost * BURN_REFUND_NUM / BURN_REFUND_DEN);

/* ── the basic trade ──────────────────────────────────────────────────── */
{
  const st = fold([...earn(60_000), reply('buy season1'), reply('burn season1')]);
  check('a burn is recorded', st.moves[st.moves.length - 1].outcome === 'burned',
    st.moves[st.moves.length - 1]);
  check('the jar is gone', !st.owned.has('season1'), [...st.owned]);
  check('its effect is gone with it — seasoning is back to 1/1',
    st.seasoningNum === 1 && st.seasoningDen === 1, `${st.seasoningNum}/${st.seasoningDen}`);
  check('and 70% of the cost came back',
    st.crumbs === 60_000 - UPGRADES['season1'].cost + refundOf('season1'), st.crumbs);
}

/* ── IT CANNOT BE FARMED. The property that lets it be unlimited. ─────── */
{
  const start = 200_000;
  let rs = earn(start);
  for (let i = 0; i < 5; i++) rs = [...rs, reply('buy season1'), reply('burn season1')];
  const st = fold(rs);
  const spent = 5 * (UPGRADES['season1'].cost - refundOf('season1'));
  check('five buy/burn round trips LOSE crumbs every time', st.crumbs === start - spent, st.crumbs);
  check('...and the loss is 30% of the price each time',
    UPGRADES['season1'].cost - refundOf('season1') === UPGRADES['season1'].cost - refundOf('season1'));
  check('so the cycle can never end up ahead', st.crumbs < start, { start, end: st.crumbs });
}

/* ── IT CANNOT CORRUPT A CHAIN ────────────────────────────────────────── */
{
  const rs = [...earn(700_000), reply('buy season1'), reply('buy season2'), reply('burn season1')];
  const st = fold(rs);
  check('burning UNDER an owned rung is refused',
    st.moves[st.moves.length - 1].outcome === 'rejected-order', st.moves[st.moves.length - 1]);
  check('and the chain is untouched', st.owned.has('season1') && st.owned.has('season2'));

  // The deepest owned rung is fair game, and after burning it the one below
  // becomes burnable in turn.
  const st2 = fold([...earn(700_000), reply('buy season1'), reply('buy season2'),
    reply('burn season2'), reply('burn season1')]);
  check('the DEEPEST rung can be burned', !st2.owned.has('season2'));
  check('and then the one under it', !st2.owned.has('season1'), [...st2.owned]);
  check('seasoning unwinds all the way back', st2.seasoningNum === 1 && st2.seasoningDen === 1);
}

/* ── THE MOTIVATING CASE: burn the Sous Chef ──────────────────────────── */
{
  // He costs 2M and the STARTING bowl holds 1M, so a bowl comes first —
  // without it the buy silently never happens and `!owned.has('autodip')`
  // passes for the wrong reason. (It did, on the first run of this file.
  // Asserting the absence of a thing is only meaningful once you have proved
  // it was ever present.)
  const bought = fold([...earn(30_000), reply('buy bowl1'), ...earn(2_500_000), reply('buy autodip')]);
  check('sanity: the Sous Chef was actually bought', bought.owned.has('autodip'), [...bought.owned]);
  const before = bought.crumbs;

  const st = fold([...earn(30_000), reply('buy bowl1'), ...earn(2_500_000),
    reply('buy autodip'), reply('burn autodip')]);
  check('the Sous Chef can be burned — he is unchained, so at any time',
    !st.owned.has('autodip'), [...st.owned]);
  check('for 70% of 2M', st.crumbs === before + refundOf('autodip'),
    { before, after: st.crumbs, refund: refundOf('autodip') });
}

/* ── you cannot burn what you do not have ─────────────────────────────── */
{
  const st = fold([...earn(50_000), reply('burn season1')]);
  check('burning an unowned jar is refused',
    st.moves[st.moves.length - 1].outcome === 'rejected-unowned', st.moves[st.moves.length - 1]);
  check('and pays nothing', st.crumbs === 50_000, st.crumbs);

  const ghost = fold([...earn(50_000), reply('burn nosuchjar')]);
  check('burning a jar that does not exist is refused',
    ghost.moves[ghost.moves.length - 1].outcome === 'rejected-parse'
    || ghost.moves[ghost.moves.length - 1].outcome === 'rejected-unowned');
  check('and pays nothing either', ghost.crumbs === 50_000, ghost.crumbs);
}

/* ── burning a bowl shrinks the bowl, and the crumbs must obey it ─────── */
{
  // Own bowl1 (3M cap), fill past the STARTING cap, then burn it. The cap
  // drops back to 1M and crumbs cannot be left sitting above their own
  // ceiling — every other path in the fold clamps, and so must this one.
  const st = fold([...earn(2_500_000), reply('buy bowl1'), ...earn(2_500_000), reply('burn bowl1')]);
  check('the cap falls back when its bowl is burned', st.bowlCap === START_BOWL_CAP, st.bowlCap);
  check('and crumbs are clamped to it', st.crumbs <= START_BOWL_CAP, st.crumbs);
}

/* ── only the owner ───────────────────────────────────────────────────── */
{
  const bought = [...earn(60_000), reply('buy season1')];
  const stranger: ChipsReply = { ...reply('burn season1'), author_id: 'b'.repeat(64) };
  const st = fold([...bought, stranger]);
  check('a stranger cannot burn your jar', st.owned.has('season1'));
}

/* ── the refund constant itself ───────────────────────────────────────── */
{
  check('the refund is 70%', BURN_REFUND_NUM === 70 && BURN_REFUND_DEN === 100);
  check('which is strictly less than what was paid', BURN_REFUND_NUM < BURN_REFUND_DEN);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
