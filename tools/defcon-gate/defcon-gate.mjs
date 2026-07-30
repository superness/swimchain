/**
 * DEF CON 34 gate keeper daemon.
 *
 * A single always-on identity that runs the code-word gate for onboarding at
 * DEF CON 34: it keeps two standing sponsorship offers alive (a GLOBAL tier
 * and a tier scoped to the DEF CON space) and, for every pending claim on
 * either, approves it iff the claimant's application text matches GATE_CODE
 * — otherwise it rejects. Caps (total + hourly) bound the blast radius of a
 * leaked code; END_AT is a hard stop after which the keeper signs nothing at
 * all (not even a reject) and cancels every offer it holds exactly once.
 *
 * Decision logic (gateDecision/offerPlan/codeMatches/hourlyCount) is pure and
 * lives in ./gate-logic.mjs — this file is the impure shell: RPC calls,
 * signing, state persistence, and the poll loop. Modeled directly on
 * tools/swim-bot/game-offer-keeper.mjs (cookie re-read, sign_message RPC,
 * never-exit-on-transient-error loop).
 *
 * Env:
 *   RPC_URL             (required) node JSON-RPC endpoint, e.g. http://127.0.0.1:9736
 *   COOKIE_FILE         (required) path to the node's RPC auth cookie; re-read
 *                       every call so a node restart that rotates it self-heals
 *   GATE_CODE           (required) the code-word claimants must submit as
 *                       application_text to be approved
 *   END_AT              (required, ISO8601) hard stop; after this the keeper
 *                       approves/rejects nothing and cancels its offers once
 *   DEFCON_SPACE_HEX    (required) the DEF CON space id, hex (16 bytes / 32
 *                       hex chars) — the scoped tier's space_scope
 *   TOTAL_CAP           default 500  — lifetime approval cap across both tiers
 *   HOURLY_CAP          default 60   — trailing-1h approval cap across both tiers
 *   OFFER_SLOTS         default 10   — slots per minted offer (max allowed for
 *                       a non-game-sponsor identity; see src/rpc/methods.rs)
 *   OFFER_EXPIRES_DAYS  default 1    — lifetime of a freshly minted offer
 *   MIN_POW             default 8    — min_pow_difficulty required of claimants
 *   POLL_MS             default 5000 — delay between ticks
 *   STATE_FILE          default ./defcon-gate-state.json
 *   ONCE                run a single tick and exit (manual checks)
 *   DRY_RUN             decide + log only; never sign, mint, approve, reject,
 *                       cancel, or write state
 *   PAUSED              skip the tick body entirely (still polls, still alive)
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { codeMatches, gateDecision, offerPlan, hourlyCount } from './gate-logic.mjs';

// ── env config ───────────────────────────────────────────────────────────
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
const GATE_CODE = required('GATE_CODE');
const END_AT = required('END_AT');
const DEFCON_SPACE_HEX = required('DEFCON_SPACE_HEX').toLowerCase();
const TOTAL_CAP = Number(process.env.TOTAL_CAP ?? 500);
const HOURLY_CAP = Number(process.env.HOURLY_CAP ?? 60);
const OFFER_SLOTS = Number(process.env.OFFER_SLOTS ?? 10);
const OFFER_EXPIRES_DAYS = Number(process.env.OFFER_EXPIRES_DAYS ?? 1);
const MIN_POW = Number(process.env.MIN_POW ?? 8);
const POLL_MS = Number(process.env.POLL_MS ?? 5000);
const STATE_FILE = process.env.STATE_FILE || './defcon-gate-state.json';

const END_AT_MS = Date.parse(END_AT);
if (Number.isNaN(END_AT_MS)) {
  console.error(`END_AT is not a valid ISO8601 timestamp: ${END_AT}`);
  process.exit(2);
}
if (!/^[0-9a-f]{32}$/.test(DEFCON_SPACE_HEX)) {
  console.error(`DEFCON_SPACE_HEX must be 32 lowercase hex chars (16 bytes): got "${DEFCON_SPACE_HEX}"`);
  process.exit(2);
}

const log = (msg) => console.log(`[defcon-gate ${new Date().toISOString()}] ${msg}`);

// ── RPC ──────────────────────────────────────────────────────────────────
async function rpc(method, params) {
  // Re-read the cookie every call: the node rotates it on restart, and a
  // keeper holding a stale one fails silently until someone notices.
  const cookie = readFileSync(COOKIE_FILE, 'utf-8').trim();
  const auth = 'Basic ' + Buffer.from(`__cookie__:${cookie}`).toString('base64');
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

// ── space-scope normalization ────────────────────────────────────────────
// list_sponsorship_offers/get_sponsorship_offer encode a non-null space_scope
// as bech32m "sp1..." (src/rpc/methods.rs: encode_space_id, ~17031-17035 and
// ~17139-17143), never as raw hex. DEFCON_SPACE_HEX is hex. To compare them
// (and to build the 32-byte scope the approval signature covers) we need to
// decode the node's own bech32m space-id encoding. This is a decoder only —
// the node never expects bech32 back from us for space_scope on create
// (decode_space_id there accepts raw hex directly, see createOffer below).
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk >>> 0;
}

function bech32HrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) ret.push((acc << (toBits - bits)) & maxv);
  return ret;
}

/** Decode a "sp1..." bech32m space id (SPACE_HRP="sp", version byte 0 + 16
 * id bytes — src/rpc/methods.rs:186-194) to 16-byte lowercase hex. */
