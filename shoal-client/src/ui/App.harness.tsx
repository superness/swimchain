/**
 * The real `App`, rendered, driven and observed — the other half of
 * `App.test.ts`. Not a test file: it holds no checks, makes no judgements, and
 * exists only so the component can be run at all.
 *
 * ## WHY THIS IS A SEPARATE FILE FROM THE CHECKS
 *
 * `App.tsx` reads `import.meta.env.DEV`, which does not exist under `tsx` —
 * `import.meta` is real in Node ESM but has no `env`, so the very first thing
 * the module does is a `TypeError`. Nothing outside a module can add a property
 * to its `import.meta`, so there is no way to import `App.tsx` from a plain test.
 *
 * `App.test.ts` therefore BUNDLES this file with esbuild and
 * `define: { 'import.meta.env.DEV': 'false' }` before importing it — the same
 * substitution Vite makes for a production build, made by the same tool. So the
 * component under observation is compiled exactly as a SHIPPED build compiles
 * it, which is stronger evidence than a dev build would be and is what the
 * defect this file exists for is about.
 *
 * ## WHAT IS FAKE, AND IT IS ONLY EVER THE OUTSIDE
 *
 *   jsdom            a DOM. The canvas 2D context is a no-op proxy: the frame
 *                    loop really runs, but nothing is rasterised.
 *   `invoke`         the shell's Tauri command surface, ANSWERING AFTER A DELAY
 *                    THE CALLER CHOOSES — this is the whole point. A real cold
 *                    start waits on `get_rpc_config` for as long as the node
 *                    takes to bind RPC, up to 120 s.
 *   `fetch`          a node that answers JSON-RPC.
 *   `WebSocket`      a socket that opens and then says nothing.
 *
 * Everything between them is shipping code: the real `App`, the real
 * `shellConfig`, `chooseSeaSource`, `seaFrom`, `chainSea`, `shoalSend` (real
 * Argon2id, at the node's own regtest difficulty), and the real React.
 *
 * ## WHAT IS OBSERVED, AND WHY IT IS NOT "the scene state"
 *
 * `submit_reply` calls. A window that has reached real water publishes its
 * opening vector on the first frame after the sea is built (`shouldEmit`
 * returns `true` for a `null` last vector), signed through the node. Reading
 * React state instead would prove the component set a variable; a reply on the
 * wire proves a player is in the water with everyone else. It is the same
 * signal the live shell was judged by in the Task 2 report.
 *
 * ## THIS BUNDLE IS NOT GATE EVIDENCE. EVER.
 *
 * `App.test.ts` bundles this file with esbuild, and esbuild does not tree-shake
 * the way rollup does — `identityFromLabel` and `browserIdentity` are textually
 * PRESENT in `node_modules/.cache/shoal-app-harness.mjs`, behind an
 * `if (false)` that can never run. That is expected and harmless, and it is a
 * trap for anyone who greps the wrong artifact: the only build whose contents
 * say anything about the shipped gate is `dist/assets/*.js`, produced by
 * `npm run build` (rollup). See `devChainSea`'s comment in `App.tsx`.
 */
import { JSDOM } from 'jsdom';

export interface Observation {
  /** Every `submit_reply` the window made, in order. */
  readonly submitted: { author: string; parent: string }[];
  /** How many live sockets were opened. One chain sea opens exactly one, so a
   *  second means the sea was torn down and rebuilt. */
  readonly sockets: number;
  /** Whether `get_rpc_config` was ever asked. */
  readonly askedShell: boolean;
  /**
   * EVERY JSON-RPC method the window called, in order — recorded by the fake
   * `fetch`, which is installed for every scenario including the ones with no
   * shell in them.
   *
   * That last part is the point. `askedShell` can only ever be set inside the
   * `!noShell` block, so "a browser tab asked no shell" cannot fail and proves
   * nothing. This can: a browser tab that reached a node at all — the exact
   * regression `shellConfig`'s header warns about, where an endpoint arrives
   * from somewhere that is not the shell — shows up here as a non-empty list.
   */
  readonly rpcCalls: string[];
}

