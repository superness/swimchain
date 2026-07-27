# The Shoal — Epochs, Checkpoints, and the Incremental Fold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fold cover exactly one epoch seeded by a checkpoint, so a late joiner computes the same world as a veteran, fold cost is bounded regardless of the sea's age, and the shell can advance state a tick at a time instead of re-folding.

**Architecture:** Extends the merged engine in `shoal-client/src/lib/`. Three additions — an explicit grid-aligned epoch origin, a `Checkpoint` that carries the only state crossing an epoch boundary (size), and an incremental `foldTick` that the existing `foldShoal` is redefined in terms of. No UI, no network, no I/O; everything stays a pure integer fold.

**Tech Stack:** TypeScript 5.3, `tsx` assertion tests, same conventions as the merged engine.

## Global Constraints

- **Integer math only. No floating point.** Only `fixed.ts` may call `Math.cos`/`Math.sin`, in its one-time table construction.
- **No wall-clock reads.** No `Date.now()`, `new Date()`, or `Math.random()` in `src/lib/`, including tests. Time enters only as explicit parameters. Use the seeded LCG in `shoalEngine.determinism.test.ts` where randomness is needed.
- **Consensus constants are permanent.** Anything added to `shoalConst.ts`'s CONSENSUS block re-scores all history if changed. `EPOCH_MS` is consensus. `MAX_FOLD_TICKS` is policy and stays policy.
- **Tests compute expected values independently of the code under test** — hand arithmetic written out in a comment, or a from-scratch loop. Never adjust a test's expectation to match what the code produced; work out by hand which side is wrong.
- **Every load-bearing test must be mutation-verified**: break the implementation in the exact way the test names, confirm the test FAILS with real verbatim output, revert, confirm ALL PASS. Evidence that could not have come from the committed code is worse than no evidence.
- `npm test` from `shoal-client` runs `tsc --noEmit` first, then all test files. It must stay green and typecheck-clean.
- Governing decision: **spec §3.9** in `docs/superpowers/specs/2026-07-27-the-shoal-design.md`. Read it before Task 1.

---

## File Structure

| File | Change |
|---|---|
| `shoal-client/src/lib/shoalConst.ts` | Add `EPOCH_MS` (CONSENSUS) |
| `shoal-client/src/lib/epoch.ts` | **New.** Epoch arithmetic: which epoch an ms belongs to, where an epoch starts |
| `shoal-client/src/lib/shoalTypes.ts` | Add `Checkpoint`; `ShoalState` gains `epoch` |
| `shoal-client/src/lib/checkpoint.ts` | **New.** Build a checkpoint from state, seed state from one, canonical serialisation |
| `shoal-client/src/lib/shoalEngine.ts` | Explicit epoch origin; extract `foldTick`; redefine `foldShoal` over it; prune `departed` |

Tests alongside each, `.test.ts`, added to `package.json`'s `test` script.

---

### Task 1: Epoch arithmetic

**Files:**
- Modify: `shoal-client/src/lib/shoalConst.ts`
- Create: `shoal-client/src/lib/epoch.ts`
- Test: `shoal-client/src/lib/epoch.test.ts`
- Modify: `shoal-client/package.json` (add `epoch.test.ts` to the `test` script, before `shoalEngine.test.ts`)

**Interfaces:**
- Consumes: `TICK_MS` from `shoalConst.ts`.
- Produces: `EPOCH_MS`, `epochOf(ms): number`, `epochStartMs(epoch): number`, `epochEndMs(epoch): number`, `isEpochBoundary(ms): boolean`.

- [ ] **Step 1: Add the constant**

In `shoalConst.ts`, inside the **CONSENSUS** block (not policy), after the hush section:

```ts
// --- Epochs ----------------------------------------------------------------
/**
 * The fold covers exactly one epoch, seeded by the previous epoch's checkpoint
 * (spec section 3.9). One hour. Chosen so fold cost is bounded at
 * EPOCH_MS / TICK_MS = 14_400 ticks regardless of how old the sea is, and so a
 * swimmer who steps away for less than an hour keeps their size.
 * Arbitrary-but-practical: an hour is a session, not an optimised value.
 */
export const EPOCH_MS = 3_600_000;
```

- [ ] **Step 2: Write the failing test**

Create `shoal-client/src/lib/epoch.test.ts`:

