/**
 * MORE HASTE, IDENTICAL EV.
 *
 * Operator, 2026-08-04: "tune overcooking more towards multiplier — it doesn't
 * feel like it 'does anything'", then, precisely: "I am saying keep the ev the
 * same but lean more towards the haste". Not a request to make the burner pay
 * better — a request to make the thing he bought VISIBLE.
 *
 * The EV penalty is carried entirely by the drain (cooking.ts's header: pure
 * haste scores 100.0% of base at every dip target; any drain scores strictly
 * less). The drain is charged PER TICK, so hastening the burn shortens it and
 * would quietly make the jar cheaper — a stealth buff, which is not what was
 * asked for. The invariant that holds EV fixed for a burn of ANY length is
 *
 *     (1 - drain) ^ haste  =  constant
 *
 * since a burn of wall-clock T costs `(1 - d) ^ (haste * T / TICK_MS)`.
 *
 * This file pins that equivalence at SIX burn lengths rather than just at the
 * ceiling, because the burner is realistically lit for one or two crackles and
 * an equivalence that only holds for a full ride would be a balance change
 * wearing a tuning change's clothes.
 *
 * Run: npx tsx src/lib/overcookTuning.test.ts
 */
import {
  OVERCOOK_HASTE, OVERCOOK_DRAIN, CRACKLE_BASE_S, TICK_MS, MAX_CRACKLES,
} from './cooking';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** The tuning this replaced. The EV anchor is defined against it. */
const OLD_HASTE = 1 / 3;
const OLD_DRAIN = 0.03;

/** Pot kept after burning for `seconds` of wall clock at (haste, drain). */
const kept = (seconds: number, haste: number, drain: number): number =>
  Math.pow(1 - drain, (seconds * haste) / (TICK_MS / 1000));

/* ── 1. THE BURNER IS ACTUALLY FASTER ──────────────────────────────────── */
{
  check('haste is stronger than it was', OVERCOOK_HASTE < OLD_HASTE,
    { was: OLD_HASTE, now: OVERCOOK_HASTE });
  check('...and it still SHORTENS the wait rather than lengthening it',
    OVERCOOK_HASTE < 1, OVERCOOK_HASTE);
  // `haste` multiplies expectedWaitS in tickChip, so smaller == sooner.
  check('every crackle now arrives in half the lit time',
    Math.abs(OVERCOOK_HASTE / OLD_HASTE - 0.5) < 1e-9,
    { ratio: OVERCOOK_HASTE / OLD_HASTE });
}

/* ── 2. EV IS UNCHANGED, AT EVERY BURN LENGTH ──────────────────────────── */
{
  // One crackle at each level, plus a full ride — the realistic burns.
  const H = 0.6; // the operator's measured crackleHaste
  const lengths = Array.from({ length: MAX_CRACKLES + 1 }, (_, k) =>
    CRACKLE_BASE_S * 2 ** (k + 1) * H);
  lengths.push(lengths.reduce((a, b) => a + b, 0));

  for (const T of lengths) {
    const before = kept(T, OLD_HASTE, OLD_DRAIN);
    const after = kept(T, OVERCOOK_HASTE, OVERCOOK_DRAIN);
    check(`pot kept is unchanged over a ${T.toFixed(0)}s burn`,
      Math.abs(before - after) < 1e-4,
      { before: +before.toFixed(6), after: +after.toFixed(6) });
  }
}

/* ── 3. IT IS STILL EV-NEGATIVE, AND STILL BRUTALLY SO ─────────────────── */
{
  // The whole design rests on the burn being a real cost. If a retune ever
  // makes this cheap, the jar stops being a tool and becomes income.
  const H = 0.6;
  const toCeiling = Array.from({ length: MAX_CRACKLES + 1 }, (_, k) =>
    CRACKLE_BASE_S * 2 ** (k + 1) * H).reduce((a, b) => a + b, 0);
  const k = kept(toCeiling, OVERCOOK_HASTE, OVERCOOK_DRAIN);
  check('a burn ridden to the ceiling still keeps ~1% of its pot',
    k > 0.005 && k < 0.02, { kept: +(k * 100).toFixed(2) + '%' });
  check('the drain rose to pay for the haste', OVERCOOK_DRAIN > OLD_DRAIN,
    { was: OLD_DRAIN, now: OVERCOOK_DRAIN });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
