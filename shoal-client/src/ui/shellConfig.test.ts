/**
 * The non-dev configuration path — plan 4b, Task 1, Step 5. Run:
 * npx tsx src/ui/shellConfig.test.ts
 *
 * WHAT IS REAL HERE AND WHAT IS FAKE, because that is the whole worth of this
 * file. Only two things are faked, and both are the OUTSIDE world:
 *
 *   - the shell's Tauri command surface (an `invoke` function), and
 *   - the node itself (a `fetch` that answers JSON-RPC).
 *
 * Everything between them is the shipping code: the real `shellConfig`, the
 * real `nodeIdentity`, the real `rpcCall`, the real error classes. So a check
 * that says "the signer signs through the node" is driving `sign_message` over
 * the real RPC layer with the real Authorization header, not asserting that a
 * stub was handed back.
 *
 * The expected room content id is computed with **node:crypto**, not with the
 * `hash-wasm` digest the module under test uses — two independent SHA-256
 * implementations agreeing on `sha256("The Shoal\n\nthe room every swimmer
 * replies into")` is evidence; the module agreeing with itself would not be.
 *
 * The load-bearing check is the last group: EVERY incomplete answer from the
 * shell or the node yields `null` and not a half-built object. Plan 4a's own
 * comment on the dev path calls half a configuration "the single most confusing
 * failure available here", and on this path there is no address bar to inspect
 * afterwards.
 */
import { createHash } from 'node:crypto';

import {
  ROOM_BODY, ROOM_TITLE, WATER_APP, WATER_NAME, WATER_SPACE_NAME,
  roomContentId, shellConfig, shellSurface, type InvokeFn,
} from './shellConfig';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// A fake node: a `fetch` that speaks JSON-RPC and records what it was asked
// ---------------------------------------------------------------------------

const ENDPOINT = 'http://127.0.0.1:29736';
const COOKIE_HEADER = 'Basic X19jb29raWVfXzpkZWFkYmVlZg==';

/** The node's own identity, as `get_identity_info` reports it. */
const NODE_PUBKEY = 'a'.repeat(63) + '7';
const NODE_ADDRESS = 'sw1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqexample';

/** 64 bytes, 0x00..0x3f — what the fake node's `sign_message` hands back. */
const SIG_BYTES = Uint8Array.from({ length: 64 }, (_, i) => i);
const SIG_HEX = Array.from(SIG_BYTES).map((b) => b.toString(16).padStart(2, '0')).join('');

interface SeenCall {
  method: string;
  params: Record<string, unknown>;
  authorization: string | undefined;
}

interface NodeBehaviour {
  /** `get_identity_info`'s answer. Omit a field to model a node that reports
   *  an identity it cannot fully name. */
  identity?: { has_identity: boolean; public_key: string | null; address: string | null };
  /** Successive `list_spaces` pages, in offset order. */
  spacePages?: { space_id?: string; name?: string | null; app?: string | null }[][];
  /** Whether `get_content` finds the room post. */
  roomPresent?: boolean;
}

function fakeNode(b: NodeBehaviour): { fetch: typeof fetch; seen: SeenCall[] } {
  const seen: SeenCall[] = [];
  const pages = b.spacePages ?? [[]];

  const impl = async (_input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    const req = JSON.parse(init?.body ?? '{}') as { method: string; params: Record<string, unknown>; id: number };
    seen.push({ method: req.method, params: req.params, authorization: init?.headers?.Authorization });

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
        return ok(b.identity ?? { has_identity: true, public_key: NODE_PUBKEY, address: NODE_ADDRESS });
      case 'list_spaces': {
        const offset = Number(req.params.offset ?? 0);
        const limit = Number(req.params.limit ?? 200);
        const page = pages[Math.floor(offset / limit)] ?? [];
        return ok({ spaces: page, total: pages.reduce((n, p) => n + p.length, 0) });
      }
      case 'get_content':
        return (b.roomPresent ?? true)
          ? ok({ content_id: req.params.content_id, body: ROOM_BODY })
          : err(-32013, 'Content not found');
      case 'sign_message':
        return ok({ signature: SIG_HEX, public_key: NODE_PUBKEY });
      default:
        return err(-32601, `unexpected method ${req.method}`);
    }
  };

  return { fetch: impl as unknown as typeof fetch, seen };
}

