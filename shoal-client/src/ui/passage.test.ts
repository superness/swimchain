/**
 * The granting half of the way in — plan 4b, Task 3b. Run:
 * npx tsx src/ui/passage.test.ts
 *
 * ## WHERE THIS IS CUT, AND WHY IT IS CUT THERE
 *
 * At `fetch`. Everything above it is the real thing: the real `openTheWay`, the
 * real `nodeRpcFor`, the real `SwimchainRpc` out of the installed
 * `@swimchain/react`, and the real `ensureSponsored` — its real offer selection,
 * its real SHA-256 claim proof-of-work and its real claim signature preimage.
 * A fake at any higher level would be testing a mock's opinion of onboarding.
 *
 * The consequence is that this file can check the CLAIM ITSELF, and it does,
 * independently: section 2 recomputes the proof of work from the nonce that was
 * sent, counts its leading zero bits itself, and rebuilds the 88-byte signature
 * preimage from the claim's own fields — never by calling anything the code
 * under test calls. If `ensureSponsored` mined against the wrong bytes or signed
 * the wrong message, this fails.
 *
 * ## WHAT IS STILL UNPROVEN HERE, STATED PLAINLY
 *
 * Every offer below is invented by this file. Nothing here proves that a real
 * standing offer exists on mainnet, that the game sponsor's node auto-approves
 * a Shoal claim, or that the resulting grant actually authorises a write in
 * `@shoal:main` — all three are facts about a live network and a keeper this
 * client does not run. What is proven is that when such an offer is there, this
 * client finds the right one, claims it correctly, carries its credential
 * intact, and reports the three outcomes the shell has to tell apart.
 */
import { readFileSync } from 'node:fs';
import { GAME_SPONSOR, nodeRpcFor, openTheWay } from './passage';
import type { RpcAuth } from '../lib/shoalRpc';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

// ---------------------------------------------------------------------------
// A node that answers, recorded call by call
// ---------------------------------------------------------------------------

const ENDPOINT = 'http://127.0.0.1:9736';
const COOKIE_HEX = 'deadbeefcafe';
/** Exactly what `get_rpc_config` hands the webview (src-tauri/src/main.rs:196). */
const SHELL_HEADER = `Basic ${Buffer.from(`__cookie__:${COOKIE_HEX}`).toString('base64')}`;
const AUTH: RpcAuth = { endpoint: ENDPOINT, authHeader: SHELL_HEADER };

/** A bech32m space id of the exact 37-character shape the node emits. */
const SHOAL_SPACE = `sp1${'q'.repeat(34)}`;
const OTHER_SPACE = `sp1${'q'.repeat(33)}p`;
const OTHER_SPONSOR = 'ab'.repeat(32);
const CLAIMANT = '7c'.repeat(32);
/** 64 bytes, so it is a plausible Ed25519 signature; the node is faked, so the
 *  bytes need only be recognisable when they come back. */
const SIG_HEX = Array.from({ length: 64 }, (_, i) => (i * 7 + 3) & 0xff)
  .map((b) => b.toString(16).padStart(2, '0')).join('');

interface Call {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly authorization: string | undefined;
}

interface Offer {
  offer_id: string;
  sponsor_pubkey: string;
  auto_approve?: boolean;
  slots_remaining: number;
  requirements?: { min_pow_difficulty?: number };
  space_scope?: string | null;
}

interface NodeScript {
  /** Answers to `get_sponsorship_status`, consumed in order; the last repeats. */
  readonly sponsored: readonly boolean[];
  readonly offers: readonly Offer[];
  /** When set, `claim_sponsorship_offer` answers with this JSON-RPC error. */
  readonly claimRejects?: { code: number; message: string };
}

/** Every message the identity was asked to sign, in order. */
const signedMessages: Uint8Array[] = [];

