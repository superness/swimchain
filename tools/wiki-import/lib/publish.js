/**
 * Publisher: posts converted pages into a swimchain wiki namespace using
 * wiki-client's OWN write contract (WikiPageEdit.tsx + the PR #45 revision
 * model, mirrored 1:1 by tests/e2e-write-paths/tests/wiki.test.ts):
 *
 *  - A wiki page is a `submit_post` into the namespace (= space).
 *  - Action PoW is mined over the EXACT node bytes: `${title}\n\n${body}`.
 *  - The post is signed `post:${space_id}:${title}:${body}:${timestamp}`
 *    with the author's Ed25519 keypair (author_id = pubkey hex).
 */

import { ActionType, mineActionPow } from './pow.js';

/**
 * Find a space by name, or create it (SpaceCreation PoW + `space:` signature).
 * @returns {Promise<string>} space_id
 */
export async function ensureSpace(rpc, keypair, name, network) {
  try {
    const spaces = await rpc.call('list_spaces', {});
    const list = Array.isArray(spaces) ? spaces : (spaces?.spaces ?? []);
    const existing = list.find((s) => s.name === name);
    if (existing?.space_id) {
      return existing.space_id;
    }
  } catch {
    // list_spaces unavailable — fall through to create
  }

  const pow = await mineActionPow(ActionType.SpaceCreation, name, keypair.publicKeyBytes, network);
  const result = await rpc.call('create_space', {
    name,
    creator_id: keypair.publicKeyHex,
    pow_nonce: pow.pow_nonce,
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature: keypair.sign(`space:${name}:${pow.timestamp}`),
    timestamp: pow.timestamp,
  });
  if (!result?.success || !result.space_id) {
    throw new Error(`create_space failed for "${name}": ${JSON.stringify(result)}`);
  }
  return result.space_id;
}

/**
 * Publish one wiki page (new page = submit_post, per WikiPageEdit.tsx isNew path).
 * @returns {Promise<string>} content_id
 */
export async function publishPage(rpc, keypair, { spaceId, title, body, network }) {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();

  // PR #45 byte contract: PoW mined over the exact bytes the node re-hashes.
  const pow = await mineActionPow(
    ActionType.Post,
    `${cleanTitle}\n\n${cleanBody}`,
    keypair.publicKeyBytes,
    network,
  );

  const result = await rpc.call('submit_post', {
    space_id: spaceId,
    title: cleanTitle,
    body: cleanBody,
    author_id: keypair.publicKeyHex,
    pow_nonce: pow.pow_nonce,
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature: keypair.sign(`post:${spaceId}:${cleanTitle}:${cleanBody}:${pow.timestamp}`),
    timestamp: pow.timestamp,
  });
  if (!result?.content_id) {
    throw new Error(`submit_post returned no content_id for "${cleanTitle}": ${JSON.stringify(result)}`);
  }
  return result.content_id;
}
