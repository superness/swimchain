/**
 * The fold. Run: npx tsx src/lib/shoalEngine.test.ts
 *
 * Ordering note, learned the hard way on Chips & Dip: same-block entries are
 * ordered by EMBEDDED AUTHORING MS, with the content hash as the only
 * tiebreak. An allocator that does not track wall clock sorts every later
 * action before every earlier one and silently rescores the session.
 *
 * HUNGER PHASE, stated once because every hand-derived size below depends on
 * it. A fold's tick loop starts at epochWarmStartMs(e) = epochStartMs(e) -
 * WARMUP_MS(90_000), so state.tickCount on the tick at absolute time t is
 *   (t - epochStartMs(e)) / TICK_MS + WARMUP_MS / TICK_MS + 1
 *   = (t - epochStartMs(e)) / 250 + 361
 * and hunger (tickCount % HUNGER_TICK_INTERVAL(4) === 0) therefore fires when
 *   (t - epochStartMs(e)) / 250 ≡ 3 (mod 4),  i.e.  t ≡ epochStart + 750 (mod 1000)
 * — the SAME absolute times as before the warm-up existed, because WARMUP_MS
 * is exactly 90 whole hunger periods and EPOCH_MS is 3_600 of them (pinned in
 * shoalConst.test.ts). So every "hunger fires at t = 750 + 1000k" derivation
 * in this file is unchanged; only the tickCount LABELS shift by 360, and the
 * comments below name the absolute times rather than the labels wherever the
 * distinction could matter.
 */
