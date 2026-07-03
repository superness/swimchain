/**
 * Forum-client write path against a real regtest node.
 *
 * Exercises the CLIENT's own modules end to end:
 *  - forum-client/src/lib/action-pow.ts  (Argon2id action PoW mining)
 *  - forum-client/src/lib/rpc.ts         (SwimchainRpc: signature-auth headers + submit_*)
 *  - forum-client/src/wasm/swimchain_wasm (WasmKeypair Ed25519 signing)
 *
 * Coupling note: the page-level composition (PoW content string, signature
 * message format) lives in React hooks/components (useRpc.tsx, NewThread.tsx,
 * ReplyComposer.tsx) which cannot run outside a DOM. The exact strings they
 * produce are mirrored here 1:1 and referenced by file/line in comments.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { RPC_URL, REPO_ROOT } from '../harness/node-harness';
import { patchRateLimitRetry } from '../helpers/forum-seeder';

// --- client code under test ---
import wasmInit, { WasmKeypair } from '../../../forum-client/src/wasm/swimchain_wasm.js';
import { SwimchainRpc } from '../../../forum-client/src/lib/rpc';
import {
  ActionType,
  TEST_CONFIG,
  createChallenge,
  createChallengeWithRawHash,
  computePow,
  solutionToRpcParams,
  bytesToHex,
  hexToBytes,
} from '../../../forum-client/src/lib/action-pow';

// Regtest node accepts difficulty >= 4 (NetworkMode::Regtest.adjusted_difficulty).
// Keep it slightly above the floor so the test is fast but not degenerate.
const REGTEST_DIFFICULTY = 6;

let keypair: WasmKeypair;
let authorId: string; // 32-byte hex pubkey
let rpc: SwimchainRpc;
let spaceId: string;

beforeAll(async () => {
  // The browser loader (wasm/loader.ts) fetches the .wasm via URL, which Node's
  // fetch cannot do for file://; init directly from bytes instead.
  const wasmBytes = readFileSync(
    path.join(REPO_ROOT, 'forum-client', 'src', 'wasm', 'swimchain_wasm_bg.wasm'),
  );
  await wasmInit({ module_or_path: wasmBytes });

  keypair = new WasmKeypair();
  authorId = bytesToHex(keypair.publicKey());

  // Construct the client exactly as the app does (signature auth from seed).
  rpc = new SwimchainRpc({
    endpoint: RPC_URL,
    seed: bytesToHex(keypair.seed()),
    publicKey: authorId,
  });
  const ok = await rpc.connect();
  expect(ok).toBe(true);
  expect(rpc.getNodeInfo()?.network).toBe('regtest');
  patchRateLimitRetry(rpc);

  // Create a space for the tests (client createSpace + client-mined SpaceCreation PoW).
  const name = `forum-e2e-${Date.now()}`;
  const challenge = await createChallenge(
    ActionType.SpaceCreation,
    new TextEncoder().encode(name),
    keypair.publicKey(),
    REGTEST_DIFFICULTY,
  );
  const solution = await computePow(challenge, TEST_CONFIG);
  const pow = solutionToRpcParams(solution);
  // Signature message mirrors CLI/app convention; node validates format (64-byte hex).
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
  expect(result.space_id).toMatch(/^sp1/);
  spaceId = result.space_id;
}, 120_000);

describe('forum-client write path (submit_post + submit_reply)', () => {
  let postId: string;

  it('submits a post with client-mined action PoW and the node accepts it', async () => {
    const title = 'E2E forum post';
    const body = `posted by forum-client e2e at ${new Date().toISOString()}`;

    // PoW content composition mirrors NewThread.tsx: `${title}\n\n${body}`
    const postContent = `${title}\n\n${body}`;
    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode(postContent),
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const solution = await computePow(challenge, TEST_CONFIG);
    const pow = solutionToRpcParams(solution);

    // Signature message mirrors useRpc.tsx useSubmitPost:
    //   `post:${spaceId}:${title}:${body}:${timestamp}`
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

    // On-chain reality: content must be retrievable, not just a 200.
    const content = await rpc.getContent(postId);
    expect(content.content_id).toBe(postId);
    expect(content.title).toBe(title);
    expect(content.body).toContain(body);
    expect(content.content_type.toLowerCase()).toBe('post');
  });

  it('submits a reply with action PoW and the node threads it under the parent', async () => {
    expect(postId).toBeDefined();
    const body = `reply from forum-client e2e at ${new Date().toISOString()}`;

    // Reply PoW is mined over the reply body alone (ReplyComposer.tsx).
    const challenge = await createChallenge(
      ActionType.Reply,
      new TextEncoder().encode(body),
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const solution = await computePow(challenge, TEST_CONFIG);
    const pow = solutionToRpcParams(solution);

    // Signature message mirrors useRpc.tsx useSubmitReply:
    //   `reply:${parentId}:${body}:${timestamp}`
    const sig = keypair.sign(
      new TextEncoder().encode(`reply:${postId}:${body}:${pow.timestamp}`),
    );

    const result = await rpc.submitReply({
      parentId: postId,
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

    // On-chain reality: the reply must appear under the parent.
    const replies = await rpc.getReplies(postId);
    const found = replies.replies.find((r) => r.content_id === result.content_id);
    expect(found).toBeDefined();
    expect(found!.body).toContain(body);
  });

  it('rejects a post whose PoW was mined with the wrong Argon2id config', async () => {
    // Negative control: proves the node actually verifies PoW rather than
    // rubber-stamping. Mine with a bogus hash instead of real work.
    const title = 'bogus';
    const body = 'bogus body';
    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode(`${title}\n\n${body}`),
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const fakePow = {
      pow_nonce: 1,
      pow_difficulty: REGTEST_DIFFICULTY,
      pow_nonce_space: bytesToHex(challenge.nonceSpace),
      pow_hash: '00'.repeat(32), // claims difficulty but was never mined
      timestamp: challenge.timestamp,
    };
    const sig = keypair.sign(new TextEncoder().encode('x'));

    await expect(
      rpc.submitPost({
        spaceId,
        title,
        body,
        authorId,
        powNonce: fakePow.pow_nonce,
        powDifficulty: fakePow.pow_difficulty,
        powNonceSpace: fakePow.pow_nonce_space,
        powHash: fakePow.pow_hash,
        signature: bytesToHex(sig),
        timestamp: fakePow.timestamp,
      }),
    ).rejects.toThrow(/PoW|pow/);
  });

  it('submits an engagement (reaction) via raw-hash challenge and it shows in get_reactions', async () => {
    expect(postId).toBeDefined();

    // Engagement PoW uses the raw parent hash (createChallengeWithRawHash),
    // NOT sha256 of the "sha256:..." string — the PR #45 byte-fix pattern.
    const rawHash = hexToBytes(postId.slice('sha256:'.length));
    const challenge = createChallengeWithRawHash(
      ActionType.Engage,
      rawHash,
      keypair.publicKey(),
      REGTEST_DIFFICULTY,
    );
    const solution = await computePow(challenge, TEST_CONFIG);
    const pow = solutionToRpcParams(solution);

    // Signature message mirrors useRpc.tsx useSubmitEngagement:
    //   `engage:${contentId}:${nonce}:${timestamp}:${emoji}`
    const sig = keypair.sign(
      new TextEncoder().encode(`engage:${postId}:${pow.pow_nonce}:${pow.timestamp}:2`),
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
      emoji: 2, // thumbs up
    });
    expect(result.engaged).toBe(true);

    const reactions = await rpc.getReactions(postId);
    const total = reactions.reactions.reduce((n, r) => n + r.count, 0);
    expect(total).toBeGreaterThanOrEqual(1);
  });
});
