/**
 * provision-meme-bot.mjs — one-time: mint a bespoke identity for the meme bot and
 * have the LOCAL node's identity (the operator) sponsor it on mainnet, then set a
 * clear profile ("Meme Bot"). Prints the seed to save for the bot (SIGN_SEED_HEX).
 *
 * Env: RPC_URL (default http://127.0.0.1:9736), RPC_COOKIE_FILE (default Roaming cookie),
 *      SEED_HEX (optional: reuse an existing 64-hex seed instead of generating),
 *      DISPLAY_NAME (default "Meme Bot"), BIO (default set below).
 */
import { createHash, randomBytes, createPrivateKey, createPublicKey, sign as edSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Node-native ed25519 from a raw 32-byte seed (wrap in the fixed PKCS8 prefix).
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const keyFromSeed = (seed) => createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, Buffer.from(seed)]), format: 'der', type: 'pkcs8' });
function pubFromSeed(seed) {
  const spki = createPublicKey(keyFromSeed(seed)).export({ format: 'der', type: 'spki' });
  return Buffer.from(spki.subarray(spki.length - 32)); // last 32 bytes = raw pubkey
}
const signWithSeed = (seed, msg) => edSign(null, Buffer.from(msg), keyFromSeed(seed));

const RPC = process.env.RPC_URL || 'http://127.0.0.1:9736';
const COOKIE_FILE = process.env.RPC_COOKIE_FILE || join(homedir(), 'AppData', 'Roaming', 'swimchain', '.cookie');
const COOKIE = (process.env.RPC_COOKIE || readFileSync(COOKIE_FILE, 'utf8')).trim();
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${COOKIE}`).toString('base64');
const DISPLAY_NAME = process.env.DISPLAY_NAME || 'Meme Bot';
const BIO = process.env.BIO || '🤖 Automated meme feed — pulls fresh memes from Reddit. Not a person.';

const sha256 = (b) => createHash('sha256').update(b).digest();
let rpcId = 0;
async function rpc(method, params) {
  const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params: params ?? {} }) });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message || JSON.stringify(j.error)}`);
  return j.result;
}
async function main() {
  // 1. Bot identity
  const seed = process.env.SEED_HEX ? Buffer.from(process.env.SEED_HEX, 'hex') : randomBytes(32);
  if (seed.length !== 32) throw new Error('SEED_HEX must be 64 hex chars');
  const botPub = pubFromSeed(seed).toString('hex');
  const botSign = (bytes) => signWithSeed(seed, bytes).toString('hex');

  // 2. Sponsor = the local node's identity (operator)
  const me = await rpc('get_identity_info', {});
  const sponsorPub = me.public_key.toLowerCase();
  console.log(`sponsor (operator) = ${sponsorPub.slice(0, 12)}… ${me.address}`);
  console.log(`new bot identity   = ${botPub}`);

  // 3. Already sponsored?
  const status = await rpc('get_sponsorship_status', { identity: botPub }).catch(() => null);
  if (status?.sponsored) { console.log('bot already sponsored — skipping register'); }
  else {
    // Identity PoW: sha256(nonce_space(32) || nonce_le(8)) needs >= 1 leading zero byte.
    const nonceSpace = randomBytes(32);
    let nonce = 0n, powWork = 0;
    for (;;) {
      const inp = Buffer.concat([nonceSpace, Buffer.alloc(8)]);
      inp.writeBigUInt64LE(nonce, 32);
      const h = sha256(inp);
      let z = 0; for (const b of h) { if (b === 0) z++; else break; }
      if (z >= 1) { powWork = z; break; }
      nonce++;
    }
    // Operator signs the sponsor preimage: sponsee(32) || timestamp_BE(8)
    const timestamp = Math.floor(Date.now() / 1000);
    const preimage = Buffer.alloc(40);
    Buffer.from(botPub, 'hex').copy(preimage, 0);
    preimage.writeBigUInt64BE(BigInt(timestamp), 32);
    const sponsorSig = (await rpc('sign_message', { message: preimage.toString('hex') })).signature;

    const reg = await rpc('register_sponsored_identity', {
      new_identity_pubkey: botPub,
      sponsor_pubkey: sponsorPub,
      sponsor_signature: sponsorSig,
      timestamp,
      probationary: false,
      pow_nonce: Number(nonce),
      pow_work: powWork,
      pow_nonce_space: nonceSpace.toString('hex'),
    });
    console.log('registered sponsored identity:', JSON.stringify(reg));
  }

  // 4. Set a clear profile so it's obviously a bot. Profile = a post to the bot's
  //    own profile space carrying a [PROFILE_INFO] segment, signed by the bot.
  const info = { displayName: DISPLAY_NAME, bio: BIO, website: 'https://swimchain.io', updatedAt: Date.now() };
  const body = `[PROFILE_INFO]${JSON.stringify(info)}`;
  const title = '';
  const postContent = `${title}\n\n${body}`;
  const contentHash = sha256(Buffer.from(postContent, 'utf-8'));
  // Profile space id (derived exactly like the clients): hex of
  // [SpaceClass.Profile=0x02] ‖ sha256("profile:v1:"+pubkey)[..15]. 16 bytes.
  const profSpaceBytes = Buffer.alloc(16);
  profSpaceBytes[0] = 0x02;
  sha256(Buffer.from(`profile:v1:${botPub.toLowerCase()}`, 'utf-8')).copy(profSpaceBytes, 1, 0, 15);
  const profileSpace = profSpaceBytes.toString('hex');
  {
    // PoW for the profile post (Post diff 10 mainnet), argon2id — reuse meme-bot layout inline.
    const { argon2id } = await import('hash-wasm');
    const leadingZeros = (h) => { let z = 0; for (const b of h) { if (b === 0) z += 8; else { z += Math.clz32(b) - 24; break; } } return z; };
    const difficulty = 10, ts = Math.floor(Date.now() / 1000), ns = randomBytes(8);
    const input = Buffer.alloc(90);
    input[0] = 0x02; Buffer.from(contentHash).copy(input, 1); Buffer.from(botPub, 'hex').copy(input, 33);
    input.writeBigUInt64BE(BigInt(ts), 65); input[73] = difficulty; ns.copy(input, 74);
    let n = 0n, pow;
    for (;;) { input.writeBigUInt64BE(n, 82); const hash = await argon2id({ password: new Uint8Array(input), salt: new Uint8Array(ns), parallelism: 2, memorySize: 8192, iterations: 1, hashLength: 32, outputType: 'binary' }); if (leadingZeros(hash) >= difficulty) { pow = { pow_nonce: Number(n), pow_difficulty: difficulty, pow_nonce_space: ns.toString('hex'), pow_hash: Buffer.from(hash).toString('hex'), timestamp: ts }; break; } n++; }
    const sigPre = Buffer.alloc(41); Buffer.from(contentHash).copy(sigPre, 0); sigPre.writeBigUInt64LE(BigInt(pow.timestamp), 32); sigPre[40] = 0;
    const signature = botSign(sigPre);
    try {
      const r = await rpc('submit_post', { space_id: profileSpace, title, body, author_id: botPub, ...pow, signature });
      console.log(`profile set: "${DISPLAY_NAME}" -> ${r?.content_id?.slice(0, 24)}`);
    } catch (e) {
      console.log(`profile post failed (non-fatal, sponsorship still done): ${e.message}`);
    }
  }

  console.log('\n=== SAVE THIS (bot signing seed — secret) ===');
  console.log(`SEED_HEX=${Buffer.from(seed).toString('hex')}`);
  console.log(`AUTHOR_PUBKEY=${botPub}`);
}
main().catch((e) => { console.error('provision failed:', e.message); process.exit(1); });