import { orderLog, foldShoal, foldTick, rollEpoch, bodiesOf } from './shoalEngine';
import { checkpointFrom, serialiseCheckpoint } from './checkpoint';
import type { LogEntry, Presence, EatClaim, ShoalState, Checkpoint } from './shoalTypes';
import {
  START_SIZE, MIN_SIZE, BITE_GROWTH, TICK_MS,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, PRESENCE_TTL_MS,
  BLOOM_BITES, EAT_COOLDOWN_MS, VOID_WINDOW_MS, MAX_FOLD_TICKS, EPOCH_MS, WARMUP_MS,
  SCATTER_COST,
} from './shoalConst';
import { cellCentre, bitesLeft } from './bloom';
import { epochOf, epochStartMs, epochEndMs, epochFoldEndMs } from './epoch';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function pres(id: string, x: number, y: number, ms: number, hash = id + ms): Presence {
  return { kind: 'presence', id, ms, hash, vec: { x, y, heading: 0, speed: 0, t: ms } };
}
function eat(id: string, cell: number, ms: number, hash = id + 'e' + ms): EatClaim {
  // No position on the claim: the fold derives it from the claimant's own
  // presence vector at `ms`. See EatClaim in shoalTypes.ts.
  return { kind: 'eat', id, cell, ms, hash };
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
  // untilMs must stay below the fold's first hunger tick AFTER this fish
  // exists. Hunger fires at t = 750 + 1000k (see the hunger-phase note in
  // this file's header), so the first firing at or after t=0 is t=750.
  // Folding only to t=500 covers the ticks at t=0,250,500 and none of them
  // is a firing, so this checks pure seeding, uncontaminated by hunger. (The
  // warm-up ticks before t=0 do contain firings, but there is no fish alive
  // during them — the log's first entry is at ms=0.)
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

// --- Time away costs nothing ----------------------------------------------
// Spec 2.7, named load-bearing there: "decay ticks only while present. Time
// away costs nothing, ever. You return the size you left." Seeding a
// returning swimmer from START_SIZE instead inverts that into punishing
// absence, which is the pressure that makes quitting-while-ahead dominant.
{
  // Two cells, far apart, so the second is genuinely fallow when 'a' gets
  // there. cellCentre arithmetic (col*BLOOM_CELL + BLOOM_CELL/2):
  //   cell 700 -> col 700%32 = 28, row floor(700/32) = 21 -> (3648, 2752)
  //   cell 100 -> col 100%32 =  4, row floor(100/32) =  3 -> ( 576,  448)
  const cellA = 700, cellB = 100;
  const A = cellCentre(cellA), B = cellCentre(cellB);
  check('the two feeding cells are where BLOOM_CELL arithmetic puts them',
    A.x === 3648 && A.y === 2752 && B.x === 576 && B.y === 448, { A, B });

  // 'a' parks on A at ms=0 and clears the bloom: six bites at EAT_COOLDOWN_MS
  // spacing (0, 2500, 5000, 7500, 10000, 12500). The first lands in the same
  // tick as its own presence (hash 'a0' < 'ae0') so it passes the real fallow
  // test and latches; the rest ride the latch. Then at ms=15000 it re-seeds
  // onto B — a fallow cell it has never been near, so its first claim there
  // (same tick, presence first) passes the fallow test unlatched — and clears
  // that bloom too: 15000, 17500, 20000, 22500, 25000, 27500.
  //   12 credited bites * BITE_GROWTH(12) = +144
  //
  // It then goes silent. Its last presence is at ms=15000, so
  // expiresMs = 15000 + PRESENCE_TTL_MS(90000) = 105000, and step 2 evicts it
  // at the first tick with t > 105000, i.e. t = 105250.
  //
  // Hunger while present, by hand. Hunger fires at t = 750 + 1000k (see the
  // hunger-phase note in this file's header). Firings with
  // 0 <= t <= 105000: 750, 1750, ..., 104750 —
  // (104750-750)/1000 + 1 = 105 of them. A firing is skipped when the fish
  // bit within HUNGER_TICK_INTERVAL*TICK_MS = 1000 ms. Bites are 2500 apart
  // and firings 1000 apart, so each bite skips exactly one firing (the one in
  // [bite, bite+1000)): 750, 2750, 5750, 7750, 10750, 12750, 15750, 17750,
  // 20750, 22750, 25750, 27750 — 12 skips for 12 bites. Applied = 105 - 12 =
  // 93, each -HUNGER_AMOUNT(1).
  //
  //   size at eviction = START_SIZE(100) + 144 - 93 = 151
  //
  // The floor never binds: the running maximum is 100 + 144 - 16 = 228 at
  // t=27500 and it only declines from there to 151, far above MIN_SIZE(60).
  const LEFT_AT_SIZE = 151; // hand-derived above; deliberately a literal
  const trip: LogEntry[] = [
    pres('a', A.x, A.y, 0),
    eat('a', cellA, 0),
    eat('a', cellA, 1 * EAT_COOLDOWN_MS),
    eat('a', cellA, 2 * EAT_COOLDOWN_MS),
    eat('a', cellA, 3 * EAT_COOLDOWN_MS),
    eat('a', cellA, 4 * EAT_COOLDOWN_MS),
    eat('a', cellA, 5 * EAT_COOLDOWN_MS),
    pres('a', B.x, B.y, 15_000),
    eat('a', cellB, 15_000),
    eat('a', cellB, 15_000 + 1 * EAT_COOLDOWN_MS),
    eat('a', cellB, 15_000 + 2 * EAT_COOLDOWN_MS),
    eat('a', cellB, 15_000 + 3 * EAT_COOLDOWN_MS),
    eat('a', cellB, 15_000 + 4 * EAT_COOLDOWN_MS),
    eat('a', cellB, 15_000 + 5 * EAT_COOLDOWN_MS),
  ];

  // The size it leaves with, observed on the last tick it is still present.
  const leaving = foldShoal(trip, 105_000);
  check('the fish grows to its hand-derived size before going quiet',
    leaving.fish.get('a')!.size === LEFT_AT_SIZE,
    { got: leaving.fish.get('a')!.size, expected: LEFT_AT_SIZE });
  check('that size is well clear of both START_SIZE and the floor',
    LEFT_AT_SIZE > START_SIZE && LEFT_AT_SIZE > MIN_SIZE, { LEFT_AT_SIZE, START_SIZE, MIN_SIZE });

  // It really is evicted — otherwise the return below proves nothing.
  const gone = foldShoal(trip, 105_250);
  check('the silent fish is evicted one tick after its TTL expires',
    !gone.fish.has('a') && gone.departed.has('a'),
    { live: [...gone.fish.keys()], departed: [...gone.departed.keys()] });

  // It comes back at ms=200000. Time absent from the fold is
  // 200000 - 105250 = 94750 ms, and time since its last presence write is
  // 200000 - 15000 = 185000 ms; both exceed PRESENCE_TTL_MS(90000), so this
  // is unambiguously a return from beyond the TTL and not a refreshed
  // presence. t=200000 is not a hunger firing tick (200000 % 1000 = 0, not
  // 750), so nothing is subtracted on the tick it returns.
  const RETURN_MS = 200_000;
  check('the absence provably outlasts the TTL',
    RETURN_MS - 105_250 > PRESENCE_TTL_MS && RETURN_MS - 15_000 > PRESENCE_TTL_MS,
    { awayFromFold: RETURN_MS - 105_250, sinceLastWrite: RETURN_MS - 15_000, PRESENCE_TTL_MS });

  const back = foldShoal([...trip, pres('a', B.x, B.y, RETURN_MS)], RETURN_MS);
  const a = back.fish.get('a')!;
  check('a returning swimmer is exactly the size it left', a.size === LEFT_AT_SIZE,
    { got: a.size, expected: LEFT_AT_SIZE, START_SIZE });

  // The rest of the durable ledger survives too, for the same reason: a bite
  // may be credited as late as the fish's own expiresMs, so dropping these
  // would make "let your presence lapse and rejoin" a free reset of the eat
  // cooldown and a way to launder fresh bites out of the scatter-void ledger.
  // Last credited bite was at 27500; recentBites is pruned on every credit to
  // entries within VOID_WINDOW_MS(10000) of the newest, so at 27500 it holds
  // ms >= 17500: [17500, 20000, 22500, 25000, 27500] — five entries.
  check('the eat cooldown survives the absence', a.lastBiteMs === 27_500,
    { got: a.lastBiteMs, expected: 27_500 });
  check('the scatter-void ledger survives the absence',
    JSON.stringify(a.recentBites) === JSON.stringify([17_500, 20_000, 22_500, 25_000, 27_500]),
    a.recentBites);
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
  // Hand arithmetic: as above, the only hunger firing in [0, 1000] is at
  // t=750. foldShoal skips hunger for a fish
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

// --- A claim is judged where the claimant WAS WHEN IT CLAIMED ---------------
// Step 1 of a tick runs BEFORE step 2's reckon pass, so f.x/f.y at claim time
// still hold the previous tick's position — up to TICK_MS(250) stale. At
// SPEED_DART(220) that is 55 cu against an EAT_R of 90, easily enough to flip
// a claim. Both directions are checked below on one trajectory.
{
  // Cell 100's centre is (4*128+64, 3*128+64) = (576, 448) by BLOOM_CELL
  // arithmetic. 'h' parks on it and takes the first bite at ms=0 (same tick as
  // its own presence, hash 'h0' < 'he0'), which credits against a
  // never-visited cell and LATCHES the bloom. The latch matters: it takes the
  // fallow test out of the picture for every later claim, so the only gate
  // left for the moving fish is the EAT_R distance — which is what is under
  // test. Five bites remain.
  const cell = 100;
  const c = cellCentre(cell);

  // 'm' starts at (8, 448) — same y as the centre, so distance is purely the
  // x gap — heading 0 (+x) at speed 320 cu/s. reckon's dx is
  // trunc(speed * COS[0] * dtMs / (TRIG_SCALE*1000)) and COS[0] is exactly
  // TRIG_SCALE, so dx = trunc(0.32 * dtMs): exactly 80 cu per TICK_MS(250),
  // and 8 (QUANT) divides both 8 and 80, so quantization is a no-op and every
  // tick position is exact.
  //   t=1250  x =  8 + 5*80 = 408   distance to 576 = 168
  //   t=1500  x =  8 + 6*80 = 488   distance          =  88
  //   t=2000  x =  8 + 8*80 = 648   distance          =  72
  //   t=2250  x =  8 + 9*80 = 728   distance          = 152
  // EAT_R is 90, so 88 and 72 are inside (88^2 = 7744 and 72^2 = 5184, both
  // <= EAT_R2 = 8100) while 168 and 152 are outside.
  const setup: LogEntry[] = [
    pres('h', c.x, c.y, 0),
    eat('h', cell, 0),
    { kind: 'presence', id: 'm', ms: 0, hash: 'm0',
      vec: { x: 8, y: c.y, heading: 0, speed: 320, t: 0 } },
  ];

  // (a) Arriving: claimed at ms=1500, where 'm' is 88 cu out — inside EAT_R,
  // so it must credit. The stale position the fold used to judge against is
  // the one from tick 1250, 168 cu out, which would have refused it. So this
  // check fails if the claim is judged on stale coordinates.
  const arriving = foldShoal([...setup, eat('m', cell, 1_500)], 1_500);
  check('a claim that only reaches the bloom at the claimed instant credits',
    arriving.bitesTaken.get(cell) === 2 && arriving.fish.get('m')!.lastBiteMs === 1_500,
    { bitesTaken: arriving.bitesTaken.get(cell), lastBiteMs: arriving.fish.get('m')!.lastBiteMs });

  // (b) Leaving: claimed at ms=2250, where 'm' is 152 cu out — outside EAT_R,
  // so it must NOT credit. The stale position from tick 2000 is 72 cu out,
  // which WOULD have credited it: a fish being paid for a bloom it had
  // already swum past. Only 'h''s opening bite may stand.
  const leaving = foldShoal([...setup, eat('m', cell, 2_250)], 2_250);
  check('a claim from a fish that has already left the bloom does not credit',
    leaving.bitesTaken.get(cell) === 1 && leaving.fish.get('m')!.lastBiteMs === -1,
    { bitesTaken: leaving.bitesTaken.get(cell), lastBiteMs: leaving.fish.get('m')!.lastBiteMs });
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
  // 500 (ticks t=0,250,500, none of which is a t = 750 + 1000k firing) so no
  // hunger tick fires and this test is not contaminated by hunger arithmetic.
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

// --- Scatter, void and hunger on ONE tick, with clampSize binding ----------
// Fix review C6 asked for a test that pins the CONSENSUS order of step 5 (the
// hush) and step 6 (hunger) by putting a fish near MIN_SIZE and having a
// sweep and a hunger firing land on the same tick, so the two orderings
// produce different final sizes.
//
// THEY CANNOT. This is stated here, in the test file, because the claim is
// load-bearing and was wrong in foldTick's own doc comment for a while.
// Every size mutation in either step is a CLAMPED SUBTRACTION against the
// same floor: clampSize(n) is max(n, MIN_SIZE), and step 5 applies
// max(.-SCATTER_COST, F) then max(.-voided*BITE_GROWTH, F) while step 6
// applies max(.-HUNGER_AMOUNT, F). For any positive a, b and any x:
//   max(max(x-a, F) - b, F) = max(x-a-b, F) = max(max(x-b, F) - a, F)
// (if x-a >= F both sides are max(x-a-b, F); if x-a < F the left is
// max(F-b, F) = F and x-a-b < F so the right is F too). Composition of
// clamped subtractions against one floor is symmetric in the subtrahends, so
// no arrangement of scatter, void and hunger can distinguish the orders.
//
// Nor can anything else: the two steps share exactly one piece of state,
// `f.size`. Step 5 additionally writes lastScatterMs, recentBites,
// lastTaken, lastSweepMs and tension, none of which step 6 reads; step 6
// writes tickCount, which step 5 does not read. And `lockedPositions` — the
// one place a size is COPIED for later use — is built from `bodies`, which
// is snapshotted back at step 2, before either step runs.
//
// So the honest state of affairs is: at the current CONSENSUS constants the
// 5/6 order is unobservable, and foldTick's doc no longer claims otherwise.
// This test is still worth having — it pins the TOTAL loss and the clamp on
// the hardest tick this engine has (scatter + void + hunger at once) — but
// it is not, and cannot be, a pin on the ordering.
//
// Geometry and timing are the same as the scatter-voiding tests above: 'a' on
// cellCentre(31) = (4032, 64) and 'anchor' on cellCentre(736) = (64, 3008),
// coreCentre (64, 64), both outside the core from tick 1, so tension climbs
// 750/tick, the hush fires at start+9750 and resolves at start+17750 — which
// is itself a hunger firing time (17750 mod 1000 = 750).
//
// Hand trace for 'a', seeded at 76 so the floor genuinely binds:
//   t=start        seed 76, then the ms=start bite (same tick as its own
//                  presence, hash 'a7200000' < 'ae7200000') credits and
//                  latches: 76 + BITE_GROWTH(12) = 88
//   hunger firings at start+750+1000k. start+750 is skipped (gap 750 < 1000).
//   start+1750 .. start+14750 all apply: 14 firings          88 -> 74
//   t=start+15250  second bite (gap 15250 >= EAT_COOLDOWN_MS) 74 -> 86
//                  recentBites prunes to [start+15250]: the ms=start entry is
//                  15250 old, past VOID_WINDOW_MS(10_000)
//   start+15750    skipped (gap 500 < 1000)
//   start+16750    applies                                    86 -> 85
//   t=start+17750  THE RESOLVE TICK, and a hunger firing:
//                    scatter  clamp(85 - 30) = clamp(55) = 60
//                    void     clamp(60 - 1*12) = clamp(48) = 60
//                    hunger   clamp(60 - 1) = clamp(59) = 60
//                  Unclamped the tick would end at 85 - 43 = 42, so the floor
//                  is doing real work here rather than being a formality.
//   Final: MIN_SIZE(60).
{
  const epoch = 2;
  const start = epochStartMs(epoch);
  const cellA = 31;
  const a = cellCentre(cellA);
  const anchor = cellCentre(736);
  check('the two fixture cells are centred where BLOOM_CELL arithmetic says',
    a.x === 4032 && a.y === 64 && anchor.x === 64 && anchor.y === 3008, { a, anchor });

  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['a', 76], ['anchor', 100]], recent: [] };
  const log: LogEntry[] = [
    pres('anchor', anchor.x, anchor.y, start),
    pres('a', a.x, a.y, start),
    eat('a', cellA, start),
    eat('a', cellA, start + 15_250),
  ];

  // One tick before the resolve: the hand-derived 85, well clear of the floor.
  const before = foldShoal(log, start + 17_500, { epoch, seed });
  check('going into the resolve tick the fish is at the hand-derived 85, not already floored',
    before.fish.get('a')!.size === 85 && before.fish.get('a')!.size > MIN_SIZE,
    { got: before.fish.get('a')!.size, MIN_SIZE });
  check('and it carries exactly one voidable bite',
    JSON.stringify(before.fish.get('a')!.recentBites) === JSON.stringify([start + 15_250]),
    before.fish.get('a')!.recentBites);

  const s = foldShoal(log, start + 17_750, { epoch, seed });
  check('the sweep resolves on the hand-derived tick, which is also a hunger firing',
    s.lastSweepMs === start + 17_750 && (start + 17_750) % 1_000 === 750,
    { lastSweepMs: s.lastSweepMs, expected: start + 17_750 });
  check('the fish is taken', s.lastTaken.includes('a'), s.lastTaken);
  check('scatter, void and hunger on one tick land the fish exactly on the floor',
    s.fish.get('a')!.size === MIN_SIZE, s.fish.get('a')!.size);
  check('and the floor genuinely binds: the unclamped arithmetic is 42, not 60',
    85 - SCATTER_COST - BITE_GROWTH - HUNGER_AMOUNT === 42 && 42 < MIN_SIZE,
    { unclamped: 85 - SCATTER_COST - BITE_GROWTH - HUNGER_AMOUNT, MIN_SIZE });

  // The commutativity above, exercised against the real constants rather than
  // asserted in prose. If a future size mutation stops being a plain clamped
  // subtraction — a percentage scatter, a different floor, a multiplier —
  // this check flips and foldTick's doc has to be revisited, because the 5/6
  // order would then be observable and would need a real pin.
  {
    const clamp = (n: number) => (n < MIN_SIZE ? MIN_SIZE : n);
    let asymmetric = 0;
    for (let x = MIN_SIZE; x <= 400; x++) {
      for (let voided = 0; voided <= 5; voided++) {
        const sweepThenHunger = clamp(clamp(clamp(x - SCATTER_COST) - voided * BITE_GROWTH) - HUNGER_AMOUNT);
        const hungerThenSweep = clamp(clamp(clamp(x - HUNGER_AMOUNT) - SCATTER_COST) - voided * BITE_GROWTH);
        if (sweepThenHunger !== hungerThenSweep) asymmetric++;
      }
    }
    check('every size mutation is a clamped subtraction, so steps 5 and 6 provably commute',
      asymmetric === 0, { asymmetric });
  }
}

// --- The tick origin is absolute, not log-relative --------------------------
// The defect: two clients holding different slices of the same history folded
// on different tick phases. Here, client A additionally holds one long-expired
// entry. Both must produce identical state for the live entries.
//
// A first draft of this test used only STATIONARY fish (matching the brief's
// literal example), and it turned out to be VACUOUS against the mutation this
// is meant to catch — proven by actually reverting the origin to `log[0].ms`
// and observing it still passed (see task-3-report.md's mutation-verification
// section). The reason, worked out by hand: every ms value in the stationary
// version (10_000, 20_000, 40_000 offsets) is itself a multiple of TICK_MS
// (250), so shifting the origin by a non-tick-aligned amount (the stale
// entry's ms, EPOCH_MS + 37) changes the total tick count and the fish's
// creation-tick by amounts that happen to cancel out in the hunger-firing
// count for this particular arithmetic — and a stationary fish's quantized
// REST position never depends on which exact tick it was last computed at.
// So the check needs a MOVING fish: its dead-reckoned position depends on the
// exact absolute ms of the last tick the fold touches, which a phase-shifted
// origin genuinely changes.
//
// Hand derivation (heading 0 so COS[0] = TRIG_SCALE exactly and the trig
// factor cancels: dx = trunc(speed * dtMs / 1000), no rounding surprises).
// 'a' turns to heading 0, speed 40 cu/s in its second write, authored at
// EPOCH_MS + 20_000. untilMs = EPOCH_MS + 40_000, epoch = epochOf(untilMs) = 1
// (pinned explicitly in both folds below, so both use the SAME origin
// EPOCH_MS regardless of the stale entry).
//
//   correct origin (EPOCH_MS, tick-aligned, both folds):
//     last tick <= untilMs = EPOCH_MS + floor(40000/250)*250 = EPOCH_MS+40000
//       (untilMs itself, since 40000/250=160 is exact)
//     dt = (EPOCH_MS+40000) - (EPOCH_MS+20000) = 20000
//     dx = trunc(40*20000/1000) = 800 -> x = 1200+800 = 2000 (mult. of QUANT
//       8 already, so quantize is a no-op; well under WORLD_W(4096), no clamp)
//   MUTATED origin = log[0].ms, WITHOUT the stale entry: log[0].ms is 'a's
//     first write, EPOCH_MS + 10_000 -- itself a multiple of TICK_MS, so this
//     grid happens to be PHASE-IDENTICAL to the correct one. Same numbers:
//     last tick = EPOCH_MS+10000 + floor(30000/250)*250 = EPOCH_MS+40000
//       (30000/250=120 exact) -> dt=20000, dx=800, x=2000. Matches "correct".
//   MUTATED origin = log[0].ms, WITH the stale entry: log[0].ms is now the
//     stale entry, EPOCH_MS + 37 -- NOT a multiple of TICK_MS, so this grid's
//     phase is shifted by 37ms from the other two.
//     last tick <= untilMs = (EPOCH_MS+37) + floor((40000-37)/250)*250
//       = (EPOCH_MS+37) + floor(159.852)*250 = (EPOCH_MS+37) + 159*250
//       = EPOCH_MS + 37 + 39750 = EPOCH_MS + 39787 (213ms short of untilMs)
//     dt = (EPOCH_MS+39787) - (EPOCH_MS+20000) = 19787
//     dx = trunc(40*19787/1000) = trunc(791.48) = 791 -> x_raw = 1991
//     quantize(1991) = floor(1991/8)*8 = floor(248.875)*8 = 248*8 = 1984
//
// So under the log[0].ms mutation, 'a'.x is 2000 without the stale entry but
// 1984 with it -- a real, QUANT-visible divergence -- while the correct,
// epoch-pinned-origin code gives 2000 in both cases. This is now genuinely
// falsifiable: see task-3-report.md for the actual mutation run.
{
  const live: LogEntry[] = [
    pres('a', 1000, 1000, EPOCH_MS + 10_000),
    pres('b', 1010, 1000, EPOCH_MS + 10_000),
    { kind: 'presence', id: 'a', ms: EPOCH_MS + 20_000, hash: 'a' + (EPOCH_MS + 20_000),
      vec: { x: 1200, y: 1000, heading: 0, speed: 40, t: EPOCH_MS + 20_000 } },
  ];
  const stale = pres('old', 500, 500, EPOCH_MS + 37);
  const untilMs = EPOCH_MS + 40_000;
  const epoch = epochOf(untilMs);

  const withoutStale = foldShoal(live, untilMs, { epoch });
  const withStale = foldShoal([stale, ...live], untilMs, { epoch });

  check('the hand-derived position holds under the correct (epoch-pinned) code',
    withoutStale.fish.get('a')!.x === 2000 && withStale.fish.get('a')!.x === 2000,
    { withoutStale: withoutStale.fish.get('a')!.x, withStale: withStale.fish.get('a')!.x });

  const key = (s: ShoalState) =>
    JSON.stringify([...s.fish.entries()]
      .filter(([id]) => id !== 'old')
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.x, v.y]));

  check('an extra stale entry does not shift the fold',
    key(withoutStale) === key(withStale), { a: key(withoutStale), b: key(withStale) });
}
// The origin is the epoch start, so every tick lands on the absolute grid.
{
  const untilMs = EPOCH_MS + 1_000;
  const s = foldShoal([pres('a', 100, 100, EPOCH_MS + 500)], untilMs, { epoch: epochOf(untilMs) });
  check('the fold starts at the epoch boundary, not the first entry',
    s.epoch === epochOf(untilMs), s.epoch);
}
// A cross-check on the origin itself: epochOf(untilMs) is epoch 1 (untilMs =
// EPOCH_MS + 1000 sits one second into hour two, by definition of EPOCH_MS),
// and epochStartMs(1) = 1 * EPOCH_MS = 3_600_000 — the tick grid must start
// there, not at 0 and not at the entry's ms (EPOCH_MS + 500).
check('epoch 1 starts at EPOCH_MS, independent of any entry',
  epochOf(EPOCH_MS + 1_000) === 1 && epochStartMs(1) === EPOCH_MS,
  { epoch: epochOf(EPOCH_MS + 1_000), start: epochStartMs(1), EPOCH_MS });

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

