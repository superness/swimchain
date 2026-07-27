# The Shoal — Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, deterministic rule engine for The Shoal — the fold that turns an ordered action log into world state (shelter, tension, sweeps, blooms, hunger, size) with byte-identical results on every client.

**Architecture:** A standalone TypeScript library in `shoal-client/src/lib/`, with no UI, no network, and no I/O. Every function is pure and integer-only. State is produced by folding an ordered log of presence vectors and eat-claims through a fixed 250 ms tick. Later plans (shell, sea, waters) consume this library and never reimplement its rules.

**Tech Stack:** TypeScript 5.3, `tsx` for tests (plain assertion scripts, no test framework — matching `chips-client/` and `trench-client/`), Vite for the eventual bundle.

## Global Constraints

- **Integer math only. No floating point anywhere in the engine.** Divergence between clients is a release blocker. Trigonometry uses a precomputed integer table; distances are compared as squared integers; all division is `Math.trunc`-style integer division. A single `Math.cos` call in this library is a bug.
- **No wall-clock reads.** No `Date.now()`, no `new Date()`, no `Math.random()` inside `src/lib/`. Time enters only as an explicit `nowMs` parameter. (Test files may not use them either.)
- **Consensus constants are permanent.** Everything in the `CONSENSUS` block of `shoalConst.ts` re-scores all history if changed. Per `docs/superpowers/specs/2026-07-27-the-shoal-design.md` §4 and the `project_fold_rules_are_permanent` design law. Constants that are arbitrary-but-practical must say so in a comment so nobody later mistakes them for optimised values.
- **Tests compute expected values independently of the code under test** — hand arithmetic written out in a comment, or a from-scratch loop. Never assert by re-invoking the function under test with different arguments and comparing its outputs to each other; a fold that shares a bug with its own test still passes. This matches the header contract in `trench-client/ui/src/lib/trenchEngine.test.ts`.
- **Every load-bearing test must be mutation-verified.** After a test passes, deliberately break the implementation in the exact way the test names, confirm the test FAILS, then revert. This repo has shipped vacuous tests repeatedly. Task 8 sweeps for this, but each task performs its own inline check where marked.
- **No player-facing copy in this library.** The diegetic rule (spec §1.1) bans the words node, chain, space, post, reply, and Swimchain from anything a player sees. This library produces no strings for players at all; keep it that way.
- Node >= 18. Package is `private: true`, `"type": "module"`, named `@swimchain/shoal-client`.

---

## File Structure

All paths relative to repo root.

| File | Responsibility |
|---|---|
| `shoal-client/package.json` | Package manifest; `test` script chains every `tsx` test |
| `shoal-client/tsconfig.json` | Strict TS config, matching `chips-client/` |
| `shoal-client/src/lib/shoalConst.ts` | Every constant, split into `CONSENSUS` and `POLICY` sections |
| `shoal-client/src/lib/shoalTypes.ts` | Shared types: `Vec`, `Presence`, `EatClaim`, `LogEntry`, `Fish`, `ShoalState` |
| `shoal-client/src/lib/fixed.ts` | Integer trig table, dead reckoning, squared distance, integer median |
| `shoal-client/src/lib/shelter.ts` | Size-weighted shelter score and the exposed predicate |
| `shoal-client/src/lib/tension.ts` | Median-anchored tension accumulation and the top contributor |
| `shoal-client/src/lib/sweep.ts` | Hush state machine, input lock, target selection |
| `shoal-client/src/lib/bloom.ts` | Fallow grid, bloom presence, bite accounting |
| `shoal-client/src/lib/shoalEngine.ts` | The fold: ordered log → `ShoalState` |

Test files sit alongside their module with a `.test.ts` suffix, per repo convention.

---

### Task 1: Package scaffold and constants

