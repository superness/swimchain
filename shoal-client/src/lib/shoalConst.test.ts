/**
 * Coherence of the Shoal constants. Run: npx tsx src/lib/shoalConst.test.ts
 * These are relationships the engine depends on, not arbitrary preferences.
 */
import { shelterWeight } from './shelter';
import {
  WORLD_W, WORLD_H, BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS,
  SHELTER_BASE, SHELTER_THRESHOLD, SHELTER_SIZE_CAP, SHELTER_SIZE_DIV,
  BLOOM_WINDOW_MS, BLOOM_READY_MS, PRESENCE_TTL_MS,
  HUSH_MS, LOCK_MS, TICK_MS, HUNGER_TICK_INTERVAL,
  START_SIZE, MIN_SIZE, SCATTER_COST, BITE_GROWTH, BLOOM_BITES,
  TENSION_NEUTRAL, TENSION_TRIGGER, MAX_TAKE, QUANT, SHELTER_R, CORE_R,
  WARMUP_MS, EPOCH_MS, HUNGER_AMOUNT,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// The bloom grid must tile the world exactly, or cell indices run off the map.
check('bloom grid tiles world horizontally', WORLD_W % BLOOM_CELL === 0, { WORLD_W, BLOOM_CELL });
check('bloom grid tiles world vertically', WORLD_H % BLOOM_CELL === 0, { WORLD_H, BLOOM_CELL });
check('BLOOM_COLS derived correctly', BLOOM_COLS === 32, { BLOOM_COLS });
check('BLOOM_ROWS derived correctly', BLOOM_ROWS === 24, { BLOOM_ROWS });

// The floor of three: three neighbours must clear the threshold, and two must
// not. This is the rule that prices buddy-pairing (spec 2.11 — "a pair is a
// marriage, a trio has politics").
//
// Stated against shelterWeight at sizes fish ACTUALLY have, not against
// SHELTER_BASE. Weighing bare SHELTER_BASE models a size-0 fish, which never
// exists — MIN_SIZE is 60 — and it is that gap that hid SHELTER_SIZE_CAP
// letting a pair of veterans shelter each other. Hand arithmetic, with
// shelterWeight(s) = SHELTER_BASE(100) + min(trunc(s / SHELTER_SIZE_DIV(40)),
// SHELTER_SIZE_CAP(45)):
//   MIN_SIZE   60 -> 100 + trunc(60/40)  = 100 + 1  = 101
//   START_SIZE 100 -> 100 + trunc(100/40) = 100 + 2  = 102
//   capped         -> 100 + 45            =           145  (reached at size 1800)
{
  const floored = SHELTER_BASE + Math.trunc(MIN_SIZE / SHELTER_SIZE_DIV);   // 101
  const starting = SHELTER_BASE + Math.trunc(START_SIZE / SHELTER_SIZE_DIV); // 102
  const capped = SHELTER_BASE + SHELTER_SIZE_CAP;                            // 145
  check('shelterWeight agrees with the hand arithmetic at MIN_SIZE',
    shelterWeight(MIN_SIZE) === floored && floored === 101, { got: shelterWeight(MIN_SIZE), floored });
  check('shelterWeight agrees with the hand arithmetic at START_SIZE',
    shelterWeight(START_SIZE) === starting && starting === 102, { got: shelterWeight(START_SIZE), starting });
  check('shelterWeight agrees with the hand arithmetic when capped',
    shelterWeight(999_999) === capped && capped === 145, { got: shelterWeight(999_999), capped });

  // A pair is exposed at every size a fish can be — the smallest, the
  // default, and the largest the cap allows.
  check('two floored neighbours are exposed', 2 * floored < SHELTER_THRESHOLD,
    { pair: 2 * floored, SHELTER_THRESHOLD });          // 202 < 300
  check('two starting-size neighbours are exposed', 2 * starting < SHELTER_THRESHOLD,
    { pair: 2 * starting, SHELTER_THRESHOLD });          // 204 < 300
  check('two capped whales cannot shelter a pair',
    2 * (SHELTER_BASE + SHELTER_SIZE_CAP) < SHELTER_THRESHOLD,
    { pair: 2 * (SHELTER_BASE + SHELTER_SIZE_CAP), SHELTER_THRESHOLD }); // 290 < 300

  // A trio clears it at every size, including the smallest, or hunger alone
  // would eventually expose a school that never moved.
  check('three floored neighbours are sheltered', 3 * floored >= SHELTER_THRESHOLD,
    { trio: 3 * floored, SHELTER_THRESHOLD });           // 303 >= 300
  check('three starting-size neighbours are sheltered', 3 * starting >= SHELTER_THRESHOLD,
    { trio: 3 * starting, SHELTER_THRESHOLD });          // 306 >= 300
}

// One enormous fish must not shelter a lone swimmer by itself, or the ball
// re-forms around a single whale and the pairing price is void.
check('one capped whale cannot shelter alone', SHELTER_BASE + SHELTER_SIZE_CAP < SHELTER_THRESHOLD,
  { whale: SHELTER_BASE + SHELTER_SIZE_CAP, SHELTER_THRESHOLD }); // 145 < 300

// If the bloom lookback is ever bounded, a client joining mid-session has to
// reconstruct the map from live presence, so the window must fit inside the
// TTL and readiness inside the window. The bound is NOT implemented — nothing
// enforces BLOOM_WINDOW_MS today — but the relationship is checked so the
// constants stay coherent for whoever settles that design question.
check('bloom window fits inside presence TTL', BLOOM_WINDOW_MS < PRESENCE_TTL_MS, { BLOOM_WINDOW_MS, PRESENCE_TTL_MS });
check('bloom readiness fits inside the window', BLOOM_READY_MS < BLOOM_WINDOW_MS, { BLOOM_READY_MS, BLOOM_WINDOW_MS });

// The hush must contain a real commit window and a real dread window.
check('lock falls inside the hush', LOCK_MS > 0 && LOCK_MS < HUSH_MS, { LOCK_MS, HUSH_MS });
check('dread window is at least as long as the commit window', HUSH_MS - LOCK_MS >= LOCK_MS, { HUSH_MS, LOCK_MS });
check('hush boundaries land on tick boundaries', LOCK_MS % TICK_MS === 0 && HUSH_MS % TICK_MS === 0, { TICK_MS });

// A full bloom must outgrow the flat scatter cost, or a fish that forages and
// then gets clear can never come out ahead and the loop stalls.
//
// This is NOT the "is foraging worth the risk" statement it reads as, and has
// not been since a scatter started voiding the whole recent trip rather than
// the single last bite. Getting caught DURING a trip is now firmly
// unprofitable by design: with bites EAT_COOLDOWN_MS(2500) apart, the five
// most recent fall inside VOID_WINDOW_MS(10000) of the resolve tick, so a
// fish swept immediately after clearing a bloom nets
//   6*12 (bloom) - 5*12 (voided) - 30 (scatter) = 72 - 60 - 30 = -18
// The check below pins the other half of the trade — that a fish which
// finishes a bloom and gets outside the void window before the sweep still
// nets 72 - 30 = +42, so the risk has an upside at all.
{
  const bloomWorth = BLOOM_BITES * BITE_GROWTH; // 6 * 12 = 72, computed by hand
  check('a full bloom outgrows a scatter', bloomWorth > SCATTER_COST, { bloomWorth, SCATTER_COST });
}

// A scatter must not instantly floor a starting fish, or newcomers bounce.
check('a starting fish survives one scatter', START_SIZE - SCATTER_COST > MIN_SIZE, { START_SIZE, SCATTER_COST, MIN_SIZE });

// Tension must be able to rise at all, and must not be trivially triggered.
check('tension has headroom above neutral', TENSION_TRIGGER > TENSION_NEUTRAL * 10, { TENSION_TRIGGER, TENSION_NEUTRAL });
check('the sweep can take more than one', MAX_TAKE >= 2, { MAX_TAKE });

// Quantization must be finer than every radius it feeds, or comparisons alias.
check('quantization is finer than shelter radius', QUANT * 8 < SHELTER_R, { QUANT, SHELTER_R });
check('quantization is finer than core radius', QUANT * 8 < CORE_R, { QUANT, CORE_R });
check('hunger ticks at most once per second', HUNGER_TICK_INTERVAL * TICK_MS >= 1000, { HUNGER_TICK_INTERVAL, TICK_MS });

// --- The warm-up window (spec 3.9 point 3) ----------------------------------
// A fold's tick loop starts WARMUP_MS before its epoch's first ms and replays
// the pre-origin tail. Four relationships make that work, and every one of
// them is load-bearing rather than decorative.
{
  // 1. It must cover the longest window any reconstructible rule depends on.
  //    Presence liveness IS that window, so equality is the exact answer, not
  //    a generous margin: a vector older than PRESENCE_TTL_MS has already
  //    expired at the origin, so replaying it could not change anything.
  check('the warm-up is exactly the presence TTL', WARMUP_MS === PRESENCE_TTL_MS,
    { WARMUP_MS, PRESENCE_TTL_MS });
  // 2. It must comfortably exceed every shorter reconstructible window: the
  //    bloom fallow clock, the fastest possible climb from tension 0 to the
  //    trigger, and a hush in flight.
  //    Tension's fastest climb: spreadPerMille maxes at 1000, so the per-tick
  //    delta maxes at 1000 - TENSION_NEUTRAL(250) = 750, and reaching
  //    TENSION_TRIGGER(30_000) takes at least 40 ticks = 10_000 ms.
  const fastestTensionRampMs = Math.ceil(TENSION_TRIGGER / (1000 - TENSION_NEUTRAL)) * TICK_MS;
  check('the fastest possible tension ramp is the hand-derived 40 ticks',
    fastestTensionRampMs === 10_000, fastestTensionRampMs);
  check('the warm-up covers the bloom fallow clock', WARMUP_MS > BLOOM_READY_MS,
    { WARMUP_MS, BLOOM_READY_MS });
  check('the warm-up covers a whole tension ramp plus its hush',
    WARMUP_MS > fastestTensionRampMs + HUSH_MS,
    { WARMUP_MS, fastestTensionRampMs, HUSH_MS });
  check('the warm-up covers the bloom lookback window', WARMUP_MS >= BLOOM_WINDOW_MS,
    { WARMUP_MS, BLOOM_WINDOW_MS });
  // 3. It must be a whole number of ticks, or the warm-up would shift the
  //    epoch's tick phase off the absolute grid.
  check('the warm-up is a whole number of ticks', WARMUP_MS % TICK_MS === 0,
    { warmTicks: WARMUP_MS / TICK_MS, TICK_MS });
  // 4. It must be a whole number of HUNGER PERIODS, or starting the loop
  //    360 ticks earlier would move every hunger firing. Both WARMUP_MS
  //    (90 periods) and EPOCH_MS (3_600 periods) divide evenly, so hunger
  //    fires at the same ABSOLUTE times in every epoch, warm-up or not —
  //    which is what lets every hand-derived hunger count in the fold tests
  //    stay stated in absolute ms.
  const hungerPeriodMs = HUNGER_TICK_INTERVAL * TICK_MS; // 1000
  check('the warm-up is a whole number of hunger periods, so it cannot shift hunger phase',
    WARMUP_MS % hungerPeriodMs === 0 && EPOCH_MS % hungerPeriodMs === 0,
    { WARMUP_MS, EPOCH_MS, hungerPeriodMs });
  // 5. And the cost is the 360 ticks spec 3.9 point 3 quotes, on top of the
  //    epoch's own 14_400 — not a fold-cost regression by an order of
  //    magnitude.
  check('the warm-up costs the hand-derived 360 ticks against the epoch\'s 14_400',
    WARMUP_MS / TICK_MS === 360 && EPOCH_MS / TICK_MS === 14_400,
    { warmTicks: WARMUP_MS / TICK_MS, epochTicks: EPOCH_MS / TICK_MS });
  // 6. A swimmer replayed through the whole warm-up loses at most 90 size to
  //    hunger, which is more than START_SIZE - MIN_SIZE. That is precisely
  //    why the seed is applied AFTER the warm-up rather than before it: a
  //    seeded size run through the warm-up would be floored at MIN_SIZE.
  check('a full warm-up of hunger would flatten a starting fish, so the seed cannot precede it',
    (WARMUP_MS / hungerPeriodMs) * HUNGER_AMOUNT > START_SIZE - MIN_SIZE,
    { warmHunger: (WARMUP_MS / hungerPeriodMs) * HUNGER_AMOUNT, START_SIZE, MIN_SIZE });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
