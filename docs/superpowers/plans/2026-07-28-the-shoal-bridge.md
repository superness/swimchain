# The Shoal — The Node Bridge

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the merged engine to a real node — read other swimmers' actions out of a space, write your own, and learn about theirs within seconds — with no UI.

**Architecture:** Six modules in `shoal-client/src/lib/`, layered so the parts that can be tested without a node are separated from the parts that cannot. The wire format and the log assembly are pure functions over fixtures. The RPC client, the live channel and the emitter are thin and injectable. A regtest smoke script proves two clients actually see each other.

**Tech Stack:** TypeScript 5.3, `tsx` assertion tests, `@swimchain/react` for signing and Argon2id action-PoW, plain `fetch` and `WebSocket`.

## Global Constraints

- **Integer math only in `src/lib/`.** No floats outside `fixed.ts`'s trig table. The wire format carries integers only.
- **No wall-clock reads inside pure code.** `Date.now()` is permitted **only** in the emitter and the live channel's driver, and must be injected as a `now()` parameter so tests can drive it. Never inside the fold, the wire codec, or the log assembly.
- **The wire format is CONSENSUS.** Spec §4 lists "Vector and eat-claim wire format" as permanent. Get it right the first time; a change re-scores every session ever played.
- **Tests compute expected values independently of the code under test** — hand arithmetic in comments, or a from-scratch loop. Never relax a test to match the code; work out by hand which side is wrong and report it.
- **Every load-bearing test must be mutation-verified**: break the implementation in the exact way the test names, confirm it FAILS with real verbatim output, revert, confirm ALL PASS. Evidence that could not have come from the committed code is worse than no evidence. Eight tests on the previous two plans passed while proving nothing — assume yours will too until a mutation says otherwise.
- **`npm test` runs `tsc --noEmit` first** and must stay clean. It is currently 467 checks across 11 files, all green; every existing check must stay green.
- **No player-facing copy in this library.** The diegetic rule (spec §1.1) bans node/chain/space/post/reply/Swimchain from anything a player sees. This layer produces no player-facing strings at all.
- Read spec §3.3–§3.5 and §3.9 before starting.

## Verified platform facts

Established by reading the node source, not assumed:

| Fact | Source |
|---|---|
| `GET /ws` upgrades to a WebSocket on the RPC port | `src/rpc/server.rs:841-852`, handler at `:1080` |
| Subscribe with `{"jsonrpc":"2.0","method":"subscribe","params":{"events":["content_new"]},"id":1}` | `src/rpc/events.rs:14-19` |
| Events arrive as notifications: `{"jsonrpc":"2.0","method":"event","params":{"type":"content_new","data":{…}}}` | `src/rpc/events.rs:21-24` |
| **Gossip ingestion publishes `content_new`** — so another player's action fires an event on your node | `src/node/router/router.rs:5947` |
| The event carries `content_id`, `content_type`, `space_id`, `author`, `thread_id` — **not the body** | `src/node/router/router.rs:5941-5952` |
| Local submission also publishes it | `src/rpc/methods.rs:2582`, `:3473` |
| Max 5 WS connections per IP, 1000 total | `src/rpc/events.rs:36-39` |

**No existing Swimchain client uses this stream** — chips, reef and trench all poll. The Shoal is the first, so treat the WebSocket as unproven in practice and keep the polling fallback load-bearing, not decorative.

---

## File Structure

| File | Responsibility |
|---|---|
| `shoalWire.ts` | Encode/decode a `Presence` or `EatClaim` to/from a reply body. **Consensus.** |
| `shoalRpc.ts` | JSON-RPC 2.0 over HTTP + auth resolution. Import-safe under plain `tsx`. |
| `shoalRoom.ts` | Space replies → ordered `LogEntry[]`, with the engine's tie-break |
| `shoalLive.ts` | Live-channel state machine (pure) — subscribe, backoff, fallback to polling |
| `shoalEmit.ts` | When to write a vector (pure decision) — coalescing, so continuous motion costs ~1 write per 3-8 s |
| `shoalSend.ts` | Mine PoW, sign, submit. Thin wrapper over `@swimchain/react` |
| `scripts/regtest-smoke.ts` | Two clients, one regtest node, each sees the other move |

