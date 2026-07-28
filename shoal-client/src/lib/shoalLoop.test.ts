/**
 * The loop — incremental fold and epoch rollover. Run:
 *   npx tsx src/lib/shoalLoop.test.ts
 *
 * ## The one check in here that does NOT discriminate, and why it is still here
 *
 * The brief for this task called the fingerprint form of the idempotence
 * property "the one that stops a refetch double-crediting bites." MEASURED, ON
 * THIS ENGINE, THAT IS FALSE, and the check is kept only after saying so:
 *
 *   foldShoal(log,        epochFoldEndMs(40), { epoch: 40 })
 *   foldShoal([...log, ...log],   same args)          -> byte-identical
 *   foldShoal([...log, ...log, ...log], same args)    -> byte-identical
 *
 * Applying an identical entry twice is already a no-op in the fold, for two
 * independent reasons:
 *
 *  - A presence write is LAST-WRITE-WINS into `state.fish`, and the second
 *    application reads the row the first one just wrote as its own `prior`
 *    (shoalEngine.ts's step 1), so every field it derives is the field it
 *    already holds.
 *  - A duplicate eat claim is REFUSED BY ITS OWN COOLDOWN. The first copy sets
 *    `f.lastBiteMs = e.ms`; the second reaches `canEat` with
 *    `nowMs - lastBiteMs === 0 < EAT_COOLDOWN_MS` (bloom.ts:129) and returns
 *    false, so no size, no `bitesTaken` count and no `recentBites` entry moves.
 *
 * So a fingerprint comparison across a double `advance` CANNOT fail when the
 * dedupe is removed — it is exactly the vacuous check this project has shipped
 * before. The discriminating assertions for the dedupe are therefore at the
 * ADMISSION level (`ordered.length` and `replays`), and they are the ones the
 * mutation run is scored against. The fingerprint check stays because it is
 * the property a caller actually relies on and because the absorption above is
 * a fact about TODAY'S consensus constants, not a licence: a future verb that
 * accumulates rather than latches (a vote, a counter, a costly-signal `call`)
 * would double-credit on the first refetch, and this check is what would catch
 * it.
 *
 * ## What the fixture is
 *
 * `richSession()` shifted so its whole arc lands in the last 30 s of epoch 40,
 * plus one extra eat claim 5 s before the boundary so the checkpoint's
 * `recent` tail is non-empty. That gives a boundary that is genuinely alive: a
 * sweep resolves 4 s before it, two bites are credited, twelve swimmers are
 * still present across it, and three distinct hand-derived sizes survive it.
 * Every expected number below is worked out from the CONSENSUS constants in
 * comments before the code that checks it.
 */
import { createLoop, advance, admitFloorMs } from './shoalLoop';
import { foldShoal, rollEpoch, orderLog } from './shoalEngine';
import { serialiseCheckpoint } from './checkpoint';
import { richSession, fingerprint } from './shoalFixtures';
import { epochStartMs, epochEndMs, epochFoldEndMs, epochWarmStartMs } from './epoch';
import {
  EPOCH_MS, TICK_MS, WARMUP_MS, PRESENCE_TTL_MS, START_SIZE, MIN_SIZE,
  BITE_GROWTH, SCATTER_COST, HUNGER_AMOUNT, VOID_WINDOW_MS, MAX_TAKE, HUSH_MS,
} from './shoalConst';
import type { LogEntry, Presence } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// =============================================================================
// The fixture, and the arithmetic behind every number in it
// =============================================================================
//
// EPOCH_MS(3_600_000) / TICK_MS(250) = 14_400 exactly, so every epoch boundary
// is itself a tick. Epoch 40 therefore runs:
//   epochStartMs(40)   = 40 * 3_600_000 = 144_000_000
//   epochEndMs(40)     = 41 * 3_600_000 = 147_600_000   (= epoch 41's start)
//   epochFoldEndMs(40) = 147_600_000 - 250 = 147_599_750 (its last legal tick)
//   epochWarmStartMs(40) = 144_000_000 - WARMUP_MS(90_000) = 143_910_000
//   admit floor          = 143_910_000 - PRESENCE_TTL_MS(90_000) = 143_820_000
const E = 40;
const BOUNDARY = epochEndMs(E);          // 147_600_000
const FOLD_END = epochFoldEndMs(E);      // 147_599_750
const ADMIT = epochWarmStartMs(E) - PRESENCE_TTL_MS; // 143_820_000

