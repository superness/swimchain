/**
 * reef-bot.mjs — a rule-based (NO AI) player for The Reef.
 *
 * It reads the real board by replaying the region's move log, then follows a
 * simple, legible policy: seed if it holds nothing, tend its coral to keep it
 * alive, spread from its reef into open water, and now and then contest a weak
 * enemy border. Moves are submitted exactly like a human client — real
 * proof-of-work + canonical signature — as the node's own (sponsored) identity.
 *
 * Env:
 *   RPC_URL         node RPC (default http://127.0.0.1:19736)
 *   AUTHOR_PUBKEY   the bot identity's 32-byte hex pubkey (the node's identity)
 *   AUTH_MODE       cookie (default; RPC_COOKIE required) | signature
 *   RPC_COOKIE      node cookie (cookie mode)
 *   REEF_SPACE      the reef space id (sp1…); used to auto-find a region
 *   REEF_REGION     a specific region content_id to play (else auto-pick one)
 *   BOT_PERSONALITY grower | tender | warrior | balanced (default balanced)
 *   BOT_INTERVAL_MS base gap between moves (default 6000; jittered ±50%)
 *   BOT_HOME        "cx,cy" preferred seed spot (default: random)
 *   BOT_TAG         log label (default reef-bot)
 *   BOT_MS          run duration (default Infinity)
 */
import { createHash, randomBytes } from 'node:crypto';
import { argon2id } from 'hash-wasm';
// THE PRODUCTION ENGINE — the bot reads the board with the exact same fold the
// client ships. There is deliberately NO local copy of the rules: the old
// hand-mirrored fold drifted (block-height vs move-count epochs) and the bot
// spent hours playing a board that didn't exist (2,284 rejected-invalid moves).
// Rebuild the bundle after any engine change (see engine-entry.ts / deploy script).
import {
  foldReef,
  myBudget,
  GRID_W,
  GRID_H,
  COST_GROW,
  COST_CONTEST,
} from './reefEngine.bundle.mjs';

const RPC = process.env.RPC_URL || 'http://127.0.0.1:19736';
const AUTHOR = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const COOKIE = process.env.RPC_COOKIE || '';
const MODE = process.env.AUTH_MODE || 'cookie';
const REEF_SPACE = process.env.REEF_SPACE || '';
let REGION = process.env.REEF_REGION || '';
const PERSONALITY = process.env.BOT_PERSONALITY || 'balanced';
const GAP = Number(process.env.BOT_INTERVAL_MS || 6000);
const TAG = process.env.BOT_TAG || 'reef-bot';
const RUN_MS = Number(process.env.BOT_MS || Infinity);
const HOME = (process.env.BOT_HOME || '').split(',').map(Number);
const NET = 'testnet';
if (!AUTHOR) throw new Error('AUTHOR_PUBKEY required');
if (MODE === 'cookie' && !COOKIE && process.env.BOT_MODE !== 'status')
  throw new Error('RPC_COOKIE required in cookie mode');
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = Buffer.from(AUTHOR, 'hex');
const authorPrefix = AUTHOR.slice(0, 10);

// Game rules come EXCLUSIVELY from reefEngine.bundle.mjs (imported above).
const ActionType = { Reply: 3 };
const POW_CONFIG = { memoryKib: 8192, iterations: 1, parallelism: 2 };
const POW_DIFF = { 3: 8 }; // reply difficulty on testnet

const sha256 = (b) => createHash('sha256').update(b).digest();
const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const key = (x, y) => `${x},${y}`;