---

### Task 1: The wire format

**Files:**
- Create: `shoal-client/src/lib/shoalWire.ts`
- Test: `shoal-client/src/lib/shoalWire.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Consumes: `Presence`, `EatClaim`, `LogEntry`, `Vec` from `shoalTypes.ts`; `HEADING_STEPS`, `WORLD_W`, `WORLD_H` from `shoalConst.ts`.
- Produces:
  - `encodePresence(vec: Vec, say?: string): string`
  - `encodeEat(cell: number): string`
  - `decodeBody(body: string, id: string, hash: string): LogEntry | null`
  - `MAX_SAY` (constant)

- [ ] **Step 1: Understand the two decisions this format locks in**

**One timestamp, not two.** `Presence` carries both `ms` (log ordering) and `vec.t` (dead-reckoning origin). Nothing in the engine validates that they agree, and an earlier review flagged exactly that as an unchecked invariant. **The wire carries a single `ms` and the decoder derives both from it**, so they cannot disagree — the invariant becomes structural rather than assumed. Say so in the module doc.

**Reject, never repair.** A malformed body returns `null` and the fold skips it. Never coerce, clamp, or guess — two clients that repair differently compute different worlds. This is the same rule `parseCheckpoint` follows.

- [ ] **Step 2: Write the failing test**

Create `shoal-client/src/lib/shoalWire.test.ts`. It must cover, each with a derived comment:

- **Round trip.** A vector encodes and decodes to exactly the same integers.
- **One timestamp.** The decoded `Presence` has `ms === vec.t`, and there is no way to express a body where they differ. Assert this directly.
- **Speech rides along.** A presence with a `say` decodes with both the vector and the text — this is what makes talking never cost a player their life (spec §2.4).
- **Rejection, exhaustively.** Every one of these returns `null`: empty string; unknown version tag; too few fields; too many fields; a non-integer coordinate; a negative `ms`; a heading outside `[0, HEADING_STEPS)`; a coordinate outside the world; a negative speed; a `say` longer than `MAX_SAY`; a `say` containing the field delimiter.
- **Heading is bounds-checked.** `COS[heading]` is a table lookup — an out-of-range heading yields `undefined` and poisons every position with `NaN`. Assert that a heading of `HEADING_STEPS` and of `-1` are both rejected.
- **The eat claim** round-trips its cell, and a cell outside the grid is rejected.
- **Determinism.** Encoding the same vector twice yields byte-identical output.

- [ ] **Step 3: Run it, confirm it fails** (no module).

- [ ] **Step 4: Implement**

Design the format yourself, subject to these requirements, and document the choice in the module header:

- Integers only, one line, no floats, no JSON (a body is small and hot; JSON's key order is a canonicality hazard you do not need).
- A version tag as the first field, so a future format is distinguishable rather than silently misparsed.
- A single `ms`.
- `say` last, so it cannot contain a field boundary — and validate that it does not contain the delimiter anyway rather than trusting position.
- Every numeric field validated against its real domain before construction: coordinates against `WORLD_W`/`WORLD_H`, heading against `HEADING_STEPS`, speed non-negative, cell against the bloom grid.

- [ ] **Step 5: Run it, confirm ALL PASS**

- [ ] **Step 6: Mutation-verify three rejections**

One at a time, reverting after each:
1. Remove the heading bounds check → expect the out-of-range heading checks to FAIL.
2. Make the decoder derive `ms` and `vec.t` from separate fields → expect the one-timestamp check to FAIL.
3. Remove the delimiter check on `say` → expect that rejection check to FAIL.

Record real verbatim output for each, then revert and confirm ALL PASS.

- [ ] **Step 7: Wire in and commit**

Add to `package.json`'s `test` script. Run `npm test`.

```bash
git add shoal-client/src/lib/shoalWire.ts shoal-client/src/lib/shoalWire.test.ts shoal-client/package.json
git commit -m "feat(shoal): consensus wire format for vectors and eat claims"
```

---

### Task 2: RPC plumbing

**Files:**
- Create: `shoal-client/src/lib/shoalRpc.ts`
- Test: `shoal-client/src/lib/shoalRpc.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Produces: `RpcAuth`, `rpcCall<T>(auth, method, params)`, `resolveAuth()`, `NodeIdentity`, `nodeIdentity(auth)`.

