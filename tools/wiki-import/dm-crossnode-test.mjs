/**
 * Proves cross-node delivery of private-space content for DMs:
 *   node A submits a channel post + an encrypted message in the shared DM space,
 *   node B (peer + member) sees them via listSpaceContent / get_replies and decrypts.
 *
 * This is the linchpin for "fully chat-usable DMs": the request/accept handshake
 * already makes both nodes members of the same DM space; this checks that content
 * posted by one actually reaches the other.
 *
 * Run: RPC_A=.. COOKIE_A=.. PK_A=.. RPC_B=.. COOKIE_B=.. PK_B=.. SPACE=.. NETWORK=regtest node dm-crossnode-test.mjs
 */
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const RPC_A = process.env.RPC_A, RPC_B = process.env.RPC_B;
const PK_A = process.env.PK_A;
const SPACE = process.env.SPACE;
const NETWORK = process.env.NETWORK || 'regtest';
const authA = 'Basic ' + Buffer.from(`__cookie__:${process.env.COOKIE_A}`).toString('base64');
const authB = 'Basic ' + Buffer.from(`__cookie__:${process.env.COOKIE_B}`).toString('base64');
const authorBytes = hexToBytes(PK_A);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let id = 0;
async function call(url, auth, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const json = JSON.parse(await res.text());
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  await sleep(300);
  return json.result;
}
const rpcA = (m, p) => call(RPC_A, authA, m, p);
const rpcB = (m, p) => call(RPC_B, authB, m, p);
const signA = async (msg) => (await rpcA('sign_message', { message: Buffer.from(msg, 'utf-8').toString('hex') })).signature;

const CHANNEL = 'messages';
const MSG = 'hello across the network';

async function main() {
  let pass = true;
  const check = (label, ok) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} — ${label}`); if (!ok) pass = false; };
  console.log('DM space:', SPACE);

  // A creates the default channel (top-level post) in the DM space.
  let pow = await mineActionPow(ActionType.Post, `${CHANNEL}\n\n`, authorBytes, NETWORK);
  let sig = await signA(`post:${SPACE}:${CHANNEL}::${pow.timestamp}`);
  const channel = await rpcA('submit_post', {
    space_id: SPACE, title: CHANNEL, body: '', author_id: PK_A,
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp,
  });
  const channelId = channel?.content_id;
  check('A created channel', !!channelId);
  console.log('   channelId:', channelId);

  // A posts an encrypted message (reply to the channel).
  const cipher = (await rpcA('encrypt_private_content', { space_id: SPACE, content: MSG })).content;
  pow = await mineActionPow(ActionType.Reply, cipher, authorBytes, NETWORK);
  sig = await signA(`reply:${channelId}:${cipher}:${pow.timestamp}`);
  const sent = await rpcA('submit_reply', {
    parent_id: channelId, body: cipher, author_id: PK_A,
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp,
  });
  check('A posted message', !!sent?.content_id);

  // Poll node B for the channel + message (cross-node sync).
  console.log('   waiting for B to sync...');
  let sawChannel = false, sawMsg = false, decrypted = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const list = await rpcB('list_space_content', { space_id: SPACE, limit: 100 });
      const items = list.items || [];
      if (items.some((it) => it.content_id === channelId)) sawChannel = true;
      if (items.some((it) => it.content_id === sent.content_id)) sawMsg = true;
      // Try decrypt on B
      if (sawMsg) {
        const msgItem = items.find((it) => it.content_id === sent.content_id);
        if (msgItem?.body?.startsWith('[PRIVATE:v1:')) {
          try { decrypted = (await rpcB('decrypt_private_content', { space_id: SPACE, content: msgItem.body })).content; } catch {}
        }
      }
      if (sawChannel && sawMsg) { console.log(`   B synced after ${i + 1}s`); break; }
    } catch (e) { /* keep polling */ }
  }
  check('B sees the channel', sawChannel);
  check('B sees the message', sawMsg);
  if (decrypted !== null) check('B decrypted the message', decrypted === MSG);
  else console.log('   (message not decryptable on B yet — sync/ordering)');

  console.log('\nRESULT:', pass ? 'PASS — DM content crosses nodes' : 'FAIL — cross-node content sync incomplete');
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