const newcomer = {
  publicKeyHex: CLAIMANT,
  sign: async (msg: Uint8Array): Promise<Uint8Array> => {
    signedMessages.push(msg.slice());
    return hexToBytes(SIG_HEX);
  },
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Install a node that follows `script`, run `body`, restore `fetch`. */
async function withNode<T>(script: NodeScript, body: (calls: Call[]) => Promise<T>): Promise<T> {
  const calls: Call[] = [];
  let statusAsks = 0;
  // Cleared on the way IN, not on the way out: the checks that read it run
  // after `withNode` has returned, and clearing in `finally` emptied it under
  // them (which read as "nothing was signed" — a passing-looking failure had
  // the assertion been the other way round).
  signedMessages.length = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    const req = JSON.parse(init?.body ?? '{}') as { method: string; params: Record<string, unknown>; id: number };
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method: req.method, params: req.params, authorization: headers.Authorization });
    const ok = (result: unknown) => new Response(
      JSON.stringify({ jsonrpc: '2.0', result, id: req.id }), { status: 200, statusText: 'OK' },
    );
    switch (req.method) {
      case 'get_sponsorship_status': {
        const i = Math.min(statusAsks++, script.sponsored.length - 1);
        return ok({ has_sponsorship: script.sponsored[i] ?? false });
      }
      case 'list_sponsorship_offers':
        return ok({ offers: script.offers });
      case 'claim_sponsorship_offer':
        if (script.claimRejects) {
          return new Response(JSON.stringify({
            jsonrpc: '2.0', error: script.claimRejects, id: req.id,
          }), { status: 200, statusText: 'OK' });
        }
        return ok({ claim_id: 'claim-1' });
      default:
        return ok({});
    }
  }) as typeof fetch;
  try {
    return await body(calls);
  } finally {
    globalThis.fetch = original;
  }
}

/** Quiet the module's own developer console line for the failure paths, so a
 *  passing run reads as a passing run. Returns whatever it captured. */
async function quietly<T>(body: () => Promise<T>): Promise<{ value: T; logged: string[] }> {
  const logged: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  try {
    return { value: await body(), logged };
  } finally {
    console.error = original;
  }
}

const shoalOffer: Offer = {
  offer_id: '11'.repeat(16),
  sponsor_pubkey: GAME_SPONSOR,
  auto_approve: true,
  slots_remaining: 40,
  requirements: { min_pow_difficulty: 8 },
  space_scope: SHOAL_SPACE,
};

// ---------------------------------------------------------------------------
// 1. The sponsor this client pins
// ---------------------------------------------------------------------------
function theSponsorIsTheOneTheNodeWillAccept(): void {
  console.log('\n1. the pinned sponsor is the one the node allows on mainnet');

  // Read out of the node's own allowlist. On mainnet an auto-approve offer from
  // anybody else is refused outright (src/rpc/methods.rs:17176-17194), so a
  // default that drifted from this list would strand every newcomer forever
  // with `strictPreferred` refusing to claim anything else.
  const rust = readFileSync(new URL('../../../src/sponsorship/genesis_list.rs', import.meta.url), 'utf8');
  check('SELF-TEST: the node\'s allowlist really was found and read',
    rust.includes('MAINNET_GAME_SPONSORS'), rust.length);
  check('the pinned sponsor is in the node\'s mainnet game-sponsor allowlist',
    rust.includes(GAME_SPONSOR), GAME_SPONSOR);
  check('NON-DEGENERACY: a key that is NOT in that list would be caught',
    !rust.includes(OTHER_SPONSOR), OTHER_SPONSOR);
  check('the pinned sponsor is a 32-byte hex public key',
    /^[0-9a-f]{64}$/.test(GAME_SPONSOR), GAME_SPONSOR);
}

// ---------------------------------------------------------------------------
// 2. A newcomer nobody has vouched for, and an offer that is open
// ---------------------------------------------------------------------------

/** Independent SHA-256 of the same 40 bytes `mineClaimPow` hashes:
 *  nonce_space(32) ++ nonce as little-endian u32. */
async function powOf(nonceSpaceHex: string, nonce: number): Promise<Uint8Array> {
  const input = new Uint8Array(40);
  input.set(hexToBytes(nonceSpaceHex), 0);
  new DataView(input.buffer).setUint32(32, nonce >>> 0, true);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

/** Leading zero BITS, counted here rather than borrowed from the code under
 *  test — the node counts bits, and a byte-counting client over-mines 8x. */
function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) { bits += 8; continue; }
    let b = byte, n = 0;
    while ((b & 0x80) === 0) { n++; b = (b << 1) & 0xff; }
    return bits + n;
  }
  return bits;
}

