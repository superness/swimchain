/**
 * The headless harness — the whole loop, no DOM, no canvas, printed as text.
 *
 * WHY THIS EXISTS (plan `2026-07-28-the-shoal-shell`, Task 3): rendering is
 * hard to test and easy to fool. This drives a scripted session through
 * `advance` (shoalLoop.ts) exactly as the real bridge would — handing over
 * the WHOLE log on every poll — and prints what the fold actually produced:
 * position, size, shelter, exposure, tension and hush phase. Tasks 4-6 check
 * what the canvas *should* draw against this, separately from whether it drew
 * it. It is deliberately not a test file (no assertions, nothing to fail) —
 * it is a reading instrument.
 *
 * WHAT COUNTS AS "THE WORLD" HERE: every printed number is read from a
 * `ShoalState` the engine produced, or computed by calling `shelterOf`,
 * `isExposed` or `reckon` from `src/lib/` on that state — never a
 * display-side reimplementation of shelter, exposure or dead-reckoning math.
 * `scripts/` is allowed to use floats and a seeded PRNG (this file does, for
 * poll cadence); the fold itself never sees either.
 *
 * THE SCENARIO is not invented from scratch: it is `richSession()` from
 * `shoalFixtures.ts`, shifted so its whole arc lands in the last 30s of an
 * epoch, exactly as `shoalLoop.test.ts` derives it (that file's own comments
 * work out, from the CONSENSUS constants alone, that tension trips the hush
 * at +18s and the sweep resolves at +26s). Reusing the proven fixture rather
 * than a fresh one means this harness is exercising a session already known
 * to make tension climb, the hush arrive and a sweep actually take someone —
 * not an inert log where nothing ever happens.
 *
 * DETERMINISM: `--seed` drives ONLY how the session is polled — a seeded
 * mulberry32 PRNG picks a random number of ticks (1-8, i.e. 250ms-2s) to
 * advance on each call to `advance`, simulating the irregular cadence a real
 * bridge poll would have. No wall clock is read anywhere in this file, and no
 * unseeded randomness. Two runs with the same seed advance the loop through
 * the identical sequence of polls and therefore print byte-identical
 * output; that is what makes `--seed` meaningful (it does NOT reseed the
 * fold, which has no randomness of its own to seed — see shoalLoop.ts's
 * header, "no wall-clock read anywhere in this file"). Different seeds poll
 * on different schedules but fold the same log to the same final ms, so they
 * converge on the same final world — a live demonstration of the exact
 * property shoalLoop.ts's module header states: two clients holding the same
 * entries agree no matter when each of them polled.
 *
 * EXIT CODE: any throw from the fold (or from this file's own consistency
 * checks against it) propagates out of `main()` uncaught by any inner
 * handler and is caught once, at the bottom, which prints it and sets a
 * non-zero exit code. `--throw-demo` deliberately manufactures exactly the
 * case shoalLoop.ts's header calls "open item 8" — calling the low-level
 * `foldShoal` past an epoch boundary without ever rolling it — to prove that
 * path is wired up, not merely asserted in a comment.
 *
 * WILD FISH. Since plan 3 the shelter column counts the wild shoal as well as
 * the people, at WILD_SHELTER_WEIGHT (half a person) each, and the `wild`
 * column breaks out how much of the total is scenery. `--wild-seed` picks
 * which sea; it is a CONSENSUS input in a real room (every client must draw
 * the same shoal from it) and, like `--seed`, it introduces no randomness of
 * its own — the wild shoal is a pure function of (seed, tick, hush).
 *
 * WATCH THE BOLT. `wild` goes to zero exactly WILD_BOLT_MS (2_000 ms) into the
 * hush, two seconds before the input lock, and `shelter` falls by whatever the
 * wild column was holding up. A swimmer whose cover was scenery reads
 * `exposed=no` and then `exposed=yes` with the hush still running — which is
 * the design's central moment printed as two lines of text.
 *
 * Run: npx tsx scripts/harness.ts [--seed N] [--wild-seed N] [--throw-demo]
 */
