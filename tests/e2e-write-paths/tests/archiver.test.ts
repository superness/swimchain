/**
 * Archiver-client write path against a real regtest node.
 *
 * Exercises the CLIENT's own modules end to end, following the exact
 * AutoEngageEngine.engage sequence from PR #39:
 *   mine Argon2id engagement PoW -> sign with the NODE identity
 *   (sign_message) -> submit_engagement -> re-poll get_pool_for_content.
 *
 *  - archiver-client/src/lib/rpc.ts       (signMessage, submitEngagement,
 *    getPoolForContent — incl. the auth fix added by SWIM-Q2, see below)
 *  - @swimchain/react action-pow          (createEngageChallenge raw-hash
 *    challenge + computePow — archiver's actual mining dependency via
 *    archiver-client/src/lib/engagement-pow.ts)
 *
 * FINDING (fixed in this PR): archiver's submitEngagement sent NO auth
 * headers. submit_engagement is not auth-exempt on the node, so every
 * engagement was rejected with HTTP 401 before the PoW was even inspected.
 * Fixed by remote-signing the request with the node identity (the forum
 * client's remote-signer pattern).
 *
 * DOCUMENTED (not fixed): mineEngagementPow/AutoEngageEngine only support
 * testnet/mainnet Argon2id configs (getConfig(isTestnet)). A regtest node
 * verifies with the 1 MiB test config, so the engine's own mining is
 * rejected there (hash mismatch); it matches testnet nodes, the deploy
 * target. This test therefore drives the same library calls the engine
 * makes, with the regtest config. Also: AutoEngageEngine is localStorage-
 * coupled (budget persistence) — covered by the harness browser shims.
 * Archiver read paths (getInfo, listSpaces, ...) use REST-style GET
 * endpoints (`/info`, `/spaces`) that a bare node does not serve — they
 * expect a gateway; assertions here use a signed forum-client reader.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RPC_PORT } from '../harness/node-harness';
import { makeSeeder, type Seeder } from '../helpers/forum-seeder';
import { withWriteRetry } from '../helpers/retry';

// --- client code under test ---
import { SwimchainRpc as ArchiverRpc } from '../../../archiver-client/src/lib/rpc';
import {
  TEST_CONFIG,
  computePow,
  createEngageChallenge,
  solutionToRpcParams,
} from '../../../swimchain-react/dist/lib/action-pow.js';

let seeder: Seeder;
let archiverRpc: ArchiverRpc;
let targetPostId: string;

beforeAll(async () => {
  // Seed a space + post for the archiver to preserve (test setup uses the
  // forum client modules already validated in forum.test.ts).
  seeder = await makeSeeder();
  const spaceId = await seeder.createSpace(`archiver-e2e-${Date.now()}`);
  targetPostId = await seeder.createPost(
    spaceId,
    'At-risk content',
    'This post is about to decay; the archiver should preserve it.',
  );

  archiverRpc = new ArchiverRpc({ host: '127.0.0.1', port: RPC_PORT });
}, 120_000);

describe('archiver-client write path (mine -> sign_message -> submit_engagement -> re-poll)', () => {
  it('node identity signs via sign_message (localhost-exempt)', async () => {
    const result = await archiverRpc.signMessage('archiver-e2e-probe');
    expect(result.signature).toMatch(/^[0-9a-f]{128}$/);
    expect(result.public_key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('submits an engagement the node accepts, then re-polls pool status', async () => {
    // Baseline for the on-chain assertion at the end.
    const before = await seeder.rpc.getContent(targetPostId);
    // Step 1: author identity = node identity (AutoEngageEngine mines
    // against the key that will sign, and verifies they match).
    const probe = await archiverRpc.signMessage('identity-probe');
    const authorPubkeyHex = probe.public_key;

    // Step 2: mine the raw-hash engagement challenge (same library call
    // chain as engagement-pow.ts mineEngagementPow, with the regtest
    // Argon2id config — see header note).
    const challenge = await createEngageChallenge(targetPostId, authorPubkeyHex, true);
    const solution = await computePow(challenge, TEST_CONFIG);
    const powResult = solutionToRpcParams(solution);

    // Step 3: nonce must go over the wire as a JSON number (u64 on the node).
    const powNonce = Number(powResult.pow_nonce);
    expect(Number.isSafeInteger(powNonce)).toBe(true);

    // Step 4: sign exactly what AutoEngageEngine signs:
    //   `engage:${content_id}:${pow_nonce}:${timestamp}`
    const signingMessage = `engage:${targetPostId}:${powNonce}:${powResult.timestamp}`;
    const signResult = await archiverRpc.signMessage(signingMessage);
    expect(signResult.public_key.toLowerCase()).toBe(authorPubkeyHex.toLowerCase());

    // Step 5: submit on-chain (with the SWIM-Q2 auth fix this is now
    // authenticated via node-identity remote signing).
    const submitResult = await withWriteRetry(() => archiverRpc.submitEngagement({
      content_id: targetPostId,
      author_id: authorPubkeyHex,
      pow_nonce: powNonce,
      pow_difficulty: powResult.pow_difficulty,
      pow_nonce_space: powResult.pow_nonce_space,
      pow_hash: powResult.pow_hash,
      signature: signResult.signature,
      timestamp: powResult.timestamp,
    }));
    expect(submitResult.engaged).toBe(true);

    // Step 6 (PR #39): re-poll the node for authoritative pool status.
    // Returns null gracefully when no pool exists / read is unauthorized.
    const pool = await archiverRpc.getPoolForContent(targetPostId);
    if (pool && pool.has_pool) {
      expect(pool.total_pow).toBeGreaterThanOrEqual(0);
    }

    // On-chain reality (signed reader): the engagement reset the decay
    // clock — last_engagement moved forward. (AutoEngageEngine engages
    // without an emoji, so the emoji reaction index is not the right probe.)
    const after = await seeder.rpc.getContent(targetPostId);
    expect(after.last_engagement).toBeGreaterThan(before.last_engagement);
  });
});
