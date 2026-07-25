/**
 * Game-offer keeper (mainnet).
 *
 * Every hosted game onboards first-time players through ONE auto-approve,
 * space-scoped sponsorship offer signed by the always-on game-sponsor node.
 * Those offers were minted by hand, one per game, and nothing renewed them.
 *
 * That is a silent fuse. When a game's offer lapses — or simply runs out of
 * slots — first-run onboarding stops with no error anywhere: the client asks
 * for an offer, finds none it can claim, and hangs. That is the shape of the
 * 2026-07-18 "reef spun forever" incident, and on 2026-07-25 an audit found
 * trench and chips both sitting 28-30 days from the same failure while reef
 * and chess had ~362 days, purely because whoever minted each one picked a
 * different expiry.
 *
 * This keeper removes the hand-mint step. For each configured game space it
 * ensures there is always a healthy offer on BOTH axes:
 *
 *   - time    — at least MIN_DAYS of runway remaining
 *   - supply  — at least MIN_FREE_SLOTS unclaimed slots
 *
 * Slot exhaustion is the axis nobody has hit yet and the one that arrives
 * without warning: an offer is fine at 99/100 and dead at 100/100, and the
 * only symptom is that new players stop being able to start.
 *
 * Minting a fresh offer does NOT invalidate the old one. Offers accumulate
 * harmlessly and lapsed ones are ignored, so this is safe to run often and
 * safe to run twice.
 *
 * NOTE ON HOSTS: the existing swim-faucet/swim-bot units on the sponsor
 * droplet point at /var/lib/swimchain-testnet — they are TESTNET tooling and
 * have never touched a mainnet game offer. This is the mainnet counterpart and
 * is deliberately a separate unit.
 *
 * Env:
 *   RPC_URL           default http://127.0.0.1:9736
 *   RPC_COOKIE_FILE   default /var/lib/swimchain-mainnet/.cookie  (re-read every pass,
 *                     so a node restart that rotates the cookie self-heals)
 *   GAME_SPACES       comma-separated sp1... space ids (required)
 *   MIN_DAYS          default 60
 *   MIN_FREE_SLOTS    default 25
 *   NEW_OFFER_DAYS    default 365
 *   NEW_OFFER_SLOTS   default 100
 *   MIN_POW           default 8
 *   INTERVAL_MS       default 3600000 (hourly)
 *   ONCE=1            run a single pass and exit (for manual checks)
 *   DRY_RUN=1         report what WOULD be minted, mint nothing. Lets the
 *                     decision path be exercised (e.g. ONCE=1 DRY_RUN=1
 *                     MIN_DAYS=400) without putting test offers on mainnet.
 */
import { readFileSync } from 'node:fs';

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:9736';
const COOKIE_FILE = process.env.RPC_COOKIE_FILE || '/var/lib/swimchain-mainnet/.cookie';
const SPACES = (process.env.GAME_SPACES || '').split(',').map((s) => s.trim()).filter(Boolean);
const MIN_DAYS = Number(process.env.MIN_DAYS ?? 60);
const MIN_FREE_SLOTS = Number(process.env.MIN_FREE_SLOTS ?? 25);
const NEW_OFFER_DAYS = Number(process.env.NEW_OFFER_DAYS ?? 365);
const NEW_OFFER_SLOTS = Number(process.env.NEW_OFFER_SLOTS ?? 100);
const MIN_POW = Number(process.env.MIN_POW ?? 8);
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 3_600_000);
const ONCE = process.env.ONCE === '1';
const DRY_RUN = process.env.DRY_RUN === '1';

if (SPACES.length === 0) {
  console.error('GAME_SPACES is empty — nothing to keep. Set it to a comma-separated list of sp1... ids.');
  process.exit(2);
}

const log = (msg) => console.log(`[game-offer-keeper ${new Date().toISOString()}] ${msg}`);

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

/**
 * The offer-creation signature preimage. Byte-for-byte the scheme in
 * activity-bot.mjs's doFaucet(); `space_scope` is deliberately NOT covered by
 * the signature, which is why a scoped offer signs identically to a global one.
 */
