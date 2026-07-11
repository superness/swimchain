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

/** Wiki namespaces use the general app-space naming convention `@wiki:<display>`, so the
 * node segregates them (general clients hide them; the wiki client shows only these). */
const WIKI_APP = 'wiki';
const wikiSpaceName = (display) => `@${WIKI_APP}:${display}`;

/**
 * Find a wiki space by display name, or create it (SpaceCreation PoW + `space:` signature).
 * The on-chain name carries the `@wiki:` marker; the node returns the clean display name
 * plus `app: "wiki"`, so we match on both to avoid colliding with a same-named forum space.
 * @returns {Promise<string>} space_id
 */
export async function ensureSpace(rpc, keypair, name, network) {
  const onchainName = wikiSpaceName(name);
  try {
    const spaces = await rpc.call('list_spaces', {});
    const list = Array.isArray(spaces) ? spaces : (spaces?.spaces ?? []);
    const existing = list.find((s) => s.app === WIKI_APP && s.name === name);
    if (existing?.space_id) {
      return existing.space_id;
    }
  } catch {
    // list_spaces unavailable — fall through to create
  }

  // PoW and signature cover the FULL on-chain name (with the marker) — that's the exact
  // string the node re-hashes for PoW and derives the shared space id from.
  const pow = await mineActionPow(ActionType.SpaceCreation, onchainName, keypair.publicKeyBytes, network);
  const result = await rpc.call('create_space', {
    name: onchainName,
    creator_id: keypair.publicKeyHex,
    pow_nonce: pow.pow_nonce,
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature: keypair.sign(`space:${onchainName}:${pow.timestamp}`),
    timestamp: pow.timestamp,
  });
  if (!result?.success || !result.space_id) {
    throw new Error(`create_space failed for "${onchainName}": ${JSON.stringify(result)}`);
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