function decodeSpaceIdBech32ToHex(spaceId) {
  const lower = spaceId.toLowerCase();
  const pos = lower.lastIndexOf('1');
  if (pos < 1 || pos + 7 > lower.length) {
    throw new Error(`malformed bech32 space id: ${spaceId}`);
  }
  const hrp = lower.slice(0, pos);
  if (hrp !== 'sp') throw new Error(`unexpected space-id HRP "${hrp}" in ${spaceId}`);
  const dataPart = lower.slice(pos + 1);
  const data = [];
  for (const c of dataPart) {
    const v = BECH32_CHARSET.indexOf(c);
    if (v === -1) throw new Error(`invalid bech32 character in space id: ${spaceId}`);
    data.push(v);
  }
  const values = bech32HrpExpand(hrp).concat(data);
  if (bech32Polymod(values) !== BECH32M_CONST) {
    throw new Error(`bad bech32m checksum on space id: ${spaceId}`);
  }
  const payload = data.slice(0, -6); // strip 6-char checksum
  const bytes = convertBits(payload, 5, 8, false); // version(1) + space id(16) = 17 bytes
  return Buffer.from(bytes.slice(1, 17)).toString('hex');
}

/** Normalize an offer's space_scope (bech32 "sp1...", raw hex, or null/undefined)
 * to lowercase 16-byte hex or null, so it compares equal to DEFCON_SPACE_HEX. */
function normScope(spaceScope) {
  if (!spaceScope) return null;
  if (spaceScope.toLowerCase().startsWith('sp1')) return decodeSpaceIdBech32ToHex(spaceScope);
  return spaceScope.toLowerCase();
}

/**
 * The 32-byte scope Action::sponsor_sig_message signs (src/blocks/action.rs
 * :648-660: `scope: Option<&[u8;32]>`, appended raw when Some). What's stored
 * on the offer (and what that 32 bytes actually IS) is id16 ++ 16 zero bytes
 * — see create_sponsorship_offer's space_scope parsing at
 * src/rpc/methods.rs:17404-17421 ("stored as the 32-byte form (id16 ++
 * zeros)"). Returns null for an unscoped offer (no scope bytes appended).
 */
function offerScopeBytes(offerSpaceScope) {
  if (!offerSpaceScope) return null;
  const hex16 = normScope(offerSpaceScope);
  const scope = Buffer.alloc(32);
  Buffer.from(hex16, 'hex').copy(scope, 0);
  return scope;
}

// ── state (atomic) ───────────────────────────────────────────────────────
function loadState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return {
      totalApproved: Number(s.totalApproved) || 0,
      approvedAtMs: Array.isArray(s.approvedAtMs) ? s.approvedAtMs : [],
      canceledAtEnd: Boolean(s.canceledAtEnd),
    };
  } catch {
    return { totalApproved: 0, approvedAtMs: [], canceledAtEnd: false };
  }
}

