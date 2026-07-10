/**
 * Proves the forum private-space MESSAGE flow end-to-end against a live node:
 *   create_private_space_managed -> get_my_private_spaces (name) ->
 *   encrypt_private_content -> submit_post(title="", body=cipher) with Post PoW ->
 *   list_posts_for_space -> decrypt_private_content  ==> recovers the plaintext.
 *
 * This mirrors exactly what forum-client/src/components/ChatView.tsx now does in node mode.
 * Run: RPC_URL=.. RPC_COOKIE=.. AUTHOR_PUBKEY=.. NETWORK=regtest node forum-msg-test.mjs
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
async function signWithNode(message) {
  const r = await rpc('sign_message', { message: Buffer.from(message, 'utf-8').toString('hex') });
  return r.signature;
}

const MSG = 'hello from the forum private space';

async function main() {
  // 1) create a private space (node-managed).
  // NOTE: encrypt/decrypt RPCs want the 16-byte HEX id; submit_post/list want the sp1 bech32.
  const created = await rpc('create_private_space_managed', { name: 'Forum War Room' });
  const spaceId = created.space_id;            // hex (crypto RPCs)
  const spaceBech = created.space_id_bech32;   // sp1... (post/list RPCs)
  console.log('1) created space:', spaceId, '/', spaceBech);

  // 2) it lists with the decrypted name
  const spaces = await rpc('get_my_private_spaces', { user: AUTHOR_PUBKEY });
  const mine = spaces.spaces.find((s) => s.space_id === spaceId);
  console.log('2) listed name:', JSON.stringify(mine?.name), mine?.name === 'Forum War Room' ? 'PASS' : 'FAIL');

  // 3) encrypt a message via the node
  const cipher = (await rpc('encrypt_private_content', { space_id: spaceId, content: MSG })).content;
  console.log('3) encrypted:', cipher.slice(0, 28), '...');

  // 4) post it to the space (title empty, body = ciphertext) with Post PoW + node sign
  const title = '';
  const pow = await mineActionPow(ActionType.Post, `${title}\n\n${cipher}`, authorBytes, NETWORK);
  const signature = await signWithNode(`post:${spaceBech}:${title}:${cipher}:${pow.timestamp}`);
  const posted = await rpc('submit_post', {
    space_id: spaceBech, title, body: cipher, author_id: AUTHOR_PUBKEY,
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash,
    signature, timestamp: pow.timestamp,
  });
  console.log('4) submit_post ->', posted?.content_id ? 'ok ' + posted.content_id.slice(0, 22) : JSON.stringify(posted));

  // 5) read messages back via list_posts_for_space (what usePrivateSpaceMessages uses)
  await sleep(800);
  const listed = await rpc('list_posts_for_space', { space_id: spaceBech, offset: 0, limit: 100, include_replies: true });
  console.log('5) list_posts_for_space returned', listed.items.length, 'item(s)');
  for (const p of listed.items) {
    console.log('   item:', p.content_id?.slice(0, 20), 'type=', p.content_type, 'body=', p.body == null ? 'NULL' : JSON.stringify(String(p.body).slice(0, 30)));
  }
  // Posts store `${title}\n\n${body}`; strip the empty-title separator (client does the same).
  const strip = (b) => { const i = b.indexOf('\n\n'); return i >= 0 ? b.slice(i + 2) : b; };
  const post = listed.items.find((p) => p.body && strip(p.body).startsWith('[PRIVATE:v1:'));
  if (!post) { console.log('\nRESULT: FAIL — posted message not returned by list_posts_for_space'); return; }

  // 6) decrypt the fetched ciphertext via the node (hex space id)
  const back = (await rpc('decrypt_private_content', { space_id: spaceId, content: strip(post.body) })).content;
  console.log('6) decrypted:', JSON.stringify(back));
  console.log('\nRESULT:', back === MSG ? 'PASS — forum private-space message round-trips end-to-end' : `FAIL — got ${JSON.stringify(back)}`);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