async function anOpenOfferIsFoundAndClaimed(): Promise<void> {
  console.log('\n2. an offer that is open is found, claimed, and waited on');

  const phases: string[] = [];
  const { calls, letIn } = await withNode(
    // Not vouched for when asked, vouched for once the claim has been approved.
    { sponsored: [false, true], offers: [shoalOffer] },
    async (calls) => {
      const letIn = await openTheWay(AUTH, newcomer, SHOAL_SPACE, (p) => { phases.push(p); });
      return { calls, letIn };
    },
  );

  check('the water now holds a vouch for this swimmer', letIn === true, letIn);

  const methods = calls.map((c) => c.method);
  check('NON-DEGENERACY: the standing was asked about before anything was claimed',
    methods[0] === 'get_sponsorship_status', methods);
  check('an offer listing was fetched', methods.includes('list_sponsorship_offers'), methods);
  const claim = calls.find((c) => c.method === 'claim_sponsorship_offer');
  check('a claim was submitted', claim !== undefined, methods);
  check('...and the standing was asked about AGAIN afterwards, so "let in" is the '
    + 'node\'s answer and not this client\'s assumption',
    methods.lastIndexOf('get_sponsorship_status') > methods.indexOf('claim_sponsorship_offer'), methods);

  // The three beats really were reported, in order, and are the strings
  // `wayIn.passageFor` maps. This is the wiring the shell draws from.
  check('all three phases were reported, in order',
    phases.length === 3 && phases[0] === 'Finding a sponsor'
    && phases[1] === 'Requesting sponsorship (proof-of-work)'
    && phases[2] === 'Waiting for approval', phases);

  if (claim === undefined) return;
  const p = claim.params as Record<string, string | number>;

  check('the claim names the offer that was open', p.offer_id === shoalOffer.offer_id, p.offer_id);
  check('...and this swimmer as the claimant', p.claimant_pubkey === CLAIMANT, p.claimant_pubkey);
  check('...at the difficulty the offer asked for',
    p.pow_difficulty === 8, p.pow_difficulty);

  // THE PROOF OF WORK, RECOMPUTED HERE. Nothing below calls anything the code
  // under test called: the digest is taken again from the nonce that was sent,
  // and the bit count is written out longhand above.
  const recomputed = await powOf(String(p.pow_nonce_space), Number(p.pow_nonce));
  check('the proof of work really is sha256(nonce_space ++ nonce_le) of what was sent',
    bytesToHex(recomputed) === p.pow_hash, { sent: p.pow_hash, recomputed: bytesToHex(recomputed) });
  check('...and it really does carry the leading zero BITS the offer demanded',
    leadingZeroBits(recomputed) >= 8, leadingZeroBits(recomputed));
  check('NON-DEGENERACY: the bit counter is not a constant — a hash starting 0xff '
    + 'has none', leadingZeroBits(new Uint8Array([0xff, 0, 0])) === 0);

  // THE SIGNATURE PREIMAGE, REBUILT HERE from the claim's own fields:
  // offer_id(16) ++ claimant(32) ++ timestamp(8, big-endian) ++ pow_hash(32).
  const expected = new Uint8Array(88);
  expected.set(hexToBytes(String(p.offer_id)), 0);
  expected.set(hexToBytes(String(p.claimant_pubkey)), 16);
  new DataView(expected.buffer).setBigUint64(48, BigInt(Number(p.timestamp)), false);
  expected.set(hexToBytes(String(p.pow_hash)), 56);

  check('exactly one message was signed', signedMessages.length === 1, signedMessages.length);
  const signed = signedMessages[0];
  check('the signed message is 88 bytes', signed?.length === 88, signed?.length);
  check('the signed message is offer_id ++ claimant ++ timestamp(BE) ++ pow_hash, '
    + 'rebuilt independently from what was sent',
    signed !== undefined && bytesToHex(signed) === bytesToHex(expected),
    { signed: signed && bytesToHex(signed), expected: bytesToHex(expected) });
  check('...and the signature that went out is the one that came back from signing',
    p.signature === SIG_HEX, p.signature);

  // NON-DEGENERACY for the preimage check: a big-endian timestamp is not a
  // little-endian one, so the comparison above can actually fail.
  const wrongEndian = expected.slice();
  new DataView(wrongEndian.buffer).setBigUint64(48, BigInt(Number(p.timestamp)), true);
  check('NON-DEGENERACY: the same preimage with a little-endian timestamp differs',
    bytesToHex(wrongEndian) !== bytesToHex(expected));
}

