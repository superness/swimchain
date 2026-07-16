/**
 * set-profile.mjs — set THIS node identity's profile (name + bio + optional
 * avatar), then read it back locally AND from a peer node to expose the
 * "profiles don't propagate" bug. Reuses the wiki-import PoW/sign path.
 *
 * Env: RPC_URL RPC_COOKIE AUTHOR_PUBKEY NETWORK
 *      NAME BIO [AVATAR_PNG] [PEER_RPC PEER_COOKIE]
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ActionType, mineActionPow, hexToBytes } from './lib/pow.js';

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:19746';
const COOKIE = process.env.RPC_COOKIE || '';
const PK = (process.env.AUTHOR_PUBKEY || '').toLowerCase();
const NETWORK = process.env.NETWORK || 'testnet';
const NAME = process.env.NAME || 'QA Tester';
const BIO = process.env.BIO || 'Reproducing the profile propagation bug.';
const AVATAR_PNG = process.env.AVATAR_PNG || '';
const PEER_RPC = process.env.PEER_RPC || '';
const PEER_COOKIE = process.env.PEER_COOKIE || '';

const sha256 = (b) => createHash('sha256').update(b).digest();
const auth = (c) => 'Basic ' + Buffer.from(`__cookie__:${c}`).toString('base64');
let id = 0;
async function rpc(url, cookie, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth(cookie) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const j = JSON.parse(await res.text());
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const sign = async (bytes) =>
  (await rpc(RPC_URL, COOKIE, 'sign_message', { message: Buffer.from(bytes).toString('hex') })).signature;
function sigPreimage(ch, ts) {
  const b = Buffer.alloc(41);
  Buffer.from(ch).copy(b, 0);
  b.writeBigUInt64LE(BigInt(ts), 32);
  b[40] = 0;
  return b;
}

// Profile space id = 0x02 ‖ sha256("profile:v1:<pk>")[..15]
function profileSpaceId(pk) {
  const h = sha256(Buffer.from(`profile:v1:${pk}`, 'utf-8'));
  const out = Buffer.alloc(16);
  out[0] = 0x02;
  h.copy(out, 1, 0, 15);
  return out.toString('hex');
}

async function main() {
  const space = profileSpaceId(PK);
  console.log('profile space:', space);

  let body = `[PROFILE_INFO]${JSON.stringify({ displayName: NAME, bio: BIO, updatedAt: Date.now() })}`;
  if (AVATAR_PNG) {
    const data = readFileSync(AVATAR_PNG).toString('base64');
    const up = await rpc(RPC_URL, COOKIE, 'upload_media', { media_type: 'image/png', data });
    const cid = up?.media_hash || up?.hash;
    const avatar = `[PROFILE_AVATAR]${JSON.stringify({ contentId: `swim:${cid}`, format: 'image/png', updatedAt: Date.now() })}`;
    body = `${avatar}\n---\n${body}`;
    console.log('avatar uploaded:', cid.slice(0, 20), '…');
  }

  const content = `\n\n${body}`; // empty title
  const pow = await mineActionPow(ActionType.Post, content, hexToBytes(PK), NETWORK);
  const ch = sha256(Buffer.from(content, 'utf-8'));
  const sig = await sign(sigPreimage(ch, pow.timestamp));
  await rpc(RPC_URL, COOKIE, 'submit_post', {
    space_id: space,
    title: '',
    body,
    author_id: PK,
    ...pow,
    signature: sig,
  });
  console.log('profile submitted. waiting for block…');
  await new Promise((r) => setTimeout(r, 8000));

  const local = await rpc(RPC_URL, COOKIE, 'get_user_profile', { user_id: PK });
  console.log('LOCAL get_user_profile:', JSON.stringify(local));

  if (PEER_RPC) {
    for (let i = 0; i < 12; i++) {
      const peer = await rpc(PEER_RPC, PEER_COOKIE, 'get_user_profile', { user_id: PK }).catch((e) => ({ err: e.message }));
      console.log(`PEER get_user_profile [t+${i * 10}s]:`, JSON.stringify(peer));
      if (peer && peer.display_name) break;
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
