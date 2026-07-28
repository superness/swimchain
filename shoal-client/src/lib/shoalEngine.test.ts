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
  SCATTER_COST, SPEED_DART, SPEED_CRUISE, BLOOM_VISIT_R, BLOOM_READY_MS,
} from './shoalConst';
import { cellCentre, bitesLeft } from './bloom';
import { epochOf, epochStartMs, epochEndMs, epochFoldEndMs } from './epoch';
// shoalFixtures.ts is deliberately NON-EXECUTING (it declares and returns; it
// runs no checks and calls no process.exit), so importing it here cannot run
// another suite as a side effect. `fingerprint` covers the observable world;
// the epoch-boundary section below wraps it to add the fold-internal
// bookkeeping that is consensus-relevant AT a boundary.
import { fingerprint } from './shoalFixtures';

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

// --- A LONE fish cannot farm the cell it is sitting on ----------------------
// The claimant exemption applies to CLAIMS ONLY. The regrowth reset (step 3)
// asks isBloomReady with NO exceptId, so a bloom comes back only once the cell
// has lain fallow to EVERYONE — the last eater included. Without that half,
// the exemption would read "a single fish's stamps never count", the reset
// would fire on every tick a lone fish sat on an emptied cell, and one swimmer
// parked on one cell would out-eat the entire rest of the sea forever: the
// parked-blob feed rivalry exists to prevent, with a blob of one.
//
// Hand derivation. 'a' parks on cell 700's centre (3648, 2752) at ms=0 and
// claims every EAT_COOLDOWN_MS(2500) from ms=0 to ms=120_000 — 49 claims, so
// there is nothing stopping it from eating except the rules.
//   claims 1..6 (ms 0, 2500, 5000, 7500, 10_000, 12_500) credit: the first
//     lands in the same tick as its own presence, before that tick's
//     markVisits, and the next five ride the latch. The 6th empties the bloom
//     (count reaches BLOOM_BITES) and unlatches it.
//   every claim after that is refused by bitesLeft, because bitesTaken(700)
//     is never cleared: 'a' is still parked, so its own stamp on the cell is
//     refreshed on every single tick and the no-exceptId reset never once
//     reads the cell as fallow — for the full 120 s, which is nearly THREE
//     BLOOM_READY_MS windows.
// So bitesTaken(700) is exactly BLOOM_BITES and lastBiteMs is the 6th claim,
// 5 * EAT_COOLDOWN_MS = 12_500, however long the fish sits there.
{
  const cell = 700;
  const c = cellCentre(cell);
  const SIT_MS = 120_000;
  const log: LogEntry[] = [pres('a', c.x, c.y, 0)];
  for (let ms = 0; ms <= SIT_MS; ms += EAT_COOLDOWN_MS) log.push(eat('a', cell, ms));
  check('the fixture gives it far more chances than a bloom has bites, over ~3 fallow windows',
    log.length - 1 === 49 && SIT_MS > 2 * BLOOM_READY_MS,
    { claims: log.length - 1, SIT_MS, BLOOM_READY_MS });
  // Presence is refreshed inside PRESENCE_TTL_MS so the fish never lapses;
  // a lapse would evict it and stop its stamps, which is not what is on trial.
  for (let ms = 60_000; ms <= SIT_MS; ms += 60_000) log.push(pres('a', c.x, c.y, ms, `a-stay${ms}`));

  const s = foldShoal(log, SIT_MS);
  check('a lone fish parked on a cell still gets exactly one bloom out of it, ever',
    s.bitesTaken.get(cell) === BLOOM_BITES && s.fish.get('a')!.lastBiteMs === 5 * EAT_COOLDOWN_MS,
    { bitesTaken: s.bitesTaken.get(cell), lastBiteMs: s.fish.get('a')!.lastBiteMs,
      expectedLastBiteMs: 5 * EAT_COOLDOWN_MS });
  check('...and the cell never regrew under it: still spent, still unlatched',
    !s.bloomSinceMs.has(cell) && s.lastVisit.get(cell)!.get('a') === SIT_MS,
    { latched: s.bloomSinceMs.has(cell), stamp: s.lastVisit.get(cell)!.get('a') });
}

// --- The bloom map stays bounded across a long fold -------------------------
// `lastVisit` is keyed by (cell, SWIMMER) since the claimant-exemption rule, so
// its natural growth mode is not the population of the sea — it is EVERYONE WHO
// EVER SWAM IN IT. One entry per id that ever came within BLOOM_VISIT_R of a
// cell would accumulate for the whole epoch. markVisits therefore drops every
// stamp older than BLOOM_READY_MS, and this pins that the bound really holds
// over a long fold with heavy turnover, not just in the unit test.
//
// THE FIXTURE, built so the expected size is an exact hand-derived number.
//
// Twelve COHORTS of four swimmers each — 48 distinct ids — arriving 100_000 ms
// apart. PRESENCE_TTL_MS is 90_000, so a cohort is fully evicted before the
// next one writes and at most one cohort is ever live. EVERY COHORT PARKS ON
// THE SAME FOUR CELL CENTRES, which is what makes this discriminating: the
// cells are identical run to run, so anything that accumulates can only be the
// ids.
//
// The four parking cells, by (col, row) -> row*BLOOM_COLS(32)+col, and centres
// by col*BLOOM_CELL(128)+64:
//   (3,3)  -> 99   (448, 448)      (13,3) -> 109  (1728, 448)
//   (23,3) -> 119  (3008, 448)     (13,15)-> 493  (1728, 1984)
// No two are within 3 cells of each other on both axes, so their marked blocks
// are disjoint.
//
// A fish parked exactly on a cell centre marks exactly NINE cells. markVisits
// scans dc, dr in [-2, 2] (reach = ceil(BLOOM_VISIT_R(200)/BLOOM_CELL(128)) =
// 2) and keeps a cell when 128^2*(dc^2+dr^2) <= BLOOM_VISIT_R2(40_000), i.e.
// dc^2+dr^2 <= 2.44: the cell itself (0), the four orthogonal neighbours (1)
// and the four diagonals (2). Nine, and 3^2 = 9 confirms the block is the
// 3x3 square.
//
// So with four parked fish on disjoint blocks the map holds EXACTLY 4*9 = 36
// entries across 36 cells — no matter how many cohorts have been and gone.
// Without the prune it would hold 36 per cohort: 36*12 = 432 entries on 36
// cells (the cells are shared, the ids are not).
//
// THE FOLD END. Cohort 11 writes at 11*100_000 = 1_100_000. Fold to
// 1_100_000 + 45_000 = 1_145_000 (1_145_000/250 = 4580, a real tick, and
// inside epoch 0, which spans [0, 3_600_000)):
//   - cohort 11 is still live (it expires at 1_100_000 + 90_000 = 1_190_000),
//     and being parked it re-stamps every tick, so every surviving stamp reads
//     exactly the fold's last tick.
//   - cohort 10's last stamp was on the last tick it was in `bodies`, its own
//     expiry at 1_000_000 + 90_000 = 1_090_000. At the fold end that is
//     55_000 ms old — past BLOOM_READY_MS(45_000) — so it is gone. That 10_000
//     ms of margin is why the fold end is +45_000 and not, say, +1_000, where
//     cohort 10's stamps would still legitimately be inside the window.
{
  const COHORTS = 12;
  const SPACING = 100_000;
  const PARK: Array<[number, number, number]> = [
    [99, 448, 448], [109, 1_728, 448], [119, 3_008, 448], [493, 1_728, 1_984],
  ];
  check('the four parking cells are centred where BLOOM_CELL arithmetic says',
    PARK.every(([cell, x, y]) => cellCentre(cell).x === x && cellCentre(cell).y === y), PARK);
  check('a cohort is fully evicted before the next one arrives',
    SPACING > PRESENCE_TTL_MS, { SPACING, PRESENCE_TTL_MS });

  const log: LogEntry[] = [];
  for (let k = 0; k < COHORTS; k++) {
    for (let i = 0; i < PARK.length; i++) {
      const [, x, y] = PARK[i];
      log.push(pres(`c${k}_${i}`, x, y, k * SPACING));
    }
  }
  const idsEverSeen = COHORTS * PARK.length;
  check('the fixture really does churn the sea: 48 distinct swimmers over the fold',
    log.length === idsEverSeen && idsEverSeen === 48, { entries: log.length, idsEverSeen });

  const END = (COHORTS - 1) * SPACING + 45_000;
  check('the fold end is a real tick inside epoch 0, and clears the previous cohort by 10_000 ms',
    END === 1_145_000 && END % TICK_MS === 0 && END < EPOCH_MS
      && END - ((COHORTS - 2) * SPACING + PRESENCE_TTL_MS) === BLOOM_READY_MS + 10_000,
    { END, prevCohortLastStamp: (COHORTS - 2) * SPACING + PRESENCE_TTL_MS });

  const s = foldShoal(log, END);

  check('only the last cohort is still in the water',
    s.fish.size === PARK.length && [...s.fish.keys()].every((id) => id.startsWith(`c${COHORTS - 1}_`)),
    [...s.fish.keys()]);

  let entries = 0;
  let stampsOutsideWindow = 0;
  let stampsNotOnTheLastTick = 0;
  const ids = new Set<string>();
  for (const [, by] of s.lastVisit) {
    for (const [id, ms] of by) {
      entries++;
      ids.add(id);
      if (END - ms >= BLOOM_READY_MS) stampsOutsideWindow++;
      if (ms !== END) stampsNotOnTheLastTick++;
    }
  }

  check('the bloom map holds the hand-derived 36 entries — nine cells per parked fish, one cohort',
    entries === PARK.length * 9 && entries === 36 && s.lastVisit.size === 36,
    { entries, cells: s.lastVisit.size, expected: 36 });
  check('...and 36 is a TWELFTH of what 12 cohorts would leave unpruned',
    entries * COHORTS === 432, { unpruned: entries * COHORTS });
  check('every stamp belongs to a swimmer still in the water — 4 ids, not the 48 ever seen',
    ids.size === PARK.length && idsEverSeen === 48, { inMap: ids.size, idsEverSeen });
  check('no stamp has aged past BLOOM_READY_MS, which is the bound the prune enforces',
    stampsOutsideWindow === 0 && stampsNotOnTheLastTick === 0,
    { stampsOutsideWindow, stampsNotOnTheLastTick });

  // Length-independence, stated as a comparison rather than inferred from the
  // number above: fold a THIRD of the way in, at the same phase of a cohort's
  // life, and the map is the same size. Growth with fold length is exactly
  // what the prune exists to prevent.
  const EARLY = 3 * SPACING + 45_000;
  const early = foldShoal(log, EARLY);
  let earlyEntries = 0;
  for (const [, by] of early.lastVisit) earlyEntries += by.size;
  check('the map is the same size a third of the way through the fold as at the end',
    earlyEntries === entries, { earlyEntries, entries, EARLY, END });
}

