# The Trench — Design

**Date:** 2026-07-22
**Status:** Approved
**What:** A bespoke local PC game client (TheTrench.exe) for a new Swimchain game on its own
mainnet app-class space, where every player runs their own node as part of playing.

## Premise

You are a homesteader on the lightless seafloor. **Your node is your homestead's lantern.**
While your node runs, the lantern is lit: farms produce faster, the abyss keeps its distance.
Go dark too long and your structures decay into ruins other players scavenge. Hosting-as-work
(THESIS_09) made literal: the game's core meter is real node operation, and its exploration
mechanic is the network's content-retention driver.

## Success criteria

- A fresh Windows install reaches "playing, node running, sponsored, claim founded" with one
  download and no terminal.
- Every player's install is a real mainnet node; expeditions measurably re-host other players'
  claims.
- The client meets the established production bar (see §7) — it must read as a game from the
  first frame, not a web page in a frame.

## 1. Game rules (v1)

**Claim:** one per identity. Founded at (x, y) with a name on the shared trench map.

**Structures:** lantern (exists from founding — it is *run*, not built), kelp farm, storehouse,
beacon. No trade, no forge/parts in v1 (YAGNI — cut deliberately).

**Resources:** biomass (farms), salvage (expeditions, scavenging). Starting kit: 10 salvage.
Costs: farm 5 salvage · storehouse 8 · beacon 6. Storehouse raises resource caps; beacon widens
expedition range (map distance).

**Heartbeats — the node-operation mechanic:** while the game (and its sidecar node) runs, the
client auto-posts a heartbeat move at most once per 4 hours (cap 6/day; the cap is enforced in
the fold, not just the client). Lantern brightness = heartbeat count over the trailing 7 days:
**LIT ≥ 25 · DIM ≥ 8 · DARK < 8**. You cannot fake it without doing the thing it measures:
running a synced node that can post.

**Production & decay:** farm yields +2 biomass/day × brightness (LIT 1.0 · DIM 0.5 · DARK 0.25),
banked lazily at `harvest`. Structure integrity 10; −1/day base decay, ×½ when LIT, ×2 when
DARK; `tend <structure>` repairs to full for 2 biomass. Integrity 0 → the structure is a
**ruin** (stays on the map, scavengeable, not repairable — rebuild instead).