// ── RPC (cookie or x-cs signature auth), mirrored from storm.mjs ───────────────
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
  if (MODE === 'cookie') {
    if (COOKIE) headers.Authorization = AUTH; // cookie-less read-only (status via gateway)
  } else {
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

// Canonical reply-action signature preimage: contentHash(32) || ts_le(8) || private(1)
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

/** Submit a reef move (grow|tend at x,y). Body carries a unique nonce so two
 *  distinct moves never dedup-collide; the fold reads only `<op> <x> <y>`. */
async function submitBody(body) {
  const ch = sha256(Buffer.from(body, 'utf-8'));
  const pow = await minePow(ch);
  const sig = await signBytesWithNode(actionSigPreimage(ch, pow.timestamp));
  await rpc('submit_reply', { parent_id: REGION, body, author_id: AUTHOR, ...pow, signature: sig });
  return 'sha256:' + ch.toString('hex'); // the reply's content_id (= sha256 of body)
}
async function submitMove(op, x, y) {
  const nonce = randomBytes(8).toString('hex');
  // `#<ms>~` is the authoring timestamp the fold orders by (matches the client's
  // submitReefMove); the random nonce keeps distinct moves from dedup-colliding.
  return submitBody(`${op} ${x} ${y} ${REGION}#${Date.now()}~${authorPrefix}~${nonce}`);
}

// ── board reading: THE PRODUCTION ENGINE, not a copy ──────────────────────────
// foldReef comes from reefEngine.bundle.mjs — bit-identical rules to every
// client. The bot cannot disagree with players about the board, by construction.
const ORTHO = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const inBounds = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
function parseHeader(body) {
  const brace = (body || '').indexOf('{');
  if (brace >= 0) {
    try {
      const h = JSON.parse(body.slice(brace));
      if (h.kind === 'reef') return h;
    } catch { /* fall through */ }
  }
  return { v: 1, kind: 'reef', founder: '', w: GRID_W, h: GRID_H, created: 0 };
}
async function readBoard() {
  const [post, res, info] = await Promise.all([
    rpc('get_content', { content_id: REGION }).catch(() => null),
    rpc('get_replies', { content_id: REGION, limit: 100000 }),
    rpc('get_info', {}).catch(() => ({})),
  ]);
  const header = parseHeader(post?.body ?? '');
  const tip = typeof info.block_height === 'number' ? info.block_height : undefined;
  const state = foldReef(header, res?.replies ?? [], tip);
  const cells = state.cells;
  const budget = myBudget(state, AUTHOR, AUTHOR);
  // content_id -> settled outcome, for repro-mode tracing.
  const outcomes = new Map(state.moves.map((m) => [m.contentId, m.outcome]));

  const mine = []; // [x, y, vitality] of my LIVING coral
  for (const [k, c] of cells) if (c.owner === AUTHOR) { const [x, y] = k.split(',').map(Number); mine.push([x, y, c.vitality]); }
  const isMe = (x, y) => cells.get(key(x, y))?.owner === AUTHOR;
  const openAdjacent = [], enemyAdjacent = [], seenOpen = new Set();
  for (const [mx, my] of mine) {
    for (const [dx, dy] of ORTHO) {
      const nx = mx + dx, ny = my + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny), occ = cells.get(nk);
      if (!occ) { if (!seenOpen.has(nk)) { seenOpen.add(nk); openAdjacent.push([nx, ny]); } }
      else if (occ.owner !== AUTHOR) enemyAdjacent.push([nx, ny, occ.vitality]);
    }
  }
  return { cells, budget, mine, openAdjacent, enemyAdjacent, outcomes, epoch: state.epoch, params: state.params };
}

// ── strategy (rule-based, no AI) ──────────────────────────────────────────────
const WEIGHTS = {
  grower: { tend: 25, spread: 65, contest: 10 },
  tender: { tend: 60, spread: 35, contest: 5 },
  warrior: { tend: 20, spread: 40, contest: 40 },
  balanced: { tend: 40, spread: 45, contest: 15 },
};
function weightedPick(w) {
  const total = w.tend + w.spread + w.contest;
  let r = Math.random() * total;
  if ((r -= w.tend) < 0) return 'tend';
  if ((r -= w.spread) < 0) return 'spread';
  return 'contest';
}
function chooseMove(board) {
  // No living reef → seed onto OPEN water. Prefer BOT_HOME, else search for a free
  // tile (a random interior tile is usually occupied on a busy reef, so scan).
  if (board.mine.length === 0) {
    const free = (x, y) => inBounds(x, y) && !board.cells.has(key(x, y));
    if (Number.isInteger(HOME[0]) && Number.isInteger(HOME[1]) && free(HOME[0], HOME[1])) {
      return { op: 'grow', x: HOME[0], y: HOME[1], why: 'seed' };
    }
    for (let i = 0; i < 40; i++) {
      const x = 1 + Math.floor(Math.random() * (GRID_W - 2));
      const y = 1 + Math.floor(Math.random() * (GRID_H - 2));
      if (free(x, y)) return { op: 'grow', x, y, why: 'seed' };
    }
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) if (free(x, y)) return { op: 'grow', x, y, why: 'seed' };
    return null; // board is completely full (all 144 tiles held) — nothing to do
  }

  // SURVIVAL FIRST: coral recedes at vitality 0, so if any of ours is about to
  // fade, tend the weakest — this is what stops "spots resetting". A competent
  // player never lets coral die untended; the bot shouldn't either.
  const dying = board.mine.filter(([, , v]) => v <= 2).sort((a, b) => a[2] - b[2]);
  if (dying.length) {
    const [x, y] = dying[0];
    return { op: 'tend', x, y, why: 'rescue-tend' };
  }

  const w = WEIGHTS[PERSONALITY] || WEIGHTS.balanced;
  const want = weightedPick(w);
  const canAfford = (cost) => board.budget >= cost;

  if (want === 'contest' && board.enemyAdjacent.length && canAfford(COST_CONTEST)) {
    const [x, y] = pick(board.enemyAdjacent);
    return { op: 'grow', x, y, why: 'contest' };
  }
  if (want !== 'tend' && board.openAdjacent.length && canAfford(COST_GROW)) {
    const [x, y] = pick(board.openAdjacent);
    return { op: 'grow', x, y, why: 'spread' };
  }
  // Tend (also the fallback when boxed in or out of budget): refresh the coral
  // with the most to lose so our territory stays alive and keeps scoring.
  const weakest = [...board.mine].sort((a, b) => a[2] - b[2])[0];
  return { op: 'tend', x: weakest[0], y: weakest[1], why: 'tend' };
}