// --- The tick budget ---------------------------------------------------------
// Pre-epoch-origin, foldShoal([], someWallClockMs) started at t=0 and would
// grind through ~1.78e12 / 250 = 7.1e9 ticks — about 77 minutes of dead hang.
// Task 3 (spec section 3.9) resolves that scenario BY CONSTRUCTION rather than
// merely guarding it: with a defaulted epoch, the origin is always
// epochStartMs(epochOf(untilMs)), which sits within [untilMs - EPOCH_MS + 1,
// untilMs] by epoch.ts's own "every ms lies within its own epoch span"
// property (epoch.test.ts). So the span from origin to untilMs is always under
// EPOCH_MS regardless of how large untilMs is, and the tick count is always
// under EPOCH_MS/TICK_MS = 14_400 — two orders of magnitude below
// MAX_FOLD_TICKS (1_000_000). The wall-clock-hang scenario the guard used to
// exist for can no longer arise from a defaulted epoch at all.
//
// MAX_FOLD_TICKS is downgraded to a BACKSTOP: still real, but reachable only
// if a caller passes an EXPLICIT opts.epoch that is far from untilMs (a caller
// bug — e.g. resuming from a long-stale checkpoint's epoch against a much
// later untilMs), not from any value of untilMs alone.
{
  const threw = (fn: () => unknown): Error | null => {
    try { fn(); return null; } catch (e) { return e as Error; }
  };

  // The old dead-hang scenario, re-run against the new code: a wall-clock
  // untilMs against an empty log, with epoch defaulted (no opts passed).
  // epochOf(1_800_000_000_000) = 1_800_000_000_000 / EPOCH_MS(3_600_000) =
  // 500_000 exactly, so epochStartMs(500_000) = 500_000 * 3_600_000 =
  // 1_800_000_000_000 — the SAME value as untilMs. span = 0, so the loop runs
  // exactly 1 tick. It must not throw, and (being one tick) it cannot hang.
  const wallClock = threw(() => foldShoal([], 1_800_000_000_000));
  check('a wall-clock untilMs against empty water no longer needs the guard — the epoch origin bounds it',
    wallClock === null, wallClock?.message);

  // The backstop, re-exercised via an explicit epoch mismatch. Pin opts.epoch
  // to 0 while untilMs is huge, so the span is absurd.
  //
  // The loop starts at epochWarmStartMs(0) = -WARMUP_MS(90_000), not at 0, so
  // the span the guard measures is untilMs + WARMUP_MS and the boundary
  // untilMs values are WARMUP_MS lower than they were before the warm-up
  // existed. Re-derived, not adjusted-until-green:
  //   ticks = floor((untilMs + WARMUP_MS) / TICK_MS) + 1
  //   want ticks == MAX_FOLD_TICKS  ->  untilMs = (MAX_FOLD_TICKS-1)*TICK_MS
  //     - WARMUP_MS = 999_999*250 - 90_000 = 249_999_750 - 90_000 = 249_909_750
  //     span 249_999_750 -> floor(.../250) + 1 = 999_999 + 1 = 1_000_000, allowed
  //   one tick more   ->  untilMs = MAX_FOLD_TICKS*TICK_MS - WARMUP_MS
  //     = 250_000_000 - 90_000 = 249_910_000
  //     span 250_000_000 -> 1_000_000 + 1 = 1_000_001, refused
  const atBudgetMs = (MAX_FOLD_TICKS - 1) * TICK_MS - WARMUP_MS; // 249_909_750
  const overBudgetMs = MAX_FOLD_TICKS * TICK_MS - WARMUP_MS;     // 249_910_000
  check('the budget boundary is where the arithmetic says',
    atBudgetMs === 249_909_750 && overBudgetMs === 249_910_000
      && MAX_FOLD_TICKS === 1_000_000 && WARMUP_MS === 90_000,
    { atBudgetMs, overBudgetMs, MAX_FOLD_TICKS, WARMUP_MS });

  // The budget is now STRICTLY WEAKER than the one-epoch bound: any span the
  // budget would refuse is already many epochs long. A fold of exactly
  // MAX_FOLD_TICKS therefore passes the budget check and is refused by the
  // epoch bound instead — with a different message, which is what makes the
  // two distinguishable rather than "it throws, close enough". The budget
  // survives only as a POLICY backstop against an arithmetic mistake in the
  // epoch bound itself, and it is checked first so its own message still has
  // a reachable case (the one below).
  const atBudget = threw(() => foldShoal([], atBudgetMs, { epoch: 0 }));
  check('a fold of exactly MAX_FOLD_TICKS ticks clears the budget but is refused by the one-epoch bound',
    atBudget instanceof RangeError && atBudget.message.includes('end of epoch 0')
      && !atBudget.message.includes('refusing to run'),
    atBudget?.message);

  const overBudget = threw(() => foldShoal([], overBudgetMs, { epoch: 0 }));
  check('one tick past the budget throws (explicit epoch mismatched with untilMs)',
    overBudget instanceof RangeError, overBudget);
  check('the error names the budget and the offending untilMs',
    overBudget !== null && overBudget.message.includes(String(MAX_FOLD_TICKS))
      && overBudget.message.includes(String(overBudgetMs)),
    overBudget?.message);

  // A defaulted epoch at those SAME untilMs values does not throw at all —
  // confirming the guard fires only on the explicit-epoch caller bug, never
  // as a live limit under ordinary (defaulted-epoch) use.
  const atBudgetDefaulted = threw(() => foldShoal([], atBudgetMs));
  const overBudgetDefaulted = threw(() => foldShoal([], overBudgetMs));
  check('the same untilMs values never throw with a defaulted epoch',
    atBudgetDefaulted === null && overBudgetDefaulted === null,
    { atBudgetDefaulted: atBudgetDefaulted?.message, overBudgetDefaulted: overBudgetDefaulted?.message });

  // A log whose own epoch is recent is fine at the same untilMs — the budget
  // is on the SPAN, not on the absolute value of untilMs. (Redundant with the
  // structural bound above under a defaulted epoch, but kept as a direct
  // observation.)
  const recent = threw(() => foldShoal([pres('a', 100, 100, 1_800_000_000_000)], 1_800_000_010_000));
  check('the budget measures the span, not the absolute timestamp', recent === null, recent?.message);

  // An untilMs before the log even starts is a no-op, not an error. Origin is
  // epochStartMs(epochOf(1_000)) = epochStartMs(0) = 0 (1000 < EPOCH_MS), and
  // the entry at ms=5000 is after untilMs(1000), so it is never applied —
  // this folds to an empty state, not a throw.
  const backwards = threw(() => foldShoal([pres('a', 100, 100, 5_000)], 1_000));
  check('an untilMs before the log starts folds to nothing without throwing',
    backwards === null, backwards?.message);
}

