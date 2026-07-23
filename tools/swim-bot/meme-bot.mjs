/**
 * meme-bot.mjs — posts internet memes (Reddit, via meme-api.com) into a space,
 * with the image attached, as the node's own identity. Submits exactly like a
 * human client: real Argon2id proof-of-work + canonical signature.
 *
 * Defaults target a LOCAL mainnet node and the "Bot talk" space.
 *
 * Env:
 *   RPC_URL          node RPC (default http://127.0.0.1:9736)
 *   RPC_COOKIE_FILE  cookie file to read (default: Roaming/swimchain/.cookie)
 *   RPC_COOKIE       cookie value (overrides file)
 *   AUTHOR_PUBKEY    32-byte hex pubkey to post as (default: node's own identity)
 *   BOT_SPACE        target space id sp1… (default: Bot talk)
 *   SUBREDDITS       comma list (default: memes,dankmemes,wholesomememes,ProgrammerHumor)
 *   INTERVAL_MS      gap between posts (default 1800000 = 30 min; jittered ±25%)
 *   POST_DIFFICULTY  PoW bits (default 8 — same tier reef/chess bots use on mainnet)
 *   STATE_FILE       dedup state (default ./meme-bot-state.json)
 *   MAX_IMAGE_BYTES  skip images larger than this (default 5_000_000)
 *   BOT_TAG          log label (default meme-bot)
 *   ONCE=1           post one meme and exit (for testing)
 */
import { createHash, randomBytes, createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { argon2id } from 'hash-wasm';

// Local seed signing (node-native ed25519) — the bot signs as ITS OWN bespoke
// identity, not the node's. SIGN_SEED_HEX is the raw 32-byte ed25519 seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SIGN_SEED = (process.env.SIGN_SEED_HEX || '').trim();
let localSign = null;
if (SIGN_SEED) {
  if (SIGN_SEED.length !== 64) throw new Error('SIGN_SEED_HEX must be 64 hex chars');
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(SIGN_SEED, 'hex')]), format: 'der', type: 'pkcs8' });
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' });
  const derivedPub = Buffer.from(spki.subarray(spki.length - 32)).toString('hex');
  localSign = { pub: derivedPub, sign: (bytes) => edSign(null, Buffer.from(bytes), key).toString('hex') };
}

const RPC = process.env.RPC_URL || 'http://127.0.0.1:9736';
const DEFAULT_COOKIE = join(homedir(), 'AppData', 'Roaming', 'swimchain', '.cookie');
const COOKIE_FILE = process.env.RPC_COOKIE_FILE || DEFAULT_COOKIE;
let COOKIE = process.env.RPC_COOKIE || '';
let AUTHOR = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const BOT_SPACE = process.env.BOT_SPACE || 'sp1qqqsqrp479yaj2jxdkc7zuzag89szywe3s'; // Bot talk
const SUBREDDITS = (process.env.SUBREDDITS || 'memes,dankmemes,wholesomememes,ProgrammerHumor')
  .split(',').map((s) => s.trim()).filter(Boolean);
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 30 * 60 * 1000);
const POST_DIFFICULTY = Number(process.env.POST_DIFFICULTY || 10); // mainnet Post minimum
const STATE_FILE = process.env.STATE_FILE || join(process.cwd(), 'meme-bot-state.json');
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES || 1_048_576); // node upload_media cap
const TAG = process.env.BOT_TAG || 'meme-bot';
const ONCE = process.env.ONCE === '1';
const UA = 'swimchain-meme-bot/1.0 (+https://swimchain.io)';

const POW_CONFIG = { memoryKib: 8192, iterations: 1, parallelism: 2 };
const ACTION_POW_POST = 0x02; // crypto/action_pow.rs ActionType::Post (PoW numbering, NOT wire)

const sha256 = (b) => createHash('sha256').update(b).digest();
const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const log = (...a) => console.log(`[${TAG}]`, ...a);

