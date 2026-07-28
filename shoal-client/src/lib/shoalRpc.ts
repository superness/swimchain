/**
 * The Shoal — node RPC plumbing.
 *
 * Mirrors `trench-client/ui/src/lib/nodeRpc.ts` (read its header before touching this
 * file): a thin JSON-RPC 2.0 client plus auth resolution, kept deliberately separate
 * from `@swimchain/react`'s `SwimchainRpc` class. That class only accepts
 * `{username, password}` basic-auth or its own signature-auth scheme, not an
 * already-built `Authorization` header string — but a ready-built header is exactly
 * what both the app-shell postMessage envelope and Tauri's `get_rpc_config` command
 * hand us. This module carries a raw header through untouched instead of
 * decoding/re-encoding it.
 *
 * Import-safe under plain `tsx` (no Vite, no DOM): `rpcCall` and `nodeIdentity` only
 * touch `fetch`, which Node provides globally, so a smoke script (Task 6) can build an
 * `RpcAuth` by hand and call them directly. `resolveAuth`'s browser/Tauri paths are
 * reached only from inside functions that are lazily called (never at module load),
 * and everything they touch (`window`, `__TAURI__`) is accessed through a `globalThis`
 * cast rather than the bare identifier — this project's tsconfig has no `"dom"` lib
 * (unlike trench-client/ui's, which lists `DOM`/`DOM.Iterable`), so referencing
 * `window` directly does not type-check here at all, DOM guard or not.
 *
 * Two adaptations from the reference, both because shoal-client has no Vite build
 * (no `vite.config`, no `vite` in package.json, no `import.meta.env` typings):
 *   - The env-var fallback step reads `process.env.SHOAL_RPC_ENDPOINT` instead of
 *     `import.meta.env.VITE_RPC_ENDPOINT`. `process` is real under Node/tsx (where
 *     this fallback actually gets exercised today) and is guarded with `typeof
 *     process !== 'undefined'` for a hypothetical future browser build the way the
 *     reference guards `window`.
 *   - `tauriConfig` skips the reference's dynamic-`import('@tauri-apps/api/core')`
 *     workaround — that dance exists solely to dodge a Vite bare-specifier bundling
 *     trap (see the reference's own doc comment); with no Vite in this project there
 *     is nothing to dodge, so this goes straight to the `window.__TAURI__.core.invoke`
 *     global Tauri v2 injects.
 */

/** Where the node is and how to authenticate to it. `authHeader`, when present, is a
 *  ready-to-send `Authorization` header value (e.g. `Basic base64(__cookie__:<hex>)`). */
export interface RpcAuth {
  endpoint: string;
  authHeader: string | null;
}

interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcErrorBody;
  id: number | string;
}

// A single counter shared by every `RpcAuth`, deliberately — not one counter per
// auth. The `id` here is a JSON-RPC correlation token for a single HTTP
// request/response exchange; `rpcCall` reads the response body directly off the
// `fetch` it just made rather than dispatching a reply against a table of pending
// ids, so nothing anywhere compares one call's id to another's, whether they share
// an endpoint or not. A per-`RpcAuth` counter would need `RpcAuth` to carry hidden
// mutable state, which breaks the property that a caller (the app-shell envelope,
// Tauri's `get_rpc_config`, or a smoke script building one "by hand") can construct
// a plain `{endpoint, authHeader}` object literal and use it immediately.
let requestId = 1;

/** Raw JSON-RPC 2.0 POST over HTTP. Works identically in the browser and under Node
 *  (both have a global `fetch`), which is what lets the smoke script reuse it. */
