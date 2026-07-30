/**
 * THE ARTIFACT, NOT THE SOURCE — what `dist/` actually contains after a
 * production build, checked against the one rule that decides whether this
 * client's styling survives being shipped. Run:
 * npx tsx src/ui/shippedStyles.test.ts
 *
 * ## THE DEFECT THIS FILE EXISTS FOR, AND WHY NOTHING ELSE COULD SEE IT
 *
 * `TheEdge`'s boundary — the first screen a swimmer nobody has vouched for
 * ever sees — shipped UNSTYLED. Black serif text in the top-left corner of a
 * dark sea, nearly unreadable, over a game that was otherwise drawing
 * correctly (`docs/plan4b-task-4-fix1-edge-unsponsored.png`). In `npm run dev`
 * it was a centred, styled overlay. The whole suite was green.
 *
 * The mechanism is three steps and none of them is a bug:
 *
 *   1. `inject_nonce_token` (tauri-utils-2.9.3/src/html2.rs:75) stamps
 *      `nonce="…"` on EVERY `<style>` element it finds in the built
 *      `index.html`;
 *   2. `replace_csp_nonce` (tauri-2.11.5/src/manager/mod.rs:96) appends the
 *      matching `'nonce-…'` source to the `style-src` directive it serves;
 *   3. CSP3 §6.7.3.2 is explicit that a source list containing a nonce IGNORES
 *      `'unsafe-inline'`.
 *
 * So `index.html`'s own three-line `html, body { margin: 0 }` reset — which has
 * nothing whatever to do with the boundary — withdrew permission from every
 * `<style>` element React would later create, and one of those was the
 * boundary's. A change in one file silently unstyled a component in another.
 *
 * NO EXISTING CHECK COULD HAVE SEEN IT, and that is structural rather than an
 * oversight. `App.test.ts` drives the real component in jsdom, and jsdom
 * implements no CSP at all — a dropped `<style>` and an applied one are the
 * same DOM to it. `npm run dev` serves through Vite, which applies none of
 * Tauri's asset pipeline. The only two things that behave like the shipped app
 * are the shipped app and this file.
 *
 * ## SO THIS FILE CHECKS THE INVARIANT, NOT THE SYMPTOM
 *
 * "The boundary looks right" is not something a test can assert without a
 * browser and a real CSP. What it CAN assert is the property the whole failure
 * turns on, which is narrower and completely mechanical:
 *
 *   NOTHING IN `dist/` IS STYLED INLINE.
 *
 * No `<style>` element in the HTML (so Tauri stamps no nonce and
 * `'unsafe-inline'` is never withdrawn), and no `<style>` element constructed
 * by the JavaScript (so nothing depends on `'unsafe-inline'` even if it
 * survives). Both halves matter and either one alone would have passed for the
 * build that shipped broken.
 *
 * It also checks the positive: that the boundary's rules are IN the emitted
 * stylesheet and that the stylesheet is linked. An invariant about what is
 * absent is worth nothing if the styling went absent with it.
 *
 * ## IT BUILDS RATHER THAN READING WHAT IS THERE
 *
 * `dist/` is gitignored, may be missing, and may be stale from a build made
 * before the change under test. A check that read whatever happened to be on
 * disk would pass or fail for reasons unrelated to the working tree. So this
 * runs `vite build` itself. That costs a few seconds, and it is the only way
 * the artifact it judges is the artifact this source produces.
 *
 * ## WHAT THIS DOES NOT COVER
 *
 * Inline style ATTRIBUTES (`style={…}`, which `App.tsx` and `Diagnostics.tsx`
 * use throughout) are NOT checked here, because they demonstrably still apply
 * in a shipped build — the diagnostics panel, which is positioned and
 * laid out entirely by them, renders correctly in the installed artifact. They
 * are a different CSP directive (`style-src-attr`, which falls back to
 * `style-src` but takes no nonce) and Chromium does not withdraw them here. If
 * that ever changes it will not be subtle: the game will have no layout at all,
 * rather than one component quietly losing its own.
 */
import { build } from 'vite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** How long the boundary stays in the tree after it stops being true. Imported
 *  rather than retyped: the whole point of the check that reads it is that the
 *  stylesheet's own number has to fit inside this one. */
import { CROSSING_MS } from './wayIn';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
/** Its own output directory, so a run of this file never disturbs the `dist/`
 *  a developer or `tauri build` is holding. */
const OUT = resolve(ROOT, 'node_modules/.cache/shoal-shipped-styles');

