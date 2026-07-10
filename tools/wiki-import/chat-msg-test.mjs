/**
 * Proves the CHAT node-mode private flow end-to-end, mirroring exactly what the
 * desktop chat client does after the fixes:
 *   create_private_space_managed (server)  ->  submit_post title=<name> body=''
 *   (a CHANNEL = top-level thread, what CreateChannelModal does)  ->
 *   encrypt_private_content  ->  submit_reply (a MESSAGE = encrypted reply to the
 *   channel)  ->  list -> strip? no (replies carry the raw cipher) -> decrypt.
 *
 * Run: RPC_URL=.. RPC_COOKIE=.. AUTHOR_PUBKEY=.. NETWORK=regtest node chat-msg-test.mjs
 */
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const RPC_URL = process.env.RPC_URL;
const RPC_COOKIE = process.env.RPC_COOKIE;
const AUTHOR_PUBKEY = process.env.AUTHOR_PUBKEY;
const NETWORK = process.env.NETWORK || 'regtest';
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${RPC_COOKIE}`).toString('base64');
const authorBytes = hexToBytes(AUTHOR_PUBKEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let id = 0;
async function rpc(method, params) {
  for (let a = 0; ; a++) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AUTH },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const json = JSON.parse(await res.text());
    if (json.error) {
      if (/rate limit|too many/i.test(json.error.message || '') && a < 6) { await sleep(6000); continue; }
      throw new Error(`${method}: ${json.error.message}`);
    }
    await sleep(500);
    return json.result;
  }
}
const sign = async (msg) => (await rpc('sign_message', { message: Buffer.from(msg, 'utf-8').toString('hex') })).signature;

const CHANNEL = 'general';
const MSG = 'hello from chat';

async function main() {
  let pass = true;
  const check = (label, ok) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} — ${label}`); if (!ok) pass = false; };

  // 1) create the private channel (= a private space / server)
  const created = await rpc('create_private_space_managed', { name: 'Chat War Room' });
  const spaceHex = created.space_id;
  console.log('1) server (space):', spaceHex);

  // 2) create a CHANNEL: a top-level Post with title=name, empty body (CreateChannelModal).
  //    PoW binds to sha256(`${title}\n\n${body}`) => mine over `general\n\n`.
  let pow = await mineActionPow(ActionType.Post, `${CHANNEL}\n\n`, authorBytes, NETWORK);
  let sig = await sign(`post:${spaceHex}:${CHANNEL}::${pow.timestamp}`);
  const channel = await rpc('submit_post', {
    space_id: spaceHex, title: CHANNEL, body: '', author_id: AUTHOR_PUBKEY,
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp,
  });
  const channelId = channel?.content_id;
  check('channel (thread) created', !!channelId);
  console.log('2) channelId:', channelId);

  // 3) encrypt a message via the node
  const cipher = (await rpc('encrypt_private_content', { space_id: spaceHex, content: MSG })).content;
  check('message encrypted', cipher.startsWith('[PRIVATE:v1:'));

  // 4) send the MESSAGE: an encrypted reply to the channel thread
  pow = await mineActionPow(ActionType.Reply, cipher, authorBytes, NETWORK);
  sig = await sign(`reply:${channelId}:${cipher}:${pow.timestamp}`);
  const sent = await rpc('submit_reply', {
    parent_id: channelId, body: cipher, author_id: AUTHOR_PUBKEY,
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp,
  });
  check('message (reply) accepted', !!sent?.content_id);

  // 5) read it back via get_replies (what the chat client uses) and decrypt
  await sleep(800);
  const replies = await rpc('get_replies', { content_id: channelId });
  const reply = (replies.replies || []).find((r) => r.body && r.body.startsWith('[PRIVATE:v1:'));
  check('encrypted reply returned by get_replies', !!reply);
  if (!reply) { finish(pass); return; }
  const back = (await rpc('decrypt_private_content', { space_id: spaceHex, content: reply.body })).content;
  console.log('5) decrypted message:', JSON.stringify(back));
  check('recovered message matches', back === MSG);

  finish(pass);
}
function finish(pass) {
  console.log('\nRESULT:', pass ? 'PASS — chat private channel+message round-trips end-to-end (node mode)' : 'FAIL — see above');
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
