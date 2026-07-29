/**
 * THE SHIPPED CONFIGURATION — the values in `src-tauri/tauri.conf.json` that
 * the packaged application depends on and that no other check in this project
 * can see. Run:
 * npx tsx src/ui/shippedConfig.test.ts
 *
 * ## WHY THIS FILE EXISTS, AND IT IS THE SECOND TIME
 *
 * `shippedStyles.test.ts` was written because `TheEdge`'s stylesheet was
 * dropped in a packaged build and the whole suite stayed green — a value that
 * only matters in the artifact, with nothing able to observe it. The review
 * that followed found the SAME SHAPE one level up and proved it the same way:
 *
 *   - `app.withGlobalTauri` flipped to `false` → **1939 checks, 33 files, exit
 *     0.** Entirely green. A packaged build would never have reached water and
 *     would never have retried;
 *   - `connect-src` narrowed to `'self'` → green as well.
 *
 * Neither is a defect a reviewer should have to find twice, so this file closes
 * the class rather than the two instances: every key below is one where a wrong
 * value produces a BUILD THAT COMPILES, PACKAGES AND INSTALLS, and then does
 * not work — with nothing on screen and nothing in the suite to say why.
 *
 * ## WHAT IS DELIBERATELY *NOT* GUARDED, AND WHY
 *
 * A guard on a value that already fails loudly is noise that makes the real
 * guards harder to read. Checked and left alone:
 *
 *   - `build.frontendDist` — a wrong path fails AT BUILD TIME, in
 *     `generate_context!` and again in `build.rs`'s `check_frontend_dist`. It
 *     cannot ship broken.
 *   - `app.windows[0]`'s size and title — cosmetic. A wrong value is visible in
 *     the first second of looking at the app, which is the opposite of this
 *     class.
 *   - `identifier` / `productName` — they look like they should decide where a
 *     player's identity lives, and they do not: the data directory is the
 *     hardcoded string `"the-shoal"` in `src-tauri/src/main.rs:285`. Verified
 *     rather than assumed, because if it HAD been derived from these, changing
 *     one would silently orphan every existing player.
 *   - `src-tauri/capabilities/default.json` — I could not establish a concrete
 *     failure for it. Tauri v2 capabilities gate PLUGIN commands, and
 *     `get_rpc_config` is an app command registered through `generate_handler!`,
 *     which they do not gate. Guarding it would have asserted a dependency I
 *     had not demonstrated. Named here so the next reader knows it was looked
 *     at and left, rather than missed.
 *   - `style-src` — guarded, but in `shippedStyles.test.ts` section 4, where the
 *     fix that depends on it lives. It is not repeated here: one value, one
 *     home. Every OTHER directive of the same CSP is below.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CONF = resolve(HERE, '../../src-tauri/tauri.conf.json');

interface TauriConf {
  build: { beforeBuildCommand?: string; frontendDist?: string };
  app: { withGlobalTauri?: boolean; security: { csp?: string } };
  bundle: { active?: boolean; targets?: string | string[]; resources?: string[] };
}

/**
 * The CSP as a directive → sources map.
 *
 * Split on `;` and then on whitespace, which is exactly what the header is:
 * Tauri serves this string verbatim (having appended its own nonce sources —
 * see `shippedStyles.test.ts`), so parsing it this way is reading the artifact,
 * not modelling it.
 */
function directives(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const words = part.trim().split(/\s+/).filter((w) => w !== '');
    if (words.length === 0) continue;
    out.set(words[0], words.slice(1));
  }
  return out;
}

const conf = JSON.parse(readFileSync(CONF, 'utf8')) as TauriConf;

// ===========================================================================
console.log('\n1. THE SHELL HANDS THE GAME ITS NODE — `withGlobalTauri`');
// ===========================================================================
//
// The one the review flipped. `src/lib/shoalRpc.ts:43`, `src/ui/shellConfig.ts:193`
// and `src-tauri/src/main.rs:20` all state in PROSE that this must stay true;
// prose is not a check, and that is the entire lesson of this file.
//
// What false costs: Tauri injects no `window.__TAURI__`, `shellSurface()`
// returns `null`, and `App.tsx`'s `ask()` returns on its very first line —
// which is correct behaviour for a browser tab and catastrophic for a packaged
// app, because that early return is also what stops the retry. No RPC, no
// error, no second attempt. The offline sea, forever, in a build whose whole
// purpose is that somebody can install it and play.
{
  check('app.withGlobalTauri is true — the game reaches its node through the global Tauri injects',
    conf.app.withGlobalTauri === true, conf.app.withGlobalTauri);
}

// ===========================================================================
console.log('\n2. THE GAME MAY TALK TO ITS OWN NODE — `connect-src`');
// ===========================================================================
//
// The second one the review narrowed. Every one of these is a call the client
// makes on the ordinary path to water; a CSP that omits one produces a build in
// which the corresponding half of the game silently does nothing.
{
  const csp = conf.app.security.csp ?? '';
  const connect = directives(csp).get('connect-src') ?? [];

  // JSON-RPC. `shoalRpc.rpcCall` POSTs to the endpoint the shell handed over,
  // which is always `http://127.0.0.1:<port>` (`src-tauri/src/main.rs`).
  check("connect-src allows http://127.0.0.1:* — every JSON-RPC call the client makes",
    connect.includes('http://127.0.0.1:*'), connect);

  // The live socket. `shoalLive.ts:401-410` builds `ws://<host>/ws` from the
  // same endpoint, and it is how a swimmer sees anyone else move.
  check("connect-src allows ws://127.0.0.1:* — the live socket the sea reads from",
    connect.includes('ws://127.0.0.1:*'), connect);

  // Tauri v2's own IPC transport, which `invoke('get_rpc_config')` rides. On
  // Windows that is the `http://ipc.localhost` custom protocol; `ipc:` is the
  // scheme on the other platforms this bundles for (`bundle.targets: "all"`).
  check("connect-src allows Tauri's IPC transport, so `invoke` itself can run",
    connect.includes('ipc:') && connect.includes('http://ipc.localhost'), connect);
}