// --- The bloom latch --------------------------------------------------------
// bloomSinceMs makes a bloom RIVALROUS: once a cell has earned its first
// credited bite while genuinely fallow, it stays edible for BLOOM_BITES
// total bites regardless of who keeps swimming over it, because markVisits
// would otherwise re-mark the cell "recently visited" on every subsequent
// tick a fish stands there and permanently block bites 2 through 6.
// --- THE SCHOOL SHADOW: another fish's trample still denies the bloom -------
// The half of the claimant-exemption rule (bloom.ts's header) that stops the
// fix from becoming "everyone can always eat everything". A claim ignores the
// CLAIMANT'S own visits; it honours everybody else's in full, which is what
// keeps spec 2.2's "food grows in the open, safety is in the crowd, and they
// are never in the same place" true.
//
// One fixture, one difference. 'a' parks on cell 700's centre at ms=0 and
// claims at ms=500, both runs identical. In the DENIED run a second fish 'b'
// parks on the same centre, also at ms=0; in the ALONE run it does not exist.
// Nothing else differs — same cell, same claimant, same instants — so the
// difference in outcome can only be b's trample.
//
// Hand derivation. markVisits (step 3) stamps every cell within
// BLOOM_VISIT_R(200) of a fish under THAT FISH'S id, on every tick it is
// there. Both fish sit at distance 0 from the centre. So by the time step 1 of
// tick t=500 judges the claim (step 1 runs before that tick's own markVisits),
// lastVisit(700) already holds stamps written at t=0 and refreshed at t=250:
//   denied run: { a: 250, b: 250 }
//   alone  run: { a: 250 }
// isBloomReady(cell, nowMs=500, exceptId='a') skips a's own stamp and reads
// what is left:
//   denied: b's stamp is 500 - 250 = 250 ms old, far short of
//           BLOOM_READY_MS(45_000) -> NOT ready -> refused.
//   alone : nothing is left -> ready -> credited, and it latches (1 of 6).
// untilMs is 500 (ticks t=0, 250, 500 — none of them a t = 750 + 1000k hunger
// firing), so no hunger fires in either run and size moves only by the bite:
//   denied: START_SIZE(100)
//   alone : START_SIZE + BITE_GROWTH = 112
{
  const cell = 700;
  const c = cellCentre(cell);
  const claim: LogEntry[] = [pres('a', c.x, c.y, 0), eat('a', cell, 500)];

  const denied = foldShoal([...claim, pres('b', c.x, c.y, 0)], 500);
  const alone = foldShoal(claim, 500);

  // The control first: without the other fish this exact claim DOES credit, so
  // the denial below cannot be some unrelated refusal (range, cooldown, an
  // empty bloom) wearing the school shadow's clothes.
  check("the control: the same claim, with nobody else there, credits and latches",
    alone.fish.get('a')!.size === START_SIZE + BITE_GROWTH
      && alone.bitesTaken.get(cell) === 1 && alone.bloomSinceMs.has(cell),
    { size: alone.fish.get('a')!.size, bitesTaken: alone.bitesTaken.get(cell),
      latched: alone.bloomSinceMs.has(cell) });

  // The rule itself.
  check('ANOTHER fish trampling the cell denies the bloom to the claimant',
    denied.fish.get('a')!.size === START_SIZE && (denied.bitesTaken.get(cell) ?? 0) === 0
      && !denied.bloomSinceMs.has(cell),
    { size: denied.fish.get('a')!.size, bitesTaken: denied.bitesTaken.get(cell),
      latched: denied.bloomSinceMs.has(cell) });

  // And the reason, observed directly rather than inferred from the outcome:
  // BOTH fish are stamped against cell 700 in their own names, and the
  // exemption covers exactly one of them. The RETURNED state is the world
  // after tick t=500 has finished, so the stamps read 500 — step 3's markVisits
  // re-stamped them after step 1 had already judged the claim against the
  // t=250 values derived above. (That one-tick lag is the whole reason the
  // claim is judged before the trample, and it is pinned by the step-order
  // tests further down.)
  check("both fish are stamped on the cell in their own names, at the hand-derived 500",
    denied.lastVisit.get(cell)!.get('a') === 500 && denied.lastVisit.get(cell)!.get('b') === 500
      && denied.lastVisit.get(cell)!.size === 2
      && alone.lastVisit.get(cell)!.size === 1,
    { denied: [...denied.lastVisit.get(cell)!], alone: [...alone.lastVisit.get(cell)!] });
}
{
  // A SWIMMER THAT SWIMS IN CAN EAT — the defect this rule exists to fix, on
  // the fold, at both speeds the game has. (Open item 10: measured at ZERO
  // bites before the rule, at dart AND cruise, which is what made the game's
  // core loop unreachable — spec 2.3's whole 60-90 s foraging loop had no
  // engine.)
  //
  // 'a' starts 600 cu west of cell 367's centre (1984, 1472) on heading 0
  // (+x). COS[0] is exactly TRIG_SCALE, so reckon's dx is trunc(speed*dtMs /
  // 1000) with the trig factor cancelling, and QUANT(8) divides every position
  // below exactly.
  //
  //   DART, speed 220 cu/s: 600 cu takes ceil(600*1000/220) = 2728 ms, so the
  //     arrival write is at the next tick boundary, 2750. It crosses
  //     BLOOM_VISIT_R(200) of the target — 400 cu travelled — at 1819 ms, and
  //     reaches EAT_R(90) — 510 cu — at 2319 ms. Those are FOUR ticks apart
  //     (t=2000 vs t=2500 stamps): the old rule's whole problem, and the
  //     reason "raise EAT_R" and "don't stamp inside EAT_R" both measured 0.
  //   CRUISE, speed 60 cu/s: 600 cu takes 10_000 ms exactly; the trample ring
  //     is crossed at 6667 ms, the bite radius at 8500 ms — 8 ticks of dead
  //     bloom under the old rule.
  //
  // On arrival 'a' parks (speed 0) on the centre and claims BLOOM_BITES times
  // at EAT_COOLDOWN_MS(2500) spacing starting one tick after arrival, plus two
  // extra claims that must find the bloom empty. Nobody else is in the sea, so
  // every stamp on the cell is a's own and the exemption covers all of them:
  // all six credit, the seventh and eighth do not (bitesLeft is 0, and the
  // regrowth reset cannot fire while 'a' is still standing there refreshing
  // its own stamp — the reset uses the no-exceptId form).
  //
  // Size, by hand, for the dart run: START_SIZE(100) + 6*BITE_GROWTH(12) = 172
  // before hunger. Hunger fires at t = 750 + 1000k and is skipped when the
  // fish ate within HUNGER_TICK_INTERVAL*TICK_MS (1000 ms). Rather than derive
  // 20-odd firings here, the discriminating assertion is the BITE COUNT; size
  // is checked only for the direction that matters (it must exceed START_SIZE,
  // i.e. the fish grew, which under the old rule it never did).
  const cell = 367;
  const c = cellCentre(cell);
  check('cell 367 is centred where BLOOM_CELL arithmetic says', c.x === 1984 && c.y === 1472, c);

  const swimIn = (speed: number, arriveMs: number): LogEntry[] => {
    const out: LogEntry[] = [
      { kind: 'presence', id: 'a', ms: 0, hash: 'a0',
        vec: { x: c.x - 600, y: c.y, heading: 0, speed, t: 0 } },
      pres('a', c.x, c.y, arriveMs, 'a-arrive'),
    ];
    for (let i = 0; i < BLOOM_BITES + 2; i++) {
      out.push(eat('a', cell, arriveMs + TICK_MS + i * EAT_COOLDOWN_MS));
    }
    return out;
  };

  // Both arrival times are real ticks, and both are AFTER the swimmer has
  // already trampled the cell for several ticks — the condition that made the
  // whole thing unreachable.
  const DART_ARRIVE = 2_750;
  const CRUISE_ARRIVE = 10_000;
  check('both arrivals land on the absolute tick grid, several ticks after the trample ring',
    DART_ARRIVE % TICK_MS === 0 && CRUISE_ARRIVE % TICK_MS === 0
      && DART_ARRIVE - 1_819 > TICK_MS && CRUISE_ARRIVE - 6_667 > TICK_MS,
    { DART_ARRIVE, CRUISE_ARRIVE });

  for (const [name, speed, arriveMs] of [
    ['dart', SPEED_DART, DART_ARRIVE], ['cruise', SPEED_CRUISE, CRUISE_ARRIVE],
  ] as const) {
    const log = swimIn(speed, arriveMs);
    const until = arriveMs + TICK_MS + (BLOOM_BITES + 2) * EAT_COOLDOWN_MS;
    const s = foldShoal(log, until);
    check(`a swimmer that swims in at ${name} speed takes the whole bloom, and no more`,
      s.bitesTaken.get(cell) === BLOOM_BITES && s.fish.get('a')!.size > START_SIZE,
      { bites: s.bitesTaken.get(cell), size: s.fish.get('a')!.size, expected: BLOOM_BITES });
    // Non-degeneracy: it really did approach from outside, so this is not the
    // spawn-on case in disguise. Its FIRST vector puts it 600 cu out — far
    // past BLOOM_VISIT_R, let alone EAT_R.
    check(`...having genuinely approached from outside the trample ring (${name})`,
      600 > BLOOM_VISIT_R && log[0].kind === 'presence' && log[0].vec.x === c.x - 600,
      { startX: log[0].kind === 'presence' ? log[0].vec.x : null, BLOOM_VISIT_R });
  }
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

  // rollEpoch CONSUMES the state: it prunes in place and returns only the
  // checkpoint. There is no `next` -- the next epoch is started by handing
  // this checkpoint to foldShoal (spec 3.9 point 3, "exactly one way to start
  // an epoch"), so the prune reaches the new epoch through the checkpoint and
  // nowhere else.
  const cp = rollEpoch(s);
  check('the roll prunes the untouched seeded swimmer out of the state it consumed',
    !s.fish.has('ghost') && !s.departed.has('ghost'),
    { fish: s.fish.has('ghost'), departed: s.departed.has('ghost') });
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
  const cp = rollEpoch(s);
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
  const cp = rollEpoch(s);
  check('being touched once this epoch exempts a swimmer from pruning even if departed again',
    cp.sizes.some((p) => p[0] === 'ronin'), cp.sizes);

  // The prune fires EXACTLY ONCE per boundary, and the third leg of that
  // argument (see rollEpoch's doc) is idempotence: it deletes exactly
  // {id in departed : id not in touchedIds} and touches neither map
  // otherwise, so that set is empty afterwards. Rolling the same boundary a
  // second time must therefore return a byte-identical checkpoint rather
  // than eroding `departed` a little further each time.
  const cpAgain = rollEpoch(s);
  check('rolling twice at the same boundary is idempotent: the same bytes, not a further prune',
    serialiseCheckpoint(cpAgain) === serialiseCheckpoint(cp),
    { first: serialiseCheckpoint(cp), second: serialiseCheckpoint(cpAgain) });
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

  // The rollover. rollEpoch returns ONLY the checkpoint: no `next`, no
  // carried world (spec 3.9 point 3). The shape is asserted at runtime as
  // well as by the compiler, because "a rollover is a checkpoint plus a
  // normal start" is a consensus rule, not an implementation detail -- a
  // future re-addition of a continuation field is exactly what this catches.
  const checkpoint = rollEpoch(s);
  check('the roll checkpoints the epoch that was folded', checkpoint.epoch === epoch, checkpoint.epoch);
  check('the roll returns a checkpoint and nothing else -- no carried continuation',
    !('next' in (checkpoint as object)) && !('checkpoint' in (checkpoint as object))
      && JSON.stringify(Object.keys(checkpoint)) === JSON.stringify(['epoch', 'sizes', 'recent']),
    Object.keys(checkpoint));
  check('the still-live swimmer crosses in the checkpoint, at its boundary size',
    checkpoint.sizes.some((p) => p[0] === 'liveAcross'), checkpoint.sizes);
  // 'gone' was departed and NOT touched... but it WAS touched -- it wrote
  // presence this epoch -- so it is exempt and survives one more epoch.
  check('a swimmer who was in the water this epoch is not pruned at its first boundary',
    checkpoint.sizes.some((p) => p[0] === 'gone'), checkpoint.sizes);

  // The ONE way onward: hand the checkpoint to a normal seeded fold of the
  // next epoch. 'liveAcross' wrote at epochEndMs(15) - 10_000, which is
  // inside epoch 16's warm-up window (it reaches back to nextStart -
  // WARMUP_MS - PRESENCE_TTL_MS), so the replay -- not a carried state --
  // is what puts it back in the water, at the position it authored.
  const opened = foldShoal(log, nextStart, { epoch: epoch + 1, seed: checkpoint });
  check('the next epoch opens through the warm-up path and reconstructs the live swimmer',
    opened.epoch === epoch + 1 && opened.nowMs === nextStart + TICK_MS
      && opened.fish.has('liveAcross') && opened.fish.get('liveAcross')!.x === 2_000,
    { epoch: opened.epoch, nowMs: opened.nowMs, fish: [...opened.fish.keys()] });
  check('and the warm-up marks the reconstructed swimmer as touched, so it is exempt next boundary',
    opened.touchedIds.has('liveAcross'), [...opened.touchedIds]);

  // Rolling from anywhere but the boundary is refused: a checkpoint taken
  // mid-epoch is not the one other clients compute.
  const mid = foldShoal(log, start + 1_000, { epoch });
  let earlyRoll: Error | null = null;
  try { rollEpoch(mid); } catch (e) { earlyRoll = e as Error; }
  check('rolling before the epoch boundary is refused',
    earlyRoll instanceof RangeError, earlyRoll?.message);
}
{
  // The undefined-epoch case that used to sit here was dropped: its own
  // comment observed that `undefined !== (epoch - 1)` holds for every finite
  // epoch, so it threw unconditionally and could not distinguish a working
  // check from a broken one. The NaN case below is kept because it pins
  // something a plausible rewrite would get wrong: a check written with
  // Math.abs(seed.epoch - (epoch-1)) < 1, or with a `<=` comparison, accepts
  // NaN silently, while `!==` rejects it. It is a hand-built seed rather
  // than a parsed one on purpose -- foldShoal's OWN check has to hold,
  // because a caller can build a Checkpoint object directly (as every test in
  // this file does) without routing it through parseCheckpoint.
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
  // the way": a bite credited just before the boundary, carried through the
  // seed, is correctly retained in `recentBites` and correctly interacts with
  // the SAME on-credit pruning a continuous (non-chopped) fold would apply
  // when the swimmer bites again after crossing -- not merely present as
  // inert leftover, but load-bearing in the array the next credit prunes.
  //
  // A NOTE ON WHAT USED TO BE IMPOSSIBLE HERE. An earlier version of this
  // comment argued at length that a sweep in a new epoch could never void a
  // pre-boundary bite: tension was zeroed at every boundary, so a fresh epoch
  // needed at least ceil(TENSION_TRIGGER(30_000) / 750) = 40 ticks to reach
  // the trigger and HUSH_MS(8000) more to resolve, putting the earliest
  // possible resolve at epochStart + 9750 + 8000 = +17750 -- already past
  // VOID_WINDOW_MS(10_000) from anything before the boundary. That argument
  // was sound for the code it described and is now FALSE: the warm-up replay
  // carries tension and an in-flight hush across the boundary, so a sweep can
  // resolve one tick into a new epoch. The case is exercised directly by the
  // "a carried bite is voidable" test below.
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
  // Per-visitor since the claimant-exemption rule (bloom.ts): every one of the
  // six stamped the cell in its own name, and the newest stamp is `start`
  // itself (the tick they all refreshed on). All six must be present — a
  // single stamp would mean the map had collapsed them, and it is exactly the
  // other five that deny each claimant its bite.
  check('the warm-up reconstructed the fallow clock: all six stamped cell 700, most recently at start',
    ids.every((id) => parked.lastVisit.get(700)!.get(id) === start)
      && parked.lastVisit.get(700)!.size === ids.length
      && ids.every((id) => arrived.lastVisit.get(700)!.get(id) === start),
    { parked: [...(parked.lastVisit.get(700) ?? [])], arrived: [...(arrived.lastVisit.get(700) ?? [])] });
}