function offerCreationSigMessage({ authorHex, slots, offerType, expiresDays, minPow, appRequired, timestamp }) {
  const prefix = Buffer.from('swimchain-sponsor-offer:', 'utf-8');
  const b = Buffer.alloc(prefix.length + 32 + 1 + 1 + 4 + 1 + 1 + 8);
  let o = 0;
  prefix.copy(b, o); o += prefix.length;
  Buffer.from(authorHex, 'hex').copy(b, o); o += 32;
  b[o++] = slots;
  b[o++] = offerType;
  b.writeUInt32BE(expiresDays, o); o += 4;
  b[o++] = minPow;
  b[o++] = appRequired ? 1 : 0;
  b.writeBigUInt64BE(BigInt(timestamp), o); o += 8;
  return b;
}

async function mintOffer(authorHex, spaceId) {
  const ts = Math.floor(Date.now() / 1000);
  const msg = offerCreationSigMessage({
    authorHex, slots: NEW_OFFER_SLOTS, offerType: 0,
    expiresDays: NEW_OFFER_DAYS, minPow: MIN_POW, appRequired: false, timestamp: ts,
  });
  const { signature } = await rpc('sign_message', { message: msg.toString('hex') });
  const r = await rpc('create_sponsorship_offer', {
    sponsor_pubkey: authorHex,
    slots: NEW_OFFER_SLOTS,
    offer_type: 'open',
    expires_days: NEW_OFFER_DAYS,
    min_pow_difficulty: MIN_POW,
    application_required: false,
    auto_approve: true,
    space_scope: spaceId,
    signature,
    timestamp: ts,
  });
  return r.offer_id;
}

async function pass() {
  const me = await rpc('get_identity_info', {});
  const authorHex = String(me.public_key).toLowerCase();

  // Ask for a generous page: the health of a space is judged from ALL its
  // live offers, and undercounting would mint duplicates every pass.
  const listed = await rpc('list_sponsorship_offers', { limit: 200 });
  const offers = listed?.offers ?? [];
  if (listed?.has_more) {
    log('WARNING: list_sponsorship_offers reported has_more — raise the limit, health may be undercounted');
  }

  const nowSecs = Math.floor(Date.now() / 1000);

  for (const spaceId of SPACES) {
    const live = offers.filter((o) =>
      String(o.sponsor_pubkey || '').toLowerCase() === authorHex &&
      o.space_scope === spaceId &&
      o.auto_approve === true &&
      o.expires_at > nowSecs);

    // Health is per-offer, not summed: a player claims ONE offer, so two
    // half-dead offers do not add up to a usable one. Take the best.
    let best = null;
    for (const o of live) {
      const days = (o.expires_at - nowSecs) / 86400;
      const free = o.slots_remaining ?? 0;
      const healthy = days >= MIN_DAYS && free >= MIN_FREE_SLOTS;
      if (healthy && (!best || days > best.days)) best = { days, free, id: o.offer_id };
    }

    if (best) {
      log(`${spaceId} ok — ${live.length} live offer(s), best ${best.id.slice(0, 10)} ` +
          `(${best.days.toFixed(1)}d, ${best.free} free)`);
      continue;
    }

    const why = live.length === 0
      ? 'no live auto-approve offer'
      : `all ${live.length} live offer(s) below thresholds (need >=${MIN_DAYS}d and >=${MIN_FREE_SLOTS} free)`;
    if (DRY_RUN) {
      log(`${spaceId} UNHEALTHY — ${why}; WOULD mint ${NEW_OFFER_SLOTS} slots / ${NEW_OFFER_DAYS}d (dry run)`);
      continue;
    }
    log(`${spaceId} UNHEALTHY — ${why}; minting ${NEW_OFFER_SLOTS} slots / ${NEW_OFFER_DAYS}d`);
    try {
      const id = await mintOffer(authorHex, spaceId);
      log(`${spaceId} minted ${id}`);
    } catch (e) {
      log(`${spaceId} MINT FAILED: ${e.message}`);
    }
  }
}

async function main() {
  log(`watching ${SPACES.length} space(s); thresholds ${MIN_DAYS}d / ${MIN_FREE_SLOTS} slots; ` +
      `interval ${ONCE ? 'once' : `${INTERVAL_MS}ms`}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  for (;;) {
    try {
      await pass();
    } catch (e) {
      // Never exit on a transient RPC failure — a keeper that dies on one bad
      // pass is a keeper nobody notices is gone.
      log(`pass failed: ${e.message}`);
    }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
