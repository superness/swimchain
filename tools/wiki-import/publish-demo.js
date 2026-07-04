/**
 * publish-demo.js — Publish the Minecraft demo wiki pages to a LIVE swimchain
 * node WITHOUT holding the node's private seed.
 *
 * How signing works here (vs. lib/publish.js which needs a local keypair):
 *   - RPC transport auth  = HTTP Basic cookie header (__cookie__:<hex>).
 *   - Content signatures   = produced by the node itself via the `sign_message`
 *     RPC (localhost-exempt). We hand it the exact string to sign, it signs with
 *     the node's own Ed25519 identity and returns the signature hex. The
 *     author_id we submit is therefore the node's public key.
 *
 * Write contract (mirrors lib/publish.js + tests/e2e-write-paths wiki.test.ts):
 *   - space  : create_space, PoW over `${name}`, sign `space:${name}:${ts}`.
 *   - page   : submit_post,  PoW over `${title}\n\n${body}`,
 *              sign `post:${space_id}:${title}:${body}:${ts}`.
 *
 * Usage (run ON the droplet, RPC is localhost-bound):
 *   RPC_URL=http://127.0.0.1:19736 \
 *   RPC_COOKIE=<cookie-hex> \
 *   AUTHOR_PUBKEY=<node-pubkey-hex> \
 *   NETWORK=testnet \
 *   CONTENT_DIR=./minecraft-demo \
 *   node publish-demo.js
 */

import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:19736';
const RPC_COOKIE = process.env.RPC_COOKIE || '';
const AUTHOR_PUBKEY = process.env.AUTHOR_PUBKEY || '';
const NETWORK = process.env.NETWORK || 'testnet';
const SPACE_NAME = process.env.SPACE_NAME || 'Minecraft';
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(__dirname, 'minecraft-demo');

// Publish pages in a stable, sensible order.
const PAGE_ORDER = ['creeper.md', 'redstone.md', 'crafting.md', 'the-nether.md'];

if (!RPC_COOKIE) throw new Error('RPC_COOKIE (node .cookie hex) is required');
if (!AUTHOR_PUBKEY) throw new Error('AUTHOR_PUBKEY (node public key hex) is required');

const AUTH_HEADER = 'Basic ' + Buffer.from(`__cookie__:${RPC_COOKIE}`).toString('base64');
const authorBytes = hexToBytes(AUTHOR_PUBKEY);

let rpcId = 0;
async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
      body,
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5;
      if (attempt >= 6) throw new Error(`${method}: rate limited, gave up after ${attempt} retries`);
      console.log(`  rate limited on ${method}; waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`${method}: non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
    if (json.error) {
      // Rate-limit style errors sometimes come back in the JSON body too.
      const msg = json.error.message || JSON.stringify(json.error);
      if (/rate limit|too many/i.test(msg) && attempt < 6) {
        console.log(`  ${method} rate-limited (json); waiting 6s...`);
        await sleep(6000);
        continue;
      }
      throw new Error(`${method} RPC error: ${msg}`);
    }
    return json.result;
  }
}

