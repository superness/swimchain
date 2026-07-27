/**
 * Determinism and equilibrium. Run: npx tsx src/lib/shoalEngine.determinism.test.ts
 *
 * These are the release blockers. A recorded session must replay identically,
 * and the turtled-ball equilibrium must be demonstrably absent — including a
 * control run proving the test can actually detect it.
 */
import { foldShoal } from './shoalEngine';
import type { LogEntry, Presence } from './shoalTypes';
import { cellCentre } from './bloom';
import {
  START_SIZE, MIN_SIZE, TICK_MS, HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, BITE_GROWTH,
  TENSION_NEUTRAL, TENSION_TRIGGER, HUSH_MS, MAX_TAKE,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Deterministic pseudo-random, seeded — the wall-clock RNG is banned in this engine. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1_664_525 + 1_013_904_223) >>> 0; return s; };
}

/** Build a reproducible session of `n` swimmers milling about. */
function session(n: number, durationMs: number): LogEntry[] {
  const rnd = lcg(20260727);
  const out: LogEntry[] = [];
  for (let i = 0; i < n; i++) {
    const id = `f${String(i).padStart(2, '0')}`;
    for (let t = 0; t < durationMs; t += 5_000) {
      const p: Presence = {
        kind: 'presence', id, ms: t, hash: `${id}-${t}`,
        vec: {
          x: 1_000 + (rnd() % 800), y: 1_000 + (rnd() % 800),
          heading: rnd() % 256, speed: rnd() % 80, t,
        },
      };
      out.push(p);
    }
  }
  return out;
}

// Fingerprint every field that could diverge between two clients that folded
// the same log in different delivery orders. `recentBites` is included even
// though this file's sessions never post an EatClaim (so it is always empty
// here) — Fish carries it since Task 7's scatter-voids-the-trip fix, and
// leaving it out of the fingerprint would let a fold bug that corrupts only
// that field pass undetected. Every map and array is sorted before
// serialising, so insertion order — which the fold's own iteration order
// already does not guarantee — can never leak into the comparison.
const fingerprint = (s: ReturnType<typeof foldShoal>) =>
  JSON.stringify({
    fish: [...s.fish.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.x, v.y, [...v.recentBites].sort((a, b) => a - b)]),
    tension: s.tension,
    lastTaken: [...s.lastTaken].sort(),
    lastSweepMs: s.lastSweepMs,
    bites: [...s.bitesTaken.entries()].sort(([a], [b]) => a - b),
  });

// --- Replay ----------------------------------------------------------------
{
  const log = session(12, 120_000);
  const a = foldShoal(log, 120_000);
  const b = foldShoal(log, 120_000);
  check('the same log folds to the same state twice', fingerprint(a) === fingerprint(b));
}
{
  // Delivery order differs between peers; the fold must not care.
  const log = session(12, 120_000);
  const shuffled = [...log];
  const rnd = lcg(99);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  check('a shuffled log folds to the same state',
    fingerprint(foldShoal(log, 120_000)) === fingerprint(foldShoal(shuffled, 120_000)));
}
{
  // No float leaked in: every size and position is an integer.
  const s = foldShoal(session(12, 120_000), 120_000);
  let allInt = true;
  for (const f of s.fish.values()) {
    if (!Number.isInteger(f.size) || !Number.isInteger(f.x) || !Number.isInteger(f.y)) allInt = false;
  }
  check('every folded value is an integer', allInt);
  check('tension is an integer', Number.isInteger(s.tension), s.tension);
}

