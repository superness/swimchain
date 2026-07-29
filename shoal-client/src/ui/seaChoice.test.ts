/**
 * Which sea a build shows, and the gate that keeps the dev one out of it —
 * plan 4b, Task 2. Run: npx tsx src/ui/seaChoice.test.ts
 *
 * FIVE GROUPS, AND THEY PROVE DIFFERENT KINDS OF THING. Saying so up front
 * because the difference is the whole reason there are five:
 *
 *  1. **The rule**, driven at both values of `import.meta.env.DEV`. This is
 *     behaviour: what a release build DOES when it is handed each combination
 *     of the two configuration paths. It is not the security property.
 *  1a. **Which water the player's own body is in**, and — the half that is a
 *     lockout if it is ever got wrong — where their writes go while they are
 *     at the edge. Unit-level: `chooseWater` at all four combinations, and
 *     `knockOn` against a chain sea that records what it was handed. The same
 *     invariant is asserted end to end, on the wire, in `App.test.ts` §6.
 *  2. **A shell configuration really becomes a sea that writes as the node.**
 *     End to end and with nothing mocked inside the unit: the real
 *     `shellConfig` assembles against a fake node, the real `seaFrom` builds a
 *     real `chainSea` from it, and a real `publish` mines real PoW, encodes a
 *     real body, and reaches `submit_reply` — signed by `sign_message`, on the
 *     node, because the browser has no key. Only `fetch`, `WebSocket` and the
 *     shell's `invoke` are faked, and all three are the outside world.
 *  3. **The static gate, structurally.** `App.tsx` cannot be imported here at
 *     all — it is JSX, it touches the DOM, and `import.meta.env` does not exist
 *     under `tsx` — so the gate is checked as source text. That is a weaker
 *     kind of evidence than groups 1 and 2 and it is stated as such: it holds
 *     the ARRANGEMENT that makes rollup drop `browserIdentity.ts` (the gate
 *     dominating the only `identityFromLabel` reference), and the arrangement's
 *     EFFECT is proved by building and grepping `dist/assets/*.js`, which is a
 *     report obligation and not something a unit test can do.
 *     The detector is run against a deliberately gate-less string first, so a
 *     regex that had stopped matching anything cannot pass this group by
 *     failing to look.
 *  4. **The water's name has exactly one source.** Same kind of evidence as 3,
 *     same reason, and it is the enforcement `shellConfig.ts:129` claimed and
 *     did not have.
 *
 * Expected values are stated before the code runs, and group 1's table is
 * hand-enumerated — all eight combinations, written out rather than generated
 * from the rule it is checking.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  chooseSeaSource, chooseWater, knockOn, retryDelayMs, seaFrom,
  RETRY_BASE_MS, RETRY_CAP_MS, SEA_SPAWN, type PlayedWater, type SeaSource,
} from './seaChoice';
import type { ChainSea } from './chainSea';
import type { Vec } from '../lib/shoalTypes';
import { shellConfig, waterSpaceId, WATER_APP, WATER_NAME, type InvokeFn } from './shellConfig';
import { wildSeedFrom } from './demoSea';
import { decodeBody } from '../lib/shoalWire';
import { WORLD_H, WORLD_W } from '../lib/shoalConst';
import type { SendFailure } from '../lib/shoalSend';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

function readSource(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

/**
 * The same source with its comments removed.
 *
 * NOT fussiness. These files argue about the very literals being searched for
 * — `App.tsx` explains at length why `browserIdentity` is gated, and
 * `mint-water.ts` names `@shoal:mian` as the typo it exists to prevent — so a
 * check run over the raw text answers to prose rather than to code, and would
 * have to be either weakened or written around a comment nobody may now edit.
 * Task 1's review found exactly this shape of false positive in the `dist/`
 * grep recipe (`sourcesContent` embeds comments verbatim); the answer there
 * was to search the shipped code only, and the answer here is the same one.
 *
 * WHOLE-LINE `//` COMMENTS GO FIRST, AND THE ORDER IS NOT ARBITRARY — doing it
 * the other way round was wrong and this test caught it on itself. `App.tsx`'s
 * gate comment names the corrected grep recipe — a glob over the shipped
 * bundles — on a `//` line, and a glob contains a star after a slash. Stripping
 * block comments first read that as an opening delimiter and swallowed
 * everything up to the next close, taking `devChainSea` and its whole body with
 * it; every check in section 3 then failed for a reason that had nothing to do
 * with the gate. Line comments first, then blocks.
 *
 * Only WHOLE-LINE `//` comments are stripped, so a `'http://…'` inside a string
 * survives intact.
 */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