// The session is shifted so richSession()'s ms=0 lands 30 s before the
// boundary. Its own derivation (shoalEngine.determinism.test.ts and
// shoalEngine.incremental.test.ts both hand-derive it for this same log):
// tension reaches TENSION_TRIGGER at +18_000, the hush runs HUSH_MS(8_000),
// so the sweep RESOLVES at +26_000 — i.e. 4 s before the boundary, inside
// epoch 40. Presence is authored at +0 and lives PRESENCE_TTL_MS(90_000), so
// every swimmer is still alive 60 s into epoch 41.
const OFFSET = BOUNDARY - 30_000;        // 147_570_000
const SWEEP_MS = OFFSET + 18_000 + HUSH_MS; // 147_596_000
// The extra claim. e0 sits on cell 367's centre forever, so that cell is
// re-stamped in `lastVisit` every tick and can never go fallow — but the first
// bite LATCHED it (1 of BLOOM_BITES(6) taken), and a latched bloom bypasses
// the fallow test entirely (shoalEngine.ts step 1). 25_000 ms is well past
// EAT_COOLDOWN_MS(2_500), so this second claim credits.
const X_MS = OFFSET + 25_000;            // 147_595_000, i.e. BOUNDARY - 5_000
const X_HASH = 'e0e2';
// 5_000 <= VOID_WINDOW_MS(10_000), so e0 — and only e0, nobody else ever ate —
// lands in the checkpoint's `recent` tail.
const TO_MS = BOUNDARY + 3_000;          // 147_603_000

// A swimmer who ate early in epoch 40 and then lapsed, far enough back that
// epoch 41's fold cannot even READ its entries: GONE_MS is 400 s before the
// boundary, and epoch 41's cursor only admits from BOUNDARY - 180_000.
//
// It is here to make section 5's byte-identical comparison DISCRIMINATING, and
// it was added because the comparison was measured passing without it. With
// the whole fixture inside the last 30 s of the epoch, a carried continuation
// and a cold re-entry reconstruct the same world by accident: everything either
// one accumulates (tension, outsideTicks, lastVisit, the sweep) began after
// epoch 41's own warm-up start, so both compute it identically. `gone` is the
// state that only a carried continuation could still be holding — spec 3.9's
// own measurement of the deleted continuation is exactly this shape
// ("carried departed('gone').lastBiteMs 144_013_500 reconstructed -1").
//
// Cell 100 = row 3 * BLOOM_COLS(32) + col 4, centre
// (4*128+64, 3*128+64) = (576, 448) — far from the cluster's (1984, 1472).
const GONE_MS = BOUNDARY - 400_000;      // 147_200_000
const GONE_CELL = 100;

function shoalLog(): LogEntry[] {
  const out: LogEntry[] = richSession().map((e) => (e.kind === 'presence'
    ? { ...e, ms: e.ms + OFFSET, vec: { ...e.vec, t: e.vec.t + OFFSET } }
    : { ...e, ms: e.ms + OFFSET }));
  out.push({ kind: 'eat', id: 'e0', cell: 367, ms: X_MS, hash: X_HASH });
  // 'g0' < 'ge0' on the third character, so the presence write is applied
  // before the claim that depends on it — the same convention richSession uses.
  out.push({
    kind: 'presence', id: 'gone', ms: GONE_MS, hash: 'g0',
    vec: { x: 576, y: 448, heading: 0, speed: 0, t: GONE_MS },
  });
  out.push({ kind: 'eat', id: 'gone', cell: GONE_CELL, ms: GONE_MS, hash: 'ge0' });
  return out;
}
const LOG = shoalLog();
const WITHOUT_X = LOG.filter((e) => e.hash !== X_HASH);

/** A presence write by a swimmer nobody else in the fixture uses. */
function ghost(ms: number): Presence {
  return {
    kind: 'presence', id: 'z', ms, hash: `z${ms}`,
    vec: { x: 3_000, y: 2_000, heading: 0, speed: 0, t: ms },
  };
}

check('the epoch grid is exact: EPOCH_MS is a whole number of ticks',
  EPOCH_MS % TICK_MS === 0 && EPOCH_MS / TICK_MS === 14_400, EPOCH_MS / TICK_MS);
check('the fixture lands where the arithmetic above says',
  BOUNDARY === 147_600_000 && FOLD_END === 147_599_750 && OFFSET === 147_570_000 &&
  SWEEP_MS === 147_596_000 && X_MS === 147_595_000 && ADMIT === 143_820_000,
  { BOUNDARY, FOLD_END, OFFSET, SWEEP_MS, X_MS, ADMIT });