```ts
/**
 * Epoch arithmetic. Run: npx tsx src/lib/epoch.test.ts
 *
 * The grid must be absolute, not relative to any log. Anchoring the tick grid
 * to the first entry a client happened to hold is what made two clients fold
 * different worlds from the same live entries (spec section 3.9).
 */
import { epochOf, epochStartMs, epochEndMs, isEpochBoundary } from './epoch';
import { EPOCH_MS, TICK_MS } from './shoalConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// EPOCH_MS is 3_600_000. By hand: ms 0 is epoch 0; one ms short of an hour is
// still epoch 0; exactly an hour is epoch 1.
check('time zero is epoch zero', epochOf(0) === 0, epochOf(0));
check('one ms before the boundary is the earlier epoch', epochOf(EPOCH_MS - 1) === 0, epochOf(EPOCH_MS - 1));
check('the boundary itself starts the next epoch', epochOf(EPOCH_MS) === 1, epochOf(EPOCH_MS));
check('an arbitrary later time lands correctly', epochOf(3 * EPOCH_MS + 17) === 3, epochOf(3 * EPOCH_MS + 17));

// Starts and ends. Epoch 3 spans [3*EPOCH_MS, 4*EPOCH_MS).
check('epoch start is the multiple', epochStartMs(3) === 3 * EPOCH_MS, epochStartMs(3));
check('epoch end is the next multiple', epochEndMs(3) === 4 * EPOCH_MS, epochEndMs(3));
check('end of one epoch is the start of the next', epochEndMs(3) === epochStartMs(4));

// Round trip: any ms lands inside its own epoch's span.
{
  let ok = true;
  for (const ms of [0, 1, EPOCH_MS - 1, EPOCH_MS, 7 * EPOCH_MS + 999]) {
    const e = epochOf(ms);
    if (!(epochStartMs(e) <= ms && ms < epochEndMs(e))) ok = false;
  }
  check('every ms lies within its own epoch span', ok);
}

// The grid must be tick-aligned, or the fold's tick loop straddles boundaries.
// By hand: 3_600_000 / 250 = 14_400, an exact integer.
check('an epoch is a whole number of ticks', EPOCH_MS % TICK_MS === 0, { EPOCH_MS, TICK_MS });
check('an epoch is 14400 ticks', EPOCH_MS / TICK_MS === 14_400, EPOCH_MS / TICK_MS);

check('a multiple of EPOCH_MS is a boundary', isEpochBoundary(2 * EPOCH_MS) === true);
check('a non-multiple is not a boundary', isEpochBoundary(2 * EPOCH_MS + 1) === false);

// Negative times are not expected but must not silently produce a wrong epoch.
check('negative time floors, it does not truncate toward zero', epochOf(-1) === -1, epochOf(-1));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run it, confirm it fails**

```bash
cd shoal-client && npx tsx src/lib/epoch.test.ts
```

Expected: FAIL — `Cannot find module './epoch'`.

- [ ] **Step 4: Write the implementation**

Create `shoal-client/src/lib/epoch.ts`:

```ts
/**
 * Epoch arithmetic — an absolute grid, independent of any client's log.
 *
 * The fold covers exactly one epoch (spec section 3.9). The grid is absolute
 * so two clients holding different slices of history still agree on where
 * every tick falls; anchoring to the first entry a client happened to hold is
 * precisely what made them diverge.
 */
import { EPOCH_MS } from './shoalConst';

/** Which epoch a timestamp belongs to. Floors, so it is correct below zero. */
export function epochOf(ms: number): number {
  return Math.floor(ms / EPOCH_MS);
}

/** First ms of an epoch, inclusive. */
export function epochStartMs(epoch: number): number {
  return epoch * EPOCH_MS;
}

/** First ms after an epoch, exclusive — i.e. the next epoch's start. */
export function epochEndMs(epoch: number): number {
  return (epoch + 1) * EPOCH_MS;
}