// ── region discovery (if REEF_REGION not given) ───────────────────────────────
function isReefHeader(body) {
  // A region header body is "<title>\n\n{json}" (or bare json). Look for the
  // reef kind marker anywhere in the trailing JSON blob.
  const brace = (body || '').indexOf('{');
  if (brace < 0) return false;
  try { return JSON.parse(body.slice(brace)).kind === 'reef'; } catch { return false; }
}
async function findRegion() {
  if (REGION) return REGION;
  if (!REEF_SPACE) throw new Error('set REEF_REGION or REEF_SPACE to locate a reef');
  const c = await rpc('list_space_posts', { space_id: REEF_SPACE, limit: 100, offset: 0, sort: 'recent' });
  for (const it of c?.items ?? []) if (isReefHeader(it.body)) return it.content_id;
  return '';
}

// ── main loop ─────────────────────────────────────────────────────────────────
// ── REPRO MODE: reproduce "not next to your reef" on a FRESHLY taken tile ──────
// Take an open tile T1 (a valid move now), then IMMEDIATELY spread to T2 — a tile
// whose only support is T1. Then poll the fold every ~1.2s and log each move's
// block_height, created_at, apply-order and settled outcome, until both settle.
// If T2 shows 'rejected-invalid' while T1 is unconfirmed (or ordered after T2),
// that's the real bug — a stale/ordering race, not decay.
async function traceOnce(cid1, cid2, t1, t2) {
  const [res, info] = await Promise.all([
    rpc('get_replies', { content_id: REGION, limit: 100000 }),
    rpc('get_info', {}).catch(() => ({})),
  ]);
  const reps = res?.replies ?? [];
  const tip = typeof info.block_height === 'number' ? info.block_height : undefined;
  const state = foldReef(parseHeader(''), reps, tip);
  const cells = state.cells;
  const outcomes = new Map(state.moves.map((m) => [m.contentId, m.outcome]));
  const find = (cid) => reps.find((r) => r.content_id === cid);
  const r1 = find(cid1), r2 = find(cid2);
  const fmt = (r, cid) => {
    if (!r) return 'NOT-IN-REPLIES';
    const h = typeof r.block_height === 'number' ? `h${r.block_height}` : 'PENDING';
    return `${h} ca=${r.created_at} → ${outcomes.get(cid) ?? '(unapplied)'}`;
  };
  // Effective apply order of the two moves under the fold's sort.
  let order = '?';
  if (r1 && r2) {
    const conf = (r) => typeof r.block_height === 'number';
    const kc = (r) => [conf(r) ? 0 : 1, conf(r) ? r.block_height : 0, r.created_at, r.content_id];
    const a = kc(r1), b = kc(r2);
    let cmp = 0;
    for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) { cmp = -1; break; } if (a[i] > b[i]) { cmp = 1; break; } }
    order = cmp <= 0 ? 'T1-before-T2 (correct)' : 'T2-before-T1 (INVERTED)';
  }
  const t1Alive = cells.get(key(t1[0], t1[1]))?.owner === AUTHOR;
  const t2Owner = cells.get(key(t2[0], t2[1]))?.owner;
  console.log(`  tip=${tip}  order=${order}`);
  console.log(`    T1(${t1[0]},${t1[1]}) ${fmt(r1, cid1)}   [alive=${t1Alive}]`);
  console.log(`    T2(${t2[0]},${t2[1]}) ${fmt(r2, cid2)}   [owner=${t2Owner ? t2Owner.slice(0, 8) : 'none'}]`);
  return outcomes.get(cid2);
}
async function reproMode() {
  const board = await readBoard();
  const mineSet = new Set(board.mine.map(([x, y]) => key(x, y)));
  const adjMine = (x, y) => ORTHO.some(([dx, dy]) => mineSet.has(key(x + dx, y + dy)));
  const isOpen = (x, y) => inBounds(x, y) && !board.cells.has(key(x, y));
  // Find (T1, T2): T1 is a legal move now (spread off my reef, or seed if I own
  // nothing); T2 is an open neighbor of T1 whose ONLY support is T1 (not already
  // adjacent to my reef), so T2 is legal ONLY once T1 has taken hold.
  let t1 = null, t2 = null;
  const t1candidates = board.mine.length === 0 ? [[6, 6]] : board.openAdjacent;
  for (const c of t1candidates) {
    for (const [dx, dy] of ORTHO) {
      const nx = c[0] + dx, ny = c[1] + dy;
      if (isOpen(nx, ny) && !adjMine(nx, ny) && !(nx === c[0] && ny === c[1])) { t1 = c; t2 = [nx, ny]; break; }
    }
    if (t2) break;
  }
  if (!t2) { console.log('[repro] could not find a clean (T1,T2) pair on this board; retry when the reef is less dense'); return; }

  console.log(`[repro] T1=(${t1[0]},${t1[1]}) then immediately T2=(${t2[0]},${t2[1]}) — T2's only support is T1`);
  const cid1 = await submitMove('grow', t1[0], t1[1]);
  console.log(`[repro] submitted T1 ${cid1.slice(0, 18)}…`);
  const cid2 = await submitMove('grow', t2[0], t2[1]); // back-to-back, before T1 confirms
  console.log(`[repro] submitted T2 ${cid2.slice(0, 18)}…`);

  for (let i = 0; i < 24; i++) {
    console.log(`[repro t+${i}]`);
    const out2 = await traceOnce(cid1, cid2, t1, t2);
    if (out2 === 'grew') { console.log('[repro] T2 settled → grew. (watch above for any transient rejection)'); }
    await sleep(1300);
  }
  console.log('[repro] done');
}

