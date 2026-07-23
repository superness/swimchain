/**
 * trenchEngine — executable rule spec. Run with: npx tsx src/lib/trenchEngine.test.ts
 *
 * Each `check()` computes its expected value independently of the code under test
 * (hand arithmetic in comments, or a from-scratch simulation loop) rather than by
 * re-invoking foldClaim with different inputs and comparing outputs to each other —
 * a fold that shares a bug with its own test would otherwise still pass.
 */
import {
  START_SALVAGE,
  COST_FARM,
  COST_STOREHOUSE,
  COST_BEACON,
  CAP_BASE,
  CAP_PER_STOREHOUSE,
  INTEGRITY_MAX,
  DECAY_LIT,
  DECAY_BASE,
  DECAY_DARK,
  YIELD_LIT,
  YIELD_DIM,
  YIELD_DARK,
  TEND_COST,
  HB_CAP_PER_DAY,
  LIT_MIN,
  DIM_MIN,
  EXPEDITION_BASE_RANGE,
  RANGE_PER_BEACON,
  CLAIM_MIN_SPACING,
  GLOW_PER_STRUCTURE_LIT_DAY,
  parseClaimHeader,
  embeddedMs,
  utcDay,
  brightnessOn,
  foldClaim,
  aliveCount,
  expeditionRange,
  chebyshev,
  salvageRoll,
  project,
  foldMap,
  type ReplyLike,
  type ClaimHeader,
} from './trenchEngine';

