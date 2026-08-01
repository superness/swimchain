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
 * Two adaptations from the reference, both written when shoal-client had no Vite
 * build. **IT HAS ONE NOW** — `vite.config.ts` and `vite` in package.json both exist
 * (Task 1 added them for the Tauri shell), and `tsconfig.ui.json` lists `vite/client`,
 * so `import.meta.env` is typed and real for anything under `src/ui/`. What follows is
 * therefore recorded as history plus one live consequence, not as a description of the
 * project:
 *   - The env-var step reads `process.env.SHOAL_RPC_ENDPOINT` instead of
 *     `import.meta.env.VITE_RPC_ENDPOINT`. `process` is real under Node/tsx and is
 *     guarded with `typeof process !== 'undefined'`. **THE LIVE CONSEQUENCE: that
 *     override is dead in the browser and in the Tauri webview.** There is no
 *     `process` there and this module is deliberately Vite-free (it is imported by
 *     plain-`tsx` scripts, which `import.meta.env` would break), so `SHOAL_RPC_ENDPOINT`
 *     works ONLY under Node — the smoke scripts and the harness. It is not a way to
 *     point a shipped shell at another node, and nothing should document it as one.
 *     Giving the browser an override means a `VITE_`-prefixed constant read in
 *     `src/ui/`, not here.
 *   - `tauriConfig` skips the reference's dynamic-`import('@tauri-apps/api/core')`
 *     workaround — that dance exists solely to dodge a Vite bare-specifier bundling
 *     trap (see the reference's own doc comment). This module imports nothing from
 *     `@tauri-apps/api` at all, so there is still nothing to dodge, and it goes
 *     straight to the `window.__TAURI__.core.invoke` global Tauri v2 injects (which is
 *     why `app.withGlobalTauri` must stay `true`).
 */

import { isConfigMessageTrusted } from './configTrust';

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

// --- Typed rejections --------------------------------------------------------------
//
// `rpcCall` used to reject with a single flat `Error` for every failure mode, its
// `code`/`status` baked into the message text (`RPC Error -32015: …`, `HTTP 500: …`)
// and nowhere else. That is enough for a human reading a log, but it is exactly the
// gap Task 3 (plan 2026-07-28-the-shoal-shallows) exists to close: a caller could not
// tell "the node answered and refused this identity" from "the node never answered at
// all" without regexing that message, and a message string is not a stable contract —
// only the shapes below are. Three distinct classes because they are three distinct
// FACTS about how the call failed, not three formattings of one fact:
//
//   - `JsonRpcCallError`   — a real JSON-RPC response came back with an `error` body.
//                            The node is up, parsed the request, and refused it. The
//                            numeric `code` is the JSON-RPC error code
//                            (`RpcErrorCode`, src/rpc/error.rs) verbatim.
//   - `HttpStatusCallError`— the HTTP transaction completed but the status was not ok
//                            (proxy/gateway error, node mid-restart serving 5xx, etc).
//                            The node's JSON-RPC layer was never reached.
//   - `NodeUnreachableError` — the `fetch()` call itself rejected: no response of any
//                            kind arrived (DNS failure, connection refused, offline).
//                            This is the only one of the three that means "transport
//                            failed" — see shoalSend.ts's `classifySendFailure`.
//
// A 200 response with an unparsable JSON body (the fourth failure mode already
// covered by shoalRpc.test.ts) stays a plain `Error`/`SyntaxError` on purpose: the
// node answered AND the transport worked, so it is neither of the above and callers
// should treat it as "everything else", same as any other error class this module
// does not specifically recognise.

/** The node's JSON-RPC layer returned an `error` body — the node is up and reached,
 *  and refused this specific request. `code` is `RpcErrorCode` (src/rpc/error.rs)
 *  verbatim, not re-parsed out of the message string. */
export class JsonRpcCallError extends Error {
  readonly code: number;
  constructor(code: number, rpcMessage: string) {
    super(`RPC Error ${code}: ${rpcMessage}`);
    this.name = 'JsonRpcCallError';
    this.code = code;
  }
}

/** The HTTP transaction completed with a non-2xx status before any JSON-RPC body was
 *  parsed (proxy error, gateway timeout, node serving a bare error page). */
export class HttpStatusCallError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string, bodyText: string) {
    super(`HTTP ${status}: ${statusText}${bodyText ? ` - ${bodyText}` : ''}`);
    this.name = 'HttpStatusCallError';
    this.status = status;
  }
}

