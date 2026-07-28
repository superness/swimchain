/**
 * Epoch arithmetic. Run: npx tsx src/lib/epoch.test.ts
 *
 * The grid must be absolute, not relative to any log. Anchoring the tick grid
 * to the first entry a client happened to hold is what made two clients fold
 * different worlds from the same live entries (spec section 3.9).
 */
import {
  epochOf, epochStartMs, epochEndMs, epochWarmStartMs, epochFoldEndMs, isEpochBoundary,
} from './epoch';
import { EPOCH_MS, TICK_MS, WARMUP_MS, PRESENCE_TTL_MS } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// EPOCH_MS is 3_600_000. By hand: ms 0 is epoch 0; one ms short of an hour is
// still epoch 0; exactly an hour is epoch 1.
check('time zero is epoch zero', epochOf(0) === 0, epochOf(0));
check('one ms before the boundary is the earlier epoch', epochOf(EPOCH_MS - 1) === 0, epochOf(EPOCH_MS - 1));
check('the boundary itself starts the next epoch', epochOf(EPOCH_MS) === 1, epochOf(EPOCH_MS));
check('an arbitrary later time lands correctly', epochOf(3 * EPOCH_MS + 17) === 3, epochOf(3 * EPOCH_MS + 17));

// Starts and ends. Epoch 3 spans [3*EPOCH_MS, 4*EPOCH_MS).
check('epoch start is the multiple', epochStartMs(3) === 3 * EPOCH_MS, epochStartMs(3));
check('epoch end is the next multiple', epochEndMs(3) === 4 * EPOCH_MS, epochEndMs(3));
check('end of one epoch is the start of the next', epochEndMs(3) === epochStartMs(4));

// Round trip: any ms lands inside its own epoch's span.
{
  let ok = true;
  for (const ms of [0, 1, EPOCH_MS - 1, EPOCH_MS, 7 * EPOCH_MS + 999]) {
    const e = epochOf(ms);
    if (!(epochStartMs(e) <= ms && ms < epochEndMs(e))) ok = false;
  }
  check('every ms lies within its own epoch span', ok);
}

// The grid must be tick-aligned, or the fold's tick loop straddles boundaries.
// By hand: 3_600_000 / 250 = 14_400, an exact integer.
check('an epoch is a whole number of ticks', EPOCH_MS % TICK_MS === 0, { EPOCH_MS, TICK_MS });
check('an epoch is 14400 ticks', EPOCH_MS / TICK_MS === 14_400, EPOCH_MS / TICK_MS);

// --- epochWarmStartMs -------------------------------------------------------
// Where an epoch's fold actually starts ticking: WARMUP_MS before its own
// first ms (spec 3.9 point 3). By hand, epoch 3:
//   epochStartMs(3) = 3 * 3_600_000            = 10_800_000
//   epochWarmStartMs(3) = 10_800_000 - 90_000  = 10_710_000
check('the warm-up start is the hand-derived absolute ms', epochWarmStartMs(3) === 10_710_000,
  epochWarmStartMs(3));
check('it is exactly WARMUP_MS before the epoch it belongs to',
  epochStartMs(3) - epochWarmStartMs(3) === WARMUP_MS, epochStartMs(3) - epochWarmStartMs(3));
// It must stay on the absolute tick grid, or the warm-up shifts an epoch's
// tick PHASE — the exact divergence the absolute origin exists to remove.
// 90_000 / 250 = 360, an exact integer.
check('the warm-up is a whole number of ticks, so it cannot shift the tick phase',
  WARMUP_MS % TICK_MS === 0 && epochWarmStartMs(3) % TICK_MS === 0, WARMUP_MS / TICK_MS);
check('and that number is 360', (epochStartMs(3) - epochWarmStartMs(3)) / TICK_MS === 360,
  (epochStartMs(3) - epochWarmStartMs(3)) / TICK_MS);
// The warm-up ticks belong to the PREVIOUS epoch by construction, which is why
// emptyState has to be told which epoch is being folded rather than inferring
// it from the first tick's timestamp.
check('the warm-up start lies in the previous epoch', epochOf(epochWarmStartMs(3)) === 2,
  epochOf(epochWarmStartMs(3)));
// And the entry window the fold reads reaches a further PRESENCE_TTL_MS back —
// 180 s of the prior epoch's log — because a vector authored just before the
// warm-up start is live for every one of its 360 ticks. It must still land
// inside the single preceding epoch, or a fold would need two epochs of log.
check('the replay window opens 180 s before the origin and still inside the previous epoch',
  epochStartMs(3) - (epochWarmStartMs(3) - PRESENCE_TTL_MS) === 180_000
    && epochOf(epochWarmStartMs(3) - PRESENCE_TTL_MS) === 2,
  { windowStart: epochWarmStartMs(3) - PRESENCE_TTL_MS });
check('the warm-up start goes negative below epoch zero rather than clamping',
  epochWarmStartMs(0) === -90_000, epochWarmStartMs(0));

// --- epochFoldEndMs ---------------------------------------------------------
// The canonical LAST TICK an epoch owns: one TICK_MS short of its end, so a
// fold to it leaves nowMs sitting exactly on epochEndMs — what rollEpoch
// requires. By hand, epoch 3: 10_800_000 + 3_600_000 - 250 = 14_399_750.
check('the fold end is the hand-derived absolute ms', epochFoldEndMs(3) === 14_399_750,
  epochFoldEndMs(3));
check('one more tick lands exactly on the epoch end', epochFoldEndMs(3) + TICK_MS === epochEndMs(3),
  { foldEnd: epochFoldEndMs(3), end: epochEndMs(3) });
check('the fold end is itself inside the epoch, and on the grid',
  epochOf(epochFoldEndMs(3)) === 3 && epochFoldEndMs(3) % TICK_MS === 0, epochFoldEndMs(3));
// The whole bounded-cost claim in one line: warm-up plus epoch is 360 + 14_400
// ticks, no matter how old the sea is.
check('a full fold is exactly 14_760 ticks: 360 of warm-up and 14_400 of epoch',
  (epochFoldEndMs(3) - epochWarmStartMs(3)) / TICK_MS + 1 === 14_760,
  (epochFoldEndMs(3) - epochWarmStartMs(3)) / TICK_MS + 1);

check('a multiple of EPOCH_MS is a boundary', isEpochBoundary(2 * EPOCH_MS) === true);
check('a non-multiple is not a boundary', isEpochBoundary(2 * EPOCH_MS + 1) === false);

// Negative times are not expected but must not silently produce a wrong epoch.
check('negative time floors, it does not truncate toward zero', epochOf(-1) === -1, epochOf(-1));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
