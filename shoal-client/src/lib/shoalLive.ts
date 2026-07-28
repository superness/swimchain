/**
 * The Shoal — the live channel (plan 2b, "the bridge"). Makes another
 * player's move show up in seconds by subscribing to the node's real-time
 * event stream instead of waiting on a poll, while never trusting that
 * stream to actually be working.
 *
 * ## Verified platform facts (read the node source, not assumed — see the
 * task brief and `docs/superpowers/sdd/2026-07-28-the-shoal-bridge/`)
 *
 *  - `GET /ws` upgrades to a WebSocket on the RPC port (src/rpc/server.rs
 *    :841-852). It is unauthenticated (only per-IP/total connection caps
 *    apply — src/rpc/events.rs:36-39), matching swimchain-frontend's
 *    events.ts module header, which this driver's URL-conversion and
 *    onerror/onclose handling both take as prior art (cited inline below).
 *  - Subscribe: `{"jsonrpc":"2.0","method":"subscribe","params":
 *    {"events":["content_new"]},"id":1}` (src/rpc/events.rs:14-19).
 *  - Events arrive as notifications:
 *    `{"jsonrpc":"2.0","method":"event","params":{"type":"content_new",
 *    "data":{...}}}` (src/rpc/events.rs:21-24).
 *  - Gossip ingestion — another player's action arriving over the P2P layer,
 *    not just our own writes — publishes `content_new`
 *    (src/node/router/router.rs:5947-5952). That is the entire reason this
 *    module exists: without it there would be nothing to subscribe to.
 *  - The event's `data` carries `content_id`, `content_type`, `space_id`,
 *    `author_id`, `thread_id` — checked directly against
 *    `Event::content_new` (src/rpc/events.rs:132-149). The task brief's own
 *    verified-facts table names this field `author` (singular); the real
 *    field is `author_id`. Not load-bearing here — this module never reads
 *    the author field, only `space_id` — but recorded since the brief said
 *    to report anything found off, and a future task reading `author` off
 *    this event would get `undefined`.
 *  - No body. A notification is a hint to refetch, never the payload.
 *
 * ## The defect this module found in its own brief
 *
 * The brief's documented signature is `nextAction(state, event, nowMs):
 * {state: LiveState, refetch, delayMs}` — `state` typed as the bare
 * `'connecting'|'live'|'polling'|'stopped'` union both in and out. That
 * cannot work: `nextAction` is required to be pure (no closures, no module
 * state — see the global constraints), so every fact it needs on the NEXT
 * call has to come back out of THIS call. A bare phase string cannot carry
 * the reconnect-attempt counter (needed for backoff to grow AND to reset),
 * the last-liveness timestamp (needed for silence detection), or which
 * space this machine cares about (needed for the space filter) — three
 * separate pieces of state Step 2 explicitly requires to persist and be
 * exercised by mutation. A function that forgets all three every call
 * cannot implement any of them.
 *
 * The fix: `state` (in and out) is `LiveMachine` — a small record whose
 * `state` FIELD is the `LiveState` the brief describes, plus the three
 * fields above. `nextAction` returns a `LiveMachine` with `refetch` and
 * `delayMs` bolted on (`LiveDecision`), so the driver's whole loop is
 * "hold the last `LiveMachine`, feed it back in": `machine =
 * nextAction(machine, event, now())`. This satisfies the brief's documented
 * shape (the return value DOES have `state`, `refetch`, `delayMs`) while
 * actually being sufficient to implement the brief's own requirements.
 *
 * ## Silence detection: silence alone, not silence plus something else
 *
 * The brief asks explicitly whether silence by itself is the right signal,
 * given that a quiet shoal (nobody moving) is indistinguishable from a
 * silently-broken socket by content alone. Decision: **silence alone**,
 * checked on a fixed recurring tick, no secondary signal. Two reasons:
 *
 *  1. There IS no reliable secondary signal available to a browser-side
 *     WebSocket client. The platform's own liveness signals (open/close/
 *     error) are exactly what is in question — this module's whole premise
 *     is that an open socket is not proof of a working one. A ping/pong
 *     round-trip could add one, but the verified facts table documents no
 *     server-side pong reply to key off, and inventing a protocol beyond
 *     what's verified is exactly the kind of unverified assumption the
 *     brief's own methodology (read the source, don't assume) argues
 *     against.
 *  2. The two outcomes are not symmetric. A false-positive refetch (shoal
 *     genuinely quiet) costs one redundant `get_replies` call that returns
 *     an unchanged log — `fetchRoomLog`/`repliesToLog` are idempotent and
 *     cheap by construction (shoalRoom.ts). A false negative (socket
 *     silently dead, no refetch) costs total silence: players stop
 *     appearing and nothing self-corrects, which is exactly the failure
 *     mode the task brief calls "no better than no socket." An asymmetric
 *     cost like that argues for erring toward the refetch.
 *
 * Concretely: the silence check does NOT change `state` away from `'live'`
 * — the socket has not reported an error, so there is no basis to call it
 * broken — it just makes `'live'` behave exactly like `'polling'` (refetch
 * every tick) whenever it has gone quiet for longer than one poll interval,
 * layered under the interrupt-driven refetch a real `content_new` still
 * gives immediately. `'live'` only demotes to `'polling'` on an actual
 * `close`/`error`, a strictly stronger signal than mere silence.
 *
 * The threshold is DERIVED, not invented: it is `pollIntervalMs` itself —
 * "no better than no socket" is read literally as "falls back to exactly
 * the cadence polling would have used," not some separately-tuned number.
 *
 * ## Deterministic jitter (no `Math.random()`, per the global constraint)
 *
 * `reconnectDelayMs` adds `(attempt * 37) % 100` milliseconds — a small
 * (0-99ms), attempt-derived offset — on top of the exponential base, before
 * capping. It exists for the standard reconnect-storm reason (many clients
 * whose sockets all dropped at the same instant, e.g. a node restart,
 * should not all retry on the exact same millisecond), achieved here
 * without true randomness: two machines with different attempt counts (the
 * overwhelmingly likely case — different clients rarely fail their Nth
 * attempt in lockstep) get different jitter, and the same machine replayed
 * with the same inputs gets the same delay, which is what makes this
 * testable without mocking `Math.random`. 37 and 100 are arbitrary
 * (coprime-ish spread, not a tuned constant); the only property depended on
 * is "small relative to the exponential step size," verified by hand in
 * this module's test file.
 *
 * ## Node's global `WebSocket`
 *
 * Checked directly rather than assumed: this repo's Node (v24.16.0) DOES
 * have a global `WebSocket` (`typeof WebSocket === 'function'`), and
 * `@types/node`@20.19.43 declares its type globally too (via
 * `undici-types/websocket.d.ts`, activated by `web-globals/fetch.d.ts`'s
 * conditional — this project's tsconfig carries no `"dom"` lib, so that
 * conditional resolves to the undici type, not `{}`). But `package.json`
 * declares `"engines": {"node": ">=18.0.0"}`, and Node did not ship a
 * global `WebSocket` until v21 (experimental) / v22 (unflagged) — v18 has
 * none. So the injection the brief asks for is not a hypothetical: on this
 * project's own stated minimum Node version, `opts.WebSocketCtor` is the
 * ONLY way this module works at all under plain `tsx`, exactly the way
 * Task 6's smoke script needs it to (mirrors `shoalRpc.ts`'s import-safety
 * story). `startLive` still falls back to the global when present and no
 * override is given, mirroring swimchain-frontend/events.ts's
 * `options.webSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket
 * : undefined)` pattern (src/lib/events.ts:210, that package — a different
 * client, read only as prior art, not imported: shoal-client does not
 * depend on it).
 *
 * ## Other prior art taken from swimchain-frontend/events.ts (same
 * verified `GET /ws` contract, a different client, read for its handling
 * of real WebSocket quirks — not imported)
 *
 *  - `onerror` is a deliberate no-op: the WebSocket spec fires `close`
 *    after `error` on every real failure, so acting on both would
 *    double-count one failure against the backoff attempt counter
 *    (swimchain-frontend/events.ts:325-327 makes the same call, same
 *    reasoning).
 *  - `http(s)://` -> `ws(s)://.../ws` URL conversion (this module's
 *    `wsUrlFromEndpoint`, mirroring that module's `rpcEndpointToWsUrl`).
 *
 * ## What is NOT covered by this module's own unit tests
 *
 * `startLive` is the thin driver — it owns a real (or injected) socket and
 * real timers, and is deliberately not unit-tested here, matching
 * `shoalRoom.ts`'s `fetchRoomLog` precedent (thin RPC-owning code is
 * exercised by Task 6's smoke script against a real node instead).
 * Everything decision-worthy lives in `nextAction`, which is pure and is
 * fully covered by `shoalLive.test.ts` with an injected clock.
 */

