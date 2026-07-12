# Swimchain as a Replicated State Machine — Games (Chess + The Reef)

*Design note. Written 2026-07-12. Status: design agreed, not yet built.*

## Thesis

Strip the social-media client's policies away and Swimchain is a **general-purpose
replicated append-only state machine** with three properties baked in that most such
substrates lack: **total ordering**, **Sybil resistance** (per-action Argon2id PoW +
sponsorship trees), and **self-bounding storage** (decay + 50 MiB branch fracture).

The node is deliberately a **neutral mechanism** — store, replicate the chain, serve-on-
request, retrieve-on-request — with **zero application policy baked in**. "View-to-host"
is not a node rule; it is what *emerges* when the social client only retrieves what its
user looked at. A different client can adopt a different posture. Content retrieval is
intentional and client-driven *on purpose* — so a game client is free to eagerly replicate
an entire namespace.

The social feed is one application of this substrate. A **game** is another — and it is the
cleanest way to prove the substrate is general, because it is visibly *not* social media.

## What "repurposing" means, concretely

| | Social client | Game client |
|---|---|---|
| Chain data | lightweight actions + pointers | game inputs — the moves *are* the state |
| Heavy content | view-to-host, opt-in cache | full-replicated authoritative state |
| Decay | forget what nobody cares about | storage governor that keeps replication cheap |
| Spaces | topics / communities | **shards** (matches, regions) |

The game is a **deterministic automaton that every participant computes identically from the
ordered, PoW-gated action log.** The chain is shared RAM nobody owns; each client is a replica
of the same engine; players' actions are the inputs; world-state is a pure function of the
action sequence. This is exactly how chess clients derive a board from a move list, and how
P2P lockstep RTS engines (Age of Empires, Factorio) and blockchains already work — feasible
*for bounded games*.

## Design principles (the rules we converged on)

1. **Deterministic engine.** Byte-identical state from the same action log across all clients.
   No floats, no wall-clock, no iteration-order surprises.
2. **Spaces-as-shards.** Do **not** build one global simulation ("network-scale lockstep" is
   infeasible and is the wrong version). Partition the game into spaces — a match, a room, a
   region. Each participant lockstep-simulates only the shard(s) they are in. Scale by adding
   shards, not by making everyone simulate everything. Swimchain's space/namespace structure
   *is* the sharding, for free.
3. **Small, discrete moves live purely on-chain.** A move that fits in the action's data slots
   (or a tiny content body) is consensus data every node already has → offline-safe, no hosting
   dependency, decay-irrelevant. Prefer this. Rich blobs are possible (the game client full-
   replicates the namespace) but cost every participant storage, so keep per-shard state small.
4. **Epochs keyed to block height.** The world advances every N blocks. Every client runs the
   same resolution over that epoch's moves — **no privileged ticker; every client is the ticker.**
5. **Reorg-safe confirmation frontier.** A reorg can reshuffle which actions landed in which
   epoch. The world has a **confirmed frontier** (epochs past reorg depth = final) and a
   **tentative frontier** (recent epochs, shown optimistically, may re-resolve). Players act into
   the tentative present; the past hardens behind them.
6. **Decay is the storage governor, not a mechanic to chase.** Abandoned state decays out, so
   game nodes only ever replicate the *live* game. Make it diegetic where possible.
7. **PoW is pacing + anti-spam, diegetically.** Each move costs Argon2id seconds → no twitch
   play, natural throttle, no move-spam. Design *around* correspondence latency, never against it.
8. **Presence is not a mechanic.** Being online must not be rewarded (no "stay-online machine");
   attention must not be the score (that reimports the disease Swimchain cures). Your committed
   moves are on-chain regardless of whether you are online.

## Verified facts (as of 2026-07-12)

- **Non-custodial play works today.** `submit_post` / `submit_reply` / `submit_engagement` /
  `submit_edit` accept a **pre-signed, pre-PoW'd action**: the client supplies `author_id`, the
  64-byte `signature`, and the full PoW solution; the node builds the `Action` from those and
  never signs with a local identity (`src/rpc/methods.rs:2240`). Signatures are genuinely
  verified — `validate_action_signature` Ed25519-checks `content_hash‖timestamp`, and a forged
  signature is rejected (`src/blocks/validation.rs:359`, test at `:702`). The only author gate is
  `check_identity_sponsored` (genesis can satisfy this for demo players). **The node is already a
  non-custodial relay+validator** — a browser client holding its own keys, signing and doing
  Argon2id PoW in WASM, can play through any node without surrendering a key (the Nostr-relay model).