export async function rpcCall<T>(auth: RpcAuth, method: string, params: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Assigned only when truthy, never spread as a literal `Authorization: auth.authHeader`
  // — a `Headers`-consuming layer (fetch's own header normalization, or a proxy in
  // front of it) can coerce a literal `null` value to the string `"null"`, which is a
  // real (if malformed) Authorization header the node would try to parse, instead of
  // the header being absent the way a null auth is supposed to read.
  if (auth.authHeader) headers.Authorization = auth.authHeader;

  const res = await fetch(auth.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {}, id: requestId++ }),
  });

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // best-effort only
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}${bodyText ? ` - ${bodyText}` : ''}`);
  }

  // Deliberately not wrapped in try/catch: a non-JSON 200 body is exactly the
  // "HTTP-level failure" the caller needs surfaced, so `res.json()`'s SyntaxError is
  // allowed to propagate as `rpcCall`'s rejection rather than being swallowed.
  const parsed = (await res.json()) as JsonRpcResponse<T>;
  if (parsed.error) {
    // A swallowed RPC error is invisible in production — the code is included so a
    // caller (or a log) can tell a real protocol error from an empty/undefined result.
    throw new Error(`RPC Error ${parsed.error.code}: ${parsed.error.message}`);
  }
  return parsed.result as T;
}

// --- Browser/Tauri auth sources (never touched at module load) ------------------

/** The subset of `Window` this module needs, hand-declared because this project's
 *  tsconfig carries no `"dom"` lib (see the module header) — there is no `Window`
 *  type to import a subset from. Reached only through `getWindow()`, never as the
 *  bare `window` identifier, which does not exist as a type here at all. */
interface MinimalWindow {
  location: { origin: string };
  addEventListener(type: 'message', listener: (event: { origin: string; data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { origin: string; data: unknown }) => void): void;
  __TAURI__?: { core?: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } };
}

/** `undefined` under Node/tsx (and in any non-browser embedding) — the single choke
 *  point every browser-only path in this module reads `window` through. */
function getWindow(): MinimalWindow | undefined {
  return (globalThis as { window?: MinimalWindow }).window;
}

// Origins allowed to push a SWIMCHAIN_RPC_CONFIG envelope — same-origin, plus the
// local-dev and Tauri hosts the app-shell actually runs from. Without this check ANY
// page that can post a message into this window (a malicious iframe neighbor, a
// compromised ad, etc.) could redirect every RPC call — including sign_message, which
// hands back the node's own signature — to an attacker-controlled endpoint. Mirrors
// nodeRpc.ts's identical list (itself mirroring every sibling client's
// useParentRpcConfig.ts).
const ALLOWED_PARENT_ORIGINS: string[] = [
  'http://localhost', // Local development
  'http://127.0.0.1', // Local development (IP)
  'tauri://localhost', // Tauri desktop app
  'https://localhost', // Local HTTPS development
];

function isParentOriginAllowed(win: MinimalWindow, origin: string): boolean {
  // Empty origin ("null"/same-origin in some browsers) or an exact same-origin match.
  if (!origin || origin === win.location.origin) return true;
  return ALLOWED_PARENT_ORIGINS.some((allowed) => origin.startsWith(allowed));
}

/**
 * Waits (up to `timeoutMs`) for the app-shell's `SWIMCHAIN_RPC_CONFIG` postMessage
 * envelope — see `launcher-apps/app-shell/web/embed.js` and nodeRpc.ts's identical
 * function for the full contract this mirrors:
 *   { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint, rpcAuth, nodeAddress?, nodeDisplayName? }
 * Resolves `null` (never rejects) if nothing arrives — either we're not embedded, or
 * the shell isn't there. A no-op (resolves `null` immediately) outside a browser.
 */
function waitForParentConfig(timeoutMs: number): Promise<RpcAuth | null> {
  const win = getWindow();
  if (!win) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RpcAuth | null) => {
      if (settled) return;
      settled = true;
      win.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event: { origin: string; data: unknown }) => {
      if (!isParentOriginAllowed(win, event.origin)) return;
      const d = event.data as
        | { type?: string; rpcEndpoint?: string; rpcAuth?: string | null }
        | null
        | undefined;
      if (d && d.type === 'SWIMCHAIN_RPC_CONFIG' && typeof d.rpcEndpoint === 'string' && d.rpcEndpoint) {
        finish({ endpoint: d.rpcEndpoint, authHeader: d.rpcAuth ?? null });
      }
    };
    win.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Reads the Tauri `get_rpc_config` command, if we're running inside a Tauri shell for
 * this game. Goes straight to `window.__TAURI__.core.invoke` — the global Tauri v2
 * injects when `app.withGlobalTauri: true` — rather than nodeRpc.ts's dynamic-import
 * dance, which exists there only to route around a Vite bundling trap this
 * Vite-less project doesn't have (see the module header).
 */
async function tauriConfig(): Promise<RpcAuth | null> {
  const win = getWindow();
  if (!win?.__TAURI__?.core?.invoke) return null;
  try {
    const cfg = await win.__TAURI__.core.invoke<{ endpoint: string; auth: string | null }>('get_rpc_config');
    if (cfg?.endpoint) return { endpoint: cfg.endpoint, authHeader: cfg.auth ?? null };
  } catch {
    // The shell's command isn't registered yet, or the invoke failed.
  }
  return null;
}

function envEndpoint(): string | undefined {
  // `process` doesn't exist in a real browser without a bundler polyfill (this
  // project has none — see the module header); `typeof` is the same safe existence
  // check the reference uses for `window`, so this stays a no-op there rather than
  // throwing.
  if (typeof process === 'undefined') return undefined;
  return process.env.SHOAL_RPC_ENDPOINT?.trim() || undefined;
}

/**
 * Resolve where/how to reach the node, in the order the game's shells offer it:
 *   1. app-shell embed: `SWIMCHAIN_RPC_CONFIG` postMessage (10s window)
 *   2. Tauri desktop shell: `get_rpc_config` command
 *   3. `SHOAL_RPC_ENDPOINT` env (no auth — dev nodes are usually unauthenticated, or
 *      the caller layers its own auth on top)
 *   4. `http://127.0.0.1:9736` — bare local-node fallback (mainnet's default RPC
 *      port: p2p 9735 + 1)
 *
 * Steps 1-2 are browser/Tauri-only and no-op (resolve `null`) under Node, so calling
 * this from a plain-tsx context just falls through to steps 3-4.
 *
 * Order of operations mirrors nodeRpc.ts's `resolveAuth` exactly, including why:
 * `__TAURI__` being present is not proof IPC will answer (the launcher's app-shell
 * injects it into every frame, including iframes whose capability config denies them
 * IPC), so when it IS present we try IPC first and fall back to the parent-envelope
 * wait; when it's absent we go straight to the parent wait.
 */
