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
  submitToRoom,
  type SendCtx,
  type SignFn,
} from '../src/lib/shoalSend';
import { fetchRoom } from '../src/lib/shoalRoom';
import { adoptCheckpoint } from '../src/lib/adopt';
import { advance, createLoop } from '../src/lib/shoalLoop';
import { epochEndMs, epochOf, epochStartMs } from '../src/lib/epoch';
import { serialiseCheckpoint } from '../src/lib/checkpoint';
import { decodeCheckpointBody, encodeCheckpoint } from '../src/lib/shoalWire';
import { cellCentre, cellIndex } from '../src/lib/bloom';
import { fingerprint } from '../src/lib/shoalFixtures';
import { EAT_COOLDOWN_MS, EPOCH_MS, MIN_SIZE, PRESENCE_TTL_MS, START_SIZE } from '../src/lib/shoalConst';
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
  // PRESENCE_TTL_MS for the swimmers to depart, plus a margin that now has to
  // cover 14 mined writes rather than 4 (six bites each — see the fixture).
  const NEED_LEFT_MS = PRESENCE_TTL_MS + 240_000;
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

  // ── two swimmers, each on its own bloom cell, 512 cu apart ────────────────
  //
  // THE SEPARATION IS A NARROW BAND, and both edges of it were measured.
  //
  // NOT TOO CLOSE. `markVisits` stamps every cell within BLOOM_VISIT_R (200 cu)
  // of a swimmer and `isBloomReady` denies a cell somebody ELSE has visited
  // inside BLOOM_READY_MS, so two swimmers on adjacent cells (128 cu) trample
  // each other's food: measured on this script's first run, whoever claimed
  // second was refused and stayed at START_SIZE. 512 cu is past 2 *
  // BLOOM_VISIT_R (400), so neither stamps the other's cell.
  //
  // NOT TOO FAR, which is the edge this fixture used to be on the wrong side of.
  // At the old corners-of-the-world placement (2_560 cu apart) BOTH swimmers sat
  // outside CORE_R of the median, tension climbed to TENSION_TRIGGER in about
  // 30 s, and the hush swept them — repeatedly, since nothing calmed down. Each
  // sweep costs SCATTER_COST and voids the whole recent foraging trip, so both
  // swimmers landed on the MIN_SIZE floor no matter how much they ate, and the
  // checkpoint could not carry a real number. Measured across separations at
  // six bites each: 384 cu -> 88, 512 -> 88, 640 -> 60, 768 -> 60, 1_024 -> 60,
  // 2_560 -> 60. The cliff is between 512 and 640; 512 sits below it with the
  // bloom constraint still satisfied.
  //
  // Two swimmers can never shelter each other (SHELTER_THRESHOLD is three plain
  // neighbours, by design — spec 2.11's floor of three), so staying inside the
  // core is the only lever a two-player fixture has, and it is the honest one:
  // the pair is not being exempted from the hush, it is simply not provoking it.
  const cellA = cellIndex(2_048 - 256, 1_536);
  const cellB = cellIndex(2_048 + 256, 1_536);
  const cA = cellCentre(cellA);
  const cB = cellCentre(cellB);

  // ── SIX BITES EACH, NOT ONE, AND THE BITE TIMES ARE CHOSEN NOT SAMPLED ─────
  //
  // WHY SIX. With one bite each, both swimmers checkpointed at exactly
  // MIN_SIZE, and that made this whole script unable to prove the thing it is
  // named for. Measured: mutating `foldShoal`'s seed step to floor EVERY
  // adopted size to MIN_SIZE left this run ALL PASS, because the true value was
  // MIN_SIZE anyway. The script proved a record's EXISTENCE crossed the hour,
  // not its VALUE.
  //
  // The floor is not an accident of the fixture, it is arithmetic: a swimmer
  // must DEPART before the boundary for this test to mean anything (see the
  // header), departure is PRESENCE_TTL_MS after its last write, and hunger runs
  // at HUNGER_AMOUNT per second for that whole 90 s. One bite is +12 against
  // -90. Six is +72, which clears MIN_SIZE with room to spare:
  //   START_SIZE 100 + 6 * BITE_GROWTH 12 - about 90 hunger ticks = about 82,
  // and a hunger tick is skipped for each bite, so the real figure is a little
  // above that. It is asserted as a BAND rather than a number because the
  // authoring instants come from a wall clock (`scripts/` may read one;
  // `src/lib/` may not) and the exact tick alignment moves run to run.
  //
  // WHY THE TIMES ARE COMPUTED. `sendEat(ctx, cell, ms)` takes the instant the
  // claim is FOR, and the fold judges spacing on that value, not on when the
  // write landed. Sampling `Date.now()` per write would make the spacing depend
  // on how long Argon2id took and could fall under EAT_COOLDOWN_MS, silently
  // dropping bites. Spacing them EAT_COOLDOWN_MS apart from the presence
  // instant makes the fixture deterministic in the only dimension that matters.
  // Every value still lands inside the node's action validity window and inside
  // epoch E, which the guard above already required.
  const BITES = 6; // BLOOM_BITES — one full bloom, the most a cell will yield
  const hashes: string[] = [];
  const t1 = Date.now();
  hashes.push(await sendPresence(ctxA, { x: cA.x, y: cA.y, heading: 0, speed: 0, t: t1 }));
  const t2 = Date.now();
  hashes.push(await sendPresence(ctxB, { x: cB.x, y: cB.y, heading: 0, speed: 0, t: t2 }));
  const biteMsA: number[] = [];
  const biteMsB: number[] = [];
  for (let i = 1; i <= BITES; i++) {
    const msA = t1 + i * EAT_COOLDOWN_MS;
    const msB = t2 + i * EAT_COOLDOWN_MS;
    biteMsA.push(msA);
    biteMsB.push(msB);
    hashes.push(await sendEat(ctxA, cellA, msA));
    hashes.push(await sendEat(ctxB, cellB, msB));
  }
  const t3 = biteMsA[biteMsA.length - 1];
  const t4 = biteMsB[biteMsB.length - 1];
  log(`${hashes.length} moves; presences at ${t1}, ${t2}; last bites at ${t3}, ${t4}`);

  // Both nodes must hold ALL FOUR before either client rolls. Two clients that
  // close an hour holding different entry sets legitimately publish different
  // checkpoints (shoalLoop.ts section 2), so this wait is what makes the
  // agreement assertion below mean something.
  const haveAll = async (auth: RpcAuth): Promise<boolean> => {
    const room = await fetchRoom(auth, spaceId, roomId);
    return hashes.every((h) => room.log.some((e) => e.hash === h));
  };
  const bothHaveAll = await waitUntil(async () => (await haveAll(authA)) && (await haveAll(authB)), 120_000);
  check(`both nodes serve all ${hashes.length} moves — gossip carried each client's writes to the other`,
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
  check(`NON-DEGENERACY: all ${BITES} of A's bites were credited on its cell`,
    midA.bitesTaken.get(cellA) === BITES, midA.bitesTaken.get(cellA));
  check(`NON-DEGENERACY: all ${BITES} of B's bites were credited on its cell`,
    midA.bitesTaken.get(cellB) === BITES, midA.bitesTaken.get(cellB));
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
  // THE ASSERTION THIS SCRIPT EXISTS FOR, and the one it used to be unable to
  // make. Every carried size must be a REAL number that this run computed —
  // neither START_SIZE (which is what an unseeded joiner invents) nor MIN_SIZE
  // (which is what a fold that discarded the value would floor to). With one
  // bite each the true value WAS MIN_SIZE, so flooring every adopted size to
  // MIN_SIZE left this run ALL PASS: it proved a record crossed the hour, not
  // its value. Hand-derived band: START_SIZE 100 + 6 * BITE_GROWTH 12 = 172,
  // less roughly PRESENCE_TTL_MS / 1_000 = 90 hunger ticks (a few of them
  // skipped, one per bite), so about 82-90.
  check('NON-DEGENERACY: every carried size is neither START_SIZE nor MIN_SIZE — '
    + 'a real value, computed by this run',
    cpA.sizes.length === 2
      && cpA.sizes.every(([, s]) => s !== START_SIZE && s > MIN_SIZE),
    cpA.sizes);
  // Hand-derived exactly: START_SIZE 100 + 6 * BITE_GROWTH 12 = 172 at the last
  // bite, then hunger at HUNGER_AMOUNT per second for the rest of the swimmer's
  // PRESENCE_TTL_MS of life, with one tick skipped per bite. Measured in
  // isolation against this exact fixture: 88, and no sweep.
  check('hand-derived: each carried size is 88 — 100 + 6*12 = 172, less the hunger '
    + 'of a 90 s life with one tick skipped per bite',
    cpA.sizes.every(([, s]) => s === 88), cpA.sizes);

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
  // VALUE, not just presence. Each remembered size is compared against the
  // size the CHECKPOINT actually carried for that same id — the number this run
  // computed, which the assertion above has already established is neither
  // START_SIZE nor MIN_SIZE. A fold that adopted the record but discarded the
  // number (say, by flooring it) passes the fingerprint check, since both
  // clients floor identically; it cannot pass this one.
  const carried = new Map(cpA.sizes);
  check('…and both remember both swimmers at the size they left',
    stayed.departed.size === 2 && joined.departed.size === 2
      && [...joined.departed.entries()].every(([id, d]) => d.size === carried.get(id))
      && [...stayed.departed.entries()].every(([id, d]) => d.size === carried.get(id)),
    {
      carried: [...carried],
      joined: [...joined.departed.entries()].map(([id, d]) => [id, d.size]),
      stayed: [...stayed.departed.entries()].map(([id, d]) => [id, d.size]),
    });
  check('…and those sizes are the real ones, so the comparison above is not MIN_SIZE == MIN_SIZE',
    [...joined.departed.values()].every((d) => d.size > MIN_SIZE && d.size !== START_SIZE),
    [...joined.departed.values()].map((d) => d.size));

  // ── THE COPIED CHECKPOINT: one object, two nodes, two reported authors ────
  //
  // `content_id = sha256(body)`, so a client that submits a BYTE-IDENTICAL copy
  // of someone else's checkpoint creates no second object — it creates a second
  // CLAIM on the one that exists. The node accepts the action, drops the
  // duplicate content-store write while returning success, and the
  // later-indexed action overwrites the metadata that carries the AUTHOR
  // (methods.rs:3373-3375, chain.rs:482-483). The two nodes then disagree about
  // who published it, and `CheckpointEntry.id` comes from exactly that.
  //
  // THIS IS THE REGRESSION TEST FOR A REAL SHIPPED DEFECT. When
  // `decodeCheckpointBody` required the body's salt to match the envelope
  // author, the node that attributed this copy to B DROPPED a perfectly valid
  // checkpoint: measured node A decodes=true / node B decodes=false on the same
  // object, adopting `[[…,88]]` and `null`. One write reopened Blocker 12 for
  // every client of the wrong node, and a client could reject its own
  // checkpoint. The salt binding is therefore not applied to checkpoints — see
  // shoalWire.ts's `saltMatchesAuthor`.
  //
  // What must hold is NOT that both nodes agree who published it (they cannot;
  // that is a node-side defect), but that both nodes' clients still adopt the
  // SAME SEED.
  //
  // THE ASSERTION IS SPLIT IN TWO, and the reason is worth stating because the
  // obvious single check does not do the job. WHICH node ends up naming WHICH
  // author is an indexing race this script cannot steer from the client side —
  // measured: a run where B submitted the copy and BOTH nodes still reported the
  // original authors, so an end-to-end "do the two nodes agree" check passed
  // even with the broken binding in place. It is a real end-to-end guard and it
  // is kept, but on its own it does not discriminate.
  //
  // So the discriminating half uses the REAL BYTES A published and asks the
  // decoder the question the race would have asked it: does this body still
  // decode when the envelope names the OTHER player? That is deterministic,
  // needs no race, and is exactly what failed before.
  {
    const copyMs = Date.now();
    await submitToRoom(ctxB, bodyA, copyMs); // B submits A's exact bytes
    const seen = await waitUntil(async () => {
      const r = await fetchRoom(authB, spaceId, roomId);
      return r.checkpoints.length >= 2;
    }, 60_000);
    check('the copied checkpoint is on chain and served', seen);

    const afterA = await fetchRoom(authA, spaceId, roomId);
    const afterB = await fetchRoom(authB, spaceId, roomId);
    const adoptA = adoptCheckpoint(afterA.checkpoints, EPOCH + 1);
    const adoptB = adoptCheckpoint(afterB.checkpoints, EPOCH + 1);
    const seedTextA = adoptA.seed === null ? null : serialiseCheckpoint(adoptA.seed);
    const seedTextB = adoptB.seed === null ? null : serialiseCheckpoint(adoptB.seed);
    log(`after the copy: A reports authors ${afterA.checkpoints.map((c) => c.id.slice(0, 8)).join(',')}`
      + ` / B reports ${afterB.checkpoints.map((c) => c.id.slice(0, 8)).join(',')}`);
    check('a byte-identical copy leaves both nodes still serving decodable checkpoints',
      afterA.checkpoints.length >= 2 && afterB.checkpoints.length >= 2,
      { a: afterA.checkpoints.length, b: afterB.checkpoints.length });
    check('both nodes\' clients adopt a seed, neither is left unseeded',
      seedTextA !== null && seedTextB !== null, { seedTextA, seedTextB });
    check('…and it is the SAME seed', seedTextA === seedTextB, { seedTextA, seedTextB });
    check('…still the payload both honest clients computed',
      seedTextA === payloadA, { seedTextA, payloadA });

    // THE DISCRIMINATING HALF. `bodyA` is the exact string A published and both
    // nodes now hold; the only thing the indexing race changes is which author
    // the envelope names for it. Both answers must decode to the same payload,
    // or one node's clients lose the hour.
    const asA = decodeCheckpointBody(bodyA, pa.publicKeyHex, 'sha256:asA');
    const asB = decodeCheckpointBody(bodyA, pb.publicKeyHex, 'sha256:asB');
    check('THE REGRESSION: A\'s real published body decodes when the envelope names A',
      asA !== null, asA);
    check('THE REGRESSION: …and when the very same object is reported as B-authored, '
      + 'which is what the losing node reports after a copy',
      asB !== null, asB);
    check('…to the identical payload, so neither node\'s clients are left unseeded',
      asA !== null && asB !== null
        && serialiseCheckpoint(asA.cp) === payloadA
        && serialiseCheckpoint(asB.cp) === payloadA,
      { asA: asA && serialiseCheckpoint(asA.cp), asB: asB && serialiseCheckpoint(asB.cp) });
    check('…and each still carries the ENVELOPE\'s id, never the salt\'s owner',
      asA !== null && asB !== null && asA.id === pa.publicKeyHex && asB.id === pb.publicKeyHex,
      { a: asA?.id, b: asB?.id });
  }

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