/** True when a timestamp sits exactly on an epoch boundary. */
export function isEpochBoundary(ms: number): boolean {
  return ms % EPOCH_MS === 0;
}
```

- [ ] **Step 5: Run it, confirm ALL PASS**

```bash
cd shoal-client && npx tsx src/lib/epoch.test.ts
```

- [ ] **Step 6: Mutation-verify the floor**

Change `epochOf` to `Math.trunc(ms / EPOCH_MS)`. Re-run.

Expected: `FAIL  negative time floors, it does not truncate toward zero`. Revert, confirm ALL PASS.

- [ ] **Step 7: Wire into the suite and commit**

Add `tsx src/lib/epoch.test.ts &&` to `package.json`'s `test` script, before `shoalEngine.test.ts`. Run `npm test` — all files green, `tsc` clean.

```bash
git add shoal-client/src/lib/epoch.ts shoal-client/src/lib/epoch.test.ts shoal-client/src/lib/shoalConst.ts shoal-client/package.json
git commit -m "feat(shoal): absolute epoch grid"
```

---

### Task 2: The Checkpoint

**Files:**
- Modify: `shoal-client/src/lib/shoalTypes.ts`
- Create: `shoal-client/src/lib/checkpoint.ts`
- Test: `shoal-client/src/lib/checkpoint.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Consumes: `ShoalState`, `Departed` from `shoalTypes.ts`; `epochOf` from `epoch.ts`.
- Produces:
  - `interface Checkpoint { epoch: number; sizes: Array<[string, number]> }` — sorted by id, so it is canonical
  - `checkpointFrom(state: ShoalState, epoch: number): Checkpoint`
  - `serialiseCheckpoint(cp: Checkpoint): string`
  - `parseCheckpoint(text: string): Checkpoint | null`

- [ ] **Step 1: Read the governing decision**

Read spec §3.9. The load-bearing claim you are implementing: **only size crosses an epoch boundary.** Everything else in `ShoalState` is short-lived by construction — `lastVisit` matters for `BLOOM_READY_MS` (45 s), tension and the hush for seconds, `recentBites` for `VOID_WINDOW_MS` (10 s), all far inside one hour.

**Before writing code, verify that claim against the actual `ShoalState`.** Enumerate every field and state, in your report, why it does or does not need to survive a boundary. If you find a field that does need to survive and is not size, **stop and report it** — that is a design finding, not something to work around.

- [ ] **Step 2: Add the type**

In `shoalTypes.ts`:

```ts
/**
 * The only state that crosses an epoch boundary (spec section 3.9).
 *
 * `sizes` is an array of [id, size] pairs sorted by id rather than a Map, so
 * the structure is canonical: two clients that agree on the world produce
 * byte-identical checkpoints, and a Map's insertion order cannot leak in.
 */
export interface Checkpoint {
  epoch: number;
  sizes: Array<[string, number]>;
}
```

Also add `epoch: number` to `ShoalState`, documented as "the epoch this state is folding".

- [ ] **Step 3: Write the failing test**

Create `shoal-client/src/lib/checkpoint.test.ts`:

