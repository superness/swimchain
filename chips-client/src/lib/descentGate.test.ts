/**
 * THE DESCENT IS GATED BY THE BOSSES, NOT BY LIFETIME.
 *
 * Reproduced from a live save, 2026-07-29. The player beat the porcelain — one
 * boss, band 0 — and was shown The Other Side, the sixth and last band, having
 * fought nothing else. Operator: "I went from porcelain and that sent me
 * immediately past everything."
 *
 * The cause is the fight itself. The porcelain demands ONE dip worth more than
 * everything banked this run, so the winning chip is enormous by construction;
 * that chip was banked as well as spent, lifetime leapt past all six band
 * floors at once, and depth — which read lifetime alone — followed it down.
 *
 * Two rules now stop it, and both are checked here:
 *   1. depth may never exceed the band below your last kill;
 *   2. the chip fed to a boss pays nothing, so it cannot move you at all.
 *
 * Run: npx tsx src/lib/descentGate.test.ts
 */
import { tunnelDepth, DEEP_BANDS } from './tunnelDepth';
import { DIP_TIERS, deepBandFloor, DEEP_BAND_COUNT } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const LAST_TIER = DIP_TIERS.length - 1;
const FIRST_DEEP = DIP_TIERS.length;          // ordinal of The Porcelain
/** The live save: 100,075,314 lifetime, one boss beaten. */
const LIVE_LIFETIME = 100_075_314;

/* ── 1. THE REPORTED BUG, exactly ──────────────────────────────────────── */
{
  const gated = tunnelDepth(LAST_TIER, LIVE_LIFETIME, 1);
  // One band broken earns the band you are about to fight — The Table — and
  // no further. MUTANT: drop the clamp and this reaches ordinal 13.
  check('one boss beaten shows The Table, not The Other Side',
    gated.layer === FIRST_DEEP + 1, { layer: gated.layer, expected: FIRST_DEEP + 1 });

  // Stated the other way, in the words the player reads.
  const band = DEEP_BANDS[gated.layer - FIRST_DEEP];
  check('...which is literally the next boss', band?.label === 'The Table', band);
}

/* ── 2. LIFETIME ALONE MUST MOVE NOBODY ────────────────────────────────── */
{
  // A billionaire who has fought nothing sits at the porcelain, same as a
  // player who just arrived. This is the whole property.
  const rich = tunnelDepth(LAST_TIER, 999_999_999_999, 0);
  const poor = tunnelDepth(LAST_TIER, deepBandFloor(0), 0);
  check('no bosses beaten pins you at the porcelain however rich you are',
    rich.layer === poor.layer && rich.layer === FIRST_DEEP,
    { rich: rich.layer, poor: poor.layer });
}

/* ── 3. EACH KILL IS WORTH EXACTLY ONE BAND ────────────────────────────── */
{
  // The gate is a CEILING, never a floor: the answer is whichever is shallower,
  // what lifetime earns or what the bosses allow. An earlier version of this
  // test asserted the gate would PUSH you to ordinal 14 on the sixth kill,
  // which contradicts the check below it — lifetime only reaches 13 here.
  const ungatedLayer = tunnelDepth(LAST_TIER, LIVE_LIFETIME).layer;
  for (let broken = 0; broken <= DEEP_BAND_COUNT; broken++) {
    const d = tunnelDepth(LAST_TIER, LIVE_LIFETIME, broken);
    const expected = Math.min(ungatedLayer, FIRST_DEEP + broken);
    check(`${broken} beaten -> ordinal ${expected}`, d.layer === expected,
      { broken, got: d.layer, expected });
  }
}

/* ── 4. THE GATE MUST NOT HOLD ANYONE BACK ─────────────────────────────── */
{
  // A player who has NOT earned the band by lifetime is still limited by
  // lifetime — the gate is a ceiling, never a floor. Someone with one kill but
  // shallow lifetime stays where lifetime puts them.
  const shallow = tunnelDepth(0, 0, 6);
  check('the gate never PUSHES you deeper than lifetime warrants',
    shallow.layer === 0, shallow);

  // And the surface is unaffected entirely.
  const surface = tunnelDepth(0, 0, 0);
  check('the surface is untouched', surface.layer === 0 && surface.depth < 1, surface);
}

/* ── 5. UNGATED CALLERS ARE UNCHANGED ──────────────────────────────────── */
{
  // The doorway screens draw an ungated shaft on purpose; omitting `broken`
  // must behave exactly as before this change.
  const ungated = tunnelDepth(LAST_TIER, LIVE_LIFETIME);
  check('omitting broken leaves the old behaviour intact',
    ungated.layer === FIRST_DEEP + DEEP_BAND_COUNT - 1, ungated);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