// ===========================================================================
// 1. The rule: which sea, in every combination
// ===========================================================================

/**
 * All eight combinations, with the answer written out by hand.
 *
 * The two that carry the weight are marked. `dev=false, params=true,
 * shell=false` is the one the static gate exists for — a release build with
 * query parameters in it, which `devtools` in release makes reachable — and the
 * answer must be the offline sea, not an attempt to honour them. `dev=false,
 * params=true, shell=true` is the same situation on a machine where the shell
 * did answer: the parameters still lose.
 */
const RULE: { dev: boolean; params: boolean; shell: boolean; want: SeaSource; note?: string }[] = [
  { dev: false, params: false, shell: false, want: 'offline' },
  { dev: false, params: false, shell: true, want: 'shell', note: 'the shipped case' },
  { dev: false, params: true, shell: false, want: 'offline', note: 'THE GATE: release + ?rpc= is still the offline sea' },
  { dev: false, params: true, shell: true, want: 'shell', note: 'THE GATE: parameters lose to the shell in release' },
  { dev: true, params: false, shell: false, want: 'offline' },
  { dev: true, params: false, shell: true, want: 'shell', note: 'tauri dev with no parameters' },
  { dev: true, params: true, shell: false, want: 'dev', note: 'npm run dev + two-client-smoke URL' },
  { dev: true, params: true, shell: true, want: 'dev', note: 'tauri dev + a URL a developer typed' },
];

function theRule(): void {
  console.log('\n1. which sea, in every combination of the two paths');

  for (const c of RULE) {
    const got = chooseSeaSource(c.dev, c.params, c.shell);
    check(
      `dev=${c.dev} params=${c.params} shell=${c.shell} -> ${c.want}${c.note ? `  (${c.note})` : ''}`,
      got === c.want,
      got,
    );
  }

  // NON-DEGENERACY. A rule that ignored `dev` entirely would pass three of the
  // four `dev=false` rows above by coincidence — every row where the answer
  // happens to be the same at both values. These two are the rows where it is
  // not, stated as a difference rather than as two absolute answers.
  check('NON-DEGENERACY: the SAME parameters give different seas either side of the gate',
    chooseSeaSource(true, true, false) !== chooseSeaSource(false, true, false),
    [chooseSeaSource(true, true, false), chooseSeaSource(false, true, false)]);
  check('NON-DEGENERACY: ...and with a shell present too',
    chooseSeaSource(true, true, true) !== chooseSeaSource(false, true, true),
    [chooseSeaSource(true, true, true), chooseSeaSource(false, true, true)]);

  // The spawn both paths share. Hand-derived: WORLD_W/2 and WORLD_H/2, rounded.
  check('both paths spawn at the middle of the water',
    SEA_SPAWN.x === Math.round(WORLD_W / 2) && SEA_SPAWN.y === Math.round(WORLD_H / 2), SEA_SPAWN);
}

// ===========================================================================
// 1a. Which water the player's body is in, and where their writes go
// ===========================================================================

/**
 * Four combinations, hand-written. The row that carries the weight is
 * `chain=true, edge=true`: a window that has reached real water and been
 * refused, which must put the player in a sea they can play — and, per
 * `knockOn` below, must go on writing into the one that refused them.
 *
 * `chain=false, edge=true` cannot occur (the standing is raised by a refused
 * chain write) and is enumerated anyway: a total rule is one nobody has to
 * check the caller's `null` handling against.
 */
const WATERS: { chain: boolean; edge: boolean; want: PlayedWater; note?: string }[] = [
  { chain: false, edge: false, want: 'scene', note: 'no configuration yet — the offline scene' },
  { chain: false, edge: true, want: 'scene', note: 'unreachable, and still answered' },
  { chain: true, edge: false, want: 'chain', note: 'the shipped case: real water' },
  { chain: true, edge: true, want: 'shallows', note: 'THE NEWCOMER: refused, and swimming anyway' },
];

