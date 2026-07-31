# The Shoal — A Room Per Hour

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the hard ceiling on how long The Shoal can be played, by rotating the room every hour on the boundary the game already has.

**Architecture:** The room id becomes a pure function of the epoch — the same clock that already drives checkpoints. No coordination, no authority, no announcement: every client derives the same room for the same hour, exactly as it already derives the space id from `@shoal:main`. Checkpoints, which already carry size across an epoch boundary, do double duty as the carry across a room boundary.

**Tech Stack:** The merged `shoal-client/` engine, its Tauri 2 shell, and the node's JSON-RPC surface.

## Why this plan

`shoalRoom.ts` refuses a truncated log rather than folding it, and its header states the reason and the remedy:

> a truncated log is not a staler world, it is a **DIFFERENT** one … stop folding and rotate the room — publish a new room post and point clients at it, exactly the way a fresh room starts. Do **NOT** catch it and retry with a bigger limit: the limit is not the problem, unbounded history is, and the next ceiling arrives on the same schedule.

Today the game writes every presence vector and every eat claim into **one room, forever**. `ROOM_FETCH_LIMIT` is 100,000. Paging past it is mechanically possible but `O(D²)` node-side on a fetch this game runs on every `content_new`, and the mempool block appends pending replies to every page regardless of offset — so paging is not a way out.

**The arithmetic.** A player emits every 3 s at most and every 8 s at least (`MIN_EMIT_GAP_MS`, `MAX_EMIT_GAP_MS`). Spec §2.15 sizes a healthy shoal at fifteen to twenty-five. Twenty-five players therefore write **11,250–30,000 replies per hour**, before eat claims.

- One room per **hour** → 11k–30k. Comfortable, 3–9× headroom.
- One room per **day** → 270k–720k. Through the ceiling before lunch.

So the room rotates hourly, on the epoch boundary the fold already uses. When the ceiling is hit today the game simply stops — this is not a scaling nicety, it is the difference between a game that can be played next month and one that cannot.

## Global Constraints

- **Integer math only in `src/lib/`.** No floats, no wall-clock reads, no `Math.random`. `src/ui/` may use all three.
- **The room id is CONSENSUS.** Two clients that derive different rooms for the same hour are in different worlds — the most trust-destroying failure this game has, worse than disagreeing about size, because they cannot even see each other. Treat the derivation with the care the wire format gets.
- **No fold change.** The fold already handles epochs, checkpoints and warm-up replay. If a task appears to need one, **stop and report it**.
- **The client never asks about sponsorship.** No `get_sponsorship_status`, `list_sponsorship_offers`, or `claim_sponsorship_offer`; `App.test.ts` asserts this on the wire.
- **The diegetic rule (§1.1) is binding.** No player-facing text says node, chain, space, post, reply, sponsor, or Swimchain. **A room rotation must be invisible to the player** — nobody should ever learn that the sea has hours.
- **`npm test` runs both typechecks and must stay clean.** Currently **2096 checks across 35 files**; every existing check must stay green.
- **Anything that only matters in the packaged build needs a check that can see it** — `shippedStyles.test.ts` and `shippedConfig.test.ts` exist because four UI defects shipped past a fully green suite.
- Tests compute expected values independently of the code under test. **Mutation-verify anything load-bearing.** Nineteen vacuous checks have been caught across eleven plans.

---

## File Structure

| File | Side |
|---|---|
| `shoal-client/src/lib/shoalRoom.ts` | deriving the hour's room — **consensus** |
| `shoal-client/src/ui/shellConfig.ts` | minting and finding the current room |
| `shoal-client/src/ui/chainSea.ts` | crossing a room boundary without a seam |
| `shoal-client/scripts/mint-water.ts` | what a mint means now |

---

### Task 1: The room is a function of the hour

**Files:** modify `shoal-client/src/lib/shoalRoom.ts` and its test.

- [ ] **Step 1: What already exists**

The space id is already derived, not discovered: `@shoal:main` → `sha256("app:shoal:v1:main")[..15]` → `sp1qqz4vc5lj250danvppc8k2hchy9sxh0ae6`. A reviewer independently decoded the live literal to confirm it. **Read that derivation before writing yours** — the room's must be as reproducible, and a wrong one is worse, because a healthy-looking room that nobody else derives is a private world with no symptom.

`epochOf` / `epochStartMs` / `epochEndMs` already exist in `src/lib/epoch.ts` and are what the fold and checkpoints run on.

- [ ] **Step 2: Derive it**

A room is a post in the space, so what you derive is the **post's identifying text** — `content_id` is `sha256(body)`, so a room is fully determined by the bytes of its title and body. Decide what those bytes are for epoch *N* and write the reasoning into the module header.

Requirements: the same epoch gives the same room on every machine, forever; different epochs never collide; and the derivation must not need any state a fresh client lacks.

- [ ] **Step 3: Tests**

Same epoch → identical id, computed by hand in the test rather than by calling the code under test. Adjacent epochs → different ids. The current epoch's room, derived at three different instants inside that hour, is the same room. Hand-derive at least one full id and pin it as a literal, the way the space id is pinned.

