/**
 * Regtest integration smoke for The Trench's node plumbing (Task 2).
 *
 * Run with: npx tsx scripts/regtest-smoke.ts
 *
 * Talks to an ALREADY-RUNNING regtest node — this script does not spawn or manage the
 * node process (see docs/superpowers/plans/2026-07-22-the-trench.md Task 2, Step 4).
 *
 * Env:
 *   TRENCH_RPC           RPC endpoint, e.g. http://127.0.0.1:39736
 *   TRENCH_COOKIE_FILE   path to the node's <data-dir-with-suffix>/.cookie file
 *   TRENCH_SPACE_OVERRIDE  (set by this script itself, after create_space — see
 *     trenchNet.ts's `effectiveTrenchSpace`; not meant to be pre-set by the caller)
 *
 * Flow: build an RpcAuth from the cookie file -> nodeIdentity -> create (or
 * idempotently reuse) the "@trench:main" app space -> foundClaim -> heartbeat move ->
 * build-farm move -> loadClaim -> assert the fold landed exactly where the engine
 * says it must. Prints PASS/FAIL per assertion; exits 0 only if every assertion
 * passed — never fakes a pass.
 */
import { readFileSync } from 'node:fs';

import {
  ActionType,
  createChallenge,
  computePow,
  TEST_CONFIG,
  solutionToRpcParams,
  hexToBytes,
  sha256,
  signAction,
} from '@swimchain/react';

import { rpcCall, nodeIdentity, type RpcAuth, type NodeIdentity } from '../src/lib/nodeRpc';
import { foundClaim, submitTrenchMove, loadClaim } from '../src/lib/trenchNet';
import { START_SALVAGE, COST_FARM } from '../src/lib/trenchEngine';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    console.log(`PASS: ${name}`);
  } else {
    failures++;
    console.log(`FAIL: ${name}${extra !== undefined ? ` (${JSON.stringify(extra)})` : ''}`);
  }
}

/**
 * Mines + signs a `create_space` action directly against the RPC of the ALREADY-
 * RUNNING node, rather than shelling out to `sw space create` (which opens the SAME
 * sled data dir the running node process already holds locked — a second process
 * contending for that lock hangs indefinitely instead of failing fast; this was
 * confirmed empirically while building this script). Talking to the running node
 * over RPC is the correct path regardless — it's exactly the plumbing this task
 * built, and it's what a real client does.
 *
 * create_space's PoW verification recomputes `content_hash = sha256(name)`
 * SERVER-SIDE (src/rpc/methods.rs `create_space`) — NOT the `space:${name}` scheme
 * `@swimchain/react`'s `createSpaceChallenge` helper uses (that helper mines against
 * a different preimage than the server checks against, so using it here would mine a
 * PoW solution the node can never verify — "hash mismatch" every time). This mines
 * directly against the server's real preimage instead, via the lower-level
 * `createChallenge`.
 *
 * App-namespaced spaces (`@app:display` names) are idempotent server-side — a second
 * create_space for the same name just returns the existing space id — so this is
 * safe to call on every smoke run without pre-checking existence.
 */
async function createOrReuseSpace(auth: RpcAuth, id: NodeIdentity, name: string): Promise<string> {
  const difficulty = 4; // NetworkMode::Regtest::adjusted_difficulty is a flat 4 bits for every action type
  const challenge = await createChallenge(
    ActionType.SpaceCreation,
    new TextEncoder().encode(name),
    hexToBytes(id.publicKeyHex),
    difficulty
  );
  const solution = await computePow(challenge, TEST_CONFIG);
  const p = solutionToRpcParams(solution);
  const contentHash = await sha256(new TextEncoder().encode(name));
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });

  const result = await rpcCall<{ space_id: string; name: string; success: boolean }>(auth, 'create_space', {
    name,
    creator_id: id.publicKeyHex,
    pow_nonce: Number(p.pow_nonce),
    pow_difficulty: p.pow_difficulty,
    pow_nonce_space: p.pow_nonce_space,
    pow_hash: p.pow_hash,
    signature,
    timestamp: p.timestamp,
  });
  return result.space_id;
}

async function main(): Promise<void> {
  const endpoint = (process.env.TRENCH_RPC ?? '').trim();
  const cookieFile = (process.env.TRENCH_COOKIE_FILE ?? '').trim();
  if (!endpoint || !cookieFile) {
    throw new Error('regtest-smoke requires TRENCH_RPC and TRENCH_COOKIE_FILE env vars');
  }

  const cookieHex = readFileSync(cookieFile, 'utf8').trim();
  const authHeader = `Basic ${Buffer.from(`__cookie__:${cookieHex}`, 'utf8').toString('base64')}`;
  const auth: RpcAuth = { endpoint, authHeader };

  console.log(`[smoke] endpoint=${endpoint}`);
  console.log(`[smoke] cookieFile=${cookieFile}`);

  const id = await nodeIdentity(auth);
  console.log(`[smoke] identity address=${id.address} publicKey=${id.publicKeyHex.slice(0, 16)}...`);

  // ── create (or idempotently reuse) the app space, then point trenchNet at it ──────
  const spaceName = '@trench:main';
  const spaceId = await createOrReuseSpace(auth, id, spaceName);
  console.log(`[smoke] space ${spaceName} -> ${spaceId}`);
  process.env.TRENCH_SPACE_OVERRIDE = spaceId;

  // ── found a claim, then play two moves ────────────────────────────────────────────
  // Regtest bypasses the sponsorship gate entirely (check_identity_sponsored in
  // src/rpc/methods.rs returns Ok immediately when network == "regtest"), so
  // ensureTrenchSponsored is neither needed nor called here.
  const claimId = await foundClaim(auth, id, 'smoke', 0, 0);
  console.log(`[smoke] founded claim ${claimId}`);

  const heartbeatId = await submitTrenchMove(auth, id, claimId, 'heartbeat');
  console.log(`[smoke] heartbeat move -> ${heartbeatId}`);

  const buildId = await submitTrenchMove(auth, id, claimId, 'build farm');
  console.log(`[smoke] build-farm move -> ${buildId}`);

  const { header, owner, state } = await loadClaim(auth, claimId);

  check('claim header name is "smoke"', header.name === 'smoke', header);
  check('claim owner is the node identity (address)', owner === id.address, { owner, address: id.address });
  check('state.structures.length === 1', state.structures.length === 1, state.structures);
  check('structures[0].kind === "farm"', state.structures[0]?.kind === 'farm', state.structures[0]);
  check(
    `state.salvage === START_SALVAGE - COST_FARM (${START_SALVAGE - COST_FARM})`,
    state.salvage === START_SALVAGE - COST_FARM,
    state.salvage
  );

  const heartbeatMove = state.moves.find((m) => m.contentId === heartbeatId);
  check('heartbeat move folded with outcome "ok" (accepted)', heartbeatMove?.outcome === 'ok', heartbeatMove);

  const buildMove = state.moves.find((m) => m.contentId === buildId);
  check('build-farm move folded with outcome "ok" (accepted)', buildMove?.outcome === 'ok', buildMove);

  console.log(`\n[smoke] ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[smoke] FATAL:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
