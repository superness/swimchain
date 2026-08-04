/**
 * The measured bottom dock (lib/dock.ts).
 *
 * The numbers below are the real ones. Phone case: 390x740, `--safe` 0, so the
 * stack is floor-stack 16 + boards 46 + bench 43 = 105px of furniture, and the
 * chat strip sits on top of it — one line ~31px, two lines ~48px. The old
 * constant reserved 240px for all of that, which was generous until a banner
 * or a long line of dialogue pushed past it and landed on the crumbs readout.
 *
 * Run: npx tsx src/lib/dock.test.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { dockHeight, DOCKED_SELECTORS, type DockBox } from './dock';

const HERE = dirname(fileURLToPath(import.meta.url));

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const VH = 740;
/** A box docked `bottom` px above the viewport's bottom edge. */
const at = (bottom: number, height: number): DockBox => ({ top: VH - bottom - height, height });

// ---------------------------------------------------------------------------
// 1) It measures to the TOP of the tallest thing in the stack, not to the
//    nearest one. The bench is lower but the strip above it is what actually
//    reaches into the column.
{
  const bench = at(62, 43);       // bottom: 16 + 46
  const toast = at(105, 31);      // one line, riding the bench
  const d = dockHeight([bench, toast], VH);
  check('reserves to the top of the strip, not the bench', d === 105 + 31 + 8, d);

  const twoLines = at(105, 48);
  check('a longer line reserves more', dockHeight([bench, twoLines], VH)! > d!, dockHeight([bench, twoLines], VH));
}

// ---------------------------------------------------------------------------
// 2) IT TRACKS THE STACK. This is the whole point — not that any particular
//    configuration beats 240px, but that the reservation follows what is
//    actually there instead of asserting a number about it.
//
//    Whether the stack clears 240 depends entirely on content: bench + a
//    two-line strip measures 161, and the tutorial banner has to reach about
//    120px tall (roughly four wrapped lines at 12px/1.45 plus its padding)
//    before the old constant is beaten at all. So the constant was not simply
//    "too small" — it was UNRELATED, right by luck at some line lengths and
//    wrong at others, which is exactly how a layout bug becomes intermittent.
{
  const bench = at(62, 43);
  const strip = at(105, 48);
  const shortBanner = at(113, 60);
  const tallBanner = at(113, 124);

  const quiet = dockHeight([bench], VH)!;
  const talking = dockHeight([bench, strip], VH)!;
  const banner = dockHeight([bench, strip, shortBanner], VH)!;
  const bigBanner = dockHeight([bench, strip, tallBanner], VH)!;

  check('each thing added to the dock raises the reservation',
    quiet < talking && talking < banner && banner < bigBanner, { quiet, talking, banner, bigBanner });
  check('the old 240 was too LARGE for a quiet screen', quiet < 240, quiet);
  check('...and too SMALL once a tall banner is up', bigBanner > 240, bigBanner);
  check('...and every one of them is a sane reservation', bigBanner < VH * 0.55, bigBanner);
}

// ---------------------------------------------------------------------------
// 3) THE TRAP. `.crier` pins top AND bottom, so it stretches nearly the whole
//    screen. Counting it would reserve ~676px of a 740px viewport and the
//    column would vanish. This is the assertion the whole module exists for.
{
  const crier: DockBox = { top: 64, height: VH - 64 - 113 };   // pinned both ends
  const bench = at(62, 43);
  const withCrier = dockHeight([bench, crier], VH);
  const without = dockHeight([bench], VH);
  check('a box pinned at both ends is not dock furniture', withCrier === without, { withCrier, without });
  check('...so the column is not collapsed', withCrier! < VH * 0.5, withCrier);
}

// ---------------------------------------------------------------------------
// 4) Degenerate inputs must fall back rather than invent a number — the CSS
//    still carries `240px` for exactly this case.
{
  check('nothing docked -> null', dockHeight([], VH) === null);
  check('display:none boxes -> null', dockHeight([{ top: 0, height: 0 }], VH) === null);
  check('zero viewport -> null', dockHeight([at(62, 43)], 0) === null);
  check('a box entirely above the viewport is ignored',
    dockHeight([{ top: -200, height: 40 }], VH) === null);
}

