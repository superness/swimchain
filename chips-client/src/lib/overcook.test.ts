/**
 * Overcook's lit-fryer rules. Run: npx tsx src/lib/overcook.test.ts
 */
import { toggleOvercook, overcookOff } from './overcook';
import { MAX_CRACKLES } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) One at a time — lighting another fryer MOVES the flame.
check('lighting from cold lights that fryer', toggleOvercook(null, 2) === 2);
check('lighting a second fryer moves the flame', toggleOvercook(0, 3) === 3);
check('tapping the lit fryer puts it out', toggleOvercook(1, 1) === null);

// 2) The flame goes out by itself once the chip is golden — there is nothing
//    left to hurry, and leaving it lit would burn the pot for no reason.
{
  const golden = [{ crackles: MAX_CRACKLES }, { crackles: 0 }];
  check('a golden chip extinguishes its own flame', overcookOff(0, golden) === null);
  check('a chip short of golden keeps burning', overcookOff(1, golden) === 1);
  check('no flame stays no flame', overcookOff(null, golden) === null);
}

// 3) A flame on a fryer that no longer exists (rack shrank) is dropped.
check('a flame past the end of the rack is dropped', overcookOff(5, [{ crackles: 0 }]) === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
