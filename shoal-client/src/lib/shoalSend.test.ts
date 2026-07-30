/**
 * `classifySendFailure` — plan 2026-07-28-the-shoal-shallows, Task 3. Run:
 * npx tsx src/lib/shoalSend.test.ts
 *
 * Exercises the REAL path a write takes: a fake `fetch` (same harness as
 * shoalRpc.test.ts) answers `rpcCall` directly, the rejection it produces is
 * caught, and `classifySendFailure` is run on the caught value — not on a
 * hand-built `JsonRpcCallError`/`NodeUnreachableError` instance, so this also
 * proves `rpcCall` actually throws the shapes `classifySendFailure` expects,
 * not just that the classifier logic is internally consistent.
 *
 * The case that matters most: a JSON-RPC error with a code OTHER than -32015
 * (`IdentityNotSponsored`, src/rpc/error.rs:31) must classify as 'unknown',
 * never 'not-sponsored' — a wrong classification there would fire a "claim a
 * sponsor" flow on an unrelated rejection (wrong PoW, bad signature, whatever).
 */
import { rpcCall, type RpcAuth } from './shoalRpc';
import { classifySendFailure, submitToRoom, type PowProfile, type SendCtx } from './shoalSend';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// --- Fake fetch harness (identical shape to shoalRpc.test.ts's) --------------------
function fakeFetch(responder: () => Response): typeof fetch {
  return (async () => responder()) as typeof fetch;
}

function fakeFetchThatThrows(cause: unknown): typeof fetch {
  return (async () => { throw cause; }) as typeof fetch;
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, statusText: 'OK' });
}

