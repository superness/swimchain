/**
 * The fold. Run: npx tsx src/lib/shoalEngine.test.ts
 *
 * Ordering note, learned the hard way on Chips & Dip: same-block entries are
 * ordered by EMBEDDED AUTHORING MS, with the content hash as the only
 * tiebreak. An allocator that does not track wall clock sorts every later
 * action before every earlier one and silently rescores the session.
 */
import { orderLog, emptyState, foldShoal, bodiesOf } from './shoalEngine';
import type { LogEntry, Presence, EatClaim } from './shoalTypes';
import {
  START_SIZE, MIN_SIZE, BITE_GROWTH, SCATTER_COST, TICK_MS,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, PRESENCE_TTL_MS, BLOOM_READY_MS,
} from './shoalConst';
import { cellCentre } from './bloom';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function pres(id: string, x: number, y: number, ms: number, hash = id + ms): Presence {
  return { kind: 'presence', id, ms, hash, vec: { x, y, heading: 0, speed: 0, t: ms } };
}
function eat(id: string, cell: number, ms: number, hash = id + 'e' + ms): EatClaim {
  const c = cellCentre(cell);
  return { kind: 'eat', id, cell, x: c.x, y: c.y, ms, hash };
}

// --- Ordering --------------------------------------------------------------
{
  const a = pres('a', 0, 0, 500);
  const b = pres('b', 0, 0, 100);
  const c = pres('c', 0, 0, 300);
  const ordered = orderLog([a, b, c]);
  check('the log orders by authoring ms', JSON.stringify(ordered.map((e) => e.id)) === JSON.stringify(['b', 'c', 'a']),
    ordered.map((e) => e.id));
}
{
  // Identical ms: the hash breaks the tie, ascending. Hand-picked hashes.
  const x = pres('x', 0, 0, 100, 'aaa');
  const y = pres('y', 0, 0, 100, 'bbb');
  const f = orderLog([y, x]);
  check('identical timestamps break on hash', JSON.stringify(f.map((e) => e.id)) === JSON.stringify(['x', 'y']),
    f.map((e) => e.id));
  check('ordering is stable regardless of input order',
    JSON.stringify(orderLog([x, y]).map((e) => e.id)) === JSON.stringify(orderLog([y, x]).map((e) => e.id)));
}
check('orderLog does not mutate its input', (() => {
  const arr: LogEntry[] = [pres('z', 0, 0, 900), pres('a', 0, 0, 100)];
  orderLog(arr);
  return arr[0].id === 'z';
})());

// --- Presence and expiry ---------------------------------------------------
{
  // untilMs must stay below the fold's first hunger tick. Ticks land at
  // t=0,250,500,750,1000,... with tickCount 1,2,3,4,5,... (tickCount
  // increments once per iteration, starting from the tick at t=state.nowMs).
  // Hunger fires when tickCount % HUNGER_TICK_INTERVAL === 0, i.e. first at
  // tickCount=4, which is the iteration at t=750. Folding only to t=500 gives
  // iterations t=0,250,500 -> tickCount 1,2,3, so hunger has not fired yet
  // and this checks pure seeding, uncontaminated by hunger.
  const s = foldShoal([pres('a', 1000, 1000, 0)], 500);
  check('a swimmer appears in the fold', s.fish.has('a'), [...s.fish.keys()]);
  check('a new swimmer starts at START_SIZE', s.fish.get('a')!.size === START_SIZE, s.fish.get('a')!.size);
}
{
  // Beyond the TTL with no further writes, the swimmer is gone.
  const s = foldShoal([pres('a', 1000, 1000, 0)], PRESENCE_TTL_MS + TICK_MS);
  check('a stale swimmer leaves the fold', !s.fish.has('a'), [...s.fish.keys()]);
}
{
  // Last-write-wins: only the newest vector matters, not the history.
  const s = foldShoal([pres('a', 100, 100, 0), pres('a', 900, 900, 1_000)], 1_500);
  const f = s.fish.get('a')!;
  check('last write wins on position', f.vec.x === 900 && f.vec.y === 900, f.vec);
}

