/**
 * Two seas to look at, both folded by the real engine.
 *
 * DISPLAY SIDE — floats, a wall clock and a PRNG, none of which `src/lib/`
 * may touch. What this module is NOT is a source of world state: it writes
 * swim vectors into a log and hands that log to `advance` (shoalLoop.ts),
 * exactly as the node bridge will in Task 5. Every position, size, tension
 * value and sweep on screen is computed by `foldTick`, not by anything here.
 * If this file lied about the world, `render.test.ts`'s agreement section
 * would not be checking anything.
 *
 * WHY THERE ARE TWO:
 *
 *  - `harnessSea()` replays the EXACT scenario `npm run harness` prints —
 *    same epoch, same offset, same twelve swimmers, same extra entries — in
 *    real time. Its whole point is that you can put the window next to the
 *    harness's text output and check them against each other: the sheltered
 *    cluster at shelter 306, the eight outsiders, tension climbing, the hush,
 *    and the sweep taking o0/o1/o2 at t=147596000. It is not a pretty sea
 *    (its twelve fish are motionless and four of them are stacked on one
 *    point) and it is not supposed to be — it is the proof.
 *
 *  - `livelySea()` is a sea worth looking at: sixteen swimmers with real swim
 *    vectors, milling in a loose school with a few out in open water, and a
 *    genuine spread of sizes. The spread comes from SEEDING THE FOLD WITH A
 *    CHECKPOINT — `createLoop(epoch, checkpoint)` — which is the same path a
 *    client joining an hour-old sea takes (spec 3.9 point 5). Nothing is
 *    faked: those sizes are adopted by `foldShoal` at the epoch origin and
 *    then decay under hunger like everyone else's.
 *
 * Both are temporary in the same way: Task 5 replaces the scripted writers
 * with the player's own input, and Task 7 replaces them with a second real
 * client. The seam is deliberately narrow — a `Sea` hands back a `ShoalState`
 * and nothing else.
 */
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { epochEndMs, epochOf, epochStartMs } from '../lib/epoch';
import { reckon } from '../lib/fixed';
import { richSession } from '../lib/shoalFixtures';
import { HEADING_STEPS, SPEED_CRUISE, SPEED_DART, TICK_MS, WORLD_H, WORLD_W } from '../lib/shoalConst';
import type { Checkpoint, LogEntry, ShoalState } from '../lib/shoalTypes';

/**
 * A sea the shell can draw. `step` is called once per frame with the wall
 * clock; everything else is internal.
 */
export interface Sea {
  /** Which swimmer the camera follows. */
  readonly selfId: string;
  /** Fold forward and return the world at this wall-clock instant. */
  step(wallMs: number): ShoalState;
  /** The sea's own clock at this wall-clock instant. Draw at THIS time. */
  seaMs(wallMs: number): number;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A direction in radians, as the engine's brads. */
function toBrads(rad: number): number {
  const b = Math.round((rad / (Math.PI * 2)) * HEADING_STEPS);
  return ((b % HEADING_STEPS) + HEADING_STEPS) % HEADING_STEPS;
}

// ---------------------------------------------------------------------------
// 1. The harness's own scenario, replayed in real time
// ---------------------------------------------------------------------------

const H_EPOCH = 40;
const H_BOUNDARY = epochEndMs(H_EPOCH); // 147_600_000
const H_OFFSET = H_BOUNDARY - 30_000; // richSession()'s ms = 0 lands here
const H_START = H_OFFSET - 250; // the harness's "fast-forward" tick
const H_END = H_BOUNDARY + 3_000; // the harness's TO_MS

/** The harness's log, entry for entry. Lifted from scripts/harness.ts. */
function harnessLog(): LogEntry[] {
  const out: LogEntry[] = richSession().map((e) => (e.kind === 'presence'
    ? { ...e, ms: e.ms + H_OFFSET, vec: { ...e.vec, t: e.vec.t + H_OFFSET } }
    : { ...e, ms: e.ms + H_OFFSET }));
  out.push({ kind: 'eat', id: 'e0', cell: 367, ms: H_OFFSET + 25_000, hash: 'e0e2' });
  const goneMs = H_BOUNDARY - 400_000;
  out.push({
    kind: 'presence', id: 'gone', ms: goneMs, hash: 'g0',
    vec: { x: 576, y: 448, heading: 0, speed: 0, t: goneMs },
  });
  out.push({ kind: 'eat', id: 'gone', cell: 100, ms: goneMs, hash: 'ge0' });
  return out;
}

/**
 * The harness scenario, played at 1x from its own start and then held at its
 * end so the post-sweep world stays on screen to be read.
 */
export function harnessSea(wallStartMs: number): Sea {
  const log = harnessLog();
  let loop: LoopState = createLoop(H_EPOCH, null);
  const seaMs = (wallMs: number) => Math.min(H_START + (wallMs - wallStartMs), H_END);
  return {
    selfId: 'e0',
    seaMs,
    step(wallMs: number): ShoalState {
      const t = seaMs(wallMs);
      loop = advance(loop, log, t).loop;
      return loop.state;
    },
  };
}

// ---------------------------------------------------------------------------
// 2. A sea worth looking at
// ---------------------------------------------------------------------------

/**
 * The seeded sizes. A believable veteran spread: a couple of newcomers near
 * MIN_SIZE, a broad middle, and three fish who have been eating for a while.
 * The top of the range is ~4x the bottom, which `bodyRadiusCu` renders as a
 * 3x difference in radius — unmistakable at a glance, which is the whole
 * claim spec 2.8 makes about size.
 */
const SEED_SIZES: Array<[string, number]> = [
  ['you', 118],
  ['a', 64], ['b', 71], ['c', 88], ['d', 96], ['e', 104], ['f', 119],
  ['g', 133], ['h', 152], ['i', 171], ['j', 196], ['k', 224],
  ['l', 258], ['m', 296], ['n', 341], ['o', 392],
];

interface Brain {
  id: string;
  /** Angle around the school's centre, and how far out. */
  orbit: number;
  radius: number;
  orbitRate: number;
  /** Fish who forage in open water instead of milling in the crowd. */
  loner: boolean;
  lonerSeed: number;
  nextEmitMs: number;
  /** Where this swimmer starts, before it has ever written a vector. */
  x: number;
  y: number;
}

/** Where the school is drifting, at a given sea time. */
function schoolCentre(ms: number): { x: number; y: number } {
  return {
    x: WORLD_W / 2 + Math.sin(ms / 41_000) * 780 + Math.sin(ms / 17_000) * 160,
    y: WORLD_H / 2 + Math.sin(ms / 59_000) * 520 + Math.cos(ms / 23_000) * 120,
  };
}

/**
 * A lively sea anchored at the real clock.
 *
 * Every swimmer writes a new vector every 3-8 s — the cadence spec 3.3 states
 * — and nothing writes between those, which is exactly the condition
 * `reckonSmooth` exists to cover: for seconds at a stretch the only thing
 * moving a fish on screen is dead reckoning from a message that arrived a
 * while ago.
 */
export function livelySea(wallStartMs: number): Sea {
  const epoch = epochOf(wallStartMs);
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [...SEED_SIZES].sort((p, q) => (p[0] < q[0] ? -1 : 1)), recent: [] };
  let loop: LoopState = createLoop(epoch, seed);
  const log: LogEntry[] = [];
  const rand = mulberry32(0x5ea01);
  let serial = 0;

