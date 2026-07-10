/**
 * Proves the SPAM-ATTESTATION report flow against a live node, matching exactly what
 * the clients now do:
 *   - PoW: find nonce so sha256(pow_message || nonce_LE) has >= 12 leading zero bits,
 *          pow_message = content_hash(32) || attester(32) || reason(1) || timestamp(8 LE)
 *   - signature over: "SPAM_ATTESTATION" || content_hash(32) || reason(1) || timestamp(8 LE)
 * Confirms submit_spam_attestation is accepted (no -32602 signature/PoW failure).
 *
 * Run: RPC_URL=.. RPC_COOKIE=.. AUTHOR_PUBKEY=.. node spam-report-test.mjs
 */
import { createHash, webcrypto } from 'node:crypto';

const RPC_URL = process.env.RPC_URL;
const RPC_COOKIE = process.env.RPC_COOKIE;
const AUTHOR_PUBKEY = process.env.AUTHOR_PUBKEY;
const AUTH = 'Basic ' + Buffer.from(`__cookie__:${RPC_COOKIE}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hexToBytes = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
const bytesToHex = (b) => Buffer.from(b).toString('hex');

let id = 0;
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const json = JSON.parse(await res.text());
  if (json.error) throw new Error(`${method}: [${json.error.code}] ${json.error.message}`);
  await sleep(300);
  return json.result;
}
const sign = async (msgBytes) =>
  (await rpc('sign_message', { message: bytesToHex(msgBytes) })).signature;

const leadingZeroBits = (h) => {
  let c = 0;
  for (const b of h) { if (b === 0) c += 8; else { c += Math.clz32(b) - 24; break; } }
  return c;
};

async function main() {
  const contentHashHex = createHash('sha256').update('some content to report').digest('hex');
  const contentHash = hexToBytes(contentHashHex);
  const attester = hexToBytes(AUTHOR_PUBKEY);
  const reasonByte = 1; // advertising
  const timestamp = Math.floor(Date.now() / 1000);

  // PoW: sha256(pow_message || nonce_LE) with >=12 leading zero bits
  const powMessage = new Uint8Array(32 + 32 + 1 + 8);
  powMessage.set(contentHash, 0);
  powMessage.set(attester, 32);
  powMessage[64] = reasonByte;
  new DataView(powMessage.buffer).setBigUint64(65, BigInt(timestamp), true);
  const powBuf = new Uint8Array(powMessage.length + 8);
  powBuf.set(powMessage, 0);
  const nonceView = new DataView(powBuf.buffer, powMessage.length, 8);
  let nonce = 0n, hash, attempts = 0;
  const t0 = Date.now();
  while (true) {
    nonceView.setBigUint64(0, nonce, true);
    hash = new Uint8Array(createHash('sha256').update(Buffer.from(powBuf)).digest());
    if (leadingZeroBits(hash) >= 12) break;
    nonce++; attempts++;
  }
  console.log(`mined nonce=${nonce} in ${attempts} attempts (${Date.now() - t0}ms), zeros=${leadingZeroBits(hash)}`);

  // signature over "SPAM_ATTESTATION" || content_hash || reason || timestamp(LE)
  const label = new TextEncoder().encode('SPAM_ATTESTATION');
  const signMsg = new Uint8Array(label.length + 32 + 1 + 8);
  signMsg.set(label, 0);
  signMsg.set(contentHash, label.length);
  signMsg[label.length + 32] = reasonByte;
  new DataView(signMsg.buffer).setBigUint64(label.length + 33, BigInt(timestamp), true);
  const signature = await sign(signMsg);

  const result = await rpc('submit_spam_attestation', {
    content_id: contentHashHex,
    attester_id: AUTHOR_PUBKEY,
    reason: 'advertising',
    pow_nonce: Number(nonce),
    pow_difficulty: 12,
    pow_nonce_space: '0000000000000000',
    pow_hash: bytesToHex(hash),
    signature,
    timestamp,
  });
  console.log('submit_spam_attestation result:', JSON.stringify(result));
  console.log('\nRESULT: PASS — spam report accepted (signature + PoW verified)');
}
void webcrypto;
main().catch((e) => { console.error('\nRESULT: FAIL —', e.message); process.exit(1); });
