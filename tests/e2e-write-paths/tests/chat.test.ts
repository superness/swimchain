/**
 * Chat-client write path against a real regtest node.
 *
 * Exercises the CLIENT's own modules end to end:
 *  - chat-client/src/lib/rpc.ts            (SwimchainRpc signature auth + submit_*)
 *  - @swimchain/frontend action-pow        (chat's actual PoW dependency)
 *  - @swimchain/frontend wasm WasmKeypair  (Ed25519 signing, same instance
 *    chat's rpc.ts uses via `wasm.WasmKeypair.fromSeed`)
 *
 * Chat model: a "channel" is a thread created via submit_post (title=name,
 * body='') and a "message" is a chat post; threaded messages go via
 * submit_reply (useRpc.tsx submitReply).
 *
 * FINDING (fixed in this PR): useMessageInput submitted messages with
 * title=body=content but mined PoW over the bare content bytes. The node
 * verifies post PoW over `${title}\n\n${body}`, so every chat message sent
 * through useMessageInput was rejected by a real node. The negative test
 * pins the old composition as rejected.
 *
 * Coupling note: chat has no space-creation feature (servers are expected to
 * exist); the test provisions its space through the client's generic
 * rpc.call('create_space') transport.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { RPC_URL, REPO_ROOT } from '../harness/node-harness';
import { patchRateLimitRetry } from '../helpers/forum-seeder';

// --- client code under test ---
// Chat's rpc.ts consumes this exact wasm module via `@swimchain/frontend`;
// npm `file:` links resolve to the same real path, so initializing here
// initializes the instance chat uses.
import wasmInit, { WasmKeypair } from '../../../swimchain-frontend/dist/wasm/swimchain_wasm.js';
import { SwimchainRpc } from '../../../chat-client/src/lib/rpc';
import {
  ActionType,
  TEST_CONFIG,
  createChallenge,
  computePow,
  solutionToRpcParams,
  bytesToHex,
} from '../../../swimchain-frontend/dist/lib/action-pow.js';

const REGTEST_DIFFICULTY = 6;

let keypair: WasmKeypair;
let authorId: string;
let rpc: SwimchainRpc;
let serverId: string; // chat "server" = space

async function minedParams(actionType: ActionType, content: string) {
  const challenge = await createChallenge(
    actionType,
    new TextEncoder().encode(content),
    keypair.publicKey(),
    REGTEST_DIFFICULTY,
  );
  return solutionToRpcParams(await computePow(challenge, TEST_CONFIG));
}

beforeAll(async () => {
  const wasmBytes = readFileSync(
    path.join(REPO_ROOT, 'swimchain-frontend', 'dist', 'wasm', 'swimchain_wasm_bg.wasm'),
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

  // Provision the "server" (space) via chat's generic RPC transport.
  const name = `chat-e2e-${Date.now()}`;
  const pow = await minedParams(ActionType.SpaceCreation, name);
  const sig = keypair.sign(new TextEncoder().encode(`space:${name}:${pow.timestamp}`));
  const result = await rpc.call<{ space_id: string; success: boolean }>('create_space', {
    name,
    creator_id: authorId,
    pow_nonce: Number(pow.pow_nonce),
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature: bytesToHex(sig),
    timestamp: pow.timestamp,
  });
  expect(result.success).toBe(true);
  serverId = result.space_id;
}, 120_000);

describe('chat-client write path (channel via submit_post, message via submit_reply)', () => {
  let channelId: string;

  it('creates a channel (thread) via submit_post and the node accepts it', async () => {
    const name = 'general';

    // useChannels.ts useCreateChannel submits title=name, body=''.
    // Node verifies post PoW over `${title}\n\n${body}` = `${name}\n\n`.
    const pow = await minedParams(ActionType.Post, `${name}\n\n`);

    // Signature mirrors useChannels.ts: `post:${serverId}:${name}::${timestamp}`
    const sig = keypair.sign(
      new TextEncoder().encode(`post:${serverId}:${name}::${pow.timestamp}`),
    );

    const result = await rpc.submitPost({
      spaceId: serverId,
      title: name,
      body: '',
      authorId,
      powNonce: Number(pow.pow_nonce),
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: bytesToHex(sig),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    channelId = result.content_id;

    const content = await rpc.getContent(channelId);
    expect(content.title).toBe(name);
  });

  it('sends a threaded message via submit_reply and it appears under the channel', async () => {
    expect(channelId).toBeDefined();
    const body = `chat message at ${new Date().toISOString()}`;

    // Reply PoW is mined over the body (useActionPow.ts mineReply).
    const pow = await minedParams(ActionType.Reply, body);

    // Signature mirrors chat useRpc.tsx: `reply:${parentId}:${body}:${ts}`
    const sig = keypair.sign(
      new TextEncoder().encode(`reply:${channelId}:${body}:${pow.timestamp}`),
    );

    const result = await rpc.submitReply({
      parentId: channelId,
      body,
      authorId,
      powNonce: Number(pow.pow_nonce),
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: bytesToHex(sig),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);

    const replies = await rpc.getReplies(channelId);
    const found = replies.replies.find((r) => r.content_id === result.content_id);
    expect(found).toBeDefined();
    expect(found!.body).toContain(body);
  });

  it('REJECTS the pre-fix message composition (PoW over bare content, title=body=content)', async () => {
    const content = 'hello world (pre-fix composition)';

    // Old useMessageInput behavior: minePost(content) but submit
    // title=content, body=content — node re-hashes `${c}\n\n${c}` and the
    // challenge no longer matches.
    const pow = await minedParams(ActionType.Post, content);
    const sig = keypair.sign(
      new TextEncoder().encode(`post:${serverId}:${content}:${content}:${pow.timestamp}`),
    );

    await expect(
      rpc.submitPost({
        spaceId: serverId,
        title: content,
        body: content,
        authorId,
        powNonce: Number(pow.pow_nonce),
        powDifficulty: pow.pow_difficulty,
        powNonceSpace: pow.pow_nonce_space,
        powHash: pow.pow_hash,
        signature: bytesToHex(sig),
        timestamp: pow.timestamp,
      }),
    ).rejects.toThrow(/PoW|pow/);
  });

  it('ACCEPTS the fixed message composition (PoW over `${c}\\n\\n${c}`)', async () => {
    const content = `hello world at ${Date.now()}`;

    // Fixed useMessageInput behavior: minePost(`${c}\n\n${c}`).
    const pow = await minedParams(ActionType.Post, `${content}\n\n${content}`);
    const sig = keypair.sign(
      new TextEncoder().encode(`post:${serverId}:${content}:${content}:${pow.timestamp}`),
    );

    const result = await rpc.submitPost({
      spaceId: serverId,
      title: content,
      body: content,
      authorId,
      powNonce: Number(pow.pow_nonce),
      powDifficulty: pow.pow_difficulty,
      powNonceSpace: pow.pow_nonce_space,
      powHash: pow.pow_hash,
      signature: bytesToHex(sig),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);

    const stored = await rpc.getContent(result.content_id);
    expect(stored.body).toContain(content);
  });
});
