/**
 * Coherence of the balance constants. Run: npx tsx src/lib/chipsConst.test.ts
 * These are not arbitrary numbers — the purchase gating in the spec requires
 * each bowl tier to be affordable under the PRECEDING cap, or progression stalls.
 */
import {
  UPGRADES, START_BOWL_CAP, DIP_TIERS, GOLDEN_BITS, BANK_MIN_BITS, MAX_BITS,
  CRUMBS_PER_CHIP, SOG_MAX_HOURS,
} from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// Each bowl tier must be affordable under the cap in force before it.
{
  let cap = START_BOWL_CAP;
  for (const key of ['bowl1', 'bowl2', 'bowl3']) {
    const u = UPGRADES[key];
    check(`${key} affordable under preceding cap`, u.cost <= cap, { cost: u.cost, cap });
    cap = u.bowlCap!;
  }
}

// No upgrade may cost more than the largest reachable cap.
{
  const maxCap = UPGRADES['bowl3'].bowlCap!;
  for (const [key, u] of Object.entries(UPGRADES)) {
    check(`${key} cost within max cap`, u.cost <= maxCap, { cost: u.cost, maxCap });
  }
}

// Seasoning tiers must strictly increase in both cost and multiplier.
{
  const keys = ['season1', 'season2', 'season3', 'season4', 'season5', 'season6'];
  for (let i = 1; i < keys.length; i++) {
    const a = UPGRADES[keys[i - 1]], b = UPGRADES[keys[i]];
    check(`${keys[i]} costs more than ${keys[i - 1]}`, b.cost > a.cost);
    const av = a.seasoningNum! / a.seasoningDen!, bv = b.seasoningNum! / b.seasoningDen!;
    check(`${keys[i]} multiplies more than ${keys[i - 1]}`, bv > av);
  }
}

// Dip thresholds strictly increase and start at zero.
{
  check('first dip tier is free', DIP_TIERS[0].minLifetime === 0);
  for (let i = 1; i < DIP_TIERS.length; i++) {
    check(`dip ${DIP_TIERS[i].key} threshold rises`, DIP_TIERS[i].minLifetime > DIP_TIERS[i - 1].minLifetime);
  }
}

// Sanity on the PoW bounds.
check('BANK_MIN_BITS below GOLDEN_BITS', BANK_MIN_BITS < GOLDEN_BITS);
check('GOLDEN_BITS below MAX_BITS', GOLDEN_BITS < MAX_BITS);
check('MAX_BITS keeps crumbs inside 2^53', CRUMBS_PER_CHIP * 2 ** (MAX_BITS - BANK_MIN_BITS) < Number.MAX_SAFE_INTEGER);
check('SOG_MAX_HOURS is 30 days', SOG_MAX_HOURS === 720);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
