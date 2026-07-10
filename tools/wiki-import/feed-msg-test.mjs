/**
 * Proves the FEED private-space POST flow end-to-end against a live node, exercising
 * two things the client relies on after the parity fixes:
 *   1. the node now accepts a HEX space id for submit_post / list_posts_for_space
 *      (previously only bech32 sp1... was allowed) — and BECH32 for encrypt/decrypt;
 *   2. feed's convention: encrypt `${title}\n\n${body}` as one blob, submit with an
 *      EMPTY title, then on read stripTitleSeparator() + decrypt + split recovers
 *      both the title and body.
 *
 * Run: RPC_URL=.. RPC_COOKIE=.. AUTHOR_PUBKEY=.. NETWORK=regtest node feed-msg-test.mjs
 */
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const RPC_URL = process.env.RPC_URL;
const RPC_COOKIE = process.env.RPC_COOKIE;
const AUTHOR_PUBKEY = process.env.AUTHOR_PUBKEY;
const NETWORK = process.env.NETWORK || 'regtest';
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${RPC_COOKIE}`).toString('base64');
const authorBytes = hexToBytes(AUTHOR_PUBKEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mirror of the client's stripTitleSeparator (feed-client/src/hooks/useRpc.tsx).
const stripTitleSeparator = (t) => { const i = t.indexOf('\n\n'); return i >= 0 ? t.slice(i + 2) : t; };

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

const TITLE = 'War Plans';
const BODY = 'the secret feed message';

async function main() {
  let pass = true;
  const check = (label, ok) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} — ${label}`); if (!ok) pass = false; };

  // 1) create a private space (node-managed).
  const created = await rpc('create_private_space_managed', { name: 'Feed War Room' });
  const spaceHex = created.space_id;          // 16-byte hex
  const spaceBech = created.space_id_bech32;   // sp1...
  console.log('1) created space hex:', spaceHex, '/ bech:', spaceBech);

  // 2) it lists with the decrypted name
  const spaces = await rpc('get_my_private_spaces', { user: AUTHOR_PUBKEY });
  const mineSpace = spaces.spaces.find((s) => s.space_id === spaceHex);
  check('space lists with decrypted name', mineSpace?.name === 'Feed War Room');

  // 3a) encrypt via the node using the HEX id (feed uses hex end-to-end)
  const cipher = (await rpc('encrypt_private_content', { space_id: spaceHex, content: `${TITLE}\n\n${BODY}` })).content;
  check('encrypt(hex) returns [PRIVATE:v1:...]', cipher.startsWith('[PRIVATE:v1:'));

  // 3b) node now accepts BECH32 for encrypt/decrypt too (parse_space_id_16 unification)
  let bechOk = true;
  try { await rpc('encrypt_private_content', { space_id: spaceBech, content: 'x' }); } catch { bechOk = false; }
  check('encrypt(bech32) accepted by node (id-form unification)', bechOk);

  // 4) submit_post with the HEX id (previously rejected: "must start with sp1"),
  //    EMPTY title + ciphertext body (feed convention).
  const title = '';
  const pow = await mineActionPow(ActionType.Post, `${title}\n\n${cipher}`, authorBytes, NETWORK);
  const signature = await signWithNode(`post:${spaceHex}:${title}:${cipher}:${pow.timestamp}`);
  const posted = await rpc('submit_post', {
    space_id: spaceHex, title, body: cipher, author_id: AUTHOR_PUBKEY,
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty,
    pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash,
    signature, timestamp: pow.timestamp,
  });
  check('submit_post(HEX id) accepted', !!posted?.content_id);

  // 5) list via the HEX id (previously bech32-only)
  await sleep(800);
  const listed = await rpc('list_posts_for_space', { space_id: spaceHex, offset: 0, limit: 100, include_replies: true });
  check('list_posts_for_space(HEX id) returns the post', listed.items.length >= 1);
  const post = listed.items.find((p) => p.body && isPrivate(stripTitleSeparator(p.body)));
  check('stored post recognised as private after stripTitleSeparator', !!post);
  if (!post) { finish(pass); return; }

  // 6) decrypt the stripped ciphertext and split back into title/body
  const plain = (await rpc('decrypt_private_content', { space_id: spaceHex, content: stripTitleSeparator(post.body) })).content;
  const i = plain.indexOf('\n\n');
  const gotTitle = i === -1 ? '' : plain.slice(0, i);
  const gotBody = i === -1 ? plain : plain.slice(i + 2);
  console.log('6) decrypted title:', JSON.stringify(gotTitle), 'body:', JSON.stringify(gotBody));
  check('recovered title matches', gotTitle === TITLE);
  check('recovered body matches', gotBody === BODY);

  finish(pass);
}
const isPrivate = (t) => typeof t === 'string' && t.startsWith('[PRIVATE:v1:');
function finish(pass) {
  console.log('\nRESULT:', pass ? 'PASS — feed private-space post round-trips end-to-end (hex ids + empty-title convention)' : 'FAIL — see above');
  if (!pass) process.exit(1);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
