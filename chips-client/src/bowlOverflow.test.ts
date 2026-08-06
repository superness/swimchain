/**
 * A CENTRED OVERLAY COLUMN MUST BE ALLOWED TO SCROLL.
 *
 * Centring has a sharp edge: when the centred child grows taller than its
 * container, the overflow leaves BOTH ends, and a container with no
 * `overflow-y` gives the user no way to reach either end. The bottom end is
 * where this game keeps its buttons.
 *
 * Scoop's shop hit exactly this on 2026-08-04 ("impossible to close the shop
 * UI - even tapping outside of it didnt work") and the idiom that fixed it
 * lives on `.scoop-shop`: cap the column's height, let the column scroll. The
 * bowl reveal is the same shape and never got the idiom. On 2026-08-06 the
 * operator picked a jar for the crack to carry — which adds the kept-jar line
 * to the ledger and lengthens the tip button's label until the button row
 * wraps — and the offer's own commit button left the screen: "it bumps the
 * 'tip the bowl' button off the bottom of the UI and I can't click it or even
 * see it".
 *
 * So it is a rule, not a fix: every full-screen overlay that centres an
 * interactive column either scrolls itself, or caps that column and lets IT
 * scroll. The pairs are declared below, and the sweep at the end catches any
 * new centring overlay that is not declared — a pair list that drifts proves
 * nothing (see scripts/test-all.mjs for where that lesson comes from).
 *
 * Run: npx tsx src/bowlOverflow.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));

/** Bare single-class rules, all declaration blocks for a class concatenated —
 *  `.bowl-reveal` is declared twice (layout, then hush repaint) and both count.
 *  Comments are stripped so prose naming a class is not a rule. */
export function bareRules(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped))) {
    for (const raw of m[1].split(',')) {
      const sel = raw.trim().replace(/^.*[{}]\s*/, '');
      if (/^\.[a-zA-Z0-9_-]+$/.test(sel)) out.set(sel.slice(1), (out.get(sel.slice(1)) ?? '') + m[2]);
    }
  }
  return out;
}

/** Covers the screen: fixed, pinned on every side. */
export function isFullScreenOverlay(decls: string): boolean {
  if (!/position:\s*fixed/.test(decls)) return false;
  if (/inset:\s*0/.test(decls)) return true;
  return ['top', 'right', 'bottom', 'left'].every((s) => new RegExp(`${s}:\\s*0`).test(decls));
}

/** Centres its children — the grid way or the flex way. */
export function centres(decls: string): boolean {
  if (/place-items:\s*center/.test(decls)) return true;
  return /align-items:\s*center/.test(decls) && /justify-content:\s*center/.test(decls);
}

/** Can be scrolled at all. `hidden` is not scrolling — it is the trap itself. */
export function scrolls(decls: string): boolean {
  return /overflow(?:-y)?:\s*(?:auto|scroll)/.test(decls);
}

/** Height-capped, so overflow has somewhere definite to happen. */
export function capped(decls: string): boolean {
  return /(?:^|[;\s])(?:max-)?height:\s*[^;]+/.test(decls);
}

/** The invariant for one overlay/column pair. */
export function columnTrapped(overlay: string, column: string): boolean {
  if (!isFullScreenOverlay(overlay) || !centres(overlay)) return false;
  if (scrolls(overlay)) return false;                    // the overlay itself scrolls
  return !(capped(column) && scrolls(column));           // then the column must
}

/** Every overlay that centres something the user must reach, with the column
 *  it centres. Backdrop-and-sheet pairs that already carry the idiom are
 *  listed too: the invariant holds for all of them, and the list is what the
 *  completeness sweep below is checked against. */
export const PAIRS: [overlay: string, column: string][] = [
  ['bowl-reveal', 'bowl-copy'],
  ['porc', 'porc-words'],
  ['deep-screen', 'deep-words'],
  ['bottom', 'bottom-words'],
  ['sheet-backdrop', 'stall-sheet'],
  ['sheet-backdrop', 'scoop-shop'],
];

