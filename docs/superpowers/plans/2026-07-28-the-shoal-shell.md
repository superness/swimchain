# The Shoal — The Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A window you can open, swim in, and see another real person swimming in — driven by the merged engine and bridge, with nothing of ours running.

**Architecture:** A Tauri app bundling the `sw` node as a sidecar (The Trench's pattern). Inside it, a loop that folds incrementally rather than re-folding a room every frame, a canvas that dead-reckons every swimmer between writes, and four verbs. The tether is in scope because it is what makes the game legible, not decoration.

**Tech Stack:** Tauri 2 + Vite + React (matching `trench-client/`), the merged `shoal-client/src/lib/` engine and bridge, canvas 2D.

## Global Constraints

- **Integer math only in `src/lib/`.** Rendering may use floats freely — it is display, not consensus. The boundary is: anything that feeds `foldShoal`/`foldTick` is integer; anything that only draws is not. State which side each new module is on.
- **No wall-clock reads in `src/lib/`.** The shell owns the clock and passes it in. `src/ui/` may read it.
- **Tests compute expected values independently of the code under test** — hand arithmetic in comments. Never relax a test to match code; work out by hand which side is wrong and report it.
- **Every load-bearing test must be mutation-verified** with real verbatim output, reverted, ALL PASS re-confirmed. **Ten tests across the three merged plans were caught passing while proving nothing** — assume yours will too until a mutation says otherwise.
- **`npm test` runs `tsc --noEmit` first** and must stay clean. It is currently 722 checks across 16 files, all green; every existing check must stay green.
- **The diegetic rule (spec §1.1) is binding and this is the first plan where a player can read anything.** No player-facing text ever says node, chain, space, post, reply, or Swimchain. Sea language only. A single provenance line at the end of the "?" panel is the one exception.
- Read spec §2.4 (verbs), §2.9–§2.12 (failure, the tether, the sweep, the hush), §3.1–§3.5, and **`docs/THE_SHOAL_OPEN_ITEMS.md`** before starting.

## Two open items this plan must close

From `docs/THE_SHOAL_OPEN_ITEMS.md` §8, both of which bite the shell specifically:

1. **`foldShoal` throws a `RangeError` at every epoch end.** A naive `foldShoal(log, Date.now())` hard-throws once an hour until `rollEpoch` is wired. Task 2 owns this.
2. **The incremental fold is currently unreachable.** `fetchRoomLog` returns a fresh array of the whole room every poll, so `foldTick` — merged a plan ago specifically so the shell would not re-fold an epoch per frame — has nothing to consume. Task 2 owns this too.

---

## File Structure

| File | Side |
|---|---|
| `shoal-client/src/lib/shoalLoop.ts` | **consensus-adjacent** — owns fold state, epoch rollover, incremental advance. Integer, no clock. |
| `shoal-client/src/lib/shoalLoop.test.ts` | tests |
| `shoal-client/src/ui/render.ts` | display — draws a `ShoalState` to a canvas. Floats fine. |
| `shoal-client/src/ui/input.ts` | display — pointer/key → an intent `Vec` |
| `shoal-client/src/ui/tether.ts` | display — exposure made visible |
| `shoal-client/src/ui/App.tsx` | wiring |
| `shoal-client/src-tauri/` | the shell, sidecar config, icons |
| `shoal-client/scripts/harness.ts` | headless driver: runs the loop against fixtures, no DOM |

---

### Task 1: The Tauri shell and the sidecar

**Files:** `shoal-client/src-tauri/**`, `shoal-client/vite.config.ts`, `shoal-client/index.html`, `shoal-client/package.json`

- [ ] **Step 1: Copy the pattern, do not invent one**

`trench-client/src-tauri/` is the reference: a Tauri 2 app bundling `sw` as a **resource sidecar**, with a `get_rpc_config` command handing the webview a ready-built `Authorization` header. `shoalRpc.resolveAuth` already understands that shape — read it and match what it expects.

Read `project_the_trench` and `project_release_build_fresh_worktree` before touching the build. Hard-won facts that will otherwise cost hours:

- **The Vite React Fast-Refresh preamble must be excluded from any worker graph** — `react({ exclude: [/\.worker\.ts$/, /swimchain-react/] })`, or you get `window is not defined` inside the worker.
- **Desktop first-run auto-generates the identity password** at `%APPDATA%/<app>/node-key-password.txt`, per network.
- **A Tauri app skips the 10 s parent-envelope wait** — check `window.__TAURI__`.

- [ ] **Step 2: Prove the sidecar actually starts**

Not "the app builds". Launch it and confirm from the app that the node is up and reachable: call `get_info` through the resolved auth and display the network mode and block height. **Paste the real output in your report.** A shell that builds but cannot reach its own node is the failure this step exists to catch.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(shoal): Tauri shell with the node as a bundled sidecar"
```

---

### Task 2: The loop — incremental fold and epoch rollover

**Files:** create `shoal-client/src/lib/shoalLoop.ts`, `shoalLoop.test.ts`; modify `package.json`

**Interfaces:**
- `interface LoopState { state: ShoalState; epoch: number; appliedHashes: Set<string> }`
- `createLoop(epoch: number, seed: Checkpoint | null): LoopState`
- `advance(loop: LoopState, entries: readonly LogEntry[], toMs: number): { loop: LoopState; rolled: Checkpoint | null }`

- [ ] **Step 1: Understand what makes this hard**

The bridge hands you the **whole room** on every refetch, as a fresh array. The engine offers `foldTick` for advancing one tick from existing state. Bridging those two is this task, and it is the reason `foldTick` exists.

Two things must be true:

- **Entries already folded must not be applied twice.** A refetch returns everything again. Deduping on `content_id` (the entry's `hash`) is the obvious approach — verify it is sufficient, and say what happens to an entry that arrives *late*, with an `ms` earlier than ticks you have already folded. That case is real: gossip is not ordered.
- **The epoch must roll.** `foldShoal` throws a `RangeError` past `epochEndMs`. `rollEpoch` publishes a checkpoint; per spec §3.9 there is **exactly one way to start an epoch** — a rollover re-enters through the same warm-up path as a cold joiner. Do not carry live state across.

- [ ] **Step 2: Write the failing test**

- Advancing twice with the same entries produces the same state as advancing once — **the idempotence property**, and the one that stops a refetch double-crediting bites.
- An entry whose `ms` precedes the current tick is handled per whatever rule you chose; assert the rule explicitly and document it. If your rule is "drop it", assert that a dropped entry cannot later resurrect.
- Advancing past an epoch end produces a checkpoint and continues in the next epoch **without throwing**.
- The rolled state matches a cold `foldShoal` of the same log seeded by that checkpoint — **byte-identical fingerprints**, using the fingerprint from `shoalFixtures`. This is the test that catches a rollover that quietly diverges, and #162's own review found exactly that bug.
- Non-degeneracy first: assert a sweep fired and bites credited before comparing, or the comparison proves nothing over an inert world.

- [ ] **Step 3-5: RED, implement, GREEN.**

- [ ] **Step 6: Mutation-verify**

1. Remove the dedupe → the idempotence check must FAIL.
2. Remove the rollover → the epoch-crossing check must FAIL with a `RangeError`.
3. Carry live state across the boundary instead of re-entering the warm-up → the byte-identical check must FAIL.

Real verbatim output each, revert, ALL PASS.

- [ ] **Step 7: Commit**

---

### Task 3: The headless harness

**Files:** create `shoal-client/scripts/harness.ts`; modify `package.json` (`npm run harness`)

- [ ] **Step 1: Why this exists before any rendering**

Rendering is hard to test and easy to fool. The harness runs the **entire loop** — fixtures in, fold advanced, positions dead-reckoned — with no DOM and no canvas, and prints the world as text. It is how every later task checks that what the canvas *should* draw is right, separately from whether it drew it.

It must:
- Drive a scripted session (reuse `richSession`'s shape from `shoalFixtures`) through `advance`.
- Print, per tick or on demand: each swimmer's dead-reckoned position, size, shelter, whether they are exposed, the tension value, and the hush phase.
- Take a `--seed` and be fully deterministic — no wall clock, no randomness.
- Exit non-zero if the fold throws.

- [ ] **Step 2: Run it and paste the output.** A harness whose output nobody has read is not a harness.

- [ ] **Step 3: Commit**

---

### Task 4: Rendering — the sea and the swimmers

**Files:** create `shoal-client/src/ui/render.ts`, `render.test.ts`

- [ ] **Step 1: Separate the geometry from the paint**

The testable part of rendering is the **projection**: world coordinates → screen coordinates, camera, culling, and the dead-reckoned position of each swimmer at a display time between writes. Extract those as pure functions and test them. The paint itself — strokes, gradients, colours — is verified by screenshot, not assertion.

Dead reckoning at display time is the thing that makes motion look continuous when writes are 3–8 s apart. Use `reckon` from the engine — **do not reimplement it**. If you need sub-tick smoothness the engine cannot give, interpolate *on top of* `reckon`'s answer and say so; never fork the reckoning rule.

- [ ] **Step 2: Test the pure parts**

- World → screen is invertible within a pixel for points inside the viewport.
- A swimmer outside the viewport is culled.
- At `t` exactly on a tick, the rendered position equals the engine's; between ticks it is on the segment between consecutive engine answers. Derive both by hand.
- A camera that follows the player keeps them within a stated band of centre.

- [ ] **Step 3: Draw it, then look at it**

Implement the paint. Then **run the app and take a screenshot** showing a sea with several swimmers at distinct positions and sizes. Attach it. Per the standing bar in this repo, correct-and-tested is the floor for a player-facing surface, not the ceiling — a screenshot nobody looked at does not count as verification.

- [ ] **Step 4: Commit**

---

### Task 5: The four verbs

**Files:** create `shoal-client/src/ui/input.ts`, `input.test.ts`; wire into `App.tsx`

- [ ] **Step 1: What the verbs are**

Steer (hold a heading, glide with weight), dart (a short burst on a ~10–12 s cooldown), eat, speak. Spec §2.4. **Dart's cooldown is displayed as prominently as size — it is the second scoreboard**, and the trade-off "spend my escape to reach the bloom first" must be legible at a glance.

Input produces an **intent `Vec`**; `shouldEmit` decides whether it reaches the chain; `sendPresence` writes it. Do not let input write directly — that is the per-frame emitter the whole bridge exists to prevent.

- [ ] **Step 2: Test the pure parts**

- A pointer position maps to a heading in `[0, HEADING_STEPS)` — every octant, hand-derived.
- Dart is refused while on cooldown and permitted after; assert against the cooldown constant, not a literal.
- Speech rides along with the next vector rather than issuing its own write (spec §2.4 — talking must never be why you were caught).
- Releasing input produces a stop intent, not a stale heading.

- [ ] **Step 3-5: RED, implement, GREEN, mutation-verify** the cooldown and the speech-rides-along rule.

- [ ] **Step 6: Play it and screenshot the cooldown**

- [ ] **Step 7: Commit**

---

### Task 6: The tether, the hush, and the scatter

**Files:** create `shoal-client/src/ui/tether.ts`, `tether.test.ts`

- [ ] **Step 1: Why the tether is not decoration**

Spec §2.10. The decision must be made **before** the hush, or the panic moment is a coin flip dressed as a choice. So exposure is permanently visible on the player's own body: a tether to their nearest neighbours, short and taut and warm when tucked in, long and thin and cold as they drift.

One object collapses four legibility problems: what danger is, what the telegraph is, what shielding is, and — after a scatter — why it happened. The design review that produced this game found that *"you were furthest from your neighbours"* is an abstract cause of death, and that unexplained punishment inside the first two minutes is the most reliable quit trigger there is.

The tether reads its numbers from the engine's `shelterOf`/`isExposed` — **never a display-side approximation.** A tether that disagrees with the sweep is worse than none.

- [ ] **Step 2: The three moments**

- **Ambient:** tether length/warmth tracks shelter continuously.
- **The hush:** the water goes quiet, the tether goes red, and per §2.8 a larger fish feels it a beat earlier. The input lock at `LOCK_MS` must be *felt* — after it, the player's actions no longer count, and the last four seconds are dread they can only watch.
- **The scatter:** freeze for two seconds, desaturate, draw every fish's tether at once with the taken fish's the longest. Non-verbal, geometric, unarguable.

The tether **fades with accumulated playtime** (spec §2.10) — legibility beats mystique in the first ten minutes, mystique wins afterwards.

- [ ] **Step 3: Test what can be tested**

- Tether length is a monotone function of shelter — more shelter, shorter tether. Assert against `shelterOf`, hand-derived.
- The exposed/sheltered visual threshold is exactly `SHELTER_THRESHOLD`; assert the boundary on both sides.
- The fade curve reaches "off" at the stated playtime and is monotone.
- The scatter replay picks the fish the engine actually took, not a recomputed guess.

- [ ] **Step 4: Screenshot all three moments.** Ambient, hush, and the frozen scatter replay. This is the task where the game either reads or does not.

- [ ] **Step 5: Mutation-verify** that the tether length tracks `shelterOf` — break the link and confirm the monotonicity test fails.

- [ ] **Step 6: Commit**

---

### Task 7: Two windows, one sea

**Files:** `shoal-client/scripts/two-client-smoke.ts`

- [ ] **Step 1: The proof this whole plan exists for**

Run **two shells**, each against its own node, peered. Each sees the other swim. Assert:

- Both fold to identical fingerprints.
- A `content_new` raised by **gossip** — not local submission — triggers a refetch on the other client. This closes open item §3, which the bridge's smoke could not: both its identities shared one node, so the gossip publisher never fired.
- Positions rendered by A for B match B's own, within the dead-reckoning tolerance you state.

If two nodes cannot be peered in this environment, **say so plainly and report it unverified** rather than claiming a pass. This project has already rejected one report for evidence that could not have come from the run it described.

- [ ] **Step 2: Record it.** A short screen capture or a sequence of screenshots of both windows.

- [ ] **Step 3: Commit**

---

## Self-Review

**Spec coverage.** §2.4 verbs → Task 5. §2.9–2.12 failure/tether/sweep/hush → Task 6. §3.1 shell → Task 1. §3.3 dead reckoning → Tasks 2 and 4. §3.9 epoch rollover → Task 2. Open items §8 → Task 2. Open item §3 (gossip) → Task 7.

**Correction, 2026-07-28 (final whole-branch review).** The "§3.9 epoch rollover → Task 2" claim above is **too strong and was wrong as written**. Task 2 delivers §3.9 points 1–3 — grid-aligned origin, the fixed one-hour era, and the warm-up replay — and `shoalLoop.advance` does compute the boundary checkpoint. But **points 4 and 5 are not covered by any task in this plan**: nothing publishes a checkpoint and nothing adopts one. `chainSea.ts` discards `advance`'s `rolled` and seeds `createLoop` with a hard `null`, so a client that joins after an hour boundary folds an unseeded epoch while one that was already running keeps every size — and since size feeds `selectTaken`, the two disagree about who the shark eats. Recorded as **Blocker 12** in `docs/THE_SHOAL_OPEN_ITEMS.md`, which states the cost and what building it would take. It is plan-3 scale and deliberately out of scope here.

**Deliberately not here:** wild fish, terrain and ambience (plan 3); shallows, vouching, tides, marks (plan 4); sound; the first-run teaching sequence, which needs a playable game to teach against and belongs with plan 3's craft pass; mainnet provisioning.

**Placeholders:** none. Tasks 4–6 specify testable contracts plus screenshot obligations rather than full code, deliberately — the paint is judged by looking, and pretending otherwise produces tests that assert a colour and prove nothing.

**Known risk:** this is the first plan whose deliverable is judged by eye. The pure-function extraction in Tasks 4–6 is what keeps it reviewable; if an implementer finds themselves unable to test something without a canvas, that is a signal the split is wrong, and they should report it rather than writing a test that mocks a rendering context and asserts it was called.
