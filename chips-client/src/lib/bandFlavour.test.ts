/**
 * The band writing, checked for the things prose gets wrong silently: a missing
 * entry, a boss that is really just the rock it is in, and scoop speaking early.
 *
 * HE MUST NOT SPEAK BEFORE THE LAVA. The whole game seeds it — eleven months on
 * a stool, nine retirements, "i've done the math twice" — and spending it a band
 * early would waste the only long con the writing has. That is a one-character
 * mistake in a data table and nothing else would catch it.
 *
 * Run: npx tsx src/lib/bandFlavour.test.ts
 */
import { BAND_FLAVOUR, flavourFor } from './bandFlavour';
import { DEEP_BAND_COUNT } from './chipsConst';
import { DEEP_BANDS } from './tunnelDepth';
let bad = 0;
const ck = (n: string, c: boolean, x?: unknown) => { if (c) console.log('  ok  '+n); else { bad++; console.log('FAIL  '+n+(x!==undefined?'  '+JSON.stringify(x):'')); } };
ck('one flavour per band', BAND_FLAVOUR.length === DEEP_BAND_COUNT, { flavour: BAND_FLAVOUR.length, bands: DEEP_BAND_COUNT });
ck('and per stratum', BAND_FLAVOUR.length === DEEP_BANDS.length);
ck('every band names a boss', BAND_FLAVOUR.every(f => f.boss.length > 0));
ck('every band has both lines', BAND_FLAVOUR.every(f => f.arrive.length > 10 && f.gives.length > 10));
// Bands 0, 1 and 5 legitimately share their names: the porcelain and the table
// ARE the things you hit, and The Other Side is not a boss at all (design: "there
// is no fight"). The property that matters is that the MIDDLE bands name
// something other than the rock they are in — an earlier version of this check
// asserted it of all six and failed on the exit, which was the test being wrong.
ck('the middle bands name a boss, not the rock', [2,3,4].every(i => BAND_FLAVOUR[i].boss.toLowerCase() !== DEEP_BANDS[i].label.toLowerCase()),
  [2,3,4].map(i=>[BAND_FLAVOUR[i].boss, DEEP_BANDS[i].label]));
ck('scoop is silent until the lava', BAND_FLAVOUR.slice(0, 4).every(f => f.scoop === null), BAND_FLAVOUR.map(f=>f.scoop));
ck('and speaks at the lava', BAND_FLAVOUR[4].scoop !== null, BAND_FLAVOUR[4].scoop);
ck('past the descent has a fallback', flavourFor(99).boss.length > 0, flavourFor(99));
if (bad) { console.error(`\n${bad} failure(s)`); process.exit(1); }
console.log('\nall good');