// --- The turtle proof ------------------------------------------------------
{
  // Twenty fish pile into one spot and NEVER eat. Under hunger they must all
  // starve down toward the floor. If they hold their size, the permanent ball
  // is viable and the game has no engine.
  const log: LogEntry[] = [];
  for (let i = 0; i < 20; i++) {
    const id = `b${String(i).padStart(2, '0')}`;
    log.push({ kind: 'presence', id, ms: 0, hash: `${id}-0`,
      vec: { x: 1_000 + i, y: 1_000, heading: 0, speed: 0, t: 0 } });
    log.push({ kind: 'presence', id, ms: 40_000, hash: `${id}-1`,
      vec: { x: 1_000 + i, y: 1_000, heading: 0, speed: 0, t: 40_000 } });
  }
  const s = foldShoal(log, 80_000);

  // Independent expectation, computed by hand — deliberately NOT from the
  // live HUNGER_AMOUNT import. Task 8 Step 3 mutates HUNGER_AMOUNT to 0 in
  // shoalConst.ts to prove this test detects hunger being disabled. If
  // `expected` were derived from that same live import, the mutation would
  // cancel itself out here: `expected` would rise to 100 exactly as the
  // (now un-hungry) fish's actual size stays 100, and the comparison below
  // would keep passing even with the design's load-bearing rule gone. So the
  // arithmetic is pinned by hand to the real CONSENSUS numbers:
  //   80_000 / TICK_MS(250)               = 320 ticks
  //   320 / HUNGER_TICK_INTERVAL(4)       = 80 hunger-ticks
  //   80 hunger-ticks * HUNGER_AMOUNT(1)  = 80 lost
  //   max(MIN_SIZE(60), START_SIZE(100) - 80) = max(60, 20) = 60
  // The floor DOES bind (20 < 60) — the ball hits MIN_SIZE well before 80s
  // is up, not merely trending down from 100.
  const ticks = Math.floor(80_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const HAND_VERIFIED_HUNGER_AMOUNT = 1; // must equal the real HUNGER_AMOUNT; see comment above for why this is not the import
  const expected = Math.max(MIN_SIZE, START_SIZE - hungerTicks * HAND_VERIFIED_HUNGER_AMOUNT);

  let allStarved = true;
  for (const f of s.fish.values()) if (f.size !== expected) allStarved = false;
  check('an idle ball starves', allStarved, { expected, sizes: [...s.fish.values()].map((f) => f.size).slice(0, 4) });

  // Checked against the ACTUAL folded sizes, not against `expected` — this
  // way the check is a direct observation of the simulation (did anyone
  // really get smaller?) rather than a second comparison against the same
  // oracle used above, so it flips independently if hunger is neutered.
  let actuallyLostSize = true;
  for (const f of s.fish.values()) if (f.size >= START_SIZE) actuallyLostSize = false;
  check('the idle ball lost real size', actuallyLostSize,
    { sizes: [...s.fish.values()].map((f) => f.size).slice(0, 4), START_SIZE });

  // The ball must also be SAFE — that is the whole tension. Nobody is taken.
  check('a tight ball is never swept', s.lastTaken.length === 0, s.lastTaken);
}

// --- Control: the starve assertion is discriminating ------------------------
{
  // The starve check above is only meaningful if the expected value it
  // computes is actually reachable and actually different from "unchanged".
  // Assert the discriminating gap directly, so a constants change that
  // quietly made hunger a no-op fails HERE rather than passing silently.
  const ticks = Math.floor(80_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const loss = hungerTicks * HUNGER_AMOUNT;
  check('hunger over 80s is a nonzero loss', loss > 0, { loss, hungerTicks });
  check('that loss is large enough to be observable', loss >= 10, { loss });
  console.log('  note  Task 8 Step 3 mutates HUNGER_AMOUNT to 0 to confirm end to end');
}

// --- A session that actually drives the engine ------------------------------
//
// session() above only ever emits `presence`: tension there peaks around 82
// (nowhere near TENSION_TRIGGER, 30000), no hush ever starts, no sweep ever
// resolves, and with no EatClaim ever posted, bitesTaken stays empty and
// every fish's recentBites stays []. The replay/shuffle checks above are
// therefore proven only for presence dead-reckoning and hunger — the hush,
// the sweep resolution, and bloom crediting have no shuffled full-session
// coverage anywhere in the suite. That is exactly the class of bug sweep.ts
// itself calls out as the most trust-destroying this game can have: two
// clients disagreeing about who the shark took.
//
// richSession() is a hand-built, fully static fixture (every fish stationary
// from t=0) engineered so tension climbs to the trigger, a sweep actually
// resolves, and a bloom actually credits — with every number below derived
// from the constants, not read off whatever the fold happens to produce.
function richSession(): LogEntry[] {
  const out: LogEntry[] = [];
  const pres = (id: string, x: number, y: number, ms: number): Presence => ({
    kind: 'presence', id, ms, hash: `${id}${ms}`, vec: { x, y, heading: 0, speed: 0, t: ms },
  });

  // The eat cell: col 15, row 11 of the BLOOM_COLS(32) x BLOOM_ROWS(24) grid
  // -> cell index = row*BLOOM_COLS + col = 11*32 + 15 = 367. cellCentre's own
  // formula is col*BLOOM_CELL + BLOOM_CELL/2, so its centre is
  // (15*128+64, 11*128+64) = (1984, 1472) — arithmetic on BLOOM_CELL alone,
  // independent of anything canEat/markVisits computes.
  const cell = 367;
  const centre = cellCentre(cell); // (1984, 1472)

  // --- The sheltered cluster: the eater (e0) plus three buddies, all parked
  // exactly on the cell centre (distance 0, well inside SHELTER_R and
  // EAT_R). shelterOf sums SHELTER_BASE(100) + trunc(size/40) (capped) from
  // every OTHER body within SHELTER_R(340); at distance 0 all three buddies
  // qualify. Even once hunger has floored a buddy at MIN_SIZE(60), it still
  // contributes 100 + trunc(60/40) = 101, so three of them sum to 303 —
  // still >= SHELTER_THRESHOLD(300). So this cluster is sheltered (never
  // exposed, never swept) for the fish's entire lifetime, regardless of how
  // far hunger has eaten into their size by the time the sweep fires.
  out.push(pres('e0', centre.x, centre.y, 0));
  out.push(pres('c1', centre.x, centre.y, 0));
  out.push(pres('c2', centre.x, centre.y, 0));
  out.push(pres('c3', centre.x, centre.y, 0));
  // e0's own presence must sort before its eat claim within tick 0 so the
  // fold sees a live fish before it checks the bite, and so the fallow
  // check runs before this tick's markVisits — same ms, and hash 'e00' <
  // 'e0e0' (comparing the third character, '0' < 'e'), the identical
  // convention shoalEngine.test.ts uses for the same reason.
  out.push({ kind: 'eat', id: 'e0', cell, x: centre.x, y: centre.y, ms: 0, hash: 'e0e0' });

  // --- Eight outsiders, spread far from the cluster in a pattern chosen so
  // the median — see coreCentre/medianInt: for an EVEN count, the LOWER of
  // the two middle sorted values, not an average — lands exactly on the
  // cluster's own coordinate on both axes independently. That puts the
  // cluster inside the core (distance 0) and every outsider outside it.
  // Offsets are multiples of 8 (QUANT) so reckon's quantization is a no-op
  // and every resulting position is exact.
  //
  // x-offsets {-896,-704,-496,-304,304,496,704,896}: paired with the
  // cluster's four copies of x=1984, the 12 sorted x-values are [4 lower
  // outsiders][4 x 1984][4 higher outsiders] — index 5 (0-indexed, the
  // "lower middle" of 12) falls inside the middle block, value 1984.
  // Likewise the y-offsets (a permutation of the same magnitude set,
  // deliberately paired with a DIFFERENT magnitude for x each time so no
  // outsider's combined 2D distance from the cluster is small) put the
  // y-median at 1472 too. Every one of the 8 combined (dx,dy) pairs below
  // has dx^2+dy^2 > CORE_R2 (620^2 = 384400) — the smallest is o1's
  // 704^2+304^2 = 588032 — so all 8 read as outside the core on every tick.
  const offsets: Array<[string, number, number]> = [
    ['o0', -896, 496], ['o1', -704, -304], ['o2', -496, 896], ['o3', -304, -704],
    ['o4', 304, -896], ['o5', 496, 704], ['o6', 704, -496], ['o7', 896, 304],
  ];
  for (const [id, dx, dy] of offsets) out.push(pres(id, centre.x + dx, centre.y + dy, 0));

  return out;
}

const richLog = richSession();
const RICH_UNTIL_MS = 30_000;

// Hand arithmetic for the tension ramp. All 12 fish are stationary from t=0,
// so spreadPerMille is the SAME constant on every tick: 8 of the 12 fish
// (the outsiders) sit outside the core every tick, the cluster's 4 never do.
//   spreadPerMille = trunc(1000 * 8 / 12) = trunc(666.67) = 666
//   delta per tick  = 666 - TENSION_NEUTRAL(250) = 416
//   ticks to reach TENSION_TRIGGER(30000): ceil(30000 / 416) = 73
//   the trigger fires on the 73rd tick, i.e. at t = 72 * TICK_MS(250) = 18000
//   tension at that tick = 416 * 73 = 30368
//   the hush resolves HUSH_MS(8000) later: t = 18000 + 8000 = 26000
const spreadPerMilleHand = Math.trunc((1000 * 8) / 12);
const deltaHand = spreadPerMilleHand - TENSION_NEUTRAL;
const ticksToTrigger = Math.ceil(TENSION_TRIGGER / deltaHand);
const triggerAtMs = (ticksToTrigger - 1) * TICK_MS;
const tensionAtTrigger = deltaHand * ticksToTrigger;
const resolveAtMs = triggerAtMs + HUSH_MS;

{
  // Mid-fold, well before the trigger: tension is genuinely non-zero here —
  // unlike the old check above, which only ever observed a FINAL tension of
  // 0 and so passed trivially whether or not spreadPerMille's Math.trunc
  // was even present. k = 10000/TICK_MS + 1 ticks have run by t=10000 (the
  // tick at t=0 is the 1st), so tension = deltaHand * k.
  const checkpointMs = 10_000;
  const k = checkpointMs / TICK_MS + 1;
  const s = foldShoal(richLog, checkpointMs);
  check('tension mid-fold is a non-trivial, hand-derived integer',
    Number.isInteger(s.tension) && s.tension === deltaHand * k,
    { tension: s.tension, expected: deltaHand * k });
}
{
  // The trigger tick itself: the hush must start exactly here, not before
  // and not later.
  const s = foldShoal(richLog, triggerAtMs);
  check('tension reaches the hand-derived trigger value', s.tension === tensionAtTrigger, s.tension);
  check('the hush starts on the trigger tick', s.hushStartMs === triggerAtMs, s.hushStartMs);
}
{
  const s = foldShoal(richLog, RICH_UNTIL_MS);

  // Non-degeneracy first: the whole point of this fixture is that these are
  // NOT the inert defaults (-1, []) that session() left them at.
  check('a sweep actually resolved (not the inert default)',
    s.lastSweepMs >= 0 && s.lastTaken.length > 0, { lastSweepMs: s.lastSweepMs, lastTaken: s.lastTaken });
  check('the session credits at least one bite (not the inert default)',
    s.bitesTaken.size > 0, [...s.bitesTaken.entries()]);

  // Only once the session is confirmed non-degenerate do the precise,
  // hand-derived checks mean anything.
  check('the sweep resolves at the hand-derived tick', s.lastSweepMs === resolveAtMs, s.lastSweepMs);

  // All 8 outsiders are equally exposed (>=340cu from anyone, including each
  // other) and identical in size and time-outside (all present, stationary,
  // and outside the core from t=0 onward), so topContributor's ascending
  // scan over tied candidates keeps the first one it sees — the lowest id,
  // 'o0' — as preferred, and selectTaken's ordering (preferred first, then
  // descending size — tied — then ascending id) reduces to "the first
  // MAX_TAKE ids in ascending order."
  const expectedTaken = ['o0', 'o1', 'o2'].slice(0, MAX_TAKE);
  check('the sweep takes the hand-derived fish, not an arbitrary set',
    JSON.stringify(s.lastTaken) === JSON.stringify(expectedTaken), s.lastTaken);

  // The bloom: e0's single ms=0 bite must have credited (see richSession's
  // comment on why the fallow test passes and why the presence-before-eat
  // ordering is guaranteed).
  const eater = s.fish.get('e0')!;
  check('the eater carries a non-empty recentBites', eater.recentBites.length > 0, eater.recentBites);

  // NOT "size > START_SIZE" here: over a 30s fold, hunger claws back far
  // more than one BITE_GROWTH(12) ever added, so the eater ends up BELOW
  // START_SIZE despite having eaten — asserting otherwise would have been
  // exactly the "fit the expectation to whatever the code outputs" mistake
  // this plan warns against (an earlier draft of this check did exactly
  // that and failed here: actual was 83, not the assumed >100).
  //
  // The correct hand derivation: over [0, 30000] there are
  // floor(30000/TICK_MS(250)) + 1 = 121 fold ticks, so
  // floor(121 / HUNGER_TICK_INTERVAL(4)) = 30 hunger firings total. Exactly
  // ONE of those is ever exempted for e0: hunger only skips a fish within
  // HUNGER_TICK_INTERVAL*TICK_MS(1000)ms of its last bite, firings are
  // themselves spaced exactly 1000ms apart, so only the single firing
  // immediately after a bite can ever fall inside that window — the next
  // firing 1000ms later never does. e0 bit once, at ms=0, so 30 - 1 = 29
  // firings actually applied, each -HUNGER_AMOUNT(1).
  //   size = START_SIZE(100) + BITE_GROWTH(12) - 29 * HUNGER_AMOUNT(1) = 83
  const totalTicks = Math.floor(RICH_UNTIL_MS / TICK_MS) + 1;
  const totalHungerFirings = Math.floor(totalTicks / HUNGER_TICK_INTERVAL);
  const eaterExemptFirings = 1; // only the firing immediately after the bite; see comment above
  const eaterHungerLoss = (totalHungerFirings - eaterExemptFirings) * HUNGER_AMOUNT;
  const expectedEaterSize = START_SIZE + BITE_GROWTH - eaterHungerLoss;
  check('the eater ends the session at the hand-derived size (bite growth net of hunger)',
    eater.size === expectedEaterSize, { got: eater.size, expected: expectedEaterSize });
}
{
  // Growth from the bite IS real and immediate — check it before hunger has
  // had any chance to claw it back. The first hunger firing lands at
  // t=750 (tickCount 4); at t=500 none has fired yet, so the eater's size
  // is purely START_SIZE + BITE_GROWTH with nothing subtracted.
  const s = foldShoal(richLog, 500);
  check('the credited bite grows the eater before hunger claws anything back',
    s.fish.get('e0')!.size === START_SIZE + BITE_GROWTH, s.fish.get('e0')!.size);
}
{
  // The crucial one: shuffle the rich log and confirm the fold does not
  // care, now that the log actually exercises tension, the hush, the sweep
  // resolution and a bloom credit — not just presence dead-reckoning and
  // hunger, which is all session() above ever touched. If this diverges,
  // that is a real determinism bug in the fold and must be reported, not
  // papered over by loosening this check.
  const shuffled = [...richLog];
  const rnd = lcg(20260728);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rnd() % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const ordered = foldShoal(richLog, RICH_UNTIL_MS);
  const reshuffled = foldShoal(shuffled, RICH_UNTIL_MS);
  check('a shuffled RICH session folds to the same state as the ordered one',
    fingerprint(ordered) === fingerprint(reshuffled),
    { ordered: fingerprint(ordered), reshuffled: fingerprint(reshuffled) });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
