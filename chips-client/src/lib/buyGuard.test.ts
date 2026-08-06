/**
 * AN OLD REJECTION MUST NOT FREE A NEW BUY.
 *
 * Mainnet 2026-08-04, operator's table. His report carried
 *
 *     id 263  buy fryer2      id 264  buy fryer2
 *     id 260  buy season1     id 268  buy season1
 *
 * — the same jar queued twice. Each duplicate costs a real action PoW and a
 * chain write to be folded `rejected-owned`, and it makes a purchase that
 * SUCCEEDED show up in the report's `rejects` list looking like a failure,
 * which cost me a wrong diagnosis in front of him.
 *
 * The in-flight guard was freed by an unfiltered history scan:
 *
 *     moves.some(m => m.upgradeKey === key && m.outcome.startsWith('rejected'))
 *
 * His table holds `rejected-order season4` at 1:44 PM, 2:11 PM, 4:44 PM and
 * 6:50 PM. A season4 queued at 11:51 PM matched the 1:44 PM one — nine hours
 * and four bowls earlier — so the key left the guard the same tick it entered.
 *
 * Third bug of this family in one evening, after the boss bar and the queue
 * reconcile: a rule that searches all of history for a key that is not unique
 * in time will always find an answer to a question nobody asked.
 *
 * Run: npx tsx src/lib/buyGuard.test.ts
 */
import { prunePending, type GuardMove } from './buyGuard';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const NONE: ReadonlySet<string> = new Set();
/* His real timeline, in ms. */
const T_144PM = 1785865475274;   // rejected-order season4, a previous bowl
const T_1151PM = 1785901880411;  // the buy he actually made tonight

/* ── 1. THE BUG, EXACTLY AS IT HAPPENED ────────────────────────────────── */
{
  const history: GuardMove[] = [
    { upgradeKey: 'season4', outcome: 'rejected-order', ms: T_144PM },
  ];
  const pending = new Map([['season4', T_1151PM]]);

  const dropped = prunePending(pending, NONE, history);
  check('a nine-hour-old rejection does NOT free tonight\'s buy',
    pending.has('season4'), { dropped, left: [...pending.keys()] });
  check('...and nothing was dropped at all', dropped === 0, dropped);
}

/* ── 2. THIS ATTEMPT'S OWN REJECTION STILL FREES IT ────────────────────── */
{
  // The guard must not become a trap: a buy the fold really did refuse has to
  // let the player try again.
  const pending = new Map([['season4', T_1151PM]]);
  const history: GuardMove[] = [
    { upgradeKey: 'season4', outcome: 'rejected-order', ms: T_144PM },      // old, ignored
    { upgradeKey: 'season4', outcome: 'rejected-cost', ms: T_1151PM + 50 }, // this one
  ];
  check('a rejection of THIS attempt frees it',
    prunePending(pending, NONE, history) === 1 && !pending.has('season4'),
    [...pending.keys()]);
}

/* ── 3. A GRANTED JAR LEAVES, WHATEVER THE HISTORY SAYS ────────────────── */
{
  const pending = new Map([['fryer2', T_1151PM]]);
  check('owning the jar retires the guard',
    prunePending(pending, new Set(['fryer2']), []) === 1 && pending.size === 0);
}

/* ── 4. A REJECTION AT THE EXACT ms COUNTS ─────────────────────────────── */
{
  // The attempt's own ms IS the buy's authoring ms, so its rejection lands at
  // exactly `since`. An exclusive comparison here would strand the key forever.
  const pending = new Map([['bowl1', T_1151PM]]);
  const history: GuardMove[] = [
    { upgradeKey: 'bowl1', outcome: 'rejected-owned', ms: T_1151PM },
  ];
  check('a rejection at exactly the attempt ms frees it',
    prunePending(pending, NONE, history) === 1 && pending.size === 0);
}

/* ── 5. OTHER JARS' REJECTIONS ARE NOT MINE ────────────────────────────── */
{
  const pending = new Map([['season4', T_1151PM]]);
  const history: GuardMove[] = [
    { upgradeKey: 'season5', outcome: 'rejected-order', ms: T_1151PM + 999 },
    { outcome: 'rejected-shallow', ms: T_1151PM + 999 }, // a broke, no key at all
  ];
  check('another jar\'s rejection does not free mine', prunePending(pending, NONE, history) === 0);
  check('...and a keyless rejection does not either', pending.has('season4'));
}

/* ── 6. EMPTY IS CHEAP ─────────────────────────────────────────────────── */
{
  check('an empty guard does no work', prunePending(new Map(), NONE, []) === 0);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