async function withFakeFetch<T>(fetchFn: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function caughtError(fetchFn: typeof fetch, auth: RpcAuth): Promise<unknown> {
  return withFakeFetch(fetchFn, async () => {
    try {
      await rpcCall(auth, 'submit_reply', {});
      return null;
    } catch (e) {
      return e;
    }
  });
}

/** The node's own regtest profile (4 bits, 1 MiB), passed explicitly so a write
 *  needs no `get_info` round trip and mines in a handful of attempts. */
const REGTEST: PowProfile = {
  network: 'regtest',
  config: { memoryKib: 1024, iterations: 1, parallelism: 1 },
};

/** A write context whose only fake part is the signer — the space id is in the
 *  bech32m wire form `assertWireSpaceId` demands, and everything downstream of
 *  it (hashing, mining, the request body) is the real thing. */
function writeCtx(auth: RpcAuth): SendCtx {
  return {
    auth,
    spaceId: `sp1${'q'.repeat(34)}`,
    roomContentId: `sha256:${'12'.repeat(32)}`,
    authorIdHex: 'cd'.repeat(32),
    sign: async () => new Uint8Array(64),
    powProfile: REGTEST,
  };
}

type WriteOutcome = { threw: true; e: unknown } | { threw: false; contentId: string };

/** Run one real write against a fake node and report what the CALLER sees —
 *  a resolution (which every caller reads as "the node took it") or a throw. */
async function caughtWrite(fetchFn: typeof fetch, auth: RpcAuth): Promise<WriteOutcome> {
  return withFakeFetch(fetchFn, async (): Promise<WriteOutcome> => {
    try {
      return { threw: false, contentId: await submitToRoom(writeCtx(auth), 'a body', 1_700_000_000_000) };
    } catch (e) {
      return { threw: true, e };
    }
  });
}

async function main() {
  const auth: RpcAuth = { endpoint: 'http://node-a.example/rpc', authHeader: null };

  // --- The node refuses because this identity has no sponsor: -32015 --------------
  {
    const err = await caughtError(
      fakeFetch(() => okResponse({
        jsonrpc: '2.0',
        error: { code: -32015, message: 'Identity is not sponsored. You must be sponsored by an existing member to post.' },
        id: 1,
      })),
      auth,
    );
    const result = classifySendFailure(err);
    check('IdentityNotSponsored (-32015) classifies as not-sponsored', result.kind === 'not-sponsored', result);
    check('the classified failure carries the original error as cause', result.cause === err, { cause: result.cause, err });
  }

  // --- THE CASE THAT MATTERS MOST: a different JSON-RPC error must NOT read as
  //     not-sponsored, or the way-in flow fires on an unrelated rejection ----------
  {
    const err = await caughtError(
      fakeFetch(() => okResponse({
        jsonrpc: '2.0',
        error: { code: -32010, message: 'Proof of work invalid' }, // PowInvalid, src/rpc/error.rs:26
        id: 2,
      })),
      auth,
    );
    const result = classifySendFailure(err);
    check(
      'a DIFFERENT JSON-RPC error code (PowInvalid, -32010) does NOT classify as not-sponsored',
      result.kind !== 'not-sponsored',
      result,
    );
    check('...and lands in unknown, the honest bucket for a code this module does not recognise', result.kind === 'unknown', result);
  }

  // A second distinct code, to make sure the classifier isn't accidentally keying off
  // "any negative code near -32015" or similar.
  {
    const err = await caughtError(
      fakeFetch(() => okResponse({
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Invalid params' },
        id: 3,
      })),
      auth,
    );
    const result = classifySendFailure(err);
    check('InvalidParams (-32602) is not-sponsored? No — must be unknown', result.kind === 'unknown', result);
  }

  // --- fetch() itself never gets a response: node unreachable ----------------------
  {
    const err = await caughtError(fakeFetchThatThrows(new TypeError('fetch failed')), auth);
    const result = classifySendFailure(err);
    check('a transport-level fetch() rejection classifies as unreachable', result.kind === 'unreachable', result);
  }

  // --- HTTP-level failure (node reached, but a bad status): NOT unreachable --------
  {
    const err = await caughtError(fakeFetch(() => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' })), auth);
    const result = classifySendFailure(err);
    check('an HTTP status failure (502) is not classified as unreachable (the node WAS reached)', result.kind !== 'unreachable', result);
    check('...it lands in unknown', result.kind === 'unknown', result);
  }

  // --- Unparsable JSON body: also not unreachable, not not-sponsored ---------------
  {
    const err = await caughtError(fakeFetch(() => new Response('not json {{{', { status: 200, statusText: 'OK' })), auth);
    const result = classifySendFailure(err);
    check('an unparsable 200 body is neither not-sponsored nor unreachable', result.kind === 'unknown', result);
  }

  // --- A thrown value that isn't even an Error: still classifies, doesn't throw ----
  {
    const result = classifySendFailure('a plain string, not an Error at all');
    check('classifySendFailure never throws on a non-Error input', result.kind === 'unknown', result);
  }

  // ==================================================================================
  // A 200 WHOSE `result` CARRIES NO `content_id` — the one answer that used to
  // read as an accepted write (plan 4c task 2 review, M-1).
  // ==================================================================================
  //
  // Everything above is about a REJECTION being classified correctly. This is the
  // other edge of the same knife: `submitToRoom` RESOLVING is what every caller
  // reads as "the node took it" — `chainSea` turns a resolved write into
  // `noteWrite(null)` and `wayIn.afterWrite` moves on exactly that — so a
  // well-formed JSON-RPC success with an empty `result` used to resolve with
  // `undefined` and announce a write that never landed.
  //
  // Driven through the REAL write path (real mining at the node's own regtest
  // difficulty, real signing, real `rpcCall`) rather than by calling the check
  // directly, because the claim is about what a caller of `submitToRoom` sees.
  {
    const write = await withFakeFetch(fakeFetch(() => okResponse({
      jsonrpc: '2.0', result: { content_id: `sha256:${'ab'.repeat(32)}` }, id: 8,
    })), async () => submitToRoom(writeCtx(auth), 'a body', 1_700_000_000_000));
    check('NON-DEGENERACY: a node that answers with a content_id is an accepted write',
      write === `sha256:${'ab'.repeat(32)}`, write);

    // Four shapes of "answered 200, landed nothing". None of them may resolve,
    // and each must land in `unknown` — the honest bucket — so that a caller
    // folding the classification changes no standing at all.
    const answers: ReadonlyArray<readonly [string, unknown]> = [
      ['an empty success envelope', {}],
      ['a null result', null],
      ['an empty content_id', { content_id: '' }],
      ['a content_id that is not a string', { content_id: 42 }],
    ];
    for (const [name, result] of answers) {
      const outcome = await caughtWrite(fakeFetch(() => okResponse({ jsonrpc: '2.0', result, id: 9 })), auth);
      check(`${name} is NOT an accepted write — submitToRoom rejects`, outcome.threw, outcome);
      check(`...and it classifies as unknown, which lifts nothing and raises nothing`,
        outcome.threw && classifySendFailure(outcome.e).kind === 'unknown',
        outcome.threw ? classifySendFailure(outcome.e) : outcome);
    }
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
