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
import { dockHeight, type DockBox } from './dock';

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

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('dock: all checks passed');
