# The Shoal — Checkpoints and the Way In

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two things that stop a real person playing — clients that disagree about size, and a new swimmer who cannot write at all.

**Architecture:** Checkpoints become real: published as a room reply at every epoch rollover, adopted by joiners, and disagreements surfaced rather than silently absorbed. Then the sponsorship gate gets a typed answer and a way through it.

**Tech Stack:** The merged `shoal-client/` engine, bridge and shell.

## Why this before shallows, tides and marks

Plan 4 was specced as shallows, vouching, tides and marks. This plan takes **the two blockers inside it** and leaves the rest to a follow-up, because neither of the others matters until these land:

- **Blocker 12:** the shell computes a checkpoint at every hour boundary and **throws it away** (`chainSea.ts`, `advance().rolled` discarded, `createLoop` always seeded `null`). A client that ran through a boundary keeps everyone's accumulated size; one that joins after sees them at `START_SIZE`. Size feeds `shelterWeight` → `shelterOf` → `isExposed` → `selectTaken`, so **two honest clients disagree about who the shark eats** — what `sweep.ts`'s own header calls the most trust-destroying bug this game can have. It also breaks spec §2.7's "you return the size you left" across any reload crossing an hour.
- **Blocker 2:** there is no `ensureSponsored` flow. On testnet and mainnet the gate is enforced at ingestion (`src/rpc/methods.rs:2917`, `:753-759`), so a new player's very first write fails — loudly, but with no way through and no way to tell "you have no sponsor" from "the node is down" except by string-matching an error message.

Marks are a record of size. Tides are a schedule for a world people can enter. Both are built on these.

## Global Constraints

- **Integer math only in `src/lib/`.** No floats, no wall-clock reads. Display may use both.
- **Tests compute expected values independently of the code under test** — hand arithmetic in comments. Never relax a test to match code; hand-derive which side is wrong and report it.
- **Every load-bearing test must be mutation-verified** with real verbatim output, reverted, ALL PASS reconfirmed. **Sixteen vacuous checks have been caught across seven plans**, four in the last one alone. Assume yours are vacuous until a mutation says otherwise.
- **`npm test` runs both typechecks and must stay clean.** Currently **1429 checks across 25 files, all green**; every existing check must stay green.
- **The diegetic rule (spec §1.1) is binding.** No player-facing text says node, chain, space, post, reply, or Swimchain. Sea language only.
- Read spec §3.9 (the epoch decision, especially points 4 and 5), §2.16 (newcomers), and `docs/THE_SHOAL_OPEN_ITEMS.md` blockers 1, 2 and 12.

---

## File Structure

| File | Side |
|---|---|
| `shoal-client/src/lib/shoalWire.ts` | a checkpoint's wire form — **consensus** |
| `shoal-client/src/lib/shoalRoom.ts` | separating checkpoints from moves in a fetched log |
| `shoal-client/src/ui/chainSea.ts` | publish on rollover, adopt on join |
| `shoal-client/src/lib/shoalSend.ts` | a typed sponsorship error |
| `shoal-client/src/ui/` | the way in |

---

### Task 1: A checkpoint on the wire

**Files:** modify `shoal-client/src/lib/shoalWire.ts` and its test.

- [ ] **Step 1: What is being encoded, and what already exists**

`serialiseCheckpoint`/`parseCheckpoint` already produce a **canonical** form — sorted by id, rejection-not-repair on parse, optional `recent` tail. That work is done and must not be redone. What is missing is how a checkpoint travels as a **reply body** alongside vectors and eat claims.

The wire format is **consensus and permanent** (spec §4). It already carries a version tag and a kind tag; a checkpoint is a third kind. Read `shoalWire.ts`'s header before touching it — it documents why there is one timestamp, why decode rejects rather than repairs, and why an author-derived salt exists.

- [ ] **Step 2: The salt question**