**Files:**
- Create: `shoal-client/package.json`
- Create: `shoal-client/tsconfig.json`
- Create: `shoal-client/src/lib/shoalTypes.ts`
- Create: `shoal-client/src/lib/shoalConst.ts`
- Test: `shoal-client/src/lib/shoalConst.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all constants listed below, and the types `Vec`, `Presence`, `EatClaim`, `LogEntry`, `Fish`, `ShoalState`. Every later task imports from these two files.

- [ ] **Step 1: Create the package manifest**

Create `shoal-client/package.json`:

```json
{
  "name": "@swimchain/shoal-client",
  "version": "0.1.0",
  "description": "The Shoal — a sea you share with strangers, where safety is the crowd.",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "tsx src/lib/shoalConst.test.ts && tsx src/lib/fixed.test.ts && tsx src/lib/shelter.test.ts && tsx src/lib/tension.test.ts && tsx src/lib/sweep.test.ts && tsx src/lib/bloom.test.ts && tsx src/lib/shoalEngine.test.ts && tsx src/lib/shoalEngine.determinism.test.ts"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.23.1",
    "typescript": "^5.3.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

Note the `test` script already lists all eight test files. Tasks 2–8 create them in order; running `npm test` before Task 8 will fail on the first not-yet-created file, which is expected and correct.

- [ ] **Step 2: Create the TypeScript config**

Create `shoal-client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the types**

Create `shoal-client/src/lib/shoalTypes.ts`:

```ts
/**
 * Shared types for the Shoal engine. Every coordinate is an integer in
 * centi-units (cu). Every time is integer milliseconds. There are no floats
 * anywhere in this engine — see the Global Constraints in the plan.
 */

/** A swim vector: "from here, at this instant, I am heading that way." */
export interface Vec {
  /** Position at time `t`, in cu. */
  x: number;
  y: number;
  /** Heading in brads: 0..255 maps to 0..2pi. */
  heading: number;
  /** Speed in cu per second. */
  speed: number;
  /** Authoring time in ms. */
  t: number;
}

/** A presence write: one swimmer's latest vector, plus optional speech. */
export interface Presence {
  kind: 'presence';
  /** Stable swimmer id (public key hex). */
  id: string;
  vec: Vec;
  /** Speech rides along in the same message so talking never costs a life. */
  say?: string;
  /** Authoring time in ms — mirrors vec.t, used for log ordering. */
  ms: number;
  /** Content hash, used only as a deterministic ordering tiebreak. */
  hash: string;
}

/** A durable claim that a swimmer took a bite at a place and time. */
export interface EatClaim {
  kind: 'eat';
  id: string;
  /** Bloom cell index the bite was taken from. */
  cell: number;
  /** Claimed position of the bite, in cu. */
  x: number;
  y: number;
  ms: number;
  hash: string;
}

export type LogEntry = Presence | EatClaim;

/** A swimmer's folded state at a given tick. */
export interface Fish {
  id: string;
  /** Dead-reckoned position at the current tick, in cu. */
  x: number;
  y: number;
  size: number;
  /** Last vector seen for this swimmer. */
  vec: Vec;
  /** Tick at which this swimmer's presence expires. */
  expiresMs: number;
  /** Ms at which the last scatter landed, or -1. */
  lastScatterMs: number;
  /** Ms of the last credited bite, or -1. */
  lastBiteMs: number;
}

/** The folded world at a given tick. */
export interface ShoalState {
  /** Tick time in ms. */
  nowMs: number;
  /** Live swimmers, keyed by id. Insertion order is never relied upon. */
  fish: Map<string, Fish>;
  /** Accumulated tension, integer, floored at 0. */
  tension: number;
  /** Ms at which the current hush began, or -1 if no hush is running. */
  hushStartMs: number;
  /** Positions locked at the input lock, or null if not yet locked. */
  lockedPositions: Map<string, { x: number; y: number; size: number }> | null;
  /** Ids taken by the most recent resolved sweep. */
  lastTaken: string[];
  /** Ms of the most recent resolved sweep, or -1. */
  lastSweepMs: number;
  /** Per-cell ms of last visit by any fish. Absent means never visited. */
  lastVisit: Map<number, number>;
  /** Per-cell bites already consumed from the current bloom. */
  bitesTaken: Map<number, number>;
  /** Ms at which each cell's current bloom was first ready, for bite reset. */
  bloomSinceMs: Map<number, number>;
}
```

- [ ] **Step 4: Create the constants**

Create `shoal-client/src/lib/shoalConst.ts`:

```ts
/**
 * Constants for the Shoal engine.
 *
 * The CONSENSUS block is PERMANENT. Changing any value in it re-scores every
 * session ever played and splits clients running different versions — see
 * docs/superpowers/specs/2026-07-27-the-shoal-design.md section 4.
 *
 * The POLICY block is free to change at any time, with no coordination.
 *
 * Values marked "arbitrary-but-practical" were chosen for feel and have never
 * been played. They are not optimised numbers and should not be treated as if
 * a later tuning pass is available — for CONSENSUS values, it is not.
 */

// ---------------------------------------------------------------------------
// CONSENSUS — permanent. Do not change after launch.
// ---------------------------------------------------------------------------

/** World bounds in centi-units. Arbitrary-but-practical. */
export const WORLD_W = 4096;
export const WORLD_H = 3072;

/** Positions are quantized to this grid before any comparison. */
export const QUANT = 8;

/** Heading resolution: 256 brads to the full turn. */
export const HEADING_STEPS = 256;
/** Fixed-point scale for the integer trig table. */
export const TRIG_SCALE = 4096;

/** Fold tick. All state advances in steps of this size. */
export const TICK_MS = 250;

/** A presence vector is live for this long after it was authored. */
export const PRESENCE_TTL_MS = 90_000;

// --- Shelter ---------------------------------------------------------------
/** Neighbours within this radius shelter you. */
export const SHELTER_R = 340;
export const SHELTER_R2 = SHELTER_R * SHELTER_R; // 115_600
/** Shelter contributed by any fish, regardless of size. */
export const SHELTER_BASE = 100;
/** Each SHELTER_SIZE_DIV of size adds 1 more shelter... */
export const SHELTER_SIZE_DIV = 40;
/** ...up to this cap, so one whale cannot shelter the whole sea. */
export const SHELTER_SIZE_CAP = 120;
/**
 * Below this shelter score a fish is exposed. Equal to 3 * SHELTER_BASE:
 * three plain neighbours is exactly enough, a pair is not. This is the
 * "floor of three" from spec 2.11 — it prices buddy-pairing deliberately.
 */
export const SHELTER_THRESHOLD = 3 * SHELTER_BASE; // 300

// --- Tension ---------------------------------------------------------------
/** Fish farther than this from the median position count as outside the core. */
export const CORE_R = 620;
export const CORE_R2 = CORE_R * CORE_R; // 384_400
/** Per-mille of fish outside the core at which tension holds steady. */
export const TENSION_NEUTRAL = 250;
/** Tension at which the hush fires. Arbitrary-but-practical. */
export const TENSION_TRIGGER = 30_000;

// --- The hush --------------------------------------------------------------
/** Total hush duration: commit window, then dread. */
export const HUSH_MS = 8_000;
/** Inputs after this point in the hush do not count. */
export const LOCK_MS = 4_000;
/** The sweep takes at most this many fish. It may take none. */
export const MAX_TAKE = 3;

// --- Blooms ----------------------------------------------------------------
/** Bloom grid cell size in cu. WORLD_W/BLOOM_CELL and WORLD_H/BLOOM_CELL must be integers. */
export const BLOOM_CELL = 128;
export const BLOOM_COLS = WORLD_W / BLOOM_CELL; // 32
export const BLOOM_ROWS = WORLD_H / BLOOM_CELL; // 24
/** A fish within this radius of a cell centre marks it visited. */
export const BLOOM_VISIT_R = 200;
export const BLOOM_VISIT_R2 = BLOOM_VISIT_R * BLOOM_VISIT_R; // 40_000
/** A cell unvisited for this long carries a bloom. Arbitrary-but-practical. */
export const BLOOM_READY_MS = 45_000;
/**
 * How far back the bloom map looks. Must stay below PRESENCE_TTL_MS so a
 * client joining mid-session can reconstruct it from data that is still live.
 */
export const BLOOM_WINDOW_MS = 60_000;
/** Bites a single bloom yields before it is gone. Blooms are rivalrous. */
export const BLOOM_BITES = 6;
/** A bite must be claimed within this radius of the cell centre. */
export const EAT_R = 90;
export const EAT_R2 = EAT_R * EAT_R; // 8_100
/** Minimum gap between one swimmer's credited bites. */
export const EAT_COOLDOWN_MS = 2_500;

// --- Size ------------------------------------------------------------------
export const START_SIZE = 100;
export const MIN_SIZE = 60;
/** Size gained per credited bite. */
export const BITE_GROWTH = 12;
/**
 * Size lost to a scatter. FIXED, not a percentage — so big fish risk
 * proportionally less and are pulled out of the ball rather than parked in it.
 */
export const SCATTER_COST = 30;
/** Hunger ticks once every this many fold ticks (once per second at 250ms). */
export const HUNGER_TICK_INTERVAL = 4;
/** Size lost per hunger tick, while present and not eating. */
export const HUNGER_AMOUNT = 1;
/** Bites credited within this window before a sweep are voided for the taken. */
export const VOID_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------
// POLICY — free to change at any time.
// ---------------------------------------------------------------------------

/** Cruise and dart speeds in cu per second. */
export const SPEED_CRUISE = 60;
export const SPEED_DART = 220;
/** Dart burst duration and cooldown. */
export const DART_MS = 900;
export const DART_COOLDOWN_MS = 11_000;
```

- [ ] **Step 5: Write the constant coherence test**

Create `shoal-client/src/lib/shoalConst.test.ts`:

```ts
/**
 * Coherence of the Shoal constants. Run: npx tsx src/lib/shoalConst.test.ts
 * These are relationships the engine depends on, not arbitrary preferences.
 */
import {
  WORLD_W, WORLD_H, BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS,
  SHELTER_BASE, SHELTER_THRESHOLD, SHELTER_SIZE_CAP,
  BLOOM_WINDOW_MS, BLOOM_READY_MS, PRESENCE_TTL_MS,
  HUSH_MS, LOCK_MS, TICK_MS, HUNGER_TICK_INTERVAL,
  START_SIZE, MIN_SIZE, SCATTER_COST, BITE_GROWTH, BLOOM_BITES,
  TENSION_NEUTRAL, TENSION_TRIGGER, MAX_TAKE, QUANT, SHELTER_R, CORE_R,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// The bloom grid must tile the world exactly, or cell indices run off the map.
check('bloom grid tiles world horizontally', WORLD_W % BLOOM_CELL === 0, { WORLD_W, BLOOM_CELL });
check('bloom grid tiles world vertically', WORLD_H % BLOOM_CELL === 0, { WORLD_H, BLOOM_CELL });
check('BLOOM_COLS derived correctly', BLOOM_COLS === 32, { BLOOM_COLS });
check('BLOOM_ROWS derived correctly', BLOOM_ROWS === 24, { BLOOM_ROWS });

// The floor of three: exactly three plain neighbours must clear the threshold,
// and two must not. This is the rule that prices buddy-pairing.
check('two plain neighbours are exposed', 2 * SHELTER_BASE < SHELTER_THRESHOLD, { two: 2 * SHELTER_BASE, SHELTER_THRESHOLD });
check('three plain neighbours are sheltered', 3 * SHELTER_BASE >= SHELTER_THRESHOLD, { three: 3 * SHELTER_BASE, SHELTER_THRESHOLD });

// One enormous fish must not shelter a lone swimmer by itself, or the ball
// re-forms around a single whale and the pairing price is void.
check('one capped whale cannot shelter alone', SHELTER_BASE + SHELTER_SIZE_CAP < SHELTER_THRESHOLD,
  { whale: SHELTER_BASE + SHELTER_SIZE_CAP, SHELTER_THRESHOLD });

// A client joining mid-session reconstructs the bloom map from live presence,
// so the lookback must fit inside the TTL, and readiness inside the lookback.
check('bloom window fits inside presence TTL', BLOOM_WINDOW_MS < PRESENCE_TTL_MS, { BLOOM_WINDOW_MS, PRESENCE_TTL_MS });
check('bloom readiness fits inside the window', BLOOM_READY_MS < BLOOM_WINDOW_MS, { BLOOM_READY_MS, BLOOM_WINDOW_MS });

// The hush must contain a real commit window and a real dread window.
check('lock falls inside the hush', LOCK_MS > 0 && LOCK_MS < HUSH_MS, { LOCK_MS, HUSH_MS });
check('dread window is at least as long as the commit window', HUSH_MS - LOCK_MS >= LOCK_MS, { HUSH_MS, LOCK_MS });
check('hush boundaries land on tick boundaries', LOCK_MS % TICK_MS === 0 && HUSH_MS % TICK_MS === 0, { TICK_MS });

// Hunger must be survivable: one full bloom must buy more than a scatter costs,
// or foraging is never worth the risk and the loop stalls.
{
  const bloomWorth = BLOOM_BITES * BITE_GROWTH; // 6 * 12 = 72, computed by hand
  check('a full bloom outgrows a scatter', bloomWorth > SCATTER_COST, { bloomWorth, SCATTER_COST });
}

// A scatter must not instantly floor a starting fish, or newcomers bounce.
check('a starting fish survives one scatter', START_SIZE - SCATTER_COST > MIN_SIZE, { START_SIZE, SCATTER_COST, MIN_SIZE });

// Tension must be able to rise at all, and must not be trivially triggered.
check('tension has headroom above neutral', TENSION_TRIGGER > TENSION_NEUTRAL * 10, { TENSION_TRIGGER, TENSION_NEUTRAL });
check('the sweep can take more than one', MAX_TAKE >= 2, { MAX_TAKE });

// Quantization must be finer than every radius it feeds, or comparisons alias.
check('quantization is finer than shelter radius', QUANT * 8 < SHELTER_R, { QUANT, SHELTER_R });
check('quantization is finer than core radius', QUANT * 8 < CORE_R, { QUANT, CORE_R });
check('hunger ticks at most once per second', HUNGER_TICK_INTERVAL * TICK_MS >= 1000, { HUNGER_TICK_INTERVAL, TICK_MS });

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 6: Install and run the test**

```bash
cd shoal-client && npm install && npx tsx src/lib/shoalConst.test.ts
```

Expected: every line prints `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 7: Mutation-verify the floor-of-three check**

Temporarily change `SHELTER_THRESHOLD` in `shoalConst.ts` to `2 * SHELTER_BASE`. Re-run the test.

Expected: `FAIL  two plain neighbours are exposed`. If it still passes, the check is vacuous and must be fixed before continuing.

Revert the change and confirm `ALL PASS` again.

- [ ] **Step 8: Commit**

```bash
git add shoal-client/package.json shoal-client/tsconfig.json shoal-client/src/lib/shoalTypes.ts shoal-client/src/lib/shoalConst.ts shoal-client/src/lib/shoalConst.test.ts
git commit -m "feat(shoal): engine scaffold, types, and consensus constants"
```

---

### Task 2: Integer geometry

**Files:**
- Create: `shoal-client/src/lib/fixed.ts`
- Test: `shoal-client/src/lib/fixed.test.ts`

**Interfaces:**
- Consumes: `shoalConst.ts` (`HEADING_STEPS`, `TRIG_SCALE`, `QUANT`, `WORLD_W`, `WORLD_H`).
- Produces:
  - `COS: readonly number[]` and `SIN: readonly number[]` — length `HEADING_STEPS`, values scaled by `TRIG_SCALE`
  - `quantize(v: number): number`
  - `clampToWorld(x: number, y: number): { x: number; y: number }`
  - `reckon(vec: Vec, atMs: number): { x: number; y: number }`
  - `dist2(ax: number, ay: number, bx: number, by: number): number`
  - `medianInt(values: number[]): number`

- [ ] **Step 1: Write the failing test**

Create `shoal-client/src/lib/fixed.test.ts`:

```ts
/**
 * Integer geometry. Run: npx tsx src/lib/fixed.test.ts
 *
 * Expected values here are derived by hand or from an independent formula,
 * never by calling the function under test twice.
 */
import { COS, SIN, quantize, clampToWorld, reckon, dist2, medianInt } from './fixed';
import { HEADING_STEPS, TRIG_SCALE, QUANT, WORLD_W, WORLD_H } from './shoalConst';
import type { Vec } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// --- The trig table --------------------------------------------------------
check('table has one entry per brad', COS.length === HEADING_STEPS && SIN.length === HEADING_STEPS,
  { cos: COS.length, sin: SIN.length, HEADING_STEPS });

// Cardinal directions, by hand: brad 0 = +x, 64 = +y, 128 = -x, 192 = -y.
check('brad 0 points along +x', COS[0] === TRIG_SCALE && SIN[0] === 0, { c: COS[0], s: SIN[0] });
check('brad 64 points along +y', COS[64] === 0 && SIN[64] === TRIG_SCALE, { c: COS[64], s: SIN[64] });
check('brad 128 points along -x', COS[128] === -TRIG_SCALE && SIN[128] === 0, { c: COS[128], s: SIN[128] });
check('brad 192 points along -y', COS[192] === 0 && SIN[192] === -TRIG_SCALE, { c: COS[192], s: SIN[192] });

// Every entry is an integer within the scale, and the unit-circle identity
// holds to within rounding. Tolerance derived independently: each component
// is rounded by at most 0.5, so c^2+s^2 deviates by at most ~2*TRIG_SCALE.
{
  let allInt = true, identityOk = true;
  for (let i = 0; i < HEADING_STEPS; i++) {
    if (!Number.isInteger(COS[i]) || !Number.isInteger(SIN[i])) allInt = false;
    const mag = COS[i] * COS[i] + SIN[i] * SIN[i];
    if (Math.abs(mag - TRIG_SCALE * TRIG_SCALE) > 2 * TRIG_SCALE) identityOk = false;
  }
  check('every trig entry is an integer', allInt);
  check('unit-circle identity holds within rounding', identityOk);
}

// --- Quantization ----------------------------------------------------------
// QUANT is 8. By hand: 0->0, 7->0, 8->8, 15->8, -1->-8 (floor, not truncate,
// so negatives quantize consistently with positives).
check('quantize floors to the grid', quantize(0) === 0 && quantize(7) === 0 && quantize(8) === 8 && quantize(15) === 8,
  { q0: quantize(0), q7: quantize(7), q8: quantize(8), q15: quantize(15) });
check('quantize floors negatives too', quantize(-1) === -QUANT, { qm1: quantize(-1), QUANT });
check('quantize is idempotent', quantize(quantize(37)) === quantize(37));

// --- World clamping --------------------------------------------------------
check('clamp keeps interior points', clampToWorld(100, 200).x === 100 && clampToWorld(100, 200).y === 200);
check('clamp pins the far edges', clampToWorld(99_999, 99_999).x === WORLD_W && clampToWorld(99_999, 99_999).y === WORLD_H,
  clampToWorld(99_999, 99_999));
check('clamp pins the near edges', clampToWorld(-5, -5).x === 0 && clampToWorld(-5, -5).y === 0, clampToWorld(-5, -5));

// --- Dead reckoning --------------------------------------------------------
// Hand arithmetic: heading 0 (+x), speed 100 cu/s, 2000 ms elapsed.
// dx = 100 * 4096 * 2000 / (4096 * 1000) = 200. dy = 0.
{
  const v: Vec = { x: 500, y: 500, heading: 0, speed: 100, t: 1_000 };
  const p = reckon(v, 3_000);
  check('reckon travels +x at heading 0', p.x === 700 && p.y === 500, p);
}
// Heading 64 (+y), same numbers: dx = 0, dy = 200.
{
  const v: Vec = { x: 500, y: 500, heading: 64, speed: 100, t: 1_000 };
  const p = reckon(v, 3_000);
  check('reckon travels +y at heading 64', p.x === 500 && p.y === 700, p);
}
// A vector never travels backwards in time.
{
  const v: Vec = { x: 500, y: 500, heading: 0, speed: 100, t: 5_000 };
  const p = reckon(v, 1_000);
  check('reckon clamps negative elapsed time to zero', p.x === 500 && p.y === 500, p);
}
// A standing fish does not drift.
{
  const v: Vec = { x: 500, y: 500, heading: 33, speed: 0, t: 0 };
  const p = reckon(v, 60_000);
  check('a stopped fish does not drift', p.x === 500 && p.y === 500, p);
}
// Reckoned positions are always quantized and inside the world.
{
  const v: Vec = { x: 4_000, y: 3_000, heading: 0, speed: 250, t: 0 };
  const p = reckon(v, 60_000);
  check('reckon stays in the world', p.x <= WORLD_W && p.y <= WORLD_H, p);
  check('reckon returns quantized points', p.x % QUANT === 0 && p.y % QUANT === 0, p);
}

// --- Squared distance ------------------------------------------------------
// 3-4-5 triangle by hand: 3^2 + 4^2 = 25.
check('dist2 on a 3-4-5 triangle', dist2(0, 0, 3, 4) === 25, dist2(0, 0, 3, 4));
check('dist2 is symmetric', dist2(11, 7, 3, 4) === dist2(3, 4, 11, 7));
check('dist2 of a point with itself is zero', dist2(9, 9, 9, 9) === 0);

// --- Integer median --------------------------------------------------------
// Odd count: middle element. Even count: the LOWER of the two middles, chosen
// so the result is always an actual integer with no averaging.
check('median of an odd list', medianInt([5, 1, 3]) === 3, medianInt([5, 1, 3]));
check('median of an even list takes the lower middle', medianInt([1, 2, 3, 4]) === 2, medianInt([1, 2, 3, 4]));
check('median of one element', medianInt([42]) === 42);
check('median of an empty list is zero', medianInt([]) === 0);
check('median does not mutate its input', (() => {
  const xs = [3, 1, 2];
  medianInt(xs);
  return xs[0] === 3 && xs[1] === 1 && xs[2] === 2;
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shoal-client && npx tsx src/lib/fixed.test.ts
```

Expected: FAIL — `Cannot find module './fixed'`.

- [ ] **Step 3: Write the implementation**

Create `shoal-client/src/lib/fixed.ts`:

```ts
/**
 * Integer geometry for the Shoal engine.
 *
 * No floating point survives past module initialisation: the trig table is
 * built once with Math.cos/Math.sin and immediately rounded to integers, and
 * every function below operates purely on integers. Two clients that agree on
 * the table agree on every position they ever compute.
 */
import {
  HEADING_STEPS, TRIG_SCALE, QUANT, WORLD_W, WORLD_H,
} from './shoalConst';
import type { Vec } from './shoalTypes';

function buildTable(fn: (rad: number) => number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < HEADING_STEPS; i++) {
    const rad = (2 * Math.PI * i) / HEADING_STEPS;
    out.push(Math.round(fn(rad) * TRIG_SCALE));
  }
  return Object.freeze(out);
}

/** cos(brad) * TRIG_SCALE, as integers. */
export const COS: readonly number[] = buildTable(Math.cos);
/** sin(brad) * TRIG_SCALE, as integers. */
export const SIN: readonly number[] = buildTable(Math.sin);

/** Floor `v` to the quantization grid. Floors negatives too, not truncates. */
export function quantize(v: number): number {
  return Math.floor(v / QUANT) * QUANT;
}

/** Pin a point inside the world bounds. */
export function clampToWorld(x: number, y: number): { x: number; y: number } {
  return {
    x: x < 0 ? 0 : x > WORLD_W ? WORLD_W : x,
    y: y < 0 ? 0 : y > WORLD_H ? WORLD_H : y,
  };
}

/**
 * Dead-reckon a vector forward to `atMs`. Elapsed time before the vector was
 * authored is clamped to zero — a vector never predicts the past.
 *
 * dx = speed * COS[heading] * dtMs / (TRIG_SCALE * 1000), integer-truncated.
 */
export function reckon(vec: Vec, atMs: number): { x: number; y: number } {
  const dt = atMs - vec.t;
  const dtMs = dt > 0 ? dt : 0;
  const denom = TRIG_SCALE * 1000;
  const dx = Math.trunc((vec.speed * COS[vec.heading] * dtMs) / denom);
  const dy = Math.trunc((vec.speed * SIN[vec.heading] * dtMs) / denom);
  const c = clampToWorld(vec.x + dx, vec.y + dy);
  return { x: quantize(c.x), y: quantize(c.y) };
}

/** Squared distance. Squared so no square root, and so no float. */
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * Median of a list of integers. For an even count, returns the LOWER of the
 * two middle values rather than their average, so the result is always an
 * element of the input and never introduces a fraction. Does not mutate input.
 */
export function medianInt(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]
    : sorted[sorted.length / 2 - 1];
  return mid;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/fixed.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Mutation-verify dead reckoning and the median**

Two deliberate breaks, one at a time, each reverted after checking:

1. In `reckon`, change `const dtMs = dt > 0 ? dt : 0;` to `const dtMs = dt;`.
   Expected: `FAIL  reckon clamps negative elapsed time to zero`.
2. In `medianInt`, change the even branch to `sorted[sorted.length / 2]`.
   Expected: `FAIL  median of an even list takes the lower middle`.

Revert both and confirm `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/fixed.ts shoal-client/src/lib/fixed.test.ts
git commit -m "feat(shoal): integer trig, dead reckoning, and median"
```

---

### Task 3: Shelter and exposure

**Files:**
- Create: `shoal-client/src/lib/shelter.ts`
- Test: `shoal-client/src/lib/shelter.test.ts`

**Interfaces:**
- Consumes: `fixed.ts` (`dist2`), `shoalConst.ts` (`SHELTER_*`), `shoalTypes.ts` (`Fish`).
- Produces:
  - `interface Body { id: string; x: number; y: number; size: number }`
  - `shelterWeight(size: number): number`
  - `shelterOf(self: Body, others: readonly Body[]): number`
  - `isExposed(self: Body, others: readonly Body[]): boolean`
  - `shelterMap(bodies: readonly Body[]): Map<string, number>`

- [ ] **Step 1: Write the failing test**

Create `shoal-client/src/lib/shelter.test.ts`:

```ts
/**
 * Shelter and exposure. Run: npx tsx src/lib/shelter.test.ts
 *
 * This is the rule the whole game turns on: who the sweep is allowed to take.
 * Expected values are hand-computed from the constants, never by re-invoking
 * the function under test.
 */
import { shelterWeight, shelterOf, isExposed, shelterMap, type Body } from './shelter';
import {
  SHELTER_BASE, SHELTER_SIZE_DIV, SHELTER_SIZE_CAP, SHELTER_THRESHOLD, SHELTER_R,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- Weight ----------------------------------------------------------------
// By hand with SHELTER_BASE=100, SHELTER_SIZE_DIV=40, SHELTER_SIZE_CAP=120:
// size 0   -> 100 + 0            = 100
// size 100 -> 100 + trunc(100/40)= 100 + 2 = 102
// size 400 -> 100 + 10           = 110
// size 9999-> 100 + 120 (capped) = 220
check('weight of a sizeless fish is the base', shelterWeight(0) === SHELTER_BASE, shelterWeight(0));
check('weight of a starting fish', shelterWeight(100) === 102, shelterWeight(100));
check('weight of a grown fish', shelterWeight(400) === 110, shelterWeight(400));
check('weight is capped', shelterWeight(999_999) === SHELTER_BASE + SHELTER_SIZE_CAP, shelterWeight(999_999));
check('weight is monotonic in size', shelterWeight(200) >= shelterWeight(100) && shelterWeight(1000) >= shelterWeight(200));

// --- The floor of three ----------------------------------------------------
// The load-bearing rule from spec 2.11: a pair is exposed, a trio is not.
{
  const self = at('me', 1000, 1000);
  const buddy = at('b', 1010, 1000);
  const third = at('c', 1000, 1010);

  check('a lone fish has no shelter', shelterOf(self, []) === 0);
  check('a lone fish is exposed', isExposed(self, []) === true);

  // One neighbour at size 100: 102. Below the threshold of 300.
  check('one neighbour is not enough', shelterOf(self, [buddy]) === 102, shelterOf(self, [buddy]));
  check('a pair is still exposed', isExposed(self, [buddy]) === true);

  // Two neighbours: 204. Still below 300 — this is the anti-pairing price.
  check('two neighbours give 204', shelterOf(self, [buddy, third]) === 204, shelterOf(self, [buddy, third]));
  check('a trio is STILL exposed at size 100', isExposed(self, [buddy, third]) === true);

  // Three neighbours: 306. Clears 300.
  const fourth = at('d', 1000, 990);
  check('three neighbours give 306', shelterOf(self, [buddy, third, fourth]) === 306,
    shelterOf(self, [buddy, third, fourth]));
  check('four fish together are sheltered', isExposed(self, [buddy, third, fourth]) === false);
}

// --- Radius ----------------------------------------------------------------
{
  const self = at('me', 0, 0);
  // Exactly on the radius counts; one unit beyond does not. Hand-checked
  // against SHELTER_R directly rather than against dist2 output.
  const onEdge = at('e', SHELTER_R, 0);
  const justOut = at('f', SHELTER_R + 1, 0);
  check('a neighbour exactly on the radius shelters', shelterOf(self, [onEdge]) === 102, shelterOf(self, [onEdge]));
  check('a neighbour just past the radius does not', shelterOf(self, [justOut]) === 0, shelterOf(self, [justOut]));
}

// --- Size shields ----------------------------------------------------------
// A big neighbour is worth more, but per the const test cannot shelter alone.
{
  const self = at('me', 500, 500);
  const whale = at('w', 510, 500, 999_999);
  const small = at('s', 490, 500, 0);
  check('a whale shelters more than a minnow', shelterOf(self, [whale]) > shelterOf(self, [small]));
  check('a whale alone still leaves you exposed', isExposed(self, [whale]) === true, shelterOf(self, [whale]));
}

// --- Self exclusion --------------------------------------------------------
{
  const self = at('me', 100, 100);
  check('a fish does not shelter itself', shelterOf(self, [self]) === 0, shelterOf(self, [self]));
}

// --- The map ---------------------------------------------------------------
// Independent expectation: build the same answer with a from-scratch loop that
// does not call shelterOf.
{
  const bodies = [at('a', 0, 0), at('b', 10, 0), at('c', 20, 0), at('d', 5000, 5000)];
  const got = shelterMap(bodies);

  const expected = new Map<string, number>();
  for (const s of bodies) {
    let total = 0;
    for (const o of bodies) {
      if (o.id === s.id) continue;
      const dx = s.x - o.x, dy = s.y - o.y;
      if (dx * dx + dy * dy <= SHELTER_R * SHELTER_R) {
        total += SHELTER_BASE + Math.min(Math.trunc(o.size / SHELTER_SIZE_DIV), SHELTER_SIZE_CAP);
      }
    }
    expected.set(s.id, total);
  }

  let same = got.size === expected.size;
  for (const [k, v] of expected) if (got.get(k) !== v) same = false;
  check('shelterMap matches an independent computation', same, { got: [...got], expected: [...expected] });
  check('the distant fish has no shelter', got.get('d') === 0, got.get('d'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shoal-client && npx tsx src/lib/shelter.test.ts
```

Expected: FAIL — `Cannot find module './shelter'`.

- [ ] **Step 3: Write the implementation**

Create `shoal-client/src/lib/shelter.ts`:

```ts
/**
 * Shelter: how protected a swimmer is by the crowd around it.
 *
 * Exposure is a size-weighted NEIGHBOUR COUNT within a radius, not a
 * nearest-neighbour distance. Under a distance formulation a pair is nearly as
 * safe as a school and takes all the food, so the game's real texture becomes
 * buddy-pairing. The threshold of three plain neighbours prices that
 * deliberately: a pair is a marriage, a trio has politics.
 */
import { dist2 } from './fixed';
import {
  SHELTER_R2, SHELTER_BASE, SHELTER_SIZE_DIV, SHELTER_SIZE_CAP, SHELTER_THRESHOLD,
} from './shoalConst';

/** The minimum a fish needs to be to anyone else: a place and a size. */
export interface Body {
  id: string;
  x: number;
  y: number;
  size: number;
}

/** How much shelter a fish of this size gives to a neighbour. */
export function shelterWeight(size: number): number {
  const bonus = Math.trunc(size / SHELTER_SIZE_DIV);
  return SHELTER_BASE + (bonus > SHELTER_SIZE_CAP ? SHELTER_SIZE_CAP : bonus);
}

/** Total shelter `self` receives from `others`. A fish never shelters itself. */
export function shelterOf(self: Body, others: readonly Body[]): number {
  let total = 0;
  for (const o of others) {
    if (o.id === self.id) continue;
    if (dist2(self.x, self.y, o.x, o.y) <= SHELTER_R2) total += shelterWeight(o.size);
  }
  return total;
}

/** True when the sweep is permitted to take this fish. */
export function isExposed(self: Body, others: readonly Body[]): boolean {
  return shelterOf(self, others) < SHELTER_THRESHOLD;
}

/** Shelter for every body, against every other body. */
export function shelterMap(bodies: readonly Body[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bodies) out.set(b.id, shelterOf(b, bodies));
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/shelter.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Mutation-verify the floor of three and the radius boundary**

One at a time, reverting after each:

1. In `isExposed`, change `<` to `<=`.
   Expected: `FAIL  four fish together are sheltered`.
2. In `shelterOf`, change `<= SHELTER_R2` to `< SHELTER_R2`.
   Expected: `FAIL  a neighbour exactly on the radius shelters`.
3. In `shelterOf`, delete the `if (o.id === self.id) continue;` line.
   Expected: `FAIL  a fish does not shelter itself`.

Revert all three and confirm `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/shelter.ts shoal-client/src/lib/shelter.test.ts
git commit -m "feat(shoal): shelter scoring and the floor of three"
```

---

### Task 4: Tension

**Files:**
- Create: `shoal-client/src/lib/tension.ts`
- Test: `shoal-client/src/lib/tension.test.ts`

**Interfaces:**
- Consumes: `fixed.ts` (`dist2`, `medianInt`), `shoalConst.ts` (`CORE_R2`, `TENSION_NEUTRAL`, `TENSION_TRIGGER`), `shelter.ts` (`Body`).
- Produces:
  - `coreCentre(bodies: readonly Body[]): { x: number; y: number }`
  - `outsideCore(bodies: readonly Body[]): string[]` — ids, sorted ascending
  - `spreadPerMille(bodies: readonly Body[]): number`
  - `stepTension(current: number, bodies: readonly Body[]): number`
  - `topContributor(bodies: readonly Body[], outsideTicks: ReadonlyMap<string, number>): string | null`

- [ ] **Step 1: Write the failing test**

Create `shoal-client/src/lib/tension.test.ts`:

```ts
/**
 * Tension: the school's own greed, measured. Run: npx tsx src/lib/tension.test.ts
 *
 * The critical property is ROBUSTNESS. Under a mean-based measure, one player
 * swimming far out spikes tension and darts back to safety while a rival is
 * caught in the open — a personal "call the shark on my enemy" button. A
 * count-based measure caps every individual's contribution at exactly one.
 */
import { coreCentre, outsideCore, spreadPerMille, stepTension, topContributor } from './tension';
import type { Body } from './shelter';
import { CORE_R, TENSION_NEUTRAL, TENSION_TRIGGER } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- The core centre -------------------------------------------------------
// medianInt takes the lower middle on even counts, so x of [0,10,20] is 10.
check('centre of a tight trio', (() => {
  const c = coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20)]);
  return c.x === 10 && c.y === 10;
})(), coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20)]));

