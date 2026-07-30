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

import { isWireSpaceId } from '../lib/shoalRpc';

import {
  WATER_APP, WATER_NAME, WATER_SPACE_NAME,
  shellConfig, shellSurface, shellWater, waterSpaceId, type InvokeFn,
} from './shellConfig';
import { encodeWireSpaceId } from '../lib/shoalRpc';
import { roomIdIn, roomTextIn } from '../lib/water';
import { epochOf } from '../lib/epoch';

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
  /** Successive `list_spaces` pages, in offset order. Kept so a check can prove
   *  the window no longer consults a listing even when one is on offer. */
  spacePages?: { space_id?: string; name?: string | null; app?: string | null }[][];
  /** Whether `get_content` finds the room post LOCALLY. */
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
        // KEPT, ANSWERING CORRECTLY, THOUGH NOTHING SHOULD REACH IT. `roomReady`
        // is gone (there is no fixed room to be ready), so a check counting
        // `get_content` at zero is measuring the module and not a missing fake.
        return (b.roomPresent ?? true)
          ? ok({ content_id: req.params.content_id, body: 'a room' })
          : err(-32004, 'Content not found');
      case 'request_content':
        return ok({ status: 'discovering', content_id: req.params.content_id });
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

/**
 * THE REAL MAINNET SPACE ID FOR `@shoal:main`, pinned as a literal.
 *
 * Not read from anywhere the module under test can reach — this is the value
 * observed on the live chain during Task 4 and recorded in project memory, so
 * `waterSpaceId()` agreeing with it is evidence about the derivation rather
 * than the derivation agreeing with itself. If a change to `WATER_APP`,
 * `WATER_NAME`, the class byte or the bech32m encoder ever moved the derived
 * id, this is the check that would say so — and moving it would silently point
 * every shipped build at an empty body of water.
 */
const LIVE_MAINNET_WATER = 'sp1qqz4vc5lj250danvppc8k2hchy9sxh0ae6';

/** A listing the window must now IGNORE: it names a different id for this
 *  water, so any check that passes with this present is not reading it. */
const GOOD_SPACES = [[
  { space_id: 'sp1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzabcde', name: 'General', app: null },
  { space_id: 'sp1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqjw5s6', name: WATER_NAME, app: WATER_APP },
]];

// ---------------------------------------------------------------------------
// 1. The water is derived, not configured
// ---------------------------------------------------------------------------

