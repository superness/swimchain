/**
 * `burn <key>` — REFUSE a jar and take 70% of its price in crumbs.
 *
 * You never own it. There is nothing to sell back and nothing to pay: you
 * decline an upgrade you had earned the right to buy, and the crumbs land
 * immediately. Operator: "it is a strategy to advance ... exactly it is a
 * rush."
 *
 * (An earlier version of this file tested the opposite verb — buy it, own it,
 * sell it back for 70%. That is a pawn shop, not a rush: it costs full price
 * first, so it can never accelerate anything. Rewritten wholesale rather than
 * extended, because every assertion in it was about the wrong mechanic. Safe
 * to redefine the word: mainnet was scanned across all 17 tables and 2,523
 * replies, and `burn` had never once been used.)
 *
 * WHAT MAKES IT COST SOMETHING. The price is real, because a buy still needs
 * its chain prefix owned — so refusing Seasoning III ends the seasoning
 * ladder at III for the rest of the run. The deeper the rung, the fatter the
 * payout and the more of the game you are trading away for it.
 *
 * Run: npx tsx src/lib/chipsEngine.burn.test.ts
 */
import { foldChips, type ChipsHeader, type ChipsReply } from './chipsEngine';
import { UPGRADES, BURN_REFUND_NUM, BURN_REFUND_DEN } from './chipsConst';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const OWNER = 'a'.repeat(64);
const TABLE = 'sha256:table';
const header: ChipsHeader = { v: 1, kind: 'chips-table', name: 'T', owner: OWNER };

let n = 0;
const nextMs = () => 1_700_000_000_000 + ++n * 1000;
const reply = (body: string): ChipsReply => {
  const ms = nextMs();
  return { author_id: OWNER, body: `${body}#${ms}~`, block_height: 1, content_id: `c${n}`, created_at: ms };
};
const earn = (crumbs: number): ChipsReply[] => {
  const out: ChipsReply[] = [];
  let got = 0;
  while (got < crumbs) { const bite = Math.min(500_000, crumbs - got); out.push(reply(`dip ${bite}`)); got += bite; }
  return out;
};
const fold = (rs: ChipsReply[]) => foldChips(header, TABLE, rs, new Map());
const takeOf = (key: string) => Math.floor(UPGRADES[key].cost * BURN_REFUND_NUM / BURN_REFUND_DEN);

/* ── THE RUSH: crumbs for nothing but the jar you gave up ─────────────── */
{
  // Broke on purpose. Affordability is NOT a condition — that is the whole
  // point of a rush, and an implementation that required the crumbs first
  // would have nothing to accelerate.
  const st = fold([reply('burn season1')]);
  check('a jar can be refused with an empty bowl', st.moves[0].outcome === 'burned', st.moves[0]);
  check('and 70% of its price lands immediately', st.crumbs === takeOf('season1'), st.crumbs);
  check('you do NOT own it', !st.owned.has('season1'), [...st.owned]);
  check('it is recorded as refused', st.declined.has('season1'));
}

/* ── AND YOU CANNOT THEN BUY IT ───────────────────────────────────────── */
{
  const st = fold([...earn(60_000), reply('burn season1'), reply('buy season1')]);
  check('buying a jar you refused is rejected',
    st.moves[st.moves.length - 1].outcome === 'rejected-owned', st.moves[st.moves.length - 1]);
  check('and you still do not own it', !st.owned.has('season1'));
}

/* ── NOR REFUSE IT TWICE ──────────────────────────────────────────────── */
{
  const st = fold([reply('burn season1'), reply('burn season1')]);
  check('a second refusal is rejected',
    st.moves[1].outcome === 'rejected-unowned', st.moves[1]);
  check('and pays only once', st.crumbs === takeOf('season1'), st.crumbs);
}

/* ── NOR REFUSE WHAT YOU ALREADY BOUGHT ───────────────────────────────── */
{
  const st = fold([...earn(60_000), reply('buy season1'), reply('burn season1')]);
  check('refusing a jar you own is rejected',
    st.moves[st.moves.length - 1].outcome === 'rejected-unowned', st.moves[st.moves.length - 1]);
  check('and it stays owned', st.owned.has('season1'));
}

/* ── THE PRICE: a chain rung takes the whole ladder above it ──────────── */
{
  // season2 needs season1 owned. Refusing season1 ends the chain there.
  const st = fold([...earn(600_000), reply('burn season1'), reply('buy season2')]);
  check('you cannot climb past a rung you refused',
    st.moves[st.moves.length - 1].outcome === 'rejected-order', st.moves[st.moves.length - 1]);
  check('so the ladder really is forfeit', !st.owned.has('season2'));

  // And you may only refuse a rung you had earned the right to buy.
  const early = fold([reply('burn season2')]);
  check('refusing a rung whose prefix you do not own is rejected',
    early.moves[0].outcome === 'rejected-order', early.moves[0]);
  check('and pays nothing', early.crumbs === 0, early.crumbs);

  // Own the prefix, and the deeper rung's fatter payout is available.
  const deep = fold([...earn(60_000), reply('buy season1'), reply('burn season2')]);
  check('with the prefix owned, the deeper rung can be refused', deep.declined.has('season2'));
  check('and it pays more than the shallow one', takeOf('season2') > takeOf('season1'));
}

/* ── the bowl still bounds what you can hold ──────────────────────────── */
{
  // season4 refunds 2.8M into a 1M starting bowl.
  const st = fold([...earn(60_000), reply('buy season1'), reply('buy season2'),
    ...earn(600_000), reply('buy season3'), reply('burn season4')]);
  check('a refusal cannot overfill the bowl', st.crumbs <= st.bowlCap, { crumbs: st.crumbs, cap: st.bowlCap });
}

/* ── a refusal is a RUN choice — the bowl going over clears it ────────── */
{
  const st = fold([...earn(60_000), reply('burn season1'),
    ...earn(5_000_000), reply('tip'), ...earn(60_000), reply('buy season1')]);
  check('after a tip the jar is available again', st.owned.has('season1'), [...st.owned]);
  check('and nothing is still marked refused', st.declined.size === 0, [...st.declined]);
}

/* ── nonsense and strangers ───────────────────────────────────────────── */
{
  const ghost = fold([reply('burn nosuchjar')]);
  check('refusing a jar that does not exist pays nothing', ghost.crumbs === 0, ghost.crumbs);

  const stranger: ChipsReply = { ...reply('burn season1'), author_id: 'b'.repeat(64) };
  const st = fold([stranger]);
  check('a stranger cannot refuse on your table', st.crumbs === 0 && st.declined.size === 0);
}

/* ── the rate ─────────────────────────────────────────────────────────── */
{
  check('the take is 70%', BURN_REFUND_NUM === 70 && BURN_REFUND_DEN === 100);
  check('which is less than the price, so refusing everything is not free money',
    BURN_REFUND_NUM < BURN_REFUND_DEN);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
