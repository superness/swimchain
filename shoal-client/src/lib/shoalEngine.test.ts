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
  BLOOM_BITES, EAT_COOLDOWN_MS,
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

// --- The bloom latch --------------------------------------------------------
// bloomSinceMs makes a bloom RIVALROUS: once a cell has earned its first
// credited bite while genuinely fallow, it stays edible for BLOOM_BITES
// total bites regardless of who keeps swimming over it, because markVisits
// would otherwise re-mark the cell "recently visited" on every subsequent
// tick a fish stands there and permanently block bites 2 through 6.
{
  // Eating requires genuine fallow FIRST: an unlatched cell that a fish has
  // been parked on is NOT ready, because that fish's own presence re-marks
  // the cell as visited on every tick it occupies it (see markVisits). The
  // presence lands at ms=0 (tick t=0) and marks the cell again at t=250; by
  // the time the eat claim at ms=500 (tick t=500) is checked, lastVisit(700)
  // reads 250, and 500-250=250 is far short of BLOOM_READY_MS (45000), so
  // isBloomReady is false and the bite must NOT credit. untilMs is kept at
  // 500 (ticks t=0,250,500 -> tickCount 1,2,3) so no hunger tick fires and
  // this test is not contaminated by hunger arithmetic.
  const cell = 700;
  const c = cellCentre(cell);
  const log: LogEntry[] = [pres('a', c.x, c.y, 0), eat('a', cell, 500)];
  const s = foldShoal(log, 500);
  check('an unlatched, recently-visited cell still refuses the bite',
    s.fish.get('a')!.size === START_SIZE && (s.bitesTaken.get(cell) ?? 0) === 0
      && !s.bloomSinceMs.has(cell),
    { size: s.fish.get('a')!.size, bitesTaken: s.bitesTaken.get(cell), latched: s.bloomSinceMs.has(cell) });
}
{
  // The six-bite test: mirrors the coordinator's probe (one fish parked on a
  // cell centre, claims spaced EAT_COOLDOWN_MS apart). The FIRST claim lands
  // in the SAME tick as the presence (both ms=0), so it is checked before
  // that tick's markVisits ever runs against a still-empty lastVisit -- it
  // credits and latches the bloom (bloomSinceMs.set(cell, 0)). Every later
  // claim, spaced exactly EAT_COOLDOWN_MS (2500ms) apart so the cooldown
  // check in canEat never blocks it, is checked against NEVER_VISITED (since
  // the cell is latched) and credits regardless of the fish continuously
  // re-marking the cell as visited. That is claims 2 through 6, landing at
  // ms 2500, 5000, 7500, 10000, 12500 -- six credited bites total. The 6th
  // claim's credit brings the running count to BLOOM_BITES (6), so the eat
  // branch unlatches the cell and stamps lastVisit(700) = 12500. A 7th claim
  // at ms=15000 (still a valid EAT_COOLDOWN_MS-spaced claim) is now checked
  // unlatched against the REAL lastVisit, which has been kept fresh every
  // tick since by the fish's continued presence at the cell (most recently
  // refreshed at t=14750, just before this claim's tick t=15000 is
  // processed) -- nowMs - seen = 15000 - 14750 = 250, nowhere near
  // BLOOM_READY_MS, so isBloomReady is false and the 7th claim must NOT
  // credit. bitesTaken(700) must therefore read exactly 6, not 7, and the
  // fish's lastBiteMs must still be 12500 (from bite 6), not 15000.
  const cell = 700;
  const c = cellCentre(cell);
  const log: LogEntry[] = [
    pres('a', c.x, c.y, 0),
    eat('a', cell, 0),
    eat('a', cell, EAT_COOLDOWN_MS),
    eat('a', cell, 2 * EAT_COOLDOWN_MS),
    eat('a', cell, 3 * EAT_COOLDOWN_MS),
    eat('a', cell, 4 * EAT_COOLDOWN_MS),
    eat('a', cell, 5 * EAT_COOLDOWN_MS),
    eat('a', cell, 6 * EAT_COOLDOWN_MS), // the 7th claim: must not credit
  ];
  const s = foldShoal(log, 20_000);
  check('a bloom yields exactly BLOOM_BITES credited bites and no more',
    s.bitesTaken.get(cell) === BLOOM_BITES && s.fish.get('a')!.lastBiteMs === 5 * EAT_COOLDOWN_MS,
    { bitesTaken: s.bitesTaken.get(cell), lastBiteMs: s.fish.get('a')!.lastBiteMs, expectedLastBiteMs: 5 * EAT_COOLDOWN_MS });
  check('the latch is released once the bloom is exhausted', !s.bloomSinceMs.has(cell), s.bloomSinceMs.has(cell));
}
{
  // Regrowth: after exhaustion, waiting long enough with nobody at the cell
  // lets it bloom again, with a fresh bite count.
  //
  // Fish 'a' repeats the six-bite sequence above (exhausting the bloom at
  // ms=12500, which unlatches it and stamps lastVisit(700)=12500). At
  // ms=13000 'a' issues a NEW presence at the same starting point but now
  // heading at brad 0 (+x) with speed=400 cu/s, so it dead-reckons away from
  // the cell. reckon's dx = speed*dtMs/1000 (COS[0]=TRIG_SCALE exactly, so
  // the trig factor cancels): at t=13250, dt=250 -> dx=100, distance to the
  // cell centre is 100, still <= BLOOM_VISIT_R (200), so markVisits marks it
  // again at t=13250. At t=13500, dt=500 -> dx=200, distance is EXACTLY 200
  // = BLOOM_VISIT_R, still within range (dist2 check is <=), marked again.
  // At t=13750, dt=750 -> dx=300, distance 300 > 200, no longer marked. So
  // the last tick that marks cell 700 via 'a' is t=13500, freezing
  // lastVisit(700) = 13500 from then on (nobody else is near it).
  //
  // A fresh fish 'b' arrives at the cell centre and claims a bite, both at
  // ms=60000 (same tick, so the check runs before b's own arrival could
  // re-mark the cell -- though it wouldn't matter here regardless, since
  // 60000 - 13500 = 46500 >= BLOOM_READY_MS (45000) either way). The cell's
  // bitesTaken was already cleared by the existing exhausted-cell reset
  // block back at t=12500 (used>=BLOOM_BITES and lastVisit(700)>=t both held
  // that tick), so bitesLeft reads a fresh BLOOM_BITES (6), not 0. The bite
  // credits: bitesTaken(700) becomes 1, and it re-latches (bloomSinceMs is
  // set again) since 1 < BLOOM_BITES.
  const cell = 700;
  const c = cellCentre(cell);
  const log: LogEntry[] = [
    pres('a', c.x, c.y, 0),
    eat('a', cell, 0),
    eat('a', cell, EAT_COOLDOWN_MS),
    eat('a', cell, 2 * EAT_COOLDOWN_MS),
    eat('a', cell, 3 * EAT_COOLDOWN_MS),
    eat('a', cell, 4 * EAT_COOLDOWN_MS),
    eat('a', cell, 5 * EAT_COOLDOWN_MS),
    { kind: 'presence', id: 'a', ms: 13_000, hash: 'a-depart',
      vec: { x: c.x, y: c.y, heading: 0, speed: 400, t: 13_000 } },
    pres('b', c.x, c.y, 60_000),
    eat('b', cell, 60_000),
  ];
  const s = foldShoal(log, 60_000);
  check('an exhausted bloom regrows after the fallow window with nobody at the cell',
    s.bitesTaken.get(cell) === 1 && s.fish.get('b')!.lastBiteMs === 60_000 && s.bloomSinceMs.has(cell),
    { bitesTaken: s.bitesTaken.get(cell), bLastBiteMs: s.fish.get('b')!.lastBiteMs, latched: s.bloomSinceMs.has(cell) });
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
