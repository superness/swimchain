# Surf C1 — Config-Handover Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `SWIMCHAIN_RPC_CONFIG` handover vulnerability in every client — a sibling/hostile frame can currently repoint a client's `rpcEndpoint` (stealing the real cookie) or spoof `nodeAddress`, because the shared hook accepts any origin *starting with* an allowlisted prefix, never checks `event.source`, and is last-writer-wins.

**Architecture:** One canonical, unit-tested pair of pure functions — `isConfigMessageTrusted` (exact-origin + `event.source === window.parent`) and `pickFirstConfig` (first-wins) — lands and is thoroughly tested once in the shared `@swimchain/frontend` package (which fixes chat-client, its only importer, for free). Every other client's forked/inline copy is rewired to the *identical* logic (imported where the client already depends on the package, copied verbatim otherwise) and grep-verified byte-identical to the canonical source. No poster changes are needed: recon confirmed every poster (desktop-app, mobile-app, surf-app, the launcher app-shell) already targets an exact origin, so tightening consumers breaks nothing.

**Tech Stack:** TypeScript, per-client Vite builds, `node --test` for the framework-free pure-function tests.

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `feat/surf-c-fleet`. Check PR state before the first push.

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` §2.2 ("Config-handover hardening (v1 prerequisite)") and §7 (the four security tests). This is Surf phase **C1** — the hard prerequisite the spec names for the Phase D dial; C2–C5 are separate plans.

## Verified facts this plan builds on (recon + spot-check 2026-07-30, file:line)

| Fact | Where |
|---|---|
| 7 distinct vulnerable implementations (not 8 — swimchain-frontend + chat share one): the canonical prefix-match `origin.startsWith(allowed)` with unbounded `'http://localhost'` accepts `http://localhostevil.com` | `feed-client/src/hooks/useParentRpcConfig.ts:33-50`, `search-client/.../useParentRpcConfig.ts:33-50`, `swimchain-frontend/src/hooks/useParentRpcConfig.ts:33-49`, `shoal-client/src/lib/shoalRpc.ts:390-401`, `trench-client/ui/src/lib/nodeRpc.ts:84-95` |
| forum + wiki are partially hardened (exact + port-bounded localhost) but still **no `event.source` check** and **last-writer-wins** | `forum-client/.../useParentRpcConfig.ts:38-48`, `wiki-client/.../useParentRpcConfig.ts:31-38` |
| NONE of the 7 checks `event.source`; all except shoal/trench are last-writer-wins (shoal/trench resolve-once = first-wins already) | recon |
| search-client added `tauri.localhost` to its allowlist but left the prefix bug — a fake fix | `search-client/.../useParentRpcConfig.ts:37-49` |
| Only `chat-client` imports the shared hook (`@swimchain/frontend`); feed/search/forum/wiki carry forked copies; shoal/trench reimplement inline in non-hook modules | `chat-client/src/hooks/useChatIdentity.tsx:35-39`, recon |
| EVERY poster already uses exact origin (`window.location.origin` or explicit), never `'*'` — so hardening consumers breaks no poster | `desktop-app/src/components/ClientFrame.tsx:62,84`, `mobile-app/src/App.tsx:77-96`, `launcher-apps/app-shell/web/embed.js:47-56`, `surf-app/web/handover.mjs` |
| desktop poster fires on iframe load + every 1s for 10s, all identical config at `window.location.origin` — so first-wins ignores the retries safely (retries are for delivery reliability, not reconfiguration) | `desktop-app/src/components/ClientFrame.tsx:53-95` |
| Surf's own outbound/readiness gate already has the §7 properties tested (`isFromFrame`, first-wins) — but that's the shell validating channel READY messages, NOT any client's `useParentRpcConfig` | `surf-app/test/handover.test.mjs:17-24` |
| Zero tests anywhere exercise `useParentRpcConfig`'s origin logic | recon |

## Global Constraints

