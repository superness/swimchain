import test from 'node:test';
import assert from 'node:assert/strict';
import { authoredMs, lastHumanMs, shouldPlay, FUTURE_SLOP_MS } from './presence.mjs';

const NOW = 1785600000000;               // fixed clock; no Date.now() in assertions
const BOT = 'aa'.repeat(32);
const SIBLING = 'bb'.repeat(32);
const HUMAN = 'cc'.repeat(32);
const BOTS = [BOT, SIBLING];
const MIN = 60_000;

const move = (author, ms, over = {}) => ({
  author_id: author,
  body: `grow 3 4 sha256:deadbeef#${ms}~${author.slice(0, 8)}~ffff`,
  ...over,
});

test('the authoring stamp comes out of the body', () => {
  assert.equal(authoredMs(move(HUMAN, NOW - MIN), NOW), NOW - MIN);
});

test('a body stamped in the future is not trusted', () => {
  // Would otherwise pin the bot awake forever — the exact failure the gate exists
  // to stop. Falls through to the node's stamp instead.
  const r = move(HUMAN, NOW + FUTURE_SLOP_MS + 1, { created_at: (NOW - 5 * MIN) / 1000 });
  assert.equal(authoredMs(r, NOW), NOW - 5 * MIN);
});

test('a body stamped just inside the slop is still trusted', () => {
  const r = move(HUMAN, NOW + FUTURE_SLOP_MS, { created_at: 1 });
  assert.equal(authoredMs(r, NOW), NOW + FUTURE_SLOP_MS);
});

test('created_at in seconds is read as seconds, not as 1970', () => {
  const r = { author_id: HUMAN, body: 'grow 3 4 no-stamp', created_at: NOW / 1000 };
  assert.equal(authoredMs(r, NOW), NOW);
});

test('created_at already in ms is left alone', () => {
  const r = { author_id: HUMAN, body: 'grow 3 4 no-stamp', created_at: NOW };
  assert.equal(authoredMs(r, NOW), NOW);
});

test('a reply with no usable time is NaN, never now', () => {
  assert.ok(Number.isNaN(authoredMs({ author_id: HUMAN, body: 'grow 3 4' }, NOW)));
});

test('the bot does not count itself as company', () => {
  assert.equal(lastHumanMs([move(BOT, NOW - MIN)], BOTS, NOW), null);
});

test('a sibling bot does not count as company either', () => {
  assert.equal(lastHumanMs([move(SIBLING, NOW - MIN)], BOTS, NOW), null);
});

test('author matching is case-insensitive on the REPLY side', () => {
  assert.equal(lastHumanMs([move(BOT.toUpperCase(), NOW - MIN)], BOTS, NOW), null);
});

test('author matching is case-insensitive on the BOTS-LIST side', () => {
  // BOT_PEERS comes off a command line and gets pasted in whatever case the
  // operator copied. Without this the sibling bot reads as a person and the
  // gate never closes — and the reply-side test above cannot catch it.
  assert.equal(lastHumanMs([move(BOT, NOW - MIN)], [BOT.toUpperCase()], NOW), null);
});

test('the newest human move wins, whatever order they arrive in', () => {
  const replies = [move(HUMAN, NOW - 9 * MIN), move(BOT, NOW - 1), move(HUMAN, NOW - 2 * MIN)];
  assert.equal(lastHumanMs(replies, BOTS, NOW), NOW - 2 * MIN);
});

test('plays while a person is inside the window', () => {
  const r = shouldPlay({ replies: [move(HUMAN, NOW - 5 * MIN)], bots: BOTS, windowMs: 15 * MIN, now: NOW });
  assert.equal(r.play, true);
  assert.equal(r.ageMs, 5 * MIN);
});

test('stops once the board has been quiet longer than the window', () => {
  const r = shouldPlay({ replies: [move(HUMAN, NOW - 16 * MIN)], bots: BOTS, windowMs: 15 * MIN, now: NOW });
  assert.equal(r.play, false);
});

test('the window boundary is inclusive — a move exactly at the edge still counts', () => {
  const r = shouldPlay({ replies: [move(HUMAN, NOW - 15 * MIN)], bots: BOTS, windowMs: 15 * MIN, now: NOW });
  assert.equal(r.play, true);
});

test('a board only the bot has ever touched is not company', () => {
  const r = shouldPlay({ replies: [move(BOT, NOW - 1)], bots: BOTS, windowMs: 15 * MIN, now: NOW });
  assert.equal(r.play, false);
  assert.equal(r.lastHumanMs, null);
});

test('an empty region does not wake the bot', () => {
  assert.equal(shouldPlay({ replies: [], bots: BOTS, windowMs: 15 * MIN, now: NOW }).play, false);
});

test('windowMs 0 turns the gate off and the bot plays as it always did', () => {
  assert.equal(shouldPlay({ replies: [], bots: BOTS, windowMs: 0, now: NOW }).play, true);
});

test("one human move wakes a bot that had gone quiet — the newcomer's first move must land", () => {
  // The case that decides whether the gate is usable at all: a person walks up
  // to a reef nobody has touched in days and moves once.
  const quiet = shouldPlay({ replies: [move(BOT, NOW - 3 * 24 * 60 * MIN)], bots: BOTS, windowMs: 15 * MIN, now: NOW });
  assert.equal(quiet.play, false);
  const woken = shouldPlay({
    replies: [move(BOT, NOW - 3 * 24 * 60 * MIN), move(HUMAN, NOW - 1000)],
    bots: BOTS, windowMs: 15 * MIN, now: NOW,
  });
  assert.equal(woken.play, true);
});