check('WARMUP_MS is PRESENCE_TTL_MS, so the admit floor is 180 s before the epoch start',
  WARMUP_MS === PRESENCE_TTL_MS && epochStartMs(E) - ADMIT === 180_000,
  { WARMUP_MS, PRESENCE_TTL_MS, back: epochStartMs(E) - ADMIT });
check('the module agrees with the hand-derived admit floor',
  admitFloorMs(E) === ADMIT, { got: admitFloorMs(E), expected: ADMIT });
check('every hash in the fixture is unique — orderLog\'s total order requires it, and it is ' +
  'what makes hash a sound dedupe key',
  new Set(LOG.map((e) => e.hash)).size === LOG.length, LOG.length);

// =============================================================================
// Section 0 — the two open items are real
// =============================================================================
//
// THE_SHOAL_OPEN_ITEMS.md section 8: "foldShoal throws a RangeError at every
// epoch end, so a naive foldShoal(log, Date.now()) in the shell hard-throws
// once an hour until rollEpoch is wired." Pinned here so the crossing test
// below is provably non-trivial — without a rollover, folding to TO_MS is not
// merely wrong, it is impossible.
{
  let threw: unknown = null;
  try { foldShoal(LOG, TO_MS, { epoch: E }); } catch (e) { threw = e; }
  check('the naive whole-log fold past the epoch end throws a RangeError (open item 8)',
    threw instanceof RangeError, threw instanceof Error ? threw.message.slice(0, 80) : threw);
}

// =============================================================================
// Section 1 — the reference lineage, folded entirely by the engine
// =============================================================================
//
// Everything the loop is compared against is built here, by straight engine
// calls with no shell involved: a cold whole-epoch fold of epoch 40, its
// canonical checkpoint, and a cold fold of epoch 41 seeded by it. Two
// independent lineages is the whole point — comparing the loop to itself
// would prove nothing.
const COLD_E = foldShoal(LOG, FOLD_END, { epoch: E });
const COLD_FP = fingerprint(COLD_E);
const COLD_CP = rollEpoch(COLD_E);      // consumes COLD_E; nothing folds it again
const COLD_NEXT = foldShoal(LOG, TO_MS, { epoch: E + 1, seed: COLD_CP });
const COLD_NEXT_FP = fingerprint(COLD_NEXT);

// --- Hand-derived state at FOLD_END, from the constants alone ---------------
//
// Ticks: the swimmers are authored at OFFSET and the last tick of the epoch is
// FOLD_END = OFFSET + 29_750, so they are alive for (29_750/250)+1 = 120 ticks.
//
// Hunger fires when tickCount % HUNGER_TICK_INTERVAL(4) === 0. The fold's tick
// loop starts at epochWarmStartMs(40) and WARMUP_MS(90_000) is exactly 90
// whole hunger periods of 1_000 ms, so — exactly as
// shoalEngine.incremental.test.ts derives for its own epoch-0 fold — firings
// land at epochStartMs + 750 + 1000k. epochStartMs(40) and OFFSET are both
// multiples of 1_000, so relative to OFFSET the firings are at
// OFFSET + 750 + 1000k. In [OFFSET, OFFSET+29_750] that is k = 0..29:
// THIRTY firings.
//
//  e0 (the eater): START_SIZE(100)
//                  + BITE_GROWTH(12) at OFFSET          -> 112
//                  + BITE_GROWTH(12) at X_MS            -> 124
//        exempt from hunger only when t - lastBiteMs < HUNGER_TICK_INTERVAL *
//        TICK_MS = 1_000. lastBiteMs is OFFSET until X_MS, then X_MS:
//          OFFSET+750     : 750 - 0      =   750 < 1000  -> exempt
//          OFFSET+25_750  : 25_750-25_000 = 750 < 1000  -> exempt
//          the other 28 firings           -> hungry
//                  - 28 * HUNGER_AMOUNT(1)              -> 96
//  c1,c2,c3,o3..o7 (never ate): 100 - 30 * 1            -> 70
//  o0,o1,o2 (swept): 26 firings land strictly before the sweep tick
//        (OFFSET+750 .. OFFSET+25_750), so they are at 100 - 26 = 74 when the
//        sweep resolves at SWEEP_MS (a multiple of 1_000, so no hunger on that
//        tick itself, and step 5 precedes step 6 regardless).
//                  - SCATTER_COST(30) = 44, clamped to MIN_SIZE(60)  -> 60
//        The 4 later firings each try -1 against the same floor -> still 60.
const E0_SIZE = START_SIZE + 2 * BITE_GROWTH - 28 * HUNGER_AMOUNT;      // 96
const IDLE_SIZE = START_SIZE - 30 * HUNGER_AMOUNT;                      // 70
const SWEPT_SIZE = MIN_SIZE;                                            // 60
check('the hand-derived sizes are the three distinct values the arithmetic gives',
  E0_SIZE === 96 && IDLE_SIZE === 70 && SWEPT_SIZE === 60 &&
  START_SIZE - 26 * HUNGER_AMOUNT - SCATTER_COST < MIN_SIZE,
  { E0_SIZE, IDLE_SIZE, SWEPT_SIZE });
