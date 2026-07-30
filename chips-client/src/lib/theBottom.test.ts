/**
 * THE BOTTOM OF THE BOWL — the wall's rules.
 *
 * Two things here are load-bearing beyond the feature itself:
 *
 *   1. THE SANITIZER. A name is written into a POST BODY and shown to other
 *      players. The node splits a post's title from its body on the first blank
 *      line, so a name carrying a newline could corrupt the post it rides in.
 *      This is the only place in chips where one player's text reaches another
 *      player's screen.
 *   2. THE COLLAPSE. A player signs again after every descent, so the wall must
 *      show one line per person — otherwise it becomes a log, which is the
 *      document the moment is deliberately not.
 *
 * Run: npx tsx src/lib/theBottom.test.ts
 */
import { markBody, parseMark, sanitize, wall, hasBeenThere, WHO_MAX } from './theBottom';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

/* ── 1. THE SANITIZER — the only player text that reaches other players ─── */
{
  check('an ordinary name survives', sanitize('  scoop  ') === 'scoop', sanitize('  scoop  '));

  // THE POST-CORRUPTING CASE. A blank line inside the name would shift the
  // node's title/body split.
  const nl = sanitize('evil\n\nname');
  check('newlines cannot survive', !nl.includes('\n') && !nl.includes('\r'), nl);
  check('...and become a space, not a join', nl === 'evil name', nl);

  const ctrl = sanitize(`bell${String.fromCharCode(7)}nul${String.fromCharCode(0)}del${String.fromCharCode(127)}`);
  check('control characters are stripped', ctrl === 'bellnuldel', ctrl);

  const long = sanitize('x'.repeat(500));
  check('a name cannot take over the wall', long.length === WHO_MAX, long.length);

  check('an all-whitespace name is nothing', sanitize('   \n\t  ') === '', JSON.stringify(sanitize('   \n\t  ')));
}

/* ── 2. THE BODY ROUND-TRIPS ───────────────────────────────────────────── */
{
  const b = markBody('patrick', 3);
  check('the body is versioned', b.startsWith('bottom v1 '), b);
  const m = parseMark(b, 1000);
  check('it reads back', m?.who === 'patrick' && m?.bowls === 3, m);

  check('a name with spaces survives the round trip',
    parseMark(markBody('the small dog', 1), 1)?.who === 'the small dog');

  for (const bad of [0, -1, 1.5, NaN]) {
    let threw = false;
    try { markBody('x', bad); } catch { threw = true; }
    check(`bowls=${bad} is refused`, threw);
  }
  let threwEmpty = false;
  try { markBody('   ', 1); } catch { threwEmpty = true; }
  check('an empty name is refused', threwEmpty);
}

/* ── 3. UNKNOWN SHAPES ARE SKIPPED, NEVER SHOWN WRONG ──────────────────── */
{
  check('a future version is skipped', parseMark('bottom v2 3 someone', 1) === null);
  check('an unrelated post is skipped', parseMark('dip 500#123~', 1) === null);
  check('a malformed mark is skipped', parseMark('bottom v1 notanumber x', 1) === null);
  check('a mark with no name is skipped', parseMark('bottom v1 3', 1) === null);
}

/* ── 4. THE COLLAPSE — one line per person, their best ──────────────────── */
{
  const marks = [
    { who: 'patrick', bowls: 1, at: 100 },
    { who: 'scoop', bowls: 2, at: 200 },
    { who: 'Patrick', bowls: 4, at: 300 },   // same person, later, deeper
    { who: 'patrick', bowls: 2, at: 250 },
  ];
  const w = wall(marks);
  check('one line per person', w.length === 2, w.map((m) => m.who));
  const p = w.find((m) => m.who.toLowerCase() === 'patrick');
  check('and it is their HIGHEST count', p?.bowls === 4, p);
  check('names are collapsed case-insensitively', w.filter((m) => m.who.toLowerCase() === 'patrick').length === 1, w);
  check('most recent first', w[0].at >= w[1].at, w.map((m) => m.at));

  // A busy wall stays a moment rather than a document.
  const many = Array.from({ length: 200 }, (_, i) => ({ who: `p${i}`, bowls: 1, at: i }));
  check('the wall is bounded', wall(many).length === 24, wall(many).length);
  check('and shows the newest arrivals', wall(many)[0].who === 'p199', wall(many)[0].who);
}

/* ── 5. THE GATE ───────────────────────────────────────────────────────── */
{
  check('never been there: no moment', !hasBeenThere(0));
  check('been once: the moment is yours', hasBeenThere(1));
  check('and it stays yours', hasBeenThere(9));
}

if (failures > 0) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nall good');