// --- Seeding from a checkpoint (spec 3.9 point 5) ---------------------------
// A joining client adopts the previous epoch's checkpoint instead of
// replaying from genesis. A swimmer named in the seed starts at that size,
// not START_SIZE.
{
  const epoch = 4;
  const start = epochStartMs(epoch);
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['vet', 175]], recent: [] };
  const s = foldShoal([pres('vet', 1000, 1000, start + 500)], start + 1000, { epoch, seed });
  // Hand-derived independently of the brief's own comment (which turns out to
  // agree, but is re-derived here rather than trusted). Ticks in the epoch
  // proper run from t = start while t <= untilMs(start+1000), stepping by
  // TICK_MS(250):
  //   t = start, start+250, start+500, start+750, start+1000
  // Hunger fires at t = start + 750 + 1000k (see this file's header note), so
  // exactly ONE firing lands in that range: t = start+750. The warm-up ticks
  // before `start` contain firings too, but no fish is alive during them —
  // the log's only entry is at ms=start+500 — and the seed is not applied
  // until the epoch's own first ms, precisely so warm-up hunger can never
  // touch a banked size.
  // 'vet's presence is authored at ms=start+500, applied in step 1 of the
  // tick at t=start+500, so 'vet' exists in time for the t=start+750 firing.
  // The seed's `recent` is empty here, so 'vet' is seeded with lastBiteMs=-1
  // (no carried bite state) and the hunger skip condition (f.lastBiteMs>=0 &&
  // t-f.lastBiteMs<1000) is false: hunger DOES apply, exactly once,
  // -HUNGER_AMOUNT(1). t=start+1000 is not a firing.
  //   175 (seeded) - 1 (one hunger tick) = 174
  check('a seeded swimmer starts at their banked size', s.fish.get('vet')!.size === 174,
    s.fish.get('vet')!.size);
  // The Task 2 carry-forward: a live fish and a `departed` record for the
  // same id must not coexist once the fish is revived. Verified directly
  // here, not just inferred from checkpointFrom's dedup.
  check('revival clears the seed record instead of leaving it as garbage',
    !s.departed.has('vet'), [...s.departed.keys()]);
}
{
  // A swimmer absent from the seed is new and starts at START_SIZE. Same
  // tick/hunger timing as above (identical ms values): one hunger firing, at
  // t=start+750. START_SIZE(100) - HUNGER_AMOUNT(1) = 99.
  const epoch = 4;
  const start = epochStartMs(epoch);
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['other', 900]], recent: [] };
  const s = foldShoal([pres('new', 1000, 1000, start + 500)], start + 1000, { epoch, seed });
  check('an unseeded swimmer starts fresh', s.fish.get('new')!.size === START_SIZE - 1,
    s.fish.get('new')!.size);
}
{
  // A checkpoint from the wrong epoch must be refused, not silently applied
  // -- adopting stale sizes would hand a client a different world to
  // everyone else.
  const epoch = 4;
  const start = epochStartMs(epoch);
  const stale: Checkpoint = { epoch: epoch - 5, sizes: [['vet', 900]], recent: [] };
  let threw = false;
  let isRangeError = false;
  try { foldShoal([pres('vet', 1, 1, start)], start + 250, { epoch, seed: stale }); }
  catch (e) { threw = true; isRangeError = e instanceof RangeError; }
  check('a checkpoint from the wrong epoch is refused', threw === true);
  check('the refusal is specifically a RangeError', isRangeError === true);
}

// --- departed prunes at the boundary (spec 3.9 point 6) ---------------------
// An hour away is forgiveable; longer is a fresh start.
//
// The brief's own version of this test builds a state by hand and calls
// checkpointFrom(s, 3) directly, then asserts the swimmer SURVIVES. That is
// vacuous: checkpointFrom has no epoch-awareness at all (checkpoint.ts merges
// `fish` and `departed` unconditionally -- see checkpointFrom's own body,
// which has no "how old is this record" check anywhere), and that exact
// assertion is already covered, more directly, by checkpoint.test.ts's
// "Departed swimmers are included" case. Nothing about the PRUNING RULE is
// exercised: the same assertion would pass identically whether pruning
// exists, is broken, or was never written, because checkpointFrom is not
// where the rule lives. The rule needs to know what happened DURING an
// epoch's fold (was this swimmer touched?), which a bare hand-built
// ShoalState cannot express -- so the test has to go through a real fold.
//
// The prune now lives in `rollEpoch`, not at the end of `foldShoal` (fix
// review I1). It used to be keyed off the SEED's id list, which meant an
// incremental driver -- the shell, which never calls foldShoal at all --
// never ran it and `departed` grew forever. Keying it off `touchedIds` is
// exactly equivalent and needs no seed; see rollEpoch's doc. So these tests
// fold a whole epoch (to epochFoldEndMs, which leaves nowMs exactly on the
// boundary) and roll it, which is what a real client does.
{
  const epoch = 5;
  const start = epochStartMs(epoch);
  // 'ghost' is seeded from the previous epoch and never appears in this
  // epoch's log at all -- absent for the whole epoch, the case under test.
  // 'toucher' is also seeded, but writes presence during the epoch, so it is
  // an ordinary returning swimmer and must NOT be pruned -- the positive
  // control proving this isn't just "pruning wipes everything."
  //
  // 'toucher's size, by hand. Seeded at 200, deliberately far from MIN_SIZE
  // (60) so the floor cannot blur the arithmetic (a first draft of this test
  // seeded at 50 and expected 49, which clampSize would have read as 60).
  // Presence at start+500, so expiresMs = start+90_500 and eviction lands on
  // the first tick past it, t = start+90_750. Hunger fires at
  // t = start + 750 + 1000k, so the firings while it is alive run
  // start+750 ... start+89_750 -- (89_750-750)/1000 + 1 = 90 of them. The
  // eviction tick is itself a firing time, but step 2 deletes the fish
  // before step 6 runs, so it does not count.
  //   200 - 90 * HUNGER_AMOUNT(1) = 110
  // Nothing else happens for the remaining ~58 minutes of the epoch: one
  // departed record and an empty sea.
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['ghost', 175], ['toucher', 200]], recent: [] };
  const log: LogEntry[] = [pres('toucher', 1000, 1000, start + 500)];
  const s = foldShoal(log, epochFoldEndMs(epoch), { epoch, seed });
  check('folding to epochFoldEndMs leaves the state exactly on the epoch boundary',
    s.nowMs === epochEndMs(epoch), { nowMs: s.nowMs, boundary: epochEndMs(epoch) });

  // Before the roll, the untouched seed record is still there: the prune is
  // a boundary operation, not something the fold does continuously.
  check('the untouched seed record survives the fold itself',
    s.departed.has('ghost'), [...s.departed.keys()]);

  const { checkpoint: cp, next } = rollEpoch(s);
  check('the roll prunes the untouched seeded swimmer out of the state',
    !next.fish.has('ghost') && !next.departed.has('ghost'),
    { fish: next.fish.has('ghost'), departed: next.departed.has('ghost') });
  const ids = cp.sizes.map((p) => p[0]);
  check('a swimmer absent the whole epoch is pruned from the next checkpoint',
    !ids.includes('ghost'), cp.sizes);
  check('a swimmer who returned is still checkpointed, at their hand-derived size',
    cp.sizes.find((p) => p[0] === 'toucher')?.[1] === 110, cp.sizes);
}
{
  // The grace-period boundary, checked explicitly: a swimmer who departs
  // DURING this epoch (never seeded -- brand new this fold) must NOT be
  // pruned yet. As of this checkpoint they have been absent less than one
  // epoch; pruning them now would turn "an hour away" into "any absence at
  // all is a fresh start," which is not the rule.
  const epoch = 6;
  const start = epochStartMs(epoch);
  const log: LogEntry[] = [pres('brief', 1000, 1000, start)];
  // Evicted the first tick with t > expiresMs = start + PRESENCE_TTL_MS
  // (90_000), i.e. t = start + 90_250 (90250 / 250 = 361, a real tick), then
  // folded to the end of the epoch.
  const s = foldShoal(log, epochFoldEndMs(epoch), { epoch });
  check('a swimmer evicted mid-epoch (no seed involved) is genuinely departed',
    !s.fish.has('brief') && s.departed.has('brief'),
    { fish: s.fish.has('brief'), departed: s.departed.has('brief') });
  const { checkpoint: cp } = rollEpoch(s);
  check('a swimmer departed only within this epoch survives to the next checkpoint',
    cp.sizes.some((p) => p[0] === 'brief'), cp.sizes);
}
{
  // Prune exemption, exercised directly (a fix-review request, not the
  // original brief): a swimmer seeded, revived (touched), and then evicted
  // AGAIN before this epoch's fold ends must still survive to the next
  // checkpoint. This is distinct from both cases above: "an untouched seeded
  // swimmer" (pruned) never gets revived at all, and "departed only within
  // this epoch" (survives) was never seeded in the first place. This test
  // routes a SEEDED id through an actual revival AND a second eviction in
  // the same fold, proving `touchedIds` -- not "is this id currently absent
  // from `fish`" -- is what gates the prune.
  const epoch = 7;
  const start = epochStartMs(epoch);
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['ronin', 120]], recent: [] };
  const log: LogEntry[] = [pres('ronin', 1000, 1000, start)];
  const s = foldShoal(log, epochFoldEndMs(epoch), { epoch, seed });
  check('a swimmer touched then re-evicted this epoch is genuinely departed again',
    !s.fish.has('ronin') && s.departed.has('ronin'),
    { fish: s.fish.has('ronin'), departed: s.departed.has('ronin') });
  const { checkpoint: cp } = rollEpoch(s);
  check('being touched once this epoch exempts a swimmer from pruning even if departed again',
    cp.sizes.some((p) => p[0] === 'ronin'), cp.sizes);
}