check('the cold epoch-40 fold ends exactly on the boundary, ready for rollEpoch',
  COLD_NEXT.epoch === E + 1 && COLD_CP.epoch === E, { cp: COLD_CP.epoch });
// 'gone' is alone for its whole life, so `outsideCore` puts the median on its
// own position and `stepTension` only ever subtracts TENSION_NEUTRAL against a
// zero spread — it can never start a hush, and it never touches the cluster's
// arc. It contributes exactly two things: a `departed` row carrying a real
// bite ledger, and a stale `lastVisit` stamp around cell 100.
//   size: START_SIZE(100) + BITE_GROWTH(12) = 112, then 90 hunger firings over
//   its PRESENCE_TTL_MS life (one of them exempt, the one 750 ms after its
//   bite) -> 112 - 89 = 23, clamped to MIN_SIZE(60).
check('the long-departed swimmer lapsed with a real bite ledger (what only a carried ' +
  'continuation could still be holding)',
  COLD_E.departed.get('gone') !== undefined &&
  COLD_E.departed.get('gone')!.lastBiteMs === GONE_MS &&
  JSON.stringify(COLD_E.departed.get('gone')!.recentBites) === JSON.stringify([GONE_MS]) &&
  COLD_E.departed.get('gone')!.size === MIN_SIZE,
  COLD_E.departed.get('gone'));
check('and epoch 41 cannot even read its entries — they are below that epoch\'s admit floor',
  GONE_MS < admitFloorMs(E + 1) && GONE_MS >= admitFloorMs(E),
  { GONE_MS, floor41: admitFloorMs(E + 1), floor40: admitFloorMs(E) });
check('the cold epoch-40 fold matches the hand-derived sizes',
  COLD_CP.sizes.length === 13 &&
  (COLD_CP.sizes.find(([id]) => id === 'e0') ?? [, -1])[1] === E0_SIZE &&
  (COLD_CP.sizes.find(([id]) => id === 'c1') ?? [, -1])[1] === IDLE_SIZE &&
  (COLD_CP.sizes.find(([id]) => id === 'o0') ?? [, -1])[1] === SWEPT_SIZE,
  COLD_CP.sizes);
check('and the hand-derived recent tail: e0 alone, its last bite X_MS, ' +
  `${BOUNDARY - X_MS} ms before the boundary (<= VOID_WINDOW_MS)`,
  BOUNDARY - X_MS <= VOID_WINDOW_MS && COLD_CP.recent.length === 1 &&
  COLD_CP.recent[0][0] === 'e0' && COLD_CP.recent[0][1] === X_MS &&
  JSON.stringify(COLD_CP.recent[0][2]) === JSON.stringify([X_MS]),
  COLD_CP.recent);

