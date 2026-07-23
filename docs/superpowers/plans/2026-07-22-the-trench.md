# The Trench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bespoke local PC game client (TheTrench.exe) for a new node-homestead game on its own mainnet app-class space — your node is your lantern.

**Architecture:** Pure client-side fold engine (`trenchEngine.ts`, reef pattern) over posts/replies in the `@trench:main` app space; Vite+React UI at the established production bar; Tauri 2 shell with the `sw` node bundled as a resource and spawned per desktop-app's proven `node_manager` machinery; node identity = player, signing via the `sign_message` RPC.

**Tech Stack:** TypeScript/React/Vite (ui), tsx assert-script tests, Tauri 2 + Rust (shell), hash-wasm + WASM Argon2id PoW worker (copied from reef-client), JSON-RPC over HTTP with cookie auth.

**Spec:** `docs/superpowers/specs/2026-07-22-the-trench-design.md` — read it first; it is the constitution.
**Worktree:** all work in `C:\github\swimchain-tutorial` on branch `launch-polish-and-fixes`.

## Global Constraints

- All engine quantities are stored in INTEGER HALF-UNITS (display divides by 2). Constants (half-units unless noted): `START_SALVAGE=20`, `COST_FARM=10`, `COST_STOREHOUSE=16`, `COST_BEACON=12`, `CAP_BASE=40` (per resource), `CAP_PER_STOREHOUSE=40`, `INTEGRITY_MAX=20`, `DECAY_LIT=1`, `DECAY_BASE=2`, `DECAY_DARK=4` (per day), `YIELD_LIT=4`, `YIELD_DIM=2`, `YIELD_DARK=1` (biomass per farm per day), `TEND_COST=4`, `HB_CAP_PER_DAY=6` (whole count), `LIT_MIN=25`, `DIM_MIN=8` (heartbeats per trailing 7 days, whole counts), `EXPEDITION_BASE_RANGE=6`, `RANGE_PER_BEACON=4` (Chebyshev distance, whole units), `CLAIM_MIN_SPACING=2` (Chebyshev, whole units), `GLOW_PER_STRUCTURE_LIT_DAY=1` (whole).
- **Fold isolation rule (spec §2):** a player's balances and claim state fold ONLY from replies on their own claim post. Cross-claim data (map positions, others' brightness, leaderboard) is display/driver input only.
- ALL time math uses embedded authoring-ms (`#<ms>~` suffix in move bodies, reef convention) quantized to UTC days (`Math.floor(ms / 86_400_000)`). Never wall clock in the fold. Banking auto-advances on EVERY folded move; live projections are display-only.
- Invalid moves fold as present-but-rejected with an outcome string (they still order the stream), mirroring reef.
- Move wire bodies (fit 466-byte action): `heartbeat #<ms>~`, `build <farm|storehouse|beacon> #<ms>~`, `harvest #<ms>~`, `tend <idx> #<ms>~`, `expedition <target16hex> <tx> <ty> #<ms>~`. Claim post body: `<name>\n\n{"v":1,"kind":"trench-claim","name":"<name>","x":<x>,"y":<y>}`.
- Space name `@trench:main` (app-class, deterministic id — `sha256("app:trench:v1:main")` with class byte 0x05; idempotent creation). Env vars: `VITE_TRENCH_SPACE`, `VITE_GAME_SPONSOR`, `VITE_RPC_ENDPOINT` — never ship a bundle without grep-verifying baked values (project law).
- Production bar (spec §4) is binding: abyss scene, map-as-stage + glassy sticky HUD rail, zero-jostle floating chrome, show-don't-tell teaching audited against the engine, ceremony beats, `prefers-reduced-motion` honored.
- Signature preimage for post/reply (node verifies): `content_hash(32) || timestamp_LE(8) || private_flag(1)`; POST hash = `sha256("${title}\n\n${body}")`, REPLY hash = `sha256(body)`; timestamp must equal the PoW-challenge timestamp. Sign via `sign_message` RPC (node identity). Submit via `submit_post` / `submit_reply` with `{ pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, signature, timestamp, author_id, ... }`.
- Conventional commits with trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never `git add -A`/`.`; never commit `dist/` or `node_modules/`.

---

### Task 1: Scaffold `trench-client/ui` + trenchEngine fold (TDD)

