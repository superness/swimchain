/**
 * Hourly activity bot — runs on the test droplet as its sponsored identity.
 * Picks ONE weighted-random action per invocation and executes it via the local node's
 * RPC (cookie auth + node-managed signing). Meant to be fired hourly by a systemd timer.
 *
 * Weights: react (high) > reply (medium) > post (low) > profile/dm/create_space (very low).
 */
import { createHash, randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { argon2id } from 'hash-wasm';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19736';
const COOKIE = process.env.RPC_COOKIE || '';
const AUTHOR = process.env.AUTHOR_PUBKEY || '';
const NET = 'testnet';
if (!COOKIE || !AUTHOR) throw new Error('RPC_COOKIE and AUTHOR_PUBKEY required');
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = Buffer.from(AUTHOR, 'hex');

const ActionType = { SpaceCreation: 1, Post: 2, Reply: 3, Engage: 4 };
const POW_CONFIG = { testnet: { memoryKib: 8192, iterations: 1, parallelism: 2 } };
const POW_DIFF = { testnet: { 1: 12, 2: 10, 3: 8, 4: 6 } };
const sha256 = (b) => createHash('sha256').update(b).digest();
const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };

// bech32m space-id encoding — matches the node's encode_space_id (hrp "sp", version byte 0).
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function b32Polymod(v) { let c = 1; const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; for (const x of v) { const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c >>> 0; }
function b32HrpExpand(h) { const r = []; for (const ch of h) r.push(ch.charCodeAt(0) >> 5); r.push(0); for (const ch of h) r.push(ch.charCodeAt(0) & 31); return r; }
function b32ConvertBits(data, from, to, pad) { let acc = 0, bits = 0; const ret = []; const maxv = (1 << to) - 1; for (const b of data) { acc = (acc << from) | b; bits += from; while (bits >= to) { bits -= to; ret.push((acc >> bits) & maxv); } } if (pad && bits > 0) ret.push((acc << (to - bits)) & maxv); return ret; }
function encodeSpaceId(bytes16) { const data5 = b32ConvertBits([0, ...bytes16], 8, 5, true); const pm = b32Polymod(b32HrpExpand('sp').concat(data5, [0, 0, 0, 0, 0, 0])) ^ 0x2bc830a3; const chk = []; for (let i = 0; i < 6; i++) chk.push((pm >> (5 * (5 - i))) & 31); let s = 'sp1'; for (const d of data5.concat(chk)) s += B32[d]; return s; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let rpcId = 0;
async function rpc(method, params, timeoutMs = 20000) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
async function signWithNode(message) {
  const r = await rpc('sign_message', { message: Buffer.from(message, 'utf-8').toString('hex') });
  if (!r?.signature) throw new Error('sign_message returned no signature');
  return r.signature;
}

/** PoW over a RAW 32-byte content hash (Post/Reply/Space use sha256(string); Engage uses the content hash). */
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
const TITLES = ['Thoughts on decay', 'Anyone else swimming?', 'Daily check-in', 'Testing the waters', 'A small note', 'Random musing', 'Field report'];
const BODIES = ['Just keeping the current moving.', 'The network feels alive today.', 'Reacting to keep things afloat.', 'Another drop in the stream.', 'Staying engaged out here.', 'Content decays without us.', 'Swimming along nicely.'];
const REPLIES = ['Nice one!', 'Agreed.', 'Interesting point.', 'Keeping this alive.', 'Good to see activity.', 'This resonates.', '+1 from the deep end.'];
const SPACE_NAMES = ['Driftwood', 'Tidepool', 'Current Events', 'The Shallows', 'Open Water', 'Reef Talk', 'Undertow'];
// --- minimal PNG encoder (RGB, no deps) for a random identicon avatar ---
function pngCrc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (~c) >>> 0; }
function pngChunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0); const t = Buffer.from(type, 'ascii'); const crc = Buffer.alloc(4); crc.writeUInt32BE(pngCrc32(Buffer.concat([t, data])), 0); return Buffer.concat([len, t, data, crc]); }
function makeIdenticonPng(cell = 16) {
  // 8x8 grid, left-right symmetric, random cells, random foreground on a light bg.
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

const PROFILE_NAMES = ['Drifty', 'TideRunner', 'DeepSwimmer', 'Currentbot', 'Reefwalker', 'Saltwater Sam', 'Marlin'];
const PROFILE_BIOS = ['swimming the decentralized seas', 'just a testnet drifter', 'keeping the current alive', 'exploring the deep end', 'a friendly node in the reef', 'here for the tides'];

/** Gather some real content_ids across public spaces to react/reply to. */
async function gatherContent(maxSpaces = 4, perSpace = 20) {
  const list = await rpc('list_spaces', { limit: 50 });
  const spaces = (list?.spaces ?? []).filter((s) => (s.post_count ?? 0) > 0);
  const ids = [];
  for (const s of spaces.sort(() => Math.random() - 0.5).slice(0, maxSpaces)) {
    try {
      const c = await rpc('list_space_content', { space_id: s.space_id, limit: perSpace, sort: 'recent' });
      for (const it of (c?.items ?? [])) if (it.content_id?.startsWith('sha256:')) ids.push({ content_id: it.content_id, space_id: s.space_id });
    } catch { /* space may be slow; skip */ }
  }
  return ids;
}

async function pickSpace() {
  const list = await rpc('list_spaces', { limit: 50 });
  // Post into a normal public space (skip app-namespaced spaces like wiki).
  const spaces = (list?.spaces ?? []).filter((s) => !s.app && s.name);
  return spaces.length ? pick(spaces) : null;
}

// ---- actions ----
async function doReact() {
  const ids = await gatherContent();
  if (!ids.length) return doCreateSpace(); // bootstrap: nothing to react to yet
  const target = pick(ids);
  const emoji = 1 + Math.floor(Math.random() * 8);
  const contentHash = Buffer.from(target.content_id.slice(7), 'hex');
  const pow = await minePow(ActionType.Engage, contentHash);
  const sig = await signWithNode(`engage:${target.content_id}:${pow.pow_nonce}:${pow.timestamp}:${emoji}`);
  await rpc('submit_engagement', { content_id: target.content_id, author_id: AUTHOR, ...pow, signature: sig, emoji });
  return `react: ${emoji} on ${target.content_id.slice(0, 20)}`;
}

async function doReply() {
  const ids = await gatherContent();
  if (!ids.length) return doPost(); // bootstrap: nothing to reply to yet
  const target = pick(ids);
  const body = pick(REPLIES);
  const pow = await minePow(ActionType.Reply, sha256(Buffer.from(body, 'utf-8')));
  const sig = await signWithNode(`reply:${target.content_id}:${body}:${pow.timestamp}`);
  const r = await rpc('submit_reply', { parent_id: target.content_id, body, author_id: AUTHOR, ...pow, signature: sig });
  return `reply: "${body}" -> ${r?.content_id?.slice(0, 20)}`;
}

async function doPost() {
  const space = await pickSpace();
  if (!space) return doCreateSpace(); // bootstrap: no normal public space to post in yet
  const title = pick(TITLES);
  const body = pick(BODIES);
  const pow = await minePow(ActionType.Post, sha256(Buffer.from(`${title}\n\n${body}`, 'utf-8')));
  const sig = await signWithNode(`post:${space.space_id}:${title}:${body}:${pow.timestamp}`);
  const r = await rpc('submit_post', { space_id: space.space_id, title, body, author_id: AUTHOR, ...pow, signature: sig });
  return `post: "${title}" in ${space.name} -> ${r?.content_id?.slice(0, 20)}`;
}

async function doCreateSpace() {
  const name = `${pick(SPACE_NAMES)}-${Math.floor(Math.random() * 100000)}`;
  const pow = await minePow(ActionType.SpaceCreation, sha256(Buffer.from(name, 'utf-8')));
  const sig = await signWithNode(`space:${name}:${pow.timestamp}`);
  const r = await rpc('create_space', { name, creator_id: AUTHOR, ...pow, signature: sig });
  return `create_space: "${name}" -> ${r?.space_id}`;
}

async function doDm() {
  // Node-managed DM request to the seed identity (a known peer). All crypto is node-side.
  const recipient = '615b3e06ddfc60fbd380ccdc11bd489017b9c7e864f07d81aff5a1ce085b5737';
  const r = await rpc('request_dm_managed', { recipient, message: pick(BODIES) });
  return `dm: request to seed -> ${JSON.stringify(r).slice(0, 60)}`;
}

function profileSpaceId() {
  // sha256("profile:v1:<pk_hex_lower>")[..16], bech32m-encoded (matches the node).
  return encodeSpaceId(sha256(Buffer.from(`profile:v1:${AUTHOR.toLowerCase()}`, 'utf-8')).subarray(0, 16));
}
// Post a profile segment ([PROFILE_INFO] or [PROFILE_AVATAR]) to the derived profile space.
async function postProfileSegment(body) {
  const spaceId = profileSpaceId();
  const title = '';
  const pow = await minePow(ActionType.Post, sha256(Buffer.from(`${title}\n\n${body}`, 'utf-8')));
  const sig = await signWithNode(`post:${spaceId}:${title}:${body}:${pow.timestamp}`);
  return rpc('submit_post', { space_id: spaceId, title, body, author_id: AUTHOR, ...pow, signature: sig });
}

async function doProfileInfo() {
  const info = { displayName: pick(PROFILE_NAMES), bio: pick(PROFILE_BIOS), website: '', updatedAt: Date.now() };
  const r = await postProfileSegment(`[PROFILE_INFO]${JSON.stringify(info)}`);
  return `profile-info: name="${info.displayName}" bio="${info.bio}" -> ${r?.content_id?.slice(0, 20)}`;
}

async function doAvatar() {
  // Generate a random identicon, upload it, then point the profile avatar at its media hash.
  const png = makeIdenticonPng();
  const up = await rpc('upload_media', { data: png.toString('base64'), media_type: 'image/png', author_id: AUTHOR });
  const mediaHash = up.media_hash;
  const av = { contentId: mediaHash, format: 'png', updatedAt: Date.now() };
  const r = await postProfileSegment(`[PROFILE_AVATAR]${JSON.stringify(av)}`);
  return `profile-avatar: ${png.length}B png -> media ${mediaHash.slice(0, 12)} -> ${r?.content_id?.slice(0, 20)}`;
}

// The profile action edits the info OR the image (very-low chance each).
async function doProfile() {
  return Math.random() < 0.5 ? doProfileInfo() : doAvatar();
}

// ---- sponsorship faucet (testnet onboarding) ----
// New installs get a fresh, UNSPONSORED identity and can't post until sponsored.
// While on testnet the bot acts as a faucet: it keeps a pool of open sponsorship
// offers available AND approves the pending claims against them (the node stores a
// claim as PENDING; `auto_approve` on the offer is not yet honored, so the sponsor
// must explicitly approve). Runs every invocation; a short-interval timer keeps
// approval latency low without spamming social activity (see FAUCET_ONLY below).
const FAUCET_MIN_FREE_SLOTS = 3;   // open a new offer when fewer than this remain
const FAUCET_OFFER_SLOTS = 10;     // slots per offer (node max is 10)
const FAUCET_EXPIRES_DAYS = 30;

// Sign RAW bytes via the node (sign_message takes a hex payload and signs its bytes).
async function signBytesWithNode(buf) {
  const r = await rpc('sign_message', { message: Buffer.from(buf).toString('hex') });
  if (!r?.signature) throw new Error('sign_message returned no signature');
  return r.signature;
}

// Offer-creation signature preimage (must match the node byte-for-byte):
// "swimchain-sponsor-offer:" || sponsor(32) || slots(1) || offer_type(1) ||
// expires_days(4 BE) || min_pow(1) || app_required(1) || timestamp(8 BE)
function offerCreationSigMessage({ slots, offerType, expiresDays, minPow, appRequired, timestamp }) {
  const prefix = Buffer.from('swimchain-sponsor-offer:', 'utf-8');
  const b = Buffer.alloc(prefix.length + 32 + 1 + 1 + 4 + 1 + 1 + 8);
  let o = 0;
  prefix.copy(b, o); o += prefix.length;
  authorBytes.copy(b, o); o += 32;
  b[o++] = slots;
  b[o++] = offerType;              // Open = 0
  b.writeUInt32BE(expiresDays, o); o += 4;
  b[o++] = minPow;
  b[o++] = appRequired ? 1 : 0;
  b.writeBigUInt64BE(BigInt(timestamp), o); o += 8;
  return b;
}

async function doFaucet() {
  const notes = [];
  // 1. My currently-open offers (public listing, filtered to us — no extra signature).
  let mine = [];
  try {
    const res = await rpc('list_sponsorship_offers', { limit: 100, offer_type: 'open' });
    mine = (res?.offers ?? []).filter((o) => (o.sponsor_pubkey || '').toLowerCase() === AUTHOR.toLowerCase());
  } catch (e) { notes.push(`list: ${e.message}`); }

  // 2. Approve every pending claim on my offers (claimant(32) || offer_id(16) signature).
  let approved = 0;
  for (const o of mine) {
    try {
      const detail = await rpc('get_sponsorship_offer', { offer_id: o.offer_id, caller_pubkey: AUTHOR });
      for (const pc of (detail?.pending_claims ?? [])) {
        try {
          const ts = Math.floor(Date.now() / 1000);
          // approve_sponsorship_claim verifies the sponsor sig over: claimant(32) || timestamp(8 BE).
          const msg = Buffer.alloc(40);
          Buffer.from(pc.claimant_pubkey, 'hex').copy(msg, 0);
          msg.writeBigUInt64BE(BigInt(ts), 32);
          const sig = await signBytesWithNode(msg);
          await rpc('approve_sponsorship_claim', { offer_id: o.offer_id, claimant_pubkey: pc.claimant_pubkey, sponsor_pubkey: AUTHOR, signature: sig, timestamp: ts });
          approved++;
        } catch (e) { notes.push(`approve ${pc.claimant_pubkey.slice(0, 8)}: ${e.message}`); }
      }
    } catch (e) { notes.push(`detail ${String(o.offer_id).slice(0, 8)}: ${e.message}`); }
  }

  // 3. Keep the pool topped up.
  const freeSlots = mine.reduce((a, o) => a + (o.slots_remaining ?? 0), 0);
  let created = 0;
  if (freeSlots < FAUCET_MIN_FREE_SLOTS) {
    try {
      const ts = Math.floor(Date.now() / 1000);
      const msg = offerCreationSigMessage({ slots: FAUCET_OFFER_SLOTS, offerType: 0, expiresDays: FAUCET_EXPIRES_DAYS, minPow: 0, appRequired: false, timestamp: ts });
      const sig = await signBytesWithNode(msg);
      const r = await rpc('create_sponsorship_offer', { sponsor_pubkey: AUTHOR, slots: FAUCET_OFFER_SLOTS, offer_type: 'open', expires_days: FAUCET_EXPIRES_DAYS, min_pow_difficulty: 0, application_required: false, auto_approve: true, signature: sig, timestamp: ts });
      created = 1;
      notes.push(`opened ${String(r?.offer_id).slice(0, 8)}`);
    } catch (e) { notes.push(`create: ${e.message}`); }
  }

  return `faucet: approved=${approved} created=${created} free_slots=${freeSlots}${notes.length ? ' | ' + notes.join('; ') : ''}`;
}

// ---- weighted pick ----
const ACTIONS = [
  { fn: doReact, w: 55 },
  { fn: doReply, w: 25 },
  { fn: doPost, w: 8 },
  { fn: doProfile, w: 5 },
  { fn: doDm, w: 4 },
  { fn: doCreateSpace, w: 3 },
];

const BY_NAME = { react: doReact, reply: doReply, post: doPost, profile: doProfile, info: doProfileInfo, avatar: doAvatar, dm: doDm, create: doCreateSpace, faucet: doFaucet };
async function main() {
  // Sponsorship faucet: always run it so new users can get sponsored. FAUCET_ONLY=1
  // runs ONLY the faucet and exits — used by a short-interval timer for low approval
  // latency, while the hourly timer also does social activity below.
  try {
    const t = Date.now();
    const f = await doFaucet();
    console.log(`[bot ${new Date().toISOString()}] ${f} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`[bot ${new Date().toISOString()}] faucet FAILED: ${e.message}`);
  }
  if (process.env.FAUCET_ONLY === '1') return;

  const total = ACTIONS.reduce((a, x) => a + x.w, 0);
  let roll = Math.random() * total;
  let chosen = ACTIONS[0];
  for (const a of ACTIONS) { if (roll < a.w) { chosen = a; break; } roll -= a.w; }
  // FORCE_ACTION env overrides the weighted pick (for testing a specific action).
  if (process.env.FORCE_ACTION && BY_NAME[process.env.FORCE_ACTION]) {
    chosen = { fn: BY_NAME[process.env.FORCE_ACTION] };
  }
  const t0 = Date.now();
  try {
    const result = await chosen.fn();
    console.log(`[bot ${new Date().toISOString()}] ${result} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`[bot ${new Date().toISOString()}] ${chosen.fn.name} FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
main();
