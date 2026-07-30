/**
 * Every check here is a thing the operator actually lost on 2026-07-29 — "lost a
 * fryer, lost queso angel upgrade, things are whiplashing around" — and a
 * watchdog that stopped noticing one of them would be a watchdog that is no use
 * the next time.
 *
 * Run: npx tsx src/lib/foldWatch.test.ts
 */
import { watchFold, foldRegressions, clearFoldRing, FOLD_RING_MAX, type FoldFacts } from './foldWatch';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const facts = (over: Partial<FoldFacts> = {}): FoldFacts => ({
  crumbs: 1_000_000, lifetimeChips: 6_366, fryers: 2, bowlCap: 200_000_000,
  broken: 1, paidToBosses: 500_000, moves: 31,
  owned: new Set(['season1', 'fryer2', 'quesoangel']),
  charOwned: new Set(['crack']),
  ...over,
});

const fields = (rs: { field: string }[]) => rs.map((r) => r.field).sort().join(',');

// 1) NOTHING CHANGED, NOTHING REPORTED. A watchdog that cries on a normal tick
//    gets ignored, and it runs on every state update.
{
  clearFoldRing();
  check('an identical fold reports nothing', watchFold(facts(), facts(), 1).length === 0);
  check('a fold going FORWARD reports nothing',
    watchFold(facts(), facts({ crumbs: 2_000_000, lifetimeChips: 7_000, moves: 33 }), 1).length === 0);
  check('and a first-ever fold has nothing to compare', watchFold(null, facts(), 1).length === 0);
}

// 2) THE UPGRADES. Verbatim: "lost a fryer, lost queso angel upgrade".
{
  clearFoldRing();
  const r = watchFold(facts(), facts({ owned: new Set(['season1', 'fryer2']) }), 1);
  check('an upgrade that un-owned itself is caught', fields(r) === 'owned', r);
  check('and it is named', r[0].what.includes('quesoangel'), r[0]);

  const f = watchFold(facts(), facts({ fryers: 1 }), 1);
  check('a lost fryer is caught', fields(f) === 'fryers', f);

  const c = watchFold(facts(), facts({ charOwned: new Set() }), 1);
  check('a lost ability is caught', fields(c) === 'charOwned', c);
}

// 3) THE STRONGEST INVARIANT. lifetimeChips counts every chip ever dipped, so a
//    drop means the fold replayed a SHORTER history — the one number that
//    separates "the projection snapped back" from any display bug.
{
  clearFoldRing();
  const r = watchFold(facts(), facts({ lifetimeChips: 6_000 }), 1);
  check('a shorter replayed history is caught', fields(r) === 'lifetimeChips', r);
  check('and it says so, not just that a number moved',
    r[0].what.includes('SHORTER'), r[0].what);
  check('and carries the move counts either side, which is the diagnosis',
    r[0].movesFrom === 31 && r[0].movesTo === 31, r[0]);
}

// 4) CRUMBS ARE NOT MONOTONIC. Buying lowers them legitimately, so a fall is
//    only a regression when no new move explains it. Both directions matter:
//    crying on every purchase would bury the real signal.
{
  clearFoldRing();
  const bought = watchFold(facts(), facts({ crumbs: 1, moves: 32 }), 1);
  check('crumbs falling WITH a new move is not a regression', bought.length === 0, bought);

  const silent = watchFold(facts(), facts({ crumbs: 1 }), 1);
  check('crumbs falling with NO new move is a regression', fields(silent) === 'crumbs', silent);
}

// 5) THE DESCENT DOES NOT UNDO.
{
  clearFoldRing();
  check('going back up a band is caught', fields(watchFold(facts(), facts({ broken: 0 }), 1)) === 'broken');
  check('forgotten boss damage is caught',
    fields(watchFold(facts(), facts({ paidToBosses: 0 }), 1)) === 'paidToBosses');
  check('a shrinking bowl is caught', fields(watchFold(facts(), facts({ bowlCap: 1 }), 1)) === 'bowlCap');
}

// 6) THE RING. It accumulates across calls (that is the whole point — a flicker
//    is several events) and must be bounded and keep the newest.
{
  clearFoldRing();
  watchFold(facts(), facts({ fryers: 1 }), 10);
  watchFold(facts(), facts({ broken: 0 }), 11);
  check('regressions accumulate across calls', foldRegressions().length === 2, foldRegressions());
  for (let i = 0; i < FOLD_RING_MAX + 5; i++) watchFold(facts(), facts({ fryers: 1 }), 100 + i);
  check('the ring is bounded', foldRegressions().length === FOLD_RING_MAX, foldRegressions().length);
  const last = foldRegressions()[FOLD_RING_MAX - 1];
  check('and keeps the NEWEST', last.at === 100 + FOLD_RING_MAX + 4, last.at);
  clearFoldRing();
  check('and can be emptied', foldRegressions().length === 0);
}

// 7) IT MAY NEVER THROW. It runs on the path where something is already wrong.
{
  clearFoldRing();
  let threw = false;
  try {
    // A fold missing the sets entirely — exactly the shape a partial/broken
    // state would have, and the reason the body is wrapped.
    watchFold({} as FoldFacts, {} as FoldFacts, 1);
    watchFold(facts(), { ...facts(), owned: undefined as unknown as Set<string> }, 1);
  } catch { threw = true; }
  check('a malformed fold does not throw', !threw);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