**Expeditions:** one move per target claim per UTC day, target must be within beacon range.
The expedition is a reply on the ACTOR'S OWN claim (`expedition <target-id-prefix> <x> <y>`),
so a player's balance folds entirely from their own reply stream — deterministic for every
observer regardless of which other claims they hold. Salvage roll 1–3 derives from the
expedition move's own content-id hash. Range and the per-target daily cap are enforced by the
client and folded permissively from the embedded target coords (known-permissive, like reef's
client-enforced rules; targets' real coords are cross-checked for display). The client issues
`request_content` for the visited claim and its replies — expeditions ARE the hosting driver
(design law: content-getting needs a driver).

**Prestige:** "glow" = cumulative lit-structure-days (a structure at integrity > 0 under a LIT
lantern earns 1 glow/day). Leaderboard in-client. No protocol privileges attach to glow.

## 2. Protocol & determinism

- **Space:** new app-class space on mainnet, founded by the genesis identity (same motif as
  reef/chess). The client ships the space id baked into its config. Standing auto-approve
  game-sponsor offer from the always-on sponsor bot → one-click first run.
- **Claim = post.** Body: title line + JSON header `{v:1, kind:'trench-claim', name, x, y}`.
  Coordinates are integers on an unbounded plane; claims must be ≥ 2 map units apart (fold
  rejects closer founding; ties by embedded ms then content-id).
- **Move = reply** with a compact text body (fits the 466-byte action): `heartbeat`,
  `build <farm|storehouse|beacon>`, `harvest`, `tend <structure>`, `expedition <claim-prefix>`
  — every body carries the reef-style embedded authoring-ms (`#<ms>~`) for stable ordering of
  pending moves.
- **World state = pure client-side fold** (`trenchEngine.ts`, the reef pattern). ALL time math
  uses embedded authoring-ms quantized to UTC days — never wall clock — so every node folds
  byte-identical state. Live "projected" production/decay is display-only; state banks at the
  next move. Moves that violate rules (over-cap heartbeat, unaffordable build, out-of-range
  expedition) are folded as rejected-but-present (they still order the stream), mirroring reef.
- **Fold isolation rule:** a player's balance and claim state fold ONLY from replies on their
  own claim post. Cross-claim data (neighbor positions, brightness, ruins) is display/driver
  input, never balance input — this is what keeps every observer's fold byte-identical even
  when they host different subsets of the map.

## 3. Client — TheTrench.exe

- **Layout:** new top-level `trench-client/` with `ui/` (Vite + React + TypeScript, reef-client
  idioms: engine lib + tsx assert tests, App orchestration, plain-first copy) and `src-tauri/`
  (Tauri 2, copying desktop-app's proven machinery: bundled `sw.exe` sidecar, dedicated
  data-dir `%APPDATA%/the-trench/node`, mainnet network config, fixed local RPC port, cookie
  auth via the solved `get_rpc_auth` node-identity pattern).
- **The node's identity IS the player** (node-mode, not browser localStorage).
- **Lifecycle:** launch → start sidecar (or attach if port already serving; handle the known
  orphaned-sled-lock and exit-code traps from the desktop login saga) → sync → auto-sponsor if
  fresh → play. Exit → stop sidecar. Heartbeat scheduler runs while open; it never posts more
  than the cap and never blocks UI.
- **Views:** trench map (the stage — pannable field of claims at their x,y; lit claims glow,
  DIM flicker, DARK fade; your claim ringed); homestead panel (structures, integrity, tend/
  build/harvest); expedition flow (pick a visible claim, see range); node-as-lantern HUD
  (uptime, peers, height, heartbeats today — node telemetry rendered as game UI); glow
  leaderboard; "?" reference panel.

## 4. Production value (binding, not optional)

- **Diegetic-first (operator directive, 2026-07-23):** The Trench presents as a GAME, not a
  protocol showcase. Protocol vocabulary — node, chain, space, post, reply, signed, RPC,
  Swimchain — must not appear in gameplay copy (landing, HUD, coach cards, move statuses,
  founding flow). The world speaks for itself: lantern, the deep, the abyss, claims, neighbors.
  Exactly ONE quiet provenance line is permitted, at the end of the "?" panel's lore ("The
  Trench runs on the Swimchain network — no server, no company; its world is kept alive by
  its players."). Honesty is preserved without the lecture: the landing fine print still says
  the key lives only on this machine.

Per the established bar (see memory: production-value feedback; reef/chess shells):

- **Immersive abyss scene**: full-viewport deep-dark gradient, sparse bioluminescent particles,
  faint pressure-depth vignette; `prefers-reduced-motion` honored. Darker and heavier than the
  reef — this is the floor of the world.
- **The map is the stage**: fills the viewport, glassy sticky HUD rail beside it; landing is an
  invitation ("a lantern in the dark" motif) with one pulsing **Play**; never a text column.
- **Zero-jostle chrome**: all transient UI (move status, coach cards, notices) floats over the
  stage glass-style; nothing reflows. Waits are dressed in-world ("your lantern signals the
  network…"), never as counters.
- **Show-don't-tell teaching**: coach cards with kickers/progress, taught elements glow in
  sync; the "?" panel teaches with rendered claim/structure visuals and cost chips, plain rules
  first, lore last. Copy is audited against the engine — teaching copy never lies.
- **Ceremony**: founding a claim, a structure falling to ruin, and brightness tier changes get
  visible beats (light blooming, dark creeping), reusing the reef's ceremony patterns.

## 5. Testing

- `trenchEngine` tsx assert-suites: fold determinism across shuffled pending orderings;
  brightness tiers; lazy banking across UTC-day boundaries; decay/ruin transitions; heartbeat
  cap enforcement in-fold; expedition range/rolls/scavenge bonus; claim-spacing rejection.
- UI dev loop: browser against a local regtest node first; Tauri wrap after.
- BVT: fresh Windows profile → install → found claim → build farm → heartbeat visible on a
  second node → expedition against a seeded neighbor claim.

## 6. Rollout

1. Engine + tests. 2. UI in browser dev mode. 3. Tauri shell + sidecar → TheTrench.exe.
4. Mainnet bootstrap: genesis founds the space + sponsor wiring; seed 2–3 operator claims so
   the map isn't empty; website gets a download page (mobile-APK distribution motif).

## Out of scope (v1)

Trade/gifting, forge/parts, multi-claim empires, claim abandonment/transfer, macOS/Linux
builds (Windows first, like the launcher), in-client chat, DARK-ruin scavenge bonus (needs a
verifiable cross-claim fold — v2, likely via expedition receipts folded on the target).
