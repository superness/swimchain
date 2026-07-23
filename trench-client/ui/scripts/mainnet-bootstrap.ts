/**
 * One-time mainnet bootstrap for The Trench (plan Task 5, steps 1+3).
 *
 * Run from trench-client/ui with a tunnel to the GAME-SPONSOR node's RPC
 * (its node identity is the sanctioned game sponsor, genesis-sponsored):
 *
 *   TRENCH_RPC=http://127.0.0.1:19797 \
 *   TRENCH_COOKIE_FILE=<path to fetched .cookie> \
 *   npx tsx scripts/mainnet-bootstrap.ts
 *
 * Flow: create (or idempotently reuse) the "@trench:main" app space, then
 * found the seed claims — "First Light" (0,0), "Mooring" (9,4),
 * "The Shelf" (-7,6) — each with one heartbeat + one kelp farm, so a new
 * player's first map is not empty water. Idempotent: claims that already
 * exist (same name + owner) are skipped, so re-running never duplicates.
 *
 * Network-aware PoW: get_info decides regtest (TEST profile, flat 4 bits)
 * vs testnet/mainnet (8 MiB profile via getConfig(true)/getDifficulty(...,
 * true) — mainnet's action PoW matches testnet by operator decision,
 * 2026-07-22).
 */
import { readFileSync } from 'node:fs';

import {
  ActionType,
  createChallenge,
  computePow,
  getConfig,
  getDifficulty,
  TEST_CONFIG,
  solutionToRpcParams,
  hexToBytes,
  sha256,
  signAction,
} from '@swimchain/react';

import { rpcCall, nodeIdentity, type RpcAuth, type NodeIdentity } from '../src/lib/nodeRpc';
import { foundClaim, submitTrenchMove, loadClaim, listClaims } from '../src/lib/trenchNet';

const SEEDS: Array<{ name: string; x: number; y: number }> = [
  { name: 'First Light', x: 0, y: 0 },
  { name: 'Mooring', x: 9, y: 4 },
  { name: 'The Shelf', x: -7, y: 6 },
];

async function networkOf(auth: RpcAuth): Promise<string> {
  const info = await rpcCall<{ network: string }>(auth, 'get_info', {});
  return info.network;
}

/** Same server-preimage-correct create_space path as regtest-smoke.ts (see the
 *  landmine notes there: never `sw space create` against a running node's data
 *  dir, and never mine against the `space:`-prefixed helper preimage). */
async function createOrReuseSpace(
  auth: RpcAuth,
  id: NodeIdentity,
  name: string,
  network: string
): Promise<string> {
  const isRegtest = network === 'regtest';
  const difficulty = isRegtest ? 4 : getDifficulty(ActionType.SpaceCreation, true);
  const config = isRegtest ? TEST_CONFIG : getConfig(true);
  const challenge = await createChallenge(
    ActionType.SpaceCreation,
    new TextEncoder().encode(name),
    hexToBytes(id.publicKeyHex),
    difficulty
  );
  const solution = await computePow(challenge, config);
  const p = solutionToRpcParams(solution);
  const contentHash = await sha256(new TextEncoder().encode(name));
  const signature = await signAction(id.sign, { contentHash, timestamp: p.timestamp });

  const result = await rpcCall<{ space_id: string; success: boolean }>(auth, 'create_space', {
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
  if (!endpoint || !cookieFile) throw new Error('need TRENCH_RPC + TRENCH_COOKIE_FILE');

  const cookieHex = readFileSync(cookieFile, 'utf8').trim();
  const auth: RpcAuth = {
    endpoint,
    authHeader: `Basic ${Buffer.from(`__cookie__:${cookieHex}`, 'utf8').toString('base64')}`,
  };

  const network = await networkOf(auth);
  const id = await nodeIdentity(auth);
  console.log(`[bootstrap] network=${network} identity=${id.address} pub=${id.publicKeyHex.slice(0, 12)}…`);

  const spaceId = await createOrReuseSpace(auth, id, '@trench:main', network);
  console.log(`[bootstrap] @trench:main -> ${spaceId}`);
  process.env.TRENCH_SPACE_OVERRIDE = spaceId;

  const existing = await listClaims(auth);
  console.log(`[bootstrap] existing claims in space: ${existing.length}`);

  for (const seed of SEEDS) {
    const already = existing.find(
      (c) => c.header.name === seed.name && (c.owner === id.address || c.owner === id.publicKeyHex)
    );
    if (already) {
      console.log(`[bootstrap] "${seed.name}" already founded (${already.claimId.slice(0, 24)}…) — skipping`);
      continue;
    }
    const claimId = await foundClaim(auth, id, seed.name, seed.x, seed.y);
    console.log(`[bootstrap] founded "${seed.name}" (${seed.x},${seed.y}) -> ${claimId.slice(0, 32)}…`);
    const hb = await submitTrenchMove(auth, id, claimId, 'heartbeat');
    console.log(`[bootstrap]   heartbeat -> ${hb.slice(0, 24)}…`);
    const farm = await submitTrenchMove(auth, id, claimId, 'build farm');
    console.log(`[bootstrap]   build farm -> ${farm.slice(0, 24)}…`);
    const { state } = await loadClaim(auth, claimId);
    const ok = state.structures.length === 1 && state.moves.every((m) => m.outcome === 'ok');
    console.log(`[bootstrap]   fold check: structures=${state.structures.length} allOk=${ok}`);
    if (!ok) {
      console.error(`[bootstrap] FOLD CHECK FAILED for "${seed.name}" — inspect before proceeding`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`\n[bootstrap] DONE. VITE_TRENCH_SPACE=${spaceId}`);
}

main().catch((e) => {
  console.error('[bootstrap] FATAL:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
