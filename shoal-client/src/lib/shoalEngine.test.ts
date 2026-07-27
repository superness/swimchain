/**
 * The fold. Run: npx tsx src/lib/shoalEngine.test.ts
 *
 * Ordering note, learned the hard way on Chips & Dip: same-block entries are
 * ordered by EMBEDDED AUTHORING MS, with the content hash as the only
 * tiebreak. An allocator that does not track wall clock sorts every later
 * action before every earlier one and silently rescores the session.
 */
import { orderLog, foldShoal, bodiesOf } from './shoalEngine';
import type { LogEntry, Presence, EatClaim } from './shoalTypes';
import {
  START_SIZE, MIN_SIZE, BITE_GROWTH, TICK_MS,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, PRESENCE_TTL_MS,
  BLOOM_BITES, EAT_COOLDOWN_MS, VOID_WINDOW_MS,
} from './shoalConst';
import { cellCentre, bitesLeft } from './bloom';

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
  // 60000 - 13500 = 46500 >= BLOOM_READY_MS (45000) either way).
  //
  // The cell's bitesTaken was cleared by the regrowth reset in step 3 at the
  // first tick the cell read fallow: 13500 + BLOOM_READY_MS(45000) = 58500,
  // comfortably before b's arrival. (NOT at t=12500, as an earlier draft of
  // this comment asserted: the reset is gated on isBloomReady, and at t=12500
  // lastVisit(700) had just been stamped 12500 by the exhausting bite itself
  // and re-stamped by that same tick's markVisits, so 12500-12500 = 0 is
  // nowhere near 45000. Directly observed: bitesTaken(700) is still 6 at
  // t=58250 and absent at t=58500.)
  //
  // So bitesLeft reads a fresh BLOOM_BITES (6), not 0. The bite credits:
  // bitesTaken(700) becomes 1, and it re-latches (bloomSinceMs is set again)
  // since 1 < BLOOM_BITES.
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