Two swimmers publishing the same epoch's checkpoint produce, by design, **byte-identical payloads** — that is the whole point of canonicality. But `content_id = sha256(body)`, so identical bodies are **one object on chain**: the node accepts both actions, silently drops the second content-store write while returning success, and credits whichever author indexed last.

The move wire format solved this with an author-derived salt. **Decide whether a checkpoint should carry one.**

There is a real argument either way, and this is the interesting decision in the task:
- *With* a salt, every publisher's checkpoint is a distinct object, so you can see who agreed — and disagreement becomes visible by comparing payloads.
- *Without*, identical checkpoints collapse into one object, which is arguably correct (they *are* the same fact) and cheaper, but you lose the ability to tell "everyone agrees" from "only one client published."

Pick one, implement it, and **write the reasoning into the module header**. Say what you give up.

- [ ] **Step 3: Tests**

Round-trip; rejection of every malformed shape (an unsorted `sizes`, a non-integer size, a bad epoch, a truncated payload); and that a checkpoint body cannot be mistaken for a move or vice versa. Hand-derive the expected wire strings.

- [ ] **Step 4: Mutation-verify** the kind discrimination and one rejection rule. Real output, revert, ALL PASS.

- [ ] **Step 5: Commit**

---

### Task 2: Publish and adopt

**Files:** modify `shoal-client/src/ui/chainSea.ts`, `shoal-client/src/lib/shoalRoom.ts`; tests alongside.

- [ ] **Step 1: The three jobs**

1. **Publish.** `advance` already returns `{ loop, rolled }` and `rolled` is currently discarded. When it is non-null, send it.
2. **Adopt.** `createLoop(epoch, seed)` is currently always called with `null`. A joiner must find the newest checkpoint for `epoch - 1` in the fetched log and seed from it.
3. **Separate.** `repliesToLog` currently turns every decodable reply into a `LogEntry`. Checkpoints are not moves and must not enter the fold as one.

- [ ] **Step 2: What "verified" means, and what it cannot mean**

Spec §3.9 point 5: *"A cold joiner adopts the newest checkpoint it can see and verifies forward from there — it does not re-derive history back to genesis."*

So adoption is **trust-on-first-sight, then self-verifying**. You cannot verify a checkpoint without folding the epoch it summarises, which is the thing adoption exists to avoid.

But canonicality gives something better than verification: **every honest client publishes byte-identical bytes.** So if two checkpoints for the same epoch differ, that is a *detected divergence* — the one thing this whole engine is built to make impossible. **Do not silently pick one.** Surface it: report it through whatever channel the shell already uses for errors, and say in the code what it means.

Decide what a client does when it sees a disagreement. Adopting the majority, adopting the oldest, and refusing to play are all defensible; silently adopting whichever sorted first is not.

- [ ] **Step 3: Tests**

- A published checkpoint round-trips: publish at a rollover, refetch, adopt, and the adopting client's state matches the publisher's — **byte-identical fingerprints**. Assert non-degeneracy first (a sweep fired, bites credited) or the comparison proves nothing over an inert world.
- **The blocker itself:** a client that runs through a boundary and one that joins after it now agree on every swimmer's size. Derive the sizes by hand. This is the test that would have caught Blocker 12.
- Two differing checkpoints for one epoch are detected and reported, not silently absorbed.
- A checkpoint reply never enters the fold as a move — assert that the fold's entry count is unchanged by adding one.
- Adoption is skipped cleanly when no checkpoint exists (the first epoch a room ever has).

- [ ] **Step 4: Mutation-verify.** Discard `rolled` again → the round-trip test must fail. Let a checkpoint through `repliesToLog` as a move → the entry-count test must fail. Silently pick one of two differing checkpoints → the detection test must fail.

- [ ] **Step 5: Two-client proof**

Extend the existing two-node smoke (`scripts/two-client-smoke.ts`) or add a sibling: two peered nodes, one client crossing an epoch boundary, one joining after, **and both folding to identical fingerprints**. Run it and paste the real output. If crossing a real hour boundary is impractical, say how you compressed it and why that is still a fair test.

