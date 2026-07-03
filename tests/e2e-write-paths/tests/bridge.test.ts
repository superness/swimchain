/**
 * Bridge-client write path against a real regtest node.
 *
 * Exercises the CLIENT's own modules end to end, mirroring the (fixed)
 * BridgeEngine.processMessage inbound flow: an external (Matrix/IRC)
 * message is mined and submitted as submit_post (new thread) or
 * submit_reply (threaded, SWIM-B7 thread map).
 *
 *  - bridge-client/src/lib/rpc.ts        (signFn-based X-CS auth,
 *    submitPost/submitReply — the exact transport BridgeEngine uses)
 *  - bridge-client/src/lib/action-pow.ts (bridge's own Argon2id PoW)
 *
 * FINDINGS (fixed in this PR, pinned by the negative test):
 *  1. BridgeEngine mined PoW over `${prefix}${sender}] ${content}` but
 *     submitted title=`${prefix}${sender}`, body=content. The node verifies
 *     post PoW over `${title}\n\n${body}`, so every bridged post was
 *     rejected by a real node.
 *  2. Threaded replies mined an ActionType.Post challenge; the node
 *     rebuilds a Reply challenge over the body — also always rejected.
 *
 * DOCUMENTED (not fixed): BridgeEngine hardcodes the testnet Argon2id
 * config (getConfig(true), 8 MiB) — a regtest node verifies with the 1 MiB
 * test config, so the engine binary-for-binary can only pass against a
 * testnet node (its deploy target). This test drives the identical
 * composition through the client's own pow + rpc modules with the regtest
 * config. BridgeEngine itself is also localStorage/@swimchain-core-wasm
 * coupled (identity loading), so it cannot be instantiated meaningfully
 * under Node; its composition is mirrored 1:1 below with references.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { RPC_PORT } from '../harness/node-harness';
import { makeSeeder, type Seeder } from '../helpers/forum-seeder';
import { withWriteRetry } from '../helpers/retry';

// --- client code under test ---
import { SwimchainRpc as BridgeRpc } from '../../../bridge-client/src/lib/rpc';
import {
  ActionType,
  TEST_CONFIG,
  createChallenge,
  computePow,
  solutionToRpcParams,
  hexToBytes,
  bytesToHex,
} from '../../../bridge-client/src/lib/action-pow';
import { MATRIX_PREFIX } from '../../../bridge-client/src/types/constants';

const REGTEST_DIFFICULTY = 6;

let seeder: Seeder;
let rpc: BridgeRpc;
let targetSpace: string;
let authorId: string;

// Inbound message fixture (BridgeMessage fields used by processMessage).
const inbound = {
  platform: 'matrix' as const,
  id: '$evt:e2e',
  source: '#bridge-e2e:matrix.org',
  senderDisplayName: 'alice',
  content: 'hello from matrix (e2e)',
};

/** Engine signature blob: actionType(1) || contentHash(32) || ts(8) || nonce(8) */
function engineSignature(
  sign: (m: Uint8Array) => Uint8Array,
  actionType: ActionType,
  contentHash: Uint8Array,
  timestamp: number,
  nonce: bigint,
): string {
  const data = new Uint8Array(1 + 32 + 8 + 8);
  data[0] = actionType;
  data.set(contentHash, 1);
  const view = new DataView(data.buffer);
  view.setBigUint64(33, BigInt(timestamp), false);
  view.setBigUint64(41, nonce, false);
  return bytesToHex(sign(data));
}

let signFn: (m: Uint8Array) => Uint8Array;