```ts
/**
 * Checkpoints. Run: npx tsx src/lib/checkpoint.test.ts
 *
 * A checkpoint is what a joining client adopts instead of replaying from
 * genesis, so it must be CANONICAL: two clients that agree on the world must
 * produce byte-identical output, with no Map insertion order leaking in.
 */
import { checkpointFrom, serialiseCheckpoint, parseCheckpoint } from './checkpoint';
import { emptyState } from './shoalEngine';
import type { ShoalState, Fish } from './shoalTypes';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function fish(id: string, size: number): Fish {
  return {
    id, x: 0, y: 0, size,
    vec: { x: 0, y: 0, heading: 0, speed: 0, t: 0 },
    expiresMs: 0, lastScatterMs: -1, lastBiteMs: -1, recentBites: [],
  };
}

/** A state carrying the given live fish, inserted in the given order. */
function stateWith(pairs: Array<[string, number]>): ShoalState {
  const s = emptyState(0);
  for (const [id, size] of pairs) s.fish.set(id, fish(id, size));
  return s;
}

// --- Canonical ordering ----------------------------------------------------
// The same world built in two different insertion orders must serialise
// identically. This is the property the whole design rests on.
{
  const a = stateWith([['zed', 140], ['abe', 100], ['mid', 120]]);
  const b = stateWith([['mid', 120], ['zed', 140], ['abe', 100]]);
  const ca = serialiseCheckpoint(checkpointFrom(a, 7));
  const cb = serialiseCheckpoint(checkpointFrom(b, 7));
  check('insertion order does not change the checkpoint', ca === cb, { ca, cb });
  check('ids are sorted ascending',
    JSON.stringify(checkpointFrom(a, 7).sizes.map((p) => p[0])) === JSON.stringify(['abe', 'mid', 'zed']),
    checkpointFrom(a, 7).sizes);
}

// --- Departed swimmers are included ---------------------------------------
// A swimmer who lapsed still owns their size, so a checkpoint that dropped
// them would reset them to START_SIZE on return — the exact bug spec 2.7 bans.
{
  const s = stateWith([['live', 130]]);
  s.departed.set('gone', { size: 155, lastBiteMs: -1, recentBites: [] });
  const cp = checkpointFrom(s, 2);
  const ids = cp.sizes.map((p) => p[0]);
  check('a departed swimmer is checkpointed', ids.includes('gone'), ids);
  check('their banked size is preserved',
    cp.sizes.find((p) => p[0] === 'gone')![1] === 155, cp.sizes);
}

// --- The epoch is carried --------------------------------------------------
check('the checkpoint records its epoch', checkpointFrom(stateWith([]), 42).epoch === 42);

// --- Round trip ------------------------------------------------------------
{
  const cp = checkpointFrom(stateWith([['a', 100], ['b', 200]]), 5);
  const text = serialiseCheckpoint(cp);
  const back = parseCheckpoint(text);
  check('a checkpoint round-trips through text', back !== null && serialiseCheckpoint(back) === text, text);
  check('the round trip preserves the epoch', back!.epoch === 5, back!.epoch);
  check('the round trip preserves sizes',
    JSON.stringify(back!.sizes) === JSON.stringify(cp.sizes), back!.sizes);
}

// --- Malformed input -------------------------------------------------------
// A hostile or corrupt checkpoint must be rejected, never crash or half-parse.
check('garbage parses to null', parseCheckpoint('not a checkpoint') === null);
check('empty string parses to null', parseCheckpoint('') === null);
check('valid JSON of the wrong shape parses to null', parseCheckpoint('{"epoch":1}') === null);
check('a non-integer size is rejected', parseCheckpoint('{"epoch":1,"sizes":[["a",1.5]]}') === null);
check('an unsorted checkpoint is rejected',
  parseCheckpoint('{"epoch":1,"sizes":[["b",100],["a",100]]}') === null);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 4: Run it, confirm it fails**

- [ ] **Step 5: Write the implementation**

Create `shoal-client/src/lib/checkpoint.ts`. Requirements, in your own code:

- `checkpointFrom` merges live `fish` sizes and `departed` sizes into one array, sorted by id ascending. A live fish and a departed record cannot both exist for the same id (eviction moves one to the other), but if you find they can, treat live as authoritative and note it.
- `serialiseCheckpoint` produces `JSON.stringify` of the object with `sizes` already sorted — canonical because the array order is fixed and both fields are written in a fixed order.
- `parseCheckpoint` returns `null` rather than throwing, for any input that is not a well-formed checkpoint: bad JSON, missing fields, a non-integer epoch or size, a non-string id, or **an array that is not sorted ascending by id**. Rejecting unsorted input is what stops two clients accepting different serialisations of the same world.

- [ ] **Step 6: Run it, confirm ALL PASS**

- [ ] **Step 7: Mutation-verify canonicality**

Two mutations, one at a time, reverting after each:

1. Remove the sort in `checkpointFrom`. Expected: `FAIL  insertion order does not change the checkpoint` **and** `FAIL  ids are sorted ascending`.
2. Remove the sortedness rejection in `parseCheckpoint`. Expected: `FAIL  an unsorted checkpoint is rejected`.

Record real verbatim output for each, then revert and confirm ALL PASS.

- [ ] **Step 8: Wire in and commit**

Add to `package.json`'s `test` script after `epoch.test.ts`. Run `npm test`.

```bash
git add shoal-client/src/lib/checkpoint.ts shoal-client/src/lib/checkpoint.test.ts shoal-client/src/lib/shoalTypes.ts shoal-client/package.json
git commit -m "feat(shoal): canonical epoch checkpoints"
```

---

### Task 3: An explicit epoch origin for the fold

**Files:**
- Modify: `shoal-client/src/lib/shoalEngine.ts`
- Modify: `shoal-client/src/lib/shoalEngine.test.ts`
- Modify: `shoal-client/src/lib/shoalEngine.determinism.test.ts`

**Interfaces:**
- Consumes: `epochOf`, `epochStartMs`, `epochEndMs` from `epoch.ts`; `Checkpoint` from `shoalTypes.ts`.
- Produces: `foldShoal(entries, untilMs, opts?: { epoch?: number; seed?: Checkpoint })` — the tick origin comes from the epoch, never from `log[0].ms`.

- [ ] **Step 1: Understand the defect being fixed**

Today `foldShoal` sets its tick origin from the first log entry (`state.nowMs = log.length > 0 ? log[0].ms : 0`). Two clients holding different slices of history therefore fold on **different tick phases and different accumulated history**. Measured during review: one extra long-expired entry moved a sweep by 1,213 ms and tension by 3,120.

The fix is spec §3.9: the origin is the epoch's start, which is absolute.

- [ ] **Step 2: Write the failing tests**

Add to `shoalEngine.test.ts`, in a new section. Derive every number by hand in a comment.

```ts
// --- The tick origin is absolute, not log-relative --------------------------
// The defect: two clients holding different slices of the same history folded
// on different tick phases. Here, client A additionally holds one long-expired
// entry. Both must produce identical state for the live entries.
{
  const live: LogEntry[] = [
    pres('a', 1000, 1000, EPOCH_MS + 10_000),
    pres('b', 1010, 1000, EPOCH_MS + 10_000),
    pres('a', 1200, 1000, EPOCH_MS + 20_000),
  ];
  const stale = pres('old', 500, 500, EPOCH_MS + 37);
  const untilMs = EPOCH_MS + 40_000;
  const epoch = epochOf(untilMs);

  const withoutStale = foldShoal(live, untilMs, { epoch });
  const withStale = foldShoal([stale, ...live], untilMs, { epoch });

  const key = (s: ShoalState) =>
    JSON.stringify([...s.fish.entries()]
      .filter(([id]) => id !== 'old')
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([k, v]) => [k, v.size, v.x, v.y]));

  check('an extra stale entry does not shift the fold',
    key(withoutStale) === key(withStale), { a: key(withoutStale), b: key(withStale) });
}
// The origin is the epoch start, so every tick lands on the absolute grid.
{
  const untilMs = EPOCH_MS + 1_000;
  const s = foldShoal([pres('a', 100, 100, EPOCH_MS + 500)], untilMs, { epoch: epochOf(untilMs) });
  check('the fold starts at the epoch boundary, not the first entry',
    s.epoch === epochOf(untilMs), s.epoch);
}
```

- [ ] **Step 3: Run, confirm the new checks fail**

They should fail because `foldShoal` does not yet accept `opts` and `ShoalState` has no `epoch`.

- [ ] **Step 4: Implement**

In `shoalEngine.ts`:

- Give `foldShoal` a third parameter `opts?: { epoch?: number; seed?: Checkpoint }`.
- The epoch defaults to `epochOf(untilMs)` when not supplied.
- The tick origin becomes `epochStartMs(epoch)`, **never** `log[0].ms`.
- Entries with `ms` before the epoch start are ignored — they belong to a previous epoch and are already reflected in the seed. Entries after `untilMs` are ignored as before.
- `emptyState` gains the epoch and initialises `epoch`.
- Keep `MAX_FOLD_TICKS` as the guard; note in a comment that with an epoch origin the span can no longer exceed one epoch, so the guard is now a backstop rather than a live limit.

- [ ] **Step 5: Run the full suite**

`npm test`. **Existing tests will need their `untilMs` reinterpreted** — many pass small values like `1000`, which now sit in epoch 0 starting at ms 0, so behaviour should be unchanged for them. If any existing test breaks, **work out by hand whether the test or the new code is wrong before touching either**, and report which.

- [ ] **Step 6: Mutation-verify**

Revert the origin to `log[0].ms`. Expected: `FAIL  an extra stale entry does not shift the fold`. Record real output, revert, confirm ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add shoal-client/src/lib/shoalEngine.ts shoal-client/src/lib/shoalEngine.test.ts shoal-client/src/lib/shoalEngine.determinism.test.ts
git commit -m "feat(shoal): fold from an absolute epoch origin"
```

