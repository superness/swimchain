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
 * NO SPONSORSHIP METHOD IS FAKED HERE, AND THAT IS A STATEMENT ABOUT THE
 * CLIENT. This harness once answered `get_sponsorship_status`,
 * `list_sponsorship_offers` and `claim_sponsorship_offer`, because the window
 * called them. It does not any more: being let into the water is part of being
 * on the network, not something the game grants, and `rpcCalls` below is what
 * `App.test.ts` section 5 uses to prove the window never asks.
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
  /**
   * Every `submit_reply` the window made, in order.
   *
   * `body` IS THE WIRE BODY, VERBATIM, and it is here because "the window kept
   * writing" and "the window is somewhere the player can play" are two
   * different claims and only one of them is visible in a count. A presence
   * body carries the position of the swimmer that authored it, so a decoded
   * write says WHICH SEA the player's own fish is in — the shallows' spawn and
   * the open water's are different points, and neither is reachable from the
   * other by accident. `App.test.ts` §6 decodes it with the shipping decoder
   * rather than parsing fields here.
   *
   * `atMs` is when it reached the node, so a check can ask whether writes were
   * still arriving a whole emit-gap after the first refusal — which is the
   * difference between a client that is still swimming and one whose last few
   * writes were already in flight when it gave up.
   */
  readonly submitted: { author: string; parent: string; body: string; atMs: number }[];
  /** How many live sockets were opened. One chain sea opens exactly one, so a
   *  second means the sea was torn down and rebuilt. */
  readonly sockets: number;
  /**
   * How many of those were CLOSED, counted after the window was torn down, and
   * the most that were ever open at the same instant.
   *
   * A REBUILD IS NOT A LEAK AND A COUNT OF OPENINGS CANNOT TELL THE DIFFERENCE,
   * which is why these two are here. Every change of standing rebuilds the sea,
   * so a window that is refused and then let in opens THREE sockets in its life
   * (the shell arriving, the edge going up, the edge coming down) — and the
   * question nobody had answered was whether the earlier ones were ever shut.
   * `maxSocketsOpen` is the answer while the window is running (React's
   * cleanup must stop the old sea before the new effect builds the next one)
   * and `socketsClosed` is the answer at the end. A socket the driver
   * abandoned without calling `close()` shows up in neither `sockets` nor any
   * error: it shows up here, as a number that does not match.
   */
  readonly socketsClosed: number;
  readonly maxSocketsOpen: number;
  /**
   * How many times the boundary ENTERED the DOM, and how many times it began
   * lifting — sampled continuously, not read once at teardown.
   *
   * `edgeAtEnd` below cannot see a surface that came and went, and the two
   * things this task must forbid are both of that shape: a boundary that
   * flickers up for a frame on a player who was let in between sessions, and a
   * welcome that plays twice because every later accepted write re-triggers it.
   * Neither is observable in a final state; both are observable here.
   */
  readonly edgeAppearances: number;
  readonly liftAppearances: number;
  /**
   * The wall-clock gap between the node ACCEPTING a write and the boundary
   * starting to lift, or `-1` if either never happened.
   *
   * The measurement that says the yes was acted on rather than noticed later.
   * Plan 4b's failure was a 180 s deadline against a 200 s answer; the shape of
   * the opposite failure — a client that polls, or waits for a refetch, or
   * lifts on the NEXT write instead of this one — is a number here that is
   * seconds rather than milliseconds.
   */
  readonly msFromAcceptToLift: number;
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
  /**
   * Whether the edge of the water was on screen when the window was torn down.
   *
   * The only observation in this file that is about what a PLAYER sees, and it
   * is here because the recognition surface is otherwise proved only in pieces
   * that cannot touch each other: `shoalSend.test.ts` proves a -32015 becomes
   * `kind: 'not-sponsored'`, `wayIn.test.ts` proves that kind folds to the
   * standing — and neither can fail if `App.tsx` never draws the result, which
   * would leave a refused player staring at an empty sea with no explanation.
   */
  readonly edgeAtEnd: boolean;
  /** The second line the boundary was actually drawing at teardown, read off
   *  the DOM, or `null` when there was no boundary. Compared against
   *  `wayIn.EDGE_BODY` rather than retyped — the copy has exactly one home. */
  readonly edgeLine: string | null;
  /**
   * HOW LONG THIS WINDOW HAD GONE WITHOUT PAINTING when it was torn down.
   *
   * The control for `haltFramesAfterWrites`. A check that asserted only "writes
   * kept coming" would pass just as well against a window that was still
   * rendering happily, i.e. against no halt at all — so the scenario has to
   * prove it produced the state it claims to. Measured off the frame callbacks
   * themselves rather than off the flag that stopped them.
   */
  readonly msSinceLastFrame: number;
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
   * A NODE THAT HAS NOT GOT THE ROOM BODY YET. Until this many `get_content`
   * calls have been made, the node answers `-32004 Content not found` — it is
   * up, it is healthy, its chain holds the room's content BLOCK, and the body
   * simply has not been fetched, because on this network content arrives only
   * when something asks. That is the ordinary state of every fresh install and
   * `shellConfig` correctly returns `null` for it.
   *
   * This replaced `waterAppearsAfterListings`, which modelled an empty
   * `list_spaces`. That is no longer a state the window can be in: the space id
   * is derived, so no listing is consulted at all. Task 4's live run is what
   * showed the listing was never the real obstacle.
   */
  readonly roomArrivesAfterAsks?: number;
  /** A node that fails `get_identity_info` this many times before answering —
   *  a transient hiccup on a node that is also busy starting up. */
  readonly identityFailsTimes?: number;
  /**
   * A NODE THAT REFUSES EVERY WRITE BECAUSE NOBODY HAS LET THIS SWIMMER IN —
   * `-32015 IdentityNotSponsored`, the real code `check_identity_sponsored`
   * answers (src/rpc/error.rs:31), from the real method it answers it in.
   *
   * This is the whole unsponsored experience end to end, and it is the ONLY
   * thing this client is allowed to do about a refusal: recognise it. The
   * window must still reach the water, still fold, still draw, still mine and
   * still keep offering — and put the boundary up. It must NOT try to change
   * the answer.
   */
  readonly writesRefused?: boolean;
  /**
   * A NODE THAT REFUSES THE FIRST `n` WRITES AND THEN ACCEPTS EVERYTHING — the
   * vouch landing while the window is open, which is the only way this client
   * can ever learn of it (`wayIn.ts`).
   *
   * It is here for the WRITE FLOOR rather than for the welcome: the sea is
   * rebuilt when the standing changes, a rebuilt sea gets a fresh `InputState`,
   * and a fresh `InputState` has no memory of when this window last wrote. The
   * first write after a transition therefore used to leave 94 ms after the one
   * before it, inside a floor `shoalEmit.ts` calls absolute. Nothing else in
   * this harness can produce a transition to measure that across.
   */
  readonly refuseFirst?: number;
  /**
   * REFUSE THE FIRST `n` WRITES, AND THEN LOSE THE NODE ENTIRELY — every call
   * after that rejects at the transport, the way a laptop that dropped its wifi
   * does. `classifySendFailure` calls this `'unreachable'`.
   *
   * This is the scenario the whole transition has to survive, and the reason it
   * is here rather than only in `wayIn.test.ts`: a rule that lifted the
   * boundary on "the write was not refused" instead of on "the write was
   * accepted" would let one lost packet fake a welcome — the player dropped
   * into water that still will not carry them, with the one thing on screen
   * that said so now gone. The edge must still be up at the end of this run.
   */
  readonly thenUnreachable?: number;
  /**
   * REFUSE THE FIRST `n` WRITES, AND THEN FAIL THEM FOR SOME OTHER REASON
   * ENTIRELY — `-32010 PowInvalid`, a node answering perfectly well and saying
   * no to a different question. `classifySendFailure` calls this `'unknown'`.
   *
   * A second, independent shape of the same trap: `thenUnreachable` fails
   * before the node answers and this one fails after it, so a client that
   * happened to special-case transport errors would pass that one and fail
   * this one.
   */
  readonly thenUnknown?: number;
  /**
   * STOP RENDERING once this many writes have been made, and never render
   * again — a window that has been minimised, fully occluded, or sent to a
   * background desktop.
   *
   * `requestAnimationFrame` STOPS in that state rather than slowing down, and
   * that is the whole reason this is a separate knob from a slow frame rate:
   * every check in this file that watches writes accumulate goes on passing
   * under a window that renders once every five seconds, and none of them can
   * see a window that renders never. Modelled exactly rather than approximated
   * — the shim below simply does not schedule, so the frame loop's own
   * `raf = requestAnimationFrame(frame)` finds nothing to run it again.
   */
  readonly haltFramesAfterWrites?: number;
  /**
   * STEP THE WALL CLOCK BACKWARDS BY THIS MANY MS, once, after the first write
   * — NTP correcting a machine that had drifted forward, a laptop waking from
   * sleep, timezone tooling.
   *
   * `Date.now()` is replaced for the window under observation; nothing else
   * moves, which is exactly the real shape of the event. A step is not a slow
   * clock: elapsed real time is unchanged, and any rule that measures "how long
   * since X" by subtracting two `Date.now()` readings simply reports a negative
   * number for the length of the step.
   */
  readonly stepClockBackMs?: number;
}