- **The hardened trust check (identical in every client), copied verbatim from the canonical source:** a config message is trusted **iff** `event.source === window.parent` AND (`event.origin` is non-empty and exactly equals `window.location.origin`, OR `event.origin` is one of the exact strings `tauri://localhost` / `http://tauri.localhost` / `https://tauri.localhost`). **No prefix matching. No empty-origin bypass.** (Empty/`"null"` origin — from sandboxed/data: frames — is never trusted; the legit same-origin embed always produces a non-empty `event.origin === window.location.origin`.)
- **First-wins:** once a trusted config is accepted, later config messages (trusted or not) are ignored. Only the first *trusted* message counts — an untrusted message never sets the config and never "uses up" the first-win.
- **Allowlist adds the Tauri v2 origins** (`http(s)://tauri.localhost`) the spec says today's list rejects, alongside the v1 `tauri://localhost`. All matched **exactly**, never as prefixes.
- **No poster changes** — posters are already correct; this plan touches only consumer/inbound code. If a task finds itself editing a poster, stop and report.
- **DRY-in-logic, one tested source:** the pure functions are authored and tested once (Task 1, `@swimchain/frontend`); every other client's copy is **byte-identical** to that source (imported or copied verbatim) and grep-verified so. Drift is the enemy the recon already caught (search's fake fix).
- **Every touched client must still `tsc`-build** (its existing `tsc -b`/typecheck) and its poster→consumer handoff must still deliver config on the legit same-origin path.
- **Tests:** the four §7 security properties (sibling-inject rejected, prefix-origin rejected, non-parent-source rejected, second-config ignored) are proven once against the canonical pure functions with `node --test`, each with a mutation check. Per-client verification = byte-identical copy + build, not re-testing the same logic 7×.
- **Client fixes reach users only via redeploy** (website deploy / desktop release) — landing in the repo does not protect deployed users. A deploy sweep is noted as follow-up, out of this plan's scope.
- **Commits:** conventional + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; never push to a merged branch.

## File structure

```
swimchain-frontend/src/hooks/
  configTrust.ts          NEW — canonical pure functions (isConfigMessageTrusted, pickFirstConfig, TRUSTED_PARENT_ORIGINS)
  configTrust.test.ts     NEW — the 4 §7 security tests + mutations (node --test)
  useParentRpcConfig.ts   MODIFY — rewire listener to configTrust (fixes chat-client, the only importer)
feed-client/src/hooks/useParentRpcConfig.ts     MODIFY — adopt canonical logic (copy configTrust verbatim or import)
search-client/src/hooks/useParentRpcConfig.ts   MODIFY — same
forum-client/src/hooks/useParentRpcConfig.ts    MODIFY — same
wiki-client/src/hooks/useParentRpcConfig.ts      MODIFY — same
shoal-client/src/lib/shoalRpc.ts                 MODIFY — harden isParentOriginAllowed + add event.source (already first-wins)
trench-client/ui/src/lib/nodeRpc.ts              MODIFY — same as shoal
```

---

### Task 1: Canonical hardened trust functions + §7 security tests (fixes chat-client)

**Files:**
- Create: `swimchain-frontend/src/hooks/configTrust.ts`
- Create: `swimchain-frontend/src/hooks/configTrust.test.ts`
- Modify: `swimchain-frontend/src/hooks/useParentRpcConfig.ts` (rewire the listener; it's imported only by chat-client)
- Modify: `swimchain-frontend/src/hooks/index.ts` (export the new functions)

**Interfaces:**
- Consumes: nothing.
- Produces (every later task copies or imports these EXACT signatures):
  - `TRUSTED_PARENT_ORIGINS: ReadonlySet<string>` — the exact cross-origin shell hosts.
  - `isConfigMessageTrusted(event: { origin: string; source: unknown }, ctx: { selfOrigin: string; parentWindow: unknown }): boolean`
  - `pickFirstConfig<T>(current: T | null, incoming: T): T` — returns `current` if non-null (first-wins), else `incoming`.

- [ ] **Step 1: Write the failing tests** (`swimchain-frontend/src/hooks/configTrust.test.ts`) — framework-free, plain objects for the event and the two windows:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isConfigMessageTrusted, pickFirstConfig } from './configTrust.ts';

