# The Shoal — Wild Fish and Terrain

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sea an ocean rather than a room with twenty people in it — without letting the fish that are not people become a substitute for the ones that are.

**Architecture:** A wild shoal simulated as a pure function of `(seed, tick, hush)` — no dependency on player positions, so every client computes it identically by construction rather than by discipline. Wild fish count toward shelter, never toward tension, and they **bolt at the hush**. Terrain is hand-authored and display-only.

**Tech Stack:** The merged `shoal-client/` engine, bridge and shell.

## Global Constraints

- **Integer math only in `src/lib/`.** No floats, no wall-clock reads. Display may use both.
- **Tests compute expected values independently of the code under test** — hand arithmetic in comments. Never relax a test to match code; hand-derive which side is wrong and report it.
- **Every load-bearing test must be mutation-verified** with real verbatim output, reverted, ALL PASS reconfirmed. **Thirteen vacuous checks have been caught across six plans** — several were mine, and two were caught by implementers in their own work. Assume yours are vacuous until a mutation says otherwise.
- **`npm test` runs both typechecks and must stay clean.** Currently **1137 checks across 21 files, all green**; every existing check must stay green.
- **The diegetic rule (spec §1.1) is binding.** No player-facing text says node, chain, space, post, reply, or Swimchain.
- Read spec §2.6 (wild fish), §2.13 (terrain), §3.8 (simulating wild fish without an authority), and `docs/THE_SHOAL_OPEN_ITEMS.md` before starting.

---

## A spec correction this plan proposes

**Spec §2.6 says wild fish "count toward shielding and toward tension." This plan implements shielding only, and deliberately not tension.** The reasoning, which the implementer of Task 3 should sanity-check rather than accept:

Tension is the fraction of the shoal outside the core, and crossing its threshold is what summons the predator. The design's whole moral is *"the shark is something the school does to itself"* — greed, measured. If a wild shoal of thirty fish is counted, then wild movement dominates the statistic and the players' own greed stops mattering. The shark would arrive because the scenery drifted.

Shelter is the opposite case: counting wild fish there is exactly what produces the design's best moment. Cover that felt solid evaporates when they bolt, and the crowd you are left standing in is made only of people.

So: **wild fish shelter you, and they do not summon the shark.** If the operator wants the spec's literal reading instead, that is a one-line change — but it should be a decision, not an accident.

---

## Two rulings that make determinism free rather than fragile

**1. Wild fish do not see players.** Spec §3.8 requires every client to simulate them identically, and warns that stepping them on live presence would diverge because clients hold different in-flight views. Rather than solving that with a lock discipline, this plan removes the dependency: a wild fish's next position is a pure function of `(seed, tickIndex, hushStartMs)`. All three are already consensus values every client agrees on. Determinism then holds *by construction*, and no snapshot, no settling delay and no reconciliation is needed.

The cost is that wild fish do not flee from players or follow them. Judge whether that reads as dead scenery when you see it — and if it does, say so rather than reaching for player positions, because that is the door §3.8 exists to keep shut.

**2. Wild fish do not touch the bloom map and are never taken by the sweep.** They do not eat and do not trample, so the bloom map stays a pure function of *player* behaviour — which is what "food grows where the school isn't" means. And because they bolt at the hush, they are gone before a sweep resolves, so `selectTaken` never sees them.

Both rulings shrink the consensus surface to almost nothing: the wild shoal is derived, not stored, and nothing about it enters a checkpoint.

---

## File Structure

| File | Side |
|---|---|
| `shoal-client/src/lib/shoalFixtures.ts` | widen `fingerprint` (Task 1) |
| `shoal-client/src/lib/wild.ts` | **consensus** — the wild shoal, pure and integer |
| `shoal-client/src/lib/wild.test.ts` | tests |
| `shoal-client/src/lib/shelter.ts` | wild bodies enter shelter (Task 3) |
| `shoal-client/src/ui/terrain.ts` | display — hand-authored places |
| `shoal-client/src/ui/seaPaint.ts` | draw wild fish and terrain |

---

### Task 1: Widen the fingerprint

**Files:** modify `shoal-client/src/lib/shoalFixtures.ts`; modify whichever tests assert on it.

- [ ] **Step 1: Why this comes first**

`fingerprint` is what every determinism check on this project compares. It deliberately omits `outsideTicks` and `touchedIds` (`shoalFixtures.ts:121-122`). Those are **two of the three fields** spec §3.9 measured a carried epoch continuation diverging on — and `outsideTicks` feeds `topContributor` → `lockedPreferred` → `selectTaken`, i.e. **who the shark eats**.