// =============================================================================
// Section 2 — dedupe: entries already folded are not admitted twice
// =============================================================================
//
// Two SEPARATE lineages, so the comparison is between two states that were
// actually built independently (advance mutates the state it is handed, so
// re-advancing one lineage and comparing it to itself would be a no-op).
{
  const once = advance(createLoop(E, null), LOG, FOLD_END).loop;
  let twice = advance(createLoop(E, null), LOG, FOLD_END).loop;
  const admittedAfterFirst = twice.ordered.length;
  const replaysAfterFirst = twice.replays;
  twice = advance(twice, LOG, FOLD_END).loop;

  // Non-degeneracy FIRST. An inert world compares equal to another inert world.
  check('the once-advanced loop actually resolved a sweep (non-degenerate)',
    once.state.lastSweepMs === SWEEP_MS && once.state.lastTaken.length === MAX_TAKE,
    { lastSweepMs: once.state.lastSweepMs, expected: SWEEP_MS, taken: once.state.lastTaken });
  check('the shark took only exposed swimmers — never one of the sheltered cluster',
    once.state.lastTaken.every((id) => id.startsWith('o')), once.state.lastTaken);
  check('the once-advanced loop actually credited both bites (non-degenerate)',
    once.state.bitesTaken.get(367) === 2, [...once.state.bitesTaken.entries()]);
  check('and it lands on the three hand-derived sizes',
    once.state.fish.get('e0')!.size === E0_SIZE &&
    once.state.fish.get('c1')!.size === IDLE_SIZE &&
    once.state.fish.get('o0')!.size === SWEPT_SIZE,
    { e0: once.state.fish.get('e0')!.size, c1: once.state.fish.get('c1')!.size,
      o0: once.state.fish.get('o0')!.size });
  check('the incremental loop agrees with the cold whole-epoch fold, byte-for-byte',
    fingerprint(once.state) === COLD_FP,
    { loop: fingerprint(once.state), cold: COLD_FP });

  // THE DISCRIMINATING DEDUPE CHECKS. See this file's header for why the
  // fingerprint check below cannot carry this on its own.
  check('a second advance over the same entries admits nothing new',
    twice.ordered.length === admittedAfterFirst && admittedAfterFirst === LOG.length,
    { after1: admittedAfterFirst, after2: twice.ordered.length, log: LOG.length });
  check('and therefore triggers no replay — the whole point of the incremental path',
    twice.replays === replaysAfterFirst && twice.replays === 0,
    { after1: replaysAfterFirst, after2: twice.replays });
  check('advancing twice with the same entries equals advancing once (the property callers rely on)',
    fingerprint(twice.state) === fingerprint(once.state),
    { twice: fingerprint(twice.state), once: fingerprint(once.state) });

  // The refetch really is a fresh array in a different order every poll —
  // neither array identity nor arrival order may leak into the world.
  const shuffled = orderLog(LOG).slice().reverse();
  const viaShuffle = advance(createLoop(E, null), shuffled, FOLD_END).loop;
  check('a refetch delivered in reverse order folds the identical world',
    fingerprint(viaShuffle.state) === COLD_FP, fingerprint(viaShuffle.state));
}