/** A shell whose `get_rpc_config` answers with the endpoint and cookie header
 *  the real command returns (`RpcConfigDto`, src-tauri/src/main.rs:138-142). */
function fakeShell(cfg: unknown | (() => never)): InvokeFn {
  return (async (cmd: string) => {
    if (cmd !== 'get_rpc_config') throw new Error(`unexpected command ${cmd}`);
    if (typeof cfg === 'function') return (cfg as () => never)();
    return cfg;
  }) as InvokeFn;
}

async function withNode<T>(node: { fetch: typeof fetch }, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = node.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

/** Silence the module's console.error while a failure path runs, so a failing
 *  assembly does not bury the check output it is being judged by. */
async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = original;
  }
}

const SHOAL_SPACE = 'sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqjw5s6';
const GOOD_SPACES = [[
  { space_id: 'sp1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzabcde', name: 'General', app: null },
  { space_id: SHOAL_SPACE, name: WATER_NAME, app: WATER_APP },
]];

// ---------------------------------------------------------------------------
// 1. The water is derived, not configured
// ---------------------------------------------------------------------------

async function theWaterIsDerived(): Promise<void> {
  console.log('\n1. the water is derived from its own text');

  // Independent of the module: node:crypto over the exact bytes `submit_post`
  // hashes (`${title}\n\n${body}`).
  const expected = 'sha256:' + createHash('sha256')
    .update(`${ROOM_TITLE}\n\n${ROOM_BODY}`, 'utf8')
    .digest('hex');

  check('the room id is sha256(title + blank line + body), agreed by a second implementation',
    (await roomContentId()) === expected, { got: await roomContentId(), expected });

  check('and it is a content id the node would accept in parent_id',
    /^sha256:[0-9a-f]{64}$/.test(await roomContentId()), await roomContentId());

  // The marker form and the listing form are DIFFERENT strings, and confusing
  // them is the defect this constant exists to avoid (see WATER_NAME).
  check('the space name given to create_space carries the app marker',
    WATER_SPACE_NAME === '@shoal:main', WATER_SPACE_NAME);
  check('the name matched against a listing does NOT — list_spaces strips it',
    WATER_NAME === 'main' && !WATER_NAME.includes('@'), WATER_NAME);
}

// ---------------------------------------------------------------------------
// 2. A complete configuration
// ---------------------------------------------------------------------------

async function aCompleteConfiguration(): Promise<void> {
  console.log('\n2. a complete configuration, assembled from the shell and the node');

  const node = fakeNode({ spacePages: GOOD_SPACES });
  // The whole group runs with the fake node installed: the signer below is
  // exercised for real, so it must still be able to reach it.
  await withNode(node, () => aCompleteConfigurationAgainst(node));
}

