/**
 * The crew roster's structural invariants — the ones a copy edit or a catalog
 * retune could silently break:
 *   - every jar in the catalog is sold by EXACTLY ONE critter (the whole
 *     shelf is stalls now; an unassigned jar is unbuyable, a double-assigned
 *     one renders twice);
 *   - a chain's rungs never gate SHALLOWER than their predecessors (or a
 *     visible successor could sit permanently blocked behind an unbuyable
 *     predecessor);
 *   - recruitment derives from dipIndex alone, dog from day one;
 *   - every vendor can actually speak (feed mode picks from armLines).
 *
 * Run: npx tsx src/lib/crew.test.ts
 */
import { CREW, crewFor, recruitsAt, vendorOf, jarAvailable, TICKER, tickerPoolFor } from './crew';
import { UPGRADES, UPGRADE_CHAINS, DIP_TIERS, START_BOWL_CAP } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// 1) Catalog completeness: every upgrade has exactly one vendor, and no
//    vendor sells a jar that does not exist.
{
  const catalog = Object.keys(UPGRADES);
  const sold = CREW.flatMap((m) => m.sells);
  const missing = catalog.filter((k) => !sold.includes(k));
  const dupes = sold.filter((k, i) => sold.indexOf(k) !== i);
  const ghosts = sold.filter((k) => !(k in UPGRADES));
  check('every jar in the catalog is on somebody\'s stall', missing.length === 0, missing);
  check('no jar is sold twice', dupes.length === 0, dupes);
  check('no stall sells a jar that does not exist', ghosts.length === 0, ghosts);
  check('vendorOf agrees for every key', catalog.every((k) => vendorOf(k)?.sells.includes(k) ?? false));
}

// 2) Chains never gate shallower as they go: each rung's vendor layer is >=
//    its predecessor's, so the next rung always becomes available no later
//    than it becomes buyable-in-order.
{
  for (const chain of UPGRADE_CHAINS) {
    const layers = chain.map((k) => vendorOf(k)?.layer ?? -1);
    const monotone = layers.every((l, i) => i === 0 || l >= layers[i - 1]);
    check(`chain ${chain[0]}… gates deeper monotonically`, monotone, { chain, layers });
  }
}

// 3) jarAvailable: closed before the vendor's layer, open at it — for every
//    single jar in the catalog.
{
  const all = Object.keys(UPGRADES);
  const gated = all.every((k) => {
    const layer = vendorOf(k)!.layer;
    const openAt = jarAvailable(k, layer);
    const closedBefore = layer === 0 ? true : !jarAvailable(k, layer - 1);
    return openAt && closedBefore;
  });
  check('every jar opens exactly at its vendor\'s layer', gated);
  check('day one, only the dog\'s stall is open',
    all.filter((k) => jarAvailable(k, 0)).sort().join() === ['season1', 'bowl1', 'airtight', 'fryer2'].sort().join());
}

// 4) Recruitment: derived from dipIndex, dog from day one, everyone by the
//    Abyss, and the ceremony never announces the dog (he was always here).
{
  check('day one crew is exactly the dog', crewFor(0).map((m) => m.id).join() === 'scoop');
  check('guacamole adds avo and limewedge',
    crewFor(1).map((m) => m.id).sort().join() === ['scoop', 'avo', 'limewedge'].sort().join());
  check('queso brings the rat and the angel',
    crewFor(3).some((m) => m.id === 'rat') && crewFor(3).some((m) => m.id === 'angel'));
  check('the whole bestiary is aboard by the Abyss', crewFor(7).length === CREW.length);
  check('crew only ever grows', crewFor(4).length >= crewFor(3).length && crewFor(3).length >= crewFor(2).length);
  check('recruitsAt never announces the dog', recruitsAt(0).length === 0);
  check('recruitsAt(1) is the guac residents', recruitsAt(1).map((m) => m.id).sort().join() === ['avo', 'limewedge'].sort().join());
  check('every layer index maps inside the tier table', CREW.every((m) => m.layer >= 0 && m.layer < DIP_TIERS.length));
}