/** A chain sea that records what was published into it and does nothing else. */
function recordingChain(): { chain: ChainSea; wrote: { vec: Vec; say?: string }[] } {
  const wrote: { vec: Vec; say?: string }[] = [];
  const chain = {
    publish: (vec: Vec, say?: string) => { wrote.push({ vec, say }); },
  } as unknown as ChainSea;
  return { chain, wrote };
}

function whichWater(): void {
  console.log('\n1a. which water the player is in, and where their writes go');

  for (const c of WATERS) {
    const got = chooseWater(c.chain, c.edge);
    check(`chain=${c.chain} edge=${c.edge} -> ${c.want}${c.note ? `  (${c.note})` : ''}`,
      got === c.want, got);
  }
  // NON-DEGENERACY: a rule that ignored the standing would pass three rows.
  check('NON-DEGENERACY: the standing is what separates the last two',
    chooseWater(true, true) !== chooseWater(true, false),
    [chooseWater(true, true), chooseWater(true, false)]);

  // THE KNOCK. The vector is the player's own, unchanged but for its
  // timestamp, and the timestamp is the caller's wall clock — see `knockOn`
  // on why a write dated on the shallows' fixed epoch would be refused for a
  // reason that is not the one the standing is built on.
  const vec: Vec = { x: 2624, y: 1360, heading: 33, speed: 60, t: 144_085_500 };
  const WALL = 1_785_000_000_000;
  {
    const { chain, wrote } = recordingChain();
    knockOn(chain, 'shallows', vec, WALL, 'hello');
    check('a refused swimmer\'s vector is published into the water that refused it',
      wrote.length === 1, wrote.length);
    check('...unchanged, but for a timestamp on the caller\'s own clock',
      wrote[0]?.vec.x === vec.x && wrote[0]?.vec.y === vec.y
      && wrote[0]?.vec.heading === vec.heading && wrote[0]?.vec.speed === vec.speed
      && wrote[0]?.vec.t === WALL, wrote[0]?.vec);
    check('...carrying whatever they said', wrote[0]?.say === 'hello', wrote[0]?.say);
    check('...and the vector it was handed is not mutated on the way through',
      vec.t === 144_085_500, vec.t);
  }
  {
    // NO DOUBLE WRITE. In real water the played sea IS this chain sea and has
    // already been handed the vector by `emitDue`; a knock as well would put
    // every move on the wire twice, at twice the rate the emit floor allows.
    const { chain, wrote } = recordingChain();
    knockOn(chain, 'chain', vec, WALL);
    knockOn(chain, 'scene', vec, WALL);
    check('nothing is knocked when the played sea is the chain sea itself, or a scene',
      wrote.length === 0, wrote);
  }
  {
    // And a window with no chain sea at all cannot be made to write by any
    // value of the other arguments.
    let threw = false;
    try { knockOn(null, 'shallows', vec, WALL); } catch { threw = true; }
    check('a window with no water to knock on does not try, and does not throw', !threw);
  }
}

// ===========================================================================
// 1b. Looking again, when the answer was "not yet"
// ===========================================================================

/**
 * The schedule, hand-arithmetic'd from `RETRY_BASE_MS = 2_000` and
 * `RETRY_CAP_MS = 60_000` and written out before the code is run:
 *
 *   attempt 0 -> 2_000 * 2^0 =  2_000
 *           1 -> 2_000 * 2^1 =  4_000
 *           2 -> 2_000 * 2^2 =  8_000
 *           3 -> 2_000 * 2^3 = 16_000
 *           4 -> 2_000 * 2^4 = 32_000
 *           5 -> 2_000 * 2^5 = 64_000 -> CAPPED at 60_000
 *           6 -> 128_000               -> 60_000
 *
 * So the first minute holds five attempts (t = 0, 2, 6, 14, 30 s) and every
 * minute after that holds one. The numbers are stated here rather than computed
 * from the constants, so a change to either constant fails this by name.
 */
const SCHEDULE: [number, number][] = [
  [0, 2_000], [1, 4_000], [2, 8_000], [3, 16_000], [4, 32_000],
  [5, 60_000], [6, 60_000], [30, 60_000],
];