  const centre0 = schoolCentre(wallStartMs);
  const brains: Brain[] = SEED_SIZES.map(([id], i) => {
    const loner = i % 6 === 4; // three of sixteen out in open water
    const orbit = (i / SEED_SIZES.length) * Math.PI * 2 + rand() * 0.9;
    const radius = loner ? 1000 + rand() * 750 : 210 + rand() * 560;
    return {
      id,
      orbit,
      radius,
      orbitRate: (rand() < 0.5 ? -1 : 1) * (0.06 + rand() * 0.09),
      loner,
      lonerSeed: rand() * 1000,
      // Staggered so the sea does not all write on the same tick.
      nextEmitMs: wallStartMs + Math.floor(rand() * 1500),
      x: Math.max(60, Math.min(WORLD_W - 60, centre0.x + Math.cos(orbit) * radius)),
      y: Math.max(60, Math.min(WORLD_H - 60, centre0.y + Math.sin(orbit) * radius)),
    };
  });

  /** Where this swimmer is trying to get to, right now. */
  function targetOf(b: Brain, ms: number): { x: number; y: number } {
    const c = schoolCentre(ms);
    if (b.loner) {
      // Loners wander the open sea on their own slow circuit — the fish who
      // are out where the food is and nowhere near the crowd.
      return {
        x: WORLD_W / 2 + Math.sin(ms / 31_000 + b.lonerSeed) * 1700,
        y: WORLD_H / 2 + Math.cos(ms / 27_000 + b.lonerSeed * 1.3) * 1150,
      };
    }
    const a = b.orbit + (ms / 1000) * b.orbitRate;
    return { x: c.x + Math.cos(a) * b.radius, y: c.y + Math.sin(a) * b.radius };
  }

  function emitDue(ms: number): void {
    for (const b of brains) {
      if (ms < b.nextEmitMs) continue;
      const f = loop.state.fish.get(b.id);
      // Author FROM where the fold says this swimmer is at `ms` — through
      // `reckon`, never a guess — so a new vector never teleports anyone.
      const from = f ? reckon(f.vec, ms) : { x: Math.round(b.x), y: Math.round(b.y) };
      const t = targetOf(b, ms);
      const dx = t.x - from.x;
      const dy = t.y - from.y;
      const heading = toBrads(Math.atan2(dy, dx));
      const dist = Math.hypot(dx, dy);
      // A short burst now and then. Spec 2.4's dart is the player's escape,
      // not a cruise mode, so it is rare here too.
      const dart = !b.loner && rand() < 0.08;
      const speed = dist < 90 ? 0 : dart ? SPEED_DART : SPEED_CRUISE;
      const at = ms + TICK_MS; // strictly ahead of the last folded tick
      log.push({
        kind: 'presence',
        id: b.id,
        ms: at,
        hash: `d${b.id}-${serial++}`,
        vec: { x: from.x, y: from.y, heading, speed, t: at },
      });
      b.nextEmitMs = ms + (dart ? 900 : 3000 + Math.floor(rand() * 5000));
    }
  }

  return {
    selfId: 'you',
    seaMs: (wallMs: number) => wallMs,
    step(wallMs: number): ShoalState {
      emitDue(wallMs);
      loop = advance(loop, log, wallMs).loop;
      // The log is append-only and this demo can run for hours; drop what the
      // fold provably cannot see any more, on the same rule shoalLoop.ts's
      // admit floor uses. (Cosmetic here — it only keeps memory flat.)
      if (log.length > 4000) {
        const floor = epochStartMs(loop.epoch) - 200_000;
        for (let i = log.length - 1; i >= 0; i--) if (log[i].ms < floor) log.splice(i, 1);
      }
      return loop.state;
    },
  };
}