So a divergence confined to `outsideTicks` is player-visible and invisible to every determinism check we have. This is open item 8, and the shell's review said to close it before wild fish arrive — not because wild fish touch either field (they touch neither: `outsideTicks` is written in `foldTick` step 4 from `bodiesOf(state)`, swimmers only, and `touchedIds` is written only on an applied presence entry, whose ids are always a swimmer's own public key), but so the fold's existing divergence-detection gap is closed before a second, unrelated feature starts landing on top of it, rather than compounding an open item with a new one.

- [ ] **Step 2: Widen it**

Add `outsideTicks` and `touchedIds`, both canonically sorted like the existing entries. Leave `cursor`, `tickCount`, `nowMs` and `epoch` out and say why in the comment — they are position-in-the-fold, not world state, and two clients folding to the same `toMs` by different call paths legitimately differ in them.

- [ ] **Step 3: Prove the widening is load-bearing**

Add a determinism check that **perturbs only `outsideTicks`** and confirm the fingerprint moves. Then mutation-verify: remove the new field and confirm that check fails. If you cannot construct a perturbation that a real fold could produce, say so — a field in the fingerprint that no reachable state can vary is decoration.

- [ ] **Step 4: Run the full suite.** Existing determinism checks compare fingerprints to each other, so widening should not break them — if one moves, hand-derive which side is right.

- [ ] **Step 5: Commit**

---

### Task 2: The wild shoal

**Files:** create `shoal-client/src/lib/wild.ts`, `wild.test.ts`; modify `package.json`

**Interfaces:**
- `interface WildFish { id: string; x: number; y: number; heading: number; size: number }`
- `wildAt(seed: number, tickIndex: number, hushStartMs: number, nowMs: number): WildFish[]`
- `WILD_COUNT` and any shape constants, in a clearly marked **CONSENSUS** block.

- [ ] **Step 1: Design the motion**

A wild fish's position must be a pure function of its index and the tick. The obvious shape is a closed-form orbit or a seeded pseudo-random walk that can be evaluated at any tick without iterating from zero — **evaluating from zero would make cost grow with session length**, which is the trap `foldTick` exists to avoid elsewhere.

Use the integer trig table in `fixed.ts`; do not add a second one. No `Math.random` — derive everything from `seed` and the index.

Wild fish must **shoal**: cluster loosely, drift together, not scatter uniformly across the map. A wild shoal that looks like evenly-spaced dots reads as debug output, not an ocean.

- [ ] **Step 2: The bolt**

When `hushStartMs >= 0`, wild fish flee. By the time the sweep resolves at `T+HUSH` they must be **gone** — not merely moving away. This is the design's best moment: *"cover that felt solid a second ago evaporates exactly when it matters, and the crowd you are left standing in is made only of people."*

Decide what "gone" means (removed from the returned array, or fled beyond any shelter radius) and say which. It must be unambiguous, because Task 3 makes shelter depend on it.

- [ ] **Step 3: Write the failing tests**

- **Determinism:** the same `(seed, tick, hush)` yields byte-identical output, and two different call orders agree. Hand-derive at least one fish's position at one tick rather than comparing the function to itself.
- **No player dependency:** the signature cannot take player state — assert structurally, by reading the module's own source for forbidden imports, the way `input.test.ts` does.
- **Evaluable at any tick without iteration:** `wildAt(s, 100_000, …)` costs the same as `wildAt(s, 1, …)`. Measure it.
- **They shoal:** at a given tick, the mean pairwise distance is well below what uniform scatter would give. Derive the uniform baseline by hand.
- **The bolt:** at `hushStart + HUSH_MS` no wild fish is within `SHELTER_R` of any point that had one at `hushStart - 1`.
- **Integer purity:** every returned coordinate is an integer.

- [ ] **Step 4: RED, implement, GREEN.**

- [ ] **Step 5: Mutation-verify** the determinism check (introduce a `Math.random`) and the bolt (remove the flee), each with real verbatim output, reverted, ALL PASS.

- [ ] **Step 6: Commit**

---

### Task 3: Wild fish shelter you

**Files:** modify `shoal-client/src/lib/shelter.ts` (or its call sites); modify `shoalEngine.ts` where `bodies` is assembled; tests alongside.

- [ ] **Step 1: The seam**

`shelterOf`, `outsideCore`, `markVisits`, `selectTaken` and the tether all currently consume one population. Wild fish must enter **shelter only**. Work out where to inject them so that:

- `shelterOf` and `isExposed` see wild bodies.
- `outsideCore` / `spreadPerMille` — the tension path — **do not**.
- `markVisits` does not (they do not trample).
- `selectTaken` does not (they bolt before it resolves, but assert it rather than relying on that).