async function theWaterIsDerived(): Promise<void> {
  console.log('\n1. the water is derived from its own text');

  // Independent of the module: node:crypto over the same one string
  // `create_space` name-addresses an app space by. THE ROOM IS NO LONGER PART
  // OF THIS — it is a function of the hour (`shoalRoom.ts`) and there is no
  // fixed `roomContentId` to derive; section 6 checks the rooms this water
  // derives instead, and checks them against this same name.
  const digest = createHash('sha256').update(`app:${WATER_APP}:v1:${WATER_NAME}`, 'utf8').digest();
  const id16 = new Uint8Array(16);
  id16[0] = 0x05;
  id16.set(digest.subarray(0, 15), 1);
  check('the space id is sha256(app:shoal:v1:main) under the App class byte, by a second implementation',
    (await waterSpaceId()) === encodeWireSpaceId(id16), await waterSpaceId());

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
  check('the space is the derived one, not whatever the listing offered',
    cfg.water.spaceId === LIVE_MAINNET_WATER, cfg.water.spaceId);
  // THE BINDING (plan 4d Task 2). The configuration no longer carries a space
  // beside a room string that nothing joined; it carries the WATER, and the
  // name in it is the name that derived the space id.
  check('the water carries the name its space id was derived from',
    cfg.water.name === WATER_NAME && cfg.water.spaceName === WATER_SPACE_NAME,
    { name: cfg.water.name, spaceName: cfg.water.spaceName });
  check('...and every room it derives is a room of THAT name, by construction',
    roomTextIn(cfg.water, 495_936).body === 'room:shoal:v1:' + cfg.water.name + ':495936',
    roomTextIn(cfg.water, 495_936).body);
  // NO SINGLE ROOM IS CARRIED ANY MORE. The room is a function of the hour, so
  // a `roomContentId` field would have been a lie by the next boundary.
  check('the configuration names no fixed room at all',
    !('roomContentId' in (cfg as unknown as Record<string, unknown>)), Object.keys(cfg));

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
  console.log('\n3. the water is DERIVED, and it matches the live chain');

  const derived = await waterSpaceId();

  // The load-bearing one. Task 4 proved discovery cannot resolve on a fresh
  // node — `list_spaces` reported this exact space with `app:null, name:null,
  // name_unresolved:true`, and four peers never answered `GET_SPACE_META`. So
  // the id has to come from the two constants instead, and it has to be RIGHT.
  check('the derived id is the one @shoal:main actually has on mainnet',
    derived === LIVE_MAINNET_WATER, { derived, live: LIVE_MAINNET_WATER });

  check('...and it is in the bech32m wire form every RPC speaks',
    isWireSpaceId(derived), derived);

  // The class byte is the first of the sixteen, so an App-classed id always
  // begins `sp1qqz` (version 0 + 0x05). A Social-classed one would not, and the
  // node hides non-app classes from listings entirely.
  check('...carrying the App space class, as create_space assigns it',
    derived.startsWith('sp1qqz'), derived.slice(0, 8));

  // NON-DEGENERACY: both halves of the name are really in the digest. If either
  // were dropped, every game's water would collide on one id.
  const bySameRecipe = async (app: string, name: string): Promise<string> => {
    const { createHash } = await import('node:crypto');
    const { encodeWireSpaceId } = await import('../lib/shoalRpc');
    const h = createHash('sha256').update(`app:${app}:v1:${name}`, 'utf8').digest();
    const id16 = new Uint8Array(16);
    id16[0] = 0x05;
    id16.set(h.subarray(0, 15), 1);
    return encodeWireSpaceId(id16);
  };

  // Computed with node:crypto rather than the module's hash-wasm digest — two
  // independent SHA-256s agreeing is evidence; one agreeing with itself is not.
  check('SECOND IMPLEMENTATION: node:crypto derives the same id from the same two strings',
    (await bySameRecipe(WATER_APP, WATER_NAME)) === derived, await bySameRecipe(WATER_APP, WATER_NAME));

  check('NON-DEGENERACY: another app\'s "main" derives a DIFFERENT id',
    (await bySameRecipe('wiki', WATER_NAME)) !== derived);
  check('NON-DEGENERACY: a different water in this namespace derives a DIFFERENT id',
    (await bySameRecipe(WATER_APP, 'smoke')) !== derived);

  // AND IT DOES NOT READ THE LISTING. `GOOD_SPACES` names a different id for a
  // space whose `(app, name)` match exactly — the very thing the old lookup
  // keyed on. A window that still consulted it would come back with that id.
  const node = fakeNode({ spacePages: GOOD_SPACES });
  const cfg = await withNode(node, () => shellConfig(fakeShell({ endpoint: ENDPOINT, auth: COOKIE_HEADER })));
  check('a listing offering a different id for @shoal:main is ignored',
    cfg !== null && cfg.water.spaceId === derived, cfg?.water.spaceId ?? null);
  check('...because list_spaces is never called at all',
    !node.seen.some((c) => c.method === 'list_spaces'), node.seen.map((c) => c.method));
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
    // "THE ROOM POST'S BODY HAS NOT ARRIVED YET" WAS THE SIXTH CASE HERE AND IS
    // GONE. There is no fixed room to wait for any more: the room is a function
    // of the hour and `chainSea` MINTS the one it needs. The positive check
    // further down requires the opposite of what this case did — a node holding
    // no room post must now yield a complete configuration — and leaving this
    // here would have pinned plan 4b's measured 3 m 18 s wait in place forever.
  ];

  for (const c of cases) {
    const got = await quietly(c.run);
    // `=== null` and not a falsy test: an object missing `authorIdHex` is
    // truthy and would sail past a `!got` check, which is the exact failure
    // this group exists to forbid.
    check(`${c.name} -> null`, got === null, got);
  }

  // "The node has never heard of this water" is NO LONGER A REASON, and that is
  // the whole point of deriving the id: an empty listing used to strand a fresh
  // install forever. It must not do so now.
  const noListing = fakeNode({ spacePages: [[]] });
  const stillFine = await withNode(noListing, () => shellConfig(shellSaysEndpoint));
  check('an empty listing is no longer a reason to fail — the id was never in it',
    stillFine !== null && stillFine.water.spaceId === (await waterSpaceId()),
    stillFine?.water.spaceId ?? null);

  // AND NEITHER IS A ROOM THAT HAS NOT ARRIVED — plan 4d Task 2 removed the
  // last reason this path ever waited on the network.
  //
  // `roomReady` used to ask `get_content` whether ONE fixed room post was here
  // and return `null` until it was. `get_content` is local-only and never
  // pulls, so a fresh install sat in the shallows while `request_content`
  // hunted for a peer — measured at 3 m 18 s in plan 4b's live run. There is no
  // fixed room now, and `chainSea` mints the hour's room itself rather than
  // waiting for anyone, so a node that has never heard of any room must hand
  // back a complete configuration immediately.
  const noRoom = fakeNode({ spacePages: GOOD_SPACES, roomPresent: false });
  const joined = await withNode(noRoom, () => shellConfig(shellSaysEndpoint));
  check('a node holding NO room post is no longer a reason to fail',
    joined !== null && joined.water.spaceId === (await waterSpaceId()),
    joined?.water.spaceId ?? null);
  check('...and this path asks for no content at all any more — no get_content, no request_content',
    !noRoom.seen.some((c) => c.method === 'get_content' || c.method === 'request_content'),
    noRoom.seen.map((c) => c.method));

  // NON-DEGENERACY for the pair above: the fake node IS being driven. Without
  // this, "no get_content" would pass just as well for a `shellConfig` that had
  // stopped making any calls at all.
  check('NON-DEGENERACY: the configuration was assembled from real RPC on that node',
    noRoom.seen.some((c) => c.method === 'get_identity_info'), noRoom.seen.map((c) => c.method));
}

