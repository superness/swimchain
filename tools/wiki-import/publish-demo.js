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
 * Write contract (mirrors wiki-client/src/pages/WikiPageEdit.tsx):
 *   - space  : create_space, PoW over `${name}`, sign `space:${name}:${ts}`.
 *   - page   : submit_post,  PoW over `${title}\n\n${body}`, sign the canonical
 *              41-byte action preimage the node verifies (validate_action_signature):
 *              sha256(`${title}\n\n${body}`)(32) || timestamp_LE(8) || private(1)=0.
 *              (The old `post:${space_id}:...` string contract predates the
 *              authorship-verification fix and is now rejected.)
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
import { createHash } from 'node:crypto';
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

/** Sign raw bytes (Buffer/Uint8Array) with the node's identity via sign_message. */
async function signBytesWithNode(bytes) {
  const result = await rpc('sign_message', { message: Buffer.from(bytes).toString('hex') });
  if (!result?.signature) throw new Error('sign_message returned no signature for raw bytes');
  return result.signature;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Wiki namespaces use the general app-space naming convention `@wiki:<display>`, so the
// node segregates them (general clients hide them; the wiki client shows only these) and
// returns the clean display name + app:"wiki". See docs/APP_NAMESPACED_SPACES.md.
const WIKI_APP = 'wiki';
const wikiOnchainName = (display) => `@${WIKI_APP}:${display}`;

/** Find the wiki namespace by display name, or create it. Returns space_id. */
async function ensureSpace(name) {
  const onchainName = wikiOnchainName(name);
  const spaces = await rpc('list_spaces', {});
  const list = Array.isArray(spaces) ? spaces : (spaces?.spaces ?? []);
  // Match on the clean display name AND the wiki app tag (the node strips the marker).
  const existing = list.find((s) => s.app === WIKI_APP && s.name === name);
  if (existing?.space_id) {
    console.log(`Wiki namespace "${name}" already exists: ${existing.space_id}`);
    return existing.space_id;
  }

  console.log(`Creating wiki namespace "${name}" as "${onchainName}" (mining ${NETWORK} SpaceCreation PoW)...`);
  const t0 = Date.now();
  // PoW + signature cover the FULL on-chain name (with the marker) — that's the exact
  // string the node re-hashes for PoW and derives the shared wiki space id from.
  const pow = await mineActionPow(ActionType.SpaceCreation, onchainName, authorBytes, NETWORK);
  console.log(`  mined in ${((Date.now() - t0) / 1000).toFixed(1)}s (difficulty ${pow.pow_difficulty})`);

  const signature = await signWithNode(`space:${onchainName}:${pow.timestamp}`);
  const result = await rpc('create_space', {
    name: onchainName,
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

  // Canonical action preimage (validate_action_signature, v2):
  //   sha256(`${title}\n\n${body}`)(32) || timestamp_LE(8) || private(1)=0
  const contentHash = createHash('sha256').update(`${title}\n\n${body}`, 'utf-8').digest();
  const preimage = Buffer.alloc(41);
  contentHash.copy(preimage, 0);
  preimage.writeBigUInt64LE(BigInt(pow.timestamp), 32);
  preimage[40] = 0;
  const signature = await signBytesWithNode(preimage);
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

// ---- Node-hosted images ------------------------------------------------------
// Pages reference images as `{{media:<file>}}` (file lives in CONTENT_DIR/media).
// At publish time each referenced file is uploaded via upload_media and the
// placeholder becomes `swim:<hash>` — the wiki-client's node-media image scheme
// (wiki-client/src/lib/mediaImages.ts renders `![alt](swim:<hash>)` via get_media).
const MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const mediaHashes = new Map(); // file name -> swim:<hash>

async function uploadMediaFile(name) {
  if (mediaHashes.has(name)) return mediaHashes.get(name);
  const filePath = path.join(CONTENT_DIR, 'media', name);
  const mediaType = MEDIA_TYPES[path.extname(name).toLowerCase()];
  if (!mediaType) throw new Error(`unsupported media extension on ${name}`);
  const data = readFileSync(filePath).toString('base64'); // throws if missing — no silent broken images
  console.log(`Uploading media ${name} (${mediaType})...`);
  const result = await rpc('upload_media', { media_type: mediaType, data });
  const hash = result?.media_hash || result?.hash;
  if (!hash) throw new Error(`upload_media returned no hash for ${name}: ${JSON.stringify(result)}`);
  const ref = `swim:${hash}`;
  console.log(`  ${name} -> ${ref}`);
  mediaHashes.set(name, ref);
  return ref;
}

/** Replace every {{media:<file>}} placeholder in a body, uploading as needed. */
async function resolveMediaPlaceholders(body) {
  const names = [...body.matchAll(/\{\{media:([^}]+)\}\}/g)].map((m) => m[1]);
  let out = body;
  for (const name of new Set(names)) {
    const ref = await uploadMediaFile(name.trim());
    out = out.split(`{{media:${name}}}`).join(ref);
  }
  return out;
}

async function main() {
  console.log(`RPC: ${RPC_URL}  network=${NETWORK}  author=${AUTHOR_PUBKEY.slice(0, 16)}...`);
  console.log(`Content dir: ${CONTENT_DIR}`);

  // Publish every .md in the content dir. Keep the known pages in their curated
  // order, then append any newly added pages alphabetically. This lets the wiki be
  // expanded just by dropping new .md files in the folder.
  const allMd = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const files = [
    ...PAGE_ORDER.filter((f) => allMd.includes(f)),
    ...allMd.filter((f) => !PAGE_ORDER.includes(f)).sort(),
  ];
  console.log(`Found ${files.length} page(s): ${files.join(', ')}`);

  const spaceId = await ensureSpace(SPACE_NAME);

  // Idempotent: skip pages already published to this space (so re-runs and
  // expansions only post what's new).
  const existing = await rpc('list_space_content', { space_id: spaceId, limit: 500 });
  const existingItems = existing?.items ?? existing?.content ?? (Array.isArray(existing) ? existing : []);
  const existingTitles = new Set(existingItems.map((it) => it.title));
  if (existingTitles.size) console.log(`Space already has ${existingTitles.size} page(s); new ones will be added.`);

  const published = [];
  for (const file of files) {
    const { title, body: rawBody } = readPage(file);
    if (existingTitles.has(title)) {
      console.log(`Skipping "${title}" — already on "${SPACE_NAME}"`);
      continue;
    }
    const body = await resolveMediaPlaceholders(rawBody);
    const contentId = await publishPage(spaceId, title, body);
    published.push({ file, title, contentId });
    // Space out write calls (write limit is 20/min); be gentle.
    await sleep(3500);
  }
  console.log(`\nPublished ${published.length} new page(s).`);

  // ---- Verify end to end ----
  console.log('\n=== VERIFY ===');
  const spacesAfter = await rpc('list_spaces', {});
  const spaceList = Array.isArray(spacesAfter) ? spacesAfter : (spacesAfter?.spaces ?? []);
  const mc = spaceList.find((s) => s.app === WIKI_APP && s.name === SPACE_NAME);
  console.log(`list_spaces -> "${SPACE_NAME}" (app=${mc?.app}): space_id=${mc?.space_id} post_count=${mc?.post_count}`);

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
