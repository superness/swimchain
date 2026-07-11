/**
 * Proves chat images now persist: upload_media -> submit_reply with media_refs ->
 * get_replies returns the media_refs (the node used to drop them on replies).
 * Run: RPC_URL=.. RPC_COOKIE=.. AUTHOR_PUBKEY=.. NETWORK=regtest node reply-media-test.mjs
 */
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const RPC_URL = process.env.RPC_URL, COOKIE = process.env.RPC_COOKIE, PK = process.env.AUTHOR_PUBKEY;
const NETWORK = process.env.NETWORK || 'regtest';
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = hexToBytes(PK);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
async function rpc(m, p) {
  const res = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = JSON.parse(await res.text());
  if (j.error) throw new Error(`${m}: ${j.error.message}`);
  await sleep(300); return j.result;
}
const sign = async (s) => (await rpc('sign_message', { message: Buffer.from(s, 'utf-8').toString('hex') })).signature;
// 1x1 transparent PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

async function main() {
  let pass = true;
  const check = (l, ok) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} — ${l}`); if (!ok) pass = false; };

  const up = await rpc('upload_media', { data: PNG_B64, media_type: 'image/png' });
  check('upload_media returned a hash', !!up.media_hash);
  console.log('   media_hash:', up.media_hash, 'size:', up.size_bytes);

  const space = (await rpc('create_private_space_managed', { name: 'Pic Room' })).space_id;
  // channel
  let pow = await mineActionPow(ActionType.Post, `general\n\n`, authorBytes, NETWORK);
  let sig = await sign(`post:${space}:general::${pow.timestamp}`);
  const channel = await rpc('submit_post', { space_id: space, title: 'general', body: '', author_id: PK, pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty, pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp });
  const channelId = channel.content_id;

  // reply WITH media
  const body = 'here is a pic';
  pow = await mineActionPow(ActionType.Reply, body, authorBytes, NETWORK);
  sig = await sign(`reply:${channelId}:${body}:${pow.timestamp}`);
  const reply = await rpc('submit_reply', {
    parent_id: channelId, body, author_id: PK,
    media_refs: [{ media_hash: up.media_hash, media_type: 'image/png', size_bytes: up.size_bytes }],
    pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty, pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp,
  });
  check('reply accepted', !!reply.content_id);

  await sleep(800);
  const replies = (await rpc('get_replies', { content_id: channelId })).replies || [];
  const mine = replies.find((r) => r.content_id === reply.content_id);
  check('reply returned by get_replies', !!mine);
  const mrefs = mine?.media_refs || [];
  check('reply carries media_refs (image persisted)', mrefs.length === 1 && mrefs[0].media_hash === up.media_hash);
  console.log('   media_refs on reply:', JSON.stringify(mrefs));

  // and the bytes are fetchable
  const got = await rpc('get_media', { media_hash: up.media_hash }).catch(() => null);
  check('get_media returns the bytes', !!(got && (got.data || got.media_data)));

  console.log('\nRESULT:', pass ? 'PASS — chat reply images persist end-to-end' : 'FAIL');
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