// =============================================================================
// Section 3 — THE LATE-ENTRY RULE: absorb by bounded replay, never drop
// =============================================================================
//
// The rule, asserted here and documented in shoalLoop.ts's header:
//
//   An entry that arrives with an `ms` at or before the last tick already
//   folded is NEVER dropped and NEVER applied out of order. The epoch is
//   re-folded from its own warm start, through the same seeded `foldShoal` a
//   cold joiner runs. `advance` is therefore a pure function of (epoch, seed,
//   the SET of entries admitted, toMs) — arrival order cannot change the world.
//
// Non-degeneracy first: the late entry must actually be observable, or
// "absorbed correctly" means nothing.
{
  const withX = foldShoal(LOG, FOLD_END, { epoch: E });
  const withoutX = foldShoal(WITHOUT_X, FOLD_END, { epoch: E });
  check('the late entry is observable: the same fold with and without it differs',
    fingerprint(withX) !== fingerprint(withoutX),
    { withX: withX.fish.get('e0')!.size, withoutX: withoutX.fish.get('e0')!.size });
  // Specifically it is the second credited bite — and the gap is BITE_GROWTH
  // PLUS one hunger tick, not BITE_GROWTH alone. Without X, e0's `lastBiteMs`
  // stays at OFFSET forever, so the firing at OFFSET+25_750 (which the second
  // bite makes exempt: 25_750 - 25_000 = 750 < 1_000) also lands:
  //   without X: 100 + 12 - 29 * 1 = 83     with X: 96     gap = 13
  check('specifically it is the second credited bite (plus the hunger tick that bite exempts)',
    withX.bitesTaken.get(367) === 2 && withoutX.bitesTaken.get(367) === 1 &&
    withoutX.fish.get('e0')!.size === START_SIZE + BITE_GROWTH - 29 * HUNGER_AMOUNT &&
    withX.fish.get('e0')!.size - withoutX.fish.get('e0')!.size === BITE_GROWTH + HUNGER_AMOUNT,
    { with: withX.fish.get('e0')!.size, without: withoutX.fish.get('e0')!.size,
      bites: [withX.bitesTaken.get(367), withoutX.bitesTaken.get(367)] });

  // The client that fetched at the wrong moment: it polls past X_MS while X is
  // still in flight, then gets it on the next poll — strictly late.
  const AFTER_X = X_MS + 2_000; // a real tick, and strictly after X's ms
  check('the late-arrival scenario is genuinely late (the fold had already passed X)',
    AFTER_X % TICK_MS === 0 && AFTER_X > X_MS && AFTER_X < FOLD_END, AFTER_X);

  let unlucky = advance(createLoop(E, null), WITHOUT_X, AFTER_X).loop;
  check('before the late entry arrives, the unlucky client is missing the bite',
    unlucky.state.bitesTaken.get(367) === 1 && unlucky.replays === 0,
    { bites: unlucky.state.bitesTaken.get(367), replays: unlucky.replays });
  const beforeReplay = unlucky.state;
  unlucky = advance(unlucky, LOG, AFTER_X).loop;

  check('the late entry triggers exactly one bounded replay of the epoch',
    unlucky.replays === 1, unlucky.replays);
  check('the replay rebuilt the state rather than mutating the old one in place',
    unlucky.state !== beforeReplay);
  check('the replay put the fold back on exactly the tick it was on',
    unlucky.state.nowMs === beforeReplay.nowMs && unlucky.state.nowMs === AFTER_X + TICK_MS,
    { after: unlucky.state.nowMs, before: beforeReplay.nowMs });

  // The lucky client held X all along. Same entry SET, different arrival
  // order — and the fold must not be able to tell.
  const lucky = advance(advance(createLoop(E, null), LOG, AFTER_X).loop, LOG, AFTER_X).loop;
  check('the late entry is ABSORBED: the unlucky client now matches the client that had it all along',
    fingerprint(unlucky.state) === fingerprint(lucky.state),
    { unlucky: fingerprint(unlucky.state), lucky: fingerprint(lucky.state) });
  check('and both match a cold fold of the whole log to that tick',
    fingerprint(unlucky.state) === fingerprint(foldShoal(LOG, AFTER_X, { epoch: E })),
    fingerprint(unlucky.state));
  check('a dropped entry could not have done this: the pre-replay state really was different',
    fingerprint(beforeReplay) !== fingerprint(unlucky.state));

  // Carrying on from the replay must still reach the same place.
  const carried = advance(unlucky, LOG, FOLD_END).loop;
  check('and folding on from an absorbed late entry still lands on the cold whole-epoch fold',
    fingerprint(carried.state) === COLD_FP, fingerprint(carried.state));
}

// =============================================================================
// Section 4 — the bounded middle: an entry the fold provably cannot see costs
//             nothing
// =============================================================================
//
// `foldShoal` skips a prefix of its own log — every entry with
// `ms < epochWarmStartMs(epoch) - PRESENCE_TTL_MS` — because such an entry's
// presence has already expired at the very first warm-up tick (shoalEngine.ts's
// cursor comment). Adding one to the log therefore cannot change the fold, so
// the loop can absorb it with no replay at all. The boundary is exact, not
// merely safe, and both sides of it are asserted against the ENGINE first.
{
  const base = foldShoal(LOG, FOLD_END, { epoch: E });
  const atFloor = foldShoal([...LOG, ghost(ADMIT)], FOLD_END, { epoch: E });
  const belowFloor = foldShoal([...LOG, ghost(ADMIT - 1)], FOLD_END, { epoch: E });
  check('engine: an entry AT the admit floor does change the fold (it is alive for one warm-up tick)',
    fingerprint(atFloor) !== fingerprint(base), [...atFloor.departed.keys()]);
  check('engine: an entry one ms BELOW the admit floor cannot change the fold',
    fingerprint(belowFloor) === fingerprint(base));

  const lo = advance(advance(createLoop(E, null), LOG, FOLD_END).loop,
    [...LOG, ghost(ADMIT - 1)], FOLD_END).loop;
  check('loop: an entry below the admit floor is absorbed with NO replay',
    lo.replays === 0, lo.replays);
  check('loop: and it is not carried in the fold\'s log either',
    lo.ordered.length === LOG.length && !lo.ordered.some((e) => e.id === 'z'),
    lo.ordered.length);
  check('loop: the world is untouched by it, exactly as the engine says it must be',
    fingerprint(lo.state) === COLD_FP, fingerprint(lo.state));

  const hi = advance(advance(createLoop(E, null), LOG, FOLD_END).loop,
    [...LOG, ghost(ADMIT)], FOLD_END).loop;
  check('loop: an entry AT the admit floor does replay — the boundary is exact, not approximate',
    hi.replays === 1, hi.replays);
  check('loop: and the replayed world matches the engine folding the same enlarged log',
    fingerprint(hi.state) === fingerprint(atFloor),
    { loop: fingerprint(hi.state), engine: fingerprint(atFloor) });
}