- [ ] **Step 1: Follow the established pattern**

`trench-client/ui/src/lib/nodeRpc.ts` is the reference and its header explains why it exists separately from `@swimchain/react`'s `SwimchainRpc` (that class takes credentials, not a ready-built `Authorization` header, which is what both the app-shell envelope and Tauri's `get_rpc_config` hand you). **Read it before writing.** Mirror its shape, including the property that made it valuable: it is import-safe under plain `tsx`, with no Vite and no DOM, so a smoke script can build an `RpcAuth` by hand.

Keep `resolveAuth`'s browser-only paths behind a lazy call so importing the module under Node never touches `window`.

- [ ] **Step 2: Write the failing test**

Test what is testable without a node, by injecting a fake `fetch`:

- A successful call returns `result` and sends a well-formed JSON-RPC 2.0 envelope — assert `jsonrpc`, `method`, `params` and a monotonically increasing `id`.
- A JSON-RPC `error` body rejects with a message that includes the code — a swallowed error here is invisible in production.
- An HTTP-level failure (500, or a body that is not JSON) rejects rather than returning `undefined`.
- The `Authorization` header is sent when `authHeader` is set, and **absent** when it is null — not sent as the string `"null"`.
- Two concurrent calls get distinct ids.

- [ ] **Step 3: Run, confirm failure. Step 4: Implement. Step 5: Run, confirm ALL PASS.**

- [ ] **Step 6: Mutation-verify**

Make the error branch return `undefined` instead of throwing → expect the error-body check to FAIL. Real output, revert, ALL PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(shoal): JSON-RPC plumbing, import-safe under tsx"
```

---

### Task 3: Assembling the log

**Files:**
- Create: `shoal-client/src/lib/shoalRoom.ts`
- Test: `shoal-client/src/lib/shoalRoom.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Consumes: `decodeBody` from `shoalWire.ts`; `orderLog` from `shoalEngine.ts`; `rpcCall` from `shoalRpc.ts`.
- Produces:
  - `interface RawReply { content_id: string; author_id: string; body: string; block_height: number | null }`
  - `repliesToLog(replies: readonly RawReply[]): LogEntry[]`
  - `fetchRoomLog(auth, spaceId, roomContentId): Promise<LogEntry[]>`

- [ ] **Step 1: Write the failing test**

`repliesToLog` is pure and is where the correctness lives. Cover, with derived comments:

- **Undecodable bodies are dropped, not thrown on.** A hostile or malformed reply *will* land on chain — the node cannot judge application semantics ([[project_fold_rules_are_permanent]]). One bad reply must not poison the room.
- **The author comes from the reply's `author_id`, never from the body.** Assert that a body claiming a different id does not change the decoded entry's `id`. This is the whole anti-spoofing property at this layer.
- **The hash comes from `content_id`**, and is what `orderLog` uses to break same-millisecond ties.
- **Output is ordered** exactly as `orderLog` orders it — verify against an independently-shuffled input.
- **Duplicate `content_id`s are collapsed**, keeping one — the node can serve the same reply twice across a paginated fetch.
- An empty list yields an empty log without throwing.

- [ ] **Step 2-5: RED, implement, GREEN.**

`fetchRoomLog` calls `get_replies` — note from `project_chips_and_dip` that it takes an **object** (`{content_id, limit}`), and that results must be filtered to the intended parent.

- [ ] **Step 6: Mutation-verify**

1. Take the author from the body instead of `author_id` → expect the spoofing check to FAIL.
2. Skip the dedupe → expect the duplicate check to FAIL.