The shell's review warned that `bodiesOf(state)` means one thing today and will mean another with a second population. **Decide what it means and make the distinction explicit in the types** — a `Body[]` that sometimes includes wild fish and sometimes does not, distinguished only by call site, is exactly how the sweep ends up seeing them.

- [ ] **Step 2: Write the failing tests**

- A player sheltered only by wild fish is **not exposed** — hand-derive the shelter total.
- The same player, one tick after the hush, **is exposed**, because the wild fish bolted. This is the design's central moment; assert the transition, not just the two states.
- Tension is **unchanged** by adding a hundred wild fish — the discriminating test for the spec correction above.
- `markVisits` stamps nothing for wild fish; a bloom under a wild shoal stays ready.
- `selectTaken` never returns a wild id, even if one is somehow present in the locked positions.

- [ ] **Step 3: RED, implement, GREEN.**

- [ ] **Step 4: Mutation-verify** by letting wild fish into the tension path and confirming the tension test fails, and by suppressing the bolt and confirming the transition test fails.

- [ ] **Step 5: Run the harness.** It prints shelter per swimmer — the numbers should now include wild cover, and should drop at the hush. Paste the output.

- [ ] **Step 6: Commit**

---

### Task 4: Terrain

**Files:** create `shoal-client/src/ui/terrain.ts`, `terrain.test.ts`

- [ ] **Step 1: Display-only, deliberately**

Spec §2.13 says terrain gives blooms legible places to appear. **This plan does not implement that** — biasing bloom placement toward terrain is a consensus rule and would need its own design. Terrain here is hand-authored geometry and nothing else: it gives the sea landmarks, gives speech something to say (*"kelp!"* is a complete rally call), and gives the space memory so returning feels like returning *somewhere*.

Say so in the module header, and record the bloom-biasing question in `docs/THE_SHOAL_OPEN_ITEMS.md` rather than leaving it implied.

- [ ] **Step 2: Author a handful of places**

A kelp stand, a wreck, a drop-off, a shelf. Fixed world coordinates. Each needs a **name** — that is the point, since the minute between sweeps is otherwise "hold a heading", which is waiting.

Names are player-facing: sea language only, and nothing that reads as a debug label.

- [ ] **Step 3: Test what is testable**

Placement is data, so test the queries: which place contains a point, which is nearest, and that the set is stable (a place does not move between calls). Keep the paint for the screenshot.

- [ ] **Step 4: Commit**

---

### Task 5: Draw the ocean

**Files:** modify `shoal-client/src/ui/seaPaint.ts` (and split it if it grows past readability — it was 1,310 lines before this plan, and the shell's review flagged it)

- [ ] **Step 1: Draw wild fish so they read as *not people***

They must be visually distinct enough that a player never mistakes one for a person, because the entire honesty of this feature rests on **speech being the tell** — anyone who says a word is a person. Smaller, dimmer, more uniform, no name, no tether. Say what you chose.

- [ ] **Step 2: Draw terrain with depth**

The sea currently reads well because of light shafts and motes. Terrain must sit *in* that, not on top of it — parallax, occlusion, and the same palette.

- [ ] **Step 3: The bolt must be visible**

When the hush lands, the player should *see* the ocean empty around them. That is the moment the design is built on. It should be unmistakable without a word of text.

- [ ] **Step 4: Screenshot four moments** — the ocean at rest, a player sheltered by wild fish, the instant of the bolt, and a named place. **I will open all four.**

- [ ] **Step 5: Run the app and play it.** Report how it feels, honestly, including if the wild fish read as dead because they cannot see you.

- [ ] **Step 6: Commit**

---

## Self-Review

**Spec coverage.** §2.6 wild fish → Tasks 2, 3, 5 (with the tension correction proposed above). §2.13 terrain → Tasks 4, 5, minus bloom-biasing which is recorded as open. §3.8 deterministic simulation → Task 2's purity ruling, which makes the requirement structural rather than disciplinary. Open item 8 → Task 1.

**Deliberately not here:** checkpoint publish/adopt (Blocker 12 — the largest open item and the one I would take next); `ensureSponsored`; room rotation; sound; the first-run teaching sequence, which now has a game to teach against and should be its own plan.

**Placeholders:** none. Tasks 2, 4 and 5 specify contracts and obligations rather than full code — motion design, place layout and paint are judged by looking, and a test that asserts a colour proves nothing.

**Known risk:** ruling 1 buys determinism by making wild fish blind to players. If they read as lifeless the honest fix is better motion, not player-awareness — reaching for player positions reopens exactly the divergence §3.8 warns about. Task 5 Step 5 exists to surface that judgement before it is buried.
