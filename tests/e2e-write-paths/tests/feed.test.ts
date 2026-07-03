/**
 * Feed-client write path against a real regtest node.
 *
 * Exercises the CLIENT's own modules end to end:
 *  - feed-client/src/lib/action-pow.ts  (Argon2id PoW, incl. the raw-hash
 *    engagement challenge added by SWIM-Q2 — see finding below)
 *  - feed-client/src/lib/rpc.ts         (SwimchainRpc signature auth + submit_*)
 *  - feed-client/src/wasm/swimchain_wasm (WasmKeypair Ed25519)
 *
 * FINDING (fixed in this PR): feed's useEngagementPow previously mined the
 * engagement challenge over the "sha256:..." contentId STRING, while the
 * node rebuilds the challenge from the raw 32-byte hash
 * (verify_pow_submission_raw). Every feed reaction was rejected by a real
 * node with "PoW verification failed". The negative test below pins the old
 * behavior as rejected; the positive test proves the fixed composition
 * (createChallengeWithRawHash, same as forum) is accepted.
 *
 * Coupling note: page/hook composition (Compose.tsx, useRpc.tsx) is React
 * bound; the strings they produce are mirrored 1:1 with references.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { RPC_URL, REPO_ROOT } from '../harness/node-harness';
import { patchRateLimitRetry } from '../helpers/forum-seeder';

// --- client code under test ---
import wasmInit, { WasmKeypair } from '../../../feed-client/src/wasm/swimchain_wasm.js';
import { SwimchainRpc } from '../../../feed-client/src/lib/rpc';
import {
  ActionType,
  TEST_CONFIG,
  createChallenge,
  createChallengeWithRawHash,
  computePow,
  solutionToRpcParams,
  bytesToHex,
  hexToBytes,
} from '../../../feed-client/src/lib/action-pow';

const REGTEST_DIFFICULTY = 6;

let keypair: WasmKeypair;
let authorId: string;
let rpc: SwimchainRpc;
let spaceId: string;

beforeAll(async () => {
  const wasmBytes = readFileSync(
    path.join(REPO_ROOT, 'feed-client', 'src', 'wasm', 'swimchain_wasm_bg.wasm'),
  );
  await wasmInit({ module_or_path: wasmBytes });

  keypair = new WasmKeypair();
  authorId = bytesToHex(keypair.publicKey());
  rpc = new SwimchainRpc({
    endpoint: RPC_URL,
    seed: bytesToHex(keypair.seed()),
    publicKey: authorId,
  });
  expect(await rpc.connect()).toBe(true);
  patchRateLimitRetry(rpc);

  // Space for the feed tests, via feed's own createSpace.
  const name = `feed-e2e-${Date.now()}`;
  const challenge = await createChallenge(
    ActionType.SpaceCreation,
    new TextEncoder().encode(name),
    keypair.publicKey(),
    REGTEST_DIFFICULTY,
  );
  const pow = solutionToRpcParams(await computePow(challenge, TEST_CONFIG));
  const sig = keypair.sign(new TextEncoder().encode(`space:${name}:${pow.timestamp}`));
  const result = await rpc.createSpace({
    name,
    creatorId: authorId,
    powNonce: pow.pow_nonce,
    powDifficulty: pow.pow_difficulty,
    powNonceSpace: pow.pow_nonce_space,
    powHash: pow.pow_hash,
    signature: bytesToHex(sig),
    timestamp: pow.timestamp,
  });
  expect(result.success).toBe(true);
  spaceId = result.space_id;
}, 120_000);

describe('feed-client write path (submit_post + submit_engagement)', () => {
  let postId: string;

  it('submits a post (Compose composition) and the node accepts it', async () => {
    const title = 'E2E feed post';
    const body = `posted by feed-client e2e at ${new Date().toISOString()}`;

    // PoW content mirrors Compose.tsx: `${title}\n\n${body}`
    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode(`${title}\n\n${body}`),
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const pow = solutionToRpcParams(await computePow(challenge, TEST_CONFIG));

    // Signature mirrors feed useRpc.tsx: `post:${spaceId}:${title}:${body}:${ts}`
    const sig = keypair.sign(
      new TextEncoder().encode(`post:${spaceId}:${title}:${body}:${pow.timestamp}`),
    );

    const result = await rpc.submitPost({
      spaceId,
      title,
      body,
      authorId,
      powNonce: pow.pow_nonce,
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: bytesToHex(sig),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    postId = result.content_id;

    const content = await rpc.getContent(postId);
    expect(content.content_id).toBe(postId);
    expect(content.title).toBe(title);
  });

  it('REJECTS the pre-fix engagement composition (PoW over the contentId string)', async () => {
    expect(postId).toBeDefined();

    // This is exactly what feed's useEngagementPow did before the fix:
    // challenge content = sha256(encode("sha256:abc...")) — the node instead
    // rebuilds the challenge from the raw 32-byte hash, so verification fails.
    const challenge = await createChallenge(
      ActionType.Engage,
      new TextEncoder().encode(postId),
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const pow = solutionToRpcParams(await computePow(challenge, TEST_CONFIG));
    const sig = keypair.sign(
      new TextEncoder().encode(`engage:${postId}:${pow.pow_nonce}:${pow.timestamp}`),
    );

    await expect(
      rpc.submitEngagement({
        contentId: postId,
        authorId,
        powNonce: pow.pow_nonce,
        powDifficulty: pow.pow_difficulty,
        powNonceSpace: pow.pow_nonce_space,
        powHash: pow.pow_hash,
        signature: bytesToHex(sig),
        timestamp: pow.timestamp,
      }),
    ).rejects.toThrow(/PoW|pow/);
  });

  it('submits an engagement with the FIXED raw-hash composition and it is accepted', async () => {
    expect(postId).toBeDefined();

    // Fixed composition (useEngagementPow -> mineWithRawHash):
    const rawHash = hexToBytes(postId.slice('sha256:'.length));
    const challenge = createChallengeWithRawHash(
      ActionType.Engage,
      rawHash,
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const pow = solutionToRpcParams(await computePow(challenge, TEST_CONFIG));

    // Signature mirrors feed useRpc.tsx useSubmitEngagement:
    //   `engage:${contentId}:${nonce}:${timestamp}:${emoji}`
    const sig = keypair.sign(
      new TextEncoder().encode(`engage:${postId}:${pow.pow_nonce}:${pow.timestamp}:7`),
    );

    const result = await rpc.submitEngagement({
      contentId: postId,
      authorId,
      powNonce: pow.pow_nonce,
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: bytesToHex(sig),
      timestamp: pow.timestamp,
      emoji: 7, // fire
    });
    expect(result.engaged).toBe(true);

    // On-chain reality: reaction visible via get_reactions.
    const reactions = await rpc.getReactions(postId);
    const total = reactions.reactions.reduce((n, r) => n + r.count, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });
});
