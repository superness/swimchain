/**
 * The Shoal — TWO NODES ACROSS AN HOUR BOUNDARY (plan "the shallows", Task 2).
 *
 * `scripts/two-client-smoke.ts` proves two peered nodes fold one sea WITHIN an
 * epoch. This proves the thing that one could not: that the epoch BOUNDARY is
 * crossed without the two clients parting company — one client rolls the hour
 * and publishes its checkpoint, a client that was never there adopts it off the
 * OTHER node, and the two fold to identical fingerprints.
 *
 * That is open item 12 (Blocker 12): `advance` returned `{ loop, rolled }` and
 * the shell discarded `rolled`, so nothing published a checkpoint and nothing
 * adopted one. A client that ran through the hour kept every swimmer's size; a
 * client that joined after saw everyone back at START_SIZE.
 *
 * ── How to start the two nodes ─────────────────────────────────────────────
 *
 * Exactly as `two-client-smoke.ts` documents (two data dirs, two port pairs,
 * peered with `--connect`), and with the same environment:
 *
 *   SHOAL_RPC_A=http://127.0.0.1:29736 \
 *   SHOAL_COOKIE_A=/tmp/shoal-a-regtest/.cookie \
 *   SHOAL_RPC_B=http://127.0.0.1:29746 \
 *   SHOAL_COOKIE_B=/tmp/shoal-b-regtest/.cookie \
 *   npm run smoke:checkpoint
 *
 * Not part of `npm test`: it needs two live nodes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW THE HOUR IS COMPRESSED, AND WHY THAT IS STILL A FAIR TEST
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An epoch is EPOCH_MS = 3_600_000 ms, so waiting for a real boundary would
 * make this a run of up to an hour. It is compressed, and the compression is
 * confined to ONE quantity:
 *
 *   **The sea clock is a PARAMETER, not a clock.** `advance(loop, entries,
 *   toMs)` and `foldShoal(log, untilMs, …)` read no clock at all — this plan's
 *   global constraint is that nothing in `src/lib/` may — so the fold is
 *   bit-identical whether `toMs` arrives by waiting an hour or by being passed.
 *   This script passes `epochEndMs(E)`, and the rollover it triggers is the
 *   same code path, on the same absolute epoch grid, as the one a client
 *   running at :00 takes.
 *
 * EVERYTHING THAT TOUCHES THE CHAIN STAYS REAL, and that is the half a fake
 * clock could actually invalidate:
 *
 *  - every move is a real `submit_reply`, mined (Argon2id) and signed, whose
 *    body carries the real `ms` it was authored at, inside the CURRENT epoch;
 *  - every action timestamp is the real one, inside the node's own validity
 *    window (600 s back, 60 s forward — action_pow.rs:79-82), so nothing here
 *    is accepted that a real client's write would not be;
 *  - the checkpoint is a real `submit_reply` too, gossiped over the real P2P
 *    link, and read back from the OTHER node's `get_replies`;
 *  - the epoch crossed is a REAL epoch on the absolute grid (E -> E+1), not a
 *    synthetic one.
 *
 * So what is skipped is 3_600_000 ms of a fold that has nothing to fold —
 * every entry in the room is authored in the first seconds of the run — and
 * nothing else. The one thing this cannot show is a client's behaviour at a
 * boundary reached by the passage of real time; there is no code path
 * difference (`step(wallMs)` passes the caller's clock straight into
 * `advance`), and `src/ui/chainSea.test.ts` section 4 drives the shell itself
 * across a boundary the same way.
 *
 * WHEN THE RUN REFUSES. The moves must land in epoch E and the fish must have
 * DEPARTED by E's end, or the checkpoint carries live swimmers whose whole
 * history the next epoch's warm-up would reconstruct anyway — a test that
 * could pass with adoption switched off. So the run requires at least
 * PRESENCE_TTL_MS + a margin of epoch left, and refuses (loudly, exit 2) in
 * the last few minutes of an hour. Re-run it a minute later.
 *
 * `scripts/` may read a clock and use floats (global constraint); `src/lib/`
 * may not, and nothing here leaks into it.
 */
import { readFileSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';

import { rpcCall, type RpcAuth } from '../src/lib/shoalRpc';
import {
  ACTION_TYPE_POST,
  ACTION_TYPE_SPACE_CREATION,
  mineAndSignAction,
  powProfileFor,
  sendCheckpoint,
  sendEat,
  sendPresence,
  type SendCtx,
  type SignFn,
} from '../src/lib/shoalSend';
import { fetchRoom } from '../src/lib/shoalRoom';
import { adoptCheckpoint } from '../src/lib/adopt';
import { advance, createLoop } from '../src/lib/shoalLoop';
import { epochEndMs, epochOf, epochStartMs } from '../src/lib/epoch';
import { serialiseCheckpoint } from '../src/lib/checkpoint';
import { encodeCheckpoint } from '../src/lib/shoalWire';
import { cellCentre, cellIndex } from '../src/lib/bloom';
import { fingerprint } from '../src/lib/shoalFixtures';
import { EPOCH_MS, MIN_SIZE, PRESENCE_TTL_MS, START_SIZE } from '../src/lib/shoalConst';
import type { Checkpoint, LogEntry } from '../src/lib/shoalTypes';

// ---------------------------------------------------------------------------
// Check harness
// ---------------------------------------------------------------------------

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) console.log(`PASS: ${name}`);
  else { failures++; console.log(`FAIL: ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`); }
}