- [ ] **Step 6: Commit**

---

### Task 3: A typed answer to the gate

**Files:** modify `shoal-client/src/lib/shoalSend.ts` and its test.

- [ ] **Step 1: The problem**

On testnet and mainnet, `submit_reply` calls `check_identity_sponsored` (`src/rpc/methods.rs:2917`), which short-circuits only on regtest (`:753-759`). So an unsponsored player's first write fails at ingestion with a JSON-RPC error, which `rpcCall` turns into a thrown `Error` carrying a code and a message.

The shell cannot currently distinguish *"you have no sponsor"* from *"the node is down"* without string-matching that message. That is fragile, and it is the difference between showing a way in and showing a crash.

- [ ] **Step 2: Classify it**

Find the actual error code the node returns for an unsponsored author — **read the Rust, do not guess** — and give `shoalSend` a typed result that names it. Distinguish at minimum: not sponsored; node unreachable; everything else.

- [ ] **Step 3: Tests**

Inject a fake `fetch` returning each shape and assert the classification. Include the case that matters: a *different* JSON-RPC error must **not** be classified as "not sponsored", or the way-in flow will fire on unrelated failures.

- [ ] **Step 4: Mutation-verify** by broadening the classifier to catch everything, and confirm the "different error" test fails.

- [ ] **Step 5: Commit**

---

### Task 4: The way in

**Files:** `shoal-client/src/ui/` — new module plus wiring.

- [ ] **Step 1: What spec §2.16 asks for**

> Entry to the open ocean requires being **vouched in** by an established player. Unvouched newcomers appear as small fish circling at the edge of the real water, visible to everyone, and letting one in is an in-game act — never a link, a code, or an out-of-band chore.

> **Vouchees are kin.** They shield you harder than strangers do, they render with a visible bond, and your marks accrue from their survival. Without a *private* return, recruiting is a public good that everyone free-rides on and nobody does.

> Never let a downloader dead-end.

**This task implements only the first half: a newcomer who cannot write is told so, diegetically, and shown that someone must let them in.** Kin shielding is a **consensus** change to `shelterWeight` and belongs with the follow-up plan alongside marks — do not implement it here.

- [ ] **Step 2: What the player sees**

A player whose first write is refused for want of a sponsor must not see a crash, a code, or the word "sponsor". Sea language: they are at the edge of the water and someone in it has to let them in.

Use the classification from Task 3. **Do not** string-match an error message in the UI.

- [ ] **Step 3: The mechanism, honestly scoped**

Actually granting a vouch requires the sponsoring client to create a sponsorship offer, which is real RPC work and needs a sponsored identity to do it. **If that is more than this task can carry, implement the recognition and the diegetic surface, and record the granting half as an open item with what it would take.** A half-built grant flow that silently fails is worse than a clear "someone must let you in".

Say plainly in your report which half you built.

- [ ] **Step 4: Screenshot it.** The edge-of-the-water state, in the real app. I will open it.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage.** §3.9 points 4 and 5 → Tasks 1 and 2. §2.16's recognition half → Tasks 3 and 4. Blocker 12 → Task 2. Blocker 2 → Tasks 3 and 4.

**Deliberately not here:** shallows (a separate, smaller water), tides, marks, and kin shielding — all of which want size to be agreed and a way in to exist first. Room rotation (Blocker 1) is untouched and still needs a node-side tail fetch or a rotation design.

**Placeholders:** none. Tasks 1, 2 and 4 specify decisions and obligations rather than full code — the salt question, the disagreement policy, and how much of the vouch flow is reachable are all judgement calls the implementer should make and justify.

**Known risk:** Task 2 is the largest consensus change since the epoch work, and it is the one where a wrong answer is invisible until two clients have been apart for an hour. The two-client proof in Step 5 is what makes it real rather than plausible; if it cannot be run, that must be reported as unverified rather than assumed.