// ---------------------------------------------------------------------------
// 5) The hard ceiling. Even a stack of legitimately-short boxes reaching up the
//    screen cannot reserve more than MAX_RESERVE.
{
  const tall = [at(62, 43), { top: 20, height: 300 }];
  const d = dockHeight(tall, VH)!;
  check('the reservation is clamped', d === Math.round(VH * 0.55), d);
}

// ---------------------------------------------------------------------------
// 6) THE RUNGS OF THE BOTTOM STACK.
//
//    `--bench-h: clamp(38px, 11vw, 52px)` resolves to 49px at 448px wide. The
//    bench measures 91px — a critter is `clamp(60px, 16vw, 84px)` before its
//    name pill and the ledge's padding. So the chat strip, positioned off that
//    constant, sat 42px too low: measured toast bottom 793 against bench top
//    746, i.e. ON the critters and on the `buy` tags at their top edge. The
//    crier then added a hand-picked 44px to the same wrong base with no
//    allowance for the strip's height, and landed on the strip.
//
//    Measured, the same three boxes clear each other: toast 697-745 under a
//    bench topping at 746, crier 610-684 under a strip topping at 697.
{
  const css = readFileSync(join(HERE, '..', 'styles.css'), 'utf8');

  check('the stack is driven by measured rungs, not the raw constant',
    /--rung-bench:\s*var\(--bench-real/.test(css) && /--rung-toast:\s*var\(--toast-real/.test(css));

  /** The `bottom: calc(...)` a selector is positioned by, found by plain
   *  string search. Built regexes kept losing their backslashes through the
   *  template literal and silently matching nothing, which is a test that
   *  passes for the wrong reason waiting to happen. */
  function bottomCalcOf(sel: string): string | null {
    const at = css.indexOf(`.${sel} { bottom: calc(`);
    if (at < 0) return null;
    const open = css.indexOf('calc(', at) + 'calc('.length;
    let depth = 1;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '(') depth++;
      else if (css[i] === ')' && --depth === 0) return css.slice(open, i);
    }
    return null;
  }

  // The strip must clear the bench, and the crier must clear BOTH. If any of
  // these goes back to reading `--bench-h` directly, the overlap returns.
  // NOT `bowl-ticket`: it is a static column card, so it has no `bottom` at
  // all — see the check further down that it must not grow one back.
  for (const sel of ['crew-toast', 'crier', 'tut-banner']) {
    const calc = bottomCalcOf(sel);
    check(`.${sel} positions off the measured bench`, calc !== null && calc.includes('--rung-bench'), calc);
  }
  for (const sel of ['crier', 'tut-banner']) {
    const calc = bottomCalcOf(sel);
    check(`.${sel} also clears the chat strip`, calc !== null && calc.includes('--rung-toast'), calc);
  }
  check('the chat strip itself does NOT reserve for itself',
    (bottomCalcOf('crew-toast') ?? '').includes('--rung-toast') === false);

  // The constants stay as the before-measurement fallback — removing them
  // would leave the stack at 0 for the first frame.
  check('the constant survives as a fallback', /--bench-real,\s*var\(--bench-h\)\)/.test(css));

  // THE CRIER'S BANNERS ARE PART OF THE STACK. The crier pins top AND bottom on
  // a phone, so its own box is thrown out by the STRETCHED rule above — but its
  // children are real boxes above the chat strip, and nothing reserved for
  // them. Measured at 448x899: `--dock-h` came out 199px against the 281px the
  // visible stack occupies, leaving 82px the counter column could run into,
  // which is where the bowl ticket meets the deep-fight call.
  const docked: readonly string[] = DOCKED_SELECTORS;
  check('the dock reserves for the crier CONTENTS', docked.includes('.crier > *'),
    [...DOCKED_SELECTORS]);
  check('...and never for the crier itself, which is pinned at both ends',
    !docked.includes('.crier'), [...DOCKED_SELECTORS]);

  // The ticket is a static column card. A `bottom` on it does nothing, and one
  // sat here for two rounds of edits looking like it did.
  check('no dead `bottom` offset on the bowl ticket',
    bottomCalcOf('bowl-ticket') === null, bottomCalcOf('bowl-ticket'));
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('dock: all checks passed');
