/**
 * The rat and the angel, dice injected. The load-bearing claims:
 *   - the rat's hoard and gorge math (the payout the shoo promises),
 *   - he never leaves on his own (ignoring him IS the punishment),
 *   - his gorge tops out BELOW one crackle's ×2 (the "it depends" tension:
 *     he can never be strictly better than letting the pot ride a multi),
 *   - the angel's glow persists until spent, then really rests.
 *
 * Run: npx tsx src/lib/crewJobs.test.ts
 */
import {
  freshRat, freshAngel, ratTick, ratAbsorb, ratAte, gorgeOf, shooRat,
  angelTick, spendBlessing,
  RAT_FULL_GORGE_S, RAT_GORGE_MAX, ANGEL_COOLDOWN_S,
} from './crewJobs';
import { TICK_MS } from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const never = () => 0.999999;
const always = () => 0;

// 1) Latching: hot dice latch a valid fryer, cold dice leave him loose,
//    an empty rack gives him nothing to latch.
{
  const latched = ratTick(freshRat(), 4, always);
  check('hot dice: he latches a real fryer', latched.latched !== null && latched.latched >= 0 && latched.latched < 4, latched);
  check('and starts empty-cheeked', latched.hoard === 0 && latched.latchedTicks === 0 && latched.eaten === 0);
  check('cold dice: still loose', ratTick(freshRat(), 4, never).latched === null);
  check('no fryers, no latch', ratTick(freshRat(), 0, always).latched === null);
}

// 2) He NEVER leaves on his own — a thousand ticks latched and he is still
//    there, one tick fatter each time.
{
  let rat = ratTick(freshRat(), 2, always);
  for (let i = 0; i < 1000; i++) rat = ratTick(rat, 2, always);
  check('a thousand ticks later he is still latched', rat.latched !== null && rat.latchedTicks === 1000, rat.latchedTicks);
}

// 3) The hoard: absorbs only while latched; eaten crackles count.
{
  const loose = ratAbsorb(freshRat(), 500);
  check('a loose rat absorbs nothing', loose.hoard === 0);
  let rat = ratTick(freshRat(), 1, always);
  rat = ratAbsorb(rat, 250);
  rat = ratAbsorb(rat, 250);
  check('a latched rat banks the diverted ticks', rat.hoard === 500);
  check('he counts his crackles', ratAte(rat).eaten === rat.eaten + 1);
}

// 4) Gorge: ×1.0 the moment he latches, ×(1+MAX) at full, capped after —
//    and the cap stays BELOW one crackle's ×2, by design.
{
  let rat = ratTick(freshRat(), 1, always);   // latchedTicks 0
  check('fresh latch pays ×1.0 exactly', gorgeOf(rat) === 1, gorgeOf(rat));
  const fullTicks = Math.ceil((RAT_FULL_GORGE_S * 1000) / TICK_MS);
  for (let i = 0; i < fullTicks; i++) rat = ratTick(rat, 1, always);
  check('fully gorged pays ×(1+MAX)', Math.abs(gorgeOf(rat) - (1 + RAT_GORGE_MAX)) < 1e-9, gorgeOf(rat));
  for (let i = 0; i < 200; i++) rat = ratTick(rat, 1, always);
  check('the gorge caps — he does not compound', gorgeOf(rat) === 1 + RAT_GORGE_MAX);
  check('DESIGN PIN: his best is worse than one crackle (×2)', 1 + RAT_GORGE_MAX < 2, RAT_GORGE_MAX);
}

// 5) The shoo: floor(hoard × gorge), and he leaves empty.
{
  let rat = ratTick(freshRat(), 1, always);
  rat = ratAbsorb(rat, 1001);
  const fresh = shooRat(rat);
  check('a fresh shoo pays the hoard at ×1.0', fresh.payout === 1001, fresh.payout);
  const fullTicks = Math.ceil((RAT_FULL_GORGE_S * 1000) / TICK_MS);
  let fat = ratTick(freshRat(), 1, always);
  fat = ratAbsorb(fat, 1000);
  for (let i = 0; i < fullTicks; i++) fat = ratTick(fat, 1, always);
  const paid = shooRat(fat);
  check('a gorged shoo pays floor(hoard × 1.75)', paid.payout === Math.floor(1000 * (1 + RAT_GORGE_MAX)), paid.payout);
  check('and he scurries off reset', paid.rat.latched === null && paid.rat.hoard === 0);
}

// 6) A shrunken rack drops him loose rather than latching a ghost fryer.
{
  let rat = ratTick(freshRat(), 4, always);
  rat = { ...rat, latched: 3 };
  check('rack shrink resets him', ratTick(rat, 2, always).latched === null);
}

// 7) The angel: cooldown burns down tick by tick; only then can she glow;
//    the glow persists on any dice until spent; spending really rests her.
{
  check('hot dice off cooldown: she glows', angelTick(freshAngel(), always).glowing);
  check('cold dice: she does not', !angelTick(freshAngel(), never).glowing);
  const resting = { glowing: false, cooldownTicks: 2 };
  const one = angelTick(resting, always);
  check('cooldown ticks down without glowing', !one.glowing && one.cooldownTicks === 1);
  const two = angelTick(one, always);
  check('still resting at zero-crossing tick', !two.glowing && two.cooldownTicks === 0);
  check('then the very next hot tick glows', angelTick(two, always).glowing);
  const glowing = { glowing: true, cooldownTicks: 0 };
  check('a glow persists — it is spent, never expired', angelTick(glowing, never).glowing);
  const spent = spendBlessing(glowing);
  check('spending rests her for the full cooldown',
    !spent.glowing && spent.cooldownTicks === Math.round((ANGEL_COOLDOWN_S * 1000) / TICK_MS), spent);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