export interface Scenario {
  /**
   * Hold `get_rpc_config` open until this harness releases it — a cold start.
   *
   * A HELD PROMISE RATHER THAN A TIMER, and that is not fussiness. The defect
   * this file exists for lives in a window that opens when the component asks
   * the shell and closes when the shell answers; "press a key 300 ms into a
   * 900 ms delay" only *probably* lands inside it, and a loaded machine could
   * turn a real regression into a pass. With a gate the key is pressed strictly
   * after the ask and strictly before the answer, every run, on any machine.
   */
  readonly coldStart?: boolean;
  /**
   * A key to press, and the moment to press it:
   *   `duringColdStart`  inside the window above (requires `coldStart`);
   *   `afterFirstWrite`  once this window has already joined and written.
   */
  readonly press?: { key: string; when: 'duringColdStart' | 'afterFirstWrite' };
  /** The window's query string, e.g. `'?at=1000'`. */
  readonly search?: string;
  /** Wait (up to a generous ceiling) for the first write before settling.
   *  Off for scenarios that expect no write at all. */
  readonly awaitWrite?: boolean;
  /** How long to keep the window open at the end, so a sea that was going to
   *  be rebuilt has had its chance to open a second socket. */
  readonly settleMs: number;
  /** When set, no `window.__TAURI__` at all — a browser tab. */
  readonly noShell?: boolean;
  /**
   * A NODE THAT HAS NOT FINISHED SYNCING. Until this many `list_spaces` calls
   * have been made, the node answers with an empty listing — it is up, it is
   * healthy, and it has simply never heard of this water yet. That is the
   * ordinary state of every fresh install, and `shellConfig` correctly returns
   * `null` for it.
   */
  readonly waterAppearsAfterListings?: number;
  /** A node that fails `get_identity_info` this many times before answering —
   *  a transient hiccup on a node that is also busy starting up. */
  readonly identityFailsTimes?: number;
}

/** Nothing here mines for longer than this even on a slow machine; a scenario
 *  that hits it is a real failure, not a slow one. */
const PATIENCE_MS = 30_000;

const ENDPOINT = 'http://127.0.0.1:29736';
const COOKIE_HEADER = 'Basic X19jb29raWVfXzpkZWFkYmVlZg==';
export const NODE_PUBKEY = 'c7'.repeat(32);
const NODE_ADDRESS = 'sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqexample';
export const SHOAL_SPACE = 'sp1' + 'q'.repeat(34);
const SIG_HEX = Array.from({ length: 64 }, (_, i) => (i * 5 + 11) & 0xff)
  .map((b) => b.toString(16).padStart(2, '0')).join('');

/** The water's display name and namespace, imported rather than retyped. */
import { WATER_APP, WATER_NAME } from './shellConfig';
import { App } from './App';

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => { setTimeout(r, ms); });
}

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await sleep(15);
  }
  return pred();
}

/**
 * A 2D context that swallows everything.
 *
 * Every property read yields a function, and gradient factories yield something
 * with `addColorStop`, so `seaPaint` can draw its whole frame without jsdom
 * needing a real canvas backend. The frame loop is NOT stubbed — steps 1-6 of
 * `App`'s loop all run, including the one that publishes.
 */
function fakeContext(canvas: unknown): unknown {
  const gradient = { addColorStop: () => {} };
  return new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'canvas') return canvas;
      if (prop === 'measureText') return () => ({ width: 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient'
        || prop === 'createPattern') return () => gradient;
      // `seaPaint.noisePattern` really builds a 96x96 tile and writes into
      // `img.data`, so these two have to hand back something with a buffer of
      // the right size or the frame loop THROWS — and a frame loop that throws
      // is not the frame loop that ships. Sized from the arguments rather than
      // fixed, because the caller chooses the tile.
      if (prop === 'createImageData' || prop === 'getImageData') {
        return (a: unknown, b: unknown) => {
          const w = typeof a === 'number' ? a : 1;
          const h = typeof b === 'number' ? b : 1;
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        };
      }
      return () => undefined;
    },
    set: () => true,
  });
}

