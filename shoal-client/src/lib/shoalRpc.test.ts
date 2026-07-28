/**
 * JSON-RPC plumbing. Run: npx tsx src/lib/shoalRpc.test.ts
 *
 * Everything here is testable without a real node: `fetch` is a single global
 * function, so it is swapped for a fake that records every call and answers from a
 * queue of pre-built `Response`s the test constructs by hand. Expected envelope
 * shapes (`jsonrpc`, `method`, `params`, `id`) are asserted against the literal
 * values passed into `rpcCall`, never by calling the encoder twice and comparing it
 * to itself.
 *
 * No wall-clock reads (per the plan's global constraint): the "monotonically
 * increasing id" checks compare an id captured from one call against the id
 * captured from the next, not against a hardcoded starting value — `requestId` is a
 * single counter shared across every `RpcAuth` for the whole process (see
 * shoalRpc.ts's comment on why), so a hardcoded start would break the moment two
 * test blocks below both call `rpcCall`.
 */
import { rpcCall, type RpcAuth } from './shoalRpc';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// --- Fake fetch harness ------------------------------------------------------------
// Records every call (url + init) and answers from a queue of Response factories, in
// call order. Node/tsx has a real global `fetch`/`Response` (undici), so these are
// genuine `Response` objects, not hand-rolled stand-ins.
interface FakeCall {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(responses: Array<() => Response>): { fetchFn: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  let next = 0;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init });
    const factory = responses[next++];
    if (!factory) throw new Error('fakeFetch: no queued response for this call');
    return factory();
  }) as typeof fetch;
  return { fetchFn, calls };
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, statusText: 'OK' });
}

function withFakeFetch<T>(responses: Array<() => Response>, run: (calls: FakeCall[]) => Promise<T>): Promise<T> {
  const { fetchFn, calls } = fakeFetch(responses);
  const original = globalThis.fetch;
  globalThis.fetch = fetchFn;
  return run(calls).finally(() => {
    globalThis.fetch = original;
  });
}

function bodyOf(call: FakeCall): { jsonrpc: string; method: string; params: unknown; id: number } {
  return JSON.parse(String(call.init?.body)) as { jsonrpc: string; method: string; params: unknown; id: number };
}

