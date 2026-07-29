# The Shoal — A Shipped Build That Plays

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an installed Shoal build playable by a person who was handed the installer — no URL parameters, no dev server, no instructions.

**Architecture:** The shell already spawns a node and already knows its RPC endpoint and cookie (`get_rpc_config`). It does not know the node's *identity*, and it has no room to point at, so `buildChainSea` is gated off in release and a shipped build shows the offline sea instead. This plan closes that: the node hands the game its identity, the game resolves its own water, and a newcomer who cannot reach the open ocean lands in the shallows rather than at a dead end.

**Tech Stack:** The merged `shoal-client/` engine, its Tauri 2 shell, and the node's JSON-RPC surface.

## Why this before shallows, tides and marks

Plan 4b was specced as shallows, tides, marks and kin shielding. This plan takes **the shallows** and the thing underneath all four, because none of the rest is reachable:

**`buildChainSea` returns `null` unless `import.meta.env.DEV`** (`shoal-client/src/ui/App.tsx:177`). A shipped build never writes, never joins a room, and cannot show the edge-of-the-water surface plan 4a just built. Today the game is playable only from a dev server driven by a script that prints its own URLs.

**The gate is correct and must not simply be removed.** The only configuration path that exists is query parameters, and that path (`chainParams`, `App.tsx:205-234`) derives a signing key as `sha256('shoal-two:' + label)` with no KDF, takes the node's RPC cookie out of the address bar, and points the shell at an arbitrary endpoint. `devtools` is enabled in release (`src-tauri/Cargo.toml`), so "not reachable from inside the game" was never the same as "not available". What is missing is a **second, non-dev configuration path** that the gate does not cover.

Tides are a schedule for a world people can enter. Marks are a record of playing. Kin shielding is a reward for recruiting into a game someone can install. All three assume this.

## Global Constraints

- **Integer math only in `src/lib/`.** No floats, no wall-clock reads, no `Math.random`. Display (`src/ui/`) may use all three.
- **The wire format and the fold are CONSENSUS** (spec §4) — permanent, and a change re-scores all history. This plan should not need to touch either; if a task appears to, stop and report it.
- **The diegetic rule (spec §1.1) is binding.** No player-facing text says node, chain, space, post, reply, sponsor, or Swimchain. Sea language only.
- **Tests compute expected values independently of the code under test** — hand arithmetic in comments. Never relax a test to match code; hand-derive which side is wrong and report it.
- **Every load-bearing test must be mutation-verified** with real verbatim output, reverted, ALL PASS reconfirmed. **Sixteen vacuous checks have been caught across eight plans.** Assume yours are vacuous until a mutation says otherwise.
- **`npm test` runs both typechecks and must stay clean.** Currently **1668 checks across 28 files, all green**; every existing check must stay green.
- **Read the Rust rather than guessing at RPC behaviour.** Plan 4a's Task 3 found the sponsorship error code by reading `src/rpc/error.rs`; the same discipline applies to identity and signing.

---

## File Structure

| File | Side |
|---|---|
| `shoal-client/src-tauri/src/main.rs` | a new identity handoff command |
| `shoal-client/src/ui/shellConfig.ts` | **new** — the non-dev configuration path |
| `shoal-client/src/ui/App.tsx` | choosing a sea without the DEV gate |
| `shoal-client/src/lib/shoalSend.ts` | signing as the node rather than a browser key |
| `shoal-client/src/ui/shallows.ts` | **new** — the water a newcomer lands in |
| `shoal-client/src/ui/terrain.ts` | named places |

---

### Task 1: The node hands the game its identity

**Files:** modify `shoal-client/src-tauri/src/main.rs`; create `shoal-client/src/ui/shellConfig.ts` and its test.

- [ ] **Step 1: What exists and what does not**

`get_rpc_config` (`main.rs:171`) already returns `{endpoint, auth}`, read from the node's own `.rpc_addr` / `.cookie` handoff files and polled until the node has actually bound RPC. That half is done and correct — do not redo it.

What the shell cannot currently tell the game is **who it is**. `chainSea` needs an author id and a signer, and today both come from `&id=` and `&who=`.

- [ ] **Step 2: Find the real identity surface**