// =============================================================================
// Section 5 — the epoch rolls, and the rolled state IS a cold start
// =============================================================================
{
  let loop = advance(createLoop(E, null), LOG, OFFSET + 20_000).loop;
  loop = advance(loop, LOG, SWEEP_MS).loop;

  // Non-degeneracy BEFORE the boundary: this really is a live world going in.
  check('the loop reaches the boundary having resolved a real sweep',
    loop.state.lastSweepMs === SWEEP_MS && loop.state.lastTaken.length === MAX_TAKE,
    { sweep: loop.state.lastSweepMs, taken: loop.state.lastTaken });

  loop = advance(loop, LOG, FOLD_END).loop;
  check('folding to the epoch\'s last legal tick does NOT roll on its own',
    loop.epoch === E && loop.state.nowMs === BOUNDARY, { epoch: loop.epoch, nowMs: loop.state.nowMs });
  check('and that pre-roll state matches the cold whole-epoch fold, byte-for-byte',
    fingerprint(loop.state) === COLD_FP, fingerprint(loop.state));

  // THE CROSSING. Without a rollover this call is a RangeError (Section 0).
  const crossed = advance(loop, LOG, TO_MS);
  loop = crossed.loop;

  check('crossing the boundary publishes a checkpoint instead of throwing',
    crossed.rolled !== null && crossed.rolled.epoch === E, crossed.rolled?.epoch);
  check('the published checkpoint is byte-identical to the one a cold client computes',
    serialiseCheckpoint(crossed.rolled!) === serialiseCheckpoint(COLD_CP),
    { loop: serialiseCheckpoint(crossed.rolled!), cold: serialiseCheckpoint(COLD_CP) });
  check('the loop is now folding the next epoch',
    loop.epoch === E + 1 && loop.state.epoch === E + 1 && loop.seed === crossed.rolled,
    { epoch: loop.epoch, stateEpoch: loop.state.epoch });

  // Non-degeneracy AFTER the roll, before the fingerprint comparison: the new
  // epoch must have RECONSTRUCTED the sweep and the bites through its warm-up
  // replay, not started from an empty sea.
  check('the rolled state reconstructed the pre-boundary sweep (non-degenerate)',
    loop.state.lastSweepMs === SWEEP_MS && loop.state.lastTaken.length === MAX_TAKE,
    { sweep: loop.state.lastSweepMs, taken: loop.state.lastTaken });
  check('the rolled state reconstructed both credited bites (non-degenerate)',
    loop.state.bitesTaken.get(367) === 2, [...loop.state.bitesTaken.entries()]);
  check('all twelve swimmers are still live across the boundary (non-degenerate)',
    loop.state.fish.size === 12, loop.state.fish.size);
  // Hand-derived sizes 3_000 ms into epoch 41: the seed is applied at the
  // epoch's first ms, then 3_000/250 + 1 = 13 ticks run. Hunger firings land
  // at BOUNDARY + 750, +1_750, +2_750 -> THREE firings (BOUNDARY is a multiple
  // of 1_000). e0's last bite was X_MS, 5_000 ms back, so it is not exempt.
  //   e0   96 - 3 = 93     idle 70 - 3 = 67     swept 60 (already at MIN_SIZE)
  check('and the rolled state lands on the hand-derived epoch-41 sizes',
    loop.state.fish.get('e0')!.size === E0_SIZE - 3 * HUNGER_AMOUNT &&
    loop.state.fish.get('c1')!.size === IDLE_SIZE - 3 * HUNGER_AMOUNT &&
    loop.state.fish.get('o0')!.size === MIN_SIZE,
    { e0: loop.state.fish.get('e0')!.size, c1: loop.state.fish.get('c1')!.size,
      o0: loop.state.fish.get('o0')!.size });
  check('the seeded recent tail survived the boundary: e0 still carries its pre-boundary bite',
    JSON.stringify(loop.state.fish.get('e0')!.recentBites) === JSON.stringify([X_MS]),
    loop.state.fish.get('e0')!.recentBites);

  // THE COMPARISON THIS SECTION EXISTS FOR. A rollover that carried live state
  // across instead of re-entering the warm-up diverges here (spec 3.9: it was
  // measured disagreeing on touchedIds, outsideTicks and tension).
  check('the rolled state is byte-identical to a cold joiner\'s fold of epoch 41',
    fingerprint(loop.state) === COLD_NEXT_FP,
    { rolled: fingerprint(loop.state), cold: COLD_NEXT_FP });
}

