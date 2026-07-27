/**
 * THE BOTTOM OF THE BOWL — the `tip` verb and OLD SALT.
 *
 * The claims that matter, and why each is load-bearing:
 *   - salt is FOLD-DERIVED, never client-declared (a body carrying an amount
 *     would let anyone mint permanent prestige);
 *   - a tip resets the run completely but never the salt;
 *   - salt is sqrt-shaped, so TWO SHORT RUNS BEAT ONE LONG ONE — that is the
 *     entire reason tipping early is a real choice (operator's ask);
 *   - a shallow table cannot farm the ceremony.
 *
 * Run: npx tsx src/lib/chipsEngine.tip.test.ts
 */
import { foldChips, parseMove, saltFor, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { tipBody, dipBody, buyBody } from './chipsBody';
import { TIP_FLOOR, SALT_PER_TIP, START_BOWL_CAP } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const OWNER = 'a'.repeat(64);
const TABLE = 'sha256:table';
const header: ChipsHeader = { v: 1, kind: 'chips-table', name: 't', owner: OWNER };
let seq = 0;
const reply = (body: string): ChipsReply => ({
  content_id: `sha256:r${seq++}`, author_id: OWNER, body, block_height: 1, created_at: 1_700_000_000_000,
});
const fold = (bodies: string[]) => foldChips(header, TABLE, bodies.map(reply), new Map());

// 1) THE BODY CARRIES NO AMOUNT. This is the security property: salt is
//    permanent and compounds, so a self-declared one would be free money.
{
  const p = parseMove(tipBody(12345));
  check('tip parses', p?.kind === 'tip', p);
  check('the tip body has no amount field at all', tipBody(12345) === 'tip#12345~', tipBody(12345));
  check('a tip with an argument does NOT parse as a tip', parseMove('tip 99999#5~')?.kind !== 'tip');
}

// 2) A deep run tips: salt granted, everything else wiped.
{
  const st = fold([
    dipBody(9_000_000, 100),     // 9,000 lifetime — above the 4,000 floor
    buyBody('season1', 101),
    tipBody(102),
  ]);
  check('the buy happened before the tip', st.moves.some((m) => m.outcome === 'bought'));
  check('salt was granted', st.oldSalt > 0, st.oldSalt);
  check('salt matches saltFor(lifetime at the tip)', st.oldSalt === saltFor(9_000), { got: st.oldSalt, want: saltFor(9_000) });
  check('the tip is recorded with its salt', st.moves.some((m) => m.outcome === 'tipped' && m.salt === st.oldSalt));
  check('crumbs are gone', st.crumbs === 0, st.crumbs);
  check('lifetime is gone', st.lifetimeChips === 0, st.lifetimeChips);
  check('the shelf is gone', st.owned.size === 0);
  check('the bowl is a starting bowl again', st.bowlCap === START_BOWL_CAP);
  check('seasoning is back to 1', st.seasoningNum === 1 && st.seasoningDen === 1);
  check('one fryer again', st.fryers === 1);
  check('back at the surface', st.dipIndex === 0);
  check('the tip is counted', st.tips === 1);
}

// 3) SALT SURVIVES THE NEXT RUN AND ACCUMULATES — the whole point.
{
  const st = fold([
    dipBody(9_000_000, 100), tipBody(101),
    dipBody(9_000_000, 200), tipBody(201),
  ]);
  check('two tips accumulate salt', st.oldSalt === 2 * saltFor(9_000), { got: st.oldSalt, one: saltFor(9_000) });
  check('and are both counted', st.tips === 2);
  check('the second run was still wiped', st.crumbs === 0 && st.lifetimeChips === 0);
}

// 4) THE SHALLOW GUARD: a table below the floor cannot farm the ceremony.
{
  const st = fold([dipBody(1_000_000, 100), tipBody(101)]); // 1,000 lifetime < 4,000
  check('a shallow tip is rejected', st.moves.some((m) => m.outcome === 'rejected-shallow'));
  check('no salt was minted', st.oldSalt === 0, st.oldSalt);
  check('and the run is untouched', st.lifetimeChips === 1_000 && st.crumbs === 1_000_000, { l: st.lifetimeChips, c: st.crumbs });
}

// 5) THE SHAPE. This is the design claim the operator asked for in so many
//    words — offer it early so players WANT to restart early — and it only
//    holds because salt is sqrt-shaped. Pin it against the alternative:
//    under any linear rule, N short runs would equal one long one exactly,
//    and waiting would never be worse.
{
  check('salt at the floor is the base rate', saltFor(TIP_FLOOR) === SALT_PER_TIP, saltFor(TIP_FLOOR));
  check('below the floor is nothing', saltFor(TIP_FLOOR - 1) === 0);
  const long = saltFor(TIP_FLOOR * 16);      // one run, 16x the floor
  const short = 4 * saltFor(TIP_FLOOR * 4);  // four runs, 4x the floor each — same total play
  check('four short runs beat one long run of equal total depth', short > long, { short, long });
  check('but a deeper run is still worth more per tip', saltFor(TIP_FLOOR * 16) > saltFor(TIP_FLOOR * 4));
  // sqrt specifically: 4x the depth is 2x the salt, not 4x.
  check('4x the depth pays 2x the salt (sqrt, not linear)',
    saltFor(TIP_FLOOR * 4) === 2 * SALT_PER_TIP, saltFor(TIP_FLOOR * 4));
}

// 6) A tip mid-history does not disturb what came before it in `moves`.
{
  const st = fold([dipBody(9_000_000, 100), tipBody(101), dipBody(2_000_000, 200)]);
  const kinds = st.moves.map((m) => m.outcome);
  check('the move log keeps the whole story', kinds.join(',') === 'dipped,tipped,dipped', kinds);
  check('the run after the tip starts from zero and rebuilds', st.lifetimeChips === 2_000, st.lifetimeChips);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
