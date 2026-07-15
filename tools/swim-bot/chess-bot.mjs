/**
 * chess-bot.mjs — a rule-based (NO AI/LLM) chess opponent for Swimchain Chess.
 *
 * A game is a post in the chess space; moves are replies (SAN). When a game's
 * header has `bot: true` (the creator ticked "play the computer"), this daemon
 * claims the Black seat and answers each of the human's moves with a move chosen
 * by a shallow alpha-beta search over material + simple positional eval. Moves
 * are submitted exactly like a human client — real proof-of-work + canonical
 * signature — as the node's own sponsored identity.
 *
 * Env:
 *   RPC_URL         node RPC (default http://127.0.0.1:19736)
 *   AUTHOR_PUBKEY   the bot identity's 32-byte hex pubkey (the node's identity)
 *   AUTH_MODE       cookie (default; RPC_COOKIE required) | signature
 *   RPC_COOKIE      node cookie (cookie mode)
 *   CHESS_SPACE     the chess space id (sp1…) to watch
 *   SEARCH_DEPTH    plies of lookahead (default 3)
 *   BOT_INTERVAL_MS poll gap (default 5000)
 *   BOT_TAG         log label (default chess-bot)
 *   BOT_MS          run duration (default Infinity)
 */
import { createHash, randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';
import { Chess } from 'chess.js';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19736';
const AUTHOR = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const COOKIE = process.env.RPC_COOKIE || '';
const MODE = process.env.AUTH_MODE || 'cookie';
const CHESS_SPACE = process.env.CHESS_SPACE || '';
const DEPTH = Math.max(1, Number(process.env.SEARCH_DEPTH || 3));
const GAP = Number(process.env.BOT_INTERVAL_MS || 5000);
const TAG = process.env.BOT_TAG || 'chess-bot';
const RUN_MS = Number(process.env.BOT_MS || Infinity);
if (!AUTHOR) throw new Error('AUTHOR_PUBKEY required');
if (!CHESS_SPACE) throw new Error('CHESS_SPACE required');
if (MODE === 'cookie' && !COOKIE) throw new Error('RPC_COOKIE required in cookie mode');
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = Buffer.from(AUTHOR, 'hex');

const ActionType = { Reply: 3 };
const POW_CONFIG = { memoryKib: 8192, iterations: 1, parallelism: 2 };
const POW_DIFF = { 3: 8 }; // reply difficulty on testnet

const sha256 = (b) => createHash('sha256').update(b).digest();
const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── RPC (cookie or x-cs signature auth), mirrored from reef-bot.mjs ────────────
let rpcId = 0;
async function rpcBare(method, params, timeoutMs = 20000) {
  const res = await fetch(RPC, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
async function rpc(method, params, timeoutMs = 30000) {
  const paramsJson = JSON.stringify(params ?? {});
  const headers = { 'Content-Type': 'application/json' };
  if (MODE === 'cookie') headers.Authorization = AUTH;
  else {
    const ts = String(Math.floor(Date.now() / 1000));
    const preimage = `swimchain-rpc:${method}:${sha256(Buffer.from(paramsJson, 'utf-8')).toString('hex')}:${ts}`;
    const r = await rpcBare('sign_message', { message: Buffer.from(preimage, 'utf-8').toString('hex') });
    headers['x-cs-identity'] = AUTHOR;
    headers['x-cs-timestamp'] = ts;
    headers['x-cs-signature'] = r.signature;
  }
  const body = `{"jsonrpc":"2.0","id":${++rpcId},"method":${JSON.stringify(method)},"params":${paramsJson}}`;
  const res = await fetch(RPC, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
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
function actionSigPreimage(contentHash32, timestamp) {
  const b = Buffer.alloc(41);
  Buffer.from(contentHash32).copy(b, 0);
  b.writeBigUInt64LE(BigInt(timestamp), 32);
  b[40] = 0;
  return b;
}
async function minePow(contentHash32) {
  const difficulty = POW_DIFF[ActionType.Reply];
  const timestamp = Math.floor(Date.now() / 1000);
  const nonceSpace = randomBytes(8);
  const input = Buffer.alloc(90);
  input[0] = ActionType.Reply;
  contentHash32.copy(input, 1);
  authorBytes.copy(input, 33);
  input.writeBigUInt64BE(BigInt(timestamp), 65);
  input[73] = difficulty;
  nonceSpace.copy(input, 74);
  let nonce = 0n;
  for (;;) {
    input.writeBigUInt64BE(nonce, 82);
    const hash = await argon2id({ password: new Uint8Array(input), salt: new Uint8Array(nonceSpace), parallelism: POW_CONFIG.parallelism, memorySize: POW_CONFIG.memoryKib, iterations: POW_CONFIG.iterations, hashLength: 32, outputType: 'binary' });
    if (leadingZeros(hash) >= difficulty) {
      return { pow_nonce: Number(nonce), pow_difficulty: difficulty, pow_nonce_space: nonceSpace.toString('hex'), pow_hash: Buffer.from(hash).toString('hex'), timestamp };
    }
    nonce++;
  }
}
async function submitMove(gameId, san, ply) {
  const body = `${san} ${gameId}#${ply}`;
  const ch = sha256(Buffer.from(body, 'utf-8'));
  const pow = await minePow(ch);
  const sig = await signBytesWithNode(actionSigPreimage(ch, pow.timestamp));
  await rpc('submit_reply', { parent_id: gameId, body, author_id: AUTHOR, ...pow, signature: sig });
}

// ── chess: header parse + fold + search ───────────────────────────────────────
function parseHeader(body) {
  if (!body) return null;
  const nl = body.indexOf('\n\n');
  const json = nl >= 0 ? body.slice(nl + 2) : body;
  try { const h = JSON.parse(json); return h?.kind === 'chess' ? h : null; } catch { return null; }
}
// Replay the reply chain through chess.js. Legality is the real ordering gate:
// an out-of-order/illegal SAN simply doesn't apply, so the position self-heals.
function foldGame(replies) {
  const sorted = replies.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0) || String(a.content_id).localeCompare(b.content_id));
  const chess = new Chess();
  const applied = [];
  for (const r of sorted) {
    const san = (r.body ?? '').trim().split(/\s+/)[0];
    if (!san) continue;
    try { const mv = chess.move(san); if (mv) applied.push({ san: mv.san, author: (r.author_id || '').toLowerCase() }); } catch { /* illegal here */ }
  }
  const black = applied.length >= 2 ? applied[1].author : null;
  return { chess, black, ply: applied.length };
}

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 1_000_000;
// Small center-control bonus so the bot develops toward the middle instead of
// shuffling on the rim — "basic positional eval" on top of material.
function centerBonus(fileIdx, rankIdx) {
  const dc = 3.5 - Math.abs(3.5 - fileIdx);
  const dr = 3.5 - Math.abs(3.5 - rankIdx);
  return (dc + dr) * 2; // 0..14 centipawns-ish
}
// Static eval from WHITE's perspective (positive = White better).
function evaluate(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -MATE : MATE;
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial()) return 0;
  const board = chess.board(); // 8 rows, rank 8 first
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      const sign = sq.color === 'w' ? 1 : -1;
      let v = VAL[sq.type];
      if (sq.type !== 'k') v += centerBonus(f, 7 - r);
      score += sign * v;
    }
  }
  return score;
}
// Negamax (side-to-move perspective) with alpha-beta.
function negamax(chess, depth, alpha, beta) {
  if (depth === 0 || chess.isGameOver()) {
    const e = evaluate(chess);
    return chess.turn() === 'w' ? e : -e;
  }
  let best = -Infinity;
  for (const m of chess.moves()) {
    chess.move(m);
    const val = -negamax(chess, depth - 1, -beta, -alpha);
    chess.undo();
    if (val > best) best = val;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // prune
  }
  return best;
}
function chooseMove(chess, depth) {
  const moves = chess.moves();
  if (moves.length === 0) return null;
  // Shuffle for variety among equal-value moves (deterministic engines are dull).
  for (let i = moves.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [moves[i], moves[j]] = [moves[j], moves[i]]; }
  let best = moves[0], bestVal = -Infinity;
  for (const m of moves) {
    chess.move(m);
    const val = -negamax(chess, depth - 1, -Infinity, Infinity);
    chess.undo();
    if (val > bestVal) { bestVal = val; best = m; }
  }
  return best;
}

