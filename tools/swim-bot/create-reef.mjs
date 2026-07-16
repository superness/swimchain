/** One-off: found a NEW reef region as THIS node's identity (run on the bot
 *  droplet → founder = the operational faucet identity, so future `retune`s
 *  never need the cold genesis identity). Optionally applies an initial
 *  retune right after founding (RETUNE="epochMoves=12 tendCap=4").
 *  Reuses the proven PoW/sign path from create-chess-game.mjs. */
import { createHash, randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19736';
const COOKIE = process.env.RPC_COOKIE || '';
const AUTHOR = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const REEF_SPACE = process.env.REEF_SPACE || 'sp1qqqsqr9dfcyugxztn5nrpjd7r82sh9cd62';
const RETUNE = (process.env.RETUNE || '').trim();
const NAME = process.env.REEF_NAME || 'The Open Reef';
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = Buffer.from(AUTHOR, 'hex');
const POW = { memoryKib: 8192, iterations: 1, parallelism: 2 };
const DIFF = { 1: 12, 2: 10, 3: 8, 4: 6 }; // testnet difficulty by action type

const sha256 = (b) => createHash('sha256').update(b).digest();
const lz = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
let id = 0;
async function rpc(method, params) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
async function sign(buf) { const r = await rpc('sign_message', { message: Buffer.from(buf).toString('hex') }); return r.signature; }
function sigPreimage(ch, ts) { const b = Buffer.alloc(41); ch.copy(b, 0); b.writeBigUInt64LE(BigInt(ts), 32); b[40] = 0; return b; }
async function minePow(actionType, ch) {
  const difficulty = DIFF[actionType], timestamp = Math.floor(Date.now() / 1000), ns = randomBytes(8);
  const input = Buffer.alloc(90);
  input[0] = actionType; ch.copy(input, 1); authorBytes.copy(input, 33);
  input.writeBigUInt64BE(BigInt(timestamp), 65); input[73] = difficulty; ns.copy(input, 74);
  let nonce = 0n;
  for (;;) {
    input.writeBigUInt64BE(nonce, 82);
    const h = await argon2id({ password: new Uint8Array(input), salt: new Uint8Array(ns), parallelism: POW.parallelism, memorySize: POW.memoryKib, iterations: POW.iterations, hashLength: 32, outputType: 'binary' });
    if (lz(h) >= difficulty) return { pow_nonce: Number(nonce), pow_difficulty: difficulty, pow_nonce_space: ns.toString('hex'), pow_hash: Buffer.from(h).toString('hex'), timestamp };
    nonce++;
  }
}

if (!AUTHOR) throw new Error('AUTHOR_PUBKEY required');

// Found the region: header.founder = this identity → it can retune forever.
const header = { v: 1, kind: 'reef', founder: AUTHOR, w: 12, h: 12, created: Date.now() };
const title = `Reef — ${NAME}`;
const body = JSON.stringify(header);
const content = `${title}\n\n${body}`;
const ch = sha256(Buffer.from(content, 'utf-8'));
console.log('mining region post…');
const pow = await minePow(2, ch);
const sig = await sign(sigPreimage(ch, pow.timestamp));
const res = await rpc('submit_post', { space_id: REEF_SPACE, title, body, author_id: AUTHOR, ...pow, signature: sig });
const regionId = res.content_id;
console.log('founded reef:', regionId);

if (RETUNE) {
  if (!/^((epochMoves|tendCap)=\d+\s*)+$/.test(RETUNE)) throw new Error('RETUNE must be like "epochMoves=12 tendCap=4"');
  const rbody = `retune ${RETUNE} #${Date.now()}~${AUTHOR.slice(0, 10)}`;
  const rch = sha256(Buffer.from(rbody, 'utf-8'));
  console.log('mining retune…');
  const rpow = await minePow(3, rch);
  const rsig = await sign(sigPreimage(rch, rpow.timestamp));
  await rpc('submit_reply', { parent_id: regionId, body: rbody, author_id: AUTHOR, ...rpow, signature: rsig });
  console.log('retuned at birth:', RETUNE);
}
console.log('REGION_ID=' + regionId);
console.log('link: https://swimchain.io/reef/?r=' + regionId);