import { assertWireSpaceId, type RpcAuth } from './shoalRpc';

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

export type LiveState = 'connecting' | 'live' | 'polling' | 'stopped';

/**
 * The full persistent state `nextAction` threads across calls — see the
 * module header's "defect this module found" section for why this has to
 * be more than the bare `LiveState` phase the brief's prose shorthand
 * suggested. `spaceId` and `pollIntervalMs` are constant for a machine's
 * whole lifetime (set once by `createLiveMachine`); `state`, `attempt` and
 * `lastLiveMs` change as events are applied.
 */
export interface LiveMachine {
  readonly state: LiveState;
  /** The space this room lives in. `content` events for any other space are
   *  ignored for refetch purposes (but still count as proof the socket is
   *  delivering data — see `lastLiveMs`). */
  readonly spaceId: string;
  /** Both the polling-fallback cadence AND the silence-detection threshold
   *  (the threshold is derived from this, not a separate constant — see
   *  the module header). */
  readonly pollIntervalMs: number;
  /** Consecutive connection failures since the last successful `open`.
   *  Resets to 0 on `open` — that reset is what makes the backoff a
   *  backoff and not a monotonic ratchet (mutation-tested). */
  readonly attempt: number;
  /** `nowMs` of the last proof the socket is actually delivering data:
   *  either `open` itself, or any `content` event (matching space or not —
   *  see the module header's asymmetric-cost argument). Read only while
   *  `state === 'live'`, to detect silence. */
  readonly lastLiveMs: number;
}