// --- The epoch rolls over, and nothing ticks past its end (fix review I1) ---
// foldTick had no epoch awareness at all: it never read epochEndMs, never
// advanced state.epoch, and never pruned `departed` or cleared `touchedIds`
// -- both of which grow forever under an incremental driver, which is exactly
// what the shell will be.
{
  const epoch = 15;
  const start = epochStartMs(epoch);
  const nextStart = epochStartMs(epoch + 1);
  // 'liveAcross' writes near the end of the epoch, so it is still live when
  // the roll happens: expiresMs = (end - 10_000) + PRESENCE_TTL_MS, well into
  // the next epoch. 'gone' writes at the epoch's start and is long evicted.
  const lateMs = epochEndMs(epoch) - 10_000;
  const log: LogEntry[] = [
    pres('gone', 1_000, 1_000, start),
    pres('liveAcross', 2_000, 2_000, lateMs),
  ];
  const s = foldShoal(log, epochFoldEndMs(epoch), { epoch });
  check('the fixture is non-degenerate: one live swimmer and one departed at the boundary',
    s.fish.has('liveAcross') && s.departed.has('gone') && s.fish.size === 1,
    { fish: [...s.fish.keys()], departed: [...s.departed.keys()] });

  // The refusal. nowMs is exactly epochEndMs, the first ms the epoch does not
  // own, so another tick must be refused rather than silently taken.
  let refused: Error | null = null;
  try { foldTick(s, orderLog(log)); } catch (e) { refused = e as Error; }
  check('foldTick refuses to tick past its epoch\'s end',
    refused instanceof RangeError, refused?.message);
  check('and the refusal points at rollEpoch',
    refused !== null && refused.message.includes('rollEpoch'), refused?.message);

  // The rollover.
  const { checkpoint, next } = rollEpoch(s);
  check('the roll checkpoints the epoch that was folded', checkpoint.epoch === epoch, checkpoint.epoch);
  check('the next state names the next epoch and sits on its first ms',
    next.epoch === epoch + 1 && next.nowMs === nextStart,
    { epoch: next.epoch, nowMs: next.nowMs, nextStart });
  check('touchedIds is re-seeded with exactly the swimmers still live at the boundary',
    next.touchedIds.size === 1 && next.touchedIds.has('liveAcross'),
    [...next.touchedIds]);
  check('the still-live swimmer crosses with the world, not via the checkpoint alone',
    next.fish.has('liveAcross') && next.fish.get('liveAcross')!.x === 2_000,
    { fish: [...next.fish.keys()] });
  // 'gone' was departed and NOT touched... but it WAS touched -- it wrote
  // presence this epoch -- so it is exempt and survives one more epoch.
  check('a swimmer who was in the water this epoch is not pruned at its first boundary',
    next.departed.has('gone') && checkpoint.sizes.some((p) => p[0] === 'gone'),
    { departed: [...next.departed.keys()], sizes: checkpoint.sizes });

  // And the rolled state ticks: the refusal is about the OLD epoch, not a
  // dead end.
  const resumed = foldTick(next, orderLog(log));
  check('the rolled state ticks on into the new epoch',
    resumed.nowMs === nextStart + TICK_MS, resumed.nowMs);

  // Rolling from anywhere but the boundary is refused: a checkpoint taken
  // mid-epoch is not the one other clients compute.
  const mid = foldShoal(log, start + 1_000, { epoch });
  let earlyRoll: Error | null = null;
  try { rollEpoch(mid); } catch (e) { earlyRoll = e as Error; }
  check('rolling before the epoch boundary is refused',
    earlyRoll instanceof RangeError, earlyRoll?.message);
}
{
  // A hand-built seed with a malformed epoch must be refused by foldShoal's
  // OWN check, not merely by parseCheckpoint's wire-format validation --
  // some caller could build a Checkpoint object directly (as every test in
  // this file does) without ever routing it through parseCheckpoint.
  // undefined !== (epoch - 1) is true for any finite epoch, so this throws
  // unconditionally regardless of what `epoch` happens to be.
  const epoch = 4;
  const start = epochStartMs(epoch);
  const badSeed = { epoch: undefined as unknown as number, sizes: [] as Array<[string, number]>, recent: [] };
  let threw = false;
  let isRangeError = false;
  try { foldShoal([], start, { epoch, seed: badSeed }); }
  catch (e) { threw = true; isRangeError = e instanceof RangeError; }
  check('a seed with an undefined epoch is refused', threw === true && isRangeError === true);
}
{
  // NaN !== anything, including NaN itself (NaN !== NaN is true in JS), so
  // this also throws unconditionally -- no finite `epoch - 1` can ever equal
  // NaN.
  const epoch = 4;
  const start = epochStartMs(epoch);
  const badSeed: Checkpoint = { epoch: NaN, sizes: [], recent: [] };
  let threw = false;
  let isRangeError = false;
  try { foldShoal([], start, { epoch, seed: badSeed }); }
  catch (e) { threw = true; isRangeError = e instanceof RangeError; }
  check('a seed with a NaN epoch is refused', threw === true && isRangeError === true);
}

