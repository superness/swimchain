# Surf C1 — Config-Handover Hardening Implementation Plan (rev 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **rev 2** folds an 8-finding adversarial review (all confirmed): endpoint-keyed merge (not naive first-wins) so the launcher's late-`nodeAddress` node-mode flip survives; the SECOND unguarded config listener in every social client's `useRpc.tsx`; vitest (not node:test) so the canonical test doesn't break the package build; concrete per-client import/copy routes; shoal's DOM-less type widening; per-client listener tests with the Task 5 waiver struck.

**Goal:** Close the `SWIMCHAIN_RPC_CONFIG` handover vulnerability in every client — a sibling/hostile frame can currently repoint a client's `rpcEndpoint` (stealing the cookie) or spoof `nodeAddress`, because the handover listeners accept any origin *starting with* an allowlisted prefix, never check `event.source`, and are last-writer-wins.

**Architecture:** One canonical, unit-tested pair of pure functions — `isConfigMessageTrusted` (exact-origin + `event.source === window.parent`) and `mergeTrustedConfig` (endpoint-keyed first-wins) — lands once in the shared `@swimchain/frontend` package. Every client that depends on that package (feed, search, wiki, chat) imports the functions; the rest (forum, shoal, trench) copy `configTrust.ts` byte-identical. In each client BOTH config listeners are hardened: the `useParentRpcConfig` hook AND the second, independent `useRpc.tsx` message listener the original census missed. No poster changes are needed.

**Tech Stack:** TypeScript, per-client Vite builds, **vitest** for the social clients' tests, **tsx** for shoal/trench.

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `feat/surf-c-fleet`. Check PR state before the first push.

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` §2.2 + §7. This is Surf phase **C1** — the hard prerequisite the spec names for the Phase D dial; C2–C5 are separate plans.

## Verified facts this plan builds on (recon + review + spot-check 2026-07-30, file:line)

| Fact | Where |
|---|---|
| Vulnerable prefix-match `origin.startsWith(allowed)` with unbounded `'http://localhost'` accepts `http://localhostevil.com`; NONE check `event.source` | `feed-client/src/hooks/useParentRpcConfig.ts:33-50`, `search-client/.../useParentRpcConfig.ts:33-50`, `swimchain-frontend/src/hooks/useParentRpcConfig.ts:33-49`, `shoal-client/src/lib/shoalRpc.ts:390-401`, `trench-client/ui/src/lib/nodeRpc.ts:84-95` |
| forum + wiki are partially hardened (exact + port-bounded localhost) but still no `event.source` and last-writer | `forum-client/.../useParentRpcConfig.ts:38-48`, `wiki-client/.../useParentRpcConfig.ts:31-38` |
| **SECOND unguarded listener in every social client's `useRpc.tsx`** — a `window.addEventListener('message')` firing on `SWIMCHAIN_RPC_CONFIG` with NO origin/source check. It doesn't read credentials (it triggers a reconnect via `getParentConfig()`), so it is NOT a cookie-theft path — but a forged early message trips it, removing the one-time reconnect handler before the legit config lands, disrupting the handoff. Must be gated too. | `feed-client/src/hooks/useRpc.tsx:262-269`, `chat-client/.../useRpc.tsx:283-289`, and search/forum/wiki `useRpc.tsx` (one each) |
| **Concrete adoption routes** (verified via each `package.json`): feed, search, wiki **depend on `@swimchain/frontend`** → import route. forum, shoal, trench do **not** → copy route. chat imports the shared hook (fixed by Task 1). | package.json deps |
| **Test runners** (verified): swimchain-frontend, feed, search, forum, chat = `vitest run`; **wiki has no `test` script** (add a vitest test file, run it with `npx vitest run <file>`); shoal, trench run `tsx <file>.test.ts` directly (no vitest). | package.json scripts |
| swimchain-frontend's `tsc` build compiles `src/**/*` and excludes only `src/**/__tests__/**` — so a test placed directly in `src/hooks/` **breaks `npm run build`** (node:test/@types/node + `.ts`-extension import errors). vitest's include is `src/**/*.test.ts`, which still matches files under `__tests__/`. **Placing the test under `src/hooks/__tests__/` satisfies both**: tsc excludes it, vitest runs it. | `swimchain-frontend/tsconfig.json:22-23`, `vitest.config.ts`, `package.json:38` |
| shoal's `shoalRpc.ts` is type-checked under a **no-DOM** tsconfig (`lib:["ES2022"]`); its hand-declared `MinimalWindow` has no `parent` and its message-event param has no `source` — so `win.parent`/`event.source` are TS2339 until the types are widened. shoal's build is `tsc --noEmit -p tsconfig.json` (no `references`, so `tsc -b` is wrong). trench includes DOM and is unaffected. | `shoal-client/src/lib/shoalRpc.ts:370-375,424`, `shoal-client/tsconfig.json:22,29` |
| **first-wins must be an endpoint-keyed MERGE, not `current ?? incoming`.** The live launcher poster `app-shell/web/embed.js` posts an early config with `nodeAddress=''`, then RE-POSTS the real `nodeAddress` once `get_identity_info` resolves — the intended node-mode-flip mechanism, which depends on a later message being honored. Naive first-wins would lock the empty-nodeAddress config and silently strand the client in browser-keypair mode. The merge locks endpoint+auth (a repoint is refused) but lets a same-endpoint later message fill an as-yet-empty `nodeAddress`/`nodeDisplayName`. | `launcher-apps/app-shell/web/embed.js:29-61`, `feed-client/.../identityMode.ts` (`nodeAddress.length>0 → 'node'`) |
| EVERY poster uses exact origin (`window.location.origin` or explicit), never `'*'` — hardening consumers breaks no poster's ORIGIN check. (The original plan's "identical retries" proof cited `desktop-app/ClientFrame.tsx`, which is DEAD CODE — replaced by AppGrid; the live poster is `app-shell`, handled by the merge above.) | `desktop-app/.../ClientFrame.tsx:62,84` (dead), `mobile-app/src/App.tsx:77-96`, `app-shell/web/embed.js:47-56`, `surf-app/web/handover.mjs` |
| Zero tests exercise any client's config-listener origin/source logic today | recon |