async function main() {
  REGION = await findRegion();
  if (!REGION) throw new Error('no reef region found (set REEF_REGION or REEF_SPACE)');
  console.log(`[${TAG}] region ${REGION.slice(0, 20)}… as ${authorPrefix}…`);
  if (process.env.BOT_MODE === 'status') {
    // Read-only: print the engine-truth board as this bot sees it, then exit.
    const b = await readBoard();
    const owners = new Map();
    for (const c of b.cells.values()) owners.set(c.owner, (owners.get(c.owner) ?? 0) + 1);
    console.log(
      `[${TAG}] epoch=${b.epoch} params=${JSON.stringify(b.params)} totalCells=${b.cells.size} mine=${b.mine.length} budget=${b.budget}`
    );
    for (const [o, n] of [...owners].sort((a, z) => z[1] - a[1])) console.log(`  ${o.slice(0, 10)}… ${n} cells`);
    return;
  }
  if (process.env.BOT_MODE === 'retune') {
    // One-shot founder rule change: RETUNE="epochMoves=6 tendCap=4". Only the
    // region FOUNDER's identity makes this take effect (the fold ignores others).
    const tune = (process.env.RETUNE || '').trim();
    if (!/^((epochMoves|tendCap)=\d+\s*)+$/.test(tune)) throw new Error('RETUNE must be like "epochMoves=6 tendCap=4"');
    const cid = await submitBody(`retune ${tune} #${Date.now()}~${authorPrefix}`);
    console.log(`[${TAG}] retune submitted: ${tune} · cid=${cid.slice(0, 20)}…`);
    return;
  }
  if (process.env.BOT_MODE === 'repro') { await reproMode(); return; }
  console.log(`[${TAG}] playing (${PERSONALITY})`);
  const deadline = Date.now() + RUN_MS;
  const stats = { ok: 0, fail: 0 };
  while (Date.now() < deadline) {
    try {
      const board = await readBoard();
      const move = chooseMove(board);
      if (!move) {
        console.log(`[${TAG}] no move available (${board.mine.length} cells) — waiting`);
      } else {
        const t0 = Date.now();
        await submitMove(move.op, move.x, move.y);
        stats.ok++;
        console.log(`[${TAG} ${new Date().toISOString()}] ${move.why} ${move.op} (${move.x},${move.y}) · ${board.mine.length} cells (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      }
    } catch (e) {
      stats.fail++;
      console.log(`[${TAG}] move failed: ${e.message}`);
    }
    await sleep(GAP / 2 + Math.random() * GAP);
  }
  console.log(`[${TAG}] done — ok=${stats.ok} fail=${stats.fail}`);
}
main();
