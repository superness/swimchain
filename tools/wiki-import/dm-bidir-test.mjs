/**
 * Mirrors DmConversation end-to-end, both directions:
 *   - each side resolves the canonical channel (min content_id among top-level posts,
 *     creating one if none),
 *   - sends a message as an encrypted REPLY to that channel,
 *   - reads the other side's message via get_replies and decrypts it.
 */
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const A = { url: process.env.RPC_A, cookie: process.env.COOKIE_A, pk: process.env.PK_A };
const B = { url: process.env.RPC_B, cookie: process.env.COOKIE_B, pk: process.env.PK_B };
const SPACE = process.env.SPACE, NETWORK = process.env.NETWORK || 'regtest';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
function mk(node) {
  const auth = 'Basic ' + Buffer.from(`__cookie__:${node.cookie}`).toString('base64');
  return async (m, p) => {
    const res = await fetch(node.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
    const j = JSON.parse(await res.text());
    if (j.error) throw new Error(`${m}: ${j.error.message}`);
    await sleep(250); return j.result;
  };
}
const rpcA = mk(A), rpcB = mk(B);
const signWith = (rpc) => async (s) => (await rpc('sign_message', { message: Buffer.from(s, 'utf-8').toString('hex') })).signature;

async function resolveChannel(rpc, pk) {
  const list = await rpc('list_space_content', { space_id: SPACE, limit: 200 });
  const posts = (list.items || []).filter((it) => it.content_type === 'Post' || !it.parent_id).map((it) => it.content_id).sort();
  if (posts.length) return posts[0];
  const pow = await mineActionPow(ActionType.Post, `messages\n\n`, hexToBytes(pk), NETWORK);
  const sig = await signWith(rpc)(`post:${SPACE}:messages::${pow.timestamp}`);
  const c = await rpc('submit_post', { space_id: SPACE, title: 'messages', body: '', author_id: pk, pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty, pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp });
  return c.content_id;
}
async function sendMsg(rpc, pk, channelId, text) {
  const cipher = (await rpc('encrypt_private_content', { space_id: SPACE, content: text })).content;
  const pow = await mineActionPow(ActionType.Reply, cipher, hexToBytes(pk), NETWORK);
  const sig = await signWith(rpc)(`reply:${channelId}:${cipher}:${pow.timestamp}`);
  return rpc('submit_reply', { parent_id: channelId, body: cipher, author_id: pk, pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty, pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp });
}
async function readMsgs(rpc, channelId) {
  const res = await rpc('get_replies', { content_id: channelId });
  const out = [];
  for (const r of res.replies || []) {
    if (!(r.body || '').startsWith('[PRIVATE:v1:')) continue;
    try { out.push((await rpc('decrypt_private_content', { space_id: SPACE, content: r.body })).content); } catch {}
  }
  return out;
}

async function main() {
  let pass = true;
  const check = (l, ok) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} — ${l}`); if (!ok) pass = false; };

  const chA = await resolveChannel(rpcA, A.pk);
  const chB = await resolveChannel(rpcB, B.pk);
  console.log('   A channel:', chA);
  console.log('   B channel:', chB);
  check('both sides resolve the SAME canonical channel', chA === chB);

  const MA = 'hi from A ' + Date.now() % 10000;
  const MB = 'hey from B ' + Date.now() % 10000;
  await sendMsg(rpcA, A.pk, chA, MA);
  await sendMsg(rpcB, B.pk, chB, MB);

  let bGotA = false, aGotB = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const onB = await readMsgs(rpcB, chB);
    const onA = await readMsgs(rpcA, chA);
    if (onB.includes(MA)) bGotA = true;
    if (onA.includes(MB)) aGotB = true;
    if (bGotA && aGotB) { console.log(`   converged after ${i + 1}s`); break; }
  }
  check('B received + decrypted A\'s message', bGotA);
  check('A received + decrypted B\'s message', aGotB);

  console.log('\nRESULT:', pass ? 'PASS — bidirectional DM messaging works cross-node' : 'FAIL');
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
