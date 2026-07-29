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
    // `TheEdge` imports its stylesheet — a real file, so that a shipped build
    // links it rather than building a `<style>` element the CSP will drop
    // (`shippedStyles.test.ts`). Nothing under jsdom can apply CSS, so it is
    // dropped from this bundle rather than emitted beside it: `empty` keeps the
    // import resolvable without leaving a stray `.css` in `node_modules/.cache`
    // that nothing loads.
    loader: { '.css': 'empty' },
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
/** The copy, imported rather than retyped — it has exactly one home, and this
 *  file compares the rendered DOM against it. */
import { EDGE_BODY } from './wayIn';

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
    // install's node holds the room's content BLOCK but not its BODY, because
    // content on this network arrives only when something asks. Task 4 watched
    // exactly this for 3 m 18 s on a real mainnet install. `shellConfig` is right
    // to return `null`; the window is wrong to stop asking, and wrong to wait
    // without asking.
    const late = await observe({ roomArrivesAfterAsks: 1, awaitWrite: true, settleMs: 200 });
    check('a node that has not got the room body yet is asked again, and the player gets in',
      reachedWater(late, room), late.submitted);
    check('...having really looked more than once',
      late.rpcCalls.filter((m) => m === 'get_content').length >= 2,
      late.rpcCalls.filter((m) => m === 'get_content').length);
    // THE DRIVER. Retrying a local-only read forever would never have produced
    // the body: `get_content` never fetches. Something has to ask the network,
    // and this is the check that says the window does.
    check('...and it ASKED THE NETWORK for it rather than only waiting',
      late.rpcCalls.includes('request_content'), late.rpcCalls);

    // And a plain transient failure, on the very first call the assembly makes
    // after the endpoint: one -32603 and the old code was done for good.
    const hiccup = await observe({ identityFailsTimes: 1, awaitWrite: true, settleMs: 200 });
    check('one failed identity read does not cost the player the game',
      reachedWater(hiccup, room), hiccup.submitted);

    // NON-DEGENERACY: the retry must not have quietly become a second, always-on
    // poll. A window that got in on the first ask looks for the room ONCE.
    const clean = await observe({ awaitWrite: true, settleMs: 200 });
    check('NON-DEGENERACY: a node that was ready is asked exactly once',
      clean.rpcCalls.filter((m) => m === 'get_content').length === 1,
      clean.rpcCalls.filter((m) => m === 'get_content').length);
    // ...and having found it locally, it must NOT have nudged the network. A
    // driver that fired unconditionally would be a broadcast on every launch.
    check('NON-DEGENERACY: a room that was already here is not asked for over the network',
      !clean.rpcCalls.includes('request_content'), clean.rpcCalls);

    // THE LISTING IS GONE. The space id is derived, so a fresh install no longer
    // depends on a name only a peer could supply — which on mainnet no peer ever
    // did. The harness still answers `list_spaces` correctly, so this is zero
    // because the window stopped asking, not because the fake stopped replying.
    check('the water is derived, not discovered — no listing is consulted at all',
      !clean.rpcCalls.includes('list_spaces'), clean.rpcCalls);
  }

  // =======================================================================
  console.log('\n6. A SWIMMER NOBODY HAS LET IN GETS A WHOLE GAME, and this client\n'
    + '   never asks anyone to change that');
  // =======================================================================
  //
  // THE RULING THIS SECTION EXISTS TO HOLD. Being let into the water is part of
  // being on the network; it is not something the game grants. A build that
  // claimed a standing offer on the player's behalf existed for two commits
  // (`passage.ts`, 725a8c06) and was removed. So there are two facts to keep
  // true at once, and they pull in opposite directions:
  //
  //   - a refused player must still get everything except being heard — real
  //     water, a real sea, a real fold, writes really attempted — because the
  //     shallows are a complete experience and not a waiting room; and
  //   - the window must not touch anyone's standing, not even to read it.
  //
  // `rpcCalls` is an ordered list of every method this window called, so the
  // second is a fact about the wire rather than about which module got deleted.
  {
    // (a) THE UNSPONSORED PLAYER, end to end. Every `submit_reply` comes back
    //     -32015 — the real code, from the real method — for the whole run.
    // THE SETTLE IS DERIVED, NOT PICKED. `shoalEmit.MAX_EMIT_GAP_MS` is 8 s and
    // is a ceiling, not an average: a sea that is still folding MUST publish
    // again within it. So a window held open past that and seen to write only
    // once has stopped, and one 9.5 s window is the cheapest interval in which
    // "it kept going" and "it gave up after the first refusal" look different.
    const refused = await observe({ writesRefused: true, awaitWrite: true, settleMs: 9_500 });
    check('a refused swimmer still reaches real water and still writes into it',
      reachedWater(refused, room), refused.submitted);
    // NOT "it wrote once". A window that gave up after the first refusal would
    // pass the check above and would be a game that stops. The sea publishes a
    // vector every few seconds forever, refused or not.
    check('...and KEEPS swimming — it is refused again and again, not once and out',
      refused.submitted.length >= 2, refused.submitted.length);
    check('...and the edge of the water is up, drawn over the live sea',
      refused.edgeAtEnd === true, refused.edgeAtEnd);
    check('...saying the one line this client owns for it, off the rendered DOM',
      refused.edgeLine === EDGE_BODY, refused.edgeLine);

    // (b) THE CLAIM FLOW IS GONE, and this is what says so. Not "the file is
    //     deleted" — a check about the filesystem proves nothing about the
    //     running window — but "the wire carries no such call", asked of the
    //     window that has the strongest possible reason to make one: it is
    //     being refused, right now, on every write.
    //
    //     The harness answers `default: ok({})`, so a re-added call would be
    //     ANSWERED and recorded rather than throwing; this check is the only
    //     thing standing between that and a silent return of the flow.
    const asked = refused.rpcCalls.filter((m) => m.includes('sponsor'));
    check('THE RULING: a refused window never asks about sponsorship at all',
      asked.length === 0, asked);

    // (c) NON-DEGENERACY for (a). The same window with a node that accepts
    //     shows no boundary — so the boundary in (a) is the refusal being
    //     recognised, not a surface that is always on screen.
    const accepted = await observe({ awaitWrite: true, settleMs: 1_500 });
    check('NON-DEGENERACY: a swimmer the water accepts is never shown a boundary',
      accepted.edgeAtEnd === false && accepted.edgeLine === null,
      { atEnd: accepted.edgeAtEnd, line: accepted.edgeLine });
    check('...and asks about sponsorship no more than the refused one did',
      accepted.rpcCalls.filter((m) => m.includes('sponsor')).length === 0,
      accepted.rpcCalls);
  }


  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