// --- A PARTLY eaten bloom regrows too --------------------------------------
// Spec 2.5: "the sea refills exactly the places you were too scared to go."
// The regrowth reset is gated on fallowness alone, not on exhaustion, so a
// cell abandoned after one to five bites comes back — count AND latch. If it
// did not, the sea would deplete monotonically and the stranded latch would
// keep the cell edible under a pile of hiding fish forever, which is exactly
// the tight-blob strategy rivalry exists to prevent.
{
  // Cell 700: col = 700 % 32 = 28, row = floor(700/32) = 21, so its centre is
  // (28*128+64, 21*128+64) = (3648, 2752) by BLOOM_CELL arithmetic alone.
  //
  // 'a' parks there at ms=0 and takes exactly TWO of the six bites: the first
  // at ms=0 (same tick as its own presence, hash 'a0' < 'ae0', so it is
  // checked before that tick's markVisits against a still-empty lastVisit)
  // which credits and latches, and a second at ms=EAT_COOLDOWN_MS(2500) which
  // credits through the latch. bitesTaken(700) = 2, still latched, four bites
  // left in the bloom.
  //
  // At ms=3000 'a' departs: same point, heading 0 (+x), speed 400 cu/s.
  // reckon's dx = trunc(speed * COS[0] * dtMs / (TRIG_SCALE*1000)); COS[0] is
  // exactly TRIG_SCALE so this is trunc(0.4 * dtMs), then quantized to QUANT=8.
  //   t=3000  dt=0   dx=0   x=3648            distance 0   -> marked
  //   t=3250  dt=250 dx=100 x=3748 -> q 3744  distance 96  -> marked (96^2=9216 <= 40000)
  //   t=3500  dt=500 dx=200 x=3848 -> q 3848  distance 200 -> marked (200^2=40000 <= 40000, inclusive)
  //   t=3750  dt=750 dx=300 x=3948 -> q 3944  distance 296 -> NOT marked (296^2=87616 > 40000)
  // and it only moves further away (clamping at WORLD_W=4096, 448 cu from the
  // centre) so lastVisit(700) freezes at 3500 for good.
  //
  // The cell is therefore fallow at the first tick t with t - 3500 >=
  // BLOOM_READY_MS(45000), i.e. t = 48500 (48500/250 = 194, a real tick).
  const cell = 700;
  const c = cellCentre(cell);
  const abandon: LogEntry[] = [
    pres('a', c.x, c.y, 0),
    eat('a', cell, 0),
    eat('a', cell, EAT_COOLDOWN_MS),
    { kind: 'presence', id: 'a', ms: 3_000, hash: 'a-depart',
      vec: { x: c.x, y: c.y, heading: 0, speed: 400, t: 3_000 } },
  ];
  check('the abandoned cell is centred where BLOOM_CELL arithmetic says',
    c.x === 3648 && c.y === 2752, c);

  // One tick BEFORE the fallow window closes: nothing has been given back.
  const before = foldShoal(abandon, 48_250);
  check('a part-eaten bloom is still spent one tick before it is fallow',
    before.bitesTaken.get(cell) === 2 && before.bloomSinceMs.has(cell),
    { bitesTaken: before.bitesTaken.get(cell), latched: before.bloomSinceMs.has(cell) });

  // The tick the fallow window closes: count and latch clear TOGETHER.
  const after = foldShoal(abandon, 48_500);
  check('a part-eaten bloom left fallow is restored to BLOOM_BITES',
    bitesLeft(after.bitesTaken, cell) === BLOOM_BITES && !after.bitesTaken.has(cell),
    { bitesLeft: bitesLeft(after.bitesTaken, cell), raw: after.bitesTaken.get(cell) });
  check('the stranded latch is released with it', !after.bloomSinceMs.has(cell),
    after.bloomSinceMs.has(cell));

  // And the restoration is worth six bites to a newcomer, not four. 'b'
  // arrives at ms=48750 (the first tick after the reset) on the cell centre;
  // 48750 - 3500 = 45250 >= BLOOM_READY_MS so its first claim passes the real
  // fallow test unlatched, credits, and re-latches. Five more at
  // EAT_COOLDOWN_MS spacing — 51250, 53750, 56250, 58750, 61250 — ride the
  // latch. Six credited bites, so b's last credited bite is at 61250.
  //
  // Under the un-generalised reset the cell would still read bitesTaken=2 AND
  // still be latched when 'b' arrived, so only 6-2 = 4 claims could credit and
  // b's lastBiteMs would stop at 56250. That is the falsifiable difference.
  const newcomer: LogEntry[] = [
    ...abandon,
    pres('b', c.x, c.y, 48_750),
    eat('b', cell, 48_750),
    eat('b', cell, 48_750 + 1 * EAT_COOLDOWN_MS),
    eat('b', cell, 48_750 + 2 * EAT_COOLDOWN_MS),
    eat('b', cell, 48_750 + 3 * EAT_COOLDOWN_MS),
    eat('b', cell, 48_750 + 4 * EAT_COOLDOWN_MS),
    eat('b', cell, 48_750 + 5 * EAT_COOLDOWN_MS),
  ];
  const fed = foldShoal(newcomer, 61_250);
  check('a newcomer draws a full six bites from the restored bloom',
    fed.fish.get('b')!.lastBiteMs === 61_250 && fed.bitesTaken.get(cell) === BLOOM_BITES,
    { lastBiteMs: fed.fish.get('b')!.lastBiteMs, expected: 61_250,
      bitesTaken: fed.bitesTaken.get(cell) });
}