**Files:**
- Create: `trench-client/ui/package.json`, `trench-client/ui/vite.config.ts`, `trench-client/ui/tsconfig.json`, `trench-client/ui/index.html`, `trench-client/ui/src/main.tsx`, `trench-client/ui/src/vite-env.d.ts`
- Create: `trench-client/ui/src/lib/trenchEngine.ts`
- Create: `trench-client/ui/src/lib/trenchEngine.test.ts`

**Interfaces:**
- Consumes: nothing (pure module — no DOM, no RPC).
- Produces (used by Tasks 2–4):

```ts
export const TRENCH_SPACE: string; // import.meta-safe: (globalThis as any).importMetaEnv? no — use the reef pattern:
//   (import.meta as any).env?.VITE_TRENCH_SPACE ?? ''  — but the module must also load under plain tsx (tests):
//   guard every import.meta.env access with typeof checks exactly as reef-client/src/lib/reefEngine.ts:109 does.
export const GAME_SPONSOR: string;
// constants: every name/value from Global Constraints, exported.
export type StructureKind = 'farm' | 'storehouse' | 'beacon';
export type Brightness = 'LIT' | 'DIM' | 'DARK';
export type MoveOutcome = 'ok' | 'rejected-unaffordable' | 'rejected-capped' | 'rejected-unknown-structure'
  | 'rejected-ruined' | 'rejected-out-of-range' | 'rejected-day-gate' | 'rejected-malformed';
export interface ReplyLike { author_id: string; body: string | null; content_id: string; created_at: number; block_height: number | null; }
export interface Structure { kind: StructureKind; integrity: number; builtDay: number; ruined: boolean; }
export interface FoldedMove { op: string; day: number; ms: number; outcome: MoveOutcome; contentId: string; author: string; }
export interface ClaimHeader { v: 1; kind: 'trench-claim'; name: string; x: number; y: number; }
export interface ClaimState {
  header: ClaimHeader; owner: string; claimId: string;
  salvage: number; biomass: number;            // half-units, clamped to caps
  capSalvage: number; capBiomass: number;      // half-units
  structures: Structure[];                     // index-addressed by build order (ruins stay)
  brightness: Brightness;                      // as of lastDay
  heartbeatDays: Map<number, number>;          // UTC day -> accepted heartbeat count
  lastDay: number;                             // last banked UTC day (from newest folded move)
  glow: number;                                // whole units
  moves: FoldedMove[];
  expeditionDays: Map<string, number>;         // target16hex -> last expedition UTC day
}
export function parseClaimHeader(body: string | null | undefined): ClaimHeader | null;
export function embeddedMs(body: string): number | undefined;    // parses '#<ms>~'
export function utcDay(ms: number): number;                      // floor(ms / 86_400_000)
export function brightnessOn(heartbeatDays: Map<number, number>, day: number): Brightness; // trailing 7 days incl. `day`
export function foldClaim(claimId: string, owner: string, header: ClaimHeader, replies: ReplyLike[]): ClaimState;
export function aliveCount(s: ClaimState, kind: StructureKind): number;
export function expeditionRange(s: ClaimState): number;          // EXPEDITION_BASE_RANGE + RANGE_PER_BEACON * alive beacons
export function chebyshev(x1: number, y1: number, x2: number, y2: number): number;
export function salvageRoll(contentId: string): number;          // whole units 1..3: 1 + (parseInt(first hex byte of the id's hash part, 16) % 3)
export function project(s: ClaimState, nowMs: number): { biomass: number; salvage: number; structures: Structure[]; brightness: Brightness }; // display-only forward simulation, NEVER banked
export interface MapClaim { claimId: string; owner: string; header: ClaimHeader; ms: number; accepted: boolean; }
export function foldMap(claims: Array<{ claimId: string; owner: string; body: string; created_at: number }>): MapClaim[];
// order by (embeddedMs from the header line? claims have no #ms~ — order by created_at, tie by claimId);
// reject any claim with chebyshev < CLAIM_MIN_SPACING from an earlier-accepted claim, or malformed header.
```

