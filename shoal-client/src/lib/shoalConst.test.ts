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

// A client joining mid-session reconstructs the bloom map from live presence,
// so the lookback must fit inside the TTL, and readiness inside the lookback.
check('bloom window fits inside presence TTL', BLOOM_WINDOW_MS < PRESENCE_TTL_MS, { BLOOM_WINDOW_MS, PRESENCE_TTL_MS });
check('bloom readiness fits inside the window', BLOOM_READY_MS < BLOOM_WINDOW_MS, { BLOOM_READY_MS, BLOOM_WINDOW_MS });

// The hush must contain a real commit window and a real dread window.
check('lock falls inside the hush', LOCK_MS > 0 && LOCK_MS < HUSH_MS, { LOCK_MS, HUSH_MS });
check('dread window is at least as long as the commit window', HUSH_MS - LOCK_MS >= LOCK_MS, { HUSH_MS, LOCK_MS });
check('hush boundaries land on tick boundaries', LOCK_MS % TICK_MS === 0 && HUSH_MS % TICK_MS === 0, { TICK_MS });

// Hunger must be survivable: one full bloom must buy more than a scatter costs,
// or foraging is never worth the risk and the loop stalls.
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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