// --- The boundary reset was a real, timeable exploit (fix-review) ----------
// A fixed hourly checkpoint boundary reset lastBiteMs to -1 and recentBites
// to [] for every seeded swimmer, unconditionally. Departed's own doc
// comment (shoalTypes.ts) explains exactly why that must never happen for a
// PRESENCE LAPSE: it hands the swimmer a free EAT_COOLDOWN_MS reset, and
// launders any bite still inside its void window out of reach of the next
// sweep. A fixed epoch boundary reproduces both, and is WORSE than a
// presence lapse: a player can time it deliberately (eat right before the
// boundary, cross over with a clean ledger). The fix carries `recent` --
// lastBiteMs and recentBites for swimmers who ate within VOID_WINDOW_MS of
// the checkpoint -- through the seed.
{
  // Cooldown: a fish that eats immediately before the epoch end and claims
  // again immediately after must be REFUSED by EAT_COOLDOWN_MS, not treated
  // as a first-ever bite.
  const epoch = 8;
  const startE = epochStartMs(epoch);
  // The last real tick of epoch 8's fold: startE + EPOCH_MS - TICK_MS, i.e.
  // one tick short of epoch 9's start (EPOCH_MS/TICK_MS = 14_400 is exact,
  // so this lands on the grid).
  const untilMsE = startE + EPOCH_MS - TICK_MS;
  const startE1 = epochStartMs(epoch + 1);
  check('untilMsE is exactly one tick before the next epoch starts',
    untilMsE + TICK_MS === startE1, { untilMsE, startE1 });

  const cell = 700;
  const c = cellCentre(cell);
  // 'a' eats at the very last tick of epoch 8 (fresh cell, first bite: no
  // cooldown issue -- lastBiteMs starts at -1).
  const logE: LogEntry[] = [pres('a', c.x, c.y, untilMsE), eat('a', cell, untilMsE)];
  const sE = foldShoal(logE, untilMsE, { epoch });
  check('the pre-boundary bite actually credited', sE.fish.get('a')!.lastBiteMs === untilMsE,
    sE.fish.get('a')!.lastBiteMs);

  // Checkpoint at epoch 9: state.nowMs is reset to untilMsE by foldShoal's
  // own last line, so age = untilMsE - untilMsE = 0 <= VOID_WINDOW_MS ->
  // 'a' is carried in `recent`.
  const cp = checkpointFrom(sE, epoch);
  check("'a' is carried in the checkpoint's recent tail", cp.recent.some((r) => r[0] === 'a'), cp.recent);

  // Epoch 9: 'a' claims again at the epoch's very first tick. Gap from the
  // pre-boundary bite: startE1 - untilMsE = TICK_MS(250), far under
  // EAT_COOLDOWN_MS(2500) -- this MUST be refused. Bloom state (lastVisit,
  // bitesTaken) does NOT cross the boundary (spec 3.9 point 3), so the cell
  // is fresh in epoch 9's fold; cooldown is the only thing that can still
  // gate this claim, which is exactly what is under test.
  check('the cross-boundary gap is under EAT_COOLDOWN_MS', startE1 - untilMsE < EAT_COOLDOWN_MS,
    { gap: startE1 - untilMsE, EAT_COOLDOWN_MS });
  const logE1: LogEntry[] = [pres('a', c.x, c.y, startE1), eat('a', cell, startE1)];
  const sE1 = foldShoal(logE1, startE1, { epoch: epoch + 1, seed: cp });
  check('the cross-boundary claim is refused by the cooldown, not credited',
    (sE1.bitesTaken.get(cell) ?? 0) === 0 && sE1.fish.get('a')!.lastBiteMs === untilMsE,
    { bitesTaken: sE1.bitesTaken.get(cell), lastBiteMs: sE1.fish.get('a')!.lastBiteMs, expected: untilMsE });
}
{
  // "The arithmetic matches what it would have been without a boundary in
  // the way" -- checked as directly as this engine's own constants allow.
  //
  // A literal reading of that ask ("a sweep resolving just after the
  // boundary VOIDS a genuinely pre-boundary bite") is impossible under the
  // current CONSENSUS constants, verified by hand rather than assumed:
  // stepTension's per-tick delta is capped at spreadPerMille(max 1000) -
  // TENSION_NEUTRAL(250) = 750 (tension.ts), so reaching TENSION_TRIGGER
  // (30_000) from a fresh epoch's tension=0 takes at least
  // ceil(30000/750) = 40 ticks, triggering the hush no earlier than tick 40
  // (t = epochStart + 39*TICK_MS = epochStart + 9750). The sweep then
  // resolves HUSH_MS(8000) after the hush starts, so the EARLIEST any sweep
  // can resolve in a fresh epoch is epochStart + 9750 + 8000 = +17750. Every
  // pre-boundary bite is, by definition, older than epochStart, so its age
  // at that earliest possible resolve is AT LEAST 17750ms -- which already
  // exceeds VOID_WINDOW_MS(10000). Tension does not cross the epoch boundary
  // (spec 3.9 point 3; emptyState always zeroes it), so there is no way to
  // shorten this: no sweep in the new epoch can EVER resolve within
  // VOID_WINDOW_MS of anything that happened before that epoch started. This
  // is confirmed directly by the existing "headline regression" test
  // elsewhere in this file, which independently derives the same 9750/17750
  // figures for a same-epoch, no-boundary-involved hush.
  //
  // So the property actually worth proving is narrower, and provable: a bite
  // credited just before the boundary, carried through the seed, is
  // correctly retained in `recentBites` and correctly interacts with the
  // SAME on-credit pruning a continuous (non-chopped) fold would apply when
  // the swimmer bites again after crossing -- not merely present as inert
  // leftover, but actually load-bearing in the array the next credit prunes.
  const epoch = 10;
  const startE = epochStartMs(epoch);
  const startE1 = epochStartMs(epoch + 1);
  const cell = 700;
  const c = cellCentre(cell);

  // Pre-boundary bite, 500ms before the boundary (a real tick: 3_599_500 /
  // 250 = 14_398 exact ticks after startE).
  const preMs = startE1 - 500;
  const logE: LogEntry[] = [pres('a', c.x, c.y, preMs), eat('a', cell, preMs)];
  const untilMsE = startE + EPOCH_MS - TICK_MS;
  const sE = foldShoal(logE, untilMsE, { epoch });
  const cp = checkpointFrom(sE, epoch);

  // Post-boundary bite, 2500ms after the boundary. Gap from the pre-boundary
  // bite: (startE1+2500) - (startE1-500) = 3000ms >= EAT_COOLDOWN_MS(2500),
  // so this credits (this test is not about the cooldown -- that's the
  // block above).
  const postMs = startE1 + 2_500;
  check('the post-boundary claim clears the cooldown', postMs - preMs >= EAT_COOLDOWN_MS,
    { gap: postMs - preMs, EAT_COOLDOWN_MS });
  const logE1: LogEntry[] = [pres('a', c.x, c.y, postMs), eat('a', cell, postMs)];
  const sE1 = foldShoal(logE1, postMs, { epoch: epoch + 1, seed: cp });

  // Hand-derived expectation, identical to what the eat branch's own pruning
  // rule (shoalEngine.ts: `[...recentBites, e.ms].filter(ms => e.ms - ms <=
  // VOID_WINDOW_MS)`) would produce in ONE continuous fold spanning both
  // bites with no boundary in the way at all: starting from recentBites=[]
  // before either bite, crediting preMs gives [preMs]; crediting postMs
  // gives [preMs, postMs].filter(ms => postMs - ms <= 10_000). postMs-preMs
  // = 3000 <= 10_000, so preMs survives; postMs-postMs = 0 <= 10_000. Result:
  // [preMs, postMs]. The two-epoch, checkpoint-seeded version must match
  // this EXACTLY -- if the seed had not carried recentBites, the array would
  // have started at [] after crossing and this would read [postMs] only.
  const expected = JSON.stringify([preMs, postMs]);
  check("the post-boundary credit's recentBites matches the continuous-fold derivation",
    JSON.stringify(sE1.fish.get('a')!.recentBites) === expected,
    { got: sE1.fish.get('a')!.recentBites, expected: [preMs, postMs] });
  check('lastBiteMs also reflects the new credit', sE1.fish.get('a')!.lastBiteMs === postMs,
    sE1.fish.get('a')!.lastBiteMs);
}

// =============================================================================
// The warm-up replay (spec 3.9 point 3, fix review's three Criticals)
// =============================================================================
//
// `emptyState` used to BE the epoch boundary: every field outside the
// checkpoint read as zero at a predictable, publicly-readable instant. The
// fold now starts ticking at epochWarmStartMs(e) = epochStartMs(e) -
// WARMUP_MS(90_000) and replays the pre-origin tail, so bloom fallow state,
// live presence, tension and any in-flight hush are RECONSTRUCTED. One test
// per defect, each with a control that fails identically if WARMUP_MS is 0.

// --- 1. The bloom map crosses the boundary ----------------------------------
// Six fish parked on one cell took 0 bites all epoch, then BLOOM_BITES at
// exactly epochStart, then 0 again one tick later: step 1 judges eat claims
// before step 3 runs markVisits, and isBloomReady reads an absent cell as
// ready ("the sea starts full"). That is the parked-blob feed rivalry exists
// to prevent, for one tick, every hour, on a clock anyone can read.
//
// Hand derivation. epoch 12: start = 12 * EPOCH_MS = 43_200_000.
//   target cell 700  -> centre (28*128+64, 21*128+64) = (3648, 2752)
//   away   cell 100  -> centre ( 4*128+64,  3*128+64) = ( 576,  448)
// The two centres are 3072 and 2304 cu apart on the axes — far past
// BLOOM_VISIT_R(200), so standing on one never marks the other.
//
// Six swimmers f0..f5 write presence at start - 30_000 (inside the warm-up
// window, which reaches back to start - 90_000), then write again at ms=start
// and claim cell 700 at ms=start. Within tick t=start, orderLog sorts
// 'f043200000' < 'f0e43200000' (index 2: '0' < 'e') < 'f143200000' (index 1:
// '0' < '1'), so each fish is live before its own claim is judged.
//
//   PARKED run  — the six sat ON cell 700 for the whole warm-up, so
//     markVisits stamped lastVisit(700) on every warm-up tick, most recently
//     at t = start - 250. When step 1 of tick t=start judges the claims,
//     start - (start-250) = 250, nowhere near BLOOM_READY_MS(45_000): every
//     claim is refused. bitesTaken(700) is never written at all.
//   AWAY run    — identical in every respect except that the six spent the
//     warm-up on cell 100 instead. Cell 700 is then genuinely absent from
//     lastVisit, isBloomReady is true, and all six claims credit: exactly
//     BLOOM_BITES(6), the number the review measured.
//
// Sizes, by hand. Hunger fires at t = start + 750 + 1000k (header note), so
// firings while these fish are alive, from t = start-30_000 to t = start, are
// at offsets -29_250, -28_250, ..., -250: (29_250-250)/1000 + 1 = 30 of them.
// t=start itself is not a firing (0 mod 1000 != 750).
//   parked: START_SIZE(100) - 30 = 70, and no bite ever credits
//   away:   100 - 30 + BITE_GROWTH(12) = 82
// Both are clear of MIN_SIZE(60), so the floor never blurs the difference.
{
  const epoch = 12;
  const start = epochStartMs(epoch);
  const target = cellCentre(700);
  const away = cellCentre(100);
  check('epoch 12 starts where the arithmetic says', start === 43_200_000, start);
  check('the two cells are centred where BLOOM_CELL arithmetic says',
    target.x === 3648 && target.y === 2752 && away.x === 576 && away.y === 448, { target, away });
  check('the away cell cannot mark the target cell (well past BLOOM_VISIT_R)',
    Math.abs(target.x - away.x) > 200 && Math.abs(target.y - away.y) > 200, { target, away });

  const PARK_MS = start - 30_000;
  check('the parking write is inside the warm-up window and on the tick grid',
    PARK_MS >= start - WARMUP_MS && PARK_MS % TICK_MS === 0, { PARK_MS, warmStart: start - WARMUP_MS });

  const ids = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'];
  check('the fixture has exactly BLOOM_BITES swimmers, so "all six credit" is the whole bloom',
    ids.length === BLOOM_BITES, { swimmers: ids.length, BLOOM_BITES });

  const build = (warmX: number, warmY: number): LogEntry[] => {
    const out: LogEntry[] = [];
    for (const id of ids) {
      out.push(pres(id, warmX, warmY, PARK_MS));
      out.push(pres(id, target.x, target.y, start));
      out.push(eat(id, 700, start));
    }
    return out;
  };

  const parked = foldShoal(build(target.x, target.y), start, { epoch });
  const arrived = foldShoal(build(away.x, away.y), start, { epoch });

  // The control first: if THIS is not six, the parked run's zero proves
  // nothing (it could be zero for some unrelated reason).
  check('the control credits the full bloom — the cell really is edible at epochStart',
    arrived.bitesTaken.get(700) === BLOOM_BITES, arrived.bitesTaken.get(700));
  check('and every control swimmer is at the hand-derived fed size',
    ids.every((id) => arrived.fish.get(id)!.size === 82 && arrived.fish.get(id)!.lastBiteMs === start),
    ids.map((id) => [id, arrived.fish.get(id)!.size, arrived.fish.get(id)!.lastBiteMs]));

  // The defect itself.
  check('parked fish get ZERO bites at epochStart, not BLOOM_BITES',
    (parked.bitesTaken.get(700) ?? 0) === 0 && !parked.bitesTaken.has(700),
    { bitesTaken: parked.bitesTaken.get(700) });
  check('no parked swimmer records a bite at all',
    ids.every((id) => parked.fish.get(id)!.lastBiteMs === -1),
    ids.map((id) => [id, parked.fish.get(id)!.lastBiteMs]));
  check('parked swimmers are at the hand-derived unfed size, so they were alive and hungry throughout',
    ids.every((id) => parked.fish.get(id)!.size === 70),
    ids.map((id) => [id, parked.fish.get(id)!.size]));
  // And the reason is the reconstructed bloom map, observed directly.
  check('the warm-up reconstructed the fallow clock: cell 700 was last visited one tick ago',
    parked.lastVisit.get(700) === start && arrived.lastVisit.get(700) === start,
    { parked: parked.lastVisit.get(700), arrived: arrived.lastVisit.get(700) });
}

