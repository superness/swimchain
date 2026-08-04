/**
 * THE BENCH MUST NOT MOVE WHEN SOMEBODY TALKS.
 *
 * On a phone the crew stand on a fixed ledge (`.crew-row`), and the ledge
 * centres a short cast with auto margins on its END children:
 *
 *     .critter:first-child { margin-left: auto }
 *     .critter:last-child  { margin-right: auto }
 *
 * The chat strip `.crew-toast` was rendered as the FIRST CHILD of that ledge.
 * So the instant any critter spoke, no `.critter` matched `:first-child` any
 * more, the left auto-margin vanished, and the entire cast slid left — then
 * slid back when the line expired. Measured at 390x740 before the fix: every
 * critter moved 53px each way, on every line. (Operator, 2026-08-03: "the
 * critters reposition themselves back and forth - I think triggered by their
 * dialogs.")
 *
 * Desktop had the same disease quietly: the strip is `display:none` there but
 * still a CHILD, so it shifted every `.critter:nth-child(2n)/(3n)` loiter
 * animation-delay by one and the cast twitched on every line too.
 *
 * The strip is `position: fixed` wherever it renders, so it never needed to be
 * inside the ledge. It is now a sibling. This suite pins that down, because the
 * failure is invisible in code review — the markup looks perfectly reasonable.
 *
 * Run: npx tsx src/crewBench.test.ts
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
const crew = readFileSync(join(HERE, 'Crew.tsx'), 'utf8');
const css = readFileSync(join(HERE, 'styles.css'), 'utf8');

/** Is `child` rendered inside the element opened by `openTag`? Walks forward
 *  from the opening tag counting depth, so a match found before the container
 *  closes is inside it. Deliberately dumb — it only has to answer one
 *  question about one well-formed file. */
export function renderedInside(src: string, openTag: string, childMarker: string): boolean {
  const start = src.indexOf(openTag);
  if (start < 0) throw new Error(`renderedInside: no ${openTag}`);
  const marker = src.indexOf(childMarker);
  if (marker < 0) throw new Error(`renderedInside: no ${childMarker}`);
  return marker > start;
}

// ---------------------------------------------------------------------------
// 1) The detector, on both shapes. A test that cannot tell them apart is a
//    test that would have passed on the bug.
{
  const BROKEN = `<div className="crew-row"><div className="crew-toast" /><button className="critter" /></div>`;
  const OK = `<><div className="crew-toast" /><div className="crew-row"><button className="critter" /></div></>`;
  check('the pre-fix markup reads as INSIDE',
    renderedInside(BROKEN, '<div className="crew-row"', 'className="crew-toast"') === true);
  check('the fixed markup reads as OUTSIDE',
    renderedInside(OK, '<div className="crew-row"', 'className="crew-toast"') === false);
}

// ---------------------------------------------------------------------------
// 2) The real component.
{
  check('crew-toast is NOT inside .crew-row',
    renderedInside(crew, '<div className="crew-row"', 'className="crew-toast"') === false);
  check('both still exist', /className="crew-toast"/.test(crew) && /className="crew-row"/.test(crew));
}

// ---------------------------------------------------------------------------
// 3) THE PREMISE. This whole suite only matters while the ledge centres itself
//    with structural selectors — if that ever changes, these assertions are
//    guarding nothing and whoever reads this should know it. So assert the
//    premise too, and fail loudly rather than silently going vacuous.
{
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  check('the ledge still centres with :first-child/:last-child auto margins',
    /\.critter:first-child\s*\{[^}]*margin-left:\s*auto/.test(stripped)
    && /\.critter:last-child\s*\{[^}]*margin-right:\s*auto/.test(stripped));
  check('the loiter stagger is still :nth-child based',
    /\.critter:nth-child\(2n\)/.test(stripped));
  check('.crew-toast is positioned, so it does not need to live in the ledge',
    /\.crew-toast\s*\{[^}]*position:\s*fixed/.test(stripped));
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('crew bench: all checks passed');
