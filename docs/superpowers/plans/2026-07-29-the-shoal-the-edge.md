# The Shoal — The Edge Is a Place You Can Swim

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unsponsored newcomer's experience complete — they swim the shallows at the edge of the real water, and they are pulled through the moment the network accepts them.

**Architecture:** No new consensus, no sponsorship API, and nothing that asks the network for permission. The client keeps writing; a refused write raises the edge, an accepted one lifts it. The shallows become a second presence *beside* the real water rather than a different sea the player is sent to.

**Tech Stack:** The merged `shoal-client/` engine, its Tauri 2 shell, and the node's JSON-RPC surface.

## Why this plan

Plan 4b made the game installable and playable. It left one hole, and both an implementer and a reviewer found it independently:

> **The shallows is the *offline* sea, so a newcomer who reaches real water and is refused never sees it.** Wiring it to `atTheEdge` naively stops chain writes — and if the client stops writing, nothing ever discovers that the player has since been accepted, so the edge can never lift. A silent, permanent lockout.

So today a refused player gets the boundary text and a real sea they cannot affect. The tutorial water they should be swimming in is somewhere they can never be sent, and the way out is a door that can only open from a side nobody is standing on.

**The design ruling that shapes everything here:** The Shoal is a *play-from-your-local-node* game. **Sponsorship is part of being on the network, not something the game grants.** The client must never claim, request, or negotiate sponsorship. It writes; the network answers. That is the whole protocol.

## Global Constraints

- **Integer math only in `src/lib/`.** No floats, no wall-clock reads, no `Math.random`. `src/ui/` may use all three.
- **The wire format and the fold are CONSENSUS and permanent** (spec §4) — a change re-scores all history. **This plan needs no fold change.** If a task appears to need one, stop and report it.
- **The client never asks about sponsorship.** No `get_sponsorship_status`, no `list_sponsorship_offers`, no `claim_sponsorship_offer`. `App.test.ts` already asserts on the wire that no method containing `sponsor` is ever called — **that check must stay green.** The only permitted knowledge is `classifySendFailure`'s reading of `-32015` on a write the player's own game made anyway.
- **The diegetic rule (§1.1) is binding.** No player-facing text says node, chain, space, post, reply, sponsor, or Swimchain.
- **`npm test` runs both typechecks and must stay clean.** Currently **1955 checks across 34 files**; every existing check must stay green.
- Tests compute expected values independently of the code under test. **Mutation-verify anything load-bearing** — real verbatim output, revert, ALL PASS reconfirmed. **Seventeen vacuous checks have been caught across ten plans.**
- **Anything that only matters in the packaged build needs a check that can see it.** `shippedStyles.test.ts` and `shippedConfig.test.ts` exist because three defects shipped past the whole suite. Inline styles are dropped by Tauri's CSP; config values are unguarded unless asserted.

---

## File Structure

| File | Side |
|---|---|
| `shoal-client/src/ui/seaChoice.ts` | which water a player is in, and why |
| `shoal-client/src/ui/wayIn.ts` | the standing — raised by refusal, lifted by acceptance |
| `shoal-client/src/ui/shallows.ts` | the newcomer's water, now reachable |
| `shoal-client/src/ui/TheEdge.tsx` | the boundary, and the moment it lifts |
| `shoal-client/src/ui/terrainPaint.ts` | the Drop-off's edge |

---

### Task 1: The refused newcomer swims

**Files:** modify `shoal-client/src/ui/seaChoice.ts`, `src/ui/shallows.ts`, `src/ui/wayIn.ts`; tests alongside.

- [ ] **Step 1: The trap, stated plainly before you design around it**

The obvious implementation — "if refused, show the shallows instead of the real water" — **is the lockout.** The shallows is offline; if it replaces the chain sea, the client stops writing, and the only signal that would ever lift the edge is a write that now never happens. The player is sealed in with no error and no way out, and nothing in the logs looks wrong.

**So the invariant is: while the edge is up, the client keeps attempting real writes.** Whatever you build, prove that invariant holds by test, not by inspection.

- [ ] **Step 2: Two presences, not two seas**

Spec §2.16: *"Unvouched newcomers appear as small fish circling at the edge of the real water, visible to everyone."*

Read that carefully — it does **not** say the newcomer is sent somewhere else. It says they are at the edge *of the real water*, and that others can see them. Decide how literally to take the "visible to everyone" half: it may be free (their refused writes are simply refused, so nobody sees them) or it may be impossible without a write they are not allowed to make. **Say which you found, and do not invent a mechanism to force it.**

What the player must get is a sea they can actually play — the shallows, with its cast and its sweeps — while their real presence keeps knocking at the door.

- [ ] **Step 3: What the shallows are for now**

Plan 4b built the shallows as a **first-launch teaching moment** on a fixed clock: a pre-authored table where the sweep lands on the same tick every time and the lesson cannot miss (`shallows.ts`, and the floor invariant in its header — the count outside the tension core never drops below three, so the sweep can only arrive *earlier*, never stall).

A newcomer waiting at the edge may sit there for a long time. **A scripted 14-second scenario is a tutorial, not a place to wait.** Decide what the shallows are once the lesson has landed — the same table looping is almost certainly wrong, and plan 4b already recorded that the cast collapses to `MIN_SIZE` by T+3 min and the water ends as one whale and eight minnows.