---

### Task 4: Seeding from a checkpoint, and pruning `departed`

**Files:**
- Modify: `shoal-client/src/lib/shoalEngine.ts`
- Modify: `shoal-client/src/lib/shoalEngine.test.ts`

**Interfaces:**
- Consumes: `Checkpoint`, `checkpointFrom`.
- Produces: `foldShoal(..., { seed })` applies the seed; `departed` prunes at the epoch boundary.

- [ ] **Step 1: Write the failing tests**

Add to `shoalEngine.test.ts`, with hand-derived comments:

```ts
// --- Seeding from a checkpoint ---------------------------------------------
// A joining client adopts the previous epoch's checkpoint instead of replaying
// from genesis. A swimmer named in the seed starts at that size, not START_SIZE.
{
  const epoch = 4;
  const start = epochStartMs(epoch);
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['vet', 175]] };
  const s = foldShoal([pres('vet', 1000, 1000, start + 500)], start + 1000, { epoch, seed });
  // Hand arithmetic: 1000 ms of fold from the epoch start is 5 ticks
  // (t = start, +250, +500, +750, +1000), tickCount 1..5, so one hunger tick
  // at tickCount 4. 175 - 1 = 174.
  check('a seeded swimmer starts at their banked size', s.fish.get('vet')!.size === 174,
    s.fish.get('vet')!.size);
}
{
  // A swimmer absent from the seed is new and starts at START_SIZE.
  const epoch = 4;
  const start = epochStartMs(epoch);
  const seed: Checkpoint = { epoch: epoch - 1, sizes: [['other', 900]] };
  const s = foldShoal([pres('new', 1000, 1000, start + 500)], start + 1000, { epoch, seed });
  check('an unseeded swimmer starts fresh', s.fish.get('new')!.size === START_SIZE - 1,
    s.fish.get('new')!.size);
}
{
  // A checkpoint from the wrong epoch must be refused, not silently applied —
  // adopting stale sizes would hand a client a different world to everyone else.
  const epoch = 4;
  const start = epochStartMs(epoch);
  const stale: Checkpoint = { epoch: epoch - 5, sizes: [['vet', 900]] };
  let threw = false;
  try { foldShoal([pres('vet', 1, 1, start)], start + 250, { epoch, seed: stale }); }
  catch { threw = true; }
  check('a checkpoint from the wrong epoch is refused', threw === true);
}

// --- departed prunes at the boundary ---------------------------------------
// An hour away is forgiveable; longer is a fresh start (spec 3.9 point 6).
// A swimmer whose banked record predates the seed epoch is not carried forward.
{
  const s = emptyState(0);
  s.departed.set('recent', { size: 150, lastBiteMs: -1, recentBites: [] });
  const cp = checkpointFrom(s, 3);
  check('a departed swimmer survives one checkpoint',
    cp.sizes.some((p) => p[0] === 'recent'), cp.sizes);
}
```