export type LiveEvent =
  | { readonly type: 'open' }
  /** Covers both a socket `error` and a socket `close` — the driver only
   *  ever sends this from `onclose` (see the module header on why
   *  `onerror` is a no-op), so from this function's point of view there is
   *  exactly one "the connection is gone" signal, not two. */
  | { readonly type: 'disconnected' }
  /** A `content_new` notification arrived, carrying the space it belongs
   *  to (not necessarily this machine's space — the filter is `nextAction`'s
   *  job, not the driver's, so it can be mutation-tested). */
  | { readonly type: 'content'; readonly spaceId: string }
  /** The recurring poll-interval heartbeat. Runs unconditionally for the
   *  machine's whole life once started, regardless of `state` — its effect
   *  differs by state (see `nextAction`), but the driver itself never has
   *  to reason about when to run it. */
  | { readonly type: 'tick' }
  /** The one-shot backoff timer fired: time to try the socket again. */
  | { readonly type: 'reconnect' }
  | { readonly type: 'stop' };

/** `nextAction`'s return: the next `LiveMachine` to hold onto, plus this
 *  call's instructions for the driver. Feeding `LiveDecision` itself back
 *  into the next `nextAction` call as the `state` argument is fine and
 *  intentional — the extra `refetch`/`delayMs` fields are simply ignored by
 *  the next call, which only reads the `LiveMachine` fields. */
export interface LiveDecision extends LiveMachine {
  /** Whether the driver should re-fetch the room log now. */
  readonly refetch: boolean;
  /** Meaningful when `state === 'polling'`: how long until the driver
   *  should retry the socket (the reconnect backoff, already computed —
   *  increasing per attempt, capped). For every other resulting state this
   *  is just `pollIntervalMs`, unused by the driver (the heartbeat tick
   *  cadence is fixed and the driver manages it directly from its own
   *  `pollIntervalMs`, not from this field) — kept populated rather than 0
   *  so the return shape never has a meaningless hole in it. */
  readonly delayMs: number;
}

/** Build the initial machine: always starts `connecting` — the driver is
 *  expected to open a socket immediately after calling this. */
export function createLiveMachine(spaceId: string, pollIntervalMs: number, nowMs: number): LiveMachine {
  return { state: 'connecting', spaceId, pollIntervalMs, attempt: 0, lastLiveMs: nowMs };
}

// --- Reconnect backoff -------------------------------------------------------

/** First retry delay. */
const RECONNECT_BASE_MS = 500;
/** Backoff never waits longer than this between attempts. */
const RECONNECT_MAX_MS = 16_000;
/** 2**5 * RECONNECT_BASE_MS === RECONNECT_MAX_MS exactly (500 * 32 =
 *  16_000), so the cap lands on a step of the doubling sequence rather than
 *  cutting it off mid-step. */