// ---------------------------------------------------------------------------
// 1) THE DETECTOR, against the exact shape that trapped the tip button. A
//    detector never shown the broken shape proves nothing.
{
  const BROKEN = `
    .bowl-reveal {
      position: fixed; inset: 0; z-index: 60;
      display: grid; place-items: center; padding: 20px;
    }
    .bowl-copy { position: relative; max-width: min(560px, 92vw); text-align: center; }
  `;
  const b = bareRules(BROKEN);
  check('the 2026-08-06 shape is caught',
    columnTrapped(b.get('bowl-reveal')!, b.get('bowl-copy')!));

  const FIXED = BROKEN.replace(
    'text-align: center; }',
    'text-align: center; max-height: calc(100dvh - 40px); overflow-y: auto; }',
  );
  check('the fixture actually changed', FIXED !== BROKEN);
  const f = bareRules(FIXED);
  check('capping the column clears it',
    !columnTrapped(f.get('bowl-reveal')!, f.get('bowl-copy')!));

  // A cap without scroll just clips in a different place; scroll without a cap
  // never engages. Each alone must still be caught.
  const CAP_ONLY = bareRules(BROKEN.replace('text-align: center; }', 'text-align: center; max-height: 84dvh; }'));
  check('a cap with no overflow is still trapped',
    columnTrapped(CAP_ONLY.get('bowl-reveal')!, CAP_ONLY.get('bowl-copy')!));
  const SCROLL_ONLY = bareRules(BROKEN.replace('text-align: center; }', 'text-align: center; overflow-y: auto; }'));
  check('overflow with no cap is still trapped',
    columnTrapped(SCROLL_ONLY.get('bowl-reveal')!, SCROLL_ONLY.get('bowl-copy')!));

  // An overlay that scrolls itself (the `.boards-panel` way) needs nothing
  // from its column.
  check('a self-scrolling overlay is fine',
    !columnTrapped('position: fixed; inset: 0; display: flex; justify-content: center; align-items: center; overflow-y: auto;', 'width: 100%;'));

  // `overflow: hidden` on the overlay is the trap, not an exit.
  check('overflow: hidden does not count as scrolling',
    columnTrapped('position: fixed; inset: 0; place-items: center; overflow: hidden;', 'max-width: 30em;'));
}

// ---------------------------------------------------------------------------
// 2) THE REAL STYLESHEET. Every declared pair, one verdict each.
const RULES = bareRules(readFileSync(join(HERE, 'styles.css'), 'utf8'));
{
  for (const [overlay, column] of PAIRS) {
    const o = RULES.get(overlay), c = RULES.get(column);
    check(`.${overlay} exists`, o !== undefined);
    check(`.${column} exists`, c !== undefined);
    if (o === undefined || c === undefined) continue;
    // If the overlay stops reading as a centring full-screen overlay this pair
    // is stale, and a stale pair silently guards nothing — so that is a
    // failure too, not an exemption.
    check(`.${overlay} still reads as a centring full-screen overlay`,
      isFullScreenOverlay(o) && centres(o));
    check(`.${column} cannot be trapped inside .${overlay}`, !columnTrapped(o, c),
      { capped: capped(c), scrolls: scrolls(c) });
  }
}

// ---------------------------------------------------------------------------
// 3) COMPLETENESS. Any centring full-screen overlay the user can touch must be
//    in PAIRS — a new one added without a declared column re-creates this bug
//    unguarded. `pointer-events: none` overlays (the tip ceremony, the ambient
//    layers) centre nothing reachable and are exempt; so are overlays that
//    scroll themselves.
{
  const declared = new Set(PAIRS.map(([o]) => o));
  const missing = [...RULES]
    .filter(([, d]) => isFullScreenOverlay(d) && centres(d))
    .filter(([, d]) => !/pointer-events:\s*none/.test(d))
    .filter(([, d]) => !scrolls(d))
    .filter(([cls]) => !declared.has(cls))
    .map(([cls]) => cls);
  check('every touchable centring overlay is declared in PAIRS', missing.length === 0, missing);
  check('the sweep actually examined something',
    [...RULES].filter(([, d]) => isFullScreenOverlay(d) && centres(d)).length >= PAIRS.length - 1);
}

// ---------------------------------------------------------------------------
// 4) THE MARKUP SIDE. A pair only guards anything if the column really is the
//    thing rendered inside that overlay — assert each pair co-occurs in a
//    component, overlay first.
{
  const files = readdirSync(HERE).filter((f) => f.endsWith('.tsx'));
  for (const [overlay, column] of PAIRS) {
    const holds = files.some((f) => {
      const src = readFileSync(join(HERE, f), 'utf8');
      const i = src.indexOf(`className="${overlay}"`);
      return i >= 0 && src.indexOf(`className="${column}"`) > i;
    });
    check(`some component renders .${column} inside .${overlay}`, holds);
  }
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('bowl overflow: all checks passed');