export async function resolveAuth(): Promise<RpcAuth> {
  const inTauri = Boolean(getWindow()?.__TAURI__);

  if (inTauri) {
    const fromTauri = await tauriConfig();
    if (fromTauri) return fromTauri;
    const fromParent = await waitForParentConfig(10_000);
    if (fromParent) return fromParent;
  } else {
    const fromParent = await waitForParentConfig(10_000);
    if (fromParent) return fromParent;
    const fromTauri = await tauriConfig();
    if (fromTauri) return fromTauri;
  }

  const env = envEndpoint();
  if (env) return { endpoint: env, authHeader: null };

  return { endpoint: 'http://127.0.0.1:9736', authHeader: null };
}

// --- Node identity, adopted as the player's --------------------------------------

/** The node's own identity, adopted as the player's — signing happens ON the node via
 *  `sign_message`, so the browser/game process never holds a private key. */
export interface NodeIdentity {
  publicKeyHex: string;
  address: string;
  sign(msg: Uint8Array): Promise<Uint8Array>;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

/**
 * Adopts the connected node's own identity (`get_identity_info`) and hands back an
 * RPC-backed signer (`sign_message`) — mirrors nodeRpc.ts's `nodeIdentity` exactly.
 */
export async function nodeIdentity(auth: RpcAuth): Promise<NodeIdentity> {
  const info = await rpcCall<{
    has_identity: boolean;
    public_key: string | null;
    address: string | null;
  }>(auth, 'get_identity_info', {});

  if (!info.has_identity || !info.public_key || !info.address) {
    throw new Error('Node has no identity loaded');
  }
  const publicKeyHex = info.public_key;
  const address = info.address;

  return {
    publicKeyHex,
    address,
    async sign(msg: Uint8Array): Promise<Uint8Array> {
      const result = await rpcCall<{ signature: string; public_key: string }>(auth, 'sign_message', {
        message: bytesToHex(msg),
      });
      return hexToBytes(result.signature);
    },
  };
}
