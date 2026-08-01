/**
 * Mint the water the game joins — plan 4b, Task 2.
 *
 * THIS IS THE ONE THING THAT CREATES `@shoal:main` AND ITS ROOM, and it exists
 * because `shellConfig.ts` claimed that "whatever mints the water and whatever
 * joins it cannot drift" while nothing at all minted it. The claim was true of
 * a minter that did not exist; every smoke script in `scripts/` deliberately
 * mints a DIFFERENT water (`@shoal:smoke`, `@shoal:two`, `@shoal:cp`) so a test
 * run can never write into the water people are playing in, so none of them was
 * ever going to be the minter either. Whoever went to mint the real one would
 * have copied a recipe and typed the name by hand.
 *
 * A one-character typo there is the worst failure available on this path: the
 * space would exist, be perfectly healthy, accept writes, and be INVISIBLE to
 * every shipped build forever — `list_spaces` would never match `(app, name)`,
 * `shellConfig` would return `null`, and every player would land in the offline
 * sea with the console saying "no water named @shoal:main here yet" on a node
 * where a space called `@shoal:mian` was quietly accumulating posts.
 *
 * So this script types nothing. `WATER_SPACE_NAME`, `ROOM_TITLE` and
 * `ROOM_BODY` are imported from `src/ui/shellConfig.ts` — the same module the
 * game reads them from — and `seaChoice.test.ts` section 4 fails if this file
 * ever grows a string literal of its own.
 *
 * ## IT MINTS AS THE NODE, WHICH IS WHO THE GAME PLAYS AS
 *
 * No seed, no key file, no genesis identity: the actions are signed through the
 * node's own `sign_message`, exactly the way `shellConfig` signs (`nodeIdentity`,
 * shoalRpc.ts). That is the one identity story that is identical on regtest,
 * testnet and mainnet — a genesis-sponsored minter would work on the first two
 * and be unavailable on the third, which is the network this actually has to
 * run on.
 *
 * The node must therefore be one whose identity may write: on mainnet and
 * testnet that means a SPONSORED identity, and an unsponsored one will be
 * refused at ingestion (`check_identity_sponsored`, src/rpc/methods.rs:753).
 * Regtest bypasses that gate, but NOT the block builder's separate
 * `is_authorized_in_space` check — see `regtest-smoke.ts`'s header, which is
 * the same trap in the same place.
 *
 * ## IDEMPOTENT, BY THE NODE'S OWN CONSTRUCTION
 *
 * `create_space` on an app-namespaced name returns the existing space id rather
 * than failing (the id is `sha256("app:<app>:v1:<display>")[..16]`, so there is
 * only ever one of them), and the room post's content id is fully determined by
 * its text, so its existence is a lookup rather than a search. Running this
 * twice does nothing the second time.
 *
 * ## HOW TO RUN IT
 *
 *   SHOAL_RPC=http://127.0.0.1:29736 \
 *   SHOAL_COOKIE_FILE=<data-dir>/.cookie \
 *   npx tsx scripts/mint-water.ts
 *
 * The cookie is required, not optional: `sign_message` is auth-gated on every
 * network (`src/rpc/server.rs:460-467` — "an unauthenticated exemption is a
 * signing oracle"), so without it nothing here can sign anything.
 *
 * The last thing it does is run the REAL `shellConfig` against the node it just
 * wrote to. That is the check worth having: not "the calls returned 200" but
 * "the joiner, unmodified, now finds this water and this room". If that prints
 * a configuration, a shipped build pointed at this node plays.
 */
import { readFileSync } from 'node:fs';

import { nodeIdentity, rpcCall, type RpcAuth } from '../src/lib/shoalRpc';
import {
  ACTION_TYPE_SPACE_CREATION, mineAndSignAction, powProfileFor,
} from '../src/lib/shoalSend';
import {
  WATER_APP, WATER_NAME, WATER_SPACE_NAME, shellConfig, shellWater,
} from '../src/ui/shellConfig';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`PASS: ${name}`);
  else { failures++; console.log(`FAIL: ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`); }
}

function log(msg: string): void {
  console.log(`[mint] ${msg}`);
}

