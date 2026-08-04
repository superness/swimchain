/**
 * A FULL-SCREEN OVERLAY MUST NOT BE RENDERED INSIDE A CONTAINING BLOCK.
 *
 * `position: fixed; inset: 0` means "the viewport" only while no ancestor has
 * turned itself into a containing block for fixed descendants. `transform` does
 * that, and so — less famously — do the individual `translate`, `rotate` and
 * `scale` properties, plus `filter`, `perspective`, `contain` and
 * `will-change`. When one of them is above you, `inset: 0` silently stops
 * meaning the screen and starts meaning that ancestor's box.
 *
 * `.crier` is `position: fixed; translate: -50% 0` — a centred column. Three
 * takeovers were rendered inside it: the deep fight, scoop's shop, and the
 * bottom of the bowl. Measured at 448x899, `.deep-screen` computed to
 * **412x40 at (18,744)** inside the crier against **448x899 at (0,0)** outside
 * it. A forty-pixel sliver.
 *
 * That is why the deep fight appeared to have no backdrop at all — the backdrop
 * was there, it was just forty pixels tall (operator, 2026-08-04: "the
 * background is just transparent? very hard to read"). And it is the real
 * reason scoop's shop could not be dismissed by tapping outside it:
 * `.sheet-backdrop` was confined the same way, so there was no backdrop outside
 * the shop left to receive the tap. The `88vh -> 84dvh` change in #290 treated
 * a symptom of this and did not touch the cause.
 *
 * Nothing about this is visible in review. The markup reads perfectly sensibly,
 * the CSS reads perfectly sensibly, and the bug lives in the relationship
 * between them. So it gets a test.
 *
 * Run: npx tsx src/overlayContainment.test.ts
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
const css = readFileSync(join(HERE, 'styles.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');   // transforms in keyframes are not containing blocks

/** Bare single-class rules only: `.x { ... }`. Pseudo-classes and compounds are
 *  deliberately out of scope — a `:hover` transform is transient, and the
 *  question here is about the static tree. */
function bareRules(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    for (const raw of m[1].split(',')) {
      const sel = raw.trim().replace(/^.*[{}]\s*/, '');
      if (/^\.[a-zA-Z0-9_-]+$/.test(sel)) out.set(sel.slice(1), (out.get(sel.slice(1)) ?? '') + m[2]);
    }
  }
  return out;
}

const RULES = bareRules(css);

/** Covers the screen: fixed, pinned on every side. */
export function isFullScreenOverlay(decls: string): boolean {
  if (!/position:\s*fixed/.test(decls)) return false;
  if (/inset:\s*0/.test(decls)) return true;
  return ['top', 'right', 'bottom', 'left'].every((s) => new RegExp(`${s}:\\s*0`).test(decls));
}

/** Turns itself into a containing block for fixed descendants. */
export function makesContainingBlock(decls: string): string | null {
  for (const prop of ['transform', 'translate', 'rotate', 'scale', 'perspective', 'filter', 'backdrop-filter', 'will-change', 'contain']) {
    const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*([^;]+)`).exec(decls);
    if (m && !/^\s*(none|normal)\s*$/.test(m[1])) return `${prop}: ${m[1].trim()}`;
  }
  return null;
}

const overlayClasses = [...RULES].filter(([, d]) => isFullScreenOverlay(d)).map(([c]) => c);
const cbClasses = new Map([...RULES].filter(([, d]) => makesContainingBlock(d)).map(([c, d]) => [c, makesContainingBlock(d)!]));

// ---------------------------------------------------------------------------
// 1) The detectors, against the exact pair that caused this.
{
  check('.deep-screen reads as a full-screen overlay', overlayClasses.includes('deep-screen'), overlayClasses);
  check('.sheet-backdrop reads as a full-screen overlay', overlayClasses.includes('sheet-backdrop'));
  check('.bottom reads as a full-screen overlay', overlayClasses.includes('bottom'));
  check('.crier reads as a containing block', cbClasses.has('crier'), cbClasses.get('crier'));
  check('...specifically because of `translate`', (cbClasses.get('crier') ?? '').startsWith('translate:'), cbClasses.get('crier'));
  // A plain fixed box is NOT a containing block — that distinction is the
  // entire subtlety, and a detector that misses it would flag everything.
  check('a plain `position: fixed` ancestor is not one',
    makesContainingBlock('position: fixed; inset: 0;') === null);
}

// ---------------------------------------------------------------------------
// 2) Which components render an overlay root.
const overlayComponents = new Map<string, string>();
for (const file of readdirSync(HERE).filter((f) => f.endsWith('.tsx') && f !== 'App.tsx' && f !== 'main.tsx')) {
  const src = readFileSync(join(HERE, file), 'utf8');
  for (const cls of overlayClasses) {
    if (new RegExp(`className="${cls}"`).test(src)) {
      for (const name of src.matchAll(/export function ([A-Z]\w+)/g)) overlayComponents.set(name[1], cls);
    }
  }
}
{
  check('DeepFightScreen is known to render an overlay', overlayComponents.has('DeepFightScreen'), [...overlayComponents]);
  check('ScoopShop is known to render an overlay', overlayComponents.has('ScoopShop'));
  check('TheBottom is known to render an overlay', overlayComponents.has('TheBottom'));
}

// ---------------------------------------------------------------------------
// 3) THE INVARIANT. For every containing-block element in App.tsx, nothing
//    that covers the screen may be rendered inside it.
{
  const app = readFileSync(join(HERE, 'App.tsx'), 'utf8');

  /** The JSX between `<div className="cls">` and its matching `</div>`. */
  function blockOf(src: string, cls: string): string | null {
    const open = `<div className="${cls}">`;
    const i = src.indexOf(open);
    if (i < 0) return null;
    let depth = 0;
    for (const m of src.slice(i).matchAll(/<div\b|<\/div>/g)) {
      if (m[0] === '</div>') { depth--; if (depth === 0) return src.slice(i, i + m.index! + 6); }
      else depth++;
    }
    return null;
  }

  let checked = 0;
  for (const [cls, why] of cbClasses) {
    const block = blockOf(app, cls);
    if (block === null) continue;
    checked++;
    const trapped: string[] = [];
    for (const [comp, root] of overlayComponents) {
      if (new RegExp(`<${comp}[\\s/>]`).test(block)) trapped.push(`<${comp}> (.${root})`);
    }
    for (const oc of overlayClasses) {
      if (new RegExp(`className="${oc}"`).test(block)) trapped.push(`.${oc}`);
    }
    check(`nothing full-screen is rendered inside .${cls} [${why}]`, trapped.length === 0, trapped);
  }
  check('the invariant actually examined something', checked > 0, { checked, cbClasses: [...cbClasses.keys()] });
}

console.log('');
if (failures > 0) { console.error(`${failures} checks failed`); process.exit(1); }
console.log('overlay containment: all checks passed');