function lookingAgain(): void {
  console.log('\n1b. the backoff for "not yet"');

  for (const [attempt, want] of SCHEDULE) {
    check(`attempt ${attempt} waits ${want} ms`, retryDelayMs(attempt) === want, retryDelayMs(attempt));
  }

  // It never gives up: there is no attempt at which "the node still has not
  // synced this space" becomes false, so any ceiling would strand exactly the
  // players with the slowest connections. A finite schedule would show up here
  // as a non-positive or non-finite delay.
  check('there is no attempt at which it stops looking',
    [50, 500, 5_000, 1e9].every((n) => Number.isFinite(retryDelayMs(n)) && retryDelayMs(n) === RETRY_CAP_MS),
    [50, 500, 5_000, 1e9].map(retryDelayMs));

  // NON-DEGENERACY: a schedule that returned the cap immediately would pass
  // every row from attempt 5 on, and would make a first launch wait a full
  // minute for its second look at a node that was one second from being ready.
  check('NON-DEGENERACY: the early attempts are not already the cap',
    retryDelayMs(0) === RETRY_BASE_MS && retryDelayMs(0) < RETRY_CAP_MS
    && retryDelayMs(0) < retryDelayMs(1) && retryDelayMs(1) < retryDelayMs(2),
    [retryDelayMs(0), retryDelayMs(1), retryDelayMs(2)]);

  // ...and one that grew without bound would have a window left open for a week
  // waiting years for its next look.
  check('NON-DEGENERACY: it is bounded above, so a long session keeps looking often enough',
    SCHEDULE.every(([a]) => retryDelayMs(a) <= RETRY_CAP_MS));
}

// ===========================================================================
// 2. A shell configuration really becomes a sea that writes as the node
// ===========================================================================

const ENDPOINT = 'http://127.0.0.1:29736';
const COOKIE_HEADER = 'Basic X19jb29raWVfXzpkZWFkYmVlZg==';
/** 64 lowercase hex, the shape `repliesToLog` and `mineAndSignAction` demand. */
const NODE_PUBKEY = 'b3'.repeat(32);
const NODE_ADDRESS = 'sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqexample';
/**
 * The water's space id, DERIVED the way the shipped client derives it.
 *
 * It used to be an invented `sp1qqq…` that the fake `list_spaces` handed back.
 * The client no longer reads a listing at all — the id is a pure function of
 * `WATER_APP`/`WATER_NAME` (`shellConfig.waterSpaceId`, and see its comment for
 * the live run that forced the change) — so a hand-written constant here would
 * simply not be the space the sea resolves, and the `content_new` filter below
 * compares it by exact string.
 */
const SHOAL_SPACE = await waterSpaceId();

/** 64 bytes the fake node's `sign_message` hands back, distinctive enough that
 *  a signature built anywhere else could not coincide with it. */
const SIG_HEX = Array.from({ length: 64 }, (_, i) => (i * 3 + 7) & 0xff)
  .map((b) => b.toString(16).padStart(2, '0')).join('');

interface Seen { method: string; params: Record<string, unknown>; authorization: string | undefined }

/**
 * A node that answers everything this path needs: identity, its space listing,
 * the room post, `get_info` (regtest, so the real miner's real work is the
 * node's own flat 4 bits), an empty room, and `submit_reply`.
 *
 * `WebSocket` is replaced by one that opens and then says nothing, so
 * `startLive` settles and no gossip event fires — every call recorded below is
 * one the code under test decided to make.
 */
interface Socketish { onmessage: ((e: { data: string }) => void) | null }

function installNode(): { seen: Seen[]; socket: () => Socketish | null; restore: () => void } {
  const g = globalThis as unknown as Record<string, unknown>;
  const realFetch = g.fetch;
  const realWs = g.WebSocket;
  const seen: Seen[] = [];
  let live: Socketish | null = null;

  g.fetch = (async (_input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    const req = JSON.parse(init?.body ?? '{}') as { method: string; params: Record<string, unknown>; id: number };
    seen.push({ method: req.method, params: req.params, authorization: init?.headers?.Authorization });

    const ok = (result: unknown) => ({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ({ jsonrpc: '2.0', result, id: req.id }),
      text: async () => '',
    });

    switch (req.method) {
      case 'get_identity_info':
        return ok({ has_identity: true, public_key: NODE_PUBKEY, address: NODE_ADDRESS });
      case 'list_spaces':
        return ok({ spaces: [{ space_id: SHOAL_SPACE, name: WATER_NAME, app: WATER_APP }], total: 1 });
      case 'get_content':
        return ok({ content_id: req.params.content_id });
      case 'sign_message':
        return ok({ signature: SIG_HEX, public_key: NODE_PUBKEY });
      case 'get_info':
        return ok({ network: 'regtest', min_pow_difficulty: 4 });
      case 'get_replies':
        return ok({ parent_id: req.params.content_id, replies: [], total_count: 0 });
      case 'submit_reply':
        return ok({ content_id: `sha256:${'cd'.repeat(32)}` });
      default:
        return ok({});
    }
  }) as unknown as typeof fetch;

  class QuietSocket {
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() { live = this; setTimeout(() => this.onopen?.(), 0); }
    send(): void { /* the node never answers unbidden */ }
    close(): void { this.onclose?.(); }
  }
  g.WebSocket = QuietSocket;

  return {
    seen,
    socket: () => live,
    restore: () => {
      if (realFetch === undefined) delete g.fetch; else g.fetch = realFetch;
      if (realWs === undefined) delete g.WebSocket; else g.WebSocket = realWs;
    },
  };
}