import { advance, createLoop, type LoopState } from '../src/lib/shoalLoop';
import { foldShoal, bodiesOf, shelterBodiesOf } from '../src/lib/shoalEngine';
import { richSession } from '../src/lib/shoalFixtures';
import { shelterOf, isExposed } from '../src/lib/shelter';
import { isWildId } from '../src/lib/wild';
import { reckon } from '../src/lib/fixed';
import { hushPhase } from '../src/lib/sweep';
import { serialiseCheckpoint } from '../src/lib/checkpoint';
import { epochEndMs } from '../src/lib/epoch';
import { TICK_MS } from '../src/lib/shoalConst';
import type { LogEntry } from '../src/lib/shoalTypes';

// =============================================================================
// CLI
// =============================================================================

interface Args {
  seed: number;
  wildSeed: number;
  throwDemo: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let seed = 1;
  let wildSeed = 1;
  let throwDemo = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--seed') {
      const v = argv[++i];
      seed = Number(v);
      if (v === undefined || !Number.isFinite(seed)) throw new Error(`--seed expects a number, got ${JSON.stringify(v)}`);
    } else if (a.startsWith('--seed=')) {
      const v = a.slice('--seed='.length);
      seed = Number(v);
      if (!Number.isFinite(seed)) throw new Error(`--seed expects a number, got ${JSON.stringify(v)}`);
    } else if (a === '--wild-seed') {
      const v = argv[++i];
      wildSeed = Number(v);
      if (v === undefined || !Number.isFinite(wildSeed)) throw new Error(`--wild-seed expects a number, got ${JSON.stringify(v)}`);
    } else if (a.startsWith('--wild-seed=')) {
      const v = a.slice('--wild-seed='.length);
      wildSeed = Number(v);
      if (!Number.isFinite(wildSeed)) throw new Error(`--wild-seed expects a number, got ${JSON.stringify(v)}`);
    } else if (a === '--throw-demo') {
      throwDemo = true;
    } else if (a === '--help' || a === '-h') {
      console.log('usage: harness.ts [--seed N] [--wild-seed N] [--throw-demo]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return { seed, wildSeed, throwDemo };
}

// =============================================================================
// A seeded PRNG. Integer-seeded, float output — fine here (scripts/ may use
// floats), never fine in src/lib/. mulberry32, a standard small deterministic
// generator: same seed always produces the same sequence, on any machine.
// =============================================================================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// The scenario: richSession(), shifted into the last 30s of an epoch, plus
// the same extra eat claim and lapsed swimmer shoalLoop.test.ts uses to make
// the boundary "genuinely alive" (a non-empty checkpoint `recent` tail, and a
// departed swimmer old enough that the next epoch's warm-up cannot see it).
// The arithmetic is lifted from that test's own derivation, not re-invented.
// =============================================================================

const EPOCH = 40;
const BOUNDARY = epochEndMs(EPOCH); // 147_600_000
const OFFSET = BOUNDARY - 30_000; // 147_570_000 — richSession()'s ms=0 lands here
const X_MS = OFFSET + 25_000; // 147_595_000 — a second, later bite by e0
const X_HASH = 'e0e2';
const TO_MS = BOUNDARY + 3_000; // 147_603_000 — run 3s into the next epoch
const GONE_MS = BOUNDARY - 400_000; // far enough back epoch 41's warm-up can't see it
const GONE_CELL = 100;

function buildLog(): LogEntry[] {
  const out: LogEntry[] = richSession().map((e) => (e.kind === 'presence'
    ? { ...e, ms: e.ms + OFFSET, vec: { ...e.vec, t: e.vec.t + OFFSET } }
    : { ...e, ms: e.ms + OFFSET }));
  out.push({ kind: 'eat', id: 'e0', cell: 367, ms: X_MS, hash: X_HASH });
  out.push({
    kind: 'presence', id: 'gone', ms: GONE_MS, hash: 'g0',
    vec: { x: 576, y: 448, heading: 0, speed: 0, t: GONE_MS },
  });
  out.push({ kind: 'eat', id: 'gone', cell: GONE_CELL, ms: GONE_MS, hash: 'ge0' });
  return out;
}

// =============================================================================
// Printing — designed for a human, not a log parser. One block per poll: a
// header with the tick, tension and hush phase, then one row per live
// swimmer with the field the brief asks for. Position is read via `reckon`
// directly (not via `Fish.x`/`Fish.y`, though the engine already sets those
// identically) so the printed position is independently pulled from the same
// function the fold used, and a mismatch is a bug worth stopping the harness
// over — see the check below.
// =============================================================================

function pad(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}
function padEnd(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printSnapshot(loop: LoopState, label: string, wildSeed: number): void {
  const state = loop.state;
  const atMs = state.nowMs - TICK_MS; // the tick this state actually reflects
  const phase = hushPhase(state.hushStartMs, atMs);
  const bodies = bodiesOf(state);
  // The shelter population: the swimmers PLUS the wild shoal as it stands on
  // this very tick. `shelterBodiesOf` reads the state's own `hushStartMs`, so
  // the bolt needs no wiring here — the wild column simply goes to zero two
  // seconds into the hush, and the shelter column drops with it. That is the
  // whole point of this print: cover that was solid a moment ago, gone.
  const shelterPop = shelterBodiesOf(state, wildSeed, atMs);
  const wildHere = shelterPop.filter((b) => isWildId(b.id)).length;

  const hushInfo = state.hushStartMs >= 0
    ? ` hush-started=${state.hushStartMs} (+${atMs - state.hushStartMs}ms)`
    : '';
  const sweepInfo = state.lastSweepMs >= 0
    ? ` | last sweep @${state.lastSweepMs} took=[${state.lastTaken.length > 0 ? state.lastTaken.join(', ') : '-'}]`
    : ' | no sweep yet';

  console.log('');
  console.log(`== ${label} == t=${atMs} epoch=${state.epoch} tension=${state.tension} phase=${phase}${hushInfo}${sweepInfo}`);
  console.log(`wild in the sea: ${wildHere}`);
  console.log(`${padEnd('id', 6)} ${pad('x', 6)} ${pad('y', 6)} ${pad('size', 5)} ${pad('people', 6)} ${pad('wild', 4)} ${pad('shelter', 7)} exposed`);
  for (const b of bodies) {
    const f = state.fish.get(b.id);
    if (!f) throw new Error(`harness: bodiesOf returned ${b.id} but state.fish has no entry for it`);
    // Independently pull the position through reckon(), the same function
    // the fold itself called this tick (shoalEngine.ts step 2) — never a
    // display-side reimplementation. If this ever disagreed with what the
    // fold wrote to Fish.x/Fish.y it would mean the two had diverged, which
    // is exactly the class of bug this harness exists to surface.
    const pos = reckon(f.vec, atMs);
    if (pos.x !== b.x || pos.y !== b.y) {
      throw new Error(
        `harness: reckon(${b.id}, ${atMs}) = (${pos.x},${pos.y}) disagrees with the fold's own Fish.x/Fish.y (${b.x},${b.y})`,
      );
    }
    // Both numbers come from the engine's own `shelterOf`, differing only in
    // the population handed to it: people alone, then people and wild fish.
    // The difference IS the wild cover, and it is never a display-side sum.
    const people = shelterOf(b, bodies);
    const shelter = shelterOf(b, shelterPop);
    const exposed = isExposed(b, shelterPop);
    console.log(
      `${padEnd(b.id, 6)} ${pad(String(pos.x), 6)} ${pad(String(pos.y), 6)} ` +
      `${pad(String(b.size), 5)} ${pad(String(people), 6)} ${pad(String(shelter - people), 4)} ` +
      `${pad(String(shelter), 7)} ${exposed ? 'yes' : 'no'}`,
    );
  }
  if (state.departed.size > 0) {
    console.log(`departed: ${[...state.departed.keys()].sort().join(', ')}`);
  }
}

// =============================================================================
// Drive the scenario. Every poll hands over the WHOLE log (as the real bridge
// does — shoalRoom.ts's module header) and advances by a seed-chosen number
// of ticks, then reassigns `loop` to the value `advance` returned — the old
// LoopState is never touched again, per shoalLoop.ts section 5's calling
// convention.
// =============================================================================

const MAX_STEP_TICKS = 8; // up to 2s per poll

function runScenario(seed: number, wildSeed: number): void {
  const log = buildLog();
  const rand = mulberry32(seed);

  console.log(`[harness] seed=${seed} wild-seed=${wildSeed} epoch=${EPOCH} offset=${OFFSET} toMs=${TO_MS} entries=${log.length}`);

  let loop: LoopState = createLoop(EPOCH, null);
  printSnapshot(loop, 'start (cold, warm-up folded)', wildSeed);
  const coldMs = loop.state.nowMs;

  // Nothing in the log has an ms before OFFSET, so every tick between the
  // cold start and OFFSET folds an empty sea (still folded correctly, tick by
  // tick, inside `advance` — just not worth a snapshot each). One big jump,
  // one snapshot, landing one tick before richSession()'s arc begins so the
  // very next (seed-driven) poll is the one where everyone shows up.
  const ARRIVAL_MS = OFFSET - TICK_MS;
  {
    const { loop: next } = advance(loop, log, ARRIVAL_MS);
    loop = next;
    printSnapshot(loop, `fast-forward (empty sea, ${((ARRIVAL_MS - coldMs) / 1000).toFixed(1)}s of warm epoch)`, wildSeed);
  }

  let cursorMs = loop.state.nowMs;
  let poll = 0;
  while (cursorMs < TO_MS) {
    poll++;
    const stepTicks = 1 + Math.floor(rand() * MAX_STEP_TICKS);
    cursorMs = Math.min(cursorMs + stepTicks * TICK_MS, TO_MS);
    const { loop: next, rolled } = advance(loop, log, cursorMs);
    loop = next;
    printSnapshot(loop, `poll ${poll} (+${stepTicks} tick${stepTicks === 1 ? '' : 's'})`, wildSeed);
    if (rolled !== null) {
      console.log(`   >>> EPOCH ROLLOVER: now folding epoch ${loop.epoch}. checkpoint = ${serialiseCheckpoint(rolled)}`);
    }
  }

  console.log('');
  console.log(
    `[harness] done. polls=${poll} replays=${loop.replays} final-epoch=${loop.epoch} ` +
    `final-tension=${loop.state.tension} last-sweep=${loop.state.lastSweepMs} ` +
    `last-taken=[${loop.state.lastTaken.join(', ')}]`,
  );
}

// =============================================================================
// --throw-demo: deliberately reproduce "foldShoal throws a RangeError at
// every epoch end" (shoalLoop.ts's own header, open item 8) by calling the
// low-level engine directly, bypassing `advance`'s rollover entirely. This is
// NOT how a caller should ever drive the fold — `advance` exists precisely so
// nobody has to — which is the point: it proves the unrolled path still
// throws, and that this harness's exit code reflects it.
// =============================================================================

function runThrowDemo(): void {
  const log = buildLog();
  console.log('[throw-demo] calling foldShoal() directly past an epoch boundary, with no rollover — this must throw.');
  console.log(`[throw-demo] foldShoal(log, ${TO_MS}, { epoch: ${EPOCH} })  //  TO_MS is ${TO_MS - BOUNDARY}ms past epoch ${EPOCH}'s boundary`);
  let threw: unknown = null;
  try {
    foldShoal(log, TO_MS, { epoch: EPOCH });
  } catch (err) {
    threw = err;
  }
  if (threw === null) {
    throw new Error('[throw-demo] expected foldShoal to throw a RangeError past an unrolled epoch boundary, but it returned normally');
  }
  console.log(`[throw-demo] threw as expected: ${threw instanceof Error ? `${threw.name}: ${threw.message}` : String(threw)}`);
  // Rethrow so the SAME exit path a genuine, unexpected fold failure would
  // take is the one that fires here too — this demo does not special-case
  // its own exit code, it exercises the general one.
  throw threw;
}

// =============================================================================
// main
// =============================================================================

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.throwDemo) {
    runThrowDemo();
    return;
  }
  runScenario(args.seed, args.wildSeed);
}

try {
  main();
  process.exitCode = 0;
} catch (err) {
  console.error(`[harness] FATAL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 1;
}