/** Sign an arbitrary string with the node's own identity via sign_message. */
async function signWithNode(message) {
  const messageHex = Buffer.from(message, 'utf-8').toString('hex');
  const result = await rpc('sign_message', { message: messageHex });
  if (!result?.signature) throw new Error(`sign_message returned no signature for "${message.slice(0, 40)}..."`);
  return result.signature;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Find the space by name, or create it. Returns space_id. */
async function ensureSpace(name) {
  const spaces = await rpc('list_spaces', {});
  const list = Array.isArray(spaces) ? spaces : (spaces?.spaces ?? []);
  const existing = list.find((s) => s.name === name);
  if (existing?.space_id) {
    console.log(`Space "${name}" already exists: ${existing.space_id}`);
    return existing.space_id;
  }

  console.log(`Creating space "${name}" (mining ${NETWORK} SpaceCreation PoW)...`);
  const t0 = Date.now();
  const pow = await mineActionPow(ActionType.SpaceCreation, name, authorBytes, NETWORK);
  console.log(`  mined in ${((Date.now() - t0) / 1000).toFixed(1)}s (difficulty ${pow.pow_difficulty})`);

  const signature = await signWithNode(`space:${name}:${pow.timestamp}`);
  const result = await rpc('create_space', {
    name,
    creator_id: AUTHOR_PUBKEY,
    pow_nonce: pow.pow_nonce,
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature,
    timestamp: pow.timestamp,
  });
  if (!result?.success || !result.space_id) {
    throw new Error(`create_space failed: ${JSON.stringify(result)}`);
  }
  console.log(`  created space_id=${result.space_id}`);
  return result.space_id;
}

/** Publish one page as a submit_post. Returns content_id. */
async function publishPage(spaceId, title, body) {
  console.log(`Publishing "${title}" (mining ${NETWORK} Post PoW)...`);
  const t0 = Date.now();
  const pow = await mineActionPow(ActionType.Post, `${title}\n\n${body}`, authorBytes, NETWORK);
  console.log(`  mined in ${((Date.now() - t0) / 1000).toFixed(1)}s (difficulty ${pow.pow_difficulty})`);

  const signature = await signWithNode(`post:${spaceId}:${title}:${body}:${pow.timestamp}`);
  const result = await rpc('submit_post', {
    space_id: spaceId,
    title,
    body,
    author_id: AUTHOR_PUBKEY,
    pow_nonce: pow.pow_nonce,
    pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space,
    pow_hash: pow.pow_hash,
    signature,
    timestamp: pow.timestamp,
  });
  if (!result?.content_id) {
    throw new Error(`submit_post returned no content_id for "${title}": ${JSON.stringify(result)}`);
  }
  console.log(`  content_id=${result.content_id}`);
  return result.content_id;
}

/** Read a demo markdown file -> { title, body }. Title = first '# ' line. */
function readPage(file) {
  const raw = readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
  const lines = raw.split('\n');
  const h1Index = lines.findIndex((l) => l.startsWith('# '));
  if (h1Index === -1) throw new Error(`${file}: no H1 title line`);
  const title = lines[h1Index].slice(2).trim();
  const body = lines.slice(h1Index + 1).join('\n').trim();
  return { title, body };
}

async function main() {
  console.log(`RPC: ${RPC_URL}  network=${NETWORK}  author=${AUTHOR_PUBKEY.slice(0, 16)}...`);
  console.log(`Content dir: ${CONTENT_DIR}`);

  const files = PAGE_ORDER.filter((f) => readdirSync(CONTENT_DIR).includes(f));
  if (files.length !== PAGE_ORDER.length) {
    console.warn(`Warning: expected ${PAGE_ORDER.length} files, found ${files.length}`);
  }

  const spaceId = await ensureSpace(SPACE_NAME);

  const published = [];
  for (const file of files) {
    const { title, body } = readPage(file);
    const contentId = await publishPage(spaceId, title, body);
    published.push({ file, title, contentId });
    // Space out write calls (write limit is 20/min); be gentle.
    await sleep(3500);
  }

  // ---- Verify end to end ----
  console.log('\n=== VERIFY ===');
  const spacesAfter = await rpc('list_spaces', {});
  const spaceList = Array.isArray(spacesAfter) ? spacesAfter : (spacesAfter?.spaces ?? []);
  const mc = spaceList.find((s) => s.name === SPACE_NAME);
  console.log(`list_spaces -> "${SPACE_NAME}": space_id=${mc?.space_id} post_count=${mc?.post_count}`);

  const content = await rpc('list_space_content', { space_id: spaceId, limit: 50, sort: 'recent' });
  const items = content?.items ?? content?.content ?? (Array.isArray(content) ? content : []);
  console.log(`list_space_content -> ${items.length} items:`);
  for (const it of items) {
    console.log(`  - ${it.title ?? '(no title)'}  [${it.content_id}]`);
  }

  // Round-trip one page's full body via get_content.
  const sample = published[0];
  const full = await rpc('get_content', { content_id: sample.contentId });
  const bodyStr = full?.body ?? '';
  const hasAttribution = bodyStr.includes('AI-generated as original prose');
  console.log(`\nget_content("${sample.title}"): title="${full?.title}" bodyLen=${bodyStr.length} attributionFooter=${hasAttribution}`);

  console.log('\n=== SUMMARY ===');
  console.log(`space_id: ${spaceId}`);
  published.forEach((p) => console.log(`  ${p.title}: ${p.contentId}`));

  const titlesOnNode = new Set(items.map((it) => it.title));
  const allPresent = published.every((p) => titlesOnNode.has(p.title));
  console.log(`\nAll ${published.length} pages present on node: ${allPresent}`);
  if (!allPresent) process.exitCode = 1;
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
