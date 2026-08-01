import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  selectSponsorOffer, buildClaimMessage, mineClaimPow,
  isSponsored, requestSponsorship,
} from '../web/sponsorship.mjs';

const digest = async (buf) => createHash('sha256').update(Buffer.from(buf)).digest().buffer;

const scoped = (id, slots) => ({
  offer_id: id, sponsor_pubkey: 'aa'.repeat(32), auto_approve: true,
  slots_remaining: slots, space_scope: 'sp1qqzc0w94g6hqlvaqxy735mjss84qrwk88e',
  requirements: { min_pow_difficulty: 8 },
});
const unscoped = (id, slots, auto = false) => ({
  offer_id: id, sponsor_pubkey: 'bb'.repeat(32), auto_approve: auto,
  slots_remaining: slots, space_scope: null,
  requirements: { min_pow_difficulty: 8 },
});

// THE load-bearing test: a game-scoped offer is never claimable in Surf, even
// when it is auto-approve and has 100 slots and the only unscoped one has 1.
test('selectSponsorOffer never returns a space-scoped offer', () => {
  const picked = selectSponsorOffer([scoped('a1', 100), unscoped('b1', 1)]);
  assert.equal(picked.offer_id, 'b1');
});

test('selectSponsorOffer returns null when every offer is space-scoped', () => {
  assert.equal(selectSponsorOffer([scoped('a1', 100), scoped('a2', 99)]), null);
});

test('selectSponsorOffer skips exhausted offers', () => {
  assert.equal(selectSponsorOffer([unscoped('b1', 0)]), null);
});

test('selectSponsorOffer prefers the offer with the most slots', () => {
  const picked = selectSponsorOffer([unscoped('b1', 2), unscoped('b2', 40)]);
  assert.equal(picked.offer_id, 'b2');
});

test('selectSponsorOffer tolerates a missing space_scope key as unscoped', () => {
  const o = { offer_id: 'c1', slots_remaining: 5, requirements: {} };
  assert.equal(selectSponsorOffer([o]).offer_id, 'c1');
});

test('buildClaimMessage lays out offer_id(16) + claimant(32) + ts(8 BE) + pow(32)', () => {
  const msg = buildClaimMessage('0a'.repeat(16), 'cd'.repeat(32), 1, new Uint8Array(32).fill(7));
  assert.equal(msg.length, 88);
  assert.equal(msg[0], 0x0a, 'offer_id starts at 0');
  assert.equal(msg[15], 0x0a, 'offer_id is 16 bytes, ending at 15');
  assert.equal(msg[16], 0xcd, 'claimant starts at 16');
  assert.equal(msg[47], 0xcd, 'claimant is 32 bytes, ending at 47');
  assert.equal(msg[48], 0, 'timestamp is big-endian: high byte first');
  assert.equal(msg[55], 1, 'timestamp low byte at 55');
  assert.equal(msg[56], 7, 'pow_hash starts at 56');
});

test('mineClaimPow counts leading zero BITS, not bytes', async () => {
  const { powHash } = await mineClaimPow(8, digest);
  assert.equal(powHash[0], 0, 'first byte must be zero for 8 zero bits');
});

test('isSponsored reads has_sponsorship', async () => {
  const rpc = async () => ({ has_sponsorship: true });
  assert.equal(await isSponsored(rpc, 'ab'.repeat(32)), true);
});

test('isSponsored is false (not a throw) when the RPC errors', async () => {
  const rpc = async () => { throw new Error('node busy'); };
  assert.equal(await isSponsored(rpc, 'ab'.repeat(32)), false);
});

test('requestSponsorship throws no-unscoped-offer when only game offers exist', async () => {
  const rpc = async (m) => {
    if (m === 'list_sponsorship_offers') return { offers: [scoped('a1', 100)] };
    throw new Error(`unexpected ${m}`);
  };
  await assert.rejects(
    () => requestSponsorship({ rpc, sign: async () => 'ff', pubkeyHex: 'ab'.repeat(32), digest }),
    /no-unscoped-offer/
  );
});

test('requestSponsorship claims the unscoped offer and passes bit difficulty through', async () => {
  const calls = [];
  const rpc = async (m, p) => {
    calls.push([m, p]);
    if (m === 'list_sponsorship_offers') return { offers: [scoped('a1', 100), unscoped('b1', 7)] };
    if (m === 'claim_sponsorship_offer') return { ok: true };
    throw new Error(`unexpected ${m}`);
  };
  const out = await requestSponsorship({
    rpc, sign: async () => 'ee'.repeat(64), pubkeyHex: 'ab'.repeat(32),
    digest, now: () => 1_700_000_000_000,
  });
  assert.equal(out.offerId, 'b1');
  const claim = calls.find((c) => c[0] === 'claim_sponsorship_offer')[1];
  assert.equal(claim.offer_id, 'b1');
  assert.equal(claim.claimant_pubkey, 'ab'.repeat(32));
  assert.equal(claim.pow_difficulty, 8);
  assert.equal(claim.timestamp, 1_700_000_000);
  assert.equal(typeof claim.pow_nonce, 'number');
});