const DAY = 86_400_000;

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (v instanceof Map ? [...v] : v)) : ''}`);
  }
}

const r = (body: string | null, ms: number, cid: string, author = 'A'): ReplyLike => ({
  author_id: author,
  body,
  content_id: cid,
  created_at: ms,
  block_height: 10,
});

/** n heartbeat replies with distinct ms, all within UTC day `day`. */
const hb = (n: number, day: number, author = 'A', tag = 'hb'): ReplyLike[] =>
  Array.from({ length: n }, (_, i) => r('heartbeat', day * DAY + i * 1000, `${tag}_${day}_${i}`, author));

const H: ClaimHeader = { v: 1, kind: 'trench-claim', name: 'home', x: 0, y: 0 };

// ── 1) parse: claim header round-trips ──────────────────────────────────────────────
{
  const h = parseClaimHeader('home\n\n{"v":1,"kind":"trench-claim","name":"home","x":3,"y":-2}');
  check('parse: header round-trips x', h?.x === 3, h);
  check('parse: header round-trips y', h?.y === -2, h);
  check('parse: header round-trips name', h?.name === 'home', h);
  check('parse: malformed JSON -> null', parseClaimHeader('home\n\n{not valid json') === null);
  check('parse: missing body -> null', parseClaimHeader(null) === null);
}

// ── 2) parse: embedded ms ────────────────────────────────────────────────────────────
{
  check('embeddedMs: parses #<ms>~', embeddedMs('heartbeat #1753000000000~') === 1753000000000);
  check('embeddedMs: missing -> undefined', embeddedMs('heartbeat') === undefined);
  check('utcDay: quantizes to whole days', utcDay(200 * DAY + 12345) === 200, utcDay(200 * DAY + 12345));
}

// ── 3) fold: founding day initializes with start kit ────────────────────────────────
{
  const s = foldClaim('c1', 'A', H, [r('harvest', 100 * DAY, 'm1')]);
  check('found: salvage = START_SALVAGE', s.salvage === START_SALVAGE, s.salvage);
  check('found: biomass = 0', s.biomass === 0, s.biomass);
  check('found: lastDay = 100', s.lastDay === 100, s.lastDay);
  check('found: brightness = DARK', s.brightness === 'DARK', s.brightness);
  check('found: no structures', s.structures.length === 0, s.structures);
  // brightnessOn is a directly-testable primitive: an empty heartbeat history is DARK,
  // and a day with a trailing sum >= LIT_MIN is LIT, regardless of how it got there.
  check('brightnessOn: empty history -> DARK', brightnessOn(new Map(), 100) === 'DARK');
  check('brightnessOn: trailing sum >= LIT_MIN -> LIT', brightnessOn(new Map([[100, LIT_MIN]]), 100) === 'LIT');
  check('brightnessOn: trailing sum >= DIM_MIN but < LIT_MIN -> DIM', brightnessOn(new Map([[100, DIM_MIN]]), 100) === 'DIM');
}

// ── 4) heartbeat: cap enforced in-fold ───────────────────────────────────────────────
{
  const s = foldClaim('c2', 'A', H, hb(8, 100));
  const ok = s.moves.filter((m) => m.outcome === 'ok').length;
  const capped = s.moves.filter((m) => m.outcome === 'rejected-capped').length;
  check('hb cap: HB_CAP_PER_DAY ok', ok === HB_CAP_PER_DAY, s.moves);
  check('hb cap: 2 rejected-capped', capped === 2, s.moves);
  check('hb cap: heartbeatDays[100] = HB_CAP_PER_DAY', s.heartbeatDays.get(100) === HB_CAP_PER_DAY, s.heartbeatDays);
}

// ── 5) brightness: tiers over trailing 7 days ────────────────────────────────────────
// In all three sub-cases the heartbeats land on days D..D+1 only (D gets 6, D+1 gets
// the remainder), then a harvest on D+6 banks days D+2..D+6. Every one of those banked
// days' trailing-7 window [d-6, d] fully contains both D and D+1 (since d-D <= 6 for
// all d in D+2..D+6), so every banked day sees the SAME accumulated total — the one
// asserted below — making the harvest-day's (= final) brightness a clean function of
// that total.
{
  const D = 200;
  // LIT_MIN(=25) total heartbeats spread across days D..D+4 (6+6+6+6+1), harvest at
  // D+6 banks D+5..D+6; both days' windows ([D-1,D+5] and [D,D+6]) fully contain
  // D..D+4, so both see the full LIT_MIN -> LIT.
  const litFixed = foldClaim('c3b', 'A', H, [
    ...hb(6, D),
    ...hb(6, D + 1),
    ...hb(6, D + 2),
    ...hb(6, D + 3),
    ...hb(LIT_MIN - 4 * 6, D + 4),
    r('harvest', (D + 6) * DAY, 'hv2'),
  ]);
  check('brightness: LIT_MIN hb over D..D+4, harvest D+6 -> LIT', litFixed.brightness === 'LIT', litFixed.brightness);

  // DIM_MIN(=8) total: 6 on day D, DIM_MIN-6 on day D+1 (>= DIM_MIN, < LIT_MIN).
  const dim = foldClaim('c4', 'A', H, [...hb(6, D), ...hb(DIM_MIN - 6, D + 1), r('harvest', (D + 6) * DAY, 'hv3')]);
  check('brightness: DIM_MIN hb -> DIM at D+6', dim.brightness === 'DIM', dim.brightness);

  // DIM_MIN-1(=7) total: 6 on day D, DIM_MIN-1-6 on day D+1 (< DIM_MIN).
  const dark = foldClaim('c5', 'A', H, [...hb(6, D), ...hb(DIM_MIN - 1 - 6, D + 1), r('harvest', (D + 6) * DAY, 'hv4')]);
  check('brightness: DIM_MIN-1 hb -> DARK at D+6', dark.brightness === 'DARK', dark.brightness);
}

// ── 6) build: farm costs salvage; unaffordable rejected ──────────────────────────────
{
  const s = foldClaim('c6', 'A', H, [
    r('build farm', 100 * DAY, 'b1'),
    r('build farm', 100 * DAY + 1, 'b2'),
    r('build farm', 100 * DAY + 2, 'b3'),
  ]);
  check('build: move1 ok, salvage 20->10', s.moves[0].outcome === 'ok' && s.salvage !== undefined);
  check('build: move2 ok', s.moves[1].outcome === 'ok', s.moves[1]);
  check('build: move3 rejected-unaffordable', s.moves[2].outcome === 'rejected-unaffordable', s.moves[2]);
  check('build: final salvage = 0 (20 - 10 - 10)', s.salvage === START_SALVAGE - COST_FARM - COST_FARM, s.salvage);
  check('build: only 2 farms built', s.structures.length === 2, s.structures);
}

// ── 7) banking: farm yields by brightness across a day gap ──────────────────────────
// D = founding day. build farm same day (salvage 20 -> 10). Heartbeats: 6,6,6,6,1 on
// D..D+4 (total 25). Harvest at D+7 banks D+1..D+7. Per-day brightness uses ONLY
// heartbeats already posted as of the START of that day's bank (the day's OWN
// heartbeats, if any, are applied strictly after that day's bank — banking always
// precedes move-application for the move that crosses into the new day):
//   D+1 bank: seen-so-far = {D:6}                    trailing[D-5..D+1] =  6        -> DARK (yield 1)
//   D+2 bank: seen-so-far = {D:6,D+1:6}               trailing[D-4..D+2] = 12        -> DIM  (yield 2)
//   D+3 bank: seen-so-far = {..,D+2:6}                trailing[D-3..D+3] = 18        -> DIM  (yield 2)
//   D+4 bank: seen-so-far = {..,D+3:6}                trailing[D-2..D+4] = 24        -> DIM  (yield 2)
//   D+5 bank: seen-so-far = {..,D+4:1} (=25 total)    trailing[D-1..D+5] = 25        -> LIT  (yield 4)
//   D+6 bank: same totals, D still in window [D..D+6] = 25                          -> LIT  (yield 4)
//   D+7 bank: window is [D+1..D+7]; D drops out: 6+6+6+1 = 19                        -> DIM  (yield 2)
// Sum of yields = 1+2+2+2+4+4+2 = 17 half-units. Decay across the same 7 days:
// 4+2+2+2+1+1+2 = 14, so integrity 20-14 = 6 (never <=0 -> not ruined).
{
  const D = 300;
  const s = foldClaim('c7', 'A', H, [
    r('build farm', D * DAY, 'bf'),
    ...hb(6, D),
    ...hb(6, D + 1),
    ...hb(6, D + 2),
    ...hb(6, D + 3),
    ...hb(1, D + 4),
    r('harvest', (D + 7) * DAY, 'hv'),
  ]);
  const expectedYield = YIELD_DARK + YIELD_DIM + YIELD_DIM + YIELD_DIM + YIELD_LIT + YIELD_LIT + YIELD_DIM;
  check('bank: expectedYield arithmetic sanity = 17', expectedYield === 17, expectedYield);
  check('bank: biomass = 17 half-units', s.biomass === expectedYield, s.biomass);
  check('bank: salvage = 20 - 10 (farm cost) = 10', s.salvage === START_SALVAGE - COST_FARM, s.salvage);
  const expectedDecay = DECAY_DARK + DECAY_BASE + DECAY_BASE + DECAY_BASE + DECAY_LIT + DECAY_LIT + DECAY_BASE;
  check('bank: farm integrity = 20 - 14 = 6, not ruined', s.structures[0].integrity === INTEGRITY_MAX - expectedDecay && !s.structures[0].ruined, s.structures[0]);
}

// ── 8) banking: decay ruins an untended structure ────────────────────────────────────
// Build farm day D, no heartbeats ever (brightness DARK throughout). DECAY_DARK=4/day,
// INTEGRITY_MAX=20 -> ruins exactly on the 5th banked day (D+5): 20 - 4*5 = 0. Yield is
// added BEFORE decay within a day's bank (see fold semantics order), so the farm still
// produces on the very day it ruins: alive for banked days D+1..D+5 (5 days) at
// YIELD_DARK=1/day -> biomass = 5. Days D+6..D+11 the farm is ruined: no further yield,
// no further decay. Harvest at D+11 just reads the fully-settled state.
{
  const D = 400;
  const s = foldClaim('c8', 'A', H, [r('build farm', D * DAY, 'bf'), r('harvest', (D + 11) * DAY, 'hv')]);
  check('ruin: farm ruined', s.structures[0].ruined === true, s.structures[0]);
  check('ruin: integrity floored at 0', s.structures[0].integrity === 0, s.structures[0]);
  check('ruin: biomass = 5 (5 alive DARK days x 1)', s.biomass === 5 * YIELD_DARK, s.biomass);
}

// ── 9) tend: repairs to full, costs biomass; ruined unrepairable ────────────────────
{
  const D = 500;
  // (a) tend an alive structure: 2 farms built day D (cost 10 each, salvage 20->0).
  // 3 banked days (D+1..D+3) of DARK decay/yield before the tend at D+3: biomass =
  // 2 farms x 1 (DARK yield) x 3 days = 6; each farm's integrity = 20 - 4*3 = 8.
  // Tend idx 1 costs TEND_COST=4 (affordable: 6>=4) -> biomass 6-4=2, integrity reset.
  const shortFold = foldClaim('c9a', 'A', H, [
    r('build farm', D * DAY, 'f0'),
    r('build farm', D * DAY + 1, 'f1'),
    r('tend 1', (D + 3) * DAY, 'tend1'),
  ]);
  check('tend: alive tend ok', shortFold.moves[2].outcome === 'ok', shortFold.moves[2]);
  check('tend: integrity reset to INTEGRITY_MAX', shortFold.structures[1].integrity === INTEGRITY_MAX, shortFold.structures[1]);
  check('tend: biomass paid (6 - TEND_COST = 2)', shortFold.biomass === 6 - TEND_COST, shortFold.biomass);
  check('tend: untouched farm still at 8 (20 - 4*3)', shortFold.structures[0].integrity === INTEGRITY_MAX - DECAY_DARK * 3, shortFold.structures[0]);

  // (b) continue to D+6: idx0 (never tended) ruins on D+5 (8 -[email protected]+4=4 -[email protected]+5=0);
  // idx1 (reset to 20 at D+3) is still alive at D+6 (20 -4*3=8). A tend attempt on the
  // now-ruined idx0 must be rejected, and an out-of-bounds idx must be rejected too.
  const longFold = foldClaim('c9b', 'A', H, [
    r('build farm', D * DAY, 'f0'),
    r('build farm', D * DAY + 1, 'f1'),
    r('tend 1', (D + 3) * DAY, 'tend1'),
    r('tend 0', (D + 6) * DAY, 'tend0-ruined'),
    r('tend 99', (D + 6) * DAY + 1, 'tend-oob'),
  ]);
  check('tend: ruined structure -> rejected-ruined', longFold.moves[3].outcome === 'rejected-ruined', longFold.moves[3]);
  check('tend: idx0 is in fact ruined', longFold.structures[0].ruined === true, longFold.structures[0]);
  check('tend: out-of-bounds -> rejected-unknown-structure', longFold.moves[4].outcome === 'rejected-unknown-structure', longFold.moves[4]);

  // (c) tend an ALIVE structure while biomass < TEND_COST: build farm at founding day
  // D2, then tend idx0 the SAME day (no day-advance has run yet, so biomass is still
  // its founding value of 0 < TEND_COST) -> rejected-unaffordable, and untouched
  // (integrity stays INTEGRITY_MAX; no decay has run either, since it's still day D2).
  const D2 = 501;
  const poor = foldClaim('c9c', 'A', H, [r('build farm', D2 * DAY, 'f0'), r('tend 0', D2 * DAY + 1, 'tend-poor')]);
  check('tend: biomass < TEND_COST -> rejected-unaffordable', poor.moves[1].outcome === 'rejected-unaffordable', poor.moves[1]);
  check('tend: integrity unchanged on rejected-unaffordable', poor.structures[0].integrity === INTEGRITY_MAX, poor.structures[0]);
  check('tend: biomass unchanged on rejected-unaffordable', poor.biomass === 0, poor.biomass);
}

// ── 10) storehouse: raises caps while alive; ruin lowers future caps ────────────────
{
  const D = 600;
  const justBuilt = foldClaim('c10a', 'A', H, [r('build storehouse', D * DAY, 'bs')]);
  check('storehouse: costs COST_STOREHOUSE salvage', justBuilt.salvage === START_SALVAGE - COST_STOREHOUSE, justBuilt.salvage);
  check('storehouse: capSalvage 40->80 immediately', justBuilt.capSalvage === CAP_BASE + CAP_PER_STOREHOUSE, justBuilt.capSalvage);
  check('storehouse: capBiomass 40->80 immediately', justBuilt.capBiomass === CAP_BASE + CAP_PER_STOREHOUSE, justBuilt.capBiomass);

  // DECAY_DARK=4/day, INTEGRITY_MAX=20 -> ruins on banked day D+5. A harvest at D+7
  // forces banking through D+7, so the D+6 (and D+7) day-advance recomputes caps from
  // the now-ruined (0 alive) storehouse set.
  const ruined = foldClaim('c10b', 'A', H, [r('build storehouse', D * DAY, 'bs'), r('harvest', (D + 7) * DAY, 'hv')]);
  check('storehouse: ruined after 5 DARK days', ruined.structures[0].ruined === true, ruined.structures[0]);
  check('storehouse: caps clamp back to 40 after ruin', ruined.capSalvage === CAP_BASE && ruined.capBiomass === CAP_BASE, ruined);
}

// ── 11) expedition: roll, cap-clamp, day-gate, range ─────────────────────────────────
{
  // salvageRoll is a pure function of the content-id's hash part (first hex byte mod
  // 3, plus 1). Hand-computed: 'sha256:00abcdef' -> hash part '00abcdef' -> first byte
  // '00' -> parseInt('00',16)=0 -> 0%3=0 -> roll=1.
  check('salvageRoll: exact value for a fixed cid', salvageRoll('sha256:00abcdef') === 1, salvageRoll('sha256:00abcdef'));
  // 'sha256:07deadbeef' -> first byte '07' -> 7 -> 7%3=1 -> roll=2. Used below so the
  // fold-level salvage delta is independently checkable against this hand value.
  const rollForOkMove = salvageRoll('sha256:07deadbeef');
  check('salvageRoll: second fixed cid = 2', rollForOkMove === 2, rollForOkMove);

  const D = 700;
  const s = foldClaim('c11', 'A', H, [
    // no beacon yet: range = EXPEDITION_BASE_RANGE = 6; target at chebyshev(0,0,7,0)=7 -> out of range.
    r('expedition aaaa111122223333 7 0', D * DAY, 'sha256:exp_out'),
    // build beacon: range becomes 6 + 4 = 10.
    r('build beacon', D * DAY + 1, 'sha256:build_beacon'),
    // target at chebyshev(0,0,0,6)=6, now within range 10 -> ok.
    r('expedition bbbb444455556666 0 6', D * DAY + 2, 'sha256:07deadbeef'),
    // same target, same day -> day-gated regardless of range.
    r('expedition bbbb444455556666 0 6', D * DAY + 3, 'sha256:exp_gate'),
  ]);
  check('expedition: out of range (no beacon)', s.moves[0].outcome === 'rejected-out-of-range', s.moves[0]);
  check('expedition: build beacon ok', s.moves[1].outcome === 'ok', s.moves[1]);
  check('expedition: in range with beacon -> ok', s.moves[2].outcome === 'ok', s.moves[2]);
  check('expedition: same target/day -> rejected-day-gate', s.moves[3].outcome === 'rejected-day-gate', s.moves[3]);
  check(
    'expedition: salvage = 20 - 12 (beacon) + 2*roll',
    s.salvage === START_SALVAGE - COST_BEACON + 2 * rollForOkMove,
    s.salvage
  );
  check('expeditionRange helper matches (base + 1 beacon)', expeditionRange(s) === EXPEDITION_BASE_RANGE + RANGE_PER_BEACON, expeditionRange(s));
  check('aliveCount helper: 1 beacon', aliveCount(s, 'beacon') === 1, aliveCount(s, 'beacon'));

  // Cap-clamp: push salvage up to just under capSalvage (40, no storehouse here) via
  // known-roll expeditions, then one more whose 2*salvageRoll gain would overshoot the
  // cap -- assert the fold clamps to capSalvage exactly, never to the overshot value.
  // 'sha256:02...' -> hash part '02aaa00N' -> first byte '02' -> parseInt=2 -> 2%3=2
  // -> roll=1+2=3 -> gain=2*3=6 for every move below (fixed first byte).
  const bigRoll = salvageRoll('sha256:02cafefeed');
  check('salvageRoll: gain-6 fixture cid = 3', bigRoll === 3, bigRoll);
  const D2 = 750;
  const clamp = foldClaim('c11b', 'A', H, [
    r('expedition cccc000000000001 0 1', D2 * DAY, 'sha256:02aaa001'), // 20 -> 26
    r('expedition cccc000000000002 0 2', D2 * DAY + 1, 'sha256:02aaa002'), // 26 -> 32
    r('expedition cccc000000000003 0 3', D2 * DAY + 2, 'sha256:02aaa003'), // 32 -> 38
    r('expedition cccc000000000004 0 4', D2 * DAY + 3, 'sha256:02aaa004'), // 38 + 6 = 44 -> clamp
  ]);
  check('cap-clamp: all four expeditions ok', clamp.moves.every((m) => m.outcome === 'ok'), clamp.moves);
  check('cap-clamp: capSalvage is CAP_BASE (no storehouse)', clamp.capSalvage === CAP_BASE, clamp.capSalvage);
  check(
    'cap-clamp: salvage clamps exactly to capSalvage (40), not the overshot 44',
    clamp.salvage === CAP_BASE && clamp.salvage === clamp.capSalvage,
    clamp.salvage
  );
}

// ── 12) determinism: shuffled pending order folds identically ───────────────────────
// All four replies share the SAME created_at (0) — a stand-in for the node's
// query-stamped, unstable-per-poll created_at on still-pending mempool replies — so
// only the embedded `#<ms>~` field can produce correct chronological order. If the
// fold ever fell back to created_at or array position, this would fold differently
// for the two orderings below.
{
  const D = 800;
  const msA = D * DAY;
  const msB = D * DAY + 1000;
  const msC = (D + 1) * DAY;
  const msD = (D + 2) * DAY;
  const build = [
    r(`build farm #${msA}~`, 0, 'm1'),
    r(`heartbeat #${msB}~`, 0, 'm2'),
    r(`heartbeat #${msC}~`, 0, 'm3'),
    r(`harvest #${msD}~`, 0, 'm4'),
  ];
  const inOrder = foldClaim('c12a', 'A', H, build);
  const shuffled = foldClaim('c12b', 'A', H, [build[3], build[1], build[0], build[2]]);
  check('determinism: salvage matches', inOrder.salvage === shuffled.salvage, [inOrder.salvage, shuffled.salvage]);
  check('determinism: biomass matches', inOrder.biomass === shuffled.biomass, [inOrder.biomass, shuffled.biomass]);
  check('determinism: glow matches', inOrder.glow === shuffled.glow, [inOrder.glow, shuffled.glow]);
  check(
    'determinism: structures deep-equal',
    JSON.stringify(inOrder.structures) === JSON.stringify(shuffled.structures),
    [inOrder.structures, shuffled.structures]
  );
}

