/**
 * THE BOTTOM OF THE BOWL — the wall only people who got there ever see.
 *
 * Come up through the bottom and, for a moment, you are shown everyone else who
 * has. You add your mark and it closes. No menu entry, no link, no revisiting:
 * operator, "it should stay only an ephemeral moment for people who got there to
 * see at all."
 *
 * WHAT IT RECORDS IS THE ONLY NUMBER PATIENCE CANNOT FAKE.
 * `bowls` — times come up through the bottom — has exactly one source: finishing
 * the descent. Its own declaration in chipsEngine says so ("the one number only
 * the descent can move"). Not a time ladder and not a crumb count, either of
 * which rewards whoever left the tab open longest. This rewards coming back.
 *
 * NOT VERIFIABLE, DELIBERATELY. Dips are self-declared — the whole game runs on
 * that precedent — so a determined person could sign without finishing. Making
 * it cheat-proof would mean consensus machinery that fights the game's own
 * design, for a wall whose entire value is that the people on it know what it
 * took. It trusts you. That is the point.
 *
 * PURE: no React, no RPC, no clock.
 */

/** One line on the wall. */
export interface Mark {
  /** What they called themselves. Free text, trimmed, bounded. */
  who: string;
  /** Times they have come up through the bottom. */
  bowls: number;
  /** When the post landed, for ordering only. */
  at: number;
}

/** Longest name we will write or read. Long enough for a sentence, short
 *  enough that one person cannot take over the wall. */
export const WHO_MAX = 40;

/** C0 controls and DEL, as a class. Built from codepoints rather than written
 *  literally so the source file can never itself contain a control byte. */
const CONTROL_CHARS = new RegExp(`[${'\\u0000-\\u001f\\u007f'}]`, 'g');

/**
 * Names are shown to other players, so they are stripped to a single line of
 * printable characters and bounded.
 *
 * Newlines especially: the node splits a post's TITLE from its BODY on the first
 * blank line, so a name carrying one could corrupt the post it rides in.
 */
export function sanitize(who: string): string {
  return who
    .replace(/[\r\n\t]+/g, ' ')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, WHO_MAX);
}

/**
 * The body a mark is written as: `bottom v1 <bowls> <who>`.
 *
 * Versioned because this is the one thing here that outlives a client. A future
 * shape can be added without making today's marks unreadable, and an unknown
 * version is skipped rather than shown wrong.
 */
export function markBody(who: string, bowls: number): string {
  const name = sanitize(who);
  if (!name) throw new Error('markBody: empty name');
  if (!Number.isSafeInteger(bowls) || bowls < 1) {
    throw new Error(`markBody: bowls must be a positive safe integer, got ${bowls}`);
  }
  return `bottom v1 ${bowls} ${name}`;
}

/** Read a mark back. Null for anything that is not a v1 mark. */
export function parseMark(body: string, at: number): Mark | null {
  const m = /^bottom v1 (\d{1,9}) (.+)$/.exec(body.trim());
  if (!m) return null;
  const bowls = Number(m[1]);
  const who = sanitize(m[2]);
  if (!who || bowls < 1) return null;
  return { who, bowls, at };
}

/**
 * The wall as it should be shown: one line per PERSON, their highest count, most
 * recent arrivals first.
 *
 * Collapsed by name because a player signs again after every descent — five
 * visits by the same person is one line reading x5, not five lines. Without this
 * the wall becomes a log, and a log is the document the moment is not meant to
 * be.
 */
export function wall(marks: readonly Mark[], limit = 24): Mark[] {
  const best = new Map<string, Mark>();
  for (const m of marks) {
    const key = m.who.toLowerCase();
    const prev = best.get(key);
    if (!prev || m.bowls > prev.bowls || (m.bowls === prev.bowls && m.at > prev.at)) {
      best.set(key, m);
    }
  }
  return [...best.values()].sort((a, b) => b.at - a.at).slice(0, limit);
}

/**
 * Have you earned the moment? Exactly one condition: you have come up through
 * the bottom at least once.
 *
 * `bowls` is fold state and survives a tip, so this stays true forever once
 * true — the wall is not something you can be locked out of again.
 */
export function hasBeenThere(bowls: number): boolean {
  return bowls >= 1;
}
