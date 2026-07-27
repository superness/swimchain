/**
 * Determinism and equilibrium. Run: npx tsx src/lib/shoalEngine.determinism.test.ts
 *
 * These are the release blockers. A recorded session must replay identically,
 * and the turtled-ball equilibrium must be demonstrably absent — including a
 * control run proving the test can actually detect it.
 */
import { foldShoal } from './shoalEngine';
import type { LogEntry, Presence } from './shoalTypes';
import { START_SIZE, MIN_SIZE, TICK_MS, HUNGER_TICK_INTERVAL, HUNGER_AMOUNT } from './shoalConst';

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

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
