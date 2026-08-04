/**
 * A STATE MODIFIER MUST NEVER BE A BLOCK.
 *
 * On 2026-08-03 the operator hit a ×64 chip in Surf and the entire screen went
 * dark behind one enormous chip. Nothing in the game had opened — a fryer had.
 *
 * `.deep` was two different things at once. It was the full-screen Deep Fight
 * takeover (`position: fixed; inset: 0; background: rgba(6,4,3,.93)`), and it
 * was the Long Fry's state modifier, worn in Kitchen.tsx by the basket button,
 * its `×64` label and the sixth pip the moment a chip reached its sixth
 * crackle. Every rule written for that state is a compound — `.basket.golden
 * .deep`, `.pip.deep`, `.multi-read b.deep` — so they all outranked the bare
 * block on the properties they set, and none of them set `position`. For
 * `position`/`inset`/`background` the bare `.deep` won on source order, and a
 * fryer became a viewport-filling blackout. Measured before the fix, on a
 * 1707x735 viewport: `button.basket.ready.golden.deep` computed to 1707x1776
 * at (0,0).
 *
 * Specificity did not save us, and it never will here: a compound modifier only
 * outranks a bare block on the properties it happens to declare. So the rule is
 * structural instead — no class may be both a trailing modifier on a compound
 * selector AND the subject of a bare `.x {}` rule that positions or paints a
 * full box. There were 53 compound modifiers in styles.css and exactly one
 * violation; this suite is what keeps that number at zero.
 *
 * Run: npx tsx src/styles.collision.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));

/** Selector text -> declaration block, for every rule in a stylesheet.
 *  Comments are stripped first so a `.deep` mentioned in prose is not a rule,
 *  and at-rule preludes (`@media ...`) are dropped: their nested rules are
 *  matched on their own, which is what we want — a modifier smuggled in behind
 *  a media query is the same landmine. */
export function rulesOf(css: string): { selector: string; decls: string }[] {
  const out: { selector: string; decls: string }[] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    for (const s of m[1].split(',')) {
      const sel = s.trim().replace(/^.*[{}]\s*/, '');
      if (sel && !sel.startsWith('@')) out.push({ selector: sel, decls: m[2] });
    }
  }
  return out;
}

/** A bare block: the whole selector is one class and nothing else. `.deep` yes,
 *  `.deep-bed` yes, `.basket.golden.deep` no, `.ladder .rung` no. */
const BARE = /^\.([a-zA-Z0-9_-]+)$/;
/** A trailing `.mod` glued onto something else — the shape of a state modifier.
 *  `.basket.golden.deep` -> deep. `.multi-read b.deep` -> deep. `.deep-bed`,
 *  standing alone, matches nothing. */
const TRAILING_MOD = /(?:[a-zA-Z0-9_\]-]|\.[a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/;
/** The properties that let a rule leave its own box and cover the screen. A
 *  modifier is allowed to repaint (`color`, `box-shadow`, `animation`); it is
 *  never allowed to re-place. */
const ESCAPES = /(^|[;\s])(position|inset|top|left|right|bottom|z-index|background)\s*:/;

export function collisions(css: string): { cls: string; decls: string }[] {
  const rules = rulesOf(css);
  const bare = new Map<string, string>();
  const mods = new Set<string>();
  for (const { selector, decls } of rules) {
    const b = selector.match(BARE);
    if (b) bare.set(b[1], (bare.get(b[1]) ?? '') + decls);
    const t = selector.match(TRAILING_MOD);
    if (t) mods.add(t[1]);
  }
  const bad: { cls: string; decls: string }[] = [];
  for (const cls of mods) {
    const d = bare.get(cls);
    if (d && ESCAPES.test(d)) bad.push({ cls, decls: d.replace(/\s+/g, ' ').trim() });
  }
  return bad;
}

// ---------------------------------------------------------------------------
// 1) THE DETECTOR ITSELF. A test that only ever runs against a clean stylesheet
//    proves nothing — the whole suite would still pass if `collisions` returned
//    `[]` unconditionally. So: the exact pre-fix shape must be caught, and the
//    exact post-fix shape must not.
{
  const BROKEN = `
    .basket { position: relative; background: #333; }
    .basket.golden.deep { box-shadow: 0 0 74px orange; animation: deepfry 3.2s; }
    .pip.deep { box-shadow: inset 0 0 0 1px orange; }
    .deep { position: fixed; inset: 0; z-index: 60; background: rgba(6,4,3,.93); }
    .deep-bed { position: absolute; inset: 0; }
  `;
  const got = collisions(BROKEN);
  check('the 2026-08-03 stylesheet is caught', got.length === 1 && got[0].cls === 'deep', got);

  // Written out rather than string-replaced: `.basket.golden.deep {` CONTAINS
  // `.deep {`, so a naive replace renames the modifier and leaves the takeover
  // standing — a "fixed" fixture that is still broken, which is how a suite
  // ends up proving nothing.
  const FIXED = BROKEN.replace(
    '.deep { position: fixed; inset: 0; z-index: 60; background: rgba(6,4,3,.93); }',
    '.deep-screen { position: fixed; inset: 0; z-index: 60; background: rgba(6,4,3,.93); }',
  );
  check('the fixture actually changed', FIXED !== BROKEN);
  check('renaming the takeover clears it', collisions(FIXED).length === 0, collisions(FIXED));

  // `.deep-bed` is a bare positioned block too, and it must NOT be flagged:
  // nothing ever wears it as a modifier. Flagging every fixed/absolute block
  // would make the suite noise, and noise gets deleted.
  check('a positioned block nobody modifies is fine', !collisions(FIXED).some((c) => c.cls === 'deep-bed'));

  // A modifier may repaint all it likes — that is what modifiers are for.
  check('a repaint-only bare rule is not a collision',
    collisions(`.b.lit { color: red } .lit { color: gold; box-shadow: 0 0 7px gold }`).length === 0);

  // ...and the same landmine behind a media query still counts.
  check('a collision inside @media is still caught',
    collisions(`.b.tall { color: red } @media (min-width: 40em) { .tall { position: fixed; inset: 0 } }`)
      .some((c) => c.cls === 'tall'));

  // Comments are prose, not rules: the fix's own note names `.deep` repeatedly.
  check('a class named only in a comment is not a rule',
    collisions(`/* .deep { position: fixed } was the bug */ .b.deep { color: red }`).length === 0);
}

// ---------------------------------------------------------------------------
// 2) THE REAL STYLESHEET. The invariant, on the file that ships.
{
  const css = readFileSync(join(HERE, 'styles.css'), 'utf8');
  const bad = collisions(css);
  check('styles.css: no modifier is also a positioned block', bad.length === 0, bad);

  // Guard the specific rename, so a well-meaning tidy-up cannot put it back.
  const rules = rulesOf(css);
  check('no bare `.deep` rule exists', !rules.some((r) => r.selector === '.deep'),
    rules.filter((r) => r.selector === '.deep').map((r) => r.decls));
  check('the takeover is `.deep-screen`', rules.some((r) => r.selector === '.deep-screen'));
}

// ---------------------------------------------------------------------------
// 3) THE MARKUP SIDE. The stylesheet can be clean and the JSX still wrong, if
//    the takeover's class in DeepFight.tsx drifts away from the rule that
//    styles it. It is one string in one file; assert it.
{
  const tsx = readFileSync(join(HERE, 'DeepFight.tsx'), 'utf8');
  check('DeepFight renders `deep-screen`', /className="deep-screen"/.test(tsx));
  check('DeepFight no longer renders bare `deep`', !/className="deep"/.test(tsx));
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('styles collision: all checks passed');