beforeAll(async () => {
  seeder = await makeSeeder();
  targetSpace = await seeder.createSpace(`bridge-e2e-${Date.now()}`);

  // Bridge identity: BridgeEngine wires rpc.setIdentity(pubkey, keypair.sign).
  // (@swimchain/core's WASM pkg is not built in-repo, so the keypair comes
  // from the already-initialized seeder wasm — the signFn contract is the
  // same `(Uint8Array) => Uint8Array`.)
  signFn = (m: Uint8Array) => seeder.keypair.sign(m);
  authorId = seeder.authorId;

  rpc = new BridgeRpc({ host: '127.0.0.1', port: RPC_PORT });
  rpc.setIdentity(authorId, signFn);

  // Honor the node's per-IP write rate limit at the transport level
  // (bridge's private rpcCall carries all submit_* traffic).
  const target = rpc as unknown as {
    rpcCall: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  const origRpcCall = target.rpcCall.bind(target);
  target.rpcCall = (method, params) => withWriteRetry(() => origRpcCall(method, params));
}, 120_000);

describe('bridge-client write path (inbound message -> submit_post / submit_reply)', () => {
  let bridgedPostId: string;

  it('bridges an inbound message as a new post the node accepts (fixed composition)', async () => {
    // Fixed processMessage: title = `${prefix}${sender}`, PoW over
    // `${title}\n\n${content}` with ActionType.Post.
    const title = `${MATRIX_PREFIX}${inbound.senderDisplayName}`;
    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode(`${title}\n\n${inbound.content}`),
      hexToBytes(authorId),
      REGTEST_DIFFICULTY,
    );
    const solution = await computePow(challenge, TEST_CONFIG);
    const pow = solutionToRpcParams(solution);

    const result = await rpc.submitPost({
      spaceId: targetSpace,
      title,
      body: inbound.content,
      authorId,
      powNonce: pow.pow_nonce,
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: engineSignature(
        signFn,
        ActionType.Post,
        challenge.contentHash,
        challenge.timestamp,
        solution.nonce,
      ),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    bridgedPostId = result.content_id;

    // On-chain reality via a signed reader.
    const content = await seeder.rpc.getContent(bridgedPostId);
    expect(content.title).toBe(title);
    expect(content.body).toContain(inbound.content);
  });

  it('bridges a follow-up message as a threaded reply (SWIM-B7 + fixed Reply challenge)', async () => {
    expect(bridgedPostId).toBeDefined();
    const followUp = 'and a follow-up in the same thread';

    // Fixed processMessage (threadParentId set): ActionType.Reply mined
    // over the reply body alone.
    const challenge = await createChallenge(
      ActionType.Reply,
      new TextEncoder().encode(followUp),
      hexToBytes(authorId),
      REGTEST_DIFFICULTY,
    );
    const solution = await computePow(challenge, TEST_CONFIG);
    const pow = solutionToRpcParams(solution);

    const result = await rpc.submitReply({
      parentId: bridgedPostId,
      body: followUp,
      authorId,
      powNonce: pow.pow_nonce,
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: engineSignature(
        signFn,
        ActionType.Reply,
        challenge.contentHash,
        challenge.timestamp,
        solution.nonce,
      ),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);

    const replies = await seeder.rpc.getReplies(bridgedPostId);
    const found = replies.replies.find((r) => r.content_id === result.content_id);
    expect(found).toBeDefined();
    expect(found!.body).toContain(followUp);
  });

  it('REJECTS the pre-fix composition (PoW over `${prefix}${sender}] ${content}`)', async () => {
    // Old processMessage behavior: one challenge over the display-formatted
    // string, submitted with title/body that hash differently.
    const formatted = `${MATRIX_PREFIX}${inbound.senderDisplayName}] ${inbound.content} v2`;
    const title = `${MATRIX_PREFIX}${inbound.senderDisplayName}`;

    const challenge = await createChallenge(
      ActionType.Post,
      new TextEncoder().encode(formatted),
      hexToBytes(authorId),
      REGTEST_DIFFICULTY,
    );
    const solution = await computePow(challenge, TEST_CONFIG);
    const pow = solutionToRpcParams(solution);

    await expect(
      rpc.submitPost({
        spaceId: targetSpace,
        title,
        body: `${inbound.content} v2`,
        authorId,
        powNonce: pow.pow_nonce,
        powDifficulty: pow.pow_difficulty,
        powNonceSpace: pow.pow_nonce_space,
        powHash: pow.pow_hash,
        signature: engineSignature(
          signFn,
          ActionType.Post,
          challenge.contentHash,
          challenge.timestamp,
          solution.nonce,
        ),
        timestamp: pow.timestamp,
      }),
    ).rejects.toThrow(/PoW|pow/);
  });
});