// --- Hunger ----------------------------------------------------------------
{
  // Hand arithmetic: hunger ticks every HUNGER_TICK_INTERVAL fold ticks, each
  // costing HUNGER_AMOUNT. Over 8000 ms at TICK_MS=250 there are 32 fold ticks
  // and therefore 8 hunger ticks, so 8 size lost.
  const ticks = Math.floor(8_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const expected = START_SIZE - hungerTicks * HUNGER_AMOUNT;
  const s = foldShoal([pres('a', 1000, 1000, 0)], 8_000);
  check('hunger eats size while present', s.fish.get('a')!.size === expected,
    { got: s.fish.get('a')!.size, expected, hungerTicks });
}
{
  // Hunger must never push a fish below the floor.
  const s = foldShoal([pres('a', 1000, 1000, 0)], PRESENCE_TTL_MS - TICK_MS);
  check('hunger never drops below the floor', s.fish.get('a')!.size >= MIN_SIZE, s.fish.get('a')!.size);
}

// --- Eating ----------------------------------------------------------------
{
  // The eat must land in the SAME fold tick as the presence that seeds the
  // fish (both at ms=0). markVisits stamps a fish's own occupied cell as
  // visited on EVERY tick it stands there (bloom.ts), so a fish parked at a
  // cell from ms=0 has already re-marked that cell "recently visited" by the
  // time a later tick (e.g. ms=500) processes an eat claim -- isBloomReady
  // then reads false and the bite is silently not credited. Landing both
  // entries on ms=0 keeps both inside fold tick t=0's step 1 (log
  // application), which runs BEFORE that tick's step 3 (markVisits) -- so the
  // cell is still genuinely never-visited when canEat checks it. Within that
  // same tick, orderLog sorts the presence (hash 'a0') before the eat (hash
  // 'ae0', since '0' < 'e'), so the fish exists before its own bite is
  // checked.
  const cell = 700;
  const c = cellCentre(cell);
  const log: LogEntry[] = [pres('a', c.x, c.y, 0), eat('a', cell, 0)];
  const s = foldShoal(log, 1_000);
  // Hand arithmetic: as above, the only hunger opportunity in [0, 1000] is
  // the iteration at t=750 (tickCount=4). foldShoal skips hunger for a fish
  // that ate within HUNGER_TICK_INTERVAL * TICK_MS (= 1000ms) of now; this
  // fish ate at ms=0, and 750 - 0 = 750 < 1000, so that hunger tick is
  // skipped. No hunger is ever applied inside this window, so the bite's
  // growth is the only change to size.
  const expected = START_SIZE + BITE_GROWTH;
  check('a credited bite grows the fish', s.fish.get('a')!.size === expected,
    { got: s.fish.get('a')!.size, expected });
}
{
  // A bite claimed somewhere the fish is not does NOT credit.
  const cell = 700;
  const far = cellCentre(50);
  const log: LogEntry[] = [pres('a', far.x, far.y, 0), eat('a', cell, 500)];
  const s = foldShoal(log, 1_000);
  check('a bite claimed away from the fish does not credit',
    s.fish.get('a')!.size < START_SIZE + BITE_GROWTH, s.fish.get('a')!.size);
}

// --- Determinism -----------------------------------------------------------
{
  // Shuffling the input log must not change the folded outcome at all.
  const c = cellCentre(700);
  const log: LogEntry[] = [
    pres('a', c.x, c.y, 0), pres('b', c.x + 10, c.y, 0), pres('c', c.x, c.y + 10, 0),
    eat('a', 700, 3_000), pres('a', c.x, c.y, 4_000), eat('b', 700, 3_500),
  ];
  const forward = foldShoal(log, 6_000);
  const backward = foldShoal([...log].reverse(), 6_000);
  const key = (s: typeof forward) =>
    JSON.stringify([...s.fish.entries()].sort().map(([k, v]) => [k, v.size, v.x, v.y]));
  check('a shuffled log folds identically', key(forward) === key(backward),
    { forward: key(forward), backward: key(backward) });
}

// --- bodiesOf --------------------------------------------------------------
{
  const s = foldShoal([pres('a', 100, 200, 0), pres('b', 300, 400, 0)], 500);
  const bodies = bodiesOf(s);
  check('bodiesOf returns one body per live fish', bodies.length === 2, bodies.length);
  check('bodiesOf is sorted by id', bodies[0].id === 'a' && bodies[1].id === 'b', bodies.map((b) => b.id));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