function saveState(state) {
  // hourlyCount only ever looks back 1h; trim to 2h so the file doesn't grow
  // for the whole multi-day event.
  const twoHoursAgo = Date.now() - 2 * 3_600_000;
  state.approvedAtMs = state.approvedAtMs.filter((ms) => ms > twoHoursAgo);
  const tmp = `${STATE_FILE}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, STATE_FILE); // atomic on the same filesystem
  } catch (e) {
    log(`state write failed: ${e.message}`);
  }
}

// ── signing helpers ──────────────────────────────────────────────────────

/**
 * Offer-creation signature preimage — byte-for-byte
 * PublicSponsorshipOffer::signature_message_for_creation
 * (src/sponsorship/types.rs:1490-1510):
 *   "swimchain-sponsor-offer:" || sponsor(32) || slots(1) || offer_type(1) ||
 *   expires_days(4 BE) || min_pow(1) || app_required(1) || timestamp(8 BE)
 * offer_type=1 is Probationary (src/sponsorship/types.rs:1361-1369, Open=0/
 * Probationary=1/Conditional=2); app_required is hardcoded true — this gate
 * always requires the code as the claim's application text. space_scope is
 * NOT part of this preimage (methods.rs parses it separately, after
 * signature verification), which is why one signature covers both tiers.
 */
function offerCreationSigMessage(sponsorHex, timestamp) {
  const prefix = Buffer.from('swimchain-sponsor-offer:', 'utf-8');
  const b = Buffer.alloc(prefix.length + 32 + 1 + 1 + 4 + 1 + 1 + 8);
  let o = 0;
  prefix.copy(b, o);
  o += prefix.length;
  Buffer.from(sponsorHex, 'hex').copy(b, o);
  o += 32;
  b[o++] = OFFER_SLOTS;
  b[o++] = 1; // Probationary
  b.writeUInt32BE(OFFER_EXPIRES_DAYS, o);
  o += 4;
  b[o++] = MIN_POW;
  b[o++] = 1; // application_required = true
  b.writeBigUInt64BE(BigInt(timestamp), o);
  o += 8;
  return b;
}

async function createOffer(sponsorHex, scopeHexOrNull) {
  const ts = Math.floor(Date.now() / 1000);
  const msg = offerCreationSigMessage(sponsorHex, ts);
  const { signature } = await rpc('sign_message', { message: msg.toString('hex') });
  const r = await rpc('create_sponsorship_offer', {
    sponsor_pubkey: sponsorHex,
    slots: OFFER_SLOTS,
    offer_type: 'probationary',
    expires_days: OFFER_EXPIRES_DAYS,
    min_pow_difficulty: MIN_POW,
    application_required: true,
    auto_approve: false,
    space_scope: scopeHexOrNull, // decode_space_id accepts raw hex directly (src/rpc/methods.rs:161-177)
    signature,
    timestamp: ts,
  });
  log(`created ${scopeHexOrNull ? `scoped(${scopeHexOrNull.slice(0, 10)})` : 'global'} offer ${r.offer_id}`);
  return r.offer_id;
}

/**
 * Approval signature preimage — Action::sponsor_sig_message
 * (src/blocks/action.rs:648-660): claimant(32) || timestamp(8 BE), with the
 * offer's 32-byte scope appended iff the offer is scoped (see
 * offerScopeBytes above). Verified against exactly this at
 * src/rpc/methods.rs:18139-18166 using offer.space_scope.as_ref(), so it is
 * the OFFER's own scope that must be used here, not the tier's raw hex.
 */
async function approveClaim(offer, claim, sponsorHex) {
  const ts = Math.floor(Date.now() / 1000);
  const claimant = Buffer.from(claim.claimant_pubkey, 'hex');
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64BE(BigInt(ts));
  const scope = offerScopeBytes(offer.space_scope);
  const msg = scope ? Buffer.concat([claimant, tsBuf, scope]) : Buffer.concat([claimant, tsBuf]);
  const { signature } = await rpc('sign_message', { message: msg.toString('hex') });
  await rpc('approve_sponsorship_claim', {
    offer_id: offer.offer_id,
    claimant_pubkey: claim.claimant_pubkey,
    sponsor_pubkey: sponsorHex,
    signature,
    timestamp: ts,
  });
  log(`approved ${claim.claimant_pubkey.slice(0, 8)} on ${offer.offer_id.slice(0, 8)}`);
}

/**
 * Replay note (verified during implementation, not assumed): the
 * reject_sponsorship_claim signature check (src/rpc/methods.rs:18308-18332)
 * builds its preimage as ALWAYS claimant(32) || timestamp(8 BE) — unlike
 * approve, it never appends scope bytes even when the offer is scoped. So on
 * an UNSCOPED offer, a reject signature is byte-identical to what a global
 * approve would sign for the same (claimant, timestamp) pair: a leaked
 * reject signature would double as an approve.
 *
 * That only matters if the signature ever leaves this node. It doesn't:
 * reject_sponsorship_claim's only side effect is
 * offer_store.remove_claim (src/sponsorship/offer_store.rs:371-379) — a
 * local sled delete with no broadcast/gossip call. Contrast approve, which
 * runs execute_claim_approval → mines an on-chain Sponsor action via the
 * block builder + connection pool (src/rpc/methods.rs:17971-18010) and IS
 * gossiped to peers. The reject signature is verified locally by this node's
 * own RPC handler and then discarded — it never reaches the network.
 *
 * Conclusion: the brief's fallback (drop rejects on the global/unscoped tier,
 * leave mismatches pending instead) is NOT needed today, so it is not wired
 * in. If reject_sponsorship_claim is ever changed to gossip anything, that
 * conclusion no longer holds and this function must stop signing rejects on
 * the unscoped tier.
 */
async function rejectClaim(offer, claim, sponsorHex) {
  const ts = Math.floor(Date.now() / 1000);
  const claimant = Buffer.from(claim.claimant_pubkey, 'hex');
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64BE(BigInt(ts));
  const msg = Buffer.concat([claimant, tsBuf]);
  const { signature } = await rpc('sign_message', { message: msg.toString('hex') });
  await rpc('reject_sponsorship_claim', {
    offer_id: offer.offer_id,
    claimant_pubkey: claim.claimant_pubkey,
    sponsor_pubkey: sponsorHex,
    signature,
    timestamp: ts,
  });
  log(`rejected ${claim.claimant_pubkey.slice(0, 8)} on ${offer.offer_id.slice(0, 8)}`);
}

/** Cancel-offer signature preimage: offer_id(16) || timestamp(8 BE)
 * (src/rpc/methods.rs:18452-18455). */
async function cancelOffer(offer) {
  const ts = Math.floor(Date.now() / 1000);
  const tsBuf = Buffer.alloc(8);
  tsBuf.writeBigUInt64BE(BigInt(ts));
  const msg = Buffer.concat([Buffer.from(offer.offer_id, 'hex'), tsBuf]);
  const { signature } = await rpc('sign_message', { message: msg.toString('hex') });
  await rpc('cancel_sponsorship_offer', {
    offer_id: offer.offer_id,
    sponsor_pubkey: offer.sponsor_pubkey,
    signature,
    timestamp: ts,
  });
  log(`canceled offer ${offer.offer_id.slice(0, 10)}`);
}

async function cancelAll(offers) {
  for (const offer of offers) {
    try {
      await cancelOffer(offer);
    } catch (e) {
      // Best-effort: one already-gone/expired offer failing to cancel should
      // not stop the rest from being cancelled.
      log(`cancel ${offer.offer_id.slice(0, 10)} failed: ${e.message}`);
    }
  }
}

async function myOffers(myPubkeyHex) {
  // list_sponsorship_offers has no sponsor filter and clamps limit to 100
  // server-side (src/rpc/methods.rs:16967); has_more would mean this
  // undercounts our own offers, which is worth a loud warning.
  const listed = await rpc('list_sponsorship_offers', { limit: 100 });
  if (listed?.has_more) {
    log('WARNING: list_sponsorship_offers reported has_more — raise pagination, offer health may be undercounted');
  }
  const offers = listed?.offers ?? [];
  return offers.filter((o) => String(o.sponsor_pubkey || '').toLowerCase() === myPubkeyHex.toLowerCase());
}

// ── tick ─────────────────────────────────────────────────────────────────
async function tick(state) {
  if (process.env.PAUSED) {
    log('paused');
    return;
  }
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const me = await rpc('get_identity_info', {});
  const mine = await myOffers(me.public_key);
  const ended = nowMs >= END_AT_MS;

  if (ended && !state.canceledAtEnd) {
    // DRY_RUN must never sign/write, so the one-shot cancel-everything step
    // is gated the same as every other effectful branch below; only the
    // decision to do it is unconditional. state.canceledAtEnd stays false
    // under DRY_RUN so a real (non-dry) run still performs it later.
    if (process.env.DRY_RUN) {
      log(`ended — WOULD cancel ${mine.length} offer(s) (dry run)`);
    } else {
      await cancelAll(mine);
      state.canceledAtEnd = true;
      saveState(state);
    }
  }

  for (const tier of [{ scope: null }, { scope: DEFCON_SPACE_HEX }]) {
    const tierOffers = mine.filter((o) => normScope(o.space_scope) === tier.scope);
    const plan = offerPlan({
      myOffers: tierOffers,
      tierScopeHex: tier.scope,
      nowSec,
      endAtSec: END_AT_MS / 1000,
      totalApproved: state.totalApproved,
      totalCap: TOTAL_CAP,
    });
    log(`tier ${tier.scope ?? 'global'}: ${tierOffers.length} offer(s); ${plan.needNew ? 'needNew' : 'ok'} (${plan.reason})`);
    if (plan.needNew && !process.env.DRY_RUN) await createOffer(me.public_key, tier.scope);

    for (const offer of tierOffers.filter((o) => o.expires_at > nowSec)) {
      const detail = await rpc('get_sponsorship_offer', { offer_id: offer.offer_id, caller_pubkey: me.public_key });
      for (const claim of detail.pending_claims ?? []) {
        const d = gateDecision({
          applicationText: claim.application_text,
          gateCode: GATE_CODE,
          nowMs,
          endAtMs: END_AT_MS,
          totalApproved: state.totalApproved,
          approvedAtMs: state.approvedAtMs,
          totalCap: TOTAL_CAP,
          hourlyCap: HOURLY_CAP,
        });
        log(`claim ${claim.claimant_pubkey.slice(0, 8)} on ${offer.offer_id.slice(0, 8)} -> ${d.action} (${d.reason})`);
        if (process.env.DRY_RUN) continue;
        if (d.action === 'approve') {
          await approveClaim(offer, claim, me.public_key);
          state.totalApproved++;
          state.approvedAtMs.push(nowMs);
          saveState(state);
        } else if (d.action === 'reject') {
          await rejectClaim(offer, claim, me.public_key);
        }
      }
    }
  }
}

// ── main loop ────────────────────────────────────────────────────────────
async function main() {
  log(
    `starting; space=${DEFCON_SPACE_HEX} end=${END_AT} totalCap=${TOTAL_CAP} hourlyCap=${HOURLY_CAP} ` +
      `offerSlots=${OFFER_SLOTS}/${OFFER_EXPIRES_DAYS}d minPow=${MIN_POW} poll=${POLL_MS}ms` +
      `${process.env.ONCE ? ' [ONCE]' : ''}${process.env.DRY_RUN ? ' [DRY RUN]' : ''}${process.env.PAUSED ? ' [PAUSED]' : ''}`
  );
  const state = loadState();
  for (;;) {
    try {
      await tick(state);
    } catch (e) {
      // Never exit on a transient RPC failure — a keeper that dies on one
      // bad pass is a keeper nobody notices is gone.
      log(`tick failed: ${e.message}`);
    }
    if (process.env.ONCE) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