const RECONNECT_MAX_SHIFT = 5;

/**
 * Exponential backoff with a deterministic, attempt-derived jitter (see the
 * module header — no `Math.random()`), capped. `attempt` is 1-based (the
 * count of consecutive failures so far, including the one that just
 * happened); values `< 1` are treated as 1.
 *
 * attempt: 1 -> 500*1  + (1*37)%100  =  500 +37 =  537
 *          2 -> 500*2  + (2*37)%100  = 1000+74  = 1074
 *          3 -> 500*4  + (3*37)%100  = 2000+11  = 2011
 *          4 -> 500*8  + (4*37)%100  = 4000+48  = 4048
 *          5 -> 500*16 + (5*37)%100  = 8000+85  = 8085
 *          6 -> 500*32 + (6*37)%100  =16000+22  =16022 -> capped to 16000
 *          7+-> 16000 (capped)
 * (hand-verified again, independently, in shoalLive.test.ts's comments)
 */
function reconnectDelayMs(attempt: number): number {
  const a = attempt < 1 ? 1 : attempt;
  const shift = a - 1 < RECONNECT_MAX_SHIFT ? a - 1 : RECONNECT_MAX_SHIFT;
  const exp = RECONNECT_BASE_MS * (1 << shift);
  const jitter = (a * 37) % 100;
  const withJitter = exp + jitter;
  return withJitter < RECONNECT_MAX_MS ? withJitter : RECONNECT_MAX_MS;
}

/**
 * The pure decision function. No wall-clock reads — `nowMs` is the only
 * source of time (global constraint). No `Math.random()`. Every branch is
 * exercised by `shoalLive.test.ts`, including the three mutation points
 * called out in the module header and the task brief's Step 6.
 */
export function nextAction(state: LiveMachine, event: LiveEvent, nowMs: number): LiveDecision {
  // `stopped` never schedules anything again, and never re-examines events —
  // this is the total function's own enforcement of that rule, independent
  // of whatever the driver does with the timers it owns.
  if (state.state === 'stopped') {
    return { ...state, refetch: false, delayMs: 0 };
  }
  if (event.type === 'stop') {
    return { ...state, state: 'stopped', refetch: false, delayMs: 0 };
  }

  let phase: LiveState = state.state;
  let attempt = state.attempt;
  let lastLiveMs = state.lastLiveMs;
  let refetch = false;

  switch (event.type) {
    case 'open':
      phase = 'live';
      attempt = 0; // the backoff reset — mutation point 1, see the module header
      lastLiveMs = nowMs;
      break;

    case 'disconnected':
      // Only a failure of an actual attempt (we were trying to connect, or
      // we had a live connection that dropped) counts. A stray/duplicate
      // `disconnected` while already `polling` (no socket currently held
      // open) is a no-op rather than a second penalty for one failure.
      if (state.state === 'connecting' || state.state === 'live') {
        attempt = state.attempt + 1;
        phase = 'polling';
      }
      break;

    case 'content':
      // Any content_new event — regardless of space — is proof the pipe is
      // actually delivering data, so it resets the silence clock even when
      // it doesn't belong to our room.
      lastLiveMs = nowMs;
      if (event.spaceId === state.spaceId) {
        refetch = true; // the space filter — mutation point 3
      }
      break;

    case 'tick':
      if (state.state === 'polling') {
        // The load-bearing fallback: every heartbeat while polling refetches,
        // full stop, regardless of the socket.
        refetch = true;
      } else if (state.state === 'live') {
        // Silence detection — mutation point 2. Strictly greater than the
        // threshold: a tick landing exactly one interval after the last
        // signal is the ordinary cadence, not evidence of silence yet.
        if (nowMs - state.lastLiveMs > state.pollIntervalMs) {
          refetch = true;
        }
      }
      // 'connecting': no-op here by design — a hung connect attempt is the
      // driver's connect-timeout's job (see startLive), not the heartbeat's.
      break;

    case 'reconnect':
      if (state.state === 'polling') {
        phase = 'connecting'; // driver reacts to this transition by opening a socket
      }
      // A 'reconnect' timer firing while not polling is stale (state moved
      // on some other way already) — no-op.
      break;
  }

  const delayMs = phase === 'polling' ? reconnectDelayMs(attempt) : state.pollIntervalMs;
  return { state: phase, spaceId: state.spaceId, pollIntervalMs: state.pollIntervalMs, attempt, lastLiveMs, refetch, delayMs };
}

