/**
 * Wiki-client write path against a real regtest node.
 *
 * Exercises the CLIENT's own modules end to end:
 *  - wiki-client/src/lib/rpc.ts       (SwimchainRpc signature auth, generic call)
 *  - wiki-client/src/lib/revision.ts  (revision-as-reply encoding)
 *  - @swimchain/frontend action-pow   (wiki's actual PoW dependency)
 *
 * Wiki model (WikiPageEdit.tsx): a page is a submit_post; an edit is a
 * submit_reply whose body carries the wiki-revision header
 * (encodeRevisionBody). The PR #45 byte-fix means PoW is mined over the
 * EXACT bytes the node re-hashes: Post = `${title}\n\n${body}`,
 * Reply = the raw revision body.
 *
 * Coupling note: wiki's write path lives inline in React pages
 * (WikiPageEdit.tsx handleSubmit, Discussion.tsx); the composition is
 * mirrored 1:1 here. Wiki's rpc.ts (a search-client copy) exposes only the
 * generic `call`, which is exactly what the pages use for submission.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { RPC_URL, REPO_ROOT } from '../harness/node-harness';
import { patchRateLimitRetry } from '../helpers/forum-seeder';

// --- client code under test ---
import wasmInit, { WasmKeypair } from '../../../swimchain-frontend/dist/wasm/swimchain_wasm.js';
import { SwimchainRpc } from '../../../wiki-client/src/lib/rpc';
import { encodeRevisionBody, decodeRevisionBody } from '../../../wiki-client/src/lib/revision';
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
let namespaceId: string; // wiki namespace = space

async function minedParams(actionType: ActionType, content: string) {
  const challenge = await createChallenge(
    actionType,
    new TextEncoder().encode(content),
    keypair.publicKey(),
    REGTEST_DIFFICULTY,
  );
  return solutionToRpcParams(await computePow(challenge, TEST_CONFIG));
}

function sign(message: string): string {
  return bytesToHex(keypair.sign(new TextEncoder().encode(message)));
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

  // Provision the namespace (space) via the client's generic transport;
  // wiki has no namespace-creation page yet.
  const name = `wiki-e2e-${Date.now()}`;
  const pow = await minedParams(ActionType.SpaceCreation, name);
  const result = await rpc.call<{ space_id: string; success: boolean }>('create_space', {
    name,
    creator_id: authorId,
    pow_nonce: Number(pow.pow_nonce),
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature: sign(`space:${name}:${pow.timestamp}`),
    timestamp: pow.timestamp,
  });
  expect(result.success).toBe(true);
  namespaceId = result.space_id;
}, 120_000);

describe('wiki-client write path (page create + revision reply, PR #45 byte contract)', () => {
  let pageId: string;
  const pageTitle = 'E2E Wiki Page';
  const pageContent = 'Initial page content.\n\nWith [[WikiLinks]] and **markdown**.';

  it('creates a wiki page via submit_post mining over the exact node bytes', async () => {
    // WikiPageEdit.tsx (isNew): postContent = `${title.trim()}\n\n${content.trim()}`
    const pow = await minedParams(ActionType.Post, `${pageTitle}\n\n${pageContent}`);

    const result = await rpc.call<{ content_id: string }>('submit_post', {
      space_id: namespaceId,
      title: pageTitle,
      body: pageContent,
      author_id: authorId,
      pow_nonce: Number(pow.pow_nonce),
      pow_difficulty: pow.pow_difficulty,
      pow_nonce_space: pow.pow_nonce_space,
      pow_hash: pow.pow_hash,
      signature: sign(`post:${namespaceId}:${pageTitle}:${pageContent}:${pow.timestamp}`),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    pageId = result.content_id;

    const content = await rpc.getContent(pageId);
    expect(content.title).toBe(pageTitle);
    expect(content.body).toContain('Initial page content.');
  });

  it('submits a revision as a reply carrying the wiki-revision header', async () => {
    expect(pageId).toBeDefined();
    const newContent = 'Revised page content with more detail.';
    const summary = 'Expanded the intro';

    // WikiPageEdit.tsx (edit): body = encodeRevisionBody(content, summary),
    // PoW mined over that exact body (the PR #45 fix).
    const revisionBody = encodeRevisionBody(newContent, summary);
    const pow = await minedParams(ActionType.Reply, revisionBody);

    const result = await rpc.call<{ content_id: string }>('submit_reply', {
      parent_id: pageId,
      body: revisionBody,
      author_id: authorId,
      pow_nonce: Number(pow.pow_nonce),
      pow_difficulty: pow.pow_difficulty,
      pow_nonce_space: pow.pow_nonce_space,
      pow_hash: pow.pow_hash,
      signature: sign(`reply:${pageId}:${revisionBody}:${pow.timestamp}`),
      timestamp: pow.timestamp,
    });
    expect(result.content_id).toMatch(/^sha256:[0-9a-f]{64}$/);

    // On-chain reality: revision retrievable under the page, and the
    // revision header decodes back to content + summary.
    const replies = await rpc.call<{
      replies: Array<{ content_id: string; body: string }>;
    }>('get_replies', { content_id: pageId });
    const revision = replies.replies.find((r) => r.content_id === result.content_id);
    expect(revision).toBeDefined();

    const decoded = decodeRevisionBody(revision!.body);
    expect(decoded.isRevision).toBe(true);
    expect(decoded.summary).toBe(summary);
    expect(decoded.content).toBe(newContent);
  });

  it('REJECTS a page PoW mined over the body alone (the pre-#45 bug shape)', async () => {
    const title = 'Broken Page';
    const body = 'mined over body only';

    // Pre-fix wiki bug shape: PoW over body, ignoring the title prefix.
    const pow = await minedParams(ActionType.Post, body);

    await expect(
      rpc.call('submit_post', {
        space_id: namespaceId,
        title,
        body,
        author_id: authorId,
        pow_nonce: Number(pow.pow_nonce),
        pow_difficulty: pow.pow_difficulty,
        pow_nonce_space: pow.pow_nonce_space,
        pow_hash: pow.pow_hash,
        signature: sign(`post:${namespaceId}:${title}:${body}:${pow.timestamp}`),
        timestamp: pow.timestamp,
      }),
    ).rejects.toThrow(/PoW|pow/);
  });
});
