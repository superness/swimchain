/**
 * Pure fryer-scheduling rules: the u64 nonce ceiling, the bankable gate, and
 * the ms allocator's distinctness guarantee. No Worker, no DOM, no Argon2id —
 * runs instantly. Run: npx tsx src/lib/fryerLogic.test.ts
 */
import { nextNonce, isBankable, createMsAllocator, U64_MAX } from './fryerLogic';
import { BANK_MIN_BITS } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) nextNonce: ordinary increments, and the u64 boundary.
check('nextNonce increments', nextNonce(0n) === 1n);
check('nextNonce increments a large value', nextNonce(1000n) === 1001n);
check('U64_MAX matches bankBody/parseMove\'s ceiling (2^64 - 1)', U64_MAX === 2n ** 64n - 1n);
check('nextNonce at U64_MAX - 1 still steps', nextNonce(U64_MAX - 1n) === U64_MAX);
check('nextNonce at U64_MAX stops (returns null)', nextNonce(U64_MAX) === null);
check('nextNonce never returns a value > U64_MAX', (() => {
  for (const n of [0n, 1n, U64_MAX - 2n, U64_MAX - 1n, U64_MAX]) {
    const next = nextNonce(n);
    if (next !== null && next > U64_MAX) return false;
  }
  return true;
})());

// 2) isBankable: gated at exactly BANK_MIN_BITS, matching the fold's own
// `parsed.bits < BANK_MIN_BITS` rejection in chipsEngine.ts.
check(`isBankable(${BANK_MIN_BITS - 1}) is false (one below the gate)`, isBankable(BANK_MIN_BITS - 1) === false);
check(`isBankable(${BANK_MIN_BITS}) is true (exactly at the gate)`, isBankable(BANK_MIN_BITS) === true);
check(`isBankable(${BANK_MIN_BITS + 1}) is true (above the gate)`, isBankable(BANK_MIN_BITS + 1) === true);
check('isBankable(0) is false', isBankable(0) === false);
check('isBankable(-1) is false (defensive)', isBankable(-1) === false);

// 3) createMsAllocator: every value it ever hands out, across many calls,
// is distinct, positive, and strictly increasing — the property two fryers
// (or one fryer across a rebank) actually depend on to never share a
// preimage.
{
  const allocate = createMsAllocator(1_000_000);
  const seen = new Set<number>();
  let prev = -Infinity;
  let strictlyIncreasing = true;
  let allPositive = true;
  for (let i = 0; i < 500; i++) {
    const ms = allocate();
    if (ms <= prev) strictlyIncreasing = false;
    if (ms <= 0) allPositive = false;
    seen.add(ms);
    prev = ms;
  }
  check('allocator never repeats a value across 500 draws', seen.size === 500, seen.size);
  check('allocator is strictly increasing', strictlyIncreasing);
  check('allocator only hands out positive integers', allPositive);
}

// 4) Two independently-seeded allocators (standing in for two fryers created
// in the same effect run, or a fresh mount racing an old one in the same
// millisecond) never hand out the same ms if seeded from the same instant —
// the actual failure mode a naive `Date.now() + index` scheme has.
{
  const seed = 42_000;
  const a = createMsAllocator(seed);
  const b = createMsAllocator(seed);
  const fromA = new Set([a(), a(), a()]);
  const fromB = new Set([b(), b(), b()]);
  const overlap = [...fromA].some((v) => fromB.has(v));
  // This documents the allocator's actual contract: distinctness is
  // guaranteed WITHIN one allocator's sequence (one per hook instance), not
  // across two independently-seeded ones — useFryers.ts relies on there
  // being exactly one allocator per hook instance, held in a ref, not one
  // freshly seeded per fryer or per effect run.
  check('same-seeded allocators alias (documents why useFryers must use ONE allocator, not one per fryer)', overlap);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