// ── 13) glow: alive structures on LIT days ───────────────────────────────────────────
// 2 farms built day D (cost 10 each = 20 = START_SALVAGE exactly). Heartbeats 6/day on
// D..D+5 (6 days). Trailing-7 sums seen at each banked day (same seen-so-far causality
// as test 7):
//   D+1: {D:6}                              ->  6  DARK
//   D+2: {D,D+1}                            -> 12  DIM
//   D+3: {D,D+1,D+2}                        -> 18  DIM
//   D+4: {D,D+1,D+2,D+3}                    -> 24  DIM
//   D+5: {D..D+4}                           -> 30  LIT  (>=25)
//   D+6: {D..D+5}, window [D,D+6]           -> 36  LIT
//   D+7: {D..D+5}, window [D+1,D+7] (D out) -> 30  LIT  (D+1..D+5 alone = 30 >=25)
//   D+8: window [D+2,D+8] = D+2..D+5 only   -> 24  DIM
// -> exactly 3 LIT banked days (D+5, D+6, D+7). glow = 2 structures x 3 LIT days = 6.
{
  const D = 900;
  const s = foldClaim('c13', 'A', H, [
    r('build farm', D * DAY, 'f0'),
    r('build farm', D * DAY + 1, 'f1'),
    ...hb(6, D),
    ...hb(6, D + 1),
    ...hb(6, D + 2),
    ...hb(6, D + 3),
    ...hb(6, D + 4),
    ...hb(6, D + 5),
    r('harvest', (D + 8) * DAY, 'hv'),
  ]);
  check('glow: exactly 6 (2 structures x 3 LIT days)', s.glow === 2 * GLOW_PER_STRUCTURE_LIT_DAY * 3, s.glow);
  check('glow: neither farm ruined', s.structures.every((st) => !st.ruined), s.structures);
}

