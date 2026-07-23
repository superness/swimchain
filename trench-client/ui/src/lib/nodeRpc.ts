/**
 * The Trench — node RPC plumbing.
 *
 * A thin, dependency-light JSON-RPC 2.0 client plus auth resolution, mirroring the
 * cookie/parent-frame/Tauri conventions the rest of the Swimchain clients already use
 * (see feed-client/src/hooks/useNodeIdentity.tsx, feed-client/src/lib/rpc.ts, and
 * launcher-apps/app-shell/web/embed.js). Kept deliberately separate from
 * `@swimchain/react`'s `SwimchainRpc` class: that class only accepts `{username,
 * password}` basic-auth or its own signature-auth scheme, not an already-built
 * `Authorization` header string — but that's exactly what both the app-shell
 * postMessage envelope and the Tauri `get_rpc_config` command hand us. This module
 * carries a raw header through untouched instead of decoding/re-encoding it, and is
 * import-safe under plain `tsx` (no Vite, no DOM) so the regtest smoke script
 * (scripts/regtest-smoke.ts) can build an `RpcAuth` by hand and call `rpcCall` /
 * `nodeIdentity` directly, without ever touching `resolveAuth`'s browser-only paths.
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

let requestId = 1;

/** Raw JSON-RPC 2.0 POST over HTTP. Works identically in the browser and under Node
 *  (both have a global `fetch`), which is what lets the smoke script reuse it. */
export async function rpcCall<T>(auth: RpcAuth, method: string, params: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

  const parsed = (await res.json()) as JsonRpcResponse<T>;
  if (parsed.error) {
    throw new Error(`RPC Error ${parsed.error.code}: ${parsed.error.message}`);
  }
  return parsed.result as T;
}

/**
 * Waits (up to `timeoutMs`) for the app-shell's `SWIMCHAIN_RPC_CONFIG` postMessage
 * envelope — see launcher-apps/app-shell/web/embed.js:17-61 and the receiving side
 * (feed-client/src/hooks/useParentRpcConfig.ts) for the contract this mirrors:
 *   { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint, rpcAuth, nodeAddress?, nodeDisplayName? }
 * Resolves `null` (never rejects) if nothing arrives — either we're not embedded, or
 * the shell isn't there. A no-op (resolves `null` immediately) outside a browser.
 */
// Origins allowed to push a SWIMCHAIN_RPC_CONFIG envelope — same-origin, plus the
// local-dev and Tauri hosts the app-shell actually runs from. Without this check ANY
// page that can post a message into this window (a malicious iframe neighbor, a
// compromised ad, etc.) could redirect every RPC call — including sign_message, which
// hands back the node's own signature — to an attacker-controlled endpoint. Mirrors
// feed-client/src/hooks/useParentRpcConfig.ts:31-50 (every sibling client validates
// origin this way; this was the one spot that hadn't yet).
const ALLOWED_PARENT_ORIGINS: string[] = [
  'http://localhost', // Local development
  'http://127.0.0.1', // Local development (IP)
  'tauri://localhost', // Tauri desktop app
  'https://localhost', // Local HTTPS development
];

function isParentOriginAllowed(origin: string): boolean {
  // Empty origin ("null"/same-origin in some browsers) or an exact same-origin match.
  if (!origin || origin === window.location.origin) return true;
  return ALLOWED_PARENT_ORIGINS.some((allowed) => origin.startsWith(allowed));
}

