/**
 * The reveal gate: the bottom of the bowl opens on CHAIN-CONFIRMED depth only.
 * Run: npx tsx src/lib/bowlGate.test.ts
 */
import { bowlReady, bowlOfferVisible, REVEAL_FLOOR } from './bowlGate';
import { withPending } from './chipsPending';
import { foldChips, saltFor, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { proofKey } from './proofKey';
import { TIP_FLOOR, BANK_MIN_BITS } from './chipsConst';
import type { QueuedMove } from './chipsQueue';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)) : ''}`);
  }
}

const ME = 'a'.repeat(64);
const TABLE = 'sha256:table-a';
const H: ChipsHeader = { v: 1, kind: 'chips-table', name: 'Test Table', owner: ME };

/** A bank of `bits` credits `2 ** (bits - BANK_MIN_BITS)` lifetime chips. */
const lifetimeOf = (bits: number) => 2 ** (bits - BANK_MIN_BITS);

/** A confirmed bank reply plus the verification entry the fold requires. */
function confirmedBank(bits: number, nonce: bigint, ms: number, height: number) {
  const reply: ChipsReply = {
    author_id: ME, body: `bank ${bits} ${nonce.toString(16)}#${ms}~`,
    block_height: height, content_id: `sha256:confirmed-${ms}`, created_at: ms,
  };
  return { reply, key: proofKey(TABLE, ME, ms, nonce), bits };
}

function chain(banks: ReturnType<typeof confirmedBank>[]) {
  return {
    replies: banks.map((b) => b.reply),
    verified: new Map(banks.map((b) => [b.key, b.bits] as const)),
  };
}

const queuedBank = (id: number, ms: number, bits: number, nonce: bigint): QueuedMove =>
  ({ id, tableId: TABLE, author: ME, kind: 'bank', chip: { ms, bits, nonce } });

// 1) THE BUG. A queued-but-unconfirmed bank pushes the OPTIMISTIC lifetime over
//    the floor while the chain is still short of it. The reveal must not open:
//    it latches itself 'seen' for the whole run, and the pending credit can
//    still be taken back (chipsSettling.ts: a rejected twin or a 630s expiry
//    puts the chain's shallower truth back), which leaves the one showing of
//    the game's twist sitting on a dead "not deep enough yet" button.
{
  // 8192 + 1024 = 9,216 confirmed — deliberately just UNDER the reveal floor,
  // so this case turns on pending-vs-confirmed and not on the floor being far
  // away. Straddle the line the gate actually draws or the test proves nothing.
  const banks = [21, 18].map((bits, i) => confirmedBank(bits, BigInt(i + 1), 1_000 + i, i + 1));
  const confirmed = chain(banks);
  const confirmedLifetime = banks.reduce((n, b) => n + lifetimeOf(b.bits), 0);
  check('the chain alone is below the reveal floor',
    confirmedLifetime === 9_216 && confirmedLifetime < REVEAL_FLOOR, confirmedLifetime);

  // One more bank, mined and queued but not yet on the chain: +8192 -> 17,408.
  const queue: QueuedMove[] = [queuedBank(1, 9_000, 21, 99n)];

  // CONTROL: the optimistic fold — the one the counter and the buttons read —
  // really does clear the floor here. Without this the assertion below could
  // pass for the trivial reason that nothing crosses at all.
  const merged = withPending(confirmed.replies, confirmed.verified, queue, ME, TABLE);
  const optimistic = foldChips(H, TABLE, merged.replies, merged.verified);
  check('the optimistic fold DOES clear the reveal floor (control)',
    optimistic.lifetimeChips >= REVEAL_FLOOR,
    { lifetime: optimistic.lifetimeChips, salt: saltFor(optimistic.lifetimeChips) });

  check('the reveal stays shut while only the pending credit clears the floor',
    bowlReady(H, TABLE, confirmed.replies, confirmed.verified, queue, ME) === false);
}