// ── auth (cookie, self-healing on rotation) ────────────────────────────────
const mkAuth = (c) => 'Basic ' + Buffer.from(`__cookie__:${c}`).toString('base64');
let AUTH = mkAuth(COOKIE);
function reloadCookie() {
  try {
    const c = readFileSync(COOKIE_FILE, 'utf8').trim();
    if (c && c !== COOKIE) { COOKIE = c; AUTH = mkAuth(c); return true; }
  } catch { /* keep prior */ }
  return false;
}
if (!COOKIE) reloadCookie();
if (!COOKIE) throw new Error(`no cookie: set RPC_COOKIE or ensure ${COOKIE_FILE} exists (node running)`);
const isAuthErr = (m) => /invalid cookie|authentication|unauthor/i.test(String(m || ''));
let authFailStreak = 0;

let rpcId = 0;
async function rpc(method, params, timeoutMs = 30000) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: params ?? {} });
  const headers = { 'Content-Type': 'application/json', Authorization: AUTH };
  let res = await fetch(RPC, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  let j = await res.json();
  if (j.error && isAuthErr(j.error.message)) {
    if (reloadCookie()) {
      headers.Authorization = AUTH;
      res = await fetch(RPC, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
      j = await res.json();
    }
    if (j.error && isAuthErr(j.error.message)) {
      if (++authFailStreak >= 5) { log('auth unrecoverable — exiting for restart'); process.exit(1); }
    } else authFailStreak = 0;
  } else if (!j.error) authFailStreak = 0;
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
async function signBytes(buf) {
  if (localSign) return localSign.sign(buf); // bespoke bot identity
  const r = await rpc('sign_message', { message: Buffer.from(buf).toString('hex') });
  if (!r?.signature) throw new Error('sign_message returned no signature');
  return r.signature;
}

// Canonical action signature preimage: contentHash(32) || ts_le(8) || private(1=0)
function actionSigPreimage(contentHash32, timestamp) {
  const b = Buffer.alloc(41);
  Buffer.from(contentHash32).copy(b, 0);
  b.writeBigUInt64LE(BigInt(timestamp), 32);
  b[40] = 0;
  return b;
}
// 82-byte challenge (crypto/action_pow.rs) + 8-byte nonce; salt = nonce_space.
async function minePow(contentHash32, authorBytes) {
  const difficulty = POST_DIFFICULTY;
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = randomBytes(8);
  const input = Buffer.alloc(90);
  input[0] = ACTION_POW_POST;
  contentHash32.copy(input, 1);
  authorBytes.copy(input, 33);
  input.writeBigUInt64BE(BigInt(timestamp), 65);
  input[73] = difficulty;
  nonceSpace.copy(input, 74);
  let nonce = 0n;
  for (;;) {
    input.writeBigUInt64BE(nonce, 82);
    const hash = await argon2id({
      password: new Uint8Array(input), salt: new Uint8Array(nonceSpace),
      parallelism: POW_CONFIG.parallelism, memorySize: POW_CONFIG.memoryKib,
      iterations: POW_CONFIG.iterations, hashLength: 32, outputType: 'binary',
    });
    if (leadingZeros(hash) >= difficulty) {
      return { pow_nonce: Number(nonce), pow_difficulty: difficulty, pow_nonce_space: nonceSpace.toString('hex'), pow_hash: Buffer.from(hash).toString('hex'), timestamp };
    }
    nonce++;
  }
}

// ── dedup state ────────────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return { posted: [] }; }
}
function saveState(s) {
  s.posted = s.posted.slice(-500); // keep recent
  try { writeFileSync(STATE_FILE, JSON.stringify(s)); } catch (e) { log('state write failed:', e.message); }
}

// ── meme source (meme-api.com wraps Reddit; no auth, filters nsfw) ──────────
const MEDIA_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
function mediaTypeFor(url, contentType) {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  if (MEDIA_TYPES[ext]) return MEDIA_TYPES[ext];
  const ct = (contentType || '').split(';')[0].trim().toLowerCase();
  if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(ct)) return ct;
  return null;
}
async function fetchMeme(sub) {
  const res = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(sub)}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`meme-api ${sub}: HTTP ${res.status}`);
  return res.json(); // { postLink, subreddit, title, url, nsfw, spoiler, author, ups }
}

