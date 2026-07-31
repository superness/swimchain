/**
 * Drives trench's REAL `resolveAuth()` -> `waitForParentConfig` -> `onMessage` wiring —
 * not the pure `isConfigMessageTrusted` (that's `configTrust.test.ts`, which only
 * proves the copied function is correct in isolation, not that nodeRpc.ts actually
 * calls it with the right arguments and drops a rejected message before touching its
 * `finish()` handler).
 *
 * nodeRpc.ts's `waitForParentConfig` guards on `typeof window === 'undefined'` and,
 * run under plain `tsx` (no DOM), `window` really is undefined — so without a stand-in
 * this test would silently exercise nothing (the early `Promise.resolve(null)` branch,
 * never registering a listener at all). This fakes the DOM surface nodeRpc.ts actually
 * touches (`window.location.origin`, `window.parent`, `window.addEventListener`,
 * `window.removeEventListener`) — the same trick
 * shoal-client/src/lib/resolveAuthListener.test.ts uses for its DOM-less shoalRpc.ts —
 * capturing the real `onMessage` closure `waitForParentConfig` installs so the test can
 * drive it with hand-built event objects: the real listener a hostile frame would talk
 * to, not a rebuilt one.
 *
 * Run: npx tsx src/lib/nodeRpcListener.test.ts
 */
import { resolveAuth, type RpcAuth } from './nodeRpc';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}

type MessageListener = (event: { origin: string; data: unknown; source?: unknown }) => void;

const SELF = 'http://localhost:5195'; // trench-client/ui's vite.config.ts dev port
const PARENT = { marker: 'the-real-parent' }; // distinct object identity — win.parent

function makeFakeWindow() {
  let listener: MessageListener | null = null;
  let removed = false;
  const win = {
    location: { origin: SELF },
    parent: PARENT,
    addEventListener(type: 'message', l: MessageListener) {
      if (type === 'message') listener = l;
    },
    removeEventListener(type: 'message', l: MessageListener) {
      if (type === 'message' && l === listener) removed = true;
    },
    // no __TAURI__: resolveAuth() checks `(window as ...).__TAURI__` and, finding
    // nothing, takes the non-Tauri branch, which tries waitForParentConfig FIRST —
    // exactly the path a real embedded (non-Tauri) trench page takes when the
    // app-shell posts its config.
  };
  return {
    win,
    post: (data: unknown, opts: { origin?: string; source?: unknown } = {}) => {
      if (!listener) {
        throw new Error('onMessage was never registered — waitForParentConfig did not call addEventListener');
      }
      listener({ origin: opts.origin ?? SELF, data, source: opts.source ?? PARENT });
    },
    isRemoved: () => removed,
  };
}

async function main() {
  const original = (globalThis as { window?: unknown }).window;
  const { win, post, isRemoved } = makeFakeWindow();
  (globalThis as { window?: unknown }).window = win;

  try {
    const resultPromise = resolveAuth();

    // (a) Sibling-source hostile message: event.source !== win.parent. A neighboring
    // iframe (not this frame's actual parent) can post into this window too; the
    // wiring must key off `event.source`, not just the origin string.
    post(
      { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' },
      { source: {} },
    );
    // (b) Prefix-lookalike origin hostile message: `${SELF}.evil.com` starts with
    // SELF as a raw string — exactly the shape an `origin.startsWith(selfOrigin)`
    // check (the old vulnerable pattern) would wrongly accept. source=parent here,
    // so only the origin's exact-match gate is what has to catch this one.
    post(
      { type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' },
      { origin: `${SELF}.evil.com` },
    );

    check('neither hostile message resolved (or removed) the listener yet', !isRemoved());

    // (c) Now the legit config arrives (same-origin, real parent source).
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://127.0.0.1:9736', rpcAuth: 'Basic ok' });

    const result: RpcAuth = await resultPromise;

    // If EITHER hostile message had been accepted, `finish()` would have already
    // resolved (and removed the listener) on that message, and this final trusted
    // post would have been silently ignored (listener gone) — so `result` would carry
    // the attacker's endpoint/auth instead. Getting the LEGIT endpoint back proves
    // both hostiles were dropped by the real listener, not merely by the pure
    // function in isolation.
    check(
      'resolveAuth resolves to the legit config, not either hostile one',
      result.endpoint === 'http://127.0.0.1:9736' && result.authHeader === 'Basic ok',
      result,
    );
    check('the one-time listener was removed after accepting the trusted message', isRemoved());
  } finally {
    if (original === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = original;
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
