# Surf C2a — Node-Identity Adoption in the Game Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **rev 2** folds a 6-finding adversarial review (all confirmed). The critical one corrected a load-bearing seam error: `@swimchain/react`'s `setAuth` is the **transport** auth (it signs X-CS-* headers on EVERY `call()`), NOT an action-only seam like chat's `setRemoteSigner`. Wiring the RPC-backed node signer into `setAuth` would recurse forever (`call → sign → call('sign_message') → sign → …`). Corrected: in node mode the node signer is the game's `me.sign` (action-payload signing, which bypasses transport auth) **only**, and transport auth is the cookie via `authHeader`; `setAuth(browserKeypair)` is browser-mode only. Also folded: getParentConfig() initial-read + replay-on-subscribe (hang race), `isLoading` (mint-gate flash), and displayName from `parentConfig.nodeDisplayName` (get_identity_info returns no name).

**Goal:** Let reef/chess/chips run under the **node identity** (signing via the node's `sign_message` RPC) when embedded in Surf/desktop, instead of a throwaway browser keypair — so a Surf player's name, reputation, and game standing are their real node identity everywhere. Browser (standalone-tab) mode stays exactly as-is.

**Architecture:** Node-mode identity lands ONCE in the shared `@swimchain/react` package (all three games use it): a pure `selectIdentityMode`, the C1-canonical `configTrust` (copied byte-identical, since the games read the parent config too), a parent-config listener, an `authHeader` path on `RpcConfig`/`SwimchainRpc.call` + a wait-for-parent-config branch in `RpcProvider`, and a `useGameIdentity` hook (mode `node`|`browser`|`pending`) shaped like chat's `ChatIdentityContextValue`. **The two signing seams are DISTINCT and must not be conflated:** (1) `setAuth`/`SignatureAuth.sign` is the RPC **transport** auth — `call()` invokes it on every request to build X-CS-* headers; (2) the game's `me.sign`/`SignFn` is **action-payload** signing (`signAction` awaits it once per action and submits the signed action via `call()`, bypassing transport auth). A signer that itself makes an RPC (the node's `sign_message` signer) can live ONLY in seam 2 — putting it in seam 1 recurses forever. So in **node mode**: `me.sign` = the node signer; transport auth = the node cookie via `authHeader`; `setAuth` is **not** called. In **browser mode**: `me.sign` = browser keypair; `setAuth(browserKeypair)` provides transport auth as today. Either way the game-logic call sites (`submitReefMove`/`createRegion`/`submitMove`/`foldChips`/`planSend`) are untouched — they already await `me.sign`.

**Tech Stack:** TypeScript, `@swimchain/react` (vitest + happy-dom), per-game Vite. Node signer = `sign_message` RPC over loopback (the same seam C1 hardened and B's dwell uses).

**Worktree:** `C:\github\swimchain\.claude\worktrees\mobile-app`, branch `feat/surf-c-fleet` (on top of C1). Check PR state before first push.

**Spec:** `docs/superpowers/specs/2026-07-28-surf-channel-app-design.md` §2.5 ("identity and what it may do" — all channels share the node identity via nodeAddress; capability follows sponsorship: licensed-to-broadcast vs receive-only) and §5 C ("reef/chess/chips node-identity adoption"). This is **C2a**; baking chess/chips as Surf channels is **C2b** (operator decision, deferred to the C4/C5 sheet — only reef is a baked channel today).

## Verified facts this plan builds on (recon 2026-07-31, file:line)

| Fact | Where |
|---|---|
| **TWO DISTINCT seams (do not conflate).** Seam 1 = transport auth: `call()` invokes `this.signatureAuth.sign(messageBytes)` on EVERY request (no method filter) to build X-CS-* headers; set via `setAuth`→`setSignatureAuth`. Seam 2 = action-payload: `SignFn: (msg)=>Uint8Array\|null\|Promise<...>` awaited once in `signAction`, which then submits via `call()` (bypassing transport). A signer that itself calls `sign_message` (an RPC) can ONLY be seam 2 — seam 1 would recurse forever. `@swimchain/react` has NO `setRemoteSigner`; its `setAuth` IS seam 1 (unlike chat, which has both). | seam1: `swimchain-react/src/lib/rpc.ts:245-259` + `useRpc.tsx:163-171,218-219`; seam2: `swimchain-react/src/lib/signAction.ts:60-85` |
| The node signer lives in seam 2 (`me.sign`) only. In node mode `setAuth` is NOT called (transport = cookie via `authHeader`); browser mode still `setAuth(browserKeypair)`. Each game's `me`/`setAuth` effect is the swap point. | reef `reef-client/src/App.tsx:269-288`, chess `chess-client/src/App.tsx:92-113`, chips `chips-client/src/App.tsx:356-372` |
| `@swimchain/react` is 100% browser-local: no `useParentRpcConfig`, no `SWIMCHAIN_RPC_CONFIG`, no `sign_message`; `RpcProvider` auto-connects to a static config (`LOCAL_TESTNET`) | `swimchain-react/src/hooks/useRpc.tsx:84-226,174-201`; `swimchain-react/src/index.ts:46-132` |
| `RpcContextValue` = `{rpc, connected, connecting, error, nodeInfo, connect(config), disconnect(), setAuth(auth)}`; `setAuth` stores auth + calls `rpc.setSignatureAuth` | `swimchain-react/src/hooks/useRpc.tsx:31-52,163-171` |
| `RpcConfig` = `{endpoint, auth?{username,password}, timeout}` — **no `authHeader`**; `call()` only emits Basic from `auth` | `swimchain-react/src/lib/rpc.ts:152-162,260-263` |
| `useStoredIdentity()` → `{identity, hasIdentity, saveIdentity, clearIdentity}`, `hasIdentity = identity!==null`; browser keypair from `useStoredKeypair` (localStorage seed) | `swimchain-react/src/hooks/useStoredIdentity.ts:106-166,183-260` |
| Reference pattern: chat's `useChatIdentity` (mode `node`\|`browser`\|`pending` via `selectIdentityMode(parentConfig, inIframe)`) — node mode fetches `get_identity_info`, builds identity from `public_key`/`address`, signs via `sign_message`, NEVER mints a browser key; refuses stale browser identity when embedded | `chat-client/src/hooks/useChatIdentity.tsx:56-217`, `chat-client/src/hooks/identityMode.ts:27-37` |
| The Surf shell already posts the handover to reef (endpoint+auth+nodeAddress); reef receives + drops it today (no listener) | `surf-app/web/shell.mjs:988-996,377`, `surf-app/web/handover.mjs:19-27` |
| Mint gates to skip in node mode: reef `App.tsx:643-656`, chess `:256-269`, chips `:1904-1933` ("creates a game key stored only in this browser") | those lines |
| C1's canonical hardened trust is `swimchain-frontend/src/hooks/configTrust.ts` (isConfigMessageTrusted + mergeTrustedConfig); forum/shoal/trench already copy it byte-identical | C1 (merged surface) |
| Only reef is a baked Surf channel (`channels.json`: feed/wiki/reef); chess/chips are standalone → node identity is inert in Surf for them until C2b bakes them | `surf-app/web/channels.json`, `build-channels.cjs:15-19` |
| Test runners: `@swimchain/react` = `vitest run` (+ happy-dom, @testing-library/react); reef = tsx; chess = NO test script; chips = node | each `package.json` |
| CSP already covers all three games' WASM (`wasm-unsafe-eval` shipped in A1) + loopback connect-src | `surf-app/README.md` D4 |

## Global Constraints

- **Browser mode is the default and must not regress.** `selectIdentityMode` returns `'node'` ONLY when embedded (in an iframe) with a trusted parent config carrying a non-empty `nodeAddress`; otherwise `'browser'` (standalone tab, unchanged: localStorage keypair, the mint gate, all game flows). `'pending'` while embedded but config not yet arrived, **AND** while `mode==='node'` but `get_identity_info` hasn't resolved yet — surfaced via `isLoading` so the mint gate never flashes (see below).
- **Node signer = `sign_message`, seam 2 ONLY.** In node mode: `publicKey` = node's (`get_identity_info().public_key`), `sign(msg)` = `hexToBytes((await rpc.call('sign_message', {message: bytesToHex(msg)})).signature)`. This is the game's `me.sign` (action-payload) ONLY — **never `setAuth`** (that's transport seam 1; the node signer there recurses forever). Transport auth in node mode = the node cookie via `authHeader` (leave `signatureAuth` null). `me.sign` call sites are already async, so game logic is untouched.
- **`isLoading` guards the mint gate.** `selectIdentityMode` flips to `'node'` the instant `nodeAddress` arrives, but the identity is fetched async afterward (with retry backoff) — a window where `mode==='node'` yet `identity===null`, so `hasIdentity===false` and the `!hasIdentity||!me` mint gate would render the forbidden "creates a browser key" CTA while embedded. `useGameIdentity` MUST expose `isLoading` (true when `mode==='pending'`, OR `mode==='node' && !identity && !error`; mirror chat `useChatIdentity.tsx:208-212`), and each game guards `if (isLoading) return <connecting…/>` BEFORE the mint gate.
- **Display name comes from `parentConfig.nodeDisplayName`, NOT `get_identity_info`.** `get_identity_info` returns only `{has_identity, public_key, address}` (`src/rpc/types.rs:451-460`, `methods.rs:8719-8723`) — no name. Source displayName from `parentConfig.nodeDisplayName` (mirror chat `useChatIdentity.tsx:150-155`); note the Surf shell does NOT post `nodeDisplayName` today (`shell.mjs:990-994` sends only endpoint/auth/nodeAddress), so it will be empty in Surf unless the shell is taught to send it. chips must fall back to `nameFromKey(publicKeyHex)` when no displayName — never write a blank name to its public table.
- **Reuse C1's hardened trust.** The games read the parent config through the SAME `isConfigMessageTrusted` + `mergeTrustedConfig` C1 shipped — copied byte-identical into `@swimchain/react` (the C1 copy-route precedent: forum/shoal/trench). Never a prefix-match reimplementation.
- **`authHeader` carries the node cookie.** The parent config's `rpcAuth` is a raw `Basic …` header; `@swimchain/react`'s `RpcConfig`/`call` must carry it so the browser can even call `sign_message`/`get_identity_info` (they're auth-required). Additive field; browser mode (no authHeader) unchanged.
- **Embedded refuses a stale browser identity** (chat's split-brain guard): when embedded in node mode, ignore any localStorage identity — the node identity is authoritative.
- **Capability follows sponsorship (§2.5):** a node identity acts in a game's space only where sponsored; unsponsored → the game's actions get the node's -32015 (the receive-only state). C2a wires the identity; the sponsorship model is unchanged and out of scope (note it, don't build it).
- **No baking chess/chips as channels** (C2b, deferred). C2a makes them node-capable; only reef exercises it in Surf.
- **Tests:** the pure `selectIdentityMode` gets a vitest test with a mutation check (mirror chat's `identityMode.test.ts`); `useGameIdentity`'s node/browser branch selection is tested where feasible; each game must still `tsc`-build and its browser-mode path must be shown intact.
- **Commits:** conventional + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; never push to a merged branch.

## File structure

```
swimchain-react/src/
  lib/configTrust.ts            NEW — byte-identical copy of C1 canonical (isConfigMessageTrusted, mergeTrustedConfig)
  lib/identityMode.ts           NEW — pure selectIdentityMode(parentConfig, inIframe)
  lib/identityMode.test.ts      NEW — vitest, decision table + mutation
  lib/parentConfig.ts           NEW — the window listener (uses configTrust), getParentConfig/isInIframe/subscribe
  lib/rpc.ts                    MODIFY — RpcConfig.authHeader + call() emits it (Task 2)
  hooks/useRpc.tsx              MODIFY — RpcProvider waits for parent config when iframed; passes authHeader (Task 2)
  hooks/useGameIdentity.tsx     NEW — mode node|browser|pending; node signer via sign_message (Task 3)
  index.ts                      MODIFY — export the new hook + helpers
reef-client/src/App.tsx         MODIFY — identity via useGameIdentity; skip mint gate in node mode (Task 4)
chess-client/src/App.tsx        MODIFY — same (Task 5)
chips-client/src/App.tsx        MODIFY — same (Task 5)
```

---
## Tasks

### Task 1: `@swimchain/react` node-identity primitives (pure, tested)

**Files:**
- Create: `swimchain-react/src/lib/configTrust.ts` (byte-identical copy of C1 canonical)
- Create: `swimchain-react/src/lib/identityMode.ts` (pure `selectIdentityMode`)
- Create: `swimchain-react/src/lib/identityMode.test.ts` (vitest)
- Create: `swimchain-react/src/lib/parentConfig.ts` (the window listener, uses configTrust)
- Modify: `swimchain-react/src/index.ts` (export the new helpers)

**Interfaces produced (Tasks 2–5 import these EXACT signatures):**
- `ParentRpcConfig = { rpcEndpoint?: string; rpcAuth?: string; nodeAddress?: string; nodeDisplayName?: string }`
- `isConfigMessageTrusted(event, ctx): boolean` + `mergeTrustedConfig(current, incoming): T` (from configTrust — identical to C1)
- `selectIdentityMode(parentConfig: ParentRpcConfig | null, inIframe: boolean): 'node' | 'browser' | 'pending'`
- `isInIframe(): boolean`, `getParentConfig(): ParentRpcConfig | null`, `subscribeParentConfig(fn): () => void`

- [ ] **Step 1: copy the canonical configTrust** — copy `swimchain-frontend/src/hooks/configTrust.ts` **verbatim** to `swimchain-react/src/lib/configTrust.ts`. Verify byte-identical: `diff swimchain-frontend/src/hooks/configTrust.ts swimchain-react/src/lib/configTrust.ts` → no output. (Same copy-route precedent as forum/shoal/trench in C1 — never a reimplementation.)

- [ ] **Step 2: write the failing selectIdentityMode test** (`swimchain-react/src/lib/identityMode.test.ts`, vitest) — mirror `chat-client/src/hooks/identityMode.test.ts`'s decision table:
```ts
import { describe, it, expect } from 'vitest';
import { selectIdentityMode } from './identityMode';
const cfg = (nodeAddress?: string) => ({ rpcEndpoint: 'http://127.0.0.1:9736', rpcAuth: 'Basic x', nodeAddress });
describe('selectIdentityMode', () => {
  it('standalone tab → browser (never node, never pending)', () => {
    expect(selectIdentityMode(null, false)).toBe('browser');
    expect(selectIdentityMode(cfg('cs1abc'), false)).toBe('browser'); // not iframed ⇒ browser regardless of config
  });
  it('embedded, no config yet → pending', () => {
    expect(selectIdentityMode(null, true)).toBe('pending');
  });
  it('embedded with a non-empty nodeAddress → node', () => {
    expect(selectIdentityMode(cfg('cs1abc'), true)).toBe('node');
  });
  it('embedded but nodeAddress empty/absent → browser (config arrived, node has no identity to lend)', () => {
    expect(selectIdentityMode(cfg(''), true)).toBe('browser');
    expect(selectIdentityMode(cfg(undefined), true)).toBe('browser');
  });
});
```
Run `cd swimchain-react && npx vitest run src/lib/identityMode.test.ts` → FAIL (module not found).

- [ ] **Step 3: write `selectIdentityMode`** (`swimchain-react/src/lib/identityMode.ts`) — pure, mirroring `chat-client/src/hooks/identityMode.ts:27-37`:
```ts
import type { ParentRpcConfig } from './parentConfig';
// Standalone tab ⇒ always browser (localStorage keypair, the mint gate — unchanged).
// Embedded (in Surf/desktop) ⇒ wait for the parent config ('pending'); once it arrives,
// adopt the NODE identity iff it carries a non-empty nodeAddress, else fall back to browser.
export function selectIdentityMode(parentConfig: ParentRpcConfig | null, inIframe: boolean): 'node' | 'browser' | 'pending' {
  if (!inIframe) return 'browser';
  if (parentConfig == null) return 'pending';
  return parentConfig.nodeAddress && parentConfig.nodeAddress.length > 0 ? 'node' : 'browser';
}
```
Run → PASS.

- [ ] **Step 4: mutation-check** — (a) make it return `'node'` unconditionally when `inIframe` → `embedded but nodeAddress empty → browser` FAILS; (b) drop the `!inIframe` guard (always evaluate config) → `standalone tab → browser` (the `cfg('cs1abc'), false` case) FAILS. Record both, revert.

- [ ] **Step 5: write `parentConfig.ts`** — the module-level window listener, modeled on `swimchain-frontend/src/hooks/useParentRpcConfig.ts` but as a plain module (no React needed): holds a singleton `parentConfig`, `isInIframe()` = `window.parent && window.parent !== window`, `getParentConfig()`, `subscribeParentConfig(fn)`. The `message` handler computes `ctx = { selfOrigin: window.location.origin, parentWindow: window.parent }` once, drops any `!isConfigMessageTrusted(event, ctx)`, and on a `SWIMCHAIN_RPC_CONFIG` applies `mergeTrustedConfig` (endpoint-keyed first-wins, notify only on change). This is C1's hardened trust — the games get the same protection. SSR-guard `typeof window` for the vitest import.
  - **REPLAY-ON-SUBSCRIBE (review finding #2):** the module listener attaches at import and can populate the singleton BEFORE the React provider's `useEffect` subscribes (the shell posts on frame `load` — `shell.mjs:377` — which can beat React's post-commit effect). `subscribeParentConfig(fn)` MUST therefore invoke `fn(parentConfig)` synchronously on subscribe if the singleton is already set (like `useParentRpcConfig`'s `useState(parentConfig)` seed at `:84`), so a subscribe-after-emit still learns the config. Without this the provider hangs in `pending` forever. (Belt-and-suspenders with Task 2 Step 2's `getParentConfig()` mount read.)

- [ ] **Step 6: export + build** — add the new symbols to `swimchain-react/src/index.ts`; `cd swimchain-react && npm run build && npx vitest run` green. (Confirm the existing exports still resolve — `useStoredKeypair` etc. unchanged.)

- [ ] **Step 7: commit** — `feat(react): node-identity primitives (selectIdentityMode + hardened parent-config listener)`.

---

### Task 2: `@swimchain/react` RPC — carry the node cookie + wait for parent config

**Files:** Modify `swimchain-react/src/lib/rpc.ts`, `swimchain-react/src/hooks/useRpc.tsx`

**Interfaces:** `RpcConfig` gains `authHeader?: string`; `RpcProvider` gains an iframe-aware connect flow. No public hook API removed.

- [ ] **Step 1: `RpcConfig.authHeader`** — add `authHeader?: string` to `RpcConfig` (`rpc.ts:152-162`). In `SwimchainRpc.call` (`rpc.ts:260-263`), when `config.authHeader` is set, emit it as the `Authorization` header **raw** (it's already a full `Basic …` string); keep the existing `auth.username/password` Basic path as the fallback (browser mode / standalone). Mirror chat's `chat-client/src/lib/rpc.ts:125,282-284`.

- [ ] **Step 2: RpcProvider waits for parent config when iframed** — in `useRpc.tsx`'s auto-connect effect (`:174-201`): if `isInIframe()`, do NOT connect to the static `LOCAL_TESTNET`. **Mirror chat literally (`useRpc.tsx:262`):** on mount, `if (isInIframe() && getParentConfig())` build the connect config from the already-present singleton and connect IMMEDIATELY; only when `getParentConfig()` is null subscribe via `subscribeParentConfig` and connect once a trusted config arrives. The connect config = `{ endpoint: parentConfig.rpcEndpoint, authHeader: parentConfig.rpcAuth }`. Reconnect if a later trusted config fills a field (the merge already guards repoints). Standalone (not iframed) keeps the current static-config auto-connect **unchanged**. **The `getParentConfig()` mount read is load-bearing (review finding #2):** the module listener can populate the singleton before this effect runs; a subscribe-only path hangs forever when config already arrived.

- [ ] **Step 2b: guard the game default endpoint** — confirm that when iframed, the baked `VITE_RPC_ENDPOINT` (reef `main.tsx:12-13`) is superseded by the parent endpoint (they're the same loopback in Surf today, but the parent config is authoritative). Standalone uses the baked endpoint as before.

- [ ] **Step 3: tests** — vitest in `swimchain-react` (happy-dom): (a) `SwimchainRpc.call` emits the raw `authHeader` when set and falls back to Basic otherwise (assert the `Authorization` header on a stubbed fetch); mutation: drop the `authHeader` branch, the raw-header assertion FAILS. (b) **config-already-arrived (finding #2):** populate the parentConfig singleton BEFORE mounting a `RpcProvider` in iframe mode, then mount and assert it connects to the parent endpoint (not `LOCAL_TESTNET`, not stuck disconnected); mutation: remove the `getParentConfig()` mount read (subscribe-only), this test hangs/fails.

- [ ] **Step 4: build** — `cd swimchain-react && npm run build && npx vitest run` green.

- [ ] **Step 5: commit** — `feat(react): RpcConfig.authHeader + iframe-aware connect (wait for parent config)`.

---

### Task 3: `useGameIdentity` hook (node | browser | pending)

**Files:** Create `swimchain-react/src/hooks/useGameIdentity.tsx`; Modify `swimchain-react/src/index.ts`

**Interface (shaped like chat's `ChatIdentityContextValue`, `chat-client/src/hooks/useChatIdentity.tsx:56-74`):**
```ts
useGameIdentity(): {
  mode: 'node' | 'browser' | 'pending';
  identity: { publicKey: Uint8Array; publicKeyHex: string; address: string; displayName?: string } | null;
  hasIdentity: boolean;                 // identity !== null
  isLoading: boolean;                   // (finding #3) true when mode==='pending' OR (mode==='node' && !identity && !error)
  sign: (msg: Uint8Array) => Promise<Uint8Array | null>;  // node: sign_message (SEAM 2 / me.sign only); browser: local keypair
  // browser-mode passthroughs so the mint gate still works standalone:
  saveIdentity, clearIdentity;          // no-ops in node mode
}
```
**`isLoading` (finding #3) is not optional:** `selectIdentityMode` returns `'node'` the instant `nodeAddress` arrives, but `get_identity_info` resolves async afterward (with retry backoff), so there is a window where `mode==='node' && identity===null`. Compute `isLoading` exactly like chat (`useChatIdentity.tsx:208-212`). The games gate `if (isLoading) return <connecting…/>` BEFORE the `!hasIdentity||!me` mint gate, so the "creates a browser key" CTA never flashes while embedded.

- [ ] **Step 1: node branch** — when `mode==='node'`: fetch `get_identity_info` via `useRpc().rpc` for `public_key` (hex → bytes) + `address` ONLY — **it returns no display name** (finding #4). Source `displayName` from `parentConfig.nodeDisplayName` (mirror `useChatIdentity.tsx:150-155`; empty in Surf today since the shell doesn't post it). Build `identity`, and `sign = async (m) => { const r = await rpc.call('sign_message', { message: bytesToHex(m) }); return hexToBytes(r.signature); }` — this is `me.sign` (SEAM 2) only. NEVER read/mint a browser keypair. Mirror `useChatIdentity.tsx:103-164`. While `rpc` is not ready or `get_identity_info` hasn't resolved, `identity===null` and `isLoading===true` (the caller renders connecting, never the mint gate).

- [ ] **Step 2: browser branch** — when `mode==='browser'`: delegate to the existing `useStoredIdentity` + `useStoredKeypair` (identity from localStorage, `sign` = `keypair.sign` wrapped to the async signature). Behaviour identical to today.

- [ ] **Step 3: pending + split-brain guard** — `mode==='pending'` → `identity=null, hasIdentity=false` (callers render loading, NOT the mint gate). When embedded/node, **ignore any stale localStorage identity** (chat's `useRpc.tsx:41-58` guard) — the node identity is authoritative; do not let a leftover browser identity leak into a Surf session.

- [ ] **Step 4: transport auth — NEVER `setAuth` the node signer (finding #1, CRITICAL).** `@swimchain/react`'s `setAuth`→`setSignatureAuth` is SEAM 1 (transport): `call()` invokes it on EVERY request to sign X-CS-* headers. The node signer itself calls `rpc.call('sign_message')`, so `setAuth(nodeSigner)` recurses forever (`call → sign → call('sign_message') → sign → …`) and no request is ever sent. Instead:
  - **Node mode:** do NOT call `setAuth` — leave `signatureAuth` null so `call()` uses the `authHeader` cookie branch (Task 2) for transport auth on `sign_message` and all writes. The node signer is used ONLY as `me.sign` (SEAM 2), which `signAction` awaits and submits via `call()` (transport = cookie, no recursion). This is exactly how chat works (`chat-client/src/lib/rpc.ts:278-289` never routes `remoteSignFn` into `call()`).
  - **Browser mode:** still `setAuth({ publicKey, sign: browserKeypair.sign })` — the browser key IS the transport auth (X-CS-*), same as today. (Standalone reef has no cookie, so it must sign transport with its keypair or non-exempt writes 401.)
  - The hook centralizes this: browser mode pushes `setAuth`; node mode does not (and, if a stale `signatureAuth` could linger from a mode flip, clears it).

- [ ] **Step 5: test (must catch the recursion, not stub past it)** — vitest (happy-dom): (a) browser mode returns the localStorage identity, `setAuth` IS called with the keypair, and `sign_message` is never called; (b) **node mode:** identity comes from `get_identity_info`, `setAuth`/`setSignatureAuth` is **NOT** called (assert via a spy — this is the anti-recursion guard), transport auth for a stubbed `call()` uses the `authHeader` cookie, and `me.sign` invokes `sign_message`. Mutation-check each: making the node branch call `setAuth` → the "node mode never calls setSignatureAuth" assertion FAILS; making the node branch read `useStoredKeypair` → the "node mode never touches localStorage" assertion FAILS. (Do NOT write a test that only stubs `rpc.call` and asserts a green return — that masks the recursion, exactly the vacuous-test the review flagged.)

- [ ] **Step 6: export + build + commit** — export `useGameIdentity`; `npm run build && npx vitest run` green; `feat(react): useGameIdentity hook (node signer via sign_message, browser fallback)`.

---

### Task 4: reef adopts node identity (the in-Surf channel)

**Files:** Modify `reef-client/src/App.tsx`, `reef-client/src/main.tsx` (if the provider needs the iframe-aware path — likely no change since Task 2 handles it inside the provider)

**Why reef first + alone:** reef is the only game that's a baked Surf channel, so it's the one node-identity change actually exercised on device. It's also the live debt (reef-in-Surf runs on a browser keypair today).

- [ ] **Step 1: swap the identity source** — replace reef's `useStoredIdentity`/`useStoredKeypair`-derived `me`/`hasIdentity` and the browser `setAuth` effect (`App.tsx:269-288`) with `useGameIdentity()`. `me: Identity` = `{ publicKey: identity.publicKeyHex, sign }` from the hook (`me.sign` is async-tolerant already — `signAction`/`submitReefMove`/`createRegion` unchanged). Transport auth (finding #1): the hook (Task 3 Step 4) calls `setAuth` ONLY in browser mode; in node mode `setAuth` is not called (transport = cookie). So reef's own setAuth effect is deleted and replaced by consuming the hook — do NOT re-add a setAuth call that fires in node mode.

- [ ] **Step 2: loading guard THEN skip the mint gate (finding #3)** — insert `if (isLoading) return <connecting…/>` from `useGameIdentity` BEFORE the `if (!hasIdentity || !me)` mint gate (`App.tsx:643-656`, "creates a game key stored only in this browser"), replacing reef's old `idLoading` guard (`:641`). Then the mint CTA renders **only in browser mode**: in `'node'` mode after the fetch, `hasIdentity` is true so the gate is false; during the `'pending'`/node-fetch window `isLoading` short-circuits to the connecting state. Verify the browser-key copy NEVER shows while embedded, including the async-fetch window.

- [ ] **Step 3: browser mode intact** — standalone reef (`npm run dev`, no iframe) still mints/loads the browser keypair and plays exactly as before (`selectIdentityMode → 'browser'`). Show this path is unchanged.

- [ ] **Step 4: build + reef's tests** — `cd reef-client && npx tsc -b && npm test` (tsx engine/tutorial tests) green. Re-set `VITE_RPC_ENDPOINT` / re-grep per the A0 gotcha if rebuilding for Surf.

- [ ] **Step 5: commit** — `feat(reef): adopt node identity when embedded (browser keypair only standalone)`.

---

### Task 5: chess + chips adopt node identity (node-capable; inert in Surf until C2b)

**Files:** Modify `chess-client/src/App.tsx`, `chips-client/src/App.tsx` (+ their `main.tsx` only if needed)

**Note:** these are NOT baked Surf channels (C2b decision, deferred), so node mode is unexercised inside Surf today — but the shared hook makes the wiring free, and it readies them for the dial. Keep each change minimal and identical in shape to reef's.

- [ ] **Step 1: chess** — swap `App.tsx:92-113`'s browser identity + setAuth for `useGameIdentity()` (same seam rule as reef: `me.sign` = the hook's sign; `setAuth` fires in browser mode only, never node — finding #1). Add the `if (isLoading) return <connecting…/>` guard before the mint gate `:256-269` (finding #3); mint CTA shows browser-mode only. chess has **no test script** — rely on `npx tsc -b` + a manual browser-mode smoke.

- [ ] **Step 2: chips** — swap `App.tsx:356-372`'s identity/setAuth for `useGameIdentity()` (browser-mode `setAuth` only — finding #1). Add the `if (isLoading)` guard (finding #3), preserving the pre-gate loading guard `:1900-1902`. Skip the mint/name gate `:1904-1933` in node mode. **Display name (finding #4):** `get_identity_info` returns NO name; take `displayName` from `parentConfig.nodeDisplayName`, and when it's empty (the Surf shell doesn't post it today) chips MUST fall back to `nameFromKey(publicKeyHex)` (`:534`) — never chalk a blank name onto its permanent public table (`:1922-1930`). `chips-client/src/lib/host.ts` re-declares `SignFn` — confirm the async node signer satisfies it.

- [ ] **Step 3: build + tests** — `cd chess-client && npx tsc -b`; `cd chips-client && npx tsc -b && npm test` (node sims) green.

- [ ] **Step 4: commit** — `feat(chess,chips): adopt node identity when embedded (node-capable; not yet baked as Surf channels)`.

---

### Task 6: integration gate — node identity in Surf, browser mode preserved

**Files:** none created — the gate.

- [ ] **Step 1: everything builds** — build `swimchain-react` first (so the games see it), then `npx tsc -b` reef/chess/chips; `swimchain-react` `npx vitest run` green (selectIdentityMode + authHeader + useGameIdentity tests, all mutation-checked).

- [ ] **Step 2: reef browser mode unchanged** — standalone reef dev: mint/load browser keypair, place a move — still works (no regression to the live swimchain.io/reef path).

- [ ] **Step 3: reef node mode in Surf** — with the phone/desktop available OR via a driven dev harness: embed reef under the Surf shell handover (endpoint+auth+nodeAddress), confirm `selectIdentityMode → 'node'`, the mint gate does NOT show, reef's identity = the node's address (not a fresh browser key), and `get_identity_info`/`sign_message` are the identity source. (If sponsorship blocks an actual move with -32015, that's the §2.5 receive-only path — the identity wiring is still proven by the address + no-mint-gate; note it.)
  - **On-device confirmation** rides the phone subagent's APK rebuild if timing lines up; otherwise a driven surf-app dev harness suffices for C2a (the device pass can be a follow-up). Do NOT block C2a's PR on a second APK build.

- [ ] **Step 4: hostile config still rejected** — reef's new parent-config listener drops a sibling-source / prefix-lookalike config (reuse C1's discriminators): the node identity is not adopted from an untrusted poster. (Task 1's configTrust copy is the same code C1 tested, but confirm reef's real listener wired it.)

- [ ] **Step 5: report** — capture: builds, vitest results + mutations, the browser-mode-intact proof, the reef-in-Surf node-identity trace, the hostile-rejection proof, and an explicit note that chess/chips are node-capable but not baked (C2b). Record the deploy-gap (reef reaches users only after redeploy).

- [ ] **Step 6:** verification-only; no commit unless a doc is produced.

---

## What C2a explicitly does NOT do

- **No baking chess/chips as Surf channels** — that's C2b, an operator curation decision (only reef is a channel today; channels.json/build-channels.cjs untouched). C2a makes all three node-capable.
- **No sponsorship/onboarding work** — capability-follows-sponsorship (§2.5) is unchanged; an unsponsored node identity gets the receive-only path in a game's space exactly as today.
- **No `@swimchain/frontend`↔`@swimchain/react` merge** — the two shared packages stay separate; configTrust is copied byte-identical (C1 precedent), not cross-imported.
- **No client redeploys** (follow-up); no C3 sourcemap/size, no C4 signing, no C5 mobile-app cutover.

## Self-review notes

- The load-bearing fact (corrected in rev 2): the game's `me.sign`/`SignFn` (SEAM 2, action-payload) is async-tolerant, so the node's `sign_message` signer plugs in there with zero game-logic changes — Tasks 4/5 only swap the identity SOURCE, add the `isLoading` guard, and skip the mint gate. The node signer must NEVER go through `setAuth` (SEAM 1, transport) — that recurses forever (finding #1). If a task finds itself editing a game's move/action-signing call site, or wiring the node signer into `setAuth`, stop and report.
- Browser mode is the invariant: `selectIdentityMode` returns `'browser'` for every standalone case (tested + mutation-checked, Task 1). The live swimchain.io/reef path must not change.
- Security parity with C1: the games' parent-config listener uses the byte-identical `configTrust` (Task 1 Step 1 diff), so the cookie-theft hardening extends to the game clients — Task 6 Step 4 proves the wiring, not just the pure fn.
- Scope honesty: chess/chips node identity is inert in Surf until C2b; the plan says so and doesn't pretend baking happened.