// Pick a fresh, image, non-nsfw meme (try a few subs/attempts).
async function findFreshMeme(state) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const sub = pick(SUBREDDITS);
    let m;
    try { m = await fetchMeme(sub); } catch (e) { log('fetch failed:', e.message); continue; }
    if (!m || !m.url || m.nsfw || m.spoiler) continue;
    if (state.posted.includes(m.postLink)) continue;
    if (!mediaTypeFor(m.url)) continue; // galleries/videos → skip
    return m;
  }
  return null;
}

async function postMeme() {
  const state = loadState();
  // Try several candidates: memes too large for the node's upload cap (or that
  // fail to download) are marked seen and skipped so a round still lands a post.
  for (let attempt = 0; attempt < 8; attempt++) {
    const meme = await findFreshMeme(state);
    if (!meme) { log('no fresh meme found this round'); saveState(state); return; }

    let imgRes;
    try { imgRes = await fetch(meme.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }); }
    catch { state.posted.push(meme.postLink); continue; }
    const mediaType = imgRes.ok ? mediaTypeFor(meme.url, imgRes.headers.get('content-type')) : null;
    if (!mediaType) { state.posted.push(meme.postLink); continue; }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) {
      log(`skip "${(meme.title || '').slice(0, 40)}" — ${buf.length}B > ${MAX_IMAGE_BYTES}`);
      state.posted.push(meme.postLink); // don't retry this one
      continue;
    }

    const up = await rpc('upload_media', { data: buf.toString('base64'), media_type: mediaType, author_id: AUTHOR });
    const title = (meme.title || 'meme').slice(0, 180);
    const body = `via r/${meme.subreddit} — ${meme.postLink}`;
    const contentHash = sha256(Buffer.from(`${title}\n\n${body}`, 'utf-8'));
    const pow = await minePow(contentHash, Buffer.from(AUTHOR, 'hex'));
    const signature = await signBytes(actionSigPreimage(contentHash, pow.timestamp));
    const r = await rpc('submit_post', {
      space_id: BOT_SPACE, title, body, author_id: AUTHOR,
      media_refs: [{ media_hash: up.media_hash, media_type: mediaType, size_bytes: buf.length }],
      ...pow, signature,
    });
    state.posted.push(meme.postLink);
    saveState(state);
    log(`posted "${title.slice(0, 48)}" (r/${meme.subreddit}, ${buf.length}B ${mediaType}) -> ${r?.content_id?.slice(0, 24)}`);
    return;
  }
  saveState(state);
  log('no suitable meme this round (all too large / failed)');
}

async function main() {
  if (localSign) {
    AUTHOR = localSign.pub.toLowerCase(); // bespoke bot identity from SIGN_SEED_HEX
    log(`author = bespoke bot identity ${AUTHOR.slice(0, 10)}… (local-sign)`);
  } else if (!AUTHOR) {
    const info = await rpc('get_identity_info', {});
    if (!info?.public_key) throw new Error('no AUTHOR_PUBKEY and node has no identity');
    AUTHOR = info.public_key.toLowerCase();
    log(`author = node identity ${AUTHOR.slice(0, 10)}… (${info.address})`);
  }
  log(`space=${BOT_SPACE} subs=[${SUBREDDITS.join(', ')}] interval=${Math.round(INTERVAL_MS / 60000)}min diff=${POST_DIFFICULTY}`);
  for (;;) {
    try { await postMeme(); } catch (e) { log('post error:', e.message); }
    if (ONCE) break;
    const jitter = INTERVAL_MS * (0.75 + Math.random() * 0.5);
    await sleep(jitter);
  }
}
main().catch((e) => { log('fatal:', e.message); process.exit(1); });
