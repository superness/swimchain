/**
 * Gameplay-flow simulator: grades the balance constants against explicit
 * PLAYER-TIME TARGETS. Run whenever anything in chipsConst.ts moves:
 *
 *   npx tsx scripts/flowsim.ts
 *
 * Models a fresh player with auto-dip ON (banks every chip at 10 bits) who
 * buys the cheapest affordable jar the moment it lights up — i.e. the
 * default experience, no strategy. Deterministic expected-value model:
 *
 *   tosses/sec/fryer  R = 60         (measured Argon2id rate, 2026-07-26/27)
 *   crumbs/toss       = 1000/512 x seasoning x tier payNum x doubleDip EV
 *                       (auto-dip at 10 bits never reaches golden — that is
 *                        the deliberate idle/active trade)
 *   chips/toss        = 1/512        (exact for ANY banking threshold)
 *
 * The targets are the design contract, written as a player would say them.
 * A MISS is not an error — it is a flag that either the constant or the
 * target needs to move, on purpose, with eyes open.
 */
import { UPGRADES, DIP_TIERS } from '../src/lib/chipsConst';

const R = 60;                       // tosses/sec/fryer
const CRUMBS_PER_TOSS = 1000 / 512; // at any threshold below golden
const CHIPS_PER_TOSS = 1 / 512;

interface Target { what: string; maxMin: number }
const TARGETS: Target[] = [
  { what: 'buy:season1', maxMin: 2 },        // first purchase inside 2 minutes
  { what: 'buy:bowl1', maxMin: 8 },
  { what: 'buy:airtight', maxMin: 10 },
  { what: 'buy:fryer2', maxMin: 15 },        // the rate doubler, first session
  { what: 'tier:guac', maxMin: 25 },         // first breakthrough, first session
  { what: 'buy:doubledip1', maxMin: 40 },    // session 1 closes with a toy
  { what: 'buy:season2', maxMin: 30 },
  { what: 'tier:onion', maxMin: 60 * 2.5 },  // session 2-3
  { what: 'buy:detector', maxMin: 60 * 3 },
  { what: 'tier:queso', maxMin: 60 * 8 },    // week 1 casual (45 min/day)
  { what: 'buy:fryer3', maxMin: 60 * 6 },
  { what: 'tier:seven', maxMin: 60 * 25 },   // weeks 2-4
  { what: 'buy:fryer4', maxMin: 60 * 20 },
  { what: 'tier:abyss', maxMin: 60 * 160 },  // the trophy: months, not years
];

function simulate(): Map<string, number> {
  const events = new Map<string, number>();
  let crumbs = 0, chips = 0, sec = 0;
  let fryers = 1, seasonN = 1, seasonD = 1, ddMod = 0, bowlCap = 100_000;
  const owned = new Set<string>();
  const chains: Record<string, string[]> = {};
  for (const c of [['season1','season2','season3','season4','season5','season6'],['bowl1','bowl2','bowl3'],['fryer2','fryer3','fryer4'],['doubledip1','doubledip2'],['detector','detector2']]) {
    for (const k of c) chains[k] = c;
  }
  const buyable = (k: string): boolean => {
    if (owned.has(k)) return false;
    const chain = chains[k];
    if (chain) for (const prev of chain) { if (prev === k) break; if (!owned.has(prev)) return false; }
    return UPGRADES[k].cost <= bowlCap;   // can never HOLD more than the cap
  };

  const STEP = 5; // seconds
  while (sec < 3600 * 200 && events.size < TARGETS.length + 30) {
    const tierIdx = DIP_TIERS.reduce((acc, t, i) => (chips >= t.minLifetime ? i : acc), 0);
    const tier = DIP_TIERS[tierIdx];
    const pay = (tier.payNum && tier.payDen) ? tier.payNum / tier.payDen : 1;
    const ddEV = ddMod > 0 ? 1 + 1 / ddMod : 1;
    const rate = R * fryers * CRUMBS_PER_TOSS * (seasonN / seasonD) * pay * ddEV;

    crumbs = Math.min(crumbs + rate * STEP, bowlCap);
    chips += R * fryers * CHIPS_PER_TOSS * STEP;
    sec += STEP;

    for (const t of DIP_TIERS) {
      if (t.minLifetime > 0 && chips >= t.minLifetime && !events.has(`tier:${t.key}`)) events.set(`tier:${t.key}`, sec);
    }
    // buy the cheapest affordable jar, greedily, repeatedly
    for (;;) {
      const open = Object.keys(UPGRADES).filter(buyable).filter((k) => UPGRADES[k].cost <= crumbs);
      if (open.length === 0) break;
      const k = open.sort((a, b) => UPGRADES[a].cost - UPGRADES[b].cost)[0];
      const u = UPGRADES[k];
      crumbs -= u.cost;
      owned.add(k);
      events.set(`buy:${k}`, sec);
      if (u.fryers) fryers = u.fryers;
      if (u.seasoningNum && u.seasoningDen) { seasonN = u.seasoningNum; seasonD = u.seasoningDen; }
      if (u.doubleDipMod) ddMod = u.doubleDipMod;
      if (u.bowlCap) bowlCap = u.bowlCap;
    }
  }
  return events;
}

const fmt = (sec: number): string => sec < 3600 ? `${(sec / 60).toFixed(1)}m` : `${(sec / 3600).toFixed(1)}h`;

const events = simulate();
console.log('== full timeline (auto-dip default play, greedy buys) ==');
for (const [what, sec] of [...events.entries()].sort((a, b) => a[1] - b[1])) {
  console.log(`  ${fmt(sec).padStart(7)}  ${what}`);
}

console.log('\n== targets ==');
let misses = 0;
for (const t of TARGETS) {
  const got = events.get(t.what);
  const ok = got !== undefined && got <= t.maxMin * 60;
  if (!ok) misses++;
  console.log(`  ${ok ? ' ok ' : 'MISS'}  ${t.what.padEnd(16)} target ${fmt(t.maxMin * 60).padStart(7)}  actual ${got === undefined ? 'never' : fmt(got)}`);
}
console.log(misses === 0 ? '\nall targets met' : `\n${misses} target(s) missed`);
process.exit(misses === 0 ? 0 : 1);
