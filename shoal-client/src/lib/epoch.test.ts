/**
 * Epoch arithmetic. Run: npx tsx src/lib/epoch.test.ts
 *
 * The grid must be absolute, not relative to any log. Anchoring the tick grid
 * to the first entry a client happened to hold is what made two clients fold
 * different worlds from the same live entries (spec section 3.9).
 */
import { epochOf, epochStartMs, epochEndMs, isEpochBoundary } from './epoch';
import { EPOCH_MS, TICK_MS } from './shoalConst';

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

check('a multiple of EPOCH_MS is a boundary', isEpochBoundary(2 * EPOCH_MS) === true);
check('a non-multiple is not a boundary', isEpochBoundary(2 * EPOCH_MS + 1) === false);

// Negative times are not expected but must not silently produce a wrong epoch.
check('negative time floors, it does not truncate toward zero', epochOf(-1) === -1, epochOf(-1));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
