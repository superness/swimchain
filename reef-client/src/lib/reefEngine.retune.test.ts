/**
 * Founder `retune` — per-region live rule changes.
 *
 * Requirement (operator, 2026-07-16): two players relying on free tends alone
 * must be able to move the tides of THEIR reef, without changing every reef in
 * the space. The founder posts `retune epochMoves=<n> tendCap=<n> #<ms>~` as a
 * normal on-chain reply; the fold applies it deterministically from that point
 * forward. Non-founder retunes must be inert.
 *
 * Run: npx tsx src/lib/reefEngine.retune.test.ts
 */
import { foldReef, EPOCH_MOVES, TEND_CAP, type ReefHeader, type ReplyLike } from './reefEngine';

const FOUNDER = 'f0'.repeat(32);
const MALLORY = 'ba'.repeat(32);
const header: ReefHeader = { v: 1, kind: 'reef', founder: FOUNDER, w: 12, h: 12, created: 0 };

let n = 0;
const reply = (author: string, body: string, height: number): ReplyLike => ({
  body: `${body} #${1000 + n}~`,
  created_at: 1000 + n,
  content_id: `sha256:${String(n++).padStart(4, '0')}`,
  author_id: author,
  block_height: height,
});

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? 'ok ' : 'FAIL'} ${name}`);
  if (!cond) failures += 1;
}

// ── defaults hold before any retune ─────────────────────────────────────────
{
  const s = foldReef(header, [reply(FOUNDER, 'grow 5 5', 1)]);
  check('defaults: epochMoves', s.params.epochMoves === EPOCH_MOVES);
  check('defaults: tendCap', s.params.tendCap === TEND_CAP);
}

// ── founder retune applies; non-founder is inert ─────────────────────────────
{
  n = 0;
  const replies = [
    reply(FOUNDER, 'grow 5 5', 1),
    reply(MALLORY, 'retune epochMoves=2 tendCap=1', 2), // must be ignored
    reply(FOUNDER, 'retune epochMoves=6 tendCap=5', 3),
  ];
  const s = foldReef(header, replies);
  check('non-founder retune inert (epochMoves unchanged by mallory)', s.params.epochMoves === 6);
  check('founder retune applies: epochMoves=6', s.params.epochMoves === 6);
  check('founder retune applies: tendCap=5', s.params.tendCap === 5);
  const mallory = s.moves.find((m) => m.author === MALLORY && m.outcome === 'rejected-not-founder');
  check('non-founder retune recorded as rejected-not-founder', !!mallory);
  const tuned = s.moves.find((m) => m.author === FOUNDER && m.outcome === 'retuned');
  check('founder retune recorded as retuned', !!tuned);
}

// ── retuned cadence actually drives the tide ─────────────────────────────────
// After retuning to epochMoves=6, exactly 6 well-formed moves must tick a tide
// (the retune itself must NOT count toward the clock).
{
  n = 0;
  const replies: ReplyLike[] = [reply(FOUNDER, 'retune epochMoves=6', 1)];
  // 8 free tends from two players: A grows a cell, B grows a cell, then they tend.
  replies.push(reply(FOUNDER, 'grow 2 2', 2)); // 1
  replies.push(reply(MALLORY, 'grow 8 8', 2)); // 2
  replies.push(reply(FOUNDER, 'tend 2 2', 3)); // 3
  replies.push(reply(MALLORY, 'tend 8 8', 3)); // 4
  replies.push(reply(FOUNDER, 'tend 2 2', 4)); // 5
  replies.push(reply(MALLORY, 'tend 8 8', 4)); // 6 → tide
  const s = foldReef(header, replies);
  check('6 moves after retune tick exactly one tide', s.epoch === 1);
  // clamp: absurd values can't wedge the region
  const s2 = foldReef(header, [reply(FOUNDER, 'retune epochMoves=1 tendCap=99', 5)]);
  check('clamp: epochMoves floor 2', s2.params.epochMoves === 2);
  check('clamp: tendCap ceiling 12', s2.params.tendCap === 12);
}

// ── two players on free tends alone sustain the tide at epochMoves=6 ────────
{
  n = 0;
  const replies: ReplyLike[] = [
    reply(FOUNDER, 'retune epochMoves=6', 1),
    reply(FOUNDER, 'grow 2 2', 2),
    reply(MALLORY, 'grow 8 8', 2),
  ];
  // Three full tide cycles funded ONLY by tends (4 each per tide ≥ 6 total).
  let h = 3;
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let i = 0; i < 2; i++) {
      replies.push(reply(FOUNDER, 'tend 2 2', h));
      replies.push(reply(MALLORY, 'tend 8 8', h));
      h += 1;
    }
    replies.push(reply(FOUNDER, 'tend 2 2', h));
    replies.push(reply(MALLORY, 'tend 8 8', h));
    h += 1;
  }
  const s = foldReef(header, replies);
  check('three tides sustained by two players tending (epoch >= 3)', s.epoch >= 3);
  check('both corals alive', s.cells.size === 2);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
