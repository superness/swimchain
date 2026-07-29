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
import { classifySendFailure } from './shoalSend';

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

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