- [ ] **Step 2: Run, confirm failures**

- [ ] **Step 3: Implement**

- `foldShoal` applies `opts.seed` before folding: each `[id, size]` becomes a `departed` record, so a swimmer who writes presence during the epoch is picked up by the existing `existing ?? state.departed.get(e.id)` path and keeps their size.
- **Throw a `RangeError` if `seed.epoch !== epoch - 1`.** A seed from any other epoch is a bug or an attack; silently accepting it hands this client a different world. Say so in the error message.
- `departed` pruning: a swimmer carried in the seed but who writes no presence during the epoch is **not** included in the next checkpoint. That is the "absent for a full epoch, fresh start" rule, and it falls out naturally if you only carry forward records that were touched — verify that it does, and if it does not, implement it explicitly and say so.

- [ ] **Step 4: Run the full suite, confirm ALL PASS**

- [ ] **Step 5: Mutation-verify**

1. Ignore `opts.seed`. Expected: `FAIL  a seeded swimmer starts at their banked size`.
2. Remove the epoch check on the seed. Expected: `FAIL  a checkpoint from the wrong epoch is refused`.

Real verbatim output for each, revert, ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add shoal-client/src/lib/shoalEngine.ts shoal-client/src/lib/shoalEngine.test.ts
git commit -m "feat(shoal): seed the fold from a checkpoint and prune departed"
```

---

### Task 5: The incremental fold

**Files:**
- Modify: `shoal-client/src/lib/shoalEngine.ts`
- Test: `shoal-client/src/lib/shoalEngine.incremental.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Produces: `foldTick(state: ShoalState, entries: readonly LogEntry[]): ShoalState` — advances state by exactly one `TICK_MS`. `foldShoal` is redefined as a loop over it.

