/**
 * Gameplay-flow grader for the POT x MULTI engine (lib/cooking.ts holds the
 * locked spec). Run whenever chipsConst.ts or cooking.ts moves:
 *
 *   npx tsx scripts/flowsim.ts
 *
 * Models the default player: chips tick on the designed clock, dips happen
 * at a casual cadence (whenever a crackle lands or the pot feels full —
 * modelled as "dip on every crackle-or-90s"), cheapest affordable jar bought
 * the moment it lights up. The crackle curve is EV-flat by design (cooking.ts
 * header), so expected crumbs/sec == tick rate x seasoning x fryers x the
 * double-dip EV — the sim uses expectations, deterministic on purpose.
 *
 * The targets are the design contract, in player time. A MISS means a
 * constant or a target must move, on purpose, with eyes open.
 */
import { UPGRADES, DIP_TIERS, CRUMBS_PER_CHIP } from '../src/lib/chipsConst';
import { TICK_CRUMBS, TICK_MS, DOUBLE_DIP_RARITY } from '../src/lib/cooking';
import { jarAvailable } from '../src/lib/crew';

interface Target { what: string; maxMin: number }
const TARGETS: Target[] = [
  { what: 'buy:season1', maxMin: 2.5 },      // first purchase inside ~2 minutes
  { what: 'buy:bowl1', maxMin: 8 },
  { what: 'buy:airtight', maxMin: 10 },
  { what: 'buy:fryer2', maxMin: 15 },        // the rate doubler, first session
  { what: 'tier:guac', maxMin: 30 },         // first breakthrough, first session
  { what: 'buy:doubledip1', maxMin: 45 },
  { what: 'buy:season2', maxMin: 30 },
  // RETUNED 2026-07-28. The Sous Chef moved from avo (layer 1, 300k) to the
  // queso angel (layer 3, 2M): you meet the critter who eats golden chips
  // before you automate away the dipping of them. It is a deep jar now, so
  // "inside session two" describes a purchase that no longer exists. 3.9h.
  { what: 'buy:autodip', maxMin: 60 * 5 },
  { what: 'tier:onion', maxMin: 60 * 3 },
  { what: 'buy:detector', maxMin: 60 * 4 },
  { what: 'tier:queso', maxMin: 60 * 9 },    // week one, casual
  // 6.9h -> 7.8h: the Sous Chef's re-price to 2M takes that money out of the
  // wallet ahead of the Third Fryer's 6M. A real knock-on of a deliberate
  // price change, not drift — the ladder order is unchanged.
  { what: 'buy:fryer3', maxMin: 60 * 8 },
  { what: 'tier:seven', maxMin: 60 * 28 },
  // 22h -> 24h with the 10x double-dip nerf (operator 2026-07-27): losing
  // the dd income bonus slows the whole late game slightly, on purpose.
  { what: 'buy:fryer4', maxMin: 60 * 24 },
  { what: 'tier:abyss', maxMin: 60 * 170 },  // the trophy: months, not years
];

function simulate(): Map<string, number> {
  const events = new Map<string, number>();
  let crumbs = 0, chips = 0, sec = 0;
  let fryers = 1, seasonN = 1, seasonD = 1, ddMod = 0, bowlCap = 1_000_000;
  const owned = new Set<string>();
  const chains: Record<string, string[]> = {};
  for (const c of [['season1','season2','season3','season4','season5','season6'],['bowl1','bowl2','bowl3'],['fryer2','fryer3','fryer4'],['doubledip1','doubledip2'],['detector','detector2']]) {
    for (const k of c) chains[k] = c;
  }
  // The stalls gate the shop now: a jar is on sale only once its vendor's
  // layer has been reached (lib/crew.ts). Same rule the Shelf renders by.
  const dipIndexOf = (): number => {
    let d = 0;
    for (let i = 0; i < DIP_TIERS.length; i++) if (chips >= DIP_TIERS[i].minLifetime) d = i;
    return d;
  };
  const buyable = (k: string): boolean => {
    if (owned.has(k)) return false;
    if (!jarAvailable(k, dipIndexOf())) return false;
    const chain = chains[k];
    if (chain) for (const prev of chain) { if (prev === k) break; if (!owned.has(prev)) return false; }
    return UPGRADES[k].cost <= bowlCap;
  };

  const STEP = 5;
  while (sec < 3600 * 220 && events.size < TARGETS.length + 30) {
    const ddEV = ddMod > 0 ? 1 + 1 / (ddMod * DOUBLE_DIP_RARITY) : 1;
    // EV crumbs/sec: designed ticks, seasoned, per fryer, with dd's dip EV.
    // The crackle curve is EV-flat (cooking.ts), so multi drops out of the
    // expectation — it is variance, which is the point of it.
    const rate = (TICK_CRUMBS / (TICK_MS / 1000)) * (seasonN / seasonD) * fryers * ddEV;

    crumbs = Math.min(crumbs + rate * STEP, bowlCap);
    chips += (rate * STEP) / CRUMBS_PER_CHIP;   // lifetime paces on amount/1000
    sec += STEP;

    for (const t of DIP_TIERS) {
      if (t.minLifetime > 0 && chips >= t.minLifetime && !events.has(`tier:${t.key}`)) events.set(`tier:${t.key}`, sec);
    }
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
console.log('== full timeline (designed ticks, casual dips, greedy buys) ==');
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

// FLOORS: some things must NOT come early. A trophy that arrives in a day is
// no trophy — this is the check that caught the first pot-engine pass
// handing out the Abyss at 24h.
const FLOORS: Target[] = [
  { what: 'tier:abyss', maxMin: 60 * 40 },   // read as: NOT BEFORE 40h
  { what: 'tier:fondue', maxMin: 60 * 15 },
];
for (const f of FLOORS) {
  const got = events.get(f.what);
  const ok = got === undefined || got >= f.maxMin * 60;
  if (!ok) misses++;
  console.log(`  ${ok ? ' ok ' : 'MISS'}  ${f.what.padEnd(16)} floor  ${fmt(f.maxMin * 60).padStart(7)}  actual ${got === undefined ? 'never' : fmt(got)}`);
}
console.log(misses === 0 ? '\nall targets met' : `\n${misses} target(s) missed`);
process.exit(misses === 0 ? 0 : 1);