// 5) Vendors can speak: a stall with jars must have arm and munch lines
//    (feed mode picks from them), and everyone has idle lines except nobody.
{
  const mute = CREW.filter((m) => m.sells.length > 0 && (m.armLines.length === 0 || m.munchLines.length === 0));
  check('every vendor has arm and munch lines', mute.length === 0, mute.map((m) => m.id));
  check('everybody has at least one idle line', CREW.every((m) => m.lines.length > 0));
}

// 6) The golden toll is the angel's alone.
{
  check('the angel takes golden chips only', vendorOf('season4')?.feed === 'golden');
  check('nobody else does', CREW.filter((m) => m.feed === 'golden').map((m) => m.id).join() === 'angel');
}

// 7) Jobs: exactly one rat, exactly one angel, both recruited at queso.
{
  const rat = CREW.filter((m) => m.job === 'rat');
  const angel = CREW.filter((m) => m.job === 'angel');
  check('one rat, one angel', rat.length === 1 && angel.length === 1);
  check('both live in the queso', rat[0].layer === 3 && angel[0].layer === 3);
}

// 8) The ticker: pool grows with depth and never shrinks; every line has a
//    reachable layer; the surface pool is not empty.
{
  const sizes = Array.from({ length: 8 }, (_, d) => tickerPoolFor(d).length);
  check('ticker pool only ever deepens', sizes.every((s, i) => i === 0 || s >= sizes[i - 1]), sizes);
  check('the surface has news', sizes[0] >= 4, sizes[0]);
  check('the Abyss hears everything', sizes[7] === TICKER.length);
  check('no line is unreachable', TICKER.every((t) => t.layer >= 0 && t.layer < DIP_TIERS.length));
}

// 9) THE CAP DIAGONAL — the invariant that was missing when the wing arrived
//    at Buffalo with a stall nobody could ever clear (live table Corner Rail
//    684, 2026-07-28: fryer5 300M and doubledip3 400M on sale under a 200M
//    bowl, with Bigger Bowl III sold a whole tier deeper by the oracle. The
//    player had bought every other jar in the game and had NOTHING to spend
//    on until Fondue, staring at two cards telling them to "buy a Bigger Bowl
//    first" — a bowl that was not on any stall they could reach).
//
//    Three guards existed and all three missed it, because each looks at one
//    axis: chipsConst.test.ts compares every cost to the single largest cap
//    in the game with no layer at all; check 2) above compares layers to
//    layers; flowsim silently treats over-cap as "not yet" and has no target
//    naming a deep jar. The bug lives on the diagonal: COST AT LAYER L vs THE
//    BIGGEST BOWL OBTAINABLE AT LAYER L. That is what this checks.
{
  // Bowls in ascending capacity — derived, so a new bowl is covered for free.
  const bowls = Object.keys(UPGRADES)
    .filter((k) => UPGRADES[k].bowlCap !== undefined)
    .sort((a, b) => UPGRADES[a].bowlCap! - UPGRADES[b].bowlCap!);
  // The most a bowl can hold once you have reached layer L. A bowl sold AT L
  // counts: it and the jar it unlocks are on the shelf at the same moment.
  const capAt = (L: number): number => {
    let cap = START_BOWL_CAP;
    for (const k of bowls) { const v = vendorOf(k); if (v && v.layer <= L) cap = UPGRADES[k].bowlCap!; }
    return cap;
  };

  const overpriced = Object.keys(UPGRADES).filter((k) => UPGRADES[k].cost > capAt(vendorOf(k)!.layer));
  check('no jar costs more than the bowl reachable at its vendor\'s layer', overpriced.length === 0,
    overpriced.map((k) => `${k}=${UPGRADES[k].cost} > cap ${capAt(vendorOf(k)!.layer)}`));

  // The sharper form: a stall whose EVERY jar is over cap is a critter you
  // trek down to meet who can sell you nothing, ever.
  const dead = CREW.filter((m) => m.sells.length > 0 && m.sells.every((k) => UPGRADES[k].cost > capAt(m.layer)));
  check('no vendor arrives with a fully unbuyable stall', dead.length === 0, dead.map((m) => m.id));
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