// The median must ignore an extreme outlier entirely. A mean would not:
// mean x of [0,10,20,100000] is 25007, median (lower middle) is 10.
check('one distant fish does not move the centre', (() => {
  const c = coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20), at('z', 100_000, 100_000)]);
  return c.x === 10 && c.y === 10;
})(), coreCentre([at('a', 0, 0), at('b', 10, 10), at('c', 20, 20), at('z', 100_000, 100_000)]));

check('centre of an empty sea is the origin', coreCentre([]).x === 0 && coreCentre([]).y === 0);

// --- Who is outside --------------------------------------------------------
{
  // Centre will be (0,0). A fish exactly on CORE_R is inside; one past is out.
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('edge', CORE_R, 0), at('far', CORE_R + 1, 0)];
  const out = outsideCore(bodies);
  check('a fish on the core radius is inside', !out.includes('edge'), out);
  check('a fish past the core radius is outside', out.includes('far'), out);
  check('outsideCore returns sorted ids', JSON.stringify(out) === JSON.stringify([...out].sort()), out);
}

// --- Spread, in per mille --------------------------------------------------
// Hand arithmetic: 1 of 4 outside = 1000*1/4 = 250 per mille.
{
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('far', 100_000, 0)];
  check('one of four outside is 250 per mille', spreadPerMille(bodies) === 250, spreadPerMille(bodies));
}
// 2 of 4 outside = 500 per mille.
{
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('f1', 100_000, 0), at('f2', 100_001, 0)];
  const s = spreadPerMille(bodies);
  check('two of four outside is at least 500 per mille', s >= 500, s);
}
check('an empty sea has no spread', spreadPerMille([]) === 0);