async function aCompleteConfigurationAgainst(node: { seen: SeenCall[] }): Promise<void> {
  const cfg = await shellConfig(fakeShell({ endpoint: ENDPOINT, auth: COOKIE_HEADER }));

  if (cfg === null) {
    check('a complete shell + node yields a configuration', false, 'got null');
    return;
  }
  check('a complete shell + node yields a configuration', true);

  check('the endpoint is the one the shell handed over', cfg.auth.endpoint === ENDPOINT, cfg.auth.endpoint);
  check('the cookie header is carried through untouched',
    cfg.auth.authHeader === COOKIE_HEADER, cfg.auth.authHeader);
  check('the swimmer is the node\'s own public key',
    cfg.authorIdHex === NODE_PUBKEY, cfg.authorIdHex);
  check('the node\'s address comes along for anything that must show a human one',
    cfg.address === NODE_ADDRESS, cfg.address);
  check('the space is the one listed under the shoal namespace',
    cfg.spaceId === SHOAL_SPACE, cfg.spaceId);
  check('the room is the derived one', cfg.roomContentId === (await roomContentId()), cfg.roomContentId);

  // NOT a URL: nothing in the assembled configuration came from a query string,
  // and the one credential in it is the header the shell produced.
  check('no configuration value is a query parameter — the cookie is a header, not a URL field',
    !cfg.auth.endpoint.includes('?') && !cfg.auth.endpoint.includes('cookie='), cfg.auth.endpoint);

  // The signer, exercised for real: this drives `sign_message` through the same
  // `rpcCall` the game writes with.
  const signer = await cfg.signer;
  check('the signer agrees with the swimmer it signs for',
    signer.publicKeyHex === cfg.authorIdHex, signer.publicKeyHex);

  const msg = Uint8Array.from([0x01, 0x02, 0x03, 0xff]);
  const sig = await signer.sign(msg);
  check('signing returns the node\'s 64 bytes', sig.length === 64, sig.length);
  check('...and they are the bytes the node sent, decoded',
    Array.from(sig).every((b, i) => b === SIG_BYTES[i]), Array.from(sig.slice(0, 4)));

  const signCall = node.seen.find((c) => c.method === 'sign_message');
  check('signing happened ON THE NODE — sign_message was called',
    signCall !== undefined);
  check('...with the exact bytes we asked it to sign, hex-encoded',
    signCall?.params.message === '010203ff', signCall?.params.message);
  check('...carrying the shell\'s cookie, which is what sign_message requires (server.rs:460-467)',
    signCall?.authorization === COOKIE_HEADER, signCall?.authorization);

  // A key the browser held would never need the node at all. This is the
  // negative half of the claim above.
  check('nothing was signed before a caller asked — assembly is not a signing oracle',
    node.seen.filter((c) => c.method === 'sign_message').length === 1,
    node.seen.map((c) => c.method));
}

// ---------------------------------------------------------------------------
// 3. Finding the water among many
// ---------------------------------------------------------------------------

async function findingTheWater(): Promise<void> {
  console.log('\n3. finding the water');

  // Page 2 of a full first page: the listing loop has to keep going.
  const filler = Array.from({ length: 200 }, (_, i) => ({
    space_id: `sp1filler${i}`, name: `Filler ${i}`, app: null,
  }));
  const paged = fakeNode({ spacePages: [filler, [{ space_id: SHOAL_SPACE, name: WATER_NAME, app: WATER_APP }]] });
  const cfg = await withNode(paged, () => shellConfig(fakeShell({ endpoint: ENDPOINT, auth: COOKIE_HEADER })));
  check('a water on the second page is still found',
    cfg !== null && cfg.spaceId === SHOAL_SPACE, cfg?.spaceId ?? null);

  // NON-DEGENERACY: the namespace is half the match. Another app's space called
  // "main" is a different body of water entirely, and joining it would put the
  // player in a room whose replies are not moves at all.
  const wrongApp = fakeNode({ spacePages: [[{ space_id: SHOAL_SPACE, name: WATER_NAME, app: 'wiki' }]] });
  const cfgWrongApp = await quietly(() => withNode(wrongApp, () => shellConfig(
    fakeShell({ endpoint: ENDPOINT, auth: COOKIE_HEADER }),
  )));
  check('NON-DEGENERACY: another app\'s space named "main" is not this water',
    cfgWrongApp === null, cfgWrongApp);

  // NON-DEGENERACY: and the name is the other half. A space in this namespace
  // called something else is a different water within the same game.
  const wrongName = fakeNode({ spacePages: [[{ space_id: SHOAL_SPACE, name: 'smoke', app: WATER_APP }]] });
  const cfgWrongName = await quietly(() => withNode(wrongName, () => shellConfig(
    fakeShell({ endpoint: ENDPOINT, auth: COOKIE_HEADER }),
  )));
  check('NON-DEGENERACY: a different water in the same namespace is not this one',
    cfgWrongName === null, cfgWrongName);
}

// ---------------------------------------------------------------------------
// 4. A browser build is unaffected
// ---------------------------------------------------------------------------