/** `fetch()` itself rejected — no HTTP response of any kind came back. The one
 *  failure mode that actually means "could not reach the node" (offline, DNS
 *  failure, connection refused, etc). `cause` is whatever `fetch` threw. */
export class NodeUnreachableError extends Error {
  constructor(cause: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`Node unreachable: ${causeMsg}`);
    this.name = 'NodeUnreachableError';
    this.cause = cause;
  }
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

  // Only THIS call, not res.json() below, means "the node was unreachable" — see the
  // `NodeUnreachableError` doc comment. Anything past this line got a real HTTP
  // response, so the node was there and answered.
  let res: Response;
  try {
    res = await fetch(auth.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params: params ?? {}, id: requestId++ }),
    });
  } catch (cause) {
    throw new NodeUnreachableError(cause);
  }

  if (!res.ok) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      // best-effort only
    }
    throw new HttpStatusCallError(res.status, res.statusText, bodyText);
  }

  // Deliberately not wrapped in try/catch: a non-JSON 200 body is exactly the
  // "HTTP-level failure" the caller needs surfaced, so `res.json()`'s SyntaxError is
  // allowed to propagate as `rpcCall`'s rejection rather than being swallowed.
  const parsed = (await res.json()) as JsonRpcResponse<T>;
  if (parsed.error) {
    // A swallowed RPC error is invisible in production — the numeric code is a real
    // field on the thrown error (not just embedded in the message string) so a
    // caller can tell a real protocol error from an empty/undefined result, and can
    // switch on which protocol error it was. See `JsonRpcCallError` above.
    throw new JsonRpcCallError(parsed.error.code, parsed.error.message);
  }
  return parsed.result as T;
}

// --- Space-id wire form ----------------------------------------------------------
//
// This lives HERE, in the lowest module both the write path (shoalSend) and the
// live path (shoalLive) already import, because it is a fact about the shapes the
// NODE speaks — not about either of them. It used to live in shoalSend.ts, which
// made the module it protects (shoalLive) the one module that could not see it: a
// watch-before-you-write client never touches the write path, so it never reached
// the guard, and the failure it guards against is invisible to every unit test.

/** bech32m charset (BIP-173/350). */
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** The human-readable part every space id carries (`encode_space_id`,
 *  src/rpc/methods.rs:186-194 — `SPACE_HRP`). */
const SPACE_HRP = 'sp';

/** bech32m's checksum constant (BIP-350). bech32 (the older one) uses 1; using
 *  the wrong one produces a string that LOOKS right and fails the node's decode. */
const BECH32M_CONST = 0x2bc830a3;

/**
 * Is `spaceId` in the WIRE form the node speaks — bech32m `sp1…`?
 *
 * This looks like a nicety and is not. A space id has two circulating forms:
 * the bech32m `sp1…` string every RPC and every event emits
 * (`encode_space_id`, src/rpc/methods.rs:186; `encode_space_id_bech32`,
 * src/node/router/router.rs:8834), and the raw 32-char hex some callers keep
 * internally. `decode_space_id` (methods.rs:136) accepts BOTH, so a hex space
 * id sails through every request a client makes and looks completely healthy.
 *
 * What it does NOT sail through is `shoalLive.ts`. That module filters
 * `content_new` events with a plain string `===` against the caller's
 * `opts.spaceId`, and the event's own `space_id` is always bech32m. Pass hex
 * and the socket still connects, still updates its silence clock, still
 * demotes on real disconnects — and never once yields a refetch from an
 * event, silently degrading the whole live channel to tick-driven polling.
 * Correct but slow, never wrong, and invisible to any unit test.
 *
 * The form is exact, not heuristic: 16 payload bytes plus a version byte is
 * 17 bytes -> 28 data characters -> 34 characters after `sp1` including the
 * 6-character checksum, so a well-formed space id is always exactly 37
 * characters. (The checksum itself is deliberately NOT verified here — that
 * would be re-implementing bech32m for a check whose entire job is to
 * separate `sp1…` from `a06a93a6…`, and the node validates the real thing.)
 */
