/**
 * Test-setup helper: seed the regtest chain with a space + post, and provide
 * a signed reader for on-chain assertions.
 *
 * Built on the forum client's already-validated modules (see forum.test.ts).
 * Used by tests whose client under test cannot create spaces/posts itself
 * (archiver only engages, bridge posts into a pre-configured space) or
 * cannot authenticate reads (archiver sends unauthenticated reads).
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, RPC_URL } from '../harness/node-harness';

import wasmInit, { WasmKeypair } from '../../../forum-client/src/wasm/swimchain_wasm.js';
import { SwimchainRpc } from '../../../forum-client/src/lib/rpc';
import {
  ActionType,
  TEST_CONFIG,
  createChallenge,
  computePow,
  solutionToRpcParams,
  bytesToHex,
} from '../../../forum-client/src/lib/action-pow';
import { withWriteRetry } from './retry';

/**
 * Honor the node's per-IP write rate limit (HTTP 429 + Retry-After) at the
 * transport level. The client's own code still runs unmodified; only rate
 * limit responses are retried.
 */
export function patchRateLimitRetry(rpc: { call: (...args: never[]) => Promise<unknown> }): void {
  const target = rpc as unknown as {
    call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  const orig = target.call.bind(target);
  target.call = (method, params) => withWriteRetry(() => orig(method, params));
}

export interface Seeder {
  rpc: SwimchainRpc;
  keypair: WasmKeypair;
  authorId: string;
  createSpace(name: string): Promise<string>;
  createPost(spaceId: string, title: string, body: string): Promise<string>;
}

export async function makeSeeder(): Promise<Seeder> {
  const wasmBytes = readFileSync(
    path.join(REPO_ROOT, 'forum-client', 'src', 'wasm', 'swimchain_wasm_bg.wasm'),
  );
  await wasmInit({ module_or_path: wasmBytes });

  const keypair = new WasmKeypair();
  const authorId = bytesToHex(keypair.publicKey());
  const rpc = new SwimchainRpc({
    endpoint: RPC_URL,
    seed: bytesToHex(keypair.seed()),
    publicKey: authorId,
  });
  if (!(await rpc.connect())) {
    throw new Error(`seeder could not connect to ${RPC_URL}`);
  }
  patchRateLimitRetry(rpc);

  const sign = (msg: string) =>
    bytesToHex(keypair.sign(new TextEncoder().encode(msg)));

  const mined = async (actionType: ActionType, content: string) => {
    const challenge = await createChallenge(
      actionType,
      new TextEncoder().encode(content),
      keypair.publicKey(),
      6,
    );
    return solutionToRpcParams(await computePow(challenge, TEST_CONFIG));
  };

  return {
    rpc,
    keypair,
    authorId,
    async createSpace(name: string): Promise<string> {
      const pow = await mined(ActionType.SpaceCreation, name);
      const result = await rpc.createSpace({
        name,
        creatorId: authorId,
        powNonce: pow.pow_nonce,
        powDifficulty: pow.pow_difficulty,
        powNonceSpace: pow.pow_nonce_space,
        powHash: pow.pow_hash,
        signature: sign(`space:${name}:${pow.timestamp}`),
        timestamp: pow.timestamp,
      });
      if (!result.success) throw new Error(`seeder createSpace failed: ${name}`);
      return result.space_id;
    },
    async createPost(spaceId: string, title: string, body: string): Promise<string> {
      const pow = await mined(ActionType.Post, `${title}\n\n${body}`);
      const result = await rpc.submitPost({
        spaceId,
        title,
        body,
        authorId,
        powNonce: pow.pow_nonce,
        powDifficulty: pow.pow_difficulty,
        powNonceSpace: pow.pow_nonce_space,
        powHash: pow.pow_hash,
        signature: sign(`post:${spaceId}:${title}:${body}:${pow.timestamp}`),
        timestamp: pow.timestamp,
      });
      return result.content_id;
    },
  };
}