// --- 1b. ...and the blob cannot dodge it by stopping 90 s early -------------
// The warm-up above closed the bloom exploit only for a blob whose last write
// lands inside [warmStart, epochStart). The entry cursor skipped everything
// authored before `warmStart`, justified by "those entries are older than
// PRESENCE_TTL_MS at the ORIGIN, so replaying them could not change
// anything" — true at the origin, FALSE for the 360 warm-up ticks, which is
// the window the warm-up itself introduced. A vector authored at
// `warmStart - 1` is live for every one of them.
//
// So the exploit only MOVED 90 s earlier: park the blob, stop refreshing just
// before the warm-up start, and the whole warm-up sees an empty sea, cell 700
// stays absent from `lastVisit`, and BLOOM_BITES lands at exactly epochStart —
// the same number, on the same public clock, now easier to aim at
// deliberately. Measured on this very fixture, moving the park write by two
// milliseconds:
//   PARK_MS = start - 89_999  ->  bitesTaken(700) at epochStart = 0
//   PARK_MS = start - 90_001  ->  bitesTaken(700) at epochStart = 6
// The cursor bound is now `warmStart - PRESENCE_TTL_MS`: the window must
// admit everything still ALIVE during the warm-up, which reaches back
// WARMUP_MS + PRESENCE_TTL_MS = 180 s.
//
// Hand derivation. epoch 13: start = 13 * EPOCH_MS = 46_800_000.
//   warmStart = start - WARMUP_MS(90_000) = 46_710_000
//   window    = warmStart - PRESENCE_TTL_MS(90_000) = start - 180_000
//   PARK_MS   = start - 90_250 — ONE TICK before warmStart (so the old bound
//               skipped it) and comfortably inside the new window.
//               expiresMs = PARK_MS + 90_000 = start - 250, which is the LAST
//               warm-up tick, so the six are alive for all 360 of them; the
//               refresh write at ms = start renews them before step 2 could
//               ever evict them.
//   STALE_MS  = start - 180_250 — one tick OUTSIDE the window, the control
//               for the far edge.
//
// Ordering within tick t = start is the same hash tiebreak as run 1:
// 'f046800000' < 'f0e46800000' (index 2, '4' < 'e') < 'f146800000' (index 1),
// so each fish is live before its own claim is judged.
//
// Sizes, by hand. Hunger fires at t = start + 750 + 1000k. The six are alive
// from the first warm-up tick (t = start - 90_000, where PARK_MS is applied)
// through t = start, so the firings that reach them run start-89_250 ...
// start-250: (89_250 - 250)/1000 + 1 = 90 of them. t = start itself is not a
// firing (0 mod 1000 != 750). START_SIZE(100) - 90 = 10, which CLAMPS to
// MIN_SIZE(60) — the floor binds here, and it binds identically in the
// control, so the 12 that separates them is still exactly BITE_GROWTH:
//   parked : 60          (no bite ever credits)
//   arrived: 60 + 12 = 72
//   stale  : the six are absent from the sea for the whole warm-up, so they
//            arrive brand new at t = start: START_SIZE(100) + 12 = 112, with
//            no hunger at all. That unclamped 112 is what proves the other
//            two runs' 60 really came from 360 ticks of being in the water.
{
  const epoch = 13;
  const start = epochStartMs(epoch);
  const target = cellCentre(700);
  const away = cellCentre(100);
  check('epoch 13 starts where the arithmetic says', start === 46_800_000, start);

  const warmStart = start - WARMUP_MS;
  const windowStart = warmStart - PRESENCE_TTL_MS;
  const PARK_MS = start - 90_250;
  const STALE_MS = start - 180_250;
  check('the park write is one tick BEFORE the warm-up start — the entry the old bound skipped',
    PARK_MS < warmStart && warmStart - PARK_MS === TICK_MS && PARK_MS % TICK_MS === 0,
    { PARK_MS, warmStart });
  check('but it is inside the replay window, which reaches back WARMUP_MS + PRESENCE_TTL_MS',
    PARK_MS >= windowStart && windowStart === start - 180_000, { PARK_MS, windowStart });
  check('and its presence is still live on the LAST warm-up tick, not merely the first',
    PARK_MS + PRESENCE_TTL_MS === start - TICK_MS, PARK_MS + PRESENCE_TTL_MS);
  check('the stale control is one tick outside the window',
    STALE_MS < windowStart && windowStart - STALE_MS === TICK_MS, { STALE_MS, windowStart });

  const ids = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'];
  const build = (warmMs: number, warmX: number, warmY: number): LogEntry[] => {
    const out: LogEntry[] = [];
    for (const id of ids) {
      out.push(pres(id, warmX, warmY, warmMs));
      out.push(pres(id, target.x, target.y, start));
      out.push(eat(id, 700, start));
    }
    return out;
  };

  const parked = foldShoal(build(PARK_MS, target.x, target.y), start, { epoch });
  const arrived = foldShoal(build(PARK_MS, away.x, away.y), start, { epoch });
  const stale = foldShoal(build(STALE_MS, target.x, target.y), start, { epoch });

  // The control first: if THIS is not six, the parked run's zero proves
  // nothing.
  check('the control credits the full bloom — a swimmer who really was elsewhere still eats',
    arrived.bitesTaken.get(700) === BLOOM_BITES, arrived.bitesTaken.get(700));
  check('and every control swimmer is at the hand-derived fed size (MIN_SIZE + BITE_GROWTH)',
    ids.every((id) => arrived.fish.get(id)!.size === MIN_SIZE + BITE_GROWTH
      && arrived.fish.get(id)!.lastBiteMs === start),
    ids.map((id) => [id, arrived.fish.get(id)!.size, arrived.fish.get(id)!.lastBiteMs]));

  // The defect itself: stopping 90 s early must not buy the bloom back.
  check('a blob that stops refreshing just before the warm-up start gets ZERO bites at epochStart',
    (parked.bitesTaken.get(700) ?? 0) === 0 && !parked.bitesTaken.has(700),
    { bitesTaken: parked.bitesTaken.get(700) });
  check('no such swimmer records a bite at all',
    ids.every((id) => parked.fish.get(id)!.lastBiteMs === -1),
    ids.map((id) => [id, parked.fish.get(id)!.lastBiteMs]));
  check('and all six really were in the water for the whole warm-up: 90 hunger firings, floored',
    parked.fish.size === 6 && ids.every((id) => parked.fish.get(id)!.size === MIN_SIZE),
    ids.map((id) => [id, parked.fish.get(id)!.size]));
  check('the warm-up reconstructed the fallow clock from a pre-warm-up write',
    ids.every((id) => parked.lastVisit.get(700)!.get(id) === start)
      && parked.lastVisit.get(700)!.size === ids.length,
    [...(parked.lastVisit.get(700) ?? [])]);

  // The far edge, and the reason it is not a hole: a swimmer whose last write
  // is 180 s old was OUT OF THE SEA for the whole warm-up (PRESENCE_TTL_MS is
  // 90 s), invisible and unsweepable, so the cell really is fallow and the
  // bloom is correctly theirs. Buying it costs 180 s of absence against a
  // 45 s BLOOM_READY_MS — strictly worse than just swimming away.
  check('a swimmer outside the window arrives brand new and the cell is genuinely fallow',
    stale.bitesTaken.get(700) === BLOOM_BITES
      && ids.every((id) => stale.fish.get(id)!.size === START_SIZE + BITE_GROWTH),
    { bites: stale.bitesTaken.get(700), sizes: ids.map((id) => stale.fish.get(id)!.size) });
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
//   'dead' writes once at start - 95_000 and expires at start - 5_000, before
//   the epoch begins. It must NOT be live at the origin.
//
//   THE RATIONALE THIS COMMENT USED TO GIVE WAS FALSE, and correcting it is
//   the point of this paragraph. It said 'dead' sits "BEFORE the warm-up start
//   (start - 90_000)" and therefore that "everything the fold skips is already
//   dead" — which is exactly the reasoning that let a too-narrow cursor bound
//   ship. 'dead' is NOT skipped: the replay window reaches back to
//   `warmStart - PRESENCE_TTL_MS` = start - 180_000, so the fold applies
//   'dead' on its very first warm-up tick and it is ALIVE for 341 of the 360
//   warm-up ticks — marking bloom cells, counting toward coreCentre and
//   spreadPerMille, and sheltering neighbours the whole time. What is true is
//   only the conclusion: it is evicted before the origin.
//     present on ticks start-90_000 .. start-5_000 -> (85_000/250)+1 = 341
//     evicted on the first tick past its expiry, t = start - 4_750, which is
//       19 ticks before the origin
//     hunger fires at t = start + 750 + 1000k, so while present: start-89_250
//       ... start-5_250 -> (84_000/1000)+1 = 85 firings, and it never ate, so
//       none is exempt: START_SIZE(100) - 85 = 15 -> clamped to MIN_SIZE(60)
//   So the honest assertions are: NOT in `fish`, but IS in `departed` — the
//   record a replayed-then-evicted swimmer leaves behind.
//
//   THE CONTROL THAT STILL DISCRIMINATES THE CURSOR BOUND is therefore a
//   third swimmer, 'ancient', at start - 180_250 — one tick older than the
//   window. It is skipped outright, so it appears in NEITHER map, and that
//   absence-from-`departed` is what separates "skipped" from "replayed then
//   evicted". 'edge', at exactly start - 180_000, pins the other side of the
//   same boundary: it is admitted, alive for exactly the one tick at
//   warmStart (its expiry IS warmStart, and step 2 evicts only on
//   t > expiresMs), evicted at warmStart + 250 with no hunger firing in
//   between (warmStart is 0 mod 1000, firings are 750 mod 1000), so it lands
//   in `departed` at exactly START_SIZE. Together they pin `<` rather than
//   `<=`, and pin the window's width at exactly WARMUP_MS + PRESENCE_TTL_MS:
//   an entry is skipped iff its presence had already expired before the first
//   warm-up tick could see it.
{
  const epoch = 30;
  const start = epochStartMs(epoch);
  check('epoch 30 starts where the arithmetic says', start === 108_000_000, start);

  const LIVE_AT = start - 10_000;
  const DEAD_AT = start - 95_000;
  const EDGE_AT = start - 180_000;    // exactly the oldest admitted ms
  const ANCIENT_AT = start - 180_250; // one tick older: skipped
  const windowStart = start - WARMUP_MS - PRESENCE_TTL_MS;
  check('the replay window opens at WARMUP_MS + PRESENCE_TTL_MS before the origin',
    windowStart === start - 180_000, { windowStart, expected: start - 180_000 });
  check('the live write predates the boundary but is still inside the TTL there',
    LIVE_AT < start && start - LIVE_AT < PRESENCE_TTL_MS
      && LIVE_AT + PRESENCE_TTL_MS === start + 80_000,
    { LIVE_AT, remainingAtBoundary: LIVE_AT + PRESENCE_TTL_MS - start });
  check('the dead write is inside the replay window but expires before the origin',
    DEAD_AT >= windowStart && DEAD_AT < start - WARMUP_MS
      && DEAD_AT + PRESENCE_TTL_MS === start - 5_000,
    { DEAD_AT, windowStart, warmStart: start - WARMUP_MS, expiresMs: DEAD_AT + PRESENCE_TTL_MS });
  check('the edge write is the oldest the window admits, expiring exactly on the warm-up start',
    EDGE_AT === windowStart && EDGE_AT + PRESENCE_TTL_MS === start - WARMUP_MS,
    { EDGE_AT, windowStart, expiresMs: EDGE_AT + PRESENCE_TTL_MS });
  check('the ancient write is one tick older than the window and lands on the grid',
    ANCIENT_AT < windowStart && windowStart - ANCIENT_AT === TICK_MS && ANCIENT_AT % TICK_MS === 0,
    { ANCIENT_AT, windowStart });

  const log: LogEntry[] = [
    { kind: 'presence', id: 'liv', ms: LIVE_AT, hash: 'liv' + LIVE_AT,
      vec: { x: 1_000, y: 1_000, heading: 0, speed: 40, t: LIVE_AT } },
    pres('dead', 2_000, 2_000, DEAD_AT),
    pres('edge', 2_000, 2_000, EDGE_AT),
    pres('ancient', 2_000, 2_000, ANCIENT_AT),
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

  // The other direction: the warm-up replays the already-expiring, but must
  // not carry them past their own expiry.
  check('a swimmer whose vector had already expired is NOT live at the origin',
    !s.fish.has('dead'), [...s.fish.keys()]);
  check('but it WAS replayed and evicted, so it left the departed record it should have',
    s.departed.has('dead') && s.departed.get('dead')!.size === MIN_SIZE,
    { departed: [...s.departed.keys()], size: s.departed.get('dead')?.size });
  check('the edge entry — the oldest the window admits — is replayed for its single live tick',
    s.departed.has('edge') && s.departed.get('edge')!.size === START_SIZE,
    { departed: [...s.departed.keys()], size: s.departed.get('edge')?.size });
  check('the ancient entry is SKIPPED outright: neither live nor departed, no trace at all',
    !s.fish.has('ancient') && !s.departed.has('ancient'),
    { fish: [...s.fish.keys()], departed: [...s.departed.keys()] });
}

// --- A carried bite IS voidable by a sweep just after the boundary ----------
// The second half of the `recent` carry -- `recentBites`, the scatter-void
// ledger -- was unreachable before the warm-up existed, for the reason set
// out above. It is reachable now, and this is the test that says so, because
// "we keep this field defensively, it can never matter" is exactly the kind
// of claim that rots into a real hole.
//
// Fixture: the boundary-crossing hush from the warm-up section (four
// swimmers, tension climbing 750/tick from t = epochStart - 15_750, hush at
// epochStart - 6000, lock at epochStart - 2000, resolution at
// epochStart + 2000), plus a checkpoint that carries a bite from
// epochStart - 5000.
//
// Hand derivation, epoch 21 (start = 21 * EPOCH_MS = 75_600_000):
//   The four arrive at W = start - 15_750 as brand-new swimmers (the seed is
//   not applied until the epoch's own first ms), so through the warm-up they
//   are on START_SIZE(100) minus hunger. That does not matter to the outcome
//   because the seed overwrites size at the boundary -- but it is why the
//   LOCK, at start - 2000, freezes pre-seed sizes. All four are equal there,
//   so topContributor keeps 'a' and selectTaken gives ['a','b','c'].
//   At t = start the seed applies: every swimmer to 150, and 'a' alone to
//   lastBiteMs = start - 5000, recentBites = [start - 5000].
//   Hunger fires at t = start + 750 + 1000k. Between the boundary and the
//   resolve tick that is start+750 and start+1750: 2 firings. 'a' is not
//   exempt (gap from its carried bite is 5750 and 6750, both >= 1000).
//     150 - 2 = 148 for everyone entering the resolve tick.
//   t = start + 2000, the resolve tick, is NOT a hunger firing
//   (2000 mod 1000 = 0), so the only losses there are the sweep's:
//     'b','c'  148 - SCATTER_COST(30)                        = 118
//     'a'      148 - 30 = 118, then the void: the carried bite is
//              (start+2000) - (start-5000) = 7000 ms old, inside
//              VOID_WINDOW_MS(10_000), so one bite voids:
//              118 - BITE_GROWTH(12)                          = 106
//     'd'      untaken                                        = 148
//   The control -- byte-identical except that `recent` is empty -- must give
//   'a' 118, exactly BITE_GROWTH more. That difference is the whole claim.
{
  const epoch = 21;
  const start = epochStartMs(epoch);
  const W = start - 15_750;
  const spots: Array<[string, number, number]> = [
    ['a', 0, 1504], ['b', 1600, 0], ['c', 1600, 3000], ['d', 3200, 1504],
  ];
  const log: LogEntry[] = [];
  for (const [id, x, y] of spots) log.push(pres(id, x, y, W));
  for (const [id, x, y] of spots) log.push(pres(id, x, y, start));

  const biteMs = start - 5_000;
  const sizes: Array<[string, number]> = spots.map(([id]) => [id, 150] as [string, number]);
  const carried: Checkpoint = { epoch: epoch - 1, sizes, recent: [['a', biteMs, [biteMs]]] };
  const dropped: Checkpoint = { epoch: epoch - 1, sizes, recent: [] };

  const resolveAt = start + 2_000;
  const withCarry = foldShoal(log, resolveAt, { epoch, seed: carried });
  const without = foldShoal(log, resolveAt, { epoch, seed: dropped });

  check('the sweep resolves two seconds into the new epoch, well inside VOID_WINDOW_MS of the bite',
    withCarry.lastSweepMs === resolveAt && resolveAt - biteMs === 7_000
      && resolveAt - biteMs < VOID_WINDOW_MS,
    { lastSweepMs: withCarry.lastSweepMs, age: resolveAt - biteMs, VOID_WINDOW_MS });
  check('the sweep takes the hand-derived set in both runs',
    JSON.stringify(withCarry.lastTaken) === JSON.stringify(['a', 'b', 'c'])
      && JSON.stringify(without.lastTaken) === JSON.stringify(['a', 'b', 'c']),
    { withCarry: withCarry.lastTaken, without: without.lastTaken });
  check('the untaken swimmer is at the hand-derived 148 in both runs',
    withCarry.fish.get('d')!.size === 148 && without.fish.get('d')!.size === 148,
    { withCarry: withCarry.fish.get('d')!.size, without: without.fish.get('d')!.size });
  check('a taken swimmer with nothing to void loses only SCATTER_COST: 148 -> 118',
    withCarry.fish.get('b')!.size === 118 && withCarry.fish.get('c')!.size === 118,
    { b: withCarry.fish.get('b')!.size, c: withCarry.fish.get('c')!.size });
  check('the swimmer whose carried bite is inside the void window loses BITE_GROWTH more: 106',
    withCarry.fish.get('a')!.size === 106, withCarry.fish.get('a')!.size);
  check('and the voided entry is removed from the ledger, so a later sweep cannot re-void it',
    withCarry.fish.get('a')!.recentBites.length === 0, withCarry.fish.get('a')!.recentBites);
  check('dropping `recent` from the same checkpoint hands that BITE_GROWTH straight back',
    without.fish.get('a')!.size === 118
      && without.fish.get('a')!.size - withCarry.fish.get('a')!.size === BITE_GROWTH,
    { without: without.fish.get('a')!.size, withCarry: withCarry.fish.get('a')!.size });
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

// =============================================================================
// There is exactly ONE way to start an epoch (spec 3.9 point 3)
// =============================================================================
//
// `rollEpoch` used to return a `next` state that carried the live world across
// the boundary. That is a SECOND definition of an epoch's starting state,
// which then has to be kept in agreement with the warm-up replay forever — and
// it is not. Measured on the fixture below, same log, same shared epoch-40
// fold, same checkpoint:
//
//   carried tension at the boundary       17_098   reconstructed  29_880
//   carried outsideTicks('mate')             600   reconstructed     360
//   carried departed('gone').lastBiteMs 144_013_500  reconstructed     -1
//   carried lastVisit(700)              144_091_000  reconstructed  absent
//
// Two honest clients would publish different checkpoints for the same world
// and land their sweeps seconds apart. `outsideTicks` feeds topContributor ->
// lockedPreferred -> selectTaken, so with asymmetric fish that is the "shark
// ate the wrong fish" class directly. The continuation is DELETED, not
// reconciled: a rollover publishes a checkpoint and re-enters through the same
// warm-up path a cold joiner uses.
//
// THE FIXTURE, all of it hand-derived before the fold runs.
// epoch 40: start = 40 * EPOCH_MS = 144_000_000; boundary = epochEndMs(40) =
// epochStartMs(41) = 147_600_000.
//
// 'gone' — a departed swimmer carrying a real bite ledger, so `departed` has
// something the checkpoint provably does NOT carry.
//   presence at start+1_000 parked on cell 700's centre (3648, 2752), then six
//   eat claims at start + 1_000, 3_500, 6_000, 8_500, 11_000, 13_500. The gaps
//   are exactly EAT_COOLDOWN_MS(2_500), which canEat admits (it refuses only
//   a gap strictly LESS than the cooldown). Its own presence sorts before its
//   first claim within tick start+1_000 ('gone144001000' < 'gonee144001000',
//   index 4: '1' < 'e'), so the first claim is judged before that tick's
//   markVisits, against a never-visited cell: it credits and LATCHES, and the
//   next five ride the latch. Six is BLOOM_BITES exactly, so the bloom is
//   emptied and no seventh could credit.
//     size = START_SIZE(100) + 6 * BITE_GROWTH(12) = 172
//   Hunger fires at t = start + 750 + 1000k. 'gone' is present from
//   start+1_000 until its expiry at start+91_000 (evicted on the first tick
//   past it, start+91_250), so the firings that reach it are start+1_750 ...
//   start+90_750 = (89_000/1000) + 1 = 90. It is exempt on a firing when
//   t - lastBiteMs < HUNGER_TICK_INTERVAL*TICK_MS (1_000), which happens at
//   offsets 1_750, 3_750, 6_750, 8_750, 11_750 and 13_750 — one per bite, 6
//   in all. So 84 firings apply:
//     172 - 84 = 88, clear of MIN_SIZE(60), and its ledger keeps
//     lastBiteMs = start + 13_500 = 144_013_500.
//   At the boundary that bite is 3_586_500 ms old, far outside
//   VOID_WINDOW_MS(10_000), so the checkpoint carries 'gone's SIZE and
//   nothing else — which is exactly why a carried `departed` row and a
//   seeded one cannot agree.
//
// 'keep' (1000,1000), 'pal' (1080,1000), 'mate' (3000,3000) — a trio chosen
// so tension climbs at the SLOWEST positive rate this fold has, making the
// ramp longer than the warm-up so the carried and reconstructed answers cannot
// coincide by luck. coreCentre medians each axis independently and takes the
// middle element of an odd count:
//     x sorted [1000, 1080, 3000] -> 1080;  y sorted [1000, 1000, 3000] -> 1000
//   so the centre is (1080, 1000). keep is 80 cu away (6_400 < CORE_R2
//   384_400, inside), pal is 0 away (inside), mate is 1920/2000 away
//   (3_686_400 + 4_000_000 = 7_686_400 > CORE_R2, OUTSIDE). One of three
//   outside gives spreadPerMille = trunc(1000/3) = 333, so stepTension adds
//   333 - TENSION_NEUTRAL(250) = 83 per tick.
//   They write at W1 = boundary - 150_000, W2 = boundary - 70_000 and
//   W3 = boundary + 10_000 — gaps of 80_000, under PRESENCE_TTL_MS(90_000),
//   so they are continuously live from W1 to boundary + 100_000.
//
// EPOCH 40, folded by the veteran. The sea is empty between 'gone's eviction
// and W1, and stepTension floors at zero, so tension is 0 at W1.
//   83n >= TENSION_TRIGGER(30_000) first at n = 362 (83*361 = 29_963,
//     83*362 = 30_046), i.e. t = W1 + 361*TICK_MS = W1 + 90_250 =
//     boundary - 59_750  -> hushStartMs
//   resolution at + HUSH_MS(8_000) = boundary - 51_750, tension -> 0.
//   All three are exposed: keep and pal are 80 apart, so each gives the other
//     SHELTER_BASE(100) + trunc(60/40) = 101, far under SHELTER_THRESHOLD
//     (300). 'mate' is the only fish outside the core so it is the preferred
//     target, and selectTaken is preferred-then-descending-size-then-id over
//     three equal-sized candidates: ['mate','keep','pal'], MAX_TAKE exactly.
//   From the tick after the resolution to the epoch's last tick:
//     boundary-51_500 ... boundary-250 -> (51_250/250) + 1 = 206 ticks
//     tension at the boundary = 206 * 83 = 17_098
//   The next trigger would be 362 ticks later, at boundary + 38_750, so epoch
//   40 contains exactly one sweep.
//   outsideTicks('mate') has counted every tick since W1:
//     (150_000 - 250)/250 + 1 = 600
//
// EPOCH 41, reconstructed. The warm-up starts at boundary - WARMUP_MS =
// boundary - 90_000 and the entry window opens at boundary - 180_000, so W1
// (boundary - 150_000) IS admitted and the trio is live from the very first
// warm-up tick — but tension restarts from 0 there:
//   360 warm-up ticks * 83 = 29_880 at the boundary — 120 short of the
//     trigger, while the veteran's carried state sat at 17_098 having already
//     spent its sweep. The two can never be made to agree.
//   trigger at n = 362 from the warm-up start: t = (boundary - 90_000) +
//     361*250 = boundary + 250; resolution at boundary + 8_250.
//   At T = boundary + 20_000:
//     tension = ticks from boundary+8_500 to T = (11_500/250) + 1 = 47,
//       47 * 83 = 3_901
//     outsideTicks('mate') = (110_000/250) + 1 = 441
{
  const E1 = 40;
  const E2 = 41;
  const E1START = epochStartMs(E1);
  const BOUNDARY = epochEndMs(E1);
  check('epoch 40 spans where the arithmetic says',
    E1START === 144_000_000 && BOUNDARY === 147_600_000 && BOUNDARY === epochStartMs(E2),
    { E1START, BOUNDARY });

  const c700 = cellCentre(700);
  const BITE_OFFSETS = [1_000, 3_500, 6_000, 8_500, 11_000, 13_500];
  check('the six bite gaps are exactly EAT_COOLDOWN_MS, which canEat admits',
    BITE_OFFSETS.length === BLOOM_BITES
      && BITE_OFFSETS.every((o, i) => i === 0 || o - BITE_OFFSETS[i - 1] === EAT_COOLDOWN_MS),
    BITE_OFFSETS);

  const W1 = BOUNDARY - 150_000;
  const W2 = BOUNDARY - 70_000;
  const W3 = BOUNDARY + 10_000;
  check('the trio never lapses: every gap is under PRESENCE_TTL_MS, and all land on the grid',
    W2 - W1 < PRESENCE_TTL_MS && W3 - W2 < PRESENCE_TTL_MS
      && [W1, W2, W3].every((m) => m % TICK_MS === 0),
    { gap1: W2 - W1, gap2: W3 - W2, PRESENCE_TTL_MS });
  check('W1 is inside epoch 41\'s replay window, so the reconstruction sees the trio arrive',
    W1 >= BOUNDARY - WARMUP_MS - PRESENCE_TTL_MS, { W1, windowStart: BOUNDARY - WARMUP_MS - PRESENCE_TTL_MS });

  const trio: Array<[string, number, number]> = [
    ['keep', 1_000, 1_000], ['pal', 1_080, 1_000], ['mate', 3_000, 3_000],
  ];
  const log: LogEntry[] = [pres('gone', c700.x, c700.y, E1START + 1_000)];
  for (const off of BITE_OFFSETS) log.push(eat('gone', 700, E1START + off));
  for (const ms of [W1, W2, W3]) for (const [id, x, y] of trio) log.push(pres(id, x, y, ms));

  // --- The veteran folds epoch 40 and rolls it. -----------------------------
  const vet = foldShoal(log, epochFoldEndMs(E1), { epoch: E1 });
  check('epoch 40 ends at the hand-derived tension, having spent exactly one sweep',
    vet.tension === 17_098 && vet.lastSweepMs === BOUNDARY - 51_750
      && JSON.stringify(vet.lastTaken) === JSON.stringify(['mate', 'keep', 'pal'])
      && vet.hushStartMs === -1,
    { tension: vet.tension, lastSweepMs: vet.lastSweepMs, rel: vet.lastSweepMs - BOUNDARY,
      taken: vet.lastTaken });
  check('and outsideTicks has been counting mate since W1, 600 ticks',
    vet.outsideTicks.get('mate') === 600 && vet.outsideTicks.get('keep') === 0,
    { mate: vet.outsideTicks.get('mate'), keep: vet.outsideTicks.get('keep') });
  check("'gone' departed at the hand-derived size with its real bite ledger intact",
    vet.departed.get('gone')!.size === 88
      && vet.departed.get('gone')!.lastBiteMs === E1START + 13_500,
    { size: vet.departed.get('gone')?.size, lastBiteMs: vet.departed.get('gone')?.lastBiteMs });

  const cp = rollEpoch(vet);
  check('the checkpoint is the hand-derived one: sizes only, and no recent tail',
    serialiseCheckpoint(cp) ===
      '{"epoch":40,"sizes":[["gone",88],["keep",60],["mate",60],["pal",60]],"recent":[]}',
    serialiseCheckpoint(cp));
  check("the boundary drops 'gone's bite ledger, because it is far outside VOID_WINDOW_MS",
    cp.recent.length === 0 && BOUNDARY - (E1START + 13_500) > VOID_WINDOW_MS,
    { age: BOUNDARY - (E1START + 13_500), VOID_WINDOW_MS });

  // --- Both clients open epoch 41 the ONLY way there is. --------------------
  // The veteran drives incrementally after the seeded open, which is what a
  // shell does; the cold joiner has never seen epoch 40 at all and holds only
  // the published checkpoint. Nothing else crosses the boundary.
  const T = BOUNDARY + 20_000;
  const ordered = orderLog(log);
  const veteranPath = foldShoal(log, BOUNDARY, { epoch: E2, seed: cp });
  while (veteranPath.nowMs <= T) foldTick(veteranPath, ordered);
  const coldJoiner = foldShoal(log, T, { epoch: E2, seed: cp });

  // Non-degeneracy first: epoch 41 must actually be a live world at T, or
  // "byte-identical" is a comparison of two empty seas.
  check('epoch 41 is a live world at T: three fish, a resolved sweep, real tension',
    coldJoiner.fish.size === 3 && coldJoiner.lastSweepMs >= 0
      && coldJoiner.tension > 0 && (coldJoiner.outsideTicks.get('mate') ?? 0) > 0,
    { fish: [...coldJoiner.fish.keys()], lastSweepMs: coldJoiner.lastSweepMs,
      tension: coldJoiner.tension });

  // The reconstructed values, hand-derived — and every one of them differs
  // from what the deleted continuation would have carried.
  check('epoch 41 reconstructs the hand-derived tension and outside-tick count, NOT the carried ones',
    coldJoiner.tension === 3_901 && coldJoiner.outsideTicks.get('mate') === 441,
    { tension: coldJoiner.tension, outsideTicks: coldJoiner.outsideTicks.get('mate') });
  check('its sweep lands at the hand-derived reconstructed tick, seconds off the carried ramp',
    coldJoiner.lastSweepMs === BOUNDARY + 8_250, coldJoiner.lastSweepMs - BOUNDARY);
  check("and 'gone' comes back through the checkpoint alone: size kept, bite ledger reset",
    coldJoiner.departed.get('gone')!.size === 88
      && coldJoiner.departed.get('gone')!.lastBiteMs === -1
      && coldJoiner.departed.get('gone')!.recentBites.length === 0,
    coldJoiner.departed.get('gone'));
  check('the bloom map is reconstructed from the warm-up, so epoch 40\'s stamp on cell 700 is gone',
    !coldJoiner.lastVisit.has(700) && coldJoiner.lastVisit.size > 0,
    { has700: coldJoiner.lastVisit.has(700), cells: coldJoiner.lastVisit.size });

  // THE COMPARISON. Everything, including the fold-internal bookkeeping the
  // shared `fingerprint` deliberately omits — `touchedIds` decides the next
  // boundary's prune, `outsideTicks` decides who the shark prefers, and
  // `tickCount` decides hunger's phase, so all three are consensus-relevant
  // at a boundary even though they are not part of the visible world.
  const fullPrint = (s: ShoalState): string => JSON.stringify({
    world: fingerprint(s),
    epoch: s.epoch,
    nowMs: s.nowMs,
    tickCount: s.tickCount,
    cursor: s.cursor,
    touchedIds: [...s.touchedIds].sort(),
    outsideTicks: [...s.outsideTicks.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
  });
  check('a rollover followed by a fresh seeded fold IS a cold fold, byte for byte',
    fullPrint(veteranPath) === fullPrint(coldJoiner),
    { veteran: fullPrint(veteranPath), cold: fullPrint(coldJoiner) });

  // The obligation the ruling puts on the joiner, stated as a test: the fold
  // CANNOT detect a missing prefix. A joiner holding only the entries at or
  // after the boundary folds a different world and never learns it.
  const shortLog = log.filter((e) => e.ms >= BOUNDARY);
  const underfed = foldShoal(shortLog, T, { epoch: E2, seed: cp });
  check('a joiner missing the 180 s prefix folds a DIFFERENT world, silently',
    fullPrint(underfed) !== fullPrint(coldJoiner) && underfed.tension !== coldJoiner.tension,
    { shortTension: underfed.tension, fullTension: coldJoiner.tension });
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
