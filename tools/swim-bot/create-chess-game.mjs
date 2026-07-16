/** One-off E2E: create a bot-flagged chess game + play White's e4, so we can
 *  watch the chess-bot claim Black and respond. Reuses the proven PoW/sign path. */
import { createHash, randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19746';
const COOKIE = process.env.RPC_COOKIE || '';
const AUTHOR = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const CHESS_SPACE = process.env.CHESS_SPACE || 'sp1qqqsqrsm2rq9fhtvwww9cts9n6wq536c23';
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

const header = { v: 1, kind: 'chess', white: AUTHOR, variant: 'standard', created: Date.now(), name: 'Bot E2E test', bot: true };
const title = 'Chess — Bot E2E test · vs computer · open seat';
const body = JSON.stringify(header);
const content = `${title}\n\n${body}`;
const ch = sha256(Buffer.from(content, 'utf-8'));
console.log('mining game post…');
const pow = await minePow(2, ch);
const sig = await sign(sigPreimage(ch, pow.timestamp));
const res = await rpc('submit_post', { space_id: CHESS_SPACE, title, body, author_id: AUTHOR, ...pow, signature: sig });
const gameId = res.content_id;
console.log('created game:', gameId);

const mbody = `e4 ${gameId}#0`;
const mch = sha256(Buffer.from(mbody, 'utf-8'));
console.log('mining white e4…');
const mpow = await minePow(3, mch);
const msig = await sign(sigPreimage(mch, mpow.timestamp));
await rpc('submit_reply', { parent_id: gameId, body: mbody, author_id: AUTHOR, ...mpow, signature: msig });
console.log('played e4 as White. Watch the chess-bot answer as Black.');
console.log('GAME_ID=' + gameId);