// 2) Once the CHAIN says so, it opens — the gate is a delay, not a wall.
{
  const banks = [22, 15].map((bits, i) => confirmedBank(bits, BigInt(i + 1), 2_000 + i, i + 1));
  const confirmed = chain(banks);
  const lifetime = banks.reduce((n, b) => n + lifetimeOf(b.bits), 0); // 16384 + 128
  check('the chain alone is over the floor', lifetime >= REVEAL_FLOOR, lifetime);
  check('the reveal opens on confirmed depth', bowlReady(H, TABLE, confirmed.replies, confirmed.verified, [], ME) === true);
  check('and it stays open with a pending move alongside it',
    bowlReady(H, TABLE, confirmed.replies, confirmed.verified, [queuedBank(1, 9_000, 16, 99n)], ME) === true);
}

// 3) An empty chain is never ready, queue or no queue.
{
  check('an empty table is not ready', bowlReady(H, TABLE, [], new Map(), [], ME) === false);
  check('an empty table with a big pending bank is still not ready',
    bowlReady(H, TABLE, [], new Map(), [queuedBank(1, 9_000, 22, 7n)], ME) === false);
}

// 3b) THE OFFER FLOOR IS POLICY, NOT CONSENSUS. The game withholds the offer
//     until REVEAL_FLOOR (10,000) so the twist lands deeper, but TIP_FLOOR
//     stays 4,000 — raising the fold constant would re-score the tips already
//     on mainnet (measured 2026-07-27: two real tables, one losing its salt
//     outright). A table between the two numbers is therefore NOT offered the
//     bowl while the fold would still happily pay it.
{
  // 8192 + 1024 = 9,216 lifetime: past TIP_FLOOR, short of REVEAL_FLOOR.
  const banks = [21, 18].map((bits, i) => confirmedBank(bits, BigInt(i + 1), 3_000 + i, i + 1));
  const confirmed = chain(banks);
  const lifetime = banks.reduce((n, b) => n + lifetimeOf(b.bits), 0);
  check('the fixture sits between the two floors',
    lifetime === 9_216 && lifetime >= TIP_FLOOR && lifetime < REVEAL_FLOOR, lifetime);

  // CONTROL: consensus still pays this run. If someone "simplifies" the gate
  // by raising TIP_FLOOR instead, this assertion is what breaks.
  check('the FOLD would still pay salt here (consensus untouched)', saltFor(lifetime) > 0, saltFor(lifetime));

  check('but the offer is withheld below the reveal floor',
    bowlReady(H, TABLE, confirmed.replies, confirmed.verified, [], ME) === false);
}

// 3c) At the reveal floor it opens, and the run is worth more than it would
//     have been at the old 4,000 offer — the point of moving it.
{
  const banks = [22, 19].map((bits, i) => confirmedBank(bits, BigInt(i + 1), 4_000 + i, i + 1));
  const confirmed = chain(banks);
  const lifetime = banks.reduce((n, b) => n + lifetimeOf(b.bits), 0); // 16384 + 2048
  check('at/above the reveal floor the offer stands', lifetime >= REVEAL_FLOOR &&
    bowlReady(H, TABLE, confirmed.replies, confirmed.verified, [], ME) === true, lifetime);
  check('a run offered at the reveal floor beats one offered at the old floor',
    saltFor(REVEAL_FLOOR) > saltFor(TIP_FLOOR), { atReveal: saltFor(REVEAL_FLOOR), atTip: saltFor(TIP_FLOOR) });
}

// 4) THE OTHER DIRECTION. Once the player has actually asked to tip, the move
//    sits in the queue and the OPTIMISTIC fold has already reset lifetime to 0
//    — while the chain still remembers the depth, and will until the reply
//    lands. A chain-only gate would happily put the offer back on the counter
//    reading "tip it for 0 old salt", which opens onto the same dead button
//    from the opposite side. Both conditions have to hold.
{
  check('offer hidden when the run has already been handed back (queued tip)',
    bowlOfferVisible(true, 0) === false);
  check('offer shown when the chain is deep and the run is still live',
    bowlOfferVisible(true, 10) === true);
  check('offer hidden while the chain is still short, however deep the live view',
    bowlOfferVisible(false, 10) === false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
