/**
 * Browser-tier sponsorship claim, constructed exactly as
 * swimchain-react/src/lib/ensureSponsored.ts does — raw RPC to a node, no
 * node-held identity, no `sw` CLI. Used by
 * tools/defcon-gate/rehearse-regtest.sh (Task 9) to prove the DEF CON gate's
 * claim/approve signature flow end to end against the SAME node a real
 * browser client would call (VITE_RPC_ENDPOINT points straight at the gate
 * node — see defcon-client/.env.production) — no second peer node, and so no
 * offer-sync/gossip delay to wait out here (contrast the CLI/node-B path in
 * the rehearsal script's Step 5, which does need a retry loop for exactly
 * that reason).
 *
 * Ed25519 keypair: Node's built-in `crypto` module (Ed25519 support since
 * Node 12), not any WASM/browser stand-in — the same substitution Task 6's
 * report already used and verified byte-compatible ("using Node's native
 * Ed25519 ... as a byte-compatible stand-in for the browser's WASM
 * Keypair"). A raw 32-byte seed is turned into a Node KeyObject by
 * prepending the fixed RFC 8410 PKCS8 prefix for an unencrypted Ed25519
 * private key (`302e020100300506032b657004220420`) — this lets SEED_HEX
 * reproduce the exact same keypair across two separate invocations of this
 * script, which is what lets the rehearsal's Step 7 prove a bad-code claim
 * and its good-code re-claim are provably the SAME claimant identity. No
 * external dependency (no @noble/ed25519, no hash-wasm, no NODE_PATH) —
 * verified empirically before use: a keypair rebuilt from the same seed
 * twice produces an identical public key and a signature that verifies.
 *
 * Claim PoW is the small SHA-256 proof `claim_sponsorship_offer` itself
 * checks (leading zero BITS of sha256(nonceSpace(32 bytes) ||
 * nonce_LE(8-byte field, low 4 bytes only) — src/rpc/methods.rs:17741-17753),
 * NOT the Argon2id action PoW mint-space.mjs uses for posts/spaces. Ported
 * byte-for-byte from ensureSponsored.ts's `mineClaimPow`/
 * `buildClaimSigMessage`.
 *
 * Env:
 *   RPC_URL           (required) target node's RPC endpoint
 *   COOKIE_FILE       (required) that node's RPC auth cookie
 *   OFFER_ID          (required) hex offer id to claim
 *   APPLICATION_TEXT  (required) submitted as `application_text` — the code
 *                     word (or a deliberately wrong one, to exercise the
 *                     keeper's reject path)
 *   SEED_HEX          (optional, 32-byte hex) reuse an existing identity
 *                     instead of generating a fresh one. When omitted, a
 *                     fresh random seed is generated and printed on stdout
 *                     (CLAIMANT_SEED=) for the caller to capture and pass
 *                     back in on a later invocation.
 *
 * Output (stdout — the two lines the rehearsal script parses):
 *   CLAIMANT_PUBKEY=<64 lowercase hex chars>
 *   CLAIMANT_SEED=<64 lowercase hex chars>
 * All progress/diagnostic logging goes to stderr.
 *
 * Exit codes: 0 success (claim RPC accepted — this only means the claim was
 * SUBMITTED and pending, not that it was approved; approval is the keeper's
 * async job); 2 missing/invalid env; 1 any other failure (RPC error, offer
 * not found on this node).
 */
import { readFileSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, sign, randomBytes } from 'node:crypto';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is required`);
    process.exit(2);
  }
  return v;
}

const RPC_URL = required('RPC_URL');
const COOKIE_FILE = required('COOKIE_FILE');
const OFFER_ID = required('OFFER_ID').toLowerCase();
const APPLICATION_TEXT = required('APPLICATION_TEXT');
const SEED_HEX = (process.env.SEED_HEX || '').toLowerCase();

if (!/^[0-9a-f]{32}$/.test(OFFER_ID)) {
  console.error(`OFFER_ID must be 32 lowercase hex chars (16 bytes): got "${OFFER_ID}"`);
  process.exit(2);
}
if (SEED_HEX && !/^[0-9a-f]{64}$/.test(SEED_HEX)) {
  console.error(`SEED_HEX must be 64 lowercase hex chars (32 bytes): got "${SEED_HEX}"`);
  process.exit(2);
}

const log = (msg) => console.error(`[rehearse-claim ${new Date().toISOString()}] ${msg}`);

// ── RPC (cookie re-read every call — mirrors mint-space.mjs/defcon-gate.mjs) ──
let rpcId = 0;
async function rpc(method, params) {
  const cookie = readFileSync(COOKIE_FILE, 'utf-8').trim();
  const auth = 'Basic ' + Buffer.from(`__cookie__:${cookie}`).toString('base64');
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

// RFC 8410 fixed PKCS8 DER prefix for an unencrypted raw Ed25519 seed —
// verified empirically (see file header) to round-trip through Node's
// built-in crypto module and produce a deterministic, sign/verify-correct
// keypair from any 32-byte seed.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function keypairFromSeed(seedHex) {
  const seed = Buffer.from(seedHex, 'hex');
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
  const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const publicKeyHex = spki.subarray(spki.length - 32).toString('hex');
  return { privateKey, publicKeyHex };
}

/** Mine the small SHA-256 claim PoW: sha256(nonceSpace(32) || nonce as an
 *  8-byte little-endian field whose low 4 bytes hold the value) with >=
 *  minZeroBits leading zero BITS — byte-for-byte ensureSponsored.ts's
 *  mineClaimPow (there, a 40-byte Uint8Array is zero-initialized and only
 *  a setUint32 at offset 32 is written, leaving the top 4 bytes zero; the
 *  Buffer.alloc(40) + writeUInt32LE(nonce, 32) below produces the identical
 *  40 bytes for any nonce that fits in 32 bits, which every real mining run
 *  here does — difficulties are single-digit-to-low-double-digit bits). */
function mineClaimPow(minZeroBits) {
  const nonceSpace = randomBytes(32);
  let nonce = 0;
  for (;;) {
    const input = Buffer.alloc(40);
    nonceSpace.copy(input, 0);
    input.writeUInt32LE(nonce >>> 0, 32);
    const hash = createHash('sha256').update(input).digest();
    let zeroBits = 0;
    for (const byte of hash) {
      if (byte === 0) {
        zeroBits += 8;
        continue;
      }
      zeroBits += Math.clz32(byte) - 24;
      break;
    }
    if (zeroBits >= minZeroBits) return { nonce, nonceSpace, powHash: hash };
    nonce++;
    if (nonce > 10_000_000) throw new Error('claim PoW exhausted');
  }
}

/** Claim signature message: offer_id(16) || claimant(32) || timestamp(8 BE)
 *  || pow_hash(32) — claim_sponsorship_offer's own inline verification
 *  (src/rpc/methods.rs:17768-17773), matching ensureSponsored.ts's
 *  buildClaimSigMessage exactly. */
function buildClaimSigMessage(offerIdHex, claimantHex, timestamp, powHash) {
  const offerId = Buffer.from(offerIdHex, 'hex');
  const claimant = Buffer.from(claimantHex, 'hex');
  const b = Buffer.alloc(offerId.length + 32 + 8 + 32);
  let o = 0;
  offerId.copy(b, o);
  o += offerId.length;
  claimant.copy(b, o);
  o += 32;
  b.writeBigUInt64BE(BigInt(timestamp), o);
  o += 8;
  powHash.copy(b, o);
  return b;
}

async function main() {
  const seedHex = SEED_HEX || randomBytes(32).toString('hex');
  const { privateKey, publicKeyHex } = keypairFromSeed(seedHex);
  log(`claimant: ${publicKeyHex.slice(0, 16)}... (${SEED_HEX ? 'reused' : 'fresh'} identity)`);

  // Read the offer's own min_pow_difficulty the same way ensureSponsored.ts
  // does — via list_sponsorship_offers, not a value assumed out of band (a
  // real browser doesn't know it either until it lists offers).
  const listed = await rpc('list_sponsorship_offers', { limit: 100 });
  const offer = (listed?.offers ?? []).find((o) => String(o.offer_id).toLowerCase() === OFFER_ID);
  if (!offer) throw new Error(`offer ${OFFER_ID} not found in list_sponsorship_offers on this node`);
  const minDifficulty = Math.max(offer.requirements?.min_pow_difficulty ?? 0, 1);
  log(`offer found: min_pow_difficulty=${minDifficulty} space_scope=${offer.space_scope ?? 'null (global)'}`);

  log('mining claim PoW...');
  const { nonce, nonceSpace, powHash } = mineClaimPow(minDifficulty);
  const timestamp = Math.floor(Date.now() / 1000);
  const sigMsg = buildClaimSigMessage(OFFER_ID, publicKeyHex, timestamp, powHash);
  const signature = sign(null, sigMsg, privateKey);

  await rpc('claim_sponsorship_offer', {
    offer_id: OFFER_ID,
    claimant_pubkey: publicKeyHex,
    application_text: APPLICATION_TEXT,
    pow_nonce: nonce,
    pow_difficulty: minDifficulty,
    pow_nonce_space: nonceSpace.toString('hex'),
    pow_hash: powHash.toString('hex'),
    signature: signature.toString('hex'),
    timestamp,
  });
  log('claim submitted successfully (pending sponsor decision)');

  // The two lines the rehearsal script parses. Everything else logs to
  // stderr so these are the only bytes on stdout.
  console.log(`CLAIMANT_PUBKEY=${publicKeyHex}`);
  console.log(`CLAIMANT_SEED=${seedHex}`);
}

main().catch((e) => {
  console.error(`[rehearse-claim] FAILED: ${e?.stack || e?.message || e}`);
  process.exit(1);
});