/** Run one window, from mount to teardown, and report what reached the node. */
export async function observe(s: Scenario): Promise<Observation> {
  const submitted: { author: string; parent: string }[] = [];
  const rpcCalls: string[] = [];
  let sockets = 0;
  let askedShell = false;
  let listings = 0;
  let identityAsks = 0;

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `http://localhost/${s.search ?? ''}`,
    pretendToBeVisual: true,
  });
  const win = dom.window as unknown as Record<string, unknown>;
  const g = globalThis as unknown as Record<string, unknown>;

  // Only what the component and React actually reach for. Saved and restored so
  // one scenario cannot leak into the next.
  //
  // `defineProperty` RATHER THAN ASSIGNMENT, because some of these are not
  // writable: Node 24 exposes `globalThis.navigator` as a getter-only accessor
  // and a plain `g.navigator = …` throws. The original descriptor is kept so
  // teardown puts back exactly what was there, accessor and all.
  const saved: Record<string, PropertyDescriptor | undefined> = {};
  const put = (name: string, value: unknown) => {
    saved[name] = Object.getOwnPropertyDescriptor(g, name);
    Object.defineProperty(g, name, { value, writable: true, configurable: true, enumerable: true });
  };

  (dom.window.HTMLCanvasElement.prototype as unknown as {
    getContext: (id: string) => unknown;
  }).getContext = function getContext(this: unknown) { return fakeContext(this); };

  class QuietSocket {
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { sockets++; setTimeout(() => this.onopen?.(), 0); }
    send(): void { /* the node never answers */ }
    close(): void { this.onclose?.(); }
  }

  const nodeFetch = (async (_input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    const req = JSON.parse(init?.body ?? '{}') as { method: string; params: Record<string, unknown>; id: number };
    rpcCalls.push(req.method);
    const ok = (result: unknown) => ({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', result, id: req.id }),
      text: async () => '',
    });
    const err = (code: number, message: string) => ({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', error: { code, message }, id: req.id }),
      text: async () => '',
    });
    switch (req.method) {
      case 'get_identity_info':
        identityAsks++;
        if (identityAsks <= (s.identityFailsTimes ?? 0)) return err(-32_603, 'Internal error');
        return ok({ has_identity: true, public_key: NODE_PUBKEY, address: NODE_ADDRESS });
      case 'list_spaces': {
        // The node is up and healthy; it has just not learned about this water
        // from a peer yet. An empty page is a LAST page, so `findWaterSpaceId`
        // stops after one call — the same single RPC a real fresh node costs.
        listings++;
        if (listings <= (s.waterAppearsAfterListings ?? 0)) return ok({ spaces: [], total: 0 });
        return ok({ spaces: [{ space_id: SHOAL_SPACE, name: WATER_NAME, app: WATER_APP }], total: 1 });
      }
      case 'get_content':
        return ok({ content_id: req.params.content_id });
      case 'sign_message':
        return ok({ signature: SIG_HEX, public_key: NODE_PUBKEY });
      case 'get_info':
        return ok({ network: 'regtest', min_pow_difficulty: 4 });
      case 'get_replies':
        return ok({ parent_id: req.params.content_id, replies: [], total_count: 0 });
      case 'submit_reply':
        submitted.push({
          author: String(req.params.author_id ?? ''),
          parent: String(req.params.parent_id ?? ''),
        });
        return ok({ content_id: `sha256:${'ef'.repeat(32)}` });
      default:
        return ok({});
    }
  }) as unknown as typeof fetch;

  // The cold start, as a gate this harness opens rather than a race it hopes to
  // win. `get_rpc_config` really does block for as long as the node takes to
  // bind RPC (up to 120 s, src-tauri/src/main.rs:172-200).
  let openTheGate = () => {};
  const gate: Promise<void> = s.coldStart
    ? new Promise<void>((r) => { openTheGate = r; })
    : Promise.resolve();

  if (!s.noShell) {
    win.__TAURI__ = {
      core: {
        invoke: async (cmd: string) => {
          if (cmd !== 'get_rpc_config') throw new Error(`unexpected command ${cmd}`);
          askedShell = true;
          await gate;
          return { endpoint: ENDPOINT, auth: COOKIE_HEADER };
        },
      },
    };
  }

  put('window', dom.window);
  put('document', dom.window.document);
  put('navigator', dom.window.navigator);
  put('HTMLElement', dom.window.HTMLElement);
  put('HTMLCanvasElement', dom.window.HTMLCanvasElement);
  put('Element', dom.window.Element);
  put('Node', dom.window.Node);
  put('Event', dom.window.Event);
  put('KeyboardEvent', dom.window.KeyboardEvent);
  put('requestAnimationFrame', (cb: FrameRequestCallback) => dom.window.requestAnimationFrame(cb));
  put('cancelAnimationFrame', (h: number) => dom.window.cancelAnimationFrame(h));
  put('fetch', nodeFetch);
  put('WebSocket', QuietSocket);
  put('IS_REACT_ACT_ENVIRONMENT', false);

  // Imported here, not at module scope: `react-dom/client` reads `document` on
  // first render only, but keeping the order explicit costs nothing.
  const { createRoot } = await import('react-dom/client');
  const { createElement } = await import('react');

  const root = createRoot(dom.window.document.getElementById('root') as unknown as Element);
  root.render(createElement(App));

  const pressKey = () => {
    if (!s.press) return;
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: s.press.key }));
  };

  if (s.coldStart) {
    // Wait for the window to have ASKED — that is the moment the offline sea is
    // on screen with no configuration behind it, which is the whole window the
    // defect lived in — then act inside it, then let the shell answer.
    await waitFor(() => askedShell, PATIENCE_MS);
    if (s.press?.when === 'duringColdStart') pressKey();
    openTheGate();
  }

  if (s.awaitWrite) await waitFor(() => submitted.length > 0, PATIENCE_MS);
  if (s.press?.when === 'afterFirstWrite') pressKey();

  await sleep(s.settleMs);

  root.unmount();
  dom.window.close();
  for (const [k, d] of Object.entries(saved)) {
    if (d === undefined) delete g[k]; else Object.defineProperty(g, k, d);
  }

  return { submitted, sockets, askedShell, rpcCalls };
}