// --- The individual cap ----------------------------------------------------
// The whole point: moving ONE fish from far to absurdly far must not change
// the reading at all. A mean-based measure would change dramatically.
{
  const near = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('z', 5_000, 0)];
  const far  = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('z', 3_000_000, 0)];
  check('one fish cannot spike tension by going further', spreadPerMille(near) === spreadPerMille(far),
    { near: spreadPerMille(near), far: spreadPerMille(far) });
}

// --- Accumulation ----------------------------------------------------------
// stepTension adds (spread - NEUTRAL) and floors at zero.
{
  const tight = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('d', 0, 0)];
  check('a tight school never raises tension', stepTension(0, tight) === 0, stepTension(0, tight));
  check('a tight school drains existing tension', stepTension(5_000, tight) < 5_000, stepTension(5_000, tight));
  check('tension never goes below zero', stepTension(0, tight) >= 0);
}
{
  // 3 of 4 outside = 750 per mille. Delta = 750 - 250 = 500, by hand.
  const loose = [at('a', 0, 0), at('f1', 90_000, 0), at('f2', 90_001, 0), at('f3', 90_002, 0)];
  check('a loose school raises tension by spread minus neutral',
    stepTension(1_000, loose) === 1_000 + (spreadPerMille(loose) - TENSION_NEUTRAL),
    { got: stepTension(1_000, loose), spread: spreadPerMille(loose), TENSION_NEUTRAL });
  check('a loose school does raise tension', stepTension(1_000, loose) > 1_000);
}
// The trigger must be reachable in a plausible number of ticks, not never.
{
  const loose = [at('a', 0, 0), at('f1', 90_000, 0), at('f2', 90_001, 0), at('f3', 90_002, 0)];
  let t = 0, ticks = 0;
  while (t < TENSION_TRIGGER && ticks < 10_000) { t = stepTension(t, loose); ticks++; }
  check('a loose school reaches the trigger', t >= TENSION_TRIGGER, { ticks });
  check('it takes more than a moment to get there', ticks > 20, { ticks });
}