async function main() {
  const auth: RpcAuth = { endpoint: 'http://node-a.example/rpc', authHeader: null };

  // --- Successful call: result returned, envelope well-formed, id increases --------
  await withFakeFetch(
    [() => okResponse({ jsonrpc: '2.0', result: { ok: 1 }, id: 1 }), () => okResponse({ jsonrpc: '2.0', result: { ok: 2 }, id: 2 })],
    async (calls) => {
      const r1 = await rpcCall<{ ok: number }>(auth, 'get_info', { a: 1 });
      const r2 = await rpcCall<{ ok: number }>(auth, 'get_info', { a: 2 });

      check('successful call returns the result field', r1.ok === 1 && r2.ok === 2, { r1, r2 });
      check('exactly one HTTP call per rpcCall', calls.length === 2, calls.length);

      const b1 = bodyOf(calls[0]);
      const b2 = bodyOf(calls[1]);
      check('envelope carries jsonrpc 2.0', b1.jsonrpc === '2.0', b1);
      check('envelope carries the method verbatim', b1.method === 'get_info', b1);
      check('envelope carries the params verbatim', JSON.stringify(b1.params) === JSON.stringify({ a: 1 }), b1);
      check('second call carries its own distinct params', JSON.stringify(b2.params) === JSON.stringify({ a: 2 }), b2);

      // Monotonic id, checked relatively (see module header) rather than against a
      // hardcoded start.
      check('id is a positive integer on both calls', Number.isInteger(b1.id) && b1.id > 0 && Number.isInteger(b2.id) && b2.id > 0, { b1, b2 });
      check('the second call\'s id is exactly one greater than the first (monotonic, per-process counter, no other rpcCall interleaved)', b2.id === b1.id + 1, { id1: b1.id, id2: b2.id });
    },
  );

  // --- JSON-RPC error body rejects, message includes the code ----------------------
  await withFakeFetch([() => okResponse({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: 99 })], async () => {
    let threw: unknown = null;
    try {
      await rpcCall(auth, 'nonexistent_method', {});
    } catch (e) {
      threw = e;
    }
    check('a JSON-RPC error body rejects rather than resolving', threw !== null, threw);
    check(
      'the rejection message includes the JSON-RPC error code',
      threw instanceof Error && threw.message.includes('-32601'),
      threw instanceof Error ? threw.message : threw,
    );
  });

  // --- HTTP-level failure (500) rejects ---------------------------------------------
  await withFakeFetch([() => new Response('server exploded', { status: 500, statusText: 'Internal Server Error' })], async () => {
    let threw: unknown = null;
    try {
      await rpcCall(auth, 'get_info', {});
    } catch (e) {
      threw = e;
    }
    check('a 500 response rejects rather than returning undefined', threw !== null, threw);
    check('the rejection surfaces the HTTP status', threw instanceof Error && threw.message.includes('500'), threw instanceof Error ? threw.message : threw);
  });

  // --- A 200 with a non-JSON body rejects -------------------------------------------
  await withFakeFetch([() => new Response('not valid json {{{', { status: 200, statusText: 'OK' })], async () => {
    let threw: unknown = null;
    try {
      await rpcCall(auth, 'get_info', {});
    } catch (e) {
      threw = e;
    }
    check('a 200 with an unparsable body rejects rather than returning undefined', threw !== null, threw);
  });

  // --- Authorization header: present when set, absent (not "null") when null -------
  await withFakeFetch([() => okResponse({ jsonrpc: '2.0', result: {}, id: 1 })], async (calls) => {
    const authed: RpcAuth = { endpoint: 'http://node-b.example/rpc', authHeader: 'Basic deadbeef' };
    await rpcCall(authed, 'get_info', {});
    const headers = calls[0].init?.headers as Record<string, string> | undefined;
    check('Authorization header is sent verbatim when authHeader is set', headers?.Authorization === 'Basic deadbeef', headers);
  });

  await withFakeFetch([() => okResponse({ jsonrpc: '2.0', result: {}, id: 1 })], async (calls) => {
    const noAuth: RpcAuth = { endpoint: 'http://node-c.example/rpc', authHeader: null };
    await rpcCall(noAuth, 'get_info', {});
    const headers = calls[0].init?.headers as Record<string, string> | undefined;
    check('Authorization header is absent (key not present) when authHeader is null', !headers || !('Authorization' in headers), headers);
    check('Authorization is never sent as the literal string "null"', headers?.Authorization !== 'null', headers);
  });

  // --- Two concurrent calls get distinct ids ----------------------------------------
  await withFakeFetch(
    [() => okResponse({ jsonrpc: '2.0', result: { which: 'first' }, id: 1 }), () => okResponse({ jsonrpc: '2.0', result: { which: 'second' }, id: 2 })],
    async (calls) => {
      // Started back-to-back, neither awaited before the other starts — the id is
      // assigned synchronously inside rpcCall before its first `await`, so call order
      // (not fetch-resolution order) determines id order. See module header.
      const p1 = rpcCall<{ which: string }>(auth, 'concurrent_a', {});
      const p2 = rpcCall<{ which: string }>(auth, 'concurrent_b', {});
      const [r1, r2] = await Promise.all([p1, p2]);

      check('both concurrent calls resolve with their own result', r1.which === 'first' && r2.which === 'second', { r1, r2 });
      const b1 = bodyOf(calls[0]);
      const b2 = bodyOf(calls[1]);
      check('two concurrent calls get distinct ids', b1.id !== b2.id, { id1: b1.id, id2: b2.id });
    },
  );

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