export function isWireSpaceId(spaceId: string): boolean {
  if (spaceId.length !== 37) return false;
  if (!spaceId.startsWith('sp1')) return false;
  for (let i = 3; i < spaceId.length; i++) {
    if (!BECH32_CHARSET.includes(spaceId[i])) return false;
  }
  return true;
}

/**
 * Throw unless `spaceId` is in the node's bech32m wire form. `who` names the
 * calling entry point so the thrown message points at the caller's own
 * parameter; everything after it is IDENTICAL between call sites on purpose —
 * `startLive` and `sendPresence`/`sendEat` reject the same input for the same
 * reason, and a reader who has seen one message should recognise the other
 * instantly rather than wonder whether two different checks disagree.
 *
 * BOTH ends of the bridge call this. The write path rejects it at the first
 * write (`ctx.spaceId` is otherwise never sent — a reply inherits its
 * parent's space server-side, verified against `SubmitReplyParams`, which has
 * no space field at all), and `startLive` rejects it before it opens a socket.
 */
export function assertWireSpaceId(spaceId: string, who: string): void {
  if (isWireSpaceId(spaceId)) return;
  throw new RangeError(
    `${who}: spaceId ${JSON.stringify(spaceId)} is not the node's bech32m wire form ` +
    '(sp1… , 37 chars). shoalLive.ts compares content_new events against this exact ' +
    'string, so a hex space id would silently disable the live channel. Use the space_id ' +
    'returned by create_space / list_spaces verbatim.',
  );
}

/**
 * bech32's checksum polynomial (BIP-173). Integer-only, no clock, no float —
 * this module is imported by `src/lib/`, and everything here is exact 32-bit
 * arithmetic on values below 2^31, so no intermediate can go negative or lose
 * precision.
 */
function bech32Polymod(values: readonly number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk >>> 0;
}

/** The hrp, expanded the way the checksum wants it (BIP-173). */
function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/**
 * Regroup 8-bit bytes into 5-bit groups, padding the last one.
 *
 * `acc` is masked down to its leftover bits each iteration, which keeps the
 * loop invariant simple (`acc` holds exactly `bits` bits) and matches BIP-173's
 * reference implementation.
 *
 * IT IS NOT LOAD-BEARING, AND THE COMMENT HERE USED TO CLAIM IT WAS — that it
 * stopped `acc` overflowing 32 bits partway through a 17-byte space id. That is
 * false, and a mutation run is what said so: deleting the mask changes nothing.
 * JavaScript's `<<`, `>>>` and `&` all truncate to 32 bits already, and the five
 * bits read out each step live below bit 13, so the high junk can never reach
 * them. Measured: identical output on the real payload and on 20 000 random
 * 17-byte inputs. Kept for readability; do not write a check that pretends to
 * cover it.
 */
function toFiveBit(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 31);
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31);
  return out;
}

/**
 * Encode a 16-byte space id into the node's bech32m wire form (`sp1…`).
 *
 * THE INVERSE OF `isWireSpaceId`, and it lives beside it for the same reason:
 * this is a fact about the shape the NODE speaks, not about any one caller.
 * It mirrors `encode_space_id` (src/rpc/methods.rs:186-194) exactly — hrp
 * `sp`, a leading zero VERSION byte, then the 16 payload bytes, bech32m.
 *
 * WHY A CLIENT NEEDS TO ENCODE ONE AT ALL. An app-namespaced space's id is a
 * pure function of its `(app, display)` name — `sha256("app:<app>:v1:<display>")[..16]`
 * with the App class byte in front (`app_space_id_16`, src/types/space_class.rs:70-73)
 * — so a client that knows the name can compute the id without asking anybody.
 * `shellConfig.waterSpaceId` does exactly that, and the reason it must is in
 * that function's own comment: asking the node instead cannot work on a fresh
 * install.
 */