- [ ] **Step 4: Mutation-verify** the derivation — perturb the epoch input by one and confirm the pinned literal check fails.

- [ ] **Step 5: Commit**

---

### Task 2: Crossing the boundary without a seam

**Files:** modify `shoal-client/src/ui/chainSea.ts`, `src/ui/shellConfig.ts`; tests alongside.

- [ ] **Step 1: The hard part, and it is genuinely hard**

At 00:00:30 the fold is 30 s into epoch *N* — but §3.9's warm-up replays `WARMUP_MS` (90 s) **before** the epoch start, so the client needs the last 90 s of epoch *N−1*, which now lives in **a different room**.

So near a boundary a client must read **two rooms** and fold their union. Work out exactly when it can stop reading the old one, and prove the union is the same log the single-room client folded before this change. **A seam here is a divergence**, and it recurs every hour rather than once.

- [ ] **Step 2: Publishing across the boundary**

A write mined just before the boundary may land just after it. Decide which room it belongs to, and make sure a client that reads only the new room does not lose it — or accept the loss and say why it is safe. Note the emitter re-stamps a vector onto the frame's wall clock, so authoring time and landing time already differ.

The checkpoint is published at the rollover and is the carry across the boundary. **Decide which room it goes in** — the closing epoch's or the opening one's. There is an argument for each; make it.

- [ ] **Step 3: The room must exist before anyone can write to it**

Rooms are posts, and a post must be minted by somebody. **This is the task's second real problem.** Options include: every client mints the hour's room idempotently on arrival (`create_space` already returns the existing id rather than failing — check whether the reply path behaves the same, and **read the Rust rather than assuming**); or the first writer mints it; or rooms are minted ahead by whoever is present.

Whatever you choose must work when **nobody was playing during the previous hour**, and must not depend on any particular client being online. Say what happens if two clients mint the same room simultaneously — recall that identical bodies produce one object whose author is whoever indexed last *on that node*, so two minters is not automatically a conflict.

- [ ] **Step 4: Tests**

A client that runs across a boundary and one that joins just after it **fold to identical fingerprints** — the same bar Blocker 12's checkpoint work had to clear. Assert non-degeneracy first (a sweep fired, bites credited) or an inert world will pass. Also: the union near a boundary equals the pre-change single-room fold; a client that joins during the first 90 s of an epoch sees the same world as one that joins at 00:05.

- [ ] **Step 5: Mutation-verify** by reading only the current room at 00:00:30. **The two-client agreement test must fail.**

- [ ] **Step 6: Two-node proof.** Extend the existing two-node smoke: two peered nodes crossing a room boundary, folding to identical fingerprints. Compress the hour if you must, and **say how and why that is still fair** — the existing checkpoint smoke does exactly this and documents it.

- [ ] **Step 7: Commit**

---

### Task 3: A shipped build plays across an hour

**Files:** whatever the attempt forces.

- [ ] **Step 1: Run it**

Build, install, and launch the real artifact with no arguments — **not the dev server**. Four UI defects on this project shipped past a fully green suite and only surrendered to installing the packaged build.

Play across a real room boundary. If waiting for a wall-clock hour is impractical, say exactly how you compressed it and why the compression is fair.

- [ ] **Step 2: Answer with evidence**

1. Does the sea survive the boundary **without the player noticing**? A visible reset, a stutter, or an empty ocean for a few seconds all count as noticing.
2. Do two clients that cross together still see each other afterwards?
3. Does a client that joins mid-hour see the same world as one that has been running?
4. Is anything written in the last seconds of an hour lost?

- [ ] **Step 3: Screenshot** the sea either side of a boundary, from the installed build. **I will open both.**

- [ ] **Step 4: Report honestly.** If it does not survive the boundary, say exactly where it breaks. That answer is worth more than a fix that looks right.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage.** §3.9's epoch model → Tasks 1 and 2. The `shoalRoom.ts` header's stated remedy ("rotate the room") → the whole plan. Blocker 1 → closed by Task 2 if the boundary crossing holds.

**Deliberately not here:** tides (§2.14), marks (§2.17), kin shielding (a **consensus** change to `shelterWeight` that wants its own plan and differential-fold discipline), and shoal split/merge (§2.15). Making who-is-waiting visible at the edge is node-side and out of scope.

**Placeholders:** none. Tasks 1 and 2 specify obligations and decisions rather than full code — the room's identifying bytes, which room a boundary-straddling write belongs to, which room holds the checkpoint, and who mints the hour's room. All four are judgement calls the implementer should make and justify.

**Known risk:** the room id is consensus, and unlike the wire format a wrong derivation has **no symptom** — a client alone in a room it derived by itself sees a calm, empty, entirely healthy sea. The pinned literal in Task 1 and the two-node proof in Task 2 are what make that detectable rather than plausible.

**Known risk 2:** this plan makes the game's history hourly. Nothing but the checkpoint crosses a boundary, so anything a future feature wants to remember for longer than an hour — marks, in particular — must carry itself explicitly. Worth knowing before marks are designed.