// ── main loop ─────────────────────────────────────────────────────────────────
const submittedFor = new Map(); // gameId -> fen we already answered (avoid double-submit before it lands)

async function tick() {
  const res = await rpc('list_space_posts', { space_id: CHESS_SPACE, limit: 100, offset: 0, sort: 'recent' });
  const games = (res?.items ?? []).map((it) => ({ id: it.content_id, header: parseHeader(it.body) }))
    .filter((g) => g.header && g.header.kind === 'chess' && g.header.bot === true);
  for (const g of games) {
    try {
      const white = (g.header.white || '').toLowerCase();
      if (white === AUTHOR) continue; // never play both sides of our own game
      const { replies } = await rpc('get_replies', { content_id: g.id });
      const { chess, black, ply } = foldGame(replies ?? []);
      if (chess.isGameOver()) continue;
      if (chess.turn() !== 'b') continue; // only the human's move (White) unblocks us
      if (black && black !== AUTHOR) continue; // someone else already took Black
      const fen = chess.fen();
      if (submittedFor.get(g.id) === fen) continue; // already answered this position; awaiting it
      const san = chooseMove(chess, DEPTH);
      if (!san) continue;
      await submitMove(g.id, san, ply);
      submittedFor.set(g.id, fen);
      console.log(`[${TAG} ${new Date().toISOString()}] ${g.id.slice(0, 14)}… played ${san} (ply ${ply})`);
    } catch (e) {
      console.log(`[${TAG}] ${g.id.slice(0, 14)}… error: ${e.message}`);
    }
  }
}

async function main() {
  console.log(`[${TAG}] watching chess space ${CHESS_SPACE} as ${AUTHOR.slice(0, 10)}… depth=${DEPTH}`);
  const deadline = Date.now() + RUN_MS;
  while (Date.now() < deadline) {
    try { await tick(); } catch (e) { console.log(`[${TAG}] tick error: ${e.message}`); }
    await sleep(GAP);
  }
}
main();