const fakeShell: InvokeFn = (async (cmd: string) => {
  if (cmd !== 'get_rpc_config') throw new Error(`unexpected command ${cmd}`);
  return { endpoint: ENDPOINT, auth: COOKIE_HEADER };
}) as InvokeFn;

async function aShellConfigurationBecomesASea(): Promise<void> {
  console.log('\n2. a shell configuration becomes a sea that writes as the node');

  const node = installNode();
  try {
    const cfg = await shellConfig(fakeShell);
    if (cfg === null) {
      check('the shell path assembles a configuration at all', false, 'got null');
      return;
    }
    check('the shell path assembles a configuration at all', true);

    const outcomes: (SendFailure | null)[] = [];
    const sea = seaFrom(cfg, (f) => { outcomes.push(f); });
    try {
      check('the camera follows the node\'s own swimmer', sea.selfId === NODE_PUBKEY, sea.selfId);
      // Hand-derived independently of `seaFrom`: the sea is a property of the
      // PLACE, so this must be the seed EVERY client in this room computes.
      check('the wild shoal is the room\'s, not the caller\'s',
        sea.wildSeed === wildSeedFrom(SHOAL_SPACE, cfg.roomContentId), sea.wildSeed);
      check('and it spawns where the dev path spawns',
        sea.spawn.x === SEA_SPAWN.x && sea.spawn.y === SEA_SPAWN.y, sea.spawn);

      // THE WRITE. Real `shoalEmit` body, real Argon2id at the node's own
      // regtest difficulty, real `submit_reply`.
      const t = Date.now();
      sea.publish({ x: 4_000, y: 3_000, heading: 12, speed: 0, t });
      await waitFor(() => node.seen.some((c) => c.method === 'submit_reply'), 30_000);

      const submit = node.seen.find((c) => c.method === 'submit_reply');
      check('a published vector reaches the node as a reply', submit !== undefined);
      check('...into the room the shell resolved, not one it was told',
        submit?.params.parent_id === cfg.roomContentId, submit?.params.parent_id);
      check('...authored by the node', submit?.params.author_id === NODE_PUBKEY, submit?.params.author_id);

      // NOT "a reply was sent" — the BODY is decoded back with the real wire
      // grammar and must be the vector that went in. A write that reached the
      // node carrying nothing is exactly as useless as no write.
      const decoded = decodeBody(String(submit?.params.body ?? ''), NODE_PUBKEY, 'sha256:' + 'cd'.repeat(32));
      check('...and the body decodes back to the vector that was published',
        decoded !== null && decoded.kind === 'presence' && decoded.vec.x === 4_000
        && decoded.vec.y === 3_000 && decoded.vec.t === t, decoded);

      // THE POINT OF THE WHOLE PATH: no key in the browser. The signature on
      // that reply can only have come from `sign_message`.
      const signCalls = node.seen.filter((c) => c.method === 'sign_message');
      check('the signature came from the node — sign_message was called for the write',
        signCalls.length >= 1, node.seen.map((c) => c.method));
      check('...carrying the shell\'s cookie, which is what sign_message requires',
        signCalls.every((c) => c.authorization === COOKIE_HEADER),
        signCalls.map((c) => c.authorization));
      check('...and the signature on the wire is the node\'s bytes, not any the browser made',
        String(submit?.params.signature ?? '') === SIG_HEX, submit?.params.signature);

      check('an accepted write is reported to the way-in channel as accepted',
        outcomes.length >= 1 && outcomes[0] === null, outcomes);

      // WHERE THE SPACE ID WENT. `submit_reply` never carries one — a move is
      // a reply and the parent decides the space — so the only two places the
      // shell's `spaceId` can be observed are the wild seed above and the live
      // channel's own filter, which is what makes another player's move show
      // up in seconds instead of on the next poll. Driven by hand through the
      // socket, both ways round: a `content_new` for this water refetches, and
      // one for a different space does not.
      const sock = node.socket();
      const event = (spaceId: string) => sock?.onmessage?.({
        data: JSON.stringify({
          jsonrpc: '2.0',
          method: 'event',
          params: { type: 'content_new', data: { space_id: spaceId, content_id: 'sha256:' + '11'.repeat(32) } },
        }),
      });
      const repliesBefore = node.seen.filter((c) => c.method === 'get_replies').length;
      event('sp1' + 'z'.repeat(34));
      await new Promise<void>((r) => { setTimeout(r, 60); });
      const afterWrongSpace = node.seen.filter((c) => c.method === 'get_replies').length;
      check('NEGATIVE CONTROL: a move in some other space does not wake this sea',
        afterWrongSpace === repliesBefore, { repliesBefore, afterWrongSpace });

      event(SHOAL_SPACE);
      const woke = await waitFor(
        () => node.seen.filter((c) => c.method === 'get_replies').length > afterWrongSpace, 5_000,
      );
      check('a move in the water the shell resolved does wake it', woke,
        node.seen.filter((c) => c.method === 'get_replies').length);
    } finally {
      sea.stop();
    }
  } finally {
    node.restore();
  }
}

