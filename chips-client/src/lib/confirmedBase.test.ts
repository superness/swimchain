/**
 * The base must not shrink. Every check below is anchored to the regressions
 * measured on 2026-07-29 — movesFrom-1, one reply at a time, recovering in
 * between — because a version of this module that stopped holding the line
 * would reintroduce exactly that.
 *
 * Run: npx tsx src/lib/confirmedBase.test.ts
 */
import { mergeConfirmed, droppedByPoll, EMPTY_BASE, type ConfirmedBase } from './confirmedBase';
import type { ChipsReply } from './chipsEngine';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const reply = (id: string, height?: number): ChipsReply => ({
  content_id: id, author_id: 'deadbeef', body: `dip 1000#${id}`,
  block_height: height,
} as unknown as ChipsReply);

const baseOf = (ids: string[]): ConfirmedBase => ({
  replies: ids.map((i) => reply(i)),
  verified: new Map(ids.map((i) => [i, 1])),
});
const vmap = (ids: string[]) => new Map(ids.map((i) => [i, 1]));
const idsOf = (b: ConfirmedBase) => b.replies.map((r) => r.content_id).join(',');

// 1) THE WHOLE POINT. A poll one reply short must not shrink the base — this is
//    the measured bug: moves 65 -> 64, crumbs -24,120, recovering next poll.
{
  const base = baseOf(['a', 'b', 'c']);
  const short = mergeConfirmed(base, [reply('a'), reply('c')], vmap(['a', 'c']));
  check('a poll missing a reply does NOT shrink the base', idsOf(short) === 'a,b,c', idsOf(short));
  check('and the missing one keeps its verification', short.verified.get('b') === 1, [...short.verified]);

  // THE CASE THAT ACTUALLY HAPPENS, and the one the check above cannot reach:
  // a poll that is short AND brings news. The player is still dipping while an
  // older reply sits in the mempool-to-block gap, so `fresh` is non-empty and
  // the early identity return does not fire. Mutation testing found that the
  // check above passes even with wholesale replacement restored, because with
  // nothing new it never reaches the merge at all.
  const both = mergeConfirmed(base, [reply('a'), reply('c'), reply('d')], vmap(['a', 'c', 'd']));
  check('a short poll carrying NEW replies keeps the old ones too',
    idsOf(both) === 'a,b,c,d', idsOf(both));
  check('and the dropped-then-held reply is still verified', both.verified.get('b') === 1);
}

// 2) It still has to actually accept new replies, or the game stops updating —
//    a base that only ever holds the first poll is worse than the bug.
{
  const grown = mergeConfirmed(baseOf(['a']), [reply('a'), reply('b')], vmap(['a', 'b']));
  check('new replies are taken in', idsOf(grown) === 'a,b', idsOf(grown));
  check('and their verification comes with them', grown.verified.get('b') === 1);
  check('from an empty base too', idsOf(mergeConfirmed(EMPTY_BASE, [reply('z')], vmap(['z']))) === 'z');
}

// 3) IDENTITY ON A NO-OP POLL. `refresh` runs every 15 s and most polls repeat;
//    a fresh object each time would re-fold and re-render for nothing.
{
  const base = baseOf(['a', 'b']);
  check('an unchanged poll returns the SAME object',
    mergeConfirmed(base, [reply('a'), reply('b')], vmap(['a', 'b'])) === base);
  check('and so does an empty poll', mergeConfirmed(base, [], new Map()) === base);
  check('but a poll with news does not',
    mergeConfirmed(base, [reply('c')], vmap(['c'])) !== base);
}

// 4) A REPLY ALREADY HELD IS NOT REPLACED. A re-served copy can carry a
//    different block_height, and orderReplies sorts on it — adopting the new
//    copy would silently reorder the fold, which is a second way to make the
//    same number move for no reason the player can see.
{
  const base: ConfirmedBase = { replies: [reply('a', 10)], verified: new Map([['a', 1]]) };
  const after = mergeConfirmed(base, [reply('a', 99)], new Map([['a', 0]]));
  check('a held reply is not overwritten by a later copy', after === base, after.replies[0]);
  check('so its height cannot change under the fold',
    (after.replies[0] as unknown as { block_height?: number }).block_height === 10);
  check('and a verified reply cannot be un-verified', after.verified.get('a') === 1);
}

// 5) THE MEASUREMENT. droppedByPoll is what proves the theory rather than
//    assuming it — every non-zero result is a regression that did not happen.
{
  check('counts what a poll omitted', droppedByPoll(baseOf(['a', 'b', 'c']), [reply('a')]) === 2);
  check('zero when the poll is complete',
    droppedByPoll(baseOf(['a', 'b']), [reply('a'), reply('b')]) === 0);
  check('zero on an empty base, not a crash', droppedByPoll(EMPTY_BASE, []) === 0);
  check('extra replies in the poll are not "dropped"',
    droppedByPoll(baseOf(['a']), [reply('a'), reply('b')]) === 0);
}

// 6) THE BASE IS NEVER MUTATED. `confirmedRef` is read by the fold; mutating in
//    place would change state under a render that had already begun.
{
  const base = baseOf(['a']);
  const before = idsOf(base);
  mergeConfirmed(base, [reply('b')], vmap(['b']));
  check('merging does not mutate the input base', idsOf(base) === before, idsOf(base));
  check('nor its verification map', base.verified.size === 1, [...base.verified]);
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