**Fold semantics (implement exactly; the test file below is the executable spec):**
- Replies sorted by (embeddedMs ?? created_at, then content_id). Malformed bodies (no recognized verb) fold as `rejected-malformed` but still occupy stream order.
- **Banking:** before applying each move at day `D`, advance days `lastDay+1 .. D` one at a time: for day `d`, compute `b = brightnessOn(heartbeatDays, d)`; per ALIVE farm add yield (`YIELD_LIT/DIM/DARK` by `b`) to biomass clamped to cap; per structure subtract decay (`DECAY_LIT/BASE/DARK`; DIM uses `DECAY_BASE`) from integrity, marking `ruined=true` at ≤0 (integrity floors at 0; ruined structures never decay further, never produce, never count for caps/range); if `b === 'LIT'`, add `GLOW_PER_STRUCTURE_LIT_DAY` per alive structure to glow. The FIRST move's day initializes `lastDay` with no retro-banking (founding day = day of first move).
- **heartbeat:** if accepted count for its day < `HB_CAP_PER_DAY` → `ok`, increment that day's count (affects brightness from that day forward); else `rejected-capped`.
- **build <kind>:** cost from constants, paid in salvage; unaffordable → `rejected-unaffordable`; on ok, append `{kind, integrity: INTEGRITY_MAX, builtDay: D, ruined: false}` and (storehouse) raise both caps by `CAP_PER_STOREHOUSE`.
- **tend <idx>:** idx out of bounds → `rejected-unknown-structure`; ruined → `rejected-ruined`; biomass < `TEND_COST` → `rejected-unaffordable`; else pay and set integrity to `INTEGRITY_MAX`.
- **harvest:** always `ok`; banking (which already ran) is the effect.
- **expedition <target16> <tx> <ty>:** same target already visited on day `D` → `rejected-day-gate`; `chebyshev(own, target) > expeditionRange` → `rejected-out-of-range`; else `ok`, `salvage += 2 * salvageRoll(contentId)` (half-units), clamped to cap, and record the day.
- Caps clamp at write time; storehouse ruin does NOT retroactively spill resources but lowers caps for future banking (recompute caps from alive storehouses each day-advance).

- [ ] **Step 1: Scaffold the package** — copy reef-client's tooling shape. `trench-client/ui/package.json`:

```json
{
  "name": "@swimchain/trench-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "tsx src/lib/trenchEngine.test.ts"
  },
  "dependencies": {
    "@swimchain/core": "file:../../swimchain-js",
    "@swimchain/react": "file:../../swimchain-react",
    "hash-wasm": "^4.12.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "tsx": "^4.23.1",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  },
  "engines": { "node": ">=18.0.0" }
}
```

`vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/vite-env.d.ts`: copy from `reef-client/` verbatim, renaming titles to "The Trench" (index.html `<title>The Trench · Swimchain</title>`) and the dev port to 5195 (`server: { port: 5195, strictPort: true }`). `src/main.tsx` renders a placeholder `<div>The Trench</div>` for now (Task 3 replaces it). Run `npm install` in `trench-client/ui` (the `file:` deps resolve to the worktree's `swimchain-js`/`swimchain-react`; if `swimchain-js/pkg` is missing, copy it from `C:\github\swimchain\swimchain-js\pkg`).

- [ ] **Step 2: Write the failing test suite** — `trench-client/ui/src/lib/trenchEngine.test.ts`. Use the reef test conventions (`check(name, cond, extra?)` helper, `process.exitCode = failures ? 1 : 0`, run with `npx tsx`). Include EXACTLY these cases (constants imported from the engine; `DAY = 86_400_000`; helper `r = (body, ms, cid, author='A') => ({author_id: author, body, content_id: cid, created_at: ms, block_height: 10})`; helper `hb(n, day)` producing n heartbeat replies with distinct ms within that day; standard header `H = {v:1, kind:'trench-claim', name:'home', x:0, y:0}`):

1. `parse: claim header round-trips` — `parseClaimHeader('home\n\n{"v":1,"kind":"trench-claim","name":"home","x":3,"y":-2}')` returns x 3, y −2; malformed JSON → null.
2. `parse: embedded ms` — `embeddedMs('heartbeat #1753000000000~')` = 1753000000000; missing → undefined.
3. `fold: founding day initializes with start kit` — one `harvest` move on day 100 → salvage `START_SALVAGE`, biomass 0, lastDay 100, brightness DARK, no structures.
4. `heartbeat: cap enforced in-fold` — 8 heartbeats same day → 6 `ok` + 2 `rejected-capped`, heartbeatDays.get(day) === 6.
5. `brightness: tiers over trailing 7 days` — 25 accepted heartbeats spread across days D..D+6 (≤6/day) then a `harvest` on D+6 → LIT; with 8 → DIM; with 7 → DARK... (use 8 → DIM and 7 → DARK as separate sub-checks).
6. `build: farm costs salvage; unaffordable rejected` — build farm (ok, salvage 20→10), build farm (ok, →0), build farm (`rejected-unaffordable`).
7. `banking: farm yields by brightness across a day gap` — found + build farm on day D (salvage 20→10); keep LIT via 25 hb over D..D+6; `harvest` at D+7 → biomass = 6×`YIELD_LIT` + (days D+1..D+7 contribution — spell the exact expected number in the test by simulating the brightness of each day with the helper; assert the exact integer).
8. `banking: decay ruins an untended structure` — build farm day D, no heartbeats, harvest at D+11 → farm ruined (integrity 0) after ceil(20/2)=10 DARK... (DARK decay 4/day: dead after 5 days; assert ruined true and biomass gained only from days it was alive — assert exact).
9. `tend: repairs to full, costs biomass; ruined unrepairable` — assert `rejected-ruined` on a ruined idx and integrity reset on an alive one.
10. `storehouse: raises caps while alive; ruin lowers future caps` — caps 40→80 after build; after it ruins, a later banking day clamps to 40.
11. `expedition: roll, cap-clamp, day-gate, range` — same-target-same-day → `rejected-day-gate`; target at chebyshev 7 with no beacon → `rejected-out-of-range`; with a beacon (range 10) → ok; salvage increases by `2*salvageRoll(cid)` and `salvageRoll` returns 1..3 deterministically for a fixed cid (assert the exact value for cid `'sha256:00ab…'`-style fixed string).
12. `determinism: shuffled pending order folds identically` — same reply set, shuffled array order (ms embedded) → deep-equal salvage/biomass/glow/structures.
13. `glow: alive structures on LIT days` — 2 alive structures, 3 LIT days → glow 6.
14. `map: spacing rejection` — foldMap with claims at (0,0) ms=1, (1,1) ms=2, (5,5) ms=3 → accepted, rejected (chebyshev 1 < 2), accepted; malformed header claim → accepted:false.
15. `project: display-only` — project(state, +3 days) shows more biomass but a follow-up foldClaim over the same replies is unchanged.

- [ ] **Step 3: Run to verify failure** — `cd trench-client/ui && npx tsx src/lib/trenchEngine.test.ts` → resolve error (module missing).
- [ ] **Step 4: Implement `trenchEngine.ts`** to the contract above. Mirror reef's file organization (constants → types → parsing → fold → helpers) and its import.meta-env guard pattern for `TRENCH_SPACE`/`GAME_SPONSOR` so the module loads under tsx. Keep it pure: no DOM, no RPC.
- [ ] **Step 5: Run tests to green** — every `ok` line, exit 0. Also `npm run build` (placeholder UI compiles).
- [ ] **Step 6: Commit** — `feat(trench): fold engine + executable rule spec (ui scaffold)` (+ trailer). Add only `trench-client/ui/` sources (no node_modules, no dist).

---

### Task 2: Node plumbing — RPC client, PoW, submit paths, sponsorship

**Files:**
- Create: `trench-client/ui/src/lib/nodeRpc.ts` (JSON-RPC client + auth resolution)
- Create: `trench-client/ui/src/lib/pow.worker.ts` (copy `reef-client/src/lib/pow.worker.ts` verbatim)
- Create: `trench-client/ui/src/lib/trenchNet.ts` (foundClaim / submitTrenchMove / loadClaim / listClaims / ensureTrenchSponsored / requestClaimContent)
- Create: `trench-client/ui/scripts/regtest-smoke.ts` (integration proof)

**Interfaces:**
- Consumes (Task 1): `TRENCH_SPACE`, `GAME_SPONSOR`, `parseClaimHeader`, `foldClaim`, `foldMap`, `ReplyLike`.
- Produces (Task 3 relies on):

```ts
// nodeRpc.ts
export interface RpcAuth { endpoint: string; authHeader: string | null; }
export function resolveAuth(): Promise<RpcAuth>;
// order: 1) SWIMCHAIN_RPC_CONFIG postMessage envelope (listen once, 10s window — app-shell contract)
//        2) window.__TAURI__ present → invoke('get_rpc_config') (Task 4's command)
//        3) VITE_RPC_ENDPOINT env   4) http://127.0.0.1:9737 fallback (mainnet default RPC)
export function rpcCall<T>(auth: RpcAuth, method: string, params: unknown): Promise<T>;
export interface NodeIdentity { publicKeyHex: string; address: string; sign(msg: Uint8Array): Promise<Uint8Array>; }
export function nodeIdentity(auth: RpcAuth): Promise<NodeIdentity>; // get_identity_info + sign via sign_message {message: hex}

// trenchNet.ts
export function ensureTrenchSponsored(auth: RpcAuth, id: NodeIdentity, onPhase?: (p: string) => void): Promise<void>;
// thin wrapper over swimchain-react's ensureSponsored with { preferredSponsorHex: GAME_SPONSOR, strictPreferred: true, requiredSpaceId: TRENCH_SPACE }
export function foundClaim(auth: RpcAuth, id: NodeIdentity, name: string, x: number, y: number): Promise<string>; // returns claim content id
export function submitTrenchMove(auth: RpcAuth, id: NodeIdentity, claimId: string, body: string): Promise<string>; // appends ' #<ms>~' itself; returns content id
export function loadClaim(auth: RpcAuth, claimId: string): Promise<{ header: ClaimHeader; owner: string; state: ClaimState }>;
// get_content (claim post: parse owner + header) + get_replies { content_id, limit: 1000, depth_limit: 1 } → foldClaim
export function listClaims(auth: RpcAuth): Promise<MapClaim[]>; // list_space_content on TRENCH_SPACE → foldMap
export function requestClaimContent(auth: RpcAuth, claimId: string): Promise<void>; // request_content — the expedition hosting driver
```

- [ ] **Step 1: Copy the PoW worker** from reef verbatim; wire the same worker-usage helper reef's submit path uses (mine → `{ pow_nonce, pow_difficulty, pow_nonce_space, pow_hash, timestamp }`).
- [ ] **Step 2: Implement `nodeRpc.ts`.** The signature preimage and submit params are in Global Constraints; POST content hash is `sha256("${title}\n\n${body}")`, REPLY is `sha256(body)`; use `hash-wasm` sha256 like reef. `sign_message` returns `{ signature, public_key }` hex. Reference implementations to imitate (read them): `feed-client/src/hooks/useRpc.tsx:1099-1109` and `:1637-1646` (preimage assembly), `feed-client/src/hooks/useNodeIdentity.tsx:132-156` (sign via RPC), `launcher-apps/app-shell/web/embed.js:17-61` (envelope shape).
- [ ] **Step 3: Implement `trenchNet.ts`** per the contract (bodies per Global Constraints; `submit_post` params `{space_id: TRENCH_SPACE, title: name, body, author_id, ...pow, signature, timestamp}`; `submit_reply` `{parent_id: claimId, body, ...}`).
- [ ] **Step 4: Integration proof — `scripts/regtest-smoke.ts`** (run with `npx tsx`, env `TRENCH_RPC=http://127.0.0.1:29736` + cookie path arg). Against a local regtest node (`target/release/sw --regtest node start --listen 127.0.0.1:29735 --data-dir <scratch>`; if no release binary exists, `cargo build --release` first — or use an existing regtest node if one is already listening): create identity via CLI if absent, then in the script: resolveAuth from explicit env/cookie → `create_space` name `@trench:main` (idempotent app space; RPC method `create_space`, or shell out to `sw --regtest space create --name "@trench:main"`) → foundClaim('smoke', 0, 0) → submitTrenchMove heartbeat → submitTrenchMove 'build farm' → loadClaim → assert: state.structures.length 1, salvage `START_SALVAGE - COST_FARM`, heartbeat accepted. Print PASS/FAIL lines, exit code accordingly. (Regtest bypasses sponsorship level checks; if `submit_post` still requires sponsorship on regtest, self-sponsor via `sw --regtest sponsor direct <address>` from the same identity or relax to documenting the exact failure — the smoke must end green and honest.)
- [ ] **Step 5: Run** `npm run build` (types compile) + the smoke script → PASS lines, exit 0.
- [ ] **Step 6: Commit** — `feat(trench): node RPC plumbing, PoW submit paths, sponsorship + regtest smoke` (+ trailer).

---

### Task 3: Game UI — screens and flow (browser dev mode)

**Files:**
- Create: `trench-client/ui/src/App.tsx`, `src/TrenchMap.tsx`, `src/Homestead.tsx`, `src/HowToPlay.tsx`, `src/CoachCard.tsx`, `src/styles.css` (replace scaffold placeholder in `main.tsx` with `<App/>`)

**Interfaces:**
- Consumes: everything Tasks 1–2 produce (exact names above).
- Produces: the complete playable UI. No new exports consumed later (Task 4 wraps it).

**Screens & flow (functional pass — production polish is Task 3b but structure lands here):**
- **Boot:** resolveAuth → node status poll (`get_status` optional; degrade gracefully) → nodeIdentity → `ensureTrenchSponsored` gate (phased copy like reef's) → if no claim by this identity in `listClaims()` → **founding flow**: name input + click-to-place on the map (client enforces `CLAIM_MIN_SPACING`), confirm → `foundClaim`.
- **Main layout:** `game-cols` split (map stage left, HUD rail right) — the reef/chess shell pattern.
- **TrenchMap:** pannable (drag) DOM/absolute-positioned field, 24px per map unit, claims rendered at (x,y) with name labels; own claim ringed; brightness from each claim's folded state where loaded, else neutral; click a claim → selects it (detail in HUD; expedition button if in range and not own).
- **HUD rail:** lantern panel (node connected? heartbeats today n/6, brightness tier with icon, uptime this session), resources (salvage/biomass over caps, half-units displayed ÷2), structures list (integrity bars, tend buttons, ruined badges), build palette (three cards with cost chips, disabled when unaffordable), glow + leaderboard (fold glow for every loaded claim, sorted), selected-claim panel (owner, brightness, Expedition button).
- **Heartbeat scheduler:** while the app runs, every 10 min check: if accepted-heartbeats-today < `HB_CAP_PER_DAY` AND last heartbeat ≥ 4h ago (from folded state + pending), `submitTrenchMove('heartbeat')`. Never blocks UI; failures retry next tick; visible as the lantern "pulsing" state.
- **Move status:** floating glass bar over the map bottom (`move-float` pattern from chess) — "Your lantern signals the network…", "Building the kelp farm…" — no counters, no fullscreen overlays, zero reflow.
- **Polling:** own claim replies every 5s (fold + reconcile with optimistic pending, reef's monotonic-hold pattern simplified: hold optimistic until own-move count catches up, bounded 6 polls); map list every 30s; selected claim every 10s + `requestClaimContent` on selection and on expedition (the hosting driver).
- **Coach cards (CoachCard.tsx):** one slot floating over the map bottom, localStorage-keyed one-time cards: `found` ("This map is a shared space on the Swimchain — pick dark ground ≥2 units from a neighbor"), `lantern` (after founding: "Your lantern is your node — while this app runs, it burns. LIT farms grow fastest; go dark and the abyss advances"), `expedition` (first time a claim is selected: "Visiting a claim makes YOUR node host it — explorers keep this world alive"). Corrupt/absent storage → skip, never trap.
- **"?" panel:** HowToPlay.tsx — plain rules first with rendered mini structure/claim visuals + cost chips (all numbers from engine constants), lore last. Model on `reef-client/src/HowToPlay.tsx`.

- [ ] **Step 1:** Build App.tsx state machine (auth → identity → sponsor → claim? → play) with all hooks above any conditional return (React hooks law — reef learned it).
- [ ] **Step 2:** TrenchMap + Homestead + HUD per above; all copy plain-first; every number interpolated from engine constants (never literals).
- [ ] **Step 3:** Heartbeat scheduler + pollers + move-float statuses.
- [ ] **Step 4:** CoachCard + HowToPlay.
- [ ] **Step 5: Verify** — `npm run build` clean; `npm test` still green; manual dev run `npm run dev` against the Task-2 regtest node (set `VITE_RPC_ENDPOINT` + auth env for dev): found → heartbeat → build farm → tend → expedition against the smoke claim; screenshot each state.
- [ ] **Step 6: Commit** — `feat(trench): playable game UI (map, homestead, lantern scheduler, teaching)` (+ trailer).

---

### Task 3b: Production polish — the abyss

**Files:** Modify `trench-client/ui/src/styles.css`, `App.tsx`, `TrenchMap.tsx` (visual layer only — no logic changes)

Per spec §4, all binding:
- [ ] **Step 1: Abyss scene** — adapt the reef `Ocean` pattern darker: near-black depth gradient (`#020c11 → #000406`), NO light shafts (we're below them); sparse drifting bioluminescent motes (3 plankton layers, teal/violet), a subtle pressure vignette (`radial-gradient` inset shadow on the viewport). `prefers-reduced-motion` kills all of it.
- [ ] **Step 2: Light as the theme** — lit claims bloom (soft radial glow scaled by brightness); DIM flickers (2s opacity keyframe); DARK claims are barely-there outlines. Your own lantern in the HUD is a living flame (CSS glow pulse synced to the heartbeat scheduler's state).
- [ ] **Step 3: Ceremony beats** — founding: a light blooms outward from the new claim (one-shot keyframe, reef `claim-wave` pattern); structure ruining (observed in a poll diff): brief collapse animation + toast "the abyss takes the kelp farm"; brightness tier change: HUD lantern transition beat.
- [ ] **Step 4: Landing invitation** — "🏮 The Trench — homestead the lightless seafloor. Your node is your lantern." One pulsing **Play**; honest fine print (identity lives in your node's data dir on THIS machine).
- [ ] **Step 5: Verify** — build clean; dev-mode screenshot review of every state (landing, founding, lit/dim/dark claims, ceremony, panel); fix what looks wrong before committing. Commit `feat(trench): abyss production layer — light is the UI` (+ trailer).

---

### Task 4: Tauri shell — TheTrench.exe with node sidecar

**Files:**
- Create: `trench-client/src-tauri/Cargo.toml`, `tauri.conf.json`, `tauri.windows.conf.json`, `build.rs`, `src/main.rs`, `src/node_manager.rs`, `icons/` (generate via `tauri icon` from a 1024px lantern PNG rendered from an SVG committed at `trench-client/src-tauri/icons/source.svg`)
- Create: `trench-client/src-tauri/binaries/.gitignore` (`*` — binaries copied at build time, never committed)

**Interfaces:**
- Consumes: `trench-client/ui/dist` as `frontendDist`; Task 2's `resolveAuth` expects Tauri command `get_rpc_config` → `{ endpoint: string, auth: string | null }`.
- Produces: `TheTrench.exe` (NSIS installer + portable exe via `tauri build`).

**Implementation notes (copy, then trim, desktop-app's proven machinery — cite files while implementing):**
- [ ] **Step 1: `node_manager.rs`** — copy `desktop-app/src-tauri/src/node_manager.rs` and trim to mainnet-only + `--regtest` dev flag (env `TRENCH_NETWORK=regtest` for dev): keep `find_free_port_pair` (atomic (p2p, p2p+1) reservation), spawn `sw.exe node start --data-dir <dir> --listen 0.0.0.0:<p2p>` with `SWIMCHAIN_PASSWORD` env, `kill_on_drop`, the 500ms early-exit check with the exit-code table (5 wrong password, 3 identity missing, other → generic) PLUS a new mapping: if stderr captured within the window contains `could not acquire lock`/`Resource temporarily unavailable` (sled lock), surface "The Trench's node is already running (another window or an orphaned process). Close it and retry." — this is the known trap with no dedicated exit code. Data dir: `%APPDATA%/the-trench/node` (dirs::config_dir().join("the-trench/node")).
- [ ] **Step 2: identity bootstrap** — first run: if `<data-dir>/identity.json` absent, generate a random 32-hex password, store at `<config>/the-trench/node-key-password.txt`, run `sw identity create --data-dir <dir>` with `SWIMCHAIN_PASSWORD` (desktop-app `main.rs:342-390` is the reference); subsequent runs read the stored password. This is deliberate convenience-over-vault for a game key; the UI's fine print says exactly where it lives.
- [ ] **Step 3: `main.rs`** — Tauri 2 app: on setup, resolve `binaries/sw.exe` from resources (desktop `main.rs:567-572` pattern), start node, register commands: `get_rpc_config` (prefer reading `<data-dir-with-suffix>/.rpc_addr` + `.cookie` handoff files — `launcher-apps/app-shell/src-tauri/src/rpc_handoff.rs` is the reference, more robust than port math; poll up to 10s for the cookie), `node_status` (running/pid/port), `restart_node`. Stop node on window destroyed + Drop (desktop `main.rs:673-683`).
- [ ] **Step 4: config** — `tauri.conf.json`: schema v2, `productName: "The Trench"`, `identifier: "io.swimchain.trench"`, `build.devUrl: http://localhost:5195`, `beforeDevCommand: "npm --prefix ../ui run dev"`, `frontendDist: "../ui/dist"`, `beforeBuildCommand: "npm --prefix ../ui run build"`; `tauri.windows.conf.json`: `resources: ["binaries/*.exe"]`. `build.rs`: copy desktop-app's `check_bundled_sw()` SHA-256 freshness gate verbatim (paths adjusted), and add a pre-step in the build docs: copy `target/release/sw.exe` into `trench-client/src-tauri/binaries/`.
- [ ] **Step 5: Verify** — `cargo build` compiles; `TRENCH_NETWORK=regtest npx tauri dev` boots: sidecar starts, cookie handoff resolves, UI reaches the game against the local node; then `npx tauri build` produces the installer; run the built exe once (mainnet) and confirm the node launches and syncs (identity + sponsorship will complete only after Task 5's mainnet bootstrap — reaching the "sponsoring…" gate is the pass bar here).
- [ ] **Step 6: Commit** — `feat(trench): TheTrench.exe — Tauri shell with owned node sidecar` (+ trailer).

---

### Task 5: Mainnet bootstrap + distribution

**Files:**
- Create: `trench-client/ui/.env.production` (`VITE_TRENCH_SPACE=<sp1… printed by space create>`, `VITE_GAME_SPONSOR=<mainnet game sponsor pubkey hex — the same one reef/chess use, from reef-client/.env.production>`)
- Create: `website/` download page entry for The Trench (follow the mobile-APK page motif; link the built installer artifact)
- Create: `docs/games/THE_TRENCH.md` (player-facing: what it is, where the identity lives, uninstall notes)

**Steps (operator-privileged; the executing session holds the SSH keys and genesis identity per project memory):**
- [ ] **Step 1:** On the seed node (167.71.241.252, genesis identity): `sw space create --name "@trench:main"` → record the printed `sp1…` id. Verify `list_spaces` shows class app, `app: "trench"`.
- [ ] **Step 2:** Standing scoped sponsor offer from the always-on game sponsor identity: `sw sponsor invite --slots 500 --expires-hours 720 --space-scope <sp1…>` (mirror the reef/chess offer shape; confirm with `list_sponsorship_offers` that `auto_approve: true` and the scope is the trench space).
- [ ] **Step 3:** Seed the map: found 2–3 operator claims at spread coordinates (e.g. (0,0) "First Light", (9,4) "Mooring", (−7,6) "The Shelf") with a heartbeat + a farm each, so a new player's map is not empty water.
- [ ] **Step 4:** Bake + verify: write `.env.production`, rebuild the UI, `grep` the bundle for the `sp1…` id and sponsor hex (never ship unverified — project law), rebuild TheTrench.exe.
- [ ] **Step 5:** Full BVT on this machine with a CLEAN data dir (`%APPDATA%/the-trench` removed): install → landing → Play → node starts → auto-identity → auto-sponsor → found claim → heartbeat visible from a second node (check via seed node RPC `get_replies` on the new claim) → expedition to "First Light" → screenshots of every beat.
- [ ] **Step 6:** Publish the download page; commit `feat(trench): mainnet launch — space, sponsor, seeds, download page` (+ trailer); update PR.

---

## Self-Review (completed)

- **Spec coverage:** §1 rules → Task 1 (all constants + all five verbs tested); §2 protocol/determinism → Tasks 1–2 (fold isolation honored: foldClaim takes only own-claim replies; foldMap is display-only; expedition self-contained); §3 client → Tasks 2–4 (node identity via sign_message, .rpc_addr/.cookie handoff, lifecycle incl. sled-lock trap, all views); §4 production bar → Task 3b (binding, screenshot-verified); §5 testing → Task 1 suite + Task 2 smoke + Task 5 BVT; §6 rollout → Task 5. Out-of-scope list respected (no trade/forge/DARK-bonus anywhere).
- **Placeholders:** none — every step names exact files, exact constants, exact commands, or the exact reference implementation file:line to imitate.
- **Type consistency:** `ClaimState`/`MapClaim`/`RpcAuth`/`NodeIdentity` names match across Tasks 1→2→3→4; half-unit convention stated once in Global Constraints and used by the test numbers; `get_rpc_config` shape agreed between Task 2 (consumer) and Task 4 (producer).