- [ ] **Step 1: Understand why this exists**

The shell will call the fold several times a second on a live session. Re-folding a whole epoch each frame is 14,400 ticks of O(n²) shelter per call. `foldTick` advances one tick from existing state instead.

**The invariant that matters: folding N ticks incrementally must produce byte-identical state to folding N ticks in one call.** If it does not, the shell shows a different world to the engine's own tests, and every determinism guarantee is void.

- [ ] **Step 2: Write the failing test**

Create `shoal-client/src/lib/shoalEngine.incremental.test.ts`. It must:

- Build a session rich enough to fire a hush, a sweep, and credited bites — reuse the shape of `richSession` from `shoalEngine.determinism.test.ts` rather than inventing an inert one. **A test over a world where nothing happens proves nothing**; assert non-degeneracy (`lastSweepMs >= 0`, `lastTaken.length > 0`, `bitesTaken.size > 0`) before comparing.
- Fold the whole thing with `foldShoal`.
- Fold the same log tick-by-tick with `foldTick`.
- Compare with the same fingerprint function the determinism test uses (import it or mirror it exactly, including `lastVisit`, `bloomSinceMs`, `hushStartMs`, `departed`, `lockedPositions`, `lockedPreferred`).
- Assert the two are identical.
- Also assert that stopping partway and resuming produces the same state as folding straight through — that is what the shell actually does.

- [ ] **Step 3: Run, confirm it fails** (no `foldTick`).

- [ ] **Step 4: Implement**

Extract the body of `foldShoal`'s tick loop into `foldTick(state, entries)`. `foldShoal` becomes: build the seeded empty state, then loop `foldTick` from the epoch start to `untilMs`.

**Do not reorder the numbered steps inside the tick.** The order is itself consensus — step 1 before step 3 is what makes a same-tick eat work, step 5 before step 6 is what makes the void arithmetic come out. Keep the numbered comments.

The entry cursor is currently a loop-local. It must move onto `ShoalState` or be derived from `nowMs` each tick, or an incremental caller re-applies entries. Say which you chose and why.

- [ ] **Step 5: Run the full suite**

`npm test`. Every pre-existing test must still pass **unchanged** — `foldShoal`'s behaviour must not move. If any changes, stop and report rather than editing the test.

- [ ] **Step 6: Mutation-verify**

Break `foldTick`'s step ordering (move the hunger block before the sweep block). Expected: the incremental-vs-batch comparison FAILS, and probably several existing checks too. This proves the comparison is real. Record output, revert, confirm ALL PASS.

- [ ] **Step 7: Commit**

```bash
git add shoal-client/src/lib/shoalEngine.ts shoal-client/src/lib/shoalEngine.incremental.test.ts shoal-client/package.json
git commit -m "feat(shoal): incremental foldTick, with foldShoal defined over it"
```

---

## Self-Review

**Spec coverage.** §3.9's six points map to tasks: absolute grid-aligned origin (Tasks 1, 3), bounded epoch (Task 1), only size crosses a boundary (Task 2, verified explicitly in its Step 1), canonical published checkpoints (Task 2), cold-joiner seeding (Task 4), `departed` pruning (Task 4). The incremental-fold seam §3.9 names as plan 2's dependency is Task 5.

**Deliberately not here:** checkpoint publication over the network, checkpoint *selection* when peers offer several, and any UI. Publication belongs with the shell, because it needs the RPC layer; selection needs more than one peer to be meaningful. Both are named in the next plan.

**Placeholders:** none. Tasks 2 and 5 describe requirements rather than giving full code, deliberately — both involve judgement (canonical rejection rules; where the cursor lives) that the implementer should reason about and report, and both have complete test specifications that pin the behaviour.

**Type consistency:** `Checkpoint` is defined once in `shoalTypes.ts`. `foldShoal`'s new third parameter is optional throughout, so every existing call site stays valid. `foldTick` takes and returns `ShoalState`.

**Known risk for the implementer:** Task 3 changes the tick origin, which shifts the absolute times at which hunger fires for any test whose `untilMs` does not start at an epoch boundary. Existing tests use small values that sit in epoch 0 (origin 0), so they should be unaffected — but verify rather than assume, and if one moves, hand-derive which side is right.
