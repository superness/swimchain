/**
 * THE WIRING — `App.tsx` itself, rendered and driven. Run:
 * npx tsx src/ui/App.test.ts
 *
 * ## WHY THIS FILE EXISTS
 *
 * It did not, and that was the hole a Major landed in. Every other check in
 * this project tests `shellConfig`, `seaChoice`, `chainSea` or the engine —
 * never the component that CHOOSES between them. The defect was in the
 * choosing: a shipped build spends up to 120 s on the offline sea while
 * `get_rpc_config` waits for the node to bind RPC, and a keypress inside that
 * window moved the scene off `'lively'`, which was the only state the promotion
 * into real water could fire from. The player was then locked out of the game
 * PERMANENTLY, with the toggle that might have rescued them disabled by the
 * very configuration that had arrived. Found by a human pressing `2`.
 *
 * SO THE SCENARIOS BELOW ARE SLOW ON PURPOSE. A suite that only ever exercised
 * a node that answers instantly would reproduce the exact blind spot that hid
 * this: section 2 is the fast path, section 3 is the same thing with a
 * deliberately slow shell and an impatient player, and the difference between
 * the two is the whole point.
 *
 * ## THE COMPONENT IS COMPILED AS A SHIPPED BUILD COMPILES IT
 *
 * `App.tsx` reads `import.meta.env.DEV`, which under `tsx` is a `TypeError` on
 * the module's first line — Node's `import.meta` has no `env` and nothing
 * outside a module can add one. So `App.harness.tsx` is bundled here with
 * esbuild and `define: { 'import.meta.env.DEV': 'false' }`, the same
 * substitution Vite makes for production, by the same tool. What is driven
 * below is therefore the RELEASE shape of the component: `chainParams()` folded
 * to `null`, the dev path folded away, exactly as a player receives it.
 *
 * ## WHAT IS OBSERVED
 *
 * `submit_reply` on the wire, authored by the node's own key. A window in real
 * water publishes its opening vector on the first frame after the sea is built.
 * Reading React state would prove a variable was set; a reply proves a player
 * is in the water. `App.harness.tsx` documents the rest of the boundary.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Observation, Scenario } from './App.harness';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); }
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** Inside `node_modules/` so `react`, `react-dom` and `jsdom` resolve from the
 *  bundle exactly as they do from source, and so nothing lands in the tree. */
const OUT = resolve(HERE, '../../node_modules/.cache/shoal-app-harness.mjs');

/**
 * Compile the harness the way a release build compiles the component.
 *
 * `define` is the load-bearing option and it is the ONE substitution made:
 * `import.meta.env.DEV` becomes the literal `false`. React, react-dom and jsdom
 * stay external so the bundle uses the same installed copies everything else
 * does.
 */
async function buildHarness(dev: boolean): Promise<{ observe: (s: Scenario) => Promise<Observation> }> {
  mkdirSync(dirname(OUT), { recursive: true });
  await build({
    entryPoints: [resolve(HERE, 'App.harness.tsx')],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    jsx: 'automatic',
    define: { 'import.meta.env.DEV': dev ? 'true' : 'false' },
    external: ['react', 'react-dom', 'react-dom/client', 'jsdom'],
    logLevel: 'silent',
  });
  // Cache-busted so a second build in the same process is actually loaded.
  return import(`${pathToFileURL(OUT).href}?v=${Date.now()}`) as Promise<{
    observe: (s: Scenario) => Promise<Observation>;
  }>;
}

/** The room every window in this file joins, derived the way the node derives
 *  it — `roomContentId` is not reachable from here without importing the module
 *  under test's neighbour, so it is imported directly. */
import { roomContentId } from './shellConfig';

const NODE_PUBKEY = 'c7'.repeat(32);

/** Did this window reach real water? A reply authored by the node, into the
 *  room the shell resolved, is the only evidence that counts. */