/**
 * The water's rooms are bound to the water's space — plan 4d Task 2's MEDIUM,
 * carried in from Task 1's review.
 *
 * The finding: nothing joined the name passed to `roomIdFor` to the space
 * `waterSpaceId` derived. Both were correct; neither knew about the other, so a
 * caller could hold a room of one water and the space of another, and every
 * write would be accepted, every read would answer, and the sea would be shared
 * with nobody. There is one value now and one function that makes it.
 */
async function theRoomsBelongToTheSpace(): Promise<void> {
  console.log('\n--- the rooms are bound to the space ---');

  const water = await shellWater();

  // ONE NAME, BOTH DERIVATIONS. Re-derived with node:crypto from `water.name`
  // ALONE — deliberately not from `WATER_NAME` — so this fails if `waterNamed`
  // ever returned a space derived from one string beside a name that is
  // another.
  const bySameRecipe = (app: string, name: string): string => {
    const digest = createHash('sha256').update('app:' + app + ':v1:' + name, 'utf8').digest();
    const id16 = new Uint8Array(16);
    id16[0] = 0x05;
    id16.set(digest.subarray(0, 15), 1);
    return encodeWireSpaceId(id16);
  };
  check('the space id is sha256 over the water\'s OWN name, not over some other string',
    water.spaceId === bySameRecipe(water.app, water.name), water.spaceId);

  // NON-DEGENERACY: the check above would pass for any two agreeing constants,
  // so prove the recipe actually discriminates on the name.
  check('NON-DEGENERACY: another name derives another space',
    water.spaceId !== bySameRecipe(water.app, 'smoke'));

  // AND THE ROOM CARRIES THAT SAME NAME. A room body is
  // `room:shoal:v1:<name>:<epoch>`, so this reads the name back OUT of the room
  // and requires it to be the one the space was derived from — the two halves
  // of the binding, joined, rather than each checked against a constant.
  const body = roomTextIn(water, 495_936).body;
  const nameInRoom = body.split(':')[3];
  check('the name inside the room body is the name that derived the space',
    nameInRoom === water.name && water.spaceId === bySameRecipe(water.app, nameInRoom),
    { nameInRoom, water: water.name });
  check('...and the room id follows from that body, under a second SHA-256',
    (await roomIdIn(water, 495_936))
      === 'sha256:' + createHash('sha256')
        .update('The Shoal\n\nroom:shoal:v1:' + water.name + ':495936', 'utf8').digest('hex'),
    await roomIdIn(water, 495_936));

  // Every hour of this water is an hour of this water — sampled, not argued.
  const e = epochOf(1_785_369_600_000);
  let allNamed = true;
  for (let i = -3; i <= 3; i++) {
    if (roomTextIn(water, e + i).body !== 'room:shoal:v1:' + water.name + ':' + (e + i)) allNamed = false;
  }
  check('seven consecutive hours all name this water and no other', allNamed);
}

async function main(): Promise<void> {
  await theWaterIsDerived();
  await aCompleteConfiguration();
  await findingTheWater();
  await aBrowserBuildIsUnaffected();
  await halfAConfigurationIsNeverReturned();
  await theRoomsBelongToTheSpace();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