// =============================================================================
// Section 6 — at most one rollover per advance, and the log stays bounded
// =============================================================================
//
// `advance` returns ONE `rolled` checkpoint, so it rolls at most one epoch per
// call: work per call stays bounded at roughly one epoch of ticks even if the
// caller has been asleep for hours. A caller catches up by calling again.
{
  const FAR = epochEndMs(E + 1) + 5_000;
  let loop = createLoop(E, null);
  const first = advance(loop, LOG, FAR);
  loop = first.loop;
  check('an advance two epochs ahead rolls exactly one epoch',
    first.rolled !== null && first.rolled.epoch === E && loop.epoch === E + 1,
    { rolled: first.rolled?.epoch, epoch: loop.epoch });
  check('and it stops folded out to that epoch\'s boundary, ready to roll again',
    loop.state.nowMs === epochEndMs(E + 1), loop.state.nowMs);

  const second = advance(loop, LOG, FAR);
  loop = second.loop;
  check('the next call rolls the next epoch, still without throwing',
    second.rolled !== null && second.rolled.epoch === E + 1 && loop.epoch === E + 2,
    { rolled: second.rolled?.epoch, epoch: loop.epoch });
  // By epoch 42 the whole fixture (authored no later than BOUNDARY) is more
  // than 180 s behind epoch 42's warm start, so every entry is below the admit
  // floor and the fold's log is legitimately empty — the room may keep serving
  // those replies forever, but the loop stops carrying them.
  check('the fold\'s log is pruned of entries no future fold can see',
    loop.ordered.length === 0 && admitFloorMs(E + 2) > BOUNDARY,
    { ordered: loop.ordered.length, floor: admitFloorMs(E + 2) });
  check('but their hashes are remembered, so a refetch cannot re-admit them',
    loop.appliedHashes.size === LOG.length &&
    advance(loop, LOG, FAR).loop.ordered.length === 0,
    loop.appliedHashes.size);
}

// =============================================================================
// Section 7 — the honest bound: a published checkpoint is immutable
// =============================================================================
//
// This is where the "absorb, never drop" rule stops, and it stops because
// spec 3.9 says so, not because the shell chose it: a checkpoint is published
// AT the boundary, so an entry that arrives after the roll can no longer
// change the epoch it belonged to. It IS still absorbed into the world the
// client is now folding (the new epoch's warm-up reaches 180 s back), so
// nothing is lost from PLAY — but two clients that rolled holding different
// entry sets publish different checkpoints, and that is a property of the
// epoch design, not of this module. Asserted so a future change that makes
// the boundary late-entry-tolerant is forced to come and edit this.
{
  // The unlucky client rolls without X, which was authored 5 s before the
  // boundary — inside the window a late gossip delivery really can miss.
  const unluckyRoll = advance(advance(createLoop(E, null), WITHOUT_X, FOLD_END).loop,
    WITHOUT_X, TO_MS);
  check('a client that rolled without the late entry published a DIFFERENT checkpoint',
    unluckyRoll.rolled !== null &&
    serialiseCheckpoint(unluckyRoll.rolled) !== serialiseCheckpoint(COLD_CP),
    { without: serialiseCheckpoint(unluckyRoll.rolled!).slice(0, 90) });

  // ...and the entry is still absorbed into the epoch it is now folding.
  const after = advance(unluckyRoll.loop, LOG, TO_MS).loop;
  check('the post-roll late entry still replays into the CURRENT epoch — it is not dropped',
    after.replays === 1, after.replays);
  check('and the absorbed world matches a cold fold of the whole log under that same seed',
    fingerprint(after.state) === fingerprint(foldShoal(LOG, TO_MS, {
      epoch: E + 1, seed: unluckyRoll.rolled!,
    })),
    fingerprint(after.state));
  check('the world it reaches is NOT the world of a client that never missed it — the ' +
    'divergence lives in the seed, which is exactly what publishing checkpoints exposes',
    fingerprint(after.state) !== COLD_NEXT_FP);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
