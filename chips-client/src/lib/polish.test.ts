/**
 * THE GRAIN's rule, and the one thing about it that is easy to get backwards.
 *
 * The payout is read BEFORE the streak advances, so the dip that STARTS a
 * streak pays x1 and the fifth in a row is the first to pay the cap. Paying on
 * the dip that earns it would hand out a free 15% for switching baskets — the
 * exact opposite of the decision this ability exists to create.
 *
 * The BALANCE is measured, not asserted (scripts/polishsim.ts): at STEP 0.15 /
 * CAP 4, cycling at max goes -5.0% -> +32.6% against parking while spamming at
 * x2 stays at -90%. Those numbers belong in a sim; this file pins the rule.
 *
 * Run: npx tsx src/lib/polish.test.ts
 */
import {
  freshPolish, polishMult, advance, polishLook, POLISH_STEP, POLISH_CAP,
} from './polish';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/* ── 1. THE FIRST DIP EARNS NOTHING ────────────────────────────────────── */
{
  const p = freshPolish();
  check('a cold basket pays x1', polishMult(p, 0) === 1, polishMult(p, 0));
  const after = advance(p, 0);
  check('and the FIRST dip only starts the streak', after.streak === 1, after);
  check('so the second dip is the first to be paid',
    polishMult(after, 0) === 1 + POLISH_STEP, polishMult(after, 0));
}

/* ── 2. IT CLIMBS, THEN STOPS ──────────────────────────────────────────── */
{
  let p = freshPolish();
  const seen: number[] = [];
  for (let i = 0; i < POLISH_CAP + 4; i++) {
    seen.push(polishMult(p, 2));
    p = advance(p, 2);
  }
  check('each dip in a row pays more than the last, until the cap',
    seen.slice(0, POLISH_CAP + 1).every((v, i, a) => i === 0 || v > a[i - 1]), seen);
  const capped = 1 + POLISH_CAP * POLISH_STEP;
  check(`it stops climbing at x${capped.toFixed(2)}`,
    Math.max(...seen) === capped, { max: Math.max(...seen), capped });
  check('and never exceeds it however long the streak', polishMult(p, 2) === capped, polishMult(p, 2));
}

/* ── 3. SWITCHING BASKETS RESETS IT — the whole decision ───────────────── */
{
  let p = freshPolish();
  for (let i = 0; i < POLISH_CAP + 1; i++) p = advance(p, 1);
  check('a fully polished basket pays the cap',
    polishMult(p, 1) === 1 + POLISH_CAP * POLISH_STEP, polishMult(p, 1));
  check('but ANOTHER basket pays x1', polishMult(p, 3) === 1, polishMult(p, 3));

  const moved = advance(p, 3);
  check('and dipping it restarts the streak at 1, not zero',
    moved.at === 3 && moved.streak === 1, moved);
  check('so the old basket is cold again', polishMult(moved, 1) === 1, polishMult(moved, 1));
}

/* ── 4. THE PICTURE CANNOT DISAGREE WITH THE RULE ──────────────────────── */
{
  let p = freshPolish();
  check('no shine on a cold basket', polishLook(p, 0) === 0);
  for (let i = 0; i < POLISH_CAP; i++) p = advance(p, 0);
  check('full shine exactly where the payout caps',
    polishLook(p, 0) === 1 && polishMult(p, 0) === 1 + POLISH_CAP * POLISH_STEP,
    { look: polishLook(p, 0), mult: polishMult(p, 0) });
  p = advance(p, 0);
  check('and never overflows', polishLook(p, 0) === 1, polishLook(p, 0));
  check('no shine on a basket that is not the streak', polishLook(p, 1) === 0);
}

/* ── 5. BASKET 0 IS NOT "NO BASKET" ────────────────────────────────────── */
{
  // `at: null` vs `at: 0` is the classic falsy trap here — a streak on basket 0
  // must not read as no streak at all.
  const p = advance(freshPolish(), 0);
  check('a streak on basket 0 is a real streak', p.at === 0 && polishMult(p, 0) > 1, p);
  check('and a fresh polish is not basket 0', freshPolish().at === null, freshPolish());
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