function authFromEnv(): RpcAuth {
  const endpoint = (process.env.SHOAL_RPC ?? '').trim();
  const cookieFile = (process.env.SHOAL_COOKIE_FILE ?? '').trim();
  if (!endpoint) throw new Error('mint-water requires SHOAL_RPC — see this file\'s header');
  if (!cookieFile) throw new Error('mint-water requires SHOAL_COOKIE_FILE — sign_message is auth-gated');
  const cookie = readFileSync(cookieFile, 'utf8').trim();
  return {
    endpoint,
    authHeader: `Basic ${Buffer.from(`__cookie__:${cookie}`, 'utf8').toString('base64')}`,
  };
}

interface Minter {
  readonly publicKeyHex: string;
  readonly sign: (msg: Uint8Array) => Promise<Uint8Array>;
}

/** Create the water, or find it already there. Returns its bech32m id. */
async function mintSpace(auth: RpcAuth, who: Minter, nowMs: number): Promise<string> {
  const profile = await powProfileFor(auth);
  // The PoW preimage is `sha256(name)`, recomputed SERVER-side (`create_space`,
  // methods.rs) — not the `space:`-prefixed scheme `@swimchain/react`'s helper
  // mines against, which would produce a hash the node can never verify.
  const mined = await mineAndSignAction(
    ACTION_TYPE_SPACE_CREATION,
    new TextEncoder().encode(WATER_SPACE_NAME),
    who.publicKeyHex,
    who.sign,
    Math.floor(nowMs / 1000),
    profile,
  );
  const result = await rpcCall<{ space_id: string }>(auth, 'create_space', {
    name: WATER_SPACE_NAME,
    creator_id: who.publicKeyHex,
    ...mined,
  });
  return result.space_id;
}

async function main(): Promise<void> {
  const auth = authFromEnv();
  log(`node: ${auth.endpoint}`);
  log(`water: ${WATER_SPACE_NAME}  (app=${WATER_APP}, name=${WATER_NAME})`);

  const who = await nodeIdentity(auth);
  log(`minting as the node's own identity ${who.publicKeyHex.slice(0, 16)}… (${who.address})`);

  const nowMs = Date.now();
  const spaceId = await mintSpace(auth, who, nowMs);
  log(`space: ${spaceId}`);

  // NO ROOM IS MINTED HERE ANY MORE, and that is the point of plan 4d.
  //
  // This script used to mint one fixed room post and every client waited for it
  // to propagate — a measured 3 m 18 s on a fresh install, and a single room
  // that would have hit `ROOM_FETCH_LIMIT` within hours of the game being
  // played. The room is a function of the hour now (`shoalRoom.ts`), and every
  // client mints the hour it needs, idempotently, on its own node
  // (`shoalSend.mintRoom`). There is no room for this script to establish and
  // nothing for it to be the only source of.
  //
  // The SPACE is still minted here and still must be: `submit_post` rejects a
  // post into a space that does not exist on-chain (methods.rs:2266-2276), so
  // somebody has to create it once, and doing it once by hand is exactly what
  // this script is for.

  // ---------------------------------------------------------------------
  // The check that matters: the JOINER, unmodified, finds what was minted.
  // ---------------------------------------------------------------------
  //
  // `shellConfig` takes its command surface as a parameter precisely so it can
  // be driven without a Tauri shell. What runs below is the shipping function —
  // the same `list_spaces` paging, the same `(app, name)` match, the same room
  // lookup — against the node this script just wrote to. A typo in a name would
  // have produced two healthy RPC results above and `null` here.
  const joined = await shellConfig(async (cmd: string) => {
    if (cmd !== 'get_rpc_config') throw new Error(`mint-water answers only get_rpc_config, not ${cmd}`);
    return { endpoint: auth.endpoint, auth: auth.authHeader } as never;
  });

  check('the shipped joiner finds this water', joined !== null);
  check('...and it is the space that was just minted', joined?.water.spaceId === spaceId,
    { joined: joined?.water.spaceId, minted: spaceId });
  check('...and the water it derives its rooms from is the one that was minted',
    joined?.water.spaceName === WATER_SPACE_NAME, joined?.water.spaceName);
  // The binding this whole branch is about: the name that derived the space id
  // is the name every room id is derived from. Checked against the space the
  // NODE answered with, not against a second local derivation.
  check('...derived from the same name, so a room cannot belong to another space',
    (await shellWater()).spaceId === spaceId, { derived: (await shellWater()).spaceId, minted: spaceId });
  check('...swimming as this node', joined?.authorIdHex === who.publicKeyHex, joined?.authorIdHex);

  console.log(failures === 0 ? '\nMINTED — a shell on this node plays.' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