// ---------------------------------------------------------------------------
// 3. A newcomer who is already in
// ---------------------------------------------------------------------------
async function aSwimmerAlreadyVouchedForCostsOneCallAndSaysNothing(): Promise<void> {
  console.log('\n3. a swimmer the water already holds a vouch for');

  const phases: string[] = [];
  const { calls, letIn } = await withNode({ sponsored: [true], offers: [shoalOffer] }, async (calls) => {
    const letIn = await openTheWay(AUTH, newcomer, SHOAL_SPACE, (p) => { phases.push(p); });
    return { calls, letIn };
  });

  check('they are let in', letIn === true, letIn);
  check('it cost exactly one call', calls.length === 1, calls.map((c) => c.method));
  check('...which was the standing question', calls[0]?.method === 'get_sponsorship_status', calls[0]?.method);
  // THIS IS WHAT KEEPS A BOUNDARY FROM FLASHING AT EVERY LAUNCH. `App.tsx`
  // enters the passage from `onPhase` alone precisely because this is silent.
  check('NOT ONE PHASE IS REPORTED, so the shell draws no boundary at all',
    phases.length === 0, phases);
  check('and nothing was signed', signedMessages.length === 0, signedMessages.length);
}

// ---------------------------------------------------------------------------
// 4. The three ways it does not work
// ---------------------------------------------------------------------------
async function theWaysItDoesNotWork(): Promise<void> {
  console.log('\n4. no offer, the wrong offer, and a claim the node refuses');

  // (a) Nothing open at all.
  {
    const phases: string[] = [];
    const { value: { calls, letIn } } = await quietly(() => withNode(
      { sponsored: [false], offers: [] },
      async (calls) => ({ calls, letIn: await openTheWay(AUTH, newcomer, SHOAL_SPACE, (p) => { phases.push(p); }) }),
    ));
    check('with nothing open, the swimmer is not let in', letIn === false, letIn);
    check('...and nothing was claimed',
      !calls.some((c) => c.method === 'claim_sponsorship_offer'), calls.map((c) => c.method));
    check('...but a beat WAS reported first, which is what lets the shell conclude '
      + 'the standing rather than nothing', phases.length > 0, phases);
  }

  // (b) Offers exist, but none of them is this game's. `strictPreferred` is
  //     what makes both of these skips mandatory rather than a preference —
  //     the 2026-07-18 hang was a player landing on a stranger's stale offer.
  {
    const decoys: Offer[] = [
      // Right space, WRONG sponsor.
      { offer_id: '22'.repeat(16), sponsor_pubkey: OTHER_SPONSOR, auto_approve: true,
        slots_remaining: 99, space_scope: SHOAL_SPACE },
      // Right sponsor, WRONG space — another game's offer, which a Shoal player
      // must not drain and could not write with anyway.
      { offer_id: '33'.repeat(16), sponsor_pubkey: GAME_SPONSOR, auto_approve: true,
        slots_remaining: 99, space_scope: OTHER_SPACE },
      // Right sponsor, right space, NO SLOTS.
      { offer_id: '44'.repeat(16), sponsor_pubkey: GAME_SPONSOR, auto_approve: true,
        slots_remaining: 0, space_scope: SHOAL_SPACE },
    ];
    const { value: { calls, letIn } } = await quietly(() => withNode(
      { sponsored: [false], offers: decoys },
      async (calls) => ({ calls, letIn: await openTheWay(AUTH, newcomer, SHOAL_SPACE) }),
    ));
    check('an offer from another sponsor, another game, or with no slots is not claimed',
      letIn === false && !calls.some((c) => c.method === 'claim_sponsorship_offer'),
      calls.map((c) => c.method));

    // POSITIVE CONTROL: add this game's own offer to the same list and it IS
    // found. Without this, (b) would pass for a client that never claims
    // anything at all.
    const { calls: calls2, letIn: letIn2 } = await withNode(
      { sponsored: [false, true], offers: [...decoys, shoalOffer] },
      async (calls) => ({ calls, letIn: await openTheWay(AUTH, newcomer, SHOAL_SPACE) }),
    );
    const claimed = calls2.find((c) => c.method === 'claim_sponsorship_offer');
    check('POSITIVE CONTROL: this game\'s own offer in the same list IS claimed',
      letIn2 === true && claimed?.params.offer_id === shoalOffer.offer_id,
      claimed?.params.offer_id);
  }

  // (c) The node refuses the claim.
  {
    const { value: { calls, letIn }, logged } = await quietly(() => withNode(
      { sponsored: [false], offers: [shoalOffer], claimRejects: { code: -32602, message: 'Invalid params' } },
      async (calls) => ({ calls, letIn: await openTheWay(AUTH, newcomer, SHOAL_SPACE) }),
    ));
    check('a refused claim is not a swimmer who got in', letIn === false, letIn);
    check('...and it did not then sit waiting for an approval that is not coming',
      !calls.slice(calls.findIndex((c) => c.method === 'claim_sponsorship_offer') + 1)
        .some((c) => c.method === 'get_sponsorship_status'), calls.map((c) => c.method));
    check('...and the reason went to the developer channel rather than nowhere',
      logged.some((l) => l.includes('[shoal]')), logged);
  }
}

