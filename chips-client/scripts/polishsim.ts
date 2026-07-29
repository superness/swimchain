/**
 * THE GRAIN, as POLISH: does rewarding the ACT of dipping actually change how
 * you play — without flipping the game's core secret?
 *
 * The rule under test: consecutive dips in the SAME basket escalate. Each dip
 * there pays `1 + min(streak, CAP) * STEP`; dipping a different basket resets
 * the streak to zero.
 *
 * WHY THIS NEEDS MEASURING FIRST. Dipping is currently an un-reward — a
 * withdrawal you make because upgrades cost crumbs, not because dipping pays.
 * The measured reason is that holding wins: rate doubles per crackle rung, and
 * parking at max is within 0.09% of cycling. A dip below max throws away the
 * ramp you already paid for.
 *
 * So polish has to clear a real bar: pay enough that streaking is a live choice,
 * WITHOUT making "dip constantly at low multiplier" beat "reach max first".
 * If it does the latter, the ability has not added a decision — it has deleted
 * the one the whole game is built on.
 *
 * Every strategy here is measured on the same metric: TOTAL CRUMBS BANKED over
 * a fixed session, which is the only thing a player actually keeps.
 *
 * Run: npx tsx scripts/polishsim.ts
 */
import {
  freshChip, tickChip, worthOf, TICK_MS,
  GOLDEN_CRACKLES, LONG_FRY_CRACKLES, type CookingChip,
} from '../src/lib/cooking';

const N = 4000;
const SEASONING = 1;

/** Candidate tunings: bonus per streak step, and how many steps it caps at. */
const STEP = 0.15;
const CAP = 4;              // so a fully polished basket pays x1.60

const polishMult = (streak: number) => 1 + Math.min(streak, CAP) * STEP;

/**
 * Cook one basket for a session, dipping by `policy`. Returns total banked.
 *
 * `policy(chip)` decides whether to dip THIS tick. Streak only ever grows here
 * because a single basket is the best case for polish — if it cannot pay off
 * with the streak never broken, it cannot pay off at all.
 */
function session(budgetS: number, ceiling: number, policy: (c: CookingChip) => boolean, usePolish: boolean) {
  let rng = 0x51ed270b >>> 0;
  const rnd = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);
  const ticks = Math.floor(budgetS / (TICK_MS / 1000));
  let total = 0;
  let dips = 0;

  for (let run = 0; run < N; run++) {
    let chip = freshChip(0);
    let streak = 0;
    let banked = 0;
    for (let k = 0; k < ticks; k++) {
      chip = tickChip(chip, SEASONING, 1, rnd, { ceiling }).chip;
      if (policy(chip)) {
        banked += Math.floor(worthOf(chip) * (usePolish ? polishMult(streak) : 1));
        streak += 1;
        dips += 1;
        chip = freshChip(0);
      }
    }
    // Whatever is still in the oil at the bell is banked too — parking would be
    // absurdly penalised otherwise, and that is the strategy to beat.
    banked += Math.floor(worthOf(chip) * (usePolish ? polishMult(streak) : 1));
    total += banked;
  }
  return { avg: total / N, dipsPerRun: dips / N };
}

const STRATS = (ceiling: number) => [
  { name: 'park (dip only at the bell)', policy: () => false },
  { name: 'cycle at max', policy: (c: CookingChip) => c.crackles >= ceiling },
  { name: `cycle at ${ceiling - 1}`, policy: (c: CookingChip) => c.crackles >= ceiling - 1 },
  { name: 'cycle at 3', policy: (c: CookingChip) => c.crackles >= 3 },
  { name: 'cycle at 1 (spam)', policy: (c: CookingChip) => c.crackles >= 1 },
];

for (const [cname, ceiling] of [['x32', GOLDEN_CRACKLES], ['x64', LONG_FRY_CRACKLES]] as const) {
  for (const mins of [30, 120]) {
    console.log(`\n${'='.repeat(74)}\nceiling ${cname}, ${mins} min session   (STEP ${STEP}, CAP ${CAP} -> max x${polishMult(CAP).toFixed(2)})`);
    console.log('strategy                        no polish     with polish     dips   polish delta');
    const base = session(mins * 60, ceiling, () => false, false);
    for (const s of STRATS(ceiling)) {
      const off = session(mins * 60, ceiling, s.policy, false);
      const on = session(mins * 60, ceiling, s.policy, true);
      const vsPark = (n: number) => `${n >= base.avg ? '+' : ''}${(((n / base.avg) - 1) * 100).toFixed(1)}%`;
      console.log(
        `${s.name.padEnd(30)} ${vsPark(off.avg).padStart(9)}     ${vsPark(on.avg).padStart(11)}  ${on.dipsPerRun.toFixed(1).padStart(7)}   ${(((on.avg / off.avg) - 1) * 100).toFixed(1)}%`
      );
    }
  }
}

/* ── THE BAR ────────────────────────────────────────────────────────────── */
console.log(`\n${'='.repeat(74)}\nTHE QUESTIONS THAT DECIDE IT\n`);
let bad = 0;
const claim = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) console.log(`  ok  ${name}`);
  else { bad++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
};

const C = LONG_FRY_CRACKLES;
const B = 120 * 60;
const park = session(B, C, () => false, true).avg;
const atMax = session(B, C, (c) => c.crackles >= C, true).avg;
const spam = session(B, C, (c) => c.crackles >= 1, true).avg;
const atThree = session(B, C, (c) => c.crackles >= 3, true).avg;

claim('polish makes dipping at max WORTH something vs parking', atMax > park * 1.02,
  { park: Math.round(park), atMax: Math.round(atMax) });
claim('but spamming at x2 still loses badly — the secret survives', spam < park * 0.6,
  { park: Math.round(park), spam: Math.round(spam) });
claim('and dipping mid-ladder is still worse than dipping at max', atThree < atMax,
  { atThree: Math.round(atThree), atMax: Math.round(atMax) });

if (bad > 0) {
  console.error(`\n${bad} of the design's requirements are NOT met at STEP=${STEP} CAP=${CAP} — retune before building`);
  process.exit(1);
}
console.log('\npolish is a live choice and holding still wins the ladder — safe to build');