function reachedWater(o: Observation, room: string): boolean {
  return o.submitted.some((w) => w.author === NODE_PUBKEY && w.parent === room);
}

async function main(): Promise<void> {
  const room = await roomContentId();
  const { observe } = await buildHarness(false);

  // =======================================================================
  console.log('\n1. the release shape of the component is what is being driven');
  // =======================================================================
  //
  // A browser tab: no `window.__TAURI__` at all. It must never ask a shell that
  // is not there, never reach a node, and never write. If this passed for the
  // wrong reason — a component that silently threw on mount, say — every
  // "reached water" check below would be meaningless, so it is checked first
  // and section 2 is its positive control.
  {
    const o = await observe({ settleMs: 1_200, noShell: true });
    // NOT `!o.askedShell`, which was a tautology: `askedShell` is only settable
    // inside the block that installs a shell, so it could not fail. The fake
    // `fetch` is installed for EVERY scenario, so this one can — and the thing
    // it forbids is real, and named in `shellConfig`'s header: an endpoint
    // arriving from anywhere but the shell (`resolveAuth`'s postMessage
    // envelope, an env override) would carry this window's cookie to whatever
    // it pointed at.
    check('a browser tab never reaches a node at all', o.rpcCalls.length === 0, o.rpcCalls);
    check('...opens no live socket', o.sockets === 0, o.sockets);
    check('...and writes nothing', o.submitted.length === 0, o.submitted);
  }

  // =======================================================================
  console.log('\n2. a warm start reaches real water (the control)');
  // =======================================================================
  //
  // The node answers immediately. This is the only shape the suite exercised
  // before, and it is why the Major went unseen — it passes either way.
  {
    const o = await observe({ awaitWrite: true, settleMs: 200 });
    check('the window asks the shell', o.askedShell, o);
    check('POSITIVE CONTROL: a warm start reaches real water', reachedWater(o, room), o.submitted);
    check('...through exactly one live socket', o.sockets === 1, o.sockets);
  }

  // =======================================================================
  console.log('\n3. THE MAJOR: a cold start, and a player who presses a key');
  // =======================================================================
  //
  // `coldStart` holds `get_rpc_config` open — the real one polls the node's
  // handoff files for up to 120 s on a first launch (src-tauri/src/main.rs
  // :172-200) — and the key is pressed strictly inside that window: after the
  // component has asked, before the shell answers. The window is drawing the
  // offline sea with no configuration behind it at that instant, by
  // construction rather than by timing.
  //
  // Hand-derived expectation, stated before the run: `2` selects the lively
  // demo sea, which is a legitimate thing to be looking at while there is no
  // water — the default is now the shallows (plan 4b Task 3), so this really is
  // a scene change and not a React bail-out. When the configuration lands a
  // moment later the window must join the water ANYWAY. Before the fix it did
  // not, and never would again.
  {
    const cold = await observe({ coldStart: true, awaitWrite: true, settleMs: 200 });
    check('a cold start on its own still reaches real water', reachedWater(cold, room), cold.submitted);

    const pressed2 = await observe({
      coldStart: true, press: { key: '2', when: 'duringColdStart' }, awaitWrite: true, settleMs: 200,
    });
    check('pressing 2 during the cold start does NOT lock the player out',
      reachedWater(pressed2, room), pressed2.submitted);

    // THERE IS NO `1` CHECK HERE, AND ITS ABSENCE IS DELIBERATE.
    //
    // There was one, and it was vacuous: deleting the `'1'` key branch outright
    // left it passing. `setScene(<the default>)` from the default is a React
    // bail-out, so with no `?at=` the press changed nothing and the check was a
    // duplicate of the control two lines above. (The default is the shallows
    // now rather than `'lively'`, and `1` still names it, so the argument is
    // unchanged.)
    //
    // It cannot be repaired, only replaced or removed, and this is worth
    // writing down because the obvious repair looks like it works. Give the
    // window `?at=` so the scene really does change: under the OLD scene-gated
    // promotion, pressing `1` lands on `'lively'` — the one state the promotion
    // could still fire from — so the window reaches water and the check passes
    // anyway. A "reaches water" observable structurally cannot discriminate the
    // `'1'` branch, because after the fix nothing about the scene can stop a
    // window reaching water. `2` is the discriminating key and it is checked
    // above; `?at=` covers a scene that starts elsewhere.

    // THE SECOND DOOR into the same state, and the reason gating `?at=` would
    // have been the wrong fix: it closes one door rather than removing the room
    // behind both. `?at=` is not DEV-gated and does not need to be — see the
    // comment on `devParam`.
    const at = await observe({ coldStart: true, search: '?at=1000', awaitWrite: true, settleMs: 200 });
    check('nor does ?at=, which selects the same sea from the address bar',
      reachedWater(at, room), at.submitted);
  }

  // =======================================================================
  console.log('\n4. once in the water, a keypress cannot take it away');
  // =======================================================================
  //
  // The other half of the same rule, and the one that was already right: a
  // stray keypress must not tear down a live sea and rebuild it. Measured by
  // socket count, because a rebuilt sea opens a second one — a check on scene
  // state would pass for a component that changed the variable and re-mounted
  // anyway.
  //
  // IT HAS TO BE `2`, AND THE FIRST VERSION OF THIS CHECK USED `1` AND WAS
  // VACUOUS. With no `?at=` the scene is already the default, so pressing the
  // key that names the default is a React no-op: the effect never re-runs and
  // the socket count stays 1 whether the guard is there or not. Breaking `inRealWater` on
  // purpose left this group entirely green, which is how it was caught. `2`
  // asks for a DIFFERENT scene, so an unguarded handler really does rebuild.
  {
    const o = await observe({
      awaitWrite: true, press: { key: '2', when: 'afterFirstWrite' }, settleMs: 600,
    });
    check('pressing 2 after joining leaves the sea alone', o.sockets === 1, o.sockets);
    check('...and the window is still in the water it joined', reachedWater(o, room), o.submitted);
  }

  // =======================================================================
  console.log('\n5. a node that is not ready yet is not a node that never will be');
  // =======================================================================
  //
  // `shellConfig` answers `null` for six reasons and five of them are the
  // ordinary condition of a node that has just started. Asking once made every
  // one of them PERMANENT — the same outcome, and the same silence, as the
  // lockout in section 3, reached from a different direction.
  //
  // Both scenarios below have a node that is up and healthy the whole time.
  // Neither would ever reach water without a retry.
  {
    // The commonest case by far, and it is not a failure at all: a fresh
    // install has never heard of this water and learns it from a peer minutes
    // later. `shellConfig` is right to return `null`; the window is wrong to
    // stop asking.
    const late = await observe({ waterAppearsAfterListings: 1, awaitWrite: true, settleMs: 200 });
    check('a node that has not synced the water yet is asked again, and the player gets in',
      reachedWater(late, room), late.submitted);
    check('...having really looked more than once',
      late.rpcCalls.filter((m) => m === 'list_spaces').length >= 2,
      late.rpcCalls.filter((m) => m === 'list_spaces').length);

    // And a plain transient failure, on the very first call the assembly makes
    // after the endpoint: one -32603 and the old code was done for good.
    const hiccup = await observe({ identityFailsTimes: 1, awaitWrite: true, settleMs: 200 });
    check('one failed identity read does not cost the player the game',
      reachedWater(hiccup, room), hiccup.submitted);

    // NON-DEGENERACY: the retry must not have quietly become a second, always-on
    // poll. A window that got in on the first ask looks at the listing ONCE.
    const clean = await observe({ awaitWrite: true, settleMs: 200 });
    check('NON-DEGENERACY: a node that was ready is asked exactly once',
      clean.rpcCalls.filter((m) => m === 'list_spaces').length === 1,
      clean.rpcCalls.filter((m) => m === 'list_spaces').length);
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
