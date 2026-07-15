/**
 * storm.mjs — stress-test action storm. Runs a weighted mix of REAL client
 * actions (posts, replies, reacts, space creations, profile changes, reef
 * game moves) against one node's RPC in a loop, exactly the way the clients
 * submit them (same PoW, same canonical signatures).
 *
 * Auth modes:
 *   AUTH_MODE=cookie     (default) — RPC_COOKIE required (droplets, local qa nodes)
 *   AUTH_MODE=signature  — x-cs-* headers signed via the node's own sign_message
 *                          (the phone: cookie is sealed inside the app, but
 *                          sign_message is auth-exempt and signs with the node
 *                          identity, which is exactly who we act as)
 *
 * Env:
 *   RPC_URL         target node (default http://127.0.0.1:19736)
 *   AUTHOR_PUBKEY   identity pubkey hex (must be the node's own identity)
 *   RPC_COOKIE      cookie (cookie mode only)
 *   STORM_MS        how long to run (default 600000 = 10 min)
 *   STORM_GAP_MS    base gap between actions per worker (default 2000; jittered)
 *   STORM_WORKERS   parallel workers (default 1)
 *   STORM_TAG       label for log lines (default host)
 *
 * Action mix: react 40, reply 20, post 12, game-move 15, profile 8, create-space 5.
 */