export function encodeWireSpaceId(id16: Uint8Array): string {
  if (id16.length !== 16) {
    throw new RangeError(
      `encodeWireSpaceId: a space id is 16 bytes, got ${id16.length}`,
    );
  }
  // Version byte first, then the payload — methods.rs:190-192.
  const payload = new Uint8Array(17);
  payload[0] = 0;
  payload.set(id16, 1);

  const data = toFiveBit(payload);
  const checksumInput = hrpExpand(SPACE_HRP).concat(data, [0, 0, 0, 0, 0, 0]);
  const pm = bech32Polymod(checksumInput) ^ BECH32M_CONST;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((pm >>> (5 * (5 - i))) & 31);

  return `${SPACE_HRP}1${data.concat(checksum).map((v) => BECH32_CHARSET[v]).join('')}`;
}

// --- Browser/Tauri auth sources (never touched at module load) ------------------

/** The subset of `Window` this module needs, hand-declared because this project's
 *  tsconfig carries no `"dom"` lib (see the module header) — there is no `Window`
 *  type to import a subset from. Reached only through `getWindow()`, never as the
 *  bare `window` identifier, which does not exist as a type here at all. */
interface MinimalWindow {
  location: { origin: string };
  parent: MinimalWindow;
  addEventListener(type: 'message', listener: (event: { origin: string; data: unknown; source?: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { origin: string; data: unknown; source?: unknown }) => void): void;
  __TAURI__?: { core?: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } };
}

/** `undefined` under Node/tsx (and in any non-browser embedding) — the single choke
 *  point every browser-only path in this module reads `window` through. */
function getWindow(): MinimalWindow | undefined {
  return (globalThis as { window?: MinimalWindow }).window;
}

// A message claiming to be the SWIMCHAIN_RPC_CONFIG envelope is trusted only if it
// came from THIS frame's real parent window (event.source === win.parent) at an
// exactly-matched origin — no prefix matching, no empty-origin bypass. Without this
// check ANY page that can post a message into this window (a malicious iframe
// neighbor, a compromised ad, etc.) could redirect every RPC call — including
// sign_message, which hands back the node's own signature — to an attacker-controlled
// endpoint. See configTrust.ts (copied byte-identical from
// swimchain-frontend/src/hooks/configTrust.ts; mirrored in nodeRpc.ts).

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
    const onMessage = (event: { origin: string; data: unknown; source?: unknown }) => {
      if (!isConfigMessageTrusted(
        { origin: event.origin, source: event.source },
        { selfOrigin: win.location.origin, parentWindow: win.parent },
      )) return;
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
 *   3. `SHOAL_RPC_ENDPOINT` env (no auth — an explicit operator opt-in, and only
 *      reachable under Node/tsx; see `envEndpoint`)
 *   4. **`null`.** There is no fourth source.
 *
 * Steps 1-2 are browser/Tauri-only and no-op (resolve `null`) under Node, so calling
 * this from a plain-tsx context just falls through to step 3.
 *
 * ## WHY THERE IS NO BARE-LOCALHOST FALLBACK
 *
 * This used to end `return { endpoint: 'http://127.0.0.1:9736', authHeader: null }` —
 * mainnet's default RPC port, unauthenticated, baked into every bundle. It is the exact
 * class of value this project's standing bundle rule exists to keep out
 * (`scripts/deploy-web-clients.sh`, project memory "verify client bundle endpoints"),
 * and it caused real harm here rather than hypothetical: a node answers READ methods
 * without auth, so the shell looked completely healthy — green lamp, live block height —
 * right up until the first write. That is what cost Task 1 an hour and what
 * `HANDOFF_WAIT`'s 120 s (src-tauri/src/main.rs) was raised to work around.
 *
 * A silent unauthenticated fallback is worse than no answer, because no answer is
 * diagnosable and this was not. `null` means "nothing told me where the node is", and a
 * caller has to say so. Diagnostics.tsx is the only caller and does exactly that.
 *
 * Order of operations mirrors nodeRpc.ts's `resolveAuth` exactly, including why:
 * `__TAURI__` being present is not proof IPC will answer (the launcher's app-shell
 * injects it into every frame, including iframes whose capability config denies them
 * IPC), so when it IS present we try IPC first and fall back to the parent-envelope
 * wait; when it's absent we go straight to the parent wait.
 */
export async function resolveAuth(): Promise<RpcAuth | null> {
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

  return null;
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
