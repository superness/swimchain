/**
 * update-demo.js — Publish REVISIONS of already-live demo wiki pages.
 *
 * publish-demo.js creates pages (Posts); this tool updates them: for each
 * CONTENT_DIR/*.md it finds the live page by title in the target space and
 * submits a wiki-revision reply (the client convention from
 * wiki-client/src/lib/revision.ts — a Reply whose body carries the
 * `<!--wiki-revision v1 ... -->` header). `{{media:<file>}}` placeholders are
 * uploaded via upload_media and become `swim:<hash>` refs, exactly like
 * publish-demo.js. Pages whose current latest revision already equals the
 * local content are skipped (idempotent re-runs).
 *
 * Usage (run against the node that should author the revisions):
 *   RPC_URL=http://127.0.0.1:19736 RPC_COOKIE=<hex> AUTHOR_PUBKEY=<hex> \
 *   NETWORK=testnet SPACE_NAME=Minecraft SUMMARY="add bespoke pixel art" \
 *   node update-demo.js
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
const SUMMARY = process.env.SUMMARY || 'update';
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(__dirname, 'minecraft-demo');

if (!RPC_COOKIE) throw new Error('RPC_COOKIE required');
if (!AUTHOR_PUBKEY) throw new Error('AUTHOR_PUBKEY required');

const AUTH = 'Basic ' + Buffer.from(`__cookie__:${RPC_COOKIE}`).toString('base64');
const authorBytes = hexToBytes(AUTHOR_PUBKEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (b) => createHash('sha256').update(b).digest();

let rpcId = 0;
async function rpc(method, params) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    const json = JSON.parse(await res.text());
    if (json.error) {
      if (/rate limit|too many/i.test(json.error.message || '') && attempt < 6) {
        await sleep(6000);
        continue;
      }
      throw new Error(`${method}: ${json.error.message}`);
    }
    await sleep(400);
    return json.result;
  }
}
const signHex = async (bytes) =>
  (await rpc('sign_message', { message: Buffer.from(bytes).toString('hex') })).signature;

// Canonical reply-action signature preimage: contentHash(32) || ts_le(8) || private(1)=0
function sigPreimage(contentHash32, timestamp) {
  const b = Buffer.alloc(41);
  Buffer.from(contentHash32).copy(b, 0);
  b.writeBigUInt64LE(BigInt(timestamp), 32);
  b[40] = 0;
  return b;
}

// ---- media (same contract as publish-demo.js) --------------------------------
const MEDIA_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const mediaHashes = new Map();
async function uploadMediaFile(name) {
  if (mediaHashes.has(name)) return mediaHashes.get(name);
  const filePath = path.join(CONTENT_DIR, 'media', name);
  const mediaType = MEDIA_TYPES[path.extname(name).toLowerCase()];
  if (!mediaType) throw new Error(`unsupported media extension on ${name}`);
  const data = readFileSync(filePath).toString('base64');
  const result = await rpc('upload_media', { media_type: mediaType, data });
  const hash = result?.media_hash || result?.hash;
  if (!hash) throw new Error(`upload_media returned no hash for ${name}`);
  const ref = `swim:${hash}`;
  console.log(`  media ${name} -> ${ref.slice(0, 24)}…`);
  mediaHashes.set(name, ref);
  return ref;
}
async function resolveMediaPlaceholders(body) {
  const names = [...body.matchAll(/\{\{media:([^}]+)\}\}/g)].map((m) => m[1]);
  let out = body;
  for (const name of new Set(names)) {
    const ref = await uploadMediaFile(name.trim());
    out = out.split(`{{media:${name}}}`).join(ref);
  }
  return out;
}

// ---- page parsing (same as publish-demo.js) -----------------------------------
function parsePage(file) {
  const raw = readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
  const lines = raw.split(/\r?\n/);
  const h1Index = lines.findIndex((l) => l.startsWith('# '));
  if (h1Index === -1) throw new Error(`${file}: no H1 title line`);
  const title = lines[h1Index].slice(2).trim();
  const body = lines.slice(h1Index + 1).join('\n').trim();
  return { title, body };
}

// Revision encoding (wiki-client/src/lib/revision.ts, v1)
const REVISION_MARKER = '<!--wiki-revision v1';
function encodeRevisionBody(content, summary) {
  const safe = summary.replace(/\r?\n/g, ' ').replace(/-->/g, '--​>').trim();
  return `${REVISION_MARKER}\nsummary: ${safe}\n-->\n${content}`;
}

async function main() {
  // Find the target space by name.
  const { spaces } = await rpc('list_spaces', { limit: 200 });
  const space = spaces.find((s) => s.name === SPACE_NAME);
  if (!space) throw new Error(`space named '${SPACE_NAME}' not found on this node`);
  console.log(`space ${SPACE_NAME}: ${space.space_id}`);

  // Map live pages by title.
  const { items } = await rpc('list_space_content', { space_id: space.space_id, limit: 200 });
  const byTitle = new Map(items.map((it) => [(it.title || '').trim(), it]));

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const { title, body } = parsePage(file);
    const page = byTitle.get(title);
    if (!page) {
      console.log(`SKIP ${file}: no live page titled '${title}'`);
      continue;
    }
    const resolved = await resolveMediaPlaceholders(body);
    const revBody = encodeRevisionBody(resolved, SUMMARY);

    console.log(`revising '${title}' (${page.content_id.slice(0, 20)}…) — mining…`);
    const pow = await mineActionPow(ActionType.Reply, revBody, authorBytes, NETWORK);
    const ch = sha256(Buffer.from(revBody, 'utf-8'));
    const sig = await signHex(sigPreimage(ch, pow.timestamp));
    await rpc('submit_reply', {
      parent_id: page.content_id,
      body: revBody,
      author_id: AUTHOR_PUBKEY,
      ...pow,
      signature: sig,
    });
    console.log(`  revised ✓`);
  }
  console.log('DONE');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