/** Poll until `pred` holds. `Date.now()` is display-side code's to use. */
async function waitFor(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise<void>((r) => { setTimeout(r, 20); });
  }
  return pred();
}

// ===========================================================================
// 3. The static gate, structurally
// ===========================================================================

/**
 * The arrangement, stated exactly: `identityFromLabel` — the only reference
 * anywhere to `browserIdentity.ts`, and therefore the only thing keeping its
 * no-KDF key derivation in the bundle — is reached from ONE place, that place
 * is inside `devChainSea`, and `devChainSea`'s first statement returns out of
 * the function when `import.meta.env.DEV` is false.
 *
 * All three parts matter. One call site, so there is nothing else to check.
 * Inside `devChainSea`, because the gate can only dominate what is in its own
 * function. First statement, because a gate the function keeps going past is
 * not a gate at all — which is the exact shape the change this test guards
 * would have taken if `buildChainSea` had kept the gate and grown a branch.
 */
const GATE = 'if (!import.meta.env.DEV) return null;';

interface GateReading {
  callSites: number;
  browserIdentityMentions: number;
  insideDevChainSea: boolean;
  gateBeforeCall: boolean;
  noOtherFunctionBetween: boolean;
}

/** Read the arrangement out of a source text. Separate from the checks so the
 *  same reader can be run over a KNOWN-BAD text first (below). */