// --- 2. An in-flight hush crosses the boundary ------------------------------
// A hush 2 s in and 6 s from resolving simply vanished, and tension went
// 33_280 -> 0, so any hush starting within HUSH_MS of a boundary was free.
//
// Geometry (shared with the step-order test further down). Four swimmers,
// stationary, at
//   a (0, 1504)   b (1600, 0)   c (1600, 3000)   d (3200, 1504)
// coreCentre medians x and y INDEPENDENTLY and takes the LOWER of the two
// middle values for an even count (fixed.ts's medianInt):
//   x sorted [0, 1600, 1600, 3200] -> index 1 -> 1600
//   y sorted [0, 1504, 1504, 3000] -> index 1 -> 1504
// so the core centre is (1600, 1504) — a point no fish occupies. Each fish is
// 1600, 1504, 1496 and 1600 cu from it, every one far past CORE_R(620), so
// all four read outside the core on every tick: spreadPerMille = 1000 and
// stepTension adds 1000 - TENSION_NEUTRAL(250) = 750 per tick, the fastest
// this fold can go. The closest pair is 1600/1504 apart, far past
// SHELTER_R(340), so all four are exposed and none shelters another.
// Every coordinate is a multiple of QUANT(8), so reckon is exact.
//
// Timeline, from the first tick the four exist (call it W):
//   tension hits TENSION_TRIGGER(30_000) on tick 30_000/750 = 40, i.e. at
//     t = W + 39*TICK_MS = W + 9750   -> hushStartMs
//   input lock  W + 9750 + LOCK_MS(4000)  = W + 13750
//   resolution  W + 9750 + HUSH_MS(8000)  = W + 17750
// Choosing W = epochStart - 15750 puts the hush start at epochStart - 6000,
// the lock at epochStart - 2000, and the RESOLUTION at epochStart + 2000:
// committed before the boundary, resolved after it.
{
  const epoch = 20;
  const start = epochStartMs(epoch);
  const spots: Array<[string, number, number]> = [
    ['a', 0, 1504], ['b', 1600, 0], ['c', 1600, 3000], ['d', 3200, 1504],
  ];
  const RAMP_MS = 9_750;      // 40 ticks at 750/tick to TENSION_TRIGGER
  const LIFT_MS = 15_750;     // epochStart - W

  const scenario = (w: number, refreshAt: number): LogEntry[] => {
    const out: LogEntry[] = [];
    for (const [id, x, y] of spots) out.push(pres(id, x, y, w));
    // A refresh write, so that under a zero warm-up the swimmers still EXIST
    // after the boundary and the failure is "the committed hush was
    // annihilated" rather than "the sea is empty".
    for (const [id, x, y] of spots) out.push(pres(id, x, y, refreshAt));
    return out;
  };

  const W = start - LIFT_MS;
  check('the boundary run\'s arrival is inside the warm-up window, on the grid',
    W >= start - WARMUP_MS && W % TICK_MS === 0, { W, warmStart: start - WARMUP_MS });
  const hushAt = W + RAMP_MS;
  const lockAt = hushAt + 4_000;
  const resolveAt = hushAt + 8_000;
  check('the hush commits before the boundary and resolves after it',
    hushAt === start - 6_000 && lockAt === start - 2_000 && resolveAt === start + 2_000,
    { hushAt, lockAt, resolveAt, start });

  const crossing = scenario(W, start);

  // (a) At the boundary itself, the hush is mid-dread with inputs locked and
  //     tension carrying the whole ramp. Ticks from W to start inclusive:
  //     LIFT_MS/TICK_MS + 1 = 63 + 1 = 64, each +750 -> tension 48_000.
  const atBoundary = foldShoal(crossing, start, { epoch });
  check('at epochStart the hush is still in flight, with inputs already locked',
    atBoundary.hushStartMs === hushAt && atBoundary.lockedPositions !== null
      && atBoundary.lockedPreferred === 'a',
    { hushStartMs: atBoundary.hushStartMs, expected: hushAt,
      locked: atBoundary.lockedPositions !== null, preferred: atBoundary.lockedPreferred });
  check('and tension crossed the boundary at its hand-derived value (64 ticks * 750)',
    atBoundary.tension === 48_000, atBoundary.tension);
  check('all four swimmers are live at the boundary',
    atBoundary.fish.size === 4, [...atBoundary.fish.keys()]);

  // (b) The sweep resolves after the boundary, and takes the hand-derived set.
  //     All four are equally exposed, equally sized (none has ever eaten, so
  //     hunger has treated them identically) and equally long outside the
  //     core, so topContributor keeps the first id it scans, 'a', and
  //     selectTaken reduces to preferred-then-ascending-id, capped at
  //     MAX_TAKE(3): ['a','b','c'], sparing 'd'.
  const resolved = foldShoal(crossing, resolveAt, { epoch });
  check('the committed sweep still resolves, on the far side of the boundary',
    resolved.lastSweepMs === resolveAt, { got: resolved.lastSweepMs, expected: resolveAt });
  check('and it takes the hand-derived set, sparing the fourth',
    JSON.stringify(resolved.lastTaken) === JSON.stringify(['a', 'b', 'c']), resolved.lastTaken);

  // (c) The same scenario with NO boundary anywhere near it must take the
  //     same fish and leave the same sizes. W2 is congruent to W modulo the
  //     1000 ms hunger period (both are 250 mod 1000), so the hunger phase
  //     relative to arrival is identical and the two runs are comparable
  //     tick for tick.
  const W2 = start + 100_250;
  check('the control arrives at the same hunger phase, well inside the same epoch',
    W2 % 1_000 === W % 1_000 && W2 % TICK_MS === 0 && W2 + 17_750 < epochEndMs(epoch),
    { W, W2, epochEnd: epochEndMs(epoch) });
  const control = foldShoal(scenario(W2, W2 + LIFT_MS), W2 + RAMP_MS + 8_000, { epoch });
  check('the no-boundary control resolves its own sweep at the mirrored tick',
    control.lastSweepMs === W2 + RAMP_MS + 8_000, control.lastSweepMs);
  check('the boundary-crossing hush takes exactly the fish the no-boundary one takes',
    JSON.stringify(resolved.lastTaken) === JSON.stringify(control.lastTaken),
    { crossing: resolved.lastTaken, control: control.lastTaken });

  // Sizes, by hand, identical in both runs. Hunger fires 1000 ms apart at
  // t = W + 500 + 1000k (W is 250 mod 1000, firings are 750 mod 1000), so
  // between arrival and the resolve tick (W + 17_750) there are
  // (17_500 - 500)/1000 + 1 = 18 firings; the resolve tick itself is
  // W + 17_750 = 0 mod 1000, not a firing.
  //   untaken 'd': START_SIZE(100) - 18 = 82
  //   taken:       82 - SCATTER_COST(30) = 52 -> clamped to MIN_SIZE(60)
  //                (nobody ate, so there is nothing to void)
  check('the untaken swimmer ends at the hand-derived size in both runs',
    resolved.fish.get('d')!.size === 82 && control.fish.get('d')!.size === 82,
    { crossing: resolved.fish.get('d')!.size, control: control.fish.get('d')!.size });
  check('the taken swimmers end at the hand-derived clamped size in both runs',
    ['a', 'b', 'c'].every((id) => resolved.fish.get(id)!.size === MIN_SIZE
      && control.fish.get(id)!.size === MIN_SIZE),
    { crossing: ['a', 'b', 'c'].map((id) => resolved.fish.get(id)!.size),
      control: ['a', 'b', 'c'].map((id) => control.fish.get(id)!.size) });
}