// ---------------------------------------------------------------------------
// The thin driver
// ---------------------------------------------------------------------------

/** Default poll-interval / silence-threshold, in ms. Policy, not consensus —
 *  this module has nothing to do with the fold. Arbitrary-but-practical:
 *  "seconds, not tens of seconds" is the whole point of this task. */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** The slice of the DOM/undici `WebSocket` this module actually uses —
 *  hand-declared (like shoalRpc.ts's `MinimalWindow`) so a caller can pass
 *  a lightweight fake in tests/the smoke script without it needing to
 *  satisfy the full real interface. */
export interface MinimalWebSocket {
  onopen: ((this: MinimalWebSocket, ev: unknown) => void) | null;
  onmessage: ((this: MinimalWebSocket, ev: { data: unknown }) => void) | null;
  onclose: ((this: MinimalWebSocket, ev: unknown) => void) | null;
  onerror: ((this: MinimalWebSocket, ev: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export type WebSocketCtor = new (url: string) => MinimalWebSocket;

export interface StartLiveOpts {
  /** Where the node is. Only `.endpoint` is read (the events socket is
   *  unauthenticated — see the module header). */
  auth: RpcAuth;
  /** The room's space — the filter `nextAction` applies to incoming
   *  `content_new` events. */
  spaceId: string;
  /** Poll-interval / silence-threshold override. Defaults to
   *  `DEFAULT_POLL_INTERVAL_MS`. */
  pollIntervalMs?: number;
  /** Injected clock, for testability — see the global constraints
   *  (`Date.now()` is permitted only here, and only via this indirection).
   *  Defaults to `Date.now`. */
  now?: () => number;
  /** Injected WebSocket constructor. Defaults to the global `WebSocket` if
   *  present; throws at call time if neither is available (see the module
   *  header on Node's global WebSocket). */
  WebSocketCtor?: WebSocketCtor;
  /** Called whenever `nextAction` says a refetch is due. Synchronous;
   *  do the actual `fetchRoomLog` call and whatever follows from it
   *  outside this callback if it needs to be async-tracked — errors thrown
   *  here are swallowed so one bad refetch can't wedge the driver. */
  onRefetch: () => void;
}

function wsUrlFromEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed.endsWith('/ws') ? trimmed : `${trimmed}/ws`;
  }
  if (trimmed.startsWith('https://')) {
    return `wss://${trimmed.slice('https://'.length)}/ws`;
  }
  if (trimmed.startsWith('http://')) {
    return `ws://${trimmed.slice('http://'.length)}/ws`;
  }
  return `ws://${trimmed}/ws`;
}

/**
 * The thin driver: owns the socket and the timers, holds the last
 * `LiveMachine`, and does nothing interesting on its own — every decision
 * comes from `nextAction`. See the module header for what this is
 * deliberately NOT unit-tested for (needs a real or injected socket; the
 * smoke script in Task 6 exercises it against a real node).
 */
export function startLive(opts: StartLiveOpts): { stop(): void } {
  // FIRST, before a socket is opened or a timer is armed. This module is the
  // ONLY one a hex space id breaks, and it was for a long time the only one
  // without the check — the guard lived on the write path (shoalSend), which a
  // watch-before-you-write client never reaches. The failure is otherwise
  // completely silent AND invisible to every unit test in this package: the
  // socket connects, `nextAction` keeps the silence clock, disconnects demote
  // and back off correctly, and not one refetch ever fires from an event,
  // because `nextAction` compares `event.space_id` (always bech32m) to this
  // string with `===`. Throwing here costs one comparison and turns an
  // invisible degradation into a stack trace on the first call.
  assertWireSpaceId(opts.spaceId, 'startLive: opts.spaceId');

  const now = opts.now ?? Date.now;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const globalWs = (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  const maybeCtor = opts.WebSocketCtor ?? globalWs;
  if (!maybeCtor) {
    throw new Error('startLive: no WebSocket implementation available; pass opts.WebSocketCtor');
  }
  // Rebound to a `const` TypeScript can prove is never undefined inside the
  // closures below (openSocket is defined later in this function and
  // captures this binding) — the `if (!maybeCtor) throw` above narrows
  // `maybeCtor` for the rest of THIS scope, but that narrowing does not
  // survive into a nested function declared afterward.
  const Ctor: WebSocketCtor = maybeCtor;

  const wsUrl = wsUrlFromEndpoint(opts.auth.endpoint);

  let machine = createLiveMachine(opts.spaceId, pollIntervalMs, now());
  let ws: MinimalWebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connectTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  function clearAllTimers(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (connectTimeoutTimer !== null) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
  }

  function closeSocket(): void {
    if (connectTimeoutTimer !== null) {
      clearTimeout(connectTimeoutTimer);
      connectTimeoutTimer = null;
    }
    if (ws !== null) {
      const sock = ws;
      ws = null;
      sock.onopen = null;
      sock.onmessage = null;
      sock.onclose = null;
      sock.onerror = null;
      try {
        sock.close();
      } catch {
        // already dead
      }
    }
  }

  function apply(event: LiveEvent): void {
    if (machine.state === 'stopped') return; // driver-side belt matching nextAction's own suspenders
    const prevPhase = machine.state;
    const decision = nextAction(machine, event, now());
    machine = decision;

    if (decision.refetch) {
      try {
        opts.onRefetch();
      } catch {
        // one bad refetch must not break the loop
      }
    }

    if (decision.state !== prevPhase && decision.state === 'connecting') {
      openSocket();
    }

    if (decision.state === 'polling' && reconnectTimer === null) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        apply({ type: 'reconnect' });
      }, decision.delayMs);
    }

    if (decision.state === 'stopped') {
      clearAllTimers();
      closeSocket();
    }
  }

  function openSocket(): void {
    closeSocket();
    let sock: MinimalWebSocket;
    try {
      sock = new Ctor(wsUrl);
    } catch {
      // Construction itself threw synchronously — treat like an async
      // connect failure rather than letting startLive throw.
      apply({ type: 'disconnected' });
      return;
    }
    ws = sock;

    // Defends against a socket that never calls back at all (hangs forever
    // in whatever the platform calls "connecting") — see the module header
    // on why the socket is treated as unproven. Reuses pollIntervalMs as
    // the connect timeout; on fire this is indistinguishable from a real
    // close as far as nextAction is concerned.
    connectTimeoutTimer = setTimeout(() => {
      connectTimeoutTimer = null;
      if (ws === sock) {
        try {
          sock.close();
        } catch {
          // already dead
        }
        ws = null;
        apply({ type: 'disconnected' });
      }
    }, pollIntervalMs);

    sock.onopen = () => {
      if (ws !== sock) return;
      if (connectTimeoutTimer !== null) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
      try {
        sock.send(JSON.stringify({ jsonrpc: '2.0', method: 'subscribe', params: { events: ['content_new'] }, id: 1 }));
      } catch {
        // socket died between open and send; onclose handles the fallout
      }
      apply({ type: 'open' });
    };

    sock.onmessage = (ev: { data: unknown }) => {
      if (ws !== sock) return;
      handleMessage(ev.data);
    };

    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      if (connectTimeoutTimer !== null) {
        clearTimeout(connectTimeoutTimer);
        connectTimeoutTimer = null;
      }
      apply({ type: 'disconnected' });
    };

    // Deliberately a no-op — see the module header ("onerror is a
    // deliberate no-op"): onclose always follows onerror on a real failure,
    // and acting on both would double-count one failure against the
    // backoff counter.
    sock.onerror = () => {};
  }

  function handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const msg = parsed as { method?: unknown; params?: unknown };
    if (msg.method !== 'event') return; // welcome / subscribe ack / pong — nothing to act on
    const params = msg.params as { type?: unknown; data?: unknown } | undefined;
    if (!params || params.type !== 'content_new') return;
    const data = params.data as { space_id?: unknown } | undefined;
    const spaceId = data && typeof data.space_id === 'string' ? data.space_id : '';
    apply({ type: 'content', spaceId });
  }

  // The heartbeat runs unconditionally for the machine's whole life — its
  // effect depends on `machine.state` at the moment it fires (see
  // nextAction), so the driver never has to reason about when it should or
  // shouldn't be running.
  heartbeatTimer = setInterval(() => apply({ type: 'tick' }), pollIntervalMs);
  openSocket();

  return {
    stop(): void {
      apply({ type: 'stop' });
    },
  };
}