// --- The preferred target --------------------------------------------------
{
  const bodies = [at('a', 0, 0), at('b', 0, 0), at('c', 0, 0), at('x', 90_000, 0, 500), at('y', 90_001, 0, 900)];
  // 'y' has been outside longer, so it is the contributor regardless of size.
  const ticks = new Map([['x', 4], ['y', 40]]);
  check('the longest-exposed fish is the contributor', topContributor(bodies, ticks) === 'y',
    topContributor(bodies, ticks));

  // Tie on time: the larger fish is preferred.
  const tied = new Map([['x', 10], ['y', 10]]);
  check('ties on time break toward the larger fish', topContributor(bodies, tied) === 'y',
    topContributor(bodies, tied));

  // Nobody outside means nobody is preferred.
  check('a tight school has no contributor', topContributor([at('a', 0, 0), at('b', 0, 0)], new Map()) === null);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shoal-client && npx tsx src/lib/tension.test.ts
```

Expected: FAIL — `Cannot find module './tension'`.

- [ ] **Step 3: Write the implementation**

Create `shoal-client/src/lib/tension.ts`:

```ts
/**
 * Tension — the school's own greed, measured.
 *
 * Deliberately a COUNT of fish outside a median-anchored core, not a mean
 * distance. A count caps every individual's contribution at exactly one, which
 * removes the "call the shark on my enemy" exploit: swimming further out than
 * anyone else changes nothing once you are already outside.
 */
import { dist2, medianInt } from './fixed';
import { CORE_R2, TENSION_NEUTRAL } from './shoalConst';
import type { Body } from './shelter';

/** The median position of the school. Immune to outliers by construction. */
export function coreCentre(bodies: readonly Body[]): { x: number; y: number } {
  if (bodies.length === 0) return { x: 0, y: 0 };
  return {
    x: medianInt(bodies.map((b) => b.x)),
    y: medianInt(bodies.map((b) => b.y)),
  };
}

/** Ids of fish outside the core, ascending. Sorted so callers are order-stable. */
export function outsideCore(bodies: readonly Body[]): string[] {
  const c = coreCentre(bodies);
  const out: string[] = [];
  for (const b of bodies) {
    if (dist2(b.x, b.y, c.x, c.y) > CORE_R2) out.push(b.id);
  }
  return out.sort();
}

/** Fraction of the school outside the core, in per mille. */
export function spreadPerMille(bodies: readonly Body[]): number {
  if (bodies.length === 0) return 0;
  return Math.trunc((1000 * outsideCore(bodies).length) / bodies.length);
}

/** Advance tension by one tick. Floors at zero; never negative. */
export function stepTension(current: number, bodies: readonly Body[]): number {
  const next = current + (spreadPerMille(bodies) - TENSION_NEUTRAL);
  return next < 0 ? 0 : next;
}

/**
 * The fish most responsible for the current tension: whoever has been outside
 * the core longest. Ties break toward the larger fish, then the lower id.
 * Greed calls the shark, and the shark knows your name.
 */
export function topContributor(
  bodies: readonly Body[],
  outsideTicks: ReadonlyMap<string, number>,
): string | null {
  const out = outsideCore(bodies);
  if (out.length === 0) return null;
  const byId = new Map(bodies.map((b) => [b.id, b]));
  let best: string | null = null;
  let bestTicks = -1;
  let bestSize = -1;
  for (const id of out) {
    const ticks = outsideTicks.get(id) ?? 0;
    const size = byId.get(id)?.size ?? 0;
    if (ticks > bestTicks || (ticks === bestTicks && size > bestSize)) {
      best = id;
      bestTicks = ticks;
      bestSize = size;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/tension.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Mutation-verify the robustness property**

This is the check that matters most in this module.

1. In `spreadPerMille`, replace the body with a mean-distance measure:
   ```ts
   const c = coreCentre(bodies);
   let total = 0;
   for (const b of bodies) total += dist2(b.x, b.y, c.x, c.y);
   return Math.trunc(total / bodies.length / 1000);
   ```
   Expected: `FAIL  one fish cannot spike tension by going further`.
2. In `stepTension`, remove the zero floor (`return next;`).
   Expected: `FAIL  tension never goes below zero`.
3. In `coreCentre`, replace `medianInt` with a mean over the same values.
   Expected: `FAIL  one distant fish does not move the centre`.

Revert all three and confirm `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/tension.ts shoal-client/src/lib/tension.test.ts
git commit -m "feat(shoal): median-anchored tension with a capped individual contribution"
```

---

### Task 5: The sweep

**Files:**
- Create: `shoal-client/src/lib/sweep.ts`
- Test: `shoal-client/src/lib/sweep.test.ts`

**Interfaces:**
- Consumes: `shelter.ts` (`Body`, `isExposed`), `shoalConst.ts` (`HUSH_MS`, `LOCK_MS`, `MAX_TAKE`, `TENSION_TRIGGER`).
- Produces:
  - `type HushPhase = 'calm' | 'commit' | 'dread'`
  - `hushPhase(hushStartMs: number, nowMs: number): HushPhase`
  - `shouldStartHush(tension: number, hushStartMs: number): boolean`
  - `isResolveTick(hushStartMs: number, nowMs: number, tickMs: number): boolean`
  - `selectTaken(locked: readonly Body[], preferred: string | null): string[]`

- [ ] **Step 1: Write the failing test**

Create `shoal-client/src/lib/sweep.test.ts`:

```ts
/**
 * The sweep. Run: npx tsx src/lib/sweep.test.ts
 *
 * Two properties carry the whole game:
 *  - ABSOLUTE THRESHOLD, not maximum. The sweep may take nobody. Under a
 *    take-the-loneliest rule, a group who all drift away from one person make
 *    that person permanently the victim with no counterplay. Under an absolute
 *    threshold, hugging ANYONE saves you, and two outcasts save each other.
 *  - RESOLUTION BINDS ONLY ON LOCKED INPUT. Two clients holding different
 *    input sets must not compute different answers.
 */
import { hushPhase, shouldStartHush, isResolveTick, selectTaken } from './sweep';
import type { Body } from './shelter';
import { HUSH_MS, LOCK_MS, MAX_TAKE, TENSION_TRIGGER, TICK_MS } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- Phases ----------------------------------------------------------------
// Hand-walked against HUSH_MS=8000, LOCK_MS=4000, hush starting at t=1000.
check('no hush means calm', hushPhase(-1, 5_000) === 'calm');
check('the hush opens in commit', hushPhase(1_000, 1_000) === 'commit');
check('still commit just before the lock', hushPhase(1_000, 1_000 + LOCK_MS - 1) === 'commit');
check('dread begins exactly at the lock', hushPhase(1_000, 1_000 + LOCK_MS) === 'dread');
check('still dread just before resolution', hushPhase(1_000, 1_000 + HUSH_MS - 1) === 'dread');
check('calm returns after resolution', hushPhase(1_000, 1_000 + HUSH_MS) === 'calm');
check('time before the hush is calm', hushPhase(1_000, 999) === 'calm');

// --- Firing ----------------------------------------------------------------
check('tension below the trigger does not fire', shouldStartHush(TENSION_TRIGGER - 1, -1) === false);
check('tension at the trigger fires', shouldStartHush(TENSION_TRIGGER, -1) === true);
check('a hush already running does not re-fire', shouldStartHush(TENSION_TRIGGER * 10, 5_000) === false);

// --- The resolve tick ------------------------------------------------------
check('resolution lands on the hush end', isResolveTick(1_000, 1_000 + HUSH_MS, TICK_MS) === true);
check('no resolution before the end', isResolveTick(1_000, 1_000 + HUSH_MS - TICK_MS, TICK_MS) === false);
check('no resolution after the end', isResolveTick(1_000, 1_000 + HUSH_MS + TICK_MS, TICK_MS) === false);
check('no resolution without a hush', isResolveTick(-1, 5_000, TICK_MS) === false);

// --- Absolute threshold: the sweep may take NOBODY --------------------------
{
  // Six fish piled together: everyone has five neighbours, far above the
  // threshold of three. Nobody is exposed, so nobody is taken.
  const tight: Body[] = [];
  for (let i = 0; i < 6; i++) tight.push(at(`f${i}`, 1000 + i, 1000));
  check('a tight school loses nobody', selectTaken(tight, null).length === 0, selectTaken(tight, null));
}

// --- ...and may take several ----------------------------------------------
{
  // Five fish scattered far apart: all exposed. Capped at MAX_TAKE.
  const scattered: Body[] = [];
  for (let i = 0; i < 5; i++) scattered.push(at(`f${i}`, i * 50_000, 0));
  const taken = selectTaken(scattered, null);
  check('a scattered school loses several', taken.length === MAX_TAKE, taken);
}

// --- The anti-ostracism property -------------------------------------------
{
  // Nineteen fish agree to leave one alone. Under take-the-maximum, 'victim'
  // is always taken and can do nothing. Here, joining ANY two others saves it.
  const pack: Body[] = [];
  for (let i = 0; i < 19; i++) pack.push(at(`p${i}`, 1000 + i, 1000));
  const isolated = [...pack, at('victim', 90_000, 90_000)];
  check('an isolated fish is taken', selectTaken(isolated, null).includes('victim'), selectTaken(isolated, null));

  // Two other outcasts are not enough (the floor of three), but three are.
  const rescued = [...pack, at('victim', 90_000, 90_000), at('o1', 90_010, 90_000),
    at('o2', 90_000, 90_010), at('o3', 90_010, 90_010)];
  check('four outcasts together are safe', !selectTaken(rescued, null).includes('victim'),
    selectTaken(rescued, null));
}

// --- Largest first, then preferred -----------------------------------------
{
  const exposed = [at('small', 0, 0, 100), at('big', 500_000, 0, 900), at('mid', 1_000_000, 0, 400)];
  const taken = selectTaken(exposed, null);
  check('the largest exposed fish is taken first', taken[0] === 'big', taken);
  check('order is by descending size', JSON.stringify(taken) === JSON.stringify(['big', 'mid', 'small']), taken);
}
{
  // The preferred target jumps the queue even when it is not the largest.
  const exposed = [at('small', 0, 0, 100), at('big', 500_000, 0, 900), at('mid', 1_000_000, 0, 400)];
  const taken = selectTaken(exposed, 'small');
  check('the preferred target is taken first', taken[0] === 'small', taken);
}
{
  // A preferred target that is NOT exposed is not taken at all — greed calls
  // the shark, but shelter still saves you.
  const pack: Body[] = [];
  for (let i = 0; i < 6; i++) pack.push(at(`p${i}`, 1000 + i, 1000));
  check('a sheltered preferred target is spared', selectTaken(pack, 'p0').length === 0, selectTaken(pack, 'p0'));
}

// --- Determinism -----------------------------------------------------------
{
  // Same fish, different array order, must give the same answer. Without a
  // total order on ties this is exactly where two clients diverge.
  const a = [at('x', 0, 0, 200), at('y', 500_000, 0, 200), at('z', 1_000_000, 0, 200)];
  const b = [a[2], a[0], a[1]];
  check('input order does not change the outcome',
    JSON.stringify(selectTaken(a, null)) === JSON.stringify(selectTaken(b, null)),
    { a: selectTaken(a, null), b: selectTaken(b, null) });
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shoal-client && npx tsx src/lib/sweep.test.ts
```

Expected: FAIL — `Cannot find module './sweep'`.

- [ ] **Step 3: Write the implementation**

Create `shoal-client/src/lib/sweep.ts`:

```ts
/**
 * The sweep — the moment the whole game's verdict is delivered.
 *
 * Timeline, from spec 2.12:
 *   T+0        hush begins; the client refunds the player's action timer
 *   T+0..LOCK  commit window; your position still counts; one action guaranteed
 *   T+LOCK     INPUT LOCK; nothing after this counts. Network slack.
 *   T+LOCK..H  dread; you cannot act, you watch it come
 *   T+HUSH     resolution, against locked inputs only
 *
 * Resolution binds only on locked input because two clients holding different
 * input sets otherwise compute different answers whenever the top candidates
 * are close — and in a bunched school they are always close. "The shark ate
 * the wrong fish" is the most trust-destroying bug this game can have.
 */
import { isExposed, type Body } from './shelter';
import { HUSH_MS, LOCK_MS, MAX_TAKE, TENSION_TRIGGER } from './shoalConst';

export type HushPhase = 'calm' | 'commit' | 'dread';

/** Where in the hush we are. `hushStartMs` of -1 means no hush is running. */
export function hushPhase(hushStartMs: number, nowMs: number): HushPhase {
  if (hushStartMs < 0) return 'calm';
  const elapsed = nowMs - hushStartMs;
  if (elapsed < 0 || elapsed >= HUSH_MS) return 'calm';
  return elapsed < LOCK_MS ? 'commit' : 'dread';
}

/** True on the tick a new hush begins. A hush never interrupts a hush. */
export function shouldStartHush(tension: number, hushStartMs: number): boolean {
  return hushStartMs < 0 && tension >= TENSION_TRIGGER;
}

/** True on the single tick the sweep resolves. */
export function isResolveTick(hushStartMs: number, nowMs: number, tickMs: number): boolean {
  if (hushStartMs < 0) return false;
  const elapsed = nowMs - hushStartMs;
  return elapsed >= HUSH_MS && elapsed < HUSH_MS + tickMs;
}

/**
 * Who the sweep takes, from LOCKED positions only.
 *
 * Absolute threshold, not maximum: every candidate must independently be
 * exposed, so a tight school loses nobody and a loose one may lose up to
 * MAX_TAKE. Ordering is total — preferred target, then descending size, then
 * ascending id — so every client returns the identical list.
 */
export function selectTaken(locked: readonly Body[], preferred: string | null): string[] {
  const candidates = locked.filter((b) => isExposed(b, locked));
  candidates.sort((a, b) => {
    const ap = a.id === preferred ? 1 : 0;
    const bp = b.id === preferred ? 1 : 0;
    if (ap !== bp) return bp - ap;
    if (a.size !== b.size) return b.size - a.size;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return candidates.slice(0, MAX_TAKE).map((b) => b.id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/sweep.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Mutation-verify the anti-ostracism and determinism properties**

One at a time, reverting after each:

1. Replace the absolute threshold with take-the-maximum: change the first line
   of `selectTaken` to `const candidates = locked.slice();`.
   Expected: `FAIL  a tight school loses nobody` **and** `FAIL  four outcasts together are safe`.
   If either still passes, that check is vacuous.
2. Remove the id tiebreak: change the final `return` in the comparator to `return 0;`.
   Then run the test twice. Expected: `FAIL  input order does not change the outcome`.
   (If it passes by luck of the sort implementation, make the three sizes equal
   in that fixture and re-run — the fixture already uses size 200 for all three
   precisely so this mutation is detectable.)
3. In `hushPhase`, change `elapsed < LOCK_MS` to `elapsed <= LOCK_MS`.
   Expected: `FAIL  dread begins exactly at the lock`.

Revert all and confirm `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/sweep.ts shoal-client/src/lib/sweep.test.ts
git commit -m "feat(shoal): hush window and absolute-threshold sweep selection"
```

---

### Task 6: Blooms

**Files:**
- Create: `shoal-client/src/lib/bloom.ts`
- Test: `shoal-client/src/lib/bloom.test.ts`

**Interfaces:**
- Consumes: `fixed.ts` (`dist2`), `shoalConst.ts` (`BLOOM_*`, `EAT_R2`), `shelter.ts` (`Body`).
- Produces:
  - `cellIndex(x: number, y: number): number`
  - `cellCentre(cell: number): { x: number; y: number }`
  - `markVisits(lastVisit: Map<number, number>, bodies: readonly Body[], nowMs: number): void`
  - `isBloomReady(lastVisit: ReadonlyMap<number, number>, cell: number, nowMs: number): boolean`
  - `bitesLeft(bitesTaken: ReadonlyMap<number, number>, cell: number): number`
  - `canEat(args: {...}): boolean` — full signature in the implementation

- [ ] **Step 1: Write the failing test**

Create `shoal-client/src/lib/bloom.test.ts`:

```ts
/**
 * Blooms. Run: npx tsx src/lib/bloom.test.ts
 *
 * Food grows where the school ISN'T. The bloom map is a picture of where
 * nobody has been, so it refills exactly the places players were too scared to
 * go. Blooms are RIVALROUS: if one bloom fed the whole school, the optimal play
 * would be a single tight blob walking the map together, tension would never
 * rise, and the game's core tension would quietly stop existing.
 */
import { cellIndex, cellCentre, markVisits, isBloomReady, bitesLeft, canEat } from './bloom';
import type { Body } from './shelter';
import {
  BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS, BLOOM_READY_MS, BLOOM_BITES,
  BLOOM_VISIT_R, EAT_R, EAT_COOLDOWN_MS,
} from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const at = (id: string, x: number, y: number, size = 100): Body => ({ id, x, y, size });

// --- The grid --------------------------------------------------------------
// Hand arithmetic with BLOOM_CELL=128, BLOOM_COLS=32:
// (0,0) -> col 0, row 0 -> index 0.  (128,0) -> col 1 -> index 1.
// (0,128) -> row 1 -> index 32.
check('origin is cell 0', cellIndex(0, 0) === 0, cellIndex(0, 0));
check('one cell right is cell 1', cellIndex(BLOOM_CELL, 0) === 1, cellIndex(BLOOM_CELL, 0));
check('one cell down is cell BLOOM_COLS', cellIndex(0, BLOOM_CELL) === BLOOM_COLS, cellIndex(0, BLOOM_CELL));
check('within a cell maps to the same index', cellIndex(BLOOM_CELL - 1, BLOOM_CELL - 1) === 0,
  cellIndex(BLOOM_CELL - 1, BLOOM_CELL - 1));
check('every cell index is in range', (() => {
  for (const [x, y] of [[0, 0], [4095, 3071], [2000, 1500]] as const) {
    const i = cellIndex(x, y);
    if (i < 0 || i >= BLOOM_COLS * BLOOM_ROWS) return false;
  }
  return true;
})());

// Centre of cell 0 is (64, 64) by hand: half of 128.
check('cell centre is the middle of the cell', cellCentre(0).x === 64 && cellCentre(0).y === 64, cellCentre(0));
check('centre round-trips to its own index', cellIndex(cellCentre(70).x, cellCentre(70).y) === 70,
  { centre: cellCentre(70), back: cellIndex(cellCentre(70).x, cellCentre(70).y) });

// --- Visits ----------------------------------------------------------------
{
  const lastVisit = new Map<number, number>();
  // A fish at a cell centre marks that cell.
  const c = cellCentre(100);
  markVisits(lastVisit, [at('a', c.x, c.y)], 10_000);
  check('a fish marks the cell it is in', lastVisit.get(100) === 10_000, lastVisit.get(100));

  // A fish marks nearby cells too, out to BLOOM_VISIT_R.
  check('a fish marks more than one cell', lastVisit.size > 1, lastVisit.size);

  // A fish far away marks nothing near cell 100... verified by an independent
  // count over the visit radius rather than by trusting markVisits twice.
  const far = new Map<number, number>();
  markVisits(far, [at('a', 3_000, 2_500)], 10_000);
  check('a distant fish does not mark cell 100', !far.has(100), [...far.keys()].slice(0, 5));
}

// --- Readiness -------------------------------------------------------------
{
  const lastVisit = new Map<number, number>([[7, 1_000]]);
  // By hand: ready when now - lastVisit >= BLOOM_READY_MS.
  check('a just-visited cell is not ready', isBloomReady(lastVisit, 7, 1_000) === false);
  check('a cell one ms short is not ready', isBloomReady(lastVisit, 7, 1_000 + BLOOM_READY_MS - 1) === false);
  check('a cell exactly at readiness is ready', isBloomReady(lastVisit, 7, 1_000 + BLOOM_READY_MS) === true);
  // A never-visited cell is ready — the sea starts full.
  check('a never-visited cell is ready', isBloomReady(lastVisit, 999, 0) === true);
}

// --- Rivalry ---------------------------------------------------------------
{
  const taken = new Map<number, number>();
  check('a fresh bloom has all its bites', bitesLeft(taken, 5) === BLOOM_BITES, bitesLeft(taken, 5));
  taken.set(5, 2);
  check('bites already taken are gone', bitesLeft(taken, 5) === BLOOM_BITES - 2, bitesLeft(taken, 5));
  taken.set(5, BLOOM_BITES);
  check('an exhausted bloom has nothing left', bitesLeft(taken, 5) === 0, bitesLeft(taken, 5));
  taken.set(5, BLOOM_BITES + 99);
  check('bites left never goes negative', bitesLeft(taken, 5) === 0, bitesLeft(taken, 5));
}

// --- Crediting a bite ------------------------------------------------------
{
  const cell = 100;
  const c = cellCentre(cell);
  const base = {
    lastVisit: new Map<number, number>(),
    bitesTaken: new Map<number, number>(),
    cell,
    fishX: c.x,
    fishY: c.y,
    lastBiteMs: -1,
    nowMs: 100_000,
  };
  check('a bite at a ready bloom credits', canEat(base) === true);

  // Out of range: EAT_R is the boundary, so EAT_R+1 away must fail.
  check('a bite exactly at the eat radius credits',
    canEat({ ...base, fishX: c.x + EAT_R, fishY: c.y }) === true);
  check('a bite past the eat radius does not',
    canEat({ ...base, fishX: c.x + EAT_R + 1, fishY: c.y }) === false);

  // Not ready: cell visited recently.
  check('a bite at a recently visited cell does not credit',
    canEat({ ...base, lastVisit: new Map([[cell, 99_000]]) }) === false);

  // Exhausted.
  check('a bite at an exhausted bloom does not credit',
    canEat({ ...base, bitesTaken: new Map([[cell, BLOOM_BITES]]) }) === false);

  // Cooldown, by hand: a bite EAT_COOLDOWN_MS-1 ago is too soon.
  check('a bite inside the cooldown does not credit',
    canEat({ ...base, lastBiteMs: base.nowMs - (EAT_COOLDOWN_MS - 1) }) === false);
  check('a bite exactly at the cooldown credits',
    canEat({ ...base, lastBiteMs: base.nowMs - EAT_COOLDOWN_MS }) === true);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shoal-client && npx tsx src/lib/bloom.test.ts
```

Expected: FAIL — `Cannot find module './bloom'`.

- [ ] **Step 3: Write the implementation**

Create `shoal-client/src/lib/bloom.ts`:

```ts
/**
 * Blooms — food grows where the school isn't.
 *
 * The bloom map is a picture of where nobody has been. A cell unvisited for
 * BLOOM_READY_MS carries a bloom worth BLOOM_BITES; a fish passing within
 * BLOOM_VISIT_R resets it. Blooms are rivalrous on purpose: if one bloom fed
 * the whole school, a single tight blob could walk the map together, tension
 * would never rise, and the core tension of the game would stop existing.
 *
 * The lookback is bounded by BLOOM_WINDOW_MS, which sits below PRESENCE_TTL_MS
 * so a client joining mid-session can rebuild this map from data still live.
 */
import { dist2 } from './fixed';
import {
  BLOOM_CELL, BLOOM_COLS, BLOOM_ROWS, BLOOM_VISIT_R, BLOOM_VISIT_R2,
  BLOOM_READY_MS, BLOOM_BITES, EAT_R2, EAT_COOLDOWN_MS,
} from './shoalConst';
import type { Body } from './shelter';

/** Grid cell containing a point. Clamped, so out-of-world points stay in range. */
export function cellIndex(x: number, y: number): number {
  let col = Math.floor(x / BLOOM_CELL);
  let row = Math.floor(y / BLOOM_CELL);
  if (col < 0) col = 0; else if (col >= BLOOM_COLS) col = BLOOM_COLS - 1;
  if (row < 0) row = 0; else if (row >= BLOOM_ROWS) row = BLOOM_ROWS - 1;
  return row * BLOOM_COLS + col;
}

/** The centre point of a cell. */
export function cellCentre(cell: number): { x: number; y: number } {
  const col = cell % BLOOM_COLS;
  const row = Math.floor(cell / BLOOM_COLS);
  const half = BLOOM_CELL / 2;
  return { x: col * BLOOM_CELL + half, y: row * BLOOM_CELL + half };
}

/**
 * Stamp every cell within BLOOM_VISIT_R of any fish as visited at `nowMs`.
 * Mutates `lastVisit` in place — this is called once per fold tick.
 */
export function markVisits(
  lastVisit: Map<number, number>,
  bodies: readonly Body[],
  nowMs: number,
): void {
  const reach = Math.ceil(BLOOM_VISIT_R / BLOOM_CELL);
  for (const b of bodies) {
    const col = Math.floor(b.x / BLOOM_CELL);
    const row = Math.floor(b.y / BLOOM_CELL);
    for (let dr = -reach; dr <= reach; dr++) {
      for (let dc = -reach; dc <= reach; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || c >= BLOOM_COLS || r < 0 || r >= BLOOM_ROWS) continue;
        const cell = r * BLOOM_COLS + c;
        const centre = cellCentre(cell);
        if (dist2(b.x, b.y, centre.x, centre.y) <= BLOOM_VISIT_R2) {
          lastVisit.set(cell, nowMs);
        }
      }
    }
  }
}

/** True when a cell has been left alone long enough to bloom. */
export function isBloomReady(
  lastVisit: ReadonlyMap<number, number>,
  cell: number,
  nowMs: number,
): boolean {
  const seen = lastVisit.get(cell);
  if (seen === undefined) return true; // never visited: the sea starts full
  return nowMs - seen >= BLOOM_READY_MS;
}

/** Bites remaining in a cell's current bloom. Never negative. */
export function bitesLeft(bitesTaken: ReadonlyMap<number, number>, cell: number): number {
  const used = bitesTaken.get(cell) ?? 0;
  const left = BLOOM_BITES - used;
  return left < 0 ? 0 : left;
}

/** Everything a bite must satisfy to be credited. */
export interface EatCheck {
  lastVisit: ReadonlyMap<number, number>;
  bitesTaken: ReadonlyMap<number, number>;
  cell: number;
  fishX: number;
  fishY: number;
  /** Ms of this fish's last credited bite, or -1. */
  lastBiteMs: number;
  nowMs: number;
}

/** True when a claimed bite credits. */
export function canEat(a: EatCheck): boolean {
  if (!isBloomReady(a.lastVisit, a.cell, a.nowMs)) return false;
  if (bitesLeft(a.bitesTaken, a.cell) <= 0) return false;
  const centre = cellCentre(a.cell);
  if (dist2(a.fishX, a.fishY, centre.x, centre.y) > EAT_R2) return false;
  if (a.lastBiteMs >= 0 && a.nowMs - a.lastBiteMs < EAT_COOLDOWN_MS) return false;
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/bloom.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Mutation-verify rivalry and the readiness boundary**

One at a time, reverting after each:

1. In `canEat`, delete the `bitesLeft(...) <= 0` guard.
   Expected: `FAIL  a bite at an exhausted bloom does not credit`.
2. In `isBloomReady`, change `>=` to `>`.
   Expected: `FAIL  a cell exactly at readiness is ready`.
3. In `canEat`, change `> EAT_R2` to `>= EAT_R2`.
   Expected: `FAIL  a bite exactly at the eat radius credits`.

Revert all and confirm `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/bloom.ts shoal-client/src/lib/bloom.test.ts
git commit -m "feat(shoal): fallow bloom grid with rivalrous bites"
```

---

### Task 7: The fold

**Files:**
- Create: `shoal-client/src/lib/shoalEngine.ts`
- Test: `shoal-client/src/lib/shoalEngine.test.ts`

**Interfaces:**
- Consumes: every module above.
- Produces:
  - `orderLog(entries: readonly LogEntry[]): LogEntry[]`
  - `emptyState(startMs: number): ShoalState`
  - `foldShoal(entries: readonly LogEntry[], untilMs: number): ShoalState`
  - `bodiesOf(state: ShoalState): Body[]`

- [ ] **Step 1: Write the failing test**

Create `shoal-client/src/lib/shoalEngine.test.ts`:

```ts
/**
 * The fold. Run: npx tsx src/lib/shoalEngine.test.ts
 *
 * Ordering note, learned the hard way on Chips & Dip: same-block entries are
 * ordered by EMBEDDED AUTHORING MS, with the content hash as the only
 * tiebreak. An allocator that does not track wall clock sorts every later
 * action before every earlier one and silently rescores the session.
 */
import { orderLog, emptyState, foldShoal, bodiesOf } from './shoalEngine';
import type { LogEntry, Presence, EatClaim } from './shoalTypes';
import {
  START_SIZE, MIN_SIZE, BITE_GROWTH, SCATTER_COST, TICK_MS,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, PRESENCE_TTL_MS, BLOOM_READY_MS,
} from './shoalConst';
import { cellCentre } from './bloom';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function pres(id: string, x: number, y: number, ms: number, hash = id + ms): Presence {
  return { kind: 'presence', id, ms, hash, vec: { x, y, heading: 0, speed: 0, t: ms } };
}
function eat(id: string, cell: number, ms: number, hash = id + 'e' + ms): EatClaim {
  const c = cellCentre(cell);
  return { kind: 'eat', id, cell, x: c.x, y: c.y, ms, hash };
}

// --- Ordering --------------------------------------------------------------
{
  const a = pres('a', 0, 0, 500);
  const b = pres('b', 0, 0, 100);
  const c = pres('c', 0, 0, 300);
  const ordered = orderLog([a, b, c]);
  check('the log orders by authoring ms', JSON.stringify(ordered.map((e) => e.id)) === JSON.stringify(['b', 'c', 'a']),
    ordered.map((e) => e.id));
}
{
  // Identical ms: the hash breaks the tie, ascending. Hand-picked hashes.
  const x = pres('x', 0, 0, 100, 'aaa');
  const y = pres('y', 0, 0, 100, 'bbb');
  const f = orderLog([y, x]);
  check('identical timestamps break on hash', JSON.stringify(f.map((e) => e.id)) === JSON.stringify(['x', 'y']),
    f.map((e) => e.id));
  check('ordering is stable regardless of input order',
    JSON.stringify(orderLog([x, y]).map((e) => e.id)) === JSON.stringify(orderLog([y, x]).map((e) => e.id)));
}
check('orderLog does not mutate its input', (() => {
  const arr: LogEntry[] = [pres('z', 0, 0, 900), pres('a', 0, 0, 100)];
  orderLog(arr);
  return arr[0].id === 'z';
})());

// --- Presence and expiry ---------------------------------------------------
{
  const s = foldShoal([pres('a', 1000, 1000, 0)], 1_000);
  check('a swimmer appears in the fold', s.fish.has('a'), [...s.fish.keys()]);
  check('a new swimmer starts at START_SIZE', s.fish.get('a')!.size === START_SIZE, s.fish.get('a')!.size);
}
{
  // Beyond the TTL with no further writes, the swimmer is gone.
  const s = foldShoal([pres('a', 1000, 1000, 0)], PRESENCE_TTL_MS + TICK_MS);
  check('a stale swimmer leaves the fold', !s.fish.has('a'), [...s.fish.keys()]);
}
{
  // Last-write-wins: only the newest vector matters, not the history.
  const s = foldShoal([pres('a', 100, 100, 0), pres('a', 900, 900, 1_000)], 1_500);
  const f = s.fish.get('a')!;
  check('last write wins on position', f.vec.x === 900 && f.vec.y === 900, f.vec);
}

// --- Hunger ----------------------------------------------------------------
{
  // Hand arithmetic: hunger ticks every HUNGER_TICK_INTERVAL fold ticks, each
  // costing HUNGER_AMOUNT. Over 8000 ms at TICK_MS=250 there are 32 fold ticks
  // and therefore 8 hunger ticks, so 8 size lost.
  const ticks = Math.floor(8_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const expected = START_SIZE - hungerTicks * HUNGER_AMOUNT;
  const s = foldShoal([pres('a', 1000, 1000, 0)], 8_000);
  check('hunger eats size while present', s.fish.get('a')!.size === expected,
    { got: s.fish.get('a')!.size, expected, hungerTicks });
}
{
  // Hunger must never push a fish below the floor.
  const s = foldShoal([pres('a', 1000, 1000, 0)], PRESENCE_TTL_MS - TICK_MS);
  check('hunger never drops below the floor', s.fish.get('a')!.size >= MIN_SIZE, s.fish.get('a')!.size);
}

// --- Eating ----------------------------------------------------------------
{
  // A never-visited cell far from the swimmer's approach is ready immediately.
  const cell = 700;
  const c = cellCentre(cell);
  const log: LogEntry[] = [pres('a', c.x, c.y, 0), eat('a', cell, 500)];
  const s = foldShoal(log, 1_000);
  // Hand arithmetic: 4 fold ticks to t=1000, 1 hunger tick, so -1.
  const hungerTicks = Math.floor(Math.floor(1_000 / TICK_MS) / HUNGER_TICK_INTERVAL);
  const expected = START_SIZE + BITE_GROWTH - hungerTicks * HUNGER_AMOUNT;
  check('a credited bite grows the fish', s.fish.get('a')!.size === expected,
    { got: s.fish.get('a')!.size, expected });
}
{
  // A bite claimed somewhere the fish is not does NOT credit.
  const cell = 700;
  const far = cellCentre(50);
  const log: LogEntry[] = [pres('a', far.x, far.y, 0), eat('a', cell, 500)];
  const s = foldShoal(log, 1_000);
  check('a bite claimed away from the fish does not credit',
    s.fish.get('a')!.size < START_SIZE + BITE_GROWTH, s.fish.get('a')!.size);
}

// --- Determinism -----------------------------------------------------------
{
  // Shuffling the input log must not change the folded outcome at all.
  const c = cellCentre(700);
  const log: LogEntry[] = [
    pres('a', c.x, c.y, 0), pres('b', c.x + 10, c.y, 0), pres('c', c.x, c.y + 10, 0),
    eat('a', 700, 3_000), pres('a', c.x, c.y, 4_000), eat('b', 700, 3_500),
  ];
  const forward = foldShoal(log, 6_000);
  const backward = foldShoal([...log].reverse(), 6_000);
  const key = (s: typeof forward) =>
    JSON.stringify([...s.fish.entries()].sort().map(([k, v]) => [k, v.size, v.x, v.y]));
  check('a shuffled log folds identically', key(forward) === key(backward),
    { forward: key(forward), backward: key(backward) });
}

// --- bodiesOf --------------------------------------------------------------
{
  const s = foldShoal([pres('a', 100, 200, 0), pres('b', 300, 400, 0)], 500);
  const bodies = bodiesOf(s);
  check('bodiesOf returns one body per live fish', bodies.length === 2, bodies.length);
  check('bodiesOf is sorted by id', bodies[0].id === 'a' && bodies[1].id === 'b', bodies.map((b) => b.id));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd shoal-client && npx tsx src/lib/shoalEngine.test.ts
```

Expected: FAIL — `Cannot find module './shoalEngine'`.

- [ ] **Step 3: Write the implementation**

Create `shoal-client/src/lib/shoalEngine.ts`:

```ts
/**
 * The fold: an ordered log becomes a world.
 *
 * Presence is last-write-wins per swimmer with a TTL, so a shoal of twenty
 * folds to twenty rows no matter how long the session has run. Size folds from
 * durable eat-claims, which credit only when the deterministic bloom map had
 * food there and the claimant was not taken by the covering sweep — so being
 * scattered costs zero writes. The world simply stops crediting a fish that was
 * out alone.
 */
import { reckon } from './fixed';
import { type Body } from './shelter';
import { stepTension, topContributor, outsideCore } from './tension';
import { hushPhase, shouldStartHush, isResolveTick, selectTaken } from './sweep';
import { markVisits, canEat, cellCentre } from './bloom';
import type { LogEntry, ShoalState, Fish } from './shoalTypes';
import {
  TICK_MS, PRESENCE_TTL_MS, START_SIZE, MIN_SIZE, BITE_GROWTH, SCATTER_COST,
  HUNGER_TICK_INTERVAL, HUNGER_AMOUNT, BLOOM_BITES, VOID_WINDOW_MS, LOCK_MS,
} from './shoalConst';

/**
 * Total order over the log: authoring ms, then content hash.
 *
 * The hash tiebreak is not decoration. Two writes can share a millisecond, and
 * without a total order two clients sort them differently and diverge.
 */
export function orderLog(entries: readonly LogEntry[]): LogEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.ms !== b.ms) return a.ms - b.ms;
    return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
  });
}

/** A world with nobody in it. */
export function emptyState(startMs: number): ShoalState {
  return {
    nowMs: startMs,
    fish: new Map(),
    tension: 0,
    hushStartMs: -1,
    lockedPositions: null,
    lastTaken: [],
    lastSweepMs: -1,
    lastVisit: new Map(),
    bitesTaken: new Map(),
    bloomSinceMs: new Map(),
  };
}

/** Live fish as bodies, sorted by id so every caller sees the same order. */
export function bodiesOf(state: ShoalState): Body[] {
  const out: Body[] = [];
  for (const f of state.fish.values()) out.push({ id: f.id, x: f.x, y: f.y, size: f.size });
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function clampSize(n: number): number {
  return n < MIN_SIZE ? MIN_SIZE : n;
}

/**
 * Fold the log forward to `untilMs`, advancing in fixed TICK_MS steps.
 *
 * The tick is fixed rather than event-driven because hunger, tension and the
 * hush all advance with time, not with writes — an idle sea still gets hungry
 * and still calms down.
 */
export function foldShoal(entries: readonly LogEntry[], untilMs: number): ShoalState {
  const log = orderLog(entries);
  const state = emptyState(log.length > 0 ? log[0].ms : 0);
  const outsideTicks = new Map<string, number>();
  let cursor = 0;
  let tickCount = 0;

  for (let t = state.nowMs; t <= untilMs; t += TICK_MS) {
    state.nowMs = t;

    // 1. Apply every entry authored at or before this tick.
    while (cursor < log.length && log[cursor].ms <= t) {
      const e = log[cursor++];
      if (e.kind === 'presence') {
        const existing = state.fish.get(e.id);
        state.fish.set(e.id, {
          id: e.id,
          x: e.vec.x,
          y: e.vec.y,
          size: existing ? existing.size : START_SIZE,
          vec: e.vec,
          expiresMs: e.ms + PRESENCE_TTL_MS,
          lastScatterMs: existing ? existing.lastScatterMs : -1,
          lastBiteMs: existing ? existing.lastBiteMs : -1,
        });
      } else {
        const f = state.fish.get(e.id);
        if (!f) continue; // a bite from a fish with no live presence never credits
        const ok = canEat({
          lastVisit: state.lastVisit,
          bitesTaken: state.bitesTaken,
          cell: e.cell,
          fishX: f.x,
          fishY: f.y,
          lastBiteMs: f.lastBiteMs,
          nowMs: e.ms,
        });
        if (!ok) continue;
        state.bitesTaken.set(e.cell, (state.bitesTaken.get(e.cell) ?? 0) + 1);
        f.size = f.size + BITE_GROWTH;
        f.lastBiteMs = e.ms;
      }
    }

    // 2. Drop expired presence, then dead-reckon everyone forward.
    for (const [id, f] of [...state.fish]) {
      if (t > f.expiresMs) { state.fish.delete(id); outsideTicks.delete(id); continue; }
      const p = reckon(f.vec, t);
      f.x = p.x;
      f.y = p.y;
    }

    const bodies = bodiesOf(state);

    // 3. Blooms: mark where the school has been, and reset exhausted cells
    //    whose bloom has regrown.
    markVisits(state.lastVisit, bodies, t);
    for (const [cell, used] of [...state.bitesTaken]) {
      if (used >= BLOOM_BITES && (state.lastVisit.get(cell) ?? -Infinity) >= t) {
        state.bitesTaken.delete(cell);
      }
    }

    // 4. Tension, and who has been out in the open longest.
    const out = new Set(outsideCore(bodies));
    for (const b of bodies) {
      outsideTicks.set(b.id, out.has(b.id) ? (outsideTicks.get(b.id) ?? 0) + 1 : 0);
    }
    state.tension = stepTension(state.tension, bodies);

    // 5. The hush.
    if (shouldStartHush(state.tension, state.hushStartMs)) {
      state.hushStartMs = t;
      state.lockedPositions = null;
    }
    if (state.hushStartMs >= 0) {
      // Lock inputs the moment the commit window closes.
      if (state.lockedPositions === null && t - state.hushStartMs >= LOCK_MS) {
        state.lockedPositions = new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y, size: b.size }]));
      }
      if (isResolveTick(state.hushStartMs, t, TICK_MS)) {
        const locked: Body[] = state.lockedPositions
          ? [...state.lockedPositions.entries()]
              .map(([id, p]) => ({ id, x: p.x, y: p.y, size: p.size }))
              .sort((a, b) => (a.id < b.id ? -1 : 1))
          : bodies;
        const preferred = topContributor(locked, outsideTicks);
        const taken = selectTaken(locked, preferred);
        for (const id of taken) {
          const f = state.fish.get(id);
          if (!f) continue;
          f.size = clampSize(f.size - SCATTER_COST);
          f.lastScatterMs = t;
          // Void the food this fish took in the run-up: being caught costs you
          // what you were out there for.
          if (f.lastBiteMs >= 0 && t - f.lastBiteMs <= VOID_WINDOW_MS) {
            f.size = clampSize(f.size - BITE_GROWTH);
          }
        }
        state.lastTaken = taken;
        state.lastSweepMs = t;
        state.tension = 0;
        state.hushStartMs = -1;
        state.lockedPositions = null;
      }
    }

    // 6. Hunger — but only while present, never while away.
    tickCount++;
    if (tickCount % HUNGER_TICK_INTERVAL === 0) {
      for (const f of state.fish.values()) {
        if (f.lastBiteMs >= 0 && t - f.lastBiteMs < HUNGER_TICK_INTERVAL * TICK_MS) continue;
        f.size = clampSize(f.size - HUNGER_AMOUNT);
      }
    }
  }

  state.nowMs = untilMs;
  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/shoalEngine.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0. If the hunger arithmetic is off by one tick, do not adjust the test to match the code — recompute the expected value by hand and fix whichever side is actually wrong.

- [ ] **Step 5: Mutation-verify hunger, ordering, and eat-position**

One at a time, reverting after each:

1. Remove hunger entirely (delete the `tickCount % HUNGER_TICK_INTERVAL` block).
   Expected: `FAIL  hunger eats size while present`. **This is the most important
   mutation in the plan** — hunger is the rule that stops the permanent turtled
   ball, and a vacuous test here would let it be silently removed later.
2. In `orderLog`, drop the hash tiebreak (`return 0;` when `ms` matches).
   Expected: `FAIL  identical timestamps break on hash`.
3. In the eat branch of `foldShoal`, pass `fishX: cellCentre(e.cell).x, fishY: cellCentre(e.cell).y`
   instead of the fish's real position.
   Expected: `FAIL  a bite claimed away from the fish does not credit`.

Revert all and confirm `ALL PASS`.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/shoalEngine.ts shoal-client/src/lib/shoalEngine.test.ts
git commit -m "feat(shoal): the fold - presence, hunger, blooms, and the sweep"
```

---

### Task 8: Determinism and the turtle proof

**Files:**
- Create: `shoal-client/src/lib/shoalEngine.determinism.test.ts`
- Modify: `shoal-client/package.json` (verify the `test` script runs clean end to end)

**Interfaces:**
- Consumes: `shoalEngine.ts`, `shoalConst.ts`, `bloom.ts`.
- Produces: nothing — this task is verification only.

- [ ] **Step 1: Write the determinism and equilibrium test**

Create `shoal-client/src/lib/shoalEngine.determinism.test.ts`:

```ts
/**
 * Determinism and equilibrium. Run: npx tsx src/lib/shoalEngine.determinism.test.ts
 *
 * These are the release blockers. A recorded session must replay identically,
 * and the turtled-ball equilibrium must be demonstrably absent — including a
 * control run proving the test can actually detect it.
 */
import { foldShoal } from './shoalEngine';
import type { LogEntry, Presence, EatClaim } from './shoalTypes';
import { cellCentre } from './bloom';
import { START_SIZE, MIN_SIZE, TICK_MS, HUNGER_TICK_INTERVAL, HUNGER_AMOUNT } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/** Deterministic pseudo-random, seeded — Math.random is banned in this engine. */
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

const fingerprint = (s: ReturnType<typeof foldShoal>) =>
  JSON.stringify({
    fish: [...s.fish.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, v.size, v.x, v.y]),
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

  // Independent expectation: 80_000/250 = 320 ticks, /4 = 80 hunger ticks,
  // so 80 lost from 100 — floored at MIN_SIZE.
  const ticks = Math.floor(80_000 / TICK_MS);
  const hungerTicks = Math.floor(ticks / HUNGER_TICK_INTERVAL);
  const expected = Math.max(MIN_SIZE, START_SIZE - hungerTicks * HUNGER_AMOUNT);

  let allStarved = true;
  for (const f of s.fish.values()) if (f.size !== expected) allStarved = false;
  check('an idle ball starves', allStarved, { expected, sizes: [...s.fish.values()].map((f) => f.size).slice(0, 4) });
  check('the idle ball lost real size', expected < START_SIZE, { expected, START_SIZE });

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
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
cd shoal-client && npx tsx src/lib/shoalEngine.determinism.test.ts
```

Expected: all `ok`, then `ALL PASS`, exit 0.

- [ ] **Step 3: Mutation-verify the turtle proof end to end**

Set `HUNGER_AMOUNT = 0` in `shoalConst.ts` and re-run.

Expected: `FAIL  an idle ball starves` **and** `FAIL  the idle ball lost real size`.

This is the single most important verification in the plan. If the suite still passes with hunger disabled, the turtle proof is decorative and the design's fatal flaw could be reintroduced without any test noticing.

Revert and confirm `ALL PASS`.

- [ ] **Step 4: Run the whole suite**

```bash
cd shoal-client && npm test
```

Expected: all eight test files run in order, every one printing `ALL PASS`, overall exit 0.

- [ ] **Step 5: Confirm no banned calls survived**

```bash
cd shoal-client && grep -rnE 'Math\.(random|cos|sin|tan)|Date\.now|new Date' src/lib/ --include='*.ts' | grep -v 'fixed.ts'
```

Expected: **no output.** The only permitted `Math.cos`/`Math.sin` calls are inside `fixed.ts`'s one-time table construction. Any other hit is a determinism bug and must be removed before commit.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/shoalEngine.determinism.test.ts
git commit -m "test(shoal): determinism replay and the turtle proof"
```

---

## Self-Review

**Spec coverage.** Every rule in spec §2 that is fold logic has a task: shelter and the floor of three (Task 3), tension with capped contribution and the preferred target (Task 4), the hush window and absolute-threshold sweep (Task 5), rivalrous blooms on a fallow grid (Task 6), hunger, size, scatter cost and eat crediting (Task 7), determinism (Task 8). Consensus/policy separation is enforced by the structure of `shoalConst.ts` (Task 1).

**Deferred to later plans, by design:** dead-reckoned rendering, the four verbs, and the action-timer refund (Plan 2 — the refund is a client mechanism, not fold logic, though its invariant is listed in spec §2.12); wild fish, terrain and the tether (Plan 3); shallows, vouching, tides, split/merge and marks (Plan 4). The spec's `size senses` rule — a larger fish feeling the hush earlier — is presentation and belongs in Plan 3.

**Placeholders:** none. Every step contains runnable code or an exact command with an expected result.

**Type consistency:** `Body` is defined once in `shelter.ts` and imported everywhere else. `ShoalState` and `Fish` are defined once in `shoalTypes.ts`. `foldShoal` returns `ShoalState`; `bodiesOf` takes `ShoalState` and returns `Body[]`; `selectTaken` takes `Body[]` and returns `string[]`. `topContributor` and `selectTaken` agree on `string | null` for the preferred id.

**Known rough edge for the implementer:** the exact hunger arithmetic in Task 7 Step 4 depends on tick alignment. The expected values in the test are computed independently from the constants, so if the two disagree, work out by hand which is right — do not relax the test to match the code.