This is the real design work in the task. **Make a call and justify it.**

- [ ] **Step 4: Tests**

The invariant first: while the edge is up, real writes are still being attempted — assert it on the wire, the way `App.test.ts` asserts no `sponsor` method is called. Then: a refused player is in a playable sea; an accepted player is not in the shallows; the transition in Task 2 has somewhere to transition *from*.

- [ ] **Step 5: Mutation-verify** by stopping the writes while the edge is up. **The invariant test must fail.** If it passes, it is vacuous and the lockout is back.

- [ ] **Step 6: Commit**

---

### Task 2: Being let through

**Files:** modify `shoal-client/src/ui/wayIn.ts`, `src/ui/TheEdge.tsx`, `src/ui/seaChoice.ts`; tests alongside.

- [ ] **Step 1: The whole mechanism**

The player is sponsored by being on the network — someone vouches for their node, by whatever means members are vouched for. **The game finds out the only honest way available to it: a write it was going to make anyway stops being refused.**

There is no status to poll and no permission to request. `classifySendFailure` already distinguishes `not-sponsored` from `unreachable` from `unknown` on the node's own `-32015`. An accepted write is the signal.

- [ ] **Step 2: Do not let a slow yes become a no**

Plan 4b measured a real sponsorship at **200 seconds** end to end, and that was against a client deadline of 180 — a case where the answer arrived and the client had already given up. There is no deadline here now, and there must not be one: **the edge lifts whenever it lifts**, whether that is a minute or a day, across sessions.

Check the retry cadence you inherit: it must not spin hot against a node that is refusing every write, and it must not back off so far that a player who was accepted sits at the edge for an hour after the fact.

- [ ] **Step 3: The moment itself**

This is the payoff of the whole newcomer arc and it should feel like one. The player has been circling in the shallows; now the shoal takes them. **Show it, do not announce it** — spec §2.18's lesson is taught with no text and this moment deserves the same restraint.

Any copy is bound by the diegetic rule. The existing boundary lines stay as they are:

> *"You are at the edge of the water."*
> *"The shoal has not taken you in yet. Stay close and keep circling — someone already swimming has to bring you through."*

- [ ] **Step 4: Tests**

The transition fires on an accepted write and on nothing else — specifically **not** on `unreachable` and **not** on `unknown`, or a flaky node will fake a welcome. It survives a restart (a player accepted while the app was closed comes back inside). It does not fire twice.

- [ ] **Step 5: Mutation-verify** by broadening the trigger to any non-refusal. **The `unreachable` test must fail.**

- [ ] **Step 6: Screenshot the moment** — the edge lifting, in a real installed build. **I will open it.**

- [ ] **Step 7: Commit**

---

### Task 3: The Drop-off has an edge you can see over

**Files:** modify `shoal-client/src/ui/terrainPaint.ts`; tests alongside.

- [ ] **Step 1: What is wrong**

Carried from plan 4b, reported by the implementer and confirmed by me: **the Drop-off's void renders as a hard-edged dark rectangle.** It reads as a missing texture rather than a place. It is the one piece of terrain that looks like a bug.

Named places now say their names as you arrive, so this one announces itself as "The Drop-off" while looking like a hole in the renderer.

- [ ] **Step 2: Make it read as depth**

A drop-off is an edge you swim out over and lose the bottom. Hand-authored, purely a game object, never derived from anything on the network (§2.13).

**Styling goes in a stylesheet, never an inline `<style>`** — Tauri's CSP drops those page-wide, which shipped an unstyled first screen once already. `shippedStyles.test.ts` will fail you if you forget.

- [ ] **Step 3: Also worth fixing while you are here**

Plan 4b recorded that four places cover ~7.7% of the sea and **the south-west corner has none**. A player who spawns there sees an unnamed, featureless expanse. Judge whether that wants a fifth place or a redistribution — or whether empty water is correct and the corner should stay open. **Any of those is defensible; say which and why.**

- [ ] **Step 4: Screenshot** the Drop-off from above and from out over the void. **I will open both.**

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage.** §2.16's newcomer ("small fish circling at the edge of the real water") → Tasks 1 and 2. §2.13's terrain → Task 3.

**Deliberately not here:** tides (§2.14), marks (§2.17), kin shielding, and shoal split/merge (§2.15). Kin shielding in particular is a **consensus** change to `shelterWeight` and wants its own plan with the differential-fold discipline that change demands. Room rotation (Blocker 1) is untouched and still needs a node-side tail fetch or a rotation design.

**Placeholders:** none. Tasks 1 and 2 specify obligations and decisions rather than full code — what the shallows become once the lesson has landed, how literally to take "visible to everyone", and what the moment of being let through looks like. All three are judgement calls the implementer should make and justify.

**Known risk:** Task 1's trap is easy to reintroduce at any later point, because the lockout looks like correct code and produces no error. The invariant test in Step 4 is the only thing standing between a working newcomer path and a silent one — if it is vacuous, the plan has failed while appearing to succeed. Mutation-verify it first, not last.

**Known risk 2:** none of this is real until it runs in a packaged build. Plan 4b shipped three defects that every isolated test passed, including one on the first screen a newcomer ever sees. Task 2's screenshot must come from an installed artifact, not a dev server.
