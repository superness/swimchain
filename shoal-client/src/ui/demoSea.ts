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
 * WHAT REPLACED THEM, corrected — the earlier wording ("Task 5 replaces the
 * scripted writers with the player's own input, and Task 7 replaces them with
 * a second real client") is no longer true, and reading it as a plan for the
 * future would be reading it backwards. Both tasks have landed and NEITHER
 * replaced these seas:
 *
 *  - Task 5 added the player's own fish to `livelySea` alongside the scripted
 *    sixteen. `publish` below is the seam it uses, and the scripted writers
 *    are still there — they are what makes the sea a shoal.
 *  - Task 7 added a THIRD sea, `chainSea.ts`, backed by a real room on a real
 *    node. It is selected only by the `?rpc=` dev parameters and is gated on
 *    `import.meta.env.DEV`, so it is not what a shipped build shows. These two
 *    are still the only seas a player can reach.
 *
 * So this file is not scaffolding awaiting demolition; it is the offline sea,
 * and it stays until there is a mainnet room to point at (open item 7). The
 * seam is deliberately narrow — a `Sea` hands back a `ShoalState` and nothing
 * else — which is exactly why `chainSea` could be added beside it rather than
 * in place of it.
 */
import { advance, createLoop, type LoopState } from '../lib/shoalLoop';
import { epochEndMs, epochOf, epochStartMs } from '../lib/epoch';
import { reckon } from '../lib/fixed';
import { richSession } from '../lib/shoalFixtures';
import { HEADING_STEPS, SPEED_CRUISE, SPEED_DART, TICK_MS, WORLD_H, WORLD_W } from '../lib/shoalConst';
import type { Checkpoint, LogEntry, ShoalState, Vec } from '../lib/shoalTypes';

/**
 * A sea the shell can draw. `step` is called once per frame with the wall
 * clock; everything else is internal.
 *
 * `publish`/`publishEat` are THE WRITE SEAM (Task 5). `App.tsx` never calls
 * them directly — `emitDue` (input.ts) does, once `shouldEmit` has agreed —
 * and the whole substitution needed to put a real room behind them is stated
 * on `livelySea`'s own implementation below.
 */
export interface Sea {
  /** Which swimmer the camera follows. */
  readonly selfId: string;
  /** Where the player's swimmer starts, before it has published anything. */
  readonly spawn: { readonly x: number; readonly y: number };
  /** Fold forward and return the world at this wall-clock instant. */
  step(wallMs: number): ShoalState;
  /** The sea's own clock at this wall-clock instant. Draw at THIS time. */
  seaMs(wallMs: number): number;
  /** Publish this client's swim vector, with any word riding along on it. */
  publish(vec: Vec, say?: string): void;
  /** Publish an eat claim on `cell`, at the instant `ms`. */
  publishEat(cell: number, ms: number): void;
  /** Words spoken recently enough to still be over someone's head. */
  speechAt(atMs: number): Map<string, string>;
}

/** How long a word stays over a swimmer's head. Display-side, arbitrary. */
export const SPEECH_MS = 7_000;

/**
 * Words currently over swimmers' heads, read straight out of the log the fold
 * is walking — so this works identically for a scripted sea and for a real
 * room, and there is no second place speech could live and disagree.
 */
export function speechFrom(log: readonly LogEntry[], atMs: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of log) {
    if (e.kind !== 'presence' || e.say === undefined) continue;
    if (e.ms > atMs || atMs - e.ms > SPEECH_MS) continue;
    out.set(e.id, e.say); // later entries win; the log is scanned in order
  }
  return out;
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
 *
 * `fromMs` skips that many ms INTO the scenario before the clock starts
 * running at 1x. It is a developer affordance and nothing else — the whole
 * log is still folded tick by tick by the real engine, so the world at
 * `fromMs` is bit-identical to the world a viewer who sat and watched for
 * `fromMs` would have reached. It exists because the two moments worth
 * looking at arrive 18.25 s and 26.25 s in, and the second of them lasts two
 * seconds; capturing those repeatably is not something a screenshot should
 * have to gamble on. See App.tsx's `?at=` note.
 */
export function harnessSea(wallStartMs: number, fromMs: number = 0, selfId: string = 'e0'): Sea {
  const log = harnessLog();
  let loop: LoopState = createLoop(H_EPOCH, null);
  const seaMs = (wallMs: number) => Math.min(H_START + fromMs + (wallMs - wallStartMs), H_END);
  return {
    // Which of the fixture's twelve swimmers the camera follows. `e0` is the
    // one in the sheltered cluster; passing an outsider (`o0`) is how the
    // hush is looked at from the point of view of a swimmer the sweep is
    // about to take, which is the whole subject of spec 2.10 and cannot be
    // reached any other way in a scripted log. See App.tsx's `?me=`.
    selfId,
    // e0 is a FIXTURE swimmer, so this is where the harness puts it (the
    // centre of bloom cell 367) rather than a spawn the player owns. It is
    // read only before this client's first publish, and `publish` here is
    // inert, so it stays e0's spot even when `selfId` names another fixture
    // swimmer — nothing downstream can act on it.
    spawn: { x: 1984, y: 1472 },
    seaMs,
    step(wallMs: number): ShoalState {
      const t = seaMs(wallMs);
      loop = advance(loop, log, t).loop;
      return loop.state;
    },
    // DELIBERATELY INERT. This sea is the PROOF — it replays the harness's
    // exact log so the window can be checked against `npm run harness`'s
    // printed table — and a player writing into it would no longer be
    // replaying that log. Its clock also stops at H_END, so a write after
    // that would author a duplicate instant. Play in the lively sea (key 1).
    publish() { /* the proof sea is not a playground */ },
    publishEat() { /* as above */ },
    speechAt: (atMs: number) => speechFrom(log, atMs),
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
  // `you` is not scripted any more — Task 5 hands it to the player's own
  // input, so the loop below skips it and the only thing that ever writes a
  // vector for it is `publish`.
  const brains: Brain[] = SEED_SIZES.filter(([id]) => id !== 'you').map(([id], i) => {
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

  // The player starts just inside the school, close enough to be sheltered on
  // the first frame and to have somewhere to swim away from.
  const spawn = {
    x: Math.round(Math.max(60, Math.min(WORLD_W - 60, centre0.x + 260))),
    y: Math.round(Math.max(60, Math.min(WORLD_H - 60, centre0.y - 180))),
  };

  return {
    selfId: 'you',
    spawn,
    seaMs: (wallMs: number) => wallMs,
    /**
     * THE WRITE SEAM. `emitDue` (input.ts) calls this only after `shouldEmit`
     * has agreed, at most once per frame — never the render loop directly.
     *
     * Here it appends to the log this sea's own fold walks, which is exactly
     * what a local write does before gossip carries it anywhere: the node's
     * `get_replies` merges the mempool in, so a client sees its own write back
     * immediately and folds it the same way every other client eventually
     * will.
     *
     * THE REAL VERSION EXISTS AND IS NOT A SUBSTITUTION FOR THIS ONE. This
     * comment used to say the chain writer was one line away and "not made
     * HERE because nothing in this plan establishes a room to write into".
     * Task 7 established one: `chainSea.ts` is a third `Sea` with
     * `publish: (vec, say) => void sendPresence(ctx, vec, say)` behind an
     * optimistic pending log, selected by the `?rpc=` dev parameters. It sits
     * BESIDE this sea rather than replacing it — a player with no room to
     * join still needs a sea to be in — so this local-append `publish` is the
     * offline one on purpose, not a placeholder.
     *
     * `vec.t` is already `wall + TICK_MS` (App.tsx's authoring clock), which
     * is what keeps the entry strictly ahead of the last folded tick and off
     * `advance`'s bounded-replay path.
     */
    publish(vec: Vec, say?: string): void {
      log.push({ kind: 'presence', id: 'you', ms: vec.t, hash: `you-${serial++}`, vec, ...(say !== undefined ? { say } : {}) });
    },
    publishEat(cell: number, ms: number): void {
      log.push({ kind: 'eat', id: 'you', cell, ms, hash: `youe-${serial++}` });
    },
    speechAt: (atMs: number) => speechFrom(log, atMs),
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