## Global Constraints

- **The hardened trust check (identical in every client):** a config message is trusted **iff** `event.source === window.parent` AND (`event.origin` is non-empty and exactly `window.location.origin`, OR `event.origin` is one of `tauri://localhost` / `http://tauri.localhost` / `https://tauri.localhost`). **No prefix matching. No empty-origin bypass.**
- **Endpoint-keyed first-wins:** the first trusted config's `rpcEndpoint`+`rpcAuth` are locked — a later message may not change them (repoint refused). A later *trusted, same-endpoint* message MAY fill an as-yet-empty `nodeAddress`/`nodeDisplayName` (the launcher's node-mode flip). Non-empty identity fields are never overwritten.
- **Both listeners per social client:** harden the `useParentRpcConfig` listener AND the `useRpc.tsx` second listener. The second listener must drop a message failing `isConfigMessageTrusted` before it touches its reconnect handler.
- **DRY-in-logic, one tested source:** `isConfigMessageTrusted`/`mergeTrustedConfig` are authored+tested once (Task 1, `@swimchain/frontend`). Import-route clients import them; copy-route clients hold a **byte-identical** copy (grep-verified). Never re-implement.
- **No poster changes.** If a task finds itself editing a poster, stop and report.
- **Every touched client must still build** (its real command: vitest clients `npx tsc -b` or `npm run build`; shoal `tsc --noEmit -p tsconfig.json`; trench `npx tsc -b`), and its legit handoff must still deliver config.
- **Tests:** the four §7 properties + the endpoint-merge behavior are proven against the pure functions (Task 1, vitest, with mutations). Additionally, EACH client gets a listener test driving its REAL handler(s) (findings require this — the pure fn passing doesn't prove the client wired it in). Per-client route: vitest for feed/search/forum/chat, a vitest file run via `npx vitest run` for wiki, tsx for shoal/trench.
- **Client fixes reach users only via redeploy** — landing in the repo does not protect deployed users; the deploy sweep is follow-up, out of scope.
- **Commits:** conventional + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; never push.

## File structure

```
swimchain-frontend/src/hooks/
  configTrust.ts               NEW — isConfigMessageTrusted, mergeTrustedConfig, TRUSTED_PARENT_ORIGINS
  __tests__/configTrust.test.ts NEW — §7 + merge tests (vitest; under __tests__ so tsc skips it, vitest runs it)
  useParentRpcConfig.ts        MODIFY — rewire listener to configTrust (fixes chat's hook)
  index.ts                     MODIFY — export the new functions
feed|search|wiki  (IMPORT route): useParentRpcConfig.ts + useRpc.tsx MODIFY; a vitest listener test
forum             (COPY route):   configTrust.ts NEW (verbatim) + useParentRpcConfig.ts + useRpc.tsx MODIFY; vitest test
chat              (shared hook):  useRpc.tsx MODIFY (second listener) + a vitest listener test
shoal|trench      (COPY, inline): configTrust.ts NEW (verbatim) + the inline config path MODIFY; a tsx test; shoal types widened
```

---

### Task 1: Canonical trust functions + §7/merge tests (fixes chat's hook)

**Files:**
- Create: `swimchain-frontend/src/hooks/configTrust.ts`
- Create: `swimchain-frontend/src/hooks/__tests__/configTrust.test.ts`  ← under `__tests__/` so `tsc` skips it, vitest runs it
- Modify: `swimchain-frontend/src/hooks/useParentRpcConfig.ts`, `swimchain-frontend/src/hooks/index.ts`

**Interfaces produced (every later task imports or copies these EXACT signatures):**
- `TRUSTED_PARENT_ORIGINS: ReadonlySet<string>`
- `isConfigMessageTrusted(event: { origin: string; source: unknown }, ctx: { selfOrigin: string; parentWindow: unknown }): boolean`
- `mergeTrustedConfig<T extends ParentRpcConfigLike>(current: T | null, incoming: T): T` where `ParentRpcConfigLike = { rpcEndpoint?: string; rpcAuth?: string; nodeAddress?: string; nodeDisplayName?: string }` — endpoint-keyed first-wins.

- [ ] **Step 1: Write the failing vitest test** (`swimchain-frontend/src/hooks/__tests__/configTrust.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { isConfigMessageTrusted, mergeTrustedConfig } from '../configTrust';

const SELF = 'http://localhost:5173';
const parent = {};
const sibling = {};
const ctx = { selfOrigin: SELF, parentWindow: parent };

describe('isConfigMessageTrusted', () => {
  it('trusts an exact same-origin message from the real parent window', () => {
    expect(isConfigMessageTrusted({ origin: SELF, source: parent }, ctx)).toBe(true);
  });
  it('trusts the enumerated Tauri shell origins from the parent', () => {
    for (const o of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost'])
      expect(isConfigMessageTrusted({ origin: o, source: parent }, ctx)).toBe(true);
  });
  it('rejects a prefix-lookalike origin', () => {   // §7
    expect(isConfigMessageTrusted({ origin: 'http://localhost.evil.com', source: parent }, ctx)).toBe(false);
    expect(isConfigMessageTrusted({ origin: 'http://tauri.localhost.evil.com', source: parent }, ctx)).toBe(false);
  });
  it('rejects a message whose source is not window.parent', () => {   // §7
    expect(isConfigMessageTrusted({ origin: SELF, source: sibling }, ctx)).toBe(false);
    expect(isConfigMessageTrusted({ origin: SELF, source: null }, ctx)).toBe(false);
  });
  it('rejects an empty origin', () => {
    expect(isConfigMessageTrusted({ origin: '', source: parent }, ctx)).toBe(false);
  });
});

describe('mergeTrustedConfig (endpoint-keyed first-wins)', () => {
  const base = { rpcEndpoint: 'http://127.0.0.1:9736', rpcAuth: 'Basic x', nodeAddress: '', nodeDisplayName: '' };
  it('accepts the first config', () => {
    expect(mergeTrustedConfig(null, base)).toBe(base);
  });
  it('fills an empty nodeAddress from a later same-endpoint message (launcher node-mode flip)', () => {
    const later = { ...base, nodeAddress: 'cs1abc', nodeDisplayName: 'Alice' };
    const merged = mergeTrustedConfig(base, later);
    expect(merged.nodeAddress).toBe('cs1abc');
    expect(merged.nodeDisplayName).toBe('Alice');
    expect(merged.rpcEndpoint).toBe(base.rpcEndpoint);
  });
  it('never overwrites an already-set nodeAddress', () => {
    const first = { ...base, nodeAddress: 'cs1first' };
    const later = { ...base, nodeAddress: 'cs1second' };
    expect(mergeTrustedConfig(first, later).nodeAddress).toBe('cs1first');
  });
  it('REFUSES a repoint: a later message changing rpcEndpoint or rpcAuth is dropped', () => {   // §7 + the security property
    expect(mergeTrustedConfig(base, { ...base, rpcEndpoint: 'http://attacker.test' })).toBe(base);
    expect(mergeTrustedConfig(base, { ...base, rpcAuth: 'Basic evil' })).toBe(base);
  });
});
```

- [ ] **Step 2: Run, verify it fails** — `cd swimchain-frontend && npx vitest run src/hooks/__tests__/configTrust.test.ts` → FAIL (module `../configTrust` not found).

- [ ] **Step 3: Write `swimchain-frontend/src/hooks/configTrust.ts`**

```ts
// Canonical trust check + merge for the SWIMCHAIN_RPC_CONFIG handover (Surf spec §2.2).
// A config message hands the client its RPC endpoint + cookie auth; accepting one from
// the wrong sender lets a hostile frame repoint every RPC call — including sign_message —
// at an attacker. So the message must come from THIS frame's real parent window at an
// exactly-trusted origin (no prefix, no empty-origin), and the endpoint/auth are locked
// after the first accept (repoints refused).
export const TRUSTED_PARENT_ORIGINS: ReadonlySet<string> = new Set([
  'tauri://localhost',      // Tauri v1 shell
  'http://tauri.localhost', // Tauri v2 shell
  'https://tauri.localhost',
]);

export function isConfigMessageTrusted(
  event: { origin: string; source: unknown },
  ctx: { selfOrigin: string; parentWindow: unknown },
): boolean {
  if (event.source == null || event.source !== ctx.parentWindow) return false; // event.source === window.parent
  const origin = event.origin;
  if (origin && origin === ctx.selfOrigin) return true;   // exact same-origin (the embed case), never ""
  return TRUSTED_PARENT_ORIGINS.has(origin);              // enumerated trusted shell hosts, exact
}

export interface ParentRpcConfigLike {
  rpcEndpoint?: string;
  rpcAuth?: string;
  nodeAddress?: string;
  nodeDisplayName?: string;
}

// Endpoint-keyed first-wins. First accept sets everything. A later trusted message may
// NOT change endpoint/auth (that's a repoint attack — refused), but MAY fill a still-empty
// nodeAddress/nodeDisplayName — the launcher posts the endpoint immediately and the real
// nodeAddress once get_identity_info resolves, and that late flip must survive.
export function mergeTrustedConfig<T extends ParentRpcConfigLike>(current: T | null, incoming: T): T {
  if (current == null) return incoming;
  if (incoming.rpcEndpoint !== current.rpcEndpoint || incoming.rpcAuth !== current.rpcAuth) {
    return current; // repoint refused
  }
  if (current.nodeAddress || !incoming.nodeAddress) return current; // already filled, or nothing new to fill
  return { ...current, nodeAddress: incoming.nodeAddress, nodeDisplayName: current.nodeDisplayName || incoming.nodeDisplayName };
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/hooks/__tests__/configTrust.test.ts` → all PASS.

- [ ] **Step 5: Mutation-check** (apply, confirm the named test fails, revert, confirm pass):
1. Delete the `event.source !== ctx.parentWindow` guard → `rejects a message whose source is not window.parent` FAILS.
2. Change `origin === ctx.selfOrigin` to `origin.startsWith(ctx.selfOrigin)` AND `TRUSTED_PARENT_ORIGINS.has(origin)` to `[...TRUSTED_PARENT_ORIGINS].some(o => origin.startsWith(o))` → `rejects a prefix-lookalike origin` FAILS (note: `http://tauri.localhost.evil.com` starts with `http://tauri.localhost`, so this input truly exercises the allowlist-prefix bug).
3. Delete the repoint guard (`if (incoming.rpcEndpoint !== ... ) return current;`) so it always merges → `REFUSES a repoint` FAILS.
4. Change `if (current.nodeAddress ...) return current;` to always return `current` → `fills an empty nodeAddress` FAILS.
Record all four.

- [ ] **Step 6: Rewire `swimchain-frontend/src/hooks/useParentRpcConfig.ts`** — replace the `ALLOWED_ORIGINS`/`isOriginAllowed` block; the listener computes `ctx = { selfOrigin: window.location.origin, parentWindow: window.parent }` once, drops any `!isConfigMessageTrusted(event, ctx)` message, and on a `SWIMCHAIN_RPC_CONFIG` message sets `const next = mergeTrustedConfig(parentConfig, {...}); if (next !== parentConfig) { parentConfig = next; listeners.forEach(fn => fn(parentConfig)); }`. Keep the exported API and config-field shape unchanged. Add `export { isConfigMessageTrusted, mergeTrustedConfig, TRUSTED_PARENT_ORIGINS } from './configTrust';` to `index.ts`.

- [ ] **Step 7: Build** — `cd swimchain-frontend && npm run build` succeeds (tsc skips the `__tests__` file); `npx vitest run` (whole package) green; `cd chat-client && npx tsc -b` succeeds (imports the rewired hook). **Note:** if chat/feed/search/wiki resolve `@swimchain/frontend` from its BUILT `dist/`, this `npm run build` is what makes the change visible to them — do it before their build checks in later tasks.

- [ ] **Step 8: Commit** — `git add swimchain-frontend/src/hooks/configTrust.ts swimchain-frontend/src/hooks/__tests__/configTrust.test.ts swimchain-frontend/src/hooks/useParentRpcConfig.ts swimchain-frontend/src/hooks/index.ts` → `feat(clients): canonical hardened config-handover trust + endpoint-keyed merge (fixes chat hook)`.

---

### Task 2: feed + search + wiki (import route) — both listeners

**Files (each client):** `src/hooks/useParentRpcConfig.ts`, `src/hooks/useRpc.tsx`, a new `src/hooks/__tests__/configListener.test.ts`

**Interfaces:** consumes Task 1's exports via `import { isConfigMessageTrusted, mergeTrustedConfig } from '@swimchain/frontend'` (all three depend on it — verified).

- [ ] **Step 1: `useParentRpcConfig.ts` (all three)** — replace each client's origin logic + listener accept with `isConfigMessageTrusted(event, { selfOrigin: window.location.origin, parentWindow: window.parent })` (drop untrusted) and `mergeTrustedConfig` (notify only when it changed). Keep the `nodeAddress`/`nodeDisplayName` fields. Delete search's stale "fixes the Tauri v2 rejection" comment.

- [ ] **Step 2: `useRpc.tsx` second listener (all three)** — the `window.addEventListener('message', ...)` that reacts to `SWIMCHAIN_RPC_CONFIG` must FIRST drop any message failing `isConfigMessageTrusted(event, { selfOrigin: window.location.origin, parentWindow: window.parent })`, before it touches its reconnect handler / `removeEventListener`. Same import.

- [ ] **Step 3: Per-client vitest listener test** (`src/hooks/__tests__/configListener.test.ts`, one per client) — construct the client's real message handler path (import the hook module; simulate `window.dispatchEvent(new MessageEvent('message', { data: {...}, origin, source }))` via a jsdom `@vitest-environment jsdom` file, or unit-test the extracted accept logic if the listener is a module-level singleton). Assert: (a) a first trusted same-origin config is stored; (b) a second trusted config that only fills nodeAddress is applied, but one changing rpcEndpoint is ignored; (c) a sibling-source config and a prefix-lookalike-origin config are both rejected (the stored endpoint is unchanged). Mutation-check by reverting THIS client's listener to the old prefix/no-source logic and confirming the test fails, then revert.
  - If a full jsdom dispatch is impractical in a client's setup, at minimum assert the client actually CALLS `isConfigMessageTrusted` with `event.source` passed through (a spy/import check) — the finding is that the pure fn passing doesn't prove the client wired it in.

- [ ] **Step 4: Verify + build** — `grep -n isConfigMessageTrusted <each hook and useRpc>` shows the import used at both listeners; `cd <client> && npx tsc -b && npx vitest run` green for feed, search, wiki. (wiki has no `test` script — run `npx vitest run` directly; if wiki lacks vitest as a devDep, add it or fall back to a tsx test and note it.)

- [ ] **Step 5: Commit** — `fix(feed,search,wiki): harden both config listeners (exact-origin, event.source, endpoint-keyed merge)`.

---

### Task 3: forum (copy route, both listeners) + chat's second listener

**Files:**
- Create: `forum-client/src/hooks/configTrust.ts` (byte-identical to canonical)
- Modify: `forum-client/src/hooks/useParentRpcConfig.ts`, `forum-client/src/hooks/useRpc.tsx`, `chat-client/src/hooks/useRpc.tsx`
- Create: `forum-client/src/hooks/__tests__/configListener.test.ts`, `chat-client/src/hooks/__tests__/configListener.test.ts`

**Interfaces:** forum does NOT depend on `@swimchain/frontend` → **copy** `configTrust.ts` verbatim and import from `./configTrust`. chat DOES import the shared hook (Task 1 fixed its `useParentRpcConfig`) but its `useRpc.tsx` second listener still needs hardening — chat imports `isConfigMessageTrusted` from `@swimchain/frontend`.

- [ ] **Step 1: forum copy** — copy `swimchain-frontend/src/hooks/configTrust.ts` verbatim to `forum-client/src/hooks/configTrust.ts`. Verify: `diff swimchain-frontend/src/hooks/configTrust.ts forum-client/src/hooks/configTrust.ts` → no output.

- [ ] **Step 2: forum's two listeners** — rewire `useParentRpcConfig.ts` (replace its `validOrigins`/`isLocalhost` block; forum's dev `http://localhost:<port>` is covered by the exact same-origin branch) and `useRpc.tsx`'s second listener, both to the copied `isConfigMessageTrusted` + `mergeTrustedConfig`.

- [ ] **Step 3: chat's second listener** — gate `chat-client/src/hooks/useRpc.tsx`'s `SWIMCHAIN_RPC_CONFIG` message listener on `isConfigMessageTrusted` (import from `@swimchain/frontend`) before its reconnect handler.

- [ ] **Step 4: Per-client vitest listener tests** — one for forum, one for chat, same shape/assertions as Task 2 Step 3 (first trusted stored; repoint refused / nodeAddress-fill accepted; sibling + prefix-lookalike rejected), each with the client-local mutation check.

- [ ] **Step 5: Verify + build** — `diff` forum's copy; `grep` both listeners in forum + chat use `isConfigMessageTrusted`; `cd forum-client && npx tsc -b && npx vitest run`; `cd chat-client && npx tsc -b && npx vitest run` — green.

- [ ] **Step 6: Commit** — `fix(forum,chat): harden config listeners (forum copies canonical, chat gates its second listener)`.

---

### Task 4: shoal + trench (inline, copy route) — widen shoal's types first

**Files:**
- Create: `shoal-client/src/lib/configTrust.ts`, `trench-client/ui/src/lib/configTrust.ts` (byte-identical to canonical)
- Modify: `shoal-client/src/lib/shoalRpc.ts`, `trench-client/ui/src/lib/nodeRpc.ts`
- Create: `shoal-client/src/lib/configTrust.test.ts`, `trench-client/ui/src/lib/configTrust.test.ts` (tsx-run)

**Interfaces:** neither depends on `@swimchain/frontend` → copy `configTrust.ts` verbatim into each. These modules resolve config once (already first-wins by construction), so they need the **origin + event.source** gate, not the merge. Their config path is not a React hook; it threads `event`/`win` through hand-rolled types.

- [ ] **Step 1: copy** — copy the canonical `configTrust.ts` verbatim into both `src/lib/`. `diff` each against the canonical → no output.

- [ ] **Step 2: widen shoal's DOM-less types** — in `shoal-client/src/lib/shoalRpc.ts`: add `parent: MinimalWindow;` to the `MinimalWindow` interface (~370-375), and add `source?: unknown` to the message-event object type wherever it's declared — the `addEventListener`/`removeEventListener` signatures (~372-373) and the `onMessage` closure param (~424). (trench includes DOM and needs no widening.)

- [ ] **Step 3: harden both inline config paths** — in shoal's `waitForParentConfig` `onMessage` and trench's `nodeRpc.ts` config path, delete the old prefix `isParentOriginAllowed` and reject unless `isConfigMessageTrusted({ origin: event.origin, source: event.source }, { selfOrigin: win.location.origin, parentWindow: win.parent })`. Keep the resolve-once behavior (first-wins by construction). Update shoal's module comment that claims it "mirrors every sibling client's useParentRpcConfig.ts" to reference `configTrust`.

- [ ] **Step 4: tsx tests** — `shoal-client/src/lib/configTrust.test.ts` and `trench-client/ui/src/lib/configTrust.test.ts` (plain node:assert, tsx-run to match the repo's existing tsx test convention) exercising the copied `isConfigMessageTrusted`: same-origin+parent trusted; prefix-lookalike rejected; sibling-source rejected; empty-origin rejected. Add each new file to the client's `test` script command (shoal appends `&& tsx src/lib/configTrust.test.ts`; trench appends `&& tsx src/lib/configTrust.test.ts`). Mutation: break the copied `isConfigMessageTrusted` (prefix) → the test fails; revert.

- [ ] **Step 5: Verify + build** — `diff` both copies; `grep -n startsWith` in the two config paths shows the prefix check is GONE; `cd shoal-client && npm run build` (i.e. `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.ui.json`) — **not `tsc -b`** (no `references`); `cd trench-client/ui && npx tsc -b`. Both succeed; run each client's `test` command incl. the new tsx test.

- [ ] **Step 6: Commit** — `fix(shoal,trench): harden inline config path (exact-origin + event.source), widen shoal DOM-less types`.

---

### Task 5: Whole-fleet integration — legit handoff survives, launcher node-mode flip survives, hostile frame rejected

**Files:** none created — the gate.

- [ ] **Step 1: Everything builds** — from the worktree root, build `swimchain-frontend` first (so importers see the change), then typecheck each client: `swimchain-frontend`, `chat`, `feed`, `search`, `forum`, `wiki`, `shoal` (`npm run build`), `trench-client/ui`. Zero errors.

- [ ] **Step 2: All tests green** — `cd swimchain-frontend && npx vitest run`; each vitest client's `npx vitest run`; shoal + trench `npm test` (incl. the new tsx config-trust tests). All PASS.

- [ ] **Step 3: Launcher node-mode-flip survives (the endpoint-merge proof).** Drive the `app-shell` empty-then-real handover OR reason it explicitly from code and record the trace: post a first trusted `SWIMCHAIN_RPC_CONFIG` with `nodeAddress:''`, then a second trusted same-endpoint message with the real `nodeAddress:'cs1...'`; confirm the embedded client (use feed) ends in NODE mode (`selectIdentityMode` → `'node'`), i.e. the merge applied the late nodeAddress. This is the regression the naive first-wins would have caused; it must be shown not to happen.

- [ ] **Step 4: Legit surf channels still receive config.** Run surf-app dev (mainnet, per the B reports' CDP setup) and confirm feed + wiki channels still receive their config from the shell (`location.origin`, `event.source === parent`) and render real content — surf's own baked channels didn't regress under the hardening.

- [ ] **Step 5: Hostile-frame rejection on the REAL listeners (no waiver).** Drive BOTH a copied-hook client (forum) and an inline client (shoal) — for each, post `SWIMCHAIN_RPC_CONFIG { rpcEndpoint:'http://attacker.test' }` from (a) a sibling window (`event.source` ≠ parent) and (b) a prefix-lookalike origin `http://localhost.evil.com`, and confirm BOTH are dropped by the client's real listener (endpoint unchanged; the second `useRpc.tsx` listener's reconnect handler is NOT tripped). Also post a second *trusted* config to confirm first-wins/merge on the live listener. (The Task 1 unit tests cover the pure fn; this step proves the wiring — the finding was that a per-client listener could drop `event.source` or never call the trust fn and still pass tsc.)

- [ ] **Step 6: Deploy-gap note** — record that these fixes protect users only after each client is redeployed (website deploy / desktop release); the deploy sweep is follow-up.

- [ ] **Step 7:** verification-only; the report captures the evidence (no commit unless a doc is produced).

---

## What C1 explicitly does not do

No poster changes; no consolidation of the forks beyond the adoption routes; no `@swimchain/react` game-identity work (reef/chess/chips is **C2**); no sourcemap/size/signing (**C3/C4**); no mobile-app replacement (**C5**); no client redeploys (follow-up); the desktop-app `ClientFrame` inbound LOG-message handler's `startsWith('tauri://')` is for log messages, not config — noted for a later sweep.

## Self-review notes (rev 2)

- Spec §2.2's three changes: exact-origin+tauri.localhost + `event.source` (isConfigMessageTrusted), endpoint-keyed first-wins (mergeTrustedConfig) — applied to BOTH listeners in every social client (Tasks 1–3) and the inline path in shoal/trench (Task 4). §7's four security properties map to Task 1's tests with mutations; the per-client listener tests (Tasks 2–4) prove the wiring; Task 5 proves legit handoff + node-mode-flip survival + hostile rejection.
- Type consistency: `isConfigMessageTrusted(event, ctx)` and `mergeTrustedConfig(current, incoming)` identical everywhere. shoal's type widening (Task 4 Step 2) is the one place the CALL needs the surrounding types adjusted.
- The endpoint-merge is the security-critical subtlety: endpoint+auth locked (repoint refused — the vuln), identity fields fill-once (the launcher flip preserved). Both directions tested (Task 1 Step 1) and mutation-checked (Step 5.3, 5.4).