/** Nothing here mines for longer than this even on a slow machine; a scenario
 *  that hits it is a real failure, not a slow one. */
const PATIENCE_MS = 30_000;

const ENDPOINT = 'http://127.0.0.1:29736';
const COOKIE_HEADER = 'Basic X19jb29raWVfXzpkZWFkYmVlZg==';
export const NODE_PUBKEY = 'c7'.repeat(32);
const NODE_ADDRESS = 'sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqexample';
/**
 * The water's space id, DERIVED exactly as the shipped client derives it.
 *
 * It was an invented `sp1qqq…` that the fake `list_spaces` handed back, and it
 * has to be derived now because the client derives it too: a hand-written
 * constant here would name a different space from the one the window resolves,
 * so every write would go to a room the window is not in and every "reached
 * water" check in `App.test.ts` would be measuring this file instead of the
 * client.
 *
 * THIS PARAGRAPH USED TO DESCRIBE A FAKE SPONSORSHIP OFFER AND AN
 * `ensureSponsored` THAT MATCHED ITS `space_scope`. NEITHER EXISTS. Both went
 * with the claim flow (`passage.ts`, removed on the ruling that sponsorship is
 * part of being on the network and not something the game grants), and the
 * comment outlived them by two plans — sitting two hundred lines under this
 * file's own "NO SPONSORSHIP METHOD IS FAKED HERE", describing machinery for
 * the one rule this client is strictest about. Nothing in this harness answers
 * any sponsorship method, and `App.test.ts` §6 proves the window never asks.
 */