const SELF = 'http://localhost:5173';
const parent = {};            // stands in for window.parent
const sibling = {};           // a different window object
const ctx = { selfOrigin: SELF, parentWindow: parent };

test('trusts an exact same-origin message from the real parent window', () => {
  assert.equal(isConfigMessageTrusted({ origin: SELF, source: parent }, ctx), true);
});

test('trusts the enumerated Tauri shell origins from the parent', () => {
  for (const o of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
    assert.equal(isConfigMessageTrusted({ origin: o, source: parent }, ctx), true);
  }
});

// §7: prefix-origin is rejected (the whole point).
test('rejects a prefix-lookalike origin', () => {
  assert.equal(isConfigMessageTrusted({ origin: 'http://localhostevil.com', source: parent }, ctx), false);
  assert.equal(isConfigMessageTrusted({ origin: 'http://tauri.localhost.evil.com', source: parent }, ctx), false);
});

// §7: a sibling / non-parent source is rejected even at a trusted origin.
test('rejects a message whose source is not window.parent', () => {
  assert.equal(isConfigMessageTrusted({ origin: SELF, source: sibling }, ctx), false);
  assert.equal(isConfigMessageTrusted({ origin: SELF, source: null }, ctx), false);
});

// empty/"null" origin is never same-origin.
test('rejects an empty origin', () => {
  assert.equal(isConfigMessageTrusted({ origin: '', source: parent }, ctx), false);
});

