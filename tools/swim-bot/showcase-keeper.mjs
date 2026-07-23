/**
 * Showcase keeper — operates a node to keep one curated space (and its posts)
 * alive and retrievable over time, so the read-only browse gateway can present
 * it indefinitely even though the network fetches on demand and content decays
 * without engagement.
 *
 * Each cycle, for the configured space:
 *   1. resolve_space_name   — best-effort, keeps the space name populated
 *   2. list_space_content   — enumerate the space's posts (+ decay state)
 *   3. request_content(id)  — pull/re-seed each post body so it stays servable
 *   4. engage(id) ONLY when a post is about to slip (survival below the floor)
 *      — readers browse but don't engage, so without this the posts eventually
 *      decay. Engagement is signed by the node's own identity (sign_message),
 *      resets the decay timer, and is naturally rare (a freshly engaged post is
 *      protected again for days).
 *
 * No posting, no new content — this only preserves what already exists.
 *
 * Env:
 *   RPC_URL         node RPC (default http://127.0.0.1:9736 = mainnet)
 *   RPC_COOKIE      node cookie (required)
 *   AUTHOR_PUBKEY   node identity 32-byte hex (required; used to sign engagement)
 *   SPACE_ID        bech32 sp1… space to keep alive (required)
 *   INTERVAL_MS     cycle period (default 300000 = 5 min)
 *   ENGAGE_FLOOR    engage a post when survival_probability < this (default 0.7)
 *   ENGAGE_COOLDOWN_MS  min gap between engaging the same post (default 6h)
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { argon2id } from 'hash-wasm';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:9736';
// Re-readable cookie: a node restart rotates the cookie, so track the FILE and
// re-read it on auth failure instead of running dead. See reloadCookie.
const COOKIE_FILE = process.env.RPC_COOKIE_FILE || '';
let COOKIE = process.env.RPC_COOKIE || '';
const AUTHOR = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const SPACE_ID = process.env.SPACE_ID || '';
const INTERVAL_MS = Number(process.env.INTERVAL_MS || 300000);
const ENGAGE_FLOOR = Number(process.env.ENGAGE_FLOOR || 0.7);
const ENGAGE_COOLDOWN_MS = Number(process.env.ENGAGE_COOLDOWN_MS || 6 * 3600 * 1000);
const TAG = 'keeper';

if (!COOKIE && !COOKIE_FILE) throw new Error('RPC_COOKIE or RPC_COOKIE_FILE required');
if (!AUTHOR) throw new Error('AUTHOR_PUBKEY required');
if (!SPACE_ID) throw new Error('SPACE_ID required');

const mkAuth = (c) => 'Basic ' + Buffer.from(`__cookie__:${c}`).toString('base64');
let AUTH = mkAuth(COOKIE);
function reloadCookie() {
  if (!COOKIE_FILE) return false;
  try {
    const c = readFileSync(COOKIE_FILE, 'utf8').trim();
    if (c && c !== COOKIE) { COOKIE = c; AUTH = mkAuth(c); return true; }
  } catch { /* keep prior */ }
  return false;
}
const isAuthErr = (m) => /invalid cookie|authentication|unauthor/i.test(String(m || ''));
let authFailStreak = 0;
const authorBytes = Buffer.from(AUTHOR, 'hex');
if (COOKIE_FILE && !COOKIE) reloadCookie();

// Mainnet action PoW == matched testnet: argon2id 8MiB/1iter/2par. Engage=type 4.
const ENGAGE_TYPE = 4;
const ENGAGE_DIFF = 6;
const POW_CONFIG = { memoryKib: 8192, iterations: 1, parallelism: 2 };
const sha256 = (b) => createHash('sha256').update(b).digest();
const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let rpcId = 0;
async function rpc(method, params, timeoutMs = 20000) {
  const send = () => fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let j = await (await send()).json();
  // Self-heal a rotated cookie; exit for a systemd restart if it stays broken.
  if (j.error && isAuthErr(j.error.message)) {
    if (reloadCookie()) j = await (await send()).json();
    if (j.error && isAuthErr(j.error.message)) {
      if (++authFailStreak >= 5) {
        console.log(`[${TAG}] auth unrecoverable — exiting for restart`);
        process.exit(1);
      }
    } else {
      authFailStreak = 0;
    }
  } else if (!j.error) {
    authFailStreak = 0;
  }
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}

async function signWithNode(message) {
  const r = await rpc('sign_message', { message: Buffer.from(message, 'utf-8').toString('hex') });
  if (!r?.signature) throw new Error('sign_message returned no signature');
  return r.signature;
}

/** PoW over a raw 32-byte content hash — matches the node's verify_pow_submission_raw. */
async function minePow(actionType, difficulty, contentHash32) {
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

const lastEngaged = new Map(); // content_id -> ms

async function engage(contentId) {
  const now = Date.now();
  const prev = lastEngaged.get(contentId) || 0;
  if (now - prev < ENGAGE_COOLDOWN_MS) return false;
  const emoji = 1;
  const contentHash = Buffer.from(contentId.slice(7), 'hex'); // strip "sha256:"
  const pow = await minePow(ENGAGE_TYPE, ENGAGE_DIFF, contentHash);
  const sig = await signWithNode(`engage:${contentId}:${pow.pow_nonce}:${pow.timestamp}:${emoji}`);
  await rpc('submit_engagement', { content_id: contentId, author_id: AUTHOR, ...pow, signature: sig, emoji });
  lastEngaged.set(contentId, now);
  return true;
}

async function cycle() {
  // 1. Keep the name resolved (best-effort; ignore "not local" responses).
  try { await rpc('resolve_space_name', { space_id: SPACE_ID }); } catch (e) { /* non-fatal */ }

  // 2. Enumerate posts.
  let items = [];
  try {
    const r = await rpc('list_space_content', { space_id: SPACE_ID, limit: 200, sort: 'recent' });
    items = r?.items || [];
  } catch (e) {
    console.log(`[${TAG}] list_space_content failed: ${e.message}`);
    return;
  }

  let retrieved = 0, engaged = 0, atRisk = 0;
  for (const it of items) {
    const id = it.content_id;
    if (!id || !id.startsWith('sha256:')) continue;
    // 3. Re-seed the body so it stays servable to readers.
    try { await rpc('request_content', { content_id: id }); retrieved++; } catch (e) { /* peer may not have it yet */ }
    // 4. Rescue from decay only when it's actually slipping.
    const survival = typeof it.survival_probability === 'number' ? it.survival_probability : 1;
    const protectedNow = it.is_protected === true || it.decay_state === 'protected';
    if (!protectedNow && survival < ENGAGE_FLOOR) {
      atRisk++;
      try { if (await engage(id)) engaged++; }
      catch (e) { console.log(`[${TAG}] engage ${id.slice(0, 18)}… failed: ${e.message}`); }
    }
  }
  console.log(`[${TAG}] cycle: ${items.length} posts, retrieved ${retrieved}, at-risk ${atRisk}, engaged ${engaged}`);
}

async function main() {
  console.log(`[${TAG}] keeping ${SPACE_ID} alive via ${RPC} as ${AUTHOR.slice(0, 10)}… every ${INTERVAL_MS}ms (engage floor ${ENGAGE_FLOOR})`);
  for (;;) {
    try { await cycle(); } catch (e) { console.log(`[${TAG}] cycle error: ${e.message}`); }
    await sleep(INTERVAL_MS);
  }
}

main().catch((e) => { console.error(`[${TAG}] fatal: ${e.message}`); process.exit(1); });