export const SHOAL_SPACE = await waterSpaceId();
const SIG_HEX = Array.from({ length: 64 }, (_, i) => (i * 5 + 11) & 0xff)
  .map((b) => b.toString(16).padStart(2, '0')).join('');

/** The water's display name and namespace, imported rather than retyped. */
import { WATER_APP, WATER_NAME, waterSpaceId } from './shellConfig';
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
  const submitted: { author: string; parent: string; body: string; atMs: number }[] = [];
  const rpcCalls: string[] = [];
  let sockets = 0;
  /** When a frame callback last actually ran. See the `requestAnimationFrame`
   *  shim: a halted window stops stamping this, and the observation is the
   *  measured silence rather than the flag that caused it. */
  let lastFrameMs = 0;
  /** What `stepClockBackMs` has done to this window's wall clock so far. */
  let clockOffsetMs = 0;
  let socketsClosed = 0;
  let socketsOpen = 0;
  let maxSocketsOpen = 0;
  let askedShell = false;
  let listings = 0;
  let roomAsks = 0;
  let identityAsks = 0;
  /** When the node first ANSWERED YES to a write, and when the boundary first
   *  started lifting. Wall clock, `-1` for "never". */
  let firstAcceptMs = -1;
  let firstLiftMs = -1;

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

  /**
   * A socket that opens, says nothing, and REMEMBERS WHETHER IT WAS SHUT.
   *
   * The close bookkeeping is the whole reason this class grew. `startLive`'s
   * `closeSocket` nulls every handler before calling `close()`, so a socket
   * being torn down reports nothing through `onclose` and a harness watching
   * only the callbacks would see an abandoned socket and a properly closed one
   * as the same thing. Counting the `close()` CALL is the observation that can
   * tell them apart. `open` guards against double-counting a socket the driver
   * closes twice (the connect-timeout path and `stop()` can both reach one).
   */
  class QuietSocket {
    readyState = 1;
    private open = true;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() {
      sockets++;
      socketsOpen++;
      if (socketsOpen > maxSocketsOpen) maxSocketsOpen = socketsOpen;
      setTimeout(() => this.onopen?.(), 0);
    }
    send(): void { /* the node never answers */ }
    close(): void {
      if (this.open) { this.open = false; socketsOpen--; socketsClosed++; }
      this.onclose?.();
    }
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
        // NOTHING SHOULD REACH THIS ANY MORE. The space id is derived
        // (`shellConfig.waterSpaceId`), so the window never asks for a listing.
        // Kept, answering correctly, so that a check counting `list_spaces` at
        // zero is measuring the window's behaviour and not a missing fake.
        listings++;
        return ok({ spaces: [{ space_id: SHOAL_SPACE, name: WATER_NAME, app: WATER_APP }], total: 1 });
      }
      case 'get_content':
        // A NODE THAT IS UP AND HEALTHY AND HAS NOT GOT THE ROOM BODY YET —
        // the real condition of every fresh install, and the one Task 4 watched
        // for 3 m 18 s. `get_content` is local-only, so it simply fails until
        // something has asked the network for it.
        roomAsks++;
        if (roomAsks <= (s.roomArrivesAfterAsks ?? 0)) return err(-32_004, 'Content not found');
        return ok({ content_id: req.params.content_id });
      case 'request_content':
        // The driver. Recorded in `rpcCalls` like everything else, so a check
        // can assert the window actually asked rather than merely waited.
        return ok({ status: 'discovering', content_id: req.params.content_id });
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
          body: String(req.params.body ?? ''),
          atMs: Date.now(),
        });
        // ...and, once, the machine's clock jumps backwards under the window.
        if (s.stepClockBackMs !== undefined && submitted.length === 1) {
          clockOffsetMs = -s.stepClockBackMs;
        }
        // RECORDED FIRST, THEN REFUSED. A refused write is still a write the
        // window mined, signed and sent — `submitted` is how every other check
        // in `App.test.ts` knows the window reached the water at all, and an
        // unsponsored player reaches it exactly as far as anyone else does.
        //
        // ONE COUNT, THREE ENDINGS. All three "refuse the first n" scenarios
        // share the same opening — the player is at the edge, for the real
        // reason, with the real code — and differ only in what happens on the
        // write AFTER it. That is the point: the opening is a control the three
        // share, so a difference in the outcome is a difference in what the
        // client did with the ending and nothing else.
        {
          const refuseUpTo = s.refuseFirst ?? s.thenUnreachable ?? s.thenUnknown ?? 0;
          if (s.writesRefused || submitted.length <= refuseUpTo) {
            return err(-32_015, 'Identity is not sponsored');
          }
        }
        // THE WRITE NEVER LANDS, AND NOTHING EVER SAYS SO. `fetch` itself
        // rejects — a connection reset, a proxy that dropped the POST — which
        // is what `rpcCall` turns into `NodeUnreachableError` and
        // `classifySendFailure` into `'unreachable'`.
        //
        // ONLY THE WRITE, and that is the sharper scenario rather than the
        // weaker one. A window that had lost its network entirely would fail
        // `sign_message` first and never reach `submit_reply` at all, which
        // makes the attempts uncountable and, worse, makes the run pass for a
        // client that had simply stopped. Here the node is plainly there, the
        // window reaches it, mines and signs — and the one call that decides
        // its standing comes back as nothing at all. That is the case where
        // "the write was not refused" is most tempting and most wrong.
        if (s.thenUnreachable !== undefined) throw new TypeError('fetch failed');
        if (s.thenUnknown !== undefined) return err(-32_010, 'Proof of work invalid');
        if (firstAcceptMs < 0) firstAcceptMs = Date.now();
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
  // THE HALT (`haltFramesAfterWrites`): from the named write onward this
  // schedules nothing, so no further frame ever runs. It still returns a
  // handle, because the component stores one and cancels it on teardown.
  //
  // `lastFrameMs` is stamped by the WRAPPER around every callback that actually
  // runs, so `msSinceLastFrame` is a measurement of silence rather than an
  // inference from the flag that caused it.
  put('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const halt = s.haltFramesAfterWrites;
    if (halt !== undefined && submitted.length >= halt) return 0;
    return dom.window.requestAnimationFrame((t: number) => { lastFrameMs = Date.now(); cb(t); });
  });
  put('cancelAnimationFrame', (h: number) => dom.window.cancelAnimationFrame(h));
  // THE BACKWARDS STEP (`stepClockBackMs`). Only `Date.now()` and a bare
  // `new Date()` move; `performance.now()` is untouched, which is the whole
  // point — it is monotonic, and a rule that measures elapsed time with it
  // cannot be stalled by a clock correction. Installed for every scenario so
  // the shape of the global is identical whether or not a step is asked for.
  const RealDate = Date;
  class SteppedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + clockOffsetMs);
      else super(...(args as [number]));
    }
    static now(): number { return RealDate.now() + clockOffsetMs; }
  }
  put('Date', SteppedDate);
  put('fetch', nodeFetch);
  put('WebSocket', QuietSocket);
  put('IS_REACT_ACT_ENVIRONMENT', false);

  // Imported here, not at module scope: `react-dom/client` reads `document` on
  // first render only, but keeping the order explicit costs nothing.
  const { createRoot } = await import('react-dom/client');
  const { createElement } = await import('react');

  const root = createRoot(dom.window.document.getElementById('root') as unknown as Element);

  /**
   * WATCH THE BOUNDARY FOR THE WHOLE RUN, not at the end.
   *
   * Two watchers on one sampler, on purpose, and neither is redundant. The
   * MutationObserver is EXACT — React commits through DOM mutations, so every
   * appearance and disappearance is a callback — but its callbacks are batched
   * per microtask, so an appear-and-vanish inside one batch would read as
   * nothing happening. The interval cannot miss a state that lasts (the lift is
   * `CROSSING_MS`, ~130 of these) and cannot see one that does not. Together
   * they cover both, and the sampler is idempotent so double-sampling one
   * change counts it once.
   */
  let edgeOn = false;
  let liftOn = false;
  let edgeAppearances = 0;
  let liftAppearances = 0;
  const sample = () => {
    const el = dom.window.document.querySelector('.shoal-edge');
    const on = el !== null;
    if (on && !edgeOn) edgeAppearances++;
    edgeOn = on;
    const lifting = el !== null && el.classList.contains('shoal-edge--lifting');
    if (lifting && !liftOn) {
      liftAppearances++;
      if (firstLiftMs < 0) firstLiftMs = Date.now();
    }
    liftOn = lifting;
  };
  const observer = new dom.window.MutationObserver(sample);
  observer.observe(dom.window.document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
  });
  const sampleTimer = setInterval(sample, 20);

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

  sample();
  const edgeAtEnd = dom.window.document.querySelector('.shoal-edge') !== null;
  const edgeLine = dom.window.document.querySelector('.shoal-edge-body')?.textContent ?? null;
  clearInterval(sampleTimer);
  observer.disconnect();
  // AFTER the unmount, so the socket counts include what React's own cleanup
  // did — closing the last live sea is the effect teardown's job, and a run
  // that read them a line earlier would report every window as leaking one.
  root.unmount();
  dom.window.close();
  for (const [k, d] of Object.entries(saved)) {
    if (d === undefined) delete g[k]; else Object.defineProperty(g, k, d);
  }

  return {
    submitted, sockets, socketsClosed, maxSocketsOpen, askedShell, rpcCalls,
    edgeAtEnd, edgeLine, edgeAppearances, liftAppearances,
    msSinceLastFrame: lastFrameMs === 0 ? -1 : Date.now() - lastFrameMs,
    msFromAcceptToLift: firstAcceptMs < 0 || firstLiftMs < 0 ? -1 : firstLiftMs - firstAcceptMs,
  };
}