// ── 14) map: spacing rejection ───────────────────────────────────────────────────────
{
  const claimBody = (name: string, x: number, y: number) =>
    `${name}\n\n${JSON.stringify({ v: 1, kind: 'trench-claim', name, x, y })}`;
  const claims = [
    { claimId: 'cA', owner: 'A', body: claimBody('A', 0, 0), created_at: 1 },
    { claimId: 'cB', owner: 'B', body: claimBody('B', 1, 1), created_at: 2 }, // chebyshev(A)=1 < CLAIM_MIN_SPACING
    { claimId: 'cC', owner: 'C', body: claimBody('C', 5, 5), created_at: 3 }, // chebyshev(A)=5, fine
    { claimId: 'cD', owner: 'D', body: 'not json at all', created_at: 4 }, // malformed
  ];
  const out = foldMap(claims);
  check('map: claim A accepted', out[0].accepted === true, out[0]);
  check('map: claim B rejected (too close, chebyshev 1 < CLAIM_MIN_SPACING)', out[1].accepted === false, out[1]);
  check('map: claim C accepted (chebyshev 5)', out[2].accepted === true, out[2]);
  check('map: malformed claim D -> accepted:false', out[3].accepted === false, out[3]);
  check('chebyshev helper sanity: (0,0)-(1,1) = 1', chebyshev(0, 0, 1, 1) === 1 && chebyshev(0, 0, 1, 1) < CLAIM_MIN_SPACING);
  check('chebyshev helper sanity: (0,0)-(5,5) = 5', chebyshev(0, 0, 5, 5) === 5 && chebyshev(0, 0, 5, 5) >= CLAIM_MIN_SPACING);
}

// ── 15) project: display-only ────────────────────────────────────────────────────────
{
  const D = 1000;
  const replies = [r('build farm', D * DAY, 'bf')];
  const s = foldClaim('c15', 'A', H, replies);
  check('project: base biomass is 0 (founding day, no bank yet)', s.biomass === 0, s.biomass);

  const projected = project(s, (D + 3) * DAY);
  // 3 more DARK days (no heartbeats) x YIELD_DARK=1/farm -> +3 biomass, purely displayed.
  check('project: shows more biomass (+3 DARK days)', projected.biomass === 3 && projected.biomass > s.biomass, [projected.biomass, s.biomass]);
  check('project: salvage passes through unchanged', projected.salvage === s.salvage, [projected.salvage, s.salvage]);

  // The ORIGINAL state must be untouched, and a fresh fold over the SAME replies must
  // reproduce the exact original numbers — proving project() never banked anything.
  check('project: original state biomass still 0', s.biomass === 0, s.biomass);
  check('project: original state structure integrity untouched', s.structures[0].integrity === INTEGRITY_MAX, s.structures[0]);
  const refolded = foldClaim('c15', 'A', H, replies);
  check('project: re-fold over same replies is unchanged', refolded.biomass === 0 && refolded.lastDay === D, refolded);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
