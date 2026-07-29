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
/** The copy, imported rather than retyped — it has exactly one home, and this
 *  file compares the rendered DOM against it. */
import { EDGE_BODY, PASSAGE_BODY } from './wayIn';

const PASSAGE_BODY_LINES: string[] = Object.values(PASSAGE_BODY);

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
  console.log('\n6. THE WAY THROUGH runs once, and it runs BEFORE the first write');
  // =======================================================================
  //
  // Plan 4b Task 3b. The claim is made from the same place `setShell` is, and
  // the ORDER is the whole point: a vector mined at mainnet's Argon2id cost and
  // then refused for want of a voucher is work spent on nothing, and the
  // boundary the player is shown while the claim runs is only honest if no
  // write has already been refused underneath it.
  //
  // `rpcCalls` is an ordered list of every method this window called, so the
  // claim landing before the first `submit_reply` is a fact about the wire and
  // not about React state.
  {
    // (a) The first launch of a fresh install: nobody has vouched for this
    //     node's identity, and the game's sponsor has a standing offer open.
    //
    //     THE 1.2 s HOLD IS LOAD-BEARING, not padding. Without it the order
    //     check below passed even for a version that built the sea FIRST — a
    //     local node answers three sponsorship calls faster than one Argon2id
    //     mine finishes, so the claim landed first by accident. See
    //     `Scenario.sponsorshipDelayMs`.
    const granted = await observe({
      sponsorship: 'granted', sponsorshipDelayMs: 1_200, awaitWrite: true, settleMs: 200,
    });
    const claimAt = granted.rpcCalls.indexOf('claim_sponsorship_offer');
    const writeAt = granted.rpcCalls.indexOf('submit_reply');
    check('a newcomer nobody has vouched for claims the standing offer',
      claimAt >= 0, granted.rpcCalls);
    check('NON-DEGENERACY: and the window really did go on to write',
      writeAt >= 0 && reachedWater(granted, room), granted.submitted);
    check('THE ORDER: the claim is made BEFORE the first write, not after it',
      claimAt >= 0 && writeAt >= 0 && claimAt < writeAt, { claimAt, writeAt });
    check('...exactly once, however many writes follow',
      granted.rpcCalls.filter((m) => m === 'claim_sponsorship_offer').length === 1,
      granted.rpcCalls.filter((m) => m === 'claim_sponsorship_offer').length);

    // WHAT THE PLAYER ACTUALLY SEES, off the rendered DOM. Every other check in
    // this section is about the wire; this is the one that fails if `App.tsx`
    // never wires the helper's progress into the standing — a boundary saying
    // one sentence for a minute, which is the "sits there" this task exists to
    // remove. The lines are compared against `wayIn.PASSAGE_BODY` rather than
    // retyped, so the copy has exactly one home.
    check('the boundary was drawn while the claim ran',
      granted.edgeLines.length > 0, granted.edgeLines);
    check('...and it MOVED — more than one line was shown, in the beats\' own order',
      granted.edgeLines.length >= 2, granted.edgeLines);
    check('...each of them a line this client owns, never the helper\'s own words',
      granted.edgeLines.every((l) => PASSAGE_BODY_LINES.includes(l) || l === EDGE_BODY),
      granted.edgeLines);
    check('...ending on the beat that says someone is bringing them through',
      granted.edgeLines.includes(PASSAGE_BODY.turning), granted.edgeLines);
    check('...and the boundary is GONE once they are swimming',
      granted.edgeAtEnd === false, granted.edgeAtEnd);

    // (b) A returning player. The node reports a vouch on the first ask, so
    //     `ensureSponsored` returns before reporting a phase and nothing is
    //     claimed — which is what keeps a boundary from flashing at every
    //     launch. (This is also the default every scenario above ran under.)
    // The same 1.2 s hold, for the same reason: without it the flash a version
    // that raised the boundary UP FRONT would produce is shorter than one 10 ms
    // sample, and the check below passed for exactly that mutation.
    const already = await observe({
      sponsorship: 'already', sponsorshipDelayMs: 1_200, awaitWrite: true, settleMs: 200,
    });
    check('a swimmer the water already holds a vouch for claims nothing',
      !already.rpcCalls.includes('claim_sponsorship_offer'), already.rpcCalls);
    // THE FLICKER CHECK. `App.tsx` enters the passage from the helper's own
    // progress reports rather than setting it before the call, precisely so
    // that a returning player — every launch after the first — is never shown a
    // boundary for the length of one RPC.
    check('...and is never shown a boundary at all, not even for an instant',
      already.edgeLines.length === 0 && already.edgeAtEnd === false,
      { lines: already.edgeLines, atEnd: already.edgeAtEnd });
    check('...and it cost them exactly one question',
      already.rpcCalls.filter((m) => m === 'get_sponsorship_status').length === 1,
      already.rpcCalls.filter((m) => m === 'get_sponsorship_status').length);
    check('...and they are in the water', reachedWater(already, room), already.submitted);

    // (c) THE ONE THAT MUST NOT COST A PLAYER THE GAME. Nothing is open, so the
    //     claim fails. The window must still reach the water — the writes will
    //     be refused and `wayIn.ts` will say so, which is exactly the state this
    //     client shipped in before the claim existed. A failure here that
    //     stopped the window would have traded a partial game for none.
    const none = await observe({ sponsorship: 'none', awaitWrite: true, settleMs: 200 });
    check('with no offer open the window STILL reaches the water',
      reachedWater(none, room), none.submitted);
    check('...having looked for one and found nothing to claim',
      none.rpcCalls.includes('list_sponsorship_offers')
      && !none.rpcCalls.includes('claim_sponsorship_offer'), none.rpcCalls);
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