// §7: second config ignored (first-wins).
test('pickFirstConfig keeps the first accepted config', () => {
  const first = { rpcEndpoint: 'a' };
  const second = { rpcEndpoint: 'b' };
  assert.equal(pickFirstConfig(null, first), first);
  assert.equal(pickFirstConfig(first, second), first);   // second ignored
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run from the worktree root: `node --test swimchain-frontend/src/hooks/configTrust.test.ts`
(Node 22+ runs `.ts` directly via type-stripping; if THIS Node rejects the `.ts` import, use `npx tsx --test swimchain-frontend/src/hooks/configTrust.test.ts` — confirm the runner works before writing the impl, and use the same invocation in Step 4.)
Expected: FAIL — `Cannot find module ... configTrust`.

- [ ] **Step 3: Write `swimchain-frontend/src/hooks/configTrust.ts`**

```ts
// Canonical trust check for the SWIMCHAIN_RPC_CONFIG handover (Surf spec §2.2).
// A config message hands the client its RPC endpoint + cookie auth; accepting one
// from the wrong sender lets a hostile frame repoint every RPC call — including
// sign_message — at an attacker. So: the message must come from THIS frame's real
// parent window, and from an exactly-trusted origin. No prefix matching (that let
// http://localhostevil.com through); no empty-origin bypass.
export const TRUSTED_PARENT_ORIGINS: ReadonlySet<string> = new Set([
  'tauri://localhost',      // Tauri v1 shell
  'http://tauri.localhost', // Tauri v2 shell
  'https://tauri.localhost',
]);

export function isConfigMessageTrusted(
  event: { origin: string; source: unknown },
  ctx: { selfOrigin: string; parentWindow: unknown },
): boolean {
  // 1. Must originate from this frame's actual parent window — never a sibling,
  //    a child, or an unspecified source.
  if (event.source == null || event.source !== ctx.parentWindow) return false;
  // 2. Exact origin: the same-origin embed case (non-empty), or an enumerated
  //    trusted shell host. Never a prefix, never "".
  const origin = event.origin;
  if (origin && origin === ctx.selfOrigin) return true;
  return TRUSTED_PARENT_ORIGINS.has(origin);
}

// First-wins: once a trusted config is accepted, later ones are ignored.
export function pickFirstConfig<T>(current: T | null, incoming: T): T {
  return current ?? incoming;
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `node --test swimchain-frontend/src/hooks/configTrust.test.ts` (or the `npx tsx --test` form from Step 2) — all PASS.

- [ ] **Step 5: Mutation-check each §7 property** (apply, confirm the named test fails, revert, confirm pass):
1. Delete the `event.source !== ctx.parentWindow` guard (return only the origin result) → `rejects a message whose source is not window.parent` FAILS.
2. Change `origin === ctx.selfOrigin` to `origin.startsWith(ctx.selfOrigin)` AND swap `TRUSTED_PARENT_ORIGINS.has(origin)` for `[...TRUSTED_PARENT_ORIGINS].some(o => origin.startsWith(o))` → `rejects a prefix-lookalike origin` FAILS.
3. Change `pickFirstConfig` to `return incoming;` (last-wins) → `pickFirstConfig keeps the first accepted config` FAILS.
Record all three.

- [ ] **Step 6: Rewire `swimchain-frontend/src/hooks/useParentRpcConfig.ts`**

Replace the `ALLOWED_ORIGINS`/`isOriginAllowed` block and the listener body so that: the listener computes `ctx = { selfOrigin: window.location.origin, parentWindow: window.parent }` once, drops any message where `isConfigMessageTrusted(event, ctx)` is false, and on a `SWIMCHAIN_RPC_CONFIG` message sets `const next = pickFirstConfig(parentConfig, {...}); if (next !== parentConfig) { parentConfig = next; listeners.forEach(...) }` — so listeners are notified only on the first win. Keep the exported hook API (`useParentRpcConfig`, `getParentConfig`, `isInIframe`) and the config field shape unchanged. Add `export { isConfigMessageTrusted, pickFirstConfig, TRUSTED_PARENT_ORIGINS } from './configTrust'` to `index.ts`.

- [ ] **Step 7: Build check** — `cd swimchain-frontend && npm run build` (its `tsc` target) succeeds; `cd chat-client && npx tsc -b` succeeds (chat imports the rewired hook — proves the API is unchanged).

- [ ] **Step 8: Commit**

```bash
git add swimchain-frontend/src/hooks/configTrust.ts swimchain-frontend/src/hooks/configTrust.test.ts swimchain-frontend/src/hooks/useParentRpcConfig.ts swimchain-frontend/src/hooks/index.ts
git commit -m "feat(clients): canonical hardened config-handover trust check + tests (fixes chat)"
```

---

### Task 2: feed-client + search-client

**Files:**
- Modify: `feed-client/src/hooks/useParentRpcConfig.ts`
- Modify: `search-client/src/hooks/useParentRpcConfig.ts`

**Interfaces:**
- Consumes: Task 1's `isConfigMessageTrusted` / `pickFirstConfig` (exact signatures above).
- Produces: nothing new; leaf clients.

**Adoption rule (Tasks 2–3):** if the client's `package.json` already depends on `@swimchain/frontend`, `import { isConfigMessageTrusted, pickFirstConfig } from '@swimchain/frontend'` and delete the local origin logic. Otherwise **copy `configTrust.ts` verbatim** into the client's `src/hooks/` (byte-identical) and import from it. Never re-implement — a drifted copy is exactly search's fake fix. Record the route each client took.

- [ ] **Step 1: feed-client** — apply the adoption rule. Replace `ALLOWED_ORIGINS` + `isOriginAllowed` + the listener's accept logic so it drops any `!isConfigMessageTrusted(event, { selfOrigin: window.location.origin, parentWindow: window.parent })` message and uses `pickFirstConfig` (notify only on first-win). Keep the exported hook API and the `nodeAddress`/`nodeDisplayName` fields it already carries.

- [ ] **Step 2: search-client** — same change; also DELETE search's misleading "fixes the Tauri v2 rejection" comment.

- [ ] **Step 3: Verify byte-identical (copied clients only)** — for each client that copied `configTrust.ts`, run `diff swimchain-frontend/src/hooks/configTrust.ts <client>/src/hooks/configTrust.ts` and confirm no output (identical). For imported clients, `grep -n isConfigMessageTrusted <hook>` shows the import, not a local definition.

- [ ] **Step 4: Build check** — `cd feed-client && npx tsc -b` and `cd search-client && npx tsc -b` both succeed.

- [ ] **Step 5: Commit** — `git add` the two hooks (and any copied `configTrust.ts`), commit `fix(feed,search): exact-origin + event.source + first-wins config handover`.

---

### Task 3: forum-client + wiki-client

**Files:**
- Modify: `forum-client/src/hooks/useParentRpcConfig.ts`
- Modify: `wiki-client/src/hooks/useParentRpcConfig.ts`

**Interfaces:** consumes Task 1's functions; adoption rule as Task 2.

These two are partially hardened (exact + port-bounded localhost) but still miss `event.source` and are last-writer. Bring both to the canonical logic — do not leave their bespoke origin lists.

- [ ] **Step 1: forum-client** — replace the `validOrigins`/`isLocalhost` block and listener accept logic with the canonical `isConfigMessageTrusted` + `pickFirstConfig`, per the adoption rule. Note: forum's dev origin includes `http://localhost:<port>`; the canonical check covers this via the exact same-origin branch (`event.origin === window.location.origin`), so no per-port list is needed.

- [ ] **Step 2: wiki-client** — same; wiki already does exact-origin but still last-writer and no source check — the canonical functions add both.

- [ ] **Step 3: Verify byte-identical (copied clients only)** — `diff` each copied `configTrust.ts` against the canonical; grep imports for imported ones.

- [ ] **Step 4: Build check** — `cd forum-client && npx tsc -b` and `cd wiki-client && npx tsc -b` both succeed.

- [ ] **Step 5: Commit** — `fix(forum,wiki): exact-origin + event.source + first-wins config handover`.

---

### Task 4: shoal-client + trench-client (inline reimplementations)

**Files:**
- Modify: `shoal-client/src/lib/shoalRpc.ts` (`isParentOriginAllowed` ~390-401, `waitForParentConfig` ~411)
- Modify: `trench-client/ui/src/lib/nodeRpc.ts` (`isParentOriginAllowed` ~84-95)

**Interfaces:** consumes Task 1's functions. These are NOT React hooks and resolve config once (already first-wins by construction), so they need the **origin + event.source** fix, not the first-wins change.

**Note on these two:** they're inline `isParentOriginAllowed(win, origin)` helpers inside non-hook modules that don't currently receive `event.source`. The fix must thread `event.source` into the check. Two acceptable routes, per the adoption rule: (a) if the client deps on `@swimchain/frontend`, import `isConfigMessageTrusted` and call it from the `onMessage` handler with `{ origin: event.origin, source: event.source }` and `{ selfOrigin: win.location.origin, parentWindow: win.parent }`; (b) else copy `configTrust.ts` verbatim into the client and do the same. Either way, replace the prefix-matching `isParentOriginAllowed` and pass `event.source` through (today the handlers ignore it).

- [ ] **Step 1: shoal-client** — in `waitForParentConfig`'s `onMessage`, reject unless `isConfigMessageTrusted({ origin: event.origin, source: event.source }, { selfOrigin: win.location.origin, parentWindow: win.parent })`. Delete the old `isParentOriginAllowed` (prefix). The resolve-once behavior already gives first-wins — leave it. Update the module comment that claims it "mirrors every sibling client's useParentRpcConfig.ts" to state it now uses the canonical `configTrust`.

- [ ] **Step 2: trench-client** — same fix in `nodeRpc.ts`. (Trench is a desktop Tauri game; its parent-config path is the same shape. If trench has no test/build wired for CI, still run its `tsc`.)

- [ ] **Step 3: Verify byte-identical (copied clients only)** + grep for the removed prefix `startsWith` (should be gone from both files' config paths).

- [ ] **Step 4: Build check** — `cd shoal-client && npx tsc -b` (or its typecheck); `cd trench-client/ui && npx tsc -b`. Both succeed.

- [ ] **Step 5: Commit** — `fix(shoal,trench): exact-origin + event.source config handover`.

---

### Task 5: Whole-fleet integration verification (no poster broke; hostile frame rejected)

**Files:** none created — this is the gate that proves the seven fixes didn't break the legit handoff and DO reject an attacker.

**Interfaces:** consumes all prior tasks.

- [ ] **Step 1: Every touched client builds** — from the worktree root, run each client's typecheck and confirm zero errors: `swimchain-frontend`, `chat-client`, `feed-client`, `search-client`, `forum-client`, `wiki-client`, `shoal-client`, `trench-client/ui`. (chat/chips are the only CI-gated ones today; the rest are proven here.)

- [ ] **Step 2: Canonical test still green** — `node --test swimchain-frontend/src/hooks/configTrust.test.ts` (or the `tsx` form) — all §7 properties PASS.

- [ ] **Step 3: Legit poster path still delivers (the "no poster broke" proof).** Pick ONE client with a cheap dev server (feed-client) and drive it in a browser via CDP (the surf-app reports document the setup) OR reason it explicitly from code and record the trace:
  - Mount feed-client inside a same-origin parent that posts `SWIMCHAIN_RPC_CONFIG` from `window.location.origin` with `event.source` = the real parent (the desktop-app/mobile-app/surf pattern). Confirm the config is ACCEPTED (the hook returns non-null, RPC calls target the given endpoint).
  - The A1/B surf-app path is the highest-value live check: surf-app's shell posts config to its baked feed/wiki channels from `location.origin`. Run surf-app dev (mainnet, per the B reports) and confirm feed + wiki still receive config and render real content after the hardening — i.e. surf's own channels didn't regress. Record.

- [ ] **Step 4: Hostile-frame rejection (the security proof).** In the same CDP session (or a focused harness), post a `SWIMCHAIN_RPC_CONFIG` with `rpcEndpoint: 'http://attacker.test'` from (a) a sibling iframe's window (`event.source` ≠ parent) and (b) a prefix-lookalike origin `http://localhostevil.com`. Confirm BOTH are dropped — the client's endpoint is unchanged, and (dev builds) the "Rejected/Ignoring untrusted origin" or source-mismatch path is hit. If a full two-frame harness is too heavy, assert it at the unit level is already covered by Task 1's tests and record that the live check exercised the same `isConfigMessageTrusted` path.

- [ ] **Step 5: Deploy-gap note** — record in the report that these fixes protect users only after each client is redeployed (website deploy / desktop release) per the client-fix-distribution-gap constraint; the deploy sweep is a follow-up, not in this plan.

- [ ] **Step 6: Commit** — if any doc/note file is produced, commit it; otherwise this task is verification-only and the report captures the evidence (no commit needed).

---

## What C1 explicitly does not do

No poster changes (posters are already exact-origin); no consolidation of the 7 forks into one shared import beyond what the adoption rule does opportunistically (a full refactor onto one package is deferred debt); no `@swimchain/react` game clients (reef/chess/chips node-identity is **C2**); no sourcemap/size/signing work (**C3/C4**); no mobile-app replacement (**C5**); no client redeploys (follow-up); the desktop-app `ClientFrame` inbound LOG-message handler's `startsWith('tauri://')` (line ~108) is for log messages, not config — out of scope, noted for a later sweep.

## Self-review notes

- Spec §2.2's three required changes (exact-origin + tauri.localhost, `event.source === window.parent`, first-wins) are all in the canonical `isConfigMessageTrusted`/`pickFirstConfig` and applied to all 7 implementations (Tasks 1–4). §7's four security tests map to Task 1's test cases with mutation checks. Integration + no-poster-broke = Task 5.
- Type consistency: `isConfigMessageTrusted(event, ctx)` and `pickFirstConfig(current, incoming)` signatures are identical everywhere they appear (Tasks 1–5).
- The one behavioral edge (first-wins ignores a mid-session endpoint change) is safe: node ports are fixed per network mode and the desktop retry loop re-sends identical config; a genuine endpoint change would need a reload, which is acceptable and matches the spec's ruling.