// --- 3. Live presence crosses the boundary ----------------------------------
// The fold skipped every entry authored before the epoch's origin, but
// PRESENCE_TTL_MS is 90 s: a vector written 10 s before the boundary is live
// for another 80 s and used to yield ZERO fish in the new epoch. The sea
// emptied hourly and refilled only as swimmers happened to rewrite.
//
// Hand derivation. epoch 30: start = 30 * EPOCH_MS = 108_000_000.
//   'liv' writes ONCE, at start - 10_000, from (1000, 1000) — a multiple of
//   QUANT(8) — heading 0 (COS[0] = TRIG_SCALE exactly, SIN[0] = 0 exactly, so
//   the trig factor cancels) at speed 40 cu/s. It never writes again.
//     expiresMs = (start - 10_000) + PRESENCE_TTL_MS(90_000) = start + 80_000
//   so at untilMs = start + 20_000 it is still live with 60 s to spare.
//     dt = (start + 20_000) - (start - 10_000) = 30_000
//     dx = trunc(40 * 30_000 / 1000) = 1200 -> x = 2200 (a multiple of QUANT,
//          so quantize is a no-op), y = 1000 (dy = 0 always)
//   Hunger fires at t = start + 750 + 1000k; from -10_000 to +20_000 the
//   firings are at -9_250, -8_250, ..., 19_750: (19_750 + 9_250)/1000 + 1 =
//   30 of them. size = START_SIZE(100) - 30 = 70, clear of MIN_SIZE(60).
//
//   'dead' writes once at start - 95_000, which is BEFORE the warm-up start
//   (start - 90_000) and therefore expires at start - 5_000, before the epoch
//   even begins. It must NOT be resurrected — that is exactly why WARMUP_MS
//   is PRESENCE_TTL_MS and not something longer: everything the fold skips is
//   already dead.
{
  const epoch = 30;
  const start = epochStartMs(epoch);
  check('epoch 30 starts where the arithmetic says', start === 108_000_000, start);

  const LIVE_AT = start - 10_000;
  const DEAD_AT = start - 95_000;
  check('the live write predates the boundary but is still inside the TTL there',
    LIVE_AT < start && start - LIVE_AT < PRESENCE_TTL_MS
      && LIVE_AT + PRESENCE_TTL_MS === start + 80_000,
    { LIVE_AT, remainingAtBoundary: LIVE_AT + PRESENCE_TTL_MS - start });
  check('the dead write is older than the warm-up window and already expired at the boundary',
    DEAD_AT < start - WARMUP_MS && DEAD_AT + PRESENCE_TTL_MS < start,
    { DEAD_AT, warmStart: start - WARMUP_MS, expiresMs: DEAD_AT + PRESENCE_TTL_MS });

  const log: LogEntry[] = [
    { kind: 'presence', id: 'liv', ms: LIVE_AT, hash: 'liv' + LIVE_AT,
      vec: { x: 1_000, y: 1_000, heading: 0, speed: 40, t: LIVE_AT } },
    pres('dead', 2_000, 2_000, DEAD_AT),
  ];
  const untilMs = start + 20_000;
  const s = foldShoal(log, untilMs, { epoch });

  check('a swimmer whose last write predates the boundary is LIVE in the new epoch',
    s.fish.has('liv'), [...s.fish.keys()]);
  check('and it is at the hand-derived dead-reckoned position, so the warm-up really replayed it',
    s.fish.get('liv')!.x === 2_200 && s.fish.get('liv')!.y === 1_000,
    { x: s.fish.get('liv')!.x, y: s.fish.get('liv')!.y });
  check('and at the hand-derived size: 30 hunger firings across the boundary',
    s.fish.get('liv')!.size === 70, s.fish.get('liv')!.size);
  check('its presence still expires on schedule, unshifted by the boundary',
    s.fish.get('liv')!.expiresMs === start + 80_000, s.fish.get('liv')!.expiresMs);

  // The other direction: the warm-up must not resurrect the genuinely
  // expired. WARMUP_MS === PRESENCE_TTL_MS is what makes these two
  // statements consistent rather than a tuning coincidence.
  check('a swimmer whose vector had already expired is NOT brought back',
    !s.fish.has('dead'), [...s.fish.keys()]);
}

// --- The checkpoint is canonical across fold endpoints (fix review C1) ------
// checkpointFrom used to measure its `recent` cutoff against state.nowMs,
// which foldShoal set to whatever untilMs the caller passed. Same epoch, same
// log, same world, three defensible endpoints -> two different serialisations,
// which destroys the one property a published checkpoint exists for.
//
// The fixture is built so the WORLD is provably identical at all three
// endpoints (so any difference in the output can only come from the cutoff):
// both swimmers are already EVICTED before the earliest endpoint, and a
// `departed` record is frozen — hunger is a while-present cost and nothing
// else in the fold touches it.
//
// Hand arithmetic. epoch 3: start = 3*EPOCH_MS = 10_800_000, end (=
// epochEndMs(3)) = 14_400_000. Cell 700's centre is (28*128+64, 21*128+64) =
// (3648, 2752) by BLOOM_CELL arithmetic.
//   W  = end - 95_000 = 14_305_000   both swimmers arrive, parked on the cell
//        centre (14_305_000 / 250 = 57_220, a real tick)
//   'a' also claims at ms=W. Same tick as its own presence (hash 'a14305000' <
//        'ae14305000', '1' < 'e'), so the claim is judged before that tick's
//        markVisits against a still-empty lastVisit: it credits and LATCHES
//        the cell. Every later claim rides that latch, which is the only way
//        a fish parked on a cell can ever eat from it twice.
//   Ma = end - 11_000 = 14_389_000   'a's second bite. Gap from W is 84_000,
//        far past EAT_COOLDOWN_MS(2500). bitesLeft 5 > 0. Credits.
//   Mz = end -  9_000 = 14_391_000   'z's only bite. Latched, bitesLeft 4,
//        lastBiteMs -1. Credits.
//   Both expire at W + PRESENCE_TTL_MS(90_000) = 14_395_000 and are evicted
//   on the first tick past it, t = 14_395_250. Ma and Mz are both <=
//   14_395_000, so both bites land while their claimant is still live.
//   'a's recentBites after Ma: [W, Ma] pruned to within VOID_WINDOW_MS of Ma
//   -> W is 84_000 old, dropped -> [Ma]. 'z's: [Mz].
//
// Ages at the CANONICAL cutoff, epochEndMs(3) = 14_400_000:
//   'a': 11_000 > VOID_WINDOW_MS(10_000)  -> NOT carried, at every endpoint
//   'z':  9_000 <= 10_000                 -> carried, at every endpoint
// Ages under the OLD state.nowMs cutoff, per endpoint:
//   t1 = 14_398_000: 'a' 9_000  -> carried
//   t2 = 14_399_000: 'a' 10_000 -> carried (inclusive boundary)
//   t3 = 14_399_750: 'a' 10_750 -> dropped        <-- the divergence
// So the old rule emitted two different strings for one world and the new one
// emits a single string that still carries 'z' (non-degenerate).
{
  const epoch = 3;
  const end = epochEndMs(epoch);
  check('epoch 3 ends where the arithmetic says', end === 14_400_000, end);

  const cell = 700;
  const c = cellCentre(cell);
  check('the feeding cell is centred where BLOOM_CELL arithmetic says',
    c.x === 3648 && c.y === 2752, c);

  const W = end - 95_000;
  const Ma = end - 11_000;
  const Mz = end - 9_000;
  check('every fixture timestamp lands on the absolute tick grid',
    W % TICK_MS === 0 && Ma % TICK_MS === 0 && Mz % TICK_MS === 0, { W, Ma, Mz });
  check('both bites land while their claimant is still live (ms <= expiresMs)',
    Ma <= W + PRESENCE_TTL_MS && Mz <= W + PRESENCE_TTL_MS,
    { expiresMs: W + PRESENCE_TTL_MS, Ma, Mz });

  const log: LogEntry[] = [
    pres('a', c.x, c.y, W),
    eat('a', cell, W),
    pres('z', c.x, c.y, W),
    eat('a', cell, Ma),
    eat('z', cell, Mz),
  ];

  const t1 = end - 2_000;             // 14_398_000
  const t2 = end - 1_000;             // 14_399_000
  const t3 = epochFoldEndMs(epoch);   // 14_399_750, the canonical last tick
  check('the three endpoints are distinct real ticks inside epoch 3',
    t1 < t2 && t2 < t3 && t3 === end - TICK_MS
      && t1 % TICK_MS === 0 && t2 % TICK_MS === 0 && t3 % TICK_MS === 0,
    { t1, t2, t3 });
  check('all three endpoints are after both swimmers are evicted (frozen world)',
    t1 > W + PRESENCE_TTL_MS + TICK_MS, { evictedAt: W + PRESENCE_TTL_MS + TICK_MS, t1 });

  const s1 = foldShoal(log, t1, { epoch });
  const s2 = foldShoal(log, t2, { epoch });
  const s3 = foldShoal(log, t3, { epoch });

  // Non-degeneracy: the fixture really did credit three bites and really did
  // leave both swimmers departed, or the comparison below compares two empty
  // worlds and proves nothing.
  check('the fixture credited all three hand-derived bites',
    s3.bitesTaken.get(cell) === 3, s3.bitesTaken.get(cell));
  check('both swimmers really are departed at every endpoint',
    s1.departed.has('a') && s1.departed.has('z') && s3.departed.has('a') && s3.departed.has('z')
      && s3.fish.size === 0,
    { fish: [...s3.fish.keys()], departed: [...s3.departed.keys()] });
  check("'a's ledger is the hand-derived [Ma], not [W, Ma]",
    JSON.stringify(s3.departed.get('a')!.recentBites) === JSON.stringify([Ma]),
    s3.departed.get('a')!.recentBites);

  const c1 = serialiseCheckpoint(checkpointFrom(s1, epoch));
  const c2 = serialiseCheckpoint(checkpointFrom(s2, epoch));
  const c3 = serialiseCheckpoint(checkpointFrom(s3, epoch));
  check('three defensible fold endpoints produce byte-identical checkpoints',
    c1 === c2 && c2 === c3, { c1, c2, c3 });

  // And the shared answer is the hand-derived one, not merely "identical".
  const cp = checkpointFrom(s3, epoch);
  check("the canonical answer carries 'z' (age 9_000) and not 'a' (age 11_000)",
    JSON.stringify(cp.recent) === JSON.stringify([['z', Mz, [Mz]]]), cp.recent);
  check('both swimmers are still checkpointed on SIZE regardless of the recent tail',
    cp.sizes.map((p) => p[0]).join(',') === 'a,z', cp.sizes);
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
