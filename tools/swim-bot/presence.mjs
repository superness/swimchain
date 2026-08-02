/**
 * "Is anybody actually here?"
 *
 * The reef bot plays unprompted: it seeds, spreads, tends and contests whether
 * or not a person is at the board. On a quiet mainnet that means a reef made
 * almost entirely of bot coral and hours of Argon2id spent for nobody. This
 * module answers the one question that gates it — has a NON-BOT identity moved
 * in this region recently.
 *
 * The chess bot needs none of this: chess-bot.mjs only submits when
 * `chess.turn() === botColor`, which can only become true after an opponent
 * moves, so it is presence-gated by the rules of the game already.
 *
 * Pure functions, no RPC, so the gate can be tested without a node.
 */

/**
 * A move body carries the AUTHORING timestamp the fold orders by:
 *   `grow 3 4 <region>#1785603858123~a1b2c3d4~<nonce>`
 * That stamp is the author's own clock, and it is what reef-bot.mjs's
 * submitMove and the client's submitReefMove both write.
 */
const AUTHORED_MS = /#(\d{10,})~/;

/**
 * How far into the future an authoring stamp may sit before it is treated as a
 * broken clock rather than a fact. A body stamped an hour ahead would
 * otherwise hold the bot awake permanently, which is exactly the failure the
 * gate exists to prevent.
 */
export const FUTURE_SLOP_MS = 2 * 60 * 1000;

/**
 * When this reply was authored, in ms. Prefers the body stamp, because the
 * node's `created_at` is stamped at QUERY time for replies that have not
 * landed in a block yet — a stale pending move would otherwise read as
 * perpetually fresh and keep the bot playing to an empty room.
 *
 * Returns NaN when neither source is usable; callers must treat that as "no
 * evidence of presence", never as "now".
 */
export function authoredMs(reply, now = Date.now()) {
  const m = AUTHORED_MS.exec(reply?.body ?? '');
  const fromBody = m ? Number(m[1]) : NaN;
  if (Number.isFinite(fromBody) && fromBody <= now + FUTURE_SLOP_MS) return fromBody;
  const raw = reply?.created_at;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return NaN;
  // The node reports seconds in some paths and ms in others. 1e12 ms is
  // 2001-09-09, so anything below it is unambiguously seconds.
  return raw < 1e12 ? raw * 1000 : raw;
}

/**
 * The most recent moment a non-bot identity touched this region, or null if
 * none did. `bots` is every pubkey that must NOT count as a person — the bot's
 * own identity, plus any sibling bot sharing the board.
 */
export function lastHumanMs(replies, bots, now = Date.now()) {
  const excluded = new Set([...bots].filter(Boolean).map((b) => b.toLowerCase()));
  let latest = null;
  for (const r of replies ?? []) {
    const author = (r?.author_id ?? '').toLowerCase();
    if (!author || excluded.has(author)) continue;
    const ms = authoredMs(r, now);
    if (!Number.isFinite(ms)) continue;
    if (latest === null || ms > latest) latest = ms;
  }
  return latest;
}

/**
 * Should the bot move this pass?
 *
 * `windowMs <= 0` disables the gate entirely — that is the pre-gate behaviour,
 * kept reachable so an operator can put the bot back to playing continuously
 * without editing code.
 */
export function shouldPlay({ replies, bots, windowMs, now = Date.now() }) {
  if (!(windowMs > 0)) return { play: true, reason: 'gate off', lastHumanMs: null, ageMs: null };
  const last = lastHumanMs(replies, bots, now);
  if (last === null) return { play: false, reason: 'nobody has ever moved here', lastHumanMs: null, ageMs: null };
  const ageMs = now - last;
  return {
    play: ageMs <= windowMs,
    reason: ageMs <= windowMs ? 'someone is at the board' : 'the board has been quiet',
    lastHumanMs: last,
    ageMs,
  };
}