Real output each, revert, ALL PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(shoal): assemble an ordered log from space replies"
```

---

### Task 4: The live channel

**Files:**
- Create: `shoal-client/src/lib/shoalLive.ts`
- Test: `shoal-client/src/lib/shoalLive.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Produces:
  - `type LiveState = 'connecting' | 'live' | 'polling' | 'stopped'`
  - `nextAction(state, event, nowMs): { state: LiveState; refetch: boolean; delayMs: number }` — **pure**
  - `startLive(opts): { stop(): void }` — the thin driver

- [ ] **Step 1: Separate the decision from the plumbing**

The state machine is pure and fully tested; the driver that owns the socket and the timer is thin and untested-by-unit. Everything interesting — when to refetch, when to back off, when to give up on the socket and poll — lives in `nextAction`.

**The polling fallback is load-bearing, not decorative.** No Swimchain client has used this WebSocket in production. If the socket never connects, or connects and goes silent, players must still see each other. Treat a socket that has delivered nothing for longer than the poll interval as no better than no socket.

- [ ] **Step 2: Write the failing test**

Drive `nextAction` through scenarios with an injected clock:

- A `content_new` for **our** space triggers a refetch.
- A `content_new` for a **different** space does not.
- Socket open moves `connecting → live`.
- Socket error/close moves to `polling` and schedules a reconnect with **increasing** backoff — assert the delays strictly increase, and that they are **capped**.
- A successful reconnect **resets** the backoff. (A backoff that only grows is the classic bug here — assert it.)
- In `polling`, a tick schedules a refetch at the poll interval.
- **Silence detection:** in `live`, if nothing has arrived for longer than the poll interval, a refetch happens anyway. Derive the threshold.
- `stop()` from any state reaches `stopped`, and `stopped` never schedules anything again.

- [ ] **Step 3-5: RED, implement, GREEN.**

The driver: open `ws://<host>/ws`, send the subscribe envelope from the verified facts table, parse notifications, feed them to `nextAction`, act on its answer. Node has no global `WebSocket` in older runtimes — accept a `WebSocketCtor` in `opts` so tests and the smoke script can inject one.

- [ ] **Step 6: Mutation-verify**

1. Remove the backoff reset on successful reconnect → expect that check to FAIL.
2. Remove silence detection → expect that check to FAIL.
3. Remove the space filter → expect the wrong-space check to FAIL.

Real output each, revert, ALL PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(shoal): live channel with a load-bearing polling fallback"
```

---

### Task 5: Deciding when to write

**Files:**
- Create: `shoal-client/src/lib/shoalEmit.ts`
- Test: `shoal-client/src/lib/shoalEmit.test.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Produces: `shouldEmit(last: Vec | null, intent: Vec, nowMs: number, lastEmitMs: number): boolean`, and `MIN_EMIT_GAP_MS`, `MAX_EMIT_GAP_MS` (both **policy**, not consensus).

- [ ] **Step 1: Understand what this is protecting**

Spec §3.3: a player never writes a step. They write a **swim vector**, and every other client dead-reckons from it — so continuous-looking motion costs about one write every 3–8 seconds. A new vector is emitted only on a **change of mind**: turn, stop, arrive, dart.

Two hard limits this must respect, both verified during plan 1: the local RPC write cap is 120/min (`src/rpc/rate_limiter.rs:70`), and `MAX_ACTIONS_PER_SPACE` is 2,000 with lowest-PoW-first eviction (`src/blocks/builder.rs:92`), which is what bounds a shoal at 15–25 swimmers. An emitter that writes per frame breaks both and evicts other players' speech.

These constants are **policy** — put them in the policy block and say so.

- [ ] **Step 2: Write the failing test**

- No prior vector → emit.
- An identical intent within `MIN_EMIT_GAP_MS` → do **not** emit.
- A heading change beyond a threshold → emit, even soon after the last.
- A stop (speed to zero) → emit promptly; stopping is a change of mind and other clients will otherwise keep reckoning you forward into open water.
- Nothing at all changes, but `MAX_EMIT_GAP_MS` has elapsed → emit a keep-alive, so presence does not expire under `PRESENCE_TTL_MS`. **Derive the relationship**: the keep-alive gap must be comfortably under the TTL, and assert that relationship rather than the bare number.
- A burst of tiny jitter never exceeds the rate cap — simulate a frame loop over a minute with an injected clock and assert the emit count against the write cap by hand.