// ===========================================================================
console.log('\n3. THE GAME MAY MINE — `script-src \'wasm-unsafe-eval\'`');
// ===========================================================================
//
// NOT ONE OF THE TWO THE REVIEW NAMED. Found by asking what else in the shipped
// bundle needs a CSP grant, and it is the most expensive one to lose.
//
// Posting on this network costs proof of work, and `shoalSend.ts:114` mines it
// with `hash-wasm`'s `argon2id` — a WebAssembly module the bundle instantiates
// at runtime (`WebAssembly.compile` and `WebAssembly.instantiate` are both
// present in `dist/assets/*.js`; grepped, not assumed). Chromium refuses both
// unless `script-src` carries `'wasm-unsafe-eval'`.
//
// So without it a player reaches the water, folds the world, draws every frame,
// sees everyone else — and every single write throws inside the miner. The game
// looks entirely healthy and the player is mute. That is worse than the two
// above, both of which at least fail early and totally.
{
  const script = directives(conf.app.security.csp ?? '').get('script-src') ?? [];
  check("script-src carries 'wasm-unsafe-eval' — without it every proof of work throws",
    script.includes("'wasm-unsafe-eval'"), script);
  check("...and 'self', for the bundle itself",
    script.includes("'self'"), script);
}

// ===========================================================================
console.log('\n4. THE SHIPPED BUNDLE IS TYPE-CHECKED — `beforeBuildCommand`');
// ===========================================================================
//
// `tsconfig.json`'s header makes this argument at length and nothing enforced
// it: `beforeBuildCommand` is THE ONLY path that produces a shippable artifact,
// and `npm run build` is `tsc --noEmit` twice and then `vite build`. Vite
// transforms TypeScript with esbuild, which STRIPS types without checking them.
//
// Change this to a bare `vite build` and the two-config wall — the one that
// keeps `src/lib/` free of DOM and wall-clock reads — stops being enforced on
// exactly the path where it matters most. Green `npm test`, shipped type error.
{
  check('build.beforeBuildCommand still runs the type-checking build, not a bare `vite build`',
    conf.build.beforeBuildCommand === 'npm run build', conf.build.beforeBuildCommand);
}

// ===========================================================================
console.log('\n5. THE PACKAGE CONTAINS A NODE — `bundle.resources`');
// ===========================================================================
//
// THIS ONE HAS ALREADY HAPPENED ONCE. `src-tauri/src/main.rs:14-17` records it:
// the glob lived in a Windows-only `tauri.windows.conf.json` overlay while
// `bundle.targets` was `"all"`, so a macOS or Linux build "produced a bundle
// with no node in it at all, and nothing said so". The fix was to move the glob
// to the BASE config — which is a fix that a single edit can silently undo.
//
// `build.rs`'s freshness gate does NOT cover this. It checks that the file
// `binaries/sw.exe` exists and matches a fresh build; it never reads the config
// and cannot tell whether the bundler was asked to include it.
{
  const res = conf.bundle.resources ?? [];
  check('bundle.resources globs the node sidecar into the package',
    res.some((r) => /(^|\/)binaries\/sw\*?$/.test(r)), res);
  // ...and in the BASE config, which is the whole point of the incident above.
  // Reading this file at all is what proves it: there is no platform overlay
  // here to have hidden it in.
  check('...and there is no platform overlay that could be hiding it instead',
    conf.bundle.resources !== undefined, Object.keys(conf.bundle));

  check('bundle.active is true, so `tauri build` still produces an installer',
    conf.bundle.active === true, conf.bundle.active);
  check('...for every platform this ships to',
    conf.bundle.targets === 'all', conf.bundle.targets);
}

// ===========================================================================
console.log('\n6. NON-DEGENERACY — these checks can fail');
// ===========================================================================
//
// Every assertion above is an equality against a file that was read once. If
// the read or the parse were broken, they would all pass against nothing at
// all — which is precisely the failure mode this whole file exists to prevent,
// and it would be embarrassing to reproduce it here.
{
  check('the config really was read and parsed (it has the keys being asserted on)',
    typeof conf.app === 'object' && typeof conf.build === 'object'
    && typeof conf.bundle === 'object' && typeof conf.app.security.csp === 'string',
    Object.keys(conf));

  // The CSP parser, against a directive list with known contents.
  const d = directives("default-src 'self'; connect-src ipc: http://127.0.0.1:*");
  check('NON-DEGENERACY: the CSP parser splits directives and sources',
    d.get('default-src')?.join(',') === "'self'"
    && d.get('connect-src')?.join(',') === 'ipc:,http://127.0.0.1:*',
    [...d.entries()]);
  check('NON-DEGENERACY: ...and reports a directive that is absent as absent',
    d.get('script-src') === undefined);

  // The resource glob matcher, against the shape that caused the incident
  // (nothing) and a near-miss that must not satisfy it.
  const globs = (r: string[]) => r.some((x) => /(^|\/)binaries\/sw\*?$/.test(x));
  check('NON-DEGENERACY: the sidecar glob matcher accepts the real glob',
    globs(['binaries/sw*']) && globs(['binaries/sw']));
  check('NON-DEGENERACY: ...and rejects an empty list and an unrelated resource',
    !globs([]) && !globs(['icons/*']) && !globs(['binaries/other']));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