The other clients solve this with *node mode*: the node holds the keypair and the client authenticates with the cookie rather than signing in the browser. Find how that actually works — `src/rpc/` and the app-shell's `get_identity_info` are the places to look — and answer three questions in your report **with file:line citations**:

1. What RPC returns the node's own identity (address and public key)?
2. **Can the node author a reply with its own identity when the caller presents only cookie auth**, or does `submit_reply` require a caller-supplied signature? This decides whether the game needs a signer at all in shell mode.
3. Does the answer differ between mainnet, testnet and regtest?

If question 2's answer is "the caller must sign", say so plainly — that is a materially larger task and I want to know before it is built, not after.

- [ ] **Step 3: The handoff**

Add a Tauri command returning the node's identity alongside the RPC config. Follow `get_rpc_config`'s shape, including its readiness behaviour: an identity read before the node is up must not hand back a stale or empty answer.

- [ ] **Step 4: `shellConfig.ts`**

A module that assembles a complete sea configuration from the shell — endpoint, auth, identity, and the water to join — with **no query parameters and no browser-held key**. It must be `null` when not running under the shell, so a browser build is unaffected.

- [ ] **Step 5: Tests**

Inject a fake command surface and assert: a complete configuration is assembled; a missing identity yields `null` rather than a half-configuration (plan 4a's own comment calls half a configuration "the single most confusing failure available here"); and a browser context yields `null`.

- [ ] **Step 6: Mutation-verify** the half-configuration rejection. Real output, revert, ALL PASS.

- [ ] **Step 7: Commit**

---

### Task 2: Two ways to be configured, one of them safe

**Files:** modify `shoal-client/src/ui/App.tsx`; test alongside.

- [ ] **Step 1: The shape of the change**

`buildChainSea` currently has one configuration path behind a static gate. It needs two:

- the **dev** path (`chainParams`) — unchanged, still gated on `import.meta.env.DEV`, still carrying the weak key derivation and the address-bar cookie;
- the **shell** path (`shellConfig`) — available in a release build, with no weak key and no secret in the URL.

The dev gate must keep doing the job its comment describes: `identityFromLabel` is the only reference to `browserIdentity.ts`, and gating it is what keeps that module's key derivation out of the shipped bundle. **Verify this still holds after your change** — build, then grep `dist/` for `shoal-two:`. Read `App.tsx:167-177` before touching it; that comment explains why the gate is where it is.

- [ ] **Step 2: Which sea a build shows**

Decide and justify: given a shell configuration, the game joins the real water; given neither, it shows the offline sea. State plainly what a release build does in each case.

- [ ] **Step 3: Tests**

That a shell configuration produces a chain sea; that a dev configuration still does in dev; that **neither path is reachable in a production build without a shell** — this is the check that keeps the gate honest.

- [ ] **Step 4: Mutation-verify** by removing the dev gate and confirming a test fails. Also confirm the `dist/` grep still finds nothing.

- [ ] **Step 5: Commit**

---

### Task 3: The shallows

**Files:** create `shoal-client/src/ui/shallows.ts`; modify `App.tsx`; tests alongside.

- [ ] **Step 1: What the spec asks for**

> Anyone may install and swim in **the shallows** immediately: a smaller body of water with the real mechanics, no vouch required. This is the tutorial, and it costs no text. (§2.16)

> Never let a downloader dead-end. A player who cannot reach the shoal sees a place, not an error.

Plan 4a built the edge-of-the-water surface for a newcomer whose write is refused. That is the *recognition*. The shallows are the *answer*: somewhere to actually swim while waiting to be let in.

- [ ] **Step 2: The insight to check first**

`demoSea.ts`'s `livelySea` is already a real sea folded by the real engine — sixteen swimmers, real swim vectors, a genuine spread of sizes seeded through `createLoop`, hunger and sweeps and all. **It may already be most of the shallows.** Read its header before designing anything: it explains what it is and, explicitly, what it is not.

The open question is what makes it a *tutorial* rather than a demo, and the spec answers that too:

> A newcomer spawns slightly *outside* the school, tether already stretched, with a sweep inbound. The other fish begin converging. They move in, the tether goes short and warm, the sweep passes, and someone further out is scattered in front of them. (§2.18)

- [ ] **Step 3: Build the teaching moment**

The lesson is **the predator is not the danger — distance is the danger**, taught with no text. Spawn outside, tether stretched, sweep inbound, the school visibly converging, and someone further out taken in view.

Getting this to happen reliably on a first launch is the whole task. It must not depend on luck: a player who does nothing must still see the lesson land on someone else.

- [ ] **Step 4: Tests**

Assert the *geometry*, not the pixels: on the first minute of a fresh shallows, the player starts outside shelter, a sweep is inbound within a bounded time, and at least one swimmer further out than the player is taken. Hand-derive the distances.

- [ ] **Step 5: Mutation-verify** by spawning the player inside the school and confirming the "starts outside" test fails.

- [ ] **Step 6: Screenshot** the first ten seconds of a fresh shallows — the stretched tether and the converging school. **I will open it.**

- [ ] **Step 7: Commit**

---

### Task 4: A shipped build, actually played

**Files:** none necessarily — this is a verification task, plus whatever it forces.

- [ ] **Step 1: Build and install it**

Produce a release build the way a player would receive one, install it, and launch it with **no arguments, no URL, no dev server, and no script**.

- [ ] **Step 2: Answer these, each with evidence**

1. Does it start its own node and reach it?
2. Does it land the player in water — shallows or open ocean — rather than an error or an empty sea?
3. If the identity is unsponsored, does the edge-of-the-water surface appear, and can the player still swim in the shallows?
4. Does `dist/` contain `shoal-two:` or any dev key derivation? (It must not.)

- [ ] **Step 3: Screenshot the installed application playing.** Not a dev server. **I will open it.**

- [ ] **Step 4: Report honestly**

If it does not play, say exactly where it stops. A truthful "it reaches the node and then shows an empty sea" is worth far more than a build that looks finished and is not. This task's value is entirely in its honesty.

- [ ] **Step 5: Commit** whatever the attempt forced.

---

### Task 5: Terrain — named places

**Files:** modify `shoal-client/src/ui/terrain.ts` and `src/ui/render.ts`; tests alongside.

- [ ] **Step 1: Why this is here and not in a later plan**

> The sea has a handful of named places — a kelp stand, a wreck, a drop-off, a shelf. This is the cheapest fix on the list and it repairs the most. Without it the minute between sweeps is "hold a heading", which is waiting. With it, that minute is *be near people, at the good spot, before the others get there.* (§2.13)

It is last because it can slip without blocking a playable build, and first-choice polish because it is the difference between playable and worth playing.

- [ ] **Step 2: Hand-author the places**

Four or five, with names a player would say out loud. **Terrain is hand-authored and purely a game object — never derived from, and never referring to, anything on the network** (§2.13, and §1.1's diegetic rule).

- [ ] **Step 3: Make them matter**

Blooms should appear at places rather than uniformly, so that a name is worth saying. Check whether bloom siting is CONSENSUS before touching it — if it is, this becomes a display-only change and the siting stays where it is. **Say which you found.**

- [ ] **Step 4: Tests + screenshot.** The sea with its places legible.

- [ ] **Step 5: Commit**

---

## Self-Review

**Spec coverage.** §2.16's shallows → Task 3. §2.18's teaching moment → Task 3. §2.13's terrain → Task 5. The shipped-build gap (open item 7) → Tasks 1, 2 and 4.

**Deliberately not here:** tides (§2.14), marks (§2.17), kin shielding, and shoal split/merge (§2.15) — all of which want an installable, playable build first. Room rotation (Blocker 1) is untouched and still needs a node-side tail fetch or a rotation design. The *granting* half of vouching (Blocker 2) stays open and costed in plan 4a's Task 4 report.

**Placeholders:** none. Tasks 1, 2, 3 and 5 specify decisions and obligations rather than full code — whether the node can sign for a cookie-authenticated caller, which sea a release build shows, how the teaching moment is made reliable, and whether bloom siting is consensus. All four are judgement calls the implementer should make, justify, and cite.

**Known risk:** Task 1's question 2 is the hinge. If the node cannot author with its own identity for a cookie-authenticated caller, the game needs a real key-management story in the shell and this plan grows a task. That answer should be reported the moment it is known rather than absorbed into an implementation.

**Known risk 2:** Task 4 is the only task here that can fail in a way the others cannot detect, because it is the only one that runs what a player would actually receive. It must not be skipped or simulated.
