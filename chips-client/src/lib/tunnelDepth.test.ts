/**
 * The tunnel's depth model against the REAL tier table.
 *
 * The load-bearing properties: the front never leaves the band the fold put
 * it in (rule 1 of tunnelDepth.ts), depth is monotone in lifetime so the
 * tunnel only ever scrolls DOWN, and the synthetic continuation really is
 * endless and doubling. Each is checked against DIP_TIERS itself, not against
 * restated threshold numbers — retuning a tier must not break this file.
 *
 * Run: npx tsx src/lib/tunnelDepth.test.ts
 */
import { tunnelDepth, bandAt, bandsAround, DEEP_BANDS } from './tunnelDepth';
import { DIP_TIERS } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + String(extra) : ''}`); }
}

const LAST = DIP_TIERS.length - 1;
const LAST_MIN = DIP_TIERS[LAST].minLifetime;

// 1) Rule 1: the layer IS dipIndex for every defined tier, at both edges of
//    the band — including a lifetime that disagrees with dipIndex, which must
//    clamp to the band's edge rather than wander into a neighbour.
for (let i = 0; i < LAST; i++) {
  const lo = DIP_TIERS[i].minLifetime;
  const hi = DIP_TIERS[i + 1].minLifetime;
  const atLo = tunnelDepth(i, lo);
  const nearHi = tunnelDepth(i, hi - 1);
  check(`tier ${i} (${DIP_TIERS[i].key}): front stays in its band`,
    atLo.layer === i && atLo.frac === 0 && nearHi.layer === i && nearHi.frac < 1,
    JSON.stringify({ atLo, nearHi }));
  const below = tunnelDepth(i, Math.max(0, lo - 50));
  const beyond = tunnelDepth(i, hi + hi);
  check(`tier ${i}: out-of-band lifetime clamps to the band edge`,
    below.layer === i && below.frac === 0 && beyond.layer === i && beyond.frac < 1,
    JSON.stringify({ below, beyond }));
}

// 2) Depth is monotone non-decreasing along a real progression (dipIndex
//    walked in lockstep with lifetime, the only way the fold produces them).
{
  let prev = -1;
  let mono = true;
  for (let life = 0; life <= LAST_MIN * 8; life += 7919) {
    let idx = 0;
    for (let t = 0; t < DIP_TIERS.length; t++) if (life >= DIP_TIERS[t].minLifetime) idx = t;
    const d = tunnelDepth(idx, life).depth;
    if (d < prev) { mono = false; break; }
    prev = d;
  }
  check('depth only ever increases as lifetime grows', mono, prev);
}

// 3) The continuation is endless and doubling: entering the last tier starts
//    band LAST, and each doubling of lifetime past its threshold is one band.
{
  const start = tunnelDepth(LAST, LAST_MIN);
  check('entering the last tier lands at the top of its band',
    start.layer === LAST && start.frac === 0, JSON.stringify(start));
  for (const k of [1, 2, 5, 20]) {
    const d = tunnelDepth(LAST, LAST_MIN * Math.pow(2, k));
    check(`lifetime ×2^${k} past the last tier = ${k} synthetic bands down`,
      d.layer === LAST + k && d.frac === 0, JSON.stringify(d));
  }
  const mid = tunnelDepth(LAST, LAST_MIN * 3); // halfway through band LAST+1
  check('halfway through a synthetic band reads as frac 0.5',
    mid.layer === LAST + 1 && Math.abs(mid.frac - 0.5) < 0.001, JSON.stringify(mid));
}

// 4) frac is always in [0, 1) — the front can touch a band's top, never its
//    bottom, so depth stays inside [layer, layer+1) and bands cannot overlap.
{
  let ok = true;
  for (const [i, life] of [[0, 0], [0, 299], [3, 149_999], [LAST, LAST_MIN * 1.999], [LAST, Number.MAX_SAFE_INTEGER]] as const) {
    const d = tunnelDepth(i, life);
    if (d.frac < 0 || d.frac >= 1 || d.depth < d.layer || d.depth >= d.layer + 1) ok = false;
  }
  check('frac stays in [0, 1) at every probed edge', ok);
}

// 5) Bands, in three regions now: the dip ladder, THE DESCENT below it, and
//    the endless continuation below that.
{
  const defined = DIP_TIERS.every((t, i) => {
    const b = bandAt(i);
    return b.key === t.key && b.label === t.label && !b.beyond;
  });
  check('bands 0..last mirror DIP_TIERS exactly', defined);

  // THE DESCENT. These used to be filler — seven throwaway chalk lines over
  // the reused abyss palette — and the old test asserted exactly that, so it
  // is rewritten rather than extended. `beyond` must be FALSE for them: it is
  // the flag that dims a band's chalk into scenery (styles.css
  // `.t-band.beyond .t-name`), and a place you can break through is not
  // scenery.
  const deep = DEEP_BANDS.map((_, i) => bandAt(DIP_TIERS.length + i));
  check('the descent is six named bands', DEEP_BANDS.length === 6, DEEP_BANDS.length);
  check('each carries its own label', deep.every((b, i) => b.label === DEEP_BANDS[i].label));
  check('each carries its OWN palette key, not the abyss palette',
    deep.every((b) => b.key !== DIP_TIERS[LAST].key), deep.map((b) => b.key));
  check('none of them is marked beyond', deep.every((b) => !b.beyond));
  check('the porcelain is the first thing under the dip', deep[0].key === 'porcelain');
  check('the lava is under the dirt', DEEP_BANDS[4].key === 'lava' && DEEP_BANDS[3].key === 'dirt');

  // Keys become `[data-dip=…]` selectors, so a duplicate silently paints one
  // band with another's palette.
  const keys = [...DIP_TIERS.map((t) => t.key), ...DEEP_BANDS.map((b) => b.key)];
  check('every band key in the game is unique', new Set(keys).size === keys.length, keys);

  // AND IT STILL NEVER ENDS. The descent is finite; the tunnel is not.
  const past = [DIP_TIERS.length + DEEP_BANDS.length, DIP_TIERS.length + DEEP_BANDS.length + 3, 500];
  const tailOk = past.every((o) => {
    const b = bandAt(o);
    return b.label.length > 0 && b.beyond && b.key === DEEP_BANDS[DEEP_BANDS.length - 1].key;
  });
  check('below the descent the tunnel is still endless and labelled', tailOk);
  check('a depth of 500 does not run off the end of the chalk', bandAt(500).label.length > 0);
}

// 6) The render window: contiguous ordinals, never negative, always containing
//    the band the depth is in — the DOM's whole view of "endless".
{
  for (const depth of [0, 0.4, 3.7, 42.2]) {
    const w = bandsAround(depth, 3, 5);
    const contiguous = w.every((b, i) => i === 0 || b.ordinal === w[i - 1].ordinal + 1);
    const holdsFront = w.some((b) => b.ordinal === Math.floor(depth));
    check(`window at depth ${depth} is contiguous, non-negative, holds the front`,
      contiguous && holdsFront && w[0].ordinal >= 0,
      w.map((b) => b.ordinal).join(','));
  }
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