// --- Scatter voids the whole trip, not just the last bite ------------------
// Before the bloom latch, a fish could only ever bank one bite per visit, so
// voiding "the last bite" and voiding "the trip" were the same thing. The
// latch makes multi-bite trips real: EAT_COOLDOWN_MS (2500) spacing lets a
// fish bank up to floor(VOID_WINDOW_MS / EAT_COOLDOWN_MS) + 1 = 5 bites
// inside one VOID_WINDOW_MS (10000) window. If a scatter only voided the
// most recent one, banking 4 bites (+48) then getting swept (-30, -12 for
// one voided bite = -42) would net +6 — getting caught while feeding would
// be PROFITABLE, which breaks the game's central tension.
//
// Geometry shared by the three sweep-driven checks below: two fish, 'a' at
// cellCentre(31) = (4032, 64) (large x, small y corner) and 'anchor' at
// cellCentre(736) = (64, 3008) (small x, large y corner), both stationary
// from ms=0. coreCentre medians x and y independently (see tension.ts): the
// x-median of {4032, 64} is 64 (anchor's x), the y-median of {64, 3008} is
// 64 (a's y) -- so coreCentre = (64, 64), a point that is NEITHER fish's
// actual position. Both fish sit far outside CORE_R (620) from it (dist2
// from 'a': 3968^2 = 15,745,024; from 'anchor': 2944^2 = 8,667,136; both far
// past CORE_R2 = 384,400), so spreadPerMille = 1000 (both of 2 outside) on
// every tick from t=0. stepTension adds (1000 - TENSION_NEUTRAL(250)) = 750
// per tick, the fastest this fold can ever raise tension (spreadPerMille
// cannot exceed 1000). Reaching TENSION_TRIGGER (30000) takes exactly
// 30000/750 = 40 ticks; tension hits 30000 on the tick at t=(40-1)*250 =
// 9750 (t=0 is the 1st tick), so shouldStartHush fires there: hushStartMs =
// 9750. The hush resolves HUSH_MS (8000) later, at t = 9750+8000 = 17750 --
// itself a valid tick (17750/250 = 71). Both fish are mutually far apart
// (well past SHELTER_R), so both are exposed and both get taken by the
// sweep; only 'a' is asserted on below.
{
  // The headline regression. 'a' credits five bites total on cell 31: the
  // first at ms=0 lands in the SAME tick as its own arrival presence (hash
  // 'a0' < 'ae0', so the presence is applied first), passing the genuine
  // fallow test before that tick's markVisits ever runs, and latches the
  // bloom. Four more, spaced exactly EAT_COOLDOWN_MS apart at
  // 7750, 10250, 12750, 15250, are checked latched (bypassing the fallow
  // test) and all credit. Relative to the resolve tick (17750), those four
  // are 10000, 7500, 5000, and 2500 ms old -- all within VOID_WINDOW_MS
  // (10000, boundary inclusive) -- while the ms=0 bite is 17750ms old, well
  // outside it. In fact the eat branch's own per-bite pruning (keep entries
  // within VOID_WINDOW_MS of the NEWEST bite) already drops the ms=0 entry
  // from recentBites once the ms=10250 bite lands (10250-0=10250>10000), so
  // by the time the sweep runs, recentBites = [7750,10250,12750,15250] --
  // exactly the four that should void, and only those.
  //
  // Full tick-by-tick size trace (bite=+BITE_GROWTH(12), hunger=-1, applied
  // only when tickCount%HUNGER_TICK_INTERVAL(4)===0 and the fish did NOT
  // bite within the last HUNGER_TICK_INTERVAL*TICK_MS(1000)ms):
  //   t=0     bite      100 -> 112
  //   t=1750..6750  hunger x6 (t=750 skipped, gap=750<1000)     112 -> 106
  //   t=7750  bite      106 -> 118   (hunger this tick skipped, gap=0)
  //   t=8750,9750  hunger x2                                    118 -> 116
  //   t=10250 bite      116 -> 128   (t=10750 hunger skipped, gap=500)
  //   t=11750 hunger                                            128 -> 127
  //   t=12750 bite      127 -> 139   (this tick's hunger skipped, gap=0)
  //   t=13750,14750 hunger x2                                   139 -> 137
  //   t=15250 bite      137 -> 149   (t=15750 hunger skipped, gap=500)
  //   t=16750 hunger                                            149 -> 148
  //   t=17750 SWEEP: -SCATTER_COST(30) -> 118; void 4 bites
  //           -4*BITE_GROWTH(48) -> 70; then this tick's hunger
  //           (gap=2500>=1000, applies) -> 69
  // Final size: 69. Getting caught after banking four bites costs 31 net
  // relative to never having fed at all (100 -> 69, ignoring the ambient
  // hunger any idle fish would also have paid) -- strictly worse than not
  // feeding, not the +6 the pre-latch-aware voiding would have left.
  const cellA = 31;
  const cellAnchor = 736;
  const a = cellCentre(cellA);
  const anchor = cellCentre(cellAnchor);
  const log: LogEntry[] = [
    pres('anchor', anchor.x, anchor.y, 0),
    pres('a', a.x, a.y, 0),
    eat('a', cellA, 0),
    eat('a', cellA, 1 * EAT_COOLDOWN_MS + 5_250),
    eat('a', cellA, 2 * EAT_COOLDOWN_MS + 5_250),
    eat('a', cellA, 3 * EAT_COOLDOWN_MS + 5_250),
    eat('a', cellA, 4 * EAT_COOLDOWN_MS + 5_250),
  ];
  const s = foldShoal(log, 17_750);
  check('a scatter after banking four bites leaves the fish worse off than never feeding',
    s.fish.get('a')!.size === 69 && s.lastTaken.includes('a') && s.lastSweepMs === 17_750,
    { size: s.fish.get('a')!.size, lastTaken: s.lastTaken, lastSweepMs: s.lastSweepMs });

  // A second sweep cannot re-void: the voided entries are actually REMOVED
  // from recentBites (not merely skipped over), so nothing is left for any
  // later check to find. This is directly falsifiable: skipping the removal
  // step leaves the same four entries sitting in recentBites after the
  // sweep, which this assertion would catch.
  check('voided bites are removed from recentBites, not just skipped',
    s.fish.get('a')!.recentBites.length === 0, s.fish.get('a')!.recentBites);
}
{
  // A bite older than VOID_WINDOW_MS survives a scatter. Same geometry and
  // resolve tick (17750) as the tests above, but 'a' credits only the ms=0
  // bite this time. By the resolve tick that bite is 17750ms old, past
  // VOID_WINDOW_MS (10000), so voided.length must be 0 and the bite's growth
  // must survive.
  //
  // Hand trace, in tick order: t=0 bite, 100 -> 112. Hunger checks occur
  // every 1000ms (t=750, 1750, ..., 17750 -- (17750-750)/1000+1 = 18 checks
  // total) and apply unless the fish bit within the last 1000ms; only the
  // first (t=750, gap=750<1000) is skipped, so t=1750 through t=16750 is 16
  // straight applies: 112 - 16 = 96 going into the resolve tick. At
  // t=17750 (step 5 runs before step 6 within a tick): SCATTER_COST(30)
  // first, 96 -> 66; the void check finds recentBites=[0] with
  // 17750-0=17750 > VOID_WINDOW_MS, so nothing voids, still 66; then this
  // same tick's own hunger check (the 18th, gap=17750>=1000) applies,
  // 66 -> 65. Final size: 65.
  const cellA = 31;
  const cellAnchor = 736;
  const a = cellCentre(cellA);
  const anchor = cellCentre(cellAnchor);
  const log: LogEntry[] = [
    pres('anchor', anchor.x, anchor.y, 0),
    pres('a', a.x, a.y, 0),
    eat('a', cellA, 0),
  ];
  const s = foldShoal(log, 17_750);
  check('a bite older than VOID_WINDOW_MS survives a scatter',
    s.fish.get('a')!.size === 65 && s.fish.get('a')!.recentBites.length === 1,
    { size: s.fish.get('a')!.size, recentBites: s.fish.get('a')!.recentBites });
}
{
  // recentBites stays bounded across a long fold. Reuses the six-bite
  // schedule (cooldown-spaced claims on a latched bloom): with entries
  // pruned to VOID_WINDOW_MS (10000) of the NEWEST bite on every credit, and
  // EAT_COOLDOWN_MS (2500) the minimum legal spacing between credited bites,
  // the array can never hold more than floor(10000/2500)+1 = 5 entries at
  // once, regardless of how long the fold runs or how many bites happen --
  // every new push re-applies the same prune. After the 5th bite (ms=10000)
  // it holds exactly 5 ([0,2500,5000,7500,10000]); the 6th (ms=12500) pushes
  // and prunes again (12500-0=12500>10000, drops the oldest), so it's still
  // 5, not 6: [2500,5000,7500,10000,12500].
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
  ];
  const s = foldShoal(log, 20_000);
  check('recentBites never grows past floor(VOID_WINDOW_MS / EAT_COOLDOWN_MS) + 1',
    s.fish.get('a')!.recentBites.length === Math.floor(VOID_WINDOW_MS / EAT_COOLDOWN_MS) + 1,
    s.fish.get('a')!.recentBites);
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
