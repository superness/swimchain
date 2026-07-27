/**
 * Coherence of the Shoal constants. Run: npx tsx src/lib/shoalConst.test.ts
 * These are relationships the engine depends on, not arbitrary preferences.
 */
import {
  WORLD_W, WORLD_H, BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS,
  SHELTER_BASE, SHELTER_THRESHOLD, SHELTER_SIZE_CAP,
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

// The floor of three: exactly three plain neighbours must clear the threshold,
// and two must not. This is the rule that prices buddy-pairing.
check('two plain neighbours are exposed', 2 * SHELTER_BASE < SHELTER_THRESHOLD, { two: 2 * SHELTER_BASE, SHELTER_THRESHOLD });
check('three plain neighbours are sheltered', 3 * SHELTER_BASE >= SHELTER_THRESHOLD, { three: 3 * SHELTER_BASE, SHELTER_THRESHOLD });

// One enormous fish must not shelter a lone swimmer by itself, or the ball
// re-forms around a single whale and the pairing price is void.
check('one capped whale cannot shelter alone', SHELTER_BASE + SHELTER_SIZE_CAP < SHELTER_THRESHOLD,
  { whale: SHELTER_BASE + SHELTER_SIZE_CAP, SHELTER_THRESHOLD });

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