function readGate(src: string): GateReading {
  const calls = [...src.matchAll(/identityFromLabel\(/g)];
  const declIdx = src.indexOf('function devChainSea');
  const callIdx = calls.length === 1 ? (calls[0].index ?? -1) : -1;
  const between = declIdx >= 0 && callIdx > declIdx ? src.slice(declIdx, callIdx) : '';
  return {
    callSites: calls.length,
    browserIdentityMentions: (src.match(/browserIdentity/g) ?? []).length,
    insideDevChainSea: declIdx >= 0 && callIdx > declIdx,
    gateBeforeCall: between.includes(GATE),
    // `function devChainSea` itself is at index 0 of `between`, so any OTHER
    // `function <name>` in there means the call is in a different function that
    // merely appears after this one.
    noOtherFunctionBetween: between !== ''
      && !/\bfunction\s+\w+\s*\(/.test(between.slice('function devChainSea'.length)),
  };
}

function theStaticGate(): void {
  console.log('\n3. the static gate still dominates the only browserIdentity reference');

  // POSITIVE CONTROL FIRST. A reader that had stopped matching would report a
  // perfect arrangement for a file that has none, and every check below would
  // pass while the gate was gone. So it is run over a text with the gate
  // deleted and must say so.
  const gutted = [
    "import { identityFromLabel } from './browserIdentity';",
    'function devChainSea(onWrite) {',
    '  const p = chainParams();',
    '  return seaFrom({ signer: identityFromLabel(p.who) }, onWrite);',
    '}',
  ].join('\n');
  const control = readGate(gutted);
  check('CONTROL: the reader reports a missing gate as missing', !control.gateBeforeCall, control);
  check('CONTROL: ...while still finding the call site it is judging',
    control.callSites === 1 && control.insideDevChainSea, control);

  const src = codeOnly(readSource('./App.tsx'));
  const g = readGate(src);
  check('identityFromLabel is called from exactly one place in App.tsx', g.callSites === 1, g.callSites);
  check('browserIdentity is reached by exactly one line of code — the import that call needs',
    g.browserIdentityMentions === 1, g.browserIdentityMentions);
  check('that call site is inside devChainSea', g.insideDevChainSea, g);
  check('...with no other function opening between the two', g.noOtherFunctionBetween, g);
  check(`...and devChainSea returns out on "${GATE}" before reaching it`, g.gateBeforeCall, g);

  // The second gate, on the reader of the parameters themselves. It is not what
  // drops the module — that is the one above — but it is what makes
  // `chainParams()` answer "no parameters" in a release build however many are
  // in the URL, which is what `chooseSeaSource` is then handed.
  const paramsIdx = src.indexOf('function chainParams');
  const paramsBody = paramsIdx < 0 ? '' : src.slice(paramsIdx, src.indexOf('\n}', paramsIdx));
  check('chainParams is gated too, so a release build reads no parameters at all',
    paramsBody.includes(GATE), paramsIdx);

  // And the shell path must NOT be behind it, or Task 2 would have shipped a
  // release build that still cannot reach water.
  const shellIdx = src.indexOf('shellConfig()');
  const shellStmt = shellIdx < 0 ? '' : src.slice(Math.max(0, shellIdx - 600), shellIdx);
  check('the SHELL path is not behind the gate', shellIdx >= 0 && !shellStmt.includes(GATE), shellIdx);
}

// ===========================================================================
// 4. The water's name has exactly one source
// ===========================================================================

/**
 * `shellConfig.ts` says `WATER_SPACE_NAME` exists "so whatever mints the water
 * and whatever joins it cannot drift". Until Task 2 nothing minted it and
 * nothing imported it, so the claim was about a file that did not exist.
 *
 * These checks are what make it true: the minter imports the constant, and it
 * holds no name of its own to typo. A mistyped name is the worst failure on
 * this path because it has no symptom — the space exists, is healthy, accepts
 * writes, and is invisible to every shipped build forever.
 */
function theWaterHasOneName(): void {
  console.log('\n4. the water the game joins is named in exactly one place');

  const mint = codeOnly(readSource('../../scripts/mint-water.ts'));
  check('the minter imports the name from shellConfig',
    /import\s*\{[^}]*WATER_SPACE_NAME[^}]*\}\s*from\s*'[^']*shellConfig'/s.test(mint));
  check('...and the room text as well',
    /import\s*\{[^}]*ROOM_TITLE[^}]*\}\s*from\s*'[^']*shellConfig'/s.test(mint)
    && /import\s*\{[^}]*ROOM_BODY[^}]*\}\s*from\s*'[^']*shellConfig'/s.test(mint));
  check('the minter contains no space name of its own to mistype',
    !mint.includes('@shoal:'), mint.match(/.{0,40}@shoal:.{0,20}/g));

  // The other direction, and the reason it is not simply "everything imports
  // the constant": a smoke run must NOT write into the water people play in.
  const smoke = codeOnly(readSource('../../scripts/regtest-smoke.ts'));
  check('the smoke script deliberately does NOT mint this water',
    !smoke.includes('@shoal:main') && smoke.includes('@shoal:smoke'));
  // And the room text has to differ too — `submit_post` hashes title+body with
  // no space in the preimage (src/rpc/methods.rs:2086-2089), so identical text
  // is not a similar room, it is literally the same one.
  check('...and its room text differs, so it is not the real water\'s room by another name',
    !smoke.includes('the room every swimmer replies into'),
    smoke.match(/.{0,30}the room every swimmer replies into.{0,10}/g));
}

async function main(): Promise<void> {
  theRule();
  whichWater();
  lookingAgain();
  await aShellConfigurationBecomesASea();
  theStaticGate();
  theWaterHasOneName();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