- [ ] **Step 3-5: RED, implement, GREEN.**

- [ ] **Step 6: Mutation-verify**

1. Remove the `MIN_EMIT_GAP_MS` floor → expect the burst/rate-cap check to FAIL.
2. Remove the keep-alive → expect that check to FAIL.

Real output each, revert, ALL PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(shoal): emit a vector on a change of mind, not per frame"
```

---

### Task 6: Writing to the chain, and proving two clients meet

**Files:**
- Create: `shoal-client/src/lib/shoalSend.ts`
- Create: `shoal-client/scripts/regtest-smoke.ts`
- Modify: `shoal-client/package.json`

**Interfaces:**
- Produces: `sendPresence(ctx, vec, say?)`, `sendEat(ctx, cell)`, where `ctx` carries auth, space, room content id, keys and the PoW profile.

- [ ] **Step 1: Follow the reference implementation closely**

`trench-client/ui/src/lib/trenchNet.ts` is the reference. **Read its header first** — it documents a trap that will otherwise cost you hours: `verify_pow` picks its Argon2id config purely from the node's network mode, so mining with the wrong profile produces a hash the node can *never* match, at any difficulty. It calls `get_info` once per endpoint and caches the profile. Do the same.

The move is a **reply** to the room post, so the path is: `contentHashForReply(body)` → mine → `signAction` → `submit_reply`. The node re-derives the content hash itself.

- [ ] **Step 2: Write the smoke script**

`scripts/regtest-smoke.ts` — this is the deliverable that proves the bridge works, and it is the only place the whole stack runs together:

1. Against a running regtest node, create the room space and the room post if absent (idempotent — the script must be safe to re-run).
2. Two identities, both sponsored (regtest bypasses sponsorship at RPC ingestion but **not** at block inclusion — use the genesis seed, per `project_the_trench`).
3. Client A emits a swim vector. Client B fetches the room log and **sees A's vector**, decoded, with A's author id.
4. B emits its own. A sees it.
5. Both fold the same log with `foldShoal` and assert **identical fingerprints** — the two clients agree on the world.
6. Print a clear PASS/FAIL summary and exit non-zero on failure.

Do **not** add it to `npm test` — it needs a live node. Add it as a separate `npm run smoke` script and say in its header exactly how to start the node it expects.

- [ ] **Step 3: Run the smoke script against a real regtest node**

Start one, run it, and **paste the real output in your report**. If you cannot start a node in your environment, say so plainly and report the script as unverified rather than claiming a pass. An unrun smoke test reported as passing is worse than no smoke test.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(shoal): sign and submit moves, plus a two-client regtest smoke"
```

---

## Self-Review

**Spec coverage.** §3.3 (swim vectors, dead reckoning) → Tasks 1 and 5. §3.4 (the live channel over `content_new`) → Task 4. §3.5 (a room is a space) → Tasks 3 and 6. §4's "vector and eat-claim wire format" consensus row → Task 1.

**Deliberately not here:** any UI, canvas, or rendering (plan 2c); wild fish (plan 3); shallows, vouching, tides (plan 4); checkpoint *publication* over the network, which needs a policy for which peer's checkpoint to adopt and is better decided with a running shoal than in the abstract.

**Placeholders:** none. Tasks 1, 4 and 5 specify requirements and complete test obligations rather than full implementation code, deliberately — the wire format's exact layout, the state machine's shape and the emit thresholds all involve judgement the implementer should exercise and document. Every one has a complete, discriminating test specification that pins the behaviour.

**Type consistency:** `LogEntry`, `Presence`, `EatClaim`, `Vec` all come from the merged `shoalTypes.ts` and are not redefined. `RpcAuth` is defined once in `shoalRpc.ts`. `RawReply` is defined once in `shoalRoom.ts`.

**Known risk:** the WebSocket path is unproven in this codebase — no client has used it. Task 4's polling fallback is what makes that acceptable, and Task 6's smoke script is what will tell us whether the socket actually delivers. If it does not, the bridge still works and we will know precisely why.