// ---------------------------------------------------------------------------
// 5. The credential survives the adapter
// ---------------------------------------------------------------------------
async function theShellsCredentialReachesTheNodeIntact(): Promise<void> {
  console.log('\n5. the shell\'s own Authorization header, byte for byte');

  const { calls } = await withNode({ sponsored: [false, true], offers: [shoalOffer] }, async (calls) => {
    await openTheWay(AUTH, newcomer, SHOAL_SPACE);
    return { calls };
  });

  check('NON-DEGENERACY: calls were actually made', calls.length >= 3, calls.length);
  // THE WHOLE JUSTIFICATION FOR `nodeRpcFor`. It decodes the shell's header into
  // a username and password and `SwimchainRpc` rebuilds it — this is the check
  // that says the round trip loses nothing for the one header this shell emits.
  const wrong = calls.filter((c) => c.authorization !== SHELL_HEADER);
  check('every sponsorship call carried the shell\'s header unchanged',
    wrong.length === 0, wrong.map((c) => ({ method: c.method, authorization: c.authorization })));
  check('...and that header really is the shell\'s cookie form',
    SHELL_HEADER.startsWith('Basic ')
    && Buffer.from(SHELL_HEADER.slice(6), 'base64').toString() === `__cookie__:${COOKIE_HEX}`,
    SHELL_HEADER);

  // A header this path cannot carry is LOUD, not silently unauthenticated —
  // stricter than the reference shell, and the reason is in the module header:
  // a node answers reads without auth, so silence here surfaces much later as
  // something else entirely.
  const { value: { threw, calls: none } } = await quietly(() => withNode(
    { sponsored: [false], offers: [shoalOffer] },
    async (calls) => {
      let threw = false;
      try {
        nodeRpcFor({ endpoint: ENDPOINT, authHeader: 'Bearer something-else' });
      } catch {
        threw = true;
      }
      return { threw, calls };
    },
  ));
  check('a header that is not Basic is refused outright', threw, threw);
  check('...having made no unauthenticated call on the way', none.length === 0, none.length);

  // No header at all is legitimate (a node with auth off) and must NOT throw.
  let unauthed: string | undefined = 'not-set';
  await withNode({ sponsored: [true], offers: [] }, async (calls) => {
    await openTheWay({ endpoint: ENDPOINT, authHeader: null }, newcomer, SHOAL_SPACE);
    unauthed = calls[0]?.authorization;
    return calls;
  });
  check('a node with no credential at all is called with no Authorization header',
    unauthed === undefined, unauthed);
}

// ---------------------------------------------------------------------------
// 6. The space id has to be the form the node compares against
// ---------------------------------------------------------------------------
async function aHexSpaceIdIsRefusedRatherThanMisdiagnosed(): Promise<void> {
  console.log('\n6. a space id in the wrong form is refused, not misdiagnosed');

  // `space_scope` always comes back bech32m (encode_space_id, methods.rs:17031)
  // and the match is a string compare, so a hex space id would match no offer
  // and the failure would read "the game sponsor has no open slots" — a
  // sentence about the sponsor, describing a bug in the caller.
  const hexSpace = 'a06a93a6' + '00'.repeat(12);
  const { value: { calls, letIn }, logged } = await quietly(() => withNode(
    { sponsored: [false], offers: [shoalOffer] },
    async (calls) => ({ calls, letIn: await openTheWay(AUTH, newcomer, hexSpace) }),
  ));

  check('a hex space id does not get a swimmer in', letIn === false, letIn);
  check('...and it never reaches the node at all', calls.length === 0, calls.map((c) => c.method));
  check('...and it says the space id is the problem, not the sponsor',
    logged.some((l) => l.includes('bech32m')), logged);
}

async function main(): Promise<void> {
  theSponsorIsTheOneTheNodeWillAccept();
  await anOpenOfferIsFoundAndClaimed();
  await aSwimmerAlreadyVouchedForCostsOneCallAndSaysNothing();
  await theWaysItDoesNotWork();
  await theShellsCredentialReachesTheNodeIntact();
  await aHexSpaceIdIsRefusedRatherThanMisdiagnosed();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