import { createHash, randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { argon2id } from 'hash-wasm';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19736';
const AUTHOR = process.env.AUTHOR_PUBKEY || '';
const COOKIE = process.env.RPC_COOKIE || '';
const MODE = process.env.AUTH_MODE || 'cookie';
const STORM_MS = Number(process.env.STORM_MS || 600000);
const GAP_MS = Number(process.env.STORM_GAP_MS || 2000);
const WORKERS = Number(process.env.STORM_WORKERS || 1);
const TAG = process.env.STORM_TAG || 'storm';
const NET = 'testnet';
if (!AUTHOR) throw new Error('AUTHOR_PUBKEY required');
if (MODE === 'cookie' && !COOKIE) throw new Error('RPC_COOKIE required in cookie mode');
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = Buffer.from(AUTHOR, 'hex');

const ActionType = { SpaceCreation: 1, Post: 2, Reply: 3, Engage: 4 };
const POW_CONFIG = { testnet: { memoryKib: 8192, iterations: 1, parallelism: 2 } };
const POW_DIFF = { testnet: { 1: 12, 2: 10, 3: 8, 4: 6 } };
const sha256 = (b) => createHash('sha256').update(b).digest();
const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// bech32m space-id encoding (profile spaces) — matches the node's encode_space_id.
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function b32Polymod(v) { let c = 1; const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; for (const x of v) { const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c >>> 0; }
function b32HrpExpand(h) { const r = []; for (const ch of h) r.push(ch.charCodeAt(0) >> 5); r.push(0); for (const ch of h) r.push(ch.charCodeAt(0) & 31); return r; }
function b32ConvertBits(data, from, to, pad) { let acc = 0, bits = 0; const ret = []; const maxv = (1 << to) - 1; for (const b of data) { acc = (acc << from) | b; bits += from; while (bits >= to) { bits -= to; ret.push((acc >> bits) & maxv); } } if (pad && bits > 0) ret.push((acc << (to - bits)) & maxv); return ret; }
function encodeSpaceId(bytes16) { const data5 = b32ConvertBits([0, ...bytes16], 8, 5, true); const pm = b32Polymod(b32HrpExpand('sp').concat(data5, [0, 0, 0, 0, 0, 0])) ^ 0x2bc830a3; const chk = []; for (let i = 0; i < 6; i++) chk.push((pm >> (5 * (5 - i))) & 31); let s = 'sp1'; for (const d of data5.concat(chk)) s += B32[d]; return s; }

let rpcId = 0;
/** Un-authed (exempt) call — used for sign_message in signature mode. */
async function rpcBare(method, params, timeoutMs = 20000) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

async function signBytesWithNode(buf) {
  const call = MODE === 'cookie' ? rpc : rpcBare;
  const r = await call('sign_message', { message: Buffer.from(buf).toString('hex') });
  if (!r?.signature) throw new Error('sign_message returned no signature');
  return r.signature;
}

/** Authed call — cookie header, or x-cs signature headers over the exact params JSON. */
async function rpc(method, params, timeoutMs = 30000) {
  const paramsJson = JSON.stringify(params ?? {});
  const headers = { 'Content-Type': 'application/json' };
  if (MODE === 'cookie') {
    headers.Authorization = AUTH;
  } else {
    // "swimchain-rpc:" + method + ":" + hex(sha256(params_json)) + ":" + timestamp
    const ts = String(Math.floor(Date.now() / 1000));
    const preimage = `swimchain-rpc:${method}:${sha256(Buffer.from(paramsJson, 'utf-8')).toString('hex')}:${ts}`;
    const sig = await (async () => {
      const r = await rpcBare('sign_message', { message: Buffer.from(preimage, 'utf-8').toString('hex') });
      if (!r?.signature) throw new Error('sign_message returned no signature');
      return r.signature;
    })();
    headers['x-cs-identity'] = AUTHOR;
    headers['x-cs-timestamp'] = ts;
    headers['x-cs-signature'] = sig;
  }
  // Body must byte-match the signed params JSON (server hashes the raw params field).
  const body = `{"jsonrpc":"2.0","id":${++rpcId},"method":${JSON.stringify(method)},"params":${paramsJson}}`;
  const res = await fetch(RPC, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

function actionSigPreimage(contentHash32, timestamp, isPrivate = false) {
  const b = Buffer.alloc(41);
  Buffer.from(contentHash32).copy(b, 0);
  b.writeBigUInt64LE(BigInt(timestamp), 32);
  b[40] = isPrivate ? 1 : 0;
  return b;
}

async function minePow(actionType, contentHash32) {
  const config = POW_CONFIG[NET];
  const difficulty = POW_DIFF[NET][actionType];
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = randomBytes(8);
  const input = Buffer.alloc(90);
  input[0] = actionType;
  contentHash32.copy(input, 1);
  authorBytes.copy(input, 33);
  input.writeBigUInt64BE(BigInt(timestamp), 65);
  input[73] = difficulty;
  nonceSpace.copy(input, 74);
  let nonce = 0n;
  for (;;) {
    input.writeBigUInt64BE(nonce, 82);
    const hash = await argon2id({ password: new Uint8Array(input), salt: new Uint8Array(nonceSpace), parallelism: config.parallelism, memorySize: config.memoryKib, iterations: config.iterations, hashLength: 32, outputType: 'binary' });
    if (leadingZeros(hash) >= difficulty) {
      return { pow_nonce: Number(nonce), pow_difficulty: difficulty, pow_nonce_space: nonceSpace.toString('hex'), pow_hash: Buffer.from(hash).toString('hex'), timestamp };
    }
    nonce++;
  }
}

// ---- content pools ----
const TITLES = ['Storm check', 'Load report', 'High tide', 'Choppy waters', 'Pressure test', 'Squall notes', 'Barometer reading'];
const BODIES = ['Riding the surge.', 'Waves stacking up nicely.', 'All hands posting.', 'The current is strong today.', 'Storm swell incoming.', 'Testing the hull under load.', 'Full sails in the gale.'];
const REPLIES = ['Hold fast!', 'Surge confirmed.', 'Reading you through the storm.', 'Signal is clear.', 'More wind!', 'Steady as she goes.', 'Echo from the deep.'];
const SPACE_NAMES = ['Stormwatch', 'Galehouse', 'Squall Line', 'Barometer', 'Windward', 'Leeward', 'Breakwater'];
const PROFILE_NAMES = ['StormRider', 'GaleForce', 'SquallSeeker', 'TempestTester', 'BarometerBob', 'WindwardWil'];
const PROFILE_BIOS = ['stress-testing the seas', 'storm-chaser on the testnet', 'load-bearing swimmer', 'here for the squall'];

function pngCrc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (~c) >>> 0; }
function pngChunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(pngCrc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function makeIdenticonPng(cell = 16) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(false));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { const on = Math.random() < 0.5; grid[y][x] = on; grid[y][7 - x] = on; }
  const fg = [40 + ((Math.random() * 180) | 0), 40 + ((Math.random() * 180) | 0), 40 + ((Math.random() * 180) | 0)];
  const bg = [235, 238, 240];
  const W = 8 * cell, H = 8 * cell;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) { const rs = y * (1 + W * 3); raw[rs] = 0; for (let x = 0; x < W; x++) { const on = grid[(y / cell) | 0][(x / cell) | 0]; const p = rs + 1 + x * 3; const c = on ? fg : bg; raw[p] = c[0]; raw[p + 1] = c[1]; raw[p + 2] = c[2]; } }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

/** Gather real content ids to react/reply to. */
async function gatherContent(maxSpaces = 4, perSpace = 20) {
  const list = await rpc('list_spaces', { limit: 50 });
  const spaces = (list?.spaces ?? []).filter((s) => (s.post_count ?? 0) > 0);
  const ids = [];
  for (const s of spaces.sort(() => Math.random() - 0.5).slice(0, maxSpaces)) {
    try {
      const c = await rpc('list_space_content', { space_id: s.space_id, limit: perSpace, sort: 'recent' });
      for (const it of (c?.items ?? [])) if (it.content_id?.startsWith('sha256:')) ids.push({ content_id: it.content_id, space_id: s.space_id });
    } catch { /* skip slow space */ }
  }
  return ids;
}

async function pickSpace() {
  const list = await rpc('list_spaces', { limit: 50 });
  const spaces = (list?.spaces ?? []).filter((s) => !s.app && s.name);
  return spaces.length ? pick(spaces) : null;
}

// ---- actions ----
async function doReact() {
  const ids = await gatherContent();
  if (!ids.length) throw new Error('no content to react to');
  const target = pick(ids);
  const emoji = 1 + Math.floor(Math.random() * 8);
  const contentHash = Buffer.from(target.content_id.slice(7), 'hex');
  const pow = await minePow(ActionType.Engage, contentHash);
  const sig = await signBytesWithNode(Buffer.from(`engage:${target.content_id}:${pow.pow_nonce}:${pow.timestamp}:${emoji}`, 'utf-8'));
  await rpc('submit_engagement', { content_id: target.content_id, author_id: AUTHOR, ...pow, signature: sig, emoji });
  return `react ${emoji} -> ${target.content_id.slice(7, 19)}`;
}

async function doReply() {
  const ids = await gatherContent();
  if (!ids.length) throw new Error('no content to reply to');
  const target = pick(ids);
  const body = `${pick(REPLIES)} [${TAG}:${Date.now() % 100000}]`;
  const ch = sha256(Buffer.from(body, 'utf-8'));
  const pow = await minePow(ActionType.Reply, ch);
  const sig = await signBytesWithNode(actionSigPreimage(ch, pow.timestamp));
  const r = await rpc('submit_reply', { parent_id: target.content_id, body, author_id: AUTHOR, ...pow, signature: sig });
  return `reply -> ${r?.content_id?.slice(7, 19)}`;
}

async function doPost() {
  const space = await pickSpace();
  if (!space) throw new Error('no public space to post in');
  const title = `${pick(TITLES)} ${Date.now() % 100000}`;
  const body = `${pick(BODIES)} [${TAG}]`;
  const ch = sha256(Buffer.from(`${title}\n\n${body}`, 'utf-8'));
  const pow = await minePow(ActionType.Post, ch);
  const sig = await signBytesWithNode(actionSigPreimage(ch, pow.timestamp));
  const r = await rpc('submit_post', { space_id: space.space_id, title, body, author_id: AUTHOR, ...pow, signature: sig });
  return `post "${title}" in ${space.name ?? space.space_id.slice(0, 12)}`;
}

async function doCreateSpace() {
  const name = `${pick(SPACE_NAMES)}-${Math.floor(Math.random() * 100000)}`;
  const pow = await minePow(ActionType.SpaceCreation, sha256(Buffer.from(name, 'utf-8')));
  const sig = await signBytesWithNode(Buffer.from(`space:${name}:${pow.timestamp}`, 'utf-8'));
  const r = await rpc('create_space', { name, creator_id: AUTHOR, ...pow, signature: sig });
  return `create_space "${name}"`;
}

// Profile space id: class byte 0x02 (Profile) || sha256("profile:v1:<pk>")[..15],
// as 32-hex chars (the node's decode_space_id accepts hex). The node
// auto-registers the profile space on first post to it.
function profileSpaceId() {
  const h = sha256(Buffer.from(`profile:v1:${AUTHOR.toLowerCase()}`, 'utf-8'));
  const b = Buffer.alloc(16);
  b[0] = 0x02;
  h.copy(b, 1, 0, 15);
  return b.toString('hex');
}
async function postProfileSegment(body) {
  const spaceId = profileSpaceId();
  const ch = sha256(Buffer.from(`\n\n${body}`, 'utf-8'));
  const pow = await minePow(ActionType.Post, ch);
  const sig = await signBytesWithNode(actionSigPreimage(ch, pow.timestamp));
  return rpc('submit_post', { space_id: spaceId, title: '', body, author_id: AUTHOR, ...pow, signature: sig });
}
async function doProfile() {
  if (Math.random() < 0.5) {
    const info = { displayName: pick(PROFILE_NAMES), bio: pick(PROFILE_BIOS), website: '', updatedAt: Date.now() };
    await postProfileSegment(`[PROFILE_INFO]${JSON.stringify(info)}`);
    return `profile-info "${info.displayName}"`;
  }
  const png = makeIdenticonPng();
  const up = await rpc('upload_media', { data: png.toString('base64'), media_type: 'image/png', author_id: AUTHOR });
  const av = { contentId: up.media_hash, format: 'png', updatedAt: Date.now() };
  await postProfileSegment(`[PROFILE_AVATAR]${JSON.stringify(av)}`);
  return `profile-avatar ${png.length}B`;
}

/** Reef game move: reply "<op> <x> <y> <regionId>#<seq>~<authorPrefix>" to a region thread.
 *  Regions are detected by CONTENT (a post whose body is a reef header) rather than
 *  the `app` field, which is seed-config-only and absent on fresh nodes. */
let REEF_REGION_CACHE = null;
async function findReefRegion() {
  if (REEF_REGION_CACHE && Math.random() < 0.8) return REEF_REGION_CACHE; // mostly reuse; refresh occasionally
  const list = await rpc('list_spaces', { limit: 50 });
  const spaces = (list?.spaces ?? []).filter((s) => (s.post_count ?? 0) > 0);
  for (const s of spaces) {
    try {
      const c = await rpc('list_space_content', { space_id: s.space_id, limit: 100, sort: 'recent' });
      for (const it of (c?.items ?? [])) {
        // A region ROOT post's body is the reef header JSON.
        try { const h = JSON.parse(it.body ?? ''); if (h?.kind === 'reef') { REEF_REGION_CACHE = { content_id: it.content_id, w: h.w || 12, h: h.h || 12 }; return REEF_REGION_CACHE; } } catch { /* not a header */ }
        // Fallback: a MOVE reply body is "<op> <x> <y> <regionId>#..." — extract the region id.
        const m = /^(?:grow|tend)\s+\d+\s+\d+\s+(sha256:[0-9a-f]+)/.exec(it.body ?? '');
        if (m) { REEF_REGION_CACHE = { content_id: m[1], w: 12, h: 12 }; return REEF_REGION_CACHE; }
      }
    } catch { /* skip */ }
  }
  return null;
}
async function doGameMove() {
  const region = await findReefRegion();
  if (!region) throw new Error('no reef region found on chain');
  const x = Math.floor(Math.random() * region.w), y = Math.floor(Math.random() * region.h);
  const body = `grow ${x} ${y} ${region.content_id}#${Date.now() % 1000000}~${AUTHOR.slice(0, 10)}`;
  const ch = sha256(Buffer.from(body, 'utf-8'));
  const pow = await minePow(ActionType.Reply, ch);
  const sig = await signBytesWithNode(actionSigPreimage(ch, pow.timestamp));
  await rpc('submit_reply', { parent_id: region.content_id, body, author_id: AUTHOR, ...pow, signature: sig });
  return `game-move grow ${x},${y}`;
}

// ---- storm loop ----
const ACTIONS = [
  { name: 'react', fn: doReact, w: 40 },
  { name: 'reply', fn: doReply, w: 20 },
  { name: 'post', fn: doPost, w: 12 },
  { name: 'game', fn: doGameMove, w: 15 },
  { name: 'profile', fn: doProfile, w: 8 },
  { name: 'space', fn: doCreateSpace, w: 5 },
];
const TOTAL_W = ACTIONS.reduce((a, x) => a + x.w, 0);
function pickAction() {
  let roll = Math.random() * TOTAL_W;
  for (const a of ACTIONS) { if (roll < a.w) return a; roll -= a.w; }
  return ACTIONS[0];
}

const stats = { ok: 0, fail: 0, byAction: {}, errors: {} };
async function worker(id, deadline) {
  while (Date.now() < deadline) {
    const a = pickAction();
    const t0 = Date.now();
    try {
      const r = await a.fn();
      stats.ok++;
      stats.byAction[a.name] = (stats.byAction[a.name] || 0) + 1;
      console.log(`[${TAG}/w${id} ${new Date().toISOString()}] OK ${r} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (e) {
      stats.fail++;
      const key = `${a.name}: ${e.message}`.slice(0, 120);
      stats.errors[key] = (stats.errors[key] || 0) + 1;
      console.log(`[${TAG}/w${id} ${new Date().toISOString()}] FAIL ${a.name}: ${e.message}`);
    }
    await sleep(GAP_MS / 2 + Math.random() * GAP_MS);
  }
}

async function main() {
  const deadline = Date.now() + STORM_MS;
  console.log(`[${TAG}] storm start: ${WORKERS} workers, ${STORM_MS / 1000}s, target ${RPC}, mode ${MODE}`);
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1, deadline)));
  console.log(`[${TAG}] STORM DONE ok=${stats.ok} fail=${stats.fail} mix=${JSON.stringify(stats.byAction)}`);
  if (Object.keys(stats.errors).length) console.log(`[${TAG}] errors: ${JSON.stringify(stats.errors, null, 1)}`);
}
main();
