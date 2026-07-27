/**
 * Shelter and exposure. Run: npx tsx src/lib/shelter.test.ts
 *
 * This is the rule the whole game turns on: who the sweep is allowed to take.
 * Expected values are hand-computed from the constants, never by re-invoking
 * the function under test.
 */
import { shelterWeight, shelterOf, isExposed, shelterMap, type Body } from './shelter';
import {
  SHELTER_BASE, SHELTER_SIZE_DIV, SHELTER_SIZE_CAP, SHELTER_THRESHOLD, SHELTER_R,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- Weight ----------------------------------------------------------------
// By hand with SHELTER_BASE=100, SHELTER_SIZE_DIV=40, SHELTER_SIZE_CAP=120:
// size 0   -> 100 + 0            = 100
// size 100 -> 100 + trunc(100/40)= 100 + 2 = 102
// size 400 -> 100 + 10           = 110
// size 9999-> 100 + 120 (capped) = 220
check('weight of a sizeless fish is the base', shelterWeight(0) === SHELTER_BASE, shelterWeight(0));
check('weight of a starting fish', shelterWeight(100) === 102, shelterWeight(100));
check('weight of a grown fish', shelterWeight(400) === 110, shelterWeight(400));
check('weight is capped', shelterWeight(999_999) === SHELTER_BASE + SHELTER_SIZE_CAP, shelterWeight(999_999));
check('weight is monotonic in size', shelterWeight(200) >= shelterWeight(100) && shelterWeight(1000) >= shelterWeight(200));

// --- The floor of three ----------------------------------------------------
// The load-bearing rule from spec 2.11: a pair is exposed, a trio is not.
{
  const self = at('me', 1000, 1000);
  const buddy = at('b', 1010, 1000);
  const third = at('c', 1000, 1010);

  check('a lone fish has no shelter', shelterOf(self, []) === 0);
  check('a lone fish is exposed', isExposed(self, []) === true);

  // One neighbour at size 100: 102. Below the threshold of 300.
  check('one neighbour is not enough', shelterOf(self, [buddy]) === 102, shelterOf(self, [buddy]));
  check('a pair is still exposed', isExposed(self, [buddy]) === true);

  // Two neighbours: 204. Still below 300 — this is the anti-pairing price.
  check('two neighbours give 204', shelterOf(self, [buddy, third]) === 204, shelterOf(self, [buddy, third]));
  check('a trio is STILL exposed at size 100', isExposed(self, [buddy, third]) === true);

  // Three neighbours: 306. Clears 300.
  const fourth = at('d', 1000, 990);
  check('three neighbours give 306', shelterOf(self, [buddy, third, fourth]) === 306,
    shelterOf(self, [buddy, third, fourth]));
  check('four fish together are sheltered', isExposed(self, [buddy, third, fourth]) === false);

  // Boundary: exactly 300 shelter, with three size-0 neighbours (each worth 100).
  const minnow1 = at('m1', 1005, 1005, 0);
  const minnow2 = at('m2', 1000, 1005, 0);
  const minnow3 = at('m3', 1005, 1000, 0);
  check('three minnows give exactly 300', shelterOf(self, [minnow1, minnow2, minnow3]) === 300,
    shelterOf(self, [minnow1, minnow2, minnow3]));
  check('at 300 shelter, fish is sheltered not exposed', isExposed(self, [minnow1, minnow2, minnow3]) === false);
}

// --- Radius ----------------------------------------------------------------
{
  const self = at('me', 0, 0);
  // Exactly on the radius counts; one unit beyond does not. Hand-checked
  // against SHELTER_R directly rather than against dist2 output.
  const onEdge = at('e', SHELTER_R, 0);
  const justOut = at('f', SHELTER_R + 1, 0);
  check('a neighbour exactly on the radius shelters', shelterOf(self, [onEdge]) === 102, shelterOf(self, [onEdge]));
  check('a neighbour just past the radius does not', shelterOf(self, [justOut]) === 0, shelterOf(self, [justOut]));
}

// --- Size shields ----------------------------------------------------------
// A big neighbour is worth more, but per the const test cannot shelter alone.
{
  const self = at('me', 500, 500);
  const whale = at('w', 510, 500, 999_999);
  const small = at('s', 490, 500, 0);
  check('a whale shelters more than a minnow', shelterOf(self, [whale]) > shelterOf(self, [small]));
  check('a whale alone still leaves you exposed', isExposed(self, [whale]) === true, shelterOf(self, [whale]));
}

// --- Self exclusion --------------------------------------------------------
{
  const self = at('me', 100, 100);
  check('a fish does not shelter itself', shelterOf(self, [self]) === 0, shelterOf(self, [self]));
}

// --- The map ---------------------------------------------------------------
// Independent expectation: build the same answer with a from-scratch loop that
// does not call shelterOf.
{
  const bodies = [at('a', 0, 0), at('b', 10, 0), at('c', 20, 0), at('d', 5000, 5000)];
  const got = shelterMap(bodies);

  const expected = new Map<string, number>();
  for (const s of bodies) {
    let total = 0;
    for (const o of bodies) {
      if (o.id === s.id) continue;
      const dx = s.x - o.x, dy = s.y - o.y;
      if (dx * dx + dy * dy <= SHELTER_R * SHELTER_R) {
        total += SHELTER_BASE + Math.min(Math.trunc(o.size / SHELTER_SIZE_DIV), SHELTER_SIZE_CAP);
      }
    }
    expected.set(s.id, total);
  }

  let same = got.size === expected.size;
  for (const [k, v] of expected) if (got.get(k) !== v) same = false;
  check('shelterMap matches an independent computation', same, { got: [...got], expected: [...expected] });
  check('the distant fish has no shelter', got.get('d') === 0, got.get('d'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