function log(msg: string): void {
  console.log(`[cp] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => { setTimeout(r, ms); });
}

async function waitUntil(pred: () => Promise<boolean>, timeoutMs: number, stepMs = 400): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await pred()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(stepMs);
  }
}

// ---------------------------------------------------------------------------
// Identities — client-side only; neither node ever holds either key
// ---------------------------------------------------------------------------

interface Player {
  readonly label: string;
  readonly publicKeyHex: string;
  readonly sign: SignFn;
}

function playerFromSeed(label: string, seed: Buffer): Player {
  const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
  const priv = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return {
    label,
    publicKeyHex: spki.subarray(spki.length - 32).toString('hex'),
    sign: async (msg: Uint8Array): Promise<Uint8Array> => new Uint8Array(edSign(null, Buffer.from(msg), priv)),
  };
}

function player(label: string): Player {
  return playerFromSeed(label, createHash('sha256').update(`shoal-cp:${label}`).digest());
}

// ---------------------------------------------------------------------------
// Sponsorship — the dev/testnet genesis identity, network-gated off mainnet
// ---------------------------------------------------------------------------

const GENESIS_SEED_HEX = '11b0b8c92806d893c77b547b87ad5763cb1005104ba13086e0bf184e3a277471';

function mineOnboardingPow(salt: string): { nonceSpaceHex: string; nonce: number } {
  const nonceSpace = createHash('sha256').update(`shoal-cp-onboard:${salt}:${Date.now()}`).digest();
  for (let nonce = 0; ; nonce++) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(BigInt(nonce));
    if (createHash('sha256').update(Buffer.concat([nonceSpace, buf])).digest()[0] === 0) {
      return { nonceSpaceHex: nonceSpace.toString('hex'), nonce };
    }
  }
}

async function sponsorViaGenesis(auth: RpcAuth, genesis: Player, sponsee: Player): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const msg = Buffer.alloc(40);
  Buffer.from(sponsee.publicKeyHex, 'hex').copy(msg, 0);
  msg.writeBigUInt64BE(BigInt(timestamp), 32);
  const signature = Buffer.from(await genesis.sign(new Uint8Array(msg))).toString('hex');
  const pow = mineOnboardingPow(sponsee.label);
  try {
    await rpcCall(auth, 'register_sponsored_identity', {
      new_identity_pubkey: sponsee.publicKeyHex,
      sponsor_pubkey: genesis.publicKeyHex,
      sponsor_signature: signature,
      timestamp,
      probationary: false,
      pow_nonce_space: pow.nonceSpaceHex,
      pow_nonce: pow.nonce,
    });
    return 'registered';
  } catch (err) {
    if (err instanceof Error && err.message.includes('already registered')) return 'already';
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Room setup
// ---------------------------------------------------------------------------

const SPACE_NAME = '@shoal:cp';

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

async function createOrReuseSpace(auth: RpcAuth, p: Player, nowMs: number): Promise<string> {
  const profile = await powProfileFor(auth);
  const mined = await mineAndSignAction(
    ACTION_TYPE_SPACE_CREATION, new TextEncoder().encode(SPACE_NAME),
    p.publicKeyHex, p.sign, Math.floor(nowMs / 1000), profile,
  );
  const result = await rpcCall<{ space_id: string }>(auth, 'create_space', {
    name: SPACE_NAME, creator_id: p.publicKeyHex, ...mined,
  });
  return result.space_id;
}

/** A FRESH room per run. The room post never rotates, so reusing one would mix
 *  a previous run's moves and checkpoints into this run's epoch and make the
 *  assertions depend on history this script did not write. */
async function createRoom(
  auth: RpcAuth, p: Player, spaceId: string, title: string, body: string, nowMs: number,
): Promise<string> {
  const profile = await powProfileFor(auth);
  const mined = await mineAndSignAction(
    ACTION_TYPE_POST, new TextEncoder().encode(`${title}\n\n${body}`),
    p.publicKeyHex, p.sign, Math.floor(nowMs / 1000), profile,
  );
  const result = await rpcCall<{ content_id: string }>(auth, 'submit_post', {
    space_id: spaceId, title, body, author_id: p.publicKeyHex, ...mined,
  });
  const derived = `sha256:${sha256Hex(`${title}\n\n${body}`)}`;
  if (result.content_id !== derived) {
    throw new Error(`room content id mismatch: node said ${result.content_id}, we derived ${derived}`);
  }
  return result.content_id;
}

function authFrom(rpcEnv: string, cookieEnv: string): RpcAuth {
  const endpoint = (process.env[rpcEnv] ?? '').trim();
  if (!endpoint) throw new Error(`two-client-checkpoint requires ${rpcEnv} — see this file's header`);
  const cookieFile = (process.env[cookieEnv] ?? '').trim();
  const authHeader = cookieFile
    ? `Basic ${Buffer.from(`__cookie__:${readFileSync(cookieFile, 'utf8').trim()}`, 'utf8').toString('base64')}`
    : null;
  return { endpoint, authHeader };
}

interface NodeInfo { network?: string; node_id?: string; p2p_port?: number; peer_count?: number }

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const authA = authFrom('SHOAL_RPC_A', 'SHOAL_COOKIE_A');
  const authB = authFrom('SHOAL_RPC_B', 'SHOAL_COOKIE_B');
  log(`node A = ${authA.endpoint}`);
  log(`node B = ${authB.endpoint}`);

  const infoA = await rpcCall<NodeInfo>(authA, 'get_info', {});
  const infoB = await rpcCall<NodeInfo>(authB, 'get_info', {});
  check('both endpoints are regtest nodes',
    infoA.network === 'regtest' && infoB.network === 'regtest', [infoA.network, infoB.network]);
  check('two DIFFERENT nodes, not one node twice',
    !!infoA.node_id && infoA.node_id !== infoB.node_id, [infoA.node_id, infoB.node_id]);
  check('each node has at least one peer', (infoA.peer_count ?? 0) > 0 && (infoB.peer_count ?? 0) > 0,
    [infoA.peer_count, infoB.peer_count]);

  // ── the epoch this run will cross ─────────────────────────────────────────
  const startedMs = Date.now();
  const EPOCH = epochOf(startedMs);
  const leftMs = epochEndMs(EPOCH) - startedMs;
  const intoMs = startedMs - epochStartMs(EPOCH);
  // The fish must be gone before the boundary, or the next epoch's warm-up
  // reconstructs them and adoption would change nothing (see the header).
  const NEED_LEFT_MS = PRESENCE_TTL_MS + 120_000;
  log(`epoch ${EPOCH}: ${Math.round(intoMs / 1000)} s in, ${Math.round(leftMs / 1000)} s left of ${EPOCH_MS / 1000}`);
  if (leftMs < NEED_LEFT_MS || intoMs < 5_000) {
    console.error(
      `\nREFUSING TO RUN: this run needs at least ${NEED_LEFT_MS / 1000} s left in the hour `
      + `(has ${Math.round(leftMs / 1000)} s) and at least 5 s elapsed (has ${Math.round(intoMs / 1000)} s), `
      + 'so its swimmers have time to depart before the boundary. Re-run in a minute.',
    );
    process.exit(2);
  }

  // ── identities ────────────────────────────────────────────────────────────
  const genesis = playerFromSeed('genesis', Buffer.from(GENESIS_SEED_HEX, 'hex'));
  const pa = player('a');
  const pb = player('b');
  check('the two swimmers are different identities', pa.publicKeyHex !== pb.publicKeyHex);
  for (const [name, auth] of [['A', authA], ['B', authB]] as const) {
    for (const p of [pa, pb]) {
      const r = await sponsorViaGenesis(auth, genesis, p);
      log(`sponsorship of ${p.label} on node ${name}: ${r}`);
    }
  }

  // ── space and a FRESH room ────────────────────────────────────────────────
  const spaceId = await createOrReuseSpace(authA, pa, Date.now());
  log(`space ${spaceId}`);
  const runId = String(startedMs);
  const roomId = await createRoom(
    authA, pa, spaceId, 'The Shoal (checkpoint proof)', `run ${runId}`, Date.now(),
  );
  log(`room ${roomId}`);
  const roomOnB = await waitUntil(async () => {
    try { await rpcCall(authB, 'get_content', { content_id: roomId }); return true; } catch { return false; }
  }, 30_000);
  check('node B received the room post over the P2P link — it was never given it', roomOnB);

  const profileA = await powProfileFor(authA);
  const profileB = await powProfileFor(authB);
  const ctxA: SendCtx = {
    auth: authA, spaceId, roomContentId: roomId,
    authorIdHex: pa.publicKeyHex, sign: pa.sign, powProfile: profileA,
  };
  const ctxB: SendCtx = {
    auth: authB, spaceId, roomContentId: roomId,
    authorIdHex: pb.publicKeyHex, sign: pb.sign, powProfile: profileB,
  };

  // ── four real moves: two swimmers, each on its own bloom cell, each eating ──
  // FAR APART, and that is not arbitrary. `markVisits` stamps every cell within
  // BLOOM_VISIT_R (200 cu) of a swimmer and `isBloomReady` denies a cell that
  // somebody ELSE has visited inside BLOOM_READY_MS, so two swimmers on
  // ADJACENT cells (128 cu) trample each other's food: measured on the first
  // run of this script, whoever claimed second was refused and stayed at
  // START_SIZE. That is the engine behaving correctly; the fixture was wrong.
  const cellA = cellIndex(1_024, 768);
  const cellB = cellIndex(3_072, 2_304);
  const cA = cellCentre(cellA);
  const cB = cellCentre(cellB);

  const hashes: string[] = [];
  const t1 = Date.now();
  hashes.push(await sendPresence(ctxA, { x: cA.x, y: cA.y, heading: 0, speed: 0, t: t1 }));
  const t2 = Date.now();
  hashes.push(await sendPresence(ctxB, { x: cB.x, y: cB.y, heading: 0, speed: 0, t: t2 }));
  const t3 = Date.now();
  hashes.push(await sendEat(ctxA, cellA, t3));
  const t4 = Date.now();
  hashes.push(await sendEat(ctxB, cellB, t4));
  log(`four moves authored at ${t1}, ${t2}, ${t3}, ${t4}`);

  // Both nodes must hold ALL FOUR before either client rolls. Two clients that
  // close an hour holding different entry sets legitimately publish different
  // checkpoints (shoalLoop.ts section 2), so this wait is what makes the
  // agreement assertion below mean something.
  const haveAll = async (auth: RpcAuth): Promise<boolean> => {
    const room = await fetchRoom(auth, spaceId, roomId);
    return hashes.every((h) => room.log.some((e) => e.hash === h));
  };
  const bothHaveAll = await waitUntil(async () => (await haveAll(authA)) && (await haveAll(authB)), 60_000);
  check('both nodes serve all four moves — gossip carried each client\'s writes to the other',
    bothHaveAll);

  const roomA = await fetchRoom(authA, spaceId, roomId);
  const roomB0 = await fetchRoom(authB, spaceId, roomId);
  const hashesOf = (l: LogEntry[]) => l.map((e) => e.hash).sort().join(',');
  check('the two nodes serve the SAME log, entry for entry',
    hashesOf(roomA.log) === hashesOf(roomB0.log),
    { a: roomA.log.length, b: roomB0.log.length });

  // ── non-degeneracy: the bites really landed, before anything is compared ──
  const midMs = Math.max(t4, t3) + 1_000;
  const midA = advance(createLoop(EPOCH, null), roomA.log, midMs).loop.state;
  check('NON-DEGENERACY: both swimmers are in the sea', midA.fish.size === 2, midA.fish.size);
  check('NON-DEGENERACY: A\'s bite was credited on its cell', midA.bitesTaken.get(cellA) === 1,
    midA.bitesTaken.get(cellA));
  check('NON-DEGENERACY: B\'s bite was credited on its cell', midA.bitesTaken.get(cellB) === 1,
    midA.bitesTaken.get(cellB));
  check('NON-DEGENERACY: and both grew past START_SIZE on it',
    (midA.fish.get(pa.publicKeyHex)?.size ?? 0) > START_SIZE
      && (midA.fish.get(pb.publicKeyHex)?.size ?? 0) > START_SIZE,
    [midA.fish.get(pa.publicKeyHex)?.size, midA.fish.get(pb.publicKeyHex)?.size]);

  // ── ROLL THE HOUR, on both clients, from their own node's log ─────────────
  const boundaryMs = epochEndMs(EPOCH);
  const advA = advance(createLoop(EPOCH, null), roomA.log, boundaryMs);
  const advB = advance(createLoop(EPOCH, null), roomB0.log, boundaryMs);
  check('client A rolled epoch ' + EPOCH, advA.rolled !== null && advA.rolled.epoch === EPOCH,
    advA.rolled?.epoch);
  check('client B rolled it too', advB.rolled !== null && advB.rolled.epoch === EPOCH, advB.rolled?.epoch);

  const cpA = advA.rolled as Checkpoint;
  const cpB = advB.rolled as Checkpoint;
  const payloadA = serialiseCheckpoint(cpA);
  log(`checkpoint payload: ${payloadA}`);
  check('CANONICALITY: two clients on two nodes computed the IDENTICAL payload',
    payloadA === serialiseCheckpoint(cpB), { a: payloadA, b: serialiseCheckpoint(cpB) });
  check('the checkpoint names both swimmers', cpA.sizes.length === 2, cpA.sizes);
  check('NON-DEGENERACY: and carries sizes that are not START_SIZE — a real hour of '
    + 'eating and hunger, banked at the MIN_SIZE floor',
    cpA.sizes.every(([, s]) => s !== START_SIZE && s === MIN_SIZE), cpA.sizes);

  // The bodies must DIFFER even though the payloads agree: each carries its own
  // author's salt, which is what keeps two agreeing publishers from collapsing
  // into one chain object (shoalWire.ts's salt decision).
  const bodyA = encodeCheckpoint(cpA, pa.publicKeyHex);
  const bodyB = encodeCheckpoint(cpB, pb.publicKeyHex);
  check('the two BODIES differ (each salted with its own author key)…', bodyA !== bodyB);
  check('…while ending in the identical payload — agreement is a payload comparison',
    bodyA.endsWith(payloadA) && bodyB.endsWith(payloadA));

  // ── PUBLISH, from both clients, onto their own nodes ──────────────────────
  const cpHashA = await sendCheckpoint(ctxA, cpA, Date.now());
  const cpHashB = await sendCheckpoint(ctxB, cpB, Date.now());
  log(`published: A ${cpHashA}, B ${cpHashB}`);
  check('two distinct chain objects for one agreed fact', cpHashA !== cpHashB);

  const bothVisible = await waitUntil(async () => {
    const r = await fetchRoom(authB, spaceId, roomId);
    return r.checkpoints.some((c) => c.hash === cpHashA) && r.checkpoints.some((c) => c.hash === cpHashB);
  }, 60_000);
  check('node B serves BOTH checkpoints — A\'s arrived over gossip', bothVisible);

  // ── THE JOINER: a client that was never here, reading node B only ─────────
  const roomB = await fetchRoom(authB, spaceId, roomId);
  check('the checkpoints did not leak into the fold\'s log',
    roomB.log.length === roomA.log.length, { log: roomB.log.length, cps: roomB.checkpoints.length });

  const adoption = adoptCheckpoint(roomB.checkpoints, EPOCH + 1);
  check('the joiner sees ONE opinion, not two', adoption.opinions.length === 1,
    adoption.opinions.length);
  check('…backed by two independent publishers', adoption.opinions[0]?.voters.length === 2,
    adoption.opinions[0]?.voters);
  check('…so there is no divergence to report', adoption.diverged === false);
  check('…and it adopts exactly the payload both clients computed',
    adoption.seed !== null && serialiseCheckpoint(adoption.seed) === payloadA);

  const TARGET = epochStartMs(EPOCH + 1) + 10_000;
  const joined = advance(createLoop(EPOCH + 1, adoption.seed), roomB.log, TARGET).loop.state;
  const stayed = advance(advA.loop, roomA.log, TARGET).loop.state;
  check('THE PROOF: the client that crossed the hour and the client that joined after it '
    + 'fold to IDENTICAL fingerprints',
    fingerprint(stayed) === fingerprint(joined),
    { stayed: fingerprint(stayed), joined: fingerprint(joined) });
  check('…and both remember both swimmers at the size they left',
    stayed.departed.size === 2 && joined.departed.size === 2
      && [...joined.departed.values()].every((d) => d.size === MIN_SIZE),
    { stayed: stayed.departed.size, joined: joined.departed.size });

  // ── THE CONTROL: what the same joiner does with no checkpoint ─────────────
  const unseeded = advance(createLoop(EPOCH + 1, null), roomB.log, TARGET).loop.state;
  check('CONTROL: an unseeded joiner remembers NOBODY — the world adoption exists to prevent',
    unseeded.departed.size === 0 && unseeded.fish.size === 0,
    { departed: unseeded.departed.size, fish: unseeded.fish.size });
  check('CONTROL: so the comparison above was not comparing two identical nothings',
    fingerprint(unseeded) !== fingerprint(stayed));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