async function aBrowserBuildIsUnaffected(): Promise<void> {
  console.log('\n4. no shell, no configuration');

  // This test process has no `window` at all, which is exactly the shape of a
  // context with no Tauri shell.
  check('shellSurface() finds nothing when there is no window',
    shellSurface() === null, shellSurface());

  // A window WITHOUT Tauri — a plain browser tab serving the same bundle.
  const g = globalThis as { window?: unknown };
  const hadWindow = 'window' in g;
  g.window = { location: { origin: 'https://example.invalid' } };
  check('nor when there is a window with no shell in it', shellSurface() === null, shellSurface());

  // A window WITH Tauri: the surface must actually be found, or check 1 above
  // would pass for a `shellSurface` that always returned null.
  let invoked: string | null = null;
  g.window = { __TAURI__: { core: { invoke: async (cmd: string) => { invoked = cmd; return { endpoint: '' }; } } } };
  const surface = shellSurface();
  check('POSITIVE CONTROL: a window with a shell in it does yield a surface', surface !== null);
  if (surface !== null) {
    await surface('get_rpc_config');
    check('...and it reaches the shell\'s own command', invoked === 'get_rpc_config', invoked);
  }
  if (hadWindow) g.window = undefined; else delete g.window;

  const cfg = await shellConfig(null);
  check('shellConfig(null) is null — a browser build never reaches the node',
    cfg === null, cfg);
}

// ---------------------------------------------------------------------------
// 5. Half a configuration is never returned
// ---------------------------------------------------------------------------

async function halfAConfigurationIsNeverReturned(): Promise<void> {
  console.log('\n5. every incomplete answer is null, never a partial configuration');

  const shellSaysEndpoint = fakeShell({ endpoint: ENDPOINT, auth: COOKIE_HEADER });

  const cases: { name: string; run: () => Promise<unknown> }[] = [
    {
      name: 'the shell\'s command failed (node never bound RPC)',
      run: () => withNode(fakeNode({ spacePages: GOOD_SPACES }), () => shellConfig(
        fakeShell(() => { throw new Error('The node did not publish its RPC address within 120s'); }),
      )),
    },
    {
      name: 'the shell returned no endpoint',
      run: () => withNode(fakeNode({ spacePages: GOOD_SPACES }), () => shellConfig(
        fakeShell({ endpoint: '', auth: COOKIE_HEADER }),
      )),
    },
    {
      name: 'the node reports no identity at all',
      run: () => withNode(
        fakeNode({ identity: { has_identity: false, public_key: null, address: null }, spacePages: GOOD_SPACES }),
        () => shellConfig(shellSaysEndpoint),
      ),
    },
    {
      name: 'the node claims an identity but names no public key',
      run: () => withNode(
        fakeNode({ identity: { has_identity: true, public_key: null, address: NODE_ADDRESS }, spacePages: GOOD_SPACES }),
        () => shellConfig(shellSaysEndpoint),
      ),
    },
    {
      name: 'the node claims an identity but names no address',
      run: () => withNode(
        fakeNode({ identity: { has_identity: true, public_key: NODE_PUBKEY, address: null }, spacePages: GOOD_SPACES }),
        () => shellConfig(shellSaysEndpoint),
      ),
    },
    {
      name: 'the node has never heard of this water',
      run: () => withNode(fakeNode({ spacePages: [[]] }), () => shellConfig(shellSaysEndpoint)),
    },
    {
      name: 'the water is here but its room post is not',
      run: () => withNode(
        fakeNode({ spacePages: GOOD_SPACES, roomPresent: false }),
        () => shellConfig(shellSaysEndpoint),
      ),
    },
  ];

  for (const c of cases) {
    const got = await quietly(c.run);
    // `=== null` and not a falsy test: an object missing `authorIdHex` is
    // truthy and would sail past a `!got` check, which is the exact failure
    // this group exists to forbid.
    check(`${c.name} -> null`, got === null, got);
  }
}

async function main(): Promise<void> {
  await theWaterIsDerived();
  await aCompleteConfiguration();
  await findingTheWater();
  await aBrowserBuildIsUnaffected();
  await halfAConfigurationIsNeverReturned();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
