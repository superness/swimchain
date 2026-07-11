/**
 * Verifies: (a) list_spaces returns ONLY public spaces (private/DM hidden),
 * (b) get_user_profile parses name/bio/website + avatar from a real profile body.
 */
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';
import { createHash } from 'node:crypto';

const RPC = process.env.RPC_URL, COOKIE = process.env.RPC_COOKIE, PK = process.env.AUTHOR_PUBKEY;
const NETWORK = process.env.NETWORK || 'regtest';
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const authorBytes = hexToBytes(PK);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
async function rpc(m, p) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = JSON.parse(await res.text());
  if (j.error) throw new Error(`${m}: ${j.error.message}`);
  await sleep(250); return j.result;
}
const sign = async (s) => (await rpc('sign_message', { message: Buffer.from(s, 'utf-8').toString('hex') })).signature;
const profileSpaceHex = () => createHash('sha256').update('profile:v1:' + PK.toLowerCase()).digest('hex').slice(0, 32);

async function post(space, title, body) {
  const pow = await mineActionPow(ActionType.Post, `${title}\n\n${body}`, authorBytes, NETWORK);
  const sig = await sign(`post:${space}:${title}:${body}:${pow.timestamp}`);
  return rpc('submit_post', { space_id: space, title, body, author_id: PK, pow_nonce: pow.pow_nonce, pow_difficulty: pow.pow_difficulty, pow_nonce_space: pow.pow_nonce_space, pow_hash: pow.pow_hash, signature: sig, timestamp: pow.timestamp });
}

async function main() {
  let pass = true;
  const check = (l, ok) => { console.log(`   ${ok ? 'PASS' : 'FAIL'} — ${l}`); if (!ok) pass = false; };

  // --- list_spaces hides private + DM spaces (fresh node has no public spaces,
  //     so after creating ONLY a private channel + a DM, list_spaces must be empty) ---
  await rpc('create_private_space_managed', { name: 'Secret Room' });
  await rpc('request_dm_managed', { recipient: '9ec9661d3a975ad141caa5df9f14b3c46cf725509e7fa044c19d26fe76bd0420' });
  await sleep(500);
  const spaces = (await rpc('list_spaces', { limit: 100, offset: 0 })).spaces || [];
  console.log('   list_spaces returned:', JSON.stringify(spaces.map((s) => s.name)));
  check('private + DM spaces hidden from public list_spaces (empty)', spaces.length === 0);

  // --- profile parse: name/bio/website + avatar ---
  const space = profileSpaceHex();
  const info = { displayName: 'Alice Wonderland', bio: 'I build decentralized things.', website: 'https://alice.example', updatedAt: 1000 };
  await post(space, '', `[PROFILE_INFO]${JSON.stringify(info)}`);
  await sleep(400);
  let prof = await rpc('get_user_profile', { user_id: PK });
  console.log('   profile (info only):', JSON.stringify(prof));
  check('display_name parsed', prof && prof.display_name === 'Alice Wonderland');
  check('bio parsed', prof && prof.bio === info.bio);
  check('website parsed', prof && prof.website === info.website);

  // avatar update: combined body avatar + info, newer updatedAt
  const av = { contentId: 'abc123deadbeef', format: 'png', updatedAt: 2000 };
  const info2 = { ...info, updatedAt: 2000 };
  await post(space, '', `[PROFILE_AVATAR]${JSON.stringify(av)}\n---\n[PROFILE_INFO]${JSON.stringify(info2)}`);
  await sleep(400);
  prof = await rpc('get_user_profile', { user_id: PK });
  console.log('   profile (with avatar):', JSON.stringify(prof));
  check('avatar_content_id parsed from combined body', prof && prof.avatar_content_id === 'abc123deadbeef');
  check('name still parsed alongside avatar', prof && prof.display_name === 'Alice Wonderland');

  console.log('\nRESULT:', pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