function waitForParentConfig(timeoutMs: number): Promise<RpcAuth | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: RpcAuth | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (!isParentOriginAllowed(event.origin)) return;
      const d = event.data as
        | { type?: string; rpcEndpoint?: string; rpcAuth?: string | null }
        | null
        | undefined;
      if (d && d.type === 'SWIMCHAIN_RPC_CONFIG' && typeof d.rpcEndpoint === 'string' && d.rpcEndpoint) {
        finish({ endpoint: d.rpcEndpoint, authHeader: d.rpcAuth ?? null });
      }
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Reads the Tauri `get_rpc_config` command (Task 4's desktop shell), if we're running
 * inside one.
 *
 * Finding (Task 4 verification): a dynamic `import('@tauri-apps/api/core')` — even
 * with `/* @vite-ignore *\/` to dodge Vite's build-time dependency on the package —
 * still leaves the literal bare specifier `"@tauri-apps/api/core"` in the emitted
 * bundle (verified: `grep` the built `dist/assets/index-*.js`). Bare specifiers
 * aren't valid ES module references without an import map, so real browsers
 * (including Tauri's WebView2/WKWebView) throw `TypeError: Failed to resolve module
 * specifier` on that `import()` — silently, since it's inside this function's
 * try/catch, so it read as "not in Tauri" even when it was. `@tauri-apps/api` being
 * present in `node_modules` doesn't change this: the bare-specifier resolution
 * failure happens in the browser's module loader at runtime, not at Vite's build
 * time. The fix is `window.__TAURI__.core.invoke`, the global Tauri v2 injects when
 * `app.withGlobalTauri: true` (see trench-client/src-tauri/tauri.conf.json) — no
 * import required at all; this is what `@tauri-apps/api/core.js`'s own doc comment
 * documents as the equivalent of importing the package. The dynamic import is kept
 * as a first attempt (harmless if it ever does resolve, e.g. a future Tauri version
 * ships an import map) with the global as the fallback that actually works today.
 */
async function tauriConfig(): Promise<RpcAuth | null> {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } };
  };
  if (!w.__TAURI__) return null;

  const cfg = await (async () => {
    try {
      const specifier = '@tauri-apps/api/core';
      const mod = (await import(/* @vite-ignore */ specifier)) as {
        invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
      };
      return await mod.invoke<{ endpoint: string; auth: string | null }>('get_rpc_config');
    } catch {
      // Expected in practice — see the finding above. Fall through to the global.
    }
    if (w.__TAURI__?.core?.invoke) {
      try {
        return await w.__TAURI__.core.invoke<{ endpoint: string; auth: string | null }>(
          'get_rpc_config',
        );
      } catch {
        // The shell's command isn't registered yet, or the invoke failed.
      }
    }
    return null;
  })();

  if (cfg?.endpoint) return { endpoint: cfg.endpoint, authHeader: cfg.auth ?? null };
  return null;
}

/**
 * Resolve where/how to reach the node, in the order the game's shells offer it:
 *   1. app-shell embed: `SWIMCHAIN_RPC_CONFIG` postMessage (10s window)
 *   2. Tauri desktop shell: `get_rpc_config` command (Task 4)
 *   3. `VITE_RPC_ENDPOINT` build/dev-time env (no auth — dev nodes are usually
 *      unauthenticated, or the caller layers its own auth on top)
 *   4. `http://127.0.0.1:9737` — bare local-node fallback
 *
 * Steps 1-2 are browser/Tauri-only and no-op (resolve `null`) under Node, so calling
 * this from a plain-tsx context just falls through to steps 3-4. The regtest smoke
 * script doesn't call this at all — it builds its own `RpcAuth` from `TRENCH_RPC` +
 * `TRENCH_COOKIE_FILE`, which is the honest thing for a script with no app-shell,
 * no Tauri, and no Vite env to resolve.
 */
export async function resolveAuth(): Promise<RpcAuth> {
  const fromParent = await waitForParentConfig(10_000);
  if (fromParent) return fromParent;

  const fromTauri = await tauriConfig();
  if (fromTauri) return fromTauri;

  const envEndpoint = (import.meta.env?.VITE_RPC_ENDPOINT as string | undefined)?.trim();
  if (envEndpoint) return { endpoint: envEndpoint, authHeader: null };

  return { endpoint: 'http://127.0.0.1:9737', authHeader: null };
}

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
 * RPC-backed signer (`sign_message`) — see
 * feed-client/src/hooks/useNodeIdentity.tsx:132-156, the reference this mirrors.
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