/**
 * Every `<style>` element in a document, by the same shape Tauri's own
 * selector matches (`inject_nonce("style")`) — the opening tag, however it is
 * spelled. `<link rel="stylesheet">` is a different element and is the thing
 * this file wants to find, so it must not be caught here.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not a convenience. Tauri parses the
 * document (`dom_query`) and stamps nonces on ELEMENTS; text inside a comment
 * is not one, and neither is it served as anything. This check found its own
 * first version wrong on exactly that point — `index.html`'s new comment
 * explains the rule by naming the tag, and a raw scan counted the explanation
 * as two violations of itself.
 */
function styleElements(html: string): string[] {
  return html.replace(/<!--[\s\S]*?-->/g, '').match(/<style\b[^>]*>/gi) ?? [];
}

async function main(): Promise<void> {
  console.log('\nbuilding dist/ the way `tauri build` does...');
  await build({
    root: ROOT,
    logLevel: 'silent',
    build: { outDir: OUT, emptyOutDir: true, sourcemap: false },
  });

  const html = readFileSync(join(OUT, 'index.html'), 'utf8');
  const assets = readdirSync(join(OUT, 'assets'));
  const js = assets.filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(OUT, 'assets', f), 'utf8')).join('\n');
  const cssFiles = assets.filter((f) => f.endsWith('.css'));
  const css = cssFiles.map((f) => readFileSync(join(OUT, 'assets', f), 'utf8')).join('\n');

  // =========================================================================
  console.log('\n1. THE SHIPPED HTML CARRIES NO INLINE STYLE');
  // =========================================================================
  //
  // The exact condition that makes Tauri stamp a nonce and, by doing so,
  // withdraw `'unsafe-inline'` from the whole page. One `<style>` element here
  // is all it took.
  {
    const found = styleElements(html);
    check('dist/index.html contains no <style> element',
      found.length === 0, found);
    // NON-DEGENERACY. The regex has to be able to find one, or the check above
    // is a check that a regex is broken.
    check('NON-DEGENERACY: the same scan does find one when there is one',
      styleElements('<head><style nonce="1">a{}</style></head>').length === 1);
    // ...and must not find one that is only being talked about. This is the
    // case that made the first version of this file fail against a correct
    // build; see `styleElements`.
    check('NON-DEGENERACY: and does not count one inside a comment',
      styleElements('<head><!-- never write a <style> block here --></head>').length === 0);
  }

  // =========================================================================
  console.log('\n2. THE STYLING IS THERE, AS A LINKED STYLESHEET');
  // =========================================================================
  //
  // The other half. "No inline styles" is satisfied perfectly by a build with
  // no styling in it at all, which is precisely the broken state this file was
  // written about.
  {
    check('dist/index.html links a stylesheet',
      /<link[^>]+rel=["']stylesheet["']/i.test(html), html.slice(0, 400));
    check('...and exactly one stylesheet was emitted to link to',
      cssFiles.length === 1, cssFiles);

    // THE BOUNDARY'S OWN RULES, BY NAME. These are the ones whose absence is
    // visible in the screenshot: the copy was neither centred nor positioned
    // (`shoal-edge-copy`), the title had no font and no colour
    // (`shoal-edge-title`), and the water was not dimmed (`shoal-edge-below`).
    //
    // THE LIFT IS ON THE LIST FOR THE SAME REASON AND A SHARPER ONE. It is the
    // payoff of the whole newcomer arc, it is a picture with no words in it, and
    // it is drawn ENTIRELY by these rules — a build that shipped without them
    // would not look wrong, it would look like nothing happening, which is the
    // one failure a player cannot report.
    for (const rule of [
      '.shoal-edge', '.shoal-edge-copy', '.shoal-edge-title', '.shoal-edge-body',
      '.shoal-edge-below', '.shoal-edge-line',
      '.shoal-edge--lifting', '.shoal-edge-swell',
    ]) {
      check(`the emitted stylesheet carries ${rule}`, css.includes(rule));
    }
    // `@keyframes` and `@media (prefers-reduced-motion)` are the two things a
    // style attribute cannot express and are the whole reason the boundary
    // needed a stylesheet rather than an inline object.
    check('...its keyframes', css.includes('@keyframes') && css.includes('shoal-edge-rise')
      && css.includes('shoal-edge-drain') && css.includes('shoal-edge-swell'));
    check('...and its reduced-motion rule', css.includes('prefers-reduced-motion'));

    // THE SURROGATE FISH IS GONE FROM THE ARTIFACT, not merely from the source.
    // It drew one small pale fish circling below the line and its comment called
    // it "the player", which stopped being true the moment the shallows went
    // underneath and the player got a real fish of their own. Asserted against
    // `dist/` rather than by reading `theEdge.css`, because a check on the source
    // is a check on the file this build was supposed to have used.
    for (const gone of ['shoal-edge-orbit', 'shoal-edge-circle', 'shoal-edge-beat']) {
      check(`...and nothing of the surrogate fish survives: no ${gone}`,
        !css.includes(gone) && !js.includes(gone));
    }

    // THE ONE VALUE TWO FILES SHARE, AND THE ONLY PLACE THEY CAN BE COMPARED.
    //
    // `theEdge.css` times the lift with `--shoal-edge-lift-ms`; `wayIn.ts` keeps
    // the component in the tree for `CROSSING_MS` and nothing else. Neither file
    // can see the other, and getting them the wrong way round has exactly one
    // symptom: the moment this whole arc exists for is cut off in mid-air, on a
    // surface no unit test renders. So the emitted stylesheet is READ and its
    // number held under the TypeScript one.
    const lift = /--shoal-edge-lift-ms:\s*([\d.]+)(ms|s)\b/.exec(css);
    check('the emitted stylesheet states how long the lift takes',
      lift !== null, css.slice(0, 200));
    const liftMs = lift === null ? -1 : Number(lift[1]) * (lift[2] === 's' ? 1000 : 1);
    check('...and the moment outlasts it, so the lift is never cut off in mid-air',
      liftMs > 0 && liftMs <= CROSSING_MS, { liftMs, CROSSING_MS });
    // NON-DEGENERACY: the reader has to be able to find a number at all, and to
    // read the seconds spelling a CSS minifier may have rewritten it into.
    check('NON-DEGENERACY: the same reader finds it written in ms and in s',
      /--shoal-edge-lift-ms:\s*([\d.]+)(ms|s)\b/.exec('a{--shoal-edge-lift-ms:2400ms}')?.[1] === '2400'
      && /--shoal-edge-lift-ms:\s*([\d.]+)(ms|s)\b/.exec('a{--shoal-edge-lift-ms: 2.4s}')?.[2] === 's');

    // The window reset, which used to be inline in index.html.
    check('...and the window reset that used to sit inline in the HTML',
      /html\s*,\s*body\s*\{[^}]*margin\s*:\s*0/i.test(css), css.slice(0, 200));
  }

  // =========================================================================
  console.log('\n3. NOTHING IN THE JAVASCRIPT BUILDS A <style> ELEMENT');
  // =========================================================================
  //
  // A `<style>` React creates at runtime carries no nonce and cannot be given
  // one, so it is dropped whenever anything else on the page has caused a
  // nonce to be added. It is not enough that the HTML is clean today: the
  // build that shipped broken had exactly this, and no check to say so.
  //
  // Both spellings are scanned. The React automatic runtime compiles
  // `<style>{CSS}</style>` to `jsx("style",{children:…})`, and hand-written
  // DOM code would use `createElement("style")`.
  {
    const jsxStyle = js.match(/jsxs?\(\s*["']style["']/g) ?? [];
    check('no JSX <style> element in the bundle', jsxStyle.length === 0, jsxStyle);

    const domStyle = js.match(/createElement\(\s*["']style["']\s*\)/g) ?? [];
    check('no document.createElement("style") in the bundle', domStyle.length === 0, domStyle);

    // NON-DEGENERACY for both, on the exact text a real one compiles to. A
    // pattern that cannot match is a check that cannot fail, and this section
    // is otherwise two assertions that a `match` returned null.
    check('NON-DEGENERACY: the JSX scan matches what React actually emits',
      (('N.jsx("style",{children:eE})').match(/jsxs?\(\s*["']style["']/g) ?? []).length === 1);
    check('NON-DEGENERACY: the DOM scan matches what handwritten code emits',
      ((`document.createElement('style')`).match(/createElement\(\s*["']style["']\s*\)/g) ?? []).length === 1);
  }

  // =========================================================================
  console.log('\n4. THE CSP THE FIX DEPENDS ON IS STILL THE ONE THAT SHIPS');
  // =========================================================================
  //
  // A linked stylesheet is served from Tauri's own asset protocol, which is
  // `'self'`. Everything above is worth nothing if `style-src` stops allowing
  // it — and unlike the inline case, THAT failure would be total and obvious,
  // so this is a cheap guard rather than the point of the file.
  {
    const conf = JSON.parse(readFileSync(resolve(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      app: { security: { csp: string } };
    };
    const csp = conf.app.security.csp;
    const styleSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('style-src'));
    check('tauri.conf.json still declares a style-src', styleSrc !== undefined, csp);
    check('...and it allows the stylesheet this client links',
      styleSrc !== undefined && styleSrc.includes("'self'"), styleSrc);
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