- **Eager namespace replication is a pure client behavior** — retrieval is client-driven by
  design, so the game client just requests every content ref in its namespace. No node change.
- **Chess needs zero node changes** — a game is a thread; the opening is a `submit_post`, each
  move a `submit_reply` (`"e2e4"` is a ~4-byte body); fold replies in order → the board.

## Game 1 — Correspondence Chess (the stepping stone)

The minimal proof that de-risks every primitive:

- 2-player shard = one thread in the `@game:chess` namespace.
- Opening = `submit_post`; each move = `submit_reply` (SAN/UCI in the body).
- Board = deterministic fold of replies in chain order. Turn-alternation serializes moves, so
  reorg is a near-non-issue.
- Legality is enforced **client-side** — every client validates the opponent's move against the
  rules and rejects the same illegal moves deterministically. Draw/resign are actions.
- Ships on today's RPC. No node changes. Proves: signed+PoW'd move as a tiny post, deterministic
  state from the action list, non-custodial submission, provable public game history.

## Game 2 — The Reef (the flagship)

A slow, persistent, shared world on Swimchain's own theme (tides, coral, currents) — a garden-MMO
no one can take down because no one runs it.

- **World = a grid of regions; each region is a space = a shard.** Replicate/simulate only the
  regions you are active in. Scale by adding regions.
- **A move** = grow / place / defend a coral cell, encoded as a tiny post in `@game:reef:<region>`
  → pure chain data, offline-safe, PoW-paced (growing costs effort, in-world).
- **Epochs keyed to block height.** Every client runs the same cellular-automaton-style growth/
  contest resolution over the epoch's moves. Confirmed frontier final; recent epochs tentative.
- **Decay is diegetic:** coral you stop tending recedes; abandoned regions fade to open water and
  drop out of replication — the storage governor, in-world. "Content that earns its place" becomes
  "reef that's tended survives."
- **Contest & alliance:** where two players' growth meets, the epoch rule resolves by accumulated
  PoW-weight / order. Deliberate borders; mutual-tending pacts emerge — but without survival panic,
  because your moves are on-chain regardless; allies just keep the *live* cells alive while you're away.
- No "win": a persistent world. Expression, territory, collaboration, rivalry. Optional seasonal
  scoring per region.

Why it is the flagship: **not social media**; it *demonstrates the repurposing* (a persistent world
= deterministic shared state from the ordered log); **players are literally the servers** (clients
replicate their regions); decay and PoW become game feel instead of plumbing; on-brand to the bone.

## Client architecture

- Browser UI + WASM: Ed25519 sign + **Argon2id PoW** in the tab; keys never leave the device.
- Submits pre-signed, pre-PoW'd actions via existing RPC to **a relay node or the player's own
  bundle node** (non-custodial either way).
- Reads chain state via RPC; **full-replicates `@game:*`** by intentionally requesting the namespace.
- Hosting muscle = the node population (desktop bundle today; a WebRTC-transport browser-native node
  is the eventual purist path). A pure browser tab can *play* through a relay but does not itself host.

## Remaining unknowns / build items

1. **Argon2id PoW in WASM** — expose the PoW path to the browser (crypto WASM already ships Ed25519/
   SHA-256/Bech32m).
2. **Determinism + reorg frontier** — implement the confirmed/tentative epoch model; audit the engine
   for nondeterminism.
3. **Sponsorship onboarding** — genesis auto-sponsors demo players; design the real onboarding later.
4. **Move encoding for The Reef** — decide tiny-content-post (works on existing RPC) vs a game-specific
   action packed into `content_hash`/`parent_id` slots; the former needs zero node changes and is the
   default for the prototype.

## Build path

- **Phase 0 — Chess.** Client + WASM PoW, on existing RPC. Proves the primitives end-to-end.
- **Phase 1 — Single-region Reef.** One grid, one space, epoch tick from block height, deterministic
  CA resolution, decay of untended cells, local rendering.
- **Phase 2 — Multi-region Reef.** Spaces-as-shards, cross-border contest, alliances, seasonal scoring.
