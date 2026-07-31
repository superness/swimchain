/**
 * Drives shoal's REAL `resolveAuth()` -> `waitForParentConfig` -> `onMessage` wiring —
 * not the pure `isConfigMessageTrusted` (that's `configTrust.test.ts`, which only
 * proves the copied function is correct in isolation, not that shoalRpc.ts actually
 * calls it with the right arguments and drops a rejected message before touching its
 * `finish()` handler).
 *
 * shoalRpc.ts is DOM-less by design (see its module header: no "dom" lib, `window` is
 * read only through `getWindow()`'s `globalThis` cast), so there's no jsdom/happy-dom
 * available here the way feed/forum's vitest harnesses use it. Instead this fakes the
 * `MinimalWindow` shape shoalRpc.ts actually consumes: a `globalThis.window` stand-in
 * whose `addEventListener('message', ...)` call is captured so the test can invoke the
 * SAME `onMessage` closure `waitForParentConfig` installed, with hand-built event
 * objects — driving the real listener a hostile frame would talk to, not a rebuilt one.
 *
 * Run: npx tsx src/lib/resolveAuthListener.test.ts
 */
import { resolveAuth, type RpcAuth } from './shoalRpc';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
  }
}

type MessageListener = (event: { origin: string; data: unknown; source?: unknown }) => void;

const SELF = 'http://localhost:5183';
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
    // no __TAURI__: resolveAuth takes the non-Tauri branch, which tries
    // waitForParentConfig FIRST — exactly the path a real embedded (non-Tauri) shoal
    // page takes when the app-shell posts its config.
  };
  return {
    win,
    post: (data: unknown, opts: { origin?: string; source?: unknown } = {}) => {
      if (!listener) throw new Error('onMessage was never registered — waitForParentConfig did not call addEventListener');
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

    // Sibling-source hostile message: event.source !== win.parent.
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' }, { source: {} });
    // Prefix-lookalike origin hostile message: starts with SELF but is not SELF.
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://attacker.test', rpcAuth: 'Basic evil' }, { origin: `${SELF}.evil.com` });

    check('neither hostile message resolved (or removed) the listener yet', !isRemoved());

    // Now the legit config arrives (same-origin, real parent source).
    post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic ok' });

    const result: RpcAuth | null = await resultPromise;

    // If EITHER hostile message had been accepted, `finish()` would have already
    // resolved (and removed the listener) on that message, and this final trusted
    // post would have been silently ignored (listener gone) — so `result` would be
    // `null` from waitForParentConfig -> the env/Tauri fallback, or (if `finish`
    // hadn't fired for either, e.g. a broken gate that never resolves) the promise
    // would hang. Getting the LEGIT endpoint back proves both hostiles were dropped
    // by the real listener, not merely by the pure function in isolation.
    check(
      'resolveAuth resolves to the legit config, not either hostile one, and not null',
      result !== null && result.endpoint === 'http://127.0.0.1:19736' && result.authHeader === 'Basic ok',
      result,
    );
    check('the one-time listener was removed after accepting the trusted message', isRemoved());
  } finally {
    if (original === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = original;
  }

  // --- Second run: prove a repoint (trusted origin/source, but a SECOND config that
  // changes rpcEndpoint) is impossible to even attempt here — waitForParentConfig
  // resolves once and removes itself (structural first-wins, no merge needed; see
  // task-4-report.md), so there is nothing further to lock. This just documents that
  // the one-shot design is itself endpoint-safe: a second message of any kind after
  // the first resolve can't reach `finish()` again because the listener is gone.
  {
    const { win, post, isRemoved } = makeFakeWindow();
    (globalThis as { window?: unknown }).window = win;
    try {
      const resultPromise = resolveAuth();
      post({ type: 'SWIMCHAIN_RPC_CONFIG', rpcEndpoint: 'http://127.0.0.1:19736', rpcAuth: 'Basic first' });
      const result = await resultPromise;
      check('first (only) trusted config accepted', result?.endpoint === 'http://127.0.0.1:19736', result);
      check('listener removed after the single resolve', isRemoved());
      // A message posted after resolution is a no-op: nothing is listening any more.
      // (Not asserted via a spy — the listener reference itself is already gone from
      // `win`'s perspective once `removeEventListener` ran; re-posting has no observer.)
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
